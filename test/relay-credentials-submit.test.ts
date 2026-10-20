import assert from "node:assert/strict";
import { describe } from "node:test";

import type { Hex } from "viem";

import { NAMESPACES, type Json } from "../relay/store.js";
import { SECP256K1_N } from "../src/xo/signing/constants.js";
import { useMock } from "./mock-xo/testing.js";
import {
  connect,
  createWorld,
  deployed,
  expectRelayError,
  expectedLoginDigest,
  l1Requests,
  l2Requests,
  mintedKeys,
  ownerAt,
  prepareLogin,
  requestsTo,
  signDigest,
  submitLogin,
} from "./relay-credentials-helpers.js";

// POST /v1/auth/submit: the signature is checked against a digest the relay recomputes, the item is
// single use and expires, and nothing reaches XO for a signature that does not belong to the owner.

describe("auth submit: the signature", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("accepts the raw signature, the EIP-191 form, parity v, r/s with a recovery id and the high-s twin, and stores the same credential each time", async (mock, t) => {
    const forms: Array<{ readonly name: string; readonly make: (signature: Hex, owner: Awaited<ReturnType<typeof deployed>>, digest: Hex) => Promise<unknown> }> = [
      { name: "raw 65 bytes", make: async (signature) => signature },
      { name: "EIP-191 over the digest", make: async (_s, owner, digest) => signDigest(owner, digest, "eip191") },
      { name: "parity v (0 or 1)", make: async (signature) => `${signature.slice(0, 130)}${(Number.parseInt(signature.slice(130), 16) - 27).toString(16).padStart(2, "0")}` },
      {
        name: "r, s and recovery_id",
        make: async (signature) => ({ r: `0x${signature.slice(2, 66)}`, s: `0x${signature.slice(66, 130)}`, recovery_id: Number.parseInt(signature.slice(130), 16) - 27 }),
      },
      {
        name: "the high-s twin",
        make: async (signature) => {
          const s = BigInt(`0x${signature.slice(66, 130)}`);
          const flipped = (SECP256K1_N - s).toString(16).padStart(64, "0");
          const v = Number.parseInt(signature.slice(130), 16) === 27 ? 28 : 27;
          return `${signature.slice(0, 66)}${flipped}${v.toString(16)}`;
        },
      },
    ];
    let index = 0;
    for (const form of forms) {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, index);
      index += 1;
      const prepared = await prepareLogin(world, owner);
      const raw = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
      const signature = await form.make(raw, owner, prepared.sign.expected_digest as Hex);
      const result = await submitLogin(world, prepared.prepared_id, signature);
      assert.equal(result.credentials, "stored", form.name);
      assert.equal(world.prepared.require(prepared.prepared_id).state, "accepted", form.name);
      // What went to XO is the canonical 86-byte form (v 27 or 28, low s), whatever came in.
      const derive = requestsTo(world, "GET", "/auth/derive-api-key")[0];
      assert.ok(derive !== undefined, form.name);
      const wire = derive.headers["xo_signature"] ?? "";
      assert.equal(wire.length, 2 + 86 * 2, form.name);
      assert.match(wire.slice(-2), /^1[bc]$/, `${form.name}: v is 27 or 28`);
      assert.ok(BigInt(`0x${wire.slice(2 + 21 * 2 + 64, 2 + 21 * 2 + 128)}`) <= SECP256K1_N / 2n, `${form.name}: low s`);
    }
    assert.equal(mintedKeys(mock), forms.length);
  });

  harness.it("a signature by anyone but the owner is refused before anything is sent to XO", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const stranger = ownerAt(mock, 1);
    const prepared = await prepareLogin(world, owner);
    const digest = prepared.sign.expected_digest as Hex;
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(stranger, digest, "raw")), "owner_mismatch");
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(stranger, digest, "eip191")), "owner_mismatch");
    assert.deepEqual(l1Requests(world), []);
    assert.deepEqual(requestsTo(world, "POST", "/auth/api-key"), []);
    assert.equal(mintedKeys(mock), 0);
    // The item is still good for the real owner.
    assert.equal(world.prepared.require(prepared.prepared_id).state, "prepared");
    const result = await submitLogin(world, prepared.prepared_id, await signDigest(owner, digest, "raw"));
    assert.equal(result.credentials, "stored");
  });

  harness.it("a signature over a different digest (another timestamp, the unwrapped digest, another account, an arbitrary hash) does not verify", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const first = await prepareLogin(world, owner);
    const timestamp = String(Math.floor(requestsTo(world, "GET", "/time")[0]!.atMs / 1000));
    const wrong: Hex[] = [
      expectedLoginDigest(owner.smart, String(Number(timestamp) + 1)),
      expectedLoginDigest(owner.smart, timestamp, false),
      expectedLoginDigest(ownerAt(mock, 1).smart, timestamp),
      `0x${"ab".repeat(32)}`,
    ];
    // Two attempts per item (five spend one), so each digest gets its own.
    let prepared = first;
    for (const digest of wrong) {
      await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, digest, "raw")), "owner_mismatch");
      await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, digest, "eip191")), "owner_mismatch");
      assert.equal(world.prepared.require(prepared.prepared_id).state, "prepared");
      prepared = await prepareLogin(world, owner);
    }
    assert.deepEqual(l1Requests(world), []);
    assert.equal(mintedKeys(mock), 0);
  });

  harness.it("a malformed signature is signature_invalid, and five bad attempts spend the item", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    const good = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    // A 65-byte string whose recovery byte is not 0, 1, 27 or 28; r and s out of range.
    await expectRelayError(submitLogin(world, prepared.prepared_id, `${good.slice(0, 130)}05`), "signature_invalid");
    await expectRelayError(submitLogin(world, prepared.prepared_id, `0x${"00".repeat(64)}1b`), "signature_invalid");
    await expectRelayError(submitLogin(world, prepared.prepared_id, `0x${"ff".repeat(64)}1b`), "signature_invalid");
    await expectRelayError(submitLogin(world, prepared.prepared_id, `${good.slice(0, 66)}${"00".repeat(32)}1b`), "signature_invalid");
    assert.equal(world.prepared.require(prepared.prepared_id).state, "prepared");
    await expectRelayError(submitLogin(world, prepared.prepared_id, `${good.slice(0, 130)}09`), "signature_invalid");
    // Five failures lock the item, even for the right signature.
    assert.equal(world.prepared.require(prepared.prepared_id).state, "rejected");
    await expectRelayError(submitLogin(world, prepared.prepared_id, good), "prepared_used");
    assert.deepEqual(l1Requests(world), []);
  });

  harness.it("the request schema itself refuses things that are not signatures, before the handler runs", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    for (const bad of ["0x", "0x1234", "not hex", 1234, null, { r: "0x1", s: "0x2", recovery_id: 0 }, { r: `0x${"11".repeat(32)}`, s: `0x${"22".repeat(32)}`, recovery_id: 7 }, `0x${"11".repeat(66)}`]) {
      await assert.rejects(submitLogin(world, prepared.prepared_id, bad), (error: unknown) => error instanceof Error, String(bad));
    }
    assert.equal(world.prepared.require(prepared.prepared_id).state, "prepared");
    assert.deepEqual(l1Requests(world), []);
  });
});

