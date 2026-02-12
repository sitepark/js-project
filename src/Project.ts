import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { Git } from "./Git.js";
import type { PackageJson } from "./PackageJson.js";
import {
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

export function defaultPackageManager(): string {
  if (process.env.JS_PROJECT_PACKAGE_MANAGER === undefined) {
    throw new Error(
      "JS_PROJECT_PACKAGE_MANAGER environment variable is not set",
    );
  }
  return process.env.JS_PROJECT_PACKAGE_MANAGER;
}

export class Project {
  private git: Git;

  private pkg: PackageJson;

  private packagePath: string;

  private branch: string;

  public static forCwd(git: Git = new Git()): Project {
    const pkgPath = path.join(process.cwd(), "/package.json");
    const pkgData = JSON.parse(readFileSync(pkgPath, "utf8"));
    return new Project(pkgData, pkgPath, git);
  }

  constructor(pkg: PackageJson, packagePath: string, git: Git) {
    this.pkg = pkg;
    this.packagePath = packagePath;
    this.git = git;
    this.branch = this.git.getCurrentBranch();
  }

  public refresh(): void {
    const pkgData = JSON.parse(readFileSync(this.packagePath, "utf8"));
    this.pkg = pkgData;
  }

  public getName(): string {
    return this.pkg.name || "unnamed-package";
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

  public updateVersion(newVersion: string): void {
    this.pkg.version = newVersion;
    const pkgContent = JSON.stringify(this.pkg, null, 2) + "\n";
    writeFileSync(this.packagePath, pkgContent, "utf8");
  }

  public getBranch(): string {
    return this.branch;
  }

  public getEscapedBranch(): string {
    // Replace non-alphanumeric characters with "-"
    const nonAlphaNumRegex = /[^a-zA-Z0-9äöüÄÖÜß]+/;
    const outputString = this.getBranch().replaceAll(nonAlphaNumRegex, "-");

    // Remove leading and trailing "-" characters
    return outputString.replaceAll(/^-+|-+$/, "").trim();
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
      return incrementPatchVersion(nextReleaseVersion) + "-SNAPSHOT";
    } else {
      return incrementMinorVersion(nextReleaseVersion) + "-SNAPSHOT";
    }
  }

  /**
   * Indicates whether this package has valid publishConfig
   * @returns
   */
  public hasPublishConfig(): boolean {
    return !!(this.pkg.publishConfig && this.pkg.publishConfig.registry);
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
    if (!this.pkg.hasOwnProperty(type)) {
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
    const scripts = this.pkg.scripts;
    if (!scripts) {
      return false;
    }
    return scripts.hasOwnProperty(scriptName);
  }
}
