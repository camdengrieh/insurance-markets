import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createHash } from "node:crypto";

import { mintAgentToken, tokenId } from "../../auth.js";
import { TOOL_NAMES } from "../../tool-classes.js";
import { fileTokenSource, inProcessCatalog, envTokenSource, type ToolDefinition } from "../../shim.js";
import { postJson, bearer, seededRandom } from "../server/helpers.js";
import { ARMABLE_ENV, startGateDaemon, type GateDaemon } from "../tools/helpers.js";
import { connectShim, scratch, shimCode, textOf, type Scratch, type ShimClient } from "./helpers.js";

// The shim against the real daemon front (bridge/server.ts) with the real tool-class table, ARM window and kill
// route, and a recording fake tool runner behind them. What the shim must not do is decide anything itself: every
// refusal below is the daemon's.

const PREPARED = "0123456789abcdef0123456789abcdef";
const TOOLS: readonly ToolDefinition[] = [
  { name: "xo_search", description: "read", inputSchema: { type: "object" } },
  { name: "xo_prepare_order", description: "prepare", inputSchema: { type: "object" } },
  { name: "xo_submit_userop", description: "submit", inputSchema: { type: "object" } },
];

async function shimFor(daemon: GateDaemon, box: Scratch, token: string = daemon.agentToken): Promise<ShimClient> {
  box.daemonFile({ port: daemon.port });
  return connectShim({ dataDir: box.dir, tokens: fileTokenSource(box.tokenFile(token)), catalog: async () => TOOLS });
}

describe("against the real daemon front", () => {
  let box: Scratch;
  let daemon: GateDaemon;
  let client: ShimClient;
  beforeEach(() => {
    box = scratch();
  });
  afterEach(async () => {
    await client?.close();
    await daemon?.stop();
    box.cleanup();
  });

  it("passes the identity check, runs a read tool and shows the same call in the daemon's own runner", async () => {
    daemon = await startGateDaemon();
    client = await shimFor(daemon, box);
    const reply = await client.call("xo_search", { query: "bond" });
    assert.equal(reply.result?.["isError"], false);
    assert.deepEqual(reply.result?.["structuredContent"], { outcome: "submitted" });
    assert.deepEqual(daemon.runner.calls, [{ tool: "xo_search", args: { query: "bond" } }]);
  });

  it("shares one daemon with the page: the page's token and the shim's draw on the same per-token ledger of calls", async () => {
    daemon = await startGateDaemon();
    client = await shimFor(daemon, box);
    await client.call("xo_search", { query: "a" });
    assert.equal((await daemon.tool(await daemon.uiToken(), "xo_search", { query: "b" })).status, 200);
    assert.deepEqual(
      daemon.runner.calls.map((call) => call.args["query"]),
      ["a", "b"],
    );
    assert.ok(daemon.audit.some((record) => record.ev === "agent.call"));
  });

  it("with every flag OFF and no ARM window, a submit is refused by the daemon as not_armed and nothing runs", async () => {
    daemon = await startGateDaemon();
    client = await shimFor(daemon, box);
    const reply = await client.call("xo_submit_userop", { prepared_id: PREPARED });
    assert.equal(reply.result?.["isError"], true);
    assert.equal(shimCode(reply), "not_armed");
    assert.equal(daemon.runner.calls.length, 0);
  });

  it("a submit goes through only in an open ARM window, and a second submit of the same item is refused by the daemon", async () => {
    daemon = await startGateDaemon({ env: ARMABLE_ENV });
    client = await shimFor(daemon, box);
    assert.equal((await daemon.arm(await daemon.uiToken())).status, 200);
    const first = await client.call("xo_submit_userop", { prepared_id: PREPARED });
    assert.equal(first.result?.["isError"], false);
    const second = await client.call("xo_submit_userop", { prepared_id: PREPARED });
    assert.equal(shimCode(second), "prepared_used");
    assert.match(textOf(second), /already submitted/);
    assert.equal(daemon.runner.calls.length, 1, "sent once");
  });

  it("a token whose ceiling is read cannot prepare: the daemon answers scope_denied and the shim adds nothing", async () => {
    daemon = await startGateDaemon({ scopes: ["read"] });
    client = await shimFor(daemon, box);
    assert.equal((await client.call("xo_search")).result?.["isError"], false);
    const refused = await client.call("xo_prepare_order", {});
    assert.equal(shimCode(refused), "scope_denied");
    assert.equal(daemon.runner.calls.length, 1);
  });

  it("after the kill route is used, prepare calls are refused and reads still work", async () => {
    daemon = await startGateDaemon({ env: ARMABLE_ENV });
    client = await shimFor(daemon, box);
    const ui = await daemon.uiToken();
    assert.equal((await postJson(daemon.port, "/ui/kill", {}, bearer(ui))).status, 200);
    const refused = await client.call("xo_prepare_order", {});
    assert.equal(refused.result?.["isError"], true);
    assert.notEqual(shimCode(refused), undefined);
    assert.equal((await client.call("xo_search")).result?.["isError"], false);
    assert.equal(daemon.runner.calls.filter((call) => call.tool === "xo_prepare_order").length, 0);
  });

  it("after `serve --rotate-agent-token` the shim reads the new token from its file on the next call; a stale file keeps failing closed", async () => {
    daemon = await startGateDaemon();
    client = await shimFor(daemon, box);
    assert.equal((await client.call("xo_search")).result?.["isError"], false);
    // The daemon rotates: the old token stops working at once and a new one is printed once.
    const next = mintAgentToken(seededRandom("rotated"));
    daemon.auth.setAgentHash({ id: tokenId(next), sha256: createHash("sha256").update(next, "utf8").digest("hex") });
    // The user has not saved it yet: refused, once, with the way out.
    const stale = await client.call("xo_search");
    assert.equal(shimCode(stale), "token_rejected");
    assert.match(textOf(stale), /rotate-agent-token/);
    // The user saves the new token over the file; the next call needs no restart.
    box.tokenFile(next);
    assert.equal((await client.call("xo_search")).result?.["isError"], false);
    assert.equal(daemon.runner.calls.length, 2);
  });

  it("a read-only daemon instance still answers reads and passes its refusals on for the rest", async () => {
    daemon = await startGateDaemon({ role: "read_only" });
    client = await shimFor(daemon, box);
    assert.equal((await client.call("xo_search")).result?.["isError"], false);
    const refused = await client.call("xo_prepare_order", {});
    assert.equal(refused.result?.["isError"], true);
  });

  it("does not send the token to the daemon's address when it is given as localhost", async () => {
    daemon = await startGateDaemon();
    const bad = await connectShim({ url: `http://localhost:${daemon.port}`, tokens: envTokenSource(daemon.agentToken), catalog: async () => TOOLS });
    try {
      const reply = await bad.call("xo_search");
      assert.equal(shimCode(reply), "daemon_unreachable");
    } finally {
      await bad.close();
    }
    client = bad;
  });
});

describe("the default catalogue", () => {
  it("lists exactly the tools the daemon's class table knows, with their schemas and the user-interaction marker", async () => {
    const tools = await inProcessCatalog()();
    assert.deepEqual([...tools.map((tool) => tool.name)].sort(), [...TOOL_NAMES].sort());
    for (const tool of tools) assert.equal(typeof tool["inputSchema"], "object", tool.name);
    const submit = tools.find((tool) => tool.name === "xo_submit_order");
    assert.equal((submit?.["_meta"] as Record<string, unknown> | undefined)?.["anthropic/requiresUserInteraction"], true);
  });
});
