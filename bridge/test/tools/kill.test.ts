import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import type { CockpitContext } from "../../../src/local/cli.js";
import type { LocalRuntime } from "../../../src/local/runtime.js";
import { armControllerOf } from "../../arming.js";
import { bridgeErrorResponseSchema, killResponseSchema } from "../../contract.js";
import { KillController, killControllerOf } from "../../kill.js";
import * as killModuleExports from "../../kill.js";
import { startCockpitDaemon, type CockpitDaemonHandle } from "../../main.js";
import { createStaticSite } from "../../static.js";
import { bridgeModule as armingModule } from "../../arming.js";
import { bridgeModule as killModule } from "../../kill.js";
import { createToolClassesModule } from "../../tool-classes.js";
import { bearer, captureStderr, fakeClock, postJson, seededRandom, send } from "../server/helpers.js";
import { ARMABLE_ENV, fakeRunner, startGateDaemon, type GateDaemon } from "./helpers.js";

const started: GateDaemon[] = [];
const handles: CockpitDaemonHandle[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (started.length > 0) await started.pop()?.stop();
  while (handles.length > 0) await handles.pop()?.close();
  while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true });
});
async function gate(options: Parameters<typeof startGateDaemon>[0] = { env: ARMABLE_ENV }): Promise<GateDaemon> {
  const daemon = await startGateDaemon(options);
  started.push(daemon);
  return daemon;
}
const code = (reply: { json(): unknown }): string => bridgeErrorResponseSchema.parse(reply.json()).error.code;

describe("POST /ui/kill", () => {
  it("latches the daemon and the relay, answers KILLED, and audits it once", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    const reply = await postJson(d.port, "/ui/kill", {}, bearer(ui));
    assert.equal(reply.status, 200);
    assert.deepEqual(killResponseSchema.parse(reply.json()), { kill: true, posture: "KILLED" });
    assert.equal(d.kills.length, 1);
    assert.match(d.kills[0] ?? "", /^cockpit: /);
    const events = d.audit.filter((record) => record.ev === "ui.kill");
    assert.deepEqual(events.map((record) => [record.outcome, record.state]), [["ok", "relay_latched"]]);
    assert.match(events[0]?.tokenId ?? "", /^[0-9a-f]{8}$/);
  });

  it("works for an agent token with the lowest scope, and on a read-only instance", async () => {
    const agent = await gate({ env: ARMABLE_ENV, scopes: ["read"] });
    assert.equal((await postJson(agent.port, "/ui/kill", {}, bearer(agent.agentToken))).status, 200);
    const readonly = await gate({ env: ARMABLE_ENV, role: "read_only" });
    assert.equal((await postJson(readonly.port, "/ui/kill", {}, bearer(await readonly.uiToken()))).status, 200);
  });

  it("needs a token", async () => {
    const d = await gate();
    assert.equal((await postJson(d.port, "/ui/kill", {})).status, 401);
    assert.equal(d.kills.length, 0);
  });

  it("rejects a body with fields, so it carries no hidden setting", async () => {
    const d = await gate();
    const reply = await postJson(d.port, "/ui/kill", { reason: "x", flags: { ENABLE_TRADING: "1" } }, bearer(await d.uiToken()));
    assert.equal(reply.status, 400);
    assert.equal(d.kills.length, 0);
  });

  it("still answers KILLED when no relay is running, and says the relay was not reached", async () => {
    const d = await gate({ env: ARMABLE_ENV, killHost: async () => false });
    const reply = await postJson(d.port, "/ui/kill", {}, bearer(await d.uiToken()));
    assert.equal(reply.status, 200);
    assert.equal(d.audit.find((record) => record.ev === "ui.kill")?.state, "local_only");
    const after = await d.tool(d.agentToken, "xo_prepare_order", {});
    assert.equal(code(after), "kill_switch");
  });

  it("still answers KILLED when the relay hook throws", async () => {
    const d = await gate({
      env: ARMABLE_ENV,
      killHost: async () => {
        throw new Error("relay down");
      },
    });
    const reply = await postJson(d.port, "/ui/kill", {}, bearer(await d.uiToken()));
    assert.equal(reply.status, 200);
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
  });

  it("is idempotent: a second press answers the same, calls the relay again harmlessly and notes it", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    const second = await postJson(d.port, "/ui/kill", {}, bearer(ui));
    assert.equal(second.status, 200);
    const events = d.audit.filter((record) => record.ev === "ui.kill");
    assert.equal(events.length, 2);
    assert.equal(events[1]?.note, "already engaged");
  });
});

