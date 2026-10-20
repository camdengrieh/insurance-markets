// Keyless chain reads for XO (chain 3223) and Base, behind injected transports so every test runs on
// fixtures and nothing here touches the network by itself.
//
//   ExplorerLogReader  GET <explorer>/api?module=logs&action=getLogs ... (docs/research/21 sec 6, V4.3-4;
//                      19 sec 6). Splits block ranges to stay under the 1,000-row cap, drops pending rows
//                      (null block number), tolerates lazily filled address fields, and re-checks every
//                      row against the query so a server that ignores a filter cannot fool a caller.
//   RpcReader          optional JSON-RPC: eth_call, eth_getCode, eth_getLogs and eth_getStorageAt only.
//                      Anything else is refused locally. A 401, a 403 or an "api_key" complaint latches
//                      "requires key": later calls fail fast, and nothing ever looks for a key.
//   helper reads       trading-enabled (A8), paymaster policy, implementation slots, exchange nonces and
//                      NonceIncremented logs, route pairing, creation pre-flight.
//
// A deployment verdict is NEVER derived from the explorer's smart-contracts endpoint or its is_contract
// flag: both are filled lazily and 10 of 12 deployed accounts returned 404 (docs/research/19 V2.1,
// 22 V M1). Deployed means an AccountDeployed log (topic2 = sender) or an OwnerRegistered log
// (topic1 = account) exists, or an RPC code read returns the Kernel proxy runtime.
//
// Every failure is an error or an explicit `complete: false` / null field; nothing here turns an
// unreadable answer into "no logs" or "disabled".

import { decodeEventLog, decodeFunctionResult, encodeFunctionData, getAddress, isAddress, pad, zeroAddress, type Abi } from "viem";

import { isKernelProxyRuntime } from "../account/derive.js";
import {
  ACCESS_MANAGER_ABI,
  CONDITIONAL_TOKENS_ABI,
  CONFIG_MANAGER_ABI,
  CTF_EXCHANGE_ABI,
  ECDSA_VALIDATOR_ABI,
  ENTRY_POINT_ABI,
  ERC20_ABI,
  MAILBOX_ABI,
  POLICY_PAYMASTER_ABI,
  UPGRADED_EVENT_ABI,
  WARP_ROUTER_ABI,
} from "./abi.js";
import {
  ACCESS_MANAGER,
  ACCOUNT_DEPLOYED_TOPIC,
  APPROVAL_FOR_ALL_TOPIC,
  BASE_CHAIN_ID,
  BASE_WARP_ROUTER,
  CONDITIONAL_TOKENS,
  CONFIG_MANAGER,
  CREATE_CONVICTION_MARKET_SELECTOR,
  CTF_EXCHANGE,
  ECDSA_VALIDATOR,
  EIP1967_IMPLEMENTATION_SLOT,
  ENTRY_POINT_V07,
  ERC20_APPROVAL_TOPIC,
  MARKET_MANAGER,
  MAX_FEE_RATE_UPDATED_TOPIC,
  NONCE_INCREMENTED_TOPIC,
  OPERATING_LIMITS,
  OWNER_REGISTERED_TOPIC,
  PAYMASTER_POLICY_PROBES,
  PAYMASTER_PROBE_ACCOUNT,
  POLICY_PAYMASTER,
  UPGRADED_TOPIC,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
  XO_WARP_ROUTE,
  type Address,
  type Hex,
  type PaymasterPolicyProbe,
} from "./constants.js";
import { XO_EXPLORER_HOST, XoError, type XoHttp } from "../http.js";

// ---- errors ------------------------------------------------------------------------------------

export type ChainReadErrorCode =
  | "invalid_input" // a caller bug: a malformed address, topic, block range or call
  | "unsupported_method" // an RPC method outside the four-method allowlist (refused before any request)
  | "requires_key" // the host wants an API key; the latch is set and later calls fail fast
  | "rate_limited"
  | "timeout"
  | "upstream_error" // a non-2xx answer, an error envelope or a JSON-RPC error that is not a revert
  | "invalid_response" // the answer does not have the expected shape
  | "reverted" // eth_call reverted
  | "budget_exhausted"; // the request budget ran out before the read finished

// Messages are fixed text: upstream bodies are attacker-influenced and never reach `message`. `cause`
// may hold the transport's own error (which can carry upstream text), so callers log `code` and
// `message`, never `cause`.
export class ChainReadError extends Error {
  readonly code: ChainReadErrorCode;
  constructor(code: ChainReadErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ChainReadError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---- small helpers -----------------------------------------------------------------------------

const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const ADDRESS_ANY_CASE = /^0x[0-9a-fA-F]{40}$/;

// An address as a 32-byte log topic: left-padded, lower-case. Matches how the explorer indexes it.
export function padAddressTopic(address: string): Hex {
  if (!ADDRESS_ANY_CASE.test(address)) throw new ChainReadError("invalid_input", "not an address");
  return pad(address.toLowerCase() as Hex, { size: 32 });
}

// The address in a 32-byte topic, or null when the upper 12 bytes are not zero.
export function topicToAddress(topic: string): Address | null {
  if (!HEX_32.test(topic)) return null;
  const lower = topic.toLowerCase();
  if (!lower.startsWith("0x000000000000000000000000")) return null;
  return getAddress(`0x${lower.slice(26)}`);
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value !== "string") return null;
  if (/^0x[0-9a-fA-F]{1,64}$/.test(value) || /^[0-9]{1,30}$/.test(value)) return BigInt(value);
  return null;
}

function sameAddress(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

// Inputs to the helper reads come from our own derivation, but a caller bug must not turn into a read
// of the wrong account or a viem exception: lower-case or exact EIP-55 only.
function assertAddress(value: unknown, what: string): asserts value is Address {
  if (typeof value !== "string" || !isAddress(value, { strict: true })) throw new ChainReadError("invalid_input", `${what} is not a valid address`);
}

// ---- log rows ----------------------------------------------------------------------------------

export interface ChainLog {
  readonly address: Address;
  // 1 to 4 topics, lower-case 32-byte hex.
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint;
  readonly logIndex: bigint;
  readonly transactionHash: Hex | null;
  // Unix seconds when the explorer supplied it.
  readonly timestamp: bigint | null;
}

export interface LogQuery {
  readonly address?: Address;
  readonly topic0: Hex;
  readonly topic1?: Hex;
  readonly topic2?: Hex;
  readonly topic3?: Hex;
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint | "latest";
}

export interface LogReadResult {
  readonly logs: readonly ChainLog[];
  // False when a single block still returned a full page, when the request budget ran out, or when a
  // range could not be read. A caller that needs "no logs" must check this first.
  readonly complete: boolean;
  readonly requests: number;
  readonly droppedPending: number;
  readonly droppedMalformed: number;
  // Rows that did not match the query (wrong address or topic): the server ignored a filter.
  readonly droppedUnmatched: number;
  // Rows whose address field was empty and was taken from the query's address filter.
  readonly addressFilled: number;
}

export interface ExplorerTransport {
  getJson(url: string): Promise<unknown>;
}

// XoHttp already satisfies ExplorerTransport; this adapter exists to give the dependency a name and to
// pin the host: it only builds URLs for the explorer host, XoHttp enforces the allowlist.
export function explorerTransportFromHttp(http: Pick<XoHttp, "getJson">): ExplorerTransport {
  return { getJson: (url) => http.getJson(url) };
}

export interface ExplorerLogReaderOptions {
  readonly transport: ExplorerTransport;
  // Default https://explorer-mainnet.xo.market. Must be https with no path.
  readonly baseUrl?: string;
  // The explorer returns at most this many rows per call. Default 1,000.
  readonly rowCap?: number;
  // Hard ceiling on requests per getLogs call. Default 16 (the plugin has a 10 s budget at 4 req/s).
  readonly maxRequests?: number;
}

const DEFAULT_MAX_REQUESTS = 16;

interface Range {
  readonly from: bigint;
  readonly to: bigint | "latest";
}

function rangeKey(range: Range): string {
  return `${range.from}-${range.to}`;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof XoError) return error.kind === "timeout";
  return isRecord(error) && (error as { kind?: unknown }).kind === "timeout";
}

function logSortCompare(a: ChainLog, b: ChainLog): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  if (a.logIndex !== b.logIndex) return a.logIndex < b.logIndex ? -1 : 1;
  return 0;
}

