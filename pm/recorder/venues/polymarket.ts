// Polymarket (international). Resolve: Gamma GET /markets?condition_ids= (token ids, status,
// end date, tick, per-market feeSchedule). Book: CLOB GET /book?token_id= for the outcome-0 token.
// Both answers are read by the shared Polymarket parser (sdk/venues/polymarket: parseGammaMarket,
// selectTokenIds, statusOf, clobBookSchema, parseBook), so the recorder reads a market exactly as the
// dApp and the pm adapter do: exactly two outcomes, the token field chosen by market version, the
// status from the flags and the UMA history, and a crossed, duplicated or malformed book refused.
// Facts (docs/research/08 with its Verification): the fee comes from the market's own feeSchedule,
// never from /fee-rate. Titles and descriptions are never kept.
// Unverified here: the exact query-parameter spelling for a single condition id (the docs list
// `condition_ids[]`); tests use a fixture and a local fake server only.

import {
  claimedConditionId,
  clobBookSchema,
  clobBookTickSize,
  numericToDec,
  parseBook,
  parseGammaMarket,
  selectTokenIds,
  statusOf,
  venueTimestampMs,
  type GammaMarket,
} from "../../../sdk/venues/polymarket/index.js";
import type { FeeRecord, ResolvedMarket } from "../types.js";
import type { Parsed, RawBook, VenueCollector } from "./index.js";
import { canonDec, isoToMs, recorderStatus, safeHash, safeTick } from "./common.js";

const GAMMA = "gamma-api.polymarket.com";
const CLOB = "clob.polymarket.com";

function feeOf(m: GammaMarket): FeeRecord {
  if (m.feesEnabled === false) return { model: "polymarket_schedule", params: { feesEnabled: "false", rate: "0", exponent: "1" } };
  const schedule = m.feeSchedule;
  if (schedule === null || schedule === undefined) return { model: "unknown", params: {} };
  const rate = canonDec(schedule.rate);
  const exponent = canonDec(schedule.exponent);
  if (rate === null || exponent === null) return { model: "unknown", params: {} };
  return {
    model: "polymarket_schedule",
    params: { rate, exponent, takerOnly: String(schedule.takerOnly), feesEnabled: String(m.feesEnabled === true) },
  };
}

export const polymarketCollector: VenueCollector = {
  venue: "polymarket",
  resolvePlan: (id) => [{ host: GAMMA, path: "/markets", query: { condition_ids: id }, purpose: "resolve" }],
  parseResolve(bodies, nowMs, marketId): Parsed<ResolvedMarket> {
    const list = bodies[0];
    // The condition filter could be ignored or misspelled: take the element that IS the market.
    const want = marketId.toLowerCase();
    const row = Array.isArray(list) ? (list as unknown[]).find((x) => claimedConditionId(x) === want) : undefined;
    if (row === undefined) return { ok: false, reason: "the response holds no market with the requested condition id" };
    const parsed = parseGammaMarket(row);
    if (!parsed.ok) return { ok: false, reason: "the market does not match the shared Gamma market shape (two outcomes, ids, flags)" };
    const m = parsed.value;
    // docs/research/08: choose the token field by market version, even when both are present.
    const tokens = selectTokenIds({ version: m.version, clobTokenIds: m.clobTokenIds, positionIds: m.positionIds, outcomeCount: m.outcomes.length });
    if (!tokens.ok) return { ok: false, reason: tokens.reason };
    const tokenId = tokens.ids[0];
    if (tokenId === undefined) return { ok: false, reason: "no outcome-0 token id" };
    // The recorder follows outcome 0. A market that lists No first would feed the wrong side into
    // every sum, so it is refused; non-yes/no labels make no claim and are accepted.
    if (m.outcomes[0]?.toLowerCase() === "no" && m.outcomes[1]?.toLowerCase() === "yes") {
      return { ok: false, reason: "outcome 0 is No; the recorder follows outcome 0 and would record the wrong side" };
    }
    const closeMs = isoToMs(m.endDate);
    const accepting = typeof m.acceptingOrders === "boolean" ? m.acceptingOrders : null;
    const status = recorderStatus(statusOf(m, nowMs), closeMs, nowMs, accepting);
    return { ok: true, value: { tokenId, status, closeMs, accepting, tick: safeTick(numericToDec(m.orderPriceMinTickSize)), fee: feeOf(m) } };
  },
  bookTarget: () => ({ host: CLOB, path: "/book", tokenParam: "token_id" }),
  bookPlan: (_id, tokenId) => ({ host: CLOB, path: "/book", query: { token_id: tokenId }, purpose: "book" }),
  parseBook(body, tokenId): Parsed<RawBook> {
    const wire = clobBookSchema.safeParse(body);
    if (!wire.success) return { ok: false, reason: "book payload does not match the shared CLOB book shape" };
    const read = parseBook(wire.data, tokenId, 0);
    // An answer with two empty sides is still an observation: it is stored as an empty book.
    if (!read.ok && read.error !== "EMPTY_BOOK") return { ok: false, reason: "book refused by the shared parser (another token, a bad, duplicated or crossed level)" };
    const sides = read.ok ? { bids: read.book.bids, asks: read.book.asks } : { bids: [], asks: [] };
    return {
      ok: true,
      value: {
        ...sides,
        venueTsMs: venueTimestampMs(wire.data.timestamp) ?? null,
        hash: safeHash(wire.data.hash),
        tick: safeTick(clobBookTickSize(wire.data)),
      },
    };
  },
};
