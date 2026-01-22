import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Git } from "../src/Git.js";
import type { PackageJson } from "../src/PackageJson.js";
import { Project } from "../src/Project.js";

describe("Project", () => {
  let mockGit: Git;
  let packageJson: PackageJson;

  beforeEach(() => {
    mockGit = {
      getCurrentBranch: vi.fn().mockReturnValue("main"),
      getVersions: vi.fn().mockReturnValue([]),
      getVersionsFromMajor: vi.fn().mockReturnValue([]),
      getVersionsFromMinor: vi.fn().mockReturnValue([]),
      hasUncommittedChanges: vi.fn().mockReturnValue(false),
    } as unknown as Git;

    packageJson = {
      name: "test-package",
      version: "1.0.0-SNAPSHOT",
    };
  });

  describe("getVersion", () => {
    it("should return version from package.json", () => {
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getVersion()).toBe("1.0.0-SNAPSHOT");
    });

    it("should return default version when not set", () => {
      delete packageJson.version;
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getVersion()).toBe("1.0.0-SNAPSHOT");
    });
  });

  describe("getBranch", () => {
    it("should return current branch from git", () => {
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getBranch()).toBe("main");
    });
  });

  describe("isSnapshot", () => {
    it("should return true for SNAPSHOT version", () => {
      packageJson.version = "1.0.0-SNAPSHOT";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isSnapshot()).toBe(true);
    });

    it("should return false for release version", () => {
      packageJson.version = "1.0.0";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isSnapshot()).toBe(false);
    });
  });

  describe("isRelease", () => {
    it("should return true for release version", () => {
      packageJson.version = "1.0.0";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isRelease()).toBe(true);
    });

    it("should return false for SNAPSHOT version", () => {
      packageJson.version = "1.0.0-SNAPSHOT";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isRelease()).toBe(false);
    });
  });

  describe("branch type checks", () => {
    it("should identify main branch", () => {
      vi.mocked(mockGit.getCurrentBranch).mockReturnValue("main");
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isMainBranch()).toBe(true);
      expect(project.isSupportBranch()).toBe(false);
      expect(project.isHotfixBranch()).toBe(false);
    });

    it("should identify support branch", () => {
      vi.mocked(mockGit.getCurrentBranch).mockReturnValue("support/1.x");
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isMainBranch()).toBe(false);
      expect(project.isSupportBranch()).toBe(true);
      expect(project.isHotfixBranch()).toBe(false);
    });

    it("should identify hotfix branch", () => {
      vi.mocked(mockGit.getCurrentBranch).mockReturnValue("hotfix/2.1.x");
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.isMainBranch()).toBe(false);
      expect(project.isSupportBranch()).toBe(false);
      expect(project.isHotfixBranch()).toBe(true);
    });
  });

  describe("getNextReleaseVersion", () => {
    it("should convert SNAPSHOT to release version", () => {
      packageJson.version = "1.5.0-SNAPSHOT";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getNextReleaseVersion()).toBe("1.5.0");
    });
  });

  describe("getNextSnapshotVersion", () => {
    it("should increment minor for main branch", () => {
      packageJson.version = "1.5.0-SNAPSHOT";
      vi.mocked(mockGit.getCurrentBranch).mockReturnValue("main");
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getNextSnapshotVersion()).toBe("1.6.0-SNAPSHOT");
    });

    it("should increment minor for support branch", () => {
      packageJson.version = "1.5.0-SNAPSHOT";
      vi.mocked(mockGit.getCurrentBranch).mockReturnValue("support/1.x");
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getNextSnapshotVersion()).toBe("1.6.0-SNAPSHOT");
    });

    it("should increment patch for hotfix branch", () => {
      packageJson.version = "2.1.3-SNAPSHOT";
      vi.mocked(mockGit.getCurrentBranch).mockReturnValue("hotfix/2.1.x");
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getNextSnapshotVersion()).toBe("2.1.4-SNAPSHOT");
    });
  });

  describe("hasPublishConfig", () => {
    it("should return true when publishConfig with registry exists", () => {
      packageJson.publishConfig = { registry: "https://registry.npmjs.org" };
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.hasPublishConfig()).toBe(true);
    });

    it("should return false when publishConfig is missing", () => {
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.hasPublishConfig()).toBe(false);
    });

    it("should return false when registry is missing", () => {
      packageJson.publishConfig = {};
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.hasPublishConfig()).toBe(false);
    });
  });

  describe("getSnapshotDependencies", () => {
    it("should find SNAPSHOT dependencies", () => {
      packageJson.dependencies = {
        "@sitepark/test": "^1.0.0-SNAPSHOT",
        "regular-dep": "^2.0.0",
      };
      const project = new Project(packageJson, "/test/package.json", mockGit);
      const snapshots = project.getSnapshotDependencies("dependencies");

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toEqual({
        name: "@sitepark/test",
        versionRange: "^1.0.0-SNAPSHOT",
      });
    });

    it("should find SNAPSHOT devDependencies", () => {
      packageJson.devDependencies = {
        "@sitepark/test-dev": "^1.0.0-SNAPSHOT",
        "regular-dev": "^2.0.0",
      };
      const project = new Project(packageJson, "/test/package.json", mockGit);
      const snapshots = project.getSnapshotDependencies("devDependencies");

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toEqual({
        name: "@sitepark/test-dev",
        versionRange: "^1.0.0-SNAPSHOT",
      });
    });

    it("should return empty array when no SNAPSHOT dependencies", () => {
      packageJson.dependencies = {
        "regular-dep": "^2.0.0",
      };
      const project = new Project(packageJson, "/test/package.json", mockGit);
      const snapshots = project.getSnapshotDependencies("dependencies");

      expect(snapshots).toHaveLength(0);
    });

    it("should return empty array when dependency type does not exist", () => {
      const project = new Project(packageJson, "/test/package.json", mockGit);
      const snapshots = project.getSnapshotDependencies("peerDependencies");

      expect(snapshots).toHaveLength(0);
    });
  });

  describe("hasScript", () => {
    it("should return true when script exists", () => {
      packageJson.scripts = {
        test: "vitest",
        build: "vite build",
      };
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.hasScript("test")).toBe(true);
      expect(project.hasScript("build")).toBe(true);
    });

    it("should return false when script does not exist", () => {
      packageJson.scripts = {
        test: "vitest",
      };
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.hasScript("build")).toBe(false);
    });

    it("should return false when scripts section is missing", () => {
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.hasScript("test")).toBe(false);
    });
  });

  describe("getSnapshotRegistry", () => {
    it("should return snapshotRegistry when configured", () => {
      process.env.JS_PROJECT_SNAPSHOT_REGISTRY =
        "https://snapshot.registry.com";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getSnapshotRegistry()).toBe(
        "https://snapshot.registry.com",
      );
      delete process.env.JS_PROJECT_SNAPSHOT_REGISTRY;
    });

    it("should return undefined when not configured", () => {
      delete process.env.JS_PROJECT_SNAPSHOT_REGISTRY;
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getSnapshotRegistry()).toBeUndefined();
    });
  });

  describe("getReleaseRegistry", () => {
    it("should return releaseRegistry when configured", () => {
      process.env.JS_PROJECT_RELEASE_REGISTRY = "https://release.registry.com";
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getReleaseRegistry()).toBe("https://release.registry.com");
      delete process.env.JS_PROJECT_RELEASE_REGISTRY;
    });

    it("should return undefined when not configured", () => {
      delete process.env.JS_PROJECT_RELEASE_REGISTRY;
      const project = new Project(packageJson, "/test/package.json", mockGit);
      expect(project.getReleaseRegistry()).toBeUndefined();
    });
  });
});
