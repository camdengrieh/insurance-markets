import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateErrors, isAutomationHandle, linkErrors } from "../../links/invariants.js";
import { isRestrictedVenue } from "../../links/schema.js";
import {
  candidateInputSchema,
  computeLinkId,
  contentSha256,
  legSchema,
  linkSchema,
  type CandidateInput,
} from "../../links/schema.js";
import { classKeyOf, computeTierCap, effectiveProofLevel, minTier, requiredApprovals, structuralCeiling } from "../../links/tier.js";
import { emptyRegistry } from "../../links/store.js";
import {
  NOW,
  approve,
  complementCandidate,
  identityCandidate,
  ladderCandidate,
  leg,
  nearIdentityCandidate,
  propose,
} from "./fixtures.js";

function clone<T>(v: T): T {
  return structuredClone(v);
}

test("a well-formed synthetic candidate parses and passes invariants", () => {
  for (const c of [identityCandidate(), nearIdentityCandidate(), ladderCandidate(), complementCandidate()]) {
    const parsed = candidateInputSchema.safeParse(c);
    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
    assert.deepEqual(candidateErrors(c), []);
  }
});

test("unknown fields are refused at every level", () => {
  const c = identityCandidate() as unknown as Record<string, unknown>;
  assert.equal(candidateInputSchema.safeParse({ ...c, extra: 1 }).success, false);
  const legs = (c.legs as Record<string, unknown>[]).map((l, i) => (i === 0 ? { ...l, title: "market title" } : l));
  assert.equal(candidateInputSchema.safeParse({ ...c, legs }).success, false);
  assert.equal(candidateInputSchema.safeParse({ ...c, state: "approved" }).success, false);
  assert.equal(candidateInputSchema.safeParse({ ...c, reviewer: "someone" }).success, false);
  const basis = { ...(c.basis as object), note: "x" };
  assert.equal(candidateInputSchema.safeParse({ ...c, basis }).success, false);
});

test("unknown enum values are refused, including the disabled executable tier", () => {
  const c = identityCandidate();
  const bad = (patch: Record<string, unknown>): boolean => candidateInputSchema.safeParse({ ...c, ...patch }).success;
  assert.equal(bad({ relation: "subset" }), false);
  assert.equal(bad({ proof: { level: "P9_magic", evidence: [] } }), false);
  assert.equal(bad({ basis: { ...c.basis, class: "kinda_same" } }), false);
  assert.equal(legSchema.safeParse({ ...c.legs[0], venue: "bet365" }).success, false);
  assert.equal(legSchema.safeParse({ ...c.legs[0], voidPolicy: "shrug" }).success, false);
  // tierCap lives on stored links; executable_arbitrage is not a value at all
  const { link } = propose(emptyRegistry(), c);
  assert.equal(linkSchema.safeParse({ ...link, tierCap: "executable_arbitrage" }).success, false);
  assert.equal(linkSchema.safeParse({ ...link, state: "pending" }).success, false);
  assert.equal(linkSchema.safeParse({ ...link, schemaVersion: 2 }).success, false);
});

test("hash, id, date and market-id formats are strict", () => {
  const c = identityCandidate();
  const l0 = c.legs[0];
  assert.ok(l0);
  assert.equal(legSchema.safeParse({ ...l0, rulesSha256: "ABC" }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, rulesSha256: l0.rulesSha256.toUpperCase() }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, closeUtc: "2026-02-30T00:00:00Z" }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, closeUtc: "2026-12-31 23:59:00" }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, marketId: "has space" }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, marketId: "0xABCDEF" }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, marketId: "0xabcdef" }).success, true);
  assert.equal(legSchema.safeParse({ ...l0, outcomeMap: [] }).success, false);
  assert.equal(legSchema.safeParse({ ...l0, outcomeMap: [0, 1.5] }).success, false);
});

test("control and format characters are refused in free text", () => {
  const c = identityCandidate();
  const bad = clone(c);
  bad.proof.evidence[0] = { method: "slot_equal", detail: "ok‮ hidden" };
  assert.equal(candidateInputSchema.safeParse(bad).success, false);
});

