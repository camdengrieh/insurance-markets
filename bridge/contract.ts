import * as z from "zod/v4";

import { READ_SERVICES } from "../app/headers.config.js";
import { ERROR_CODES, ERROR_HTTP_STATUS, type ErrorCode } from "../src/relay/errors.js";
import {
  GET_ROUTES,
  POST_ROUTES,
  RELAY_USER_AGENT,
  capabilitiesSchema,
  flagsSnapshotSchema,
  hex32Schema,
  isoSecondSchema,
  orderHashSchema,
  preparedIdSchema,
  tripwiresSchema,
  upstreamHealthSchema,
  userOpHashSchema,
} from "../src/relay/contract.js";

// The Cockpit-wide wire contract: what the browser page, the local daemon (bridge/) and the daemon's tests
// say to each other (docs/dapp-design.md sections 1.3, 3, 5.4, 5.5 and 7.4). It is frozen in W0: a change
// here is a change to every stream, so it goes through the owner of this file.
//
// PORTABLE: no node:* import and no Node-only global. The page bundles this file; the daemon imports it.
// It reuses the relay contract (src/relay/contract.ts) for everything the relay already defines (Prepared,
// amounts, flags, capabilities) so there is one definition of each. The only non-shared import is the
// closed list of read services from app/headers.config.ts, which is also the single source of the CSPs.
//
// Transport rules every handler and client follows:
//   - the daemon binds 127.0.0.1 only and answers 403 host_forbidden for any Host header other than
//     127.0.0.1:<port>, and 403 origin_forbidden for any browser Origin other than its own;
//   - every route except the static files needs `Authorization: Bearer <token>`; no cookies, ever;
//   - request bodies are JSON with `Content-Type: application/json`, at most MAX_REQUEST_BODY_BYTES;
//   - the page reads the event stream with fetch and a ReadableStream, not EventSource, because
//     EventSource cannot send an Authorization header;
//   - responses are JSON. An error is always { error: { code, message, details? } } with a code from
//     BRIDGE_ERROR_CODES. The code, never the message text, is what clients compare.

export const BRIDGE_CONTRACT_VERSION = 1;

// The only User-Agent the daemon sends to a venue. Fixed text: no person, machine or account identifier.
export const BRIDGE_USER_AGENT = RELAY_USER_AGENT;

// ---- limits -----------------------------------------------------------------------------------------------

export const MAX_REQUEST_BODY_BYTES = 256 * 1024;
// Pascal's market list alone is about 5.9 MB, so the response cap is above that and below "swallow anything".
export const MAX_PROXY_RESPONSE_BYTES = 8 * 1024 * 1024;
export const PROXY_TIMEOUT_MS = 15_000;
// R9: three 429s or any 403 from a venue pause that venue for ten minutes. One rule for the page, the daemon and the
// API: sdk/venues/state.ts.
export { VENUE_PAUSE_AFTER_429, VENUE_PAUSE_MS } from "../sdk/venues/state.js";
export const PAIR_CODE_TTL_S = 120;
export const ARM_MAX_MINUTES = 10;
export const ARM_CODE_TTL_S = 120;
export const SSE_HEARTBEAT_MS = 15_000;
export const INBOX_MAX_ITEMS = 200;
export const TOOL_TEXT_MAX_CHARS = 20_000;

// ---- tokens, scopes, tool classes, posture ---------------------------------------------------------------------

