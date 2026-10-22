import { describe, expect, it } from "vitest";

import { PINNED_PAYMENT, QUOTIENT_ORIGIN } from "./constants";
import { judgeChallenge } from "./payment";
import { buildRequest } from "./routes";

// Live drift suite: OPT-IN. It sends real GET requests to the Quotient gateway and runs only with APP_LIVE=1, so a
// normal `pnpm test` stays offline. It was written and NOT run by the stream that wrote it.
//
// What it sends: GET only, one request at a time, the fixed research User-Agent, no key, no wallet, and for the
// CORS reads an Origin of the reserved example.org. An unpaid GET to a paid route is answered 402 and is not
// billed (research 12 section 4); this suite NEVER attaches a payment or a key, so it cannot spend anything. It
// does not call forecast-availability (about 30 s) or any route the client does not build.
//
// What it checks: that the live 402 challenge still names the pinned tuple (a failure here is exactly the signal
// M3-3 exists for, or Quotient moved), that the free snapshot is a JSON object, and that the gateway still
// answers browsers (access-control-allow-origin and the exposed PAYMENT-REQUIRED header). It settles nothing
// about the paid response shapes: no paid response is ever fetched.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";

async function get(url: string, withOrigin: boolean): Promise<Response> {
  return fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(withOrigin ? { origin: "https://example.org" } : {}) },
  });
}

describe.skipIf(!LIVE)("quotient live drift (APP_LIVE=1)", () => {
  it("answers the free snapshot with a JSON object", async () => {
    const built = buildRequest("performance", {});
    const response = await get(built.url, false);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
  }, 60_000);

  for (const [route, params] of [
    ["mispriced", { venue: "polymarket" }],
    ["signals", {}],
    ["lookup", { marketKeys: ["polymarket:4329882"] }],
  ] as const) {
    it(`still asks ${route} for exactly the pinned payment tuple when unpaid`, async () => {
      const built = buildRequest(route, params as never);
      const response = await get(built.url, true);
      // An unpaid GET to a paid route is a 402. Anything else is drift worth reading, not paying for.
      expect(response.status).toBe(402);
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = undefined;
      }
      const verdict = judgeChallenge(route, built.path, body, response.headers.get("payment-required"));
      expect(verdict.state, JSON.stringify(verdict)).toBe("payment_required");
      if (verdict.state === "payment_required") {
        expect(verdict.network).toBe(PINNED_PAYMENT.network);
        // research 12 section 3: signals 0.01, mispriced 0.02, lookup 0.005
        expect(verdict.priceChanged, `price now ${verdict.amountUsd}`).toBe(false);
      }
      // browsers can read it
      expect(response.headers.get("access-control-allow-origin")).toBeTruthy();
      expect((response.headers.get("access-control-expose-headers") ?? "").toLowerCase()).toContain("payment-required");
      expect(built.url.startsWith(QUOTIENT_ORIGIN)).toBe(true);
    }, 60_000);
  }
});
