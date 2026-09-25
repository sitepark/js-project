import fs from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "./Workspace.js";

/**
 * Deletes the `build/` directory of the root and of every workspace package
 * (private ones included). A failed deletion is logged and does not stop the
 * remaining packages from being cleaned.
 */
export class ProjectCleaner {
  private readonly workspace: Workspace;

  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  public async clean() {
    for (const pkg of this.workspace.getPackages()) {
      const buildPath = path.join(pkg.getBasePath(), "build");
      try {
        await fs.rm(buildPath, { recursive: true, force: true });
        console.log(`Deleted: ${buildPath}`);
      } catch (error) {
        console.error(`Failed to delete ${buildPath}:`, error);
      }
    }
  }
}
