import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, TARGETS } from "../../links/goldset/evaluate.js";
import {
  parseGoldSet,
  parsePredictions,
  type GoldLabel,
} from "../../links/goldset/format.js";
import { candidateFromPrediction, exactRulesBaseline, type PairInput } from "../../links/goldset/generator.js";
import { formatReport } from "../../links/goldset/report.js";
import { mulberry32, stratifiedSample } from "../../links/goldset/sample.js";
import { cohenKappa, requiredSampleSize, wilson } from "../../links/goldset/stats.js";
import { lookupLinks } from "../../links/lookup.js";
import { buildBundle } from "../../links/bundle.js";
import { emptyRegistry, proposeLink } from "../../links/store.js";
import { classKeyOf } from "../../links/tier.js";
import { NOW, TODAY, approve, identityCandidate, leg, propose, synthSha } from "./fixtures.js";
import { AFTER, cliGoldSet, cliPredictions, FREEZE_AT, goldSet, label, linkPred, perfectIdentity, predictions } from "./goldset-fixtures.js";

const IDENTITY_KEY = classKeyOf({ relation: "identity", venues: ["xo", "polymarket"], family: null });

test("Wilson bounds match the design's sample-size table", () => {
  assert.equal(requiredSampleSize(0.9, 0), 35);
  assert.equal(requiredSampleSize(0.95, 0), 73);
  assert.equal(requiredSampleSize(0.97, 0), 125);
  assert.equal(requiredSampleSize(0.98, 0), 189);
  assert.equal(requiredSampleSize(0.99, 0), 381);
  const one = [0.95, 0.97, 0.98, 0.99].map((t) => requiredSampleSize(t, 1));
  assert.deepEqual(one, [110, 185, 280, 563]); // design 13.1
  assert.ok(wilson(125, 125).lower! >= 0.97);
  assert.ok(wilson(124, 124).lower! < 0.97);
  assert.ok(wilson(200, 200).lower! > 0.98);
  assert.ok(wilson(199, 200).lower! > 0.97 && wilson(199, 200).lower! < 0.98);
  assert.ok(Math.abs(wilson(41, 41).lower! - 0.914) < 0.001);
  const empty = wilson(0, 0);
  assert.equal(empty.point, null);
  assert.equal(empty.lower, null);
  assert.throws(() => wilson(3, 2));
  assert.equal(requiredSampleSize(0.97, 100000), null);
});

test("Cohen's kappa", () => {
  assert.equal(cohenKappa([]), null);
  assert.equal(cohenKappa([["a", "a"], ["a", "a"]]), null); // single category: undefined
  assert.equal(cohenKappa([["a", "a"], ["b", "b"], ["a", "a"], ["b", "b"]]), 1);
  const k = cohenKappa([["a", "a"], ["a", "b"], ["b", "a"], ["b", "b"]]);
  assert.equal(k, 0);
});

test("the built gold set and predictions parse and are labelled synthetic", () => {
  const gold = parseGoldSet(JSON.parse(JSON.stringify(cliGoldSet())));
  assert.equal(gold.ok, true, gold.ok ? "" : gold.errors.join("; "));
  const preds = parsePredictions(JSON.parse(JSON.stringify(cliPredictions())));
  assert.equal(preds.ok, true, preds.ok ? "" : preds.errors.join("; "));
  if (gold.ok) {
    assert.ok(gold.value.labels.every((l) => l.synthetic));
    assert.match(gold.value.labelPolicy.id, /^SYNTHETIC/);
  }
});

