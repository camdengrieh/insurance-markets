// Signature normalisation and the dual-digest verifier. Signers are the ten public Anvil/Hardhat test keys;
// every random choice comes from a fixed seed.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { zeroAddress, type Hex } from "viem";

import { CTF_EXCHANGE, MARKET_MANAGER } from "../src/xo/chain/constants.js";
import { SECP256K1_HALF_N, SECP256K1_N } from "../src/xo/signing/constants.js";
import {
  UserOpError,
  enableTradingCalls,
  firstOpNonce,
  normalizeSignature,
  prepareUserOp,
  signingDigests,
  userOpHash,
  userOpSign,
  verifyDigestSignature,
  verifyUserOpSignature,
  withSignature,
} from "./fixtures/userop/api.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { seededRandom } from "./fixtures/userop/prng.js";

type TestAccount = (typeof ANVIL_TEST_ACCOUNTS)[number];
const account = (i: number): TestAccount => ANVIL_TEST_ACCOUNTS[i] as TestAccount;

const word = (n: bigint): string => n.toString(16).padStart(64, "0");

function parts(signature: Hex): { r: bigint; s: bigint; v: number } {
  return { r: BigInt(`0x${signature.slice(2, 66)}`), s: BigInt(`0x${signature.slice(66, 130)}`), v: Number.parseInt(signature.slice(130, 132), 16) };
}

function join(r: bigint, s: bigint, v: number): Hex {
  return `0x${word(r)}${word(s)}${v.toString(16).padStart(2, "0")}` as Hex;
}

// (r, n - s, flipped parity): the same signer, the malleated encoding.
function malleate(signature: Hex): Hex {
  const { r, s, v } = parts(signature);
  return join(r, SECP256K1_N - s, v === 27 ? 28 : 27);
}

function randomHash(rng: ReturnType<typeof seededRandom>): Hex {
  return `0x${rng.hex(32)}` as Hex;
}

async function sign(owner: TestAccount, hash: Hex, form: "raw" | "eip191"): Promise<Hex> {
  return form === "raw" ? owner.sign({ hash }) : owner.signMessage({ message: { raw: hash } });
}

