import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, READ_SERVICES, type ReadService } from "../app/headers.config.js";
import { JSON_RPC_READ_METHODS, MAX_REQUEST_BODY_BYTES, isSafeUpstreamPath, isSafeUpstreamQuery, type BridgeErrorCode } from "./contract.js";

// The read proxy's allowlist (docs/dapp-design.md 1.3 B4, 4.2, 4.8 R3/R9/R10, 7.2 M1-3).
//
// WHAT IT DECIDES. Given a service id, a method, a path, a query and (for POST) a body, it says either "send
// exactly this URL" or "refuse, with this code". It is a pure function of its inputs plus the closed tables
// below: no network, no clock, no state, so every refusal is a unit test.
//
// WHERE THE HOSTS COME FROM. One service is one origin. The origin of each service is taken from
// app/headers.config.ts (BROWSER_DIRECT_ORIGINS and DAEMON_ONLY_ORIGINS), the same lists that build both CSPs
// and the page's own URL-to-service mapping, so the page, the CSP and the daemon cannot disagree about a host.
// The page never names an origin: it names a service id, and a request for an id that has no origin, no
// route table here, or is not in READ_SERVICES is refused (fail closed). There is no platform-registry data
// file yet (docs/platform-registry-design.md is design only), so headers.config.ts is the registry.
//
// WHAT IS ALLOWED. Per service, a short list of routes: a method, a path pattern with typed placeholders, and
// for a few routes a query rule or a body rule. GET is the default. POST exists only for
//   - JSON-RPC to the public chain nodes, with the methods of JSON_RPC_READ_METHODS (contract) and a fixed
//     body shape (no extra keys, at most MAX_RPC_BATCH calls, no query string so an `api_key` cannot ride along),
//   - Hyperliquid `POST /info` with a closed list of read-only request types,
//   - the Polymarket CLOB batch reads (`/books`, `/prices`, `/midpoints`, `/spreads`).
// Anything that signs, submits, orders, withdraws or reads an account through a signed route (Kalshi
// `/portfolio`, Limitless `user-orders`, XO `/orders`, Quotient `/portfolio` and `forecast-requests`) is not
// listed, so it is refused. A route is added by a reviewed change to this file, never by configuration.
//
// RESTRICTED SERVICES. Kalshi, Quotient, Novig and Gemini carry restricted terms (F5, R3): their requests are
// refused with venue_disabled until the operator turns them on, and their bodies are memory-only. The proxy
// (bridge/proxy.ts) applies that; this file only says which services they are.
//
// The path and query are first checked with the contract's own isSafeUpstreamPath / isSafeUpstreamQuery
// (no dot segment, no encoded slash, dot or backslash, no control character). The URL that is sent is rebuilt
// from the checked parts, so what is sent is exactly what was checked.

export const MAX_RPC_BATCH = 100;
export const MAX_CLOB_BATCH = 500;
export const RESTRICTED_SERVICES: readonly ReadService[] = Object.freeze(["kalshi", "quotient", "novig", "gemini"] as const);

export function isRestrictedService(service: ReadService): boolean {
  return RESTRICTED_SERVICES.includes(service);
}

// ---- verdicts ---------------------------------------------------------------------------------------------

export type RouteKind = "rest" | "jsonrpc" | "hyperliquid_info" | "clob_batch";

export interface Allowed {
  readonly service: ReadService;
  readonly origin: string;
  readonly host: string;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly query: string;
  // origin + path + "?" + query, rebuilt from the checked parts.
  readonly url: string;
  readonly kind: RouteKind;
  readonly restricted: boolean;
  // The re-serialised body for a POST (compact JSON of what was checked); undefined for a GET.
  readonly body: string | undefined;
}

export interface Refused {
  readonly code: Extract<BridgeErrorCode, "service_not_allowed" | "path_not_allowed" | "method_not_allowed" | "rpc_method_not_allowed" | "invalid_request">;
  // Fixed text. It never quotes the request.
  readonly message: string;
}

export type Verdict = { readonly ok: true; readonly allowed: Allowed } | ({ readonly ok: false } & Refused);

const refuse = (code: Refused["code"], message: string): Verdict => ({ ok: false, code, message });

// ---- path patterns ----------------------------------------------------------------------------------------

// Typed placeholders. None accepts "%" or "/", so an encoded slash or dot can never match a placeholder.
const SEGMENT_KINDS: Readonly<Record<string, RegExp>> = Object.freeze({
  cid: /^0x[0-9a-fA-F]{64}$/,
  addr: /^0x[0-9a-fA-F]{40}$/,
  int: /^[0-9]{1,20}$/,
  tok: /^[0-9]{1,78}$/,
  slug: /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/,
  word: /^[A-Za-z0-9_-]{1,64}$/,
  b58: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
});

