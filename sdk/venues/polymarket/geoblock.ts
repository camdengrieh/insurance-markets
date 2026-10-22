import { geoblockSchema } from "./schemas.js";

// Geoblock handling, stated plainly (dapp-design 4.6 and 4.8 R10):
//
//  * Polymarket decides by the REQUESTING IP. Its check lives on polymarket.com (the site, not Gamma, the CLOB or
//    the Data API) and reports the caller's own status. polymarket.com is not an allowed origin of either build
//    (sdk/venues/origins.ts lists the three API hosts only), so by default the app cannot ask, and says so as
//    "unchecked". It never reports "allowed" because nothing said "blocked".
//  * When a build does add that origin, the caller passes a probe as `PolymarketAdapterOptions.geoblock`; this module
//    parses its answer. The IP the site echoes back is dropped on parse and never stored or shown.
//  * The app never masks, never retries around and never sends a different Origin or address. A 401, 403 or 451 from
//    a read route is reported as VENUE_PAUSED (http.ts) and the venue stays paused for 10 minutes (R9).
//  * Reads are not trading. Close-only and blocked regions are about opening positions; this app opens none. A region
//    list is a dated venue fact (constants.ts GEOBLOCK_FACTS), never an eligibility verdict.

export type GeoblockStatus =
  | { readonly state: "unchecked"; readonly reason: string }
  | { readonly state: "unknown"; readonly reason: string }
  | { readonly state: "allowed" | "blocked"; readonly country: string | null; readonly region: string | null; readonly checkedAtMs: number };

export const GEOBLOCK_UNCHECKED_REASON =
  "Not checked: Polymarket's geoblock endpoint is on polymarket.com, which this build does not list as an allowed origin, so the app cannot ask. This says nothing about whether your location may trade on Polymarket.";

export function uncheckedGeoblock(): GeoblockStatus {
  return { state: "unchecked", reason: GEOBLOCK_UNCHECKED_REASON };
}

export function parseGeoblock(payload: unknown, nowMs: number): GeoblockStatus {
  const parsed = geoblockSchema.safeParse(payload);
  if (!parsed.success) return { state: "unknown", reason: "The geoblock answer did not have the expected shape." };
  return {
    state: parsed.data.blocked ? "blocked" : "allowed",
    country: parsed.data.country ?? null,
    region: parsed.data.region ?? null,
    checkedAtMs: nowMs,
  };
}
