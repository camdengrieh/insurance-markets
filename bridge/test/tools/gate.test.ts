import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { TOKEN_SCAN_PATTERN, bridgeErrorResponseSchema, toolCallResponseSchema } from "../../contract.js";
import { defineRoute, json } from "../../server.js";
import { DEFAULT_TOOL_LIMITS, toolGateOf, type ToolLimits } from "../../tool-classes.js";
import { bearer, postJson } from "../server/helpers.js";
import { ARMABLE_ENV, startGateDaemon, type GateDaemon } from "./helpers.js";

const started: GateDaemon[] = [];
afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});
async function gate(options: Parameters<typeof startGateDaemon>[0] = {}): Promise<GateDaemon> {
  const daemon = await startGateDaemon(options);
  started.push(daemon);
  return daemon;
}

const ID = "ab".repeat(16);
const ID2 = "cd".repeat(16);
const code = (reply: { json(): unknown }): string => bridgeErrorResponseSchema.parse(reply.json()).error.code;

describe("what each token may call through /ui/tool", () => {
  it("lets a page token call a read tool and returns the tool's answer in the contract's shape", async () => {
    const d = await gate();
    d.runner.next = () => ({ isError: false, text: "two markets", structured: { markets: [] } });
    const ui = await d.uiToken();
    const reply = await d.tool(ui, "xo_search", { query: "rain" });
    assert.equal(reply.status, 200);
    const body = toolCallResponseSchema.parse(reply.json());
    assert.equal(body.tool, "xo_search");
    assert.equal(body.tool_class, "read");
    assert.equal(body.ok, true);
    assert.deepEqual(body.structured, { markets: [] });
    assert.deepEqual(d.runner.calls, [{ tool: "xo_search", args: { query: "rain" } }]);
  });

  it("denies a tool that is not in the table and never runs it", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    for (const tool of ["xo_new_tool", "constructor", "admin_reset"]) {
      const reply = await d.tool(ui, tool);
      assert.equal(reply.status, 403, tool);
      assert.equal(code(reply), "scope_denied", tool);
    }
    assert.equal(d.runner.calls.length, 0);
  });

  it("lets a page token prepare, but not submit, even with the window open", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const ui = await d.uiToken();
    assert.equal((await d.tool(ui, "xo_prepare_order", { owner: "0x1" })).status, 200);
    assert.equal((await d.arm(ui)).status, 200);
    const reply = await d.tool(ui, "xo_submit_order", { prepared_id: ID, signature: "0x00" });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
    assert.equal(d.runner.calls.filter((call) => call.tool === "xo_submit_order").length, 0);
  });

  it("refuses a page-kind principal even if something handed it the submit scope (defence in depth)", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    await d.arm(await d.uiToken());
    const forged = { kind: "ui" as const, id: "deadbeef", scopes: ["read", "prepare", "submit"] as const, requestedBy: "ui" as const };
    const admission = toolGateOf(d.daemon.host).admit(forged, "xo_submit_order", { prepared_id: ID });
    assert.equal(admission.ok, false);
    assert.equal(admission.ok ? undefined : admission.failure.code, "scope_denied");
  });

  it("keeps an agent token at its ceiling: the default read + prepare cannot submit even when armed", async () => {
    const d = await gate({ env: ARMABLE_ENV, scopes: ["read", "prepare"] });
    const ui = await d.uiToken();
    await d.arm(ui);
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
    assert.equal((await d.tool(d.agentToken, "xo_prepare_order", {})).status, 200);
  });

  it("classes a two-step tool by its step for the page token", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const ui = await d.uiToken();
    assert.equal((await d.tool(ui, "xo_redeem", { step: "prepare", owner: "0x1" })).status, 200);
    assert.equal((await d.tool(ui, "xo_redeem", { step: "submit", prepared_id: ID, signature: "0x1" })).status, 403);
    assert.equal((await d.tool(ui, "xo_redeem", { prepared_id: ID })).status, 403);
    assert.equal(d.runner.calls.length, 1);
  });

  it("serves reads only on a read-only instance, and refuses prepare there", async () => {
    const d = await gate({ role: "read_only", env: ARMABLE_ENV });
    const ui = await d.uiToken();
    assert.equal((await d.tool(ui, "xo_search")).status, 200);
    const reply = await d.tool(ui, "xo_prepare_order");
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
  });
});

