import { encodeFunctionData, getAddress, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import { BASE_USDC } from "@shared/xo/chain/constants";

import { chainById } from "../../core/account";
import { createChainReader, MULTICALL3_ADDRESS, rpcUrlOf, uintOf } from "./rpc";
import { fakeNetwork, manualClock, type FakeChain } from "./testkit";

const BASE_HOST = "base-rpc.publicnode.com";
const HOLDER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const base = chainById(8453) as NonNullable<ReturnType<typeof chainById>>;
const balanceOf = (holder: string) => encodeFunctionData({ abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [getAddress(holder)] });

function setup(chain: FakeChain) {
  const net = fakeNetwork({ rpc: { [BASE_HOST]: chain } });
  const clock = manualClock(1_760_000_000_000);
  const reader = createChainReader({ fetch: net.fetch, nowMs: clock.nowMs }, base);
  if (reader === null) throw new Error("no reader");
  return { net, reader };
}

const chainWith = (overrides: Partial<FakeChain> = {}): FakeChain => ({
  multicall: true,
  batch: true,
  native: { [HOLDER]: 5n * 10n ** 18n },
  tokens: { [BASE_USDC.toLowerCase()]: { [HOLDER]: 2_500_000n } },
  ...overrides,
});

describe("chain reads", () => {
  it("the RPC url comes from the closed origin list, and a chain without a service has no reader", () => {
    expect(rpcUrlOf(base)).toBe("https://base-rpc.publicnode.com/");
    const arbitrum = chainById(42161) as NonNullable<ReturnType<typeof chainById>>;
    expect(rpcUrlOf(arbitrum)).toBeNull();
    expect(createChainReader({ fetch: fakeNetwork({}).fetch, nowMs: () => 0 }, arbitrum)).toBeNull();
  });

  it("reads native and token balances in ONE multicall request", async () => {
    const { net, reader } = setup(chainWith());
    const results = await reader.read([
      { kind: "native", holder: HOLDER },
      { kind: "call", to: BASE_USDC, data: balanceOf(HOLDER) },
      { kind: "call", to: BASE_USDC, data: balanceOf(OTHER) },
    ]);
    expect(results.map(uintOf)).toEqual([5n * 10n ** 18n, 2_500_000n, 0n]);
    expect(reader.mode()).toBe("multicall");
    expect(net.calls).toHaveLength(1);
    expect(net.methods()).toEqual(["eth_call"]);
  });

  it("falls back to one JSON-RPC batch when the chain has no Multicall3", async () => {
    const { net, reader } = setup(chainWith({ multicall: false }));
    const results = await reader.read([
      { kind: "native", holder: HOLDER },
      { kind: "call", to: BASE_USDC, data: balanceOf(HOLDER) },
    ]);
    expect(results.map(uintOf)).toEqual([5n * 10n ** 18n, 2_500_000n]);
    expect(reader.mode()).toBe("batch");
    // The Multicall3 attempt, then a single batch array.
    expect(net.calls).toHaveLength(2);
    expect(Array.isArray(net.calls[1]?.body)).toBe(true);
    expect(new Set(net.methods())).toEqual(new Set(["eth_call", "eth_getBalance"]));
  });

  it("falls back to single requests when the endpoint refuses arrays", async () => {
    const { reader } = setup(chainWith({ multicall: false, batch: false }));
    const results = await reader.read([
      { kind: "native", holder: HOLDER },
      { kind: "call", to: BASE_USDC, data: balanceOf(HOLDER) },
    ]);
    expect(results.map(uintOf)).toEqual([5n * 10n ** 18n, 2_500_000n]);
    expect(reader.mode()).toBe("single");
  });

  it("a read that failed is null, never 0", async () => {
    // The token is unknown to the fake chain, so the inner call reverts.
    const { reader } = setup(chainWith({ tokens: {} }));
    const results = await reader.read([{ kind: "call", to: BASE_USDC, data: balanceOf(HOLDER) }]);
    expect(results[0]?.ok).toBe(false);
    expect(uintOf(results[0])).toBeNull();
    expect(uintOf(undefined)).toBeNull();
  });

  it("an unreachable endpoint throws from read() and is 'unreachable', never 'none', for codes", async () => {
    const { reader } = setup(chainWith({ down: true }));
    await expect(reader.read([{ kind: "native", holder: HOLDER }])).rejects.toThrow();
    const codes = await reader.readCodes([HOLDER, OTHER]);
    expect(codes.map((code) => code.kind)).toEqual(["unreachable", "unreachable"]);
  });

  it("an HTTP error is 'unreachable' for codes too (not an empty account)", async () => {
    const { reader } = setup(chainWith({ status: 503 }));
    expect((await reader.readCodes([HOLDER]))[0]?.kind).toBe("unreachable");
  });

  it("a reachable chain answering '0x' is 'none'; real Kernel proxy code is recognised", async () => {
    const { KERNEL_PROXY_RUNTIME_CODE } = await import("@shared/xo/chain/constants");
    const { reader } = setup(chainWith({ codes: { [OTHER]: KERNEL_PROXY_RUNTIME_CODE, [HOLDER]: "0x6001600055" } }));
    const kinds = (await reader.readCodes([OTHER, HOLDER, "0x3333333333333333333333333333333333333333"])).map((code) => code.kind);
    expect(kinds).toEqual(["kernel_proxy", "other_code", "none"]);
  });

  it("only read methods are ever sent, and a non-address is refused before any request", async () => {
    const { net, reader } = setup(chainWith());
    await reader.readCodes([HOLDER]);
    await reader.read([{ kind: "native", holder: HOLDER }]);
    const allowed = new Set(["eth_getCode", "eth_call", "eth_getBalance"]);
    for (const method of net.methods()) expect(allowed.has(method)).toBe(true);
    const before = net.calls.length;
    await expect(reader.read([{ kind: "native", holder: "not-an-address" }])).rejects.toThrow(RangeError);
    await expect(reader.read(Array.from({ length: 61 }, () => ({ kind: "native" as const, holder: HOLDER })))).rejects.toThrow(RangeError);
    expect(net.calls.length).toBe(before);
  });

  it("the Multicall3 address is the canonical one with a valid checksum", () => {
    expect(getAddress(MULTICALL3_ADDRESS)).toBe(MULTICALL3_ADDRESS);
  });
});
