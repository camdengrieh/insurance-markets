// Building and rebuilding the decoded block of a Prepared item (amendment R1, docs/dapp-design.md 5.3 and 5.5).
//
//   buildDecodedUserOp / buildDecodedOrder / buildDecodedAuth   the relay's side: from what it just built,
//                                                               to the block it puts in the item;
//   rebuildDecoded                                              the checker's side: from the block alone to the
//                                                               digest, the inner hash and the summary lines,
//                                                               with the repo's own digest code;
//   verifyPreparedLocal                                         verifyPrepared (src/relay/contract.ts) with
//                                                               rebuildDecoded plugged in.
//
// rebuildDecoded never trusts a derived value in the block: price, size, cap arithmetic, the sender, the
// call templates and arguments are all recomputed from the signed fields or the call bytes and compared, and
// the first difference is reported by field. Nothing here reads a clock, the network or a key.
//
// Not exported from src/xo/signing/index.ts on purpose: it reaches the user-operation code, which a plain
// import of the signing helpers should not pull in. Import it by path.

import { keccak256 } from "viem";

import {
  AUTH_PREPARED_TTL_S,
  CAP_BASES,
  DECODED_CHAIN_ID,
  DECODED_VERSION,
  digestTag,
  verifyPrepared,
  type DecodedAuth,
  type DecodedCallBlock,
  type DecodedOrder,
  type DecodedUserOp,
  type PreparedDecoded,
  type RebuildFn,
  type RebuildOutcome,
  type TypedData,
  type UserOpAction,
  type VerifyPreparedResult,
} from "../../relay/contract.js";
import { formatAtomic } from "../../guardrails/amount.js";
import { AccountError, deriveAccount, parseOwner } from "../account/derive.js";
import { ENTRY_POINT_V07, USDC_E_DECIMALS, type Address, type Hex } from "../chain/constants.js";
import { ALLOWED_CALLS, type DecodedCall } from "../userop/calls.js";
import { UserOpError } from "../userop/encode.js";
import { userOpHash } from "../userop/hash.js";
import { packUserOp, unpackUserOp, type PackedUserOp } from "../userop/pack.js";
import { assertOperationShape, type PreparedUserOp as BuiltUserOp } from "../userop/sign.js";
import { decodeOrderAmounts, formatMicro, formatTick, orderCapAmount, ORDER_FEE_BOUND_BPS } from "./amounts.js";
import { buildClobAuthTypedData, hashClobAuth } from "./clobauth.js";
import { binaryPositionIds } from "./ctf.js";
import {
  CLOB_AUTH_DOMAIN_NAME,
  CLOB_AUTH_DOMAIN_VERSION,
  CLOB_AUTH_MESSAGE,
  CTF_EXCHANGE_ADDRESS,
  SIDE_BUY,
  SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  XO_CHAIN_ID,
  ZERO_ADDRESS,
  ZERO_BYTES16,
  ZERO_BYTES32,
} from "./constants.js";
import { SigningError } from "./errors.js";
import { buildKernelTypedData, kernelWrapDigest } from "./kernel.js";
import { authSummaryLines, isoSecond, orderSummaryLines, userOpSummaryLines } from "./lines.js";
import { assertOrder, hashOrder, type XoOrder } from "./order.js";

const usd = (atomic: bigint): string => formatAtomic(atomic, USDC_E_DECIMALS);
const lower = (value: string): string => value.toLowerCase();
const fail = (field: string, reason: string): RebuildOutcome => ({ ok: false, field, reason });
// The typed-data forms are plain JSON (no bigint), exactly as the relay puts them in an item.
const plainJson = (value: unknown): TypedData => JSON.parse(JSON.stringify(value)) as TypedData;

// ---- call blocks -----------------------------------------------------------------------------------------

function targetOf(kind: DecodedCall["kind"]): Address {
  const spec = ALLOWED_CALLS.find((entry) => entry.kind === kind);
  if (spec === undefined) throw new UserOpError("forbidden_call", "no such call template");
  return spec.target;
}

