import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../origins.js";

// Source rules for the four reference-price modules (novig, og, gemini, defillama): read-only, GET only, no storage,
// no global clock or fetch, no markup sink, no credential, no third-party host that sdk/venues/origins.ts does not list.
// The scan reads each module's own source (tests and recorded fixtures are not source).

const MODULES = ["novig", "og", "gemini", "defillama"] as const;
const VENUES = new URL("..", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "fixtures") out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && !/\.(?:test|spec)\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out.sort();
}

// Comments may name a forbidden thing in order to forbid it.
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = MODULES.flatMap((module) => sourceFiles(join(VENUES, module)).map((path) => ({ module, path, text: readFileSync(path, "utf8") })));
const NETWORK_HOSTS = new Set([...BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin), ...DAEMON_ONLY_ORIGINS.map((entry) => entry.origin)].map((origin) => new URL(origin).hostname));

describe("reference-price modules: source rules", () => {
  it("scans real files", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const module of MODULES) expect(files.some((file) => file.module === module)).toBe(true);
  });

  const FORBIDDEN: Array<[string, RegExp]> = [
    ["browser storage", /\b(?:localStorage|sessionStorage|indexedDB|IDBDatabase|document\.cookie|caches\.open)\b/],
    ["page globals", /\b(?:window|document|navigator|location|history|globalThis)\./],
    ["a global fetch (the injected one only)", /(?<![.\w])fetch\s*\(/],
    ["a global clock or random source", /\b(?:Date\.now|Math\.random|performance\.now|setInterval)\b/],
    ["a markup or code sink", /\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/],
    ["a write method", /["'`](?:POST|PUT|PATCH|DELETE)["'`]/],
    ["a credential header", /\b(?:authorization|x-api-key|api[_-]?key|cookie|signature|bearer)\b/i],
    ["a websocket or event stream", /\bnew\s+(?:WebSocket|EventSource)\b|wss?:\/\//],
    ["a payment or signing call", /\b(?:signTypedData|signMessage|privateKey|sendTransaction|x402)\b/],
  ];
  for (const [name, pattern] of FORBIDDEN) {
    it(`has no ${name}`, () => {
      const hits = files.filter((file) => pattern.test(code(file.text))).map((file) => file.path.replace(VENUES, ""));
      expect(hits).toEqual([]);
    });
  }

  it("names only hosts that sdk/venues/origins.ts lists", () => {
    const stray: string[] = [];
    for (const file of files) {
      for (const match of code(file.text).matchAll(/\bhttps?:\/\/([A-Za-z0-9.-]+)/g)) {
        const host = (match[1] ?? "").toLowerCase();
        if (!NETWORK_HOSTS.has(host)) stray.push(`${file.path.replace(VENUES, "")}: ${host}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it("is plain ASCII, so no direction or zero-width character can hide in a source file", () => {
    const bad = files.filter((file) => /[^\x00-\x7f]/.test(file.text)).map((file) => file.path.replace(VENUES, ""));
    expect(bad).toEqual([]);
  });

  it("holds no e-mail address, home directory or user name", () => {
    const hits = files.filter((file) => /[\w.+-]+@[\w-]+\.[\w.-]+|\/Users\/|\/home\/[a-z]/i.test(file.text)).map((file) => file.path.replace(VENUES, ""));
    expect(hits).toEqual([]);
  });

  it("imports nothing from the plugin, the relay, the daemon's internals or Node", () => {
    const hits = files.filter((file) => /from\s+["'](?:node:|fs|path|child_process|net|http|https|\.\.\/\.\.\/\.\.\/\.\.\/(?:src|relay|bridge)\/)/.test(file.text) || /@shared\/(?:xo\/signing|guardrails\/audit)|@bridge\/(?!contract)/.test(file.text)).map((file) => file.path.replace(VENUES, ""));
    expect(hits).toEqual([]);
  });

  it("restricted-terms modules hold what they read only in a MemoryStore", () => {
    for (const module of ["novig", "og", "gemini", "defillama"] as const) {
      const text = files.filter((file) => file.module === module).map((file) => file.text).join("\n");
      expect(text, module).toMatch(/new MemoryStore</);
      // no module-scope cache of data outside the store
      expect(code(text), module).not.toMatch(/\bglobalThis\b|\bwindow\b/);
    }
  });
});