type Matcher = (segments: readonly string[]) => boolean;

// "/a/:cid/b" matches exactly three segments; a literal segment must be equal. A trailing "/**" matches one to
// six more segments, each a plain `slug` (used only for Novig's read-only public catalog prefix).
function compilePattern(pattern: string): Matcher {
  const open = pattern.endsWith("/**");
  const body = open ? pattern.slice(0, -3) : pattern;
  const parts = body === "" || body === "/" ? [] : body.slice(1).split("/");
  const tests = parts.map((part): ((segment: string) => boolean) => {
    if (part.startsWith(":")) {
      const kind = SEGMENT_KINDS[part.slice(1)];
      if (kind === undefined) throw new Error(`unknown placeholder in ${pattern}`);
      return (segment) => kind.test(segment);
    }
    return (segment) => segment === part;
  });
  return (segments) => {
    if (open) {
      if (segments.length < tests.length + 1 || segments.length > tests.length + 6) return false;
    } else if (segments.length !== tests.length) {
      return false;
    }
    return segments.every((segment, index) => {
      const test = tests[index];
      return test !== undefined ? test(segment) : (SEGMENT_KINDS["slug"] as RegExp).test(segment);
    });
  };
}

// ---- rules ----------------------------------------------------------------------------------------------------

export type QueryRule = (params: URLSearchParams) => boolean;
export type BodyRule = (parsed: unknown) => Refused | undefined;

interface Route {
  readonly method: "GET" | "POST";
  readonly kind: RouteKind;
  readonly pattern: string;
  readonly matches: Matcher;
  // undefined: any query that passed isSafeUpstreamQuery. A function narrows it. "none": no query at all.
  readonly query: QueryRule | "none" | undefined;
  readonly body: BodyRule | undefined;
}

function get(pattern: string, query?: QueryRule | "none"): Route {
  return { method: "GET", kind: "rest", pattern, matches: compilePattern(pattern), query, body: undefined };
}

// Query names that look like a credential are never forwarded, whatever the route: a secret in a URL would be
// logged by the venue and by every proxy on the way. The daemon attaches its own credentials as headers.
const CREDENTIAL_QUERY_NAME = /(?:^|[_-])(?:api[_-]?key|apikey|access[_-]?token|token|secret|signature|sig|auth|authorization|password|jwt|bearer)$/i;

export function queryNamesAreSafe(params: URLSearchParams): boolean {
  for (const name of params.keys()) {
    if (name === "" || name.length > 64 || CREDENTIAL_QUERY_NAME.test(name)) return false;
  }
  return true;
}

// ---- body rules -------------------------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const RPC_KEYS: ReadonlySet<string> = new Set(["jsonrpc", "id", "method", "params"]);
const RPC_METHODS: ReadonlySet<string> = new Set<string>(JSON_RPC_READ_METHODS);

const BAD_RPC: Refused = { code: "rpc_method_not_allowed", message: "Only read-only JSON-RPC calls of the fixed shape are allowed." };

function rpcCallOk(call: unknown): boolean {
  if (!isRecord(call)) return false;
  for (const key of Object.keys(call)) if (!RPC_KEYS.has(key)) return false;
  if (call["jsonrpc"] !== "2.0") return false;
  const method = call["method"];
  if (typeof method !== "string" || !RPC_METHODS.has(method)) return false;
  const id = call["id"];
  if (!(typeof id === "number" && Number.isSafeInteger(id)) && !(typeof id === "string" && id.length <= 64) && id !== null) return false;
  const params = call["params"];
  if (params !== undefined && (!Array.isArray(params) || params.length > 4)) return false;
  return true;
}

const jsonRpcBody: BodyRule = (parsed) => {
  const calls: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  if (calls.length === 0 || calls.length > MAX_RPC_BATCH) return BAD_RPC;
  return calls.every(rpcCallOk) ? undefined : BAD_RPC;
};

