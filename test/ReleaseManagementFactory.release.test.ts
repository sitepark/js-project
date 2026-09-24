import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildProvider } from "../src/BuildProvider.js";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import { Project } from "../src/Project.js";
import { ReleaseManagementFactory } from "../src/ReleaseManagementFactory.js";
import { createFixture, recordExecSync } from "./support/fixtureHarness.js";

vi.mock("node:child_process");

function releaseManagementForCwd() {
  const project = Project.forCwd();
  return ReleaseManagementFactory.forCwd(
    project,
    new BuildProvider(project, "pnpm"),
    new NodePublisherProvider(project, "pnpm"),
  );
}

describe("ReleaseManagementFactory release()", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should commit, tag, write the next SNAPSHOT and push with a private root", async () => {
    const fixture = createFixture({
      root: {
        name: "root",
        version: "1.2.0-SNAPSHOT",
        private: true,
        scripts: { "format:package-json": "prettier --write package.json" },
      },
    });
    const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
    const versionAtCommit: string[] = [];
    exec.respond(/^git add /, () => {
      versionAtCommit.push(fixture.readJson().version ?? "");
      return "";
    });

    const version = await releaseManagementForCwd().release();

    expect(version).toBe("1.2.0");
    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([]);
    expect(exec.commandsMatching(/^git (add|tag -a|push)/)).toEqual([
      'git add package.json && git commit -m "ci(release): Release 1.2.0"',
      'git tag -a 1.2.0 -m "Release Version 1.2.0"',
      'git add package.json && git commit -m "ci(release): Updating package.json set version to 1.3.0-SNAPSHOT"',
      "git push -u origin main",
      "git push --tags",
    ]);
    expect(exec.commandsMatching("pnpm run format:package-json")).toHaveLength(
      1,
    );
    expect(versionAtCommit).toEqual(["1.2.0", "1.3.0-SNAPSHOT"]);
    expect(fixture.readJson().version).toBe("1.3.0-SNAPSHOT");
  });
});