export class ExplorerLogReader {
  private readonly transport: ExplorerTransport;
  private readonly base: string;
  private readonly rowCap: number;
  private readonly maxRequests: number;

  constructor(options: ExplorerLogReaderOptions) {
    this.transport = options.transport;
    const base = options.baseUrl ?? `https://${XO_EXPLORER_HOST}`;
    let parsed: URL;
    try {
      parsed = new URL(base);
    } catch {
      throw new ChainReadError("invalid_input", "explorer base URL could not be parsed");
    }
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search !== "" || parsed.username !== "") {
      throw new ChainReadError("invalid_input", "explorer base URL must be a plain https origin");
    }
    this.base = parsed.origin;
    this.rowCap = options.rowCap ?? OPERATING_LIMITS.explorerLogRowCap;
    this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
    if (!Number.isInteger(this.rowCap) || this.rowCap < 1) throw new ChainReadError("invalid_input", "rowCap must be a positive integer");
    if (!Number.isInteger(this.maxRequests) || this.maxRequests < 1) {
      throw new ChainReadError("invalid_input", "maxRequests must be a positive integer");
    }
  }

  // Builds the etherscan-style getLogs URL. Every pair of present topics gets topicI_J_opr=and,
  // otherwise the explorer ignores the combination (docs/research/21 V1.16).
  buildUrl(query: LogQuery, range: Range): string {
    const url = new URL("/api", this.base);
    const params = url.searchParams;
    params.set("module", "logs");
    params.set("action", "getLogs");
    params.set("fromBlock", range.from.toString());
    params.set("toBlock", range.to === "latest" ? "latest" : range.to.toString());
    // The checksummed form, as every query in the research scripts sent it; the topics are lower-case.
    if (query.address !== undefined) params.set("address", getAddress(query.address.toLowerCase()));
    const topics = [query.topic0, query.topic1, query.topic2, query.topic3];
    topics.forEach((topic, index) => {
      if (topic !== undefined) params.set(`topic${index}`, topic.toLowerCase());
    });
    const present = topics.flatMap((topic, index) => (topic === undefined ? [] : [index]));
    for (let i = 0; i < present.length; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) params.set(`topic${present[i]}_${present[j]}_opr`, "and");
    }
    return url.toString();
  }

  private validate(query: LogQuery): { from: bigint; to: bigint | "latest" } {
    if (query.address !== undefined && !ADDRESS_ANY_CASE.test(query.address)) {
      throw new ChainReadError("invalid_input", "log query address is malformed");
    }
    const topics = [query.topic0, query.topic1, query.topic2, query.topic3];
    for (const topic of topics) {
      if (topic !== undefined && !HEX_32.test(topic)) throw new ChainReadError("invalid_input", "log query topic is not 32-byte hex");
    }
    const from = query.fromBlock ?? 0n;
    const to = query.toBlock ?? "latest";
    if (from < 0n) throw new ChainReadError("invalid_input", "fromBlock must not be negative");
    if (to !== "latest" && to < from) throw new ChainReadError("invalid_input", "toBlock is below fromBlock");
    return { from, to };
  }

  async getLogs(query: LogQuery): Promise<LogReadResult> {
    const first = this.validate(query);
    const rows = new Map<string, ChainLog>();
    const stats = { requests: 0, droppedPending: 0, droppedMalformed: 0, droppedUnmatched: 0, addressFilled: 0 };
    let complete = true;
    const pending: Range[] = [{ from: first.from, to: first.to }];
    const seenRanges = new Set<string>();

    while (pending.length > 0) {
      const range = pending.pop();
      if (range === undefined) break;
      const key = rangeKey(range);
      if (seenRanges.has(key)) continue;
      seenRanges.add(key);
      if (stats.requests >= this.maxRequests) {
        complete = false;
        break;
      }
      stats.requests += 1;
      let envelope: unknown;
      try {
        envelope = await this.transport.getJson(this.buildUrl(query, range));
      } catch (error) {
        // The explorer times out on wide ranges: halve the range and try again, as long as there is
        // a numeric upper bound to halve. Every other failure is the caller's to handle.
        if (isTimeoutError(error) && range.to !== "latest" && range.to > range.from) {
          const mid = range.from + (range.to - range.from) / 2n;
          pending.push({ from: mid + 1n, to: range.to }, { from: range.from, to: mid });
          continue;
        }
        if (error instanceof ChainReadError) throw error;
        throw mapTransportError(error);
      }
      const rawRows = rowsOf(envelope);
      const parsed: ChainLog[] = [];
      let sawPending = 0;
      for (const raw of rawRows) {
        const outcome = parseRow(raw, query);
        if (outcome.kind === "ok") {
          parsed.push(outcome.log);
          if (outcome.addressFilled) stats.addressFilled += 1;
        } else if (outcome.kind === "pending") sawPending += 1;
        else if (outcome.kind === "unmatched") stats.droppedUnmatched += 1;
        else stats.droppedMalformed += 1;
      }
      stats.droppedPending += sawPending;
      for (const log of parsed) rows.set(`${log.blockNumber}:${log.transactionHash ?? ""}:${log.logIndex}:${log.data}`, log);

      // A full page means rows may be missing: narrow the range. The explorer ignores `page`, and the
      // subset it returns when capped is not guaranteed to be the earliest rows, so bisect.
      if (rawRows.length >= this.rowCap) {
        if (range.to === "latest") {
          // No numeric bound to halve yet: use the highest block seen, then read the tail beyond it.
          let highest: bigint | null = null;
          for (const log of parsed) if (highest === null || log.blockNumber > highest) highest = log.blockNumber;
          if (highest === null) {
            complete = false;
            continue;
          }
          pending.push({ from: highest + 1n, to: "latest" }, { from: range.from, to: highest });
        } else if (range.to > range.from) {
          const mid = range.from + (range.to - range.from) / 2n;
          pending.push({ from: mid + 1n, to: range.to }, { from: range.from, to: mid });
        } else {
          // One block still fills a page: this answer is truncated and cannot be completed.
          complete = false;
        }
      }
    }

    const logs = [...rows.values()].sort(logSortCompare);
    return { logs, complete, ...stats };
  }
}

