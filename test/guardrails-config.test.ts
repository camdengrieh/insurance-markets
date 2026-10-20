import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";

import { CEILINGS, DEFAULTS, ENV, FLOORS, Secret, loadConfig, relayEndpoint } from "../src/config.js";
import { createAuditWriter } from "../src/guardrails/audit.js";
import { handleValidateMarketDraft } from "../src/tools/draft.js";

const issueFor = (env: Record<string, string>, variable: string) =>
  loadConfig(env).issues.find((issue) => issue.variable === variable);

describe("loadConfig: defaults", () => {
  it("never throws on an empty environment and returns the author's defaults", () => {
    const { config, issues } = loadConfig({});
    assert.deepEqual(issues, []);
    assert.equal(config.maxOrderAtomic, 10_000_000n);
    assert.equal(config.maxDailyAtomic, 50_000_000n);
    assert.equal(config.killSwitch, false);
    assert.equal(config.createEnabled, false);
    assert.deepEqual({ ...config }, { ...DEFAULTS });
  });

  it("does not throw when reading the real process environment", () => {
    assert.doesNotThrow(() => loadConfig());
  });

  it("treats blank values as unset without reporting them", () => {
    const { config, issues } = loadConfig({ [ENV.maxOrderUsd]: "   ", [ENV.killSwitch]: "" });
    assert.equal(config.maxOrderAtomic, DEFAULTS.maxOrderAtomic);
    assert.deepEqual(issues, []);
  });

  it("returns a frozen config", () => {
    const { config } = loadConfig({});
    assert.throws(() => {
      (config as { maxOrderAtomic: bigint }).maxOrderAtomic = 1n;
    });
  });
});

describe("loadConfig: valid overrides", () => {
  it("reads decimal USD caps exactly and counts", () => {
    const { config, issues } = loadConfig({
      [ENV.maxOrderUsd]: "25.5",
      [ENV.maxDailyUsd]: "200",
      [ENV.priceBandTicks]: "20",
      [ENV.quoteTtlSeconds]: "60",
      [ENV.orderExpirySeconds]: "300",
    });
    assert.deepEqual(issues, []);
    assert.equal(config.maxOrderAtomic, 25_500_000n);
    assert.equal(config.maxDailyAtomic, 200_000_000n);
    assert.equal(config.priceBandTicks, 20);
    assert.equal(config.quoteTtlSeconds, 60);
    assert.equal(config.orderExpirySeconds, 300);
  });

  it("accepts zero as a cap that disables the action", () => {
    const { config, issues } = loadConfig({ [ENV.maxOrderUsd]: "0" });
    assert.deepEqual(issues, []);
    assert.equal(config.maxOrderAtomic, 0n);
  });
});