// A decoded call as it appears in the block: its template, its fixed target and its arguments as strings.
export function callBlockOf(call: DecodedCall): DecodedCallBlock {
  const to = targetOf(call.kind);
  switch (call.kind) {
    case "usdce_approve":
      return { template: call.kind, to, args: { spender: call.spender, amount: call.amount.toString() } };
    case "ctf_set_approval_for_all":
      return { template: call.kind, to, args: { operator: call.operator, approved: call.approved } };
    case "ctf_redeem":
      return { template: call.kind, to, args: { condition_id: call.conditionId, index_sets: call.indexSets.map((set) => set.toString()) } };
    case "create_market":
      return { template: call.kind, to, args: { starts_at: call.startsAt.toString(), expires_at: call.expiresAt.toString(), metadata_uri: call.metadataUri } };
    case "respond_update":
      return { template: call.kind, to, args: { condition_id: call.conditionId, accept: call.accept } };
    case "cancel_market":
      return { template: call.kind, to, args: { condition_id: call.conditionId } };
    case "withdraw_transfer_remote":
      return { template: call.kind, to, args: { destination: String(call.destination), recipient: call.recipient, amount: call.amount.toString() } };
  }
}

// Values compare case-insensitively when they are 0x hex (addresses and hashes may be spelled either way).
const canonicalArg = (value: string | boolean | readonly string[]): string =>
  JSON.stringify(typeof value === "string" ? (value.startsWith("0x") ? lower(value) : value) : Array.isArray(value) ? value.map((entry: string) => (entry.startsWith("0x") ? lower(entry) : entry)) : value);

function firstCallDifference(claimed: readonly DecodedCallBlock[], derived: readonly DecodedCallBlock[]): { readonly field: string; readonly reason: string } | undefined {
  if (claimed.length !== derived.length) return { field: "decoded.calls", reason: `the block lists ${claimed.length} calls, the call data holds ${derived.length}` };
  for (let index = 0; index < derived.length; index += 1) {
    const want = derived[index] as DecodedCallBlock;
    const have = claimed[index] as DecodedCallBlock;
    const path = `decoded.calls[${index}]`;
    if (have.template !== want.template) return { field: `${path}.template`, reason: `the call is ${want.template}, the block says ${have.template}` };
    if (lower(have.to) !== lower(want.to)) return { field: `${path}.to`, reason: "the call target differs from the one in the call data" };
    const keys = [...new Set([...Object.keys(want.args), ...Object.keys(have.args)])].sort();
    for (const key of keys) {
      const a = want.args[key];
      const b = have.args[key];
      if (a === undefined || b === undefined || canonicalArg(a) !== canonicalArg(b)) return { field: `${path}.args.${key}`, reason: "an argument differs from the one in the call data" };
    }
  }
  return undefined;
}

// ---- user operations -----------------------------------------------------------------------------------------

export interface BuildDecodedUserOpInput {
  readonly built: BuiltUserOp;
  readonly kind: "userop" | "create";
  readonly action: UserOpAction;
  // Whole-second ISO time at which the prepared item lapses (the item's expires_at).
  readonly validUntil: string;
  // `[market title (untrusted): "..."]` (marketTitleSlot output) or null.
  readonly titleSlot: string | null;
}

export function buildDecodedUserOp(input: BuildDecodedUserOpInput): DecodedUserOp {
  const { built } = input;
  const fields = unpackUserOp(built.op);
  return {
    v: DECODED_VERSION,
    kind: input.kind,
    chain_id: DECODED_CHAIN_ID,
    action: input.action,
    owner: built.owner,
    account: built.account,
    userop: {
      entry_point: ENTRY_POINT_V07,
      sender: fields.sender,
      nonce: fields.nonce.toString(10),
      init_code: fields.initCode,
      call_data: fields.callData,
      verification_gas_limit: fields.verificationGasLimit.toString(10),
      call_gas_limit: fields.callGasLimit.toString(10),
      pre_verification_gas: fields.preVerificationGas.toString(10),
      max_priority_fee_per_gas: fields.maxPriorityFeePerGas.toString(10),
      max_fee_per_gas: fields.maxFeePerGas.toString(10),
      paymaster:
        fields.paymaster === null
          ? null
          : { address: fields.paymaster.address, verification_gas_limit: fields.paymaster.verificationGasLimit.toString(10), post_op_gas_limit: fields.paymaster.postOpGasLimit.toString(10) },
    },
    calls: built.decoded.map(callBlockOf),
    display: { gas_source: built.plan.source, valid_until: input.validUntil, title_slot: input.titleSlot },
  };
}

