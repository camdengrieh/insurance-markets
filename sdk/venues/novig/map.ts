import { sha256, toBytes } from "viem";

import { addQty, cmpQty, fromAtomic, parseQty, subQty, toDec, type Qty } from "../../money/qty.js";
import type { Book, Collateral, FeeSpec, Level, Market, MarketGroup, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status, VoidPolicy } from "../../model.js";
import { untrustedField } from "../../text.js";
import { makeProv } from "../policy.js";
import {
  NOVIG_ADAPTER_VERSION,
  NOVIG_API_BASE,
  NOVIG_COLLATERAL_DECIMALS,
  NOVIG_FEE_TTL_SEC,
  NOVIG_LIST_TTL_MS,
  NOVIG_QTY_DECIMALS,
  NOVIG_TICK_RANGES,
} from "./constants.js";
import { ONE_PRICE, isoOfMs, openUnitPrice } from "./shared.js";
import { FEE_ROUNDING_PLACES } from "./fee.js";
import { SCHEMA_DESCRIPTOR, type NovigBook, type NovigEvent, type NovigMarket } from "./schemas.js";

export const NOVIG_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({ symbol: "USD", chain: "offchain", decimals: NOVIG_COLLATERAL_DECIMALS, custody: "venue" });

// ---- ids and refs ----------------------------------------------------------------------------------------------------

export function refOf(market: NovigMarket): MarketRef {
  const native: Record<string, string> = { eventId: market.eventId, marketType: market.marketType };
  if (market.strike !== undefined) native.strike = market.strike;
  if (market.voids !== undefined) native.voids = market.voids.slice(0, 40);
  if (market.startsTs !== undefined) native.startsTs = String(market.startsTs);
  return { venue: "novig", marketId: market.marketId, native };
}

// ---- titles ------------------------------------------------------------------------------------------------------------

// The market's own description is a team code ("PHI"); the human text lives on the event ("Dallas Cowboys @
// Philadelphia Eagles"). The docs say not to parse descriptions, and nothing here does: they are only joined for
// display, then sanitised as untrusted text. Without the event the title is the code and the market type alone.
export function titleTextOf(market: NovigMarket, event: NovigEvent | undefined): string {
  return event === undefined ? `${market.description} (${market.marketType})` : `${event.description}: ${market.description} (${market.marketType})`;
}

// ---- status ------------------------------------------------------------------------------------------------------------

const LIVE_EVENT = new Set(["OPEN_PREGAME", "OPEN_INGAME"]);

// Market status OPEN, CLOSED, SETTLED (docs/research/venues/novig.md section 7), refined by the event status when it
// is known. SETTLED is provisional ("determined") unless the event is FINAL, because a settlement can be reopened by
// remediation. Anything else fails closed to "unknown".
export function statusOf(market: NovigMarket, eventStatus: string | undefined): Status {
  switch (market.status) {
    case "OPEN":
      if (eventStatus === undefined || LIVE_EVENT.has(eventStatus)) return "active";
      if (eventStatus === "DELAYED") return "paused";
      if (eventStatus === "CLOSED_PREGAME") return "closed";
      if (eventStatus === "CANCELED") return "voided";
      return "unknown";
    case "CLOSED":
      return eventStatus === "CANCELED" ? "voided" : "closed";
    case "SETTLED": {
      if (eventStatus === "CANCELED") return "voided";
      const grades = market.outcomes.map((outcome) => outcome.status);
      const wins = grades.filter((grade) => grade === "WIN").length;
      const isFmv = (grade: string): boolean => /^[01](?:\.[0-9]+)?$/.test(grade);
      let kind: Status;
      if (grades.every((grade) => grade === "WIN" || grade === "LOSS") && wins === 1) kind = "resolved";
      // PUSH or an FMV price on any outcome is a void-style settlement; TBD left over means it is being regraded.
      else if (grades.every((grade) => grade === "WIN" || grade === "LOSS" || grade === "PUSH" || isFmv(grade)) && grades.some((grade) => grade === "PUSH" || isFmv(grade))) kind = "voided";
      else return "unknown";
      return eventStatus === "FINAL" ? kind : "determined";
    }
    default:
      return "unknown";
  }
}

// What a port status asks the venue for (event status). Statuses the venue cannot express return null: the caller
// sends no request for them and says so (no silent empty page).
export function eventStatusFor(status: Status, includeLive: boolean): readonly string[] | null {
  switch (status) {
    case "active":
      return includeLive ? ["OPEN_PREGAME", "OPEN_INGAME"] : ["OPEN_PREGAME"];
    case "paused":
      return ["DELAYED"];
    case "closed":
      return ["CLOSED_PREGAME"];
    case "determined":
      return ["SETTLED"];
    case "resolved":
      return ["FINAL"];
    case "voided":
      return ["CANCELED"];
    default:
      return null;
  }
}

// ---- outcomes ----------------------------------------------------------------------------------------------------------