// Two bearer-token kinds. `ui` is held by the page (sessionStorage) and never carries submit power.
// `agent` is persistent, stored hashed by the daemon, and its ceiling scope is chosen at daemon start.
export const TOKEN_KINDS = ["ui", "agent"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

// Scopes are ceilings. `submit` from any token additionally needs an open ARM window.
export const TOKEN_SCOPES = ["read", "prepare", "submit"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

// Every registered tool maps to exactly one class (R7). `admin` is never reachable with a token.
export const TOOL_CLASSES = ["read", "prepare", "submit", "admin"] as const;
export type ToolClass = (typeof TOOL_CLASSES)[number];

// Fixed shapes so a log scanner can find a leaked secret: ckU_ / ckA_ prefixes plus 43 base64url characters
// (256 bits). The pairing code and the ARM code are short-lived and single use.
export const UI_TOKEN_PATTERN = /^cku_[A-Za-z0-9_-]{43}$/;
export const AGENT_TOKEN_PATTERN = /^cka_[A-Za-z0-9_-]{43}$/;
export const TOKEN_SCAN_PATTERN = /\bck[ua]_[A-Za-z0-9_-]{20,}\b/;
export const uiTokenSchema = z.string().regex(UI_TOKEN_PATTERN, "ui bearer token");
export const agentTokenSchema = z.string().regex(AGENT_TOKEN_PATTERN, "agent bearer token");
export const bearerTokenSchema = z.union([uiTokenSchema, agentTokenSchema]);
// 128-bit pairing secret in the URL fragment (#pair=<code>): never sent in an HTTP request line.
export const pairCodeSchema = z.string().regex(/^[0-9a-f]{32}$/, "128-bit pairing code");
// Typed by the user from stderr. No 0, 1, I, O, so it survives being read aloud.
export const ARM_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;
export const armCodeSchema = z.string().regex(ARM_CODE_PATTERN, "8-character arm code");

export const POSTURES = ["OBSERVE", "PREPARE", "ARMED", "KILLED"] as const;
export const postureSchema = z.enum(POSTURES);
export type Posture = z.infer<typeof postureSchema>;

// ---- errors -------------------------------------------------------------------------------------------------------------

// The relay's stable codes plus the transport and proxy codes the daemon needs. A code never changes
// meaning once listed.
export const BRIDGE_EXTRA_ERROR_CODES = [
  "host_forbidden", // Host header is not exactly 127.0.0.1:<port> (DNS rebinding)
  "origin_forbidden", // Origin is present and is not the daemon's own origin
  "scope_denied", // the token's scope or tool class does not allow this route or tool
  "not_armed", // a submit-class call without an open ARM window
  "pairing_invalid", // wrong, reused or malformed pairing or arm code
  "pairing_expired", // the pairing or arm code is out of time
  "unsupported_media_type", // a POST without application/json
  "body_too_large", // request body over MAX_REQUEST_BODY_BYTES
  "service_not_allowed", // read proxy: service id is not in READ_SERVICES, or disabled
  "path_not_allowed", // read proxy: upstream path is not on the service's allowlist
  "method_not_allowed", // read proxy: method not allowed for that service and path
  "rpc_method_not_allowed", // read proxy: JSON-RPC method or Hyperliquid info type is not read-only
  "venue_disabled", // restricted-terms venue is OFF (default) or its disclosure was not accepted
  "venue_paused", // R9 pause after repeated 429 or any 403
  "redirect_refused", // the upstream answered with a redirect
  "response_too_large", // upstream body over MAX_PROXY_RESPONSE_BYTES
  "upstream_not_json", // upstream answered with a body that is not JSON
  "upstream_timeout", // upstream did not answer within PROXY_TIMEOUT_MS
  "data_dir_locked", // another process owns the data directory; this instance serves reads only
] as const;

export const BRIDGE_ERROR_CODES = [...ERROR_CODES, ...BRIDGE_EXTRA_ERROR_CODES] as const;
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];
export const bridgeErrorCodeSchema = z.enum(BRIDGE_ERROR_CODES);

export const BRIDGE_ERROR_HTTP_STATUS: Readonly<Record<BridgeErrorCode, number>> = Object.freeze({
  ...ERROR_HTTP_STATUS,
  host_forbidden: 403,
  origin_forbidden: 403,
  scope_denied: 403,
  not_armed: 403,
  pairing_invalid: 401,
  pairing_expired: 410,
  unsupported_media_type: 415,
  body_too_large: 413,
  service_not_allowed: 403,
  path_not_allowed: 403,
  method_not_allowed: 405,
  rpc_method_not_allowed: 403,
  venue_disabled: 403,
  venue_paused: 503,
  redirect_refused: 502,
  response_too_large: 502,
  upstream_not_json: 502,
  upstream_timeout: 504,
  data_dir_locked: 409,
});

export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return typeof value === "string" && (BRIDGE_ERROR_CODES as readonly string[]).includes(value);
}

