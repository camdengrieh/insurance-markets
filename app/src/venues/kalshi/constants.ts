import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../../../headers.config";

// Kalshi (USD, CFTC-regulated): everything pinned in one place. Source: docs/research/08-venues-polymarket-kalshi.md
// section 4, docs/dapp-design.md 4.2, 4.6, 4.8 (R3, R5, R8, R10) and fork F5.
//
// RESTRICTED TERMS. Kalshi's Developer Agreement (v1.1, 2023-11, possibly superseded) bars collecting, caching,
// aggregating or storing API data except for the user's own trading or monitoring. So this adapter ships OFF,
// keeps nothing (it has no cache and no storage), is excluded from the day-zero daemon list, and its rows are
// memory-only and never exported. The host answers 403 whenever an Origin header is present, so it is reached
// only through the local Cockpit's plain, Origin-free client (service "kalshi").

export const KALSHI_ADAPTER_VERSION = "kalshi-0.1";
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const KALSHI_READ_SERVICE = "kalshi";
export const KALSHI_API_PREFIX = "/trade-api/v2";

export const KALSHI_COLLATERAL_SYMBOL = "USD";
export const KALSHI_COLLATERAL_DECIMALS = 2;

export const KALSHI_LIST_PAGE_MAX = 100;
export const KALSHI_LIST_PAGE_DEFAULT = 20;
export const KALSHI_LIST_TTL_MS = 30_000;
export const KALSHI_BOOK_TTL_MS = 15_000;
export const KALSHI_FEE_TTL_SEC = 600;
export const KALSHI_MAX_DROPPED_SHARE = 0.5;
export const KALSHI_MAX_BODY_CHARS = 4_000_000;
// R9: a 403 pauses the venue for ten minutes. Core's pause table owns the policy; the adapter reports it.
export const KALSHI_PAUSE_MS = 10 * 60_000;

// The taker coefficient comes from third-party fee guides (docs/research/08 section 4, tag M); the venue's own
// schedule PDF could not be read. It is consistent with the venue's published rounding example
// (0.07 x 0.055 x 0.945 = 0.00363825). The number is data the UI shows with this status, not a fact.
export const KALSHI_TAKER_COEFFICIENT = "0.07";
export const KALSHI_FEE_STATUS = "coefficient_unconfirmed" as const;
// Fee inputs this adapter does not read: both can change the fee a trade pays.
export const KALSHI_FEE_UNCHECKED = Object.freeze(["scheduled series fee changes", "event-level fee overrides"]);

// Clause shown before the venue can be switched on. Mirrors core/venue-policy.ts; the policy table is the
// source for the disclosure screen, this constant is for tests and docs.
export const KALSHI_TERMS_NOTE =
  "Kalshi Developer Agreement (as read, possibly superseded): collecting, caching, aggregating or storing API data is barred except for your own trading or monitoring. Whether an anonymous public read counts as API use is unresolved. This adapter is off by default and keeps nothing.";

// What this adapter has and has not been checked against. The UI labels the unverified items.
export const KALSHI_VERIFICATION = Object.freeze({
  market_list: "shape read from the venue docs and checked once by hand by the research notes; no response is kept in the repo",
  order_book: "shape (orderbook_fp) read from the venue docs and checked once by hand by the research notes; no response is kept in the repo",
  exchange_status: "shape read from the venue docs and checked once by hand by the research notes; no response is kept in the repo",
  market_detail: "assumed { market } wrapper around a list row; the single-market route has not been checked",
  event_and_series: "shape read from the venue docs and checked once by hand by the research notes; no response is kept in the repo",
  fee: "coefficient_unconfirmed: taker 0.07 times fee_multiplier from third-party guides; scheduled and event fee changes are not read",
  status_values: "documented set only (initialized, active, inactive, closed, determined, disputed, finalized); anything else is unknown",
  positions: "not built: signed routes only, the user's own key is out of scope for this release",
});

// A registry row, as headers.config.ts lists it (the part this lookup reads).
export interface OriginRow {
  readonly origin: string;
  readonly venue: string;
  readonly service: string | null;
}

// The origin comes from headers.config.ts (the single source of truth for hosts); this module names none. A venue
// with no entry, or with two different origins, has none (fail closed).
export function registeredOrigin(venue: string, entries: readonly OriginRow[] = [...BROWSER_DIRECT_ORIGINS, ...DAEMON_ONLY_ORIGINS]): string | null {
  const found = new Set<string>();
  for (const entry of entries) {
    if (entry.venue === venue && entry.service !== null) found.add(entry.origin);
  }
  if (found.size !== 1) return null;
  return checkedOrigin([...found][0] ?? "");
}

// https, no credentials, no port, no path: an origin and nothing else.
export function checkedOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "/") return null;
  return url.origin;
}
