// Join parsed Quotient rows to the human-approved link registry by market key.
//
// The ONLY source of "links" is the approved, hash-pinned registry (pm/links). Quotient's own
// `match` and `relationships` blocks are never read: a statistics or vendor claim cannot create
// or promote a link. A Quotient number reaches another venue's market (for example XO) only when
//   - the link is `approved`, not expired, and not synthetic (unless the caller opts in for tests),
//   - the relation is `identity`, or `near_identity` whose only divergence is timing
//     (timing_cutoff / window_start, minor) on a settlement_window basis, and
//   - the cutoffs of its legs differ by strictly less than 24 hours (the larger of the recorded
//     delta and the delta recomputed from the pinned closeUtc values; unknown never qualifies).
// Everything else, including approved partitions, ladders and complements and any unapproved
// candidate, is "related, not identical" and carries no probability for the other venue.

import type { Link, LinkLeg } from "../links/schema.js";
import type { VenueId } from "../types.js";
import { LABEL_RELATED, type QuotientVenue } from "./constants.js";
import type { QuotientRow } from "./parse.js";

export const TIMING_AXES = ["timing_cutoff", "window_start"] as const;
export const MAX_TIMING_DELTA_MINUTES = 24 * 60;

export type JoinStatus = "linked_identity" | "related_not_identical" | "no_link";

export interface JoinOptions {
  readonly nowMs: number;
  // Index of Q's YES outcome in the Quotient venue's OWN outcome list for that market. Supplied
  // by the venue adapter from outcome order and token ids, never from labels. Absent or null
  // means the other venue's probability is withheld.
  readonly yesOutcomeIndex?: (venue: VenueId, marketId: string) => number | null;
  // Test fixtures only. Real records are never synthetic.
  readonly allowSynthetic?: boolean;
}

export interface TargetOutcomeProbability {
  readonly outcomeIndex: number;
  // Q's probability that this outcome of the target market happens (a prior, not a price).
  readonly probability: string;
}

export interface JoinTarget {
  readonly venue: VenueId;
  readonly marketId: string;
  readonly outcomes: readonly TargetOutcomeProbability[] | null;
  readonly withheldReason: string | null;
}

export interface JoinMatch {
  readonly linkId: string;
  readonly relation: Link["relation"];
  readonly kind: "identity" | "near_identity_timing";
  readonly timingDeltaMinutes: number;
  readonly targets: readonly JoinTarget[];
}

export interface RelatedLink {
  readonly linkId: string;
  readonly relation: Link["relation"];
  readonly state: Link["state"];
  readonly reasons: readonly string[];
}

export interface JoinResult {
  readonly marketKey: string;
  readonly status: JoinStatus;
  readonly label: typeof LABEL_RELATED | null;
  readonly matches: readonly JoinMatch[];
  readonly related: readonly RelatedLink[];
  readonly notes: readonly string[];
}

type JoinableRow = Pick<QuotientRow, "marketKey" | "venue" | "marketId" | "conditionId" | "qYes" | "orientation">;

const VENUE_MAP: Readonly<Record<QuotientVenue, VenueId>> = {
  polymarket: "polymarket",
  polymarket_us: "polymarket_us",
  kalshi: "kalshi",
  hl_outcomes: "hyperliquid",
};

function norm(id: string): string {
  return id.replace(/0x[0-9a-fA-F]+/g, (m) => m.toLowerCase());
}

function idCandidates(row: JoinableRow): Set<string> {
  const ids = new Set<string>([norm(row.marketId)]);
  if (row.marketId.startsWith("#")) ids.add(norm(row.marketId.slice(1)));
  if (row.conditionId !== null) ids.add(norm(row.conditionId));
  return ids;
}

function matchedLeg(link: Link, row: JoinableRow): LinkLeg | null {
  const venue = VENUE_MAP[row.venue];
  const ids = idCandidates(row);
  return link.legs.find((leg) => leg.venue === venue && ids.has(norm(leg.marketId))) ?? null;
}

function cutoffDeltaMinutes(link: Link): number | null {
  const times = link.legs.map((l) => Date.parse(l.closeUtc));
  if (times.some((t) => Number.isNaN(t))) return null;
  const computed = Math.ceil((Math.max(...times) - Math.min(...times)) / 60_000);
  const declared = link.basis.cutoffDeltaMinutes;
  if (declared === null) return null; // not recorded: unknown never qualifies
  return Math.max(declared, computed);
}

interface Classification {
  readonly kind: "identity" | "near_identity_timing" | null;
  readonly deltaMinutes: number | null;
  readonly reasons: readonly string[];
}

