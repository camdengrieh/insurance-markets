import * as z from "zod/v4";

import { untrustedContentSchema } from "../guardrails/untrusted.js";
import { ERROR_CODES, type ErrorCode } from "./errors.js";
import { FLAG_NAMES } from "./flags.js";
import {
  MAX_REDEEMS_PER_OP,
  addressSchema,
  capabilitiesSchema,
  capabilityStateSchema,
  clobMarketIdSchema,
  clobPriceSchema,
  conditionIdSchema,
  CLOB_TIFS,
  CLOB_VENUES,
  hex32Schema,
  isoSecondSchema,
  marketTitleSlot,
  MAX_ORDER_TTL_S,
  ORDER_PURPOSES,
  ORDER_SIDES,
  ORDER_TIFS,
  orderHashSchema,
  ownerSchema,
  preparedClobOrderSchema,
  preparedIdSchema,
  preparedOrderSchema,
  preparedSchema,
  preparedUserOpSchema,
  priceSchema,
  sharesSchema,
  signatureInputSchema,
  slugSchema,
  tokenIdSchema,
  usdSchema,
  userOpHashSchema,
  type Prepared,
} from "../../sdk/trade/contract.js";

// The single source of truth for what the plugin and the relay say to each other
// (docs/phase1-gap-closing.md section 5.4 with amendments A1 and A5 of section 9). The plugin
// imports it, the relay imports it, the mock validates against it. It is frozen in Wave 0: a
// change here is a change to every stream, so it goes through the owner of this file.
//
// The prepared-item part (scalar schemas, what PayBox signs, the decoded blocks, Prepared and verifyPrepared) is
// shared with the page and lives in sdk/trade/contract.ts (docs/sdk-and-api-design.md step 5); it is re-exported
// here so every import of this file keeps working. What stays here is the relay's own wire: transport constants,
// the error body, the routes and the client interface.
//
// PORTABLE: no node:* import and no Node-only global (no Buffer, no process, no fetch call). The
// plugin bundle must stay portable, and test/relay-boundary.test.ts fails if that changes.

export * from "../../sdk/trade/contract.js";

// ---- transport constants ------------------------------------------------------------------------

// The only User-Agent either side sends. Fixed text: no person, machine or account identifier.
export const RELAY_USER_AGENT = "insurance-markets-xo-plugin/0.2";
// Plugin to relay authentication: a shared secret in this header (invariant 6).
export const RELAY_KEY_HEADER = "x-relay-key";
// A hosted plugin call is killed after 10 s (invariant 8); the relay answers `pending` by 6 s.
export const PLUGIN_CALL_BUDGET_MS = 10_000;
export const RELAY_PENDING_AFTER_MS = 6_000;
// What the relay client may spend on one call, leaving room for the tool's own work.
export const RELAY_CLIENT_TIMEOUT_MS = 8_000;

// ---- errors on the wire ----------------------------------------------------------------------------

export const errorCodeSchema = z.enum(ERROR_CODES);
export const relayErrorBodySchema = z
  .object({
    code: errorCodeSchema,
    message: z.string().max(500),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])).optional(),
  })
  .strict();
export const errorResponseSchema = z.object({ error: relayErrorBodySchema }).strict();
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ---- shared response parts --------------------------------------------------------------------------

