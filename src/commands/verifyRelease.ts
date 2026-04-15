import { exit } from "node:process";
import type { SupportedPackageManager } from "../packageManager.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";
import { Project } from "../Project.js";
import { BuildProvider } from "../BuildProvider.js";
import { NodePublisherProvider } from "../NodePublisherProvider.js";

export function verifyReleaseCommand(
  packageManager: SupportedPackageManager,
): void {
  const project = Project.forCwd();
  const buildProvider = new BuildProvider(project, packageManager);
  const nodePublisher = new NodePublisherProvider(project, packageManager);

  const releaseManagement = ReleaseManagementFactory.forCwd(
    project,
    buildProvider,
    nodePublisher,
  );
  const report = releaseManagement.verifyRelease();
  if (!report.isReleaseable()) {
    console.log(report.toString());
    exit(1);
  }
}
