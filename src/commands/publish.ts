import { Git } from "../Git.js";
import { NodePublisher } from "../NodePublisher.js";
import { Project } from "../Project.js";
import type { SupportedPackageManager } from "../packageManager.js";

export async function publishCommand(
  packageManager: SupportedPackageManager,
): Promise<void> {
  const git = new Git();
  const project = Project.forCwd(git);
  const publisherProvider = new NodePublisher(project, packageManager);
  await publisherProvider.publish();
}
