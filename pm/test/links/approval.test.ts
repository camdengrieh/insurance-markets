import assert from "node:assert/strict";
import { test } from "node:test";
import { APPROVAL_ACK, approveLink, reviewSheet, type HumanApproval } from "../../links/approve.js";
import { linkErrors } from "../../links/invariants.js";
import { contentSha256, type CandidateInput } from "../../links/schema.js";
import {
  emptyRegistry,
  findLink,
  parseRegistry,
  proposeLink,
  revokeLink,
  suspendLink,
  vetoLink,
} from "../../links/store.js";
import { TODAY, approve, humanApproval, identityCandidate, leg, ladderCandidate, propose } from "./fixtures.js";

test("proposing creates a candidate: no approval, capped at indicative, no reviewer", () => {
  const { link, registry } = propose(emptyRegistry(), identityCandidate());
  assert.equal(link.state, "candidate");
  assert.equal(link.tierCap, "indicative_discrepancy");
  assert.equal(link.reviewer, undefined);
  assert.deepEqual(link.approvals, []);
  assert.equal(registry.events.at(-1)?.action, "propose");
});

test("proposing cannot smuggle in a state, reviewer or approvals", () => {
  const c = { ...identityCandidate(), state: "approved", reviewer: "reviewer-a", approvals: [], tierCap: "hedged_discrepancy" };
  const r = proposeLink(emptyRegistry(), c, { source: "manual", id: "reviewer-a" }, { today: TODAY });
  assert.equal(r.ok, false);
});

test("a proposal from any source, including an LLM, is only ever a candidate", () => {
  for (const source of ["llm", "statistics", "structural", "native_hook", "manual"] as const) {
    const c: CandidateInput = identityCandidate(`s-${source}`);
    if (source === "llm") c.proof = { level: "P3_llm_assisted", evidence: [{ method: "llm_quoted", detail: "synthetic" }] };
    if (source === "statistics") c.proof = { level: "P_unproven", evidence: [{ method: "statistics_hint", detail: "synthetic rho" }] };
    const r = proposeLink(emptyRegistry(), c, { source, id: `gen-${source}` }, { today: TODAY });
    assert.equal(r.ok, true, source);
    if (r.ok) assert.equal(r.value.link.state, "candidate");
  }
});

test("LLM and statistics proposals may not claim deterministic proof or human review", () => {
  for (const source of ["llm", "statistics"] as const) {
    for (const method of ["native_hook", "slot_equal", "template", "human_review"] as const) {
      const c = identityCandidate("9");
      c.proof = { level: "P4_human", evidence: [{ method, detail: "claimed" }] };
      if (method === "native_hook") c.proof.level = "P0_native";
      if (method === "slot_equal") c.proof.level = "P1_slot_equal";
      if (method === "template") {
        c.proof.level = "P2_template";
        c.templateId = "T-X";
      }
      const r = proposeLink(emptyRegistry(), c, { source, id: "gen-x" }, { today: TODAY });
      assert.equal(r.ok, false, `${source}/${method}`);
    }
  }
});

test("llm proposals carry P3 or unproven; statistics carry unproven (record rule)", () => {
  const { link } = propose(emptyRegistry(), identityCandidate("11"));
  const asLlm = { ...link, proposedBy: { ...link.proposedBy, source: "llm" as const } };
  assert.ok(linkErrors(asLlm).some((e) => e.includes("llm proposals carry proof level")));
  const asStats = { ...link, proposedBy: { ...link.proposedBy, source: "statistics" as const } };
  assert.ok(linkErrors(asStats).some((e) => e.includes("statistics proposals carry")));
});

test("duplicate and conflicting proposals are refused", () => {
  const first = propose(emptyRegistry(), identityCandidate("0001"));
  const again = proposeLink(first.registry, identityCandidate("0001"), { source: "structural", id: "gen-structural" }, { today: TODAY });
  assert.equal(again.ok, false);
  // same markets and relation, different pins: a revision must suspend or revoke the old link first
  const revised = identityCandidate("0001");
  revised.legs[0] = { ...revised.legs[0]!, rulesSha256: "1".repeat(64) };
  revised.legs[1] = { ...revised.legs[1]!, rulesSha256: "1".repeat(64) };
  const conflict = proposeLink(first.registry, revised, { source: "structural", id: "gen-structural" }, { today: TODAY });
  assert.equal(conflict.ok, false);
  assert.ok(!conflict.ok && conflict.errors.some((e) => e.includes("conflicting candidate link")));
});

