import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  concat,
  getAddress,
  keccak256,
  numberToHex,
  pad,
  recoverAddress,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  CLOB_AUTH_MESSAGE,
  CLOB_AUTH_TYPE_STRING,
  CTF_EXCHANGE_ADDRESS,
  KERNEL_ECDSA_VALIDATOR_ADDRESS,
  KERNEL_TYPE_STRING,
  ORDER_TYPE_STRING,
  assembleWireSignature,
  buildClobAuthKernelTypedData,
  buildKernelTypedData,
  buildL1Headers,
  buildL2Headers,
  clobAuthKernelDigest,
  computeOrderAmounts,
  hashClobAuth,
  hashClobAuthStruct,
  hashOrder,
  hashOrderStruct,
  kernelDomainSeparator,
  kernelWrapDigest,
  signL2,
  type XoOrder,
} from "../src/xo/signing/index.js";

// Golden vectors. Sources:
//   [07 s4]  docs/research/07-xo-bot-reference.md section 4, derived with Foundry cast and
//            re-derived by the note's verifier
//   [01 a/c] docs/research/01-xo-auth-signing.md sections (a) and (c)
// Each expected value is also derived below by a second, hand-rolled method (manual 32-byte
// word concatenation plus keccak256, no typed-data helper) and, outside the test run, by cast
// and openssl; see docs/signing-vectors.md.

// PUBLIC TEST KEY: Anvil/Hardhat default account 0. Never fund it.
const TEST_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_OWNER_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
// PUBLIC TEST ADDRESS: Anvil account 1, used only as a non-zero beneficiary.
const TEST_ADDRESS_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
// The placeholder maker that XO's own docs use. Lower case because the mixed-case spelling in the
// docs does not carry a valid EIP-55 checksum, and the same 20 bytes hash identically.
const SMART = "0xcafe000000000000000000000000000000000a11" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const Z16 = "0x00000000000000000000000000000000" as const;
const Z32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const account = privateKeyToAccount(TEST_KEY_0);

function baseOrder(overrides: Partial<XoOrder>): XoOrder {
  return {
    salt: 0n,
    maker: SMART,
    signer: SMART,
    beneficiary: ZERO,
    tokenId: 0n,
    makerAmount: 1n,
    takerAmount: 1n,
    expiration: 0n,
    nonce: 0n,
    identifier: Z16,
    metadata: Z32,
    side: 0,
    signatureType: 3,
    ...overrides,
  };
}

// ---- method 2: hand-rolled EIP-712, no typed-data helper ----
const word = (value: bigint): Hex => pad(numberToHex(value), { size: 32 });
const addressWord = (value: string): Hex => pad(value.toLowerCase() as Hex, { size: 32 });
const strHash = (value: string): Hex => keccak256(stringToBytes(value));
const digest1901 = (domainSeparator: Hex, structHash: Hex): Hex => keccak256(concat(["0x1901", domainSeparator, structHash]));

const DOMAIN4_TYPEHASH = keccak256(
  stringToBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);
const DOMAIN3_TYPEHASH = keccak256(stringToBytes("EIP712Domain(string name,string version,uint256 chainId)"));

function handOrderStructHash(o: XoOrder): Hex {
  return keccak256(
    concat([
      keccak256(stringToBytes(ORDER_TYPE_STRING)),
      word(o.salt),
      addressWord(o.maker),
      addressWord(o.signer),
      addressWord(o.beneficiary),
      word(o.tokenId),
      word(o.makerAmount),
      word(o.takerAmount),
      word(o.expiration),
      word(o.nonce),
      pad(o.identifier, { size: 32, dir: "right" }), // bytes16 is right-padded in abi.encode
      o.metadata,
      word(BigInt(o.side)),
      word(BigInt(o.signatureType)),
    ]),
  );
}

