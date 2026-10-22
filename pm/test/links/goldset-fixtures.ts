// Builders for SYNTHETIC gold sets and prediction files. Ids are SYNTHETIC-*, hashes are hashes of
// invented labels. Nothing here is a real market or a real human label.

import { synthSha } from "./fixtures.js";
import type { GoldLabel, GoldSet, GoldSplit, Prediction, PredictionsFile } from "../../../sdk/links/goldset/format.js";
import type { DivergenceAxis, Relation } from "../../links/schema.js";

export const FREEZE_AT = "2026-10-18T00:00:00Z";
export const AFTER = "2026-10-19";

export interface LabelSpec {
  id: string;
  split?: GoldSplit;
  labelledAt?: string;
  family?: string | null;
  relation?: Relation;
  qLevel?: boolean;
  axes?: DivergenceAxis[];
  outcomeMap?: number[];
  venues?: ["xo" | "polymarket" | "kalshi", "xo" | "polymarket" | "kalshi"];
}

export function label(spec: LabelSpec): GoldLabel {
  const qLevel = spec.qLevel ?? true;
  const axes = spec.axes ?? [];
  const [va, vb] = spec.venues ?? ["xo", "polymarket"];
  return {
    pairId: spec.id,
    a: { venue: va, marketId: `SYNTHETIC-${spec.id}-a`, rulesSha256: synthSha(`${spec.id}:a`) },
    b: { venue: vb, marketId: `SYNTHETIC-${spec.id}-b`, rulesSha256: synthSha(`${spec.id}:b`) },
    family: spec.family ?? null,
    split: spec.split ?? "cert",
    labelledAt: spec.labelledAt ?? AFTER,
    truth: {
      qLevel,
      rLevel: qLevel && axes.length === 0,
      relation: spec.relation ?? (qLevel ? "identity" : "related"),
      outcomeMap: spec.outcomeMap ?? [0, 1],
      axes,
    },
    votes: [],
    quotedFragments: [],
    synthetic: true,
  };
}

export function goldSet(labels: GoldLabel[]): GoldSet {
  return { format: "pm-link-goldset", version: 1, labelPolicy: { id: "SYNTHETIC-label-policy", version: 1 }, labels };
}

export function linkPred(l: GoldLabel, extra: Partial<Prediction> = {}): Prediction {
  return {
    pairId: l.pairId,
    verdict: "link",
    relation: l.truth.relation,
    outcomeMap: l.truth.outcomeMap,
    axes: l.truth.axes,
    ...extra,
  };
}

export function predictions(preds: Prediction[], frozen = true): PredictionsFile {
  return {
    format: "pm-link-predictions",
    version: 1,
    generatorId: "SYNTHETIC-generator",
    freeze: frozen
      ? { frozenAt: FREEZE_AT, parserVersion: "p0", lexiconVersion: "l0", templateSetVersion: "t0" }
      : null,
    predictions: preds,
  };
}

// n true axis-free identity pairs, all predicted correctly.
export function perfectIdentity(n: number, prefix = "t", split: GoldSplit = "cert"): { labels: GoldLabel[]; preds: Prediction[] } {
  const labels = Array.from({ length: n }, (_, i) => label({ id: `${prefix}${i}`, split }));
  return { labels, preds: labels.map((l) => linkPred(l)) };
}

// The six-pair gold set and its predictions that the CLI tests write to an in-memory file. Built here, not committed
// as a data file: every label and prediction is an invented test input (see the header of this file).
export function cliGoldSet(): GoldSet {
  return goldSet([
    label({ id: "dev-1", split: "dev", labelledAt: "2026-10-10" }),
    { ...label({ id: "cert-1" }), votes: [
      { labeler: "labeler-a", qLevel: true, rLevel: true, relation: "identity", axes: [] },
      { labeler: "labeler-b", qLevel: true, rLevel: true, relation: "identity", axes: [] },
    ] },
    label({ id: "cert-2", qLevel: false }),
    label({ id: "cert-3", family: "T-SYN", relation: "near_identity", axes: ["timing_cutoff"] }),
    label({ id: "sealed-1", split: "test_sealed", relation: "complement", outcomeMap: [1, 0] }),
    label({ id: "silver-1", split: "silver", labelledAt: "2026-10-12" }),
  ]);
}

export function cliPredictions(): PredictionsFile {
  const gold = cliGoldSet().labels;
  const by = (id: string): GoldLabel => gold.find((l) => l.pairId === id) as GoldLabel;
  return predictions([
    linkPred(by("dev-1")),
    linkPred(by("cert-1")),
    { pairId: "cert-2", verdict: "reject" },
    linkPred(by("cert-3")),
    { pairId: "sealed-1", verdict: "abstain" },
    linkPred(by("silver-1")),
  ]);
}
