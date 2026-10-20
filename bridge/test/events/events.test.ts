import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { SSE_HEARTBEAT_MS, TOKEN_SCAN_PATTERN, bridgeErrorResponseSchema, uiEventSchema } from "../../contract.js";
import { EventBus, eventBusOf, type StoredEvent } from "../../events.js";
import { killControllerOf } from "../../kill.js";
import { statusOf } from "../../status.js";
import { bearer, send, type TestDaemon } from "../server/helpers.js";
import { startRig, openStream, type Rig, type SseClient } from "./helpers.js";

// The event stream: GET /ui/events (bridge/events.ts). Real loopback sockets, fake timers, the daemon test clock.

const rigs: Rig[] = [];
const clients: SseClient[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const rig of rigs.splice(0)) await rig.stop();
});

async function rigOf(options: Parameters<typeof startRig>[0] = {}): Promise<Rig> {
  const rig = await startRig(options);
  rigs.push(rig);
  return rig;
}

async function open(rig: Rig, token: string = rig.ui, headers: Readonly<Record<string, string>> = {}): Promise<SseClient & { readonly body: string }> {
  const client = await openStream(rig.port, token, headers);
  clients.push(client);
  return client;
}

const audit = (rig: Rig): TestDaemon["audit"] => rig.t.audit;

function postureEvent(rig: Rig, n: number): void {
  rig.bus.publishPosture(n % 2 === 0 ? "OBSERVE" : "PREPARE", null);
}

describe("GET /ui/events: access and framing", () => {
  it("needs a token, answers 401 without one, and sends no cookie and no CORS header", async () => {
    const rig = await rigOf();
    const anonymous = await send({ port: rig.port, path: "/ui/events" });
    assert.equal(anonymous.status, 401);
    assert.equal(bridgeErrorResponseSchema.parse(anonymous.json()).error.code, "unauthorized");
    const stream = await open(rig);
    assert.equal(stream.status, 200);
    assert.match(String(stream.headers["content-type"]), /^text\/event-stream/);
    assert.equal(stream.headers["set-cookie"], undefined);
    assert.equal(Object.keys(stream.headers).some((name) => name.startsWith("access-control-")), false);
    assert.match(String(stream.headers["content-security-policy"]), /default-src 'none'/);
    assert.equal(stream.headers["cache-control"], "no-store");
  });

  it("is open to an agent token too (read scope), and to a read-only instance", async () => {
    const rig = await rigOf({ role: "read_only" });
    const stream = await open(rig, rig.ui);
    assert.equal(stream.status, 200);
    const agent = await open(rig, rig.agent);
    assert.equal(agent.status, 200);
  });

  it("refuses a query string and a Last-Event-ID that is not a whole number", async () => {
    const rig = await rigOf();
    const query = await openStream(rig.port, rig.ui, {}, "/ui/events?since=3");
    assert.equal(query.status, 400);
    assert.equal(bridgeErrorResponseSchema.parse(JSON.parse(query.body)).error.code, "invalid_request");
    for (const bad of ["abc", "-1", "1.5", "1e3", "99999999999999999"]) {
      const reply = await open(rig, rig.ui, { "last-event-id": bad });
      assert.equal(reply.status, 400, bad);
    }
  });

  it("sends events in order with increasing ids, each one valid against the contract", async () => {
    const rig = await rigOf();
    const base = rig.bus.head();
    const stream = await open(rig);
    for (let n = 0; n < 5; n += 1) postureEvent(rig, n);
    const events = await stream.waitFor(5);
    assert.deepEqual(
      events.map((message) => message.id),
      [base + 1, base + 2, base + 3, base + 4, base + 5],
    );
    for (const message of events) {
      assert.equal(message.event.id, message.id);
      assert.equal(uiEventSchema.safeParse(JSON.parse(message.data)).success, true);
    }
    // One `data:` line per event: the JSON never contains a raw line break.
    assert.equal(stream.raw().split("\n").filter((line) => line.startsWith("data: ")).length, 5);
  });

  it("starts a fresh stream from now: events published before it opened are not replayed", async () => {
    const rig = await rigOf();
    postureEvent(rig, 0);
    postureEvent(rig, 1);
    const head = rig.bus.head();
    const stream = await open(rig);
    postureEvent(rig, 2);
    const events = await stream.waitFor((all) => all.some((message) => message.id === head + 1));
    assert.deepEqual(
      events.map((message) => message.id),
      [head, head + 1],
      "only the posture snapshot, carrying the current head id, then the live event",
    );
  });

  it("gives a new stream the current posture first", async () => {
    const rig = await rigOf();
    rig.bus.publishPosture("ARMED", "2026-10-19T12:05:00Z");
    const stream = await open(rig);
    const events = await stream.waitFor(1);
    const first = events[0]?.event;
    assert.equal(first?.type, "posture");
    assert.equal(first?.type === "posture" ? first.posture : undefined, "ARMED");
  });

  it("skips a status snapshot that does not match the contract instead of breaking the stream", async () => {
    const rig = await rigOf();
    rig.bus.setStatusProvider(() => ({ nonsense: true }) as never);
    const stream = await open(rig);
    postureEvent(rig, 0);
    const events = await stream.waitFor(1);
    assert.equal(events[0]?.event.type, "posture");
    rig.bus.setStatusProvider(() => {
      throw new Error("provider down");
    });
    const second = await open(rig);
    postureEvent(rig, 1);
    assert.equal((await second.waitFor(1))[0]?.event.type, "posture");
  });
});

