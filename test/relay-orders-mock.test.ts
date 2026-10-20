import assert from "node:assert/strict";
import { after, describe } from "node:test";

import { RELAY_USER_AGENT, type PostRequest } from "../src/relay/contract.js";
import { MOCK_SWITCHES, type MockSwitchName } from "./mock-xo/switches.js";
import type { MockXo } from "./mock-xo/server.js";
import { useMock } from "./mock-xo/testing.js";
import { createCredentials, marketTokens, setupTrader, type Trader } from "./mock-xo/traders.js";
import {
  OWNER_KEY,
  cleanup,
  orderHashOf,
  prepareOk,
  signPrepared,
  startRig,
  type Rig,
  type RigClock,
  type SignForm,
} from "./relay-orders-helpers.js";

// The order flow against the local mock XO (real EntryPoint, Kernel and validator bytecode on a local anvil)
// in both profiles and with every order switch flipped alone from the pessimistic profile to every other
// value (docs/phase1-gap-closing.md 5.6, profile matrix; decision D9).
//
// Acceptance in every configuration: nothing is signed or sent that does not match a prepared item; the
// caps are never exceeded; no order is placed twice; and every failure is an actionable, coded answer, not a
// hang. What each configuration does is written out below from the switch values, not read from the relay.

const rigs: Rig[] = [];
after(async () => {
  await cleanup(rigs);
});

function mockClock(mock: MockXo): RigClock {
  return {
    now: () => mock.clock.nowMs(),
    advance: (ms) => {
      mock.clock.advanceMs(ms);
    },
    set: (iso) => mock.clock.set(Date.parse(iso)),
    sleep: async (ms) => {
      mock.clock.advanceMs(ms);
    },
  };
}

interface World {
  readonly mock: MockXo;
  readonly rig: Rig;
  readonly trader: Trader;
  readonly yes: string;
  readonly no: string;
  readonly prepared: Set<string>;
}

const rule = <N extends MockSwitchName>(mock: MockXo, name: N): string => String(mock.switches.get(name));

// A funded, registered trader on the local chain, credentials minted through the mock's own L1, and a relay
// that talks to the mock. `probed: false` leaves out the capability facts the credential flow would record.
async function world(mock: MockXo, options: { readonly probed?: boolean; readonly register?: boolean; readonly tradingFlags?: Record<string, string> } = {}): Promise<World> {
  // An account the registry does not know: nothing registers it by itself, whatever the profile says.
  if (options.register === false) mock.setSwitch("registry.trigger", "never");
  const trader = await setupTrader(mock, 0, options.register === false ? { register: false } : {});
  assert.equal(trader.owner.address, OWNER_KEY.address, "owner 0 of the harness is the public test key the rig signs with");
  const creds = await createCredentials(mock, trader);
  const rig = await startRig({ clock: mockClock(mock), fetch: mock.asFetch, triplet: creds, env: options.tradingFlags ?? {} });
  rigs.push(rig);
  if (options.probed !== false) {
    // What the credential flow's probes would have recorded about this server (OR9, OR10).
    await rig.relay.services.capabilities.record({ id: "OR10", state: "yes", source: "probe", value: rule(mock, "hmac.decode") });
    if (rule(mock, "l2.xo_address") === "required") await rig.relay.services.capabilities.record({ id: "OR9", state: "yes", source: "probe", value: "xo_address" });
  }
  const tokens = marketTokens(mock, "clob-active-a");
  mock.clearRequests();
  return { mock, rig, trader, yes: tokens.yes, no: tokens.no, prepared: new Set() };
}

// The signature form the configured gateway accepts, and one it does not (undefined when it takes both).
function acceptedForm(mock: MockXo): SignForm {
  return rule(mock, "order.sig_forms") === "eip191-only" ? "eip191" : "typed";
}
function refusedForm(mock: MockXo): SignForm | undefined {
  const forms = rule(mock, "order.sig_forms");
  return forms === "eip191-only" ? "typed" : forms === "raw-only" ? "eip191" : undefined;
}

