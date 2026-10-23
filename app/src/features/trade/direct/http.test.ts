import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS } from "../../../../headers.config";
import { createVenueHttp, isVenueHttpError, type BrowserFetch } from "./http";

// The direct path's one network port: https venue origins on its list only, no cookies, no referrer, no redirects, no
// cache, a timeout and a size cap. No request leaves this test (the fetch is a fake).

const CLOB = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === "polymarket_clob")?.origin ?? "";
const GAMMA = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === "polymarket_gamma")?.origin ?? "";

function recorder(answer: (init: RequestInit) => Promise<Pick<Response, "status" | "text" | "headers">> = async () => ({ status: 200, text: async () => "ok", headers: new Headers() })) {
  const calls: Array<{ input: string; init: RequestInit }> = [];
  const fetch: BrowserFetch = (input, init) => {
    calls.push({ input, init });
    return answer(init);
  };
  return { calls, fetch };
}

describe("the venue port", () => {
  it("sends the venue's headers and body with no cookies, no referrer, no redirect and no cache", async () => {
    const { calls, fetch } = recorder();
    const http = createVenueHttp({ fetch, origins: [CLOB] });
    expect(await http({ method: "POST", url: `${CLOB}/order`, headers: { POLY_ADDRESS: "0x1" }, body: "{}" })).toEqual({ status: 200, text: "ok" });
    expect(calls[0]?.input).toBe(`${CLOB}/order`);
    expect(calls[0]?.init).toMatchObject({ method: "POST", headers: { POLY_ADDRESS: "0x1" }, body: "{}", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store", mode: "cors" });
  });

  it("reads back the one marker header a request names, and no other header", async () => {
    const { fetch } = recorder(async () => ({ status: 201, text: async () => "{}", headers: new Headers({ "x-limitless-relay": "upstream", "set-cookie": "a=b" }) }));
    const http = createVenueHttp({ fetch, origins: [CLOB] });
    expect(await http({ method: "POST", url: `${CLOB}/x`, body: "{}", marker: "x-limitless-relay" })).toEqual({ status: 201, text: "{}", marker: "upstream" });
    expect(await http({ method: "POST", url: `${CLOB}/x`, body: "{}" })).toEqual({ status: 201, text: "{}" });
  });

  it("refuses any other origin, plain http, a port or credentials in the URL before a request", async () => {
    const { calls, fetch } = recorder();
    const http = createVenueHttp({ fetch, origins: [CLOB] });
    for (const url of [`${GAMMA}/markets`, CLOB.replace("https:", "http:") + "/order", `${CLOB}:8443/order`, CLOB.replace("https://", "https://user:pw@") + "/order", "not a url"]) {
      await expect(http({ method: "GET", url })).rejects.toSatisfy((error: unknown) => isVenueHttpError(error) && error.code === "not_allowed");
    }
    expect(calls).toEqual([]);
  });

  it("names a timeout, an oversized answer and an unreachable venue apart", async () => {
    const slow = createVenueHttp({ fetch: (_input, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))), origins: [CLOB], timeoutMs: 5 });
    await expect(slow({ method: "GET", url: `${CLOB}/time` })).rejects.toSatisfy((error: unknown) => isVenueHttpError(error) && error.code === "timeout");
    const big = createVenueHttp({ fetch: async () => ({ status: 200, text: async () => "x".repeat(20), headers: new Headers() }), origins: [CLOB], maxBytes: 10 });
    await expect(big({ method: "GET", url: `${CLOB}/time` })).rejects.toSatisfy((error: unknown) => isVenueHttpError(error) && error.code === "too_large");
    const down = createVenueHttp({ fetch: async () => Promise.reject(new TypeError("Failed to fetch")), origins: [CLOB] });
    await expect(down({ method: "GET", url: `${CLOB}/time` })).rejects.toSatisfy((error: unknown) => isVenueHttpError(error) && error.code === "unreachable");
  });
});
