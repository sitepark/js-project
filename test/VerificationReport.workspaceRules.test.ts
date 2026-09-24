import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildProvider } from "../src/BuildProvider.js";
import { verifyReleaseCommand } from "../src/commands/verifyRelease.js";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import type { PackageJson } from "../src/PackageJson.js";
import { Project } from "../src/Project.js";
import { ReleaseManagementFactory } from "../src/ReleaseManagementFactory.js";
import {
  createFixture,
  type FixtureDefinition,
  recordExecSync,
} from "./support/fixtureHarness.js";

vi.mock("node:child_process");

const { exit } = vi.hoisted(() => ({ exit: vi.fn() }));
vi.mock("node:process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:process")>()),
  exit,
}));

function verifyReleaseForCwd() {
  const project = Project.forCwd();
  return ReleaseManagementFactory.forCwd(
    project,
    new BuildProvider(project, "pnpm"),
    new NodePublisherProvider(project, "pnpm"),
  ).verifyRelease();
}

const VERSION = "1.2.0-SNAPSHOT";

function workspace(packages: Record<string, PackageJson>): FixtureDefinition {
  return {
    root: { name: "root", version: VERSION, private: true },
    workspace: { packages: ["packages/*"] },
    packages,
  };
}

const privateUtils: PackageJson = {
  name: "@acme/utils",
  version: VERSION,
  private: true,
};

