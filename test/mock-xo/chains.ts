// The chain behind the mock's read surfaces: the anvil chains of test/anvil (chain 3223 with the real XO
// account stack, and the derived Base variant), and the few facts the registry needs from them.
//
// This file talks to anvil with plain JSON-RPC and viem encoders only. It does NOT use the production
// readers in src/xo/chain/reads.ts, so a test of those readers against this mock is not a test of the
// code against itself.

import { decodeFunctionResult, encodeFunctionData, pad, type Address, type Hex } from "viem";

import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from "../../src/xo/chain/abi.js";
import {
  ACCOUNT_DEPLOYED_TOPIC,
  BASE_CHAIN_ID,
  BASE_USDC,
  BASE_WARP_ROUTER,
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE,
  ENTRY_POINT_V07,
  HYPERLANE_MAILBOX,
  MARKET_MANAGER,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
  XO_ORACLE,
  XO_WARP_ROUTE,
} from "../../src/xo/chain/constants.js";
import { startXoChain, type XoChain } from "../anvil/chain.js";
import type { MockClock } from "./clock.js";
import { managerStubRuntime } from "./manager-stub.js";

export type ChainName = "xo" | "base";

export interface JsonRpcRequest {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export const CHAIN_IDS: Readonly<Record<ChainName, number>> = { xo: XO_CHAIN_ID, base: BASE_CHAIN_ID };

export interface ChainsOptions {
  // true starts the chain, false leaves it out, an XoChain is used as it is (and not stopped by the mock).
  readonly xo: boolean | XoChain;
  readonly base: boolean | XoChain;
}

export type ChainsStart = { readonly ok: true; readonly chains: MockChains } | { readonly ok: false; readonly reason: string };

export class MockChains {
  private constructor(
    readonly xo: XoChain | undefined,
    readonly base: XoChain | undefined,
    private readonly owned: readonly XoChain[],
  ) {}

  static async start(options: ChainsOptions): Promise<ChainsStart> {
    const owned: XoChain[] = [];
    const stopOwned = async (): Promise<void> => {
      await Promise.all(owned.map((chain) => chain.stop()));
    };
    const resolve = async (want: boolean | XoChain, kind: ChainName): Promise<XoChain | undefined | string> => {
      if (want === false) return undefined;
      if (want !== true) return want;
      const started = await startXoChain({ kind });
      if (!started.ok) return started.reason;
      owned.push(started.chain);
      return started.chain;
    };
    try {
      const xo = await resolve(options.xo, "xo");
      if (typeof xo === "string") {
        await stopOwned();
        return { ok: false, reason: xo };
      }
      const base = await resolve(options.base, "base");
      if (typeof base === "string") {
        await stopOwned();
        return { ok: false, reason: base };
      }
      await installMockContracts(xo, base);
      return { ok: true, chains: new MockChains(xo, base, owned) };
    } catch (error) {
      await stopOwned();
      throw error;
    }
  }

  chain(name: ChainName): XoChain | undefined {
    return name === "xo" ? this.xo : this.base;
  }

  async stop(): Promise<void> {
    await Promise.all(this.owned.map((chain) => chain.stop()));
  }