test("restricted venue: quotes from a Kalshi leg are refused", () => {
  const c = nearIdentityCandidate();
  const kal = clone(c);
  kal.legs[1] = leg("kalshi", "kal-0002");
  // the fixture's axis carries a quote for leg 1, which is now Kalshi: refused
  assert.ok(candidateErrors(kal).some((e) => e.includes("quoteB is not allowed")));
  delete kal.basis.axes[0]!.quoteB;
  // free text on the Kalshi side is refused too (TC-1): ids, hashes and short codes only
  assert.ok(candidateErrors(kal).some((e) => e.includes("axes[0].b")));
  kal.basis.axes[0] = { ...kal.basis.axes[0]!, b: "2359_ET" };
  kal.proof.evidence[0] = { method: "template", detail: "template_T-SYN" };
  assert.deepEqual(candidateErrors(kal), []); // ids, hashes and codes are fine
  const quotedAxis = clone(kal);
  quotedAxis.basis.axes[0] = { ...quotedAxis.basis.axes[0]!, quoteB: "text copied from the Kalshi rules" };
  assert.ok(candidateErrors(quotedAxis).some((e) => e.includes("quoteB is not allowed for restricted venue kalshi")));
  const quotedEvidence = clone(kal);
  quotedEvidence.proof.evidence.push({ method: "template", detail: "d", legIndex: 1, quote: "kalshi rule text" });
  assert.ok(candidateErrors(quotedEvidence).some((e) => e.includes("quotes restricted venue kalshi")));
  const unanchored = clone(kal);
  unanchored.proof.evidence.push({ method: "template", detail: "d", quote: "who said this?" });
});

test("TM-04: a quote on leg 0 is refused when leg 0 is the restricted one, and the check is symmetric", () => {
  const base = nearIdentityCandidate();
  for (const side of [0, 1] as const) {
    const c = clone(base);
    c.legs[side] = leg("kalshi", `kal-side${side}`);
    c.legs[side === 0 ? 1 : 0] = leg("xo", "xo-other");
    c.basis.axes[0] = { axis: "timing_cutoff", legA: 0, legB: 1, a: "2359_UTC", b: "2359_ET", severity: "minor" };
    c.proof.evidence[0] = { method: "template", detail: "template_T-SYN" };
    assert.deepEqual(candidateErrors(c).filter((e) => e.includes("quote")), [], `clean side ${side}`);
    c.basis.axes[0] = { ...c.basis.axes[0]!, [side === 0 ? "quoteA" : "quoteB"]: "copied rule text" };
    assert.ok(candidateErrors(c).some((e) => e.includes(`quote${side === 0 ? "A" : "B"} is not allowed for restricted venue kalshi`)), `side ${side}`);
  }
});

test("TM-01: the restricted-venue ban follows the registry's terms, and a venue with no record counts as restricted", () => {
  // Registry: kalshi restricted, hyperliquid unknown terms, polymarket_us / world / predictfun /
  // opinion have no record. Only venues recorded as "none found" may carry venue-derived text.
  for (const venue of ["kalshi", "hyperliquid", "polymarket_us", "world", "predictfun", "opinion"] as const) {
    assert.equal(isRestrictedVenue(venue), true, venue);
    const c = clone(nearIdentityCandidate());
    c.legs[1] = leg(venue, `rest-${venue}`);
    c.basis.axes[0] = { axis: "timing_cutoff", legA: 0, legB: 1, a: "2359_UTC", b: "2359_ET", severity: "minor", quoteB: "copied rule text" };
    c.proof.evidence[0] = { method: "template", detail: "template_T-SYN", legIndex: 1, quote: "copied rule text" };
    const errors = candidateErrors(c);
    assert.ok(errors.some((e) => e.includes(`quoteB is not allowed for restricted venue ${venue}`)), `${venue}: ${errors.join("; ")}`);
    assert.ok(errors.some((e) => e.includes(`quotes restricted venue ${venue}`)), venue);
  }
  for (const venue of ["xo", "polymarket", "limitless", "trueo", "manifold"] as const) {
    assert.equal(isRestrictedVenue(venue), false, venue);
  }
  assert.equal(isRestrictedVenue("not-a-venue"), true);
});

