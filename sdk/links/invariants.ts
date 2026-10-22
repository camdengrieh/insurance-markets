// Cross-field rules that a field-by-field schema cannot express. Used by `propose`, by the
// approval path and by the bundle validator, so a hand-edited file gets the same scrutiny as a
// CLI-built one. Every function returns a list of human-readable errors; empty means valid.
// `terms` says which venues are restricted (schema.ts PersistenceTerms); the host injects it.

import {
  SYNTHETIC_PREFIX,
  computeLinkId,
  contentSha256,
  isRestrictedVenue,
  type AxisInstance,
  type CandidateInput,
  type Evidence,
  type Link,
  type PersistenceTerms,
} from "./schema.js";
import { requiredApprovals, structuralCeiling, tierRank } from "./tier.js";

// Reviewer handles that look like automation are refused. This is a heuristic guard against an
// accidental automated "approval" and cannot authenticate anyone: the real controls are that
// approval is a separate explicit command with a content digest, a per-link typed confirmation on
// an interactive terminal (pm/links/cli.ts), a reviewer who is not the proposer, and git review of the
// shipped bundle (pm/links/shipped-data.ts).
//
// Matching is by whole token (split on . _ -) after folding common leetspeak, so "c1aude" and
// "ai-reviewer" are caught while real names that merely start with the same letters are not.
const AUTOMATION_TOKENS = new Set([
  "ai", "bot", "ci", "llm", "gpt", "agent", "model", "stat", "stats", "script", "scripts", "system", "cron", "opus", "unknown", "anonymous", "noreply", "assistant",
]);
// Long, distinctive names: a handle that starts with one of these is automation.
const AUTOMATION_PREFIXES = ["auto", "claude", "gemini", "chatgpt", "codex", "copilot", "sonnet", "haiku", "anthropic", "openai", "assistant", "noreply", "anonymous"];
const LEET: Readonly<Record<string, string>> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", $: "s", "@": "a" };

export function isAutomationHandle(handleText: string): boolean {
  const folded = handleText.toLowerCase().replace(/[013457$@]/g, (c) => LEET[c] ?? c);
  const plain = handleText.toLowerCase();
  for (const form of [plain, folded]) {
    if (AUTOMATION_PREFIXES.some((p) => form.startsWith(p))) return true;
    for (const token of form.split(/[._-]+/)) {
      const word = token.replace(/\d+$/, "");
      if (AUTOMATION_TOKENS.has(word)) return true;
    }
  }
  return false;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function isPermutation(map: readonly number[], n: number): boolean {
  return map.length === n && sameNumbers([...map].sort((x, y) => x - y), range(n));
}

// Allowed shape of any value that sits next to a restricted-venue leg: a short identifier, not prose.
const CODE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_:.+/-]{0,39}$/;

const WINDOW_AXES = new Set(["timing_cutoff", "window_start", "early_close"]);
const SOURCE_AXES = new Set(["measure_source", "oracle", "reference_index"]);

type Shape = Pick<
  CandidateInput,
  "relation" | "ladder" | "exhaustiveness" | "legs" | "basis" | "proof" | "templateId" | "validUntil" | "synthetic"
>;

