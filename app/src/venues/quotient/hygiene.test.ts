import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as api from "./index";

// Source rules for this package, enforced as tests so a violation fails here before the build-level checks do.
// They back M3-4 (no Quotient field in IndexedDB, files or URLs), M3-8 (no export feature) and the rule that the
// page never pays. Comments may name a banned thing to forbid it, so they are stripped first.

const dir = dirname(fileURLToPath(import.meta.url));

function production(): Array<{ readonly name: string; readonly code: string }> {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
    .map((entry) => ({ name: entry.name, code: strip(readFileSync(join(dir, entry.name), "utf8")) }));
}

function strip(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const files = production();

describe("quotient source hygiene", () => {
  it("scans the files it should", () => {
    const names = files.map((file) => file.name);
    for (const expected of ["client.ts", "payment.ts", "normalize.ts", "routes.ts", "orientation.ts", "disclosures.ts", "units.ts", "schemas.ts", "spend.ts", "constants.ts", "model.ts", "index.ts"]) expect(names).toContain(expected);
  });

  it("imports no storage and touches none (M3-4)", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\b(?:indexedDB|localStorage|sessionStorage|openDB|caches|navigator\.storage|document\.cookie)\b/);
      expect(code, name).not.toMatch(/from\s+["'](?:idb|node:fs|fs|node:)/);
      expect(code, name).not.toMatch(/\b(?:history|location)\.(?:push|replace|assign|href|hash|search)/);
      expect(code, name).not.toMatch(/core\/(?:bindings|settings)/);
    }
  });

  it("has no export, share, copy or download path (M3-8)", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\b(?:Blob|createObjectURL|FileReader|showSaveFilePicker|saveAs|window\.open|navigator\.clipboard|navigator\.share|execCommand)\b/);
      expect(code, name).not.toMatch(/\.csv\b|\btoCsv\b|\btext\/csv\b|\bdownload\b/i);
    }
    const exported = Object.keys(api);
    expect(exported.filter((key) => /export|csv|download|clipboard|share|save|persist/i.test(key))).toEqual([]);
  });

  it("has no way to pay, sign or settle", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/payment-signature|x-payment\b|payment-identifier|transferWithAuthorization|signTypedData|personal_sign|eth_sign|privateKey|writeContract|sendTransaction|\bwallet\b/i);
    }
    expect(Object.keys(api).filter((key) => /^(?:pay|sign(?!al)|settle|submit|approvePayment)/i.test(key))).toEqual([]);
  });

  it("makes no request of its own, sets no timer and uses no string-to-code or string-to-HTML sink", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|globalThis\.fetch|window\.fetch)\b/);
      expect(code, name).not.toMatch(/(?<![.\w])fetch\s*\(/);
      expect(code, name).not.toMatch(/\bset(?:Timeout|Interval)\b|requestAnimationFrame/);
      expect(code, name).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
    }
  });

  it("names exactly one host, and carries no email address", () => {
    for (const { name, code } of files) {
      const hosts = [...code.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((match) => match[1]);
      for (const host of hosts) expect(host, name).toBe("quotient-api-gateway.onrender.com");
      expect(code, name).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });

  it("reads Quotient's own output in no other form than the closed schemas", () => {
    // the only place JSON.parse appears is the import path, behind the size cap
    const parse = files.filter((file) => /JSON\.parse/.test(file.code)).map((file) => file.name);
    expect(parse).toEqual(["client.ts", "payment.ts"]);
  });
});
