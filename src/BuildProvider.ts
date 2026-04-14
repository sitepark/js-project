import { execSync } from "node:child_process";
import type { Project } from "./Project.js";
import type { SupportedPackageManager } from "./packageManager.js";

export class BuildProvider {
  private project: Project;
  private packageManager: SupportedPackageManager;

  constructor(project: Project, packageManager: SupportedPackageManager) {
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
