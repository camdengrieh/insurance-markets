import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";

import { mintAgentToken, tokenId } from "../../auth.js";
import { auditAdapterOf, bridgeModule as auditModule, type AuditAdapter, type AuditSink } from "../../audit-adapter.js";
import { createEventsModule, eventBusOf, type EventBus, type EventBusOptions, type Timers } from "../../events.js";
import { createInboxModule, inboxOf, type Inbox, type InboxOptions, type PreparedSource, type RelayRecordView } from "../../inbox.js";
import { uiEventSchema, type UiEvent } from "../../contract.js";
import { bearer, seededRandom, startTestDaemon, type Reply, type TestDaemon, type TestDaemonOptions } from "../server/helpers.js";
import type { RelayAuditEvent } from "../../../relay/audit.js";

// Shared rig for the event stream, audit adapter and inbox tests. Time is the daemon test clock (2026-10-19T12:00:00Z,
// the same instant the prepared-item builders in test/ use); timers are fake and ticked by hand; the network is the
// daemon's own loopback socket. Keys, tokens and pairing codes are seeded and fake.

interface Interval {
  readonly id: number;
  readonly callback: () => void;
  readonly ms: number;
  nextAt: number;
}

export class FakeTimers implements Timers {
  #now = 0;
  #next = 1;
  #intervals = new Map<number, Interval>();

  setInterval(callback: () => void, ms: number): unknown {
    const id = this.#next++;
    this.#intervals.set(id, { id, callback, ms, nextAt: this.#now + ms });
    return id;
  }

  clearInterval(handle: unknown): void {
    this.#intervals.delete(handle as number);
  }

  active(): number {
    return this.#intervals.size;
  }

  // Moves time forward, running every interval that comes due, in order.
  tick(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      let due: Interval | undefined;
      for (const interval of this.#intervals.values()) {
        if (interval.nextAt <= target && (due === undefined || interval.nextAt < due.nextAt)) due = interval;
      }
      if (due === undefined) break;
      this.#now = due.nextAt;
      due.nextAt += due.ms;
      due.callback();
    }
    this.#now = target;
  }
}

export class FakeSink implements AuditSink {
  readonly written: RelayAuditEvent[] = [];
  ok = true;
  throwing = false;

  async write(event: RelayAuditEvent): Promise<void> {
    if (this.throwing) throw new Error("disk full");
    this.written.push(event);
    this.ok = true;
  }

  healthy(): boolean {
    return this.ok;
  }
}

export class FakeSource implements PreparedSource {
  readonly records = new Map<string, RelayRecordView>();

  lookup(id: string): RelayRecordView | undefined {
    return this.records.get(id);
  }

  set(view: RelayRecordView): void {
    this.records.set(view.id, view);
  }

  patch(id: string, change: Partial<RelayRecordView>): void {
    const current = this.records.get(id);
    if (current === undefined) throw new Error("test setup: no such record");
    this.records.set(id, { ...current, ...change });
  }
}

export interface Rig {
  readonly t: TestDaemon;
  readonly timers: FakeTimers;
  readonly bus: EventBus;
  readonly inbox: Inbox;
  readonly adapter: AuditAdapter;
  readonly ui: string;
  readonly agent: string;
  readonly agentId: string;
  readonly port: number;
  readonly sink: FakeSink | undefined;
  readonly source: FakeSource | undefined;
  readonly stop: () => Promise<void>;
}

export interface RigOptions {
  readonly role?: "writer" | "read_only";
  readonly withSource?: boolean;
  readonly withSink?: boolean;
  readonly bus?: EventBusOptions;
  readonly inbox?: InboxOptions;
  readonly daemon?: TestDaemonOptions;
  readonly routes?: TestDaemonOptions["modules"];
}

export async function startRig(options: RigOptions = {}): Promise<Rig> {
  const timers = new FakeTimers();
  const t = await startTestDaemon({
    ...(options.role === undefined ? {} : { role: options.role }),
    ...options.daemon,
    modules: [
      { name: "audit-adapter", source: auditModule },
      { name: "events", source: createEventsModule({ timers, ...options.bus }) },
      { name: "inbox", source: createInboxModule({ timers, ...options.inbox }) },
      ...(options.routes ?? []),
    ],
  });
  const agentToken = mintAgentToken(seededRandom("events-agent"));
  t.auth.setAgentHash({ id: tokenId(agentToken), sha256: createHash("sha256").update(agentToken).digest("hex") });
  const host = t.daemon.host;
  const sink = options.withSink === true ? new FakeSink() : undefined;
  const source = options.withSource === true ? new FakeSource() : undefined;
  if (sink !== undefined) auditAdapterOf(host).attachSink(sink);
  if (source !== undefined) inboxOf(host).attachSource(source);
  return {
    t,
    timers,
    bus: eventBusOf(host),
    inbox: inboxOf(host),
    adapter: auditAdapterOf(host),
    ui: await t.pair(),
    agent: agentToken,
    agentId: tokenId(agentToken),
    port: t.port,
    sink,
    source,
    stop: () => t.stop(),
  };
}