test("format: duplicates, rLevel logic, restricted quotes, synthetic flag, unknown fields", () => {
  const a = label({ id: "x1" });
  const bad = (labels: GoldLabel[]): string[] => {
    const r = parseGoldSet(goldSet(labels));
    return r.ok ? [] : r.errors;
  };
  assert.ok(bad([a, a]).some((e) => e.includes("duplicate pairId")));
  assert.ok(bad([{ ...a, truth: { ...a.truth, qLevel: false, rLevel: true } }]).some((e) => e.includes("rLevel true requires qLevel")));
  assert.ok(bad([{ ...a, truth: { ...a.truth, axes: ["timing_cutoff"] } }]).some((e) => e.includes("no divergence axes")));
  assert.ok(bad([{ ...a, b: { ...a.b, venue: "kalshi" }, quotedFragments: [{ side: "b", text: "text from kalshi rules" }] }]).some((e) => e.includes("restricted venue kalshi")));
  assert.deepEqual(bad([{ ...a, b: { ...a.b, venue: "kalshi" }, quotedFragments: [{ side: "a", text: "xo text is fine" }] }]), []);
  assert.ok(bad([{ ...a, synthetic: false }]).some((e) => e.includes("synthetic flag")));
  assert.ok(bad([{ ...a, votes: [{ labeler: "labeler-a", qLevel: true, rLevel: true, relation: "identity", axes: [] }, { labeler: "labeler-a", qLevel: true, rLevel: true, relation: "identity", axes: [] }] }]).some((e) => e.includes("distinct labelers")));
  assert.equal(parseGoldSet({ ...goldSet([a]), surprise: 1 }).ok, false);
  assert.equal(parseGoldSet(goldSet([{ ...a, split: "gold" as never }])).ok, false);
  assert.equal(parseGoldSet(goldSet([{ ...a, truth: { ...a.truth, relation: "subset" as never } }])).ok, false);
});

test("format: prediction rules", () => {
  const ok = (p: object[]): boolean => parsePredictions({ ...predictions([]), predictions: p }).ok;
  assert.equal(ok([{ pairId: "a", verdict: "link", relation: "identity", outcomeMap: [0, 1], axes: [] }]), true);
  assert.equal(ok([{ pairId: "a", verdict: "link" }]), false);
  assert.equal(ok([{ pairId: "a", verdict: "abstain", relation: "identity" }]), false);
  assert.equal(ok([{ pairId: "a", verdict: "reject" }, { pairId: "a", verdict: "reject" }]), false);
  assert.equal(ok([{ pairId: "a", verdict: "maybe" }]), false);
  assert.equal(parsePredictions({ ...predictions([]), freeze: { frozenAt: "yesterday" } }).ok, false);
});

test("125 correct axis-free link verdicts pass q and hedged; 124 pass neither", () => {
  const full = perfectIdentity(125);
  const r = evaluate(goldSet(full.labels), predictions(full.preds));
  assert.equal(r.certifiable, true);
  const c = r.classes.find((x) => x.classKey === IDENTITY_KEY);
  assert.ok(c);
  assert.equal(c.q, true);
  assert.equal(c.hedged, true);
  assert.equal(c.executable, "unproven");
  assert.deepEqual(r.gates[IDENTITY_KEY], { q: true, hedged: true });

  const short = perfectIdentity(124);
  const r2 = evaluate(goldSet(short.labels), predictions(short.preds));
  assert.deepEqual(r2.gates[IDENTITY_KEY], { q: false, hedged: false });
  assert.ok(r2.classes[0]!.reasons.some((x) => x.includes("q lower bound")));
  assert.equal(r2.classes[0]!.moreNeededForQ, 1);
});

test("one false link in 185 passes; one false link in 150 does not", () => {
  const mk = (n: number) => {
    const base = perfectIdentity(n - 1);
    const falseLabel = label({ id: "bad", qLevel: false });
    return { labels: [...base.labels, falseLabel], preds: [...base.preds, linkPred(falseLabel, { relation: "identity", outcomeMap: [0, 1], axes: [] })] };
  };
  const big = mk(185);
  const rBig = evaluate(goldSet(big.labels), predictions(big.preds));
  assert.equal(rBig.gates[IDENTITY_KEY]?.q, true);
  assert.equal(rBig.classes[0]!.metrics.falseLinks, 1);
  const small = mk(150);
  const rSmall = evaluate(goldSet(small.labels), predictions(small.preds));
  assert.equal(rSmall.gates[IDENTITY_KEY]?.q, false);
  assert.ok((rSmall.classes[0]!.moreNeededForQ ?? 0) > 0);
});

