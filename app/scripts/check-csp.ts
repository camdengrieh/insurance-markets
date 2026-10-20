import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  BROWSER_DIRECT_ORIGINS,
  BUILD_TARGETS,
  DAEMON_ONLY_ORIGINS,
  GENERATED_FILES,
  NEVER_IN_APP_HOSTS,
  PERMISSIONS_POLICY,
  READ_SERVICES,
  cspDirectives,
  renderGeneratedFiles,
  securityHeaders,
  type BuildTarget,
  type CspDirectives,
} from "../headers.config.ts";
import { APP_DIR, isMain, report, type Violation } from "./lib.ts";

// CSP and header drift (docs/dapp-design.md section 7.2 W0, note 28 section 8.2).
//
// headers.config.ts is the only place a CSP is written. This check (1) holds both policies to their
// invariants, (2) holds the origin registry to its invariants, and (3) compares the generated example files
// checked in under app/ (vercel.json, scripts/examples/*) with what headers.config.ts renders today, so a
// CSP change that was not regenerated and reviewed fails. `--write` regenerates them.

const FORBIDDEN_SOURCES = ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'", "'strict-dynamic'", "blob:", "filesystem:", "*"];
const KEYWORDS = new Set(["'self'", "'none'", "data:", "'script'"]);

export function directiveViolations(target: BuildTarget, directives: CspDirectives): Violation[] {
  const file = `headers.config.ts (${target})`;
  const violations: Violation[] = [];
  const bad = (rule: string, detail: string): void => {
    violations.push({ file, rule, detail });
  };
  const only = (name: string, expected: readonly string[]): void => {
    const actual = directives[name];
    if (actual === undefined || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
      bad("directive", `${name} must be exactly ${expected.join(" ")}; found ${actual?.join(" ") ?? "nothing"}`);
    }
  };
  only("default-src", ["'none'"]);
  only("script-src", ["'self'"]);
  only("style-src", ["'self'"]);
  only("font-src", ["'self'"]);
  only("img-src", ["'self'", "data:"]);
  only("base-uri", ["'none'"]);
  only("form-action", ["'none'"]);
  only("object-src", ["'none'"]);
  only("frame-ancestors", ["'none'"]);
  only("require-trusted-types-for", ["'script'"]);
  only("trusted-types", ["'none'"]);
  for (const [name, sources] of Object.entries(directives)) {
    if (new Set(sources).size !== sources.length) bad("duplicate", `${name} lists a source twice`);
    for (const source of sources) {
      if (FORBIDDEN_SOURCES.includes(source) || source.includes("*")) bad("forbidden-source", `${name} contains ${source}`);
      if (/^(?:http|ws):/i.test(source)) bad("insecure-source", `${name} contains ${source}; only https origins are allowed`);
      if (/127\.0\.0\.1|localhost|\[::1\]/.test(source)) bad("loopback-source", `${name} contains ${source}; the page never names the daemon, it is same-origin ('self')`);
      if (!KEYWORDS.has(source) && !(name === "connect-src" && /^https:\/\/[a-z0-9.-]+$/.test(source))) {
        bad("malformed-source", `${name} contains ${source}, which is neither a keyword nor a bare https origin`);
      }
    }
  }
  const connect = directives["connect-src"] ?? [];
  if (target === "cockpit") {
    only("connect-src", ["'self'"]);
  } else {
    const expected = ["'self'", ...BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin)];
    only("connect-src", expected);
    for (const source of connect) {
      if (DAEMON_ONLY_ORIGINS.some((entry) => entry.origin === source)) bad("daemon-only-in-csp", `${source} is blocked or restricted for browsers and may not be in a CSP`);
      const host = source.replace(/^https:\/\//, "");
      if (Object.hasOwn(NEVER_IN_APP_HOSTS, host)) bad("never-host", `${host} may not be in a CSP`);
    }
  }
  return violations;
}

