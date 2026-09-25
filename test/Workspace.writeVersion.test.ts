import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "../src/Workspace.js";
import { createFixture, recordExecSync } from "./support/fixtureHarness.js";

vi.mock("node:child_process");

describe("Workspace version writes", () => {
  beforeEach(() => {
    recordExecSync({ branch: "main" });
  });

  describe("writeVersion()", () => {
    it("should write the version into the root and every workspace package, private or not", () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        packages: {
          "packages/public": { name: "public", version: "1.2.0-SNAPSHOT" },
          "packages/private": {
            name: "private",
            version: "1.2.0-SNAPSHOT",
            private: true,
          },
        },
      });
      const workspace = Workspace.forCwd();

      workspace.writeVersion("1.2.0");

      expect(fixture.readJson().version).toBe("1.2.0");
      expect(fixture.readJson("packages/public").version).toBe("1.2.0");
      expect(fixture.readJson("packages/private").version).toBe("1.2.0");
      expect(workspace.getRoot().getVersion()).toBe("1.2.0");
      expect(workspace.getPackages().map((p) => p.getVersion())).toEqual([
        "1.2.0",
        "1.2.0",
        "1.2.0",
      ]);
    });

    it("should heal drifted and missing package versions", () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        packages: {
          "packages/drifted": { name: "drifted", version: "0.0.0" },
          "packages/unversioned": { name: "unversioned", private: true },
        },
      });

      Workspace.forCwd().writeVersion("1.2.0");

      expect(fixture.readJson("packages/drifted").version).toBe("1.2.0");
      expect(fixture.readJson("packages/unversioned").version).toBe("1.2.0");
    });

    it("should keep all other keys and their order, use 2 spaces and end with a newline", () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        files: {
          // not produced by JSON.stringify: 4-space indentation, no newline
          "packages/a/package.json":
            '{\n    "name": "a",\n    "version": "0.0.0",\n    "dependencies": {\n        "b": "workspace:*"\n    },\n    "custom": [1, 2]\n}',
        },
      });

      Workspace.forCwd().writeVersion("1.2.0");

      expect(fixture.readFile("packages/a/package.json")).toBe(
        `${JSON.stringify(
          {
            name: "a",
            version: "1.2.0",
            dependencies: { b: "workspace:*" },
            custom: [1, 2],
          },
          null,
          2,
        )}\n`,
      );
      expect(fixture.readFile("package.json")).toBe(
        `${JSON.stringify(
          { name: "root", version: "1.2.0", private: true },
          null,
          2,
        )}\n`,
      );
    });

    it("should write on top of the current file content, not the content read at creation", () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        packages: { "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" } },
      });
      const workspace = Workspace.forCwd();
      // e.g. rewritten by format:package-json after the workspace was created
      writeFileSync(
        fixture.path("packages/a/package.json"),
        JSON.stringify({
          name: "a",
          version: "1.2.0-SNAPSHOT",
          description: "added later",
        }),
      );

      workspace.writeVersion("1.2.0");

      expect(fixture.readJson("packages/a")).toEqual({
        name: "a",
        version: "1.2.0",
        description: "added later",
      });
    });

    it("should only write the root package.json in a single-package repo", () => {
      const fixture = createFixture({
        root: { name: "single", version: "1.2.0-SNAPSHOT" },
        packages: { "packages/a": { name: "a", version: "0.0.0" } },
      });

      Workspace.forCwd().writeVersion("1.2.0");

      expect(fixture.readFile("package.json")).toBe(
        `${JSON.stringify({ name: "single", version: "1.2.0" }, null, 2)}\n`,
      );
      expect(fixture.readJson("packages/a").version).toBe("0.0.0");
    });
  });

  describe("restoreFiles()", () => {
    it("should report the restored version for the root and every workspace package", () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        packages: {
          "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" },
          "packages/b": { name: "b", version: "1.2.0-SNAPSHOT" },
        },
      });
      const workspace = Workspace.forCwd();
      const files = workspace.captureFiles();
      workspace.writeVersion("9.9.9");

      workspace.restoreFiles(files);

      expect(fixture.readJson().version).toBe("1.2.0-SNAPSHOT");
      expect(fixture.readJson("packages/a").version).toBe("1.2.0-SNAPSHOT");
      expect(fixture.readJson("packages/b").version).toBe("1.2.0-SNAPSHOT");
      expect(workspace.getRoot().getVersion()).toBe("1.2.0-SNAPSHOT");
      expect(workspace.getPackages().map((p) => p.getVersion())).toEqual([
        "1.2.0-SNAPSHOT",
        "1.2.0-SNAPSHOT",
        "1.2.0-SNAPSHOT",
      ]);
    });
  });

  describe("getPackages()", () => {
    it("should show the root package as re-read by a refresh of the root Project", () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        packages: { "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" } },
      });
      const workspace = Workspace.forCwd();
      // e.g. js-ies-module refreshes the root Project after changing the file
      writeFileSync(
        fixture.path("package.json"),
        JSON.stringify({
          name: "renamed-root",
          version: "1.3.0-SNAPSHOT",
          dependencies: { a: "workspace:*" },
        }),
      );

      workspace.getRoot().refresh();

      const [root] = workspace.getPackages();
      expect(root.isRoot()).toBe(true);
      expect(root.getName()).toBe("renamed-root");
      expect(root.getVersion()).toBe("1.3.0-SNAPSHOT");
      expect(root.isPrivate()).toBe(false);
      expect(root.getDependencies("dependencies")).toEqual({
        a: "workspace:*",
      });
    });
  });

  describe("getPackageJsonPaths()", () => {
    it("should list the root first and every workspace package relative to the root", () => {
      createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*", "apps/**"] },
        packages: {
          "packages/b": { name: "b", version: "1.2.0-SNAPSHOT" },
          "packages/a": { name: "a", version: "1.2.0-SNAPSHOT", private: true },
          "apps/web/client": { name: "client", version: "0.0.0" },
        },
      });

      expect(Workspace.forCwd().getPackageJsonPaths()).toEqual([
        "package.json",
        "apps/web/client/package.json",
        "packages/a/package.json",
        "packages/b/package.json",
      ]);
    });

    it("should only list the root package.json in a single-package repo", () => {
      createFixture({ root: { name: "single", version: "1.2.0-SNAPSHOT" } });

      expect(Workspace.forCwd().getPackageJsonPaths()).toEqual([
        "package.json",
      ]);
    });
  });
});
