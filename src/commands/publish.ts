import { Git } from "../Git.js";
import { NodePublisherProvider } from "../NodePublisherProvider.js";
import type { PackageManagerIdentifier } from "../PackageManager.js";
import { Project } from "../Project.js";

export async function publishCommand(
  packageManager: PackageManagerIdentifier,
): Promise<void> {
  const git = new Git();
  const project = Project.forCwd(git);
  const publisherProvider = new NodePublisherProvider(project, packageManager);
  await publisherProvider.publish();
}
