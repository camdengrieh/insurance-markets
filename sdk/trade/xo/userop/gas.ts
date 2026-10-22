// Gas limits for a user operation: observed defaults per action, a size term for preVerificationGas, and
// the rule for using a bundler's estimate instead.
//
// Fees are zero (236 of 236 observed), so a limit that is too high costs nothing and one that is too low
// reverts the operation; every choice below leans high. The defaults are real operations' values
// (docs/research/21-userop-templates.md section 8.1, constants in sdk/chain/xo/constants.ts), not
// requirements: larger round limits also land [21 V2.5], and the bundler's own estimate is preferred
// when the estimate method is available and the caller allows it [21 V4.1]. UO5 in the assumptions
// register: call eth_estimateUserOperationGas first, else observed defaults with +30% on callGasLimit;
// paymaster limits at least 40,262 / 26,478.

import { encodeFunctionData, zeroAddress } from "viem";

import type { UserOpAction } from "../../contract.js";
import { ENTRY_POINT_ABI } from "../../../chain/xo/abi.js";
import { GAS_DEFAULTS, PRE_VERIFICATION_GAS_PER_EXTRA_BYTE, REDEEM_CALL_GAS_MARGIN, REDEEM_CALL_GAS_PER_EXTRA_REDEEM, type Hex } from "../../../chain/xo/constants.js";
import { UserOpError, requireUint } from "./encode.js";
import type { PackedUserOp } from "./pack.js";

export interface GasLimits {
  readonly verificationGasLimit: bigint;
  readonly callGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly paymasterVerificationGasLimit: bigint;
  readonly paymasterPostOpGasLimit: bigint;
}

// observed: copied from real operations of this kind. derived: scaled from observed ones. unobserved: no
// real operation of this kind was decoded, so the limits are a generous guess (confidence M or L).
export type GasBasis = "observed" | "derived" | "unobserved";
// defaults: observed values, resized for calldata. estimate: from the bundler. explicit: the caller's final limits.
export type GasSource = "defaults" | "estimate" | "explicit";

export interface GasPlan {
  readonly limits: GasLimits;
  readonly basis: GasBasis;
  readonly source: GasSource;
  readonly notes: readonly string[];
}

export interface GasShape {
  // Number of redeemPositions calls in a redeem operation (default 1).
  readonly redeems?: number;
}

// Ordinary-account verification gas (87,869 in the redeem, split and create examples).
const ORDINARY_VERIFICATION_GAS = GAS_DEFAULTS.redeemOne.verificationGasLimit;
// 62- and 73-call redeem batches landed with 221,170 and 240,214; the larger one is the batch default.
const REDEEM_BATCH_VERIFICATION_GAS = 240_214n;
// Create and accept both mint or register tokens inside the manager; creation measured 977k to 1.06M.
const MANAGER_CALL_GAS = GAS_DEFAULTS.createMarket.callGasLimit;
// Unobserved: approve plus HypFiatToken.transferRemote (burn and dispatch). Free at zero fee.
const WITHDRAW_CALL_GAS = 600_000n;

// preVerificationGas follows the bundle's calldata: 51,195 at 1,125 bytes of handleOps input and about
// 7.5 gas per extra byte (four points, M). A 5% margin covers the points that sat above the line.
export const PRE_VERIFICATION_REFERENCE = Object.freeze({ gas: 51_195n, bytes: 1_125 });
export const PRE_VERIFICATION_MARGIN_PERCENT = 105n;

// An estimate field above this is not believed (a hostile or broken bundler); the defaults are used.
export const MAX_ESTIMATE_GAS_FIELD = 30_000_000n;
// UO5: the estimate's callGasLimit gets 30% on top.
export const ESTIMATE_CALL_GAS_PERCENT = 130n;

const PAYMASTER_VERIFICATION_FLOOR = GAS_DEFAULTS.redeemOne.paymasterVerificationGasLimit;
const PAYMASTER_POST_OP_FLOOR = GAS_DEFAULTS.redeemOne.paymasterPostOpGasLimit;

function plan(limits: GasLimits, basis: GasBasis, notes: readonly string[] = []): GasPlan {
  return { limits: Object.freeze({ ...limits }), basis, source: "defaults", notes };
}

export function defaultGasFor(action: UserOpAction, shape: GasShape = {}): GasPlan {
  switch (action) {
    case "deploy_enable_trading":
      return plan(GAS_DEFAULTS.deployAndEnableTrading, "observed");
    case "enable_trading":
    case "revoke_trading":
      // Already-deployed Enable Trading was not observed; this is the deploy op's call gas on an ordinary
      // account's verification gas (M). Revoke is the same two calls with other arguments.
      return plan(GAS_DEFAULTS.enableTrading, "derived", ["Enable Trading on a deployed account was not observed on chain"]);
    case "redeem": {
      const n = Number(requireUint(shape.redeems ?? 1, "redeems", 16));
      if (n < 1) throw new UserOpError("invalid_input", "a redeem operation has at least one redeem");
      if (n === 1) return plan(GAS_DEFAULTS.redeemOne, "observed");
      const call = GAS_DEFAULTS.redeemOne.callGasLimit + REDEEM_CALL_GAS_PER_EXTRA_REDEEM * BigInt(n - 1) + REDEEM_CALL_GAS_MARGIN;
      return plan(
        { ...GAS_DEFAULTS.redeemOne, verificationGasLimit: REDEEM_BATCH_VERIFICATION_GAS, callGasLimit: call },
        "derived",
        ["Batched redeems: about 35k call gas per extra redeem plus a 100k margin (62- and 73-call batches landed)"],
      );
    }
    case "create_market":
      return plan(GAS_DEFAULTS.createMarket, "observed");
    case "respond_update":
    case "cancel_market":
      return plan(
        { ...GAS_DEFAULTS.redeemOne, verificationGasLimit: ORDINARY_VERIFICATION_GAS, callGasLimit: MANAGER_CALL_GAS },
        "unobserved",
        ["No real respond or cancel operation was decoded; the create-market call gas is used as a ceiling"],
      );
    case "withdraw":
      // No paymaster (the policy refuses transferRemote), so the paymaster limits below are unused.
      return plan(
        { ...GAS_DEFAULTS.redeemOne, verificationGasLimit: ORDINARY_VERIFICATION_GAS, callGasLimit: WITHDRAW_CALL_GAS },
        "unobserved",
        ["The withdrawal path (H1) has never been observed; the limits are a generous guess"],
      );
    default: {
      const unreachable: never = action;
      void unreachable;
      throw new UserOpError("invalid_input", "unknown action");
    }
  }
}

