import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ERROR_CODES, ERROR_HTTP_STATUS, RelayError, isErrorCode, relayError, toRelayErrorBody } from "../src/relay/errors.js";
import {
  ALL_FLAGS_OFF,
  FLAG_NAMES,
  KILL_ENV_ALIAS,
  isEnabled,
  parseFlags,
  requireFlag,
  type FlagName,
  type Flags,
  type WriteFlagName,
} from "../src/relay/flags.js";

const WRITE_FLAGS = FLAG_NAMES.filter((name): name is WriteFlagName => name !== "KILL");
const on = (...names: FlagName[]): Flags => ({ ...ALL_FLAGS_OFF, ...Object.fromEntries(names.map((name) => [name, true])) });

function thrown(fn: () => void): RelayError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof RelayError, "expected a RelayError");
    return error;
  }
  assert.fail("expected a throw");
}

describe("flags: names and defaults", () => {
  it("pins the flag names of the plan", () => {
    assert.deepEqual(
      [...FLAG_NAMES],
      ["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING", "ENABLE_FUNDING", "ENABLE_WITHDRAW", "XO_ENABLE_CREATE", "ENABLE_SELF_HOSTED_METADATA", "KILL"],
    );
  });

  it("defaults every flag OFF from an empty environment, with no issues", () => {
    const { flags, issues } = parseFlags({});
    assert.deepEqual({ ...flags }, { ...ALL_FLAGS_OFF });
    assert.deepEqual(issues, []);
    for (const name of FLAG_NAMES) assert.equal(flags[name], false, name);
  });

  it("treats blank and whitespace-only values as unset", () => {
    const { flags, issues } = parseFlags({ ENABLE_TRADING: "", ENABLE_FUNDING: "   ", KILL: " " });
    assert.deepEqual({ ...flags }, { ...ALL_FLAGS_OFF });
    assert.deepEqual(issues, []);
  });

  it("returns a frozen object", () => {
    const { flags } = parseFlags({});
    assert.ok(Object.isFrozen(flags));
    assert.throws(() => {
      (flags as { ENABLE_TRADING: boolean }).ENABLE_TRADING = true;
    });
  });
});

describe("flags: parsing", () => {
  it("turns each write flag on only with a truthy word, case-insensitively, one at a time", () => {
    for (const name of WRITE_FLAGS) {
      for (const word of ["1", "true", "TRUE", " yes ", "On"]) {
        const { flags, issues } = parseFlags({ [name]: word });
        assert.equal(flags[name], true, `${name}=${word}`);
        assert.deepEqual(issues, []);
        for (const other of FLAG_NAMES) if (other !== name) assert.equal(flags[other], false, `${name} leaked into ${other}`);
      }
    }
  });

  it("keeps each flag off for falsy words", () => {
    for (const name of WRITE_FLAGS) {
      for (const word of ["0", "false", "No", "OFF"]) {
        const { flags, issues } = parseFlags({ [name]: word });
        assert.equal(flags[name], false, `${name}=${word}`);
        assert.deepEqual(issues, []);
      }
    }
  });

  it("treats garbage as OFF and reports it without echoing the value", () => {
    const garbage = ["maybe", "2", "enabled", "tru", "yes please", "null", "undefined", "1; rm -rf", "\u0000", "SUPERSECRET_garbage_value"];
    for (const name of WRITE_FLAGS) {
      for (const word of garbage) {
        const { flags, issues } = parseFlags({ [name]: word });
        assert.equal(flags[name], false, `${name}=${word}`);
        assert.equal(issues.length, 1, `${name}=${word}`);
        assert.equal(issues[0]?.variable, name);
        assert.ok(!issues[0]?.message.includes(word), `${name} echoed ${word}`);
      }
    }
  });

  it("ignores values that are not strings", () => {
    const { flags, issues } = parseFlags({ ENABLE_TRADING: true as unknown as string, ENABLE_FUNDING: 1 as unknown as string });
    assert.deepEqual({ ...flags }, { ...ALL_FLAGS_OFF });
    assert.deepEqual(issues, []);
  });

  it("ignores names it does not know and prototype keys", () => {
    const { flags } = parseFlags({ ENABLE_ANYTHING: "1", __proto__: "1" } as Record<string, string>);
    assert.deepEqual({ ...flags }, { ...ALL_FLAGS_OFF });
  });

  it("never throws and turns the kill switch ON when the environment cannot be read", () => {
    const hostile = new Proxy({}, { get(): never { throw new Error("boom"); } }) as Record<string, string | undefined>;
    const { flags, issues } = parseFlags(hostile);
    assert.equal(flags.KILL, true);
    assert.equal(issues.length, 1);
    for (const name of WRITE_FLAGS) assert.equal(flags[name], false);
  });
});

