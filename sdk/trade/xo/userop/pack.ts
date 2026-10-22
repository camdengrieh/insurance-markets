// ERC-4337 v0.7 packed UserOperation: from semantic (unpacked) fields to the on-chain form, and back.
//
//   accountGasLimits = verificationGasLimit (high 16 bytes) ++ callGasLimit (low 16 bytes)
//   gasFees          = maxPriorityFeePerGas (high 16 bytes) ++ maxFeePerGas (low 16 bytes)
//   paymasterAndData = paymaster (20) ++ paymasterVerificationGasLimit (16) ++ paymasterPostOpGasLimit (16)
//                      with EMPTY paymasterData (52 bytes), or 0x for no paymaster
//   initCode         = 0x once the account exists; the first operation carries factory ++ createAccount(...)
//
// Source: docs/research/21-userop-templates.md sections 3 and 5 (22 real operations rebuilt byte for
// byte) and docs/phase1-gap-closing.md section 2.1. Fees default to zero (236 of 236 observed). The
// paymaster is the pinned PolicyPaymaster only: the string in the researcher's template builder had a bad
// checksum, so the address comes from sdk/chain/xo/constants.ts.
//
// Two layers of checking, on purpose:
//   assertPackedStructure  hex shapes and lengths only; enough to hash, so a one-byte mutation anywhere in an
//                          otherwise well-formed operation still hashes (to a different value);
//   assertXoShape          the shapes XO's stack accepts (pinned factory and paymaster, 65-byte signature);
//                          required before anything is signed or sent.

import { concat, getAddress, numberToHex, pad, size, slice } from "viem";

import {
  EXECUTE_SELECTOR,
  FACTORY_CREATE_ACCOUNT_SELECTOR,
  KERNEL_FACTORY,
  PAYMASTER_AND_DATA_BYTES,
  POLICY_PAYMASTER,
  USEROP_INIT_CODE_BYTES,
  USEROP_SIGNATURE_BYTES,
  type Address,
  type Hex,
} from "../../../chain/xo/constants.js";
import { UserOpError, requireAddress, requireHex, requireUint } from "./encode.js";

export interface PaymasterFields {
  readonly address: Address;
  readonly verificationGasLimit: bigint;
  readonly postOpGasLimit: bigint;
}

export interface UserOpFields {
  readonly sender: Address;
  readonly nonce: bigint;
  readonly initCode: Hex;
  readonly callData: Hex;
  readonly verificationGasLimit: bigint;
  readonly callGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly maxFeePerGas: bigint;
  // null = no paymaster (paymasterAndData = 0x).
  readonly paymaster: PaymasterFields | null;
  // Default 0x (unsigned).
  readonly signature?: Hex;
}

export interface PackedUserOp {
  readonly sender: Address;
  readonly nonce: bigint;
  readonly initCode: Hex;
  readonly callData: Hex;
  readonly accountGasLimits: Hex;
  readonly preVerificationGas: bigint;
  readonly gasFees: Hex;
  readonly paymasterAndData: Hex;
  readonly signature: Hex;
}

// ---- gas words ---------------------------------------------------------------------------------------

export function packGasPair(high: bigint, low: bigint): Hex {
  const h = requireUint(high, "high gas half", 128);
  const l = requireUint(low, "low gas half", 128);
  return concat([pad(numberToHex(h), { size: 16 }), pad(numberToHex(l), { size: 16 })]);
}

export function unpackGasPair(word: unknown): readonly [bigint, bigint] {
  const hex = requireHex(word, "gas word", { bytes: 32 });
  return [BigInt(slice(hex, 0, 16)), BigInt(slice(hex, 16, 32))];
}

// ---- paymasterAndData --------------------------------------------------------------------------------

export function packPaymasterAndData(paymaster: PaymasterFields | null): Hex {
  if (paymaster === null) return "0x";
  const address = requireAddress(paymaster.address, "paymaster");
  if (address !== POLICY_PAYMASTER) throw new UserOpError("sponsorship_refused", "only the pinned PolicyPaymaster may sponsor an operation");
  return concat([
    address.toLowerCase() as Hex,
    pad(numberToHex(requireUint(paymaster.verificationGasLimit, "paymasterVerificationGasLimit", 128)), { size: 16 }),
    pad(numberToHex(requireUint(paymaster.postOpGasLimit, "paymasterPostOpGasLimit", 128)), { size: 16 }),
  ]);
}

export function unpackPaymasterAndData(data: unknown): PaymasterFields | null {
  const hex = requireHex(data, "paymasterAndData");
  if (hex === "0x") return null;
  if (size(hex) !== PAYMASTER_AND_DATA_BYTES) {
    throw new UserOpError("invalid_userop", `paymasterAndData must be ${PAYMASTER_AND_DATA_BYTES} bytes (empty paymasterData) or 0x`);
  }
  return {
    address: getAddress(slice(hex, 0, 20)),
    verificationGasLimit: BigInt(slice(hex, 20, 36)),
    postOpGasLimit: BigInt(slice(hex, 36, 52)),
  };
}

// ---- pack / unpack ---------------------------------------------------------------------------------------

export function packUserOp(fields: UserOpFields): PackedUserOp {
  const packed: PackedUserOp = {
    sender: requireAddress(fields.sender, "sender"),
    nonce: requireUint(fields.nonce, "nonce", 256),
    initCode: requireHex(fields.initCode, "initCode"),
    callData: requireHex(fields.callData, "callData"),
    accountGasLimits: packGasPair(fields.verificationGasLimit, fields.callGasLimit),
    preVerificationGas: requireUint(fields.preVerificationGas, "preVerificationGas", 256),
    gasFees: packGasPair(fields.maxPriorityFeePerGas, fields.maxFeePerGas),
    paymasterAndData: packPaymasterAndData(fields.paymaster),
    signature: requireHex(fields.signature ?? "0x", "signature"),
  };
  assertXoShape(packed);
  return packed;
}

