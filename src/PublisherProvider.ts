import { execSync } from "node:child_process";
import type { Project } from "./Project.js";
import { greaterThanVersion } from "./version.js";

export class PublisherProvider {
  private project: Project;
  private packageManager: string;

  constructor(project: Project, packageManager: string) {
    this.project = project;
    this.packageManager = packageManager;
  }

  public publish(): void {
    const registry = this.project.isRelease()
      ? this.project.getReleaseRegistry()
      : this.project.getSnapshotRegistry();

    const version = this.project.getVersion();

    if (this.project.isSnapshot()) {
      const buildDate = new Date().toISOString().replace(/[-:.ZT]/g, "");
      const snapshotVersion = `${version}.${buildDate}`;
      this.project.updateVersion(snapshotVersion);
      console.log(`Updated snapshot version to ${snapshotVersion}`);
    }

    const versions = this.project.getVersions();
    const lastReleaseVersion =
      versions.length === 0
        ? "0.0.0"
        : (versions[versions.length - 1] ?? "0.0.0");

    console.log(
      `Last release version: ${lastReleaseVersion} Current version: ${version}`,
    );
    const newestVersion = greaterThanVersion(version, lastReleaseVersion);
    const tag = newestVersion
      ? this.project.isRelease()
        ? "latest"
        : "next"
      : null;

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
        tag ? ["--tag", tag] : [],
      ].flat();

      execSync("git status", {
        stdio: "inherit",
      });
      const cmd = `${this.packageManager} publish ${args.join(" ")}`;
      console.log(cmd);
      console.log("env", process.env);
      execSync(cmd, {
        env: process.env,
        stdio: "inherit",
      });
    } finally {
      if (this.project.getVersion() !== version) {
        this.project.updateVersion(version);
      }
    }
  }
}
