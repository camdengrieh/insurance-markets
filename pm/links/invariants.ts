// Cross-field record rules live in the SDK (sdk/links/invariants.ts); here they are bound to the
// platform registry's terms (schema.ts registryTerms).

import * as sdk from "../../sdk/links/invariants.js";
import { registryTerms, type Link } from "./schema.js";

export * from "../../sdk/links/invariants.js";

type Shape = Parameters<typeof sdk.contentErrors>[0];

export function contentErrors(link: Shape): string[] {
  return sdk.contentErrors(link, registryTerms);
}

export function candidateErrors(candidate: Shape): string[] {
  return sdk.candidateErrors(candidate, registryTerms);
}

export function linkErrors(link: Link): string[] {
  return sdk.linkErrors(link, registryTerms);
}