const orderPosts = (mock: MockXo): number => mock.requestsTo("orderbook").filter((entry) => entry.method === "POST" && entry.path === "/order").length;
const deletes = (mock: MockXo): string[] => mock.requestsTo("orderbook").filter((entry) => entry.method === "DELETE").map((entry) => entry.path);

async function prepare(w: World, over: Partial<PostRequest<"/v1/order/prepare">> = {}) {
  const prepared = await prepareOk(w.rig, { token_id: w.yes, price: "0.4", shares: "10", ...over });
  w.prepared.add(orderHashOf(prepared));
  return prepared;
}

async function place(w: World, over: Partial<PostRequest<"/v1/order/prepare">> = {}, form?: SignForm) {
  const prepared = await prepare(w, over);
  const signature = await signPrepared(prepared, OWNER_KEY, form ?? acceptedForm(w.mock));
  const result = await w.rig.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
  assert.ok(result.ok, `submit answered an error: ${JSON.stringify(result)}`);
  return { prepared, hash: orderHashOf(prepared), sent: result.data };
}

// Invariants that hold in every configuration, after every journey.
async function invariants(w: World): Promise<void> {
  const { mock, rig } = w;
  // nothing was placed that does not match a prepared item, and no order exists twice
  for (const hash of mock.write.orders.keys()) assert.ok(w.prepared.has(hash), `the mock holds an order the relay never prepared: ${hash}`);
  assert.ok(orderPosts(mock) <= 2 * w.prepared.size, "at most one send, plus the one prefix swap, per prepared item");
  // the caps were never exceeded
  const usage = await rig.relay.services.ledger.usageDetail(rig.account.toLowerCase());
  assert.ok(usage.spentAtomic <= 50_000_000n, "the $50 day");
  for (const reservation of rig.relay.services.ledger.list({ state: "reserved" })) assert.ok(reservation.amountAtomic <= 10_000_000n, "the $10 order");
  // everything the relay sent identified itself with the fixed User-Agent and nothing else
  for (const entry of mock.requests) {
    if (entry.listener !== "orderbook" && entry.listener !== "explorer") continue;
    assert.equal(entry.userAgent, RELAY_USER_AGENT, `${entry.method} ${entry.path}`);
    assert.equal(entry.from, null);
    assert.equal(entry.referer, null);
    assert.equal(entry.origin, null);
  }
  // the credentials never left in a response
  assert.deepEqual(mock.internalErrors().map((error) => error.message), []);
}

// ---- journeys ---------------------------------------------------------------------------------------------------------

// J1: a resting BUY the gateway should take, signed in the form it takes.
async function j1Standard(w: World): Promise<void> {
  const { mock, rig } = w;
  const { hash, sent } = await place(w);
  assert.equal(sent.state, "accepted", sent.detail);
  assert.equal(sent.order_hash, hash);
  const swap = rule(mock, "order.prefix") === "0x00";
  assert.equal(orderPosts(mock), swap ? 2 : 1, "the prefix is swapped once, only on an explicit rejection");
  assert.equal(rig.relay.services.capabilities.value("OR3"), swap ? "prefix_00" : "prefix_01");
  assert.equal(mock.write.orders.size, 1, "exactly one order on the book");
  const shown = await rig.get(`/v1/order/${hash}` as never);
  assert.ok(shown.ok);
  assert.deepEqual({ ...(shown.data as object) }, { order_hash: hash, state: "open", filled_shares: "0", remaining_shares: "10", detail: "resting" });
  const listed = await rig.post("/v1/orders/list", { owner: OWNER_KEY.address });
  assert.ok(listed.ok);
  assert.deepEqual(listed.data.orders.map((order) => [order.order_hash, order.price, order.remaining_shares]), [[hash, "0.4", "10"]]);
  assert.equal(mock.requestsTo("orderbook").filter((entry) => entry.method === "GET" && entry.path === "/orders" && entry.search !== "").length, 0, "the signed list has no query string");
}

