import type { Project } from "./Project.js";
import fs from "node:fs/promises";

export class ProjectCleaner {
  private readonly project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  public async clean() {
    const buildPath = this.project.getBuildPath();
    try {
      await fs.rm(buildPath, { recursive: true, force: true });
      console.log(`Deleted: ${buildPath}`);
    } catch (error) {
      console.error(`Failed to delete ${buildPath}:`, error);
    }
  }
}
