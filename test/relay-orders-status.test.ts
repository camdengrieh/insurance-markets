import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { RELAY_USER_AGENT } from "../src/relay/contract.js";
import type { Json } from "../relay/store.js";
import {
  OWNER_KEY,
  STRANGER_KEY,
  TOKEN_ID,
  cleanup,
  fillRow,
  hash32,
  orderHashOf,
  prepareOk,
  startRig,
  submitOk,
  type Rig,
  type RigOptions,
} from "./relay-orders-helpers.js";

// GET /v1/order/:hash and the reconcile rules (A2, A5), the sweep that gives reservations back, cancel and list.

const rigs: Rig[] = [];
after(async () => {
  await cleanup(rigs);
});

async function rig(options: RigOptions = {}): Promise<Rig> {
  const made = await startRig(options);
  rigs.push(made);
  return made;
}

type StatusBody = { order_hash: string; state: string; filled_shares?: string; remaining_shares?: string; detail?: string };

async function status(r: Rig, hash: string): Promise<StatusBody> {
  const result = await r.get(`/v1/order/${hash}` as never);
  assert.ok(result.ok, JSON.stringify(result));
  return result.data as StatusBody;
}

// Places an order through the whole path and returns the pieces a test needs.
async function placed(r: Rig, over: Parameters<typeof prepareOk>[1] = {}) {
  const prepared = await prepareOk(r, over);
  const sent = await submitOk(r, prepared);
  const hash = orderHashOf(prepared);
  const reservationId = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
  return { prepared, sent, hash, reservationId };
}

const reservation = (r: Rig, id: string) => r.relay.services.ledger.reservation(id);

