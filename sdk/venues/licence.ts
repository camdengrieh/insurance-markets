// The platform registry's data terms per venue (pm/registry/records.ts dataTerms): "restricted" when a clause bars caching,
// aggregating or redistribution, "none_found" when no such clause was recorded (not a clean bill), "unknown" when the terms
// were not read.
//
// `termsAllowPersistence` is the registry's time-independent persistence rule (pm's link records may hold derived text for
// a venue only when it is true); pm/registry re-exports it and pm/test/registry/licence.test.ts pins DATA_TERMS to the
// registry's records. The hosted API applies no part of this file.
//
// Pure data and functions: no clock, no network.

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

// True only for a venue the registry records with no restrictive clause found. Freshness is not consulted, so a record
// written while the terms were fresh stays valid when read back later (pm/registry/registry.ts dataPolicy is the
// time-dependent rule for collectors).
export function termsAllowPersistence(id: unknown): boolean {
  return typeof id === "string" && Object.hasOwn(DATA_TERMS, id) && DATA_TERMS[id] === "none_found";
}
