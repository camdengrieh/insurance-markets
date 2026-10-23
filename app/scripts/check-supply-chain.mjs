import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { APP_DIR, REPO_DIR, isMain, report } from "./lib.ts";

// Supply-chain checks that go beyond check-deps.ts (which reads package.json, dependencies.json, the workspace settings and the
// lockfile text). This one looks at what is actually on disk and at every file that could change what an install does:
//
//   1. the INSTALLED tree (app/node_modules/.pnpm): no package carries a preinstall, install or postinstall script or a binding.gyp
//      (an implicit node-gyp build) unless dependencies.json documents it, and nothing is installed that the lockfile does not list;
//   2. the install-time hooks of the workspace: no .pnpmfile.cjs, no .npmrc that turns scripts back on, points at another registry or
//      carries a token, and no setting in pnpm-workspace.yaml that widens what an install may do (overrides, patches, build
//      allowances, release-age or trust exclusions);
//   3. app/package.json: no lifecycle script of its own, no overrides or resolutions, no patched or bundled dependencies;
//   4. the lockfile's growth: a ceiling on the number of packages, so a new dependency cannot arrive unnoticed (it needs the W0 owner);
//   5. the root workspace: the release-age gate is set there too (open ask A6) and has no exclusion list;
//   6. the Playwright browsers live in a gitignored project-local directory, never in the repository index or the home directory.
//
// Offline and read-only. `node scripts/check-supply-chain.mjs` prints violations and sets the exit code; the function is exported for
// tests, which point it at temporary trees.

/** @typedef {{ file: string, rule: string, detail: string, line?: number }} Violation */

const REQUIRED_RELEASE_AGE_MINUTES = 14 * 24 * 60;
// 111 packages at 2026-10-19. Real growth is possible, but only through the W0 owner (a dependencies.json entry), who raises this.
// 2026-10-23: 133 -> 248 with wallet connection. @walletconnect/sign-client 2.17.5 brings 114 packages (its logger, key-value
// storage, relay transport and their transitive dependencies; dependencies.json says why that version) and uqr 1. The ceiling is
// the new count plus a small margin, so the next dependency is again a reviewed change.
export const MAX_LOCK_PACKAGES = 260;
const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack", "dependencies"];
const INSTALL_TIME_SCRIPTS = ["preinstall", "install", "postinstall"];
const FORBIDDEN_PACKAGE_JSON_KEYS = ["overrides", "resolutions", "patchedDependencies", "bundledDependencies", "bundleDependencies", "optionalDependencies", "dependenciesMeta", "pnpm"];
const ALLOWED_WORKSPACE_KEYS = new Set(["packages", "minimumReleaseAge", "blockExoticSubdeps", "trustPolicy", "allowBuilds"]);
const DEFAULT_REGISTRY = /^https:\/\/registry\.npmjs\.org\/?$/;

/** @param {string} path */
async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** The top-level `key: value` lines of a workspace file (no general YAML). @param {string} text */
function topLevelKeys(text) {
  /** @type {Map<string, string>} */
  const keys = new Map();
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (match?.[1] !== undefined) keys.set(match[1], match[2] ?? "");
  }
  return keys;
}

/** `name@version` ids of the lockfile's packages section. @param {string} lock */
export function lockPackageIds(lock) {
  const section = lock.split("\npackages:\n")[1]?.split("\nsnapshots:\n")[0] ?? "";
  /** @type {string[]} */
  const ids = [];
  for (const line of section.split("\n")) {
    const match = /^ {2}'?((?:@[^/'\s]+\/)?[^@'\s]+@[^'\s:]+)'?:\s*$/.exec(line);
    if (match?.[1] !== undefined) ids.push(match[1]);
  }
  return ids;
}

/** Folder names in node_modules/.pnpm -> package id without the peer suffix: `@scope+name@1.2.3_peer@4` -> `@scope/name@1.2.3`. @param {string} folder */
export function idOfPnpmFolder(folder) {
  // The peer suffix starts at the first "_" after the version: a name may itself hold one (string_decoder@1.3.0).
  const withoutPeers = folder.replace(/(@\d+\.\d+\.\d+[^_]*)_.*$/, "$1");
  const at = withoutPeers.lastIndexOf("@");
  if (at <= 0) return null;
  const name = withoutPeers.slice(0, at).replace("+", "/");
  const version = withoutPeers.slice(at + 1);
  return /^\d+\.\d+\.\d+/.test(version) ? `${name}@${version}` : null;
}

/**
 * @param {{ appDir?: string, repoRoot?: string, requireInstalled?: boolean }} [options]
 * @returns {Promise<Violation[]>}
 */
