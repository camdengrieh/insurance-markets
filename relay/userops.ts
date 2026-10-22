import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, getAbiItem, toEventSelector } from "viem";
import * as z from "zod/v4";

import { parseAtomicInteger } from "../sdk/money/decimal.js";
import { formatAtomic, parseDecimalAtomic } from "../src/guardrails/amount.js";
import {
  digestTag,
  marketTitleSlot,
  PREPARED_TTL_S,
  SAFETY_NOTICES,
  type DigestForm,
  type PostRequestParsed,
  type PostResponseInput,
  type UserOpAction,
} from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { isEnabled, requireFlag, type Flags } from "../src/relay/flags.js";
import { deriveAccountState, gateDeploy, gateExistingAccountUserOp, type AccountStateResult, type RegistryObservation } from "../src/xo/account/state.js";
import { AccountError, deriveAccount, parseOwner } from "../src/xo/account/derive.js";
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI, POLICY_PAYMASTER_ABI, WARP_ROUTER_ABI } from "../src/xo/chain/abi.js";
import {
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE,
  ENTRY_POINT_V07,
  HYPERLANE_DOMAIN_BASE,
  KERNEL_FACTORY,
  MARKET_MANAGER,
  POLICY_PAYMASTER,
  USDC_E_ADDRESS,
  USDC_E_DECIMALS,
  USER_OPERATION_EVENT_TOPIC,
  XO_WARP_ROUTE,
  type Address,
  type Hex,
} from "../src/xo/chain/constants.js";
import {
  ChainReadError,
  ExplorerLogReader,
  RpcReader,
  padAddressTopic,
  readAccountCode,
  readDeploymentLogs,
  readTradingEnabled,
  type ChainLog,
  type CodeObservation,
  type DeploymentLogs,
  type ExplorerTransport,
  type RpcHttpResponse,
  type RpcTransport,
} from "../src/xo/chain/reads.js";
import { BundlerClient, BundlerError, type BundlerTransport } from "../src/xo/userop/bundler.js";
import { enableTradingCalls, redeemCalls, revokeTradingCalls, withdrawCalls } from "../src/xo/userop/calls.js";
import { UserOpError, decodeExecute, type Call } from "../src/xo/userop/encode.js";
import { applyBundlerEstimate, defaultGasFor, type GasPlan } from "../src/xo/userop/gas.js";
import { userOpHash } from "../src/xo/userop/hash.js";
import { decodeGetNonceResult, firstOpNonce, getNonceCallData, laneKeyFor, nextNonceAfter } from "../src/xo/userop/nonce.js";
import { packedFromJson, packedToJson, type PackedUserOpJson } from "../src/xo/userop/pack.js";
import { assertOperationShape, prepareUserOp, sponsorshipFallback, type PreparedUserOp as BuiltUserOp } from "../src/xo/userop/sign.js";
import { buildDecodedUserOp, rebuildDecoded } from "../src/xo/signing/rebuild.js";
import { verifyUserOpSignature } from "../src/xo/userop/verify.js";
import { isoSecondOf } from "./audit.js";
import type { AccountDirectory } from "./health.js";
import { guardSubmit } from "./capabilities.js";
import { needService } from "./config.js";
import { randomHex } from "./crypto.js";
import type { AbsenceVerdict, ReservationView } from "./ledger.js";
import type { PreparedRecord } from "./prepared.js";
import type { Json } from "./store.js";
import type { RouteTable, RelayContext } from "./types.js";
import { toRelayError, UpstreamError, type Upstream } from "./upstream.js";

// POST /v1/userop/prepare, POST /v1/userop/submit and GET /v1/userop/:hash
// (docs/phase1-gap-closing.md 3.2, 4 N1, 5.4, 8 D4, 9 A1 A2 A4 A11).
//
// PREPARE builds the thing the owner signs and shows what it does:
//   - the account is derived from the owner here (a caller's `account` is only compared with it);
//   - deploy_enable_trading needs a COMPLETE negative deployment read and carries initCode; every other
//     action needs POSITIVE proof of deployment (explorer logs, and the node's eth_getCode when open);
//   - calls come from the closed builders in src/xo/userop/calls.ts, never from the caller; the summary
//     decodes every call back from the bytes that will be hashed, with no free text;
//   - the nonce is read (EntryPoint.getNonce, else the last UserOperationEvent of the lane);
//   - the PolicyPaymaster is used only after `paused()` and `checkPolicy` say sponsor. A deployment that
//     cannot be sponsored stops; an existing account goes without a paymaster (UO7). Revoke and withdraw
//     never carry one;
//   - with ENABLE_USEROP_SUBMIT off prepare is a DRY RUN: same answer, no bundler call, and submit refuses.
//
// SUBMIT takes only prepared_id and signature (invariant 2). Before anything is sent it recomputes the
// hash from the STORED operation, requires the signature to recover to the owner under the raw or the
// EIP-191 digest, re-reads account state and nonce, re-checks flags, kill switch and tripwires, writes
// the `sending` marker, and sends once. An unclear result is `ambiguous` and is NEVER sent again; it is
// settled by the userOpHash (explorer log, bundler receipt) and then by the nonce.
//
// The three creation actions are built by another stream: it registers a UserOpActionExtension (below).
//
// WIRING (createRelay): `extraServices: { userops: loadUserOpOptions(env).options, useropExtensions }`, and
// `accounts: createAccountDirectory({ upstream: () => relay.services.upstream })` for POST /v1/account/status.
// The hosts this module talks to (explorer, XO node, bundler, orderbook) are in XO_UPSTREAM_HOSTS; the Base node
// of relay/funding.ts is added by createRelay only when RELAY_BASE_RPC_URL is set. Housekeeping the relay's
// maintenance loop should call now and then: sweepFundings(context) and followOpenFundings(context) from
// relay/funding.ts, and ledger.sweep(confirmOperationAbsent) from here.

// ---- tunables -----------------------------------------------------------------------------------

export const USEROP_FLAG = "ENABLE_USEROP_SUBMIT" as const;
const DEFAULT_XO_RPC_URL = "https://rpc-mainnet-2.xo.market/";
const DEFAULT_BUNDLER_URL = "https://mainnet-bundler.xo.market/";
const ORDERBOOK_BALANCE_URL = "https://orderbooks.xo.market/balance-allowance";
const HINTS_NS = "userop_hints";
// How long the explorer is given to index an operation before a moved nonce counts as "superseded".
export const SUPERSEDE_AFTER_MS = 120_000;

export const CREATION_ACTIONS = ["create_market", "respond_update", "cancel_market"] as const;
export type CreationAction = (typeof CREATION_ACTIONS)[number];
const CORE_ACTIONS = ["deploy_enable_trading", "enable_trading", "revoke_trading", "redeem", "withdraw"] as const;

function isCreationAction(action: UserOpAction): action is CreationAction {
  return (CREATION_ACTIONS as readonly string[]).includes(action);
}

// The capability facts a prepared item reports, so the agent can say what is unproven.
const BASE_FACTS = ["AD5", "UO5", "UO6", "UO7", "UO8", "UO9", "T1"] as const;

export interface UserOpOptions {
  // The XO node. null: no node reads at all (everything falls back to explorer logs).
  readonly xoRpcUrl?: string | null;
  readonly bundlerUrl?: string;
  // D4: auto = XO's unlimited allowance only while the balance is a test amount, then a capped one;
  // capped = always capped.
  readonly allowance?: "auto" | "capped";
  readonly unlimitedBalanceMaxAtomic?: bigint;
  // A capped allowance is the larger of the balance and this floor (D4: "the larger of open exposure and $50").
  readonly allowanceFloorAtomic?: bigint;
  // How long an unresolved (ambiguous) operation blocks new operations for the account.
  readonly ambiguousBlockMs?: number;
  // How long a paymaster refusal makes prepare skip the paymaster for an existing account.
  readonly sponsorRefusedHintMs?: number;
  // Ask the bundler for a gas estimate while ENABLE_USEROP_SUBMIT is on (UO5). Default true.
  readonly estimate?: boolean;
}

export const USEROP_DEFAULTS = Object.freeze({
  allowance: "auto" as const,
  unlimitedBalanceMaxAtomic: 10_000_000n,
  allowanceFloorAtomic: 50_000_000n,
  ambiguousBlockMs: 3_600_000,
  sponsorRefusedHintMs: 3_600_000,
});

export interface UserOpOptionIssue {
  readonly variable: string;
  // Never the raw value.
  readonly message: string;
}

// XO_RPC_URL, XO_BUNDLER_URL, RELAY_ALLOWANCE_POLICY (auto | capped), RELAY_UNLIMITED_BALANCE_MAX_USD,
// RELAY_ALLOWANCE_FLOOR_USD. A bad value is reported (by name only) and the safe default is used.
export function loadUserOpOptions(env: Readonly<Record<string, string | undefined>>): { readonly options: UserOpOptions; readonly issues: readonly UserOpOptionIssue[] } {
  const issues: UserOpOptionIssue[] = [];
  const read = (name: string): string | undefined => {
    const value = env[name];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const url = (name: string): string | undefined => {
    const value = read(name);
    if (value === undefined) return undefined;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") throw new Error("shape");
      return parsed.toString();
    } catch {
      issues.push({ variable: name, message: "must be an https URL with no credentials, query or fragment; the default is used." });
      return undefined;
    }
  };
  const usd = (name: string): bigint | undefined => {
    const value = read(name);
    if (value === undefined) return undefined;
    const parsed = parseDecimalAtomic(value, USDC_E_DECIMALS);
    if (!parsed.ok) {
      issues.push({ variable: name, message: "must be a plain decimal amount such as 10; the default is used." });
      return undefined;
    }
    return parsed.value;
  };
  const policy = read("RELAY_ALLOWANCE_POLICY");
  let allowance: "auto" | "capped" | undefined;
  if (policy === "auto" || policy === "capped") allowance = policy;
  else if (policy !== undefined) issues.push({ variable: "RELAY_ALLOWANCE_POLICY", message: "must be auto or capped; auto is used." });
  const rpc = url("XO_RPC_URL");
  const bundler = url("XO_BUNDLER_URL");
  const unlimitedMax = usd("RELAY_UNLIMITED_BALANCE_MAX_USD");
  const floor = usd("RELAY_ALLOWANCE_FLOOR_USD");
  const options: UserOpOptions = {
    ...(rpc === undefined ? {} : { xoRpcUrl: rpc }),
    ...(bundler === undefined ? {} : { bundlerUrl: bundler }),
    ...(allowance === undefined ? {} : { allowance }),
    ...(unlimitedMax === undefined ? {} : { unlimitedBalanceMaxAtomic: unlimitedMax }),
    ...(floor === undefined ? {} : { allowanceFloorAtomic: floor }),
  };
  return { options, issues };
}

// ---- the extension point for the creation stream ---------------------------------------------------------

