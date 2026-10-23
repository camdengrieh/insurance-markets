import type { IncomingMessage, ServerResponse } from "node:http";

import { ENTRY_POINT_V07 } from "../sdk/chain/xo/constants.js";
import { API_USER_AGENT } from "./upstream.js";
import { ERROR_STATUS, type ErrorCode } from "./app.js";
import type { RateLimitSpec } from "./config.js";

// The XO order relay: /v1/relay/xo/clob/... forwards the few order-book calls a visitor's browser needs to trade on XO
// to https://orderbooks.xo.market, and /v1/relay/xo/bundler forwards the few JSON-RPC calls it needs to set up its XO
// account (deploy it and enable trading with one ERC-4337 user operation) to XO's bundler, because neither host sends
// CORS headers for the dApp's origin and a browser cannot read their answers. Off unless the operator sets
// API_XO_RELAY=on.
//
// What it is, and what it is not:
//   - It forwards requests the visitor's browser has ALREADY signed (the L1 ClobAuth headers, the L2 HMAC headers, the
//     order's Kernel signature inside the body). It holds no key, no credential and no signer; it adds nothing to a
//     request that authenticates it, and it stores nothing about a request or an answer.
//   - An allowlist of method and path (and, for the two public reads, of query keys). Anything else is 404 before
//     anything is sent. Only these request headers go on, under XO's own names: XO_ADDRESS, XO_SIGNATURE, XO_TIMESTAMP,
//     XO_NONCE (L1) or XO_API_KEY, XO_PASSPHRASE, XO_TIMESTAMP, XO_SIGNATURE, XO_ADDRESS (L2), and content-type for a
//     body. A browser may send them as xo-api-key or xo_api_key (a proxy in front may drop names with an underscore,
//     so the dApp sends the hyphen form); both forms of one header in one request is refused. Cookies, Authorization,
//     Origin and everything else stay here.
//   - The body is forwarded byte for byte (JSON only, at most 64 KiB); the answer comes back with XO's status and body
//     and no upstream header except its content-type (JSON or plain text; anything else is relabelled plain text).
//   - One honest User-Agent, no redirect followed, a deadline and a size cap on the answer. Nothing is retried: a POST
//     /order that gets no answer may have been placed, and the browser is told exactly that (upstream_timeout).
//   - CORS: only the dApp's origin and http://localhost or 127.0.0.1 on any port (the dApp's dev server); a request
//     carrying any other Origin is refused (403) before anything is sent. No credentials mode, no cookie, ever.
//   - Logs: the method, the route's label, the status and the time taken. Never a header value, a query value or a body.
//   - The bundler route takes one JSON-RPC 2.0 request per POST (never a batch array), for a fixed list of methods
//     (XO_BUNDLER_METHODS), with the params each method takes and EntryPoint v0.7 named where one is named. The user
//     operation inside is already signed by the visitor's wallet (or carries no signature, for a gas estimate); the
//     relay forwards the validated body byte for byte and sends no header but its own User-Agent and the content type.
//     Nothing is retried: an eth_sendUserOperation that gets no answer may have reached the bundler.

export const XO_RELAY_PREFIX = "/v1/relay/xo/clob";
export const XO_BUNDLER_PATH = "/v1/relay/xo/bundler";
export const XO_ORDERBOOK_ORIGIN = "https://orderbooks.xo.market";
// The same bundler the server-side flow uses (relay/userops.ts DEFAULT_BUNDLER_URL).
export const XO_BUNDLER_URL = "https://mainnet-bundler.xo.market/";

// The visitor's account setup, and nothing else (src/xo/userop/bundler.ts is the client both sides use): a gas estimate,
// the one send, and the lookups that settle it by its hash. eth_supportedEntryPoints is a read that tells the page the
// bundler still takes EntryPoint v0.7. No gas-price method: fees are zero on XO's chain (sdk/trade/xo/userop/sign.ts), and
// the server-side flow asks for none. Everything else the bundler offers (debug_bundler_*, pimlico_*, eth_chainId) is
// refused here before anything is sent.
export const XO_BUNDLER_METHODS = Object.freeze([
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationReceipt",
  "eth_getUserOperationByHash",
] as const);
type BundlerMethod = (typeof XO_BUNDLER_METHODS)[number];
export const XO_RELAY_DAPP_ORIGIN = "https://xo-markets-explorer.vercel.app";

