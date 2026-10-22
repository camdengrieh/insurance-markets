// The funding preflight: eight checks that must all pass before a Base proposal is handed out
// (docs/phase1-gap-closing.md FU1 to FU4, A6, A11; docs/research/20 sec 12). Each check is a pure
// function over what was read, so each can be flipped on its own in a test and refuses with a stable
// code. Unknown fails closed: a property that could not be read is a failure, never a pass.
//
//   1  router_pairing              the RPC is Base, and token(), routers(3223), Mailbox, ISM, hooks, domain
//                                  and implementation slot read back as pinned (a wrong chain or a wrong
//                                  router is refused), and the calls go to the pinned token and router
//   2  msg_value_zero              every proposal carries value "0" (a non-zero msg.value reverts)
//   3  quote_zero_fee              quoteTransferRemote is [(0x0, 0), (USDC, amount), (USDC, 0)]
//   4  destination_domain          transferRemote targets domain 3223, and every proposal is on eip155:8453
//   5  recipient_deployed          POSITIVE proof that the recipient Kernel account is deployed (A11):
//                                  an undeployed account's USDC.e can only move by a UserOp (AD7)
//   6  recipient_not_eoa_not_zero  the recipient is the account derived from the owner: not zero, not the
//                                  owner EOA, not a protocol contract, left-padded
//   7  allowance                   readable; for the transfer step, at least the amount
//   8  balances                    the owner's Circle USDC on Base covers the amount
//
// This file also holds the Base reader (read-only JSON-RPC over an injected transport), the funding amount
// policy of amendment A6, and the one-time reads that feed the checks. No Node-only import.

import { decodeFunctionResult, encodeFunctionData, zeroAddress } from "viem";

import type { AccountStateResult, Tri } from "../account/state.js";
import { ERC20_ABI } from "../chain/abi.js";
import {
  BASE_CHAIN_ID,
  BASE_ROUTER_IMPLEMENTATION,
  BASE_USDC,
  BASE_WARP_ROUTER,
  FUNDING_VALUE_WEI,
  HYPERLANE_DOMAIN_XO,
  HYPERLANE_HOOK,
  HYPERLANE_ISM,
  HYPERLANE_MAILBOX,
  XO_CHAIN_ID,
  XO_ROUTE_IMPLEMENTATION,
  XO_WARP_ROUTE,
  USDC_E_ADDRESS,
  type Address,
  type Hex,
} from "../chain/constants.js";
import {
  ChainReadError,
  RPC_ALLOWED_METHODS,
  RpcReader,
  chainReadErrorOf,
  padAddressTopic,
  readRoutePairing,
  type RoutePairingReading,
  type RouteSideReading,
  type RpcTransport,
} from "../chain/reads.js";
import { createRpcPort, isRpcError, type RpcPort } from "../../../sdk/chain/rpc.js";
import {
  FUNDING_CHAIN,
  FundingCalldataError,
  decodeFundingData,
  requireFundingRecipient,
  type FundingCall,
} from "./calldata.js";
import type { FundingStep } from "./steps.js";

// ---- amount policy (amendment A6, decision D3) --------------------------------------------------------

// The recorded test amount: the most the first live deposit (T3a) moves, $2 to $3 (amendment A10). Any
// funding above it is refused until the deposit leg has been SEEN to deliver (FU7) and to credit (FU6).
export const FUNDING_TEST_AMOUNT_ATOMIC = 3_000_000n;
// The separate daily funding cap that applies once the exit is proven (D3). No single funding is above it.
export const FUNDING_CEILING_ATOMIC = 50_000_000n;
// Capability facts (docs/phase1-gap-closing.md section 3.4): FU7 "third-party use of the raw route works"
// (delivery), FU6 "the orderbook credits USDC.e minted straight to the account" (credit).
export const FUNDING_DELIVERY_FACT = "FU7";
export const FUNDING_CREDIT_FACT = "FU6";

export type FactState = "unknown" | "yes" | "no";

export type AmountPolicyCode = "ok" | "invalid_amount" | "above_ceiling" | "above_test_amount";

export interface AmountPolicyResult {
  readonly ok: boolean;
  readonly code: AmountPolicyCode;
  readonly detail: string;
}

