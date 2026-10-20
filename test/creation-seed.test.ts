import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CREATION_SEED_CAP_ATOMIC } from "../relay/config.js";
import { SEED_MAX_TTL_S, SEED_MIN_TTL_S } from "../relay/orders.js";
import { SEED_MIN_ATOMIC, SEED_PRICE_MAX_TICKS, SEED_PRICE_MIN_TICKS } from "../src/create/lint.js";
import { POST_ROUTES } from "../src/relay/contract.js";
import { ANVIL_ACCOUNT_0_OWNER, CREATION_FEE_ATOMIC } from "../src/xo/chain/constants.js";
import { SEED_CAP_ATOMIC, SEED_STAKE_ATOMIC, computeOrderAmounts, formatTick, orderCapAmount } from "../src/xo/signing/amounts.js";
import {
  CREATION_ATTEMPT_COST_ATOMIC,
  SEED_FEE_BOUND_BPS,
  SEED_RETRY,
  SEED_TTL_S,
  classifySeedFailure,
  planSeedOrder,
  planSeedRetry,
  resolveSeedTokens,
  seedFitsDay,
  seedOrderRequest,
  seedPriceChoices,
  seedReadiness,
  seededCreationsPerDay,
  type SeedFailure,
  type SeedInput,
  type SeedOrderPlan,
} from "../src/xo/creation/seed.js";
import { seededRandom } from "./fixtures/creation/corpus.js";

const YES = "11111111111111111111";
const NO = "22222222222222222222";
const DAY = 86_400;
const NOW = 1_792_000_000;

