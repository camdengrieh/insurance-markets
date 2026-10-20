import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Source rules for the wallet and portfolio packages that no single behaviour test can show: what these files are
// not allowed to contain at all (docs/dapp-design.md 6 threat rows 5, 6, 12, 25; acceptance M4-4 groundwork).

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIRS = ["wallet", "portfolio"];
const ROUTES = ["portfolio.tsx", "wallet.tsx"].map((name) => join(ROOT, "..", "routes", name));

function sources(): Array<{ readonly file: string; readonly text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  for (const dir of DIRS) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (!/\.(?:ts|tsx|css)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
      out.push({ file: `${dir}/${name}`, text: readFileSync(join(ROOT, dir, name), "utf8") });
    }
  }
  for (const file of ROUTES) out.push({ file: `routes/${file.split("/").pop()}`, text: readFileSync(file, "utf8") });
  return out;
}

const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const files = sources();
const nonSupport = files.filter((entry) => !/(?:testkit|view-harness|fixtures)\.tsx?$/.test(entry.file));

describe("wallet and portfolio sources", () => {
  it("found the files it is supposed to scan", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.map((entry) => entry.file)).toEqual(expect.arrayContaining(["wallet/rpc.ts", "portfolio/readers.ts", "routes/wallet.tsx", "routes/portfolio.tsx"]));
  });

  it("have no string-to-HTML or string-to-code sink", () => {
    for (const { file, text } of files) {
      expect(code(text), file).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
    }
  });

  it("do no floating-point money arithmetic", () => {
    for (const { file, text } of nonSupport) {
      expect(code(text), file).not.toMatch(/\b(?:parseFloat|toFixed|toLocaleString|Intl\.NumberFormat)\b/);
    }
  });

  it("never read the text inside an untrusted wrapper themselves (only <UntrustedText> and the sanitiser do)", () => {
    for (const { file, text } of nonSupport) {
      expect(code(text), file).not.toMatch(/\.(?:market|outcome|symbol|title|label)\.value\b/);
      expect(code(text), file).not.toMatch(/\.untrusted\b/);
    }
  });

  it("use no global network, socket, cookie or web storage: everything goes through the injected fetch and the app's own stores", () => {
    for (const { file, text } of files) {
      expect(code(text), file).not.toMatch(/\b(?:globalThis\.fetch|window\.fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|document\.cookie|navigator\.clipboard)\b/);
      expect(code(text), file).not.toMatch(/(?<![.\w])fetch\(/);
    }
  });

  it("send no JSON-RPC method that writes or signs", () => {
    for (const { file, text } of files) {
      expect(code(text), file).not.toMatch(/["'`](?:eth_send\w*|eth_sign\w*|personal_sign|eth_accounts|eth_requestAccounts|eth_estimateGas|wallet_(?:add|switch|watch|request|get|send|sign)\w*)["'`]/);
    }
    const rpc = code(files.find((entry) => entry.file === "wallet/rpc.ts")?.text ?? "");
    const methods = new Set([...rpc.matchAll(/"(eth_[A-Za-z]+)"/g)].map((match) => match[1]));
    expect(methods).toEqual(new Set(["eth_call", "eth_getBalance", "eth_getCode"]));
  });

  it("import no signing, HMAC, userop-signing or relay code, and only the pure funding, account and constants modules of the plugin", () => {
    const allowed = new Set(["xo/chain/constants", "xo/chain/abi", "xo/funding/calldata", "xo/funding/steps", "xo/account/derive"]);
    for (const { file, text } of files) {
      for (const match of text.matchAll(/from "@shared\/([^"]+?)(?:\.js)?"/g)) {
        expect(allowed.has(match[1] ?? ""), `${file} imports @shared/${match[1]}`).toBe(true);
      }
      for (const specifier of text.matchAll(/(?:from|import\()\s*"([^"]+)"/g)) {
        expect(specifier[1], `${file} imports ${specifier[1]}`).not.toMatch(/relay|src\/local|\/tools|signing|userop|hmac|paybox|bridge\/(?!contract)/i);
      }
    }
  });

  it("have no PayBox surface and no code path that submits, signs or prepares anything", () => {
    for (const { file, text } of files) {
      expect(code(text), file).not.toMatch(/\/ui\/(?:prepare|submit|sign|arm|kill|tool)|\/v1\/|request_wallet_sign|sendTransaction|signMessage|signTypedData/);
    }
  });

  it("style only with tokens: no inline style attribute, no url(), no @import, no font", () => {
    for (const { file, text } of files) {
      if (file.endsWith(".css")) {
        expect(text, file).not.toMatch(/url\(|@import|@font-face|https?:/);
      } else {
        expect(code(text), file).not.toMatch(/\bstyle=\{/);
      }
    }
  });
});
