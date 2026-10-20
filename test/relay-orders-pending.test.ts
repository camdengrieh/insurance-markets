import assert from "node:assert/strict";
import { after, describe, it, type TestContext } from "node:test";

import { RELAY_PENDING_AFTER_MS } from "../src/relay/contract.js";
import { SUBMIT_PENDING_AFTER_MS } from "../relay/orders.js";
import { cleanup, orderHashOf, prepareOk, signPrepared, startRig, submitOk, type Rig, type RigOptions } from "./relay-orders-helpers.js";

// The 6 s answer budget (invariant 8, OR12) with fake timers, and a restart between the `sending`
// marker and the result (A2): no second order, ever.

const rigs: Rig[] = [];
after(async () => {
  await cleanup(rigs);
});

async function rig(options: RigOptions = {}): Promise<Rig> {
  const made = await startRig(options);
  rigs.push(made);
  return made;
}

// Lets real I/O (the journal fsyncs) and promise chains run while setTimeout is mocked.
async function until(condition: () => boolean, what: string, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

type SubmitResult = { state: string; order_hash: string; detail?: string };

describe("the answer-by budget, with fake timers", () => {
  it("the relay's own `pending` comes before the server's 6 s, and carries the real order hash", () => {
    assert.ok(SUBMIT_PENDING_AFTER_MS < RELAY_PENDING_AFTER_MS);
    assert.equal(RELAY_PENDING_AFTER_MS, 6_000);
  });

  it("a send still running at the budget is answered `pending`, finishes in the background, and posts once", async (t: TestContext) => {
    const r = await rig();
    r.xo.postQueue.push({ kind: "gate" });
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const submit = r.orders.routes["POST /v1/order/submit"];
    assert.ok(submit !== undefined);

    t.mock.timers.enable({ apis: ["setTimeout"] });
    let answer: SubmitResult | undefined;
    const call = submit({ prepared_id: prepared.prepared_id, signature }, r.context()).then((value) => {
      answer = value as SubmitResult;
    });
    await until(() => r.xo.postsOnly() === 1, "the POST to leave");
    await settle();
    assert.equal(answer, undefined, "no answer yet");

    t.mock.timers.tick(4_000);
    await settle();
    assert.equal(answer, undefined, "4 s: still inside the budget");
    // The budget is counted from the handler's start on the REAL clock, so on a loaded machine the timer is armed a little
    // shorter than 5.5 s. 4 s of slack is asserted; the answer is then forced with the rest.
    t.mock.timers.tick(1_500);
    await call;
    assert.ok(answer !== undefined, "5.5 s: the relay answers, before the 6 s the plugin allows");
    const pending: SubmitResult = answer;
    assert.equal(pending.state, "pending");
    assert.equal(pending.order_hash, orderHashOf(prepared), "the real order hash, so the caller can poll it");

    // While it is in flight the status route says so, and the marker is on disk.
    const statusRoute = r.orders.routes["GET /v1/order/:hash"];
    assert.ok(statusRoute !== undefined);
    assert.equal((await statusRoute({ hash: pending.order_hash as `0x${string}` }, r.context())).state, "pending");
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "sending");

    // The gateway finishes; the background completion records it.
    r.xo.openGate();
    await r.orders.idle();
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "accepted");
    assert.equal((await statusRoute({ hash: pending.order_hash as `0x${string}` }, r.context())).state, "open");
    assert.equal(r.xo.postsOnly(), 1);
    t.mock.timers.reset();
  });

  it("a send that answers inside the budget is not pending, and a send that never answers is ambiguous at the request timeout, not resent", async (t: TestContext) => {
    const r = await rig();
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const submit = r.orders.routes["POST /v1/order/submit"];
    assert.ok(submit !== undefined);

    t.mock.timers.enable({ apis: ["setTimeout"] });
    let answer: SubmitResult | undefined;
    const call = submit({ prepared_id: prepared.prepared_id, signature }, r.context()).then((value) => {
      answer = value as SubmitResult;
    });
    await until(() => r.xo.postsOnly() === 1, "the POST to leave");
    t.mock.timers.tick(5_500);
    await call;
    assert.equal(answer?.state, "pending");
    // The request itself times out at 10 s: the outcome is then unknown, held, never resent.
    t.mock.timers.tick(4_500);
    await r.orders.idle();
    const item = r.relay.services.prepared.require(prepared.prepared_id);
    assert.equal(item.state, "ambiguous");
    assert.equal(r.relay.services.ledger.reservation(item.reservationIds[0] as string)?.hold, true);
    assert.equal(r.xo.postsOnly(), 1);
    t.mock.timers.reset();
    // and a later submit of the same item sends nothing
    const again = await r.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
    assert.equal(again.ok ? "" : again.error.code, "prepared_used");
    assert.equal(r.xo.postsOnly(), 1);
  });

  it("the request's own signal never reaches the POST: a caller who hangs up does not turn a send into an ambiguous one", async () => {
    const r = await rig({ deps: { pendingAfterMs: 50 } });
    r.xo.postQueue.push({ kind: "gate" });
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const submit = r.orders.routes["POST /v1/order/submit"];
    assert.ok(submit !== undefined);
    const caller = new AbortController();
    const answer = (await submit({ prepared_id: prepared.prepared_id, signature }, r.context(caller.signal))) as SubmitResult;
    assert.equal(answer.state, "pending");
    caller.abort();
    await settle();
    r.xo.openGate();
    await r.orders.idle();
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "accepted", "the send ran to its end");
    assert.equal(r.xo.postsOnly(), 1);
  });

  it("a fast answer is returned as it is", async () => {
    const r = await rig();
    const sent = await submitOk(r, await prepareOk(r));
    assert.equal(sent.state, "accepted");
  });

  it("the checks before the send count against the budget: time spent before the POST is taken off the 5.5 s", async (t: TestContext) => {
    // A tripwire checker that takes 400 ms of real time (setTimeout is mocked, so it spins on setImmediate).
    const slow = {
      id: "slow",
      check: async (): Promise<undefined> => {
        const end = Date.now() + 400;
        while (Date.now() < end) await new Promise<void>((resolve) => setImmediate(resolve));
        return undefined;
      },
    };
    const r = await rig({ tripwireCheckers: [slow] });
    r.xo.postQueue.push({ kind: "gate" });
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const submit = r.orders.routes["POST /v1/order/submit"];
    assert.ok(submit !== undefined);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let answer: SubmitResult | undefined;
    const call = submit({ prepared_id: prepared.prepared_id, signature }, r.context()).then((value) => {
      answer = value as SubmitResult;
    });
    await until(() => r.xo.postsOnly() === 1, "the POST to leave");
    t.mock.timers.tick(4_000);
    await settle();
    assert.equal(answer, undefined);
    // At least 400 ms were spent before the send, so the answer is due by 5.1 s of mocked time at the latest (real
    // elapsed time on a loaded machine only makes it earlier, hence 4 s of slack above and not 5 s).
    t.mock.timers.tick(1_100);
    await call;
    assert.equal((answer as SubmitResult | undefined)?.state, "pending");
    r.xo.openGate();
    await r.orders.idle();
    t.mock.timers.reset();
  });
});

