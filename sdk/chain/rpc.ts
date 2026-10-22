import { parseRetryAfterMs } from "../venues/transport.js";
import type { FetchLike } from "../model.js";

// The one JSON-RPC port (docs/sdk-and-api-design.md section 7). Every chain read in the repository goes through it:
// the XO reader (`sdk/chain/xo/reads.ts`, behind `src/xo/chain/reads.ts`), the funding preflight's Base reader, the
// Trueo reader, the dApp's wallet balances and the position, fill and resolution readers in `sdk/chain/<venue>`.
// It merges four clients that grew apart, and where they disagreed the stricter rule is the one kept:
//
//   method allowlist   every port names the read methods it may send, a subset of RPC_READ_METHODS (the
//                      Cockpit's JSON-RPC read allowlist minus the two nothing here uses). Anything else is refused
//                      locally, before a request. Nothing here can send a transaction or a signature.
//   key latch          a 401, a 403 or an "api_key" complaint latches "requires key": later calls fail fast and
//                      nothing ever looks for a key. An execution revert never sets it (its text is the contract's).
//   validation         every answer is checked: the envelope, the id it answers, and the result's shape for its
//                      method (bytes, a quantity, a list of logs). A body over the size cap is refused.
//   batching           many reads go as one JSON-RPC batch. An endpoint that refuses arrays (a 4xx or a non-array
//                      answer) is asked one read at a time from then on, with bounded concurrency. A rate limit, a
//                      timeout, a key refusal or a server error is never a reason to change mode: it is thrown.
//   logs               eth_getLogs needs a numeric block range no wider than the port's limit; "latest" and an
//                      open range are refused unless a caller opts in. Rows a node sends that do not match the
//                      filter are dropped and counted, as are pending and malformed rows.
//
// The transport is injected (`RpcPost`). `rpcPostFromFetch` builds one from a FetchLike, with the body cap and an
// optional deadline; the port itself reads no clock and no global.

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export const RPC_READ_METHODS = Object.freeze([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionReceipt",
] as const);
export type RpcMethod = (typeof RPC_READ_METHODS)[number];

export type RpcErrorCode =
  | "invalid_input" // a caller bug: a malformed address, block range or call, or a method this port may not send
  | "unsupported_method"
  | "requires_key" // the host wants a key; the latch is set and later calls fail fast
  | "rate_limited"
  | "timeout"
  | "unreachable" // the transport threw; `cause` holds what it threw
  | "http_status" // a non-2xx answer that is none of the above; `status` says which
  | "upstream_error" // a JSON-RPC error that is not a revert, a limit or a key complaint
  | "invalid_response" // the answer does not have the expected shape
  | "reverted"
  | "too_large";

