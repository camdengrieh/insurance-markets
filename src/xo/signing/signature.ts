import { concatHex, getAddress, type Address, type Hex } from "viem";

import { KERNEL_ECDSA_VALIDATOR_ADDRESS, SECP256K1_HALF_N, SECP256K1_N } from "./constants.js";
import { SigningError } from "./errors.js";

// Which prefix goes in front of the 65-byte ECDSA signature:
//   kernel-validator-0x01: 0x01 || validator(20) || ecdsa(65), 86 bytes. Documented by XO.
//   kernel-root-0x00:      0x00 || ecdsa(65), 66 bytes. Kernel v3.1 accepts it (root validator)
//                          and one community client sends it, but XO does not document it.
// Which one the live gateway accepts is an open question, so the documented form is the default
// everywhere and the other must be chosen by name.
export type WireSignatureForm = "kernel-validator-0x01" | "kernel-root-0x00";

export const DEFAULT_WIRE_SIGNATURE_FORM: WireSignatureForm = "kernel-validator-0x01";

export const ECDSA_SIGNATURE_BYTES = 65;
export const WIRE_SIGNATURE_BYTES = 86;
export const ROOT_WIRE_SIGNATURE_BYTES = 66;

export type Ecdsa65 = { r: bigint; s: bigint; v: 27 | 28 };

// Splits and validates r||s||v. v may arrive as 0/1 (parity) or 27/28 and is normalised to 27/28
// (the Kernel validator feeds v to ecrecover unchanged). High-s is refused: libraries never
// produce it, so it signals a malleated or hand-built signature.
export function decodeEcdsaSignature(signature: unknown): Ecdsa65 {
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]*$/.test(signature)) {
    throw new SigningError("invalid_hex", "ECDSA signature must be 0x-prefixed hex");
  }
  if (signature.length !== 2 + 2 * ECDSA_SIGNATURE_BYTES) {
    throw new SigningError(
      "invalid_signature_length",
      `ECDSA signature must be ${ECDSA_SIGNATURE_BYTES} bytes, got ${(signature.length - 2) / 2}`,
    );
  }
  const r = BigInt(`0x${signature.slice(2, 66)}`);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const rawV = Number.parseInt(signature.slice(130, 132), 16);
  if (rawV !== 0 && rawV !== 1 && rawV !== 27 && rawV !== 28) {
    throw new SigningError("invalid_signature_v", `ECDSA recovery byte must be 0, 1, 27 or 28, got ${rawV}`);
  }
  if (r === 0n || r >= SECP256K1_N || s === 0n || s >= SECP256K1_N) {
    throw new SigningError("invalid_signature_value", "ECDSA r and s must be in [1, n)");
  }
  if (s > SECP256K1_HALF_N) {
    throw new SigningError("high_s_signature", "ECDSA s is in the upper half of the curve order (malleable form)");
  }
  return { r, s, v: rawV >= 27 ? (rawV as 27 | 28) : ((rawV + 27) as 27 | 28) };
}

export function encodeEcdsaSignature(sig: Ecdsa65): Hex {
  const word = (n: bigint) => n.toString(16).padStart(64, "0");
  return `0x${word(sig.r)}${word(sig.s)}${sig.v.toString(16)}` as Hex;
}

// Validates and canonicalises (v to 27/28, lower-case) a 65-byte signature.
export function normalizeEcdsaSignature(signature: unknown): Hex {
  return encodeEcdsaSignature(decodeEcdsaSignature(signature));
}

export type AssembleOptions = { form?: WireSignatureForm };

export function assembleWireSignature(ecdsa: Hex, options: AssembleOptions = {}): Hex {
  const canonical = normalizeEcdsaSignature(ecdsa);
  const form = options.form ?? DEFAULT_WIRE_SIGNATURE_FORM;
  switch (form) {
    case "kernel-validator-0x01":
      return concatHex(["0x01", KERNEL_ECDSA_VALIDATOR_ADDRESS.toLowerCase() as Hex, canonical]);
    case "kernel-root-0x00":
      return concatHex(["0x00", canonical]);
    default: {
      const unreachable: never = form;
      throw new SigningError("invalid_signature_prefix", `unknown wire signature form ${String(unreachable)}`);
    }
  }
}

export type ParsedWireSignature = {
  form: WireSignatureForm;
  validator: Address | null;
  // Canonical 65-byte r||s||v.
  ecdsa: Hex;
  // The full wire string rebuilt from the canonical parts: lower-case, v of 27 or 28, the pinned
  // validator. Send this, never the caller's spelling, which may carry parity v or upper-case hex.
  canonicalWire: Hex;
};

export type ParseOptions = {
  // Defaults to only the documented form.
  allowedForms?: readonly WireSignatureForm[];
};

export function parseWireSignature(signature: unknown, options: ParseOptions = {}): ParsedWireSignature {
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]*$/.test(signature) || signature.length % 2 !== 0) {
    throw new SigningError("invalid_hex", "wire signature must be 0x-prefixed hex with an even length");
  }
  const allowed = options.allowedForms ?? [DEFAULT_WIRE_SIGNATURE_FORM];
  const byteLength = (signature.length - 2) / 2;
  const prefix = signature.slice(2, 4).toLowerCase();

  if (prefix === "01") {
    if (!allowed.includes("kernel-validator-0x01")) {
      throw new SigningError("invalid_signature_prefix", "0x01 signature prefix is not allowed here");
    }
    if (byteLength !== WIRE_SIGNATURE_BYTES) {
      throw new SigningError(
        "invalid_signature_length",
        `0x01 wire signature must be ${WIRE_SIGNATURE_BYTES} bytes, got ${byteLength}`,
      );
    }
    const validator = getAddress(`0x${signature.slice(4, 44)}`);
    if (validator !== getAddress(KERNEL_ECDSA_VALIDATOR_ADDRESS)) {
      throw new SigningError("invalid_signature_validator", "wire signature names an unexpected validator");
    }
    const ecdsa = normalizeEcdsaSignature(`0x${signature.slice(44)}`);
    return { form: "kernel-validator-0x01", validator, ecdsa, canonicalWire: assembleWireSignature(ecdsa, { form: "kernel-validator-0x01" }) };
  }

  if (prefix === "00") {
    if (!allowed.includes("kernel-root-0x00")) {
      throw new SigningError("invalid_signature_prefix", "0x00 signature prefix is not allowed here");
    }
    if (byteLength !== ROOT_WIRE_SIGNATURE_BYTES) {
      throw new SigningError(
        "invalid_signature_length",
        `0x00 wire signature must be ${ROOT_WIRE_SIGNATURE_BYTES} bytes, got ${byteLength}`,
      );
    }
    const ecdsa = normalizeEcdsaSignature(`0x${signature.slice(4)}`);
    return { form: "kernel-root-0x00", validator: null, ecdsa, canonicalWire: assembleWireSignature(ecdsa, { form: "kernel-root-0x00" }) };
  }

  throw new SigningError("invalid_signature_prefix", `unknown wire signature prefix 0x${prefix || "(empty)"}`);
}
