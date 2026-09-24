import path from "node:path";
import type { DependencySection } from "./PackageJson.js";
import type { DependencyInfo, Project } from "./Project.js";
import { Workspace, type WorkspacePackage } from "./Workspace.js";

export interface DependencyReport {
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  peerDependencies: DependencyInfo[];
  optionalDependencies: DependencyInfo[];
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

/**
 * An external dependency with a `-SNAPSHOT` version, declared by a package of
 * the workspace.
 */
export interface SnapshotDependency {
  /** name of the declaring package (its directory if it has no name) */
  packageName: string;
  /** path of the declaring `package.json`, relative to the workspace root */
  packagePath: string;
  /** dependency section declaring the dependency */
  section: DependencySection;
  /** name of the dependency */
  name: string;
  /** specifier as declared in the `package.json` (e.g. `catalog:`) */
  versionRange: string;
  /** SNAPSHOT specifier from the catalog, if `versionRange` is `catalog:...` */
  catalogVersionRange?: string;
}

/** dependency sections checked for SNAPSHOT dependencies, in report order */
const SNAPSHOT_SECTIONS: readonly DependencySection[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/**
 * Result of the release verification (`verifyRelease`) of a project and, in
 * a monorepo, all its workspace packages.
 */
export class VerificationReport {
  private readonly project: Project;

  private workspace: Workspace | undefined;

  private snapshotDependencies: SnapshotDependency[] | undefined;

  /**
   * @param project the (root) project to verify
   * @param workspace workspace of the project; derived from the project with
   *   {@link Workspace.forProject} if omitted
   */
  constructor(project: Project, workspace?: Workspace) {
    this.project = project;
    this.workspace = workspace;
  }

  private getWorkspace(): Workspace {
    this.workspace ??= Workspace.forProject(this.project);
    return this.workspace;
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

  toJson(): string {
    return JSON.stringify(
      {
        ...this.generateDependecyInfo(),
        snapshotDependencies: this.getSnapshotDependencies(),
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
      this.formatSnapshotDependencies(),
      this.privateSiblingSection(),
    ].filter((section): section is string => section !== undefined);
    const information = [this.versionDriftSection()].filter(
      (section): section is string => section !== undefined,
    );
    const sections = failures.length > 0 ? failures : ["No problems found."];
    return [...sections, ...information].join("\n\n");
  }

  // -------------------------------------------------------------------------
  // Check: external SNAPSHOT dependencies (failure)
  // -------------------------------------------------------------------------

  /**
   * `true` if any package of the workspace has an external `-SNAPSHOT`
   * dependency.
   */
  hasSnapshotDependencies(): boolean {
    return this.getSnapshotDependencies().length > 0;
  }

  /**
   * External `-SNAPSHOT` dependencies of the root and every workspace package
   * in the sections `dependencies`, `devDependencies`, `peerDependencies` and
   * `optionalDependencies`.
   *
   * `workspace:` specifiers are ignored, because workspace siblings share the
   * version of the root. `catalog:` and `catalog:<name>` specifiers are
   * resolved against the catalogs of `pnpm-workspace.yaml` first; a catalog
   * reference that can't be resolved is ignored (pnpm fails to install it
   * anyway).
   */
  getSnapshotDependencies(): SnapshotDependency[] {
    if (this.snapshotDependencies === undefined) {
      const workspace = this.getWorkspace();
      const rootDir = workspace.getRoot().getBasePath();
      this.snapshotDependencies = workspace
        .getPackages()
        .flatMap((pkg) => findSnapshotDependencies(workspace, rootDir, pkg));
    }
    return [...this.snapshotDependencies];
  }

  /**
   * The SNAPSHOT dependencies of all packages grouped by dependency section.
   * For `catalog:` specifiers, `versionRange` is the catalog entry.
   */
  generateDependecyInfo(): DependencyReport {
    const report: DependencyReport = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
      optionalDependencies: [],
    };
    for (const dependency of this.getSnapshotDependencies()) {
      report[dependency.section].push({
        name: dependency.name,
        versionRange: dependency.catalogVersionRange ?? dependency.versionRange,
      });
    }
    return report;
  }

  private formatSnapshotDependencies(): string | undefined {
    const dependencies = this.getSnapshotDependencies();
    if (dependencies.length === 0) {
      return undefined;
    }
    // Single-package repositories keep the report format without package
    // headers; monorepos group the findings by package.
    const monorepo = this.getWorkspace().isMonorepo();
    const indent = monorepo ? "\t" : "";
    const byPackage = groupBy(dependencies, (d) => d.packagePath);
    const report = [...byPackage.values()]
      .map((packageDependencies) => {
        const bySection = groupBy(packageDependencies, (d) => d.section);
        const sections = SNAPSHOT_SECTIONS.filter((s) => bySection.has(s)).map(
          (section) => {
            const lines = (bySection.get(section) ?? []).map(
              (d) => `${indent}\t${d.name} - ${formatSpecifier(d)}`,
            );
            return [`${indent}${section}:`, ...lines].join("\n");
          },
        );
        if (!monorepo) {
          return sections.join("\n");
        }
        const { packageName, packagePath } = packageDependencies[0]!;
        return [`${packageName} (${packagePath}):`, ...sections].join("\n");
      })
      .join("\n");

    return `Snapshot-Version detected:\n\n${report}`;
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
}

function findSnapshotDependencies(
  workspace: Workspace,
  rootDir: string,
  pkg: WorkspacePackage,
): SnapshotDependency[] {
  const packagePath = toPosix(path.relative(rootDir, pkg.getPackagePath()));
  const packageName =
    pkg.getName() ??
    (toPosix(path.relative(rootDir, pkg.getBasePath())) || ".");
  const snapshots: SnapshotDependency[] = [];
  for (const section of SNAPSHOT_SECTIONS) {
    const dependencies = pkg.getDependencies(section);
    for (const [name, versionRange] of Object.entries(dependencies)) {
      if (versionRange.startsWith("workspace:")) {
        continue;
      }
      const resolved = workspace.resolveCatalogSpecifier(name, versionRange);
      if (resolved === undefined || !isSnapshotSpecifier(resolved)) {
        continue;
      }
      snapshots.push({
        packageName,
        packagePath,
        section,
        name,
        versionRange,
        ...(resolved !== versionRange ? { catalogVersionRange: resolved } : {}),
      });
    }
  }
  return snapshots;
}

function isSnapshotSpecifier(specifier: string): boolean {
  return specifier.includes("-SNAPSHOT");
}

function formatSpecifier(dependency: SnapshotDependency): string {
  return dependency.catalogVersionRange === undefined
    ? dependency.versionRange
    : `${dependency.catalogVersionRange} (${dependency.versionRange})`;
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
}

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}
