// Evaluation of a candidate generator against the gold set (design section 13).
//
// Rules this module enforces:
//   - Only `cert` and `test_sealed` labels certify, and only if the generator file declares a
//     freeze and the label was made strictly AFTER the freeze date. `dev` labels shaped the gates
//     and are reported separately; `silver` labels count for recall only.
//   - A link verdict is correct only if the pair is truly the same question AND the relation AND the
//     outcome map (orientation) match. Orientation errors are the largest source of fake edges.
//   - A missing prediction counts as an abstain, never as a pass.
//   - The output `gates` feed tier caps (tier.ts). Nothing here approves a link.
//   - Executable eligibility is never computed: it needs two real XO fills (D2), which no offline
//     evaluation can supply.

import { DIVERGENCE_AXES } from "../schema.js";
import { classKeyOf, type ClassGates } from "../tier.js";
import { sameMap, type GoldLabel, type GoldSet, type GoldSplit, type Prediction, type PredictionsFile } from "./format.js";
import { cohenKappa, requiredSampleSize, wilson, Z_95, type Bound } from "./stats.js";

export const TARGETS = Object.freeze({
  // qLevel precision of LINK verdicts (Wilson lower bound) before a class prints above indicative.
  q: 0.97,
  // rLevel precision among LINKs with axes = [] before a class may print hedged_discrepancy.
  rHedged: 0.95,
  // rLevel bound for executable eligibility (reported; the gate is never granted offline).
  rExecutable: 0.98,
  // Axis-extraction recall for hedged.
  axisRecall: 0.95,
  // Design default (D): gold axes needed before the recall point estimate means anything.
  axisRecallMinN: 20,
  kappaRelation: 0.8,
  kappaAxes: 0.7,
});

export interface Metrics {
  readonly labels: number;
  readonly predictedLinks: number;
  // qLevel precision: link verdicts that are the same question with the right relation and orientation.
  readonly precisionQ: Bound;
  readonly falseLinks: number;
  readonly orientationErrors: number;
  readonly relationErrors: number;
  // rLevel precision among link verdicts that claim axes = [].
  readonly precisionR: Bound;
  readonly recallQ: Bound;
  readonly falseRejects: number;
  readonly abstainedOnTrue: number;
  // Share of gold axes the generator found, over correctly linked pairs.
  readonly axisRecall: Bound;
  readonly spuriousAxes: number;
  readonly missingPredictions: number;
}

export interface ClassReport {
  readonly classKey: string;
  readonly metrics: Metrics;
  readonly q: boolean;
  readonly hedged: boolean;
  // Honest status of the third level: needs real fills, so it is never "yes" here.
  readonly executable: "unproven";
  readonly reasons: readonly string[];
  // Samples still needed for the q bound at the observed failure count (null = already enough or
  // nothing predicted yet).
  readonly moreNeededForQ: number | null;
}

export interface AgreementReport {
  readonly doubleLabelled: number;
  readonly kappaQ: number | null;
  readonly kappaRelation: number | null;
  readonly kappaAxes: number | null;
  readonly ok: boolean;
}

export interface EvaluationReport {
  readonly generatorId: string;
  readonly freeze: PredictionsFile["freeze"];
  readonly certifiable: boolean;
  readonly certifiableReasons: readonly string[];
  readonly certification: Metrics;
  readonly bySplit: Readonly<Record<GoldSplit, Metrics>>;
  readonly classes: readonly ClassReport[];
  readonly gates: ClassGates;
  readonly agreement: AgreementReport;
  readonly counts: {
    readonly labels: number;
    readonly predictions: number;
    readonly predictionsWithoutLabel: number;
    readonly labelsWithoutPrediction: number;
    readonly excludedStale: number;
    readonly excludedPreFreeze: number;
    readonly excludedNotCertifying: number;
  };
}

export interface EvaluateOptions {
  // Current rule hashes per pairId ([a, b]); a label whose pinned hashes differ is stale and
  // excluded (a hash change invalidates the label).
  readonly currentRulesSha?: Readonly<Record<string, readonly [string, string]>>;
  readonly z?: number;
}

type Item = { label: GoldLabel; prediction: Prediction | undefined };

function truePositive(item: Item): boolean {
  const p = item.prediction;
  if (p === undefined || p.verdict !== "link") return false;
  const t = item.label.truth;
  return t.qLevel && p.relation === t.relation && p.outcomeMap !== undefined && sameMap(p.outcomeMap, t.outcomeMap);
}

