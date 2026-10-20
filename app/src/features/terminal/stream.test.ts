import { describe, expect, it } from "vitest";

import { FakeRaw, FakeTimers } from "../../core/fakes";
import type { RawResponse } from "../../core/fetch";
import type { UiEvent } from "@bridge/contract";
import { LiveStream, TOKEN, errorReply, frame, jsonReply } from "./test-support";
import { MAX_FRAME_BYTES, STALL_MS, drainFrames, runEventStream, type StreamHandlers, type StreamState } from "./stream";

const AT = "2026-10-19T12:00:00Z";
const beat = (id: number): UiEvent => ({ id, at: AT, type: "heartbeat" });
const posture = (id: number): UiEvent => ({ id, at: AT, type: "posture", posture: "PREPARE", armed_until: null });

async function tick(rounds = 20): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

interface Rig {
  readonly raw: FakeRaw;
  readonly timers: FakeTimers;
  readonly states: StreamState[];
  readonly events: UiEvent[];
  readonly violations: (number | null)[];
  readonly waits: number[];
  readonly resyncs: number[];
  readonly controller: AbortController;
  readonly done: Promise<void>;
  nextEventId: number | null;
}

function start(responses: (call: number) => RawResponse | Promise<RawResponse>, options: { token?: string | null } = {}): Rig {
  const raw = new FakeRaw();
  let call = 0;
  raw.handler = () => responses(call++);
  const timers = new FakeTimers(0);
  const rig: Rig = {
    raw,
    timers,
    states: [],
    events: [],
    violations: [],
    waits: [],
    resyncs: [],
    controller: new AbortController(),
    done: Promise.resolve(),
    nextEventId: 5,
  };
  const handlers: StreamHandlers = {
    onState: (state) => rig.states.push(state),
    onEvent: (event) => rig.events.push(event),
    onViolation: (id) => rig.violations.push(id),
    resync: async () => {
      const id = rig.nextEventId;
      rig.resyncs.push(id ?? -1);
      return id;
    },
  };
  const done = runEventStream(
    {
      rawFetch: raw.fetch,
      timers,
      getToken: () => (options.token === undefined ? TOKEN : options.token),
      // Records the wait and yields a real macrotask, so a loop that retries forever cannot starve the test.
      sleep: async (ms) => {
        rig.waits.push(ms);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      },
      random: () => 0.9,
    },
    handlers,
    rig.controller.signal,
  );
  return Object.assign(rig, { done });
}

describe("drainFrames", () => {
  it("splits complete frames and keeps the unfinished rest", () => {
    const result = drainFrames('id: 1\ndata: {"a":1}\n\nid: 2\ndata: {"b"');
    expect(result.frames).toEqual([{ id: 1, data: '{"a":1}' }]);
    expect(result.rest).toBe('id: 2\ndata: {"b"');
  });

  it("ignores comments and the retry field, joins data lines, and reads CRLF", () => {
    const result = drainFrames(": keep-alive\r\n\r\nretry: 3000\r\n\r\nid: 7\r\ndata: one\r\ndata: two\r\n\r\n");
    expect(result.frames).toEqual([{ id: 7, data: "one\ntwo" }]);
  });

  it("takes only a whole number as an id", () => {
    expect(drainFrames("id: abc\ndata: x\n\n").frames).toEqual([{ id: null, data: "x" }]);
    expect(drainFrames("id: -1\ndata: x\n\n").frames).toEqual([{ id: null, data: "x" }]);
    expect(drainFrames("id: 1\n\n").frames).toEqual([{ id: 1, data: null }]);
  });
});