const handOrderDomainSeparator = keccak256(
  concat([DOMAIN4_TYPEHASH, strHash("XO Market CLOB"), strHash("1"), word(3223n), addressWord(CTF_EXCHANGE_ADDRESS)]),
);

function handKernelDomainSeparator(smartAccount: string): Hex {
  return keccak256(
    concat([DOMAIN4_TYPEHASH, strHash("Kernel"), strHash("0.3.1"), word(3223n), addressWord(smartAccount)]),
  );
}

function handWrap(innerHash: Hex, smartAccount: string): Hex {
  const structHash = keccak256(concat([keccak256(stringToBytes(KERNEL_TYPE_STRING)), innerHash]));
  return digest1901(handKernelDomainSeparator(smartAccount), structHash);
}

const handClobDomainSeparator = keccak256(
  concat([DOMAIN3_TYPEHASH, strHash("ClobAuthDomain"), strHash("1"), word(3223n)]),
);

function handClobStructHash(address: string, timestamp: string, nonce: bigint): Hex {
  return keccak256(
    concat([
      keccak256(stringToBytes(CLOB_AUTH_TYPE_STRING)),
      addressWord(address),
      strHash(timestamp),
      word(nonce),
      strHash(CLOB_AUTH_MESSAGE),
    ]),
  );
}

// HMAC-SHA256 from RFC 2104 using only the SHA-256 primitive (the implementation uses createHmac).
function handHmacSha256(key: Buffer, message: string): Buffer {
  const blockSize = 64;
  const k = key.length > blockSize ? createHash("sha256").update(key).digest() : key;
  const padded = Buffer.concat([k, Buffer.alloc(blockSize - k.length)]);
  const ipad = Buffer.from(padded.map((b) => b ^ 0x36));
  const opad = Buffer.from(padded.map((b) => b ^ 0x5c));
  const inner = createHash("sha256").update(ipad).update(message, "utf8").digest();
  return createHash("sha256").update(opad).update(inner).digest();
}

describe("constants and type hashes [07 s4, 01 c]", () => {
  it("matches the typehashes and domain separators printed in the notes", () => {
    assert.equal(
      keccak256(stringToBytes(ORDER_TYPE_STRING)),
      "0x17df2a5febe57967a2c9c03de6869c37c67cff602ecbe4f734aad39de2b172ef",
    );
    assert.equal(DOMAIN4_TYPEHASH, "0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f");
    assert.equal(DOMAIN3_TYPEHASH, "0xc2f8787176b8ac6bf7215b4adcc1e069bf4ab82d9ab1df05a57a91d425935b6e");
    assert.equal(
      keccak256(stringToBytes(KERNEL_TYPE_STRING)),
      "0x1547321c374afde8a591d972a084b071c594c275e36724931ff96c25f2999c83",
    );
    assert.equal(
      keccak256(stringToBytes(CLOB_AUTH_TYPE_STRING)),
      "0x52578c5c725a28a84fedc8c22aa47947822942f35b4dc350db028e45320e035c",
    );
    assert.equal(
      handOrderDomainSeparator,
      "0x377cb2cbb6c9bcc7400f72694c6fc43a929de4faf9ee0ce851a8c2cdd02260ae",
    );
    assert.equal(
      handClobDomainSeparator,
      "0x44e30cd10e3df85b868a7b3850e9e35945475365c26a07680811e3ff1e85197b",
    );
  });

  it("pins the validator and exchange addresses from the docs", () => {
    assert.equal(KERNEL_ECDSA_VALIDATOR_ADDRESS, "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57");
    assert.equal(CTF_EXCHANGE_ADDRESS, "0x4bC5E872256D12E6017dfe466E04c867DC761B77");
  });
});

