import assert from "node:assert/strict";
import { test } from "node:test";
import { isAutomationHandle, linkErrors } from "../../links/invariants.js";
import { emptyRegistry, findLink } from "../../links/store.js";
import { groupCandidates, pairCandidate, scoreCandidates } from "../../../sdk/linker/candidates.js";
import { buildFeatures, type FeatureInput, type MarketFeatures } from "../../../sdk/linker/features.js";
import { scorePair } from "../../../sdk/linker/score.js";
import { proposeAll, retireStale } from "../../linker/candidates.js";
import { LINKER_HANDLE } from "../../linker/constants.js";
import { approve } from "../links/fixtures.js";

const TODAY = "2026-10-20";
const NOW = Date.parse("2026-10-20T12:00:00Z");

function feat(venue: MarketFeatures["venue"], id: string, title: string, rules: string, over: Partial<FeatureInput> = {}): MarketFeatures {
  const base: FeatureInput = {
    venue,
    marketId: id,
    title,
    rulesCanonical: rules,
    rulesSha256: "a".repeat(64),
    maskedSha256: "b".repeat(64),
    closeUtc: "2026-12-31T00:00:00Z",
    category: "other",
    categoryConfidence: "none",
    voidPolicy: "unknown",
    resolverId: null,
    groupKey: null,
    groupKind: null,
    outcomes: 2,
  };
  return buildFeatures({ ...base, ...over });
}

const A = feat("xo", "SYNTHETIC-xo-a", "SYNTHETIC Alpha beats Beta on Dec 31, 2026", "resolves yes if alpha beats beta", { rulesSha256: "1".repeat(64), maskedSha256: "2".repeat(64) });
const B = feat("polymarket", "SYNTHETIC-poly-b", "SYNTHETIC Alpha beats Beta on Dec 31, 2026", "resolves yes if alpha beats beta", { rulesSha256: "3".repeat(64), maskedSha256: "4".repeat(64), closeUtc: "2026-12-31T05:00:00Z" });

test("the linker's handle can never be a reviewer", () => {
  assert.equal(isAutomationHandle(LINKER_HANDLE), true);
});

test("a pair with different closes is a near_identity with a timing axis; equal closes and different rules is basis different", () => {
  const near = pairCandidate(A, B, scorePair(A, B));
  assert.ok(near);
  assert.equal(near.relation, "near_identity");
  assert.equal(near.basis.class, "settlement_window");
  assert.deepEqual(near.basis.axes.map((x) => [x.axis, x.severity, x.a, x.b]), [["timing_cutoff", "minor", A.closeUtc, B.closeUtc]]);
  assert.equal(near.basis.cutoffDeltaMinutes, 300);
  assert.equal(near.validUntil, A.closeUtc);
  assert.equal(near.synthetic, true);
  assert.equal(near.proof.level, "P_unproven");
  const sameClose = pairCandidate(A, { ...B, closeUtc: A.closeUtc }, scorePair(A, { ...B, closeUtc: A.closeUtc }));
  assert.ok(sameClose);
  assert.equal(sameClose.basis.class, "different");
  assert.deepEqual(sameClose.basis.axes, []);
});

test("identical rule text, template, void policy and close is an identity candidate", () => {
  const b2 = { ...B, rulesSha256: A.rulesSha256, maskedSha256: A.maskedSha256, closeUtc: A.closeUtc };
  const c = pairCandidate(A, b2, scorePair(A, b2));
  assert.ok(c);
  assert.equal(c.relation, "identity");
  assert.equal(c.basis.class, "identical");
});

test("a mixed synthetic/real pair and a non-binary market never become candidates", () => {
  const real = { ...B, marketId: "0x" + "9".repeat(64) };
  assert.equal(pairCandidate(A, real, scorePair(A, real)), null);
  const multi = { ...B, outcomes: 3 };
  assert.equal(pairCandidate(A, multi, scorePair(A, multi)), null);
});

test("proposals land as candidates that pass the invariants, and a second pass finds them existing", () => {
  const { candidates } = scoreCandidates([{ a: A, b: B, blockKey: "other|0" }]);
  assert.equal(candidates.length, 1);
  const items = candidates.map((c) => ({ input: c.input, linkId: c.linkId, kind: "pair", source: "statistics" as const }));
  const first = proposeAll(emptyRegistry(), items, TODAY);
  assert.equal(first.proposed.length, 1);
  const link = findLink(first.registry, first.proposed[0]?.linkId ?? "");
  assert.ok(link);
  assert.equal(link.state, "candidate");
  assert.equal(link.tierCap, "indicative_discrepancy");
  assert.equal(link.proposedBy.source, "statistics");
  assert.equal(link.proposedBy.id, LINKER_HANDLE);
  assert.deepEqual(linkErrors(link), []);
  const second = proposeAll(first.registry, items, TODAY);
  assert.equal(second.proposed.length, 0);
  assert.equal(second.existing, 1);
  assert.equal(second.registry, first.registry);
});