describe("normalizeSignature", () => {
  it("accepts 65 bytes, {r,s,recovery_id} and {r,s,v}, and returns the same canonical bytes", async () => {
    const owner = account(0);
    const signature = await sign(owner, `0x${"42".repeat(32)}`, "raw");
    const { r, s, v } = parts(signature);
    const canonical = normalizeSignature(signature);
    assert.equal(canonical.signature, signature.toLowerCase());
    assert.equal(canonical.rewroteV, false);
    assert.equal(canonical.flippedHighS, false);
    const asObject = normalizeSignature({ r: `0x${word(r)}`, s: `0x${word(s)}`, recovery_id: v - 27 });
    assert.equal(asObject.signature, canonical.signature);
    assert.equal(asObject.rewroteV, true);
    assert.equal(normalizeSignature({ r: `0x${word(r)}`, s: `0x${word(s)}`, v }).signature, canonical.signature);
    assert.equal(normalizeSignature({ r: `0x${word(r)}`, s: `0x${word(s)}`, v: v - 27 }).signature, canonical.signature);
    assert.equal(normalizeSignature(signature.toUpperCase().replace("0X", "0x")).signature, canonical.signature);
  });

  it("rewrites v 0 or 1 to 27 or 28 for 200 random signatures (seeded)", async () => {
    const rng = seededRandom(51);
    for (let i = 0; i < 200; i += 1) {
      const signature = await sign(account(rng.below(10)), randomHash(rng), rng.below(2) === 0 ? "raw" : "eip191");
      const { r, s, v } = parts(signature);
      const parity = join(r, s, v - 27);
      const n = normalizeSignature(parity);
      assert.equal(n.signature, signature.toLowerCase());
      assert.equal(n.rewroteV, true);
      assert.equal(n.recoveryId, v - 27);
      assert.ok(parts(n.signature).s <= SECP256K1_HALF_N);
    }
  });

  it("turns a high-s signature into the low-s one with the parity flipped, and never the other way", async () => {
    const rng = seededRandom(52);
    for (let i = 0; i < 100; i += 1) {
      const signature = await sign(account(rng.below(10)), randomHash(rng), "raw");
      const high = malleate(signature);
      assert.ok(parts(high).s > SECP256K1_HALF_N);
      const n = normalizeSignature(high);
      assert.equal(n.signature, signature.toLowerCase());
      assert.equal(n.flippedHighS, true);
      assert.equal(malleate(high), signature, "malleating twice gives back the library's low-s signature");
    }
  });

  it("refuses wrong lengths, bad hex, odd shapes", () => {
    const sig = join(1n, 1n, 27);
    const bad: unknown[] = [
      "",
      "0x",
      sig.slice(0, sig.length - 2),
      `${sig}00`,
      sig.slice(2),
      `0x${"zz".repeat(65)}`,
      `0x${"11".repeat(64)}`,
      `0x${"11".repeat(66)}`,
      123,
      null,
      undefined,
      [],
      {},
      { r: `0x${word(1n)}`, s: `0x${word(1n)}` },
      { r: `0x${word(1n)}`, s: `0x${word(1n)}`, v: 27, extra: true },
      { r: `0x${word(1n)}`, s: `0x${word(1n)}`, v: 27, recovery_id: 0 },
      { r: "0x01", s: `0x${word(1n)}`, v: 27 },
      { r: `0x${word(1n)}`, s: `0x${word(1n)}`, recovery_id: 2 },
    ];
    for (const input of bad) {
      assert.throws(() => normalizeSignature(input), (e: unknown) => e instanceof UserOpError && e.code === "signature_invalid", String(JSON.stringify(input)));
    }
  });

  it("refuses every recovery byte except 0, 1, 27 and 28", () => {
    for (const v of [2, 3, 4, 26, 29, 30, 35, 36, 37, 38, 255]) {
      assert.throws(() => normalizeSignature(join(5n, 5n, v)), (e: unknown) => e instanceof UserOpError && e.code === "signature_invalid", `v=${v}`);
    }
    for (const v of [0, 1, 27, 28]) assert.equal(normalizeSignature(join(5n, 5n, v)).signature.length, 132);
  });

  it("refuses r or s of zero or at least the group order", () => {
    for (const [r, s] of [
      [0n, 1n],
      [1n, 0n],
      [SECP256K1_N, 1n],
      [1n, SECP256K1_N],
      [SECP256K1_N + 1n, 1n],
      [1n, (1n << 256n) - 1n],
      [(1n << 256n) - 1n, 1n],
    ] as const) {
      assert.throws(() => normalizeSignature(join(r, s, 27)), (e: unknown) => e instanceof UserOpError && e.code === "signature_invalid", `r=${r} s=${s}`);
    }
    assert.equal(normalizeSignature(join(SECP256K1_N - 1n, SECP256K1_HALF_N, 27)).flippedHighS, false);
    assert.equal(normalizeSignature(join(1n, SECP256K1_HALF_N + 1n, 27)).flippedHighS, true);
  });
});

