import { BuildProvider } from "./BuildProvider.js";
import { Git } from "./Git.js";
import { NodePublisherProvider } from "./NodePublisherProvider.js";
import { Project } from "./Project.js";
import type { SupportedPackageManager } from "./packageManager.js";
import { ReleaseManagement } from "./ReleaseManagement.js";

export class ReleaseManagementFactory {
  public static forCwd(
    packageManager: SupportedPackageManager,
    buildProvider: BuildProvider | null = null,
    publisherProvider: NodePublisherProvider | null = null,
  ): ReleaseManagement {
    const git = new Git();
    const project = Project.forCwd(git);
    if (buildProvider === null) {
      buildProvider = new BuildProvider(project, packageManager);
    }
    if (publisherProvider === null) {
      publisherProvider = new NodePublisherProvider(project, packageManager);
    }
    return new ReleaseManagement(
      project,
      git,
      buildProvider,
      publisherProvider,
    );
  }
}
