// Builds the Rules block of a Market and the matching extras. There is one rules fingerprint,
// rules-v2 (sdk/rules.ts): what a link leg pins, what pm_verify_link recomputes and what the dApp's
// venue readers show. It hashes the venue's rule-bearing fields in a fixed order. When the rules cannot be hashed (a required
// field is missing, the text is empty) the sha256 slot holds a sentinel that is not hex and
// embeds the market id, so two markets with unavailable rules can never compare equal.

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
  };
}
