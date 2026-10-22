import type { Collateral, VenueId } from "../../model.js";
import { BROWSER_DIRECT_ORIGINS, type ReadService } from "../origins.js";

// Everything about Polymarket that is a fixed fact, not logic. Every value below is read from
// docs/research/08-venues-polymarket-kalshi.md (H unless noted) and the recorded fixtures. A fact that can
// change at runtime (fees, ticks, geography) is read live or labelled with its date.

export const VENUE = "polymarket" as const satisfies VenueId;
export const ADAPTER_VERSION = "polymarket/0.1.0";

// The three origins this adapter names, read from sdk/venues/origins.ts, the single registry of venue hosts that
// the dApp's CSP (app/headers.config.ts) and the Cockpit's read proxy are built from, so a host can never be added
// here alone. The adapter builds absolute URLs and calls the injected fetch; the Cockpit build maps them onto
// /ui/read/<service>/... and the standalone build sends them straight to the host.
function originOf(service: ReadService): string {
  const entry = BROWSER_DIRECT_ORIGINS.find((candidate) => candidate.service === service && candidate.venue === "polymarket");
  if (entry === undefined) throw new Error(`sdk/venues/origins.ts registers no Polymarket origin for ${service}`);
  return entry.origin;
}
export const GAMMA_ORIGIN = originOf("polymarket_gamma");
export const CLOB_ORIGIN = originOf("polymarket_clob");
export const DATA_ORIGIN = originOf("polymarket_data");

// Data API v1 retires 2026-10-24; this adapter uses v2 only.
export const DATA_V2_PREFIX = "/v2";

// Polymarket settles on Polygon in pUSD (6 decimals, backed by USDC) since CLOB V2 went live on 2026-04-28.
// Positions sit in the user's own proxy or deposit wallet, a contract wallet.
export const COLLATERAL: Collateral = Object.freeze({
  symbol: "pUSD",
  chain: "eip155:137",
  decimals: 6,
  custody: "smart_account",
});

// Gamma keyset pages hold at most 100 rows (changelog 2026-05-14). A search page is large (about 100 KB per
// event), so it is capped lower.
export const MAX_LIST_LIMIT = 100;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 25;
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_PAGE = 200;
export const MAX_SEARCH_TEXT_CHARS = 200;
export const MAX_POSITIONS_LIMIT = 500;
export const DEFAULT_POSITIONS_LIMIT = 100;
export const MAX_POSITION_PAGES = 20;
export const MAX_CURSOR_CHARS = 2048;

// One GET /book per token: GET /books answered 400 live and the documented POST /books is untested (note 08
// V-B1), and the GET-only rule holds.
export const DEFAULT_BOOK_CONCURRENCY = 4;
export const MAX_BOOK_CONCURRENCY = 8;
export const MAX_DEADLINE_TIMER_MS = 60_000;

// Time to live of what each route returns, for Prov.ttlMs (dapp-design 4.8: books 15 s foreground, positions 30 s).
// Gamma answers carry cache-control: public, max-age=300, so a Gamma row can already be five minutes old when it
// arrives and its freshness is "recent", never "live".
export const TTL_MS = Object.freeze({ gamma: 60_000, book: 15_000, positions: 30_000 });

// Documented per-IP limits, requests per 10 s sliding window (note 08 2.6). core/ owns the token buckets; these
// are the numbers it needs. Cloudflare throttles rather than rejects, and Data API v2 answers 429 + Retry-After.
export const DOCUMENTED_LIMITS_PER_10S = Object.freeze({
  gammaGeneral: 4000,
  gammaMarkets: 300,
  gammaSearch: 350,
  clobBook: 1500,
  clobBooks: 500,
  dataGeneral: 800,
  dataTrades: 300,
  dataStatus: 100,
});

// Fee model facts (note 08 2.7): fee = C x rate x p x (1 - p), taker only, rounded to 5 dp ("Anything smaller rounds
// to zero"). The rounding MODE is not documented (docs.polymarket.com/trading/fees, read 2026-10-22), so the spec's
// rounding is the engine's ROUNDING_UNKNOWN (engine/fee-specs.ts polymarketFeeSpec) and no fee amount is derived.
export const FEE_TTL_SEC = 600;

// Rules: Polymarket's own void outcome is "Unknown/50-50": each token redeems 0.50 (note 08 2.10).
export const RULES_MAX_RAW_CHARS = 262_144;

// What a geoblock check would say, and why it is not done by default. See geoblock.ts.
export const GEOBLOCK_FACTS = Object.freeze({
  asOf: "2026-10-18",
  source: "docs.polymarket.com api-reference/geoblock, read in docs/research/08-venues-polymarket-kalshi.md section 2.11",
  blockedCompletely: Object.freeze(["IR", "SY", "CU", "KP", "Crimea", "Donetsk", "Luhansk"]),
  closeOnlyFrontendAndApi: Object.freeze([
    "AU", "BE", "BR", "CA-ON", "CA-BC", "CA-AB", "CA-QC", "FR", "DE", "IT", "PL", "RU", "SG", "TW", "TH", "GB", "US", "UM", "VE",
  ]),
  closeOnlyFrontendOnly: Object.freeze(["IE", "JP", "MT (sports)", "NL", "KR"]),
  note: "The documented list continues past these entries (\"and others\"). Close-only means existing positions can be closed and new ones cannot be opened. This is a dated venue fact, not an eligibility verdict for any user.",
});
