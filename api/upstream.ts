import type { FetchLike, FetchResponseLike } from "../sdk/model.js";
import { FetchError } from "../sdk/venues/transport.js";

// The API's one outbound fetch (docs/sdk-and-api-design.md section 6, "No disguise"). Every venue read and every RPC call
// goes through it:
//   - it says who it is: one fixed User-Agent naming this service, nothing personal, no rotation;
//   - it sends no Origin, Referer, cookie or credential, follows no redirect and uses no proxy;
//   - a body over the cap is refused, and a request is abandoned at its deadline.
// A venue's block or throttle is handled above it, by the shared rule (sdk/venues/state.ts createStateGuardedFetch):
// nothing here retries.

export const API_USER_AGENT = "insurance-markets-api/0.1";
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 10_000;
export const DEFAULT_UPSTREAM_MAX_BYTES = 4 * 1024 * 1024;

export interface HonestFetchOptions {
  // The platform fetch (globalThis.fetch in main.ts); tests pass a fake.
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new FetchError("too_large", "the response is larger than the cap");
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FetchError("too_large", "the response is larger than the cap");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function createHonestFetch(options: HonestFetchOptions): FetchLike {
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_UPSTREAM_MAX_BYTES;
  return async (input, init) => {
    const url = new URL(input);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"))) {
      throw new FetchError("unsafe_url", "only https upstreams are read");
    }
    if (url.username !== "" || url.password !== "") throw new FetchError("unsafe_url", "an upstream URL may not carry credentials");
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = { "user-agent": API_USER_AGENT, accept: "application/json" };
    // A reader may name a content type for its POST body (JSON-RPC, Hyperliquid's /info); nothing else is passed on.
    const contentType = init?.headers?.["content-type"];
    if (method === "POST" && typeof contentType === "string") headers["content-type"] = contentType;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      let response: Response;
      try {
        response = await options.fetchImpl(url.toString(), {
          method,
          headers,
          ...(method === "POST" && init?.body !== undefined ? { body: init.body } : {}),
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw new FetchError(init?.signal?.aborted === true ? "aborted" : "timeout", "the upstream did not answer in time");
        void error;
        throw new FetchError("network", "the upstream could not be reached");
      }
      if (response.status >= 300 && response.status < 400) throw new FetchError("redirect", "the upstream answered with a redirect; it is not followed");
      const text = await readCapped(response, maxBytes);
      const out: FetchResponseLike = {
        ok: response.ok,
        status: response.status,
        headers: { get: (name: string) => response.headers.get(name) },
        json: async () => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            throw new FetchError("not_json", "the response body is not JSON");
          }
        },
        text: async () => text,
      };
      return out;
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", onAbort);
    }
  };
}
