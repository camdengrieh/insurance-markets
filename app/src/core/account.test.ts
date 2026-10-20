import { describe, expect, it } from "vitest";

import { KERNEL_PROXY_RUNTIME_CODE } from "@shared/xo/chain/constants";

import { ACCOUNT_CHAINS, accountRows, chainById, classifyEoaCode, deriveKernelAccount, eoaWording, observeCode, type ChainObservation } from "./account";
import type { EvmAddress } from "./address";
import { NO_FACTS, readFacts, type CapabilityFacts } from "./capabilities";

const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as EvmAddress;
// The Kernel v3.1 account that Anvil account 0 owns (docs/phase1-gap-closing.md section 0).
const ANVIL_0_ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d";

const KERNEL: ChainObservation = { code: { kind: "kernel_proxy" } };
const PROVEN_DOOR_A: CapabilityFacts = readFacts({ door_a_bundler_admits_first_userop: "yes" });

function row(rows: ReturnType<typeof accountRows>, chainId: number) {
  const found = rows.find((entry) => entry.chain.chainId === chainId);
  if (found === undefined) throw new Error(`no row for ${chainId}`);
  return found;
}

describe("deriveKernelAccount (M2-2)", () => {
  it("derives the known account for the Anvil test owner, from either spelling", () => {
    for (const input of [ANVIL_0, ANVIL_0.toLowerCase(), `  ${ANVIL_0}  `]) {
      const result = deriveKernelAccount(input);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.owner).toBe(ANVIL_0);
      expect(result.account).toBe(ANVIL_0_ACCOUNT);
    }
  });

  it("refuses a bad owner with the address check's reason", () => {
    expect(deriveKernelAccount(`${ANVIL_0.slice(0, -1)}7`)).toMatchObject({ ok: false, code: "bad_checksum" });
    expect(deriveKernelAccount("0x0000000000000000000000000000000000000000")).toMatchObject({ ok: false, code: "zero_address" });
    expect(deriveKernelAccount("nonsense")).toMatchObject({ ok: false, code: "not_an_address" });
    expect(deriveKernelAccount(undefined)).toMatchObject({ ok: false });
  });

  it("derives a different account for a different owner", () => {
    const other = deriveKernelAccount("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(other.ok && other.account).not.toBe(ANVIL_0_ACCOUNT);
  });
});

describe("observeCode", () => {
  it("classifies eth_getCode answers", () => {
    expect(observeCode(KERNEL_PROXY_RUNTIME_CODE)).toEqual({ kind: "kernel_proxy" });
    expect(observeCode(KERNEL_PROXY_RUNTIME_CODE.toUpperCase().replace("0X", "0x"))).toEqual({ kind: "kernel_proxy" });
    expect(observeCode("0x")).toEqual({ kind: "none" });
    expect(observeCode("0x6080604052")).toEqual({ kind: "other_code" });
  });

  it("treats anything unusable as unreachable, never as undeployed", () => {
    expect(observeCode(null)).toEqual({ kind: "unreachable" });
    expect(observeCode(undefined)).toEqual({ kind: "unreachable" });
    expect(observeCode("")).toEqual({ kind: "unreachable" });
    expect(observeCode("nope")).toEqual({ kind: "unreachable" });
    expect(observeCode("0xabc")).toEqual({ kind: "unreachable" });
  });
});

