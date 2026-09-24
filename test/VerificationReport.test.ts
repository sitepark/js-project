import { exit } from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildProvider } from "../src/BuildProvider.js";
import { NodePublisherProvider } from "../src/NodePublisherProvider.js";
import type { PackageJson } from "../src/PackageJson.js";
import { Project } from "../src/Project.js";
import { ReleaseManagementFactory } from "../src/ReleaseManagementFactory.js";
import { VerificationReport } from "../src/VerificationReport.js";
import { Workspace } from "../src/Workspace.js";
import { verifyReleaseCommand } from "../src/commands/verifyRelease.js";
import * as index from "../src/index.js";
import {
  createFixture,
  type FixtureDefinition,
  recordExecSync,
} from "./support/fixtureHarness.js";

vi.mock("node:child_process");
vi.mock("node:process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:process")>()),
  exit: vi.fn(),
}));

const SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** `verifyRelease()` through the public API used by the CLI and js-ies-module */
function verifyRelease(): VerificationReport {
  const project = Project.forCwd();
  return ReleaseManagementFactory.forCwd(
    project,
    new BuildProvider(project, "pnpm"),
    new NodePublisherProvider(project, "pnpm"),
  ).verifyRelease();
}

function verifyFixture(definition: FixtureDefinition): VerificationReport {
  createFixture(definition);
  return verifyRelease();
}

function singlePackage(pkg: Partial<PackageJson> = {}): FixtureDefinition {
  return { root: { name: "single", version: "1.0.0-SNAPSHOT", ...pkg } };
}

/** a workspace with a private root and the packages `a` (public) and `b` */
function monorepo(
  packages: { a?: Partial<PackageJson>; b?: Partial<PackageJson> } = {},
  workspace: FixtureDefinition["workspace"] = { packages: ["packages/*"] },
): FixtureDefinition {
  return {
    root: { name: "root", version: "1.0.0-SNAPSHOT", private: true },
    workspace,
    packages: {
      "packages/a": { name: "a", version: "1.0.0-SNAPSHOT", ...packages.a },
      "packages/b": {
        name: "b",
        version: "1.0.0-SNAPSHOT",
        private: true,
        ...packages.b,
      },
    },
  };
}

