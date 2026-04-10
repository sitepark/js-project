import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Git } from "./Git.js";
import type { PackageJson } from "./PackageJson.js";

import {
  escapeVersionIdentifierForNpm,
  incrementMinorVersion,
  incrementPatchVersion,
  isSnapshot,
  releaseVersion,
} from "./version.js";

type DependencyType =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

export interface DependencyInfo {
  name: string;
  versionRange: string;
}

export class Project {
  private git: Git;

  private pkg: PackageJson;

  private packagePath: string;

  private branch: string;

  private buildTime: Date;

  public static forCwd(git: Git = new Git()): Project {
    const pkgPath = path.join(process.cwd(), "/package.json");
    const pkgData = JSON.parse(readFileSync(pkgPath, "utf8"));
    return new Project(pkgData, pkgPath, git);
  }

  constructor(pkg: PackageJson, packagePath: string, git: Git) {
    this.pkg = pkg;
    this.packagePath = packagePath;
    this.git = git;
    this.branch = this.getCurrentBranch();
    this.buildTime = new Date();
  }

  private getCurrentBranch(): string {
    // When running in a github action
    if (
      process.env.GITHUB_REF_NAME &&
      process.env.GITHUB_REF_TYPE === "branch"
    ) {
      return process.env.GITHUB_REF_NAME;
    }

    // When running in a gitlab CI/CD pipeline
    if (process.env.CI_COMMIT_BRANCH) {
      return process.env.CI_COMMIT_BRANCH;
    }

    // When running locally
    return this.git.getCurrentBranch();
  }

  public refresh(): void {
    const pkgData = JSON.parse(readFileSync(this.packagePath, "utf8"));
    this.pkg = pkgData;
  }

  public getName(): string {
    return this.pkg.name || "unnamed-package";
  }

  /**
   * Returns the scope of the package or empty string
   * if project doesnt have a scope.
   *
   * Example: @sitepark/foo -> sitepark
   */
  getScope(): string {
    if (!this.hasScope()) {
      return "";
    }
    const name = this.getName();
    return name.substring(1, name.indexOf("/"));
  }

  public hasScope(): boolean {
    const name = this.getName();
    return name.indexOf("@") > -1;
  }

  public getNameWithoutScope(): string {
    const name = this.getName();
    if (!this.hasScope()) {
      return name;
    }

    const scope = this.getScope();
    return name.substring(scope.length + 2);
  }

  public getPackageJson(): PackageJson {
    return this.pkg;
  }

  public getPackagePath(): string {
    return this.packagePath;
  }

  public getBasePath(): string {
    return path.dirname(this.packagePath);
  }

  public getBuildPath(): string {
    return path.join(this.getBasePath(), "build");
  }

  public getVersion(): string {
    return this.pkg.version || "1.0.0-SNAPSHOT";
  }

  public getVersions(): string[] {
    return this.git.getVersions();
  }

  public getBuildTime(): Date {
    return this.buildTime;
  }

  public getFeatureBranchVersionIdentifier(): string | null {
    const matches = this.getBranch().match(/^feature\/(.*)/);
    if (!Array.isArray(matches) || matches.length < 2) {
      return null;
    }
    const rawVersionIdentifier = matches[1] as string;

    return escapeVersionIdentifierForNpm(rawVersionIdentifier);
  }

  public updateVersion(newVersion: string): void {
    this.pkg.version = newVersion;
    const pkgContent = `${JSON.stringify(this.pkg, null, 2)}\n`;
    writeFileSync(this.packagePath, pkgContent, "utf8");
  }

  public getBranch(): string {
    return this.branch;
  }

  public getSnapshotRegistry(): string | undefined {
    return process.env.JS_PROJECT_SNAPSHOT_REGISTRY;
  }

  public getReleaseRegistry(): string | undefined {
    return process.env.JS_PROJECT_RELEASE_REGISTRY;
  }

  /**
   * Checks whether the current package is a SNAPSHOT version
   */
  public isSnapshot(): boolean {
    return isSnapshot(this.getVersion());
  }

  public isRelease(): boolean {
    return !this.isSnapshot();
  }

  public isSupportBranch(): boolean {
    return this.branch.startsWith("support/");
  }

  public isHotfixBranch(): boolean {
    return this.branch.startsWith("hotfix/");
  }

  public isMainBranch(): boolean {
    return this.branch === "main";
  }

  public getNextReleaseVersion(): string {
    return releaseVersion(this.getVersion());
  }

  public getNextSnapshotVersion(): string {
    const nextReleaseVersion = this.getNextReleaseVersion();
    if (this.isHotfixBranch()) {
      return `${incrementPatchVersion(nextReleaseVersion)}-SNAPSHOT`;
    }
    return `${incrementMinorVersion(nextReleaseVersion)}-SNAPSHOT`;
  }

  /**
   * Indicates whether this package has valid publishConfig
   * @returns
   */
  public hasPublishConfig(): boolean {
    return !!this.pkg.publishConfig?.registry;
  }

  /**
   * Returns a list of dependencies that have a
   * SNAPSHOT version.
   *
   * @param type Valid dependency types are "dependencies",
   * devDependencies", "optionalDependencies", "peerDependencies"
   * @returns
   */
  public getSnapshotDependencies(
    type: DependencyType = "dependencies",
  ): DependencyInfo[] {
    const snapshots: DependencyInfo[] = [];
    if (!Object.hasOwn(this.pkg, type)) {
      return [];
    }

    const dependencies = this.pkg[type] || {};
    Object.entries(dependencies).forEach(([name, versionRange]) => {
      if (versionRange && versionRange.indexOf("-SNAPSHOT") > -1) {
        snapshots.push({
          name: name,
          versionRange: versionRange,
        });
      }
    });
    return snapshots;
  }

  public getVersionsFromMajor(major: number): string[] {
    return this.git.getVersionsFromMajor(major);
  }

  public getVersionsFromMinor(major: number, minor: number): string[] {
    return this.git.getVersionsFromMinor(major, minor);
  }

  public hasUncommittedChanges(): boolean {
    return this.git.hasUncommittedChanges();
  }

  /**
   * Checks whether the current package has a script with the specified name
   */
  public hasScript(scriptName: string): boolean {
    return Object.hasOwn(this.pkg.scripts ?? {}, scriptName);
  }
}
