// Lookup for pm_lookup_links: reads a validated, pinned bundle only (offline). Approved links and
// candidates are returned separately; candidates are always labelled indicative. Free text in a
// record (quotes, evidence, reasons, slot values) is returned only inside UntrustedContent slots,
// produced by src/guardrails/untrusted.ts, and only when `detail` is requested.

import { sanitizeField, UNTRUSTED_DATA_NOTICE, type UntrustedContent } from "../../src/guardrails/untrusted.js";
import { VENUE_IDS, type VenueId } from "../types.js";
import type { Bundle } from "./bundle.js";
import {
  marketId as marketIdSchema,
  type AxisInstance,
  type Link,
  type LinkLeg,
  type Tier,
} from "./schema.js";
import { computeTierCap, effectiveProofLevel, type ClassGates } from "./tier.js";

export const MAX_ITEMS_PER_GROUP = 50;
const SOURCE = "link-registry";

export interface LookupQuery {
  readonly venue: string;
  readonly marketId: string;
  readonly includeCandidates?: boolean;
  readonly detail?: boolean;
}

export interface LookupContext {
  readonly now: Date;
  // Class gates from a gold-set evaluation. Absent means no class has passed: everything is
  // capped at indicative_discrepancy.
  readonly gates?: ClassGates;
}

export type LookupLabel =
  | "approved"
  | "indicative_candidate"
  | "suspended_do_not_use"
  | "revoked_do_not_use"
  | "expired_do_not_use";

export interface LookupLeg {
  readonly venue: VenueId;
  readonly marketId: string;
  readonly isQueried: boolean;
  readonly outcomeMap: readonly number[];
  readonly rulesSha256: string;
  readonly maskedSha256: string;
  readonly closeUtc: string;
  readonly voidPolicy: LinkLeg["voidPolicy"];
  readonly resolverId: string | null;
  readonly creatorAllowlisted: boolean | null;
}

export interface LookupAxisSummary {
  readonly axis: AxisInstance["axis"];
  readonly severity: AxisInstance["severity"];
  readonly legA: number;
  readonly legB: number;
}

export interface LookupDetail {
  readonly proposedBy: { readonly source: string; readonly id: string; readonly at: string };
  readonly templateId?: UntrustedContent;
  readonly axes: readonly {
    readonly axis: AxisInstance["axis"];
    readonly a: UntrustedContent;
    readonly b: UntrustedContent;
    readonly quoteA?: UntrustedContent;
    readonly quoteB?: UntrustedContent;
  }[];
  readonly evidence: readonly {
    readonly method: string;
    readonly detail: UntrustedContent;
    readonly legIndex?: number;
    readonly quote?: UntrustedContent;
  }[];
  readonly approvals: readonly {
    readonly reviewer: string;
    readonly date: string;
    readonly evidence: readonly UntrustedContent[];
  }[];
  readonly stateReason?: UntrustedContent;
}

export interface LookupItem {
  readonly linkId: string;
  readonly label: LookupLabel;
  readonly relation: Link["relation"];
  readonly state: Link["state"];
  readonly effectiveTierCap: Tier;
  readonly tierCapReasons: readonly string[];
  readonly tierCapNotes: readonly string[];
  readonly basis: {
    readonly class: Link["basis"]["class"];
    readonly cutoffDeltaMinutes: number | null;
    readonly axes: readonly LookupAxisSummary[];
  };
  readonly proofLevel: Link["proof"]["level"];
  readonly effectiveProofLevel: Link["proof"]["level"];
  readonly exhaustiveness?: Link["exhaustiveness"];
  readonly ladder?: Link["ladder"];
  readonly legs: readonly LookupLeg[];
  readonly reviewer?: string;
  readonly reviewedAt?: string;
  readonly validUntil: string;
  // Pins were not re-checked against live markets by this offline lookup.
  readonly pinsVerified: false;
  readonly detail?: LookupDetail;
}

export interface LookupResult {
  readonly query: { readonly venue: VenueId; readonly marketId: string };
  readonly bundle: {
    readonly manifestSha256: string;
    readonly createdAt: string;
    readonly counts: Bundle["manifest"]["counts"];
  };
  readonly approved: readonly LookupItem[];
  readonly candidates: readonly LookupItem[];
  readonly withdrawn: readonly LookupItem[];
  readonly truncated: boolean;
  readonly notes: readonly string[];
  readonly untrustedNotice: string;
}

export type LookupOutcome =
  | { readonly ok: true; readonly value: LookupResult }
  | { readonly ok: false; readonly error: "BAD_QUERY"; readonly detail: string };

function normaliseId(id: string): string {
  return id.replace(/0x[0-9a-fA-F]+/g, (m) => m.toLowerCase());
}

function untrustedText(text: string): UntrustedContent {
  return sanitizeField("generic", text, SOURCE);
}

