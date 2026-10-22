// What may be kept and what may be served, per venue (docs/sdk-and-api-design.md section 5; docs/dapp-design.md 4.8 R3
// to R5). Two recorded facts meet here, and the stricter one always wins:
//
//   the licence class   sdk/venues/policy.ts: own_use_only, attribution, open or unknown, from the project's reading of
//                       each venue's terms (the dApp's memory-only and no-export rules hang off it);
//   the data terms      the platform registry's dataTerms (pm/registry/records.ts): "restricted" when a clause bars
//                       caching, aggregating or redistribution, "none_found" when no such clause was recorded (not a
//                       clean bill), "unknown" when the terms were not read.
//
// `termsAllowPersistence` is the registry's time-independent persistence rule (link records may hold derived text for a
// venue only when it is true); pm/registry re-exports it and pm/test/registry/licence.test.ts pins DATA_TERMS to the
// registry's records. `apiServability` is the one rule the hosted API applies before it reads, caches or serves anything
// of a venue: only a venue with a recorded licence (open or attribution), no restriction and no restrictive clause found
// is served. Unknown fails closed: a venue is not served until someone reads its terms and records a class here and in
// policy.ts. Quotient is not a venue and is never served.
//
// Pure data and functions: no clock, no network.

import { isVenueId, venuePolicy } from "./policy.js";
import type { LicenseClass, VenueId } from "../model.js";

export type DataTermsStatus = "restricted" | "none_found" | "unknown";

// The registry's dataTerms.restricted for each registry id, as recorded in registry release 2026.10.20-1. A venue with no
// registry record is "unknown".
export const DATA_TERMS: Readonly<Record<string, DataTermsStatus>> = Object.freeze({
  xo: "none_found",
  polymarket: "none_found",
  kalshi: "restricted",
  trueo: "none_found",
  limitless: "none_found",
  pascal: "unknown",
  sxbet: "unknown",
  hyperliquid: "unknown",
  manifold: "none_found",
  prophetx: "restricted",
  gemini: "restricted",
  og: "unknown",
  novig: "unknown",
  udx: "unknown",
});

// The registry names SX Bet "sxbet"; every other registry id is the VenueId itself.
const REGISTRY_ID_OF: Readonly<Partial<Record<VenueId, string>>> = Object.freeze({ sx: "sxbet" });

export function dataTermsOf(id: unknown): DataTermsStatus {
  if (typeof id !== "string") return "unknown";
  const key = isVenueId(id) ? (REGISTRY_ID_OF[id] ?? id) : id;
  return Object.hasOwn(DATA_TERMS, key) ? (DATA_TERMS[key] as DataTermsStatus) : "unknown";
}

// True only for a venue the registry records with no restrictive clause found. Freshness is not consulted, so a record
// written while the terms were fresh stays valid when read back later (pm/registry/registry.ts dataPolicy is the
// time-dependent rule for collectors).
export function termsAllowPersistence(id: unknown): boolean {
  return typeof id === "string" && Object.hasOwn(DATA_TERMS, id) && DATA_TERMS[id] === "none_found";
}

// ---- what the hosted API may serve -------------------------------------------------------------------------------------------

export const NOT_SERVED_CODES = [
  "unknown_venue", // not a venue id (Quotient included: it is a signal service, never a venue the API serves)
  "own_use_only", // licensed for the reader's own use
  "restricted_terms", // the policy marks its terms as restricting caching or aggregation
  "licence_unknown", // nobody has recorded a licence class yet
  "data_terms", // the registry records a restrictive clause, or did not read the terms
  "not_built", // no reader exists for it
] as const;
export type NotServedCode = (typeof NOT_SERVED_CODES)[number];

export type Servability =
  | { readonly served: true; readonly licence: LicenseClass; readonly dataTerms: DataTermsStatus }
  | { readonly served: false; readonly code: NotServedCode; readonly reason: string; readonly licence: LicenseClass; readonly dataTerms: DataTermsStatus };

const QUOTIENT_REASON = "Quotient's terms bar sharing or reselling access: its data is read only by a user's own agent and never served.";

// The one serving rule. Order matters only for the stated reason; every refusal is a refusal.
export function apiServability(id: unknown): Servability {
  const dataTerms = dataTermsOf(id);
  if (!isVenueId(id)) {
    const reason = typeof id === "string" && id.toLowerCase() === "quotient" ? QUOTIENT_REASON : "Not a venue this API knows.";
    return { served: false, code: "unknown_venue", reason, licence: "unknown", dataTerms };
  }
  const policy = venuePolicy(id);
  const licence = policy.license;
  const refuse = (code: NotServedCode, reason: string): Servability => ({ served: false, code, reason, licence, dataTerms });
  if (licence === "own_use_only") return refuse("own_use_only", `${policy.name} data is licensed for the reader's own use: readable in local mode through the user's own client, never cached or served by the API.`);
  if (policy.restricted) return refuse("restricted_terms", `${policy.name}'s terms restrict caching or aggregating its data: never served by the API.`);
  if (licence !== "open" && licence !== "attribution") return refuse("licence_unknown", `No licence class is recorded for ${policy.name}: not served until someone reads its terms and records one (sdk/venues/policy.ts).`);
  if (dataTerms !== "none_found") return refuse("data_terms", `The platform registry records ${policy.name}'s data terms as ${dataTerms}: not served.`);
  if (policy.tier === "not_built" || policy.tier === "unknown") return refuse("not_built", `There is no reader for ${policy.name} yet.`);
  return { served: true, licence, dataTerms };
}
