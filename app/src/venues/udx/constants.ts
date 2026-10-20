import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../../../headers.config";

// Underdog Exchange (UDX): everything pinned in one place. Source: docs/research/venues/underdog-udx.md
// (sections 4, 4d, 6, 9), docs/dapp-design.md 4.2, 4.6, 4.8 and fork F5. A CFTC-regulated US exchange (a
// designated contract market) whose catalog is mostly sports props and combos. It is US-only with a linked
// Underdog account, so the venue ships OFF and memory-only with a clause disclosure, like Kalshi.
//
// The API host sends no CORS header to a third-party origin (docs/dapp-design.md 4.2), so these reads run only
// through the local Cockpit's read proxy (transport T1). Six REST routes are public; this adapter uses three.
//
// WHERE THE HOST COMES FROM. headers.config.ts is the single source of truth for hosts, and it does not list UDX
// yet (no READ_SERVICES id, no origin entry). This adapter therefore names no host: it resolves one from that
// file and, until an entry exists, every call is refused with "origin_not_registered" before any request. The
// host to register is in docs/research/venues/underdog-udx.md section 4 (production REST), as a daemon-only origin.

export const UDX_ADAPTER_VERSION = "udx-0.1";
// Sent on every request (research section 4: omitting it selects the oldest supported version). The Cockpit's
// fetch forwards no venue headers today, so the daemon's proxy has to add it; a response that names another
// version is refused.
export const UDX_VERSION = "2026-07-15";

export const UDX_COLLATERAL_SYMBOL = "USD";
export const UDX_COLLATERAL_DECIMALS = 2;

// `GET /markets?limit<=100` (research section 4).
export const UDX_LIST_PAGE_MAX = 100;
export const UDX_LIST_PAGE_DEFAULT = 20;
export const UDX_LIST_TTL_MS = 30_000;
export const UDX_BOOK_TTL_MS = 15_000;
export const UDX_BOOK_DEPTH = 10;
export const UDX_MAX_DROPPED_SHARE = 0.5;
export const UDX_MAX_BODY_CHARS = 4_000_000;
// R9: a 401 or 403 pauses the venue for ten minutes. Core's pause table owns the policy; the adapter reports it.
export const UDX_PAUSE_MS = 10 * 60_000;

// The fee schedule is a venue document, not an API field: effective 2026-10-09, taker 0.07 x C x P x (1 - P),
// maker 0.0175 x the same, each rounded to the nearest cent with halves to even. It was read on 2026-10-19 and
// the spec carries that date with a fourteen-day ttl, so a stale copy fails closed by itself.
export const UDX_FEE_DOCUMENT_DATE = "2026-10-09";
export const UDX_FEE_READ_AT = "2026-10-19T00:00:00.000Z";
export const UDX_FEE_TTL_SEC = 14 * 24 * 3600;
export const UDX_TAKER_COEFFICIENT = "0.07";
export const UDX_MAKER_COEFFICIENT = "0.0175";
export const UDX_FEE_STATUS = "static_document" as const;

// Clause shown before the venue can be switched on. Mirrors core/venue-policy.ts, which is the source for the
// disclosure screen.
export const UDX_TERMS_NOTE =
  "Underdog Exchange (as read): a US-only product that needs a linked Underdog account; the documented API is the approved route and scraping the web app is not. Treated as reference prices for your own use only: kept in memory, never exported. This adapter is off by default.";

// What this adapter has and has not been checked against. The UI labels the unverified items.
export const UDX_VERIFICATION = Object.freeze({
  market_list: "recorded 2026-10-19 (three single-leg rows)",
  market_detail: "recorded 2026-10-19 (one market)",
  order_book: "recorded 2026-10-19 (two markets, five levels a side)",
  combos: "recorded 2026-10-19 (two rows): not modelled, skipped",
  fee: "static_document: the schedule effective 2026-10-09, read on 2026-10-19, fails closed after fourteen days",
  version_header: "sent, but the Cockpit's fetch drops venue headers; the daemon's proxy must pin it",
  status_values: "documented set only (unopened, open, paused, closed, expired); anything else is unknown",
  host: "not in headers.config.ts yet: every call is refused until a daemon-only origin entry exists",
  volume: "none: the market routes carry no volume, open interest or last price",
  positions: "not built: key-gated",
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