describe("submit needs the ARM window (M4-3)", () => {
  it("returns 403 not_armed for a submit with no window, and runs nothing", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID, signature: "0xaa" });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "not_armed");
    assert.equal(d.runner.calls.length, 0);
  });

  it("lets the same submit through once a human opened the window", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    await d.arm(await d.uiToken());
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID, signature: "0xaa" });
    assert.equal(reply.status, 200);
    assert.equal(d.runner.calls.length, 1);
  });

  it("refuses again after the window expires", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    await d.arm(await d.uiToken(), 2);
    assert.equal((await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID })).status, 200);
    d.clock.now += 2 * 60_000 + 1;
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID2 });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "not_armed");
    assert.equal(d.runner.calls.length, 1);
  });

  it("does not need the window for prepare or read", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    assert.equal((await d.tool(d.agentToken, "xo_prepare_order", {})).status, 200);
    assert.equal((await d.tool(d.agentToken, "xo_account", {})).status, 200);
  });

  it("needs a prepared id to submit, so a send can always be matched to its item", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    await d.arm(await d.uiToken());
    const reply = await d.tool(d.agentToken, "xo_submit_order", { signature: "0xaa" });
    assert.equal(reply.status, 400);
    assert.equal(code(reply), "invalid_request");
    assert.equal(d.runner.calls.length, 0);
  });

  it("treats the cancel as a send: it needs the window and keys on the order hash", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const hash = `0x${"ee".repeat(32)}`;
    assert.equal(code(await d.tool(d.agentToken, "xo_cancel_order", { owner: "0x1", order_hash: hash })), "not_armed");
    await d.arm(await d.uiToken());
    assert.equal((await d.tool(d.agentToken, "xo_cancel_order", { owner: "0x1", order_hash: hash })).status, 200);
    assert.equal(code(await d.tool(d.agentToken, "xo_cancel_order", { owner: "0x1", order_hash: hash })), "prepared_used");
  });
});

