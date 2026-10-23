// The page's side of the Limitless order relay (api/limitless-relay.ts on the markets API, at MARKETS_API_ORIGIN).
// Limitless sends no CORS headers for this page, so every call to it goes through the relay, which forwards what the
// browser signed and adds nothing. This client:
//   - builds the request for exactly one of the relay's routes, through the direct path's one network door (http.ts:
//     no cookie or credential, no referrer, no redirect, no cache, a timeout and a size cap);
//   - signs the signed routes here, with the visitor's own token (hmac.ts), over Limitless's own path and query (not
//     the relay's), so the relay can forward the bytes unchanged;
//   - reads the answer as text (JSON parsed when it is JSON) and says who answered: Limitless through the relay, or the
//     relay itself refusing (the x-limitless-relay header). It never retries: a send that got no answer is reported as
//     unknown by the caller.

import type { VenueHttp } from "../http";
import { buildLimitlessHeaders, isoSecondOf, type LimitlessToken } from "./hmac";

export const LIMITLESS_RELAY_PATH = "/v1/relay/limitless";
export const LIMITLESS_RELAY_MARKER = "x-limitless-relay";
// The most orders one listing asks for (the venue's user-orders route takes 1 to 200).
export const OPEN_ORDERS_LIMIT = 100;

export interface LimitlessAnswer {
  readonly status: number;
  // "limitless": Limitless answered and the relay passed it on. "relay": the relay refused (its own error body).
  readonly from: "limitless" | "relay";
  readonly text: string;
  // The parsed body, or undefined when it is not JSON.
  readonly json: unknown;
}

export interface LimitlessRelayClient {
  readonly origin: string;
  market(slug: string): Promise<LimitlessAnswer>;
  profile(token: LimitlessToken): Promise<LimitlessAnswer>;
  // `body` is the exact JSON text sent (the HMAC covers it).
  postOrder(token: LimitlessToken, body: string): Promise<LimitlessAnswer>;
  cancelOrder(token: LimitlessToken, orderId: string): Promise<LimitlessAnswer>;
  userOrders(token: LimitlessToken, slug: string): Promise<LimitlessAnswer>;
}

export function createLimitlessRelayClient(http: VenueHttp, origin: string, nowMs: () => number): LimitlessRelayClient {
  async function send(method: "GET" | "POST" | "DELETE", pathWithQuery: string, token: LimitlessToken | null, body?: string): Promise<LimitlessAnswer> {
    const signed = token === null ? {} : await buildLimitlessHeaders({ token, timestampIso: isoSecondOf(nowMs()), method, pathWithQuery, body: body ?? "" });
    const headers: Record<string, string> = { accept: "application/json", ...signed };
    if (body !== undefined) headers["content-type"] = "application/json";
    const answer = await http({ method, url: `${origin}${LIMITLESS_RELAY_PATH}${pathWithQuery}`, headers, ...(body === undefined ? {} : { body }), marker: LIMITLESS_RELAY_MARKER });
    let json: unknown;
    try {
      json = JSON.parse(answer.text) as unknown;
    } catch {
      json = undefined;
    }
    return { status: answer.status, from: answer.marker === "upstream" ? "limitless" : "relay", text: answer.text, json };
  }
  return {
    origin,
    market: (slug) => send("GET", `/markets/${slug}`, null),
    profile: (token) => send("GET", "/profiles/me", token),
    postOrder: (token, body) => send("POST", "/orders", token, body),
    cancelOrder: (token, orderId) => send("DELETE", `/orders/${orderId}`, token),
    userOrders: (token, slug) => send("GET", `/markets/${slug}/user-orders?limit=${OPEN_ORDERS_LIMIT}`, token),
  };
}