test("at most one identity partner per liquidity pool per market", () => {
  const first = propose(emptyRegistry(), identityCandidate("0001"));
  const other = identityCandidate("0001");
  // same XO market, a different Polymarket market
  other.legs[1] = leg("polymarket", "poly-other", { rulesSha256: other.legs[0]!.rulesSha256, maskedSha256: other.legs[0]!.maskedSha256 });
  const r = proposeLink(first.registry, other, { source: "structural", id: "gen-structural" }, { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("already has an identity partner")));
});

test("review prints a digest, requirements and hazards but changes nothing", () => {
  const { link, registry } = propose(emptyRegistry(), identityCandidate());
  const sheet = reviewSheet(link);
  assert.equal(sheet.digest, contentSha256(link));
  assert.equal(sheet.requiredApprovals, 1);
  assert.ok(sheet.checklist.length >= 4);
  assert.equal(findLink(registry, link.linkId)?.state, "candidate");
  const unproven = { ...link, proposedBy: { ...link.proposedBy, source: "statistics" as const }, proof: { level: "P_unproven" as const, evidence: [] } };
  assert.ok(reviewSheet(unproven).hazards.some((h) => h.includes("price statistic")));
});

test("approval requires every explicit input; each refusal leaves the registry untouched", () => {
  const { link, registry } = propose(emptyRegistry(), identityCandidate());
  const ok: HumanApproval = humanApproval(link);
  const refuse = (patch: Partial<HumanApproval>, needle: string): void => {
    const r = approveLink(registry, link.linkId, { ...ok, ...patch }, { today: TODAY });
    assert.equal(r.ok, false, needle);
    assert.ok(!r.ok && r.errors.some((e) => e.includes(needle)), `${needle} in ${!r.ok ? r.errors.join("|") : ""}`);
    assert.equal(findLink(registry, link.linkId)?.state, "candidate");
  };
  refuse({ acknowledgement: "yes" }, "acknowledgement");
  refuse({ acknowledgement: "" }, "acknowledgement");
  refuse({ digest: "0".repeat(64) }, "digest");
  refuse({ evidence: [] }, "written evidence");
  refuse({ evidence: ["   "] }, "written evidence");
  refuse({ reviewer: "llm-judge" }, "automation");
  refuse({ reviewer: "claude" }, "automation");
  refuse({ reviewer: "bad name!" }, "handle");
  refuse({ date: "2026-13-01" }, "real YYYY-MM-DD");
  refuse({ date: "2026-10-21" }, "in the future");
  refuse({ date: "2026-10-19" }, "before the proposal");
  refuse({ tierCap: "structural_violation" as const, evidence: ["x".repeat(301)] }, "at most 300");
  assert.equal(approveLink(registry, "lnk_" + "0".repeat(32), ok, { today: TODAY }).ok, false);
});

test("approval cannot raise the cap above the structural ceiling", () => {
  const first = propose(emptyRegistry(), ladderCandidate());
  const r = approveLink(first.registry, first.link.linkId, { ...humanApproval(first.link), tierCap: "hedged_discrepancy" }, { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("above the structural ceiling")));
});

test("approval can set a lower cap than the ceiling", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const r = approveLink(first.registry, first.link.linkId, { ...humanApproval(first.link), tierCap: "indicative_discrepancy" }, { today: TODAY });
  assert.equal(r.ok && r.value.link.tierCap, "indicative_discrepancy");
});

test("approval of the current record records reviewer, date, evidence and an event", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const reg = approve(first.registry, first.link.linkId, "reviewer-a");
  const link = findLink(reg, first.link.linkId)!;
  assert.equal(link.state, "approved");
  assert.equal(link.reviewer, "reviewer-a");
  assert.equal(link.reviewedAt, TODAY);
  assert.equal(link.tierCap, "hedged_discrepancy");
  assert.equal(link.approvals.length, 1);
  assert.equal(link.approvals[0]?.digest, contentSha256(link));
  assert.deepEqual(linkErrors(link), []);
  assert.equal(reg.events.at(-1)?.action, "approve");
  assert.equal(parseRegistry(JSON.parse(JSON.stringify(reg))).ok, true);
});

test("a stale digest is refused once the record changed", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const stale = humanApproval(first.link);
  const edited = { ...first.registry, links: [{ ...first.link, basis: { ...first.link.basis, cutoffDeltaMinutes: 0 }, validUntil: "2026-12-30T00:00:00Z" }] };
  const r = approveLink(edited, first.link.linkId, stale, { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("digest")));
});

test("an unknown cutoff delta must be computed before approval", () => {
  const c = identityCandidate();
  c.basis = { ...c.basis, cutoffDeltaMinutes: null };
  const first = propose(emptyRegistry(), c);
  const r = approveLink(first.registry, first.link.linkId, humanApproval(first.link), { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("cutoffDeltaMinutes")));
});

