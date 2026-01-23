[![codecov](https://codecov.io/gh/sitepark/js-project/graph/badge.svg?token=Pt0yXRaxaw)](https://codecov.io/gh/sitepark/js-project)

# js-project

This tool implements the [Sitepark Branching Model](https://sitepark.github.io/github-project-workflow/branching-model/) - a lightweight branching model with support for hotfixes and support releases.

## Installation

### System-wide Installation (Recommended)

Install the package system-wide to make `js-project` available to all users in `/usr/local/bin`:

#### Installation

```bash
# Install globally with npm
sudo pnpm install -g @sitepark/js-project

# Create symlink to /usr/local/bin
sudo ln -s $(npm bin -g)/js-project /usr/local/bin/js-project
```

#### Verify installation:

```bash
which js-project      # Should show: /usr/local/bin/js-project
js-project --version  # Should output: version of js-project
```

### User-level Installation

Install for your user only (no system-wide access):

# Using pnpm

pnpm add -g @sitepark/js-project

````

Note: With user-level installation, ensure npm/pnpm global bin is in your PATH.

## Available Commands

### version

Displays the current branch name.

```bash
js-project version
````

**Output example**: `1.2.0-SNAPSHOT`

**Use case**: Useful in CI/CD pipelines to determine the current version.

---

### releaseVersion

Calculates and displays the next release version based on the current SNAPSHOT version.

```bash
js-project releaseVersion
```

**Example**:

**Output example**: `1.2.0`

**Use case**: Preview what version will be created before running a release.

---

### verifyRelease

Verifies that the project is ready for a release by checking:

- No SNAPSHOT dependencies in `dependencies`, `devDependencies`, or `peerDependencies`
- Valid `publishConfig.registry` is configured in package.json

```bash
js-project verifyRelease [--package-manager <yarn|npm|pnpm>]
```

**Exit codes**:

- `0`: Project is ready for release
- `1`: Project has issues preventing release

**Example output on failure**:

```
Snapshot-Version detected:

dependencies:
  @sitepark/some-package - ^1.0.0-SNAPSHOT

```

**Use case**: Run in CI/CD pipelines before attempting a release to catch configuration issues early.

---

### startHotfix

Creates a hotfix branch from an existing release tag and prepares it for development.

```bash
js-project startHotfix <tag> [--package-manager <yarn|npm|pnpm>]
```

**Arguments**:

- `<tag>`: The base version tag in format `X.Y` (e.g., `2.1`)

**What it does**:

1. Validates you're currently on a release tag (not a SNAPSHOT)
2. Finds the latest patch version for the specified minor version
3. Creates branch `hotfix/X.Y.x` from that release
4. Increments patch version and adds `-SNAPSHOT` suffix
5. Updates `package.json` with new version
6. Formats `package.json`
7. Commits the version change with message: `ci(release): updating package.json set version to X.Y.Z-SNAPSHOT`

**Example**:

```bash
# Starting from release tag 2.1.3
js-project startHotfix 2.1

# Creates branch: hotfix/2.1.x
# Sets version to: 2.1.4-SNAPSHOT
```

**Use case**: When you need to patch an older release without including all changes from `main`.

---

### release

Executes the complete release process including building, testing, and version management.

```bash
js-project release [--package-manager <yarn|npm|pnpm>]
```

**Prerequisites**:

- Current version must be a SNAPSHOT version
- Must be on `main`, `support/*`, or `hotfix/*` branch
- No uncommitted changes in working directory
- All verification checks must pass (see `verifyRelease`)

**What it does**:

1. Validates prerequisites
2. Converts SNAPSHOT version to release version (removes `-SNAPSHOT`)
3. Formats `package.json`
4. Runs build pipeline:
   - `pnpm test` (if script exists)
   - `pnpm verify` (if script exists)
   - `pnpm build` (if script exists)
   - Publishes to npm registry
5. Commits release version: `ci(release): updating package.json set version to X.Y.Z`
6. Creates Git tag: `X.Y.Z` with message "Release Version X.Y.Z"
7. Calculates next SNAPSHOT version:
   - For `hotfix/*` branches: increments patch (e.g., `2.1.1` → `2.1.2-SNAPSHOT`)
   - For `main` and `support/*` branches: increments minor (e.g., `2.1.0` → `2.2.0-SNAPSHOT`)
8. Commits next SNAPSHOT version: `ci(release): updating package.json set version to X.Y.Z-SNAPSHOT`

**Example workflow on main branch**:

```bash
# Current state: version 1.5.0-SNAPSHOT on main branch
js-project release

# Creates:
# - Tag: 1.5.0
# - New version in package.json: 1.6.0-SNAPSHOT
```

**Example workflow on hotfix branch**:

```bash
# Current state: version 2.1.4-SNAPSHOT on hotfix/2.1.x branch
js-project release

# Creates:
# - Tag: 2.1.4
# - New version in package.json: 2.1.5-SNAPSHOT
```

**Use case**: Main command for creating releases in CI/CD pipelines or locally.

---

### publish

Publishes the current package to npm registry with appropriate versioning and tagging.

```bash
js-project publish [--package-manager <yarn|npm|pnpm>]
```

**What it does**:

1. Determines target registry:
   - For releases: uses `JS_PROJECT_RELEASE_REGISTRY` environment variable (or default npm registry if not set)
   - For SNAPSHOTs: uses `JS_PROJECT_SNAPSHOT_REGISTRY` environment variable (or default npm registry if not set)
2. For SNAPSHOT versions: temporarily appends timestamp (e.g., `1.2.0-SNAPSHOT.20260119123045`)
3. Compares with latest Git tag to determine npm dist-tag:
   - `latest`: For releases that are newer than the last tagged version
   - `next`: For SNAPSHOTs that are newer than the last tagged version
   - `hotfix`: For releases from hotfix branches
   - `release`: For releases that are older than the last tagged version
   - `snapshot`: For SNAPSHOTs that are older than the last tagged version
4. Publishes with: `<package-manager> publish --ignore-scripts --non-interactive [--registry <url>] --tag <tag>`
5. Restores original version in package.json (for SNAPSHOT publishes)

**Use case**: Typically called as part of the `release` command, but can be used independently to publish without version changes.

---

## SNAPSHOT Versions

SNAPSHOT versions are pre-release development versions used during active development before creating an official release.

### Version Format

- **Development version**: `1.2.0-SNAPSHOT` (in package.json)
- **Published version**: `1.2.0-SNAPSHOT.20260119123045` (temporary timestamp appended during publish)

### How SNAPSHOTs Work

When you publish a SNAPSHOT version:

1. **Timestamp Addition**: The current timestamp is temporarily appended to the version in ISO format with special characters removed
   - Format: `YYYYMMDDHHMMSS`
   - Example: `1.2.0-SNAPSHOT` becomes `1.2.0-SNAPSHOT.20260119123045`
2. **npm Dist-Tag**: The package is published with an appropriate npm dist-tag:
   - `next`: If the SNAPSHOT is newer than the last tagged release version
   - `snapshot`: If the SNAPSHOT is older than the last tagged release version
3. **Version Restoration**: After publishing, the original `X.Y.Z-SNAPSHOT` version is restored in package.json

### Registry Configuration

You can configure separate registries for SNAPSHOT and release versions using environment variables:

```bash
# Optional: Registry for SNAPSHOT versions
export JS_PROJECT_SNAPSHOT_REGISTRY=https://my-snapshot-registry.com

# Optional: Registry for release versions
export JS_PROJECT_RELEASE_REGISTRY=https://my-release-registry.com
```

- **JS_PROJECT_SNAPSHOT_REGISTRY**: Used when publishing SNAPSHOT versions (if not set, uses default npm registry)
- **JS_PROJECT_RELEASE_REGISTRY**: Used when publishing release versions (if not set, uses default npm registry)

**Note**: The `publishConfig.registry` field in package.json is still validated by `verifyRelease` to ensure publishing is properly configured, but the actual registry URL used during publish comes from these environment variables.

### Installing SNAPSHOT Versions

```bash
# Install the latest SNAPSHOT from the 'next' tag
npm install @sitepark/js-project@next

# Install a specific SNAPSHOT version with timestamp
npm install @sitepark/js-project@1.2.0-SNAPSHOT.20260119123045
```

### Use Cases

- **Continuous Integration**: Automatically publish SNAPSHOTs from main branch on every commit
- **Testing**: Allow teams to test upcoming features before official release
- **Preview Releases**: Share work-in-progress versions with stakeholders
- **Dependency Development**: Use SNAPSHOT versions of dependencies during active development

**Important**: SNAPSHOT dependencies should be converted to release versions before creating a production release (verified by `verifyRelease` command).

---

## Typical Workflows

### Creating a Regular Release

```bash
# 1. Ensure you're on main branch with a SNAPSHOT version
git checkout main
js-project version  # Output: main

# 2. Verify release readiness
js-project verifyRelease

# 3. Execute release
js-project release

# 4. Push commits and tags
git push origin main --tags
```

### Creating a Hotfix

```bash
# 1. Start hotfix from a previous release (e.g., 2.1.3)
git checkout 2.1.3
js-project startHotfix 2.1

# 2. Make your changes on the hotfix/2.1.x branch
git checkout hotfix/2.1.x
# ... make changes ...
git commit -m "fix: critical bug"

# 3. Cherry-pick fix to main if needed
git checkout main
git cherry-pick <commit-hash>

# 4. Release the hotfix
git checkout hotfix/2.1.x
js-project release

# 5. Push changes and tags
git push origin hotfix/2.1.x --tags
```

### Creating a Support Branch

```bash
# 1. Create support branch from last release of major version
git checkout 1.23.0
git checkout -b support/1.x

# 2. Update version to next minor SNAPSHOT
# Edit package.json: set version to 1.24.0-SNAPSHOT

# 3. Continue development on support/1.x
# Releases work the same as on main branch
js-project release
```

## Project Structure

```
js-project/
├── src/                    # Source code
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # CLI commands
│   ├── Project.ts          # Project management
│   ├── Git.ts              # Git operations
│   ├── ReleaseManagement.ts
│   ├── BuildProvider.ts
│   ├── PublisherProvider.ts
│   ├── VerificationReport.ts
│   └── version.ts          # Version utilities
├── test/                   # Test files (87 tests)
│   ├── Project.test.ts
│   ├── ReleaseManagement.test.ts
│   ├── VerificationReport.test.ts
│   └── version.test.ts
├── dist/                   # Build output (generated)
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Development

### Build project

```bash
pnpm package
```

### Run tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage report
pnpm test:coverage
```

### Format code

```bash
pnpm format
```

### Verification (Build + Tests)

```bash
pnpm verify
```

## Release

Set version in `package.json` and create a new [release](https://github.com/sitepark/js-project/releases/new) on GitHub.
