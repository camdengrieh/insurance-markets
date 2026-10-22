import { describe, expect, it } from "vitest";

import { decide } from "../../../bridge/allowlist";
import { createKalshiAdapter, tokenIdOf } from "@sdk/venues/kalshi";
import { fakeFetch, type FakeRoute } from "@sdk/venues/limitless/fixtures/fake-fetch";
import { DISCLOSURE_VERSION, type VenueSwitches } from "@sdk/venues/policy";

import { resolveUpstream } from "./fetch";

// The Kalshi reader (sdk/venues/kalshi) as the Cockpit build reaches it: every URL it builds must map onto the
// daemon's read proxy (service "kalshi", daemon-only) and pass the daemon allowlist. It lives in the app because
// resolveUpstream and the allowlist are the host's. No Kalshi payload is used: the venue answers an empty object.

const NOW = Date.parse("2026-10-19T12:00:00Z");
const ORIGIN = "https://external-api.kalshi.com";
const API = `${ORIGIN}/trade-api/v2`;
const TICKER = "KXTEST-1";
const ON: VenueSwitches = { enabled: { kalshi: true }, disclosureAccepted: { kalshi: DISCLOSURE_VERSION } };
const EMPTY: FakeRoute = { json: {} };

async function settle(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // A wrong-shape answer is expected; only the requests matter here.
  }
}

describe("Kalshi reads through the Cockpit (M0-4, M1-3, R10)", () => {
  it("builds only URLs that resolve to the daemon-only kalshi service and pass the daemon allowlist", async () => {
    const fake = fakeFetch({
      [`GET ${API}/markets?`]: EMPTY,
      [`GET ${API}/markets/${TICKER}`]: EMPTY,
      [`GET ${API}/markets/${TICKER}/orderbook`]: EMPTY,
      [`GET ${API}/exchange/status`]: EMPTY,
    });
    const adapter = createKalshiAdapter({ fetch: fake.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => ON });
    await settle(adapter.listMarkets({ cursor: "AbC" }));
    await settle(adapter.getMarket({ venue: "kalshi", marketId: TICKER, native: { ticker: TICKER } }));
    await settle(adapter.getBooks([{ venue: "kalshi", tokenId: tokenIdOf(TICKER, "yes") }, { venue: "kalshi", tokenId: tokenIdOf(TICKER, "no") }], { deadlineMs: 5_000 }));
    await settle(adapter.health());
    expect(fake.calls.length).toBeGreaterThanOrEqual(4);
    for (const call of fake.calls) {
      const target = resolveUpstream(call.url);
      expect(target.service).toBe("kalshi");
      expect(target.transport).toBe("daemon_only");
      expect(decide({ service: target.service, method: "GET", path: target.path, query: target.query }).ok, call.url).toBe(true);
    }
  });
});