describe("loadConfig: absurd and tampered values", () => {
  const absurd = [
    "1e18", "1E3", "Infinity", "-Infinity", "NaN", "-5", "+5", "0x64", "0b11", "1,000", "1_000", ".5", "5.",
    "010", "10 USD", "$10", "10;rm -rf", "10\n20", "1.0000001", "9".repeat(80), "null", "undefined",
    "\u{ff11}\u{ff10}", "true",
  ];

  it("falls back to the default and reports every malformed cap", () => {
    for (const value of absurd) {
      for (const variable of [ENV.maxOrderUsd, ENV.maxDailyUsd]) {
        const { config, issues } = loadConfig({ [variable]: value });
        assert.equal(config.maxOrderAtomic, DEFAULTS.maxOrderAtomic, `${variable}=${value}`);
        assert.equal(config.maxDailyAtomic, DEFAULTS.maxDailyAtomic, `${variable}=${value}`);
        assert.equal(issues[0]?.kind, "invalid", `${variable}=${value}`);
        assert.equal(issues[0]?.variable, variable);
      }
    }
  });

  it("falls back to the default and reports every malformed count or duration", () => {
    for (const value of absurd) {
      for (const variable of [ENV.priceBandTicks, ENV.quoteTtlSeconds, ENV.orderExpirySeconds]) {
        const { config, issues } = loadConfig({ [variable]: value });
        assert.equal(config.priceBandTicks, DEFAULTS.priceBandTicks, `${variable}=${value}`);
        assert.equal(config.quoteTtlSeconds, DEFAULTS.quoteTtlSeconds, `${variable}=${value}`);
        assert.equal(config.orderExpirySeconds, DEFAULTS.orderExpirySeconds, `${variable}=${value}`);
        assert.equal(issues[0]?.kind, "invalid", `${variable}=${value}`);
      }
    }
  });

  it("clamps a huge but well-formed value to the compiled-in ceiling", () => {
    const { config, issues } = loadConfig({
      [ENV.maxOrderUsd]: "999999999",
      [ENV.maxDailyUsd]: "999999999",
      [ENV.priceBandTicks]: "999",
      [ENV.quoteTtlSeconds]: "86400",
      [ENV.orderExpirySeconds]: "999999",
    });
    assert.equal(config.maxOrderAtomic, CEILINGS.maxOrderAtomic);
    assert.equal(config.maxDailyAtomic, CEILINGS.maxDailyAtomic);
    assert.equal(config.priceBandTicks, CEILINGS.priceBandTicks);
    assert.equal(config.quoteTtlSeconds, CEILINGS.quoteTtlSeconds);
    assert.equal(config.orderExpirySeconds, CEILINGS.orderExpirySeconds);
    assert.equal(issues.length, 5);
    assert.ok(issues.every((issue) => issue.kind === "clamped_to_ceiling"));
  });

  it("can never produce a value above a ceiling, whatever the input", () => {
    const attempts = ["100", "100.000001", "101", "500", "1000", "99999999999", ...absurd];
    for (const value of attempts) {
      const { config } = loadConfig({
        [ENV.maxOrderUsd]: value,
        [ENV.maxDailyUsd]: value,
        [ENV.priceBandTicks]: value,
        [ENV.quoteTtlSeconds]: value,
        [ENV.orderExpirySeconds]: value,
      });
      assert.ok(config.maxOrderAtomic <= CEILINGS.maxOrderAtomic, value);
      assert.ok(config.maxDailyAtomic <= CEILINGS.maxDailyAtomic, value);
      assert.ok(config.priceBandTicks <= CEILINGS.priceBandTicks, value);
      assert.ok(config.quoteTtlSeconds <= CEILINGS.quoteTtlSeconds, value);
      assert.ok(config.orderExpirySeconds <= CEILINGS.orderExpirySeconds, value);
    }
  });

  it("treats a duration below its floor as invalid, not as a tighter policy", () => {
    assert.equal(loadConfig({ [ENV.quoteTtlSeconds]: "1" }).config.quoteTtlSeconds, DEFAULTS.quoteTtlSeconds);
    assert.equal(
      loadConfig({ [ENV.orderExpirySeconds]: "0" }).config.orderExpirySeconds,
      DEFAULTS.orderExpirySeconds,
    );
    assert.equal(loadConfig({ [ENV.priceBandTicks]: "0" }).config.priceBandTicks, DEFAULTS.priceBandTicks);
    assert.ok(FLOORS.orderExpirySeconds > 0);
  });

  it("keeps a single order from exceeding the daily cap", () => {
    const { config, issues } = loadConfig({ [ENV.maxOrderUsd]: "80", [ENV.maxDailyUsd]: "30" });
    assert.equal(config.maxDailyAtomic, 30_000_000n);
    assert.equal(config.maxOrderAtomic, 30_000_000n);
    assert.equal(issues.find((i) => i.variable === ENV.maxOrderUsd)?.kind, "clamped_to_daily_cap");
  });

  it("lowers an order cap to a tampered tiny daily cap", () => {
    const { config } = loadConfig({ [ENV.maxDailyUsd]: "1" });
    assert.equal(config.maxOrderAtomic, 1_000_000n);
  });

  it("never echoes the raw value into an issue message", () => {
    const secret = "sk_live_SUPERSECRETVALUE_123";
    for (const variable of Object.values(ENV)) {
      for (const issue of loadConfig({ [variable]: secret }).issues) {
        assert.ok(!issue.message.includes("SUPERSECRET"), `${variable}: ${issue.message}`);
      }
    }
  });

  it("ignores values that are not strings", () => {
    const env = { [ENV.maxOrderUsd]: 5 as unknown as string, [ENV.killSwitch]: true as unknown as string };
    const { config, issues } = loadConfig(env);
    assert.equal(config.maxOrderAtomic, DEFAULTS.maxOrderAtomic);
    assert.equal(config.killSwitch, false);
    assert.deepEqual(issues, []);
  });
});

