// From calls to the thing the owner signs, and from what PayBox returns to a canonical signature.
//
// `prepareUserOp` is the one function the relay's prepare step needs: it takes the owner, the action and
// the calls, derives the account itself (a supplied one must match, AD1), re-reads the calls through the
// closed list (calls.ts), applies the deploy / sponsor / nonce rules, packs the operation with zero fees
// and returns the packed op, its userOpHash and the `Prepared.sign` block (amendment A1):
//
//   sign = { intent: { op: "raw", rawSigningPayloadHex: <userOpHash> }, expected_digest: <userOpHash>,
//            digest_form: "userOpHash" }
//
// `intent` goes to PayBox's request_wallet_sign unchanged (through toPayboxIntent in src/relay/contract.ts);
// `expected_digest` stays on the relay for the check after signing (verify.ts). No clock, no network, no key.

import { AccountError, buildInitCode, parseOwner, requireDerivedAccount } from "../account/derive.js";
import { digestTag, checkPreparedSign, preparedSignSchema, signatureInputSchema, type PreparedSign, type UserOpAction } from "../../relay/contract.js";
import { POLICY_PAYMASTER, type Address, type Hex } from "../chain/constants.js";
import { SECP256K1_HALF_N, SECP256K1_N } from "../signing/constants.js";
import { assertActionShape, isSponsorable, type DecodedCall } from "./calls.js";
import { UserOpError, decodeExecute, encodeExecute, type Call } from "./encode.js";
import { defaultGasFor, handleOpsCalldataBytes, withSizedPreVerificationGas, type GasPlan } from "./gas.js";
import { userOpHash } from "./hash.js";
import { assertDefaultRootLane, firstOpNonce } from "./nonce.js";
import { assertXoShape, packUserOp, unpackUserOp, type PackedUserOp, type UserOpFields } from "./pack.js";

// ---- what PayBox is asked to sign ------------------------------------------------------------------

// A raw intent over the userOpHash. A user operation is never signed as typed data (checkPreparedSign
// refuses that for this digest form): the validator takes 65 plain ECDSA bytes.
export function userOpSign(hash: Hex): PreparedSign {
  const sign = preparedSignSchema.parse({ intent: { op: "raw", rawSigningPayloadHex: hash }, expected_digest: hash, digest_form: "userOpHash" });
  const check = checkPreparedSign(sign);
  if (!check.ok) throw new UserOpError("invalid_input", check.reason);
  return sign;
}

export { digestTag };

// ---- what PayBox returns ---------------------------------------------------------------------------------

export interface NormalizedSignature {
  // r || s || v, 65 bytes, lower-case, v 27 or 28, s in the lower half.
  readonly signature: Hex;
  // The parity the canonical v encodes (0 for 27, 1 for 28).
  readonly recoveryId: 0 | 1;
  // The input used v 0 or 1 and was rewritten to 27 or 28.
  readonly rewroteV: boolean;
  // The input had s in the upper half and was replaced by n - s with the parity flipped.
  readonly flippedHighS: boolean;
}

