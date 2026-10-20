import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress } from "viem";

import { START_MARGIN_MS, S2_ALLOWED_KINDS, S2_ALLOWED_OPS, vetForSigning, type VetResult } from "../../paybox-signer.js";
import type { Obj } from "../../../test/tools-helpers.js";
import { ACCOUNT, ID_AUTH, ID_ORDER, ID_USEROP, authItem, child, deployItem, digestOf, edit, orderItem } from "./fixtures.js";

// vetForSigning: the only way to get something the signing path will sign (M5-3). Pure; time is passed in.

const NOW = Date.parse("2026-10-19T12:00:00Z");
const vet = (item: unknown, nowMs = NOW): VetResult => vetForSigning(item, { nowMs });
function refusal(item: unknown, nowMs = NOW): { reason: string; field?: string } {
  const result = vet(item, nowMs);
  assert.equal(result.ok, false, "expected a refusal");
  if (result.ok) throw new Error("unreachable");
  return result;
}

describe("what may be signed", () => {
  it("accepts a verified user operation (raw), a verified order (typedData) and a verified login (raw)", () => {
    for (const [item, kind, op, id] of [
      [deployItem(), "userop", "raw", ID_USEROP],
      [orderItem(), "order", "typedData", ID_ORDER],
      [authItem(), "auth", "raw", ID_AUTH],
    ] as const) {
      const result = vet(item);
      assert.equal(result.ok, true, `${kind}: ${JSON.stringify(result)}`);
      if (!result.ok) continue;
      assert.equal(result.vetted.kind, kind);
      assert.equal(result.vetted.op, op);
      assert.equal(result.vetted.preparedId, id);
      assert.equal(result.vetted.expectedDigest, digestOf(item).toLowerCase());
      assert.equal(result.vetted.intent.op, op);
      assert.ok(Object.isFrozen(result.vetted));
      assert.ok(result.vetted.covered.length > 0, "the rebuild says what the digest commits to");
    }
  });

  it("the intent it hands on is toPayboxIntent's output and nothing else", () => {
    const result = vet(deployItem());
    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.vetted.intent).sort(), ["op", "rawSigningPayloadHex"]);
    const typed = vet(orderItem());
    assert.ok(typed.ok && typed.vetted.intent.op === "typedData");
    assert.deepEqual(Object.keys(typed.vetted.intent).sort(), ["op", "typedData"]);
  });

  it("offers exactly raw and typedData, and the three kinds the Cockpit has screens for", () => {
    assert.deepEqual([...S2_ALLOWED_OPS], ["raw", "typedData"]);
    assert.deepEqual([...S2_ALLOWED_KINDS].sort(), ["auth", "order", "userop"]);
  });
});

describe("every op other than raw or typedData is refused (M5-3)", () => {
  for (const op of ["message", "transaction", "authorization", "personal_sign", "RAW", "", " raw", 5, null, ["raw"], { op: "raw" }]) {
    it(`op ${JSON.stringify(op)}`, () => {
      const item = edit(deployItem(), (copy) => {
        child(child(copy, "sign"), "intent")["op"] = op;
      });
      assert.deepEqual(refusal(item), { ok: false, reason: "op_not_allowed", field: "sign.intent.op" });
    });
  }

  it("a missing intent, a missing sign block, and something that is not an item at all", () => {
    assert.equal(refusal(edit(deployItem(), (copy) => { delete child(copy, "sign")["intent"]; })).reason, "op_not_allowed");
    assert.equal(refusal(edit(deployItem(), (copy) => { delete copy["sign"]; })).reason, "op_not_allowed");
    for (const junk of [null, undefined, 3, "x", [], [deployItem()]]) assert.equal(refusal(junk).reason, "item_invalid");
  });

  it("an op word is not enough: the intent must also be the contract's shape", () => {
    const extra = edit(deployItem(), (copy) => {
      child(child(copy, "sign"), "intent")["note"] = "sign this too";
    });
    assert.equal(refusal(extra).reason, "sign_invalid");
    const wrongField = edit(deployItem(), (copy) => {
      const intent = child(child(copy, "sign"), "intent");
      delete intent["rawSigningPayloadHex"];
      intent["digest"] = digestOf(deployItem());
    });
    assert.equal(refusal(wrongField).reason, "sign_invalid");
  });
});

describe("kinds", () => {
  it("a market creation item is not signed by the Cockpit (the creation UI is not shipped)", () => {
    const create = edit(deployItem(), (copy) => { copy["kind"] = "create"; });
    assert.deepEqual(refusal(create), { ok: false, reason: "kind_not_allowed", field: "kind" });
  });

  it("an unknown or missing kind is refused", () => {
    for (const kind of ["withdraw", "message", "", undefined, 1]) {
      const item = edit(deployItem(), (copy) => { if (kind === undefined) delete copy["kind"]; else copy["kind"] = kind; });
      assert.equal(refusal(item).reason, "kind_not_allowed", String(kind));
    }
  });
});