describe("two submits of one prepared_id send once (M4-3 groundwork)", () => {
  async function armed(): Promise<GateDaemon> {
    const d = await gate({ env: ARMABLE_ENV });
    await d.arm(await d.uiToken());
    return d;
  }

  it("refuses the second submit with prepared_used and never forwards it", async () => {
    const d = await armed();
    assert.equal((await d.tool(d.agentToken, "xo_submit_userop", { prepared_id: ID, signature: "0xaa" })).status, 200);
    const second = await d.tool(d.agentToken, "xo_submit_userop", { prepared_id: ID, signature: "0xaa" });
    assert.equal(second.status, 409);
    assert.equal(code(second), "prepared_used");
    assert.equal(d.runner.calls.length, 1);
  });

  it("holds when the same item arrives through different submit tools, spelled in capitals", async () => {
    const d = await armed();
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(code(await d.tool(d.agentToken, "xo_submit_userop", { prepared_id: ID.toUpperCase() })), "prepared_used");
    assert.equal(code(await d.tool(d.agentToken, "xo_redeem", { step: "submit", prepared_id: ID })), "prepared_used");
    assert.equal(d.runner.calls.length, 1);
  });

  it("holds under two concurrent submits: one runs, the other is told it is in flight", async () => {
    const d = await armed();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    d.runner.next = async () => {
      // A defect that lets the second call through must fail the assertions below, not hang the test.
      await Promise.race([held, new Promise((resolve) => setTimeout(resolve, 400))]);
      return { isError: false, text: null, structured: { outcome: "submitted" } };
    };
    const first = d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    // wait until the first call reached the runner
    for (let i = 0; i < 200 && d.runner.calls.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(second.status, 409);
    const body = bridgeErrorResponseSchema.parse(second.json());
    assert.equal(body.error.code, "prepared_used");
    assert.equal(body.error.details?.["state"], "in_flight");
    release();
    assert.equal((await first).status, 200);
    assert.equal(d.runner.calls.length, 1);
  });

  it("lets a different prepared id through", async () => {
    const d = await armed();
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal((await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID2 })).status, 200);
    assert.equal(d.runner.calls.length, 2);
  });

  it("frees the id only when the tool said it sent nothing (outcome refused)", async () => {
    const d = await armed();
    d.runner.next = () => ({ isError: true, text: null, structured: { outcome: "refused", code: "flag_off" } });
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    d.runner.next = () => ({ isError: false, text: null, structured: { outcome: "submitted" } });
    assert.equal((await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID })).status, 200);
    assert.equal(d.runner.calls.length, 2);
  });

  it("keeps the id after an ambiguous result: reconcile by hash, never resend", async () => {
    const d = await armed();
    d.runner.next = () => ({ isError: true, text: null, structured: { outcome: "ambiguous", code: "ambiguous" } });
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    const again = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(code(again), "prepared_used");
    const body = bridgeErrorResponseSchema.parse(again.json());
    assert.equal(body.error.details?.["previous"], "ambiguous");
    assert.equal(d.runner.calls.length, 1);
  });

  it("keeps the id after the runner threw: the effect is unknown", async () => {
    const d = await armed();
    d.runner.next = () => {
      throw new Error("boom");
    };
    const first = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(first.status, 200);
    const body = toolCallResponseSchema.parse(first.json());
    assert.equal(body.ok, false);
    assert.match(body.error?.message ?? "", /effect is unknown/);
    d.runner.next = () => ({ isError: false, text: null, structured: {} });
    assert.equal(code(await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID })), "prepared_used");
  });
});

describe("rate limits per token and per class", () => {
  const limits: ToolLimits = { perMinute: { read: 3, prepare: 2, submit: 1 }, preparePerSession: 3 };

  it("limits each class separately and answers rate_limited with a Retry-After", async () => {
    const d = await gate({ env: ARMABLE_ENV, limits });
    const ui = await d.uiToken();
    for (let i = 0; i < 3; i += 1) assert.equal((await d.tool(ui, "xo_search")).status, 200);
    const limited = await d.tool(ui, "xo_search");
    assert.equal(limited.status, 429);
    assert.equal(code(limited), "rate_limited");
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    // another class is unaffected, another token too
    assert.equal((await d.tool(ui, "xo_prepare_order")).status, 200);
    assert.equal((await d.tool(d.agentToken, "xo_search")).status, 200);
  });

  it("frees the window after a minute", async () => {
    const d = await gate({ limits });
    const ui = await d.uiToken();
    for (let i = 0; i < 3; i += 1) await d.tool(ui, "xo_search");
    assert.equal((await d.tool(ui, "xo_search")).status, 429);
    d.clock.now += 61_000;
    assert.equal((await d.tool(ui, "xo_search")).status, 200);
  });

  it("caps prepare per session, because every prepare reserves daily-cap budget", async () => {
    const d = await gate({ limits: { ...limits, perMinute: { read: 99, prepare: 99, submit: 99 } } });
    const ui = await d.uiToken();
    for (let i = 0; i < 3; i += 1) assert.equal((await d.tool(ui, "xo_prepare_order")).status, 200);
    d.clock.now += 3_600_000;
    const capped = await d.tool(ui, "xo_prepare_order");
    assert.equal(capped.status, 429);
    assert.equal(d.runner.calls.length, 3);
  });

  it("does not spend a ledger entry or a prepare on a call the limiter refused", async () => {
    const d = await gate({ env: ARMABLE_ENV, limits });
    await d.arm(await d.uiToken());
    assert.equal((await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID })).status, 200);
    // the second submit is over the per-minute limit; it must not claim its id
    assert.equal(code(await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID2 })), "rate_limited");
    d.clock.now += 61_000;
    assert.equal((await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID2 })).status, 200);
  });

  it("ships limits that are positive", () => {
    for (const value of Object.values(DEFAULT_TOOL_LIMITS.perMinute)) assert.ok(value > 0);
    assert.ok(DEFAULT_TOOL_LIMITS.preparePerSession > 0);
  });
});

