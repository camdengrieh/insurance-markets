import { describe, expect, it } from "vitest";

import { BASE_USDC, USDC_E_ADDRESS } from "@shared/xo/chain/constants";

import { ACCOUNT_CHAINS, chainById } from "../../core/account";
import { atomicText, nativeSymbol, readChainBalances, readExplorerBalances } from "./balances";
import { usdceDisagreement } from "./BalancesPanel";
import { fakeNetwork, manualClock, type FakeChain } from "./testkit";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d";
const holders = { owner: OWNER, account: ACCOUNT };
const BASE_HOST = "base-rpc.publicnode.com";
const XO_HOST = "rpc-mainnet-2.xo.market";

const chain = (id: number) => chainById(id) as NonNullable<ReturnType<typeof chainById>>;
const deps = (net: ReturnType<typeof fakeNetwork>) => ({ fetch: net.fetch, nowMs: manualClock(1_760_000_000_000).nowMs });

describe("atomicText", () => {
  it("is exact, rounds toward zero and never prints a non-zero amount as 0", () => {
    expect(atomicText(2_500_000n, 6)).toBe("2.5");
    expect(atomicText(1_234_567_890_123_456_789n, 18)).toBe("1.234567");
    expect(atomicText(0n, 6)).toBe("0");
    expect(atomicText(1n, 18)).toBe("<0.000001");
    expect(atomicText(123_456_789n, 6)).toBe("123.456789");
    expect(atomicText(1_000_000_000_000n, 6)).toBe("1,000,000");
  });

  it("native symbols are fixed text and unknown chains get a neutral name", () => {
    expect(nativeSymbol(8453)).toBe("ETH");
    expect(nativeSymbol(3223)).toBe("native coin");
    expect(nativeSymbol(999_999)).toBe("native coin");
    for (const entry of ACCOUNT_CHAINS) expect(nativeSymbol(entry.chainId).length).toBeGreaterThan(0);
  });
});

describe("chain balances", () => {
  const baseChain = (): FakeChain => ({
    multicall: true,
    batch: true,
    native: { [OWNER.toLowerCase()]: 10n ** 18n },
    tokens: { [BASE_USDC.toLowerCase()]: { [OWNER.toLowerCase()]: 7_500_000n } },
  });

  it("reads native and pinned-token balances for the owner and the account", async () => {
    const net = fakeNetwork({ rpc: { [BASE_HOST]: baseChain() } });
    const state = await readChainBalances(deps(net), chain(8453), holders);
    expect(state.state).toBe("ok");
    if (state.state !== "ok") return;
    const find = (holder: string, symbol: string) => state.rows.find((row) => row.holder === holder && row.symbol === symbol);
    expect(find("owner", "ETH")?.text).toBe("1");
    expect(find("owner", "USDC")?.text).toBe("7.5");
    // Read, and zero: the account holds nothing, which is a real answer.
    expect(find("account", "USDC")?.raw).toBe(0n);
    expect(find("account", "USDC")?.text).toBe("0");
    expect(net.calls).toHaveLength(1);
    expect(state.rows.every((row) => row.source === "rpc_multicall")).toBe(true);
  });

  it("a balance the chain could not give is null and prints no number (never 0)", async () => {
    // No token table at all: the token calls revert inside the multicall.
    const net = fakeNetwork({ rpc: { [BASE_HOST]: { multicall: true, batch: true, native: { [OWNER.toLowerCase()]: 5n } } } });
    const state = await readChainBalances(deps(net), chain(8453), holders);
    if (state.state !== "ok") throw new Error("expected ok");
    const usdc = state.rows.filter((row) => row.symbol === "USDC");
    expect(usdc.map((row) => row.raw)).toEqual([null, null]);
    expect(usdc.map((row) => row.text)).toEqual([null, null]);
  });

  it("a chain with no public RPC in this build is 'no_rpc', not an empty wallet", async () => {
    const net = fakeNetwork({});
    const state = await readChainBalances(deps(net), chain(42161), holders);
    expect(state).toEqual({ state: "no_rpc" });
    expect(net.calls).toHaveLength(0);
  });

  it("an unreachable chain fails on its own and says why", async () => {
    const net = fakeNetwork({ rpc: { [BASE_HOST]: { down: true } } });
    const state = await readChainBalances(deps(net), chain(8453), holders);
    expect(state.state).toBe("failed");
    if (state.state === "failed") expect(state.failure.code).toBe("UNKNOWN");
  });

  it("asks only for tokens the repository pins", async () => {
    const net = fakeNetwork({ rpc: { [XO_HOST]: { multicall: false, batch: true, tokens: { [USDC_E_ADDRESS.toLowerCase()]: { [ACCOUNT.toLowerCase()]: 3_000_000n } } } } });
    const state = await readChainBalances(deps(net), chain(3223), holders);
    if (state.state !== "ok") throw new Error("expected ok");
    expect(new Set(state.rows.map((row) => row.symbol))).toEqual(new Set(["native coin", "USDC.e"]));
    expect(state.rows.find((row) => row.holder === "account" && row.symbol === "USDC.e")?.text).toBe("3");
    expect(state.rows.every((row) => row.source === "rpc")).toBe(true);
  });
});

