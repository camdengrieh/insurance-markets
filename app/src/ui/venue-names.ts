import type { VenueId } from "../core/ports";

// Display names for the closed VenueId list. Fixed app text, never taken from a venue's response.
// Record<VenueId, ...> makes the compiler fail when ports.ts adds a venue.
export const VENUE_NAMES: Readonly<Record<VenueId, string>> = Object.freeze({
  xo: "XO Market",
  polymarket: "Polymarket",
  polymarket_us: "Polymarket US",
  kalshi: "Kalshi",
  limitless: "Limitless",
  trueo: "Trueo",
  world: "World",
  hyperliquid: "Hyperliquid",
  pascal: "Pascal",
  novig: "Novig",
  og: "OG",
  gemini: "Gemini",
  sx: "SX Bet",
  udx: "Underdog Exchange",
  prophetx: "ProphetX",
  predictfun: "Predict.fun",
  opinion: "Opinion",
  manifold: "Manifold",
  myriad: "Myriad",
});

// An id outside the list (a bug or a tampered value) prints as "unknown venue", never as the raw string.
export function venueName(id: string): string {
  return Object.hasOwn(VENUE_NAMES, id) ? VENUE_NAMES[id as VenueId] : "unknown venue";
}
