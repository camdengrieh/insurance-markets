import type { IncomingMessage, ServerResponse } from "node:http";

import { API_USER_AGENT } from "./upstream.js";
import { ERROR_STATUS, type ErrorCode } from "./app.js";
import type { RateLimitSpec } from "./config.js";
import { BodyTooLarge, FORWARDED_TYPE, JSON_TYPE, readBody, readCapped, relayOriginAllowed, XO_RELAY_LIMITS, type RelayContext } from "./xo-relay.js";

// The Limitless order relay: /v1/relay/limitless/... forwards the few calls a visitor's browser needs to trade on
// Limitless to https://api.limitless.exchange, because Limitless sends no CORS headers for the dApp's origin (measured
// 2026-10-23: OPTIONS /orders answers 404 with no access-control-allow-*, GET /markets/active answers 200 without
// access-control-allow-origin) and a browser cannot read its answers. Off unless the operator sets
// API_LIMITLESS_RELAY=on. The same design as the XO relay (xo-relay.ts), whose helpers it shares:
//
//   - It forwards requests the visitor's browser has ALREADY signed: the three lmts-* headers are the HMAC of the
//     visitor's own Limitless API token over this exact method, path, query and body, and the order inside a POST
//     /orders body carries the wallet's EIP-712 signature. The relay holds no token, no key and no signer, adds nothing
//     that authenticates a request, and stores nothing about a request or an answer.
//   - An allowlist of method and path (and of the one query a route takes). Anything else is 404 or 405 before anything
//     is sent. The routes are the ones the order flow needs (relay/clob.ts reads the same market record server-side):
//     the market record (its exchange, outcome tokens, fee flags; the markets API serves the book but not these), the
//     visitor's own profile (its id is the order's ownerId), the order post, the cancel, and the visitor's orders on one
//     market. The query string is forwarded exactly as sent, because the HMAC covers it.
//   - Only these request headers go on: lmts-api-key, lmts-timestamp and lmts-signature on the signed routes (all three,
//     or the request is refused), and content-type with a body. Cookies, Authorization, Origin and everything else stay
//     here. A signed route without its three headers is refused before sending: the relay never sends an unsigned call to
//     an authenticated route.
//   - The body is forwarded byte for byte (a JSON object, at most 64 KiB, POST /orders only); the answer comes back with
//     Limitless's status and body and no upstream header except its content-type (JSON or plain text; anything else is
//     relabelled plain text), marked x-limitless-relay: upstream (or refused, for the relay's own answers).
//   - One honest User-Agent, no redirect followed, a deadline (10 s) and a size cap on the answer. Nothing is retried: a
//     POST /orders or a DELETE that gets no answer may have taken effect, and the browser is told exactly that.
//   - CORS: the dApp's origin and http://localhost or 127.0.0.1 on any port (the dev server), as the XO relay; a request
//     carrying any other Origin is refused (403) before anything is sent. No credentials mode, no cookie.
//   - A per-client limit of its own (the same size as the XO relay's, a separate bucket).
//   - Logs: the method, the route's label, the status and the time taken. Never a header value, a slug, a query or a body.

export const LIMITLESS_RELAY_PREFIX = "/v1/relay/limitless";
export const LIMITLESS_API_ORIGIN = "https://api.limitless.exchange";

export const LIMITLESS_RELAY_LIMITS = Object.freeze({
  maxBodyBytes: XO_RELAY_LIMITS.maxBodyBytes,
  maxResponseBytes: XO_RELAY_LIMITS.maxResponseBytes,
  upstreamTimeoutMs: XO_RELAY_LIMITS.upstreamTimeoutMs,
  preflightMaxAgeS: XO_RELAY_LIMITS.preflightMaxAgeS,
});

// The scoped-token headers (docs.limitless.exchange/developers/authentication; sdk/node/trade/clob/limitless/hmac.ts
// makes them server-side), each with the shape it must have. Never echoed in an answer or a log.
const SIGNED_HEADERS = Object.freeze({
  "lmts-api-key": /^[\x21-\x7e]{1,512}$/,
  "lmts-timestamp": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
  "lmts-signature": /^[A-Za-z0-9+/]{43}=$/,
} as const);
type SignedHeader = keyof typeof SIGNED_HEADERS;
const SIGNED_HEADER_NAMES = Object.keys(SIGNED_HEADERS) as SignedHeader[];

export const LIMITLESS_RELAY_ALLOWED_REQUEST_HEADERS: readonly string[] = Object.freeze(["content-type", ...SIGNED_HEADER_NAMES]);
export const LIMITLESS_RELAY_EXPOSED_HEADERS = "x-request-id, retry-after, x-limitless-relay";