export function isRelayErrorCode(value: BridgeErrorCode): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

const errorDetailsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
);

export const bridgeErrorBodySchema = z
  .object({
    code: bridgeErrorCodeSchema,
    // Fixed daemon text or a sanitised upstream code. Never an upstream body, a token, a key or a path on disk.
    message: z.string().max(500),
    details: errorDetailsSchema.optional(),
    retry_after_s: z.number().int().min(0).max(86_400).optional(),
  })
  .strict();
export const bridgeErrorResponseSchema = z.object({ error: bridgeErrorBodySchema }).strict();
export type BridgeErrorResponse = z.infer<typeof bridgeErrorResponseSchema>;

// ---- read proxy -----------------------------------------------------------------------------------------------------------

// GET  /ui/read/{service}/{upstream path}?{upstream query}
// POST /ui/read/{service}/{upstream path}   with the upstream JSON body (JSON-RPC 2.0, Hyperliquid /info)
//
// The daemon decides the origin from `service` (bridge/allowlist.ts), never from the caller. It follows no
// redirect, sends BRIDGE_USER_AGENT and no Origin, strips cookies, caps size and time, and answers with the
// envelope below for every upstream HTTP status whose body is JSON. A transport failure is a BridgeError.
export const readServiceSchema = z.enum(READ_SERVICES);
export type ReadService = z.infer<typeof readServiceSchema>;

export const READ_PROXY_PREFIX = "/ui/read/";
export const READ_METHODS = ["GET", "POST"] as const;
export const readMethodSchema = z.enum(READ_METHODS);

// JSON-RPC methods the read proxy may forward to an EVM node. Reads only: nothing that sends, signs or
// changes node state. bridge/allowlist.ts must use this list, not its own copy.
export const JSON_RPC_READ_METHODS = [
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "net_version",
] as const;

