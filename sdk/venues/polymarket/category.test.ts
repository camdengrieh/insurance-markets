import { describe, expect, it } from "vitest";

import { captured, recorded } from "./fixtures/load.js";
import { categoryOf, normalizeMarket, normalizeSummary, type NormalizeContext } from "./normalize.js";
import { gammaMarketSchema } from "./schemas.js";

// The category each Polymarket row carries: Gamma publishes no category, so the event's series slugs and tickers,
// the event ticker and slug, then the market slug are matched token by token; the question is the last resort.

const NOW = Date.parse("2026-10-20T12:00:00Z");
const ctx: NormalizeContext = { nowMs: NOW, transport: "T0", source: "test" };

describe("polymarket rows carry a category", () => {
  it("the two captured keyset markets: one is politics from its event slug, one names nothing the table knows", () => {
    const markets = captured.keysetMarkets().map((row) => gammaMarketSchema.parse(row));
    expect(markets).toHaveLength(2);
    const summaries = markets.map((raw) => normalizeSummary(raw, ctx));
    const [first, second] = summaries;
    if (first?.ok !== true || second?.ok !== true) throw new Error("expected two summaries");
    expect(first.value.category).toEqual({ category: "other", confidence: "none", matched: [] });
    // Its series slug is kept as the venue's own words, untrusted, and nowhere else.
    expect(first.value.categoryNative?.untrusted).toBe(true);
    expect(second.value.category).toEqual({ category: "politics", confidence: "native", matched: ["keyword:democratic"] });
    expect(second.value.categoryNative).toBeUndefined();
  });

  it("the recorded Senate-control market is politics on the summary and the market alike", () => {
    const raw = gammaMarketSchema.parse(recorded.senateMarket());
    const summary = normalizeSummary(raw, ctx);
    const market = normalizeMarket(raw, ctx);
    if (!summary.ok || !market.ok) throw new Error("expected a market");
    expect(summary.value.category?.category).toBe("politics");
    expect(summary.value.category?.confidence).toBe("native");
    expect(market.value.category).toEqual(summary.value.category);
  });

  it("reads an odd series shape as no words and falls back to the question", () => {
    const raw = gammaMarketSchema.parse({ ...recorded.senateMarket(), slug: "plain-slug", question: "Will the Fed cut rates?", events: [{ slug: "plain-event", ticker: 7, series: "not a list" }] });
    expect(categoryOf(raw, raw.events?.[0])).toEqual({ category: "economics", confidence: "keyword", matched: ["keyword:fed"] });
    const quiet = gammaMarketSchema.parse({ ...recorded.senateMarket(), slug: "plain-slug", question: "A question naming nothing", events: [{ slug: "plain-event", series: [] }] });
    expect(categoryOf(quiet, quiet.events?.[0])).toEqual({ category: "other", confidence: "none", matched: [] });
  });
});
