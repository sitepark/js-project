import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import { Project } from "../src/Project.js";
import {
  createFixture,
  type ExecSyncRecorder,
  type Fixture,
  recordExecSync,
} from "./support/fixtureHarness.js";

vi.mock("node:child_process");

describe("NodePublisherProvider.publish()", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("with a private root package", () => {
    it("should skip publishing and resolve", async () => {
      const fixture = createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
      });
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });

      const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
      await expect(publisher.publish()).resolves.toBeUndefined();

      expect(exec.commandsMatching(/\bpublish\b/)).toEqual([]);
      expect(console.log).toHaveBeenCalledWith(
        'Skipping publish of private package "root"',
      );
      expect(fixture.readJson().version).toBe("1.2.0-SNAPSHOT");
    });

    it("should skip publishing a private root release version", async () => {
      createFixture({
        root: { name: "root", version: "1.2.0", private: true },
      });
      const exec = recordExecSync({ branch: "main", tags: ["1.1.0"] });

      const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
      await publisher.publish();

      expect(exec.commandsMatching(/\bpublish\b/)).toEqual([]);
    });

    it("should skip publishing a private root in a workspace", async () => {
      createFixture({
        root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
        workspace: { packages: ["packages/*"] },
        packages: {
          "packages/a": { name: "a", version: "1.2.0-SNAPSHOT", private: true },
        },
      });
      const exec = recordExecSync({ branch: "main" });

      const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
      await publisher.publish();

      expect(exec.commandsMatching(/\bpublish\b/)).toEqual([]);
    });
  });

  describe("with a non-private root package", () => {
    it("should publish a SNAPSHOT with timestamp, next tag and registry and restore the version", async () => {
      const fixture = createFixture({
        root: { name: "@scope/lib", version: "1.2.0-SNAPSHOT" },
      });
      const exec = recordExecSync({
        branch: "main",
        tags: ["1.0.0", "1.1.0"],
        env: { JS_PROJECT_SNAPSHOT_REGISTRY: "https://snapshots.example" },
      });
      let versionAtPublish: string | undefined;
      exec.respond(/^pnpm publish/, () => {
        versionAtPublish = fixture.readJson().version;
        return "";
      });

      const project = Project.forCwd();
      const publisher = new NodePublisherProvider(project, "pnpm");
      await publisher.publish();

      expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
        "pnpm publish --ignore-scripts --no-git-checks --registry https://snapshots.example --tag next",
      ]);
      expect(versionAtPublish).toBe(publisher.getNpmPublishVersion());
      expect(versionAtPublish).toMatch(/^1\.2\.0-SNAPSHOT\.\d{17}$/);
      expect(fixture.readJson().version).toBe("1.2.0-SNAPSHOT");
      expect(fixture.readFile("package.json").endsWith("}\n")).toBe(true);
    });

    it("should publish a release with latest tag and release registry", async () => {
      const fixture = createFixture({
        root: { name: "lib", version: "1.2.0", private: false },
      });
      const exec = recordExecSync({
        branch: "main",
        tags: ["1.1.0", "1.2.0"],
        env: { JS_PROJECT_RELEASE_REGISTRY: "https://releases.example" },
      });

      const publisher = new NodePublisherProvider(Project.forCwd(), "npm");
      await publisher.publish();

      expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
        "npm publish --ignore-scripts --non-interactive --registry https://releases.example --tag latest",
      ]);
      expect(fixture.readJson().version).toBe("1.2.0");
    });

    it("should restore the version when the publish command fails", async () => {
      const fixture = createFixture({
        root: { name: "lib", version: "1.2.0-SNAPSHOT" },
      });
      const exec = recordExecSync({ branch: "main" });
      exec.respond(/^pnpm publish/, new Error("publish failed"));

      const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
      await expect(publisher.publish()).rejects.toThrow("publish failed");

      expect(fixture.readJson().version).toBe("1.2.0-SNAPSHOT");
    });
  });
});