describe("after the kill (M4-10: kill is one way)", () => {
  it("refuses prepare and submit, serves reads, and stays that way", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await d.arm(ui);
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    const prepare = await d.tool(ui, "xo_prepare_order", {});
    assert.equal(prepare.status, 503);
    assert.equal(code(prepare), "kill_switch");
    assert.equal(code(await d.tool(d.agentToken, "xo_submit_order", { prepared_id: "ab".repeat(16) })), "kill_switch");
    assert.equal((await d.tool(ui, "xo_search")).status, 200);
    d.clock.now += 3_600_000;
    assert.equal(code(await d.tool(ui, "xo_prepare_order", {})), "kill_switch");
    assert.equal(d.runner.calls.filter((call) => call.tool !== "xo_search").length, 0);
  });

  it("has no way back: no un-kill route, and no function that lifts the latch", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    for (const path of ["/ui/unkill", "/ui/kill/reset", "/ui/resume", "/ui/flags"]) {
      assert.equal((await postJson(d.port, path, {}, bearer(ui))).status, 404, path);
    }
    const deleted = await send({ port: d.port, method: "DELETE", path: "/ui/kill", headers: bearer(ui) });
    assert.ok(deleted.status === 404 || deleted.status === 405, `DELETE /ui/kill answered ${deleted.status}`);
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
    const members = [...Object.getOwnPropertyNames(KillController.prototype), ...Object.keys(killModuleExports)];
    assert.deepEqual(members.filter((name) => /(?:un|re)(?:kill|set|lease|lax|sume)|lift|clear|disengage|release/i.test(name)), []);
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
  });

  it("is set before the relay answers: a slow relay cannot delay the refusal", async () => {
    let release: (value: boolean) => void = () => undefined;
    const slow = new Promise<boolean>((resolve) => (release = resolve));
    const d = await gate({ env: ARMABLE_ENV, killHost: () => slow });
    const ui = await d.uiToken();
    const pending = postJson(d.port, "/ui/kill", {}, bearer(ui));
    for (let i = 0; i < 200 && d.kills.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
    assert.equal(code(await d.tool(d.agentToken, "xo_prepare_order", {})), "kill_switch");
    release(true);
    assert.equal((await pending).status, 200);
  });

  it("is learned from the relay too: a tool that answers kill_switch (a SIGUSR2 reaches only the relay)", async () => {
    const d = await gate();
    d.runner.next = () => ({ isError: true, text: null, structured: { outcome: "refused", code: "kill_switch" } });
    await d.tool(d.agentToken, "xo_prepare_order", {});
    d.runner.next = () => ({ isError: false, text: null, structured: null });
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
    assert.equal(code(await d.tool(d.agentToken, "xo_prepare_order", {})), "kill_switch");
  });

  it("is learned from a probe wired to the relay's own state, and closes the window", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await d.arm(ui);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    let relayKilled = false;
    killControllerOf(d.daemon.host).observe(() => relayKilled);
    assert.equal(killControllerOf(d.daemon.host).engaged(), false);
    relayKilled = true;
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
    // a probe can only add a kill, never remove one
    relayKilled = false;
    assert.equal(killControllerOf(d.daemon.host).engaged(), true);
  });

  it("ignores a probe that throws", async () => {
    const d = await gate();
    killControllerOf(d.daemon.host).observe(() => {
      throw new Error("probe");
    });
    assert.equal(killControllerOf(d.daemon.host).engaged(), false);
  });

  it("ignores any answer code other than exactly kill_switch", async () => {
    const d = await gate();
    for (const word of ["KILL_SWITCH", "kill", "flag_off", undefined, 5, "kill_switch "]) killControllerOf(d.daemon.host).observeCode(word);
    assert.equal(killControllerOf(d.daemon.host).engaged(), false);
  });
});

