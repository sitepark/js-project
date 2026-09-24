import { BuildProvider } from "./BuildProvider.js";
import { Git } from "./Git.js";
import { Project } from "./Project.js";
import type { Publisher } from "./Publisher.js";
import { ReleaseManagement } from "./ReleaseManagement.js";
import { Workspace } from "./Workspace.js";

export class ReleaseManagementFactory {
  public static forCwd(
    project: Project,
    buildProvider: BuildProvider,
    publisherProvider: Publisher,
  ): ReleaseManagement {
    const git = new Git();
    const workspace = Workspace.forProject(project);

    return new ReleaseManagement(
      project,
      git,
      buildProvider,
      publisherProvider,
      workspace,
    );
  }
}
