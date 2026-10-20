import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { TRADE_TOOLS } from "./tools";

// M4-4 for the trade screens: the page contains no code path that sends a signature, a submit, a cancel or a
// withdrawal. This is an AST scan of the screens' own source (not a text search): imports, identifiers, string
// literals that name a tool or a path, calls and JSX attributes. The agent sends; this page prepares and reads.

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTE_FILE = join(HERE, "..", "..", "routes", "trade.tsx");
const TEST_ONLY = new Set(["test-support.tsx"]);

// The only file that may NAME a tool that sends. It builds fixed text for a person to give an agent; it calls nothing.
const TEXT_ONLY_FILE = "handoff.ts";
const SENDING_TOOLS = new Set(["xo_submit_userop", "xo_submit_order", "xo_cancel_order", "xo_withdraw", "xo_get_prepared"]);
const ALLOWED_SHARED = new Set(["relay/contract", "xo/account/derive", "xo/signing/rebuild", "xo/signing/amounts", "xo/signing/constants", "xo/signing/errors", "xo/signing/lines", "xo/chain/constants", "xo/funding/calldata", "guardrails/amount", "guardrails/untrusted"]);
const FORBIDDEN_IDENTIFIER = /submit|signature|signTyped|signMessage|sendTransaction|sendRawTransaction|writeContract|privateKey|mnemonic|secret/i;
// Names that are about display or the daemon's own states, not an action.
const ALLOWED_IDENTIFIERS = new Set(["SUBMIT_USEROP_TOOL", "SUBMIT_ORDER_TOOL", "submitToolFor", "ENABLE_USEROP_SUBMIT", "submitted"]);
const NETWORK_GLOBALS = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "postMessage", "BroadcastChannel", "Worker", "SharedWorker", "importScripts", "open"]);
const PAGE_INPUT_GLOBALS = new Set(["location", "localStorage", "sessionStorage", "indexedDB", "history", "document", "window", "navigator", "URLSearchParams"]);
const FORBIDDEN_JSX_ATTRIBUTES = new Set(["href", "src", "srcDoc", "style", "dangerouslySetInnerHTML", "action", "formAction", "ping", "target"]);
// Route-table keys that pick a SCHEMA to read an answer with, and the screen's own route. None is sent anywhere.
const SCHEMA_KEYS: Readonly<Record<string, readonly string[]>> = { "vet.ts": ["/v1/userop/prepare", "/v1/order/prepare"], "routes/trade.tsx": ["/trade"] };
const FILES_WITH_RAW_FETCH = new Set(["client.ts", "services.tsx"]);

interface Finding {
  readonly file: string;
  readonly rule: string;
  readonly detail: string;
}