describe("a daemon that starts killed", () => {
  it("honours KILL and XO_KILL_SWITCH, and a garbage value as ON", async () => {
    for (const env of [{ KILL: "1" }, { XO_KILL_SWITCH: "on" }, { KILL: "banana" }, { ...ARMABLE_ENV, KILL: "true" }] as Array<Record<string, string>>) {
      const d = await gate({ env });
      const ui = await d.uiToken();
      assert.equal(killControllerOf(d.daemon.host).engaged(), true, JSON.stringify(env));
      assert.equal(code(await d.tool(ui, "xo_prepare_order", {})), "kill_switch", JSON.stringify(env));
      assert.equal((await d.tool(ui, "xo_search")).status, 200);
    }
  });

  it("is not killed by a flag that is merely off", async () => {
    const d = await gate({ env: { ENABLE_TRADING: "0", KILL: "0" } });
    assert.equal(killControllerOf(d.daemon.host).engaged(), false);
  });
});

describe("A1: the hook in src/local/cli.ts (context.engageKill)", () => {
  function context(dataDir: string, kill: (reason: string) => Promise<boolean>, stderr = captureStderr()): CockpitContext {
    const ready = { state: "ready", dataDir, dataDirCreated: false, relay: {} as never, masterKey: null } as const;
    const runtime: LocalRuntime = {
      handler: async () => ({ status: 200, bodyText: "{}" }),
      status: () => ready,
      start: async () => ready,
      close: async () => undefined,
    };
    return { args: [], env: ARMABLE_ENV, runtime, version: "0.0.0-test", stderr, engageKill: kill };
  }

  it("POST /ui/kill calls context.engageKill, the function SIGUSR2 uses, with the daemon's reason", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cockpit-kill-"));
    dirs.push(dir);
    const reasons: string[] = [];
    const stderr = captureStderr();
    const handle = await startCockpitDaemon(context(dir, async (reason) => (reasons.push(reason), true), stderr), {
      modules: [
        { name: "tool-classes", source: createToolClassesModule({ runner: fakeRunner() }) },
        { name: "arming", source: armingModule },
        { name: "kill", source: killModule },
      ],
      site: createStaticSite(dir),
      clock: fakeClock(),
      random: seededRandom("a1"),
    });
    handles.push(handle);
    assert.equal(handle.role, "writer");
    const pairCode = /#pair=([0-9a-f]{32})/.exec(stderr.text())?.[1];
    assert.ok(pairCode, "the pairing link is on stderr");
    const paired = await postJson(handle.daemon.port, "/ui/pair", { code: pairCode });
    const ui = (paired.json() as { token: string }).token;
    assert.deepEqual(reasons, []);
    const reply = await postJson(handle.daemon.port, "/ui/kill", {}, bearer(ui));
    assert.equal(reply.status, 200);
    assert.deepEqual(reasons, ["cockpit: kill button"]);
    // and from now on nothing is prepared
    const tool = await postJson(handle.daemon.port, "/ui/tool", { tool: "xo_prepare_order", args: {} }, bearer(ui));
    assert.equal(tool.status, 503);
  });

  it("the real module files load through bridge/main's discovery, in the order the daemon needs", async () => {
    const { loadOptionalModules } = await import("../../main.js");
    const loaders = ["tool-classes", "arming", "kill"].map((name) => ({ name, load: () => import(`../../${name}.js`) as Promise<unknown> }));
    const modules = await loadOptionalModules(loaders);
    assert.deepEqual(modules.map((entry) => entry.name), ["tool-classes", "arming", "kill"]);
    for (const entry of modules) assert.equal(typeof entry.source, "function");
  });
});
