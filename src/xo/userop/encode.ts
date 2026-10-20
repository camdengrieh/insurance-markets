// ERC-7579 execution encoding for XO's Kernel v3.1 accounts, plus the small validation helpers and
// the error type the other userop modules share.
//
//   execute(bytes32 execMode, bytes executionCalldata)            selector 0xe9ae5c53
//     single: execMode 0x00..00, executionCalldata = target (20) ++ value (32) ++ data
//     batch:  execMode 0x01 then zeros, executionCalldata = abi.encode((address target, uint256 value, bytes callData)[])
//
// Source: docs/research/21-userop-templates.md section 3 (22 real operations decoded and re-encoded
// byte for byte; 158 of 158 golden checks) and docs/phase1-gap-closing.md section 2.1 row `execute`.
// Pure functions: no clock, no network, no key. Nothing here decides WHICH calls are allowed; that is
// calls.ts. This file only makes sure the bytes are exactly what the account will decode.

import { concat, decodeAbiParameters, encodeAbiParameters, encodeFunctionData, isHex, pad, size, slice, toHex } from "viem";

import { parseAddress } from "../account/derive.js";
import { KERNEL_ABI } from "../chain/abi.js";
import { EXEC_MODE_BATCH, EXEC_MODE_SINGLE, EXECUTE_SELECTOR, type Address, type Hex } from "../chain/constants.js";

// Codes are plain strings. Where one means the same thing as a relay error code (src/relay/errors.ts)
// it uses the same spelling (owner_mismatch, signature_invalid), so the relay can map them directly.
export type UserOpErrorCode =
  | "invalid_address" // not a strict EIP-55 (or all-lower-case) 20-byte address
  | "invalid_hex" // not even-length 0x hex, or the wrong byte length
  | "invalid_integer" // out of range for the field
  | "invalid_call" // an empty or oversized call list, or a call field out of shape
  | "invalid_calldata" // execute calldata that does not decode, or is not the canonical encoding
  | "unsupported_mode" // execution mode other than single / batch with revert-on-failure
  | "invalid_nonce" // a nonce outside the lane this plugin uses
  | "invalid_userop" // a packed operation that is not shaped like the ones XO's stack accepts
  | "forbidden_call" // a call that is not on the closed list in calls.ts
  | "sponsorship_refused" // the paymaster policy would refuse this operation
  | "sender_mismatch" // sender is not the account derived from the owner
  | "owner_mismatch" // the signature recovers to someone other than the owner
  | "signature_invalid" // malformed signature
  | "invalid_input"; // anything else the caller got wrong

export class UserOpError extends Error {
  readonly code: UserOpErrorCode;
  constructor(code: UserOpErrorCode, message: string) {
    super(message);
    this.name = "UserOpError";
    this.code = code;
  }
}

// ---- validation helpers (shared by every userop module) ----------------------------------------

export function requireAddress(value: unknown, label: string): Address {
  try {
    return parseAddress(value);
  } catch {
    throw new UserOpError("invalid_address", `${label} is not a valid EIP-55 address`);
  }
}

// Returns lower-case hex. With `bytes`, the length must match exactly.
export function requireHex(value: unknown, label: string, options: { bytes?: number } = {}): Hex {
  if (typeof value !== "string" || !isHex(value, { strict: true }) || value.length % 2 !== 0) {
    throw new UserOpError("invalid_hex", `${label} must be even-length 0x hex`);
  }
  const lower = value.toLowerCase() as Hex;
  if (options.bytes !== undefined && size(lower) !== options.bytes) {
    throw new UserOpError("invalid_hex", `${label} must be ${options.bytes} bytes, got ${size(lower)}`);
  }
  return lower;
}

// Integers are bigint (or a safe-integer number). A float, a NaN or a negative value is refused.
export function requireUint(value: unknown, label: string, bits: number): bigint {
  let n: bigint;
  if (typeof value === "bigint") n = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) n = BigInt(value);
  else throw new UserOpError("invalid_integer", `${label} must be an integer`);
  if (n < 0n || n >= 1n << BigInt(bits)) {
    throw new UserOpError("invalid_integer", `${label} is outside the uint${bits} range`);
  }
  return n;
}

// ---- calls ---------------------------------------------------------------------------------------

export interface Call {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
}

// A hard structural ceiling, not a policy: the 73-call redeem batches XO's own bots send land, and the
// relay caps redeems at 50 (MAX_REDEEMS_PER_OP) long before this.
export const MAX_CALLS_PER_OP = 128;

export function normalizeCall(call: Call, label = "call"): Call {
  if (typeof call !== "object" || call === null) throw new UserOpError("invalid_call", `${label} must be an object`);
  return {
    to: requireAddress(call.to, `${label}.to`),
    value: requireUint(call.value, `${label}.value`, 256),
    data: requireHex(call.data, `${label}.data`),
  };
}