test("an expired link cannot be approved", () => {
  const c = identityCandidate();
  c.validUntil = "2026-10-20T01:00:00Z";
  c.legs = c.legs.map((l) => ({ ...l, closeUtc: "2026-10-20T01:00:00Z" })) as typeof c.legs;
  const first = propose(emptyRegistry(), c);
  const r = approveLink(first.registry, first.link.linkId, { ...humanApproval(first.link), date: "2026-10-20" }, { today: "2026-10-21" });
  assert.equal(r.ok, false);
});

test("two-key partition: first approval stays a candidate, the same person cannot be the second key", () => {
  const c = identityCandidate("0300");
  c.relation = "partition";
  c.exhaustiveness = "E2_by_rule_clause";
  const first = propose(emptyRegistry(), c);
  const a1 = approveLink(first.registry, first.link.linkId, humanApproval(first.link, "reviewer-a"), { today: TODAY });
  assert.ok(a1.ok);
  if (!a1.ok) return;
  assert.equal(a1.value.finalised, false);
  assert.equal(a1.value.link.state, "candidate");
  assert.equal(a1.value.registry.events.at(-1)?.action, "approve_partial");
  const same = approveLink(a1.value.registry, first.link.linkId, humanApproval(a1.value.link, "reviewer-a"), { today: TODAY });
  assert.equal(same.ok, false);
  const second = approveLink(a1.value.registry, first.link.linkId, humanApproval(a1.value.link, "reviewer-b"), { today: TODAY });
  assert.ok(second.ok);
  if (!second.ok) return;
  assert.equal(second.value.finalised, true);
  assert.equal(second.value.link.state, "approved");
  assert.deepEqual(second.value.link.approvals.map((a) => a.reviewer), ["reviewer-a", "reviewer-b"]);
  assert.deepEqual(linkErrors(second.value.link), []);
});

test("a revoked link can never be approved or reinstated", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const rev = revokeLink(first.registry, first.link.linkId, "reviewer-a", "synthetic: wrong question", { today: TODAY });
  assert.ok(rev.ok);
  if (!rev.ok) return;
  const link = findLink(rev.value, first.link.linkId)!;
  assert.equal(link.state, "revoked");
  const r = approveLink(rev.value, link.linkId, humanApproval(link), { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("only candidate or suspended")));
});

test("suspend, then reinstate needs a fresh full human approval", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const approved = approve(first.registry, first.link.linkId);
  const sus = suspendLink(approved, first.link.linkId, "pin-checker", "rules hash changed", { today: TODAY });
  assert.ok(sus.ok);
  if (!sus.ok) return;
  const suspended = findLink(sus.value, first.link.linkId)!;
  assert.equal(suspended.state, "suspended");
  assert.deepEqual(suspended.approvals, []);
  assert.equal(suspended.stateReason, "rules hash changed");
  assert.deepEqual(linkErrors(suspended), []);
  const back = approveLink(sus.value, suspended.linkId, humanApproval(suspended, "reviewer-b"), { today: TODAY });
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.value.link.state, "approved");
  assert.equal(back.value.link.stateReason, undefined);
  assert.equal(back.value.registry.events.at(-1)?.action, "reinstate");
});

test("only approved links can be suspended", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  assert.equal(suspendLink(first.registry, first.link.linkId, "someone", "why", { today: TODAY }).ok, false);
});

test("vetoes (LLM or statistics) demote and never promote", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const vetoCandidate = vetoLink(first.registry, first.link.linkId, { source: "llm", id: "gen-llm" }, "entity swap suspected", { today: TODAY });
  assert.ok(vetoCandidate.ok);
  if (vetoCandidate.ok) assert.equal(findLink(vetoCandidate.value, first.link.linkId)?.state, "revoked");

  const approved = approve(first.registry, first.link.linkId);
  const vetoApproved = vetoLink(approved, first.link.linkId, { source: "statistics", id: "gen-stats" }, "gap 900 bps", { today: TODAY });
  assert.ok(vetoApproved.ok);
  if (vetoApproved.ok) {
    const l = findLink(vetoApproved.value, first.link.linkId)!;
    assert.equal(l.state, "suspended");
    assert.match(l.stateReason ?? "", /^veto\(statistics\)/);
  }
  // a veto cannot be used to move a link towards approved: there is no such transition
  const again = vetoLink(vetoCandidate.ok ? vetoCandidate.value : approved, first.link.linkId, { source: "llm", id: "gen-llm" }, "again", { today: TODAY });
  assert.equal(again.ok, false);
});

test("revocation is a human decision", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const r = revokeLink(first.registry, first.link.linkId, "llm-judge", "nope", { today: TODAY });
  assert.equal(r.ok, false);
  assert.equal(revokeLink(first.registry, first.link.linkId, "reviewer-a", "", { today: TODAY }).ok, false);
});