describe("order vector A [07 s4 vectorA]: BUY, tokenId 123456789, 0.42 x 10, salt 99, exp 1791389400", () => {
  const amounts = computeOrderAmounts({ side: 0, price: "0.42", shares: "10" });
  const order = baseOrder({
    salt: 99n,
    tokenId: 123456789n,
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration: 1791389400n,
  });

  it("converts price and size to the documented amounts", () => {
    assert.equal(amounts.makerAmount, 4_200_000n);
    assert.equal(amounts.takerAmount, 10_000_000n);
  });

  it("struct hash and order hash equal the note, by the implementation and by hand", () => {
    const structHash = "0xb93cda9d1a93acbd73dce8fbf06235ad4b4f0cfa91ec4b58fcbff6e1ca31698b";
    const orderHash = "0xe7a911054f6ac70d4afd6d707d45e3922ed778547ff13f39d7819a32f78b0de6";
    assert.equal(hashOrderStruct(order), structHash);
    assert.equal(handOrderStructHash(order), structHash);
    assert.equal(hashOrder(order), orderHash);
    assert.equal(digest1901(handOrderDomainSeparator, handOrderStructHash(order)), orderHash);
  });

  it("wrapped digest and signature agree with cast (not in the notes)", async () => {
    const orderHash = "0xe7a911054f6ac70d4afd6d707d45e3922ed778547ff13f39d7819a32f78b0de6";
    const wrapped = "0xdf106666fb338795075dccfe9b7a3f3fd818d15cca3be9c2887f5a46d2d198c3";
    assert.equal(kernelWrapDigest(orderHash, SMART), wrapped);
    assert.equal(handWrap(orderHash, SMART), wrapped);
    assert.equal(
      await account.sign({ hash: wrapped }),
      "0xaa9df47dc49d0875e2021cbd1ba9526bab15b7209a7829848f4c8badfc3e7eff2c5a008bf2c2423f6b7f4f98dc92ec60e9d17fa65fb7594b3f3c341af85b57db1c",
    );
  });
});

describe("order vector B [07 s4 vectorB]: BUY, tokenId 5, 0.3 x 4, salt 7, expiration 0", () => {
  const amounts = computeOrderAmounts({ side: 0, price: "0.3", shares: "4" });
  const order = baseOrder({ salt: 7n, tokenId: 5n, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount });
  const orderHash = "0x82a01039202b975f6e72df3548784073a752df292a9fd4a4b6a4254e2354c8ff";
  const wrapped = "0xe1da1e6981c60c8be06301adf795d277e69fa7b96e7201ad797d68dfaaf16158";
  const ecdsa =
    "0x29b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c1c";
  const wire = `0x01845adb2c711129d4f3966735ed98a9f09fc4ce57${ecdsa.slice(2)}`;

  it("amounts and order hash", () => {
    assert.equal(amounts.makerAmount, 1_200_000n);
    assert.equal(amounts.takerAmount, 4_000_000n);
    assert.equal(hashOrder(order), orderHash);
    assert.equal(digest1901(handOrderDomainSeparator, handOrderStructHash(order)), orderHash);
  });

  it("Kernel domain separator and wrapped digest", () => {
    assert.equal(kernelDomainSeparator(SMART), "0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818");
    assert.equal(handKernelDomainSeparator(SMART), "0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818");
    assert.equal(kernelWrapDigest(orderHash, SMART), wrapped);
    assert.equal(handWrap(orderHash, SMART), wrapped);
  });

  it("the test key reproduces the note's signature over the wrapped digest, byte for byte", async () => {
    assert.equal(account.address, TEST_OWNER_0);
    assert.equal(await account.sign({ hash: wrapped }), ecdsa);
    assert.equal(await recoverAddress({ hash: wrapped, signature: ecdsa }), TEST_OWNER_0);
  });

  it("signing the Kernel typed data JSON gives the same 65 bytes as signing the digest", async () => {
    const typed = buildKernelTypedData(orderHash, SMART);
    assert.deepEqual(typed.domain, {
      name: "Kernel",
      version: "0.3.1",
      chainId: 3223,
      verifyingContract: getAddress(SMART),
    });
    assert.equal(typed.primaryType, "Kernel");
    assert.deepEqual(typed.message, { hash: orderHash });
    const viaTypedData = await account.signTypedData({
      domain: typed.domain,
      types: { Kernel: typed.types.Kernel },
      primaryType: "Kernel",
      message: typed.message,
    });
    assert.equal(viaTypedData, ecdsa);
  });

  it("assembles the 86-byte wire signature from the note", () => {
    const assembled = assembleWireSignature(ecdsa);
    assert.equal(assembled, wire);
    assert.equal((assembled.length - 2) / 2, 86);
  });
});

