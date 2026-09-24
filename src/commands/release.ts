import { BuildProvider } from "../BuildProvider.js";
import { NodePublisherProvider } from "../NodePublisherProvider.js";
import type { SupportedPackageManager } from "../packageManager.js";
import { Project } from "../Project.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export async function releaseCommand(
  packageManager: SupportedPackageManager,
): Promise<void> {
  const project = Project.forCwd();
  const buildProvider = new BuildProvider(project, packageManager);
  const nodePublisher = new NodePublisherProvider(project, packageManager);

  const releaseManagement = ReleaseManagementFactory.forCwd(
    project,
    buildProvider,
    nodePublisher,
  );
  await releaseManagement.release();
}
