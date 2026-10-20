import { describe, expect, it } from "vitest";

import type { DecodedCallBlock } from "@shared/relay/contract";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, USDC_E_ADDRESS, XO_WARP_ROUTE } from "@shared/xo/chain/constants";

import { renderCalls, RENDERABLE_ACTIONS, type CallExpectations } from "./templates";
import { OWNER, REDEEM_IDS, answer, copyOf } from "./test-support";

function callsOf(name: string): DecodedCallBlock[] {
  return copyOf(answer(name)["prepared"]["decoded"]["calls"]) as DecodedCallBlock[];
}

const EXPECT: CallExpectations = { owner: OWNER };

// A withdrawal is not prepared by any screen, but a withdrawal item must still be checked if one ever reaches it.
function withdrawCalls(amount: string, recipient?: string): DecodedCallBlock[] {
  const padded = `0x${"0".repeat(24)}${OWNER.slice(2).toLowerCase()}`;
  return [
    { template: "usdce_approve", to: USDC_E_ADDRESS, args: { spender: XO_WARP_ROUTE, amount } },
    { template: "withdraw_transfer_remote", to: XO_WARP_ROUTE, args: { destination: "8453", recipient: recipient ?? padded, amount } },
  ] as DecodedCallBlock[];
}

describe("the closed call-template list (M4-7)", () => {
  it("renders the recorded deploy, enable, revoke and redeem items", () => {
    for (const [name, action] of [
      ["prepare_deploy", "deploy_enable_trading"],
      ["prepare_deploy_capped", "deploy_enable_trading"],
      ["prepare_enable", "enable_trading"],
      ["prepare_revoke", "revoke_trading"],
      ["prepare_redeem_one", "redeem"],
      ["prepare_redeem_three", "redeem"],
    ] as const) {
      const rendered = renderCalls(action, callsOf(name), EXPECT);
      expect(rendered.ok, name).toBe(true);
    }
  });

  it("shows full addresses and says unlimited for XO's own approval", () => {
    const rendered = renderCalls("deploy_enable_trading", callsOf("prepare_deploy"), EXPECT);
    if (!rendered.ok) throw new Error("expected a rendering");
    const text = rendered.calls.flatMap((call) => call.lines.map((line) => line.value)).join("\n");
    expect(text).toContain(USDC_E_ADDRESS);
    expect(text).toContain(CTF_EXCHANGE);
    expect(text).toContain(CONDITIONAL_TOKENS);
    expect(text).toContain("unlimited");
  });

  it("renders a revoke as a zero allowance and an operator removal", () => {
    const rendered = renderCalls("revoke_trading", callsOf("prepare_revoke"), EXPECT);
    if (!rendered.ok) throw new Error("expected a rendering");
    expect(rendered.calls[0]?.title).toMatch(/Revoke/);
    expect(rendered.calls[1]?.lines.find((line) => line.label === "Approved")?.value).toBe("false");
  });

  it("renders a redeem for exactly the conditions asked for, and no others", () => {
    const calls = callsOf("prepare_redeem_three");
    expect(renderCalls("redeem", calls, { owner: OWNER, conditionIds: REDEEM_IDS }).ok).toBe(true);
    const missing = renderCalls("redeem", calls, { owner: OWNER, conditionIds: REDEEM_IDS.slice(0, 2) });
    expect(missing).toMatchObject({ ok: false, code: "wrong_condition" });
    const extra = renderCalls("redeem", callsOf("prepare_redeem_one"), { owner: OWNER, conditionIds: REDEEM_IDS });
    expect(extra).toMatchObject({ ok: false, code: "wrong_condition" });
  });

  it("renders a withdrawal only to the owner, left-padded, for an exact amount", () => {
    expect(renderCalls("withdraw", withdrawCalls("2000000"), EXPECT).ok).toBe(true);
    const right = `0x${OWNER.slice(2).toLowerCase()}${"0".repeat(24)}`;
    expect(renderCalls("withdraw", withdrawCalls("2000000", right), EXPECT)).toMatchObject({ ok: false, code: "wrong_recipient" });
    const stranger = `0x${"0".repeat(24)}${"ab".repeat(20)}`;
    expect(renderCalls("withdraw", withdrawCalls("2000000", stranger), EXPECT)).toMatchObject({ ok: false, code: "wrong_recipient" });
    expect(renderCalls("withdraw", withdrawCalls("2000000"), { owner: OWNER, withdrawAtomic: 1n })).toMatchObject({ ok: false, code: "wrong_amount" });
    expect(renderCalls("withdraw", withdrawCalls("0"), EXPECT)).toMatchObject({ ok: false, code: "wrong_amount" });
  });

  it("refuses an extra call next to a good one, and renders nothing at all", () => {
    for (const name of ["prepare_deploy", "prepare_revoke"]) {
      const calls = callsOf(name);
      calls.push({ template: "usdce_approve", to: USDC_E_ADDRESS, args: { spender: "0x000000000000000000000000000000000000dEaD", amount: "1" } } as DecodedCallBlock);
      const rendered = renderCalls(name === "prepare_deploy" ? "deploy_enable_trading" : "revoke_trading", calls, EXPECT);
      expect(rendered).toMatchObject({ ok: false, code: "wrong_call_count" });
      expect("calls" in rendered).toBe(false);
    }
  });

  it("refuses an approval to any spender but the exchange", () => {
    const calls = callsOf("prepare_deploy");
    (calls[0] as { args: Record<string, unknown> }).args["spender"] = "0x000000000000000000000000000000000000dEaD";
    expect(renderCalls("deploy_enable_trading", calls, EXPECT)).toMatchObject({ ok: false, code: "wrong_spender", index: 0 });
  });

  it("refuses an operator approval that names another operator or switches the exchange off", () => {
    const other = callsOf("prepare_enable");
    (other[1] as { args: Record<string, unknown> }).args["operator"] = "0x000000000000000000000000000000000000dEaD";
    expect(renderCalls("enable_trading", other, EXPECT)).toMatchObject({ ok: false, code: "wrong_operator" });
    const off = callsOf("prepare_enable");
    (off[1] as { args: Record<string, unknown> }).args["approved"] = false;
    expect(renderCalls("enable_trading", off, EXPECT)).toMatchObject({ ok: false, code: "wrong_approval" });
  });

  it("refuses an unknown template, a wrong target and an argument that is not on the list", () => {
    const unknown = callsOf("prepare_enable");
    (unknown[0] as { template: string }).template = "erc20_transfer";
    expect(renderCalls("enable_trading", unknown, EXPECT)).toMatchObject({ ok: false, code: "template_not_allowed" });
    const target = callsOf("prepare_enable");
    (target[0] as { to: string }).to = "0x000000000000000000000000000000000000dEaD";
    expect(renderCalls("enable_trading", target, EXPECT)).toMatchObject({ ok: false, code: "wrong_target" });
    const extra = callsOf("prepare_enable");
    (extra[1] as { args: Record<string, unknown> }).args["data"] = "0x";
    expect(renderCalls("enable_trading", extra, EXPECT)).toMatchObject({ ok: false, code: "wrong_arguments" });
  });

  it("refuses a revoke that does not set the allowance to zero, and an enable that sets it to zero", () => {
    const revoke = callsOf("prepare_revoke");
    (revoke[0] as { args: Record<string, unknown> }).args["amount"] = "1";
    expect(renderCalls("revoke_trading", revoke, EXPECT)).toMatchObject({ ok: false, code: "wrong_amount" });
    const enable = callsOf("prepare_enable");
    (enable[0] as { args: Record<string, unknown> }).args["amount"] = "0";
    expect(renderCalls("enable_trading", enable, EXPECT)).toMatchObject({ ok: false, code: "wrong_amount" });
  });

  it("checks the allowance against the one asked for", () => {
    const calls = callsOf("prepare_deploy_capped");
    expect(renderCalls("deploy_enable_trading", calls, { owner: OWNER, allowanceAtomic: 50_000_000n }).ok).toBe(true);
    expect(renderCalls("deploy_enable_trading", calls, { owner: OWNER, allowanceAtomic: null })).toMatchObject({ ok: false, code: "wrong_amount" });
    expect(renderCalls("deploy_enable_trading", calls, { owner: OWNER, allowanceAtomic: 5_000_000n })).toMatchObject({ ok: false, code: "wrong_amount" });
  });

  it("refuses a redeem with a bad index set, a zero or duplicated condition, or too many calls", () => {
    const bad = callsOf("prepare_redeem_one");
    (bad[0] as { args: Record<string, unknown> }).args["index_sets"] = ["3"];
    expect(renderCalls("redeem", bad, EXPECT)).toMatchObject({ ok: false, code: "wrong_index_sets" });
    const zero = callsOf("prepare_redeem_one");
    (zero[0] as { args: Record<string, unknown> }).args["condition_id"] = `0x${"0".repeat(64)}`;
    expect(renderCalls("redeem", zero, EXPECT)).toMatchObject({ ok: false, code: "wrong_condition" });
    const twice = callsOf("prepare_redeem_one");
    twice.push(copyOf(twice[0] as DecodedCallBlock));
    expect(renderCalls("redeem", twice, EXPECT)).toMatchObject({ ok: false, code: "duplicate_condition" });
    const many = Array.from({ length: 51 }, () => copyOf(callsOf("prepare_redeem_one")[0] as DecodedCallBlock));
    expect(renderCalls("redeem", many, EXPECT)).toMatchObject({ ok: false, code: "wrong_call_count" });
    expect(renderCalls("redeem", [], EXPECT)).toMatchObject({ ok: false, code: "wrong_call_count" });
  });

  it("does not know the market-creation family or an unknown action (O5)", () => {
    for (const action of ["create_market", "respond_update", "cancel_market", "place_seed", "anything_else", ""]) {
      expect(renderCalls(action, callsOf("prepare_enable"), EXPECT)).toMatchObject({ ok: false, code: "action_not_allowed" });
    }
    expect([...RENDERABLE_ACTIONS].sort()).toEqual(["deploy_enable_trading", "enable_trading", "redeem", "revoke_trading", "withdraw"]);
  });

  it("never puts a value from the call into a failure sentence", () => {
    const calls = callsOf("prepare_deploy");
    (calls[0] as { args: Record<string, unknown> }).args["spender"] = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";
    const failure = renderCalls("deploy_enable_trading", calls, EXPECT);
    expect(JSON.stringify(failure)).not.toMatch(/deadbeef/i);
  });
});
