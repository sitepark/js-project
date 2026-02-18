import { execSync } from "node:child_process";
import type { Project } from "./Project.js";
import { greaterThanEqualsVersion } from "./version.js";

export interface PublisherProvider {
  publish(): Promise<void>;
}

export class NodePublisherProvider implements PublisherProvider {
  private project: Project;
  private packageManager: string;

  constructor(project: Project, packageManager: string) {
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

    const isOnFeatureBranch = this.project.getBranch().startsWith("feature/");
    if (isOnFeatureBranch) {
      // Feature-Branch-Name angängen
      // 1.1.0-SNAPSHOT.12839182389123.mein_tolles_krasses_feature_123123
      versionString = `${versionString}.${this.project.getFeatureBranchVersionIdentifier(
        "npm",
      )}`;
    }
    return versionString;
  }

  public async publish(): Promise<void> {
    const registry = this.project.isRelease()
      ? this.project.getReleaseRegistry()
      : this.project.getSnapshotRegistry();

    const version = this.project.getVersion();

    if (this.project.isSnapshot()) {
      const publishVersion = this.getNpmPublishVersion();
      this.project.updateVersion(publishVersion);
      console.log(`Updated snapshot version to ${publishVersion}`);
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
    console.log("Use tag: " + tag);

    try {
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
      const cmd = `${this.packageManager} publish ${args.join(" ")}`;
      console.log(cmd);
      execSync(cmd, {
        stdio: "inherit",
      });
    } finally {
      if (this.project.getVersion() !== version) {
        this.project.updateVersion(version);
      }
    }
    return;
  }

  private getPublishTag(version: string, lastReleaseVersion: string): string {
    const newestVersion = greaterThanEqualsVersion(version, lastReleaseVersion);

    if (this.project.isSnapshot()) {
      return newestVersion ? "next" : "snapshot";
    }

    if (this.project.isHotfixBranch()) {
      return "hotfix";
    }

    return newestVersion ? "latest" : "release";
  }
}
