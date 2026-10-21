import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { TOOL_CLASS_TABLE, classifyTool } from "../../tool-classes.js";
import { bearer, postJson } from "../server/helpers.js";
import { startGateDaemon, type GateDaemon } from "./helpers.js";

// The two CLOB venue tools through the daemon's gate: their class by step, what a page token may do, the ARM window,
// a flag-OFF refusal from the tool (which releases the once-only claim) and the once-only submit.

const daemons: GateDaemon[] = [];
afterEach(async () => {
  while (daemons.length > 0) await daemons.pop()?.stop();
});

async function gate(options: Parameters<typeof startGateDaemon>[0] = {}): Promise<GateDaemon> {
  const d = await startGateDaemon({ env: { ENABLE_CLOB_POLYMARKET: "1" }, ...options });
  daemons.push(d);
  return d;
}

const PREPARED = "0123456789abcdef0123456789abcdef";
const SIGNATURE = `0x${"11".repeat(65)}`;

describe("clob_order and clob_auth in the class table", () => {
  it("are stepped: prepare is class prepare, submit (or a missing step) is class submit", () => {
    for (const tool of ["clob_order", "clob_auth"]) {
      assert.deepEqual(TOOL_CLASS_TABLE[tool], { kind: "stepped", prepare: "prepare", submit: "submit" });
      assert.equal(classifyTool(tool, { step: "prepare" }), "prepare");
      assert.equal(classifyTool(tool, { step: "submit" }), "submit");
      assert.equal(classifyTool(tool, {}), "submit");
      assert.equal(classifyTool(tool, { step: "anything" }), "submit");
    }
  });
});

describe("clob_order through POST /ui/tool", () => {
  it("lets a page token prepare, and refuses its submit with scope_denied before the runner is asked", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    const prepared = await d.tool(ui, "clob_order", { step: "prepare", venue: "polymarket", owner: "0x" + "11".repeat(20) });
    assert.equal(prepared.status, 200);
    assert.equal((prepared.json() as { tool_class: string }).tool_class, "prepare");
    assert.equal(d.runner.calls.length, 1);
    const submit = await d.tool(ui, "clob_order", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal(submit.status, 403);
    assert.equal((submit.json() as { error: { code: string } }).error.code, "scope_denied");
    assert.equal(d.runner.calls.length, 1);
  });

  it("refuses an agent's submit with not_armed until a window is open, then forwards it once and refuses the second as prepared_used", async () => {
    const d = await gate();
    const closed = await d.tool(d.agentToken, "clob_order", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal(closed.status, 403);
    assert.equal((closed.json() as { error: { code: string } }).error.code, "not_armed");
    assert.equal(d.runner.calls.length, 0);
    const armed = await d.arm(await d.uiToken());
    assert.equal(armed.status, 200);
    const first = await d.tool(d.agentToken, "clob_order", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal(first.status, 200);
    assert.equal((first.json() as { tool_class: string }).tool_class, "submit");
    assert.equal(d.runner.calls.length, 1);
    const again = await d.tool(d.agentToken, "clob_order", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal(again.status, 409);
    assert.equal((again.json() as { error: { code: string } }).error.code, "prepared_used");
    assert.equal(d.runner.calls.length, 1, "two submits of one item send once");
    // The same item through clob_auth is the same once-only key: the ledger is per prepared id, not per tool.
    const other = await d.tool(d.agentToken, "clob_auth", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal((other.json() as { error: { code: string } }).error.code, "prepared_used");
  });

  it("releases the once-only claim when the tool itself refused (a flag-OFF answer), so a later submit of the same item is forwarded", async () => {
    const d = await gate();
    await d.arm(await d.uiToken());
    d.runner.next = () => ({ isError: true, text: "ENABLE_CLOB_POLYMARKET is off.", structured: { outcome: "refused", code: "flag_off", flag: "ENABLE_CLOB_POLYMARKET" } });
    const refused = await d.tool(d.agentToken, "clob_order", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal(refused.status, 200);
    assert.equal((refused.json() as { ok: boolean }).ok, false);
    assert.equal((refused.json() as { error: { code: string } }).error.code, "flag_off");
    d.runner.next = () => ({ isError: false, text: "ok", structured: { outcome: "accepted" } });
    const later = await d.tool(d.agentToken, "clob_order", { step: "submit", prepared_id: PREPARED, signature: SIGNATURE });
    assert.equal(later.status, 200);
    assert.equal((later.json() as { ok: boolean }).ok, true);
    assert.equal(d.runner.calls.length, 2);
  });

  it("refuses a submit that names no prepared item, and refuses the kill switch", async () => {
    const d = await gate();
    await d.arm(await d.uiToken());
    const noId = await d.tool(d.agentToken, "clob_order", { step: "submit", signature: SIGNATURE });
    assert.equal((noId.json() as { error: { code: string } }).error.code, "invalid_request");
    const killed = await postJson(d.port, "/ui/kill", {}, bearer(await d.uiToken()));
    assert.equal(killed.status, 200);
    const after = await d.tool(d.agentToken, "clob_order", { step: "prepare", venue: "limitless", owner: "0x" + "11".repeat(20) });
    assert.equal((after.json() as { error: { code: string } }).error.code, "kill_switch");
  });
});
