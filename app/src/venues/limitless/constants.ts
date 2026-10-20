import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../../../headers.config";

// Limitless (Base): everything pinned in one place. Source: docs/research/09-venues-onchain-clob.md section 2.3,
// docs/dapp-design.md 4.2 and 4.6. A CLOB on Base with Yes/No outcome tokens; the public order-book route
// returns the YES side only. The host answers no CORS header to a third-party origin, so these reads run only
// through the local Cockpit's read proxy (service "limitless", transport T1).

export const LIMITLESS_ADAPTER_VERSION = "limitless-0.1";
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const LIMITLESS_READ_SERVICE = "limitless";

export const LIMITLESS_CHAIN = "eip155:8453";
export const LIMITLESS_COLLATERAL_SYMBOL = "USDC";
export const LIMITLESS_COLLATERAL_DECIMALS = 6;
// Native USDC on Base. A market that names any other collateral token is not modelled.
export const BASE_USDC_LOWER = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// `GET /markets/active` answers 400 above 25 rows per page (docs/research/09, check 9).
export const LIMITLESS_LIST_PAGE_MAX = 25;
export const LIMITLESS_LIST_PAGE_DEFAULT = 20;
export const LIMITLESS_LIST_TTL_MS = 30_000;
export const LIMITLESS_BOOK_TTL_MS = 15_000;
// A list where more than this share of the modelled rows fails validation is a changed shape.
export const LIMITLESS_MAX_DROPPED_SHARE = 0.5;
export const LIMITLESS_MAX_BODY_CHARS = 4_000_000;
// R9: a 403 pauses the venue for ten minutes. Core's pause table owns the policy; the adapter reports it.
export const LIMITLESS_PAUSE_MS = 10 * 60_000;
// The token index (token id -> market) is bounded; past this it is cleared rather than grown.
export const LIMITLESS_TOKEN_INDEX_MAX = 5_000;

// Terms as read (ToS of 2026-09-15, docs/research/09 section 2.3 and 4): bots and market making are allowed
// with rules; the product is not available in the United States, Ontario or Alberta (and one more
// jurisdiction). Shown as a dated venue fact, never as an eligibility verdict.
export const LIMITLESS_TERMS_NOTE =
  "Limitless terms (as read, 2026-09-15): automation through the official API is invited; wash trading, spoofing and multi-account use are barred. Not available in the United States, Ontario or Alberta.";

// What this adapter has and has not been checked against. The UI labels the unverified items.
export const LIMITLESS_VERIFICATION = Object.freeze({
  market_detail: "recorded 2026-10-19 (one market, trimmed)",
  order_book: "recorded 2026-10-19 (one market)",
  list_envelope: "inferred, not recorded: { data: [...], totalMarketsCount } from the research notes and the OpenAPI path list",
  tick: "inferred from the recorded book (three decimal places); the venue's tick was never read",
  fee: "unknown: a 0.40 to 3.00 percent range is documented, the model is not machine-readable",
  positions: "not built: the populated public positions answer was never recorded (DT8)",
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
