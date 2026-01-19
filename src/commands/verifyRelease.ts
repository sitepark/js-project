import { exit } from "node:process";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function verifyReleaseCommand(packageManager: string): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  const report = releaseManagement.verifyRelease();
  if (!report.isReleaseable()) {
    console.log(report.toString());
    exit(1);
  }
}
