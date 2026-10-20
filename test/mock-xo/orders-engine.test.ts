import assert from "node:assert/strict";
import { describe } from "node:test";

import { getJson, useMock } from "./testing.js";
import { createCredentials, l2Call, marketTokens, placeOrder, setupTrader, type Credentials, type Reply, type Trader } from "./traders.js";
import type { MockXo } from "./server.js";

// The engine behind POST /order (category C of the spec: NOT a matching engine, only resting orders and a fill
// against what is displayed): the taker delay on the mock clock, FOK and FAK, fills against the book and against
// another account's resting order, the GTD sweeper, the balance-drop rule, cancels, and the order reads.

async function pair(mock: MockXo): Promise<{ a: Trader; credsA: Credentials; b: Trader; credsB: Credentials; yes: string; no: string; conditionId: string }> {
  mock.setProfile("optimistic");
  await mock.paymaster.reconcile("sponsor");
  const a = await setupTrader(mock, 2);
  const b = await setupTrader(mock, 3);
  const tokens = marketTokens(mock, "clob-active-a");
  return { a, credsA: await createCredentials(mock, a), b, credsB: await createCredentials(mock, b), yes: tokens.yes, no: tokens.no, conditionId: tokens.conditionId };
}

async function untilHeld(mock: MockXo, waiters = 1): Promise<void> {
  for (let i = 0; i < 600; i += 1) {
    if (mock.clock.waiterCount() >= waiters) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("the request was never held on the mock clock");
}

const bodyOf = <T>(reply: Reply): T => reply.body as T;
const cash = (mock: MockXo, trader: Trader): bigint => mock.state.peekAccount(trader.account)?.balanceMicro ?? 0n;
const shares = (mock: MockXo, trader: Trader, token: string): bigint => mock.state.peekAccount(trader.account)?.positions.find((row) => row.tokenId === token)?.balanceMicro ?? 0n;

describe("taker orders: held on the mock clock, then filled", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a crossing BUY is held for the taker delay; the request stays open until the clock has moved that far", async (mock) => {
    const w = await pair(mock);
    mock.setSwitch("engine.taker_delay", "3000");
    const pending = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 510, sharesMicro: 10_000_000n });
    await untilHeld(mock);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await mock.advance(2.9);
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    assert.equal(settled, false, "2.9 s into a 3 s hold");
    assert.equal(mock.write.orders.size, 0, "nothing has happened yet");
    await mock.advance(0.1);
    const { reply } = await pending;
    assert.equal(reply.status, 200, reply.text);
    const done = bodyOf<{ success: boolean; status: string; makingAmount: string; takingAmount: string }>(reply);
    assert.deepEqual({ success: done.success, status: done.status }, { success: true, status: "matched" });
    // 10 shares at the best ask 0.505: $5.05 paid, 10 shares received, no fee on this market.
    assert.equal(done.makingAmount, "5050000");
    assert.equal(done.takingAmount, "10000000");
    assert.equal(cash(mock, w.a), 100_000_000n - 5_050_000n);
    assert.equal(shares(mock, w.a, w.yes), 10_000_000n);
    const book = (await getJson(mock, "orderbook", `/book?token_id=${w.yes}`)).body as { asks: { price: string; size: string }[]; last_trade_price: string };
    assert.deepEqual(book.asks[0], { price: "0.505", size: "990" }, "the displayed level shrank");
    assert.equal(book.last_trade_price, "0.505");
  });

  harness.it("a resting order is NOT held: it answers at once with the clock where it was", async (mock) => {
    const w = await pair(mock);
    const { reply } = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n });
    assert.equal(reply.status, 200);
    assert.equal(mock.clock.waiterCount(), 0);
  });

  harness.it("the hold is engine.taker_delay: 500 ms is released by a 0.5 s advance, 3000 ms is not", async (mock) => {
    const w = await pair(mock);
    for (const [delay, expectReleased] of [["500", true], ["3000", false]] as const) {
      mock.setSwitch("engine.taker_delay", delay);
      const pending = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 520, sharesMicro: 1_000_000n, orderType: "FAK" });
      await untilHeld(mock);
      await mock.advance(0.5);
      const released = await Promise.race([pending.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 60))]);
      assert.equal(released, expectReleased, delay);
      if (!released) {
        await mock.advance(3);
        await pending;
      }
    }
  });

  harness.it("fees: the market's takerFeeBps on the collateral leg (market B has 400 bps)", async (mock) => {
    const w = await pair(mock);
    const b = marketTokens(mock, "clob-active-b");
    const pending = placeOrder(mock, w.a, w.credsA, { tokenId: b.yes, side: "BUY", tick: 999, sharesMicro: 10_000_000n, orderType: "FOK" });
    await untilHeld(mock);
    await mock.advance(1);
    const { reply } = await pending;
    const done = bodyOf<{ success: boolean; makingAmount: string }>(reply);
    assert.equal(done.success, true, reply.text);
    // Market B's yes token has mid 0.300, best ask 0.305: notional 3.05, fee 4 percent = 0.122.
    assert.equal(done.makingAmount, String(3_050_000n + 122_000n));
    assert.equal(cash(mock, w.a), 100_000_000n - 3_172_000n);
  });

  harness.it("rounding on a fill: a BUY pays the next micro-USDC up, a SELL receives the next one down", async (mock) => {
    const w = await pair(mock);
    // 1,500 micro-shares at 0.505 / 0.495 is 757.5 / 742.5 micro-USDC: not whole.
    mock.state.setBook(w.yes, { asks: [{ price: "0.505", size: "0.0015" }], bids: [{ price: "0.495", size: "0.0015" }] });
    const buy = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 510, sharesMicro: 2_000n, orderType: "FAK" });
    await untilHeld(mock);
    await mock.advance(1);
    assert.equal(bodyOf<{ takingAmount: string; makingAmount: string }>((await buy).reply).makingAmount, "758", "757.5 rounded up");
    assert.equal(cash(mock, w.a), 100_000_000n - 758n);
    assert.equal(shares(mock, w.a, w.yes), 1_500n);
    mock.state.creditShares(w.a.account, w.yes, 500n);
    const sell = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 490, sharesMicro: 2_000n, orderType: "FAK" });
    await untilHeld(mock);
    await mock.advance(1);
    assert.equal(bodyOf<{ takingAmount: string }>((await sell).reply).takingAmount, "742", "742.5 rounded down");
    assert.equal(cash(mock, w.a), 100_000_000n - 758n + 742n);
  });

  harness.it("FOK that cannot be filled completely fills nothing and answers 200 with success false", async (mock) => {
    const w = await pair(mock);
    mock.state.setBalance(w.a.account, { balanceMicro: 10_000_000_000n, allowanceMicro: 10_000_000_000n, cashBalanceMicro: 10_000_000_000n });
    // 8,000 shares are displayed up to 0.520; 9,000 at 0.520 or better is not possible.
    const pending = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 520, sharesMicro: 9_000_000_000n, orderType: "FOK" });
    await untilHeld(mock);
    await mock.advance(1);
    const { reply } = await pending;
    assert.equal(reply.status, 200);
    const done = bodyOf<{ success: boolean; status: string; errorMsg: string; orderID: string }>(reply);
    assert.deepEqual({ success: done.success, status: done.status, orderID: done.orderID }, { success: false, status: "delayed", orderID: "" });
    assert.match(done.errorMsg, /FOK/);
    assert.equal(cash(mock, w.a), 10_000_000_000n, "no money moved");
    assert.equal(mock.write.orders.size, 0);
  });

  harness.it("FAK fills what it can and drops the rest; FAK against nothing is success false", async (mock) => {
    const w = await pair(mock);
    mock.state.setBalance(w.a.account, { balanceMicro: 10_000_000_000n, allowanceMicro: 10_000_000_000n, cashBalanceMicro: 10_000_000_000n });
    // Sizes displayed at or below 0.510: 1,000 at 0.505 and 2,000 at 0.510.
    const partial = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 510, sharesMicro: 5_000_000_000n, orderType: "FAK" });
    await untilHeld(mock);
    await mock.advance(1);
    const { reply } = await partial;
    const done = bodyOf<{ success: boolean; takingAmount: string }>(reply);
    assert.equal(done.success, true, reply.text);
    assert.equal(done.takingAmount, "3000000000", "3,000 shares filled, the other 2,000 dropped");
    const order = [...mock.write.orders.values()][0];
    assert.equal(order?.status, "matched");
    assert.equal(order?.remainingMicro, 0n);
    // Nothing left at or below 0.510 any more.
    const none = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 510, sharesMicro: 1_000_000n, orderType: "FAK" });
    await untilHeld(mock);
    await mock.advance(1);
    const empty = bodyOf<{ success: boolean; errorMsg: string }>((await none).reply);
    assert.equal(empty.success, false);
    assert.match(empty.errorMsg, /FAK/);
  });

  harness.it("a crossing GTD fills what crosses and the rest rests at its own price", async (mock) => {
    const w = await pair(mock);
    mock.state.setBalance(w.a.account, { balanceMicro: 10_000_000_000n, allowanceMicro: 10_000_000_000n, cashBalanceMicro: 10_000_000_000n });
    const pending = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 505, sharesMicro: 1_500_000_000n });
    await untilHeld(mock);
    await mock.advance(1);
    const { reply } = await pending;
    const done = bodyOf<{ status: string; takingAmount: string }>(reply);
    assert.deepEqual({ status: done.status, taking: done.takingAmount }, { status: "live", taking: "1000000000" }, "1,000 shares at 0.505 filled, 500 rest");
    const order = [...mock.write.orders.values()][0];
    assert.equal(order?.status, "live");
    assert.equal(order?.remainingMicro, 500_000_000n);
    const listed = (await l2Call(mock, w.a, w.credsA, "GET", "/orders")).body as { data: { size_matched: string; original_size: string }[] };
    assert.deepEqual(listed.data.map((row) => [row.original_size, row.size_matched]), [["1500", "1000"]]);
  });
});

