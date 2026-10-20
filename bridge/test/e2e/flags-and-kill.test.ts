import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import { bridgeErrorResponseSchema, killResponseSchema, pairResponseSchema, readProxyResponseSchema, toolCallResponseSchema, uiEventSchema } from "../../contract.js";
import { bearer, makeFixtureApp, openSse, startE2eDaemon, type E2eDaemon, type Reply } from "./harness.js";

// The write side as the daemon ships it: every flag OFF (the launcher passes no environment at all), so arming
// is refused, no submit-class call goes through, the kill is one-way, and a second instance on a locked
// data directory serves reads only and says so. M1-8 and M1-10 as far as a daemon with a stand-in relay can show
// them; the relay's own refusals are covered by the relay and plugin tests.

let appDir: string;
before(async () => {
  appDir = await makeFixtureApp();
});
after(async () => {
  await rm(appDir, { recursive: true, force: true });
});

function code(reply: Reply): string | undefined {
  const parsed = bridgeErrorResponseSchema.safeParse(reply.json());
  return parsed.success ? parsed.data.error.code : undefined;
}

describe("every flag OFF", () => {
  let daemon: E2eDaemon;
  let token: string;
  before(async () => {
    daemon = await startE2eDaemon({ appDir, hostile: false });
    await daemon.waitForLink(1);
    token = (await daemon.pair()).token;
  });
  after(async () => {
    await daemon.stop();
  });

  it("refuses to arm, and prints no ARM code", async () => {
    const reply = await daemon.postJson("/ui/arm", { minutes: 5 }, bearer(token));
    assert.ok(reply.status >= 400, `status ${reply.status}`);
    assert.equal(code(reply), "flag_off");
    assert.doesNotMatch(daemon.stderr(), /ARM code|arm code/i);
    const confirm = await daemon.postJson("/ui/arm/confirm", { code: "ABCDEFGH" }, bearer(token));
    assert.ok(confirm.status >= 400 && confirm.status < 500);
  });

  it("refuses a submit-class tool call from a page token: the class table says no before any tool runs", async () => {
    for (const tool of ["xo_submit_order", "xo_submit_userop", "xo_cancel_order", "xo_submit_create_market", "xo_place_seed"]) {
      const reply = await daemon.postJson("/ui/tool", { tool, args: { prepared_id: "0".repeat(32) } }, bearer(token));
      assert.equal(reply.status, 403, `${tool} -> ${reply.status}`);
      assert.equal(code(reply), "scope_denied");
    }
    const unknown = await daemon.postJson("/ui/tool", { tool: "xo_not_a_tool", args: {} }, bearer(token));
    assert.equal(unknown.status, 403, "a tool outside the class table is denied");
    assert.equal(code(unknown), "scope_denied");
  });

  it("M1-10: a write-class tool that is allowed through the gate comes back refused, flag_off, with nothing signed or sent", async () => {
    const owner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const order = await daemon.postJson("/ui/tool", { tool: "xo_prepare_order", args: { owner, token_id: "1", side: "BUY", price: "0.5", shares: "1" } }, bearer(token));
    assert.equal(order.status, 200, "the gate lets a prepare-class call through; the plugin refuses it");
    const body = toolCallResponseSchema.parse(order.json());
    assert.equal(body.ok, false);
    const structured = body.structured as { outcome?: string; code?: string; prepared?: unknown } | null;
    assert.equal(structured?.outcome, "refused");
    assert.equal(structured?.code, "flag_off");
    assert.equal(structured?.prepared, undefined);
    assert.match(body.text ?? "", /Nothing was signed or sent/);

    const deploy = await daemon.postJson("/ui/tool", { tool: "xo_deploy_enable_trading", args: { owner, step: "prepare" } }, bearer(token));
    const deployBody = toolCallResponseSchema.parse(deploy.json());
    assert.equal(deployBody.ok, false);
    assert.equal((deployBody.structured as { outcome?: string } | null)?.outcome, "refused");
    assert.equal((deployBody.structured as { prepared?: unknown } | null)?.prepared, undefined);
    assert.equal(daemon.kills(), 0);
  });

  it("never reaches a real host, even from a tool that runs inside the daemon", async () => {
    const read = await daemon.postJson("/ui/tool", { tool: "xo_market_prices", args: { condition_id: `0x${"ab".repeat(32)}` } }, bearer(token));
    assert.equal(read.status, 200);
    assert.equal(toolCallResponseSchema.parse(read.json()).ok, false, "the plugin's own fetch was refused by the harness");
    assert.ok(daemon.blockedHosts().includes("orderbooks.xo.market"));
  });

  it("has no route that sets a flag, a cap or the data directory", async () => {
    for (const path of ["/ui/flags", "/ui/config", "/ui/settings", "/ui/caps", "/ui/unkill", "/ui/data-dir"]) {
      for (const method of ["POST", "GET"]) {
        const reply = await daemon.request({ method, path, headers: { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...bearer(token) }, ...(method === "POST" ? { body: "{}" } : {}) });
        assert.ok([401, 403, 404, 405].includes(reply.status), `${method} ${path} -> ${reply.status}`);
        assert.ok(reply.status !== 200);
      }
    }
  });

  it("kills in one call, tells the relay once, stays killed, and offers no way back", async () => {
    const stream = await openSse(daemon.port, "/ui/events", bearer(token));
    const killed = await daemon.postJson("/ui/kill", {}, bearer(token));
    assert.equal(killed.status, 200);
    assert.deepEqual(killResponseSchema.parse(killed.json()), { kill: true, posture: "KILLED" });
    assert.equal(daemon.kills(), 1);
    const again = await daemon.postJson("/ui/kill", {}, bearer(token));
    assert.equal(again.status, 200, "idempotent");
    // The audit feed says so.
    const entry = await stream.waitFor((event) => /kill/i.test(event.data) && JSON.parse(event.data).type === "audit");
    assert.equal(uiEventSchema.parse(JSON.parse(entry.data)).type, "audit");
    stream.close();
    // Nothing lifts it, not another pairing, not a disarm.
    const arm = await daemon.postJson("/ui/arm", { minutes: 5 }, bearer(token));
    assert.ok(arm.status >= 400);
    for (const method of ["DELETE", "POST"]) {
      const lift = await daemon.request({ method, path: "/ui/kill", headers: { "content-type": "application/json", ...bearer(token) }, ...(method === "POST" ? { body: JSON.stringify({ kill: false }) } : {}) });
      if (method === "POST") assert.ok(lift.status === 400 || lift.status === 200, "a POST either repeats the kill or is a bad request");
      if (method === "POST" && lift.status === 200) assert.deepEqual(killResponseSchema.parse(lift.json()), { kill: true, posture: "KILLED" });
    }
    // Reads still work after a kill: a kill stops writes, not the explorer.
    const read = await daemon.getJson("/ui/inbox", token);
    assert.equal(read.status, 200);
  });
});

