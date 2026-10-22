import assert from "node:assert/strict";
import { test } from "vitest";
import { DEFAULTS } from "./edge.js";
import { assignLabel, evaluateGates, haircutForBasis, type BasisInfo, type GateInput } from "./labels.js";
import { dec, ratToDecExact } from "../money/rational.js";

const good: GateInput = {
  kind: "cross_venue_pair",
  net: dec("0.02"),
  tau: DEFAULTS.tau,
  rulesHashesUnchanged: true,
  allTradable: true,
  nearClose: false,
  disputeOrProposalFlag: false,
  booksNative: true,
  depthComplete: true,
  skewMs: 1_000,
  feesUsable: true,
  linkState: "verified",
  basis: { class: "identical", axes: [] },
};

test("a clean cross-venue pair is hedged_discrepancy, never an executable label", () => {
  const d = assignLabel(good);
  assert.equal(d.label, "hedged_discrepancy");
  assert.deepEqual(d.reasons, []);
  assert.equal(d.executableDisabled, true);
  assert.notEqual(d.label as string, "executable_arbitrage");
});

test("every failed gate downgrades a cross-venue pair to indicative with a machine-readable reason", () => {
  const cases: [Partial<GateInput>, string][] = [
    [{ rulesHashesUnchanged: false }, "rules_hash_changed"],
    [{ allTradable: false }, "not_tradable"],
    [{ nearClose: true }, "near_close"],
    [{ disputeOrProposalFlag: true }, "dispute_or_proposal_flag"],
    [{ booksNative: false }, "books_not_native"],
    [{ depthComplete: false }, "depth_incomplete"],
    [{ feesUsable: false }, "fee_model_unverified"],
    [{ skewMs: 60_001 }, "leg_skew_too_large"],
    [{ skewMs: null }, "skew_unknown"],
    [{ net: null }, "net_edge_unknown"],
    [{ net: dec("0.005") }, "net_edge_not_above_tau"],
    [{ net: dec("0") }, "net_edge_not_above_tau"],
    [{ linkState: "candidate" }, "link_not_verified"],
    [{ linkState: "suspended" }, "link_not_verified"],
    [{ linkState: "none" }, "link_not_verified"],
    [{ basis: { class: "identical", axes: ["condition_scope"] } }, "basis_unresolved"],
  ];
  for (const [patch, reason] of cases) {
    const d = assignLabel({ ...good, ...patch });
    assert.equal(d.label, "indicative_discrepancy", reason);
    assert.ok(d.reasons.includes(reason), `${reason} in ${d.reasons.join(",")}`);
  }
  const { basis: _basis, ...noBasis } = good;
  void _basis;
  assert.ok(assignLabel(noBasis).reasons.includes("basis_unknown"));
});

test("a 5 s skew is fine for the structural tier but 6 s is not; cross-venue allows 60 s", () => {
  const within: GateInput = { ...good, kind: "within_venue_structure", directionAllowed: true, exhaustive: "by_rule" };
  assert.equal(assignLabel({ ...within, skewMs: 5_000 }).label, "structural_violation");
  const slow = assignLabel({ ...within, skewMs: 6_000 });
  assert.equal(slow.label, "indicative_discrepancy");
  assert.ok(slow.reasons.includes("leg_skew_too_large"));
  assert.equal(assignLabel({ ...good, skewMs: 60_000 }).label, "hedged_discrepancy");
});

test("within-venue structure needs a direction allowed by exhaustiveness", () => {
  const within: GateInput = { ...good, kind: "within_venue_structure", exhaustive: "no" };
  const d = assignLabel({ ...within, directionAllowed: false });
  assert.equal(d.label, "indicative_discrepancy");
  assert.ok(d.reasons.includes("direction_not_allowed_by_exhaustiveness"));
  assert.ok(assignLabel(within).reasons.includes("direction_not_allowed_by_exhaustiveness")); // unknown fails closed
  assert.equal(assignLabel({ ...within, directionAllowed: true }).label, "structural_violation");
});

test("model edges need a shrunk forecast; factor relations are signals only", () => {
  const model: GateInput = { ...good, kind: "model", forecastShrunk: true };
  assert.equal(assignLabel(model).label, "model_edge");
  const unshrunk = assignLabel({ ...model, forecastShrunk: false });
  assert.equal(unshrunk.label, "indicative_discrepancy");
  assert.deepEqual(unshrunk.reasons, ["forecast_not_shrunk"]);
  const { forecastShrunk: _f, ...unknown } = model;
  void _f;
  assert.equal(assignLabel(unknown).label, "indicative_discrepancy");
  assert.equal(assignLabel({ ...good, kind: "factor" }).label, "relative_value_signal");
});

test("evaluateGates collects every failure at once", () => {
  const reasons = evaluateGates({ ...good, nearClose: true, depthComplete: false, linkState: "none" });
  assert.deepEqual(reasons.sort(), ["depth_incomplete", "link_not_verified", "near_close"]);
});

test("haircut by basis follows 5.6; an unresolved condition_scope axis has none", () => {
  const h = (b: BasisInfo): string | null => {
    const v = haircutForBasis(b);
    return v === null ? null : ratToDecExact(v);
  };
  assert.equal(h({ class: "identical", axes: [] }), "0.005");
  assert.equal(h({ class: "settlement_window", axes: ["timing"] }), "0.02");
  assert.equal(h({ class: "identical", axes: ["timing"] }), "0.02");
  assert.equal(h({ class: "settlement_source", axes: ["source"] }), "0.05");
  assert.equal(h({ class: "identical", axes: ["source"] }), "0.05");
  assert.equal(h({ class: "identical", axes: ["condition_scope"] }), null);
  assert.equal(h({ class: "settlement_source", axes: ["timing", "condition_scope"] }), null);
});
