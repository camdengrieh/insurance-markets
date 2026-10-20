import * as z from "zod/v4";

import type { AdapterDeps } from "../../core/ports";
import { TRUEO_MAX_BATCH, TRUEO_SINGLE_CONCURRENCY } from "./constants";
import { AdapterFailure } from "./errors";
import { postJson } from "./http";

// A JSON-RPC client over the injected fetch that can send exactly two methods: eth_call and eth_getLogs. There
// is no generic `request(method, params)`, so no transaction, signature or state-changing method can be
// sent through it, and the Cockpit's read proxy sees nothing outside its JSON-RPC read allowlist.
//
// Many reads are sent as one JSON-RPC batch. If the endpoint or the daemon's proxy refuses an array body, the
// client falls back, once and for good, to single requests (bounded concurrency).

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export interface RpcCall {
  readonly to: Address;
  readonly data: Hex;
}

export type RpcResult =
  | { readonly ok: true; readonly data: Hex }
  // "revert": the node ran the call and it reverted (an out-of-bounds quote, a missing function).
  // "error": any other per-call error.
  | { readonly ok: false; readonly kind: "revert" | "error" };

export interface LogFilter {
  readonly address: readonly Address[];
  // Each position is a topic or null (any).
  readonly topics: ReadonlyArray<Hex | null>;
  readonly fromBlock: bigint;
  readonly toBlock: bigint | "latest";
}

export interface RpcLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
}

export interface Rpc {
  callMany(calls: readonly RpcCall[], deadlineAtMs: number): Promise<RpcResult[]>;
  logs(filter: LogFilter, deadlineAtMs: number): Promise<RpcLog[]>;
  // How the last callMany went out, for health notes and tests.
  mode(): "batch" | "single";
}

export interface RpcOptions {
  readonly url: string;
  readonly batch?: "auto" | "never";
  readonly maxBatch?: number;
  readonly concurrency?: number;
}

const hexSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).max(1_000_000);
const itemSchema = z.looseObject({
  id: z.union([z.number(), z.string(), z.null()]).optional(),
  result: z.unknown().optional(),
  error: z.looseObject({ code: z.number().optional(), message: z.string().max(500).optional() }).optional(),
});
type Item = z.infer<typeof itemSchema>;

const logSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  topics: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)).max(4),
  data: hexSchema,
  blockNumber: z.string().regex(/^0x[0-9a-fA-F]{1,16}$/),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  logIndex: z.string().regex(/^0x[0-9a-fA-F]{1,8}$/),
});

// 429-like text in an error object. -32005 is the usual "limit exceeded" code of hosted nodes.
const LIMIT_TEXT = /\b(rate.?limit|too many requests|request limit)\b/i;
const REVERT_TEXT = /revert/i;

function classify(item: Item): RpcResult {
  if (item.error !== undefined) {
    const code = item.error.code;
    const message = item.error.message ?? "";
    if (code === -32005 || LIMIT_TEXT.test(message)) throw new AdapterFailure("trueo", "RATE_LIMITED", "rpc_limited");
    if (code === 3 || REVERT_TEXT.test(message)) return { ok: false, kind: "revert" };
    return { ok: false, kind: "error" };
  }
  const result = hexSchema.safeParse(item.result);
  return result.success ? { ok: true, data: result.data as Hex } : { ok: false, kind: "error" };
}

function callBody(id: number, call: RpcCall): unknown {
  return { jsonrpc: "2.0", id, method: "eth_call", params: [{ to: call.to, data: call.data }, "latest"] };
}

