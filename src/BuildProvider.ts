import { execSync } from "node:child_process";
import type { Project } from "./Project.js";
import type { PackageManagerIdentifier } from "./PackageManager.js";
import { unlinkSync } from "node:fs";

export class BuildProvider {
  private project: Project;
  private packageManager: PackageManagerIdentifier;

  constructor(project: Project, packageManager: PackageManagerIdentifier) {
    this.project = project;
    this.packageManager = packageManager;
  }

  public formatPackageJson(): void {
    this.runScript("format:package-json");
  }

  public verify(): void {
    this.runScript("verify", true);
  }

  public test(): void {
    this.runScript("test", false);
  }

  public build(): void {
    this.runScript("build", false);
  }

  public publish(): void {
    this.runScript("publish", true);
  }

  public getPackPath(): string {
    const scope = this.project.getScope();
    const nameWithoutScope = this.project.getNameWithoutScope();
    const version = this.project.getVersion();
    const scopeSeparator = scope ? "-" : "";

    // npm:       sitepark-sitekit-js-2.109.0-SNAPSHOT.tgz
    // yarn(1.x): sitepark-sitekit-js-v2.109.0-SNAPSHOT.tgz
    // pnpm:      sitepark-sitekit-js-2.109.0-SNAPSHOT.tgz
    if (this.packageManager === "yarn") {
      return `${scope}${scopeSeparator}${nameWithoutScope}-v${version}.tgz`;
    } else {
      return `${scope}${scopeSeparator}${nameWithoutScope}-${version}.tgz`;
    }
  }

  public pack(): void {
    execSync(`${this.packageManager} pack`, {
      stdio: "inherit",
    });
  }

  public removePack(): void {
    unlinkSync(this.getPackPath());
  }

  private runScript(scriptName: string, optional = true): void {
    if (optional && !this.project.hasScript(scriptName)) {
      console.log(`Skipping optional Script "${scriptName}"`);
      return;
    }
    execSync(`${this.packageManager} run ${scriptName}`, {
      stdio: "inherit",
    });
  }
}
