import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

// Source-level guardrails for pm/adapters. They read the source text, so a future edit that adds
// a disk write, a direct fetch, a signing import or a personal identifier fails here instead of
// slipping through.

const DIR = new URL("../../adapters/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".ts")).sort();
const source = (name: string): string => readFileSync(new URL(name, DIR), "utf8");
const all = files.map((f) => [f, source(f)] as const);

function importsOf(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

describe("pm/adapters source scan", () => {
  it("covers the expected modules", () => {
    for (const f of ["xo.ts", "polymarket.ts", "kalshi.ts", "transport.ts", "policy.ts", "index.ts", "disabled.ts"]) assert.ok(files.includes(f), f);
  });

  it("imports no storage, process, network or signing module", () => {
    const banned = [/^node:fs/, /^fs(\/|$)/, /^node:sqlite/, /^node:child_process/, /^node:net$/, /^node:http/, /^node:https/, /^node:dgram/, /^node:worker_threads/, /^viem/, /signing/, /userop/, /\/relay\//, /\/bridge\//, /\/app\//, /funding/, /creation/, /account/];
    for (const [file, text] of all) {
      for (const spec of importsOf(text)) {
        for (const re of banned) assert.ok(!re.test(spec), `${file} imports ${spec}`);
      }
    }
  });

  it("reuses only the XO read client, its transport, its units and the guardrails", () => {
    const allowed = new Set(["../../src/xo/client.js", "../../src/xo/http.js", "../../src/xo/units.js", "../../src/xo/types.js"]);
    for (const [file, text] of all) {
      for (const spec of importsOf(text).filter((s) => s.includes("src/"))) assert.ok(allowed.has(spec), `${file} imports ${spec}`);
    }
  });

  it("never touches the disk, spawns a process, or calls fetch directly", () => {
    const patterns: Array<[RegExp, string]> = [
      [/\bwriteFile(Sync)?\b/, "writeFile"],
      [/\bappendFile(Sync)?\b/, "appendFile"],
      [/\bcreateWriteStream\b/, "createWriteStream"],
      [/\bmkdir(Sync)?\b/, "mkdir"],
      [/\bDatabaseSync\b/, "sqlite"],
      [/\blocalStorage\b|\bindexedDB\b/, "browser storage"],
      [/\bchild_process\b|(^|[^.\w])(spawn|exec|execSync)\(/, "process spawn"],
      [/(^|[^.\w])fetch\(/, "bare fetch call"],
      [/globalThis\.fetch/, "globalThis.fetch"],
      [/\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/, "other network client"],
    ];
    for (const [file, text] of all) {
      const code = text.replace(/\/\/.*$/gm, "");
      for (const [re, label] of patterns) assert.ok(!re.test(code), `${file}: ${label}`);
    }
  });

  it("has no write HTTP method and no JSON-RPC", () => {
    for (const [file, text] of all) {
      const code = text.replace(/\/\/.*$/gm, "");
      assert.ok(!/["'`](POST|PUT|PATCH|DELETE)["'`]/.test(code), `${file}: write method`);
      assert.ok(!/\bjsonrpc\b|\beth_call\b|\beth_send/i.test(code), `${file}: json-rpc`);
      assert.ok(!/\beval\(|new Function\(/.test(code), `${file}: dynamic code`);
    }
  });

  it("uses no floating point for money, prices, sizes or fees", () => {
    for (const [file, text] of all) {
      const code = text.replace(/\/\/.*$/gm, "");
      assert.ok(!/\bparseFloat\b|\.toFixed\(|\bMath\.(round|floor|ceil|trunc)\(/.test(code), `${file}: float math`);
      assert.ok(!/\bNumber\(\s*(price|size|rate|fee|bps)/i.test(code), `${file}: Number() on a money value`);
    }
  });

  it("the Kalshi module keeps no cache or module-level mutable state", () => {
    const code = source("kalshi.ts").replace(/\/\/.*$/gm, "");
    // Module level: no `let`/`var` and no Map/Set/WeakMap declared outside a function body.
    const topLevel = code.split("\n").filter((l) => /^(let|var)\s/.test(l) || /^const \w+ = new (Map|Set|WeakMap)/.test(l));
    assert.deepEqual(topLevel, []);
    assert.ok(!/\bcache\b/i.test(code));
  });

  it("carries no personal identifier, home path or contact detail", () => {
    for (const f of readdirSync(new URL("../adapters/", import.meta.url))) {
      const text = readFileSync(new URL(`../adapters/${f}`, import.meta.url), "utf8");
      assert.ok(!/\/Users\/|\/home\/|\/private\/tmp|C:\\Users/.test(text), `${f}: absolute path`);
      assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i.test(text), `${f}: email address`);
    }
    for (const [file, text] of all) {
      assert.ok(!/\/Users\/|\/home\/|\/private\/tmp/.test(text), `${file}: absolute path`);
      assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i.test(text), `${file}: email address`);
    }
  });

  it("pins the two fixed User-Agent strings and no other", () => {
    const text = source("transport.ts");
    assert.ok(text.includes('"insurance-markets-research/0.1"'));
    const agents = [...all.map(([, t]) => t).join("\n").matchAll(/insurance-markets-[a-z-]+\/[0-9.]+/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(agents)].sort(), ["insurance-markets-research/0.1"]);
    assert.ok(text.includes("XO_USER_AGENT"));
  });
});
