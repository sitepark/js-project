import { Workspace } from "../Workspace.js";

export function releaseVersionCommand(): void {
  const project = Workspace.forCwd().getRoot();
  console.log(project.getNextReleaseVersion());
}