describe("auth submit: the prepared item", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("is single use: a second submit of the same id is prepared_used and nothing more is sent", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const { prepared, signature } = await connect(world, owner);
    const sentBefore = world.sent.length;
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "prepared_used");
    assert.equal(world.sent.length, sentBefore);
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
    assert.equal(mintedKeys(mock), 1);
  });

  harness.it("expires after 90 seconds on the relay's clock: a late signature is refused before any request, an on-time one works", async (mock, t) => {
    const world = await createWorld(mock, t);
    const late = await deployed(mock, 0);
    const ontime = await deployed(mock, 1);
    const stale = await prepareLogin(world, late);
    const fresh = await prepareLogin(world, ontime);
    const staleSignature = await signDigest(late, stale.sign.expected_digest as Hex, "raw");
    const freshSignature = await signDigest(ontime, fresh.sign.expected_digest as Hex, "raw");
    mock.clock.advanceMs(89_000);
    assert.equal((await submitLogin(world, fresh.prepared_id, freshSignature)).credentials, "stored");
    mock.clock.advanceMs(2_000);
    const before = world.sent.length;
    await expectRelayError(submitLogin(world, stale.prepared_id, staleSignature), "expired");
    assert.equal(world.sent.length, before, "an expired login sends nothing");
    assert.equal(mintedKeys(mock), 1);
  });

  harness.it("an unknown id, or an id of another kind of prepared item, is not found", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await expectRelayError(submitLogin(world, "0".repeat(32), `0x${"11".repeat(65)}`), "not_found");
    const order = await world.prepared.create({ kind: "order", owner: owner.address, account: owner.smart, digest: `0x${"22".repeat(32)}`, digestForm: "kernelWrappedOrderHash", payload: { v: 1 } });
    await expectRelayError(submitLogin(world, order.id, await signDigest(owner, order.digest, "raw")), "not_found");
    assert.equal(world.prepared.require(order.id).state, "prepared", "an order's item is not consumed by the wrong route");
    assert.deepEqual(world.sent, []);
  });

  harness.it("re-checks the flag, the kill switch and the tripwires at submit, and leaves the item unspent", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    const before = world.sent.length;
    world.flags.current = Object.freeze({ ...world.flags.current, ENABLE_TRADING: false });
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "flag_off");
    world.flags.current = Object.freeze({ ...world.flags.current, ENABLE_TRADING: true, KILL: true });
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "kill_switch");
    assert.equal(world.sent.length, before);
    assert.equal(world.prepared.require(prepared.prepared_id).state, "prepared");
    world.flags.current = Object.freeze({ ...world.flags.current, KILL: false });
    assert.equal((await submitLogin(world, prepared.prepared_id, signature)).credentials, "stored");
  });

  harness.it("recomputes the digest from the stored fields: a record whose terms were altered sends nothing", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    // Someone with write access to the state changes the timestamp the login claims.
    await world.storage.state.transact((reader) => {
      const stored = reader.get(NAMESPACES.prepared, prepared.prepared_id) as { [key: string]: Json };
      const payload = { ...(stored["payload"] as { [key: string]: Json }), timestamp: "1791389400" };
      return { ops: [{ ns: NAMESPACES.prepared, key: prepared.prepared_id, value: { ...stored, payload } }], result: undefined };
    });
    const before = world.sent.length;
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "internal");
    assert.equal(world.sent.length, before);
    assert.equal(mintedKeys(mock), 0);
  });

  harness.it("a payload in no known form is refused, not guessed at", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    for (const payload of [null, {}, { v: 2, timestamp: "1", nonce: "0", variant: "kernel-on:sig-86:addr-yes" }, { v: 1, timestamp: "1791389400", nonce: "1", variant: "kernel-on:sig-86:addr-yes" }, { v: 1, timestamp: "1791389400", nonce: "0", variant: "nonsense" }]) {
      const record = await world.prepared.create({ kind: "auth", owner: owner.address, account: owner.smart, digest: `0x${"33".repeat(32)}`, digestForm: "kernelWrappedClobAuth", payload: payload as Json });
      await expectRelayError(submitLogin(world, record.id, await signDigest(owner, record.digest, "raw")), "internal");
    }
    assert.deepEqual(world.sent, []);
  });

  harness.it("two logins for one account submitted at the same moment create exactly one key", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const first = await prepareLogin(world, owner);
    const second = await prepareLogin(world, owner);
    const [a, b] = [first, second].map(async (prepared) => submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")));
    const results = await Promise.allSettled([a, b]);
    assert.deepEqual(results.map((entry) => entry.status), ["fulfilled", "fulfilled"]);
    assert.equal(mintedKeys(mock), 1, "one key at XO");
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1, "one create request");
    const tags = results.map((entry) => (entry.status === "fulfilled" ? (entry.value as { key_tag: string }).key_tag : ""));
    assert.equal(tags[0], tags[1], "both logins end at the same credential");
  });

  harness.it("persists the credential before any use: the triplet is on disk for every signed request that follows the create, and for none before it", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const createIndex = world.sent.findIndex((entry) => entry.method === "POST" && entry.path === "/auth/api-key");
    assert.ok(createIndex > 0);
    for (const [index, entry] of world.sent.entries()) {
      if (index <= createIndex) assert.equal(entry.tripletOnDisk, false, `#${String(index)} ${entry.method} ${entry.path} left before the create returned`);
    }
    const l2 = l2Requests(world);
    assert.ok(l2.length >= 2);
    for (const entry of l2) assert.equal(entry.tripletOnDisk, true, `${entry.path} used the credential`);
    // Everything after the create used the stored triplet only; the second derive is an L1 call and may come first.
    assert.ok(world.sent.slice(createIndex + 1).every((entry) => entry.tripletOnDisk === true));
  });
});
