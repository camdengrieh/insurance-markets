// The dApp's bundled dataset (app/src/features/signals/links/schema.ts) from a pm link bundle.
// Ids, hashes, close times, outcome maps, proof, state, a category word and a score band: never a
// title, never a price. The content hash is the app's own recipe (sorted-key JSON, sha256) so the
// page's loader pins what it reads. Restricted-venue legs are refused before anything is written.

import { createHash } from "node:crypto";
import type { Bundle } from "../links/bundle.js";
import { isRestrictedVenue, type Link } from "../links/schema.js";
import { bandOf } from "./score.js";

export const APP_DATASET_RULES_RECIPE = "rules-v2";

export interface AppLeg {
  readonly venue: string;
  readonly nativeId: string;
  readonly rulesSha256: string;
  readonly maskedSha256: string;
  readonly closeUtc: string;
  readonly outcomeMap: readonly number[];
  readonly resolverId?: string;
  readonly category?: string;
}

export interface AppLink {
  readonly linkId: string;
  readonly relation: string;
  readonly legs: readonly AppLeg[];
  readonly proof: string;
  readonly state: string;
  readonly basis: { readonly class: string; readonly axes: readonly string[] };
  readonly validUntil: string;
  readonly band?: string;
}

export interface AppDataset {
  readonly schemaVersion: 1;
  readonly release: string;
  readonly rulesRecipe: typeof APP_DATASET_RULES_RECIPE;
  readonly links: readonly AppLink[];
  readonly contentSha256: string;
}

// Byte-for-byte the app's canonicalJson (dataset.ts): JSON.stringify for scalars, sorted keys.
export function appCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => appCanonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${appCanonicalJson(record[key])}`)
    .join(",")}}`;
}

export function appContentHash(parts: { readonly schemaVersion: 1; readonly release: string; readonly links: readonly AppLink[] }): string {
  return createHash("sha256").update(appCanonicalJson({ schemaVersion: parts.schemaVersion, release: parts.release, links: parts.links }), "utf8").digest("hex");
}

const AXIS_OF: Readonly<Record<string, "timing" | "source" | "condition_scope">> = {
  timing_cutoff: "timing",
  window_start: "timing",
  early_close: "timing",
  measure_source: "source",
  oracle: "source",
  reference_index: "source",
};

function relationOf(link: Link): string {
  if (link.relation === "ladder") return link.ladder?.axis === "date" ? "ladder_date" : "ladder_threshold";
  return link.relation;
}

function stateOf(link: Link): string {
  switch (link.state) {
    case "candidate":
      return "proposed";
    case "approved":
      return link.proof.level === "P2_template" ? "template_approved" : "human_approved";
    case "suspended":
      return "suspended";
    case "revoked":
      return "rejected";
  }
}

function bandFrom(link: Link): string | undefined {
  for (const e of link.proof.evidence) {
    const m = /^s(\d{1,5})\./.exec(e.detail);
    if (e.method === "statistics_hint" && m !== null) return bandOf(Number(m[1]));
  }
  return undefined;
}

const NATIVE_ID = /^[A-Za-z0-9_.:#-]{1,120}$/;
const RESOLVER_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const CATEGORY = /^[a-z_]{1,32}$/;

export interface AppConversion {
  readonly dataset: AppDataset;
  readonly skipped: readonly { readonly linkId: string; readonly reason: string }[];
}

export function toAppDataset(bundle: Bundle, options: { readonly release: string; readonly categories?: ReadonlyMap<string, string> }): AppConversion {
  const links: AppLink[] = [];
  const skipped: { linkId: string; reason: string }[] = [];
  for (const link of bundle.links) {
    if (link.synthetic) {
      skipped.push({ linkId: link.linkId, reason: "synthetic" });
      continue;
    }
    if (link.legs.some((l) => isRestrictedVenue(l.venue))) {
      skipped.push({ linkId: link.linkId, reason: "restricted_leg" });
      continue;
    }
    if (link.legs.length > 4) {
      skipped.push({ linkId: link.linkId, reason: "more_than_four_legs" });
      continue;
    }
    const legs: AppLeg[] = [];
    let bad: string | null = null;
    for (const leg of link.legs) {
      if (!NATIVE_ID.test(leg.marketId)) bad = "leg_id_shape";
      if (leg.outcomeMap.length > 10 || leg.outcomeMap.some((i) => i > 9)) bad = "outcome_map_too_wide";
      const category = options.categories?.get(`${leg.venue}:${leg.marketId}`);
      legs.push({
        venue: leg.venue,
        nativeId: leg.marketId,
        rulesSha256: leg.rulesSha256,
        maskedSha256: leg.maskedSha256,
        closeUtc: leg.closeUtc,
        outcomeMap: [...leg.outcomeMap],
        ...(leg.resolverId !== null && RESOLVER_ID.test(leg.resolverId) ? { resolverId: leg.resolverId } : {}),
        ...(category !== undefined && CATEGORY.test(category) ? { category } : {}),
      });
    }
    if (bad !== null) {
      skipped.push({ linkId: link.linkId, reason: bad });
      continue;
    }
    const axes = [...new Set(link.basis.axes.map((a) => AXIS_OF[a.axis] ?? "condition_scope"))].sort().slice(0, 3);
    const band = bandFrom(link);
    links.push({
      linkId: link.linkId,
      relation: relationOf(link),
      legs,
      proof: link.proof.level,
      state: stateOf(link),
      basis: { class: link.basis.class, axes },
      validUntil: link.validUntil,
      ...(band === undefined ? {} : { band }),
    });
  }
  links.sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  const contentSha256 = appContentHash({ schemaVersion: 1, release: options.release, links });
  return { dataset: { schemaVersion: 1, release: options.release, rulesRecipe: APP_DATASET_RULES_RECIPE, links, contentSha256 }, skipped };
}

export function serializeAppDataset(dataset: AppDataset): string {
  // Pretty, sorted keys, stable bytes.
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v !== null && typeof v === "object") {
      const r = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(r).sort().map((k) => [k, sortKeys(r[k])]));
    }
    return v;
  };
  return `${JSON.stringify(sortKeys(dataset), null, 2)}\n`;
}