export interface ExtensionRequest<A extends CreationAction = CreationAction> {
  readonly action: A;
  readonly owner: Address;
  readonly account: Address;
  // The validated request params (src/relay/contract.ts). Untrusted text inside (a title, a URI).
  readonly params: Extract<PostRequestParsed<"/v1/userop/prepare">, { readonly action: A }>["params"];
  readonly now: number;
  readonly context: RelayContext;
  readonly reads: XoReads;
}

export interface ExtensionBuild {
  // The calls, from src/xo/userop/calls.ts builders. They are judged again by the closed list and
  // by assertActionShape, whatever the extension says.
  readonly calls: readonly Call[];
  // Untrusted market title for the approval summary; it appears only in the fixed title slot.
  readonly title?: string | undefined;
  // A spend to reserve against the daily cap (the creation fee, a seed). Reserved before the item exists;
  // committed once the bundler accepts; released only by evidence after expiry.
  readonly reservation?: { readonly category: "creation_fee" | "seed" | "other"; readonly amountAtomic: bigint } | undefined;
  readonly warnings?: readonly string[] | undefined;
  // Extra capability ids to report next to the base ones.
  readonly capabilities?: readonly string[] | undefined;
  // Stored with the prepared item and handed back to the hooks. Plain JSON, no secrets.
  readonly data?: Json | undefined;
}

export interface ExtensionEvent {
  readonly record: PreparedRecord;
  readonly action: CreationAction;
  readonly owner: Address;
  readonly account: Address;
  readonly userOpHash: Hex;
  readonly data: Json | null;
  readonly context: RelayContext;
  readonly reads: XoReads;
}

export interface UserOpActionExtension {
  build(request: ExtensionRequest): Promise<ExtensionBuild>;
  // Just before the item is spent, after every other check. Throw a RelayError to refuse; nothing has been sent.
  beforeSend?(event: ExtensionEvent): Promise<void>;
  // After the bundler accepted the operation (not yet known to be included).
  afterAccepted?(event: ExtensionEvent): Promise<void>;
  // When the operation was seen on chain. `success` is the UserOperationEvent flag.
  afterIncluded?(event: ExtensionEvent & { readonly success: boolean; readonly txHash: Hex | null }): Promise<void>;
}

export type UserOpExtensions = Partial<Record<CreationAction, UserOpActionExtension>>;

declare module "./types.js" {
  interface RelayServices {
    readonly userops?: UserOpOptions;
    readonly useropExtensions?: UserOpExtensions;
  }
}

// ---- reading the chain through the relay's upstream client ------------------------------------------------------------

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function explorerTransportFor(upstream: Upstream): ExplorerTransport {
  return {
    async getJson(url) {
      const response = await upstream.request({ method: "GET", url, purpose: "explorer_logs" });
      if (!response.ok) throw new ChainReadError("upstream_error", `explorer answered HTTP ${response.status}`);
      return upstream.json(response);
    },
  };
}

// One transport shape serves the XO node, the Base node and the bundler (RpcTransport, BundlerTransport).
// A 401 or 403 comes back as a STATUS so the readers latch "requires key" (the upstream client has
// latched the host already and fails fast after the first); the first failure kind of the last call is
// kept for the caller that has to tell "never sent" from "maybe sent".
export interface JsonRpcTransport extends RpcTransport, BundlerTransport {
  lastFailure(): UpstreamFailure | undefined;
}
export type UpstreamFailure = { readonly kind: UpstreamError["kind"] };

export function jsonRpcTransportFor(upstream: Upstream, purpose: string): JsonRpcTransport {
  let last: UpstreamFailure | undefined;
  return {
    lastFailure: () => last,
    async postJson(url, body): Promise<RpcHttpResponse> {
      last = undefined;
      try {
        const response = await upstream.request({ method: "POST", url, purpose, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, body: parseJsonOrText(response.body) };
      } catch (error) {
        if (error instanceof UpstreamError) {
          last = { kind: error.kind };
          if (error.kind === "requires_key") return { status: 401, body: "requires key" };
          if (error.kind === "rate_limited") return { status: 429, body: "" };
        }
        throw error;
      }
    },
  };
}

export type SponsorVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: "paused" | "refused" | "unreadable" };

export type NonceRead =
  | { readonly ok: true; readonly nonce: bigint; readonly source: "first_op" | "rpc" | "logs" }
  | { readonly ok: false; readonly reason: "rpc_and_logs_unreadable" | "lane_full" };

export type OnChainOperation =
  | { readonly state: "found"; readonly success: boolean; readonly nonce: bigint; readonly sender: Address; readonly txHash: Hex | null; readonly blockNumber: bigint }
  | { readonly state: "not_seen"; readonly complete: boolean }
  | { readonly state: "unreadable" };

export interface OrderbookAccount {
  readonly registry: RegistryObservation;
  // The orderbook's credited balance in micro USDC.e; null when unread.
  readonly balanceMicro: bigint | null;
}

const CONDITION_RESOLUTION_TOPIC = toEventSelector(getAbiItem({ abi: CONDITIONAL_TOKENS_ABI, name: "ConditionResolution" }));
const BARE_OR_PREFIXED_ADDRESS = /^(?:0x)?[0-9a-fA-F]{40}$/;
// The orderbook's credited balance is an integer string of micro USDC.e, at most 31 digits.
const MAX_BALANCE_DIGITS = 31;
// Node lookups are paced by the upstream client (4 requests a second per host), so 12 fit inside the
// request budget next to the other reads.
// After this long a node that asked for a key is asked once more (the upstream client's own retry window).
export const RPC_RETRY_MS = 30 * 60_000;
const SMALL_BATCH = 12;
const NODE_LOOKUPS = 12;

export interface XoEndpoints {
  readonly xoRpcUrl: string | null;
  readonly bundlerUrl: string;
}

// Every read the user-operation and funding handlers make. Nothing here sends a transaction. A read
// that fails is null or "unreadable", never a guess, and no upstream text is kept.
export class XoReads {
  readonly explorer: ExplorerLogReader;
  #rpc: RpcReader | undefined;
  #latchedAtMs: number | undefined;
  readonly #upstream: Upstream;
  readonly #now: () => number;
  readonly endpoints: XoEndpoints;

  constructor(upstream: Upstream, endpoints: XoEndpoints, now: () => number = Date.now) {
    this.#upstream = upstream;
    this.#now = now;
    this.endpoints = endpoints;
    this.explorer = new ExplorerLogReader({ transport: explorerTransportFor(upstream) });
    this.#rpc = this.#buildRpc();
  }

