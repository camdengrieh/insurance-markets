import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import {
  AUDIT_EVENTS,
  EXTERNAL_AUDIT_EVENTS,
  createMemoryAudit,
  createRelayAudit,
  formatRelayAuditLine,
  isExternalAuditEvent,
  type RelayAuditEvent,
} from "../relay/audit.js";
import { addr, tempDir, type TempDir } from "./relay-core-helpers.js";

// Ask A7 (docs/dapp-design.md 5.4 and 7.4): the audit events the Cockpit daemon writes into the relay's audit
// log (ui.*, signer.*, agent.call, feed.mismatch, schema.violation), each with typed fields only, and a hash
// chain whose head the status bar can show. No secret-shaped value may reach a line.

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const dirs: TempDir[] = [];
after(async () => {
  for (const made of dirs) await made.cleanup();
});

const parse = (line: string): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>;

describe("the new event names", () => {
  it("lists exactly the events of the design, and marks them as written from outside the relay", () => {
    assert.deepEqual([...EXTERNAL_AUDIT_EVENTS], [
      "ui.pair",
      "ui.arm",
      "ui.disarm",
      "ui.kill",
      "ui.command",
      "ui.card.shown",
      "ui.card.decision",
      "signer.request",
      "signer.result",
      "agent.call",
      "feed.mismatch",
      "schema.violation",
    ]);
    for (const name of EXTERNAL_AUDIT_EVENTS) {
      assert.ok((AUDIT_EVENTS as readonly string[]).includes(name), name);
      assert.equal(isExternalAuditEvent(name), true);
    }
    assert.equal(isExternalAuditEvent("startup"), false);
    assert.equal(isExternalAuditEvent("ui.hack"), false);
  });

  it("keeps an unknown event name from being written under its own name", () => {
    const record = parse(formatRelayAuditLine({ ev: "ui.hack" as never }, NOW));
    assert.equal(record["ev"], "error");
  });
});

describe("what each new event carries", () => {
  it("ui.card.shown: both tags and the verification result, with the first differing field", () => {
    const line = formatRelayAuditLine(
      { ev: "ui.card.shown", preparedId: "0123456789abcdef0123456789abcdef", digestTag: "0123456789abcdef", innerTag: "fedcba9876543210", verdict: "mismatch", field: "summary.lines[3]", tokenId: "deadbeef", outcome: "refused" },
      NOW,
    );
    assert.deepEqual(parse(line), {
      v: 1,
      ts: "2026-10-19T12:00:00.000Z",
      ev: "ui.card.shown",
      outcome: "refused",
      pid: "01234567",
      digest_tag: "0123456789abcdef",
      inner_tag: "fedcba9876543210",
      verdict: "mismatch",
      field: "summary.lines[3]",
      token: "deadbeef",
    });
  });

  it("ui.card.decision, ui.command, ui.pair, ui.arm, ui.disarm and ui.kill carry words, never the raw line", () => {
    const decision = parse(formatRelayAuditLine({ ev: "ui.card.decision", preparedId: "0123456789abcdef", decision: "reject" }, NOW));
    assert.equal(decision["decision"], "reject");
    const command = parse(formatRelayAuditLine({ ev: "ui.command", command: "buy", tool: "xo_prepare_order", toolClass: "prepare", outcome: "ok" }, NOW));
    assert.deepEqual([command["command"], command["tool"], command["tool_class"]], ["buy", "xo_prepare_order", "prepare"]);
    for (const ev of ["ui.pair", "ui.arm", "ui.disarm", "ui.kill"] as const) {
      const record = parse(formatRelayAuditLine({ ev, outcome: "ok", state: "armed", ms: 120_000 }, NOW));
      assert.equal(record["ev"], ev);
      assert.equal(record["state"], "armed");
    }
  });

  it("signer.request and signer.result: the PayBox request reference and a status, never the signature", () => {
    const request = parse(formatRelayAuditLine({ ev: "signer.request", requestRef: "req_8f2a91c3d4e5f60718293a4b5c6d7e8f9a0b1c2d", preparedId: "0123456789abcdef", digestTag: "0123456789abcdef", state: "pending" }, NOW));
    assert.equal(request["request_ref"], "req_8f2a91c3", "only the first 12 characters of the reference");
    const result = parse(formatRelayAuditLine({ ev: "signer.result", requestRef: "req_8f2a91c3d4e5f60718293a4b5c6d7e8f9a0b1c2d", state: "approved", outcome: "ok" }, NOW));
    assert.equal(result["state"], "approved");
    assert.ok(!("signature" in result));
  });

  it("agent.call: the token's short id, the tool, its class, a 16-hex argument hash and the outcome", () => {
    const argsHash = createHash("sha256").update(JSON.stringify({ owner: addr(1) })).digest("hex").slice(0, 16);
    const record = parse(formatRelayAuditLine({ ev: "agent.call", tokenId: "0123456789abcdef", tool: "xo_submit_order", toolClass: "submit", argsHash, outcome: "refused", code: "flag_off" }, NOW));
    assert.deepEqual([record["token"], record["tool"], record["tool_class"], record["args_hash"], record["outcome"], record["code"]], ["01234567", "xo_submit_order", "submit", argsHash, "refused", "flag_off"]);
  });

  it("feed.mismatch and schema.violation name the route or tool and the field, with fixed words", () => {
    const feed = parse(formatRelayAuditLine({ ev: "feed.mismatch", route: "POST /v1/order/prepare", field: "caps.reserved_usd", verdict: "mismatch" }, NOW));
    assert.equal(feed["field"], "caps.reserved_usd");
    const violation = parse(formatRelayAuditLine({ ev: "schema.violation", tool: "xo_orderbook", field: "decoded.terms.price" }, NOW));
    assert.equal(violation["tool"], "xo_orderbook");
  });
});