// `message` and `detail` are fixed text. An upstream body never reaches either; `cause` may hold the transport's
// own error, so callers log `code` and `detail`, never `cause`.
export class RpcError extends Error {
  readonly code: RpcErrorCode;
  readonly detail: string;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  constructor(code: RpcErrorCode, detail: string, options: { readonly status?: number; readonly retryAfterMs?: number | null; readonly cause?: unknown } = {}) {
    super(`rpc ${code}: ${detail}`, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "RpcError";
    this.code = code;
    this.detail = detail;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function isRpcError(value: unknown): value is RpcError {
  return value instanceof RpcError;
}

// ---- transport ----------------------------------------------------------------------------------------------------------

export interface RpcHttpResponse {
  readonly status: number;
  // The parsed JSON body, or the raw text when the body was not JSON.
  readonly body: unknown;
  readonly retryAfterMs?: number | null;
}

export interface RpcRequestOptions {
  // An absolute time on the transport's clock after which the request is abandoned. Only a transport that was
  // given a clock acts on it.
  readonly deadlineAtMs?: number;
}

export type RpcPost = (url: string, body: unknown, options: RpcRequestOptions) => Promise<RpcHttpResponse>;

export const DEFAULT_MAX_BODY_CHARS = 1_000_000;

export interface FetchTransportOptions {
  readonly maxBodyChars?: number;
  // Needed for deadlines and Retry-After dates; without it a deadline is ignored.
  readonly nowMs?: () => number;
}

// One JSON-RPC POST through the injected fetch. The only header is the content type JSON-RPC needs; Origin, Referer
// and User-Agent are never set. A body over the cap is refused before it is parsed.
export function rpcPostFromFetch(fetch: FetchLike, options: FetchTransportOptions = {}): RpcPost {
  const maxBodyChars = options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS;
  const nowMs = options.nowMs;
  return async (url, body, request) => {
    const deadline = request.deadlineAtMs;
    const remaining = deadline === undefined || nowMs === undefined ? null : deadline - nowMs();
    if (remaining !== null && remaining <= 0) throw new RpcError("timeout", "deadline_passed");
    const controller = remaining === null ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async (): Promise<RpcHttpResponse> => {
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          ...(controller === null ? {} : { signal: controller.signal }),
        });
      } catch (error) {
        throw new RpcError("unreachable", "no_response", { cause: error });
      }
      const retryAfterMs = nowMs === undefined ? null : parseRetryAfterMs(response.headers.get("retry-after"), nowMs());
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw new RpcError("timeout", "body_unreadable", { cause: error });
      }
      if (text.length > maxBodyChars) throw new RpcError("too_large", "body_too_large", { status: response.status });
      try {
        return { status: response.status, body: JSON.parse(text) as unknown, retryAfterMs };
      } catch {
        return { status: response.status, body: text, retryAfterMs };
      }
    })();
    if (remaining === null) return work;
    work.catch(() => undefined);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new RpcError("timeout", "deadline"));
      }, remaining);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

// ---- shapes ---------------------------------------------------------------------------------------------------------------

const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;
const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const API_KEY_COMPLAINT = /api[_\s-]?key/i;
// 429-like text in an error object. -32005 is the usual "limit exceeded" code of hosted nodes.
const LIMIT_TEXT = /\b(rate.?limit|too many requests|request limit)\b/i;
const REVERT_TEXT = /execution reverted/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(body: unknown): string {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body) ?? "";
  } catch {
    return "";
  }
}

export function isAddressHex(value: unknown): value is Address {
  return typeof value === "string" && ADDRESS.test(value);
}

export function quantityHex(value: bigint): Hex {
  return `0x${value.toString(16)}`;
}

// The result of one method, or null when it does not have that method's shape.
function resultShape(method: RpcMethod, result: unknown, maxChars: number): unknown | null {
  switch (method) {
    case "eth_call":
    case "eth_getCode":
      return typeof result === "string" && result.length <= maxChars && HEX_BYTES.test(result) ? result.toLowerCase() : null;
    case "eth_getStorageAt":
      return typeof result === "string" && HEX_32.test(result) ? result.toLowerCase() : null;
    case "eth_getBalance":
    case "eth_blockNumber":
    case "eth_chainId":
      return typeof result === "string" && QUANTITY.test(result) ? result.toLowerCase() : null;
    case "eth_getLogs":
      return Array.isArray(result) ? result : null;
    case "eth_getBlockByNumber":
    case "eth_getTransactionReceipt":
      // The caller parses the object.
      return isRecord(result) ? result : null;
  }
}

// ---- the port ---------------------------------------------------------------------------------------------------------------

export interface RpcRequest {
  readonly method: RpcMethod;
  readonly params: readonly unknown[];
}

export type RpcItemResult =
  | { readonly ok: true; readonly result: unknown }
  // "revert": the node ran the call and it reverted. "error": any other per-request error or a result of the wrong shape.
  | { readonly ok: false; readonly kind: "revert" | "error" };

export interface RpcCall {
  readonly to: Address;
  readonly data: Hex;
}

export type RpcCallResult = { readonly ok: true; readonly data: Hex } | { readonly ok: false; readonly kind: "revert" | "error" };

