import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUDIT_LINE_MAX_BYTES,
  AUDIT_PREFIX,
  AUDIT_STDERR_BUDGET_BYTES,
  AUDIT_STDERR_HARD_CAP_BYTES,
  SELF_TRADE_NOTICE,
  type AuditEvent,
  audit,
  createAuditWriter,
  formatAuditLine,
  isSelfTrade,
  redactSecrets,
} from "../src/guardrails/audit.js";

const HASH_A = "0x" + "ab".repeat(32);
const ACCOUNT = "0x4bC5E872256D12E6017dfe466E04c867DC761B77";
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);

const base: AuditEvent = {
  tool: "xo_submit_order",
  action: "order_submit",
  outcome: "allowed",
  nowMs: NOW,
};

function parse(line: string): Record<string, unknown> {
  assert.ok(line.startsWith(`${AUDIT_PREFIX} `), line);
  const parsed: unknown = JSON.parse(line.slice(AUDIT_PREFIX.length + 1));
  assert.ok(typeof parsed === "object" && parsed !== null);
  return parsed as Record<string, unknown>;
}

describe("formatAuditLine", () => {
  it("writes one structured line with the documented fields", () => {
    const line = formatAuditLine({
      ...base,
      outcome: "blocked",
      code: "order_cap_exceeded",
      side: "BUY",
      marketId: HASH_A.toUpperCase().replace("0X", "0x"),
      orderHash: HASH_A,
      amountAtomic: 12_000_000n,
      priceTicks: 550,
      account: ACCOUNT,
    });
    assert.ok(!line.includes("\n"));
    assert.deepEqual(parse(line), {
      v: 1,
      ts: "2026-10-19T12:00:00.000Z",
      tool: "xo_submit_order",
      action: "order_submit",
      outcome: "blocked",
      code: "order_cap_exceeded",
      side: "BUY",
      market: HASH_A,
      order_hash: HASH_A,
      amount_atomic: "12000000",
      price_ticks: 550,
      account: "0x4bc5...1b77",
    });
  });

  it("marks self-trades, and says nothing when it is not one", () => {
    assert.equal(parse(formatAuditLine({ ...base, selfTrade: true }))["self_trade"], true);
    assert.equal("self_trade" in parse(formatAuditLine({ ...base, selfTrade: false })), false);
    assert.equal("self_trade" in parse(formatAuditLine(base)), false);
    assert.match(SELF_TRADE_NOTICE, /Allowed by the operator/);
  });

  it("never includes fields outside the allowlist, so stray secrets cannot leak", () => {
    const sneaky = {
      ...base,
      apiKey: "key-12345678-secret",
      secret: "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm",
      passphrase: "hunter2-passphrase",
      privateKey: "0x" + "11".repeat(32),
      signature: "0x" + "22".repeat(65),
    } as AuditEvent;
    const line = formatAuditLine(sneaky);
    for (const value of ["key-12345678", "c2VjcmV0", "hunter2", "11".repeat(32), "22".repeat(65)]) {
      assert.ok(!line.includes(value), value);
    }
    assert.deepEqual(Object.keys(parse(line)).sort(), ["action", "outcome", "tool", "ts", "v"]);
  });

  it("redacts key-shaped strings, addresses, e-mail addresses and long tokens from free text", () => {
    const note = [
      "key 0x" + "11".repeat(32),
      "sig 0x" + "22".repeat(65),
      "addr " + ACCOUNT,
      "mail someone@example.invalid",
      "b64 c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm",
      "path /Users/example/Documents-Local/github/some-long-project-directory-name",
    ].join(" ");
    const line = formatAuditLine({ ...base, note, warnings: [note] });
    assert.ok(!line.includes("1111"));
    assert.ok(!line.includes("2222"));
    assert.ok(!line.includes("someone@"));
    assert.ok(!line.includes("c2VjcmV0"));
    assert.ok(!line.includes("some-long-project"));
    assert.ok(line.includes("[redacted-hex]"));
    assert.ok(line.includes("[redacted-email]"));
    assert.ok(line.includes("0x4bc5...1b77"));
    assert.ok(!line.includes(ACCOUNT));
  });

  it("redacts a secret that was split with invisible characters", () => {
    const split = "0x" + ("11".repeat(8) + "\u{200b}").repeat(4) + "11".repeat(32);
    const line = formatAuditLine({ ...base, note: split });
    assert.ok(!line.includes("1111111111111111"));
  });

  it("cannot be used to forge a second log line", () => {
    for (const note of [
      'ok\nxo-audit {"forged":true}',
      "a\r\nb",
      "a\u{2028}xo-audit {}\u{2029}b",
      "a\u{85}b",
    ]) {
      const line = formatAuditLine({ ...base, note });
      assert.ok(!/[\n\r\u{2028}\u{2029}\u{85}]/u.test(line), JSON.stringify(note));
      assert.equal(parse(line)["tool"], "xo_submit_order");
      assert.equal(typeof parse(line)["note"], "string");
    }
  });

  it("replaces a malformed tool name and drops malformed identifiers without echoing them", () => {
    const line = formatAuditLine({
      ...base,
      tool: 'x"; DROP\n',
      code: "has spaces and CAPS",
      marketId: "not-a-hash SECRETMARKER",
      orderHash: "0x1234",
      account: "someone",
    });
    assert.equal(line.includes("SECRETMARKER"), false);
    const record = parse(line);
    assert.equal(record["tool"], "invalid_tool");
    assert.deepEqual(record["dropped"], ["code", "market", "order_hash", "account"]);
    assert.equal("code" in record, false);
    assert.equal("account" in record, false);
  });

  it("keeps a line under the size cap by shedding optional detail first", () => {
    const huge = "word ".repeat(2000);
    const line = formatAuditLine({
      ...base,
      note: huge,
      warnings: [huge, huge, huge, huge, huge, huge],
      code: "order_cap_exceeded",
      orderHash: HASH_A,
    });
    assert.ok(Buffer.byteLength(line) <= AUDIT_LINE_MAX_BYTES);
    const record = parse(line);
    assert.equal(record["code"], "order_cap_exceeded");
    assert.equal(record["order_hash"], HASH_A);
  });

  it("survives hostile event contents without throwing", () => {
    const hostile = {
      tool: null,
      action: "read",
      outcome: "ok",
      amountAtomic: "not a bigint",
      priceTicks: Number.NaN,
      nowMs: Number.NaN,
      note: { toString: () => "x" },
      warnings: [null, undefined, 5],
    } as unknown as AuditEvent;
    const line = formatAuditLine(hostile);
    assert.doesNotThrow(() => parse(line));
    assert.equal(parse(line)["ts"], "1970-01-01T00:00:00.000Z");
  });
});