describe("verifyDigestSignature: both digest forms, normalised, owner required", () => {
  it("recognises the form that was signed, for 200 random digests and all ten keys (seeded)", async () => {
    const rng = seededRandom(53);
    for (let i = 0; i < 200; i += 1) {
      const owner = account(rng.below(10));
      const hash = randomHash(rng);
      const form = rng.below(2) === 0 ? "raw" : "eip191";
      const signature = await sign(owner, hash, form);
      const result = await verifyDigestSignature({ userOpHash: hash, signature, expectedOwner: owner.address });
      assert.ok(result.ok, `${i}`);
      if (result.ok) {
        assert.equal(result.form, form);
        assert.equal(result.owner, owner.address);
        assert.equal(result.digest, form === "raw" ? signingDigests(hash).raw : signingDigests(hash).eip191);
        assert.equal(result.signature, signature.toLowerCase());
        assert.equal(result.rewroteV, false);
        assert.equal(result.flippedHighS, false);
      }
    }
  });

  it("rejects the wrong owner, naming whom the signature recovers to", async () => {
    const rng = seededRandom(54);
    for (let i = 0; i < 60; i += 1) {
      const a = rng.below(10);
      const b = (a + 1 + rng.below(9)) % 10;
      const hash = randomHash(rng);
      const form = rng.below(2) === 0 ? "raw" : "eip191";
      const result = await verifyDigestSignature({ userOpHash: hash, signature: await sign(account(a), hash, form), expectedOwner: account(b).address });
      assert.ok(!result.ok && result.code === "owner_mismatch");
      if (!result.ok) assert.equal(result.recovered?.[form], account(a).address);
    }
  });

  it("rejects a signature over another hash", async () => {
    const rng = seededRandom(55);
    const owner = account(3);
    for (let i = 0; i < 40; i += 1) {
      const hash = randomHash(rng);
      const other = randomHash(rng);
      for (const form of ["raw", "eip191"] as const) {
        const result = await verifyDigestSignature({ userOpHash: other, signature: await sign(owner, hash, form), expectedOwner: owner.address });
        assert.ok(!result.ok && result.code === "owner_mismatch");
      }
    }
  });

  it("accepts v 0/1 and high-s encodings of valid signatures and says what it rewrote", async () => {
    const rng = seededRandom(56);
    for (let i = 0; i < 60; i += 1) {
      const owner = account(rng.below(10));
      const hash = randomHash(rng);
      const form = rng.below(2) === 0 ? "raw" : "eip191";
      const signature = await sign(owner, hash, form);
      const { r, s, v } = parts(signature);
      const variants: { input: unknown; rewroteV: boolean; flippedHighS: boolean }[] = [
        { input: join(r, s, v - 27), rewroteV: true, flippedHighS: false },
        { input: malleate(signature), rewroteV: false, flippedHighS: true },
        { input: join(r, SECP256K1_N - s, (v === 27 ? 28 : 27) - 27), rewroteV: true, flippedHighS: true },
        { input: { r: `0x${word(r)}`, s: `0x${word(s)}`, recovery_id: v - 27 }, rewroteV: true, flippedHighS: false },
        { input: { r: `0x${word(r)}`, s: `0x${word(SECP256K1_N - s)}`, v: v === 27 ? 28 : 27 }, rewroteV: false, flippedHighS: true },
      ];
      for (const variant of variants) {
        const result = await verifyDigestSignature({ userOpHash: hash, signature: variant.input, expectedOwner: owner.address });
        assert.ok(result.ok, JSON.stringify(variant.input));
        if (result.ok) {
          assert.equal(result.form, form);
          assert.equal(result.signature, signature.toLowerCase(), "the canonical bytes are the library's original low-s signature");
          assert.equal(result.rewroteV, variant.rewroteV);
          assert.equal(result.flippedHighS, variant.flippedHighS);
        }
      }
    }
  });

  it("a wrong parity flips the recovered signer: a signature with the other v is not the owner's", async () => {
    const rng = seededRandom(57);
    for (let i = 0; i < 30; i += 1) {
      const owner = account(rng.below(10));
      const hash = randomHash(rng);
      const signature = await sign(owner, hash, "raw");
      const { r, s, v } = parts(signature);
      const result = await verifyDigestSignature({ userOpHash: hash, signature: join(r, s, v === 27 ? 28 : 27), expectedOwner: owner.address });
      assert.ok(!result.ok && result.code === "owner_mismatch");
    }
  });

  it("returns signature_invalid for malformed input and invalid_address for a bad owner, and never throws", async () => {
    const hash = `0x${"42".repeat(32)}` as Hex;
    const good = await sign(account(0), hash, "raw");
    for (const signature of ["", "0x", good.slice(0, good.length - 2), `${good}00`, null, 5, {}, join(0n, 1n, 27), join(1n, 1n, 29)]) {
      const result = await verifyDigestSignature({ userOpHash: hash, signature, expectedOwner: account(0).address });
      assert.ok(!result.ok && result.code === "signature_invalid", JSON.stringify(signature));
    }
    for (const owner of [zeroAddress, CTF_EXCHANGE, MARKET_MANAGER, "0x1234", "nonsense", "", `${account(0).address.slice(0, 5)}${account(0).address.slice(5).toUpperCase()}`]) {
      const result = await verifyDigestSignature({ userOpHash: hash, signature: good, expectedOwner: owner });
      assert.ok(!result.ok && result.code === "invalid_address", owner);
    }
  });

  it("does not take a message signature for a digest signature", async () => {
    // PayBox's `message` intent signs TEXT: the hash as a 66-character string, whose EIP-191 prefix says 66, not 32.
    const hash = `0x${"42".repeat(32)}` as Hex;
    const asText = await account(0).signMessage({ message: hash });
    const result = await verifyDigestSignature({ userOpHash: hash, signature: asText, expectedOwner: account(0).address });
    assert.ok(!result.ok && result.code === "owner_mismatch");
  });
});

