import { EVENTS_PATH, SSE_HEARTBEAT_MS, TOKEN_SCAN_PATTERN, uiEventSchema, type Posture, type StatusResponse, type UiEvent } from "./contract.js";
import { defineRoute, fail, type BridgeModule, type BridgeModuleFactory, type DaemonHost, type StreamSink } from "./server.js";

// The Cockpit's event stream: GET /ui/events (docs/dapp-design.md 5.4 and 7.2 M1; contract: bridge/contract.ts
// uiEventSchema). It is the one feed the observer pane, the status bar and the signing inbox listen to.
//
// WHAT IS ON IT. Six event types, nothing else: `status`, `posture`, `prepared`, `prepared_state`, `audit`,
// `heartbeat`. Tool calls and errors reach the page as `audit` entries (the audit adapter turns the daemon's audit
// events into fixed-wording entries: tool name and class, argument hash, outcome, never arguments or results), and
// prepared items reach it as the relay's own record (the inbox publishes them). The stream never carries a
// request body, a tool result, a header, a token, a signature or a page-supplied string.
//
// HOW IT IS KEPT HONEST.
//   - Every event is checked against the contract's uiEventSchema BEFORE it is stored or sent. An event that fails
//     is dropped and audited as schema.violation (the field path only).
//   - Every serialised event is also scanned for a token-shaped string (TOKEN_SCAN_PATTERN). One that matches is
//     dropped the same way. This is the last line of defence behind the shapes the producers already enforce.
//   - Ids are monotonic per daemon run. The ring keeps the newest events (by count and by bytes) so a client that
//     reconnects with Last-Event-ID gets exactly what it missed. When the id is older than the ring, or newer than
//     anything this run produced (the daemon restarted), the answer is precondition_failed (HTTP 422) with
//     details.reason "resume_gap": the page must re-read /ui/inbox and open a fresh stream. A silent gap would be
//     worse than a refusal.
//   - A slow reader is cut off (its queue is bounded); it reconnects and resumes. A stream never blocks a publisher.
//
// FOR THE OTHER STREAMS. `eventBusOf(host)` returns the host's one bus (created on first use, so load order does not
// matter). D3 (arming) calls `bus.publishPosture(...)`; whoever builds /ui/status calls `bus.setStatusProvider(...)`
// and `bus.publishStatus()`; `bus.onUiStreamsClosed(cb)` tells the ARM window when the last page stream went away
// (design 5.4: the window closes on SSE disconnect).

export type PostureName = Posture;

type Distribute<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
// An event before the bus gives it an id and a time.
export type UiEventBody = Distribute<UiEvent>;

export interface StoredEvent {
  readonly id: number;
  readonly type: UiEvent["type"];
  // The JSON the stream sends, already validated.
  readonly data: string;
}