describe("a formatter that throws never breaks the tool call (TM-08)", () => {
  const throwing = (key: string): AuditEvent => {
    const event: Record<string, unknown> = { tool: "xo_search", action: "read", outcome: "ok" };
    Object.defineProperty(event, key, {
      enumerable: true,
      get() {
        throw new Error("formatter trap");
      },
    });
    return event as unknown as AuditEvent;
  };

  it("returns the fixed audit_format_failed line instead of throwing", () => {
    for (const key of ["note", "warnings", "code", "marketId", "account", "nowMs"]) {
      let line = "";
      assert.doesNotThrow(() => {
        line = formatAuditLine(throwing(key));
      }, key);
      const record = parse(line);
      assert.equal(record["code"], "audit_format_failed", key);
      assert.equal(record["outcome"], "error", key);
      assert.equal(line.includes("formatter trap"), false, "the error text is not logged");
    }
  });

  it("the writer survives it too and still writes one line", () => {
    const lines: string[] = [];
    const writer = createAuditWriter({ sink: { write: (chunk) => lines.push(chunk) } });
    assert.equal(writer.write(throwing("note")), "written");
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /audit_format_failed/);
  });
});

describe("redactSecrets", () => {
  it("leaves ordinary short text alone", () => {
    assert.equal(redactSecrets("order blocked: cap exceeded"), "order blocked: cap exceeded");
  });

  it("redacts private-key and signature shaped hex", () => {
    assert.equal(redactSecrets("k=0x" + "ab".repeat(32)), "k=[redacted-hex]");
    assert.equal(redactSecrets("s=0x" + "cd".repeat(65)), "s=[redacted-hex]");
  });

  it("shortens addresses, and redacts e-mail addresses and long tokens", () => {
    assert.equal(redactSecrets("a " + ACCOUNT), "a 0x4bc5...1b77");
    assert.equal(redactSecrets("m someone@example.invalid"), "m [redacted-email]");
    assert.equal(redactSecrets("t " + "Zm9vYmFy".repeat(5)), "t [redacted-token]");
    assert.equal(redactSecrets("t " + "Zm9vYmFy".repeat(3)), "t " + "Zm9vYmFy".repeat(3));
  });
});

