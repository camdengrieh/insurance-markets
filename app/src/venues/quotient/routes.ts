import { isSafeUpstreamPath, isSafeUpstreamQuery } from "@bridge/contract";

import type { CacheClass } from "../../core/cache";
import { parseQty, cmpQty } from "../../core/money";
import type { Dec } from "../../core/ports";
import { MARKET_KEY, QUOTIENT_ORIGIN, QUOTIENT_VENUES, type QuotientVenue } from "./constants";

// The routes the client can call, and nothing else. A route is a row of this table; the URL builders are the only
// way a URL is made, they validate every parameter against a closed list or a strict pattern, and they throw
// RouteParamError on anything else, so a hostile or mistyped value never becomes a path, a parameter or a second
// request (research 12 section 10.2: the endpoint plan is minimal and cost-aware).
//
// Deliberately absent, with the reason (a test pins this list):
//   /api/v1/portfolio            takes the user's wallet address and would hand it to a third party
//   /api/auth/forecast-requests  costs $1 and sends market text (an XO market's rules) to a third party
//   /api/v1/x/search, /x/profile $1 each, not prediction-market data
//   /api/v1/wallets/link         links a wallet to an account
//   /api/v1/markets/{slug}/signals  article evidence, NOT trade signals (the stale endpoint list)
//   /api/v1/markets/{key}/forecast  one market's forecast ($0.01): not built; the lookup route carries the same forecast
//   /api/v1/signals/perps        deprecated alias of price outlooks
//   /api/public/forecast-availability  about 30 s, never on a page's path
//   /api/v1/feeds/*              enterprise key, webhook delivery

export const ROUTE_IDS = ["performance", "signals", "mispriced", "lookup"] as const;
export type RouteId = (typeof ROUTE_IDS)[number];

export interface RouteSpec {
  readonly id: RouteId;
  readonly paid: boolean;
  // The table price in USD. The 402 challenge is authoritative; this is what the UI shows BEFORE the press and the
  // base of the amount ceiling.
  readonly priceUsd: Dec;
  readonly cacheClass: CacheClass;
  // What the request tells Quotient, for the disclosure next to the press.
  readonly sends: string;
}

export const ROUTES: Readonly<Record<RouteId, RouteSpec>> = Object.freeze({
  performance: { id: "performance", paid: false, priceUsd: "0", cacheClass: "quotient_performance", sends: "nothing about you" },
  signals: { id: "signals", paid: true, priceUsd: "0.01", cacheClass: "quotient_lists", sends: "the filters you chose" },
  mispriced: { id: "mispriced", paid: true, priceUsd: "0.02", cacheClass: "quotient_lists", sends: "the filters you chose" },
  lookup: { id: "lookup", paid: true, priceUsd: "0.005", cacheClass: "quotient_lists", sends: "the market keys you look up (which markets you are interested in)" },
});

export function isRouteId(value: unknown): value is RouteId {
  return typeof value === "string" && (ROUTE_IDS as readonly string[]).includes(value);
}

export class RouteParamError extends Error {
  readonly param: string;
  constructor(param: string) {
    super(`invalid value for ${param}`);
    this.name = "RouteParamError";
    this.param = param;
  }
}

// ---- parameter types ---------------------------------------------------------------------------------------------------------

export const SIGNAL_STATUSES = ["active", "ineligible", "in_play", "retired"] as const;
export const MISPRICED_SORTS = ["spread_desc", "spread_asc", "updated_desc", "volume_desc", "quality"] as const;
// Only these two venues get verified live quotes, so only they are worth a $0.02 scan.
export const MISPRICED_VENUES = ["polymarket", "kalshi"] as const;

export interface SignalsParams {
  readonly status?: (typeof SIGNAL_STATUSES)[number];
  readonly windowHours?: number;
  readonly minConviction?: 1 | 2 | 3;
  readonly minCapacityUsd?: Dec;
  readonly excludeDrawdownRisk?: boolean;
  readonly venue?: QuotientVenue;
}

export interface MispricedParams {
  readonly venue?: (typeof MISPRICED_VENUES)[number];
  readonly minSpread?: Dec;
  readonly maxForecastAgeHours?: number;
  readonly sort?: (typeof MISPRICED_SORTS)[number];
}

export interface LookupParams {
  readonly marketKeys: readonly string[];
}

export type RouteParams = {
  readonly performance: Record<string, never>;
  readonly signals: SignalsParams;
  readonly mispriced: MispricedParams;
  readonly lookup: LookupParams;
};

// ---- builders -----------------------------------------------------------------------------------------------------------------

export interface BuiltRequest {
  readonly route: RouteId;
  readonly url: string;
  readonly path: string;
  readonly query: string;
}

function intIn(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new RouteParamError(name);
  return value;
}

function oneOf<T extends string>(name: string, value: unknown, list: readonly T[]): T {
  if (typeof value !== "string" || !(list as readonly string[]).includes(value)) throw new RouteParamError(name);
  return value as T;
}

