// Calldata for the two Base transactions that move USDC to an XO smart account (docs/phase1-gap-closing.md
// sections 2.1 E and 3.4, docs/research/20-funding-route-verification.md section 4):
//
//   1. approve(router, amount) on Circle USDC, the exact amount, never unlimited;
//   2. transferRemote(3223, bytes32(account, left-padded), amount) on the Hyperlane router.
//
// Both go out as PayBox EVM proposals on eip155:8453 with value "0" (a non-zero msg.value reverts at the
// Mailbox hook). A mistake in the recipient is unrecoverable: a right-padded or zero recipient strands the
// USDC on Base (the XO side reverts and there is no refund path, note 20 sec 4.1). So this module
//   - derives the recipient from the owner and refuses anything else (AD1, FU3);
//   - builds the recipient word with one helper and re-decodes every call it hands out;
//   - never produces an unlimited approval or an amount it cannot represent exactly.
//
// Pure: no network, no clock, no Node-only import. Money is bigint atomic units (6 decimals) or a decimal
// string parsed with exact integer math, never a float.

import { decodeFunctionData, encodeFunctionData, getAddress, isAddress, zeroAddress } from "viem";

import { parseDecimalAtomic } from "../../guardrails/amount.js";
import { ERC20_ABI, WARP_ROUTER_ABI } from "../chain/abi.js";
import {
  APPROVE_CALLDATA_BYTES,
  APPROVE_SELECTOR,
  BASE_CHAIN_ID,
  BASE_USDC,
  BASE_USDC_DECIMALS,
  BASE_WARP_ROUTER,
  FUNDING_VALUE_WEI,
  HYPERLANE_DOMAIN_XO,
  PINNED_CONTRACTS,
  TRANSFER_REMOTE_CALLDATA_BYTES,
  TRANSFER_REMOTE_SELECTOR,
  type Address,
  type Hex,
} from "../chain/constants.js";
import { AccountError, deriveAccount, parseAddress, parseOwner } from "../account/derive.js";

// The PayBox proposal chain for every funding call.
export const FUNDING_CHAIN = `eip155:${BASE_CHAIN_ID}` as const;

// A sanity bound far above any cap ($1,000,000 in USDC atomic units; the largest deposit Phase 0 saw was
// $30,000). Its job is to make an unlimited approve (2^256 - 1) and other absurd amounts unrepresentable
// here, whatever the caller's own caps say.
export const MAX_FUNDING_ATOMIC = 1_000_000_000_000n;

export type FundingCallKind = "approve" | "transfer";

// What goes into a PayBox EVM proposal. `chain` and `value` are plain strings on purpose: the verifiers
// below must be able to look at a wrong one (a test, or a caller bug) and refuse it.
export interface FundingCall {
  readonly kind: FundingCallKind;
  readonly chain: string;
  readonly to: Address;
  readonly value: string;
  readonly data: Hex;
}

export type FundingCalldataErrorCode =
  | "invalid_amount" // zero, negative, not an integer, or not parseable
  | "amount_too_large" // above MAX_FUNDING_ATOMIC (also rules out an unlimited approve)
  | "invalid_owner" // not an EIP-55 address, zero, or a pinned protocol contract
  | "invalid_account" // not an EIP-55 address
  | "zero_recipient" // the zero address as recipient
  | "recipient_is_owner" // the owner EOA as recipient: the money would land where PayBox cannot sign
  | "recipient_not_derived" // not the account derived from the owner
  | "recipient_protocol_contract" // a pinned protocol contract as recipient
  | "bad_padding" // the upper 12 bytes of the recipient word are not zero
  | "bad_calldata" // not exactly one of the two calls, or not canonical
  | "wrong_target" // the call goes to an address other than the pinned token or router
  | "wrong_chain" // the proposal chain is not eip155:8453
  | "value_not_zero" // msg.value must be exactly "0"
  | "wrong_spender" // the approve spender is not the router
  | "wrong_destination" // the destination domain is not 3223
  | "wrong_recipient" // the recipient word is not the left-padded account
  | "wrong_amount"; // the amount differs from the requested one

export class FundingCalldataError extends Error {
  readonly code: FundingCalldataErrorCode;
  constructor(code: FundingCalldataErrorCode, message: string) {
    super(message);
    this.name = "FundingCalldataError";
    this.code = code;
  }
}

