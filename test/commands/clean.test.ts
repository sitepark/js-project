import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanCommand } from "../../src/commands/clean.js";
import { createFixture, recordExecSync } from "../support/fixtureHarness.js";

vi.mock("node:child_process");

describe("cleanCommand", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should delete build/ of the root and of every workspace package", async () => {
    const fixture = createFixture({
      root: { name: "root", version: "1.0.0-SNAPSHOT", private: true },
      workspace: { packages: ["packages/*"] },
      packages: {
        "packages/a": { name: "a", version: "1.0.0-SNAPSHOT" },
        "packages/b": { name: "b", version: "1.0.0-SNAPSHOT", private: true },
      },
      files: {
        "build/root.txt": "root",
        "packages/a/build/a.txt": "a",
        "packages/b/build/b.txt": "b",
      },
    });
    recordExecSync({ branch: "main" });

    await cleanCommand();

    expect(existsSync(fixture.path("build"))).toBe(false);
    expect(existsSync(fixture.path("packages/a/build"))).toBe(false);
    expect(existsSync(fixture.path("packages/b/build"))).toBe(false);
    expect(existsSync(fixture.path("packages/a/package.json"))).toBe(true);
    expect(vi.mocked(console.log).mock.calls).toEqual([
      [`Deleted: ${fixture.path("build")}`],
      [`Deleted: ${fixture.path("packages/a/build")}`],
      [`Deleted: ${fixture.path("packages/b/build")}`],
    ]);
  });

  it("should log a failed deletion and still clean the other packages", async () => {
    const fixture = createFixture({
      root: { name: "root", version: "1.0.0-SNAPSHOT", private: true },
      workspace: { packages: ["packages/*"] },
      packages: {
        "packages/a": { name: "a", version: "1.0.0-SNAPSHOT" },
        "packages/b": { name: "b", version: "1.0.0-SNAPSHOT" },
      },
      files: {
        "build/root.txt": "root",
        "packages/a/build/a.txt": "a",
        "packages/b/build/b.txt": "b",
      },
    });
    recordExecSync({ branch: "main" });
    const error = new Error("Permission denied");
    const rm = fs.rm;
    vi.spyOn(fs, "rm").mockImplementation((target, options) =>
      target === fixture.path("packages/a/build")
        ? Promise.reject(error)
        : rm(target, options),
    );

    await expect(cleanCommand()).resolves.toBeUndefined();

    expect(existsSync(fixture.path("build"))).toBe(false);
    expect(existsSync(fixture.path("packages/a/build"))).toBe(true);
    expect(existsSync(fixture.path("packages/b/build"))).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      `Failed to delete ${fixture.path("packages/a/build")}:`,
      error,
    );
    expect(vi.mocked(console.log).mock.calls).toEqual([
      [`Deleted: ${fixture.path("build")}`],
      [`Deleted: ${fixture.path("packages/b/build")}`],
    ]);
  });

  it("should not fail for packages without a build directory", async () => {
    const fixture = createFixture({
      root: { name: "root", version: "1.0.0-SNAPSHOT", private: true },
      workspace: { packages: ["packages/*"] },
      packages: {
        "packages/a": { name: "a", version: "1.0.0-SNAPSHOT" },
        "packages/b": { name: "b", version: "1.0.0-SNAPSHOT" },
      },
      files: { "packages/b/build/b.txt": "b" },
    });
    recordExecSync({ branch: "main" });

    await cleanCommand();

    expect(existsSync(fixture.path("packages/b/build"))).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("should delete only build/ of the root in a single-package repo", async () => {
    const fixture = createFixture({
      root: { name: "lib", version: "1.0.0-SNAPSHOT" },
      files: {
        "build/lib.txt": "lib",
        "packages/a/package.json": '{ "name": "a" }\n',
        "packages/a/build/a.txt": "a",
      },
    });
    recordExecSync({ branch: "main" });

    await cleanCommand();

    expect(existsSync(fixture.path("build"))).toBe(false);
    expect(existsSync(fixture.path("packages/a/build/a.txt"))).toBe(true);
    expect(vi.mocked(console.log).mock.calls).toEqual([
      [`Deleted: ${fixture.path("build")}`],
    ]);
  });

  it("should clean a workspace declared by the workspaces field", async () => {
    const fixture = createFixture({
      root: {
        name: "root",
        version: "1.0.0-SNAPSHOT",
        private: true,
        workspaces: ["packages/*"],
      },
      packages: { "packages/a": { name: "a", version: "1.0.0-SNAPSHOT" } },
      files: {
        "build/root.txt": "root",
        "packages/a/build/a.txt": "a",
      },
    });
    recordExecSync({ branch: "main" });

    await cleanCommand();

    expect(existsSync(fixture.path("build"))).toBe(false);
    expect(existsSync(fixture.path("packages/a/build"))).toBe(false);
  });
});
