import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULTS } from "../src/config.js";
import { CREATION_FEE_ATOMIC } from "../src/guardrails/constants.js";
import {
  FIRST_REVIEW,
  SEED_MIN_ATOMIC,
  buildCostQuote,
  buildLimits,
  lintMarketDraft,
  type CostQuote,
  type MarketDraft,
} from "../src/create/lint.js";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const GOOD: MarketDraft = {
  title: "Will Bitcoin's daily closing price on Coinbase be above $150,000 on December 31, 2026?",
  category: "Crypto",
  outcomes: ["Yes", "No"],
  rules:
    "This market resolves Yes if the 1-day candle for BTC-USD on Coinbase Exchange (https://exchange.coinbase.com/markets/BTC-USD) that opens at 2026-12-31T00:00:00Z closes at a price strictly above 150,000 USD. Otherwise the market resolves No. If Coinbase does not publish that candle, or BTC-USD trading is suspended for the whole day, the market is void and positions resolve equally.",
  resolutionSources: ["https://exchange.coinbase.com/markets/BTC-USD"],
  closeDate: "2027-01-01T00:00:00Z",
};

const quoteFor = (draft: Partial<MarketDraft> = {}): CostQuote =>
  lintMarketDraft({ ...GOOD, ...draft }, { nowMs: NOW, config: DEFAULTS }).cost_quote;

const line = (quote: CostQuote, code: string) => {
  const found = quote.lines.find((entry) => entry.code === code);
  assert.ok(found, code);
  return found;
};

// Exact ceiling of a rational, written differently from the module: the smallest integer n with
// n * den >= num.
function smallestAtLeast(num: bigint, den: bigint): bigint {
  let n = num / den;
  while (n * den < num) n += 1n;
  return n;
}

describe("cost quote: the default quote with no seed", () => {
  const quote = quoteFor();

  it("itemises the non-refundable fee in integer micro-USD and flags it as a contract rule", () => {
    const fee = line(quote, "creation_fee");
    assert.equal(fee.kind, "fee");
    assert.equal(fee.micro_usd, "1000000");
    assert.equal(fee.usd, "1");
    assert.equal(fee.enforced_by_contract, true);
    assert.equal(fee.rule_source, "contract");
    assert.equal(fee.assumed, false);
    assert.match(fee.note, /non-refundable|every attempt/i);
    assert.equal(BigInt(fee.micro_usd), CREATION_FEE_ATOMIC);
  });

  it("shows the minimum seed as an assumed XO app rule, not a contract rule", () => {
    const seed = line(quote, "seed_stake");
    assert.equal(seed.kind, "stake");
    assert.equal(seed.micro_usd, "10000000");
    assert.equal(seed.usd, "10");
    assert.equal(seed.assumed, true);
    assert.equal(seed.enforced_by_contract, false);
    assert.equal(seed.rule_source, "xo_app_rule");
    assert.match(seed.note, /not a contract rule/);
    assert.match(seed.note, /5 to 95 cents/);
    assert.equal(BigInt(seed.micro_usd), SEED_MIN_ATOMIC);
  });

  it("adds fee and seed for one attempt", () => {
    assert.equal(quote.unit, "micro-USD");
    assert.equal(quote.one_attempt_total_micro_usd, "11000000");
  });

  it("reports the first-review sample with exact counts and rounded percentages", () => {
    assert.deepEqual(
      { ...quote.first_review_sample, source: undefined },
      {
        reviewed: 571,
        approve: 287,
        update_required: 233,
        reject: 51,
        not_yet_reviewed: 14,
        approve_pct: "50.3",
        update_required_pct: "40.8",
        reject_pct: "8.9",
        source: undefined,
      },
    );
    assert.equal(FIRST_REVIEW.approve + FIRST_REVIEW.updateRequired + FIRST_REVIEW.reject, 571n);
  });

  it("computes expected attempts and fees in exact integer arithmetic", () => {
    const accepted = quote.expected.if_updates_are_accepted;
    const restart = quote.expected.if_every_non_approval_restarts;
    // Only a rejection costs a second fee: 571 / (571 - 51) = 571 / 520 attempts.
    assert.equal(accepted.expected_attempts, "1.099");
    assert.equal(accepted.expected_fees_micro_usd, "1098077");
    assert.equal(accepted.expected_total_with_seed_micro_usd, "11098077");
    // Every non-approval restarts: 571 / 287 attempts.
    assert.equal(restart.expected_attempts, "1.990");
    assert.equal(restart.expected_fees_micro_usd, "1989548");
    assert.equal(restart.expected_total_with_seed_micro_usd, "11989548");
    // The same numbers re-derived independently: n is the smallest integer with n * den >= num.
    assert.equal(smallestAtLeast(1_000_000n * 571n, 520n), 1098077n);
    assert.equal(smallestAtLeast(1_000_000n * 571n, 287n), 1989548n);
    assert.ok(1098076n * 520n < 1_000_000n * 571n && 1098077n * 520n >= 1_000_000n * 571n);
    assert.ok(1989547n * 287n < 1_000_000n * 571n && 1989548n * 287n >= 1_000_000n * 571n);
  });

  it("states the two assumptions and the limits of the sample", () => {
    assert.match(quote.expected.if_updates_are_accepted.assumption, /rejection costs a new fee/);
    assert.match(quote.expected.if_every_non_approval_restarts.assumption, /created again/);
    const notes = quote.notes.join("\n");
    assert.match(notes, /per attempt, not per live market/);
    assert.match(notes, /41%/);
    assert.match(notes, /9%/);
    assert.match(notes, /Gas is not included/);
    assert.match(notes, /rounded up/);
  });

  it("never rounds a budget figure down", () => {
    const accepted = BigInt(quote.expected.if_updates_are_accepted.expected_fees_micro_usd);
    assert.ok(accepted * 520n >= 1_000_000n * 571n);
    // The displayed attempts (three decimals, rounded up) also cover the exact ratio 571 / 520.
    const shown = BigInt(quote.expected.if_updates_are_accepted.expected_attempts.replace(".", ""));
    assert.ok(shown * 520n >= 571n * 1000n);
    assert.ok((shown - 1n) * 520n < 571n * 1000n);
  });
});

