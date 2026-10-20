import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOCK_SWITCHES,
  MOCK_SWITCH_NAMES,
  OPTIMISTIC_PROFILE,
  PESSIMISTIC_PROFILE,
} from "./mock-xo/switches.js";

// The names of docs/phase1-gap-closing.md section 5.5 category B, spelled out here so that a
// rename or a dropped switch in switches.ts fails this test. The mock stream may add names.
const SPEC_NAMES = [
  "bundler.foreign_account",
  "bundler.paymasterless",
  "bundler.estimate",
  "bundler.shape",
  "paymaster.state",
  "rpc.access",
  "registry.trigger",
  "l1.undeployed",
  "auth.derive_returns_secret",
  "auth.max_keys",
  "auth.delete_level",
  "hmac.target",
  "hmac.decode",
  "l2.required_on_post",
  "l2.xo_address",
  "order.min_size",
  "order.min_notional",
  "order.gtd_min",
  "order.sig_forms",
  "order.prefix",
  "order.dup_key_includes_sig",
  "cancel.body",
  "cancel.batch_hmac_only",
  "engine.taker_delay",
  "engine.balance_drop",
  "funding.credit",
  "withdraw.paymasterless",
  "meta.foreign_uri",
  "seed.on_pending",
  "faults",
];

describe("mock switch table (names only; behaviour belongs to the mock stream)", () => {
  it("has every switch of the spec, exactly once", () => {
    for (const name of SPEC_NAMES) assert.ok((MOCK_SWITCH_NAMES as readonly string[]).includes(name), name);
    assert.equal(new Set(MOCK_SWITCH_NAMES).size, MOCK_SWITCH_NAMES.length);
  });

  it("gives every switch at least two values (or the fault list), with both profile values among them", () => {
    for (const definition of MOCK_SWITCHES) {
      const values: readonly string[] = definition.values;
      assert.ok(values.length >= 2, definition.name);
      assert.equal(new Set(values).size, values.length, definition.name);
      assert.ok(values.includes(definition.pessimistic), `${definition.name} pessimistic`);
      assert.ok(values.includes(definition.optimistic), `${definition.name} optimistic`);
      for (const value of values) assert.ok(value.length > 0 && value.length <= 40, `${definition.name}=${value}`);
    }
  });

  it("makes the two profiles differ on every switch except the injected faults", () => {
    for (const definition of MOCK_SWITCHES) {
      if (definition.name === "faults") assert.equal(definition.pessimistic, definition.optimistic);
      else assert.notEqual(definition.pessimistic, definition.optimistic, definition.name);
    }
  });

  it("names the assumption-register ids each switch is evidence for", () => {
    for (const definition of MOCK_SWITCHES) {
      assert.ok(definition.register.length >= 1, definition.name);
      for (const id of definition.register) assert.match(id, /^[A-Z]{2}\d{0,2}$/, `${definition.name} ${id}`);
    }
  });

  it("derives complete, frozen profiles", () => {
    for (const profile of [PESSIMISTIC_PROFILE, OPTIMISTIC_PROFILE]) {
      assert.deepEqual(Object.keys(profile).sort(), [...MOCK_SWITCH_NAMES].sort());
      assert.ok(Object.isFrozen(profile));
    }
    for (const definition of MOCK_SWITCHES) {
      assert.equal(PESSIMISTIC_PROFILE[definition.name], definition.pessimistic);
      assert.equal(OPTIMISTIC_PROFILE[definition.name], definition.optimistic);
    }
  });

  it("keeps the pessimistic profile pessimistic on the doors that matter", () => {
    assert.equal(PESSIMISTIC_PROFILE["bundler.foreign_account"], "reject");
    assert.equal(PESSIMISTIC_PROFILE["registry.trigger"], "never");
    assert.equal(PESSIMISTIC_PROFILE["l1.undeployed"], "reject");
    assert.equal(PESSIMISTIC_PROFILE["funding.credit"], "not-credited");
    assert.equal(OPTIMISTIC_PROFILE["bundler.foreign_account"], "accept");
    assert.equal(OPTIMISTIC_PROFILE["funding.credit"], "credited");
  });
});
