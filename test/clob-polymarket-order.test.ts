import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concatHex, encodeAbiParameters, keccak256, recoverTypedDataAddress, stringToHex, type Hex } from "viem";

import { POLYMARKET_ORDER_TYPES, POLYMARKET_ORDER_TYPE_STRING, assertPolymarketOrder, hashPolymarketOrder, hashPolymarketOrderStruct, polymarketOrderDomain, polymarketOrderSignTypedData, polymarketOrderToWire, type PolymarketOrder } from "../src/clob/polymarket/order.js";
import { POLYMARKET_EXCHANGES, polymarketBookOf } from "../src/clob/venues.js";
import { SigningError } from "../src/xo/signing/errors.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// The Polymarket order builder against a by-hand derivation of EIP-712. NOTHING here was signed or hashed by the
// venue: the vectors are derived in this file from the type string the docs give (place-orders.md, read 2026-10-21)
// and the standard EIP-712 encoding, so a test proves the builder agrees with that derivation and nothing more. The
// public Anvil test key 0 plays the maker.

const MAKER = ANVIL_TEST_ACCOUNTS[0]!;
const ZERO32 = `0x${"00".repeat(32)}` as const;

function sample(over: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    salt: 123456789n,
    maker: MAKER.address,
    signer: MAKER.address,
    tokenId: 74611051635435493013469257818411865069553882173471237703549469284847187679089n,
    makerAmount: 5_200_000n,
    takerAmount: 10_000_000n,
    side: 0,
    signatureType: 0,
    timestamp: 1792411200000n,
    metadata: ZERO32,
    builder: ZERO32,
    ...over,
  };
}

const DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

function domainSeparatorByHand(book: "v2" | "ctf" | "neg_risk"): Hex {
  const domain = polymarketOrderDomain(book);
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [keccak256(stringToHex(DOMAIN_TYPE)), keccak256(stringToHex(domain.name)), keccak256(stringToHex(domain.version)), BigInt(domain.chainId), domain.verifyingContract],
    ),
  );
}

function structHashByHand(order: PolymarketOrder): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [keccak256(stringToHex(POLYMARKET_ORDER_TYPE_STRING)), order.salt, order.maker, order.signer, order.tokenId, order.makerAmount, order.takerAmount, order.side, order.signatureType, order.timestamp, order.metadata, order.builder],
    ),
  );
}

describe("Polymarket order typehash and digest, derived here (not verified against a venue-signed vector)", () => {
  it("spells the eleven signed fields of place-orders.md in order, and the type string matches the types table", () => {
    const fromTypes = `Order(${POLYMARKET_ORDER_TYPES.Order.map((field) => `${field.type} ${field.name}`).join(",")})`;
    assert.equal(fromTypes, POLYMARKET_ORDER_TYPE_STRING);
    assert.deepEqual(
      POLYMARKET_ORDER_TYPES.Order.map((field) => field.name),
      ["salt", "maker", "signer", "tokenId", "makerAmount", "takerAmount", "side", "signatureType", "timestamp", "metadata", "builder"],
    );
  });

  it("hashes the struct as keccak256(abi.encode(typehash, ...fields)), derived by hand", () => {
    assert.equal(hashPolymarketOrderStruct(sample()), structHashByHand(sample()));
  });

  for (const book of ["v2", "ctf", "neg_risk"] as const) {
    it(`hashes the ${book} book order as keccak256(0x1901 || domainSeparator || structHash), derived by hand`, () => {
      const expected = keccak256(concatHex(["0x1901", domainSeparatorByHand(book), structHashByHand(sample())]));
      assert.equal(hashPolymarketOrder(sample(), book), expected);
    });
  }

  it("pins the three domains the docs name: name, version 3 or 2, chain 137, and the three exchange addresses", () => {
    assert.deepEqual(polymarketOrderDomain("v2"), { name: "Polymarket CTF Exchange", version: "3", chainId: 137, verifyingContract: POLYMARKET_EXCHANGES.v2.verifyingContract });
    assert.deepEqual(polymarketOrderDomain("ctf"), { name: "Polymarket CTF Exchange", version: "2", chainId: 137, verifyingContract: POLYMARKET_EXCHANGES.ctf.verifyingContract });
    assert.deepEqual(polymarketOrderDomain("neg_risk"), { name: "Polymarket CTF Exchange", version: "2", chainId: 137, verifyingContract: POLYMARKET_EXCHANGES.neg_risk.verifyingContract });
    assert.equal(polymarketBookOf("3", POLYMARKET_EXCHANGES.v2.verifyingContract.toLowerCase()), "v2");
    assert.equal(polymarketBookOf("2", POLYMARKET_EXCHANGES.v2.verifyingContract), undefined, "a wrong version for the exchange is no book");
    assert.equal(polymarketBookOf("3", POLYMARKET_EXCHANGES.ctf.verifyingContract), undefined);
  });

  it("gives a different digest per book for the same order (a signature for one exchange is useless at another)", () => {
    const digests = new Set(["v2", "ctf", "neg_risk"].map((book) => hashPolymarketOrder(sample(), book as "v2")));
    assert.equal(digests.size, 3);
  });

  it("the JSON typed data a wallet signs hashes to the same digest and recovers the maker after an EOA signature (local test key)", async () => {
    const typed = polymarketOrderSignTypedData(sample(), "v2");
    const signature = await MAKER.signTypedData(typed as never);
    const recovered = await recoverTypedDataAddress({ ...typed, signature } as never);
    assert.equal(recovered.toLowerCase(), MAKER.address.toLowerCase());
    assert.equal(typed.domain.verifyingContract, POLYMARKET_EXCHANGES.v2.verifyingContract);
    assert.deepEqual(Object.keys(typed.message), POLYMARKET_ORDER_TYPES.Order.map((field) => field.name));
  });
});