describe("a second instance on a locked data directory", () => {
  let daemon: E2eDaemon;
  before(async () => {
    daemon = await startE2eDaemon({ appDir, readOnly: true, hostile: false });
    await daemon.waitForLink(1);
  });
  after(async () => {
    await daemon.stop();
  });

  it("says so on stderr and serves reads only", async () => {
    assert.equal(daemon.role, "read_only");
    assert.match(daemon.stderr(), /READ ONLY/);
    assert.match(daemon.stderr(), /Nothing can be prepared or sent from here/);
    const paired = await daemon.postJson("/ui/pair", { code: (daemon.links()[0] as { code: string }).code });
    assert.equal(paired.status, 200);
    const body = pairResponseSchema.parse(paired.json());
    assert.deepEqual([...body.scopes], ["read"], "no prepare scope on a read-only instance");
    const token = body.token;
    const read = await daemon.getJson("/ui/read/xo_data/api/markets?marketType=2,4&statuses=ACTIVE&take=5&page=1", token);
    assert.equal(read.status, 200);
    assert.equal(readProxyResponseSchema.parse(read.json()).upstream_status, 200);
    const tool = await daemon.postJson("/ui/tool", { tool: "xo_prepare_order", args: {} }, bearer(token));
    assert.equal(tool.status, 403);
    const arm = await daemon.postJson("/ui/arm", { minutes: 1 }, bearer(token));
    assert.ok(arm.status >= 400);
    assert.equal(daemon.agentToken(), null, "a read-only instance mints no agent token");
  });

  it("still lets the user kill", async () => {
    // The first code was spent above; a user opening the page again gets a fresh link (the daemon spaces them out).
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await daemon.request({ path: "/", headers: { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-site": "none", accept: "text/html" } });
    const fresh = await daemon.waitForLink(2, 3000);
    const reply = await daemon.postJson("/ui/pair", { code: fresh.code });
    const token = pairResponseSchema.parse(reply.json()).token;
    const kill = await daemon.postJson("/ui/kill", {}, bearer(token));
    assert.equal(kill.status, 200);
    assert.equal(daemon.kills(), 1);
  });
});
