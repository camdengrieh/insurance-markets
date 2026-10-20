import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { REPO_DIR, isMain, report, type Violation } from "./lib.ts";

// Acceptance W0-1: installing the app's dependencies does not touch the plugin's root files.
//
// Hashes the root package.json, pnpm-workspace.yaml and pnpm-lock.yaml, runs
// `pnpm --dir app install --frozen-lockfile`, hashes them again and fails if any hash changed. The
// comparison is within one run because another stream may be editing the root files at the same time.
// pnpm picks the workspace from the nearest pnpm-workspace.yaml upward, and app/ has its own.

export const ROOT_FILES = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"] as const;

export async function hashRootFiles(repoRoot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of ROOT_FILES) {
    try {
      out[name] = createHash("sha256").update(await readFile(join(repoRoot, name))).digest("hex");
    } catch {
      out[name] = "missing";
    }
  }
  return out;
}

export type Installer = (repoRoot: string) => Promise<void>;

const run = promisify(execFile);

// An argument array, no shell. The caller's PATH must reach pnpm (source .tools/env.sh first).
export const pnpmInstall: Installer = async (repoRoot) => {
  await run("pnpm", ["--dir", "app", "install", "--frozen-lockfile"], { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 });
};

export interface IsolationOptions {
  readonly repoRoot?: string;
  readonly install?: Installer;
}

export async function checkRootIsolation(options: IsolationOptions = {}): Promise<{ violations: Violation[]; before: Record<string, string>; after: Record<string, string> }> {
  const repoRoot = options.repoRoot ?? REPO_DIR;
  const before = await hashRootFiles(repoRoot);
  await (options.install ?? pnpmInstall)(repoRoot);
  const after = await hashRootFiles(repoRoot);
  const violations: Violation[] = [];
  for (const name of ROOT_FILES) {
    if (before[name] !== after[name]) violations.push({ file: name, rule: "root-changed", detail: `changed during the app install (${before[name]?.slice(0, 12)} -> ${after[name]?.slice(0, 12)})` });
  }
  return { violations, before, after };
}

if (isMain(import.meta.url)) {
  const result = await checkRootIsolation();
  for (const name of ROOT_FILES) console.log(`  ${name} ${result.before[name]?.slice(0, 16)} -> ${result.after[name]?.slice(0, 16)}`);
  process.exitCode = report("check-root-isolation", result.violations);
}
