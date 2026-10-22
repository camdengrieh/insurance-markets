import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { createTrueoAdapter } from "./adapter.js";
import { deploymentFor } from "./constants.js";

// Live drift suite: OPT-IN. It sends real read-only JSON-RPC (eth_call) to a public Base RPC and runs only with
// APP_LIVE=1, so a normal `pnpm test` stays offline. It never sends a transaction, a signature or a credential;
// the only methods the adapter can send are eth_call and eth_getLogs. Scripted requests carry the fixed research
// User-Agent and nothing else that identifies a person. APP_LIVE_BASE_RPC (optional) is the operator's own RPC
// URL, read from the environment only and never written anywhere.
//
// What it is for: the pinned contracts and ABI have never been read live by this build (the research session
// could not call eth_call). A failure here is a finding: a changed address, a different version string, a hook
// that moved, a new status. It is the only place a pinned value is compared with the chain.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";
const RPC_URL = process.env.APP_LIVE_BASE_RPC ?? deploymentFor(8453).defaultRpcUrl;

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: init?.method ?? "GET",
    headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    ...(init?.body === undefined ? {} : { body: init.body }),
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("trueo live drift (APP_LIVE=1)", () => {
  it("reads the Manager, passes the TYD checks, and lists markets whose pools match their keys", async () => {
    const adapter = createTrueoAdapter(deps, { rpcUrl: RPC_URL });
    const { page, skipped, total } = await adapter.listMarketsDetailed({ limit: 20, statuses: ["active", "paused", "closed", "determined", "disputed", "resolved", "voided", "unknown"] });
    expect(total).toBeGreaterThan(0);
    expect(page.items.length).toBeGreaterThan(0);
    // Skips are allowed (conditional children, V1 markets) but only for reasons the adapter knows.
    for (const skip of skipped) expect(["not_active", "payment_token_not_tyd", "unsupported_version", "hook_not_allowlisted"]).toContain(skip.reason);
    for (const item of page.items) {
      for (const outcome of item.outcomes) {
        if (outcome.displayPrice === null) continue;
        expect(Number(outcome.displayPrice)).toBeGreaterThanOrEqual(0);
        expect(Number(outcome.displayPrice)).toBeLessThanOrEqual(1);
      }
    }
  }, 120_000);

  it("reads one market in full: the fee stack, the rules hash and an executable ladder", async () => {
    const adapter = createTrueoAdapter(deps, { rpcUrl: RPC_URL });
    const page = await adapter.listMarkets({ limit: 20, statuses: ["active"] });
    const first = page.items[0];
    if (first === undefined) return;
    const market = await adapter.getMarket(first.ref);
    expect(market.rules.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(["amm_stack", "unknown"]).toContain(market.fee.modelId);
    const yesToken = first.outcomes[0]?.tokenId ?? "";
    const [book] = await adapter.getBooks([{ venue: "trueo", tokenId: yesToken, marketId: first.ref.marketId }], { deadlineMs: 60_000 });
    if (book?.ok) {
      const asks = book.value.asks.map((level) => Number(level.price));
      expect([...asks].sort((a, b) => a - b)).toEqual(asks);
    } else {
      expect(["EMPTY_BOOK", "VENUE_PAUSED"]).toContain(book?.error);
    }
  }, 180_000);

  it("answers the browser CORS preflight for a JSON POST from a foreign origin (M0-7)", async () => {
    // A preflight is an OPTIONS request with the Origin and Access-Control-Request-* headers; it carries no body.
    const preflight = await fetch(RPC_URL, {
      method: "OPTIONS",
      headers: { "user-agent": USER_AGENT, origin: "https://example.org", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeTruthy();
    expect(preflight.headers.get("access-control-allow-headers") ?? "").toMatch(/content-type|\*/i);
  }, 30_000);
});

describe("trueo live drift is opt-in", () => {
  it("stays skipped unless APP_LIVE=1", () => {
    expect(typeof LIVE).toBe("boolean");
    if (process.env.APP_LIVE !== "1") expect(LIVE).toBe(false);
  });
});
