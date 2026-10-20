// Polymarket (international). Resolve: Gamma GET /markets?condition_ids= (token ids, status,
// end date, tick, per-market feeSchedule). Book: CLOB GET /book?token_id= for the outcome-0 token.
// Facts (docs/research/08 with its Verification): the CLOB book lists its best level LAST, sizes
// are decimal strings, the timestamp is epoch ms, and the fee comes from the market's own
// feeSchedule, never from /fee-rate. Gamma returns clobTokenIds as JSON text. Titles and
// descriptions are ignored.
// Unverified here: the exact query-parameter spelling for a single condition id (the docs list
// `condition_ids[]`); tests use a fixture and a local fake server only.

import type { FeeRecord, ResolvedMarket } from "../types.js";
import type { Parsed, RawBook, VenueCollector } from "./index.js";
import { canonDec, isoToMs, isRecord, msFromUnknown, safeHash, safeTick, safeToken } from "./common.js";

const GAMMA = "gamma-api.polymarket.com";
const CLOB = "clob.polymarket.com";

function feeOf(m: Record<string, unknown>): FeeRecord {
  const schedule = m["feeSchedule"];
  const enabled = m["feesEnabled"];
  if (enabled === false) return { model: "polymarket_schedule", params: { feesEnabled: "false", rate: "0", exponent: "1" } };
  if (!isRecord(schedule)) return { model: "unknown", params: {} };
  const rate = canonDec(schedule["rate"]);
  const exponent = canonDec(schedule["exponent"]);
  if (rate === null || exponent === null) return { model: "unknown", params: {} };
  return {
    model: "polymarket_schedule",
    params: { rate, exponent, takerOnly: String(schedule["takerOnly"] === true), feesEnabled: String(enabled === true) },
  };
}

function tokenIds(raw: unknown): string[] | null {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const ids = (list as unknown[]).map(safeToken);
  return ids.every((x): x is string => x !== null) ? ids : null;
}

// Gamma serves outcomes as JSON text. Only compared in memory, never stored.
function outcomeLabels(raw: unknown): string[] | null {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || !(list as unknown[]).every((x) => typeof x === "string")) return null;
  return list as string[];
}

export const polymarketCollector: VenueCollector = {
  venue: "polymarket",
  resolvePlan: (id) => [{ host: GAMMA, path: "/markets", query: { condition_ids: id }, purpose: "resolve" }],
  parseResolve(bodies, nowMs, marketId): Parsed<ResolvedMarket> {
    const list = bodies[0];
    // The condition filter could be ignored or misspelled: take the element that IS the market.
    const want = marketId.toLowerCase();
    const m = Array.isArray(list)
      ? (list as unknown[]).find((x) => isRecord(x) && typeof x["conditionId"] === "string" && x["conditionId"].toLowerCase() === want)
      : undefined;
    if (!isRecord(m)) return { ok: false, reason: "the response holds no market with the requested condition id" };
    // docs/research/08: choose the token field by market version, even when both are present.
    const version = m["version"];
    if (version !== "v1" && version !== "v2") return { ok: false, reason: "market version is missing or unknown; token ids cannot be chosen" };
    const ids = tokenIds(version === "v1" ? m["clobTokenIds"] : m["positionIds"]);
    const tokenId = ids?.[0];
    if (tokenId === undefined) return { ok: false, reason: "no outcome-0 token id" };
    // The recorder follows outcome 0. A market that lists No first would feed the wrong side into
    // every sum, so it is refused; non-yes/no labels make no claim and are accepted.
    const labels = outcomeLabels(m["outcomes"]);
    if (labels === null || labels.length !== 2) return { ok: false, reason: "outcomes are missing or not binary" };
    if (labels[0]?.toLowerCase() === "no" && labels[1]?.toLowerCase() === "yes") {
      return { ok: false, reason: "outcome 0 is No; the recorder follows outcome 0 and would record the wrong side" };
    }
    const closeMs = isoToMs(m["endDate"]);
    const accepting = typeof m["acceptingOrders"] === "boolean" ? m["acceptingOrders"] : null;
    let status: ResolvedMarket["status"] = "unknown";
    if (m["closed"] === true || m["archived"] === true) status = "closed";
    else if (m["active"] === true) status = accepting === false ? "paused" : "active";
    if (status === "active" && closeMs !== null && closeMs <= nowMs) status = "expired";
    return { ok: true, value: { tokenId, status, closeMs, accepting, tick: safeTick(m["orderPriceMinTickSize"]), fee: feeOf(m) } };
  },
  bookPlan: (_id, tokenId) => ({ host: CLOB, path: "/book", query: { token_id: tokenId ?? "<yes_token_id>" }, purpose: "book" }),
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
        convention: "best_last",
      },
    };
  },
};

