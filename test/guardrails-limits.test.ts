import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CEILINGS, DEFAULTS, type GuardrailConfig } from "../src/config.js";
import * as limits from "../src/guardrails/limits.js";
import {
  CLOCK_SKEW_MS,
  NO_LEDGER_WARNING,
  type DailyLedger,
  type GuardDecision,
  checkDailyCap,
  checkOrderCap,
  checkOrderExpiration,
  checkPriceBand,
  checkQuoteFresh,
  checkToolAllowed,
  combineDecisions,
  notionalAtomic,
  orderExpirationSeconds,
  quoteExpiresAtMs,
  ticksFromMicroPrice,
  utcDayKey,
} from "../src/guardrails/limits.js";

const USDC = 1_000_000n;
const cfg: GuardrailConfig = DEFAULTS;
// A config that was built by hand (or corrupted) rather than by loadConfig.
const rogue = (overrides: Partial<Record<keyof GuardrailConfig, unknown>>): GuardrailConfig =>
  ({ ...DEFAULTS, ...overrides }) as GuardrailConfig;

const blockedCode = (decision: GuardDecision): string | undefined =>
  decision.allowed ? undefined : decision.code;

describe("checkToolAllowed (kill switch and creation switch)", () => {
  it("always allows reads, even with the kill switch on", () => {
    assert.equal(checkToolAllowed("read", rogue({ killSwitch: true })).allowed, true);
  });

  it("allows writes by default", () => {
    assert.equal(checkToolAllowed("write", cfg).allowed, true);
  });

  it("blocks every write-adjacent class when the kill switch is on", () => {
    for (const toolClass of ["write", "create"] as const) {
      assert.equal(blockedCode(checkToolAllowed(toolClass, rogue({ killSwitch: true, createEnabled: true }))), "kill_switch");
    }
  });

  it("fails closed when the kill switch value is malformed", () => {
    assert.equal(blockedCode(checkToolAllowed("write", rogue({ killSwitch: undefined }))), "kill_switch");
  });

  it("blocks creation unless it is enabled, and allows it when it is", () => {
    assert.equal(blockedCode(checkToolAllowed("create", cfg)), "create_disabled");
    assert.equal(checkToolAllowed("create", rogue({ createEnabled: true })).allowed, true);
    assert.equal(blockedCode(checkToolAllowed("create", rogue({ createEnabled: "yes" }))), "create_disabled");
  });
});

describe("checkOrderCap", () => {
  it("allows up to and including the cap", () => {
    assert.equal(checkOrderCap(1n, cfg).allowed, true);
    assert.equal(checkOrderCap(10n * USDC, cfg).allowed, true);
  });

  it("blocks one atomic unit over the cap and says how much", () => {
    const decision = checkOrderCap(10n * USDC + 1n, cfg);
    assert.equal(blockedCode(decision), "order_cap_exceeded");
    assert.ok(!decision.allowed && decision.message.includes("10.000001") && decision.message.includes("10 USDC.e"));
  });

  it("blocks zero, negative and non-bigint amounts", () => {
    assert.equal(blockedCode(checkOrderCap(0n, cfg)), "amount_not_positive");
    assert.equal(blockedCode(checkOrderCap(-1n, cfg)), "amount_not_positive");
    for (const bad of [5, "5", Number.NaN, undefined, null, 1e30, {}]) {
      assert.equal(blockedCode(checkOrderCap(bad as unknown as bigint, cfg)), "amount_invalid", String(bad));
    }
  });

  it("clamps a hand-built config to the compiled-in ceiling", () => {
    const huge = rogue({ maxOrderAtomic: 10n ** 30n });
    assert.equal(checkOrderCap(CEILINGS.maxOrderAtomic, huge).allowed, true);
    assert.equal(blockedCode(checkOrderCap(CEILINGS.maxOrderAtomic + 1n, huge)), "order_cap_exceeded");
  });

  it("blocks everything when the configured cap is malformed", () => {
    for (const bad of [undefined, -5n, 10, "10", null]) {
      assert.equal(blockedCode(checkOrderCap(1n, rogue({ maxOrderAtomic: bad }))), "order_cap_exceeded", String(bad));
    }
  });

  it("has no per-call cap argument to override the owner's cap", () => {
    assert.equal(checkOrderCap.length, 2);
    const withExtra = (checkOrderCap as unknown as (a: bigint, c: GuardrailConfig, o: bigint) => GuardDecision)(
      11n * USDC,
      cfg,
      10n ** 30n,
    );
    assert.equal(blockedCode(withExtra), "order_cap_exceeded");
  });
});