test("a hand-edited registry that smuggles in an approval fails to load", () => {
  const first = propose(emptyRegistry(), identityCandidate());
  const forged = JSON.parse(JSON.stringify(first.registry)) as { links: Record<string, unknown>[] };
  forged.links[0] = { ...forged.links[0], state: "approved", tierCap: "hedged_discrepancy" };
  assert.equal(parseRegistry(forged).ok, false);
  const withFakeApproval = JSON.parse(JSON.stringify(first.registry)) as { links: Record<string, unknown>[] };
  withFakeApproval.links[0] = {
    ...withFakeApproval.links[0],
    state: "approved",
    tierCap: "hedged_discrepancy",
    reviewer: "llm-judge",
    reviewedAt: TODAY,
    approvals: [{ reviewer: "llm-judge", date: TODAY, evidence: ["looks fine"], digest: contentSha256(first.link) }],
  };
  const r = parseRegistry(withFakeApproval);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("looks like automation")));
  const wrongDigest = JSON.parse(JSON.stringify(withFakeApproval)) as { links: { approvals: { reviewer: string; digest: string }[]; reviewer: string }[] };
  wrongDigest.links[0]!.approvals[0] = { ...wrongDigest.links[0]!.approvals[0]!, reviewer: "reviewer-a", digest: "0".repeat(64) };
  wrongDigest.links[0]!.reviewer = "reviewer-a";
  const r2 = parseRegistry(wrongDigest);
  assert.equal(r2.ok, false);
  assert.ok(!r2.ok && r2.errors.some((e) => e.includes("digest does not match")));
});

test("the acknowledgement sentence is a fixed constant", () => {
  assert.match(APPROVAL_ACK, /rules text of every leg/);
});

test("LS-2: a proposer cannot approve its own proposal, in the approval path or on load", () => {
  const { link, registry } = propose(emptyRegistry(), identityCandidate("self"), "manual");
  assert.equal(link.proposedBy.id, "gen-manual");
  const r = approveLink(registry, link.linkId, humanApproval(link, "gen-manual"), { today: TODAY });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("proposer")), JSON.stringify(!r.ok && r.errors));
  // The same record, hand-edited into an approved state, is refused by the record rules too.
  const forged = {
    ...link,
    state: "approved" as const,
    reviewer: "gen-manual",
    reviewedAt: TODAY,
    approvals: [{ reviewer: "gen-manual", date: TODAY, evidence: ["forged"], digest: contentSha256(link) }],
  };
  assert.ok(linkErrors(forged).some((e) => e.includes("proposer")), linkErrors(forged).join("; "));
  // A different reviewer is fine.
  assert.equal(approveLink(registry, link.linkId, humanApproval(link, "reviewer-a"), { today: TODAY }).ok, true);
});

test("LS-2: model-style reviewer handles cannot approve", () => {
  const { link, registry } = propose(emptyRegistry(), identityCandidate("llmrev"), "structural");
  for (const who of ["opus", "sonnet", "haiku", "assistant", "codex", "gemini", "c1aude", "ai-reviewer"]) {
    const r = approveLink(registry, link.linkId, humanApproval(link, who), { today: TODAY });
    assert.equal(r.ok, false, who);
  }
});

test("TM-03: two approvals from one reviewer are refused on load, not only in the approval path", () => {
  const { link } = propose(emptyRegistry(), identityCandidate("dup"), "manual");
  const approval = { reviewer: "reviewer-a", date: TODAY, evidence: ["e"], digest: contentSha256(link) };
  const forged = { ...link, approvals: [approval, { ...approval }] };
  assert.ok(linkErrors(forged).some((e) => e.includes("distinct reviewers")), linkErrors(forged).join("; "));
});

test("TM-06: an LLM or statistics proposal may not carry any evidence method that is not its own", () => {
  const llmOnly = { method: "llm_quoted" as const, detail: "synthetic quote" };
  for (const source of ["llm", "statistics"] as const) {
    const own = source === "llm" ? llmOnly : { method: "statistics_hint" as const, detail: "synthetic rho" };
    for (const method of ["native_hook", "slot_equal", "template", "human_review"] as const) {
      const c = identityCandidate(`mix-${source}-${method}`);
      c.proof = { level: source === "llm" ? "P3_llm_assisted" : "P_unproven", evidence: [own, { method, detail: "mixed in" }] };
      const r = proposeLink(emptyRegistry(), c, { source, id: "gen-x" }, { today: TODAY });
      assert.equal(r.ok, false, `${source}/${method}`);
      assert.ok(!r.ok && r.errors.some((e) => e.includes(`may not claim ${method} evidence`)), `${source}/${method}: ${JSON.stringify(!r.ok && r.errors)}`);
    }
  }
});
