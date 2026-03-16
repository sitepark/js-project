import type { PackageManagerIdentifier } from "../PackageManager.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function startHotfixCommand(
  packageManager: PackageManagerIdentifier,
  tag: string,
): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  releaseManagement.startHotfix(tag);
}
