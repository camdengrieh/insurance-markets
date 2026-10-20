// SYNTHETIC fixtures for the pm/links tests. Every market id starts with SYNTHETIC-, every hash is
// the SHA-256 of an invented label, and nothing here is real market data or a real link.

import assert from "node:assert/strict";
import { sha256Hex } from "../../links/canonical.js";
import { APPROVAL_ACK, approveLink } from "../../links/approve.js";
import {
  contentSha256,
  type CandidateInput,
  type Link,
  type LinkLeg,
} from "../../links/schema.js";
import { emptyRegistry, findLink, proposeLink, type Registry } from "../../links/store.js";

export const TODAY = "2026-10-20";
export const NOW = new Date("2026-10-20T12:00:00Z");
export const CLOSE = "2026-12-31T23:59:00Z";

export function synthSha(label: string): string {
  return sha256Hex(`SYNTHETIC:${label}`);
}

export function leg(venue: LinkLeg["venue"], id: string, overrides: Partial<LinkLeg> = {}): LinkLeg {
  return {
    venue,
    marketId: `SYNTHETIC-${id}`,
    outcomeMap: [0, 1],
    rulesSha256: synthSha(`rules:${id}`),
    maskedSha256: synthSha(`mask:${id}`),
    closeUtc: CLOSE,
    voidPolicy: "refund",
    resolverId: null,
    creatorAllowlisted: venue === "xo" ? true : null,
    groupKey: null,
    ...overrides,
  };
}

// Cross-venue identity with matching rules, the best case the schema allows.
export function identityCandidate(id = "0001", overrides: Partial<CandidateInput> = {}): CandidateInput {
  const a = leg("xo", `xo-${id}`);
  const b = leg("polymarket", `poly-${id}`, { rulesSha256: a.rulesSha256, maskedSha256: a.maskedSha256 });
  return {
    relation: "identity",
    legs: [a, b],
    basis: { class: "identical", axes: [], cutoffDeltaMinutes: 0 },
    proof: { level: "P1_slot_equal", evidence: [{ method: "slot_equal", detail: "synthetic_equal_slots_k2" }] },
    validUntil: CLOSE,
    synthetic: true,
    ...overrides,
  };
}

// Same question, cutoffs five hours apart (the UTC versus ET offset of the research notes).
export function nearIdentityCandidate(id = "0002"): CandidateInput {
  const a = leg("xo", `xo-${id}`);
  const b = leg("polymarket", `poly-${id}`, { closeUtc: "2026-12-31T23:59:00Z" });
  return {
    relation: "near_identity",
    legs: [a, b],
    basis: {
      class: "settlement_window",
      axes: [
        {
          axis: "timing_cutoff",
          legA: 0,
          legB: 1,
          a: "23:59 UTC",
          b: "23:59 ET",
          severity: "minor",
          quoteA: "synthetic quote A",
          quoteB: "synthetic quote B",
        },
      ],
      cutoffDeltaMinutes: 300,
    },
    proof: {
      level: "P2_template",
      evidence: [{ method: "template", detail: "synthetic template T-SYN" }],
    },
    templateId: "T-SYN",
    validUntil: CLOSE,
    synthetic: true,
  };
}

export function ladderCandidate(id = "0010"): CandidateInput {
  return {
    relation: "ladder",
    ladder: { axis: "threshold", monotonicity: "decreasing" },
    legs: [leg("xo", `xo-${id}-k1`), leg("xo", `xo-${id}-k2`)],
    basis: { class: "identical", axes: [], cutoffDeltaMinutes: 0 },
    proof: { level: "P2_template", evidence: [{ method: "template", detail: "synthetic touch ladder" }] },
    templateId: "T-TOUCH",
    validUntil: CLOSE,
    synthetic: true,
  };
}

export function complementCandidate(id = "0020"): CandidateInput {
  return {
    relation: "complement",
    legs: [leg("xo", `xo-${id}-a`), leg("xo", `xo-${id}-b`, { outcomeMap: [1, 0] })],
    basis: { class: "identical", axes: [], cutoffDeltaMinutes: 0 },
    proof: { level: "P1_slot_equal", evidence: [{ method: "slot_equal", detail: "synthetic inverse orientation" }] },
    validUntil: CLOSE,
    synthetic: true,
  };
}

export function propose(reg: Registry, input: CandidateInput, source: "structural" | "manual" | "llm" | "statistics" | "native_hook" = "structural"): { registry: Registry; link: Link } {
  const r = proposeLink(reg, input, { source, id: `gen-${source}` }, { today: TODAY });
  assert.equal(r.ok, true, r.ok ? "" : r.errors.join("; "));
  if (!r.ok) throw new Error("unreachable");
  return r.value;
}

export function humanApproval(link: Link, reviewer = "reviewer-a", date = TODAY) {
  return {
    reviewer,
    date,
    evidence: ["synthetic: read both rule texts"],
    digest: contentSha256(link),
    acknowledgement: APPROVAL_ACK,
  };
}

export function approve(reg: Registry, linkId: string, reviewer = "reviewer-a"): Registry {
  const link = findLink(reg, linkId);
  assert.ok(link, "link exists");
  const r = approveLink(reg, linkId, humanApproval(link, reviewer), { today: TODAY });
  assert.equal(r.ok, true, r.ok ? "" : r.errors.join("; "));
  if (!r.ok) throw new Error("unreachable");
  return r.value.registry;
}

// A registry with one approved identity link, one approved ladder, one candidate.
export function sampleRegistry(): { registry: Registry; approvedId: string; ladderId: string; candidateId: string } {
  let reg = emptyRegistry();
  const a = propose(reg, identityCandidate("0001"));
  reg = a.registry;
  const l = propose(reg, ladderCandidate("0010"));
  reg = l.registry;
  const c = propose(reg, nearIdentityCandidate("0002"));
  reg = c.registry;
  reg = approve(reg, a.link.linkId);
  reg = approve(reg, l.link.linkId);
  return { registry: reg, approvedId: a.link.linkId, ladderId: l.link.linkId, candidateId: c.link.linkId };
}
