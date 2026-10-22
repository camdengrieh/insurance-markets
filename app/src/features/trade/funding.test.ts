import { describe, expect, it } from "vitest";

import { BASE_USDC, BASE_WARP_ROUTER } from "@sdk/chain/xo/constants";

import { PROPOSAL_KEY, vetFundingProposal } from "./funding";
import { FUND_ANSWERS, OWNER, copyOf } from "./test-support";

const NOW = 1_893_456_001_000;
const ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d";

function proposal(name: string): Record<string, any> {
  const found = FUND_ANSWERS[name];
  if (found === undefined) throw new Error(`no recorded funding answer ${name}`);
  return copyOf(found.structured);
}

const ASK = { owner: OWNER, amountText: "3", nowMs: NOW };

describe("funding steps are checked against calls the page builds itself (M4-6)", () => {
  it("accepts the recorded approve step and shows full addresses", () => {
    const verdict = vetFundingProposal(proposal("fund_approve"), ASK);
    if (!verdict.ok) throw new Error(verdict.reason);
    expect(verdict.step).toBe("approve");
    expect(verdict.chain).toBe("eip155:8453");
    expect(verdict.value).toBe("0");
    expect(verdict.account).toBe(ACCOUNT);
    expect(verdict.lines.map((line) => line.value).join("\n")).toContain(BASE_USDC);
    expect(verdict.lines.map((line) => line.value).join("\n")).toContain(BASE_WARP_ROUTER);
  });

  it("accepts the recorded transfer step and names the derived account as the destination", () => {
    const verdict = vetFundingProposal(proposal("fund_transfer"), ASK);
    if (!verdict.ok) throw new Error(verdict.reason);
    expect(verdict.step).toBe("transfer");
    expect(verdict.lines.find((line) => line.label === "Recipient")?.value).toContain(ACCOUNT);
    expect(verdict.amountText).toBe("3 USDC");
  });

  it("refuses a transfer whose recipient is not the derived account, however it is changed", () => {
    for (const recipient of ["a".repeat(40), OWNER.slice(2).toLowerCase()]) {
      const tampered = proposal("fund_transfer");
      const call = tampered[PROPOSAL_KEY].transaction;
      call.data = `${call.data.slice(0, 74)}${"0".repeat(24)}${recipient}${call.data.slice(138)}`;
      const verdict = vetFundingProposal(tampered, ASK);
      expect(verdict.ok, recipient).toBe(false);
    }
  });

  it("refuses a right-padded recipient word, which could never be delivered", () => {
    const tampered = proposal("fund_transfer");
    const call = tampered[PROPOSAL_KEY].transaction;
    call.data = `${call.data.slice(0, 74)}${"b3729f7e1ab0b4a50e7de5599ecc321b8775d30d"}${"0".repeat(24)}${call.data.slice(138)}`;
    expect(vetFundingProposal(tampered, ASK).ok).toBe(false);
  });

  it("refuses an approval for a spender other than the router", () => {
    const tampered = proposal("fund_approve");
    const call = tampered[PROPOSAL_KEY].transaction;
    call.data = `${call.data.slice(0, 34)}${"de".repeat(20)}${call.data.slice(74)}`;
    const verdict = vetFundingProposal(tampered, ASK);
    expect(verdict.ok).toBe(false);
  });

  it("refuses a different amount from the one asked for", () => {
    expect(vetFundingProposal(proposal("fund_approve"), { ...ASK, amountText: "4" }).ok).toBe(false);
    expect(vetFundingProposal(proposal("fund_transfer"), { ...ASK, amountText: "2.999999" }).ok).toBe(false);
  });

  it("refuses a target, a chain or a native value that is not the pinned one", () => {
    const target = proposal("fund_approve");
    target[PROPOSAL_KEY].transaction.to = "0x000000000000000000000000000000000000dEaD";
    expect(vetFundingProposal(target, ASK).ok).toBe(false);
    const chain = proposal("fund_approve");
    chain[PROPOSAL_KEY].chain = "eip155:1";
    expect(vetFundingProposal(chain, ASK)).toMatchObject({ ok: false, code: "wrong_chain" });
    const value = proposal("fund_approve");
    value[PROPOSAL_KEY].transaction.value = "1";
    expect(vetFundingProposal(value, ASK)).toMatchObject({ ok: false, code: "wrong_value" });
  });

  it("refuses an expired proposal", () => {
    expect(vetFundingProposal(proposal("fund_approve"), { ...ASK, nowMs: Date.parse("2030-01-01T00:04:00Z") })).toMatchObject({ ok: false, code: "expired" });
  });

  it("refuses anything that is not exactly one PayBox transaction proposal", () => {
    expect(vetFundingProposal({}, ASK)).toMatchObject({ ok: false, code: "schema" });
    expect(vetFundingProposal(proposal("fund_refused_flag_off"), ASK)).toMatchObject({ ok: false, code: "schema" });
    const extra = proposal("fund_approve");
    extra["other"] = 1;
    expect(vetFundingProposal(extra, ASK)).toMatchObject({ ok: false, code: "schema" });
    const nested = proposal("fund_approve");
    nested[PROPOSAL_KEY].transaction.gas = "1";
    expect(vetFundingProposal(nested, ASK)).toMatchObject({ ok: false, code: "schema" });
  });

  it("refuses a bad owner or a bad amount before looking at the proposal", () => {
    expect(vetFundingProposal(proposal("fund_approve"), { ...ASK, owner: "not an address" }).ok).toBe(false);
    for (const amountText of ["", "0", "-1", "1e1", "0.0000001", "abc"]) {
      expect(vetFundingProposal(proposal("fund_approve"), { ...ASK, amountText }), amountText).toMatchObject({ ok: false, code: "bad_amount" });
    }
  });

  it("keeps the reason sentences fixed: no value from the proposal appears in a failure", () => {
    const tampered = proposal("fund_approve");
    tampered[PROPOSAL_KEY].transaction.to = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";
    expect(JSON.stringify(vetFundingProposal(tampered, ASK))).not.toMatch(/deadbeef/i);
  });
});
