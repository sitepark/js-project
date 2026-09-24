import type { DependencyInfo, Project } from "./Project.js";

export interface DependencyReport {
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
  peerDependencies: DependencyInfo[];
}

export class VerificationReport {
  private readonly project: Project;

  /**
   * @param {Project} project
   */
  constructor(project: Project) {
    this.project = project;
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

  generateDependecyInfo(): DependencyReport {
    return {
      dependencies: this.project.getSnapshotDependencies("dependencies"),
      devDependencies: this.project.getSnapshotDependencies("devDependencies"),
      peerDependencies:
        this.project.getSnapshotDependencies("peerDependencies"),
    };
  }

  toJson(): string {
    return JSON.stringify(
      {
        ...this.generateDependecyInfo(),
        isPublishable: this.isPublishable(),
        isReleasable: this.isReleaseable(),
      },
      null,
      2,
    );
  }

  toString(): string {
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

    return "No problems found.";
  }
}
