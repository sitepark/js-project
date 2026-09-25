import { Workspace } from "../Workspace.js";
import { ProjectCleaner } from "../ProjectCleaner.js";

export async function cleanCommand(): Promise<void> {
  const projectCleaner = new ProjectCleaner(Workspace.forCwd());
  await projectCleaner.clean();
}