export interface AmountPolicyInput {
  readonly amount: bigint;
  readonly delivery: FactState;
  readonly credit: FactState;
  // Defaults to FUNDING_TEST_AMOUNT_ATOMIC. A caller can only lower it below the default.
  readonly testAmount?: bigint;
  readonly ceiling?: bigint;
}

export function checkFundingAmount(input: AmountPolicyInput): AmountPolicyResult {
  const ceiling = input.ceiling ?? FUNDING_CEILING_ATOMIC;
  const testAmount = input.testAmount ?? FUNDING_TEST_AMOUNT_ATOMIC;
  if (typeof input.amount !== "bigint" || input.amount <= 0n) return { ok: false, code: "invalid_amount", detail: "The amount must be positive." };
  if (input.amount > ceiling) return { ok: false, code: "above_ceiling", detail: "The amount is above the daily funding ceiling." };
  if (input.amount > testAmount && !(input.delivery === "yes" && input.credit === "yes")) {
    return {
      ok: false,
      code: "above_test_amount",
      detail:
        "The amount is above the recorded test amount. Larger fundings stay refused until the test deposit has been seen to arrive (delivery) and to be credited by the XO orderbook, and there is no verified way to take money back out.",
    };
  }
  return { ok: true, code: "ok", detail: "The amount is within the funding limits." };
}

// ---- the Base reader ------------------------------------------------------------------------------------

// The public keyless Base RPC that answered every eth_call in the research (note 20 sec 9, 1). It rejects
// eth_getLogs, which nothing here uses. Overridable with XO_BASE_RPC_URL (https only).
export const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";

export interface BaseReceiptLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export interface BaseReceipt {
  readonly transactionHash: Hex;
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  readonly from: Address | null;
  readonly to: Address | null;
  readonly logs: readonly BaseReceiptLog[];
}

export interface BaseRpcOptions {
  readonly transport: RpcTransport;
  // https only; no credentials, query or fragment (a key in the URL is how paid RPCs work, and this
  // reader never carries one).
  readonly url: string;
}

const EXTRA_METHODS = ["eth_chainId", "eth_getTransactionReceipt", "eth_getBlockByNumber"] as const;
type ExtraMethod = (typeof EXTRA_METHODS)[number];
const HEX_QUANTITY = /^0x[0-9a-fA-F]{1,16}$/;
const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quantity(value: unknown): bigint | null {
  return typeof value === "string" && HEX_QUANTITY.test(value) ? BigInt(value) : null;
}

function addressOrNull(value: unknown): Address | null {
  return typeof value === "string" && ADDRESS_HEX.test(value) ? (value.toLowerCase() as Address) : null;
}

function parseReceipt(raw: unknown, expectedHash: string): BaseReceipt {
  const bad = (): never => {
    throw new ChainReadError("invalid_response", "the receipt is malformed");
  };
  if (!isRecord(raw)) return bad();
  const hash = raw["transactionHash"];
  if (typeof hash !== "string" || !HEX_32.test(hash) || hash.toLowerCase() !== expectedHash.toLowerCase()) return bad();
  const status = quantity(raw["status"]);
  const blockNumber = quantity(raw["blockNumber"]);
  if (status === null || (status !== 0n && status !== 1n) || blockNumber === null) return bad();
  const rawLogs = raw["logs"];
  if (!Array.isArray(rawLogs) || rawLogs.length > 500) return bad();
  const logs: BaseReceiptLog[] = [];
  for (const entry of rawLogs as unknown[]) {
    if (!isRecord(entry)) return bad();
    const address = addressOrNull(entry["address"]);
    const topics = entry["topics"];
    const data = entry["data"];
    if (address === null || !Array.isArray(topics) || topics.length > 4 || typeof data !== "string" || !HEX_BYTES.test(data)) return bad();
    const cleaned: Hex[] = [];
    for (const topic of topics as unknown[]) {
      if (typeof topic !== "string" || !HEX_32.test(topic)) return bad();
      cleaned.push(topic.toLowerCase() as Hex);
    }
    logs.push({ address, topics: cleaned, data: data.toLowerCase() as Hex });
  }
  return {
    transactionHash: hash.toLowerCase() as Hex,
    status: status === 1n ? "success" : "reverted",
    blockNumber,
    from: addressOrNull(raw["from"]),
    to: addressOrNull(raw["to"]),
    logs,
  };
}

