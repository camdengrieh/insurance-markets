import type { RecVenue } from "../allowlist.js";
import type { FeeRecord, MarketStatusCode, RequestSpec, ResolvedMarket } from "../types.js";
import { limitlessCollector } from "./limitless.js";
import { polymarketCollector } from "./polymarket.js";
import { xoCollector } from "./xo.js";

export interface RawBook {
  readonly bids: readonly { readonly price: unknown; readonly size: unknown }[];
  readonly asks: readonly { readonly price: unknown; readonly size: unknown }[];
  readonly venueTsMs: number | null;
  readonly hash: string | null;
  readonly tick: string | null;
  readonly convention: "best_first" | "best_last";
  readonly sizeOf?: (v: unknown) => string | null;
  readonly priceOf?: (v: unknown) => string | null;
}

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export interface VenueCollector {
  readonly venue: RecVenue;
  // Requests that resolve a market id to its tokens, status, close time and fee facts.
  resolvePlan(marketId: string): readonly RequestSpec[];
  // `marketId` is the id that was requested; a venue whose list route can return other markets must
  // match it against the payload instead of trusting the first element.
  parseResolve(bodies: readonly unknown[], nowMs: number, marketId: string): Parsed<ResolvedMarket>;
  // The book request; `tokenId` is null when it is not known yet (dry run).
  bookPlan(marketId: string, tokenId: string | null): RequestSpec;
  parseBook(body: unknown): Parsed<RawBook>;
}

export const COLLECTORS: Readonly<Record<RecVenue, VenueCollector>> = {
  xo: xoCollector,
  polymarket: polymarketCollector,
  limitless: limitlessCollector,
};

export type { FeeRecord, MarketStatusCode };
