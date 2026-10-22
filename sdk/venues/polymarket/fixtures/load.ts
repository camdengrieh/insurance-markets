// Recorded inputs for the Polymarket adapter's tests. Imported only by tests (a JSON import needs no Node API, so this
// file is safe under the bundle boundary checks).
//
// RECORDED = a live capture of 2026-10-18 from docs/research/fixtures/polymarket, copied here byte for byte
//            (*_recorded_2026-10-18.json), so the SDK's tests read nothing outside sdk/.
// CAPTURED = a live capture of 2026-10-20 committed next to this file (see README.txt).
// No hand-written venue answer is committed: no populated positions, no profile and no geoblock answer exists here.

import clobBookJson from "./clob_book_recorded_2026-10-18.json";
import clobMarketInfoJson from "./clob_market_info_recorded_2026-10-18.json";
import dataTokensJson from "./data_v2_tokens_recorded_2026-10-18.json";
import gammaEventsKeysetJson from "./gamma_events_keyset_recorded_2026-10-18.json";
import gammaMarketBySlugJson from "./gamma_market_by_slug_recorded_2026-10-18.json";
import gammaMarketsListJson from "./gamma_markets_list_recorded_2026-10-18.json";
import gammaPublicSearchJson from "./gamma_public_search_recorded_2026-10-18.json";
import dataTokensSenateCapturedJson from "./data_v2_tokens_senate_captured_2026-10-20.json";
import gammaMarketsKeysetCapturedJson from "./gamma_markets_keyset_captured_2026-10-20.json";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type Json = Record<string, unknown>;

// RECORDED
export const SENATE_CONDITION_ID = "0x86bfb53af7250a40928975c551d12c185b762fa4ce0b40c6a64a50c946d72587";
export const SENATE_YES = "51939490109676186832507970701169130490548061087912630009168726706475001411420";
export const SENATE_NO = "108587038225191871355030577171066853142535232042155117887981453750193713427381";
export const SENATE_SLUG = "will-the-republican-party-control-the-senate-after-the-2026-midterm-elections";

export const recorded = {
  senateMarket: (): Json => clone(gammaMarketBySlugJson) as Json,
  // Two sports markets from the legacy /markets list: a bare array, both version "v1" with BOTH id lists present.
  marketsList: (): Json[] => clone(gammaMarketsListJson) as Json[],
  eventsKeyset: (): Json => clone(gammaEventsKeysetJson) as Json,
  publicSearch: (): Json => clone(gammaPublicSearchJson) as Json,
  senateBook: (): Json => clone(clobBookJson) as Json,
  senateClobInfo: (): Json => clone(clobMarketInfoJson) as Json,
  senateTokens: (): Json => clone(dataTokensJson) as Json,
};

// The keyset envelope, captured live on 2026-10-20 (gamma_markets_keyset_captured_2026-10-20.json: two markets and a
// next_cursor). Tests that need a different page of RECORDED rows, or a particular cursor, put those rows and that
// cursor into this envelope; every other envelope key stays as the venue sent it.
export function keysetEnvelope(rows: Json[], nextCursor: string | null): Json {
  return { ...clone(gammaMarketsKeysetCapturedJson as Json), markets: rows, next_cursor: nextCursor };
}

// The two keyset markets exactly as captured on 2026-10-20.
export const captured = {
  keysetMarkets: (): Json[] => clone((gammaMarketsKeysetCapturedJson as { markets: Json[] }).markets),
  // GET /v2/tokens?condition=<Senate>: both the Yes and the No row.
  senateTokens: (): Json => clone(dataTokensSenateCapturedJson) as Json,
};