function metrics(items: readonly Item[], z: number): Metrics {
  let predictedLinks = 0;
  let tp = 0;
  let falseLinks = 0;
  let orientationErrors = 0;
  let relationErrors = 0;
  let rClaims = 0;
  let rOk = 0;
  let trueTotal = 0;
  let falseRejects = 0;
  let abstainedOnTrue = 0;
  let axesGold = 0;
  let axesFound = 0;
  let spurious = 0;
  let missing = 0;
  for (const item of items) {
    const p = item.prediction;
    const t = item.label.truth;
    if (p === undefined) missing += 1;
    if (t.qLevel) trueTotal += 1;
    if (p === undefined || p.verdict === "abstain") {
      if (t.qLevel) abstainedOnTrue += 1;
      continue;
    }
    if (p.verdict === "reject") {
      if (t.qLevel) falseRejects += 1;
      continue;
    }
    predictedLinks += 1;
    const good = truePositive(item);
    if (good) tp += 1;
    else if (!t.qLevel) falseLinks += 1;
    else if (p.relation !== t.relation) relationErrors += 1;
    else orientationErrors += 1;
    if ((p.axes ?? []).length === 0) {
      rClaims += 1;
      if (good && t.rLevel) rOk += 1;
    }
    if (good) {
      const found = new Set(p.axes ?? []);
      for (const axis of t.axes) {
        axesGold += 1;
        if (found.has(axis)) axesFound += 1;
      }
      const gold = new Set(t.axes);
      for (const axis of found) if (!gold.has(axis)) spurious += 1;
    }
  }
  return {
    labels: items.length,
    predictedLinks,
    precisionQ: wilson(tp, predictedLinks, z),
    falseLinks,
    orientationErrors,
    relationErrors,
    precisionR: wilson(rOk, rClaims, z),
    recallQ: wilson(tp, trueTotal, z),
    falseRejects,
    abstainedOnTrue,
    axisRecall: wilson(axesFound, axesGold, z),
    spuriousAxes: spurious,
    missingPredictions: missing,
  };
}

function itemClassKey(item: Item): string {
  const p = item.prediction;
  const relation = p !== undefined && p.verdict === "link" && p.relation !== undefined ? p.relation : item.label.truth.relation;
  return classKeyOf({
    relation,
    venues: [item.label.a.venue, item.label.b.venue],
    family: item.label.family,
  });
}

function agreement(labels: readonly GoldLabel[]): AgreementReport {
  const q: [string, string][] = [];
  const rel: [string, string][] = [];
  const ax: [string, string][] = [];
  let n = 0;
  for (const label of labels) {
    const [v1, v2] = label.votes;
    if (v1 === undefined || v2 === undefined) continue;
    n += 1;
    q.push([String(v1.qLevel), String(v2.qLevel)]);
    rel.push([v1.relation, v2.relation]);
    for (const axis of DIVERGENCE_AXES) {
      ax.push([String(v1.axes.includes(axis)), String(v2.axes.includes(axis))]);
    }
  }
  const kq = cohenKappa(q);
  const kr = cohenKappa(rel);
  const ka = cohenKappa(ax);
  const ok =
    n > 0 &&
    kq !== null &&
    kr !== null &&
    ka !== null &&
    kq >= TARGETS.kappaRelation &&
    kr >= TARGETS.kappaRelation &&
    ka >= TARGETS.kappaAxes;
  return { doubleLabelled: n, kappaQ: kq, kappaRelation: kr, kappaAxes: ka, ok };
}

