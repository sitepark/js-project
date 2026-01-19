import { Git } from "../Git.js";
import { Project } from "../Project.js";
import { PublisherProvider } from "../PublisherProvider.js";

export function publishCommand(packageManager: string): void {
  const git = new Git();
  const project = Project.forCwd(git);
  const publisherProvider = new PublisherProvider(project, packageManager);
  publisherProvider.publish();
}
