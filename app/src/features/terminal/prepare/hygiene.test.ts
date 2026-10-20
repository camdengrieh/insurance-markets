import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PREPARE_VERBS } from "./grammar";

// A source scan of the prepare commands' own files (tests and test support excluded). These are structural
// guarantees a behavioural test cannot give: what the code CAN reach, not what it did in one run.

const DIR = new URL("./", import.meta.url);
const files = readdirSync(DIR)
  .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== "test-support.tsx")
  .map((name) => ({ name, text: readFileSync(new URL(name, DIR), "utf8") }));

function strip(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("what the prepare commands' source can reach", () => {
  it("scans the files it should", () => {
    expect(files.map((file) => file.name).sort()).toEqual(["PrepareConsole.tsx", "PrepareOutcomeView.tsx", "grammar.ts", "index.ts", "run.ts", "taint.ts"]);
  });

  it("has no string-to-HTML or string-to-code sink, no clipboard, no window opening, no storage, no cookie", () => {
    for (const { name, text } of files) {
      const code = strip(text);
      expect(code, name).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
      expect(code, name).not.toMatch(/navigator\.clipboard|execCommand|window\.open|\.open\(\s*["'`]/);
      expect(code, name).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b|\bFileReader\b|URL\.createObjectURL|\bBlob\b/);
      expect(code, name).not.toMatch(/\bhref=\{/);
    }
  });

  it("makes no network call of its own and names no daemon route: everything goes through the trade and terminal clients", () => {
    for (const { name, text } of files) {
      const code = strip(text);
      expect(code, name).not.toMatch(/\bfetch\s*\(/);
      expect(code, name).not.toMatch(/\bXMLHttpRequest\b|\bEventSource\b|\bWebSocket\b|\bnavigator\.sendBeacon\b/);
      expect(code, name).not.toMatch(/["'`]\/ui\//);
    }
  });

  it("names exactly one tool, the market read, and no submit, sign, cancel, withdraw, create, arm or kill tool", () => {
    const named = new Set<string>();
    for (const { text } of files) for (const match of strip(text).matchAll(/\bxo_[a-z_]+\b/g)) named.add(match[0]);
    expect([...named]).toEqual(["xo_get_market"]);
    for (const { name, text } of files) {
      expect(strip(text), name).not.toMatch(/request_wallet_sign|use_plugin|use_service|pay_x402|xo_submit|xo_cancel|xo_withdraw/);
    }
  });

  it("has no flag, cap or session writer: no write-switch name and no arm, disarm or kill route in code", () => {
    for (const { name, text } of files) {
      const code = strip(text);
      expect(code, name).not.toMatch(/\bENABLE_[A-Z_]+\b|\bXO_KILL_SWITCH\b|\bsetFlag\b|\bsetCap\b|\bengageKill\b/);
    }
  });

  it("reaches the daemon only through the five prepare calls and the reads of the trade feature", () => {
    const run = strip(files.find((file) => file.name === "run.ts")?.text ?? "");
    for (const call of ["prepareOrder", "prepareDeploy", "prepareRevoke", "prepareRedeem", "prepareFunding", "readAccount", "readOrders"]) expect(run).toContain(call);
    for (const { name, text } of files) {
      if (name === "run.ts") continue;
      expect(strip(text), name).not.toMatch(/\bprepare(Order|Deploy|Revoke|Redeem|Funding)\b|\bcallTool\b/);
    }
  });

  it("reads Untrusted values only through the untrusted-text component", () => {
    for (const { name, text } of files) {
      expect(strip(text), name).not.toMatch(/\.message\.value\b|\.text\.value\b|\.title\.value\b|\buntrusted\)?\.value\b/);
    }
  });

  it("has exactly the six prepare verbs and no verb for a send", () => {
    expect([...PREPARE_VERBS]).toEqual(["order", "cancel", "redeem", "fund", "deploy", "revoke"]);
  });
});
