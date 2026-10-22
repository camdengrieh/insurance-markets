import { describe, expect, it } from "vitest";

import { decide } from "../../../bridge/allowlist";
import { createLimitlessAdapter } from "@sdk/venues/limitless";
import { fakeFetch } from "@sdk/venues/limitless/fixtures/fake-fetch";
import detailRecorded from "@sdk/venues/limitless/fixtures/market_detail_recorded.json";
import listCaptured from "@sdk/venues/limitless/fixtures/markets_active_list_captured_2026-10-20.json";
import bookRecorded from "@sdk/venues/limitless/fixtures/orderbook_recorded.json";

import { resolveUpstream } from "./fetch";

// The Limitless reader (sdk/venues/limitless) as the Cockpit build reaches it: every URL it builds must map onto
// the daemon's read proxy (service "limitless", daemon-only) and pass the daemon allowlist. It lives in the app
// because resolveUpstream and the allowlist are the host's. The answers are the recorded fixtures.

// Fixed clock: 2026-10-19, the day the fixtures were recorded.
const NOW = 1_792_368_171_000;
const ORIGIN = "https://api.limitless.exchange";
const SLUG = detailRecorded.slug;

describe("Limitless reads through the Cockpit (M0-4, M1-3)", () => {
  it("builds only URLs that resolve to the daemon-only limitless service and pass the daemon allowlist", async () => {
    const fake = fakeFetch({
      [`GET ${ORIGIN}/markets/active`]: { json: { ...(listCaptured as Record<string, unknown>), data: [detailRecorded], totalMarketsCount: 1 } },
      [`GET ${ORIGIN}/markets/${SLUG}`]: { json: detailRecorded },
      [`GET ${ORIGIN}/markets/${SLUG}/orderbook`]: { json: bookRecorded },
    });
    const adapter = createLimitlessAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit" });
    await adapter.listMarkets({ limit: 5 });
    await adapter.getMarket({ venue: "limitless", marketId: SLUG, native: { slug: SLUG } });
    await adapter.getBooks(
      [
        { venue: "limitless", tokenId: detailRecorded.tokens.yes, marketId: SLUG },
        { venue: "limitless", tokenId: detailRecorded.tokens.no, marketId: SLUG },
      ],
      { deadlineMs: 5_000 },
    );
    await adapter.health();
    expect(fake.calls.length).toBeGreaterThan(3);
    for (const call of fake.calls) {
      const target = resolveUpstream(call.url);
      expect(target.service).toBe("limitless");
      expect(target.transport).toBe("daemon_only");
      expect(decide({ service: target.service, method: "GET", path: target.path, query: target.query }).ok, call.url).toBe(true);
    }
  });
});