export function registryViolations(): Violation[] {
  const violations: Violation[] = [];
  const bad = (rule: string, detail: string): void => {
    violations.push({ file: "headers.config.ts", rule, detail });
  };
  const entries = [...BROWSER_DIRECT_ORIGINS, ...DAEMON_ONLY_ORIGINS];
  const origins = new Set<string>();
  for (const entry of entries) {
    let parsed: URL | undefined;
    try {
      parsed = new URL(entry.origin);
    } catch {
      bad("origin", `${entry.origin} is not a URL`);
    }
    if (parsed !== undefined && (parsed.protocol !== "https:" || parsed.origin !== entry.origin || parsed.port !== "")) {
      bad("origin", `${entry.origin} must be a bare https origin without port, path or trailing slash`);
    }
    if (origins.has(entry.origin)) bad("duplicate-origin", `${entry.origin} is listed twice`);
    origins.add(entry.origin);
    if (entry.note.trim().length < 8) bad("note", `${entry.origin} needs a note saying why it is listed`);
  }
  const services = entries.map((entry) => entry.service).filter((service) => service !== null);
  if (new Set(services).size !== services.length) bad("service", "a read service is mapped to two origins");
  for (const service of READ_SERVICES) {
    if (!services.includes(service)) bad("service", `read service ${service} has no origin`);
  }
  for (const host of Object.keys(NEVER_IN_APP_HOSTS)) {
    if (entries.some((entry) => new URL(entry.origin).hostname === host)) bad("never-host", `${host} is both listed and forbidden`);
  }
  return violations;
}

export function headerViolations(target: BuildTarget): Violation[] {
  const file = `headers.config.ts (${target})`;
  const violations: Violation[] = [];
  const headers = new Map(securityHeaders(target).map((pair) => [pair.key.toLowerCase(), pair.value]));
  const expect = (key: string, value: string): void => {
    if (headers.get(key.toLowerCase()) !== value) violations.push({ file, rule: "header", detail: `${key} must be ${value}; found ${headers.get(key.toLowerCase()) ?? "nothing"}` });
  };
  expect("Referrer-Policy", "no-referrer");
  expect("X-Content-Type-Options", "nosniff");
  expect("X-Frame-Options", "DENY");
  expect("Cross-Origin-Opener-Policy", "same-origin");
  expect("Cross-Origin-Resource-Policy", "same-origin");
  const permissions = headers.get("permissions-policy") ?? "";
  for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
    if (!permissions.includes(`${feature}=()`)) violations.push({ file, rule: "permissions-policy", detail: `${feature} must be denied` });
  }
  if (permissions !== PERMISSIONS_POLICY) violations.push({ file, rule: "permissions-policy", detail: "Permissions-Policy differs from the exported constant" });
  if (!headers.has("content-security-policy")) violations.push({ file, rule: "header", detail: "Content-Security-Policy is missing" });
  return violations;
}

export interface CspOptions {
  readonly appDir?: string;
  // Rewrite the generated files instead of comparing.
  readonly write?: boolean;
}

export async function checkCsp(options: CspOptions = {}): Promise<Violation[]> {
  const appDir = options.appDir ?? APP_DIR;
  const violations: Violation[] = [];
  for (const target of BUILD_TARGETS) {
    violations.push(...directiveViolations(target, cspDirectives(target)), ...headerViolations(target));
  }
  violations.push(...registryViolations());
  const rendered = renderGeneratedFiles();
  for (const path of GENERATED_FILES) {
    const want = rendered[path];
    if (want === undefined) {
      violations.push({ file: `app/${path}`, rule: "generated", detail: "headers.config.ts renders no such file" });
      continue;
    }
    const full = join(appDir, path);
    if (options.write === true) {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, want);
      continue;
    }
    let have: string | undefined;
    try {
      have = await readFile(full, "utf8");
    } catch {
      have = undefined;
    }
    if (have === undefined) violations.push({ file: `app/${path}`, rule: "drift", detail: "missing; run `pnpm run headers:write` and review the diff" });
    else if (have !== want) violations.push({ file: `app/${path}`, rule: "drift", detail: "differs from headers.config.ts; run `pnpm run headers:write` and review the diff" });
  }
  return violations;
}

if (isMain(import.meta.url)) {
  const write = process.argv.includes("--write");
  const violations = await checkCsp({ write });
  if (write) console.log(`check-csp: wrote ${GENERATED_FILES.length} generated files`);
  process.exitCode = report("check-csp", violations);
}
