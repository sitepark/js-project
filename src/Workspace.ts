import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { globSync } from "tinyglobby";
import { parse as parseYaml } from "yaml";
import type { PackageJson } from "./PackageJson.js";
import { Project } from "./Project.js";
import type { SupportedPackageManager } from "./packageManager.js";

/** The dependency sections of a `package.json`. */
export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

export interface WorkspaceOptions {
  /**
   * Package manager the caller is going to use. When given, a detected
   * workspace is rejected unless the package manager is pnpm.
   */
  packageManager?: SupportedPackageManager;
}

/**
 * A package of a {@link Workspace}: the root package or one of the packages
 * matched by the workspace globs. A read-only view of its `package.json`.
 */
export class WorkspacePackage {
  private readonly manifestPath: string;
  private readonly manifest: PackageJson;
  private readonly root: boolean;

  /** @internal packages are created by {@link Workspace} only */
  constructor(manifestPath: string, manifest: PackageJson, root: boolean) {
    this.manifestPath = manifestPath;
    this.manifest = manifest;
    this.root = root;
  }

  /** `true` for the root package of the workspace */
  public isRoot(): boolean {
    return this.root;
  }

  public getName(): string | undefined {
    return this.manifest.name;
  }

  public getVersion(): string | undefined {
    return this.manifest.version;
  }

  /** Checks whether the package is marked as `"private": true`. */
  public isPrivate(): boolean {
    return this.manifest.private === true;
  }

  /** Dependencies of the given section (empty if the section is missing). */
  public getDependencies(section: DependencySection): Record<string, string> {
    const dependencies: Record<string, string> = {};
    for (const [name, range] of Object.entries(this.manifest[section] ?? {})) {
      if (typeof range === "string") {
        dependencies[name] = range;
      }
    }
    return dependencies;
  }

  public getPackageJson(): PackageJson {
    return this.manifest;
  }

  /** absolute path of the package's `package.json` */
  public getPackagePath(): string {
    return this.manifestPath;
  }

  /** absolute path of the package directory */
  public getBasePath(): string {
    return path.dirname(this.manifestPath);
  }
}

/**
 * The set of packages rooted at a root {@link Project}.
 *
 * A repository is a workspace (monorepo) when its root has a
 * `pnpm-workspace.yaml` with a `packages:` key, or a `package.json` with a
 * `workspaces` field. A repository without a workspace is modelled as a
 * workspace that contains only the root package, so callers don't need to
 * distinguish the two cases.
 *
 * Obtain an instance via {@link Workspace.forCwd} or
 * {@link Workspace.forProject}. Both refuse to create a workspace for a
 * directory inside a workspace other than its root, and, if a package manager
 * is given, a workspace used with a package manager other than pnpm.
 */
export class Workspace {
  private readonly root: Project;
  private readonly definition: WorkspaceDefinition | undefined;
  private readonly packages: readonly WorkspacePackage[];
  private catalogs: Catalogs | undefined;

  /**
   * Creates the workspace for the current working directory, which must be
   * the workspace root (or the directory of a single-package repository).
   * The root package is read with {@link Project.forCwd}.
   */
  public static forCwd(options: WorkspaceOptions = {}): Workspace {
    assertNotInsideWorkspace(process.cwd());
    return Workspace.forProject(Project.forCwd(), options);
  }

  /** Creates the workspace rooted at the given root package. */
  public static forProject(
    root: Project,
    options: WorkspaceOptions = {},
  ): Workspace {
    const rootDir = root.getBasePath();
    assertNotInsideWorkspace(rootDir);
    const definition = readWorkspaceDefinition(rootDir, root.getPackageJson());
    if (definition && options.packageManager) {
      assertSupportedPackageManager(definition, options.packageManager);
    }
    return new Workspace(root, definition);
  }

  private constructor(
    root: Project,
    definition: WorkspaceDefinition | undefined,
  ) {
    this.root = root;
    this.definition = definition;
    this.packages = [
      new WorkspacePackage(root.getPackagePath(), root.getPackageJson(), true),
      ...(definition ? discoverPackages(root, definition) : []),
    ];
  }

  /** The root package, the single source of truth for the version. */
  public getRoot(): Project {
    return this.root;
  }

  /** `true` if the root defines a workspace (monorepo mode). */
  public isMonorepo(): boolean {
    return this.definition !== undefined;
  }

