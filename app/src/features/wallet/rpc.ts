// Read-only chain reads over the injected fetch (docs/dapp-design.md 4.2 T0-RPC, 7.2 M2).
//
// What this can send: eth_getCode, eth_call and eth_getBalance, and nothing else. There is no generic
// `request(method, params)`, so no transaction, signature or state-changing method can be built here, and the
// Cockpit's read proxy sees only its JSON-RPC read allowlist.
//
// Balances use ONE Multicall3 `aggregate3` eth_call per chain. If a chain has no Multicall3 (an eth_call to an
// address without code returns "0x") or the aggregate reverts, the same reads go out as one JSON-RPC batch, and
// if the endpoint refuses arrays, as single requests. A failure to reach the endpoint is thrown to the caller
// as an error, never turned into an empty or zero answer: an unreachable chain is not an empty one.

import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, parseAbi, type Hex } from "viem";
import * as z from "zod/v4";

import { BROWSER_DIRECT_ORIGINS } from "../../../headers.config";
import { observeCode, type AccountChain, type CodeObservation } from "../../core/account";
import { AdapterException } from "../../core/errors";
import { adapterErrorOfStatus } from "../../core/fetch";
import type { AdapterDeps } from "../../core/ports";

// The canonical Multicall3 deployment, the same address on every chain that has it.
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const MULTICALL_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
]);

export const MAX_OPS_PER_READ = 60;
const MAX_BODY_CHARS = 1_000_000;
const SINGLE_CONCURRENCY = 4;

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

const hexData = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).max(MAX_BODY_CHARS);
const rpcItem = z.looseObject({
  id: z.union([z.number(), z.string(), z.null()]).optional(),
  result: z.unknown().optional(),
  error: z.looseObject({ code: z.number().optional(), message: z.string().max(500).optional() }).optional(),
});
type RpcItem = z.infer<typeof rpcItem>;

export function rpcUrlOf(chain: AccountChain): string | null {
  if (chain.rpcService === null) return null;
  const row = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === chain.rpcService && entry.transport === "T0-RPC");
  return row === undefined ? null : `${row.origin}/`;
}

async function post(deps: AdapterDeps, url: string, body: unknown): Promise<unknown> {
  // A thrown fetch (FetchError from the app's port) is passed up unchanged for failureOf to classify.
  const response = await deps.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new AdapterException(adapterErrorOfStatus(response.status), "http_status");
  const text = await response.text();
  if (text.length > MAX_BODY_CHARS) throw new AdapterException("SCHEMA_DRIFT", "body_too_large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdapterException("SCHEMA_DRIFT", "not_json");
  }
}

// eth_getBalance answers a quantity ("0x0", "0x1a"), which may have an odd number of digits; eth_call and
// eth_getCode answer whole bytes.
const quantity = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/);

function classify(item: RpcItem, method: Request["method"]): ReadResult {
  if (item.error !== undefined) {
    const message = item.error.message ?? "";
    return item.error.code === 3 || /revert/i.test(message) ? { ok: false, reason: "revert" } : { ok: false, reason: "error" };
  }
  const data = (method === "eth_getBalance" ? quantity : hexData).safeParse(item.result);
  return data.success ? { ok: true, data: data.data as Hex } : { ok: false, reason: "error" };
}

interface Request {
  readonly method: "eth_call" | "eth_getBalance" | "eth_getCode";
  readonly params: readonly unknown[];
}