test("a wrong outcome map is a failure even when the question is right", () => {
  const base = perfectIdentity(125);
  const wrong = base.preds.slice();
  wrong[0] = { ...wrong[0]!, outcomeMap: [1, 0] };
  const r = evaluate(goldSet(base.labels), predictions(wrong));
  const c = r.classes[0]!;
  assert.equal(c.metrics.orientationErrors, 1);
  assert.equal(c.metrics.precisionQ.k, 124);
  assert.equal(c.q, false);
});

test("a wrong relation is a failure", () => {
  const base = perfectIdentity(125);
  const wrong = base.preds.slice();
  wrong[0] = { ...wrong[0]!, relation: "near_identity" };
  const r = evaluate(goldSet(base.labels), predictions(wrong));
  assert.equal(r.gates[IDENTITY_KEY]?.q ?? false, false);
  const rel = r.certification;
  assert.equal(rel.relationErrors, 1);
});

test("claiming no axes when the truth has one defeats hedged (a missed axis is a fake arbitrage)", () => {
  const base = perfectIdentity(125);
  // swap 10 labels to carry a timing axis the generator did not report
  for (let i = 0; i < 10; i++) {
    const l = base.labels[i]!;
    base.labels[i] = { ...l, truth: { ...l.truth, rLevel: false, axes: ["timing_cutoff"] } };
    base.preds[i] = { ...base.preds[i]!, axes: [] };
  }
  const r = evaluate(goldSet(base.labels), predictions(base.preds));
  const g = r.gates[IDENTITY_KEY]!;
  assert.equal(g.q, true);
  assert.equal(g.hedged, false);
  assert.ok(r.classes[0]!.reasons.some((x) => x.includes("r lower bound")));
  assert.equal(r.certification.axisRecall.k, 0);
});

test("a class that always carries axes needs 20 gold axes and 95% axis recall", () => {
  const mk = (n: number, found: number) => {
    const labels = Array.from({ length: n }, (_, i) =>
      label({ id: `n${i}`, relation: "near_identity", axes: ["timing_cutoff"] }),
    );
    const preds = labels.map((l, i) => linkPred(l, { axes: i < found ? ["timing_cutoff"] : ["void_policy"] }));
    return evaluate(goldSet(labels), predictions(preds));
  };
  const key = classKeyOf({ relation: "near_identity", venues: ["xo", "polymarket"], family: null });
  assert.equal(mk(130, 130).gates[key]?.hedged, true);
  // recall 120/130 = 92%
  assert.equal(mk(130, 120).gates[key]?.hedged, false);
  assert.equal(mk(130, 120).gates[key]?.q, true);
  // too few gold axes to test recall
  const few = Array.from({ length: 10 }, (_, i) => label({ id: `f${i}`, relation: "near_identity", axes: ["timing_cutoff"] }));
  const fewR = evaluate(goldSet(few), predictions(few.map((l) => linkPred(l))));
  assert.equal(fewR.gates[key]?.hedged ?? false, false);
});

test("a class with no gold axes and no axis-free claims is untested, not passed", () => {
  const labels = Array.from({ length: 130 }, (_, i) => label({ id: `u${i}`, relation: "near_identity" }));
  // truth has no axes, generator claims an axis on every pair: nothing tests extraction
  const preds = labels.map((l) => linkPred(l, { axes: ["timing_cutoff"] }));
  const key = classKeyOf({ relation: "near_identity", venues: ["xo", "polymarket"], family: null });
  const r = evaluate(goldSet(labels), predictions(preds));
  assert.equal(r.gates[key]?.q, true);
  assert.equal(r.gates[key]?.hedged, false);
  assert.ok(r.classes[0]!.reasons.some((x) => x.includes("untested")));
});

