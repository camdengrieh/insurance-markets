import { describe, expect, it } from "vitest";

import { READ_SERVICES } from "../headers.config.ts";
import { POST_ROUTES, digestTag } from "../../src/relay/contract.ts";
import { ERROR_CODES } from "../../src/relay/errors.ts";
import {
  ARM_CODE_PATTERN,
  BRIDGE_ERROR_CODES,
  BRIDGE_ERROR_HTTP_STATUS,
  BRIDGE_EXTRA_ERROR_CODES,
  INBOX_STATES,
  INBOX_TRANSITIONS,
  JSON_RPC_READ_METHODS,
  PAGE_PREPARE_USEROP_ACTIONS,
  PREPARE_ROUTES,
  READ_PROXY_PREFIX,
  TOKEN_SCAN_PATTERN,
  UI_ROUTE_KEYS,
  agentTokenSchema,
  armConfirmRequestSchema,
  armRequestSchema,
  bridgeErrorResponseSchema,
  canTransition,
  inboxDecisionRequestSchema,
  inboxItemSchema,
  inboxItemUiPath,
  isSafeUpstreamPath,
  isSafeUpstreamQuery,
  matchUiGetRoute,
  orderStatusUiPath,
  pageUseropPrepareRequestSchema,
  parseReadProxyTarget,
  readProxyPath,
  readProxyResponseSchema,
  statusResponseSchema,
  toolCallResponseSchema,
  uiEventSchema,
  uiTokenSchema,
  userOpStatusUiPath,
} from "../../bridge/contract.ts";

// Contract tests for bridge/contract.ts: the frozen wire format every Cockpit stream builds against.

const DIGEST = `0x${"ab12".repeat(16)}`;
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d";

function preparedUserOp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    prepared_id: "0123456789abcdef0123456789abcdef",
    kind: "userop",
    owner: OWNER,
    account: ACCOUNT,
    expires_at: "2026-10-19T12:05:00Z",
    sign: { intent: { op: "raw", rawSigningPayloadHex: DIGEST }, expected_digest: DIGEST, digest_form: "userOpHash" },
    summary: { lines: ["Deploy the account and enable trading"], digest_tag: digestTag(DIGEST) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: { "account.bundler_accepts_foreign_account": "unknown" },
    warnings: [],
    user_op_hash: DIGEST,
    ...overrides,
  };
}

function inboxItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    prepared_id: "0123456789abcdef0123456789abcdef",
    state: "prepared",
    requested_by: "agent:0a1b2c3d",
    created_at: "2026-10-19T12:00:00Z",
    updated_at: "2026-10-19T12:00:00Z",
    expires_at: "2026-10-19T12:05:00Z",
    prepared: preparedUserOp(),
    result: null,
    ...overrides,
  };
}

describe("bridge/contract: errors", () => {
  it("extends the relay codes, keeps them, and gives every code an HTTP status", () => {
    for (const code of ERROR_CODES) expect(BRIDGE_ERROR_CODES).toContain(code);
    expect(new Set(BRIDGE_ERROR_CODES).size).toBe(BRIDGE_ERROR_CODES.length);
    for (const code of BRIDGE_ERROR_CODES) {
      const status = BRIDGE_ERROR_HTTP_STATUS[code];
      expect(Number.isInteger(status) && status >= 200 && status < 600, code).toBe(true);
    }
    expect(Object.keys(BRIDGE_ERROR_HTTP_STATUS).sort()).toEqual([...BRIDGE_ERROR_CODES].sort());
  });

  it("maps the security refusals to the statuses the acceptance tests name", () => {
    expect(BRIDGE_ERROR_HTTP_STATUS.host_forbidden).toBe(403); // M1-1
    expect(BRIDGE_ERROR_HTTP_STATUS.origin_forbidden).toBe(403); // M1-2
    expect(BRIDGE_ERROR_HTTP_STATUS.unauthorized).toBe(401); // M1-2
    expect(BRIDGE_ERROR_HTTP_STATUS.not_armed).toBe(403); // M4-3
    expect(BRIDGE_ERROR_HTTP_STATUS.flag_off).toBe(403); // M1-10
    expect(BRIDGE_ERROR_HTTP_STATUS.kill_switch).toBe(503);
  });

  it("parses an error body strictly", () => {
    expect(bridgeErrorResponseSchema.safeParse({ error: { code: "venue_paused", message: "paused", retry_after_s: 600 } }).success).toBe(true);
    expect(bridgeErrorResponseSchema.safeParse({ error: { code: "made_up", message: "x" } }).success).toBe(false);
    expect(bridgeErrorResponseSchema.safeParse({ error: { code: "internal", message: "x", stack: "..." } }).success).toBe(false);
    expect(bridgeErrorResponseSchema.safeParse({ error: { code: "internal", message: "x".repeat(501) } }).success).toBe(false);
    expect(BRIDGE_EXTRA_ERROR_CODES.length).toBeGreaterThan(10);
  });
});

