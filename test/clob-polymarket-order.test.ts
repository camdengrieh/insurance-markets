import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concatHex, encodeAbiParameters, hashTypedData, keccak256, recoverAddress, recoverTypedDataAddress, sliceHex, stringToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { depositWalletAddress } from "../src/clob/polymarket/deposit-wallet.js";
import {
  POLYMARKET_DEPOSIT_WALLET_SIGNATURE_BYTES,
  POLYMARKET_ORDER_TYPES,
  POLYMARKET_ORDER_TYPE_STRING,
  POLYMARKET_TYPED_DATA_SIGN_TYPE_STRING,
  assertPolymarketOrder,
  depositWalletTypedDataSignDigest,
  hashPolymarketDepositWalletOrder,
  hashPolymarketOrder,
  hashPolymarketOrderStruct,
  polymarketOrderDomain,
  polymarketOrderSignTypedData,
  polymarketOrderToWire,
  polymarketSigningDigest,
  wrapDepositWalletSignatureForDomain,
  wrapPolymarketDepositWalletSignature,
  type PolymarketOrder,
} from "../src/clob/polymarket/order.js";
import { POLYMARKET_EXCHANGES, polymarketBookOf } from "../src/clob/venues.js";
import { SigningError } from "../src/xo/signing/errors.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// The Polymarket order builder against a by-hand derivation of EIP-712. NOTHING here was signed or hashed by the
// venue: the vectors are derived in this file from the type string the docs give (place-orders.md, read 2026-10-21)
// and the standard EIP-712 encoding, so a test proves the builder agrees with that derivation and nothing more. The
// one exception is the Deposit Wallet vector copied from Polymarket's own Rust client's test suite (see below): it was
// produced by the official client, not by the venue's gateway. The public Anvil test key 0 plays the maker.

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
  it("accepts EOA (0) and Deposit Wallet (3) orders and refuses Proxy (1), Safe (2) and any other type", () => {
    assert.equal(assertPolymarketOrder(sample()).signatureType, 0);
    assert.equal(assertPolymarketOrder(sample({ signatureType: 3 })).signatureType, 3);
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

// ---- the Deposit Wallet (signatureType 3) ------------------------------------------------------------------------------------

// Polymarket/rs-clob-client-v2 tests/order.rs (commit 561830b9ee502c6e67cce314f0e53a80b8885b09),
// v2_poly1271_signing_matches_deposit_wallet_signature: the official client signs this order with tests/common/mod.rs
// PRIVATE_KEY (the public Hardhat/Anvil test key 0, which is ANVIL_TEST_ACCOUNTS[0] here) on Amoy (chain 80002) with
// the V2 exchange src/lib.rs CONFIG[80002].exchange_v2, domain version "2" (client.rs VERSION_V2), and expects exactly
// EXPECTED_POLY_1271_SIGNATURE below. The deposit wallet in that test is a placeholder address, not a real wallet.
const RS_AMOY_DOMAIN = { name: "Polymarket CTF Exchange", version: "2", chainId: 80002, verifyingContract: "0xE111180000d2663C0091e4f400237545B87B996B" as Address } as const;
const RS_DEPOSIT_WALLET = "0x1111111111111111111111111111111111111111" as Address;
const RS_EXPECTED_POLY_1271_SIGNATURE = [
  "0xa3a093c83b6c20c83355c16ce94c92e6e9fcbdeb840618cc74f6c57a42ad145b",
  "2b98db73d2c73cbf1f2b6af288566ae81960ddbc3a13921027358a8bff3be6ff1c",
  "a440cbd865bc0c6243d7a8df9a8bf48a8827b0a4abbb61c30e96d305423af148",
  "d23d42d3ad94e65d78258cecaf8dcbaddac0f73dc085040f2c12bb595dd83804",
  "4f726465722875696e743235362073616c742c61646472657373206d616b65722c",
  "61646472657373207369676e65722c75696e7432353620746f6b656e49642c75",
  "696e74323536206d616b6572416d6f756e742c75696e743235362074616b6572",
  "416d6f756e742c75696e743820736964652c75696e7438207369676e61747572",
  "65547970652c75696e743235362074696d657374616d702c6279746573333220",
  "6d657461646174612c62797465733332206275696c6465722900ba",
].join("");

function rsOrder(): PolymarketOrder {
  return {
    salt: 479_249_096_354n,
    maker: RS_DEPOSIT_WALLET,
    signer: RS_DEPOSIT_WALLET,
    tokenId: 1234n,
    makerAmount: 100_000_000n,
    takerAmount: 50_000_000n,
    side: 0,
    signatureType: 3,
    timestamp: 1_710_000_000_000n,
    metadata: ZERO32,
    builder: ZERO32,
  };
}

// TEST-ONLY key for the chain-137 vector: derived in this file from a fixed constant, never funded, never used anywhere
// else. It owns no wallet on any chain.
const TEST_ONLY_OWNER = privateKeyToAccount(keccak256(stringToHex("insurance-markets TEST-ONLY deposit wallet owner key; never funded")));
const TEST_WALLET = depositWalletAddress(TEST_ONLY_OWNER.address, "beacon");

function walletOrder(over: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return sample({ maker: TEST_WALLET, signer: TEST_WALLET, signatureType: 3, ...over });
}

// rs-clob-client-v2 client.rs sign_poly1271_order, step by step and independent of the code under test: the TypedDataSign
// struct hash from the type string written out here, then 0x1901 || appDomainSeparator || that hash.
const SOLADY_TYPE_STRING_BY_HAND =
  "TypedDataSign(Order contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)" +
  "Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)";

function rsDigestByHand(order: PolymarketOrder, book: "v2" | "ctf" | "neg_risk"): Hex {
  const typedDataSignStructHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }],
      [keccak256(stringToHex(SOLADY_TYPE_STRING_BY_HAND)), structHashByHand(order), keccak256(stringToHex("DepositWallet")), keccak256(stringToHex("1")), 137n, order.signer, ZERO32],
    ),
  );
  return keccak256(concatHex(["0x1901", domainSeparatorByHand(book), typedDataSignStructHash]));
}

