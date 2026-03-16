import { exit } from "node:process";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";
import type { PackageManagerIdentifier } from "../PackageManager.js";

export function verifyReleaseCommand(
  packageManager: PackageManagerIdentifier,
): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  const report = releaseManagement.verifyRelease();
  if (!report.isReleaseable()) {
    console.log(report.toString());
    exit(1);
  }
}
