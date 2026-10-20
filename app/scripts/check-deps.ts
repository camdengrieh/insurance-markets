import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { REPO_DIR, isMain, report, type Violation } from "./lib.ts";

// Dependency pins and supply-chain settings (docs/dapp-design.md section 6 row 3, note 28 section 8.4).
//
// Offline: it reads app/package.json, app/pnpm-workspace.yaml, app/pnpm-lock.yaml, scripts/dependencies.json
// and the root package.json. It fails when a dependency is not an exact version, is undocumented, has an
// install hook, lacks provenance without a written exception, is younger than 14 days at the date it was
// recorded, differs from the plugin's pin for a shared package, or when a supply-chain setting is missing.

export interface DepsOptions {
  readonly repoRoot?: string;
  readonly appDir?: string;
  // Injected so a test can change the date.
  readonly now?: Date;
}

interface DepRecord {
  readonly kind: "runtime" | "dev";
  readonly version: string;
  readonly license: string;
  readonly installHooks: boolean;
  readonly provenance: boolean;
  readonly published: string;
  readonly reason: string;
}

interface DependencyFile {
  readonly checkedAt: string;
  readonly minimumAgeDays: number;
  readonly parity: { readonly packages: readonly string[] };
  readonly direct: Readonly<Record<string, DepRecord>>;
  readonly provenanceExceptions: Readonly<Record<string, string>>;
  readonly transitiveInstallScripts: Readonly<Record<string, string>>;
  readonly allowBuilds: Readonly<Record<string, string>>;
}

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly packageManager?: string;
  readonly engines?: Readonly<Record<string, string>>;
}

const EXACT = /^\d+\.\d+\.\d+$/;
const REQUIRED_RELEASE_AGE_MINUTES = 14 * 24 * 60;

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

// The handful of top-level settings the workspace file carries. Not a general YAML parser: a line that
// does not look like `key: value` at column 0 is ignored.
export function parseWorkspaceSettings(text: string): Map<string, string> {
  const settings = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (match?.[1] !== undefined) settings.set(match[1], match[2] ?? "");
  }
  return settings;
}

