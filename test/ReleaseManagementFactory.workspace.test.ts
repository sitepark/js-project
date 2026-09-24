import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildProvider } from "../src/BuildProvider.js";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import type { PackageJson } from "../src/PackageJson.js";
import { Project } from "../src/Project.js";
import type { Publisher } from "../src/Publisher.js";
import { ReleaseManagementFactory } from "../src/ReleaseManagementFactory.js";
import {
  createFixture,
  type Fixture,
  type FixtureDefinition,
  recordExecSync,
} from "./support/fixtureHarness.js";

vi.mock("node:child_process");

const PACKAGE_DIRS = ["packages/a", "packages/b", "packages/c"];
const ALL_PACKAGE_JSONS = [
  "package.json",
  ...PACKAGE_DIRS.map((dir) => `${dir}/package.json`),
];

const scripts = {
  "format:package-json":
    "prettier --write package.json packages/*/package.json",
  test: "vitest run",
  build: "vite build",
};

/**
 * A pnpm workspace with a private root, a public package, a private package
 * whose version drifted and a public package depending on a sibling.
 */
function workspaceFixture(rootVersion: string): FixtureDefinition {
  return {
    root: { name: "root", version: rootVersion, private: true, scripts },
    workspace: { packages: ["packages/*"] },
    packages: {
      "packages/a": { name: "@scope/a", version: rootVersion },
      "packages/b": { name: "@scope/b", version: "0.0.0", private: true },
      "packages/c": {
        name: "@scope/c",
        version: rootVersion,
        dependencies: { "@scope/a": "workspace:*" },
      },
    },
  };
}

/** version of every package.json, root first */
function versions(fixture: Fixture): string[] {
  return ["", ...PACKAGE_DIRS].map(
    (dir) => fixture.readJson(dir || "package.json").version ?? "",
  );
}

function releaseManagementForCwd(publisher: Publisher = noopPublisher()) {
  const project = Project.forCwd();
  return ReleaseManagementFactory.forCwd(
    project,
    new BuildProvider(project, "pnpm"),
    publisher,
  );
}

function noopPublisher(onPublish: () => void = () => {}): Publisher {
  return {
    publish: async () => onPublish(),
    cleanup: async () => {},
  };
}

function writePackageJson(fixture: Fixture, dir: string, pkg: PackageJson) {
  const file = fixture.path(path.join(dir, "package.json"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pkg));
}

