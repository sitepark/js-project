import path from "node:path";
import type { DependencyInfo, Project } from "./Project.js";
import {
  type DependencySection,
  Workspace,
  type WorkspacePackage,
} from "./Workspace.js";

export interface DependencyReport {
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  peerDependencies: DependencyInfo[];
  optionalDependencies: DependencyInfo[];
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
    return this.hasSnapshotDependencies();
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
        isPublishable: this.isPublishable(),
        isReleasable: this.isReleaseable(),
      },
      null,
      2,
    );
  }

  toString(): string {
    const problems = [this.formatSnapshotDependencies()].filter(
      (problem) => problem !== undefined,
    );
    return problems.length > 0 ? problems.join("\n\n") : "No problems found.";
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
