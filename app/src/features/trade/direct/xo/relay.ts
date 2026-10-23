// The page's side of the XO order relay (api/xo-relay.ts on the markets API, at MARKETS_API_ORIGIN). XO's order book
// sends no CORS headers for this page, so every order-book call goes through the relay, which forwards what the
// browser signed and adds nothing. This client:
//   - builds the request for exactly one of the relay's routes, with XO's headers under their hyphen names
//     (xo-api-key ...): a proxy in front may drop a header name with an underscore, and the relay maps them back;
//   - sends no cookie or credential (credentials "omit"), no referrer, follows no redirect and caches nothing;
//   - reads the answer as text (JSON parsed when it is JSON) and says who answered: XO through the relay, or the relay
//     itself refusing (the x-xo-relay header). It never retries: a send that got no answer is reported as unknown.

import type { L1Headers } from "@sdk/trade/xo/clobauth";

import type { L2Headers } from "./hmac";

export const RELAY_BASE_PATH = "/v1/relay/xo/clob";
const TIMEOUT_MS = 15_000;
const MAX_ANSWER_CHARS = 1_048_576;

export type RelayFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface RelayAnswer {
  readonly status: number;
  // "xo": XO answered and the relay passed it on. "relay": the relay refused or could not reach XO (its own error body).
  readonly from: "xo" | "relay";
  readonly text: string;
  // The parsed body, or undefined when it is not JSON.
  readonly json: unknown;
}

export type RelayFailure = { readonly kind: "unreachable" | "timeout"; readonly message: string };

export class RelayError extends Error {
  readonly kind: RelayFailure["kind"];
  constructor(kind: RelayFailure["kind"], message: string) {
    super(message);
    this.name = "RelayError";
    this.kind = kind;
  }
}

type XoHeaderName = "XO_ADDRESS" | "XO_SIGNATURE" | "XO_TIMESTAMP" | "XO_NONCE" | "XO_API_KEY" | "XO_PASSPHRASE";

// XO_API_KEY -> xo-api-key.
export function relayHeaderName(name: XoHeaderName): string {
  return name.toLowerCase().replace(/_/g, "-");
}

function relayHeaders(headers: Partial<Record<XoHeaderName, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers) as Array<[XoHeaderName, string | undefined]>) {
    if (value !== undefined) out[relayHeaderName(name)] = value;
  }
  return out;
}

export interface RelayRequest {
  readonly method: "GET" | "POST" | "DELETE";
  // The order-book path, as XO names it ("/orders", "/order").
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Partial<Record<XoHeaderName, string>>;
  // The exact JSON text to send (the L2 signature covers these bytes).
  readonly body?: string;
}

export class XoRelayClient {
  readonly origin: string;
  readonly #fetch: RelayFetch;

  constructor(origin: string, fetchImpl: RelayFetch) {
    const url = new URL(origin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) throw new RangeError("The relay origin must be https.");
    this.origin = url.origin;
    this.#fetch = fetchImpl;
  }

  urlOf(path: string, query?: Readonly<Record<string, string>>): string {
    const search = query === undefined ? "" : new URLSearchParams(query).toString();
    return `${this.origin}${RELAY_BASE_PATH}${path}${search === "" ? "" : `?${search}`}`;
  }

  async send(request: RelayRequest): Promise<RelayAnswer> {
    const headers: Record<string, string> = { accept: "application/json", ...relayHeaders(request.headers ?? {}) };
    if (request.body !== undefined) headers["content-type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.#fetch(this.urlOf(request.path, request.query), {
        method: request.method,
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        mode: "cors",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new RelayError("timeout", "The relay did not answer in time.");
      throw new RelayError("unreachable", "The relay could not be reached.");
    } finally {
      clearTimeout(timer);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new RelayError("unreachable", "The relay's answer could not be read.");
    }
    if (text.length > MAX_ANSWER_CHARS) text = text.slice(0, MAX_ANSWER_CHARS);
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = undefined;
    }
    return { status: response.status, from: response.headers.get("x-xo-relay") === "upstream" ? "xo" : "relay", text, json };
  }

  // ---- the relay's routes -------------------------------------------------------------------------------------------

  time(): Promise<RelayAnswer> {
    return this.send({ method: "GET", path: "/time" });
  }

  balanceAllowance(account: string): Promise<RelayAnswer> {
    return this.send({ method: "GET", path: "/balance-allowance", query: { address: account.toLowerCase() } });
  }

  book(tokenId: string): Promise<RelayAnswer> {
    return this.send({ method: "GET", path: "/book", query: { token_id: tokenId } });
  }

  deriveApiKey(l1: L1Headers): Promise<RelayAnswer> {
    return this.send({ method: "GET", path: "/auth/derive-api-key", headers: l1Of(l1) });
  }

  // XO's create takes an empty JSON object as its body (relay/credentials.ts sends the same).
  createApiKey(l1: L1Headers): Promise<RelayAnswer> {
    return this.send({ method: "POST", path: "/auth/api-key", headers: l1Of(l1), body: "{}" });
  }

  postOrder(body: string, l2: L2Headers): Promise<RelayAnswer> {
    return this.send({ method: "POST", path: "/order", headers: { ...l2 }, body });
  }

  cancelOrder(body: string, l2: L2Headers): Promise<RelayAnswer> {
    return this.send({ method: "DELETE", path: "/order", headers: { ...l2 }, body });
  }

  listOrders(l2: L2Headers): Promise<RelayAnswer> {
    return this.send({ method: "GET", path: "/orders", headers: { ...l2 } });
  }

  // One order by its hash: how a post that got no answer is looked up before anything is sent again.
  getOrder(hash: string, l2: L2Headers): Promise<RelayAnswer> {
    return this.send({ method: "GET", path: `/orders/${hash}`, headers: { ...l2 } });
  }
}

// XO_NONCE is left out, as the server-side flow does: 0 is its documented default and the signed struct carries 0.
function l1Of(l1: L1Headers): Partial<Record<XoHeaderName, string>> {
  return { XO_ADDRESS: l1.XO_ADDRESS, XO_SIGNATURE: l1.XO_SIGNATURE, XO_TIMESTAMP: l1.XO_TIMESTAMP };
}
