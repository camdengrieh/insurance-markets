import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { GET_ROUTES, preparedItemPath } from "../src/relay/contract.js";
import type { FlagEnv } from "../src/relay/flags.js";
import type { CreateRelayOptions } from "../relay/main.js";
import { OwnerPolicy } from "../relay/owners.js";
import { routes as preparedRoutes } from "../relay/prepared.js";
import { cleanupClob, lmOrderBody, OWNER_KEY as CLOB_OWNER_KEY, pmOrderBody, startClobRig, type ClobRig } from "./relay-clob-helpers.js";
import { jsonHeaders, rawRequest, TEST_RELAY_KEY, type RawResponse } from "./relay-core-helpers.js";
import { cleanup, orderBody, OWNER_KEY, STRANGER_KEY, signPrepared, startRig, submitOk, type Rig, type RigOptions } from "./relay-orders-helpers.js";

// GET /v1/prepared/{prepared_id} (amendment R9) through the real HTTP server: the item exactly as its prepare route
// sent it, only to an owner the relay serves, and only while it can still be signed. Everything else is a state
// (expired, prepared_used with the state) or the one not-found answer, never the item.

const rigs: Rig[] = [];
const clobRigs: ClobRig[] = [];
after(async () => {
  await cleanup(rigs);
  await cleanupClob(clobRigs);
});

async function rig(options: RigOptions = {}): Promise<Rig> {
  const made = await startRig({ extraRoutes: preparedRoutes, ...options });
  rigs.push(made);
  return made;
}

// The owner policy the production relay uses (XO_OWNER), wired the way createProductionRelay wires it.
function ownerPolicy(env: FlagEnv): Partial<CreateRelayOptions> {
  let policy: OwnerPolicy | undefined;
  return {
    onCore: (core) => {
      policy = OwnerPolicy.open(env, core.services);
    },
    owners: {
      checkRoute: (route, owner) => {
        assert.ok(policy !== undefined);
        policy.checkRoute(route, owner);
      },
      serves: (owner) => policy?.serves(owner) ?? false,
      bindAfterSubmit: async (preparedId) => policy?.bindAfterSubmit(preparedId),
    },
  };
}

function post(port: number, path: string, body: unknown): Promise<RawResponse> {
  return rawRequest({ port, method: "POST", path, headers: jsonHeaders(TEST_RELAY_KEY), body: JSON.stringify(body) });
}

function read(port: number, preparedId: string): Promise<RawResponse> {
  return rawRequest({ port, method: "GET", path: preparedItemPath(preparedId), headers: { "x-relay-key": TEST_RELAY_KEY } });
}

function errorOf(response: RawResponse): { readonly code: string; readonly message: string; readonly details?: Record<string, unknown> } {
  const body = response.json as { error?: { code: string; message: string; details?: Record<string, unknown> } };
  assert.ok(body.error !== undefined, `expected an error, got ${response.text}`);
  return body.error;
}

function idOf(response: RawResponse): string {
  assert.equal(response.status, 200, response.text);
  const id = (response.json as { prepared_id?: unknown }).prepared_id;
  assert.equal(typeof id, "string");
  return id as string;
}

const UNKNOWN_ID = "0123456789abcdef0123456789abcdef";

describe("GET /v1/prepared/:id: the owner's own item", () => {
  it("returns the order item byte for byte as the prepare route sent it, changes nothing, and the item can still be submitted", async () => {
    const r = await rig();
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const id = idOf(prepared);
    const first = await read(r.relay.port, id);
    assert.equal(first.status, 200, first.text);
    assert.equal(first.text, prepared.text, "the stored item is the prepare answer, byte for byte");
    assert.ok(GET_ROUTES["/v1/prepared/:id"].response.safeParse(first.json).success);
    const second = await read(r.relay.port, id);
    assert.equal(second.text, prepared.text, "a read changes nothing");
    const record = r.relay.services.prepared.get(id);
    assert.equal(record?.state, "prepared");
    // The answer kept with the record is what the caller received; there is no signature in it.
    assert.deepEqual(record?.answer, prepared.json);
    const item = prepared.json as Parameters<typeof signPrepared>[0];
    const sent = await submitOk(r, item);
    assert.equal(sent.state, "accepted");
  });

  it("answers through the plugin's client with the parsed item for the asked id", async () => {
    const r = await rig();
    const id = idOf(await post(r.relay.port, "/v1/order/prepare", orderBody(r)));
    const result = await r.client.get(preparedItemPath(id));
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.data.prepared_id, id);
    assert.equal(result.data.kind, "order");
  });

  it("is a read: it is served with the kill switch on", async () => {
    const r = await rig();
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const id = idOf(prepared);
    const killed = await r.restart("close", { env: { KILL: "1" } });
    rigs.push(killed);
    assert.equal(killed.relay.flags().KILL, true);
    const answer = await read(killed.relay.port, id);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.text, prepared.text);
  });
});

