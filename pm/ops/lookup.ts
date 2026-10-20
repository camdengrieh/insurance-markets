// pm_lookup_links as a pure function over the injected link bundle (offline).
//
// Wraps pm/links/lookup.ts: approved links, indicative candidates and withdrawn records for one
// market, each with state, tier cap, basis, divergence axes, pinned hashes and reviewer date.
// What this layer adds:
//   - strict input validation and an explicit failure when the dataset did not validate (an
//     unreadable dataset is "unknown", never "no links");
//   - every item carries `displayTier`, which is never above its tier cap and is always
//     `indicative_discrepancy` for candidates and for anything not approved;
//   - the data-terms of every leg's venue, so restricted-terms venues are visibly memory-only;
//   - fixed text that an approved link is a statement about rules, not a trade recommendation.
//
// Free text from link records (quotes, evidence, reasons) stays inside the UntrustedContent slots
// produced by pm/links/lookup.ts and only appears when `detail` is true.

import * as z from "zod/v4";
import { UNTRUSTED_DATA_NOTICE } from "../../src/guardrails/untrusted.js";
import { lookupLinks, type LookupItem, type LookupResult } from "../links/lookup.js";
import type { Bundle } from "../links/bundle.js";
import type { ClassGates } from "../links/tier.js";
import type { Tier } from "../links/schema.js";
import type { Outcome } from "../links/store.js";
import { VENUE_IDS } from "../types.js";
import {
  dataTermsOf,
  failure,
  marketIdText,
  normaliseMarketId,
  type DataTerms,
  type OpsContext,
  type OpsFailure,
} from "./quote.js";

export const lookupInputSchema = z.strictObject({
  venue: z.enum(VENUE_IDS),
  market_id: marketIdText,
  include_candidates: z.boolean().optional(),
  detail: z.boolean().optional(),
});
export type LookupInput = z.infer<typeof lookupInputSchema>;

export interface LookupOpContext extends Pick<OpsContext, "nowMs" | "platform"> {
  // Class gates from a gold-set evaluation. Absent = nothing has passed, everything is indicative.
  readonly gates?: ClassGates;
}

export interface OpsLookupItem extends LookupItem {
  // The most this item may be presented as. Candidates and unapproved records are always
  // indicative; an approved record is capped by its tier cap.
  readonly displayTier: Tier;
  readonly indicative: boolean;
  readonly legTerms: readonly { readonly venue: string; readonly terms: DataTerms }[];
}

export interface OpsLookupResult {
  readonly query: LookupResult["query"];
  readonly bundle: LookupResult["bundle"];
  readonly approved: readonly OpsLookupItem[];
  readonly candidates: readonly OpsLookupItem[];
  readonly withdrawn: readonly OpsLookupItem[];
  readonly truncated: boolean;
  readonly notes: readonly string[];
  readonly readOnly: true;
  readonly guaranteedProfitClaimed: false;
  readonly untrustedNotice: string;
}

export type LookupOpOutcome = { readonly ok: true; readonly value: OpsLookupResult } | OpsFailure;

const TIER_RANK: Readonly<Record<Tier, number>> = {
  indicative_discrepancy: 0,
  structural_violation: 1,
  hedged_discrepancy: 2,
};

function decorate(item: LookupItem, ctx: LookupOpContext): OpsLookupItem {
  const approved = item.label === "approved";
  // effectiveTierCap is already min(stored cap, structure, time, gates); a non-approved item is
  // forced to indicative again here so a future change in the lower layer cannot raise it.
  const displayTier: Tier = approved ? item.effectiveTierCap : "indicative_discrepancy";
  const termsCtx: OpsContext = { nowMs: ctx.nowMs, adapter: () => undefined, ...(ctx.platform === undefined ? {} : { platform: ctx.platform }) };
  const legTerms: { venue: string; terms: DataTerms }[] = [];
  for (const leg of item.legs) {
    if (!legTerms.some((t) => t.venue === leg.venue)) legTerms.push({ venue: leg.venue, terms: dataTermsOf(termsCtx, leg.venue) });
  }
  return { ...item, displayTier, indicative: TIER_RANK[displayTier] === 0, legTerms };
}

export function lookupLinksOp(
  rawInput: unknown,
  dataset: Outcome<Bundle> | Bundle,
  ctx: LookupOpContext,
): LookupOpOutcome {
  const parsed = lookupInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("BAD_INPUT", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  const input = parsed.data;
  const resolved: Outcome<Bundle> = "format" in dataset ? { ok: true, value: dataset } : dataset;
  if (!resolved.ok) return failure("DATASET_UNAVAILABLE", "the link dataset failed validation, so link coverage is unknown");

  const looked = lookupLinks(
    resolved.value,
    {
      venue: input.venue,
      marketId: normaliseMarketId(input.market_id),
      ...(input.include_candidates === undefined ? {} : { includeCandidates: input.include_candidates }),
      ...(input.detail === undefined ? {} : { detail: input.detail }),
    },
    { now: new Date(ctx.nowMs), ...(ctx.gates === undefined ? {} : { gates: ctx.gates }) },
  );
  if (!looked.ok) return failure("BAD_INPUT", looked.detail);
  const r = looked.value;

  const notes = [...r.notes];
  if (r.bundle.counts.approved === 0) {
    notes.push("The dataset contains no approved links at all. An empty result means nothing has been reviewed yet, not that markets are unrelated.");
  }
  notes.push(
    "An approved link states that two markets were judged to relate in a stated way under pinned rule text. It is not a trade recommendation and no tool here claims guaranteed profit.",
  );

  return {
    ok: true,
    value: {
      query: r.query,
      bundle: r.bundle,
      approved: r.approved.map((i) => decorate(i, ctx)),
      candidates: r.candidates.map((i) => decorate(i, ctx)),
      withdrawn: r.withdrawn.map((i) => decorate(i, ctx)),
      truncated: r.truncated,
      notes,
      readOnly: true,
      guaranteedProfitClaimed: false,
      untrustedNotice: UNTRUSTED_DATA_NOTICE,
    },
  };
}
