import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress } from "viem";

import { USDC_E_ADDRESS, XO_ORACLE, type Address, type Hex } from "../src/xo/chain/constants.js";
import {
  acceptAdvice,
  advanceClock,
  applyEvent,
  decodeCreationLog,
  nextPoll,
  replayEvents,
  startTracking,
  windowKind,
  type CreationEvent,
  type ReviewPhase,
  type ReviewState,
} from "../src/xo/creation/review.js";
import { createdArgs, managerLog } from "./fixtures/creation/logs.js";
import { loadOutcomeRows, type OutcomeRow } from "./fixtures/creation/records.js";

// The review loop replayed on the recorded history of all 585 Conviction markets (research note 23): when each
// was created, when it was reviewed and how, how the owner answered, how long the oracle's window was. Times
// are real; the rest of each log (tokens, URIs) is made up, and the same market could not tell the difference.

const rows = loadOutcomeRows();
const GCS = "https://storage.googleapis.com/market-metadata-mainnet/";

interface Replay {
  readonly row: OutcomeRow;
  readonly index: number;
  readonly conditionId: Hex;
  readonly creator: Address;
  readonly expiresAtS: number;
  readonly events: CreationEvent[];
  readonly reviewAtS: number | null;
  readonly windowS: number | null;
  readonly responseAtS: number | null;
}

const hex = (value: number, width: number): string => value.toString(16).padStart(width, "0");

function eventsOf(row: OutcomeRow, index: number): Replay {
  const conditionId = `0x${row.cond12}${"0".repeat(52)}` as Hex;
  const creator = getAddress(`0x${hex(index + 1, 40)}`);
  const expiresAtS = row.createdAtS + Math.round(row.horizonDays * 86_400);
  const block = 10_000 + index * 10;
  const events: CreationEvent[] = [];
  const decode = (name: Parameters<typeof managerLog>[0], args: Record<string, unknown>, offset: number, atS: number): void => {
    const event = decodeCreationLog(managerLog(name, args, { blockNumber: BigInt(block + offset), logIndex: 0n, timestamp: BigInt(atS) }));
    assert.ok(event, `${row.cond12} ${name}`);
    events.push(event as CreationEvent);
  };
  decode("CLOBMarketCreated", createdArgs({ conditionId, creator, yes: BigInt(index) + 10n ** 20n, no: BigInt(index) + 2n * 10n ** 20n, collateral: USDC_E_ADDRESS, startsAt: row.createdAtS, expiresAt: expiresAtS, uri: `${GCS}${row.cond12}.json` }), 0, row.createdAtS);
  let reviewAtS: number | null = null;
  let windowS: number | null = null;
  let responseAtS: number | null = null;
  if (row.firstReview === "NONE") {
    decode("MarketCancelledByOwner", { conditionId, owner: creator }, 1, row.createdAtS + (row.ownerCancelledAfterS as number));
  } else {
    reviewAtS = row.createdAtS + (row.reviewLatencyS as number);
    const decision = row.firstReview === "APPROVE" ? 0 : row.firstReview === "REJECT" ? 1 : 2;
    windowS = decision === 2 ? Math.round((row.suggestionWindowH as number) * 3600) : null;
    decode(
      "MarketReviewed",
      {
        conditionId,
        decision,
        suggestedMetaDataURI: decision === 2 ? `${GCS}${row.cond12}-suggested.json` : "",
        extraNotes: decision === 1 ? "Duplicate" : "Market approved by admin",
        suggestedExpiresAt: expiresAtS,
        suggestionExpiresAt: windowS === null ? 0 : reviewAtS + windowS,
      },
      1,
      reviewAtS,
    );
    if (decision === 2) {
      responseAtS = reviewAtS + (row.responseLatencyS as number);
      decode("UpdateRequestResponded", { conditionId, owner: creator, accepted: row.ownerResponse === "accepted", metaDataURI: row.ownerResponse === "accepted" ? `${GCS}${row.cond12}-suggested.json` : "" }, 2, responseAtS);
    }
  }
  return { row, index, conditionId, creator, expiresAtS, events, reviewAtS, windowS, responseAtS };
}

