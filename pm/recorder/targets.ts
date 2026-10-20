// Where the recorder gets its market list.
//
//   1. A pm/links bundle (hash-pinned): the legs of approved and candidate links. A link is
//      recorded only if EVERY leg is on the allowlist. A link with a Kalshi (or any other
//      refused) leg is skipped whole and only counted: the other legs would be meaningless alone,
//      and nothing from a restricted venue may be stored, so no ids of refused legs are kept.
//   2. A targets file for XO and Polymarket groups (sets of markets that are mutually exclusive,
//      possibly exhaustive) and loose markets. A refused venue in this file is a hard error: the
//      operator typed it, so it is reported instead of silently dropped.
//
// Link and group files are inputs the operator controls. Market ids are validated before they
// can reach a URL.

import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import { validateBundle } from "../links/bundle.js";
import { isRecordableVenue, refusalReason, type RecVenue } from "./allowlist.js";
import type { Target, TargetGroup, TargetLink, TargetSet } from "./types.js";

// Same character set the link schema allows for market ids; a stricter check than needed for a
// URL path because the id is also percent-encoded.
export const MARKET_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function targetKey(venue: RecVenue, marketId: string): string {
  return `${venue}:${marketId}`;
}

export type TargetsResult = { readonly ok: true; readonly value: TargetSet } | { readonly ok: false; readonly errors: string[] };

function emptySet(): TargetSet {
  return { targets: [], links: [], groups: [], skipped: { linksWithRefusedLeg: 0, invalidIds: 0, inactiveLinks: 0 } };
}

const RECORDED_RELATIONS = new Set(["identity", "near_identity", "complement", "ladder", "partition", "related"]);

export interface BundleOptions {
  readonly expectedManifestSha256?: string;
  readonly unpinned?: boolean;
  readonly allowSynthetic?: boolean;
  // Candidates are recorded by default so the dataset can show whether a link would have been worth approving.
  readonly includeCandidates?: boolean;
}

export function targetsFromBundle(text: string, options: BundleOptions): TargetsResult {
  const loaded = validateBundle(text, {
    ...(options.expectedManifestSha256 === undefined ? {} : { expectedManifestSha256: options.expectedManifestSha256 }),
    ...(options.unpinned === true ? { unpinned: true } : {}),
    ...(options.allowSynthetic === true ? { allowSynthetic: true } : {}),
  });
  if (!loaded.ok) return { ok: false, errors: loaded.errors };
  const targets = new Map<string, Target>();
  const links: TargetLink[] = [];
  let refused = 0;
  let invalid = 0;
  let inactive = 0;
  for (const link of loaded.value.links) {
    const wanted = link.state === "approved" || (link.state === "candidate" && options.includeCandidates !== false);
    if (!wanted) {
      inactive += 1;
      continue;
    }
    if (!link.legs.every((l) => isRecordableVenue(l.venue))) {
      refused += 1;
      continue;
    }
    if (!link.legs.every((l) => MARKET_ID.test(l.marketId)) || !RECORDED_RELATIONS.has(link.relation)) {
      invalid += 1;
      continue;
    }
    const legs = link.legs.map((l) => {
      const venue = l.venue as RecVenue;
      const key = targetKey(venue, l.marketId);
      const closeMs = Date.parse(l.closeUtc);
      if (!targets.has(key)) targets.set(key, { key, venue, marketId: l.marketId, closeHintMs: Number.isFinite(closeMs) ? closeMs : null });
      // legs[0] has the identity outcome map; a leg whose first outcome maps to the other slot is flipped.
      return { targetKey: key, flip: (l.outcomeMap[0] ?? 0) !== 0, closeMs: Number.isFinite(closeMs) ? closeMs : null };
    });
    links.push({
      linkId: link.linkId,
      relation: link.relation,
      state: link.state,
      basisClass: link.basis.class,
      exhaustiveness: link.exhaustiveness ?? null,
      legs,
    });
  }
  return { ok: true, value: { targets: [...targets.values()], links, groups: [], skipped: { linksWithRefusedLeg: refused, invalidIds: invalid, inactiveLinks: inactive } } };
}

const marketId = z.string().regex(MARKET_ID);
const venueName = z.string().min(1).max(40);

export const targetsFileSchema = z.strictObject({
  format: z.literal("pm-recorder-targets"),
  version: z.literal(1),
  groups: z
    .array(
      z.strictObject({
        groupId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
        venue: venueName,
        // Declared by a human from the venue's rules; never inferred from market text.
        exhaustive: z.enum(["proven", "by_rule", "no", "unknown"]).default("unknown"),
        marketIds: z.array(marketId).min(2).max(64),
      }),
    )
    .default([]),
  markets: z.array(z.strictObject({ venue: venueName, marketId })).default([]),
});