describe("GET /v1/order/:hash", () => {
  it("an order this relay never prepared is `unknown`, and an order not yet submitted is `unknown` too", async () => {
    const r = await rig();
    assert.deepEqual(await status(r, hash32(0x1234)), { order_hash: hash32(0x1234), state: "unknown", detail: "no_record" });
    const prepared = await prepareOk(r);
    assert.deepEqual(await status(r, orderHashOf(prepared)), { order_hash: orderHashOf(prepared), state: "unknown", detail: "not_submitted" });
    assert.equal(r.xo.postsOnly(), 0);
  });

  it("follows a resting order through partial fill and complete fill, and the ledger commits only on a complete fill", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r);
    assert.deepEqual(await status(r, hash), { order_hash: hash, state: "open", filled_shares: "0", remaining_shares: "10", detail: "resting" });
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.matchedMicro = 4_000_000n;
    assert.deepEqual(await status(r, hash), { order_hash: hash, state: "partially_filled", filled_shares: "4", remaining_shares: "6", detail: "resting" });
    assert.equal(reservation(r, reservationId)?.state, "reserved");
    order.matchedMicro = 10_000_000n;
    order.status = "MATCHED";
    assert.deepEqual(await status(r, hash), { order_hash: hash, state: "filled", filled_shares: "10", remaining_shares: "0", detail: "fully_matched" });
    assert.equal(reservation(r, reservationId)?.state, "committed");
    // and it stays that way without asking the order book again
    const before = r.xo.requests.length;
    assert.equal((await status(r, hash)).state, "filled");
    assert.equal(r.xo.requests.length, before);
    assert.equal((await r.relay.services.ledger.usageDetail(r.account.toLowerCase())).spentAtomic, 6_050_000n, "a filled order stays counted for the day");
  });

  it("a cancelled order is `cancelled` at once but its reservation is given back only after its expiry has passed", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.status = "CANCELED";
    assert.equal((await status(r, hash)).state, "cancelled");
    assert.equal(reservation(r, reservationId)?.state, "reserved", "a cancel does not kill the signature: the amount stays counted");
    // (the fake clock also steps a quarter second per request, so these margins are loose on purpose)
    r.clock.advance(300_000 + 9_000);
    assert.equal((await status(r, hash)).state, "cancelled");
    assert.equal(reservation(r, reservationId)?.state, "reserved", "not before the sweeper's slack has passed");
    r.clock.advance(15_000);
    assert.equal((await status(r, hash)).state, "cancelled");
    assert.equal(reservation(r, reservationId)?.state, "released");
    assert.equal((await r.relay.services.ledger.usageDetail(r.account.toLowerCase())).spentAtomic, 0n);
  });

  it("an order that expires part-filled settles for what was filled, after its expiry", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.matchedMicro = 4_000_000n;
    order.status = "EXPIRED";
    r.clock.advance(320_000);
    const shown = await status(r, hash);
    assert.equal(shown.state, "expired");
    assert.equal(shown.filled_shares, "4");
    assert.equal(reservation(r, reservationId)?.state, "committed");
    // 4 shares at 0.55 is 2.2 principal and 2.42 with the bound; the 6.05 reserved is cut to that
    assert.equal(reservation(r, reservationId)?.spentAtomic, 2_420_000n);
    assert.equal((await r.relay.services.ledger.usageDetail(r.account.toLowerCase())).spentAtomic, 2_420_000n);
  });

  it("a SELL that expires part-filled settles for the face value (1.00 USD a share) of what filled, not the cash it brought (RT-3)", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r, { side: "SELL", price: "0.4", shares: "10" });
    // reserved at the larger of the 4.00 expected proceeds and 10 shares x 1.00
    assert.equal(reservation(r, reservationId)?.amountAtomic, 10_000_000n);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.matchedMicro = 4_000_000n;
    order.status = "EXPIRED";
    r.clock.advance(320_000);
    const shown = await status(r, hash);
    assert.equal(shown.filled_shares, "4");
    // 4 shares brought 1.60 but count 4.00
    assert.equal(reservation(r, reservationId)?.spentAtomic, 4_000_000n);
    assert.equal((await r.relay.services.ledger.usageDetail(r.account.toLowerCase())).spentAtomic, 4_000_000n);
  });

  it("a fee above the 800 bps bound on a fill latches a tripwire and alerts, and the relay goes read-only", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.matchedMicro = 1_000_000n;
    order.feeRateBps = 801;
    await status(r, hash);
    assert.deepEqual(
      r.relay.services.tripwires.snapshot().tripped.map((entry) => entry.id),
      ["order_fee_over_bound"],
    );
    assert.ok(r.relay.services.alerts.recent().some((alert) => alert.id === "order_fee_over_bound"));
    const refused = await r.post("/v1/order/prepare", { owner: OWNER_KEY.address, token_id: TOKEN_ID, side: "BUY", price: "0.55", shares: "10", tif: "GTD" });
    assert.equal(refused.ok ? "" : refused.error.code, "tripwire");
  });

  it("a fee above the bound is also caught when the order shows up in the order list", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.matchedMicro = 1_000_000n;
    order.feeRateBps = 1000;
    const listed = await r.post("/v1/orders/list", { owner: OWNER_KEY.address });
    assert.ok(listed.ok);
    assert.deepEqual(
      r.relay.services.tripwires.snapshot().tripped.map((entry) => entry.id),
      ["order_fee_over_bound"],
    );
  });

  it("a fee at exactly the bound is fine, in the order row and in the fill logs", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.matchedMicro = 1_000_000n;
    order.feeRateBps = 800;
    await status(r, hash);
    assert.equal(r.relay.services.tripwires.snapshot().ok, true);
  });
});

