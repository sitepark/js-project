import { execSync } from "node:child_process";
import { BranchType } from "./BranchType.js";
import type { Project } from "./Project.js";
import type { Publisher } from "./Publisher.js";
import type { SupportedPackageManager } from "./packageManager.js";
import { greaterThanEqualsVersion } from "./version.js";
import { Workspace } from "./Workspace.js";

export class NodePublisherProvider implements Publisher {
  private project: Project;
  private packageManager: SupportedPackageManager;

  constructor(project: Project, packageManager: SupportedPackageManager) {
    this.project = project;
    this.packageManager = packageManager;
  }

  public getNpmPublishVersion(): string {
    let versionString = this.project.getVersion();
    if (!this.project.isSnapshot()) {
      return versionString;
    }
    // Buildzeitpunkt anhängen
    // 1.1.0-SNAPSHOT.12839182389123
    const buildDate = this.project
      .getBuildTime()
      .toISOString()
      .replace(/[-:.ZT]/g, "");
    versionString = `${versionString}.${buildDate}`;

    if (this.project.getBranchType() === BranchType.Feature) {
      // Feature-Branch-Name angängen
      // 1.1.0-SNAPSHOT.12839182389123.mein_tolles_krasses_feature_123123
      versionString = `${versionString}.${this.project.getFeatureBranchVersionIdentifier()}`;
    }
    return versionString;
  }

  /**
   * Publishes the project.
   *
   * Single-package repository: runs `<pm> publish` in the root. A private
   * root package is skipped.
   *
   * pnpm workspace: writes the publish version into the root and every
   * workspace `package.json` and runs a single `pnpm -r publish`. pnpm
   * publishes every non-private package, including a non-private workspace
   * root, in dependency order and resolves `workspace:` specifiers to the
   * written versions. Nothing is published if every package is private.
   *
   * Every `package.json` is restored to its previous contents afterwards,
   * also when publishing fails.
   */
  public async publish(): Promise<void> {
    const workspace = Workspace.forProject(this.project, {
      packageManager: this.packageManager,
    });
    const monorepo = workspace.isMonorepo();

    if (!monorepo && this.project.isPrivate()) {
      console.log(
        `Skipping publish of private package "${this.project.getName()}"`,
      );
      return;
    }

    if (monorepo && workspace.getPackages().every((pkg) => pkg.isPrivate())) {
      console.log(
        "Skipping publish: all packages of the workspace are private",
      );
      return;
    }

    if (monorepo && this.project.isPrivate()) {
      console.log(
        `The workspace root "${this.project.getName()}" is private and not published; ` +
          "publishing the public workspace packages",
      );
    }

    if (this.project.getBranchType() === BranchType.Unknown) {
      throw new Error(
        `Unable to publish on unknown branch type "${this.project.getBranch()}"`,
      );
    }

    if (
      this.project.getBranchType() === BranchType.Feature &&
      !this.project.isSnapshot()
    ) {
      throw new Error(
        `Unable to publish release version on feature branch "${this.project.getBranch()}"`,
      );
    }

    const registry = this.project.isRelease()
      ? this.project.getReleaseRegistry()
      : this.project.getSnapshotRegistry();

    const version = this.project.getVersion();
    const files = workspace.captureFiles();
    let written = false;

    try {
      // In a workspace every package is synced to the publish version
      // (lockstep), for releases too, so that drifted packages and
      // `workspace:` specifiers resolve to the version actually published.
      if (this.project.isSnapshot() || monorepo) {
        const publishVersion = this.getNpmPublishVersion();
        written = true;
        workspace.writeVersion(publishVersion);
        console.log(
          this.project.isSnapshot()
            ? `Updated snapshot version to ${publishVersion}`
            : `Updated workspace versions to ${publishVersion}`,
        );
      }

      const versions = this.project.getVersions();
      const lastReleaseVersion =
        versions.length === 0
          ? "0.0.0"
          : (versions[versions.length - 1] ?? "0.0.0");

      console.log(
        `Last release version: ${lastReleaseVersion} Current version: ${version}`,
      );

      const tag = this.getPublishTag(version, lastReleaseVersion);
      console.log(`Use tag: ${tag}`);

      const args = [
        this.packageManager === "npm"
          ? ["--ignore-scripts", "--non-interactive"]
          : [],
        this.packageManager === "yarn"
          ? ["--ignore-scripts", "--non-interactive"]
          : [],
        this.packageManager === "pnpm"
          ? ["--ignore-scripts", "--no-git-checks"]
          : [],
        registry ? ["--registry", registry] : [],
        ["--tag", tag],
      ].flat();

      execSync("git status", {
        stdio: "inherit",
      });
      // Never use `-r` outside a workspace: without a pnpm-workspace.yaml,
      // pnpm treats every nested package.json as a workspace package.
      const publishCommand = monorepo
        ? `${this.packageManager} -r publish`
        : `${this.packageManager} publish`;
      const cmd = `${publishCommand} ${args.join(" ")}`;
      console.log(cmd);
      execSync(cmd, {
        stdio: "inherit",
      });
    } finally {
      if (written) {
        workspace.restoreFiles(files);
      }
    }
    return;
  }

  public cleanup(): Promise<void> {
    return Promise.resolve();
  }

  private getPublishTag(version: string, lastReleaseVersion: string): string {
    const newestVersion = greaterThanEqualsVersion(version, lastReleaseVersion);

    if (this.project.isSnapshot()) {
      return newestVersion ? "next" : "snapshot";
    }

    if (this.project.getBranchType() === BranchType.Hotfix) {
      return "hotfix";
    }

    return newestVersion ? "latest" : "release";
  }
}