describe("bridge/contract: tokens and codes", () => {
  it("accepts well-formed tokens and nothing else, and the scan pattern finds a leaked one", () => {
    const body = "A".repeat(43);
    expect(uiTokenSchema.safeParse(`cku_${body}`).success).toBe(true);
    expect(uiTokenSchema.safeParse(`cka_${body}`).success).toBe(false);
    expect(agentTokenSchema.safeParse(`cka_${body}`).success).toBe(true);
    expect(agentTokenSchema.safeParse(`cka_${body.slice(1)}`).success).toBe(false);
    expect(TOKEN_SCAN_PATTERN.test(`log line with cku_${body} inside`)).toBe(true);
    expect(TOKEN_SCAN_PATTERN.test("a normal line about cku")).toBe(false);
  });

  it("arm codes avoid look-alike characters and arming is capped at ten minutes", () => {
    expect(ARM_CODE_PATTERN.test("K7MPQ2XZ")).toBe(true);
    for (const bad of ["K7MPQ2X0", "K7MPQ2XO", "K7MPQ2XI", "K7MPQ2X1", "k7mpq2xz", "K7MPQ2X"]) expect(ARM_CODE_PATTERN.test(bad), bad).toBe(false);
    expect(armConfirmRequestSchema.safeParse({ code: "K7MPQ2XZ" }).success).toBe(true);
    expect(armRequestSchema.safeParse({ minutes: 10 }).success).toBe(true);
    expect(armRequestSchema.safeParse({ minutes: 11 }).success).toBe(false);
    expect(armRequestSchema.safeParse({ minutes: 0 }).success).toBe(false);
    expect(armRequestSchema.safeParse({ minutes: 5.5 }).success).toBe(false);
  });
});