describe("resting orders of two accounts", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a taker fills against another account's resting order at the resting price; the maker pays no fee", async (mock) => {
    const w = await pair(mock);
    mock.state.setPositions(w.b.account, [{ tokenId: w.yes, balanceMicro: 20_000_000n, reservedMicro: 0n }]);
    // 0.502 sits between the best bid (0.495) and the best ask (0.505): it rests and is now the best ask.
    const rest = await placeOrder(mock, w.b, w.credsB, { tokenId: w.yes, side: "SELL", tick: 502, sharesMicro: 10_000_000n });
    assert.equal(rest.reply.status, 200, rest.reply.text);
    const price = (await getJson(mock, "orderbook", `/price?token_id=${w.yes}&side=SELL`)).body as { price: string };
    assert.equal(price.price, "0.502");
    const pending = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 505, sharesMicro: 6_000_000n });
    await untilHeld(mock);
    await mock.advance(1);
    const { reply } = await pending;
    assert.equal(bodyOf<{ status: string; makingAmount: string }>(reply).makingAmount, "3012000", "6 shares at the resting 0.502");
    assert.equal(cash(mock, w.a), 100_000_000n - 3_012_000n);
    assert.equal(shares(mock, w.a, w.yes), 6_000_000n);
    assert.equal(cash(mock, w.b), 100_000_000n + 3_012_000n);
    assert.equal(shares(mock, w.b, w.yes), 14_000_000n);
    assert.equal(mock.write.orders.get([...mock.write.orders.keys()][0] as string)?.fills[0]?.role, "maker", "the resting side is the maker");
    const resting = [...mock.write.orders.values()].find((order) => order.account === w.b.key);
    assert.equal(resting?.remainingMicro, 4_000_000n);
    assert.equal(resting?.status, "live");
  });

  harness.it("an account never trades against its own resting order (self-trade prevention)", async (mock) => {
    const w = await pair(mock);
    mock.state.setPositions(w.a.account, [{ tokenId: w.yes, balanceMicro: 20_000_000n, reservedMicro: 0n }]);
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 502, sharesMicro: 10_000_000n })).reply.status, 200);
    // A BUY at 0.503 would cross its own 0.502 ask but no one else's (the next ask is 0.505): it rests, no hold, no fill.
    const { reply } = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 503, sharesMicro: 6_000_000n });
    assert.equal(bodyOf<{ status: string }>(reply).status, "live");
    assert.equal(mock.clock.waiterCount(), 0);
  });
});