function startOf(replay: Replay): ReviewState {
  const started = startTracking({ conditionId: replay.conditionId, creator: replay.creator, intendedExpiresAtS: replay.expiresAtS, startedAtS: replay.row.createdAtS });
  assert.ok(started.ok);
  if (!started.ok) throw new Error("start");
  return started.state;
}

const replays = rows.map(eventsOf);
const EXPECTED_PHASE = (row: OutcomeRow): ReviewPhase =>
  row.firstReview === "APPROVE" ? "active" : row.firstReview === "REJECT" ? "rejected" : row.firstReview === "NONE" ? "cancelled" : row.ownerResponse === "accepted" ? "active" : "declined";

describe("the recorded history", () => {
  it("is the 585 markets of note 23", () => {
    assert.equal(rows.length, 585);
    const count = (predicate: (row: OutcomeRow) => boolean): number => rows.filter(predicate).length;
    assert.equal(count((row) => row.firstReview === "APPROVE"), 287);
    assert.equal(count((row) => row.firstReview === "UPDATE_REQUIRED"), 233);
    assert.equal(count((row) => row.firstReview === "REJECT"), 51);
    assert.equal(count((row) => row.firstReview === "NONE"), 14);
    assert.equal(count((row) => row.ownerResponse === "accepted"), 218);
    assert.equal(count((row) => row.ownerResponse === "declined"), 15);
    assert.equal(count((row) => row.final === "ACTIVE"), 505);
  });
});

describe("replaying each market's logs", () => {
  it("reaches the recorded final state for all 585, with no anomaly", () => {
    const wrong: string[] = [];
    for (const replay of replays) {
      const state = replayEvents(startOf(replay), replay.events, replay.row.createdAtS + 10 * 86_400).state;
      if (state.phase !== EXPECTED_PHASE(replay.row)) wrong.push(`${replay.row.cond12}: ${state.phase} (wanted ${EXPECTED_PHASE(replay.row)})`);
      if (state.anomalies.length > 0) wrong.push(`${replay.row.cond12}: anomalies ${state.anomalies.join()}`);
    }
    assert.deepEqual(wrong, []);
  });

  it("ends with 505 active, 51 rejected, 15 declined and 14 cancelled", () => {
    const tally: Record<string, number> = {};
    for (const replay of replays) {
      const phase = replayEvents(startOf(replay), replay.events, replay.row.createdAtS + 10 * 86_400).state.phase;
      tally[phase] = (tally[phase] ?? 0) + 1;
    }
    assert.deepEqual(tally, { active: 505, rejected: 51, declined: 15, cancelled: 14 });
  });

  it("agrees with the recorded timings", () => {
    for (const replay of replays) {
      const state = replayEvents(startOf(replay), replay.events, replay.row.createdAtS + 10 * 86_400).state;
      assert.equal(state.createdAtS, replay.row.createdAtS, replay.row.cond12);
      if (replay.reviewAtS !== null) assert.equal(state.review?.reviewedAtS, replay.reviewAtS, replay.row.cond12);
      if (replay.row.creationToActiveS !== null) assert.equal(state.activatedAtS, replay.row.createdAtS + replay.row.creationToActiveS, replay.row.cond12);
      if (replay.row.firstReview === "NONE") assert.equal(state.terminalAtS, replay.row.createdAtS + (replay.row.ownerCancelledAfterS as number), replay.row.cond12);
      assert.equal(state.currentExpiresAtS, replay.expiresAtS);
    }
  });

  it("gives the same result when the logs are fed one by one in real time (the clock moving to each log)", () => {
    for (const replay of replays) {
      let state = startOf(replay);
      for (const event of replay.events) {
        const at = "position" in event && event.position.atS !== null ? event.position.atS : replay.row.createdAtS;
        state = advanceClock(state, at).state;
        state = applyEvent(state, event, at).state;
      }
      assert.equal(state.phase, EXPECTED_PHASE(replay.row), replay.row.cond12);
      assert.deepEqual(state.anomalies, [], replay.row.cond12);
    }
  });

  it("keeps every state JSON-safe", () => {
    for (const replay of replays.filter((_, index) => index % 7 === 0)) {
      const state = replayEvents(startOf(replay), replay.events, replay.row.createdAtS + 10 * 86_400).state;
      assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    }
  });
});

