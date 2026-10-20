import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  type Abi,
} from "viem";

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
} from "../../../src/xo/chain/abi.js";
import {
  ACCESS_MANAGER,
  CONFIG_MANAGER,
  BASE_ROUTER_IMPLEMENTATION,
  BASE_USDC,
  BASE_WARP_ROUTER,
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE,
  ECDSA_VALIDATOR,
  EIP1967_IMPLEMENTATION_SLOT,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  HYPERLANE_HOOK,
  HYPERLANE_ISM,
  HYPERLANE_MAILBOX,
  PAYMASTER_POLICY_PROBES,
  POLICY_PAYMASTER,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
  XO_ROUTE_IMPLEMENTATION,
  XO_WARP_ROUTE,
  BASE_CHAIN_ID,
  type Address,
  type Hex,
} from "../../../src/xo/chain/constants.js";
import { XoError } from "../../../src/xo/http.js";
import type { ExplorerTransport, RpcHttpResponse, RpcTransport } from "../../../src/xo/chain/reads.js";

// ---- explorer ------------------------------------------------------------------------------------

export interface RawRow {
  address: string | null;
  topics: Array<string | null>;
  data: string;
  blockNumber: string | null;
  timeStamp?: string;
  logIndex?: string;
  transactionHash?: string;
  [key: string]: unknown;
}

const hex = (value: bigint | number): string => `0x${BigInt(value).toString(16)}`;

