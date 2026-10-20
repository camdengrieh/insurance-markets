// The harness's OWN ERC-4337 v0.7 helpers: packing, hashing, call encoding, signing and malleation.
// Written from the spec (docs/phase1-gap-closing.md section 2.1 and docs/research/21) and checked
// against the real EntryPoint's getUserOpHash and against viem's getUserOperationHash in
// test/anvil-harness.test.ts. It deliberately does not import the production UserOp library
// (src/xo/userop/*, written in parallel): the harness is the independent party that library is
// tested against, so it must not share its mistakes.
//
// Everything here is test tooling. The keys are the well-known public Anvil/Hardhat TEST keys.

import {
  concat,
  decodeErrorResult,
  encodeAbiParameters,
  hashMessage,
  keccak256,
  pad,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";

import { ECDSA_VALIDATOR, EXEC_MODE_BATCH, EXEC_MODE_SINGLE } from "../../src/xo/chain/constants.js";

// ---- the packed operation ----------------------------------------------------------------------------

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

export interface PaymasterParts {
  readonly address: Address;
  readonly verificationGasLimit: bigint;
  readonly postOpGasLimit: bigint;
  readonly data?: Hex;
}

export interface UserOpParts {
  readonly sender: Address;
  readonly nonce: bigint;
  readonly initCode?: Hex;
  readonly callData: Hex;
  readonly verificationGasLimit: bigint;
  readonly callGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly maxPriorityFeePerGas?: bigint;
  readonly maxFeePerGas?: bigint;
  readonly paymaster?: PaymasterParts;
  readonly signature?: Hex;
}

const word16 = (value: bigint): Hex => pad(toHex(value), { size: 16 });

// verificationGasLimit in the high 16 bytes, callGasLimit in the low 16.
export function accountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
  return concat([word16(verificationGasLimit), word16(callGasLimit)]);
}

// maxPriorityFeePerGas in the high 16 bytes, maxFeePerGas in the low 16 (ERC-4337 v0.7 definition).
export function gasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
  return concat([word16(maxPriorityFeePerGas), word16(maxFeePerGas)]);
}

// paymaster (20) + paymasterVerificationGasLimit (16) + paymasterPostOpGasLimit (16) + paymasterData.
export function paymasterAndData(paymaster: PaymasterParts | undefined): Hex {
  if (paymaster === undefined) return "0x";
  return concat([paymaster.address, word16(paymaster.verificationGasLimit), word16(paymaster.postOpGasLimit), paymaster.data ?? "0x"]);
}

export function packUserOp(parts: UserOpParts): PackedUserOp {
  return {
    sender: parts.sender,
    nonce: parts.nonce,
    initCode: parts.initCode ?? "0x",
    callData: parts.callData,
    accountGasLimits: accountGasLimits(parts.verificationGasLimit, parts.callGasLimit),
    preVerificationGas: parts.preVerificationGas,
    gasFees: gasFees(parts.maxPriorityFeePerGas ?? 0n, parts.maxFeePerGas ?? 0n),
    paymasterAndData: paymasterAndData(parts.paymaster),
    signature: parts.signature ?? "0x",
  };
}

export function withSignature(op: PackedUserOp, signature: Hex): PackedUserOp {
  return { ...op, signature };
}

// keccak(abi.encode(keccak(abi.encode(sender, nonce, keccak(initCode), keccak(callData),
//   accountGasLimits, preVerificationGas, gasFees, keccak(paymasterAndData))), entryPoint, chainId)).
// The signature is not part of the hash.
export function userOpHash(op: PackedUserOp, context: { readonly entryPoint: Address; readonly chainId: number }): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData), op.accountGasLimits, op.preVerificationGas, op.gasFees, keccak256(op.paymasterAndData)],
    ),
  );
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], [inner, context.entryPoint, BigInt(context.chainId)]));
}

// ---- Kernel nonce and execute --------------------------------------------------------------------------

// Kernel v3 nonce, 32 bytes: mode 0x00 | type 0x00 (root) | validator (20) | key (2) | sequence (8).
export function kernelNonce(options: { readonly sequence?: bigint; readonly key?: number; readonly validator?: Address } = {}): bigint {
  const validator = BigInt(options.validator ?? ECDSA_VALIDATOR);
  const key = BigInt(options.key ?? 0);
  if (key < 0n || key > 0xffffn) throw new Error("nonce key is 2 bytes");
  return (validator << 80n) | (key << 64n) | (options.sequence ?? 0n);
}

// EntryPoint.getNonce(sender, key) takes the upper 192 bits of the nonce.
export function entryPointNonceKey(nonce: bigint): bigint {
  return nonce >> 64n;
}

export interface Call {
  readonly target: Address;
  readonly value?: bigint;
  readonly data: Hex;
}

const EXECUTE_ABI = parseAbi(["function execute(bytes32 execMode, bytes executionCalldata)"]);
const EXECUTION_TUPLES = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "callData", type: "bytes" },
    ],
  },
] as const;

