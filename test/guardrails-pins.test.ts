import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CEILINGS, DEFAULTS, FLOORS, loadConfig } from "../src/config.js";
import {
  AUDIT_LINE_MAX_BYTES,
  AUDIT_STDERR_BUDGET_BYTES,
  AUDIT_STDERR_HARD_CAP_BYTES,
  formatAuditLine,
} from "../src/guardrails/audit.js";
import {
  DEFAULT_MAX_CHARS,
  FIELD_LIMITS,
  HARD_MAX_CHARS,
  MAX_INPUT_CHARS,
  MIN_MAX_CHARS,
  sanitizeUntrusted,
} from "../src/guardrails/untrusted.js";
import { MAX_OUTPUT_BYTES, TOOL_BUDGET_MS } from "../src/tools/read.js";
import {
  DEFAULT_ATTEMPT_TIMEOUT_MS,
  DEFAULT_DEADLINE_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_REQUESTS_PER_HOST,
  DEFAULT_MIN_INTERVAL_MS,
  XO_DATA_API_HOST,
  XoError,
  XoHttp,
  type FetchLike,
} from "../src/xo/http.js";
import { jsonResponse } from "./fixtures/xo/load.js";

// Hard caps are asserted against literals here. A test that compares a limit with the constant it
// guards would stay green if someone raised the constant, which is exactly the change to catch
// (TM-04). Changing any of these numbers is a decision that should show up in this file.

describe("pinned guardrail ceilings and floors", () => {
  it("pins the compiled-in ceilings", () => {
    assert.deepEqual(
      { ...CEILINGS },
      {
        maxOrderAtomic: 100_000_000n,
        maxDailyAtomic: 500_000_000n,
        priceBandTicks: 200,
        quoteTtlSeconds: 600,
        orderExpirySeconds: 3600,
      },
    );
  });

  it("pins the floors and the author's defaults", () => {
    assert.deepEqual({ ...FLOORS }, { priceBandTicks: 1, quoteTtlSeconds: 10, orderExpirySeconds: 60 });
    assert.equal(DEFAULTS.maxOrderAtomic, 10_000_000n);
    assert.equal(DEFAULTS.maxDailyAtomic, 50_000_000n);
    assert.equal(DEFAULTS.createEnabled, false);
    assert.equal(DEFAULTS.killSwitch, false);
  });

  it("refuses values just below each floor and accepts the floor itself", () => {
    const cases: Array<[string, string, string, keyof typeof DEFAULTS, number]> = [
      ["XO_ORDER_EXPIRY_SECONDS", "59", "60", "orderExpirySeconds", 600],
      ["XO_QUOTE_TTL_SECONDS", "9", "10", "quoteTtlSeconds", 120],
      ["XO_PRICE_BAND_TICKS", "0", "1", "priceBandTicks", 50],
    ];
    for (const [name, below, floor, key, fallback] of cases) {
      const refused = loadConfig({ [name]: below });
      assert.equal(refused.config[key], fallback, `${name}=${below}`);
      assert.ok(refused.issues.some((issue) => issue.kind === "invalid" && issue.variable === name), `${name}=${below}`);
      const accepted = loadConfig({ [name]: floor });
      assert.equal(accepted.config[key], Number(floor), `${name}=${floor}`);
      assert.equal(accepted.issues.length, 0, `${name}=${floor}`);
    }
  });

  it("clamps each time-like setting to its ceiling", () => {
    assert.equal(loadConfig({ XO_ORDER_EXPIRY_SECONDS: "3601" }).config.orderExpirySeconds, 3600);
    assert.equal(loadConfig({ XO_QUOTE_TTL_SECONDS: "601" }).config.quoteTtlSeconds, 600);
    assert.equal(loadConfig({ XO_PRICE_BAND_TICKS: "201" }).config.priceBandTicks, 200);
    assert.equal(loadConfig({ XO_MAX_ORDER_USD: "100.01", XO_MAX_DAILY_USD: "500" }).config.maxOrderAtomic, 100_000_000n);
    assert.equal(loadConfig({ XO_MAX_DAILY_USD: "500.01" }).config.maxDailyAtomic, 500_000_000n);
  });
});

describe("pinned read-tool and transport limits", () => {
  it("pins the output size and call time budgets", () => {
    assert.equal(MAX_OUTPUT_BYTES, 131_072);
    assert.equal(TOOL_BUDGET_MS, 8_000);
    assert.equal(DEFAULT_MAX_REQUESTS_PER_HOST, 100);
    assert.equal(DEFAULT_MAX_BODY_BYTES, 1_048_576);
    assert.equal(DEFAULT_MIN_INTERVAL_MS, 250);
    assert.equal(DEFAULT_ATTEMPT_TIMEOUT_MS, 3_000);
    assert.equal(DEFAULT_DEADLINE_MS, 8_000);
  });

  it("stops sending to a host after the default request budget of 100", async () => {
    let sent = 0;
    const fetchImpl: FetchLike = async () => {
      sent += 1;
      return jsonResponse({ ok: true });
    };
    const http = new XoHttp({ fetchImpl, minIntervalMs: 0, sleep: async () => undefined });
    const url = `https://${XO_DATA_API_HOST}/api/markets`;
    for (let i = 0; i < DEFAULT_MAX_REQUESTS_PER_HOST; i += 1) await http.getJson(url);
    assert.equal(sent, 100);
    await assert.rejects(http.getJson(url), (error: unknown) => error instanceof XoError && error.kind === "blocked");
    assert.equal(sent, 100, "the 101st request must not be sent");
  });
});