describe("ReleaseManagementFactory in a pnpm workspace", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("release()", () => {
    it("should write and commit the release version and the next SNAPSHOT into every package.json", async () => {
      const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
      const versionsAtCommit: string[][] = [];
      const versionsAtPublish: string[][] = [];
      exec.respond(/^git add /, () => {
        versionsAtCommit.push(versions(fixture));
        return "";
      });

      const version = await releaseManagementForCwd(
        noopPublisher(() => versionsAtPublish.push(versions(fixture))),
      ).release();

      const staged = ALL_PACKAGE_JSONS.join(" ");
      expect(version).toBe("1.2.0");
      expect(exec.commandsMatching(/^git (add|tag -a|push)/)).toEqual([
        `git add ${staged} && git commit -m "ci(release): Release 1.2.0"`,
        'git tag -a 1.2.0 -m "Release Version 1.2.0"',
        `git add ${staged} && git commit -m "ci(release): Updating package.json set version to 1.3.0-SNAPSHOT"`,
        "git push -u origin main",
        "git push --tags",
      ]);
      expect(versionsAtCommit).toEqual([
        ["1.2.0", "1.2.0", "1.2.0", "1.2.0"],
        [
          "1.3.0-SNAPSHOT",
          "1.3.0-SNAPSHOT",
          "1.3.0-SNAPSHOT",
          "1.3.0-SNAPSHOT",
        ],
      ]);
      expect(versionsAtPublish).toEqual([["1.2.0", "1.2.0", "1.2.0", "1.2.0"]]);
      expect(versions(fixture)).toEqual([
        "1.3.0-SNAPSHOT",
        "1.3.0-SNAPSHOT",
        "1.3.0-SNAPSHOT",
        "1.3.0-SNAPSHOT",
      ]);
    });

    it("should run format:package-json once, at the root, after the release version is written", async () => {
      const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
      const versionsAtFormat: string[][] = [];
      exec.respond("pnpm run format:package-json", () => {
        versionsAtFormat.push(versions(fixture));
        return "";
      });

      await releaseManagementForCwd().release();

      expect(
        exec.calls.filter((c) => c.command === "pnpm run format:package-json"),
      ).toEqual([
        { command: "pnpm run format:package-json", cwd: process.cwd() },
      ]);
      expect(process.cwd()).toBe(fixture.root);
      expect(versionsAtFormat).toEqual([["1.2.0", "1.2.0", "1.2.0", "1.2.0"]]);
    });

    it("should keep the other keys of every package.json and end each file with a newline", async () => {
      const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
      recordExecSync({ branch: "main", tags: ["1.1.0"] });

      await releaseManagementForCwd().release();

      for (const file of ALL_PACKAGE_JSONS) {
        expect(fixture.readFile(file)).toMatch(/\}\n$/);
      }
      expect(fixture.readJson("packages/c")).toEqual({
        name: "@scope/c",
        version: "1.3.0-SNAPSHOT",
        dependencies: { "@scope/a": "workspace:*" },
      });
      expect(fixture.readJson("packages/b")).toEqual({
        name: "@scope/b",
        version: "1.3.0-SNAPSHOT",
        private: true,
      });
    });

    it("should continue with the next patch SNAPSHOT on a hotfix branch", async () => {
      const fixture = createFixture(workspaceFixture("1.2.1-SNAPSHOT"));
      const exec = recordExecSync({
        branch: "hotfix/1.2.x",
        tags: ["1.2.0"],
      });

      await expect(releaseManagementForCwd().release()).resolves.toBe("1.2.1");

      expect(exec.commandsMatching(/^git tag -a/)).toEqual([
        'git tag -a 1.2.1 -m "Release Version 1.2.1"',
      ]);
      expect(versions(fixture)).toEqual([
        "1.2.2-SNAPSHOT",
        "1.2.2-SNAPSHOT",
        "1.2.2-SNAPSHOT",
        "1.2.2-SNAPSHOT",
      ]);
    });

    it("should refuse a release from a feature branch without touching any package.json", async () => {
      const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
      const exec = recordExecSync({ branch: "feature/foo" });

      await expect(releaseManagementForCwd().release()).rejects.toThrow(
        "No release can be created with branch 'feature/foo'.",
      );

      expect(exec.commandsMatching(/^git (add|tag -a|push)/)).toEqual([]);
      expect(versions(fixture)).toEqual([
        "1.2.0-SNAPSHOT",
        "1.2.0-SNAPSHOT",
        "0.0.0",
        "1.2.0-SNAPSHOT",
      ]);
    });

    it("should refuse a release when the root is not a SNAPSHOT", async () => {
      const fixture = createFixture(workspaceFixture("1.2.0"));
      const exec = recordExecSync({ branch: "main" });

      await expect(releaseManagementForCwd().release()).rejects.toThrow(
        "The current version is not a SNAPSHOT version: 1.2.0",
      );

      expect(exec.commandsMatching(/^git (add|tag -a|push)/)).toEqual([]);
      expect(fixture.readJson("packages/b").version).toBe("0.0.0");
    });

    it("should refuse a release with uncommitted changes without touching any package.json", async () => {
      const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
      const exec = recordExecSync({
        branch: "main",
        status: " M packages/a/package.json",
      });

      await expect(releaseManagementForCwd().release()).rejects.toThrow(
        "The release can only be created when all changes are committed.",
      );

      expect(exec.commandsMatching(/^git (add|tag -a|push)/)).toEqual([]);
      expect(fixture.readJson("packages/b").version).toBe("0.0.0");
    });
  });

  describe("startHotfix()", () => {
    it("should write the hotfix SNAPSHOT into every package.json of the base tag and commit them", () => {
      const fixture = createFixture(workspaceFixture("1.2.0"));
      const exec = recordExecSync({ branch: "main", tags: ["1.2.0", "1.2.1"] });
      // Checking out the base tag 1.2.1 changes the package.json files and
      // adds a package that did not exist in the checked out 1.2.0.
      exec.respond(/^git checkout -B /, () => {
        writePackageJson(fixture, "", {
          name: "root",
          version: "1.2.1",
          private: true,
          scripts,
        });
        writePackageJson(fixture, "packages/a", {
          name: "@scope/a",
          version: "1.2.1",
          description: "from 1.2.1",
        });
        writePackageJson(fixture, "packages/d", {
          name: "@scope/d",
          version: "0.0.0",
        });
        return "";
      });
      const versionsAtCommit: string[][] = [];
      exec.respond(/^git add /, () => {
        versionsAtCommit.push([
          ...versions(fixture),
          fixture.readJson("packages/d").version ?? "",
        ]);
        return "";
      });

      const version = releaseManagementForCwd().startHotfix("1.2");

      const staged = [...ALL_PACKAGE_JSONS, "packages/d/package.json"].join(
        " ",
      );
      expect(version).toBe("1.2.2-SNAPSHOT");
      expect(exec.commandsMatching(/^git (checkout|add|tag -a|push)/)).toEqual([
        "git checkout -B hotfix/1.2.x 1.2.1",
        `git add ${staged} && git commit -m "ci(release): Updating package.json set version to 1.2.2-SNAPSHOT [skip ci]"`,
        "git push -u origin hotfix/1.2.x",
        "git push --tags",
      ]);
      expect(versionsAtCommit).toEqual([Array(5).fill("1.2.2-SNAPSHOT")]);
      expect(
        exec.commandsMatching("pnpm run format:package-json"),
      ).toHaveLength(1);
      expect(fixture.readJson("packages/a")).toEqual({
        name: "@scope/a",
        version: "1.2.2-SNAPSHOT",
        description: "from 1.2.1",
      });
      for (const file of [...ALL_PACKAGE_JSONS, "packages/d/package.json"]) {
        expect(fixture.readFile(file)).toMatch(/\}\n$/);
      }
    });
  });
});