describe("flags: the kill switch", () => {
  it("is on for a truthy KILL or XO_KILL_SWITCH", () => {
    assert.equal(parseFlags({ KILL: "1" }).flags.KILL, true);
    assert.equal(parseFlags({ [KILL_ENV_ALIAS]: "true" }).flags.KILL, true);
    assert.equal(parseFlags({ KILL: "0", [KILL_ENV_ALIAS]: "yes" }).flags.KILL, true);
    assert.equal(parseFlags({ KILL: "yes", [KILL_ENV_ALIAS]: "0" }).flags.KILL, true);
  });

  it("is off only when neither variable is truthy or garbage", () => {
    assert.equal(parseFlags({ KILL: "0" }).flags.KILL, false);
    assert.equal(parseFlags({ KILL: "off", [KILL_ENV_ALIAS]: "false" }).flags.KILL, false);
  });

  it("fails closed: an unrecognised KILL value means ON, with an issue", () => {
    for (const word of ["maybe", "2", "zz9", "SUPERSECRET-kill"]) {
      for (const name of ["KILL", KILL_ENV_ALIAS]) {
        const { flags, issues } = parseFlags({ [name]: word });
        assert.equal(flags.KILL, true, `${name}=${word}`);
        assert.equal(issues.length, 1);
        assert.ok(!issues[0]?.message.includes(word));
      }
    }
  });

  it("overrides every other flag in isEnabled", () => {
    for (const name of WRITE_FLAGS) {
      assert.equal(isEnabled(on(name), name), true, name);
      assert.equal(isEnabled({ ...on(name), KILL: true }, name), false, name);
    }
    assert.equal(isEnabled(on("KILL"), "KILL"), true);
    assert.equal(isEnabled(ALL_FLAGS_OFF, "KILL"), false);
  });

  it("overrides every other flag when parsed together", () => {
    const env = Object.fromEntries(WRITE_FLAGS.map((name) => [name, "1"]));
    const { flags } = parseFlags({ ...env, KILL: "1" });
    for (const name of WRITE_FLAGS) assert.equal(isEnabled(flags, name), false, name);
  });
});

describe("flags: requireFlag", () => {
  it("passes only for an enabled flag with the kill switch off", () => {
    for (const name of WRITE_FLAGS) assert.doesNotThrow(() => requireFlag(on(name), name), name);
  });

  it("throws flag_off for a flag that is off, and names it", () => {
    for (const name of WRITE_FLAGS) {
      const error = thrown(() => requireFlag(ALL_FLAGS_OFF, name));
      assert.equal(error.code, "flag_off");
      assert.equal(error.details?.["flag"], name);
      assert.equal(error.httpStatus, 403);
    }
  });

  it("throws kill_switch, not flag_off, when KILL is on, even for an enabled flag", () => {
    for (const name of WRITE_FLAGS) {
      const error = thrown(() => requireFlag({ ...on(name), KILL: true }, name));
      assert.equal(error.code, "kill_switch");
    }
  });

  it("fails closed on a malformed flag object", () => {
    const empty = {} as unknown as Flags;
    assert.equal(thrown(() => requireFlag(empty, "ENABLE_TRADING")).code, "kill_switch");
    const noKill = { ...on("ENABLE_TRADING"), KILL: undefined } as unknown as Flags;
    assert.equal(thrown(() => requireFlag(noKill, "ENABLE_TRADING")).code, "kill_switch");
    const stringy = { ...ALL_FLAGS_OFF, ENABLE_TRADING: "true" } as unknown as Flags;
    assert.equal(thrown(() => requireFlag(stringy, "ENABLE_TRADING")).code, "flag_off");
    const truthy = { ...ALL_FLAGS_OFF, ENABLE_TRADING: 1 } as unknown as Flags;
    assert.equal(thrown(() => requireFlag(truthy, "ENABLE_TRADING")).code, "flag_off");
  });
});

describe("errors", () => {
  it("lists the invariant 7 codes plus the Wave 0 additions, once each", () => {
    const required = [
      "owner_mismatch", "stale_nonce", "expired", "cap_exceeded", "kill_switch", "flag_off", "capability_unknown",
      "upstream_requires_key", "upstream_rejected", "ambiguous", "relay_not_configured", "tripwire", "pending",
    ];
    for (const code of required) assert.ok((ERROR_CODES as readonly string[]).includes(code), code);
    assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length);
  });

  it("maps every code to an HTTP status and nothing else", () => {
    assert.deepEqual(Object.keys(ERROR_HTTP_STATUS).sort(), [...ERROR_CODES].sort());
    for (const status of Object.values(ERROR_HTTP_STATUS)) assert.ok(status >= 200 && status < 600);
    assert.equal(ERROR_HTTP_STATUS.unauthorized, 401);
    assert.equal(ERROR_HTTP_STATUS.not_found, 404);
    assert.equal(ERROR_HTTP_STATUS.pending, 202);
  });

  it("recognises only listed codes", () => {
    assert.equal(isErrorCode("flag_off"), true);
    for (const bad of ["FLAG_OFF", "nope", "", 5, null, undefined, {}, "__proto__", "constructor"]) assert.equal(isErrorCode(bad), false, String(bad));
  });

  it("builds a body with the code and message, and details only when given", () => {
    assert.deepEqual(relayError("expired", "Too late.").toBody(), { code: "expired", message: "Too late." });
    assert.deepEqual(relayError("cap_exceeded", "Over.", { cap: "order" }).toBody(), { code: "cap_exceeded", message: "Over.", details: { cap: "order" } });
  });

  it("cuts an overlong message", () => {
    assert.ok(relayError("internal", "x".repeat(5000)).message.length <= 500);
  });

  it("turns anything that is not a RelayError into a fixed internal body that leaks nothing", () => {
    for (const thing of [new Error("secret SUPERSECRET at /Users/example/key"), "SUPERSECRET", { code: "flag_off", message: "SUPERSECRET" }, null, undefined]) {
      const body = toRelayErrorBody(thing);
      assert.equal(body.code, "internal");
      assert.ok(!JSON.stringify(body).includes("SUPERSECRET"));
    }
    assert.equal(toRelayErrorBody(relayError("tripwire", "Frozen.")).code, "tripwire");
  });
});
