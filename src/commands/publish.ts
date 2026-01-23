import { Git } from "../Git.js";
import { NodePublisherProvider } from "../NodePublisherProvider.js";
import { Project } from "../Project.js";

export async function publishCommand(packageManager: string): Promise<void> {
  const git = new Git();
  const project = Project.forCwd(git);
  const publisherProvider = new NodePublisherProvider(project, packageManager);
  await publisherProvider.publish();
}