test("TC-1: venue-derived free text cannot ride in axis values or evidence details of a link with a restricted leg", () => {
  const SENTINEL = "SENTINEL TEXT paraphrasing the Kalshi rules";
  const c = clone(nearIdentityCandidate());
  c.legs[1] = leg("kalshi", "kal-tc1");
  delete c.basis.axes[0]!.quoteB;
  c.basis.axes[0] = { ...c.basis.axes[0]!, a: "2359_UTC", b: "2359_ET" };
  c.proof.evidence[0] = { method: "template", detail: "template_T-SYN" };
  assert.deepEqual(candidateErrors(c), []);

  const inB = clone(c);
  inB.basis.axes[0] = { ...inB.basis.axes[0]!, b: SENTINEL };
  const eB = candidateErrors(inB);
  assert.ok(eB.some((e) => e.includes("axes[0].b")), eB.join("; "));
  assert.equal(eB.join("").includes("SENTINEL"), false, "the error must not echo the text");

  const inDetail = clone(c);
  inDetail.proof.evidence[0] = { method: "template", detail: `Kalshi rules_primary: ${SENTINEL}`, legIndex: 1 };
  const eD = candidateErrors(inDetail);
  assert.ok(eD.some((e) => e.includes("evidence[0].detail")), eD.join("; "));
  assert.equal(eD.join("").includes("SENTINEL"), false);

  // The unrestricted side (an XO leg) keeps free text, and so does a link with no restricted leg.
  const inA = clone(c);
  inA.basis.axes[0] = { ...inA.basis.axes[0]!, a: "23:59 UTC at the venue's close" };
  assert.deepEqual(candidateErrors(inA), []);
  assert.deepEqual(candidateErrors(clone(nearIdentityCandidate())), []);
});

test("synthetic flag and SYNTHETIC- ids must agree", () => {
  const real = clone(identityCandidate());
  real.synthetic = false;
  assert.ok(candidateErrors(real).some((e) => e.includes("non-synthetic link")));
  const mixed = clone(identityCandidate());
  mixed.legs[1] = leg("polymarket", "x");
  mixed.legs[1] = { ...mixed.legs[1], marketId: "real-looking-id", rulesSha256: mixed.legs[0]!.rulesSha256 };
  assert.ok(candidateErrors(mixed).some((e) => e.includes("must use a SYNTHETIC- market id")));
});

test("relation shape rules", () => {
  const noLadder = clone(ladderCandidate());
  delete (noLadder as { ladder?: unknown }).ladder;
  assert.ok(candidateErrors(noLadder).some((e) => e.includes("needs a ladder object")));
  const strayLadder = { ...identityCandidate(), ladder: { axis: "date", monotonicity: "decreasing" } } as CandidateInput;
  assert.ok(candidateErrors(strayLadder).some((e) => e.includes("only allowed on ladder")));
  const strayExh = { ...identityCandidate(), exhaustiveness: "E4_template" } as CandidateInput;
  assert.ok(candidateErrors(strayExh).some((e) => e.includes("only allowed on partition")));
  const partitionNoLevel = { ...identityCandidate(), relation: "partition" } as CandidateInput;
  assert.ok(candidateErrors(partitionNoLevel).some((e) => e.includes("needs an exhaustiveness level")));
  const threeLegIdentity = clone(identityCandidate());
  threeLegIdentity.legs.push(leg("limitless", "lim"));
  assert.ok(candidateErrors(threeLegIdentity).some((e) => e.includes("exactly two legs")));
});

