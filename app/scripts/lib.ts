import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Small helpers shared by the check scripts. Every check is a pure-ish async function that returns a list
// of violations; the CLI part of each script only prints them and sets the exit code, so tests call the
// function directly.

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = resolve(APP_DIR, "..");

export interface Violation {
  // Repo-relative path with forward slashes, or a short subject such as "app/package.json".
  readonly file: string;
  readonly rule: string;
  readonly detail: string;
  readonly line?: number;
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function relPosix(root: string, path: string): string {
  return toPosix(relative(root, path));
}

export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

// Every file under `dir` (absolute paths), skipping the named directories.
export async function walk(dir: string, skipDirs: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) out.push(...(await walk(full, skipDirs)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out.sort();
}

export const SOURCE_FILE = /\.(?:[cm]?[tj]sx?)$/;
export const TEST_FILE = /\.(?:test|spec)\.[cm]?[tj]sx?$/;

export function formatViolation(violation: Violation): string {
  const where = violation.line === undefined ? violation.file : `${violation.file}:${violation.line}`;
  return `  ${where}  [${violation.rule}] ${violation.detail}`;
}

// Prints the outcome of a check and returns the process exit code.
export function report(name: string, violations: readonly Violation[]): number {
  if (violations.length === 0) {
    console.log(`${name}: ok`);
    return 0;
  }
  console.error(`${name}: ${violations.length} violation${violations.length === 1 ? "" : "s"}`);
  for (const violation of violations) console.error(formatViolation(violation));
  return 1;
}

// True when this module is the process entry point (so a test can import a script without running it).
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(metaUrl) === resolve(entry);
}