export function unpackUserOp(op: PackedUserOp): UserOpFields {
  const checked = assertPackedStructure(op);
  const [verificationGasLimit, callGasLimit] = unpackGasPair(checked.accountGasLimits);
  const [maxPriorityFeePerGas, maxFeePerGas] = unpackGasPair(checked.gasFees);
  return {
    sender: checked.sender,
    nonce: checked.nonce,
    initCode: checked.initCode,
    callData: checked.callData,
    verificationGasLimit,
    callGasLimit,
    preVerificationGas: checked.preVerificationGas,
    maxPriorityFeePerGas,
    maxFeePerGas,
    paymaster: unpackPaymasterAndData(checked.paymasterAndData),
    signature: checked.signature,
  };
}

// ---- checks ---------------------------------------------------------------------------------------------

// Hex shapes and lengths, nothing about XO. Returns a normalised copy (checksummed sender, lower-case hex).
export function assertPackedStructure(op: PackedUserOp): PackedUserOp {
  if (typeof op !== "object" || op === null) throw new UserOpError("invalid_userop", "a packed user operation is an object");
  return {
    sender: requireAddress(op.sender, "sender"),
    nonce: requireUint(op.nonce, "nonce", 256),
    initCode: requireHex(op.initCode, "initCode"),
    callData: requireHex(op.callData, "callData"),
    accountGasLimits: requireHex(op.accountGasLimits, "accountGasLimits", { bytes: 32 }),
    preVerificationGas: requireUint(op.preVerificationGas, "preVerificationGas", 256),
    gasFees: requireHex(op.gasFees, "gasFees", { bytes: 32 }),
    paymasterAndData: requireHex(op.paymasterAndData, "paymasterAndData"),
    signature: requireHex(op.signature, "signature"),
  };
}

// The shapes XO's stack accepts. Throws `invalid_userop` (or `sponsorship_refused` for a foreign
// paymaster). A first operation carries exactly the 440-byte factory call; every other operation none.
export function assertXoShape(op: PackedUserOp): PackedUserOp {
  const checked = assertPackedStructure(op);
  if (checked.initCode !== "0x") {
    if (size(checked.initCode) !== USEROP_INIT_CODE_BYTES) throw new UserOpError("invalid_userop", `initCode must be 0x or ${USEROP_INIT_CODE_BYTES} bytes`);
    if (slice(checked.initCode, 0, 20) !== KERNEL_FACTORY.toLowerCase()) throw new UserOpError("invalid_userop", "initCode names a factory other than the pinned KernelFactory");
    if (slice(checked.initCode, 20, 24) !== FACTORY_CREATE_ACCOUNT_SELECTOR) throw new UserOpError("invalid_userop", "initCode does not call createAccount");
  }
  if (size(checked.callData) < 4 || slice(checked.callData, 0, 4) !== EXECUTE_SELECTOR) {
    throw new UserOpError("invalid_userop", "callData must be Kernel execute(bytes32,bytes)");
  }
  const paymaster = unpackPaymasterAndData(checked.paymasterAndData);
  if (paymaster !== null && paymaster.address !== POLICY_PAYMASTER) {
    throw new UserOpError("sponsorship_refused", "only the pinned PolicyPaymaster may sponsor an operation");
  }
  if (checked.signature !== "0x" && size(checked.signature) !== USEROP_SIGNATURE_BYTES) {
    throw new UserOpError("invalid_userop", `signature must be 0x or ${USEROP_SIGNATURE_BYTES} bytes`);
  }
  return checked;
}

// A copy of `op` with a signature (the caller has already verified it; see verify.ts).
export function withSignature(op: PackedUserOp, signature: Hex): PackedUserOp {
  return assertXoShape({ ...op, signature });
}

// ---- JSON form for a store ----------------------------------------------------------------------------------

// bigint fields become decimal strings; everything else is already a string. This is what the relay
// persists with a prepared item, so submit can rebuild the exact operation and recompute its hash.
export interface PackedUserOpJson {
  readonly sender: string;
  readonly nonce: string;
  readonly initCode: string;
  readonly callData: string;
  readonly accountGasLimits: string;
  readonly preVerificationGas: string;
  readonly gasFees: string;
  readonly paymasterAndData: string;
  readonly signature: string;
}

export function packedToJson(op: PackedUserOp): PackedUserOpJson {
  const c = assertPackedStructure(op);
  return {
    sender: c.sender,
    nonce: c.nonce.toString(10),
    initCode: c.initCode,
    callData: c.callData,
    accountGasLimits: c.accountGasLimits,
    preVerificationGas: c.preVerificationGas.toString(10),
    gasFees: c.gasFees,
    paymasterAndData: c.paymasterAndData,
    signature: c.signature,
  };
}

const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;

function decimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new UserOpError("invalid_integer", `${label} must be a decimal string`);
  return BigInt(value);
}

export function packedFromJson(json: PackedUserOpJson): PackedUserOp {
  if (typeof json !== "object" || json === null) throw new UserOpError("invalid_userop", "a stored user operation is an object");
  return assertXoShape({
    sender: json.sender as Address,
    nonce: decimal(json.nonce, "nonce"),
    initCode: json.initCode as Hex,
    callData: json.callData as Hex,
    accountGasLimits: json.accountGasLimits as Hex,
    preVerificationGas: decimal(json.preVerificationGas, "preVerificationGas"),
    gasFees: json.gasFees as Hex,
    paymasterAndData: json.paymasterAndData as Hex,
    signature: json.signature as Hex,
  });
}
