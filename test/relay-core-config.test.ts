import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";

import { Secret } from "../src/config.js";
import {
  assertStartable,
  CREATION_SEED_CAP_ATOMIC,
  DEFAULT_RELAY_PORT,
  describeConfig,
  FUNDING_DAILY_CAP_ATOMIC,
  FUNDING_TEST_CAP_ATOMIC,
  loadRelayConfig,
  needService,
  RELAY_ENV,
  RelayConfigError,
  resolveMasterSecret,
  type MasterSecretPrompt,
} from "../relay/config.js";
import { main } from "../relay/main.js";
import { RelayError } from "../src/relay/errors.js";
import { ALL_FLAGS_OFF } from "../src/relay/flags.js";
import { rawRequest, tempDir, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, TEST_RELAY_KEY_NEXT, type TempDir } from "./relay-core-helpers.js";

// Relay configuration: what is required, what is refused, what is clamped, and what is never printed.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dirs: TempDir[] = [];
after(async () => {
  for (const made of dirs) await made.cleanup();
});

const GOOD = { RELAY_DATA_DIR: "state-dir", XO_RELAY_KEY: TEST_RELAY_KEY };

function messages(env: Record<string, string>): string {
  return loadRelayConfig(env)
    .issues.map((issue) => `${issue.variable}: ${issue.message}`)
    .join("\n");
}

describe("defaults and what is required", () => {
  it("refuses to start without a data directory and without a relay key, naming both", () => {
    const loaded = loadRelayConfig({});
    assert.deepEqual(
      loaded.fatal.map((issue) => issue.variable).sort(),
      [RELAY_ENV.dataDir, RELAY_ENV.relayKey].sort(),
    );
    assert.throws(() => assertStartable(loaded, true), (error: unknown) => error instanceof RelayConfigError && error.issues.length === 2);
  });

  it("has safe defaults: loopback, every write flag off, credential store on, $10 / $50 / $10.80, no creation cadence cap", () => {
    const { config, fatal } = loadRelayConfig(GOOD);
    assert.equal(fatal.length, 0);
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, DEFAULT_RELAY_PORT);
    assert.equal(config.credentialStore, true);
    assert.deepEqual({ ...config.flags }, { ...ALL_FLAGS_OFF });
    assert.equal(config.limits.maxOrderAtomic, 10_000_000n);
    assert.equal(config.limits.maxDailyAtomic, 50_000_000n);
    assert.equal(config.limits.seedCapAtomic, 10_800_000n);
    assert.equal(config.limits.fundingTestCapAtomic, 10_000_000n);
    assert.equal(config.limits.fundingDailyCapAtomic, 50_000_000n);
    assert.equal(config.enforceFlagFacts, true);
    assert.equal(config.alertHookEnabled, false);
    assert.equal(config.armedFlags.length, 0);
    assert.equal(config.keys.next, undefined);
    assert.equal("maxCreatesPerDay" in config.limits, false);
    assert.equal(Object.keys(config.guardrails).some((key) => /creat.*day|perday/i.test(key)), false);
  });

  it("has no setting for the bind host: it is always 127.0.0.1", () => {
    for (const name of ["RELAY_HOST", "RELAY_BIND", "RELAY_BIND_HOST", "HOST"]) {
      const { config } = loadRelayConfig({ ...GOOD, [name]: "0.0.0.0" });
      assert.equal(config.host, "127.0.0.1");
    }
  });

  it("checks the port: 0 (a free one) and 65535 pass; anything else is fatal", () => {
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_PORT: "0" }).config.port, 0);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_PORT: "65535" }).config.port, 65535);
    for (const bad of ["65536", "-1", "abc", "08", "1.5", "99999999", "0x50"]) {
      assert.deepEqual(loadRelayConfig({ ...GOOD, RELAY_PORT: bad }).fatal.map((issue) => issue.variable), [RELAY_ENV.port], bad);
    }
  });

  it("refuses a data directory with control characters or an absurd length, and has no default for it", () => {
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_DATA_DIR: "a\nb" }).fatal.length, 1);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_DATA_DIR: "x".repeat(2000) }).fatal.length, 1);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_DATA_DIR: "  " }).config.dataDir, undefined);
  });
});

