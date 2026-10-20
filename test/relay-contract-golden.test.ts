import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import { hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  digestTag,
  payboxIntentSchema,
  preparedSignSchema,
  toPayboxIntent,
  toPayboxSignArgs,
  type PreparedSign,
  type TypedData,
} from "../src/relay/contract.js";
import { kernelWrapDigest } from "../src/xo/signing/kernel.js";

// Golden test for the PayBox signing adapter (amendment A1). The field names below were read from
// the live request_wallet_sign tool definition (schema loaded, no call made): intent.op is "raw"
// with rawSigningPayloadHex, or "typedData" with typedData. There is NO `digest` and NO
// `typed_data` field. If PayBox renames a field, this file is where it shows.

// The relevant slice of the live tool's input schema, verbatim.
const LIVE_REQUEST_WALLET_SIGN_SCHEMA = {
  $defs: {
    WalletSignIntent: {
      oneOf: [
        { properties: { message: { type: "string" }, op: { const: "message", type: "string" } }, required: ["op", "message"], type: "object" },
        { properties: { op: { const: "typedData", type: "string" }, typedData: true }, required: ["op", "typedData"], type: "object" },
        { properties: { op: { const: "transaction", type: "string" }, transaction: true }, required: ["op", "transaction"], type: "object" },
        { properties: { authorization: true, op: { const: "authorization", type: "string" } }, required: ["op", "authorization"], type: "object" },
        { properties: { address: { type: "string" }, message: { type: "string" }, op: { const: "solanaMessage", type: "string" } }, required: ["op", "address", "message"], type: "object" },
        { properties: { address: { type: "string" }, op: { const: "solanaTransaction", type: "string" }, transactionBase64: { type: "string" } }, required: ["op", "address", "transactionBase64"], type: "object" },
        { properties: { op: { const: "raw", type: "string" }, rawSigningPayloadHex: { type: "string" } }, required: ["op", "rawSigningPayloadHex"], type: "object" },
      ],
    },
  },
  properties: { credential_id: { type: "string" }, intent: { $ref: "#/$defs/WalletSignIntent", type: "object" } },
  required: ["credential_id", "intent"],
  title: "RequestWalletSignArgs",
  type: "object",
} as const;

const validateLive = new Ajv2020({ strict: false, validateFormats: false }).compile(LIVE_REQUEST_WALLET_SIGN_SCHEMA);

// Public Anvil test key #1 (test only). Its address plays the smart account; nothing is typed as
// an address literal.
const ACCOUNT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d").address;
const INNER = `0x${"11".repeat(32)}` as const;
// Kernel(bytes32 hash) wrapper over INNER for ACCOUNT on chain 3223, computed once and pinned.
const WRAPPED_GOLDEN = "0x856ed8a1c490ddec6490183483981444fcc24ad70ea88fc3be1e01a929b64357";

function typedDataOf(inner: `0x${string}`): TypedData {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Kernel: [{ name: "hash", type: "bytes32" }],
    },
    primaryType: "Kernel",
    domain: { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: ACCOUNT },
    message: { hash: inner },
  };
}

// viem types typed data very strictly (chainId as bigint, const tuples); the wire form is JSON.
const hashWire = (data: TypedData): `0x${string}` => hashTypedData(data as unknown as Parameters<typeof hashTypedData>[0]);
const KERNEL_TYPED_DATA = typedDataOf(INNER);

const RAW_SIGN: PreparedSign = {
  intent: { op: "raw", rawSigningPayloadHex: `0x${"ab".repeat(32)}` },
  expected_digest: `0x${"ab".repeat(32)}`,
  digest_form: "userOpHash",
};

const TYPED_SIGN: PreparedSign = {
  intent: { op: "typedData", typedData: typedDataOf(INNER) },
  expected_digest: WRAPPED_GOLDEN,
  digest_form: "kernelWrappedOrderHash",
};

// Deterministic xorshift32: no Math.random, no clock.
function* digests(seed: number): Generator<`0x${string}`> {
  let state = seed >>> 0 || 1;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  for (;;) {
    let hex = "";
    for (let i = 0; i < 8; i += 1) hex += next().toString(16).padStart(8, "0");
    yield `0x${hex}`;
  }
}

