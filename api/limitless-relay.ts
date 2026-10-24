import type { IncomingMessage } from "node:http";

import { getAddress, hexToString, isAddress, isHex, recoverMessageAddress, type Address, type Hex } from "viem";

import { buildLimitlessHeaders, type LimitlessToken } from "../sdk/node/trade/clob/limitless/hmac.js";
import type { AccountStore } from "./account-store.js";
import type { RateLimitSpec } from "./config.js";
import { PROOF_HEADER, verifyProof } from "./proof.js";
import { forward, isAnswer, isRecord, jsonHeaders, noBody, originRefusal, parseUpstream, rateLimited, readJsonBody, refusal, requestTarget, routeOwner, serverAnswer, type RelayAnswer, type RouteOwner } from "./relay-http.js";
import { XO_RELAY_LIMITS, type RelayContext } from "./xo-relay.js";

// The Limitless partner relay: /v1/relay/limitless/... lets the dApp trade on Limitless (Base 8453) with the visitor's
// trading key E and NO visitor API token (docs/unified-account-design.md sections 1 and 3.2, research note 44 sections 3.1
// and 4). E is registered once as the operator's partner sub-account ("EOA (Web3 partners)" mode); every upstream call is
// signed with the OPERATOR's partner HMAC token (LIMITLESS_PARTNER_TOKEN_ID / LIMITLESS_PARTNER_SECRET, scopes trading,
// account_creation and delegated_signing; the lmts-* signer of sdk/node/trade/clob/limitless/hmac.ts). Limitless sends
// no CORS headers for the dApp's origin (note 44 section 5), so every call goes through here anyway.
//
// Off unless API_LIMITLESS_RELAY=on. With it on and the partner token absent, every route but the public market read
// answers 503 not_configured and nothing is sent.
//
//   GET  /v1/relay/limitless/signing-message          GET /auth/signing-message (public; the text E signs to register)
//   POST /v1/relay/limitless/register                 { account, signingMessageHex, signature } -> { profileId }
//        The relay checks that `signature` is E's personal_sign over the decoded message, then POSTs
//        /profiles/partner-accounts with x-account (EIP-55), x-signing-message (the hex as sent), x-signature and body
//        {}; it stores account -> profileId (account-store.ts). A 409 from Limitless is looked up with GET
//        /profiles/partner-accounts?account=: a sub-account of ours is stored and returned; anyone else's answers 409
//        account_exists ("this wallet already has a Limitless account"). An account already stored is answered from the
//        store without a call.
//   POST /v1/relay/limitless/orders                   { account, order, orderType, marketSlug, postOnly?, clientOrderId? }
//        The order's own EIP-712 signature proves control (Limitless checks it): the relay checks maker == signer ==
//        account and signatureType 0, and adds ownerId = onBehalfOf = the stored profileId (never taken from the
//        browser) before POST /orders. An account not registered here answers 409 not_registered.
//   POST /v1/relay/limitless/orders/cancel            { account, orderId } + x-im-proof for account (proof.ts)
//        -> DELETE /orders/<orderId>?onBehalfOf=<profileId>
//   GET  /v1/relay/limitless/orders?account=&marketSlug=[&limit=1..200]   + x-im-proof for account
//        -> GET /markets/<slug>/user-orders[?limit=] with x-on-behalf-of: <profileId>
//   GET  /v1/relay/limitless/markets/<slug>           GET /markets/<slug> (public, unchanged)
//
// The cancel and the read need a proof because Limitless lets a partner token with delegated_signing cancel and read for
// any of its sub-accounts with no signature from the sub-account (note 44 section 3.1, "Design consequences"): without
// the proof anyone could make this server cancel or list someone else's orders. The visitor-token routes of the previous
// relay (/profiles/me, DELETE /orders/<id> with the visitor's lmts-* headers) are gone: no lmts-* header from a browser is
// read or forwarded.
//
// Kept from the previous relay: the 64 KiB body cap, one honest User-Agent, no redirect followed, a 10 s deadline and a
// 1 MiB answer cap, nothing retried (a POST /orders or a cancel that gets no answer may have taken effect, and the
// browser is told so), the dApp-only CORS rule, a per-client bucket, and logs of method, route, status and time only.