// ---- a server-sent-events client -------------------------------------------------------------------------------------------

export interface SseMessage {
  readonly id: number | undefined;
  readonly data: string;
  readonly event: UiEvent;
}

export interface SseClient {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly raw: () => string;
  readonly events: () => readonly SseMessage[];
  // Resolves once `count` events (or `predicate` over all events) have arrived.
  waitFor(predicate: number | ((events: readonly SseMessage[]) => boolean), timeoutMs?: number): Promise<readonly SseMessage[]>;
  closed(): boolean;
  waitClosed(timeoutMs?: number): Promise<void>;
  close(): void;
}

// Opens GET /ui/events and parses it as the page would. When the server answers with a plain (non-stream) reply, the
// client has status/headers and an empty event list.
export function openStream(port: number, token: string, extraHeaders: Readonly<Record<string, string>> = {}, path = "/ui/events"): Promise<SseClient & { readonly body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET", headers: { host: `127.0.0.1:${port}`, accept: "text/event-stream", ...bearer(token), ...extraHeaders }, setHost: false, agent: false }, (res) => {
      let text = "";
      let ended = false;
      const messages: SseMessage[] = [];
      const waiters: { check: () => boolean; done: () => void }[] = [];
      const closeWaiters: (() => void)[] = [];
      let buffer = "";
      const flush = (): void => {
        for (;;) {
          const cut = buffer.indexOf("\n\n");
          if (cut === -1) return;
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          let id: number | undefined;
          let data: string | undefined;
          for (const line of block.split("\n")) {
            if (line.startsWith("id: ")) id = Number(line.slice(4));
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (data === undefined) continue;
          messages.push({ id, data, event: uiEventSchema.parse(JSON.parse(data)) });
        }
      };
      const settle = (): void => {
        for (const waiter of [...waiters]) {
          if (waiter.check()) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.done();
          }
        }
      };
      const isStream = String(res.headers["content-type"] ?? "").startsWith("text/event-stream");
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        text += chunk;
        if (isStream) {
          buffer += chunk;
          flush();
          settle();
        }
      });
      const finish = (): void => {
        ended = true;
        for (const done of closeWaiters.splice(0)) done();
        resolveOnce();
      };
      res.on("end", finish);
      res.on("close", finish);
      res.on("error", finish);
      const client: SseClient & { readonly body: string } = {
        status: res.statusCode ?? 0,
        headers: res.headers,
        raw: () => text,
        get body() {
          return text;
        },
        events: () => messages,
        waitFor: (predicate, timeoutMs = 3_000) =>
          new Promise((resolveWait, rejectWait) => {
            const check = typeof predicate === "number" ? (): boolean => messages.length >= predicate : (): boolean => predicate(messages);
            if (check()) return resolveWait([...messages]);
            const timer = setTimeout(() => rejectWait(new Error(`timed out waiting for events; have ${String(messages.length)}: ${messages.map((m) => m.event.type).join(",")}`)), timeoutMs);
            waiters.push({
              check,
              done: () => {
                clearTimeout(timer);
                resolveWait([...messages]);
              },
            });
          }),
        closed: () => ended,
        waitClosed: (timeoutMs = 3_000) =>
          new Promise((resolveClose, rejectClose) => {
            if (ended) return resolveClose();
            const timer = setTimeout(() => rejectClose(new Error("the stream did not close")), timeoutMs);
            closeWaiters.push(() => {
              clearTimeout(timer);
              resolveClose();
            });
          }),
        close: () => req.destroy(),
      };
      let resolved = false;
      const resolveOnce = (): void => {
        if (!resolved) {
          resolved = true;
          resolve(client);
        }
      };
      // A stream resolves as soon as the headers are in; a plain answer waits for its body.
      if (isStream) resolveOnce();
    });
    req.on("error", reject);
    req.end();
  });
}

export function jsonOf<T = unknown>(reply: Reply): T {
  return reply.json() as T;
}