describe("the relay keys", () => {
  it("accepts a current key and an optional second key during rotation, held as Secrets", () => {
    const { config, fatal } = loadRelayConfig({ ...GOOD, XO_RELAY_KEY_NEXT: TEST_RELAY_KEY_NEXT });
    assert.equal(fatal.length, 0);
    assert.ok(config.keys.current instanceof Secret && config.keys.next instanceof Secret);
    for (const secret of [config.keys.current, config.keys.next]) {
      for (const text of [String(secret), JSON.stringify({ secret }), inspect(secret), inspect(config, { depth: 6 }), JSON.stringify(config, (_k, v) => (typeof v === "bigint" ? v.toString() : v))]) {
        assert.equal(text.includes(TEST_RELAY_KEY), false);
        assert.equal(text.includes(TEST_RELAY_KEY_NEXT), false);
      }
    }
  });

  it("refuses a key that is too short, too long, or not header-safe, without repeating it", () => {
    for (const bad of ["short", "x".repeat(300), "has space in it 123456", "new\nline-0123456789abc", "quote\"in-the-key-0123456"]) {
      const loaded = loadRelayConfig({ ...GOOD, XO_RELAY_KEY: bad });
      assert.deepEqual(loaded.fatal.map((issue) => issue.variable), [RELAY_ENV.relayKey], bad);
      assert.equal(JSON.stringify(loaded.issues).includes(bad.trim()), bad.trim() === "", bad);
    }
  });

  it("refuses a next key that equals the current one or is malformed", () => {
    assert.deepEqual(loadRelayConfig({ ...GOOD, XO_RELAY_KEY_NEXT: TEST_RELAY_KEY }).fatal.map((issue) => issue.variable), [RELAY_ENV.relayKeyNext]);
    assert.deepEqual(loadRelayConfig({ ...GOOD, XO_RELAY_KEY_NEXT: "tiny" }).fatal.map((issue) => issue.variable), [RELAY_ENV.relayKeyNext]);
  });

  it("never puts a value into an issue message", () => {
    const text = messages({
      ...GOOD,
      XO_RELAY_KEY: "KEY-CANARY-too short",
      XO_RELAY_KEY_NEXT: "NEXT-CANARY-too short",
      RELAY_PORT: "PORT-CANARY",
      RELAY_SEED_CAP_USD: "SEED-CANARY",
      RELAY_BASE_RPC_URL: "http://rpc.example/RPC-CANARY",
      RELAY_SELF_HOST: "ftp://self-CANARY.example/",
      RELAY_ALERT_COMMAND: "relative/ALERT-CANARY",
      XO_MAX_ORDER_USD: "ORDER-CANARY",
      KILL: "KILL-CANARY",
      RELAY_ARM: "ARM-CANARY",
      RELAY_ENFORCE_FLAG_FACTS: "ENFORCE-CANARY",
    });
    assert.ok(text.length > 0);
    assert.equal(/CANARY/.test(text), false, text);
  });
});

