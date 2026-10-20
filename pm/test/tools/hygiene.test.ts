import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Source scans over pm/tools: the tool layer is read-only glue. It must not reach the disk, the
// network, a signer or a clock directly (the clock and the adapters are injected), and it must not
// carry a personal identifier.

const DIR = fileURLToPath(new URL("../../tools/", import.meta.url));
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

function source(file: string): string {
  // Comments may talk about forbidden things; only code is scanned.
  return readFileSync(`${DIR}${file}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("pm/tools source hygiene", () => {
  it("has the expected modules", () => {
    for (const f of ["common.ts", "index.ts", "market.ts", "schemas.ts", "signals.ts", "structure.ts", "venues.ts"]) {
      assert.ok(FILES.includes(f), f);
    }
  });

  it("imports no fs, process, network, database or signing module", () => {
    const forbidden = [
      /from\s+["']node:(fs|fs\/promises|child_process|net|tls|http|https|http2|dgram|dns|worker_threads|sqlite|cluster|vm)["']/,
      /from\s+["'](fs|child_process|net|http|https)["']/,
      /from\s+["']viem/,
      /src\/(relay|tools\/(trade|fund|create|userop|account))\b/,
      /src\/xo\/(account|chain|sign)/,
      /signTypedData|signMessage|privateKey|mnemonic/i,
    ];
    for (const f of FILES) {
      const text = source(f);
      for (const re of forbidden) assert.equal(re.test(text), false, `${f} matches ${String(re)}`);
    }
  });

  it("makes no HTTP call itself and has no write verb", () => {
    for (const f of FILES) {
      const text = source(f);
      assert.equal(/\bfetch\s*\(/.test(text), false, `${f}: fetch`);
      assert.equal(/\b(POST|PUT|DELETE|PATCH)\b/.test(text), false, `${f}: write verb`);
      assert.equal(/XMLHttpRequest|WebSocket|EventSource/.test(text), false, `${f}: socket`);
    }
  });

  it("reads the environment and the clock only in the production wiring", () => {
    for (const f of FILES) {
      const text = source(f);
      if (f !== "common.ts") {
        assert.equal(/process\.env/.test(text), false, `${f}: process.env`);
        assert.equal(/Date\.now\s*\(/.test(text), false, `${f}: Date.now`);
        assert.equal(/new Date\(\s*\)/.test(text), false, `${f}: new Date()`);
      }
    }
    const common = source("common.ts");
    assert.equal((common.match(/process\.env/g) ?? []).length, 2, "process.env appears only in defaultPmToolDeps");
    assert.equal((common.match(/Date\.now/g) ?? []).length, 1, "Date.now appears only in defaultPmToolDeps");
  });

  it("uses no eval, dynamic code or floating-point money math", () => {
    for (const f of FILES) {
      const text = source(f);
      assert.equal(/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(/.test(text), false, `${f}: dynamic code`);
      assert.equal(/parseFloat|\.toFixed\(|Number\.parseFloat/.test(text), false, `${f}: float`);
    }
  });

  it("makes no profit claim in any fixed text it adds", () => {
    for (const f of FILES) {
      const text = readFileSync(`${DIR}${f}`, "utf8");
      assert.equal(/executable_arbitrage/.test(text), false, `${f}: the executable tier label never appears here`);
      assert.equal(/risk[- ]free|guaranteed (return|win|payout)|sure thing|free money/i.test(text), false, `${f}: profit claim`);
    }
  });

  it("carries no home path or email address", () => {
    const own = [...FILES.map((f) => `${DIR}${f}`)];
    for (const path of own) {
      const text = readFileSync(path, "utf8");
      assert.equal(/\/Users\/|\/home\/[a-z]|\/private\/tmp|C:\\Users/.test(text), false, `${path}: absolute path`);
      assert.equal(/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), false, `${path}: email`);
    }
  });
});