function word(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

// Accepts the three shapes the contract allows (signatureInputSchema): 65 bytes of hex, or r and s with a
// recovery id or a v. Normalises v to 27 or 28 and s to the lower half (the same signer either way, but the
// canonical form is the one that is sent), and refuses everything else with `signature_invalid`.
export function normalizeSignature(input: unknown): NormalizedSignature {
  const parsed = signatureInputSchema.safeParse(input);
  if (!parsed.success) throw new UserOpError("signature_invalid", "not a 65-byte signature or an r, s and recovery id");
  let r: bigint;
  let s: bigint;
  let v: number;
  const value = parsed.data;
  if (typeof value === "string") {
    r = BigInt(`0x${value.slice(2, 66)}`);
    s = BigInt(`0x${value.slice(66, 130)}`);
    v = Number.parseInt(value.slice(130, 132), 16);
  } else {
    r = BigInt(value.r);
    s = BigInt(value.s);
    v = "recovery_id" in value ? value.recovery_id : value.v;
  }
  // The object forms are already limited to 0, 1, 27 and 28; the last byte of a 65-byte string may be anything.
  if (v !== 0 && v !== 1 && v !== 27 && v !== 28) throw new UserOpError("signature_invalid", "the recovery byte must be 0, 1, 27 or 28");
  if (r <= 0n || r >= SECP256K1_N || s <= 0n || s >= SECP256K1_N) throw new UserOpError("signature_invalid", "r and s must be in [1, n)");
  let parity: 0 | 1 = v === 0 || v === 27 ? 0 : 1;
  const rewroteV = v === 0 || v === 1;
  const flippedHighS = s > SECP256K1_HALF_N;
  if (flippedHighS) {
    s = SECP256K1_N - s;
    parity = parity === 0 ? 1 : 0;
  }
  return {
    signature: `0x${word(r)}${word(s)}${(27 + parity).toString(16)}` as Hex,
    recoveryId: parity,
    rewroteV,
    flippedHighS,
  };
}

// ---- prepare ---------------------------------------------------------------------------------------------------

export interface PrepareUserOpInput {
  readonly action: UserOpAction;
  readonly owner: string;
  // A supplied account is only compared with the derived one; it is never used.
  readonly suppliedAccount?: string | null;
  readonly calls: readonly Call[];
  // The full nonce from getNonce or from the logs (nonce.ts). A deploying operation must use the
  // first-operation nonce.
  readonly nonce: bigint;
  // True only with positive proof that the account has code (AccountDeployed / OwnerRegistered log, or
  // the proxy runtime code). `false` means the account is undeployed and this operation deploys it.
  readonly deployed: boolean;
  // Use the pinned PolicyPaymaster. Refused when any call is outside the paymaster's policy.
  readonly sponsor: boolean;
  // Limits to use instead of the observed defaults (for example after applyBundlerEstimate).
  readonly gas?: GasPlan;
}

export interface PreparedUserOp {
  readonly action: UserOpAction;
  readonly owner: Address;
  readonly account: Address;
  readonly calls: readonly Call[];
  readonly decoded: readonly DecodedCall[];
  readonly plan: GasPlan;
  // Unsigned (signature 0x). Persist this with the prepared item and recompute the hash from it.
  readonly op: PackedUserOp;
  readonly userOpHash: Hex;
  readonly sign: PreparedSign;
  // First 16 hex digits of the userOpHash, for a human to compare. Anti-accident only.
  readonly digestTag: string;
  readonly sponsored: boolean;
  readonly deploys: boolean;
}

function wrapAccountError<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof AccountError) {
      const code = error.code === "account_mismatch" || error.code === "account_is_owner" ? "sender_mismatch" : "invalid_address";
      throw new UserOpError(code, error.message);
    }
    throw error;
  }
}

export function prepareUserOp(input: PrepareUserOpInput): PreparedUserOp {
  const owner = wrapAccountError(() => parseOwner(input.owner));
  const account = wrapAccountError(() => requireDerivedAccount(owner, input.suppliedAccount));
  const decoded = assertActionShape(input.action, input.calls, owner);

  const deploys = !input.deployed;
  if (deploys && input.action !== "deploy_enable_trading") {
    throw new UserOpError("invalid_userop", "the account is not deployed: the first operation must be deploy_enable_trading");
  }
  if (!deploys && input.action === "deploy_enable_trading") {
    throw new UserOpError("invalid_userop", "the account is already deployed: use enable_trading");
  }
  const sponsored = input.sponsor;
  if (sponsored && !isSponsorable(input.calls)) {
    throw new UserOpError("sponsorship_refused", "the paymaster policy does not sponsor one of these calls: send without a paymaster");
  }

  const redeems = decoded.filter((d) => d.kind === "ctf_redeem").length;
  const basePlan = input.gas ?? defaultGasFor(input.action, { redeems: input.action === "redeem" ? redeems : undefined });
  const build = (plan: GasPlan): PackedUserOp =>
    packUserOp(fields(account, input.nonce, deploys ? buildInitCode(owner) : "0x", encodeExecute(input.calls), plan, sponsored));
  // Size term for preVerificationGas: one pass, because the calldata length does not depend on the value.
  const plan = withSizedPreVerificationGas(basePlan, handleOpsCalldataBytes(build(basePlan)));
  const op = build(plan);
  // The same check the relay runs on the stored operation before it sends anything.
  assertOperationShape(op, { action: input.action, owner });
  const hash = userOpHash(op);
  const sign = userOpSign(hash);
  return {
    action: input.action,
    owner,
    account,
    calls: input.calls,
    decoded,
    plan,
    op,
    userOpHash: hash,
    sign,
    digestTag: digestTag(hash),
    sponsored,
    deploys,
  };
}