describe("Polymarket order assertions", () => {
  it("refuses a Deposit Wallet order (signatureType 3) as not implemented, and any other non-EOA type", () => {
    assert.throws(() => assertPolymarketOrder(sample({ signatureType: 3 })), (error: unknown) => error instanceof SigningError && error.code === "not_implemented");
    for (const type of [1, 2, 4]) assert.throws(() => assertPolymarketOrder(sample({ signatureType: type })), (error: unknown) => error instanceof SigningError && error.code === "invalid_order");
  });

  it("refuses a signer that is not the maker, zero amounts, a zero salt and a salt above MAX_SAFE_INTEGER", () => {
    const other = ANVIL_TEST_ACCOUNTS[1]!.address;
    assert.throws(() => assertPolymarketOrder(sample({ signer: other })), /maker must equal order.signer/);
    assert.throws(() => assertPolymarketOrder(sample({ makerAmount: 0n })), /non-zero/);
    assert.throws(() => assertPolymarketOrder(sample({ salt: 0n })), /salt/);
    assert.throws(() => assertPolymarketOrder(sample({ salt: BigInt(Number.MAX_SAFE_INTEGER) + 1n })), /salt/);
  });

  it("normalises address case so a spelling difference cannot change the digest", () => {
    const lowerCased = sample({ maker: MAKER.address.toLowerCase() as `0x${string}`, signer: MAKER.address.toLowerCase() as `0x${string}` });
    assert.equal(hashPolymarketOrder(lowerCased, "ctf"), hashPolymarketOrder(sample(), "ctf"));
  });

  it("writes the POST /order wire object with the documented spellings: salt a number, side a word, amounts and timestamp strings, expiration a string", () => {
    const wire = polymarketOrderToWire(sample(), 0n);
    assert.deepEqual(wire, {
      salt: 123456789,
      maker: MAKER.address,
      signer: MAKER.address,
      tokenId: "74611051635435493013469257818411865069553882173471237703549469284847187679089",
      makerAmount: "5200000",
      takerAmount: "10000000",
      side: "BUY",
      signatureType: 0,
      timestamp: "1792411200000",
      metadata: ZERO32,
      builder: ZERO32,
      expiration: "0",
    });
    assert.equal(polymarketOrderToWire(sample({ side: 1 }), 1792411500n).side, "SELL");
    assert.equal(polymarketOrderToWire(sample(), 1792411500n).expiration, "1792411500");
  });
});
