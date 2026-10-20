import assert from "node:assert/strict";
import { request as httpRequest, type ClientRequest } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createMemoryAudit } from "../../../relay/audit.js";
import type { CockpitContext } from "../../../src/local/cli.js";
import type { LocalRuntime, LocalStatus } from "../../../src/local/runtime.js";
import { FLAG_NAMES } from "../../../src/relay/flags.js";
import { verifiedDeployItem } from "../../../test/tools-decoded-helpers.js";
import { bridgeModule as armingModule } from "../../arming.js";
import { bridgeModule as auditModule } from "../../audit-adapter.js";
import { statusResponseSchema, inboxListResponseSchema } from "../../contract.js";
import { bridgeModule as eventsModule } from "../../events.js";
import { bridgeModule as inboxModule } from "../../inbox.js";
import { bridgeModule as killModule } from "../../kill.js";
import { startCockpitDaemon, type CockpitDaemonHandle } from "../../main.js";
import { bridgeModule as statusModule } from "../../status.js";
import { createToolClassesModule } from "../../tool-classes.js";
import { createStaticSite } from "../../static.js";
import { openStream as openSse } from "../events/helpers.js";
import { fakeRunner } from "../tools/helpers.js";
import { bearer, captureStderr, fakeClock, postJson, seededRandom, send, type Captured } from "../server/helpers.js";

// The joins bridge/main.ts makes between the daemon's modules and the in-process relay: the status route reads the
// relay, the kill latch learns of a relay-side kill, and a prepared item in a tool answer reaches the inbox only when
// the relay holds the same record. The relay here is a small stand-in with the real audit log; the daemon, the modules
// and the HTTP front are the real ones.

let dir: string;
let handles: CockpitDaemonHandle[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cockpit-join-"));
  await mkdir(join(dir, "data"), { recursive: true, mode: 0o700 });
  await mkdir(join(dir, "build"));
  await writeFile(join(dir, "build", "index.html"), "<!doctype html><title>cockpit</title>");
  handles = [];
});
afterEach(async () => {
  for (const handle of handles) await handle.close();
  await rm(dir, { recursive: true, force: true });
});

interface FakeRelayState {
  killEngaged: boolean;
  flags: Record<string, boolean>;
  records: Map<string, { id: string; kind: string; owner: string; account: string; digest: string; state: string; detail: string | null }>;
  readonly audit: ReturnType<typeof createMemoryAudit>;
}

function fakeRelay(): { readonly state: FakeRelayState; readonly status: LocalStatus } {
  const state: FakeRelayState = {
    killEngaged: false,
    flags: Object.fromEntries(FLAG_NAMES.map((name) => [name, false])),
    records: new Map(),
    audit: createMemoryAudit(() => Date.UTC(2026, 9, 19, 12, 0, 0)),
  };
  const relay = {
    flags: () => ({ ...state.flags, KILL: state.killEngaged }),
    services: {
      tripwires: { snapshot: () => ({ ok: true, tripped: [] }) },
      upstream: { health: () => ({ "api-mainnet.xo.market": { state: "ok", errors: 0, last_error_at: null } }) },
      capabilities: { snapshot: (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, id === "AD4" ? "yes" : "unknown"])) },
      flagGate: {
        get killEngaged() {
          return state.killEngaged;
        },
      },
      audit: state.audit,
      prepared: { get: (id: string) => state.records.get(id) },
    },
  };
  return { state, status: { state: "ready", dataDir: join(dir, "data"), dataDirCreated: false, relay: relay as never, masterKey: null } };
}

function contextOf(status: LocalStatus, stderr: Captured, env: Record<string, string> = {}): CockpitContext {
  const runtime: LocalRuntime = { handler: async () => ({ status: 200, bodyText: "{}" }), status: () => status, start: async () => status, close: async () => undefined };
  return { args: [], env, runtime, version: "0.0.0-test", stderr, engageKill: async () => true };
}

async function boot(status: LocalStatus, runner = fakeRunner(), env: Record<string, string> = {}) {
  const stderr = captureStderr();
  const handle = await startCockpitDaemon(contextOf(status, stderr, env), {
    modules: [
      { name: "audit-adapter", source: auditModule },
      { name: "tool-classes", source: createToolClassesModule({ runner }) },
      { name: "arming", source: armingModule },
      { name: "kill", source: killModule },
      { name: "events", source: eventsModule },
      { name: "status", source: statusModule },
      { name: "inbox", source: inboxModule },
    ],
    site: createStaticSite(join(dir, "build")),
    clock: fakeClock(),
    random: seededRandom("join"),
  });
  handles.push(handle);
  const code = /#pair=([A-Za-z0-9_-]+)/.exec(stderr.text())?.[1];
  assert.ok(code, "a pairing link is printed");
  const paired = await postJson(handle.daemon.port, "/ui/pair", { code });
  assert.equal(paired.status, 200);
  const ui = (paired.json() as { token: string }).token;
  return { handle, port: handle.daemon.port, ui, stderr, runner };
}