test("dev labels never certify however many there are; silver counts for recall only", () => {
  const dev = perfectIdentity(500, "d", "dev");
  const r = evaluate(goldSet(dev.labels), predictions(dev.preds));
  assert.equal(r.classes.length, 0);
  assert.deepEqual(r.gates, {});
  assert.equal(r.certifiable, false);
  assert.equal(r.bySplit.dev.precisionQ.k, 500); // reported, not certifying
  assert.equal(r.counts.excludedNotCertifying, 500);
  const silver = perfectIdentity(200, "s", "silver");
  assert.deepEqual(evaluate(goldSet(silver.labels), predictions(silver.preds)).gates, {});
});

test("an unfrozen generator certifies nothing", () => {
  const p = perfectIdentity(200);
  const r = evaluate(goldSet(p.labels), predictions(p.preds, false));
  assert.equal(r.certifiable, false);
  assert.ok(r.certifiableReasons.some((x) => x.includes("not frozen")));
  assert.deepEqual(r.gates, {});
});

test("labels made on or before the freeze date do not certify", () => {
  const p = perfectIdentity(125);
  const onDay = p.labels.map((l) => ({ ...l, labelledAt: FREEZE_AT.slice(0, 10) }));
  const r = evaluate(goldSet(onDay), predictions(p.preds));
  assert.deepEqual(r.gates, {});
  assert.equal(r.counts.excludedPreFreeze, 125);
  const mixed = [...p.labels.slice(0, 100), ...onDay.slice(100)];
  const r2 = evaluate(goldSet(mixed), predictions(p.preds));
  assert.equal(r2.gates[IDENTITY_KEY]?.q ?? false, false); // only 100 certifying
});

test("missing predictions count as abstentions and are reported", () => {
  const p = perfectIdentity(130);
  const r = evaluate(goldSet(p.labels), predictions(p.preds.slice(0, 125)));
  assert.equal(r.counts.labelsWithoutPrediction, 5);
  assert.equal(r.certification.missingPredictions, 5);
  assert.equal(r.certification.abstainedOnTrue, 5);
  assert.equal(r.certification.recallQ.k, 125);
  assert.equal(r.certification.recallQ.n, 130);
  assert.equal(r.gates[IDENTITY_KEY]?.q, true);
  const extra = evaluate(goldSet(p.labels), predictions([...p.preds, { pairId: "no-such-label", verdict: "reject" }]));
  assert.equal(extra.counts.predictionsWithoutLabel, 1);
});

test("false rejects and abstentions on true pairs lower recall, not precision", () => {
  const p = perfectIdentity(125);
  const extra = Array.from({ length: 10 }, (_, i) => label({ id: `m${i}` }));
  const preds = [...p.preds, ...extra.slice(0, 5).map((l) => ({ pairId: l.pairId, verdict: "reject" as const })), ...extra.slice(5).map((l) => ({ pairId: l.pairId, verdict: "abstain" as const }))];
  const r = evaluate(goldSet([...p.labels, ...extra]), predictions(preds));
  assert.equal(r.certification.falseRejects, 5);
  assert.equal(r.certification.abstainedOnTrue, 5);
  assert.equal(r.certification.precisionQ.k, 125);
  assert.ok(r.certification.recallQ.point! < 1);
});

test("stale labels (rule hash changed since labelling) are excluded", () => {
  const p = perfectIdentity(130);
  const current: Record<string, readonly [string, string]> = {};
  for (const l of p.labels.slice(0, 10)) current[l.pairId] = [synthSha("changed"), l.b.rulesSha256];
  const r = evaluate(goldSet(p.labels), predictions(p.preds), { currentRulesSha: current });
  assert.equal(r.counts.excludedStale, 10);
  assert.equal(r.certification.labels, 120);
  assert.equal(r.gates[IDENTITY_KEY]?.q ?? false, false);
});

test("classes are separated by relation, venue pair and family", () => {
  const a = perfectIdentity(125, "a");
  const b = Array.from({ length: 5 }, (_, i) => label({ id: `k${i}`, venues: ["xo", "kalshi"] }));
  const c = Array.from({ length: 5 }, (_, i) => label({ id: `f${i}`, family: "T-FB3" }));
  const preds = [...a.preds, ...b.map((l) => linkPred(l)), ...c.map((l) => linkPred(l))];
  const r = evaluate(goldSet([...a.labels, ...b, ...c]), predictions(preds));
  assert.equal(r.classes.length, 3);
  assert.equal(r.gates[IDENTITY_KEY]?.q, true);
  assert.equal(r.gates[classKeyOf({ relation: "identity", venues: ["xo", "kalshi"], family: null })]?.q, false);
  assert.equal(r.gates[classKeyOf({ relation: "identity", venues: ["xo", "polymarket"], family: "T-FB3" })]?.q, false);
});

