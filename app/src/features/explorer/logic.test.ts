import { describe, expect, it } from "vitest";

import { AdapterException } from "../../core/errors";
import { FetchError } from "../../core/fetch";
import { withDisclosureAccepted, withVenueEnabled } from "../../core/settings";
import { DEFAULT_SWITCHES } from "../../core/venue-policy";
import { EXPLORER_VENUES, UNREPORTED_VENUES, venueStatusOf } from "./catalog";
import { feeView, safeReasons, tickLines, MODEL_TEXT } from "./describe";
import { classifyError, FeedError } from "./feed";
import { isSafeMarketId, marketHref, parseMarketParams } from "./ids";
import { summary } from "./test-support";
import { filterRows, sortRows } from "./MarketsView";
import { toRow } from "./MarketTable";
import { fakeEntry } from "./test-support";

describe("classifyError", () => {
  it("reads the code of every reader's error class and nothing else", () => {
    expect(classifyError(new AdapterException("RATE_LIMITED", "<img src=x onerror=alert(1)>", 5000))).toEqual({ code: "RATE_LIMITED", retryAfterMs: 5000 });
    expect(classifyError({ code: "SCHEMA_DRIFT", name: "AdapterFailure" }).code).toBe("SCHEMA_DRIFT");
    expect(classifyError({ code: "NOT_FOUND", retryAfterMs: Number.NaN })).toEqual({ code: "NOT_FOUND", retryAfterMs: null });
  });

  it("maps the fetch port's refusals and recognises needs_cockpit", () => {
    expect(classifyError(new FetchError("needs_cockpit", "x")).code).toBe("NEEDS_COCKPIT");
    expect(classifyError(new FetchError("timeout", "x")).code).toBe("TIMEOUT");
    expect(classifyError(new FetchError("paused", "x")).code).toBe("VENUE_PAUSED");
    expect(classifyError(new FetchError("throttled", "x")).code).toBe("RATE_LIMITED");
    expect(classifyError(new FetchError("not_json", "x")).code).toBe("SCHEMA_DRIFT");
  });

  it("calls anything else UNKNOWN: a code outside the closed set is not trusted", () => {
    for (const bad of [new Error("x"), "RATE_LIMITED", null, undefined, 7, { code: "ECONNRESET" }, { code: "__proto__" }]) expect(classifyError(bad).code).toBe("UNKNOWN");
  });

  it("a FeedError never carries the original message", () => {
    const error = new FeedError(classifyError(new AdapterException("TIMEOUT", "secret upstream text")));
    expect(error.message).toBe("list failed: TIMEOUT");
  });
});

describe("market addresses", () => {
  it("builds a link only for ids in the closed alphabet", () => {
    expect(marketHref("xo", "0xabc123")).toBe("/market/xo/0xabc123");
    expect(marketHref("trueo", "8453:0xAbC")).toBe("/market/trueo/8453%3A0xAbC");
    for (const bad of ["", "a b", "a/b", "javascript:alert(1)//", "<x>", "a".repeat(201), "é"]) {
      if (bad === "javascript:alert(1)//") expect(isSafeMarketId(bad)).toBe(false);
      expect(marketHref("xo", bad)).toBeNull();
    }
  });

  it("parses route params once and refuses hostile ones", () => {
    expect(parseMarketParams({ venue: "trueo", marketId: "8453%3A0xAbC" })).toEqual({ venue: "trueo", marketId: "8453:0xAbC" });
    expect(parseMarketParams({ venue: "xo", marketId: "0xabc" })).toEqual({ venue: "xo", marketId: "0xabc" });
    expect(parseMarketParams({ venue: "nowhere", marketId: "0xabc" })).toBeNull();
    expect(parseMarketParams({ venue: "__proto__", marketId: "0xabc" })).toBeNull();
    expect(parseMarketParams({ venue: "xo", marketId: "%3Cimg%20src%3Dx%3E" })).toBeNull();
    expect(parseMarketParams({ venue: "xo", marketId: "%E0%A4%A" })).toBeNull();
    expect(parseMarketParams({ venue: "xo", marketId: "a".repeat(700) })).toBeNull();
    expect(parseMarketParams({ venue: "xo" })).toBeNull();
    // Decoding happens once: %2525 is "%25", which is not in the alphabet.
    expect(parseMarketParams({ venue: "xo", marketId: "%2525" })).toBeNull();
  });
});