describe("loadConfig: kill switch and creation switch", () => {
  it("is off when unset or explicitly falsy", () => {
    for (const value of ["0", "false", "FALSE", " no ", "Off"]) {
      const { config, issues } = loadConfig({ [ENV.killSwitch]: value });
      assert.equal(config.killSwitch, false, value);
      assert.deepEqual(issues, []);
    }
  });

  it("is on for any truthy value, including unrecognised words", () => {
    for (const value of ["1", "true", "YES", "on", "maybe", "disabled", "2", "x"]) {
      assert.equal(loadConfig({ [ENV.killSwitch]: value }).config.killSwitch, true, value);
    }
    assert.equal(issueFor({ [ENV.killSwitch]: "maybe" }, ENV.killSwitch)?.kind, "unrecognised_flag");
    assert.equal(issueFor({ [ENV.killSwitch]: "true" }, ENV.killSwitch), undefined);
  });

  it("keeps creation off unless explicitly enabled", () => {
    assert.equal(loadConfig({}).config.createEnabled, false);
    assert.equal(loadConfig({ [ENV.enableCreate]: "true" }).config.createEnabled, true);
    assert.equal(loadConfig({ [ENV.enableCreate]: "1" }).config.createEnabled, true);
    for (const value of ["maybe", "2", "enabled", "0", "false"]) {
      assert.equal(loadConfig({ [ENV.enableCreate]: value }).config.createEnabled, false, value);
    }
    assert.equal(issueFor({ [ENV.enableCreate]: "maybe" }, ENV.enableCreate)?.kind, "unrecognised_flag");
  });

  it("fails closed with the kill switch ON if the environment cannot be read", () => {
    const hostile = new Proxy(
      {},
      {
        get(): never {
          throw new Error("boom");
        },
      },
    ) as Record<string, string | undefined>;
    const { config, issues } = loadConfig(hostile);
    assert.equal(config.killSwitch, true);
    assert.equal(config.maxOrderAtomic, DEFAULTS.maxOrderAtomic);
    assert.equal(issues.length, 1);
  });
});

describe("loadConfig: the creation cadence cap is gone", () => {
  it("has no variable, default or ceiling for it", () => {
    assert.ok(!Object.values(ENV).includes("XO_MAX_CREATES_PER_DAY" as never));
    assert.equal(Object.keys(ENV).some((key) => /create/i.test(key) && /max|per/i.test(key)), false);
    assert.equal("maxCreatesPerDay" in DEFAULTS, false);
    assert.equal("maxCreatesPerDay" in CEILINGS, false);
  });

  it("ignores the old variable completely: no effect and no issue", () => {
    for (const value of ["0", "2", "99", "garbage"]) {
      const { config, issues } = loadConfig({ XO_MAX_CREATES_PER_DAY: value });
      assert.deepEqual(issues, [], value);
      assert.deepEqual({ ...config }, { ...DEFAULTS }, value);
    }
  });

  it("keeps the $10 per order and $50 per day defaults and creation off", () => {
    const { config } = loadConfig({});
    assert.equal(config.maxOrderAtomic, 10_000_000n);
    assert.equal(config.maxDailyAtomic, 50_000_000n);
    assert.equal(config.createEnabled, false);
  });

  it("leaves the optional relay fields absent by default", () => {
    const { config } = loadConfig({});
    assert.equal("relayUrl" in config, false);
    assert.equal("relayKey" in config, false);
    assert.equal(relayEndpoint(config), undefined);
  });
});