export function padTopic(address: string): Hex {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}` as Hex;
}

export interface RowOptions {
  readonly block?: bigint | number;
  readonly logIndex?: number;
  readonly tx?: string;
}

function baseRow(address: string, topics: readonly string[], data: string, options: RowOptions): RawRow {
  const block = options.block ?? 100;
  return {
    address: address.toLowerCase(),
    topics: [...topics, ...Array<null>(Math.max(0, 4 - topics.length)).fill(null)],
    data,
    blockNumber: hex(block),
    timeStamp: hex(1_760_000_000 + Number(block)),
    logIndex: hex(options.logIndex ?? 0),
    transactionHash: options.tx ?? `0x${BigInt(block).toString(16).padStart(64, "0")}`,
    transactionIndex: "0x0",
  };
}

function eventRow(abi: Abi, emitter: Address, eventName: string, args: Record<string, unknown>, dataTypes: readonly { type: string }[], dataValues: readonly unknown[], options: RowOptions): RawRow {
  const topics = encodeEventTopics({ abi, eventName, args } as Parameters<typeof encodeEventTopics>[0]);
  const data = dataTypes.length === 0 ? "0x" : encodeAbiParameters(dataTypes as never, dataValues as never);
  return baseRow(emitter, topics as readonly string[], data, options);
}

const zeroHash = `0x${"00".repeat(32)}` as Hex;

export function accountDeployedRow(account: Address, options: RowOptions & { factory?: Address; paymaster?: Address } = {}): RawRow {
  return eventRow(
    ENTRY_POINT_ABI,
    ENTRY_POINT_V07,
    "AccountDeployed",
    { userOpHash: `0x${BigInt(options.block ?? 100).toString(16).padStart(64, "1")}`, sender: account },
    [{ type: "address" }, { type: "address" }],
    [options.factory ?? KERNEL_FACTORY, options.paymaster ?? POLICY_PAYMASTER],
    options,
  );
}

export function ownerRegisteredRow(account: Address, owner: Address, options: RowOptions = {}): RawRow {
  return eventRow(ECDSA_VALIDATOR_ABI, ECDSA_VALIDATOR, "OwnerRegistered", { kernel: account, owner }, [], [], options);
}

export function nonceIncrementedRow(maker: Address, oldNonce: bigint, newNonce: bigint, options: RowOptions = {}): RawRow {
  return eventRow(
    CTF_EXCHANGE_ABI,
    CTF_EXCHANGE,
    "NonceIncremented",
    { user: maker, admin: "0x0000000000000000000000000000000000000001" },
    [{ type: "uint128" }, { type: "uint128" }],
    [oldNonce, newNonce],
    options,
  );
}

export function upgradedRow(proxy: Address, implementation: Address, options: RowOptions = {}): RawRow {
  return eventRow(UPGRADED_EVENT_ABI, proxy, "Upgraded", { implementation }, [], [], options);
}

export function maxFeeRateRow(previous: bigint, next: bigint, options: RowOptions = {}): RawRow {
  return eventRow(CTF_EXCHANGE_ABI, CTF_EXCHANGE, "MaxFeeRateUpdated", {}, [{ type: "uint256" }, { type: "uint256" }], [previous, next], options);
}

export function tokenApprovalRow(owner: Address, spender: Address, value: bigint, options: RowOptions = {}): RawRow {
  return eventRow(ERC20_ABI, USDC_E_ADDRESS, "Approval", { owner, spender }, [{ type: "uint256" }], [value], options);
}

export function approvalForAllRow(account: Address, operator: Address, approved: boolean, options: RowOptions = {}): RawRow {
  return eventRow(CONDITIONAL_TOKENS_ABI, CONDITIONAL_TOKENS, "ApprovalForAll", { account, operator }, [{ type: "bool" }], [approved], options);
}

export function envelope(rows: readonly RawRow[]): unknown {
  return rows.length === 0 ? { status: "0", message: "No logs found", result: [] } : { status: "1", message: "OK", result: rows };
}

export interface FakeExplorerOptions {
  readonly rows: readonly RawRow[];
  // Rows returned per call at most. Default 1,000.
  readonly cap?: number;
  // "first" returns the earliest rows when capped; "spread" returns evenly spaced rows (not contiguous).
  readonly capMode?: "first" | "spread";
  // Extra rows the fake returns on every call regardless of the filter (a server that ignores filters).
  readonly alwaysInclude?: readonly RawRow[];
  // Called before answering; may throw to simulate a transport failure.
  readonly onRequest?: (url: URL, count: number) => void;
  // Replace the answer entirely (rate limit text, garbage).
  readonly override?: (url: URL, count: number) => unknown | undefined;
}

export class FakeExplorer implements ExplorerTransport {
  readonly urls: URL[] = [];
  constructor(private readonly options: FakeExplorerOptions) {}

  async getJson(raw: string): Promise<unknown> {
    const url = new URL(raw);
    this.urls.push(url);
    this.options.onRequest?.(url, this.urls.length);
    const overridden = this.options.override?.(url, this.urls.length);
    if (overridden !== undefined) return overridden;
    const q = url.searchParams;
    if (url.hostname !== "explorer-mainnet.xo.market" || url.pathname !== "/api" || q.get("module") !== "logs" || q.get("action") !== "getLogs") {
      throw new XoError("not_found", "upstream returned HTTP 404");
    }
    const from = BigInt(q.get("fromBlock") ?? "0");
    const toParam = q.get("toBlock") ?? "latest";
    const to = toParam === "latest" ? null : BigInt(toParam);
    const address = q.get("address")?.toLowerCase();
    const topics = [0, 1, 2, 3].map((i) => q.get(`topic${i}`)?.toLowerCase());
    const matched = this.options.rows.filter((row) => {
      if (row.blockNumber === null) return false;
      const block = BigInt(row.blockNumber);
      if (block < from || (to !== null && block > to)) return false;
      if (address !== undefined && (row.address ?? "").toLowerCase() !== address) return false;
      return topics.every((t, i) => t === undefined || (row.topics[i] ?? "").toLowerCase() === t);
    });
    const sorted = [...matched].sort((a, b) => Number(BigInt(a.blockNumber ?? "0") - BigInt(b.blockNumber ?? "0")) || Number(BigInt(a.logIndex ?? "0") - BigInt(b.logIndex ?? "0")));
    const cap = this.options.cap ?? 1000;
    let page = sorted;
    if (sorted.length > cap) {
      if ((this.options.capMode ?? "first") === "first") page = sorted.slice(0, cap);
      else {
        const step = sorted.length / cap;
        page = Array.from({ length: cap }, (_, i) => sorted[Math.floor(i * step)] as RawRow);
      }
    }
    return envelope([...page, ...(this.options.alwaysInclude ?? [])]);
  }
}

// ---- JSON-RPC ------------------------------------------------------------------------------------

type Handler = (args: readonly unknown[]) => unknown;

export interface FakeRpcCall {
  readonly method: string;
  readonly params: readonly unknown[];
}

export class FakeRpc implements RpcTransport {
  readonly calls: FakeRpcCall[] = [];
  readonly urls: string[] = [];
  private readonly handlers = new Map<string, { abi: Abi; functionName: string; run: Handler }>();
  private readonly code = new Map<string, string>();
  private readonly storage = new Map<string, string>();
  // When set, every request gets this HTTP response instead.
  forceResponse: RpcHttpResponse | null = null;
  // Throw this instead of answering.
  forceThrow: unknown = null;

  setCall(to: Address, abi: Abi, functionName: string, run: Handler): this {
    this.handlers.set(`${to.toLowerCase()}:${functionName}`, { abi, functionName, run });
    return this;
  }

  setCode(address: Address, code: string): this {
    this.code.set(address.toLowerCase(), code);
    return this;
  }

  setStorage(address: Address, slot: string, value: string): this {
    this.storage.set(`${address.toLowerCase()}:${slot.toLowerCase()}`, value);
    return this;
  }

  async postJson(url: string, body: unknown): Promise<RpcHttpResponse> {
    this.urls.push(url);
    if (this.forceThrow !== null) throw this.forceThrow;
    const request = body as { id: number; method: string; params: unknown[] };
    this.calls.push({ method: request.method, params: request.params });
    if (this.forceResponse !== null) return this.forceResponse;
    const reply = (result: unknown): RpcHttpResponse => ({ status: 200, body: { jsonrpc: "2.0", id: request.id, result } });
    const fail = (code: number, message: string): RpcHttpResponse => ({ status: 200, body: { jsonrpc: "2.0", id: request.id, error: { code, message } } });
    switch (request.method) {
      case "eth_getCode":
        return reply(this.code.get(String(request.params[0]).toLowerCase()) ?? "0x");
      case "eth_getStorageAt":
        return reply(this.storage.get(`${String(request.params[0]).toLowerCase()}:${String(request.params[1]).toLowerCase()}`) ?? `0x${"00".repeat(32)}`);
      case "eth_call": {
        const call = request.params[0] as { to: string; data: Hex };
        for (const [key, handler] of this.handlers) {
          if (!key.startsWith(`${call.to.toLowerCase()}:`)) continue;
          let decoded: { functionName: string; args?: readonly unknown[] };
          try {
            decoded = decodeFunctionData({ abi: handler.abi, data: call.data }) as typeof decoded;
          } catch {
            continue;
          }
          if (decoded.functionName !== handler.functionName) continue;
          try {
            const result = handler.run(decoded.args ?? []);
            return reply(encodeFunctionResult({ abi: handler.abi, functionName: handler.functionName, result } as never));
          } catch (error) {
            if (error instanceof Error && error.message === "revert") return fail(3, "execution reverted");
            throw error;
          }
        }
        return fail(3, "execution reverted");
      }
      default:
        return fail(-32601, "Method not found");
    }
  }
}

export function revert(): never {
  throw new Error("revert");
}

// ---- ready-made chains ---------------------------------------------------------------------------

// The state of XO and Base as docs/phase1-gap-closing.md section 2.1 pins it, behind two fake RPCs.
export function pinnedBase(amountQuote?: (amount: bigint) => unknown): FakeRpc {
  const rpc = new FakeRpc();
  const word = (address: Address): Hex => padTopic(address);
  rpc
    .setCall(BASE_WARP_ROUTER, WARP_ROUTER_ABI, "token", () => BASE_USDC)
    .setCall(BASE_WARP_ROUTER, WARP_ROUTER_ABI, "routers", (args) => (Number(args[0]) === XO_CHAIN_ID ? word(XO_WARP_ROUTE) : zeroHash))
    .setCall(BASE_WARP_ROUTER, WARP_ROUTER_ABI, "mailbox", () => HYPERLANE_MAILBOX)
    .setCall(BASE_WARP_ROUTER, WARP_ROUTER_ABI, "interchainSecurityModule", () => HYPERLANE_ISM)
    .setCall(BASE_WARP_ROUTER, WARP_ROUTER_ABI, "localDomain", () => BASE_CHAIN_ID)
    .setCall(
      BASE_WARP_ROUTER,
      WARP_ROUTER_ABI,
      "quoteTransferRemote",
      (args) =>
        (amountQuote?.(args[2] as bigint) as unknown) ?? [
          { token: "0x0000000000000000000000000000000000000000", amount: 0n },
          { token: BASE_USDC, amount: args[2] as bigint },
          { token: BASE_USDC, amount: 0n },
        ],
    )
    .setCall(HYPERLANE_MAILBOX, MAILBOX_ABI, "defaultHook", () => HYPERLANE_HOOK)
    .setCall(HYPERLANE_MAILBOX, MAILBOX_ABI, "requiredHook", () => HYPERLANE_HOOK)
    .setStorage(BASE_WARP_ROUTER, EIP1967_IMPLEMENTATION_SLOT, padTopic(BASE_ROUTER_IMPLEMENTATION));
  return rpc;
}

export function pinnedXo(): FakeRpc {
  const rpc = new FakeRpc();
  rpc
    .setCall(XO_WARP_ROUTE, WARP_ROUTER_ABI, "token", () => USDC_E_ADDRESS)
    .setCall(XO_WARP_ROUTE, WARP_ROUTER_ABI, "routers", (args) => (Number(args[0]) === BASE_CHAIN_ID ? padTopic(BASE_WARP_ROUTER) : zeroHash))
    .setCall(XO_WARP_ROUTE, WARP_ROUTER_ABI, "mailbox", () => HYPERLANE_MAILBOX)
    .setCall(XO_WARP_ROUTE, WARP_ROUTER_ABI, "interchainSecurityModule", () => HYPERLANE_ISM)
    .setCall(XO_WARP_ROUTE, WARP_ROUTER_ABI, "localDomain", () => XO_CHAIN_ID)
    .setCall(HYPERLANE_MAILBOX, MAILBOX_ABI, "defaultHook", () => HYPERLANE_HOOK)
    .setCall(HYPERLANE_MAILBOX, MAILBOX_ABI, "requiredHook", () => HYPERLANE_HOOK)
    .setStorage(XO_WARP_ROUTE, EIP1967_IMPLEMENTATION_SLOT, padTopic(XO_ROUTE_IMPLEMENTATION));
  return rpc;
}

// A paymaster that answers every probe with the 2026-10-18 policy unless `overrides` flips it.
export function pinnedPaymaster(rpc: FakeRpc, options: { paused?: boolean; dailyTxLimit?: bigint; overrides?: Record<string, boolean> } = {}): FakeRpc {
  rpc
    .setCall(POLICY_PAYMASTER, POLICY_PAYMASTER_ABI, "paused", () => options.paused ?? false)
    .setCall(POLICY_PAYMASTER, POLICY_PAYMASTER_ABI, "dailyTxLimit", () => options.dailyTxLimit ?? 10_000n)
    .setCall(POLICY_PAYMASTER, POLICY_PAYMASTER_ABI, "checkPolicy", (args) => {
      const target = String(args[1]).toLowerCase();
      const selector = String(args[2]).toLowerCase();
      const probe = PAYMASTER_POLICY_PROBES.find((p) => p.target.toLowerCase() === target && p.selector.toLowerCase() === selector);
      if (probe === undefined) return [false, "Contract/selector not allowed"];
      const allowed = options.overrides?.[probe.label] ?? probe.allowed;
      return [allowed, allowed ? "Allowed" : "Contract/selector not allowed"];
    });
  return rpc;
}

export function creationChain(rpc: FakeRpc, options: { canCall?: boolean; delay?: number; fee?: bigint; allowed?: boolean } = {}): FakeRpc {
  rpc
    .setCall(ACCESS_MANAGER, ACCESS_MANAGER_ABI, "canCall", () => [options.canCall ?? true, options.delay ?? 0])
    .setCall(CONFIG_MANAGER, CONFIG_MANAGER_ABI, "collateralConfig", () => [options.allowed ?? true, 5000n, 200n, 5000n, 200n, 100000n, 5_000_000_000n, options.fee ?? 1_000_000n]);
  return rpc;
}

export function checksum(address: string): Address {
  return getAddress(address);
}