// Hyperliquid POST /info. Each type is read-only; each has a fixed key set. `coin` is an outcome side coin
// (`#<n>`) or an outcome token (`+<n>`), nothing free-form.
const HL_COIN = /^[#+][0-9]{1,12}$/;
const HL_USER = /^0x[0-9a-fA-F]{40}$/;
const HL_TYPES: Readonly<Record<string, (body: Record<string, unknown>) => boolean>> = Object.freeze({
  outcomeMeta: (body) => Object.keys(body).length === 1,
  allMids: (body) => Object.keys(body).every((key) => key === "type" || (key === "dex" && typeof body[key] === "string" && /^[a-z0-9]{0,16}$/.test(body[key] as string))),
  l2Book: (body) =>
    typeof body["coin"] === "string" &&
    HL_COIN.test(body["coin"]) &&
    Object.keys(body).every((key) => key === "type" || key === "coin" || ((key === "nSigFigs" || key === "mantissa") && Number.isInteger(body[key]) && (body[key] as number) >= 2 && (body[key] as number) <= 10)),
  settledOutcome: (body) => Number.isSafeInteger(body["outcome"]) && (body["outcome"] as number) >= 0 && Object.keys(body).length === 2 && "outcome" in body,
  spotClearinghouseState: (body) => typeof body["user"] === "string" && HL_USER.test(body["user"]) && Object.keys(body).length === 2,
  userFills: (body) =>
    typeof body["user"] === "string" &&
    HL_USER.test(body["user"]) &&
    Object.keys(body).every((key) => key === "type" || key === "user" || (key === "aggregateByTime" && typeof body[key] === "boolean")),
});
export const HYPERLIQUID_INFO_TYPES: readonly string[] = Object.freeze(Object.keys(HL_TYPES));

const hyperliquidInfoBody: BodyRule = (parsed) => {
  if (!isRecord(parsed)) return { code: "rpc_method_not_allowed", message: "Hyperliquid /info needs a JSON object with a known read-only type." };
  const type = parsed["type"];
  const check = typeof type === "string" && Object.hasOwn(HL_TYPES, type) ? HL_TYPES[type] : undefined;
  if (check === undefined || !check(parsed)) return { code: "rpc_method_not_allowed", message: "Hyperliquid /info needs a JSON object with a known read-only type." };
  return undefined;
};

// Polymarket CLOB batch reads: an array of { token_id } (and side for prices).
const TOKEN_ID = /^[0-9]{1,78}$/;
function clobBatchBody(withSide: boolean): BodyRule {
  return (parsed) => {
    const bad: Refused = { code: "invalid_request", message: "The batch body is not a list of token ids of the fixed shape." };
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_CLOB_BATCH) return bad;
    for (const entry of parsed) {
      if (!isRecord(entry) || typeof entry["token_id"] !== "string" || !TOKEN_ID.test(entry["token_id"])) return bad;
      for (const key of Object.keys(entry)) if (key !== "token_id" && !(withSide && key === "side")) return bad;
      if (withSide && entry["side"] !== "BUY" && entry["side"] !== "SELL") return bad;
    }
    return undefined;
  };
}

function post(kind: Exclude<RouteKind, "rest">, pattern: string, body: BodyRule, query: Route["query"] = "none"): Route {
  return { method: "POST", kind, pattern, matches: compilePattern(pattern), query, body };
}

const rpcRoutes = (...paths: string[]): Route[] => paths.map((path) => post("jsonrpc", path, jsonRpcBody));

// ---- the tables ------------------------------------------------------------------------------------------------------

// Blockscout-style explorer: the etherscan-compatible `/api` route is limited to read modules.
const explorerApiQuery: QueryRule = (params) => {
  const module = params.get("module");
  const action = params.get("action");
  return module !== null && ["logs", "account", "transaction", "stats"].includes(module) && action !== null && /^[A-Za-z]{1,32}$/.test(action);
};

