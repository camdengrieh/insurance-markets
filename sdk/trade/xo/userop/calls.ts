// The only calls this project ever puts inside a user operation, as builders, and the closed list that
// every call must pass before it is signed or sent.
//
// Rules (docs/phase1-gap-closing.md sections 2.1, 2.2, 5.1; research notes 21 and 23):
//   - Targets and spenders are pinned constants. Nothing the agent, a market or an API says can choose a
//     target, a spender, an operator, a collateral token or a recipient other than the owner itself.
//   - Every call has value 0 (FU2). XO's operator and oracle functions (reviewMarket,
//     createConvictionMarketFor, updateMetadata, incrementNonceFor) have no builder and are refused by
//     `decodeAllowedCall`. Split and merge are out of scope for v0.2 (UO13) and have no builder.
//   - `decodeAllowedCall` reads a call back through the ABI and requires the canonical encoding, so a call
//     that was built by hand, altered in storage, or smuggled in by a caller is judged by what it does.
//   - A call knows whether the PolicyPaymaster would sponsor it (policy dated 2026-10-18, a READ item at
//     runtime). `transferRemote` is refused by the paymaster, so a withdrawal is never sponsored.

import { decodeFunctionData, encodeFunctionData, maxUint256, pad, toFunctionSelector, type Abi } from "viem";

import type { UserOpAction } from "../../contract.js";
import { MAX_REDEEMS_PER_OP } from "../../contract.js";
import { AccountError, parseOwner } from "../account/derive.js";
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI, MARKET_MANAGER_ABI, WARP_ROUTER_ABI } from "../../../chain/xo/abi.js";
import {
  APPROVE_SELECTOR,
  CANCEL_MARKET_SELECTOR,
  CONDITIONAL_TOKENS,
  CREATE_CONVICTION_MARKET_SELECTOR,
  CREATION_FEE_ATOMIC,
  CTF_EXCHANGE,
  HYPERLANE_DOMAIN_BASE,
  MARKET_MANAGER,
  RESPOND_TO_UPDATE_REQUEST_SELECTOR,
  TRANSFER_REMOTE_SELECTOR,
  USDC_E_ADDRESS,
  XO_WARP_ROUTE,
  type Address,
  type Hex,
} from "../../../chain/xo/constants.js";
import { UserOpError, normalizeCall, requireAddress, requireHex, requireUint, type Call } from "./encode.js";

// ---- constants local to the call surface --------------------------------------------------------

const ZERO32: Hex = pad("0x", { size: 32 });
// Selectors the shared constants file does not pin; computed from the ABI text, cross-checked in
// test/userop-calls.test.ts against the literals in the spec (0xa22cb465, 0x01b7037c).
const SET_APPROVAL_FOR_ALL_SELECTOR = toFunctionSelector("setApprovalForAll(address,bool)");
const REDEEM_POSITIONS_SELECTOR = toFunctionSelector("redeemPositions(address,bytes32,bytes32,uint256[])");

// Index sets XO's app and the docs use: both outcomes (`[1, 2]`, the documented form, which also covers
// voided markets) or one outcome. Anything else is a different instruction.
const ALLOWED_INDEX_SETS: readonly (readonly bigint[])[] = Object.freeze([Object.freeze([1n, 2n]), Object.freeze([1n]), Object.freeze([2n])]);

// The only spenders a USDC.e approval may name: the exchange (Enable Trading), the market manager
// (creation fee) and the XO route (the flagged withdrawal).
export const APPROVE_SPENDERS: readonly Address[] = Object.freeze([CTF_EXCHANGE, MARKET_MANAGER, XO_WARP_ROUTE]);

const MAX_METADATA_URI_CHARS = 2048;
// The host part (everything between https:// and the first /, ? or #) has to fit in the ~108 characters of a URI the
// signature card shows (sdk/trade/xo/lines.ts cuts at 120 with a marker), after the 8 of https://.
const MAX_URI_AUTHORITY_CHARS = 96;

