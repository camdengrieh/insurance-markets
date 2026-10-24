// The page's side of our markets API's Limitless partner relay (docs/unified-account-design.md section 3.2). Limitless
// sends no CORS headers for this page, and every authenticated Limitless call is made by the relay with OUR partner
// token, which never reaches the browser. The browser signs only what proves the trading key's own intent:
//   signing-message   GET, no auth: Limitless's own ownership text with its nonce, read by the relay;
//   register          POST {account, signingMessageHex, signature}: the key's personal_sign over that text; the relay
//                     registers the key as our sub-account and answers {profileId} (409: the address already has a
//                     Limitless account of its own, which no partner can reach);
//   orders            POST {account, order, orderType, marketSlug}: the order's own EIP-712 signature proves control;
//                     the relay adds ownerId and onBehalfOf from its own record;
//   orders/cancel     POST {account, orderId} and GET orders?account&marketSlug, each with the x-im-proof header
//                     (features/account/proof.ts), because neither carries a signature of its own;
//   markets/<slug>    GET, unchanged: the market record an order is built from.
// Every call goes through the direct path's one network door (../http.ts). The answer is read as text (JSON parsed when
// it is JSON) and says who answered: Limitless through the relay, or the relay itself (the x-limitless-relay header).
// Nothing is retried: a send that got no answer is reported as unknown by the caller.

import type { Address, Hex } from "viem";

import type { VenueHttp } from "../http";
import { PROOF_HEADER } from "../../../account/proof";

export const LIMITLESS_RELAY_PATH = "/v1/relay/limitless";
export const LIMITLESS_RELAY_MARKER = "x-limitless-relay";

export interface LimitlessAnswer {
  readonly status: number;
  // "limitless": Limitless answered and the relay passed it on. "relay": the relay answered itself (its own refusal, or
  // a route it composes, such as register).
  readonly from: "limitless" | "relay";
  readonly text: string;
  // The parsed body, or undefined when it is not JSON.
  readonly json: unknown;
}

export interface LimitlessRegistration {
  readonly account: Address;
  // 0x + the hex of the message's UTF-8 bytes, exactly as Limitless gave it.
  readonly signingMessageHex: Hex;
  readonly signature: Hex;
}

export interface LimitlessRelayClient {
  readonly origin: string;
  // Our API's paths as sent (with the query), which the ownership proofs name.
  readonly paths: { readonly cancel: string; ordersOf(account: Address, slug: string): string };
  market(slug: string): Promise<LimitlessAnswer>;
  signingMessage(): Promise<LimitlessAnswer>;
  register(body: LimitlessRegistration): Promise<LimitlessAnswer>;
  // `body` is the exact JSON text sent.
  postOrder(body: string): Promise<LimitlessAnswer>;
  cancelOrder(body: string, proof: string): Promise<LimitlessAnswer>;
  userOrders(account: Address, slug: string, proof: string): Promise<LimitlessAnswer>;
}

function ordersQuery(account: Address, slug: string): string {
  return `/orders?${new URLSearchParams({ account, marketSlug: slug }).toString()}`;
}

export function createLimitlessRelayClient(http: VenueHttp, origin: string): LimitlessRelayClient {
  async function send(method: "GET" | "POST", path: string, body?: string, proof?: string): Promise<LimitlessAnswer> {
    const headers: Record<string, string> = { accept: "application/json, text/plain" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (proof !== undefined) headers[PROOF_HEADER] = proof;
    const answer = await http({ method, url: `${origin}${LIMITLESS_RELAY_PATH}${path}`, headers, ...(body === undefined ? {} : { body }), marker: LIMITLESS_RELAY_MARKER });
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
    paths: { cancel: `${LIMITLESS_RELAY_PATH}/orders/cancel`, ordersOf: (account, slug) => `${LIMITLESS_RELAY_PATH}${ordersQuery(account, slug)}` },
    market: (slug) => send("GET", `/markets/${slug}`),
    signingMessage: () => send("GET", "/signing-message"),
    register: (body) => send("POST", "/register", JSON.stringify({ account: body.account, signingMessageHex: body.signingMessageHex, signature: body.signature })),
    postOrder: (body) => send("POST", "/orders", body),
    cancelOrder: (body, proof) => send("POST", "/orders/cancel", body, proof),
    userOrders: (account, slug, proof) => send("GET", ordersQuery(account, slug), undefined, proof),
  };
}
