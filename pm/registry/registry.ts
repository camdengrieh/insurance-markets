// Read access to the bundled registry: lookup, pools, a canonical content hash and the derived
// data-terms policy. Offline and deterministic; nothing here reads a clock unless one is passed.

import { createHash } from "node:crypto";
import { REGISTRY_VENUE_IDS, isRegistryVenueId, type RegistryVenueId } from "./ids.js";
import { derivePools } from "./pools.js";
import { PLATFORM_RECORDS, REGISTRY_AS_OF } from "./records.js";
import { freshness, type Freshness } from "./staleness.js";
import type { PlatformRecord } from "./types.js";

// YYYY.MM.DD-N per compiled release (design 3.2).
export const REGISTRY_VERSION = "2026.10.20-1";
export const REGISTRY_SCHEMA_VERSION = "0.2.0";

export { REGISTRY_AS_OF };

export function allPlatforms(): readonly PlatformRecord[] {
  return PLATFORM_RECORDS;
}

export function getPlatform(id: unknown): PlatformRecord | undefined {
  if (!isRegistryVenueId(id)) return undefined;
  return PLATFORM_RECORDS.find((rec) => rec.id === id);
}

// Pool representative per venue (the smallest id in the pool). Front ends are not records here.
export function poolOf(id: RegistryVenueId): RegistryVenueId | undefined {
  const { poolOf: map } = derivePools(
    PLATFORM_RECORDS.map((rec) => ({ id: rec.id, liquidityLinks: rec.links.value.liquidityLinks })),
  );
  return map.get(id);
}

// ---- canonical hash ----------------------------------------------------------------------

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

// sha256 over the canonical JSON of the records. Key order cannot change it; a changed fact does.
export function registryContentSha256(records: readonly PlatformRecord[] = PLATFORM_RECORDS): string {
  return createHash("sha256").update(canonicalize(records)).digest("hex");
}

// ---- derived data-terms policy -----------------------------------------------------------

export interface DataPolicy {
  // Restricted-terms data is held in memory only: never written to disk, never exported.
  readonly memoryOnly: boolean;
  // Disk persistence and export follow memoryOnly; both are false whenever it is true.
  readonly mayPersist: boolean;
  readonly mayExport: boolean;
  // Whether a read adapter should be on out of the box.
  readonly adapterDefault: "on" | "off";
  readonly clause: string;
  readonly reason: "restricted" | "unknown_terms" | "stale_terms" | "none_found";
  readonly termsFreshness: Freshness;
}

// Imposing a restriction never needs fresh data; lifting one does. So "none_found" only counts
// while the section is fresh, and anything else (restricted, unknown, stale, expired) is memory
// only. "none_found" means no clause was recorded in the notes; it is not a clean bill.
export function dataPolicy(rec: PlatformRecord, nowMs: number): DataPolicy {
  const t = rec.dataTerms.value;
  const state = freshness(rec.dataTerms.meta, nowMs);
  let reason: DataPolicy["reason"];
  if (t.restricted === "restricted") reason = "restricted";
  else if (t.restricted === "unknown") reason = "unknown_terms";
  else if (state !== "fresh") reason = "stale_terms";
  else reason = "none_found";
  const memoryOnly = reason !== "none_found";
  const adapterOn = !memoryOnly && (rec.adapterPriority === "P0" || rec.adapterPriority === "P1");
  return {
    memoryOnly,
    mayPersist: !memoryOnly,
    mayExport: !memoryOnly,
    adapterDefault: adapterOn ? "on" : "off",
    clause: t.clause,
    reason,
    termsFreshness: state,
  };
}

// Time-independent form of the data policy, for rules that must hold whenever a record is read
// back (link validation): true only for a venue the registry records with no restrictive clause
// found. A venue with no record, unknown terms or restricted terms is false. Freshness is not
// consulted: stale terms would otherwise change what an already-written file may contain. The
// pure table lives in the SDK (sdk/venues/licence.ts); pm/test/registry/licence.test.ts pins it
// to these records.
export { termsAllowPersistence } from "../../sdk/venues/licence.js";

export { REGISTRY_VENUE_IDS };