describe("no secret-shaped value reaches a line (the scanner)", () => {
  const SIGNATURE = `0x${"ab".repeat(65)}`;
  const KEY32 = "ab".repeat(32);
  const secrets = [SIGNATURE, `0x${KEY32}`, KEY32, "pbxk1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "pbx_live_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "x-relay-key: hunter2hunter2hunter2"];
  const EVENTS: readonly RelayAuditEvent[] = [
    { ev: "ui.command" },
    { ev: "ui.card.shown" },
    { ev: "ui.card.decision" },
    { ev: "signer.request" },
    { ev: "signer.result" },
    { ev: "agent.call" },
    { ev: "feed.mismatch" },
    { ev: "schema.violation" },
  ];

  it("drops a secret from every typed field of every new event", () => {
    const fields = ["innerTag", "verdict", "field", "decision", "command", "tool", "toolClass", "argsHash", "tokenId", "requestRef", "digestTag", "state", "code"] as const;
    for (const base of EVENTS) {
      for (const field of fields) {
        for (const secret of secrets) {
          const line = formatRelayAuditLine({ ...base, [field]: secret } as RelayAuditEvent, NOW);
          assert.ok(!line.includes(secret), `${base.ev}.${field} leaked ${secret.slice(0, 12)}`);
          assert.ok(!/[0-9a-f]{64}/.test(line), `${base.ev}.${field} wrote a 32-byte hex value`);
          assert.ok(!line.includes("pbxk1") && !line.includes("pbx_live") && !line.includes("sk-ant"), `${base.ev}.${field} wrote a key prefix`);
        }
      }
    }
  });

  it("a request reference shorter than 4 characters or with odd characters is dropped, not repaired", () => {
    for (const requestRef of ["ab", "has space", "semi;colon", "new\nline"]) {
      const record = parse(formatRelayAuditLine({ ev: "signer.request", requestRef }, NOW));
      assert.ok(!("request_ref" in record), requestRef);
      assert.deepEqual(record["dropped"], ["request_ref"]);
    }
  });

  it("the note of an external event still goes through the shared redactor", () => {
    const line = formatRelayAuditLine({ ev: "ui.command", note: `buy ${SIGNATURE} please` }, NOW);
    assert.ok(!line.includes(SIGNATURE));
  });
});

describe("the hash chain", () => {
  it("is off by default and adds neither seq nor h", async () => {
    const audit = createMemoryAudit(() => NOW);
    await audit.write({ ev: "ui.pair", outcome: "ok" });
    assert.equal(audit.head?.(), undefined);
    assert.ok(!("h" in parse(audit.lines[0] as string)));
  });

  it("links every line to the one before: h = sha256(previous h + the line without its own link)", async () => {
    const audit = createMemoryAudit(() => NOW, () => [], { chain: true });
    await audit.write({ ev: "ui.pair", outcome: "ok" });
    await audit.write({ ev: "ui.arm", outcome: "ok", state: "armed" });
    await audit.write({ ev: "ui.kill", outcome: "ok" });
    const records = audit.lines.map(parse);
    assert.deepEqual(records.map((record) => record["seq"]), [1, 2, 3]);
    let previous = "0".repeat(64);
    for (const [index, record] of records.entries()) {
      const { h, ...rest } = record;
      const body = JSON.stringify(rest);
      const expected = createHash("sha256").update(`${previous}\n${body}`).digest("hex");
      assert.equal(h, expected, `line ${index + 1}`);
      previous = expected;
    }
    assert.equal(audit.head?.(), previous, "the head is the last link");
  });

  it("a changed or removed line breaks every link after it", async () => {
    const audit = createMemoryAudit(() => NOW, () => [], { chain: true });
    for (const ev of ["ui.pair", "ui.arm", "ui.disarm", "ui.kill"] as const) await audit.write({ ev, outcome: "ok" });
    const verify = (lines: readonly string[]): number => {
      let previous = "0".repeat(64);
      for (const [index, line] of lines.entries()) {
        const { h, ...rest } = parse(line);
        const expected = createHash("sha256").update(`${previous}\n${JSON.stringify(rest)}`).digest("hex");
        if (h !== expected) return index;
        previous = expected;
      }
      return -1;
    };
    assert.equal(verify(audit.lines), -1);
    assert.equal(verify(audit.lines.map((line, index) => (index === 1 ? line.replace("ui.arm", "ui.pair") : line))), 1);
    assert.equal(verify(audit.lines.filter((_, index) => index !== 1)), 1);
  });

  it("is written by the file audit too, and its head follows the last written line", async () => {
    const made = await tempDir();
    dirs.push(made);
    const audit = await createRelayAudit({ dir: made.dir, now: () => NOW, chain: true });
    await audit.write({ ev: "ui.pair", outcome: "ok", sync: true });
    const first = audit.head?.();
    await audit.write({ ev: "ui.kill", outcome: "ok", sync: true });
    assert.notEqual(audit.head?.(), first);
    await audit.close();
    const lines = (await readFile(join(made.dir, "audit.log"), "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal((parse(lines[1] as string)["h"] as string), audit.head?.());
  });

  it("a failed write does not advance the chain", async () => {
    const audit = createMemoryAudit(() => NOW, () => [], { chain: true });
    await audit.write({ ev: "ui.pair", outcome: "ok" });
    const head = audit.head?.();
    audit.failNext();
    await audit.write({ ev: "ui.arm", outcome: "ok" });
    assert.equal(audit.head?.(), head);
    await audit.write({ ev: "ui.arm", outcome: "ok" });
    assert.equal(parse(audit.lines[1] as string)["seq"], 2, "the dropped line took no sequence number");
  });
});
