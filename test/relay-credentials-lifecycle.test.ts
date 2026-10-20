import assert from "node:assert/strict";
import { describe, type TestContext } from "node:test";

import type { Hex } from "viem";

import type { Json } from "../relay/store.js";

import { credentialReadiness, ensureCredentialsReady, healCredentialStates, keyTagOf, type CredentialStep } from "../relay/credentials.js";
import type { MockXo } from "./mock-xo/server.js";
import { createCredentials, traderFor } from "./mock-xo/traders.js";
import { useMock } from "./mock-xo/testing.js";
import { faultyFs } from "./relay-core-helpers.js";
import {
  connect,
  createWorld,
  deployed,
  expectRelayError,
  factOf,
  flowOf,
  jsonResponse,
  l1Requests,
  l2Requests,
  mintedKeys,
  prepareLogin,
  requestsTo,
  signDigest,
  statusRecord,
  storedTriplet,
  submitLogin,
  type Owner,
  type World,
  type WorldOptions,
} from "./relay-credentials-helpers.js";

// The credential lifecycle against the mock XO (docs/phase1-gap-closing.md gate 1, T2): derive first,
// at most one create, persist before use, recover after a crash, the probes and their stop rule, and
// the L1 variants. The profile matrix (every switch flipped alone) is in relay-credentials-matrix.

class Crash extends Error {}
const crashAt = (step: CredentialStep): WorldOptions["credentials"] => ({
  onStep: (reached) => {
    if (reached === step) throw new Crash(`crash after ${step}`);
  },
});

async function expectCrash(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof Crash);
}

// The key the XO app (or an earlier run of something else) made for the account, through the mock's own L1 path.
async function appKey(mock: MockXo, owner: Owner): Promise<{ apiKey: string; secret: string; passphrase: string }> {
  return createCredentials(mock, traderFor(mock, owner.index));
}

async function reopen(mock: MockXo, t: TestContext, previous: World, options: WorldOptions = {}): Promise<World> {
  return createWorld(mock, t, { dir: previous.dir, ...options });
}

function tripletMatchesMock(actual: { apiKey: string; secret: string; passphrase: string } | undefined, expected: { apiKey: string; secret: string; passphrase: string }): void {
  assert.ok(actual !== undefined, "a triplet is stored");
  assert.deepEqual({ apiKey: actual.apiKey, secret: actual.secret, passphrase: actual.passphrase }, { apiKey: expected.apiKey, secret: expected.secret, passphrase: expected.passphrase });
}

