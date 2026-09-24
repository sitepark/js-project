import { BranchType } from "./BranchType.js";
import { type BuildProvider, workspaceOptionsFor } from "./BuildProvider.js";
import type { Git } from "./Git.js";
import type { Project } from "./Project.js";
import type { Publisher } from "./Publisher.js";
import { VerificationReport } from "./VerificationReport.js";
import { Workspace } from "./Workspace.js";
import { incrementPatchVersion } from "./version.js";

export class ReleaseManagement {
  private project: Project;

  private buildProvider: BuildProvider;

  private publisherProvider: Publisher;

  private git: Git;

  private workspace: Workspace | undefined;

  /**
   * @param workspace the workspace rooted at `project`. Versions are written
   *   into and committed for every package of the workspace (fixed / lockstep
   *   versioning). Without a workspace only the `package.json` of `project`
   *   is written and committed. {@link ReleaseManagementFactory.forCwd}
   *   always passes the workspace.
   */
  constructor(
    project: Project,
    git: Git,
    buildProvider: BuildProvider,
    publisherProvider: Publisher,
    workspace?: Workspace,
  ) {
    this.project = project;
    this.git = git;
    this.buildProvider = buildProvider;
    this.publisherProvider = publisherProvider;
    this.workspace = workspace;
  }

  /**
   * Generates a VerificationReport for this project
   */
  public verifyRelease(): VerificationReport {
    return new VerificationReport(this.project, this.workspace);
  }

  public startHotfix(tag: string): string {
    if (!this.project.isRelease()) {
      throw new Error(
        "A hotfix can only be created on the basis of a release. " +
          "The current Git state is not a checked out tag. Current version: " +
          this.project.getVersion(),
      );
    }

    const [major, minor] = tag.split(".");

    const releaseVersions = this.project.getVersionsFromMinor(
      Number(major),
      Number(minor),
    );

    if (releaseVersions.length === 0) {
      throw new Error(
        "There is no release yet for which a hotfix can be created.",
      );
    }

    const lastReleaseVersion =
      releaseVersions[releaseVersions.length - 1] ?? `${major}.${minor}.0`;
    const hotfixSnapshotVersion = `${incrementPatchVersion(lastReleaseVersion)}-SNAPSHOT`;

    console.log(`hotfixSnapshotVersion: ${hotfixSnapshotVersion}`);

    const hotfixBranch = `hotfix/${major}.${minor}.x`;
    this.git.createBranch(hotfixBranch, lastReleaseVersion);
    // The checkout replaced the package.json files (and possibly the set of
    // workspace packages) with the content of the base tag. Re-read them so
    // the new version is written on top of that content.
    this.project.refresh();
    if (this.workspace) {
      this.workspace = Workspace.forProject(
        this.project,
        workspaceOptionsFor(this.buildProvider),
      );
    }
    const hotfixPaths = this.writeVersion(hotfixSnapshotVersion);
    this.buildProvider.formatPackageJson();

    this.git.commit(
      hotfixPaths,
      "ci(release)",
      `Updating package.json set version to ${hotfixSnapshotVersion}`,
    );
    this.git.pushOrigin(hotfixBranch);

    return hotfixSnapshotVersion;
  }

  public async release(): Promise<string> {
    if (!this.project.isSnapshot()) {
      throw new Error(
        "The current version is not a SNAPSHOT version: " +
          this.project.getVersion(),
      );
    }
    if (
      ![BranchType.Main, BranchType.Support, BranchType.Hotfix].includes(
        this.project.getBranchType(),
      )
    ) {
      throw new Error(
        "No release can be created with branch '" +
          this.project.getBranch() +
          "'.",
      );
    }

    const releaseVersion = this.project.getNextReleaseVersion();
    if (releaseVersion === null) {
      throw new Error("Unable to determine release version");
    }

    this.assertNoUncommittedChanges(
      "The release can only be created when all changes are committed.",
    );

    const releasePaths = this.writeVersion(releaseVersion);
    this.project.refresh();
    this.buildProvider.formatPackageJson();

    this.logTask(`Building package`, () => {
      this.buildProvider.test();
      this.buildProvider.verify();
      this.buildProvider.build();
    });

    this.git.commit(
      releasePaths,
      "ci(release)",
      `Release ${releaseVersion}`,
      false,
    );

    this.git.createTag(releaseVersion, `Release Version ${releaseVersion}`);

    await this.publisherProvider.publish();

    const nextSnapshotVersion = this.project.getNextSnapshotVersion();
    const snapshotPaths = this.writeVersion(nextSnapshotVersion);
    this.project.refresh();

    this.git.commit(
      snapshotPaths,
      "ci(release)",
      `Updating package.json set version to ${nextSnapshotVersion}`,
      false,
    );

    this.git.pushOrigin(this.project.getBranch());

    return releaseVersion;
  }

  /**
   * Checks whether the current working tree contains
   * uncommitted changes. If it does, an Error is thrown
   */
  public assertNoUncommittedChanges(msg: string): void {
    if (this.project.hasUncommittedChanges()) {
      const untractedFiles = this.git.getChangedTrackedFiles();
      throw new Error(
        `${msg}\nUncommitted changes:\n${untractedFiles.join("\n")}`,
      );
    }
  }

  /**
   * Writes `version` into the root and every workspace `package.json` and
   * returns the paths to commit.
   */
  private writeVersion(version: string): string | string[] {
    if (!this.workspace) {
      this.project.updateVersion(version);
      return "package.json";
    }
    this.workspace.writeVersion(version);
    return this.workspace.getPackageJsonPaths();
  }

  public logTask(label: string, cb: () => void): void {
    console.group(label);
    cb();
    console.groupEnd();
  }
}