const ROUTES: Readonly<Record<ReadService, readonly Route[]>> = Object.freeze({
  xo_data: [
    get("/api/markets"),
    get("/api/markets/contract/:cid"),
    get("/api/markets/slug/:slug"),
    get("/api/markets/:int"),
    get("/api/users/portfolio"),
  ],
  xo_explorer: [
    get("/api", explorerApiQuery),
    get("/api/v2/addresses/:addr"),
    get("/api/v2/addresses/:addr/token-balances"),
    get("/api/v2/addresses/:addr/token-transfers"),
    get("/api/v2/addresses/:addr/transactions"),
    get("/api/v2/tokens/:addr"),
    get("/api/v2/stats"),
  ],
  xo_rpc: rpcRoutes("/"),
  // /orders and /trades need the L2 HMAC triplet and are deliberately absent.
  xo_orderbook: [
    get("/book"),
    get("/price"),
    get("/last-trade-price"),
    get("/fee-rate"),
    get("/trading-state"),
    get("/time"),
    get("/markets/:cid"),
    get("/balance-allowance"),
    get("/positions"),
    get("/claimable"),
  ],
  polymarket_gamma: [
    get("/public-search"),
    get("/markets/keyset"),
    get("/markets/slug/:slug"),
    get("/markets/:int"),
    get("/public-profile"),
    get("/status"),
  ],
  polymarket_clob: [
    get("/book"),
    get("/price"),
    get("/midpoint"),
    get("/spread"),
    get("/time"),
    get("/tick-size"),
    get("/neg-risk"),
    get("/last-trade-price"),
    get("/prices-history"),
    get("/clob-markets/:cid"),
    get("/markets-by-token/:tok"),
    post("clob_batch", "/books", clobBatchBody(false)),
    post("clob_batch", "/prices", clobBatchBody(true)),
    post("clob_batch", "/midpoints", clobBatchBody(false)),
    post("clob_batch", "/spreads", clobBatchBody(false)),
  ],
  polymarket_data: [
    get("/v2/positions"),
    get("/v2/activity"),
    get("/v2/trades"),
    get("/v2/value"),
    get("/v2/user-pnl"),
    get("/v2/tokens"),
    get("/v2/status"),
  ],
  polymarket_us: [
    get("/v1/markets"),
    get("/v1/market/slug/:slug"),
    get("/v1/market/id/:slug"),
    get("/v1/markets/:slug/book"),
    get("/v1/markets/:slug/bbo"),
    get("/v1/markets/:slug/settlement"),
    get("/v1/events"),
    get("/v1/events/slug/:slug"),
    get("/v1/events/:slug"),
    get("/v1/search"),
    get("/v1/price-history"),
  ],
  manifold: [get("/v0/search-markets"), get("/v0/market/:slug"), get("/v0/slug/:slug"), get("/v0/markets")],
  pascal: [get("/api/v1/markets"), get("/api/v1/books"), get("/api/v1/time"), get("/api/v1/accounts/:b58")],
  hyperliquid_info: [post("hyperliquid_info", "/info", hyperliquidInfoBody)],
  hyperliquid_rpc: rpcRoutes("/", "/evm"),
  defillama: [get("/protocols"), get("/overview/dexs"), get("/overview/fees"), get("/overview/open-interest")],
  // Paid routes answer 402 without a key; the daemon never pays. /api/v1/portfolio (takes the user's wallet),
  // /api/v1/wallets/link, /api/auth/* (forecast requests cost $1 and send text to a third party) and the POST
  // routes are absent on purpose (dapp-design 4.7).
  quotient: [
    get("/api/public/performance"),
    get("/api/public/pricing"),
    get("/api/public/forecast-availability"),
    get("/api/public/forecast-targets"),
    get("/api/v1/markets"),
    get("/api/v1/markets/search"),
    get("/api/v1/markets/mispriced"),
    get("/api/v1/markets/lookup"),
    get("/api/v1/markets/:slug/intelligence"),
    get("/api/v1/markets/:slug/forecast"),
    get("/api/v1/signals"),
    get("/api/v1/signals/featured"),
    get("/api/v1/sources"),
    get("/api/v1/latest"),
  ],
  // Public catalog only. The account routes need a trading key that can place orders and are not listed.
  novig: [get("/v3/public/**")],
  gemini: [get("/v1/prediction-markets/events"), get("/v1/prediction-markets/events/:slug")],
  // Public routes only; `user-orders` needs an HMAC token and is not listed.
  limitless: [
    get("/markets/active"),
    get("/markets/:slug"),
    get("/markets/:slug/orderbook"),
    get("/portfolio/:addr/positions"),
    get("/portfolio/:addr/history"),
    get("/portfolio/:addr/pnl-chart"),
  ],
  // Public market data only. /trade-api/v2/portfolio/* is signed and is not listed.
  kalshi: [
    get("/trade-api/v2/exchange/status"),
    get("/trade-api/v2/markets"),
    get("/trade-api/v2/markets/orderbooks"),
    get("/trade-api/v2/markets/trades"),
    get("/trade-api/v2/markets/:slug"),
    get("/trade-api/v2/markets/:slug/orderbook"),
    get("/trade-api/v2/events"),
    get("/trade-api/v2/events/:slug"),
    get("/trade-api/v2/series"),
    get("/trade-api/v2/series/:slug"),
    get("/trade-api/v2/series/:slug/markets/:slug/candlesticks"),
  ],
  rpc_base: rpcRoutes("/"),
  rpc_polygon: rpcRoutes("/"),
  rpc_bnb: rpcRoutes("/"),
});

// ---- origins ----------------------------------------------------------------------------------------------------------

export type OriginMap = Readonly<Partial<Record<ReadService, string>>>;

function deriveOrigins(): Record<ReadService, string> {
  const out: Partial<Record<ReadService, string>> = {};
  for (const entry of BROWSER_DIRECT_ORIGINS) out[entry.service] = entry.origin;
  for (const entry of DAEMON_ONLY_ORIGINS) if (entry.service !== null) out[entry.service] = entry.origin;
  return out as Record<ReadService, string>;
}