describe("credentials: the happy path", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("pessimistic profile: derive 404, one create, persist, derive again, probe A through its variants, probe B; facts only from what was seen", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const { result } = await connect(world, owner);

    const calls = world.sent.filter((entry) => !["/api", "/time"].includes(entry.path)).map((entry) => `${entry.method} ${entry.path}${entry.search} ${String(entry.status)}`);
    assert.deepEqual(calls, [
      "GET /auth/derive-api-key 404",
      "POST /auth/api-key 200",
      "GET /auth/derive-api-key 200",
      "GET /auth/api-keys 401", // the expected form (decoded, padded) is not what the pessimistic server wants
      "GET /auth/api-keys 200", // decoded, stripped
      "GET /orders?limit=1 200", // path with query, the documented form
    ]);
    assert.equal(mintedKeys(mock), 1);
    const minted = mock.write.credentials[0]!;
    tripletMatchesMock(await storedTriplet(world, owner), minted);
    assert.equal(result.key_tag, keyTagOf(minted.apiKey));

    // Facts: what was observed, nothing else.
    assert.deepEqual(factOf(world, "AU2"), { state: "no", value: undefined, source: "probe" });
    assert.deepEqual(factOf(world, "AU6"), { state: "yes", value: "kernel-on:sig-86:addr-yes", source: "probe" });
    assert.deepEqual(factOf(world, "OR10"), { state: "yes", value: "b64url-stripped:path-with-query:addr-yes", source: "probe" });
    assert.equal(factOf(world, "AU4"), undefined, "the key cap was never learned, so it is not claimed");
    assert.equal(factOf(world, "T2"), undefined, "a live-test result is the operator's to record");

    // Durable records.
    assert.deepEqual(statusRecord(world, owner), { state: "validated", key_tag: result.key_tag });
    const flow = flowOf(world, owner) as Record<string, unknown>;
    assert.equal(flow["createAttempts"], 1);
    assert.equal(flow["createOutcome"], "stored");
    assert.equal(flow["probeFailures"], 1);
    assert.deepEqual(flow["probeVariantsFailed"], ["b64url-padded"]);
    assert.equal(world.prepared.list()[0]?.state, "accepted");
    assert.deepEqual(credentialReadiness(world.services, owner.smart), { state: "validated", keyTag: result.key_tag, ready: true });
  });

  harness.it("optimistic profile: the expected HMAC form is found at once and the secret is shown again", async (mock, t) => {
    mock.setProfile("optimistic");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const calls = world.sent.filter((entry) => !["/api", "/time"].includes(entry.path)).map((entry) => `${entry.method} ${entry.path}${entry.search} ${String(entry.status)}`);
    assert.deepEqual(calls, [
      "GET /auth/derive-api-key 404",
      "POST /auth/api-key 200",
      "GET /auth/derive-api-key 200",
      "GET /auth/api-keys 200",
      "GET /orders?limit=1 401", // the documented target; this server signs the path only
      "GET /orders?limit=1 200",
    ]);
    assert.deepEqual(factOf(world, "AU2"), { state: "yes", value: undefined, source: "probe" });
    assert.deepEqual(factOf(world, "OR10"), { state: "yes", value: "b64url-padded:path-only:addr-yes", source: "probe" });
    assert.equal(mintedKeys(mock), 1);
  });

  harness.it("sends only the headers it should: the pinned User-Agent, the XO_* names, no POLY_*, no cookie, no identifying header", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    for (const entry of world.sent) {
      for (const name of Object.keys(entry.headers)) {
        assert.ok(!/^poly_|^poly-|cookie|authorization|referer|^from$|^origin$|forwarded/i.test(name), `${entry.path}: header ${name}`);
      }
      // The user-agent is set by the upstream client, below the spy; the mock records what it received.
    }
    for (const entry of mock.requestsTo("orderbook")) {
      assert.equal(entry.userAgent, "insurance-markets-xo-plugin/0.2");
      assert.equal(entry.from, null);
      assert.equal(entry.referer, null);
      assert.equal(entry.origin, null);
    }
    // XO_NONCE is never sent (its default is the 0 that is signed).
    assert.ok(world.sent.every((entry) => entry.headers["xo_nonce"] === undefined));
    // Every L1 call carries the account and a timestamp; every L2 call the four credential headers.
    for (const entry of l1Requests(world)) assert.ok(entry.headers["xo_address"] !== undefined && entry.headers["xo_timestamp"] !== undefined);
    for (const entry of l2Requests(world)) assert.ok(["xo_api_key", "xo_passphrase", "xo_signature", "xo_timestamp", "xo_address"].every((name) => entry.headers[name] !== undefined));
  });

  harness.it("never deletes a key and never asks for more than one create, whatever the delete level is", async (mock, t) => {
    for (const level of ["L1", "L2"] as const) {
      mock.setSwitch("auth.delete_level", level);
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, level === "L1" ? 0 : 1);
      await connect(world, owner);
      assert.deepEqual(world.sent.filter((entry) => entry.method === "DELETE"), []);
      assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
    }
  });

  harness.it("probes are spaced at least a second apart (mock time), and the whole flow stays inside the 6-request probe budget", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const probes = l2Requests(world);
    assert.ok(probes.length >= 2 && probes.length <= 6, `${String(probes.length)} probes`);
    for (let index = 1; index < probes.length; index += 1) {
      assert.ok(probes[index]!.atMs - probes[index - 1]!.atMs >= 1000, `probe ${String(index)} came ${String(probes[index]!.atMs - probes[index - 1]!.atMs)} ms after the one before`);
    }
    assert.deepEqual([...new Set(probes.map((entry) => entry.path))].sort(), ["/auth/api-keys", "/orders"]);
  });

  harness.it("a relay clock that is an hour off still works: every timestamp is XO's own", async (mock, t) => {
    const world = await createWorld(mock, t, { skewMs: 3_600_000 });
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    assert.equal(statusRecord(world, owner)?.state, "validated");
    for (const entry of world.sent.filter((e) => e.headers["xo_timestamp"] !== undefined)) {
      assert.ok(Math.abs(Number(entry.headers["xo_timestamp"]) - Math.floor(entry.atMs / 1000)) <= 3, `${entry.path} used ${entry.headers["xo_timestamp"] ?? ""}`);
    }
  });

  harness.it("what is learned about XO's HMAC applies to the next account: it is validated with one request and no ladder", async (mock, t) => {
    const world = await createWorld(mock, t);
    const first = await deployed(mock, 0);
    const second = await deployed(mock, 1);
    await connect(world, first);
    const before = l2Requests(world).length;
    await connect(world, second);
    const added = l2Requests(world).slice(before);
    assert.equal(added.length, 1, "one validation request, no variants, no probe B");
    assert.equal(added[0]!.path, "/auth/api-keys");
    assert.equal(statusRecord(world, second)?.state, "validated");
    assert.equal(mintedKeys(mock), 2);
  });
});