describe("accountRows", () => {
  it("lists the same derived account on every chain with each chain's own state (M2-8)", () => {
    const rows = accountRows({
      owner: ANVIL_0,
      observations: { 8453: KERNEL, 137: { code: { kind: "unreachable" } }, 56: { code: { kind: "none" } } },
      facts: NO_FACTS,
    });
    expect(rows).toHaveLength(ACCOUNT_CHAINS.length);
    expect(new Set(rows.map((entry) => entry.address))).toEqual(new Set([ANVIL_0_ACCOUNT]));
    expect(new Set(rows.map((entry) => entry.owner))).toEqual(new Set([ANVIL_0]));
    expect(row(rows, 8453).status).toBe("code-present");
    expect(row(rows, 137).status).toBe("rpc-unreachable");
    expect(row(rows, 56).status).toBe("derived");
    expect(row(rows, 42161).status).toBe("derived");
    expect(row(rows, 3223).chain.isXo).toBe(true);
  });

  it("is never a deposit target before code is present (M2-3)", () => {
    const rows = accountRows({
      owner: ANVIL_0,
      observations: { 8453: { code: { kind: "none" } }, 137: { code: { kind: "unreachable" } }, 56: { code: { kind: "other_code" } } },
      facts: PROVEN_DOOR_A,
    });
    for (const chainId of [8453, 137, 56, 42161, 3223]) {
      expect(row(rows, chainId).deposit.allowed, String(chainId)).toBe(false);
      expect(row(rows, chainId).deposit.reasons.length).toBeGreaterThan(0);
    }
    expect(row(rows, 8453).deposit.reasons.join(" ")).toContain("counterfactual");
  });

  it("never renders an unreachable RPC as undeployed (M2-3)", () => {
    const unreachable = row(accountRows({ owner: ANVIL_0, observations: { 8453: { code: { kind: "unreachable" } } }, facts: NO_FACTS }), 8453);
    expect(unreachable.status).toBe("rpc-unreachable");
    expect(unreachable.statusText).toContain("unreachable");
    expect(unreachable.statusText).toContain("unknown");
    expect(unreachable.statusText.toLowerCase()).not.toContain("undeployed");
    expect(unreachable.statusText.toLowerCase()).not.toContain("not deployed");
    expect(unreachable.statusText.toLowerCase()).not.toContain("counterfactual");
    expect(unreachable.deposit.reasons.join(" ").toLowerCase()).not.toContain("not deployed");
  });

  it("says counterfactual only when a reachable RPC returned no code, and 'not checked' otherwise", () => {
    const none = row(accountRows({ owner: ANVIL_0, observations: { 8453: { code: { kind: "none" } } }, facts: NO_FACTS }), 8453);
    expect(none.statusText).toContain("counterfactual");
    expect(none.statusText).toContain("no code seen");
    const unchecked = row(accountRows({ owner: ANVIL_0, observations: {}, facts: NO_FACTS }), 8453);
    expect(unchecked.statusText).toContain("not checked");
  });

  it("offers a deposit target on a deployed non-XO account, and on XO only after door (a) is proven", () => {
    const observations = { 8453: KERNEL, 3223: KERNEL };
    const unproven = accountRows({ owner: ANVIL_0, observations, facts: NO_FACTS });
    expect(row(unproven, 8453).deposit).toEqual({ allowed: true, reasons: [] });
    expect(row(unproven, 3223).status).toBe("code-present");
    expect(row(unproven, 3223).deposit.allowed).toBe(false);
    expect(row(unproven, 3223).deposit.reasons.join(" ")).toContain("door a");
    const proven = accountRows({ owner: ANVIL_0, observations, facts: PROVEN_DOOR_A });
    expect(row(proven, 3223).deposit.allowed).toBe(true);
    // A recorded "no" does not count as proven.
    const failed = accountRows({ owner: ANVIL_0, observations, facts: readFacts({ door_a_bundler_admits_first_userop: "no" }) });
    expect(row(failed, 3223).deposit.allowed).toBe(false);
  });

  it("climbs the ladder only on positive evidence", () => {
    const ladder = (observation: ChainObservation) => row(accountRows({ owner: ANVIL_0, observations: { 3223: observation }, facts: PROVEN_DOOR_A }), 3223);
    expect(ladder(KERNEL).status).toBe("code-present");
    expect(ladder({ ...KERNEL, venueRegistered: true }).status).toBe("venue-registered");
    expect(ladder({ ...KERNEL, venueRegistered: true, tradingEnabled: true }).status).toBe("trading-enabled");
    expect(ladder({ ...KERNEL, venueRegistered: null, tradingEnabled: null }).status).toBe("code-present");
  });

  it("flags contradictions instead of promoting them", () => {
    const registeredWithoutCode = row(accountRows({ owner: ANVIL_0, observations: { 3223: { code: { kind: "none" }, venueRegistered: true } }, facts: PROVEN_DOOR_A }), 3223);
    expect(registeredWithoutCode.status).toBe("derived");
    expect(registeredWithoutCode.anomalies).toEqual(["registry_without_deployment"]);
    expect(registeredWithoutCode.deposit.allowed).toBe(false);
    const tradingWithoutRegistration = row(accountRows({ owner: ANVIL_0, observations: { 3223: { ...KERNEL, tradingEnabled: true } }, facts: PROVEN_DOOR_A }), 3223);
    expect(tradingWithoutRegistration.status).toBe("code-present");
    expect(tradingWithoutRegistration.anomalies).toEqual(["trading_without_registration"]);
    expect(tradingWithoutRegistration.deposit.allowed).toBe(false);
    const foreign = row(accountRows({ owner: ANVIL_0, observations: { 8453: { code: { kind: "other_code" } } }, facts: NO_FACTS }), 8453);
    expect(foreign.status).toBe("foreign-code");
    expect(foreign.anomalies).toEqual(["foreign_code"]);
  });

  it("lists only the chains asked for", () => {
    const base = chainById(8453);
    expect(base?.rpcService).toBe("rpc_base");
    const rows = accountRows({ owner: ANVIL_0, observations: {}, facts: NO_FACTS, chains: base === undefined ? [] : [base] });
    expect(rows.map((entry) => entry.chain.chainId)).toEqual([8453]);
    expect(chainById(31337)).toBeUndefined();
  });

  it("has unique chain ids and CAIP-2 ids", () => {
    expect(new Set(ACCOUNT_CHAINS.map((entry) => entry.chainId)).size).toBe(ACCOUNT_CHAINS.length);
    for (const entry of ACCOUNT_CHAINS) expect(entry.caip2).toBe(`eip155:${entry.chainId}`);
  });
});