describe("bridge/contract: read proxy", () => {
  it("builds and parses a proxy target", () => {
    const target = readProxyPath("polymarket_gamma", "/markets", "limit=5&closed=false");
    expect(target).toBe("/ui/read/polymarket_gamma/markets?limit=5&closed=false");
    expect(parseReadProxyTarget(target)).toEqual({ service: "polymarket_gamma", path: "/markets", query: "limit=5&closed=false" });
    // A JSON-RPC node is called at the bare root; a service with no path at all is not a target.
    expect(parseReadProxyTarget("/ui/read/rpc_base/")).toEqual({ service: "rpc_base", path: "/", query: "" });
    expect(parseReadProxyTarget("/ui/read/rpc_base")).toBeUndefined();
    expect(parseReadProxyTarget("/ui/read/xo_orderbook/book?token_id=7")?.service).toBe("xo_orderbook");
    expect(READ_PROXY_PREFIX).toBe("/ui/read/");
  });

  it("knows every read service of headers.config.ts and no other", () => {
    for (const service of READ_SERVICES) expect(parseReadProxyTarget(`/ui/read/${service}/x`)?.service).toBe(service);
    expect(parseReadProxyTarget("/ui/read/not_a_service/x")).toBeUndefined();
    expect(parseReadProxyTarget("/ui/read/api.paybox.sh/mcp")).toBeUndefined();
  });

  it("refuses unsafe upstream paths and queries", () => {
    const bad = ["", "markets", "//evil.example/x", "/a//b", "/../etc/passwd", "/a/./b", "/a/%2e%2e/b", "/a/%2E%2E/b", "/a%2fb", "/a%5cb", "/a\\b", "/a%00b", "/a b", "/a?x=1", "/a#frag", "http://evil.example/", `/${"a".repeat(300)}`, "/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17"];
    for (const path of bad) {
      expect(isSafeUpstreamPath(path), path).toBe(false);
    }
    for (const path of ["/", "/api/markets", "/accounts/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "/v2/positions", "/book/", "/a:b@c"]) expect(isSafeUpstreamPath(path), path).toBe(true);
    expect(() => readProxyPath("manifold", "/../x")).toThrow();
    expect(() => readProxyPath("manifold", "/x", "a=1 2")).toThrow();
    expect(isSafeUpstreamQuery("statuses=ACTIVE&marketType=2,4")).toBe(true);
    expect(isSafeUpstreamQuery("a=%0d%0aSet-Cookie:x")).toBe(true);
    expect(isSafeUpstreamQuery("a=\r\nX: y")).toBe(false);
    expect(isSafeUpstreamQuery("a=<script>")).toBe(false);
  });

  it("lists only read-only JSON-RPC methods", () => {
    for (const method of JSON_RPC_READ_METHODS) expect(method).toMatch(/^(?:eth_(?:get|call|block|chain)|net_version)/);
    for (const forbidden of ["eth_sendTransaction", "eth_sendRawTransaction", "eth_sendUserOperation", "eth_sign", "personal_sign", "eth_signTypedData_v4", "debug_traceTransaction", "eth_accounts", "eth_requestAccounts"]) {
      expect((JSON_RPC_READ_METHODS as readonly string[]).includes(forbidden), forbidden).toBe(false);
    }
  });

  it("validates the response envelope strictly", () => {
    const ok = { service: "xo_data", upstream_status: 429, fetched_at: "2026-10-19T12:00:00Z", fetched_at_ms: 1_792_411_200_000, bytes: 42, retry_after_s: 3, body: { statusCode: 429 } };
    expect(readProxyResponseSchema.safeParse(ok).success).toBe(true);
    expect(readProxyResponseSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(readProxyResponseSchema.safeParse({ ...ok, upstream_status: 99 }).success).toBe(false);
    expect(readProxyResponseSchema.safeParse({ ...ok, bytes: 9 * 1024 * 1024 }).success).toBe(false);
  });
});

describe("bridge/contract: prepare", () => {
  it("reuses the relay's own schemas for the prepare routes", () => {
    expect(PREPARE_ROUTES["/ui/prepare/order"].request).toBe(POST_ROUTES["/v1/order/prepare"].request);
    expect(PREPARE_ROUTES["/ui/prepare/order"].response).toBe(POST_ROUTES["/v1/order/prepare"].response);
    expect(PREPARE_ROUTES["/ui/prepare/auth"].response).toBe(POST_ROUTES["/v1/auth/prepare"].response);
    expect(PREPARE_ROUTES["/ui/prepare/userop"].response).toBe(POST_ROUTES["/v1/userop/prepare"].response);
  });

  it("limits the page to its four user-operation actions (no withdraw, no creation family)", () => {
    const actions = pageUseropPrepareRequestSchema.options.map((option) => option.shape.action.value);
    expect(actions).toEqual([...PAGE_PREPARE_USEROP_ACTIONS]);
    expect(pageUseropPrepareRequestSchema.safeParse({ owner: OWNER, action: "redeem", params: { condition_ids: [`0x${"11".repeat(32)}`] } }).success).toBe(true);
    expect(pageUseropPrepareRequestSchema.safeParse({ owner: OWNER, action: "deploy_enable_trading" }).success).toBe(true);
    for (const action of ["withdraw", "create_market", "respond_update", "cancel_market"]) {
      expect(pageUseropPrepareRequestSchema.safeParse({ owner: OWNER, action, params: {} }).success, action).toBe(false);
    }
    expect(pageUseropPrepareRequestSchema.safeParse({ owner: OWNER, action: "withdraw", params: { amount_usd: "1" } }).success).toBe(false);
  });
});

describe("bridge/contract: inbox", () => {
  it("parses a stored item and rejects a mismatched, extended or tampered one", () => {
    expect(inboxItemSchema.safeParse(inboxItem()).success).toBe(true);
    expect(inboxItemSchema.safeParse(inboxItem({ prepared_id: "ffffffffffffffffffffffffffffffff" })).success).toBe(false);
    expect(inboxItemSchema.safeParse(inboxItem({ extra: true })).success).toBe(false);
    expect(inboxItemSchema.safeParse(inboxItem({ state: "signing" })).success).toBe(false);
    expect(inboxItemSchema.safeParse(inboxItem({ requested_by: "agent:not-hex" })).success).toBe(false);
    // The relay's own checks still bite: a summary tag that is not the digest's tag.
    const tampered = preparedUserOp({ summary: { lines: ["x"], digest_tag: "0000000000000000" } });
    expect(inboxItemSchema.safeParse(inboxItem({ prepared: tampered })).success).toBe(false);
  });

  it("encodes the status machine: ambiguous is terminal and nothing leaves a final state", () => {
    expect(Object.keys(INBOX_TRANSITIONS).sort()).toEqual([...INBOX_STATES].sort());
    expect(canTransition("prepared", "shown")).toBe(true);
    expect(canTransition("shown", "signed")).toBe(true);
    expect(canTransition("submitted", "ambiguous")).toBe(true);
    expect(canTransition("prepared", "submitted")).toBe(false);
    for (const final of ["accepted", "rejected", "expired", "ambiguous"] as const) {
      for (const state of INBOX_STATES) expect(canTransition(final, state), `${final} -> ${state}`).toBe(false);
    }
    for (const state of ["prepared", "shown", "signed", "submitted"] as const) expect(canTransition(state, "expired")).toBe(true);
  });

  it("parses the card decision the page reports", () => {
    const shown = { decision: "shown", prepared_id: "0123456789abcdef0123456789abcdef", digest_tag: "ab12ab12ab12ab12", inner_hash_tag: null, verification: "viewer_only", failed_checks: [] };
    expect(inboxDecisionRequestSchema.safeParse(shown).success).toBe(true);
    expect(inboxDecisionRequestSchema.safeParse({ ...shown, verification: "independently verified" }).success).toBe(false);
    expect(inboxDecisionRequestSchema.safeParse({ decision: "reject", prepared_id: shown.prepared_id }).success).toBe(true);
    expect(inboxDecisionRequestSchema.safeParse({ decision: "sign", prepared_id: shown.prepared_id }).success).toBe(false);
  });

  it("has no route that takes a signature from the page", () => {
    for (const key of UI_ROUTE_KEYS) expect(key, key).not.toMatch(/submit|signature/);
    const allRequests = JSON.stringify(Object.keys(inboxDecisionRequestSchema.options[0].shape));
    expect(allRequests).not.toMatch(/signature/);
  });
});

describe("bridge/contract: routes and events", () => {
  it("pins the route table so adding a route is a visible change", () => {
    expect([...UI_ROUTE_KEYS].sort()).toEqual(
      [
        "GET /ui/events",
        "GET /ui/inbox",
        "GET /ui/inbox/:prepared_id",
        "GET /ui/order/:hash",
        "GET /ui/read/*",
        "GET /ui/status",
        "GET /ui/userop/:hash",
        "POST /ui/account/status",
        "POST /ui/arm",
        "POST /ui/arm/confirm",
        "POST /ui/disarm",
        "POST /ui/funding/check",
        "POST /ui/inbox/decision",
        "POST /ui/inbox/sign",
        "POST /ui/kill",
        "POST /ui/orders/list",
        "POST /ui/pair",
        "POST /ui/prepare/auth",
        "POST /ui/prepare/order",
        "POST /ui/prepare/userop",
        "POST /ui/read/*",
        "POST /ui/tool",
      ].sort(),
    );
  });

  it("matches GET routes with parameters and builds their paths", () => {
    const hash = `0x${"cd".repeat(32)}`;
    expect(matchUiGetRoute(orderStatusUiPath(hash))).toEqual({ route: "/ui/order/:hash", params: { hash } });
    expect(matchUiGetRoute(userOpStatusUiPath(hash.toUpperCase().replace("0X", "0x")))?.route).toBe("/ui/userop/:hash");
    expect(matchUiGetRoute(inboxItemUiPath("0123456789abcdef0123456789abcdef"))?.route).toBe("/ui/inbox/:prepared_id");
    expect(matchUiGetRoute("/ui/status")?.route).toBe("/ui/status");
    expect(matchUiGetRoute("/ui/nope")).toBeUndefined();
    expect(matchUiGetRoute("/ui/order/")).toBeUndefined();
    expect(() => orderStatusUiPath("0x12")).toThrow();
  });

  it("accepts each event type and rejects an unknown one", () => {
    const at = "2026-10-19T12:00:00Z";
    expect(uiEventSchema.safeParse({ id: 1, at, type: "heartbeat" }).success).toBe(true);
    expect(uiEventSchema.safeParse({ id: 2, at, type: "posture", posture: "ARMED", armed_until: "2026-10-19T12:10:00Z" }).success).toBe(true);
    expect(uiEventSchema.safeParse({ id: 3, at, type: "prepared", item: inboxItem() }).success).toBe(true);
    expect(uiEventSchema.safeParse({ id: 4, at, type: "prepared_state", prepared_id: "0123456789abcdef0123456789abcdef", state: "accepted", result: null }).success).toBe(true);
    expect(uiEventSchema.safeParse({ id: 5, at, type: "audit", entry: { seq: 1, at, type: "ui.kill", actor: "ui", summary: "kill engaged", hash: DIGEST } }).success).toBe(true);
    expect(uiEventSchema.safeParse({ id: 6, at, type: "audit", entry: { seq: 1, at, type: "ui.unknown", actor: "ui", summary: "x", hash: DIGEST } }).success).toBe(false);
    expect(uiEventSchema.safeParse({ id: 7, at, type: "script", body: "alert(1)" }).success).toBe(false);
  });

  it("requires ok and error to agree in a tool result, and shows flags, never sets them", () => {
    const base = { tool: "xo_search", tool_class: "read", duration_ms: 12, structured: { n: 1 }, text: "1 result" };
    expect(toolCallResponseSchema.safeParse({ ...base, ok: true, error: null }).success).toBe(true);
    expect(toolCallResponseSchema.safeParse({ ...base, ok: true, error: { code: "internal", message: "x" } }).success).toBe(false);
    expect(toolCallResponseSchema.safeParse({ ...base, ok: false, error: null }).success).toBe(false);
    expect(toolCallResponseSchema.safeParse({ ...base, tool: "Xo Search", ok: true, error: null }).success).toBe(false);
    const statusKeys = Object.keys(statusResponseSchema.shape);
    expect(statusKeys).toContain("flags");
    for (const forbidden of ["set_flags", "caps_set", "data_dir", "secret", "token_value"]) expect(statusKeys).not.toContain(forbidden);
  });
});