// An order names an outcome, and the outcomes array order is not fixed (match by id). The yes and no roles are given
// only to a two-outcome market whose outcomes are literally named Yes and No; team codes, Over and Under, and a
// market where only one name matches, are labels.
function yesNoRoles(market: NovigMarket): ReadonlyMap<string, "yes" | "no"> {
  const roles = new Map<string, "yes" | "no">();
  if (market.outcomes.length !== 2) return roles;
  const yes = market.outcomes.find((outcome) => outcome.name === "Yes");
  const no = market.outcomes.find((outcome) => outcome.name === "No");
  if (yes !== undefined && no !== undefined) {
    roles.set(yes.outcomeId, "yes");
    roles.set(no.outcomeId, "no");
  }
  return roles;
}

export function outcomesOf(market: NovigMarket): readonly Outcome[] {
  const roles = yesNoRoles(market);
  return market.outcomes.map((outcome, index) => ({
    index,
    role: roles.get(outcome.outcomeId) ?? "label",
    label: untrustedField("outcome", outcome.name, "novig"),
    tokenId: outcome.outcomeId,
  }));
}

// The catalog carries no price. A list row has no display price rather than an invented one.
export function outcomeSummariesOf(market: NovigMarket): readonly OutcomeSummary[] {
  return outcomesOf(market).map((outcome) => ({ ...outcome, displayPrice: null }));
}

// ---- fee ---------------------------------------------------------------------------------------------------------------

const CHARGED = new Set(["WHEN_LIVE", "ALWAYS"]);
// The documented coefficients are 0.03 to 0.10. Anything above a quarter is not read as a fee coefficient.
const MAX_COEFFICIENT = parseQty("price", "0.25") as Qty;

export function feeSpecOf(market: NovigMarket, nowMs: number): FeeSpec {
  const unknown: FeeSpec = {
    venue: "novig",
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${NOVIG_API_BASE}/catalog/markets/${market.marketId}`, field: "fee.coefficient", granularity: "market" },
    verifiedAt: new Date(nowMs).toISOString(),
    ttlSec: 0,
  };
  const fee = market.fee;
  if (fee === undefined || !CHARGED.has(fee.charged)) return unknown;
  const coefficient = parseQty("price", fee.coefficient, { maxScale: 6 });
  if (coefficient === null || coefficient.atomic < 0n || cmpQty(coefficient, MAX_COEFFICIENT) > 0) return unknown;
  return {
    venue: "novig",
    modelId: "curve_pq",
    // Fee = c * P * (1 - P) * N, taker only. The maker never pays (maker credit is a separate rebate).
    taker: { rate: toDec(coefficient) },
    maker: { rate: "0" },
    // docs.novig.com/api/concepts/fees (read 2026-10-22): "A fee rounds half up to the millicent", on each fill, with
    // no one-cent minimum (fee.ts). The engine rounds the order once: under $0.00001 per extra fill either way.
    rounding: `half_up:${FEE_ROUNDING_PLACES}`,
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${NOVIG_API_BASE}/catalog/markets/${market.marketId}`, field: "fee.coefficient,fee.charged,fee.makerCredit", granularity: "market" },
    verifiedAt: new Date(nowMs).toISOString(),
    ttlSec: NOVIG_FEE_TTL_SEC,
  };
}

// The fixed sentence about when the fee applies. WHEN_LIVE games are free pregame; the FeeSpec has no phase, so a
// consumer that nets the fee will over-charge a pregame fill, never under-charge it.
export function feeCharge(market: NovigMarket): "when_live" | "always" | "unknown" {
  if (market.fee?.charged === "WHEN_LIVE") return "when_live";
  if (market.fee?.charged === "ALWAYS") return "always";
  return "unknown";
}

// ---- rules -------------------------------------------------------------------------------------------------------------

function voidPolicyOf(market: NovigMarket): VoidPolicy {
  // PUSH returns collateral. FMV pays each outcome its fair-market price, which is not one of the port's policies
  // (it is not simply the last traded price), so it stays unknown.
  return market.voids === "PUSH" ? "refund" : "unknown";
}

export function rulesOf(market: NovigMarket): Rules {
  const strike = market.strike === undefined ? "" : ` Strike: ${market.strike}.`;
  const voids = market.voids === undefined ? "" : ` Void handling reported by the venue: ${market.voids}.`;
  const text = `Novig ${market.marketType} market (one question, one order book per outcome).${strike}${voids} The public catalog publishes no contract rules text; the settlement terms are in the venue's contract specification.`;
  return {
    text: untrustedField("rules", text, "novig"),
    // No rules text was published, so no hash exists. An empty hash means "unknown" and never equals a real one.
    sha256: "",
    sources: [],
    mechanism: "exchange",
    void: voidPolicyOf(market),
  };
}

// ---- market ------------------------------------------------------------------------------------------------------------

const GROUP_EXHAUSTIVE: MarketGroup["exhaustive"] = "unknown";

