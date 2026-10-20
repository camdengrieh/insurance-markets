// The observer pane's feed: GET /ui/events (server-sent events), read with fetch so the bearer token travels in a
// header (EventSource cannot send one, and a token in a URL would land in logs and history).
//
// The loop is the contract of bridge/events.ts, nothing more:
//   - read the inbox first, then open the stream with Last-Event-ID set to the inbox's event_id, so nothing
//     between the two is missed;
//   - a reconnect resumes from the last id seen;
//   - HTTP 422 with no way to resume (the ring no longer holds what was missed) means: read the inbox again and
//     open a fresh stream. A silent gap would show a wrong state, so it is never papered over;
//   - 401 or 403 stops the loop (the token is no longer good); the pane says so and retrying would not help;
//   - a stream that goes quiet for longer than three heartbeats is dropped and reopened.
// Each frame is validated against uiEventSchema. A frame that fails is reported (id only) and dropped; its
// content is never shown. The loop holds at most one connection and ends the moment the signal aborts.

import { SSE_HEARTBEAT_MS, uiEventSchema, type UiEvent } from "@bridge/contract";

import { backoffDelayMs } from "../../core/budget";
import type { TimerApi } from "../../core/cache";
import { internals, type RawFetch, type RawResponse } from "../../core/fetch";
import { REQUEST_TIMEOUT_MS, authorizedInit, daemonErrorOf } from "./client";

export const STREAM_STATES = ["connecting", "live", "reconnecting", "resyncing", "unauthorized", "stopped"] as const;
export type StreamState = (typeof STREAM_STATES)[number];

export const STALL_MS = SSE_HEARTBEAT_MS * 3;
// One frame is a whole prepared item at most (about 160,000 characters); anything larger is a fault.
export const MAX_FRAME_BYTES = 1024 * 1024;

export interface StreamDeps {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  readonly getToken: () => string | null;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly random: () => number;
}

export interface StreamHandlers {
  readonly onState: (state: StreamState) => void;
  readonly onEvent: (event: UiEvent) => void;
  // A frame that failed the contract. Only its id is passed on.
  readonly onViolation: (id: number | null) => void;
  // Read the inbox again and return the event id it reflects (null when the read failed). Called once before the
  // first connection and again after a resume gap.
  readonly resync: () => Promise<number | null>;
}

interface ParsedFrame {
  readonly id: number | null;
  readonly data: string | null;
}

// Splits the buffer into complete frames and the unfinished rest. A frame ends at a blank line. Comment lines
// (a colon first) and the retry field are ignored; the daemon sets the retry interval itself.
export function drainFrames(buffer: string): { readonly frames: readonly ParsedFrame[]; readonly rest: string } {
  const text = buffer.replace(/\r\n/g, "\n");
  const frames: ParsedFrame[] = [];
  let start = 0;
  for (;;) {
    const end = text.indexOf("\n\n", start);
    if (end === -1) break;
    const block = text.slice(start, end);
    start = end + 2;
    let id: number | null = null;
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line === "" || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "id" && /^[0-9]{1,15}$/.test(value)) id = Number(value);
      else if (field === "data") data.push(value);
    }
    if (id !== null || data.length > 0) frames.push({ id, data: data.length === 0 ? null : data.join("\n") });
  }
  return { frames, rest: text.slice(start) };
}

// The stream's retry interval is at least a second, whatever the jitter draws.
function retryDelay(deps: StreamDeps, attempt: number): number {
  return Math.max(1000, backoffDelayMs(attempt, deps.random));
}

export async function runEventStream(deps: StreamDeps, handlers: StreamHandlers, signal: AbortSignal): Promise<void> {
  let lastId: number | null = null;
  let attempt = 0;
  let needResync = true;
  let resyncsInARow = 0;

  const finish = (state: StreamState): void => handlers.onState(state);

  while (!signal.aborted) {
    if (needResync) {
      finish("resyncing");
      // A second resync in a row means the daemon keeps refusing the resume: wait before asking again.
      if (resyncsInARow > 0) await deps.sleep(retryDelay(deps, resyncsInARow), signal);
      resyncsInARow += 1;
      if (signal.aborted) break;
      lastId = await handlers.resync();
      needResync = false;
      if (signal.aborted) break;
    }
    const token = deps.getToken();
    if (token === null || token === "") {
      finish("unauthorized");
      return;
    }
    finish(attempt === 0 ? "connecting" : "reconnecting");
    const deadline = new internals.Deadline(deps.timers, REQUEST_TIMEOUT_MS, signal);
    let response: RawResponse | null = null;
    try {
      const request = deps.rawFetch("/ui/events", authorizedInit(token, deadline.signal, { headers: { accept: "text/event-stream", ...(lastId === null ? {} : { "last-event-id": String(lastId) }) } }));
      request.catch(() => undefined);
      response = await deadline.race(request);
    } catch {
      response = null;
    }
    deadline.done();
    if (signal.aborted) break;
    if (response === null || internals.isRedirect(response)) {
      attempt += 1;
      await deps.sleep(retryDelay(deps, attempt), signal);
      continue;
    }
    if (!response.ok) {
      let json: unknown = null;
      try {
        json = JSON.parse(await response.text());
      } catch {
        json = null;
      }
      const failure = daemonErrorOf(response.status, json, response.headers.get("retry-after"));
      if (failure.code === "unauthorized") {
        finish("unauthorized");
        return;
      }
      if (response.status === 422) {
        // The events after our id are no longer held. Start again from the inbox.
        needResync = true;
        continue;
      }
      attempt += 1;
      const wait = failure.retryAfterS === null ? retryDelay(deps, attempt) : Math.max(1000, failure.retryAfterS * 1000);
      await deps.sleep(wait, signal);
      continue;
    }

    const reader = response.body?.getReader();
    if (reader === undefined) {
      attempt += 1;
      await deps.sleep(retryDelay(deps, attempt), signal);
      continue;
    }
    finish("live");
    attempt = 0;
    resyncsInARow = 0;
    const onAbort = (): void => void reader.cancel().catch(() => undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let buffer = "";
    try {
      for (;;) {
        const quiet = new internals.Deadline(deps.timers, STALL_MS, signal);
        let part: { readonly done: boolean; readonly value?: Uint8Array };
        try {
          part = await quiet.race(reader.read());
        } finally {
          quiet.done();
        }
        if (part.done) break;
        if (part.value === undefined) continue;
        buffer += decoder.decode(part.value, { stream: true });
        if (buffer.length > MAX_FRAME_BYTES) {
          // A frame this large is a fault. Drop the connection and start from the inbox.
          needResync = true;
          break;
        }
        const drained = drainFrames(buffer);
        buffer = drained.rest;
        for (const frame of drained.frames) {
          if (frame.id !== null && (lastId === null || frame.id > lastId)) lastId = frame.id;
          if (frame.data === null) continue;
          let json: unknown;
          try {
            json = JSON.parse(frame.data);
          } catch {
            handlers.onViolation(frame.id);
            continue;
          }
          const parsed = uiEventSchema.safeParse(json);
          if (parsed.success) handlers.onEvent(parsed.data);
          else handlers.onViolation(frame.id);
        }
      }
    } catch {
      // Stalled, aborted or a read error: fall through to the reconnect (or the loop condition).
    } finally {
      signal.removeEventListener("abort", onAbort);
      void reader.cancel().catch(() => undefined);
    }
    if (signal.aborted) break;
    attempt += 1;
    if (!needResync) await deps.sleep(retryDelay(deps, attempt), signal);
  }
  finish("stopped");
}