describe("GET /v1/prepared/:id: not found, and another owner's item", () => {
  it("answers an unknown id and an item of an owner this relay does not serve with the same not_found, byte for byte", async () => {
    const r = await rig();
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const id = idOf(prepared);
    const unknown = await read(r.relay.port, UNKNOWN_ID);
    assert.equal(unknown.status, 404);
    assert.equal(errorOf(unknown).code, "not_found");

    // The same data directory, now serving only another wallet (XO_OWNER).
    const strangers = await r.restart("close", { createOptions: ownerPolicy({ XO_OWNER: STRANGER_KEY.address }) });
    rigs.push(strangers);
    assert.ok(strangers.relay.services.prepared.get(id) !== undefined, "the item is still stored");
    const hidden = await read(strangers.relay.port, id);
    const unknownThere = await read(strangers.relay.port, UNKNOWN_ID);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.text, unknownThere.text, "another owner's item looks exactly like an id that does not exist");
    assert.equal(hidden.text, unknown.text);
    assert.equal(hidden.text.includes(OWNER_KEY.address.slice(2, 10)), false);

    // An item out of time or already used is hidden the same way: its state is not disclosed either.
    strangers.clock.advance(301_000);
    assert.equal((await read(strangers.relay.port, id)).text, unknown.text);

    // Serving the item's own owner again, it is there (and now says it expired).
    const mine = await strangers.restart("close", { createOptions: ownerPolicy({ XO_OWNER: OWNER_KEY.address }) });
    rigs.push(mine);
    assert.equal(errorOf(await read(mine.relay.port, id)).code, "expired");
  });

  it("serves an owner named in XO_OWNER", async () => {
    const r = await rig({ createOptions: ownerPolicy({ XO_OWNER: OWNER_KEY.address }) });
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const answer = await read(r.relay.port, idOf(prepared));
    assert.equal(answer.text, prepared.text);
  });

  it("refuses an id that is not 32 lower-case hex digits before looking anything up", async () => {
    const r = await rig();
    for (const bad of [UNKNOWN_ID.toUpperCase(), "abc", `${UNKNOWN_ID}00`]) {
      const answer = await rawRequest({ port: r.relay.port, method: "GET", path: `/v1/prepared/${bad}`, headers: { "x-relay-key": TEST_RELAY_KEY } });
      assert.equal(answer.status, 400, bad);
      assert.equal(errorOf(answer).code, "invalid_request");
    }
    const keyless = await rawRequest({ port: r.relay.port, method: "GET", path: preparedItemPath(UNKNOWN_ID) });
    assert.equal(keyless.status, 401);
  });
});

describe("GET /v1/prepared/:id: an item that can no longer be signed", () => {
  it("says expired once the item is out of time, before and after the sweep, and hands out nothing", async () => {
    const r = await rig();
    const id = idOf(await post(r.relay.port, "/v1/order/prepare", orderBody(r)));
    r.clock.advance(300_000);
    for (const pass of ["before the sweep", "after the sweep"]) {
      const answer = await read(r.relay.port, id);
      assert.equal(answer.status, 410, pass);
      const error = errorOf(answer);
      assert.equal(error.code, "expired", pass);
      assert.deepEqual(error.details, { state: "expired" }, pass);
      assert.equal(answer.text.includes("expected_digest"), false, pass);
      await r.relay.services.prepared.sweep();
    }
    assert.equal(r.relay.services.prepared.get(id)?.state, "expired");
  });

  it("says prepared_used with the state once the item was submitted", async () => {
    const r = await rig();
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const id = idOf(prepared);
    await submitOk(r, prepared.json as Parameters<typeof signPrepared>[0]);
    const answer = await read(r.relay.port, id);
    assert.equal(answer.status, 409);
    const error = errorOf(answer);
    assert.equal(error.code, "prepared_used");
    assert.equal(error.details?.["state"], "accepted");
    assert.equal(answer.text.includes("expected_digest"), false);
  });

  it("says prepared_used with state ambiguous for a send interrupted by a restart, and never hands the item out again", async () => {
    const r = await rig();
    const id = idOf(await post(r.relay.port, "/v1/order/prepare", orderBody(r)));
    await r.relay.services.prepared.beginSend(id);
    const sending = await read(r.relay.port, id);
    assert.equal(errorOf(sending).code, "prepared_used");
    assert.equal(errorOf(sending).details?.["state"], "sending");
    const after = await r.restart("crash");
    rigs.push(after);
    const answer = await read(after.relay.port, id);
    assert.equal(answer.status, 409);
    const error = errorOf(answer);
    assert.equal(error.code, "prepared_used");
    assert.deepEqual(error.details, { state: "ambiguous", reason: "interrupted_by_restart" });
    assert.match(error.message, /outcome is unknown/);
  });

  it("says prepared_used with state rejected for an item locked by bad signatures", async () => {
    const r = await rig();
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const id = idOf(prepared);
    for (let attempt = 0; attempt < 5; attempt += 1) await r.relay.services.prepared.noteFailedAttempt(id);
    const error = errorOf(await read(r.relay.port, id));
    assert.equal(error.code, "prepared_used");
    assert.deepEqual(error.details, { state: "rejected", reason: "too_many_bad_signatures" });
  });

  it("refuses an item whose prepare answer was not kept (an item from an older relay) instead of rebuilding a guess", async () => {
    const r = await rig();
    const record = await r.relay.services.prepared.create({ kind: "order", owner: OWNER_KEY.address, account: r.account, digest: `0x${"ab".repeat(32)}`, digestForm: "kernelWrappedOrderHash", payload: null });
    const answer = await read(r.relay.port, record.id);
    assert.equal(answer.status, 422);
    const error = errorOf(answer);
    assert.equal(error.code, "precondition_failed");
    assert.deepEqual(error.details, { reason: "answer_not_kept" });
  });
});

