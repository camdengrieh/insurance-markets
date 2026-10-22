// The shared venue parsers (sdk/venues) return the SDK read model (sdk/model.ts). This layer's port (pm/types.ts)
// keeps its own shapes for ticks, books, list rows and fees until the books and the fee engine move into the SDK
// (docs/sdk-and-api-design.md step 4). These are the only conversions between the two; nothing else in pm/ maps an
// SDK value by hand.
//
// Fees are NOT converted: pm/core/fees.ts reads parameters the SDK spec does not carry (multiplier, buyBps,
// sellBps, the amm_stack parts), so an adapter builds its FeeSpec with pm/core/fee-specs.ts from the fields the
// shared parser validated and passes it in.

import type {
  Book as SdkBook,
  Market as SdkMarket,
  MarketSummary as SdkMarketSummary,
  Dec,
  TickRanges as SdkTickRanges,
} from "../../sdk/model.js";
import type { Book, BookConvention, FeeSpec, Market, MarketRef, MarketSummary, Tick, TokenRef, VenueId } from "../types.js";
import { isVenueId } from "../types.js";

// A venue this layer does not read is a programming error at the call site, never a silent widening.
function refOf(ref: SdkMarket["ref"]): MarketRef {
  if (!isVenueId(ref.venue)) throw new Error(`venue ${ref.venue} is not one pm/ reads`);
  return { venue: ref.venue, marketId: ref.marketId, native: ref.native };
}

export function tickFromSdk(tick: Dec | SdkTickRanges): Tick {
  return typeof tick === "string" ? tick : tick.map((range) => ({ from: range.from, to: range.to, step: range.tick }));
}

export function marketFromSdk(market: SdkMarket, fee: FeeSpec): Market {
  return {
    ref: refOf(market.ref),
    title: market.title,
    outcomes: market.outcomes,
    rules: market.rules,
    status: market.status,
    tradable: market.tradable,
    timesUtc: market.timesUtc,
    tick: tickFromSdk(market.tick),
    ...(market.minSize === undefined ? {} : { minSize: market.minSize }),
    collateral: market.collateral,
    ...(market.group === undefined ? {} : { group: market.group }),
    fee,
    prov: market.prov,
    ...(market.category === undefined ? {} : { category: market.category }),
  };
}

export function summaryFromSdk(summary: SdkMarketSummary): MarketSummary {
  return {
    ref: refOf(summary.ref),
    title: summary.title,
    status: summary.status,
    ...(summary.closesAtUtc === null ? {} : { closesAt: summary.closesAtUtc }),
  };
}

// The SDK book is already sorted (bids descending, asks ascending); the convention names the raw payload's order.
export function bookFromSdk(book: SdkBook, convention: BookConvention): Book {
  const venue: VenueId | null = isVenueId(book.token.venue) ? book.token.venue : null;
  if (venue === null) throw new Error(`venue ${book.token.venue} is not one pm/ reads`);
  const token: TokenRef = { venue, tokenId: book.token.tokenId };
  return {
    token,
    bids: book.bids,
    asks: book.asks,
    convention,
    asOfMs: book.asOfMs,
    ...(book.venueTsMs === undefined ? {} : { venueTsMs: book.venueTsMs }),
    ...(book.hash === undefined ? {} : { hash: book.hash }),
    derived: book.derived,
  };
}
