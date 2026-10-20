import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { AUDIT_EXEMPT_KEYS, attachAuditSink, bridgeModule as auditModule } from "../../audit-adapter.js";
import { bridgeModule as inboxModule } from "../../inbox.js";
import { bridgeErrorResponseSchema } from "../../contract.js";
import { bridgeModule as signerModule } from "../../paybox-signer.js";
import { bearer, postJson } from "../server/helpers.js";
import { FakeSink } from "../events/helpers.js";
import { ARMABLE_ENV, startGateDaemon, type GateDaemon } from "./helpers.js";

// An unwritable audit log refuses everything that prepares or sends (review findings TM-06 and the gap found while
// writing it). The agent's tool calls arrive on POST /ui/tool and the MCP endpoint, which are registered at scope
// `read`, so the route guard cannot see their class; the tool gate has to ask. Reads, the kill and the disarm stay open.

const started: GateDaemon[] = [];
afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
});

const ID = "ab".repeat(16);

// `sticky`: a log that stays unwritable even after the probe write (the fake sink heals on a write otherwise).
async function rig(sticky = true): Promise<{ readonly d: GateDaemon; readonly sink: FakeSink; readonly ui: string }> {
  // The audit module goes first among the extras; the class guard of the tool-classes module still runs before it.
  const d = await startGateDaemon({
    env: ARMABLE_ENV,
    extraModules: [
      { name: "audit-adapter", source: auditModule },
      { name: "inbox", source: inboxModule },
      { name: "paybox-signer", source: signerModule },
    ],
  });
  started.push(d);
  const sink = new FakeSink();
  if (sticky) {
    sink.write = async (event) => {
      sink.written.push(event);
    };
  }
  attachAuditSink(d.daemon.host, sink);
  return { d, sink, ui: await d.uiToken() };
}

const reasonOf = (reply: { json(): unknown }): unknown => bridgeErrorResponseSchema.parse(reply.json()).error.details?.["reason"];
const codeOf = (reply: { json(): unknown }): string => bridgeErrorResponseSchema.parse(reply.json()).error.code;

describe("the audit-exempt set is exactly the two risk-reducing routes (TM-06)", () => {
  it("lists the kill and the disarm and nothing else", () => {
    assert.deepEqual([...AUDIT_EXEMPT_KEYS].sort(), ["POST /ui/disarm", "POST /ui/kill"]);
  });
});

describe("tool calls while the audit log cannot be written", () => {
  it("refuses a prepare tool and a submit tool, and never reaches the tool runner", async () => {
    const { d, sink, ui } = await rig();
    assert.equal((await d.arm(ui)).status, 200, "healthy: the window opens");
    sink.ok = false;
    const prepare = await d.tool(d.agentToken, "xo_deploy_enable_trading", { step: "prepare" });
    assert.equal(prepare.status, 422);
    assert.equal(codeOf(prepare), "precondition_failed");
    assert.equal(reasonOf(prepare), "audit_log_unwritable");
    const submit = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(submit.status, 422);
    assert.equal(reasonOf(submit), "audit_log_unwritable");
    assert.equal(d.runner.calls.length, 0, "nothing was forwarded");
  });

  it("keeps reads open, and the page's tool terminal follows the same rule", async () => {
    const { d, sink, ui } = await rig();
    sink.ok = false;
    assert.equal((await d.tool(d.agentToken, "xo_search", { query: "x" })).status, 200, "a read tool is allowed");
    const viaPage = await d.tool(ui, "xo_prepare_order", {});
    assert.equal(viaPage.status, 422);
    assert.equal(reasonOf(viaPage), "audit_log_unwritable");
  });

  it("works again once the log can be written", async () => {
    const { d, sink } = await rig(false);
    sink.ok = false;
    assert.equal((await d.tool(d.agentToken, "xo_deploy_enable_trading", { step: "prepare" })).status, 422);
    // The refusal made one probe write; the fake sink heals on a successful write.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sink.healthy(), true);
    assert.equal((await d.tool(d.agentToken, "xo_deploy_enable_trading", { step: "prepare" })).status, 200);
  });

  it("treats a sink whose health check throws as unhealthy (AU3)", async () => {
    const { d, sink } = await rig();
    sink.healthy = () => {
      throw new Error("health check broke");
    };
    const reply = await d.tool(d.agentToken, "xo_deploy_enable_trading", { step: "prepare" });
    assert.equal(reply.status, 422);
    assert.equal(reasonOf(reply), "audit_log_unwritable");
  });

  it("a daemon with no audit module has no log to be unhealthy, so tools run as before", async () => {
    const d = await startGateDaemon({ env: ARMABLE_ENV });
    started.push(d);
    assert.equal((await d.tool(d.agentToken, "xo_deploy_enable_trading", { step: "prepare" })).status, 200);
  });
});

describe("every route that prepares or sends is refused while the audit log cannot be written (TM-06)", () => {
  it("covers each registered route above read scope, and leaves the kill and disarm open", async () => {
    const { d, sink, ui } = await rig();
    // Open the window while the log is healthy so the class guard lets the submit route through to the audit guard.
    assert.equal((await d.arm(ui)).status, 200);
    sink.ok = false;
    const routes = d.daemon.host.routes().filter((route) => route.access !== "public" && route.access.scope !== "read");
    const keys = routes.map((route) => route.key).sort();
    assert.ok(keys.includes("POST /ui/arm") && keys.includes("POST /ui/arm/confirm") && keys.includes("POST /ui/inbox/decision") && keys.includes("POST /ui/inbox/sign"), `route set: ${keys.join(", ")}`);
    for (const route of routes) {
      // Spelled out here, not read from the module: a widened exempt set must not widen this test too.
      if (route.key === "POST /ui/kill" || route.key === "POST /ui/disarm") continue;
      const [method, path] = route.key.split(" ") as [string, string];
      assert.equal(method, "POST", route.key);
      const token = route.access !== "public" && route.access.scope === "submit" ? d.agentToken : ui;
      const reply = await postJson(d.port, path, {}, bearer(token));
      assert.equal(reply.status, 422, `${route.key} answered ${String(reply.status)}: ${reply.text}`);
      assert.equal(reasonOf(reply), "audit_log_unwritable", route.key);
    }
    assert.equal((await postJson(d.port, "/ui/kill", {}, bearer(ui))).status, 200, "the kill stays open");
    assert.equal((await postJson(d.port, "/ui/disarm", {}, bearer(ui))).status, 200, "disarm stays open");
  });
});