describe("the answer kept with a prepared record", () => {
  it("is kept only for its own record (id, kind, owner, digest), once, and only while the item is unsent", async () => {
    const r = await rig();
    const prepared = await post(r.relay.port, "/v1/order/prepare", orderBody(r));
    const id = idOf(prepared);
    const store = r.relay.services.prepared;
    const item = prepared.json as Record<string, unknown> & { sign: Record<string, unknown> };
    assert.deepEqual(await store.keepAnswer({ ...item, prepared_id: UNKNOWN_ID }), { kept: false, reason: "no_record" });
    const fresh = await store.create({ kind: "order", owner: OWNER_KEY.address, account: r.account, digest: `0x${"cd".repeat(32)}`, digestForm: "kernelWrappedOrderHash", payload: null });
    assert.deepEqual(await store.keepAnswer({ ...item, prepared_id: fresh.id }), { kept: false, reason: "mismatch" }, "another item's answer is not kept under this id");
    assert.deepEqual(await store.keepAnswer({ ...item, owner: STRANGER_KEY.address }), { kept: false, reason: "mismatch" }, "an answer naming another owner is not kept");
    assert.deepEqual(await store.keepAnswer({ ...item, warnings: ["a different answer for the same item"] }), { kept: true }, "the first answer stays; a second one changes nothing");
    assert.deepEqual(store.get(id)?.answer, prepared.json);
    assert.deepEqual(await store.keepAnswer("not an item"), { kept: false, reason: "shape" });
    // A record for the same digest that is already being sent: too late to keep anything for it.
    const sent = await store.create({ kind: "order", owner: OWNER_KEY.address, account: r.account, digest: item.sign["expected_digest"] as `0x${string}`, digestForm: "kernelWrappedOrderHash", payload: null });
    await store.beginSend(sent.id);
    assert.deepEqual(await store.keepAnswer({ ...item, prepared_id: sent.id }), { kept: false, reason: "not_prepared" });
    // Anything that is not a strict Prepared item of the contract is not kept at all.
    assert.deepEqual(await store.keepAnswer({ ...item, signature: `0x${"11".repeat(65)}` }), { kept: false, reason: "shape" });
  });
});

describe("GET /v1/prepared/:id: the CLOB venue kinds round-trip byte for byte", () => {
  async function clobRig(options: Parameters<typeof startClobRig>[0] = {}): Promise<ClobRig> {
    const made = await startClobRig({ extraRoutes: preparedRoutes, ...options });
    clobRigs.push(made);
    return made;
  }

  for (const [label, body] of [
    ["a Polymarket order (clob_order)", pmOrderBody()],
    ["a Limitless order (clob_order)", lmOrderBody()],
  ] as const) {
    it(label, async () => {
      const r = await clobRig();
      const prepared = await post(r.relay.port, "/v1/clob/order/prepare", body);
      const id = idOf(prepared);
      assert.equal((prepared.json as { kind: string }).kind, "clob_order");
      const answer = await read(r.relay.port, id);
      assert.equal(answer.status, 200, answer.text);
      assert.equal(answer.text, prepared.text);
    });
  }

  it("a Polymarket Deposit Wallet order (clob_order, signature type 3)", async () => {
    const r = await clobRig();
    r.venues.pmWallets = [{ proxy: "beacon" }];
    const prepared = await post(r.relay.port, "/v1/clob/order/prepare", pmOrderBody());
    const id = idOf(prepared);
    assert.equal((prepared.json as { account: string }).account, r.venues.walletAddress("beacon"));
    const answer = await read(r.relay.port, id);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.text, prepared.text);
  });

  it("a Polymarket login (clob_auth)", async () => {
    const r = await clobRig({ credentials: { polymarket: false, limitless: false } });
    const prepared = await post(r.relay.port, "/v1/clob/auth/prepare", { owner: CLOB_OWNER_KEY.address, venue: "polymarket" });
    const id = idOf(prepared);
    assert.equal((prepared.json as { kind: string }).kind, "clob_auth");
    const answer = await read(r.relay.port, id);
    assert.equal(answer.status, 200, answer.text);
    assert.equal(answer.text, prepared.text);
    // A login lives about 90 s.
    r.clock.advance(91_000);
    assert.equal(errorOf(await read(r.relay.port, id)).code, "expired");
  });
});
