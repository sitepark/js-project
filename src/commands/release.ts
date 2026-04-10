import type { SupportedPackageManager } from "../packageManager.js";
import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function releaseCommand(packageManager: SupportedPackageManager): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  releaseManagement.release();
}