describe("error bodies and Retry-After are bounded", () => {
  const url = `https://${XO_DATA_API_HOST}/api/markets`;
  // A short deadline: no retry is attempted, so the first error is the one reported.
  const client = (reply: () => Response): XoHttp =>
    new XoHttp({ fetchImpl: async () => reply(), minIntervalMs: 0, sleep: async () => undefined, deadlineMs: 400 });
  const failure = async (reply: () => Response): Promise<XoError> => {
    try {
      await client(reply).getJson(url);
    } catch (error) {
      assert.ok(error instanceof XoError);
      return error;
    }
    return assert.fail("expected an error");
  };

  // A 429 body of exactly `bytes` bytes carrying retry_after_ms: 4321.
  const bodyOfSize = (bytes: number): string => {
    const base = JSON.stringify({ retry_after_ms: 4321, pad: "" });
    return JSON.stringify({ retry_after_ms: 4321, pad: "x".repeat(bytes - Buffer.byteLength(base)) });
  };
  const tooMany = (body: string, headers: Record<string, string> = {}) => () =>
    new Response(body, { status: 429, headers: { "content-type": "application/json", ...headers } });

  it("reads an error body of exactly 16 KiB for its hints and ignores one a byte larger", async () => {
    const at = bodyOfSize(16 * 1024);
    assert.equal(Buffer.byteLength(at), 16 * 1024);
    assert.equal((await failure(tooMany(at))).retryAfterMs, 4321);
    const over = bodyOfSize(16 * 1024 + 1);
    assert.equal(Buffer.byteLength(over), 16 * 1024 + 1);
    const error = await failure(tooMany(over));
    assert.equal(error.kind, "rate_limited");
    assert.equal(error.retryAfterMs, undefined, "an oversized error body must not be parsed");
  });

  it("clamps Retry-After to ten minutes, from a header number, a header date and the body", async () => {
    assert.equal((await failure(tooMany("{}", { "retry-after": "999999" }))).retryAfterMs, 600_000);
    assert.equal((await failure(tooMany("{}", { "retry-after": "600" }))).retryAfterMs, 600_000);
    assert.equal((await failure(tooMany("{}", { "retry-after": "599" }))).retryAfterMs, 599_000);
    const farFuture = new Date(Date.now() + 10 * 24 * 3600 * 1000).toUTCString();
    assert.equal((await failure(tooMany("{}", { "retry-after": farFuture }))).retryAfterMs, 600_000);
    assert.equal((await failure(tooMany(JSON.stringify({ retry_after_ms: 99_999_999 })))).retryAfterMs, 600_000);
  });
});

describe("pinned sanitizer and audit limits", () => {
  it("pins the length limits", () => {
    assert.deepEqual({ ...FIELD_LIMITS }, { title: 200, outcome: 80, category: 64, tag: 40, description: 1500, rules: 3000, generic: 500 });
    assert.equal(DEFAULT_MAX_CHARS, 500);
    assert.equal(MIN_MAX_CHARS, 16);
    assert.equal(HARD_MAX_CHARS, 8000);
    assert.equal(MAX_INPUT_CHARS, 65_536);
  });

  it("never returns more than 8000 characters whatever limit is asked for", () => {
    const huge = "word ".repeat(20_000);
    for (const maxChars of [8_001, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      const result = sanitizeUntrusted(huge, { maxChars });
      assert.ok(result.text.length <= 8000, `maxChars ${maxChars} gave ${result.text.length}`);
      assert.equal(result.truncated, true);
    }
    assert.equal(sanitizeUntrusted("x".repeat(8000), { maxChars: 1_000_000 }).text.length, 8000);
    assert.equal(sanitizeUntrusted("x".repeat(8001), { maxChars: 1_000_000 }).truncated, true);
  });

  it("scans at most 65536 characters of input and says so", () => {
    const exact = sanitizeUntrusted("a".repeat(MAX_INPUT_CHARS), { maxChars: HARD_MAX_CHARS });
    assert.equal(exact.flags.includes("input-oversize"), false, "exactly the limit is not oversize");
    const over = sanitizeUntrusted("a".repeat(MAX_INPUT_CHARS + 1), { maxChars: HARD_MAX_CHARS });
    assert.ok(over.flags.includes("input-oversize"));
    assert.equal(over.truncated, true);
  });

  it("pins the audit budgets", () => {
    assert.equal(AUDIT_LINE_MAX_BYTES, 1024);
    assert.equal(AUDIT_STDERR_BUDGET_BYTES, 8 * 1024);
    assert.equal(AUDIT_STDERR_HARD_CAP_BYTES, 12 * 1024);
  });

  it("caps an audit note at 200 characters and a whole line at 1 KiB", () => {
    const note = formatAuditLine({ tool: "xo_search", action: "read", outcome: "ok", note: "n ".repeat(2_000) });
    const parsedNote = (JSON.parse(note.slice("xo-audit ".length)) as { note: string }).note;
    assert.ok(parsedNote.length <= 200, `note is ${parsedNote.length} characters`);

    const warnings = Array.from({ length: 6 }, (_, i) => `warning ${i} ${"w ".repeat(150)}`);
    const line = formatAuditLine({ tool: "xo_search", action: "read", outcome: "ok", note: "n ".repeat(300), warnings });
    assert.ok(Buffer.byteLength(line) <= 1024, `line is ${Buffer.byteLength(line)} bytes`);
    const record = JSON.parse(line.slice("xo-audit ".length)) as Record<string, unknown>;
    assert.equal(record["tool"], "xo_search");
    assert.equal(record["outcome"], "ok");
  });
});
