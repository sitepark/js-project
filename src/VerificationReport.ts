import path from "node:path";
import type { DependencyInfo, Project } from "./Project.js";
import { Workspace, type WorkspacePackage } from "./Workspace.js";

export interface DependencyReport {
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  peerDependencies: DependencyInfo[];
}

/** Dependency sections whose private siblings break a published package. */
export type RuntimeDependencySection = "dependencies" | "peerDependencies";

/**
 * A public (non-private) workspace package that lists a private sibling in a
 * runtime dependency section. Published, it would point at a version that
 * doesn't exist on any registry.
 */
export interface PrivateSiblingDependency {
  /** name (or path relative to the root) of the public package */
  package: string;
  /** name of the private sibling */
  dependency: string;
  section: RuntimeDependencySection;
  versionRange: string;
}

/** A workspace package whose version differs from the root version. */
export interface VersionDrift {
  /** name (or path relative to the root) of the package */
  package: string;
  /** version of the package, `undefined` if it has none */
  version: string | undefined;
  rootVersion: string | undefined;
}

export class VerificationReport {
  private readonly project: Project;
  private workspace: Workspace | undefined;

  /**
   * @param project root package of the project
   * @param workspace workspace rooted at `project`; derived from `project`
   *   when omitted
   */
  constructor(project: Project, workspace?: Workspace) {
    this.project = project;
    this.workspace = workspace;
  }

  private getWorkspace(): Workspace {
    this.workspace ??= Workspace.forProject(this.project);
    return this.workspace;
  }

  hasSnapshotDependencies(): boolean {
    return Object.values(this.generateDependecyInfo()).some(
      (deps) => deps.length > 0,
    );
  }

  /**
   * Indicates whether any verification check failed.
   */
  hasFailures(): boolean {
    return (
      this.hasSnapshotDependencies() || this.hasPrivateSiblingDependencies()
    );
  }

  /**
   * Indicates whether the report contains informational items that don't
   * fail the verification (e.g. version drift).
   */
  hasInformation(): boolean {
    return this.hasVersionDrift();
  }

  isReleaseable(): boolean {
    return this.isPublishable();
  }

  /**
   * Returns `false` whenever the report contains failures
   * (e.g. SNAPSHOT dependencies), `true` otherwise.
   */
  isPublishable(): boolean {
    return !this.hasFailures();
  }

  generateDependecyInfo(): DependencyReport {
    return {
      dependencies: this.project.getSnapshotDependencies("dependencies"),
      devDependencies: this.project.getSnapshotDependencies("devDependencies"),
      peerDependencies:
        this.project.getSnapshotDependencies("peerDependencies"),
    };
  }

  // -------------------------------------------------------------------------
  // Check: public packages depending on private siblings (failure)
  // -------------------------------------------------------------------------

  hasPrivateSiblingDependencies(): boolean {
    return this.getPrivateSiblingDependencies().length > 0;
  }

  /**
   * Lists every non-private workspace package that has a private sibling in
   * `dependencies` or `peerDependencies`. Private siblings in
   * `devDependencies` are allowed, private packages are not checked.
   */
  getPrivateSiblingDependencies(): PrivateSiblingDependency[] {
    const packages = this.getWorkspace().getPackages();
    const privateSiblings = new Set(
      packages
        .filter((pkg) => pkg.isPrivate())
        .map((pkg) => pkg.getName())
        .filter((name): name is string => name !== undefined),
    );
    const sections: RuntimeDependencySection[] = [
      "dependencies",
      "peerDependencies",
    ];

    const result: PrivateSiblingDependency[] = [];
    for (const pkg of packages.filter((p) => !p.isPrivate())) {
      for (const section of sections) {
        for (const [dependency, versionRange] of Object.entries(
          pkg.getDependencies(section),
        )) {
          if (privateSiblings.has(dependency) && dependency !== pkg.getName()) {
            result.push({
              package: this.displayName(pkg),
              dependency,
              section,
              versionRange,
            });
          }
        }
      }
    }
    return result;
  }

  private privateSiblingSection(): string | undefined {
    const dependencies = this.getPrivateSiblingDependencies();
    if (dependencies.length === 0) {
      return undefined;
    }
    const lines = dependencies.map(
      (dep) =>
        `\t${dep.package} -> ${dep.dependency} (${dep.section}: ${dep.versionRange})`,
    );
    return (
      "Public packages depend on private workspace packages:\n\n" +
      `${lines.join("\n")}\n\n` +
      "Make the dependency public, or move it to devDependencies."
    );
  }

  // -------------------------------------------------------------------------
  // Information: version drift between root and workspace packages
  // -------------------------------------------------------------------------

  hasVersionDrift(): boolean {
    return this.getVersionDrift().length > 0;
  }

  /**
   * Lists the workspace packages whose version differs from the root
   * version. This is informational only: `release`, `startHotfix` and
   * `publish` write the root version into every package.
   */
  getVersionDrift(): VersionDrift[] {
    const packages = this.getWorkspace().getPackages();
    const rootVersion = packages.find((pkg) => pkg.isRoot())?.getVersion();
    return packages
      .filter((pkg) => !pkg.isRoot() && pkg.getVersion() !== rootVersion)
      .map((pkg) => ({
        package: this.displayName(pkg),
        version: pkg.getVersion(),
        rootVersion,
      }));
  }

  private versionDriftSection(): string | undefined {
    const drift = this.getVersionDrift();
    if (drift.length === 0) {
      return undefined;
    }
    const rootVersion = drift[0]?.rootVersion ?? "(none)";
    const lines = drift.map(
      (item) => `\t${item.package} - ${item.version ?? "(none)"}`,
    );
    return (
      `Information: packages with a version other than the root version ${rootVersion}:\n\n` +
      `${lines.join("\n")}\n\n` +
      "release, startHotfix and publish set every package to the root version."
    );
  }

  /** package name, or the package path relative to the root if unnamed */
  private displayName(pkg: WorkspacePackage): string {
    return (
      pkg.getName() ??
      path.relative(
        this.getWorkspace().getRoot().getBasePath(),
        pkg.getBasePath(),
      )
    );
  }

  toJson(): string {
    return JSON.stringify(
      {
        ...this.generateDependecyInfo(),
        privateSiblingDependencies: this.getPrivateSiblingDependencies(),
        versionDrift: this.getVersionDrift(),
        isPublishable: this.isPublishable(),
        isReleasable: this.isReleaseable(),
      },
      null,
      2,
    );
  }

  toString(): string {
    const failures = [
      this.snapshotSection(),
      this.privateSiblingSection(),
    ].filter((section): section is string => section !== undefined);
    const information = [this.versionDriftSection()].filter(
      (section): section is string => section !== undefined,
    );
    const sections = failures.length > 0 ? failures : ["No problems found."];
    return [...sections, ...information].join("\n\n");
  }

  // -------------------------------------------------------------------------
  // Check: SNAPSHOT dependencies (failure)
  // -------------------------------------------------------------------------

  private snapshotSection(): string | undefined {
    if (this.hasSnapshotDependencies()) {
      const depReport = Object.entries(this.generateDependecyInfo())
        .filter(([type, snapshots]) => snapshots.length > 0)
        .map(([type, snapshots]) => {
          const depsReport = snapshots
            .map((snap: DependencyInfo) => {
              return `\t${snap.name} - ${snap.versionRange}`;
            })
            .join("\n");
          return `${type}:\n${depsReport}`;
        })
        .join("\n");

      return `Snapshot-Version detected:\n\n${depReport}`;
    }

    return undefined;
  }
}