function rebuildUserOp(d: DecodedUserOp): RebuildOutcome {
  let owner: Address;
  let account: Address;
  try {
    owner = parseOwner(d.owner);
    account = deriveAccount(owner);
  } catch (error) {
    if (error instanceof AccountError) return fail("decoded.owner", error.message);
    throw error;
  }
  if (lower(d.account) !== lower(account)) return fail("decoded.account", "the account is not the one derived from the owner");
  const u = d.userop;
  if (lower(u.entry_point) !== lower(ENTRY_POINT_V07)) return fail("decoded.userop.entry_point", "the operation names an EntryPoint other than v0.7");
  if (lower(u.sender) !== lower(account)) return fail("decoded.userop.sender", "the sender is not the account derived from the owner");
  let op: PackedUserOp;
  let calls: readonly DecodedCall[];
  try {
    op = packUserOp({
      sender: u.sender as Address,
      nonce: BigInt(u.nonce),
      initCode: u.init_code as Hex,
      callData: u.call_data as Hex,
      verificationGasLimit: BigInt(u.verification_gas_limit),
      callGasLimit: BigInt(u.call_gas_limit),
      preVerificationGas: BigInt(u.pre_verification_gas),
      maxPriorityFeePerGas: BigInt(u.max_priority_fee_per_gas),
      maxFeePerGas: BigInt(u.max_fee_per_gas),
      paymaster:
        u.paymaster === null
          ? null
          : { address: u.paymaster.address as Address, verificationGasLimit: BigInt(u.paymaster.verification_gas_limit), postOpGasLimit: BigInt(u.paymaster.post_op_gas_limit) },
    });
    // The same check the relay runs on a stored operation: derived sender, initCode, lane, closed call list,
    // action shape, sponsorship policy and zero fees.
    calls = assertOperationShape(op, { action: d.action, owner });
  } catch (error) {
    if (error instanceof UserOpError) return fail("decoded.userop", error.message);
    throw error;
  }
  const difference = firstCallDifference(d.calls, calls.map(callBlockOf));
  if (difference !== undefined) return fail(difference.field, difference.reason);
  if (d.display.title_slot !== null && d.action !== "create_market") return fail("decoded.display.title_slot", "only a market creation carries a market title");
  const limits = unpackUserOp(op);
  const lines = userOpSummaryLines({
    action: d.action,
    owner,
    account,
    calls,
    deploys: op.initCode !== "0x",
    initCodeBytes: (op.initCode.length - 2) / 2,
    nonce: op.nonce,
    sponsored: limits.paymaster !== null,
    gas: { verificationGasLimit: limits.verificationGasLimit, callGasLimit: limits.callGasLimit, preVerificationGas: limits.preVerificationGas, source: d.display.gas_source },
    validUntil: d.display.valid_until,
    titleSlot: d.display.title_slot,
  });
  return {
    ok: true,
    digest: userOpHash(op),
    inner_hash: keccak256(op.callData),
    lines,
    covered: ["userop", "calls"],
    unbound: ["display.gas_source", "display.valid_until", "display.title_slot"],
  };
}

// ---- orders --------------------------------------------------------------------------------------------------------

export interface BuildDecodedOrderInput {
  readonly owner: Address;
  readonly order: XoOrder;
  // The fee bound the caps are computed with (ORDER_CAP_FEE_BPS for a trade, ORDER_FEE_BOUND_BPS for a seed).
  readonly feeBps: number;
  readonly tif: "GTD" | "FOK" | "FAK";
  readonly postOnly: boolean;
  readonly purpose: "trade" | "seed";
  readonly ttlS: number;
  readonly conditionId: string | null;
}

