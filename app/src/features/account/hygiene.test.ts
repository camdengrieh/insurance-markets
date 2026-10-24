import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Source rules for the trading account (features/account) that no behaviour test can show. This folder holds the one
// key the page itself owns, so where the key can appear, where a request can be made and what may be imported are
// pinned here: a new place that touches any of them fails until it is reviewed.

const DIR = dirname(fileURLToPath(import.meta.url));

const files = readdirSync(DIR)
  .filter((name) => /\.(?:ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "testkit.ts")
  .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));

const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function using(pattern: RegExp): string[] {
  return files.filter(({ name, text }) => !name.endsWith(".css") && pattern.test(code(text))).map(({ name }) => name).sort();
}

describe("trading account sources", () => {
  it("found the files it is supposed to scan", () => {
    expect(files.map((file) => file.name)).toEqual(expect.arrayContaining(["derive.ts", "vault.ts", "sponsor.ts", "local-signer.ts", "money.ts", "activation.ts", "context.tsx", "AccountPanel.tsx", "account.css"]));
  });

  it("have no string-to-HTML or string-to-code sink and no inline style", () => {
    for (const { name, text } of files) {
      // The WebAuthn PRF input's property key `eval` is the one exception, as in scripts/check-origins.ts PRF_EVAL_KEY.
      expect(code(text).replace(/\bprf:\s*\{\s*eval:/g, "prf: {"), name).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
      if (name.endsWith(".css")) expect(text, name).not.toMatch(/url\(|@import|@font-face|https?:/);
      else expect(code(text), name).not.toMatch(/\bstyle=\{/);
    }
  });

  it("make a key only where the design says: derived from a signature, generated under a passkey, or opened from a seal", () => {
    expect(using(/\bgeneratePrivateKey\b/)).toEqual(["vault.ts"]);
    expect(using(/\bprivateKeyToAccount\b/)).toEqual(["derive.ts", "session.ts", "vault.ts"]);
    expect(using(/\bmnemonicToAccount\b|\bhdKeyToAccount\b/)).toEqual([]);
    // The one way the key leaves memory is the export, behind its confirmation.
    expect(using(/\.reveal\(\)/)).toEqual(["AccountPanel.tsx"]);
  });

  it("keep the key and its seed out of storage, logs and the clipboard", () => {
    expect(using(/\b(?:localStorage|sessionStorage|document\.cookie|navigator\.clipboard)\b/)).toEqual([]);
    expect(using(/\bconsole\./)).toEqual([]);
    expect(using(/\bindexedDB\b|from "idb"/)).toEqual(["store.ts"]);
  });

  it("reach the network only through the page's fetch in services.ts (the public RPCs and our markets API)", () => {
    expect(using(/\bglobalThis\.fetch\b|\bwindow\.fetch\b|(?<![.\w])fetch\(/)).toEqual(["services.ts"]);
    expect(using(/\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/)).toEqual([]);
    for (const { name, text } of files) expect(text, name).not.toMatch(/\b(?:https?|wss?):\/\//);
  });

  it("never sign an unprefixed digest or a raw transaction", () => {
    expect(using(/["'`]eth_sign["'`]|["'`]eth_signTransaction["'`]|\.sign\(\{\s*hash/)).toEqual([]);
  });

  it("import nothing from the venues, so the venues can import this folder without a cycle", () => {
    for (const { name, text } of files) {
      for (const match of text.matchAll(/(?:from|import\()\s*"([^"]+)"/g)) {
        expect(match[1], `${name} imports ${match[1]}`).not.toMatch(/features\/trade|^\.\.\/trade\b|relay|hmac|src\/local|\/tools/);
      }
    }
  });

  it("do no floating-point money arithmetic", () => {
    expect(using(/\b(?:parseFloat|toFixed|toLocaleString|Intl\.NumberFormat)\b/)).toEqual([]);
  });
});
