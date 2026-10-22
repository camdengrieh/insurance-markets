import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createXoAdapter, type XoAdapter } from "./index.js";
import { manualClock, scriptedFetch, type ScriptedRoute } from "./testkit.js";

// The category each XO list row carries, offline against the recorded active list (./fixtures): the verdict
// comes from categoryPath through the fixed table, and the venue's own path words ride along only as untrusted text.

const FIXTURES = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as unknown;
const NOW = Date.parse("2026-10-19T12:00:00.000Z");

async function listed() {
  const routes: ScriptedRoute[] = [{ host: "api-mainnet.xo.market", path: "/api/markets", reply: { body: structuredClone(fixture("live-data-list-active.json")) } }];
  const { fetch } = scriptedFetch(routes);
  const adapter: XoAdapter = createXoAdapter({ fetch, nowMs: manualClock(NOW).nowMs }, { variant: "standalone" });
  return (await adapter.listMarkets({})).items;
}

describe("xo list rows carry a category", () => {
  it("maps the recorded roots SPORTS, FINANCE, POLITICS and CRYPTO through the fixed table, all native", async () => {
    const items = await listed();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.map((item) => item.category?.category)).toEqual(["sports", "economics", "politics", "sports", "crypto"]);
    expect(items.every((item) => item.category?.confidence === "native")).toBe(true);
    expect(items[0]?.category?.matched).toEqual(["common:sports"]);
  });

  it("keeps the venue's own path only as untrusted text, root first, and never in the verdict", async () => {
    const items = await listed();
    const first = items[0];
    expect(first?.categoryNative).toEqual({ untrusted: true, value: "SPORTS > MMA > UFC" });
    expect(JSON.stringify(first?.category)).not.toContain("UFC");
    expect(items[1]?.categoryNative).toEqual({ untrusted: true, value: "FINANCE" });
  });
});
