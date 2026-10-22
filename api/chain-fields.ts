import { atomicToDec, pow10, roundDiv } from "../sdk/money/decimal.js";
import type { ChainResolution, MarketSummary, OutcomeSummary } from "../sdk/model.js";
import type { ResolutionSource } from "../sdk/chain/positions.js";
import { polymarketTargets } from "../sdk/chain/polymarket/reads.js";
import { xoTargets } from "../sdk/chain/xo/positions.js";
import type { ChainSpec } from "./indexer/chains.js";
import type { FillRow, IndexStore, ResolutionRow } from "./store.js";

// The index's read functions for the endpoints (docs/sdk-and-api-design.md sections 6 and 7): the last trade of an outcome
// token from the fills the index saw, and a market's settlement from the resolution events it saw. Each answer says what
// it rests on: the chain, the block and the time the index read it. A field the index cannot answer is null with the
// reason, never a guess: "no fill seen since block N" is not "never traded", and no resolution seen is not "unresolved"
// unless the condition's own preparation is inside the index.

// Prices are stated to at most this many places (canonical decimal text, no trailing zeros), rounded half to even, from
// the exact amounts the fill moved.
export const PRICE_PLACES = 6;

export interface LastTrade {
  // Collateral per share, rounded to PRICE_PLACES; null when the exchange's decimals are not pinned.
  readonly price: string | null;
  // "buy": the maker paid collateral for the outcome token.
  readonly side: "buy" | "sell";
  readonly shares: string | null;
  readonly collateral: string | null;
  readonly block: string;
  readonly txHash: string;
  readonly exchange: string;
  // The fill's block time lies between these two instants (the index reads one timestamp per range, not per block).
  readonly tradedBetweenUtc: readonly [string, string];
}

export type IndexAnswer<T> =
  | { readonly ok: true; readonly value: T; readonly asOfMs: number; readonly via: string }
  | { readonly ok: false; readonly reason: string };

