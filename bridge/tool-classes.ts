import { createHash } from "node:crypto";

import { armControllerOf, submitLedgerOf } from "./arming.js";
import { auditLogUnwritable } from "./audit-adapter.js";
import type { Principal } from "./auth.js";
import {
  MCP_PATH,
  TOKEN_KINDS,
  TOKEN_SCAN_PATTERN,
  TOOL_TEXT_MAX_CHARS,
  UI_ROUTE_KEYS,
  bridgeErrorCodeSchema,
  toolCallRequestSchema,
  toolCallResponseSchema,
  type TokenKind,
  type TokenScope,
  type ToolClass,
} from "./contract.js";
import { killControllerOf } from "./kill.js";
import { defineRoute, fail, json, type BridgeModule, type BridgeModuleFactory, type DaemonHost, type FailureBody, type Guard, type GuardContext } from "./server.js";

// The closed class table (docs/dapp-design.md 5.4 "Tool-class table", ask R7, acceptance M1-7) and the gate that
// enforces it.
//
// THE RULE. Every tool the plugin registers maps to exactly one class (`read`, `prepare`, `submit`, `admin`); a
// tool that is not in the table is DENIED, and a test (bridge/test/tools/tool-classes.test.ts) fails the build if
// the plugin registers a tool the table does not know, or the table lists a tool the plugin no longer has. The
// same rule covers HTTP routes: every key in the frozen contract (and the MCP endpoint) has a rule below, and the
// guard refuses a route that has none or that a module registered with a scope lower than its class needs.
//
//   read     reads only. Scope `read`, which every token holds.
//   prepare  builds something for a human to sign, or reserves daily-cap budget. Scope `prepare`.
//   submit   sends something to XO or a chain. Scope `submit` AND an open ARM window (bridge/arming.ts). A `ui`
//            token never holds `submit`, so the page can never send; only an agent token started with
//            `--agent-scope read,prepare,submit` can, and only while a human holds the window open.
//   admin    never reachable with any token. No tool is `admin` today; the class exists so one can be added and
//            stay unreachable.
//
// SCOPES PER TOKEN TYPE. `ui`: read, prepare. `agent`: any ceiling chosen at start (default read, prepare). Both
// are intersected with the instance role (a read-only instance holds `read` only) by bridge/auth.ts before they
// reach this file.
//
// TWO-STEP TOOLS. Seven tools take `step: "prepare" | "submit"`. The class depends on the step; a missing or
// unknown step is classed `submit`, the strictest, so a malformed call can never be cheaper than a real one.
//
// WHAT THE ARM WINDOW IS NOT. It does not make a send safe. It is a human-held switch that bounds when an agent
// may send. Caps stay advisory against a compromised agent (binding decision); the Signature Card and PayBox's own
// approval are where a human reads what is signed.
//
// THE /mcp ENDPOINT AND /ui/tool. The tool is named in the request BODY, which a route guard cannot see (it runs
// before the body is read). So both go through `ToolGate.admit`, which does the class, scope, kill, window,
// rate-limit and once-only checks in one place and writes the `agent.call` audit event. /ui/tool is registered by
// this file. Whoever registers /mcp must call `toolGateOf(host).admit(...)` for every `tools/call`.

// ---- the tool table -------------------------------------------------------------------------------------------------

export type ToolRule =
  | { readonly kind: "fixed"; readonly toolClass: ToolClass }
  // Class by the `step` argument: "prepare" and "submit"; anything else is `submit`.
  | { readonly kind: "stepped"; readonly prepare: ToolClass; readonly submit: ToolClass };

const fixed = (toolClass: ToolClass): ToolRule => ({ kind: "fixed", toolClass });
const stepped: ToolRule = { kind: "stepped", prepare: "prepare", submit: "submit" };

