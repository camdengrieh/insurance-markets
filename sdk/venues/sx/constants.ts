import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../origins.js";

// SX Bet: everything pinned in one place. Source: docs/research/venues/sx-bet.md (sections 2, 3, 6, 8),
// docs/dapp-design.md 4.2 and 4.6. A sports-heavy peer-to-peer exchange on its own rollup (chain 4162, USDC),
// built from binary markets. The API host sends no CORS header to a third-party origin, so these reads run only
// through the local Cockpit's read proxy (transport T1). The market list needs no key; the order-book routes do,
// EXCEPT the legacy snapshot route this adapter uses, which the changelog says gets "a much stricter rate limit"
// on 2026-12-01.
//
// WHERE THE HOST COMES FROM. sdk/venues/origins.ts is the single source of truth for hosts, and it does not list SX
// Bet yet (no READ_SERVICES id, no origin entry). This adapter therefore names no host: it resolves one from
// that file and, until an entry exists, every call is refused with "origin_not_registered" before any request.
// The host to register is in docs/research/venues/sx-bet.md section 3 (REST mainnet), as a daemon-only origin.

export const SX_ADAPTER_VERSION = "sx-0.1";
export const SX_CHAIN = "eip155:4162";
export const SX_COLLATERAL_SYMBOL = "USDC";
export const SX_COLLATERAL_DECIMALS = 6;

// `GET /markets/active?pageSize<=100` (research section 3).
export const SX_LIST_PAGE_MAX = 100;
export const SX_LIST_PAGE_DEFAULT = 20;
export const SX_LIST_TTL_MS = 30_000;
export const SX_BOOK_TTL_MS = 15_000;
export const SX_MAX_DROPPED_SHARE = 0.5;
export const SX_MAX_BODY_CHARS = 4_000_000;
// R9: a 401 or 403 pauses the venue for ten minutes. Core's pause table owns the policy; the adapter reports it.
export const SX_PAUSE_MS = 10 * 60_000;

// Odds are the maker's own implied probability times 1e20 (research section 2).
export const ODDS_SCALE = 20;
export const ODDS_ONE = 10n ** 20n;
// Orders sit on a 0.125 percent ladder (oddsLadderStepSize 125, in units of 1e15), with the two documented
// exceptions 0.1 percent and 99.9 percent. A level off the ladder is not a level this adapter understands.
export const ODDS_LADDER_STEP = 125n * 10n ** 15n;
export const ODDS_EXCEPTIONS: readonly bigint[] = Object.freeze([10n ** 17n, 999n * 10n ** 17n]);
// Display tick: the ladder step as a probability.
export const SX_TICK = "0.00125";

export const SX_TERMS_NOTE =
  "SX Bet terms (as read, not verified against the current text): not available in the United States, the United Kingdom, Ontario, Australia and about twenty other jurisdictions; scraping the web app is barred, the documented API is the invited route. Facts about the venue, not an eligibility verdict.";

// What this adapter has and has not been checked against. The UI labels the unverified items.
export const SX_VERIFICATION = Object.freeze({
  market_list: "recorded 2026-10-19 (three rows, trimmed)",
  market_find: "recorded 2026-10-19 (one crypto market)",
  legacy_order_book: "recorded 2026-10-19 (two markets); the maker-frame reading comes from the docs and from the book being uncrossed only under that reading, not from a fill",
  fee: "unknown: the per-account rate is a keyed route; about 1 percent of winnings is the documented default",
  status_values: "ACTIVE only; every other value is unknown",
  host: "not in sdk/venues/origins.ts yet: every call is refused until a daemon-only origin entry exists",
  positions: "not built: key-gated",
});

// A registry row, as sdk/venues/origins.ts lists it (the part this lookup reads).
export interface OriginRow {
  readonly origin: string;
  readonly venue: string;
  readonly service: string | null;
}

// The origin comes from sdk/venues/origins.ts (the single source of truth for hosts); this module names none. A venue
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
