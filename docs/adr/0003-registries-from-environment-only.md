# Registries are configured via environment variables only

The registry for publishing comes exclusively from `JS_PROJECT_SNAPSHOT_REGISTRY` (SNAPSHOT versions) and `JS_PROJECT_RELEASE_REGISTRY` (release versions); if unset, the default npm registry is used. Registries are a property of the pipeline, not of a package, so they are configured once per pipeline and apply to every published package of a workspace. The former `publishConfig.registry` / `snapshotRegistry` / `releaseRegistry` fields were removed (#13), and `verifyRelease` doesn't check registry settings.

## Consequences

- pnpm itself still gives a scoped registry in `.npmrc` or a `publishConfig.registry` in a manifest precedence over `--registry` for that package; `js-project` neither reads nor overrides this.