describe("ReleaseManagementFactory in a pnpm workspace with the real NodePublisherProvider", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should build, commit, tag, publish every public package once and continue with the next SNAPSHOT", async () => {
    const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
    const exec = recordExecSync({
      branch: "main",
      tags: ["1.1.0"],
      env: { JS_PROJECT_RELEASE_REGISTRY: "https://registry.example" },
    });
    const versionsAt: Record<string, string[]> = {};
    exec.respond(/^git add |^pnpm -r publish/, (command) => {
      versionsAt[command] = versions(fixture);
      return "";
    });
    const releaseFiles: string[] = [];
    exec.respond(/^git tag -a/, () => {
      releaseFiles.push(...ALL_PACKAGE_JSONS.map((f) => fixture.readFile(f)));
      return "";
    });
    const filesAfterPublish: string[] = [];
    const project = Project.forCwd();
    const publisher = new NodePublisherProvider(project, "pnpm");
    const publish = publisher.publish.bind(publisher);
    vi.spyOn(publisher, "publish").mockImplementation(async () => {
      await publish();
      filesAfterPublish.push(
        ...ALL_PACKAGE_JSONS.map((f) => fixture.readFile(f)),
      );
    });

    const version = await ReleaseManagementFactory.forCwd(
      project,
      new BuildProvider(project, "pnpm"),
      publisher,
    ).release();

    const staged = ALL_PACKAGE_JSONS.join(" ");
    const releaseCommit = `git add ${staged} && git commit -m "ci(release): Release 1.2.0"`;
    const publishCommand =
      "pnpm -r publish --ignore-scripts --no-git-checks --registry https://registry.example --tag latest";
    const snapshotCommit = `git add ${staged} && git commit -m "ci(release): Updating package.json set version to 1.3.0-SNAPSHOT"`;
    expect(version).toBe("1.2.0");
    expect(
      exec.commandsMatching(/^pnpm |^git (add|tag -a|push)|publish/),
    ).toEqual([
      "pnpm run format:package-json",
      "pnpm run test",
      "pnpm run build",
      releaseCommit,
      'git tag -a 1.2.0 -m "Release Version 1.2.0"',
      publishCommand,
      snapshotCommit,
      "git push -u origin main",
      "git push --tags",
    ]);
    expect(versionsAt).toEqual({
      [releaseCommit]: ["1.2.0", "1.2.0", "1.2.0", "1.2.0"],
      [publishCommand]: ["1.2.0", "1.2.0", "1.2.0", "1.2.0"],
      [snapshotCommit]: Array(4).fill("1.3.0-SNAPSHOT"),
    });
    // publish() restores the committed release files byte for byte
    expect(filesAfterPublish).toEqual(releaseFiles);
    expect(fixture.readJson("packages/c").dependencies).toEqual({
      "@scope/a": "workspace:*",
    });
    expect(versions(fixture)).toEqual(Array(4).fill("1.3.0-SNAPSHOT"));
  });
});