describe("ClobAuth vectors [07 s4 clobAuth] and [01 a]", () => {
  it("[07] timestamp 1791389400: struct, digest, wrapped digest, signature and header", async () => {
    const fields = { address: SMART, timestamp: "1791389400", nonce: 0n };
    const structHash = "0x0ddf259e437daad4d3e598a2e635eae681993f4b0c2e3ff53b4046db434c562f";
    const digest = "0x64a36fa69b02d5a273656445a2549ba8e1f2694743aad967273fa5943e198c1e";
    const wrapped = "0x4ed2d357e8765ce1f3d3c1bde491b31871015d7c8e9bd17fd608f38f4fe3b3cc";
    const ecdsa =
      "0x292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b";
    assert.equal(hashClobAuthStruct(fields), structHash);
    assert.equal(handClobStructHash(SMART, "1791389400", 0n), structHash);
    assert.equal(hashClobAuth(fields), digest);
    assert.equal(digest1901(handClobDomainSeparator, structHash), digest);
    assert.equal(clobAuthKernelDigest(fields), wrapped);
    assert.equal(handWrap(digest, SMART), wrapped);
    assert.equal(await account.sign({ hash: wrapped }), ecdsa);

    const wire = assembleWireSignature(ecdsa);
    assert.equal(wire, `0x01845adb2c711129d4f3966735ed98a9f09fc4ce57${ecdsa.slice(2)}`);
    const headers = buildL1Headers(fields, wire);
    assert.equal(headers.XO_ADDRESS, getAddress(SMART));
    assert.equal(headers.XO_TIMESTAMP, "1791389400");
    assert.equal(headers.XO_NONCE, "0");
    assert.ok(headers.XO_SIGNATURE.startsWith("0x01"));
  });

  it("[01] timestamp 1792344796: struct, digest and wrapped digest", () => {
    const fields = { address: SMART, timestamp: "1792344796", nonce: 0n };
    assert.equal(hashClobAuthStruct(fields), "0xf92057811cbe2d513ba534bf9512265ac75a01535c8a2e5f8686d0c036d90e4f");
    assert.equal(hashClobAuth(fields), "0x21acb038432cbba0686a58bd4985506d07bb935e13080b87f25b3d65557e7d11");
    assert.equal(clobAuthKernelDigest(fields), "0x6f0d66f4f6d133d4cdc7e04dd0e9841e5962322dc56bf6bb8078278ac51e3c6d");
    assert.equal(
      handWrap("0x21acb038432cbba0686a58bd4985506d07bb935e13080b87f25b3d65557e7d11", SMART),
      "0x6f0d66f4f6d133d4cdc7e04dd0e9841e5962322dc56bf6bb8078278ac51e3c6d",
    );
  });

  it("the L1 Kernel typed data carries the ClobAuth digest as its hash", () => {
    const typed = buildClobAuthKernelTypedData({ address: SMART, timestamp: "1791389400", nonce: 0n });
    assert.equal(typed.message.hash, "0x64a36fa69b02d5a273656445a2549ba8e1f2694743aad967273fa5943e198c1e");
    assert.equal(typed.domain.verifyingContract, getAddress(SMART));
  });
});