export const TOOL_CLASS_TABLE: Readonly<Record<string, ToolRule>> = Object.freeze({
  // read: no signing intent, no send. xo_get_prepared only reads a stored record back.
  xo_search: fixed("read"),
  xo_get_markets: fixed("read"),
  xo_get_market: fixed("read"),
  xo_orderbook: fixed("read"),
  xo_market_prices: fixed("read"),
  xo_positions: fixed("read"),
  xo_validate_market_draft: fixed("read"),
  pm_list_venues: fixed("read"),
  pm_get_quote: fixed("read"),
  pm_lookup_links: fixed("read"),
  pm_verify_link: fixed("read"),
  pm_compare_market: fixed("read"),
  pm_check_structure: fixed("read"),
  pm_signal_request: fixed("read"),
  pm_signal_parse: fixed("read"),
  xo_account: fixed("read"),
  xo_get_prepared: fixed("read"),
  xo_userop_status: fixed("read"),
  xo_order_status: fixed("read"),
  xo_list_orders: fixed("read"),
  xo_track_market: fixed("read"),
  // prepare: each returns something for PayBox to show, or reserves cap budget. None of them sends.
  xo_prepare_order: fixed("prepare"),
  xo_prepare_create_market: fixed("prepare"),
  xo_fund_account: fixed("prepare"),
  xo_withdraw: fixed("prepare"),
  // submit: each sends. xo_cancel_order signs nothing and only reduces risk, but it does send a request to XO under
  // stored credentials; it stays `submit` (the stricter reading). Pull the window open for a minute to use it, or
  // use the kill button to stop trading altogether.
  xo_submit_userop: fixed("submit"),
  xo_submit_order: fixed("submit"),
  xo_submit_create_market: fixed("submit"),
  xo_cancel_order: fixed("submit"),
  // stepped: the prepare step builds, the submit step sends.
  xo_connect: stepped,
  xo_deploy_enable_trading: stepped,
  xo_revoke_trading: stepped,
  xo_redeem: stepped,
  xo_respond_update: stepped,
  xo_cancel_market: stepped,
  xo_place_seed: stepped,
});

export const TOOL_NAMES: readonly string[] = Object.freeze(Object.keys(TOOL_CLASS_TABLE));

// Scope a class needs. `admin` has none: it is never granted.
export function scopeOfClass(toolClass: ToolClass): TokenScope | undefined {
  return toolClass === "admin" ? undefined : toolClass;
}

const SCOPE_RANK: Readonly<Record<TokenScope, number>> = { read: 0, prepare: 1, submit: 2 };

// The scopes a token KIND can ever hold, whatever was configured: the page never submits.
export function scopeCeilingOfKind(kind: TokenKind): readonly TokenScope[] {
  return kind === "ui" ? ["read", "prepare"] : ["read", "prepare", "submit"];
}

// Class of one call, or undefined when the tool is not in the table (denied).
export function classifyTool(tool: string, args: Readonly<Record<string, unknown>>): ToolClass | undefined {
  if (!Object.hasOwn(TOOL_CLASS_TABLE, tool)) return undefined;
  const rule = TOOL_CLASS_TABLE[tool];
  if (rule === undefined) return undefined;
  if (rule.kind === "fixed") return rule.toolClass;
  const step = args["step"];
  if (step === "prepare") return rule.prepare;
  return rule.submit;
}

// The build-failing check (M1-7): names the plugin registers versus the table. Used by the test and by any
// host that wants to assert at start.
export interface RegistryCheck {
  readonly unclassified: readonly string[];
  readonly stale: readonly string[];
}

export function checkToolRegistry(registered: readonly string[]): RegistryCheck {
  const known = new Set(TOOL_NAMES);
  const seen = new Set(registered);
  return {
    unclassified: registered.filter((name) => !known.has(name)).sort(),
    stale: TOOL_NAMES.filter((name) => !seen.has(name)).sort(),
  };
}

export function assertToolRegistryClassified(registered: readonly string[]): void {
  const { unclassified, stale } = checkToolRegistry(registered);
  if (unclassified.length > 0 || stale.length > 0) {
    throw new Error(`The tool-class table does not match the registered tools. Unclassified: ${unclassified.join(", ") || "none"}. Stale: ${stale.join(", ") || "none"}.`);
  }
}

// ---- the route table --------------------------------------------------------------------------------------------------

export type RouteClass = ToolClass | "session" | "tool" | "public";

export interface RouteRule {
  readonly routeClass: RouteClass;
  // The scope the route needs; a module may register a higher one, never a lower one.
  readonly scope: TokenScope;
  // Which token kinds may call it.
  readonly kinds: readonly TokenKind[];
}

const BOTH: readonly TokenKind[] = TOKEN_KINDS;
const PAGE: readonly TokenKind[] = ["ui"];
const rule = (routeClass: RouteClass, scope: TokenScope, kinds: readonly TokenKind[] = BOTH): RouteRule => ({ routeClass, scope, kinds });