function mapTransportError(error: unknown): ChainReadError {
  if (error instanceof XoError) {
    const code: ChainReadErrorCode =
      error.kind === "timeout"
        ? "timeout"
        : error.kind === "rate_limited"
          ? "rate_limited"
          : error.kind === "blocked" || error.kind === "invalid_input"
            ? "invalid_input"
            : error.kind === "invalid_response"
              ? "invalid_response"
              : "upstream_error";
    return new ChainReadError(code, `explorer request failed (${error.kind})`, { cause: error });
  }
  return new ChainReadError("upstream_error", "explorer request failed", { cause: error });
}

// {"status":"1","message":"OK","result":[...]} or {"status":"0","message":"No logs found","result":[]}.
// Anything else (an error string in `result`, a missing field) is an error, never an empty answer.
function rowsOf(envelope: unknown): unknown[] {
  if (!isRecord(envelope)) throw new ChainReadError("invalid_response", "explorer answer is not a JSON object");
  const result = envelope["result"];
  if (Array.isArray(result)) return result as unknown[];
  if (typeof result === "string" && /rate limit/i.test(result)) throw new ChainReadError("rate_limited", "explorer rate limit reached");
  throw new ChainReadError("invalid_response", "explorer answer carries no result list");
}

type RowOutcome =
  | { kind: "ok"; log: ChainLog; addressFilled: boolean }
  | { kind: "pending" }
  | { kind: "malformed" }
  | { kind: "unmatched" };

function parseRow(raw: unknown, query: LogQuery): RowOutcome {
  if (!isRecord(raw)) return { kind: "malformed" };
  // Pending rows have no block number yet.
  const rawBlock = raw["blockNumber"] ?? raw["block_number"];
  if (rawBlock === null || rawBlock === undefined || rawBlock === "" || rawBlock === "0x") return { kind: "pending" };
  const blockNumber = toBigInt(rawBlock);
  if (blockNumber === null) return { kind: "malformed" };

  const rawTopics = raw["topics"];
  if (!Array.isArray(rawTopics)) return { kind: "malformed" };
  const topics: Hex[] = [];
  let sawNull = false;
  for (const entry of rawTopics as unknown[]) {
    if (entry === null || entry === undefined || entry === "") {
      sawNull = true;
      continue;
    }
    if (sawNull || typeof entry !== "string" || !HEX_32.test(entry)) return { kind: "malformed" };
    topics.push(entry.toLowerCase() as Hex);
  }
  if (topics.length < 1 || topics.length > 4) return { kind: "malformed" };

  const data = raw["data"];
  if (typeof data !== "string" || !HEX_BYTES.test(data)) return { kind: "malformed" };

  // The address column fills lazily on this explorer: an empty value on an address-filtered query is
  // the queried address (the server only returns that contract's logs), anything else is not.
  let address: Address;
  let addressFilled = false;
  const rawAddress = raw["address"];
  if (rawAddress === null || rawAddress === undefined || rawAddress === "") {
    if (query.address === undefined) return { kind: "malformed" };
    address = getAddress(query.address.toLowerCase());
    addressFilled = true;
  } else if (typeof rawAddress === "string" && ADDRESS_ANY_CASE.test(rawAddress)) {
    address = getAddress(rawAddress.toLowerCase());
    if (query.address !== undefined && !sameAddress(address, query.address)) return { kind: "unmatched" };
  } else {
    return { kind: "malformed" };
  }

  const wanted = [query.topic0, query.topic1, query.topic2, query.topic3];
  for (let i = 0; i < wanted.length; i += 1) {
    const want = wanted[i];
    if (want !== undefined && topics[i] !== want.toLowerCase()) return { kind: "unmatched" };
  }

  const logIndex = toBigInt(raw["logIndex"] ?? raw["log_index"]) ?? 0n;
  const hash = raw["transactionHash"] ?? raw["transaction_hash"];
  const transactionHash = typeof hash === "string" && HEX_32.test(hash) ? (hash.toLowerCase() as Hex) : null;
  const timestamp = toBigInt(raw["timeStamp"] ?? raw["timestamp"]);
  return { kind: "ok", log: { address, topics, data: data.toLowerCase() as Hex, blockNumber, logIndex, transactionHash, timestamp }, addressFilled };
}

// ---- JSON-RPC ----------------------------------------------------------------------------------

export const RPC_ALLOWED_METHODS = Object.freeze(["eth_call", "eth_getCode", "eth_getLogs", "eth_getStorageAt"] as const);
export type RpcMethod = (typeof RPC_ALLOWED_METHODS)[number];

export interface RpcHttpResponse {
  readonly status: number;
  // The parsed JSON body, or the raw text when the body was not JSON.
  readonly body: unknown;
}

export interface RpcTransport {
  postJson(url: string, body: unknown): Promise<RpcHttpResponse>;
}

export interface RpcReaderOptions {
  readonly transport: RpcTransport;
  readonly url: string;
}

const API_KEY_COMPLAINT = /api[_\s-]?key/i;

export class RpcReader {
  private readonly transport: RpcTransport;
  private readonly url: string;
  private nextId = 1;
  private latched = false;