// Vectors below are not in the notes. They exercise what the note vectors do not (the notes'
// own verifier flagged the missing bytes16 case) and come from cast, not from this code.
describe("extra vector C (cast-derived): SELL with every field non-trivial", () => {
  const order = baseOrder({
    salt: 115792089237316195423570985008687907853269984665640564039457584007913129639935n,
    beneficiary: TEST_ADDRESS_1,
    tokenId: 113287701564209339913693347405685749986285999146352375265161592243948562084773n,
    makerAmount: 7_000_000n,
    takerAmount: 861_000n,
    expiration: 1791389460n,
    nonce: 340282366920938463463374607431768211455n,
    identifier: "0x0102030405060708090a0b0c0d0e0f10",
    metadata: "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    side: 1,
  });
  const options = { allowNonZeroBeneficiary: true };

  it("SELL 7 shares at 0.123 gives maker 7000000 and taker 861000 [07 s3 test 1]", () => {
    const amounts = computeOrderAmounts({ side: 1, price: "0.123", shares: "7" });
    assert.equal(amounts.makerAmount, 7_000_000n);
    assert.equal(amounts.takerAmount, 861_000n);
  });

  it("struct hash, order hash, wrapped digest and signature agree with cast", async () => {
    const structHash = "0xc80d98c1233fa0e827b2733f6ac33b9b56ba6e376353056c67d4851b1de9eb68";
    const orderHash = "0x57b93ade0040dd11ac27a5bf243448862cb5eb37548f51b95b6d3b581caf7b17";
    const wrapped = "0xcaf7295dd1a3fea94b7eb5bec3eca6a2eca718b346a6801d14e74b05c06d5b76";
    const ecdsa =
      "0x4db6ae48af737b995315eff1191be23097eda05175919e23cff294e130e2cd095e53124e9ab537cddd7c782571c2a71325d39b356b72f519d3336f70bc165fba1b";
    assert.equal(hashOrderStruct(order, options), structHash);
    assert.equal(handOrderStructHash(order), structHash);
    assert.equal(hashOrder(order, options), orderHash);
    assert.equal(kernelWrapDigest(orderHash, SMART), wrapped);
    assert.equal(handWrap(orderHash, SMART), wrapped);
    assert.equal(await account.sign({ hash: wrapped }), ecdsa);
  });
});

describe("extra vector L1c (cast-derived): ClobAuth with non-zero nonce and a different account", () => {
  it("matches cast", async () => {
    const fields = { address: TEST_OWNER_0, timestamp: "1792344796", nonce: 7n };
    assert.equal(hashClobAuthStruct(fields), "0x6f1d183abb07e94dd397dd02baa1061e012f74bc7c683db028c9ee4ec7ea7079");
    assert.equal(hashClobAuth(fields), "0x7f73e07485b669ef1737a75abbf1bd1c8c06b4ac848bb0869b660b231cbe9417");
    const wrapped = clobAuthKernelDigest(fields);
    assert.equal(handClobStructHash(TEST_OWNER_0, "1792344796", 7n), "0x6f1d183abb07e94dd397dd02baa1061e012f74bc7c683db028c9ee4ec7ea7079");
    assert.equal(handWrap(hashClobAuth(fields), TEST_OWNER_0), wrapped);
    assert.equal(wrapped, "0xaa0a9284912a3aaa38b342b133b0eb3e110fb145e91b846bc6628203d82f5111");
    assert.equal(
      await account.sign({ hash: wrapped }),
      "0x4d2875c00b676dcc52a36a699bfb22db4bb2597817961eaf37256801e395718756eebe58a717e8b72152bdde3b365d993a39840470803ee3d30d7c69a7133e511b",
    );
  });
});

