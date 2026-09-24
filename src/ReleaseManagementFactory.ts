import { BuildProvider, workspaceOptionsFor } from "./BuildProvider.js";
import { Git } from "./Git.js";
import { Project } from "./Project.js";
import type { Publisher } from "./Publisher.js";
import { ReleaseManagement } from "./ReleaseManagement.js";
import { Workspace } from "./Workspace.js";

export class ReleaseManagementFactory {
  /**
   * Creates the release management for the workspace rooted at `project`.
   *
   * The effective package manager is the one of `buildProvider`. If a
   * workspace (monorepo) is detected and it is not pnpm, this throws, so
   * nothing is written, committed or tagged.
   */
  public static forCwd(
    project: Project,
    buildProvider: BuildProvider,
    publisherProvider: Publisher,
  ): ReleaseManagement {
    const git = new Git();
    const workspace = Workspace.forProject(
      project,
      workspaceOptionsFor(buildProvider),
    );

    return new ReleaseManagement(
      project,
      git,
      buildProvider,
      publisherProvider,
      workspace,
    );
  }
}
