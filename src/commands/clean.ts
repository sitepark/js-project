import { Workspace } from "../Workspace.js";
import { ProjectCleaner } from "../ProjectCleaner.js";

export async function cleanCommand(): Promise<void> {
  const project = Workspace.forCwd().getRoot();
  const projectCleaner = new ProjectCleaner(project);
  await projectCleaner.clean();
}
