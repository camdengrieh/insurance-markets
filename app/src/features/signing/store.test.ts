import { describe, expect, it } from "vitest";

import type { InboxItem, UiEvent } from "@bridge/contract";

import { INITIAL_SIGNING, ordered, signingReducer, type SigningState } from "./store";
import { NOW_MS, authItem, deployItem, isoSecond, orderItem, recordOf } from "./testkit";

const at = (ms: number) => isoSecond(NOW_MS + ms);

function item(id: string, prepared: Record<string, unknown>, options: Parameters<typeof recordOf>[1] = {}): InboxItem {
  return recordOf({ ...prepared, prepared_id: id }, options);
}

const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);

function ev(event: Record<string, unknown>): UiEvent {
  return event as UiEvent;
}

function reduce(state: SigningState, ...actions: Parameters<typeof signingReducer>[1][]): SigningState {
  return actions.reduce(signingReducer, state);
}

describe("the inbox store", () => {
  it("lists open items first, then the newest change, then by id", () => {
    const rows = ordered([
      item(A, deployItem(), { state: "accepted", createdAtMs: NOW_MS - 1000 }),
      item(B, deployItem(), { state: "prepared", createdAtMs: NOW_MS - 3000 }),
      item(C, deployItem(), { state: "shown", createdAtMs: NOW_MS - 2000 }),
    ]);
    expect(rows.map((row) => row.prepared_id)).toEqual([C, B, A]);
  });

  it("an inbox read replaces the list and records the event id to resume from", () => {
    const state = reduce(INITIAL_SIGNING, { type: "inbox", items: [item(A, deployItem())], invalid: 2, eventId: 41 });
    expect(state.items).toHaveLength(1);
    expect(state.invalid).toBe(2);
    expect(state.lastEventId).toBe(41);
    expect(state.loaded).toBe(true);
  });

  it("a prepared event adds an item, a later record for the same id replaces it", () => {
    const first = item(A, deployItem());
    const later = { ...first, state: "shown" as const };
    const state = reduce(
      INITIAL_SIGNING,
      { type: "event", event: ev({ id: 1, at: at(0), type: "prepared", item: first }) },
      { type: "event", event: ev({ id: 2, at: at(1000), type: "prepared", item: later }) },
    );
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.state).toBe("shown");
    expect(state.lastEventId).toBe(2);
  });

  it("a state change updates the item and its result; one for an unseen item asks for a re-read", () => {
    const base = reduce(INITIAL_SIGNING, { type: "inbox", items: [item(A, orderItem())], invalid: 0, eventId: 5 });
    const changed = reduce(base, { type: "event", event: ev({ id: 6, at: at(2000), type: "prepared_state", prepared_id: A, state: "ambiguous", result: { order_hash: `0x${"12".repeat(32)}` } }) });
    expect(changed.items[0]?.state).toBe("ambiguous");
    expect(changed.items[0]?.result?.order_hash).toBe(`0x${"12".repeat(32)}`);
    expect(changed.staleRead).toBe(false);
    const unseen = reduce(base, { type: "event", event: ev({ id: 7, at: at(3000), type: "prepared_state", prepared_id: B, state: "accepted", result: null }) });
    expect(unseen.items).toHaveLength(1);
    expect(unseen.staleRead).toBe(true);
    // The next read clears it.
    expect(reduce(unseen, { type: "inbox", items: [], invalid: 0, eventId: 8 }).staleRead).toBe(false);
  });

  it("a state word outside the closed list changes nothing but the resume id (TM-08)", () => {
    const base = reduce(INITIAL_SIGNING, { type: "inbox", items: [item(A, orderItem())], invalid: 0, eventId: 5 });
    const odd = reduce(base, { type: "event", event: ev({ id: 6, at: at(2000), type: "prepared_state", prepared_id: A, state: "approved_by_robots", result: null }) });
    expect(odd.items[0]?.state).toBe("prepared");
    expect(odd.items[0]?.result).toBeNull();
    expect(odd.lastEventId).toBe(6);
  });

  it("kill is one-way: a later posture or status never clears it", () => {
    const killed = reduce(INITIAL_SIGNING, { type: "event", event: ev({ id: 1, at: at(0), type: "posture", posture: "KILLED", armed_until: null }) });
    expect(killed.kill).toBe(true);
    const after = reduce(killed, { type: "event", event: ev({ id: 2, at: at(1000), type: "posture", posture: "OBSERVE", armed_until: null }) });
    expect(after.kill).toBe(true);
  });

  it("posture and the ARM window follow the events", () => {
    const state = reduce(INITIAL_SIGNING, { type: "event", event: ev({ id: 1, at: at(0), type: "posture", posture: "ARMED", armed_until: at(120_000) }) });
    expect(state.posture).toBe("ARMED");
    expect(state.armedUntil).toBe(at(120_000));
    expect(state.kill).toBe(false);
  });

  it("an event never moves the resume id backwards", () => {
    const state = reduce(INITIAL_SIGNING, { type: "event", event: ev({ id: 9, at: at(0), type: "heartbeat" }) }, { type: "event", event: ev({ id: 4, at: at(0), type: "heartbeat" }) });
    expect(state.lastEventId).toBe(9);
  });

  it("a decision's answer replaces the record; a violation is only counted", () => {
    const base = reduce(INITIAL_SIGNING, { type: "inbox", items: [item(A, authItem())], invalid: 0, eventId: 1 });
    const rejected = reduce(base, { type: "replace", item: { ...(base.items[0] as InboxItem), state: "rejected" } }, { type: "violation" });
    expect(rejected.items[0]?.state).toBe("rejected");
    expect(rejected.violations).toBe(1);
  });

  it("is bounded", () => {
    const many = Array.from({ length: 230 }, (_, index) => item(index.toString(16).padStart(32, "0"), deployItem()));
    expect(ordered(many)).toHaveLength(200);
  });
});
