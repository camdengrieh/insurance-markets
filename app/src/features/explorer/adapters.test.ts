import { describe, expect, it } from "vitest";

import { harness } from "../../venues/polymarket/fixtures/harness";
import { recorded } from "../../venues/polymarket/fixtures/load";
import { createExplorerAdapters } from "./adapters";

const GAMMA = "https://gamma-api.polymarket.com";

describe("the Polymarket explorer entry (A1)", () => {
  it("passes on that a text search was cut off, so the screen cannot show it as complete", async () => {
    // The recorded public-search answer says pagination.hasMore is true: more results exist than it returned.
    const h = harness((url) => (url.startsWith(`${GAMMA}/public-search?`) ? { status: 200, body: recorded.publicSearch() } : undefined));
    const entry = createExplorerAdapters(h.deps, "standalone").polymarket;
    if (entry === undefined) throw new Error("no polymarket entry");
    const outcome = await entry.list({ text: "election", limit: 3 });
    expect(outcome.page.items.length).toBeGreaterThan(0);
    expect(outcome.page.next).toBeNull();
    expect(outcome.truncated).toBe(true);
  });

  it("does not claim truncation for a plain list", async () => {
    const h = harness((url) => (url.startsWith(`${GAMMA}/markets/keyset`) ? { status: 200, body: { markets: recorded.marketsList(), next_cursor: null } } : undefined));
    const entry = createExplorerAdapters(h.deps, "standalone").polymarket;
    if (entry === undefined) throw new Error("no polymarket entry");
    const outcome = await entry.list({ limit: 50 });
    expect(outcome.truncated).toBe(false);
  });
});