describe("reconcile after an ambiguous send (A5)", () => {
  it("finds an order whose response was lost in the open orders, marks the item accepted, and never resends", async () => {
    const r = await rig();
    r.xo.postQueue.push({ kind: "lost_response" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "ambiguous");
    const itemId = prepared.prepared_id;
    assert.equal(r.relay.services.prepared.require(itemId).state, "ambiguous");
    const shown = await status(r, sent.order_hash);
    assert.equal(shown.state, "open");
    assert.equal(r.relay.services.prepared.require(itemId).state, "accepted");
    const id = r.relay.services.prepared.require(itemId).reservationIds[0] as string;
    assert.equal(reservation(r, id)?.state, "reserved");
    assert.equal(r.xo.posts.length, 1);
    assert.equal(r.xo.orders.size, 1);
  });

  it("an order that is not visible yet stays ambiguous until it has expired; then, with every source readable, it never took", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "ambiguous");
    const id = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
    assert.deepEqual(await status(r, sent.order_hash), { order_hash: sent.order_hash, state: "ambiguous", detail: "not_visible_yet" });
    assert.equal(reservation(r, id)?.state, "reserved");
    r.clock.advance(300_000 + 9_000);
    assert.equal((await status(r, sent.order_hash)).state, "ambiguous", "the slack after the deadline is not over");
    r.clock.advance(15_000);
    const final = await status(r, sent.order_hash);
    assert.equal(final.state, "rejected");
    assert.equal(final.detail, "not_placed_after_expiry");
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "rejected");
    assert.equal(reservation(r, id)?.state, "released");
    assert.equal(r.xo.posts.length, 1, "reconciling never resends");
  });

  it("after the expiry, if the sources cannot be read, the state is `unknown` and the reservation stays", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    const id = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
    r.clock.advance(400_000);
    r.xo.listFailure = 500;
    r.xo.explorerFailure = 500;
    const shown = await status(r, sent.order_hash);
    assert.equal(shown.state, "unknown");
    assert.equal(shown.detail, "could_not_confirm_after_expiry");
    assert.equal(reservation(r, id)?.state, "reserved");
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "ambiguous");
  });

  it("a first page that is not the last cannot prove absence", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    r.clock.advance(400_000);
    r.xo.listCursor = "MTAw";
    const shown = await status(r, sent.order_hash);
    assert.equal(shown.state, "unknown");
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "ambiguous");
  });

  it("finds an order that is no longer resting in the exchange's fill logs by order hash: complete and partial fills", async () => {
    for (const [taken, expected, filled] of [
      [10_000_000n, "filled", "10"],
      [4_000_000n, "partially_filled", "4"],
    ] as const) {
      const r = await rig({ deps: { postTimeoutMs: 60 } });
      r.xo.postQueue.push({ kind: "hang" });
      const prepared = await prepareOk(r);
      const sent = await submitOk(r, prepared);
      assert.equal(sent.state, "ambiguous");
      const id = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
      // a BUY: the maker gave collateral (makerAmountFilled) and got shares (takerAmountFilled)
      r.xo.fillRows.set(sent.order_hash, [fillRow(sent.order_hash, r.account, { makerAmount: (taken * 55n) / 100n, takerAmount: taken, fee: 0n })]);
      const shown = await status(r, sent.order_hash);
      assert.equal(shown.state, expected);
      assert.equal(shown.filled_shares, filled);
      assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "accepted");
      if (expected === "filled") assert.equal(reservation(r, id)?.state, "committed");
      else assert.equal(reservation(r, id)?.state, "reserved", "settled only once the order's expiry has passed");
    }
  });

  it("reads a SELL's fill from the other leg: shares are what the maker gave", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r, { side: "SELL", price: "0.9", shares: "2" });
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "ambiguous");
    // a SELL of 2 shares: makerAmountFilled is shares, takerAmountFilled is collateral
    r.xo.fillRows.set(sent.order_hash, [fillRow(sent.order_hash, r.account, { makerAmount: 1_500_000n, takerAmount: 1_350_000n, fee: 0n })]);
    const shown = await status(r, sent.order_hash);
    assert.equal(shown.state, "partially_filled");
    assert.equal(shown.filled_shares, "1.5");
    assert.equal(shown.remaining_shares, "0.5");
  });

  it("fill rows that cannot be decoded still prove the order traded", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    r.xo.fillRows.set(sent.order_hash, [{ ...fillRow(sent.order_hash, r.account, { makerAmount: 1n, takerAmount: 1n, fee: 0n }), data: "0x1234" }]);
    const shown = await status(r, sent.order_hash);
    assert.equal(shown.state, "filled");
    assert.equal(shown.detail, "fill_logs_found");
    assert.equal(shown.filled_shares, undefined);
  });

  it("a fee in the fill logs above the bound latches the tripwire", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    // 5.5 collateral and a fee of 0.45: 818 bps
    r.xo.fillRows.set(sent.order_hash, [fillRow(sent.order_hash, r.account, { makerAmount: 5_500_000n, takerAmount: 10_000_000n, fee: 450_000n })]);
    await status(r, sent.order_hash);
    assert.deepEqual(
      r.relay.services.tripwires.snapshot().tripped.map((entry) => entry.id),
      ["order_fee_over_bound"],
    );
  });

  it("an answer for some other order is never taken as this order's status", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    const other = await placed(r, { shares: "1", price: "0.5" });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    const lost = await submitOk(r, prepared);
    assert.equal(lost.state, "ambiguous");
    // the order list (one page) shows only the other order; the single-order route answers with the other order's row
    r.xo.singleAnswersWith = other.hash;
    const shown = await status(r, lost.order_hash);
    assert.equal(shown.state, "ambiguous");
    assert.equal(r.relay.services.prepared.require(prepared.prepared_id).state, "ambiguous");
  });

  it("a duplicate report proves nothing by itself: it is ambiguous until the order is found", async () => {
    const r = await rig();
    r.xo.postQueue.push({ kind: "reject", status: 400, error: "duplicate order" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "ambiguous");
    assert.equal((await status(r, sent.order_hash)).state, "ambiguous");
    assert.equal(r.xo.posts.length, 1);
  });
});