describe("golden: the Kernel wrapper digest", () => {
  it("is the pinned value, from the signing module and from hashing the typed data directly", () => {
    assert.equal(kernelWrapDigest(INNER, ACCOUNT), WRAPPED_GOLDEN);
    assert.equal(hashWire(KERNEL_TYPED_DATA), WRAPPED_GOLDEN);
    assert.equal(digestTag(WRAPPED_GOLDEN), "856ed8a1c490ddec");
  });
});

describe("golden: toPayboxIntent pins the PayBox field names", () => {
  it("raw: exactly { op, rawSigningPayloadHex }, 0x-prefixed by default", () => {
    const intent = toPayboxIntent(RAW_SIGN);
    assert.deepEqual(intent, { op: "raw", rawSigningPayloadHex: `0x${"ab".repeat(32)}` });
    assert.deepEqual(Object.keys(intent), ["op", "rawSigningPayloadHex"]);
    assert.equal(JSON.stringify(intent), `{"op":"raw","rawSigningPayloadHex":"0x${"ab".repeat(32)}"}`);
  });

  it("raw: the prefix option strips 0x and nothing else changes", () => {
    const intent = toPayboxIntent(RAW_SIGN, { rawHexPrefix: "none" });
    assert.deepEqual(intent, { op: "raw", rawSigningPayloadHex: "ab".repeat(32) });
    assert.deepEqual(toPayboxIntent(RAW_SIGN, { rawHexPrefix: "0x" }), toPayboxIntent(RAW_SIGN));
  });

  it("raw: lower-cases the payload", () => {
    const upper: PreparedSign = {
      ...RAW_SIGN,
      intent: { op: "raw", rawSigningPayloadHex: `0x${"AB".repeat(32)}` },
      expected_digest: `0x${"AB".repeat(32)}`,
    };
    assert.equal((toPayboxIntent(upper) as { rawSigningPayloadHex: string }).rawSigningPayloadHex, `0x${"ab".repeat(32)}`);
  });

  it("typedData: exactly { op, typedData } with the Kernel(bytes32 hash) wrapper intact", () => {
    const intent = toPayboxIntent(TYPED_SIGN);
    assert.deepEqual(Object.keys(intent), ["op", "typedData"]);
    assert.equal(intent.op, "typedData");
    assert.deepEqual(intent, { op: "typedData", typedData: KERNEL_TYPED_DATA });
    assert.equal(hashWire((intent as { typedData: TypedData }).typedData), WRAPPED_GOLDEN);
  });

  it("typedData: returns a copy, not the caller's object", () => {
    const intent = toPayboxIntent(TYPED_SIGN) as unknown as { typedData: TypedData };
    assert.notEqual(intent.typedData, (TYPED_SIGN.intent as { typedData: TypedData }).typedData);
    intent.typedData.message["hash"] = "0x00";
    assert.equal((TYPED_SIGN.intent as { typedData: TypedData }).typedData.message["hash"], INNER);
  });

  it("the whole request_wallet_sign argument object is { credential_id, intent }", () => {
    const rawArgs = toPayboxSignArgs("cred-test", RAW_SIGN);
    assert.deepEqual(Object.keys(rawArgs), ["credential_id", "intent"]);
    assert.equal(
      JSON.stringify(rawArgs),
      `{"credential_id":"cred-test","intent":{"op":"raw","rawSigningPayloadHex":"0x${"ab".repeat(32)}"}}`,
    );
    const typedArgs = toPayboxSignArgs("cred-test", TYPED_SIGN);
    assert.equal(
      JSON.stringify(typedArgs),
      JSON.stringify({ credential_id: "cred-test", intent: { op: "typedData", typedData: KERNEL_TYPED_DATA } }),
    );
  });

  it("both outputs satisfy the live tool's input schema, with and without the prefix", () => {
    for (const args of [
      toPayboxSignArgs("cred-test", RAW_SIGN),
      toPayboxSignArgs("cred-test", RAW_SIGN, { rawHexPrefix: "none" }),
      toPayboxSignArgs("cred-test", TYPED_SIGN),
    ]) {
      assert.equal(validateLive(args), true, JSON.stringify(validateLive.errors));
    }
  });

  it("the pre-amendment shapes do NOT satisfy the live tool's input schema", () => {
    for (const intent of [
      { op: "raw", digest: `0x${"ab".repeat(32)}` },
      { op: "typedData", typed_data: KERNEL_TYPED_DATA },
      { op: "raw", rawSigningPayloadHex: undefined },
    ]) {
      assert.equal(validateLive({ credential_id: "cred-test", intent }), false, JSON.stringify(intent));
    }
  });

  it("the contract's own intent schema accepts exactly these shapes and no others", () => {
    assert.ok(payboxIntentSchema.safeParse(toPayboxIntent(RAW_SIGN)).success);
    assert.ok(payboxIntentSchema.safeParse(toPayboxIntent(TYPED_SIGN)).success);
    for (const bad of [
      { op: "raw", digest: `0x${"ab".repeat(32)}` },
      { op: "typedData", typed_data: KERNEL_TYPED_DATA },
      { op: "message", message: "hello" },
      { op: "transaction", transaction: {} },
      { op: "raw", rawSigningPayloadHex: "ab".repeat(32) },
      { op: "raw", rawSigningPayloadHex: "0x12" },
    ]) {
      assert.equal(payboxIntentSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});

describe("golden: toPayboxIntent refuses an intent that does not hash to expected_digest", () => {
  it("raw: flipping any one hex digit of the payload is refused (all 64 positions)", () => {
    for (let index = 2; index < 66; index += 1) {
      const original = RAW_SIGN.expected_digest[index] as string;
      const replacement = original === "0" ? "1" : "0";
      const mutated = RAW_SIGN.expected_digest.slice(0, index) + replacement + RAW_SIGN.expected_digest.slice(index + 1);
      const sign = { ...RAW_SIGN, intent: { op: "raw", rawSigningPayloadHex: mutated } } as PreparedSign;
      assert.throws(() => toPayboxIntent(sign), /sign block refused/, `position ${index}`);
    }
  });

  it("typedData: changing the inner hash, the account, the chain or the version is refused", () => {
    const base = typedDataOf(INNER);
    const variants: TypedData[] = [
      { ...base, message: { hash: `0x${"12".repeat(32)}` } },
      { ...base, domain: { ...base.domain, chainId: 1 } },
      { ...base, domain: { ...base.domain, version: "0.3.0" } },
      { ...base, domain: { ...base.domain, verifyingContract: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80").address } },
    ];
    for (const typedData of variants) {
      const sign: PreparedSign = { ...TYPED_SIGN, intent: { op: "typedData", typedData } };
      assert.throws(() => toPayboxIntent(sign), /sign block refused/);
    }
  });

  it("typedData: a user-operation digest form never takes typed data", () => {
    const sign = { ...TYPED_SIGN, digest_form: "userOpHash" } as PreparedSign;
    assert.throws(() => toPayboxIntent(sign), /sign block refused/);
  });

  it("refuses unknown keys and extra intent fields before anything reaches a signer", () => {
    assert.throws(() => toPayboxIntent({ ...RAW_SIGN, extra: 1 } as unknown as PreparedSign));
    assert.throws(() =>
      toPayboxIntent({ ...RAW_SIGN, intent: { ...RAW_SIGN.intent, digest: RAW_SIGN.expected_digest } } as unknown as PreparedSign),
    );
    assert.equal(preparedSignSchema.safeParse({ ...RAW_SIGN, digest_form: "somethingElse" }).success, false);
  });
});

describe("golden: property run with fixed seeds", () => {
  it("round-trips 200 seeded digests through the raw adapter and the live schema", () => {
    const source = digests(0x2545f491);
    for (let i = 0; i < 200; i += 1) {
      const digest = source.next().value as `0x${string}`;
      const sign: PreparedSign = { intent: { op: "raw", rawSigningPayloadHex: digest }, expected_digest: digest, digest_form: "userOpHash" };
      const args = toPayboxSignArgs("cred-test", sign);
      assert.equal((args.intent as { rawSigningPayloadHex: string }).rawSigningPayloadHex, digest);
      assert.equal(validateLive(args), true);
      assert.equal(digestTag(digest).length, 16);
    }
  });

  it("round-trips 100 seeded Kernel wrappers through the typedData adapter", () => {
    const source = digests(0x9e3779b9);
    for (let i = 0; i < 100; i += 1) {
      const inner = source.next().value as `0x${string}`;
      const typedData = typedDataOf(inner);
      const wrapped = kernelWrapDigest(inner, ACCOUNT);
      const sign: PreparedSign = { intent: { op: "typedData", typedData }, expected_digest: wrapped, digest_form: "kernelWrappedClobAuth" };
      const args = toPayboxSignArgs("cred-test", sign);
      assert.equal(hashWire((args.intent as unknown as { typedData: TypedData }).typedData), wrapped);
      assert.equal(validateLive(args), true);
    }
  });
});
