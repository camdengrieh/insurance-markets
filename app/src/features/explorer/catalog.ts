// Which venues the Markets screen speaks about, and what state each is in (docs/dapp-design.md 4.6, 4.8 R8, M0-2).
//
// The state comes from core/venue-policy.ts `venueState`, the one answer to "may this venue's adapter run?", plus
// whether this release has a reader for the venue at all. A venue the screen cannot read is NAMED, in words, with the
// reason: never an empty list that looks like "no markets" (principle 4 of section 4.1).

import { VENUE_IDS, venuePolicy, venueState, type BuildKind, type VenueSwitches } from "../../core/venue-policy";
import type { VenueId } from "../../core/ports";

// Display order of the venues this screen reports on. Built readers first, then the venues that are shown as tiles
// only (daemon-only and restricted-terms venues).
export const EXPLORER_VENUES: readonly VenueId[] = Object.freeze([
  "xo",
  "polymarket",
  "trueo",
  "hyperliquid",
  "pascal",
  "manifold",
  "limitless",
  "kalshi",
  "gemini",
  "novig",
  "og",
  "udx",
  "sx",
] as const);

// Venues in the closed list that this screen does not report on at all. Printed once, so the omission is visible.
export const UNREPORTED_VENUES: readonly VenueId[] = Object.freeze(VENUE_IDS.filter((id) => !EXPLORER_VENUES.includes(id)));

export type VenueStatus =
  // The reader runs.
  | { readonly kind: "active" }
  // Allowed by policy, but this release has no reader for it.
  | { readonly kind: "no_reader" }
  // The venue blocks browsers; only the local Cockpit can read it.
  | { readonly kind: "needs_cockpit" }
  // Restricted terms: off until the user switches it on and accepts the clause. Nothing is requested.
  | { readonly kind: "restricted_off"; readonly clause: string }
  | { readonly kind: "switched_off" }
  | { readonly kind: "not_available" };

export function venueStatusOf(id: VenueId, switches: VenueSwitches, build: BuildKind, hasReader: boolean): VenueStatus {
  const state = venueState(id, switches, build);
  if (state.enabled) return hasReader ? { kind: "active" } : { kind: "no_reader" };
  switch (state.reason) {
    case "restricted_off":
      return { kind: "restricted_off", clause: venuePolicy(id).clause ?? "its terms restrict collecting, caching or aggregating its data" };
    case "needs_cockpit":
      return { kind: "needs_cockpit" };
    case "switched_off":
      return { kind: "switched_off" };
    case "unknown_venue":
    case "not_available":
      return { kind: "not_available" };
  }
}