  // Sends one JSON-RPC request to the chain's anvil and returns its answer untouched (error objects
  // included). Throws when the chain is not part of this mock.
  async forward(name: ChainName, request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const chain = this.chain(name);
    if (chain === undefined) throw new ChainUnavailableError(name);
    const response = await fetch(chain.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, method: request.method, params: request.params ?? [] }),
      // A chain that stopped answering must fail a test, not hang it.
      signal: AbortSignal.timeout(15_000),
    });
    return (await response.json()) as JsonRpcResponse;
  }

  // A result or a thrown error: for the mock's own reads.
  async call<T>(name: ChainName, method: string, params: readonly unknown[] = []): Promise<T> {
    const answer = await this.forward(name, { id: 1, method, params });
    if (answer.error !== undefined) throw new Error(`${method} failed: ${answer.error.message}`);
    return answer.result as T;
  }

  // Moves the XO chain's time up to the mock clock: the next block gets the clock's second. A chain that is
  // already at or past that second is left alone. Only the XO chain is synced here (the Base variant has no
  // time-dependent contract; the Hyperlane emulation syncs it when it mines a block).
  async syncToClock(clock: MockClock): Promise<void> {
    await this.syncToSeconds(clock.nowSeconds());
  }

  async syncToSeconds(target: number, which: ChainName = "xo"): Promise<void> {
    if (this.chain(which) === undefined) return;
    const latest = await this.call<{ timestamp: Hex }>(which, "eth_getBlockByNumber", ["latest", false]);
    if (target <= Number(BigInt(latest.timestamp))) return;
    await this.call(which, "evm_setNextBlockTimestamp", [target]);
    await this.call(which, "evm_mine", []);
  }

  // eth_call that returns the data, or null when the call reverted (or the chain is not part of this mock).
  async tryCall(name: ChainName, to: Address, data: Hex): Promise<Hex | null> {
    if (this.chain(name) === undefined) return null;
    const answer = await this.forward(name, { id: 1, method: "eth_call", params: [{ to, data }, "latest"] });
    return answer.error === undefined ? (answer.result as Hex) : null;
  }

  // ---- facts for the registry ------------------------------------------------------------------------------------

  // AccountDeployed(topic2 = account) was emitted by the EntryPoint: the account was deployed by a UserOp.
  async isDeployed(account: Address): Promise<boolean> {
    if (this.xo === undefined) return false;
    const logs = await this.call<unknown[]>("xo", "eth_getLogs", [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        address: ENTRY_POINT_V07,
        topics: [ACCOUNT_DEPLOYED_TOPIC, null, pad(account.toLowerCase() as Hex, { size: 32 })],
      },
    ]);
    return logs.length > 0;
  }

  // XO's Enable Trading in state: USDC.e allowance to the exchange is above zero and the exchange is an
  // approved operator on the Conditional Tokens (read with eth_call, not from logs: gate-9 amendment A8).
  async isTradingEnabled(account: Address): Promise<boolean> {
    if (this.xo === undefined) return false;
    try {
      const allowance = await this.ethCall(USDC_E_ADDRESS, encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [account, CTF_EXCHANGE] }));
      const approved = await this.ethCall(CONDITIONAL_TOKENS, encodeFunctionData({ abi: CONDITIONAL_TOKENS_ABI, functionName: "isApprovedForAll", args: [account, CTF_EXCHANGE] }));
      if (allowance === "0x" || approved === "0x") return false;
      const amount = decodeFunctionResult({ abi: ERC20_ABI, functionName: "allowance", data: allowance }) as bigint;
      const isApproved = decodeFunctionResult({ abi: CONDITIONAL_TOKENS_ABI, functionName: "isApprovedForAll", data: approved }) as boolean;
      return amount > 0n && isApproved;
    } catch {
      return false;
    }
  }

  private async ethCall(to: Address, data: Hex): Promise<Hex> {
    return this.call<Hex>("xo", "eth_call", [{ to, data }, "latest"]);
  }
}

// The contracts the write mock adds on top of the chain harness. XO: the market manager stub, and one STOP
// byte at the XO Hyperlane route and Mailbox (a call to them lands and does nothing; the Hyperlane emulation
// answers their views and does their work in JavaScript). Base: one STOP byte at the Circle USDC, the
// warp router and the Mailbox, for the same reason.
async function installMockContracts(xo: XoChain | undefined, base: XoChain | undefined): Promise<void> {
  if (xo !== undefined) {
    if (xo.stubs) {
      await xo.rpc("anvil_setCode", [MARKET_MANAGER, managerStubRuntime()]);
    }
    await xo.rpc("anvil_setCode", [XO_WARP_ROUTE, "0x00"]);
    await xo.rpc("anvil_setCode", [HYPERLANE_MAILBOX, "0x00"]);
    await xo.rpc("anvil_setBalance", [XO_ORACLE, "0xde0b6b3a7640000"]);
    await xo.rpc("anvil_setBalance", [XO_WARP_ROUTE, "0xde0b6b3a7640000"]);
  }
  if (base !== undefined) {
    for (const address of [BASE_USDC, BASE_WARP_ROUTER, HYPERLANE_MAILBOX]) await base.rpc("anvil_setCode", [address, "0x00"]);
  }
}

export class ChainUnavailableError extends Error {
  readonly chain: ChainName;
  constructor(chain: ChainName) {
    super(`the ${chain} chain is not part of this mock`);
    this.name = "ChainUnavailableError";
    this.chain = chain;
  }
}
