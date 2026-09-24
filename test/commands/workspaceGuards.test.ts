import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanCommand } from "../../src/commands/clean.js";
import { publishCommand } from "../../src/commands/publish.js";
import { releaseCommand } from "../../src/commands/release.js";
import { releaseVersionCommand } from "../../src/commands/releaseVersion.js";
import { startHotfixCommand } from "../../src/commands/startHotfix.js";
import { verifyReleaseCommand } from "../../src/commands/verifyRelease.js";
import { versionCommand } from "../../src/commands/version.js";
import { createFixture, recordExecSync } from "../support/fixtureHarness.js";

vi.mock("node:child_process");

const monorepo = {
  root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
  workspace: { packages: ["packages/*"] },
  packages: {
    "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" },
  },
};

const commands: [string, () => unknown][] = [
  ["version", () => versionCommand()],
  ["releaseVersion", () => releaseVersionCommand()],
  ["clean", () => cleanCommand()],
  ["verifyRelease", () => verifyReleaseCommand("pnpm")],
  ["startHotfix", () => startHotfixCommand("pnpm", "1.1.0")],
  ["release", () => releaseCommand("pnpm")],
  ["publish", () => publishCommand("pnpm")],
];

describe("commands in a workspace", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(commands)(
    "%s should fail when run from a package directory",
    async (_name, command) => {
      const fixture = createFixture(monorepo);
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
      process.chdir(fixture.path("packages/a"));

      await expect(async () => command()).rejects.toThrow(
        "js-project must be run from the workspace root",
      );
      expect(
        exec.commands.filter((c) => !c.startsWith("git rev-parse")),
      ).toEqual([]);
    },
  );

  it.each([
    ["verifyRelease", () => verifyReleaseCommand("npm")],
    ["startHotfix", () => startHotfixCommand("yarn", "1.1.0")],
    ["release", () => releaseCommand("npm")],
    ["publish", () => publishCommand("yarn")],
  ] as [string, () => unknown][])(
    "%s should fail with npm or yarn",
    async (_name, command) => {
      const fixture = createFixture(monorepo);
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });

      await expect(async () => command()).rejects.toThrow(
        "Monorepo mode currently requires pnpm",
      );
      expect(
        exec.commandsMatching(/\bpublish\b|^git (commit|tag|push)/),
      ).toEqual([]);
      expect(fixture.readJson().version).toBe("1.2.0-SNAPSHOT");
    },
  );

  it("publish should work with pnpm", async () => {
    createFixture(monorepo);
    recordExecSync({ branch: "main", tags: ["1.1.0"] });

    await expect(publishCommand("pnpm")).resolves.toBeUndefined();
  });

  it("version should print the root version", () => {
    createFixture(monorepo);
    recordExecSync({ branch: "main" });

    versionCommand();

    expect(console.log).toHaveBeenCalledWith("1.2.0-SNAPSHOT");
  });
});

describe("commands in a single-package repo", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publish should still work with npm", async () => {
    createFixture({
      root: { name: "lib", version: "1.2.0" },
      workspace: "allowBuilds:\n  esbuild: true\n",
    });
    const exec = recordExecSync({ branch: "main", tags: ["1.2.0"] });

    await publishCommand("npm");

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
      "npm publish --ignore-scripts --non-interactive --tag latest",
    ]);
  });

  it("version should print the version", () => {
    createFixture({ root: { name: "lib", version: "2.0.0-SNAPSHOT" } });
    recordExecSync({ branch: "main" });

    versionCommand();

    expect(console.log).toHaveBeenCalledWith("2.0.0-SNAPSHOT");
  });
});