describe("ReleaseManagementFactory in a workspace with npm or yarn", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PNPM_REQUIRED = "Monorepo mode currently requires pnpm";

  function contents(fixture: Fixture): string[] {
    return ALL_PACKAGE_JSONS.map((file) => fixture.readFile(file));
  }

  /** everything that writes, builds, commits, tags, pushes or publishes */
  const SIDE_EFFECTS =
    /^(npm|yarn|pnpm) |^git (checkout|add|commit|tag -a|push)/;

  it.each(["npm", "yarn"] as const)(
    "should refuse to create the release management with %s before anything is written, committed or tagged",
    (packageManager) => {
      const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
      const before = contents(fixture);
      const project = Project.forCwd();

      expect(() =>
        ReleaseManagementFactory.forCwd(
          project,
          new BuildProvider(project, packageManager),
          new NodePublisherProvider(project, packageManager),
        ),
      ).toThrow(PNPM_REQUIRED);

      expect(exec.commandsMatching(SIDE_EFFECTS)).toEqual([]);
      expect(contents(fixture)).toEqual(before);
    },
  );

  it("should refuse a js-ies-module style release (npm, no NodePublisherProvider)", () => {
    const fixture = createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
    const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
    const before = contents(fixture);
    const publish = vi.fn(async () => {});
    const project = Project.forCwd();

    expect(() =>
      ReleaseManagementFactory.forCwd(
        project,
        new BuildProvider(project, "npm"),
        { publish, cleanup: async () => {} },
      ),
    ).toThrow(PNPM_REQUIRED);

    expect(publish).not.toHaveBeenCalled();
    expect(exec.commandsMatching(SIDE_EFFECTS)).toEqual([]);
    expect(contents(fixture)).toEqual(before);
  });

  it("should refuse verifyRelease() through the factory with npm", () => {
    createFixture(workspaceFixture("1.2.0-SNAPSHOT"));
    recordExecSync({ branch: "main" });
    const project = Project.forCwd();

    expect(() =>
      ReleaseManagementFactory.forCwd(
        project,
        new BuildProvider(project, "npm"),
        noopPublisher(),
      ).verifyRelease(),
    ).toThrow(PNPM_REQUIRED);
  });

  it("should refuse a workspace declared by the package.json workspaces field", () => {
    const fixture = createFixture({
      root: {
        name: "root",
        version: "1.2.0-SNAPSHOT",
        private: true,
        workspaces: ["packages/*"],
      },
      packages: { "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" } },
    });
    const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
    const before = fixture.readFile("package.json");

    expect(() => releaseManagementForCwd()).toThrow(
      'the workspace is declared by the "workspaces" field',
    );

    expect(exec.commandsMatching(SIDE_EFFECTS)).toEqual([]);
    expect(fixture.readFile("package.json")).toBe(before);
  });

  it("should refuse startHotfix() when the base tag is a workspace, before anything is committed", () => {
    const fixture = createFixture({
      root: { name: "root", version: "1.2.0", private: true, scripts },
    });
    const exec = recordExecSync({ branch: "main", tags: ["1.2.0", "1.2.1"] });
    // 1.2.1 introduced the workspace
    exec.respond(/^git checkout -B /, () => {
      writeFileSync(fixture.path("pnpm-workspace.yaml"), "packages:\n  - a\n");
      writePackageJson(fixture, "a", { name: "a", version: "1.2.1" });
      return "";
    });
    const project = Project.forCwd();
    const releaseManagement = ReleaseManagementFactory.forCwd(
      project,
      new BuildProvider(project, "yarn"),
      noopPublisher(),
    );

    expect(() => releaseManagement.startHotfix("1.2")).toThrow(PNPM_REQUIRED);

    expect(exec.commandsMatching(SIDE_EFFECTS)).toEqual([
      "git checkout -B hotfix/1.2.x 1.2.1",
    ]);
    expect(fixture.readJson("a").version).toBe("1.2.1");
  });

  it("should keep releasing a single-package repo with npm", async () => {
    const fixture = createFixture({
      root: { name: "single", version: "1.2.0-SNAPSHOT", scripts },
    });
    const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });
    const project = Project.forCwd();

    await ReleaseManagementFactory.forCwd(
      project,
      new BuildProvider(project, "npm"),
      new NodePublisherProvider(project, "npm"),
    ).release();

    expect(exec.commandsMatching(/^npm /)).toEqual([
      "npm run format:package-json",
      "npm run test",
      "npm run build",
      "npm publish --ignore-scripts --non-interactive --tag latest",
    ]);
    expect(fixture.readJson().version).toBe("1.3.0-SNAPSHOT");
  });
});

