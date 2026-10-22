import { isAdapterException } from "../errors.js";
import type { AdapterDeps } from "../../model.js";
import { createRpcPort, isRpcError, rpcPostFromFetch, type RpcError, type RpcLog as PortLog, type RpcPort } from "../../chain/rpc.js";
import { TRUEO_MAX_BATCH, TRUEO_MAX_BODY_CHARS, TRUEO_SINGLE_CONCURRENCY } from "./constants.js";
import { AdapterFailure } from "./errors.js";
import { FORBIDDEN_PAUSE_MS } from "./http.js";

// The Trueo reader's view of the one JSON-RPC port (sdk/chain/rpc.ts): a client that can send exactly two methods,
// eth_call and eth_getLogs. There is no generic `request(method, params)` here, so no transaction, signature or
// state-changing method can be sent through it, and the Cockpit's read proxy sees nothing outside its JSON-RPC read
// allowlist. Failures are the port's, mapped onto the reader's closed AdapterError set.
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

export type RpcLog = PortLog;

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

// The widest eth_getLogs range the port accepts for this reader: the history scan's own cap (logs.ts MAX_BLOCK_SPAN,
// an exclusive difference of 100,000) as an inclusive block count.
const MAX_LOG_BLOCKS = 100_001n;

// A port error as the reader's AdapterFailure. The details are the ones this reader always used.
function failureOf(error: unknown): unknown {
  if (!isRpcError(error)) return error;
  const e: RpcError = error;
  switch (e.code) {
    case "rate_limited":
      return new AdapterFailure("trueo", "RATE_LIMITED", e.detail, e.retryAfterMs);
    case "requires_key":
      // A key refusal latches the port; the venue pauses as a 403 always paused it.
      return new AdapterFailure("trueo", "VENUE_PAUSED", e.detail === "requires_key_latched" ? "http_403" : e.detail, e.retryAfterMs ?? FORBIDDEN_PAUSE_MS);
    case "timeout":
      return new AdapterFailure("trueo", "TIMEOUT", e.detail);
    case "unreachable":
      // A fetch layer that already speaks AdapterException (the Cockpit's proxy mapper) is passed through.
      return isAdapterException(e.cause) ? e.cause : new AdapterFailure("trueo", "TIMEOUT", "no_response");
    case "http_status": {
      const status = e.status ?? 0;
      if (status === 404) return new AdapterFailure("trueo", "NOT_FOUND", "http_404");
      if (status >= 500) return new AdapterFailure("trueo", "VENUE_PAUSED", `http_${status}`, e.retryAfterMs);
      return new AdapterFailure("trueo", "SCHEMA_DRIFT", `http_${status}`);
    }
    case "too_large":
      return new AdapterFailure("trueo", "SCHEMA_DRIFT", e.detail);
    case "invalid_response":
      return new AdapterFailure("trueo", "SCHEMA_DRIFT", e.detail === "result_shape" ? "rpc_envelope" : e.detail);
    case "upstream_error":
      // A range or result-size refusal: the caller must ask for less.
      return new AdapterFailure("trueo", "NOT_SUPPORTED", e.detail === "logs_range_refused" ? e.detail : "rpc_error");
    case "invalid_input":
    case "unsupported_method":
    case "reverted":
      return new AdapterFailure("trueo", "NOT_SUPPORTED", e.detail);
  }
}

export function createRpc(deps: AdapterDeps, options: RpcOptions): Rpc {
  let port: RpcPort | null = null;
  let refused: AdapterFailure | null = null;
  try {
    port = createRpcPort({
      url: options.url,
      post: rpcPostFromFetch(deps.fetch, { maxBodyChars: TRUEO_MAX_BODY_CHARS, nowMs: deps.nowMs }),
      methods: ["eth_call", "eth_getLogs"],
      batch: options.batch ?? "auto",
      maxBatch: options.maxBatch ?? TRUEO_MAX_BATCH,
      concurrency: options.concurrency ?? TRUEO_SINGLE_CONCURRENCY,
      maxLogBlockRange: MAX_LOG_BLOCKS,
      allowLatestLogs: true,
    });
  } catch {
    // A URL the port refuses (not https, credentials or a query string) fails every read, not the adapter's creation.
    refused = new AdapterFailure("trueo", "NOT_SUPPORTED", "rpc_url_refused");
  }
  const ready = (): RpcPort => {
    if (port === null) throw refused ?? new AdapterFailure("trueo", "NOT_SUPPORTED", "rpc_url_refused");
    return port;
  };

  async function callMany(calls: readonly RpcCall[], deadlineAtMs: number): Promise<RpcResult[]> {
    let out: RpcResult[];
    try {
      out = await ready().callMany(calls, { deadlineAtMs });
    } catch (error) {
      throw failureOf(error);
    }
    // Every call failing for a reason other than a revert means the endpoint is not serving reads.
    if (out.length > 0 && out.every((result) => !result.ok && result.kind === "error")) throw new AdapterFailure("trueo", "VENUE_PAUSED", "rpc_errors");
    return out;
  }

  async function logs(filter: LogFilter, deadlineAtMs: number): Promise<RpcLog[]> {
    let read;
    try {
      read = await ready().getLogs({ address: filter.address, topics: filter.topics, fromBlock: filter.fromBlock, toBlock: filter.toBlock }, { deadlineAtMs });
    } catch (error) {
      throw failureOf(error);
    }
    // A pending or malformed row is drift; a row for an address or topic nobody asked about was already dropped.
    if (read.droppedMalformed > 0 || read.droppedPending > 0) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "log_shape");
    return [...read.logs];
  }

  const mode = (): "batch" | "single" => {
    const current = port?.mode() ?? "none";
    if (current !== "none") return current;
    return options.batch === "never" ? "single" : "batch";
  };

  return { callMany, logs, mode };
}