// ---- preVerificationGas from the bundle size ----------------------------------------------------------------

// Length in bytes of handleOps([op], beneficiary) calldata, with a 65-byte placeholder when the operation
// is not signed yet, which is what the signed operation will cost.
export function handleOpsCalldataBytes(op: PackedUserOp): number {
  const signature: Hex = op.signature === "0x" ? (`0x${"00".repeat(65)}` as Hex) : op.signature;
  const data = encodeFunctionData({
    abi: ENTRY_POINT_ABI,
    functionName: "handleOps",
    args: [[{ ...op, signature }], zeroAddress],
  });
  return (data.length - 2) / 2;
}

export function preVerificationGasForBytes(bytes: number): bigint {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new UserOpError("invalid_input", "calldata size must be a non-negative integer");
  const extra = bytes > PRE_VERIFICATION_REFERENCE.bytes ? BigInt(bytes - PRE_VERIFICATION_REFERENCE.bytes) : 0n;
  const { numerator, denominator } = PRE_VERIFICATION_GAS_PER_EXTRA_BYTE;
  const line = PRE_VERIFICATION_REFERENCE.gas + (extra * numerator + denominator - 1n) / denominator;
  return (line * PRE_VERIFICATION_MARGIN_PERCENT + 99n) / 100n;
}

// Raise preVerificationGas to the size-based figure when that is higher. Only observed defaults are
// resized: an estimate priced its own calldata, and explicit limits are final.
export function withSizedPreVerificationGas(current: GasPlan, calldataBytes: number): GasPlan {
  if (current.source !== "defaults") return current;
  const sized = preVerificationGasForBytes(calldataBytes);
  if (sized <= current.limits.preVerificationGas) return current;
  return { ...current, limits: Object.freeze({ ...current.limits, preVerificationGas: sized }) };
}

// Limits the caller has decided on (for example to rebuild a known operation exactly). Never resized.
export function explicitGas(limits: GasLimits, basis: GasBasis = "unobserved", notes: readonly string[] = []): GasPlan {
  for (const [name, value] of Object.entries(limits)) requireUint(value, name, 128);
  return { limits: Object.freeze({ ...limits }), basis, source: "explicit", notes };
}

// ---- bundler estimate ----------------------------------------------------------------------------------------------

export interface GasEstimate {
  readonly preVerificationGas: bigint;
  readonly verificationGasLimit: bigint;
  readonly callGasLimit: bigint;
  readonly paymasterVerificationGasLimit?: bigint;
  readonly paymasterPostOpGasLimit?: bigint;
}

export interface ApplyEstimateOptions {
  // The capability `bundler.estimate` is known to be supported AND the operator allows using it.
  readonly allow: boolean;
}

function believable(value: unknown): value is bigint {
  return typeof value === "bigint" && value > 0n && value <= MAX_ESTIMATE_GAS_FIELD;
}

// UO5 / [21 V4.1]. With an allowed, believable estimate: verification and preVerification as estimated,
// callGasLimit +30%, paymaster limits as estimated but never below the observed floors. Otherwise the
// plan is returned unchanged (with a note when an estimate was offered and refused).
export function applyBundlerEstimate(base: GasPlan, estimate: GasEstimate | null | undefined, options: ApplyEstimateOptions): GasPlan {
  if (estimate === null || estimate === undefined || !options.allow) return base;
  if (!believable(estimate.verificationGasLimit) || !believable(estimate.callGasLimit) || !believable(estimate.preVerificationGas)) {
    return { ...base, notes: [...base.notes, "The bundler estimate was out of range and was ignored"] };
  }
  const pmVerification = estimate.paymasterVerificationGasLimit;
  const pmPostOp = estimate.paymasterPostOpGasLimit;
  if ((pmVerification !== undefined && !believable(pmVerification)) || (pmPostOp !== undefined && !believable(pmPostOp))) {
    return { ...base, notes: [...base.notes, "The bundler estimate was out of range and was ignored"] };
  }
  const bigger = (a: bigint, b: bigint): bigint => (a > b ? a : b);
  return {
    limits: Object.freeze({
      verificationGasLimit: estimate.verificationGasLimit,
      callGasLimit: (estimate.callGasLimit * ESTIMATE_CALL_GAS_PERCENT + 99n) / 100n,
      preVerificationGas: estimate.preVerificationGas,
      paymasterVerificationGasLimit: bigger(pmVerification ?? 0n, PAYMASTER_VERIFICATION_FLOOR),
      paymasterPostOpGasLimit: bigger(pmPostOp ?? 0n, PAYMASTER_POST_OP_FLOOR),
    }),
    basis: base.basis,
    source: "estimate",
    notes: [...base.notes, "Limits come from the bundler's estimate (+30% call gas)"],
  };
}
