// Reader for the platform registry (docs/platform-registry-design.md sections 3.1 to 3.5, 3.8, 3.9): venue FACTS
// with a source, a date and a time-to-live per section. Unknown fails closed.
//
// Rules this reader implements:
//   - the registry informs gates, it never authorises execution (3.1 rule 7);
//   - an unknown enum value rejects that whole platform record, and the platform then reads as unknown (3.2);
//   - staleness is computed from `last_verified` and `ttl_days`, never stored (3.5):
//       fresh    age <= ttl            display, screen, gate
//       stale    ttl < age <= 2 x ttl  display (with the age), screen degraded, gate BLOCKED
//       expired  age > 2 x ttl         value hidden, reads as unknown everywhere
//   - a gate may use a value only if it is fresh AND (confidence H, or M with a recorded cross-check); vendor
//     claims and confidence L never gate;
//   - a missing registry, platform or section is "unknown", never a default.
//
// No registry data ships with this release (the registry itself is design only: data/registry/ does not exist),
// so every read answers unknown until a registry file is loaded. The reader is pure: the clock is a parameter.

import * as z from "zod/v4";

import type { VenueId } from "./ports";

const DAY_MS = 86_400_000;

export const REGISTRY_SCHEMA_MAJOR = 0;

const METHODS = ["primary_doc", "live_api", "onchain_read", "derived", "third_party", "vendor_claim"] as const;
const CONFIDENCE = ["H", "M", "L"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const sourceSchema = z.object({
  url: z.string().min(1).max(500),
  retrieved: isoDate,
  locator: z.string().max(200).optional(),
  // At most 25 words of evidence (3.1 rule 2).
  quote: z
    .string()
    .max(400)
    .refine((text) => text.trim().split(/\s+/).length <= 25, "quote over 25 words")
    .optional(),
  page_sha256: z.string().nullable().optional(),
});

export const sectionMetaSchema = z
  .object({
    last_verified: isoDate,
    ttl_days: z.number().int().min(1).max(3650),
    verified_by: z.string().max(80),
    method: z.enum(METHODS),
    confidence: z.enum(CONFIDENCE),
    // "M with a recorded cross-check" may gate (3.5). Absent means not cross-checked.
    cross_checked: z.boolean().optional(),
    sources: z.array(sourceSchema).min(1).max(20),
    field_sources: z.record(z.string(), z.array(z.number().int().min(0))).optional(),
  })
  .strict();
export type SectionMeta = z.infer<typeof sectionMetaSchema>;

const triBool = z.boolean().nullable();

const statusSection = z.object({ meta: sectionMetaSchema, state: z.enum(["live", "beta", "waitlist", "inactive", "deprecated", "dead", "dark", "unknown"]) });
const geoSection = z.object({
  meta: sectionMetaSchema,
  us_persons: z.enum(["allowed", "close_only", "blocked", "unknown"]),
  geo_model: z.enum(["everyone", "global_restrictions", "allowlist", "checked_at_point_of_use", "unknown"]),
  restricted_iso2: z.array(z.string().regex(/^[A-Z]{2}$/)).max(300).nullable(),
  allowed_iso2: z.array(z.string().regex(/^[A-Z]{2}$/)).max(300).nullable(),
  enforcement: z.enum(["ip", "login", "kyc", "attestation", "none", "unknown"]),
  bots_policy: z.enum(["allowed", "conditional", "prohibited", "unknown"]),
  wash_trading_prohibited: triBool,
});
const apiSection = z.object({
  meta: sectionMetaSchema,
  read: z.object({ public_keyless: triBool, auth: z.enum(["none", "api_key", "signed", "partner", "unknown"]) }),
});
const feesSection = z.object({
  meta: sectionMetaSchema,
  model: z.enum(["curve_pq", "curve_min", "ad_valorem_bps", "profit_pct", "amm_stack", "unknown"]),
  status: z.enum(["verified", "conflicted", "stale", "unknown"]),
  use_rule: z.string().max(80).nullable().optional(),
});
const resolutionSection = z.object({
  meta: sectionMetaSchema,
  oracle_types: z.array(z.enum(["uma_oo", "pyth", "chainlink", "ai_panel", "venue_staff", "community_vote", "manual", "external_venue_parity", "unknown"])).max(10),
  void_policy: z.object({ kind: z.enum(["fifty_fifty", "refund", "last_traded_price", "invalid_reverse_trades", "unknown"]) }),
  discretionary_settlement: triBool,
  early_close_possible: triBool,
});

const SECTION_SCHEMAS = {
  status: statusSection,
  regulation_geo: geoSection,
  api: apiSection,
  fees: feesSection,
  resolution: resolutionSection,
} as const;
export type SectionName = keyof typeof SECTION_SCHEMAS;
export const SECTION_NAMES = Object.freeze(Object.keys(SECTION_SCHEMAS) as SectionName[]);
export type SectionValue<S extends SectionName> = z.infer<(typeof SECTION_SCHEMAS)[S]>;

const platformSchema = z.object({
  platform_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  record_depth: z.enum(["full", "light", "radar"]).optional(),
  status: statusSection.optional(),
  regulation_geo: geoSection.optional(),
  api: apiSection.optional(),
  fees: feesSection.optional(),
  resolution: resolutionSection.optional(),
});
export type PlatformRecord = z.infer<typeof platformSchema>;

const fileSchema = z.object({
  schema_version: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/),
  registry_version: z.string().max(40),
  platforms: z.array(z.unknown()).max(500),
});