describe("caps", () => {
  it("lets the environment lower the relay-only caps and never raise them above the compiled-in value", () => {
    const lower = loadRelayConfig({ ...GOOD, RELAY_SEED_CAP_USD: "5", RELAY_FUNDING_TEST_CAP_USD: "2.5", RELAY_FUNDING_DAILY_CAP_USD: "20" }).config.limits;
    assert.equal(lower.seedCapAtomic, 5_000_000n);
    assert.equal(lower.fundingTestCapAtomic, 2_500_000n);
    assert.equal(lower.fundingDailyCapAtomic, 20_000_000n);
    const higher = loadRelayConfig({ ...GOOD, RELAY_SEED_CAP_USD: "500", RELAY_FUNDING_TEST_CAP_USD: "500", RELAY_FUNDING_DAILY_CAP_USD: "5000" });
    assert.equal(higher.config.limits.seedCapAtomic, CREATION_SEED_CAP_ATOMIC);
    assert.equal(higher.config.limits.fundingTestCapAtomic, FUNDING_TEST_CAP_ATOMIC);
    assert.equal(higher.config.limits.fundingDailyCapAtomic, FUNDING_DAILY_CAP_ATOMIC);
    assert.equal(higher.issues.filter((issue) => /ceiling/.test(issue.message)).length, 3);
    const garbage = loadRelayConfig({ ...GOOD, RELAY_SEED_CAP_USD: "ten dollars", RELAY_FUNDING_TEST_CAP_USD: "-5", RELAY_FUNDING_DAILY_CAP_USD: "1e3" }).config.limits;
    assert.equal(garbage.seedCapAtomic, CREATION_SEED_CAP_ATOMIC);
    assert.equal(garbage.fundingTestCapAtomic, FUNDING_TEST_CAP_ATOMIC);
    assert.equal(garbage.fundingDailyCapAtomic, FUNDING_DAILY_CAP_ATOMIC);
  });

  it("reuses the plugin's order and day caps, with their ceilings", () => {
    assert.equal(loadRelayConfig({ ...GOOD, XO_MAX_ORDER_USD: "3", XO_MAX_DAILY_USD: "20" }).config.limits.maxOrderAtomic, 3_000_000n);
    assert.equal(loadRelayConfig({ ...GOOD, XO_MAX_ORDER_USD: "3", XO_MAX_DAILY_USD: "20" }).config.limits.maxDailyAtomic, 20_000_000n);
    assert.equal(loadRelayConfig({ ...GOOD, XO_MAX_ORDER_USD: "100000", XO_MAX_DAILY_USD: "100000" }).config.limits.maxDailyAtomic, 500_000_000n);
    // A single order can never exceed the day.
    assert.equal(loadRelayConfig({ ...GOOD, XO_MAX_ORDER_USD: "80", XO_MAX_DAILY_USD: "20" }).config.limits.maxOrderAtomic, 20_000_000n);
  });
});

describe("flags and the gate settings", () => {
  it("reads the write flags from the environment, all off unless a recognised word says on", () => {
    const { config } = loadRelayConfig({ ...GOOD, ENABLE_TRADING: "1", ENABLE_FUNDING: "yes", ENABLE_WITHDRAW: "maybe", XO_ENABLE_CREATE: "0" });
    assert.equal(config.flags.ENABLE_TRADING, true);
    assert.equal(config.flags.ENABLE_FUNDING, true);
    assert.equal(config.flags.ENABLE_WITHDRAW, false);
    assert.equal(config.flags.XO_ENABLE_CREATE, false);
    assert.equal(config.flags.KILL, false);
  });

  it("turns the kill switch on from either variable, and from garbage", () => {
    assert.equal(loadRelayConfig({ ...GOOD, KILL: "1" }).config.flags.KILL, true);
    assert.equal(loadRelayConfig({ ...GOOD, XO_KILL_SWITCH: "on" }).config.flags.KILL, true);
    assert.equal(loadRelayConfig({ ...GOOD, KILL: "banana" }).config.flags.KILL, true);
  });

  it("reads the armed flags, ignoring KILL and unknown names", () => {
    const { config, issues } = loadRelayConfig({ ...GOOD, RELAY_ARM: "ENABLE_USEROP_SUBMIT, ENABLE_TRADING ,KILL,ENABLE_NOTHING,ENABLE_TRADING" });
    assert.deepEqual([...config.armedFlags], ["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING"]);
    assert.equal(issues.filter((issue) => issue.variable === RELAY_ENV.arm).length, 2);
  });

  it("enforces the flag prerequisites unless switched off with an explicit word", () => {
    assert.equal(loadRelayConfig(GOOD).config.enforceFlagFacts, true);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_ENFORCE_FLAG_FACTS: "0" }).config.enforceFlagFacts, false);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_ENFORCE_FLAG_FACTS: "garbage" }).config.enforceFlagFacts, true);
  });

  it("reads acknowledged tripwires as slugs only", () => {
    const { config } = loadRelayConfig({ ...GOOD, RELAY_ACK_TRIPWIRES: "exchange_upgraded, bad id,Fee_Ceiling,fee_ceiling_changed" });
    assert.deepEqual([...config.acknowledgedTripwires], ["exchange_upgraded", "fee_ceiling_changed"]);
  });
});

