import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import { Project } from "../src/Project.js";
import { createFixture, recordExecSync } from "./support/fixtureHarness.js";

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