describe("XO explorer", () => {
  const explorerUrl = "explorer-mainnet.xo.market";
  const explorer = (info: unknown, tokens: unknown, statuses: { info?: number; tokens?: number } = {}) =>
    fakeNetwork({
      get: {
        [`${explorerUrl}/api/v2/addresses/${ACCOUNT}`]: () => ({ status: statuses.info ?? 200, body: info }),
        [`${explorerUrl}/api/v2/addresses/${ACCOUNT}/token-balances`]: () => ({ status: statuses.tokens ?? 200, body: tokens }),
      },
    });

  it("parses a Blockscout-style answer and puts the token symbol in the untrusted slot", async () => {
    const net = explorer(
      { coin_balance: "123456789012345678" },
      [
        { token: { address_hash: USDC_E_ADDRESS.toLowerCase(), decimals: "6", symbol: "<img src=x onerror=alert(1)>", type: "ERC-20" }, value: "3000000" },
        { token: { address: "not an address", decimals: null, symbol: null }, value: "5" },
        { nonsense: true },
      ],
    );
    const result = await readExplorerBalances(deps(net), ACCOUNT);
    expect(result.native).toBe(123456789012345678n);
    expect(result.tokens).toHaveLength(2);
    expect(result.skipped).toBe(1);
    const first = result.tokens[0];
    expect(first?.address).toBe(USDC_E_ADDRESS);
    expect(first?.raw).toBe(3_000_000n);
    // Branded: only <UntrustedText> may render it.
    expect(first?.symbol).toMatchObject({ untrusted: true });
    expect(result.tokens[1]?.address).toBeNull();
    expect(result.tokens[1]?.decimals).toBeNull();
  });

  it("a 404 means 'the explorer has no record', which is null, not zero", async () => {
    const net = explorer(null, null, { info: 404, tokens: 404 });
    const result = await readExplorerBalances(deps(net), ACCOUNT);
    expect(result.native).toBeNull();
    expect(result.tokens).toEqual([]);
  });

  it("a server error or a wrong shape is a failure of this read, not an empty list", async () => {
    await expect(readExplorerBalances(deps(explorer({}, [], { info: 503 })), ACCOUNT)).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(readExplorerBalances(deps(explorer({ coin_balance: -1 }, [])), ACCOUNT)).rejects.toMatchObject({ code: "SCHEMA_DRIFT" });
    await expect(readExplorerBalances(deps(explorer({}, { not: "a list" })), ACCOUNT)).rejects.toMatchObject({ code: "SCHEMA_DRIFT" });
  });

  it("names a disagreement between the RPC and the explorer about USDC.e", async () => {
    const rpcNet = fakeNetwork({ rpc: { [XO_HOST]: { multicall: true, batch: true, tokens: { [USDC_E_ADDRESS.toLowerCase()]: { [ACCOUNT.toLowerCase()]: 3_000_000n } } } } });
    const rpc = await readChainBalances(deps(rpcNet), chain(3223), holders);
    const agree = await readExplorerBalances(
      deps(explorer({ coin_balance: "0" }, [{ token: { address_hash: USDC_E_ADDRESS, decimals: "6", symbol: "USDC.e" }, value: "3000000" }])),
      ACCOUNT,
    );
    const differ = await readExplorerBalances(
      deps(explorer({ coin_balance: "0" }, [{ token: { address_hash: USDC_E_ADDRESS, decimals: "6", symbol: "USDC.e" }, value: "2000000" }])),
      ACCOUNT,
    );
    expect(usdceDisagreement(rpc, agree)).toBeNull();
    expect(usdceDisagreement(rpc, differ)).toMatch(/disagree/);
    expect(usdceDisagreement(rpc, "failed")).toBeNull();
    expect(usdceDisagreement(undefined, agree)).toBeNull();
  });
});
