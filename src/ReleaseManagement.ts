import type { BuildProvider } from "./BuildProvider.js";
import type { Git } from "./Git.js";
import type { Project } from "./Project.js";
import type { PublisherProvider } from "./PublisherProvider.js";
import { VerificationReport } from "./VerificationReport.js";
import { incrementPatchVersion } from "./version.js";

export class ReleaseManagement {
  private project: Project;

  private buildProvider: BuildProvider;

  private publisherProvider: PublisherProvider;

  private git: Git;

  constructor(
    project: Project,
    git: Git,
    buildProvider: BuildProvider,
    publisherProvider: PublisherProvider,
  ) {
    this.project = project;
    this.git = git;
    this.buildProvider = buildProvider;
    this.publisherProvider = publisherProvider;
  }

  /**
   * Generates a VerificationReport for this project
   */
  public verifyRelease(): VerificationReport {
    return new VerificationReport(this.project);
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
      releaseVersions[releaseVersions.length - 1] ?? minor + "." + minor + ".0";
    const hotfixSnapshotVersion =
      incrementPatchVersion(lastReleaseVersion) + "-SNAPSHOT";

    console.log("hotfixSnapshotVersion: " + hotfixSnapshotVersion);

    const hotfixBranch = "hotfix/" + major + "." + minor + ".x";
    this.git.createBranch(hotfixBranch, lastReleaseVersion);
    this.project.updateVersion(hotfixSnapshotVersion);
    this.buildProvider.formatPackageJson();

    this.git.commit(
      "package.json",
      "ci(release)",
      "updating package.json set version to " + hotfixSnapshotVersion,
    );
    this.git.pushOrigin(hotfixBranch);

    return hotfixSnapshotVersion;
  }

  public release(): string {
    if (!this.project.isSnapshot()) {
      throw new Error(
        "The current version is not a SNAPSHOT version: " +
          this.project.getVersion(),
      );
    }
    if (
      !this.project.isMainBranch() &&
      !this.project.isSupportBranch() &&
      !this.project.isHotfixBranch()
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

    this.project.updateVersion(releaseVersion);
    this.buildProvider.formatPackageJson();

    this.logTask(`Building package`, () => {
      this.buildProvider.test();
      this.buildProvider.verify();
      this.buildProvider.package();
    });

    this.git.commit(
      "package.json",
      "ci(release)",
      "updating package.json set version to " + releaseVersion,
    );

    this.git.createTag(releaseVersion, "Release Version " + releaseVersion);

    this.publisherProvider.publish();

    const nextSnapshotVersion = this.project.getNextSnapshotVersion();
    this.project.updateVersion(nextSnapshotVersion);

    this.git.commit(
      "package.json",
      "ci(release)",
      "updating package.json set version to " + nextSnapshotVersion,
    );

    this.git.push();

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
        msg + "\nUncommitted changes:\n" + untractedFiles.join("\n"),
      );
    }
  }

  public logTask(label: string, cb: () => void): void {
    console.group(label);
    cb();
    console.groupEnd();
  }
}