describe("signing the Kernel typed data JSON equals signing the digest, for every signed vector", () => {
  const cases: Array<[string, Hex, Address, Hex]> = [
    ["A", "0xe7a911054f6ac70d4afd6d707d45e3922ed778547ff13f39d7819a32f78b0de6", SMART, "0xaa9df47dc49d0875e2021cbd1ba9526bab15b7209a7829848f4c8badfc3e7eff2c5a008bf2c2423f6b7f4f98dc92ec60e9d17fa65fb7594b3f3c341af85b57db1c"],
    ["B", "0x82a01039202b975f6e72df3548784073a752df292a9fd4a4b6a4254e2354c8ff", SMART, "0x29b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c1c"],
    ["C", "0x57b93ade0040dd11ac27a5bf243448862cb5eb37548f51b95b6d3b581caf7b17", SMART, "0x4db6ae48af737b995315eff1191be23097eda05175919e23cff294e130e2cd095e53124e9ab537cddd7c782571c2a71325d39b356b72f519d3336f70bc165fba1b"],
    ["L1a", "0x64a36fa69b02d5a273656445a2549ba8e1f2694743aad967273fa5943e198c1e", SMART, "0x292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b"],
    ["L1c", "0x7f73e07485b669ef1737a75abbf1bd1c8c06b4ac848bb0869b660b231cbe9417", TEST_OWNER_0, "0x4d2875c00b676dcc52a36a699bfb22db4bb2597817961eaf37256801e395718756eebe58a717e8b72152bdde3b365d993a39840470803ee3d30d7c69a7133e511b"],
  ];
  for (const [name, innerHash, smartAccount, expected] of cases) {
    it(`vector ${name}`, async () => {
      const typed = buildKernelTypedData(innerHash, smartAccount);
      const viaTypedData = await account.signTypedData({
        domain: typed.domain,
        types: { Kernel: typed.types.Kernel },
        primaryType: "Kernel",
        message: typed.message,
      });
      assert.equal(viaTypedData, expected);
      assert.equal(await account.sign({ hash: kernelWrapDigest(innerHash, smartAccount) }), expected);
    });
  }
});

