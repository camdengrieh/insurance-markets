// Data-terms policy for the adapters, derived from the platform registry.
//
// Binding rules (docs/aggregation-design.md 10, docs/research/08 4.9, 12):
//   - Kalshi's Developer Agreement bars caching and aggregating beyond the member's own trading.
//     Kalshi data is memory-only: never written to disk, never exported, never recorded. The
//     adapter is OFF by default and shows the clause before it can be turned on.
//   - Anything with unknown or stale terms is treated as restricted (the registry's rule).
//
// The registry is the source of truth for the clause text, but the restriction on Kalshi is
// ALSO hard-coded here as a floor: a stale or edited registry record must never be able to
// switch a restricted venue to "may persist".

import { createHash } from "node:crypto";

import { dataPolicy, getPlatform } from "../registry/registry.js";
import type { AdapterDescriptor, AdapterVenue } from "./types.js";
import { ADAPTER_VERSION } from "./types.js";

export const XO_HOSTS: readonly string[] = ["orderbooks.xo.market", "api-mainnet.xo.market"];
export const POLYMARKET_HOSTS: readonly string[] = ["gamma-api.polymarket.com", "clob.polymarket.com"];
export const KALSHI_HOSTS: readonly string[] = ["external-api.kalshi.com"];

const HOSTS: Readonly<Record<AdapterVenue, readonly string[]>> = {
  xo: XO_HOSTS,
  polymarket: POLYMARKET_HOSTS,
  kalshi: KALSHI_HOSTS,
};

// Venues whose terms bar persistence regardless of what the registry says today.
export const HARD_RESTRICTED: ReadonlySet<string> = new Set(["kalshi"]);

export const ADAPTER_VENUES: readonly AdapterVenue[] = ["xo", "polymarket", "kalshi"];

export function isAdapterVenue(value: unknown): value is AdapterVenue {
  return typeof value === "string" && (ADAPTER_VENUES as readonly string[]).includes(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const FALLBACK_CLAUSE = "Data terms for this venue could not be read; treat the data as restricted.";

export function adapterDescriptor(venue: AdapterVenue, nowMs: number): AdapterDescriptor {
  const record = getPlatform(venue);
  const policy = record === undefined ? undefined : dataPolicy(record, nowMs);
  const hard = HARD_RESTRICTED.has(venue);
  const memoryOnly = hard || policy === undefined || policy.memoryOnly;
  const clause = policy?.clause ?? FALLBACK_CLAUSE;
  const reason = hard ? "restricted" : (policy?.reason ?? "unknown_terms");
  const restrictedTerms = memoryOnly;
  const defaultEnabled = !memoryOnly && policy?.adapterDefault === "on";
  const disclosure = restrictedTerms ? disclosureFor(venue, clause) : null;
  return {
    venue,
    adapterVersion: ADAPTER_VERSION,
    hosts: HOSTS[venue],
    defaultEnabled,
    restrictedTerms,
    memoryOnly,
    mayPersist: !memoryOnly,
    mayExport: !memoryOnly,
    recordable: !memoryOnly,
    termsReason: reason,
    clause,
    clauseSha256: sha256(clause),
    disclosure,
  };
}

function disclosureFor(venue: AdapterVenue, clause: string): string {
  const name = venue === "kalshi" ? "Kalshi" : venue;
  return (
    `${name} data is subject to restricted terms: ${clause} ` +
    "This adapter keeps that data in memory for the current call only. It is never written to disk, " +
    "exported, cached across calls or given to the recorder. Switch it on only if you may use that " +
    "data for your own purposes under those terms."
  );
}

export class RestrictedDataError extends Error {
  readonly venue: string;
  constructor(venue: string, action: "persist" | "export") {
    super(`${venue} data is restricted by its terms and must not be ${action === "persist" ? "written to disk" : "exported"}`);
    this.name = "RestrictedDataError";
    this.venue = venue;
  }
}

// Gate for every code path that writes or exports venue data (the recorder, exports, snapshots).
// Unknown venues fail closed.
export function assertMayPersist(venue: string, nowMs: number, action: "persist" | "export" = "persist"): void {
  if (!isAdapterVenue(venue)) throw new RestrictedDataError(venue, action);
  const d = adapterDescriptor(venue, nowMs);
  if (action === "persist" ? !d.mayPersist : !d.mayExport) throw new RestrictedDataError(venue, action);
}

export function mayPersist(venue: string, nowMs: number): boolean {
  try {
    assertMayPersist(venue, nowMs);
    return true;
  } catch {
    return false;
  }
}
