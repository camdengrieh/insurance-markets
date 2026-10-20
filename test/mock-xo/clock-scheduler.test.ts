import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMockClock, MOCK_EPOCH_SECONDS } from "./clock.js";
import { Scheduler } from "./scheduler.js";

// The write mock's notion of "later": handlers wait on the mock clock, and tasks run in time order when a test moves it.

describe("the mock clock can make a request wait", () => {
  it("sleepMs resolves true exactly when the clock has moved that far, never before, and never on its own", async () => {
    const clock = createMockClock();
    let resolved = false;
    const waiting = clock.sleepMs(500).then((elapsed) => {
      resolved = elapsed;
      return elapsed;
    });
    assert.equal(clock.waiterCount(), 1);
    clock.advanceMs(499);
    await Promise.resolve();
    assert.equal(resolved, false);
    clock.advanceMs(1);
    assert.equal(await waiting, true);
    assert.equal(clock.waiterCount(), 0);
  });

  it("waiters are released in whatever order the clock passes them, and sleepMs(0) is immediate", async () => {
    const clock = createMockClock();
    const order: number[] = [];
    const a = clock.sleepMs(3000).then(() => order.push(3000));
    const b = clock.sleepMs(500).then(() => order.push(500));
    assert.equal(await clock.sleepMs(0), true);
    clock.advance(1);
    await b;
    assert.deepEqual(order, [500]);
    clock.advance(5);
    await a;
    assert.deepEqual(order, [500, 3000]);
  });

  it("cancelWaiters releases every waiter with false, so a handler left over from one test cannot act in the next", async () => {
    const clock = createMockClock();
    const waiting = [clock.sleepMs(100), clock.sleepMs(10_000)];
    clock.cancelWaiters();
    assert.deepEqual(await Promise.all(waiting), [false, false]);
    assert.equal(clock.waiterCount(), 0);
    clock.advance(20);
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS + 20);
  });

  it("the clock only moves forward and rejects bad input", async () => {
    const clock = createMockClock();
    assert.throws(() => clock.set(clock.nowMs() - 1), RangeError);
    assert.throws(() => clock.advance(-1), RangeError);
    assert.throws(() => clock.advanceMs(1.5), RangeError);
    await assert.rejects(clock.sleepMs(Number.NaN), RangeError);
    await assert.rejects(clock.sleepMs(-5), RangeError);
  });
});

describe("the scheduler runs tasks in time order, each at its own moment", () => {
  function setup() {
    const clock = createMockClock();
    const synced: number[] = [];
    const scheduler = new Scheduler(clock, async (seconds) => {
      synced.push(seconds);
    });
    return { clock, scheduler, synced };
  }

  it("runs what falls due inside the window in due-time order (ties in insertion order), with the clock at each task's time", async () => {
    const { clock, scheduler } = setup();
    const start = clock.nowMs();
    const ran: string[] = [];
    scheduler.at(start + 20_000, "c", () => void ran.push(`c@${String((clock.nowMs() - start) / 1000)}`));
    scheduler.at(start + 5_000, "a", () => void ran.push(`a@${String((clock.nowMs() - start) / 1000)}`));
    scheduler.at(start + 5_000, "b", () => void ran.push(`b@${String((clock.nowMs() - start) / 1000)}`));
    scheduler.at(start + 90_000, "late", () => void ran.push("late"));
    await scheduler.advance(30);
    assert.deepEqual(ran, ["a@5", "b@5", "c@20"]);
    assert.equal(clock.nowMs(), start + 30_000);
    assert.equal(scheduler.pending().length, 1);
    await scheduler.advance(60);
    assert.deepEqual(ran.slice(-1), ["late"]);
  });

  it("brings the chains' time up to each task before it runs, and again at the end", async () => {
    const { clock, scheduler, synced } = setup();
    const start = clock.nowSeconds();
    scheduler.after(10_000, "x", () => undefined);
    await scheduler.advance(25);
    assert.deepEqual(synced, [start + 10, start + 25]);
  });

  it("a task may schedule another that is due inside the same advance", async () => {
    const { clock, scheduler } = setup();
    const ran: number[] = [];
    scheduler.after(5_000, "first", () => {
      ran.push(1);
      scheduler.after(5_000, "second", () => void ran.push(2));
      scheduler.after(60_000, "third", () => void ran.push(3));
    });
    await scheduler.advance(12);
    assert.deepEqual(ran, [1, 2]);
    assert.equal(scheduler.pending().length, 1);
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS + 12);
  });

  it("a failing task stops the advance and the error reaches the caller; later advances still work", async () => {
    const { scheduler } = setup();
    const ran: string[] = [];
    scheduler.after(1_000, "boom", () => {
      throw new Error("a bug in the mock");
    });
    scheduler.after(2_000, "after the bug", () => void ran.push("ran"));
    await assert.rejects(scheduler.advance(5), /a bug in the mock/);
    await scheduler.advance(5);
    assert.deepEqual(ran, ["ran"]);
  });

  it("two advances at once do not interleave; cancel and clear remove tasks; nothing is due in the past", async () => {
    const { clock, scheduler } = setup();
    const ran: string[] = [];
    const id = scheduler.after(1_000, "cancelled", () => void ran.push("cancelled"));
    assert.equal(scheduler.cancel(id), true);
    assert.equal(scheduler.cancel(id), false);
    scheduler.after(1_000, "x", () => void ran.push("x"));
    scheduler.after(-5_000, "overdue", () => void ran.push("overdue"));
    await Promise.all([scheduler.advance(2), scheduler.advance(2)]);
    assert.deepEqual(ran, ["overdue", "x"]);
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS + 4);
    scheduler.after(1_000, "y", () => void ran.push("y"));
    scheduler.clear();
    await scheduler.advance(10);
    assert.deepEqual(ran, ["overdue", "x"]);
    await assert.rejects(scheduler.advance(-1), RangeError);
  });
});