describe("cost quote: with a seed in the draft", () => {
  it("uses the given seed and marks it as not assumed", () => {
    const quote = quoteFor({ seedPrice: "0.55", seedSizeUsd: "25.5" });
    const seed = line(quote, "seed_stake");
    assert.equal(seed.micro_usd, "25500000");
    assert.equal(seed.usd, "25.5");
    assert.equal(seed.assumed, false);
    assert.equal(quote.one_attempt_total_micro_usd, "26500000");
    assert.equal(quote.expected.if_updates_are_accepted.expected_total_with_seed_micro_usd, "26598077");
    assert.equal(quote.expected.if_every_non_approval_restarts.expected_total_with_seed_micro_usd, "27489548");
  });

  it("keeps micro-dollar precision on the smallest allowed step above the minimum", () => {
    const quote = quoteFor({ seedSizeUsd: "10.000001" });
    assert.equal(line(quote, "seed_stake").micro_usd, "10000001");
    assert.equal(quote.one_attempt_total_micro_usd, "11000001");
  });

  it("stays exact beyond the range where floating point loses integers", () => {
    const quote = buildCostQuote(123456789012345678123456n, false);
    assert.equal(line(quote, "seed_stake").micro_usd, "123456789012345678123456");
    assert.equal(quote.one_attempt_total_micro_usd, "123456789012345679123456");
    assert.equal(quote.expected.if_updates_are_accepted.expected_total_with_seed_micro_usd, "123456789012345679221533");
    assert.equal(quote.expected.if_every_non_approval_restarts.expected_total_with_seed_micro_usd, "123456789012345680113004");
    // Through the full path too, with a seed string of that size.
    const viaLint = quoteFor({ seedSizeUsd: "123456789012345678.123456" });
    assert.equal(line(viaLint, "seed_stake").micro_usd, "123456789012345678123456");
  });

  it("falls back to the assumed minimum when the seed is below it or malformed", () => {
    for (const seedSizeUsd of ["9.99", "ten", "-5", "1e3"]) {
      const quote = quoteFor({ seedSizeUsd });
      const seed = line(quote, "seed_stake");
      assert.equal(seed.micro_usd, "10000000", seedSizeUsd);
      assert.equal(seed.assumed, true, seedSizeUsd);
    }
  });

  it("assumes the minimum when only a price is given", () => {
    const seed = line(quoteFor({ seedPrice: "0.40" }), "seed_stake");
    assert.equal(seed.micro_usd, "10000000");
    assert.equal(seed.assumed, true);
  });
});