describe("the sweep gives reservations back only with evidence (A2)", () => {
  it("a rejected order keeps its reservation until the order's own expiry, then the sweep gives it back", async () => {
    const r = await rig();
    r.xo.postQueue.push({ kind: "reject", status: 422, error: "size below minimum: min 5000000, got 1000000" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "rejected");
    const id = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
    assert.equal(reservation(r, id)?.state, "reserved");
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 0, unknown: 0 }, "not expired yet");
    r.clock.advance(330_000);
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 1, present: 0, unknown: 0 });
    assert.equal(reservation(r, id)?.state, "released");
  });

  it("releases items that were never sent once their expiry plus the sweeper's slack has passed, and not before", async () => {
    const r = await rig();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const prepared = await prepareOk(r, { price: "0.5", shares: "18.18" });
      ids.push(r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string);
    }
    const ctx = r.context();
    assert.deepEqual(await r.orders.sweep(ctx), { released: 0, present: 0, unknown: 0 }, "nothing has expired");
    r.clock.advance(300_000 + 1_000);
    assert.deepEqual(await r.orders.sweep(ctx), { released: 0, present: 0, unknown: 3 }, "expired, but inside the slack");
    r.clock.advance(15_000);
    assert.deepEqual(await r.orders.sweep(ctx), { released: 3, present: 0, unknown: 0 });
    for (const id of ids) assert.equal(reservation(r, id)?.state, "released");
    assert.equal((await r.relay.services.ledger.usageDetail(r.account.toLowerCase())).spentAtomic, 0n);
    assert.equal(r.xo.requests.filter((entry) => entry.includes("/orders")).length, 0, "nothing needed asking the order book");
  });

  it("keeps a reservation whose order is still resting past its expiry (the gateway lags), and one it cannot verify", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r);
    r.clock.advance(400_000);
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 1, unknown: 0 });
    assert.equal(reservation(r, reservationId)?.state, "reserved");
    // the order book becomes unreadable and the order is gone from the list
    r.xo.orders.get(hash)!.status = "CANCELED";
    r.xo.listFailure = 500;
    r.xo.explorerFailure = 500;
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 0, unknown: 1 });
    assert.equal(reservation(r, reservationId)?.state, "reserved");
    // readable again (and the circuit breaker the 500s opened has closed): a cancelled order past its expiry is given back
    r.clock.advance(60_000);
    r.xo.listFailure = undefined;
    r.xo.explorerFailure = undefined;
    const swept = await r.orders.sweep(r.context());
    assert.equal(swept.released + swept.present, 1);
    assert.equal(reservation(r, reservationId)?.state, "released");
  });

  it("an order the gateway accepted that then vanishes from the book and the fill logs keeps its reservation (a fill is not in the open list)", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r);
    // The gateway stops returning the order (as it may for a matched one) and the explorer has no rows.
    r.xo.orders.delete(hash);
    r.clock.advance(400_000);
    const shown = await r.get(`/v1/order/${hash}` as never);
    assert.ok(shown.ok);
    const data = shown.data as { state: string; detail?: string };
    assert.notEqual(data.state, "expired");
    assert.notEqual(data.state, "rejected");
    assert.equal(reservation(r, reservationId)?.state, "reserved");
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 0, unknown: 1 });
    assert.equal(reservation(r, reservationId)?.state, "reserved");
    assert.equal((await r.relay.services.ledger.usageDetail(r.account.toLowerCase())).spentAtomic > 0n, true, "the day's spend still counts it");
  });

  it("a filled order found by the sweep is committed, never released", async () => {
    const r = await rig();
    const { hash, reservationId } = await placed(r);
    const order = r.xo.orders.get(hash);
    assert.ok(order !== undefined);
    order.status = "MATCHED";
    order.matchedMicro = 10_000_000n;
    r.clock.advance(400_000);
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 1, unknown: 0 });
    assert.equal(reservation(r, reservationId)?.state, "committed");
  });

  it("an order still being sent is never swept, whatever the clock says", async () => {
    const r = await rig({ deps: { pendingAfterMs: 50 } });
    r.xo.postQueue.push({ kind: "gate" });
    const prepared = await prepareOk(r);
    const sent = await submitOk(r, prepared);
    assert.equal(sent.state, "pending");
    const id = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
    r.clock.advance(600_000);
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 0, unknown: 1 });
    assert.equal(reservation(r, id)?.state, "reserved");
    r.xo.openGate();
    await r.orders.idle();
  });

  it("an ambiguous order is not released while the order list may have more pages", async () => {
    const r = await rig({ deps: { postTimeoutMs: 60 } });
    r.xo.postQueue.push({ kind: "hang" });
    const prepared = await prepareOk(r);
    await submitOk(r, prepared);
    const id = r.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
    r.clock.advance(400_000);
    r.xo.listCursor = "MTAw";
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 0, present: 0, unknown: 1 });
    assert.equal(reservation(r, id)?.state, "reserved");
    r.xo.listCursor = undefined;
    assert.deepEqual(await r.orders.sweep(r.context()), { released: 1, present: 0, unknown: 0 });
    assert.equal(reservation(r, id)?.state, "released");
  });

  it("prepare sweeps at most every 20 s", async () => {
    const r = await rig();
    const a = await prepareOk(r, { ttl_s: 150, shares: "1", price: "0.5" });
    const c = await prepareOk(r, { ttl_s: 165, shares: "1", price: "0.5" });
    const idA = r.relay.services.prepared.require(a.prepared_id).reservationIds[0] as string;
    const idC = r.relay.services.prepared.require(c.prepared_id).reservationIds[0] as string;
    r.clock.advance(170_000);
    await prepareOk(r, { shares: "1", price: "0.5" });
    assert.equal(reservation(r, idA)?.state, "released", "the first prepare after the expiry sweeps");
    assert.equal(reservation(r, idC)?.state, "reserved", "not yet inside its own slack");
    r.clock.advance(12_000);
    await prepareOk(r, { shares: "1", price: "0.5" });
    assert.equal(reservation(r, idC)?.state, "reserved", "the second prepare, 12 s later, does not sweep again");
    r.clock.advance(20_000);
    await prepareOk(r, { shares: "1", price: "0.5" });
    assert.equal(reservation(r, idC)?.state, "released");
  });

  it("a new prepare sweeps first, so the day's budget is current", async () => {
    const r = await rig();
    for (let i = 0; i < 5; i += 1) await prepareOk(r, { price: "0.5", shares: "18.18" });
    const full = await r.post("/v1/order/prepare", { owner: OWNER_KEY.address, token_id: TOKEN_ID, side: "BUY", price: "0.5", shares: "18.18", tif: "GTD" });
    assert.equal(full.ok ? "" : full.error.code, "cap_exceeded");
    r.clock.advance(300_000 + 16_000);
    const fresh = await prepareOk(r, { price: "0.5", shares: "18.18" });
    assert.equal(fresh.caps.day_remaining_usd, "40.001");
    assert.equal(r.relay.services.ledger.list({ state: "released" }).length, 5);
  });
});

