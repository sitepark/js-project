import semver from "semver";

/**
 * Checks whether the current package is a SNAPSHOT version
 */

export function isSnapshot(versionString: string): boolean {
  const preRelease = semver.prerelease(versionString) ?? [];
  if (preRelease.includes("SNAPSHOT")) {
    return true;
  }
  return false;
}

/**
 * Cleans up a snapshot version: 1.0.0-SNAPSHOT.0 -> 1.0.0-SNAPSHOT
 */
export function normalizeSnapshotVersion(version: string): string {
  return version.replace(/-SNAPSHOT\.(.*)/g, "-SNAPSHOT");
}

/**
 * Creates a release version from a SNAPSHOT version: 1.0.0-SNAPSHOT.0 -> 1.0.0
 */
export function releaseVersion(version: string): string {
  return version.replace(/-SNAPSHOT(.*)/g, "");
}

/**
 * Increases the minor version 1.0.0 -> 1.1.0
 */
export function incrementMinorVersion(version: string): string {
  const semVersion = semver.parse(version);
  return (
    (semVersion?.major ?? "1") + "." + ((semVersion?.minor ?? 0) + 1) + ".0"
  );
}

export function greaterThanEqualsVersion(
  versionA: string,
  versionB: string,
): boolean {
  const semVersionA = semver.parse(versionA);
  const semVersionB = semver.parse(versionB);

  if (!semVersionA || !semVersionB) {
    throw new Error(
      `Cannot compare versions: '${versionA}' or '${versionB}' is not a valid semver version.`,
    );
  }

  return semver.gte(semVersionA, semVersionB);
}

/**
 * Increases the minor version 1.0.0 -> 1.0.1
 */
export function incrementPatchVersion(version: string): string {
  const semVersion = semver.parse(version);
  return (
    (semVersion?.major ?? "1") +
    "." +
    (semVersion?.minor ?? "0") +
    "." +
    ((semVersion?.patch ?? 0) + 1)
  );
}