test("a second identity partner on the same venue is refused by the pair-conflict rule, best score first", () => {
  const A2 = { ...A, marketId: "SYNTHETIC-xo-a2", titleTokens: A.titleTokens.slice(1) };
  const { candidates } = scoreCandidates([
    { a: A, b: B, blockKey: "k" },
    { a: A2, b: B, blockKey: "k" },
  ]);
  assert.equal(candidates.length, 2);
  assert.ok((candidates[0]?.score.bps ?? 0) >= (candidates[1]?.score.bps ?? 0));
  const r = proposeAll(emptyRegistry(), candidates.map((c) => ({ input: c.input, linkId: c.linkId, kind: "pair", source: "statistics" as const })), TODAY);
  assert.equal(r.proposed.length, 1);
  assert.equal(r.refused.length, 1);
  assert.match(r.refused[0]?.errors.join(" ") ?? "", /already has an identity partner/);
});

test("stale candidates of the linker are vetoed; a human-approved link with a changed pin is suspended", () => {
  const { candidates } = scoreCandidates([{ a: A, b: B, blockKey: "k" }]);
  const r = proposeAll(emptyRegistry(), candidates.map((c) => ({ input: c.input, linkId: c.linkId, kind: "pair", source: "statistics" as const })), TODAY);
  const id = r.proposed[0]?.linkId ?? "";
  // Unchanged legs: nothing happens.
  const seen = new Map([[`xo:${A.marketId}`, A], [`polymarket:${B.marketId}`, B]]);
  assert.deepEqual(retireStale(r.registry, seen, NOW, TODAY).vetoed, []);
  // A changed rules hash on one leg: the candidate is revoked by veto.
  const changed = new Map(seen);
  changed.set(`xo:${A.marketId}`, { ...A, rulesSha256: "f".repeat(64) });
  const v = retireStale(r.registry, changed, NOW, TODAY);
  assert.deepEqual(v.vetoed.map((x) => x.linkId), [id]);
  assert.equal(findLink(v.registry, id)?.state, "revoked");
  // A closed leg: vetoed too.
  const closed = retireStale(r.registry, seen, Date.parse("2027-01-01T00:00:00Z"), "2027-01-01");
  assert.equal(closed.vetoed[0]?.reason.includes("closed"), true);
  // After a person approves it, a changed pin suspends (never revokes) and says so.
  const approvedReg = approve(r.registry, id, "reviewer-a");
  assert.equal(findLink(approvedReg, id)?.state, "approved");
  const s = retireStale(approvedReg, changed, NOW, TODAY);
  assert.deepEqual(s.suspended.map((x) => x.linkId), [id]);
  assert.equal(findLink(s.registry, id)?.state, "suspended");
  assert.deepEqual(s.vetoed, []);
  // Someone else's candidate is not the linker's to veto.
  const foreign = { ...r.registry, links: r.registry.links.map((l) => ({ ...l, proposedBy: { ...l.proposedBy, id: "gen-manual" } })) };
  assert.deepEqual(retireStale(foreign, changed, NOW, TODAY).vetoed, []);
});

test("native neg-risk groups become partition candidates (P0 provenance) and same-template groups become ladders", () => {
  const nr = "0x" + "5".repeat(64);
  const p1 = feat("polymarket", "SYNTHETIC-p1", "SYNTHETIC Alpha wins", "alpha", { groupKey: nr, groupKind: "neg_risk", rulesSha256: "1".repeat(64), maskedSha256: "a".repeat(64) });
  const p2 = feat("polymarket", "SYNTHETIC-p2", "SYNTHETIC Beta wins", "beta", { groupKey: nr, groupKind: "neg_risk", rulesSha256: "2".repeat(64), maskedSha256: "b".repeat(64) });
  const p3 = feat("polymarket", "SYNTHETIC-p3", "SYNTHETIC Gamma wins", "gamma", { groupKey: nr, groupKind: "neg_risk", rulesSha256: "3".repeat(64), maskedSha256: "c".repeat(64) });
  const root = "xo-evt-" + "7".repeat(16);
  const x1 = feat("xo", "SYNTHETIC-x1", "SYNTHETIC BTC above 80000", "resolves yes above 80000", { groupKey: root, groupKind: "event", rulesSha256: "4".repeat(64), maskedSha256: "d".repeat(64) });
  const x2 = feat("xo", "SYNTHETIC-x2", "SYNTHETIC BTC above 90000", "resolves yes above 90000", { groupKey: root, groupKind: "event", rulesSha256: "5".repeat(64), maskedSha256: "d".repeat(64) });
  const groups = groupCandidates([x2, p3, x1, p1, p2]);
  assert.deepEqual(groups.map((g) => [g.kind, g.input.relation, g.input.legs.length]), [["partition", "partition", 3], ["ladder", "ladder", 2]]);
  const partition = groups[0]!;
  assert.equal(partition.source, "native_hook");
  assert.equal(partition.input.exhaustiveness, "E1_exclusive_only");
  assert.equal(partition.input.proof.level, "P0_native");
  const ladder = groups[1]!;
  assert.equal(ladder.source, "statistics");
  assert.deepEqual(ladder.input.ladder, { axis: "threshold", monotonicity: "unknown" });
  const r = proposeAll(emptyRegistry(), groups.map((g) => ({ input: g.input, linkId: g.linkId, kind: g.kind, source: g.source })), TODAY);
  assert.equal(r.proposed.length, 2);
  for (const l of r.registry.links) {
    assert.equal(l.state, "candidate");
    assert.deepEqual(linkErrors(l), []);
  }
});
