// Persistence for the venue switches (docs/dapp-design.md 4.5 Settings, 4.8 R8). A restricted-terms venue is OFF
// until the user both switches it on and accepts its clause; an acceptance of an older clause version no longer
// counts. Holds no market data: only venue ids, booleans and a version string, so it may live in IndexedDB.

import * as z from "zod/v4";

import type { RecordStore } from "./bindings";
import type { VenueId } from "./ports";
import { DEFAULT_SWITCHES, DISCLOSURE_VERSION, VENUE_IDS, isVenueId, venuePolicy, type VenueSwitches } from "./venue-policy";

const SWITCHES_ID = "venue_switches";

const venueKey = z.enum(VENUE_IDS as [VenueId, ...VenueId[]]);
const switchesSchema = z
  .object({
    id: z.literal(SWITCHES_ID),
    enabled: z.partialRecord(venueKey, z.boolean()),
    disclosureAccepted: z.partialRecord(venueKey, z.string().max(16)),
  })
  .strict();

export async function loadVenueSwitches(store: RecordStore): Promise<VenueSwitches> {
  try {
    for (const raw of await store.getAll()) {
      const parsed = switchesSchema.safeParse(raw);
      if (parsed.success) return Object.freeze({ enabled: Object.freeze({ ...parsed.data.enabled }), disclosureAccepted: Object.freeze({ ...parsed.data.disclosureAccepted }) });
    }
  } catch {
    // Storage that cannot be read means the defaults, never an error screen.
  }
  return DEFAULT_SWITCHES;
}

export async function saveVenueSwitches(store: RecordStore, switches: VenueSwitches): Promise<void> {
  await store.put({ id: SWITCHES_ID, enabled: { ...switches.enabled }, disclosureAccepted: { ...switches.disclosureAccepted } });
}

export function withVenueEnabled(switches: VenueSwitches, venue: string, enabled: boolean): VenueSwitches {
  if (!isVenueId(venue)) return switches;
  return Object.freeze({ enabled: Object.freeze({ ...switches.enabled, [venue]: enabled }), disclosureAccepted: switches.disclosureAccepted });
}

// Only a restricted venue has a clause to accept. Switching the venue off also forgets the acceptance, so turning
// it on again shows the clause again.
export function withDisclosureAccepted(switches: VenueSwitches, venue: string): VenueSwitches {
  if (!isVenueId(venue) || !venuePolicy(venue).restricted) return switches;
  return Object.freeze({ enabled: switches.enabled, disclosureAccepted: Object.freeze({ ...switches.disclosureAccepted, [venue]: DISCLOSURE_VERSION }) });
}

export function withVenueDisabled(switches: VenueSwitches, venue: string): VenueSwitches {
  if (!isVenueId(venue)) return switches;
  const accepted: Partial<Record<VenueId, string>> = { ...switches.disclosureAccepted };
  delete accepted[venue];
  return Object.freeze({ enabled: Object.freeze({ ...switches.enabled, [venue]: false }), disclosureAccepted: Object.freeze(accepted) });
}
