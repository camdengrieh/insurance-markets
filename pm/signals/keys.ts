// Quotient market keys (`polymarket:<id>`, `kalshi:<TICKER>`, `polymarket_us:<id>`,
// `hl_outcomes:#<id>`). The key is the only join key; question text is never used.

import { isQuotientVenue, type QuotientVenue } from "./constants.js";

const ID_BODY = "[A-Za-z0-9#][A-Za-z0-9._:#-]{0,199}";
export const MARKET_KEY_RE = new RegExp(`^(polymarket|kalshi|polymarket_us|hl_outcomes):(${ID_BODY})$`);
export const NATIVE_ID_RE = new RegExp(`^${ID_BODY}$`);

export interface ParsedMarketKey {
  readonly venue: QuotientVenue;
  readonly id: string;
}

export function parseMarketKey(value: unknown): ParsedMarketKey | null {
  if (typeof value !== "string" || value.length > 260) return null;
  const m = MARKET_KEY_RE.exec(value);
  if (m === null) return null;
  const venue = m[1];
  const id = m[2];
  if (venue === undefined || id === undefined || !isQuotientVenue(venue)) return null;
  return { venue, id };
}

// Percent-encodes everything but keeps ':' readable ('#' becomes %23 as the API requires).
export function encodeKeyForPath(key: string): string {
  return encodeURIComponent(key).replace(/%3A/g, ":");
}
