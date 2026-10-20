import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import {
  KERNEL_ECDSA_VALIDATOR_ADDRESS,
  SECP256K1_N,
  SigningError,
  assembleWireSignature,
  decodeEcdsaSignature,
  encodeEcdsaSignature,
  normalizeEcdsaSignature,
  parseWireSignature,
  type SigningErrorCode,
} from "../src/xo/signing/index.js";

// A real signature by the public Anvil account 0 test key (docs/research/07 section 4, vector B).
const R = "29b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf";
const S = "1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c";
const ECDSA = `0x${R}${S}1c` as Hex;
const VALIDATOR = KERNEL_ECDSA_VALIDATOR_ADDRESS.slice(2).toLowerCase();

function rejects(fn: () => unknown, code: SigningErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof SigningError && error.code === code, `expected ${code}`);
}

const word = (n: bigint) => n.toString(16).padStart(64, "0");

describe("assembleWireSignature", () => {
  it("defaults to the documented 0x01 || validator || ecdsa form, 86 bytes", () => {
    const wire = assembleWireSignature(ECDSA);
    assert.equal(wire, `0x01${VALIDATOR}${ECDSA.slice(2)}`);
    assert.equal((wire.length - 2) / 2, 86);
  });

  it("builds the 0x00 form only when asked for it by name, 66 bytes", () => {
    const wire = assembleWireSignature(ECDSA, { form: "kernel-root-0x00" });
    assert.equal(wire, `0x00${ECDSA.slice(2)}`);
    assert.equal((wire.length - 2) / 2, 66);
    assert.notEqual(assembleWireSignature(ECDSA), wire);
  });

  it("refuses an unknown form", () => {
    rejects(() => assembleWireSignature(ECDSA, { form: "kernel-root-0x02" as "kernel-root-0x00" }), "invalid_signature_prefix");
  });

  it("normalises parity v (0/1) to 27/28 and leaves 27/28 alone", () => {
    assert.equal(normalizeEcdsaSignature(`0x${R}${S}01`), ECDSA);
    assert.equal(normalizeEcdsaSignature(`0x${R}${S}00`), `0x${R}${S}1b`);
    assert.equal(normalizeEcdsaSignature(`0x${R}${S}1c`), ECDSA);
    assert.equal(normalizeEcdsaSignature(`0x${R.toUpperCase()}${S}1C`), ECDSA);
  });

  it("refuses a recovery byte outside 0, 1, 27, 28", () => {
    for (const v of ["02", "1a", "1d", "ff"]) rejects(() => assembleWireSignature(`0x${R}${S}${v}` as Hex), "invalid_signature_v");
  });

  it("refuses an ECDSA signature that is not exactly 65 bytes", () => {
    rejects(() => assembleWireSignature(`0x${R}${S}` as Hex), "invalid_signature_length");
    rejects(() => assembleWireSignature(`0x${R}${S}1c00` as Hex), "invalid_signature_length");
    rejects(() => assembleWireSignature("0x" as Hex), "invalid_signature_length");
  });

  it("refuses non-hex input", () => {
    rejects(() => assembleWireSignature("hello" as Hex), "invalid_hex");
    rejects(() => assembleWireSignature(`0x${"zz".repeat(65)}` as Hex), "invalid_hex");
  });

  it("refuses a high-s (malleated) signature", () => {
    const highS = SECP256K1_N - BigInt(`0x${S}`);
    rejects(() => assembleWireSignature(`0x${R}${word(highS)}1b` as Hex), "high_s_signature");
  });

  it("refuses zero or out-of-range r and s", () => {
    rejects(() => assembleWireSignature(`0x${word(0n)}${S}1c` as Hex), "invalid_signature_value");
    rejects(() => assembleWireSignature(`0x${R}${word(0n)}1c` as Hex), "invalid_signature_value");
    rejects(() => assembleWireSignature(`0x${word(SECP256K1_N)}${S}1c` as Hex), "invalid_signature_value");
    rejects(() => assembleWireSignature(`0x${R}${word(SECP256K1_N)}1c` as Hex), "invalid_signature_value");
  });

  it("accepts s exactly at n/2 and refuses n/2 + 1", () => {
    const half = SECP256K1_N / 2n;
    assert.doesNotThrow(() => assembleWireSignature(`0x${R}${word(half)}1b` as Hex));
    rejects(() => assembleWireSignature(`0x${R}${word(half + 1n)}1b` as Hex), "high_s_signature");
  });
});

