import { describe, it, expect } from "vitest";
import {
  isSnapshot,
  normalizeSnapshotVersion,
  releaseVersion,
  incrementMinorVersion,
  incrementPatchVersion,
  greaterThanVersion,
} from "../src/version.js";

describe("version utilities", () => {
  describe("isSnapshot", () => {
    it("should return true for SNAPSHOT versions", () => {
      expect(isSnapshot("1.0.0-SNAPSHOT")).toBe(true);
      expect(isSnapshot("2.5.3-SNAPSHOT")).toBe(true);
      expect(isSnapshot("1.0.0-SNAPSHOT.20230101")).toBe(true);
    });

    it("should return false for release versions", () => {
      expect(isSnapshot("1.0.0")).toBe(false);
      expect(isSnapshot("2.5.3")).toBe(false);
      expect(isSnapshot("10.20.30")).toBe(false);
    });

    it("should return false for other pre-release versions", () => {
      expect(isSnapshot("1.0.0-alpha")).toBe(false);
      expect(isSnapshot("1.0.0-beta.1")).toBe(false);
      expect(isSnapshot("1.0.0-rc.1")).toBe(false);
    });
  });

  describe("normalizeSnapshotVersion", () => {
    it("should remove timestamp from SNAPSHOT version", () => {
      expect(normalizeSnapshotVersion("1.0.0-SNAPSHOT.20230101")).toBe(
        "1.0.0-SNAPSHOT",
      );
      expect(normalizeSnapshotVersion("2.5.3-SNAPSHOT.1234567890")).toBe(
        "2.5.3-SNAPSHOT",
      );
    });

    it("should leave already normalized SNAPSHOT version unchanged", () => {
      expect(normalizeSnapshotVersion("1.0.0-SNAPSHOT")).toBe("1.0.0-SNAPSHOT");
    });

    it("should leave release versions unchanged", () => {
      expect(normalizeSnapshotVersion("1.0.0")).toBe("1.0.0");
    });
  });

  describe("releaseVersion", () => {
    it("should convert SNAPSHOT to release version", () => {
      expect(releaseVersion("1.0.0-SNAPSHOT")).toBe("1.0.0");
      expect(releaseVersion("2.5.3-SNAPSHOT")).toBe("2.5.3");
    });

    it("should remove SNAPSHOT with timestamp", () => {
      expect(releaseVersion("1.0.0-SNAPSHOT.20230101")).toBe("1.0.0");
    });

    it("should leave release versions unchanged", () => {
      expect(releaseVersion("1.0.0")).toBe("1.0.0");
      expect(releaseVersion("2.5.3")).toBe("2.5.3");
    });
  });

  describe("incrementMinorVersion", () => {
    it("should increment minor version and reset patch to 0", () => {
      expect(incrementMinorVersion("1.0.0")).toBe("1.1.0");
      expect(incrementMinorVersion("1.5.0")).toBe("1.6.0");
      expect(incrementMinorVersion("2.9.0")).toBe("2.10.0");
    });

    it("should increment minor version from non-zero patch", () => {
      expect(incrementMinorVersion("1.0.5")).toBe("1.1.0");
      expect(incrementMinorVersion("1.5.3")).toBe("1.6.0");
    });

    it("should work with SNAPSHOT versions", () => {
      expect(incrementMinorVersion("1.0.0-SNAPSHOT")).toBe("1.1.0");
      expect(incrementMinorVersion("2.5.0-SNAPSHOT")).toBe("2.6.0");
    });
  });

  describe("incrementPatchVersion", () => {
    it("should increment patch version", () => {
      expect(incrementPatchVersion("1.0.0")).toBe("1.0.1");
      expect(incrementPatchVersion("1.0.5")).toBe("1.0.6");
      expect(incrementPatchVersion("2.5.9")).toBe("2.5.10");
    });

    it("should work with SNAPSHOT versions", () => {
      expect(incrementPatchVersion("1.0.0-SNAPSHOT")).toBe("1.0.1");
      expect(incrementPatchVersion("2.5.3-SNAPSHOT")).toBe("2.5.4");
    });
  });

  describe("greaterThanVersion", () => {
    it("should return true when first version is greater", () => {
      expect(greaterThanVersion("2.0.0", "1.0.0")).toBe(true);
      expect(greaterThanVersion("1.1.0", "1.0.0")).toBe(true);
      expect(greaterThanVersion("1.0.1", "1.0.0")).toBe(true);
    });

    it("should return false when first version is smaller", () => {
      expect(greaterThanVersion("1.0.0", "2.0.0")).toBe(false);
      expect(greaterThanVersion("1.0.0", "1.1.0")).toBe(false);
      expect(greaterThanVersion("1.0.0", "1.0.1")).toBe(false);
    });

    it("should return false when versions are equal", () => {
      expect(greaterThanVersion("1.0.0", "1.0.0")).toBe(false);
      expect(greaterThanVersion("2.5.3", "2.5.3")).toBe(false);
    });

    it("should compare SNAPSHOT versions correctly", () => {
      expect(greaterThanVersion("1.1.0-SNAPSHOT", "1.0.0-SNAPSHOT")).toBe(true);
      expect(greaterThanVersion("1.0.0-SNAPSHOT", "1.1.0-SNAPSHOT")).toBe(
        false,
      );
    });

    it("should throw error for invalid version strings", () => {
      expect(() => greaterThanVersion("invalid", "1.0.0")).toThrow(
        "Cannot compare versions: 'invalid' or '1.0.0' is not a valid semver version.",
      );
      expect(() => greaterThanVersion("1.0.0", "invalid")).toThrow(
        "Cannot compare versions: '1.0.0' or 'invalid' is not a valid semver version.",
      );
    });
  });
});
