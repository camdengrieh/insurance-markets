// The working registry lives in the SDK (sdk/links/store.ts); here the functions that validate
// records are bound to the platform registry's terms (schema.ts registryTerms).

import * as sdk from "../../sdk/links/store.js";
import { registryTerms, type Link } from "./schema.js";

export * from "../../sdk/links/store.js";

export function parseRegistry(input: unknown): sdk.Outcome<sdk.Registry> {
  return sdk.parseRegistry(input, registryTerms);
}

export function proposeLink(reg: sdk.Registry, input: unknown, proposer: sdk.Proposer, ctx: { today: string }): sdk.Outcome<{ registry: sdk.Registry; link: Link }> {
  return sdk.proposeLink(reg, input, proposer, ctx, registryTerms);
}