describe("the owner EOA's wording (DT2)", () => {
  const DELEGATE = "0x1111111111111111111111111111111111111111";

  it("detects an EIP-7702 delegation indicator", () => {
    expect(classifyEoaCode(`0xef0100${DELEGATE.slice(2)}`)).toEqual({ kind: "delegated", delegate: DELEGATE });
    expect(classifyEoaCode("0x")).toEqual({ kind: "plain" });
    expect(classifyEoaCode("0x6080")).toEqual({ kind: "contract" });
    expect(classifyEoaCode("0xef0100aa")).toEqual({ kind: "contract" });
    expect(classifyEoaCode(null)).toEqual({ kind: "unreachable" });
    expect(classifyEoaCode("zz")).toEqual({ kind: "unreachable" });
  });

  it("calls the address a plain EOA only after DT2 is recorded as proven", () => {
    const plain = classifyEoaCode("0x");
    expect(eoaWording(NO_FACTS, plain)).toBe("address (plain-EOA status unproven)");
    expect(eoaWording(NO_FACTS, null)).toBe("address (plain-EOA status unproven)");
    expect(eoaWording(readFacts({ paybox_address_is_plain_eoa: "yes" }), plain)).toBe("EOA: no delegation seen");
    // A recorded yes with no observation, or an unreachable one, still does not say "EOA".
    expect(eoaWording(readFacts({ paybox_address_is_plain_eoa: "yes" }), null)).toBe("address (plain-EOA status unproven)");
    expect(eoaWording(readFacts({ paybox_address_is_plain_eoa: "yes" }), classifyEoaCode(null))).toBe("address (plain-EOA status unproven)");
  });

  it("says so when the address is delegated, whatever the recorded fact", () => {
    const delegated = classifyEoaCode(`0xef0100${DELEGATE.slice(2)}`);
    expect(eoaWording(NO_FACTS, delegated)).toBe(`delegated to ${DELEGATE} (EIP-7702)`);
    expect(eoaWording(readFacts({ paybox_address_is_plain_eoa: "yes" }), delegated)).toContain("delegated to");
    expect(eoaWording(NO_FACTS, classifyEoaCode("0x6080"))).toBe("has contract code: not a plain EOA");
  });
});