test("false links count against the class the generator claimed", () => {
  const trueLabels = perfectIdentity(125);
  const noLink = label({ id: "nl", qLevel: false });
  const r = evaluate(goldSet([...trueLabels.labels, noLink]), predictions([...trueLabels.preds, linkPred(noLink, { relation: "identity", outcomeMap: [0, 1], axes: [] })]));
  const c = r.classes.find((x) => x.classKey === IDENTITY_KEY)!;
  assert.equal(c.metrics.falseLinks, 1);
  assert.equal(c.q, false);
});

test("labeler agreement uses kappa thresholds", () => {
  const vote = (labeler: string, q: boolean, rel: "identity" | "related", axes: never[] = []) => ({ labeler, qLevel: q, rLevel: q, relation: rel, axes });
  const labels: GoldLabel[] = [];
  for (let i = 0; i < 20; i++) {
    const q = i % 2 === 0;
    labels.push({ ...label({ id: `v${i}`, qLevel: q }), votes: [vote("labeler-a", q, q ? "identity" : "related"), vote("labeler-b", q, q ? "identity" : "related")] });
  }
  const good = evaluate(goldSet(labels), predictions([]));
  assert.equal(good.agreement.doubleLabelled, 20);
  assert.equal(good.agreement.kappaQ, 1);
  assert.equal(good.agreement.kappaRelation, 1);
  assert.equal(good.agreement.kappaAxes, null); // no axis ever used: undefined, not 1
  assert.equal(good.agreement.ok, false); // undefined axis kappa cannot satisfy the threshold
  const disagree = labels.map((l, i) => (i < 10 ? { ...l, votes: [l.votes[0]!, { ...l.votes[1]!, qLevel: !l.votes[1]!.qLevel, rLevel: false }] } : l));
  const bad = evaluate(goldSet(disagree), predictions([]));
  assert.ok(bad.agreement.kappaQ! < TARGETS.kappaRelation);
  assert.equal(bad.agreement.ok, false);
});

test("report text is plain, lists the gates and never claims executable", () => {
  const p = perfectIdentity(125);
  const text = formatReport(evaluate(goldSet(p.labels), predictions(p.preds)));
  assert.match(text, /Certifiable: yes/);
  assert.match(text, /gate q=yes hedged=yes executable=unproven/);
  assert.match(text, /Executable stays unproven/);
  const none = formatReport(evaluate(goldSet(p.labels), predictions(p.preds, false)));
  assert.match(none, /Certifiable: NO/);
});

test("integration: gates from the evaluation lift a lookup cap, and only for the matching approved class", () => {
  const p = perfectIdentity(125);
  const report = evaluate(goldSet(p.labels), predictions(p.preds));
  const first = propose(emptyRegistry(), identityCandidate("0001"));
  const reg = approve(first.registry, first.link.linkId);
  const b = buildBundle(reg, { createdAt: "2026-10-20T00:00:00Z" });
  assert.ok(b.ok);
  if (!b.ok) return;
  const without = lookupLinks(b.value, { venue: "xo", marketId: "SYNTHETIC-xo-0001" }, { now: NOW });
  const withGate = lookupLinks(b.value, { venue: "xo", marketId: "SYNTHETIC-xo-0001" }, { now: NOW, gates: report.gates });
  assert.ok(without.ok && withGate.ok);
  if (without.ok && withGate.ok) {
    assert.equal(without.value.approved[0]!.effectiveTierCap, "indicative_discrepancy");
    assert.equal(withGate.value.approved[0]!.effectiveTierCap, "hedged_discrepancy");
  }
  // a short evaluation lifts nothing
  const weak = evaluate(goldSet(perfectIdentity(50).labels), predictions(perfectIdentity(50).preds));
  const w = lookupLinks(b.value, { venue: "xo", marketId: "SYNTHETIC-xo-0001" }, { now: NOW, gates: weak.gates });
  assert.ok(w.ok && w.value.approved[0]!.effectiveTierCap === "indicative_discrepancy");
});

