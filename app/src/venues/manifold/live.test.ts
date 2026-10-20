import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../core/ports";
import { MANIFOLD_API_BASE, createManifoldAdapter } from "./adapter";

// Opt-in drift suite: GET only, against the real venue. It does NOT run unless APP_LIVE=1, and it was
// written but not run when this file was authored. It checks that the live shapes still parse and that the
// CORS fact in docs/dapp-design.md section 4.2 (Manifold answers a foreign Origin with `*`) still holds.
// The Node fetch below adds the fixed research User-Agent; the adapter itself sets no header.
const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: init?.method ?? "GET",
    headers: { ...(init?.headers ?? {}), "user-agent": USER_AGENT },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: response.headers, json: () => response.json(), text: () => response.text() };
};

describe.skipIf(!LIVE)("Manifold live drift (APP_LIVE=1)", () => {
  const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

  it("answers a foreign Origin with access-control-allow-origin *", async () => {
    const response = await fetch(`${MANIFOLD_API_BASE}/search-markets?term=&limit=1&filter=open&contractType=BINARY`, {
      headers: { origin: "https://example.org", "user-agent": USER_AGENT },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("lists open binary markets whose rows all parse", async () => {
    const adapter = createManifoldAdapter(deps);
    const page = await adapter.listMarkets({ limit: 20 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(adapter.lastReadReport().dropped).toBe(0);
    for (const item of page.items) {
      expect(item.outcomes).toHaveLength(2);
      expect(item.title.untrusted).toBe(true);
    }
  });

  it("reads one market's detail and reports whether a rules field exists", async () => {
    const adapter = createManifoldAdapter(deps);
    const [first] = (await adapter.listMarkets({ limit: 1 })).items;
    expect(first).toBeDefined();
    const market = await adapter.getMarket(first!.ref);
    expect(market.ref.marketId).toBe(first!.ref.marketId);
    // Informational: an empty hash here means `textDescription` is not the field name (unverified).
    expect(typeof market.rules.sha256).toBe("string");
  });
});
