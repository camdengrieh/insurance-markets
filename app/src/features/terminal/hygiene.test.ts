import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COMMAND_NAMES } from "./grammar";
import { TERMINAL_TOOLS } from "./tools";

// A source scan of the terminal's own files (tests and fixtures excluded). These are structural guarantees that a
// behavioural test cannot give: what the code CAN reach, not what it did in one run.

const DIR = new URL("./", import.meta.url);
const files = readdirSync(DIR)
  .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== "test-support.tsx")
  .map((name) => ({ name, text: readFileSync(new URL(name, DIR), "utf8") }));

function strip(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("what the terminal's source can reach", () => {
  it("scans the files it should", () => {
    expect(files.map((file) => file.name)).toEqual(
      expect.arrayContaining(["grammar.ts", "tools.ts", "client.ts", "stream.ts", "session.ts", "observer.ts", "execute.ts", "cards.tsx", "TerminalView.tsx", "ObserverPane.tsx", "services.tsx"]),
    );
  });

  it("has no string-to-HTML or string-to-code sink, no clipboard, no window opening, no persistent storage but the session token", () => {
    for (const { name, text } of files) {
      const code = strip(text);
      expect(code, name).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
      expect(code, name).not.toMatch(/navigator\.clipboard|execCommand|window\.open|\.open\(\s*["'`]/);
      expect(code, name).not.toMatch(/\blocalStorage\b|\bindexedDB\b|\bdocument\.cookie\b|\bFileReader\b|URL\.createObjectURL|\bBlob\b/);
      expect(code, name).not.toMatch(/\bhref=\{/);
    }
    // sessionStorage is named only where the services record hands the browser's storage to the session.
    const users = files.filter((file) => /\bsessionStorage\b/.test(strip(file.text))).map((file) => file.name);
    expect(users).toEqual(["services.tsx"]);
  });

  it("only the daemon client names a daemon route, and only these routes exist", () => {
    const routeLiteral = /["'`](\/ui\/[a-z/_:-]*)["'`]/g;
    const found = new Map<string, string[]>();
    for (const { name, text } of files) {
      for (const match of strip(text).matchAll(routeLiteral)) {
        const route = match[1] ?? "";
        found.set(route, [...(found.get(route) ?? []), name]);
      }
    }
    expect([...found.keys()].sort()).toEqual(["/ui/events", "/ui/inbox", "/ui/pair", "/ui/status", "/ui/tool"]);
    expect(found.get("/ui/tool")).toEqual(["client.ts"]);
    expect(found.get("/ui/status")).toEqual(["client.ts"]);
    expect(found.get("/ui/inbox")).toEqual(["client.ts"]);
    expect(found.get("/ui/events")).toEqual(["stream.ts"]);
    expect(found.get("/ui/pair")).toEqual(["session.ts"]);
  });

  it("never sends a mutating decision, an arm, a kill or a sign request", () => {
    for (const { name, text } of files) {
      expect(strip(text), name).not.toMatch(/\/ui\/(arm|disarm|kill|inbox\/decision|inbox\/sign|prepare|read)/);
    }
  });

  it("makes no network call of its own: the only fetch is the injected one", () => {
    for (const { name, text } of files) {
      const code = strip(text);
      expect(code, name).not.toMatch(/\bfetch\s*\(/);
      expect(code, name).not.toMatch(/\bXMLHttpRequest\b|\bEventSource\b|\bWebSocket\b|\bnavigator\.sendBeacon\b/);
    }
  });

  it("names no tool outside the closed list, and no prepare, submit or sign tool at all", () => {
    for (const { name, text } of files) {
      const code = strip(text);
      for (const match of code.matchAll(/\bxo_[a-z_]+\b/g)) {
        expect(TERMINAL_TOOLS as readonly string[], `${name}: ${match[0]}`).toContain(match[0]);
      }
      expect(code, name).not.toMatch(/request_wallet_sign|use_plugin|use_service|pay_x402/);
    }
  });

  it("the grammar's command table has no write verb, and the parser has no 'tool' form", () => {
    for (const verb of ["buy", "sell", "redeem", "fund", "withdraw", "create", "cancel", "submit", "sign", "arm", "disarm", "kill", "set", "flags", "caps", "call", "raw", "run", "exec"]) {
      expect(COMMAND_NAMES as readonly string[], verb).not.toContain(verb);
    }
  });

  it("reads Untrusted values only through the untrusted-text component", () => {
    // `.value` of a branded string is read nowhere in the terminal's own code (the shared renderer does it).
    for (const { name, text } of files) {
      const code = strip(text);
      if (name === "execute.ts" || name === "tools.ts") continue;
      expect(code, name).not.toMatch(/\.text\.value\b|\.title\.value\b|\.label\.value\b|\buntrusted\)?\.value\b/);
    }
  });
});
