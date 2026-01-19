import { BuildProvider } from "./BuildProvider.js";
import { Git } from "./Git.js";
import { Project } from "./Project.js";
import { PublisherProvider } from "./PublisherProvider.js";
import { ReleaseManagement } from "./ReleaseManagement.js";

export class ReleaseManagementFactory {
  public static forCwd(packageManager: string): ReleaseManagement {
    const git = new Git();
    const project = Project.forCwd(git);
    const buildProvider = new BuildProvider(project, packageManager);
    const publisherProvider = new PublisherProvider(project, packageManager);
    return new ReleaseManagement(
      project,
      git,
      buildProvider,
      publisherProvider,
    );
  }
}