  constructor(options: RpcReaderOptions) {
    this.transport = options.transport;
    let parsed: URL;
    try {
      parsed = new URL(options.url);
    } catch {
      throw new ChainReadError("invalid_input", "RPC URL could not be parsed");
    }
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"))) {
      throw new ChainReadError("invalid_input", "RPC URL must be https (or loopback http for tests)");
    }
    if (parsed.username !== "" || parsed.password !== "") throw new ChainReadError("invalid_input", "RPC URL must not carry credentials");
    // A key in the query string is how XO's docs describe the private RPC. This reader never carries one.
    if (parsed.search !== "") throw new ChainReadError("invalid_input", "RPC URL must not carry a query string (no keys)");
    this.url = parsed.toString();
  }

  // True once the host asked for a key. Later requests fail fast without touching the transport.
  get requiresKey(): boolean {
    return this.latched;
  }

  async request(method: string, params: readonly unknown[]): Promise<unknown> {
    if (!(RPC_ALLOWED_METHODS as readonly string[]).includes(method)) {
      throw new ChainReadError("unsupported_method", "RPC method is not on the read-only allowlist");
    }
    if (this.latched) throw new ChainReadError("requires_key", "the RPC host requires a key; not retrying");
    const id = this.nextId;
    this.nextId += 1;
    let response: RpcHttpResponse;
    try {
      response = await this.transport.postJson(this.url, { jsonrpc: "2.0", id, method, params });
    } catch (error) {
      throw mapTransportError(error);
    }
    const { status, body } = response;
    if (status === 401 || status === 403) {
      this.latched = true;
      throw new ChainReadError("requires_key", "the RPC host requires a key");
    }
    if (status === 429) throw new ChainReadError("rate_limited", "RPC rate limit reached");
    if (status < 200 || status >= 300) {
      // A non-2xx body that mentions an API key is the same signal as a 401.
      if (textOf(body).match(API_KEY_COMPLAINT)) {
        this.latched = true;
        throw new ChainReadError("requires_key", "the RPC host requires a key");
      }
      throw new ChainReadError("upstream_error", `RPC answered HTTP ${status}`);
    }
    if (!isRecord(body)) {
      if (textOf(body).match(API_KEY_COMPLAINT)) {
        this.latched = true;
        throw new ChainReadError("requires_key", "the RPC host requires a key");
      }
      throw new ChainReadError("invalid_response", "RPC answer is not a JSON object");
    }
    const error = body["error"];
    if (error !== undefined && error !== null) {
      const code = isRecord(error) ? error["code"] : undefined;
      const message = isRecord(error) && typeof error["message"] === "string" ? error["message"] : "";
      // Code 3 is an execution revert: its text is chosen by the contract, so it can never flip the
      // latch (a hostile contract must not be able to switch our reads off).
      if (code === 3 || /execution reverted/i.test(message)) throw new ChainReadError("reverted", "the call reverted");
      if (API_KEY_COMPLAINT.test(message)) {
        this.latched = true;
        throw new ChainReadError("requires_key", "the RPC host requires a key");
      }
      throw new ChainReadError("upstream_error", "RPC returned an error");
    }
    if (body["id"] !== id || !("result" in body)) throw new ChainReadError("invalid_response", "RPC answer does not match the request");
    return body["result"];
  }

  async call(to: Address, data: Hex): Promise<Hex> {
    const result = await this.request("eth_call", [{ to, data }, "latest"]);
    return hexResult(result);
  }

  async getCode(address: Address): Promise<Hex> {
    return hexResult(await this.request("eth_getCode", [address, "latest"]));
  }

  async getStorageAt(address: Address, slot: Hex): Promise<Hex> {
    return hexResult(await this.request("eth_getStorageAt", [address, slot, "latest"]));
  }

  // One eth_getLogs call; it does not split ranges (the XO node refuses ranges over 100,000 blocks, and
  // the explorer reader is the primary path). Rows get the same checks as explorer rows, so a node that
  // ignores a filter cannot fool a caller. Rows without a block number (pending) are dropped.
  async getLogs(query: LogQuery): Promise<readonly ChainLog[]> {
    const topics = [query.topic0, query.topic1, query.topic2, query.topic3];
    for (const topic of topics) if (topic !== undefined && !HEX_32.test(topic)) throw new ChainReadError("invalid_input", "log query topic is not 32-byte hex");
    if (query.address !== undefined && !ADDRESS_ANY_CASE.test(query.address)) throw new ChainReadError("invalid_input", "log query address is malformed");
    const from = query.fromBlock ?? 0n;
    const to = query.toBlock ?? "latest";
    if (from < 0n || (to !== "latest" && to < from)) throw new ChainReadError("invalid_input", "log query block range is invalid");
    let last = -1;
    topics.forEach((topic, index) => {
      if (topic !== undefined) last = index;
    });
    const filter: Record<string, unknown> = {
      fromBlock: `0x${from.toString(16)}`,
      toBlock: to === "latest" ? "latest" : `0x${to.toString(16)}`,
      topics: topics.slice(0, last + 1).map((topic) => topic ?? null),
    };
    if (query.address !== undefined) filter["address"] = query.address.toLowerCase();
    const result = await this.request("eth_getLogs", [filter]);
    if (!Array.isArray(result)) throw new ChainReadError("invalid_response", "eth_getLogs did not return a list");
    const logs: ChainLog[] = [];
    for (const raw of result as unknown[]) {
      const outcome = parseRow(raw, query);
      if (outcome.kind === "ok") logs.push(outcome.log);
    }
    return logs.sort(logSortCompare);
  }
}

function textOf(body: unknown): string {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body) ?? "";
  } catch {
    return "";
  }
}

function hexResult(value: unknown): Hex {
  if (typeof value !== "string" || !HEX_BYTES.test(value)) throw new ChainReadError("invalid_response", "RPC result is not hex");
  return value.toLowerCase() as Hex;
}

// The implementation address held in an EIP-1967 slot, or null for an empty slot.
export async function readImplementationSlot(rpc: RpcReader, proxy: Address): Promise<Address | null> {
  assertAddress(proxy, "proxy");
  const raw = await rpc.getStorageAt(proxy, EIP1967_IMPLEMENTATION_SLOT);
  if (!HEX_32.test(raw)) throw new ChainReadError("invalid_response", "storage word is not 32 bytes");
  const address = topicToAddress(raw);
  if (address === null) throw new ChainReadError("invalid_response", "storage word is not an address");
  return address === zeroAddress ? null : address;
}

// ---- typed log decoders ------------------------------------------------------------------------

export interface AccountDeployedLog {
  readonly account: Address;
  readonly userOpHash: Hex;
  readonly factory: Address;
  readonly paymaster: Address;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex | null;
}

export interface OwnerRegisteredLog {
  readonly account: Address;
  readonly owner: Address;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex | null;
}

export interface NonceIncrementedLog {
  readonly maker: Address;
  readonly oldNonce: bigint;
  readonly newNonce: bigint;
  readonly admin: Address;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex | null;
}

export interface UpgradedLog {
  readonly implementation: Address;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex | null;
}