// service -> origin, derived from app/headers.config.ts. A service with no entry cannot be reached.
export const SERVICE_ORIGINS: Readonly<Partial<Record<ReadService, string>>> = Object.freeze(deriveOrigins());

export function originOf(service: ReadService): string | undefined {
  return SERVICE_ORIGINS[service];
}

export function routesOf(service: ReadService): readonly { readonly method: "GET" | "POST"; readonly pattern: string; readonly kind: RouteKind }[] {
  return (ROUTES[service] ?? []).map((route) => ({ method: route.method, pattern: route.pattern, kind: route.kind }));
}

const SERVICE_SET: ReadonlySet<string> = new Set<string>(READ_SERVICES);
export function isReadService(value: string): value is ReadService {
  return SERVICE_SET.has(value);
}

// ---- the decision ----------------------------------------------------------------------------------------------------------

export interface RequestInput {
  readonly service: string;
  readonly method: string;
  // Absolute path, no query (as the daemon received it: escapes not decoded).
  readonly path: string;
  // Raw query without "?".
  readonly query: string;
  // The raw request body (POST).
  readonly body?: Uint8Array | string | undefined;
}

export interface DecideOptions {
  // Replaces the derived origins (tests that point the proxy at a loopback server). Never reachable from the wire.
  readonly origins?: OriginMap;
}

const MSG = {
  service: "That service is not on the read proxy's list.",
  path: "That path is not on the read proxy's list for this service.",
  method: "That method is not allowed for this service and path.",
  query: "That query is not allowed for this route.",
} as const;

function textOf(body: Uint8Array | string | undefined): string | undefined {
  if (body === undefined) return undefined;
  return typeof body === "string" ? body : new TextDecoder("utf-8", { fatal: false }).decode(body);
}

export function decide(input: RequestInput, options: DecideOptions = {}): Verdict {
  if (!isReadService(input.service)) return refuse("service_not_allowed", MSG.service);
  const service = input.service;
  const origin = options.origins?.[service] ?? SERVICE_ORIGINS[service];
  if (origin === undefined) return refuse("service_not_allowed", MSG.service);

  if (!isSafeUpstreamPath(input.path) || !isSafeUpstreamQuery(input.query)) return refuse("path_not_allowed", MSG.path);
  const segments = input.path === "/" ? [] : input.path.slice(1).replace(/\/$/, "").split("/");
  // A trailing slash is a different resource upstream; only the bare root may end in one.
  if (input.path !== "/" && input.path.endsWith("/")) return refuse("path_not_allowed", MSG.path);

  const candidates = (ROUTES[service] ?? []).filter((route) => route.matches(segments));
  if (candidates.length === 0) return refuse("path_not_allowed", MSG.path);
  const method = input.method === "GET" || input.method === "POST" ? input.method : undefined;
  const route = method === undefined ? undefined : candidates.find((candidate) => candidate.method === method);
  if (route === undefined || method === undefined) return refuse("method_not_allowed", MSG.method);

  const params = new URLSearchParams(input.query);
  if (route.query === "none") {
    if (input.query !== "") return refuse("path_not_allowed", MSG.query);
  } else {
    if (!queryNamesAreSafe(params)) return refuse("path_not_allowed", MSG.query);
    if (route.query !== undefined && !route.query(params)) return refuse("path_not_allowed", MSG.query);
  }

  let body: string | undefined;
  if (method === "POST") {
    const text = textOf(input.body);
    if (text === undefined || text.length === 0) return refuse("invalid_request", "A POST needs a JSON body.");
    if (text.length > MAX_REQUEST_BODY_BYTES) return refuse("invalid_request", "The body is too large.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return refuse("invalid_request", "A POST body must be valid JSON.");
    }
    const verdict = route.body?.(parsed);
    if (verdict !== undefined) return { ok: false, ...verdict };
    // Re-serialised: only what was checked goes upstream (no duplicate keys, no odd whitespace).
    body = JSON.stringify(parsed);
  } else if (input.body !== undefined && textOf(input.body) !== "") {
    return refuse("invalid_request", "A GET carries no body.");
  }

  const url = new URL(origin);
  return {
    ok: true,
    allowed: Object.freeze({
      service,
      origin: url.origin,
      host: url.host,
      method,
      path: input.path,
      query: input.query,
      url: `${url.origin}${input.path}${input.query === "" ? "" : `?${input.query}`}`,
      kind: route.kind,
      restricted: isRestrictedService(service),
      body,
    }),
  };
}
