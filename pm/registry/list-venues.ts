// pm_list_venues data function: an offline registry view. It never touches the network, so it
// doubles as the conformance sample call. The clock is injected so output is deterministic.
//
// Rules the view enforces:
//  - Freshness is computed per section. Expired sections show "unknown"; stale ones show the value
//    with its age. `gateUsable` says whether a gate may rely on the section (fresh and H, or M with
//    a cross-check); a stale gate-class section reads as not usable, never as fresh.
//  - A capability shows "yes" only when the flag is recorded as "yes". Everything else, including a
//    recorded "no", shows "unproven".
//  - No `notes`, no dollar metrics and no third-party text: every string here is a fixed registry
//    value (see validate.ts), so nothing needs the untrusted slot.
//  - The view never says a venue is profitable or arbitrage-ready.

import * as z from "zod/v4";
import { REGISTRY_VENUE_IDS, isRegistryVenueId, type RegistryVenueId } from "./ids.js";
import {
  REGISTRY_AS_OF,
  REGISTRY_SCHEMA_VERSION,
  REGISTRY_VERSION,
  allPlatforms,
  dataPolicy,
  registryContentSha256,
} from "./registry.js";
import { derivePools } from "./pools.js";
import {
  SECTION_KEYS,
  SECTION_POLICY,
  freshness,
  gateUsable,
  readSection,
  type Freshness,
  type Section,
  type SectionKey,
} from "./staleness.js";
import {
  READ_CAP_KEYS,
  type CapabilityFlag,
  type ExecClass,
  type LiquidityTier,
  type PlatformRecord,
} from "./types.js";

export type Shown = "yes" | "unproven";

export function capabilityDisplay(flag: CapabilityFlag): Shown {
  return flag === "yes" ? "yes" : "unproven";
}

const EXEC_CLASSES = ["E1", "E2", "E3", "E4", "E5", "unknown"] as const satisfies readonly ExecClass[];
const TIERS = ["A", "B", "C", "D", "X", "unknown"] as const satisfies readonly LiquidityTier[];

export const listVenuesInputSchema = z.strictObject({
  // Restrict to these registry ids. Omit for all.
  venues: z.array(z.enum(REGISTRY_VENUE_IDS)).max(REGISTRY_VENUE_IDS.length).optional(),
  reachability: z.array(z.enum(EXEC_CLASSES)).max(EXEC_CLASSES.length).optional(),
  tiers: z.array(z.enum(TIERS)).max(TIERS.length).optional(),
  // true = only memory-only (restricted or unknown terms) venues, false = only the others.
  memoryOnly: z.boolean().optional(),
});
export type ListVenuesInput = z.infer<typeof listVenuesInputSchema>;

export interface SectionStatus {
  readonly lastVerified: string;
  readonly ttlDays: number;
  readonly freshness: Freshness;
  readonly ageDays: number | null;
  readonly confidence: string;
  readonly verification: "verified" | "unverified";
  readonly gateUsable: boolean;
}

// A value that was hidden because its section is expired reads "unknown".
type Maybe<T> = T | "unknown";

export interface VenueRow {
  readonly id: RegistryVenueId;
  readonly name: Maybe<string>;
  readonly depth: "full" | "light";
  readonly adapterPriority: string;
  readonly pool: RegistryVenueId;
  readonly status: Maybe<string>;
  readonly kind: Maybe<{ operatorType: string; scope: string; moneyType: string }>;
  readonly liquidityTier: Maybe<string>;
  readonly fees: Maybe<{ modelId: string; feeSpecId: string; status: string; useRule: string }>;
  readonly geo: Maybe<{
    usPersons: string;
    geoModel: string;
    botsPolicy: string;
    washTradingProhibited: string;
    restrictedRegions: readonly string[] | "unknown";
    note: string;
  }>;
  readonly reachability: Maybe<{ class: string; proof: string; unattendedOk: Shown }>;
  // Every capability is "yes" or "unproven".
  readonly capabilities: Maybe<Readonly<Record<string, Shown>>>;
  readonly resolution: Maybe<{ mechanisms: readonly string[]; void: string; discretionarySettlement: Shown }>;
  readonly dataTerms: {
    readonly restricted: string;
    readonly memoryOnly: boolean;
    readonly adapterDefault: "on" | "off";
    readonly clause: string;
  };
  readonly sections: Readonly<Record<SectionKey, SectionStatus>>;
}

export interface ListVenuesResult {
  readonly registryVersion: string;
  readonly schemaVersion: string;
  readonly contentSha256: string;
  readonly compiledFromNotesAsOf: string;
  readonly asOfMs: number;
  readonly count: number;
  readonly venues: readonly VenueRow[];
  readonly notices: readonly string[];
}

export type ListVenuesError = { readonly ok: false; readonly error: "BAD_INPUT" | "BAD_CLOCK"; readonly detail: string };
export type ListVenuesOutcome = { readonly ok: true; readonly value: ListVenuesResult } | ListVenuesError;