describe("checkDailyCap", () => {
  it("allows spend that lands exactly on the daily cap", () => {
    const decision = checkDailyCap(40n * USDC, 10n * USDC, cfg);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.allowed ? decision.warnings : null, []);
  });

  it("blocks spend one atomic unit past the daily cap", () => {
    assert.equal(blockedCode(checkDailyCap(40n * USDC, 10n * USDC + 1n, cfg)), "daily_cap_exceeded");
    assert.equal(blockedCode(checkDailyCap(50n * USDC, 1n, cfg)), "daily_cap_exceeded");
  });

  it("says plainly that nothing was counted when there is no ledger", () => {
    const decision = checkDailyCap(undefined, 5n * USDC, cfg);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.allowed ? decision.warnings : null, [NO_LEDGER_WARNING]);
    assert.match(NO_LEDGER_WARNING, /no storage/);
  });

  it("still rejects a bad amount when there is no ledger", () => {
    assert.equal(blockedCode(checkDailyCap(undefined, 0n, cfg)), "amount_not_positive");
    assert.equal(blockedCode(checkDailyCap(undefined, 7 as unknown as bigint, cfg)), "amount_invalid");
  });

  it("rejects an invalid ledger total", () => {
    for (const bad of [-1n, 5, "5", null, Number.NaN]) {
      assert.equal(blockedCode(checkDailyCap(bad as unknown as bigint, 1n, cfg)), "ledger_invalid", String(bad));
    }
  });

  it("clamps a hand-built daily cap to the ceiling", () => {
    const huge = rogue({ maxDailyAtomic: 10n ** 30n });
    assert.equal(checkDailyCap(490n * USDC, 10n * USDC, huge).allowed, true);
    assert.equal(blockedCode(checkDailyCap(490n * USDC, 10n * USDC + 1n, huge)), "daily_cap_exceeded");
  });
});

describe("no creation cadence cap (user decision, 2026-10-19)", () => {
  it("has no create-count check, config field or ceiling any more", () => {
    assert.equal("checkCreateCap" in limits, false);
    assert.equal("maxCreatesPerDay" in DEFAULTS, false);
    assert.equal("maxCreatesPerDay" in CEILINGS, false);
  });

  it("keeps the $10 per order and $50 per day caps", () => {
    assert.equal(blockedCode(checkOrderCap(10n * USDC + 1n, cfg)), "order_cap_exceeded");
    assert.equal(blockedCode(checkDailyCap(45n * USDC, 5n * USDC + 1n, cfg)), "daily_cap_exceeded");
  });

  it("counts a creation fee and seed as ordinary spend against the day", () => {
    // $1 fee + $10.80 seed = 11.80 USD, as one spend.
    assert.equal(checkDailyCap(38n * USDC, 11_800_000n, cfg).allowed, true);
    assert.equal(blockedCode(checkDailyCap(38_200_001n, 11_800_000n, cfg)), "daily_cap_exceeded");
  });
});

