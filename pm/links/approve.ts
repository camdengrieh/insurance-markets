// The approval function lives in the SDK (sdk/links/approve.ts), bound here to the platform
// registry's terms (schema.ts registryTerms). Only the CLI (cli.ts) imports this module; approval is
// a human command. pm/test/links/no-auto-promotion.test.ts keeps it that way.

import * as sdk from "../../sdk/links/approve.js";
import { registryTerms, type Link } from "./schema.js";
import type { Outcome, Registry } from "./store.js";

export * from "../../sdk/links/approve.js";

export function approveLink(reg: Registry, linkId: string, human: sdk.HumanApproval, ctx: { today: string }): Outcome<{ registry: Registry; link: Link; finalised: boolean }> {
  return sdk.approveLink(reg, linkId, human, ctx, registryTerms);
}
