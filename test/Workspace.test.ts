import { symlinkSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../src/Project.js";
import { Workspace } from "../src/Workspace.js";
import * as index from "../src/index.js";
import {
  createFixture,
  type Fixture,
  recordExecSync,
} from "./support/fixtureHarness.js";

vi.mock("node:child_process");

const root = { name: "root", version: "1.2.0-SNAPSHOT", private: true };

/** package directories relative to the fixture root, root first as "." */
function packageDirs(fixture: Fixture, workspace: Workspace): string[] {
  return workspace
    .getPackages()
    .map((pkg) => path.relative(fixture.root, pkg.getBasePath()) || ".");
}

describe("Workspace", () => {
  beforeEach(() => {
    recordExecSync({ branch: "main" });
  });

  it("is exported from the package index", () => {
    expect(index.Workspace).toBe(Workspace);
  });

  describe("with a pnpm-workspace.yaml declaring packages", () => {
    it("should yield exactly the packages pnpm sees, honouring negations", () => {
      const fixture = createFixture({
        root,
        workspace: {
          packages: ["packages/*", "!packages/excluded", "apps/**"],
        },
        packages: {
          "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" },
          "packages/b": { name: "b", version: "1.2.0-SNAPSHOT" },
          "packages/excluded": { name: "excluded", version: "1.0.0" },
          "packages/.hidden": { name: "hidden", version: "1.0.0" },
          "packages/nested/deep": { name: "deep", version: "1.0.0" },
          "packages/node_modules/dep": { name: "dep", version: "1.0.0" },
          "apps/web": { name: "web", version: "1.2.0-SNAPSHOT" },
          "apps/web/node_modules/dep": { name: "dep", version: "1.0.0" },
          "tools/x": { name: "x", version: "1.0.0" },
        },
        files: { "packages/empty/README.md": "no package here\n" },
      });

      const workspace = Workspace.forCwd();

      expect(workspace.isMonorepo()).toBe(true);
      expect(packageDirs(fixture, workspace)).toEqual([
        ".",
        "apps/web",
        "packages/a",
        "packages/b",
      ]);
    });

    it("should apply negations regardless of their position", () => {
      const fixture = createFixture({
        root,
        workspace: {
          packages: ["!packages/b", "./packages/*/", "!**/test/**"],
        },
        packages: {
          "packages/a": { name: "a" },
          "packages/b": { name: "b" },
          "packages/test": { name: "test" },
        },
      });

      expect(packageDirs(fixture, Workspace.forCwd())).toEqual([
        ".",
        "packages/a",
      ]);
    });

    it("should not follow symbolically linked directories", () => {
      const fixture = createFixture({
        root,
        workspace: { packages: ["packages/*"] },
        packages: {
          "packages/a": { name: "a" },
          "tools/t": { name: "t" },
        },
      });
      symlinkSync(fixture.path("tools/t"), fixture.path("packages/linked"));

      expect(packageDirs(fixture, Workspace.forCwd())).toEqual([
        ".",
        "packages/a",
      ]);
    });

    it("should read name, version, private flag and dependency sections", () => {
      createFixture({
        root,
        workspace: { packages: ["packages/*"] },
        packages: {
          "packages/a": {
            name: "@scope/a",
            version: "1.2.0-SNAPSHOT",
            dependencies: { "@scope/b": "workspace:*" },
            devDependencies: { vitest: "^5.0.0" },
          },
          "packages/b": { name: "@scope/b", private: true },
        },
      });

      const [rootPackage, a, b] = Workspace.forCwd().getPackages();

      expect(rootPackage?.isRoot()).toBe(true);
      expect(rootPackage?.getName()).toBe("root");
      expect(rootPackage?.isPrivate()).toBe(true);
      expect(a?.isRoot()).toBe(false);
      expect(a?.getName()).toBe("@scope/a");
      expect(a?.getVersion()).toBe("1.2.0-SNAPSHOT");
      expect(a?.isPrivate()).toBe(false);
      expect(a?.getDependencies("dependencies")).toEqual({
        "@scope/b": "workspace:*",
      });
      expect(a?.getDependencies("devDependencies")).toEqual({
        vitest: "^5.0.0",
      });
      expect(a?.getDependencies("peerDependencies")).toEqual({});
      expect(a?.getPackagePath()).toBe(
        path.join(process.cwd(), "packages/a/package.json"),
      );
      expect(b?.getVersion()).toBeUndefined();
      expect(b?.isPrivate()).toBe(true);
    });

    it("should use the given root project as root", () => {
      createFixture({ root, workspace: { packages: ["packages/*"] } });
      const project = Project.forCwd();

      const workspace = Workspace.forProject(project);

      expect(workspace.getRoot()).toBe(project);
      expect(workspace.getPackages()).toHaveLength(1);
    });

    it("should treat an empty packages list as a workspace with only the root", () => {
      createFixture({ root, workspace: "packages: []\n" });

      const workspace = Workspace.forCwd();

      expect(workspace.isMonorepo()).toBe(true);
      expect(workspace.getPackages()).toHaveLength(1);
    });

    it.each(["packages: packages/*\n", 'packages: ["packages/*", ""]\n'])(
      "should reject packages that is not a list of globs: %j",
      (yaml) => {
        createFixture({ root, workspace: yaml });

        expect(() => Workspace.forCwd()).toThrow(
          /"packages" in ".*pnpm-workspace\.yaml" must be a list of glob patterns/,
        );
      },
    );

    it("should reject workspace packages without a package.json", () => {
      createFixture({
        root,
        workspace: { packages: ["packages/*"] },
        files: { "packages/a/package.yaml": "name: a\n" },
      });

      expect(() => Workspace.forCwd()).toThrow(
        'Workspace package "packages/a" has no package.json',
      );
    });
  });

  describe("without a workspace", () => {
    it("should treat a settings-only pnpm-workspace.yaml as a single-package repo", () => {
      createFixture({
        root: { name: "lib", version: "1.0.0-SNAPSHOT" },
        workspace: "allowBuilds:\n  esbuild: true\n",
        packages: { "packages/a": { name: "a" } },
      });

      const workspace = Workspace.forCwd({ packageManager: "npm" });

      expect(workspace.isMonorepo()).toBe(false);
      expect(workspace.getPackages().map((pkg) => pkg.getName())).toEqual([
        "lib",
      ]);
    });

    it("should model a repo without pnpm-workspace.yaml as the root only", () => {
      createFixture({ root: { name: "lib", version: "1.0.0-SNAPSHOT" } });

      const workspace = Workspace.forCwd({ packageManager: "yarn" });

      expect(workspace.isMonorepo()).toBe(false);
      expect(workspace.getRoot().getName()).toBe("lib");
      expect(workspace.getPackages()).toHaveLength(1);
      expect(workspace.getPackages()[0]?.isRoot()).toBe(true);
    });
  });

  describe("with a workspaces field in the root package.json", () => {
    it("should be detected as a workspace", () => {
      const fixture = createFixture({
        root: { ...root, workspaces: ["packages/*"] },
        packages: { "packages/a": { name: "a" } },
      });

      const workspace = Workspace.forCwd();

      expect(workspace.isMonorepo()).toBe(true);
      expect(packageDirs(fixture, workspace)).toEqual([".", "packages/a"]);
    });

    it.each(["npm", "yarn"] as const)(
      "should fail with %s because monorepo mode requires pnpm",
      (packageManager) => {
        createFixture({ root: { ...root, workspaces: ["packages/*"] } });

        expect(() => Workspace.forCwd({ packageManager })).toThrow(
          `Monorepo mode currently requires pnpm, but package manager "${packageManager}"`,
        );
      },
    );

    it("should fail with pnpm because pnpm ignores the workspaces field", () => {
      createFixture({
        root: { ...root, workspaces: { packages: ["packages/*"] } },
      });

      expect(() => Workspace.forCwd({ packageManager: "pnpm" })).toThrow(
        /requires a pnpm workspace.*"workspaces" field.*pnpm-workspace\.yaml/,
      );
    });
  });

  describe("package manager guard", () => {
    it.each(["npm", "yarn"] as const)(
      "should reject %s for a pnpm workspace",
      (packageManager) => {
        createFixture({ root, workspace: { packages: ["packages/*"] } });

        expect(() => Workspace.forCwd({ packageManager })).toThrow(
          /Monorepo mode currently requires pnpm.*--package-manager pnpm/,
        );
        expect(() =>
          Workspace.forProject(Project.forCwd(), { packageManager }),
        ).toThrow("Monorepo mode currently requires pnpm");
      },
    );

    it("should accept pnpm for a pnpm workspace", () => {
      createFixture({ root, workspace: { packages: ["packages/*"] } });

      expect(Workspace.forCwd({ packageManager: "pnpm" }).isMonorepo()).toBe(
        true,
      );
    });
  });

  describe("run-from-root guard", () => {
    const workspaceFixture = (): Fixture =>
      createFixture({
        root,
        workspace: { packages: ["packages/*"] },
        packages: { "packages/a": { name: "a", version: "1.2.0-SNAPSHOT" } },
      });

    it("should fail when run from a package directory", () => {
      const fixture = workspaceFixture();
      process.chdir(fixture.path("packages/a"));

      expect(() => Workspace.forCwd()).toThrow(
        `is inside the workspace at "${fixture.root}". js-project must be run from the workspace root`,
      );
    });

    it("should fail when run from a directory without package.json", () => {
      const fixture = workspaceFixture();
      process.chdir(fixture.path("packages"));

      expect(() => Workspace.forCwd()).toThrow(
        "js-project must be run from the workspace root",
      );
    });

    it("should fail for a root project that is a workspace package", () => {
      const fixture = workspaceFixture();
      process.chdir(fixture.path("packages/a"));
      const project = Project.forCwd();
      process.chdir(fixture.root);

      expect(() => Workspace.forProject(project)).toThrow(
        "js-project must be run from the workspace root",
      );
    });

    it("should fail inside a workspace declared by a workspaces field", () => {
      const fixture = createFixture({
        root: { ...root, workspaces: ["packages/*"] },
        packages: { "packages/a": { name: "a" } },
      });
      process.chdir(fixture.path("packages/a"));

      expect(() => Workspace.forCwd()).toThrow(
        "js-project must be run from the workspace root",
      );
    });

    it("should ignore a parent with a settings-only pnpm-workspace.yaml", () => {
      const fixture = createFixture({
        root,
        workspace: "allowBuilds:\n  esbuild: true\n",
        packages: { lib: { name: "lib", version: "1.0.0-SNAPSHOT" } },
      });
      process.chdir(fixture.path("lib"));

      expect(Workspace.forCwd().getRoot().getName()).toBe("lib");
    });

    it("should not look beyond the root of the git repository", () => {
      const fixture = createFixture({
        root,
        workspace: { packages: ["repos/*"] },
        packages: { "repos/lib": { name: "lib", version: "1.0.0-SNAPSHOT" } },
        files: { "repos/lib/.git": "gitdir: /elsewhere\n" },
      });
      process.chdir(fixture.path("repos/lib"));

      expect(Workspace.forCwd().getRoot().getName()).toBe("lib");
    });
  });
});