export type DecodedCall =
  | { readonly kind: "usdce_approve"; readonly spender: Address; readonly amount: bigint }
  | { readonly kind: "ctf_set_approval_for_all"; readonly operator: Address; readonly approved: boolean }
  | { readonly kind: "ctf_redeem"; readonly conditionId: Hex; readonly indexSets: readonly bigint[] }
  | { readonly kind: "create_market"; readonly startsAt: bigint; readonly expiresAt: bigint; readonly metadataUri: string }
  | { readonly kind: "respond_update"; readonly conditionId: Hex; readonly accept: boolean }
  | { readonly kind: "cancel_market"; readonly conditionId: Hex }
  | { readonly kind: "withdraw_transfer_remote"; readonly destination: number; readonly recipient: Hex; readonly amount: bigint };

export type DecodedCallKind = DecodedCall["kind"];

export interface AllowedSpec {
  readonly kind: DecodedCallKind;
  readonly target: Address;
  readonly selector: Hex;
  // Would the PolicyPaymaster sponsor it (checkPolicy on 2026-10-18)? Only a hint for the caller's
  // choice; the runtime `paused()` and `checkPolicy` probes decide.
  readonly sponsored: boolean;
}

// The complete list. A pair that is not here is not buildable, not decodable and not signable.
const ALLOWED_LIST: AllowedSpec[] = [
  { kind: "usdce_approve", target: USDC_E_ADDRESS, selector: APPROVE_SELECTOR, sponsored: true },
  { kind: "ctf_set_approval_for_all", target: CONDITIONAL_TOKENS, selector: SET_APPROVAL_FOR_ALL_SELECTOR, sponsored: true },
  { kind: "ctf_redeem", target: CONDITIONAL_TOKENS, selector: REDEEM_POSITIONS_SELECTOR, sponsored: true },
  { kind: "create_market", target: MARKET_MANAGER, selector: CREATE_CONVICTION_MARKET_SELECTOR, sponsored: true },
  { kind: "respond_update", target: MARKET_MANAGER, selector: RESPOND_TO_UPDATE_REQUEST_SELECTOR, sponsored: true },
  { kind: "cancel_market", target: MARKET_MANAGER, selector: CANCEL_MARKET_SELECTOR, sponsored: true },
  { kind: "withdraw_transfer_remote", target: XO_WARP_ROUTE, selector: TRANSFER_REMOTE_SELECTOR, sponsored: false },
];
export const ALLOWED_CALLS: readonly AllowedSpec[] = Object.freeze(ALLOWED_LIST.map((spec) => Object.freeze(spec)));

// ---- builders -------------------------------------------------------------------------------------

function build(target: Address, data: Hex): Call {
  return Object.freeze({ to: target, value: 0n, data: data.toLowerCase() as Hex });
}

function requireSpender(spender: unknown): Address {
  const address = requireAddress(spender, "spender");
  if (!APPROVE_SPENDERS.includes(address)) {
    throw new UserOpError("forbidden_call", "USDC.e may only be approved to the exchange, the market manager or the XO route");
  }
  return address;
}

function approveData(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] });
}

// USDC.e.approve(spender, amount) with an exact, positive amount.
export function usdceApproveCall(spender: Address, amount: bigint): Call {
  const value = requireUint(amount, "amount", 256);
  if (value === 0n) throw new UserOpError("invalid_integer", "use usdceRevokeCall to set an allowance to zero");
  return build(USDC_E_ADDRESS, approveData(requireSpender(spender), value));
}

// The unlimited approval XO's own Enable Trading and creation flows use (2^256 - 1).
export function usdceApproveMaxCall(spender: Address): Call {
  return build(USDC_E_ADDRESS, approveData(requireSpender(spender), maxUint256));
}

export function usdceRevokeCall(spender: Address): Call {
  return build(USDC_E_ADDRESS, approveData(requireSpender(spender), 0n));
}

