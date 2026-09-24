/**
 * Shared test harness for behaviour tests that run against real projects on
 * disk while faking every external command.
 *
 * Usage in a test file:
 *
 * ```ts
 * import { vi } from "vitest";
 * import { createFixture, recordExecSync } from "./support/fixtureHarness.js";
 *
 * // Must be written in the test file itself (vi.mock is hoisted per file).
 * vi.mock("node:child_process");
 *
 * it("does something", async () => {
 *   const fixture = createFixture({
 *     root: { name: "root", version: "1.0.0-SNAPSHOT", private: true },
 *     workspace: { packages: ["packages/*"] },
 *     packages: { "packages/a": { name: "a", version: "1.0.0-SNAPSHOT" } },
 *   });
 *   const exec = recordExecSync({ branch: "main", tags: ["0.9.0"] });
 *
 *   // ... call the public API (Project.forCwd(), NodePublisherProvider,
 *   // ReleaseManagementFactory, ...) ...
 *
 *   expect(exec.commands).toContain("git push");
 *   expect(fixture.readJson("packages/a").version).toBe("1.0.0");
 * });
 * ```
 *
 * `createFixture()` writes the fixture into a fresh temp directory and makes it
 * the working directory. `recordExecSync()` installs a recording
 * implementation on the mocked `execSync` and clears CI branch / registry
 * environment variables so the host environment cannot leak into the test.
 * Both register their own cleanup via `onTestFinished`, so they must be called
 * from inside a test (or a `beforeEach` hook).
 */
import { execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished, vi } from "vitest";
import type { PackageJson } from "../../src/PackageJson.js";

// ---------------------------------------------------------------------------
// Fixture projects / workspaces on disk
// ---------------------------------------------------------------------------

export interface WorkspaceDefinition {
  /** `packages:` globs of `pnpm-workspace.yaml`; omit for a settings-only file */
  packages?: string[];
  /** default catalog (`catalog:`) */
  catalog?: Record<string, string>;
  /** named catalogs (`catalog:<name>`) */
  catalogs?: Record<string, Record<string, string>>;
}

export interface FixtureDefinition {
  /** content of the root `package.json` */
  root: PackageJson;
  /**
   * `pnpm-workspace.yaml`: either raw YAML or a structured definition that is
   * serialised to YAML. Omit for a repository without `pnpm-workspace.yaml`.
   */
  workspace?: string | WorkspaceDefinition;
  /** workspace packages keyed by directory relative to the root */
  packages?: Record<string, PackageJson>;
  /** any additional files keyed by path relative to the root */
  files?: Record<string, string>;
}

export interface Fixture {
  /** absolute path of the fixture root (also the current working directory) */
  readonly root: string;
  /** resolves a path relative to the fixture root */
  path(relativePath?: string): string;
  /**
   * Reads and parses a `package.json`. Accepts a package directory
   * (`"packages/a"`) or a file path; defaults to the root `package.json`.
   */
  readJson(relativePath?: string): PackageJson;
  /** reads a file relative to the fixture root */
  readFile(relativePath: string): string;
}

/**
 * Creates the fixture in a new temporary directory and changes the working
 * directory into it. The previous working directory is restored and the
 * directory removed when the current test finishes.
 */
export function createFixture(definition: FixtureDefinition): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "js-project-fixture-"));
  const previousCwd = process.cwd();

  const write = (relativePath: string, content: string): void => {
    const file = path.join(root, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
  };
  const writeJson = (relativePath: string, pkg: PackageJson): void =>
    write(relativePath, `${JSON.stringify(pkg, null, 2)}\n`);

  writeJson("package.json", definition.root);
  if (definition.workspace !== undefined) {
    write(
      "pnpm-workspace.yaml",
      typeof definition.workspace === "string"
        ? definition.workspace
        : toWorkspaceYaml(definition.workspace),
    );
  }
  for (const [dir, pkg] of Object.entries(definition.packages ?? {})) {
    writeJson(path.join(dir, "package.json"), pkg);
  }
  for (const [file, content] of Object.entries(definition.files ?? {})) {
    write(file, content);
  }

  process.chdir(root);
  onTestFinished(() => {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  });

  const resolve = (relativePath = ""): string => path.join(root, relativePath);
  return {
    root,
    path: resolve,
    readFile: (relativePath) => readFileSync(resolve(relativePath), "utf8"),
    readJson: (relativePath = "package.json") => {
      const file = relativePath.endsWith("package.json")
        ? relativePath
        : path.join(relativePath, "package.json");
      return JSON.parse(readFileSync(resolve(file), "utf8"));
    },
  };
}