// J1b: the same order signed in the form the gateway refuses: a clean rejection, one swap, no order.
async function j1Wrong(w: World): Promise<void> {
  const { mock, rig } = w;
  const wrong = refusedForm(mock);
  if (wrong === undefined) return;
  const { prepared, sent } = await place(w, {}, wrong);
  assert.equal(sent.state, "rejected");
  assert.match(sent.detail ?? "", /signature/i, "the reason is the gateway's own words");
  assert.equal(orderPosts(mock), 2);
  assert.equal(mock.write.orders.size, 0);
  assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "rejected");
  assert.ok(rig.relay.services.ledger.list({ state: "reserved" }).length >= 1, "held until the order's own expiry");
}

// J2: a small order. The relay's own floors are 1 share and $0.30; the gateway's may be higher.
async function j2Small(w: World): Promise<void> {
  const { mock } = w;
  const { sent } = await place(w, { shares: "1", price: "0.5" });
  const ok = Number(rule(mock, "order.min_size")) <= 1 && Number(rule(mock, "order.min_notional")) <= 0.5;
  assert.equal(sent.state, ok ? "accepted" : "rejected", sent.detail);
  if (!ok) assert.match(sent.detail ?? "", /below minimum/);
  assert.equal(orderPosts(mock), rule(mock, "order.prefix") === "0x00" ? 2 : 1, "a floor is not a signature rejection: no swap for it");
  assert.equal(mock.write.orders.size, ok ? 1 : 0);
}

// J3: the shortest lifetime the relay allows, 150 s.
async function j3Short(w: World): Promise<void> {
  const { mock } = w;
  const { sent } = await place(w, { ttl_s: 150 });
  const ok = Number(rule(mock, "order.gtd_min")) <= 150;
  assert.equal(sent.state, ok ? "accepted" : "rejected", sent.detail);
  if (!ok) {
    assert.match(sent.detail ?? "", /must expire at least/);
    // the lifetime check comes before the signature check: no prefix is tried twice
    assert.equal(orderPosts(mock), 1);
  }
}

// J4: cancel, whichever body the gateway takes, with one HMAC DELETE per form tried and never a batch or a cancel-all.
async function j4Cancel(w: World): Promise<void> {
  const { mock, rig } = w;
  const { hash } = await place(w);
  const cancelled = await rig.post("/v1/order/cancel", { owner: OWNER_KEY.address, order_hash: hash });
  assert.ok(cancelled.ok, JSON.stringify(cancelled));
  assert.equal(cancelled.data.state, "cancelled", cancelled.data.detail);
  assert.ok(deletes(mock).length >= 1 && deletes(mock).length <= 3);
  assert.deepEqual([...new Set(deletes(mock))], ["/order"], "a single-order DELETE only: no batch, no cancel-all, no market cancel");
  const body = rule(mock, "cancel.body");
  assert.equal(deletes(mock).length, body === "orderID-hash" ? 1 : body === "numeric-id" ? 2 : 3);
  assert.equal(mock.write.orders.get(hash)?.status, "canceled");
  const shown = await rig.get(`/v1/order/${hash}` as never);
  assert.ok(shown.ok);
  assert.equal((shown.data as { state: string }).state, "cancelled");
  // a cancel does not give the amount back: the signature outlives it
  assert.equal(rig.relay.services.ledger.list({ state: "reserved" }).length, 1);
}

// J5: a crossing FOK is held by the gateway for the taker delay; the relay is not stuck and the order fills once.
async function j5Taker(w: World): Promise<void> {
  const { mock, rig } = w;
  const prepared = await prepare(w, { tif: "FOK", price: "0.51", shares: "5" });
  const signature = await signPrepared(prepared, OWNER_KEY, acceptedForm(mock));
  const call = rig.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
  for (let i = 0; i < 600 && mock.clock.waiterCount() < 1; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 5));
  assert.ok(mock.clock.waiterCount() >= 1, "the gateway holds the request on the mock clock");
  const delay = Number(rule(mock, "engine.taker_delay"));
  let answered = false;
  void call.then(() => {
    answered = true;
  });
  await mock.advance((delay - 100) / 1000);
  await new Promise<void>((resolve) => setTimeout(resolve, 40));
  assert.equal(answered, false, `still inside the ${delay} ms hold`);
  await mock.advance(0.2);
  const result = await call;
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.data.state, "accepted", result.data.detail);
  assert.equal(orderPosts(mock), rule(mock, "order.prefix") === "0x00" ? 2 : 1);
  const shown = await rig.get(`/v1/order/${orderHashOf(prepared)}` as never);
  assert.ok(shown.ok);
  assert.equal((shown.data as { state: string }).state, "filled");
  assert.equal(rig.relay.services.ledger.list({ state: "committed" }).length, 1, "a filled order stays counted");
}

