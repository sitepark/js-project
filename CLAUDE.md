# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based CLI tool (`js-project`) for managing GitLab pipeline release processes. It handles version management, releases, hotfixes, and publishing for JavaScript/TypeScript projects following a GitFlow-inspired workflow with SNAPSHOT versions.

## Build Commands

### Development

```bash
# Install dependencies
pnpm install

# Build the project (compiles TypeScript and sets executable permissions)
pnpm build

# Run tests
pnpm test              # Run all tests once
pnpm test:watch        # Run tests in watch mode
pnpm test:ui           # Run tests with interactive UI
pnpm test:coverage     # Run tests with coverage report

# Format code with Prettier
pnpm format

# Check formatting with Prettier (does not build)
pnpm verify
```

### Testing the CLI

After building:

```bash
# Direct execution
node dist/cli.js <command>

# Or create a local symlink for development
pnpm link --global
js-project <command>
```

### Publishing

```bash
# The prepublishOnly hook automatically runs build before publishing
npm publish
```

## CLI Commands

The tool provides several commands for release management:

- `js-project version` - Display current version/branch
- `js-project releaseVersion` - Create a new release version
- `js-project verifyRelease [--package-manager <yarn|npm|pnpm>]` - Verify release readiness
- `js-project startHotfix <tag> [--package-manager <yarn|npm|pnpm>]` - Start a hotfix branch
- `js-project release [--package-manager <yarn|npm|pnpm>]` - Execute release process
- `js-project publish [--package-manager <yarn|npm|pnpm>]` - Publish package

All commands support `--verbose` (`-v`) flag for detailed error messages with stack traces.

## Architecture

### Core Components

The architecture follows a clean separation of concerns with provider pattern for pluggable implementations:

**Core Domain Classes:**

- `Project` - Represents a Node.js project, manages package.json and version queries (`getSnapshotDependencies()` is deprecated in favour of `VerificationReport`)
- `Git` - Git operations wrapper (branches, tags, commits, version queries)
- `ReleaseManagement` - Orchestrates the release workflow (release creation, hotfix management, verification)
- `Workspace` - The set of packages rooted at a root `Project` (see Monorepo Mode below). A single-package repo is a workspace containing only the root, so callers don't branch

**Provider Interfaces:**

- `BuildProvider` - Executes build scripts (test, verify, build, format)
- `PublisherProvider` - Handles publishing to npm registries (supports SNAPSHOT versions with timestamps, tag management)

**Supporting Classes:**

- `VerificationReport` - Analyzes project for release readiness. Packages are named by `WorkspacePackage.getDisplayName()` (name, or the `/`-separated directory, `.` for the root) in every section. Failing checks feed `hasFailures()`; each check lives in its own section of the class:
  - external SNAPSHOT dependencies in all four dependency sections of the root and every workspace package (`workspace:` specifiers ignored, `catalog:` specifiers resolved via `Workspace.resolveCatalogSpecifier()`)
  - in a monorepo: public packages with a private sibling in `dependencies`/`peerDependencies`
  - version drift from the root, reported as information only
- `ProjectCleaner` - Used by `js-project clean`: deletes `<basePath>/build` of every package in `Workspace.getPackages()` (root first, private packages included). A failed deletion is logged and the remaining packages are still cleaned (exit code 0)
- `ReleaseManagementFactory` - Factory for creating ReleaseManagement instances with providers
- `PackageJson` - TypeScript interface for package.json structure

### Version Management

This project uses a SNAPSHOT-based versioning system:

- Development versions end with `-SNAPSHOT` (e.g., `1.2.0-SNAPSHOT`)
- Release versions are semantic versions without suffix (e.g., `1.2.0`)
- SNAPSHOT publish adds timestamp: `1.2.0-SNAPSHOT.20260119123045`

Version utilities in `src/version.ts`:

- `isSnapshot()` - Check if version is SNAPSHOT
- `releaseVersion()` - Convert SNAPSHOT to release version
- `incrementMinorVersion()` - Bump minor version
- `incrementPatchVersion()` - Bump patch version
- `greaterThanVersion()` - Compare versions using semver

### Branch Strategy

Releases can only be created from:

- `main` - Main development branch
- `support/*` - Long-term support branches
- `hotfix/*` - Hotfix branches for patch releases

Hotfix workflow:

1. Start from a release tag
2. Creates `hotfix/X.Y.x` branch
3. Updates version to next patch SNAPSHOT
4. After hotfix completion, increments patch version for next SNAPSHOT

### Build and Publishing Flow

**Release Process (`ReleaseManagement.release()`):**