describe("resume with Last-Event-ID", () => {
  it("replays exactly the events the client missed, then goes live", async () => {
    const rig = await rigOf();
    for (let n = 0; n < 6; n += 1) postureEvent(rig, n);
    const head = rig.bus.head();
    const stream = await open(rig, rig.ui, { "last-event-id": String(head - 3) });
    postureEvent(rig, 6);
    const events = await stream.waitFor((all) => all.length >= 4);
    assert.deepEqual(
      events.map((message) => message.id),
      [head - 2, head - 1, head, head + 1],
    );
  });

  it("an id equal to the head replays nothing: only the current posture, carrying that id, then what is live", async () => {
    const rig = await rigOf();
    postureEvent(rig, 0);
    const before = rig.bus.head();
    const stream = await open(rig, rig.ui, { "last-event-id": String(before) });
    postureEvent(rig, 1);
    const events = await stream.waitFor(2);
    assert.deepEqual(
      events.map((message) => message.id),
      [before, before + 1],
    );
    assert.deepEqual(
      events.map((message) => message.event.type),
      ["posture", "posture"],
    );
  });

  // F1: the page always resumes (Last-Event-ID = the inbox event_id, often 0), so a resumed stream must still tell it
  // where the status bar stands. Otherwise Posture, Kill switch and Audit head read "not known yet" for a whole session.
  const withStatus = (rig: Rig): void => {
    rig.bus.setStatusProvider(() => statusOf(rig.t.daemon.host, { kind: "ui", scopes: ["read", "prepare"] }));
  };

  it("a resumed stream that missed nothing still gets the posture and the status first (F1)", async () => {
    const rig = await rigOf();
    withStatus(rig);
    rig.bus.publishPosture("PREPARE", null);
    const stream = await open(rig, rig.ui, { "last-event-id": String(rig.bus.head()) });
    const events = await stream.waitFor((all) => all.length >= 2);
    assert.deepEqual(
      events.map((message) => message.event.type),
      ["posture", "status"],
    );
  });

  it("a page that resumes from 0 on a fresh daemon gets a status frame (F1)", async () => {
    const rig = await rigOf();
    withStatus(rig);
    const stream = await open(rig, rig.ui, { "last-event-id": "0" });
    const events = await stream.waitFor((all) => all.some((message) => message.event.type === "status"));
    const status = events.find((message) => message.event.type === "status")?.event;
    assert.equal(status?.type === "status" ? status.status.posture : undefined, "PREPARE");
  });

  it("shows KILLED to a page that resumes after a kill, although no event announced it (F1)", async () => {
    const rig = await rigOf();
    withStatus(rig);
    await killControllerOf(rig.t.daemon.host).engage("test");
    const stream = await open(rig, rig.ui, { "last-event-id": "0" });
    const events = await stream.waitFor((all) => all.some((message) => message.event.type === "status"));
    const status = events.find((message) => message.event.type === "status")?.event;
    assert.equal(status?.type === "status" ? status.status.kill : undefined, true);
    assert.equal(status?.type === "status" ? status.status.posture : undefined, "KILLED");
  });

  it("sends the replay first and the snapshot after it, so the newest state wins, with ids that never go backwards (F1)", async () => {
    const rig = await rigOf();
    withStatus(rig);
    for (let n = 0; n < 4; n += 1) rig.bus.publish({ type: "heartbeat" });
    const head = rig.bus.head();
    const stream = await open(rig, rig.ui, { "last-event-id": String(head - 2) });
    const events = await stream.waitFor((all) => all.some((message) => message.event.type === "status"));
    assert.deepEqual(
      events.map((message) => message.event.type),
      ["heartbeat", "heartbeat", "status"],
    );
    const ids = events.map((message) => message.id ?? -1);
    assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
  });

  it("does not repeat a posture the replay already carries, but still sends the status (F1)", async () => {
    const rig = await rigOf();
    withStatus(rig);
    postureEvent(rig, 0);
    const from = rig.bus.head();
    postureEvent(rig, 1);
    const stream = await open(rig, rig.ui, { "last-event-id": String(from) });
    const events = await stream.waitFor((all) => all.some((message) => message.event.type === "status"));
    assert.deepEqual(
      events.map((message) => message.event.type),
      ["posture", "status"],
    );
  });

  it("delivers an event published while the status was being built, after the snapshot and not lost (F1)", async () => {
    const rig = await rigOf();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    rig.bus.setStatusProvider(async () => {
      await gate;
      return statusOf(rig.t.daemon.host, { kind: "ui", scopes: ["read", "prepare"] });
    });
    const base = rig.bus.head();
    const pending = open(rig, rig.ui, { "last-event-id": String(base) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    rig.bus.publishPosture("ARMED", "2026-10-19T12:05:00Z");
    release?.();
    const stream = await pending;
    const events = await stream.waitFor((all) => all.some((message) => message.event.type === "posture" && message.event.posture === "ARMED") && all.some((message) => message.event.type === "status"));
    const types = events.map((message) => message.event.type);
    assert.ok(types.indexOf("status") < types.lastIndexOf("posture"), `the live event comes after the snapshot: ${types.join(",")}`);
    assert.equal(events.at(-1)?.event.type, "posture");
  });

  it("answers precondition_failed (422) resume_gap when the ring no longer holds what was missed, and when the id is from another run", async () => {
    const rig = await rigOf({ bus: { ringEvents: 3 } });
    for (let n = 0; n < 8; n += 1) postureEvent(rig, n);
    const head = rig.bus.head();
    const old = await open(rig, rig.ui, { "last-event-id": String(head - 6) });
    assert.equal(old.status, 422);
    const error = bridgeErrorResponseSchema.parse(JSON.parse(old.body)).error;
    assert.equal(error.code, "precondition_failed");
    assert.deepEqual(error.details, { reason: "resume_gap" });
    // The edge of the ring still works: ids 6, 7, 8 are held, so resuming after 5 is exact.
    const edge = await open(rig, rig.ui, { "last-event-id": String(head - 3) });
    assert.equal(edge.status, 200);
    assert.deepEqual((await edge.waitFor(3)).map((message) => message.id), [head - 2, head - 1, head]);
    const future = await open(rig, rig.ui, { "last-event-id": "9000" });
    assert.equal(future.status, 422, "a restarted daemon restarts its ids, so a larger id is a gap too");
  });

  it("keeps the ring within its byte budget", async () => {
    const rig = await rigOf({ bus: { ringBytes: 2_000 } });
    for (let n = 0; n < 40; n += 1) postureEvent(rig, n);
    const gap = await open(rig, rig.ui, { "last-event-id": "1" });
    assert.equal(gap.status, 422);
  });
});

describe("heartbeat, limits and disconnects", () => {
  it("sends a heartbeat on a timer, carrying the head id, and stops the timer when the last stream leaves", async () => {
    const rig = await rigOf();
    assert.equal(rig.timers.active(), 0, "no timer before a stream is open");
    postureEvent(rig, 0);
    const stream = await open(rig);
    await stream.waitFor(1); // the posture snapshot
    assert.equal(rig.timers.active(), 1);
    rig.timers.tick(SSE_HEARTBEAT_MS);
    const events = await stream.waitFor((all) => all.some((message) => message.event.type === "heartbeat"));
    const beat = events.find((message) => message.event.type === "heartbeat");
    assert.equal(beat?.id, rig.bus.head());
    stream.close();
    await stream.waitClosed();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(rig.timers.active(), 0);
  });

  it("limits streams per token and in all with 429", async () => {
    const rig = await rigOf({ bus: { maxStreamsPerToken: 2, maxStreams: 3 } });
    await open(rig);
    await open(rig);
    const third = await open(rig);
    assert.equal(third.status, 429);
    assert.equal(bridgeErrorResponseSchema.parse(JSON.parse(third.body)).error.code, "rate_limited");
    assert.equal(third.headers["retry-after"], "5");
    // The agent has its own allowance, up to the total.
    assert.equal((await open(rig, rig.agent)).status, 200);
    assert.equal((await open(rig, rig.agent)).status, 429);
  });

  it("tells the ARM window when the last page stream goes away, and not when an agent stream does", async () => {
    const rig = await rigOf();
    const remaining: number[] = [];
    rig.bus.onUiStreamsClosed((count) => remaining.push(count));
    const ui1 = await open(rig);
    const ui2 = await open(rig);
    const agent = await open(rig, rig.agent);
    agent.close();
    await agent.waitClosed();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(remaining, []);
    ui1.close();
    await ui1.waitClosed();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(remaining, [1]);
    ui2.close();
    await ui2.waitClosed();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(remaining, [1, 0]);
  });

  it("ends every open stream when the daemon shuts down", async () => {
    const rig = await rigOf();
    const stream = await open(rig);
    await stream.waitFor(0);
    await rig.stop();
    rigs.splice(rigs.indexOf(rig), 1);
    await stream.waitClosed();
    assert.equal(rig.timers.active(), 0);
  });
});

// A StreamSink whose socket never drains: the bus must not buffer without bound or block the publisher.
function stuckSink(): { sink: import("../../server.js").StreamSink; ended: () => boolean; written: () => number; closeCallbacks: (() => void)[] } {
  let closed = false;
  let writes = 0;
  const closeCallbacks: (() => void)[] = [];
  const sink: import("../../server.js").StreamSink = {
    write: () => {
      writes += 1;
      return false;
    },
    onDrain: () => undefined,
    onClose: (callback) => {
      closeCallbacks.push(callback);
    },
    end: () => {
      if (closed) return;
      closed = true;
      for (const callback of closeCallbacks.splice(0)) callback();
    },
    get closed() {
      return closed;
    },
  };
  return { sink, ended: () => closed, written: () => writes, closeCallbacks };
}

describe("a slow reader", () => {
  it("is cut off once its queue is full, and the publisher is never blocked", async () => {
    const rig = await rigOf({ bus: { maxQueue: 5 } });
    const stuck = stuckSink();
    await rig.bus.serve(stuck.sink, { tokenId: "deadbeef", kind: "ui" }, undefined);
    assert.equal(stuck.ended(), false);
    const started = Date.now();
    const base = rig.bus.head();
    for (let n = 0; n < 20; n += 1) postureEvent(rig, n);
    assert.ok(Date.now() - started < 1_000);
    assert.equal(stuck.ended(), true, "the stream was ended instead of buffering forever");
    assert.equal(rig.bus.streamCount(), 0);
    assert.equal(rig.bus.head(), base + 20, "the bus kept going");
  });

  it("a healthy stream beside a stuck one is unaffected", async () => {
    const rig = await rigOf({ bus: { maxQueue: 5 } });
    const stuck = stuckSink();
    await rig.bus.serve(stuck.sink, { tokenId: "deadbeef", kind: "agent" }, undefined);
    const good = await open(rig);
    for (let n = 0; n < 20; n += 1) postureEvent(rig, n);
    const events = await good.waitFor((all) => all.length >= 20);
    assert.equal(events.length, 20);
  });
});

describe("what may be on the stream", () => {
  it("drops an event that does not match the contract and reports only its field path", async () => {
    const rig = await rigOf();
    const before = rig.bus.head();
    const dropped = rig.bus.publish({ type: "posture", posture: "BROKEN", armed_until: null } as never);
    assert.equal(dropped, undefined);
    const after = rig.bus.since(before);
    assert.deepEqual(
      (after.kind === "ok" ? after.events : []).map((event) => event.type),
      ["audit"],
      "the bad event was not stored; only the audit entry about it was",
    );
    assert.equal(rig.bus.dropped(), 1);
    const violation = audit(rig).find((record) => record.ev === "schema.violation" && record.field?.startsWith("event.posture"));
    assert.ok(violation, "audited as schema.violation");
    assert.ok(!JSON.stringify(violation).includes("BROKEN"), "the bad value is not in the audit record");
  });

  it("drops an event that carries a token-shaped string even when it is schema-valid", async () => {
    const rig = await rigOf();
    const leaked = `cku_${"A".repeat(43)}`;
    const dropped = rig.bus.publish({
      type: "audit",
      entry: { seq: 1, at: "2026-10-19T12:00:00Z", type: "agent.call", actor: "system", summary: `Agent called ${leaked}`, hash: `0x${"0".repeat(64)}` },
    });
    assert.equal(dropped, undefined);
    assert.equal(rig.bus.dropped(), 1);
    const violation = audit(rig).find((record) => record.ev === "schema.violation" && record.field === "event.audit.token_shaped");
    assert.ok(violation);
    assert.ok(!JSON.stringify(audit(rig)).includes(leaked));
  });

  it("never carries the ui token, the agent token or a pairing code, after real pairing and real calls", async () => {
    const rig = await rigOf({ withSink: true });
    const stream = await open(rig);
    // Pair again (a ui.pair audit with a token id), fail a pairing, and call the stream with a bad token.
    const grant = rig.t.auth.issuePairing();
    const paired = await send({ port: rig.port, method: "POST", path: "/ui/pair", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: grant.code }) });
    const secondToken = (paired.json() as { token: string }).token;
    await send({ port: rig.port, method: "POST", path: "/ui/pair", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "0".repeat(32) }) });
    await send({ port: rig.port, path: "/ui/events", headers: bearer("cku_" + "B".repeat(43)) });
    await stream.waitFor((all) => all.filter((message) => message.event.type === "audit").length >= 2);
    const wire = stream.raw();
    for (const secret of [rig.ui, rig.agent, secondToken, grant.code, "B".repeat(43)]) assert.ok(!wire.includes(secret), "no secret on the stream");
    assert.equal(TOKEN_SCAN_PATTERN.test(wire), false);
    assert.ok(!JSON.stringify(rig.sink?.written).includes(secondToken));
  });
});

