# Monorepo mode requires pnpm

Publishing a workspace relies on one `pnpm -r publish`: pnpm skips private packages, publishes in dependency order, resolves `workspace:` specifiers to the written versions and skips versions already in the registry, which makes a failed release safe to re-run (#16). npm and yarn workspaces are only detected, so that `js-project` fails with a clear error instead of silently releasing the root package alone. The same applies to a workspace declared only by the `package.json` `workspaces` field, because pnpm ignores that field. `clean` is the exception: it doesn't publish, so it works for every workspace.

## Consequences

- The package-manager check runs when the workspace is built (`Workspace.forCwd` / `Workspace.forProject` with a `packageManager`), before anything is written, committed or tagged, both in the CLI and in the library path (`ReleaseManagementFactory.forCwd`).