function termsOf(order: XoOrder, feeBps: number): DecodedOrder["terms"] {
  const amounts = decodeOrderAmounts({ side: order.side, makerAmount: order.makerAmount, takerAmount: order.takerAmount });
  const cap = orderCapAmount({ side: order.side, makerAmount: order.makerAmount, takerAmount: order.takerAmount, feeBps });
  return {
    side: order.side === SIDE_BUY ? "BUY" : "SELL",
    price: formatTick(amounts.priceTick),
    shares: formatMicro(amounts.sharesMicro),
    principal_usd: usd(amounts.collateralMicro),
    fee_bound_bps: cap.feeBps,
    cap_usd: usd(cap.capAtomic),
    cap_basis: cap.basis,
    max_outlay_usd: cap.maxOutlayAtomic === null ? null : usd(cap.maxOutlayAtomic),
    min_proceeds_usd: cap.minProceedsAtomic === null ? null : usd(cap.minProceedsAtomic),
    expires_at: isoSecond(Number(order.expiration) * 1000),
  };
}

export function buildDecodedOrder(input: BuildDecodedOrderInput): DecodedOrder {
  const order = assertOrder(input.order);
  return {
    v: DECODED_VERSION,
    kind: "order",
    chain_id: DECODED_CHAIN_ID,
    action: "place_order",
    owner: input.owner,
    account: order.maker,
    order: {
      salt: order.salt.toString(),
      maker: order.maker,
      signer: order.signer,
      beneficiary: order.beneficiary,
      token_id: order.tokenId.toString(),
      maker_amount: order.makerAmount.toString(),
      taker_amount: order.takerAmount.toString(),
      expiration: order.expiration.toString(),
      nonce: order.nonce.toString(),
      identifier: order.identifier,
      metadata: order.metadata,
      side: order.side,
      signature_type: SIGNATURE_TYPE_XO_SMART_ACCOUNT,
    },
    exchange: CTF_EXCHANGE_ADDRESS,
    terms: termsOf(order, input.feeBps),
    params: { tif: input.tif, post_only: input.postOnly, purpose: input.purpose, ttl_s: input.ttlS, condition_id: input.conditionId === null ? null : lower(input.conditionId) },
  };
}

