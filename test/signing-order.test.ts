import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashTypedData, keccak256, stringToBytes, type Address } from "viem";

import {
  ORDER_TYPES,
  ORDER_TYPE_STRING,
  SigningError,
  assertOrder,
  buildKernelTypedData,
  buildOrderTypedData,
  type KernelSignTypedData,
  hashOrder,
  hashOrderStruct,
  kernelWrapDigest,
  orderFromWire,
  orderToWire,
  prepareClobAuthSigning,
  prepareOrderSigning,
  type SigningErrorCode,
  type XoOrder,
} from "../src/xo/signing/index.js";

// Public, checksummed Anvil addresses (test accounts 0 and 1). Never fund them.
const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const ORDER: XoOrder = {
  salt: 12345678901234567890n,
  maker: MAKER,
  signer: MAKER,
  beneficiary: ZERO,
  tokenId: 987654321n,
  makerAmount: 55_000_000n,
  takerAmount: 100_000_000n,
  expiration: 1791389400n,
  nonce: 0n,
  identifier: "0x00000000000000000000000000000000",
  metadata: "0x0000000000000000000000000000000000000000000000000000000000000000",
  side: 0,
  signatureType: 3,
};

function rejects(fn: () => unknown, code: SigningErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof SigningError && error.code === code, `expected ${code}`);
}

describe("order type definition", () => {
  it("has the 13 fields in typehash order and matches the pinned type string", () => {
    const rebuilt = `Order(${ORDER_TYPES.Order.map((f) => `${f.type} ${f.name}`).join(",")})`;
    assert.equal(rebuilt, ORDER_TYPE_STRING);
    assert.equal(ORDER_TYPES.Order.length, 13);
    assert.equal(
      keccak256(stringToBytes(rebuilt)),
      "0x17df2a5febe57967a2c9c03de6869c37c67cff602ecbe4f734aad39de2b172ef",
    );
  });

  it("never includes signature, taker or feeRateBps among the signed fields", () => {
    const names = ORDER_TYPES.Order.map((f) => f.name) as string[];
    for (const forbidden of ["signature", "taker", "feeRateBps"]) assert.ok(!names.includes(forbidden));
  });

  it("builds typed data on the pinned domain", () => {
    const typed = buildOrderTypedData(ORDER);
    assert.deepEqual(typed.domain, {
      name: "XO Market CLOB",
      version: "1",
      chainId: 3223,
      verifyingContract: "0x4bC5E872256D12E6017dfe466E04c867DC761B77",
    });
    assert.equal(typed.primaryType, "Order");
  });
});

describe("assertOrder guardrails (each one blocks the bad input)", () => {
  it("accepts the baseline order", () => {
    assert.doesNotThrow(() => assertOrder(ORDER));
  });

  it("rejects maker different from signer", () => {
    rejects(() => assertOrder({ ...ORDER, signer: OTHER }), "invalid_order");
    rejects(() => hashOrder({ ...ORDER, maker: OTHER }), "invalid_order");
  });

  it("rejects every signatureType except 3 (EOA type 0 is not accepted by XO)", () => {
    for (const value of [0, 1, 2, 4]) {
      rejects(() => assertOrder({ ...ORDER, signatureType: value as 3 }), "invalid_order");
    }
  });

  it("rejects an invalid side", () => {
    rejects(() => assertOrder({ ...ORDER, side: 2 as 0 }), "invalid_order");
    rejects(() => assertOrder({ ...ORDER, side: -1 as 0 }), "invalid_order");
  });

  it("rejects a non-zero beneficiary unless explicitly allowed", () => {
    rejects(() => assertOrder({ ...ORDER, beneficiary: OTHER }), "invalid_order");
    assert.doesNotThrow(() => assertOrder({ ...ORDER, beneficiary: OTHER }, { allowNonZeroBeneficiary: true }));
  });

  it("rejects zero and out-of-range amounts", () => {
    rejects(() => assertOrder({ ...ORDER, makerAmount: 0n }), "invalid_order");
    rejects(() => assertOrder({ ...ORDER, takerAmount: 0n }), "invalid_order");
    rejects(() => assertOrder({ ...ORDER, makerAmount: -1n }), "invalid_integer");
    rejects(() => assertOrder({ ...ORDER, takerAmount: 1n << 256n }), "invalid_integer");
  });

  it("rejects out-of-range salt, tokenId, expiration and nonce", () => {
    rejects(() => assertOrder({ ...ORDER, salt: -1n }), "invalid_integer");
    rejects(() => assertOrder({ ...ORDER, tokenId: 1n << 256n }), "invalid_integer");
    rejects(() => assertOrder({ ...ORDER, expiration: -5n }), "invalid_integer");
    rejects(() => assertOrder({ ...ORDER, nonce: 1n << 128n }), "invalid_integer");
    assert.doesNotThrow(() => assertOrder({ ...ORDER, nonce: (1n << 128n) - 1n }));
  });

  it("rejects numbers and strings where bigints are required", () => {
    rejects(() => assertOrder({ ...ORDER, salt: 5 as unknown as bigint }), "invalid_integer");
    rejects(() => assertOrder({ ...ORDER, tokenId: "5" as unknown as bigint }), "invalid_integer");
  });

  it("rejects malformed addresses, including a bad EIP-55 checksum", () => {
    rejects(() => assertOrder({ ...ORDER, maker: "0x1234" as Address, signer: "0x1234" as Address }), "invalid_address");
    const badChecksum = (MAKER.slice(0, 12) + MAKER.slice(12).toUpperCase()) as Address;
    assert.notEqual(badChecksum, MAKER);
    rejects(() => assertOrder({ ...ORDER, maker: badChecksum, signer: badChecksum }), "invalid_address");
  });

  it("rejects identifier and metadata of the wrong length", () => {
    rejects(() => assertOrder({ ...ORDER, identifier: "0x00" }), "invalid_hex");
    rejects(() => assertOrder({ ...ORDER, identifier: `0x${"00".repeat(32)}` }), "invalid_hex");
    rejects(() => assertOrder({ ...ORDER, metadata: `0x${"00".repeat(16)}` }), "invalid_hex");
    rejects(() => assertOrder({ ...ORDER, metadata: "not hex" as `0x${string}` }), "invalid_hex");
  });
});