// Read-only access to Base, over one JSON-RPC port (sdk/chain/rpc.ts). eth_call and eth_getStorageAt go through the
// shared RpcReader (so the pairing read is the one the tripwires use); the three extra methods below are the only
// others, each on an allowlist. The reader and these methods share the port, so a 401 or 403 seen by either sets one
// latch and later calls fail fast: this code never looks for a key.
export class BaseRpc {
  readonly reader: RpcReader;
  private readonly port: RpcPort;

  constructor(options: BaseRpcOptions) {
    let parsed: URL;
    try {
      parsed = new URL(options.url);
    } catch {
      throw new ChainReadError("invalid_input", "the Base RPC URL could not be parsed");
    }
    if (parsed.protocol !== "https:") throw new ChainReadError("invalid_input", "the Base RPC URL must be https");
    try {
      this.port = createRpcPort({
        url: options.url,
        post: (url, body) => options.transport.postJson(url, body),
        methods: [...RPC_ALLOWED_METHODS, ...EXTRA_METHODS],
        batch: "never",
        maxLogBlockRange: null,
        allowLatestLogs: true,
        requireLogAddress: false,
      });
    } catch (error) {
      throw new ChainReadError("invalid_input", "the Base RPC URL must carry no credentials and no query string", { cause: error });
    }
    this.reader = new RpcReader({ transport: options.transport, url: options.url, port: this.port });
  }

  get requiresKey(): boolean {
    return this.port.requiresKey;
  }

  private async rpc(method: ExtraMethod, params: readonly unknown[]): Promise<unknown> {
    if (!(EXTRA_METHODS as readonly string[]).includes(method)) throw new ChainReadError("unsupported_method", "RPC method is not on the read-only allowlist");
    if (this.requiresKey) throw new ChainReadError("requires_key", "the RPC host requires a key; not retrying");
    try {
      return await this.port.request(method, params);
    } catch (error) {
      if (isRpcError(error) && error.code === "unreachable") {
        const name = isRecord(error.cause) ? error.cause["name"] : undefined;
        throw new ChainReadError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "upstream_error", "the Base RPC request failed", { cause: error.cause });
      }
      // None of these three methods runs contract code, so an error object is an upstream error whatever it says.
      if (isRpcError(error) && error.code === "reverted") throw new ChainReadError("upstream_error", "RPC returned an error");
      throw chainReadErrorOf(error);
    }
  }

  async chainId(): Promise<number> {
    const value = quantity(await this.rpc("eth_chainId", []));
    if (value === null || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ChainReadError("invalid_response", "eth_chainId did not return a quantity");
    return Number(value);
  }

  private async readUint(token: Address, data: Hex, functionName: "allowance" | "balanceOf"): Promise<bigint> {
    const raw = await this.reader.call(token, data);
    try {
      const value = decodeFunctionResult({ abi: ERC20_ABI, functionName, data: raw });
      if (typeof value !== "bigint") throw new Error("not a bigint");
      return value;
    } catch {
      throw new ChainReadError("invalid_response", "the token answered with something that is not a uint256");
    }
  }

  // Circle USDC allowance(owner, router).
  allowance(owner: Address): Promise<bigint> {
    return this.readUint(BASE_USDC, encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [owner, BASE_WARP_ROUTER] }), "allowance");
  }

  // Circle USDC balanceOf(account).
  balanceOf(account: Address): Promise<bigint> {
    return this.readUint(BASE_USDC, encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [account] }), "balanceOf");
  }

  // null while the transaction is unknown or not yet mined.
  async getTransactionReceipt(hash: string): Promise<BaseReceipt | null> {
    if (!HEX_32.test(hash)) throw new ChainReadError("invalid_input", "the transaction hash is malformed");
    const raw = await this.rpc("eth_getTransactionReceipt", [hash.toLowerCase()]);
    if (raw === null) return null;
    return parseReceipt(raw, hash);
  }

  // Block timestamp in unix seconds, or null when the block is unknown.
  async getBlockTimestamp(blockNumber: bigint): Promise<bigint | null> {
    if (typeof blockNumber !== "bigint" || blockNumber < 0n) throw new ChainReadError("invalid_input", "the block number is invalid");
    const raw = await this.rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
    if (raw === null) return null;
    if (!isRecord(raw)) throw new ChainReadError("invalid_response", "the block is malformed");
    const stamp = quantity(raw["timestamp"]);
    if (stamp === null) throw new ChainReadError("invalid_response", "the block has no timestamp");
    return stamp;
  }
}

