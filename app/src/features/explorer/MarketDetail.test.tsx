// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdapterError, Book, FeeSpec, Result } from "../../core/ports";
import { allText, click, cleanup, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { MarketDetail } from "./MarketDetail";
import { FakeError, NOW, book, fakeEntry, fakeServices, flush, market, mount, summary } from "./test-support";

afterEach(cleanup);

beforeAll(() => {
  const fromApp = createRequire(import.meta.url);
  const playwrightEntry = fromApp.resolve("@axe-core/playwright");
  const source = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library.
  new Function(source).call(window);
});

const detailOf = (m: ReturnType<typeof market>, extra: { notes?: string[]; settlement?: { winningOutcomeIndex: number | null; resolvedAt: string | null } } = {}) => ({
  market: m,
  notes: extra.notes ?? [],
  settlement: extra.settlement ?? null,
});

const show = (venue: "xo" | "polymarket" | "manifold" | "kalshi" | "limitless" | "hyperliquid", marketId = "m1") => <MarketDetail params={{ venue, marketId }} />;

const okBooks = (ids: readonly string[]): ReadonlyArray<Result<Book, AdapterError>> => ids.map((id) => ({ ok: true as const, value: book("polymarket", id, [["0.50", "10"], ["0.49", "5"]], [["0.54", "20"]]) }));

describe("the market page", () => {
  it("shows the title, rules, fingerprint, sources, fee, times and terms, each with its meaning", async () => {
    const m = market("polymarket", "m1", { title: "Will it rain", rules: "Resolves Yes on rain.", sources: ["https://example.test/a"] });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { prices: ["0.6", "0.4"] }));
    const { container } = await mount(show("polymarket"), services);
    expect(allText(must(container, "h2.explorer-title"))).toBe("Will it rain");
    expect(allText(must(container, ".ui-untrusted-block"))).toContain("Resolves Yes on rain.");
    expect(allText(container)).toContain("Rules fingerprint (sha256 of the text above, whitespace collapsed)");
    expect(must(container, "code.explorer-hash").textContent).toBe("a".repeat(64));
    expect(allText(must(container, ".explorer-sources"))).toContain("https://example.test/a");
    expect(allText(container)).toContain("How it resolves");
    expect(allText(container)).toContain("decided by the venue itself");
    expect(allText(container)).toContain("a voided market is refunded");
    expect(allText(container)).toContain("Closes (UTC)2026-12-01 00:00 UTC");
    expect(allText(container)).toContain("Price step0.01");
    expect(allText(container)).toContain("USDC on eip155:8453, 6 decimals, held by you");
    expect(allText(container)).toContain("unknown: no net-of-fee number is shown anywhere");
    expect(allText(container)).toContain("Linked groups: no links");
    expect(allText(container)).toContain("A gap between two venues is not an arbitrage");
    expect(allText(container)).toContain("open (metadata only, not a quote)");
  });

  it("keeps the display price and the order book apart and labelled", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { prices: ["0.6", "0.4"] }));
    const { container } = await mount(show("polymarket"), services);
    const prices = must(container, "#explorer-prices-heading").parentElement as Element;
    expect(allText(prices)).toContain("Display price per outcome");
    expect(allText(prices)).toContain("60.0c");
    expect(allText(prices)).toContain("display price, not executable");
    expect(allText(prices)).toContain("They are not an order book");
    const books = must(container, "#explorer-books-heading").parentElement as Element;
    expect(allText(books)).toContain("Best bid50.0c");
    expect(allText(books)).toContain("Best ask54.0c");
    expect(allText(books)).toContain("book spread (size and fees not applied)");
    expect(allText(books)).toContain("Depth within 5 centsbids 15.00 shares, asks 20.00 shares");
    expect(pm.bookCalls).toEqual([["m1-t0", "m1-t1"]]);
  });

  it("without a list visit, says the display price was not loaded instead of inventing one", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: okBooks });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(allText(container)).toContain("has not been loaded in this visit");
    expect(allText(container)).not.toContain("Display price per outcome");
  });

  it("opens a market by the reference the list gave (Polymarket needs its slug)", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { native: { slug: "will-it-rain" } }));
    await mount(show("polymarket"), services);
    expect(pm.detailCalls[0]?.native).toEqual({ slug: "will-it-rain" });
  });
});

