import { NodePublisherProvider } from "../NodePublisherProvider.js";
import { Workspace } from "../Workspace.js";
import type { SupportedPackageManager } from "../packageManager.js";

export async function publishCommand(
  packageManager: SupportedPackageManager,
): Promise<void> {
  const project = Workspace.forCwd({ packageManager }).getRoot();
  const publisherProvider = new NodePublisherProvider(project, packageManager);
  await publisherProvider.publish();
}
