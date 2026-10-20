// Gold-set and prediction file formats (docs/market-linking-design.md section 13).
//
// A gold label records what a human decided about one pair, at two levels (13.2): qLevel (same
// underlying question) and rLevel (rule-identical, no divergence axes), plus relation, outcome
// map, axes and the rule hashes at labelling time. Files hold ids, hashes and short quotes only;
// quotes of restricted-venue rule text (Kalshi) are refused.

import * as z from "zod/v4";
import { VENUE_IDS } from "../../types.js";
import {
  DIVERGENCE_AXES,
  RELATIONS,
  dateOnly,
  handle,
  isRestrictedVenue,
  marketId,
  utcStamp,
} from "../schema.js";

export const GOLD_FORMAT = "pm-link-goldset";
export const PREDICTIONS_FORMAT = "pm-link-predictions";

// dev: shaped the gates and lexicon, never certifies. silver: free recall-only labels (declared
// mirrors). cert: per-class certification items. test_sealed: fresh split read once per release.
export const GOLD_SPLITS = ["dev", "silver", "cert", "test_sealed"] as const;
export type GoldSplit = (typeof GOLD_SPLITS)[number];

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const pairId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
const shortText = z.string().min(1).max(300).regex(/^[^\p{Cc}\p{Cf}\p{Cs}]*$/u);
const relation = z.enum(RELATIONS);
const axes = z.array(z.enum(DIVERGENCE_AXES)).max(DIVERGENCE_AXES.length);
const outcomeMap = z.array(z.int().min(0).max(31)).min(1).max(32);

export const goldSideSchema = z.strictObject({
  venue: z.enum(VENUE_IDS),
  marketId,
  rulesSha256: hex64,
});

export const truthSchema = z.strictObject({
  qLevel: z.boolean(),
  rLevel: z.boolean(),
  relation,
  // Orientation of side b relative to side a (never inferred from outcome order or labels).
  outcomeMap,
  axes,
});

export const voteSchema = z.strictObject({
  labeler: handle,
  qLevel: z.boolean(),
  rLevel: z.boolean(),
  relation,
  axes,
});

export const goldLabelSchema = z.strictObject({
  pairId,
  a: goldSideSchema,
  b: goldSideSchema,
  // Template family (for example T-FB3) or null for untemplated pairs.
  family: shortText.nullable(),
  split: z.enum(GOLD_SPLITS),
  labelledAt: dateOnly,
  // The adjudicated final label.
  truth: truthSchema,
  // Independent labeler votes (first 100 items: two blind labelers; then 20% double-labelled).
  votes: z.array(voteSchema).max(4),
  quotedFragments: z.array(z.strictObject({ side: z.enum(["a", "b"]), text: shortText })).max(6),
  synthetic: z.boolean(),
});
export type GoldLabel = z.infer<typeof goldLabelSchema>;

export const goldSetSchema = z.strictObject({
  format: z.literal(GOLD_FORMAT),
  version: z.literal(1),
  // Written label policy (13.2): fixes the identical-versus-different-rule rule for cancel,
  // postponement, tie-break, cutoff and source clauses before labelling starts.
  labelPolicy: z.strictObject({ id: shortText, version: z.int().min(1) }),
  labels: z.array(goldLabelSchema),
});
export type GoldSet = z.infer<typeof goldSetSchema>;

export const VERDICTS = ["link", "abstain", "reject"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const predictionSchema = z.strictObject({
  pairId,
  verdict: z.enum(VERDICTS),
  relation: relation.optional(),
  outcomeMap: outcomeMap.optional(),
  axes: axes.optional(),
});
export type Prediction = z.infer<typeof predictionSchema>;

export const freezeSchema = z.strictObject({
  frozenAt: utcStamp,
  parserVersion: shortText,
  lexiconVersion: shortText,
  templateSetVersion: shortText,
});
export type Freeze = z.infer<typeof freezeSchema>;

export const predictionsFileSchema = z.strictObject({
  format: z.literal(PREDICTIONS_FORMAT),
  version: z.literal(1),
  generatorId: shortText,
  // Versions and time of the freeze (13.3). Null = not frozen: the report cannot certify anything.
  freeze: freezeSchema.nullable(),
  predictions: z.array(predictionSchema),
});
export type PredictionsFile = z.infer<typeof predictionsFileSchema>;

export type ParseOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: string[] };

function issues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

function sameMap(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export { sameMap };

export function parseGoldSet(input: unknown): ParseOutcome<GoldSet> {
  const parsed = goldSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error) };
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const label of parsed.data.labels) {
    const where = `label ${label.pairId}`;
    if (seen.has(label.pairId)) errors.push(`${where}: duplicate pairId`);
    seen.add(label.pairId);
    const t = label.truth;
    if (t.rLevel && !t.qLevel) errors.push(`${where}: rLevel true requires qLevel true`);
    if (t.rLevel && t.axes.length > 0) errors.push(`${where}: rLevel true means no divergence axes`);
    for (const v of label.votes) {
      if (v.rLevel && !v.qLevel) errors.push(`${where}: vote by ${v.labeler} has rLevel without qLevel`);
    }
    if (new Set(label.votes.map((v) => v.labeler)).size !== label.votes.length) {
      errors.push(`${where}: votes must come from distinct labelers`);
    }
    for (const q of label.quotedFragments) {
      const side = q.side === "a" ? label.a : label.b;
      if (isRestrictedVenue(side.venue)) errors.push(`${where}: quote from restricted venue ${side.venue}`);
    }
    if (label.synthetic !== (label.a.marketId.startsWith("SYNTHETIC-") && label.b.marketId.startsWith("SYNTHETIC-"))) {
      errors.push(`${where}: synthetic flag must match SYNTHETIC- market ids on both sides`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: parsed.data };
}

export function parsePredictions(input: unknown): ParseOutcome<PredictionsFile> {
  const parsed = predictionsFileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error) };
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of parsed.data.predictions) {
    if (seen.has(p.pairId)) errors.push(`prediction ${p.pairId}: duplicate pairId`);
    seen.add(p.pairId);
    if (p.verdict === "link") {
      if (p.relation === undefined || p.outcomeMap === undefined || p.axes === undefined) {
        errors.push(`prediction ${p.pairId}: a link verdict needs relation, outcomeMap and axes`);
      }
    } else if (p.relation !== undefined || p.outcomeMap !== undefined || p.axes !== undefined) {
      errors.push(`prediction ${p.pairId}: only link verdicts carry relation, outcomeMap or axes`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: parsed.data };
}
