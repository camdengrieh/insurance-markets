import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concatHex, encodeAbiParameters, keccak256, recoverTypedDataAddress, stringToHex, type Hex } from "viem";

import { LIMITLESS_ORDER_TYPES, LIMITLESS_ORDER_TYPE_STRING, assertLimitlessOrder, hashLimitlessOrder, hashLimitlessOrderStruct, limitlessOrderDomain, limitlessOrderSignTypedData, limitlessOrderToWire, type LimitlessOrder } from "../src/clob/limitless/order.js";
import { LIMITLESS_EXCHANGES } from "../src/clob/venues.js";
import { SigningError } from "../src/xo/signing/errors.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// The Limitless order builder against a by-hand derivation of EIP-712 (eip712-signing, read 2026-10-21). Nothing here
// was signed or hashed by the venue: the test names say "derived here" for that reason. Public Anvil test key 0 is the
// maker; the exchange is the one pinned address.

const MAKER = ANVIL_TEST_ACCOUNTS[0]!;
const EXCHANGE = LIMITLESS_EXCHANGES[0]!;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

function sample(over: Partial<LimitlessOrder> = {}): LimitlessOrder {
  return {
    salt: 1792411200123n,
    maker: MAKER.address,
    signer: MAKER.address,
    taker: ZERO,
    tokenId: 68215442288791572296498952759094916177229244750752613990844701608971303593663n,
    makerAmount: 5_000_000n,
    takerAmount: 10_000_000n,
    expiration: 0n,
    nonce: 0n,
    feeRateBps: 0n,
    side: 0,
    signatureType: 0,
    ...over,
  };
}

const DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

function domainSeparatorByHand(): Hex {
  const domain = limitlessOrderDomain(EXCHANGE);
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [keccak256(stringToHex(DOMAIN_TYPE)), keccak256(stringToHex(domain.name)), keccak256(stringToHex(domain.version)), BigInt(domain.chainId), domain.verifyingContract],
    ),
  );
}

function structHashByHand(order: LimitlessOrder): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint8" },
        { type: "uint8" },
      ],
      [keccak256(stringToHex(LIMITLESS_ORDER_TYPE_STRING)), order.salt, order.maker, order.signer, order.taker, order.tokenId, order.makerAmount, order.takerAmount, order.expiration, order.nonce, order.feeRateBps, order.side, order.signatureType],
    ),
  );
}

describe("Limitless order typehash and digest, derived here (not verified against a venue-signed vector)", () => {
  it("spells the twelve signed fields of eip712-signing in order, and the type string matches the types table", () => {
    const fromTypes = `Order(${LIMITLESS_ORDER_TYPES.Order.map((field) => `${field.type} ${field.name}`).join(",")})`;
    assert.equal(fromTypes, LIMITLESS_ORDER_TYPE_STRING);
    assert.deepEqual(
      LIMITLESS_ORDER_TYPES.Order.map((field) => field.name),
      ["salt", "maker", "signer", "taker", "tokenId", "makerAmount", "takerAmount", "expiration", "nonce", "feeRateBps", "side", "signatureType"],
    );
  });

  it("hashes the struct and the digest as EIP-712 says, derived by hand", () => {
    assert.equal(hashLimitlessOrderStruct(sample()), structHashByHand(sample()));
    assert.equal(hashLimitlessOrder(sample(), EXCHANGE), keccak256(concatHex(["0x1901", domainSeparatorByHand(), structHashByHand(sample())])));
  });

  it("pins the domain: Limitless CTF Exchange, version 1, chain 8453, and refuses an exchange that is not pinned", () => {
    assert.deepEqual(limitlessOrderDomain(EXCHANGE), { name: "Limitless CTF Exchange", version: "1", chainId: 8453, verifyingContract: EXCHANGE });
    assert.equal(limitlessOrderDomain(EXCHANGE.toLowerCase() as `0x${string}`).verifyingContract, EXCHANGE, "the checksummed spelling is what is signed");
    assert.throws(() => limitlessOrderDomain(MAKER.address), /not one this build is pinned to/);
  });

  it("the JSON typed data a wallet signs recovers the maker after an EOA signature (local test key)", async () => {
    const typed = limitlessOrderSignTypedData(sample(), EXCHANGE);
    const signature = await MAKER.signTypedData(typed as never);
    const recovered = await recoverTypedDataAddress({ ...typed, signature } as never);
    assert.equal(recovered.toLowerCase(), MAKER.address.toLowerCase());
    assert.deepEqual(Object.keys(typed.message), LIMITLESS_ORDER_TYPES.Order.map((field) => field.name));
  });
});

describe("Limitless order assertions follow the documented conventions", () => {
  const refuses = (over: Partial<LimitlessOrder>, pattern: RegExp): void => {
    assert.throws(() => assertLimitlessOrder(sample(over)), (error: unknown) => error instanceof SigningError && pattern.test(error.message));
  };
  it("nonce must be 0, expiration must be 0, taker the zero address, signer the maker, signature type 0", () => {
    refuses({ nonce: 1n }, /nonce must be 0/);
    refuses({ expiration: 1792411500n }, /expiration must be 0/);
    refuses({ taker: MAKER.address }, /taker must be the zero address/);
    refuses({ signer: ANVIL_TEST_ACCOUNTS[1]!.address }, /maker must equal order.signer/);
    refuses({ signatureType: 3 }, /only EOA orders/);
    refuses({ makerAmount: 0n }, /non-zero/);
    refuses({ salt: 0n }, /salt/);
    refuses({ feeRateBps: 10_001n }, /basis-point/);
  });

  it("writes the wire object with decimal strings for the uint256 fields and numbers for the two uint8 ones", () => {
    assert.deepEqual(limitlessOrderToWire(sample({ feeRateBps: 40n })), {
      salt: "1792411200123",
      maker: MAKER.address,
      signer: MAKER.address,
      taker: ZERO,
      tokenId: "68215442288791572296498952759094916177229244750752613990844701608971303593663",
      makerAmount: "5000000",
      takerAmount: "10000000",
      expiration: "0",
      nonce: "0",
      feeRateBps: "40",
      side: 0,
      signatureType: 0,
    });
  });
});
