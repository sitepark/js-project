# The 1.x library API stays backward compatible

`js-ies-module` uses `js-project` as a library and installs it globally with a `^1.x` range in CI, so every 1.x release reaches all pipelines immediately without a `js-ies-module` release. Changes to the exported API (`Project.forCwd()` and the `Project` getters, the `NodePublisherProvider` and `BuildProvider` constructors, `ReleaseManagementFactory.forCwd`, the `Publisher` interface, exported functions and types) are therefore additive only, and single-package repos keep their exact behaviour. A breaking change needs a 2.0 and a coordinated `js-ies-module` update.

## Consequences

- Obsolete API is deprecated, not removed (e.g. `Project.getSnapshotDependencies()`, restored after its removal).
- The `PackageJson` type stays open to extra keys, because `js-ies-module` reads custom keys.
- New behaviour arrives through existing entry points (e.g. monorepo publishing happens inside `NodePublisherProvider.publish()`).
