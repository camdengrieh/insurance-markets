// What the app may do with each venue (docs/dapp-design.md 4.6, 4.8 R3 to R8, fork F5; aggregation-design 10).
//
// A table of DECISIONS and as-read terms, not of live facts: which tier a venue is in, whether its adapter is
// OFF by default, whether its data is memory-only, and the one-line clause shown before it can be switched on.
// The clause texts are the project's paraphrase of what the design records, are not legal advice, and are fixed
// strings (nothing here is fetched). Live, dated facts (geography, fees, status) come from core/registry.ts,
// where an unknown or expired value fails closed.
//
// Unknown venue ids, and ids this table does not list, resolve to UNKNOWN_VENUE_POLICY: disabled, memory-only,
// licence unknown.

import type { ReadService } from "./origins.js";
import { freshnessOf, licensePolicy } from "./cache.js";
import type { LicenseClass, Prov, Transport, VenueId } from "../model.js";

export type VenueTier =
  | "day_zero" // keyless reads, enabled by default
  | "daemon" // reads need the local Cockpit (no credential): the standalone build shows "needs the Cockpit"
  | "restricted_off" // terms restrict caching or aggregating: OFF, memory-only, clause disclosure (F5)
  | "reference_only" // reference prices only, OFF by default
  | "not_built" // no adapter in this release
  | "unknown";

export interface VenuePolicy {
  readonly id: VenueId | "unknown";
  readonly name: string;
  readonly tier: VenueTier;
  readonly license: LicenseClass;
  // Terms restrict collecting, caching or aggregating: shown only after the user accepts the clause.
  readonly restricted: boolean;
  readonly defaultEnabled: boolean;
  // Transport class of the market list / detail reads, and of the order books.
  readonly transport: Transport;
  readonly bookTransport: Transport;
  readonly needsCockpit: boolean;
  // The primary read service (headers.config.ts), if the venue has one.
  readonly service: ReadService | null;
  // Fixed one-line clause for the disclosure screen; null when the venue is not restricted.
  readonly clause: string | null;
}

function policy(p: VenuePolicy): VenuePolicy {
  return Object.freeze(p);
}

const NOT_LEGAL_ADVICE = " (as read in the project's notes, not legal advice)";