describe("cost quote: arithmetic invariants", () => {
  it("holds for many seeds, including random large ones", () => {
    let state = 0x2545f491n;
    const next = (): bigint => {
      state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      return state;
    };
    const seeds = [10_000_000n, 10_000_001n, 99_999_999n, 1_000_000_000_000n, 2n ** 80n, ...Array.from({ length: 200 }, () => 10_000_000n + (next() % 1_000_000_000_000_000n))];
    for (const seed of seeds) {
      const quote = buildCostQuote(seed, false);
      const fee = CREATION_FEE_ATOMIC;
      assert.equal(BigInt(quote.one_attempt_total_micro_usd), seed + fee);
      const a = quote.expected.if_updates_are_accepted;
      const b = quote.expected.if_every_non_approval_restarts;
      assert.equal(BigInt(a.expected_fees_micro_usd), 1098077n);
      assert.equal(BigInt(b.expected_fees_micro_usd), 1989548n);
      assert.equal(BigInt(a.expected_total_with_seed_micro_usd), seed + BigInt(a.expected_fees_micro_usd));
      assert.equal(BigInt(b.expected_total_with_seed_micro_usd), seed + BigInt(b.expected_fees_micro_usd));
      assert.ok(BigInt(b.expected_fees_micro_usd) >= BigInt(a.expected_fees_micro_usd));
      assert.ok(BigInt(a.expected_fees_micro_usd) >= fee);
    }
  });

  it("emits only integer strings for micro-USD and plain decimals for display", () => {
    const quote = quoteFor({ seedSizeUsd: "12.345678" });
    const micro = [
      ...quote.lines.map((entry) => entry.micro_usd),
      quote.one_attempt_total_micro_usd,
      quote.expected.if_updates_are_accepted.expected_fees_micro_usd,
      quote.expected.if_updates_are_accepted.expected_total_with_seed_micro_usd,
      quote.expected.if_every_non_approval_restarts.expected_fees_micro_usd,
      quote.expected.if_every_non_approval_restarts.expected_total_with_seed_micro_usd,
    ];
    for (const value of micro) assert.match(value, /^[1-9][0-9]*$/);
    for (const entry of quote.lines) assert.match(entry.usd, /^[0-9]+(?:\.[0-9]{1,6})?$/);
    assert.equal(line(quote, "seed_stake").usd, "12.345678");
    assert.ok(!JSON.stringify(quote).includes("e+"));
  });

  it("does not change when the draft's text changes", () => {
    const a = quoteFor();
    const b = quoteFor({ title: "", rules: "", category: "", resolutionSources: [] });
    assert.deepEqual(a, b);
  });
});

describe("creation limit note", () => {
  it("shows XO's written weekly limit and says the plugin sets no cadence cap of its own", () => {
    const limits = lintMarketDraft(GOOD, { nowMs: NOW, config: DEFAULTS }).limits;
    assert.equal(limits.tos.max_markets_per_calendar_week, 1);
    assert.equal(limits.tos.catalyst_badge_required, true);
    assert.equal(limits.tos.admin_review_required, true);
    assert.match(limits.tos.badge_requirements, /500 Conviction Points/);
    assert.equal(limits.tos.contract_enforces_limit, false);
    assert.equal(limits.configured.plugin_cadence_cap, "none");
    assert.equal(limits.configured.creation_enabled, false);
    assert.match(limits.comparison, /1 market per calendar week/);
    assert.match(limits.comparison, /no creation cadence limit of its own/);
    assert.match(limits.comparison, /daily USD cap/);
  });

  it("has no per-day setting any more: nothing in the limits note counts markets per day", () => {
    const limits = lintMarketDraft(GOOD, { nowMs: NOW, config: DEFAULTS }).limits;
    assert.deepEqual(Object.keys(limits.configured).sort(), ["creation_enabled", "plugin_cadence_cap"]);
    assert.ok(!/per day|per week|ceiling/i.test(limits.comparison.replace("per calendar week", "")));
  });

  it("makes no claim of permission", () => {
    const limits = buildLimits(DEFAULTS);
    assert.match(limits.permission, /makes no claim/);
    assert.match(limits.permission, /has not given written permission/);
    assert.ok(!/\b(?:is|are) (?:permitted|allowed|approved)\b/i.test(JSON.stringify(limits)));
  });

  it("reflects the operator's creation switch and nothing else", () => {
    assert.equal(buildLimits({ ...DEFAULTS, createEnabled: true }).configured.creation_enabled, true);
    assert.equal(buildLimits({ ...DEFAULTS, createEnabled: false }).configured.creation_enabled, false);
    for (const bad of ["yes", 1, undefined, null]) {
      const limits = buildLimits({ ...DEFAULTS, createEnabled: bad as unknown as boolean });
      assert.equal(limits.configured.creation_enabled, false, String(bad));
    }
  });

  it("is part of every result, whatever the draft", () => {
    const result = lintMarketDraft({} as MarketDraft, { nowMs: NOW, config: DEFAULTS });
    assert.equal(result.limits.tos.max_markets_per_calendar_week, 1);
    assert.equal(result.limits.configured.plugin_cadence_cap, "none");
  });
});

describe("duplicate check pointer", () => {
  it("is always not_run and points at xo_search", () => {
    for (const draft of [GOOD, { ...GOOD, title: "Will Bitcoin close above $150,000 next week?" }, {} as MarketDraft]) {
      const result = lintMarketDraft(draft, { nowMs: NOW, config: DEFAULTS });
      assert.equal(result.duplicate_check, "not_run");
      assert.match(result.duplicate_check_note, /xo_search/);
      assert.match(result.duplicate_check_note, /no network request/);
    }
  });
});
