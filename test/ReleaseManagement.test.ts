import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildProvider } from "../src/BuildProvider.js";
import type { Git } from "../src/Git.js";
import type { Project } from "../src/Project.js";
import type { PublisherProvider } from "../src/PublisherProvider.js";
import { ReleaseManagement } from "../src/ReleaseManagement.js";

describe("ReleaseManagement", () => {
  let mockProject: Project;
  let mockGit: Git;
  let mockBuildProvider: BuildProvider;
  let mockPublisherProvider: PublisherProvider;
  let releaseManagement: ReleaseManagement;

  beforeEach(() => {
    mockProject = {
      isRelease: vi.fn(),
      isSnapshot: vi.fn(),
      isMainBranch: vi.fn(),
      isSupportBranch: vi.fn(),
      isHotfixBranch: vi.fn(),
      getVersion: vi.fn(),
      getBranch: vi.fn(),
      getNextReleaseVersion: vi.fn(),
      getNextSnapshotVersion: vi.fn(),
      getVersionsFromMinor: vi.fn(),
      updateVersion: vi.fn(),
      hasUncommittedChanges: vi.fn(),
    } as unknown as Project;

    mockGit = {
      createBranch: vi.fn(),
      commit: vi.fn(),
      createTag: vi.fn(),
      push: vi.fn(),
      pushOrigin: vi.fn(),
      getChangedTrackedFiles: vi.fn(),
    } as unknown as Git;

    mockBuildProvider = {
      formatPackageJson: vi.fn(),
      test: vi.fn(),
      verify: vi.fn(),
      build: vi.fn(),
    } as unknown as BuildProvider;

    mockPublisherProvider = {
      publish: vi.fn(),
    } as unknown as PublisherProvider;

    releaseManagement = new ReleaseManagement(
      mockProject,
      mockGit,
      mockBuildProvider,
      mockPublisherProvider,
    );
  });

  describe("verifyRelease", () => {
    it("should return a VerificationReport", () => {
      const report = releaseManagement.verifyRelease();
      expect(report).toBeDefined();
      expect(report.constructor.name).toBe("VerificationReport");
    });
  });

  describe("startHotfix", () => {
    it("should throw error when not on a release version", () => {
      vi.mocked(mockProject.isRelease).mockReturnValue(false);
      vi.mocked(mockProject.getVersion).mockReturnValue("1.0.0-SNAPSHOT");

      expect(() => releaseManagement.startHotfix("2.1")).toThrow(
        "A hotfix can only be created on the basis of a release. " +
          "The current Git state is not a checked out tag. Current version: 1.0.0-SNAPSHOT",
      );
    });

    it("should throw error when no release versions exist", () => {
      vi.mocked(mockProject.isRelease).mockReturnValue(true);
      vi.mocked(mockProject.getVersionsFromMinor).mockReturnValue([]);

      expect(() => releaseManagement.startHotfix("2.1")).toThrow(
        "There is no release yet for which a hotfix can be created.",
      );
    });

    it("should create hotfix branch from latest release version", () => {
      vi.mocked(mockProject.isRelease).mockReturnValue(true);
      vi.mocked(mockProject.getVersionsFromMinor).mockReturnValue([
        "2.1.0",
        "2.1.1",
        "2.1.2",
      ]);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = releaseManagement.startHotfix("2.1");

      expect(mockGit.createBranch).toHaveBeenCalledWith(
        "hotfix/2.1.x",
        "2.1.2",
      );
      expect(result).toBe("2.1.3-SNAPSHOT");
      expect(consoleSpy).toHaveBeenCalledWith(
        "hotfixSnapshotVersion: 2.1.3-SNAPSHOT",
      );

      consoleSpy.mockRestore();
    });

    it("should update version to next patch SNAPSHOT", () => {
      vi.mocked(mockProject.isRelease).mockReturnValue(true);
      vi.mocked(mockProject.getVersionsFromMinor).mockReturnValue(["2.1.0"]);

      vi.spyOn(console, "log").mockImplementation(() => {});

      releaseManagement.startHotfix("2.1");

      expect(mockProject.updateVersion).toHaveBeenCalledWith("2.1.1-SNAPSHOT");
    });

    it("should format package.json", () => {
      vi.mocked(mockProject.isRelease).mockReturnValue(true);
      vi.mocked(mockProject.getVersionsFromMinor).mockReturnValue(["2.1.0"]);

      vi.spyOn(console, "log").mockImplementation(() => {});

      releaseManagement.startHotfix("2.1");

      expect(mockBuildProvider.formatPackageJson).toHaveBeenCalled();
    });

    it("should commit version change", () => {
      vi.mocked(mockProject.isRelease).mockReturnValue(true);
      vi.mocked(mockProject.getVersionsFromMinor).mockReturnValue(["2.1.0"]);

      vi.spyOn(console, "log").mockImplementation(() => {});

      releaseManagement.startHotfix("2.1");

      expect(mockGit.commit).toHaveBeenCalledWith(
        "package.json",
        "ci(release)",
        "updating package.json set version to 2.1.1-SNAPSHOT",
      );
    });
  });

  describe("release", () => {
    beforeEach(() => {
      vi.mocked(mockProject.isSnapshot).mockReturnValue(true);
      vi.mocked(mockProject.isMainBranch).mockReturnValue(true);
      vi.mocked(mockProject.getNextReleaseVersion).mockReturnValue("1.5.0");
      vi.mocked(mockProject.getNextSnapshotVersion).mockReturnValue(
        "1.6.0-SNAPSHOT",
      );
      vi.mocked(mockProject.hasUncommittedChanges).mockReturnValue(false);

      vi.spyOn(console, "group").mockImplementation(() => {});
      vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    });

    it("should throw error when not a SNAPSHOT version", () => {
      vi.mocked(mockProject.isSnapshot).mockReturnValue(false);
      vi.mocked(mockProject.getVersion).mockReturnValue("1.0.0");

      expect(() => releaseManagement.release()).toThrow(
        "The current version is not a SNAPSHOT version: 1.0.0",
      );
    });

    it("should throw error when not on main, support or hotfix branch", () => {
      vi.mocked(mockProject.isMainBranch).mockReturnValue(false);
      vi.mocked(mockProject.isSupportBranch).mockReturnValue(false);
      vi.mocked(mockProject.isHotfixBranch).mockReturnValue(false);
      vi.mocked(mockProject.getBranch).mockReturnValue("feature/test");

      expect(() => releaseManagement.release()).toThrow(
        "No release can be created with branch 'feature/test'.",
      );
    });

    it("should throw error when release version is null", () => {
      vi.mocked(mockProject.getNextReleaseVersion).mockReturnValue(null as any);

      expect(() => releaseManagement.release()).toThrow(
        "Unable to determine release version",
      );
    });

    it("should throw error when uncommitted changes exist", () => {
      vi.mocked(mockProject.hasUncommittedChanges).mockReturnValue(true);
      vi.mocked(mockGit.getChangedTrackedFiles).mockReturnValue([
        "M file1.ts",
        "M file2.ts",
      ]);

      expect(() => releaseManagement.release()).toThrow(
        "The release can only be created when all changes are committed.\n" +
          "Uncommitted changes:\n" +
          "M file1.ts\n" +
          "M file2.ts",
      );
    });

    it("should update version to release version", () => {
      releaseManagement.release();

      expect(mockProject.updateVersion).toHaveBeenCalledWith("1.5.0");
    });

    it("should format package.json", () => {
      releaseManagement.release();

      expect(mockBuildProvider.formatPackageJson).toHaveBeenCalled();
    });

    it("should execute build pipeline", () => {
      releaseManagement.release();

      expect(mockBuildProvider.test).toHaveBeenCalled();
      expect(mockBuildProvider.verify).toHaveBeenCalled();
      expect(mockBuildProvider.build).toHaveBeenCalled();
      expect(mockPublisherProvider.publish).toHaveBeenCalled();
    });

    it("should create release commit", () => {
      releaseManagement.release();

      expect(mockGit.commit).toHaveBeenCalledWith(
        "package.json",
        "ci(release)",
        "Release 1.5.0",
        false,
      );
    });

    it("should create git tag", () => {
      releaseManagement.release();

      expect(mockGit.createTag).toHaveBeenCalledWith(
        "1.5.0",
        "Release Version 1.5.0",
      );
    });

    it("should update version to next snapshot", () => {
      releaseManagement.release();

      expect(mockProject.updateVersion).toHaveBeenCalledWith("1.6.0-SNAPSHOT");
    });

    it("should create snapshot commit", () => {
      releaseManagement.release();

      expect(mockGit.commit).toHaveBeenCalledWith(
        "package.json",
        "ci(release)",
        "Release 1.5.0",
        false,
      );
    });

    it("should return release version", () => {
      const result = releaseManagement.release();

      expect(result).toBe("1.5.0");
    });

    it("should work with support branch", () => {
      vi.mocked(mockProject.isMainBranch).mockReturnValue(false);
      vi.mocked(mockProject.isSupportBranch).mockReturnValue(true);

      const result = releaseManagement.release();

      expect(result).toBe("1.5.0");
    });

    it("should work with hotfix branch", () => {
      vi.mocked(mockProject.isMainBranch).mockReturnValue(false);
      vi.mocked(mockProject.isHotfixBranch).mockReturnValue(true);

      const result = releaseManagement.release();

      expect(result).toBe("1.5.0");
    });
  });

  describe("assertNoUncommittedChanges", () => {
    it("should not throw when no uncommitted changes", () => {
      vi.mocked(mockProject.hasUncommittedChanges).mockReturnValue(false);

      expect(() =>
        releaseManagement.assertNoUncommittedChanges("Test message"),
      ).not.toThrow();
    });

    it("should throw with file list when uncommitted changes exist", () => {
      vi.mocked(mockProject.hasUncommittedChanges).mockReturnValue(true);
      vi.mocked(mockGit.getChangedTrackedFiles).mockReturnValue([
        "M src/file1.ts",
        "A src/file2.ts",
      ]);

      expect(() =>
        releaseManagement.assertNoUncommittedChanges("Cannot proceed"),
      ).toThrow(
        "Cannot proceed\nUncommitted changes:\nM src/file1.ts\nA src/file2.ts",
      );
    });
  });

  describe("logTask", () => {
    it("should call console.group and console.groupEnd", () => {
      const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
      const groupEndSpy = vi
        .spyOn(console, "groupEnd")
        .mockImplementation(() => {});

      releaseManagement.logTask("Test Task", () => {});

      expect(groupSpy).toHaveBeenCalledWith("Test Task");
      expect(groupEndSpy).toHaveBeenCalled();

      groupSpy.mockRestore();
      groupEndSpy.mockRestore();
    });

    it("should execute callback", () => {
      const callback = vi.fn();

      vi.spyOn(console, "group").mockImplementation(() => {});
      vi.spyOn(console, "groupEnd").mockImplementation(() => {});

      releaseManagement.logTask("Test Task", callback);

      expect(callback).toHaveBeenCalled();
    });

    it("should execute callback between group and groupEnd", () => {
      const callOrder: string[] = [];

      vi.spyOn(console, "group").mockImplementation(() => {
        callOrder.push("group");
      });
      vi.spyOn(console, "groupEnd").mockImplementation(() => {
        callOrder.push("groupEnd");
      });

      releaseManagement.logTask("Test Task", () => {
        callOrder.push("callback");
      });

      expect(callOrder).toEqual(["group", "callback", "groupEnd"]);
    });
  });
});
