// Link record schema (docs/market-linking-design.md section 5, aggregation-design section 4.2).
//
// A link is a human-approved, hash-pinned statement about how two or more markets relate. The
// schema is closed: unknown fields and unknown enum values are refused, never ignored. Records
// hold ids, hashes, typed slot values and short quotes only. Quotes from restricted-terms venues
// (Kalshi) are refused, so nothing from those venues but ids and hashes can reach disk.

import * as z from "zod/v4";
import { canonicalSha256 } from "../hash.js";
import type { VenueId, VoidPolicy } from "../model.js";

export const LINK_SCHEMA_VERSION = 1;

// The venues a leg may name: the venues the aggregation layer reads (pm/types.ts VENUE_IDS, which a compile-time
// guard in pm/links/schema.ts keeps equal to this list). A record naming any other venue is refused.
export const LINK_VENUE_IDS = [
  "xo",
  "polymarket",
  "polymarket_us",
  "kalshi",
  "limitless",
  "trueo",
  "world",
  "predictfun",
  "opinion",
  "hyperliquid",
  "manifold",
] as const satisfies readonly VenueId[];
export type LinkVenueId = (typeof LINK_VENUE_IDS)[number];

// ---------------------------------------------------------------------------------------------
// Enums

export const RELATIONS = ["identity", "near_identity", "ladder", "partition", "complement", "related"] as const;
export type Relation = (typeof RELATIONS)[number];

export const LADDER_AXES = ["threshold", "date"] as const;
// How the YES price must move along the leg order: "decreasing" means p(leg i) >= p(leg i+1).
export const LADDER_MONOTONICITY = ["decreasing", "increasing", "unknown"] as const;

export const BASIS_CLASSES = ["identical", "settlement_window", "settlement_source", "different"] as const;
export type BasisClass = (typeof BASIS_CLASSES)[number];

export const DIVERGENCE_AXES = [
  "timing_cutoff",
  "window_start",
  "measure_source",
  "void_policy",
  "tie_break",
  "early_close",
  "exception_clause",
  "other_fallback",
  "event_vs_state",
  "announcement_vs_occurrence",
  "oracle",
  "orientation",
  "universe",
  "reference_index",
] as const;
export type DivergenceAxis = (typeof DIVERGENCE_AXES)[number];

export const AXIS_SEVERITIES = ["minor", "major", "fatal"] as const;

// Axes the engine has no way to price (design section 8): a link carrying one is capped at
// indicative. Fatal severity on any axis does the same.
export const UNPRICED_AXES: readonly DivergenceAxis[] = [
  "exception_clause",
  "event_vs_state",
  "announcement_vs_occurrence",
  "orientation",
  "universe",
  "measure_source",
];

export const PROOF_LEVELS = [
  "P0_native",
  "P1_slot_equal",
  "P2_template",
  "P3_llm_assisted",
  "P4_human",
  // Deviation from P0..P4: a candidate proposed by statistics or retrieval with no deterministic
  // proof at all. It can only become approved through a human decision, which records P4.
  "P_unproven",
] as const;
export type ProofLevel = (typeof PROOF_LEVELS)[number];

export const EVIDENCE_METHODS = [
  "native_hook",
  "slot_equal",
  "template",
  "llm_quoted",
  "human_review",
  // Recorded for the reviewer's information. Never counts as proof (design G15).
  "statistics_hint",
] as const;
export type EvidenceMethod = (typeof EVIDENCE_METHODS)[number];

export const EXHAUSTIVENESS = [
  "E0_unknown",
  "E1_exclusive_only",
  "E2_by_rule_clause",
  "E3_support_cover",
  "E4_template",
] as const;
export type Exhaustiveness = (typeof EXHAUSTIVENESS)[number];

export const LINK_STATES = ["approved", "candidate", "suspended", "revoked"] as const;
export type LinkState = (typeof LINK_STATES)[number];

// executable_arbitrage is deliberately not a value: it stays disabled until the D2 criteria hold
// (aggregation-design D2), so a record that names it is an unknown enum and is refused.
export const TIERS = ["indicative_discrepancy", "structural_violation", "hedged_discrepancy"] as const;
export type Tier = (typeof TIERS)[number];

export const PROPOSER_SOURCES = ["structural", "native_hook", "manual", "llm", "statistics"] as const;
export type ProposerSource = (typeof PROPOSER_SOURCES)[number];

