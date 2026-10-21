import { builtinModules } from "node:module";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import ts from "typescript";

import { REPO_DIR, SOURCE_FILE, TEST_FILE, isMain, lineOf, relPosix, report, walk, type Violation } from "./lib.ts";

// Import boundaries (acceptance W0-4, docs/dapp-design.md section 7.2 and note 28 section 4.3).
//
// Zone A, the bundled code: every non-test file under app/src and everything it reaches. It may import only
// the allowlisted shared files below. It may not import a Node module, the relay, the daemon's internals,
// the HMAC signer or the audit writer, because the page must never hold or touch a secret or a file.
// Zone B, the rest of app/ (tests, e2e, but not scripts/ or node_modules): free to use Node, but never
// relay/, src/local, src/tools or the HMAC and audit modules.
// Reverse rules: nothing in the plugin, the relay or the root tests imports app/, and the plugin graph does
// not import the daemon (bridge/); the daemon may import app/headers.config only.

const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));

// Repo-relative prefixes and files the bundled code may reach outside app/.
const SHARED_ALLOW: readonly RegExp[] = [
  /^src\/xo\//,
  /^src\/clob\//,
  /^src\/guardrails\//,
  /^src\/create\//,
  /^src\/relay\/(?:contract|errors|flags)\.ts$/,
  /^bridge\/contract\.ts$/,
];