export function scanSource(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, detail: string): void => void findings.push({ file, rule, detail });
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (/(?:^|\/)test-support$/.test(specifier)) add("test-helper-import", specifier);
      if (specifier.startsWith("@shared/") && !ALLOWED_SHARED.has(specifier.slice("@shared/".length))) add("shared-import", specifier);
      if (specifier.startsWith("@bridge/") && specifier !== "@bridge/contract") add("bridge-import", specifier);
      if (/^node:|^(?:fs|path|child_process|http|https|net|crypto)$/.test(specifier)) add("node-import", specifier);
    }
    if (ts.isIdentifier(node)) {
      const name = node.text;
      const parent = node.parent;
      const isMember = parent !== undefined && ts.isPropertyAccessExpression(parent) && parent.name === node;
      const isDeclared = parent !== undefined && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isParameter(parent) || ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) && (parent as { name?: ts.Node }).name === node;
      if (FORBIDDEN_IDENTIFIER.test(name) && !ALLOWED_IDENTIFIERS.has(name)) add("identifier", name);
      if (NETWORK_GLOBALS.has(name) && !isMember && !isDeclared) add("network-global", name);
      if (name === "rawFetch" && !FILES_WITH_RAW_FETCH.has(file)) add("raw-fetch", name);
      if (PAGE_INPUT_GLOBALS.has(name) && !isMember && !isDeclared && !(parent !== undefined && ts.isPropertySignature(parent))) add("page-input", name);
      if (name === "clipboard") add("clipboard", name);
    }
    if (ts.isStringLiteralLike(node)) {
      const value = node.text;
      const inImport = node.parent !== undefined && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent));
      if (!inImport) {
        if ((/^\/[A-Za-z]/.test(value) || value.includes("/v1/") || value.includes("/ui/")) && !(file === "client.ts" && value === "/ui/tool") && !(SCHEMA_KEYS[file] ?? []).includes(value)) add("path-literal", value);
        if (SENDING_TOOLS.has(value) && file !== TEXT_ONLY_FILE) add("sending-tool-name", value);
        if (/^xo_[a-z_]+$/.test(value) && !SENDING_TOOLS.has(value) && !(TRADE_TOOLS as readonly string[]).includes(value)) add("unlisted-tool-name", value);
      }
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const head = ts.isTemplateExpression(node) ? node.head.text : node.text;
      if (/^\/[A-Za-z]|\/v1\/|\/ui\//.test(head)) add("path-template", head);
    }
    // Only on built-in elements (a lower-case tag): a component's own prop may be called "action".
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && FORBIDDEN_JSX_ATTRIBUTES.has(node.name.text)) {
      const tag = node.parent.parent;
      const name = ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag) ? tag.tagName.getText(source) : "";
      if (/^[a-z]/.test(name)) add("jsx-attribute", `${name} ${node.name.text}`);
    }
    // Every call of the client names a tool from the closed list, as a literal.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "callTool" && file !== "client.ts") {
      const first = node.arguments[0];
      // A literal from the list, or the parameter named `tool` that prepare.ts types as the prepare-class subset.
      const typedParameter = file === "prepare.ts" && first !== undefined && ts.isIdentifier(first) && first.text === "tool";
      if (!typedParameter && (first === undefined || !ts.isStringLiteralLike(first) || !(TRADE_TOOLS as readonly string[]).includes(first.text))) add("callTool-argument", first?.getText(source) ?? "(none)");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const FILES = readdirSync(HERE)
  .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !TEST_ONLY.has(name))
  .map((name) => ({ name, text: readFileSync(join(HERE, name), "utf8") }));
FILES.push({ name: "routes/trade.tsx", text: readFileSync(ROUTE_FILE, "utf8") });

describe("what the trade screens' source can reach (M4-4, M4-5)", () => {
  it("scans the files it should", () => {
    expect(FILES.map((file) => file.name)).toEqual(expect.arrayContaining(["client.ts", "prepare.ts", "reads.ts", "tools.ts", "vet.ts", "templates.ts", "funding.ts", "handoff.ts", "TradeView.tsx", "ActionPanels.tsx", "OrdersPanel.tsx", "routes/trade.tsx"]));
  });

  it("has no finding in any file", () => {
    const all = FILES.flatMap((file) => scanSource(file.name, file.text));
    expect(all).toEqual([]);
  });

  it("names a tool that sends only in the text-only hand-off file, and calls nothing there", () => {
    const handoff = FILES.find((file) => file.name === TEXT_ONLY_FILE) as { name: string; text: string };
    const source = ts.createSourceFile(handoff.name, handoff.text, ts.ScriptTarget.ES2022, true);
    const calls: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) calls.push(node.expression.getText(source));
      ts.forEachChild(node, visit);
    };
    visit(source);
    // Only text builders: JSON.stringify, the local helper and the string/array methods that build the lines.
    for (const call of calls) expect(call, call).toMatch(/^(JSON\.stringify|need|getPreparedCall|submitToolFor|handoffFor|pattern\.test|\w+\.test)$/);
  });

  it("is where the scanner catches the things it is meant to catch", () => {
    const bad = scanSource(
      "Seeded.tsx",
      `import { x } from "@shared/xo/signing/hmac";
       export function Bad() {
         const sig = signature;
         void fetch("/ui/inbox/sign");
         return <a href="https://example.org" onClick={() => client.callTool("xo_submit_order", {})}>go</a>;
       }`,
    );
    const rules = new Set(bad.map((finding) => finding.rule));
    for (const rule of ["shared-import", "identifier", "network-global", "path-literal", "jsx-attribute", "callTool-argument", "sending-tool-name"]) expect(rules.has(rule), rule).toBe(true);
  });

  it("has no string-to-HTML or string-to-code sink and no Web storage or clipboard", () => {
    for (const { name, text } of FILES) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, name).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
      expect(code, name).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|navigator|clipboard)\b/);
    }
  });

  it("reads every creator-written or service-written string only through the untrusted slot", () => {
    for (const { name, text } of FILES) {
      expect(text, name).not.toMatch(/\.untrusted\b/);
    }
  });
});
