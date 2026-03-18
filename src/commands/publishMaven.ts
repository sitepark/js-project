import { BuildProvider } from "../BuildProvider.js";
import { Git } from "../Git.js";
import { MavenPublisher, type MavenRepository } from "../MavenPublisher.js";
import type { PackageManagerIdentifier } from "../PackageManager.js";
import { Project } from "../Project.js";

export async function publishMavenCommand(
  repository: MavenRepository,
  packageManager: PackageManagerIdentifier,
): Promise<void> {
  const git = new Git();
  const project = Project.forCwd(git);
  const buildProvider = new BuildProvider(project, packageManager);
  const mavenPublisher = new MavenPublisher(project, buildProvider);
  await mavenPublisher.publish(repository);
}
