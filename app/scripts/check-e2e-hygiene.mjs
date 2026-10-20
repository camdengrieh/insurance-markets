import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { APP_DIR, REPO_DIR, SOURCE_FILE, isMain, report, walk } from "./lib.ts";
import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../headers.config.ts";

// The end-to-end suites (app/e2e, bridge/test/e2e) must stay offline, anonymous and honest. This check reads their SOURCE and fails on:
//
//   - a URL or hostname literal that is not loopback, a reserved test name, or one of the venue origins already listed in
//     headers.config.ts (which the suites only ever name to intercept or refuse, never to call);
//   - any way to reach the real network or the user's browser profile: Playwright `channel`, `bypassCSP`, `ignoreHTTPSErrors`,
//     `storageState`, `userDataDir`, `launchPersistentContext`, a CDP connection, `connectOverCDP`, `launchServer`;
//   - a way to hide a failure: `test.only`, `describe.only`, `test.skip(true`, `test.fixme(` outside the registered pins;
//   - a home-directory path, `os.homedir`, `process.env.HOME`/`USER`/`LOGNAME`, a `/Users/` or `/home/` literal (the suites must work
//     for anyone and leak nobody);
//   - an email address, a `git config`/`gh` call, or `child_process` use other than spawning node itself;
//   - a User-Agent other than the two fixed ones.
//
// Offline and read-only. `node scripts/check-e2e-hygiene.mjs` prints violations and sets the exit code.

/** @typedef {{ file: string, rule: string, detail: string, line?: number }} Violation */

const ALLOWED_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "evil.example",
  "example.org",
  "rebind.test",
  "www.ufc.com", // a resolution source inside a recorded XO fixture row
  "www.w3.org", // XML and SVG namespaces
  "json-schema.org",
]);
const ALLOWED_SUFFIXES = [".test", ".example", ".invalid", ".localhost"];
const FIXED_USER_AGENTS = new Set(["insurance-markets-xo-plugin/0.2", "insurance-markets-research/0.1"]);

/** Hosts the suites may name because headers.config.ts already lists them. */
function configuredHosts() {
  return new Set([...BROWSER_DIRECT_ORIGINS, ...DAEMON_ONLY_ORIGINS].map((entry) => new URL(entry.origin).hostname));
}

