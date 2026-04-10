import { describe, expect, it } from "vitest";
import { BranchType } from "../src/BranchType.js";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import type { Project } from "../src/Project.js";

describe("NodePublisherProvider", () => {
  describe("getNpmPublishVersion()", () => {
    it("should append the current build time for snapshots", () => {
      const buildTime = new Date(Date.UTC(2026, 1, 14, 3, 24, 0, 123));
      const publisher = new NodePublisherProvider(
        {
          getVersion: () => "1.0.0-SNAPSHOT",
          getBranch: () => "main",
          getBranchType: () => BranchType.Main,
          isSnapshot: () => true,
          getBuildTime: () => buildTime,
        } as Project,
        "pnpm",
      );
      expect(publisher.getNpmPublishVersion()).toBe(
        "1.0.0-SNAPSHOT.20260214032400123",
      );
    });

    it("should append the feature branch identifier to publishVersion", () => {
      const buildTime = new Date(Date.UTC(2026, 1, 14, 3, 24, 0, 123));
      const publisher = new NodePublisherProvider(
        {
          getVersion: () => "1.0.0-SNAPSHOT",
          getBranch: () => "feature/mein_tolles_krasses_feature_123123",
          getBranchType: () => BranchType.Feature,
          getFeatureBranchVersionIdentifier: () =>
            "mein_tolles_krasses_feature_123123",
          isSnapshot: () => true,
          getBuildTime: () => buildTime,
        } as Project,
        "pnpm",
      );
      expect(publisher.getNpmPublishVersion()).toBe(
        "1.0.0-SNAPSHOT.20260214032400123.mein_tolles_krasses_feature_123123",
      );
    });
  });
});
