// Read-only chain reads over the injected fetch (docs/dapp-design.md 4.2 T0-RPC, 7.2 M2), through the one JSON-RPC
// port (sdk/chain/rpc.ts).
//
// What this can send: eth_getCode, eth_call and eth_getBalance, and nothing else. The port it builds names exactly
// those three methods and refuses any other before a request, so no transaction, signature or state-changing method
// can be built here, and the Cockpit's read proxy sees only its JSON-RPC read allowlist.
//
// Balances use ONE Multicall3 `aggregate3` eth_call per chain (sdk/chain/multicall.ts). If a chain has no Multicall3
// (an eth_call to an address without code returns "0x") or the aggregate reverts, the same reads go out as one JSON-RPC
// batch, and if the endpoint refuses arrays, as single requests from then on. A failure to reach the endpoint is
// thrown to the caller as an error, never turned into an empty or zero answer: an unreachable chain is not an empty one.

import { getAddress, isAddress, type Hex } from "viem";

import { aggregate3, ethBalanceCall, MULTICALL3_ADDRESS } from "@sdk/chain/multicall";
import { createRpcPort, isRpcError, rpcPostFromFetch, type RpcItemResult, type RpcPort, type RpcRequest } from "@sdk/chain/rpc";
import { BROWSER_DIRECT_ORIGINS } from "../../../headers.config";
import { observeCode, type AccountChain, type CodeObservation } from "../../core/account";
import { AdapterException } from "../../core/errors";
import { adapterErrorOfStatus } from "../../core/fetch";
import type { AdapterDeps } from "../../core/ports";

export { MULTICALL3_ADDRESS };

export const MAX_OPS_PER_READ = 60;
const MAX_BODY_CHARS = 1_000_000;
const READ_METHODS = ["eth_call", "eth_getBalance", "eth_getCode"] as const;

export type ReadOp =
  | { readonly kind: "call"; readonly to: string; readonly data: Hex }
  // The native coin balance of an address.
  | { readonly kind: "native"; readonly holder: string };

export type ReadResult =
  | { readonly ok: true; readonly data: Hex }
  // "revert": the node ran the call and it failed. "error": any other per-call error.
  | { readonly ok: false; readonly reason: "revert" | "error" };

export interface ChainReader {
  readonly chain: AccountChain;
  // One observation per address, in order. A failure to read is "unreachable", never "none".
  readCodes(addresses: readonly string[]): Promise<CodeObservation[]>;
  // The raw eth_getCode answers, in order; null where the read failed. For the owner's EIP-7702 check.
  readRawCodes(addresses: readonly string[]): Promise<Array<string | null>>;
  // Throws when the endpoint cannot be reached at all.
  read(ops: readonly ReadOp[]): Promise<ReadResult[]>;
  // How the last read went out, for the page's notes.
  mode(): "multicall" | "batch" | "single" | "none";
}

export function rpcUrlOf(chain: AccountChain): string | null {
  if (chain.rpcService === null) return null;
  const row = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === chain.rpcService && entry.transport === "T0-RPC");
  return row === undefined ? null : `${row.origin}/`;
}

// The port's error as this screen always reported it: what the injected fetch threw is passed up unchanged for
// failureOf to classify; an HTTP status keeps its AdapterError; an answer that is not JSON or too large is drift.
function failureOf(error: unknown): unknown {
  if (!isRpcError(error)) return error;
  if (error.code === "unreachable") return error.cause;
  if (error.status !== null) return new AdapterException(adapterErrorOfStatus(error.status), "http_status");
  if (error.code === "requires_key") return new AdapterException(adapterErrorOfStatus(403), "http_status");
  if (error.code === "rate_limited") return new AdapterException(adapterErrorOfStatus(429), "http_status");
  if (error.code === "timeout") return new AdapterException("TIMEOUT", error.detail);
  return new AdapterException("SCHEMA_DRIFT", error.detail === "body_too_large" ? "body_too_large" : "not_json");
}

function requestOf(op: ReadOp): RpcRequest {
  if (op.kind === "native") return { method: "eth_getBalance", params: [op.holder, "latest"] };
  return { method: "eth_call", params: [{ to: op.to, data: op.data }, "latest"] };
}

function resultOf(item: RpcItemResult): ReadResult {
  return item.ok ? { ok: true, data: item.result as Hex } : { ok: false, reason: item.kind };
}

function checkedOps(ops: readonly ReadOp[]): void {
  if (ops.length > MAX_OPS_PER_READ) throw new RangeError("too many reads in one request");
  for (const op of ops) {
    const address = op.kind === "native" ? op.holder : op.to;
    if (!isAddress(address, { strict: false })) throw new RangeError("a read names something that is not an address");
  }
}

export function createChainReader(deps: AdapterDeps, chain: AccountChain): ChainReader | null {
  const url = rpcUrlOf(chain);
  if (url === null) return null;
  const port: RpcPort = createRpcPort({ url, post: rpcPostFromFetch(deps.fetch, { maxBodyChars: MAX_BODY_CHARS }), methods: READ_METHODS });
  let lastMode: ReturnType<ChainReader["mode"]> = "none";

  async function plain(requests: readonly RpcRequest[]): Promise<ReadResult[]> {
    if (requests.length === 0) return [];
    let results: RpcItemResult[];
    try {
      results = await port.requestMany(requests);
    } catch (error) {
      throw failureOf(error);
    }
    lastMode = port.mode() === "batch" ? "batch" : "single";
    return results.map(resultOf);
  }

  async function read(ops: readonly ReadOp[]): Promise<ReadResult[]> {
    checkedOps(ops);
    if (ops.length === 0) return [];
    let aggregated;
    try {
      aggregated = await aggregate3(
        port,
        ops.map((op) => (op.kind === "native" ? ethBalanceCall(getAddress(op.holder)) : { target: getAddress(op.to), callData: op.data })),
      );
    } catch (error) {
      throw failureOf(error);
    }
    if (aggregated !== null) {
      lastMode = "multicall";
      return aggregated.map((result): ReadResult => (result.ok ? result : { ok: false, reason: result.kind }));
    }
    return plain(ops.map(requestOf));
  }

  async function readRawCodes(addresses: readonly string[]): Promise<Array<string | null>> {
    if (addresses.length === 0) return [];
    try {
      for (const address of addresses) {
        if (!isAddress(address, { strict: false })) throw new RangeError("not an address");
      }
      const results = await plain(addresses.map((address): RpcRequest => ({ method: "eth_getCode", params: [address, "latest"] })));
      return results.map((result) => (result.ok ? result.data : null));
    } catch {
      return addresses.map(() => null);
    }
  }

  async function readCodes(addresses: readonly string[]): Promise<CodeObservation[]> {
    return (await readRawCodes(addresses)).map((raw) => observeCode(raw));
  }

  return { chain, read, readCodes, readRawCodes, mode: () => lastMode };
}

// The unsigned integer a read returned: a 32-byte word (balanceOf, allowance, the aggregate's native balance) or
// a quantity (eth_getBalance). Null for a failed read or any other shape: a missing balance is not zero.
export function uintOf(result: ReadResult | undefined): bigint | null {
  if (result === undefined || !result.ok) return null;
  return /^0x[0-9a-fA-F]{1,64}$/.test(result.data) ? BigInt(result.data) : null;
}