/** @type {{ rule: string, pattern: RegExp, detail: string }[]} */
const FORBIDDEN = [
  { rule: "system-browser", pattern: /\bchannel\s*:\s*["'`]/, detail: "a Playwright `channel` would use the system's installed browser, with its profile and extensions" },
  { rule: "bypass-csp", pattern: /\bbypassCSP\s*:\s*true/, detail: "bypassCSP defeats the policy the suites exist to test" },
  { rule: "ignore-https-errors", pattern: /\bignoreHTTPSErrors\s*:\s*true/, detail: "certificate errors must never be ignored" },
  { rule: "browser-profile", pattern: /\b(storageState|userDataDir|launchPersistentContext|connectOverCDP|launchServer|connect\s*\(\s*["'`]ws)/, detail: "persistent or remote browser state may carry the user's sessions" },
  { rule: "only", pattern: /\b(?:test|describe|it)\.only\s*\(/, detail: ".only silently skips the rest of the suite" },
  { rule: "home-path", pattern: /["'`]\/(?:Users|home)\/|\bos\.homedir\b|\bhomedir\s*\(\)|process\.env\.(?:HOME|USER|LOGNAME|USERNAME)\b|["'`]~\//, detail: "no home-directory path or user name may appear in a suite" },
  { rule: "email", pattern: /[A-Za-z0-9._%+-]+@(?!example\.|[a-z0-9.-]*\.test\b)[A-Za-z0-9-]+\.[A-Za-z]{2,}\b(?!\/)/, detail: "an email address in source" },
  { rule: "git-or-gh", pattern: /["'`](?:git|gh)["'`]\s*,|execSync\s*\(\s*["'`](?:git|gh)\b/, detail: "the suites do not call git or gh" },
  { rule: "shell-out", pattern: /(?<![.\w])(?:exec|execSync|execFile|execFileSync)\s*\(/, detail: "only `spawn(process.execPath, ...)` is allowed" },
  { rule: "real-network-client", pattern: /\b(?:XMLHttpRequest|WebSocket)\s*\(\s*["'`]wss?:\/\/(?!127\.0\.0\.1)/, detail: "a socket to a real host" },
];

/**
 * @param {{ roots?: string[], repoRoot?: string }} [options]
 * @returns {Promise<Violation[]>}
 */
export async function checkE2eHygiene(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_DIR;
  const roots = options.roots ?? [join(repoRoot, "app", "e2e"), join(repoRoot, "bridge", "test", "e2e")];
  /** @type {Violation[]} */
  const violations = [];
  const configured = configuredHosts();
  const skipDirs = new Set(["node_modules", ".playwright-browsers", "test-results", "playwright-report", "dist"]);
  let scanned = 0;
  for (const root of roots) {
    for (const file of await walk(root, skipDirs)) {
      if (!SOURCE_FILE.test(file)) continue;
      const rel = relative(repoRoot, file).split(sep).join("/");
      // The one file whose job is to contain the forbidden patterns (as seeds that must trip this very check).
      if (rel === "bridge/test/e2e/checks.test.ts") continue;
      const source = await readFile(file, "utf8");
      scanned += 1;
      /** @param {string} rule @param {string} detail @param {number} offset */
      const bad = (rule, detail, offset) => {
        let line = 1;
        for (let index = 0; index < offset && index < source.length; index += 1) if (source.charCodeAt(index) === 10) line += 1;
        violations.push({ file: rel, rule, detail, line });
      };
      for (const { rule, pattern, detail } of FORBIDDEN) {
        const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
        for (const match of source.matchAll(new RegExp(pattern.source, flags))) bad(rule, detail, match.index ?? 0);
      }
      // The pins in known-issues are the one place a failing assertion may be annotated away; everywhere else test.fail/fixme/skip(true) is a smell.
      if (!/known-issues|a11y\.spec/.test(rel)) {
        for (const match of source.matchAll(/\btest\.(?:fixme|fail)\s*\(|\btest\.skip\s*\(\s*true\b/g)) bad("hidden-failure", "test.fixme, test.fail and test.skip(true) hide a failing test; pin it in support/known-issues.ts or fix it", match.index ?? 0);
      }
      for (const match of source.matchAll(/\bhttps?:\/\/([A-Za-z0-9.-]+)(?::\d+)?/g)) {
        const host = (match[1] ?? "").toLowerCase().replace(/\.$/, "");
        if (host === "" || host.startsWith("$")) continue;
        if (ALLOWED_HOSTS.has(host) || configured.has(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))) continue;
        bad("foreign-host", `${host} is not loopback, a reserved test name or a host listed in headers.config.ts`, match.index ?? 0);
      }
      for (const match of source.matchAll(/(?:user-agent|userAgent)["'`]?\s*[:=]\s*["'`]([^"'`]+)["'`]/gi)) {
        if (!FIXED_USER_AGENTS.has(match[1] ?? "")) bad("user-agent", `a User-Agent other than the two fixed ones (${match[1]?.slice(0, 40) ?? ""})`, match.index ?? 0);
      }
    }
  }
  if (scanned === 0) violations.push({ file: roots.map((root) => relative(repoRoot, root).split(sep).join("/")).join(", "), rule: "vacuous", detail: "no e2e source was found, so nothing was checked" });
  return violations;
}

if (isMain(import.meta.url)) {
  process.exitCode = report("check-e2e-hygiene", await checkE2eHygiene({ repoRoot: resolve(APP_DIR, "..") }));
}
