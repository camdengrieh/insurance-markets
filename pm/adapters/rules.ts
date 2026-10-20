// Builds the Rules block of a Market and the matching extras. Two hashes exist in pm/:
//
//   rules-v2 (pm/links/hash.ts)   what a link leg pins and pm_verify_link recomputes. It hashes
//                                  the venue's rule-bearing fields in a fixed order.
//   pm/core rulesSha256            NFKC + whitespace collapse over one display text.
//
// Market.rules.sha256 carries the rules-v2 value, because that is what the registry pins. The
// pm/core value is kept in extras.coreRulesSha256. When the rules cannot be hashed (a required
// field is missing, the text is empty) the sha256 slot holds a sentinel that is not hex and
// embeds the market id, so two markets with unavailable rules can never compare equal.

import { rulesSha256 as coreRulesSha256 } from "../core/rules-hash.js";
import { canonicalizeRecord, isRuleVenue } from "../links/hash.js";
import type { ResolutionMechanism, Rules, VoidPolicy } from "../types.js";
import { untrusted } from "../types.js";
import type { MarketExtras, RuleFields } from "./types.js";

export interface RulesInput {
  readonly venue: string;
  readonly marketId: string;
  // Text shown to the user (fixed slot "untrusted"): the venue's own rule prose.
  readonly displayText: string;
  readonly ruleFields: RuleFields;
  readonly sources: readonly string[];
  readonly mechanism: ResolutionMechanism;
  readonly resolver?: string;
  readonly cutoffUtc?: string;
  readonly windowStartUtc?: string;
  readonly void: VoidPolicy;
  readonly canCloseEarly?: boolean;
  // Set when the adapter's source read was lossy for a rule-bearing field (cut, capped or dropped
  // text). A hash over partial text would pin something other than the rules, so nothing is hashed.
  readonly unhashable?: string;
}

export interface BuiltRules {
  readonly rules: Rules;
  readonly hashed: boolean;
  readonly hashProblem: string | null;
  readonly rulesHashRecipe: MarketExtras["rulesHashRecipe"];
  readonly coreRulesSha256: string;
}

export function buildRules(input: RulesInput): BuiltRules {
  let sha256 = `unavailable:${input.venue}:${input.marketId}`;
  let hashed = false;
  let hashProblem: string | null = null;
  if (input.unhashable !== undefined) {
    hashProblem = `rules not hashable (${input.unhashable})`;
  } else if (!isRuleVenue(input.venue)) {
    hashProblem = "no hash recipe for this venue";
  } else {
    const result = canonicalizeRecord(input.venue, input.ruleFields as Readonly<Record<string, unknown>>);
    if (result.ok) {
      sha256 = result.value.rulesSha256;
      hashed = true;
    } else {
      hashProblem = `rules not hashable (${result.error}${result.detail === undefined ? "" : `: ${result.detail}`})`;
    }
  }
  const rules: Rules = {
    text: untrusted(input.displayText),
    sha256,
    sources: input.sources,
    mechanism: input.mechanism,
    ...(input.resolver === undefined ? {} : { resolver: input.resolver }),
    ...(input.cutoffUtc === undefined ? {} : { cutoffUtc: input.cutoffUtc }),
    ...(input.windowStartUtc === undefined ? {} : { windowStartUtc: input.windowStartUtc }),
    void: input.void,
    ...(input.canCloseEarly === undefined ? {} : { canCloseEarly: input.canCloseEarly }),
  };
  return {
    rules,
    hashed,
    hashProblem,
    rulesHashRecipe: hashed ? "rules-v2" : null,
    coreRulesSha256: coreRulesSha256(input.displayText),
  };
}