export function targetsFromFile(text: string): TargetsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ["targets file is not valid JSON"] };
  }
  const parsed = targetsFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  const errors: string[] = [];
  const targets = new Map<string, Target>();
  const groups: TargetGroup[] = [];
  const add = (venue: RecVenue, id: string): string => {
    const key = targetKey(venue, id);
    if (!targets.has(key)) targets.set(key, { key, venue, marketId: id, closeHintMs: null });
    return key;
  };
  for (const g of parsed.data.groups) {
    if (!isRecordableVenue(g.venue)) {
      errors.push(`group ${g.groupId}: venue "${g.venue}" refused: ${refusalReason(g.venue)}`);
      continue;
    }
    if (g.venue !== "xo" && g.venue !== "polymarket") {
      errors.push(`group ${g.groupId}: groups are supported for xo and polymarket only`);
      continue;
    }
    groups.push({ groupId: g.groupId, venue: g.venue, exhaustive: g.exhaustive, members: [...new Set(g.marketIds)].map((id) => add(g.venue as RecVenue, id)) });
  }
  for (const m of parsed.data.markets) {
    if (!isRecordableVenue(m.venue)) errors.push(`market ${m.marketId.slice(0, 40)}: venue "${m.venue}" refused: ${refusalReason(m.venue)}`);
    else add(m.venue, m.marketId);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { targets: [...targets.values()], links: [], groups, skipped: { linksWithRefusedLeg: 0, invalidIds: 0, inactiveLinks: 0 } } };
}

export function mergeTargetSets(...sets: readonly TargetSet[]): TargetSet {
  const targets = new Map<string, Target>();
  const links = new Map<string, TargetLink>();
  const groups = new Map<string, TargetGroup>();
  const skipped = { linksWithRefusedLeg: 0, invalidIds: 0, inactiveLinks: 0 };
  for (const s of sets) {
    for (const t of s.targets) {
      const prev = targets.get(t.key);
      targets.set(t.key, prev === undefined || (prev.closeHintMs === null && t.closeHintMs !== null) ? t : prev);
    }
    for (const l of s.links) links.set(l.linkId, l);
    for (const g of s.groups) groups.set(g.groupId, g);
    skipped.linksWithRefusedLeg += s.skipped.linksWithRefusedLeg;
    skipped.invalidIds += s.skipped.invalidIds;
    skipped.inactiveLinks += s.skipped.inactiveLinks;
  }
  return {
    targets: [...targets.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    links: [...links.values()].sort((a, b) => (a.linkId < b.linkId ? -1 : 1)),
    groups: [...groups.values()].sort((a, b) => (a.groupId < b.groupId ? -1 : 1)),
    skipped,
  };
}

export interface TargetInputs {
  readonly bundlePath?: string;
  readonly bundleOptions?: BundleOptions;
  readonly targetsPath?: string;
  readonly maxTargets: number;
  readonly venues: readonly RecVenue[];
}

// Reads the files and returns the merged, venue-filtered set. Used at startup and on each tick,
// so an edited bundle or targets file takes effect without a restart.
export function loadTargets(inputs: TargetInputs): TargetsResult {
  const parts: TargetSet[] = [emptySet()];
  const errors: string[] = [];
  try {
    if (inputs.bundlePath !== undefined) {
      const r = targetsFromBundle(readFileSync(inputs.bundlePath, "utf8"), inputs.bundleOptions ?? {});
      if (r.ok) parts.push(r.value);
      else errors.push(...r.errors.map((e) => `bundle: ${e}`));
    }
    if (inputs.targetsPath !== undefined) {
      const r = targetsFromFile(readFileSync(inputs.targetsPath, "utf8"));
      if (r.ok) parts.push(r.value);
      else errors.push(...r.errors.map((e) => `targets file: ${e}`));
    }
  } catch (error) {
    errors.push(`cannot read an input file: ${error instanceof Error ? error.message.replace(/\/[^\s]*/g, "<path>") : "error"}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const merged = mergeTargetSets(...parts);
  const venueOk = new Set<string>(inputs.venues);
  const targets = merged.targets.filter((t) => venueOk.has(t.venue));
  if (targets.length > inputs.maxTargets) return { ok: false, errors: [`${targets.length} targets exceeds maxTargets=${inputs.maxTargets}`] };
  const keys = new Set(targets.map((t) => t.key));
  return {
    ok: true,
    value: {
      targets,
      links: merged.links.filter((l) => l.legs.every((g) => keys.has(g.targetKey))),
      groups: merged.groups.filter((g) => g.members.every((m) => keys.has(m))),
      skipped: merged.skipped,
    },
  };
}