describe("NodePublisherProvider.publish() in a pnpm workspace", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PACKAGE_JSONS = [
    "package.json",
    "packages/a/package.json",
    "packages/b/package.json",
    "packages/c/package.json",
  ];

  /**
   * Private root, public `a` (depending on `b` via `workspace:*`), public `b`
   * and private `c` (drifted to 0.0.0). Some files use formatting js-project
   * would not produce itself, to prove the restore is byte-identical.
   */
  function createWorkspace(
    options: { rootPrivate?: boolean; version?: string } = {},
  ): Fixture {
    const version = options.version ?? "1.2.0-SNAPSHOT";
    return createFixture({
      root: {
        name: "root",
        version,
        ...(options.rootPrivate === false ? {} : { private: true }),
      },
      workspace: { packages: ["packages/*"] },
      packages: {
        "packages/b": { name: "@scope/b", version },
      },
      files: {
        "packages/a/package.json": `{\n    "name": "@scope/a",\n    "version": "${version}",\n    "dependencies": { "@scope/b": "workspace:*" },\n    "devDependencies": { "c": "workspace:*" }\n}`,
        "packages/c/package.json": `{"name":"c","version":"0.0.0","private":true}\r\n`,
      },
    });
  }

  function readAll(fixture: Fixture): string[] {
    return PACKAGE_JSONS.map((file) => fixture.readFile(file));
  }

  /** records the version of every package.json when `pnpm -r publish` runs */
  function versionsAtPublish(
    fixture: Fixture,
    exec: ExecSyncRecorder,
  ): string[][] {
    const seen: string[][] = [];
    exec.respond(/^pnpm -r publish/, () => {
      seen.push(
        PACKAGE_JSONS.map((file) => fixture.readJson(file).version ?? ""),
      );
      return "";
    });
    return seen;
  }

  it("should publish a SNAPSHOT of all packages with one recursive publish", async () => {
    const fixture = createWorkspace();
    const before = readAll(fixture);
    const exec = recordExecSync({
      branch: "main",
      tags: ["1.0.0", "1.1.0"],
      env: { JS_PROJECT_SNAPSHOT_REGISTRY: "https://snapshots.example" },
    });
    const seen = versionsAtPublish(fixture, exec);

    const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
    await publisher.publish();

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
      "pnpm -r publish --ignore-scripts --no-git-checks --registry https://snapshots.example --tag next",
    ]);
    const publishVersion = publisher.getNpmPublishVersion();
    expect(publishVersion).toMatch(/^1\.2\.0-SNAPSHOT\.\d{17}$/);
    expect(seen).toEqual([PACKAGE_JSONS.map(() => publishVersion)]);
    expect(readAll(fixture)).toEqual(before);
  });

  it("should only change the version of each package for the publish", async () => {
    const fixture = createWorkspace();
    const before = PACKAGE_JSONS.map((file) => fixture.readJson(file));
    const exec = recordExecSync({ branch: "main" });
    let atPublish: unknown[] = [];
    exec.respond(/^pnpm -r publish/, () => {
      atPublish = PACKAGE_JSONS.map((file) => fixture.readJson(file));
      return "";
    });

    const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
    await publisher.publish();

    const publishVersion = publisher.getNpmPublishVersion();
    expect(atPublish).toEqual(
      before.map((pkg) => ({ ...pkg, version: publishVersion })),
    );
  });

  it("should include the feature identifier for all packages on feature branches", async () => {
    const fixture = createWorkspace();
    const exec = recordExecSync({ branch: "feature/my-feature" });
    const seen = versionsAtPublish(fixture, exec);

    await new NodePublisherProvider(Project.forCwd(), "pnpm").publish();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(PACKAGE_JSONS.length);
    for (const version of seen[0] ?? []) {
      expect(version).toMatch(/^1\.2\.0-SNAPSHOT\.\d{17}\.my-feature$/);
    }
  });

  it("should sync a release version into all packages and use the release registry", async () => {
    const fixture = createWorkspace({ version: "1.2.0" });
    const before = readAll(fixture);
    const exec = recordExecSync({
      branch: "main",
      tags: ["1.1.0", "1.2.0"],
      env: { JS_PROJECT_RELEASE_REGISTRY: "https://releases.example" },
    });
    const seen = versionsAtPublish(fixture, exec);

    await new NodePublisherProvider(Project.forCwd(), "pnpm").publish();

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
      "pnpm -r publish --ignore-scripts --no-git-checks --registry https://releases.example --tag latest",
    ]);
    // packages/c has drifted to 0.0.0 and is synced as well
    expect(seen).toEqual([PACKAGE_JSONS.map(() => "1.2.0")]);
    expect(readAll(fixture)).toEqual(before);
  });

  it("should restore every package.json byte-identically when publishing fails", async () => {
    const fixture = createWorkspace();
    const before = readAll(fixture);
    const exec = recordExecSync({ branch: "main" });
    exec.respond(/^pnpm -r publish/, new Error("publish failed"));

    const project = Project.forCwd();
    const publisher = new NodePublisherProvider(project, "pnpm");
    await expect(publisher.publish()).rejects.toThrow("publish failed");

    expect(readAll(fixture)).toEqual(before);
    expect(project.getVersion()).toBe("1.2.0-SNAPSHOT");
  });

  it("should not publish a private root separately", async () => {
    createWorkspace();
    const exec = recordExecSync({ branch: "main" });

    await new NodePublisherProvider(Project.forCwd(), "pnpm").publish();

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
      "pnpm -r publish --ignore-scripts --no-git-checks --tag next",
    ]);
    expect(console.log).toHaveBeenCalledWith(
      'Skipping publish of private package "root"',
    );
  });

  it("should publish a non-private root exactly once, as part of the recursive publish", async () => {
    const fixture = createWorkspace({ rootPrivate: false });
    const exec = recordExecSync({ branch: "main" });
    const seen = versionsAtPublish(fixture, exec);

    const publisher = new NodePublisherProvider(Project.forCwd(), "pnpm");
    await publisher.publish();

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
      "pnpm -r publish --ignore-scripts --no-git-checks --tag next",
    ]);
    expect(seen[0]?.[0]).toBe(publisher.getNpmPublishVersion());
    expect(fixture.readJson().version).toBe("1.2.0-SNAPSHOT");
  });

  it("should not touch any package.json when all packages are private", async () => {
    const fixture = createFixture({
      root: { name: "root", version: "1.2.0-SNAPSHOT", private: true },
      workspace: { packages: ["packages/*"] },
      packages: {
        "packages/a": { name: "a", version: "0.0.0", private: true },
      },
    });
    const files = ["package.json", "packages/a/package.json"];
    const before = files.map((file) => fixture.readFile(file));
    const exec = recordExecSync({ branch: "main" });

    await new NodePublisherProvider(Project.forCwd(), "pnpm").publish();

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([]);
    expect(console.log).toHaveBeenCalledWith(
      "Skipping publish: all packages of the workspace are private",
    );
    expect(files.map((file) => fixture.readFile(file))).toEqual(before);
  });
});