// Compile-time guard: this list must stay in step with VoidPolicy in sdk/model.ts.
export const VOID_POLICIES = [
  "fifty_fifty",
  "refund",
  "last_traded_price",
  "scalar",
  "invalid_reverse_trades",
  "unknown",
] as const satisfies readonly VoidPolicy[];
type MissingVoid = Exclude<VoidPolicy, (typeof VOID_POLICIES)[number]>;
const _voidExhaustive: [MissingVoid] extends [never] ? true : never = true;
void _voidExhaustive;

// Venues whose terms bar (or may bar) caching or aggregating their data. For these, records may
// hold ids, hashes and short codes only: no quotes, no titles, no free text derived from the venue.
// The SDK holds no platform registry, so the host injects the terms: a predicate that is true only
// for a venue whose recorded terms allow keeping derived text. It must answer false for a venue it
// does not record or records with unknown terms (unknown terms are restricted terms). pm binds its
// platform registry's termsAllowPersistence (pm/links/schema.ts).
export type PersistenceTerms = (venue: string) => boolean;

export function isRestrictedVenue(venue: string, terms: PersistenceTerms): boolean {
  return !terms(venue);
}

// ---------------------------------------------------------------------------------------------
// Primitive schemas

export const SYNTHETIC_PREFIX = "SYNTHETIC-";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, "expected 64 lowercase hex characters");

const NO_CONTROL = /^[^\p{Cc}\p{Cf}\p{Cs}]*$/u;
function text(min: number, max: number): z.ZodString {
  return z.string().min(min).max(max).regex(NO_CONTROL, "control or format characters are not allowed");
}

export const handle = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/, "handle must be 2-40 chars of A-Za-z0-9._-");

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function validUtc(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().replace(".000Z", "Z") === value;
}
export const dateOnly = z.string().refine(validDateOnly, "expected a real calendar date YYYY-MM-DD");
export const utcStamp = z.string().refine(validUtc, "expected a UTC timestamp YYYY-MM-DDTHH:MM:SSZ");

export const marketId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:\-]*$/, "market id has unsupported characters")
  .refine((v) => !/0x[0-9a-fA-F]*[A-F]/.test(v), "hex ids must be lowercase");

const venueId = z.enum(LINK_VENUE_IDS);
const legIndex = z.int().min(0).max(31);

// ---------------------------------------------------------------------------------------------
// Records

export const legSchema = z.strictObject({
  venue: venueId,
  marketId,
  // outcomeMap[i] = index, in legs[0]'s outcome list, of the outcome this leg lists at index i.
  // legs[0] must be the identity map. Never derived from outcome order or labels.
  outcomeMap: z.array(z.int().min(0).max(31)).min(1).max(32),
  rulesSha256: hex64,
  maskedSha256: hex64,
  closeUtc: utcStamp,
  voidPolicy: z.enum(VOID_POLICIES),
  // Pinned resolver (for XO the creator-specified resolver address). Null means not recorded.
  resolverId: marketId.nullable(),
  // XO only: true if the creator and resolver are on the allowlist (design G7). Null = unknown.
  creatorAllowlisted: z.boolean().nullable(),
  // Venue group key (rootEventSlug, event ticker, negRiskMarketID) when relevant.
  groupKey: marketId.nullable(),
});
export type LinkLeg = z.infer<typeof legSchema>;

export const axisInstanceSchema = z.strictObject({
  axis: z.enum(DIVERGENCE_AXES),
  legA: legIndex,
  legB: legIndex,
  a: text(1, 80),
  b: text(1, 80),
  severity: z.enum(AXIS_SEVERITIES),
  // Short verbatim quotes of the two rule texts. Refused for restricted venues.
  quoteA: text(1, 300).optional(),
  quoteB: text(1, 300).optional(),
});
export type AxisInstance = z.infer<typeof axisInstanceSchema>;