// ConditionalTokens.setApprovalForAll(exchange, approved). The operator is always the exchange.
export function ctfSetApprovalForAllCall(approved: boolean): Call {
  if (typeof approved !== "boolean") throw new UserOpError("invalid_input", "approved must be a boolean");
  return build(CONDITIONAL_TOKENS, encodeFunctionData({ abi: CONDITIONAL_TOKENS_ABI, functionName: "setApprovalForAll", args: [CTF_EXCHANGE, approved] }));
}

export interface EnableTradingOptions {
  // Exact allowance in USDC.e atomic units. Default: unlimited, as XO's own flow (decision D4 keeps
  // that while the balance is a test amount; a capped variant is behind test T8).
  readonly allowance?: bigint;
}

// XO's own order: approve USDC.e to the exchange, then approve the exchange as ERC-1155 operator.
export function enableTradingCalls(options: EnableTradingOptions = {}): Call[] {
  const approve = options.allowance === undefined ? usdceApproveMaxCall(CTF_EXCHANGE) : usdceApproveCall(CTF_EXCHANGE, options.allowance);
  return [approve, ctfSetApprovalForAllCall(true)];
}

// The on-chain kill switch (OR2): both approvals set back to nothing.
export function revokeTradingCalls(): Call[] {
  return [usdceRevokeCall(CTF_EXCHANGE), ctfSetApprovalForAllCall(false)];
}

function requireConditionId(value: unknown, label = "conditionId"): Hex {
  const id = requireHex(value, label, { bytes: 32 });
  if (id === ZERO32) throw new UserOpError("invalid_input", `${label} is zero`);
  return id;
}

function requireIndexSets(value: readonly bigint[]): readonly bigint[] {
  if (!Array.isArray(value)) throw new UserOpError("invalid_input", "indexSets must be a list");
  const wanted = value.map((v) => requireUint(v, "index set", 256));
  const match = ALLOWED_INDEX_SETS.find((set) => set.length === wanted.length && set.every((v, i) => v === wanted[i]));
  if (!match) throw new UserOpError("invalid_input", "index sets must be [1, 2], [1] or [2]");
  return match;
}

// redeemPositions(USDC.e, 0x00..00, conditionId, indexSets). Whether the condition is resolved is the
// relay's gate (payoutDenominator or a ConditionResolution log, UO11); the call itself is harmless
// on an unresolved condition only by CTF behaviour, so the gate must run first.
export function redeemCall(conditionId: Hex, indexSets: readonly bigint[] = [1n, 2n]): Call {
  return build(
    CONDITIONAL_TOKENS,
    encodeFunctionData({
      abi: CONDITIONAL_TOKENS_ABI,
      functionName: "redeemPositions",
      args: [USDC_E_ADDRESS, ZERO32, requireConditionId(conditionId), [...requireIndexSets(indexSets)]],
    }),
  );
}

// One redeem per distinct condition (case-insensitive de-dupe, first spelling wins), at most
// MAX_REDEEMS_PER_OP in one operation.
export function redeemCalls(conditionIds: readonly Hex[], indexSets: readonly bigint[] = [1n, 2n]): Call[] {
  if (!Array.isArray(conditionIds) || conditionIds.length === 0) throw new UserOpError("invalid_call", "no condition ids to redeem");
  const seen = new Set<string>();
  const calls: Call[] = [];
  for (const id of conditionIds) {
    const clean = requireConditionId(id);
    if (seen.has(clean)) continue;
    seen.add(clean);
    calls.push(redeemCall(clean, indexSets));
  }
  if (calls.length > MAX_REDEEMS_PER_OP) {
    throw new UserOpError("invalid_call", `at most ${MAX_REDEEMS_PER_OP} redeems per user operation`);
  }
  return calls;
}