// ---- reading what the checks need -----------------------------------------------------------------------

export interface FundingChainReadings {
  readonly chainId: number | null;
  readonly pairing: RoutePairingReading | null;
  readonly allowance: bigint | null;
  readonly baseBalance: bigint | null;
  // Fixed labels such as "allowance:timeout": which read failed and why. No upstream text.
  readonly notes: readonly string[];
}

// One pass over Base: chain id, the route pairing (with the quote for this recipient and amount), the
// owner's allowance to the router and the owner's balance. Every read is independent, and a read that
// fails is null with a note, which the checks then refuse.
export async function readFundingChain(base: BaseRpc, owner: Address, account: Address, amount: bigint): Promise<FundingChainReadings> {
  const notes: string[] = [];
  const attempt = async <T>(label: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      notes.push(`${label}:${error instanceof ChainReadError ? error.code : "failed"}`);
      return null;
    }
  };
  const [chainId, pairing, allowance, baseBalance] = await Promise.all([
    attempt("chainId", () => base.chainId()),
    attempt("pairing", () => readRoutePairing({ baseRpc: base.reader }, account, amount)),
    attempt("allowance", () => base.allowance(owner)),
    attempt("balance", () => base.balanceOf(owner)),
  ]);
  return { chainId, pairing, allowance, baseBalance, notes };
}

// ---- the checks -------------------------------------------------------------------------------------------

export const PREFLIGHT_CHECK_IDS = [
  "router_pairing",
  "msg_value_zero",
  "quote_zero_fee",
  "destination_domain",
  "recipient_deployed",
  "recipient_not_eoa_not_zero",
  "allowance",
  "balances",
] as const;
export type PreflightCheckId = (typeof PREFLIGHT_CHECK_IDS)[number];

export type PreflightCode =
  | "ok"
  | "not_applicable"
  // router_pairing
  | "wrong_chain"
  | "chain_unreadable"
  | "wrong_router"
  | "pairing_unreadable"
  // msg_value_zero
  | "value_not_zero"
  // quote_zero_fee
  | "quote_not_zero_fee"
  | "quote_unreadable"
  // destination_domain
  | "wrong_destination"
  | "wrong_proposal_chain"
  | "bad_calldata"
  // recipient_deployed
  | "recipient_undeployed"
  | "deployment_unproven"
  // recipient_not_eoa_not_zero
  | "zero_recipient"
  | "recipient_is_owner"
  | "recipient_not_derived"
  | "recipient_protocol_contract"
  | "bad_padding"
  // allowance
  | "allowance_unreadable"
  | "allowance_short"
  // balances
  | "balance_unreadable"
  | "insufficient_balance";

export interface PreflightCheck {
  readonly id: PreflightCheckId;
  readonly ok: boolean;
  // False when the check has nothing to test at this step (it then passes with `not_applicable`).
  readonly applies: boolean;
  readonly code: PreflightCode;
  // Fixed text.
  readonly detail: string;
}

function pass(id: PreflightCheckId, detail: string, applies = true): PreflightCheck {
  return { id, ok: true, applies, code: applies ? "ok" : "not_applicable", detail };
}

function fail(id: PreflightCheckId, code: PreflightCode, detail: string): PreflightCheck {
  return { id, ok: false, applies: true, code, detail };
}

// What the deployment checks need from each source of evidence. "yes" is positive proof, "no" a complete
// negative, "unknown" anything else.
export interface DeploymentProof {
  readonly source: "relay" | "chain_logs";
  readonly deployed: Tri;
}

