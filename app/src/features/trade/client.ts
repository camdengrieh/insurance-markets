// The trade screens' connection to the daemon they were served from: one route, POST /ui/tool, with the page's ui
// token. Same origin, bearer token only, no cookie, no redirect followed.
//
// What this file will and will not do:
//   - It calls /ui/tool only with a TradeTool (tools.ts), a closed list of read-class and prepare-class tools, and
//     only with arguments from the tools.ts builders. It has no generic "call anything" method, no submit step and
//     no other route: there is no code path here that sends a signature (M4-4).
//   - The answer's `tool_class` must be the class the closed list says. A daemon that classes a tool differently is
//     a bad response, not a best effort.
//   - Error text comes from fixed wording elsewhere. The daemon's own message is never shown (it is text).

import { toolCallResponseSchema, type BridgeErrorCode, type ToolClass } from "@bridge/contract";

import type { TimerApi } from "../../core/cache";
import { internals, translateTransportError, type RawFetch, type RawResponse } from "../../core/fetch";
import { DaemonError, MAX_JSON_BYTES, REQUEST_TIMEOUT_MS, authorizedInit, daemonErrorOf } from "../terminal/client";
import { isTradeTool, toolClassOf, type ToolArgs, type TradeTool } from "./tools";

export { DaemonError, isDaemonError } from "../terminal/client";

export interface TradeClientDeps {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  // The ui token, read at call time. null before pairing.
  readonly getToken: () => string | null;
}

export interface TradeCallResult {
  readonly toolClass: ToolClass;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly structured: unknown;
  // The plugin's text block. Untrusted: it may quote the relay.
  readonly text: string | null;
  readonly error: { readonly code: BridgeErrorCode } | null;
}

function transportError(error: unknown, deadline: InstanceType<typeof internals.Deadline>): DaemonError {
  if (error instanceof DaemonError) return error;
  const fetchError = translateTransportError(error, deadline, null);
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

export class TradeClient {
  readonly #deps: TradeClientDeps;

  constructor(deps: TradeClientDeps) {
    this.#deps = deps;
  }

  hasToken(): boolean {
    const token = this.#deps.getToken();
    return token !== null && token !== "";
  }

  async callTool(tool: TradeTool, args: ToolArgs, signal?: AbortSignal): Promise<TradeCallResult> {
    if (!isTradeTool(tool)) throw new DaemonError("bad_response");
    const token = this.#deps.getToken();
    if (token === null || token === "") throw new DaemonError("not_paired");
    const deadline = new internals.Deadline(this.#deps.timers, REQUEST_TIMEOUT_MS, signal);
    try {
      const request = this.#deps.rawFetch("/ui/tool", authorizedInit(token, deadline.signal, { method: "POST", body: JSON.stringify({ tool, args }) }));
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
      const parsed = toolCallResponseSchema.safeParse(json);
      if (!parsed.success || parsed.data.tool !== tool || parsed.data.tool_class !== toolClassOf(tool)) throw new DaemonError("bad_response");
      const value = parsed.data;
      return {
        toolClass: value.tool_class,
        ok: value.ok,
        durationMs: value.duration_ms,
        structured: value.structured,
        text: value.text,
        error: value.error === null ? null : { code: value.error.code },
      };
    } catch (error) {
      throw transportError(error, deadline);
    } finally {
      deadline.done();
    }
  }
}
