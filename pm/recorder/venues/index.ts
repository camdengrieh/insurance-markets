import type { RecVenue } from "../allowlist.js";
import type { FeeRecord, MarketStatusCode, RequestSpec, ResolvedMarket } from "../types.js";
import { limitlessCollector } from "./limitless.js";
import { polymarketCollector } from "./polymarket.js";
import { xoCollector } from "./xo.js";

// Every venue payload is read by that venue's one shared parser (sdk/venues/<venue>); a collector only names its
// requests and turns the parsed values into the recorder's stored vocabulary.

export interface RawLevel {
  readonly price: string;
  readonly size: string;
}

// One book as the shared parser validated it: decimal strings, each side sorted best first.
export interface RawBook {
  readonly bids: readonly RawLevel[];
  readonly asks: readonly RawLevel[];
  readonly venueTsMs: number | null;
  readonly hash: string | null;
  readonly tick: string | null;
}

export interface BookTarget {
  readonly host: string;
  readonly path: string;
  readonly tokenParam: string | null;
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export interface VenueCollector {
  readonly venue: RecVenue;
  // Requests that resolve a market id to its tokens, status, close time and fee facts.
  resolvePlan(marketId: string): readonly RequestSpec[];
  // `marketId` is the id that was requested; an answer about any other market is refused, and a venue whose list
  // route can return other markets must find it in the payload instead of trusting the first element.
  parseResolve(bodies: readonly unknown[], nowMs: number, marketId: string): Parsed<ResolvedMarket>;
  // Where the book is read, before the token is known: the host and path, and the query parameter that will carry
  // the outcome-0 token id the state call returns (null when the path alone names the book). For load estimates
  // and the dry run; nothing is ever requested from it.
  bookTarget(marketId: string): BookTarget;
  // The book request itself, once the state call has given the token id.
  bookPlan(marketId: string, tokenId: string): RequestSpec;
  // `tokenId` is the token the book was requested for; a book for any other token is refused.
  parseBook(body: unknown, tokenId: string): Parsed<RawBook>;
}

export const COLLECTORS: Readonly<Record<RecVenue, VenueCollector>> = {
  xo: xoCollector,
  polymarket: polymarketCollector,
  limitless: limitlessCollector,
};

export type { FeeRecord, MarketStatusCode };