export interface LogFilter {
  // null only on a port created with requireLogAddress false (the XO reader's legacy path).
  readonly address: Address | readonly Address[] | null;
  // Each position is a topic, a list of alternatives, or null (any).
  readonly topics: ReadonlyArray<Hex | readonly Hex[] | null>;
  readonly fromBlock: bigint;
  readonly toBlock: bigint | "latest";
}

export interface RpcLog {
  readonly address: Address;
  // 1 to 4 topics, lower-case.
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
}

export interface LogRead {
  readonly logs: readonly RpcLog[];
  // Rows without a block number yet.
  readonly droppedPending: number;
  readonly droppedMalformed: number;
  // Rows that do not match the filter: the node ignored part of it.
  readonly droppedUnmatched: number;
}

export interface RpcPortOptions {
  readonly url: string;
  readonly post: RpcPost;
  // The methods this port may send; each must be in RPC_READ_METHODS.
  readonly methods: readonly RpcMethod[];
  readonly batch?: "auto" | "never";
  readonly maxBatch?: number;
  readonly concurrency?: number;
  // The widest eth_getLogs range, in blocks (inclusive). null: no limit (only the XO reader's legacy log path).
  readonly maxLogBlockRange?: bigint | null;
  // Whether a log filter may end at "latest".
  readonly allowLatestLogs?: boolean;
  readonly maxLogs?: number;
  // Whether a log filter must name at least one emitting contract. Default true.
  readonly requireLogAddress?: boolean;
  // The longest hex string accepted from eth_call or eth_getCode.
  readonly maxResultChars?: number;
}

export interface RpcPort {
  readonly url: string;
  readonly methods: readonly RpcMethod[];
  // True once the host asked for a key.
  readonly requiresKey: boolean;
  // One request; throws RpcError for anything but a result of the method's shape.
  request(method: RpcMethod, params: readonly unknown[], options?: RpcRequestOptions): Promise<unknown>;
  // Many requests, batched where the endpoint allows. Per-request failures are results; a limit, a timeout, a key
  // refusal or an unreachable endpoint is thrown.
  requestMany(requests: readonly RpcRequest[], options?: RpcRequestOptions): Promise<RpcItemResult[]>;
  call(call: RpcCall, options?: RpcRequestOptions): Promise<Hex>;
  callMany(calls: readonly RpcCall[], options?: RpcRequestOptions): Promise<RpcCallResult[]>;
  getCode(address: Address, options?: RpcRequestOptions): Promise<Hex>;
  getStorageAt(address: Address, slot: Hex, options?: RpcRequestOptions): Promise<Hex>;
  blockNumber(options?: RpcRequestOptions): Promise<bigint>;
  chainId(options?: RpcRequestOptions): Promise<number>;
  getLogs(filter: LogFilter, options?: RpcRequestOptions): Promise<LogRead>;
  // How the last requestMany went out.
  mode(): "batch" | "single" | "none";
}

export const DEFAULT_MAX_BATCH = 40;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_MAX_LOG_BLOCK_RANGE = 10_000n;
export const DEFAULT_MAX_LOGS = 10_000;

// The URL rule of the strictest of the merged clients: https (or loopback http, for tests and a local node), no
// credentials, no query string (a key in the URL is how paid RPCs work, and this port never carries one), no fragment.
export function checkRpcUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RpcError("invalid_input", "rpc_url_unparsable");
  }
  const loopback = parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !loopback) throw new RpcError("invalid_input", "rpc_url_not_https");
  if (parsed.username !== "" || parsed.password !== "") throw new RpcError("invalid_input", "rpc_url_has_credentials");
  if (parsed.search !== "" || parsed.hash !== "") throw new RpcError("invalid_input", "rpc_url_has_query");
  return parsed.toString();
}