function requireMetadataUri(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_METADATA_URI_CHARS) {
    throw new UserOpError("invalid_input", `metadata URI must be 1 to ${MAX_METADATA_URI_CHARS} characters`);
  }
  // Printable ASCII with no space, so no control or bidi character and nothing a URL parser would
  // quietly repair. https only: the contract validates nothing, so the plugin does.
  if (!/^[\x21-\x7e]+$/.test(value) || !value.startsWith("https://") || value.length <= "https://".length) {
    throw new UserOpError("invalid_input", "metadata URI must be an https URL in printable ASCII without spaces");
  }
  // SC-5: the host decides where the content is fetched from, and the signature card shows only the first ~100
  // characters of the URI. So no credentials in front of the host (an authority such as `good.example:pad...@evil.example`
  // would otherwise show a host that is not the real one), no backslash (parsers read it as a slash), and an
  // authority short enough to be inside what is shown. A long path or query after a short host is fine.
  const rest = value.slice("https://".length);
  if (rest.includes("\\")) throw new UserOpError("invalid_input", "metadata URI must not contain a backslash");
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  if (authority.length === 0) throw new UserOpError("invalid_input", "metadata URI has no host");
  if (authority.includes("@")) throw new UserOpError("invalid_input", "metadata URI must not carry credentials before the host");
  if (authority.length > MAX_URI_AUTHORITY_CHARS) throw new UserOpError("invalid_input", `metadata URI host part is longer than ${MAX_URI_AUTHORITY_CHARS} characters`);
  return value;
}

export interface CreateMarketCallsInput {
  // uint40 seconds since the epoch. The app sets startsAt to creation time (within -29 to +43 s of the
  // block time in 585 of 585); the relay checks the clock, this builder only checks the range.
  readonly startsAt: bigint | number;
  readonly expiresAt: bigint | number;
  readonly metadataUri: string;
  // Exact allowance for the fee. Default: exactly the fee (CR3). Must be at least the fee.
  readonly allowance?: bigint;
}

const UINT40 = 40;

// [USDC.e.approve(manager, allowance), createConvictionMarket(startsAt, expiresAt, USDC.e, uri)]. The
// fee is fixed at CREATION_FEE_ATOMIC: the relay reads the live fee first and aborts if it differs
// (CR2), so a changed fee never reaches this builder.
export function createMarketCalls(input: CreateMarketCallsInput): Call[] {
  const startsAt = requireUint(input.startsAt, "startsAt", UINT40);
  const expiresAt = requireUint(input.expiresAt, "expiresAt", UINT40);
  if (startsAt > expiresAt) throw new UserOpError("invalid_input", "startsAt is after expiresAt");
  if (expiresAt === 0n) throw new UserOpError("invalid_input", "expiresAt is zero");
  const uri = requireMetadataUri(input.metadataUri);
  const allowance = input.allowance === undefined ? CREATION_FEE_ATOMIC : requireUint(input.allowance, "allowance", 256);
  if (allowance < CREATION_FEE_ATOMIC) throw new UserOpError("invalid_input", "the allowance is below the creation fee");
  return [
    usdceApproveCall(MARKET_MANAGER, allowance),
    build(
      MARKET_MANAGER,
      encodeFunctionData({
        abi: MARKET_MANAGER_ABI,
        functionName: "createConvictionMarket",
        args: [Number(startsAt), Number(expiresAt), USDC_E_ADDRESS, uri],
      }),
    ),
  ];
}

export function respondToUpdateCall(conditionId: Hex, accept: boolean): Call {
  if (typeof accept !== "boolean") throw new UserOpError("invalid_input", "accept must be a boolean");
  return build(MARKET_MANAGER, encodeFunctionData({ abi: MARKET_MANAGER_ABI, functionName: "respondToUpdateRequest", args: [requireConditionId(conditionId), accept] }));
}

export function cancelMarketCall(conditionId: Hex): Call {
  return build(MARKET_MANAGER, encodeFunctionData({ abi: MARKET_MANAGER_ABI, functionName: "cancelMarket", args: [requireConditionId(conditionId)] }));
}

export interface WithdrawCallsInput {
  // The destination is always the owner EOA on Base (domain 8453). There is no recipient parameter.
  readonly owner: string;
  readonly amountAtomic: bigint;
}