describe("notionalAtomic", () => {
  it("matches the worked example in the XO docs: 100 shares at 0.55", () => {
    const result = notionalAtomic(100_000_000n, 550);
    assert.deepEqual(result, { ok: true, value: 55_000_000n });
  });

  it("handles single-tick prices exactly", () => {
    assert.deepEqual(notionalAtomic(1_000_000n, 1), { ok: true, value: 1_000n });
    assert.deepEqual(notionalAtomic(1_000_000n, 999), { ok: true, value: 999_000n });
  });

  it("refuses a size that would need rounding", () => {
    const result = notionalAtomic(1n, 550);
    assert.equal(result.ok, false);
  });

  it("refuses bad sizes and prices", () => {
    for (const shares of [0n, -1n, 5 as unknown as bigint, "5" as unknown as bigint]) {
      assert.equal(notionalAtomic(shares, 500).ok, false, String(shares));
    }
    for (const price of [0, 1000, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "500" as unknown as number]) {
      assert.equal(notionalAtomic(1_000_000n, price).ok, false, String(price));
    }
  });
});

describe("ticksFromMicroPrice", () => {
  it("converts the read client's micro prices to ticks", () => {
    assert.deepEqual(ticksFromMicroPrice(550_000n), { ok: true, value: 550 });
    assert.deepEqual(ticksFromMicroPrice(1_000n), { ok: true, value: 1 });
    assert.deepEqual(ticksFromMicroPrice(999_000n), { ok: true, value: 999 });
  });

  it("refuses off-tick, out-of-range and non-bigint prices", () => {
    for (const bad of [0n, 500n, 550_500n, 1_000_000n, 2_000_000n, -1_000n, 550 as unknown as bigint, null as unknown as bigint]) {
      assert.equal(ticksFromMicroPrice(bad).ok, false, String(bad));
    }
  });
});

describe("checkPriceBand", () => {
  it("allows a price within the band of the reference, on both sides", () => {
    assert.equal(checkPriceBand("BUY", 550, 500, cfg).allowed, true);
    assert.equal(checkPriceBand("SELL", 450, 500, cfg).allowed, true);
    assert.equal(checkPriceBand("BUY", 500, 500, cfg).allowed, true);
  });

  it("blocks paying up (BUY) or selling cheap (SELL) beyond the band", () => {
    assert.equal(blockedCode(checkPriceBand("BUY", 551, 500, cfg)), "price_outside_band");
    assert.equal(blockedCode(checkPriceBand("SELL", 449, 500, cfg)), "price_outside_band");
  });

  it("allows passive orders far from the market, which cost the user nothing", () => {
    assert.equal(checkPriceBand("BUY", 10, 900, cfg).allowed, true);
    assert.equal(checkPriceBand("SELL", 990, 100, cfg).allowed, true);
  });

  it("rejects prices that are not a whole tick in 1..999", () => {
    for (const price of [0, 1000, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "500", null, undefined]) {
      assert.equal(blockedCode(checkPriceBand("BUY", price as unknown as number, 500, cfg)), "price_out_of_range", String(price));
    }
  });

  it("fails closed without a usable reference price", () => {
    for (const reference of [0, 1000, Number.NaN, undefined, null, "500"]) {
      assert.equal(blockedCode(checkPriceBand("BUY", 500, reference as unknown as number, cfg)), "reference_invalid", String(reference));
    }
  });

  it("rejects an unknown side", () => {
    assert.equal(blockedCode(checkPriceBand("HOLD" as unknown as "BUY", 500, 500, cfg)), "price_invalid");
    assert.equal(blockedCode(checkPriceBand("buy" as unknown as "BUY", 500, 500, cfg)), "price_invalid");
  });

  it("clamps a hand-built band to the ceiling and treats a malformed band as zero", () => {
    const wide = rogue({ priceBandTicks: 10_000 });
    assert.equal(checkPriceBand("BUY", 300, 100, wide).allowed, true);
    assert.equal(blockedCode(checkPriceBand("BUY", 301, 100, wide)), "price_outside_band");
    const broken = rogue({ priceBandTicks: Number.NaN });
    assert.equal(checkPriceBand("BUY", 500, 500, broken).allowed, true);
    assert.equal(blockedCode(checkPriceBand("BUY", 501, 500, broken)), "price_outside_band");
  });
});