export function createRpcPort(options: RpcPortOptions): RpcPort {
  const url = checkRpcUrl(options.url);
  for (const method of options.methods) {
    if (!(RPC_READ_METHODS as readonly string[]).includes(method)) throw new RpcError("invalid_input", "method_not_a_read");
  }
  const methods = Object.freeze([...options.methods]);
  const post = options.post;
  const maxBatch = Math.max(1, Math.min(options.maxBatch ?? DEFAULT_MAX_BATCH, 100));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 8));
  const maxLogBlockRange = options.maxLogBlockRange === undefined ? DEFAULT_MAX_LOG_BLOCK_RANGE : options.maxLogBlockRange;
  const allowLatestLogs = options.allowLatestLogs ?? false;
  const maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS;
  const requireLogAddress = options.requireLogAddress ?? true;
  const maxResultChars = options.maxResultChars ?? DEFAULT_MAX_BODY_CHARS;
  let nextId = 1;
  let latched = false;
  let batching = options.batch !== "never";
  let lastMode: "batch" | "single" | "none" = "none";

  const latch = (status?: number): never => {
    latched = true;
    throw new RpcError("requires_key", status === undefined ? "requires_key" : `http_${status}`, status === undefined ? {} : { status });
  };

  function allowed(method: RpcMethod): void {
    if (!methods.includes(method)) throw new RpcError("unsupported_method", "method_not_allowed");
  }

  // An HTTP answer that is not a usable 2xx: latch, limit, timeout or a plain status error.
  function httpFailure(response: RpcHttpResponse): RpcError | null {
    const { status, body } = response;
    if (status === 401 || status === 403) return latch(status);
    if (status === 429) return new RpcError("rate_limited", "http_429", { status, retryAfterMs: response.retryAfterMs ?? null });
    if (status >= 200 && status < 300) return null;
    // A non-2xx body that mentions an API key is the same signal as a 401.
    if (API_KEY_COMPLAINT.test(textOf(body))) return latch(status);
    if (status === 408 || status === 504) return new RpcError("timeout", `http_${status}`, { status });
    return new RpcError("http_status", `http_${status}`, { status, retryAfterMs: response.retryAfterMs ?? null });
  }

  async function send(body: unknown, request: RpcRequestOptions): Promise<RpcHttpResponse> {
    if (latched) throw new RpcError("requires_key", "requires_key_latched");
    try {
      return await post(url, body, request);
    } catch (error) {
      if (error instanceof RpcError) throw error;
      throw new RpcError("unreachable", "no_response", { cause: error });
    }
  }

  // A JSON-RPC error object: a revert is a per-request answer; a limit or a key complaint is thrown.
  function errorKind(error: unknown): "revert" | "error" {
    const code = isRecord(error) ? error["code"] : undefined;
    const message = isRecord(error) && typeof error["message"] === "string" ? error["message"].slice(0, 500) : "";
    // Code 3 is an execution revert: its text is chosen by the contract, so it can never flip the latch (a hostile
    // contract must not be able to switch our reads off).
    if (code === 3 || REVERT_TEXT.test(message)) return "revert";
    if (code === -32005 || LIMIT_TEXT.test(message)) throw new RpcError("rate_limited", "rpc_limited");
    if (API_KEY_COMPLAINT.test(message)) return latch();
    return "error";
  }

  function itemOf(raw: unknown, request: RpcRequest): RpcItemResult {
    if (!isRecord(raw)) return { ok: false, kind: "error" };
    const error = raw["error"];
    if (error !== undefined && error !== null) return { ok: false, kind: errorKind(error) };
    if (!("result" in raw)) return { ok: false, kind: "error" };
    const value = raw["result"];
    // eth_getBlockByNumber and eth_getTransactionReceipt answer null for an unknown block or transaction.
    if (value === null && (request.method === "eth_getBlockByNumber" || request.method === "eth_getTransactionReceipt")) return { ok: true, result: null };
    const shaped = resultShape(request.method, value, maxResultChars);
    return shaped === null ? { ok: false, kind: "error" } : { ok: true, result: shaped };
  }

  async function request(method: RpcMethod, params: readonly unknown[], requestOptions: RpcRequestOptions = {}): Promise<unknown> {
    allowed(method);
    const id = nextId;
    nextId += 1;
    const response = await send({ jsonrpc: "2.0", id, method, params }, requestOptions);
    const failure = httpFailure(response);
    if (failure !== null) throw failure;
    const body = response.body;
    if (!isRecord(body)) {
      if (API_KEY_COMPLAINT.test(textOf(body))) latch();
      throw new RpcError("invalid_response", typeof body === "string" ? "invalid_json" : "not_an_object");
    }
    const error = body["error"];
    if (error !== undefined && error !== null) {
      if (errorKind(error) === "revert") throw new RpcError("reverted", "reverted");
      throw new RpcError("upstream_error", "rpc_error");
    }
    if (body["id"] !== id || !("result" in body)) throw new RpcError("invalid_response", "id_mismatch");
    const item = itemOf(body, { method, params });
    if (!item.ok) throw new RpcError("invalid_response", "result_shape");
    return item.result;
  }

  async function single(item: RpcRequest, requestOptions: RpcRequestOptions): Promise<RpcItemResult> {
    try {
      return { ok: true, result: await request(item.method, item.params, requestOptions) };
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      if (error.code === "reverted") return { ok: false, kind: "revert" };
      // An answer that is not JSON at all means the endpoint is not speaking JSON-RPC: thrown, not one bad read.
      if ((error.code === "invalid_response" && error.detail !== "invalid_json") || error.code === "upstream_error") return { ok: false, kind: "error" };
      throw error;
    }
  }

  async function singles(items: readonly RpcRequest[], requestOptions: RpcRequestOptions): Promise<RpcItemResult[]> {
    const results = new Array<RpcItemResult>(items.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) return;
        results[index] = await single(item, requestOptions);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
  }

  // null: the endpoint did not answer the array form; the caller falls back for good.
  async function batch(items: readonly RpcRequest[], requestOptions: RpcRequestOptions): Promise<RpcItemResult[] | null> {
    const firstId = nextId;
    nextId += items.length;
    let response: RpcHttpResponse;
    try {
      response = await send(
        items.map((item, index) => ({ jsonrpc: "2.0", id: firstId + index, method: item.method, params: item.params })),
        requestOptions,
      );
    } catch (error) {
      // An oversize answer is the array form failing, not the endpoint.
      if (error instanceof RpcError && error.code === "too_large") return null;
      throw error;
    }
    const { status, body } = response;
    // A 4xx other than a key refusal, a limit, a timeout or a missing route: the array body itself was refused.
    const refusedArray = status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 404 && status !== 408 && status !== 429;
    if (refusedArray && !API_KEY_COMPLAINT.test(textOf(body))) return null;
    const failure = httpFailure(response);
    if (failure !== null) throw failure;
    if (!Array.isArray(body)) {
      if (typeof body === "string" && API_KEY_COMPLAINT.test(body)) latch();
      return null;
    }
    const byId = new Map<string, unknown>();
    for (const raw of body as unknown[]) {
      if (!isRecord(raw)) continue;
      const id = raw["id"];
      if (typeof id === "number" || typeof id === "string") byId.set(String(id), raw);
    }
    // Some nodes answer a batch with fewer or no ids; a missing answer is an error for that request only.
    return items.map((item, index) => {
      const raw = byId.get(String(firstId + index));
      return raw === undefined ? { ok: false as const, kind: "error" as const } : itemOf(raw, item);
    });
  }

  async function requestMany(items: readonly RpcRequest[], requestOptions: RpcRequestOptions = {}): Promise<RpcItemResult[]> {
    for (const item of items) allowed(item.method);
    const out: RpcItemResult[] = [];
    for (let from = 0; from < items.length; from += maxBatch) {
      const chunk = items.slice(from, from + maxBatch);
      let results: RpcItemResult[] | null = null;
      if (batching && chunk.length > 1) {
        results = await batch(chunk, requestOptions);
        if (results === null) batching = false;
      }
      lastMode = results === null ? "single" : "batch";
      out.push(...(results ?? (await singles(chunk, requestOptions))));
    }
    return out;
  }

  function checkCall(call: RpcCall): void {
    if (!isAddressHex(call.to) || typeof call.data !== "string" || !HEX_BYTES.test(call.data)) throw new RpcError("invalid_input", "bad_call");
  }

  const callRequest = (call: RpcCall): RpcRequest => ({ method: "eth_call", params: [{ to: call.to, data: call.data }, "latest"] });

  async function call(target: RpcCall, requestOptions?: RpcRequestOptions): Promise<Hex> {
    checkCall(target);
    return (await request("eth_call", callRequest(target).params, requestOptions)) as Hex;
  }

  async function callMany(calls: readonly RpcCall[], requestOptions?: RpcRequestOptions): Promise<RpcCallResult[]> {
    for (const target of calls) checkCall(target);
    const results = await requestMany(calls.map(callRequest), requestOptions);
    return results.map((result) => (result.ok ? { ok: true, data: result.result as Hex } : result));
  }

  async function getCode(address: Address, requestOptions?: RpcRequestOptions): Promise<Hex> {
    if (!isAddressHex(address)) throw new RpcError("invalid_input", "bad_address");
    return (await request("eth_getCode", [address, "latest"], requestOptions)) as Hex;
  }

  async function getStorageAt(address: Address, slot: Hex, requestOptions?: RpcRequestOptions): Promise<Hex> {
    if (!isAddressHex(address) || !HEX_32.test(slot)) throw new RpcError("invalid_input", "bad_storage_read");
    return (await request("eth_getStorageAt", [address, slot, "latest"], requestOptions)) as Hex;
  }

  async function blockNumber(requestOptions?: RpcRequestOptions): Promise<bigint> {
    return BigInt((await request("eth_blockNumber", [], requestOptions)) as string);
  }

  async function chainId(requestOptions?: RpcRequestOptions): Promise<number> {
    const value = BigInt((await request("eth_chainId", [], requestOptions)) as string);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RpcError("invalid_response", "chain_id_too_large");
    return Number(value);
  }

  async function getLogs(filter: LogFilter, requestOptions?: RpcRequestOptions): Promise<LogRead> {
    const addresses = (filter.address === null ? [] : typeof filter.address === "string" ? [filter.address] : [...filter.address]).map((address) => {
      if (!isAddressHex(address)) throw new RpcError("invalid_input", "bad_log_address");
      return address.toLowerCase() as Address;
    });
    if ((addresses.length === 0 && requireLogAddress) || addresses.length > 20) throw new RpcError("invalid_input", "log_address_count");
    if (filter.topics.length > 4) throw new RpcError("invalid_input", "too_many_topics");
    const topics = filter.topics.map((topic) => {
      if (topic === null) return null;
      const list = typeof topic === "string" ? [topic] : [...topic];
      if (list.length === 0 || list.length > 50 || !list.every((entry) => HEX_32.test(entry))) throw new RpcError("invalid_input", "bad_log_topic");
      return list.map((entry) => entry.toLowerCase() as Hex);
    });
    if (filter.fromBlock < 0n) throw new RpcError("invalid_input", "bad_block_range");
    if (filter.toBlock === "latest") {
      if (!allowLatestLogs) throw new RpcError("invalid_input", "open_block_range");
    } else {
      if (filter.toBlock < filter.fromBlock) throw new RpcError("invalid_input", "bad_block_range");
      if (maxLogBlockRange !== null && filter.toBlock - filter.fromBlock + 1n > maxLogBlockRange) throw new RpcError("invalid_input", "block_range_too_wide");
    }
    const params: Record<string, unknown> = {
      fromBlock: quantityHex(filter.fromBlock),
      toBlock: filter.toBlock === "latest" ? "latest" : quantityHex(filter.toBlock),
      topics: topics.map((list) => (list === null ? null : list.length === 1 ? list[0] : list)),
    };
    if (addresses.length > 0) params["address"] = typeof filter.address === "string" ? addresses[0] : addresses;
    let result: unknown;
    try {
      result = await request("eth_getLogs", [params], requestOptions);
    } catch (error) {
      // A range or result-size refusal: the caller must ask for less.
      if (error instanceof RpcError && error.code === "upstream_error") throw new RpcError("upstream_error", "logs_range_refused", { cause: error });
      throw error;
    }
    const rows = result as unknown[];
    if (rows.length > maxLogs) throw new RpcError("too_large", "too_many_logs");
    const logs: RpcLog[] = [];
    let droppedPending = 0;
    let droppedMalformed = 0;
    let droppedUnmatched = 0;
    for (const raw of rows) {
      const parsed = parseLog(raw);
      if (parsed === "pending") droppedPending += 1;
      else if (parsed === null) droppedMalformed += 1;
      else if (!matchesFilter(parsed, addresses, topics, filter)) droppedUnmatched += 1;
      else logs.push(parsed);
    }
    logs.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
    return { logs, droppedPending, droppedMalformed, droppedUnmatched };
  }

  return {
    url,
    methods,
    get requiresKey() {
      return latched;
    },
    request,
    requestMany,
    call,
    callMany,
    getCode,
    getStorageAt,
    blockNumber,
    chainId,
    getLogs,
    mode: () => lastMode,
  };
}