  /**
   * All packages of the workspace: the root package first, followed by the
   * workspace packages ordered by path. Contains only the root package if the
   * repository is not a workspace.
   */
  public getPackages(): readonly WorkspacePackage[] {
    return this.packages;
  }

  /**
   * The pnpm catalogs declared in the root `pnpm-workspace.yaml`, keyed by
   * catalog name. The default catalog (`catalog:` or `catalogs.default`) is
   * available under `"default"`. Catalogs are read from any
   * `pnpm-workspace.yaml`, including a settings-only one. Empty if there is
   * none.
   *
   * @throws if the catalogs are malformed or both `catalog` and
   * `catalogs.default` are declared (as pnpm does)
   */
  public getCatalogs(): Catalogs {
    this.catalogs ??= readCatalogs(this.root.getBasePath());
    return this.catalogs;
  }

  /**
   * Resolves a `catalog:` (default catalog) or `catalog:<name>` specifier of
   * the dependency `dependencyName` to the specifier held by the catalog, the
   * way pnpm does. Other specifiers are returned unchanged.
   *
   * @returns the resolved specifier, or `undefined` if the catalog or its
   * entry for the dependency does not exist
   */
  public resolveCatalogSpecifier(
    dependencyName: string,
    specifier: string,
  ): string | undefined {
    if (!specifier.startsWith(CATALOG_PROTOCOL)) {
      return specifier;
    }
    const name = specifier.slice(CATALOG_PROTOCOL.length).trim() || "default";
    return this.getCatalogs()[name]?.[dependencyName];
  }
}

/** pnpm catalogs keyed by catalog name, the default catalog as `"default"` */
export type Catalogs = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

const CATALOG_PROTOCOL = "catalog:";

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface WorkspaceDefinition {
  /** file that declares the workspace */
  file: string;
  /** `pnpm`: `pnpm-workspace.yaml`, `package.json`: npm/yarn `workspaces` */
  type: "pnpm" | "package.json";
  /** package globs, including negations */
  patterns: string[];
}

const PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml";

function readWorkspaceDefinition(
  dir: string,
  pkg?: PackageJson,
): WorkspaceDefinition | undefined {
  const pnpmFile = path.join(dir, PNPM_WORKSPACE_FILE);
  if (existsSync(pnpmFile)) {
    const manifest = readYaml(pnpmFile);
    // A pnpm-workspace.yaml that only holds settings is not a workspace.
    if (isRecord(manifest) && Object.hasOwn(manifest, "packages")) {
      return {
        file: pnpmFile,
        type: "pnpm",
        patterns: toPatterns(manifest.packages, pnpmFile, "packages"),
      };
    }
  }

  const packageFile = path.join(dir, "package.json");
  const packageJson = pkg ?? readPackageJsonIfExists(packageFile);
  if (packageJson?.workspaces !== undefined) {
    const { workspaces } = packageJson;
    // npm: `workspaces: [...]`, yarn classic: `workspaces: { packages: [...] }`
    const patterns = Array.isArray(workspaces)
      ? workspaces
      : isRecord(workspaces)
        ? workspaces.packages
        : workspaces;
    return {
      file: packageFile,
      type: "package.json",
      patterns: toPatterns(patterns, packageFile, "workspaces"),
    };
  }
  return undefined;
}

/**
 * Fails if `dir` is located inside a workspace whose root is a parent
 * directory. The search stops at the root of the git repository containing
 * `dir`, so a repository nested in a foreign workspace directory is not
 * affected.
 */
function assertNotInsideWorkspace(dir: string): void {
  let current = path.resolve(dir);
  while (!existsSync(path.join(current, ".git"))) {
    const parent = path.dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
    if (readWorkspaceDefinition(current)) {
      throw new Error(
        `"${dir}" is inside the workspace at "${current}". ` +
          "js-project must be run from the workspace root: " +
          `change to "${current}" and run the command again.`,
      );
    }
  }
}