export function createRpc(deps: AdapterDeps, options: RpcOptions): Rpc {
  const maxBatch = Math.max(1, Math.min(options.maxBatch ?? TRUEO_MAX_BATCH, 100));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? TRUEO_SINGLE_CONCURRENCY, 8));
  let nextId = 1;
  let batching = options.batch !== "never";
  let lastMode: "batch" | "single" = batching ? "batch" : "single";

  async function single(call: RpcCall, deadlineAtMs: number): Promise<RpcResult> {
    const body = await postJson(deps, options.url, callBody(nextId++, call), deadlineAtMs);
    const item = itemSchema.safeParse(body);
    return item.success ? classify(item.data) : { ok: false, kind: "error" };
  }

  async function singles(calls: readonly RpcCall[], deadlineAtMs: number): Promise<RpcResult[]> {
    const results: RpcResult[] = new Array<RpcResult>(calls.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const call = calls[index];
        if (call === undefined) return;
        results[index] = await single(call, deadlineAtMs);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, calls.length) }, worker));
    return results;
  }

  // null: the endpoint did not answer the array form; the caller falls back.
  async function batch(calls: readonly RpcCall[], deadlineAtMs: number): Promise<RpcResult[] | null> {
    const firstId = nextId;
    nextId += calls.length;
    let body: unknown;
    try {
      body = await postJson(deps, options.url, calls.map((call, index) => callBody(firstId + index, call)), deadlineAtMs);
    } catch (error) {
      // A limit or a deadline is not a reason to change mode.
      if (error instanceof AdapterFailure && (error.code === "RATE_LIMITED" || error.code === "TIMEOUT" || error.code === "STALE")) throw error;
      return null;
    }
    if (!Array.isArray(body)) return null;
    const byId = new Map<string, Item>();
    for (const raw of body) {
      const item = itemSchema.safeParse(raw);
      if (item.success && (typeof item.data.id === "number" || typeof item.data.id === "string")) byId.set(String(item.data.id), item.data);
    }
    // Some nodes answer a batch with fewer or no ids; a missing answer is an error for that call only.
    return calls.map((_, index) => {
      const item = byId.get(String(firstId + index));
      return item === undefined ? { ok: false as const, kind: "error" as const } : classify(item);
    });
  }

  async function callMany(calls: readonly RpcCall[], deadlineAtMs: number): Promise<RpcResult[]> {
    const out: RpcResult[] = [];
    for (let from = 0; from < calls.length; from += maxBatch) {
      const chunk = calls.slice(from, from + maxBatch);
      let results: RpcResult[] | null = null;
      if (batching && chunk.length > 1) {
        results = await batch(chunk, deadlineAtMs);
        if (results === null) batching = false;
      }
      lastMode = results === null ? "single" : "batch";
      out.push(...(results ?? (await singles(chunk, deadlineAtMs))));
    }
    // Every call failing for a reason other than a revert means the endpoint is not serving reads.
    if (out.length > 0 && out.every((result) => !result.ok && result.kind === "error")) throw new AdapterFailure("trueo", "VENUE_PAUSED", "rpc_errors");
    return out;
  }

  async function logs(filter: LogFilter, deadlineAtMs: number): Promise<RpcLog[]> {
    const params = {
      address: filter.address,
      topics: filter.topics,
      fromBlock: `0x${filter.fromBlock.toString(16)}`,
      toBlock: filter.toBlock === "latest" ? "latest" : `0x${filter.toBlock.toString(16)}`,
    };
    const body = await postJson(deps, options.url, { jsonrpc: "2.0", id: nextId++, method: "eth_getLogs", params: [params] }, deadlineAtMs);
    const item = itemSchema.safeParse(body);
    if (!item.success) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "rpc_envelope");
    if (item.data.error !== undefined) {
      const message = item.data.error.message ?? "";
      if (item.data.error.code === -32005 || LIMIT_TEXT.test(message)) throw new AdapterFailure("trueo", "RATE_LIMITED", "rpc_limited");
      // A range or result-size refusal: the caller must ask for less.
      throw new AdapterFailure("trueo", "NOT_SUPPORTED", "logs_range_refused");
    }
    const list = z.array(z.unknown()).max(10_000).safeParse(item.data.result);
    if (!list.success) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "logs_not_a_list");
    return list.data.map((raw) => {
      const log = logSchema.safeParse(raw);
      if (!log.success) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "log_shape");
      return {
        address: log.data.address as Address,
        topics: log.data.topics as Hex[],
        data: log.data.data as Hex,
        blockNumber: BigInt(log.data.blockNumber),
        transactionHash: log.data.transactionHash as Hex,
        logIndex: Number(BigInt(log.data.logIndex)),
      };
    });
  }

  return { callMany, logs, mode: () => lastMode };
}