describe("expiry and the balance-drop rule", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("an expired GTD order stops trading at once but is swept about 10 s after the deadline", async (mock) => {
    const w = await pair(mock);
    const { reply } = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n, ttlSeconds: 100 });
    assert.equal(reply.status, 200);
    const inBook = async (): Promise<boolean> => ((await getJson(mock, "orderbook", `/book?token_id=${w.yes}`)).body as { bids: { price: string }[] }).bids.some((level) => level.price === "0.300");
    const listed = async (): Promise<number> => ((await l2Call(mock, w.a, w.credsA, "GET", "/orders")).body as { count: number }).count;
    await mock.advance(100);
    assert.equal(await inBook(), true, "expiration == now is still valid");
    await mock.advance(1);
    assert.equal(await inBook(), false, "past the deadline the order no longer trades");
    assert.equal(await listed(), 1, "but the gateway has not swept it yet");
    await mock.advance(8);
    assert.equal(await listed(), 1);
    await mock.advance(2);
    assert.equal(await listed(), 0, "swept");
    assert.equal([...mock.write.orders.values()][0]?.status, "expired");
    // The reservation is gone with it.
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${w.a.account}`)).body as { allowance: string }).allowance, "100000000");
  });

  harness.it("engine.balance_drop: lifo-on cancels the NEWEST resting BUYs until the rest fit, lifo-off leaves them", async (mock) => {
    const w = await pair(mock);
    mock.state.setBalance(w.a.account, { balanceMicro: 150_000_000n, allowanceMicro: 150_000_000n, cashBalanceMicro: 150_000_000n });
    for (const tick of [300, 310, 320]) assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick, sharesMicro: 100_000_000n })).reply.status, 200);
    // Each order reserves collateral x 1.08: 32.4, 33.48, 34.56 (the three sum to 100.44).
    const open = async (): Promise<number[]> => ((await l2Call(mock, w.a, w.credsA, "GET", "/orders")).body as { data: { id: number }[] }).data.map((row) => row.id);
    assert.deepEqual(await open(), [100001, 100002, 100003]);

    mock.setSwitch("engine.balance_drop", "lifo-off");
    mock.state.setBalance(w.a.account, { balanceMicro: 60_000_000n });
    assert.deepEqual(await open(), [100001, 100002, 100003], "lifo-off: nothing is cancelled");

    mock.setSwitch("engine.balance_drop", "lifo-on");
    mock.state.setBalance(w.a.account, { balanceMicro: 70_000_000n });
    assert.deepEqual(await open(), [100001, 100002, 100003], "a balance that RISES is not a drop, even if the orders still do not fit");
    mock.state.setBalance(w.a.account, { balanceMicro: 59_000_000n });
    assert.deepEqual(await open(), [100001], "lifo-on: 32.4 fits in 59, 32.4 + 33.48 does not, so the two newest go");
    assert.equal(mock.write.orders.get([...mock.write.orders.keys()][2] as string)?.cancelReason, "balance_drop");
    // A balance that RISES cancels nothing.
    mock.state.setBalance(w.a.account, { balanceMicro: 500_000_000n });
    assert.deepEqual(await open(), [100001]);
  });
});

describe("cancels and the order reads", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("DELETE /order: its owner cancels a live order, nobody else does, a filled or unknown one is reported", async (mock) => {
    const w = await pair(mock);
    const mine = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n });
    const hash = mine.built.hash;
    const del = (trader: Trader, creds: Credentials, orderID: string) => l2Call(mock, trader, creds, "DELETE", "/order", { orderID });
    const foreign = await del(w.b, w.credsB, hash);
    assert.deepEqual(foreign.body, { canceled: [], notCanceled: { [hash]: "not owner" } });
    assert.equal([...mock.write.orders.values()][0]?.status, "live");
    const unknown = `0x${"ab".repeat(32)}`;
    assert.deepEqual((await del(w.a, w.credsA, unknown)).body, { canceled: [], notCanceled: { [unknown]: "not found" } });
    assert.deepEqual((await del(w.a, w.credsA, hash)).body, { canceled: ["100001"], notCanceled: {} });
    assert.deepEqual((await del(w.a, w.credsA, hash)).body, { canceled: [], notCanceled: { [hash]: "not found" } }, "already cancelled");
    // A filled order.
    const taker = placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 510, sharesMicro: 1_000_000n });
    await untilHeld(mock);
    await mock.advance(1);
    const filled = (await taker).built.hash;
    assert.deepEqual((await del(w.a, w.credsA, filled)).body, { canceled: [], notCanceled: { [filled]: "already filled" } });
    // The cancelled order frees its reservation and its book level.
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${w.a.account}`)).body as { allowance: string }).allowance, String(100_000_000n - 505_000n));
  });

  harness.it("cancel.body: each mode accepts exactly one key and id form; the others are 400 or 'not found', and nothing is cancelled", async (mock) => {
    const w = await pair(mock);
    const forms: Record<string, { key: string; id: (hash: string) => string }> = {
      "orderID-hash": { key: "orderID", id: (hash) => hash },
      orderId: { key: "orderId", id: (hash) => hash },
      "numeric-id": { key: "orderID", id: () => "100001" },
    };
    const results: Record<string, string[]> = {};
    for (const mode of Object.keys(forms)) {
      mock.setSwitch("cancel.body", mode as "orderId");
      const placed = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n, salt: BigInt(mock.write.orders.size) + 50n });
      const live = [...mock.write.orders.values()].find((order) => order.hash === placed.built.hash);
      assert.equal(live?.status, "live");
      results[mode] = [];
      for (const [tryMode, form] of Object.entries(forms)) {
        const id = tryMode === "numeric-id" ? String(live?.id) : placed.built.hash;
        const reply = await l2Call(mock, w.a, w.credsA, "DELETE", "/order", { [form.key]: id });
        const cancelled = reply.status === 200 && (reply.body as { canceled: string[] }).canceled.length === 1;
        results[mode]?.push(`${tryMode}:${reply.status}:${cancelled ? "cancelled" : "no"}`);
        if (cancelled) break;
      }
    }
    // Only the matching form cancels in each mode; the wrong ones fail first (400 for a wrong key, 200 not found for a wrong id).
    assert.deepEqual(results["orderID-hash"], ["orderID-hash:200:cancelled"]);
    assert.deepEqual(results["orderId"], ["orderID-hash:400:no", "orderId:200:cancelled"]);
    assert.deepEqual(results["numeric-id"], ["orderID-hash:200:no", "orderId:400:no", "numeric-id:200:cancelled"]);
  });

  harness.it("cancel.batch_hmac_only: DELETE /orders, /cancel-all and /cancel-market-orders work with an HMAC alone, or answer 400 asking for a signature", async (mock) => {
    const w = await pair(mock);
    const other = marketTokens(mock, "clob-active-b");
    for (const [tick, token] of [[300, w.yes], [310, w.yes], [250, other.yes]] as const) await placeOrder(mock, w.a, w.credsA, { tokenId: token, side: "BUY", tick, sharesMicro: 10_000_000n });
    const live = (): number => [...mock.write.orders.values()].filter((order) => order.status === "live").length;
    assert.equal(live(), 3);

    mock.setSwitch("cancel.batch_hmac_only", "no");
    const refused = [
      await l2Call(mock, w.a, w.credsA, "DELETE", "/orders", [[...mock.write.orders.keys()][0]]),
      await l2Call(mock, w.a, w.credsA, "DELETE", "/cancel-all"),
      await l2Call(mock, w.a, w.credsA, "DELETE", "/cancel-market-orders", { market: w.conditionId }),
    ];
    for (const reply of refused) {
      assert.equal(reply.status, 400);
      assert.deepEqual(reply.body, { error: "signature and signatureType are required" });
    }
    assert.equal(live(), 3, "nothing was cancelled");

    mock.setSwitch("cancel.batch_hmac_only", "yes");
    const [first] = [...mock.write.orders.keys()];
    assert.deepEqual((await l2Call(mock, w.a, w.credsA, "DELETE", "/orders", [first])).body, { canceled: ["100001"], notCanceled: {} });
    const market = await l2Call(mock, w.a, w.credsA, "DELETE", "/cancel-market-orders", { market: w.conditionId });
    assert.deepEqual((market.body as { canceled: string[] }).canceled, ["100002"], "only the order of that market");
    assert.equal(live(), 1);
    const all = await l2Call(mock, w.a, w.credsA, "DELETE", "/cancel-all");
    assert.deepEqual((all.body as { canceled: string[] }).canceled, ["100003"]);
    assert.equal(live(), 0);
    assert.equal((await l2Call(mock, w.a, w.credsA, "DELETE", "/cancel-market-orders", {})).status, 400);
    assert.equal((await l2Call(mock, w.a, w.credsA, "DELETE", "/orders", { nope: 1 })).status, 400);
  });

  harness.it("GET /orders filters by market and asset, pages with a cursor that ends in LTE=, and GET /orders/:id finds an order by hash or numeric id", async (mock) => {
    const w = await pair(mock);
    const other = marketTokens(mock, "clob-active-b");
    const placed = [];
    for (const [tick, token] of [[300, w.yes], [310, w.yes], [320, w.no], [250, other.yes]] as const) {
      placed.push(await placeOrder(mock, w.a, w.credsA, { tokenId: token, side: "BUY", tick, sharesMicro: 10_000_000n }));
    }
    const list = async (query: string) => (await l2Call(mock, w.a, w.credsA, "GET", `/orders${query}`)).body as { count: number; next_cursor: string; data: { id: number }[] };
    assert.equal((await list("")).count, 4);
    assert.deepEqual((await list(`?market=${w.conditionId}`)).data.map((row) => row.id), [100001, 100002, 100003]);
    assert.deepEqual((await list(`?asset_id=${w.no}`)).data.map((row) => row.id), [100003]);
    const first = await list("?limit=3");
    assert.equal(first.count, 3);
    assert.notEqual(first.next_cursor, "LTE=");
    const second = await list(`?limit=3&next_cursor=${encodeURIComponent(first.next_cursor)}`);
    assert.deepEqual(second.data.map((row) => row.id), [100004]);
    assert.equal(second.next_cursor, "LTE=");
    // One order by hash and by numeric id; another account's order is 404.
    const byHash = await l2Call(mock, w.a, w.credsA, "GET", `/orders/${placed[0]?.built.hash}`);
    assert.equal((byHash.body as { id: number }).id, 100001);
    assert.equal((await l2Call(mock, w.a, w.credsA, "GET", "/orders/100002")).status, 200);
    assert.equal((await l2Call(mock, w.b, w.credsB, "GET", "/orders/100002")).status, 404);
    assert.equal((await l2Call(mock, w.a, w.credsA, "GET", "/orders/999")).status, 404);
    // Another account sees none of these.
    assert.equal(((await l2Call(mock, w.b, w.credsB, "GET", "/orders")).body as { count: number }).count, 0);
  });

  harness.it("a market that becomes terminal cancels its resting orders (the creation flow's CANCELLED does)", async (mock) => {
    const w = await pair(mock);
    await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n });
    assert.equal(mock.engine.cancelMarket(w.conditionId, "market_cancelled"), 1);
    assert.equal(((await l2Call(mock, w.a, w.credsA, "GET", "/orders")).body as { count: number }).count, 0);
  });
});