export function summaryOf(market: NovigMarket, event: NovigEvent | undefined, eventStatus: string | undefined, nowMs: number, transport: "T0" | "T1"): MarketSummary {
  return {
    ref: refOf(market),
    title: untrustedField("title", titleTextOf(market, event), "novig"),
    status: statusOf(market, eventStatus ?? event?.status),
    // The catalog gives the event's start, not a close time; a start is not a close, so no close is claimed.
    closesAtUtc: null,
    outcomes: outcomeSummariesOf(market),
    volume: { amount: null, unit: "unknown", windowHours: null },
    prov: makeProv({ venue: "novig", source: `${NOVIG_API_BASE}/catalog/markets`, fetchedAtMs: nowMs, nowMs, ttlMs: NOVIG_LIST_TTL_MS, transport }),
  };
}

export function marketOf(market: NovigMarket, event: NovigEvent | undefined, nowMs: number): Market {
  const reasons = ["read_only_adapter", "reference_prices_only", "rules_text_not_published"];
  if (event === undefined) reasons.push("event_title_unavailable");
  return {
    ref: refOf(market),
    title: untrustedField("title", titleTextOf(market, event), "novig"),
    outcomes: outcomesOf(market),
    rules: rulesOf(market),
    status: statusOf(market, event?.status),
    tradable: { ok: false, reasons },
    timesUtc: {},
    tick: NOVIG_TICK_RANGES,
    // One API unit pays one cent: the smallest order is 0.01 shares.
    minSize: "0.01",
    collateral: COLLATERAL,
    group: { key: market.eventId, kind: "event", exhaustive: GROUP_EXHAUSTIVE },
    fee: feeSpecOf(market, nowMs),
    prov: { fetchedAtMs: nowMs, source: `${NOVIG_API_BASE}/catalog/markets/${market.marketId}`, adapterVersion: NOVIG_ADAPTER_VERSION, schemaHash: NOVIG_SCHEMA_HASH },
  };
}

export function startsAtUtc(market: NovigMarket): string | null {
  return market.startsTs === undefined ? null : isoOfMs(market.startsTs);
}

// ---- books -------------------------------------------------------------------------------------------------------------

interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

export class BookShapeError extends Error {
  readonly reason: "bad_price" | "bad_size" | "unknown_outcome" | "crossed";
  constructor(reason: BookShapeError["reason"]) {
    super(reason);
    this.name = "BookShapeError";
    this.reason = reason;
  }
}

function levelsOf(rows: NovigBook["orders"][string] | undefined): RawLevel[] {
  const out: RawLevel[] = [];
  for (const row of rows ?? []) {
    const price = openUnitPrice(row.price, 3);
    if (price === null) throw new BookShapeError("bad_price");
    if (row.qty === 0) continue;
    out.push({ price, size: fromAtomic("shares", BigInt(row.qty), NOVIG_QTY_DECIMALS) });
  }
  return out;
}

// Merge equal prices, sort explicitly: bids descending, asks ascending. Never trust the venue's order.
function sortLevels(levels: readonly RawLevel[], side: "bids" | "asks"): readonly RawLevel[] {
  const merged: RawLevel[] = [];
  for (const level of levels) {
    const at = merged.findIndex((existing) => cmpQty(existing.price, level.price) === 0);
    const found = merged[at];
    if (found === undefined) merged.push(level);
    else merged[at] = { price: found.price, size: addQty(found.size, level.size) };
  }
  return merged.sort((a, b) => (side === "bids" ? -cmpQty(a.price, b.price) : cmpQty(a.price, b.price)));
}

function levelOut(level: RawLevel): Level {
  return { price: toDec(level.price), size: toDec(level.size) };
}

// Every resting order is a BUY of one outcome at its price. So the bids of outcome A are the orders on A, and the
// asks of A are the orders on the opposite outcome B read from the other end: a bid on B at p is liquidity for A at
// 1 - p. That ask side is derived from the other book, so the Book is labelled a complement and never executable.
// A market that does not have exactly two outcomes has no such pairing: its book has bids only.
export function bookOf(market: NovigMarket, tokenId: string, book: NovigBook, nowMs: number): Book {
  const known = new Set(market.outcomes.map((outcome) => outcome.outcomeId));
  for (const id of Object.keys(book.orders)) if (!known.has(id)) throw new BookShapeError("unknown_outcome");
  if (!known.has(tokenId)) throw new BookShapeError("unknown_outcome");
  const bids = sortLevels(levelsOf(book.orders[tokenId]), "bids");
  let asks: readonly RawLevel[] = [];
  if (market.outcomes.length === 2) {
    const other = market.outcomes.find((outcome) => outcome.outcomeId !== tokenId);
    if (other === undefined) throw new BookShapeError("unknown_outcome");
    asks = sortLevels(levelsOf(book.orders[other.outcomeId]).map((level) => ({ price: subQty(ONE_PRICE, level.price), size: level.size })), "asks");
  }
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (bestBid !== undefined && bestAsk !== undefined && cmpQty(bestBid.price, bestAsk.price) >= 0) throw new BookShapeError("crossed");
  return {
    token: { venue: "novig", tokenId },
    bids: bids.map(levelOut),
    asks: asks.map(levelOut),
    asOfMs: nowMs,
    derived: market.outcomes.length === 2 ? "complement" : "native",
  };
}