function toWorkspaceYaml(workspace: WorkspaceDefinition): string {
  const lines: string[] = [];
  const quote = (value: string): string => JSON.stringify(value);
  const map = (entries: Record<string, string>, indent: string): void => {
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${indent}${quote(key)}: ${quote(value)}`);
    }
  };
  if (workspace.packages) {
    lines.push("packages:");
    for (const glob of workspace.packages) {
      lines.push(`  - ${quote(glob)}`);
    }
  }
  if (workspace.catalog) {
    lines.push("catalog:");
    map(workspace.catalog, "  ");
  }
  if (workspace.catalogs) {
    lines.push("catalogs:");
    for (const [name, entries] of Object.entries(workspace.catalogs)) {
      lines.push(`  ${quote(name)}:`);
      map(entries, "    ");
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Recording execSync
// ---------------------------------------------------------------------------

/**
 * Canned result of a command: stdout as string, an Error to throw, or a
 * function computing either (it may inspect the fixture at call time).
 */
export type CommandResult = string | Error | ((command: string) => string);

export interface CommandResponse {
  /** exact command, or a pattern tested against the command */
  match: string | RegExp;
  result: CommandResult;
}

export interface RecordExecSyncOptions {
  /** branch returned by `git rev-parse --abbrev-ref HEAD` (default `main`) */
  branch?: string;
  /** tags returned by every `git tag -l ...` listing (default none) */
  tags?: string[];
  /** output of `git status --short/--porcelain` (default clean) */
  status?: string;
  /** additional responses; checked before the defaults, first match wins */
  responses?: CommandResponse[];
  /** environment variables to set for the test, e.g. registries */
  env?: Record<string, string>;
}

export interface RecordedCommand {
  command: string;
  cwd: string;
}

export interface ExecSyncRecorder {
  /** every command passed to `execSync`, in call order */
  readonly commands: string[];
  /** every command with the working directory it was issued from */
  readonly calls: RecordedCommand[];
  /** commands matching the given prefix or pattern */
  commandsMatching(match: string | RegExp): string[];
  /** adds a response that takes precedence over all earlier ones */
  respond(match: string | RegExp, result: CommandResult): void;
}

/** Environment variables that influence branch or registry detection. */
const ISOLATED_ENV = [
  "GITHUB_REF_NAME",
  "GITHUB_REF_TYPE",
  "CI_COMMIT_BRANCH",
  "CI_MERGE_REQUEST_SOURCE_BRANCH_NAME",
  "JS_PROJECT_SNAPSHOT_REGISTRY",
  "JS_PROJECT_RELEASE_REGISTRY",
  "JS_PROJECT_PACKAGE_MANAGER",
];

/**
 * Installs a recording implementation on the mocked `execSync`. Requires
 * `vi.mock("node:child_process")` in the test file. Unmatched commands succeed
 * with empty output.
 */
export function recordExecSync(
  options: RecordExecSyncOptions = {},
): ExecSyncRecorder {
  for (const name of ISOLATED_ENV) {
    vi.stubEnv(name, undefined);
  }
  for (const [name, value] of Object.entries(options.env ?? {})) {
    vi.stubEnv(name, value);
  }

  const status = options.status ?? "";
  const responses: CommandResponse[] = [
    ...(options.responses ?? []),
    {
      match: "git rev-parse --abbrev-ref HEAD",
      result: options.branch ?? "main",
    },
    { match: /^git tag -l --sort=/, result: (options.tags ?? []).join("\n") },
    { match: /^git status --(short|porcelain)/, result: status },
  ];

  const calls: RecordedCommand[] = [];
  const matches = (match: string | RegExp, command: string): boolean =>
    typeof match === "string"
      ? command === match || command.startsWith(`${match} `)
      : match.test(command);

  const mocked = vi.mocked(execSync);
  if (!vi.isMockFunction(mocked)) {
    throw new Error(
      'recordExecSync() requires vi.mock("node:child_process") in the test file',
    );
  }
  mocked.mockImplementation(((command: string) => {
    calls.push({ command, cwd: process.cwd() });
    const response = responses.find((r) => matches(r.match, command));
    const result =
      typeof response?.result === "function"
        ? response.result(command)
        : response?.result;
    if (result instanceof Error) {
      throw result;
    }
    return Buffer.from(result ?? "");
  }) as typeof execSync);

  onTestFinished(() => {
    mocked.mockReset();
    vi.unstubAllEnvs();
  });

  return {
    calls,
    get commands() {
      return calls.map((call) => call.command);
    },
    commandsMatching: (match) =>
      calls.map((call) => call.command).filter((c) => matches(match, c)),
    respond: (match, result) => {
      responses.unshift({ match, result });
    },
  };
}