describe("POST /v1/order/cancel: one HMAC DELETE, no typed-data forms, no batch, no cancel-all", () => {
  async function cancel(r: Rig, hash: string, account?: string) {
    return r.post("/v1/order/cancel", { owner: OWNER_KEY.address, order_hash: hash, ...(account === undefined ? {} : { account }) } as never);
  }

  it("cancels with {orderID: <hash>} and an L2 HMAC, and says the signature outlives the cancel", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    const done = await cancel(r, hash);
    assert.ok(done.ok, JSON.stringify(done));
    assert.equal(done.data.state, "cancelled");
    assert.match(done.data.detail ?? "", /signature stays valid on chain/);
    assert.deepEqual(r.xo.deletes.map((entry) => entry.body), [{ orderID: hash }]);
    assert.equal(r.xo.deletes[0]?.headers["user-agent"], RELAY_USER_AGENT);
    assert.equal(r.xo.orders.get(hash)?.status, "CANCELED");
    assert.equal(r.relay.services.capabilities.state("OR11"), "yes");
    assert.equal(r.relay.services.capabilities.value("OR11"), "hash");
  });

  it("falls back to the numeric id from the order list, then to the orderId key, and remembers what worked", async () => {
    const numeric = await rig();
    numeric.xo.cancelBody = "numeric-id";
    const a = await placed(numeric);
    const doneA = await cancel(numeric, a.hash);
    assert.ok(doneA.ok && doneA.data.state === "cancelled", JSON.stringify(doneA));
    assert.deepEqual(numeric.xo.deletes.map((entry) => entry.body), [{ orderID: a.hash }, { orderID: String(numeric.xo.orders.get(a.hash)?.id) }]);
    assert.equal(numeric.relay.services.capabilities.value("OR11"), "numeric");
    // the next cancel starts with the numeric id
    const b = await placed(numeric, { shares: "1", price: "0.5" });
    numeric.xo.deletes.length = 0;
    const doneB = await cancel(numeric, b.hash);
    assert.ok(doneB.ok && doneB.data.state === "cancelled");
    assert.equal(numeric.xo.deletes.length, 1);

    const key = await rig();
    key.xo.cancelBody = "orderId";
    const c = await placed(key);
    const doneC = await cancel(key, c.hash);
    assert.ok(doneC.ok && doneC.data.state === "cancelled", JSON.stringify(doneC));
    assert.deepEqual(key.xo.deletes.map((entry) => entry.body), [{ orderID: c.hash }, { orderID: String(key.xo.orders.get(c.hash)?.id) }, { orderId: c.hash }]);
    assert.equal(key.relay.services.capabilities.value("OR11"), "orderId");
  });

  it("reports an order that is already filled, an order that is not there, and never loops forever", async () => {
    const r = await rig();
    const filled = await placed(r);
    r.xo.orders.get(filled.hash)!.status = "MATCHED";
    const a = await cancel(r, filled.hash);
    assert.ok(a.ok);
    assert.equal(a.data.state, "rejected");
    assert.equal(a.data.detail, "already_filled");
    const missing = await cancel(r, hash32(0xdead));
    assert.ok(missing.ok);
    assert.equal(missing.data.state, "not_found");
    assert.ok(r.xo.deletes.length <= 1 + 3, "at most the three forms");
  });

  it("a cancel that gets no answer is ambiguous and is not repeated", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    r.xo.deleteStatusOverride = { status: 503, body: "unavailable" };
    const done = await cancel(r, hash);
    assert.ok(done.ok);
    assert.equal(done.data.state, "ambiguous");
    assert.equal(r.xo.deletes.length, 1);
  });

  it("a cancel whose response is lost is ambiguous, is not repeated, and the status route shows the truth", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    r.xo.deleteLosesResponse = true;
    const done = await cancel(r, hash);
    assert.ok(done.ok);
    assert.equal(done.data.state, "ambiguous");
    assert.equal(r.xo.deletes.length, 1);
    assert.equal((await status(r, hash)).state, "cancelled");
  });

  it("refuses an order that belongs to another account, a different account in the request, and an account with no credentials", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    const wrong = await cancel(r, hash, STRANGER_KEY.address);
    assert.equal(wrong.ok ? "" : wrong.error.code, "account_mismatch");
    // an order this relay recorded for another account
    const state = r.relay.services.state;
    const record = state.get<Record<string, Json>>("orders", hash);
    assert.ok(record !== undefined);
    await state.set("orders", hash, { ...record, order: { ...(record["order"] as Record<string, Json>), account: STRANGER_KEY.address } });
    const other = await cancel(r, hash);
    assert.equal(other.ok ? "" : other.error.code, "account_mismatch");
    assert.equal(r.xo.deletes.length, 0);

    const bare = await rig({ credentials: false });
    const none = await cancel(bare, hash32(5));
    assert.equal(none.ok ? "" : none.error.code, "precondition_failed");
  });

  it("is a write: flag_off and kill_switch refuse it", async () => {
    const off = await rig({ env: { ENABLE_TRADING: "0" } });
    assert.equal((await cancel(off, hash32(5))).ok, false);
    const result = await cancel(off, hash32(5));
    assert.equal(result.ok ? "" : result.error.code, "flag_off");
    const killed = await rig({ env: { KILL: "1" } });
    const refused = await cancel(killed, hash32(5));
    assert.equal(refused.ok ? "" : refused.error.code, "kill_switch");
  });

  it("there is no batch, cancel-all or typed-data cancel anywhere in the route table or in the requests", async () => {
    const r = await rig();
    const { hash } = await placed(r);
    await cancel(r, hash);
    for (const entry of r.xo.requests) {
      assert.ok(!/DELETE .*\/(orders|cancel-all|cancel-market-orders)(\?|$)/.test(entry), entry);
    }
    assert.deepEqual(Object.keys(r.orders.routes).sort(), [
      "GET /v1/order/:hash",
      "POST /v1/order/cancel",
      "POST /v1/order/prepare",
      "POST /v1/order/submit",
      "POST /v1/orders/list",
    ]);
    for (const deleteCall of r.xo.deletes) {
      assert.deepEqual(Object.keys(deleteCall.body), ["orderID"], "a hash only: no signature, no marketId, no orderIds");
    }
  });
});