export interface Timers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const realTimers: Timers = {
  setInterval: (callback, ms) => {
    const handle = setInterval(callback, ms);
    handle.unref();
    return handle;
  },
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

export interface EventBusOptions {
  // How many events the ring keeps, and the most bytes of serialised data (a prepared item can be 100 KB).
  readonly ringEvents?: number;
  readonly ringBytes?: number;
  readonly heartbeatMs?: number;
  // Per-stream queue bound before a slow reader is cut off.
  readonly maxQueue?: number;
  readonly maxStreams?: number;
  readonly maxStreamsPerToken?: number;
  readonly timers?: Timers;
}

const DEFAULTS = {
  ringEvents: 1000,
  ringBytes: 8 * 1024 * 1024,
  heartbeatMs: SSE_HEARTBEAT_MS,
  maxQueue: 256,
  maxStreams: 16,
  maxStreamsPerToken: 4,
} as const;

export function isoSecond(ms: number): string {
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type Listener = (event: StoredEvent) => void;
export type StatusProvider = () => StatusResponse | undefined | Promise<StatusResponse | undefined>;

interface StreamHandle {
  readonly tokenId: string;
  readonly kind: "ui" | "agent";
  push(chunk: string): void;
  end(): void;
}

export class EventBus {
  readonly #host: DaemonHost;
  #ringEvents: number = DEFAULTS.ringEvents;
  #ringBytes: number = DEFAULTS.ringBytes;
  #heartbeatMs: number = DEFAULTS.heartbeatMs;
  #maxQueue: number = DEFAULTS.maxQueue;
  #maxStreams: number = DEFAULTS.maxStreams;
  #maxPerToken: number = DEFAULTS.maxStreamsPerToken;
  #timers: Timers = realTimers;
  #ring: StoredEvent[] = [];
  #ringSize = 0;
  #head = 0;
  #listeners = new Set<Listener>();
  #streams = new Set<StreamHandle>();
  #timer: unknown;
  #statusProvider: StatusProvider | undefined;
  #posture: { readonly posture: PostureName; readonly armed_until: string | null } | undefined;
  #closeListeners = new Set<(remainingUiStreams: number) => void>();
  #reporting = false;
  #dropped = 0;
  #closed = false;

  constructor(host: DaemonHost, options: EventBusOptions = {}) {
    this.#host = host;
    this.configure(options);
  }

  configure(options: EventBusOptions): void {
    if (options.ringEvents !== undefined) this.#ringEvents = Math.max(1, Math.floor(options.ringEvents));
    if (options.ringBytes !== undefined) this.#ringBytes = Math.max(1024, Math.floor(options.ringBytes));
    if (options.heartbeatMs !== undefined) this.#heartbeatMs = Math.max(10, Math.floor(options.heartbeatMs));
    if (options.maxQueue !== undefined) this.#maxQueue = Math.max(1, Math.floor(options.maxQueue));
    if (options.maxStreams !== undefined) this.#maxStreams = Math.max(1, Math.floor(options.maxStreams));
    if (options.maxStreamsPerToken !== undefined) this.#maxPerToken = Math.max(1, Math.floor(options.maxStreamsPerToken));
    if (options.timers !== undefined) this.#timers = options.timers;
  }

  // The id of the newest event this run produced (0 before the first).
  head(): number {
    return this.#head;
  }

  dropped(): number {
    return this.#dropped;
  }

  streamCount(): number {
    return this.#streams.size;
  }

  uiStreamCount(): number {
    let count = 0;
    for (const stream of this.#streams) if (stream.kind === "ui") count += 1;
    return count;
  }

  // Runs when a page (ui token) stream ends; the argument is how many page streams remain. D3 closes the ARM
  // window when it reaches 0. Returns an unsubscribe function.
  onUiStreamsClosed(callback: (remainingUiStreams: number) => void): () => void {
    this.#closeListeners.add(callback);
    return () => {
      this.#closeListeners.delete(callback);
    };
  }

  setStatusProvider(provider: StatusProvider | undefined): void {
    this.#statusProvider = provider;
  }

  // Builds the status through the provider and publishes it. Does nothing without a provider.
  async publishStatus(): Promise<UiEvent | undefined> {
    if (this.#statusProvider === undefined) return undefined;
    let status: StatusResponse | undefined;
    try {
      status = await this.#statusProvider();
    } catch {
      return undefined;
    }
    return status === undefined ? undefined : this.publish({ type: "status", status });
  }

  publishPosture(posture: PostureName, armedUntil: string | null): UiEvent | undefined {
    this.#posture = { posture, armed_until: armedUntil };
    return this.publish({ type: "posture", posture, armed_until: armedUntil });
  }

  // Validates, stores and delivers one event. Returns the event, or undefined when it was dropped.
  publish(body: UiEventBody): UiEvent | undefined {
    if (this.#closed) return undefined;
    const candidate = { ...body, id: this.#head + 1, at: isoSecond(this.#host.clock()) };
    const parsed = uiEventSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      this.#reject(`event.${body.type}${issue === undefined || issue.path.length === 0 ? "" : `.${issue.path.map(String).join(".")}`}`);
      return undefined;
    }
    const data = JSON.stringify(parsed.data);
    if (TOKEN_SCAN_PATTERN.test(data)) {
      this.#reject(`event.${body.type}.token_shaped`);
      return undefined;
    }
    this.#head = parsed.data.id;
    const stored: StoredEvent = { id: parsed.data.id, type: parsed.data.type, data };
    this.#ring.push(stored);
    this.#ringSize += data.length;
    while (this.#ring.length > this.#ringEvents || (this.#ringSize > this.#ringBytes && this.#ring.length > 1)) {
      const evicted = this.#ring.shift();
      if (evicted === undefined) break;
      this.#ringSize -= evicted.data.length;
    }
    for (const listener of [...this.#listeners]) {
      try {
        listener(stored);
      } catch {
        // one broken listener must not stop the others
      }
    }
    for (const stream of [...this.#streams]) stream.push(frame(stored.id, stored.data));
    return parsed.data;
  }

  #reject(field: string): void {
    this.#dropped += 1;
    // A rejected audit entry must not loop through the audit adapter back into the bus.
    if (this.#reporting) return;
    this.#reporting = true;
    try {
      this.#host.emitAudit({ ev: "schema.violation", field: field.slice(0, 80) });
    } finally {
      this.#reporting = false;
    }
  }

  // Everything after `lastId`, or "gap" when the ring cannot prove it still has all of it.
  since(lastId: number): { readonly kind: "ok"; readonly events: readonly StoredEvent[] } | { readonly kind: "gap" } {
    if (lastId > this.#head) return { kind: "gap" };
    const first = this.#ring[0]?.id ?? this.#head + 1;
    if (lastId < first - 1) return { kind: "gap" };
    return { kind: "ok", events: this.#ring.filter((event) => event.id > lastId) };
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  // Why a new stream may be refused: too many in all, or too many for one token.
  admission(tokenId: string): "ok" | "full" {
    if (this.#streams.size >= this.#maxStreams) return "full";
    let mine = 0;
    for (const stream of this.#streams) if (stream.tokenId === tokenId) mine += 1;
    return mine >= this.#maxPerToken ? "full" : "ok";
  }

  // Serves one stream. `replay` is what the client missed (undefined: a fresh stream). A fresh stream starts with the
  // snapshot (posture, status). A RESUMED stream gets the replay first and the snapshot after it (review finding F1):
  // the page always resumes, so without the snapshot Posture, Kill switch and Audit head would stay "not known yet" for
  // a whole session, and a page opened after a kill would not show KILLED. The snapshot follows the replay so the
  // newest state wins; a posture the replay already carries is not repeated. `resumeFrom` is the client's
  // Last-Event-ID, used to catch up on events published while the status was being built.
  async serve(
    sink: StreamSink,
    who: { readonly tokenId: string; readonly kind: "ui" | "agent" },
    replay: readonly StoredEvent[] | undefined,
    resumeFrom?: number,
  ): Promise<void> {
    const startHead = this.#head;
    // The snapshot is built before the stream is registered, so no live event can slip in ahead of it.
    const snapshot = await this.#snapshot({ posture: replay === undefined || !replay.some((event) => event.type === "posture") });
    if (sink.closed || this.#closed) {
      sink.end();
      return;
    }
    // Events published while the status was being built: the replay was cut before the await, so they would be lost.
    // They go after the snapshot, which was built before them, so the snapshot cannot overwrite them.
    let late: readonly StoredEvent[] = [];
    let snapshotId = this.#head;
    if (replay !== undefined) {
      snapshotId = replay.at(-1)?.id ?? resumeFrom ?? startHead;
      const caught = this.since(snapshotId);
      if (caught.kind === "gap") {
        // The ring moved past the client while it waited: it reconnects and is told to reload (resume_gap).
        sink.end();
        return;
      }
      late = caught.events;
    }
    const queue: string[] = [];
    let waiting = false;
    let finished = false;
    const flush = (): void => {
      waiting = false;
      while (queue.length > 0 && !sink.closed) {
        const chunk = queue[0] as string;
        const accepted = sink.write(chunk);
        queue.shift();
        if (!accepted) {
          if (!waiting) {
            waiting = true;
            sink.onDrain(flush);
          }
          return;
        }
      }
    };
    const handle: StreamHandle = {
      tokenId: who.tokenId,
      kind: who.kind,
      push: (chunk) => {
        if (finished) return;
        queue.push(chunk);
        // A reader that cannot keep up is cut off; it reconnects with Last-Event-ID and resumes.
        if (queue.length > this.#maxQueue) {
          sink.end();
          return;
        }
        if (!waiting) flush();
      },
      end: () => sink.end(),
    };
    this.#streams.add(handle);
    sink.onClose(() => {
      finished = true;
      this.#streams.delete(handle);
      queue.length = 0;
      if (this.#streams.size === 0 && this.#timer !== undefined) {
        this.#timers.clearInterval(this.#timer);
        this.#timer = undefined;
      }
      if (who.kind === "ui") {
        const remaining = this.uiStreamCount();
        for (const callback of [...this.#closeListeners]) {
          try {
            callback(remaining);
          } catch {
            // see publish
          }
        }
      }
    });
    queue.push("retry: 3000\n\n");
    // A fresh stream starts from "now": the page reads the inbox first, and gets the posture and status here.
    if (replay === undefined) {
      for (const text of snapshot) queue.push(frame(this.#head, text));
    } else {
      for (const event of replay) queue.push(frame(event.id, event.data));
      // Carries the id of the last frame before it, so a client's Last-Event-ID never moves backwards.
      for (const text of snapshot) queue.push(frame(snapshotId, text));
      for (const event of late) queue.push(frame(event.id, event.data));
    }
    if (this.#timer === undefined && !finished) {
      this.#timer = this.#timers.setInterval(() => this.#beat(), this.#heartbeatMs);
    }
    flush();
  }

  async #snapshot(include: { readonly posture: boolean }): Promise<string[]> {
    const out: string[] = [];
    const at = isoSecond(this.#host.clock());
    if (include.posture && this.#posture !== undefined) {
      const parsed = uiEventSchema.safeParse({ id: this.#head, at, type: "posture", ...this.#posture });
      if (parsed.success) out.push(JSON.stringify(parsed.data));
    }
    if (this.#statusProvider !== undefined) {
      try {
        const status = await this.#statusProvider();
        if (status !== undefined) {
          const parsed = uiEventSchema.safeParse({ id: this.#head, at, type: "status", status });
          if (parsed.success) out.push(JSON.stringify(parsed.data));
        }
      } catch {
        // no status snapshot; the page asks /ui/status itself
      }
    }
    return out;
  }

  #beat(): void {
    const parsed = uiEventSchema.safeParse({ id: this.#head, at: isoSecond(this.#host.clock()), type: "heartbeat" });
    if (!parsed.success) return;
    const text = frame(this.#head, JSON.stringify(parsed.data));
    for (const stream of [...this.#streams]) stream.push(text);
  }

  close(): void {
    this.#closed = true;
    if (this.#timer !== undefined) this.#timers.clearInterval(this.#timer);
    this.#timer = undefined;
    for (const stream of [...this.#streams]) stream.end();
    this.#listeners.clear();
    this.#closeListeners.clear();
  }
}

// One server-sent event. JSON.stringify output has no raw line break, so one `data:` line is the whole payload.
function frame(id: number, data: string): string {
  return `id: ${String(id)}\ndata: ${data}\n\n`;
}

const buses = new WeakMap<DaemonHost, EventBus>();

// The host's one bus. Created on first use by whichever module asks first, so load order does not matter.
export function eventBusOf(host: DaemonHost, options?: EventBusOptions): EventBus {
  let bus = buses.get(host);
  if (bus === undefined) {
    bus = new EventBus(host, options);
    buses.set(host, bus);
    host.onClose(() => bus?.close());
  } else if (options !== undefined) {
    bus.configure(options);
  }
  return bus;
}

const LAST_EVENT_ID = /^\d{1,15}$/;

export function createEventsModule(options: EventBusOptions = {}): BridgeModuleFactory {
  return (host: DaemonHost): BridgeModule => {
    const bus = eventBusOf(host, options);
    return {
      name: "events",
      routes: [
        defineRoute({
          method: "GET",
          path: EVENTS_PATH,
          access: { scope: "read" },
          handler: (ctx) => {
            const principal = ctx.principal;
            if (principal === null) return fail("unauthorized", "A valid bearer token is required.");
            if (ctx.query !== "") return fail("invalid_request", "The event stream takes no query string. Resume with the Last-Event-ID header.");
            const header = ctx.headers["last-event-id"];
            let replay: readonly StoredEvent[] | undefined;
            let resumeFrom: number | undefined;
            if (header !== undefined && header !== "") {
              if (!LAST_EVENT_ID.test(header)) return fail("invalid_request", "Last-Event-ID must be a whole number.");
              const missed = bus.since(Number(header));
              if (missed.kind === "gap") {
                return fail("precondition_failed", "The events after that id are no longer held. Reload the inbox and open a new stream.", { details: { reason: "resume_gap" } });
              }
              replay = missed.events;
              resumeFrom = Number(header);
            }
            if (bus.admission(principal.id) === "full") {
              return fail("rate_limited", "Too many event streams are open. Close one and try again.", { retryAfterS: 5 });
            }
            return {
              kind: "stream" as const,
              contentType: "text/event-stream; charset=utf-8",
              start: (sink) => bus.serve(sink, { tokenId: principal.id, kind: principal.kind }, replay, resumeFrom),
            };
          },
        }),
      ],
      close: () => bus.close(),
    };
  };
}

export const bridgeModule: BridgeModuleFactory = createEventsModule();
