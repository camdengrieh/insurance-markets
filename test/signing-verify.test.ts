import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  DIGEST_SIGNATURE_FORMS,
  KERNEL_ECDSA_VALIDATOR_ADDRESS,
  SECP256K1_N,
  assembleWireSignature,
  buildL1Headers,
  clobAuthKernelDigest,
  hashOrder,
  kernelWrapDigest,
  parseWireSignature,
  verifyClobAuthEcdsa,
  verifyClobAuthWireSignature,
  verifyOrderEcdsa,
  verifyOrderWireSignature,
  type ClobAuthFields,
  type XoOrder,
} from "../src/xo/signing/index.js";

// PUBLIC TEST KEYS: Anvil/Hardhat default accounts 0 and 1. Never fund them.
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const STRANGER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const SMART = "0xcafe000000000000000000000000000000000a11" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const ORDER: XoOrder = {
  salt: 424242n,
  maker: SMART,
  signer: SMART,
  beneficiary: ZERO,
  tokenId: 123456789n,
  makerAmount: 4_200_000n,
  takerAmount: 10_000_000n,
  expiration: 1791389400n,
  nonce: 0n,
  identifier: "0x00000000000000000000000000000000",
  metadata: "0x0000000000000000000000000000000000000000000000000000000000000000",
  side: 0,
  signatureType: 3,
};

async function sign(order: XoOrder, key = OWNER): Promise<Hex> {
  return key.sign({ hash: kernelWrapDigest(hashOrder(order), order.maker) });
}

const word = (n: bigint) => n.toString(16).padStart(64, "0");

describe("verifyOrderEcdsa (the 65 bytes a wallet returns)", () => {
  it("accepts a signature by the expected owner and reports the digests", async () => {
    const ecdsa = await sign(ORDER);
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: OWNER.address });
    assert.ok(result.ok);
    assert.equal(result.owner, OWNER.address);
    assert.equal(result.innerHash, hashOrder(ORDER));
    assert.equal(result.wrappedDigest, kernelWrapDigest(hashOrder(ORDER), SMART));
    assert.equal(result.ecdsa, ecdsa);
  });

  it("accepts parity v (0/1) by normalising it", async () => {
    const ecdsa = await sign(ORDER);
    const parity = `${ecdsa.slice(0, -2)}${ecdsa.endsWith("1b") ? "00" : "01"}` as Hex;
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: parity, expectedOwner: OWNER.address });
    assert.ok(result.ok);
    assert.equal(result.ecdsa, ecdsa);
  });

  it("rejects a signature by a different key as owner_mismatch", async () => {
    const ecdsa = await sign(ORDER, STRANGER);
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });

  it("rejects the right signature when the expected owner is someone else", async () => {
    const ecdsa = await sign(ORDER);
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: STRANGER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });

  it("rejects a signature over any other order (the hash is rebuilt, not trusted)", async () => {
    const ecdsa = await sign(ORDER);
    const tampered = { ...ORDER, makerAmount: ORDER.makerAmount + 1n };
    const result = await verifyOrderEcdsa({ order: tampered, ecdsa, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });

  it("rejects a signature produced for a different smart account", async () => {
    const otherAccount = "0x1111111111111111111111111111111111111111" as Address;
    const ecdsa = await OWNER.sign({ hash: kernelWrapDigest(hashOrder(ORDER), otherAccount) });
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });

  it("rejects a signature over the bare order hash (no Kernel wrap)", async () => {
    const ecdsa = await OWNER.sign({ hash: hashOrder(ORDER) });
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });

  it("rejects high-s, wrong length and bad v before recovering anything", async () => {
    const ecdsa = await sign(ORDER);
    const s = BigInt(`0x${ecdsa.slice(66, 130)}`);
    const highS = `0x${ecdsa.slice(2, 66)}${word(SECP256K1_N - s)}${ecdsa.slice(130)}` as Hex;
    const cases: Array<[string, Hex, string]> = [
      ["high-s", highS, "high_s_signature"],
      ["short", ecdsa.slice(0, -2) as Hex, "invalid_signature_length"],
      ["long", `${ecdsa}00` as Hex, "invalid_signature_length"],
      ["bad v", `${ecdsa.slice(0, -2)}09` as Hex, "invalid_signature_v"],
      ["not hex", "0xzz" as Hex, "invalid_hex"],
    ];
    for (const [name, bad, code] of cases) {
      const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: bad, expectedOwner: OWNER.address });
      assert.ok(!result.ok, name);
      assert.equal(result.code, code, name);
    }
  });

  it("rejects an invalid order instead of hashing it", async () => {
    const ecdsa = await sign(ORDER);
    const result = await verifyOrderEcdsa({
      order: { ...ORDER, signer: STRANGER.address },
      ecdsa,
      expectedOwner: OWNER.address,
    });
    assert.ok(!result.ok);
    assert.equal(result.code, "invalid_order");
  });

  it("rejects a malformed or zero expected owner", async () => {
    const ecdsa = await sign(ORDER);
    for (const bad of ["0x1234", ZERO, "owner"]) {
      const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: bad as Address });
      assert.ok(!result.ok, bad);
      assert.equal(result.code, "invalid_address", bad);
    }
  });
});

