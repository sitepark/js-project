import { Git } from "../Git.js";
import { NodePublisherProvider } from "../NodePublisherProvider.js";
import { Project } from "../Project.js";
import { ProjectCleaner } from "../ProjectCleaner.js";

export async function cleanCommand(): Promise<void> {
  const git = new Git();
  const project = Project.forCwd(git);
  const projectCleaner = new ProjectCleaner(project);
  await projectCleaner.clean();
}