test("outcome maps: leg 0 identity, identity links permute, complement inverts", () => {
  const swappedFirst = clone(identityCandidate());
  swappedFirst.legs[0] = { ...swappedFirst.legs[0]!, outcomeMap: [1, 0] };
  assert.ok(candidateErrors(swappedFirst).some((e) => e.includes("legs[0].outcomeMap must be the identity map")));
  const lengthMismatch = clone(identityCandidate());
  lengthMismatch.legs[1] = { ...lengthMismatch.legs[1]!, outcomeMap: [0, 1, 2] };
  assert.ok(candidateErrors(lengthMismatch).some((e) => e.includes("permutation")));
  const repeated = clone(identityCandidate());
  repeated.legs[1] = { ...repeated.legs[1]!, outcomeMap: [0, 0] };
  assert.ok(candidateErrors(repeated).some((e) => e.includes("repeats an index")));
  const notInverted = clone(complementCandidate());
  notInverted.legs[1] = { ...notInverted.legs[1]!, outcomeMap: [0, 1] };
  assert.ok(candidateErrors(notInverted).some((e) => e.includes("[1,0]")));
});

test("the same market twice in one link is refused", () => {
  const dup = clone(ladderCandidate());
  dup.legs[1] = { ...dup.legs[0]! };
  assert.ok(candidateErrors(dup).some((e) => e.includes("repeats market")));
});

test("basis class and axes must tell the same story", () => {
  const identityWithAxis = clone(nearIdentityCandidate());
  identityWithAxis.relation = "identity";
  assert.ok(candidateErrors(identityWithAxis).some((e) => e.includes("identity links are class identical")));
  const nearIdentical = clone(identityCandidate());
  nearIdentical.relation = "near_identity";
  assert.ok(candidateErrors(nearIdentical).some((e) => e.includes("near_identity links must name a non-identical basis")));
  const windowNoAxis = clone(nearIdentityCandidate());
  windowNoAxis.basis = { class: "settlement_window", axes: [], cutoffDeltaMinutes: 300 };
  assert.ok(candidateErrors(windowNoAxis).some((e) => e.includes("settlement_window needs")));
  const sourceNoAxis = clone(nearIdentityCandidate());
  sourceNoAxis.basis = { ...sourceNoAxis.basis, class: "settlement_source" };
  assert.ok(candidateErrors(sourceNoAxis).some((e) => e.includes("settlement_source needs")));
  const zeroDeltaWithCutoff = clone(nearIdentityCandidate());
  zeroDeltaWithCutoff.basis = { ...zeroDeltaWithCutoff.basis, cutoffDeltaMinutes: 0 };
  assert.ok(candidateErrors(zeroDeltaWithCutoff).some((e) => e.includes("contradicts cutoffDeltaMinutes 0")));
  const badLegIndex = clone(nearIdentityCandidate());
  badLegIndex.basis.axes[0] = { ...badLegIndex.basis.axes[0]!, legB: 7 };
  assert.ok(candidateErrors(badLegIndex).some((e) => e.includes("leg that does not exist")));
});

test("proof level needs matching evidence; unproven allows only statistics hints", () => {
  const p0 = clone(identityCandidate());
  p0.proof = { level: "P0_native", evidence: [{ method: "slot_equal", detail: "d" }] };
  assert.ok(candidateErrors(p0).some((e) => e.includes("P0_native needs native_hook")));
  const p2 = clone(identityCandidate());
  p2.proof = { level: "P2_template", evidence: [{ method: "template", detail: "d" }] };
  assert.ok(candidateErrors(p2).some((e) => e.includes("needs templateId")));
  const p4 = clone(identityCandidate());
  p4.proof = { level: "P4_human", evidence: [] };
  assert.ok(candidateErrors(p4).some((e) => e.includes("P4_human needs human_review")));
  const unproven = clone(identityCandidate());
  unproven.proof = { level: "P_unproven", evidence: [{ method: "native_hook", detail: "d" }] };
  assert.ok(candidateErrors(unproven).some((e) => e.includes("P_unproven allows statistics_hint evidence only")));
  const okUnproven = clone(identityCandidate());
  okUnproven.proof = { level: "P_unproven", evidence: [{ method: "statistics_hint", detail: "rho 0.8 (not proof)" }] };
  assert.deepEqual(candidateErrors(okUnproven), []);
});

