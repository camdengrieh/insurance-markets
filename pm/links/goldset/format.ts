// The gold-set formats live in the SDK (sdk/links/goldset/format.ts); here the gold-set parser is
// bound to the platform registry's terms (../schema.ts registryTerms), which refuse quotes from
// restricted venues.

import * as sdk from "../../../sdk/links/goldset/format.js";
import { registryTerms } from "../schema.js";

export * from "../../../sdk/links/goldset/format.js";

export function parseGoldSet(input: unknown): ReturnType<typeof sdk.parseGoldSet> {
  return sdk.parseGoldSet(input, registryTerms);
}