export const LIMITLESS_RELAY_PREFIX = "/v1/relay/limitless";
export const LIMITLESS_API_ORIGIN = "https://api.limitless.exchange";
// The answer's marker header, as before (app/src/features/trade/direct/limitless/relay.ts reads it): upstream, refused, or
// server (this relay answered itself: a profile id from its store).
export const LIMITLESS_RELAY_MARKER = "x-limitless-relay";

export const LIMITLESS_RELAY_LIMITS = Object.freeze({
  maxBodyBytes: XO_RELAY_LIMITS.maxBodyBytes,
  maxResponseBytes: XO_RELAY_LIMITS.maxResponseBytes,
  upstreamTimeoutMs: XO_RELAY_LIMITS.upstreamTimeoutMs,
  preflightMaxAgeS: XO_RELAY_LIMITS.preflightMaxAgeS,
  // The signing message's decoded length (the live text is about 200 bytes, note 44 section 2.1).
  maxSigningMessageBytes: 2048,
});

// A market slug as the SDK's reader accepts it (sdk/venues/limitless/schemas.ts SLUG): no slash, no dot first, and never
// one of the venue's listing words under /markets/.
export const SLUG_PATTERN = "(?!(?:active|search|categories|timeline|stable)(?:/|$))[A-Za-z0-9][A-Za-z0-9._-]{0,199}";
const SLUG = new RegExp(`^${SLUG_PATTERN}$`);
// An order id: the venue's UUID (DELETE /orders/{orderId}, OpenAPI pattern).
const ORDER_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const ORDER_TYPES = ["GTC", "FAK", "FOK"] as const;
const CLIENT_ORDER_ID = /^[\x21-\x7e]{1,64}$/;
const LIMIT = /^(?:[1-9][0-9]?|1[0-9]{2}|200)$/;

type RouteKind = "signing_message" | "register" | "orders_post" | "orders_get" | "cancel" | "market";

interface RouteSpec {
  readonly kind: RouteKind;
  readonly label: string;
  readonly path: RegExp;
  readonly method: "GET" | "POST";
  readonly partner: boolean;
}

export const LIMITLESS_RELAY_ROUTES: readonly RouteSpec[] = Object.freeze<RouteSpec[]>([
  { kind: "signing_message", label: "/signing-message", path: /^\/signing-message$/, method: "GET", partner: true },
  { kind: "register", label: "/register", path: /^\/register$/, method: "POST", partner: true },
  { kind: "cancel", label: "/orders/cancel", path: /^\/orders\/cancel$/, method: "POST", partner: true },
  { kind: "orders_post", label: "/orders", path: /^\/orders$/, method: "POST", partner: true },
  { kind: "market", label: "/markets/:slug", path: new RegExp(`^/markets/${SLUG_PATTERN}$`), method: "GET", partner: false },
]);

// /orders answers both GET (the account's orders) and POST (place).
export function matchLimitlessRoute(upstreamPath: string, method: string): RouteSpec | null {
  if (upstreamPath === "/orders" && method === "GET") return { kind: "orders_get", label: "/orders", path: /^\/orders$/, method: "GET", partner: true };
  return LIMITLESS_RELAY_ROUTES.find((spec) => spec.path.test(upstreamPath)) ?? null;
}

export interface LimitlessRelayOptions {
  readonly enabled: boolean;
  readonly partner: LimitlessToken | null;
  readonly store: AccountStore;
  readonly limit: RateLimitSpec;
  readonly accountLimit: RateLimitSpec;
  // The platform fetch (globalThis.fetch in main.ts); tests pass a fake upstream. Never called when the relay is off.
  readonly fetchImpl: typeof fetch;
  readonly maxUrlChars: number;
  // Tests only: a shorter deadline than LIMITLESS_RELAY_LIMITS.upstreamTimeoutMs.
  readonly upstreamTimeoutMs?: number;
}