test("validUntil may not exceed the earliest leg close", () => {
  const c = clone(identityCandidate());
  c.legs[1] = { ...c.legs[1]!, closeUtc: "2026-11-01T00:00:00Z" };
  assert.ok(candidateErrors(c).some((e) => e.includes("validUntil")));
});

test("linkId is content-addressed over relation and every pin", () => {
  const { link } = propose(emptyRegistry(), identityCandidate());
  assert.match(link.linkId, /^lnk_[0-9a-f]{32}$/);
  assert.equal(link.linkId, computeLinkId(link));
  const pinChange = clone(identityCandidate());
  pinChange.legs[0] = { ...pinChange.legs[0]!, rulesSha256: "0".repeat(64) };
  assert.notEqual(computeLinkId(pinChange), link.linkId);
  const forged = { ...link, linkId: `lnk_${"0".repeat(32)}` };
  assert.ok(linkErrors(forged).some((e) => e.includes("linkId does not match")));
});

test("content digest ignores review state but covers the proposal", () => {
  const { link } = propose(emptyRegistry(), identityCandidate());
  assert.equal(contentSha256(link), contentSha256({ ...link, state: "suspended", stateReason: "x" }));
  const edited = clone(link);
  edited.basis.cutoffDeltaMinutes = 5;
  assert.notEqual(contentSha256(edited), contentSha256(link));
});

test("tier ceiling: same venue structural, cross venue hedged, blocks fall to indicative", () => {
  const cross = propose(emptyRegistry(), identityCandidate()).link;
  assert.equal(structuralCeiling(cross).cap, "hedged_discrepancy");
  const same = propose(emptyRegistry(), ladderCandidate()).link;
  assert.equal(structuralCeiling(same).cap, "structural_violation");

  const blocked = (mutate: (c: CandidateInput) => void, reason: string): void => {
    const c = clone(identityCandidate());
    mutate(c);
    const r = structuralCeiling(c);
    assert.equal(r.cap, "indicative_discrepancy", reason);
    assert.ok(r.reasons.some((x) => x.startsWith(reason)), `${reason} in ${r.reasons.join(",")}`);
  };
  blocked((c) => { c.relation = "related"; }, "relation_related_signal_only");
  blocked((c) => { c.basis = { ...c.basis, class: "different" }; }, "basis_different");
  blocked((c) => { c.legs[0] = { ...c.legs[0]!, voidPolicy: "unknown" }; }, "void_policy_unknown");
  blocked((c) => { c.basis = { ...c.basis, cutoffDeltaMinutes: null }; }, "cutoff_delta_unknown");
  blocked((c) => { c.legs[0] = { ...c.legs[0]!, creatorAllowlisted: false }; }, "xo_creator_not_allowlisted");
  blocked((c) => { c.legs[0] = { ...c.legs[0]!, creatorAllowlisted: null }; }, "xo_creator_unknown");
  blocked((c) => {
    c.basis = { class: "different", axes: [{ axis: "exception_clause", legA: 0, legB: 1, a: "none", b: "death carve-out", severity: "fatal" }], cutoffDeltaMinutes: 0 };
  }, "axis_fatal");
  const unpricedAxis = structuralCeiling(clone(nearIdentityCandidate()));
  assert.equal(unpricedAxis.cap, "hedged_discrepancy"); // timing_cutoff is priced
  const sourceAxis = clone(nearIdentityCandidate());
  sourceAxis.basis = { class: "settlement_source", cutoffDeltaMinutes: 0, axes: [{ axis: "measure_source", legA: 0, legB: 1, a: "src A", b: "src B", severity: "major" }] };
  assert.ok(structuralCeiling(sourceAxis).reasons.includes("axis_unpriced:measure_source"));

  const polarity = clone(ladderCandidate());
  polarity.ladder = { axis: "date", monotonicity: "unknown" };
  assert.ok(structuralCeiling(polarity).reasons.includes("ladder_polarity_unknown"));

  const partition = clone(identityCandidate());
  partition.relation = "partition";
  partition.exhaustiveness = "E0_unknown";
  assert.ok(structuralCeiling(partition).reasons.includes("exhaustiveness_unproven"));
  partition.exhaustiveness = "E1_exclusive_only";
  assert.ok(structuralCeiling(partition).notes.includes("short_basket_only"));
  assert.ok(!structuralCeiling(partition).reasons.includes("exhaustiveness_unproven"));
});

