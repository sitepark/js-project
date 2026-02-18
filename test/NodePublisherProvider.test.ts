import { describe, expect, it } from "vitest";
import { Project } from "../src/Project.js";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";

describe("NodePublisherProvider", () => {
  describe("getNpmPublishVersion()", () => {
    it("should append the current build time for snapshots", () => {
      const buildTime = new Date("2026-01-14T03:24:00.123");
      const publisher = new NodePublisherProvider(
        {
          getVersion: () => "1.0.0-SNAPSHOT",
          getBranch: () => "main",
          isSnapshot: () => true,
          getBuildTime: () => buildTime,
        } as Project,
        "pnpm",
      );
      expect(publisher.getNpmPublishVersion()).toBe(
        "1.0.0-SNAPSHOT.20260114022400123",
      );
    });

    it("should append the feature branch identifier to publishVersion", () => {
      const buildTime = new Date("2026-01-14T03:24:00.123");
      const publisher = new NodePublisherProvider(
        {
          getVersion: () => "1.0.0-SNAPSHOT",
          getBranch: () => "feature/mein_tolles_krasses_feature_123123",
          getFeatureBranchVersionIdentifier: (_target: string) =>
            "mein_tolles_krasses_feature_123123",
          isSnapshot: () => true,
          getBuildTime: () => buildTime,
        } as Project,
        "pnpm",
      );
      expect(publisher.getNpmPublishVersion()).toBe(
        "1.0.0-SNAPSHOT.20260114022400123.mein_tolles_krasses_feature_123123",
      );
    });
  });
});
