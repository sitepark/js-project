# js-project

Release management for JavaScript/TypeScript projects: development happens on SNAPSHOT versions, releases are tagged in git, and both are published to npm registries.

## Language

### Versions

**SNAPSHOT version**:
A development version ending in `-SNAPSHOT` (`1.2.0-SNAPSHOT`); the version `package.json` carries between releases.
_Avoid_: dev version, prerelease

**Release version**:
A plain semantic version (`1.2.0`), made from a SNAPSHOT version by dropping the suffix.

**Publish version**:
The version sent to the registry: the release version, or for a SNAPSHOT the SNAPSHOT version plus the build timestamp (and on a feature branch the feature branch identifier). It is never committed.
_Avoid_: timestamped version

**Release tag**:
The bare `X.Y.Z` git tag recording a release; exactly one per release, also in a workspace.
_Avoid_: version tag, `vX.Y.Z`

### Branches

**Main branch**:
`main`, where the next minor release is developed.

**Support branch**:
A `support/*` branch that carries an older major version; releases work as on the main branch.

**Hotfix branch**:
A `hotfix/X.Y.x` branch started from a release tag to produce patch releases of `X.Y`.

**Feature branch**:
A `feature/*` branch; it may publish SNAPSHOT versions but never releases.

### Workspace

**Workspace**:
The set of packages released together as one project, rooted at the root package. A single-package repo is a workspace containing only the root.

**Monorepo mode**:
Operating on a workspace that declares packages besides the root, as opposed to a single-package repo.
_Avoid_: multi-package mode

**Root package**:
The package at the repository root; it holds the project version.
_Avoid_: root project

**Workspace package**:
A package of the workspace other than the root package.
_Avoid_: sub-package, module

**Private package**:
A package marked `"private": true`; it is never published. Every other package is a **public package**.

**Sibling**:
Another package of the same workspace, seen from a package that depends on it.

**Lockstep versioning**:
Every package of a workspace carries the version of the root package.
_Avoid_: independent versioning (the rejected alternative, not a synonym)

**Version drift**:
A workspace package whose version differs from the root package's version.

### Verification

**Verification report**:
The result of checking whether the workspace is ready to release; it holds failures, which block the release, and information, which does not.

**External SNAPSHOT dependency**:
A dependency on a SNAPSHOT version of a package outside the workspace.