export async function checkDeps(options: DepsOptions = {}): Promise<Violation[]> {
  const repoRoot = options.repoRoot ?? REPO_DIR;
  const appDir = options.appDir ?? resolve(repoRoot, "app");
  const now = options.now ?? new Date();
  const violations: Violation[] = [];
  const bad = (file: string, rule: string, detail: string): void => {
    violations.push({ file, rule, detail });
  };

  const pkg = await readJson<PackageJson>(join(appDir, "package.json"));
  const doc = await readJson<DependencyFile>(join(appDir, "scripts", "dependencies.json"));
  const declared: Record<string, { version: string; kind: "runtime" | "dev" }> = {};
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) declared[name] = { version, kind: "runtime" };
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) declared[name] = { version, kind: "dev" };

  if (pkg.packageManager !== "pnpm@11.11.0") bad("app/package.json", "package-manager", `packageManager must be pnpm@11.11.0, found ${pkg.packageManager ?? "none"}`);
  if (pkg.engines?.node === undefined || pkg.engines.pnpm !== "11.11.0") bad("app/package.json", "engines", "engines must pin node 24.x and pnpm 11.11.0");

  // ---- pins and documentation ----------------------------------------------------------------------------------------------
  for (const [name, { version, kind }] of Object.entries(declared)) {
    if (!EXACT.test(version)) bad("app/package.json", "not-exact", `${name}@${version} is not an exact version (no ^, ~, range, tag, url or workspace link)`);
    const record = doc.direct[name];
    if (record === undefined) {
      bad("app/scripts/dependencies.json", "undocumented", `${name} has no entry (licence, hooks, provenance, reason)`);
      continue;
    }
    if (record.version !== version) bad("app/scripts/dependencies.json", "version-mismatch", `${name}: documented ${record.version}, package.json ${version}`);
    if (record.kind !== kind) bad("app/scripts/dependencies.json", "kind-mismatch", `${name}: documented ${record.kind}, package.json ${kind}`);
    if (record.license.trim() === "") bad("app/scripts/dependencies.json", "no-license", `${name} has no licence recorded`);
    if (record.reason.trim().length < 10) bad("app/scripts/dependencies.json", "no-reason", `${name} needs a written reason`);
    if (record.installHooks) bad("app/scripts/dependencies.json", "install-hook", `${name} declares an install script`);
    if (!record.provenance && (doc.provenanceExceptions[name] ?? "").trim() === "") {
      bad("app/scripts/dependencies.json", "no-provenance", `${name} has no npm provenance and no written exception`);
    }
    const ageDays = (Date.parse(doc.checkedAt) - Date.parse(record.published)) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays < doc.minimumAgeDays) {
      bad("app/scripts/dependencies.json", "too-new", `${name}@${version} was ${Number.isFinite(ageDays) ? ageDays.toFixed(1) : "unknown"} days old when recorded (minimum ${doc.minimumAgeDays})`);
    }
  }
  for (const name of Object.keys(doc.direct)) {
    if (declared[name] === undefined) bad("app/scripts/dependencies.json", "stale-entry", `${name} is documented but not in package.json`);
  }
  for (const name of Object.keys(doc.provenanceExceptions)) {
    if (doc.direct[name]?.provenance !== false) bad("app/scripts/dependencies.json", "stale-exception", `${name} has a provenance exception but is not recorded as lacking provenance`);
  }
  if (Number.isNaN(Date.parse(doc.checkedAt)) || Date.parse(doc.checkedAt) > now.getTime() + 86_400_000) {
    bad("app/scripts/dependencies.json", "checked-at", "checkedAt is not a date in the past");
  }

  // ---- parity with the plugin ---------------------------------------------------------------------------------------------------
  let root: PackageJson | undefined;
  try {
    root = await readJson<PackageJson>(join(repoRoot, "package.json"));
  } catch {
    bad("package.json", "root-unreadable", "the root package.json could not be read for the parity check");
  }
  if (root !== undefined) {
    const rootVersions: Record<string, string | undefined> = { ...(root.devDependencies ?? {}), ...(root.dependencies ?? {}) };
    for (const name of doc.parity.packages) {
      const here = declared[name]?.version;
      const there = rootVersions[name];
      if (here === undefined || there === undefined) bad("app/package.json", "parity-missing", `${name} is not pinned in both workspaces`);
      else if (here !== there) bad("app/package.json", "parity", `${name}: app ${here}, plugin ${there}; the shared sources compile against both, so they must match`);
    }
  }

  // ---- workspace settings ----------------------------------------------------------------------------------------------------------
  const workspace = parseWorkspaceSettings(await readFile(join(appDir, "pnpm-workspace.yaml"), "utf8"));
  const age = Number(workspace.get("minimumReleaseAge"));
  if (!Number.isFinite(age) || age < REQUIRED_RELEASE_AGE_MINUTES) bad("app/pnpm-workspace.yaml", "release-age", `minimumReleaseAge must be at least ${REQUIRED_RELEASE_AGE_MINUTES} minutes (14 days); found ${workspace.get("minimumReleaseAge") ?? "unset"}`);
  if (workspace.get("blockExoticSubdeps") !== "true") bad("app/pnpm-workspace.yaml", "exotic-subdeps", "blockExoticSubdeps must be true");
  if (workspace.get("trustPolicy") !== "no-downgrade") bad("app/pnpm-workspace.yaml", "trust-policy", "trustPolicy must be no-downgrade");
  if (workspace.get("allowBuilds") !== "{}") {
    bad("app/pnpm-workspace.yaml", "allow-builds", "allowBuilds must be {} (no dependency may run an install script); add a name only with a reason in dependencies.json and a change here");
  }
  if (Object.keys(doc.allowBuilds).length > 0) bad("app/scripts/dependencies.json", "allow-builds", "allowBuilds is expected to stay empty");

  // ---- lockfile -------------------------------------------------------------------------------------------------------------------------
  let lock: string;
  try {
    lock = await readFile(join(appDir, "pnpm-lock.yaml"), "utf8");
  } catch {
    bad("app/pnpm-lock.yaml", "no-lockfile", "app/pnpm-lock.yaml is missing");
    return violations;
  }
  if (!/^lockfileVersion: '9\.0'/m.test(lock)) bad("app/pnpm-lock.yaml", "lockfile-version", "expected lockfileVersion 9.0");
  const importers = lock.split("\nimporters:\n")[1]?.split("\npackages:\n")[0] ?? "";
  for (const [name, { version }] of Object.entries(declared)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\/@]/g, "\\$&");
    const match = new RegExp(`^ {6}'?${escaped}'?:\\n {8}specifier: ([^\\n]+)\\n`, "m").exec(importers);
    if (match?.[1] === undefined) bad("app/pnpm-lock.yaml", "lock-missing", `${name} is not in the lockfile importers (run the install)`);
    else if (match[1].replace(/'/g, "") !== version) bad("app/pnpm-lock.yaml", "lock-specifier", `${name}: lockfile specifier ${match[1]}, package.json ${version}`);
  }
  const packagesSection = lock.split("\npackages:\n")[1]?.split("\nsnapshots:\n")[0] ?? "";
  const entries = packagesSection.split(/\n(?=  \S)/).filter((entry) => /^\s*\S/.test(entry));
  for (const entry of entries) {
    const id = /^ {2}'?([^'\n:]+(?:@[^'\n:]+)?)'?:/.exec(entry)?.[1] ?? "?";
    if (!/integrity: sha512-/.test(entry)) bad("app/pnpm-lock.yaml", "no-integrity", `${id} has no sha512 integrity`);
    if (/tarball:|repo:|type: git|directory:/.test(entry)) bad("app/pnpm-lock.yaml", "exotic-source", `${id} is not a plain registry package`);
    if (/requiresBuild: true/.test(entry)) bad("app/pnpm-lock.yaml", "requires-build", `${id} requires a build step`);
  }
  for (const id of Object.keys(doc.transitiveInstallScripts)) {
    if (id === "note") continue;
    if (!lock.includes(`'${id}'`) && !lock.includes(`${id}:`)) bad("app/scripts/dependencies.json", "stale-install-script-note", `${id} is documented as an ignored install script but is not in the lockfile`);
  }
  return violations;
}

if (isMain(import.meta.url)) {
  process.exitCode = report("check-deps", await checkDeps());
}