describe("verifyOrderWireSignature (the 86-byte value that goes on the wire)", () => {
  it("accepts the documented form", async () => {
    const wire = assembleWireSignature(await sign(ORDER));
    const result = await verifyOrderWireSignature({ order: ORDER, signature: wire, expectedOwner: OWNER.address });
    assert.ok(result.ok);
    assert.equal(result.form, "kernel-validator-0x01");
  });

  it("rejects the 0x00 form unless the caller allows it by name", async () => {
    const ecdsa = await sign(ORDER);
    const rootWire = assembleWireSignature(ecdsa, { form: "kernel-root-0x00" });
    const refused = await verifyOrderWireSignature({ order: ORDER, signature: rootWire, expectedOwner: OWNER.address });
    assert.ok(!refused.ok);
    assert.equal(refused.code, "invalid_signature_prefix");
    const allowed = await verifyOrderWireSignature({
      order: ORDER,
      signature: rootWire,
      expectedOwner: OWNER.address,
      parseOptions: { allowedForms: ["kernel-root-0x00"] },
    });
    assert.ok(allowed.ok);
    assert.equal(allowed.form, "kernel-root-0x00");
  });

  it("rejects wrong prefix, wrong length, wrong validator and high-s", async () => {
    const ecdsa = await sign(ORDER);
    const good = assembleWireSignature(ecdsa);
    const s = BigInt(`0x${ecdsa.slice(66, 130)}`);
    const highS = `0x${ecdsa.slice(2, 66)}${word(SECP256K1_N - s)}${ecdsa.slice(130)}`;
    const cases: Array<[string, string, string]> = [
      ["wrong prefix 0x02", `0x02${good.slice(4)}`, "invalid_signature_prefix"],
      ["no prefix (65 bytes)", ecdsa, "invalid_signature_prefix"],
      ["one byte short", good.slice(0, -2), "invalid_signature_length"],
      ["one byte long", `${good}00`, "invalid_signature_length"],
      ["wrong validator", `0x01${"22".repeat(20)}${ecdsa.slice(2)}`, "invalid_signature_validator"],
      ["high-s", `0x01${KERNEL_ECDSA_VALIDATOR_ADDRESS.slice(2).toLowerCase()}${highS.slice(2)}`, "high_s_signature"],
    ];
    for (const [name, bad, code] of cases) {
      const result = await verifyOrderWireSignature({ order: ORDER, signature: bad as Hex, expectedOwner: OWNER.address });
      assert.ok(!result.ok, name);
      assert.equal(result.code, code, name);
    }
  });

  it("rejects a wire signature by the wrong owner", async () => {
    const wire = assembleWireSignature(await sign(ORDER, STRANGER));
    const result = await verifyOrderWireSignature({ order: ORDER, signature: wire, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });
});

describe("L1 ClobAuth verification", () => {
  const fields: ClobAuthFields = { address: SMART, timestamp: "1792344796", nonce: 0n };

  it("accepts the owner's signature over the wrapped ClobAuth digest", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const result = await verifyClobAuthEcdsa({ fields, ecdsa, expectedOwner: OWNER.address });
    assert.ok(result.ok);
    const wire = assembleWireSignature(ecdsa);
    const viaWire = await verifyClobAuthWireSignature({ fields, signature: wire, expectedOwner: OWNER.address });
    assert.ok(viaWire.ok);
  });

  it("rejects a different timestamp, nonce, address, owner or a bad prefix", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const wire = assembleWireSignature(ecdsa);
    const mismatches: ClobAuthFields[] = [
      { ...fields, timestamp: "1792344797" },
      { ...fields, nonce: 1n },
      { ...fields, address: "0x1111111111111111111111111111111111111111" },
    ];
    for (const other of mismatches) {
      const result = await verifyClobAuthEcdsa({ fields: other, ecdsa, expectedOwner: OWNER.address });
      assert.ok(!result.ok);
      assert.equal(result.code, "owner_mismatch");
    }
    const wrongOwner = await verifyClobAuthEcdsa({ fields, ecdsa, expectedOwner: STRANGER.address });
    assert.ok(!wrongOwner.ok);
    assert.equal(wrongOwner.code, "owner_mismatch");
    const badPrefix = await verifyClobAuthWireSignature({
      fields,
      signature: `0x02${wire.slice(4)}` as Hex,
      expectedOwner: OWNER.address,
    });
    assert.ok(!badPrefix.ok);
    assert.equal(badPrefix.code, "invalid_signature_prefix");
  });

  it("refuses to build L1 headers around a bad wire signature or bad fields", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const good = assembleWireSignature(ecdsa);
    assert.doesNotThrow(() => buildL1Headers(fields, good));
    assert.throws(() => buildL1Headers(fields, `0x02${good.slice(4)}` as Hex), /prefix/);
    assert.throws(() => buildL1Headers(fields, good.slice(0, -2) as Hex), /86 bytes/);
    assert.throws(() => buildL1Headers(fields, ecdsa), /prefix/);
    assert.throws(() => buildL1Headers({ ...fields, timestamp: "12.5" }, good), /timestamp/);
    assert.throws(() => buildL1Headers({ ...fields, nonce: -1n }, good), /nonce/);
    assert.throws(() => buildL1Headers({ ...fields, address: "0x1234" as Address }, good), /address/);
    // the 0x00 form is refused in a header unless the caller allows it by name
    const root = assembleWireSignature(ecdsa, { form: "kernel-root-0x00" });
    assert.throws(() => buildL1Headers(fields, root), /prefix/);
    assert.doesNotThrow(() => buildL1Headers(fields, root, { allowedForms: ["kernel-root-0x00"] }));
  });

  it("rejects a bad timestamp before hashing", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const result = await verifyClobAuthEcdsa({ fields: { ...fields, timestamp: "now" }, ecdsa, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "invalid_timestamp");
  });
});

