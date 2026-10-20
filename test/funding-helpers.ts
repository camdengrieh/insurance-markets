import { readFileSync } from "node:fs";

import { encodeAbiParameters, encodeEventTopics } from "viem";

import { DEFAULTS, type EnvLike, type GuardrailConfig } from "../src/config.js";
import type { AuditEvent } from "../src/guardrails/audit.js";
import {
  POST_ROUTES,
  type PostPath,
  type PostRequest,
  type PostResponse,
  type RelayCallOptions,
  type RelayClient,
  type RelayResult,
} from "../src/relay/contract.js";
import { ALL_FLAGS_OFF } from "../src/relay/flags.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { deriveAccountState, type AccountStateResult } from "../src/xo/account/state.js";
import { ERC20_ABI, WARP_ROUTER_ABI } from "../src/xo/chain/abi.js";
import {
  BASE_USDC,
  DISPATCH_ID_TOPIC,
  HYPERLANE_DOMAIN_XO,
  HYPERLANE_MAILBOX,
  BASE_WARP_ROUTER,
  type Address,
  type Hex,
} from "../src/xo/chain/constants.js";
import { ExplorerLogReader, readDeploymentLogs, type RpcHttpResponse, type RpcTransport } from "../src/xo/chain/reads.js";
import { padRecipient } from "../src/xo/funding/calldata.js";
import { BaseRpc } from "../src/xo/funding/preflight.js";
import { SENT_TRANSFER_REMOTE_TOPIC } from "../src/xo/funding/delivery.js";
import { defaultFundToolDeps, type FundToolDeps, type XoFundingReads } from "../src/tools/fund.js";
import { FakeExplorer, FakeRpc, accountDeployedRow, pinnedBase } from "./fixtures/chain/fakes.js";

// Shared fakes for the funding tests. Nothing here touches the network: the Base RPC, the relay and the
// XO reads are all in-memory. The owners are the public Anvil/Hardhat test addresses (addresses only, no
// key is anywhere in this repository's tests for funding).

export const T0 = Date.parse("2030-01-01T00:00:00.000Z");
export const isoAt = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

interface AnvilPair {
  readonly index: number;
  readonly owner: Address;
  readonly account: Address;
}
const pairsFile = JSON.parse(readFileSync(new URL("./fixtures/chain/owner-account-pairs.json", import.meta.url), "utf8")) as { anvil: AnvilPair[] };
export const ANVIL_PAIRS: readonly AnvilPair[] = pairsFile.anvil;
const first = ANVIL_PAIRS[0];
const second = ANVIL_PAIRS[1];
if (first === undefined || second === undefined) throw new Error("the Anvil pair fixture is empty");
export const OWNER: Address = first.owner;
export const ACCOUNT: Address = first.account;
export const OWNER_B: Address = second.owner;
export const ACCOUNT_B: Address = second.account;

export const FUNDING_ID = "0123456789abcdef0123456789abcdef";
export const TX_HASH: Hex = `0x${"ab".repeat(32)}`;
export const MESSAGE_ID: Hex = `0x${"cd".repeat(32)}`;
export const USDC = 1_000_000n;

// A tiny seeded generator (mulberry32). Tests must not use Math.random.
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomHex(next: () => number, bytes: number): Hex {
  let out = "0x";
  for (let i = 0; i < bytes; i += 1) out += Math.floor(next() * 256).toString(16).padStart(2, "0");
  return out as Hex;
}

// ---- Base -----------------------------------------------------------------------------------------------

// A Base RPC: the pinned route (src/../test/fixtures/chain/fakes.ts) plus eth_chainId, receipts, blocks and
// the owner's USDC allowance and balance. Mutate the public fields to change the world.
export class FakeBase implements RpcTransport {
  readonly inner: FakeRpc;
  allowance = 0n;
  balance = 10n * USDC;
  chainId = 8453;
  readonly receipts = new Map<string, unknown>();
  readonly blocks = new Map<string, unknown>();
  readonly throwOn = new Set<string>();
  readonly requests: { readonly url: string; readonly method: string; readonly params: readonly unknown[] }[] = [];

  constructor(quote?: (amount: bigint) => unknown) {
    this.inner = pinnedBase(quote);
    this.inner
      .setCall(BASE_USDC, ERC20_ABI, "allowance", () => this.allowance)
      .setCall(BASE_USDC, ERC20_ABI, "balanceOf", () => this.balance);
  }

