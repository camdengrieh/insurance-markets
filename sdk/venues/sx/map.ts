import { sha256, toBytes } from "viem";

import { addQty, cmpQty, fromAtomic, subQty, toDec, type Qty } from "../../money/qty.js";
import type { Book, Collateral, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status } from "../../model.js";
import { untrustedField } from "../../text.js";
import { makeProv } from "../policy.js";
import {
  ODDS_EXCEPTIONS,
  ODDS_LADDER_STEP,
  ODDS_ONE,
  ODDS_SCALE,
  SX_ADAPTER_VERSION,
  SX_CHAIN,
  SX_COLLATERAL_DECIMALS,
  SX_COLLATERAL_SYMBOL,
  SX_LIST_TTL_MS,
  SX_TICK,
} from "./constants.js";
import { MARKET_HASH, marketMetaSchema, type SxBookBody, type SxRow } from "./schemas.js";

export const SCHEMA_DESCRIPTOR = "sx market v1: status marketHash outcomeOneName outcomeTwoName tradingModes teamOneName teamTwoName leagueLabel gameTime marketMeta";
export const SX_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({
  symbol: SX_COLLATERAL_SYMBOL,
  chain: SX_CHAIN,
  decimals: SX_COLLATERAL_DECIMALS,
  // USDC sits in the user's proxy wallet and the venue's escrow contract.
  custody: "smart_account",
});

const ONE = fromAtomic("price", 1n, 0);

// ---- tokens ---------------------------------------------------------------------------------------------------------------------

export type OutcomeSide = 1 | 2;

// A market is binary and has no outcome-token ids (a bet is an escrow position, not a token). A side is named by
// the market hash and the venue's own outcome number.
export function tokenIdOf(marketHash: string, side: OutcomeSide): string {
  return `${marketHash.toLowerCase()}#${side}`;
}

export function parseTokenId(tokenId: string): { readonly marketHash: string; readonly side: OutcomeSide } | null {
  const at = tokenId.lastIndexOf("#");
  if (at <= 0) return null;
  const side = tokenId.slice(at + 1);
  const marketHash = tokenId.slice(0, at);
  if ((side !== "1" && side !== "2") || !MARKET_HASH.test(marketHash)) return null;
  return { marketHash: marketHash.toLowerCase(), side: side === "1" ? 1 : 2 };
}

// ---- times ----------------------------------------------------------------------------------------------------------------------

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// Unix seconds in a plausible range (2001 to 2099), as epoch milliseconds, else null.
export function secondsToMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value >= 1e9 && value < 4.1e9 ? value * 1000 : null;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

// Crypto markets carry a JSON string with the expiry; sports markets carry only the game start.
export function expiryOf(row: SxRow): number | null {
  if (typeof row.marketMeta !== "string" || row.marketMeta.length > 2_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.marketMeta);
  } catch {
    return null;
  }
  const meta = marketMetaSchema.safeParse(parsed);
  if (!meta.success || !ISO_UTC.test(meta.data.expiresAt)) return null;
  const ms = Date.parse(meta.data.expiresAt);
  return Number.isFinite(ms) ? ms : null;
}

// ---- row ------------------------------------------------------------------------------------------------------------------------

export function isClob(row: SxRow): boolean {
  return row.tradingModes.includes("CLOB");
}