describe("the oracle's windows (20 minutes to 48 hours)", () => {
  const updates = replays.filter((replay) => replay.row.firstReview === "UPDATE_REQUIRED");

  it("reads the windows the oracle gave", () => {
    const windows = updates.map((replay) => replay.windowS as number).sort((a, b) => a - b);
    assert.equal(windows.length, 233);
    assert.equal(windows[0], 1188, "the shortest window is 0.33 h, about 20 minutes");
    // Note 23: 48 h for most, 26 h for 27, under 24 h for 15 (about 24 h included), under 6 h for 5. The saved
    // windows are rounded to 0.01 h, so the 48 h class is counted as "within 0.15 h of 48".
    assert.equal(windows.filter((window) => Math.abs(window - 26 * 3600) < 0.15 * 3600).length, 27);
    assert.equal(windows.filter((window) => window < 24.5 * 3600).length, 15);
    assert.equal(windows.filter((window) => window < 6 * 3600).length, 5);
    assert.ok(windows.filter((window) => Math.abs(window - 48 * 3600) < 0.15 * 3600).length >= 160);
    for (const replay of updates) {
      const state = replayEvents(startOf(replay), replay.events.slice(0, 2), replay.row.createdAtS + 1).state;
      assert.equal(state.review?.windowS, replay.windowS);
      assert.equal(state.review?.suggestionExpiresAtS, (replay.reviewAtS as number) + (replay.windowS as number));
    }
    assert.equal(windows.filter((window) => windowKind(window) === "short").length, 5);
  });

  it("lets every one of the 218 accepting owners accept inside the window", () => {
    let accepted = 0;
    for (const replay of updates.filter((entry) => entry.row.ownerResponse === "accepted")) {
      const afterReview = replayEvents(startOf(replay), replay.events.slice(0, 2), replay.row.createdAtS + 1).state;
      const atResponse = advanceClock(afterReview, replay.responseAtS as number).state;
      assert.equal(atResponse.phase, "update_required", replay.row.cond12);
      const advice = acceptAdvice(applyEvent(atResponse, { kind: "guard_result", uri: atResponse.review?.suggestedUri as string, verdict: "pass" }, replay.responseAtS as number).state, replay.responseAtS as number);
      assert.equal(advice.canAcceptOnChain, true, replay.row.cond12);
      // Recommended exactly when the answer came at least ten minutes before the deadline.
      const margin = (replay.reviewAtS as number) + (replay.windowS as number) - (replay.responseAtS as number);
      assert.equal(advice.recommended, margin > 600, `${replay.row.cond12} margin ${margin}`);
      accepted += 1;
    }
    assert.equal(accepted, 218);
  });

  it("finds that exactly 10 of the 15 declines came after the window had lapsed", () => {
    let lapsedBefore = 0;
    let declined = 0;
    for (const replay of updates.filter((entry) => entry.row.ownerResponse === "declined")) {
      const afterReview = replayEvents(startOf(replay), replay.events.slice(0, 2), replay.row.createdAtS + 1).state;
      const atResponse = advanceClock(afterReview, replay.responseAtS as number).state;
      if (atResponse.phase === "update_window_lapsed") lapsedBefore += 1;
      const done = applyEvent(atResponse, replay.events[2] as CreationEvent, replay.responseAtS as number);
      assert.equal(done.state.phase, "declined", replay.row.cond12);
      assert.deepEqual(done.state.anomalies, []);
      declined += 1;
    }
    assert.equal(declined, 15);
    assert.equal(lapsedBefore, 10);
  });

  it("handles the 20-minute window: answered 81 s after the review, accept-by at 588 s, deadline at 1188 s", () => {
    const shortest = updates.find((replay) => replay.windowS === 1188);
    assert.ok(shortest);
    if (shortest === undefined) return;
    assert.equal(shortest.row.ownerResponse, "accepted");
    assert.equal((shortest.responseAtS as number) - (shortest.reviewAtS as number), 81);
    const reviewed = replayEvents(startOf(shortest), shortest.events.slice(0, 2), shortest.row.createdAtS + 1).state;
    const checked = applyEvent(reviewed, { kind: "guard_result", uri: reviewed.review?.suggestedUri as string, verdict: "pass" }, shortest.reviewAtS as number).state;
    const reviewAt = shortest.reviewAtS as number;
    assert.equal(acceptAdvice(checked, reviewAt + 81).recommended, true);
    assert.equal(acceptAdvice(checked, reviewAt + 588).secondsToAcceptBy, 0);
    assert.equal(acceptAdvice(checked, reviewAt + 589).recommended, false);
    assert.equal(acceptAdvice(checked, reviewAt + 1187).canAcceptOnChain, true);
    assert.equal(acceptAdvice(checked, reviewAt + 1188).canAcceptOnChain, false);
    assert.equal(nextPoll(checked, reviewAt + 1187).action, "poll");
    assert.equal(nextPoll(checked, reviewAt + 1188).action, "stop");
    const done = replayEvents(reviewed, shortest.events.slice(2), reviewAt + 100).state;
    assert.equal(done.phase, "active");
  });

  it("finds the market that waited longest to be answered still inside its window", () => {
    const slowest = [...updates].filter((replay) => replay.row.ownerResponse === "accepted").sort((a, b) => (b.row.responseLatencyS as number) - (a.row.responseLatencyS as number))[0];
    assert.ok(slowest);
    assert.equal(Math.round(((slowest?.row.responseLatencyS as number) / 60) * 10) / 10, 1534.2, "note 23: the slowest accept took 1,534 minutes");
    assert.ok((slowest?.row.responseLatencyS as number) < (slowest?.windowS as number));
  });
});

