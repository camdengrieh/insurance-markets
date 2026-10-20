import assert from "node:assert/strict";
import { describe } from "node:test";

import { getAddress, type Hex } from "viem";

import { POST_ROUTES, toPayboxIntent, SAFETY_NOTICES } from "../src/relay/contract.js";
import { ENTRY_POINT_V07, KERNEL_FACTORY } from "../src/xo/chain/constants.js";
import { TripwireRegistry } from "../relay/alerts.js";
import { withDecodedBlock } from "../relay/prepared.js";
import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { DEFAULT_L1_VARIANT, buildLoginDigests, formatL1Variant } from "../relay/credentials.js";
import { useMock } from "./mock-xo/testing.js";
import {
  connect,
  createWorld,
  deployed,
  expectRelayError,
  expectedLoginDigest,
  l1Requests,
  l2Requests,
  ownerAt,
  prepareLogin,
  requestsTo,
  signDigest,
} from "./relay-credentials-helpers.js";

// POST /v1/auth/prepare against the mock: what the owner is asked to sign, and every reason the relay
// refuses to ask. Nothing here is sent to XO except reads: a prepare never writes.

describe("auth prepare", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const profile of ["pessimistic", "optimistic"] as const) {
    harness.it(`asks for the Kernel-wrapped ClobAuth digest at XO's time, valid for 90 seconds (${profile} profile)`, async (mock, t) => {
      mock.setProfile(profile);
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      const startedAt = mock.clock.nowMs();
      const prepared = await prepareLogin(world, owner);

      assert.equal(prepared.kind, "auth");
      assert.equal(prepared.owner, owner.address);
      assert.equal(prepared.account, owner.smart, "the relay derived the account");
      assert.equal(prepared.sign.digest_form, "kernelWrappedClobAuth");
      // The timestamp is XO's GET /time, read just now.
      const timeRequests = requestsTo(world, "GET", "/time");
      assert.equal(timeRequests.length, 1);
      const timestamp = String(Math.floor(timeRequests[0]!.atMs / 1000));
      assert.equal(prepared.sign.expected_digest, expectedLoginDigest(owner.smart, timestamp), "the digest is the mock's independent recomputation");
      assert.equal(prepared.summary.digest_tag, prepared.sign.expected_digest.slice(2, 18));
      // The item lives 90 s on the relay's clock.
      assert.equal(Date.parse(prepared.expires_at), Math.floor((startedAt + 90_000) / 1000) * 1000);
      const record = world.prepared.require(prepared.prepared_id);
      assert.equal(record.state, "prepared");
      assert.equal(record.expiresAtMs - record.createdAtMs, 90_000);
      assert.equal(record.kind, "auth");
      // The stored record keeps the terms, never a signature.
      assert.deepEqual(record.payload, { v: 1, timestamp, nonce: "0", variant: formatL1Variant(DEFAULT_L1_VARIANT) });
    });
  }

  // R1 for the login (relay/credentials.ts predates the decoded block; the server pipelines add it to its answer).
  harness.it("gets a decoded block from the pipeline that rebuilds to the digest, for the typed-data and the raw form", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 1);
    const prepared = await prepareLogin(world, owner);
    assert.equal((prepared as { decoded?: unknown }).decoded, undefined, "the handler itself sends none");
    assert.equal(verifyPreparedLocal(prepared).ok, false);
    const decorated = (await withDecodedBlock("POST /v1/auth/prepare", prepared, world.services)) as Record<string, unknown>;
    const verdict = verifyPreparedLocal(decorated);
    assert.ok(verdict.ok, JSON.stringify(verdict));
    assert.equal((decorated["summary"] as { inner_hash_kind?: string }).inner_hash_kind, "typed_data_hash");
    assert.equal((decorated["summary"] as { inner_hash_tag?: string }).inner_hash_tag, buildLoginDigests(owner.smart, String((world.prepared.require(prepared.prepared_id).payload as { timestamp: string }).timestamp), DEFAULT_L1_VARIANT).inner.slice(2, 18));
    // The raw form (PayBox recorded as refusing typed data) is the same block over the same digest.
    await world.capabilities.record({ id: "PB2", state: "no", source: "operator" });
    const raw = await prepareLogin(world, await deployed(mock, 2));
    assert.equal(raw.sign.intent.op, "raw");
    assert.ok(verifyPreparedLocal(await withDecodedBlock("POST /v1/auth/prepare", raw, world.services)).ok);
  });

  harness.it("passes an item it cannot vouch for on unchanged, and audits the miss; other routes are not touched", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 1);
    const prepared = await prepareLogin(world, owner);
    // A digest that is not the stored login's.
    const forged = { ...prepared, sign: { ...prepared.sign, expected_digest: `0x${"12".repeat(32)}` } };
    assert.deepEqual(await withDecodedBlock("POST /v1/auth/prepare", forged, world.services), forged);
    // No stored record for the id.
    const stray = { ...prepared, prepared_id: "ab".repeat(16) };
    assert.deepEqual(await withDecodedBlock("POST /v1/auth/prepare", stray, world.services), stray);
    assert.ok(world.audit.lines.filter((line) => line.includes("decoded_unavailable")).length >= 2);
    assert.deepEqual(await withDecodedBlock("POST /v1/order/prepare", prepared, world.services), prepared);
    assert.equal(await withDecodedBlock("POST /v1/auth/prepare", null, world.services), null);
  });

  harness.it("asks for typed data by default (A4), and that typed data signs to the same bytes as the raw digest", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 1);
    const prepared = await prepareLogin(world, owner);
    assert.equal(prepared.sign.intent.op, "typedData");
    if (prepared.sign.intent.op !== "typedData") return;
    const typed = prepared.sign.intent.typedData;
    assert.equal(typed.primaryType, "Kernel");
    assert.deepEqual(typed.domain, { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: owner.smart });
    const timestamp = String(Math.floor(requestsTo(world, "GET", "/time")[0]!.atMs / 1000));
    assert.deepEqual(typed.message, { hash: buildLoginDigests(owner.smart, timestamp, DEFAULT_L1_VARIANT).inner });
    // What PayBox would do with the typedData intent is the same signature as signing the digest.
    const viaTypedData = await owner.account.signTypedData({
      domain: typed.domain,
      types: { Kernel: typed.types["Kernel"] as [{ name: "hash"; type: "bytes32" }] },
      primaryType: "Kernel",
      message: { hash: typed.message["hash"] as Hex },
    });
    assert.equal(viaTypedData, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw"));
    // The adapter accepts it, and refuses a tampered copy.
    assert.deepEqual(toPayboxIntent(prepared.sign).op, "typedData");
    const tampered = structuredClone(prepared.sign);
    if (tampered.intent.op === "typedData") tampered.intent.typedData.message["hash"] = `0x${"11".repeat(32)}`;
    assert.throws(() => toPayboxIntent(tampered));
  });

  harness.it("asks for a raw digest instead when PayBox typed data is recorded as unsupported (PB2 no)", async (mock, t) => {
    const world = await createWorld(mock, t);
    await world.capabilities.record({ id: "PB2", state: "no", source: "operator", note: "T0: typedData with chainId 3223 was refused" });
    const owner = await deployed(mock, 2);
    const prepared = await prepareLogin(world, owner);
    assert.deepEqual(prepared.sign.intent, { op: "raw", rawSigningPayloadHex: prepared.sign.expected_digest });
    assert.equal(prepared.capabilities["PB2"], "no");
  });

  harness.it("with the Kernel wrapper switched off by a fact it asks for the plain ClobAuth digest as typed data", async (mock, t) => {
    const world = await createWorld(mock, t);
    await world.capabilities.record({ id: "AU6", state: "unknown", source: "operator", value: "kernel-off:sig-65:addr-yes", note: "T2 variant" });
    const owner = await deployed(mock, 3);
    const prepared = await prepareLogin(world, owner);
    const timestamp = String(Math.floor(requestsTo(world, "GET", "/time")[0]!.atMs / 1000));
    assert.equal(prepared.sign.expected_digest, expectedLoginDigest(owner.smart, timestamp, false));
    assert.equal(prepared.sign.intent.op, "typedData");
    if (prepared.sign.intent.op === "typedData") assert.equal(prepared.sign.intent.typedData.primaryType, "ClobAuth");
    assert.equal(world.prepared.require(prepared.prepared_id).payload && (world.prepared.require(prepared.prepared_id).payload as { variant: string }).variant, "kernel-off:sig-65:addr-yes");
    // And a rejected form is not used again.
    await world.capabilities.record({ id: "AU6", state: "no", source: "operator", value: "kernel-off:sig-65:addr-yes", note: "refused" });
    const again = await prepareLogin(world, owner);
    assert.equal(again.sign.expected_digest, expectedLoginDigest(owner.smart, String(Math.floor(requestsTo(world, "GET", "/time")[1]!.atMs / 1000))));
  });

  harness.it("reads the clock from XO, not from the relay: a relay clock an hour ahead changes nothing about the timestamp", async (mock, t) => {
    const world = await createWorld(mock, t, { skewMs: 3_600_000 });
    const owner = await deployed(mock, 4);
    const prepared = await prepareLogin(world, owner);
    const expected = expectedLoginDigest(owner.smart, String(mock.clock.nowSeconds()));
    assert.equal(prepared.sign.expected_digest, expected);
    // The deadline is still the relay's own 90 s.
    const record = world.prepared.require(prepared.prepared_id);
    assert.equal(record.expiresAtMs, record.createdAtMs + 90_000);
  });

  harness.it("carries the fixed safety sentences, no market text, and lines the contract accepts", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 5);
    const prepared = await prepareLogin(world, owner);
    assert.ok(prepared.summary.lines.includes(SAFETY_NOTICES.digestTag));
    for (const notice of [SAFETY_NOTICES.approvalMode, SAFETY_NOTICES.dedicatedCredential, SAFETY_NOTICES.advisoryCaps]) assert.ok(prepared.warnings.includes(notice));
    assert.ok(prepared.warnings.some((line) => /create XO API keys/.test(line)));
    assert.deepEqual(prepared.caps, { reserved_usd: "0", day_remaining_usd: "50" });
    assert.deepEqual(Object.keys(prepared.capabilities).sort(), ["AU2", "AU6", "OR10", "PB2"]);
    for (const state of Object.values(prepared.capabilities)) assert.equal(state, "unknown");
    // Parses with the contract's own schema (including the digest/typed-data consistency checks).
    POST_ROUTES["/v1/auth/prepare"].response.parse(prepared);
  });

  harness.it("only reads: no write reaches XO, no signed (L1 or L2) request is made", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await prepareLogin(world, owner);
    assert.deepEqual(world.sent.filter((entry) => entry.method !== "GET"), []);
    assert.deepEqual(l1Requests(world), []);
    assert.deepEqual(l2Requests(world), []);
    assert.deepEqual([...new Set(world.sent.map((entry) => entry.path))].sort(), ["/api", "/time"]);
  });

  describe("refusals", () => {
    harness.it("an account that is not deployed (L1 needs code on the account, AU6)", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = ownerAt(mock, 6);
      await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "account_not_deployed" });
      assert.deepEqual(requestsTo(world, "GET", "/time"), [], "no time was read and nothing was prepared");
      assert.deepEqual(world.prepared.list(), []);
    });

    harness.it("l1.undeployed = erc6492 does not change that: ERC-6492 is not built", async (mock, t) => {
      mock.setSwitch("l1.undeployed", "erc6492");
      const world = await createWorld(mock, t);
      await expectRelayError(prepareLogin(world, ownerAt(mock, 6)), "precondition_failed", { reason: "account_not_deployed" });
    });

    harness.it("deployment that cannot be established (the explorer is failing) fails closed, never as 'undeployed'", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      mock.injectFault("5xx", { listeners: ["explorer"] });
      await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "account_state_unknown" });
      assert.deepEqual(world.prepared.list(), []);
    });

    harness.it("a caller-supplied account that is not the derived one (invariant 1), or is the owner itself", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      const other = ownerAt(mock, 1);
      await expectRelayError(prepareLogin(world, owner, { account: other.smart }), "account_mismatch");
      await expectRelayError(prepareLogin(world, owner, { account: owner.address }), "account_mismatch");
      // The right account is accepted.
      const prepared = await prepareLogin(world, owner, { account: owner.smart });
      assert.equal(prepared.account, owner.smart);
    });

    harness.it("an owner that is a pinned protocol contract", async (mock, t) => {
      const world = await createWorld(mock, t);
      for (const address of [ENTRY_POINT_V07, KERNEL_FACTORY]) {
        await expectRelayError(prepareLogin(world, { ...ownerAt(mock, 0), address: getAddress(address) }), "invalid_request");
      }
      assert.deepEqual(world.sent, [], "refused before any read");
    });

    harness.it("the flag off, and the kill switch on", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      world.flags.current = Object.freeze({ ...world.flags.current, ENABLE_TRADING: false });
      await expectRelayError(prepareLogin(world, owner), "flag_off");
      world.flags.current = Object.freeze({ ...world.flags.current, ENABLE_TRADING: true, KILL: true });
      await expectRelayError(prepareLogin(world, owner), "kill_switch");
      assert.deepEqual(world.sent, []);
    });

    harness.it("a tripped tripwire", async (mock, t) => {
      const world = await createWorld(mock, t);
      const registry = await TripwireRegistry.open({ store: world.storage.state, now: () => mock.clock.nowMs() });
      await registry.trip({ id: "exchange_upgraded", detail: "a second Upgraded log" });
      (world.services as { tripwires?: TripwireRegistry }).tripwires = registry;
      const owner = await deployed(mock, 0);
      await expectRelayError(prepareLogin(world, owner), "tripwire");
      assert.deepEqual(world.sent, []);
    });

    harness.it("the credential store switched off", async (mock, t) => {
      const world = await createWorld(mock, t, { credentialStore: false });
      const owner = await deployed(mock, 0);
      await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "credential_store_off" });
    });

    harness.it("credentials that are already stored: no signature is asked for that buys nothing", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      const done = await connect(world, owner);
      const error = await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "credentials_already_stored" });
      assert.deepEqual((error.details as { key_tag: string }).key_tag, done.result.key_tag);
      assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
    });

    harness.it("XO's time that is unusable (a failing /time) means nothing is prepared", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      for (const reply of [new Response("not a number", { status: 200 }), new Response("0", { status: 200 }), new Response("{}", { status: 200 }), new Response("", { status: 500 })]) {
        world.setIntercept((request) => (request.url.pathname === "/time" ? reply.clone() : undefined));
        await expectRelayError(prepareLogin(world, owner), "upstream_rejected", { reason: "time_unusable" });
      }
      assert.deepEqual(world.prepared.list(), []);
    });

    harness.it("a login for an unknown shape of request body (the contract is strict)", async (mock, t) => {
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      assert.throws(() => POST_ROUTES["/v1/auth/prepare"].request.parse({ owner: owner.address, extra: "x" }));
      assert.throws(() => POST_ROUTES["/v1/auth/prepare"].request.parse({}));
    });
  });
});
