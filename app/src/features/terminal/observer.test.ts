import { describe, expect, it } from "vitest";

import { inboxItemSchema, uiEventSchema, type InboxItem, type InboxState, type UiEvent } from "@bridge/contract";

import { verifiedDeployItem } from "../../../../test/tools-decoded-helpers";
import { INITIAL_OBSERVER, MAX_AUDIT_ENTRIES, observerReducer, type ObserverAction, type ObserverState } from "./observer";
import { statusBody } from "./test-support";

const AT = "2026-10-19T12:00:00Z";
const LATER = "2026-10-19T12:00:30Z";

function item(id: string, state: InboxState = "prepared", requestedBy = "agent:0a1b2c3d", updatedAt = AT): InboxItem {
  return inboxItemSchema.parse({
    prepared_id: id,
    state,
    requested_by: requestedBy,
    created_at: AT,
    updated_at: updatedAt,
    expires_at: "2026-10-19T12:05:00Z",
    prepared: verifiedDeployItem({ preparedId: id }),
    result: null,
  });
}

const id = (n: number): string => n.toString(16).padStart(32, "0");

function run(...actions: ObserverAction[]): ObserverState {
  return actions.reduce(observerReducer, INITIAL_OBSERVER);
}
const event = (value: UiEvent): ObserverAction => ({ type: "event", event: uiEventSchema.parse(value) });

describe("the observer reducer", () => {
  it("starts unknown: nothing is invented", () => {
    expect(INITIAL_OBSERVER.posture).toBeNull();
    expect(INITIAL_OBSERVER.status).toBeNull();
    expect(INITIAL_OBSERVER.items).toEqual([]);
    expect(INITIAL_OBSERVER.inboxLoaded).toBe(false);
  });

  it("takes posture, kill and the audit head from validated status and posture events", () => {
    const status = statusBody({ posture: "ARMED", armed_until: "2026-10-19T12:10:00Z", kill: false });
    const state = run({ type: "connection", state: "live" }, event({ id: 3, at: AT, type: "status", status } as unknown as UiEvent));
    expect(state.connection).toBe("live");
    expect(state.posture).toBe("ARMED");
    expect(state.armedUntil).toBe("2026-10-19T12:10:00Z");
    expect(state.lastEventId).toBe(3);
    const killed = observerReducer(state, event({ id: 4, at: AT, type: "posture", posture: "KILLED", armed_until: null }));
    expect(killed.posture).toBe("KILLED");
    expect(killed.armedUntil).toBeNull();
  });

  it("lists every prepared item with its state, whoever asked", () => {
    const state = run({ type: "inbox", items: [item(id(1)), item(id(2), "shown", "ui"), item(id(3), "accepted", "terminal")], invalid: 1, eventId: 9 });
    expect(state.items.map((entry) => [entry.preparedId.slice(-1), entry.state, entry.requestedBy, entry.kind])).toEqual(
      expect.arrayContaining([
        ["1", "prepared", "agent:0a1b2c3d", "userop"],
        ["2", "shown", "ui", "userop"],
        ["3", "accepted", "terminal", "userop"],
      ]),
    );
    expect(state.invalidItems).toBe(1);
    expect(state.lastEventId).toBe(9);
    expect(state.inboxLoaded).toBe(true);
  });

  it("keeps only the fields it shows, not the prepared payload", () => {
    const state = run({ type: "inbox", items: [item(id(1))], invalid: 0, eventId: 1 });
    const text = JSON.stringify(state.items);
    expect(text).not.toContain("expected_digest");
    expect(text).not.toContain("summary");
  });

  it("follows prepared and prepared_state events", () => {
    const first = item(id(1));
    let state = run(event({ id: 5, at: AT, type: "prepared", item: first }));
    expect(state.items).toHaveLength(1);
    state = observerReducer(state, event({ id: 6, at: LATER, type: "prepared_state", prepared_id: id(1), state: "shown", result: null }));
    expect(state.items[0]?.state).toBe("shown");
    expect(state.items[0]?.jumps).toBe(0);
    state = observerReducer(state, event({ id: 7, at: LATER, type: "prepared_state", prepared_id: id(1), state: "signed", result: null }));
    expect(state.items[0]?.state).toBe("signed");
    expect(state.lastEventId).toBe(7);
  });

  it("counts a state move the contract does not allow as a missed step, and still shows the daemon's state", () => {
    let state = run({ type: "inbox", items: [item(id(1), "prepared")], invalid: 0, eventId: 1 });
    state = observerReducer(state, event({ id: 2, at: LATER, type: "prepared_state", prepared_id: id(1), state: "accepted", result: null }));
    expect(state.items[0]?.state).toBe("accepted");
    expect(state.items[0]?.jumps).toBe(1);
  });

  it("ignores a state change for an item it never saw rather than invent a row", () => {
    const state = run(event({ id: 2, at: LATER, type: "prepared_state", prepared_id: id(9), state: "shown", result: null }));
    expect(state.items).toEqual([]);
    expect(state.lastEventId).toBe(2);
  });

  it("keeps the audit list ordered, bounded and free of duplicates", () => {
    const entry = (seq: number) =>
      event({ id: seq, at: AT, type: "audit", entry: { seq, at: AT, type: "agent.call", actor: "agent:0a1b2c3d", summary: `call ${String(seq)}`, hash: `0x${"cd".repeat(32)}` } });
    let state = run(entry(2), entry(1), entry(2));
    expect(state.audit.map((row) => row.seq)).toEqual([1, 2]);
    for (let seq = 3; seq < MAX_AUDIT_ENTRIES + 10; seq += 1) state = observerReducer(state, entry(seq));
    expect(state.audit).toHaveLength(MAX_AUDIT_ENTRIES);
    expect(state.audit.at(-1)?.seq).toBe(MAX_AUDIT_ENTRIES + 9);
  });

  it("counts frames that failed the contract, and resets", () => {
    let state = run({ type: "violation" }, { type: "violation" });
    expect(state.violations).toBe(2);
    state = observerReducer(state, { type: "reset" });
    expect(state).toEqual(INITIAL_OBSERVER);
  });

  it("records heartbeats without changing anything else", () => {
    const state = run(event({ id: 8, at: LATER, type: "heartbeat" }));
    expect(state.lastBeatAt).toBe(LATER);
    expect(state.posture).toBeNull();
  });
});
