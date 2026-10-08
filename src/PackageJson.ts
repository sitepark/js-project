import type { PackageJson as OriginalPackageJson } from "type-fest";

/**
 * Structure of a `package.json` file.
 *
 * The type is open to arbitrary extra keys so that consumers can read
 * custom configuration from it. Registries are not configured here but
 * exclusively via the `JS_PROJECT_SNAPSHOT_REGISTRY` and
 * `JS_PROJECT_RELEASE_REGISTRY` environment variables.
 */
export type PackageJson = OriginalPackageJson;

/** The dependency sections of a `package.json`. */
export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";

/**
 * The `package.json` text with `version` as its top-level version. Only the
 * value of the existing `version` string changes, so the file keeps its
 * formatting byte for byte. A file without a top-level `version` string is
 * re-serialised with its own indentation, line endings and final newline,
 * `version` added as the last key.
 */
export function setPackageJsonVersion(text: string, version: string): string {
  const pkg: PackageJson = JSON.parse(text);
  const span = versionValueSpan(text);
  if (span !== undefined) {
    return `${text.slice(0, span.start)}${JSON.stringify(version)}${text.slice(span.end)}`;
  }
  pkg.version = version;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.stringify(pkg, null, indentationOf(text)).replace(
    /\n/g,
    eol,
  );
  return /\n$/.test(text) ? `${json}${eol}` : json;
}

/**
 * Start and end of the string value of the top-level `version` key, quotes
 * included. Keys and strings of nested values are skipped, so e.g.
 * `"engines": { "version": … }` never matches.
 */
function versionValueSpan(
  text: string,
): { start: number; end: number } | undefined {
  let depth = 0;
  let inValue = false;
  let key: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = endOfString(text, i);
      if (depth === 1) {
        if (!inValue) {
          key = JSON.parse(text.slice(i, end));
        } else if (key === "version") {
          return { start: i, end };
        }
      }
      i = end - 1;
    } else if (char === "{" || char === "[") {
      depth++;
    } else if (char === "}" || char === "]") {
      depth--;
    } else if (depth === 1 && char === ":") {
      inValue = true;
    } else if (depth === 1 && char === ",") {
      inValue = false;
    }
  }
  return undefined;
}

/** the index after the closing quote of the string starting at `start` */
function endOfString(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
    } else if (text[i] === '"') {
      return i + 1;
    }
  }
  return text.length;
}

/** tabs, or the spaces of the first indented line (default 2) */
function indentationOf(text: string): string {
  const indentation = /^([ \t]+)\S/m.exec(text)?.[1];
  if (indentation === undefined) {
    return "  ";
  }
  return indentation.startsWith("\t") ? "\t" : indentation;
}