describe("the poll schedule against the recorded latencies", () => {
  const reviewed = replays.filter((replay) => replay.reviewAtS !== null);

  it("still polls at the moment of every first review: the slowest of 571 took 652 minutes, under the 12 hours", () => {
    assert.equal(reviewed.length, 571);
    let slowest = 0;
    for (const replay of reviewed) {
      const state = replayEvents(startOf(replay), replay.events.slice(0, 1), replay.row.createdAtS + 1).state;
      const plan = nextPoll(state, (replay.reviewAtS as number) - 1);
      assert.equal(plan.action, "poll", replay.row.cond12);
      slowest = Math.max(slowest, (replay.reviewAtS as number) - replay.row.createdAtS);
    }
    assert.ok(slowest > 650 * 60 && slowest < 653 * 60, `slowest ${slowest}`);
  });

  it("finds each review within 60 s during the first half hour and within 5 minutes afterwards", () => {
    for (const replay of reviewed) {
      const state = replayEvents(startOf(replay), replay.events.slice(0, 1), replay.row.createdAtS + 1).state;
      const age = (replay.reviewAtS as number) - replay.row.createdAtS;
      const plan = nextPoll(state, (replay.reviewAtS as number) - 1);
      assert.ok((plan.delayS as number) <= (age < 1800 ? 60 : 300), replay.row.cond12);
    }
  });

  it("stops watching a market once it is rejected, declined or cancelled, and starts a metadata watch once it is active", () => {
    for (const replay of replays) {
      const state = replayEvents(startOf(replay), replay.events, replay.row.createdAtS + 10 * 86_400).state;
      const plan = nextPoll(state, (state.terminalAtS ?? state.activatedAtS ?? replay.row.createdAtS) + 60);
      if (state.phase === "active") assert.equal(plan.reason, "watch_early", replay.row.cond12);
      else assert.deepEqual([plan.action, plan.reason], ["stop", "terminal"], replay.row.cond12);
    }
  });
});
