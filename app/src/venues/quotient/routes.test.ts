import { isSafeUpstreamPath, isSafeUpstreamQuery, parseReadProxyTarget, readProxyPath } from "@bridge/contract";
import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS } from "../../../headers.config";
import { QUOTIENT_ORIGIN, QUOTIENT_READ_SERVICE } from "./constants";
import { FORBIDDEN_PATH_PATTERNS, ROUTES, ROUTE_IDS, RouteParamError, UPSTREAM_PATH_PATTERNS, buildRequest, encodeMarketKey } from "./routes";

describe("route table", () => {
  it("names the pinned origin that headers.config.ts lists for the quotient service", () => {
    const entry = BROWSER_DIRECT_ORIGINS.find((candidate) => candidate.service === QUOTIENT_READ_SERVICE);
    expect(entry?.origin).toBe(QUOTIENT_ORIGIN);
  });

  it("has a price for every route, and only the performance snapshot is free", () => {
    expect(ROUTES.performance.priceUsd).toBe("0");
    expect(ROUTES.signals).toMatchObject({ paid: true, priceUsd: "0.01" });
    expect(ROUTES.mispriced).toMatchObject({ paid: true, priceUsd: "0.02" });
    expect(ROUTES.lookup).toMatchObject({ paid: true, priceUsd: "0.005" });
    expect(ROUTE_IDS).toHaveLength(4);
  });
});

describe("request builders", () => {
  it("builds the free snapshot URL", () => {
    expect(buildRequest("performance", {}).url).toBe(`${QUOTIENT_ORIGIN}/api/public/performance`);
  });

  it("builds a signals query with sorted keys and nothing else", () => {
    const built = buildRequest("signals", { status: "active", minConviction: 2, excludeDrawdownRisk: true, minCapacityUsd: "100", windowHours: 24, venue: "polymarket" });
    expect(built.url).toBe(`${QUOTIENT_ORIGIN}/api/v1/signals?exclude_drawdown_risk=true&min_capacity_usd=100&min_conviction=2&status=active&venue=polymarket&window=24`);
  });

  it("builds a mispriced query", () => {
    expect(buildRequest("mispriced", { venue: "kalshi", minSpread: "0.08", maxForecastAgeHours: 24, sort: "quality" }).query).toBe("max_forecast_age=24&min_spread=0.08&sort=quality&venue=kalshi");
    expect(buildRequest("mispriced", {}).url).toBe(`${QUOTIENT_ORIGIN}/api/v1/markets/mispriced`);
  });

  it("builds a lookup with the # of a Hyperliquid key percent-encoded", () => {
    const built = buildRequest("lookup", { marketKeys: ["polymarket:4329882", "hl_outcomes:#12", "kalshi:KXFED-26DEC-T4.25"] });
    expect(built.query).toBe("market_keys=polymarket:4329882,hl_outcomes:%2312,kalshi:KXFED-26DEC-T4.25");
    expect(encodeMarketKey("hl_outcomes:#12")).toBe("hl_outcomes:%2312");
  });

  it("refuses a value outside its list or range with the parameter name, never the value", () => {
    const bad: Array<() => unknown> = [
      () => buildRequest("signals", { status: "everything" as never }),
      () => buildRequest("signals", { windowHours: 0 }),
      () => buildRequest("signals", { windowHours: 169 }),
      () => buildRequest("signals", { windowHours: 1.5 }),
      () => buildRequest("signals", { minConviction: 4 as never }),
      () => buildRequest("signals", { minCapacityUsd: "10; drop" }),
      () => buildRequest("signals", { venue: "limitless" as never }),
      () => buildRequest("signals", { excludeDrawdownRisk: "yes" as never }),
      () => buildRequest("mispriced", { venue: "polymarket_us" as never }),
      () => buildRequest("mispriced", { minSpread: "0.9" }),
      () => buildRequest("mispriced", { minSpread: "0.001" }),
      () => buildRequest("mispriced", { sort: "random" as never }),
      () => buildRequest("lookup", { marketKeys: [] }),
      () => buildRequest("lookup", { marketKeys: Array.from({ length: 11 }, (_, i) => `polymarket:${i + 1}`) }),
      () => buildRequest("lookup", { marketKeys: ["polymarket:1", "polymarket:1"] }),
      () => buildRequest("lookup", { marketKeys: ["Will it rain?"] }),
      () => buildRequest("lookup", { marketKeys: ["polymarket:1/../../portfolio"] }),
      () => buildRequest("lookup", { marketKeys: ["polymarket:1&wallet=0xabc"] }),
      () => buildRequest("lookup", { marketKeys: ["limitless:slug"] }),
    ];
    for (const attempt of bad) expect(attempt).toThrow(RouteParamError);
    try {
      buildRequest("signals", { status: "https://evil.example" as never });
    } catch (error) {
      expect((error as Error).message).not.toContain("evil");
    }
  });

  it("only ever produces URLs on the pinned origin that match an allowed path and are safe for the read proxy", () => {
    const urls = [
      buildRequest("performance", {}),
      buildRequest("signals", {}),
      buildRequest("signals", { status: "active", windowHours: 6 }),
      buildRequest("mispriced", { venue: "polymarket" }),
      buildRequest("lookup", { marketKeys: ["polymarket:1", "hl_outcomes:#3"] }),
    ];
    for (const built of urls) {
      expect(built.url.startsWith(`${QUOTIENT_ORIGIN}/`)).toBe(true);
      expect(UPSTREAM_PATH_PATTERNS.some((pattern) => pattern.test(built.path)), built.path).toBe(true);
      expect(FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(built.path)), built.path).toBe(false);
      expect(isSafeUpstreamPath(built.path)).toBe(true);
      expect(isSafeUpstreamQuery(built.query)).toBe(true);
      // The Cockpit maps the URL onto /ui/read/quotient/..., and the daemon's parser must accept it back.
      const proxy = readProxyPath(QUOTIENT_READ_SERVICE, built.path, built.query);
      expect(parseReadProxyTarget(proxy)).toEqual({ service: "quotient", path: built.path, query: built.query });
    }
  });

  it("cannot be asked for a route that costs more, takes a wallet, or is not a trade signal", () => {
    for (const path of [
      "/api/v1/portfolio",
      "/api/auth/forecast-requests",
      "/api/v1/x/search",
      "/api/v1/x/profile",
      "/api/v1/wallets/link",
      "/api/v1/signals/perps",
      "/api/public/forecast-availability",
      "/api/v1/feeds/abc/events",
      "/api/v1/markets/polymarket:1/signals",
      "/api/v1/markets/polymarket:1/forecast",
    ]) {
      expect(FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(path)), path).toBe(true);
      expect(UPSTREAM_PATH_PATTERNS.some((pattern) => pattern.test(path)), path).toBe(false);
    }
    expect(() => buildRequest("portfolio" as never, {} as never)).toThrow(RouteParamError);
  });
});