export interface RegistryIssue {
  // The platform id when it could be read, else the index.
  readonly where: string;
  readonly problem: string;
}

export interface Registry {
  readonly schemaVersion: string;
  readonly registryVersion: string;
  readonly platforms: ReadonlyMap<string, PlatformRecord>;
}

export const EMPTY_REGISTRY: Registry = Object.freeze({ schemaVersion: "0.0", registryVersion: "none", platforms: new Map<string, PlatformRecord>() });

export interface ParsedRegistry {
  readonly registry: Registry;
  readonly issues: readonly RegistryIssue[];
}

// A registry file -> the usable records. A record that fails validation (an unknown enum value, a missing source,
// a bad date) is DROPPED and reported; the platform then reads as unknown. A file of an unsupported major
// version yields the empty registry.
export function parseRegistry(json: unknown): ParsedRegistry {
  const file = fileSchema.safeParse(json);
  if (!file.success) return { registry: EMPTY_REGISTRY, issues: [{ where: "file", problem: "not a registry file" }] };
  const major = Number(file.data.schema_version.split(".")[0]);
  if (major !== REGISTRY_SCHEMA_MAJOR) {
    return { registry: EMPTY_REGISTRY, issues: [{ where: "file", problem: `unsupported schema major ${major}` }] };
  }
  const platforms = new Map<string, PlatformRecord>();
  const issues: RegistryIssue[] = [];
  file.data.platforms.forEach((raw, index) => {
    const parsed = platformSchema.safeParse(raw);
    const idHint = typeof raw === "object" && raw !== null && typeof (raw as { platform_id?: unknown }).platform_id === "string" ? (raw as { platform_id: string }).platform_id : `#${index}`;
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      issues.push({ where: idHint.slice(0, 64), problem: first === undefined ? "invalid record" : `${first.path.join(".")}: ${first.message}`.slice(0, 200) });
      return;
    }
    if (platforms.has(parsed.data.platform_id)) {
      issues.push({ where: parsed.data.platform_id, problem: "duplicate platform id; both dropped" });
      platforms.delete(parsed.data.platform_id);
      return;
    }
    platforms.set(parsed.data.platform_id, parsed.data);
  });
  return { registry: Object.freeze({ schemaVersion: file.data.schema_version, registryVersion: file.data.registry_version, platforms }), issues };
}

// ---- staleness ---------------------------------------------------------------------------------------------------------------

export type Staleness = "fresh" | "stale" | "expired";

export function ageDays(meta: SectionMeta, nowMs: number): number | null {
  const verified = Date.parse(`${meta.last_verified}T00:00:00Z`);
  if (!Number.isFinite(verified) || !Number.isFinite(nowMs)) return null;
  return (nowMs - verified) / DAY_MS;
}