const get = (port: number, path: string, token: string) => send({ port, path, headers: bearer(token) });

describe("GET /ui/status", () => {
  it("answers in the contract's shape, from the relay's own state, with every flag OFF by default", async () => {
    const relay = fakeRelay();
    const { port, ui } = await boot(relay.status);
    const reply = await get(port, "/ui/status", ui);
    assert.equal(reply.status, 200);
    const body = statusResponseSchema.parse(reply.json());
    assert.equal(body.instance, "writer");
    assert.equal(body.kill, false);
    assert.equal(body.posture, "PREPARE");
    assert.equal(body.armed_until, null);
    assert.deepEqual(body.token, { kind: "ui", scopes: ["read", "prepare"] });
    assert.equal(Object.values(body.flags).filter(Boolean).length, 0, "no write flag is on");
    assert.equal(body.capabilities["AD4"], "yes");
    assert.equal(body.capabilities["FU6"], "unknown");
    assert.equal(body.tripwires.ok, true);
    assert.equal(body.upstream["api-mainnet.xo.market"]?.state, "ok");
  });

  it("needs a token, and shows the token's own kind and scopes to the agent", async () => {
    const relay = fakeRelay();
    const { port, handle, stderr } = await boot(relay.status);
    assert.equal((await send({ port, path: "/ui/status" })).status, 401);
    const token = /(cka_[A-Za-z0-9_-]{43})/.exec(stderr.text())?.[1];
    // The test dir has an agent token only when the store wrote one; the stand-in data dir is writable, so it did.
    assert.ok(token, "an agent token is printed once");
    const reply = await get(port, "/ui/status", token);
    assert.equal(reply.status, 200);
    const body = statusResponseSchema.parse(reply.json());
    assert.equal(body.token.kind, "agent");
    assert.ok(!body.token.scopes.includes("submit"), "the agent ceiling is read and prepare by default");
    void handle;
  });

  it("reports a relay that is not running as such: flags OFF, nothing recorded, one tripwire that says why", async () => {
    const failed: LocalStatus = { state: "failed", code: "data_dir_locked", message: "locked", dataDir: join(dir, "data") };
    const { port, ui } = await boot(failed);
    const body = statusResponseSchema.parse((await get(port, "/ui/status", ui)).json());
    assert.equal(body.instance, "read_only");
    assert.equal(body.tripwires.ok, false);
    assert.equal(body.tripwires.tripped[0]?.id, "no_relay");
    assert.equal(Object.values(body.flags).filter(Boolean).length, 0);
    assert.deepEqual(body.capabilities, {});
    assert.deepEqual(body.token.scopes, ["read"]);
  });

  it("treats a relay that says ready but cannot answer as absent, and keeps the audit adapter healthy", async () => {
    const stub: LocalStatus = { state: "ready", dataDir: join(dir, "data"), dataDirCreated: false, relay: {} as never, masterKey: null };
    const { port, ui } = await boot(stub);
    const body = statusResponseSchema.parse((await get(port, "/ui/status", ui)).json());
    assert.equal(body.tripwires.tripped[0]?.id, "no_relay");
    assert.equal(Object.values(body.flags).filter(Boolean).length, 0);
    // A prepare-class route is not refused for an unwritable audit log: the stand-in has no log to fail.
    const armed = await postJson(port, "/ui/arm", { minutes: 1 }, bearer(ui));
    assert.notEqual((armed.json() as { error?: { code?: string } }).error?.code, "internal");
  });

  it("shows KILLED as soon as the relay's own kill is engaged, with no refused write first", async () => {
    const relay = fakeRelay();
    const { port, ui } = await boot(relay.status);
    assert.equal(statusResponseSchema.parse((await get(port, "/ui/status", ui)).json()).kill, false);
    relay.state.killEngaged = true;
    const body = statusResponseSchema.parse((await get(port, "/ui/status", ui)).json());
    assert.equal(body.kill, true);
    assert.equal(body.posture, "KILLED");
  });

  it("shows a page kill too, and never turns it off", async () => {
    const relay = fakeRelay();
    const { port, ui } = await boot(relay.status);
    assert.equal((await postJson(port, "/ui/kill", {}, bearer(ui))).status, 200);
    const body = statusResponseSchema.parse((await get(port, "/ui/status", ui)).json());
    assert.equal(body.kill, true);
    assert.equal(body.posture, "KILLED");
    relay.state.killEngaged = false;
    assert.equal(statusResponseSchema.parse((await get(port, "/ui/status", ui)).json()).kill, true, "a latch stays");
  });

  it("carries the audit head the status bar shows", async () => {
    const relay = fakeRelay();
    const { port, ui } = await boot(relay.status);
    const body = statusResponseSchema.parse((await get(port, "/ui/status", ui)).json());
    assert.match(body.audit_head ?? "", /^0x[0-9a-f]{64}$/);
  });
});

