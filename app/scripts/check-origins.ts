import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { REPO_DIR, SOURCE_FILE, TEST_FILE, isMain, relPosix, report, walk, type Violation } from "./lib.ts";
import { htmlViolations, originViolations } from "./policy.ts";

// No third-party origins in the app's source (docs/dapp-design.md section 7.2 W0, note 28 section 8.2).
//
// Scans index.html, app/src and sdk/ (the venue readers the page bundles; not tests or recorded fixtures) and
// bridge/contract.ts for any URL host that is
// not an origin listed in headers.config.ts or a documented inert host, for any NEVER host, and applies the
// HTML rules (no inline script or style, no external subresource, a no-referrer policy). The built output is
// checked separately by check-bundle.ts, which sees what the libraries bring in.

export interface OriginOptions {
  readonly repoRoot?: string;
  readonly appDir?: string;
}

const SKIP = new Set(["node_modules", "dist", "fixtures", "test-results", "playwright-report", ".playwright-browsers"]);
const TEXT_FILE = /\.(?:[cm]?[tj]sx?|css|html|svg|json)$/;

const SINK = /\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/;

// The one documented exception: the WebAuthn PRF extension's input is an object property named `eval` (WebAuthn Level 3,
// AuthenticationExtensionsPRFInputs: `prf: { eval: { first } }`), which the trading account's passkey must send to get
// the output that wraps its key (features/account/passkey.ts). A property key is not a call and evaluates nothing; only
// that exact shape is removed before the sink is matched, so any other `eval` still fails. (The bundle check matches
// `eval(` only, so the built code needs no exception.)
export const PRF_EVAL_KEY = /\bprf:\s*\{\s*eval:/g;

export function withoutPrfEvalKey(source: string): string {
  return source.replace(PRF_EVAL_KEY, "prf: {");
}

// Crude on purpose: comments may name a sink to forbid it.
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export async function checkOrigins(options: OriginOptions = {}): Promise<Violation[]> {
  const repoRoot = options.repoRoot ?? REPO_DIR;
  const appDir = options.appDir ?? resolve(repoRoot, "app");
  const violations: Violation[] = [];
  const files = [
    join(appDir, "index.html"),
    join(repoRoot, "bridge", "contract.ts"),
    ...[...(await walk(join(appDir, "src"), SKIP)), ...(await walk(join(repoRoot, "sdk"), SKIP))].filter((file) => TEXT_FILE.test(file) && !TEST_FILE.test(file)),
  ];
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const name = relPosix(repoRoot, file);
    violations.push(...originViolations(name, text));
    if (file.endsWith(".html")) {
      violations.push(...htmlViolations(name, text));
      if (!/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(text)) {
        violations.push({ file: name, rule: "referrer-policy", detail: 'index.html must carry <meta name="referrer" content="no-referrer">' });
      }
    }
    if (SOURCE_FILE.test(file)) {
      const hit = SINK.exec(withoutPrfEvalKey(stripComments(text)));
      if (hit !== null) {
        violations.push({ file: name, rule: "html-sink", detail: `${hit[1] ?? "sink"}: no string-to-HTML or string-to-code sink may appear in app source` });
      }
    }
  }
  return violations;
}

if (isMain(import.meta.url)) {
  process.exitCode = report("check-origins", await checkOrigins());
}
