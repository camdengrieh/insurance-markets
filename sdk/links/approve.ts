// The ONLY module that can put a link into state "approved".
//
// Approval is an explicit human act. It needs, all at once:
//   - a reviewer handle that does not look like automation and is not the proposer,
//   - a real calendar date (not in the future, not before the proposal),
//   - written evidence from the reviewer,
//   - the content digest printed by `review` (so the reviewer approves the exact record shown),
//   - the fixed acknowledgement sentence.
// No code path in sdk/links or pm/links calls approveLink without those inputs, and nothing outside
// the pm CLI (pm/links/cli.ts) builds them: LLM and statistics code can add candidates
// (store.proposeLink) and veto, nothing more. pm/test/links/no-auto-promotion.test.ts enforces
// this by reading the sources.

import {
  contentSha256,
  dateOnly,
  handle,
  linkSchema,
  type Approval,
  type Link,
  type PersistenceTerms,
  type Tier,
} from "./schema.js";
import { isAutomationHandle, linkErrors } from "./invariants.js";
import { findLink, replaceLink, type Outcome, type Registry } from "./store.js";
import { requiredApprovals, structuralCeiling, tierRank, type TierCapResult } from "./tier.js";

export const APPROVAL_ACK =
  "I read the current rules text of every leg on its own venue and confirm the recorded relation, outcome map and axes";

export interface HumanApproval {
  readonly reviewer: string;
  readonly date: string;
  readonly evidence: readonly string[];
  readonly digest: string;
  readonly acknowledgement: string;
  // Optional lower ceiling. Never above the structural ceiling.
  readonly tierCap?: Tier;
}

export interface ReviewSheet {
  readonly linkId: string;
  readonly state: Link["state"];
  readonly digest: string;
  readonly requiredApprovals: 1 | 2;
  readonly approvalsSoFar: readonly string[];
  readonly ceiling: TierCapResult;
  // Things the reviewer must check against the live rule texts. Fixed list, not market text.
  readonly checklist: readonly string[];
  readonly hazards: readonly string[];
}

export function reviewSheet(link: Link): ReviewSheet {
  const hazards: string[] = [];
  if (link.proposedBy.source === "llm") hazards.push("proposed by an LLM: its verdict is a hint, not evidence");
  if (link.proposedBy.source === "statistics") hazards.push("proposed by a price statistic: co-movement is not identity");
  if (link.proof.level === "P_unproven" || link.proof.level === "P3_llm_assisted") {
    hazards.push("no deterministic proof: your review is the proof");
  }
  if (link.legs.some((l) => l.venue === "xo" && l.creatorAllowlisted !== true)) {
    hazards.push("an XO leg is not on the creator allowlist: anyone can copy another venue's text");
  }
  if (link.legs.some((l) => l.voidPolicy === "unknown")) hazards.push("a leg has an unknown void policy");
  if (link.state === "suspended") hazards.push("this link was suspended: confirm the reason no longer applies");
  return {
    linkId: link.linkId,
    state: link.state,
    digest: contentSha256(link),
    requiredApprovals: requiredApprovals(link),
    approvalsSoFar: link.approvals.map((a) => a.reviewer),
    ceiling: structuralCeiling(link),
    checklist: [
      "open both markets on their own venues and read the full current rules",
      "same underlying question, same resolution trigger and source",
      "outcome map matches the venues' own outcome order (never the display order)",
      "every cutoff, window, void, tie-break and exception difference is listed as an axis",
      "close times and resolver match the pins",
    ],
    hazards,
  };
}

export function approveLink(
  reg: Registry,
  linkId: string,
  human: HumanApproval,
  ctx: { today: string },
  terms: PersistenceTerms,
): Outcome<{ registry: Registry; link: Link; finalised: boolean }> {
  const errors: string[] = [];
  const link = findLink(reg, linkId);
  if (link === undefined) return { ok: false, errors: [`no link ${linkId}`] };

  if (link.state !== "candidate" && link.state !== "suspended") {
    errors.push(`only candidate or suspended links can be approved (state is ${link.state})`);
  }
  if (!handle.safeParse(human.reviewer).success) errors.push("reviewer must be a handle (2-40 chars of A-Za-z0-9._-)");
  else if (isAutomationHandle(human.reviewer)) errors.push(`reviewer "${human.reviewer}" looks like automation; approval is a human decision`);
  else if (human.reviewer === link.proposedBy.id) errors.push("the reviewer is the proposer; a proposal needs a different reviewer");
  if (!dateOnly.safeParse(human.date).success) errors.push("approval date must be a real YYYY-MM-DD date");
  else {
    if (!dateOnly.safeParse(ctx.today).success) errors.push("today must be YYYY-MM-DD");
    if (human.date > ctx.today) errors.push("approval date is in the future");
    if (human.date < link.proposedBy.at) errors.push("approval date is before the proposal");
    if (human.date > link.validUntil.slice(0, 10) || link.validUntil.slice(0, 10) < ctx.today) {
      errors.push("link has already expired (validUntil)");
    }
  }
  const evidence = human.evidence.map((e) => e.trim()).filter((e) => e !== "");
  if (evidence.length === 0) errors.push("approval needs written evidence");
  if (evidence.some((e) => e.length > 300)) errors.push("each evidence entry is at most 300 characters");
  if (human.acknowledgement !== APPROVAL_ACK) errors.push("acknowledgement sentence does not match");
  if (human.digest !== contentSha256(link)) errors.push("digest does not match the current record; run review again");

  const ceiling = structuralCeiling(link);
  const cap: Tier = human.tierCap ?? ceiling.cap;
  if (tierRank(cap) > tierRank(ceiling.cap)) errors.push(`tier cap ${cap} is above the structural ceiling ${ceiling.cap}`);
  if (link.basis.cutoffDeltaMinutes === null) errors.push("cutoffDeltaMinutes must be computed before approval");

  // Suspension and revocation clear `approvals`, so a reinstatement always starts a fresh review.
  const prior = link.approvals;
  if (prior.some((a) => a.reviewer === human.reviewer)) errors.push("this reviewer already approved the link; a second key must be a different person");
  if (errors.length > 0) return { ok: false, errors };

  const approval: Approval = { reviewer: human.reviewer, date: human.date, evidence, digest: human.digest };
  const approvals = [...prior, approval];
  const finalised = approvals.length >= requiredApprovals(link);

  let next: Link;
  if (finalised) {
    const { stateReason: _r, stateChangedBy: _b, stateChangedAt: _a, ...rest } = link;
    next = {
      ...rest,
      state: "approved",
      tierCap: cap,
      approvals,
      reviewer: human.reviewer,
      reviewedAt: human.date,
    };
  } else {
    next = { ...link, approvals };
  }

  // Belt and braces: the result must satisfy every record rule and the schema.
  const problems = [...linkErrors(next, terms)];
  const reparsed = linkSchema.safeParse(next);
  if (!reparsed.success) problems.push(...reparsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  if (problems.length > 0) return { ok: false, errors: problems };

  const action = finalised ? (link.state === "suspended" ? "reinstate" : "approve") : "approve_partial";
  const registry = replaceLink(reg, next, {
    at: human.date,
    actor: human.reviewer,
    action,
    linkId,
    note: evidence[0] as string,
  });
  return { ok: true, value: { registry, link: next, finalised } };
}
