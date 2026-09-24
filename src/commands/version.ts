import { Workspace } from "../Workspace.js";

export function versionCommand(): void {
  const project = Workspace.forCwd().getRoot();
  console.log(project.getVersion());
}