export function contentErrors(link: Shape, terms: PersistenceTerms): string[] {
  const errors: string[] = [];
  const legs = link.legs;

  // Relation shape
  if (link.relation === "ladder") {
    if (link.ladder === undefined) errors.push("ladder relation needs a ladder object");
  } else if (link.ladder !== undefined) errors.push("ladder object is only allowed on ladder relations");
  if (link.relation === "partition") {
    if (link.exhaustiveness === undefined) errors.push("partition relation needs an exhaustiveness level");
  } else if (link.exhaustiveness !== undefined) {
    errors.push("exhaustiveness is only allowed on partition relations");
  }
  if ((link.relation === "identity" || link.relation === "near_identity" || link.relation === "complement") && legs.length !== 2) {
    errors.push(`${link.relation} links have exactly two legs`);
  }

  // Legs
  const seen = new Set<string>();
  legs.forEach((leg, i) => {
    const key = `${leg.venue}:${leg.marketId}`;
    if (seen.has(key)) errors.push(`legs[${i}] repeats market ${key}`);
    seen.add(key);
    if (leg.venue !== "xo" && leg.creatorAllowlisted !== null) {
      errors.push(`legs[${i}].creatorAllowlisted applies to xo legs only`);
    }
    if (new Set(leg.outcomeMap).size !== leg.outcomeMap.length) errors.push(`legs[${i}].outcomeMap repeats an index`);
    const synthetic = leg.marketId.startsWith(SYNTHETIC_PREFIX);
    if (link.synthetic && !synthetic) errors.push(`legs[${i}] of a synthetic link must use a ${SYNTHETIC_PREFIX} market id`);
    if (!link.synthetic && synthetic) errors.push(`legs[${i}] uses a ${SYNTHETIC_PREFIX} market id on a non-synthetic link`);
  });
  const first = legs[0];
  if (first !== undefined && !sameNumbers(first.outcomeMap, range(first.outcomeMap.length))) {
    errors.push("legs[0].outcomeMap must be the identity map");
  }
  if (first !== undefined && (link.relation === "identity" || link.relation === "near_identity")) {
    legs.forEach((leg, i) => {
      if (!isPermutation(leg.outcomeMap, first.outcomeMap.length)) {
        errors.push(`legs[${i}].outcomeMap must be a permutation of legs[0]'s outcomes`);
      }
    });
  }
  if (link.relation === "complement") {
    const second = legs[1];
    if (first !== undefined && second !== undefined) {
      if (first.outcomeMap.length !== 2 || !sameNumbers(second.outcomeMap, [1, 0])) {
        errors.push("complement links need binary legs with legs[1].outcomeMap = [1,0]");
      }
    }
  }

  // validUntil never beyond the earliest close
  const earliest = legs.map((l) => l.closeUtc).sort()[0];
  if (earliest !== undefined && link.validUntil > earliest) {
    errors.push("validUntil must not be later than the earliest leg close");
  }

  // Basis
  const { basis } = link;
  // The declared gap may exceed what the pinned closes show (a rule-level cutoff such as UTC versus
  // ET is not in closeUtc) but never understate it.
  if (legs.length === 2 && basis.cutoffDeltaMinutes !== null) {
    const t0 = Date.parse(legs[0]?.closeUtc ?? "");
    const t1 = Date.parse(legs[1]?.closeUtc ?? "");
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      const shown = Math.ceil(Math.abs(t0 - t1) / 60_000);
      if (basis.cutoffDeltaMinutes < shown) {
        errors.push(`basis.cutoffDeltaMinutes (${basis.cutoffDeltaMinutes}) understates the ${shown} minutes between the pinned closes`);
      }
    }
  }
  if (basis.class === "identical" && new Set(legs.map((l) => l.voidPolicy)).size > 1) {
    errors.push("basis class identical needs the same void policy on every leg (otherwise name a void_policy difference and use a non-identical class)");
  }
  const axisNames = new Set(basis.axes.map((a) => a.axis));
  if (link.relation === "identity" && (basis.class !== "identical" || basis.axes.length > 0)) {
    errors.push("identity links are class identical with no divergence axes (use near_identity otherwise)");
  }
  if (link.relation === "near_identity" && basis.class === "identical") {
    errors.push("near_identity links must name a non-identical basis class");
  }
  if (basis.class === "identical") {
    if (basis.axes.length > 0) errors.push("basis class identical cannot carry divergence axes");
    if (basis.cutoffDeltaMinutes !== null && basis.cutoffDeltaMinutes !== 0) {
      errors.push("basis class identical needs cutoffDeltaMinutes 0 or null");
    }
  }
  if (basis.class === "settlement_window" && ![...axisNames].some((a) => WINDOW_AXES.has(a))) {
    errors.push("basis class settlement_window needs a timing_cutoff, window_start or early_close axis");
  }
  if (basis.class === "settlement_source" && ![...axisNames].some((a) => SOURCE_AXES.has(a))) {
    errors.push("basis class settlement_source needs a measure_source, oracle or reference_index axis");
  }
  if (axisNames.has("timing_cutoff") && basis.cutoffDeltaMinutes === 0) {
    errors.push("a timing_cutoff axis contradicts cutoffDeltaMinutes 0");
  }
  basis.axes.forEach((axis: AxisInstance, i) => {
    const a = legs[axis.legA];
    const b = legs[axis.legB];
    // Free text about a restricted venue's leg could carry its rules; only short codes may.
    if (a !== undefined && isRestrictedVenue(a.venue, terms) && !CODE_VALUE.test(axis.a)) {
      errors.push(`basis.axes[${i}].a must be a short code without spaces because leg ${axis.legA} is on restricted venue ${a.venue}`);
    }
    if (b !== undefined && isRestrictedVenue(b.venue, terms) && !CODE_VALUE.test(axis.b)) {
      errors.push(`basis.axes[${i}].b must be a short code without spaces because leg ${axis.legB} is on restricted venue ${b.venue}`);
    }
    if (a === undefined || b === undefined) errors.push(`basis.axes[${i}] names a leg that does not exist`);
    if (axis.legA === axis.legB) errors.push(`basis.axes[${i}] compares a leg with itself`);
    if (axis.quoteA !== undefined && a !== undefined && isRestrictedVenue(a.venue, terms)) {
      errors.push(`basis.axes[${i}].quoteA is not allowed for restricted venue ${a.venue}`);
    }
    if (axis.quoteB !== undefined && b !== undefined && isRestrictedVenue(b.venue, terms)) {
      errors.push(`basis.axes[${i}].quoteB is not allowed for restricted venue ${b.venue}`);
    }
  });

  // Proof and evidence
  const methods = new Set(link.proof.evidence.map((e: Evidence) => e.method));
  const need = (method: Evidence["method"], level: string): void => {
    if (!methods.has(method)) errors.push(`proof level ${level} needs ${method} evidence`);
  };
  switch (link.proof.level) {
    case "P0_native":
      need("native_hook", "P0_native");
      break;
    case "P1_slot_equal":
      need("slot_equal", "P1_slot_equal");
      break;
    case "P2_template":
      need("template", "P2_template");
      if (link.templateId === undefined) errors.push("proof level P2_template needs templateId");
      break;
    case "P3_llm_assisted":
      need("llm_quoted", "P3_llm_assisted");
      break;
    case "P4_human":
      need("human_review", "P4_human");
      break;
    case "P_unproven":
      for (const m of methods) {
        if (m !== "statistics_hint") errors.push(`proof level P_unproven allows statistics_hint evidence only, found ${m}`);
      }
      break;
  }
  const anyRestricted = legs.some((l) => isRestrictedVenue(l.venue, terms));
  link.proof.evidence.forEach((e, i) => {
    if (anyRestricted && !CODE_VALUE.test(e.detail)) {
      errors.push(`proof.evidence[${i}].detail must be a short code without spaces because the link has a leg on a restricted venue`);
    }
    if (e.legIndex !== undefined && legs[e.legIndex] === undefined) errors.push(`proof.evidence[${i}] names a leg that does not exist`);
    if (e.quote !== undefined) {
      if (e.legIndex === undefined) errors.push(`proof.evidence[${i}] has a quote without legIndex`);
      const leg = e.legIndex === undefined ? undefined : legs[e.legIndex];
      if (leg !== undefined && isRestrictedVenue(leg.venue, terms)) {
        errors.push(`proof.evidence[${i}] quotes restricted venue ${leg.venue}`);
      }
    }
  });
  return errors;
}