describe("ReleaseManagementFactory in a single-package repo", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should release by committing only the root package.json", async () => {
    const fixture = createFixture({
      root: { name: "single", version: "1.2.0-SNAPSHOT", scripts },
      // not part of any workspace, must not be touched
      packages: { "packages/a": { name: "a", version: "0.0.0" } },
    });
    const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });

    await releaseManagementForCwd().release();

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
    expect(fixture.readFile("package.json")).toBe(
      `${JSON.stringify({ name: "single", version: "1.3.0-SNAPSHOT", scripts }, null, 2)}\n`,
    );
    expect(fixture.readJson("packages/a").version).toBe("0.0.0");
  });

  it("should start a hotfix by committing only the root package.json", () => {
    const fixture = createFixture({
      root: { name: "single", version: "2.1.0", scripts },
    });
    const exec = recordExecSync({ branch: "main", tags: ["2.1.0", "2.1.3"] });

    const version = releaseManagementForCwd().startHotfix("2.1");

    expect(version).toBe("2.1.4-SNAPSHOT");
    expect(exec.commandsMatching(/^git (checkout|add|tag -a|push)/)).toEqual([
      "git checkout -B hotfix/2.1.x 2.1.3",
      'git add package.json && git commit -m "ci(release): Updating package.json set version to 2.1.4-SNAPSHOT [skip ci]"',
      "git push -u origin hotfix/2.1.x",
      "git push --tags",
    ]);
    expect(exec.commandsMatching("pnpm run format:package-json")).toHaveLength(
      1,
    );
    expect(fixture.readFile("package.json")).toBe(
      `${JSON.stringify({ name: "single", version: "2.1.4-SNAPSHOT", scripts }, null, 2)}\n`,
    );
  });
});
