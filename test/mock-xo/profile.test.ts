import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { implementedSwitches, isMockSwitchName, MockSwitchError, readSwitches, SWITCH_IMPLEMENTATION, SwitchStore, switchValues, writeSwitches } from "./profile.js";
import { MOCK_SWITCH_NAMES, MOCK_SWITCHES, OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE, type MockSwitchName } from "./switches.js";

describe("the switch store", () => {
  it("starts in the pessimistic profile, which is every switch at its pessimistic value", () => {
    const store = new SwitchStore();
    assert.equal(store.profile, "pessimistic");
    assert.deepEqual(store.snapshot(), PESSIMISTIC_PROFILE);
    for (const definition of MOCK_SWITCHES) assert.equal(store.get(definition.name), definition.pessimistic, definition.name);
  });

  it("switches to the optimistic profile, which is every switch at its optimistic value", () => {
    const store = new SwitchStore("optimistic");
    assert.equal(store.profile, "optimistic");
    assert.deepEqual(store.snapshot(), OPTIMISTIC_PROFILE);
    const other = new SwitchStore();
    other.setProfile("optimistic");
    assert.deepEqual(other.snapshot(), OPTIMISTIC_PROFILE);
    other.setProfile("pessimistic");
    assert.deepEqual(other.snapshot(), PESSIMISTIC_PROFILE);
    assert.equal(other.profile, "pessimistic");
  });

  it("the two profiles differ in every switch except faults, which both leave at none", () => {
    const same = MOCK_SWITCH_NAMES.filter((name) => PESSIMISTIC_PROFILE[name] === OPTIMISTIC_PROFILE[name]);
    assert.deepEqual(same, ["faults"]);
  });

  it("flips one switch and says the profile is now custom; flipping it back restores the profile", () => {
    const store = new SwitchStore();
    store.set("rpc.access", "open");
    assert.equal(store.get("rpc.access"), "open");
    assert.equal(store.profile, "custom");
    assert.deepEqual(store.differences("pessimistic"), ["rpc.access"]);
    store.set("rpc.access", "down");
    assert.equal(store.profile, "pessimistic");
    assert.deepEqual(store.differences("pessimistic"), []);
  });

  it("applies a partial profile on top of the pessimistic one", () => {
    const store = new SwitchStore({ "rpc.access": "open", "registry.trigger": "on-deploy" });
    assert.equal(store.get("rpc.access"), "open");
    assert.equal(store.get("registry.trigger"), "on-deploy");
    assert.equal(store.get("bundler.estimate"), PESSIMISTIC_PROFILE["bundler.estimate"]);
    assert.equal(store.profile, "custom");
  });

  it("accepts every listed value of every switch and reads it back", () => {
    const store = new SwitchStore();
    let count = 0;
    for (const definition of MOCK_SWITCHES) {
      for (const value of definition.values) {
        store.setByName(definition.name, value);
        assert.equal(store.get(definition.name), value);
        count += 1;
      }
      store.setByName(definition.name, definition.pessimistic);
    }
    assert.ok(count > 60, `only ${String(count)} values exercised`);
  });

  it("refuses an unknown switch, a value outside the list and an unknown profile, and changes nothing", () => {
    const store = new SwitchStore();
    assert.throws(() => store.setByName("rpc.acces", "open"), (error: unknown) => error instanceof MockSwitchError && error.code === "unknown_switch");
    assert.throws(() => store.setByName("rpc.access", "OPEN"), (error: unknown) => error instanceof MockSwitchError && error.code === "invalid_value");
    assert.throws(() => store.setByName("rpc.access", ""), (error: unknown) => error instanceof MockSwitchError && error.code === "invalid_value");
    assert.throws(() => store.setProfile("hopeful" as never), (error: unknown) => error instanceof MockSwitchError && error.code === "unknown_profile");
    assert.throws(() => new SwitchStore("hopeful" as never), MockSwitchError);
    assert.throws(() => new SwitchStore({ "auth.max_keys": "7" as never }), MockSwitchError);
    assert.deepEqual(store.snapshot(), PESSIMISTIC_PROFILE);
    assert.equal(isMockSwitchName("rpc.access"), true);
    assert.equal(isMockSwitchName("constructor"), false);
    assert.equal(isMockSwitchName("__proto__"), false);
  });

  it("tells listeners what changed, and stays quiet when nothing did", () => {
    const store = new SwitchStore();
    const seen: string[] = [];
    const off = store.onChange((name, value, previous) => seen.push(`${name}:${previous}->${value}`));
    store.set("rpc.access", "open");
    store.set("rpc.access", "open");
    store.setProfile("optimistic");
    off();
    store.set("rpc.access", "down");
    assert.equal(seen[0], "rpc.access:down->open");
    assert.equal(seen.filter((line) => line.startsWith("rpc.access")).length, 1);
    assert.equal(seen.length, MOCK_SWITCH_NAMES.filter((name) => PESSIMISTIC_PROFILE[name] !== OPTIMISTIC_PROFILE[name]).length);
  });

  it("restores the switches after a scoped override, also when the body throws", async () => {
    const store = new SwitchStore();
    await store.withSwitches({ "rpc.access": "open" }, async () => {
      assert.equal(store.get("rpc.access"), "open");
    });
    assert.equal(store.get("rpc.access"), "down");
    await assert.rejects(
      store.withSwitches({ "registry.trigger": "on-deploy" }, async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(store.get("registry.trigger"), "never");
    assert.equal(store.profile, "pessimistic");
  });

  it("keeps the values in the order the table lists them", () => {
    for (const definition of MOCK_SWITCHES) assert.deepEqual(switchValues(definition.name), definition.values);
  });
});

describe("which switches the mock implements", () => {
  it("accounts for every switch: the read mock owns rpc.access, registry.trigger and faults, the write mock the other 27, none is pending", () => {
    assert.deepEqual(Object.keys(SWITCH_IMPLEMENTATION).sort(), [...MOCK_SWITCH_NAMES].sort());
    assert.deepEqual([...readSwitches()].sort(), ["faults", "registry.trigger", "rpc.access"]);
    assert.equal(writeSwitches().length, MOCK_SWITCH_NAMES.length - 3);
    assert.deepEqual([...implementedSwitches()].sort(), [...MOCK_SWITCH_NAMES].sort());
    const pending = MOCK_SWITCH_NAMES.filter((name: MockSwitchName) => SWITCH_IMPLEMENTATION[name] === "mock-write-pending");
    assert.deepEqual(pending, []);
  });
});
