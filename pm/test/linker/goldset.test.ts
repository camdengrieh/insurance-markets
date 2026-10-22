// Gold-set check for what the linker can claim from pins alone. The scorer needs market text, which a
// gold label does not hold, so the generator evaluated here is the hash-only part of the policy:
// identical rules on two venues -> identity; equal masked template -> abstain; else reject. It must
// never produce a false link on the synthetic gold set, and it never approves anything.

import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "../../../sdk/links/goldset/evaluate.js";
import type { PredictionsFile } from "../../../sdk/links/goldset/format.js";
import { exactRulesBaseline, type PairInput } from "../../../sdk/links/goldset/generator.js";
import { leg } from "../links/fixtures.js";
import { goldSet, label, FREEZE_AT } from "../links/goldset-fixtures.js";

function pairsOf(gold: ReturnType<typeof goldSet>): PairInput[] {
  return gold.labels.map((l) => ({
    pairId: l.pairId,
    a: leg(l.a.venue as "xo", l.a.marketId.replace("SYNTHETIC-", ""), { marketId: l.a.marketId, rulesSha256: l.a.rulesSha256 }),
    b: leg(l.b.venue as "polymarket", l.b.marketId.replace("SYNTHETIC-", ""), { marketId: l.b.marketId, rulesSha256: l.b.rulesSha256 }),
  }));
}

test("the hash-only linker policy makes no false link and never links a different question", () => {
  const gold = goldSet([
    label({ id: "same-1" }),
    label({ id: "same-2" }),
    label({ id: "diff-1", qLevel: false }),
    label({ id: "diff-2", qLevel: false }),
    label({ id: "timing-1", axes: ["timing_cutoff"], relation: "near_identity" }),
  ]);
  // Gold rule hashes differ per side by construction; make two true pairs byte-identical in rules.
  const pairs = pairsOf(gold).map((p) => (p.pairId.startsWith("same") ? { ...p, b: { ...p.b, rulesSha256: p.a.rulesSha256 } } : p));
  const predictions: PredictionsFile = {
    format: "pm-link-predictions",
    version: 1,
    generatorId: "stats-linker-v1-hash-only",
    freeze: { frozenAt: FREEZE_AT, parserVersion: "linker-v1", lexiconVersion: "none", templateSetVersion: "none" },
    predictions: exactRulesBaseline(pairs),
  };
  const report = evaluate(gold, predictions);
  const total = report.classes.reduce((a, c) => a + c.metrics.falseLinks, 0);
  assert.equal(total, 0);
  const linked = predictions.predictions.filter((p) => p.verdict === "link").map((p) => p.pairId).sort();
  assert.deepEqual(linked, ["same-1", "same-2"]);
  assert.ok(report.classes.every((c) => c.executable === "unproven"));
});
