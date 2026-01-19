import type { PackageJson as OriginalPackageJson } from "type-fest";

interface PublisherConfig {
  releaseRegistry?: string;
  snapshotRegistry?: string;
}

interface ExtendedPackageJson {
  publishConfig?: PublisherConfig;
}

export type PackageJson = OriginalPackageJson & ExtendedPackageJson;
