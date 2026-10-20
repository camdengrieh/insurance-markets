import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextFundingStep, type FundingStep, type StepInput, type StepReason } from "../src/xo/funding/steps.js";
import { prng } from "./funding-helpers.js";

const A = 3_000_000n;
const UNLIMITED = 2n ** 256n - 1n;

// An oracle written differently from the machine: subtraction instead of addition, and early returns in
// another order of thought. Both must agree on every cell.
function oracle(input: StepInput): FundingStep {
  const risen = input.xoBalance !== null && input.xoBalanceBefore !== null && input.xoBalance - input.xoBalanceBefore >= input.amount;
  if (risen) return "done";
  if (input.baseBalance < input.amount) return "blocked";
  return input.allowance === input.amount ? "transfer" : "approve";
}

const STEPS: readonly FundingStep[] = ["approve", "transfer", "done", "blocked"];

describe("nextFundingStep: the full grid", () => {
  const allowances = [0n, A - 1n, A, A + 1n, UNLIMITED];
  const balances = [0n, A - 1n, A, A + 1n, 10n * A];
  const befores: (bigint | null)[] = [null, 0n, 7n];
  const nows: (bigint | null)[] = [null, 0n, 7n, 7n + A - 1n, 7n + A, 7n + A + 1n, A, A - 1n];

  it("yields exactly one valid step for every (allowance, Base balance, XO balance) cell, equal to the oracle", () => {
    let cells = 0;
    for (const allowance of allowances) {
      for (const baseBalance of balances) {
        for (const xoBalanceBefore of befores) {
          for (const xoBalance of nows) {
            const input: StepInput = { amount: A, allowance, baseBalance, xoBalance, xoBalanceBefore };
            const decision = nextFundingStep(input);
            cells += 1;
            assert.ok(STEPS.includes(decision.step), JSON.stringify({ input: String(input), decision }));
            assert.equal(decision.step, oracle(input), `${allowance} ${baseBalance} ${xoBalanceBefore} ${xoBalance}`);
            assert.ok(decision.detail.length > 0);
          }
        }
      }
    }
    assert.equal(cells, 5 * 5 * 3 * 8);
  });

  it("agrees with the oracle on 3000 seeded random cells, with random amounts", () => {
    const next = prng(1_019_2026);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T;
    for (let i = 0; i < 3000; i += 1) {
      const amount = 1n + BigInt(Math.floor(next() * 50_000_000));
      const input: StepInput = {
        amount,
        allowance: pick([0n, amount - 1n, amount, amount + 1n, amount * 2n, UNLIMITED, BigInt(Math.floor(next() * 60_000_000))]),
        baseBalance: pick([0n, amount - 1n, amount, amount + 1n, BigInt(Math.floor(next() * 80_000_000))]),
        xoBalance: pick([null, 0n, amount, BigInt(Math.floor(next() * 90_000_000))]),
        xoBalanceBefore: pick([null, 0n, 5n, BigInt(Math.floor(next() * 40_000_000))]),
      };
      assert.equal(nextFundingStep(input).step, oracle(input), String(i));
    }
  });
});

describe("nextFundingStep: named cases", () => {
  const base: StepInput = { amount: A, allowance: 0n, baseBalance: 10n * A, xoBalance: 0n, xoBalanceBefore: null };
  const decide = (change: Partial<StepInput>) => nextFundingStep({ ...base, ...change });

  it("approves first when nothing is approved", () => {
    const decision = decide({});
    assert.deepEqual([decision.step, decision.reason], ["approve", "allowance_short"]);
  });

  it("transfers when the allowance is exactly the amount", () => {
    const decision = decide({ allowance: A });
    assert.deepEqual([decision.step, decision.reason], ["transfer", "allowance_exact"]);
  });

  it("resets a larger allowance to the exact amount rather than transferring", () => {
    for (const allowance of [A + 1n, 2n * A, UNLIMITED]) {
      const decision = decide({ allowance });
      assert.deepEqual([decision.step, decision.reason], ["approve", "allowance_not_exact"]);
    }
  });

  it("blocks on a short Base balance, whatever the allowance is, and does not build an approval for money it lacks", () => {
    for (const allowance of [0n, A, UNLIMITED]) {
      const decision = decide({ allowance, baseBalance: A - 1n });
      assert.deepEqual([decision.step, decision.reason], ["blocked", "insufficient_base_balance"]);
    }
  });

  it("is done only when a baseline exists and the balance rose by at least the amount", () => {
    const rose = decide({ xoBalanceBefore: 5n, xoBalance: 5n + A });
    assert.deepEqual([rose.step, rose.reason], ["done", "balance_rose"]);
    assert.equal(decide({ xoBalanceBefore: 5n, xoBalance: 5n + A - 1n }).step, "approve");
    assert.equal(decide({ xoBalanceBefore: null, xoBalance: 99n * A }).step, "approve", "no baseline: a big balance proves nothing");
    assert.equal(decide({ xoBalanceBefore: 5n, xoBalance: null }).step, "approve", "unreadable balance: not done");
  });

  it("is done even when the Base side could not fund another round", () => {
    const decision = decide({ xoBalanceBefore: 0n, xoBalance: A, baseBalance: 0n, allowance: 0n });
    assert.equal(decision.step, "done");
  });

  it("refuses nonsense as blocked invalid_input", () => {
    const cases: Partial<StepInput>[] = [
      { amount: 0n },
      { amount: -1n },
      { allowance: -1n },
      { baseBalance: -1n },
      { xoBalance: -1n },
      { xoBalanceBefore: -1n },
    ];
    for (const change of cases) {
      const decision = decide(change);
      assert.deepEqual([decision.step, decision.reason], ["blocked", "invalid_input"], JSON.stringify(change, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    }
  });

  it("is deterministic and does not touch its input", () => {
    const input = Object.freeze({ ...base, allowance: A });
    assert.deepEqual(nextFundingStep(input), nextFundingStep(input));
  });

  it("only ever names reasons from the fixed list", () => {
    const reasons: ReadonlySet<StepReason> = new Set(["balance_rose", "allowance_short", "allowance_not_exact", "allowance_exact", "insufficient_base_balance", "invalid_input"]);
    for (const allowance of [0n, A, A + 1n]) {
      for (const baseBalance of [0n, A]) assert.ok(reasons.has(decide({ allowance, baseBalance }).reason));
    }
  });
});