const input = (overrides: Partial<SeedInput> = {}): SeedInput => ({ outcome: "yes", yesTokenId: YES, noTokenId: NO, price: "0.5", ...overrides });
function plan(overrides: Partial<SeedInput> = {}): SeedOrderPlan {
  const result = planSeedOrder(input(overrides));
  assert.ok(result.ok, result.ok ? "" : `${result.code}: ${result.message}`);
  if (!result.ok) throw new Error("plan failed");
  return result.plan;
}
function refusal(overrides: Partial<SeedInput> = {}): { code: string; message: string; choices?: readonly string[] } {
  const result = planSeedOrder(input(overrides));
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

describe("the seed constants", () => {
  it("is a 7 to 30 day post-only GTD BUY with a $10.80 cap and a $11.80 cost per seeded creation", () => {
    assert.deepEqual(SEED_TTL_S, { min: 7 * DAY, max: 30 * DAY, default: 7 * DAY });
    assert.equal(SEED_CAP_ATOMIC, 10_800_000n);
    assert.equal(SEED_STAKE_ATOMIC, 10_000_000n);
    assert.equal(SEED_FEE_BOUND_BPS, 800);
    assert.equal(CREATION_ATTEMPT_COST_ATOMIC, 11_800_000n);
    assert.equal(CREATION_FEE_ATOMIC, 1_000_000n);
  });

  it("agrees with the lint's seed bounds and with what the relay enforces", () => {
    assert.equal(SEED_MIN_ATOMIC, 10_000_000n);
    assert.equal(SEED_PRICE_MIN_TICKS, 50);
    assert.equal(SEED_PRICE_MAX_TICKS, 950);
    assert.equal(SEED_TTL_S.min, SEED_MIN_TTL_S);
    assert.equal(SEED_TTL_S.max, SEED_MAX_TTL_S);
    assert.equal(CREATION_SEED_CAP_ATOMIC, SEED_CAP_ATOMIC);
  });
});

describe("which prices land on the grid", () => {
  it("lists the 15 prices where a $10.00 stake is exact", () => {
    assert.deepEqual(seedPriceChoices(), ["0.05", "0.064", "0.08", "0.1", "0.125", "0.128", "0.16", "0.2", "0.25", "0.32", "0.4", "0.5", "0.625", "0.64", "0.8"]);
  });

  it("is the set of ticks that divide the stake, and no others", () => {
    const expected: string[] = [];
    for (let tick = 50; tick <= 950; tick += 1) if (10_000_000 % tick === 0) expected.push(formatTick(tick));
    assert.deepEqual(seedPriceChoices(), expected);
  });

  it("plans every one of them at exactly $10.00, with whole 0.001-share steps, inside the cap", () => {
    for (const price of seedPriceChoices()) {
      const result = plan({ price });
      assert.equal(result.principalAtomic, 10_000_000n, price);
      assert.equal(result.sharesMicro % 1000n, 0n, price);
      assert.equal((result.sharesMicro * BigInt(result.priceTick)) / 1000n, 10_000_000n, price);
      assert.ok(result.capAtomic <= SEED_CAP_ATOMIC, price);
      // An independent recomputation of the order the relay will build.
      const amounts = computeOrderAmounts({ side: 0, price: result.price, shares: result.shares });
      assert.equal(amounts.makerAmount, 10_000_000n);
      assert.equal(amounts.takerAmount, result.sharesMicro);
      assert.equal(orderCapAmount({ side: 0, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, feeBps: 800 }).capAtomic, 10_800_000n);
    }
  });

  it("refuses every other tick between 5 and 95 cents, naming the valid prices", () => {
    const valid = new Set(seedPriceChoices());
    let refused = 0;
    for (let tick = 50; tick <= 950; tick += 1) {
      const price = formatTick(tick);
      if (valid.has(price)) continue;
      const result = refusal({ price });
      assert.equal(result.code, "seed_price_off_grid", price);
      assert.deepEqual(result.choices, seedPriceChoices(), price);
      refused += 1;
    }
    assert.equal(refused, 901 - 15);
  });

  it("never rounds: a refused price is refused whatever the share count would round to", () => {
    const result = refusal({ price: "0.55" });
    assert.equal(result.code, "seed_price_off_grid");
    assert.match(result.message, /never rounded/);
  });
});

describe("planSeedOrder", () => {
  it("builds a post-only GTD BUY seed for the chosen outcome's token", () => {
    const yes = plan();
    assert.deepEqual(
      { outcome: yes.outcome, tokenId: yes.tokenId, side: yes.side, tif: yes.tif, postOnly: yes.postOnly, purpose: yes.purpose, price: yes.price, shares: yes.shares, ttlS: yes.ttlS },
      { outcome: "yes", tokenId: YES, side: "BUY", tif: "GTD", postOnly: true, purpose: "seed", price: "0.5", shares: "20", ttlS: 7 * DAY },
    );
    const no = plan({ outcome: "no", price: "0.25" });
    assert.deepEqual([no.outcome, no.tokenId, no.shares, no.priceTick], ["no", NO, "40", 250]);
    assert.equal(plan({ outcome: " YES " }).tokenId, YES, "the outcome is trimmed and case-folded");
  });

  it("counts toward the daily cap as a seed, with the 1.08 multiplier", () => {
    const result = plan();
    assert.equal(result.ledgerCategory, "seed");
    assert.equal(result.countsTowardDailyCap, true);
    assert.equal(result.feeBoundBps, 800);
    assert.equal(result.capAtomic, 10_800_000n);
    assert.equal(result.principalAtomic, 10_000_000n);
  });

  it("accepts the stake spelled as 10, 10.0 or 10.000000, and nothing but $10.00", () => {
    for (const stakeUsd of ["10", "10.0", "10.000000", "10.00"]) assert.equal(plan({ stakeUsd }).principalAtomic, 10_000_000n, stakeUsd);
  });

  it("uses the price and size shapes the order endpoint takes", () => {
    for (const price of seedPriceChoices()) {
      const body = seedOrderRequest(plan({ price }), ANVIL_ACCOUNT_0_OWNER);
      const parsed = POST_ROUTES["/v1/order/prepare"].request.safeParse(body);
      assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
      assert.deepEqual([body.side, body.tif, body.post_only, body.purpose], ["BUY", "GTD", true, "seed"]);
    }
  });

  it("takes ttl_s from 7 to 30 days", () => {
    for (const ttlS of [7 * DAY, 8 * DAY, 15 * DAY, 30 * DAY]) assert.equal(plan({ ttlS }).ttlS, ttlS);
    assert.equal(seedOrderRequest(plan({ ttlS: 30 * DAY }), ANVIL_ACCOUNT_0_OWNER).ttl_s, 30 * DAY);
  });

  it("warns when the tokens were not checked against the orderbook, and when the seed outlives the market", () => {
    assert.ok(plan().warnings.some((line) => line.includes("Check them against the orderbook")));
    assert.deepEqual(plan({ tokensVerified: true }).warnings, []);
    const outlives = plan({ tokensVerified: true, nowS: NOW, marketExpiresAtS: NOW + 2 * DAY });
    assert.ok(outlives.warnings.some((line) => line.includes("outlives the market")));
    assert.deepEqual(plan({ tokensVerified: true, nowS: NOW, marketExpiresAtS: NOW + 40 * DAY }).warnings, []);
  });

  it("is deterministic and does not modify its input", () => {
    const original = input();
    const frozen = Object.freeze({ ...original });
    assert.deepEqual(planSeedOrder(frozen), planSeedOrder(original));
  });
});

describe("planSeedOrder: every refusal", () => {
  it("refuses an outcome that is not yes or no", () => {
    for (const outcome of ["maybe", "", "  ", "yess", "0", 5 as unknown as string, null as unknown as string, undefined as unknown as string]) {
      assert.equal(refusal({ outcome }).code, "seed_outcome_invalid", String(outcome));
    }
  });

  it("refuses token ids that are not decimal, are zero, or are the same", () => {
    for (const yesTokenId of ["", "abc", "0x12", "-1", "1.5", "01", "1".repeat(79), 7 as unknown as string]) {
      assert.equal(refusal({ yesTokenId }).code, "seed_token_invalid", String(yesTokenId));
    }
    assert.equal(refusal({ yesTokenId: "0" }).code, "seed_token_invalid");
    assert.equal(refusal({ outcome: "no", noTokenId: "abc" }).code, "seed_token_invalid");
    assert.equal(refusal({ yesTokenId: YES, noTokenId: YES }).code, "seed_token_invalid");
    // A bad token on the side not being backed still stops the plan only if it is the chosen one or equal.
    assert.equal(planSeedOrder(input({ noTokenId: "abc" })).ok, true);
  });

  it("refuses a price that is not a price", () => {
    for (const price of ["abc", "", "1", "1.5", "0", "0.0", "0.0005", ".5", "5e-1", "0.5 ", "-0.5", "0x10", 0.5 as unknown as string]) {
      assert.equal(refusal({ price }).code, "seed_price_invalid", String(price));
    }
  });

  it("refuses a price outside 5 to 95 cents", () => {
    for (const price of ["0.001", "0.04", "0.049", "0.951", "0.96", "0.999"]) assert.equal(refusal({ price }).code, "seed_price_out_of_range", price);
    // The edges: 0.05 is on the grid; 0.95 is in range but off the grid.
    assert.equal(planSeedOrder(input({ price: "0.05" })).ok, true);
    assert.equal(refusal({ price: "0.95" }).code, "seed_price_off_grid");
  });

  it("refuses a stake that is not an amount", () => {
    for (const stakeUsd of ["abc", "", "-10", "0", "1e1", "10,0", "10.0000001", " 10"]) assert.equal(refusal({ stakeUsd }).code, "seed_stake_invalid", JSON.stringify(stakeUsd));
  });

  it("refuses a stake under XO's $10 minimum", () => {
    for (const stakeUsd of ["9.99", "9.999999", "5", "0.000001", "1"]) assert.equal(refusal({ stakeUsd }).code, "seed_below_minimum", stakeUsd);
  });

  it("refuses a stake that the $10.80 cap cannot hold once the 1.08 multiplier is counted", () => {
    for (const stakeUsd of ["10.000001", "10.01", "11", "12", "50", "100"]) {
      const result = refusal({ stakeUsd });
      assert.equal(result.code, "seed_exceeds_cap", stakeUsd);
      assert.match(result.message, /exactly \$10\.00/);
    }
  });

  it("refuses a life shorter than 7 days or longer than 30", () => {
    for (const ttlS of [0, 1, 7 * DAY - 1, 30 * DAY + 1, 365 * DAY, -DAY, 7.5 * DAY + 0.5, Number.NaN, Number.POSITIVE_INFINITY, "604800" as unknown as number]) {
      assert.equal(refusal({ ttlS }).code, "seed_ttl_invalid", String(ttlS));
    }
  });

  it("returns a refusal, not an exception, for any garbage", () => {
    const garbage = [{}, { outcome: "yes" }, { ...input(), price: {} }, { ...input(), stakeUsd: [] }, { ...input(), ttlS: {} }];
    for (const value of garbage) assert.doesNotThrow(() => planSeedOrder(value as unknown as SeedInput));
  });
});

describe("resolveSeedTokens", () => {
  it("accepts the creation log's tokens as unverified when the orderbook is not at hand", () => {
    assert.deepEqual(resolveSeedTokens({ eventYesTokenId: YES, eventNoTokenId: NO }), { ok: true, yesTokenId: YES, noTokenId: NO, verified: false });
  });

  it("verifies them when the orderbook lists the same ids in the same order", () => {
    const result = resolveSeedTokens({ eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [{ token_id: YES }, { token_id: NO }] });
    assert.deepEqual(result, { ok: true, yesTokenId: YES, noTokenId: NO, verified: true });
  });

  it("refuses when the orderbook has them in the other order: which one is Yes is unclear", () => {
    const result = resolveSeedTokens({ eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [{ token_id: NO }, { token_id: YES }] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "seed_token_mismatch");
  });

  it("refuses different ids, the wrong count, and malformed or repeated ids", () => {
    const cases: Parameters<typeof resolveSeedTokens>[0][] = [
      { eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [{ token_id: YES }, { token_id: "33" }] },
      { eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [{ token_id: YES }] },
      { eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [{ token_id: YES }, { token_id: NO }, { token_id: "3" }] },
      { eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [] },
      { eventYesTokenId: "abc", eventNoTokenId: NO },
      { eventYesTokenId: YES, eventNoTokenId: YES },
    ];
    for (const value of cases) assert.equal(resolveSeedTokens(value).ok, false, JSON.stringify(value));
  });

  it("lets a verified result drop the warning from the plan", () => {
    const tokens = resolveSeedTokens({ eventYesTokenId: YES, eventNoTokenId: NO, orderbookTokens: [{ token_id: YES }, { token_id: NO }] });
    assert.ok(tokens.ok);
    if (!tokens.ok) return;
    assert.deepEqual(plan({ tokensVerified: tokens.verified }).warnings, []);
  });
});

describe("seedReadiness: only after the market is active", () => {
  it("is ready only when the review loop says active and the orderbook says active", () => {
    assert.deepEqual(seedReadiness({ phase: "active", orderbookActive: true }), { ready: true });
    assert.deepEqual(seedReadiness({ phase: "active", orderbookActive: false }), { ready: false, reason: "orderbook_not_active" });
    assert.deepEqual(seedReadiness({ phase: "active", orderbookActive: null }), { ready: false, reason: "orderbook_unknown" });
  });

  it("is never ready in any other phase, whatever the orderbook says", () => {
    for (const phase of ["pending", "update_required", "update_window_lapsed", "rejected", "declined", "cancelled", "paused", "resolved", "closed", "voided"] as const) {
      for (const orderbookActive of [true, false, null]) {
        assert.deepEqual(seedReadiness({ phase, orderbookActive }), { ready: false, reason: "market_not_active" }, `${phase} ${String(orderbookActive)}`);
      }
    }
  });
});

describe("retry on 422 'market is not active'", () => {
  const notActive: SeedFailure = { status: 422, text: "market is not active (status: Pending)" };
  const plain = (attempts: number, elapsedS: number, failure: SeedFailure) => planSeedRetry({ attempts, firstAttemptAtS: NOW, nowS: NOW + elapsedS, failure });

  it("classifies the failures", () => {
    assert.equal(classifySeedFailure(notActive), "not_active");
    assert.equal(classifySeedFailure({ status: 422, text: '{"error":"Market is not active (status: Pending)"}' }), "not_active");
    assert.equal(classifySeedFailure({ text: "market is not active" }), "not_active");
    assert.equal(classifySeedFailure({ code: "ambiguous" }), "ambiguous");
    assert.equal(classifySeedFailure({ status: 429 }), "rate_limited");
    assert.equal(classifySeedFailure({ code: "rate_limited" }), "rate_limited");
    assert.equal(classifySeedFailure({ status: 400, text: "invalid tick size" }), "rejected");
    assert.equal(classifySeedFailure({ code: "upstream_rejected" }), "rejected");
    assert.equal(classifySeedFailure({ status: 422, text: "something else" }), "rejected");
    assert.equal(classifySeedFailure({ status: 500 }), "other");
    assert.equal(classifySeedFailure({}), "other");
    assert.equal(classifySeedFailure({ status: 422 }), "other");
  });

  it("waits 15, 30, 60, 120, 240 then 300 seconds and gives up after 8 attempts", () => {
    assert.deepEqual([...SEED_RETRY.delaysS], [15, 30, 60, 120, 240, 300]);
    let elapsed = 0;
    const delays: number[] = [];
    for (let attempts = 1; attempts < SEED_RETRY.maxAttempts; attempts += 1) {
      const next = plain(attempts, elapsed, notActive);
      assert.equal(next.action, "retry", `attempt ${attempts}`);
      if (next.action !== "retry") return;
      assert.equal(next.attempt, attempts + 1);
      assert.equal(next.notBeforeS, NOW + elapsed + next.delayS);
      delays.push(next.delayS);
      elapsed += next.delayS;
    }
    assert.deepEqual(delays, [15, 30, 60, 120, 240, 300, 300]);
    assert.equal(elapsed, 1065);
    assert.deepEqual(plain(SEED_RETRY.maxAttempts, elapsed, notActive), { action: "stop", reason: "attempts_exhausted" });
  });

  it("gives up after half an hour with 'still not active'", () => {
    assert.equal(plain(2, SEED_RETRY.maxTotalS - 1, notActive).action, "retry");
    assert.deepEqual(plain(2, SEED_RETRY.maxTotalS, notActive), { action: "stop", reason: "still_not_active" });
    assert.deepEqual(plain(2, 10 * 3600, notActive), { action: "stop", reason: "still_not_active" });
  });

  it("reconciles an ambiguous result and never retries it, whatever the attempt count or the clock", () => {
    for (const attempts of [1, 2, 7, 8, 100, 0, -1, Number.NaN]) {
      for (const elapsed of [0, 100, SEED_RETRY.maxTotalS, 10 * 3600]) {
        assert.deepEqual(plain(attempts, elapsed, { code: "ambiguous" }), { action: "reconcile" });
        assert.deepEqual(plain(attempts, elapsed, { code: "ambiguous", status: 422, text: "market is not active" }), { action: "reconcile" });
      }
    }
  });

  it("waits at least as long as a rate limit asks, within an hour", () => {
    const limited = plain(1, 0, { status: 429, retryAfterS: 90 });
    assert.deepEqual(limited.action === "retry" ? limited.delayS : null, 90);
    const huge = plain(1, 0, { status: 429, retryAfterS: 1e9 });
    assert.deepEqual(huge.action === "retry" ? huge.delayS : null, 3600);
    const small = plain(3, 0, { status: 429, retryAfterS: 1 });
    assert.deepEqual(small.action === "retry" ? small.delayS : null, 60);
    const nonsense = plain(1, 0, { status: 429, retryAfterS: Number.NaN });
    assert.deepEqual(nonsense.action === "retry" ? nonsense.delayS : null, 15);
  });

  it("stops on a rejection or anything it does not understand", () => {
    assert.deepEqual(plain(1, 0, { status: 400, text: "invalid tick size" }), { action: "stop", reason: "rejected" });
    assert.deepEqual(plain(1, 0, { code: "upstream_rejected" }), { action: "stop", reason: "rejected" });
    assert.deepEqual(plain(1, 0, { status: 500 }), { action: "stop", reason: "unknown_failure" });
    assert.deepEqual(plain(1, 0, {}), { action: "stop", reason: "unknown_failure" });
  });

  it("treats a bad attempt count as exhausted rather than retrying forever", () => {
    for (const attempts of [0, -1, 1.5, Number.NaN]) assert.deepEqual(plain(attempts, 0, notActive), { action: "stop", reason: "attempts_exhausted" });
  });

  it("never plans more than 8 attempts or half an hour of waiting plus one last delay (random failure sequences, fixed seed)", () => {
    const rng = seededRandom(11);
    for (let run = 0; run < 200; run += 1) {
      let attempts = 1;
      let now = NOW;
      let retries = 0;
      for (;;) {
        const failure: SeedFailure = rng() < 0.7 ? notActive : rng() < 0.5 ? { status: 429, retryAfterS: Math.floor(rng() * 400) } : { status: 500 };
        const next = planSeedRetry({ attempts, firstAttemptAtS: NOW, nowS: now, failure });
        if (next.action !== "retry") break;
        retries += 1;
        assert.ok(retries <= SEED_RETRY.maxAttempts);
        assert.ok(next.delayS >= 15 && next.delayS <= 3600);
        now += next.delayS;
        attempts += 1;
        assert.ok(now - NOW < SEED_RETRY.maxTotalS + 3600);
      }
      assert.ok(retries < SEED_RETRY.maxAttempts);
    }
  });
});

describe("the daily cap", () => {
  const seed = plan();
  const budget = (limit: bigint, spent: bigint) => ({ limitAtomic: limit, spentAtomic: spent });

  it("fits a seed while at least $10.80 of the day is left, and not a micro-dollar less", () => {
    const limit = 50_000_000n;
    const result = seedFitsDay(seed, budget(limit, limit - 10_800_000n));
    assert.deepEqual([result.fits, result.neededAtomic, result.remainingAtomic, result.remainingAfterAtomic], [true, 10_800_000n, 10_800_000n, 0n]);
    const short = seedFitsDay(seed, budget(limit, limit - 10_799_999n));
    assert.deepEqual([short.fits, short.remainingAtomic, short.remainingAfterAtomic], [false, 10_799_999n, 0n]);
  });

  it("reports what is left after the seed", () => {
    const result = seedFitsDay(seed, budget(50_000_000n, 0n));
    assert.deepEqual([result.fits, result.remainingAtomic, result.remainingAfterAtomic], [true, 50_000_000n, 39_200_000n]);
  });

  it("never reports a negative remainder when the day is overspent", () => {
    const result = seedFitsDay(seed, budget(50_000_000n, 60_000_000n));
    assert.deepEqual([result.fits, result.remainingAtomic, result.remainingAfterAtomic], [false, 0n, 0n]);
    assert.equal(seedFitsDay(seed, budget(0n, 0n)).fits, false);
  });

  it("allows four seeded creations of $11.80 in a $50 day, and the fifth does not fit", () => {
    assert.equal(seededCreationsPerDay(50_000_000n), 4n);
    assert.equal(seededCreationsPerDay(11_799_999n), 0n);
    assert.equal(seededCreationsPerDay(11_800_000n), 1n);
    assert.equal(seededCreationsPerDay(0n), 0n);
    assert.equal(seededCreationsPerDay(-5n), 0n);
    const limit = 50_000_000n;
    // Reserving the fee and the seed's cap up front, a fifth creation is refused before anything is paid.
    let spent = 0n;
    let created = 0;
    while (limit - spent >= CREATION_ATTEMPT_COST_ATOMIC) {
      spent += CREATION_ATTEMPT_COST_ATOMIC;
      created += 1;
    }
    assert.deepEqual([created, spent], [4, 47_200_000n]);
    // Paying the fee first and the seed afterwards would leave a fifth creation $1 poorer with no seed.
    let sequential = 0n;
    let sequentialCreated = 0;
    for (;;) {
      if (limit - sequential < CREATION_FEE_ATOMIC) break;
      sequential += CREATION_FEE_ATOMIC;
      if (!seedFitsDay(seed, budget(limit, sequential)).fits) break;
      sequential += seed.capAtomic;
      sequentialCreated += 1;
    }
    assert.equal(sequentialCreated, 4);
    assert.equal(sequential, 4n * 11_800_000n + 1_000_000n);
  });
});
