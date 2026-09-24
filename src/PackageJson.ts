import type { PackageJson as OriginalPackageJson } from "type-fest";

/**
 * Structure of a `package.json` file.
 *
 * The type is open to arbitrary extra keys so that consumers can read
 * custom configuration from it. Registries are not configured here but
 * exclusively via the `JS_PROJECT_SNAPSHOT_REGISTRY` and
 * `JS_PROJECT_RELEASE_REGISTRY` environment variables.
 */
export type PackageJson = OriginalPackageJson;
