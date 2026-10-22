// The hash-pinned bundle lives in the SDK (sdk/links/bundle.ts); here building and loading are
// bound to the platform registry's terms (schema.ts registryTerms).

import * as sdk from "../../sdk/links/bundle.js";
import { registryTerms } from "./schema.js";
import type { Outcome, Registry } from "./store.js";

export * from "../../sdk/links/bundle.js";

export function validateBundle(input: string | unknown, options: sdk.LoadOptions = {}): Outcome<sdk.Bundle> {
  return sdk.validateBundle(input, options, registryTerms);
}

export function buildBundle(reg: Registry, options: sdk.BuildOptions): Outcome<sdk.Bundle> {
  return sdk.buildBundle(reg, options, registryTerms);
}