export interface OperationShapeOptions {
  readonly action: UserOpAction;
  readonly owner: string;
  // Nonzero fees are not something this plugin builds (UO4); allow them only on purpose.
  readonly allowFees?: boolean;
}

// What the relay re-checks on a STORED operation before verifying a signature or sending it (invariant 3):
// the sender is the owner's derived account; initCode is empty or exactly buildInitCode(owner), and present
// exactly for the deploying action with the first-operation nonce; the nonce is in the default root lane;
// callData is the canonical encoding of calls that pass the closed list and form the declared action; the
// paymaster, if any, is the pinned one and every call is within its policy; fees are zero. Throws UserOpError.
export function assertOperationShape(op: PackedUserOp, options: OperationShapeOptions): readonly DecodedCall[] {
  const owner = wrapAccountError(() => parseOwner(options.owner));
  const checked = assertXoShape(op);
  if (checked.sender !== wrapAccountError(() => requireDerivedAccount(owner, null))) {
    throw new UserOpError("sender_mismatch", "the operation's sender is not the account derived from the owner");
  }
  const deploys = checked.initCode !== "0x";
  if (deploys !== (options.action === "deploy_enable_trading")) {
    throw new UserOpError("invalid_userop", deploys ? "only deploy_enable_trading carries initCode" : "deploy_enable_trading must carry initCode");
  }
  if (deploys && checked.initCode !== buildInitCode(owner)) {
    throw new UserOpError("invalid_userop", "initCode is not the factory call for this owner");
  }
  if (deploys && checked.nonce !== firstOpNonce()) {
    throw new UserOpError("invalid_nonce", "a deploying operation uses the first-operation nonce (lane 0, sequence 0)");
  }
  assertDefaultRootLane(checked.nonce);
  const { calls } = decodeExecute(checked.callData);
  const decoded = assertActionShape(options.action, calls, owner);
  const fields = unpackUserOp(checked);
  if (fields.paymaster !== null && !isSponsorable(calls)) {
    throw new UserOpError("sponsorship_refused", "the paymaster policy does not sponsor one of these calls");
  }
  if (options.allowFees !== true && (fields.maxFeePerGas !== 0n || fields.maxPriorityFeePerGas !== 0n)) {
    throw new UserOpError("invalid_userop", "fees are zero on this chain");
  }
  return decoded;
}

export type SponsorshipFallback = "retry_without_paymaster" | "stop";

// UO7: when the paymaster will not sponsor (paused, policy narrowed, or the bundler says no), an existing
// account may retry ONCE without a paymaster (zero-fee operations without one have landed for existing
// accounts, UO8); a deployment stops, because that case was never observed.
export function sponsorshipFallback(input: { readonly deploys: boolean; readonly retried: boolean }): SponsorshipFallback {
  return input.deploys || input.retried ? "stop" : "retry_without_paymaster";
}

function fields(sender: Address, nonce: bigint, initCode: Hex, callData: Hex, plan: GasPlan, sponsor: boolean): UserOpFields {
  return {
    sender,
    nonce,
    initCode,
    callData,
    verificationGasLimit: plan.limits.verificationGasLimit,
    callGasLimit: plan.limits.callGasLimit,
    preVerificationGas: plan.limits.preVerificationGas,
    // Zero fees: 236 of 236 observed operations, and the docs say the bundler accepts them (UO4).
    maxPriorityFeePerGas: 0n,
    maxFeePerGas: 0n,
    paymaster: sponsor
      ? { address: POLICY_PAYMASTER, verificationGasLimit: plan.limits.paymasterVerificationGasLimit, postOpGasLimit: plan.limits.paymasterPostOpGasLimit }
      : null,
  };
}