describe("venueStatusOf (M0-2)", () => {
  const status = (id: Parameters<typeof venueStatusOf>[0], build: "standalone" | "cockpit", has = true, switches = DEFAULT_SWITCHES) => venueStatusOf(id, switches, build, has).kind;

  it("Kalshi is off for restricted terms in both builds, with its clause", () => {
    expect(status("kalshi", "standalone", false)).toBe("restricted_off");
    expect(status("kalshi", "cockpit", false)).toBe("restricted_off");
    const kalshi = venueStatusOf("kalshi", DEFAULT_SWITCHES, "standalone", false);
    expect(kalshi.kind === "restricted_off" && kalshi.clause).toMatch(/Developer Agreement/);
  });

  it("a restricted venue stays off until it is switched on AND the clause accepted", () => {
    const on = withVenueEnabled(DEFAULT_SWITCHES, "gemini", true);
    expect(status("gemini", "cockpit", false, on)).toBe("restricted_off");
    expect(status("gemini", "cockpit", false, withDisclosureAccepted(on, "gemini"))).toBe("no_reader");
  });

  it("Limitless needs the Cockpit in the standalone build and has no reader in the Cockpit build", () => {
    expect(status("limitless", "standalone", false)).toBe("needs_cockpit");
    expect(status("limitless", "cockpit", false)).toBe("no_reader");
  });

  it("a read-capable venue is active; a venue switched off is not", () => {
    for (const id of ["xo", "polymarket", "trueo", "hyperliquid", "pascal", "manifold"] as const) expect(status(id, "standalone")).toBe("active");
    expect(status("polymarket", "standalone", true, withVenueEnabled(DEFAULT_SWITCHES, "polymarket", false))).toBe("switched_off");
  });

  it("every venue not listed is named once as not covered", () => {
    expect([...EXPLORER_VENUES, ...UNREPORTED_VENUES].length).toBe(19);
    expect(new Set([...EXPLORER_VENUES, ...UNREPORTED_VENUES]).size).toBe(19);
  });
});

describe("describe", () => {
  it("an unknown fee model is said to fail closed and shows no parameters", () => {
    const view = feeView({ modelId: "unknown", taker: { bps: 400 }, payer: "in_pool", paramsSource: { url: "x", field: "y", granularity: "market" }, verifiedAt: "2026-10-19", ttlSec: 0 });
    expect(view.known).toBe(false);
    expect(view.lines).toEqual([]);
    expect(view.model).toBe(MODEL_TEXT.unknown);
  });

  it("shows only well-formed fee parameters", () => {
    const view = feeView({ modelId: "ad_valorem_bps", taker: { bps: 800, rate: "<b>x</b>", min: "0.01" }, payer: "buyer_adds_seller_withholds", paramsSource: { url: "x", field: "y", granularity: "market" }, verifiedAt: "2026-10-19T00:00:00Z", ttlSec: 60 });
    expect(view.lines).toEqual(["taker 800 basis points", "taker minimum 0.01"]);
    expect(view.verifiedAt).toBe("2026-10-19");
  });

  it("withholds a reason that is not a short token", () => {
    expect(safeReasons(["response_shapes_unverified", "<img src=x onerror=alert(1)>", "ok"])).toEqual(["response shapes unverified", "another reason (withheld)", "ok"]);
  });

  it("prints only valid ticks", () => {
    expect(tickLines("0.001")).toEqual(["0.001"]);
    expect(tickLines("<b>")).toEqual([]);
    expect(tickLines([{ from: "0", to: "0.1", tick: "0.001" }, { from: "x", to: "1", tick: "0.01" }])).toEqual(["0.001 from 0 to 0.1"]);
  });
});

describe("sorting and filtering rows", () => {
  const xo = fakeEntry("xo");
  const pm = fakeEntry("polymarket");
  const rows = [
    toRow(summary("polymarket", "p1", { closesAtUtc: "2027-01-01T00:00:00Z", title: "Zebra" }), pm),
    toRow(summary("xo", "x1", { closesAtUtc: null, title: "Alpha" }), xo),
    toRow(summary("xo", "x2", { closesAtUtc: "2026-11-01T00:00:00Z", title: "alphabet soup" }), xo),
    toRow(summary("polymarket", "p2", { closesAtUtc: "garbage", title: "Mid" }), pm),
  ];

  it("closing soonest puts unknown and unparseable times last, ties by venue order then list order", () => {
    expect(sortRows(rows, "closing").map((row) => row.key)).toEqual(["xo:x2", "polymarket:p1", "xo:x1", "polymarket:p2"]);
  });

  it("venue order follows the screen's venue order and keeps each venue's own order", () => {
    expect(sortRows(rows, "venue").map((row) => row.key)).toEqual(["xo:x1", "xo:x2", "polymarket:p1", "polymarket:p2"]);
  });

  it("the live filter matches the sanitised title, case-insensitively", () => {
    expect(filterRows(rows, "ALPHA").map((row) => row.key)).toEqual(["xo:x1", "xo:x2"]);
    expect(filterRows(rows, "  ").length).toBe(4);
    expect(filterRows(rows, "nothing like it")).toEqual([]);
  });
});
