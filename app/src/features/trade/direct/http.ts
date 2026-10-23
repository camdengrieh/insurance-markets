// The one way the direct path talks to a venue: the browser's fetch, to a closed list of https origins (each one also
// in the standalone build's connect-src, so the CSP and this list agree), with no cookies, no referrer, no redirects,
// no cache, a timeout and a size cap. Unlike the page's read port (core/fetch.ts) it sends the venue's own request
// headers, because a venue's write routes are authenticated by them. It never retries: a write sent twice is two
// writes, so the caller decides what an unanswered request means.

export interface VenueRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  // The exact bytes the venue receives (and the venue's request signature covers).
  readonly body?: string;
}

export interface VenueResponse {
  readonly status: number;
  readonly text: string;
}

export type VenueHttp = (request: VenueRequest) => Promise<VenueResponse>;

export type VenueHttpErrorCode = "not_allowed" | "unreachable" | "timeout" | "too_large";

export class VenueHttpError extends Error {
  readonly code: VenueHttpErrorCode;

  constructor(code: VenueHttpErrorCode, message: string) {
    super(message);
    this.name = "VenueHttpError";
    this.code = code;
  }
}

export function isVenueHttpError(value: unknown): value is VenueHttpError {
  return value instanceof VenueHttpError;
}

// The slice of the browser's fetch the port uses.
export type BrowserFetch = (input: string, init: RequestInit) => Promise<Pick<Response, "status" | "text" | "headers">>;

export interface VenueHttpOptions {
  readonly fetch: BrowserFetch;
  // Exact origins (scheme and host, no path), no wildcard.
  readonly origins: readonly string[];
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

export const VENUE_TIMEOUT_MS = 15_000;
export const VENUE_MAX_BYTES = 512 * 1024;

export function createVenueHttp(options: VenueHttpOptions): VenueHttp {
  const allowed = new Set(options.origins);
  const timeoutMs = options.timeoutMs ?? VENUE_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? VENUE_MAX_BYTES;
  return async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      throw new VenueHttpError("not_allowed", "not an absolute URL");
    }
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || url.hash !== "" || !allowed.has(url.origin)) {
      throw new VenueHttpError("not_allowed", "the host is not one of this executor's venue origins");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await options.fetch(url.toString(), {
        method: request.method,
        headers: { ...(request.headers ?? {}) },
        ...(request.body === undefined ? {} : { body: request.body }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        cache: "no-store",
        mode: "cors",
        signal: controller.signal,
      });
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > maxBytes) throw new VenueHttpError("too_large", "the venue's answer is larger than this page reads");
      const text = await response.text();
      if (text.length > maxBytes) throw new VenueHttpError("too_large", "the venue's answer is larger than this page reads");
      return { status: response.status, text };
    } catch (error) {
      if (error instanceof VenueHttpError) throw error;
      if (controller.signal.aborted) throw new VenueHttpError("timeout", "the venue did not answer in time");
      throw new VenueHttpError("unreachable", "the venue could not be reached from this page");
    } finally {
      clearTimeout(timer);
    }
  };
}
