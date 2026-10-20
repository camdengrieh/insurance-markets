// The terminal's connection to the daemon it was served from: three JSON routes (status, inbox, tool) and the
// event stream (stream.ts). Same origin, bearer token only, no cookie, no redirect followed.
//
// What this file will and will not do:
//   - It calls POST /ui/tool only with a TerminalTool (tools.ts), a closed list of read-class tools, and only with
//     arguments from the tools.ts builders. It has no generic "call anything" method.
//   - Every answer is validated against the frozen contract (bridge/contract.ts) before it is returned. A shape
//     the contract does not know is a DaemonError, not a best effort.
//   - Error text comes from fixed wording here. The daemon's own message is never shown, because a message is
//     text, and text on this screen is either ours or inside the untrusted slot.

import {
  MAX_PROXY_RESPONSE_BYTES,
  bridgeErrorResponseSchema,
  inboxItemSchema,
  statusResponseSchema,
  toolCallResponseSchema,
  type BridgeErrorCode,
  type InboxItem,
  type StatusResponse,
  type ToolClass,
} from "@bridge/contract";

import type { TimerApi } from "../../core/cache";
import { FetchError, internals, translateTransportError, type RawFetch, type RawInit, type RawResponse } from "../../core/fetch";
import { isTerminalTool, type ToolArgs, type TerminalTool } from "./tools";

export const REQUEST_TIMEOUT_MS = 15_000;
// A tool answer is at most 128 KiB of JSON from the plugin plus the envelope; the status and inbox are smaller than
// the read proxy's cap. One cap for all three keeps the code short.
export const MAX_JSON_BYTES = MAX_PROXY_RESPONSE_BYTES;

export type DaemonErrorCode =
  | "not_paired" // no token: the page has not been paired with the daemon
  | "unauthorized" // the daemon refused the token: it expired or the daemon restarted
  | "refused" // the daemon answered with one of its own error codes (bridgeCode says which)
  | "network"
  | "timeout"
  | "aborted"
  | "too_large"
  | "bad_response"; // not JSON, or not the contract's shape

export class DaemonError extends Error {
  readonly code: DaemonErrorCode;
  readonly bridgeCode: BridgeErrorCode | null;
  readonly status: number | null;
  readonly retryAfterS: number | null;
  constructor(code: DaemonErrorCode, extra: { bridgeCode?: BridgeErrorCode | null; status?: number | null; retryAfterS?: number | null } = {}) {
    // The message is the code: it never carries anything the daemon or a venue said.
    super(code);
    this.name = "DaemonError";
    this.code = code;
    this.bridgeCode = extra.bridgeCode ?? null;
    this.status = extra.status ?? null;
    this.retryAfterS = extra.retryAfterS ?? null;
  }
}

export function isDaemonError(value: unknown): value is DaemonError {
  return value instanceof DaemonError;
}

export interface DaemonDeps {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  // The ui token, read at call time. null before pairing.
  readonly getToken: () => string | null;
}

export interface ToolCallResult {
  readonly toolClass: ToolClass;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly structured: unknown;
  // The plugin's text block, capped by the daemon. Untrusted: it may quote market text.
  readonly text: string | null;
  readonly error: { readonly code: BridgeErrorCode } | null;
}

export interface InboxSnapshot {
  readonly items: readonly InboxItem[];
  // Rows the page could not validate against the relay's own schemas. They are counted, never shown.
  readonly invalid: number;
  // The latest event the list reflects; the stream resumes from here.
  readonly eventId: number;
}

export function authorizedInit(
  token: string,
  signal: AbortSignal,
  extra: { readonly method?: "GET" | "POST"; readonly body?: string; readonly headers?: Readonly<Record<string, string>> } = {},
): RawInit {
  const post = extra.method === "POST";
  return {
    method: post ? "POST" : "GET",
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(post ? { "content-type": "application/json" } : {}), ...(extra.headers ?? {}) },
    ...(post && extra.body !== undefined ? { body: extra.body } : {}),
    signal,
    credentials: "omit",
    redirect: "manual",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    mode: "cors",
  };
}

// A failure answer (`{ error: { code, ... } }`) as a DaemonError. A body that is not the contract's error shape is
// bad_response; the status alone says what happened.
export function daemonErrorOf(status: number, json: unknown, retryAfterHeader: string | null): DaemonError {
  const parsed = bridgeErrorResponseSchema.safeParse(json);
  const headerS = retryAfterHeader !== null && /^[0-9]{1,6}$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
  if (!parsed.success) return new DaemonError(status === 401 || status === 403 ? "unauthorized" : "bad_response", { status });
  const { code, retry_after_s: retryS } = parsed.data.error;
  const retryAfterS = retryS ?? headerS;
  if (status === 401 || code === "unauthorized") return new DaemonError("unauthorized", { bridgeCode: code, status, retryAfterS });
  return new DaemonError("refused", { bridgeCode: code, status, retryAfterS });
}