describe("quote time to live", () => {
  const issued = 1_800_000_000_000;

  it("computes the expiry from the configured ttl, clamped to the ceiling", () => {
    assert.equal(quoteExpiresAtMs(issued, cfg), issued + 120_000);
    assert.equal(quoteExpiresAtMs(issued, rogue({ quoteTtlSeconds: 10 ** 9 })), issued + 600_000);
    assert.equal(quoteExpiresAtMs(issued, rogue({ quoteTtlSeconds: 0 })), issued);
  });

  it("accepts a fresh quote and rejects one at or past its ttl", () => {
    assert.equal(checkQuoteFresh(issued, issued + 119_999, cfg).allowed, true);
    assert.equal(blockedCode(checkQuoteFresh(issued, issued + 120_000, cfg)), "quote_expired");
    assert.equal(blockedCode(checkQuoteFresh(issued, issued + 3_600_000, cfg)), "quote_expired");
  });

  it("rejects a quote dated in the future beyond the clock skew allowance", () => {
    assert.equal(checkQuoteFresh(issued + CLOCK_SKEW_MS, issued, cfg).allowed, true);
    assert.equal(blockedCode(checkQuoteFresh(issued + CLOCK_SKEW_MS + 1, issued, cfg)), "quote_invalid_time");
  });

  it("rejects invalid timestamps", () => {
    for (const bad of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY, "1800000000000", null, undefined]) {
      assert.equal(blockedCode(checkQuoteFresh(bad as unknown as number, issued, cfg)), "quote_invalid_time", String(bad));
      assert.equal(blockedCode(checkQuoteFresh(issued, bad as unknown as number, cfg)), "quote_invalid_time", String(bad));
    }
  });

  it("does not let a hand-built ttl outlive the ceiling or a zero ttl live at all", () => {
    assert.equal(blockedCode(checkQuoteFresh(issued, issued + 601_000, rogue({ quoteTtlSeconds: 10 ** 9 }))), "quote_expired");
    assert.equal(blockedCode(checkQuoteFresh(issued, issued, rogue({ quoteTtlSeconds: 0 }))), "quote_expired");
  });
});

describe("order expiration", () => {
  const now = 1_800_000_000_000;
  const nowSeconds = BigInt(now / 1000);

  it("produces a non-zero expiration inside the configured window", () => {
    assert.equal(orderExpirationSeconds(now, cfg), nowSeconds + 600n);
    assert.notEqual(orderExpirationSeconds(now, cfg), 0n);
    assert.equal(orderExpirationSeconds(now, rogue({ orderExpirySeconds: 10 ** 9 })), nowSeconds + 3600n);
  });

  it("produces an unusable expiration, not a long-lived one, from a malformed config", () => {
    for (const bad of [Number.NaN, 0, -5, "600", undefined]) {
      const expiration = orderExpirationSeconds(now, rogue({ orderExpirySeconds: bad }));
      assert.equal(blockedCode(checkOrderExpiration(expiration, now, rogue({ orderExpirySeconds: bad }))), "expiration_in_past", String(bad));
    }
  });

  it("accepts an expiration inside the window", () => {
    assert.equal(checkOrderExpiration(orderExpirationSeconds(now, cfg), now, cfg).allowed, true);
    assert.equal(checkOrderExpiration(nowSeconds + 1n, now, cfg).allowed, true);
  });

  it("blocks 0, which would mean the order never expires", () => {
    assert.equal(blockedCode(checkOrderExpiration(0n, now, cfg)), "expiration_missing");
  });

  it("blocks an expiration that has already passed", () => {
    assert.equal(blockedCode(checkOrderExpiration(nowSeconds, now, cfg)), "expiration_in_past");
    assert.equal(blockedCode(checkOrderExpiration(nowSeconds - 100n, now, cfg)), "expiration_in_past");
    assert.equal(blockedCode(checkOrderExpiration(-5n, now, cfg)), "expiration_in_past");
  });

  it("blocks an expiration further out than the window", () => {
    assert.equal(blockedCode(checkOrderExpiration(nowSeconds + 7200n, now, cfg)), "expiration_too_far");
    assert.equal(blockedCode(checkOrderExpiration(2n ** 255n, now, cfg)), "expiration_too_far");
    assert.equal(checkOrderExpiration(nowSeconds + 605n, now, cfg).allowed, true);
    assert.equal(blockedCode(checkOrderExpiration(nowSeconds + 606n, now, cfg)), "expiration_too_far");
  });

  it("blocks non-bigint expirations and invalid clocks", () => {
    for (const bad of [1_800_000_100, "1800000100", null, undefined, Number.NaN]) {
      assert.equal(blockedCode(checkOrderExpiration(bad as unknown as bigint, now, cfg)), "expiration_invalid", String(bad));
    }
    assert.equal(blockedCode(checkOrderExpiration(nowSeconds + 5n, Number.NaN, cfg)), "expiration_invalid");
  });
});

