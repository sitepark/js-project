import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DependencyInfo, Project } from "../src/Project.js";
import { VerificationReport } from "../src/VerificationReport.js";

// These tests cover the SNAPSHOT check with a hand-built Project. The
// workspace-wide checks are covered by VerificationReport.workspace*.test.ts;
// here the project is treated as a workspace without other packages.
vi.mock("../src/Workspace.js", () => ({
  Workspace: { forProject: () => ({ getPackages: () => [] }) },
}));

describe("VerificationReport", () => {
  let mockProject: Project;

  beforeEach(() => {
    mockProject = {
      getSnapshotDependencies: vi.fn(),
    } as unknown as Project;
  });

  describe("hasSnapshotDependencies", () => {
    it("should return true when dependencies have SNAPSHOT versions", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "dependencies")
            return [
              { name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" },
            ];
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      expect(report.hasSnapshotDependencies()).toBe(true);
    });

    it("should return true when devDependencies have SNAPSHOT versions", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "devDependencies")
            return [
              { name: "@sitepark/test-dev", versionRange: "^2.0.0-SNAPSHOT" },
            ];
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      expect(report.hasSnapshotDependencies()).toBe(true);
    });

    it("should return true when peerDependencies have SNAPSHOT versions", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "peerDependencies")
            return [
              { name: "@sitepark/test-peer", versionRange: "^3.0.0-SNAPSHOT" },
            ];
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      expect(report.hasSnapshotDependencies()).toBe(true);
    });

    it("should return false when no SNAPSHOT dependencies exist", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockReturnValue([]);

      const report = new VerificationReport(mockProject);
      expect(report.hasSnapshotDependencies()).toBe(false);
    });
  });

  describe("hasFailures", () => {
    it("should return true when SNAPSHOT dependencies exist", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) =>
          type === "dependencies"
            ? [{ name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" }]
            : [],
      );

      const report = new VerificationReport(mockProject);
      expect(report.hasFailures()).toBe(true);
    });

    it("should return false when no SNAPSHOT dependencies exist", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockReturnValue([]);

      const report = new VerificationReport(mockProject);
      expect(report.hasFailures()).toBe(false);
    });
  });

  describe("isPublishable", () => {
    it("should return true when the report has no failures", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockReturnValue([]);

      const report = new VerificationReport(mockProject);
      expect(report.isPublishable()).toBe(true);
    });

    it.each(["dependencies", "devDependencies", "peerDependencies"])(
      "should return false when %s have SNAPSHOT versions",
      (section) => {
        vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
          (type) =>
            type === section
              ? [{ name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" }]
              : [],
        );

        const report = new VerificationReport(mockProject);
        expect(report.isPublishable()).toBe(false);
      },
    );
  });

  describe("isReleaseable", () => {
    it("should return true when there are no SNAPSHOT dependencies", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockReturnValue([]);

      const report = new VerificationReport(mockProject);
      expect(report.isReleaseable()).toBe(true);
    });

    it("should return false when has SNAPSHOT dependencies", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "dependencies")
            return [
              { name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" },
            ];
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      expect(report.isReleaseable()).toBe(false);
    });
  });

  describe("generateDependecyInfo", () => {
    it("should collect all dependency types", () => {
      const deps: DependencyInfo[] = [
        { name: "dep1", versionRange: "^1.0.0-SNAPSHOT" },
      ];
      const devDeps: DependencyInfo[] = [
        { name: "devDep1", versionRange: "^2.0.0-SNAPSHOT" },
      ];
      const peerDeps: DependencyInfo[] = [
        { name: "peerDep1", versionRange: "^3.0.0-SNAPSHOT" },
      ];

      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "dependencies") return deps;
          if (type === "devDependencies") return devDeps;
          if (type === "peerDependencies") return peerDeps;
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      const info = report.generateDependecyInfo();

      expect(info.dependencies).toEqual(deps);
      expect(info.devDependencies).toEqual(devDeps);
      expect(info.peerDependencies).toEqual(peerDeps);
    });
  });

  describe("toString", () => {
    it("should report no problems when there are no failures", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockReturnValue([]);

      const report = new VerificationReport(mockProject);
      const message = report.toString();

      expect(message).toBe("No problems found.");
    });

    it("should return SNAPSHOT dependencies message when has snapshots", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "dependencies")
            return [
              { name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" },
            ];
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      const message = report.toString();

      expect(message).toContain("Snapshot-Version detected:");
      expect(message).toContain("dependencies:");
      expect(message).toContain("@sitepark/test - ^1.0.0-SNAPSHOT");
    });
  });

  describe("toJson", () => {
    it("should return JSON with all dependency info and flags", () => {
      vi.mocked(mockProject.getSnapshotDependencies).mockImplementation(
        (type) => {
          if (type === "dependencies")
            return [
              { name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" },
            ];
          return [];
        },
      );

      const report = new VerificationReport(mockProject);
      const json = report.toJson();
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty("dependencies");
      expect(parsed).toHaveProperty("devDependencies");
      expect(parsed).toHaveProperty("peerDependencies");
      expect(parsed).toHaveProperty("isPublishable");
      expect(parsed).toHaveProperty("isReleasable");
      expect(parsed.isPublishable).toBe(false);
      expect(parsed.isReleasable).toBe(false);
    });
  });
});
