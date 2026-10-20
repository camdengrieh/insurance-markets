// Addresses of market pages. A market id comes from a venue, so it is checked before it is placed in a link or sent
// back to an adapter: a closed alphabet and a length cap, nothing that could carry markup or a scheme.

import { isVenueId } from "../../core/venue-policy";
import type { VenueId } from "../../core/ports";

// Condition ids and addresses (hex), Trueo's "8453:0x..", Hyperliquid's outcome number, Manifold's id, Pascal's symbol.
export const MARKET_ID_PATTERN = /^[A-Za-z0-9:_.#+-]{1,200}$/;

export function isSafeMarketId(value: unknown): value is string {
  return typeof value === "string" && MARKET_ID_PATTERN.test(value);
}

export function marketHref(venue: VenueId, marketId: string): string | null {
  return isSafeMarketId(marketId) ? `/market/${venue}/${encodeURIComponent(marketId)}` : null;
}

export interface MarketParams {
  readonly venue: VenueId;
  readonly marketId: string;
}

// The route's `:venue` and `:marketId`. Decoding happens at most once; an id that is not in the closed alphabet after
// that, or a venue outside the closed list, is refused (the screen then says "not found").
export function parseMarketParams(params: Readonly<Record<string, string | undefined>>): MarketParams | null {
  const venue = params["venue"];
  const raw = params["marketId"];
  if (!isVenueId(venue) || raw === undefined || raw.length > 600) return null;
  let decoded = raw;
  if (raw.includes("%")) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return isSafeMarketId(decoded) ? { venue, marketId: decoded } : null;
}
