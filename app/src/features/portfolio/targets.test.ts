import { describe, expect, it } from "vitest";

import type { AddressBinding } from "../../core/bindings";
import { deriveKernelAccount } from "../../core/account";
import type { VenueId } from "../../core/ports";
import { DEFAULT_SWITCHES, DISCLOSURE_VERSION, type VenueSwitches } from "../../core/venue-policy";
import { planReads, POSITION_READERS } from "./targets";

const EOA = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SOLANA = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

function binding(overrides: Partial<AddressBinding> & { id: string }): AddressBinding {
  return { label: "Mine", kind: "eoa", chain: "evm", address: EOA, status: "derived", venues: [], source: "pasted", ...overrides };
}

const switches = (enabled: Partial<Record<VenueId, boolean>> = {}, accepted: Partial<Record<VenueId, string>> = {}): VenueSwitches => ({ enabled, disclosureAccepted: accepted });

describe("planReads", () => {
  it("M2-9: a saved address queries no venue until the user selects one", () => {
    expect(planReads([binding({ id: "a", venues: [] })], DEFAULT_SWITCHES, "cockpit")).toEqual([]);
    expect(planReads([], DEFAULT_SWITCHES, "cockpit")).toEqual([]);
  });

  it("asks exactly the venues selected for that address", () => {
    const plan = planReads([binding({ id: "a", venues: ["trueo"] }), binding({ id: "b", venues: ["xo", "polymarket"] })], DEFAULT_SWITCHES, "cockpit");
    expect(plan.map((item) => `${item.binding.id}:${item.venue}`)).toEqual(["a:trueo", "b:xo", "b:polymarket"]);
    expect(plan.every((item) => item.kind === "run")).toBe(true);
  });

  it("XO is asked about the account DERIVED from the owner, never the owner", () => {
    const derived = deriveKernelAccount(EOA);
    if (!derived.ok) throw new Error("derive");
    const plan = planReads([binding({ id: "a", venues: ["xo"] })], DEFAULT_SWITCHES, "cockpit");
    expect(plan[0]).toMatchObject({ kind: "run", venue: "xo", address: derived.account, resolution: "derived_kernel" });
    expect(plan[0]?.kind === "run" && plan[0].address.toLowerCase()).not.toBe(EOA.toLowerCase());
  });

  it("XO on the account's own row is asked directly, and only on XO's chain", () => {
    const derived = deriveKernelAccount(EOA);
    if (!derived.ok) throw new Error("derive");
    const onXo = planReads([binding({ id: "k", kind: "kernel", chain: "eip155:3223", address: derived.account, venues: ["xo"] })], DEFAULT_SWITCHES, "cockpit");
    expect(onXo[0]).toMatchObject({ kind: "run", resolution: "direct", address: derived.account });
    const onBase = planReads([binding({ id: "k", kind: "kernel", chain: "eip155:8453", address: derived.account, venues: ["xo"] })], DEFAULT_SWITCHES, "cockpit");
    expect(onBase[0]).toMatchObject({ kind: "skip", outcome: { kind: "unsupported" } });
  });

  it("the same venue asked about the same address twice (owner and account both selected) is read once", () => {
    const derived = deriveKernelAccount(EOA);
    if (!derived.ok) throw new Error("derive");
    const plan = planReads(
      [binding({ id: "a", venues: ["xo"] }), binding({ id: "k", kind: "kernel", chain: "eip155:3223", address: derived.account, venues: ["xo"] })],
      DEFAULT_SWITCHES,
      "cockpit",
    );
    expect(plan).toHaveLength(1);
  });

  it("Polymarket: an owner goes through the venue's profile lookup, a pasted wallet is used as it is", () => {
    const plan = planReads([binding({ id: "a", venues: ["polymarket"] }), binding({ id: "w", kind: "venue_proxy", address: "0x" + "ab".repeat(20), venues: ["polymarket"] })], DEFAULT_SWITCHES, "cockpit");
    expect(plan[0]).toMatchObject({ resolution: "profile_lookup", address: EOA });
    expect(plan[1]).toMatchObject({ resolution: "direct" });
  });

  it("a Solana address goes to Pascal only, and an EVM address is not offered to Pascal", () => {
    const sol = planReads([binding({ id: "s", kind: "solana", chain: "solana", address: SOLANA, venues: ["pascal", "trueo"] })], DEFAULT_SWITCHES, "cockpit");
    expect(sol[0]).toMatchObject({ kind: "run", venue: "pascal" });
    expect(sol[1]).toMatchObject({ kind: "skip", outcome: { kind: "unsupported" } });
    const evm = planReads([binding({ id: "a", venues: ["pascal"] })], DEFAULT_SWITCHES, "cockpit");
    expect(evm[0]).toMatchObject({ kind: "skip", outcome: { kind: "unsupported" } });
  });

  it("a venue with no position reader in this build says so, instead of showing an empty table", () => {
    const plan = planReads([binding({ id: "a", venues: ["hyperliquid", "manifold"] })], DEFAULT_SWITCHES, "cockpit");
    for (const item of plan) {
      expect(item.kind).toBe("skip");
      if (item.kind === "skip") expect(item.outcome.kind).toBe("unsupported");
    }
    expect(POSITION_READERS.has("hyperliquid")).toBe(false);
  });

  it("M0-2 style states: restricted venues are 'off', Cockpit-only venues need the Cockpit, switched-off venues are off", () => {
    const standalone = planReads([binding({ id: "a", venues: ["kalshi", "limitless", "trueo"] })], switches({ trueo: false }), "standalone");
    expect(standalone.map((item) => (item.kind === "skip" ? item.outcome.kind : "run"))).toEqual(["off", "needs_cockpit", "off"]);
    const kalshi = standalone[0];
    expect(kalshi?.kind === "skip" && kalshi.outcome.kind === "off" && kalshi.outcome.reason).toBe("restricted_off");
    const trueo = standalone[2];
    expect(trueo?.kind === "skip" && trueo.outcome.kind === "off" && trueo.outcome.reason).toBe("switched_off");
  });

  it("a restricted venue is still 'off' when switched on without accepting its clause, and is not a reader anyway", () => {
    const plan = planReads([binding({ id: "a", venues: ["kalshi"] })], switches({ kalshi: true }), "cockpit");
    expect(plan[0]).toMatchObject({ kind: "skip", outcome: { kind: "off", reason: "restricted_off" } });
    const accepted = planReads([binding({ id: "a", venues: ["kalshi"] })], switches({ kalshi: true }, { kalshi: DISCLOSURE_VERSION }), "cockpit");
    expect(accepted[0]).toMatchObject({ kind: "skip", outcome: { kind: "unsupported" } });
  });

  it("an entry with no address is not read", () => {
    const plan = planReads([binding({ id: "x", address: null, venues: ["trueo"] })], DEFAULT_SWITCHES, "cockpit");
    expect(plan[0]).toMatchObject({ kind: "skip", outcome: { kind: "unsupported" } });
  });
});