function transportError(error: unknown, deadline: InstanceType<typeof internals.Deadline>): DaemonError {
  if (error instanceof DaemonError) return error;
  const fetchError: FetchError = translateTransportError(error, deadline, null);
  switch (fetchError.code) {
    case "timeout":
      return new DaemonError("timeout");
    case "aborted":
      return new DaemonError("aborted");
    case "too_large":
      return new DaemonError("too_large");
    case "network":
    case "redirect":
      return new DaemonError("network");
    default:
      return new DaemonError("bad_response");
  }
}

export class DaemonClient {
  readonly #deps: DaemonDeps;

  constructor(deps: DaemonDeps) {
    this.#deps = deps;
  }

  hasToken(): boolean {
    const token = this.#deps.getToken();
    return token !== null && token !== "";
  }

  async #json(path: string, extra: { readonly method?: "GET" | "POST"; readonly body?: string }, signal?: AbortSignal): Promise<unknown> {
    const token = this.#deps.getToken();
    if (token === null || token === "") throw new DaemonError("not_paired");
    const deadline = new internals.Deadline(this.#deps.timers, REQUEST_TIMEOUT_MS, signal);
    try {
      const request = this.#deps.rawFetch(path, authorizedInit(token, deadline.signal, extra));
      // The race below reports the outcome; this keeps a request that settles first from being reported twice.
      request.catch(() => undefined);
      const response: RawResponse = await deadline.race(request);
      if (internals.isRedirect(response)) throw new DaemonError("network");
      const text = await internals.readCapped(response, MAX_JSON_BYTES, deadline, null);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw response.ok ? new DaemonError("bad_response", { status: response.status }) : daemonErrorOf(response.status, null, response.headers.get("retry-after"));
      }
      if (!response.ok) throw daemonErrorOf(response.status, json, response.headers.get("retry-after"));
      return json;
    } catch (error) {
      throw transportError(error, deadline);
    } finally {
      deadline.done();
    }
  }

  async status(signal?: AbortSignal): Promise<StatusResponse> {
    const json = await this.#json("/ui/status", {}, signal);
    const parsed = statusResponseSchema.safeParse(json);
    if (!parsed.success) throw new DaemonError("bad_response");
    return parsed.data;
  }

  // The prepared items the daemon holds, newest state included. Items that fail the relay's strict schemas are
  // counted and dropped here; the signing screen is where a malformed item is examined.
  async inbox(signal?: AbortSignal): Promise<InboxSnapshot> {
    const json = await this.#json("/ui/inbox", {}, signal);
    if (typeof json !== "object" || json === null) throw new DaemonError("bad_response");
    const record = json as { readonly items?: unknown; readonly event_id?: unknown };
    if (!Array.isArray(record.items) || record.items.length > 200 || typeof record.event_id !== "number" || !Number.isInteger(record.event_id) || record.event_id < 0) {
      throw new DaemonError("bad_response");
    }
    const items: InboxItem[] = [];
    let invalid = 0;
    for (const raw of record.items as unknown[]) {
      const parsed = inboxItemSchema.safeParse(raw);
      if (parsed.success) items.push(parsed.data);
      else invalid += 1;
    }
    return { items, invalid, eventId: record.event_id };
  }

  // One read-class tool call. The daemon checks the class, the scope, the kill switch and the rate limit; this side
  // only names a tool from the closed list.
  async callTool(tool: TerminalTool, args: ToolArgs, signal?: AbortSignal): Promise<ToolCallResult> {
    if (!isTerminalTool(tool)) throw new DaemonError("bad_response");
    const json = await this.#json("/ui/tool", { method: "POST", body: JSON.stringify({ tool, args }) }, signal);
    const parsed = toolCallResponseSchema.safeParse(json);
    if (!parsed.success || parsed.data.tool !== tool) throw new DaemonError("bad_response");
    const value = parsed.data;
    return {
      toolClass: value.tool_class,
      ok: value.ok,
      durationMs: value.duration_ms,
      structured: value.structured,
      text: value.text,
      error: value.error === null ? null : { code: value.error.code },
    };
  }
}