describe("the bus on its own", () => {
  it("hands out one bus per host and applies later options to it", async () => {
    const rig = await rigOf();
    assert.equal(eventBusOf(rig.t.daemon.host), rig.bus);
    eventBusOf(rig.t.daemon.host, { ringEvents: 2 });
    for (let n = 0; n < 5; n += 1) postureEvent(rig, n);
    assert.equal(rig.bus.since(1).kind, "gap");
  });

  it("since() is exact at the edges of an empty and a full ring", () => {
    const host = { clock: () => Date.UTC(2026, 9, 19, 12), emitAudit: () => undefined, onClose: () => undefined } as never;
    const bus = new EventBus(host, { ringEvents: 2 });
    assert.deepEqual(bus.since(0), { kind: "ok", events: [] });
    assert.equal(bus.since(1).kind, "gap");
    bus.publish({ type: "heartbeat" });
    bus.publish({ type: "heartbeat" });
    bus.publish({ type: "heartbeat" });
    const held = bus.since(1);
    assert.equal(held.kind, "ok");
    assert.deepEqual(
      (held.kind === "ok" ? held.events : []).map((event: StoredEvent) => event.id),
      [2, 3],
    );
    assert.equal(bus.since(0).kind, "gap");
    assert.equal(bus.since(4).kind, "gap");
  });

  it("stops publishing after close", () => {
    const host = { clock: () => Date.UTC(2026, 9, 19, 12), emitAudit: () => undefined, onClose: () => undefined } as never;
    const bus = new EventBus(host);
    bus.close();
    assert.equal(bus.publish({ type: "heartbeat" }), undefined);
  });
});