export async function checkSupplyChain(options = {}) {
  const appDir = options.appDir ?? APP_DIR;
  const repoRoot = options.repoRoot ?? resolve(appDir, "..");
  /** @type {Violation[]} */
  const violations = [];
  /** @param {string} file @param {string} rule @param {string} detail */
  const bad = (file, rule, detail) => void violations.push({ file, rule, detail });

  // ---- 3. package.json ------------------------------------------------------------------------------------------------------
  const packageText = await readText(join(appDir, "package.json"));
  if (packageText === null) {
    bad("app/package.json", "unreadable", "app/package.json could not be read");
  } else {
    /** @type {{ scripts?: Record<string, string> } & Record<string, unknown>} */
    const pkg = JSON.parse(packageText);
    for (const name of Object.keys(pkg.scripts ?? {})) {
      if (LIFECYCLE_SCRIPTS.includes(name)) bad("app/package.json", "lifecycle-script", `scripts.${name} would run during an install or a publish`);
    }
    for (const key of FORBIDDEN_PACKAGE_JSON_KEYS) {
      if (key in pkg) bad("app/package.json", "install-shaping-field", `"${key}" changes what an install resolves or builds; it needs the W0 owner and a written reason`);
    }
  }

  // ---- 2. install-time hooks ------------------------------------------------------------------------------------------------------------
  for (const hook of [".pnpmfile.cjs", ".pnpmfile.mjs", "pnpmfile.cjs", ".yarnrc.yml", ".yarnrc"]) {
    if (existsSync(join(appDir, hook))) bad(`app/${hook}`, "install-hook", `${hook} can rewrite dependencies during an install`);
  }
  for (const rcName of [".npmrc"]) {
    const rc = await readText(join(appDir, rcName));
    if (rc === null) continue;
    for (const [index, raw] of rc.split("\n").entries()) {
      const line = raw.trim();
      if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
      const [key = "", ...rest] = line.split("=");
      const value = rest.join("=").trim();
      if (/^ignore-scripts$/i.test(key.trim()) && value !== "true") bad(`app/${rcName}`, "scripts-enabled", `ignore-scripts must stay true (line ${index + 1})`);
      if (/_authToken|_auth\b|_password|:_authToken/i.test(key)) bad(`app/${rcName}`, "credential", `line ${index + 1} carries a registry credential; none belongs in the repository`);
      if (/registry$/i.test(key.trim()) && !DEFAULT_REGISTRY.test(value)) bad(`app/${rcName}`, "other-registry", `line ${index + 1} points the install at ${value.length > 60 ? "another registry" : value}`);
      if (/^(unsafe-perm|node-options|script-shell|shell-emulator|enable-pre-post-scripts)$/i.test(key.trim())) bad(`app/${rcName}`, "script-setting", `${key.trim()} changes how install scripts run (line ${index + 1})`);
    }
  }
  const workspaceText = await readText(join(appDir, "pnpm-workspace.yaml"));
  if (workspaceText === null) {
    bad("app/pnpm-workspace.yaml", "unreadable", "app/pnpm-workspace.yaml could not be read");
  } else {
    for (const key of topLevelKeys(workspaceText).keys()) {
      if (!ALLOWED_WORKSPACE_KEYS.has(key)) bad("app/pnpm-workspace.yaml", "unknown-setting", `"${key}" is not one of ${[...ALLOWED_WORKSPACE_KEYS].join(", ")}; overrides, patches, catalogs, build allowances and age or trust exclusions all widen what an install may do`);
    }
    if (/^\s+-\s+(?!["']?\.["']?\s*$)/m.test(workspaceText.split("packages:")[1]?.split(/\n[A-Za-z]/)[0] ?? "")) {
      bad("app/pnpm-workspace.yaml", "extra-workspace-package", "the app workspace must contain only itself (.)");
    }
  }

  // ---- 5. the root workspace ---------------------------------------------------------------------------------------------------
  const rootWorkspace = await readText(join(repoRoot, "pnpm-workspace.yaml"));
  if (rootWorkspace !== null) {
    const keys = topLevelKeys(rootWorkspace);
    const age = Number(keys.get("minimumReleaseAge"));
    if (!Number.isFinite(age) || age < REQUIRED_RELEASE_AGE_MINUTES) bad("pnpm-workspace.yaml", "root-release-age", `the root workspace needs minimumReleaseAge of at least ${REQUIRED_RELEASE_AGE_MINUTES} minutes (open ask A6); found ${keys.get("minimumReleaseAge") ?? "unset"}`);
    if (keys.has("minimumReleaseAgeExclude")) bad("pnpm-workspace.yaml", "root-release-age-exclusion", "minimumReleaseAgeExclude lets named packages skip the age gate");
  }

  // ---- 4. lockfile growth -----------------------------------------------------------------------------------------------------------
  const lock = await readText(join(appDir, "pnpm-lock.yaml"));
  /** @type {Set<string>} */
  let locked = new Set();
  if (lock === null) {
    bad("app/pnpm-lock.yaml", "no-lockfile", "app/pnpm-lock.yaml is missing");
  } else {
    const ids = lockPackageIds(lock);
    locked = new Set(ids);
    if (ids.length === 0) bad("app/pnpm-lock.yaml", "unparsed", "no package could be read from the lockfile; the check would be vacuous");
    if (ids.length > MAX_LOCK_PACKAGES) bad("app/pnpm-lock.yaml", "lockfile-growth", `${ids.length} packages in the lockfile, ceiling ${MAX_LOCK_PACKAGES}; a new dependency needs the W0 owner and a dependencies.json entry`);
    for (const id of ids) {
      const version = id.slice(id.lastIndexOf("@") + 1);
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) bad("app/pnpm-lock.yaml", "non-registry-version", `${id} is not a plain registry version`);
    }
  }

  // ---- 1. the installed tree ----------------------------------------------------------------------------------------------------
  const registryText = await readText(join(appDir, "scripts", "dependencies.json"));
  /** @type {Set<string>} */
  const documentedScripts = new Set();
  if (registryText !== null) {
    const registry = JSON.parse(registryText);
    for (const id of Object.keys(registry.transitiveInstallScripts ?? {})) if (id !== "note") documentedScripts.add(id);
  }
  const pnpmDir = join(appDir, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) {
    if (options.requireInstalled === true) bad("app/node_modules", "not-installed", "app/node_modules/.pnpm does not exist; run `pnpm --dir app install --frozen-lockfile`");
  } else {
    const folders = (await readdir(pnpmDir, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== "node_modules");
    let scanned = 0;
    for (const folder of folders) {
      const id = idOfPnpmFolder(folder.name);
      if (id === null) {
        bad(`app/node_modules/.pnpm/${folder.name}`, "unrecognised-folder", "not a name@version folder; an install does not create these");
        continue;
      }
      if (lock !== null && !locked.has(id)) bad(`app/node_modules/.pnpm/${folder.name}`, "unlocked-package", `${id} is installed but the lockfile does not list it`);
      const name = id.slice(0, id.lastIndexOf("@"));
      const dir = join(pnpmDir, folder.name, "node_modules", ...name.split("/"));
      const text = await readText(join(dir, "package.json"));
      if (text === null) {
        bad(`app/node_modules/.pnpm/${folder.name}`, "no-package-json", `${id} has no package.json at its expected path`);
        continue;
      }
      scanned += 1;
      /** @type {{ name?: string, version?: string, scripts?: Record<string, string> }} */
      const manifest = JSON.parse(text);
      if (manifest.name !== name || manifest.version !== id.slice(id.lastIndexOf("@") + 1)) {
        bad(`app/node_modules/.pnpm/${folder.name}`, "identity-mismatch", `the folder says ${id}, its package.json says ${manifest.name ?? "?"}@${manifest.version ?? "?"}`);
      }
      for (const script of INSTALL_TIME_SCRIPTS) {
        if (manifest.scripts?.[script] !== undefined && !documentedScripts.has(id)) bad(`app/node_modules/.pnpm/${folder.name}`, "install-script", `${id} declares scripts.${script} and dependencies.json does not document it`);
      }
      if (existsSync(join(dir, "binding.gyp")) && !documentedScripts.has(id)) bad(`app/node_modules/.pnpm/${folder.name}`, "native-build", `${id} ships a binding.gyp, which npm builds with node-gyp as an implicit install script`);
    }
    if (scanned === 0) bad("app/node_modules/.pnpm", "vacuous", "no installed package could be read, so nothing was checked");
  }

  // ---- 6. browsers ----------------------------------------------------------------------------------------------------------------------
  const ignore = (await readText(join(appDir, ".gitignore"))) ?? "";
  const rootIgnore = (await readText(join(repoRoot, ".gitignore"))) ?? "";
  if (!/^\.playwright-browsers\/?$/m.test(ignore) && !/(^|\/)\.playwright-browsers\/?$/m.test(rootIgnore)) {
    bad("app/.gitignore", "browsers-not-ignored", ".playwright-browsers/ must be gitignored: a downloaded browser is a binary that must never enter the repository");
  }
  if (!/^test-results\/?$/m.test(ignore) && !/test-results\/?$/m.test(rootIgnore)) bad("app/.gitignore", "results-not-ignored", "test-results/ must be gitignored (traces and screenshots can hold page content)");

  return violations;
}

if (isMain(import.meta.url)) {
  process.exitCode = report("check-supply-chain", await checkSupplyChain({ requireInstalled: process.argv.includes("--require-installed"), repoRoot: REPO_DIR }));
}