describe("the event loop", () => {
  it("resumes from the inbox's event id and delivers validated events", async () => {
    const live = new LiveStream();
    const rig = start(() => live.response);
    await tick();
    expect(rig.resyncs).toEqual([5]);
    const call = rig.raw.calls[0];
    expect(call?.url).toBe("/ui/events");
    expect(call?.init.headers["last-event-id"]).toBe("5");
    expect(call?.init.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(call?.init.headers["accept"]).toBe("text/event-stream");
    expect(rig.states).toEqual(["resyncing", "connecting", "live"]);
    live.push(frame(6, posture(6)) + frame(7, beat(7)));
    await tick();
    expect(rig.events.map((event) => event.type)).toEqual(["posture", "heartbeat"]);
    rig.controller.abort();
    await rig.done;
    expect(rig.states.at(-1)).toBe("stopped");
    expect(live.cancelled).toBe(true);
  });

  it("reassembles a frame split across reads", async () => {
    const live = new LiveStream();
    const rig = start(() => live.response);
    await tick();
    const text = frame(8, posture(8));
    live.push(text.slice(0, 10));
    await tick(3);
    expect(rig.events).toHaveLength(0);
    live.push(text.slice(10));
    await tick();
    expect(rig.events).toHaveLength(1);
    rig.controller.abort();
    await rig.done;
  });

  it("reports a frame that fails the contract by id only, and keeps going", async () => {
    const live = new LiveStream();
    const rig = start(() => live.response);
    await tick();
    live.push('id: 9\ndata: {"type":"posture","posture":"ROOT"}\n\nid: 10\ndata: not json\n\n' + frame(11, beat(11)));
    await tick();
    expect(rig.violations).toEqual([9, 10]);
    expect(rig.events.map((event) => event.type)).toEqual(["heartbeat"]);
    rig.controller.abort();
    await rig.done;
  });

  it("reconnects from the last id it saw, after a wait", async () => {
    const first = new LiveStream();
    const second = new LiveStream();
    const rig = start((call) => (call === 0 ? first.response : second.response));
    await tick();
    first.push(frame(12, beat(12)));
    await tick();
    first.end();
    await tick();
    expect(rig.states).toContain("reconnecting");
    expect(rig.waits[0]).toBeGreaterThanOrEqual(1000);
    expect(rig.raw.calls[1]?.init.headers["last-event-id"]).toBe("12");
    rig.controller.abort();
    await rig.done;
  });

  it("stops for good on 401 and does not retry", async () => {
    const rig = start(() => errorReply(401, "unauthorized"));
    await rig.done;
    expect(rig.states.at(-1)).toBe("unauthorized");
    expect(rig.raw.calls).toHaveLength(1);
  });

  it("does not even ask without a token", async () => {
    const rig = start(() => errorReply(401, "unauthorized"), { token: null });
    await rig.done;
    expect(rig.raw.calls).toHaveLength(0);
    expect(rig.states.at(-1)).toBe("unauthorized");
  });

  it("answers a resume gap (422) by reading the inbox again, never by guessing", async () => {
    const live = new LiveStream();
    const rig = start((call) => (call === 0 ? errorReply(422, "precondition_failed") : live.response));
    await tick();
    rig.nextEventId = 40;
    await tick();
    expect(rig.resyncs.length).toBeGreaterThanOrEqual(1);
    expect(rig.states).toContain("resyncing");
    rig.controller.abort();
    await rig.done;
  });

  it("waits longer between repeated resyncs", async () => {
    const rig = start(() => errorReply(422, "precondition_failed"));
    await tick(40);
    expect(rig.resyncs.length).toBeGreaterThan(1);
    expect(rig.waits.length).toBeGreaterThan(0);
    rig.controller.abort();
    await rig.done;
  });

  it("backs off after a network error and honours Retry-After", async () => {
    const live = new LiveStream();
    const rig = start((call) => {
      if (call === 0) throw new TypeError("failed to fetch");
      if (call === 1) return jsonReply(429, { error: { code: "rate_limited", message: "x", retry_after_s: 30 } });
      return live.response;
    });
    await tick(40);
    expect(rig.waits[0]).toBeGreaterThanOrEqual(1000);
    expect(rig.waits[1]).toBe(30_000);
    expect(rig.states).toContain("live");
    rig.controller.abort();
    await rig.done;
  });

  it("drops a stream that goes quiet for three heartbeats and opens a new one", async () => {
    const first = new LiveStream();
    const second = new LiveStream();
    const rig = start((call) => (call === 0 ? first.response : second.response));
    await tick();
    rig.timers.advance(STALL_MS + 1);
    await tick();
    expect(first.cancelled).toBe(true);
    expect(rig.raw.calls).toHaveLength(2);
    rig.controller.abort();
    await rig.done;
  });

  it("treats a frame over the size limit as a fault and starts again from the inbox", async () => {
    const first = new LiveStream();
    const second = new LiveStream();
    const rig = start((call) => (call === 0 ? first.response : second.response));
    await tick();
    first.push(`id: 1\ndata: ${"x".repeat(MAX_FRAME_BYTES + 10)}`);
    await tick();
    expect(rig.resyncs.length).toBe(2);
    expect(rig.raw.calls).toHaveLength(2);
    rig.controller.abort();
    await rig.done;
  });

  it("closes its connection when the signal aborts", async () => {
    const live = new LiveStream();
    const rig = start(() => live.response);
    await tick();
    rig.controller.abort();
    await rig.done;
    expect(live.cancelled).toBe(true);
    expect(rig.raw.calls).toHaveLength(1);
  });
});
