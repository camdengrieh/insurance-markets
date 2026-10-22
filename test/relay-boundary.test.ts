import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Import boundary for the plugin bundle (dist/plugin.mjs is built from src/plugin.ts).
//   1. Nothing under src/ may reach for the filesystem, the network or a child process through a
//      Node module: all of that belongs in the relay (relay/) or in the host's fetch.
//   2. The plugin never imports from the relay's own directory (relay/ at the repo root).
//   3. The portable files that the plugin and the relay share (the contract, the error codes, the
//      flags and the relay client) import no node:* module and use no Node-only global at all.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const RELAY_DIR = join(ROOT, "relay");

const FORBIDDEN = [
  "fs", "net", "http", "child_process",
  // The same family of reach-outs, listed so a swap of one for another does not slip through.
  "https", "http2", "tls", "dgram", "dns", "cluster", "worker_threads", "vm", "inspector",
];
const forbidden = (specifier: string): boolean => {
  const bare = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  const root = bare.split("/")[0] ?? "";
  return FORBIDDEN.includes(root) && (specifier.startsWith("node:") || !specifier.startsWith("."));
};

// Files under src/ that may import a node: module, and which ones. Anything not listed fails. None does since the
// credentialed request signers (XO L2, Polymarket L2, Limitless; HMAC-SHA256 over node:crypto, no I/O) moved to
// sdk/node/trade (docs/sdk-and-api-design.md step 5), which is never reachable from the page
// (app/scripts/check-boundaries.ts).
const ALLOWED_NODE_IMPORTS: Readonly<Record<string, readonly string[]>> = {};

// Portable by contract: no node: import, no Node-only global.
const PORTABLE = [
  "src/relay/contract.ts",
  "src/relay/errors.ts",
  "src/relay/flags.ts",
  "src/relay/client.ts",
] as const;

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && entry.name.endsWith(".ts")) yield path;
  }
}

// Every module specifier a file imports, re-exports, dynamically imports or requires.
export function specifiersOf(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) found.push(match[1] as string);
  return found;
}

// The local mode (dist/local.mjs) is a separate program that runs on the user's machine: it reads and
// writes files and embeds the relay, so it is exempt from rules 1 to 4 above. What keeps it out of the
// hosted plugin is that nothing the plugin imports reaches it (test/local-bundle.test.ts walks the
// plugin's whole import graph and fails if it does).
const LOCAL_MODE = (name: string): boolean => name === "src/local.ts" || name.startsWith("src/local/");

const files = [...walk(SRC)]
  .map((path) => ({ path, name: relative(ROOT, path).split(sep).join("/"), text: readFileSync(path, "utf8") }))
  .filter((file) => !LOCAL_MODE(file.name));

describe("import boundary: src/ stays portable", () => {
  it("scans the files it is supposed to (the scan is not vacuous)", () => {
    assert.ok(files.length >= 30, `only ${files.length} files`);
    for (const must of ["src/plugin.ts", "src/relay/contract.ts", "src/config.ts", "src/xo/signing/index.ts"]) {
      assert.ok(files.some((file) => file.name === must), must);
    }
    assert.ok(specifiersOf('import { a } from "node:crypto";\nconst b = await import("node:fs");').join() === "node:crypto,node:fs");
  });

  it("imports no node:fs, node:net, node:http or node:child_process (nor their near relatives)", () => {
    const offenders = files.flatMap((file) =>
      specifiersOf(file.text).filter(forbidden).map((specifier) => `${file.name} imports ${specifier}`),
    );
    assert.deepEqual(offenders, []);
  });

  it("lets only the listed files import any node: module, and only the listed ones", () => {
    const actual: Record<string, string[]> = {};
    for (const file of files) {
      const nodeImports = [...new Set(specifiersOf(file.text).filter((s) => s.startsWith("node:")))].sort();
      if (nodeImports.length > 0) actual[file.name] = nodeImports;
    }
    assert.deepEqual(actual, ALLOWED_NODE_IMPORTS);
  });

  it("never imports from the relay's own directory", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(file.text)) {
        if (!specifier.startsWith(".")) continue;
        const target = resolve(dirname(file.path), specifier);
        if (target === RELAY_DIR || target.startsWith(RELAY_DIR + sep)) offenders.push(`${file.name} imports ${specifier}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("keeps the plugin entry point free of the relay's server code", () => {
    const entry = files.find((file) => file.name === "src/plugin.ts");
    assert.ok(entry);
    assert.ok(!/relay\/(server|main|store|crypto|upstream|ledger)/.test(entry.text));
  });
});

describe("import boundary: the shared contract files are portable", () => {
  for (const name of PORTABLE) {
    it(`${name} has no node: import and no Node-only global`, () => {
      const file = files.find((candidate) => candidate.name === name);
      assert.ok(file, `${name} is missing`);
      const text = file.text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      assert.deepEqual(specifiersOf(text).filter((s) => s.startsWith("node:") || FORBIDDEN.includes(s)), []);
      for (const [label, pattern] of [
        ["Buffer", /\bBuffer\b/],
        ["process", /\bprocess\b/],
        ["require", /\brequire\s*\(/],
        ["__dirname", /\b__dirname\b/],
        ["__filename", /\b__filename\b/],
        ["setImmediate", /\bsetImmediate\b/],
        ["module.exports", /\bmodule\.exports\b/],
      ] as const) {
        assert.equal(pattern.test(text), false, `${name} uses ${label}`);
      }
    });
  }

  it("the test would notice a violation (self-check of the matchers)", () => {
    assert.equal(forbidden("node:fs"), true);
    assert.equal(forbidden("node:fs/promises"), true);
    assert.equal(forbidden("fs"), true);
    assert.equal(forbidden("node:http"), true);
    assert.equal(forbidden("node:child_process"), true);
    assert.equal(forbidden("node:net"), true);
    assert.equal(forbidden("node:crypto"), false);
    assert.equal(forbidden("./fs.js"), false);
    assert.equal(forbidden("viem"), false);
  });
});
