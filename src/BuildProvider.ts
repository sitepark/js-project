import { execSync } from "node:child_process";
import type { Project } from "./Project.js";
import type { SupportedPackageManager } from "./packageManager.js";
import type { WorkspaceOptions } from "./Workspace.js";

export class BuildProvider {
  private project: Project;
  private packageManager: SupportedPackageManager;

  constructor(project: Project, packageManager: SupportedPackageManager) {
    this.project = project;
    this.packageManager = packageManager;
  }

  /** The package manager used to run the scripts. */
  public getPackageManager(): SupportedPackageManager {
    return this.packageManager;
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

/**
 * The {@link WorkspaceOptions} for a release run with `buildProvider`: the
 * effective package manager is the one the build scripts run with. A
 * duck-typed build provider without {@link BuildProvider.getPackageManager}
 * yields no package manager, and therefore no package manager check.
 *
 * @internal
 */
export function workspaceOptionsFor(
  buildProvider: BuildProvider,
): WorkspaceOptions {
  return typeof buildProvider.getPackageManager === "function"
    ? { packageManager: buildProvider.getPackageManager() }
    : {};
}