describe("upstream extras and the alert hook", () => {
  it("accepts an https Base RPC URL (held as a Secret) and a declared self-host", () => {
    const { config } = loadRelayConfig({ ...GOOD, RELAY_BASE_RPC_URL: "https://base-rpc.example.org/v2/PATH-KEY-123", RELAY_SELF_HOST: "https://creator.example.org/meta" });
    assert.ok(config.baseRpcUrl instanceof Secret);
    assert.equal(String(config.baseRpcUrl), "[redacted]");
    assert.equal(config.baseRpcUrl?.reveal(), "https://base-rpc.example.org/v2/PATH-KEY-123");
    assert.equal(config.selfHostUrl, "https://creator.example.org/meta/");
  });

  it("ignores URLs that are not https to a named host, with no user info", () => {
    for (const bad of ["http://rpc.example.org/", "https://127.0.0.1/", "https://localhost/", "https://[::1]/", "https://user:pw@rpc.example.org/", "https://internal/", "https://box.local/", "ftp://rpc.example.org/", "not a url", "https://rpc.example.org/a b"]) {
      const { config, fatal } = loadRelayConfig({ ...GOOD, RELAY_BASE_RPC_URL: bad, RELAY_SELF_HOST: bad });
      assert.equal(config.baseRpcUrl, undefined, bad);
      assert.equal(config.selfHostUrl, undefined, bad);
      assert.equal(fatal.length, 0);
    }
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_SELF_HOST: "https://a.example.org/x?token=1" }).config.selfHostUrl, undefined);
  });

  it("keeps the alert hook off unless it is both switched on and given an absolute command", () => {
    assert.equal(loadRelayConfig(GOOD).config.alertHookEnabled, false);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_ALERT_COMMAND: "/usr/bin/true" }).config.alertHookEnabled, false);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_ALERT_HOOK: "1" }).config.alertHookEnabled, false);
    assert.equal(loadRelayConfig({ ...GOOD, RELAY_ALERT_HOOK: "1", RELAY_ALERT_COMMAND: "relative/path" }).config.alertHookEnabled, false);
    const on = loadRelayConfig({ ...GOOD, RELAY_ALERT_HOOK: "1", RELAY_ALERT_COMMAND: "/usr/bin/true" }).config;
    assert.equal(on.alertHookEnabled, true);
    assert.equal(on.alertCommand, "/usr/bin/true");
  });
});

describe("the master secret", () => {
  const keys = [new Secret(TEST_RELAY_KEY)];
  const tty = (answers: string[], isTTY = true): MasterSecretPrompt & { asked: string[] } => {
    const asked: string[] = [];
    return {
      asked,
      isTTY: () => isTTY,
      prompt: async (message) => {
        asked.push(message);
        return answers.shift() ?? "";
      },
    };
  };

  it("takes it from the environment and never prompts when it is there", async () => {
    const prompt = tty([]);
    const result = await resolveMasterSecret({ RELAY_MASTER_KEY: `${TEST_MASTER_SECRET}\n` }, keys, prompt);
    assert.ok(result.ok);
    assert.equal(result.secret.reveal(), TEST_MASTER_SECRET, "a trailing newline is dropped");
    assert.equal(result.source, "env");
    assert.equal(prompt.asked.length, 0);
    assert.equal(String(result.secret), "[redacted]");
  });

  it("asks on a terminal when the environment has none, and asks twice when the secret is being chosen", async () => {
    const once = tty([TEST_MASTER_SECRET]);
    const first = await resolveMasterSecret({}, keys, once);
    assert.ok(first.ok && first.source === "prompt");
    assert.equal(once.asked.length, 1);
    const twice = tty([TEST_MASTER_SECRET, TEST_MASTER_SECRET]);
    assert.ok((await resolveMasterSecret({}, keys, twice, true)).ok);
    assert.equal(twice.asked.length, 2);
    const mismatch = await resolveMasterSecret({}, keys, tty([TEST_MASTER_SECRET, `${TEST_MASTER_SECRET}x`]), true);
    assert.deepEqual(mismatch.ok ? undefined : mismatch.code, "mismatch");
  });

  it("does not prompt without a terminal, unless told to", async () => {
    const quiet = tty([TEST_MASTER_SECRET], false);
    const refused = await resolveMasterSecret({}, keys, quiet);
    assert.deepEqual(refused.ok ? undefined : refused.code, "missing");
    assert.equal(quiet.asked.length, 0);
    const forced = await resolveMasterSecret({ RELAY_MASTER_KEY_PROMPT: "1" }, keys, tty([TEST_MASTER_SECRET], false));
    assert.ok(forced.ok);
    assert.equal((await resolveMasterSecret({}, keys, undefined)).ok, false);
  });

  it("refuses a short or oversize secret, and one that is the same as a relay key", async () => {
    const short = await resolveMasterSecret({ RELAY_MASTER_KEY: "short" }, keys);
    assert.deepEqual(short.ok ? undefined : short.code, "too_short");
    const long = await resolveMasterSecret({ RELAY_MASTER_KEY: "x".repeat(2000) }, keys);
    assert.deepEqual(long.ok ? undefined : long.code, "too_long");
    const same = await resolveMasterSecret({ RELAY_MASTER_KEY: TEST_RELAY_KEY }, keys);
    assert.deepEqual(same.ok ? undefined : same.code, "same_as_relay_key");
    for (const result of [short, long, same]) assert.equal(JSON.stringify(result).includes(TEST_RELAY_KEY), false);
  });

  it("is required to start when the credential store is on, and not when it is off", () => {
    const loaded = loadRelayConfig(GOOD);
    assert.throws(() => assertStartable(loaded, false), (error: unknown) => error instanceof RelayConfigError && error.issues.some((issue) => issue.variable === RELAY_ENV.masterKey));
    assert.doesNotThrow(() => assertStartable(loaded, true));
    assert.doesNotThrow(() => assertStartable(loadRelayConfig({ ...GOOD, RELAY_CREDENTIAL_STORE: "off" }), false));
  });

  it("is never read from a file: config.ts and main.ts import no file-reading function", () => {
    for (const name of ["config.ts", "main.ts"]) {
      const text = readFileSync(join(ROOT, "relay", name), "utf8").replace(/\/\/.*$/gm, "");
      assert.equal(/\breadFile(?:Sync)?\b/.test(text), false, `${name} reads a file`);
      assert.equal(/from "node:fs"/.test(text), false, `${name} imports node:fs`);
      assert.equal(/_FILE\b/.test(text), false, `${name} has a *_FILE variable`);
    }
  });
});