describe("a prepared item in a tool answer reaches the inbox", () => {
  const ARGS = { step: "prepare" } as const;

  it("is listed when the relay holds the same record", async () => {
    const relay = fakeRelay();
    const item = verifiedDeployItem();
    relay.state.records.set(item["prepared_id"] as string, {
      id: item["prepared_id"] as string,
      kind: "userop",
      owner: item["owner"] as string,
      account: item["account"] as string,
      digest: (item["sign"] as { expected_digest: string }).expected_digest,
      state: "prepared",
      detail: null,
    });
    const runner = fakeRunner();
    runner.next = () => ({ isError: false, text: "prepared", structured: { prepared: item } });
    const { port, ui, stderr } = await boot(relay.status, runner);
    const agent = /(cka_[A-Za-z0-9_-]{43})/.exec(stderr.text())?.[1];
    assert.ok(agent);
    const called = await postJson(port, "/ui/tool", { tool: "xo_deploy_enable_trading", args: ARGS }, bearer(agent));
    assert.equal(called.status, 200, called.text);
    const list = inboxListResponseSchema.parse((await get(port, "/ui/inbox", ui)).json());
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0]?.prepared.prepared_id, item["prepared_id"]);
    assert.equal(list.items[0]?.requested_by.startsWith("agent:"), true);
    assert.equal(list.items[0]?.state, "prepared");
  });

  it("is NOT listed when the relay has no such record (a forged or stale answer)", async () => {
    const relay = fakeRelay();
    const runner = fakeRunner();
    runner.next = () => ({ isError: false, text: "prepared", structured: { prepared: verifiedDeployItem() } });
    const { port, ui, stderr } = await boot(relay.status, runner);
    const agent = /(cka_[A-Za-z0-9_-]{43})/.exec(stderr.text())?.[1];
    assert.ok(agent);
    assert.equal((await postJson(port, "/ui/tool", { tool: "xo_deploy_enable_trading", args: ARGS }, bearer(agent))).status, 200);
    assert.equal(inboxListResponseSchema.parse((await get(port, "/ui/inbox", ui)).json()).items.length, 0);
  });

  it("is NOT listed when the relay's digest differs from the item's", async () => {
    const relay = fakeRelay();
    const item = verifiedDeployItem();
    relay.state.records.set(item["prepared_id"] as string, {
      id: item["prepared_id"] as string,
      kind: "userop",
      owner: item["owner"] as string,
      account: item["account"] as string,
      digest: `0x${"ab".repeat(32)}`,
      state: "prepared",
      detail: null,
    });
    const runner = fakeRunner();
    runner.next = () => ({ isError: false, text: "prepared", structured: { prepared: item } });
    const { port, ui, stderr } = await boot(relay.status, runner);
    const agent = /(cka_[A-Za-z0-9_-]{43})/.exec(stderr.text())?.[1];
    assert.ok(agent);
    await postJson(port, "/ui/tool", { tool: "xo_deploy_enable_trading", args: ARGS }, bearer(agent));
    assert.equal(inboxListResponseSchema.parse((await get(port, "/ui/inbox", ui)).json()).items.length, 0);
  });

  it("ignores an answer that carries no prepared item, and a tool that failed", async () => {
    const relay = fakeRelay();
    const runner = fakeRunner();
    const { port, ui, stderr } = await boot(relay.status, runner);
    const agent = /(cka_[A-Za-z0-9_-]{43})/.exec(stderr.text())?.[1];
    assert.ok(agent);
    assert.equal((await postJson(port, "/ui/tool", { tool: "xo_search", args: { query: "x" } }, bearer(agent))).status, 200);
    runner.next = () => ({ isError: true, text: "no", structured: { prepared: verifiedDeployItem(), code: "internal" } });
    await postJson(port, "/ui/tool", { tool: "xo_deploy_enable_trading", args: ARGS }, bearer(agent));
    assert.equal(inboxListResponseSchema.parse((await get(port, "/ui/inbox", ui)).json()).items.length, 0);
  });
});