describe("credentials: keys that already exist", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("derive shows the secret: the key is adopted, nothing is created", async (mock, t) => {
    mock.setSwitch("auth.derive_returns_secret", "yes");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const existing = await appKey(mock, owner);
    await connect(world, owner);
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 0);
    assert.equal(mintedKeys(mock), 1);
    tripletMatchesMock(await storedTriplet(world, owner), existing);
    assert.deepEqual(factOf(world, "AU2"), { state: "yes", value: undefined, source: "probe" });
    assert.equal(statusRecord(world, owner)?.state, "validated");
  });

  harness.it("derive hides the secret and the key cap is 1: the one create is refused, the relay says why, and never tries again", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await appKey(mock, owner);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "precondition_failed", { reason: "key_limit_reached" });
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
    assert.equal(mintedKeys(mock), 1, "the app's key is all there is");
    assert.equal(await storedTriplet(world, owner), undefined);
    assert.deepEqual(factOf(world, "AU2"), { state: "no", value: undefined, source: "probe" });
    assert.ok(world.alerts.raised.some((alert) => alert.id === "credential_key_limit"));
    const flow = flowOf(world, owner) as Record<string, unknown>;
    assert.equal(flow["limitReached"], true);
    assert.equal(flow["createAttempts"], 0, "a refused create did not spend the one create");
    // The next attempt is refused before it asks for a signature.
    await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "key_limit_reached" });
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
  });

  harness.it("derive hides the secret but the cap is 5: the relay mints its own key, once", async (mock, t) => {
    mock.setSwitch("auth.max_keys", "5");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await appKey(mock, owner);
    await connect(world, owner);
    assert.equal(mintedKeys(mock), 2);
    tripletMatchesMock(await storedTriplet(world, owner), mock.write.credentials[1]!);
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
    assert.equal(statusRecord(world, owner)?.state, "validated");
  });

  harness.it("a derive answer in no known shape stops the flow before a create", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    world.setIntercept((request) => (request.url.pathname === "/auth/derive-api-key" ? jsonResponse(200, { somethingElse: true }) : undefined));
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "derive_answer_unknown" });
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 0);
    assert.equal(mintedKeys(mock), 0);
  });
});