const NOTICES: readonly string[] = [
  "Registry facts are pointers compiled from research notes, not live data. Anything labelled unverified was not confirmed first-hand.",
  "A capability shows yes only when it is recorded as yes. Everything else is unproven.",
  "Region lists are evidence for display. Eligibility needs a live check from your own client, never this list.",
  "Venues with restricted or unknown data terms are memory-only and their adapters are off by default.",
  "This view lists venues; it does not rank them as profitable and it is not trading advice.",
];

function status(section: Section<unknown>, nowMs: number): SectionStatus {
  const read = readSection(section, "display", nowMs);
  return {
    lastVerified: section.meta.lastVerified,
    ttlDays: section.meta.ttlDays,
    freshness: freshness(section.meta, nowMs),
    ageDays: read.ageDays,
    confidence: section.meta.confidence,
    verification: section.meta.verification,
    gateUsable: gateUsable(section.meta, nowMs),
  };
}

// Display-class read: the value if the section is fresh or stale, "unknown" if expired.
function shown<T, R>(section: Section<T>, nowMs: number, project: (v: T) => R): Maybe<R> {
  const read = readSection(section, "display", nowMs);
  return read.usable ? project(read.value) : "unknown";
}

function row(rec: PlatformRecord, pool: RegistryVenueId, nowMs: number): VenueRow {
  const sections = {} as Record<SectionKey, SectionStatus>;
  for (const key of SECTION_KEYS) sections[key] = status(rec[key] as Section<unknown>, nowMs);
  const policy = dataPolicy(rec, nowMs);
  return {
    id: rec.id,
    name: shown(rec.identity, nowMs, (v) => v.name),
    depth: rec.depth,
    adapterPriority: rec.adapterPriority,
    pool,
    status: shown(rec.status, nowMs, (v) => v.state),
    kind: shown(rec.kind, nowMs, (v) => ({
      operatorType: v.operatorType,
      scope: v.scope,
      moneyType: v.moneyType,
    })),
    liquidityTier: shown(rec.liquidity, nowMs, (v) => v.tier),
    fees: shown(rec.fees, nowMs, (v) => ({
      modelId: v.modelId,
      feeSpecId: v.feeSpecId,
      status: v.status,
      useRule: v.useRule,
    })),
    geo: shown(rec.geo, nowMs, (v) => ({
      usPersons: v.usPersons,
      geoModel: v.geoModel,
      botsPolicy: v.botsPolicy,
      washTradingProhibited: capabilityDisplay(v.washTradingProhibited),
      restrictedRegions: v.restrictedRegions ?? "unknown",
      note: "Evidence only. Check eligibility from your own client.",
    })),
    reachability: shown(rec.reachability, nowMs, (v) => ({
      class: v.class,
      proof: v.proof,
      unattendedOk: capabilityDisplay(v.unattendedOk),
    })),
    capabilities: shown(rec.api, nowMs, (v) => {
      const out: Record<string, Shown> = {
        readKeyless: capabilityDisplay(v.read.publicKeyless),
        tradeApi: capabilityDisplay(v.trade.exists),
      };
      for (const key of READ_CAP_KEYS) out[key] = capabilityDisplay(v.read.has[key]);
      return out;
    }),
    resolution: shown(rec.resolution, nowMs, (v) => ({
      mechanisms: v.mechanisms,
      void: v.void,
      discretionarySettlement: capabilityDisplay(v.discretionarySettlement),
    })),
    dataTerms: {
      restricted: rec.dataTerms.value.restricted,
      memoryOnly: policy.memoryOnly,
      adapterDefault: policy.adapterDefault,
      clause: policy.clause,
    },
    sections,
  };
}

export function listVenues(input: unknown, nowMs: number): ListVenuesOutcome {
  if (!Number.isFinite(nowMs)) return { ok: false, error: "BAD_CLOCK", detail: "nowMs must be a finite number" };
  const parsed = listVenuesInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: "BAD_INPUT", detail: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const q = parsed.data;
  const records = allPlatforms();
  const { poolOf } = derivePools(
    records.map((rec) => ({ id: rec.id, liquidityLinks: rec.links.value.liquidityLinks })),
  );

  const rows: VenueRow[] = [];
  for (const rec of records) {
    if (q.venues !== undefined && !q.venues.includes(rec.id)) continue;
    const r = row(rec, poolOf.get(rec.id) ?? rec.id, nowMs);
    // Filters use the same fail-closed reads the row shows: a hidden (expired) value matches nothing.
    if (q.reachability !== undefined) {
      const cls = r.reachability === "unknown" ? "unknown" : (r.reachability.class as ExecClass);
      if (!q.reachability.includes(cls)) continue;
    }
    if (q.tiers !== undefined) {
      const tier = r.liquidityTier === "unknown" ? "unknown" : (r.liquidityTier as LiquidityTier);
      if (!q.tiers.includes(tier)) continue;
    }
    if (q.memoryOnly !== undefined && r.dataTerms.memoryOnly !== q.memoryOnly) continue;
    rows.push(r);
  }

  return {
    ok: true,
    value: {
      registryVersion: REGISTRY_VERSION,
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      contentSha256: registryContentSha256(),
      compiledFromNotesAsOf: REGISTRY_AS_OF,
      asOfMs: nowMs,
      count: rows.length,
      venues: rows,
      notices: NOTICES,
    },
  };
}

export { SECTION_POLICY, isRegistryVenueId };