function buildDetail(link: Link): LookupDetail {
  return {
    proposedBy: link.proposedBy,
    ...(link.templateId === undefined ? {} : { templateId: untrustedText(link.templateId) }),
    axes: link.basis.axes.map((a) => ({
      axis: a.axis,
      a: untrustedText(a.a),
      b: untrustedText(a.b),
      ...(a.quoteA === undefined ? {} : { quoteA: untrustedText(a.quoteA) }),
      ...(a.quoteB === undefined ? {} : { quoteB: untrustedText(a.quoteB) }),
    })),
    evidence: link.proof.evidence.map((e) => ({
      method: e.method,
      detail: untrustedText(e.detail),
      ...(e.legIndex === undefined ? {} : { legIndex: e.legIndex }),
      ...(e.quote === undefined ? {} : { quote: untrustedText(e.quote) }),
    })),
    approvals: link.approvals.map((a) => ({
      reviewer: a.reviewer,
      date: a.date,
      evidence: a.evidence.map(untrustedText),
    })),
    ...(link.stateReason === undefined ? {} : { stateReason: untrustedText(link.stateReason) }),
  };
}

function toItem(link: Link, query: { venue: string; marketId: string }, ctx: LookupContext, detail: boolean): LookupItem {
  const cap = computeTierCap(link, ctx);
  const expired = ctx.now.getTime() >= Date.parse(link.validUntil);
  let label: LookupLabel;
  switch (link.state) {
    case "approved":
      label = expired ? "expired_do_not_use" : "approved";
      break;
    case "candidate":
      label = "indicative_candidate";
      break;
    case "suspended":
      label = "suspended_do_not_use";
      break;
    case "revoked":
      label = "revoked_do_not_use";
      break;
  }
  return {
    linkId: link.linkId,
    label,
    relation: link.relation,
    state: link.state,
    effectiveTierCap: cap.cap,
    tierCapReasons: cap.reasons,
    tierCapNotes: cap.notes,
    basis: {
      class: link.basis.class,
      cutoffDeltaMinutes: link.basis.cutoffDeltaMinutes,
      axes: link.basis.axes.map((a) => ({ axis: a.axis, severity: a.severity, legA: a.legA, legB: a.legB })),
    },
    proofLevel: link.proof.level,
    effectiveProofLevel: effectiveProofLevel(link),
    ...(link.exhaustiveness === undefined ? {} : { exhaustiveness: link.exhaustiveness }),
    ...(link.ladder === undefined ? {} : { ladder: link.ladder }),
    legs: link.legs.map((leg) => ({
      venue: leg.venue,
      marketId: leg.marketId,
      isQueried: leg.venue === query.venue && leg.marketId === query.marketId,
      outcomeMap: leg.outcomeMap,
      rulesSha256: leg.rulesSha256,
      maskedSha256: leg.maskedSha256,
      closeUtc: leg.closeUtc,
      voidPolicy: leg.voidPolicy,
      resolverId: leg.resolverId,
      creatorAllowlisted: leg.creatorAllowlisted,
    })),
    ...(link.reviewer === undefined ? {} : { reviewer: link.reviewer }),
    ...(link.reviewedAt === undefined ? {} : { reviewedAt: link.reviewedAt }),
    validUntil: link.validUntil,
    pinsVerified: false,
    ...(detail ? { detail: buildDetail(link) } : {}),
  };
}

export function lookupLinks(bundle: Bundle, query: LookupQuery, ctx: LookupContext): LookupOutcome {
  if (!(VENUE_IDS as readonly string[]).includes(query.venue)) {
    return { ok: false, error: "BAD_QUERY", detail: "unknown venue" };
  }
  const id = normaliseId(query.marketId);
  if (!marketIdSchema.safeParse(id).success) return { ok: false, error: "BAD_QUERY", detail: "invalid market id" };
  const q = { venue: query.venue as VenueId, marketId: id };

  const matching = bundle.links.filter((l) => l.legs.some((leg) => leg.venue === q.venue && leg.marketId === q.marketId));
  const detail = query.detail === true;
  const includeCandidates = query.includeCandidates !== false;

  const approved: LookupItem[] = [];
  const candidates: LookupItem[] = [];
  const withdrawn: LookupItem[] = [];
  for (const link of matching) {
    const item = toItem(link, q, ctx, detail);
    if (item.label === "approved") approved.push(item);
    else if (item.label === "indicative_candidate") {
      if (includeCandidates) candidates.push(item);
    } else withdrawn.push(item);
  }
  const truncated =
    approved.length > MAX_ITEMS_PER_GROUP || candidates.length > MAX_ITEMS_PER_GROUP || withdrawn.length > MAX_ITEMS_PER_GROUP;

  const notes: string[] = [];
  if (matching.length === 0) {
    notes.push("No link in the bundled dataset covers this market. Absence of a link is not evidence that no relationship exists.");
  }
  if (approved.length === 0 && candidates.length > 0) {
    notes.push("Only unapproved candidates exist for this market; they are indicative and never support a discrepancy label.");
  }
  if (ctx.gates === undefined) {
    notes.push("No gold-set class gate has been evaluated, so every effective tier cap is indicative_discrepancy.");
  }
  notes.push("Pins were not re-checked against the live markets; verify them before relying on a link.");

  return {
    ok: true,
    value: {
      query: q,
      bundle: {
        manifestSha256: bundle.manifestSha256,
        createdAt: bundle.manifest.createdAt,
        counts: bundle.manifest.counts,
      },
      approved: approved.slice(0, MAX_ITEMS_PER_GROUP),
      candidates: candidates.slice(0, MAX_ITEMS_PER_GROUP),
      withdrawn: withdrawn.slice(0, MAX_ITEMS_PER_GROUP),
      truncated,
      notes,
      untrustedNotice: UNTRUSTED_DATA_NOTICE,
    },
  };
}
