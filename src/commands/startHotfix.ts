import type { SupportedPackageManager } from "../packageManager.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function startHotfixCommand(
  packageManager: SupportedPackageManager,
  tag: string,
): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  releaseManagement.startHotfix(tag);
}