describe("POST /v1/orders/list", () => {
  it("makes one signed GET /orders with no query string and maps the rows", async () => {
    const r = await rig();
    const a = await placed(r);
    const b = await placed(r, { side: "SELL", price: "0.9", shares: "2" });
    const before = r.xo.requests.length;
    const listed = await r.post("/v1/orders/list", { owner: OWNER_KEY.address });
    assert.ok(listed.ok, JSON.stringify(listed));
    const calls = r.xo.requests.slice(before).filter((entry) => entry.includes("/orders"));
    assert.deepEqual(calls, ["GET orderbooks.xo.market/orders"], "no query string");
    assert.deepEqual(
      listed.data.orders.map((order) => ({ ...order })),
      [
        { order_hash: a.hash, token_id: TOKEN_ID, side: "BUY", price: "0.55", original_shares: "10", remaining_shares: "10", expires_at: listed.data.orders[0]?.expires_at ?? null },
        { order_hash: b.hash, token_id: TOKEN_ID, side: "SELL", price: "0.9", original_shares: "2", remaining_shares: "2", expires_at: listed.data.orders[1]?.expires_at ?? null },
      ],
    );
    assert.match(listed.data.orders[0]?.expires_at ?? "", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  });

  it("says the order book refused the stored credentials (401 or 403 on the list), not a generic failure", async () => {
    for (const status of [401, 403]) {
      const r = await rig();
      r.xo.listFailure = status;
      const listed = await r.post("/v1/orders/list", { owner: OWNER_KEY.address });
      assert.equal(listed.ok, false, String(status));
      if (listed.ok) return;
      assert.equal(listed.error.code, "upstream_rejected", String(status));
      assert.equal((listed.error.details as { reason?: string } | undefined)?.reason, "credentials_refused", String(status));
    }
  });

  it("reports remaining shares after a partial fill and leaves cancelled orders out", async () => {
    const r = await rig();
    const a = await placed(r);
    const b = await placed(r, { shares: "1", price: "0.5" });
    r.xo.orders.get(a.hash)!.matchedMicro = 2_500_000n;
    r.xo.orders.get(b.hash)!.status = "CANCELED";
    const listed = await r.post("/v1/orders/list", { owner: OWNER_KEY.address });
    assert.ok(listed.ok);
    assert.deepEqual(listed.data.orders.map((order) => [order.order_hash, order.remaining_shares]), [[a.hash, "7.5"]]);
  });

  it("refuses an account with no credentials, a different account, and surfaces refused credentials", async () => {
    const bare = await rig({ credentials: false });
    const none = await bare.post("/v1/orders/list", { owner: OWNER_KEY.address });
    assert.equal(none.ok ? "" : none.error.code, "precondition_failed");
    const r = await rig();
    const wrong = await r.post("/v1/orders/list", { owner: OWNER_KEY.address, account: STRANGER_KEY.address });
    assert.equal(wrong.ok ? "" : wrong.error.code, "account_mismatch");
    r.xo.creds = { ...r.xo.creds, apiKey: "someone-else" };
    const refused = await r.post("/v1/orders/list", { owner: OWNER_KEY.address });
    assert.equal(refused.ok ? "" : refused.error.code, "upstream_rejected");
  });

  it("works while the kill switch is on (it is a read)", async () => {
    const r = await rig();
    await placed(r);
    await r.relay.services.flagGate.engageKill("test");
    const listed = await r.post("/v1/orders/list", { owner: OWNER_KEY.address });
    assert.ok(listed.ok);
    assert.equal(listed.data.orders.length, 1);
  });
});