export const ACCOUNT_EXISTS_MESSAGE = "This wallet already has a Limitless account, so it cannot trade on Limitless through this site. Trade it on limitless.exchange, or use a trading account that has never signed in there.";

export function createLimitlessRelay(options: LimitlessRelayOptions): RouteOwner {
  const iso = (nowMs: number): string => new Date(Math.floor(nowMs / 1000) * 1000).toISOString().replace(/\.000Z$/, "Z");

  function send(context: RelayContext, method: "GET" | "POST" | "DELETE", pathWithQuery: string, body: string | undefined, extra: Readonly<Record<string, string>>, timeoutWords: string): Promise<RelayAnswer> {
    const partner = options.partner as LimitlessToken;
    const signed = buildLimitlessHeaders({ token: partner, timestampIso: iso(context.nowMs()), method, pathWithQuery, body: body ?? "" });
    return forward(`${LIMITLESS_API_ORIGIN}${pathWithQuery}`, method, { accept: "application/json", ...signed, ...extra, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.upstreamTimeoutMs ?? LIMITLESS_RELAY_LIMITS.upstreamTimeoutMs,
      maxResponseBytes: LIMITLESS_RELAY_LIMITS.maxResponseBytes,
      who: "Limitless",
      timeoutWords,
    });
  }

  function accountWrite(context: RelayContext, account: Address): RelayAnswer | null {
    const taken = context.takeToken(`limitless-account|${account.toLowerCase()}`, options.accountLimit);
    return taken.allowed ? null : rateLimited(options.accountLimit, taken.retryAfterMs, "for this account to the Limitless relay");
  }

  const profileOf = (account: string): number | null => options.store.limitlessProfile(account);
  const notRegistered = (): RelayAnswer => refusal("not_registered", "This account is not registered with Limitless through this site yet: register it first (POST /v1/relay/limitless/register).");

  // The profile id of a sub-account in a GET /profiles/partner-accounts?account= answer (ListPartnerAccountsResponse:
  // { data: [{ profileId, account, displayName }], ... }, the venue's OpenAPI), when its account is this one.
  function listedProfile(value: unknown, account: string): number | null {
    if (!isRecord(value) || !Array.isArray(value["data"])) return null;
    for (const item of value["data"]) {
      if (isRecord(item) && typeof item["account"] === "string" && item["account"].toLowerCase() === account.toLowerCase() && Number.isSafeInteger(item["profileId"]) && (item["profileId"] as number) > 0) return item["profileId"] as number;
    }
    return null;
  }

  async function register(value: unknown, context: RelayContext): Promise<RelayAnswer> {
    if (!isRecord(value) || Object.keys(value).some((key) => !["account", "signingMessageHex", "signature"].includes(key))) return refusal("invalid_request", 'The body is { "account", "signingMessageHex", "signature" }.');
    const { account, signingMessageHex, signature } = value;
    if (typeof account !== "string" || !isAddress(account, { strict: false })) return refusal("invalid_request", "account is not an address.");
    if (typeof signingMessageHex !== "string" || !isHex(signingMessageHex, { strict: true }) || signingMessageHex.length < 4 || signingMessageHex.length % 2 !== 0 || (signingMessageHex.length - 2) / 2 > LIMITLESS_RELAY_LIMITS.maxSigningMessageBytes) {
      return refusal("invalid_request", `signingMessageHex is the 0x hex of the UTF-8 signing message (at most ${LIMITLESS_RELAY_LIMITS.maxSigningMessageBytes} bytes).`);
    }
    if (typeof signature !== "string" || !SIGNATURE.test(signature)) return refusal("invalid_request", "signature is a 65-byte hex personal_sign signature.");
    const owner = getAddress(account);
    let message: string;
    try {
      message = hexToString(signingMessageHex as Hex);
    } catch {
      return refusal("invalid_request", "signingMessageHex does not decode as UTF-8 text.");
    }
    let recovered: Address;
    try {
      recovered = await recoverMessageAddress({ message, signature: signature as Hex });
    } catch {
      return refusal("proof_invalid", "The signature does not recover.");
    }
    if (recovered.toLowerCase() !== owner.toLowerCase()) return refusal("proof_invalid", "The signature over the signing message is not the account's.");
    const known = profileOf(owner);
    if (known !== null) return serverAnswer(200, { profileId: known });
    const limited = accountWrite(context, owner);
    if (limited !== null) return limited;
    const created = await send(context, "POST", "/profiles/partner-accounts", "{}", { "x-account": owner, "x-signing-message": signingMessageHex, "x-signature": signature }, "Limitless did not answer in time. The account may or may not have been registered: register again to find out.");
    if (created.source !== "upstream") return created;
    if (created.status === 200 || created.status === 201) {
      const parsed = parseUpstream(created);
      const profileId = isRecord(parsed) ? parsed["profileId"] : undefined;
      if (!Number.isSafeInteger(profileId) || (profileId as number) <= 0 || (isRecord(parsed) && typeof parsed["account"] === "string" && parsed["account"].toLowerCase() !== owner.toLowerCase())) {
        return refusal("upstream_invalid", "Limitless answered the registration without a profile id for this account.");
      }
      options.store.setLimitlessProfile(owner, profileId as number, context.nowMs());
      return serverAnswer(200, { profileId });
    }
    if (created.status === 409) {
      const listed = await send(context, "GET", `/profiles/partner-accounts?account=${owner}`, undefined, {}, "Limitless did not answer in time. Register again.");
      const profileId = listed.source === "upstream" && listed.status === 200 ? listedProfile(parseUpstream(listed), owner) : null;
      if (profileId !== null) {
        options.store.setLimitlessProfile(owner, profileId, context.nowMs());
        return serverAnswer(200, { profileId });
      }
      return refusal("account_exists", ACCOUNT_EXISTS_MESSAGE);
    }
    return created;
  }

  async function placeOrder(value: unknown, context: RelayContext): Promise<RelayAnswer> {
    const allowed = ["account", "order", "orderType", "marketSlug", "postOnly", "clientOrderId"];
    if (!isRecord(value) || Object.keys(value).some((key) => !allowed.includes(key))) return refusal("invalid_request", `The body has ${allowed.join(", ")} only.`);
    const { account, order, orderType, marketSlug, postOnly, clientOrderId } = value;
    if (typeof account !== "string" || !isAddress(account, { strict: false })) return refusal("invalid_request", "account is not an address.");
    if (!isRecord(order)) return refusal("invalid_request", "order is the signed order object.");
    const { maker, signer, signatureType, signature } = order;
    if (typeof maker !== "string" || typeof signer !== "string" || maker.toLowerCase() !== account.toLowerCase() || signer.toLowerCase() !== account.toLowerCase()) return refusal("invalid_request", "The order's maker and signer must both be the account (a partner EOA order).");
    if (signatureType !== 0 && signatureType !== "0") return refusal("invalid_request", "The order's signatureType must be 0 (an EOA order).");
    if (typeof signature !== "string" || !SIGNATURE.test(signature)) return refusal("invalid_request", "The order carries no 65-byte signature: the relay never sends an unsigned order.");
    if (typeof orderType !== "string" || !(ORDER_TYPES as readonly string[]).includes(orderType)) return refusal("invalid_request", `orderType is one of ${ORDER_TYPES.join(", ")}.`);
    if (typeof marketSlug !== "string" || !SLUG.test(marketSlug)) return refusal("invalid_request", "marketSlug is not a market slug.");
    if (postOnly !== undefined && typeof postOnly !== "boolean") return refusal("invalid_request", "postOnly is true or false.");
    if (clientOrderId !== undefined && (typeof clientOrderId !== "string" || !CLIENT_ORDER_ID.test(clientOrderId))) return refusal("invalid_request", "clientOrderId is a short printable text.");
    const owner = getAddress(account);
    const profileId = profileOf(owner);
    if (profileId === null) return notRegistered();
    const limited = accountWrite(context, owner);
    if (limited !== null) return limited;
    // CreateOrderDto (additionalProperties false): order, ownerId, orderType, marketSlug required; onBehalfOf for a
    // partner placement; no timestamp (the relay hop would eat the 2 s receive window, note 44 section 3.1).
    const upstream = JSON.stringify({ order, ownerId: profileId, onBehalfOf: profileId, orderType, marketSlug, ...(postOnly === undefined ? {} : { postOnly }), ...(clientOrderId === undefined ? {} : { clientOrderId }) });
    return send(context, "POST", "/orders", upstream, {}, "Limitless did not answer in time. The order may or may not have been placed: check your open orders before sending it again.");
  }

  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The Limitless relay is not enabled on this server.");
    const method = req.method ?? "";
    const upstreamPath = path.slice(LIMITLESS_RELAY_PREFIX.length);
    const spec = path.startsWith(`${LIMITLESS_RELAY_PREFIX}/`) ? matchLimitlessRoute(upstreamPath, method) : null;
    if (spec === null) return refusal("not_found", "The Limitless relay serves a fixed list of calls; this is not one of them.");
    setLabel(`${LIMITLESS_RELAY_PREFIX}${spec.label}`);
    if (spec.method !== method) {
      const allow = spec.label === "/orders" ? "GET, POST" : spec.method;
      return refusal("method_not_allowed", `This relay route answers ${allow} only.`, { allow: `${allow}, OPTIONS` });
    }
    if (spec.partner && options.partner === null) return refusal("not_configured", "Limitless trading is not available on this server yet: the operator has not configured its Limitless partner token.");
    const origin = originRefusal(req, "The Limitless relay");
    if (origin !== null) return origin;
    const target = requestTarget(req, path, options.maxUrlChars);
    if (isAnswer(target)) return target;
    if (spec.kind !== "orders_get" && target.search !== "") return refusal("invalid_request", "This relay route takes no query.");
    if (spec.method === "GET") {
      const none = noBody(req);
      if (none !== null) return none;
    } else {
      const headers = jsonHeaders(req, LIMITLESS_RELAY_LIMITS.maxBodyBytes);
      if (headers !== null) return headers;
    }
    const taken = context.takeToken(`limitless-relay|${context.client}`, options.limit);
    if (!taken.allowed) return rateLimited(options.limit, taken.retryAfterMs, "to the Limitless relay from this client");

    switch (spec.kind) {
      case "market":
        return forward(`${LIMITLESS_API_ORIGIN}${upstreamPath}`, "GET", { accept: "application/json" }, undefined, {
          fetchImpl: options.fetchImpl,
          timeoutMs: options.upstreamTimeoutMs ?? LIMITLESS_RELAY_LIMITS.upstreamTimeoutMs,
          maxResponseBytes: LIMITLESS_RELAY_LIMITS.maxResponseBytes,
          who: "Limitless",
          timeoutWords: "Limitless did not answer in time. Nothing is known about this request's outcome.",
        });
      case "signing_message":
        // Public upstream; sent unsigned, as Limitless serves it (note 44 section 2.1).
        return forward(`${LIMITLESS_API_ORIGIN}/auth/signing-message`, "GET", { accept: "text/plain, application/json" }, undefined, {
          fetchImpl: options.fetchImpl,
          timeoutMs: options.upstreamTimeoutMs ?? LIMITLESS_RELAY_LIMITS.upstreamTimeoutMs,
          maxResponseBytes: 16 * 1024,
          who: "Limitless",
          timeoutWords: "Limitless did not answer in time. Ask for the signing message again.",
        });
      case "orders_get": {
        const params = target.url.searchParams;
        const keys = [...params.keys()];
        if (new Set(keys).size !== keys.length || keys.some((key) => !["account", "marketSlug", "limit"].includes(key))) return refusal("invalid_request", "This route takes account, marketSlug and limit (1 to 200) only.");
        const account = params.get("account");
        const slug = params.get("marketSlug");
        const limit = params.get("limit");
        if (account === null || !isAddress(account, { strict: false })) return refusal("invalid_request", "account is not an address.");
        if (slug === null || !SLUG.test(slug)) return refusal("invalid_request", "marketSlug is not a market slug.");
        if (limit !== null && !LIMIT.test(limit)) return refusal("invalid_request", "limit is 1 to 200.");
        const proof = await verifyProof({ header: req.headers[PROOF_HEADER], method: "GET", path: target.rawPath, search: target.search, body: Buffer.alloc(0), nowMs: context.nowMs(), account });
        if (!proof.ok) return refusal(proof.code, proof.message);
        const profileId = profileOf(account);
        if (profileId === null) return notRegistered();
        return send(context, "GET", `/markets/${slug}/user-orders${limit === null ? "" : `?limit=${limit}`}`, undefined, { "x-on-behalf-of": String(profileId) }, "Limitless did not answer in time. Nothing is known about this request's outcome.");
      }
      default:
        break;
    }

    const body = await readJsonBody(req, LIMITLESS_RELAY_LIMITS.maxBodyBytes);
    if (isAnswer(body)) return body;
    if (spec.kind === "register") return register(body.value, context);
    if (spec.kind === "orders_post") return placeOrder(body.value, context);
    // cancel
    const value = body.value;
    if (!isRecord(value) || Object.keys(value).some((key) => key !== "account" && key !== "orderId")) return refusal("invalid_request", 'The body is { "account", "orderId" }.');
    const { account, orderId } = value;
    if (typeof account !== "string" || !isAddress(account, { strict: false })) return refusal("invalid_request", "account is not an address.");
    if (typeof orderId !== "string" || !ORDER_ID.test(orderId)) return refusal("invalid_request", "orderId is the order's UUID.");
    const proof = await verifyProof({ header: req.headers[PROOF_HEADER], method: "POST", path: target.rawPath, search: target.search, body: body.raw, nowMs: context.nowMs(), account });
    if (!proof.ok) return refusal(proof.code, proof.message);
    const profileId = profileOf(account);
    if (profileId === null) return notRegistered();
    const limited = accountWrite(context, getAddress(account));
    if (limited !== null) return limited;
    return send(context, "DELETE", `/orders/${orderId}?onBehalfOf=${profileId}`, undefined, {}, "Limitless did not answer in time. The order may or may not have been cancelled: list your open orders again.");
  }

  return routeOwner(LIMITLESS_RELAY_PREFIX, {
    preflight: (path) => {
      if (!options.enabled || !path.startsWith(`${LIMITLESS_RELAY_PREFIX}/`)) return null;
      const upstreamPath = path.slice(LIMITLESS_RELAY_PREFIX.length);
      if (upstreamPath === "/orders") return { label: `${LIMITLESS_RELAY_PREFIX}/orders`, methods: ["GET", "POST"], headers: ["content-type", PROOF_HEADER] };
      const spec = matchLimitlessRoute(upstreamPath, "GET");
      if (spec === null) return null;
      const headers = spec.kind === "cancel" ? ["content-type", PROOF_HEADER] : spec.method === "POST" ? ["content-type"] : [];
      return { label: `${LIMITLESS_RELAY_PREFIX}${spec.label}`, methods: [spec.method], headers };
    },
    answer,
    internalWords: "The relay failed to answer. Whether Limitless received the request is not known.",
    maxAgeS: LIMITLESS_RELAY_LIMITS.preflightMaxAgeS,
    marker: LIMITLESS_RELAY_MARKER,
  });
}