export interface MaxFeeRateUpdatedLog {
  readonly previous: bigint;
  readonly next: bigint;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex | null;
}

export interface TokenApprovalLog {
  readonly owner: Address;
  readonly spender: Address;
  readonly value: bigint;
  readonly blockNumber: bigint;
  readonly logIndex: bigint;
}

export interface ApprovalForAllLog {
  readonly account: Address;
  readonly operator: Address;
  readonly approved: boolean;
  readonly blockNumber: bigint;
  readonly logIndex: bigint;
}

type LogDecode<T> = { ok: true; value: T } | { ok: false };

function decodeLog<T>(log: ChainLog, build: (decoded: { eventName: string; args: Record<string, unknown> }) => T | null, abi: Abi): LogDecode<T> {
  try {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
    const value = build({ eventName: String(decoded.eventName), args: (decoded.args ?? {}) as Record<string, unknown> });
    return value === null ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export function decodeAccountDeployed(log: ChainLog): AccountDeployedLog | null {
  if (!sameAddress(log.address, ENTRY_POINT_V07)) return null;
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "AccountDeployed" && typeof args["sender"] === "string" && typeof args["factory"] === "string" && typeof args["paymaster"] === "string" && typeof args["userOpHash"] === "string"
        ? {
            account: getAddress(args["sender"]),
            userOpHash: args["userOpHash"] as Hex,
            factory: getAddress(args["factory"]),
            paymaster: getAddress(args["paymaster"]),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          }
        : null,
    ENTRY_POINT_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

export function decodeOwnerRegistered(log: ChainLog): OwnerRegisteredLog | null {
  if (!sameAddress(log.address, ECDSA_VALIDATOR)) return null;
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "OwnerRegistered" && typeof args["kernel"] === "string" && typeof args["owner"] === "string"
        ? { account: getAddress(args["kernel"]), owner: getAddress(args["owner"]), blockNumber: log.blockNumber, transactionHash: log.transactionHash }
        : null,
    ECDSA_VALIDATOR_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

export function decodeNonceIncremented(log: ChainLog): NonceIncrementedLog | null {
  if (!sameAddress(log.address, CTF_EXCHANGE)) return null;
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "NonceIncremented" &&
      typeof args["user"] === "string" &&
      typeof args["admin"] === "string" &&
      typeof args["oldNonce"] === "bigint" &&
      typeof args["newNonce"] === "bigint"
        ? {
            maker: getAddress(args["user"]),
            oldNonce: args["oldNonce"],
            newNonce: args["newNonce"],
            admin: getAddress(args["admin"]),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          }
        : null,
    CTF_EXCHANGE_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

export function decodeUpgraded(log: ChainLog, emitter: Address): UpgradedLog | null {
  if (!sameAddress(log.address, emitter)) return null;
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "Upgraded" && typeof args["implementation"] === "string"
        ? { implementation: getAddress(args["implementation"]), blockNumber: log.blockNumber, transactionHash: log.transactionHash }
        : null,
    UPGRADED_EVENT_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

export function decodeMaxFeeRateUpdated(log: ChainLog): MaxFeeRateUpdatedLog | null {
  if (!sameAddress(log.address, CTF_EXCHANGE)) return null;
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "MaxFeeRateUpdated" && typeof args["previousMaxFeeRateBps"] === "bigint" && typeof args["newMaxFeeRateBps"] === "bigint"
        ? { previous: args["previousMaxFeeRateBps"], next: args["newMaxFeeRateBps"], blockNumber: log.blockNumber, transactionHash: log.transactionHash }
        : null,
    CTF_EXCHANGE_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

export function decodeTokenApproval(log: ChainLog): TokenApprovalLog | null {
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "Approval" && typeof args["owner"] === "string" && typeof args["spender"] === "string" && typeof args["value"] === "bigint"
        ? { owner: getAddress(args["owner"]), spender: getAddress(args["spender"]), value: args["value"], blockNumber: log.blockNumber, logIndex: log.logIndex }
        : null,
    ERC20_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

export function decodeApprovalForAll(log: ChainLog): ApprovalForAllLog | null {
  const outcome = decodeLog(
    log,
    ({ eventName, args }) =>
      eventName === "ApprovalForAll" && typeof args["account"] === "string" && typeof args["operator"] === "string" && typeof args["approved"] === "boolean"
        ? { account: getAddress(args["account"]), operator: getAddress(args["operator"]), approved: args["approved"], blockNumber: log.blockNumber, logIndex: log.logIndex }
        : null,
    CONDITIONAL_TOKENS_ABI,
  );
  return outcome.ok ? outcome.value : null;
}

// ---- deployment logs ---------------------------------------------------------------------------

export interface DeploymentLogs {
  // AccountDeployed with topic2 = the account.
  readonly accountDeployed: readonly AccountDeployedLog[];
  // OwnerRegistered with topic1 = the account.
  readonly ownerRegistered: readonly OwnerRegisteredLog[];
  // Both queries finished with complete data. False means "no log" proves nothing.
  readonly complete: boolean;
  readonly requests: number;
}

// Two keyless getLogs calls. A decoded log whose account is not the queried one is dropped (a server
// that ignored the topic filter must not make some other account look deployed).
export async function readDeploymentLogs(explorer: ExplorerLogReader, account: Address): Promise<DeploymentLogs> {
  assertAddress(account, "account");
  const topic = padAddressTopic(account);
  const [deployed, registered] = await Promise.all([
    explorer.getLogs({ address: ENTRY_POINT_V07, topic0: ACCOUNT_DEPLOYED_TOPIC, topic2: topic }),
    explorer.getLogs({ address: ECDSA_VALIDATOR, topic0: OWNER_REGISTERED_TOPIC, topic1: topic }),
  ]);
  const accountDeployed = deployed.logs.flatMap((log) => {
    const decoded = decodeAccountDeployed(log);
    return decoded !== null && sameAddress(decoded.account, account) ? [decoded] : [];
  });
  const ownerRegistered = registered.logs.flatMap((log) => {
    const decoded = decodeOwnerRegistered(log);
    return decoded !== null && sameAddress(decoded.account, account) ? [decoded] : [];
  });
  return { accountDeployed, ownerRegistered, complete: deployed.complete && registered.complete, requests: deployed.requests + registered.requests };
}

export type CodeObservation = "kernel_proxy" | "other_code" | "none";

// eth_getCode on the account. Only the exact Kernel proxy runtime counts as a deployed Kernel.
export async function readAccountCode(rpc: RpcReader, account: Address): Promise<CodeObservation> {
  assertAddress(account, "account");
  const code = await rpc.getCode(account);
  if (code === "0x") return "none";
  return isKernelProxyRuntime(code) ? "kernel_proxy" : "other_code";
}

// ---- log-based helper reads --------------------------------------------------------------------

export interface LogListRead<T> {
  readonly logs: readonly T[];
  readonly complete: boolean;
}

export async function readNonceIncrements(explorer: ExplorerLogReader, maker: Address): Promise<LogListRead<NonceIncrementedLog>> {
  assertAddress(maker, "maker");
  const result = await explorer.getLogs({ address: CTF_EXCHANGE, topic0: NONCE_INCREMENTED_TOPIC, topic1: padAddressTopic(maker) });
  const logs = result.logs.flatMap((log) => {
    const decoded = decodeNonceIncremented(log);
    return decoded !== null ? [decoded] : [];
  });
  // A row that cannot be decoded is evidence of something we do not understand: not complete.
  return { logs, complete: result.complete && logs.length === result.logs.length };
}

export async function readUpgrades(explorer: ExplorerLogReader, proxy: Address): Promise<LogListRead<UpgradedLog>> {
  const result = await explorer.getLogs({ address: proxy, topic0: UPGRADED_TOPIC });
  const logs = result.logs.flatMap((log) => {
    const decoded = decodeUpgraded(log, proxy);
    return decoded !== null ? [decoded] : [];
  });
  return { logs, complete: result.complete && logs.length === result.logs.length };
}

export function readExchangeUpgrades(explorer: ExplorerLogReader): Promise<LogListRead<UpgradedLog>> {
  return readUpgrades(explorer, CTF_EXCHANGE);
}

export function readManagerUpgrades(explorer: ExplorerLogReader): Promise<LogListRead<UpgradedLog>> {
  return readUpgrades(explorer, MARKET_MANAGER);
}

export async function readFeeRateUpdates(explorer: ExplorerLogReader): Promise<LogListRead<MaxFeeRateUpdatedLog>> {
  const result = await explorer.getLogs({ address: CTF_EXCHANGE, topic0: MAX_FEE_RATE_UPDATED_TOPIC });
  const logs = result.logs.flatMap((log) => {
    const decoded = decodeMaxFeeRateUpdated(log);
    return decoded !== null ? [decoded] : [];
  });
  return { logs, complete: result.complete && logs.length === result.logs.length };
}

// ---- trading enabled (amendment A8) ------------------------------------------------------------

export type TradingEnabledState = "enabled" | "disabled" | "unknown";

export interface TradingEnabledRead {
  readonly state: TradingEnabledState;
  readonly source: "rpc" | "logs" | "none";
  // Exact on the RPC path. On the log path this is the last Approval value, which is only an upper bound
  // for a capped allowance (a transferFrom lowers the allowance without emitting Approval).
  readonly allowance: bigint | null;
  readonly allowanceExact: boolean;
  readonly approvedForAll: boolean | null;
  // True when the allowance is the maximum uint256, the shape XO's own Enable Trading uses.
  readonly unlimited: boolean;
  // Stable codes that explain "unknown" or a degraded read. Never upstream text.
  readonly notes: readonly string[];
}

const MAX_UINT256 = (1n << 256n) - 1n;
// An allowance this large is "unlimited" in practice: no transferFrom sequence gets near it.
const UNLIMITED_THRESHOLD = MAX_UINT256 / 2n;

export interface TradingReadDeps {
  readonly explorer?: ExplorerLogReader;
  readonly rpc?: RpcReader;
}

// RPC first (exact), then the latest matching logs. The gate wording is "read-only REST and log
// fallback": a capped allowance cannot be confirmed from logs, so that case is "unknown", not "enabled".
export async function readTradingEnabled(deps: TradingReadDeps, account: Address): Promise<TradingEnabledRead> {
  assertAddress(account, "account");
  const notes: string[] = [];
  if (deps.rpc !== undefined && !deps.rpc.requiresKey) {
    try {
      // One after the other: if the first call latches "requires key", the second is never sent.
      const allowance = await callDecoded(deps.rpc, USDC_E_ADDRESS, ERC20_ABI, "allowance", [account, CTF_EXCHANGE]);
      const approved = await callDecoded(deps.rpc, CONDITIONAL_TOKENS, CONDITIONAL_TOKENS_ABI, "isApprovedForAll", [account, CTF_EXCHANGE]);
      if (typeof allowance === "bigint" && typeof approved === "boolean") {
        return {
          state: approved && allowance > 0n ? "enabled" : "disabled",
          source: "rpc",
          allowance,
          allowanceExact: true,
          approvedForAll: approved,
          unlimited: allowance >= UNLIMITED_THRESHOLD,
          notes,
        };
      }
      notes.push("rpc_unexpected_result");
    } catch (error) {
      notes.push(error instanceof ChainReadError ? `rpc_${error.code}` : "rpc_failed");
    }
  } else if (deps.rpc !== undefined) {
    notes.push("rpc_requires_key");
  }
  if (deps.explorer === undefined) {
    return { state: "unknown", source: "none", allowance: null, allowanceExact: false, approvedForAll: null, unlimited: false, notes: [...notes, "no_explorer"] };
  }
  const topicAccount = padAddressTopic(account);
  const topicExchange = padAddressTopic(CTF_EXCHANGE);
  let approvals: LogReadResult;
  let forAll: LogReadResult;
  try {
    [approvals, forAll] = await Promise.all([
      deps.explorer.getLogs({ address: USDC_E_ADDRESS, topic0: ERC20_APPROVAL_TOPIC, topic1: topicAccount, topic2: topicExchange }),
      deps.explorer.getLogs({ address: CONDITIONAL_TOKENS, topic0: APPROVAL_FOR_ALL_TOPIC, topic1: topicAccount, topic2: topicExchange }),
    ]);
  } catch (error) {
    return {
      state: "unknown",
      source: "none",
      allowance: null,
      allowanceExact: false,
      approvedForAll: null,
      unlimited: false,
      notes: [...notes, error instanceof ChainReadError ? `logs_${error.code}` : "logs_failed"],
    };
  }
  const approvalLogs = approvals.logs.flatMap((log) => {
    const decoded = decodeTokenApproval(log);
    return decoded !== null && sameAddress(decoded.owner, account) && sameAddress(decoded.spender, CTF_EXCHANGE) && sameAddress(log.address, USDC_E_ADDRESS) ? [decoded] : [];
  });
  const forAllLogs = forAll.logs.flatMap((log) => {
    const decoded = decodeApprovalForAll(log);
    return decoded !== null && sameAddress(decoded.account, account) && sameAddress(decoded.operator, CTF_EXCHANGE) && sameAddress(log.address, CONDITIONAL_TOKENS) ? [decoded] : [];
  });
  const decodedAll = approvalLogs.length === approvals.logs.length && forAllLogs.length === forAll.logs.length;
  if (!approvals.complete || !forAll.complete || !decodedAll) {
    return { state: "unknown", source: "logs", allowance: null, allowanceExact: false, approvedForAll: null, unlimited: false, notes: [...notes, "logs_incomplete"] };
  }
  const lastApproval = approvalLogs[approvalLogs.length - 1];
  const lastForAll = forAllLogs[forAllLogs.length - 1];
  const allowance = lastApproval === undefined ? 0n : lastApproval.value;
  const approvedForAll = lastForAll === undefined ? false : lastForAll.approved;
  const unlimited = allowance >= UNLIMITED_THRESHOLD;
  notes.push("log_fallback");
  if (!approvedForAll || allowance === 0n) {
    return { state: "disabled", source: "logs", allowance, allowanceExact: false, approvedForAll, unlimited, notes };
  }
  if (!unlimited) {
    // The last Approval is a cap, and the remaining allowance may already be lower: not provable.
    return { state: "unknown", source: "logs", allowance, allowanceExact: false, approvedForAll, unlimited, notes: [...notes, "capped_allowance_unconfirmable"] };
  }
  return { state: "enabled", source: "logs", allowance, allowanceExact: false, approvedForAll, unlimited, notes };
}

// ---- typed eth_call ----------------------------------------------------------------------------

async function callDecoded(rpc: RpcReader, to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName, args });
  const raw = await rpc.call(to, data);
  try {
    return decodeFunctionResult({ abi, functionName, data: raw });
  } catch (cause) {
    throw new ChainReadError("invalid_response", "call result did not decode", { cause });
  }
}

// ---- exchange nonce ----------------------------------------------------------------------------

export interface ExchangeNonceRead {
  // The maker's current counter when an RPC answered; otherwise derived from the last NonceIncremented
  // log (0 when there is none and the log read is complete); null when unknown.
  readonly nonce: bigint | null;
  readonly source: "rpc" | "logs" | "none";
  readonly incrementLogs: readonly NonceIncrementedLog[] | null;
  readonly logsComplete: boolean;
  readonly notes: readonly string[];
}

export async function readExchangeNonce(deps: TradingReadDeps, maker: Address): Promise<ExchangeNonceRead> {
  assertAddress(maker, "maker");
  const notes: string[] = [];
  let nonce: bigint | null = null;
  let source: ExchangeNonceRead["source"] = "none";
  if (deps.rpc !== undefined && !deps.rpc.requiresKey) {
    try {
      const value = await callDecoded(deps.rpc, CTF_EXCHANGE, CTF_EXCHANGE_ABI, "nonces", [maker]);
      if (typeof value === "bigint") {
        nonce = value;
        source = "rpc";
      } else notes.push("rpc_unexpected_result");
    } catch (error) {
      notes.push(error instanceof ChainReadError ? `rpc_${error.code}` : "rpc_failed");
    }
  } else if (deps.rpc !== undefined) notes.push("rpc_requires_key");
  let incrementLogs: readonly NonceIncrementedLog[] | null = null;
  let logsComplete = false;
  if (deps.explorer !== undefined) {
    try {
      const read = await readNonceIncrements(deps.explorer, maker);
      incrementLogs = read.logs.filter((log) => sameAddress(log.maker, maker));
      logsComplete = read.complete;
      if (nonce === null && read.complete) {
        const last = incrementLogs[incrementLogs.length - 1];
        nonce = last === undefined ? 0n : last.newNonce;
        source = "logs";
      }
    } catch (error) {
      notes.push(error instanceof ChainReadError ? `logs_${error.code}` : "logs_failed");
    }
  }
  return { nonce, source, incrementLogs, logsComplete, notes };
}

// ---- paymaster ---------------------------------------------------------------------------------

export interface PaymasterProbeReading {
  readonly label: string;
  readonly target: Address;
  readonly selector: Hex;
  // What the 2026-10-18 policy said; the tripwire compares `allowed` with this.
  readonly expectedAllowed: boolean;
  // null when the probe could not be read.
  readonly allowed: boolean | null;
}

export interface PaymasterReading {
  readonly paused: boolean | null;
  readonly dailyTxLimit: bigint | null;
  readonly probes: readonly PaymasterProbeReading[];
  readonly notes: readonly string[];
}

// paused() and checkPolicy(probe account, target, selector) for each probe, by eth_call. A failed read
// is null, never a guess. Reason strings returned by checkPolicy are contract text and are discarded.
export async function readPaymasterPolicy(
  rpc: RpcReader,
  probes: readonly PaymasterPolicyProbe[] = PAYMASTER_POLICY_PROBES,
  probeAccount: Address = PAYMASTER_PROBE_ACCOUNT,
): Promise<PaymasterReading> {
  const notes: string[] = [];
  const attempt = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      notes.push(`${label}:${error instanceof ChainReadError ? error.code : "failed"}`);
      return null;
    }
  };
  const paused = await attempt("paused", async () => {
    const value = await callDecoded(rpc, POLICY_PAYMASTER, POLICY_PAYMASTER_ABI, "paused", []);
    if (typeof value !== "boolean") throw new ChainReadError("invalid_response", "paused() did not return a bool");
    return value;
  });
  const dailyTxLimit = await attempt("dailyTxLimit", async () => {
    const value = await callDecoded(rpc, POLICY_PAYMASTER, POLICY_PAYMASTER_ABI, "dailyTxLimit", []);
    if (typeof value !== "bigint") throw new ChainReadError("invalid_response", "dailyTxLimit() did not return a uint");
    return value;
  });
  const readings: PaymasterProbeReading[] = [];
  for (const probe of probes) {
    const allowed = await attempt(probe.label, async () => {
      const value = await callDecoded(rpc, POLICY_PAYMASTER, POLICY_PAYMASTER_ABI, "checkPolicy", [probeAccount, probe.target, probe.selector]);
      const first = Array.isArray(value) ? (value as unknown[])[0] : undefined;
      if (typeof first !== "boolean") throw new ChainReadError("invalid_response", "checkPolicy() did not return a bool");
      return first;
    });
    readings.push({ label: probe.label, target: probe.target, selector: probe.selector, expectedAllowed: probe.allowed, allowed });
  }
  return { paused, dailyTxLimit, probes: readings, notes };
}

// ---- route pairing (funding preflight) ---------------------------------------------------------

export interface QuoteEntry {
  readonly token: Address;
  readonly amount: bigint;
}

export interface RouteSideReading {
  readonly token: Address | null;
  // routers(remote domain): the remote router as a left-padded bytes32.
  readonly remoteRouter: Hex | null;
  readonly mailbox: Address | null;
  readonly ism: Address | null;
  readonly localDomain: number | null;
  readonly implementation: Address | null;
  readonly defaultHook: Address | null;
  readonly requiredHook: Address | null;
}

export interface RoutePairingReading {
  readonly amount: bigint;
  readonly base: RouteSideReading;
  // The Base-side quoteTransferRemote(3223, recipient, amount); null when not read.
  readonly baseQuote: readonly QuoteEntry[] | null;
  // The XO side needs the XO RPC, which is optional; null when it was not read.
  readonly xo: RouteSideReading | null;
  readonly notes: readonly string[];
}

async function readSide(rpc: RpcReader, router: Address, remoteDomain: number, notes: string[], side: string): Promise<RouteSideReading> {
  const attempt = async <T>(label: string, run: () => Promise<unknown>, narrow: (value: unknown) => T | null): Promise<T | null> => {
    try {
      return narrow(await run());
    } catch (error) {
      notes.push(`${side}.${label}:${error instanceof ChainReadError ? error.code : "failed"}`);
      return null;
    }
  };
  const asAddress = (value: unknown): Address | null => (typeof value === "string" && isAddress(value, { strict: false }) ? getAddress(value) : null);
  const token = await attempt("token", () => callDecoded(rpc, router, WARP_ROUTER_ABI, "token", []), asAddress);
  const remoteRouter = await attempt("routers", () => callDecoded(rpc, router, WARP_ROUTER_ABI, "routers", [remoteDomain]), (v) =>
    typeof v === "string" && HEX_32.test(v) ? (v.toLowerCase() as Hex) : null,
  );
  const mailbox = await attempt("mailbox", () => callDecoded(rpc, router, WARP_ROUTER_ABI, "mailbox", []), asAddress);
  const ism = await attempt("ism", () => callDecoded(rpc, router, WARP_ROUTER_ABI, "interchainSecurityModule", []), asAddress);
  const localDomain = await attempt("localDomain", () => callDecoded(rpc, router, WARP_ROUTER_ABI, "localDomain", []), (v) => (typeof v === "number" ? v : null));
  const implementation = await attempt("implementation", () => readImplementationSlot(rpc, router), (v) => (v === null ? null : asAddress(v)));
  // The hooks are read from the Mailbox the router itself names, so a swapped Mailbox cannot hide behind
  // a pinned hook address.
  const defaultHook =
    mailbox === null ? null : await attempt("defaultHook", () => callDecoded(rpc, mailbox, MAILBOX_ABI, "defaultHook", []), asAddress);
  const requiredHook =
    mailbox === null ? null : await attempt("requiredHook", () => callDecoded(rpc, mailbox, MAILBOX_ABI, "requiredHook", []), asAddress);
  return { token, remoteRouter, mailbox, ism, localDomain, implementation, defaultHook, requiredHook };
}

// Reads every property the funding preflight pins, on Base and (optionally) on XO. Each unreadable
// property is null; route pairing in tripwires.ts treats null as "cannot verify".
export async function readRoutePairing(
  deps: { readonly baseRpc: RpcReader; readonly xoRpc?: RpcReader },
  recipient: Address,
  amount: bigint,
): Promise<RoutePairingReading> {
  assertAddress(recipient, "recipient");
  if (typeof amount !== "bigint" || amount <= 0n) throw new ChainReadError("invalid_input", "the amount must be a positive bigint");
  const notes: string[] = [];
  const base = await readSide(deps.baseRpc, BASE_WARP_ROUTER, XO_CHAIN_ID, notes, "base");
  let baseQuote: readonly QuoteEntry[] | null = null;
  try {
    const quote = await callDecoded(deps.baseRpc, BASE_WARP_ROUTER, WARP_ROUTER_ABI, "quoteTransferRemote", [XO_CHAIN_ID, padAddressTopic(recipient), amount]);
    if (Array.isArray(quote)) {
      const entries = (quote as readonly { token?: unknown; amount?: unknown }[]).map((entry) =>
        typeof entry.token === "string" && typeof entry.amount === "bigint" ? { token: getAddress(entry.token), amount: entry.amount } : null,
      );
      if (entries.every((entry): entry is QuoteEntry => entry !== null)) baseQuote = entries;
    }
    if (baseQuote === null) notes.push("base.quote:unexpected_result");
  } catch (error) {
    notes.push(`base.quote:${error instanceof ChainReadError ? error.code : "failed"}`);
  }
  let xo: RouteSideReading | null = null;
  if (deps.xoRpc !== undefined) xo = await readSide(deps.xoRpc, XO_WARP_ROUTE, BASE_CHAIN_ID, notes, "xo");
  return { amount, base, baseQuote, xo, notes };
}

// ---- creation pre-flight (CR1, CR2) ------------------------------------------------------------

export interface CreationPreflightRead {
  // AccessManager.canCall(account, manager, createConvictionMarket): immediate permission and delay.
  readonly canCall: boolean | null;
  readonly delay: number | null;
  // CONFIG_MANAGER.collateralConfig(USDC.e): allowed flag and the creation fee in raw USDC.e units.
  readonly collateralAllowed: boolean | null;
  readonly creationFee: bigint | null;
  readonly notes: readonly string[];
}

export async function readCreationPreflight(rpc: RpcReader, account: Address): Promise<CreationPreflightRead> {
  assertAddress(account, "account");
  const notes: string[] = [];
  let canCall: boolean | null = null;
  let delay: number | null = null;
  try {
    const value = await callDecoded(rpc, ACCESS_MANAGER, ACCESS_MANAGER_ABI, "canCall", [account, MARKET_MANAGER, CREATE_CONVICTION_MARKET_SELECTOR]);
    if (Array.isArray(value) && typeof value[0] === "boolean" && typeof value[1] === "number") {
      canCall = value[0];
      delay = value[1];
    } else notes.push("canCall:unexpected_result");
  } catch (error) {
    notes.push(`canCall:${error instanceof ChainReadError ? error.code : "failed"}`);
  }
  let collateralAllowed: boolean | null = null;
  let creationFee: bigint | null = null;
  try {
    const value = await callDecoded(rpc, CONFIG_MANAGER, CONFIG_MANAGER_ABI, "collateralConfig", [USDC_E_ADDRESS]);
    if (Array.isArray(value) && typeof value[0] === "boolean" && typeof value[7] === "bigint") {
      collateralAllowed = value[0];
      creationFee = value[7];
    } else notes.push("collateralConfig:unexpected_result");
  } catch (error) {
    notes.push(`collateralConfig:${error instanceof ChainReadError ? error.code : "failed"}`);
  }
  return { canCall, delay, collateralAllowed, creationFee, notes };
}