describe("what is printed", () => {
  it("describes the configuration without a key, a URL, a path or a secret", () => {
    const { config } = loadRelayConfig({
      ...GOOD,
      RELAY_DATA_DIR: "/some/private/DIR-CANARY",
      XO_RELAY_KEY_NEXT: TEST_RELAY_KEY_NEXT,
      RELAY_BASE_RPC_URL: "https://base-rpc.example.org/v2/PATH-KEY-123",
      RELAY_SELF_HOST: "https://creator.example.org/meta",
      RELAY_ALERT_HOOK: "1",
      RELAY_ALERT_COMMAND: "/opt/CMD-CANARY/notify",
      ENABLE_TRADING: "1",
      RELAY_ARM: "ENABLE_TRADING",
    });
    const text = describeConfig(config, { ...config.flags, ENABLE_TRADING: true }).join("\n");
    for (const canary of [TEST_RELAY_KEY, TEST_RELAY_KEY_NEXT, "DIR-CANARY", "PATH-KEY-123", "creator.example.org", "CMD-CANARY"]) {
      assert.equal(text.includes(canary), false, canary);
    }
    assert.match(text, /bind: 127\.0\.0\.1/);
    assert.match(text, /relay keys: 2 accepted \(rotation in progress\)/);
    assert.match(text, /flag ENABLE_TRADING: env on, effective on, armed/);
    assert.match(text, /flag ENABLE_FUNDING: env off, effective off/);
    assert.match(text, /order \$10\.00, day \$50\.00, seed \$10\.80, funding total \$10\.00, funding day \$50\.00/);
    assert.match(text, /alert hook: on/);
  });
});

describe("needService", () => {
  it("returns a wired service and fails with `internal` for a missing one", () => {
    const context = { flags: () => ALL_FLAGS_OFF, now: () => 0, requestId: "r", signal: new AbortController().signal, services: { config: loadRelayConfig(GOOD).config } };
    assert.ok(needService(context, "config"));
    assert.throws(() => needService(context, "ledger"), (error: unknown) => error instanceof RelayError && error.code === "internal");
  });
});