// Keys are `${METHOD} ${path}` as in bridge/server.ts routeKeyOf (a prefix route ends in `*`).
export const ROUTE_RULES: Readonly<Record<string, RouteRule>> = Object.freeze({
  // session
  "POST /ui/pair": rule("public", "read", PAGE),
  "POST /ui/arm": rule("session", "prepare", PAGE),
  "POST /ui/arm/confirm": rule("session", "prepare", PAGE),
  "POST /ui/disarm": rule("session", "read"),
  "POST /ui/kill": rule("session", "read"),
  // read: status, feeds, the read proxy and the read-only mirrors of relay routes
  "GET /ui/status": rule("read", "read"),
  "GET /ui/events": rule("read", "read"),
  "GET /ui/inbox": rule("read", "read"),
  "GET /ui/inbox/:prepared_id": rule("read", "read"),
  "GET /ui/userop/:hash": rule("read", "read"),
  "GET /ui/order/:hash": rule("read", "read"),
  "GET /ui/read/*": rule("read", "read"),
  "POST /ui/read/*": rule("read", "read"),
  "POST /ui/account/status": rule("read", "read"),
  "POST /ui/orders/list": rule("read", "read"),
  "POST /ui/funding/check": rule("read", "read"),
  // prepare: builds a stored item for a human to sign (and reserves cap budget), or records what the card showed
  "POST /ui/prepare/userop": rule("prepare", "prepare"),
  "POST /ui/prepare/order": rule("prepare", "prepare"),
  "POST /ui/prepare/auth": rule("prepare", "prepare"),
  "POST /ui/inbox/decision": rule("prepare", "prepare"),
  // submit: the daemon signs through its own PayBox client and sends. Agent tokens only, window open.
  "POST /ui/inbox/sign": rule("submit", "submit", ["agent"]),
  // the tool is in the body: the handler's gate decides the class, scope and window
  "POST /ui/tool": rule("tool", "read"),
  [`GET ${MCP_PATH}`]: rule("tool", "read"),
  [`POST ${MCP_PATH}`]: rule("tool", "read"),
  [`DELETE ${MCP_PATH}`]: rule("tool", "read"),
});

// Every route key the daemon may serve: the frozen contract's plus the MCP methods. A test pins that this
// equals the keys of ROUTE_RULES.
export function allRouteKeys(): readonly string[] {
  return [...UI_ROUTE_KEYS, `GET ${MCP_PATH}`, `POST ${MCP_PATH}`, `DELETE ${MCP_PATH}`];
}

// ---- the route guard -----------------------------------------------------------------------------------------------------

function refusal(code: FailureBody["code"], message: string, extra: Partial<FailureBody> = {}): FailureBody {
  return { code, message, ...extra };
}

// Runs for every request, after the route's own scope check and before the body is read.
export function createRouteGuard(host: DaemonHost): Guard {
  const kill = killControllerOf(host);
  const arming = armControllerOf(host);
  return (ctx: GuardContext): FailureBody | undefined => {
    if (ctx.access === "public") return undefined;
    const ruleForRoute = Object.hasOwn(ROUTE_RULES, ctx.key) ? ROUTE_RULES[ctx.key] : undefined;
    // A route that is not classified is denied, and so is one registered with a lower scope than its class needs:
    // a module's mistake must fail closed.
    if (ruleForRoute === undefined) return refusal("scope_denied", "This route is not in the daemon's class table, so it is denied.");
    if (SCOPE_RANK[ctx.access.scope] < SCOPE_RANK[ruleForRoute.scope]) return refusal("scope_denied", "This route was registered with less scope than its class needs, so it is denied.");
    const principal = ctx.principal;
    if (principal === null) return refusal("unauthorized", "A valid bearer token is required.");
    if (!ruleForRoute.kinds.includes(principal.kind)) return refusal("scope_denied", "This kind of token may not use this route.");
    if (!principal.scopes.includes(ruleForRoute.scope)) return refusal("scope_denied", "This token may not use this route.");
    const routeClass = ruleForRoute.routeClass;
    if (routeClass === "admin") return refusal("scope_denied", "This route is never reachable with a token.");
    if (routeClass === "prepare" || routeClass === "submit") {
      if (host.instance() !== "writer") return refusal("scope_denied", "This instance serves reads only.");
      if (kill.engaged()) return refusal("kill_switch", "The kill switch is on: every write is disabled. Reads still work.");
    }
    if (routeClass === "submit" && !arming.isArmed()) {
      return refusal("not_armed", "A submit needs an open ARM window. Ask the user to arm the Cockpit.");
    }
    return undefined;
  };
}