describe("an intent that does not hash to its digest is refused", () => {
  it("a raw payload that differs from expected_digest", () => {
    const other = `0x${"11".repeat(32)}`;
    const item = edit(deployItem(), (copy) => { child(child(copy, "sign"), "intent")["rawSigningPayloadHex"] = other; });
    assert.deepEqual(refusal(item), { ok: false, reason: "intent_digest_mismatch", field: "sign.intent" });
  });

  it("an expected_digest that differs from the raw payload", () => {
    const item = edit(authItem(), (copy) => { child(copy, "sign")["expected_digest"] = `0x${"22".repeat(32)}`; });
    assert.equal(refusal(item).reason, "intent_digest_mismatch");
  });

  it("typed data whose message was changed, or whose domain was", () => {
    const messageChanged = edit(orderItem(), (copy) => {
      const typed = child(child(child(copy, "sign"), "intent"), "typedData");
      child(typed, "message")["hash"] = `0x${"33".repeat(32)}`;
    });
    assert.equal(refusal(messageChanged).reason, "intent_digest_mismatch");
    const domainChanged = edit(orderItem(), (copy) => {
      const typed = child(child(child(copy, "sign"), "intent"), "typedData");
      child(typed, "domain")["chainId"] = 1;
    });
    assert.equal(refusal(domainChanged).reason, "intent_digest_mismatch");
  });

  it("a user operation as typed data (the validator takes plain ECDSA bytes)", () => {
    const typed = child(child(child(orderItem(), "sign"), "intent"), "typedData");
    const item = edit(deployItem(), (copy) => {
      child(copy, "sign")["intent"] = { op: "typedData", typedData: typed };
    });
    assert.equal(refusal(item).reason, "intent_digest_mismatch");
  });
});

describe("the item has to rebuild to what it says it is", () => {
  it("an item with no decoded block cannot be verified, so it is not signed", () => {
    const item = deployItem(ID_USEROP);
    const bare = edit(item, (copy) => {
      delete copy["decoded"];
      delete child(copy, "summary")["inner_hash_tag"];
      delete child(copy, "summary")["inner_hash_kind"];
    });
    const result = refusal(bare);
    assert.equal(result.reason, "not_verified");
    assert.equal(result.field, "decoded");
  });

  it("one changed summary line is a mismatch, at that line", () => {
    for (const make of [deployItem, orderItem, authItem]) {
      const item = edit(make(), (copy) => {
        const lines = child(copy, "summary")["lines"] as string[];
        lines[0] = `${lines[0] ?? ""} `;
      });
      const result = refusal(item);
      assert.equal(result.reason, "verification_mismatch");
      assert.equal(result.field, "summary.lines[0]");
    }
  });

  it("a changed decoded term is a mismatch", () => {
    const item = edit(orderItem(), (copy) => {
      const terms = child(child(copy, "decoded"), "terms");
      terms["price"] = "0.56";
    });
    assert.equal(refusal(item).reason, "verification_mismatch");
  });

  it("an account that is not the one derived from the owner is never signed", () => {
    const stranger = getAddress(`0x${"ab".repeat(20)}`);
    assert.notEqual(stranger, ACCOUNT);
    const item = edit(deployItem(), (copy) => {
      copy["account"] = stranger;
      child(copy, "decoded")["account"] = stranger;
    });
    assert.equal(vet(item).ok, false);
  });

  it("an item that does not match the relay contract", () => {
    const item = edit(deployItem(), (copy) => { copy["surprise"] = "field"; });
    assert.equal(refusal(item).reason, "item_invalid");
  });
});

describe("time", () => {
  const expiry = (item: Obj): number => Date.parse(String(item["expires_at"]));

  it("refuses an item that is out of time, or too near it, and allows exactly the margin", () => {
    for (const [make, kind] of [[deployItem, "userop"], [orderItem, "order"], [authItem, "auth"]] as const) {
      const item = make();
      const margin = START_MARGIN_MS[kind];
      assert.equal(vet(item, expiry(item) - margin).ok, true, `${kind} at the margin`);
      assert.equal(refusal(item, expiry(item) - margin + 1).reason, "expired", `${kind} one ms short`);
      assert.equal(refusal(item, expiry(item) + 1).reason, "expired", `${kind} after expiry`);
    }
  });

  it("an order needs more room than a user operation", () => {
    assert.ok(START_MARGIN_MS.order > START_MARGIN_MS.userop);
    const item = orderItem();
    assert.equal(refusal(item, expiry(item) - 100_000).reason, "expired");
    const op = deployItem();
    assert.equal(vet(op, expiry(op) - 100_000).ok, true);
  });
});
