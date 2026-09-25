# CLAUDE.md

A change is done when `pnpm build` (the only step that runs `tsc`), `pnpm test` and `pnpm verify` pass.

## Compatibility

`js-ies-module` uses `js-project` as a library with a `^1.x` range, so every 1.x release reaches all pipelines immediately (ADR 0004). Keep the exported API and the behaviour of single-package repos backward compatible: add optional parameters, types and methods; deprecate instead of removing (e.g. `Project.getSnapshotDependencies()`). If a change can only be made as a breaking one, stop and ask.

## Invariants

Before changing release, publish or workspace behaviour, read the ADR an invariant cites (`docs/adr/`).

- **Lockstep** (ADR 0001): the root `package.json` is the single source of truth for the version. Write versions through `Workspace.writeVersion()` (root and every package, private ones too) and commit every file in `Workspace.getPackageJsonPaths()`.
- **One code path**: code against `Workspace`. A single-package repo is a workspace containing only the root, so callers handle both the same way.
- **Guards first** (ADR 0002): the run-from-root and pnpm-only checks fail before anything is written, committed or tagged. CLI commands get the root `Project` via `Workspace.forCwd({ packageManager })`; `clean` passes no package manager, so it also cleans npm/yarn workspaces.
- **Restore on publish**: every `package.json` is restored byte-identical in a `finally`, also when publishing fails.
- **Plain publish for single packages**: `<pm> publish`, because without a workspace `pnpm -r` treats every nested `package.json` as a package.
- **Registries from the environment** (ADR 0003): only `JS_PROJECT_SNAPSHOT_REGISTRY` / `JS_PROJECT_RELEASE_REGISTRY`.
- **Root scripts run once**: `test`, `verify`, `build` and `format:package-json` run at the root, which fans out across packages.
- **One serializer**: every `package.json` write goes through `serializePackageJson()`.

## Docs

- **Domain**: before exploring the code, read `CONTEXT.md` and the ADRs touching the area (`docs/agents/domain.md` explains how).
- **Tests**: before writing or changing a test, read `docs/agents/testing.md`.
- **Issues**: issues and specs live in GitHub Issues (`gh` CLI); before reading, creating or updating one, see `docs/agents/issue-tracker.md`.
- **Triage**: before applying a triage label, see `docs/agents/triage-labels.md`.