  async postJson(url: string, body: unknown): Promise<RpcHttpResponse> {
    const request = body as { id: number; method: string; params: unknown[] };
    this.requests.push({ url, method: request.method, params: request.params });
    if (this.throwOn.has(request.method)) throw new Error("network down");
    const reply = (result: unknown): RpcHttpResponse => ({ status: 200, body: { jsonrpc: "2.0", id: request.id, result } });
    switch (request.method) {
      case "eth_chainId":
        return reply(`0x${this.chainId.toString(16)}`);
      case "eth_getTransactionReceipt":
        return reply(this.receipts.get(String(request.params[0]).toLowerCase()) ?? null);
      case "eth_getBlockByNumber":
        return reply(this.blocks.get(String(request.params[0]).toLowerCase()) ?? null);
      default:
        return this.inner.postJson(url, body);
    }
  }

  methods(): string[] {
    return this.requests.map((request) => request.method);
  }
}

export interface ReceiptOptions {
  readonly txHash?: Hex;
  readonly account?: Address;
  readonly amount?: bigint;
  readonly messageId?: Hex;
  readonly block?: bigint;
  readonly status?: 0 | 1;
  readonly destination?: number;
  readonly router?: Address;
  readonly mailbox?: Address;
  readonly extraLogs?: readonly unknown[];
  readonly omitDispatch?: boolean;
  readonly omitTransfer?: boolean;
}

// The raw JSON-RPC receipt of one transferRemote: SentTransferRemote from the router and DispatchId from
// the Mailbox, as hex strings the way a node sends them.
export function transferReceipt(options: ReceiptOptions = {}): Record<string, unknown> {
  const account = options.account ?? ACCOUNT;
  const amount = options.amount ?? USDC;
  const sent = encodeEventTopics({
    abi: WARP_ROUTER_ABI,
    eventName: "SentTransferRemote",
    args: { destination: options.destination ?? HYPERLANE_DOMAIN_XO, recipient: padRecipient(account) },
  });
  const logs: unknown[] = [];
  if (options.omitTransfer !== true) {
    logs.push({
      address: (options.router ?? BASE_WARP_ROUTER).toLowerCase(),
      topics: sent,
      data: encodeAbiParameters([{ type: "uint256" }], [amount]),
    });
  }
  if (options.omitDispatch !== true) {
    logs.push({ address: (options.mailbox ?? HYPERLANE_MAILBOX).toLowerCase(), topics: [DISPATCH_ID_TOPIC, options.messageId ?? MESSAGE_ID], data: "0x" });
  }
  logs.push(...(options.extraLogs ?? []));
  return {
    transactionHash: options.txHash ?? TX_HASH,
    status: `0x${(options.status ?? 1).toString(16)}`,
    blockNumber: `0x${(options.block ?? 1000n).toString(16)}`,
    from: OWNER.toLowerCase(),
    to: BASE_WARP_ROUTER.toLowerCase(),
    logs,
  };
}

export function putReceipt(base: FakeBase, options: ReceiptOptions = {}, blockTimestampS?: number): void {
  const receipt = transferReceipt(options);
  base.receipts.set(String(receipt["transactionHash"]).toLowerCase(), receipt);
  if (blockTimestampS !== undefined) {
    base.blocks.set(String(receipt["blockNumber"]).toLowerCase(), { timestamp: `0x${blockTimestampS.toString(16)}` });
  }
}

export const BASE_URL = "https://base-rpc.example.test";
export function baseRpcOver(base: FakeBase): BaseRpc {
  return new BaseRpc({ transport: base, url: BASE_URL });
}

// ---- the relay ---------------------------------------------------------------------------------------------

export type RelayHandler = (body: Record<string, unknown>) => RelayResult<unknown>;

const ok = <T>(data: T): RelayResult<T> => ({ ok: true, status: 200, data });
export const relayFailure = (code: string, message = "refused", status = 422): RelayResult<never> =>
  ({ ok: false, status, error: { code, message } }) as unknown as RelayResult<never>;

function validated<P extends PostPath>(path: P, value: unknown): PostResponse<P> {
  return POST_ROUTES[path].response.parse(value) as PostResponse<P>;
}

// A scripted relay. Each answer is checked against the contract's own response schema, so a fake can
// never drift away from what the real relay is allowed to say.
export class FakeRelay implements RelayClient {
  readonly calls: { readonly path: string; readonly body: Record<string, unknown>; readonly options: RelayCallOptions | undefined }[] = [];
  readonly handlers = new Map<string, RelayHandler>();
  state: "undeployed" | "deployed_unregistered" | "registered" = "registered";
  capabilities: Record<string, "unknown" | "yes" | "no"> = {};