describe("M0-8 and the spread labels on the page", () => {
  it("an XO book is indicative, never executable, however fresh", async () => {
    const xo = fakeEntry("xo", {
      detail: detailOf(market("xo", "m1")),
      feeNote: "ceiling, unreconciled",
      getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("xo", id, [["0.50", "10"]], [["0.54", "20"]]) })),
    });
    const { container } = await mount(show("xo"), fakeServices([xo], { mode: "cockpit" }));
    const books = allText(must(container, "#explorer-books-heading").parentElement as Element);
    expect(books).toContain("indicative spread, not executable");
    expect(books).toContain("XO's fee source is an unreconciled ceiling");
    expect(books).not.toContain("book spread");
    expect(allText(container)).toContain("This fee is a ceiling that has not been reconciled with a real fill");
  });

  it("a stale book and a derived book are indicative and say why", async () => {
    const pm = fakeEntry("polymarket", {
      detail: detailOf(market("polymarket", "m1")),
      getBooks: (ids) => [
        { ok: true as const, value: book("polymarket", ids[0] as string, [["0.50", "10"]], [["0.54", "20"]], { asOfMs: NOW - 10 * 60_000 }) },
        { ok: true as const, value: book("polymarket", ids[1] as string, [["0.46", "10"]], [["0.50", "20"]], { derived: "complement" }) },
      ],
    });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    const books = allText(must(container, "#explorer-books-heading").parentElement as Element);
    expect(books.match(/indicative spread, not executable/g)).toHaveLength(2);
    expect(books).toContain("stale or its time is unknown");
    expect(books).toContain("derived from the other side, not executable");
  });

  it("a crossed book has no spread", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("polymarket", id, [["0.60", "1"]], [["0.55", "1"]]) })) });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    const books = allText(must(container, "#explorer-books-heading").parentElement as Element);
    expect(books).toContain("no spread");
    expect(books).toContain("stale or broken");
  });
});

describe("books that cannot be shown", () => {
  it("XO in the standalone build: needs the Cockpit, nothing requested, never an empty book", async () => {
    const xo = fakeEntry("xo", { detail: detailOf(market("xo", "m1")), books: { state: "needs_cockpit", what: "XO order books" } });
    const { container } = await mount(show("xo"), fakeServices([xo]));
    expect(xo.bookCalls).toHaveLength(0);
    const books = must(container, "#explorer-books-heading").parentElement as Element;
    expect(allText(books)).toContain("XO Market: needs the Cockpit");
    expect(allText(books)).not.toMatch(/Best bid|No orders/);
  });

  it("Manifold has no order book and says so", async () => {
    const mani = fakeEntry("manifold", { detail: detailOf(market("manifold", "m1")), books: { state: "none", why: "Manifold is a play-money venue with no order book" } });
    const { container } = await mount(show("manifold"), fakeServices([mani]));
    expect(mani.bookCalls).toHaveLength(0);
    expect(allText(container)).toContain("No order book");
    expect(allText(container)).toContain("play-money venue");
  });

  it("tells an empty book from an unreachable venue, per outcome", async () => {
    const pm = fakeEntry("polymarket", {
      detail: detailOf(market("polymarket", "m1")),
      getBooks: (ids) => [
        { ok: false as const, error: "EMPTY_BOOK" as const },
        { ok: true as const, value: book("polymarket", ids[1] as string, [["0.4", "1"]], []) },
      ],
    });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    const blocks = [...container.querySelectorAll(".explorer-book")];
    expect(allText(blocks[0] as Element)).toContain("No orders at the moment");
    expect(allText(blocks[0] as Element)).toContain("not the same as an unreachable venue");
    expect(allText(blocks[1] as Element)).toContain("Best ask");
    expect(allText(blocks[1] as Element)).toContain("no asks");
    expect(allText(blocks[1] as Element)).toContain("no spread");
    expect(allText(blocks[1] as Element)).toContain("no orders on this side. No price is implied.");
  });

  it("a book request that fails as a whole is one typed error with a retry", async () => {
    let fail = true;
    const pm = fakeEntry("polymarket", {
      detail: detailOf(market("polymarket", "m1")),
      getBooks: (ids) => {
        if (fail) throw new FakeError("TIMEOUT");
        return okBooks(ids);
      },
    });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    const tile = must(container, '#explorer-books-heading ~ section[data-kind="error"]');
    expect(allText(tile)).toContain("The venue did not answer in time");
    fail = false;
    click(must(tile, "button"));
    await flush();
    expect(allText(container)).toContain("Best bid");
  });
});