describe("wire signatures leave this module in canonical form (SIGN-1)", () => {
  const fields: ClobAuthFields = { address: SMART, timestamp: "1792344796", nonce: 0n };
  // The Kernel validator feeds v to ecrecover unchanged, which needs 27 or 28. Accepting 0/1 on the
  // way in is fine only if what goes out on the wire is the normalised form.
  const toParity = (ecdsa: Hex): Hex => `${ecdsa.slice(0, -2)}${ecdsa.endsWith("1b") ? "00" : "01"}` as Hex;
  const withParityV = (wire: Hex): Hex => `${wire.slice(0, -2)}${wire.endsWith("1b") ? "00" : "01"}` as Hex;
  const upper = (wire: Hex): Hex => `0x${wire.slice(2).toUpperCase()}` as Hex;

  it("parseWireSignature returns the canonical wire string for parity-v and upper-case input", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const canonical = assembleWireSignature(ecdsa);
    assert.equal(parseWireSignature(canonical).canonicalWire, canonical);
    assert.equal(parseWireSignature(withParityV(canonical)).canonicalWire, canonical);
    assert.equal(parseWireSignature(upper(canonical)).canonicalWire, canonical);
    const root = assembleWireSignature(ecdsa, { form: "kernel-root-0x00" });
    const options = { allowedForms: ["kernel-root-0x00"] } as const;
    assert.equal(parseWireSignature(withParityV(root), options).canonicalWire, root);
    assert.equal(parseWireSignature(upper(root), options).canonicalWire, root);
  });

  it("buildL1Headers puts the canonical signature in XO_SIGNATURE, not the caller's spelling", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const canonical = assembleWireSignature(ecdsa);
    assert.ok(canonical.endsWith("1b") || canonical.endsWith("1c"));
    const parity = withParityV(canonical);
    assert.notEqual(parity, canonical);
    assert.equal(buildL1Headers(fields, parity).XO_SIGNATURE, canonical);
    assert.equal(buildL1Headers(fields, upper(canonical)).XO_SIGNATURE, canonical);
    assert.equal(buildL1Headers(fields, canonical).XO_SIGNATURE, canonical);
    const root = assembleWireSignature(ecdsa, { form: "kernel-root-0x00" });
    assert.equal(buildL1Headers(fields, withParityV(root), { allowedForms: ["kernel-root-0x00"] }).XO_SIGNATURE, root);
  });

  it("the wire verifiers report the canonical string a submit step must send", async () => {
    const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const canonical = assembleWireSignature(ecdsa);
    const viaClob = await verifyClobAuthWireSignature({ fields, signature: withParityV(canonical), expectedOwner: OWNER.address });
    assert.ok(viaClob.ok);
    assert.equal(viaClob.canonicalWire, canonical);
    const orderEcdsa = await sign(ORDER);
    const orderWire = assembleWireSignature(orderEcdsa);
    const viaOrder = await verifyOrderWireSignature({ order: ORDER, signature: upper(withParityV(orderWire)), expectedOwner: OWNER.address });
    assert.ok(viaOrder.ok);
    assert.equal(viaOrder.canonicalWire, orderWire);
    assert.equal(viaOrder.ecdsa, orderEcdsa);
    // The ECDSA-only verifiers have no wire string to report.
    const plain = await verifyOrderEcdsa({ order: ORDER, ecdsa: toParity(orderEcdsa), expectedOwner: OWNER.address });
    assert.ok(plain.ok);
    assert.equal(plain.canonicalWire, undefined);
  });
});