  constructor() {
    this.handlers.set("/v1/funding/check", (body) =>
      ok(
        validated("/v1/funding/check", {
          permitted: true,
          account: body["account"] ?? deriveAccount(String(body["owner"])),
          state: this.state,
          reserved_usd: body["amount"],
          funding_id: FUNDING_ID,
          expires_at: isoAt(T0 + 300_000),
          funding_remaining_usd: "7",
          reasons: [],
        }),
      ),
    );
    this.handlers.set("/v1/account/status", (body) =>
      ok(
        validated("/v1/account/status", {
          account: body["account"] ?? deriveAccount(String(body["owner"])),
          state: this.state,
          registered: this.state === "registered",
          trading_enabled: "unknown",
          balance_usd: "0",
          credentials: { state: "none", key_tag: null },
          flags: ALL_FLAGS_OFF,
          tripwires: { ok: true, tripped: [] },
          capabilities: this.capabilities,
          upstream: {},
        }),
      ),
    );
    this.handlers.set("/v1/funding/report", (body) =>
      ok(validated("/v1/funding/report", { funding_id: body["funding_id"], state: "dispatched", message_id: MESSAGE_ID })),
    );
  }

  async post<P extends PostPath>(path: P, body: PostRequest<P>, options?: RelayCallOptions): Promise<RelayResult<PostResponse<P>>> {
    const record = body as unknown as Record<string, unknown>;
    // The request must be valid under the contract, or the real client would never send it.
    POST_ROUTES[path].request.parse(body);
    this.calls.push({ path, body: record, options });
    const handler = this.handlers.get(path);
    if (handler === undefined) return relayFailure("not_implemented", "no handler", 501) as RelayResult<PostResponse<P>>;
    return handler(record) as RelayResult<PostResponse<P>>;
  }

  async get(): Promise<never> {
    throw new Error("the funding tools make no GET calls");
  }

  paths(): string[] {
    return this.calls.map((call) => call.path);
  }
}

// ---- the XO side ----------------------------------------------------------------------------------------------

export async function accountStateFromLogs(owner: Address, account: Address, deployed: boolean, registered: boolean | null = null): Promise<AccountStateResult> {
  const explorer = new FakeExplorer({ rows: deployed ? [accountDeployedRow(account)] : [] });
  const logs = await readDeploymentLogs(new ExplorerLogReader({ transport: explorer }), account);
  return deriveAccountState({
    owner,
    suppliedAccount: account,
    logs,
    registry: registered === null ? { kind: "unavailable" } : { kind: "read", smartAccount: registered ? account : null },
  });
}

export class FakeXo implements XoFundingReads {
  balanceMicro: bigint | null = 0n;
  state: AccountStateResult | null = null;
  delivered: boolean | null = null;
  throwOn = new Set<string>();
  readonly calls: string[] = [];

  async readAccount(): Promise<{ balanceMicro: bigint | null; state: AccountStateResult | null }> {
    this.calls.push("readAccount");
    if (this.throwOn.has("readAccount")) throw new Error("boom");
    return { balanceMicro: this.balanceMicro, state: this.state };
  }

  async readBalance(): Promise<bigint | null> {
    this.calls.push("readBalance");
    if (this.throwOn.has("readBalance")) throw new Error("boom");
    return this.balanceMicro;
  }

  async isDelivered(): Promise<boolean | null> {
    this.calls.push("isDelivered");
    if (this.throwOn.has("isDelivered")) throw new Error("boom");
    return this.delivered;
  }
}

// ---- the tool's dependencies -----------------------------------------------------------------------------------

export interface World {
  deps: FundToolDeps;
  readonly base: FakeBase;
  readonly relay: FakeRelay;
  readonly xo: FakeXo;
  readonly audit: AuditEvent[];
  env: Record<string, string | undefined>;
  config: GuardrailConfig;
  now: number;
}

export interface WorldOptions {
  readonly env?: Record<string, string | undefined>;
  readonly config?: Partial<GuardrailConfig>;
  readonly readBudgetMs?: number;
}

// Funding on, kill switch off, owner A's account deployed, 10 USDC on Base, nothing approved yet.
export async function makeWorld(options: WorldOptions = {}): Promise<World> {
  const base = new FakeBase();
  const relay = new FakeRelay();
  const xo = new FakeXo();
  xo.state = await accountStateFromLogs(OWNER, ACCOUNT, true, true);
  const audit: AuditEvent[] = [];
  const world: Omit<World, "deps"> & { deps?: FundToolDeps } = {
    base,
    relay,
    xo,
    audit,
    env: { ENABLE_FUNDING: "1", ...(options.env ?? {}) },
    config: { ...DEFAULTS, ...(options.config ?? {}) } as GuardrailConfig,
    now: T0,
  };
  world.deps = {
    nowMs: () => world.now,
    config: () => world.config,
    env: (): EnvLike => world.env,
    relay: () => relay,
    baseRpc: () => baseRpcOver(base),
    xo: () => xo,
    audit: { write: (event) => audit.push(event) },
    ...(options.readBudgetMs === undefined ? {} : { readBudgetMs: options.readBudgetMs }),
  };
  return world as World;
}

// The production wiring, for the tests that check it has no surprises.
export const productionDeps = (): FundToolDeps => defaultFundToolDeps();

export { SENT_TRANSFER_REMOTE_TOPIC };