const PROTOCOL_ADDRESSES: ReadonlySet<string> = new Set(PINNED_CONTRACTS.map((contract) => contract.address.toLowerCase()));
const HEX_DATA = /^0x(?:[0-9a-fA-F]{2})*$/;
const WORD_ZERO_PREFIX = `0x${"0".repeat(24)}`;

// ---- amounts ------------------------------------------------------------------------------------

export function requireFundingAmount(amount: unknown): bigint {
  if (typeof amount !== "bigint" || amount <= 0n) throw new FundingCalldataError("invalid_amount", "the amount must be a positive whole number of USDC atomic units");
  if (amount > MAX_FUNDING_ATOMIC) throw new FundingCalldataError("amount_too_large", "the amount is above the sanity bound for one funding");
  return amount;
}

export type ParsedFundingAmount =
  | { readonly ok: true; readonly value: bigint }
  | { readonly ok: false; readonly code: "invalid_amount" | "amount_too_large"; readonly reason: string };

// "3" or "2.5" to atomic units, exactly. No signs, exponents, separators or more than 6 decimals.
export function parseFundingAmount(usd: unknown): ParsedFundingAmount {
  const parsed = parseDecimalAtomic(usd, BASE_USDC_DECIMALS);
  if (!parsed.ok) return { ok: false, code: "invalid_amount", reason: parsed.reason };
  if (parsed.value <= 0n) return { ok: false, code: "invalid_amount", reason: "the amount must be greater than zero" };
  if (parsed.value > MAX_FUNDING_ATOMIC) return { ok: false, code: "amount_too_large", reason: "the amount is above the sanity bound for one funding" };
  return { ok: true, value: parsed.value };
}

// ---- the recipient word -------------------------------------------------------------------------

function parseAccountArg(account: unknown): Address {
  try {
    return parseAddress(account);
  } catch {
    throw new FundingCalldataError("invalid_account", "the account is not a valid EIP-55 address");
  }
}

// bytes32 with the 20-byte account in the LOW bytes and the upper 12 bytes zero. A right-padded word
// would be accepted on Base and could never be delivered on XO.
export function padRecipient(account: string): Hex {
  const parsed = parseAccountArg(account);
  return `${WORD_ZERO_PREFIX}${parsed.slice(2).toLowerCase()}` as Hex;
}

// The inverse. Refuses a word whose upper 12 bytes are not zero.
export function recipientFromWord(word: string): Address {
  if (typeof word !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(word)) throw new FundingCalldataError("bad_calldata", "the recipient is not a 32-byte word");
  if (!word.toLowerCase().startsWith(WORD_ZERO_PREFIX)) throw new FundingCalldataError("bad_padding", "the upper 12 bytes of the recipient word are not zero");
  return getAddress(`0x${word.slice(26)}`);
}

export function isLeftPaddedRecipient(word: string): boolean {
  try {
    recipientFromWord(word);
    return true;
  } catch {
    return false;
  }
}

// FU3: the recipient is the account derived from the owner, left-padded, non-zero, not the owner EOA, not
// a pinned protocol contract. Returns the parsed owner and the derived account.
export function requireFundingRecipient(owner: string, account: string): { readonly owner: Address; readonly account: Address } {
  let parsedOwner: Address;
  try {
    parsedOwner = parseOwner(owner);
  } catch (error) {
    if (error instanceof AccountError) throw new FundingCalldataError("invalid_owner", "the owner is not a usable EOA address");
    throw error;
  }
  const parsedAccount = parseAccountArg(account);
  if (parsedAccount === zeroAddress) throw new FundingCalldataError("zero_recipient", "the recipient is the zero address");
  if (parsedAccount.toLowerCase() === parsedOwner.toLowerCase()) {
    throw new FundingCalldataError("recipient_is_owner", "the recipient is the owner EOA, not its XO smart account");
  }
  if (PROTOCOL_ADDRESSES.has(parsedAccount.toLowerCase())) {
    throw new FundingCalldataError("recipient_protocol_contract", "the recipient is a pinned protocol contract");
  }
  if (parsedAccount !== deriveAccount(parsedOwner)) {
    throw new FundingCalldataError("recipient_not_derived", "the recipient is not the XO smart account derived from the owner");
  }
  return { owner: parsedOwner, account: parsedAccount };
}

