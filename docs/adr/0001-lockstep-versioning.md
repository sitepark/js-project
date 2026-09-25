# Lockstep versioning for workspaces

A pnpm workspace is released as one project: the root `package.json` holds the one version, every workspace package (private or not) mirrors it, and a release creates one bare `X.Y.Z` tag, one release commit / next-SNAPSHOT commit pair and one `hotfix/X.Y.x` line. This keeps tagging, hotfix branching, dist-tags and the shared pipeline templates unchanged, and lets `pnpm -r publish` resolve `workspace:*` siblings to exactly the versions published alongside them. `release`, `startHotfix` and `publish` always copy the root version into every package, so version drift heals itself and `verifyRelease` reports it as information only.

## Considered Options

- **Independent per-package versions** (per-package tags like `name@X.Y.Z`, change detection, per-package hotfix branches): rejected as out of scope (#12). It would change the tag format and the hotfix model every pipeline relies on.

## Consequences

- `js-project` must run from the workspace root; releasing a single workspace package is not supported.
- Every version write and commit touches all `package.json` files of the workspace.