describe("isSelfTrade", () => {
  it("is true when the account created the market, ignoring case", () => {
    assert.equal(isSelfTrade(ACCOUNT, ACCOUNT.toLowerCase()), true);
    assert.equal(isSelfTrade(ACCOUNT.toLowerCase(), ACCOUNT), true);
  });

  it("is false for different accounts", () => {
    assert.equal(isSelfTrade(ACCOUNT, "0x80c12230ce677e6f304027a14780Edd2A829ab0c"), false);
  });

  it("is false when either side is missing or malformed, so a failed lookup never claims a self-trade", () => {
    for (const bad of [undefined, null, "", "0x123", 5, {}, "0x" + "g".repeat(40)]) {
      assert.equal(isSelfTrade(ACCOUNT, bad), false, String(bad));
      assert.equal(isSelfTrade(bad, ACCOUNT), false, String(bad));
    }
    assert.equal(isSelfTrade(undefined, undefined), false);
  });
});

describe("audit writer", () => {
  function recorder() {
    const chunks: string[] = [];
    return { chunks, sink: { write: (chunk: string) => chunks.push(chunk) } };
  }

  it("writes each record as one newline-terminated line to the given sink", () => {
    const { chunks, sink } = recorder();
    const writer = createAuditWriter({ sink });
    assert.equal(writer.write(base), "written");
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0]?.endsWith("\n"));
    assert.equal(chunks[0]?.split("\n").length, 2);
    assert.equal(writer.bytesWritten(), Buffer.byteLength(chunks[0] ?? ""));
  });

  it("stays inside its byte budget, then says so once and drops the rest", () => {
    const { chunks, sink } = recorder();
    const writer = createAuditWriter({ sink, budgetBytes: 1500 });
    const results = Array.from({ length: 20 }, () => writer.write({ ...base, note: "n".repeat(60) }));
    assert.ok(results.includes("written"));
    assert.ok(results.includes("dropped"));
    assert.ok(writer.bytesWritten() <= 1500);
    const notices = chunks.filter((chunk) => chunk.includes("audit_budget_spent"));
    assert.equal(notices.length, 1);
    assert.equal(writer.droppedCount(), results.filter((r) => r === "dropped").length);
    assert.equal(chunks.join("").length, writer.bytesWritten());
  });

  it("can never be configured past the hard cap, which is under the runner's 16 KiB limit", () => {
    assert.ok(AUDIT_STDERR_BUDGET_BYTES < AUDIT_STDERR_HARD_CAP_BYTES);
    assert.ok(AUDIT_STDERR_HARD_CAP_BYTES < 16 * 1024);
    const { sink } = recorder();
    const writer = createAuditWriter({ sink, budgetBytes: 10_000_000 });
    for (let i = 0; i < 400; i += 1) writer.write({ ...base, note: "n".repeat(150) });
    assert.ok(writer.bytesWritten() <= AUDIT_STDERR_HARD_CAP_BYTES);
    assert.ok(writer.droppedCount() > 0);
  });

  it("ignores an invalid budget and uses the default", () => {
    for (const bad of [0, -5, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      const { sink } = recorder();
      const writer = createAuditWriter({ sink, budgetBytes: bad });
      for (let i = 0; i < 100; i += 1) writer.write({ ...base, note: "n".repeat(150) });
      assert.ok(writer.bytesWritten() <= AUDIT_STDERR_BUDGET_BYTES, String(bad));
      assert.ok(writer.bytesWritten() > 0, String(bad));
    }
  });

  it("never throws when the sink fails", () => {
    const writer = createAuditWriter({
      sink: {
        write(): never {
          throw new Error("EPIPE");
        },
      },
    });
    assert.doesNotThrow(() => writer.write(base));
    assert.equal(writer.write(base), "dropped");
    assert.equal(writer.bytesWritten(), 0);
  });

  it("writes to stderr only and never to stdout", () => {
    const realStderr = process.stderr.write;
    const realStdout = process.stdout.write;
    const toStderr: string[] = [];
    let stdoutCalls = 0;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      toStderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    process.stdout.write = (() => {
      stdoutCalls += 1;
      return true;
    }) as typeof process.stdout.write;
    try {
      // The process-wide writer and a default-sink writer must both target stderr.
      audit.write(base);
      createAuditWriter().write(base);
    } finally {
      process.stderr.write = realStderr;
      process.stdout.write = realStdout;
    }
    assert.equal(stdoutCalls, 0);
    assert.equal(toStderr.length, 2);
    assert.ok(toStderr.every((chunk) => chunk.startsWith(AUDIT_PREFIX)));
  });
});
