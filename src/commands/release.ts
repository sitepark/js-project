import type { PackageManagerIdentifier } from "../PackageManager.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function releaseCommand(packageManager: PackageManagerIdentifier): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  releaseManagement.release();
}
