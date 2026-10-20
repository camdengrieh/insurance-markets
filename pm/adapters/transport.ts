// GET-only JSON transport for the adapters. It reuses the hardened client transport of the XO
// plugin (src/xo/http.ts): https only, exact-hostname allowlist, no redirects, no credentials,
// no cookies, bounded body, rate-spaced requests, one retry for 429/5xx/timeouts, a per-host
// request budget. The adapter fixes the host list; a caller can inject fetch, clock and sleep
// (tests do) but can never widen the list.
//
// Nothing here can POST, PUT or DELETE: XoHttp has no method other than GET.

import { XoHttp, XO_USER_AGENT, type HttpOptions } from "../../src/xo/http.js";
import { toAdapterFailure } from "./errors.js";

// Fixed identities (see the workflow privacy rule): the plugin runtime uses the plugin string,
// scripted research and the live drift suites use the research string. Never put anything
// personal in a User-Agent.
export const PLUGIN_USER_AGENT = XO_USER_AGENT;
export const RESEARCH_USER_AGENT = "insurance-markets-research/0.1";

export interface TransportOptions extends Omit<HttpOptions, "allowedHosts"> {
  // Ignored by design; present only so a caller that spreads a shared option object does not
  // break. The adapter's own list always wins.
  readonly allowedHosts?: readonly string[];
}

export interface JsonTransport {
  readonly hosts: readonly string[];
  getJson(url: URL): Promise<unknown>;
  requestCounts(): Readonly<Record<string, number>>;
}

export function createJsonTransport(hosts: readonly string[], options: TransportOptions = {}): JsonTransport {
  const { allowedHosts: _ignored, ...rest } = options;
  void _ignored;
  const http = new XoHttp({ userAgent: PLUGIN_USER_AGENT, ...rest, allowedHosts: hosts });
  return {
    hosts,
    async getJson(url: URL): Promise<unknown> {
      try {
        return await http.getJson(url);
      } catch (error) {
        throw toAdapterFailure(error);
      }
    },
    requestCounts: () => http.requestCounts(),
  };
}

// Builds https://host/base/path?query from parts, with repeated keys allowed (Kalshi batch books
// need `tickers=A&tickers=B`, not a comma list). Path segments are percent-encoded.
export function buildUrl(
  host: string,
  basePath: string,
  segments: readonly string[],
  query: ReadonlyArray<readonly [string, string]> = [],
): URL {
  for (const segment of segments) {
    // encodeURIComponent leaves dots alone, and URL parsing would then collapse "../" and walk
    // out of the intended path.
    if (segment === "" || segment === "." || segment === "..") throw new RangeError("path segment must not be empty or a dot segment");
  }
  const path = [basePath.replace(/\/+$/, ""), ...segments.map((s) => encodeURIComponent(s))].join("/");
  const url = new URL(`https://${host}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of query) url.searchParams.append(key, value);
  return url;
}