describe("credentials: crashes and lost answers (at most one create, ever)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const derive of ["yes", "no"] as const) {
    harness.it(`dies right after the create answered, before the triplet was written; XO ${derive === "yes" ? "shows" : "hides"} the secret on derive`, async (mock, t) => {
      mock.setSwitch("auth.derive_returns_secret", derive);
      const first = await createWorld(mock, t, { credentials: crashAt("create_response_received") });
      const owner = await deployed(mock, 0);
      const prepared = await prepareLogin(first, owner);
      await expectCrash(submitLogin(first, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")));
      assert.equal(mintedKeys(mock), 1, "the key exists at XO");
      assert.equal(await storedTriplet(first, owner), undefined, "and the relay never saw it written");
      assert.equal((flowOf(first, owner) as Record<string, unknown>)["createOutcome"], "pending");
      first.crash();

      // After the restart: the interrupted login is ambiguous and stays so; a new login recovers or says why not.
      const second = await reopen(mock, t, first);
      assert.equal(second.prepared.list()[0]?.state, "ambiguous", "the login that was cut off is ambiguous and stays so");
      assert.deepEqual(await second.prepared.recoverInterrupted(), []);
      const retry = async (): Promise<unknown> => {
        const again = await prepareLogin(second, owner);
        return submitLogin(second, again.prepared_id, await signDigest(owner, again.sign.expected_digest as Hex, "raw"));
      };
      if (derive === "yes") {
        await retry();
        tripletMatchesMock(await storedTriplet(second, owner), mock.write.credentials[0]!);
        assert.equal(statusRecord(second, owner)?.state, "validated");
      } else {
        await expectRelayError(retry(), "precondition_failed", { reason: "secret_not_recoverable" });
        assert.equal(await storedTriplet(second, owner), undefined);
        assert.equal(statusRecord(second, owner)?.state, "failed");
        assert.ok(second.alerts.raised.some((alert) => alert.id === "credential_secret_unrecoverable"));
        // And no further signature is asked for.
        await expectRelayError(prepareLogin(second, owner), "precondition_failed", { reason: "credentials_failed" });
      }
      assert.equal(mintedKeys(mock), 1, "no second key");
      assert.equal(requestsTo(first, "POST", "/auth/api-key").length + requestsTo(second, "POST", "/auth/api-key").length, 1, "one create request across both lives");
    });
  }

  harness.it("dies right after the triplet was written, before the record said so: the vault wins and nothing is created again", async (mock, t) => {
    const first = await createWorld(mock, t, { credentials: crashAt("triplet_persisted") });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(first, owner);
    await expectCrash(submitLogin(first, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")));
    tripletMatchesMock(await storedTriplet(first, owner), mock.write.credentials[0]!);
    assert.equal(statusRecord(first, owner)?.state ?? "none", "none", "the status still says nothing");
    first.crash();

    const second = await reopen(mock, t, first);
    assert.deepEqual(await healCredentialStates(second.context()), [owner.smart.toLowerCase()]);
    assert.equal(statusRecord(second, owner)?.state, "stored");
    assert.equal(statusRecord(second, owner)?.key_tag, keyTagOf(mock.write.credentials[0]!.apiKey));
    // A new login is not needed, and is refused as such.
    await expectRelayError(prepareLogin(second, owner), "precondition_failed", { reason: "credentials_already_stored" });
    // The probes need no signature: they resume from the stored credential.
    const readiness = await ensureCredentialsReady(second.context(), owner.smart, { sleep: async () => undefined });
    assert.equal(readiness.state, "validated");
    assert.equal(readiness.ready, true);
    assert.equal(mintedKeys(mock), 1);
    assert.equal(requestsTo(second, "POST", "/auth/api-key").length, 0);
  });

  harness.it("healing also works without the start-up sweep: the next prepare or probe run finds the triplet", async (mock, t) => {
    const first = await createWorld(mock, t, { credentials: crashAt("triplet_persisted") });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(first, owner);
    await expectCrash(submitLogin(first, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")));
    first.crash();
    const second = await reopen(mock, t, first);
    const error = await expectRelayError(prepareLogin(second, owner), "precondition_failed", { reason: "credentials_already_stored" });
    assert.equal((error.details as { key_tag: string }).key_tag, keyTagOf(mock.write.credentials[0]!.apiKey), "the record was healed on the way");
  });

  harness.it("dies after the marker, before the create left: the create is retried once, after a minute, because derive says no key exists", async (mock, t) => {
    const first = await createWorld(mock, t, { credentials: crashAt("create_marker_written") });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(first, owner);
    await expectCrash(submitLogin(first, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")));
    assert.equal(mintedKeys(mock), 0, "the request never left");
    first.crash();

    const second = await reopen(mock, t, first);
    // Too soon: the earlier request may still be in flight somewhere. Derive was asked, nothing was created.
    const soon = await prepareLogin(second, owner);
    await expectRelayError(submitLogin(second, soon.prepared_id, await signDigest(owner, soon.sign.expected_digest as Hex, "raw")), "precondition_failed", { reason: "create_settling" });
    assert.equal(requestsTo(second, "POST", "/auth/api-key").length, 0);
    mock.clock.advanceMs(61_000);
    await connect(second, owner);
    assert.equal(mintedKeys(mock), 1);
    assert.equal(requestsTo(second, "POST", "/auth/api-key").length, 1);
    assert.equal(statusRecord(second, owner)?.state, "validated");
  });

  for (const fault of ["5xx", "truncated-json", "timeout"] as const) {
    harness.it(`the create worked but its answer was lost (${fault}): ambiguous, an alert, no second create, and derive recovers it when XO shows secrets`, async (mock, t) => {
      mock.setSwitch("auth.derive_returns_secret", "yes");
      const world = await createWorld(mock, t, { credentials: { requestTimeoutMs: 300 } });
      const owner = await deployed(mock, 0);
      const prepared = await prepareLogin(world, owner);
      const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
      mock.injectFault(fault, { count: 1, listeners: ["orderbook"], when: "after" });
      await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "ambiguous", { reason: "create_outcome_unknown" });
      assert.equal(mintedKeys(mock), 1, "XO did create it");
      assert.equal(world.prepared.require(prepared.prepared_id).state, "ambiguous");
      assert.equal((flowOf(world, owner) as Record<string, unknown>)["createOutcome"], "ambiguous");
      assert.ok(world.alerts.raised.some((alert) => alert.id === "credential_create_ambiguous" && alert.severity === "critical"));
      assert.equal(await storedTriplet(world, owner), undefined);
      // Ask again: the relay does not post again, it derives, and XO shows the secret.
      await connect(world, owner);
      assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
      assert.equal(mintedKeys(mock), 1);
      tripletMatchesMock(await storedTriplet(world, owner), mock.write.credentials[0]!);
    });
  }

  harness.it("a 503 with Cloudflare headers on the create is ambiguous, not 'not processed': one POST only, ever", async (mock, t) => {
    mock.setSwitch("auth.derive_returns_secret", "yes");
    const world = await createWorld(mock, t, {
      intercept: ({ method, url }) =>
        method === "POST" && url.pathname === "/auth/api-key" ? new Response("<html><body>Service Unavailable</body></html>", { status: 503, headers: { server: "cloudflare", "content-type": "text/html" } }) : undefined,
    });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "ambiguous", { reason: "create_outcome_unknown" });
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["createOutcome"], "ambiguous");
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["createAttempts"], 1);
    world.setIntercept(undefined);
    await connect(world, owner).catch(() => undefined);
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1, "no second create");
  });

  harness.it("a lost create answer with XO hiding secrets is final: the relay says the key cannot be recovered, and creates nothing else", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    mock.injectFault("5xx", { count: 1, listeners: ["orderbook"], when: "after" });
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "ambiguous");
    const again = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, again.prepared_id, await signDigest(owner, again.sign.expected_digest as Hex, "raw")), "precondition_failed", { reason: "secret_not_recoverable" });
    assert.equal(mintedKeys(mock), 1);
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
    await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "credentials_failed" });
  });

  harness.it("once XO is known to hide secrets, a key that may exist is not chased with another signature request", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    mock.injectFault("5xx", { count: 1, listeners: ["orderbook"], when: "after" });
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "ambiguous");
    // Nothing is known yet about derive, so the next login is allowed (it may recover the key).
    assert.equal((await prepareLogin(world, owner)).kind, "auth");
    await world.capabilities.record({ id: "AU2", state: "no", source: "operator", note: "T2: derive does not show the secret" });
    const sent = world.sent.length;
    await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "secret_not_recoverable" });
    assert.equal(world.sent.length, sent, "refused before any read");
  });

  harness.it("a create that answered 200 without a usable triplet is a minted key nobody can use: no triplet is stored and none is created again", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    world.setIntercept(async (request) => {
      if (request.url.pathname !== "/auth/api-key" || request.method !== "POST") return undefined;
      const real = await mock.asFetch(request.url.toString(), { method: "POST", headers: request.headers, body: request.body });
      assert.equal(real.status, 200);
      return jsonResponse(200, { apiKey: "k-without-secret" });
    });
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "ambiguous", { reason: "create_answer_unusable" });
    assert.equal(await storedTriplet(world, owner), undefined);
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["createOutcome"], "unusable");
    assert.ok(world.alerts.raised.some((alert) => alert.id === "credential_create_unusable"));
    world.setIntercept(undefined);
    const again = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, again.prepared_id, await signDigest(owner, again.sign.expected_digest as Hex, "raw")), "precondition_failed", { reason: "secret_not_recoverable" });
    assert.equal(mintedKeys(mock), 1);
  });

  harness.it("a triplet with a space or a control character in it is not stored or used", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    for (const bad of [{ apiKey: "a b", secret: "c2VjcmV0", passphrase: "p" }, { apiKey: "k", secret: "se\ncret", passphrase: "p" }, { apiKey: "k", secret: "c2VjcmV0", passphrase: "" }]) {
      world.setIntercept(async (request) => (request.url.pathname === "/auth/api-key" && request.method === "POST" ? jsonResponse(200, bad) : undefined));
      const prepared = await prepareLogin(world, owner);
      await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "ambiguous");
      assert.equal(await storedTriplet(world, owner), undefined);
      assert.equal(l2Requests(world).length, 0, "nothing was signed with it");
      // Reset the one create for the next shape (the test is about the parser, not the single-create rule).
      await world.storage.state.transact(() => ({ ops: [{ ns: "credential_flow", key: owner.smart.toLowerCase(), value: null }], result: undefined }));
    }
  });

  harness.it("the triplet cannot be written: the key is reported as unusable, an alert is raised, nothing is signed with it, and the encrypted backup brings it back", async (mock, t) => {
    const faulty = faultyFs();
    const world = await createWorld(mock, t, { fs: faulty.fs });
    const owner = await deployed(mock, 0);
    faulty.add({ op: "rename", path: /xo_triplet\.enc$/, always: true });
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "internal", { reason: "persist_failed" });
    assert.ok(world.alerts.raised.some((alert) => alert.id === "credential_persist_failed" && alert.severity === "critical"));
    assert.equal(mintedKeys(mock), 1);
    assert.equal(l2Requests(world).length, 0, "the unsaved credential was never used");
    assert.equal(world.sent.filter((entry) => entry.method === "GET" && entry.path === "/auth/derive-api-key").length, 1, "not even the follow-up derive ran");
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["createOutcome"], "unusable");
    // The backup was written first, so the secret is not lost.
    faulty.clear();
    const secrets = world.storage.secrets!;
    assert.equal((await secrets.backups(owner.smart.toLowerCase(), "xo_triplet")).length >= 1, true);
    await secrets.restore(owner.smart.toLowerCase(), "xo_triplet");
    tripletMatchesMock(await storedTriplet(world, owner), mock.write.credentials[0]!);
    const readiness = await ensureCredentialsReady(world.context(), owner.smart, { sleep: async () => undefined });
    assert.equal(readiness.state, "validated");
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
  });

  harness.it("a credential that appeared in the vault meanwhile is never overwritten by a newly created one", async (mock, t) => {
    let account = "";
    const world = await createWorld(mock, t, {
      credentials: {
        onStep: async (step) => {
          // Something else wrote a credential for this account between the create and the write.
          if (step === "create_response_received") await world.storage.secrets!.put(account, "xo_triplet", JSON.stringify({ apiKey: "other-key", secret: "b3RoZXItc2VjcmV0", passphrase: "other-pass" }));
        },
      },
    });
    const owner = await deployed(mock, 0);
    account = owner.smart.toLowerCase();
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "internal", { reason: "persist_failed" });
    const kept = await storedTriplet(world, owner);
    assert.equal(kept?.apiKey, "other-key", "the credential that was there is still there");
    assert.equal(l2Requests(world).length, 0);
    assert.ok(world.alerts.raised.some((alert) => alert.id === "credential_persist_failed"));
  });

  harness.it("a create refused with 429 did not spend the one create: the next login makes it", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    let refuse = true;
    world.setIntercept((request) => {
      if (refuse && request.method === "POST" && request.url.pathname === "/auth/api-key") {
        refuse = false;
        return new Response(JSON.stringify({ error: "rate limit exceeded", retry_after_ms: 1000 }), { status: 429, headers: { "retry-after": "1", "content-type": "application/json" } });
      }
      return undefined;
    });
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "rate_limited");
    assert.equal(mintedKeys(mock), 0);
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["createAttempts"], 0);
    await connect(world, owner);
    assert.equal(mintedKeys(mock), 1);
  });

  harness.it("a derive that XO rate-limits is retried by the upstream client and the flow goes on", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    mock.injectFault("429-retry-after", { count: 1, listeners: ["orderbook"], retryAfterMs: 50 });
    await submitLogin(world, prepared.prepared_id, signature);
    assert.equal(requestsTo(world, "GET", "/auth/derive-api-key").length >= 2, true);
    assert.equal(mintedKeys(mock), 1);
  });
});

