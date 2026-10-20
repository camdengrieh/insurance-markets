// Re-checking a bundled link against the live legs (M3-9; aggregation-design L4 verifier). Pure and deterministic: no
// model, no network. The caller reads each leg through its own reader and passes what it saw.
//
// Order of precedence for the verdict: expired, then suspended (something pinned CHANGED), then unverified
// (something could not be checked), then verified. Unknown never counts as a match: a leg that could not be read, a
// reader that gives no rules hash, and a close time that is missing all stop a link from being "verified".

import type { Status } from "../../../core/ports";
import { capSpreadLabel, type SpreadLabel } from "../../../venues/quotient";
import type { Link, LinkLeg } from "./schema";

export type LegObservation =
  // `status` is the leg's live status. Only "active" keeps a link verified: a closed, determined, disputed, resolved,
  // voided, paused or not-yet-open leg suspends it, and a status the reader could not give stops it being verified.
  | { readonly state: "read"; readonly rulesSha256: string | null; readonly closesAtUtc: string | null; readonly status: Status | null }
  | { readonly state: "unavailable" };

export type LinkReason =
  | "link_expired"
  | "rules_hash_changed"
  | "rules_hash_unavailable"
  | "close_time_changed"
  | "close_time_unknown"
  | "leg_not_active"
  | "leg_status_unknown"
  | "leg_unreadable";

export type LegCheck = "match" | "changed" | "unavailable";

export interface LegVerdict {
  readonly rules: LegCheck;
  readonly close: LegCheck;
  readonly status: LegCheck;
}

export interface LinkVerdict {
  readonly state: "verified" | "suspended" | "unverified" | "expired";
  readonly reasons: readonly LinkReason[];
  readonly legs: readonly LegVerdict[];
}

function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function checkLeg(leg: LinkLeg, seen: LegObservation | undefined): { readonly verdict: LegVerdict; readonly reasons: LinkReason[] } {
  const reasons: LinkReason[] = [];
  if (seen === undefined || seen.state === "unavailable") {
    return { verdict: { rules: "unavailable", close: "unavailable", status: "unavailable" }, reasons: ["leg_unreadable"] };
  }
  let rules: LegCheck;
  if (seen.rulesSha256 === null || !/^[0-9a-fA-F]{64}$/.test(seen.rulesSha256)) {
    rules = "unavailable";
    reasons.push("rules_hash_unavailable");
  } else if (seen.rulesSha256.toLowerCase() === leg.rulesSha256) {
    rules = "match";
  } else {
    rules = "changed";
    reasons.push("rules_hash_changed");
  }
  let close: LegCheck;
  if (seen.closesAtUtc === null || !Number.isFinite(Date.parse(seen.closesAtUtc))) {
    close = "unavailable";
    reasons.push("close_time_unknown");
  } else if (sameInstant(seen.closesAtUtc, leg.closeUtc)) {
    close = "match";
  } else {
    close = "changed";
    reasons.push("close_time_changed");
  }
  let status: LegCheck;
  if (seen.status === null || seen.status === "unknown") {
    status = "unavailable";
    reasons.push("leg_status_unknown");
  } else if (seen.status === "active") {
    status = "match";
  } else {
    status = "changed";
    reasons.push("leg_not_active");
  }
  return { verdict: { rules, close, status }, reasons };
}

export function verifyLink(link: Link, observed: readonly (LegObservation | undefined)[], nowMs: number): LinkVerdict {
  const reasons = new Set<LinkReason>();
  const legs = link.legs.map((leg, index) => {
    const checked = checkLeg(leg, observed[index]);
    for (const reason of checked.reasons) reasons.add(reason);
    return checked.verdict;
  });
  const validUntil = Date.parse(link.validUntil);
  const expired = !Number.isFinite(validUntil) || nowMs >= validUntil;
  if (expired) reasons.add("link_expired");
  const list = [...reasons];
  let state: LinkVerdict["state"];
  if (expired) state = "expired";
  else if (list.includes("rules_hash_changed") || list.includes("close_time_changed") || list.includes("leg_not_active")) state = "suspended";
  else if (list.length > 0) state = "unverified";
  else state = "verified";
  return { state, reasons: list, legs };
}

// ---- the spread label of a link (M3-10) -------------------------------------------------------------------------------

// Nothing above `hedged_discrepancy` while criterion D2 is unmet, whatever a dataset says.
export type LinkLabelReason = "link_not_verified" | "leg_book_unavailable" | "class_bound_unproven" | "bound_passed";

export function linkLabel(link: Link, verdict: LinkVerdict, books: { readonly bothAvailable: boolean }): { readonly label: SpreadLabel; readonly reason: LinkLabelReason } {
  if (verdict.state !== "verified") return { label: capSpreadLabel("indicative"), reason: "link_not_verified" };
  if (!books.bothAvailable) return { label: capSpreadLabel("indicative"), reason: "leg_book_unavailable" };
  if (link.bound !== "passed") return { label: capSpreadLabel("indicative"), reason: "class_bound_unproven" };
  // The candidate is passed through the cap, so a future label above the ceiling could not get out of here.
  return { label: capSpreadLabel("hedged_discrepancy"), reason: "bound_passed" };
}
