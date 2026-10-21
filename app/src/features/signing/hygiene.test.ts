import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { inboxDecisionRequestSchema } from "@bridge/contract";

// M4-4: the page contains no code path that sends a signature. This is an AST test over the screen's own source
// (not a text search): it looks at imports, identifiers, string literals that name a path, and calls. The agent
// submits; this page only reads the inbox and records two decisions (shown, reject).
//
// It also checks that the card is built from the record alone (M4-5): the page files read no location, storage,
// document or message channel, so no text can reach the card from anywhere but the daemon's inbox record.

const HERE = dirname(fileURLToPath(import.meta.url));
// Test-only helpers: they build fixtures and a fake daemon, and never enter a build.
const TEST_ONLY = new Set(["testkit.ts", "test-support.tsx"]);

// The only paths the page names. Everything else comes from the contract's own path builders.
const ALLOWED_PATH_LITERALS: ReadonlySet<string> = new Set(["/ui/inbox", "/ui/inbox/decision"]);
// What may be imported from the shared modules.
const ALLOWED_SHARED = new Set(["relay/contract", "xo/account/derive", "xo/signing/rebuild"]);
const FORBIDDEN_IMPORTED_NAME = /submit|inboxSign|PREPARE_ROUTES|UI_POST|INBOX_POST|TOOL_POST|SESSION_POST|toolCall|toPayboxSignArgs|POST_ROUTES(?!$)/i;
const FORBIDDEN_IDENTIFIER = /submit|signature/i;
// "submitted" is a state the daemon reports (an inbox state), not an action this page takes. The card and its
// dialog are named after what they show, not after anything they do.
const ALLOWED_IDENTIFIERS = new Set(["SignatureCard", "SignatureCardProps", "SignatureCardDialog", "SignatureCardDialogProps", "submitted"]);
// Route-table keys that pick a SCHEMA to read an answer with, per file. None of them is sent anywhere.
const SCHEMA_KEYS: Readonly<Record<string, readonly string[]>> = {
  "card.ts": ["/v1/userop/prepare", "/v1/order/prepare"],
  "client.ts": ["/ui/userop/:hash", "/ui/order/:hash"],
};
const NETWORK_GLOBALS = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "postMessage", "BroadcastChannel", "Worker", "SharedWorker", "importScripts"]);
const PAGE_INPUT_GLOBALS = new Set(["location", "localStorage", "sessionStorage", "indexedDB", "URLSearchParams", "history", "document", "window"]);
const FORBIDDEN_JSX_ATTRIBUTES = new Set(["href", "src", "srcDoc", "style", "dangerouslySetInnerHTML", "action", "formAction", "ping"]);
const RAW_FETCH_FILES = new Set(["client.ts", "services.tsx"]);

interface Finding {
  readonly file: string;
  readonly rule: string;
  readonly detail: string;
}