describe("hashing", () => {
  it("is insensitive to address casing and hex casing but nothing else", () => {
    const lower = { ...ORDER, maker: MAKER.toLowerCase() as Address, signer: MAKER.toLowerCase() as Address };
    assert.equal(hashOrder(lower), hashOrder(ORDER));
    const upperMeta = { ...ORDER, metadata: `0x${"AB".repeat(32)}` as `0x${string}` };
    const lowerMeta = { ...ORDER, metadata: `0x${"ab".repeat(32)}` as `0x${string}` };
    assert.equal(hashOrder(upperMeta), hashOrder(lowerMeta));
  });

  it("each of the signed fields changes both the struct hash and the order hash", () => {
    const allow = { allowNonZeroBeneficiary: true };
    const variants: Array<[string, XoOrder]> = [
      ["salt", { ...ORDER, salt: ORDER.salt + 1n }],
      ["maker+signer", { ...ORDER, maker: OTHER, signer: OTHER }],
      ["beneficiary", { ...ORDER, beneficiary: OTHER }],
      ["tokenId", { ...ORDER, tokenId: ORDER.tokenId + 1n }],
      ["makerAmount", { ...ORDER, makerAmount: ORDER.makerAmount + 1n }],
      ["takerAmount", { ...ORDER, takerAmount: ORDER.takerAmount + 1n }],
      ["expiration", { ...ORDER, expiration: ORDER.expiration + 1n }],
      ["nonce", { ...ORDER, nonce: 1n }],
      ["identifier", { ...ORDER, identifier: "0x00000000000000000000000000000001" }],
      ["metadata", { ...ORDER, metadata: `0x${"00".repeat(31)}01` }],
      ["side", { ...ORDER, side: 1 }],
    ];
    const baseStruct = hashOrderStruct(ORDER, allow);
    const baseHash = hashOrder(ORDER, allow);
    for (const [name, variant] of variants) {
      assert.notEqual(hashOrderStruct(variant, allow), baseStruct, `${name} must change the struct hash`);
      assert.notEqual(hashOrder(variant, allow), baseHash, `${name} must change the order hash`);
    }
  });

  it("the Kernel wrap depends on the smart account as well as the hash", () => {
    const hash = hashOrder(ORDER);
    assert.notEqual(kernelWrapDigest(hash, MAKER), kernelWrapDigest(hash, OTHER));
    assert.notEqual(kernelWrapDigest(hash, MAKER), hash);
  });
});