// ---- encoding -----------------------------------------------------------------------------------

// approve(router, amount) on Circle USDC. Exact amount, 68 bytes.
export function encodeApprove(amount: bigint): Hex {
  const value = requireFundingAmount(amount);
  return encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [BASE_WARP_ROUTER, value] });
}

// transferRemote(destination, recipient word, amount) on the router. 100 bytes. Low level: the word is
// checked for padding but not against an owner; buildTransferRemoteCall adds the recipient policy.
export function encodeTransferRemote(recipientWord: string, amount: bigint, destination: number = HYPERLANE_DOMAIN_XO): Hex {
  const value = requireFundingAmount(amount);
  recipientFromWord(recipientWord);
  if (!Number.isInteger(destination) || destination <= 0 || destination > 0xffffffff) {
    throw new FundingCalldataError("wrong_destination", "the destination domain is not a uint32");
  }
  return encodeFunctionData({ abi: WARP_ROUTER_ABI, functionName: "transferRemote", args: [destination, recipientWord.toLowerCase() as Hex, value] });
}

export function buildApproveCall(amount: bigint): FundingCall {
  return { kind: "approve", chain: FUNDING_CHAIN, to: BASE_USDC, value: FUNDING_VALUE_WEI, data: encodeApprove(amount) };
}

export function buildTransferRemoteCall(input: { readonly owner: string; readonly account: string; readonly amount: bigint }): FundingCall {
  const { account } = requireFundingRecipient(input.owner, input.account);
  return {
    kind: "transfer",
    chain: FUNDING_CHAIN,
    to: BASE_WARP_ROUTER,
    value: FUNDING_VALUE_WEI,
    data: encodeTransferRemote(padRecipient(account), input.amount),
  };
}

export interface FundingCalls {
  readonly owner: Address;
  readonly account: Address;
  readonly amount: bigint;
  readonly approve: FundingCall;
  readonly transfer: FundingCall;
}

// Derives the account from the owner (never taken from outside), builds both calls and re-decodes them
// against the request before returning. `account`, when supplied, is only compared with the derivation.
export function buildFundingCalls(input: { readonly owner: string; readonly amount: bigint; readonly account?: string | null }): FundingCalls {
  let owner: Address;
  try {
    owner = parseOwner(input.owner);
  } catch {
    throw new FundingCalldataError("invalid_owner", "the owner is not a usable EOA address");
  }
  const account = deriveAccount(owner);
  if (input.account !== undefined && input.account !== null) requireFundingRecipient(owner, input.account);
  const amount = requireFundingAmount(input.amount);
  const approve = buildApproveCall(amount);
  const transfer = buildTransferRemoteCall({ owner, account, amount });
  verifyFundingCall(approve, { owner, account, amount });
  verifyFundingCall(transfer, { owner, account, amount });
  return { owner, account, amount, approve, transfer };
}

// ---- decoding and verification -------------------------------------------------------------------

export type DecodedFundingCall =
  | { readonly kind: "approve"; readonly spender: Address; readonly amount: bigint }
  // `recipient` is null when the upper 12 bytes of the word are not zero (a right-padded or otherwise
  // dirty word): the call decodes, but it must never be sent.
  | { readonly kind: "transfer"; readonly destination: number; readonly recipientWord: Hex; readonly recipient: Address | null; readonly amount: bigint };

// Decodes calldata that must be exactly approve(spender, amount) or transferRemote(domain, word, amount),
// in canonical form: the bytes must equal a fresh encoding of what they decode to, which rejects trailing
// bytes, dirty padding in the address word and any other shape.
export function decodeFundingData(data: string): DecodedFundingCall {
  if (typeof data !== "string" || !HEX_DATA.test(data)) throw new FundingCalldataError("bad_calldata", "the calldata is not even-length hex");
  try {
    return decodeCanonical(data.toLowerCase() as Hex);
  } catch (error) {
    // The ABI decoder throws its own errors for words that do not fit their type (a destination above
    // the uint32 range, say). Every such input is simply bad calldata.
    if (error instanceof FundingCalldataError) throw error;
    throw new FundingCalldataError("bad_calldata", "the calldata could not be decoded");
  }
}

