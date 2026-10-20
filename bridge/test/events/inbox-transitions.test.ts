import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INBOX_STATES, INBOX_TRANSITIONS, canTransition, type InboxState } from "../../contract.js";

// The inbox status machine, pinned pair by pair (review finding TM-07). Before this, only the moves the code takes
// were tested, so widening the table (accepted -> rejected, ambiguous -> submitted) changed nothing that failed.

const ALLOWED: Readonly<Record<InboxState, readonly InboxState[]>> = {
  prepared: ["shown", "rejected", "expired"],
  shown: ["signed", "rejected", "expired"],
  signed: ["submitted", "rejected", "expired"],
  submitted: ["accepted", "rejected", "ambiguous", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
  ambiguous: [],
};

describe("INBOX_TRANSITIONS", () => {
  it("has a row for every state and no other", () => {
    assert.deepEqual(Object.keys(INBOX_TRANSITIONS).sort(), [...INBOX_STATES].sort());
  });

  it("allows exactly the reviewed moves, checked for every (from, to) pair", () => {
    for (const from of INBOX_STATES) {
      for (const to of INBOX_STATES) {
        assert.equal(canTransition(from, to), ALLOWED[from].includes(to), `${from} -> ${to}`);
      }
    }
  });

  it("has four terminal states with no way out: accepted, rejected, expired, ambiguous", () => {
    for (const state of ["accepted", "rejected", "expired", "ambiguous"] as const) {
      assert.deepEqual(INBOX_TRANSITIONS[state], [], state);
      for (const to of INBOX_STATES) assert.equal(canTransition(state, to), false, `${state} -> ${to}`);
    }
  });

  it("lets every open state expire and be rejected, and no state skip ahead of the signature", () => {
    for (const state of ["prepared", "shown", "signed", "submitted"] as const) {
      assert.equal(canTransition(state, "expired"), true, state);
      assert.equal(canTransition(state, "rejected"), true, state);
    }
    assert.equal(canTransition("prepared", "signed"), false);
    assert.equal(canTransition("prepared", "submitted"), false);
    assert.equal(canTransition("shown", "submitted"), false);
    assert.equal(canTransition("shown", "accepted"), false);
  });

  it("never moves a state to itself", () => {
    for (const state of INBOX_STATES) assert.equal(canTransition(state, state), false, state);
  });
});