  #buildRpc(): RpcReader | undefined {
    if (this.endpoints.xoRpcUrl === null) return undefined;
    try {
      return new RpcReader({ transport: jsonRpcTransportFor(this.#upstream, "xo_rpc"), url: this.endpoints.xoRpcUrl });
    } catch {
      return undefined;
    }
  }

  get upstream(): Upstream {
    return this.#upstream;
  }

  // The node reader, or undefined when none is configured or the host asked for a key. A reader that latched
  // "requires key" is replaced after RPC_RETRY_MS, as the upstream client allows its own single probe after
  // the same time; if the host still wants a key the new reader latches again on its first answer.
  rpc(): RpcReader | undefined {
    if (this.#rpc === undefined) return undefined;
    if (!this.#rpc.requiresKey) {
      this.#latchedAtMs = undefined;
      return this.#rpc;
    }
    const now = this.#now();
    this.#latchedAtMs ??= now;
    if (now - this.#latchedAtMs < RPC_RETRY_MS) return undefined;
    this.#rpc = this.#buildRpc();
    this.#latchedAtMs = undefined;
    return this.#rpc !== undefined && !this.#rpc.requiresKey ? this.#rpc : undefined;
  }

  async deploymentLogs(account: Address): Promise<DeploymentLogs | null> {
    try {
      return await readDeploymentLogs(this.explorer, account);
    } catch {
      return null;
    }
  }

  async code(account: Address): Promise<CodeObservation | null> {
    const rpc = this.rpc();
    if (rpc === undefined) return null;
    try {
      return await readAccountCode(rpc, account);
    } catch {
      return null;
    }
  }

  // GET /balance-allowance?address=<ACCOUNT>: the registry check (never the owner, AD3) and the credited
  // balance in one request.
  async orderbook(account: Address): Promise<OrderbookAccount> {
    const unavailable: OrderbookAccount = { registry: { kind: "unavailable" }, balanceMicro: null };
    try {
      const response = await this.#upstream.request({ method: "GET", url: `${ORDERBOOK_BALANCE_URL}?address=${account.toLowerCase()}`, purpose: "registry_check" });
      if (!response.ok) return unavailable;
      const json = this.#upstream.json(response);
      if (typeof json !== "object" || json === null || Array.isArray(json)) return unavailable;
      const record = json as Record<string, unknown>;
      const smart = record["smart_account"];
      let registry: RegistryObservation;
      if (smart === null || smart === undefined) registry = { kind: "read", smartAccount: null };
      else if (typeof smart === "string" && BARE_OR_PREFIXED_ADDRESS.test(smart)) registry = { kind: "read", smartAccount: smart };
      else return unavailable;
      const balance = record["balance"];
      const balanceMicro = typeof balance === "string" && balance.length <= MAX_BALANCE_DIGITS ? parseAtomicInteger(balance) : null;
      return { registry, balanceMicro };
    } catch {
      return unavailable;
    }
  }

  // USDC.e balanceOf(account) from the node; null when there is no node or it failed.
  async usdceBalance(account: Address): Promise<bigint | null> {
    const rpc = this.rpc();
    if (rpc === undefined) return null;
    try {
      const raw = await rpc.call(USDC_E_ADDRESS, encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [account] }));
      const value = decodeFunctionResult({ abi: ERC20_ABI, functionName: "balanceOf", data: raw });
      return typeof value === "bigint" ? value : null;
    } catch {
      return null;
    }
  }

  // The next nonce in the default root lane. A deploying operation uses the first-operation nonce. Else
  // EntryPoint.getNonce, else the last UserOperationEvent of the lane plus one (UO3).
  async nonce(account: Address, deployed: boolean): Promise<NonceRead> {
    if (!deployed) return { ok: true, nonce: firstOpNonce(), source: "first_op" };
    const rpc = this.rpc();
    if (rpc !== undefined) {
      try {
        return { ok: true, nonce: decodeGetNonceResult(await rpc.call(ENTRY_POINT_V07, getNonceCallData(account))), source: "rpc" };
      } catch {
        // fall through to the logs
      }
    }
    try {
      const read = await this.explorer.getLogs({ address: ENTRY_POINT_V07, topic0: USER_OPERATION_EVENT_TOPIC, topic2: padAddressTopic(account) });
      if (!read.complete) return { ok: false, reason: "rpc_and_logs_unreadable" };
      const lane = laneKeyFor();
      let last: bigint | undefined;
      for (const log of read.logs) {
        const event = decodeUserOperationEvent(log);
        if (event === null || event.sender.toLowerCase() !== account.toLowerCase()) continue;
        if (event.nonce >> 64n !== lane) continue;
        if (last === undefined || event.nonce > last) last = event.nonce;
      }
      if (last === undefined) return { ok: true, nonce: firstOpNonce(), source: "logs" };
      try {
        return { ok: true, nonce: nextNonceAfter(last), source: "logs" };
      } catch {
        return { ok: false, reason: "lane_full" };
      }
    } catch {
      return { ok: false, reason: "rpc_and_logs_unreadable" };
    }
  }

  // paused() and checkPolicy(account, target, selector) for every distinct call (UO7). Unreadable counts as
  // "not sponsorable": the caller decides what that means for its action.
  async sponsorship(account: Address, calls: readonly Call[]): Promise<SponsorVerdict> {
    const rpc = this.rpc();
    if (rpc === undefined) return { ok: false, reason: "unreadable" };
    try {
      const pausedRaw = await rpc.call(POLICY_PAYMASTER, encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "paused" }));
      const paused = decodeFunctionResult({ abi: POLICY_PAYMASTER_ABI, functionName: "paused", data: pausedRaw });
      if (typeof paused !== "boolean") return { ok: false, reason: "unreadable" };
      if (paused) return { ok: false, reason: "paused" };
      const seen = new Set<string>();
      for (const call of calls) {
        const selector = call.data.slice(0, 10) as Hex;
        const key = `${call.to.toLowerCase()}:${selector}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const raw = await rpc.call(POLICY_PAYMASTER, encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [account, call.to, selector] }));
        const result = decodeFunctionResult({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", data: raw });
        const allowed = Array.isArray(result) ? (result as readonly unknown[])[0] : undefined;
        if (typeof allowed !== "boolean") return { ok: false, reason: "unreadable" };
        if (!allowed) return { ok: false, reason: "refused" };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "unreadable" };
    }
  }

  // Is the condition resolved? true only with positive proof: payoutDenominator above zero from the node, or
  // a ConditionResolution log. false only from the node (a zero denominator). null: not proven (UO11).
  async resolved(conditionId: Hex): Promise<boolean | null> {
    const rpc = this.rpc();
    if (rpc !== undefined) {
      try {
        const raw = await rpc.call(CONDITIONAL_TOKENS, encodeFunctionData({ abi: CONDITIONAL_TOKENS_ABI, functionName: "payoutDenominator", args: [conditionId] }));
        const value = decodeFunctionResult({ abi: CONDITIONAL_TOKENS_ABI, functionName: "payoutDenominator", data: raw });
        if (typeof value === "bigint") return value > 0n;
      } catch {
        // fall through to the logs
      }
    }
    try {
      const read = await this.explorer.getLogs({ address: CONDITIONAL_TOKENS, topic0: CONDITION_RESOLUTION_TOPIC, topic1: conditionId });
      return read.logs.length > 0 ? true : null;
    } catch {
      return null;
    }
  }

  // The XO route's quote for sending `amount` to `owner` on Base. A withdrawal is a UserOp call with value 0, so
  // any native fee in the quote means it cannot work. Expected: [(0x0, 0), (USDC.e, amount), (USDC.e, 0)].
  async withdrawQuote(owner: Address, amount: bigint): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: "unreadable" | "fee" | "unexpected" }> {
    const rpc = this.rpc();
    if (rpc === undefined) return { ok: false, reason: "unreadable" };
    try {
      const raw = await rpc.call(XO_WARP_ROUTE, encodeFunctionData({ abi: WARP_ROUTER_ABI, functionName: "quoteTransferRemote", args: [HYPERLANE_DOMAIN_BASE, padAddressTopic(owner), amount] }));
      const quote = decodeFunctionResult({ abi: WARP_ROUTER_ABI, functionName: "quoteTransferRemote", data: raw });
      if (!Array.isArray(quote) || quote.length !== 3) return { ok: false, reason: "unexpected" };
      const entries = quote as readonly { readonly amount?: unknown }[];
      const [gas, token, external] = entries.map((entry) => (typeof entry.amount === "bigint" ? entry.amount : null));
      if (gas === null || token === null || external === null) return { ok: false, reason: "unexpected" };
      if (gas !== 0n || external !== 0n) return { ok: false, reason: "fee" };
      return token === amount ? { ok: true } : { ok: false, reason: "unexpected" };
    } catch {
      return { ok: false, reason: "unreadable" };
    }
  }

  // Many conditions inside the request budget. Up to SMALL_BATCH each is read on its own; a larger batch first
  // takes the explorer's ConditionResolution logs in one go (positive proof only) and asks the node about the
  // few that are missing, within a fixed number of calls. A condition that is still unproven stays null.
  async resolvedMany(ids: readonly Hex[]): Promise<Array<boolean | null>> {
    if (ids.length <= SMALL_BATCH) return Promise.all(ids.map((id) => this.resolved(id)));
    const proven = new Set<string>();
    try {
      const read = await this.explorer.getLogs({ address: CONDITIONAL_TOKENS, topic0: CONDITION_RESOLUTION_TOPIC });
      for (const log of read.logs) {
        const topic = log.topics[1];
        if (topic !== undefined && log.address.toLowerCase() === CONDITIONAL_TOKENS.toLowerCase()) proven.add(topic.toLowerCase());
      }
    } catch {
      // fall back to the node for the first few
    }
    const results: Array<boolean | null> = ids.map((id) => (proven.has(id.toLowerCase()) ? true : null));
    const missing = ids.map((id, index) => ({ id, index })).filter((entry) => results[entry.index] === null).slice(0, NODE_LOOKUPS);
    const looked = await Promise.all(missing.map((entry) => this.resolved(entry.id)));
    missing.forEach((entry, i) => {
      results[entry.index] = looked[i] ?? null;
    });
    return results;
  }

  // The UserOperationEvent for a hash (topic1). Absence in the explorer proves nothing by itself.
  async operation(hash: Hex): Promise<OnChainOperation> {
    try {
      const read = await this.explorer.getLogs({ address: ENTRY_POINT_V07, topic0: USER_OPERATION_EVENT_TOPIC, topic1: hash });
      for (const log of read.logs) {
        const event = decodeUserOperationEvent(log);
        if (event === null || log.topics[1]?.toLowerCase() !== hash.toLowerCase()) continue;
        return { state: "found", success: event.success, nonce: event.nonce, sender: event.sender, txHash: log.transactionHash, blockNumber: log.blockNumber };
      }
      return { state: "not_seen", complete: read.complete };
    } catch {
      return { state: "unreadable" };
    }
  }
}

interface DecodedOperationEvent {
  readonly sender: Address;
  readonly nonce: bigint;
  readonly success: boolean;
}

// UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster,
// uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed).
export function decodeUserOperationEvent(log: ChainLog): DecodedOperationEvent | null {
  if (log.topics.length !== 4 || log.topics[0] !== USER_OPERATION_EVENT_TOPIC || log.address.toLowerCase() !== ENTRY_POINT_V07.toLowerCase()) return null;
  const senderTopic = log.topics[2];
  if (senderTopic === undefined || !senderTopic.startsWith("0x000000000000000000000000")) return null;
  try {
    const [nonce, success] = decodeAbiParameters([{ type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }], log.data);
    return { sender: `0x${senderTopic.slice(26)}` as Address, nonce, success };
  } catch {
    return null;
  }
}

// One reader set per upstream client and endpoint pair, so a "requires key" latch survives between requests.
const READERS = new WeakMap<object, Map<string, XoReads>>();

export function endpointsFor(options: UserOpOptions | undefined): XoEndpoints {
  const rpc = options?.xoRpcUrl;
  return { xoRpcUrl: rpc === undefined ? DEFAULT_XO_RPC_URL : rpc, bundlerUrl: options?.bundlerUrl ?? DEFAULT_BUNDLER_URL };
}

export function readsFor(upstream: Upstream, options: UserOpOptions | undefined, now: () => number = Date.now): XoReads {
  const endpoints = endpointsFor(options);
  const key = `${endpoints.xoRpcUrl ?? "-"}|${endpoints.bundlerUrl}`;
  let byKey = READERS.get(upstream);
  if (byKey === undefined) {
    byKey = new Map();
    READERS.set(upstream, byKey);
  }
  let reads = byKey.get(key);
  if (reads === undefined) {
    reads = new XoReads(upstream, endpoints, now);
    byKey.set(key, reads);
  }
  return reads;
}

// ---- the allowance policy (D4) -----------------------------------------------------------------------------------------

export type CapabilityValue = "unknown" | "yes" | "no";

export interface AllowanceInput {
  // allowance_usd from the request, in atomic units; undefined when not given.
  readonly requestedAtomic: bigint | undefined;
  // The account's USDC.e balance (the larger of the node's and the orderbook's reading); null when unread.
  readonly balanceAtomic: bigint | null;
  // T8: a capped allowance has been seen to work with the exchange.
  readonly t8: CapabilityValue;
  readonly mode: "auto" | "capped";
  readonly unlimitedBalanceMaxAtomic: bigint;
  readonly floorAtomic: bigint;
}

export type AllowanceDecision =
  | { readonly kind: "unlimited" }
  | { readonly kind: "capped"; readonly amountAtomic: bigint; readonly why: "requested" | "policy_capped" | "t8_proven" | "balance_above_test_amount" | "balance_unknown" }
  | { readonly kind: "refused"; readonly ceilingAtomic: bigint };

// D4. XO's own flow approves 2^256-1. That exposes the whole balance to a future exchange upgrade, so the
// unlimited shape is used only while the balance is a test amount and the capped shape has not been proven
// (T8). Everything else is a finite approval: the larger of the balance and a floor. An agent-supplied
// amount may be finite and no larger than that ceiling; it can never ask for unlimited.
export function decideAllowance(input: AllowanceInput): AllowanceDecision {
  const balance = input.balanceAtomic ?? 0n;
  const ceiling = balance > input.floorAtomic ? balance : input.floorAtomic;
  if (input.requestedAtomic !== undefined) {
    if (input.requestedAtomic > ceiling) return { kind: "refused", ceilingAtomic: ceiling };
    return { kind: "capped", amountAtomic: input.requestedAtomic, why: "requested" };
  }
  if (input.mode === "capped") return { kind: "capped", amountAtomic: ceiling, why: "policy_capped" };
  if (input.t8 === "yes") return { kind: "capped", amountAtomic: ceiling, why: "t8_proven" };
  if (input.balanceAtomic === null) return { kind: "capped", amountAtomic: ceiling, why: "balance_unknown" };
  if (input.balanceAtomic > input.unlimitedBalanceMaxAtomic) return { kind: "capped", amountAtomic: ceiling, why: "balance_above_test_amount" };
  return { kind: "unlimited" };
}

// ---- what the relay has at hand --------------------------------------------------------------------------------------------

export interface UserOpEnv {
  readonly context: RelayContext;
  readonly now: () => number;
  readonly config: ReturnType<typeof needService<"config">>;
  readonly prepared: ReturnType<typeof needService<"prepared">>;
  readonly ledger: ReturnType<typeof needService<"ledger">>;
  readonly capabilities: ReturnType<typeof needService<"capabilities">>;
  readonly locks: ReturnType<typeof needService<"locks">>;
  readonly state: ReturnType<typeof needService<"state">>;
  readonly upstream: Upstream;
  readonly reads: XoReads;
  readonly options: Required<Pick<UserOpOptions, "allowance" | "unlimitedBalanceMaxAtomic" | "allowanceFloorAtomic" | "ambiguousBlockMs" | "sponsorRefusedHintMs">> & { readonly estimate: boolean };
}

export function useropEnv(context: RelayContext): UserOpEnv {
  const options = context.services.userops;
  const upstream = needService(context, "upstream");
  return {
    context,
    now: context.now,
    config: needService(context, "config"),
    prepared: needService(context, "prepared"),
    ledger: needService(context, "ledger"),
    capabilities: needService(context, "capabilities"),
    locks: needService(context, "locks"),
    state: needService(context, "state"),
    upstream,
    reads: readsFor(upstream, options, context.now),
    options: {
      allowance: options?.allowance ?? USEROP_DEFAULTS.allowance,
      unlimitedBalanceMaxAtomic: options?.unlimitedBalanceMaxAtomic ?? USEROP_DEFAULTS.unlimitedBalanceMaxAtomic,
      allowanceFloorAtomic: options?.allowanceFloorAtomic ?? USEROP_DEFAULTS.allowanceFloorAtomic,
      ambiguousBlockMs: options?.ambiguousBlockMs ?? USEROP_DEFAULTS.ambiguousBlockMs,
      sponsorRefusedHintMs: options?.sponsorRefusedHintMs ?? USEROP_DEFAULTS.sponsorRefusedHintMs,
      estimate: options?.estimate ?? true,
    },
  };
}

// Defence in depth: the server already refuses every write route while the kill switch is on.
export function assertNotKilled(flags: Flags): void {
  if (flags.KILL !== false) throw new RelayError("kill_switch", "The kill switch is on: every write is disabled. Reads still work.");
}

export function parseOwnerOrRefuse(owner: string): Address {
  try {
    return parseOwner(owner);
  } catch (error) {
    if (error instanceof AccountError) throw new RelayError("invalid_request", "The owner is not a usable EOA address (EIP-55, non-zero, not a protocol contract).");
    throw error;
  }
}

export function checkSuppliedAccount(supplied: string | undefined, account: Address): void {
  if (supplied !== undefined && supplied.toLowerCase() !== account.toLowerCase()) {
    throw new RelayError("account_mismatch", "The account does not belong to this owner. The relay derives it from the owner.");
  }
}

// A capability fact written from an observation. A failed write never fails the request.
export async function learn(env: UserOpEnv, id: string, state: "yes" | "no", note: string, value?: string): Promise<void> {
  // A fact already recorded with this state is not written again (every write is journalled and audited).
  if (env.capabilities.state(id) === state && value === undefined) return;
  try {
    await env.capabilities.record({ id, state, source: "probe", note, ...(value === undefined ? {} : { value }) });
  } catch {
    // The registry refuses a probe that would overrule an operator; that is fine.
  }
}

export function usd(atomic: bigint): string {
  return formatAtomic(atomic, USDC_E_DECIMALS);
}

// ---- the stored payload ------------------------------------------------------------------------------------------------------

const payloadSchema = z
  .object({
    v: z.literal(1),
    action: z.enum([...CORE_ACTIONS, ...CREATION_ACTIONS]),
    op: z
      .object({
        sender: z.string(),
        nonce: z.string(),
        initCode: z.string(),
        callData: z.string(),
        accountGasLimits: z.string(),
        preVerificationGas: z.string(),
        gasFees: z.string(),
        paymasterAndData: z.string(),
        signature: z.string(),
      })
      .strict(),
    userOpHash: z.string().regex(/^0x[0-9a-f]{64}$/),
    sponsored: z.boolean(),
    deploys: z.boolean(),
    nonce: z.string().regex(/^[0-9]{1,78}$/),
    extension: z.unknown(),
  })
  .strict();
type Payload = z.infer<typeof payloadSchema>;

function readPayload(record: PreparedRecord): Payload {
  const parsed = payloadSchema.safeParse(record.payload);
  if (!parsed.success) throw new RelayError("internal", "A stored user operation could not be read back. Nothing was sent.");
  return parsed.data;
}

// ---- summaries: every call decoded from the bytes that are hashed ----------------------------------------------------------------
//
// The lines are written by src/xo/signing/lines.ts from the decoded block (R1), the same code the Signature Card
// runs to regenerate them. This module only builds the block and rebuilds it once as a self-check.

// ---- helpers shared by prepare, submit and status ---------------------------------------------------------------------------------

function mergeBigint(a: bigint | null, b: bigint | null): bigint | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

async function dayRemaining(env: UserOpEnv, account: Address): Promise<bigint> {
  try {
    const usage = await env.ledger.usageDetail(account.toLowerCase(), env.ledger.currentDay());
    const max = env.config.limits.maxDailyAtomic;
    return usage.spentAtomic >= max ? 0n : max - usage.spentAtomic;
  } catch {
    return 0n;
  }
}

// Deployment only (the logs and the node's code): what submit needs again just before it sends.
async function deploymentState(env: UserOpEnv, owner: Address): Promise<AccountStateResult> {
  const account = deriveAccount(owner);
  const [logs, code] = await Promise.all([env.reads.deploymentLogs(account), env.reads.code(account)]);
  return deriveAccountState({ owner, suppliedAccount: null, logs, code, registry: { kind: "unavailable" } });
}

export async function accountState(env: UserOpEnv, owner: Address): Promise<{ readonly result: AccountStateResult; readonly balanceMicro: bigint | null; readonly nodeBalance: bigint | null }> {
  const account = deriveAccount(owner);
  const [logs, code, book, nodeBalance] = await Promise.all([env.reads.deploymentLogs(account), env.reads.code(account), env.reads.orderbook(account), env.reads.usdceBalance(account)]);
  const result = deriveAccountState({ owner, suppliedAccount: null, logs, code, registry: book.registry });
  return { result, balanceMicro: book.balanceMicro, nodeBalance };
}

async function sponsorHintActive(env: UserOpEnv, account: Address): Promise<boolean> {
  const stored = env.state.get<{ readonly atMs: number }>(HINTS_NS, `nosponsor:${account.toLowerCase()}`);
  return stored !== undefined && typeof stored.atMs === "number" && env.now() - stored.atMs < env.options.sponsorRefusedHintMs;
}

// Hints and inclusion markers older than a month are forgotten (the prepared items they belong to are pruned
// after a week). Runs at the start of a prepare; one scan of a small namespace.
const HINT_RETENTION_MS = 30 * 86_400_000;

async function pruneHints(env: UserOpEnv): Promise<void> {
  const now = env.now();
  const ops: Array<{ readonly ns: string; readonly key: string; readonly value: null }> = [];
  for (const [key, value] of env.state.list<{ readonly atMs?: number }>(HINTS_NS)) {
    if (typeof value.atMs === "number" && now - value.atMs > HINT_RETENTION_MS) ops.push({ ns: HINTS_NS, key, value: null });
  }
  if (ops.length > 0) await env.state.commit(ops);
}

async function noteSponsorRefused(env: UserOpEnv, account: Address): Promise<void> {
  try {
    await env.state.set(HINTS_NS, `nosponsor:${account.toLowerCase()}`, { atMs: env.now() });
  } catch {
    // A hint only; the next prepare reads the paymaster again anyway.
  }
}

// The paymaster validates every call of a batch, so its verification gas grows with the call count. The
// userop library's one-call default (40,262) fails batches of eight or more (AA33, found against the real
// paymaster code in test/userop-anvil.test.ts); a limit of 30,000 plus 3,000 per call covers every point
// measured there. Fees are zero, so a higher limit costs nothing.
export function paymasterVerificationFor(calls: number): bigint {
  return 30_000n + 3_000n * BigInt(calls);
}

function withPaymasterHeadroom(plan: GasPlan, calls: number, sponsored: boolean): GasPlan {
  if (!sponsored) return plan;
  const wanted = paymasterVerificationFor(calls);
  if (plan.limits.paymasterVerificationGasLimit >= wanted) return plan;
  return { ...plan, limits: Object.freeze({ ...plan.limits, paymasterVerificationGasLimit: wanted }) };
}

// The bundler's host name as configured, for the upstream client's per-host state.
function bundlerHostOf(env: UserOpEnv): string {
  try {
    return new URL(env.reads.endpoints.bundlerUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function userOpErrorToRelay(error: unknown): RelayError {
  if (error instanceof UserOpError) {
    if (error.code === "forbidden_call" || error.code === "sponsorship_refused" || error.code === "invalid_userop" || error.code === "invalid_nonce" || error.code === "sender_mismatch") {
      return new RelayError("precondition_failed", "The operation did not pass the relay's own checks. Nothing was prepared.", { reason: error.code });
    }
    return new RelayError("invalid_request", "A value in the request is not usable. Nothing was prepared.", { reason: error.code });
  }
  return error instanceof RelayError ? error : new RelayError("internal", "The relay failed unexpectedly. Nothing was sent.");
}

// ---- reconcile -----------------------------------------------------------------------------------------------------------------------------

export type ReconcileOutcome =
  | { readonly outcome: "included"; readonly success: boolean; readonly txHash: Hex | null }
  | { readonly outcome: "superseded" }
  | { readonly outcome: "unknown" };

// Settles an operation whose send had an unclear result, or whose inclusion is not yet seen. By the
// userOpHash first (explorer log, then the bundler's receipt), and only then by the nonce: if the account's
// nonce has moved past this operation's and the hash is nowhere, another operation used the slot and this
// one can never land. Never resends anything.
export async function reconcileOperation(env: UserOpEnv, record: PreparedRecord): Promise<ReconcileOutcome> {
  let payload: Payload;
  try {
    payload = readPayload(record);
  } catch {
    return { outcome: "unknown" };
  }
  const hash = payload.userOpHash as Hex;
  const seen = await env.reads.operation(hash);
  if (seen.state === "found") return { outcome: "included", success: seen.success, txHash: seen.txHash };
  // The bundler's receipt, when the host is usable.
  const hostState = env.upstream.hostState(bundlerHostOf(env));
  if (hostState === "ok" || hostState === "degraded") {
    try {
      const transport = jsonRpcTransportFor(env.upstream, "bundler_receipt");
      const receipt = await new BundlerClient({ transport, url: env.reads.endpoints.bundlerUrl }).getUserOperationReceipt(hash);
      if (receipt !== null) return { outcome: "included", success: receipt.success, txHash: receipt.transactionHash };
    } catch {
      // not conclusive
    }
  }
  // "Another operation used this nonce" is concluded only after the explorer has had time to index ours: a
  // lagging index and a moved nonce together would otherwise make a landed operation look superseded.
  const sentAt = record.sendStartedAtMs ?? record.createdAtMs;
  if (seen.state === "not_seen" && seen.complete && env.now() - sentAt >= SUPERSEDE_AFTER_MS) {
    const account = payload.op.sender as Address;
    const current = await env.reads.nonce(account, true);
    if (current.ok && current.nonce > BigInt(payload.nonce)) return { outcome: "superseded" };
  }
  return { outcome: "unknown" };
}

interface IncludedMarker {
  readonly atMs: number;
  readonly success: boolean;
  readonly txHash: string | null;
}

function includedMarker(env: UserOpEnv, preparedId: string): IncludedMarker | undefined {
  const stored = env.state.get<{ readonly atMs: number; readonly success: boolean; readonly txHash: string | null }>(HINTS_NS, `included:${preparedId}`);
  return stored === undefined ? undefined : { atMs: stored.atMs, success: stored.success, txHash: stored.txHash };
}

async function applyReconcile(env: UserOpEnv, record: PreparedRecord, result: ReconcileOutcome, context: RelayContext): Promise<void> {
  if (result.outcome === "included") {
    if (record.state === "ambiguous") await env.prepared.reconcile(record.id, "accepted", "included");
    // An included operation whose execution reverted spent nothing (the nonce is spent, the fee was not charged).
    await settleReservations(env, record, result.success);
    // The hooks run once, for whoever writes the marker first (the store commits one transaction at a time, so two
    // polls at once cannot both see it missing).
    const first = await env.state.transact<boolean>((reader) => {
      const key = `included:${record.id}`;
      if (reader.get(HINTS_NS, key) !== undefined) return { ops: [], result: false };
      return { ops: [{ ns: HINTS_NS, key, value: { atMs: env.now(), success: result.success, txHash: result.txHash } }], result: true };
    });
    if (first) await afterIncluded(env, record, result, context);
  } else if (result.outcome === "superseded" && record.state === "ambiguous") {
    await env.prepared.reconcile(record.id, "rejected", "nonce_superseded");
  }
}

async function settleReservations(env: UserOpEnv, record: PreparedRecord, spent: boolean): Promise<void> {
  if (!spent) return;
  for (const id of record.reservationIds) {
    try {
      await env.ledger.commit(id);
    } catch {
      // Already committed or released; nothing to change.
    }
  }
}

async function afterIncluded(env: UserOpEnv, record: PreparedRecord, seen: { readonly success: boolean; readonly txHash: Hex | null }, context: RelayContext): Promise<void> {
  let payload: Payload;
  try {
    payload = readPayload(record);
  } catch {
    return;
  }
  const owner = record.owner as Address;
  const account = record.account as Address;
  if (payload.sponsored && seen.success) await learn(env, "UO7", "yes", "The paymaster sponsored an operation from a self-derived account and it was included.");
  if (payload.deploys && seen.success) await probeFirstOperation(env, account);
  const extension = isCreationAction(payload.action) ? context.services.useropExtensions?.[payload.action] : undefined;
  if (extension?.afterIncluded !== undefined && isCreationAction(payload.action)) {
    try {
      await extension.afterIncluded({ record, action: payload.action, owner, account, userOpHash: payload.userOpHash as Hex, data: (payload.extension ?? null) as Json | null, context, reads: env.reads, success: seen.success, txHash: seen.txHash });
    } catch {
      // An extension failure must not undo the status the chain already settled.
    }
  }
}

// T1: the deploying operation landed, and its four logs are on the explorer (AccountDeployed with sender =
// account, OwnerRegistered, USDC.e Approval and CTF ApprovalForAll to the exchange). Recorded once, as a
// probe, from observation only.
async function probeFirstOperation(env: UserOpEnv, account: Address): Promise<void> {
  if (env.capabilities.state("T1") === "yes") return;
  try {
    const logs = await readDeploymentLogs(env.reads.explorer, account);
    if (!logs.complete || logs.accountDeployed.length === 0 || logs.ownerRegistered.length === 0) return;
    const [approvals, forAll] = await Promise.all([
      env.reads.explorer.getLogs({ address: USDC_E_ADDRESS, topic0: toEventSelector(getAbiItem({ abi: ERC20_ABI, name: "Approval" })), topic1: padAddressTopic(account), topic2: padAddressTopic(CTF_EXCHANGE) }),
      env.reads.explorer.getLogs({ address: CONDITIONAL_TOKENS, topic0: toEventSelector(getAbiItem({ abi: CONDITIONAL_TOKENS_ABI, name: "ApprovalForAll" })), topic1: padAddressTopic(account), topic2: padAddressTopic(CTF_EXCHANGE) }),
    ]);
    if (approvals.logs.length === 0 || forAll.logs.length === 0) return;
    await learn(env, "T1", "yes", "A deploying operation landed with AccountDeployed, OwnerRegistered, Approval and ApprovalForAll logs.");
    await learn(env, "AD5", "yes", "The bundler accepted a first operation with initCode from a self-derived account.");
  } catch {
    // Observation only; try again at the next status read.
  }
}

async function retryFirstOperationProbe(env: UserOpEnv, record: PreparedRecord): Promise<void> {
  if (env.capabilities.state("T1") === "yes") return;
  try {
    if (readPayload(record).deploys) await probeFirstOperation(env, record.account as Address);
  } catch {
    // Observation only.
  }
}

// ---- prepare -----------------------------------------------------------------------------------------------------------------------------------

type PrepareBody = PostRequestParsed<"/v1/userop/prepare">;

async function readCapability(env: UserOpEnv, id: string): Promise<CapabilityValue> {
  return env.capabilities.state(id);
}

async function prepareHandler(body: PrepareBody, context: RelayContext): Promise<PostResponseInput<"/v1/userop/prepare">> {
  const env = useropEnv(context);
  assertNotKilled(context.flags());
  const owner = parseOwnerOrRefuse(body.owner);
  const account = deriveAccount(owner);
  checkSuppliedAccount(body.account, account);
  const action = body.action;
  if (action === "withdraw") requireFlag(context.flags(), "ENABLE_WITHDRAW");
  if (isCreationAction(action)) requireFlag(context.flags(), "XO_ENABLE_CREATE");
  // Tripwires and the audit log gate every prepare that could lead to a send; the flag itself is not required
  // (dry run), so ask only the registry, not the flag.
  context.services.tripwires?.assertWritable();

  try {
    return await env.locks.run(`userop:${account.toLowerCase()}`, () => prepareLocked(env, body, owner, account));
  } catch (error) {
    throw userOpErrorToRelay(error);
  }
}

async function prepareLocked(env: UserOpEnv, body: PrepareBody, owner: Address, account: Address): Promise<PostResponseInput<"/v1/userop/prepare">> {
  const { context } = env;
  const action = body.action;
  const flags = context.flags();
  const warnings: string[] = [];
  await pruneHints(env).catch(() => undefined);
  const dryRun = !isEnabled(flags, USEROP_FLAG);
  if (dryRun) warnings.push("DRY RUN: ENABLE_USEROP_SUBMIT is off, so this operation cannot be submitted. You can inspect the digest and the decoded calls.");

  // 1. Account state: deployed or not, registered or not.
  const observed = await accountState(env, owner);
  const state = observed.result;
  if (action === "deploy_enable_trading") {
    const gate = gateDeploy(state);
    if (!gate.allowed) {
      throw new RelayError("precondition_failed", gate.code === "already_deployed" ? "The account is already deployed. Use enable_trading." : "The relay could not confirm that the account is undeployed (it needs a complete read of the deployment logs).", {
        reason: gate.code,
      });
    }
  } else {
    const gate = gateExistingAccountUserOp(state);
    if (!gate.allowed) {
      throw new RelayError("precondition_failed", gate.code === "undeployed" ? "The account is not deployed yet. Run deploy_enable_trading first." : "The relay needs positive proof that the account is deployed, and could not get it.", { reason: gate.code });
    }
  }
  const deployed = action !== "deploy_enable_trading";
  if (action === "deploy_enable_trading") {
    warnings.push("After this lands, trading stays blocked until the XO orderbook registers the account (state deployed_unregistered). The relay re-reads the registry afterwards and does not guess.");
  } else if (action === "enable_trading" && state.registered !== "yes") {
    warnings.push("deployed_unregistered: trading stays blocked until the XO orderbook registers this account, whatever this operation does.");
  }

  // 2. An earlier operation that is not settled blocks a new one (one operation in flight per account).
  const blocking = await blockingOperation(env, account);
  if (blocking !== undefined) {
    if (action !== "revoke_trading") {
      throw new RelayError("ambiguous", "An earlier operation for this account has an unknown outcome. It is never sent again; wait until it is settled by its hash or its nonce.", {
        user_op_hash: blocking.digest,
        since: isoSecondOf(blocking.sendStartedAtMs ?? blocking.createdAtMs),
      });
    }
    warnings.push(`An earlier operation (${blocking.digest}) has an unknown outcome and may still land. This revoke uses the same nonce slot, so at most one of them can.`);
  }

  // 3. Nonce.
  const nonce = await env.reads.nonce(account, deployed);
  if (!nonce.ok) {
    throw new RelayError("capability_unknown", "The account's nonce could not be read from the node or from the explorer logs.", { reason: nonce.reason });
  }

  // 4. Calls, per action.
  let calls: readonly Call[];
  let allowance: AllowanceDecision | undefined;
  let title: string | undefined;
  let reservation: ExtensionBuild["reservation"];
  let extensionData: Json | undefined;
  let extraFacts: readonly string[] = [];
  let kind: "userop" | "create" = "userop";
  switch (action) {
    case "deploy_enable_trading":
    case "enable_trading": {
      const requested = body.params.allowance_usd === undefined ? undefined : parseDecimalAtomic(body.params.allowance_usd, USDC_E_DECIMALS);
      if (requested !== undefined && (!requested.ok || requested.value === 0n)) throw new RelayError("invalid_request", "allowance_usd must be a positive decimal amount.");
      allowance = decideAllowance({
        requestedAtomic: requested?.ok === true ? requested.value : undefined,
        balanceAtomic: mergeBigint(observed.nodeBalance, observed.balanceMicro),
        t8: await readCapability(env, "T8"),
        mode: env.options.allowance,
        unlimitedBalanceMaxAtomic: env.options.unlimitedBalanceMaxAtomic,
        floorAtomic: env.options.allowanceFloorAtomic,
      });
      if (allowance.kind === "refused") {
        throw new RelayError("cap_exceeded", `allowance_usd is above the ceiling of ${usd(allowance.ceilingAtomic)} USDC.e (the larger of the balance and the floor).`, { ceiling_usd: usd(allowance.ceilingAtomic) });
      }
      calls = enableTradingCalls(allowance.kind === "capped" ? { allowance: allowance.amountAtomic } : {});
      if (allowance.kind === "unlimited") warnings.push("The allowance is unlimited, as XO's own flow: it exposes the whole balance to a future exchange upgrade. It is used only while the balance is a test amount.");
      else if (allowance.why !== "requested") warnings.push(`The allowance is capped (${allowance.why}). A capped allowance has not been proven with the exchange (T8): an order above the cap would be refused.`);
      extraFacts = ["T8"];
      break;
    }
    case "revoke_trading":
      calls = revokeTradingCalls();
      warnings.push("This is the on-chain revoke, separate from the relay's software kill switch. It is sent without a paymaster.");
      break;
    case "redeem": {
      const ids = [...new Set(body.params.condition_ids.map((id) => id.toLowerCase() as Hex))];
      const verdicts = await env.reads.resolvedMany(ids);
      const unresolved = ids.filter((_, index) => verdicts[index] === false);
      const unproven = ids.filter((_, index) => verdicts[index] === null);
      if (unresolved.length > 0) throw new RelayError("precondition_failed", "At least one condition is not resolved yet, so it cannot be redeemed.", { reason: "condition_unresolved", conditions: unresolved });
      if (unproven.length > 0) throw new RelayError("precondition_failed", "The relay could not prove that every condition is resolved (payoutDenominator or a ConditionResolution log).", { reason: "resolution_unproven", conditions: unproven });
      calls = redeemCalls(ids);
      break;
    }
    case "withdraw": {
      const amount = parseDecimalAtomic(body.params.amount_usd, USDC_E_DECIMALS);
      if (!amount.ok || amount.value === 0n) throw new RelayError("invalid_request", "amount_usd must be a positive decimal amount.");
      const balance = observed.nodeBalance;
      if (balance === null) throw new RelayError("capability_unknown", "The account's USDC.e balance could not be read from the node, so a withdrawal is not prepared.", { reason: "balance_unreadable" });
      if (amount.value > balance) throw new RelayError("precondition_failed", `The account holds ${usd(balance)} USDC.e, less than the ${usd(amount.value)} requested.`, { reason: "insufficient_balance" });
      const quote = await env.reads.withdrawQuote(owner, amount.value);
      if (!quote.ok) {
        throw new RelayError(quote.reason === "unreadable" ? "capability_unknown" : "precondition_failed", quote.reason === "fee" ? "The XO route now asks for a fee, which a user operation cannot pay (it carries value 0)." : "The XO route's quote could not be read as expected, so a withdrawal is not prepared.", { reason: `withdraw_quote_${quote.reason}` });
      }
      calls = withdrawCalls({ owner, amountAtomic: amount.value });
      warnings.push("There is no verified withdrawal path (H1 is a hypothesis, T4). Funds can be stranded; do not fund beyond the test amount.");
      extraFacts = ["FU9", "T4"];
      break;
    }
    case "create_market":
    case "respond_update":
    case "cancel_market": {
      const extension = context.services.useropExtensions?.[action];
      if (extension === undefined) throw new RelayError("not_implemented", "Market creation actions are added by the creation module, which is not wired into this relay build.");
      const built = await extension.build({ action, owner, account, params: body.params as never, now: env.now(), context, reads: env.reads });
      calls = built.calls;
      title = built.title;
      reservation = built.reservation;
      extensionData = built.data;
      extraFacts = built.capabilities ?? [];
      warnings.push(...(built.warnings ?? []));
      kind = "create";
      break;
    }
  }

  // 5. Sponsorship (UO7). The paymaster is used only after paused() and checkPolicy say sponsor.
  let sponsor = false;
  if (action !== "revoke_trading" && action !== "withdraw") {
    const verdict = await env.reads.sponsorship(account, calls);
    const hinted = !deployed ? false : await sponsorHintActive(env, account);
    if (verdict.ok && !hinted) sponsor = true;
    else {
      const reason = hinted && verdict.ok ? "a recent refusal" : verdict.ok ? "ok" : verdict.reason;
      const fallback = sponsorshipFallback({ deploys: !deployed, retried: false });
      if (fallback === "stop") {
        throw new RelayError(
          verdict.ok ? "precondition_failed" : verdict.reason === "unreadable" ? "capability_unknown" : "precondition_failed",
          "The paymaster will not sponsor the deployment (or its state could not be read), and a deployment is never sent without one.",
          { reason: `paymaster_${reason.replaceAll(" ", "_")}` },
        );
      }
      const why = reason === "unreadable" ? "its state could not be read" : reason === "a recent refusal" ? "it refused a recent operation" : reason === "paused" ? "it is paused" : "its policy does not cover these calls";
      warnings.push(`No paymaster is used (${why}). The operation goes out without one at zero fee; whether the bundler accepts that is unproven (UO8).`);
    }
  }

  // 6. Gas, then the operation.
  const redeemCount = action === "redeem" ? calls.length : undefined;
  let plan: GasPlan = withPaymasterHeadroom(defaultGasFor(action, redeemCount === undefined ? {} : { redeems: redeemCount }), calls.length, sponsor);
  const buildOnce = (gas: GasPlan): BuiltUserOp =>
    prepareUserOp({ action, owner, suppliedAccount: null, calls, nonce: nonce.nonce, deployed, sponsor, gas });
  let built = buildOnce(plan);
  if (!dryRun && env.options.estimate) {
    const estimated = await estimateGas(env, built);
    if (estimated !== undefined) {
      plan = withPaymasterHeadroom(applyBundlerEstimate(built.plan, estimated, { allow: true }), calls.length, sponsor);
      built = buildOnce(plan);
    }
  }

  // 7. Reservation (creation fee, seed), last, so a refusal above never leaves one behind.
  const reservationIds: string[] = [];
  let reservedAtomic = 0n;
  if (reservation !== undefined) {
    const reservationId = `res_${randomHex(16)}`;
    const reserved = await env.ledger.reserveFor({
      kind: "spend",
      account: account.toLowerCase(),
      day: env.ledger.currentDay(),
      amountAtomic: reservation.amountAtomic,
      limitAtomic: env.config.limits.maxDailyAtomic,
      category: reservation.category,
      expiresAtMs: env.now() + PREPARED_TTL_S * 1000,
      reservationId,
    });
    if (!reserved.reserved) {
      throw new RelayError("cap_exceeded", `This would exceed a spending cap (${reserved.reason}). ${usd(reserved.remainingAtomic)} USDC.e remains under it.`, { reason: reserved.reason, remaining_usd: usd(reserved.remainingAtomic) });
    }
    reservationIds.push(reservationId);
    reservedAtomic = reservation.amountAtomic;
  }

  // 8. Persist, then answer.
  const payload = {
    v: 1,
    action,
    op: { ...packedToJson(built.op) },
    userOpHash: built.userOpHash,
    sponsored: built.sponsored,
    deploys: built.deploys,
    nonce: built.op.nonce.toString(10),
    extension: extensionData ?? null,
  } satisfies Record<string, Json>;
  const record = await env.prepared.create({
    kind,
    owner,
    account,
    digest: built.userOpHash,
    digestForm: "userOpHash" satisfies DigestForm,
    payload,
    reservationIds,
  });

  const facts = [...BASE_FACTS, ...extraFacts];
  const remaining = await dayRemaining(env, account);
  warnings.push(SAFETY_NOTICES.dedicatedCredential, SAFETY_NOTICES.digestTag);
  // R1: the decoded block, rebuilt once here so a prepare that cannot be rebuilt to the digest it hands out is
  // a bug caught at the relay and not at the card. R2: the tag of the inner call-data hash.
  const decodedBlock = buildDecodedUserOp({ built, kind, action, validUntil: isoSecondOf(record.expiresAtMs), titleSlot: title === undefined || action !== "create_market" ? null : marketTitleSlot(title) });
  const rebuilt = rebuildDecoded(decodedBlock);
  if (!rebuilt.ok || rebuilt.digest.toLowerCase() !== built.userOpHash.toLowerCase()) {
    throw new RelayError("internal", `The relay could not rebuild its own user operation digest from the decoded block (${rebuilt.ok ? "digest" : rebuilt.field}). Nothing was sent.`, { field: rebuilt.ok ? "digest" : rebuilt.field });
  }
  return {
    prepared_id: record.id,
    kind,
    owner,
    account,
    expires_at: isoSecondOf(record.expiresAtMs),
    sign: built.sign,
    summary: { lines: [...rebuilt.lines], digest_tag: built.digestTag, inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "call_data" },
    caps: { reserved_usd: usd(reservedAtomic), day_remaining_usd: usd(remaining) },
    capabilities: env.capabilities.snapshot(facts),
    warnings,
    decoded: decodedBlock,
    user_op_hash: built.userOpHash,
  };
}

// UO5. A failed or unsupported estimate is not an error: the observed defaults stand. "Method not found" is
// recorded as the fact that the bundler does not estimate.
async function estimateGas(env: UserOpEnv, built: BuiltUserOp): Promise<Awaited<ReturnType<BundlerClient["estimateUserOperationGas"]>> | undefined> {
  const state = env.upstream.hostState(bundlerHostOf(env));
  if (state === "requires_key" || state === "blocked" || state === "open_circuit") return undefined;
  try {
    const client = new BundlerClient({ transport: jsonRpcTransportFor(env.upstream, "bundler_estimate"), url: env.reads.endpoints.bundlerUrl });
    const estimate = await client.estimateUserOperationGas(built.op);
    await learn(env, "UO5", "yes", "The bundler answered eth_estimateUserOperationGas.");
    return estimate;
  } catch (error) {
    if (error instanceof BundlerError && error.code === "rpc_error" && error.rpcCode === -32601) {
      await learn(env, "UO5", "no", "The bundler does not support eth_estimateUserOperationGas (method not found).");
    }
    return undefined;
  }
}

async function blockingOperation(env: UserOpEnv, account: Address): Promise<PreparedRecord | undefined> {
  const now = env.now();
  for (const record of env.prepared.list({ account })) {
    if (record.kind !== "userop" && record.kind !== "create") continue;
    if (record.state !== "sending" && record.state !== "ambiguous") continue;
    if (now - (record.sendStartedAtMs ?? record.createdAtMs) >= env.options.ambiguousBlockMs) continue;
    const settled = await reconcileOperation(env, record);
    if (settled.outcome !== "unknown") {
      await applyReconcile(env, record, settled, env.context);
      continue;
    }
    return record;
  }
  return undefined;
}

// ---- submit ----------------------------------------------------------------------------------------------------------------------------------------------

type SubmitBody = PostRequestParsed<"/v1/userop/submit">;
type SubmitResponse = PostResponseInput<"/v1/userop/submit">;

// Failure kinds after which the request provably never left: nothing was posted, so a rejected state is
// honest. Every other kind (timeout, network, too_large, aborted) may have reached the bundler.
const NEVER_SENT: ReadonlySet<UpstreamError["kind"]> = new Set(["invalid_request", "host_not_allowed", "scheme", "method_not_allowed", "circuit_open", "requires_key", "cloudflare", "rate_limited", "redirect_blocked"]);

function aaCodeOf(error: BundlerError): string | undefined {
  return error.aaCode !== undefined && /^AA[0-9]{2}$/.test(error.aaCode) ? error.aaCode : undefined;
}

async function submitHandler(body: SubmitBody, context: RelayContext): Promise<SubmitResponse> {
  const env = useropEnv(context);
  assertNotKilled(context.flags());
  const peek = env.prepared.require(body.prepared_id);
  if (peek.kind !== "userop" && peek.kind !== "create") throw new RelayError("invalid_request", "That prepared item is not a user operation.");
  // Flags, kill switch and tripwires (re-checked now, not only at prepare). Order matters: with the flag off
  // nothing else runs.
  await guardSubmit(context, USEROP_FLAG);
  const preliminary = readPayload(peek);
  if (preliminary.action === "withdraw") requireFlag(context.flags(), "ENABLE_WITHDRAW");
  if (isCreationAction(preliminary.action)) requireFlag(context.flags(), "XO_ENABLE_CREATE");
  const account = peek.account as Address;
  try {
    return await env.locks.run(`userop:${account.toLowerCase()}`, () => submitLocked(env, body));
  } catch (error) {
    throw userOpErrorToRelay(error);
  }
}

async function submitLocked(env: UserOpEnv, body: SubmitBody): Promise<SubmitResponse> {
  const { context } = env;
  const record = env.prepared.require(body.prepared_id);
  if (record.state === "expired") throw new RelayError("expired", "This prepared item expired. Prepare it again.");
  if (record.state !== "prepared") throw new RelayError("prepared_used", "This prepared item was already used.", { state: record.state });
  if (env.now() >= record.expiresAtMs) throw new RelayError("expired", "This prepared item expired. Prepare it again.");
  const payload = readPayload(record);
  const owner = record.owner as Address;
  const account = record.account as Address;

  // 1. The stored operation, its hash and its shape. Nothing the caller sent is used except the signature.
  let op;
  try {
    op = packedFromJson(payload.op as PackedUserOpJson);
    if (userOpHash(op).toLowerCase() !== record.digest.toLowerCase() || record.digest.toLowerCase() !== payload.userOpHash.toLowerCase()) {
      throw new RelayError("internal", "The stored operation no longer matches its digest. Nothing was sent.");
    }
    assertOperationShape(op, { action: payload.action, owner });
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError("internal", "The stored operation failed the relay's own checks. Nothing was sent.");
  }

  // 2. The signature: recovered under the raw and the EIP-191 digest, required to be the owner.
  const verified = await verifyUserOpSignature({ op, signature: body.signature, expectedOwner: owner });
  if (!verified.ok) {
    await env.prepared.noteFailedAttempt(record.id);
    if (verified.code === "owner_mismatch") throw new RelayError("owner_mismatch", "The signature does not recover to the owner of this account.");
    if (verified.code === "signature_invalid") throw new RelayError("signature_invalid", "The signature is malformed.");
    throw new RelayError("internal", "The operation could not be verified. Nothing was sent.");
  }

  // 3. Account state and nonce, read again. Anything unreadable refuses (the item is not consumed).
  const deployment = await deploymentState(env, owner);
  if (payload.deploys) {
    const gate = gateDeploy(deployment);
    if (!gate.allowed) {
      throw gate.code === "already_deployed"
        ? new RelayError("stale_nonce", "The account was deployed since this was prepared. Prepare again.", { reason: gate.code })
        : new RelayError("precondition_failed", "The relay could not confirm that the account is still undeployed.", { reason: gate.code });
    }
  } else {
    const gate = gateExistingAccountUserOp(deployment);
    if (!gate.allowed) throw new RelayError("precondition_failed", "The relay could not confirm that the account is deployed.", { reason: gate.code });
  }
  const nonce = await env.reads.nonce(account, !payload.deploys);
  if (!nonce.ok) throw new RelayError("capability_unknown", "The account's nonce could not be re-read, so nothing is sent.", { reason: nonce.reason });
  if (nonce.nonce !== BigInt(payload.nonce)) {
    throw new RelayError("stale_nonce", "The account's nonce moved since this was prepared. Prepare again.", { expected: payload.nonce, current: nonce.nonce.toString() });
  }
  if (payload.sponsored) {
    const calls = decodeExecute(op.callData).calls;
    const verdict = await env.reads.sponsorship(account, calls);
    if (!verdict.ok) {
      await noteSponsorRefused(env, account);
      throw new RelayError(verdict.reason === "unreadable" ? "capability_unknown" : "precondition_failed", "The paymaster will not sponsor this operation now. Prepare again.", { reason: `paymaster_${verdict.reason}` });
    }
  }
  // A host that already asked for a key (or is blocked) is not asked again, and the item stays unused.
  const bundlerHost = bundlerHostOf(env);
  const hostState = env.upstream.hostState(bundlerHost);
  if (hostState === "requires_key") throw toRelayError(new UpstreamError("requires_key", bundlerHost));
  if (hostState === "blocked" || hostState === "open_circuit") throw toRelayError(new UpstreamError(hostState === "blocked" ? "cloudflare" : "circuit_open", bundlerHost));
  // The bundler must answer a cheap read on chain 3223 before an item is spent on it. An unreachable bundler
  // then refuses cleanly (the item stays unused) instead of leaving a send of unknown outcome behind.
  await checkBundlerAlive(env, bundlerHost);

  // 3b. An action that hosts something the owner approved by hash (a creation's metadata file) checks it is still
  //     that file. A refusal here leaves the item unspent.
  if (isCreationAction(payload.action)) {
    const hooks = context.services.useropExtensions?.[payload.action];
    if (hooks?.beforeSend !== undefined) {
      await hooks.beforeSend({ record, action: payload.action, owner: record.owner as Address, account: record.account as Address, userOpHash: payload.userOpHash as Hex, data: (payload.extension ?? null) as Json | null, context, reads: env.reads });
    }
  }

  // 4. The marker, on disk before any request leaves. From here on this item is spent.
  await env.prepared.beginSend(record.id);

  // 5. One send. The caller's request signal is NOT used: an aborted POST would turn a send into a mystery.
  const transport = jsonRpcTransportFor(env.upstream, "bundler_send");
  const client = new BundlerClient({ transport, url: env.reads.endpoints.bundlerUrl, writeGuard: () => requireFlag(context.flags(), USEROP_FLAG) });
  const hash = payload.userOpHash as Hex;
  try {
    // The client compares the bundler's hash with the one computed here and throws on a difference.
    await client.sendUserOperation(verified.signedOp);
  } catch (error) {
    return await handleSendFailure(env, record, payload, error, transport.lastFailure());
  }
  // The bundler has it. If recording that fails the item stays `sending`, becomes ambiguous at the next start
  // and is never sent again; nothing below can undo the send.
  await env.prepared.resolve(record.id, "accepted", "bundler_accepted");
  await learnFromAcceptance(env, payload);
  await afterAccepted(env, record, payload, context);
  // Money reserved for this operation (a creation fee) stays reserved, and counted, until the operation is seen
  // included: it is spent only if the execution did not revert (applyReconcile).
  return { state: "submitted", user_op_hash: hash, detail: "The bundler accepted the operation. Poll the status route for inclusion." };
}

async function checkBundlerAlive(env: UserOpEnv, host: string): Promise<void> {
  const transport = jsonRpcTransportFor(env.upstream, "bundler_alive");
  try {
    await new BundlerClient({ transport, url: env.reads.endpoints.bundlerUrl }).chainId();
  } catch (error) {
    if (error instanceof BundlerError && error.code === "requires_key") throw toRelayError(new UpstreamError("requires_key", host));
    const failure = transport.lastFailure();
    if (failure !== undefined) throw toRelayError(new UpstreamError(failure.kind, host));
    throw new RelayError("upstream_rejected", "The bundler did not answer a chain id read, so nothing was sent and the item is still unused.", { host, kind: error instanceof BundlerError ? error.code : "unknown" });
  }
}

async function afterAccepted(env: UserOpEnv, record: PreparedRecord, payload: Payload, context: RelayContext): Promise<void> {
  if (!isCreationAction(payload.action)) return;
  const extension = context.services.useropExtensions?.[payload.action];
  if (extension?.afterAccepted === undefined) return;
  try {
    await extension.afterAccepted({ record, action: payload.action, owner: record.owner as Address, account: record.account as Address, userOpHash: payload.userOpHash as Hex, data: (payload.extension ?? null) as Json | null, context, reads: env.reads });
  } catch {
    // The operation is sent; an extension hook failing does not change that.
  }
}

async function learnFromAcceptance(env: UserOpEnv, payload: Payload): Promise<void> {
  await learn(env, "UO6", "yes", "The bundler accepted the v0.7 unpacked user operation.");
  if (!payload.sponsored) await learn(env, "UO8", "yes", "The bundler accepted a zero-fee operation without a paymaster.");
  if (payload.deploys) await learn(env, "AD5", "yes", "The bundler accepted a first operation with initCode from a self-derived account.");
}

async function handleSendFailure(env: UserOpEnv, record: PreparedRecord, payload: Payload, error: unknown, failure: UpstreamFailure | undefined): Promise<SubmitResponse> {
  const hash = payload.userOpHash as Hex;
  if (error instanceof RelayError) {
    await env.prepared.resolve(record.id, "rejected", "not_sent").catch(() => undefined);
    throw error;
  }
  if (!(error instanceof BundlerError)) {
    // Not a bundler error: something broke around the send. Treat the outcome as unknown.
    await env.prepared.resolve(record.id, "ambiguous", "send_failed").catch(() => undefined);
    return await ambiguousOutcome(env, record, hash);
  }
  // Refused by the relay's own guard (the flag was switched off between the check and the send).
  if (error.code === "invalid_input") {
    await env.prepared.resolve(record.id, "rejected", "not_sent").catch(() => undefined);
    throw new RelayError("internal", "The send was refused before it left the relay. Nothing was sent.");
  }
  if (error.code === "requires_key") {
    await env.prepared.resolve(record.id, "rejected", "requires_key");
    throw toRelayError(new UpstreamError("requires_key", bundlerHostOf(env)));
  }
  if (error.code === "rate_limited") {
    await env.prepared.resolve(record.id, "rejected", "rate_limited");
    return { state: "rejected", user_op_hash: hash, detail: "The bundler is rate limiting the relay. Nothing was included; prepare again later." };
  }
  if (error.code === "rpc_error") {
    await env.prepared.resolve(record.id, "rejected", "bundler_rejected");
    await learnFromRejection(env, payload, error);
    const aa = aaCodeOf(error);
    if (payload.sponsored && aa !== undefined && /^AA3[0-9]$/.test(aa)) await noteSponsorRefused(env, record.account as Address);
    const where = `${aa === undefined ? "" : ` ${aa}`}${error.rpcCode === undefined ? "" : ` (rpc code ${error.rpcCode})`}`;
    const next = payload.sponsored && aa !== undefined && /^AA3[0-9]$/.test(aa) ? (payload.deploys ? " A deployment is never sent without a paymaster." : " Prepare again: an existing account is then sent without a paymaster.") : "";
    return { state: "rejected", user_op_hash: hash, detail: `The bundler refused the operation${where}. Nothing was included.${next}` };
  }
  if (error.code === "transport_error" && failure !== undefined && NEVER_SENT.has(failure.kind)) {
    await env.prepared.resolve(record.id, "rejected", "not_sent");
    return { state: "rejected", user_op_hash: hash, detail: "The request did not leave the relay. Nothing was sent." };
  }
  if (error.code === "http_error" && !error.maybeSubmitted) {
    await env.prepared.resolve(record.id, "rejected", "bundler_http_error");
    return { state: "rejected", user_op_hash: hash, detail: `The bundler answered HTTP ${error.httpStatus ?? 0}. Nothing was included.` };
  }
  // Timeout, dropped connection, 5xx, an answer that does not parse, a hash that differs: the operation may
  // have arrived. It is never sent again.
  await env.prepared.resolve(record.id, "ambiguous", "outcome_unknown");
  return await ambiguousOutcome(env, record, hash);
}

// One attempt to settle an ambiguous send right away. The status route keeps trying later.
async function ambiguousOutcome(env: UserOpEnv, record: PreparedRecord, hash: Hex): Promise<SubmitResponse> {
  const current = env.prepared.require(record.id);
  const settled = await reconcileOperation(env, current);
  if (settled.outcome === "included") {
    await applyReconcile(env, current, settled, env.context);
    return { state: "submitted", user_op_hash: hash, ...(settled.txHash === null ? {} : { tx_hash: settled.txHash }), detail: "The send was unclear; the operation was then found on chain." };
  }
  if (settled.outcome === "superseded") {
    await applyReconcile(env, current, settled, env.context);
    return { state: "rejected", user_op_hash: hash, detail: "The send was unclear; the account's nonce has since been used by another operation, so this one can never land." };
  }
  return { state: "ambiguous", user_op_hash: hash, detail: "The outcome is unknown. It will not be sent again; poll the status route." };
}

async function learnFromRejection(env: UserOpEnv, payload: Payload, error: BundlerError): Promise<void> {
  const aa = aaCodeOf(error);
  const note = error.upstreamText ?? "The bundler refused the operation.";
  if (aa !== undefined && /^AA3[0-9]$/.test(aa)) {
    await learn(env, "UO7", "no", note);
    return;
  }
  if (error.rpcCode === -32602) {
    await learn(env, "UO6", "no", note);
    return;
  }
  if (aa !== undefined) return;
  // The exit hypothesis (H1) is the withdrawal itself: a refusal of it says nothing about other paymaster-less operations.
  if (payload.action === "withdraw") await learn(env, "FU9", "no", note);
  else if (payload.deploys) await learn(env, "AD5", "no", note);
  else if (!payload.sponsored) await learn(env, "UO8", "no", note);
}

// ---- status ------------------------------------------------------------------------------------------------------------------------------------------------------

type StatusResponse = ReturnType<typeof statusBody>;

function statusBody(hash: Hex, state: "unknown" | "submitted" | "included" | "failed" | "rejected" | "ambiguous", extra: { txHash?: Hex | null; detail?: string } = {}) {
  return {
    user_op_hash: hash,
    state,
    ...(extra.txHash === undefined || extra.txHash === null ? {} : { tx_hash: extra.txHash }),
    ...(extra.detail === undefined ? {} : { detail: extra.detail.slice(0, 300) }),
  };
}

async function statusHandler(params: { readonly hash: string }, context: RelayContext): Promise<StatusResponse> {
  const env = useropEnv(context);
  const hash = params.hash.toLowerCase() as Hex;
  const record = env.prepared.list().find((entry) => (entry.kind === "userop" || entry.kind === "create") && entry.digest.toLowerCase() === hash);

  if (record === undefined) {
    // Not ours: the chain may still know it.
    const seen = await env.reads.operation(hash);
    if (seen.state === "found") return statusBody(hash, seen.success ? "included" : "failed", { txHash: seen.txHash, detail: "Seen on chain; this relay did not prepare it." });
    return statusBody(hash, "unknown", { detail: "This relay has no record of that operation." });
  }
  if (record.state === "prepared") return statusBody(hash, "unknown", { detail: "Prepared, not submitted yet." });
  if (record.state === "expired") return statusBody(hash, "unknown", { detail: "Expired before it was submitted." });
  if (record.state === "rejected") return statusBody(hash, "rejected", { detail: `Rejected (${record.detail ?? "refused"}). Nothing was included.` });

  // Seen included before: no need to ask the chain again.
  const marker = includedMarker(env, record.id);
  if (marker !== undefined) {
    // The first look at the explorer can come before it has indexed the deployment's logs; T1 is tried again on later
    // polls until it is recorded.
    if (marker.success) await retryFirstOperationProbe(env, record);
    const note = await registrationNoteFor(env, record, marker.success);
    return statusBody(hash, marker.success ? "included" : "failed", {
      txHash: marker.txHash as Hex | null,
      detail: marker.success ? note ?? "Included on chain." : "Included, but the execution reverted: nothing it asked for happened and the nonce is spent.",
    });
  }
  // sending, accepted, ambiguous: ask the chain.
  const settled = await reconcileOperation(env, record);
  if (settled.outcome === "included") {
    await applyReconcile(env, record, settled, context);
    const registrationNote = await registrationNoteFor(env, record, settled.success);
    return statusBody(hash, settled.success ? "included" : "failed", {
      txHash: settled.txHash,
      detail: settled.success ? registrationNote ?? "Included on chain." : "Included, but the execution reverted: nothing it asked for happened and the nonce is spent.",
    });
  }
  if (settled.outcome === "superseded") {
    await applyReconcile(env, record, settled, context);
    return statusBody(hash, "rejected", { detail: "Another operation used this nonce; this one can never land." });
  }
  if (record.state === "ambiguous") return statusBody(hash, "ambiguous", { detail: "The outcome is unknown and it will not be sent again." });
  if (record.state === "sending") return statusBody(hash, "submitted", { detail: "The send is in progress." });
  return statusBody(hash, "submitted", { detail: "The bundler accepted it; not seen on chain yet." });
}

// N2: after a deployment the relay reads the registry once and says why trading is (not) available.
async function registrationNoteFor(env: UserOpEnv, record: PreparedRecord, success: boolean): Promise<string | undefined> {
  if (!success) return undefined;
  let payload: Payload;
  try {
    payload = readPayload(record);
  } catch {
    return undefined;
  }
  if (!payload.deploys) return undefined;
  const book = await env.reads.orderbook(record.account as Address);
  if (book.registry.kind !== "read") return "Included. The orderbook registry could not be read, so trading stays blocked until it can confirm the account.";
  if (book.registry.smartAccount === null) {
    return "Included. deployed_unregistered: the XO orderbook does not know this account yet, so trading stays blocked until it registers it.";
  }
  await learn(env, "AD4", "yes", "The orderbook registered the account after the deployment.");
  return "Included, and the XO orderbook knows the account.";
}

// ---- the account directory for POST /v1/account/status -------------------------------------------------------------------------------------

export interface AccountDirectoryOptions {
  // The relay's upstream client. A function, because the directory is handed to createRelay before the upstream
  // client exists: pass () => relay.services.upstream and it is looked up on every read.
  readonly upstream: () => Upstream | undefined;
  readonly options?: UserOpOptions;
  readonly now?: () => number;
}

// What health.ts needs for the status route, from the same readers the handlers above use: the deployment
// state (logs, and the node's code when open), the registry, whether trading is enabled (allowance and operator
// approval, exact from the node, from the logs only when unlimited) and the credited balance.
export function createAccountDirectory(options: AccountDirectoryOptions): AccountDirectory {
  const readers = (): XoReads => {
    const upstream = options.upstream();
    if (upstream === undefined) throw new RelayError("internal", "The relay's upstream client is not available.");
    return readsFor(upstream, options.options, options.now);
  };
  return {
    derive(owner) {
      try {
        return deriveAccount(parseOwner(owner));
      } catch (error) {
        if (error instanceof AccountError) throw new RelayError("invalid_request", "The owner is not a usable EOA address.");
        throw error;
      }
    },
    async read(owner, account) {
      const reads = readers();
      const typedAccount = deriveAccount(parseOwner(owner));
      if (typedAccount.toLowerCase() !== account.toLowerCase()) throw new RelayError("account_mismatch", "The account does not belong to this owner.");
      const [logs, code, book, trading] = await Promise.all([
        reads.deploymentLogs(typedAccount),
        reads.code(typedAccount),
        reads.orderbook(typedAccount),
        readTradingEnabled({ explorer: reads.explorer, ...(reads.rpc() === undefined ? {} : { rpc: reads.rpc() as RpcReader }) }, typedAccount).catch(() => undefined),
      ]);
      const result = deriveAccountState({ owner: parseOwner(owner), suppliedAccount: null, logs, code, registry: book.registry });
      if (result.deployed === "unknown") {
        throw new RelayError("precondition_failed", "Whether the account is deployed could not be confirmed (the logs were unreadable or incomplete).", { reason: "deployment_unproven" });
      }
      const state = result.deployed === "no" ? "undeployed" : result.registered === "yes" ? "registered" : "deployed_unregistered";
      return {
        state,
        registered: result.registered === "yes",
        trading_enabled: trading === undefined || trading.state === "unknown" ? "unknown" : trading.state === "enabled" ? "yes" : "no",
        balance_usd: book.balanceMicro === null ? null : usd(book.balanceMicro),
      };
    },
  };
}

// ---- the absence check for reservations held by operations ---------------------------------------------------------------------------------------------------

// Feed this to ledger.sweep(). A reservation held for an operation is given back only when the operation is
// provably gone: it was never sent (rejected or expired unused) or it was sent and neither its hash nor its
// nonce slot shows it. Anything accepted, in flight or unclear stays reserved.
export async function confirmOperationAbsent(context: RelayContext, reservation: ReservationView): Promise<AbsenceVerdict> {
  const env = useropEnv(context);
  const record = env.prepared.list({ account: reservation.account }).find((entry) => entry.reservationIds.includes(reservation.id));
  if (record === undefined || (record.kind !== "userop" && record.kind !== "create")) return { verdict: "unknown" };
  if (record.state === "accepted" || record.state === "sending") {
    // Seen included with a reverted execution: nothing was charged, the reservation can go back.
    if (includedMarker(env, record.id)?.success === false) return { verdict: "absent", source: "bundler_receipt" };
    return { verdict: "present" };
  }
  if (record.state === "ambiguous") {
    const settled = await reconcileOperation(env, record);
    if (settled.outcome === "included") return { verdict: "present" };
    if (settled.outcome === "superseded") return { verdict: "absent", source: "bundler_receipt" };
    return { verdict: "unknown" };
  }
  // prepared (never sent), rejected or expired: check the chain once for the hash.
  const seen = await env.reads.operation(record.digest);
  if (seen.state === "found") return { verdict: "present" };
  if (seen.state === "unreadable" || !seen.complete) return { verdict: "unknown" };
  return { verdict: "absent", source: "bundler_receipt" };
}

export const routes: RouteTable = {
  "POST /v1/userop/prepare": prepareHandler,
  "POST /v1/userop/submit": submitHandler,
  "GET /v1/userop/:hash": statusHandler,
};