// J6: two resting BUYs, then the balance drops below what they reserve.
async function j6BalanceDrop(w: World): Promise<void> {
  const { mock, rig, trader } = w;
  const first = await place(w, { price: "0.4", shares: "10" });
  mock.clock.advanceMs(1_000);
  const second = await place(w, { price: "0.4", shares: "10" });
  assert.equal(first.sent.state, "accepted");
  assert.equal(second.sent.state, "accepted");
  // $8 reserved by the two; leave $5
  mock.state.setBalance(trader.account, { balanceMicro: 5_000_000n, allowanceMicro: 5_000_000n, cashBalanceMicro: 5_000_000n });
  const a = (await rig.get(`/v1/order/${first.hash}` as never)) as { ok: true; data: { state: string } };
  const b = (await rig.get(`/v1/order/${second.hash}` as never)) as { ok: true; data: { state: string } };
  assert.equal(a.data.state, "open", "the oldest order survives");
  assert.equal(b.data.state, rule(mock, "engine.balance_drop") === "lifo-on" ? "cancelled" : "open", "the newest is cancelled first");
  assert.equal(rig.relay.services.ledger.list({ state: "reserved" }).length, 2, "nothing is given back before the orders' expiry");
}

// J7: an account the registry does not know.
async function j7Unregistered(w: World): Promise<void> {
  const { mock } = w;
  const { sent } = await place(w);
  assert.equal(sent.state, "rejected");
  assert.match(sent.detail ?? "", /not a registered XO smart account/);
  assert.equal(mock.write.orders.size, 0);
}

// J8: the response to the POST is lost. The relay never resends, whether or not the gateway took the order, and
// the status route finds out by looking.
async function j8LostResponse(w: World): Promise<void> {
  const { mock, rig } = w;
  const prepared = await prepare(w);
  const hash = orderHashOf(prepared);
  const signature = await signPrepared(prepared, OWNER_KEY, acceptedForm(mock));
  // the fault takes the answer to the FIRST POST, which under a 0x00-only gateway is the refused 0x01 attempt
  mock.injectFault("5xx", { count: 1, listeners: ["orderbook"], when: "after" });
  const result = await rig.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.data.state, "ambiguous");
  assert.equal(orderPosts(mock), 1, "an ambiguous answer ends the attempt: no swap, no resend");
  const placed = rule(mock, "order.prefix") !== "0x00";
  assert.equal(mock.write.orders.size, placed ? 1 : 0, "whether the gateway has the order is exactly what the relay cannot know");
  const again = await rig.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature });
  assert.equal(again.ok ? "" : again.error.code, "prepared_used");
  const state = async (): Promise<{ state: string; detail?: string }> => {
    const shown = await rig.get(`/v1/order/${hash}` as never);
    assert.ok(shown.ok);
    return shown.data as { state: string; detail?: string };
  };
  const reservationId = rig.relay.services.prepared.require(prepared.prepared_id).reservationIds[0] as string;
  if (placed) {
    assert.equal((await state()).state, "open");
    assert.equal(rig.relay.services.prepared.require(prepared.prepared_id).state, "accepted");
  } else {
    assert.equal((await state()).state, "ambiguous");
    assert.equal(rig.relay.services.ledger.reservation(reservationId)?.state, "reserved");
    mock.clock.advanceMs(330_000);
    const final = await state();
    assert.equal(final.state, "rejected");
    assert.equal(final.detail, "not_placed_after_expiry");
    assert.equal(rig.relay.services.ledger.reservation(reservationId)?.state, "released");
  }
  assert.equal(orderPosts(mock), 1, "reconciling resent nothing");
}

