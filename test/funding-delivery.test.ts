import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import { DELIVERY_POLL_TIMEOUT_S, DISPATCH_ID_TOPIC, type Address, type Hex } from "../src/xo/chain/constants.js";
import {
  DELIVERY_STATES,
  DELIVERY_TIMEOUT_S,
  SENT_TRANSFER_REMOTE_TOPIC,
  TERMINAL_DELIVERY_STATES,
  checkDelivery,
  classifyDelivery,
  extractFundingDispatch,
  pollDelivery,
  recommendedPollDelayS,
  type DeliveryObservation,
  type DeliveryReader,
  type DeliveryState,
} from "../src/xo/funding/delivery.js";
import type { BaseReceipt } from "../src/xo/funding/preflight.js";
import { ACCOUNT, ACCOUNT_B, FakeBase, MESSAGE_ID, TX_HASH, USDC, baseRpcOver, putReceipt, type ReceiptOptions } from "./funding-helpers.js";

const A = USDC;
const NOW_S = 1_900_000_000;

function castTopic(signature: string): string | undefined {
  try {
    return execFileSync("cast", ["sig-event", signature], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}
const CAST_PRESENT = castTopic("DispatchId(bytes32)") !== undefined;

async function receiptFor(options: ReceiptOptions = {}): Promise<BaseReceipt> {
  const base = new FakeBase();
  putReceipt(base, options);
  const receipt = await baseRpcOver(base).getTransactionReceipt(options.txHash ?? TX_HASH);
  assert.ok(receipt);
  return receipt;
}

describe("topics", () => {
  it("SentTransferRemote and DispatchId are the recorded hashes", () => {
    assert.equal(SENT_TRANSFER_REMOTE_TOPIC, "0xd229aacb94204188fe8042965fa6b269c62dc5818b21238779ab64bdd17efeec");
    assert.equal(DISPATCH_ID_TOPIC, "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a");
  });

  it("match a fresh cast run", { skip: CAST_PRESENT ? false : "foundry cast is not on PATH; the pinned hashes above still run" }, () => {
    assert.equal(castTopic("SentTransferRemote(uint32,bytes32,uint256)"), SENT_TRANSFER_REMOTE_TOPIC);
    assert.equal(castTopic("DispatchId(bytes32)"), DISPATCH_ID_TOPIC);
  });

  it("uses the 10 minute timeout and lists every state once", () => {
    assert.equal(DELIVERY_TIMEOUT_S, 600);
    assert.equal(DELIVERY_POLL_TIMEOUT_S, 600);
    assert.equal(new Set(DELIVERY_STATES).size, DELIVERY_STATES.length);
    for (const state of ["dispatched", "delivered", "credited", "dispatched_not_delivered", "delivered_not_credited"] as const) {
      assert.ok(DELIVERY_STATES.includes(state), state);
    }
  });
});

describe("extractFundingDispatch", () => {
  it("returns the message id of the one matching transfer", async () => {
    const extracted = extractFundingDispatch(await receiptFor({ block: 1234n }), { account: ACCOUNT, amount: A });
    assert.deepEqual(extracted, { ok: true, messageId: MESSAGE_ID, blockNumber: 1234n });
  });

  it("refuses a reverted transaction", async () => {
    assert.deepEqual(extractFundingDispatch(await receiptFor({ status: 0 }), { account: ACCOUNT, amount: A }), { ok: false, reason: "reverted" });
  });

  it("refuses a transfer for another account, another amount or another domain", async () => {
    const expect = { account: ACCOUNT, amount: A };
    assert.deepEqual(extractFundingDispatch(await receiptFor({ account: ACCOUNT_B }), expect), { ok: false, reason: "no_matching_transfer" });
    assert.deepEqual(extractFundingDispatch(await receiptFor({ amount: A + 1n }), expect), { ok: false, reason: "no_matching_transfer" });
    assert.deepEqual(extractFundingDispatch(await receiptFor({ destination: 1 }), expect), { ok: false, reason: "no_matching_transfer" });
  });

  it("ignores logs that another contract emitted with the right shape", async () => {
    const forged: Address = ACCOUNT_B;
    assert.deepEqual(extractFundingDispatch(await receiptFor({ router: forged }), { account: ACCOUNT, amount: A }), { ok: false, reason: "no_matching_transfer" });
    assert.deepEqual(extractFundingDispatch(await receiptFor({ mailbox: forged }), { account: ACCOUNT, amount: A }), { ok: false, reason: "no_dispatch_id" });
  });

  it("refuses a receipt without a transfer log or without a dispatch id", async () => {
    assert.deepEqual(extractFundingDispatch(await receiptFor({ omitTransfer: true }), { account: ACCOUNT, amount: A }), { ok: false, reason: "no_matching_transfer" });
    assert.deepEqual(extractFundingDispatch(await receiptFor({ omitDispatch: true }), { account: ACCOUNT, amount: A }), { ok: false, reason: "no_dispatch_id" });
  });

  it("refuses ambiguity: two matching transfers, or two dispatches in one transaction", async () => {
    const one = await receiptFor();
    const doubledTransfer: BaseReceipt = { ...one, logs: [...one.logs, one.logs[0] as BaseReceipt["logs"][number]] };
    assert.deepEqual(extractFundingDispatch(doubledTransfer, { account: ACCOUNT, amount: A }), { ok: false, reason: "ambiguous_transfer" });
    const doubledDispatch: BaseReceipt = { ...one, logs: [...one.logs, one.logs[1] as BaseReceipt["logs"][number]] };
    assert.deepEqual(extractFundingDispatch(doubledDispatch, { account: ACCOUNT, amount: A }), { ok: false, reason: "ambiguous_dispatch" });
  });
});

// One row per look at a funding. `age` is seconds since the Base block of the dispatch.
interface Look {
  readonly age: number;
  readonly delivered: boolean | null;
  readonly now: bigint | null;
  readonly before: bigint | null;
  readonly state: DeliveryState;
  readonly credit: "yes" | "no" | "unknown";
}

const obs = (look: Look): DeliveryObservation => ({ ageS: look.age, delivered: look.delivered, amount: A, xoBalance: look.now, xoBalanceBefore: look.before });

describe("classifyDelivery over recorded timelines", () => {
  // The sampled Base-to-XO latency: median 14 s, p90 24 s, max 27 s (docs/research/20 section 6.2).
  const timeline: readonly Look[] = [
    { age: 0, delivered: false, now: 5n, before: 5n, state: "dispatched", credit: "no" },
    { age: 8, delivered: null, now: 5n, before: 5n, state: "dispatched", credit: "no" },
    { age: 14, delivered: false, now: 5n, before: 5n, state: "dispatched", credit: "no" },
    { age: 15, delivered: true, now: 5n, before: 5n, state: "delivered", credit: "no" },
    { age: 24, delivered: true, now: 5n, before: 5n, state: "delivered", credit: "no" },
    { age: 27, delivered: true, now: 5n + A, before: 5n, state: "credited", credit: "yes" },
    { age: 599, delivered: true, now: 5n, before: 5n, state: "delivered", credit: "no" },
    { age: 600, delivered: true, now: 5n, before: 5n, state: "delivered_not_credited", credit: "no" },
    { age: 601, delivered: true, now: 5n + A - 1n, before: 5n, state: "delivered_not_credited", credit: "no" },
    { age: 600, delivered: true, now: 5n + A, before: 5n, state: "credited", credit: "yes" },
    { age: 599, delivered: false, now: 5n, before: 5n, state: "dispatched", credit: "no" },
    { age: 600, delivered: false, now: 5n, before: 5n, state: "dispatched_not_delivered", credit: "no" },
    { age: 4000, delivered: null, now: null, before: 5n, state: "dispatched_not_delivered", credit: "unknown" },
    // No baseline: the credit can never be judged, so "delivered" never becomes "delivered_not_credited".
    { age: 5, delivered: true, now: 99n, before: null, state: "delivered", credit: "unknown" },
    { age: 5000, delivered: true, now: 0n, before: null, state: "delivered", credit: "unknown" },
    { age: 5000, delivered: true, now: null, before: 5n, state: "delivered", credit: "unknown" },
    // A rise while the message is known NOT to be delivered is somebody else's money.
    { age: 30, delivered: false, now: 5n + A, before: 5n, state: "dispatched", credit: "yes" },
    { age: 700, delivered: false, now: 5n + A, before: 5n, state: "dispatched_not_delivered", credit: "yes" },
    // A rise with an unreadable delivery flag is the best evidence there is.
    { age: 30, delivered: null, now: 5n + A + 1n, before: 5n, state: "credited", credit: "yes" },
  ];

  it("gives the recorded state for every look", () => {
    for (const look of timeline) {
      const decision = classifyDelivery(obs(look));
      assert.equal(decision.state, look.state, JSON.stringify({ ...look, now: String(look.now), before: String(look.before) }));
      assert.equal(decision.credit, look.credit);
      assert.equal(decision.timedOut, look.age >= 600);
    }
  });

  it("is final exactly when the state is final", () => {
    for (const look of timeline) {
      const decision = classifyDelivery(obs(look));
      assert.equal(decision.nextCheckInS === null, TERMINAL_DELIVERY_STATES.has(decision.state), decision.state);
    }
  });

  it("treats a negative, NaN or infinite age as zero and never times out because of it", () => {
    for (const age of [-5, Number.NaN, -Infinity, Infinity]) {
      assert.equal(classifyDelivery(obs({ age, delivered: false, now: 0n, before: 0n, state: "dispatched", credit: "no" })).state, "dispatched");
    }
  });

  it("honours a shorter or longer timeout", () => {
    const base = { ageS: 120, delivered: false, amount: A, xoBalance: null, xoBalanceBefore: null } as const;
    assert.equal(classifyDelivery({ ...base, timeoutS: 100 }).state, "dispatched_not_delivered");
    assert.equal(classifyDelivery({ ...base, timeoutS: 1000 }).state, "dispatched");
  });

  it("never says the transfer should be sent again", () => {
    for (const look of timeline) {
      const { message } = classifyDelivery(obs(look));
      assert.doesNotMatch(message, /\b(?:resend|send it again|retry the transfer|try again)\b/i, message);
    }
    for (const look of timeline.filter((entry) => entry.state === "dispatched_not_delivered" || entry.state === "delivered_not_credited")) {
      assert.match(classifyDelivery(obs(look)).message, /do not send again/i);
    }
  });

  it("recommends looking soon at first and rarely later, never beyond the deadline", () => {
    assert.equal(recommendedPollDelayS(0), 15);
    assert.equal(recommendedPollDelayS(59), 15);
    assert.equal(recommendedPollDelayS(60), 30);
    assert.equal(recommendedPollDelayS(299), 30);
    assert.equal(recommendedPollDelayS(300), 60);
    assert.equal(recommendedPollDelayS(590), 10);
    assert.equal(recommendedPollDelayS(599), 1);
    assert.ok(recommendedPollDelayS(900) >= 1);
  });
});

// A reader whose answers depend on the age of the dispatch, driven by a settable clock.
class ScriptedReader implements DeliveryReader {
  nowMs = NOW_S * 1000;
  dispatchedAtS: number | null = NOW_S;
  receipt: BaseReceipt | null = null;
  deliveredAfterS: number | null = null;
  creditedAfterS: number | null = null;
  balanceBefore = 5n;
  throwOn = new Set<string>();
  readonly calls: string[] = [];

  ageS(): number {
    return this.nowMs / 1000 - (this.dispatchedAtS ?? NOW_S);
  }

  async getReceipt(): Promise<BaseReceipt | null> {
    this.calls.push("getReceipt");
    if (this.throwOn.has("getReceipt")) throw new Error("down");
    return this.receipt;
  }

  async getBlockTimestamp(): Promise<bigint | null> {
    this.calls.push("getBlockTimestamp");
    if (this.throwOn.has("getBlockTimestamp")) throw new Error("down");
    return this.dispatchedAtS === null ? null : BigInt(this.dispatchedAtS);
  }

  async isDelivered(): Promise<boolean | null> {
    this.calls.push("isDelivered");
    if (this.throwOn.has("isDelivered")) throw new Error("down");
    if (this.deliveredAfterS === null) return null;
    return this.ageS() >= this.deliveredAfterS ? true : null;
  }

  async getXoBalance(): Promise<bigint | null> {
    this.calls.push("getXoBalance");
    if (this.throwOn.has("getXoBalance")) throw new Error("down");
    return this.creditedAfterS !== null && this.ageS() >= this.creditedAfterS ? this.balanceBefore + A : this.balanceBefore;
  }
}

async function scripted(options: ReceiptOptions = {}): Promise<ScriptedReader> {
  const reader = new ScriptedReader();
  reader.receipt = await receiptFor(options);
  return reader;
}

const request = { txHash: TX_HASH as Hex, account: ACCOUNT, amount: A, xoBalanceBefore: 5n as bigint | null };
const deps = (reader: ScriptedReader) => ({ reader, nowMs: () => reader.nowMs });

describe("checkDelivery", () => {
  it("is not_found while the receipt is missing, and says nothing about the transfer", async () => {
    const reader = await scripted();
    reader.receipt = null;
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "not_found");
    assert.equal(report.terminal, false);
    assert.equal(report.nextCheckInS, 15);
    assert.deepEqual(reader.calls, ["getReceipt"]);
  });

  it("is not_found, with a note, when the receipt cannot be read", async () => {
    const reader = await scripted();
    reader.throwOn.add("getReceipt");
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "not_found");
    assert.deepEqual(report.notes, ["receipt:unreadable"]);
  });

  it("is base_failed (final) for a reverted transaction", async () => {
    const reader = await scripted({ status: 0 });
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "base_failed");
    assert.equal(report.terminal, true);
    assert.equal(report.nextCheckInS, null);
  });

  it("is unrecognised (final) for a transaction that is not this funding", async () => {
    for (const options of [{ account: ACCOUNT_B }, { amount: A + 1n }, { omitDispatch: true }, { router: ACCOUNT_B }] as ReceiptOptions[]) {
      const reader = await scripted(options);
      const report = await checkDelivery(deps(reader), request);
      assert.equal(report.state, "unrecognised");
      assert.equal(report.terminal, true);
      assert.equal(report.messageId, null);
      assert.equal(reader.calls.includes("isDelivered"), false, "nothing is read about a transaction that is not ours");
    }
  });

  it("follows a transfer from dispatched through delivered to credited", async () => {
    const reader = await scripted();
    reader.deliveredAfterS = 14;
    reader.creditedAfterS = 20;
    const looks: [number, DeliveryState][] = [[0, "dispatched"], [13, "dispatched"], [14, "delivered"], [19, "delivered"], [20, "credited"], [500, "credited"]];
    for (const [age, state] of looks) {
      reader.nowMs = (NOW_S + age) * 1000;
      const report = await checkDelivery(deps(reader), request);
      assert.equal(report.state, state, `age ${age}`);
      assert.equal(report.ageS, age);
      assert.equal(report.messageId, MESSAGE_ID);
      assert.equal(report.resend, "never");
    }
  });

  it("reports dispatched_not_delivered after ten minutes without delivery, and never anything about resending", async () => {
    const reader = await scripted();
    reader.nowMs = (NOW_S + 600) * 1000;
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "dispatched_not_delivered");
    assert.equal(report.terminal, true);
    assert.equal(report.resend, "never");
    assert.match(report.message, /do not send again/i);
  });

  it("reports delivered_not_credited after ten minutes when delivered and the balance did not rise", async () => {
    const reader = await scripted();
    reader.deliveredAfterS = 14;
    reader.nowMs = (NOW_S + 601) * 1000;
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "delivered_not_credited");
    assert.equal(report.credit, "no");
    assert.equal(report.terminal, true);
  });

  it("does not claim a missing credit without a baseline", async () => {
    const reader = await scripted();
    reader.deliveredAfterS = 14;
    reader.nowMs = (NOW_S + 5000) * 1000;
    const report = await checkDelivery(deps(reader), { ...request, xoBalanceBefore: null });
    assert.equal(report.state, "delivered");
    assert.equal(report.credit, "unknown");
  });

  it("keeps going, with notes, when the XO side cannot be read", async () => {
    const reader = await scripted();
    reader.throwOn.add("isDelivered");
    reader.throwOn.add("getXoBalance");
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "dispatched");
    assert.deepEqual([...report.notes].sort(), ["isDelivered:unreadable", "xoBalance:unreadable"]);
    assert.equal(report.delivered, null);
    assert.equal(report.xoBalance, null);
  });

  it("applies no timeout when the age of the dispatch is unknown", async () => {
    const reader = await scripted();
    reader.dispatchedAtS = null;
    reader.nowMs = (NOW_S + 100_000) * 1000;
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.state, "dispatched");
    assert.equal(report.ageS, null);
    assert.ok(report.notes.includes("blockTimestamp:unavailable"));
    assert.match(report.message, /age of the dispatch is unknown/);
  });

  it("treats a chain clock ahead of ours as age zero", async () => {
    const reader = await scripted();
    reader.dispatchedAtS = NOW_S + 30;
    const report = await checkDelivery(deps(reader), request);
    assert.equal(report.ageS, 0);
    assert.equal(report.state, "dispatched");
  });

  it("starts the block-time, delivery and balance reads together rather than one after another", async () => {
    const reader = await scripted();
    const started: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    reader.getBlockTimestamp = async () => {
      started.push("blockTimestamp");
      await gate;
      return BigInt(NOW_S);
    };
    reader.isDelivered = async () => {
      started.push("isDelivered");
      await gate;
      return null;
    };
    reader.getXoBalance = async () => {
      started.push("xoBalance");
      await gate;
      return 5n;
    };
    const pending = checkDelivery(deps(reader), request);
    for (let i = 0; i < 20 && started.length < 3; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual([...started].sort(), ["blockTimestamp", "isDelivered", "xoBalance"], "all three reads were in flight before any finished");
    release();
    assert.equal((await pending).state, "dispatched");
  });

  it("returns resend: never in every state it can produce", async () => {
    const seen = new Set<DeliveryState>();
    const variants: (() => Promise<ScriptedReader>)[] = [
      async () => { const r = await scripted(); r.receipt = null; return r; },
      async () => scripted({ status: 0 }),
      async () => scripted({ omitDispatch: true }),
      async () => scripted(),
      async () => { const r = await scripted(); r.deliveredAfterS = 0; return r; },
      async () => { const r = await scripted(); r.deliveredAfterS = 0; r.creditedAfterS = 0; return r; },
      async () => { const r = await scripted(); r.nowMs = (NOW_S + 700) * 1000; return r; },
      async () => { const r = await scripted(); r.deliveredAfterS = 0; r.nowMs = (NOW_S + 700) * 1000; return r; },
    ];
    for (const make of variants) {
      const report = await checkDelivery(deps(await make()), request);
      assert.equal(report.resend, "never");
      seen.add(report.state);
    }
    assert.deepEqual([...seen].sort(), [...DELIVERY_STATES].sort());
  });
});