function utc(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function sinceText(store: IndexStore, spec: ChainSpec): string {
  const cursor = store.cursor(spec.chainId);
  return cursor === null ? `The ${spec.via} index has not started.` : `blocks ${cursor.startBlock.toString()} to ${cursor.block.toString()} of ${spec.via}`;
}

export function lastTradeOf(fill: FillRow, spec: ChainSpec): LastTrade {
  const contract = spec.contracts.find((c) => c.pin.address.toLowerCase() === fill.exchange.toLowerCase());
  const decimals = contract?.decimals ?? null;
  const maker = BigInt(fill.makerAmount);
  const taker = BigInt(fill.takerAmount);
  const collateralRaw = fill.side === "buy" ? maker : taker;
  const sharesRaw = fill.side === "buy" ? taker : maker;
  let price: string | null = null;
  let shares: string | null = null;
  let collateral: string | null = null;
  if (decimals !== null) {
    shares = atomicToDec(sharesRaw, decimals.shares);
    collateral = atomicToDec(collateralRaw, decimals.collateral);
    if (sharesRaw > 0n) price = atomicToDec(roundDiv(collateralRaw * pow10(decimals.shares) * pow10(PRICE_PLACES), sharesRaw * pow10(decimals.collateral), "half_even"), PRICE_PLACES);
  }
  return {
    price,
    side: fill.side,
    shares,
    collateral,
    block: fill.block.toString(),
    txHash: fill.txHash,
    exchange: fill.exchange,
    tradedBetweenUtc: [utc(fill.timeLoS), utc(fill.timeHiS)],
  };
}

// The last fill of each outcome token of a row, as the index saw it.
export function indexedLastTrades(store: IndexStore, spec: ChainSpec, outcomes: readonly OutcomeSummary[]): Map<string, IndexAnswer<LastTrade>> {
  const out = new Map<string, IndexAnswer<LastTrade>>();
  const fills = store.lastFills(spec.chainId, outcomes.map((o) => o.tokenId));
  const since = sinceText(store, spec);
  for (const outcome of outcomes) {
    const fill = fills.get(outcome.tokenId);
    if (fill === undefined) out.set(outcome.tokenId, { ok: false, reason: `No fill of this outcome token in ${since}.` });
    else {
      const trade = lastTradeOf(fill, spec);
      out.set(outcome.tokenId, { ok: true, value: trade, asOfMs: fill.indexedMs, via: `${spec.via} OrderFilled, block ${trade.block}` });
    }
  }
  return out;
}

function resolutionOf(row: ResolutionRow): ChainResolution {
  const denominator = BigInt(row.denominator);
  const payouts = row.payouts.map((p) => BigInt(p));
  const winners = payouts.flatMap((value, index) => (value === denominator ? [index] : []));
  return { state: "resolved", payouts: row.payouts, denominator: row.denominator, winningIndex: winners.length === 1 ? (winners[0] as number) : null };
}

// The settlement source of a row from what the chain itself defines: XO and Polymarket rows name their condition, and are
// used only when the listed token ids derive from it (sdk/chain). A Limitless row names no condition (its slug is the id),
// so the index cannot place it without asking the chain, which the list does not do.
function sourceOf(venue: ChainSpec["venue"], row: MarketSummary): { ok: true; source: ResolutionSource } | { ok: false; reason: string } {
  const tokenIds = row.outcomes.map((o) => o.tokenId);
  if (venue === "limitless") return { ok: false, reason: "A Limitless row names no condition; the index does not map its tokens to one." };
  const result =
    venue === "xo"
      ? xoTargets({ conditionId: row.ref.marketId, tokenIds })
      : polymarketTargets({
          conditionId: row.ref.marketId,
          ledger: row.ref.native["ledger"] === "protocol_v2" ? "protocol_v2" : "ctf_v1",
          negRisk: row.ref.native["negRisk"] === "true" ? true : row.ref.native["negRisk"] === "false" ? false : null,
          tokenIds,
        });
  if (!result.ok) return { ok: false, reason: result.why };
  const source = result.targets[0]?.resolution ?? null;
  if (source === null || result.targets.some((t) => t.resolution === null || t.resolution.conditionId !== source.conditionId)) {
    return { ok: false, reason: "The market's outcomes are not the outcomes of one condition." };
  }
  return { ok: true, source };
}

export function indexedResolution(store: IndexStore, spec: ChainSpec, row: MarketSummary): IndexAnswer<ChainResolution> {
  const placed = sourceOf(spec.venue, row);
  if (!placed.ok) return placed;
  const source = placed.source;
  const ledger = (source.kind === "ctf" ? source.ledger : source.module).address.toLowerCase();
  const conditionId = source.conditionId.toLowerCase();
  const found = store.resolutions(spec.chainId, [conditionId]).get(conditionId);
  const since = sinceText(store, spec);
  if (found !== undefined && found.ledger.toLowerCase() === ledger) {
    return { ok: true, value: resolutionOf(found), asOfMs: found.indexedMs, via: `${spec.via} ${found.kind === "ctf" ? "ConditionResolution" : "ConditionResolved"}, block ${found.block.toString()}` };
  }
  if (source.kind === "ctf") {
    const prepared = store.preparations(spec.chainId, [conditionId]).get(conditionId);
    const cursor = store.cursor(spec.chainId);
    if (prepared !== undefined && prepared.ledger.toLowerCase() === ledger && cursor !== null && store.incompleteRanges(spec.chainId) === 0) {
      return { ok: true, value: { state: "unresolved" }, asOfMs: cursor.updatedMs, via: `${spec.via}: prepared at block ${prepared.block.toString()}, no resolution up to block ${cursor.block.toString()}` };
    }
  }
  return { ok: false, reason: `No resolution event for this condition in ${since}; that does not mean it is unresolved.` };
}