// ERC-7579 execute(bytes32,bytes), as Kernel v3.1 reads it. One call: single mode, the payload is
// target (20) ++ value (32) ++ data. Several: batch mode, the payload is abi.encode(Execution[]).
export function encodeExecute(calls: readonly Call[], mode?: Hex): Hex {
  if (calls.length === 0) throw new Error("no calls");
  const only = calls[0];
  if (calls.length === 1 && only !== undefined) {
    const payload = concat([only.target, pad(toHex(only.value ?? 0n), { size: 32 }), only.data]);
    return encodeExecuteRaw(mode ?? EXEC_MODE_SINGLE, payload);
  }
  const payload = encodeAbiParameters(EXECUTION_TUPLES, [calls.map((call) => ({ target: call.target, value: call.value ?? 0n, callData: call.data }))]);
  return encodeExecuteRaw(mode ?? EXEC_MODE_BATCH, payload);
}

export function encodeExecuteRaw(mode: Hex, executionCalldata: Hex): Hex {
  return concat(["0xe9ae5c53", encodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }], [mode, executionCalldata])]);
}

export { EXECUTE_ABI };

// ---- signing digests and signatures ------------------------------------------------------------------------

export interface SigningDigests {
  readonly raw: Hex;
  readonly eip191: Hex;
}

// The two digests the deployed validator accepts for a UserOp hash H: H itself, and the EIP-191
// personal_sign hash of the 32 raw bytes of H (what XO's own app signs, docs/research/21 sec 5).
export function signingDigests(hash: Hex): SigningDigests {
  return { raw: hash, eip191: hashMessage({ raw: hash }) };
}

export interface SigningAccount {
  readonly address: Address;
  sign(parameters: { hash: Hex }): Promise<Hex>;
  signMessage(parameters: { message: { raw: Hex } }): Promise<Hex>;
}

export function signRaw(account: SigningAccount, hash: Hex): Promise<Hex> {
  return account.sign({ hash });
}

export function signEip191(account: SigningAccount, hash: Hex): Promise<Hex> {
  return account.signMessage({ message: { raw: hash } });
}

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export interface SignatureParts {
  readonly r: bigint;
  readonly s: bigint;
  readonly v: number;
}

export function splitSignature(signature: Hex): SignatureParts {
  if (signature.length !== 2 + 130) throw new Error("not a 65-byte signature");
  return {
    r: BigInt(`0x${signature.slice(2, 66)}`),
    s: BigInt(`0x${signature.slice(66, 130)}`),
    v: Number.parseInt(signature.slice(130, 132), 16),
  };
}

export function joinSignature(parts: SignatureParts): Hex {
  const word = (value: bigint): string => value.toString(16).padStart(64, "0");
  return `0x${word(parts.r)}${word(parts.s)}${parts.v.toString(16).padStart(2, "0")}` as Hex;
}

// The same signature with the recovery byte replaced (0 or 1 for the "parity" spelling).
export function withV(signature: Hex, v: number): Hex {
  return joinSignature({ ...splitSignature(signature), v });
}

// The malleated twin: s -> n - s with the recovery parity flipped. It recovers the same signer under
// plain ecrecover, so whether a verifier accepts it is a property of that verifier.
export function malleate(signature: Hex): Hex {
  const parts = splitSignature(signature);
  return joinSignature({ r: parts.r, s: N - parts.s, v: parts.v === 27 ? 28 : 27 });
}

// Flips one bit of the byte at `byteIndex` (0 to 64).
export function flipByte(signature: Hex, byteIndex: number): Hex {
  const bytes = signature.slice(2).match(/../g) ?? [];
  const original = Number.parseInt(bytes[byteIndex] ?? "00", 16);
  bytes[byteIndex] = (original ^ 0x01).toString(16).padStart(2, "0");
  return `0x${bytes.join("")}` as Hex;
}

// ---- EntryPoint errors ----------------------------------------------------------------------------------------

export const ENTRY_POINT_ERRORS_ABI = parseAbi([
  "error FailedOp(uint256 opIndex, string reason)",
  "error FailedOpWithRevert(uint256 opIndex, string reason, bytes inner)",
  "error SignatureValidationFailed(address aggregator)",
  "error PostOpReverted(bytes returnData)",
  "error DelegateAndRevert(bool success, bytes ret)",
]);

export interface EntryPointError {
  readonly name: string;
  readonly opIndex?: bigint;
  // The AAxx code at the start of the reason, when there is one.
  readonly code?: string;
  readonly reason?: string;
  readonly inner?: Hex;
  readonly raw: Hex;
}

export function decodeEntryPointError(data: Hex | undefined): EntryPointError {
  if (data === undefined || data === "0x") return { name: "EmptyRevert", raw: "0x" };
  try {
    const decoded = decodeErrorResult({ abi: ENTRY_POINT_ERRORS_ABI, data });
    if (decoded.errorName === "FailedOp") {
      const [opIndex, reason] = decoded.args as readonly [bigint, string];
      return { name: "FailedOp", opIndex, reason, code: /^AA\d\d/.exec(reason)?.[0], raw: data };
    }
    if (decoded.errorName === "FailedOpWithRevert") {
      const [opIndex, reason, inner] = decoded.args as readonly [bigint, string, Hex];
      return { name: "FailedOpWithRevert", opIndex, reason, inner, code: /^AA\d\d/.exec(reason)?.[0], raw: data };
    }
    return { name: decoded.errorName, raw: data };
  } catch {
    return { name: "Unknown", raw: data };
  }
}