const PATH_SEGMENT = /^(?:[A-Za-z0-9._~!$'()*+,;=:@-]|%(?!2[eEfF]|5[cC]|00)[0-9A-Fa-f]{2}){1,256}$/;

// A safe upstream path: absolute, no empty or dot segments, no encoded slash, dot or backslash, no query,
// fragment, userinfo, scheme or control character. The daemon applies its own allowlist on top.
export function isSafeUpstreamPath(path: string): boolean {
  if (path.length === 0 || path.length > 1024 || !path.startsWith("/")) return false;
  const segments = path.slice(1).split("/");
  if (segments.length > 16) return false;
  return segments.every((segment, index) => {
    // Only a trailing slash (or the bare root "/") may be empty.
    if (segment === "") return index === segments.length - 1;
    if (segment === "." || segment === "..") return false;
    return PATH_SEGMENT.test(segment);
  });
}

const QUERY_PATTERN = /^(?:[A-Za-z0-9._~!$'()*+,;=:@/-]|%[0-9A-Fa-f]{2}|&){0,2048}$/;
export function isSafeUpstreamQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

export const upstreamPathSchema = z.string().refine(isSafeUpstreamPath, "unsafe upstream path");
export const upstreamQuerySchema = z.string().refine(isSafeUpstreamQuery, "unsafe upstream query");

// The page-side builder. It throws on anything unsafe so a malformed call never leaves the page.
export function readProxyPath(service: ReadService, upstreamPath: string, query?: string): string {
  readServiceSchema.parse(service);
  if (!isSafeUpstreamPath(upstreamPath)) throw new Error("unsafe upstream path");
  const q = query === undefined || query === "" ? "" : `?${upstreamQuerySchema.parse(query)}`;
  return `${READ_PROXY_PREFIX}${service}${upstreamPath}${q}`;
}

export interface ParsedReadProxyPath {
  readonly service: ReadService;
  readonly path: string;
  readonly query: string;
}

// The daemon-side parser: splits a request target (path plus query) into its parts, or says why not.
export function parseReadProxyTarget(target: string): ParsedReadProxyPath | undefined {
  if (!target.startsWith(READ_PROXY_PREFIX)) return undefined;
  const queryAt = target.indexOf("?");
  const pathPart = queryAt === -1 ? target : target.slice(0, queryAt);
  const query = queryAt === -1 ? "" : target.slice(queryAt + 1);
  const rest = pathPart.slice(READ_PROXY_PREFIX.length - 1);
  const slash = rest.indexOf("/", 1);
  if (slash === -1) return undefined;
  const service = readServiceSchema.safeParse(rest.slice(1, slash));
  const path = rest.slice(slash);
  if (!service.success || !isSafeUpstreamPath(path) || !isSafeUpstreamQuery(query)) return undefined;
  return { service: service.data, path, query };
}

export const readProxyResponseSchema = z
  .object({
    service: readServiceSchema,
    // The upstream HTTP status, passed through (429 is data for the adapter, not a daemon error).
    upstream_status: z.number().int().min(100).max(599),
    fetched_at: isoSecondSchema,
    fetched_at_ms: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative().max(MAX_PROXY_RESPONSE_BYTES),
    retry_after_s: z.number().int().min(0).max(86_400).nullable(),
    // Parsed JSON, hostile by default. Adapters validate it with strict schemas and brand text as Untrusted.
    body: z.json(),
  })
  .strict();
export type ReadProxyResponse = z.infer<typeof readProxyResponseSchema>;

// ---- prepare ------------------------------------------------------------------------------------------------------------------

// The page prepares through these routes (ui token, scope prepare). Each is the relay route of the same
// name with the same request and response schema, so a Prepared the page shows is the relay's Prepared.
//
// The page's user-operation actions are the four it has a screen for. withdraw, funding and the whole
// market-creation family (create_market, respond_update, cancel_market) are not prepared from the page:
// the creation UI is not shipped (O5), and the rest are reachable only through the agent's tools.
export const PAGE_PREPARE_USEROP_ACTIONS = ["deploy_enable_trading", "enable_trading", "revoke_trading", "redeem"] as const;

const relayUseropRequest = POST_ROUTES["/v1/userop/prepare"].request;
const [deployOption, enableOption, revokeOption, redeemOption] = relayUseropRequest.options;
export const pageUseropPrepareRequestSchema = z.discriminatedUnion("action", [
  deployOption,
  enableOption,
  revokeOption,
  redeemOption,
]);

export const PREPARE_ROUTES = {
  "/ui/prepare/userop": {
    request: pageUseropPrepareRequestSchema,
    response: POST_ROUTES["/v1/userop/prepare"].response,
  },
  "/ui/prepare/order": {
    request: POST_ROUTES["/v1/order/prepare"].request,
    response: POST_ROUTES["/v1/order/prepare"].response,
  },
  "/ui/prepare/auth": {
    request: POST_ROUTES["/v1/auth/prepare"].request,
    response: POST_ROUTES["/v1/auth/prepare"].response,
  },
} as const;
export type PreparePath = keyof typeof PREPARE_ROUTES;

// Read-only mirrors of relay routes the screens need (scope read). The page never calls a relay submit.
export const RELAY_READ_ROUTES = {
  "/ui/account/status": {
    request: POST_ROUTES["/v1/account/status"].request,
    response: POST_ROUTES["/v1/account/status"].response,
  },
  "/ui/orders/list": {
    request: POST_ROUTES["/v1/orders/list"].request,
    response: POST_ROUTES["/v1/orders/list"].response,
  },
  "/ui/funding/check": {
    request: POST_ROUTES["/v1/funding/check"].request,
    response: POST_ROUTES["/v1/funding/check"].response,
  },
} as const;
export type RelayReadPath = keyof typeof RELAY_READ_ROUTES;

// ---- inbox ---------------------------------------------------------------------------------------------------------------------------

// The signing inbox lists every prepared item the daemon holds, whoever asked for it.
export const INBOX_STATES = [
  "prepared",
  "shown",
  "signed",
  "submitted",
  "accepted",
  "rejected",
  "expired",
  "ambiguous",
] as const;
export const inboxStateSchema = z.enum(INBOX_STATES);
export type InboxState = z.infer<typeof inboxStateSchema>;

// Allowed moves of the status machine. `ambiguous` is terminal for the UI: the answer is reconcile by hash,
// never resend. Every non-terminal state can expire.
export const INBOX_TRANSITIONS: Readonly<Record<InboxState, readonly InboxState[]>> = Object.freeze({
  prepared: ["shown", "rejected", "expired"],
  shown: ["signed", "rejected", "expired"],
  signed: ["submitted", "rejected", "expired"],
  submitted: ["accepted", "rejected", "ambiguous", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
  ambiguous: [],
});

export function canTransition(from: InboxState, to: InboxState): boolean {
  return INBOX_TRANSITIONS[from].includes(to);
}

export const requestedBySchema = z.union([
  z.literal("ui"),
  z.literal("terminal"),
  z.string().regex(/^agent:[0-9a-f]{8}$/, "agent:<8 hex of the token id>"),
]);

// Any relay Prepared, strictly validated against the relay's own schemas: the page runs the card checks
// on exactly what the relay stores.
export const inboxPreparedSchema = z.union([
  POST_ROUTES["/v1/userop/prepare"].response,
  POST_ROUTES["/v1/order/prepare"].response,
  POST_ROUTES["/v1/auth/prepare"].response,
  // The CLOB venues besides XO (Polymarket, Limitless): an EOA order with its quote, and the Polymarket login.
  POST_ROUTES["/v1/clob/order/prepare"].response,
  POST_ROUTES["/v1/clob/auth/prepare"].response,
]);

export const inboxResultSchema = z
  .object({
    user_op_hash: userOpHashSchema.optional(),
    order_hash: orderHashSchema.optional(),
    tx_hash: hex32Schema.optional(),
    detail: z.string().max(300).optional(),
  })
  .strict();

export const inboxItemSchema = z
  .object({
    prepared_id: preparedIdSchema,
    state: inboxStateSchema,
    requested_by: requestedBySchema,
    created_at: isoSecondSchema,
    updated_at: isoSecondSchema,
    expires_at: isoSecondSchema,
    prepared: inboxPreparedSchema,
    result: inboxResultSchema.nullable(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.prepared.prepared_id !== item.prepared_id) {
      ctx.addIssue({ code: "custom", message: "prepared_id differs from the stored item", path: ["prepared", "prepared_id"] });
    }
  });
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const inboxListResponseSchema = z
  .object({
    items: z.array(inboxItemSchema).max(INBOX_MAX_ITEMS),
    // The id of the latest event the list reflects; the page resumes the stream from here.
    event_id: z.number().int().nonnegative(),
  })
  .strict();

const inboxIdParamsSchema = z.object({ prepared_id: preparedIdSchema }).strict();
export const INBOX_GET_ROUTES = {
  "/ui/inbox": { params: z.object({}).strict(), response: inboxListResponseSchema },
  "/ui/inbox/:prepared_id": { params: inboxIdParamsSchema, response: inboxItemSchema },
} as const;

// What the page tells the daemon about the card (audit events ui.card.shown and ui.card.decision). The
// daemon records it but never trusts it: its own checks are the authority.
export const CARD_VERIFICATIONS = ["verified", "viewer_only", "failed"] as const;
export const inboxDecisionRequestSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("shown"),
      prepared_id: preparedIdSchema,
      digest_tag: z.string().regex(/^[0-9a-f]{16}$/),
      // R2: first 16 hex of the Kernel message hash for typedData intents; null until R2 lands.
      inner_hash_tag: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
      verification: z.enum(CARD_VERIFICATIONS),
      failed_checks: z.array(z.string().min(1).max(120)).max(16),
    })
    .strict(),
  z.object({ decision: z.literal("reject"), prepared_id: preparedIdSchema }).strict(),
]);

// Path S2 only (flag OFF): ask the daemon to sign through its own PayBox client. The signature never
// reaches the page; submit still needs an open ARM window.
export const inboxSignRequestSchema = z.object({ prepared_id: preparedIdSchema }).strict();
export const inboxSignResponseSchema = z
  .object({
    prepared_id: preparedIdSchema,
    state: inboxStateSchema,
    detail: z.string().max(300).optional(),
  })
  .strict();

// ---- events (server-sent) ---------------------------------------------------------------------------------------------------------------

export const AUDIT_EVENT_TYPES = [
  "ui.pair",
  "ui.arm",
  "ui.disarm",
  "ui.kill",
  "ui.command",
  "ui.card.shown",
  "ui.card.decision",
  "signer.request",
  "signer.result",
  "agent.call",
  "feed.mismatch",
  "schema.violation",
] as const;
export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);

