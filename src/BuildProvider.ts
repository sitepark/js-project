import { execSync } from "node:child_process";
import type { Project } from "./Project.js";

export class BuildProvider {
  private project: Project;
  private packageManager: string;

  constructor(project: Project, packageManager: string) {
    this.project = project;
    this.packageManager = packageManager;
  }

  public formatPackageJson(): void {
    this.runScript("format:package-json");
  }

  public verify(): void {
    this.runScript("verify");
  }

  public test(): void {
    this.runScript("test");
  }

  public package(): void {
    this.runScript("package");
  }

  private runScript(
    scriptName: string,
    args: string[] = [],
    optional = true
  ): void {
    if (optional && !this.project.hasScript(scriptName)) {
      console.log(`Skipping optional Script "${scriptName}"`);
      return;
    }
    execSync(`${this.packageManager} run ${scriptName} ${args.join(" ")}`, {
      stdio: "inherit",
    });
  }
}