function pair(id: string, sameRules: boolean, sameMask: boolean, venues: ["xo" | "polymarket", "xo" | "polymarket"] = ["xo", "polymarket"]): PairInput {
  const a = leg(venues[0], `${id}-a`);
  const b = leg(venues[1], `${id}-b`, {
    rulesSha256: sameRules ? a.rulesSha256 : synthSha(`other:${id}`),
    maskedSha256: sameMask ? a.maskedSha256 : synthSha(`othermask:${id}`),
  });
  return { pairId: id, a, b };
}

test("baseline generator: identical rules link, same template abstains, different rejects", () => {
  const preds = exactRulesBaseline([pair("p1", true, true), pair("p2", false, true), pair("p3", false, false), pair("p4", true, true, ["xo", "xo"])]);
  assert.deepEqual(preds.map((p) => p.verdict), ["link", "abstain", "reject", "reject"]);
  assert.deepEqual(preds[0]!.axes, []);
});

test("generator output becomes a CANDIDATE only; the registry never gains an approval", () => {
  const p = pair("p1", true, true);
  const [pred] = exactRulesBaseline([p]);
  const built = candidateFromPrediction(p, pred!, "2026-12-31T23:59:00Z");
  assert.ok(built.ok);
  if (!built.ok) return;
  const r = proposeLink(emptyRegistry(), built.input, { source: "structural", id: "gen-baseline" }, { today: TODAY });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.link.state, "candidate");
  assert.equal(r.value.link.tierCap, "indicative_discrepancy");
  assert.deepEqual(r.value.link.approvals, []);
  // verdicts that need a human to type differences do not convert
  assert.equal(candidateFromPrediction(p, { pairId: "p1", verdict: "abstain" }, "2026-12-31T23:59:00Z").ok, false);
  assert.equal(candidateFromPrediction(p, { pairId: "p1", verdict: "link", relation: "near_identity", outcomeMap: [0, 1], axes: [] }, "2026-12-31T23:59:00Z").ok, false);
  assert.equal(candidateFromPrediction(p, { pairId: "p1", verdict: "link", relation: "identity", outcomeMap: [0, 1], axes: ["timing_cutoff"] }, "2026-12-31T23:59:00Z").ok, false);
});

test("stratified sampling is deterministic, order independent and bounded per stratum", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ id: `i${String(i).padStart(2, "0")}`, band: i % 3 === 0 ? "high" : i % 3 === 1 ? "mid" : "low" }));
  const a = stratifiedSample(items, (x) => x.band, (x) => x.id, 5, 42);
  const b = stratifiedSample([...items].reverse(), (x) => x.band, (x) => x.id, 5, 42);
  assert.deepEqual(a.map((s) => s.item.id), b.map((s) => s.item.id));
  assert.equal(a.length, 15);
  for (const band of ["high", "mid", "low"]) assert.equal(a.filter((s) => s.stratum === band).length, 5);
  const c = stratifiedSample(items, (x) => x.band, (x) => x.id, 5, 43);
  assert.notDeepEqual(a.map((s) => s.item.id), c.map((s) => s.item.id));
  assert.equal(stratifiedSample(items, (x) => x.band, (x) => x.id, 0, 1).length, 0);
  assert.throws(() => stratifiedSample(items, (x) => x.band, (x) => x.id, -1, 1));
  const r = mulberry32(7);
  const first = [r(), r(), r()];
  const r2 = mulberry32(7);
  assert.deepEqual(first, [r2(), r2(), r2()]);
});

test("the AFTER constant is strictly after the freeze date", () => {
  assert.ok(AFTER > FREEZE_AT.slice(0, 10));
});