describe("Kernel typed data for request_wallet_sign", () => {
  it("is plain JSON with no bigint and round-trips through JSON.stringify", () => {
    const typed = buildKernelTypedData(hashOrder(ORDER), MAKER);
    const roundTripped = JSON.parse(JSON.stringify(typed)) as unknown;
    assert.deepEqual(roundTripped, typed);
    assert.equal(typeof typed.domain.chainId, "number");
  });

  it("hashing the whole JSON object, explicit EIP712Domain included, gives the Kernel-wrapped digest", () => {
    const hash = hashOrder(ORDER);
    const parsed = JSON.parse(JSON.stringify(buildKernelTypedData(hash, MAKER))) as KernelSignTypedData;
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Kernel: [{ name: "hash", type: "bytes32" }],
    } as const;
    assert.deepEqual(parsed.types, types);
    const domain = { ...parsed.domain, chainId: BigInt(parsed.domain.chainId) };
    const digest = hashTypedData({ domain, types, primaryType: "Kernel", message: parsed.message });
    assert.equal(digest, kernelWrapDigest(hash, MAKER));
  });

  it("names the smart account as verifyingContract and Kernel 0.3.1 as the domain", () => {
    const typed = buildKernelTypedData(hashOrder(ORDER), MAKER);
    assert.equal(typed.domain.verifyingContract, MAKER);
    assert.equal(typed.domain.name, "Kernel");
    assert.equal(typed.domain.version, "0.3.1");
    assert.equal(typed.domain.chainId, 3223);
    assert.deepEqual(typed.types.Kernel, [{ name: "hash", type: "bytes32" }]);
  });

  it("rejects a hash that is not exactly 32 bytes", () => {
    rejects(() => buildKernelTypedData("0x1234", MAKER), "invalid_hex");
    rejects(() => buildKernelTypedData(`0x${"00".repeat(33)}`, MAKER), "invalid_hex");
    rejects(() => kernelWrapDigest("0x", MAKER), "invalid_hex");
  });
});

describe("wire conversion", () => {
  it("round-trips an order through the wire shape", () => {
    const wire = orderToWire(ORDER);
    assert.equal(wire.salt, "12345678901234567890");
    assert.equal(wire.side, 0);
    assert.equal(wire.signatureType, 3);
    assert.deepEqual(orderFromWire(wire), ORDER);
    assert.deepEqual(orderFromWire(JSON.parse(JSON.stringify(wire))), ORDER);
  });

  it("has exactly the 13 signed keys on the wire (no taker, feeRateBps or signature)", () => {
    assert.deepEqual(Object.keys(orderToWire(ORDER)).sort(), ORDER_TYPES.Order.map((f) => f.name).sort());
  });

  it("orderFromWire refuses hex, signed, padded, fractional and non-string integers", () => {
    const wire = orderToWire(ORDER);
    for (const bad of ["0x10", "-1", "01", "1.5", " 1", "1e3", ""]) {
      rejects(() => orderFromWire({ ...wire, salt: bad }), "invalid_integer");
    }
    rejects(() => orderFromWire({ ...wire, makerAmount: 55 }), "invalid_integer");
    rejects(() => orderFromWire({ ...wire, nonce: null }), "invalid_integer");
  });

  it("orderFromWire refuses a wrong signatureType or side and non-objects", () => {
    const wire = orderToWire(ORDER);
    rejects(() => orderFromWire({ ...wire, signatureType: 0 }), "invalid_order");
    rejects(() => orderFromWire({ ...wire, side: "0" }), "invalid_order");
    rejects(() => orderFromWire(null), "invalid_order");
    rejects(() => orderFromWire([]), "invalid_order");
    rejects(() => orderFromWire("order"), "invalid_order");
  });
});

