import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function releaseCommand(packageManager: string): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  releaseManagement.release();
}
