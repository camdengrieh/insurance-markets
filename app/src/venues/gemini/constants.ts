// Gemini Predictions (Gemini Titan, a CFTC-regulated exchange): everything pinned in one place.
// Source: docs/research/venues/gemini-predictions.md (read 2026-10-19), docs/dapp-design.md 4.6 and 4.8.
//
// A REFERENCE-PRICE venue, OFF by default (fork F5). Gemini's API agreement calls its market data proprietary and
// ties it to a separate Market Data Agreement whose text was not found, so the adapter reads the public events route
// only, keeps what it reads in memory, and refuses to run until the user has switched it on and accepted the
// disclosure. It has no order books: depth is a WebSocket feature, and the app's CSP allows no WebSocket.

export const GEMINI_ORIGIN = "https://api.gemini.com";
export const GEMINI_API_BASE = `${GEMINI_ORIGIN}/v1/prediction-markets`;
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const GEMINI_READ_SERVICE = "gemini";
export const GEMINI_ADAPTER_VERSION = "gemini-0.1";

// Public limit: 120 requests a minute, 1 a second recommended (core/budget.ts holds the bucket).
export const GEMINI_LIST_TTL_MS = 30_000;
export const GEMINI_DETAIL_TTL_MS = 30_000;

// A sports game event embeds every child market (spreads, totals, props): limit=3 returned 1.1 MB on 2026-10-19.
// The page is kept small so one answer stays far under the 8 MiB body cap.
export const GEMINI_PAGE_DEFAULT = 10;
export const GEMINI_PAGE_MAX = 20;
export const GEMINI_MAX_OFFSET = 100_000;

// The taker/maker curve of the fee page, for contracts listed on or after this date (earlier ones differ).
export const GEMINI_FEE_SCHEDULE_FROM = "2026-03-18T00:00:00.000Z";
// Read from gemini.com/fees/predictions on this date. It is a documentation fact, not an API field, so it expires:
// 30 days after this date the spec reads "unknown" until the constants are re-checked.
export const GEMINI_FEE_VERIFIED_AT = "2026-10-19T00:00:00.000Z";
export const GEMINI_FEE_TTL_SEC = 30 * 24 * 3600;
export const GEMINI_TAKER_COEFFICIENT = "0.07";
export const GEMINI_MAKER_COEFFICIENT = "0.0175";

export const GEMINI_TERMS_NOTE =
  "Gemini (as read): market data is proprietary and subject to a separate Market Data Agreement (text not found); the API Agreement bars derivative products; trading needs a KYC'd US Gemini account. Prices here are reference prices for your own use.";

export const GEMINI_VERIFICATION = Object.freeze({
  shapes: "recorded 2026-10-19 (events list, one event, crypto ladder and up/down, settled events)",
  live: "not run: the opt-in drift suite (APP_LIVE=1) was written and not executed",
  fees: "documented schedule, not an API field; the maker promotion (zero maker fee to 2026-12-31) is not in the API",
  depth: "WebSocket only; not available in this build",
});