export function proofFromRelayState(state: "undeployed" | "deployed_unregistered" | "registered"): DeploymentProof {
  return { source: "relay", deployed: state === "undeployed" ? "no" : "yes" };
}

export function proofFromAccountState(result: Pick<AccountStateResult, "deployed">): DeploymentProof {
  return { source: "chain_logs", deployed: result.deployed };
}

export interface PreflightInput {
  readonly owner: string;
  // The derived recipient account.
  readonly account: string;
  readonly amount: bigint;
  // The step about to be issued.
  readonly step: Extract<FundingStep, "approve" | "transfer">;
  // The approve and transfer calls (both are checked; only the step's call is handed out).
  readonly calls: readonly FundingCall[];
  readonly chainId: number | null;
  readonly pairing: RoutePairingReading | null;
  readonly allowance: bigint | null;
  readonly baseBalance: bigint | null;
  readonly deployment: readonly DeploymentProof[];
}

function eq(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

interface SideExpectation {
  readonly token: Address;
  readonly remoteRouter: Address;
  readonly implementation: Address;
  readonly localDomain: number;
}

// Mirrors the comparison in routePairingTripwire (src/xo/chain/tripwires.ts), minus the quote, which is
// its own check here so that each failure has its own code.
function compareSide(label: string, reading: RouteSideReading, expected: SideExpectation): { mismatches: string[]; missing: string[] } {
  const mismatches: string[] = [];
  const missing: string[] = [];
  const check = (field: string, actual: string | number | null, want: string | number): void => {
    if (actual === null) missing.push(`${label}.${field}`);
    else if (String(actual).toLowerCase() !== String(want).toLowerCase()) mismatches.push(`${label}.${field}`);
  };
  check("token", reading.token, expected.token);
  check("remoteRouter", reading.remoteRouter, padAddressTopic(expected.remoteRouter));
  check("mailbox", reading.mailbox, HYPERLANE_MAILBOX);
  check("ism", reading.ism, HYPERLANE_ISM);
  check("localDomain", reading.localDomain, expected.localDomain);
  check("implementation", reading.implementation, expected.implementation);
  check("defaultHook", reading.defaultHook, HYPERLANE_HOOK);
  check("requiredHook", reading.requiredHook, HYPERLANE_HOOK);
  return { mismatches, missing };
}

function callOf(calls: readonly FundingCall[], kind: FundingCall["kind"]): FundingCall | undefined {
  return calls.find((call) => call.kind === kind);
}

// 1. The chain is Base, the route pair is as pinned, and the calls go to the pinned token and router.
export function checkRouterPairing(input: Pick<PreflightInput, "chainId" | "pairing" | "calls">): PreflightCheck {
  const id = "router_pairing";
  if (input.chainId === null) return fail(id, "chain_unreadable", "The chain id of the Base RPC could not be read.");
  if (input.chainId !== BASE_CHAIN_ID) return fail(id, "wrong_chain", "The RPC is not Base (chain id 8453).");
  const approve = callOf(input.calls, "approve");
  const transfer = callOf(input.calls, "transfer");
  if (approve === undefined || transfer === undefined) return fail(id, "bad_calldata", "Both the approve and the transfer call are needed to check the route.");
  if (!eq(approve.to, BASE_USDC) || !eq(transfer.to, BASE_WARP_ROUTER)) {
    return fail(id, "wrong_router", "A call does not target the pinned Circle USDC or the pinned Hyperlane router.");
  }
  if (input.pairing === null) return fail(id, "pairing_unreadable", "The route pairing could not be read.");
  const base = compareSide("base", input.pairing.base, {
    token: BASE_USDC,
    remoteRouter: XO_WARP_ROUTE,
    implementation: BASE_ROUTER_IMPLEMENTATION,
    localDomain: BASE_CHAIN_ID,
  });
  const mismatches = [...base.mismatches];
  const missing = [...base.missing];
  if (input.pairing.xo !== null) {
    const xo = compareSide("xo", input.pairing.xo, {
      token: USDC_E_ADDRESS,
      remoteRouter: BASE_WARP_ROUTER,
      implementation: XO_ROUTE_IMPLEMENTATION,
      localDomain: XO_CHAIN_ID,
    });
    mismatches.push(...xo.mismatches);
    missing.push(...xo.missing);
  }
  if (mismatches.length > 0) return fail(id, "wrong_router", "The Base router, its token, its XO peer, Mailbox, ISM, hooks or implementation differ from the pinned route.");
  if (missing.length > 0) return fail(id, "pairing_unreadable", "Part of the route pairing could not be read.");
  return pass(id, "The Base router is paired with the XO route exactly as pinned.");
}

// 2. msg.value must be exactly 0 on every proposal.
export function checkMsgValueZero(input: Pick<PreflightInput, "calls">): PreflightCheck {
  const id = "msg_value_zero";
  if (input.calls.length === 0) return fail(id, "bad_calldata", "There is no call to check.");
  for (const call of input.calls) {
    if (call.value !== FUNDING_VALUE_WEI) return fail(id, "value_not_zero", "A proposal carries a native value; msg.value must be exactly 0 or the transfer reverts.");
  }
  return pass(id, "Every proposal carries value 0.");
}

// 3. The router charges nothing: no native gas, no warp fee, exactly the amount of USDC.
export function checkQuoteZeroFee(input: Pick<PreflightInput, "pairing" | "amount">): PreflightCheck {
  const id = "quote_zero_fee";
  const quote = input.pairing?.baseQuote ?? null;
  if (quote === null) return fail(id, "quote_unreadable", "quoteTransferRemote could not be read.");
  const [native, token, fee] = quote;
  const exact =
    quote.length === 3 &&
    native !== undefined &&
    token !== undefined &&
    fee !== undefined &&
    eq(native.token, zeroAddress) &&
    native.amount === 0n &&
    eq(token.token, BASE_USDC) &&
    token.amount === input.amount &&
    eq(fee.token, BASE_USDC) &&
    fee.amount === 0n;
  return exact ? pass(id, "The router quotes no gas payment and no fee.") : fail(id, "quote_not_zero_fee", "quoteTransferRemote is not [(0x0, 0), (USDC, amount), (USDC, 0)]: the route now charges something.");
}

// 4. The destination domain is XO (3223) and every proposal is on Base.
export function checkDestinationDomain(input: Pick<PreflightInput, "calls">): PreflightCheck {
  const id = "destination_domain";
  if (input.calls.some((call) => call.chain !== FUNDING_CHAIN)) return fail(id, "wrong_proposal_chain", "A proposal is not on Base (eip155:8453).");
  const transfer = callOf(input.calls, "transfer");
  if (transfer === undefined) return fail(id, "bad_calldata", "There is no transfer call to check.");
  try {
    const decoded = decodeFundingData(transfer.data);
    if (decoded.kind !== "transfer") return fail(id, "bad_calldata", "The transfer call is not transferRemote.");
    if (decoded.destination !== HYPERLANE_DOMAIN_XO) return fail(id, "wrong_destination", "The transfer targets a domain other than XO (3223).");
  } catch {
    return fail(id, "bad_calldata", "The transfer calldata could not be decoded.");
  }
  return pass(id, "The transfer targets the XO domain (3223) and every proposal is on Base.");
}

// 5. Positive proof that the recipient account is deployed. A "no" from any source refuses; so does the
// absence of any positive proof; "unknown" alone never passes.
export function checkRecipientDeployed(input: Pick<PreflightInput, "deployment">): PreflightCheck {
  const id = "recipient_deployed";
  if (input.deployment.some((proof) => proof.deployed === "no")) {
    return fail(id, "recipient_undeployed", "The XO smart account is not deployed. USDC.e minted to it could only be moved by a UserOp, so funding waits for the deployment.");
  }
  if (!input.deployment.some((proof) => proof.deployed === "yes")) {
    return fail(id, "deployment_unproven", "There is no positive proof that the XO smart account is deployed.");
  }
  return pass(id, "The XO smart account is deployed.");
}

// 6. The recipient is the derived Kernel account: not zero, not the owner EOA, not a protocol contract,
// left-padded. (An arbitrary EOA cannot equal the derivation, which is why "not an EOA" needs no RPC.)
export function checkRecipientNotEoaNotZero(input: Pick<PreflightInput, "owner" | "account" | "calls">): PreflightCheck {
  const id = "recipient_not_eoa_not_zero";
  const transfer = callOf(input.calls, "transfer");
  if (transfer === undefined) return fail(id, "bad_calldata", "There is no transfer call to check.");
  let recipient: string;
  try {
    const decoded = decodeFundingData(transfer.data);
    if (decoded.kind !== "transfer") return fail(id, "bad_calldata", "The transfer call is not transferRemote.");
    if (decoded.recipient === null) return fail(id, "bad_padding", "The recipient word is not left-padded; the USDC would be stranded on Base.");
    recipient = decoded.recipient;
  } catch {
    return fail(id, "bad_calldata", "The transfer calldata could not be decoded.");
  }
  try {
    requireFundingRecipient(input.owner, recipient);
  } catch (error) {
    const code = error instanceof FundingCalldataError ? error.code : "recipient_not_derived";
    switch (code) {
      case "zero_recipient":
        return fail(id, "zero_recipient", "The recipient is the zero address.");
      case "recipient_is_owner":
        return fail(id, "recipient_is_owner", "The recipient is the owner EOA, which PayBox cannot sign for on the XO chain.");
      case "recipient_protocol_contract":
        return fail(id, "recipient_protocol_contract", "The recipient is a protocol contract.");
      default:
        return fail(id, "recipient_not_derived", "The recipient is not the XO smart account derived from the owner.");
    }
  }
  // The call must pay the account the rest of the flow reports on, not merely some derived account.
  if (!eq(recipient, input.account)) return fail(id, "recipient_not_derived", "The recipient differs from the XO smart account this funding is for.");
  return pass(id, "The recipient is the left-padded XO smart account derived from the owner.");
}

// 7. The allowance can be read, and for the transfer step it covers the amount.
export function checkAllowance(input: Pick<PreflightInput, "allowance" | "amount" | "step">): PreflightCheck {
  const id = "allowance";
  if (input.allowance === null) return fail(id, "allowance_unreadable", "The router allowance could not be read.");
  if (input.step === "approve") return pass(id, "The approve step sets the allowance, so nothing is required yet.", false);
  if (input.allowance < input.amount) return fail(id, "allowance_short", "The router allowance does not cover the amount; the transfer would revert.");
  return pass(id, "The router allowance covers the amount.");
}

// 8. The owner holds the amount in Circle USDC on Base.
export function checkBalances(input: Pick<PreflightInput, "baseBalance" | "amount">): PreflightCheck {
  const id = "balances";
  if (input.baseBalance === null) return fail(id, "balance_unreadable", "The owner's Circle USDC balance on Base could not be read.");
  if (input.baseBalance < input.amount) return fail(id, "insufficient_balance", "The owner holds less Circle USDC on Base than the amount.");
  return pass(id, "The owner holds enough Circle USDC on Base.");
}

export interface PreflightReport {
  readonly ok: boolean;
  // All eight, in PREFLIGHT_CHECK_IDS order.
  readonly checks: readonly PreflightCheck[];
  readonly failures: readonly PreflightCheck[];
  // Fixed labels for things that passed but deserve a mention.
  readonly warnings: readonly string[];
}

export function runPreflight(input: PreflightInput): PreflightReport {
  const checks: PreflightCheck[] = [
    checkRouterPairing(input),
    checkMsgValueZero(input),
    checkQuoteZeroFee(input),
    checkDestinationDomain(input),
    checkRecipientDeployed(input),
    checkRecipientNotEoaNotZero(input),
    checkAllowance(input),
    checkBalances(input),
  ];
  const warnings: string[] = [];
  if (input.pairing !== null && input.pairing.xo === null) warnings.push("xo_side_unchecked");
  const sources = new Set(input.deployment.filter((proof) => proof.deployed === "yes").map((proof) => proof.source));
  if (sources.size === 1 && sources.has("relay")) warnings.push("deployment_confirmed_by_relay_only");
  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, checks, failures, warnings };
}