describe("credentials: the L1 forms (amendment A7)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  const rejectSignatureOfLength = (bytes: number) => (request: { readonly url: URL; readonly headers: Readonly<Record<string, string>> }): Response | undefined => {
    const wire = request.headers["xo_signature"];
    if (request.url.pathname.startsWith("/auth/") && request.headers["xo_api_key"] === undefined && wire !== undefined && (wire.length - 2) / 2 === bytes) {
      return jsonResponse(401, { error: "L1 signature invalid (ECDSA failed; EIP-1271: rejected)" });
    }
    return undefined;
  };

  harness.it("a gateway that refuses the 86-byte form but takes the 66-byte one: the same signature bytes are tried, the form is recorded, and the next account starts there", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: rejectSignatureOfLength(86) });
    const first = await deployed(mock, 0);
    const second = await deployed(mock, 1);
    await connect(world, first);
    const derives = requestsTo(world, "GET", "/auth/derive-api-key");
    assert.deepEqual(derives.slice(0, 2).map((entry) => (entry.headers["xo_signature"]!.length - 2) / 2), [86, 66]);
    assert.equal(derives[0]!.headers["xo_signature"]!.slice(-130), derives[1]!.headers["xo_signature"]!.slice(-130), "no new signature: the same 65 bytes");
    assert.equal(requestsTo(world, "POST", "/auth/api-key")[0]!.headers["xo_signature"]!.length, 2 + 66 * 2);
    assert.deepEqual(factOf(world, "AU6"), { state: "yes", value: "kernel-on:sig-66:addr-yes", source: "probe" });
    assert.equal(statusRecord(world, first)?.state, "validated");

    const sentBefore = world.sent.length;
    await connect(world, second);
    const secondDerives = world.sent.slice(sentBefore).filter((entry) => entry.path === "/auth/derive-api-key");
    assert.ok(secondDerives.length >= 1);
    assert.ok(secondDerives.every((entry) => (entry.headers["xo_signature"]!.length - 2) / 2 === 66), "the recorded form is used from the start");
  });

  harness.it("a gateway that refuses every form: an explicit error, AU6 = no, the count of refusals is kept, and after six the relay stops asking", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: (request) => (request.url.pathname.startsWith("/auth/") && request.headers["xo_api_key"] === undefined ? jsonResponse(401, { error: "L1 signature invalid (ECDSA failed; EIP-1271: rejected)" }) : undefined) });
    const owner = await deployed(mock, 0);
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const sentBefore = world.sent.length;
      const prepared = await prepareLogin(world, owner);
      await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "l1_signature_rejected" });
      const derives = world.sent.slice(sentBefore).filter((entry) => entry.path === "/auth/derive-api-key");
      assert.deepEqual(derives.map((entry) => (entry.headers["xo_signature"]!.length - 2) / 2), [86, 66], `attempt ${String(attempt)} tried both forms once`);
      assert.equal((flowOf(world, owner) as Record<string, unknown>)["l1Rejections"], attempt);
    }
    assert.deepEqual(factOf(world, "AU6"), { state: "no", value: undefined, source: "probe" });
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 0, "nothing was created on a login XO would not accept");
    assert.ok(world.alerts.raised.some((alert) => alert.id === "l1_rejections_exhausted"));
    await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "l1_rejections_exhausted" });
  });

  harness.it("a timestamp refusal is its own error, is counted, and does not try other signature forms", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: (request) => (request.url.pathname === "/auth/derive-api-key" ? jsonResponse(401, { error: "L1 timestamp too old or too far in future" }) : undefined) });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "l1_timestamp_rejected" });
    assert.equal(requestsTo(world, "GET", "/auth/derive-api-key").length, 1);
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["l1Rejections"], 1);
    assert.equal(factOf(world, "AU6"), undefined, "a timestamp problem says nothing about the signature form");
  });

  harness.it("a form selected by a fact is used as it is: kernel-off with a bare 65-byte signature, one try, no ladder; the mock refuses it and the fact turns to no", async (mock, t) => {
    const world = await createWorld(mock, t);
    await world.capabilities.record({ id: "AU6", state: "unknown", source: "operator", value: "kernel-off:sig-65:addr-yes", note: "T2: try the EOA-style login" });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    assert.equal(world.prepared.require(prepared.prepared_id).digest, prepared.sign.expected_digest);
    // The owner signs the PLAIN ClobAuth digest, as the prepare asked.
    const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, "raw");
    await expectRelayError(submitLogin(world, prepared.prepared_id, signature), "upstream_rejected", { reason: "l1_signature_rejected" });
    const derives = requestsTo(world, "GET", "/auth/derive-api-key");
    assert.equal(derives.length, 1, "a pinned form is not stepped");
    assert.equal(derives[0]!.headers["xo_signature"]!.length, 2 + 65 * 2);
    assert.equal(derives[0]!.headers["xo_signature"], signature);
    assert.equal(factOf(world, "AU6")?.state, "no");
    // The rejected form is not selected again.
    const next = await prepareLogin(world, owner);
    assert.equal((world.prepared.require(next.prepared_id).payload as { variant: string }).variant, "kernel-on:sig-86:addr-yes");
  });

  harness.it("a recorded, accepted form is used as it is: when it is later refused the relay does not step to another on its own, it records the refusal and the next login starts over", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: rejectSignatureOfLength(86) });
    await world.capabilities.record({ id: "AU6", state: "yes", source: "probe", value: "kernel-on:sig-86:addr-yes", note: "accepted earlier" });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "l1_signature_rejected" });
    assert.equal(requestsTo(world, "GET", "/auth/derive-api-key").length, 1, "one try in the recorded form, no step");
    assert.equal(factOf(world, "AU6")?.state, "no");
    // The refusal un-pins the form: the next login may step to the 66-byte form.
    await connect(world, owner);
    assert.deepEqual(factOf(world, "AU6"), { state: "yes", value: "kernel-on:sig-66:addr-yes", source: "probe" });
  });

  harness.it("XO_ADDRESS can be left out by a fact; the mock then asks for L1 headers and the relay reports a plain refusal", async (mock, t) => {
    const world = await createWorld(mock, t);
    await world.capabilities.record({ id: "AU6", state: "unknown", source: "operator", value: "kernel-on:sig-86:addr-no", note: "T2" });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "l1_refused" });
    assert.equal(requestsTo(world, "GET", "/auth/derive-api-key")[0]!.headers["xo_address"], undefined);
  });

  harness.it("l1.undeployed = erc6492 changes nothing for a deployed account (the plain form is still sent)", async (mock, t) => {
    mock.setSwitch("l1.undeployed", "erc6492");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    assert.equal((requestsTo(world, "GET", "/auth/derive-api-key")[0]!.headers["xo_signature"]!.length - 2) / 2, 86);
  });
});