function rebuildOrder(d: DecodedOrder): RebuildOutcome {
  let owner: Address;
  let account: Address;
  try {
    owner = parseOwner(d.owner);
    account = deriveAccount(owner);
  } catch (error) {
    if (error instanceof AccountError) return fail("decoded.owner", error.message);
    throw error;
  }
  if (lower(d.account) !== lower(account)) return fail("decoded.account", "the account is not the one derived from the owner");
  const o = d.order;
  if (lower(o.maker) !== lower(account)) return fail("decoded.order.maker", "the order's maker is not the account derived from the owner");
  if (lower(o.signer) !== lower(account)) return fail("decoded.order.signer", "the order's signer is not the account derived from the owner");
  if (lower(o.beneficiary) !== ZERO_ADDRESS) return fail("decoded.order.beneficiary", "the order redirects its proceeds to a beneficiary");
  if (o.nonce !== "0") return fail("decoded.order.nonce", "the order's nonce is not 0");
  if (lower(o.identifier) !== ZERO_BYTES16) return fail("decoded.order.identifier", "the order carries an identifier");
  if (lower(o.metadata) !== ZERO_BYTES32) return fail("decoded.order.metadata", "the order carries metadata");
  if (o.expiration === "0") return fail("decoded.order.expiration", "the order never expires");
  if (lower(d.exchange) !== lower(CTF_EXCHANGE_ADDRESS)) return fail("decoded.exchange", "the order is bound to a contract other than the pinned exchange");

  let order: XoOrder;
  let inner: Hex;
  let wrapped: Hex;
  let terms: DecodedOrder["terms"];
  try {
    order = assertOrder({
      salt: BigInt(o.salt),
      maker: o.maker as Address,
      signer: o.signer as Address,
      beneficiary: o.beneficiary as Address,
      tokenId: BigInt(o.token_id),
      makerAmount: BigInt(o.maker_amount),
      takerAmount: BigInt(o.taker_amount),
      expiration: BigInt(o.expiration),
      nonce: BigInt(o.nonce),
      identifier: o.identifier as Hex,
      metadata: o.metadata as Hex,
      side: o.side,
      signatureType: o.signature_type,
    });
    inner = hashOrder(order);
    wrapped = kernelWrapDigest(inner, order.maker);
    if (d.terms.fee_bound_bps < ORDER_FEE_BOUND_BPS) return fail("decoded.terms.fee_bound_bps", `the caps use a fee bound below the ${ORDER_FEE_BOUND_BPS} bps the exchange allows`);
    terms = termsOf(order, d.terms.fee_bound_bps);
  } catch (error) {
    if (error instanceof SigningError) return fail("decoded.order", error.message);
    throw error;
  }
  for (const key of ["side", "price", "shares", "principal_usd", "fee_bound_bps", "cap_usd", "cap_basis", "max_outlay_usd", "min_proceeds_usd", "expires_at"] as const) {
    if (d.terms[key] !== terms[key]) return fail(`decoded.terms.${key}`, "the value differs from the one computed from the signed order fields");
  }
  if (!(CAP_BASES as readonly string[]).includes(terms.cap_basis)) return fail("decoded.terms.cap_basis", "unknown cap basis");
  if (d.params.purpose === "seed" && (terms.side !== "BUY" || d.params.tif !== "GTD" || !d.params.post_only)) {
    return fail("decoded.params.purpose", "a creation seed is a post-only GTD BUY");
  }
  if (d.params.post_only && d.params.tif !== "GTD") return fail("decoded.params.post_only", "post-only applies to a GTD order only");
  // SC-7: the market the card names has to be the market of the signed token. The token id is an opaque number;
  // the condition id is what a person recognises. The two position ids of a condition are derived from it, and
  // the signed token must be one of them, so a relay cannot keep the expected condition and swap the token.
  if (d.params.condition_id !== null && !binaryPositionIds(d.params.condition_id as Hex).includes(BigInt(o.token_id).toString(10))) {
    return fail("decoded.params.condition_id", "the signed token is not an outcome of the market condition shown");
  }

  const cap = orderCapAmount({ side: order.side, makerAmount: order.makerAmount, takerAmount: order.takerAmount, feeBps: terms.fee_bound_bps });
  const amounts = decodeOrderAmounts({ side: order.side, makerAmount: order.makerAmount, takerAmount: order.takerAmount });
  const lines = orderSummaryLines({
    side: terms.side,
    shares: terms.shares,
    tokenId: o.token_id,
    price: terms.price,
    tif: d.params.tif,
    postOnly: d.params.post_only,
    seed: d.params.purpose === "seed",
    feeBps: terms.fee_bound_bps,
    principalAtomic: amounts.collateralMicro,
    capAtomic: cap.capAtomic,
    maxOutlayAtomic: cap.maxOutlayAtomic,
    minProceedsAtomic: cap.minProceedsAtomic,
    expectedProceedsAtomic: cap.expectedProceedsAtomic,
    faceValueAtomic: cap.faceValueAtomic,
    expiresAt: terms.expires_at,
    ttlS: d.params.ttl_s,
    account: order.maker,
    owner,
    orderHash: inner,
    wrappedDigest: wrapped,
    conditionId: d.params.condition_id as Hex | null,
  });
  return {
    ok: true,
    digest: wrapped,
    inner_hash: inner,
    lines,
    covered: ["order", "exchange", "terms.side", "terms.price", "terms.shares", "terms.principal_usd", "terms.expires_at", ...(d.params.condition_id === null ? [] : ["params.condition_id"])],
    unbound: ["terms.fee_bound_bps", "terms.cap_usd", "terms.cap_basis", "terms.max_outlay_usd", "terms.min_proceeds_usd", "params"],
    typed_data: plainJson(buildKernelTypedData(inner, order.maker)),
  };
}

// ---- the XO login --------------------------------------------------------------------------------------------------

export interface BuildDecodedAuthInput {
  readonly owner: Address;
  readonly account: Address;
  readonly timestamp: string;
  readonly wrapped: boolean;
  readonly ttlS?: number;
}