function decodeCanonical(lower: Hex): DecodedFundingCall {
  const bytes = (lower.length - 2) / 2;
  const selector = lower.slice(0, 10);
  if (selector === APPROVE_SELECTOR) {
    if (bytes !== APPROVE_CALLDATA_BYTES) throw new FundingCalldataError("bad_calldata", "approve calldata must be 68 bytes");
    const decoded = decodeFunctionData({ abi: ERC20_ABI, data: lower });
    if (decoded.functionName !== "approve") throw new FundingCalldataError("bad_calldata", "not an approve call");
    const [spender, amount] = decoded.args as readonly [Address, bigint];
    if (encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] }) !== lower) {
      throw new FundingCalldataError("bad_calldata", "approve calldata is not canonical");
    }
    return { kind: "approve", spender: getAddress(spender), amount };
  }
  if (selector === TRANSFER_REMOTE_SELECTOR) {
    if (bytes !== TRANSFER_REMOTE_CALLDATA_BYTES) throw new FundingCalldataError("bad_calldata", "transferRemote calldata must be 100 bytes");
    const decoded = decodeFunctionData({ abi: WARP_ROUTER_ABI, data: lower });
    if (decoded.functionName !== "transferRemote") throw new FundingCalldataError("bad_calldata", "not a transferRemote call");
    const [destination, recipientWord, amount] = decoded.args as readonly [number, Hex, bigint];
    if (encodeFunctionData({ abi: WARP_ROUTER_ABI, functionName: "transferRemote", args: [destination, recipientWord, amount] }) !== lower) {
      throw new FundingCalldataError("bad_calldata", "transferRemote calldata is not canonical");
    }
    const word = recipientWord.toLowerCase() as Hex;
    return { kind: "transfer", destination, recipientWord: word, recipient: isLeftPaddedRecipient(word) ? recipientFromWord(word) : null, amount };
  }
  throw new FundingCalldataError("bad_calldata", "the calldata is neither approve nor transferRemote");
}

export function decodeFundingCall(call: FundingCall): DecodedFundingCall {
  return decodeFundingData(call.data);
}

function sameAddress(a: string, b: string): boolean {
  return isAddress(a, { strict: false }) && a.toLowerCase() === b.toLowerCase();
}

// The last gate before a call reaches PayBox: chain, target, value, selector, spender or destination,
// recipient and amount must all be exactly what was asked for.
export function verifyFundingCall(
  call: FundingCall,
  expected: { readonly owner: string; readonly account: string; readonly amount: bigint },
): DecodedFundingCall {
  if (call.chain !== FUNDING_CHAIN) throw new FundingCalldataError("wrong_chain", "the proposal chain is not Base (eip155:8453)");
  if (call.value !== FUNDING_VALUE_WEI) throw new FundingCalldataError("value_not_zero", "msg.value must be exactly 0");
  const { account } = requireFundingRecipient(expected.owner, expected.account);
  const amount = requireFundingAmount(expected.amount);
  const decoded = decodeFundingData(call.data);
  if (decoded.kind !== call.kind) throw new FundingCalldataError("bad_calldata", "the calldata does not match the call kind");
  if (decoded.amount !== amount) throw new FundingCalldataError("wrong_amount", "the call amount differs from the requested amount");
  if (decoded.kind === "approve") {
    if (!sameAddress(call.to, BASE_USDC)) throw new FundingCalldataError("wrong_target", "approve must target Circle USDC on Base");
    if (!sameAddress(decoded.spender, BASE_WARP_ROUTER)) throw new FundingCalldataError("wrong_spender", "the approve spender is not the Hyperlane router");
    return decoded;
  }
  if (!sameAddress(call.to, BASE_WARP_ROUTER)) throw new FundingCalldataError("wrong_target", "transferRemote must target the Hyperlane router");
  if (decoded.destination !== HYPERLANE_DOMAIN_XO) throw new FundingCalldataError("wrong_destination", "the destination domain is not XO (3223)");
  if (decoded.recipient === null) throw new FundingCalldataError("bad_padding", "the upper 12 bytes of the recipient word are not zero");
  if (decoded.recipientWord !== padRecipient(account)) throw new FundingCalldataError("wrong_recipient", "the recipient is not the left-padded XO smart account");
  return decoded;
}