function assertSupportedPackageManager(
  definition: WorkspaceDefinition,
  packageManager: SupportedPackageManager,
): void {
  if (packageManager !== "pnpm") {
    throw new Error(
      `Monorepo mode currently requires pnpm, but package manager "${packageManager}" ` +
        `is used for the workspace declared in "${definition.file}". ` +
        "Run the command with --package-manager pnpm or set JS_PROJECT_PACKAGE_MANAGER=pnpm.",
    );
  }
  if (definition.type !== "pnpm") {
    throw new Error(
      `Monorepo mode currently requires a pnpm workspace, but the workspace is declared ` +
        `by the "workspaces" field in "${definition.file}", which pnpm ignores. ` +
        `Declare the workspace packages under "packages:" in ${PNPM_WORKSPACE_FILE} instead.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** manifest file names pnpm recognises, in pnpm's order of precedence */
const MANIFEST_FILES = ["package.json", "package.json5", "package.yaml"];

/** directories pnpm never searches for workspace packages */
const IGNORED_DIRECTORIES = ["**/node_modules/**", "**/bower_components/**"];

/**
 * Resolves the workspace globs the way pnpm does: every pattern (and
 * negation) matches package directories by their manifest file, dot
 * directories are only matched explicitly, `node_modules` and
 * `bower_components` are skipped, and negations apply regardless of their
 * position in the list. Symbolic links are not followed (as in pnpm 12;
 * pnpm 10 follows them), so no package can point outside the repository.
 */
function discoverPackages(
  root: Project,
  definition: WorkspaceDefinition,
): WorkspacePackage[] {
  const rootDir = root.getBasePath();
  const globs = definition.patterns.flatMap((pattern) =>
    MANIFEST_FILES.map((file) => pattern.replace(/\/?$/, `/${file}`)),
  );
  const manifestDirs = new Set(
    globSync(globs, {
      cwd: rootDir,
      ignore: IGNORED_DIRECTORIES,
      expandDirectories: false,
      followSymbolicLinks: false,
      absolute: true,
    }).map((file) => path.dirname(path.resolve(file))),
  );
  manifestDirs.delete(path.resolve(rootDir));

  return [...manifestDirs].sort().map((dir) => {
    const manifestPath = path.join(dir, "package.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `Workspace package "${path.relative(rootDir, dir)}" has no package.json. ` +
          "package.yaml and package.json5 manifests are not supported.",
      );
    }
    return new WorkspacePackage(manifestPath, readJson(manifestPath), false);
  });
}

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

/**
 * Reads the catalogs of `pnpm-workspace.yaml` in `dir` like pnpm does:
 * `{ default: catalog, ...catalogs }`, rejecting a default catalog that is
 * declared twice.
 */
function readCatalogs(dir: string): Catalogs {
  const file = path.join(dir, PNPM_WORKSPACE_FILE);
  if (!existsSync(file)) {
    return {};
  }
  const manifest = readYaml(file);
  if (!isRecord(manifest)) {
    return {};
  }
  const catalogs: Record<string, Record<string, string>> = {};
  if (manifest.catalogs !== undefined && manifest.catalogs !== null) {
    if (!isRecord(manifest.catalogs)) {
      throw new Error(`"catalogs" in "${file}" must be a map of catalogs`);
    }
    for (const [name, catalog] of Object.entries(manifest.catalogs)) {
      catalogs[name] = toCatalog(catalog, file, `catalogs.${name}`);
    }
  }
  if (manifest.catalog !== undefined && manifest.catalog !== null) {
    if (catalogs.default !== undefined) {
      throw new Error(
        `"${file}" declares the default catalog twice: ` +
          'use either "catalog" or "catalogs.default"',
      );
    }
    catalogs.default = toCatalog(manifest.catalog, file, "catalog");
  }
  return catalogs;
}

function toCatalog(
  value: unknown,
  file: string,
  key: string,
): Record<string, string> {
  if (value === null || value === undefined) {
    return {};
  }
  if (
    isRecord(value) &&
    Object.values(value).every((specifier) => typeof specifier === "string")
  ) {
    return value as Record<string, string>;
  }
  throw new Error(
    `"${key}" in "${file}" must map dependency names to version specifiers`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPatterns(value: unknown, file: string, key: string): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === "string" && v.trim() !== "")
  ) {
    return value;
  }
  throw new Error(`"${key}" in "${file}" must be a list of glob patterns`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readYaml(file: string): unknown {
  try {
    return parseYaml(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Unable to parse "${file}": ${errorMessage(error)}`);
  }
}

function readJson(file: string): PackageJson {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read "${file}": ${errorMessage(error)}`);
  }
}

function readPackageJsonIfExists(file: string): PackageJson | undefined {
  return existsSync(file) ? readJson(file) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