export const auditFeedEntrySchema = z
  .object({
    seq: z.number().int().nonnegative(),
    at: isoSecondSchema,
    type: auditEventTypeSchema,
    actor: z.union([z.literal("system"), requestedBySchema]),
    // Fixed daemon wording; never market text, a token, a signature or a key.
    summary: z.string().max(300),
    // SHA-256 hash chain: this entry's hash. The status bar shows the head.
    hash: hex32Schema,
  })
  .strict();
export type AuditFeedEntry = z.infer<typeof auditFeedEntrySchema>;

// ---- status and session ------------------------------------------------------------------------------------------------------------------

export const venueSwitchSchema = z
  .object({
    enabled: z.boolean(),
    // Why it is off: a restricted-terms venue ships OFF; a paused venue says until when.
    reason: z.enum(["default_off", "disclosure_not_accepted", "paused", "operator", "none"]),
    paused_until: isoSecondSchema.nullable(),
  })
  .strict();

export const statusResponseSchema = z
  .object({
    contract_version: z.literal(BRIDGE_CONTRACT_VERSION),
    version: z.string().min(1).max(32),
    time: isoSecondSchema,
    posture: postureSchema,
    armed_until: isoSecondSchema.nullable(),
    kill: z.boolean(),
    // "writer" owns the data directory; "read_only" lost the lock and serves reads only.
    instance: z.enum(["writer", "read_only"]),
    // Flags are shown, never set. Nothing on the wire changes a flag, a cap or the data directory.
    flags: flagsSnapshotSchema,
    tripwires: tripwiresSchema,
    upstream: upstreamHealthSchema,
    capabilities: capabilitiesSchema,
    venues: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), venueSwitchSchema),
    audit_head: hex32Schema.nullable(),
    token: z.object({ kind: z.enum(TOKEN_KINDS), scopes: z.array(z.enum(TOKEN_SCOPES)).max(3) }).strict(),
  })
  .strict();