describe("a signature that recovers no public key is refused, not accepted (SIGN-3)", () => {
  const fields: ClobAuthFields = { address: SMART, timestamp: "1792344796", nonce: 0n };
  // r = 5 is not the x-coordinate of any secp256k1 point, so no key recovers from it. The values are
  // otherwise legal (r and s in range, low s, v of 27 or 28), so every earlier check lets it through.
  const offCurve = (v: "1b" | "1c" | "00"): Hex => `0x${word(5n)}${word(1n)}${v}` as Hex;

  it("verifyOrderEcdsa and verifyClobAuthEcdsa report unrecoverable_signature", async () => {
    for (const v of ["1b", "1c", "00"] as const) {
      const order = await verifyOrderEcdsa({ order: ORDER, ecdsa: offCurve(v), expectedOwner: OWNER.address });
      assert.ok(!order.ok, v);
      assert.equal(order.code, "unrecoverable_signature", v);
      const clob = await verifyClobAuthEcdsa({ fields, ecdsa: offCurve(v), expectedOwner: OWNER.address });
      assert.ok(!clob.ok, v);
      assert.equal(clob.code, "unrecoverable_signature", v);
    }
  });

  it("the wire verifiers report it too, for both wire forms", async () => {
    for (const form of ["kernel-validator-0x01", "kernel-root-0x00"] as const) {
      const wire = assembleWireSignature(offCurve("1b"), { form });
      const parseOptions = { allowedForms: [form] };
      const order = await verifyOrderWireSignature({ order: ORDER, signature: wire, expectedOwner: OWNER.address, parseOptions });
      assert.ok(!order.ok, form);
      assert.equal(order.code, "unrecoverable_signature", form);
      const clob = await verifyClobAuthWireSignature({ fields, signature: wire, expectedOwner: OWNER.address, parseOptions });
      assert.ok(!clob.ok, form);
      assert.equal(clob.code, "unrecoverable_signature", form);
    }
  });

  it("never reports ok for it, and a real signature next to it still verifies", async () => {
    const real = await sign(ORDER);
    const good = await verifyOrderEcdsa({ order: ORDER, ecdsa: real, expectedOwner: OWNER.address });
    assert.ok(good.ok);
    const bad = await verifyOrderEcdsa({ order: ORDER, ecdsa: offCurve("1b"), expectedOwner: OWNER.address });
    assert.equal(bad.ok, false);
  });
});

// ---- delta 5.8: both digest forms --------------------------------------------------------------------------------

// XO's own app signs EIP-191 over the Kernel-wrapped digest (62 of 62 classifiable makers); the docs' sample and a
// PayBox `raw` or `typedData` intent sign the digest as it stands. The deployed validator accepts both, so the
// verifier must, and it must say which one it saw.
async function signEip191(order: XoOrder, key = OWNER): Promise<Hex> {
  return key.signMessage({ message: { raw: kernelWrapDigest(hashOrder(order), order.maker) } });
}

