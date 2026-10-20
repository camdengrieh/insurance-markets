// Adapter-level types layered on the frozen pm/types.ts port (VenueReadAdapter).
//
// Every adapter implements the port unchanged. What it adds on top is optional and
// structurally compatible: getMarket returns a Market that also carries `extras` (rule fields
// for the link hash, warnings, geo flag) and the adapter has a `descriptor` that says what the
// data terms allow.

import type { Market, MarketSummary, Page, VenueId, VenueReadAdapter } from "../types.js";
import type { Untrusted } from "../types.js";

export type AdapterVenue = "xo" | "polymarket" | "kalshi";

// Rule-bearing fields in the exact shape pm/links/hash.ts RULE_FIELDS expects (a key that the
// venue did not send is left out, so the link hash reports MISSING_FIELD instead of hashing a
// silent gap). Values are plain data: never instructions.
export type RuleFieldValue = string | number | null | readonly string[];
export type RuleFields = Readonly<Record<string, RuleFieldValue>>;

export interface MarketExtras {
  // Inputs for pm/links/hash.ts canonicalizeRecord(venue, ruleFields).
  readonly ruleFields: RuleFields;
  // "rules-v2" when Market.rules.sha256 is the pm/links hash; null when the rules could not be
  // hashed, in which case Market.rules.sha256 is a non-hex sentinel that never equals another
  // market's value.
  readonly rulesHashRecipe: "rules-v2" | null;
  // sha256 of the NFKC/whitespace-collapsed display text (the pm/core recipe), for reference.
  readonly coreRulesSha256: string;
  // Venue's own status text, untrusted. Kept so an unknown enum stays visible.
  readonly statusRaw: Untrusted<string>;
  // Venue flag that the market is geo-restricted for some jurisdictions; null when not reported.
  readonly geoRestricted: boolean | null;
  // Plain sentences built from our own text: things the caller should know (fee sources
  // disagree, scheduled fee change present, v2 token ids unexercised, ...).
  readonly warnings: readonly string[];
}

export type AdapterMarket = Market & { readonly extras: MarketExtras };

export interface AdapterDescriptor {
  readonly venue: AdapterVenue;
  readonly adapterVersion: string;
  // Exact hostnames the adapter may reach. Nothing else is ever contacted.
  readonly hosts: readonly string[];
  // Whether the adapter is on without any explicit setting.
  readonly defaultEnabled: boolean;
  // Data terms. Restricted data is held in memory only: never written to disk, never exported,
  // never given to the recorder.
  readonly restrictedTerms: boolean;
  readonly memoryOnly: boolean;
  readonly mayPersist: boolean;
  readonly mayExport: boolean;
  readonly recordable: boolean;
  readonly termsReason: "restricted" | "unknown_terms" | "stale_terms" | "none_found";
  // Short clause from the platform registry (fixed text, not market text).
  readonly clause: string;
  readonly clauseSha256: string;
  // Text a user must be shown before a restricted adapter is switched on; null when not needed.
  readonly disclosure: string | null;
}

// A page that also says how many rows the adapter could not read. Rows are reported, never
// silently dropped.
export interface PmPage<T> extends Page<T> {
  readonly skipped: ReadonlyArray<{ readonly index: number; readonly reason: string }>;
}

export interface PmVenueAdapter extends VenueReadAdapter {
  readonly id: Extract<VenueId, AdapterVenue>;
  readonly descriptor: AdapterDescriptor;
  listMarkets(q: Parameters<VenueReadAdapter["listMarkets"]>[0]): Promise<PmPage<MarketSummary>>;
  getMarket(ref: Parameters<VenueReadAdapter["getMarket"]>[0]): Promise<AdapterMarket>;
}

export const ADAPTER_VERSION = "pm-adapters/0.1";
