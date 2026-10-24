// The chain reads the account makes (token name and version for a deposit's EIP-712 domain, USDC balances): eth_call
// through the wallet screen's read port (features/wallet/rpc.ts), so they go to the same public RPC hosts the CSP lists,
// one Multicall3 aggregate per chain, and a failed read is null, never zero.

import type { Address, Hex } from "viem";

import { chainById } from "../../core/account";
import type { AdapterDeps } from "../../core/ports";
import { createChainReader, type ChainReader } from "../wallet/rpc";

export interface ReadCall {
  readonly to: Address;
  readonly data: Hex;
}

// One answer per call, in order: the returned bytes, or null when the call reverted or failed. Throws only when the chain
// cannot be reached at all (or the page has no RPC for it).
export type ChainCalls = (chainId: number, calls: readonly ReadCall[]) => Promise<ReadonlyArray<Hex | null>>;

export function createChainCalls(deps: AdapterDeps): ChainCalls {
  const readers = new Map<number, ChainReader | null>();
  return async (chainId, calls) => {
    if (!readers.has(chainId)) {
      const chain = chainById(chainId);
      readers.set(chainId, chain === undefined ? null : createChainReader(deps, chain));
    }
    const reader = readers.get(chainId) ?? null;
    if (reader === null) throw new Error("no public RPC for this chain in this build");
    const results = await reader.read(calls.map((call) => ({ kind: "call" as const, to: call.to, data: call.data })));
    return results.map((result) => (result.ok ? result.data : null));
  };
}