// A market slug as the SDK's reader accepts it (sdk/venues/limitless/schemas.ts SLUG): no slash, no dot first. The
// venue's own listing words under /markets/ are not slugs, so /markets/active and its kin are not forwarded.
const SLUG = "(?!(?:active|search|categories|timeline|stable)(?:/|$))[A-Za-z0-9][A-Za-z0-9._-]{0,199}";
// An order id: the venue's UUID (DELETE /orders/{orderId}, OpenAPI pattern).
const ORDER_ID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

type Method = "GET" | "POST" | "DELETE";

interface RouteSpec {
  // What the logs and the error details call the route: the upstream path with any id replaced.
  readonly label: string;
  readonly path: RegExp;
  readonly methods: readonly Method[];
  // The raw query strings the route takes ("" for none), forwarded unchanged because the HMAC covers them.
  readonly query: RegExp;
  readonly signed: boolean;
  readonly body: boolean;
}

// Exactly the calls of the visitor's own Limitless flow (app/src/features/trade/direct/limitless/).
export const LIMITLESS_RELAY_ROUTES: readonly RouteSpec[] = Object.freeze<RouteSpec[]>([
  // Public: the market record the order is built from (venue.exchange, tokens, tradeType, metadata.fee).
  { label: "/markets/:slug", path: new RegExp(`^/markets/${SLUG}$`), methods: ["GET"], query: /^$/, signed: false, body: false },
  // Signed: the token's own profile (id = the order's ownerId; account; trade wallet mode; effective fee rate).
  { label: "/profiles/me", path: /^\/profiles\/me$/, methods: ["GET"], query: /^$/, signed: true, body: false },
  { label: "/orders", path: /^\/orders$/, methods: ["POST"], query: /^$/, signed: true, body: true },
  { label: "/orders/:id", path: new RegExp(`^/orders/${ORDER_ID}$`), methods: ["DELETE"], query: /^$/, signed: true, body: false },
  // The visitor's orders on one market (LIVE by default), at most `limit` of them.
  { label: "/markets/:slug/user-orders", path: new RegExp(`^/markets/${SLUG}/user-orders$`), methods: ["GET"], query: /^(?:\?limit=(?:[1-9][0-9]?|1[0-9]{2}|200))?$/, signed: true, body: false },
]);

export function matchLimitlessRoute(upstreamPath: string): RouteSpec | null {
  return LIMITLESS_RELAY_ROUTES.find((spec) => spec.path.test(upstreamPath)) ?? null;
}

export interface LimitlessRelayOptions {
  readonly enabled: boolean;
  readonly limit: RateLimitSpec;
  // The platform fetch (globalThis.fetch in main.ts); tests pass a fake upstream. Never called when the relay is off.
  readonly fetchImpl: typeof fetch;
  readonly maxUrlChars: number;
  // Tests only: a shorter deadline than LIMITLESS_RELAY_LIMITS.upstreamTimeoutMs.
  readonly upstreamTimeoutMs?: number;
}

interface RelayAnswer {
  readonly status: number;
  readonly body: Buffer;
  readonly contentType: string;
  readonly source: "upstream" | "refused";
  readonly headers?: Readonly<Record<string, string>>;
}

function refusal(code: ErrorCode, message: string, headers?: Readonly<Record<string, string>>): RelayAnswer {
  return { status: ERROR_STATUS[code], body: Buffer.from(JSON.stringify({ error: { code, message } }), "utf8"), contentType: "application/json; charset=utf-8", source: "refused", ...(headers === undefined ? {} : { headers }) };
}

// The three signed headers of a request, all present and each of its shape, or why not. The message names the header,
// never its value.
function signedHeaders(req: IncomingMessage): { readonly ok: true; readonly headers: Record<string, string> } | { readonly ok: false; readonly answer: RelayAnswer } {
  const out: Record<string, string> = {};
  for (const name of SIGNED_HEADER_NAMES) {
    const value = req.headers[name];
    if (value === undefined) return { ok: false, answer: refusal("invalid_request", `This relay route is signed: send ${SIGNED_HEADER_NAMES.join(", ")}.`) };
    if (typeof value !== "string" || !SIGNED_HEADERS[name].test(value)) return { ok: false, answer: refusal("invalid_request", `The ${name} header is not one value of the expected form.`) };
    out[name] = value;
  }
  return { ok: true, headers: out };
}

export interface LimitlessRelay {
  // True when the path is this relay's (whether or not it is on): the server hands it over whole, before the XO relay.
  owns(path: string): boolean;
  handle(req: IncomingMessage, res: ServerResponse, path: string, context: RelayContext): Promise<void>;
}

