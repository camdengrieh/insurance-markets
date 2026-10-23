// The direct executors, by venue id: a venue listed here trades from the standalone build with the visitor's own
// wallet (types.ts says what an executor does). Adding a venue is one line here and its folder beside polymarket/.
// Limitless sends no CORS headers for the page, so its executor reaches the venue through our markets API's relay
// (limitless/relay.ts), with the visitor's own pasted API token signing every request in the tab.

import { createLimitlessExecutor } from "./limitless/executor";
import { createPolymarketExecutor } from "./polymarket/executor";
import type { DirectDeps, DirectExecutor } from "./types";

export const DIRECT_EXECUTORS = {
  polymarket: createPolymarketExecutor,
  limitless: (deps: DirectDeps) => createLimitlessExecutor(deps),
} as const satisfies Readonly<Record<string, (deps: DirectDeps) => DirectExecutor<never>>>;

export type DirectVenue = keyof typeof DIRECT_EXECUTORS;

export function hasDirectExecutor(venue: string): venue is DirectVenue {
  return Object.prototype.hasOwnProperty.call(DIRECT_EXECUTORS, venue);
}

// XO trades from the standalone build too, through the markets API's relay and its own panel (xo/index.ts): its shape
// differs from the CLOB executors above (one panel owns readiness, login, ticket and orders), so it is not in the map.
export { xoDirectExecutor, XoTradePanel } from "./xo";

// Whether the standalone build offers a venue's ticket with the visitor's own wallet.
export function tradesDirectly(venue: string): boolean {
  return hasDirectExecutor(venue) || venue === "xo";
}