// Never reachable from the bundle, with the reason printed in the violation.
// `bundledOnly` rules do not apply to tests and e2e (an e2e spec may start the daemon).
const FORBIDDEN: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string; readonly bundledOnly: boolean }> = [
  { pattern: /^relay\//, reason: "the relay is a server; the page talks to the daemon only through bridge/contract.ts", bundledOnly: false },
  { pattern: /^src\/local\//, reason: "the local runtime is Node-only", bundledOnly: false },
  { pattern: /^src\/tools\//, reason: "plugin tool handlers are Node-only", bundledOnly: false },
  { pattern: /^src\/xo\/signing\/hmac\.ts$/, reason: "the HMAC signer holds a secret; the page never does", bundledOnly: false },
  { pattern: /^src\/clob\/(?:polymarket\/l2|limitless\/hmac)\.ts$/, reason: "the venue request signers hold a credential; the page never does", bundledOnly: false },
  { pattern: /^src\/guardrails\/audit\.ts$/, reason: "the audit writer uses Node streams and files", bundledOnly: false },
  { pattern: /^src\/(?:plugin|local|paybox|config)\.ts$/, reason: "plugin entry points are Node-only", bundledOnly: false },
  { pattern: /^bridge\/(?!contract\.ts$)/, reason: "the daemon's internals never enter the page; only bridge/contract.ts is shared", bundledOnly: true },
];

export interface BoundaryOptions {
  readonly repoRoot?: string;
  readonly appDir?: string;
}

const EXTENSION_CANDIDATES = ["", ".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// Resolves a relative or aliased specifier to a source file, or undefined (assets, json, unresolved).
async function resolveLocal(specifier: string, from: string, repoRoot: string): Promise<string | undefined> {
  let base: string;
  if (specifier.startsWith("@shared/")) base = join(repoRoot, "src", specifier.slice("@shared/".length));
  else if (specifier.startsWith("@bridge/")) base = join(repoRoot, "bridge", specifier.slice("@bridge/".length));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return undefined;
  const stripped = base.replace(/\.(?:[cm]?js|jsx)$/, "");
  const candidates = [base, stripped];
  for (const candidate of candidates) {
    for (const ext of EXTENSION_CANDIDATES) {
      const file = `${candidate}${ext}`;
      if (SOURCE_FILE.test(file) && (await isFile(file))) return file;
    }
    for (const index of ["index.ts", "index.tsx", "index.js"]) {
      const file = join(candidate, index);
      if (await isFile(file)) return file;
    }
  }
  return undefined;
}

interface ImportRef {
  readonly specifier: string;
  readonly line: number;
}

export function importsOf(source: string): ImportRef[] {
  const info = ts.preProcessFile(source, true, true);
  return info.importedFiles.map((ref) => ({ specifier: ref.fileName, line: lineOf(source, ref.pos) }));
}

function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  const head = specifier.split("/")[0] ?? specifier;
  return NODE_BUILTINS.has(head) && !specifier.startsWith(".");
}

export async function checkBoundaries(options: BoundaryOptions = {}): Promise<Violation[]> {
  const repoRoot = options.repoRoot ?? REPO_DIR;
  const appDir = options.appDir ?? resolve(repoRoot, "app");
  const violations: Violation[] = [];
  const rel = (path: string): string => relPosix(repoRoot, path);
  const skip = new Set(["node_modules", "dist", "test-results", "playwright-report", ".playwright-browsers", ".git"]);

  // ---- zone A and B inside app/ ---------------------------------------------------------------------------
  const appFiles = (await walk(appDir, skip)).filter((file) => SOURCE_FILE.test(file) && !rel(file).startsWith("app/scripts/"));
  const bundledEntries = appFiles.filter((file) => rel(file).startsWith("app/src/") && !TEST_FILE.test(file));
  const seen = new Set<string>();
  const queue = [...bundledEntries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const source = await readFile(file, "utf8");
    for (const ref of importsOf(source)) {
      const here = rel(file);
      if (isNodeBuiltin(ref.specifier)) {
        violations.push({ file: here, line: ref.line, rule: "node-builtin", detail: `bundled code imports ${ref.specifier}` });
        continue;
      }
      const target = await resolveLocal(ref.specifier, file, repoRoot);
      if (target === undefined) continue;
      const there = rel(target);
      const forbidden = FORBIDDEN.find((entry) => entry.pattern.test(there));
      if (forbidden !== undefined) {
        violations.push({ file: here, line: ref.line, rule: "forbidden-import", detail: `${ref.specifier} -> ${there}: ${forbidden.reason}` });
        continue;
      }
      if (!there.startsWith("app/") && !SHARED_ALLOW.some((pattern) => pattern.test(there))) {
        violations.push({ file: here, line: ref.line, rule: "not-allowlisted", detail: `${ref.specifier} -> ${there} is outside app/ and not an allowlisted shared source` });
        continue;
      }
      if (there.startsWith("app/") && there.startsWith("app/scripts/")) {
        violations.push({ file: here, line: ref.line, rule: "forbidden-import", detail: `${ref.specifier} -> ${there}: build tooling never enters the bundle` });
        continue;
      }
      queue.push(target);
    }
  }

  // Zone B: tests and e2e inside app/.
  for (const file of appFiles) {
    if (bundledEntries.includes(file)) continue;
    const source = await readFile(file, "utf8");
    for (const ref of importsOf(source)) {
      const target = await resolveLocal(ref.specifier, file, repoRoot);
      if (target === undefined) continue;
      const there = rel(target);
      const forbidden = FORBIDDEN.find((entry) => !entry.bundledOnly && entry.pattern.test(there));
      if (forbidden !== undefined) {
        violations.push({ file: rel(file), line: ref.line, rule: "forbidden-import", detail: `${ref.specifier} -> ${there}: ${forbidden.reason}` });
      }
    }
  }

  // ---- reverse rules ---------------------------------------------------------------------------------------------
  const reverseRoots = ["src", "relay", "test", "bridge", "scripts"];
  for (const root of reverseRoots) {
    for (const file of await walk(join(repoRoot, root), skip)) {
      if (!SOURCE_FILE.test(file)) continue;
      const here = rel(file);
      const source = await readFile(file, "utf8");
      for (const ref of importsOf(source)) {
        if (!ref.specifier.startsWith(".")) continue;
        const target = await resolveLocal(ref.specifier, file, repoRoot);
        const targetPath = target === undefined ? relPosix(repoRoot, resolve(dirname(file), ref.specifier)) : rel(target);
        if (targetPath.startsWith("app/")) {
          const onlyHeaders = /^app\/headers\.config(?:\.[cm]?[tj]s)?$/.test(targetPath);
          if (root === "bridge" && onlyHeaders) continue;
          violations.push({ file: here, line: ref.line, rule: "reverse-import", detail: `${ref.specifier} -> ${targetPath}: ${root === "bridge" ? "the daemon may import app/headers.config only" : "plugin code never imports app/"}` });
        } else if (targetPath.startsWith("bridge/") && (root === "relay" || (root === "src" && !here.startsWith("src/local/")))) {
          violations.push({ file: here, line: ref.line, rule: "reverse-import", detail: `${ref.specifier} -> ${targetPath}: the plugin graph does not import the daemon (only src/local may load it)` });
        }
      }
    }
  }
  return violations;
}

if (isMain(import.meta.url)) {
  process.exitCode = report("check-boundaries", await checkBoundaries());
}
