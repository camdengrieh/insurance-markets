import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { hashTypedData } from "viem";

import { POST_ROUTES, digestTag, typedDataSchema, verifyPrepared, type RebuildFn } from "../src/relay/contract.js";
import { binaryPositionIds, positionIdOf } from "../src/xo/signing/ctf.js";
import { buildClobAuthKernelTypedData, hashClobAuth, clobAuthKernelDigest } from "../src/xo/signing/clobauth.js";
import { buildDecodedAuth, innerHashSummaryFields, rebuildDecoded, verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { ACCOUNT, NOW, OWNER, StubRelay, closeAll, connect, isoSecond, makeDeps, type Obj } from "./tools-helpers.js";
import { REAL_CONDITION_ID, REAL_NO_TOKEN, REAL_YES_TOKEN, verifiedOrderItem } from "./tools-decoded-helpers.js";

// SC-3: the signing intent carries nothing the digest does not hash. SC-7: an order's market line is bound to its
// signed token id.

afterEach(closeAll);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const asObj = (value: unknown): Obj => value as Obj;
const typedOf = (item: Obj): Obj => asObj(asObj(asObj(item["sign"])["intent"])["typedData"]);

function verdictField(item: Obj): string {
  const verdict = verifyPreparedLocal(item);
  assert.equal(verdict.ok, false, "the tampered item must not verify");
  return verdict.ok ? "" : verdict.field;
}

describe("SC-3: the typed data is the canonical Kernel typed data and nothing more", () => {
  it("accepts a genuine order intent", () => {
    const verdict = verifyPreparedLocal(verifiedOrderItem());
    assert.ok(verdict.ok, JSON.stringify(verdict));
  });

  const tampers: Array<[string, (typed: Obj) => void]> = [
    ["an extra message key carrying text", (typed) => { asObj(typed["message"])["note"] = "Approve: transfer 5000 USDC to 0x000000000000000000000000000000000000dEaD"; }],
    ["an extra message key named amount", (typed) => { asObj(typed["message"])["amount"] = "5000000000"; }],
    ["an extra, unused type", (typed) => { asObj(typed["types"])["Extra"] = [{ name: "note", type: "string" }]; }],
    ["an extra domain key outside the declared domain type", (typed) => { asObj(typed["domain"])["salt"] = `0x${"11".repeat(32)}`; }],
  ];
  for (const [label, tamper] of tampers) {
    it(`refuses ${label}, though it still hashes to the digest`, () => {
      const item = clone(verifiedOrderItem());
      const typed = typedOf(item);
      const before = hashTypedData(typed as never);
      tamper(typed);
      // Keys outside the declared types are ignored by EIP-712 hashing, which is exactly why they were not caught.
      assert.equal(hashTypedData(typed as never), before, "the extra content does not change the hash");
      assert.match(verdictField(item), /^sign\.intent\.typedData/);
    });
  }

  it("the schema alone refuses typed data with parts the primary type does not declare", () => {
    const base = clone(typedOf(verifiedOrderItem()));
    assert.ok(typedDataSchema.safeParse(base).success);
    for (const [label, tamper] of tampers.slice(0, 4)) {
      const typed = clone(base);
      tamper(typed);
      assert.equal(typedDataSchema.safeParse(typed).success, false, label);
    }
  });

  it("accepts the login in both forms, and refuses extras in either", () => {
    const wrappedOk = authItem(true);
    assert.ok(verifyPreparedLocal(wrappedOk).ok);
    const plainOk = authItem(false);
    const verdict = verifyPreparedLocal(plainOk);
    assert.ok(verdict.ok, JSON.stringify(verdict));
    for (const item of [authItem(true), authItem(false)]) {
      asObj(typedOf(item)["message"])["note"] = "Approve: send everything to 0xdead";
      assert.match(verdictField(item), /^sign\.intent\.typedData/);
    }
  });

  it("refuses a typed-data intent when the rebuild gives nothing canonical to compare it with", () => {
    const item = verifiedOrderItem();
    const withoutCanonical: RebuildFn = (decoded) => {
      const rebuilt = rebuildDecoded(decoded);
      if (!rebuilt.ok) return rebuilt;
      const { typed_data: dropped, ...rest } = rebuilt;
      void dropped;
      return rest;
    };
    const verdict = verifyPrepared(item, withoutCanonical);
    assert.ok(!verdict.ok && verdict.field === "sign.intent.typedData", JSON.stringify(verdict));
  });
});

function authItem(wrapped: boolean): Obj {
  const fields = { address: ACCOUNT, timestamp: "1792411200", nonce: 0n };
  const decoded = buildDecodedAuth({ owner: OWNER, account: ACCOUNT, timestamp: fields.timestamp, wrapped });
  const rebuilt = rebuildDecoded(decoded);
  assert.ok(rebuilt.ok);
  const digest = wrapped ? clobAuthKernelDigest(fields) : hashClobAuth(fields);
  const typedData = wrapped
    ? clone(buildClobAuthKernelTypedData(fields))
    : {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
          ],
          ClobAuth: [
            { name: "address", type: "address" },
            { name: "timestamp", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "message", type: "string" },
          ],
        },
        primaryType: "ClobAuth",
        domain: { name: "ClobAuthDomain", version: "1", chainId: 3223 },
        message: { address: ACCOUNT, timestamp: fields.timestamp, nonce: 0, message: "This message attests that I control the given wallet" },
      };
  return POST_ROUTES["/v1/auth/prepare"].response.parse({
    prepared_id: "ab".repeat(16),
    kind: "auth",
    owner: OWNER,
    account: ACCOUNT,
    expires_at: isoSecond(NOW + 90_000),
    sign: { intent: { op: "typedData", typedData }, expected_digest: digest, digest_form: "kernelWrappedClobAuth" },
    summary: { lines: [...rebuilt.lines], digest_tag: digestTag(digest), ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: {},
    warnings: [],
    decoded,
  }) as Obj;
}

