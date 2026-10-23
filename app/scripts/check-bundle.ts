import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { BUILD_TARGETS, type BuildTarget } from "../headers.config.ts";
import { buildApp, buildSmoke, listFiles, type BuildResult } from "./build-lib.ts";
import { APP_DIR, isMain, report, type Violation } from "./lib.ts";
import { htmlViolations, originViolations } from "./policy.ts";

// What actually ships (acceptance W0-2 and the hostname grep of docs/dapp-design.md section 7.2 W0).
//
// For a built directory: only expected file types and no source maps; every page passes the HTML rules (no
// inline script or style, nothing external); every hostname-shaped URL in script, style, page or image is an
// origin from headers.config.ts or a documented inert host; no eval-like sink beyond the documented probe.
// For a build that recorded its module ids: exactly one copy of viem and one of zod.
//
// With no arguments it builds the smoke fixture for both targets (and the real app once src/main.tsx
// exists) into temporary directories and inspects those. `--dist <dir>` inspects an existing directory.

const ALLOWED_EXTENSIONS = new Set([".html", ".js", ".css", ".svg", ".png", ".webp", ".ico", ".woff2", ".txt", ".json"]);
const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".svg", ".json", ".txt"]);

// Code sinks. `Function("")` with an empty body is zod's capability probe; the build sets zod to jitless
// first (vite-base.ts zodJitlessPlugin), which skips the probe. Anything else is a violation.
const SINKS: ReadonlyArray<{ readonly name: string; readonly pattern: RegExp }> = [
  { name: "eval", pattern: /\beval\s*\(/ },
  { name: "new Function with a body", pattern: /new\s+Function\s*\(\s*[^)\s`"']/ },
  { name: "Function with a body", pattern: /(?<![.\w])Function\s*\(\s*[`"'][^`"']/ },
  { name: "string timer", pattern: /\bset(?:Timeout|Interval)\s*\(\s*[`"']/ },
  { name: "document.write", pattern: /document\s*\.\s*write(?:ln)?\s*\(/ },
];

// The one documented exception: lodash's global-object probe (lodash.isequal, inside the WalletConnect chunk),
// `root = freeGlobal || freeSelf || Function("return this")()`. In a page `self` is the window, so the call is
// short-circuited and never runs; were it ever reached, the CSP (no 'unsafe-eval') would refuse it. Only this exact
// shape is removed before the sinks are matched.
export const LODASH_ROOT_PROBE = /typeof self==`object`&&self&&self\.Object===Object&&self,([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\|\|([A-Za-z_$][\w$]*)\|\|Function\(`return this`\)\(\)/g;

export function withoutDocumentedProbes(text: string): string {
  return text.replace(LODASH_ROOT_PROBE, "");
}

function ext(path: string): string {
  const at = path.lastIndexOf(".");
  return at === -1 ? "" : path.slice(at).toLowerCase();
}

export function copyViolations(label: string, moduleIds: readonly string[], packages: readonly string[] = ["viem", "zod"]): Violation[] {
  const violations: Violation[] = [];
  for (const name of packages) {
    const roots = new Set<string>();
    const pattern = new RegExp(`^(.*/node_modules/(?:\\.pnpm/[^/]+/node_modules/)?${name})/`);
    for (const id of moduleIds) {
      const match = pattern.exec(id);
      if (match?.[1] !== undefined) roots.add(match[1]);
    }
    if (roots.size === 0) {
      violations.push({ file: label, rule: "package-missing", detail: `${name} is not in the bundle (the check would be vacuous)` });
    } else if (roots.size > 1) {
      violations.push({ file: label, rule: "duplicate-package", detail: `${roots.size} copies of ${name} in one bundle: ${[...roots].map((root) => root.replace(/^.*?\/node_modules\//, "")).join(", ")}` });
    }
  }
  return violations;
}

export async function inspectDirectory(dir: string, label: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const files = await listFiles(dir);
  if (!files.includes("index.html")) violations.push({ file: label, rule: "no-index", detail: "the build has no index.html" });
  for (const file of files) {
    const name = `${label}/${file}`;
    const extension = ext(file);
    if (extension === ".map") violations.push({ file: name, rule: "source-map", detail: "source maps ship original sources and local paths" });
    else if (!ALLOWED_EXTENSIONS.has(extension)) violations.push({ file: name, rule: "file-type", detail: `unexpected file type ${extension || "(none)"}` });
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const text = await readFile(join(dir, file), "utf8");
    violations.push(...originViolations(name, text));
    if (extension === ".html") violations.push(...htmlViolations(name, text));
    if (extension === ".js") {
      const code = withoutDocumentedProbes(text);
      for (const sink of SINKS) {
        if (sink.pattern.test(code)) violations.push({ file: name, rule: "code-sink", detail: `${sink.name} in the bundle` });
      }
    }
  }
  return violations;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface BundleOptions {
  // Inspect these existing directories only (no module ids, so no copy check).
  readonly dist?: readonly string[];
  readonly targets?: readonly BuildTarget[];
  // Also build and inspect the real app. Defaults to true when app/src/main.tsx or main.ts exists.
  readonly real?: boolean;
}

async function inspectBuild(label: string, build: BuildResult): Promise<Violation[]> {
  try {
    return [...(await inspectDirectory(build.outDir, label)), ...copyViolations(label, build.moduleIds)];
  } finally {
    await build.dispose();
  }
}

export async function checkBundle(options: BundleOptions = {}): Promise<Violation[]> {
  if (options.dist !== undefined && options.dist.length > 0) {
    const out: Violation[] = [];
    for (const dir of options.dist) out.push(...(await inspectDirectory(resolve(dir), dir)));
    return out;
  }
  const violations: Violation[] = [];
  const hasMain = (await exists(join(APP_DIR, "src", "main.tsx"))) || (await exists(join(APP_DIR, "src", "main.ts")));
  for (const target of options.targets ?? BUILD_TARGETS) {
    violations.push(...(await inspectBuild(`smoke/${target}`, await buildSmoke({ target }))));
    if (options.real ?? hasMain) violations.push(...(await inspectBuild(`app/${target}`, await buildApp(target))));
  }
  return violations;
}

if (isMain(import.meta.url)) {
  const dist: string[] = [];
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dist" && args[index + 1] !== undefined) dist.push(args[(index += 1)] ?? "");
  }
  process.exitCode = report("check-bundle", await checkBundle({ dist }));
}
