// The recording allowlist. Terms decide what may be written to disk, not convenience:
//   - Kalshi Developer Agreement bars caching or aggregating its data beyond one's own trading.
//   - Quotient terms restrict redistribution.
//   - Venues whose terms are unread or unclear are treated as memory-only by the registry.
// So raw recording is limited to an explicit allowlist of three venues whose public read APIs are
// documented as keyless and whose registry data policy says mayPersist. Everything else is
// refused by name, and nothing is derived and stored for a refused venue either: the clause
// does not allow it, so the recorder stores nothing at all for it (not even ids in its own tables
// beyond a skipped-link counter).
//
// The allowlist is code, not configuration: a config file or a flag cannot widen it. It is also
// not the only gate: the registry's data policy must still say mayPersist at the time of each tick
// (termsPermitRecording), so once the bundled terms age past their TTL the recorder pauses instead
// of persisting on a claim nobody has re-checked.

import { dataPolicy, getPlatform } from "../registry/registry.js";

export const RECORDABLE_VENUES = ["xo", "polymarket", "limitless"] as const;
export type RecVenue = (typeof RECORDABLE_VENUES)[number];

export function isRecordableVenue(venue: string): venue is RecVenue {
  return (RECORDABLE_VENUES as readonly string[]).includes(venue);
}

// Allowlisted AND the registry's data policy permits persisting at `nowMs` (terms found, fresh, not
// restricted). A venue with no registry record, or with stale terms, does not.
export function termsPermitRecording(venue: string, nowMs: number): boolean {
  if (!isRecordableVenue(venue)) return false;
  const rec = getPlatform(venue);
  return rec !== undefined && dataPolicy(rec, nowMs).mayPersist;
}

// Why a venue is refused, for operator-facing messages and events. Unknown names get the generic
// reason: not being listed is itself the refusal.
export const REFUSAL_REASONS: Readonly<Record<string, string>> = {
  kalshi: "Kalshi Developer Agreement bars caching or aggregating its data; nothing is recorded, not even derived numbers",
  quotient: "Quotient terms restrict redistribution; nothing is recorded",
  prophetx: "data terms restrict aggregation (registry: restricted); nothing is recorded",
  gemini: "data terms restrict aggregation (registry: restricted); nothing is recorded",
};

export function refusalReason(venue: string): string {
  return REFUSAL_REASONS[venue.toLowerCase()] ?? "venue is not on the recorder allowlist (terms unread or unclear: memory-only)";
}

export class RestrictedVenueError extends Error {
  readonly venue: string;
  constructor(venue: string) {
    super(`refusing to record venue "${venue.slice(0, 40)}": ${refusalReason(venue)}`);
    this.name = "RestrictedVenueError";
    this.venue = venue;
  }
}

export function assertRecordable(venue: string): asserts venue is RecVenue {
  if (!isRecordableVenue(venue)) throw new RestrictedVenueError(venue);
}

// Hosts the recorder may ever contact. The HTTP client refuses any other host, so a restricted
// venue cannot be reached even by a code path that forgot to check the venue.
export const RECORDABLE_HOSTS: Readonly<Record<RecVenue, readonly string[]>> = {
  xo: ["orderbooks.xo.market", "api-mainnet.xo.market"],
  polymarket: ["gamma-api.polymarket.com", "clob.polymarket.com"],
  limitless: ["api.limitless.exchange"],
};

export const ALL_RECORDABLE_HOSTS: readonly string[] = RECORDABLE_VENUES.flatMap((v) => RECORDABLE_HOSTS[v]);

export function isAllowedHost(host: string): boolean {
  return ALL_RECORDABLE_HOSTS.includes(host);
}

// Fixed, generic and free of personal identifiers. Not configurable.
export const RESEARCH_USER_AGENT = "insurance-markets-research/0.1";