describe("audit events for tool calls (agent.call)", () => {
  it("writes one event per call with token id, tool, class, argument hash and outcome", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const ui = await d.uiToken();
    await d.tool(ui, "xo_search", { query: "rain" });
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    const calls = d.audit.filter((record) => record.ev === "agent.call");
    assert.deepEqual(
      calls.map((record) => [record.tool, record.toolClass, record.outcome, record.code]),
      [
        ["xo_search", "read", "ok", undefined],
        ["xo_submit_order", "submit", "refused", "not_armed"],
      ],
    );
    for (const record of calls) {
      assert.match(record.argsHash ?? "", /^[0-9a-f]{16}$/);
      assert.match(record.tokenId ?? "", /^[0-9a-f]{8}$/);
    }
  });

  it("writes pending before a send and the result after it, with the same arguments hash", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    await d.arm(await d.uiToken());
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID, signature: "0xdeadbeef" });
    const calls = d.audit.filter((record) => record.ev === "agent.call");
    assert.deepEqual(calls.map((record) => record.outcome), ["pending", "ok"]);
    assert.equal(calls[0]?.argsHash, calls[1]?.argsHash);
    assert.equal(calls[0]?.preparedId, ID.slice(0, 8));
  });

  it("records refused calls, including an unknown tool, a missing scope and a duplicate", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const ui = await d.uiToken();
    await d.tool(ui, "xo_new_tool");
    await d.tool(ui, "xo_submit_order", { prepared_id: ID });
    await d.arm(ui);
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    const refused = d.audit.filter((record) => record.ev === "agent.call" && record.outcome === "refused").map((record) => record.code);
    assert.deepEqual(refused, ["scope_denied", "scope_denied", "prepared_used"]);
  });

  it("never puts a token, a signature, the arguments or the tool's text into an audit record", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const ui = await d.uiToken();
    const signature = `0x${"7e".repeat(65)}`;
    d.runner.next = () => ({ isError: false, text: "secret-looking text from the tool", structured: { outcome: "submitted", note: "do not log me" } });
    await d.arm(ui);
    await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID, signature });
    const dump = JSON.stringify(d.audit, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
    assert.doesNotMatch(dump, TOKEN_SCAN_PATTERN);
    assert.ok(!dump.includes(ui) && !dump.includes(d.agentToken));
    assert.ok(!dump.includes(signature) && !dump.includes("7e7e7e7e"));
    assert.ok(!dump.includes("secret-looking") && !dump.includes("do not log me"));
    assert.ok(!dump.includes(ID), "a prepared id is logged only as its first eight characters");
  });
});