export function buildDecodedAuth(input: BuildDecodedAuthInput): DecodedAuth {
  return {
    v: DECODED_VERSION,
    kind: "auth",
    chain_id: DECODED_CHAIN_ID,
    action: "connect",
    owner: input.owner,
    account: input.account,
    clob_auth: { address: input.account, timestamp: input.timestamp, nonce: "0", message: CLOB_AUTH_MESSAGE },
    wrap: input.wrapped ? "kernel-on" : "kernel-off",
    ttl_s: input.ttlS ?? AUTH_PREPARED_TTL_S,
  };
}

// The plain ClobAuth typed data (Kernel wrapper off), in the form the relay carries it.
function plainClobAuthTypedData(account: Address, timestamp: string): TypedData {
  return plainJson({
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      ClobAuth: [
        { name: "address", type: "address" },
        { name: "timestamp", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "message", type: "string" },
      ],
    },
    primaryType: "ClobAuth",
    domain: { name: CLOB_AUTH_DOMAIN_NAME, version: CLOB_AUTH_DOMAIN_VERSION, chainId: XO_CHAIN_ID },
    message: { address: account, timestamp, nonce: 0, message: CLOB_AUTH_MESSAGE },
  });
}

function rebuildAuth(d: DecodedAuth): RebuildOutcome {
  let owner: Address;
  let account: Address;
  try {
    owner = parseOwner(d.owner);
    account = deriveAccount(owner);
  } catch (error) {
    if (error instanceof AccountError) return fail("decoded.owner", error.message);
    throw error;
  }
  if (lower(d.account) !== lower(account)) return fail("decoded.account", "the account is not the one derived from the owner");
  if (lower(d.clob_auth.address) !== lower(account)) return fail("decoded.clob_auth.address", "the login names an address other than the derived account");
  if (d.clob_auth.message !== CLOB_AUTH_MESSAGE) return fail("decoded.clob_auth.message", "the attestation text is not the fixed one");
  if (d.clob_auth.nonce !== "0") return fail("decoded.clob_auth.nonce", "the login nonce is not 0");
  let inner: Hex;
  try {
    // buildClobAuthTypedData validates the timestamp shape; the hash is the ClobAuth digest.
    buildClobAuthTypedData({ address: account, timestamp: d.clob_auth.timestamp, nonce: 0n });
    inner = hashClobAuth({ address: account, timestamp: d.clob_auth.timestamp, nonce: 0n });
  } catch (error) {
    if (error instanceof SigningError) return fail("decoded.clob_auth.timestamp", error.message);
    throw error;
  }
  const wrapped = d.wrap === "kernel-on";
  return {
    ok: true,
    digest: wrapped ? kernelWrapDigest(inner, account) : inner,
    inner_hash: inner,
    lines: authSummaryLines({ account, owner, wrapped, ttlS: d.ttl_s }),
    covered: ["clob_auth", "wrap"],
    unbound: ["ttl_s"],
    typed_data: wrapped ? plainJson(buildKernelTypedData(inner, account)) : plainClobAuthTypedData(account, d.clob_auth.timestamp),
  };
}

// ---- the entry points ------------------------------------------------------------------------------------------------

export const rebuildDecoded: RebuildFn = (decoded: PreparedDecoded): RebuildOutcome => {
  switch (decoded.kind) {
    case "userop":
    case "create":
      return rebuildUserOp(decoded);
    case "order":
      return rebuildOrder(decoded);
    case "auth":
      return rebuildAuth(decoded);
  }
};

// verifyPrepared with the repo's own rebuild: what the Signature Card calls.
export function verifyPreparedLocal(item: unknown): VerifyPreparedResult {
  return verifyPrepared(item, rebuildDecoded);
}

// The tag that goes in summary.inner_hash_tag for a rebuilt block, and which kind of hash it is.
export function innerHashSummaryFields(decoded: PreparedDecoded, innerHash: Hex): { readonly inner_hash_tag: string; readonly inner_hash_kind: "call_data" | "typed_data_hash" } {
  return { inner_hash_tag: digestTag(innerHash), inner_hash_kind: decoded.kind === "userop" || decoded.kind === "create" ? "call_data" : "typed_data_hash" };
}
