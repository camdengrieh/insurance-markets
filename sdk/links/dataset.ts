// The published link dataset: the `links.json` the linker's export-app step writes (sdk/linker/dataset.ts) and the
// dApp bundles and reads (docs/dapp-design.md 4.5 "Linked groups", research 26 section 9.1). One contract for both
// ends: the writer checks every link against these schemas and the page parses the file with them.
//
// Rule R2: the dataset holds ids, hashes, close times, outcome maps, proof and state, and NO third-party price, title
// or rules text. The schemas are strict, so a title, a price or any extra text in the file makes the whole dataset
// invalid instead of being quietly shown. A dataset is also pinned by a content hash; a file without one is refused.

import * as z from "zod/v4";

import { canonicalJson, sha256Hex } from "../hash.js";
import type { VenueId } from "../model.js";
import { VENUE_IDS } from "../venues/policy.js";
import { BASIS_CLASSES, PROOF_LEVELS } from "./schema.js";

export const DATASET_SCHEMA_VERSION = 1;

// The registry's proof levels (schema.ts). P_unproven: a candidate proposed by statistics or retrieval with no
// deterministic proof.
export const DATASET_PROOFS = PROOF_LEVELS;
export type DatasetProof = (typeof DATASET_PROOFS)[number];

export const DATASET_STATES = ["proposed", "template_approved", "human_approved", "executable_eligible", "quarantined", "suspended", "rejected", "expired"] as const;
export type DatasetState = (typeof DATASET_STATES)[number];

export const DATASET_RELATIONS = [
  "identity",
  // Same question with a recorded rule difference (a timing axis, say): never identity (schema.ts).
  "near_identity",
  "related",
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
export type DatasetRelation = (typeof DATASET_RELATIONS)[number];

export const DATASET_BASIS_CLASSES = BASIS_CLASSES;
export const DATASET_BASIS_AXES = ["timing", "source", "condition_scope"] as const;
export type DatasetBasisAxis = (typeof DATASET_BASIS_AXES)[number];

// A hash of 32 bytes, lowercase hex without a prefix.
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
// An id the venue's own reader takes as `MarketRef.marketId`, or a Quotient marketKey. No spaces, no markup.
const nativeId = z.string().regex(/^[A-Za-z0-9_.:#-]{1,120}$/);
const isoInstant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/);

const venueId = z.enum(VENUE_IDS as [VenueId, ...VenueId[]]);

export const datasetLegSchema = z
  .object({
    venue: venueId,
    nativeId,
    // Quotient's marketKey for this leg ("polymarket:123"), when it has one: the join key to a Quotient row.
    quotientKey: z.string().regex(/^[a-z_]{3,20}:[A-Za-z0-9_.#-]{1,100}$/).optional(),
    rulesSha256: sha256,
    maskedSha256: sha256.optional(),
    closeUtc: isoInstant,
    // Which of this venue's outcomes plays "yes" of the link, by index.
    outcomeMap: z.array(z.number().int().min(0).max(9)).min(1).max(10),
    resolverId: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/).optional(),
    // The linker's category word for this market (sdk/category.ts), never venue text.
    category: z.string().regex(/^[a-z_]{1,32}$/).optional(),
  })
  .strict();
export type DatasetLeg = z.infer<typeof datasetLegSchema>;

// Score band of a statistical proposal, in words. Never a number: a similarity is not a probability.
export const DATASET_BANDS = ["strong", "good", "weak"] as const;
export type DatasetBand = (typeof DATASET_BANDS)[number];

export const datasetLinkSchema = z
  .object({
    linkId: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
    relation: z.enum(DATASET_RELATIONS),
    legs: z.array(datasetLegSchema).min(2).max(4),
    proof: z.enum(DATASET_PROOFS),
    state: z.enum(DATASET_STATES),
    basis: z.object({ class: z.enum(DATASET_BASIS_CLASSES), axes: z.array(z.enum(DATASET_BASIS_AXES)).max(3) }).strict(),
    // "passed" only when the link's class has cleared its settlement bound (aggregation-design D2). Absent is unproven.
    bound: z.enum(["passed", "unproven"]).optional(),
    validUntil: isoInstant,
    band: z.enum(DATASET_BANDS).optional(),
  })
  .strict();
export type DatasetLink = z.infer<typeof datasetLinkSchema>;

export const MAX_DATASET_LINKS = 10_000;

export const linkDatasetSchema = z
  .object({
    schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
    // The release date of the dataset (YYYY-MM-DD).
    release: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    links: z.array(datasetLinkSchema).max(MAX_DATASET_LINKS),
    // sha256 over the canonical JSON of {schemaVersion, release, links}. Required.
    contentSha256: sha256,
    // The recipe behind every leg's rulesSha256 (sdk/rules.ts "rules-v2" for a linker export). Absent means the
    // reader's own recipe. When it differs, a re-check cannot compare rules and must say so.
    rulesRecipe: z.string().regex(/^[a-z0-9-]{1,20}$/).optional(),
  })
  .strict();
export type LinkDataset = z.infer<typeof linkDatasetSchema>;

// ---- the pin ----------------------------------------------------------------------------------------------------------

export interface DatasetParts {
  readonly schemaVersion: typeof DATASET_SCHEMA_VERSION;
  readonly release: string;
  readonly links: readonly DatasetLink[];
}

// sha256 over the canonical JSON (sorted keys, no whitespace, integers only: sdk/hash.ts) of {schemaVersion, release,
// links}.
export function datasetContentHash(parts: DatasetParts): string {
  return sha256Hex(canonicalJson({ schemaVersion: parts.schemaVersion, release: parts.release, links: parts.links }));
}

// Adds the pin. For the export step and for tests; a reader never pins data it loads.
export function pinDataset(parts: DatasetParts): LinkDataset {
  return { schemaVersion: parts.schemaVersion, release: parts.release, links: [...parts.links], contentSha256: datasetContentHash(parts) };
}

// ---- reading --------------------------------------------------------------------------------------------------------

export type DatasetRejection = "not_an_object" | "schema" | "hash_mismatch";

export type LinkLoad =
  | { readonly state: "absent" }
  | { readonly state: "loaded"; readonly dataset: LinkDataset }
  | { readonly state: "rejected"; readonly reason: DatasetRejection };

export const NO_LINK_DATASET: LinkLoad = Object.freeze({ state: "absent" as const });

// A file that is present but invalid, or whose content hash does not match, is REJECTED (never partially used).
export function parseLinkDataset(raw: unknown): LinkLoad {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { state: "rejected", reason: "not_an_object" };
  const parsed = linkDatasetSchema.safeParse(raw);
  if (!parsed.success) return { state: "rejected", reason: "schema" };
  if (datasetContentHash(parsed.data) !== parsed.data.contentSha256) return { state: "rejected", reason: "hash_mismatch" };
  return { state: "loaded", dataset: parsed.data };
}