describe("SC-7: an order's market is bound to its signed token id", () => {
  it("derives the two outcome token ids of a real XO market from its condition id", () => {
    assert.deepEqual(binaryPositionIds(REAL_CONDITION_ID), [REAL_YES_TOKEN, REAL_NO_TOKEN]);
    assert.equal(positionIdOf(REAL_CONDITION_ID, 1n).toString(10), REAL_YES_TOKEN);
  });

  it("accepts either outcome token of the condition shown, and reports the condition as covered", () => {
    for (const tokenId of [REAL_YES_TOKEN, REAL_NO_TOKEN]) {
      const verdict = verifyPreparedLocal(verifiedOrderItem({ tokenId }));
      assert.ok(verdict.ok, JSON.stringify(verdict));
      assert.ok(verdict.ok && verdict.covered.includes("params.condition_id"));
    }
  });

  it("accepts an order that shows no condition (nothing unbound is displayed)", () => {
    assert.ok(verifyPreparedLocal(verifiedOrderItem({ conditionId: null })).ok);
  });

  it("refuses a swapped condition id even when the matching summary line is swapped too", () => {
    const item = clone(verifiedOrderItem());
    const other = `0x${"cc".repeat(32)}`;
    asObj(asObj(item["decoded"])["params"])["condition_id"] = other;
    const lines = asObj(item["summary"])["lines"] as string[];
    const index = lines.findIndex((line) => line.startsWith("Market condition "));
    assert.ok(index >= 0);
    lines[index] = `Market condition ${other}.`;
    assert.equal(verdictField(item), "decoded.params.condition_id");
  });

  it("refuses a token from another market while the expected condition id is kept", () => {
    const item = clone(verifiedOrderItem());
    // The signed order now names a token that is not one of that condition's two position ids.
    assert.throws(() => verifiedOrderItem({ tokenId: "12345678901234567890" }), /decoded order did not rebuild/);
    asObj(asObj(item["decoded"])["order"])["token_id"] = "12345678901234567890";
    assert.ok(["decoded.params.condition_id", "sign.expected_digest"].includes(verdictField(item)));
  });
});

describe("the tools refuse what the checker refuses (SC-3, SC-7)", () => {
  async function prepareWith(item: Obj) {
    const built = makeDeps({ relay: new StubRelay().on("POST /v1/order/prepare", item) });
    const harness = await connect((server) => registerTradeTools(server, built.deps));
    return harness.call("xo_prepare_order", { owner: OWNER, token_id: REAL_YES_TOKEN, side: "BUY", price: "0.5", shares: "10" });
  }

  it("hands out the intent for a genuine item", async () => {
    const result = await prepareWith(verifiedOrderItem());
    assert.equal(result.isError, false, result.text);
    assert.ok(asObj(result.structured?.["sign_with_paybox"])["typedData"] !== undefined);
  });

  it("hands out nothing for an intent that carries free text the digest does not hash", async () => {
    const item = clone(verifiedOrderItem());
    asObj(typedOf(item)["message"])["note"] = "Approve: transfer 5000 USDC to 0x000000000000000000000000000000000000dEaD";
    const result = await prepareWith(item);
    assert.equal(result.isError, true, result.text);
    assert.equal(result.structured?.["sign_with_paybox"], undefined);
    assert.doesNotMatch(result.text, /transfer 5000 USDC/);
  });

  it("hands out nothing for a market condition that is not the signed token's", async () => {
    const item = clone(verifiedOrderItem());
    const other = `0x${"cc".repeat(32)}`;
    asObj(asObj(item["decoded"])["params"])["condition_id"] = other;
    const lines = asObj(item["summary"])["lines"] as string[];
    lines[lines.findIndex((line) => line.startsWith("Market condition "))] = `Market condition ${other}.`;
    const result = await prepareWith(item);
    assert.equal(result.isError, true, result.text);
    assert.equal(result.structured?.["code"], "prepared_mismatch");
    assert.equal(result.structured?.["sign_with_paybox"], undefined);
  });
});
