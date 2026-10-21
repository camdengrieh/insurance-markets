// Loading the bundled link dataset, and the lookups over it.
//
// The page ships no dataset today: no human-approved link set exists ([ML] and [AD] are design only). A build that
// has `src/features/signals/data/links.json` bundles it; a build without one answers "absent" and every screen says
// "no links". A file that is present but invalid, or whose content hash does not match, is REJECTED (never
// partially used), and the screen says that too.

import { sha256, toBytes } from "viem";

import { RULES_HASH_RECIPE } from "@sdk/rules";

import type { VenueId } from "../../../core/ports";
import { linkDatasetSchema, type Link, type LinkDataset, type LinkLeg, type LinkProof, type LinkState } from "./schema";

export type DatasetRejection = "not_an_object" | "schema" | "hash_mismatch";

export type LinkLoad =
  | { readonly state: "absent" }
  | { readonly state: "loaded"; readonly dataset: LinkDataset }
  | { readonly state: "rejected"; readonly reason: DatasetRejection };

export const NO_LINK_DATASET: LinkLoad = Object.freeze({ state: "absent" as const });

// JSON with object keys sorted at every level, so the same content always hashes the same way.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function contentHash(parts: { readonly schemaVersion: 1; readonly release: string; readonly links: readonly Link[] }): string {
  const text = canonicalJson({ schemaVersion: parts.schemaVersion, release: parts.release, links: parts.links });
  return sha256(toBytes(text)).slice(2);
}

// For the offline compile step that publishes links.json: adds the pin. The page never calls it on data it loads.
export function pinDataset(parts: { readonly schemaVersion: 1; readonly release: string; readonly links: readonly Link[] }): LinkDataset {
  return { schemaVersion: parts.schemaVersion, release: parts.release, links: [...parts.links], contentSha256: contentHash(parts) };
}

export function parseLinkDataset(raw: unknown): LinkLoad {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { state: "rejected", reason: "not_an_object" };
  const parsed = linkDatasetSchema.safeParse(raw);
  if (!parsed.success) return { state: "rejected", reason: "schema" };
  if (contentHash(parsed.data) !== parsed.data.contentSha256) return { state: "rejected", reason: "hash_mismatch" };
  return { state: "loaded", dataset: parsed.data };
}

// Vite replaces this with the bundled module when the file exists and with an empty record when it does not.
const bundled = import.meta.glob<unknown>("./data/links.json", { import: "default" });

export type DatasetLoaders = Readonly<Record<string, () => Promise<unknown>>>;

export async function loadBundledLinks(loaders: DatasetLoaders = bundled): Promise<LinkLoad> {
  const load = Object.values(loaders)[0];
  if (load === undefined) return NO_LINK_DATASET;
  try {
    return parseLinkDataset(await load());
  } catch {
    return { state: "rejected", reason: "schema" };
  }
}

// ---- what the default view may show ---------------------------------------------------------------------------------

// P1 (slot-equal) and P3 (LLM-assisted) are candidates only: never in the default view, never proof (research 26 9.2).
const DEFAULT_VIEW_PROOFS: readonly LinkProof[] = ["P0_native", "P2_template", "P4_human"];
const DEFAULT_VIEW_STATES: readonly LinkState[] = ["template_approved", "human_approved", "executable_eligible"];

export function showsInDefaultView(link: Link): boolean {
  return DEFAULT_VIEW_PROOFS.includes(link.proof) && DEFAULT_VIEW_STATES.includes(link.state);
}

// A proposal the linker (or a person) wrote into the registry that no person has approved. Shown only in its
// own "proposed, not approved" tier, never as a leg, never with a spread.
export function isProposed(link: Link): boolean {
  return link.state === "proposed";
}

// The recipe behind this page's rules fingerprints: the shared rules-v2 (sdk/rules.ts), the same one the linker
// pins. A dataset whose legs were hashed with any other recipe cannot have its rules compared here: the re-check
// then compares close time and status only and reports the rules as not comparable, never as changed.
export const APP_RULES_RECIPE = RULES_HASH_RECIPE;

export function rulesComparable(dataset: Pick<LinkDataset, "rulesRecipe">): boolean {
  return dataset.rulesRecipe === undefined || dataset.rulesRecipe === APP_RULES_RECIPE;
}

export interface LinkIndex {
  readonly shown: readonly Link[];
  // Links in the dataset that are candidates (or not approved) and so not shown. Proposals count here too;
  // proposedForLeg lists them for their own tier.
  readonly hidden: number;
}

export interface LegMatch {
  readonly venue?: VenueId;
  readonly nativeId?: string;
  readonly quotientKey?: string;
}

function touching(dataset: LinkDataset, match: LegMatch): Link[] {
  const touches = (leg: LinkLeg): boolean =>
    (match.quotientKey !== undefined && leg.quotientKey === match.quotientKey) ||
    (match.venue !== undefined && match.nativeId !== undefined && leg.venue === match.venue && leg.nativeId === match.nativeId);
  return dataset.links.filter((link) => link.legs.some(touches));
}

// Links that name a leg on `venue` with `nativeId`, or a Quotient marketKey.
export function linksForLeg(dataset: LinkDataset, match: LegMatch): LinkIndex {
  const all = touching(dataset, match);
  const shown = all.filter(showsInDefaultView);
  return { shown, hidden: all.length - shown.length };
}

// Proposed (state "proposed") links that name the leg: candidates for a person to review, never proof.
export function proposedForLeg(dataset: LinkDataset, match: LegMatch): readonly Link[] {
  return touching(dataset, match).filter(isProposed);
}

const DAY_MS = 86_400_000;
export const DATASET_STALE_AFTER_DAYS = 30;

export function datasetAge(dataset: LinkDataset, nowMs: number): { readonly days: number | null; readonly stale: boolean } {
  const releasedMs = Date.parse(`${dataset.release}T00:00:00Z`);
  if (!Number.isFinite(releasedMs)) return { days: null, stale: true };
  const days = Math.floor((nowMs - releasedMs) / DAY_MS);
  return { days: Math.max(days, 0), stale: days > DATASET_STALE_AFTER_DAYS || days < 0 };
}