describe("loadConfig: XO_RELAY_URL", () => {
  const urlOf = (value: string) => loadConfig({ [ENV.relayUrl]: value });

  it("accepts https and normalises away a trailing slash", () => {
    assert.equal(urlOf("https://relay.example.com").config.relayUrl, "https://relay.example.com");
    assert.equal(urlOf("https://relay.example.com/").config.relayUrl, "https://relay.example.com");
    assert.equal(urlOf("https://relay.example.com:8443/api/").config.relayUrl, "https://relay.example.com:8443/api");
    assert.deepEqual(urlOf("https://relay.example.com").issues, []);
  });

  it("accepts http only for 127.0.0.1 and localhost", () => {
    assert.equal(urlOf("http://127.0.0.1:8787").config.relayUrl, "http://127.0.0.1:8787");
    assert.equal(urlOf("http://localhost:8787/").config.relayUrl, "http://localhost:8787");
    assert.equal(urlOf("HTTP://LOCALHOST:9").config.relayUrl, "http://localhost:9");
    assert.deepEqual(urlOf("http://127.0.0.1:8787").issues, []);
  });

  it("refuses plain http to any other host, and treats the relay as unset with an issue", () => {
    for (const value of [
      "http://relay.example.com",
      "http://127.0.0.2:8787",
      "http://localhost.evil.example",
      "http://127.0.0.1.evil.example",
      "http://[::1]:8787",
      "http://0.0.0.0:8787",
      "http://localhost.:8787",
      "http://evil.example@127.0.0.1",
      "http://127.0.0.1@evil.example",
    ]) {
      const { config, issues } = urlOf(value);
      assert.equal("relayUrl" in config, false, value);
      assert.equal(issues.find((i) => i.variable === ENV.relayUrl)?.kind, "invalid", value);
    }
  });

  it("refuses other schemes, credentials, queries, fragments, spaces and junk", () => {
    for (const value of [
      "ftp://relay.example.com",
      "ws://127.0.0.1:1",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://user:pass@relay.example.com",
      "https://user@relay.example.com",
      "https://relay.example.com/?token=abc",
      "https://relay.example.com/#frag",
      "https://relay.example.com?",
      "https://relay.example.com/a b",
      "https://relay.example.com\\evil",
      "https://relay.example.com/a\nb",
      "relay.example.com",
      "//relay.example.com",
      "https://",
      `https://relay.example.com/${"a".repeat(2100)}`,
      "null",
    ]) {
      const { config, issues } = urlOf(value);
      assert.equal("relayUrl" in config, false, value.slice(0, 60));
      assert.equal(issues.find((i) => i.variable === ENV.relayUrl)?.kind, "invalid", value.slice(0, 60));
    }
  });

  it("never repeats the value, even a URL that carries a token, in an issue", () => {
    const { issues } = urlOf("https://user:SUPERSECRETTOKEN@relay.example.com/?k=SUPERSECRETTOKEN");
    assert.equal(issues.length, 1);
    assert.ok(!issues[0]?.message.includes("SUPERSECRET"));
  });

  it("treats a blank value as unset without an issue", () => {
    assert.deepEqual(urlOf("   ").issues, []);
  });
});