export type StatusResponse = z.infer<typeof statusResponseSchema>;

export const pairRequestSchema = z.object({ code: pairCodeSchema }).strict();
export const pairResponseSchema = z
  .object({
    token: uiTokenSchema,
    kind: z.literal("ui"),
    scopes: z.array(z.enum(["read", "prepare"])).max(2),
  })
  .strict();

export const armRequestSchema = z.object({ minutes: z.number().int().min(1).max(ARM_MAX_MINUTES) }).strict();
// The daemon prints the code on stderr only; the response says a code was issued and until when it is valid.
export const armResponseSchema = z
  .object({ state: z.literal("code_printed"), code_expires_at: isoSecondSchema })
  .strict();
export const armConfirmRequestSchema = z.object({ code: armCodeSchema }).strict();
export const armConfirmResponseSchema = z.object({ armed_until: isoSecondSchema }).strict();
export const emptyRequestSchema = z.object({}).strict();
export const disarmResponseSchema = z.object({ posture: postureSchema }).strict();
export const killResponseSchema = z.object({ kill: z.literal(true), posture: z.literal("KILLED") }).strict();

// ---- tool calls (terminal) -----------------------------------------------------------------------------------------------------------

// POST /ui/tool: one parsed command becomes one registered tool call. The tool must exist in the daemon's
// class table, and the token's scope must cover its class; otherwise scope_denied.
export const toolNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "snake_case tool name");
export const toolCallRequestSchema = z
  .object({ tool: toolNameSchema, args: z.record(z.string().min(1).max(64), z.json()) })
  .strict();