test("a Kalshi leg adds a manual-leg note and stays at hedged", () => {
  const c = clone(identityCandidate());
  c.legs[1] = leg("kalshi", "kal-0001", { rulesSha256: c.legs[0]!.rulesSha256, maskedSha256: c.legs[0]!.maskedSha256 });
  const r = structuralCeiling(c);
  assert.equal(r.cap, "hedged_discrepancy");
  assert.ok(r.notes.includes("manual_leg_required:kalshi"));
});

test("effective cap: nothing above indicative without a passed class gate, and never for non-approved or expired links", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  assert.equal(computeTierCap(first.link, { now: NOW }).cap, "indicative_discrepancy"); // candidate
  const reg = approve(first.registry, first.link.linkId);
  const approved = reg.links[0]!;
  const noGate = computeTierCap(approved, { now: NOW });
  assert.equal(noGate.cap, "indicative_discrepancy");
  assert.ok(noGate.reasons.includes("class_gate_not_evaluated"));
  const key = classKeyOf({ relation: "identity", venues: ["xo", "polymarket"], family: null });
  assert.equal(computeTierCap(approved, { now: NOW, gates: { [key]: { q: true, hedged: false } } }).cap, "indicative_discrepancy");
  assert.equal(computeTierCap(approved, { now: NOW, gates: { [key]: { q: true, hedged: true } } }).cap, "hedged_discrepancy");
  const expired = computeTierCap(approved, { now: new Date("2027-01-01T00:00:00Z"), gates: { [key]: { q: true, hedged: true } } });
  assert.equal(expired.cap, "indicative_discrepancy");
  assert.ok(expired.reasons.includes("expired"));
  assert.equal(minTier("hedged_discrepancy", "structural_violation"), "structural_violation");
});

test("TM-05: a reviewer's lower tier cap holds even when the class gate passes", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const approved = approve(first.registry, first.link.linkId).links[0]!;
  const key = classKeyOf({ relation: "identity", venues: ["xo", "polymarket"], family: null });
  const gates = { [key]: { q: true, hedged: true } };
  assert.equal(computeTierCap(approved, { now: NOW, gates }).cap, "hedged_discrepancy", "control: no human downgrade");
  const lowered = { ...approved, tierCap: "indicative_discrepancy" as const };
  assert.equal(computeTierCap(lowered, { now: NOW, gates }).cap, "indicative_discrepancy");
});

test("TM-07: only an approved link reports human-verified proof; a partly approved candidate keeps the proposer's claim", () => {
  const approvals = [{ reviewer: "reviewer-a", date: "2026-10-20", evidence: ["e"], digest: "0".repeat(64) }];
  for (const level of ["P3_llm_assisted", "P_unproven"] as const) {
    assert.equal(effectiveProofLevel({ proof: { level, evidence: [] }, state: "approved", approvals }), "P4_human", level);
    for (const state of ["candidate", "suspended", "revoked"] as const) {
      assert.equal(effectiveProofLevel({ proof: { level, evidence: [] }, state, approvals }), level, `${state}/${level}`);
    }
    assert.equal(effectiveProofLevel({ proof: { level, evidence: [] }, state: "approved", approvals: [] }), level);
  }
  assert.equal(effectiveProofLevel({ proof: { level: "P1_slot_equal", evidence: [] }, state: "approved", approvals }), "P1_slot_equal");
});

test("same-venue links need the q gate only", () => {
  const first = propose(emptyRegistry(), ladderCandidate());
  const reg = approve(first.registry, first.link.linkId);
  const approved = reg.links[0]!;
  const key = classKeyOf({ relation: "ladder", venues: ["xo"], family: "T-TOUCH" });
  assert.equal(computeTierCap(approved, { now: NOW, gates: { [key]: { q: true, hedged: false } } }).cap, "structural_violation");
  assert.equal(computeTierCap(approved, { now: NOW, gates: { [key]: { q: false, hedged: false } } }).cap, "indicative_discrepancy");
});

