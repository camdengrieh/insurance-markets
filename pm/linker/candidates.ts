// From candidate inputs into the working registry through store.proposeLink (state "candidate",
// never anything else). The candidate inputs come from the SDK's pure scoring
// (sdk/linker/candidates.ts). Stale candidates of the linker's own are vetoed here; a human-approved
// link whose pinned leg changed is suspended (the safe direction). Nothing in this module can approve.

import { sameNativeGroup, sameVenueDifferentTitle } from "../../sdk/linker/block.js";
import type { MarketFeatures } from "../../sdk/linker/features.js";
import type { CandidateInput, Link, ProposerSource } from "../links/schema.js";
import { vetoLink, findLink, proposeLink, suspendLink, type Outcome, type Registry } from "../links/store.js";
import { LINKER_HANDLE, MAX_PROPOSALS_PER_RUN } from "./constants.js";

// ---------------------------------------------------------------------------------------------
// Into the registry

export interface ProposalOutcome {
  readonly registry: Registry;
  readonly proposed: readonly { readonly linkId: string; readonly kind: string }[];
  readonly existing: number;
  readonly refused: readonly { readonly linkId: string; readonly errors: readonly string[] }[];
  readonly capped: number;
}

export function proposeAll(
  registry: Registry,
  items: readonly { readonly input: CandidateInput; readonly linkId: string; readonly kind: string; readonly source: ProposerSource }[],
  today: string,
): ProposalOutcome {
  let reg = registry;
  const proposed: { linkId: string; kind: string }[] = [];
  const refused: { linkId: string; errors: readonly string[] }[] = [];
  let existing = 0;
  let capped = 0;
  for (const item of items) {
    if (findLink(reg, item.linkId) !== undefined) {
      existing += 1;
      continue;
    }
    if (proposed.length >= MAX_PROPOSALS_PER_RUN) {
      capped += 1;
      continue;
    }
    const r: Outcome<{ registry: Registry; link: Link }> = proposeLink(reg, item.input, { source: item.source, id: LINKER_HANDLE }, { today });
    if (r.ok) {
      reg = r.value.registry;
      proposed.push({ linkId: r.value.link.linkId, kind: item.kind });
    } else refused.push({ linkId: item.linkId, errors: r.errors });
  }
  return { registry: reg, proposed, existing, refused, capped };
}

export interface RetireOutcome {
  readonly registry: Registry;
  readonly vetoed: readonly { readonly linkId: string; readonly reason: string }[];
  readonly suspended: readonly { readonly linkId: string; readonly reason: string }[];
}

// A leg seen this run with a different rules hash or close time, or a close in the past: the
// linker's own candidates are vetoed (revoked); an approved link is suspended for human review.
// The linker's own same-question candidates (identity, near_identity) are also vetoed when two legs
// are siblings of one native group or are on one venue with different titles, or when an identity's
// legs ask different questions: earlier runs proposed those (sdk/linker/block.ts, score.ts sameQuestion).
export function retireStale(registry: Registry, seen: ReadonlyMap<string, MarketFeatures>, nowMs: number, today: string): RetireOutcome {
  let reg = registry;
  const vetoed: { linkId: string; reason: string }[] = [];
  const suspended: { linkId: string; reason: string }[] = [];
  for (const link of [...registry.links].sort((a, b) => (a.linkId < b.linkId ? -1 : 1))) {
    if (link.state !== "candidate" && link.state !== "approved") continue;
    const reasons: string[] = [];
    link.legs.forEach((leg, i) => {
      const f = seen.get(`${leg.venue}:${leg.marketId}`);
      if (f !== undefined && f.rulesSha256 !== leg.rulesSha256) reasons.push(`leg${i}:rules_hash_changed`);
      if (f !== undefined && f.closeUtc !== leg.closeUtc) reasons.push(`leg${i}:close_time_changed`);
      const close = Date.parse(leg.closeUtc);
      if (Number.isFinite(close) && close <= nowMs) reasons.push(`leg${i}:closed`);
    });
    if (link.state === "candidate" && (link.relation === "identity" || link.relation === "near_identity")) {
      const legs = link.legs;
      if (legs.some((a, i) => legs.some((b, j) => j > i && sameNativeGroup(a, b)))) reasons.push("same_native_group");
      const fs = legs.map((l) => seen.get(`${l.venue}:${l.marketId}`));
      const known = fs.every((f) => f !== undefined) ? (fs as MarketFeatures[]) : null;
      if (known !== null && known.some((a, i) => known.some((b, j) => j > i && sameVenueDifferentTitle(a, b)))) reasons.push("same_venue_different_title");
      if (link.relation === "identity" && known !== null && new Set(known.map((f) => f.titleSha256)).size > 1) reasons.push("question_differs");
    }
    if (reasons.length === 0) continue;
    const reason = reasons.join(",").slice(0, 200);
    if (link.state === "candidate") {
      if (link.proposedBy.id !== LINKER_HANDLE) continue; // not ours to veto
      const r = vetoLink(reg, link.linkId, { source: "statistics", id: LINKER_HANDLE }, reason, { today });
      if (r.ok) {
        reg = r.value;
        vetoed.push({ linkId: link.linkId, reason });
      }
    } else if (reasons.some((x) => !x.endsWith(":closed"))) {
      // Expiry alone is handled by validUntil; a changed pin is what a human must look at.
      const r = suspendLink(reg, link.linkId, LINKER_HANDLE, `linker: ${reason}`.slice(0, 300), { today });
      if (r.ok) {
        reg = r.value;
        suspended.push({ linkId: link.linkId, reason });
      }
    }
  }
  return { registry: reg, vetoed, suspended };
}