export const toolCallResponseSchema = z
  .object({
    tool: toolNameSchema,
    tool_class: z.enum(TOOL_CLASSES),
    ok: z.boolean(),
    duration_ms: z.number().int().nonnegative(),
    // The tool's structuredContent, validated by the page against that tool's output schema.
    structured: z.json().nullable(),
    // Capped text block; the page renders structured and shows this only collapsed, as plain text.
    text: z.string().max(TOOL_TEXT_MAX_CHARS).nullable(),
    error: bridgeErrorBodySchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.ok === (value.error !== null)) {
      ctx.addIssue({ code: "custom", message: "ok and error disagree", path: ["error"] });
    }
  });

// ---- the event stream ------------------------------------------------------------------------------------------------------------------------

// GET /ui/events (text/event-stream). Each event has a monotonic `id` (resume with Last-Event-ID) and one
// JSON `data` line matching this union.
export const uiEventSchema = z.discriminatedUnion("type", [
  z.object({ id: z.number().int().nonnegative(), at: isoSecondSchema, type: z.literal("status"), status: statusResponseSchema }).strict(),
  z
    .object({
      id: z.number().int().nonnegative(),
      at: isoSecondSchema,
      type: z.literal("posture"),
      posture: postureSchema,
      armed_until: isoSecondSchema.nullable(),
    })
    .strict(),
  z.object({ id: z.number().int().nonnegative(), at: isoSecondSchema, type: z.literal("prepared"), item: inboxItemSchema }).strict(),
  z
    .object({
      id: z.number().int().nonnegative(),
      at: isoSecondSchema,
      type: z.literal("prepared_state"),
      prepared_id: preparedIdSchema,
      state: inboxStateSchema,
      result: inboxResultSchema.nullable(),
    })
    .strict(),
  z.object({ id: z.number().int().nonnegative(), at: isoSecondSchema, type: z.literal("audit"), entry: auditFeedEntrySchema }).strict(),
  z.object({ id: z.number().int().nonnegative(), at: isoSecondSchema, type: z.literal("heartbeat") }).strict(),
]);
export type UiEvent = z.infer<typeof uiEventSchema>;

// ---- the route tables ------------------------------------------------------------------------------------------------------------------------------

const emptyParamsSchema = z.object({}).strict();

export const MCP_PATH = "/mcp";
export const EVENTS_PATH = "/ui/events";

export const SESSION_POST_ROUTES = {
  "/ui/pair": { request: pairRequestSchema, response: pairResponseSchema },
  "/ui/arm": { request: armRequestSchema, response: armResponseSchema },
  "/ui/arm/confirm": { request: armConfirmRequestSchema, response: armConfirmResponseSchema },
  "/ui/disarm": { request: emptyRequestSchema, response: disarmResponseSchema },
  "/ui/kill": { request: emptyRequestSchema, response: killResponseSchema },
} as const;

export const INBOX_POST_ROUTES = {
  "/ui/inbox/decision": { request: inboxDecisionRequestSchema, response: inboxItemSchema },
  "/ui/inbox/sign": { request: inboxSignRequestSchema, response: inboxSignResponseSchema },
} as const;

export const TOOL_POST_ROUTES = {
  "/ui/tool": { request: toolCallRequestSchema, response: toolCallResponseSchema },
} as const;

// Every JSON POST route the page may call. Which token scope and tool class may call which route is the
// daemon's closed class table (bridge/tool-classes.ts, R7), not this file.
export const UI_POST_ROUTES = {
  ...SESSION_POST_ROUTES,
  ...PREPARE_ROUTES,
  ...RELAY_READ_ROUTES,
  ...INBOX_POST_ROUTES,
  ...TOOL_POST_ROUTES,
} as const;