export const XO_RELAY_LIMITS = Object.freeze({
  maxBodyBytes: 64 * 1024,
  maxResponseBytes: 1024 * 1024,
  // XO holds a marketable order up to 3 s on live sports; 10 s is the relay's own budget for an order post (OR12).
  upstreamTimeoutMs: 10_000,
  // A browser caches the preflight this long (Chromium caps it at 7200 s).
  preflightMaxAgeS: 7_200,
});

const DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/;

export function relayOriginAllowed(origin: string): boolean {
  return origin === XO_RELAY_DAPP_ORIGIN || DEV_ORIGIN.test(origin);
}

// The XO header names, by the part after "XO_". The browser's names are xo-<part with hyphens> or xo_<part>.
const L1_HEADERS = ["address", "signature", "timestamp", "nonce"] as const;
const L2_HEADERS = ["api_key", "passphrase", "timestamp", "signature", "address"] as const;
type HeaderPart = (typeof L1_HEADERS)[number] | (typeof L2_HEADERS)[number];
const ALL_PARTS: readonly HeaderPart[] = ["address", "signature", "timestamp", "nonce", "api_key", "passphrase"];

export const RELAY_ALLOWED_REQUEST_HEADERS: readonly string[] = Object.freeze(["content-type", ...ALL_PARTS.flatMap((part) => [`xo-${part.replace(/_/g, "-")}`, `xo_${part}`])]);
export const RELAY_EXPOSED_HEADERS = "x-request-id, retry-after, x-xo-relay";

type Method = "GET" | "POST" | "DELETE";

interface RouteSpec {
  // What the logs and the error details call the route: the upstream path with any id replaced.
  readonly label: string;
  readonly path: RegExp;
  readonly methods: readonly Method[];
  // Query keys and the shape of each value; an empty object means no query at all.
  readonly query: Readonly<Record<string, RegExp>>;
  readonly headers: readonly HeaderPart[];
}

// Exactly the order-book calls of the visitor's own XO flow (relay/credentials.ts and relay/orders.ts make the same
// ones server-side): XO's clock, the registry and balance read, the book, the L1 login (derive, then create once),
// the order post and cancel, the open-orders list and one order by hash.
export const XO_RELAY_ROUTES: readonly RouteSpec[] = Object.freeze<RouteSpec[]>([
  { label: "/time", path: /^\/time$/, methods: ["GET"], query: {}, headers: [] },
  { label: "/balance-allowance", path: /^\/balance-allowance$/, methods: ["GET"], query: { address: /^0x[0-9a-fA-F]{40}$/ }, headers: [] },
  { label: "/book", path: /^\/book$/, methods: ["GET"], query: { token_id: /^[0-9]{1,78}$/ }, headers: [] },
  { label: "/auth/derive-api-key", path: /^\/auth\/derive-api-key$/, methods: ["GET"], query: {}, headers: L1_HEADERS },
  { label: "/auth/api-key", path: /^\/auth\/api-key$/, methods: ["POST"], query: {}, headers: L1_HEADERS },
  { label: "/order", path: /^\/order$/, methods: ["POST", "DELETE"], query: {}, headers: L2_HEADERS },
  { label: "/orders", path: /^\/orders$/, methods: ["GET"], query: {}, headers: L2_HEADERS },
  { label: "/orders/:hash", path: /^\/orders\/0x[0-9a-fA-F]{64}$/, methods: ["GET"], query: {}, headers: L2_HEADERS },
]);

export function matchRelayRoute(upstreamPath: string): RouteSpec | null {
  return XO_RELAY_ROUTES.find((spec) => spec.path.test(upstreamPath)) ?? null;
}

const HEADER_VALUE = /^[\x21-\x7e]{1,1024}$/;
export const JSON_TYPE = /^application\/json(\s*;\s*charset=utf-8)?$/i;
export const FORWARDED_TYPE = /^(?:application\/json|text\/plain)(?:\s*;\s*charset=[A-Za-z0-9_-]{1,20})?$/i;