describe("HMAC vectors [07 s4 hmacL2] plus openssl-derived extras", () => {
  const secret = "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm";
  const credentials = { apiKey: "00000000-0000-4000-8000-000000000000", secret, passphrase: "test-passphrase" };

  it("[07] POST /order with a body, path-only and path-with-query agree when there is no query", () => {
    const expected = "1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q=";
    for (const canonicalMode of ["path-only", "path-with-query"] as const) {
      const input = {
        credentials,
        timestamp: "1791389400",
        method: "POST",
        requestPath: "/order",
        body: '{"orderType":"GTC"}',
        canonicalMode,
      };
      assert.equal(signL2(input), expected);
    }
    // second method: RFC 2104 by hand over the base64-decoded secret
    const byHand = handHmacSha256(Buffer.from(secret, "base64"), '1791389400POST/order{"orderType":"GTC"}')
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    assert.equal(byHand, expected);
  });

  it("[openssl] a query string separates the two canonical modes", () => {
    const base = { credentials, timestamp: "1791389400", method: "GET", requestPath: "/orders?next_cursor=&market=0xabc" };
    // "/orders" (path only) is signed in one case and the full target in the other.
    assert.equal(
      signL2({ ...base, canonicalMode: "path-only" }),
      handHmacSha256(Buffer.from(secret, "base64"), "1791389400GET/orders")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_"),
    );
    assert.equal(
      signL2({ ...base, canonicalMode: "path-with-query" }),
      "QD0vYcxOrBKpZW-C6J1Dbb4Vp1zEK5FX8c_ykzfg84A=",
    );
    assert.equal(
      signL2({ ...base, requestPath: "/orders", canonicalMode: "path-only" }),
      "JmJz5GTC0PCT50UblUg_HYRptQQgTbzWi7_NedprQw0=",
    );
  });

  it("[openssl] hand-rolled RFC 2104 agrees on the remaining HMAC vectors", () => {
    const urlSafe = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    const key = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    assert.equal(urlSafe(handHmacSha256(key("+//+/fz7+//+/fz7+//+/fz7"), '1791389401DELETE/order{"orderID":"42"}')), "qOUvNF1hm3SJNxyZ9mu1V-R3W7AgyGgWnUxrxGu-XM0=");
    assert.equal(urlSafe(handHmacSha256(key("dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ="), "1791389402GET/orders?limit=10")), "GUZXPTS1RzA3YpoR74CzvsqToddkb4zWuZOlGlv-N-w=");
    assert.equal(urlSafe(handHmacSha256(key(secret), "1791389500GET/book")), "IJ8RYppty9OUNy57PaQArGhs96Dm-OcLHbDEZx5C0nk=");
    assert.equal(urlSafe(handHmacSha256(key(secret), "1791389400GET/orders?next_cursor=&market=0xabc")), "QD0vYcxOrBKpZW-C6J1Dbb4Vp1zEK5FX8c_ykzfg84A=");
  });

  it("[openssl] standard and URL-safe secret spellings give the same key", () => {
    const input = { timestamp: "1791389401", method: "DELETE", requestPath: "/order", body: '{"orderID":"42"}', canonicalMode: "path-only" } as const;
    const expected = "qOUvNF1hm3SJNxyZ9mu1V-R3W7AgyGgWnUxrxGu-XM0=";
    for (const s of ["+//+/fz7+//+/fz7+//+/fz7", "-__-_fz7-__-_fz7-__-_fz7"]) {
      assert.equal(signL2({ ...input, credentials: { ...credentials, secret: s } }), expected);
    }
  });

  it("[openssl] the OpenAPI example secret works with and without its '=' padding", () => {
    const input = { timestamp: "1791389402", method: "GET", requestPath: "/orders?limit=10", canonicalMode: "path-with-query" } as const;
    const expected = "GUZXPTS1RzA3YpoR74CzvsqToddkb4zWuZOlGlv-N-w=";
    const padded = "dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ=";
    assert.equal(signL2({ ...input, credentials: { ...credentials, secret: padded } }), expected);
    assert.equal(signL2({ ...input, credentials: { ...credentials, secret: padded.replace(/=+$/, "") } }), expected);
  });

  it("[openssl] output uses the URL-safe alphabet and keeps '=' padding", () => {
    const signature = signL2({
      credentials,
      timestamp: "1791389500",
      method: "GET",
      requestPath: "/book",
      canonicalMode: "path-only",
    });
    assert.equal(signature, "IJ8RYppty9OUNy57PaQArGhs96Dm-OcLHbDEZx5C0nk=");
    assert.match(signature, /^[A-Za-z0-9_-]+={0,2}$/);
    assert.ok(signature.endsWith("="));
  });

  it("builds the four XO_* headers and no POLY_* names", () => {
    const headers = buildL2Headers({
      credentials,
      timestamp: "1791389400",
      method: "post",
      requestPath: "/order",
      body: '{"orderType":"GTC"}',
      canonicalMode: "path-only",
    });
    assert.deepEqual(Object.keys(headers).sort(), ["XO_API_KEY", "XO_PASSPHRASE", "XO_SIGNATURE", "XO_TIMESTAMP"]);
    assert.equal(headers.XO_SIGNATURE, "1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q=");
    assert.equal(headers.XO_TIMESTAMP, "1791389400");
  });
});

describe("note 01 sample-order vector", () => {
  // The OpenAPI sample order's tokenId is elided in the note ("2651...6943"), so struct hash
  // 0x6dde3587...ef9f, orderHash 0x553d58fd...e723 and wrapped digest 0x9137675d...bf8b cannot be
  // rebuilt from the repo. The constants those hashes sit on are covered above. Recorded so the
  // gap is visible in the test run and not silently dropped.
  it("is not reproducible from the repo", { skip: "tokenId elided in docs/research/01 section (c)" }, () => {});
});