// H1, flagged and unverified (FU9): [USDC.e.approve(route, a), route.transferRemote(8453, owner, a)].
// The recipient is the owner left-padded to 32 bytes (a right-padded or zero recipient strands funds).
// The paymaster refuses transferRemote, so this operation carries no paymaster.
export function withdrawCalls(input: WithdrawCallsInput): Call[] {
  const owner = ownerOf(input.owner);
  const amount = requireUint(input.amountAtomic, "amountAtomic", 256);
  if (amount === 0n) throw new UserOpError("invalid_integer", "amount is zero");
  return [
    usdceApproveCall(XO_WARP_ROUTE, amount),
    build(
      XO_WARP_ROUTE,
      encodeFunctionData({
        abi: WARP_ROUTER_ABI,
        functionName: "transferRemote",
        args: [HYPERLANE_DOMAIN_BASE, pad(owner.toLowerCase() as Hex, { size: 32 }), amount],
      }),
    ),
  ];
}

// ---- the closed list -------------------------------------------------------------------------------

export interface AllowedCallOptions {
  // When given, a withdrawal's recipient must be exactly this owner.
  readonly owner?: string;
}

function fail(message: string): never {
  throw new UserOpError("forbidden_call", message);
}

// The owner as the rest of the stack sees it: a non-zero address that is not a pinned contract.
function ownerOf(value: string): Address {
  try {
    return parseOwner(value);
  } catch (error) {
    if (error instanceof AccountError) throw new UserOpError("invalid_address", error.message);
    throw error;
  }
}

// viem throws its own errors on calldata it cannot read (short, misaligned); here that is a refusal.
function argsOf(abi: Abi, data: Hex): readonly unknown[] {
  try {
    return decodeFunctionData({ abi, data }).args ?? [];
  } catch {
    return fail("call data does not decode");
  }
}

function selectorOf(data: Hex): Hex {
  return data.slice(0, 10) as Hex;
}

function specFor(call: Call): AllowedSpec | undefined {
  const selector = selectorOf(call.data);
  return ALLOWED_CALLS.find((s) => s.target.toLowerCase() === call.to.toLowerCase() && s.selector === selector);
}

// Judges one call by what it does. Throws `forbidden_call` for anything that is not on the closed list or
// whose arguments leave the pinned values; returns the decoded call otherwise.
export function decodeAllowedCall(input: Call, options: AllowedCallOptions = {}): DecodedCall {
  const call = normalizeCall(input);
  if (call.value !== 0n) fail("calls carry no native value");
  if (call.data.length < 10) fail("call data has no selector");
  const spec = specFor(call);
  if (spec === undefined) fail("this target and selector are not on the allowed list");
  let decoded: DecodedCall;
  let canonical: Hex;
  try {
    decoded = decodeByKind(spec.kind, call);
    canonical = rebuild(decoded).data;
  } catch (error) {
    // A UserOpError is already a refusal with its reason; anything else (viem rejecting an argument that
    // does not fit its type, say) means the bytes are not a call this project would build.
    if (error instanceof UserOpError) throw error;
    return fail("call data is not the canonical encoding of an allowed call");
  }
  // Canonical encoding only: trailing bytes or odd padding would be a different instruction.
  if (canonical !== call.data) fail("call data is not the canonical encoding");
  if (decoded.kind === "withdraw_transfer_remote" && options.owner !== undefined) {
    const owner = ownerOf(options.owner);
    if (decoded.recipient !== pad(owner.toLowerCase() as Hex, { size: 32 })) fail("the withdrawal recipient is not the owner");
  }
  return decoded;
}

