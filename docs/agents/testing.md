# Testing

Tests live in `test/` and come in two kinds. New behaviour gets a fixture test; a test is done when it goes red without the change it covers.

## Fixture tests

Behaviour tests against real projects on disk, with every external command faked.

1. Write the project or workspace with `createFixture()` from `test/support/fixtureHarness.ts` and record commands with `recordExecSync()`. `vi.mock("node:child_process")` goes in the test file itself, because `vi.mock` is hoisted per file. Full usage is in the harness header.
2. Enter through the public API: `Project.forCwd()`, `Workspace.forCwd()`, `NodePublisherProvider`, `ReleaseManagementFactory` and the command functions in `src/commands/`. These are the entry points `js-ies-module` uses (ADR 0004).
3. Assert on observable results: the files written (`fixture.readJson()`) and the commands recorded (`exec.commands`). Internal method calls and private helpers stay out of the assertions, so refactoring keeps the tests green.

The harness changes the working directory, which is why Vitest runs in the `forks` pool.

## Mock-based unit tests

`ReleaseManagement.test.ts` drives the four-argument `ReleaseManagement` constructor (no workspace) with hand-built mocks of its collaborators. It pins the single-package behaviour from before monorepo mode. Extend it when you change that path; workspace behaviour goes into fixture tests.