// J10: credentials stored, but the relay has not learned this server's HMAC variant (no facts): a clean 401, once.
async function j10Unprobed(w: World): Promise<void> {
  const { mock } = w;
  const variantsMatchDefault = rule(mock, "hmac.decode") === "b64url-decoded-padded" && rule(mock, "l2.xo_address") === "ignored";
  const { sent } = await place(w);
  if (variantsMatchDefault) {
    assert.equal(sent.state, "accepted", sent.detail);
    return;
  }
  assert.equal(sent.state, "rejected", sent.detail);
  assert.match(sent.detail ?? "", /refused the relay's credentials/);
  assert.equal(orderPosts(mock), 1, "an authentication failure is never retried or swapped");
  assert.equal(mock.write.orders.size, 0);
}

type Journey = (w: World) => Promise<void>;
type WorldOptions = Parameters<typeof world>[1];

const JOURNEYS: Record<string, { run: Journey; options?: WorldOptions }> = {
  standard: { run: j1Standard },
  wrongForm: { run: j1Wrong },
  small: { run: j2Small },
  short: { run: j3Short },
  cancel: { run: j4Cancel },
  taker: { run: j5Taker },
  balanceDrop: { run: j6BalanceDrop },
  unregistered: { run: j7Unregistered, options: { register: false } },
  lostResponse: { run: j8LostResponse },
  unprobed: { run: j10Unprobed, options: { probed: false } },
};

// Which journeys say something about which switch. The two whole profiles run every journey.
const SWITCH_JOURNEYS: Record<string, readonly string[]> = {
  "order.min_size": ["standard", "small"],
  "order.min_notional": ["standard", "small"],
  "order.gtd_min": ["standard", "short"],
  "order.sig_forms": ["standard", "wrongForm"],
  "order.prefix": ["standard", "wrongForm", "lostResponse"],
  "order.dup_key_includes_sig": ["standard", "lostResponse"],
  "cancel.body": ["standard", "cancel"],
  "cancel.batch_hmac_only": ["cancel"],
  "engine.taker_delay": ["taker"],
  "engine.balance_drop": ["balanceDrop"],
  "l2.required_on_post": ["standard", "unprobed"],
  "l2.xo_address": ["standard", "unprobed"],
  "hmac.target": ["standard", "cancel"],
  "hmac.decode": ["standard", "unprobed"],
};

async function runJourney(mock: MockXo, name: string): Promise<void> {
  const journey = JOURNEYS[name];
  assert.ok(journey !== undefined, name);
  const w = await world(mock, journey.options);
  await journey.run(w);
  await invariants(w);
}

describe("both profiles: every journey", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  for (const profile of ["pessimistic", "optimistic"] as const) {
    for (const name of Object.keys(JOURNEYS)) {
      harness.it(`${profile}: ${name}`, async (mock) => {
        mock.setProfile(profile);
        await runJourney(mock, name);
      });
    }
  }
});

describe("each order switch flipped alone from the pessimistic profile", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  for (const [switchName, journeys] of Object.entries(SWITCH_JOURNEYS)) {
    const definition = MOCK_SWITCHES.find((entry) => entry.name === switchName);
    assert.ok(definition !== undefined, switchName);
    for (const value of definition.values) {
      if (value === definition.pessimistic) continue;
      for (const journey of journeys) {
        harness.it(`${switchName} = ${value}: ${journey}`, async (mock) => {
          mock.setProfile("pessimistic");
          mock.setSwitch(switchName as MockSwitchName, value as never);
          await runJourney(mock, journey);
        });
      }
    }
  }
});

describe("each order switch flipped alone from the optimistic profile (the pessimistic value, one at a time)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });
  for (const [switchName, journeys] of Object.entries(SWITCH_JOURNEYS)) {
    const definition = MOCK_SWITCHES.find((entry) => entry.name === switchName);
    assert.ok(definition !== undefined, switchName);
    for (const journey of journeys) {
      harness.it(`${switchName} = ${definition.pessimistic}: ${journey}`, async (mock) => {
        mock.setProfile("optimistic");
        mock.setSwitch(switchName as MockSwitchName, definition.pessimistic as never);
        await runJourney(mock, journey);
      });
    }
  }
});