function requestOf(op: ReadOp): Request {
  if (op.kind === "native") return { method: "eth_getBalance", params: [op.holder, "latest"] };
  return { method: "eth_call", params: [{ to: op.to, data: op.data }, "latest"] };
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
  let nextId = 1;
  let lastMode: ReturnType<ChainReader["mode"]> = "none";

  async function single(request: Request): Promise<ReadResult> {
    const item = rpcItem.safeParse(await post(deps, url as string, { jsonrpc: "2.0", id: nextId++, ...request }));
    return item.success ? classify(item.data, request.method) : { ok: false, reason: "error" };
  }

  async function singles(requests: readonly Request[]): Promise<ReadResult[]> {
    const results = new Array<ReadResult>(requests.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const request = requests[index];
        if (request === undefined) return;
        results[index] = await single(request);
      }
    };
    await Promise.all(Array.from({ length: Math.min(SINGLE_CONCURRENCY, requests.length) }, worker));
    return results;
  }

  // null: the endpoint did not answer the array form.
  async function batch(requests: readonly Request[]): Promise<ReadResult[] | null> {
    const firstId = nextId;
    nextId += requests.length;
    let body: unknown;
    try {
      body = await post(deps, url as string, requests.map((request, index) => ({ jsonrpc: "2.0", id: firstId + index, ...request })));
    } catch (error) {
      if (error instanceof AdapterException && error.code === "SCHEMA_DRIFT") return null;
      throw error;
    }
    if (!Array.isArray(body)) return null;
    const byId = new Map<string, RpcItem>();
    for (const raw of body) {
      const item = rpcItem.safeParse(raw);
      if (item.success && (typeof item.data.id === "number" || typeof item.data.id === "string")) byId.set(String(item.data.id), item.data);
    }
    // A missing answer is an error for that read only.
    return requests.map((_, index) => {
      const item = byId.get(String(firstId + index));
      return item === undefined ? ({ ok: false, reason: "error" } as const) : classify(item, requests[index]?.method ?? "eth_call");
    });
  }

  async function plain(requests: readonly Request[]): Promise<ReadResult[]> {
    if (requests.length === 0) return [];
    if (requests.length > 1) {
      const batched = await batch(requests);
      if (batched !== null) {
        lastMode = "batch";
        return batched;
      }
    }
    lastMode = "single";
    return singles(requests);
  }

  // The Multicall3 form. null when the chain has no Multicall3 or the aggregate failed as a whole.
  async function viaMulticall(ops: readonly ReadOp[]): Promise<ReadResult[] | null> {
    const calls = ops.map((op) =>
      op.kind === "native"
        ? { target: MULTICALL3_ADDRESS, allowFailure: true, callData: encodeFunctionData({ abi: MULTICALL_ABI, functionName: "getEthBalance", args: [getAddress(op.holder)] }) }
        : { target: getAddress(op.to), allowFailure: true, callData: op.data },
    );
    const data = encodeFunctionData({ abi: MULTICALL_ABI, functionName: "aggregate3", args: [calls] });
    const answer = await single({ method: "eth_call", params: [{ to: MULTICALL3_ADDRESS, data }, "latest"] });
    if (!answer.ok) return null;
    try {
      const decoded = decodeFunctionResult({ abi: MULTICALL_ABI, functionName: "aggregate3", data: answer.data });
      if (decoded.length !== ops.length) return null;
      return decoded.map((entry): ReadResult => (entry.success ? { ok: true, data: entry.returnData } : { ok: false, reason: "revert" }));
    } catch {
      // "0x" (no Multicall3 on this chain) or anything that does not decode as the aggregate result.
      return null;
    }
  }

  async function read(ops: readonly ReadOp[]): Promise<ReadResult[]> {
    checkedOps(ops);
    if (ops.length === 0) return [];
    const aggregated = await viaMulticall(ops);
    if (aggregated !== null) {
      lastMode = "multicall";
      return aggregated;
    }
    return plain(ops.map(requestOf));
  }

  async function readRawCodes(addresses: readonly string[]): Promise<Array<string | null>> {
    if (addresses.length === 0) return [];
    try {
      for (const address of addresses) {
        if (!isAddress(address, { strict: false })) throw new RangeError("not an address");
      }
      const results = await plain(addresses.map((address): Request => ({ method: "eth_getCode", params: [address, "latest"] })));
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