describe("parseWireSignature", () => {
  const wire = assembleWireSignature(ECDSA);
  const rootWire = assembleWireSignature(ECDSA, { form: "kernel-root-0x00" });

  it("parses the documented form back to its parts", () => {
    const parsed = parseWireSignature(wire);
    assert.equal(parsed.form, "kernel-validator-0x01");
    assert.equal(parsed.validator, KERNEL_ECDSA_VALIDATOR_ADDRESS);
    assert.equal(parsed.ecdsa, ECDSA);
  });

  it("rejects the 0x00 form by default and accepts it only when allowed", () => {
    rejects(() => parseWireSignature(rootWire), "invalid_signature_prefix");
    const parsed = parseWireSignature(rootWire, { allowedForms: ["kernel-root-0x00"] });
    assert.equal(parsed.form, "kernel-root-0x00");
    assert.equal(parsed.validator, null);
    rejects(() => parseWireSignature(wire, { allowedForms: ["kernel-root-0x00"] }), "invalid_signature_prefix");
  });

  it("rejects an unknown prefix byte and a bare 65-byte signature", () => {
    rejects(() => parseWireSignature(`0x02${VALIDATOR}${ECDSA.slice(2)}`), "invalid_signature_prefix");
    rejects(() => parseWireSignature(`0xff${VALIDATOR}${ECDSA.slice(2)}`), "invalid_signature_prefix");
    rejects(() => parseWireSignature(ECDSA), "invalid_signature_prefix");
    rejects(() => parseWireSignature("0x"), "invalid_signature_prefix");
  });

  it("rejects the wrong length for either prefix", () => {
    rejects(() => parseWireSignature(`${wire}00`), "invalid_signature_length");
    rejects(() => parseWireSignature(wire.slice(0, -2)), "invalid_signature_length");
    rejects(() => parseWireSignature(`${rootWire}00`, { allowedForms: ["kernel-root-0x00"] }), "invalid_signature_length");
    rejects(() => parseWireSignature(rootWire.slice(0, -2), { allowedForms: ["kernel-root-0x00"] }), "invalid_signature_length");
    // the 86-byte validator form must not pass as the root form or the reverse
    rejects(() => parseWireSignature(`0x00${VALIDATOR}${ECDSA.slice(2)}`, { allowedForms: ["kernel-root-0x00"] }), "invalid_signature_length");
  });

  it("rejects a different validator address", () => {
    const other = "1111111111111111111111111111111111111111";
    rejects(() => parseWireSignature(`0x01${other}${ECDSA.slice(2)}`), "invalid_signature_validator");
  });

  it("rejects high-s and bad v inside a wire signature", () => {
    const highS = SECP256K1_N - BigInt(`0x${S}`);
    rejects(() => parseWireSignature(`0x01${VALIDATOR}${R}${word(highS)}1b`), "high_s_signature");
    rejects(() => parseWireSignature(`0x01${VALIDATOR}${R}${S}05`), "invalid_signature_v");
  });

  it("rejects non-hex and odd-length input", () => {
    rejects(() => parseWireSignature("not hex"), "invalid_hex");
    rejects(() => parseWireSignature(`${wire}0`), "invalid_hex");
    rejects(() => parseWireSignature(undefined), "invalid_hex");
  });
});

describe("ECDSA codec", () => {
  it("decode and encode are inverses on canonical signatures", () => {
    assert.equal(encodeEcdsaSignature(decodeEcdsaSignature(ECDSA)), ECDSA);
    assert.equal(decodeEcdsaSignature(ECDSA).v, 28);
  });
});