const POLICIES = {
  xo: policy({ id: "xo", name: "XO Market", tier: "day_zero", license: "unknown", restricted: false, defaultEnabled: true, transport: "T0", bookTransport: "T1", needsCockpit: false, service: "xo_data", clause: null }),
  polymarket: policy({ id: "polymarket", name: "Polymarket", tier: "day_zero", license: "unknown", restricted: false, defaultEnabled: true, transport: "T0", bookTransport: "T0", needsCockpit: false, service: "polymarket_gamma", clause: null }),
  polymarket_us: policy({ id: "polymarket_us", name: "Polymarket US", tier: "reference_only", license: "unknown", restricted: false, defaultEnabled: false, transport: "T0", bookTransport: "T0", needsCockpit: false, service: "polymarket_us", clause: null }),
  kalshi: policy({
    id: "kalshi",
    name: "Kalshi",
    tier: "restricted_off",
    license: "own_use_only",
    restricted: true,
    defaultEnabled: false,
    transport: "T1",
    bookTransport: "T1",
    needsCockpit: true,
    service: "kalshi",
    clause: `Kalshi's Developer Agreement bars collecting, caching, aggregating or storing API data except for your own trading or monitoring${NOT_LEGAL_ADVICE}.`,
  }),
  limitless: policy({ id: "limitless", name: "Limitless", tier: "daemon", license: "unknown", restricted: false, defaultEnabled: true, transport: "T1", bookTransport: "T1", needsCockpit: true, service: "limitless", clause: null }),
  trueo: policy({ id: "trueo", name: "Trueo", tier: "day_zero", license: "open", restricted: false, defaultEnabled: true, transport: "T0-RPC", bookTransport: "T0-RPC", needsCockpit: false, service: "rpc_base", clause: null }),
  world: policy({ id: "world", name: "World", tier: "not_built", license: "unknown", restricted: false, defaultEnabled: false, transport: "T3", bookTransport: "T3", needsCockpit: false, service: null, clause: null }),
  hyperliquid: policy({ id: "hyperliquid", name: "Hyperliquid outcomes", tier: "day_zero", license: "unknown", restricted: false, defaultEnabled: true, transport: "T0", bookTransport: "T0", needsCockpit: false, service: "hyperliquid_info", clause: null }),
  pascal: policy({ id: "pascal", name: "Pascal", tier: "day_zero", license: "unknown", restricted: false, defaultEnabled: true, transport: "T0", bookTransport: "T0", needsCockpit: false, service: "pascal", clause: null }),
  novig: policy({
    id: "novig",
    name: "Novig",
    tier: "restricted_off",
    license: "own_use_only",
    restricted: true,
    defaultEnabled: false,
    transport: "T0",
    bookTransport: "T0",
    needsCockpit: false,
    service: "novig",
    clause: `Novig's public catalog is treated as reference prices for your own use only: kept in memory, never exported${NOT_LEGAL_ADVICE}.`,
  }),
  og: policy({
    id: "og",
    name: "OG (CDNA)",
    tier: "restricted_off",
    license: "own_use_only",
    restricted: true,
    defaultEnabled: false,
    transport: "T0",
    bookTransport: "T0",
    needsCockpit: false,
    service: null,
    clause: `OG's data feed is licensed for non-commercial use: kept in memory, never exported${NOT_LEGAL_ADVICE}.`,
  }),
  gemini: policy({
    id: "gemini",
    name: "Gemini Predictions",
    tier: "restricted_off",
    license: "own_use_only",
    restricted: true,
    defaultEnabled: false,
    transport: "T0",
    bookTransport: "T0",
    needsCockpit: false,
    service: "gemini",
    clause: `Gemini market data is proprietary and covered by a separate Market Data Agreement: kept in memory, never exported${NOT_LEGAL_ADVICE}.`,
  }),
  sx: policy({ id: "sx", name: "SX Bet", tier: "daemon", license: "unknown", restricted: false, defaultEnabled: false, transport: "T1", bookTransport: "T1", needsCockpit: true, service: null, clause: null }),
  udx: policy({
    id: "udx",
    name: "Underdog Exchange",
    tier: "restricted_off",
    license: "own_use_only",
    restricted: true,
    defaultEnabled: false,
    transport: "T1",
    bookTransport: "T1",
    needsCockpit: true,
    service: null,
    clause: `Underdog Exchange is a US-only product tied to a linked Underdog account: kept in memory, never exported${NOT_LEGAL_ADVICE}.`,
  }),
  prophetx: policy({
    id: "prophetx",
    name: "ProphetX",
    tier: "not_built",
    license: "own_use_only",
    restricted: true,
    defaultEnabled: false,
    transport: "T2",
    bookTransport: "T2",
    needsCockpit: true,
    service: null,
    clause: `ProphetX data is licensed for internal use only and needs a partner key${NOT_LEGAL_ADVICE}.`,
  }),
  predictfun: policy({ id: "predictfun", name: "Predict.fun", tier: "not_built", license: "unknown", restricted: false, defaultEnabled: false, transport: "T2", bookTransport: "T2", needsCockpit: true, service: null, clause: null }),
  opinion: policy({ id: "opinion", name: "Opinion", tier: "not_built", license: "unknown", restricted: false, defaultEnabled: false, transport: "T0", bookTransport: "T0", needsCockpit: false, service: null, clause: null }),
  manifold: policy({ id: "manifold", name: "Manifold", tier: "day_zero", license: "unknown", restricted: false, defaultEnabled: true, transport: "T0", bookTransport: "T0", needsCockpit: false, service: "manifold", clause: null }),
  myriad: policy({ id: "myriad", name: "Myriad", tier: "reference_only", license: "unknown", restricted: false, defaultEnabled: false, transport: "T0", bookTransport: "T0", needsCockpit: false, service: null, clause: null }),
} as const satisfies Record<VenueId, VenuePolicy>;

