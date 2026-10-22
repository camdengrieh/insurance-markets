// Polymarket read adapter (docs/dapp-design.md 7.4 work package C2) and the one Polymarket parser set. Read-only: no
// order, no signature, no key. The pure parsers below are what every client uses (the dApp reader in this folder,
// the pm adapter in pm/adapters/polymarket.ts, the linker), so a Gamma row, a CLOB book, a fee or a status reads
// the same everywhere.
import * as z from "zod/v4";
import { isOpenUnitInterval, numericToDec, type Dec } from "./decimal.js";
import type { PageOutcome } from "./pages.js";
import type { ClobBookWire, GammaMarket } from "./schemas.js";

export { createPolymarketAdapter } from "./adapter.js";
export type {
  ListResult,
  PolymarketAdapter,
  PolymarketAdapterOptions,
  PositionsPage,
  PositionsQuery,
  RejectedRow,
  TokenCrossCheck,
} from "./adapter.js";
export { bestAsk, bestBid, complementBook, parseBook, venueTimestampMs } from "./book.js";
export type { BookOutcome } from "./book.js";
export { crossCheckClobTokens, parseClobMarketInfo } from "./clob.js";
export type { ClobInfoOutcome, ClobMarketInfo } from "./clob.js";
export {
  ADAPTER_VERSION,
  CLOB_ORIGIN,
  COLLATERAL,
  DATA_ORIGIN,
  DOCUMENTED_LIMITS_PER_10S,
  GAMMA_ORIGIN,
  GEOBLOCK_FACTS,
  TTL_MS,
} from "./constants.js";
export { cmpDec, numericToDec, parseDec } from "./decimal.js";
export { codeOf, isPolymarketError, PolymarketError } from "./errors.js";
export { GEOBLOCK_UNCHECKED_REASON, parseGeoblock, uncheckedGeoblock } from "./geoblock.js";
export type { GeoblockStatus } from "./geoblock.js";
export { isTokenId, selectTokenIds } from "./ids.js";
export type { Ledger, TokenIds } from "./ids.js";
export {
  clobFee,
  clobMarketUrl,
  feeDecimal,
  feeSpecOf,
  gammaFee,
  gammaSchemaHash,
  normalizeMarket,
  normalizeSummary,
  reconcileFees,
  resolutionSignal,
  rulesHash,
  statusOf,
  tradableOf,
} from "./normalize.js";
export type { FeeInput, Normalized, NormalizeContext, PolymarketFee, ReconciledFee, Signal } from "./normalize.js";
export { claimedConditionId, CURSOR, parseGammaMarket, parseKeysetPage, parseSearchPage, summarizeRow } from "./pages.js";
export type { PageOutcome, RowOutcome, SearchRow } from "./pages.js";
export { parsePositionRow, POSITION_QUERY_STATUSES, resolveOutcome, statusOfRow } from "./positions.js";
export type { PolymarketPosition, PositionQueryStatus, PositionStatus } from "./positions.js";
export { clobBookSchema, clobMarketInfoSchema, CONDITION_ID, gammaMarketSchema, gammaMarketsKeysetSchema, gammaSearchSchema, TOKEN_ID } from "./schemas.js";
export type { GammaEvent, GammaMarket } from "./schemas.js";

// ---- small readers for the routes and fields only the pm recorder reads ----------------------------------------------
// Kept here, beside the parsers above, so that every Polymarket payload is read by this one module.

// GET /events?active=true&closed=false&limit=&offset=&order=volume24hr&ascending=false: a bare list of events, each with
// its markets nested (recorded and trimmed: fixtures/gamma_events_list_trimmed_captured_2026-10-20.json). The event
// fields read are its flags, end date, 24 h volume and neg-risk id; the nested market rows are returned unparsed, for
// parseGammaMarket one at a time. An event that does not fit is left out and counted, so one odd event does not hide
// the page.
const gammaEventRowSchema = z.looseObject({
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  endDate: z.string().max(64).nullish(),
  volume24hr: z.number().nullish(),
  negRisk: z.boolean().nullish(),
  negRiskMarketID: z.string().max(80).nullish(),
  markets: z.array(z.unknown()).max(1000),
});
export type GammaEventRow = z.infer<typeof gammaEventRowSchema>;

export const MAX_EVENTS_PER_PAGE = 500;

export function parseEventsList(payload: unknown): PageOutcome<{ readonly events: readonly GammaEventRow[]; readonly rejected: number }> {
  if (!Array.isArray(payload) || payload.length > MAX_EVENTS_PER_PAGE) return { ok: false, reason: "the events answer is not a list" };
  const events: GammaEventRow[] = [];
  let rejected = 0;
  for (const row of payload as unknown[]) {
    const parsed = gammaEventRowSchema.safeParse(row);
    if (parsed.success) events.push(parsed.data);
    else rejected += 1;
  }
  return { ok: true, events, rejected };
}

// A market row's 24 h volume (`volume24hr`, a JSON number on the list and events routes), or null.
export function gammaVolume24h(row: GammaMarket): number | null {
  const value = (row as Record<string, unknown>)["volume24hr"];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// The tick a CLOB book states (`tick_size`, "0.01" in fixtures/clob_book_recorded_2026-10-18.json), or null when it is
// absent or not a price step.
export function clobBookTickSize(wire: ClobBookWire): Dec | null {
  const tick = numericToDec((wire as Record<string, unknown>)["tick_size"]);
  return tick !== null && isOpenUnitInterval(tick) ? tick : null;
}
