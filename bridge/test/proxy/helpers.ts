import type { ReadService } from "../../../app/headers.config.js";
import { createProxyModule, type ProxyModuleOptions, type UpstreamFetch, type UpstreamInit, type UpstreamResponse } from "../../proxy.js";
import { bearer, send, startTestDaemon, type Reply, type TestDaemon, type TestDaemonOptions } from "../server/helpers.js";

// Helpers for the read-proxy tests: a scripted upstream (so no test touches the network), a daemon with the
// proxy module registered, and a reader for the proxy route.

export interface UpstreamCall {
  readonly url: string;
  readonly init: UpstreamInit;
}

export type UpstreamScript = (call: UpstreamCall) => UpstreamResponse | Response | Promise<UpstreamResponse | Response> | undefined;

export interface ScriptedUpstream {
  readonly fetch: UpstreamFetch;
  readonly calls: UpstreamCall[];
}

// A fetch that answers from `script` and throws for anything it does not know, so a test can never pass
// through an unexpected request.
export function scriptedUpstream(script: UpstreamScript): ScriptedUpstream {
  const calls: UpstreamCall[] = [];
  const fetch: UpstreamFetch = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const reply = await script(call);
    if (reply === undefined) throw new Error(`scripted upstream: no route for ${init.method} ${url}`);
    return reply;
  };
  return { fetch, calls };
}

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json", ...init.headers } });
}

export function textResponse(text: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(text, { status: init.status ?? 200, headers: { "content-type": "text/html", ...init.headers } });
}

// Never answers (until the signal aborts, which a stub ignores on purpose in the "ignores the signal" test).
export function hangingFetch(): UpstreamFetch {
  return () => new Promise<UpstreamResponse>(() => undefined);
}

export interface ProxyDaemon extends TestDaemon {
  get(service: string, path: string, query?: string, headers?: Record<string, string>): Promise<Reply>;
  post(service: string, path: string, body: unknown, headers?: Record<string, string>): Promise<Reply>;
  token: string;
}

export interface ProxyDaemonOptions extends Omit<TestDaemonOptions, "modules"> {
  readonly proxy?: ProxyModuleOptions;
}

export async function startProxyDaemon(options: ProxyDaemonOptions = {}): Promise<ProxyDaemon> {
  const { proxy, ...rest } = options;
  const test = await startTestDaemon({ ...rest, modules: [{ name: "proxy", source: createProxyModule(proxy) }] });
  const token = await test.pair();
  const out: ProxyDaemon = Object.assign(test, {
    token,
    get: (service: string, path: string, query = "", headers: Record<string, string> = {}) =>
      send({ port: test.port, path: `/ui/read/${service}${path}${query === "" ? "" : `?${query}`}`, headers: { ...bearer(token), ...headers } }),
    post: (service: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
      send({
        port: test.port,
        method: "POST",
        path: `/ui/read/${service}${path}`,
        headers: { ...bearer(token), "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
  });
  return out;
}

export function errorCode(reply: Reply): string | undefined {
  return (reply.json() as { error?: { code?: string } }).error?.code;
}

export const SERVICES_FOR_TESTS: readonly ReadService[] = ["xo_data", "xo_orderbook", "polymarket_gamma", "rpc_base", "hyperliquid_info", "kalshi", "quotient"];
