import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAddress, isAddress, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS } from "../origins.js";
import { ERC20_ABI, HOOK_ABI, MANAGER_ABI, MARKET_ABI, QUOTER_ABI, STATE_VIEW_ABI, VAULT_ABI } from "./abi.js";
import { deploymentFor, TRUEO_DEPLOYMENTS } from "./constants.js";
import { isAdapterFailure } from "./errors.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("trueo pinned constants", () => {
  it("every pinned address is the strict EIP-55 form, not merely valid lowercase (W0-5)", () => {
    for (const deployment of Object.values(TRUEO_DEPLOYMENTS)) {
      const addresses = [deployment.manager, deployment.tyd, deployment.usdc, deployment.stateView, deployment.quoter, ...deployment.hooks.map((hook) => hook.address)];
      expect(new Set(addresses.map((a) => a.toLowerCase())).size).toBe(addresses.length);
      for (const address of addresses) {
        expect(isAddress(address, { strict: true })).toBe(true);
        expect(getAddress(address)).toBe(address);
      }
    }
  });

  it("holds exactly the values the research notes record for Base (docs/research/11-trueo.md 4.1, 11.4)", () => {
    const base = deploymentFor(8453);
    expect(base.manager).toBe("0x61A98Bef11867c69489B91f340fE545eEfc695d7");
    expect(base.tyd).toBe("0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B");
    expect(base.usdc).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(base.hooks.map((h) => [h.generation, h.address])).toEqual([
      ["v2.0.0", "0x3E83479B2276EcFb7C7181F67b5d092d3511e0C4"],
      ["v1.1.0", "0x1cFeAD8E66cebC5E51093Dfd247Ad34f841740c4"],
    ]);
    // The notes print these two in lowercase; the pin is their checksummed form.
    expect(base.stateView.toLowerCase()).toBe("0xa3c0c9b65bad0b08107aa264b0f3db444b867a71");
    expect(base.quoter.toLowerCase()).toBe("0x0d5e0f971ed27fbff6c2837bf31316121532048d");
    expect([base.tydDecimals, base.outcomeDecimals, base.caip2]).toEqual([6, 18, "eip155:8453"]);
  });

  it("fails closed for any chain that has no pinned deployment (the Ethereum move has no addresses)", () => {
    for (const chainId of [1, 3223, 84532, 0, -1, 8453.5]) {
      let failure;
      try {
        deploymentFor(chainId);
      } catch (error) {
        failure = error;
      }
      expect(isAdapterFailure(failure)).toBe(true);
      expect(failure).toMatchObject({ code: "NOT_SUPPORTED", detail: "chain_not_pinned" });
    }
  });

  it("names the public RPC origin that sdk/venues/origins.ts lists for the rpc_base service", () => {
    const entry = BROWSER_DIRECT_ORIGINS.find((candidate) => candidate.service === "rpc_base");
    expect(new URL(deploymentFor(8453).defaultRpcUrl).origin).toBe(entry?.origin);
  });

  it("contains an address literal in constants.ts only (no address in any other non-test, non-fixture source)", () => {
    const literal = /0x[0-9a-fA-F]{40}\b/;
    for (const name of readdirSync(HERE)) {
      if (!name.endsWith(".ts") || /\.test\.ts$/.test(name) || name === "constants.ts") continue;
      expect(readFileSync(join(HERE, name), "utf8"), name).not.toMatch(literal);
    }
  });
});

// Selectors the research recorded with `cast sig` from Sourcify-verified ABIs (docs/research/11-trueo.md 11.2).
// A signature typed wrong here would change its selector, so this pins the ABI text to the verified one.
describe("trueo ABI selectors match the verified ones in the research notes", () => {
  const noted: Array<[string, "manager" | "market" | "hook" | "stateView" | "vault", string]> = [
    ["numberOfActiveMarkets", "manager", "0x7d6a0d1a"],
    ["getActiveMarketAddress", "manager", "0xdd5adfa3"],
    ["isActiveMarket", "manager", "0x6ec38a4e"],
    ["VERSION", "market", "0xffa1ad74"],
    ["getCurrentStatus", "market", "0xa3dd2619"],
    ["winningPosition", "market", "0x2486d671"],
    ["paymentToken", "market", "0x3013ce29"],
    ["yesToken", "market", "0xf0d9bb20"],
    ["noToken", "market", "0x11a9f10a"],
    ["getPoolKeys", "market", "0xd183feee"],
    ["feeNumerator", "hook", "0xe86dea4a"],
    ["poolPaused", "hook", "0x4327623d"],
    ["getSlot0", "stateView", "0xc815641c"],
    ["getLiquidity", "stateView", "0xfa6793d5"],
    ["convertToAssets", "vault", "0x07a2d13a"],
  ];
  const abis = { manager: MANAGER_ABI, market: MARKET_ABI, hook: HOOK_ABI, stateView: STATE_VIEW_ABI, vault: VAULT_ABI } as const;

  it.each(noted)("%s -> %s %s", (name, where, selector) => {
    const item = (abis[where] as ReadonlyArray<{ type: string; name?: string }>).find((entry) => entry.type === "function" && entry.name === name);
    expect(item, name).toBeDefined();
    expect(toFunctionSelector(item as never)).toBe(selector);
  });

  it("matches the V4Quoter selectors (recomputed with cast from the same signature) and the ERC-20 ones", () => {
    const find = (abi: ReadonlyArray<{ type: string; name?: string }>, name: string): never => abi.find((entry) => entry.type === "function" && entry.name === name) as never;
    expect(toFunctionSelector(find(QUOTER_ABI, "quoteExactInputSingle"))).toBe("0xaa9d21cb");
    expect(toFunctionSelector(find(QUOTER_ABI, "quoteExactOutputSingle"))).toBe("0x58733073");
    expect(toFunctionSelector(find(ERC20_ABI, "balanceOf"))).toBe("0x70a08231");
    expect(toFunctionSelector(find(ERC20_ABI, "decimals"))).toBe("0x313ce567");
  });

  it("has no function that writes: every function in every ABI is view, pure or a simulated quote", () => {
    const all = [MANAGER_ABI, MARKET_ABI, HOOK_ABI, STATE_VIEW_ABI, QUOTER_ABI, ERC20_ABI, VAULT_ABI] as const;
    const writers: string[] = [];
    for (const abi of all) {
      for (const entry of abi as ReadonlyArray<{ type: string; name?: string; stateMutability?: string }>) {
        if (entry.type !== "function") continue;
        if (entry.stateMutability !== "view" && entry.stateMutability !== "pure") writers.push(entry.name ?? "?");
      }
    }
    // The two quote functions are the only non-view entries: V4Quoter reverts internally to return values, and
    // the adapter only ever calls it with eth_call.
    expect(writers.sort()).toEqual(["quoteExactInputSingle", "quoteExactOutputSingle"]);
  });
});
