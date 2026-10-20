// Novig (Ludlow Exchange, a CFTC-regulated exchange for US sports event contracts): everything pinned in one place.
// Source: docs/research/venues/novig.md (read 2026-10-19), docs/dapp-design.md 4.6 and 4.8.
//
// A REFERENCE-PRICE venue. Novig is OFF by default (fork F5): its terms for the unauthenticated /v3/public routes
// were never read (the terms page sat behind a captcha), the routes are marked hidden in the official spec, and a
// trading key can place orders. So this adapter reads the public catalog only, keeps what it reads in memory, and
// refuses to run until the user has switched it on and accepted the disclosure.

import type { TickRanges } from "../../core/ports";

export const NOVIG_ORIGIN = "https://api.novig.com";
export const NOVIG_API_BASE = `${NOVIG_ORIGIN}/v3/public`;
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const NOVIG_READ_SERVICE = "novig";
export const NOVIG_ADAPTER_VERSION = "novig-0.1";

// Edge caches: types 3600 s, events 15 s, books 5 s. Poll no faster; the budget in core/budget.ts is 1 per second.
export const NOVIG_LIST_TTL_MS = 15_000;
export const NOVIG_EVENTS_TTL_MS = 30_000;
export const NOVIG_MARKET_TTL_MS = 30_000;
export const NOVIG_BOOK_TTL_MS = 5_000;
export const NOVIG_FEE_TTL_SEC = 1_800;
export const NOVIG_BOOK_DEPTH = 20;
export const NOVIG_PAGE_DEFAULT = 20;
export const NOVIG_PAGE_MAX = 100;
// How many events one titles request asks for (the route accepts up to 5,000 with a key; the public cap was not read).
export const NOVIG_EVENTS_FETCH_LIMIT = 500;

// Market types worth listing as reference prices by default: the moneyline, spread and total of a game.
export const NOVIG_DEFAULT_MARKET_TYPES: readonly string[] = Object.freeze(["MONEY", "SPREAD", "TOTAL"]);

// The documented price grid (docs.novig.com/api/concepts/money): 0.001 to 0.050 step 0.001, 0.055 to 0.945 step
// 0.005, 0.950 to 0.999 step 0.001.
export const NOVIG_TICK_RANGES: TickRanges = Object.freeze([
  Object.freeze({ from: "0.001", to: "0.050", tick: "0.001" }),
  Object.freeze({ from: "0.055", to: "0.945", tick: "0.005" }),
  Object.freeze({ from: "0.950", to: "0.999", tick: "0.001" }),
]);

// Quantities are in API units of one cent of payout: qty 100 pays $1.00. Sizes are shown in shares (contracts that
// pay $1), so qty / 100.
export const NOVIG_QTY_DECIMALS = 2;
export const NOVIG_COLLATERAL_DECIMALS = 5;

// Terms as read. Fixed text for the disclosure screen; not legal advice.
export const NOVIG_TERMS_NOTE =
  "Novig (as read): the unauthenticated /v3/public routes are marked hidden in the official spec and no terms statement for them was found; the Member Agreement allows trading only for your own account; US-only, 21+, KYC accounts. Prices here are reference prices for your own use.";

// What was and was not checked against the live service. The UI shows `shapes`.
export const NOVIG_VERIFICATION = Object.freeze({
  shapes: "recorded 2026-10-19 (events, markets, one book, trades) from the research fixtures",
  live: "not run: the opt-in drift suite (APP_LIVE=1) was written and not executed",
  unverified: "eventStatus filter values and comma lists, the public events limit, ETag behaviour, and rules text (the public catalog carries none)",
});
