import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decide } from "@bridge/allowlist";
import { BROWSER_DIRECT_ORIGINS } from "../../../headers.config";
import { resolveUpstream } from "../../core/fetch";
import { DISCLOSURE_VERSION, type VenueSwitches } from "../../core/venue-policy";
import { createGeminiAdapter } from "../gemini/adapter";
import { GEMINI_API_BASE } from "../gemini/constants";
import { createNovigAdapter } from "../novig/adapter";
import { NOVIG_API_BASE } from "../novig/constants";
import { depsOf, type FakeCall } from "../novig/fixtures/fake-fetch";
import { createOgAdapter, ogOriginFrom } from "../og/adapter";
import { OG_PUBLIC_PATH } from "../og/constants";
import { createDefiLlamaClient } from "./client";
import { DEFILLAMA_ORIGIN, DEFILLAMA_VOLUME_PATH, DEFILLAMA_VOLUME_QUERY } from "./constants";

// The Cockpit build maps every absolute upstream URL onto the daemon's read proxy (core/fetch.ts resolveUpstream),
// and the daemon allows only the routes in bridge/allowlist.ts. This test runs each module's real requests through
// BOTH, so a route an adapter asks for that the daemon would refuse (or a host the page could not map) fails here and
// not in a user's Cockpit.

type Json = Record<string, unknown>;
const NOW = Date.parse("2026-10-19T12:00:00Z");
const readJson = (url: URL): Json => JSON.parse(readFileSync(url, "utf8")) as Json;

function allowedByTheDaemon(calls: readonly FakeCall[]): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    const target = resolveUpstream(call.url);
    const [path, query = ""] = [target.path, target.query];
    const verdict = decide({ service: target.service, method: call.method, path, query });
    expect(verdict, call.url).toMatchObject({ ok: true });
    if (verdict.ok) {
      expect(verdict.allowed.method).toBe("GET");
      expect(verdict.allowed.url).toBe(call.url);
    }
  }
}

describe("every request reaches the daemon's allowlist unchanged", () => {
  // The restricted venues commit no response body, so these runs get empty or garbage answers: the adapters still
  // build and send the same requests, which is all this test looks at (it never reads an answer).
  it("Novig: list, detail, events and book", async () => {
    const marketId = "market-under-test";
    const { deps, calls } = depsOf(
      {
        [`GET ${NOVIG_API_BASE}/catalog/markets?`]: { json: { items: [], next: "" } },
        [`GET ${NOVIG_API_BASE}/catalog/events?`]: { json: { items: [] } },
        [`GET ${NOVIG_API_BASE}/catalog/markets/${marketId}`]: { json: {} },
        [`GET ${NOVIG_API_BASE}/types/event-statuses`]: { json: [] },
      },
      { now: NOW },
    );
    const switches: VenueSwitches = { enabled: { novig: true }, disclosureAccepted: { novig: DISCLOSURE_VERSION } };
    const adapter = createNovigAdapter(deps, { switches, transport: "T1" });
    await adapter.listMarkets({ limit: 50, cursor: "0:cursor-under-test" }).catch(() => undefined);
    await adapter.getMarketDetail({ venue: "novig", marketId, native: {} }).catch(() => undefined);
    await adapter.getBooks([{ venue: "novig", tokenId: "outcome-under-test", marketId }], { deadlineMs: 5000 });
    await adapter.health();
    allowedByTheDaemon(calls);
    expect(new Set(calls.map((call) => resolveUpstream(call.url).service))).toEqual(new Set(["novig"]));
  });

  it("Gemini: list (search, category, offset) and one event", async () => {
    const { deps, calls } = depsOf(
      {
        [`GET ${GEMINI_API_BASE}/events/event-under-test`]: { json: {} },
        [`GET ${GEMINI_API_BASE}/events`]: { json: { data: [], pagination: { limit: 10, offset: 0, total: 0 } } },
      },
      { now: NOW },
    );
    const switches: VenueSwitches = { enabled: { gemini: true }, disclosureAccepted: { gemini: DISCLOSURE_VERSION } };
    const adapter = createGeminiAdapter(deps, { switches, category: "Pro Football", transport: "T1" });
    await adapter.listMarkets({ text: "dallas & green bay", cursor: "0:10" });
    await adapter.listMarkets({ statuses: ["resolved"] });
    await adapter.getMarketDetail({ venue: "gemini", marketId: "event-under-test", native: {} }).catch(() => undefined);
    await adapter.health();
    allowedByTheDaemon(calls);
  });

  it("DefiLlama: the volume overview", async () => {
    const captured = readJson(new URL("./fixtures/overview_dexs_captured_2026-10-20.json", import.meta.url));
    const { deps, calls } = depsOf({ [`GET ${DEFILLAMA_ORIGIN}${DEFILLAMA_VOLUME_PATH}?${DEFILLAMA_VOLUME_QUERY}`]: { json: captured } }, { now: NOW });
    await createDefiLlamaClient(deps, { transport: "T1" }).predictionVolumes();
    allowedByTheDaemon(calls);
  });

  // OG: its host is not in headers.config.ts yet, so there is no service the page could map it onto and no route the
  // daemon would allow. The gap is stated here, and the full check runs by itself the day an entry for "og" exists.
  // (the ReadService type has no "og" yet, so the comparison goes through string)
  const ogEntry = BROWSER_DIRECT_ORIGINS.find((entry) => (entry.service as string) === "og");
  it.skipIf(ogEntry === undefined)("OG: events and book (runs once headers.config.ts lists service 'og')", async () => {
    const origin = ogOriginFrom(BROWSER_DIRECT_ORIGINS);
    expect(origin).not.toBeNull();
    const route = `${origin}${OG_PUBLIC_PATH}`;
    const { deps, calls } = depsOf(
      {
        [`GET ${route}/get-events`]: { json: { code: 0, result: { data: [] } } },
        [`GET ${route}/get-book`]: { json: {} },
      },
      { now: 1_792_379_400_000 },
    );
    const switches: VenueSwitches = { enabled: { og: true }, disclosureAccepted: { og: DISCLOSURE_VERSION } };
    const adapter = createOgAdapter(deps, { switches, origin, transport: "T1" });
    await adapter.listMarkets({});
    await adapter.getBooks([{ venue: "og", tokenId: "instrument-under-test" }], { deadlineMs: 5000 });
    allowedByTheDaemon(calls);
  });
  it.todo("OG: add service 'og' and its origin to app/headers.config.ts, its routes to bridge/allowlist.ts and service 'og' to core/venue-policy.ts");
});