// ---- the tool gate ------------------------------------------------------------------------------------------------------

export type ToolOutcomeKind = "ok" | "refused" | "error" | "ambiguous" | "pending";

export interface ToolRunResult {
  readonly isError: boolean;
  readonly text: string | null;
  readonly structured: unknown;
  // The runner threw, or the call was cut off: the effect is unknown.
  readonly thrown?: boolean;
}

export interface ToolLimits {
  readonly perMinute: Readonly<Record<"read" | "prepare" | "submit", number>>;
  // `prepare` reserves daily-cap budget, so unbounded prepare calls are a denial-of-budget vector (note 27): a
  // token may make this many in one daemon run.
  readonly preparePerSession: number;
}

export const DEFAULT_TOOL_LIMITS: ToolLimits = Object.freeze({
  perMinute: Object.freeze({ read: 120, prepare: 20, submit: 6 }),
  preparePerSession: 200,
});

// What a settled tool call looked like, for host code that wants to react to it (the inbox takes prepared items from
// it). The structured answer is the tool's own; a listener must treat it as data and must not throw.
export interface ToolResultEvent {
  readonly tool: string;
  readonly toolClass: ToolClass;
  readonly principal: Principal;
  readonly outcome: ToolOutcomeKind;
  readonly structured: unknown;
}

export type Admission =
  | {
      readonly ok: true;
      readonly toolClass: ToolClass;
      readonly argsHash: string;
      // Call exactly once with what the tool did. Writes the audit event, updates the once-only ledger and tells the
      // kill switch and the ARM window about a `kill_switch` or `tripwire` answer.
      settle(result: ToolRunResult): ToolOutcomeKind;
    }
  | { readonly ok: false; readonly toolClass: ToolClass | null; readonly failure: FailureBody };

const HEX32 = /^[0-9a-f]{32}$/;
const ORDER_HASH = /^0x[0-9a-fA-F]{64}$/;
const CODE_WORD = /^[a-z0-9_]{1,48}$/;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// First 16 hex digits of SHA-256 over the canonical arguments: enough to tell two calls apart in the audit log,
// not enough to recover anything.
export function argsHashOf(args: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(canonical(args), "utf8").digest("hex").slice(0, 16);
}

// The id the once-only ledger uses for a submit-class call: the prepared id, or the order hash for a cancel.
export function submitKeyOf(tool: string, args: Readonly<Record<string, unknown>>): string | undefined {
  const prepared = args["prepared_id"];
  if (typeof prepared === "string" && HEX32.test(prepared.toLowerCase())) return `p:${prepared.toLowerCase()}`;
  const order = args["order_hash"];
  if (tool === "xo_cancel_order" && typeof order === "string" && ORDER_HASH.test(order)) return `o:${order.toLowerCase()}`;
  return undefined;
}

function codeOf(structured: unknown): string | undefined {
  if (structured === null || typeof structured !== "object") return undefined;
  const code = (structured as Record<string, unknown>)["code"];
  return typeof code === "string" && CODE_WORD.test(code) ? code : undefined;
}

export function outcomeOf(result: ToolRunResult): ToolOutcomeKind {
  if (result.thrown === true) return "error";
  const structured = result.structured;
  const word = structured !== null && typeof structured === "object" ? (structured as Record<string, unknown>)["outcome"] : undefined;
  if (word === "ambiguous") return "ambiguous";
  if (word === "refused") return "refused";
  if (word === "pending") return "pending";
  if (word === "rejected") return "error";
  if (codeOf(structured) === "ambiguous") return "ambiguous";
  return result.isError ? "error" : "ok";
}

interface RateWindow {
  readonly times: number[];
}

export class ToolGate {
  readonly #host: DaemonHost;
  readonly #limits: ToolLimits;
  readonly #windows = new Map<string, RateWindow>();
  readonly #prepared = new Map<string, number>();
  readonly #listeners: Array<(event: ToolResultEvent) => void> = [];

