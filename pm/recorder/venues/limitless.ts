// Limitless (Base). Resolve: GET /markets/{slug} (tokens.yes, status, expiry). Book:
// GET /markets/{slug}/orderbook (YES-side book). Facts (docs/research/09 with its Verification):
// prices are JSON numbers in (0,1), sizes are raw 6-decimal integers (150000000 = 150 shares),
// and market-data rate limits are NOT FOUND, so the default budget is low. The page exposes only a
// boolean fee flag, not live fee parameters, so the fee is recorded as `limitless_flag` and the
// report treats the fee model as unknown (net edge not computed) rather than guessing.
// The expiry is read only from a numeric `expirationTimestamp`; the display date text
// ("Jan 1, 2027") has no zone and is ignored. Titles, descriptions and creator data are ignored.

import type { FeeRecord, ResolvedMarket } from "../types.js";
import type { Parsed, RawBook, VenueCollector } from "./index.js";
import { canonPrice, fromBaseUnits, isRecord, msFromUnknown, safeToken, statusFromWords } from "./common.js";

const HOST = "api.limitless.exchange";
const STATUS = { FUNDED: "active", ACTIVE: "active", RESOLVED: "resolved", CLOSED: "closed", EXPIRED: "expired", PAUSED: "paused" } as const;

export const limitlessCollector: VenueCollector = {
  venue: "limitless",
  resolvePlan: (id) => [{ host: HOST, path: `/markets/${encodeURIComponent(id)}`, purpose: "resolve" }],
  parseResolve(bodies, nowMs): Parsed<ResolvedMarket> {
    const m = bodies[0];
    if (!isRecord(m)) return { ok: false, reason: "market payload is not an object" };
    const tokens = m["tokens"];
    const tokenId = isRecord(tokens) ? safeToken(tokens["yes"]) : null;
    if (tokenId === null) return { ok: false, reason: "no yes token id" };
    let status = statusFromWords(m["status"], STATUS);
    const closeMs = msFromUnknown(m["expirationTimestamp"]);
    if (status === "active" && closeMs !== null && closeMs <= nowMs) status = "expired";
    const meta = m["metadata"];
    const fee: FeeRecord = isRecord(meta) && typeof meta["fee"] === "boolean" ? { model: "limitless_flag", params: { feeFlag: String(meta["fee"]) } } : { model: "unknown", params: {} };
    return { ok: true, value: { tokenId, status, closeMs, accepting: null, tick: null, fee } };
  },
  bookPlan: (id) => ({ host: HOST, path: `/markets/${encodeURIComponent(id)}/orderbook`, purpose: "book" }),
  parseBook(body): Parsed<RawBook> {
    if (!isRecord(body)) return { ok: false, reason: "book payload is not an object" };
    const bids = body["bids"];
    const asks = body["asks"];
    if (!Array.isArray(bids) || !Array.isArray(asks)) return { ok: false, reason: "book sides are not arrays" };
    return {
      ok: true,
      value: {
        bids: bids as RawBook["bids"],
        asks: asks as RawBook["asks"],
        venueTsMs: null,
        hash: null,
        tick: null,
        convention: "best_first",
        sizeOf: (v) => fromBaseUnits(v, 6),
        priceOf: canonPrice,
      },
    };
  },
};
