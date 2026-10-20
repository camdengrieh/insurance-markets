// The shape of the bundled `links.json` (docs/dapp-design.md 4.5 "Linked groups", research 26 section 9.1).
//
// Rule R2: the bundle holds ids, hashes, close times, outcome maps, proof and state, and NO third-party price, title or
// rules text. The schemas are strict, so a title, a price or any extra text in the file makes the whole dataset invalid
// instead of being quietly shown. A dataset is also pinned by a content hash (see dataset.ts); a file without one is
// refused.

import * as z from "zod/v4";

import { VENUE_IDS } from "../../../core/venue-policy";
import type { VenueId } from "../../../core/ports";

export const LINK_PROOFS = ["P0_native", "P1_slot_equal", "P2_template", "P3_llm_assisted", "P4_human"] as const;
export type LinkProof = (typeof LINK_PROOFS)[number];

export const LINK_STATES = ["proposed", "template_approved", "human_approved", "executable_eligible", "quarantined", "suspended", "rejected", "expired"] as const;
export type LinkState = (typeof LINK_STATES)[number];

export const LINK_RELATIONS = [
  "identity",
  "complement",
  "subset",
  "superset",
  "overlap",
  "disjoint",
  "partition",
  "ladder_threshold",
  "ladder_date",
  "implication",
  "exclusive",
  "joint",
] as const;
export type LinkRelation = (typeof LINK_RELATIONS)[number];

export const BASIS_CLASSES = ["identical", "settlement_window", "settlement_source"] as const;
export const BASIS_AXES = ["timing", "source", "condition_scope"] as const;

// A hash of 32 bytes, lowercase hex without a prefix.
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
// An id the venue's own reader takes as `MarketRef.marketId`, or a Quotient marketKey. No spaces, no markup.
const nativeId = z.string().regex(/^[A-Za-z0-9_.:#-]{1,120}$/);
const isoInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/);

const venueId = z.enum(VENUE_IDS as [VenueId, ...VenueId[]]);

export const linkLegSchema = z
  .object({
    venue: venueId,
    nativeId,
    // Quotient's marketKey for this leg ("polymarket:123"), when it has one: the join key to a Quotient row.
    quotientKey: z.string().regex(/^[a-z_]{3,20}:[A-Za-z0-9_.#-]{1,100}$/).optional(),
    rulesSha256: sha256Hex,
    maskedSha256: sha256Hex.optional(),
    closeUtc: isoInstant,
    // Which of this venue's outcomes plays "yes" of the link, by index.
    outcomeMap: z.array(z.number().int().min(0).max(9)).min(1).max(10),
    resolverId: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/).optional(),
  })
  .strict();
export type LinkLeg = z.infer<typeof linkLegSchema>;

export const linkSchema = z
  .object({
    linkId: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
    relation: z.enum(LINK_RELATIONS),
    legs: z.array(linkLegSchema).min(2).max(4),
    proof: z.enum(LINK_PROOFS),
    state: z.enum(LINK_STATES),
    basis: z.object({ class: z.enum(BASIS_CLASSES), axes: z.array(z.enum(BASIS_AXES)).max(3) }).strict(),
    // "passed" only when the link's class has cleared its settlement bound (aggregation-design D2). Absent is unproven.
    bound: z.enum(["passed", "unproven"]).optional(),
    validUntil: isoInstant,
  })
  .strict();
export type Link = z.infer<typeof linkSchema>;

export const MAX_LINKS = 10_000;

export const linkDatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    // The release date of the dataset (YYYY-MM-DD).
    release: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    links: z.array(linkSchema).max(MAX_LINKS),
    // sha256 over the canonical JSON of {schemaVersion, release, links}. Required: see dataset.ts.
    contentSha256: sha256Hex,
  })
  .strict();
export type LinkDataset = z.infer<typeof linkDatasetSchema>;
