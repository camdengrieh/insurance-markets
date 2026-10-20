import { describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_ACCOUNT, ANVIL_ACCOUNT_0_OWNER, BASE_USDC, BASE_WARP_ROUTER } from "@shared/xo/chain/constants";

import type { DepositDecision } from "../../core/account";
import { FUNDING_FACTS, planFunding, type FundingInputs } from "./funding-view";

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const allowed: DepositDecision = { allowed: true, reasons: [] };
const blocked: DepositDecision = { allowed: false, reasons: ["The account is counterfactual: not deployed on this chain, so it is not a deposit target."] };

const input = (overrides: Partial<FundingInputs> = {}): FundingInputs => ({
  owner: OWNER,
  amountText: "3",
  baseUsdcBalance: 10_000_000n,
  allowance: 0n,
  xoBalance: null,
  xoBalanceBefore: null,
  deposit: allowed,
  ...overrides,
});

function ok(overrides: Partial<FundingInputs> = {}) {
  const plan = planFunding(input(overrides));
  if (!plan.ok) throw new Error(`expected a plan: ${plan.message}`);
  return plan;
}

describe("decoded funding steps (display only)", () => {
  it("builds approve then transferRemote, destination pinned to the derived account", () => {
    const plan = ok();
    expect(plan.owner).toBe(OWNER);
    expect(plan.account).toBe(ANVIL_ACCOUNT_0_ACCOUNT);
    expect(plan.amountAtomic).toBe(3_000_000n);
    const [approve, transfer] = plan.steps;
    expect(approve.kind).toBe("approve");
    expect(approve.to).toBe(BASE_USDC);
    expect(approve.value).toBe("0");
    expect(approve.decoded).toMatchObject({ kind: "approve", spender: BASE_WARP_ROUTER, amount: 3_000_000n });
    expect(transfer.kind).toBe("transfer");
    expect(transfer.to).toBe(BASE_WARP_ROUTER);
    expect(transfer.value).toBe("0");
    expect(transfer.decoded).toMatchObject({ kind: "transfer", destination: 3223, recipient: ANVIL_ACCOUNT_0_ACCOUNT, amount: 3_000_000n });
    // The recipient is printed in full, never shortened.
    expect(transfer.lines.find((line) => line.label === "Recipient")?.value).toContain(ANVIL_ACCOUNT_0_ACCOUNT);
    expect(approve.lines.find((line) => line.label === "Spender")?.value).toContain(BASE_WARP_ROUTER);
  });

  it("is never sendable from here", () => {
    expect(ok().sendable).toBe(false);
  });

  it("refuses an amount that is not an exact positive decimal (never an unlimited approval)", () => {
    for (const bad of ["", "0", "-1", "1e6", "0x10", "1,5", "1.0000001", " 3", "3 ", "abc", "99999999999999999999"]) {
      const plan = planFunding(input({ amountText: bad }));
      expect(plan.ok, `amount ${JSON.stringify(bad)}`).toBe(false);
    }
    const huge = planFunding(input({ amountText: "1000001" }));
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.code).toBe("amount_too_large");
  });

  it("refuses an owner that cannot receive a derived account", () => {
    for (const owner of ["", "0x0000000000000000000000000000000000000000", "0x123", "vitalik.eth"]) {
      expect(planFunding(input({ owner })).ok, owner).toBe(false);
    }
  });

  it("says 'do not send' while the XO account is not a proven deposit target", () => {
    expect(ok({ deposit: blocked }).blockers).toEqual(blocked.reasons);
    expect(ok({ deposit: allowed }).blockers).toEqual([]);
    // An account state nobody has read yet is a blocker too.
    expect(ok({ deposit: null }).blockers.join(" ")).toMatch(/not been checked/);
  });

  it("suggests the next step from the Base reads and never guesses when a read is missing", () => {
    expect(ok({ allowance: 0n }).next).toMatchObject({ step: "approve", reason: "allowance_short" });
    expect(ok({ allowance: 5_000_000n }).next).toMatchObject({ step: "approve", reason: "allowance_not_exact" });
    expect(ok({ allowance: 3_000_000n }).next).toMatchObject({ step: "transfer" });
    expect(ok({ baseUsdcBalance: 1_000_000n }).next).toMatchObject({ step: "blocked", reason: "insufficient_base_balance" });
    expect(ok({ baseUsdcBalance: null }).next).toBeNull();
    expect(ok({ allowance: null }).next).toBeNull();
    // "done" needs a baseline, which this screen does not keep.
    expect(ok({ xoBalance: 99_000_000n }).next?.step).not.toBe("done");
    expect(ok({ xoBalance: 13_000_000n, xoBalanceBefore: 10_000_000n }).next?.step).toBe("done");
  });

  it("the pinned facts it prints match the constants", () => {
    expect(FUNDING_FACTS).toEqual({ chain: "eip155:8453", token: BASE_USDC, router: BASE_WARP_ROUTER, destinationDomain: 3223 });
  });
});