function kindOfFile(name: string): ts.ScriptKind {
  return name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function scanSource(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, detail: string): void => void findings.push({ file, rule, detail });
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, kindOfFile(file));
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (/(?:^|\/)(?:testkit|test-support)$/.test(specifier)) add("test-helper-import", specifier);
      if (specifier.startsWith("@shared/")) {
        if (!ALLOWED_SHARED.has(specifier.slice("@shared/".length))) add("shared-import", specifier);
      } else if (specifier.startsWith("@bridge/") && specifier !== "@bridge/contract") {
        add("bridge-import", specifier);
      }
      const bindings = node.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (FORBIDDEN_IMPORTED_NAME.test(imported)) add("forbidden-import", `${imported} from ${specifier}`);
        }
      }
    }
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (FORBIDDEN_IDENTIFIER.test(name) && !ALLOWED_IDENTIFIERS.has(name)) add("identifier", name);
      const isMember = node.parent !== undefined && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      const isDeclaredName = node.parent !== undefined && (ts.isPropertyAssignment(node.parent) || ts.isPropertySignature(node.parent) || ts.isParameter(node.parent) || ts.isVariableDeclaration(node.parent) || ts.isBindingElement(node.parent)) && (node.parent as { name?: ts.Node }).name === node;
      if (NETWORK_GLOBALS.has(name) && !isDeclaredName && !(isMember && name === "rawFetch")) add("network-global", name);
      if (PAIR_ONLY_RAW_FETCH(name, isMember, file)) add("raw-fetch", `${name} outside the client`);
      if (PAGE_INPUT_GLOBALS.has(name) && !isMember && !isDeclaredName && !ts.isJsxAttribute(node.parent) && !ts.isPropertySignature(node.parent)) add("page-input", name);
    }
    if (ts.isStringLiteralLike(node)) {
      const value = node.text;
      const parentIsImport = node.parent !== undefined && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent));
      if (!parentIsImport && (/^\/[A-Za-z]/.test(value) || value.includes("/v1/") || value.includes("/ui/")) && !ALLOWED_PATH_LITERALS.has(value) && !(SCHEMA_KEYS[file] ?? []).includes(value)) add("path-literal", value);
      if (/^(signature|sig)$/i.test(value)) add("signature-key", value);
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const head = ts.isTemplateExpression(node) ? node.head.text : node.text;
      if (/^\/[A-Za-z]|\/v1\/|\/ui\//.test(head)) add("path-template", head);
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && FORBIDDEN_JSX_ATTRIBUTES.has(node.name.text)) add("jsx-attribute", node.name.text);
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && /^on[A-Z]/.test(node.name.text) === false && node.name.text.toLowerCase().startsWith("on")) add("jsx-attribute", node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function PAIR_ONLY_RAW_FETCH(name: string, isMember: boolean, file: string): boolean {
  void isMember;
  return name === "rawFetch" && !RAW_FETCH_FILES.has(file);
}

// client.ts: the only file that sends anything. Its one request function is called with exactly three kinds of path.
export function scanClient(text: string): Finding[] {
  const findings: Finding[] = [];
  const source = ts.createSourceFile("client.ts", text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const firstArgs: string[] = [];
  const postFrames: string[] = [];
  let rawFetchCalls = 0;
  const enclosing = (node: ts.Node): string => {
    for (let at: ts.Node | undefined = node; at !== undefined; at = at.parent) {
      if ((ts.isMethodDeclaration(at) || ts.isFunctionDeclaration(at)) && at.name !== undefined) return at.name.getText(source);
    }
    return "";
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (callee === "this.#json") firstArgs.push((node.arguments[0] ?? node).getText(source));
      if (callee.endsWith("rawFetch")) {
        rawFetchCalls += 1;
        if (enclosing(node) !== "#json") findings.push({ file: "client.ts", rule: "raw-fetch-location", detail: enclosing(node) });
      }
    }
    if (ts.isStringLiteral(node) && node.text === "POST" && !ts.isLiteralTypeNode(node.parent)) postFrames.push(enclosing(node));
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (rawFetchCalls !== 1) findings.push({ file: "client.ts", rule: "raw-fetch-count", detail: String(rawFetchCalls) });
  const expected = ["DECISION_PATH", "userOpStatusUiPath(hash)", "orderStatusUiPath(hash)"];
  if (JSON.stringify(firstArgs.sort()) !== JSON.stringify([...expected].sort())) findings.push({ file: "client.ts", rule: "request-paths", detail: firstArgs.join(" | ") });
  if (postFrames.length !== 1 || postFrames[0] !== "decide") findings.push({ file: "client.ts", rule: "post-only-in-decide", detail: postFrames.join(",") });
  return findings;
}

function pageFiles(): Array<{ readonly name: string; readonly text: string }> {
  const files = readdirSync(HERE).filter((name) => /\.(?:ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !TEST_ONLY.has(name));
  // The inbox has no route of its own any more: it lives in the terminal dock (features/terminal/Dock.tsx), so
  // every file of the feature is here.
  return files.map((name) => ({ name, text: readFileSync(join(HERE, name), "utf8") }));
}

describe("M4-4: no code path in the page sends a signature (AST)", () => {
  const files = pageFiles();

  it("scans the whole feature: card, dialog, client, store and the inbox list", () => {
    const names = files.map((file) => file.name);
    for (const expected of ["card.ts", "client.ts", "store.ts", "SigningView.tsx", "SignatureCard.tsx", "SignatureCardDialog.tsx", "CardParts.tsx", "useInbox.ts", "services.tsx"]) expect(names).toContain(expected);
  });

  it("finds nothing in the real source", () => {
    const findings = files.flatMap((file) => scanSource(file.name, file.text));
    expect(findings).toEqual([]);
  });

  it("client.ts has one request function, three paths, and one POST (the decision)", () => {
    const client = files.find((file) => file.name === "client.ts");
    expect(client).toBeDefined();
    expect(scanClient(client?.text ?? "")).toEqual([]);
  });

  it("the decision route takes two kinds of body: shown and reject", () => {
    const kinds = inboxDecisionRequestSchema.options.map((option) => option.shape.decision.value).sort();
    expect(kinds).toEqual(["reject", "shown"]);
  });

  it("no page file imports the test helpers", () => {
    for (const file of files) expect(file.text).not.toMatch(/from\s+"\.\/(?:testkit|test-support)"/);
  });
});

describe("the scanner has teeth: each forbidden pattern is caught", () => {
  const bad: ReadonlyArray<readonly [string, string, string]> = [
    ["a call to a submit route", 'export const f = () => fetch("/ui/inbox/sign", { method: "POST" });', "network-global"],
    ["a path literal for the sign route", 'export const p = "/ui/inbox/sign";', "path-literal"],
    ["a plugin submit path", 'export const p = "/v1/userop/submit";', "path-literal"],
    ["a tool route", 'export const p = "/ui/tool";', "path-literal"],
    ["a path in a template", "export const p = (id: string) => `/ui/inbox/${id}/sign`;", "path-template"],
    ["a submit identifier", "export function submitIt() { return 1; }", "identifier"],
    ["a signature identifier", "export const signature = 1;", "identifier"],
    ["an object key named signature", 'export const body = { "signature": 1 };', "signature-key"],
    ["an import of the sign request schema", 'import { inboxSignRequestSchema } from "@bridge/contract"; export const a = inboxSignRequestSchema;', "forbidden-import"],
    ["an import of the prepare routes", 'import { PREPARE_ROUTES } from "@bridge/contract"; export const a = PREPARE_ROUTES;', "forbidden-import"],
    ["an import of the relay client", 'import { createRelayClient } from "@shared/relay/client"; export const a = createRelayClient;', "shared-import"],
    ["a daemon internal", 'import { x } from "@bridge/auth"; export const a = x;', "bridge-import"],
    ["a test helper in page code", 'import { deployItem } from "./testkit"; export const a = deployItem;', "test-helper-import"],
    ["reading the address bar", "export const a = location.hash;", "page-input"],
    ["reading local storage", 'export const a = localStorage.getItem("x");', "page-input"],
    ["reading the document", "export const a = document.title;", "page-input"],
    ["a message channel", 'export const a = () => postMessage("x");', "network-global"],
    ["a socket", 'export const a = new WebSocket("x");', "network-global"],
    ["a link in JSX", 'export const A = () => <a href="x">y</a>;', "jsx-attribute"],
    ["an inline style in JSX", 'export const A = () => <b style={{}}>y</b>;', "jsx-attribute"],
    ["a handler spelled in lower case", 'export const A = () => <b onclick="x">y</b>;', "jsx-attribute"],
  ];
  for (const [name, code, rule] of bad) {
    it(name, () => {
      const findings = scanSource(code.includes("<") ? "x.tsx" : "x.ts", code);
      expect(findings.map((finding) => finding.rule)).toContain(rule);
    });
  }

  it("raw fetch outside client.ts and services.tsx is caught", () => {
    expect(scanSource("SigningView.tsx", "export const a = (s: { rawFetch: unknown }) => s.rawFetch;").map((f) => f.rule)).toContain("raw-fetch");
    expect(scanSource("client.ts", "export const a = (s: { rawFetch: unknown }) => s.rawFetch;")).toEqual([]);
  });

  it("a client with a second request path, a second POST or a second raw fetch is caught", () => {
    const real = readFileSync(join(HERE, "client.ts"), "utf8");
    expect(scanClient(real.replace("this.#json(DECISION_PATH,", 'this.#json("/ui/inbox/sign",'))).not.toEqual([]);
    expect(scanClient(real.replace("this.#json(userOpStatusUiPath(hash), {}", 'this.#json(userOpStatusUiPath(hash), { method: "POST" }').concat('\nexport const extra = "POST";'))).not.toEqual([]);
    expect(scanClient(`${real}\nexport const x = (d: { rawFetch: (u: string) => void }) => d.rawFetch("/x");`)).not.toEqual([]);
  });
});