describe("NodePublisherProvider.publish() in a single-package repository", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should never publish recursively, even with nested package.json files", async () => {
    const nested = '{ "name": "fixture", "version": "0.0.0" }';
    const fixture = createFixture({
      root: { name: "lib", version: "1.2.0-SNAPSHOT" },
      workspace: "allowBuilds:\n  esbuild: true\n",
      files: { "test/fixture/package.json": nested },
    });
    const exec = recordExecSync({ branch: "main" });

    await new NodePublisherProvider(Project.forCwd(), "pnpm").publish();

    expect(exec.commandsMatching(/\bpublish\b/)).toEqual([
      "pnpm publish --ignore-scripts --no-git-checks --tag next",
    ]);
    expect(fixture.readFile("test/fixture/package.json")).toBe(nested);
  });

  it("should restore the package.json byte-identically after a SNAPSHOT publish", async () => {
    const original =
      '{\n    "name": "lib",\n    "version": "1.2.0-SNAPSHOT"\n}';
    const fixture = createFixture({
      root: { name: "lib", version: "1.2.0-SNAPSHOT" },
      files: { "package.json": original },
    });
    recordExecSync({ branch: "main" });

    await new NodePublisherProvider(Project.forCwd(), "pnpm").publish();

    expect(fixture.readFile("package.json")).toBe(original);
  });
});