describe("a restart between the `sending` marker and the result (A2)", () => {
  it("never sends a second order: the item is ambiguous, the reservation held, an alert raised, and the order is found by hash", async () => {
    const r = await rig({ deps: { pendingAfterMs: 60 } });
    // The order is placed, then the connection hangs: the relay is killed before it hears anything.
    r.xo.postQueue.push({ kind: "place_then_hang" });
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const hash = orderHashOf(prepared);
    const sent = await submitOk(r, prepared, signature);
    assert.equal(sent.state, "pending");
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "sending");
    const reservationId = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;

    const second = await r.restart("crash");
    rigs.push(second);
    r.xo.releaseHangs();
    assert.equal(second.relay.recovered.interruptedSends, 1);
    const item = second.relay.services.prepared.require(prepared.prepared_id);
    assert.equal(item.state, "ambiguous");
    assert.equal(item.detail, "interrupted_by_restart");
    const held = second.relay.services.ledger.reservation(reservationId);
    assert.equal(held?.state, "reserved", "a restart never resets a cap");
    assert.equal(held?.hold, true);
    assert.ok(second.relay.services.alerts.recent().some((alert) => alert.id === "send_interrupted_by_restart"));
    assert.equal((await second.relay.services.ledger.usageDetail(second.account.toLowerCase())).spentAtomic, 6_050_000n);

    // Submitting again, with the same signature: nothing is sent.
    const again = await second.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
    assert.equal(again.ok ? "" : again.error.code, "prepared_used");
    assert.equal((again.ok ? {} : again.error.details)?.["state"], "ambiguous");
    assert.equal((again.ok ? {} : again.error.details)?.["order_hash"], hash);

    // The order did go out before the crash. Looking it up finds it.
    const found = await second.get(`/v1/order/${hash}` as never);
    assert.ok(found.ok);
    assert.equal((found.data as { state: string }).state, "open");
    assert.equal(second.relay.services.prepared.require(prepared.prepared_id).state, "accepted");
    assert.equal(second.xo.postsOnly(), 1, "exactly one POST in the whole story");
    assert.equal(second.xo.orders.size, 1, "exactly one order on the book");
  });

  it("when the order never went out, the item stays ambiguous until the order expires and then the cap is given back", async () => {
    const r = await rig({ deps: { pendingAfterMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "pending");
    const reservationId = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
    const second = await r.restart("crash");
    rigs.push(second);
    r.xo.releaseHangs();
    const get = async (): Promise<{ state: string; detail?: string }> => {
      const result = await second.get(`/v1/order/${sent.order_hash}` as never);
      assert.ok(result.ok);
      return result.data as { state: string; detail?: string };
    };
    assert.deepEqual(await get(), { order_hash: sent.order_hash, state: "ambiguous", detail: "not_visible_yet" });
    assert.equal(second.relay.services.ledger.reservation(reservationId)?.state, "reserved");
    second.clock.advance(330_000);
    const final = await get();
    assert.equal(final.state, "rejected");
    assert.equal(final.detail, "not_placed_after_expiry");
    assert.equal(second.relay.services.ledger.reservation(reservationId)?.state, "released");
    assert.equal(second.xo.postsOnly(), 1);
    assert.equal(second.xo.orders.size, 0);
  });

  it("a clean restart after a finished send keeps the item used, the cap counted, and the order findable", async () => {
    const r = await rig();
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const sent = await submitOk(r, prepared, signature);
    const second = await r.restart("close");
    rigs.push(second);
    assert.equal(second.relay.recovered.interruptedSends, 0);
    const again = await second.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
    assert.equal(again.ok ? "" : again.error.code, "prepared_used");
    assert.equal((await second.relay.services.ledger.usageDetail(second.account.toLowerCase())).spentAtomic, 6_050_000n);
    const found = await second.get(`/v1/order/${sent.order_hash}` as never);
    assert.ok(found.ok);
    assert.equal((found.data as { state: string }).state, "open");
    assert.equal(second.xo.postsOnly(), 1);
  });

  it("a crash after prepare and before submit loses nothing: the item and its reservation are still there", async () => {
    const r = await rig();
    const prepared = await prepareOk(r);
    const signature = await signPrepared(prepared);
    const second = await r.restart("crash");
    rigs.push(second);
    assert.equal(second.relay.services.ledger.list({ state: "reserved" }).length, 1);
    const sent = await second.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
    assert.ok(sent.ok, JSON.stringify(sent));
    assert.equal(sent.data.state, "accepted");
  });
});