function decodeByKind(kind: DecodedCallKind, call: Call): DecodedCall {
  switch (kind) {
    case "usdce_approve": {
      const [spender, amount] = argsOf(ERC20_ABI, call.data) as readonly [Address, bigint];
      if (!APPROVE_SPENDERS.includes(spender)) fail("USDC.e may only be approved to the exchange, the market manager or the XO route");
      return { kind, spender, amount };
    }
    case "ctf_set_approval_for_all": {
      const [operator, approved] = argsOf(CONDITIONAL_TOKENS_ABI, call.data) as readonly [Address, boolean];
      if (operator !== CTF_EXCHANGE) fail("the only ERC-1155 operator is the exchange");
      return { kind, operator, approved };
    }
    case "ctf_redeem": {
      const [collateral, parent, conditionId, indexSets] = argsOf(CONDITIONAL_TOKENS_ABI, call.data) as readonly [Address, Hex, Hex, readonly bigint[]];
      if (collateral !== USDC_E_ADDRESS) fail("redeem collateral must be USDC.e");
      if (parent !== ZERO32) fail("redeem parent collection must be zero");
      if (conditionId === ZERO32) fail("redeem condition is zero");
      if (!ALLOWED_INDEX_SETS.some((set) => set.length === indexSets.length && set.every((v, i) => v === indexSets[i]))) {
        fail("redeem index sets must be [1, 2], [1] or [2]");
      }
      return { kind, conditionId, indexSets: [...indexSets] };
    }
    case "create_market": {
      const [startsAt, expiresAt, collateral, uri] = argsOf(MARKET_MANAGER_ABI, call.data) as readonly [number, number, Address, string];
      if (collateral !== USDC_E_ADDRESS) fail("market collateral must be USDC.e");
      if (startsAt > expiresAt || expiresAt === 0) fail("market times are out of order");
      try {
        requireMetadataUri(uri);
      } catch {
        fail("market metadata URI is not an https URL in printable ASCII");
      }
      return { kind, startsAt: BigInt(startsAt), expiresAt: BigInt(expiresAt), metadataUri: uri };
    }
    case "respond_update": {
      const [conditionId, accept] = argsOf(MARKET_MANAGER_ABI, call.data) as readonly [Hex, boolean];
      if (conditionId === ZERO32) fail("condition is zero");
      return { kind, conditionId, accept };
    }
    case "cancel_market": {
      const [conditionId] = argsOf(MARKET_MANAGER_ABI, call.data) as readonly [Hex];
      if (conditionId === ZERO32) fail("condition is zero");
      return { kind, conditionId };
    }
    case "withdraw_transfer_remote": {
      const [destination, recipient, amount] = argsOf(WARP_ROUTER_ABI, call.data) as readonly [number, Hex, bigint];
      if (destination !== HYPERLANE_DOMAIN_BASE) fail("withdrawals go to Base only");
      // Left-padded address: the upper 12 bytes are zero and the address is not the zero address.
      if (!/^0x0{24}[0-9a-f]{40}$/.test(recipient) || recipient === pad("0x", { size: 32 })) fail("the withdrawal recipient is not a left-padded address");
      if (amount === 0n) fail("withdrawal amount is zero");
      return { kind, destination, recipient, amount };
    }
  }
}

// The canonical call for a decoded call (used to prove the input was canonical).
function rebuild(decoded: DecodedCall): Call {
  switch (decoded.kind) {
    case "usdce_approve":
      return build(USDC_E_ADDRESS, approveData(decoded.spender, decoded.amount));
    case "ctf_set_approval_for_all":
      return ctfSetApprovalForAllCall(decoded.approved);
    case "ctf_redeem":
      return redeemCall(decoded.conditionId, decoded.indexSets);
    case "create_market":
      return build(
        MARKET_MANAGER,
        encodeFunctionData({
          abi: MARKET_MANAGER_ABI,
          functionName: "createConvictionMarket",
          args: [Number(decoded.startsAt), Number(decoded.expiresAt), USDC_E_ADDRESS, decoded.metadataUri],
        }),
      );
    case "respond_update":
      return respondToUpdateCall(decoded.conditionId, decoded.accept);
    case "cancel_market":
      return cancelMarketCall(decoded.conditionId);
    case "withdraw_transfer_remote":
      return build(
        XO_WARP_ROUTE,
        encodeFunctionData({ abi: WARP_ROUTER_ABI, functionName: "transferRemote", args: [decoded.destination, decoded.recipient, decoded.amount] }),
      );
  }
}