  constructor(host: DaemonHost, limits: ToolLimits = DEFAULT_TOOL_LIMITS) {
    this.#host = host;
    this.#limits = limits;
  }

  // Called once for every settled call, after the audit line is written. A throwing listener is ignored.
  onResult(listener: (event: ToolResultEvent) => void): void {
    this.#listeners.push(listener);
  }

  #rate(principal: Principal, toolClass: "read" | "prepare" | "submit"): number | undefined {
    const now = this.#host.clock();
    const key = `${principal.kind}:${principal.id}:${toolClass}`;
    const window: RateWindow = this.#windows.get(key) ?? { times: [] };
    while (window.times.length > 0 && (window.times[0] ?? 0) <= now - 60_000) window.times.shift();
    const max = this.#limits.perMinute[toolClass];
    if (window.times.length >= max) {
      this.#windows.set(key, window);
      const oldest = window.times[0] ?? now;
      return Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
    }
    window.times.push(now);
    this.#windows.set(key, window);
    return undefined;
  }

  #audit(principal: Principal, tool: string, toolClass: ToolClass | null, argsHash: string, outcome: ToolOutcomeKind, code: string | undefined, key?: string): void {
    this.#host.emitAudit({
      ev: "agent.call",
      outcome,
      tokenId: principal.id,
      tool,
      argsHash,
      ...(toolClass === null ? {} : { toolClass }),
      ...(code === undefined ? {} : { code }),
      // The ledger key is "p:<32 hex>"; only the first 8 characters ever leave this file.
      ...(key !== undefined && key.startsWith("p:") ? { preparedId: key.slice(2, 10) } : {}),
    });
  }

  admit(principal: Principal, tool: string, args: Readonly<Record<string, unknown>>): Admission {
    const argsHash = argsHashOf(args);
    const deny = (toolClass: ToolClass | null, failure: FailureBody, key?: string): Admission => {
      this.#audit(principal, tool, toolClass, argsHash, "refused", failure.code, key);
      return { ok: false, toolClass, failure };
    };

    const toolClass = classifyTool(tool, args);
    if (toolClass === undefined) return deny(null, refusal("scope_denied", "That tool is not in the daemon's class table, so it is denied."));
    const scope = scopeOfClass(toolClass);
    if (scope === undefined) return deny(toolClass, refusal("scope_denied", "That tool is never reachable with a token."));
    if (!scopeCeilingOfKind(principal.kind).includes(scope) || !principal.scopes.includes(scope)) {
      return deny(toolClass, refusal("scope_denied", "This token may not call tools of this class."));
    }
    if (toolClass !== "read") {
      if (this.#host.instance() !== "writer") return deny(toolClass, refusal("scope_denied", "This instance serves reads only."));
      if (killControllerOf(this.#host).engaged()) return deny(toolClass, refusal("kill_switch", "The kill switch is on: every write is disabled. Reads still work."));
      // A tool call arrives on a route registered at scope `read`, so the audit guard on routes (audit-adapter.ts) never
      // sees its class: the gate asks itself. Nothing that prepares or sends runs while the audit log cannot be written.
      if (auditLogUnwritable(this.#host)) {
        return deny(toolClass, refusal("precondition_failed", "The audit log cannot be written, so nothing that prepares or sends is allowed until it can.", { details: { reason: "audit_log_unwritable" } }));
      }
    }
    let key: string | undefined;
    if (toolClass === "submit") {
      if (!armControllerOf(this.#host).isArmed()) return deny(toolClass, refusal("not_armed", "A submit needs an open ARM window. Ask the user to arm the Cockpit."));
      key = submitKeyOf(tool, args);
      if (key === undefined) return deny(toolClass, refusal("invalid_request", "A submit names the prepared item it sends (prepared_id)."));
    }
    const limited = this.#limit(principal, toolClass);
    if (limited !== undefined) return deny(toolClass, refusal("rate_limited", "Too many calls of this kind. Wait and try again.", { retryAfterS: limited }), key);

    if (toolClass === "submit" && key !== undefined) {
      const claim = submitLedgerOf(this.#host).claim(key);
      if (claim.kind !== "first") {
        // Never forwarded: two submits of one item send once.
        return deny(
          toolClass,
          refusal("prepared_used", claim.kind === "in_flight" ? "This item is already being sent. Do not send it again; check its status." : "This item was already submitted. Do not send it again; check its status.", {
            details: { state: claim.kind, ...(claim.kind === "done" ? { previous: claim.outcome } : {}) },
          }),
          key,
        );
      }
      // The send is about to start: record that before it can fail in an unknown way.
      this.#audit(principal, tool, toolClass, argsHash, "pending", undefined, key);
    }

    let settled = false;
    const settle = (result: ToolRunResult): ToolOutcomeKind => {
      const outcome = outcomeOf(result);
      if (settled) return outcome;
      settled = true;
      const code = codeOf(result.structured);
      killControllerOf(this.#host).observeCode(code);
      armControllerOf(this.#host).observeCode(code);
      if (toolClass === "submit" && key !== undefined) {
        const ledger = submitLedgerOf(this.#host);
        // Released only when the tool itself said it sent nothing; every other result, even an error, stays.
        if (outcome === "refused") ledger.release(key);
        else ledger.settle(key, outcome);
      }
      this.#audit(principal, tool, toolClass, argsHash, outcome, code, key);
      for (const listener of this.#listeners) {
        try {
          listener({ tool, toolClass, principal, outcome, structured: result.structured });
        } catch {
          // a listener must not change what the caller sees
        }
      }
      return outcome;
    };
    return { ok: true, toolClass, argsHash, settle };
  }

  #limit(principal: Principal, toolClass: ToolClass): number | undefined {
    if (toolClass === "admin") return undefined;
    if (toolClass === "prepare") {
      const used = this.#prepared.get(principal.id) ?? 0;
      if (used >= this.#limits.preparePerSession) return 3600;
    }
    const wait = this.#rate(principal, toolClass);
    if (wait === undefined && toolClass === "prepare") this.#prepared.set(principal.id, (this.#prepared.get(principal.id) ?? 0) + 1);
    return wait;
  }
}

const gates = new WeakMap<object, ToolGate>();

export function toolGateOf(host: DaemonHost, limits?: ToolLimits): ToolGate {
  let gate = gates.get(host);
  if (gate === undefined) {
    gate = new ToolGate(host, limits);
    gates.set(host, gate);
  }
  return gate;
}

// ---- running a tool ------------------------------------------------------------------------------------------------------

export interface ToolRunner {
  call(tool: string, args: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<ToolRunResult>;
  // Names of the registered tools; used to check the table against the live registry.
  listTools?(): Promise<readonly string[]>;
  close?(): Promise<void>;
}

const CALL_TIMEOUT_MS = 120_000;

// The plugin's own tools, in this process, over a linked in-memory transport: the same `createLocalMcpServer` that
// `dist/local.mjs` serves over stdio, so the relay behind it is the in-process one the CLI already installed.
// Loaded on first use, so a daemon that never runs a tool never builds the MCP server.
export function createInProcessToolRunner(): ToolRunner {
  interface Connection {
    send(method: string, params: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>>;
    close(): Promise<void>;
  }
  let connection: Promise<Connection> | undefined;

  const open = async (): Promise<Connection> => {
    const { InMemoryTransport } = await import("@modelcontextprotocol/server");
    const { createLocalMcpServer } = await import("../src/local/server.js");
    const server = createLocalMcpServer();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const pending = new Map<number, (message: Record<string, unknown>) => void>();
    clientSide.onmessage = (message) => {
      const id = (message as { id?: unknown }).id;
      if (typeof id === "number") pending.get(id)?.(message as unknown as Record<string, unknown>);
    };
    await clientSide.start();
    let nextId = 1;
    return {
      send: (method, params, signal) =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          const timer = setTimeout(() => finish(() => reject(new Error("tool_timeout"))), CALL_TIMEOUT_MS);
          timer.unref();
          const onAbort = (): void => finish(() => reject(new Error("aborted")));
          const finish = (action: () => void): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            pending.delete(id);
            action();
          };
          if (signal.aborted) return reject(new Error("aborted"));
          signal.addEventListener("abort", onAbort, { once: true });
          pending.set(id, (message) => finish(() => resolve(message)));
          clientSide
            .send({
              jsonrpc: "2.0",
              id,
              method,
              params: {
                ...params,
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                  "io.modelcontextprotocol/clientInfo": { name: "cockpit-daemon", version: "0" },
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              },
            } as never)
            .catch(() => finish(() => reject(new Error("send_failed"))));
        }),
      close: async () => {
        await clientSide.close();
        await server.close();
      },
    };
  };
  const get = (): Promise<Connection> => (connection ??= open());

  return {
    async call(tool, args, signal) {
      try {
        const response = await (await get()).send("tools/call", { name: tool, arguments: args }, signal);
        const result = response["result"] as Record<string, unknown> | undefined;
        if (result === undefined) return { isError: true, text: null, structured: null, thrown: false };
        const content = Array.isArray(result["content"]) ? (result["content"] as Array<{ type?: unknown; text?: unknown }>) : [];
        const text = content.filter((item) => item.type === "text" && typeof item.text === "string").map((item) => item.text as string).join("\n");
        return { isError: result["isError"] === true, text: text === "" ? null : text, structured: result["structuredContent"] ?? null };
      } catch {
        return { isError: true, text: null, structured: null, thrown: true };
      }
    },
    async listTools() {
      const response = await (await get()).send("tools/list", {}, new AbortController().signal);
      const tools = (response["result"] as { tools?: Array<{ name?: unknown }> } | undefined)?.tools ?? [];
      return tools.map((tool) => String(tool.name));
    },
    async close() {
      if (connection === undefined) return;
      const open = connection;
      connection = undefined;
      await (await open).close().catch(() => undefined);
    },
  };
}

// ---- the module ------------------------------------------------------------------------------------------------------------------

export interface ToolClassesOptions {
  readonly runner?: ToolRunner | (() => ToolRunner);
  readonly limits?: ToolLimits;
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return null;
  }
}

const TOKEN_LIKE = new RegExp(TOKEN_SCAN_PATTERN.source, "g");

function cleanText(text: string | null): string | null {
  if (text === null) return null;
  return text.replace(TOKEN_LIKE, "[removed]").slice(0, TOOL_TEXT_MAX_CHARS);
}

export function createToolClassesModule(options: ToolClassesOptions = {}): BridgeModuleFactory {
  return (host: DaemonHost): BridgeModule => {
    const gate = toolGateOf(host, options.limits);
    host.addGuard(createRouteGuard(host));
    const runner = typeof options.runner === "function" ? options.runner() : (options.runner ?? createInProcessToolRunner());
    return {
      name: "tool-classes",
      routes: [
        defineRoute({
          method: "POST",
          path: "/ui/tool",
          // The route only needs a token; the class of the named tool decides the rest.
          access: { scope: "read" },
          body: toolCallRequestSchema,
          handler: async (ctx) => {
            const principal = ctx.principal;
            if (principal === null) return fail("unauthorized", "A valid bearer token is required.");
            const admission = gate.admit(principal, ctx.body.tool, ctx.body.args);
            if (!admission.ok) return fail(admission.failure.code, admission.failure.message, { ...(admission.failure.details === undefined ? {} : { details: admission.failure.details }), ...(admission.failure.retryAfterS === undefined ? {} : { retryAfterS: admission.failure.retryAfterS }) });
            const started = host.clock();
            let run: ToolRunResult;
            try {
              run = await runner.call(ctx.body.tool, ctx.body.args, ctx.signal);
            } catch {
              run = { isError: true, text: null, structured: null, thrown: true };
            }
            const outcome = admission.settle(run);
            const code = codeOf(run.structured);
            const parsedCode = bridgeErrorCodeSchema.safeParse(code);
            const response = toolCallResponseSchema.safeParse({
              tool: ctx.body.tool,
              tool_class: admission.toolClass,
              ok: !run.isError && outcome !== "error",
              duration_ms: Math.max(0, Math.round(host.clock() - started)),
              structured: jsonSafe(run.structured),
              text: cleanText(run.text),
              error:
                run.isError || outcome === "error"
                  ? { code: parsedCode.success ? parsedCode.data : "internal", message: run.thrown === true ? "The tool call did not finish; its effect is unknown." : "The tool reported an error. See the text." }
                  : null,
            });
            if (!response.success) return fail("internal", "The tool's answer could not be encoded.");
            return json(response.data);
          },
        }),
      ],
      close: async () => {
        await runner.close?.();
      },
    };
  };
}

export const bridgeModule: BridgeModuleFactory = createToolClassesModule();