export const UI_GET_ROUTES = {
  "/ui/status": { params: emptyParamsSchema, response: statusResponseSchema },
  "/ui/inbox": INBOX_GET_ROUTES["/ui/inbox"],
  "/ui/inbox/:prepared_id": INBOX_GET_ROUTES["/ui/inbox/:prepared_id"],
  "/ui/userop/:hash": GET_ROUTES["/v1/userop/:hash"],
  "/ui/order/:hash": GET_ROUTES["/v1/order/:hash"],
} as const;

export type UiPostPath = keyof typeof UI_POST_ROUTES;
export type UiGetRoute = keyof typeof UI_GET_ROUTES;
export type UiRouteKey = `POST ${UiPostPath}` | `GET ${UiGetRoute}` | `GET ${typeof EVENTS_PATH}` | `GET ${typeof READ_PROXY_PREFIX}*` | `POST ${typeof READ_PROXY_PREFIX}*`;

export type UiPostRequest<P extends UiPostPath> = z.input<(typeof UI_POST_ROUTES)[P]["request"]>;
export type UiPostRequestParsed<P extends UiPostPath> = z.output<(typeof UI_POST_ROUTES)[P]["request"]>;
export type UiPostResponse<P extends UiPostPath> = z.output<(typeof UI_POST_ROUTES)[P]["response"]>;
export type UiGetResponse<R extends UiGetRoute> = z.output<(typeof UI_GET_ROUTES)[R]["response"]>;

export const UI_POST_PATHS = Object.freeze(Object.keys(UI_POST_ROUTES) as UiPostPath[]);
export const UI_GET_ROUTE_PATTERNS = Object.freeze(Object.keys(UI_GET_ROUTES) as UiGetRoute[]);
// Every route the daemon serves besides the static files. A test pins this list so adding a route is a
// visible change to the frozen contract.
export const UI_ROUTE_KEYS: readonly UiRouteKey[] = Object.freeze([
  ...UI_POST_PATHS.map((path): UiRouteKey => `POST ${path}`),
  ...UI_GET_ROUTE_PATTERNS.map((pattern): UiRouteKey => `GET ${pattern}`),
  `GET ${EVENTS_PATH}` as UiRouteKey,
  `GET ${READ_PROXY_PREFIX}*` as UiRouteKey,
  `POST ${READ_PROXY_PREFIX}*` as UiRouteKey,
]);

export function isUiPostPath(path: string): path is UiPostPath {
  return Object.hasOwn(UI_POST_ROUTES, path);
}

export function userOpStatusUiPath(hash: string): `/ui/userop/0x${string}` {
  return `/ui/userop/${hex32Schema.parse(hash).toLowerCase()}` as `/ui/userop/0x${string}`;
}

export function orderStatusUiPath(hash: string): `/ui/order/0x${string}` {
  return `/ui/order/${hex32Schema.parse(hash).toLowerCase()}` as `/ui/order/0x${string}`;
}

export function inboxItemUiPath(preparedId: string): `/ui/inbox/${string}` {
  return `/ui/inbox/${preparedIdSchema.parse(preparedId)}`;
}

// Matches a concrete GET path (no query string) against UI_GET_ROUTES.
export function matchUiGetRoute(path: string): { readonly route: UiGetRoute; readonly params: Readonly<Record<string, string>> } | undefined {
  for (const route of UI_GET_ROUTE_PATTERNS) {
    const pattern = route.split("/");
    const actual = path.split("/");
    if (pattern.length !== actual.length) continue;
    const params: Record<string, string> = {};
    let matches = true;
    for (let index = 0; index < pattern.length; index += 1) {
      const want = pattern[index];
      const got = actual[index];
      if (want === undefined || got === undefined) {
        matches = false;
        break;
      }
      if (want.startsWith(":")) {
        if (got === "") {
          matches = false;
          break;
        }
        params[want.slice(1)] = got;
      } else if (want !== got) {
        matches = false;
        break;
      }
    }
    if (matches) return { route, params };
  }
  return undefined;
}