describe("credentials: the probes and their stop rule", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  const l2Only = (status: number) => (request: { readonly headers: Readonly<Record<string, string>> }): Response | undefined =>
    request.headers["xo_api_key"] !== undefined ? jsonResponse(status, { error: "invalid L2 signature" }) : undefined;

  harness.it("a credential XO refuses in every HMAC form is parked after the four variants: an explicit error, no fact invented, no more requests", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: l2Only(401) });
    const owner = await deployed(mock, 0);
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "credentials_rejected" });
    assert.equal(l2Requests(world).length, 4, "the four decoding/padding variants, one request each");
    assert.equal(factOf(world, "OR10"), undefined, "a failure is not a fact");
    assert.equal(statusRecord(world, owner)?.state, "failed");
    assert.equal(mintedKeys(mock), 1);
    assert.ok(world.alerts.raised.some((alert) => alert.id === "credentials_probe_budget_spent"));
    // Parked: nothing more is sent, by anyone.
    const sent = world.sent.length;
    const readiness = await ensureCredentialsReady(world.context(), owner.smart, { sleep: async () => undefined });
    assert.equal(readiness.state, "failed");
    assert.equal(world.sent.length, sent);
    await expectRelayError(prepareLogin(world, owner), "precondition_failed", { reason: "credentials_failed" });
  });

  harness.it("with the HMAC form already known, a refusing credential costs one failure per check and is parked at six", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: l2Only(401) });
    await world.capabilities.record({ id: "OR10", state: "yes", source: "probe", value: "b64url-padded:path-with-query:addr-yes" });
    const owner = await deployed(mock, 0);
    const { result } = await connect(world, owner);
    assert.equal(result.credentials, "stored");
    assert.equal(statusRecord(world, owner)?.state, "stored", "one refusal does not park a credential");
    assert.equal(l2Requests(world).length, 1);
    const sleep = async (): Promise<void> => undefined;
    for (let check = 2; check <= 6; check += 1) {
      const readiness = await ensureCredentialsReady(world.context(), owner.smart, { sleep });
      assert.equal(readiness.state, check < 6 ? "stored" : "failed", `check ${String(check)}`);
      assert.equal(l2Requests(world).length, check);
    }
    const sent = world.sent.length;
    await ensureCredentialsReady(world.context(), owner.smart, { sleep });
    await ensureCredentialsReady(world.context(), owner.smart, { sleep });
    assert.equal(world.sent.length, sent, "after the sixth failure nothing is sent");
    assert.equal(l2Requests(world).length, 6);
  });

  harness.it("a timeout or a server error on a probe says nothing about the variant: no failure is counted, and the check can be resumed later without a signature", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: l2Only(503) });
    const owner = await deployed(mock, 0);
    const { result } = await connect(world, owner);
    assert.equal(result.credentials, "stored");
    assert.equal(statusRecord(world, owner)?.state, "stored");
    assert.equal((flowOf(world, owner) as Record<string, unknown>)["probeFailures"], 0);
    assert.equal(factOf(world, "OR10"), undefined);
    world.setIntercept(undefined);
    const readiness = await ensureCredentialsReady(world.context(), owner.smart, { sleep: async () => undefined });
    assert.equal(readiness.state, "validated");
    assert.deepEqual(factOf(world, "OR10"), { state: "yes", value: "b64url-stripped:path-with-query:addr-yes", source: "probe" });
    assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
  });

  harness.it("the failure budget is checked before every probe request, not once per run", async (mock, t) => {
    const world = await createWorld(mock, t, { intercept: l2Only(503) });
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    assert.equal(l2Requests(world).length >= 1, true);
    // Four refusals are already on the record (from earlier runs); the ladder has four untried variants.
    await world.storage.state.transact((reader) => {
      const flow = reader.get("credential_flow", owner.smart.toLowerCase()) as { [key: string]: Json };
      return { ops: [{ ns: "credential_flow", key: owner.smart.toLowerCase(), value: { ...flow, probeFailures: 4 } }], result: undefined };
    });
    world.setIntercept(l2Only(401));
    const before = l2Requests(world).length;
    const readiness = await ensureCredentialsReady(world.context(), owner.smart, { sleep: async () => undefined });
    assert.equal(readiness.state, "failed");
    assert.equal(l2Requests(world).length - before, 2, "two more refusals reach the budget of six, and the third request is never made");
  });

  harness.it("probe B stops after its two tries when neither target works, without condemning a credential probe A already accepted", async (mock, t) => {
    // The orders endpoint refuses every signature while the keys endpoint accepts: the target stays unknown.
    const world = await createWorld(mock, t, { intercept: (request) => (request.url.pathname === "/orders" ? jsonResponse(401, { error: "invalid L2 signature" }) : undefined) });
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    assert.equal(statusRecord(world, owner)?.state, "validated");
    assert.equal(requestsTo(world, "GET", "/orders").length, 2, "documented form, then path-only");
    assert.deepEqual(factOf(world, "OR10"), { state: "unknown", value: "b64url-stripped:unknown:addr-yes", source: "probe" });
    // Asking again does not repeat what already failed.
    const before = requestsTo(world, "GET", "/orders").length;
    await ensureCredentialsReady(world.context(), owner.smart, { sleep: async () => undefined });
    assert.equal(requestsTo(world, "GET", "/orders").length, before);
  });

  harness.it("a secret that cannot be base64-decoded is never tried with a decoded key (no request is wasted on it)", async (mock, t) => {
    // The mock mints base64url secrets, so rewrite the create answer to a secret the mock will not accept as HMAC key.
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    world.setIntercept(async (request) => {
      if (request.url.pathname === "/auth/api-key" && request.method === "POST") {
        const real = await mock.asFetch(request.url.toString(), { method: "POST", headers: request.headers, body: request.body });
        const body = (await real.json()) as { apiKey: string; passphrase: string };
        return jsonResponse(200, { ...body, secret: "not_base64:plain" });
      }
      return undefined;
    });
    const prepared = await prepareLogin(world, owner);
    await expectRelayError(submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw")), "upstream_rejected", { reason: "credentials_rejected" });
    // Only the two raw variants could be tried.
    assert.equal(l2Requests(world).length, 2);
  });

  harness.it("the mock's internal errors stay empty through all of this", async (mock) => {
    assert.deepEqual(mock.internalErrors(), []);
  });
});

describe("secrets never leave the vault in a response, a log or an alert", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("the relay's own audit lines and alerts hold no triplet, no HMAC and no signature", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    const done = await connect(world, owner);
    const minted = mock.write.credentials[0]!;
    const hmacs = l2Requests(world).map((entry) => entry.headers["xo_signature"]!);
    const wires = l1Requests(world).map((entry) => entry.headers["xo_signature"]!);
    const text = [...world.audit.lines, JSON.stringify(world.alerts.raised), JSON.stringify(done.prepared), JSON.stringify(done.result)].join("\n");
    for (const secret of [minted.apiKey, minted.secret, minted.passphrase, done.signature, done.signature.slice(2), ...hmacs, ...wires]) {
      assert.ok(!text.includes(secret), `a secret value appears: ${secret.slice(0, 10)}...`);
    }
    assert.ok(text.length > 100);
    // The only thing the response says about the key is its tag.
    assert.deepEqual(Object.keys(done.result).sort(), ["credentials", "key_tag"]);
  });
});