1. Validate current state (must be SNAPSHOT on allowed branch)
2. Convert version to release version (root and every workspace package)
3. Format package.json (root `format:package-json`, once)
4. Run build pipeline: test → verify → build
5. Commit release version (all touched package.json files) and create Git tag
6. Publish (`Publisher.publish()`)
7. Update to next SNAPSHOT version (root and every workspace package)
8. Commit SNAPSHOT version (all touched package.json files)
9. Push the branch and the tags

**Publishing Logic (`PublisherProvider.publish()`):**

- For SNAPSHOT: appends timestamp to version
- Determines npm dist-tag: `latest` for releases, `next` for newer SNAPSHOTs
- Flags: `--ignore-scripts --no-git-checks` for pnpm, `--ignore-scripts --non-interactive` for npm/yarn, plus `[--registry <url>] --tag <tag>`
- Single-package repo: `<pm> publish`; skips a private root package (`"private": true`) with a log message instead of publishing it. Never uses `-r` (without a workspace, pnpm would treat every nested `package.json` as a package)
- pnpm workspace: `Workspace.captureFiles()` → `Workspace.writeVersion(publishVersion)` (root and every package, also for releases) → one `pnpm -r publish` → `Workspace.restoreFiles()` in `finally` (byte-identical). pnpm's recursive publish includes a non-private root and skips private packages, so the root is never published separately. A private root is logged as not published while the workspace packages are. Nothing runs when every package is private
- Registries are configured exclusively via the `JS_PROJECT_SNAPSHOT_REGISTRY` / `JS_PROJECT_RELEASE_REGISTRY` environment variables (no `publishConfig` registry support)

### Monorepo Mode

`Workspace` (`src/Workspace.ts`, exported from the index) owns workspace detection and package discovery:

- **Detection**: monorepo mode when the root has a `pnpm-workspace.yaml` with a `packages:` key, or a root `package.json` with a `workspaces` field. A settings-only `pnpm-workspace.yaml` is not a workspace.
- **Discovery**: `packages:` globs are resolved like pnpm does (tinyglobby, `<glob>/package.json`, negations apply globally, `node_modules`/`bower_components` ignored, no implicit dot directories, symlinks not followed as in pnpm 12). The root is always the first package. Workspace packages must have a `package.json` (`package.yaml`/`package.json5` are rejected).
- **Guards**: `Workspace.forCwd()` / `Workspace.forProject()` fail when the directory is inside a workspace but not its root (search stops at the git repository root), and, when a `packageManager` option is given, when a detected workspace is used with npm or yarn ("monorepo mode currently requires pnpm") or declared only by the `workspaces` field.
- **Catalogs**: `getCatalogs()` / `resolveCatalogSpecifier()` read `catalog` / `catalogs` of any root `pnpm-workspace.yaml` (also settings-only), default catalog under `"default"`, like pnpm.
- **Publishing**: `captureFiles()` / `restoreFiles()` save and write back the raw bytes of every `package.json` in `getPackageJsonPaths()` (used by `NodePublisherProvider.publish()` around the publish version) and re-sync the root `Project` and the cached package versions.
- All CLI commands except `clean` obtain the root `Project` via `Workspace.forCwd({ packageManager })`. `Project` stays a single-package abstraction; `Project.forCwd()` keeps returning the root package.
- **Fixed (lockstep) versioning**: one version for the whole workspace, the root `package.json` is the single source of truth, one bare `X.Y.Z` tag, one `hotfix/X.Y.x` line. `Workspace.writeVersion(version)` writes the root (through `Project.updateVersion`) and every workspace package, private or not, so drift heals itself; `Workspace.getPackageJsonPaths()` lists the touched files (root first, relative to the root) for `git add`.
- `ReleaseManagement` takes the `Workspace` as optional 5th constructor argument (`ReleaseManagementFactory.forCwd` keeps its signature and builds it via `Workspace.forProject(project, { packageManager })` with the package manager of the `BuildProvider` (`BuildProvider.getPackageManager()`), so a workspace with npm/yarn fails when the release management is created, before anything is written, committed or tagged). `release()` / `startHotfix()` write versions through it and commit all touched `package.json` files (`Git.commit` accepts `string | string[]`). `startHotfix()` rebuilds the workspace (with the same package manager check) after checking out the base tag, because the package set may differ there. Without a workspace only the root `package.json` is written and committed, so the public four-argument constructor keeps its pre-monorepo behaviour (also used by the mock-based unit tests).
- `clean` calls `Workspace.forCwd()` without a package manager (run-from-root guard only), so it also cleans npm/yarn workspaces and workspaces declared only by the `workspaces` field.
- `format:package-json` runs exactly once, at the root, after the versions are written; formatting the workspace `package.json` files is the responsibility of that root script.
- Every `package.json` written by js-project uses `serializePackageJson()` (`src/PackageJson.ts`): 2-space JSON plus a trailing newline.