// ACTIVE is the only value seen. Everything else is unknown (fail closed). A crypto market past its expiry is
// closed, not trading.
export function statusOf(row: SxRow, nowMs: number): Status {
  if (row.status !== "ACTIVE") return "unknown";
  const expires = expiryOf(row);
  return expires !== null && nowMs >= expires ? "closed" : "active";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// "NFL: Dallas Cowboys vs Philadelphia Eagles: Over 49.5 / Under 49.5". All of it is venue text.
export function titleText(row: SxRow): string {
  const teams = [text(row.teamOneName), text(row.teamTwoName)].filter((part) => part !== "").join(" vs ");
  const league = text(row.leagueLabel);
  return [league, teams, `${row.outcomeOneName} / ${row.outcomeTwoName}`].filter((part) => part !== "").join(": ");
}

export function refOf(row: SxRow): MarketRef {
  const native: Record<string, string> = { market_hash: row.marketHash.toLowerCase() };
  const game = secondsToMs(row.gameTime);
  if (game !== null) native.game_time_utc = iso(game);
  return { venue: "sx", marketId: row.marketHash.toLowerCase(), native };
}

export function outcomesOf(row: SxRow): readonly Outcome[] {
  const hash = row.marketHash;
  return [
    { index: 0, role: "label", label: untrustedField("outcome", row.outcomeOneName, "sx"), tokenId: tokenIdOf(hash, 1) },
    { index: 1, role: "label", label: untrustedField("outcome", row.outcomeTwoName, "sx"), tokenId: tokenIdOf(hash, 2) },
  ];
}

// The list carries no prices and no volume: both are null, never zero.
export function outcomeSummariesOf(row: SxRow): readonly OutcomeSummary[] {
  return outcomesOf(row).map((outcome) => ({ ...outcome, displayPrice: null }));
}

export function summaryOf(row: SxRow, origin: string, nowMs: number): MarketSummary {
  const expires = expiryOf(row);
  return {
    ref: refOf(row),
    title: untrustedField("title", titleText(row), "sx"),
    status: statusOf(row, nowMs),
    closesAtUtc: expires === null ? null : iso(expires),
    outcomes: outcomeSummariesOf(row),
    volume: { amount: null, unit: "unknown", windowHours: null },
    prov: makeProv({ venue: "sx", source: `${origin}/markets/active`, fetchedAtMs: nowMs, nowMs, ttlMs: SX_LIST_TTL_MS }),
  };
}

// The market feed carries no rules text, so there is nothing to fingerprint: an empty hash means "no rules text",
// and never equals a real one.
export function rulesOf(row: SxRow): Rules {
  const expires = expiryOf(row);
  return {
    text: untrustedField("rules", "", "sx"),
    sha256: "",
    sources: [],
    // Graded centrally by the venue (docs/research/venues/sx-bet.md section 7); no oracle.
    mechanism: "unknown",
    void: "unknown",
    ...(expires === null ? {} : { cutoffUtc: iso(expires) }),
  };
}

export function unknownFee(origin: string, marketHash: string, nowMs: number): FeeSpec {
  return {
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${origin}/markets/find?marketHashes=${marketHash}`, field: "takerPayoutFee (keyed route)", granularity: "token" },
    verifiedAt: iso(nowMs),
    // Zero: past its ttl already, so no net-of-fee number and no executable label may be built from it.
    ttlSec: 0,
  };
}

export function marketOf(row: SxRow, origin: string, nowMs: number): Market {
  const expires = expiryOf(row);
  const status = statusOf(row, nowMs);
  const reasons = ["read_only_adapter", "rules_text_not_loaded", "fee_unknown_without_key", "legacy_book_route"];
  if (!isClob(row)) reasons.push("not_clob");
  if (status !== "active") reasons.push("not_active");
  return {
    ref: refOf(row),
    title: untrustedField("title", titleText(row), "sx"),
    outcomes: outcomesOf(row),
    rules: rulesOf(row),
    status,
    tradable: { ok: false, reasons },
    timesUtc: expires === null ? {} : { closesAt: iso(expires) },
    tick: SX_TICK,
    collateral: COLLATERAL,
    fee: unknownFee(origin, row.marketHash.toLowerCase(), nowMs),
    prov: { fetchedAtMs: nowMs, source: `${origin}/markets/find`, adapterVersion: SX_ADAPTER_VERSION, schemaHash: SX_SCHEMA_HASH },
  };
}

// ---- books ----------------------------------------------------------------------------------------------------------------------

export interface RawLevel {
  readonly price: Qty;
  readonly size: Qty;
}

// Odds are a probability times 1e20, strictly between 0 and 1, on the venue's ladder.
export function oddsOf(text: string): bigint | null {
  const odds = BigInt(text);
  if (odds <= 0n || odds >= ODDS_ONE) return null;
  return odds % ODDS_LADDER_STEP === 0n || ODDS_EXCEPTIONS.includes(odds) ? odds : null;
}

// A maker's stake S (USDC, six decimals) at probability p buys S / p shares of a dollar each. The count is rounded
// DOWN to six decimals, so the depth shown is never more than the venue holds. Exact integer math throughout:
// shares x 1e6 = stake x 1e20 / odds.
export function sharesOf(stakeBaseUnits: string, odds: bigint): Qty {
  return fromAtomic("shares", (BigInt(stakeBaseUnits) * ODDS_ONE) / odds, 6);
}

// Merge equal prices, drop empty levels, sort explicitly: best (highest) price first for bids, lowest first for asks.
export function sortLevels(levels: readonly RawLevel[], side: "bids" | "asks"): readonly RawLevel[] {
  const merged: RawLevel[] = [];
  for (const level of levels) {
    if (level.size.atomic === 0n) continue;
    const at = merged.findIndex((existing) => cmpQty(existing.price, level.price) === 0);
    const found = merged[at];
    if (found === undefined) merged.push(level);
    else merged[at] = { price: found.price, size: addQty(found.size, level.size) };
  }
  return merged.sort((a, b) => (side === "bids" ? -cmpQty(a.price, b.price) : cmpQty(a.price, b.price)));
}

// Resting orders in the MAKER's frame: `one` are makers betting on outcome one (bids for outcome one at their own
// odds), `two` are makers betting on outcome two. Each list is sorted best-first as bids.
export type ParsedBook = { readonly ok: true; readonly one: readonly RawLevel[]; readonly two: readonly RawLevel[]; readonly version: string | null } | { readonly ok: false; readonly reason: "invalid_level" | "crossed" };

function readSide(levels: SxBookBody["outcomeOne"]): RawLevel[] | null {
  const out: RawLevel[] = [];
  for (const level of levels) {
    const odds = oddsOf(level.percentageOdds);
    if (odds === null) return null;
    out.push({ price: fromAtomic("price", odds, ODDS_SCALE), size: sharesOf(level.size, odds) });
  }
  return out;
}

// A taker who buys outcome one pays 1 minus the odds of a maker betting on outcome two. Under this reading the
// recorded books are uncrossed; under the opposite one they would cross, which is why a crossed book is a drift.
export function parseBook(body: SxBookBody): ParsedBook {
  const one = readSide(body.outcomeOne);
  const two = readSide(body.outcomeTwo);
  if (one === null || two === null) return { ok: false, reason: "invalid_level" };
  const sortedOne = sortLevels(one, "bids");
  const sortedTwo = sortLevels(two, "bids");
  const bestOne = sortedOne[0];
  const bestTwo = sortedTwo[0];
  if (bestOne !== undefined && bestTwo !== undefined && cmpQty(addQty(bestOne.price, bestTwo.price), ONE) >= 0) return { ok: false, reason: "crossed" };
  return { ok: true, one: sortedOne, two: sortedTwo, version: body.version ?? null };
}

function levelOut(level: RawLevel): Level {
  return { price: toDec(level.price), size: toDec(level.size) };
}

function asksFrom(other: readonly RawLevel[]): readonly RawLevel[] {
  return sortLevels(other.map((level) => ({ price: subQty(ONE, level.price), size: level.size })), "asks");
}

// Both sides come from the venue's two resting lists, but the frame is read from the docs and was never checked
// against a fill, so the book is labelled a complement: indicative, never executable.
export function bookOf(side: OutcomeSide, marketHash: string, parsed: { readonly one: readonly RawLevel[]; readonly two: readonly RawLevel[]; readonly version: string | null }, nowMs: number): Book {
  const own = side === 1 ? parsed.one : parsed.two;
  const other = side === 1 ? parsed.two : parsed.one;
  return {
    token: { venue: "sx", tokenId: tokenIdOf(marketHash, side) },
    bids: own.map(levelOut),
    asks: asksFrom(other).map(levelOut),
    asOfMs: nowMs,
    ...(parsed.version === null ? {} : { hash: parsed.version }),
    derived: "complement",
  };
}