describe("what comes back from a tool", () => {
  it("reports a tool error in the response without turning the HTTP status into an error", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    d.runner.next = () => ({ isError: true, text: "The relay refused.", structured: { outcome: "refused", code: "cap_exceeded" } });
    const reply = await d.tool(await d.uiToken(), "xo_prepare_order", {});
    assert.equal(reply.status, 200);
    const body = toolCallResponseSchema.parse(reply.json());
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, "cap_exceeded");
  });

  it("maps an unknown error code to internal rather than echoing it", async () => {
    const d = await gate();
    d.runner.next = () => ({ isError: true, text: null, structured: { code: "made_up_code" } });
    const body = toolCallResponseSchema.parse((await d.tool(await d.uiToken(), "xo_search")).json());
    assert.equal(body.error?.code, "internal");
  });

  it("removes anything shaped like a Cockpit token from the text", async () => {
    const d = await gate();
    const leaked = `cku_${"A".repeat(43)}`;
    d.runner.next = () => ({ isError: false, text: `before ${leaked} after`, structured: null });
    const body = toolCallResponseSchema.parse((await d.tool(await d.uiToken(), "xo_search")).json());
    assert.ok(!(body.text ?? "").includes(leaked));
    assert.match(body.text ?? "", /before .* after/);
  });

  it("caps the text", async () => {
    const d = await gate();
    d.runner.next = () => ({ isError: false, text: "x".repeat(50_000), structured: null });
    const body = toolCallResponseSchema.parse((await d.tool(await d.uiToken(), "xo_search")).json());
    assert.equal(body.text?.length, 20_000);
  });

  it("rejects an extra field and a bad tool name at the door", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    assert.equal((await postJson(d.port, "/ui/tool", { tool: "xo_search", args: {}, flags: "ENABLE_TRADING=1" }, bearer(ui))).status, 400);
    assert.equal((await postJson(d.port, "/ui/tool", { tool: "Xo Search", args: {} }, bearer(ui))).status, 400);
    assert.equal(d.runner.calls.length, 0);
  });

  it("needs a token", async () => {
    const d = await gate();
    assert.equal((await postJson(d.port, "/ui/tool", { tool: "xo_search", args: {} })).status, 401);
  });
});

describe("the route guard", () => {
  const route = (path: string, scope: "read" | "prepare" | "submit", method: "GET" | "POST" = "POST") =>
    defineRoute({ method, path, access: { scope }, ...(method === "POST" ? { body: "raw" as const } : {}), handler: () => json({ ran: path }) });

  it("denies a route the class table does not know", async () => {
    const d = await gate({
      extraRouteKeys: ["POST /ui/extra"],
      extraModules: [{ name: "extra", source: { name: "extra", routes: [route("/ui/extra", "read")] } }],
    });
    const reply = await postJson(d.port, "/ui/extra", {}, bearer(await d.uiToken()));
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
  });

  it("denies a route registered with less scope than its class needs", async () => {
    const d = await gate({ extraModules: [{ name: "loose", source: { name: "loose", routes: [route("/ui/prepare/order", "read")] } }] });
    const reply = await postJson(d.port, "/ui/prepare/order", {}, bearer(await d.uiToken()));
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
  });

  it("lets a correctly registered prepare route run, and refuses it after the kill", async () => {
    const d = await gate({ extraModules: [{ name: "prep", source: { name: "prep", routes: [route("/ui/prepare/order", "prepare")] } }] });
    const ui = await d.uiToken();
    assert.equal((await postJson(d.port, "/ui/prepare/order", {}, bearer(ui))).status, 200);
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    const after = await postJson(d.port, "/ui/prepare/order", {}, bearer(ui));
    assert.equal(after.status, 503);
    assert.equal(code(after), "kill_switch");
  });

  it("makes a submit route (the daemon's own signing) agent-only and window-gated", async () => {
    const d = await gate({
      env: ARMABLE_ENV,
      extraModules: [{ name: "sign", source: { name: "sign", routes: [route("/ui/inbox/sign", "submit")] } }],
    });
    const ui = await d.uiToken();
    // the page token: its scopes lack submit
    assert.equal(code(await postJson(d.port, "/ui/inbox/sign", {}, bearer(ui))), "scope_denied");
    // the agent token, no window
    const closed = await postJson(d.port, "/ui/inbox/sign", {}, bearer(d.agentToken));
    assert.equal(closed.status, 403);
    assert.equal(code(closed), "not_armed");
    await d.arm(ui);
    assert.equal((await postJson(d.port, "/ui/inbox/sign", {}, bearer(d.agentToken))).status, 200);
  });

  it("serves a read route to both kinds with no window and after the kill", async () => {
    const d = await gate({ extraModules: [{ name: "status", source: { name: "status", routes: [route("/ui/status", "read", "GET")] } }] });
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    const { send } = await import("../server/helpers.js");
    assert.equal((await send({ port: d.port, path: "/ui/status", headers: bearer(ui) })).status, 200);
    assert.equal((await send({ port: d.port, path: "/ui/status", headers: bearer(d.agentToken) })).status, 200);
  });
});
