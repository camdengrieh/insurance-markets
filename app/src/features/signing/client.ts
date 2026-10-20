// The signing screen's connection to the daemon: the inbox, the "shown" and "reject" decisions, and a read-only
// status check by hash. Same origin, bearer token only, no cookie, no redirect followed.
//
// What this file will and will not do (acceptance M4-4):
//   - It has THREE routes: GET /ui/inbox, POST /ui/inbox/decision and GET /ui/userop|order/<hash>. Every path
//     comes from the constants below or from the contract's path builders. There is no generic "call a path" method.
//   - It never sends a signature, a submit request or a sign request. The decision route takes two kinds of body
//     (shown, reject), and the body is validated against the contract's schema before it leaves.
//   - Every answer is validated against the frozen contract before it is returned.
//   - Error text is fixed wording here; the daemon's message is never shown.

import {
  MAX_PROXY_RESPONSE_BYTES,
  UI_GET_ROUTES,
  inboxDecisionRequestSchema,
  inboxItemSchema,
  orderStatusUiPath,
  userOpStatusUiPath,
  type InboxItem,
} from "@bridge/contract";

import { internals, translateTransportError, type RawResponse } from "../../core/fetch";
import { DaemonClient, DaemonError, REQUEST_TIMEOUT_MS, authorizedInit, daemonErrorOf, type DaemonDeps, type InboxSnapshot } from "../terminal/client";

export const INBOX_PATH = "/ui/inbox";
export const DECISION_PATH = "/ui/inbox/decision";

export type DecisionBody = ReturnType<typeof inboxDecisionRequestSchema.parse>;

export interface ReconcileResult {
  readonly kind: "userop" | "order";
  readonly hash: string;
  // A closed word from the relay contract.
  readonly state: string;
  readonly txHash: string | null;
  // Relay text; shown only in an untrusted slot.
  readonly detail: string | null;
}

function transportErrorOf(error: unknown, deadline: InstanceType<typeof internals.Deadline>): DaemonError {
  if (error instanceof DaemonError) return error;
  switch (translateTransportError(error, deadline, null).code) {
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

export class SigningClient {
  readonly #deps: DaemonDeps;
  readonly #daemon: DaemonClient;

  constructor(deps: DaemonDeps) {
    this.#deps = deps;
    this.#daemon = new DaemonClient(deps);
  }

  async #json(path: string, extra: { readonly method?: "GET" | "POST"; readonly body?: string }, signal?: AbortSignal): Promise<unknown> {
    const token = this.#deps.getToken();
    if (token === null || token === "") throw new DaemonError("not_paired");
    const deadline = new internals.Deadline(this.#deps.timers, REQUEST_TIMEOUT_MS, signal);
    try {
      const request = this.#deps.rawFetch(path, authorizedInit(token, deadline.signal, extra));
      request.catch(() => undefined);
      const response: RawResponse = await deadline.race(request);
      if (internals.isRedirect(response)) throw new DaemonError("network");
      const text = await internals.readCapped(response, MAX_PROXY_RESPONSE_BYTES, deadline, null);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw response.ok ? new DaemonError("bad_response", { status: response.status }) : daemonErrorOf(response.status, null, response.headers.get("retry-after"));
      }
      if (!response.ok) throw daemonErrorOf(response.status, json, response.headers.get("retry-after"));
      return json;
    } catch (error) {
      throw transportErrorOf(error, deadline);
    } finally {
      deadline.done();
    }
  }

  // Items that fail the relay's strict schemas are counted and dropped by the shared reader.
  inbox(signal?: AbortSignal): Promise<InboxSnapshot> {
    return this.#daemon.inbox(signal);
  }

  // Tells the daemon what the card showed (audit only; it never trusts it) or that the user rejected the item.
  async decide(body: DecisionBody, signal?: AbortSignal): Promise<InboxItem> {
    const checked = inboxDecisionRequestSchema.parse(body);
    const json = await this.#json(DECISION_PATH, { method: "POST", body: JSON.stringify(checked) }, signal);
    const parsed = inboxItemSchema.safeParse(json);
    if (!parsed.success || parsed.data.prepared_id !== checked.prepared_id) throw new DaemonError("bad_response");
    return parsed.data;
  }

  // "Do not resend, reconcile by hash" (M4-9): a read of the relay's status for one hash. Read only.
  async reconcile(kind: "userop" | "order", hash: string, signal?: AbortSignal): Promise<ReconcileResult> {
    if (kind === "userop") {
      const json = await this.#json(userOpStatusUiPath(hash), {}, signal);
      const parsed = UI_GET_ROUTES["/ui/userop/:hash"].response.safeParse(json);
      if (!parsed.success || parsed.data.user_op_hash.toLowerCase() !== hash.toLowerCase()) throw new DaemonError("bad_response");
      return { kind, hash: parsed.data.user_op_hash, state: parsed.data.state, txHash: parsed.data.tx_hash ?? null, detail: parsed.data.detail ?? null };
    }
    const json = await this.#json(orderStatusUiPath(hash), {}, signal);
    const parsed = UI_GET_ROUTES["/ui/order/:hash"].response.safeParse(json);
    if (!parsed.success || parsed.data.order_hash.toLowerCase() !== hash.toLowerCase()) throw new DaemonError("bad_response");
    return { kind, hash: parsed.data.order_hash, state: parsed.data.state, txHash: null, detail: parsed.data.detail ?? null };
  }
}