export function candidateErrors(candidate: Shape, terms: PersistenceTerms): string[] {
  return contentErrors(candidate, terms);
}

export function linkErrors(link: Link, terms: PersistenceTerms): string[] {
  const errors = contentErrors(link, terms);

  if (link.linkId !== computeLinkId(link)) errors.push("linkId does not match the record's pins");

  // Who may propose what
  if (link.proposedBy.source === "llm" && link.proof.level !== "P3_llm_assisted" && link.proof.level !== "P_unproven") {
    errors.push("llm proposals carry proof level P3_llm_assisted or P_unproven");
  }
  if (link.proposedBy.source === "statistics" && link.proof.level !== "P_unproven") {
    errors.push("statistics proposals carry proof level P_unproven");
  }

  // Review state
  const required = requiredApprovals(link);
  const digest = contentSha256(link);
  link.approvals.forEach((a, i) => {
    if (a.digest !== digest) errors.push(`approvals[${i}] digest does not match the record content`);
    if (isAutomationHandle(a.reviewer)) errors.push(`approvals[${i}] reviewer "${a.reviewer}" looks like automation`);
    if (a.reviewer === link.proposedBy.id) errors.push(`approvals[${i}] reviewer is the proposer; a proposal needs a different reviewer`);
    if (a.date < link.proposedBy.at) errors.push(`approvals[${i}] is dated before the proposal`);
  });
  if (new Set(link.approvals.map((a) => a.reviewer)).size !== link.approvals.length) {
    errors.push("approvals must come from distinct reviewers");
  }

  const ceiling = structuralCeiling(link);
  switch (link.state) {
    case "approved": {
      if (link.approvals.length < required) errors.push(`approved links need ${required} approval(s), found ${link.approvals.length}`);
      const last = link.approvals[link.approvals.length - 1];
      if (last === undefined) break;
      if (link.reviewer !== last.reviewer) errors.push("reviewer must equal the last approval's reviewer");
      if (link.reviewedAt !== last.date) errors.push("reviewedAt must equal the last approval's date");
      if (link.basis.cutoffDeltaMinutes === null) errors.push("approved links need a computed cutoffDeltaMinutes");
      if (tierRank(link.tierCap) > tierRank(ceiling.cap)) {
        errors.push(`tierCap ${link.tierCap} is above the structural ceiling ${ceiling.cap}`);
      }
      if (last.date > link.validUntil.slice(0, 10)) errors.push("approval is dated after validUntil");
      if (link.stateReason !== undefined || link.stateChangedBy !== undefined || link.stateChangedAt !== undefined) {
        errors.push("approved links carry no state-change fields");
      }
      break;
    }
    case "candidate":
      if (link.tierCap !== "indicative_discrepancy") errors.push("candidates are capped at indicative_discrepancy");
      if (link.approvals.length >= required) errors.push("a candidate cannot hold all required approvals");
      if (link.reviewer !== undefined || link.reviewedAt !== undefined) errors.push("candidates carry no reviewer or reviewedAt");
      if (link.stateReason !== undefined || link.stateChangedBy !== undefined || link.stateChangedAt !== undefined) {
        errors.push("candidates carry no state-change fields");
      }
      break;
    case "suspended":
    case "revoked":
      if (link.stateReason === undefined || link.stateChangedBy === undefined || link.stateChangedAt === undefined) {
        errors.push(`${link.state} links need stateReason, stateChangedBy and stateChangedAt`);
      }
      if (link.tierCap !== "indicative_discrepancy" && link.state === "revoked") {
        errors.push("revoked links are capped at indicative_discrepancy");
      }
      break;
  }
  return errors;
}
