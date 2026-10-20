// An adapter that is switched off. It exists so callers can hold one object per venue and ask it
// what it is (descriptor, disclosure) without special cases; every data call answers
// NOT_SUPPORTED and nothing touches the network.

import type { AdapterError, Book, FeeSpec, Market, MarketSummary, Result, TokenRef } from "../types.js";
import { AdapterFailure } from "./errors.js";
import type { AdapterDescriptor, AdapterMarket, PmPage, PmVenueAdapter } from "./types.js";

export function createDisabledAdapter(descriptor: AdapterDescriptor, reason: string): PmVenueAdapter {
  const off = (): never => {
    throw new AdapterFailure("NOT_SUPPORTED", reason);
  };
  return {
    id: descriptor.venue,
    descriptor,
    caps: {
      listMarkets: false,
      search: false,
      getMarket: false,
      getBook: false,
      getBooksBatch: false,
      getFeeSpec: false,
      getResolution: false,
      getPositionsByAddress: false,
      stream: false,
    },
    async listMarkets(): Promise<PmPage<MarketSummary>> {
      return off();
    },
    async getMarket(): Promise<AdapterMarket> {
      return off();
    },
    async getBooks(tokens: TokenRef[]): Promise<Array<Result<Book, AdapterError>>> {
      return tokens.map((): Result<Book, AdapterError> => ({ ok: false, error: "NOT_SUPPORTED", detail: reason }));
    },
    async getFeeSpec(_m: Market): Promise<FeeSpec> {
      return off();
    },
    async health(): Promise<{ ok: boolean; notes: string[] }> {
      return { ok: false, notes: [reason] };
    },
  };
}