export function classifyLink(link: Link, nowMs: number, allowSynthetic: boolean): Classification {
  const reasons: string[] = [];
  if (link.state !== "approved") reasons.push(`state is ${link.state}`);
  if (link.synthetic && !allowSynthetic) reasons.push("synthetic record");
  const until = Date.parse(link.validUntil);
  if (Number.isNaN(until) || nowMs >= until) reasons.push("link has expired");

  let kind: Classification["kind"] = null;
  if (link.relation === "identity") {
    if (link.basis.class !== "identical") reasons.push(`basis class is ${link.basis.class}`);
    if (link.basis.axes.length > 0) reasons.push("identity link carries divergence axes");
    kind = "identity";
  } else if (link.relation === "near_identity") {
    if (link.basis.class !== "settlement_window") reasons.push(`basis class is ${link.basis.class}`);
    const bad = link.basis.axes.filter(
      (a) => !(TIMING_AXES as readonly string[]).includes(a.axis) || a.severity !== "minor",
    );
    if (bad.length > 0) reasons.push(`divergence beyond a minor timing axis: ${[...new Set(bad.map((a) => a.axis))].join(", ")}`);
    if (link.basis.axes.length === 0) reasons.push("near_identity link records no timing axis");
    kind = "near_identity_timing";
  } else {
    reasons.push(`relation is ${link.relation}`);
  }

  const delta = cutoffDeltaMinutes(link);
  if (delta === null) reasons.push("cutoff delta unknown");
  else if (delta >= MAX_TIMING_DELTA_MINUTES) reasons.push("cutoffs differ by 24 hours or more");

  return { kind: reasons.length === 0 ? kind : null, deltaMinutes: delta, reasons };
}

function oneMinus(q: string): string {
  // q is an exact decimal string in [0,1] produced by pm/signals/parse.ts.
  const [whole = "0", frac = ""] = q.split(".");
  const places = frac.length;
  const scaled = BigInt(whole + frac);
  const unit = 10n ** BigInt(places);
  const diff = unit - scaled;
  const digits = diff.toString().padStart(places + 1, "0");
  const intPart = digits.slice(0, digits.length - places);
  const fracPart = digits.slice(digits.length - places).replace(/0+$/, "");
  return fracPart === "" ? intPart : `${intPart}.${fracPart}`;
}

function targetsFor(link: Link, leg: LinkLeg, row: JoinableRow, opts: JoinOptions): JoinTarget[] {
  const others = link.legs.filter((l) => l !== leg);
  const withhold = (reason: string): JoinTarget[] =>
    others.map((l) => ({ venue: l.venue, marketId: l.marketId, outcomes: null, withheldReason: reason }));
  if (row.orientation.kind !== "venue_yes") {
    return withhold("sports row: probability is for sports.yes_side and is not mapped to token ids");
  }
  const yesIdx = opts.yesOutcomeIndex?.(leg.venue, leg.marketId) ?? null;
  if (yesIdx === null || !Number.isInteger(yesIdx) || yesIdx < 0 || yesIdx >= leg.outcomeMap.length) {
    return withhold("YES outcome index of the Quotient market was not supplied by the venue adapter");
  }
  if (leg.outcomeMap.length !== 2) return withhold("only binary legs are supported");
  const base = leg.outcomeMap[yesIdx] as number;
  return others.map((l) => {
    const t = l.outcomeMap.indexOf(base);
    if (l.outcomeMap.length !== 2 || t < 0 || l.outcomeMap.lastIndexOf(base) !== t) {
      return { venue: l.venue, marketId: l.marketId, outcomes: null, withheldReason: "outcome map does not identify the outcome" };
    }
    return {
      venue: l.venue,
      marketId: l.marketId,
      outcomes: [
        { outcomeIndex: t, probability: row.qYes },
        { outcomeIndex: 1 - t, probability: oneMinus(row.qYes) },
      ],
      withheldReason: null,
    };
  });
}

export function joinRow(row: JoinableRow, links: readonly Link[], opts: JoinOptions): JoinResult {
  const matches: JoinMatch[] = [];
  const related: RelatedLink[] = [];
  const notes: string[] = [
    "Links come only from the approved, hash-pinned registry. Quotient's own match and relationship blocks are not used.",
  ];
  let withdrawn = 0;
  for (const link of links) {
    const leg = matchedLeg(link, row);
    if (leg === null) continue;
    if (link.state === "suspended" || link.state === "revoked") {
      withdrawn += 1;
      continue;
    }
    const c = classifyLink(link, opts.nowMs, opts.allowSynthetic === true);
    if (c.kind !== null && c.deltaMinutes !== null) {
      matches.push({
        linkId: link.linkId,
        relation: link.relation,
        kind: c.kind,
        timingDeltaMinutes: c.deltaMinutes,
        targets: targetsFor(link, leg, row, opts),
      });
    } else {
      related.push({ linkId: link.linkId, relation: link.relation, state: link.state, reasons: c.reasons });
    }
  }
  if (withdrawn > 0) notes.push(`${withdrawn} suspended or revoked link(s) ignored.`);
  const status: JoinStatus = matches.length > 0 ? "linked_identity" : related.length > 0 ? "related_not_identical" : "no_link";
  if (status === "no_link") notes.push("No approved link covers this market. Absence of a link is not evidence that no relationship exists.");
  return {
    marketKey: row.marketKey,
    status,
    label: status === "related_not_identical" ? LABEL_RELATED : null,
    matches,
    related,
    notes,
  };
}

export function joinRows(rows: readonly JoinableRow[], links: readonly Link[], opts: JoinOptions): readonly JoinResult[] {
  return rows.map((r) => joinRow(r, links, opts));
}
