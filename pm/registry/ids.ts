// Identifiers shared between the platform registry and pm-core's fee models.
//
// Registry ids are the keys of docs/platform-registry-design.md (our ids, never a vendor id).
// The adapter-level `VenueId` in pm/types.ts is a different, narrower union owned by the scaffold;
// `adapterVenueId` on each record maps one to the other and is null where no VenueId exists yet.

import type { FeeModelId, FeeSpecId } from "../types.js";

export const REGISTRY_VENUE_IDS = [
  "xo",
  "polymarket",
  "kalshi",
  "trueo",
  "limitless",
  "pascal",
  "sxbet",
  "hyperliquid",
  "manifold",
  "prophetx",
  "gemini",
  "og",
  "novig",
  "udx",
] as const;
export type RegistryVenueId = (typeof REGISTRY_VENUE_IDS)[number];

export function isRegistryVenueId(value: unknown): value is RegistryVenueId {
  return typeof value === "string" && (REGISTRY_VENUE_IDS as readonly string[]).includes(value);
}

// Constants for the model ids in pm/types.ts `FeeModelId`. The `satisfies` plus the exhaustive
// check below fail the typecheck if the union gains or loses a member.
export const FEE_MODEL_IDS = [
  "curve_pq",
  "curve_min",
  "ad_valorem_bps",
  "profit_pct",
  "amm_stack",
  "unknown",
] as const satisfies readonly FeeModelId[];

type MissingFeeModel = Exclude<FeeModelId, (typeof FEE_MODEL_IDS)[number]>;
const _feeModelsExhaustive: MissingFeeModel extends never ? true : never = true;
void _feeModelsExhaustive;

export function isFeeModelId(value: unknown): value is FeeModelId {
  return typeof value === "string" && (FEE_MODEL_IDS as readonly string[]).includes(value);
}

const FEE_SPEC_ID_RE = /^[a-z0-9]+:[a-z_]+$/;

// A FeeSpecId is `${venue}:${modelId}` (for example "xo:curve_pq"). Unknown models use
// `${venue}:unknown` and fail closed.
export function feeSpecId(venue: RegistryVenueId, model: FeeModelId): FeeSpecId {
  return `${venue}:${model}`;
}

export function isFeeSpecId(value: unknown): value is FeeSpecId {
  if (typeof value !== "string" || !FEE_SPEC_ID_RE.test(value)) return false;
  const [venue, model] = value.split(":");
  return isRegistryVenueId(venue) && isFeeModelId(model);
}

// The model each venue is recorded with. Kept here (not only in the records) so pm-core can
// import the constants without loading the whole registry.
export const FEE_MODEL_BY_VENUE: Readonly<Record<RegistryVenueId, FeeModelId>> = {
  xo: "curve_pq",
  polymarket: "curve_pq",
  kalshi: "curve_pq",
  trueo: "amm_stack",
  limitless: "ad_valorem_bps",
  pascal: "curve_pq",
  sxbet: "profit_pct",
  hyperliquid: "unknown",
  manifold: "unknown",
  prophetx: "profit_pct",
  gemini: "curve_pq",
  og: "curve_pq",
  novig: "curve_pq",
  udx: "curve_pq",
};

export const FEE_SPEC_IDS: Readonly<Record<RegistryVenueId, FeeSpecId>> = Object.freeze(
  Object.fromEntries(
    REGISTRY_VENUE_IDS.map((id) => [id, feeSpecId(id, FEE_MODEL_BY_VENUE[id])]),
  ) as Record<RegistryVenueId, FeeSpecId>,
);
