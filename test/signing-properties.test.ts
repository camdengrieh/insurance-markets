import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ORDER_TYPES,
  assembleWireSignature,
  buildL1Headers,
  clobAuthKernelDigest,
  NO_AMOUNT_CONSTRAINTS,
  computeOrderAmounts,
  decodeOrderAmounts,
  exactShareStepMicro,
  formatMicro,
  formatTick,
  hashClobAuth,
  hashOrder,
  hashOrderStruct,
  kernelWrapDigest,
  orderFromWire,
  orderToWire,
  parsePriceToTick,
  parseSharesToMicro,
  signL2,
  verifyClobAuthWireSignature,
  verifyOrderEcdsa,
  verifyOrderWireSignature,
  type ClobAuthFields,
  type OrderSide,
  type XoOrder,
} from "../src/xo/signing/index.js";

// PUBLIC TEST KEYS: Anvil/Hardhat default accounts 0 and 1. Never fund them.
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const STRANGER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const ALLOW = { allowNonZeroBeneficiary: true } as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

// splitmix64 over bigint with a fixed seed: no Math.random anywhere, so every run is identical.
class Rng {
  #state: bigint;
  constructor(seed: bigint) {
    this.#state = BigInt.asUintN(64, seed);
  }
  next64(): bigint {
    this.#state = BigInt.asUintN(64, this.#state + 0x9e3779b97f4a7c15n);
    let z = this.#state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return z ^ (z >> 31n);
  }
  bits(count: number): bigint {
    let out = 0n;
    for (let have = 0; have < count; have += 64) out = (out << 64n) | this.next64();
    return BigInt.asUintN(count, out);
  }
  below(max: number): number {
    return Number(this.next64() % BigInt(max));
  }
  hex(bytes: number): Hex {
    return `0x${this.bits(bytes * 8).toString(16).padStart(bytes * 2, "0")}` as Hex;
  }
  // EIP-55 checksummed, like addresses that come back from XO or a wallet.
  address(): Address {
    return getAddress(this.hex(20));
  }
  // 1..999 and a share size that is an exact multiple of the tick's share step
  quote(): { price: string; shares: string; side: OrderSide } {
    const tick = 1 + this.below(999);
    const step = exactShareStepMicro(tick);
    const multiples = 1n + (this.next64() % 20_000n);
    return { price: formatTick(tick), shares: formatMicro(step * multiples), side: this.below(2) as OrderSide };
  }
}

function randomOrder(rng: Rng): XoOrder {
  const quote = rng.quote();
  // These quotes are arbitrary multiples of the exact share step, often below one share: the default
  // client floors would refuse most of them, and this property is about the signing round trip.
  const amounts = computeOrderAmounts({ ...quote, constraints: NO_AMOUNT_CONSTRAINTS });
  const maker = rng.address();
  return {
    salt: rng.bits(256),
    maker,
    signer: maker,
    beneficiary: rng.below(4) === 0 ? rng.address() : ZERO,
    tokenId: rng.bits(256),
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration: rng.below(5) === 0 ? 0n : 1_791_389_400n + rng.bits(20),
    nonce: rng.bits(128),
    identifier: rng.hex(16),
    metadata: rng.hex(32),
    side: amounts.side,
    signatureType: 3,
  };
}

const bump = (value: bigint, max: bigint): bigint => (value === max ? value - 1n : value + 1n);
const flipLastByte = (hex: Hex): Hex => `${hex.slice(0, -2)}${(Number.parseInt(hex.slice(-2), 16) ^ 0x01).toString(16).padStart(2, "0")}` as Hex;
const MAX256 = (1n << 256n) - 1n;

// One variant per signed field. maker and signer must move together (a mismatch is invalid).
function singleFieldFlips(order: XoOrder, rng: Rng): Array<[string, XoOrder]> {
  const otherAccount = ((): Address => {
    let candidate = rng.address();
    while (candidate.toLowerCase() === order.maker.toLowerCase()) candidate = rng.address();
    return candidate;
  })();
  const otherBeneficiary = ((): Address => {
    let candidate = rng.address();
    while (candidate.toLowerCase() === order.beneficiary.toLowerCase()) candidate = rng.address();
    return candidate;
  })();
  return [
    ["salt", { ...order, salt: bump(order.salt, MAX256) }],
    ["maker+signer", { ...order, maker: otherAccount, signer: otherAccount }],
    ["beneficiary", { ...order, beneficiary: otherBeneficiary }],
    ["tokenId", { ...order, tokenId: bump(order.tokenId, MAX256) }],
    ["makerAmount", { ...order, makerAmount: bump(order.makerAmount, MAX256) }],
    ["takerAmount", { ...order, takerAmount: bump(order.takerAmount, MAX256) }],
    ["expiration", { ...order, expiration: bump(order.expiration, MAX256) }],
    ["nonce", { ...order, nonce: bump(order.nonce, (1n << 128n) - 1n) }],
    ["identifier", { ...order, identifier: flipLastByte(order.identifier) }],
    ["metadata", { ...order, metadata: flipLastByte(order.metadata) }],
    ["side", { ...order, side: (order.side === 0 ? 1 : 0) as OrderSide }],
  ];
}