### Environment Variables

- `JS_PROJECT_PACKAGE_MANAGER` - Default package manager when not specified via CLI (defaults to pnpm)
- `JS_PROJECT_SNAPSHOT_REGISTRY` - Registry used when publishing SNAPSHOT versions (default npm registry if unset)
- `JS_PROJECT_RELEASE_REGISTRY` - Registry used when publishing release versions (default npm registry if unset)

## TypeScript Configuration

- **Module System**: ESNext with `nodenext` resolution
- **Target**: ESNext
- **Strict Mode**: Enabled with additional strictness (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Source Maps**: Generated for debugging
- **Declarations**: Generated with declaration maps

## Testing

- **Framework**: Vitest (fast Vite-native test framework)
- **Coverage**: V8 coverage provider with text, JSON, and HTML reports
- **Environment**: Node.js environment for testing CLI tools
- **Test Directory**: All tests are located in the `test/` directory
- **Test Files**: Named with `.test.ts` extension

### Test Coverage

Current test files in `test/` (Vitest counts each `it.each` case):

- `version.test.ts` (19 tests) - version utility functions (semver operations, SNAPSHOT handling)
- `Git.test.ts` (2 tests) - `Git.commit()` with one or several paths
- `Project.test.ts` (38 tests) - project management (version handling, branch detection, scripts, registries, deprecated `getSnapshotDependencies()`)
- `Workspace.test.ts` (37 tests) - workspace detection, package discovery, guards, catalogs, version writing
- `Workspace.writeVersion.test.ts` (7 tests) - writing versions into every `package.json` and restoring them
- `VerificationReport.test.ts` (27 tests) - SNAPSHOT dependency check in single-package repos and workspaces
- `VerificationReport.workspaceRules.test.ts` (15 tests) - private-sibling rule, version drift, naming of unnamed packages
- `ReleaseManagement.test.ts` (28 tests) - release orchestration with hand-built mocks (release process, hotfix creation, verification)
- `ReleaseManagementFactory.release.test.ts` (1 test) - release of a single package with a private root
- `ReleaseManagementFactory.workspace.test.ts` (18 tests) - release/startHotfix in a pnpm workspace (also end to end with the real `NodePublisherProvider`), npm/yarn guard of the library path
- `NodePublisherProvider.test.ts` (2 tests) - publish version computation
- `NodePublisherProvider.publish.test.ts` (16 tests) - publish commands, private packages, restoring `package.json` files
- `commands/clean.test.ts` (5 tests) - cleaning `build/` of the root and every workspace package
- `commands/release.test.ts` (2 tests) - release command wiring
- `commands/workspaceGuards.test.ts` (15 tests) - run-from-root and npm/yarn guards of every CLI command

Total: 232 tests

### Writing Tests

When adding new tests:

- Create test files in the `test/` directory
- Import source files from `../src/` directory
- Use Vitest's `describe`, `it`, `expect` for test structure
- Use `vi.fn()` and `vi.mocked()` for mocking
- Use `beforeEach` for test setup to avoid duplication
- For behaviour tests against real projects on disk, use `test/support/fixtureHarness.ts`: `createFixture()` writes a fixture project/workspace into a temp dir and makes it the cwd, `recordExecSync()` (together with `vi.mock("node:child_process")` in the test file) records every `execSync` command and returns canned output. Enter through the public API (`Project.forCwd()`, `Workspace.forCwd()`, `NodePublisherProvider`, `ReleaseManagementFactory`, the command functions in `src/commands/`)

## CI (GitHub Actions)

- `verify.yaml` - on pull requests, pushes to `main` and manual runs: `pnpm install` → `build` (includes the `tsc` type check) → `test` → `verify`. On pushes to `main` it also uploads `build/coverage/cobertura-coverage.xml` to Codecov
- `release.yaml` - manual only: runs `js-project release` (publishes to npm with provenance via OIDC, pushes with `BOT_PAT`), then triggers `create-github-release.yml`
- The pnpm version comes from the `packageManager` field in `package.json`; keep it in line with the local pnpm used to write `pnpm-lock.yaml`

## Git Hooks

- `pre-commit`: Runs `pnpm lint-staged` for staged file linting/formatting
- `post-merge`: Runs `pnpm install` to sync dependencies after merges

## Package Manager Support

Commands support `--package-manager` flag to specify yarn, npm, or pnpm. Falls back to `JS_PROJECT_PACKAGE_MANAGER` environment variable if not specified. Monorepo mode (a detected workspace) requires pnpm.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `sitepark/js-project`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