describe("M0-3: rules, title and sources are inert", () => {
  const HOSTILE = '<img src=x onerror=alert(1)> javascript:alert(1) <a href="javascript:alert(2)">go</a>';

  it("renders every creator-written field as text in an untrusted slot", async () => {
    const m = market("polymarket", "m1", { title: HOSTILE, rules: `Rules ${HOSTILE}\n\nSecond paragraph`, sources: ["javascript:alert(3)", HOSTILE], resolver: "<script>alert(4)</script>" });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect([...container.querySelectorAll("*")].some((el) => el.getAttributeNames().some((name) => name.startsWith("on")))).toBe(false);
    // The only anchors are fixed app navigation.
    expect([...container.querySelectorAll("a")].every((a) => a.getAttribute("href") === "/markets")).toBe(true);
    const slots = [...container.querySelectorAll(".ui-untrusted")].map((slot) => slot.textContent ?? "");
    expect(slots.some((text) => text.includes("javascript:alert(3)"))).toBe(true);
    expect(slots.some((text) => text.includes("<script>alert(4)</script>"))).toBe(true);
    expect(allText(must(container, ".ui-untrusted-block"))).toContain("Second paragraph");
  });

  it("an unbranded rules string is withheld", async () => {
    const m = market("polymarket", "m1");
    const pm = fakeEntry("polymarket", { detail: detailOf({ ...m, rules: { ...m.rules, text: "plain" as never } }), getBooks: okBooks });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(allText(container)).toContain("[text withheld: not marked untrusted]");
    expect(allText(container)).not.toContain("plain");
  });

  it("shows a malformed fingerprint as no data, not as text", async () => {
    const m = market("polymarket", "m1", { sha256: "<b>not a hash</b>" });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(container.querySelector("code.explorer-hash")).toBeNull();
    expect(allText(container)).toContain("no rules text to fingerprint");
    expect(container.querySelector("b")).toBeNull();
  });

  it("adapter reasons and fee lines that are not plain tokens are withheld", async () => {
    const fee: FeeSpec = { modelId: "curve_pq", taker: { rate: "<img src=x>", bps: 400 }, payer: "buyer_adds_seller_withholds", paramsSource: { url: "u", field: "f", granularity: "market" }, verifiedAt: "2026-10-19", ttlSec: 60 };
    const m = { ...market("polymarket", "m1", { fee }), tradable: { ok: false, reasons: ["<img src=x onerror=alert(1)>", "closed_by_venue"] } };
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(container.querySelector("img")).toBeNull();
    expect(allText(container)).toContain("another reason (withheld); closed by venue");
    expect(allText(container)).toContain("taker 400 basis points");
    expect(allText(container)).not.toContain("<img");
  });
});

describe("what the page refuses to request", () => {
  it("a bad address names no venue or market and asks nothing", async () => {
    const pm = fakeEntry("polymarket");
    for (const params of [{ venue: "nowhere", marketId: "m1" }, { venue: "polymarket", marketId: "<img src=x>" }, { venue: "polymarket" }]) {
      const { container } = await mount(<MarketDetail params={params} />, fakeServices([pm]));
      expect(allText(container)).toContain("This is not a market address");
      cleanup();
    }
    expect(pm.detailCalls).toHaveLength(0);
  });

  it("a restricted venue is a tile, not a request", async () => {
    const { container } = await mount(show("kalshi"), fakeServices([fakeEntry("xo")]));
    expect(allText(container)).toContain("Kalshi: off, restricted terms");
  });

  it("a Cockpit-only venue in the standalone build is a tile, not a request", async () => {
    const { container } = await mount(show("limitless"), fakeServices([fakeEntry("xo")]));
    expect(allText(container)).toContain("Limitless: needs the Cockpit");
  });

  it("a reader that answers for a different market is refused", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "someone-else")) });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(must(container, '[data-kind="error"]').getAttribute("data-code")).toBe("SCHEMA_DRIFT");
    expect(container.querySelector("h2.explorer-title")).toBeNull();
  });

  it("a failing read is a typed error and never quotes the upstream message", async () => {
    const pm = fakeEntry("polymarket", { detailError: new FakeError("NOT_FOUND") });
    const { container } = await mount(show("polymarket"), fakeServices([pm]));
    expect(allText(container)).toContain("Polymarket: Not found");
    expect(allText(container)).not.toContain("boom");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("venue facts on the page", () => {
  it("XO shows the winner and the reader's notes", async () => {
    const xo = fakeEntry("xo", {
      detail: detailOf(market("xo", "m1"), { notes: ["2 resolution source(s) were not plain https links and were left out"], settlement: { winningOutcomeIndex: 1, resolvedAt: "2026-10-01T10:00:00Z" } }),
      books: { state: "needs_cockpit", what: "XO order books" },
    });
    const { container } = await mount(show("xo"), fakeServices([xo]));
    expect(allText(container)).toContain("Winning outcome, as the venue reports it: No (resolved 2026-10-01 10:00 UTC)");
    expect(allText(container)).toContain("2 resolution source(s) were not plain https links");
  });

  it("Hyperliquid shows the unproven tile and the venue restriction", async () => {
    const hl = fakeEntry("hyperliquid", { detail: detailOf(market("hyperliquid", "1")), shape: { status: "unverified", summary: "Docs samples only." }, clause: "Excluded Persons clause.", getBooks: okBooks });
    const { container } = await mount(show("hyperliquid", "1"), fakeServices([hl]));
    expect(allText(must(container, 'section[data-kind="unproven"]'))).toContain("unverified");
    expect(allText(container)).toContain("Excluded Persons clause.");
  });
});

describe("accessibility (structure)", () => {
  it("the full page has no axe violations", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1", { title: "Rain" })), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1"));
    const { container } = await mount(
      <main>
        <h1>Market</h1>
        {show("polymarket")}
      </main>,
      services,
    );
    const violations = await runAxe(container);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