export function isAllowedCall(call: Call, options: AllowedCallOptions = {}): boolean {
  try {
    decodeAllowedCall(call, options);
    return true;
  } catch (error) {
    if (error instanceof UserOpError) return false;
    throw error;
  }
}

// Would the paymaster policy (2026-10-18) sponsor every call? One refused call refuses the operation.
export function isSponsorable(calls: readonly Call[]): boolean {
  return calls.length > 0 && calls.every((call) => specFor(normalizeCall(call))?.sponsored === true);
}

// ---- action shapes -----------------------------------------------------------------------------------

// Each relay action is exactly one shape of calls. Checking the shape ties the calls to the action
// that chose the gas plan and the sponsorship, so a mislabelled operation cannot slip through.
export function assertActionShape(action: UserOpAction, calls: readonly Call[], owner: string): readonly DecodedCall[] {
  if (!Array.isArray(calls) || calls.length === 0) throw new UserOpError("invalid_call", "no calls");
  const decoded = calls.map((call) => decodeAllowedCall(call, { owner }));
  const shapeError = (what: string): never => {
    throw new UserOpError("forbidden_call", `${action} does not match its calls: ${what}`);
  };
  const kinds = decoded.map((d) => d.kind);
  switch (action) {
    case "deploy_enable_trading":
    case "enable_trading": {
      const [approve, operator] = decoded;
      if (decoded.length !== 2 || approve?.kind !== "usdce_approve" || approve.spender !== CTF_EXCHANGE || approve.amount === 0n) shapeError("first call must approve USDC.e to the exchange");
      if (operator?.kind !== "ctf_set_approval_for_all" || !operator.approved) shapeError("second call must approve the exchange as operator");
      break;
    }
    case "revoke_trading": {
      const [approve, operator] = decoded;
      if (decoded.length !== 2 || approve?.kind !== "usdce_approve" || approve.spender !== CTF_EXCHANGE || approve.amount !== 0n) shapeError("first call must zero the USDC.e allowance");
      if (operator?.kind !== "ctf_set_approval_for_all" || operator.approved) shapeError("second call must remove the exchange as operator");
      break;
    }
    case "redeem": {
      if (decoded.length > MAX_REDEEMS_PER_OP) shapeError("too many redeems");
      if (kinds.some((k) => k !== "ctf_redeem")) shapeError("only redeemPositions calls");
      const ids = decoded.map((d) => (d.kind === "ctf_redeem" ? d.conditionId : ""));
      if (new Set(ids).size !== ids.length) shapeError("a condition is redeemed twice");
      break;
    }
    case "withdraw": {
      const [approve, transfer] = decoded;
      if (decoded.length !== 2 || approve?.kind !== "usdce_approve" || approve.spender !== XO_WARP_ROUTE) shapeError("first call must approve USDC.e to the XO route");
      if (transfer?.kind !== "withdraw_transfer_remote" || approve?.kind !== "usdce_approve" || transfer.amount !== approve.amount) shapeError("the transfer must move exactly the approved amount");
      break;
    }
    case "create_market": {
      const [approve, create] = decoded;
      if (decoded.length !== 2 || approve?.kind !== "usdce_approve" || approve.spender !== MARKET_MANAGER || approve.amount < CREATION_FEE_ATOMIC) shapeError("first call must approve at least the creation fee to the manager");
      if (create?.kind !== "create_market") shapeError("second call must create the market");
      break;
    }
    case "respond_update":
      if (decoded.length !== 1 || kinds[0] !== "respond_update") shapeError("one respondToUpdateRequest call");
      break;
    case "cancel_market":
      if (decoded.length !== 1 || kinds[0] !== "cancel_market") shapeError("one cancelMarket call");
      break;
    default: {
      const unreachable: never = action;
      void unreachable;
      throw new UserOpError("invalid_input", "unknown action");
    }
  }
  return decoded;
}
