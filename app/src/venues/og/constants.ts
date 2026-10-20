// OG (OG.com Markets / Crypto.com | Derivatives North America / Nadex: one CFTC-regulated exchange, North American
// Derivatives Exchange, Inc.): everything pinned in one place.
// Source: docs/research/venues/crypto-com-derivatives-north-america-cdna-and-og-og-com.md (read 2026-10-19),
// docs/dapp-design.md 4.6 and 4.8.
//
// A REFERENCE-PRICE venue, OFF by default (fork F5). The exchange's public market-data routes carry no licence text
// that was found, and its sibling data feed (a different host, not used here) is "personal, non-commercial". So this
// adapter reads the public FCM market-data routes only, keeps what it reads in memory, and refuses to run until the
// user has switched it on and accepted the disclosure.
//
// HOST NOT IN THE CSP YET. The public API lives on a Crypto.com host that app/headers.config.ts does not list (that
// file is the single source of every origin the app may name, and this stream does not own it). So the origin is NOT
// written in this source: the adapter takes it as an option, and the wiring code passes it from headers.config.ts
// once a reviewed change adds a service "og" there (`ogOriginFrom`). Until then every call answers NOT_SUPPORTED
// ("origin_not_configured") and sends nothing.

export const OG_ADAPTER_VERSION = "og-0.1";
// The READ_SERVICES id the missing headers.config.ts entry should use.
export const OG_READ_SERVICE = "og";
// The path prefix of the public market-data routes on that host (no host, no scheme).
export const OG_PUBLIC_PATH = "/fcm/v1/public";

export const OG_LIST_TTL_MS = 15_000;
export const OG_BOOK_TTL_MS = 5_000;
export const OG_FEE_TTL_SEC = 30 * 24 * 3600;
export const OG_FEE_VERIFIED_AT = "2026-10-19T00:00:00.000Z";
export const OG_TAKER_COEFFICIENT = "0.07";
export const OG_MAKER_COEFFICIENT = "0.0175";
// Categories whose fee is a flat $0.02 a contract (help.og.com fee table), which the port's curve models do not fit.
export const OG_FLAT_FEE_CATEGORIES: readonly string[] = Object.freeze(["crypto", "fx", "commodities", "equity indices"]);

// A list page asks for this many events (default) and reads their instruments one event at a time. One event can
// list several hundred instruments (an NFL game listed 873), so each event is capped by the venue's own limit.
export const OG_EVENTS_DEFAULT = 5;
export const OG_EVENTS_MAX = 25;
export const OG_INSTRUMENTS_LIMIT = 1000;
export const OG_INSTRUMENT_PAGES_MAX = 3;
export const OG_TICKERS_PER_CALL = 100;
export const OG_MARKETS_PER_EVENT = 12;
export const OG_BOOK_DEPTH = 20;
// A book older than this against the injected clock is STALE, not live.
export const OG_MAX_BOOK_AGE_MS = 5 * 60_000;

export const OG_TERMS_NOTE =
  "OG (as read): no licence text was found for the public FCM market-data routes; the sibling data-api feed is licensed for personal, non-commercial use and bars bots, redistribution and AI use (not used here); trading needs a KYC'd FCM account. Prices here are reference prices for your own use.";

export const OG_VERIFICATION = Object.freeze({
  shapes: "recorded 2026-10-19 (events, instruments, tickers, book, trades, lifecycle) from the research fixtures",
  live: "not run: the opt-in drift suite (APP_LIVE=1) was written and not executed; the origin is supplied by the caller",
  lifecycle: "the public tradable flag is not reliable for lifecycle; no lifecycle feed is read, so status is 'active' only as listed",
  fees: "help-centre table, not an API field; customer region and category decide the real fee",
});
