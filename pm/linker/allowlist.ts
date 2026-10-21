// The linker reads and persists exactly the recorder's allowlist (pm/recorder/allowlist.ts): XO,
// Polymarket international and Limitless. Kalshi and Quotient are never contacted; a Kalshi or
// Quotient id can never be written by the linker (state.ts and bundle writers assert it, and a
// test proves it). The allowlist is code, not configuration.

import { dataPolicy, getPlatform } from "../registry/registry.js";
import { RECORDABLE_HOSTS, RECORDABLE_VENUES, RESEARCH_USER_AGENT, RestrictedVenueError, isRecordableVenue, refusalReason, type RecVenue } from "../recorder/allowlist.js";

export const LINKER_VENUES = RECORDABLE_VENUES;
export type LinkerVenue = RecVenue;

export function isLinkerVenue(venue: string): venue is LinkerVenue {
  return isRecordableVenue(venue);
}

// Throws for any venue the linker may not persist. Used by every writer before a byte hits disk.
export function assertPersistable(venue: string): asserts venue is LinkerVenue {
  if (!isLinkerVenue(venue)) throw new RestrictedVenueError(venue);
}

// Allowlisted AND the registry data policy still says mayPersist now (terms fresh, not restricted).
export function termsPermitLinking(venue: string, nowMs: number): boolean {
  if (!isLinkerVenue(venue)) return false;
  const rec = getPlatform(venue);
  return rec !== undefined && dataPolicy(rec, nowMs).mayPersist;
}

export const LINKER_HOSTS: Readonly<Record<LinkerVenue, string>> = {
  xo: RECORDABLE_HOSTS.xo[1] as string, // api-mainnet.xo.market (the Data API; no book host is read)
  polymarket: RECORDABLE_HOSTS.polymarket[0] as string, // gamma-api.polymarket.com
  limitless: RECORDABLE_HOSTS.limitless[0] as string, // api.limitless.exchange
};

export { RESEARCH_USER_AGENT, RestrictedVenueError, refusalReason };