describe("main()", () => {
  function sink(): { text: string; write(chunk: string): void } {
    const out = { text: "", write(chunk: string) { out.text += chunk; } };
    return out;
  }

  it("prints usage for --help and exits 0", async () => {
    const out = sink();
    assert.equal(await main(["--help"], {}, { stdout: out }), 0);
    assert.match(out.text, /RELAY_DATA_DIR/);
    assert.match(out.text, /Nothing here prints a secret/);
  });

  it("exits 2 and names the missing variables, without values", async () => {
    const err = sink();
    assert.equal(await main([], { RELAY_PORT: "VALUE-CANARY" }, { stderr: err, stdout: sink() }), 2);
    assert.match(err.text, /RELAY_DATA_DIR/);
    assert.match(err.text, /XO_RELAY_KEY/);
    assert.equal(err.text.includes("VALUE-CANARY"), false);
  });

  it("exits 2 when the credential store is on and there is no master secret and no terminal", async () => {
    const err = sink();
    const code = await main([], GOOD, { stderr: err, stdout: sink(), prompt: { isTTY: () => false, prompt: async () => "" } });
    assert.equal(code, 2);
    assert.match(err.text, /RELAY_MASTER_KEY/);
  });

  it("--check validates and prints, and starts nothing", async () => {
    const out = sink();
    const code = await main(["--check"], { ...GOOD, RELAY_MASTER_KEY: TEST_MASTER_SECRET }, { stdout: out, stderr: sink() });
    assert.equal(code, 0);
    assert.match(out.text, /configuration is valid/);
    for (const canary of [TEST_RELAY_KEY, TEST_MASTER_SECRET]) assert.equal(out.text.includes(canary), false);
  });

  it("starts, serves on a free loopback port, prints the address and flag state, and stops on request", async () => {
    const made = await tempDir();
    dirs.push(made);
    const out = sink();
    const err = sink();
    let stop!: () => void;
    const stopSignal = new Promise<void>((resolve) => (stop = resolve));
    let port = 0;
    const done = main([], { RELAY_DATA_DIR: made.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", RELAY_MASTER_KEY: TEST_MASTER_SECRET, ENABLE_TRADING: "1" }, {
      stdout: out,
      stderr: err,
      stopSignal,
      createOptions: { kdf: TEST_KDF, allowWeakKdf: true },
      onStarted: (relay) => {
        port = relay.port;
      },
    });
    for (let index = 0; index < 200 && port === 0; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(port > 0, "the relay did not start");
    const health = await rawRequest({ port, headers: { "x-relay-key": TEST_RELAY_KEY } });
    assert.equal(health.status, 200);
    stop();
    assert.equal(await done, 0);
    assert.match(out.text, new RegExp(`xo relay listening on http://127\\.0\\.0\\.1:${port}`));
    assert.match(out.text, /flag ENABLE_TRADING: env on, effective off/, "on in the environment, but its prerequisites are missing");
    assert.match(out.text, /kill switch: off/);
    for (const canary of [TEST_RELAY_KEY, TEST_MASTER_SECRET]) {
      assert.equal(out.text.includes(canary), false);
      assert.equal(err.text.includes(canary), false);
    }
  });

  it("reports a start-up failure (a second relay on the same directory) with a fixed message that holds no value or path", async () => {
    const made = await tempDir();
    dirs.push(made);
    const env = { RELAY_DATA_DIR: made.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_MASTER_KEY: TEST_MASTER_SECRET, RELAY_PORT: "0" };
    let stop!: () => void;
    let started = false;
    const first = main([], env, {
      stdout: sink(),
      stderr: sink(),
      stopSignal: new Promise<void>((resolve) => (stop = resolve)),
      createOptions: { kdf: TEST_KDF, allowWeakKdf: true },
      onStarted: () => {
        started = true;
      },
    });
    for (let index = 0; index < 200 && !started; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(started);
    const err = sink();
    const code = await main([], env, { stdout: sink(), stderr: err, createOptions: { kdf: TEST_KDF, allowWeakKdf: true }, stopSignal: Promise.resolve() });
    assert.equal(code, 1);
    assert.match(err.text, /the relay could not start \(locked\)/);
    for (const canary of [made.dir, TEST_RELAY_KEY, TEST_MASTER_SECRET]) assert.equal(err.text.includes(canary), false);
    stop();
    assert.equal(await first, 0);
  });
});
