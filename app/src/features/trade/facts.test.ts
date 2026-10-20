import { describe, expect, it } from "vitest";

import { CAPABILITY_IDS, NO_FACTS } from "../../core/capabilities";
import { ACTION_NEEDS, TRADE_ACTIONS, WRITE_FLAGS, flagIsOn, gateFor, gateForCancel, mergeFacts, unprovenRequired, type FlagView, type GateInput } from "./facts";
import { factsWith } from "./test-support";

const OFF: FlagView = { plugin: Object.fromEntries(WRITE_FLAGS.map((flag) => [flag, false])), relay: Object.fromEntries(WRITE_FLAGS.map((flag) => [flag, false])) };
const ALL_ON: FlagView = { plugin: Object.fromEntries(WRITE_FLAGS.map((flag) => [flag, true])), relay: Object.fromEntries(WRITE_FLAGS.map((flag) => [flag, true])) };
const ALL_PROVEN = factsWith(CAPABILITY_IDS);

function input(overrides: Partial<GateInput> = {}): GateInput {
  return { hasOwner: true, paired: true, accountRead: true, kill: false, flags: OFF, facts: NO_FACTS, ...overrides };
}

describe("every write capability reads unproven until its fact is yes", () => {
  it("starts with nothing proven: every required fact of every action is missing", () => {
    for (const action of TRADE_ACTIONS) {
      const missing = unprovenRequired(action, NO_FACTS);
      expect(missing.length, action).toBeGreaterThan(0);
    }
  });

  it("treats a recorded no exactly like unknown", () => {
    const needs = ACTION_NEEDS.deploy.requires;
    const withNo = factsWith([], needs);
    expect(unprovenRequired("deploy", withNo)).toEqual(unprovenRequired("deploy", NO_FACTS));
  });

  it("an order needs either typed-data or raw-digest signing proven, not both", () => {
    const base: Parameters<typeof factsWith>[0] = ["door_a_bundler_admits_first_userop", "door_b_orderbook_registers_account", "door_c_l1_clobauth_accepted", "first_order_accepted_and_cancelled"];
    expect(unprovenRequired("order", factsWith(base))).toEqual(["paybox_signs_typed_data_3223", "paybox_signs_raw_digest"]);
    expect(unprovenRequired("order", factsWith([...base, "paybox_signs_typed_data_3223"]))).toEqual([]);
    expect(unprovenRequired("order", factsWith([...base, "paybox_signs_raw_digest"]))).toEqual([]);
  });
});

describe("the gate", () => {
  it("offers no hand-off with every flag off and no fact recorded, for any action", () => {
    for (const action of TRADE_ACTIONS) {
      const gate = gateFor(action, input());
      expect(gate.canHandOff, action).toBe(false);
    }
  });

  it("blocks Prepare for the actions that reserve budget while the switch is off, and allows a dry run for the others", () => {
    for (const action of TRADE_ACTIONS) {
      const gate = gateFor(action, input());
      expect(gate.canPrepare, action).toBe(!ACTION_NEEDS[action].reservesBudget);
      expect(gate.reasons.map((reason) => reason.code)).toContain(ACTION_NEEDS[action].reservesBudget ? "flag_off" : "dry_run_only");
    }
  });

  it("opens only with the switch on in BOTH the plugin and the relay and every required fact yes", () => {
    for (const action of TRADE_ACTIONS) {
      expect(gateFor(action, input({ flags: ALL_ON, facts: ALL_PROVEN })).canHandOff, action).toBe(true);
      expect(gateFor(action, input({ flags: { plugin: ALL_ON.plugin, relay: OFF.relay }, facts: ALL_PROVEN })).canHandOff, `${action} plugin only`).toBe(false);
      expect(gateFor(action, input({ flags: { plugin: OFF.plugin, relay: ALL_ON.relay }, facts: ALL_PROVEN })).canHandOff, `${action} relay only`).toBe(false);
      expect(gateFor(action, input({ flags: { plugin: ALL_ON.plugin, relay: null }, facts: ALL_PROVEN })).canHandOff, `${action} relay unread`).toBe(false);
      expect(gateFor(action, input({ flags: ALL_ON, facts: NO_FACTS })).canHandOff, `${action} unproven`).toBe(false);
    }
  });

  it("closes everything on the kill switch, and when unpaired, ownerless or unread", () => {
    for (const action of TRADE_ACTIONS) {
      const open = input({ flags: ALL_ON, facts: ALL_PROVEN });
      expect(gateFor(action, { ...open, kill: true })).toMatchObject({ canPrepare: false, canHandOff: false });
      expect(gateFor(action, { ...open, paired: false })).toMatchObject({ canPrepare: false, canHandOff: false });
      expect(gateFor(action, { ...open, hasOwner: false })).toMatchObject({ canPrepare: false, canHandOff: false });
      expect(gateFor(action, { ...open, accountRead: false })).toMatchObject({ canPrepare: false, canHandOff: false });
      expect(gateFor(action, { ...open, flags: null })).toMatchObject({ canPrepare: false, canHandOff: false });
    }
  });

  it("names the unproven facts it is waiting for", () => {
    const gate = gateFor("deploy", input({ flags: ALL_ON }));
    expect(gate.reasons.find((reason) => reason.code === "unproven")?.facts).toEqual(ACTION_NEEDS.deploy.requires);
    expect(gate.unprovenInforming).toEqual(ACTION_NEEDS.deploy.informs);
  });

  it("treats an unknown flag name or a non-true value as off", () => {
    expect(flagIsOn({ plugin: { ENABLE_TRADING: true }, relay: { ENABLE_TRADING: "true" as unknown as boolean } }, "ENABLE_TRADING")).toBe(false);
    expect(flagIsOn(null, "ENABLE_TRADING")).toBe(false);
  });
});

describe("cancel gate", () => {
  it("needs the trading switch and the common conditions, and only informs about the first-cancel fact", () => {
    expect(gateForCancel(input()).canHandOff).toBe(false);
    expect(gateForCancel(input({ flags: ALL_ON })).canHandOff).toBe(true);
    expect(gateForCancel(input({ flags: ALL_ON })).unprovenInforming).toEqual(["first_order_accepted_and_cancelled"]);
    expect(gateForCancel(input({ flags: ALL_ON, kill: true })).canHandOff).toBe(false);
    expect(gateForCancel(input({ flags: ALL_ON, paired: false })).canHandOff).toBe(false);
  });
});

describe("merging the page's record with the relay's", () => {
  it("lets a relay yes count, and a no from either side win", () => {
    const merged = mergeFacts(NO_FACTS, { T1: "yes", T2: "yes", PB1: "no" });
    expect(merged.door_a_bundler_admits_first_userop).toBe("yes");
    expect(merged.door_b_orderbook_registers_account).toBe("yes");
    expect(merged.paybox_signs_raw_digest).toBe("no");
    const pageNo = mergeFacts(factsWith([], ["door_a_bundler_admits_first_userop"]), { T1: "yes" });
    expect(pageNo.door_a_bundler_admits_first_userop).toBe("no");
  });

  it("ignores anything that is not exactly yes or no, and ids it does not know", () => {
    const merged = mergeFacts(NO_FACTS, { T1: "YES", T2: "maybe", T3a: "", Z9: "yes", __proto__: "yes" } as unknown as Record<string, string>);
    for (const id of CAPABILITY_IDS) expect(merged[id], id).toBe("unknown");
  });

  it("changes nothing when the relay sent no record", () => {
    expect(mergeFacts(NO_FACTS, null)).toEqual(NO_FACTS);
  });
});