export const ACCOUNT_STATES = ["undeployed", "deployed_unregistered", "registered"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const flagsSnapshotSchema = z.record(z.enum(FLAG_NAMES), z.boolean());

export const tripwiresSchema = z
  .object({
    ok: z.boolean(),
    tripped: z
      .array(z.object({ id: slugSchema, detail: z.string().max(300), since: isoSecondSchema.optional() }).strict())
      .max(32),
  })
  .strict();

export const UPSTREAM_STATES = ["ok", "degraded", "open_circuit", "requires_key", "blocked"] as const;
export const upstreamHealthSchema = z.record(
  z.string().regex(/^[a-z0-9.-]{1,253}$/),
  z
    .object({
      state: z.enum(UPSTREAM_STATES),
      errors: z.number().int().min(0),
      last_error_at: isoSecondSchema.nullable(),
    })
    .strict(),
);

const ownerFields = {
  owner: ownerSchema,
  // Optional on purpose: if a caller supplies one and it differs from the derived account the relay
  // answers account_mismatch (invariant 1). It is never used as input.
  account: addressSchema.optional(),
};

// ---- POST /v1/account/status --------------------------------------------------------------------------

const accountStatusRequest = z.object({ ...ownerFields }).strict();
const accountStatusResponse = z
  .object({
    account: addressSchema,
    state: z.enum(ACCOUNT_STATES),
    registered: z.boolean(),
    trading_enabled: capabilityStateSchema,
    balance_usd: usdSchema.nullable(),
    credentials: z
      .object({
        state: z.enum(["none", "stored", "validated", "failed"]),
        key_tag: z.string().max(32).nullable(),
      })
      .strict(),
    flags: flagsSnapshotSchema,
    tripwires: tripwiresSchema,
    capabilities: capabilitiesSchema,
    upstream: upstreamHealthSchema,
  })
  .strict();

// ---- POST /v1/userop/prepare, POST /v1/userop/submit, GET /v1/userop/{hash} ------------------------------

const noParams = z.object({}).strict().default({});
const enableParams = z.object({ allowance_usd: usdSchema.optional() }).strict().default({});
const useropPrepareRequest = z.discriminatedUnion("action", [
  z.object({ ...ownerFields, action: z.literal("deploy_enable_trading"), params: enableParams }).strict(),
  z.object({ ...ownerFields, action: z.literal("enable_trading"), params: enableParams }).strict(),
  z.object({ ...ownerFields, action: z.literal("revoke_trading"), params: noParams }).strict(),
  z
    .object({
      ...ownerFields,
      action: z.literal("redeem"),
      params: z.object({ condition_ids: z.array(conditionIdSchema).min(1).max(MAX_REDEEMS_PER_OP) }).strict(),
    })
    .strict(),
  z
    .object({
      ...ownerFields,
      action: z.literal("withdraw"),
      // The destination is always the owner EOA: there is deliberately no address field.
      params: z.object({ amount_usd: usdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...ownerFields,
      action: z.literal("create_market"),
      params: z
        .object({
          metadata_uri: z.url({ protocol: /^https$/ }).max(2048),
          expires_at: isoSecondSchema,
          // Shown to the approver inside marketTitleSlot only; never trusted.
          title: z.string().max(1000).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...ownerFields,
      action: z.literal("respond_update"),
      params: z.object({ condition_id: conditionIdSchema, accept: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...ownerFields,
      action: z.literal("cancel_market"),
      params: z.object({ condition_id: conditionIdSchema }).strict(),
    })
    .strict(),
]);

const submitRequest = z.object({ prepared_id: preparedIdSchema, signature: signatureInputSchema }).strict();

export const USEROP_SUBMIT_STATES = ["submitted", "rejected", "ambiguous"] as const;
const useropSubmitResponse = z
  .object({
    state: z.enum(USEROP_SUBMIT_STATES),
    user_op_hash: userOpHashSchema,
    tx_hash: hex32Schema.optional(),
    // Fixed relay text or a sanitised upstream code; never a raw upstream body.
    detail: z.string().max(300).optional(),
  })
  .strict();

export const USEROP_STATUS_STATES = ["unknown", "submitted", "included", "failed", "rejected", "ambiguous"] as const;
const useropStatusResponse = z
  .object({
    user_op_hash: userOpHashSchema,
    state: z.enum(USEROP_STATUS_STATES),
    tx_hash: hex32Schema.optional(),
    detail: z.string().max(300).optional(),
  })
  .strict();

// ---- POST /v1/auth/prepare, POST /v1/auth/submit ------------------------------------------------------------

const authPrepareRequest = z.object({ ...ownerFields }).strict();
const authSubmitResponse = z
  .object({
    // Never the triplet (invariant 5): only that it is stored, and a short tag to recognise it.
    credentials: z.literal("stored"),
    key_tag: z.string().min(1).max(32),
  })
  .strict();

// ---- POST /v1/order/prepare, POST /v1/order/submit, GET /v1/order/{hash} ---------------------------------------


const orderPrepareRequest = z
  .object({
    ...ownerFields,
    token_id: tokenIdSchema,
    side: z.enum(ORDER_SIDES),
    price: priceSchema,
    shares: sharesSchema,
    tif: z.enum(ORDER_TIFS),
    ttl_s: z.number().int().min(1).max(MAX_ORDER_TTL_S).optional(),
    post_only: z.boolean().optional(),
    // "seed" applies the creation-seed cap and is accepted only for a market this owner created.
    purpose: z.enum(ORDER_PURPOSES).default("trade"),
  })
  .strict();

export const ORDER_SUBMIT_STATES = ["accepted", "pending", "rejected", "ambiguous"] as const;
const orderSubmitResponse = z
  .object({
    state: z.enum(ORDER_SUBMIT_STATES),
    order_hash: orderHashSchema,
    detail: z.string().max(300).optional(),
  })
  .strict();

export const ORDER_STATUS_STATES = [
  "unknown",
  "pending",
  "open",
  "partially_filled",
  "filled",
  "cancelled",
  "expired",
  "rejected",
  "ambiguous",
] as const;
const orderStatusResponse = z
  .object({
    order_hash: orderHashSchema,
    state: z.enum(ORDER_STATUS_STATES),
    filled_shares: sharesSchema.or(z.literal("0")).optional(),
    remaining_shares: sharesSchema.or(z.literal("0")).optional(),
    detail: z.string().max(300).optional(),
  })
  .strict();

// ---- POST /v1/clob/order/prepare, POST /v1/clob/order/submit, POST /v1/clob/auth/prepare, POST /v1/clob/auth/submit --------
//
// The CLOB venues besides XO. The maker is the owner EOA itself, or on Polymarket the owner's Deposit Wallet when the
// relay finds one deployed and owned by the owner on Polygon (signature type 3); `account`, when supplied, must equal the
// maker the relay resolves (account_mismatch otherwise) and is never used as input. The relay reads the market (tick, minimum size, the exchange on Limitless, the book on Polymarket) itself; the caller
// names the market only by the id the read adapter shows (a condition id or a slug) and the outcome token.

const clobOrderPrepareRequest = z
  .object({
    ...ownerFields,
    venue: z.enum(CLOB_VENUES),
    market_id: clobMarketIdSchema,
    token_id: tokenIdSchema,
    side: z.enum(ORDER_SIDES),
    price: clobPriceSchema,
    shares: sharesSchema,
    tif: z.enum(CLOB_TIFS),
    // GTD only (Polymarket): how long the wire expiration lies ahead. Other types carry no expiry.
    ttl_s: z.number().int().min(1).max(MAX_ORDER_TTL_S).optional(),
    post_only: z.boolean().optional(),
  })
  .strict();

const clobOrderSubmitResponse = z
  .object({
    venue: z.enum(CLOB_VENUES),
    state: z.enum(ORDER_SUBMIT_STATES),
    order_hash: orderHashSchema,
    detail: z.string().max(300).optional(),
  })
  .strict();

const clobAuthPrepareRequest = z.object({ ...ownerFields, venue: z.enum(CLOB_VENUES) }).strict();
const clobAuthSubmitResponse = z
  .object({
    venue: z.enum(CLOB_VENUES),
    credentials: z.literal("stored"),
    key_tag: z.string().min(1).max(32),
  })
  .strict();

// ---- POST /v1/order/cancel, POST /v1/orders/list ---------------------------------------------------------------

const orderCancelRequest = z.object({ ...ownerFields, order_hash: orderHashSchema }).strict();
export const ORDER_CANCEL_STATES = ["cancelled", "not_found", "pending", "rejected", "ambiguous"] as const;
const orderCancelResponse = z
  .object({
    order_hash: orderHashSchema,
    state: z.enum(ORDER_CANCEL_STATES),
    detail: z.string().max(300).optional(),
  })
  .strict();

const ordersListRequest = z.object({ ...ownerFields }).strict();
const openOrderSchema = z
  .object({
    order_hash: orderHashSchema,
    token_id: tokenIdSchema,
    side: z.enum(ORDER_SIDES),
    price: priceSchema,
    original_shares: sharesSchema,
    remaining_shares: sharesSchema.or(z.literal("0")),
    expires_at: isoSecondSchema.nullable(),
  })
  .strict();
const ordersListResponse = z.object({ orders: z.array(openOrderSchema).max(500) }).strict();

// ---- POST /v1/funding/check, POST /v1/funding/report -------------------------------------------------------------

// `step: "transfer"` is sent by the plugin once, just before it hands out the transferRemote proposal. The relay
// then refuses every later check for the account until that funding is reported or lapses, so a caller who forgot
// the tx_hash cannot be handed a second approve and a second transfer on the same reservation.
const fundingCheckRequest = z.object({ ...ownerFields, amount: usdSchema, step: z.enum(["transfer"]).optional() }).strict();
const fundingReasonSchema = z.object({ code: slugSchema, message: z.string().min(1).max(300) }).strict();
const fundingCheckResponse = z
  .object({
    permitted: z.boolean(),
    // The relay derives the account; the plugin builds the Base proposals from this value (and
    // re-derives it itself), never from anything the agent said.
    account: addressSchema,
    state: z.enum(ACCOUNT_STATES),
    reserved_usd: usdSchema,
    // Identifies the reservation; null when nothing was reserved. Passed back to /funding/report.
    funding_id: preparedIdSchema.nullable(),
    expires_at: isoSecondSchema.nullable(),
    funding_remaining_usd: usdSchema,
    reasons: z.array(fundingReasonSchema).max(16),
  })
  .strict();

const fundingReportRequest = z
  .object({
    ...ownerFields,
    funding_id: preparedIdSchema,
    // The Base transaction hash of the transferRemote call, so the relay can follow its message.
    tx_hash: hex32Schema,
  })
  .strict();
export const FUNDING_STATES = [
  "reported",
  "dispatched",
  "delivered",
  "credited",
  "dispatched_not_delivered",
  "delivered_not_credited",
  "failed",
  "unknown",
] as const;
const fundingReportResponse = z
  .object({
    funding_id: preparedIdSchema,
    state: z.enum(FUNDING_STATES),
    message_id: hex32Schema.optional(),
    detail: z.string().max(300).optional(),
  })
  .strict();

// ---- POST /v1/creation/track -----------------------------------------------------------------------------------------

const creationTrackRequest = z.object({ condition_id: conditionIdSchema }).strict();
export const CREATION_STATUSES = [
  "not_found",
  "pending",
  "update_required",
  "active",
  "rejected",
  "cancelled",
  "paused",
  "resolved",
  "closed",
  "voided",
  "unknown",
] as const;
export const REVIEW_DECISIONS = ["none", "approve", "reject", "update_required"] as const;
const changeSchema = z
  .object({
    field: z.string().min(1).max(64),
    kind: z.enum(["numbers", "dates", "entities", "outcomes", "text", "tags", "expiry"]),
    risk: z.enum(["benign", "meaning_change"]),
    // Both sides are creator or oracle text: labelled untrusted, never instructions.
    before: untrustedContentSchema,
    after: untrustedContentSchema,
  })
  .strict();
const creationTrackResponse = z
  .object({
    condition_id: conditionIdSchema,
    status: z.enum(CREATION_STATUSES),
    review: z
      .object({ decision: z.enum(REVIEW_DECISIONS), reviewed_at: isoSecondSchema.nullable() })
      .strict(),
    timeline: z
      .array(
        z
          .object({
            at: isoSecondSchema,
            event: slugSchema,
            detail: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(200),
    pending_update: z
      .object({
        suggested_expires_at: isoSecondSchema.nullable(),
        expiry_changed: z.boolean(),
        guard_verdict: z.enum(["pass", "flagged"]),
        changes: z.array(changeSchema).max(50),
      })
      .strict()
      .nullable(),
    warnings: z.array(z.string().max(600)).max(16),
  })
  .strict();

// ---- GET /v1/prepared/{prepared_id} (amendment R9) --------------------------------------------------------------------------
//
// The stored item by id, for an agent that was handed only the id (the Cockpit page asked the relay to prepare it) and
// must fetch and re-check the record itself instead of trusting the page. The answer is exactly the strict Prepared
// object the prepare route of its kind returned: a user operation (kinds userop and create), an XO order, a CLOB venue
// order, or a login (kinds auth and clob_auth). The relay answers it only while the item is still signable: an item
// that expired says `expired`, one that was already sent (or whose send is ambiguous) says `prepared_used` with its
// state, and an id this relay does not hold for an owner it serves says `not_found`.
//
// Relays older than PREPARED_GET_SINCE_RELAY_VERSION do not have this route (they answer `not_found`, "No such route").
export const PREPARED_GET_SINCE_RELAY_VERSION = "0.3.0";
// The four answer shapes, each held to the kinds its prepare route returns (a login is the plain Prepared object).
const preparedLoginItemSchema = preparedSchema.refine((value) => value.kind === "auth" || value.kind === "clob_auth", { message: "a login item is kind auth or clob_auth", path: ["kind"] });
export const preparedItemSchema = z.union([preparedUserOpSchema, preparedOrderSchema, preparedClobOrderSchema, preparedLoginItemSchema]);
export type PreparedItem = z.infer<typeof preparedItemSchema>;

// ---- GET /v1/health ---------------------------------------------------------------------------------------------------------

export const HEALTH_STATUSES = ["ok", "degraded", "kill_switch"] as const;
const healthResponse = z
  .object({
    status: z.enum(HEALTH_STATUSES),
    version: z.string().min(1).max(32),
    time: isoSecondSchema,
    kill: z.boolean(),
    flags: flagsSnapshotSchema,
    tripwires: tripwiresSchema,
    upstream: upstreamHealthSchema,
  })
  .strict();

// ---- the route tables -----------------------------------------------------------------------------------------------------------

export const POST_ROUTES = {
  "/v1/account/status": { request: accountStatusRequest, response: accountStatusResponse },
  "/v1/userop/prepare": { request: useropPrepareRequest, response: preparedUserOpSchema },
  "/v1/userop/submit": { request: submitRequest, response: useropSubmitResponse },
  "/v1/auth/prepare": { request: authPrepareRequest, response: preparedSchema },
  "/v1/auth/submit": { request: submitRequest, response: authSubmitResponse },
  "/v1/order/prepare": { request: orderPrepareRequest, response: preparedOrderSchema },
  "/v1/order/submit": { request: submitRequest, response: orderSubmitResponse },
  "/v1/order/cancel": { request: orderCancelRequest, response: orderCancelResponse },
  "/v1/orders/list": { request: ordersListRequest, response: ordersListResponse },
  "/v1/clob/order/prepare": { request: clobOrderPrepareRequest, response: preparedClobOrderSchema },
  "/v1/clob/order/submit": { request: submitRequest, response: clobOrderSubmitResponse },
  "/v1/clob/auth/prepare": { request: clobAuthPrepareRequest, response: preparedSchema },
  "/v1/clob/auth/submit": { request: submitRequest, response: clobAuthSubmitResponse },
  "/v1/funding/check": { request: fundingCheckRequest, response: fundingCheckResponse },
  "/v1/funding/report": { request: fundingReportRequest, response: fundingReportResponse },
  "/v1/creation/track": { request: creationTrackRequest, response: creationTrackResponse },
} as const;

const noParamsSchema = z.object({}).strict();
const hashParamsSchema = z.object({ hash: hex32Schema }).strict();
const preparedParamsSchema = z.object({ id: preparedIdSchema }).strict();

export const GET_ROUTES = {
  "/v1/health": { params: noParamsSchema, response: healthResponse },
  "/v1/userop/:hash": { params: hashParamsSchema, response: useropStatusResponse },
  "/v1/order/:hash": { params: hashParamsSchema, response: orderStatusResponse },
  "/v1/prepared/:id": { params: preparedParamsSchema, response: preparedItemSchema },
} as const;

export type PostPath = keyof typeof POST_ROUTES;
export type GetRoute = keyof typeof GET_ROUTES;
export type RouteKey = `POST ${PostPath}` | `GET ${GetRoute}`;

// What a caller sends (defaults may be omitted) and what a handler receives (defaults applied).
export type PostRequest<P extends PostPath> = z.input<(typeof POST_ROUTES)[P]["request"]>;
export type PostRequestParsed<P extends PostPath> = z.output<(typeof POST_ROUTES)[P]["request"]>;
// What a handler returns, and what a client receives after parsing.
export type PostResponseInput<P extends PostPath> = z.input<(typeof POST_ROUTES)[P]["response"]>;
export type PostResponse<P extends PostPath> = z.output<(typeof POST_ROUTES)[P]["response"]>;
export type GetParams<R extends GetRoute> = z.output<(typeof GET_ROUTES)[R]["params"]>;
export type GetResponseInput<R extends GetRoute> = z.input<(typeof GET_ROUTES)[R]["response"]>;

// The concrete paths a client calls for the GET routes.
export type GetPath = "/v1/health" | `/v1/userop/0x${string}` | `/v1/order/0x${string}` | `/v1/prepared/${string}`;
export type GetResponse<P extends GetPath> = P extends "/v1/health"
  ? z.output<(typeof GET_ROUTES)["/v1/health"]["response"]>
  : P extends `/v1/userop/${string}`
    ? z.output<(typeof GET_ROUTES)["/v1/userop/:hash"]["response"]>
    : P extends `/v1/prepared/${string}`
      ? z.output<(typeof GET_ROUTES)["/v1/prepared/:id"]["response"]>
      : z.output<(typeof GET_ROUTES)["/v1/order/:hash"]["response"]>;

export const POST_PATHS = Object.freeze(Object.keys(POST_ROUTES) as PostPath[]);
export const GET_ROUTE_PATTERNS = Object.freeze(Object.keys(GET_ROUTES) as GetRoute[]);
export const CONTRACT_ROUTE_KEYS: readonly RouteKey[] = Object.freeze([
  ...POST_PATHS.map((path): RouteKey => `POST ${path}`),
  ...GET_ROUTE_PATTERNS.map((pattern): RouteKey => `GET ${pattern}`),
]);

export function userOpStatusPath(hash: string): `/v1/userop/0x${string}` {
  return `/v1/userop/${hex32Schema.parse(hash).toLowerCase()}` as `/v1/userop/0x${string}`;
}

export function orderStatusPath(hash: string): `/v1/order/0x${string}` {
  return `/v1/order/${hex32Schema.parse(hash).toLowerCase()}` as `/v1/order/0x${string}`;
}

export function preparedItemPath(preparedId: string): `/v1/prepared/${string}` {
  return `/v1/prepared/${preparedIdSchema.parse(preparedId)}`;
}

export function isPostPath(path: string): path is PostPath {
  return Object.hasOwn(POST_ROUTES, path);
}

// Matches a concrete GET path against the patterns. The path must have no query string.
export function matchGetRoute(path: string): { readonly route: GetRoute; readonly params: Readonly<Record<string, string>> } | undefined {
  for (const route of GET_ROUTE_PATTERNS) {
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

// ---- RelayClient: what the plugin tools depend on instead of fetch ---------------------------------------------------------

export interface RelayCallOptions {
  readonly signal?: AbortSignal;
  // Defaults to RELAY_CLIENT_TIMEOUT_MS; never above PLUGIN_CALL_BUDGET_MS.
  readonly timeoutMs?: number;
}

export interface RelayFailure {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null | readonly string[]>>;
}

// A client never throws for a failed call: transport problems, schema mismatches and relay
// errors all come back as { ok: false } with a stable code.
export type RelayResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: RelayFailure };

export interface RelayClient {
  post<P extends PostPath>(path: P, body: PostRequest<P>, options?: RelayCallOptions): Promise<RelayResult<PostResponse<P>>>;
  get<P extends GetPath>(path: P, options?: RelayCallOptions): Promise<RelayResult<GetResponse<P>>>;
}
