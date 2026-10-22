// The dApp's dataset from a pm link bundle. The conversion and the dataset contract live in the SDK
// (sdk/linker/dataset.ts, sdk/links/dataset.ts), where the page parses the same file with the same
// schemas; here the conversion is bound to the platform registry's terms, so restricted-venue legs
// are refused before anything is written.

import { DATASET_RULES_RECIPE, toLinkDataset, type DatasetConversion } from "../../sdk/linker/dataset.js";
import type { Bundle } from "../links/bundle.js";
import { registryTerms } from "../links/schema.js";

export { serializeLinkDataset as serializeAppDataset, type DatasetConversion } from "../../sdk/linker/dataset.js";

export const APP_DATASET_RULES_RECIPE = DATASET_RULES_RECIPE;

export function toAppDataset(bundle: Bundle, options: { readonly release: string; readonly categories?: ReadonlyMap<string, string> }): DatasetConversion {
  return toLinkDataset(bundle, options, registryTerms);
}