describe("loadConfig: XO_RELAY_KEY and redaction", () => {
  // A made-up 64 hex digit key used only in these tests.
  const KEY = "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12";

  it("reads a header-safe key into a Secret that reveals only on request", () => {
    const { config, issues } = loadConfig({ [ENV.relayKey]: KEY });
    assert.deepEqual(issues, []);
    assert.ok(config.relayKey instanceof Secret);
    assert.equal(config.relayKey.reveal(), KEY);
  });

  it("accepts base64url and base64 shapes of 16 to 256 characters", () => {
    for (const value of ["A".repeat(16), "a-b_c.d~e+f/g=h12345", "z".repeat(256)]) {
      assert.ok(loadConfig({ [ENV.relayKey]: value }).config.relayKey instanceof Secret, value.slice(0, 20));
    }
  });

  it("treats a malformed key as not set, with an issue that does not contain it", () => {
    for (const value of ["short", "A".repeat(15), "A".repeat(257), "has space in the middle xxxx", "tab\tinside-key-xxxxxx", "quote\"key-xxxxxxxxxxxx", "emoji-\u{1f511}-key-xxxxxxxx", "semi;colon-key-xxxxxxxx"]) {
      const { config, issues } = loadConfig({ [ENV.relayKey]: value });
      assert.equal("relayKey" in config, false, value);
      const issue = issues.find((i) => i.variable === ENV.relayKey);
      assert.equal(issue?.kind, "invalid", value);
      assert.ok(!issue?.message.includes(value), value);
    }
  });

  it("prints as [redacted] through every common path", () => {
    const { config } = loadConfig({ [ENV.relayKey]: KEY, [ENV.relayUrl]: "http://127.0.0.1:8787" });
    const key = config.relayKey;
    assert.ok(key !== undefined);
    const outputs = [
      String(key),
      `${key}`,
      key.toString(),
      JSON.stringify(key),
      JSON.stringify({ key }),
      JSON.stringify([key]),
      inspect(key),
      inspect(key, { depth: 10, showHidden: true }),
      inspect(config, { depth: 10, showHidden: true }),
      inspect({ nested: { config } }, { depth: 20 }),
      Object.keys(config).join(","),
      Object.getOwnPropertyNames(key).join(","),
    ];
    for (const out of outputs) assert.ok(!out.includes(KEY), out.slice(0, 80));
    assert.equal(String(key), "[redacted]");
    assert.equal(JSON.stringify(key), '"[redacted]"');
  });

  it("is frozen, so nothing can swap or expose the value later", () => {
    const { config } = loadConfig({ [ENV.relayKey]: KEY });
    assert.ok(Object.isFrozen(config.relayKey));
    assert.throws(() => {
      (config.relayKey as unknown as { extra: string }).extra = "x";
    });
  });

  it("reports the relay as configured only when both parts are valid", () => {
    const both = loadConfig({ [ENV.relayKey]: KEY, [ENV.relayUrl]: "https://relay.example.com" }).config;
    assert.deepEqual(
      { baseUrl: relayEndpoint(both)?.baseUrl, key: relayEndpoint(both)?.key.reveal() },
      { baseUrl: "https://relay.example.com", key: KEY },
    );
    assert.equal(relayEndpoint(loadConfig({ [ENV.relayKey]: KEY }).config), undefined);
    assert.equal(relayEndpoint(loadConfig({ [ENV.relayUrl]: "https://relay.example.com" }).config), undefined);
    assert.equal(relayEndpoint(loadConfig({ [ENV.relayKey]: "short", [ENV.relayUrl]: "https://relay.example.com" }).config), undefined);
  });

  it("does not turn up in tool output when a key is configured", () => {
    const config = loadConfig({ [ENV.relayKey]: KEY, [ENV.relayUrl]: "http://127.0.0.1:8787", XO_ENABLE_CREATE: "1" }).config;
    const result = handleValidateMarketDraft(
      {
        title: "Will Bitcoin close above $150,000 on Coinbase on December 31, 2026?",
        category: "Crypto",
        outcomes: ["Yes", "No"],
        rules: "Resolves Yes if the Coinbase BTC-USD daily candle for 2026-12-31 closes strictly above 150000 USD.",
        resolution_sources: ["https://exchange.coinbase.com/markets/BTC-USD"],
        close_date: "2027-01-01T00:00:00Z",
      },
      { nowMs: () => Date.parse("2026-10-19T12:00:00Z"), config: () => config },
    );
    assert.ok(!JSON.stringify(result).includes(KEY));
    assert.ok(!JSON.stringify(result).includes("127.0.0.1:8787"));
  });

  it("does not turn up in audit output, even when it is passed in by mistake", () => {
    const lines: string[] = [];
    const audit = createAuditWriter({ sink: { write: (line: string) => (lines.push(line), true) } });
    audit.write({ tool: "xo_test", action: "guard", outcome: "blocked", code: "kill_switch", note: `key ${KEY} seen`, warnings: [KEY, `Bearer ${KEY}`] });
    assert.ok(lines.length > 0);
    assert.ok(!lines.join("\n").includes(KEY));
  });

  it("does not keep the key or URL when the environment cannot be read", () => {
    const hostile = new Proxy({}, { get(): never { throw new Error("boom"); } }) as Record<string, string | undefined>;
    const { config } = loadConfig(hostile);
    assert.equal("relayKey" in config, false);
    assert.equal("relayUrl" in config, false);
    assert.equal(config.killSwitch, true);
  });
});