describe("both digest forms (raw and EIP-191)", () => {
  it("the forms are named", () => {
    assert.deepEqual([...DIGEST_SIGNATURE_FORMS], ["raw", "eip191"]);
  });

  it("accepts a raw signature and reports raw", async () => {
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: await sign(ORDER), expectedOwner: OWNER.address });
    assert.ok(result.ok);
    assert.equal(result.digestForm, "raw");
  });

  it("accepts an EIP-191 signature and reports eip191, with the same digests", async () => {
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: await signEip191(ORDER), expectedOwner: OWNER.address });
    assert.ok(result.ok);
    assert.equal(result.digestForm, "eip191");
    assert.equal(result.owner, OWNER.address);
    assert.equal(result.innerHash, hashOrder(ORDER));
    assert.equal(result.wrappedDigest, kernelWrapDigest(hashOrder(ORDER), SMART));
  });

  it("each form is refused when the caller allows only the other", async () => {
    const raw = await sign(ORDER);
    const eip = await signEip191(ORDER);
    const onlyRaw = { order: ORDER, expectedOwner: OWNER.address, digestForms: ["raw"] } as const;
    const onlyEip = { order: ORDER, expectedOwner: OWNER.address, digestForms: ["eip191"] } as const;
    assert.ok((await verifyOrderEcdsa({ ...onlyRaw, ecdsa: raw })).ok);
    assert.ok((await verifyOrderEcdsa({ ...onlyEip, ecdsa: eip })).ok);
    const rawOnEip = await verifyOrderEcdsa({ ...onlyEip, ecdsa: raw });
    assert.ok(!rawOnEip.ok);
    assert.equal(rawOnEip.code, "owner_mismatch");
    const eipOnRaw = await verifyOrderEcdsa({ ...onlyRaw, ecdsa: eip });
    assert.ok(!eipOnRaw.ok);
    assert.equal(eipOnRaw.code, "owner_mismatch");
  });

  it("a malformed digestForms option is a caller bug and throws instead of verifying", async () => {
    const ecdsa = await sign(ORDER);
    for (const bad of [[], ["rawx"], ["raw", "eip191x"], ["EIP191"]]) {
      await assert.rejects(
        verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: OWNER.address, digestForms: bad as never }),
        TypeError,
        JSON.stringify(bad),
      );
    }
  });

  it("naming a form twice is harmless", async () => {
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: await sign(ORDER), expectedOwner: OWNER.address, digestForms: ["raw", "raw"] });
    assert.ok(result.ok);
    assert.equal(result.digestForm, "raw");
  });

  it("a stranger's signature fails under both forms, and a signature over another order fails under both", async () => {
    for (const make of [sign, signEip191]) {
      const stranger = await verifyOrderEcdsa({ order: ORDER, ecdsa: await make(ORDER, STRANGER), expectedOwner: OWNER.address });
      assert.ok(!stranger.ok);
      assert.equal(stranger.code, "owner_mismatch");
      const other = { ...ORDER, takerAmount: ORDER.takerAmount + 1n };
      const tampered = await verifyOrderEcdsa({ order: other, ecdsa: await make(ORDER), expectedOwner: OWNER.address });
      assert.ok(!tampered.ok);
      assert.equal(tampered.code, "owner_mismatch");
    }
  });

  it("an EIP-191 signature over the BARE order hash (no Kernel wrap) is refused too", async () => {
    const ecdsa = await OWNER.signMessage({ message: { raw: hashOrder(ORDER) } });
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "owner_mismatch");
  });

  it("the wire verifiers and the ClobAuth verifiers report the form as well", async () => {
    const eip = await signEip191(ORDER);
    const viaWire = await verifyOrderWireSignature({ order: ORDER, signature: assembleWireSignature(eip), expectedOwner: OWNER.address });
    assert.ok(viaWire.ok);
    assert.equal(viaWire.digestForm, "eip191");
    assert.equal(viaWire.form, "kernel-validator-0x01");
    const fields: ClobAuthFields = { address: SMART, timestamp: "1792344796", nonce: 0n };
    const rawAuth = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
    const eipAuth = await OWNER.signMessage({ message: { raw: clobAuthKernelDigest(fields) } });
    const raw = await verifyClobAuthEcdsa({ fields, ecdsa: rawAuth, expectedOwner: OWNER.address });
    const eip191 = await verifyClobAuthWireSignature({ fields, signature: assembleWireSignature(eipAuth), expectedOwner: OWNER.address });
    assert.ok(raw.ok && eip191.ok);
    assert.equal(raw.digestForm, "raw");
    assert.equal(eip191.digestForm, "eip191");
    const onlyRaw = await verifyClobAuthEcdsa({ fields, ecdsa: eipAuth, expectedOwner: OWNER.address, digestForms: ["raw"] });
    assert.ok(!onlyRaw.ok);
    assert.equal(onlyRaw.code, "owner_mismatch");
  });

  it("the mismatch message names what each form recovered to, and never an address that was not recovered", async () => {
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: await sign(ORDER, STRANGER), expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.match(result.message, /\(raw\)/);
    assert.match(result.message, /\(eip191\)/);
    assert.ok(result.message.includes(OWNER.address));
  });

  it("a signature that recovers nothing under either form is still unrecoverable, not a mismatch", async () => {
    const offCurve = `0x${word(5n)}${word(1n)}1b` as Hex;
    const result = await verifyOrderEcdsa({ order: ORDER, ecdsa: offCurve, expectedOwner: OWNER.address });
    assert.ok(!result.ok);
    assert.equal(result.code, "unrecoverable_signature");
  });
});