export interface RelayContext {
  readonly requestId: string;
  readonly client: string;
  readonly nowMs: () => number;
  readonly takeToken: (key: string, spec: RateLimitSpec) => { readonly allowed: boolean; readonly retryAfterMs: number };
  readonly closing: () => boolean;
  readonly log: (line: string) => void;
}

export interface XoRelayOptions {
  readonly enabled: boolean;
  readonly limit: RateLimitSpec;
  // The platform fetch (globalThis.fetch in main.ts); tests pass a fake upstream. Never called when the relay is off.
  readonly fetchImpl: typeof fetch;
  readonly maxUrlChars: number;
  // Tests only: a shorter deadline than XO_RELAY_LIMITS.upstreamTimeoutMs.
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

// Shared with the Limitless relay (limitless-relay.ts), which reads bodies and answers the same way.
export class BodyTooLarge extends Error {}

export function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      total += chunk.length;
      if (total > max) {
        done = true;
        reject(new BodyTooLarge());
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      reject(new Error("unreadable"));
    });
  });
}

export async function readCapped(response: Response, max: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (response.body === null) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// The XO headers of a request under XO's own names, only those the route takes. A value outside printable ASCII, or
// one header sent under both spellings, is refused; the value itself is never put in any message.
function forwardedHeaders(req: IncomingMessage, spec: RouteSpec): { readonly ok: true; readonly headers: Record<string, string> } | { readonly ok: false; readonly answer: RelayAnswer } {
  const out: Record<string, string> = {};
  for (const part of spec.headers) {
    const hyphen = req.headers[`xo-${part.replace(/_/g, "-")}`];
    const underscore = req.headers[`xo_${part}`];
    if (hyphen !== undefined && underscore !== undefined) return { ok: false, answer: refusal("invalid_request", `The XO_${part.toUpperCase()} header was sent twice, under two spellings.`) };
    const value = hyphen ?? underscore;
    if (value === undefined) continue;
    if (typeof value !== "string" || !HEADER_VALUE.test(value)) return { ok: false, answer: refusal("invalid_request", `The XO_${part.toUpperCase()} header is not one printable value.`) };
    out[`XO_${part.toUpperCase()}`] = value;
  }
  return { ok: true, headers: out };
}

function querySearch(url: URL, spec: RouteSpec): string | null {
  const keys = [...url.searchParams.keys()];
  const wanted = Object.keys(spec.query);
  if (keys.length !== wanted.length || new Set(keys).size !== keys.length) return null;
  const parts: string[] = [];
  for (const key of wanted) {
    const value = url.searchParams.get(key);
    const shape = spec.query[key];
    if (value === null || shape === undefined || !shape.test(value)) return null;
    parts.push(`${key}=${value}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

const HASH32 = /^0x[0-9a-fA-F]{64}$/;
const RPC_ID_TEXT = /^[A-Za-z0-9_-]{1,64}$/;

// One JSON-RPC 2.0 request for an allowlisted method with the params that method takes, or why not. The message names
// the rule broken and never repeats a value from the body.
export function checkBundlerCall(value: unknown): { readonly ok: true; readonly method: BundlerMethod } | { readonly ok: false; readonly message: string } {
  if (Array.isArray(value)) return { ok: false, message: "The bundler relay takes one JSON-RPC request, not a batch." };
  if (typeof value !== "object" || value === null) return { ok: false, message: "The body is not a JSON-RPC request." };
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "jsonrpc" && key !== "id" && key !== "method" && key !== "params")) return { ok: false, message: "A JSON-RPC request has jsonrpc, id, method and params only." };
  if (record["jsonrpc"] !== "2.0") return { ok: false, message: "jsonrpc must be \"2.0\"." };
  const id = record["id"];
  if (!((typeof id === "number" && Number.isSafeInteger(id) && id >= 0) || (typeof id === "string" && RPC_ID_TEXT.test(id)))) return { ok: false, message: "id must be a whole number or a short word." };
  const method = record["method"];
  if (typeof method !== "string" || !(XO_BUNDLER_METHODS as readonly string[]).includes(method)) return { ok: false, message: `The bundler relay forwards ${XO_BUNDLER_METHODS.join(", ")} only.` };
  const params = record["params"];
  if (!Array.isArray(params)) return { ok: false, message: "params must be an array." };
  switch (method as BundlerMethod) {
    case "eth_supportedEntryPoints":
      if (params.length !== 0) return { ok: false, message: "eth_supportedEntryPoints takes no params." };
      break;
    case "eth_estimateUserOperationGas":
    case "eth_sendUserOperation": {
      const [op, entryPoint] = params as unknown[];
      if (params.length !== 2 || typeof op !== "object" || op === null || Array.isArray(op)) return { ok: false, message: `${method} takes [userOperation, entryPoint].` };
      if (typeof entryPoint !== "string" || entryPoint.toLowerCase() !== ENTRY_POINT_V07.toLowerCase()) return { ok: false, message: "The entry point must be EntryPoint v0.7." };
      break;
    }
    case "eth_getUserOperationReceipt":
    case "eth_getUserOperationByHash":
      if (params.length !== 1 || typeof params[0] !== "string" || !HASH32.test(params[0])) return { ok: false, message: `${method} takes [userOpHash].` };
      break;
  }
  return { ok: true, method: method as BundlerMethod };
}

export interface XoRelay {
  // True when the path is the relay's (whether or not the relay is on): the server hands it over whole.
  owns(path: string): boolean;
  handle(req: IncomingMessage, res: ServerResponse, path: string, context: RelayContext): Promise<void>;
}

export function createXoRelay(options: XoRelayOptions): XoRelay {
  function write(req: IncomingMessage, res: ServerResponse, answer: RelayAnswer, context: RelayContext, label: string, started: number): void {
    const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
    const headers: Record<string, string | number> = {
      "content-type": answer.contentType,
      "content-length": answer.body.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-request-id": context.requestId,
      "x-xo-relay": answer.source,
      ...answer.headers,
    };
    if (origin !== undefined) {
      headers["vary"] = "Origin";
      if (relayOriginAllowed(origin)) {
        headers["access-control-allow-origin"] = origin;
        headers["access-control-expose-headers"] = RELAY_EXPOSED_HEADERS;
      }
    }
    if (context.closing()) headers["connection"] = "close";
    res.writeHead(answer.status, headers);
    res.end(answer.body);
    context.log(`${req.method ?? "?"} ${label} ${answer.status} ${Math.max(0, context.nowMs() - started)}ms`);
  }

  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The XO relay is not enabled on this server.");
    const method = req.method ?? "";
    const rawUrl = req.url ?? "";
    const origin = req.headers["origin"];
    if (origin !== undefined && (typeof origin !== "string" || !relayOriginAllowed(origin))) return refusal("origin_not_allowed", "The XO relay answers the dApp's own origin only.");
    if (rawUrl.length > options.maxUrlChars) return refusal("uri_too_long", `The request target is longer than ${options.maxUrlChars} characters.`);
    let url: URL;
    try {
      url = new URL(rawUrl, "http://api.invalid");
    } catch {
      return refusal("invalid_request", "The request target is not valid.");
    }
    if (!rawUrl.startsWith("/") || rawUrl.startsWith("//") || url.hash !== "" || url.pathname !== path) return refusal("invalid_request", "The request target is not valid.");
    if (path === XO_BUNDLER_PATH) {
      setLabel(XO_BUNDLER_PATH);
      return bundlerAnswer(req, url, context);
    }
    const upstreamPath = path.slice(XO_RELAY_PREFIX.length);
    const spec = path.startsWith(`${XO_RELAY_PREFIX}/`) ? matchRelayRoute(upstreamPath) : null;
    if (spec === null) return refusal("not_found", "The XO relay forwards a fixed list of order-book calls; this is not one of them.");
    setLabel(`${XO_RELAY_PREFIX}${spec.label}`);
    if (!(spec.methods as readonly string[]).includes(method)) return refusal("method_not_allowed", `This relay route answers ${spec.methods.join(", ")} only.`, { allow: [...spec.methods, "OPTIONS"].join(", ") });
    const search = querySearch(url, spec);
    if (search === null) return refusal("invalid_request", Object.keys(spec.query).length === 0 ? "This relay route takes no query." : `This relay route takes exactly: ${Object.keys(spec.query).join(", ")}.`);

    const declared = req.headers["content-length"];
    const takesBody = method === "POST" || method === "DELETE";
    if (!takesBody && ((declared !== undefined && declared !== "0") || req.headers["transfer-encoding"] !== undefined)) return refusal("payload_too_large", "This relay route takes no request body.");
    if (takesBody) {
      const type = req.headers["content-type"];
      if (typeof type !== "string" || !JSON_TYPE.test(type.trim())) return refusal("unsupported_media_type", "The body must be application/json.");
      if (declared !== undefined && (!/^[0-9]{1,9}$/.test(declared) || Number(declared) > XO_RELAY_LIMITS.maxBodyBytes)) return refusal("payload_too_large", `The body is larger than ${XO_RELAY_LIMITS.maxBodyBytes} bytes.`);
    }
    const xo = forwardedHeaders(req, spec);
    if (!xo.ok) return xo.answer;

    const taken = context.takeToken(`relay|${context.client}`, options.limit);
    if (!taken.allowed) {
      return refusal("rate_limited", `Too many relay requests: ${options.limit.capacity} at once, then ${options.limit.refillPerSecond * 60} a minute per client.`, { "retry-after": String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) });
    }

    let body: Buffer | undefined;
    if (takesBody) {
      try {
        body = await readBody(req, XO_RELAY_LIMITS.maxBodyBytes);
      } catch (error) {
        if (error instanceof BodyTooLarge) return refusal("payload_too_large", `The body is larger than ${XO_RELAY_LIMITS.maxBodyBytes} bytes.`);
        return refusal("invalid_request", "The body could not be read.");
      }
      try {
        JSON.parse(body.toString("utf8"));
      } catch {
        return refusal("invalid_request", "The body is not JSON.");
      }
    }

    const headers: Record<string, string> = { "user-agent": API_USER_AGENT, accept: "application/json", ...xo.headers };
    if (body !== undefined) headers["content-type"] = "application/json";
    return forward(`${XO_ORDERBOOK_ORIGIN}${upstreamPath}${search}`, method, headers, body, {
      who: "XO's order book",
      timeout: takesBody && spec.label === "/order" && method === "POST" ? "XO did not answer in time. The order may or may not have been placed: check the open orders before sending it again." : "XO did not answer in time. Nothing is known about this request's outcome.",
    });
  }

  // POST /v1/relay/xo/bundler: one checked JSON-RPC request to XO's bundler. The same order of checks as an order-book
  // route (method, query, content type and declared size, the per-client limit, then the body), plus the JSON-RPC rules.
  async function bundlerAnswer(req: IncomingMessage, url: URL, context: RelayContext): Promise<RelayAnswer> {
    if (req.method !== "POST") return refusal("method_not_allowed", "This relay route answers POST only.", { allow: "POST, OPTIONS" });
    if (url.search !== "") return refusal("invalid_request", "This relay route takes no query.");
    const type = req.headers["content-type"];
    if (typeof type !== "string" || !JSON_TYPE.test(type.trim())) return refusal("unsupported_media_type", "The body must be application/json.");
    const declared = req.headers["content-length"];
    if (declared !== undefined && (!/^[0-9]{1,9}$/.test(declared) || Number(declared) > XO_RELAY_LIMITS.maxBodyBytes)) return refusal("payload_too_large", `The body is larger than ${XO_RELAY_LIMITS.maxBodyBytes} bytes.`);

    const taken = context.takeToken(`relay|${context.client}`, options.limit);
    if (!taken.allowed) {
      return refusal("rate_limited", `Too many relay requests: ${options.limit.capacity} at once, then ${options.limit.refillPerSecond * 60} a minute per client.`, { "retry-after": String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))) });
    }
    let body: Buffer;
    try {
      body = await readBody(req, XO_RELAY_LIMITS.maxBodyBytes);
    } catch (error) {
      if (error instanceof BodyTooLarge) return refusal("payload_too_large", `The body is larger than ${XO_RELAY_LIMITS.maxBodyBytes} bytes.`);
      return refusal("invalid_request", "The body could not be read.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString("utf8"));
    } catch {
      return refusal("invalid_request", "The body is not JSON.");
    }
    const call = checkBundlerCall(parsed);
    if (!call.ok) return refusal("invalid_request", call.message);
    return forward(XO_BUNDLER_URL, "POST", { "user-agent": API_USER_AGENT, accept: "application/json", "content-type": "application/json" }, body, {
      who: "XO's bundler",
      timeout:
        call.method === "eth_sendUserOperation"
          ? "XO's bundler did not answer in time. The user operation may or may not have been accepted: look it up by its hash before signing another."
          : "XO's bundler did not answer in time. Nothing is known about this request's outcome.",
    });
  }

  // One request upstream: no redirect followed, no credential, a deadline, a size cap on the answer, and only the
  // answer's status, body and (JSON or plain-text) content type passed back.
  async function forward(target: string, method: string, headers: Readonly<Record<string, string>>, body: Buffer | undefined, words: { readonly who: string; readonly timeout: string }): Promise<RelayAnswer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.upstreamTimeoutMs ?? XO_RELAY_LIMITS.upstreamTimeoutMs);
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
        if (controller.signal.aborted) return refusal("upstream_timeout", words.timeout);
        return refusal("upstream_unreachable", `${words.who} could not be reached.`);
      }
      if (response.status >= 300 && response.status < 400) return refusal("upstream_invalid", "XO answered with a redirect; the relay does not follow it.");
      let text: Buffer | null;
      try {
        text = await readCapped(response, XO_RELAY_LIMITS.maxResponseBytes);
      } catch {
        return refusal(controller.signal.aborted ? "upstream_timeout" : "upstream_unreachable", "XO's answer could not be read in full.");
      }
      if (text === null) return refusal("upstream_invalid", `XO's answer is larger than ${XO_RELAY_LIMITS.maxResponseBytes} bytes.`);
      const upstreamType = response.headers.get("content-type")?.trim() ?? "";
      return { status: response.status, body: text, contentType: FORWARDED_TYPE.test(upstreamType) ? upstreamType : "text/plain; charset=utf-8", source: "upstream" };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    owns(path) {
      // Everything under /v1/relay/ that the Limitless relay does not own (server.ts asks it first).
      return path === "/v1/relay" || path.startsWith("/v1/relay/");
    },
    async handle(req, res, path, context) {
      const started = context.nowMs();
      let label = "/v1/relay/:unmatched";
      if (req.method === "OPTIONS") {
        const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
        const spec = options.enabled && path.startsWith(`${XO_RELAY_PREFIX}/`) ? matchRelayRoute(path.slice(XO_RELAY_PREFIX.length)) : null;
        // The bundler route takes a JSON body and no XO header.
        const grant =
          spec !== null
            ? { label: `${XO_RELAY_PREFIX}${spec.label}`, methods: [...spec.methods, "OPTIONS"].join(", "), headers: RELAY_ALLOWED_REQUEST_HEADERS.join(", ") }
            : options.enabled && path === XO_BUNDLER_PATH
              ? { label: XO_BUNDLER_PATH, methods: "POST, OPTIONS", headers: "content-type" }
              : null;
        const allowed = origin !== undefined && relayOriginAllowed(origin) && grant !== null;
        res.writeHead(204, {
          "cache-control": "no-store",
          "x-request-id": context.requestId,
          ...(origin === undefined ? {} : { vary: "Origin" }),
          ...(allowed
            ? {
                "access-control-allow-origin": origin,
                "access-control-allow-methods": grant.methods,
                "access-control-allow-headers": grant.headers,
                "access-control-max-age": String(XO_RELAY_LIMITS.preflightMaxAgeS),
              }
            : {}),
        });
        res.end();
        context.log(`OPTIONS ${grant === null ? label : grant.label} 204 ${Math.max(0, context.nowMs() - started)}ms`);
        return;
      }
      let result: RelayAnswer;
      try {
        result = await answer(req, path, context, (value) => {
          label = value;
        });
      } catch {
        result = refusal("internal", "The relay failed to answer. Whether XO received the request is not known.");
      }
      write(req, res, result, context, label, started);
    },
  };
}