describe("combineDecisions", () => {
  it("returns the first block", () => {
    const decision = combineDecisions(checkOrderCap(1n, cfg), checkOrderCap(0n, cfg), checkOrderCap(11n * USDC, cfg));
    assert.equal(blockedCode(decision), "amount_not_positive");
  });

  it("blocks when any single check blocks, wherever it sits", () => {
    assert.equal(blockedCode(combineDecisions(checkOrderCap(1n, cfg), checkDailyCap(50n * USDC, 1n, cfg))), "daily_cap_exceeded");
    assert.equal(blockedCode(combineDecisions(checkToolAllowed("write", rogue({ killSwitch: true })), checkOrderCap(1n, cfg))), "kill_switch");
  });

  it("passes only when everything passes and keeps each distinct warning once", () => {
    const decision = combineDecisions(
      checkOrderCap(1n, cfg),
      checkDailyCap(undefined, 1n, cfg),
      checkDailyCap(undefined, 2n, cfg),
    );
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.allowed ? decision.warnings : null, [NO_LEDGER_WARNING]);
  });

  it("is allowed when given nothing to check", () => {
    assert.equal(combineDecisions().allowed, true);
  });
});

describe("utcDayKey and the ledger interface", () => {
  it("builds a UTC day key", () => {
    assert.equal(utcDayKey(0), "1970-01-01");
    assert.equal(utcDayKey(Date.UTC(2026, 9, 19, 23, 59, 59)), "2026-10-19");
    assert.equal(utcDayKey(Date.UTC(2026, 9, 20, 0, 0, 0)), "2026-10-20");
  });

  it("rejects invalid times", () => {
    for (const bad of [Number.NaN, -1, 1e20, 1.5, "0", null]) {
      assert.equal(utcDayKey(bad as unknown as number), undefined, String(bad));
    }
  });

  it("is an interface only: it can be implemented by a relay but ships no implementation", async () => {
    const ledger: DailyLedger = {
      usage: async () => ({ spentAtomic: 0n, fundedAtomic: 0n }),
      reserve: async () => ({ reserved: true, reservationId: "r1" }),
      release: async () => {},
    };
    const usage = await ledger.usage("0x0000000000000000000000000000000000000001", "2026-10-19");
    assert.equal(checkDailyCap(usage.spentAtomic, 5n * USDC, cfg).allowed, true);
    const request: Parameters<DailyLedger["reserve"]>[0] = {
      kind: "fund",
      account: "0x0000000000000000000000000000000000000001",
      day: "2026-10-19",
      amountAtomic: 1n,
      limitAtomic: 10n,
      reservationId: "funding-1",
    };
    assert.deepEqual(await ledger.reserve(request), { reserved: true, reservationId: "r1" });
  });
});
