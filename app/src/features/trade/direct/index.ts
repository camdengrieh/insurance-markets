// The direct executors, by venue id: a venue listed here trades from the standalone build with the visitor's own
// wallet (types.ts says what an executor does). Adding a venue is one line here and its folder beside polymarket/.

import { createPolymarketExecutor } from "./polymarket/executor";
import type { DirectDeps, DirectExecutor } from "./types";

export const DIRECT_EXECUTORS = {
  polymarket: createPolymarketExecutor,
} as const satisfies Readonly<Record<string, (deps: DirectDeps) => DirectExecutor<never>>>;

export type DirectVenue = keyof typeof DIRECT_EXECUTORS;

export function hasDirectExecutor(venue: string): venue is DirectVenue {
  return Object.prototype.hasOwnProperty.call(DIRECT_EXECUTORS, venue);
}