describe("verifyUserOpSignature: the hash comes from the stored operation", () => {
  function prepared(owner: TestAccount) {
    return prepareUserOp({ action: "deploy_enable_trading", owner: owner.address, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true });
  }

  it("verifies PayBox-style and app-style signatures and returns an operation ready to send", async () => {
    for (const form of ["raw", "eip191"] as const) {
      const owner = account(4);
      const p = prepared(owner);
      const signature = await sign(owner, p.userOpHash, form);
      const result = await verifyUserOpSignature({ op: p.op, signature, expectedOwner: owner.address });
      assert.ok(result.ok);
      if (result.ok) {
        assert.equal(result.form, form);
        assert.equal(result.userOpHash, p.userOpHash);
        assert.deepEqual(result.signedOp, withSignature(p.op, signature));
        assert.equal(userOpHash(result.signedOp), p.userOpHash);
      }
    }
  });

  it("does not trust a hash from the caller: a signature over a different operation fails", async () => {
    const owner = account(5);
    const a = prepared(owner);
    const b = prepareUserOp({ action: "deploy_enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 7_000_000n }), nonce: firstOpNonce(), deployed: false, sponsor: true });
    assert.notEqual(a.userOpHash, b.userOpHash);
    const result = await verifyUserOpSignature({ op: b.op, signature: await sign(owner, a.userOpHash, "raw"), expectedOwner: owner.address });
    assert.ok(!result.ok && result.code === "owner_mismatch");
  });

  it("binds the operation to the owner's derived account", async () => {
    const owner = account(6);
    const stranger = account(7);
    const p = prepared(owner);
    const signature = await sign(owner, p.userOpHash, "raw");
    const wrongAccount = await verifyUserOpSignature({ op: p.op, signature, expectedOwner: stranger.address });
    assert.ok(!wrongAccount.ok && wrongAccount.code === "sender_mismatch");
    const unbound = await verifyUserOpSignature({ op: p.op, signature, expectedOwner: stranger.address, requireDerivedSender: false });
    assert.ok(!unbound.ok && unbound.code === "owner_mismatch", "without the binding the signature itself still names the wrong owner");
    const badOwner = await verifyUserOpSignature({ op: p.op, signature, expectedOwner: zeroAddress });
    assert.ok(!badOwner.ok && badOwner.code === "invalid_address");
  });

  it("refuses an operation that is not shaped like XO's", async () => {
    const owner = account(8);
    const p = prepared(owner);
    const signature = await sign(owner, p.userOpHash, "raw");
    const foreignPaymaster = { ...p.op, paymasterAndData: `0x${"22".repeat(52)}` as Hex };
    const result = await verifyUserOpSignature({ op: foreignPaymaster, signature, expectedOwner: owner.address });
    assert.ok(!result.ok && result.code === "invalid_userop");
  });

  it("the digest tag and expected digest of a prepared operation are over exactly what gets verified", async () => {
    const owner = account(9);
    const p = prepared(owner);
    assert.deepEqual(userOpSign(p.userOpHash), p.sign);
    assert.equal(p.sign.expected_digest, p.userOpHash);
  });
});
