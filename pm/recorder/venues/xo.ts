// XO Market. Resolve: Data API GET /api/markets/contract/{conditionId} (status, expiry, outcome
// tokens, effectiveFeeConfig). Book: orderbook host GET /book?token_id= for the outcome-0 token.
// Both answers are read by the shared XO decoders (sdk/venues/xo/api/client.ts: decodeMarketDetail,
// decodeBook, lifecycleOf), so the recorder reads a market exactly as the dApp and the pm adapter do.
// Facts (docs/research/02 with its Verification): ACTIVE does not mean tradable (past expiresAt),
// and /fee-rate is not used because it returns 0 for every token. A crossed or locked book is
// refused, as the shared reader refuses it. Titles, rules and creator data are never kept.

import type { FeeConfig } from "../../../sdk/venues/xo/api/types.js";
import { decodeBook, decodeMarketDetail, lifecycleOf } from "../../../sdk/venues/xo/api/client.js";
import { formatMicro } from "../../../sdk/venues/xo/api/units.js";
import { bookOf, statusOfLifecycle } from "../../../sdk/venues/xo/index.js";
import type { FeeRecord, ResolvedMarket } from "../types.js";
import type { Parsed, RawBook, VenueCollector } from "./index.js";
import { isoToMs, recorderStatus, safeHash, safeTick } from "./common.js";

const DATA_HOST = "api-mainnet.xo.market";
const BOOK_HOST = "orderbooks.xo.market";

function feeOf(cfg: FeeConfig | null): FeeRecord {
  if (cfg === null) return { model: "unknown", params: {} };
  const params: Record<string, string> = { takerBps: String(cfg.takerFeeBps), makerBps: String(cfg.makerFeeBps) };
  const curve = cfg.curveModel;
  if (curve !== null && /^[A-Z_]{1,32}$/.test(curve)) params["curveModel"] = curve;
  return { model: "xo_effective", params };
}

export const xoCollector: VenueCollector = {
  venue: "xo",
  resolvePlan: (id) => [{ host: DATA_HOST, path: `/api/markets/contract/${encodeURIComponent(id)}`, purpose: "resolve" }],
  parseResolve(bodies, nowMs, marketId): Parsed<ResolvedMarket> {
    let detail;
    try {
      detail = decodeMarketDetail(bodies[0]);
    } catch {
      return { ok: false, reason: "market payload does not decode as an XO market" };
    }
    if (detail.conditionId.toLowerCase() !== marketId.toLowerCase()) return { ok: false, reason: "the payload describes another market" };
    const first = detail.outcomes.find((o) => o.index === 0);
    if (first === undefined) return { ok: false, reason: "no outcome-0 token id" };
    const closeMs = isoToMs(detail.expiresAt);
    const lifecycle = lifecycleOf(detail, nowMs);
    // ACTIVE past its expiry is not tradable: kept for the post-close grace period, not retired at once.
    const status = lifecycle === "expired_unresolved" ? "expired" : recorderStatus(statusOfLifecycle(lifecycle), closeMs, nowMs);
    return { ok: true, value: { tokenId: first.tokenId, status, closeMs, accepting: null, tick: null, fee: feeOf(detail.effectiveFeeConfig) } };
  },
  bookTarget: () => ({ host: BOOK_HOST, path: "/book", tokenParam: "token_id" }),
  bookPlan: (_id, tokenId) => ({ host: BOOK_HOST, path: "/book", query: { token_id: tokenId }, purpose: "book" }),
  parseBook(body, tokenId): Parsed<RawBook> {
    let decoded;
    try {
      decoded = decodeBook(body, tokenId);
    } catch {
      return { ok: false, reason: "book payload does not decode as an XO book for the requested token" };
    }
    const bestBid = decoded.bids[0];
    const bestAsk = decoded.asks[0];
    if (bestBid !== undefined && bestAsk !== undefined && bestBid.priceMicro >= bestAsk.priceMicro) return { ok: false, reason: "crossed or locked book refused" };
    const book = bookOf(decoded, decoded.timestampMs);
    return {
      ok: true,
      value: { bids: book.bids, asks: book.asks, venueTsMs: decoded.timestampMs, hash: safeHash(decoded.hash), tick: safeTick(formatMicro(decoded.tickSizeMicro)) },
    };
  },
};