export function stalenessOf(meta: SectionMeta, nowMs: number): Staleness {
  const age = ageDays(meta, nowMs);
  // An unreadable date, or one more than a day in the future, is not trusted.
  if (age === null || age < -1) return "expired";
  if (age <= meta.ttl_days) return "fresh";
  if (age <= 2 * meta.ttl_days) return "stale";
  return "expired";
}

// ---- reading a fact ---------------------------------------------------------------------------------------------------------

export type Purpose = "display" | "screen" | "gate";

export type UnknownReason = "no_registry" | "no_platform" | "no_section" | "expired" | "stale_for_gate" | "not_gate_grade";

export type Fact<S extends SectionName> =
  | {
      readonly known: true;
      readonly value: SectionValue<S>;
      readonly staleness: Staleness;
      // Shown next to the value (3.5): the date it was last verified and its age in whole days.
      readonly lastVerified: string;
      readonly ageDays: number;
      readonly confidence: SectionMeta["confidence"];
      // A stale value used for display or screening is degraded and says so.
      readonly degraded: boolean;
    }
  | { readonly known: false; readonly reason: UnknownReason };

function gradeForGate(meta: SectionMeta): boolean {
  if (meta.method === "vendor_claim" || meta.confidence === "L") return false;
  return meta.confidence === "H" || (meta.confidence === "M" && meta.cross_checked === true);
}

export function readFact<S extends SectionName>(registry: Registry | null | undefined, platformId: string, section: S, purpose: Purpose, nowMs: number): Fact<S> {
  if (registry === null || registry === undefined || registry.platforms.size === 0) return { known: false, reason: "no_registry" };
  const record = registry.platforms.get(platformId);
  if (record === undefined) return { known: false, reason: "no_platform" };
  const value = record[section] as SectionValue<S> | undefined;
  if (value === undefined) return { known: false, reason: "no_section" };
  const meta = (value as { meta: SectionMeta }).meta;
  const staleness = stalenessOf(meta, nowMs);
  if (staleness === "expired") return { known: false, reason: "expired" };
  if (purpose === "gate") {
    if (staleness !== "fresh") return { known: false, reason: "stale_for_gate" };
    if (!gradeForGate(meta)) return { known: false, reason: "not_gate_grade" };
  }
  const age = ageDays(meta, nowMs) ?? 0;
  return { known: true, value, staleness, lastVerified: meta.last_verified, ageDays: Math.max(0, Math.floor(age)), confidence: meta.confidence, degraded: staleness === "stale" };
}

// ---- venue ids <-> platform ids -------------------------------------------------------------------------------------------

export const PLATFORM_ID_BY_VENUE: Readonly<Record<VenueId, string>> = Object.freeze({
  xo: "xo",
  polymarket: "polymarket",
  polymarket_us: "polymarket-us",
  kalshi: "kalshi",
  limitless: "limitless",
  trueo: "trueo",
  world: "world",
  hyperliquid: "hyperliquid-outcomes",
  pascal: "pascal",
  novig: "novig",
  og: "og",
  gemini: "gemini",
  sx: "sx-bet",
  udx: "underdog-exchange",
  prophetx: "prophetx",
  predictfun: "predict-fun",
  opinion: "opinion",
  manifold: "manifold",
  myriad: "myriad",
});

export function readVenueFact<S extends SectionName>(registry: Registry | null | undefined, venue: VenueId, section: S, purpose: Purpose, nowMs: number): Fact<S> {
  return readFact(registry, PLATFORM_ID_BY_VENUE[venue], section, purpose, nowMs);
}

// A mutual-eligibility flag is computed only when both venues' geography lists are fresh and complete (3.8 rule 3);
// anything else is "unknown", which blocks an `executable` label but not an `indicative` one.
export function geoListsComplete(fact: Fact<"regulation_geo">): boolean {
  return fact.known && fact.staleness === "fresh" && (fact.value.restricted_iso2 !== null || fact.value.allowed_iso2 !== null);
}
