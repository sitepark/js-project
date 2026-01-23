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

# Full verification (build + optional verification scripts)
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

- `Project` - Represents a Node.js project, manages package.json, version queries, and dependency analysis
- `Git` - Git operations wrapper (branches, tags, commits, version queries)
- `ReleaseManagement` - Orchestrates the release workflow (release creation, hotfix management, verification)

**Provider Interfaces:**

- `BuildProvider` - Executes build scripts (test, verify, build, format)
- `PublisherProvider` - Handles publishing to npm registries (supports SNAPSHOT versions with timestamps, tag management)

**Supporting Classes:**

- `VerificationReport` - Analyzes project for release readiness (checks for SNAPSHOT dependencies, publishConfig)
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
2. Convert version to release version
3. Format package.json
4. Run build pipeline: test → verify → build → publish
5. Commit release version and create Git tag
6. Update to next SNAPSHOT version
7. Commit SNAPSHOT version

**Publishing Logic (`PublisherProvider.publish()`):**

- For SNAPSHOT: appends timestamp to version
- Determines npm dist-tag: `latest` for releases, `next` for newer SNAPSHOTs
- Supports custom registries via `publishConfig.registry`, `publishConfig.snapshotRegistry`, `publishConfig.releaseRegistry`

### Environment Variables

- `JS_PROJECT_PACKAGE_MANAGER` - Default package manager when not specified via CLI (required)

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

Current test files in `test/`:

- `version.test.ts` (19 tests) - Tests for version utility functions (semver operations, SNAPSHOT handling) - 100% coverage
- `VerificationReport.test.ts` (14 tests) - Tests for release verification logic - 100% coverage
- `Project.test.ts` (28 tests) - Tests for project management (version handling, branch detection, dependency analysis) - 75.6% coverage
- `ReleaseManagement.test.ts` (26 tests) - Tests for release orchestration (release process, hotfix creation, verification) - 100% coverage

Total: 87 tests

### Writing Tests

When adding new tests:

- Create test files in the `test/` directory
- Import source files from `../src/` directory
- Use Vitest's `describe`, `it`, `expect` for test structure
- Use `vi.fn()` and `vi.mocked()` for mocking
- Use `beforeEach` for test setup to avoid duplication

## Git Hooks

- `pre-commit`: Runs `pnpm lint-staged` for staged file linting/formatting
- `post-merge`: Runs `pnpm install` to sync dependencies after merges

## Package Manager Support

Commands support `--package-manager` flag to specify yarn, npm, or pnpm. Falls back to `JS_PROJECT_PACKAGE_MANAGER` environment variable if not specified.