const be32 = (n: bigint): Hex => pad(toHex(n), { size: 32 });

export function encodeExecuteSingle(call: Call): Hex {
  const c = normalizeCall(call);
  const executionCalldata = concat([c.to.toLowerCase() as Hex, be32(c.value), c.data]);
  return encodeFunctionData({ abi: KERNEL_ABI, functionName: "execute", args: [EXEC_MODE_SINGLE, executionCalldata] }).toLowerCase() as Hex;
}

export function encodeExecuteBatch(calls: readonly Call[]): Hex {
  const normalized = checkedList(calls).map((call, index) => normalizeCall(call, `calls[${index}]`));
  const executionCalldata = encodeAbiParameters(
    [{ type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "callData", type: "bytes" }] }],
    [normalized.map((c) => ({ target: c.to, value: c.value, callData: c.data }))],
  );
  return encodeFunctionData({ abi: KERNEL_ABI, functionName: "execute", args: [EXEC_MODE_BATCH, executionCalldata] }).toLowerCase() as Hex;
}

// One call -> single mode, several -> batch mode, exactly as XO's app does it.
export function encodeExecute(calls: readonly Call[]): Hex {
  const list = checkedList(calls);
  return list.length === 1 ? encodeExecuteSingle(list[0] as Call) : encodeExecuteBatch(list);
}

function checkedList(calls: readonly Call[]): readonly Call[] {
  if (!Array.isArray(calls) || calls.length === 0) throw new UserOpError("invalid_call", "a user operation needs at least one call");
  if (calls.length > MAX_CALLS_PER_OP) throw new UserOpError("invalid_call", `at most ${MAX_CALLS_PER_OP} calls per user operation`);
  return calls;
}

export type ExecuteMode = "single" | "batch";

export interface DecodedExecute {
  readonly mode: ExecuteMode;
  readonly calls: readonly Call[];
}

// Strict inverse of encodeExecute. Only the two modes XO uses decode (execType 0 = revert on failure,
// no selector, no payload), so a try-mode or delegatecall payload is refused, and the result must
// re-encode to exactly the input: trailing bytes or non-canonical ABI padding are refused too. The
// relay uses this to re-check stored callData against the calls it believes it is signing.
export function decodeExecute(callData: unknown): DecodedExecute {
  const input = requireHex(callData, "callData");
  if (input.slice(0, 10) !== EXECUTE_SELECTOR) throw new UserOpError("invalid_calldata", "callData is not Kernel execute(bytes32,bytes)");
  let mode: Hex;
  let executionCalldata: Hex;
  try {
    [mode, executionCalldata] = decodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }], `0x${input.slice(10)}`) as [Hex, Hex];
  } catch {
    throw new UserOpError("invalid_calldata", "callData does not decode as execute(bytes32,bytes)");
  }
  let result: DecodedExecute;
  if (mode.toLowerCase() === EXEC_MODE_SINGLE) {
    if (size(executionCalldata) < 52) throw new UserOpError("invalid_calldata", "single-mode payload is shorter than target and value");
    result = {
      mode: "single",
      calls: [
        {
          to: requireAddress(slice(executionCalldata, 0, 20), "target"),
          value: BigInt(slice(executionCalldata, 20, 52)),
          data: (size(executionCalldata) === 52 ? "0x" : slice(executionCalldata, 52)).toLowerCase() as Hex,
        },
      ],
    };
  } else if (mode.toLowerCase() === EXEC_MODE_BATCH) {
    let decoded: readonly { target: Address; value: bigint; callData: Hex }[];
    try {
      [decoded] = decodeAbiParameters(
        [{ type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "callData", type: "bytes" }] }],
        executionCalldata,
      ) as [readonly { target: Address; value: bigint; callData: Hex }[]];
    } catch {
      throw new UserOpError("invalid_calldata", "batch payload does not decode as (address,uint256,bytes)[]");
    }
    result = { mode: "batch", calls: decoded.map((c) => ({ to: requireAddress(c.target, "target"), value: c.value, data: c.callData.toLowerCase() as Hex })) };
  } else {
    throw new UserOpError("unsupported_mode", "only the single and batch revert-on-failure execution modes are accepted");
  }
  if (result.calls.length === 0 || result.calls.length > MAX_CALLS_PER_OP) {
    throw new UserOpError("invalid_calldata", "the call list is empty or too long");
  }
  const again = result.mode === "single" ? encodeExecuteSingle(result.calls[0] as Call) : encodeExecuteBatch(result.calls);
  if (again !== input) throw new UserOpError("invalid_calldata", "callData is not the canonical encoding of its calls");
  return result;
}
