import * as z from "zod/v4";

import { sanitizeUntrusted } from "../guardrails/untrusted.js";
import { parseRetryAfterMs } from "../../sdk/venues/transport.js";
import { XO_USER_AGENT } from "../xo/http.js";

// The plugin's one transport to the hosted markets API (API mode, docs/sdk-and-api-design.md section 8). It reaches the
// configured origin and nothing else: every URL is built from the configured base and checked again before sending (https,
// the configured host, the default port, no credentials, under the configured path). GET only, no cookie, no credential,
// no Origin, no redirect, one attempt, a deadline and a body cap. The API takes no key from the plugin; paid routes answer
// 402 and are paid by PayBox, never here (src/api/x402.ts).
//
// Answers are returned as parsed JSON for the caller to validate (src/api/schemas.ts). Everything that is not a 200 or a
// 402 becomes an ApiCallError whose message is our own fixed text; the API's own message, when it sends one, is kept apart,
// cleaned and capped (`apiMessage`), and only shown as the API's words.

export const API_ATTEMPT_TIMEOUT_MS = 8_000;
export const API_MAX_BODY_BYTES = 1024 * 1024;
const ERROR_BODY_CAP_BYTES = 16 * 1024;
const API_MESSAGE_MAX_CHARS = 300;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

// The API's fixed error codes (api/app.ts ErrorCode). Anything else is reported as "unrecognised".
export const API_ERROR_CODES = [
  "invalid_request",
  "not_found",
  "method_not_allowed",
  "payload_too_large",
  "uri_too_long",
  "rate_limited",
  "venue_not_served",
  "venue_unavailable",
  "market_not_found",
  "internal",
  "shutting_down",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiCallErrorKind =
  // The API answered with one of its error codes (`code` says which).
  | "api_error"
  // 429: `retryAfterS` is the API's Retry-After, or null when it named none.
  | "rate_limited"
  // Not a 2xx, not a 402, and not the API's error envelope.
  | "http_error"
  | "timeout"
  | "unreachable"
  // The body was not JSON, too large, or not UTF-8.
  | "invalid_response"
  // Our own refusal before sending: the URL is not on the configured API.
  | "blocked";

export class ApiCallError extends Error {
  readonly kind: ApiCallErrorKind;
  readonly status: number | null;
  readonly code: ApiErrorCode | "unrecognised" | null;
  readonly retryAfterS: number | null;
  // The API's own message, cleaned. Never part of `message`.
  readonly apiMessage: string | null;
  // The API's details.code (venue_not_served carries the serving rule's code), cleaned.
  readonly detailCode: string | null;

  constructor(kind: ApiCallErrorKind, message: string, extra: { status?: number; code?: ApiErrorCode | "unrecognised"; retryAfterS?: number | null; apiMessage?: string | null; detailCode?: string | null } = {}) {
    super(message);
    this.name = "ApiCallError";
    this.kind = kind;
    this.status = extra.status ?? null;
    this.code = extra.code ?? null;
    this.retryAfterS = extra.retryAfterS ?? null;
    this.apiMessage = extra.apiMessage ?? null;
    this.detailCode = extra.detailCode ?? null;
  }
}

export type ApiAnswer =
  | { readonly kind: "ok"; readonly body: unknown; readonly receivedAtMs: number }
  // 402: the challenge as sent, in the v2 header (base64 JSON) and the body (v1), unparsed. src/api/x402.ts reads them.
  | { readonly kind: "payment_required"; readonly header: string | null; readonly body: unknown; readonly url: string };

const errorEnvelope = z.object({
  error: z.object({
    code: z.string().max(64),
    message: z.string().max(4000),
    details: z.object({ code: z.string().max(64).optional() }).optional(),
  }),
});

// Our own one-line rendering of text the API wrote: cleaned like market text and capped.
export function cleanApiText(text: string, maxChars = API_MESSAGE_MAX_CHARS): string {
  return sanitizeUntrusted(text, { maxChars, source: "markets-api" }).text;
}

export interface ApiClientOptions {
  // The normalised base URL from src/api/config.ts.
  readonly baseUrl: string;
  readonly fetchImpl: FetchLike;
  readonly nowMs: () => number;
  readonly attemptTimeoutMs?: number;
  readonly maxBodyBytes?: number;
}

export class ApiClient {
  readonly baseUrl: string;
  readonly origin: string;
  readonly #prefix: string;
  readonly #host: string;
  readonly #fetch: FetchLike;
  readonly #nowMs: () => number;
  readonly #timeoutMs: number;
  readonly #maxBodyBytes: number;

  constructor(options: ApiClientOptions) {
    const base = new URL(options.baseUrl);
    if (base.protocol !== "https:" || base.port !== "" || base.username !== "" || base.password !== "" || base.search !== "" || base.hash !== "") {
      throw new RangeError("the API base URL must be https on the default port with no credentials, query or fragment");
    }
    this.baseUrl = options.baseUrl;
    this.origin = base.origin;
    this.#host = base.hostname;
    this.#prefix = base.pathname.replace(/\/+$/, "");
    this.#fetch = options.fetchImpl;
    this.#nowMs = options.nowMs;
    this.#timeoutMs = options.attemptTimeoutMs ?? API_ATTEMPT_TIMEOUT_MS;
    this.#maxBodyBytes = options.maxBodyBytes ?? API_MAX_BODY_BYTES;
  }

  // The full URL of an API route ("/v1/markets") with its query, in a fixed parameter order.
  urlFor(route: string, query: ReadonlyArray<readonly [string, string | undefined]> = []): string {
    if (!/^\/v1(?:\/[A-Za-z0-9._~%:-]+)+$/.test(route)) throw new ApiCallError("blocked", "the plugin refused to build that API route");
    const parts = query.filter((entry): entry is readonly [string, string] => entry[1] !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return `${this.origin}${this.#prefix}${route}${parts.length === 0 ? "" : `?${parts.join("&")}`}`;
  }

  // Refuses, before anything is sent, a URL that is not https to the configured host, under the configured path.
  checkUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ApiCallError("blocked", "the URL could not be parsed");
    }
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || url.hostname !== this.#host || url.hash !== "") {
      throw new ApiCallError("blocked", "only the configured markets API may be reached");
    }
    if (!url.pathname.startsWith(`${this.#prefix}/v1/`)) throw new ApiCallError("blocked", "only the configured markets API may be reached");
    return url;
  }

  async get(raw: string): Promise<ApiAnswer> {
    const url = this.checkUrl(raw);
    const signal = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url.toString(), {
        method: "GET",
        headers: { "user-agent": XO_USER_AGENT, accept: "application/json" },
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      });
    } catch {
      if (signal.aborted) throw new ApiCallError("timeout", "the markets API did not answer in time");
      throw new ApiCallError("unreachable", "the markets API could not be reached, or answered with a redirect, which is refused");
    }
    const status = response.status;
    if (status === 200) {
      const text = await this.#readText(response, this.#maxBodyBytes, signal);
      try {
        return { kind: "ok", body: JSON.parse(text) as unknown, receivedAtMs: this.#nowMs() };
      } catch {
        throw new ApiCallError("invalid_response", "the markets API sent a body that is not JSON", { status });
      }
    }
    let body: unknown = null;
    try {
      body = JSON.parse(await this.#readText(response, ERROR_BODY_CAP_BYTES, signal)) as unknown;
    } catch {
      // The body of a non-200 answer is only a hint; an unreadable one changes nothing.
      body = null;
    }
    if (status === 402) return { kind: "payment_required", header: response.headers.get("payment-required"), body, url: url.toString() };
    const envelope = errorEnvelope.safeParse(body);
    const apiMessage = envelope.success ? cleanApiText(envelope.data.error.message) : null;
    const rawCode = envelope.success ? envelope.data.error.code : null;
    const code: ApiErrorCode | "unrecognised" | undefined = rawCode === null ? undefined : (API_ERROR_CODES as readonly string[]).includes(rawCode) ? (rawCode as ApiErrorCode) : "unrecognised";
    const detail = envelope.success ? envelope.data.error.details?.code : undefined;
    const detailCode = detail === undefined || !/^[a-z_]{1,40}$/.test(detail) ? null : detail;
    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"), this.#nowMs());
      throw new ApiCallError("rate_limited", "the markets API is rate limiting this client (HTTP 429)", {
        status,
        ...(code === undefined ? {} : { code }),
        retryAfterS: retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 1000)),
        apiMessage,
      });
    }
    if (status >= 300 && status < 400) throw new ApiCallError("http_error", `the markets API answered with a redirect (HTTP ${status}), which is refused`, { status });
    if (code !== undefined) throw new ApiCallError("api_error", `the markets API refused the request (HTTP ${status})`, { status, code, apiMessage, detailCode });
    throw new ApiCallError("http_error", `the markets API answered HTTP ${status}`, { status });
  }

  // Stream-reads the body and stops the moment it passes the cap.
  async #readText(response: Response, cap: number, signal: AbortSignal): Promise<string> {
    const tooLarge = (): ApiCallError => new ApiCallError("invalid_response", `the markets API sent more than ${cap} bytes`, { status: response.status });
    const declared = response.headers.get("content-length");
    if (declared !== null && /^[0-9]{1,15}$/.test(declared) && Number(declared) > cap) {
      await response.body?.cancel().catch(() => undefined);
      throw tooLarge();
    }
    if (response.body === null) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          break;
        }
        total += value.byteLength;
        if (total > cap) throw tooLarge();
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ApiCallError) throw error;
      if (signal.aborted) throw new ApiCallError("timeout", "the markets API did not finish its answer in time", { status: response.status });
      throw new ApiCallError("unreachable", "the markets API's answer was cut off", { status: response.status });
    } finally {
      if (!finished) await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ApiCallError("invalid_response", "the markets API sent a body that is not UTF-8", { status: response.status });
    }
  }
}