describe("Polymarket Deposit Wallet orders (signatureType 3)", () => {
  it("reproduces rs-clob-client-v2's own expected POLY_1271 signature byte for byte (official client vector, Amoy domain)", async () => {
    assert.equal(MAKER.address, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "the rs tests' PRIVATE_KEY is the public test key 0");
    const digest = depositWalletTypedDataSignDigest(rsOrder(), RS_AMOY_DOMAIN);
    const inner = await MAKER.sign({ hash: digest });
    const wrapped = wrapDepositWalletSignatureForDomain(inner, rsOrder(), RS_AMOY_DOMAIN);
    assert.equal(wrapped, RS_EXPECTED_POLY_1271_SIGNATURE);
    // rs: `signed.signature.to_string().len() == 2 + 130 + 64 + 64 + (186 * 2) + 4`.
    assert.equal(wrapped.length, 2 + 130 + 64 + 64 + 186 * 2 + 4);
  });

  it("the type string the wrapper carries is the rs client's SOLADY_TYPE_STRING and the Order type string of 186 bytes", () => {
    assert.equal(POLYMARKET_TYPED_DATA_SIGN_TYPE_STRING, SOLADY_TYPE_STRING_BY_HAND);
    assert.equal(POLYMARKET_ORDER_TYPE_STRING.length, 186);
    assert.equal(POLYMARKET_DEPOSIT_WALLET_SIGNATURE_BYTES, 317);
  });

  it("on chain 137: the digest the owner signs equals the rs client's sign_poly1271_order digest re-derived by hand, for every book", () => {
    for (const book of ["v2", "ctf", "neg_risk"] as const) {
      const byHand = rsDigestByHand(walletOrder(), book);
      assert.equal(hashPolymarketDepositWalletOrder(walletOrder(), book), byHand, book);
      assert.equal(polymarketSigningDigest(walletOrder(), book), byHand, book);
      assert.notEqual(byHand, hashPolymarketOrder(walletOrder(), book), "the owner signs the wrapper, not the order hash");
    }
  });

  it("on chain 137: the TypedDataSign typed data PayBox is shown hashes to that digest, nests every order field and names the wallet", async () => {
    const typed = polymarketOrderSignTypedData(walletOrder(), "v2");
    assert.equal(typed.primaryType, "TypedDataSign");
    assert.deepEqual(typed.domain, { name: "Polymarket CTF Exchange", version: "3", chainId: 137, verifyingContract: POLYMARKET_EXCHANGES.v2.verifyingContract });
    const message = typed.message as Record<string, unknown>;
    assert.deepEqual(Object.keys(message), ["contents", "name", "version", "chainId", "verifyingContract", "salt"]);
    assert.deepEqual(Object.keys(message["contents"] as object), POLYMARKET_ORDER_TYPES.Order.map((field) => field.name));
    assert.equal((message["contents"] as Record<string, unknown>)["signatureType"], 3);
    assert.equal(message["name"], "DepositWallet");
    assert.equal(message["version"], "1");
    assert.equal(message["chainId"], "137");
    assert.equal(message["verifyingContract"], TEST_WALLET);
    assert.equal(message["salt"], ZERO32);
    assert.equal(hashTypedData(typed as never), rsDigestByHand(walletOrder(), "v2"));
    // Signing the JSON typed data (what PayBox does) and signing the raw digest give the same 65 bytes (RFC 6979).
    const viaTyped = await TEST_ONLY_OWNER.signTypedData(typed as never);
    const viaDigest = await TEST_ONLY_OWNER.sign({ hash: rsDigestByHand(walletOrder(), "v2") });
    assert.equal(viaTyped, viaDigest);
    assert.equal((await recoverTypedDataAddress({ ...(typed as object), signature: viaTyped } as never)).toLowerCase(), TEST_ONLY_OWNER.address.toLowerCase());
  });

  it("on chain 137: the wrapped signature is inner (65) || exchange domain separator (32) || contents hash (32) || type string (186) || length 0x00ba", async () => {
    const order = walletOrder();
    const digest = hashPolymarketDepositWalletOrder(order, "v2");
    const inner = await TEST_ONLY_OWNER.sign({ hash: digest });
    const wrapped = wrapPolymarketDepositWalletSignature(inner, order, "v2");
    assert.equal((wrapped.length - 2) / 2, 317);
    assert.equal(sliceHex(wrapped, 0, 65), inner.toLowerCase());
    assert.equal(sliceHex(wrapped, 65, 97), domainSeparatorByHand("v2"));
    assert.equal(sliceHex(wrapped, 97, 129), structHashByHand(order));
    assert.equal(sliceHex(wrapped, 129, 315), stringToHex(POLYMARKET_ORDER_TYPE_STRING).toLowerCase());
    assert.equal(sliceHex(wrapped, 315, 317), "0x00ba");
    assert.equal((await recoverAddress({ hash: digest, signature: sliceHex(wrapped, 0, 65) })).toLowerCase(), TEST_ONLY_OWNER.address.toLowerCase());
    // A different book is a different separator, so a wrapper for one exchange is useless at another.
    assert.notEqual(sliceHex(wrapPolymarketDepositWalletSignature(inner, order, "ctf"), 65, 97), sliceHex(wrapped, 65, 97));
  });

  it("refuses to wrap an EOA order, a signature that is not 65 bytes, and a Deposit Wallet order whose signer is not its maker", () => {
    assert.throws(() => wrapPolymarketDepositWalletSignature(`0x${"11".repeat(65)}`, sample(), "v2"), (error: unknown) => error instanceof SigningError && error.code === "invalid_order");
    assert.throws(() => wrapPolymarketDepositWalletSignature(`0x${"11".repeat(64)}`, walletOrder(), "v2"), (error: unknown) => error instanceof SigningError && error.code === "invalid_signature_length");
    assert.throws(() => assertPolymarketOrder(walletOrder({ signer: TEST_ONLY_OWNER.address })), /maker must equal order.signer for a Deposit Wallet order/);
    assert.throws(() => hashPolymarketDepositWalletOrder(sample(), "v2"), /signatureType 3/);
  });

  it("writes the wire object of a Deposit Wallet order with maker and signer the wallet and signatureType 3", () => {
    const wire = polymarketOrderToWire(walletOrder(), 0n);
    assert.equal(wire.maker, TEST_WALLET);
    assert.equal(wire.signer, TEST_WALLET);
    assert.equal(wire.signatureType, 3);
  });
});