export function createLimitlessRelay(options: LimitlessRelayOptions): LimitlessRelay {
  function write(req: IncomingMessage, res: ServerResponse, answer: RelayAnswer, context: RelayContext, label: string, started: number): void {
    const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
    const headers: Record<string, string | number> = {
      "content-type": answer.contentType,
      "content-length": answer.body.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-request-id": context.requestId,
      "x-limitless-relay": answer.source,
      ...answer.headers,
    };
    if (origin !== undefined) {
      headers["vary"] = "Origin";
      if (relayOriginAllowed(origin)) {
        headers["access-control-allow-origin"] = origin;
        headers["access-control-expose-headers"] = LIMITLESS_RELAY_EXPOSED_HEADERS;
      }
    }
    if (context.closing()) headers["connection"] = "close";
    res.writeHead(answer.status, headers);
    res.end(answer.body);
    context.log(`${req.method ?? "?"} ${label} ${answer.status} ${Math.max(0, context.nowMs() - started)}ms`);
  }

  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The Limitless relay is not enabled on this server.");
    const method = req.method ?? "";
    const rawUrl = req.url ?? "";
    const origin = req.headers["origin"];
    if (origin !== undefined && (typeof origin !== "string" || !relayOriginAllowed(origin))) return refusal("origin_not_allowed", "The Limitless relay answers the dApp's own origin only.");
    if (rawUrl.length > options.maxUrlChars) return refusal("uri_too_long", `The request target is longer than ${options.maxUrlChars} characters.`);
    let url: URL;
    try {
      url = new URL(rawUrl, "http://api.invalid");
    } catch {
      return refusal("invalid_request", "The request target is not valid.");
    }
    if (!rawUrl.startsWith("/") || rawUrl.startsWith("//") || url.hash !== "" || url.pathname !== path) return refusal("invalid_request", "The request target is not valid.");
    // The path exactly as sent, with no dot segment, escape or trailing slash to normalise away: what is matched is
    // what is forwarded, and what the browser signed.
    const rawPath = rawUrl.split("?", 1)[0] ?? "";
    const upstreamPath = path.slice(LIMITLESS_RELAY_PREFIX.length);
    const spec = rawPath === path && path.startsWith(`${LIMITLESS_RELAY_PREFIX}/`) ? matchLimitlessRoute(upstreamPath) : null;
    if (spec === null) return refusal("not_found", "The Limitless relay forwards a fixed list of calls; this is not one of them.");
    setLabel(`${LIMITLESS_RELAY_PREFIX}${spec.label}`);
    if (!(spec.methods as readonly string[]).includes(method)) return refusal("method_not_allowed", `This relay route answers ${spec.methods.join(", ")} only.`, { allow: [...spec.methods, "OPTIONS"].join(", ") });
    const search = rawUrl.length > rawPath.length ? rawUrl.slice(rawPath.length) : "";
    if (!spec.query.test(search)) return refusal("invalid_request", spec.query.test("?limit=1") ? "This relay route takes no query but limit=1 to 200." : "This relay route takes no query.");

    const declared = req.headers["content-length"];
    if (!spec.body && ((declared !== undefined && declared !== "0") || req.headers["transfer-encoding"] !== undefined)) return refusal("payload_too_large", "This relay route takes no request body.");
    if (spec.body) {
      const type = req.headers["content-type"];
      if (typeof type !== "string" || !JSON_TYPE.test(type.trim())) return refusal("unsupported_media_type", "The body must be application/json.");
      if (declared !== undefined && (!/^[0-9]{1,9}$/.test(declared) || Number(declared) > LIMITLESS_RELAY_LIMITS.maxBodyBytes)) return refusal("payload_too_large", `The body is larger than ${LIMITLESS_RELAY_LIMITS.maxBodyBytes} bytes.`);
    }
    let signed: Record<string, string> = {};
    if (spec.signed) {
      const checked = signedHeaders(req);
      if (!checked.ok) return checked.answer;
      signed = checked.headers;
    }

    const taken = context.takeToken(`limitless-relay|${context.client}`, options.limit);
    if (!taken.allowed) {
      return refusal("rate_limited", `Too many relay requests: ${options.limit.capacity} at once, then ${options.limit.refillPerSecond * 60} a minute per client.`, { "retry-after": String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) });
    }

    let body: Buffer | undefined;
    if (spec.body) {
      try {
        body = await readBody(req, LIMITLESS_RELAY_LIMITS.maxBodyBytes);
      } catch (error) {
        if (error instanceof BodyTooLarge) return refusal("payload_too_large", `The body is larger than ${LIMITLESS_RELAY_LIMITS.maxBodyBytes} bytes.`);
        return refusal("invalid_request", "The body could not be read.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        return refusal("invalid_request", "The body is not JSON.");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return refusal("invalid_request", "The body is not a JSON object.");
    }

    const headers: Record<string, string> = { "user-agent": API_USER_AGENT, accept: "application/json", ...signed };
    if (body !== undefined) headers["content-type"] = "application/json";
    const timeout =
      spec.label === "/orders"
        ? "Limitless did not answer in time. The order may or may not have been placed: check your open orders before sending it again."
        : method === "DELETE"
          ? "Limitless did not answer in time. The order may or may not have been cancelled: list your open orders again."
          : "Limitless did not answer in time. Nothing is known about this request's outcome.";
    return forward(`${LIMITLESS_API_ORIGIN}${upstreamPath}${search}`, method, headers, body, timeout);
  }

  // One request upstream: no redirect followed, no credential, a deadline, a size cap on the answer, and only the
  // answer's status, body and (JSON or plain-text) content type passed back.
  async function forward(target: string, method: string, headers: Readonly<Record<string, string>>, body: Buffer | undefined, timeoutWords: string): Promise<RelayAnswer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.upstreamTimeoutMs ?? LIMITLESS_RELAY_LIMITS.upstreamTimeoutMs);
    try {
      let response: Response;
      try {
        response = await options.fetchImpl(target, {
          method,
          headers: { ...headers },
          ...(body === undefined ? {} : { body: new Uint8Array(body) }),
          redirect: "manual",
          credentials: "omit",
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) return refusal("upstream_timeout", timeoutWords);
        return refusal("upstream_unreachable", "Limitless could not be reached.");
      }
      if (response.status >= 300 && response.status < 400) return refusal("upstream_invalid", "Limitless answered with a redirect; the relay does not follow it.");
      let text: Buffer | null;
      try {
        text = await readCapped(response, LIMITLESS_RELAY_LIMITS.maxResponseBytes);
      } catch {
        return refusal(controller.signal.aborted ? "upstream_timeout" : "upstream_unreachable", "Limitless's answer could not be read in full.");
      }
      if (text === null) return refusal("upstream_invalid", `Limitless's answer is larger than ${LIMITLESS_RELAY_LIMITS.maxResponseBytes} bytes.`);
      const upstreamType = response.headers.get("content-type")?.trim() ?? "";
      return { status: response.status, body: text, contentType: FORWARDED_TYPE.test(upstreamType) ? upstreamType : "text/plain; charset=utf-8", source: "upstream" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    owns(path) {
      return path === LIMITLESS_RELAY_PREFIX || path.startsWith(`${LIMITLESS_RELAY_PREFIX}/`);
    },
    async handle(req, res, path, context) {
      const started = context.nowMs();
      let label = `${LIMITLESS_RELAY_PREFIX}/:unmatched`;
      if (req.method === "OPTIONS") {
        const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
        const spec = options.enabled && path.startsWith(`${LIMITLESS_RELAY_PREFIX}/`) ? matchLimitlessRoute(path.slice(LIMITLESS_RELAY_PREFIX.length)) : null;
        const allowed = origin !== undefined && relayOriginAllowed(origin) && spec !== null;
        // A public read takes no header worth a preflight; a signed route takes the three lmts-* headers, and the order
        // post its content type.
        const grantHeaders = spec === null ? "" : spec.signed ? (spec.body ? LIMITLESS_RELAY_ALLOWED_REQUEST_HEADERS : SIGNED_HEADER_NAMES).join(", ") : "content-type";
        res.writeHead(204, {
          "cache-control": "no-store",
          "x-request-id": context.requestId,
          ...(origin === undefined ? {} : { vary: "Origin" }),
          ...(allowed
            ? {
                "access-control-allow-origin": origin,
                "access-control-allow-methods": [...spec.methods, "OPTIONS"].join(", "),
                "access-control-allow-headers": grantHeaders,
                "access-control-max-age": String(LIMITLESS_RELAY_LIMITS.preflightMaxAgeS),
              }
            : {}),
        });
        res.end();
        context.log(`OPTIONS ${spec === null ? label : `${LIMITLESS_RELAY_PREFIX}${spec.label}`} 204 ${Math.max(0, context.nowMs() - started)}ms`);
        return;
      }
      let result: RelayAnswer;
      try {
        result = await answer(req, path, context, (value) => {
          label = value;
        });
      } catch {
        result = refusal("internal", "The relay failed to answer. Whether Limitless received the request is not known.");
      }
      write(req, res, result, context, label, started);
    },
  };
}