async function signOrder(order: XoOrder, key = OWNER): Promise<Hex> {
  return key.sign({ hash: kernelWrapDigest(hashOrder(order, ALLOW), order.maker) });
}

describe("property: random orders round-trip through build, sign, verify (seed 0x5eed01)", () => {
  const rng = new Rng(0x5eed01n);
  const orders = Array.from({ length: 48 }, () => randomOrder(rng));

  it("every field of the generator is within its type's range", () => {
    for (const order of orders) assert.doesNotThrow(() => hashOrder(order, ALLOW));
  });

  it("build -> hash -> wrap -> sign -> assemble -> verify succeeds and recovers the owner", async () => {
    for (const order of orders) {
      const ecdsa = await signOrder(order);
      const wire = assembleWireSignature(ecdsa);
      const viaWire = await verifyOrderWireSignature({
        order,
        signature: wire,
        expectedOwner: OWNER.address,
        orderOptions: ALLOW,
      });
      assert.ok(viaWire.ok);
      assert.equal(viaWire.owner, OWNER.address);
      assert.equal(viaWire.innerHash, hashOrder(order, ALLOW));
      const viaEcdsa = await verifyOrderEcdsa({ order, ecdsa, expectedOwner: OWNER.address, orderOptions: ALLOW });
      assert.ok(viaEcdsa.ok);
    }
  });

  it("the wire form is 86 bytes and starts with 0x01 || validator for every order", async () => {
    for (const order of orders.slice(0, 8)) {
      const wire = assembleWireSignature(await signOrder(order));
      assert.equal((wire.length - 2) / 2, 86);
      assert.ok(wire.startsWith("0x01845adb2c711129d4f3966735ed98a9f09fc4ce57"));
    }
  });

  it("amounts decode back to the quoted price tick and size", () => {
    const quoteRng = new Rng(0x5eed02n);
    for (let i = 0; i < 200; i += 1) {
      const quote = quoteRng.quote();
      const amounts = computeOrderAmounts({ ...quote, constraints: NO_AMOUNT_CONSTRAINTS });
      const decoded = decodeOrderAmounts(amounts);
      assert.equal(decoded.priceTick, parsePriceToTick(quote.price));
      assert.equal(decoded.sharesMicro, parseSharesToMicro(quote.shares));
      assert.equal(amounts.collateralMicro * 1000n, amounts.sharesMicro * BigInt(amounts.priceTick));
      assert.equal(amounts.side === 0 ? amounts.makerAmount : amounts.takerAmount, amounts.collateralMicro);
      assert.equal(amounts.side === 0 ? amounts.takerAmount : amounts.makerAmount, amounts.sharesMicro);
    }
  });

  it("price and size formatting round-trips through the parsers", () => {
    const fmtRng = new Rng(0x5eed03n);
    for (let i = 0; i < 300; i += 1) {
      const tick = 1 + fmtRng.below(999);
      assert.equal(parsePriceToTick(formatTick(tick)), tick);
      const micro = 1n + (fmtRng.next64() % 10n ** 15n);
      assert.equal(parseSharesToMicro(formatMicro(micro)), micro);
    }
  });

  it("wire conversion round-trips", () => {
    for (const order of orders) assert.deepEqual(orderFromWire(orderToWire(order)), order);
  });
});

describe("property: flipping any single signed field changes the hash and breaks the signature", () => {
  const rng = new Rng(0x5eed10n);
  const orders = Array.from({ length: 16 }, () => randomOrder(rng));

  it("covers every one of the 13 signed fields (signatureType is pinned and tested as a rejection)", () => {
    const [first] = orders;
    assert.ok(first);
    const flipped = singleFieldFlips(first, new Rng(1n)).map(([name]) => name.split("+")[0]);
    const covered = new Set([...flipped, "signer", "signatureType"]);
    for (const field of ORDER_TYPES.Order) assert.ok(covered.has(field.name), `${field.name} is not covered`);
  });

  it("struct hash and order hash both change; the original signature no longer verifies", async () => {
    const flipRng = new Rng(0x5eed11n);
    for (const order of orders) {
      const ecdsa = await signOrder(order);
      const baseStruct = hashOrderStruct(order, ALLOW);
      const baseHash = hashOrder(order, ALLOW);
      for (const [name, variant] of singleFieldFlips(order, flipRng)) {
        assert.notEqual(hashOrderStruct(variant, ALLOW), baseStruct, `${name}: struct hash unchanged`);
        assert.notEqual(hashOrder(variant, ALLOW), baseHash, `${name}: order hash unchanged`);
        const result = await verifyOrderEcdsa({ order: variant, ecdsa, expectedOwner: OWNER.address, orderOptions: ALLOW });
        assert.ok(!result.ok, `${name}: signature still verifies`);
        assert.equal(result.code, "owner_mismatch", name);
      }
    }
  });

  it("maker alone or signer alone is rejected as an invalid order", async () => {
    const flipRng = new Rng(0x5eed12n);
    for (const order of orders.slice(0, 6)) {
      const ecdsa = await signOrder(order);
      for (const variant of [{ ...order, maker: flipRng.address() }, { ...order, signer: flipRng.address() }]) {
        const result = await verifyOrderEcdsa({ order: variant, ecdsa, expectedOwner: OWNER.address, orderOptions: ALLOW });
        assert.ok(!result.ok);
        assert.equal(result.code, "invalid_order");
      }
    }
  });

  it("signatureType other than 3 is rejected for every order", async () => {
    for (const order of orders.slice(0, 6)) {
      const ecdsa = await signOrder(order);
      const result = await verifyOrderEcdsa({
        order: { ...order, signatureType: 0 as 3 },
        ecdsa,
        expectedOwner: OWNER.address,
        orderOptions: ALLOW,
      });
      assert.ok(!result.ok);
      assert.equal(result.code, "invalid_order");
    }
  });
});