test("two keys for a cross-venue partition that rests on a rule clause alone", () => {
  const base = { legs: [leg("xo", "p1"), leg("polymarket", "p2")] };
  assert.equal(requiredApprovals({ relation: "partition", exhaustiveness: "E2_by_rule_clause", ...base }), 2);
  assert.equal(requiredApprovals({ relation: "partition", exhaustiveness: "E4_template", ...base }), 1);
  assert.equal(requiredApprovals({ relation: "partition", exhaustiveness: "E2_by_rule_clause", legs: [leg("xo", "a"), leg("xo", "b")] }), 1);
  assert.equal(requiredApprovals({ relation: "identity", ...base }), 1);
});

test("automation-looking handles are recognised", () => {
  for (const h of ["llm-judge", "bot", "claude-review", "auto-approver", "ci", "stat-screen", "release-bot", "my_bot"]) {
    assert.equal(isAutomationHandle(h), true, h);
  }
  for (const h of ["reviewer-a", "alice.r", "jo"]) assert.equal(isAutomationHandle(h), false, h);
});

test("LS-2: model names, assistants and leetspeak are recognised as automation; real names are not", () => {
  for (const h of ["opus", "sonnet-4", "haiku", "assistant", "codex", "gemini", "c1aude", "ai-reviewer", "reviewer.ai", "g3mini", "0pus", "gpt5", "chatgpt-user", "Claude3"]) {
    assert.equal(isAutomationHandle(h), true, h);
  }
  // The old prefix test blocked real people whose names start with "ci", "stat" or "bot".
  for (const h of ["Cindy", "Ciaran", "Stathis", "Botond", "Aiden", "Aisha", "Modesto", "Agentina"]) {
    assert.equal(isAutomationHandle(h), false, h);
  }
});

test("LS-4: the declared cutoff gap may not understate the pinned closes, and an identical basis needs one void policy", () => {
  // Legs closing about four days apart but declared identical with delta 0 are inconsistent.
  const apart = clone(identityCandidate("ls4"));
  apart.legs[1] = { ...apart.legs[1]!, closeUtc: "2026-12-28T00:00:00Z" };
  const e1 = candidateErrors(apart);
  assert.ok(e1.some((e) => e.includes("cutoffDeltaMinutes")), e1.join("; "));

  // A near-identity link must declare at least the gap the pins show (and may declare more).
  const near = clone(nearIdentityCandidate("ls4b"));
  near.legs[1] = { ...near.legs[1]!, closeUtc: "2026-12-31T19:00:00Z" }; // 4 h 59 min before leg 0
  near.validUntil = "2026-12-31T19:00:00Z";
  near.basis = { ...near.basis, cutoffDeltaMinutes: 298 };
  assert.ok(candidateErrors(near).some((e) => e.includes("cutoffDeltaMinutes")));
  near.basis = { ...near.basis, cutoffDeltaMinutes: 299 };
  assert.deepEqual(candidateErrors(near), []);
  near.basis = { ...near.basis, cutoffDeltaMinutes: 600 };
  assert.deepEqual(candidateErrors(near), []);
  // An unknown (null) delta is not understating anything: it is simply not computed yet.
  near.basis = { ...near.basis, cutoffDeltaMinutes: null };
  assert.equal(candidateErrors(near).some((e) => e.includes("understates")), false);

  const voids = clone(identityCandidate("ls4c"));
  voids.legs[0] = { ...voids.legs[0]!, voidPolicy: "fifty_fifty" };
  voids.legs[1] = { ...voids.legs[1]!, voidPolicy: "refund" };
  assert.ok(candidateErrors(voids).some((e) => e.includes("void policy")), candidateErrors(voids).join("; "));
  voids.legs[1] = { ...voids.legs[1]!, voidPolicy: "fifty_fifty" };
  assert.deepEqual(candidateErrors(voids), []);
});