describe("prepare helpers", () => {
  // The order expires at 1791389400; "now" is ten minutes earlier.
  const NOW_SECONDS = 1791388800;
  const EXPIRY = { nowSeconds: NOW_SECONDS, maxTtlSeconds: 3600 };

  it("prepareOrderSigning derives the digests and typed data from the order alone", () => {
    const request = prepareOrderSigning(ORDER, { expiry: EXPIRY });
    assert.equal(request.innerHash, hashOrder(ORDER));
    assert.equal(request.wrappedDigest, kernelWrapDigest(hashOrder(ORDER), MAKER));
    assert.equal(request.smartAccount, MAKER);
    assert.deepEqual(request.typedData, buildKernelTypedData(request.innerHash, MAKER));
    assert.equal(request.typedData.message.hash, request.innerHash);
  });

  it("prepareOrderSigning refuses what assertOrder refuses", () => {
    rejects(() => prepareOrderSigning({ ...ORDER, signer: OTHER }, { expiry: EXPIRY }), "invalid_order");
    rejects(() => prepareOrderSigning({ ...ORDER, beneficiary: OTHER }, { expiry: EXPIRY }), "invalid_order");
    assert.doesNotThrow(() => prepareOrderSigning({ ...ORDER, beneficiary: OTHER }, { expiry: EXPIRY, allowNonZeroBeneficiary: true }));
  });

  it("prepareOrderSigning will not produce a signable bearer order: no expiry, a past expiry or a far one is refused (SIGN-2)", () => {
    rejects(() => prepareOrderSigning({ ...ORDER, expiration: 0n }, { expiry: EXPIRY }), "never_expiring_order");
    rejects(() => prepareOrderSigning({ ...ORDER, expiration: BigInt(NOW_SECONDS) }, { expiry: EXPIRY }), "invalid_expiration");
    rejects(() => prepareOrderSigning({ ...ORDER, expiration: 1n }, { expiry: EXPIRY }), "invalid_expiration");
    rejects(() => prepareOrderSigning({ ...ORDER, expiration: BigInt(NOW_SECONDS + 3601) }, { expiry: EXPIRY }), "invalid_expiration");
    rejects(() => prepareOrderSigning({ ...ORDER, expiration: 2n ** 256n - 1n }, { expiry: EXPIRY }), "invalid_expiration");
    rejects(() => prepareOrderSigning({ ...ORDER, expiration: 10n ** 13n }, { expiry: EXPIRY }), "invalid_expiration");
    assert.doesNotThrow(() => prepareOrderSigning({ ...ORDER, expiration: BigInt(NOW_SECONDS + 3600) }, { expiry: EXPIRY }));
  });

  it("prepareOrderSigning applies the default one-hour window when no maximum is given, and a named one otherwise", () => {
    const order = { ...ORDER, expiration: BigInt(NOW_SECONDS + 7200) };
    rejects(() => prepareOrderSigning(order, { expiry: { nowSeconds: NOW_SECONDS } }), "invalid_expiration");
    assert.doesNotThrow(() => prepareOrderSigning(order, { expiry: { nowSeconds: NOW_SECONDS, maxTtlSeconds: 7200 } }));
    rejects(() => prepareOrderSigning(order, { expiry: { nowSeconds: NOW_SECONDS, maxTtlSeconds: 7200, minTtlSeconds: 7201 } }), "invalid_expiration");
  });

  it("prepareOrderSigning refuses an expiry window it cannot trust", () => {
    rejects(() => prepareOrderSigning(ORDER, { expiry: { nowSeconds: 0 } }), "invalid_expiration");
    rejects(() => prepareOrderSigning(ORDER, { expiry: { nowSeconds: NOW_SECONDS + 0.5 } }), "invalid_expiration");
    rejects(() => prepareOrderSigning(ORDER, { expiry: { nowSeconds: NOW_SECONDS, maxTtlSeconds: 0 } }), "invalid_expiration");
    assert.throws(() => prepareOrderSigning(ORDER, {} as never), SigningError);
  });

  it("prepareOrderSigning refuses a non-zero nonce unless the caller names it (SIGN-2)", () => {
    // Only nonce 0 is known to be accepted; the exchange may require the maker's on-chain counter.
    rejects(() => prepareOrderSigning({ ...ORDER, nonce: 5n }, { expiry: EXPIRY }), "invalid_order");
    rejects(() => prepareOrderSigning({ ...ORDER, nonce: 1n }, { expiry: EXPIRY }), "invalid_order");
    assert.doesNotThrow(() => prepareOrderSigning({ ...ORDER, nonce: 5n }, { expiry: EXPIRY, allowNonZeroNonce: true }));
    assert.doesNotThrow(() => prepareOrderSigning({ ...ORDER, nonce: 0n }, { expiry: EXPIRY }));
  });

  it("prepareClobAuthSigning binds the ClobAuth digest to the smart account", () => {
    const request = prepareClobAuthSigning({ address: MAKER, timestamp: "1791389400", nonce: 0n });
    assert.equal(request.smartAccount, MAKER);
    assert.equal(request.typedData.message.hash, request.innerHash);
    assert.notEqual(request.wrappedDigest, request.innerHash);
    rejects(() => prepareClobAuthSigning({ address: MAKER, timestamp: "soon", nonce: 0n }), "invalid_timestamp");
  });
});
