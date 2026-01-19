import { ReleaseManagementFactory } from "../ReleaseManagementFactory.js";

export function startHotfixCommand(packageManager: string, tag: string): void {
  const releaseManagement = ReleaseManagementFactory.forCwd(packageManager);
  releaseManagement.startHotfix(tag);
}