export const evidenceSchema = z.strictObject({
  method: z.enum(EVIDENCE_METHODS),
  detail: text(1, 200),
  legIndex: legIndex.optional(),
  quote: text(1, 300).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const ladderSchema = z.strictObject({
  axis: z.enum(LADDER_AXES),
  monotonicity: z.enum(LADDER_MONOTONICITY),
});

export const basisSchema = z.strictObject({
  class: z.enum(BASIS_CLASSES),
  axes: z.array(axisInstanceSchema).max(32),
  // Absolute difference of the legs' resolution cutoffs in minutes. Null = not computed yet.
  cutoffDeltaMinutes: z.int().min(0).max(5_256_000).nullable(),
});

export const proofSchema = z.strictObject({
  level: z.enum(PROOF_LEVELS),
  evidence: z.array(evidenceSchema).max(24),
});

export const proposedBySchema = z.strictObject({
  source: z.enum(PROPOSER_SOURCES),
  id: handle,
  at: dateOnly,
});

export const approvalSchema = z.strictObject({
  reviewer: handle,
  date: dateOnly,
  evidence: z.array(text(1, 300)).min(1).max(8),
  // content digest the reviewer saw (see contentSha256)
  digest: hex64,
});
export type Approval = z.infer<typeof approvalSchema>;

const linkId = z.string().regex(/^lnk_[0-9a-f]{32}$/, "bad link id");

export const linkSchema = z.strictObject({
  schemaVersion: z.literal(LINK_SCHEMA_VERSION),
  linkId,
  relation: z.enum(RELATIONS),
  ladder: ladderSchema.optional(),
  exhaustiveness: z.enum(EXHAUSTIVENESS).optional(),
  legs: z.array(legSchema).min(2).max(32),
  basis: basisSchema,
  proof: proofSchema,
  templateId: text(1, 60).optional(),
  state: z.enum(LINK_STATES),
  tierCap: z.enum(TIERS),
  proposedBy: proposedBySchema,
  approvals: z.array(approvalSchema).max(4),
  reviewer: handle.optional(),
  reviewedAt: dateOnly.optional(),
  stateReason: text(1, 300).optional(),
  stateChangedBy: handle.optional(),
  stateChangedAt: dateOnly.optional(),
  // Earlier of the legs' closes (a reviewer may set it earlier).
  validUntil: utcStamp,
  // Test fixtures only. Real records never carry it; bundle loaders refuse it by default.
  synthetic: z.boolean(),
});
export type Link = z.infer<typeof linkSchema>;

// Input for `propose`: a link before it has an id, a state or any review.
export const candidateInputSchema = z.strictObject({
  relation: z.enum(RELATIONS),
  ladder: ladderSchema.optional(),
  exhaustiveness: z.enum(EXHAUSTIVENESS).optional(),
  legs: z.array(legSchema).min(2).max(32),
  basis: basisSchema,
  proof: proofSchema,
  templateId: text(1, 60).optional(),
  validUntil: utcStamp,
  synthetic: z.boolean(),
});
export type CandidateInput = z.infer<typeof candidateInputSchema>;

// ---------------------------------------------------------------------------------------------
// Identity and digests

interface IdentityFields {
  readonly relation: Relation;
  readonly ladder?: Link["ladder"];
  readonly exhaustiveness?: Link["exhaustiveness"];
  readonly legs: readonly LinkLeg[];
}

// Content-addressed: the id covers the relation and every leg's market, outcome map and both
// hashes. A change to any pin is therefore a different link, never a silent revision.
export function computeLinkId(fields: IdentityFields): string {
  const digest = canonicalSha256({
    relation: fields.relation,
    ladder: fields.ladder,
    exhaustiveness: fields.exhaustiveness,
    legs: fields.legs.map((leg) => ({
      venue: leg.venue,
      marketId: leg.marketId,
      outcomeMap: leg.outcomeMap,
      rulesSha256: leg.rulesSha256,
      maskedSha256: leg.maskedSha256,
    })),
  });
  return `lnk_${digest.slice(0, 32)}`;
}

// What a reviewer signs off on: everything about the proposal, nothing about review state. The
// proof object is never edited after proposal; a human approval is recorded in `approvals`.
export function contentSha256(link: CandidateInput | Link): string {
  return canonicalSha256({
    relation: link.relation,
    ladder: link.ladder,
    exhaustiveness: link.exhaustiveness,
    legs: link.legs,
    basis: link.basis,
    proof: link.proof,
    templateId: link.templateId,
    validUntil: link.validUntil,
    synthetic: link.synthetic,
  });
}

// Pin over the whole record including state, used by bundle manifests.
export function recordSha256(link: Link): string {
  return canonicalSha256(link);
}

export function isCrossVenue(link: Pick<Link, "legs">): boolean {
  return new Set(link.legs.map((l) => l.venue)).size > 1;
}

export function legsVenues(link: Pick<Link, "legs">): LinkVenueId[] {
  return [...new Set(link.legs.map((l) => l.venue))].sort();
}
