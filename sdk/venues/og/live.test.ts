import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { DISCLOSURE_VERSION } from "../policy.js";
import { createOgAdapter } from "./adapter.js";

// Live drift suite: OPT-IN. It sends real GET requests and runs only with APP_LIVE=1 AND APP_LIVE_OG_ORIGIN set to the
// https origin of the exchange's public market-data host (the adapter does not name it: sdk/venues/origins.ts does not list
// it yet, so the operator supplies it here). GET only: no key, no signature, no private route, no WebSocket, no custom
// Origin. Requests are spaced by 700 ms and carry the fixed research User-Agent and nothing else that identifies a
// person. It was written and NOT run by the stream that built it.

const LIVE = process.env.APP_LIVE === "1";
const ORIGIN = process.env.APP_LIVE_OG_ORIGIN ?? "";
const USER_AGENT = "insurance-markets-research/0.1";
let lastAt = 0;

const liveFetch: FetchLike = async (input, init) => {
  const wait = lastAt + 700 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastAt = Date.now();
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};
const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };
const switches = { enabled: { og: true }, disclosureAccepted: { og: DISCLOSURE_VERSION } };

describe.skipIf(!LIVE || ORIGIN === "")("og live drift (APP_LIVE=1, APP_LIVE_OG_ORIGIN set)", () => {
  it("lists headline markets whose instruments match the schema", async () => {
    const adapter = createOgAdapter(deps, { switches, origin: ORIGIN, eventsPerPage: 3 });
    const page = await adapter.listMarkets({});
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) expect(item.ref.marketId).toMatch(/^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$/);
    expect(adapter.lastReadReport().truncatedEvents).toBeLessThanOrEqual(adapter.lastReadReport().events);
  }, 120_000);

  it("reads a native two-sided book for a listed instrument, or the venue's own not-found", async () => {
    const adapter = createOgAdapter(deps, { switches, origin: ORIGIN, eventsPerPage: 2 });
    const page = await adapter.listMarkets({});
    const token = page.items[0]?.outcomes[0]?.tokenId;
    expect(token).toBeDefined();
    if (token === undefined) return;
    const [result] = await adapter.getBooks([{ venue: "og", tokenId: token }], { deadlineMs: 30_000 });
    if (result?.ok === false) expect(["EMPTY_BOOK", "NOT_FOUND", "STALE"]).toContain(result.error);
  }, 120_000);
});