describe("pollDelivery", () => {
  function clock(reader: ScriptedReader) {
    const sleeps: number[] = [];
    return {
      sleeps,
      deps: {
        reader,
        nowMs: () => reader.nowMs,
        sleep: async (ms: number) => {
          sleeps.push(ms);
          reader.nowMs += ms;
        },
      },
    };
  }

  it("polls until the credit shows, sleeping the recommended delays", async () => {
    const reader = await scripted();
    reader.deliveredAfterS = 14;
    reader.creditedAfterS = 40;
    const { deps: pollDeps, sleeps } = clock(reader);
    const result = await pollDelivery(pollDeps, request);
    assert.equal(result.state, "credited");
    assert.ok(result.polls >= 3 && result.polls <= 6, String(result.polls));
    assert.ok(sleeps.every((ms) => ms >= 1000 && ms <= 60_000), sleeps.join(","));
    assert.equal(result.resend, "never");
  });

  it("gives up at ten minutes with dispatched_not_delivered and a bounded number of polls", async () => {
    const reader = await scripted();
    const { deps: pollDeps, sleeps } = clock(reader);
    const result = await pollDelivery(pollDeps, request);
    assert.equal(result.state, "dispatched_not_delivered");
    assert.ok(result.polls <= 20, String(result.polls));
    const slept = sleeps.reduce((sum, ms) => sum + ms, 0);
    assert.ok(slept >= 590_000 && slept <= 610_000, String(slept));
  });

  it("stops at once for a final state without sleeping", async () => {
    const reader = await scripted({ status: 0 });
    const { deps: pollDeps, sleeps } = clock(reader);
    const result = await pollDelivery(pollDeps, request);
    assert.equal(result.state, "base_failed");
    assert.equal(result.polls, 1);
    assert.deepEqual(sleeps, []);
  });

  it("stops at its own time limit even if the dispatch is younger", async () => {
    const reader = await scripted();
    const { deps: pollDeps } = clock(reader);
    const result = await pollDelivery(pollDeps, request, { timeoutS: 60 });
    assert.equal(result.state, "dispatched");
    assert.ok(result.polls >= 2);
  });

  it("honours the poll limit", async () => {
    const reader = await scripted();
    reader.receipt = null;
    const { deps: pollDeps } = clock(reader);
    const result = await pollDelivery(pollDeps, request, { maxPolls: 3, timeoutS: 100_000 });
    assert.equal(result.polls, 3);
    assert.equal(result.state, "not_found");
  });
});