export function evaluate(gold: GoldSet, file: PredictionsFile, options: EvaluateOptions = {}): EvaluationReport {
  const z = options.z ?? Z_95;
  const byPair = new Map(file.predictions.map((p) => [p.pairId, p] as const));
  const labelIds = new Set(gold.labels.map((l) => l.pairId));
  const frozenDate = file.freeze === null ? null : file.freeze.frozenAt.slice(0, 10);

  const certifying: Item[] = [];
  const all: Item[] = [];
  let stale = 0;
  let preFreeze = 0;
  let notCertifying = 0;
  const splitItems: Record<GoldSplit, Item[]> = { dev: [], silver: [], cert: [], test_sealed: [] };

  for (const label of gold.labels) {
    const current = options.currentRulesSha?.[label.pairId];
    if (current !== undefined && (current[0] !== label.a.rulesSha256 || current[1] !== label.b.rulesSha256)) {
      stale += 1;
      continue;
    }
    const item: Item = { label, prediction: byPair.get(label.pairId) };
    all.push(item);
    splitItems[label.split].push(item);
    if (label.split === "dev" || label.split === "silver") {
      notCertifying += 1;
      continue;
    }
    if (frozenDate === null || label.labelledAt <= frozenDate) {
      preFreeze += 1;
      continue;
    }
    certifying.push(item);
  }

  const reasons: string[] = [];
  if (file.freeze === null) reasons.push("generator is not frozen: no versions or freeze time recorded");
  if (certifying.length === 0) reasons.push("no cert or test_sealed label made after the freeze");
  const certifiable = reasons.length === 0;

  const byClass = new Map<string, Item[]>();
  for (const item of certifying) {
    const key = itemClassKey(item);
    const list = byClass.get(key);
    if (list === undefined) byClass.set(key, [item]);
    else list.push(item);
  }

  const gates: Record<string, { q: boolean; hedged: boolean }> = {};
  const classes: ClassReport[] = [];
  for (const [classKey, items] of [...byClass.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const m = metrics(items, z);
    const why: string[] = [];
    const qLower = m.precisionQ.lower;
    const q = certifiable && qLower !== null && qLower >= TARGETS.q;
    if (!q) why.push(qLower === null ? "no link verdicts in this class" : `q lower bound ${qLower.toFixed(3)} < ${TARGETS.q}`);
    // rLevel: among link verdicts claiming "no divergence axes", the share that truly have none.
    // No such claims means nothing to bound (a class whose links always carry axes).
    const claimsAxisFree = m.precisionR.n > 0;
    const rLower = m.precisionR.lower;
    const rOk = !claimsAxisFree || (rLower !== null && rLower >= TARGETS.rHedged);
    if (q && !rOk) why.push(`r lower bound ${(rLower ?? 0).toFixed(3)} < ${TARGETS.rHedged}`);
    // Axis recall: with no gold axes at all, the axis-free claims above are the only evidence, so
    // they must exist; with some gold axes there must be enough of them and recall must hold.
    const axisPoint = m.axisRecall.point;
    const axisOk =
      m.axisRecall.n === 0
        ? claimsAxisFree
        : m.axisRecall.n >= TARGETS.axisRecallMinN && axisPoint !== null && axisPoint >= TARGETS.axisRecall;
    if (q && !axisOk) {
      if (m.axisRecall.n === 0) why.push("no gold axes and no axis-free link verdicts: axis extraction is untested");
      else if (m.axisRecall.n < TARGETS.axisRecallMinN) {
        why.push(`axis recall untested: ${m.axisRecall.n} gold axes < ${TARGETS.axisRecallMinN}`);
      } else why.push(`axis recall ${(axisPoint ?? 0).toFixed(3)} < ${TARGETS.axisRecall}`);
    }
    const hedged = q && rOk && axisOk;
    gates[classKey] = { q, hedged };
    const failures = m.predictedLinks - m.precisionQ.k;
    const need = requiredSampleSize(TARGETS.q, failures, z);
    classes.push({
      classKey,
      metrics: m,
      q,
      hedged,
      executable: "unproven",
      reasons: why,
      moreNeededForQ: q || m.predictedLinks === 0 || need === null ? null : Math.max(0, need - m.predictedLinks),
    });
  }

  const bySplit = {
    dev: metrics(splitItems.dev, z),
    silver: metrics(splitItems.silver, z),
    cert: metrics(splitItems.cert, z),
    test_sealed: metrics(splitItems.test_sealed, z),
  };

  return {
    generatorId: file.generatorId,
    freeze: file.freeze,
    certifiable,
    certifiableReasons: reasons,
    certification: metrics(certifying, z),
    bySplit,
    classes,
    gates,
    agreement: agreement(all.map((i) => i.label)),
    counts: {
      labels: gold.labels.length,
      predictions: file.predictions.length,
      predictionsWithoutLabel: file.predictions.filter((p) => !labelIds.has(p.pairId)).length,
      labelsWithoutPrediction: all.filter((i) => i.prediction === undefined).length,
      excludedStale: stale,
      excludedPreFreeze: preFreeze,
      excludedNotCertifying: notCertifying,
    },
  };
}
