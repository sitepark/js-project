import { exit } from "node:process";
import type { SupportedPackageManager } from "../packageManager.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function verifyReleaseCommand(
  packageManager: SupportedPackageManager,
): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  const report = releaseManagement.verifyRelease();
  if (!report.isReleaseable()) {
    console.log(report.toString());
    exit(1);
  }
}
