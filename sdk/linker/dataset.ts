// The dApp's published dataset (links/dataset.ts) from a link bundle: the linker's export-app step.
// Ids, hashes, close times, outcome maps, proof, state, a category word and a score band: never a
// title, never a price. Restricted-venue legs are refused before anything is written, and every link
// is checked against the dataset schema the page parses with, so the file never holds a link the page
// would refuse. `terms` says which venues are restricted (links/schema.ts PersistenceTerms).

import { RULES_HASH_RECIPE } from "../rules.js";
import type { Bundle } from "../links/bundle.js";
import {
  DATASET_SCHEMA_VERSION,
  datasetLinkSchema,
  pinDataset,
  type DatasetBand,
  type DatasetBasisAxis,
  type DatasetLeg,
  type DatasetLink,
  type DatasetRelation,
  type DatasetState,
  type LinkDataset,
} from "../links/dataset.js";
import { isRestrictedVenue, type Link, type PersistenceTerms } from "../links/schema.js";
import { bandOf } from "./score.js";

// The recipe behind every exported leg's rulesSha256.
export const DATASET_RULES_RECIPE = RULES_HASH_RECIPE;

const AXIS_OF: Readonly<Record<string, DatasetBasisAxis>> = {
  timing_cutoff: "timing",
  window_start: "timing",
  early_close: "timing",
  measure_source: "source",
  oracle: "source",
  reference_index: "source",
};

function relationOf(link: Link): DatasetRelation {
  if (link.relation === "ladder") return link.ladder?.axis === "date" ? "ladder_date" : "ladder_threshold";
  return link.relation;
}

function stateOf(link: Link): DatasetState {
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

function bandFrom(link: Link): DatasetBand | undefined {
  for (const e of link.proof.evidence) {
    const m = /^s(\d{1,5})\./.exec(e.detail);
    if (e.method === "statistics_hint" && m !== null) return bandOf(Number(m[1]));
  }
  return undefined;
}

const NATIVE_ID = /^[A-Za-z0-9_.:#-]{1,120}$/;
const RESOLVER_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const CATEGORY = /^[a-z_]{1,32}$/;

export interface DatasetConversion {
  readonly dataset: LinkDataset;
  readonly skipped: readonly { readonly linkId: string; readonly reason: string }[];
}

export function toLinkDataset(
  bundle: Bundle,
  options: { readonly release: string; readonly categories?: ReadonlyMap<string, string> },
  terms: PersistenceTerms,
): DatasetConversion {
  const links: DatasetLink[] = [];
  const skipped: { linkId: string; reason: string }[] = [];
  for (const link of bundle.links) {
    if (link.synthetic) {
      skipped.push({ linkId: link.linkId, reason: "synthetic" });
      continue;
    }
    if (link.legs.some((l) => isRestrictedVenue(l.venue, terms))) {
      skipped.push({ linkId: link.linkId, reason: "restricted_leg" });
      continue;
    }
    if (link.legs.length > 4) {
      skipped.push({ linkId: link.linkId, reason: "more_than_four_legs" });
      continue;
    }
    const legs: DatasetLeg[] = [];
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
    const out: DatasetLink = {
      linkId: link.linkId,
      relation: relationOf(link),
      legs,
      proof: link.proof.level,
      state: stateOf(link),
      basis: { class: link.basis.class, axes },
      validUntil: link.validUntil,
      ...(band === undefined ? {} : { band }),
    };
    // The page refuses the whole file over one bad link, so a link it would refuse is left out here by name.
    if (!datasetLinkSchema.safeParse(out).success) {
      skipped.push({ linkId: link.linkId, reason: "dataset_schema" });
      continue;
    }
    links.push(out);
  }
  links.sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  const pinned = pinDataset({ schemaVersion: DATASET_SCHEMA_VERSION, release: options.release, links });
  return { dataset: { ...pinned, rulesRecipe: DATASET_RULES_RECIPE }, skipped };
}

// Pretty, sorted keys, stable bytes.
export function serializeLinkDataset(dataset: LinkDataset): string {
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