describe("the audit log", () => {
  it("receives the daemon's own events through the relay's audit writer once the relay is joined", async () => {
    const relay = fakeRelay();
    const { port, ui } = await boot(relay.status);
    await postJson(port, "/ui/kill", {}, bearer(ui));
    const text = relay.state.audit.lines.join("\n");
    assert.match(text, /ui\.kill/);
    assert.match(text, /ui\.pair/);
  });
});

describe("the ARM window follows the relay's effective flags (DS-3)", () => {
  function openStream(port: number, token: string): Promise<ClientRequest> {
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/ui/events", headers: { host: `127.0.0.1:${port}`, ...bearer(token) }, agent: false }, (res) => {
        res.on("data", () => undefined);
        resolve(req);
      });
      req.on("error", () => undefined);
      req.end();
      setTimeout(() => reject(new Error("stream did not open")), 3000).unref();
      streams.push(req);
    });
  }
  const streams: ClientRequest[] = [];
  afterEach(() => {
    for (const req of streams.splice(0)) req.destroy();
  });

  it("refuses to arm while the environment asks for a flag the relay holds back, and arms once the relay turns it on", async () => {
    const relay = fakeRelay();
    const { port, ui, stderr } = await boot(relay.status, fakeRunner(), { ENABLE_TRADING: "1" });
    await openStream(port, ui);
    const status = statusResponseSchema.parse((await get(port, "/ui/status", ui)).json());
    assert.equal(status.flags["ENABLE_TRADING"], false, "the status shows the relay's view: nothing is on");
    const held = await postJson(port, "/ui/arm", { minutes: 1 }, bearer(ui));
    assert.equal(held.status, 403);
    assert.equal((held.json() as { error: { code: string } }).error.code, "flag_off");
    assert.doesNotMatch(stderr.text(), /ARM code/);

    relay.state.flags["ENABLE_TRADING"] = true;
    const asked = await postJson(port, "/ui/arm", { minutes: 1 }, bearer(ui));
    assert.equal(asked.status, 200, asked.text);
    const typed = /ARM code ([2-9A-HJ-NP-Z]{8})/.exec(stderr.text())?.[1];
    assert.ok(typed);
    assert.equal((await postJson(port, "/ui/arm/confirm", { code: typed }, bearer(ui))).status, 200);
    assert.equal(statusResponseSchema.parse((await get(port, "/ui/status", ui)).json()).posture, "ARMED");

    // The relay takes the flag back: the posture drops at once.
    relay.state.flags["ENABLE_TRADING"] = false;
    assert.equal(statusResponseSchema.parse((await get(port, "/ui/status", ui)).json()).posture, "PREPARE");
  });

  it("does not arm over a relay that cannot answer, even with the environment flag on", async () => {
    const stub: LocalStatus = { state: "ready", dataDir: join(dir, "data"), dataDirCreated: false, relay: {} as never, masterKey: null };
    const { port, ui } = await boot(stub, fakeRunner(), { ENABLE_TRADING: "1" });
    await openStream(port, ui);
    const reply = await postJson(port, "/ui/arm", { minutes: 1 }, bearer(ui));
    assert.equal((reply.json() as { error: { code: string } }).error.code, "flag_off");
  });
});

describe("a page that opens its stream after the fact still learns the posture and the kill state (F1)", () => {
  it("gets a status frame on a resumed stream, KILLED included, with no event announcing it", async () => {
    const relay = fakeRelay();
    const { port, ui } = await boot(relay.status);
    // The relay is killed from outside (SIGUSR2 or the environment): no ui event is published for it.
    relay.state.killEngaged = true;
    const client = await openSse(port, ui, { "last-event-id": "0" });
    try {
      const events = await client.waitFor((all) => all.some((message) => message.event.type === "status"));
      const frame = events.find((message) => message.event.type === "status")?.event;
      assert.equal(frame?.type === "status" ? frame.status.kill : undefined, true);
      assert.equal(frame?.type === "status" ? frame.status.posture : undefined, "KILLED");
      assert.match((frame?.type === "status" ? frame.status.audit_head : null) ?? "", /^0x[0-9a-f]{64}$/);
    } finally {
      client.close();
    }
  });
});