export const VENUE_IDS = Object.freeze(Object.keys(POLICIES) as VenueId[]);

export function isVenueId(value: unknown): value is VenueId {
  return typeof value === "string" && Object.hasOwn(POLICIES, value);
}

// Fail closed: nothing about an unknown venue is allowed.
export const UNKNOWN_VENUE_POLICY: VenuePolicy = policy({
  id: "unknown",
  name: "Unknown venue",
  tier: "unknown",
  license: "unknown",
  restricted: true,
  defaultEnabled: false,
  transport: "T2",
  bookTransport: "T2",
  needsCockpit: true,
  service: null,
  clause: null,
});

export function venuePolicy(id: unknown): VenuePolicy {
  return isVenueId(id) ? POLICIES[id] : UNKNOWN_VENUE_POLICY;
}

// R3: restricted-terms data (and anything whose licence is unknown) is held in memory only.
export function isMemoryOnly(id: unknown): boolean {
  const p = venuePolicy(id);
  return p.restricted || licensePolicy(p.license).memoryOnly;
}

// ---- switches ---------------------------------------------------------------------------------------------------------------

// Bump when a clause text changes materially: an acceptance of an older version no longer counts.
export const DISCLOSURE_VERSION = "1";

export interface VenueSwitches {
  readonly enabled: Readonly<Partial<Record<VenueId, boolean>>>;
  // venue -> the DISCLOSURE_VERSION the user accepted for it.
  readonly disclosureAccepted: Readonly<Partial<Record<VenueId, string>>>;
}

export const DEFAULT_SWITCHES: VenueSwitches = Object.freeze({ enabled: Object.freeze({}), disclosureAccepted: Object.freeze({}) });

export type BuildKind = "standalone" | "cockpit";
export type VenueState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: "unknown_venue" | "not_available" | "restricted_off" | "needs_cockpit" | "switched_off" };

// The one answer to "may this venue's adapter run?". Order matters: a restricted venue reads "off: restricted
// terms" in the standalone build even though it also needs the Cockpit (M0-2).
export function venueState(id: unknown, switches: VenueSwitches, build: BuildKind): VenueState {
  if (!isVenueId(id)) return { enabled: false, reason: "unknown_venue" };
  const p = POLICIES[id];
  if (p.tier === "not_built") return { enabled: false, reason: "not_available" };
  const chosen = switches.enabled[id];
  const wanted = chosen ?? p.defaultEnabled;
  if (p.restricted) {
    if (chosen !== true || switches.disclosureAccepted[id] !== DISCLOSURE_VERSION) return { enabled: false, reason: "restricted_off" };
  } else if (!wanted) {
    return { enabled: false, reason: "switched_off" };
  }
  if (p.needsCockpit && build === "standalone") return { enabled: false, reason: "needs_cockpit" };
  return { enabled: true };
}

// ---- provenance --------------------------------------------------------------------------------------------------------------

export interface ProvInput {
  readonly venue: VenueId;
  readonly source: string;
  readonly fetchedAtMs: number;
  readonly nowMs: number;
  readonly ttlMs: number;
  readonly venueTsMs?: number;
  // Defaults to the venue's market-list transport.
  readonly transport?: Transport;
}

// Provenance for a fetched body. The licence comes from the policy table, never from the response.
export function makeProv(input: ProvInput): Prov {
  const p = venuePolicy(input.venue);
  return Object.freeze({
    venue: input.venue,
    source: input.source,
    fetchedAtMs: input.fetchedAtMs,
    ...(input.venueTsMs === undefined ? {} : { venueTsMs: input.venueTsMs }),
    transport: input.transport ?? p.transport,
    freshness: freshnessOf(input.fetchedAtMs, input.ttlMs, input.nowMs),
    ttlMs: input.ttlMs,
    license: p.license,
  });
}