describe("property: wrong owner always fails", () => {
  const rng = new Rng(0x5eed20n);
  const orders = Array.from({ length: 24 }, () => randomOrder(rng));

  it("a signature by another key never verifies for the expected owner", async () => {
    for (const order of orders) {
      const ecdsa = await signOrder(order, STRANGER);
      const result = await verifyOrderEcdsa({ order, ecdsa, expectedOwner: OWNER.address, orderOptions: ALLOW });
      assert.ok(!result.ok);
      assert.equal(result.code, "owner_mismatch");
      const right = await verifyOrderEcdsa({ order, ecdsa, expectedOwner: STRANGER.address, orderOptions: ALLOW });
      assert.ok(right.ok);
    }
  });

  it("an expected owner that is not the signer fails even for random addresses", async () => {
    const addrRng = new Rng(0x5eed21n);
    for (const order of orders) {
      const ecdsa = await signOrder(order);
      const result = await verifyOrderEcdsa({ order, ecdsa, expectedOwner: addrRng.address(), orderOptions: ALLOW });
      assert.ok(!result.ok);
    }
  });
});

describe("property: ClobAuth", () => {
  const rng = new Rng(0x5eed30n);
  const cases: ClobAuthFields[] = Array.from({ length: 24 }, () => ({
    address: rng.address(),
    timestamp: String(1_700_000_000 + rng.below(200_000_000)),
    nonce: rng.bits(64),
  }));

  it("sign and verify round-trips; every field matters", async () => {
    for (const fields of cases) {
      const ecdsa = await OWNER.sign({ hash: clobAuthKernelDigest(fields) });
      const wire = assembleWireSignature(ecdsa);
      const ok = await verifyClobAuthWireSignature({ fields, signature: wire, expectedOwner: OWNER.address });
      assert.ok(ok.ok);
      const headers = buildL1Headers(fields, wire);
      assert.equal(headers.XO_TIMESTAMP, fields.timestamp);
      assert.equal(headers.XO_NONCE, fields.nonce.toString());

      const variants: ClobAuthFields[] = [
        { ...fields, timestamp: String(Number(fields.timestamp) + 1) },
        { ...fields, nonce: fields.nonce + 1n },
        { ...fields, address: rng.address() },
      ];
      for (const variant of variants) {
        assert.notEqual(hashClobAuth(variant), hashClobAuth(fields));
        const bad = await verifyClobAuthWireSignature({ fields: variant, signature: wire, expectedOwner: OWNER.address });
        assert.ok(!bad.ok);
        assert.equal(bad.code, "owner_mismatch");
      }
    }
  });
});

describe("property: HMAC", () => {
  const credentials = { apiKey: "k", secret: "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm", passphrase: "p" };

  it("path-only equals path-with-query exactly when there is no query; any body change moves the signature", () => {
    const rng = new Rng(0x5eed40n);
    for (let i = 0; i < 100; i += 1) {
      const hasQuery = rng.below(2) === 1;
      const path = `/p${rng.bits(24).toString(16)}${hasQuery ? `?q=${rng.bits(24).toString(16)}` : ""}`;
      const body = rng.below(2) === 1 ? `{"v":"${rng.bits(48).toString(16)}"}` : "";
      const timestamp = String(1_700_000_000 + rng.below(100_000_000));
      const input = { credentials, timestamp, method: "POST", requestPath: path, body } as const;
      const a = signL2({ ...input, canonicalMode: "path-only" });
      const b = signL2({ ...input, canonicalMode: "path-with-query" });
      assert.equal(a === b, !hasQuery);
      assert.notEqual(signL2({ ...input, body: `${body}x`, canonicalMode: "path-with-query" }), b);
      assert.notEqual(signL2({ ...input, timestamp: String(Number(timestamp) + 1), canonicalMode: "path-with-query" }), b);
      assert.match(b, /^[A-Za-z0-9_-]{43}=$/);
    }
  });
});
