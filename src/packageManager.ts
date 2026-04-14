import type { ArgumentsCamelCase } from "yargs";

export type SupportedPackageManager = "pnpm" | "npm" | "yarn";

export function defaultPackageManager(): SupportedPackageManager {
  const envPackageManager = process.env.JS_PROJECT_PACKAGE_MANAGER ?? "";
  if (envPackageManager) {
    if (!isSupportedPackageManager(envPackageManager)) {
      throw new Error(`unknown package manager ${envPackageManager}`);
    }
    return envPackageManager;
  }
  return "pnpm";
}

export function isSupportedPackageManager(
  manager: string,
): manager is SupportedPackageManager {
  return ["pnpm", "npm", "yarn"].includes(manager.toLowerCase());
}

export function parsePackageManagerArg(
  argv: ArgumentsCamelCase,
): SupportedPackageManager {
  const packageManager =
    `${argv.packageManager ?? defaultPackageManager()}`.toLowerCase();

  if (isSupportedPackageManager(packageManager)) {
    return packageManager;
  }
  throw new Error(`unknown package manager ${packageManager}`);
}
