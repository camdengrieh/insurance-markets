// XO Market. Resolve: Data API GET /api/markets/contract/{conditionId} (status, expiry, outcome
// tokens, effectiveFeeConfig). Book: orderbook host GET /book?token_id= for the outcome-0 token.
// Facts (docs/research/02 with its Verification): levels are best-first decimal strings, the
// timestamp is epoch milliseconds, ACTIVE does not mean tradable (past expiresAt), and /fee-rate
// is not used because it returns 0 for every token. Titles, rules and creator data are ignored.

import type { FeeRecord, ResolvedMarket } from "../types.js";
import type { Parsed, RawBook, VenueCollector } from "./index.js";
import { canonDec, field, isoToMs, isRecord, msFromUnknown, safeHash, safeTick, safeToken, statusFromWords } from "./common.js";

const DATA_HOST = "api-mainnet.xo.market";
const BOOK_HOST = "orderbooks.xo.market";

const STATUS = {
  ACTIVE: "active",
  PENDING: "pending",
  PAUSED: "paused",
  EXPIRED: "expired",
  CLOSED: "closed",
  RESOLVED: "resolved",
  SETTLED: "resolved",
  CANCELLED: "closed",
  CANCELED: "closed",
} as const;

function feeOf(cfg: unknown): FeeRecord {
  if (!isRecord(cfg)) return { model: "unknown", params: {} };
  const params: Record<string, string> = {};
  const taker = canonDec(cfg["takerFeeBps"]);
  const maker = canonDec(cfg["makerFeeBps"]);
  if (taker !== null) params["takerBps"] = taker;
  if (maker !== null) params["makerBps"] = maker;
  const curve = cfg["curveModel"];
  if (typeof curve === "string" && /^[A-Z_]{1,32}$/.test(curve)) params["curveModel"] = curve;
  return taker === null ? { model: "unknown", params } : { model: "xo_effective", params };
}

export const xoCollector: VenueCollector = {
  venue: "xo",
  resolvePlan: (id) => [{ host: DATA_HOST, path: `/api/markets/contract/${encodeURIComponent(id)}`, purpose: "resolve" }],
  parseResolve(bodies, nowMs): Parsed<ResolvedMarket> {
    const m = bodies[0];
    if (!isRecord(m)) return { ok: false, reason: "market payload is not an object" };
    const outcomes = field(m, "outcomes");
    const first = Array.isArray(outcomes) ? (outcomes as unknown[]).find((o) => field(o, "index") === 0) : undefined;
    const tokenId = safeToken(field(first, "outcomeTokenId"));
    if (tokenId === null) return { ok: false, reason: "no outcome-0 token id" };
    let status = statusFromWords(m["status"], STATUS);
    const closeMs = isoToMs(m["expiresAt"]);
    // ACTIVE with a past expiry is not tradable.
    if (status === "active" && closeMs !== null && closeMs <= nowMs) status = "expired";
    return { ok: true, value: { tokenId, status, closeMs, accepting: null, tick: null, fee: feeOf(m["effectiveFeeConfig"]) } };
  },
  bookPlan: (_id, tokenId) => ({ host: BOOK_HOST, path: "/book", query: { token_id: tokenId ?? "<yes_token_id>" }, purpose: "book" }),
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
        venueTsMs: msFromUnknown(body["timestamp"]),
        hash: safeHash(body["hash"]),
        tick: safeTick(body["tick_size"]),
        convention: "best_first",
      },
    };
  },
};