describe("VerificationReport workspace rules", () => {
  beforeEach(() => {
    recordExecSync({ branch: "main", tags: ["1.1.0"] });
  });

  describe("public packages depending on private siblings", () => {
    it.each(["dependencies", "peerDependencies"] as const)(
      "should fail when a public package has a private sibling in %s",
      (section) => {
        createFixture(
          workspace({
            "packages/utils": privateUtils,
            "packages/lib": {
              name: "@acme/lib",
              version: VERSION,
              [section]: { "@acme/utils": "workspace:*" },
            },
          }),
        );

        const report = verifyReleaseForCwd();

        expect(report.hasFailures()).toBe(true);
        expect(report.isPublishable()).toBe(false);
        expect(report.isReleaseable()).toBe(false);
        expect(report.getPrivateSiblingDependencies()).toEqual([
          {
            package: "@acme/lib",
            dependency: "@acme/utils",
            section,
            versionRange: "workspace:*",
          },
        ]);
        expect(report.toString()).toContain(
          "Public packages depend on private workspace packages:",
        );
        expect(report.toString()).toContain(
          `@acme/lib -> @acme/utils (${section}: workspace:*)`,
        );
        expect(JSON.parse(report.toJson()).privateSiblingDependencies).toEqual(
          report.getPrivateSiblingDependencies(),
        );
      },
    );

    it("should pass when a public package has a private sibling only in devDependencies", () => {
      createFixture(
        workspace({
          "packages/utils": privateUtils,
          "packages/lib": {
            name: "@acme/lib",
            version: VERSION,
            devDependencies: { "@acme/utils": "workspace:*" },
          },
        }),
      );

      const report = verifyReleaseForCwd();

      expect(report.getPrivateSiblingDependencies()).toEqual([]);
      expect(report.isPublishable()).toBe(true);
      expect(report.toString()).toBe("No problems found.");
    });

    it("should pass when private packages depend on private siblings", () => {
      createFixture(
        workspace({
          "packages/utils": privateUtils,
          "packages/app": {
            name: "@acme/app",
            version: VERSION,
            private: true,
            dependencies: { "@acme/utils": "workspace:*" },
            peerDependencies: { "@acme/utils": "workspace:*" },
          },
        }),
      );

      const report = verifyReleaseForCwd();

      expect(report.getPrivateSiblingDependencies()).toEqual([]);
      expect(report.isPublishable()).toBe(true);
    });

    it("should pass when a public package depends on a public sibling", () => {
      createFixture(
        workspace({
          "packages/core": { name: "@acme/core", version: VERSION },
          "packages/lib": {
            name: "@acme/lib",
            version: VERSION,
            dependencies: { "@acme/core": "workspace:*" },
          },
        }),
      );

      expect(verifyReleaseForCwd().isPublishable()).toBe(true);
    });

    it("should fail when a public root depends on a private sibling", () => {
      createFixture({
        root: {
          name: "root",
          version: VERSION,
          dependencies: { "@acme/utils": "workspace:*" },
        },
        workspace: { packages: ["packages/*"] },
        packages: { "packages/utils": privateUtils },
      });

      const report = verifyReleaseForCwd();

      expect(report.getPrivateSiblingDependencies()).toEqual([
        {
          package: "root",
          dependency: "@acme/utils",
          section: "dependencies",
          versionRange: "workspace:*",
        },
      ]);
      expect(report.isPublishable()).toBe(false);
    });

    it("should list every offending dependency", () => {
      createFixture(
        workspace({
          "packages/utils": privateUtils,
          "packages/fixtures": {
            name: "@acme/fixtures",
            version: VERSION,
            private: true,
          },
          "packages/lib": {
            name: "@acme/lib",
            version: VERSION,
            dependencies: { "@acme/utils": "workspace:*" },
            peerDependencies: { "@acme/fixtures": "workspace:^" },
          },
        }),
      );

      expect(
        verifyReleaseForCwd()
          .getPrivateSiblingDependencies()
          .map((d) => `${d.package} -> ${d.dependency}`),
      ).toEqual(["@acme/lib -> @acme/utils", "@acme/lib -> @acme/fixtures"]);
    });
  });

  describe("version drift", () => {
    it("should list packages whose version differs from the root as information", () => {
      createFixture(
        workspace({
          "packages/a": { name: "@acme/a", version: "0.0.0" },
          "packages/b": { name: "@acme/b", version: VERSION },
          "packages/c": { name: "@acme/c", version: "0.0.0", private: true },
          "packages/unnamed": {},
        }),
      );

      const report = verifyReleaseForCwd();

      expect(report.getVersionDrift()).toEqual([
        { package: "@acme/a", version: "0.0.0", rootVersion: VERSION },
        { package: "@acme/c", version: "0.0.0", rootVersion: VERSION },
        {
          package: "packages/unnamed",
          version: undefined,
          rootVersion: VERSION,
        },
      ]);
      expect(report.hasInformation()).toBe(true);
      expect(report.hasFailures()).toBe(false);
      expect(report.isPublishable()).toBe(true);
      expect(report.isReleaseable()).toBe(true);

      const message = report.toString();
      expect(message).toMatch(/^No problems found\.\n\nInformation: /);
      expect(message).toContain(`root version ${VERSION}`);
      expect(message).toContain("@acme/a - 0.0.0");
      expect(message).toContain("packages/unnamed - (none)");
      expect(message).not.toContain("@acme/b");
      expect(JSON.parse(report.toJson()).versionDrift).toHaveLength(3);
    });

    it("should report drift alongside failures", () => {
      createFixture(
        workspace({
          "packages/utils": {
            name: "@acme/utils",
            version: "0.0.0",
            private: true,
          },
          "packages/lib": {
            name: "@acme/lib",
            version: VERSION,
            dependencies: { "@acme/utils": "workspace:*" },
          },
        }),
      );

      const message = verifyReleaseForCwd().toString();

      expect(message).toMatch(
        /^Public packages depend on private workspace packages:[\s\S]*\n\nInformation: /,
      );
      expect(message).not.toContain("No problems found.");
    });

    it("should report nothing when all packages carry the root version", () => {
      createFixture(
        workspace({ "packages/a": { name: "@acme/a", version: VERSION } }),
      );

      const report = verifyReleaseForCwd();

      expect(report.getVersionDrift()).toEqual([]);
      expect(report.hasInformation()).toBe(false);
    });
  });

  describe("single-package repository", () => {
    it("should report neither failures nor information", () => {
      createFixture({
        root: {
          name: "single",
          version: VERSION,
          dependencies: { single: "^1.0.0" },
        },
      });

      const report = verifyReleaseForCwd();

      expect(report.getPrivateSiblingDependencies()).toEqual([]);
      expect(report.getVersionDrift()).toEqual([]);
      expect(report.isPublishable()).toBe(true);
      expect(report.toString()).toBe("No problems found.");
    });

    it("should ignore a settings-only pnpm-workspace.yaml", () => {
      createFixture({
        root: { name: "single", version: VERSION, private: true },
        workspace: "catalog:\n  foo: ^1.0.0\n",
        packages: { "packages/a": { name: "a", version: "0.0.0" } },
      });

      const report = verifyReleaseForCwd();

      expect(report.getVersionDrift()).toEqual([]);
      expect(report.isPublishable()).toBe(true);
    });
  });

  describe("verifyRelease command", () => {
    let log: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      log = vi.spyOn(console, "log").mockImplementation(() => {});
      exit.mockReset();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should print drift without failing", () => {
      createFixture(
        workspace({ "packages/a": { name: "@acme/a", version: "0.0.0" } }),
      );
      verifyReleaseCommand("pnpm");

      expect(exit).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("@acme/a - 0.0.0"),
      );
    });

    it("should exit with 1 when a public package depends on a private sibling", () => {
      createFixture(
        workspace({
          "packages/utils": privateUtils,
          "packages/lib": {
            name: "@acme/lib",
            version: VERSION,
            dependencies: { "@acme/utils": "workspace:*" },
          },
        }),
      );
      verifyReleaseCommand("pnpm");

      expect(exit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("@acme/lib -> @acme/utils"),
      );
    });
  });
});