describe("VerificationReport", () => {
  beforeEach(() => {
    recordExecSync({ branch: "main" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is exported from the package index", () => {
    expect(index.VerificationReport).toBe(VerificationReport);
  });

  describe("in a single-package repository", () => {
    it("should report no problems without SNAPSHOT dependencies", () => {
      const report = verifyFixture(
        singlePackage({
          dependencies: { lodash: "^4.17.21" },
          devDependencies: { vitest: "^5.0.0" },
        }),
      );

      expect(report.hasSnapshotDependencies()).toBe(false);
      expect(report.hasFailures()).toBe(false);
      expect(report.isPublishable()).toBe(true);
      expect(report.isReleaseable()).toBe(true);
      expect(report.toString()).toBe("No problems found.");
    });

    it.each(SECTIONS)(
      "should fail for a SNAPSHOT dependency in %s",
      (section) => {
        const report = verifyFixture(
          singlePackage({ [section]: { "@sitepark/test": "^1.0.0-SNAPSHOT" } }),
        );

        expect(report.hasSnapshotDependencies()).toBe(true);
        expect(report.hasFailures()).toBe(true);
        expect(report.isPublishable()).toBe(false);
        expect(report.isReleaseable()).toBe(false);
        expect(report.getSnapshotDependencies()).toEqual([
          {
            packageName: "single",
            packagePath: "package.json",
            section,
            name: "@sitepark/test",
            versionRange: "^1.0.0-SNAPSHOT",
          },
        ]);
      },
    );

    it("should keep the report format without package headers", () => {
      const report = verifyFixture(
        singlePackage({
          dependencies: { "@sitepark/test": "^1.0.0-SNAPSHOT", ok: "^1.0.0" },
          optionalDependencies: { "@sitepark/opt": "2.0.0-SNAPSHOT" },
        }),
      );

      expect(report.toString()).toBe(
        "Snapshot-Version detected:\n\n" +
          "dependencies:\n" +
          "\t@sitepark/test - ^1.0.0-SNAPSHOT\n" +
          "optionalDependencies:\n" +
          "\t@sitepark/opt - 2.0.0-SNAPSHOT",
      );
    });

    it("should group SNAPSHOT dependencies by section", () => {
      const report = verifyFixture(
        singlePackage({
          dependencies: { dep1: "^1.0.0-SNAPSHOT" },
          devDependencies: { devDep1: "^2.0.0-SNAPSHOT" },
          peerDependencies: { peerDep1: "^3.0.0-SNAPSHOT" },
          optionalDependencies: { optDep1: "^4.0.0-SNAPSHOT" },
        }),
      );

      expect(report.generateDependecyInfo()).toEqual({
        dependencies: [{ name: "dep1", versionRange: "^1.0.0-SNAPSHOT" }],
        devDependencies: [{ name: "devDep1", versionRange: "^2.0.0-SNAPSHOT" }],
        peerDependencies: [
          { name: "peerDep1", versionRange: "^3.0.0-SNAPSHOT" },
        ],
        optionalDependencies: [
          { name: "optDep1", versionRange: "^4.0.0-SNAPSHOT" },
        ],
      });
    });

    it("should return JSON with the dependency info and flags", () => {
      const report = verifyFixture(
        singlePackage({
          dependencies: { "@sitepark/test": "^1.0.0-SNAPSHOT" },
        }),
      );

      const parsed = JSON.parse(report.toJson());

      expect(parsed.dependencies).toEqual([
        { name: "@sitepark/test", versionRange: "^1.0.0-SNAPSHOT" },
      ]);
      expect(parsed.devDependencies).toEqual([]);
      expect(parsed.peerDependencies).toEqual([]);
      expect(parsed.optionalDependencies).toEqual([]);
      expect(parsed.snapshotDependencies).toEqual(
        report.getSnapshotDependencies(),
      );
      expect(parsed.isPublishable).toBe(false);
      expect(parsed.isReleasable).toBe(false);
    });

    it("should resolve catalog specifiers of a settings-only pnpm-workspace.yaml", () => {
      const report = verifyFixture({
        ...singlePackage({ dependencies: { ext: "catalog:" } }),
        workspace: "catalog:\n  ext: 1.0.0-SNAPSHOT\n",
      });

      expect(report.getSnapshotDependencies()).toEqual([
        expect.objectContaining({
          name: "ext",
          versionRange: "catalog:",
          catalogVersionRange: "1.0.0-SNAPSHOT",
        }),
      ]);
    });
  });

  describe("in a monorepo", () => {
    it("should report no problems without external SNAPSHOT dependencies", () => {
      const report = verifyFixture(
        monorepo({
          a: { dependencies: { lodash: "^4.17.21", b: "workspace:*" } },
        }),
      );

      expect(report.hasFailures()).toBe(false);
      expect(report.isPublishable()).toBe(true);
      expect(report.toString()).toBe("No problems found.");
    });

    it.each(SECTIONS)(
      "should report a SNAPSHOT dependency in %s of any package, naming the package",
      (section) => {
        const report = verifyFixture(
          monorepo({ b: { [section]: { ext: "^2.0.0-SNAPSHOT" } } }),
        );

        expect(report.isPublishable()).toBe(false);
        expect(report.isReleaseable()).toBe(false);
        expect(report.getSnapshotDependencies()).toEqual([
          {
            packageName: "b",
            packagePath: "packages/b/package.json",
            section,
            name: "ext",
            versionRange: "^2.0.0-SNAPSHOT",
          },
        ]);
      },
    );

    it("should check the root package too", () => {
      const fixture = monorepo();
      fixture.root.devDependencies = { tooling: "1.0.0-SNAPSHOT" };

      const report = verifyFixture(fixture);

      expect(report.getSnapshotDependencies()).toEqual([
        expect.objectContaining({
          packageName: "root",
          packagePath: "package.json",
          section: "devDependencies",
          name: "tooling",
        }),
      ]);
    });

    it.each([
      "workspace:*",
      "workspace:^",
      "workspace:~",
      "workspace:1.0.0-SNAPSHOT",
    ])("should never report the workspace specifier %s", (specifier) => {
      const report = verifyFixture(
        monorepo({
          a: {
            dependencies: { b: specifier },
            devDependencies: { b: specifier },
            peerDependencies: { b: specifier },
            optionalDependencies: { b: specifier },
          },
        }),
      );

      expect(report.hasSnapshotDependencies()).toBe(false);
      expect(report.isPublishable()).toBe(true);
    });

    it("should report SNAPSHOT entries of the default and named catalogs", () => {
      const report = verifyFixture(
        monorepo(
          {
            a: {
              dependencies: {
                "@scope/snap": "catalog:",
                stable: "catalog:",
                other: "catalog:default",
              },
            },
            b: {
              devDependencies: { legacy: "catalog:old", modern: "catalog:new" },
            },
          },
          {
            packages: ["packages/*"],
            catalog: {
              "@scope/snap": "^1.0.0-SNAPSHOT",
              stable: "^1.0.0",
              other: "3.0.0-SNAPSHOT",
            },
            catalogs: {
              old: { legacy: "0.9.0-SNAPSHOT" },
              new: { modern: "^2.0.0" },
            },
          },
        ),
      );

      expect(
        report
          .getSnapshotDependencies()
          .map((d) => [d.packageName, d.name, d.catalogVersionRange]),
      ).toEqual([
        ["a", "@scope/snap", "^1.0.0-SNAPSHOT"],
        ["a", "other", "3.0.0-SNAPSHOT"],
        ["b", "legacy", "0.9.0-SNAPSHOT"],
      ]);
      expect(report.generateDependecyInfo().devDependencies).toEqual([
        { name: "legacy", versionRange: "0.9.0-SNAPSHOT" },
      ]);
      expect(report.isPublishable()).toBe(false);
    });

    it("should resolve the default catalog declared as catalogs.default", () => {
      const report = verifyFixture(
        monorepo(
          { a: { dependencies: { ext: "catalog:" } } },
          {
            packages: ["packages/*"],
            catalogs: { default: { ext: "1.0.0-SNAPSHOT" } },
          },
        ),
      );

      expect(report.hasSnapshotDependencies()).toBe(true);
    });

    it("should not report non-SNAPSHOT or unresolvable catalog entries", () => {
      const report = verifyFixture(
        monorepo(
          {
            a: {
              dependencies: {
                stable: "catalog:",
                missing: "catalog:",
                unknown: "catalog:nope",
              },
            },
          },
          { packages: ["packages/*"], catalog: { stable: "^1.0.0" } },
        ),
      );

      expect(report.hasSnapshotDependencies()).toBe(false);
      expect(report.isPublishable()).toBe(true);
    });

    it("should name the offending package and dependency in the report", () => {
      const report = verifyFixture(
        monorepo(
          {
            a: {
              dependencies: { ext: "^2.0.0-SNAPSHOT", b: "workspace:*" },
              peerDependencies: { peer: "catalog:" },
            },
            b: { optionalDependencies: { opt: "1.0.0-SNAPSHOT" } },
          },
          { packages: ["packages/*"], catalog: { peer: "^3.0.0-SNAPSHOT" } },
        ),
      );

      expect(report.toString()).toBe(
        "Snapshot-Version detected:\n\n" +
          "a (packages/a/package.json):\n" +
          "\tdependencies:\n" +
          "\t\text - ^2.0.0-SNAPSHOT\n" +
          "\tpeerDependencies:\n" +
          "\t\tpeer - ^3.0.0-SNAPSHOT (catalog:)\n" +
          "b (packages/b/package.json):\n" +
          "\toptionalDependencies:\n" +
          "\t\topt - 1.0.0-SNAPSHOT",
      );
    });

    it("should accept an explicitly given workspace", () => {
      createFixture(monorepo({ a: { dependencies: { ext: "1.0-SNAPSHOT" } } }));
      const workspace = Workspace.forCwd();

      const report = new VerificationReport(workspace.getRoot(), workspace);

      expect(report.getSnapshotDependencies()).toHaveLength(1);
    });
  });

  describe("verifyRelease command", () => {
    let log: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.mocked(exit).mockClear();
      log = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("should fail for a SNAPSHOT dependency in a workspace package", () => {
      createFixture(
        monorepo({ b: { devDependencies: { ext: "1.0.0-SNAPSHOT" } } }),
      );

      verifyReleaseCommand("pnpm");

      expect(exit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("b (packages/b"),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("ext - 1.0.0-SNAPSHOT"),
      );
    });

    it("should pass without external SNAPSHOT dependencies", () => {
      createFixture(monorepo({ a: { dependencies: { b: "workspace:^" } } }));

      verifyReleaseCommand("pnpm");

      expect(exit).not.toHaveBeenCalled();
    });
  });
});
