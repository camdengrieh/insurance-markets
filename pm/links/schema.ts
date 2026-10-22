// The link record schema lives in the SDK (sdk/links/schema.ts). pm binds the one input the SDK
// cannot hold: which venues' terms allow keeping text derived from them, read from the platform
// registry. A venue the registry does not record, or records with unknown terms, counts as
// restricted (unknown terms are restricted terms).

import { isRestrictedVenue as isRestrictedUnder, type LinkVenueId, type PersistenceTerms } from "../../sdk/links/schema.js";
import { termsAllowPersistence } from "../registry/registry.js";
import { VENUE_IDS, type VenueId } from "../types.js";

export * from "../../sdk/links/schema.js";

// Compile-time guard: a link leg names exactly the venues this layer reads.
type VenueDrift = Exclude<VenueId, LinkVenueId> | Exclude<LinkVenueId, VenueId>;
const _venuesInStep: [VenueDrift] extends [never] ? true : never = true;
void _venuesInStep;

// Time-independent (pm/registry/registry.ts termsAllowPersistence), so a file that was valid when
// written stays valid when read back.
export const registryTerms: PersistenceTerms = (venue) => termsAllowPersistence(venue);

export function isRestrictedVenue(venue: string): boolean {
  return isRestrictedUnder(venue, registryTerms);
}

export const RESTRICTED_VENUES: readonly VenueId[] = VENUE_IDS.filter((v) => isRestrictedVenue(v));
