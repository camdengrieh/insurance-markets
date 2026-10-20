// Pascal (Solana): everything pinned in one place. Source: docs/research/venues/pascal.md (sections 4, 7, 12,
// 13), docs/dapp-design.md 4.2 and 4.6. Pascal is a noncustodial exchange with an off-chain central limit
// order book and on-chain settlement of USDC in a Solana program. There are no outcome tokens: a position is
// long (pays p) or short (pays 1 - p).

export const PASCAL_ORIGIN = "https://data.pascal.trade";
export const PASCAL_API_BASE = `${PASCAL_ORIGIN}/api/v1`;
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const PASCAL_READ_SERVICE = "pascal";
export const PASCAL_ADAPTER_VERSION = "pascal-0.1";

// CAIP-2 for Solana mainnet; the collateral is USDC (6 decimals).
export const PASCAL_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const PASCAL_COLLATERAL_SYMBOL = "USDC";
export const PASCAL_COLLATERAL_DECIMALS = 6;

// GET /books?symbols= takes at most 50 symbols.
export const PASCAL_BOOKS_MAX_SYMBOLS = 50;
// A /markets answer is about 6 MB (3,255 markets on 2026-10-19) and the daemon's proxy caps a body at 8 MiB.
// Past this many characters the body is refused instead of parsed.
export const PASCAL_MAX_BODY_CHARS = 9_000_000;

export const PASCAL_LIST_TTL_MS = 30_000;
export const PASCAL_FEE_TTL_SEC = 600;
// The venue's own state time may trail its server time (books can be up to a second stale, by its docs). More
// than this is reported as STALE rather than shown as live.
export const PASCAL_MAX_STATE_LAG_MS = 30_000;
// A list where more than this share of rows fail validation is a changed shape, not a few odd markets.
export const PASCAL_MAX_DROPPED_SHARE = 0.5;

export const PASCAL_LIST_PAGE_DEFAULT = 50;
export const PASCAL_LIST_PAGE_MAX = 200;

// Terms as read (research 12, 2026-06-16 version). The clause is about "Platform Data" use by professional or
// fintech entities; whether a personal-use viewer is inside it is unresolved, so the licence class is
// "unknown" and the settings screen shows this text.
export const PASCAL_TERMS_NOTE =
  "Pascal terms (as read): a Platform Data clause bars professional, fintech or data-distributor use of its prices; restricted jurisdictions include the US, UK, France, Germany, Italy, Netherlands, Singapore, Australia; no scraping outside its API.";

// What this adapter has and has not been checked against. `account_shape` is the one the UI must label.
export const PASCAL_VERIFICATION = Object.freeze({
  markets: "recorded 2026-10-19",
  books: "recorded 2026-10-19",
  account_shape: "synthetic-shape tested: the populated /accounts/{owner} answer was never observed (DT8)",
  rules_text: "not loaded: the rules live on a host outside the connect-src list",
});
