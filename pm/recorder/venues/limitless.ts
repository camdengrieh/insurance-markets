// Limitless (Base). Resolve: GET /markets/{slug} (tokens.yes, status, expiry). Book:
// GET /markets/{slug}/orderbook (YES-side book). Both answers are read by the shared Limitless parser
// (sdk/venues/limitless: parseDetailBody, parseBookBody, statusOf, expiryMs), so the recorder reads a
// market exactly as the dApp does: the answer must be for the requested slug and book token, prices in
// (0,1), sizes in 6-decimal base units (150000000 = 150 shares), a crossed book or a level on the wrong
// side refused. Facts (docs/research/09 with its Verification): market-data rate limits are NOT FOUND,
// so the default budget is low. The page exposes only a boolean fee flag, not live fee parameters, so
// the fee is recorded as `limitless_flag` and the report treats the fee model as unknown (net edge not
// computed) rather than guessing. The expiry is read only from a numeric millisecond
// `expirationTimestamp`; the display date text ("Jan 1, 2027") has no zone and is ignored. Titles,
// descriptions and creator data are never kept.

import { bookOf, expiryMs, limitlessFeeFlag, parseBookBody, parseDetailBody, statusOf } from "../../../sdk/venues/limitless/index.js";
import type { FeeRecord, ResolvedMarket } from "../types.js";
import type { Parsed, RawBook, VenueCollector } from "./index.js";
import { recorderStatus } from "./common.js";

const HOST = "api.limitless.exchange";

export const limitlessCollector: VenueCollector = {
  venue: "limitless",
  resolvePlan: (id) => [{ host: HOST, path: `/markets/${encodeURIComponent(id)}`, purpose: "resolve" }],
  parseResolve(bodies, nowMs, marketId): Parsed<ResolvedMarket> {
    const read = parseDetailBody(bodies[0], marketId);
    if (!read.ok) return { ok: false, reason: `market refused by the shared parser (${read.error} ${read.detail})` };
    const row = read.value;
    const closeMs = expiryMs(row.expirationTimestamp);
    // The shared table has one closed state, FUNDED past its expiry: that is "expired" here (post-close grace).
    const shared = statusOf(row, nowMs);
    const status = shared === "closed" ? "expired" : recorderStatus(shared, closeMs, nowMs);
    const flag = limitlessFeeFlag(row);
    const fee: FeeRecord = flag === null ? { model: "unknown", params: {} } : { model: "limitless_flag", params: { feeFlag: String(flag) } };
    return { ok: true, value: { tokenId: row.tokens.yes, status, closeMs, accepting: null, tick: null, fee } };
  },
  bookTarget: (id) => ({ host: HOST, path: `/markets/${encodeURIComponent(id)}/orderbook`, tokenParam: null }),
  bookPlan: (id) => ({ host: HOST, path: `/markets/${encodeURIComponent(id)}/orderbook`, purpose: "book" }),
  parseBook(body, tokenId): Parsed<RawBook> {
    const read = parseBookBody(body, tokenId);
    // An answer with two empty sides is still an observation: it is stored as an empty book.
    if (!read.ok && read.error !== "EMPTY_BOOK") return { ok: false, reason: `book refused by the shared parser (${read.error} ${read.detail})` };
    const book = bookOf("yes", tokenId, read.ok ? read.value : { bids: [], asks: [] }, 0);
    return { ok: true, value: { bids: book.bids, asks: book.asks, venueTsMs: null, hash: null, tick: null } };
  },
};