function decIn(name: string, value: unknown, min: Dec, max: Dec): Dec {
  const qty = parseQty("price", value);
  const low = parseQty("price", min);
  const high = parseQty("price", max);
  if (qty === null || low === null || high === null || cmpQty(qty, low) < 0 || cmpQty(qty, high) > 0) throw new RouteParamError(name);
  return typeof value === "string" ? value : "";
}

// A marketKey travels in a path segment or a comma list: `#` is percent-encoded, the colon stays readable.
export function encodeMarketKey(key: unknown, name = "marketKey"): string {
  if (typeof key !== "string" || !MARKET_KEY.test(key)) throw new RouteParamError(name);
  return encodeURIComponent(key).replace(/%3A/gi, ":");
}

function build(route: RouteId, path: string, pairs: ReadonlyArray<readonly [string, string]>): BuiltRequest {
  // Alphabetical, so the same request is the same string (cache key, tests).
  const sorted = [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = sorted.map(([key, value]) => `${key}=${value}`).join("&");
  // Belt and braces: the daemon's proxy applies the same predicates, so a URL it would refuse never leaves the page.
  if (!isSafeUpstreamPath(path) || !isSafeUpstreamQuery(query)) throw new RouteParamError("url");
  return Object.freeze({ route, url: `${QUOTIENT_ORIGIN}${path}${query === "" ? "" : `?${query}`}`, path, query });
}

const enc = encodeURIComponent;

export function buildRequest<R extends RouteId>(route: R, params: RouteParams[R]): BuiltRequest {
  switch (route) {
    case "performance":
      return build("performance", "/api/public/performance", []);
    case "signals": {
      const p = params as SignalsParams;
      const pairs: Array<readonly [string, string]> = [];
      if (p.status !== undefined) pairs.push(["status", oneOf("status", p.status, SIGNAL_STATUSES)]);
      if (p.windowHours !== undefined) pairs.push(["window", String(intIn("window", p.windowHours, 1, 168))]);
      if (p.minConviction !== undefined) pairs.push(["min_conviction", String(intIn("min_conviction", p.minConviction, 1, 3))]);
      if (p.minCapacityUsd !== undefined) pairs.push(["min_capacity_usd", enc(decIn("min_capacity_usd", p.minCapacityUsd, "0", "1000000000"))]);
      if (p.excludeDrawdownRisk !== undefined) {
        if (typeof p.excludeDrawdownRisk !== "boolean") throw new RouteParamError("exclude_drawdown_risk");
        pairs.push(["exclude_drawdown_risk", String(p.excludeDrawdownRisk)]);
      }
      if (p.venue !== undefined) pairs.push(["venue", oneOf("venue", p.venue, QUOTIENT_VENUES)]);
      return build("signals", "/api/v1/signals", pairs);
    }
    case "mispriced": {
      const p = params as MispricedParams;
      const pairs: Array<readonly [string, string]> = [];
      if (p.venue !== undefined) pairs.push(["venue", oneOf("venue", p.venue, MISPRICED_VENUES)]);
      if (p.minSpread !== undefined) pairs.push(["min_spread", enc(decIn("min_spread", p.minSpread, "0.01", "0.5"))]);
      if (p.maxForecastAgeHours !== undefined) pairs.push(["max_forecast_age", String(intIn("max_forecast_age", p.maxForecastAgeHours, 1, 168))]);
      if (p.sort !== undefined) pairs.push(["sort", oneOf("sort", p.sort, MISPRICED_SORTS)]);
      return build("mispriced", "/api/v1/markets/mispriced", pairs);
    }
    case "lookup": {
      const p = params as LookupParams;
      if (!Array.isArray(p.marketKeys) || p.marketKeys.length < 1 || p.marketKeys.length > 10) throw new RouteParamError("market_keys");
      const keys = p.marketKeys.map((key) => encodeMarketKey(key, "market_keys"));
      if (new Set(keys).size !== keys.length) throw new RouteParamError("market_keys");
      return build("lookup", "/api/v1/markets/lookup", [["market_keys", keys.join(",")]]);
    }
    default:
      throw new RouteParamError("route");
  }
}

// What the daemon's read proxy (bridge/allowlist.ts, service "quotient") must allow, and nothing more: GET only.
export const UPSTREAM_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  /^\/api\/public\/performance$/,
  /^\/api\/v1\/signals$/,
  /^\/api\/v1\/markets\/mispriced$/,
  /^\/api\/v1\/markets\/lookup$/,
]);

// Paths that must never be built, whatever the caller says (tests assert none of them matches an allowed pattern).
export const FORBIDDEN_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  /\/portfolio/,
  /\/forecast-requests/,
  /\/auth\//,
  /\/x\/(?:search|profile)/,
  /\/wallets\//,
  /\/signals\/perps/,
  /\/forecast-availability/,
  /\/feeds\//,
  /\/markets\/[^/]+\/signals$/,
  /\/markets\/[^/]+\/forecast$/,
]);
