// Quotient bodies are memory-only: these tests keep pm/signals from ever gaining a way to write to
// disk, reach the network, spawn a process, read the environment, sign or trade.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "signals");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

function imports(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] as string);
}

describe("pm/signals has no persistence, network or signing surface", () => {
  it("reads the expected source files", () => {
    for (const f of ["constants.ts", "flag.ts", "request.ts", "parse.ts", "join.ts", "calibration.ts", "numbers.ts", "keys.ts", "index.ts"]) {
      assert.ok(FILES.includes(f), f);
    }
  });

  it("imports only pm modules, zod, node:crypto, two src guardrails and the pure sdk (never sdk/node)", () => {
    const allowedBare = new Set(["zod/v4", "node:crypto"]);
    const allowedSrc = new Set(["../../src/guardrails/amount.js", "../../src/guardrails/untrusted.js"]);
    // sdk/ outside sdk/node is pure and isomorphic (no disk, network, process or env; test/sdk/boundary.test.ts).
    // The Quotient body validator there is the one pm_signal_parse reads through.
    const pureSdk = (spec: string): boolean => spec.startsWith("../../sdk/") && !spec.startsWith("../../sdk/node/");
    for (const f of FILES) {
      for (const spec of imports(readFileSync(join(DIR, f), "utf8"))) {
        const ok = spec.startsWith("./") || spec.startsWith("../core/") || spec === "../types.js" || spec.startsWith("../links/") || allowedBare.has(spec) || allowedSrc.has(spec) || pureSdk(spec);
        assert.ok(ok, `${f} imports ${spec}`);
      }
    }
  });

  it("never touches files, sockets, processes, env, dynamic code, signing or trading", () => {
    const banned: [string, RegExp][] = [
      ["fs", /node:fs|from\s+["']fs["']|writeFile|appendFile|createWriteStream|mkdir\(/],
      ["network", /node:(?:net|http|https|http2|dgram|dns|tls)\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|undici/],
      ["process", /node:child_process|node:worker_threads|node:cluster|\bspawn(?:Sync)?\(|\bexecSync\(|\bexecFile(?:Sync)?\(/],
      ["env", /process\.env|process\.argv/],
      ["dynamic code", /\beval\s*\(|new\s+Function\s*\(|node:vm\b/],
      ["storage", /localStorage|sessionStorage|indexedDB|node:sqlite|globalThis\.\w+\s*=/],
      ["signing or trading", /signTypedData|signMessage|privateKey|sendTransaction|src\/xo|src\/tools|src\/plugin|pay_x402|use_service\(/],
    ];
    for (const f of FILES) {
      const source = readFileSync(join(DIR, f), "utf8").replace(/\/\/.*$/gm, "");
      for (const [name, re] of banned) {
        // Strings in constants (agent-facing step text) may name tools; code may not call them.
        if (name === "signing or trading" && (f === "request.ts" || f === "constants.ts")) continue;
        assert.equal(re.test(source), false, `${f}: ${name}`);
      }
    }
  });

  it("has no module-level mutable state that could hold Quotient data between calls", () => {
    for (const f of FILES) {
      const source = readFileSync(join(DIR, f), "utf8");
      assert.equal(/^(?:let|var)\s/m.test(source), false, `${f} has a top-level let/var`);
      assert.equal(/^const\s+\w+\s*(?::[^=]+)?=\s*new\s+(?:Map|Set|WeakMap|Array)\b/m.test(source), false, `${f} has a top-level cache`);
    }
  });
});