// One eth_getLogs row. Trailing null topics (an explorer habit some nodes copy) are dropped; a null before a topic, a
// missing transaction hash or log index, or anything of the wrong shape is malformed. No block number yet: pending.
export function parseLog(raw: unknown): RpcLog | "pending" | null {
  if (!isRecord(raw)) return null;
  const block = raw["blockNumber"];
  if (block === null) return "pending";
  if (typeof block !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(block)) return null;
  const address = raw["address"];
  if (!isAddressHex(address)) return null;
  const rawTopics = raw["topics"];
  if (!Array.isArray(rawTopics) || rawTopics.length > 4) return null;
  const topics: Hex[] = [];
  let sawNull = false;
  for (const entry of rawTopics as unknown[]) {
    if (entry === null) {
      sawNull = true;
      continue;
    }
    if (sawNull || typeof entry !== "string" || !HEX_32.test(entry)) return null;
    topics.push(entry.toLowerCase() as Hex);
  }
  if (topics.length < 1) return null;
  const data = raw["data"];
  if (typeof data !== "string" || !HEX_BYTES.test(data)) return null;
  const hash = raw["transactionHash"];
  if (typeof hash !== "string" || !HEX_32.test(hash)) return null;
  const index = raw["logIndex"];
  if (typeof index !== "string" || !/^0x[0-9a-fA-F]{1,8}$/.test(index)) return null;
  return {
    address: address.toLowerCase() as Address,
    topics,
    data: data.toLowerCase() as Hex,
    blockNumber: BigInt(block),
    transactionHash: hash.toLowerCase() as Hex,
    logIndex: Number(BigInt(index)),
  };
}

function matchesFilter(log: RpcLog, addresses: readonly Address[], topics: ReadonlyArray<readonly Hex[] | null>, filter: LogFilter): boolean {
  if (addresses.length > 0 && !addresses.includes(log.address)) return false;
  for (let i = 0; i < topics.length; i += 1) {
    const wanted = topics[i];
    if (wanted === null || wanted === undefined) continue;
    const topic = log.topics[i];
    if (topic === undefined || !wanted.includes(topic)) return false;
  }
  if (log.blockNumber < filter.fromBlock) return false;
  if (filter.toBlock !== "latest" && log.blockNumber > filter.toBlock) return false;
  return true;
}
