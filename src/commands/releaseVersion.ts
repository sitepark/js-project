import { Git } from "../Git.js";
import { Project } from "../Project.js";

export function releaseVersionCommand(): void {
  const git = new Git();
  const project = Project.forCwd(git);
  console.log(project.getNextReleaseVersion());
}
