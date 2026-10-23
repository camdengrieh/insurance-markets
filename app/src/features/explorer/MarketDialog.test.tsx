// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdapterError, Book, FeeSpec, Result } from "../../core/ports";
import { allText, click, cleanup, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { impliedComplement } from "./display";
import { DETAILS_SUMMARY, IMPLIED_NO_TEXT, impliedFor } from "./MarketDialog";
import { MarketsView } from "./MarketsView";
import { PAIR_CODE } from "../terminal/test-support";
import { FakeError, NOW, book, fakeEntry, fakeServices, flush, market, mount, summary } from "./test-support";

// The market modal, opened over the Markets surface by a deep link (routes/market.tsx hands the parsed address to the
// surface, which renders itself unchanged, hero band included). It is portaled to <body>, so every lookup below
// starts at the dialog.

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

const show = (venue: "xo" | "polymarket" | "manifold" | "kalshi" | "limitless" | "hyperliquid", marketId = "m1") => <MarketsView market={{ venue, marketId }} />;
const dialog = (): HTMLElement => must<HTMLElement>(document.body, "[role='dialog']");

const okBooks = (ids: readonly string[]): ReadonlyArray<Result<Book, AdapterError>> => ids.map((id) => ({ ok: true as const, value: book("polymarket", id, [["0.50", "10"], ["0.49", "5"]], [["0.54", "20"]]) }));

describe("the market modal", () => {
  it("shows the title, rules, fingerprint, sources, fee, times and terms, each with its meaning", async () => {
    const m = market("polymarket", "m1", { title: "Will it rain", rules: "Resolves Yes on rain.", sources: ["https://example.test/a"] });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { prices: ["0.6", "0.4"] }));
    await mount(show("polymarket"), services);
    const root = dialog();
    expect(must(root, "h2").textContent).toBe("Market");
    expect(allText(must(root, ".explorer-title"))).toBe("Will it rain");
    expect(allText(must(root, ".ui-untrusted-block"))).toContain("Resolves Yes on rain.");
    expect(allText(root)).toContain("Rules fingerprint (sha256 of the text above, whitespace collapsed)");
    expect(must(root, "code.explorer-hash").textContent).toBe("a".repeat(64));
    expect(allText(must(root, ".explorer-sources"))).toContain("https://example.test/a");
    expect(allText(root)).toContain("How it resolves");
    expect(allText(root)).toContain("decided by the venue itself");
    expect(allText(root)).toContain("a voided market is refunded");
    expect(allText(root)).toContain("Closes (UTC)2026-12-01 00:00 UTC");
    expect(allText(root)).toContain("Price step0.01");
    expect(allText(root)).toContain("USDC on eip155:8453, 6 decimals, held by you");
    expect(allText(root)).toContain("unknown: no net-of-fee number is shown anywhere");
    expect(allText(root)).toContain("Linked groups: no links");
    expect(allText(root)).toContain("A gap between two venues is not an arbitrage");
    expect(allText(must(root, "[data-why-not-arbitrage='market']"))).toContain("Why this is not arbitrage");
    expect(allText(root)).toContain("open (metadata only, not a quote)");
    // The provenance line, and the ticket footer: a Polymarket order is signed by the visitor's own wallet in the
    // standalone build, so with no wallet connected the footer asks for one; there is no worksheet.
    expect(allText(must(root, ".ui-provenance"))).toContain("Polymarket");
    expect(root.querySelector("[data-ticket='worksheet']")).toBeNull();
    expect(must(root, "[data-testid='direct-ticket']").getAttribute("data-direct")).toBe("no-wallet");
    expect(allText(root)).toContain("Connect a wallet to trade");
    expect(allText(root)).not.toContain("Prepare order: needs the Cockpit");
    expect(allText(root)).not.toContain("Trade on Polymarket");
    expect(root.querySelectorAll("a[href^='http']")).toHaveLength(0);
  });

  it("keeps the display price and the order book apart and labelled", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { prices: ["0.6", "0.4"] }));
    await mount(show("polymarket"), services);
    const root = dialog();
    const prices = must(root, "#explorer-prices-heading").parentElement as Element;
    expect(allText(prices)).toContain("Display price per outcome");
    expect(allText(prices)).toContain("60.0c");
    expect(allText(prices)).toContain("display price, not executable");
    expect(allText(prices)).toContain("They are not an order book");
    const books = must(root, "#explorer-books-heading").parentElement as Element;
    expect(allText(books)).toContain("Best bid50.0c");
    expect(allText(books)).toContain("Best ask54.0c");
    expect(allText(books)).toContain("book spread (size and fees not applied)");
    expect(allText(books)).toContain("Depth within 5 centsbids 15.00 shares, asks 20.00 shares");
    expect(pm.bookCalls).toEqual([["m1-t0", "m1-t1"]]);
    // The levels are rows of price · bar in the side's ink · size, and the book carries its own provenance line.
    const levels = [...books.querySelectorAll(".explorer-level")];
    expect(levels.length).toBeGreaterThan(0);
    expect(allText(levels[0] as Element)).toBe("50.0c10.00 shares");
    expect(books.querySelector('[data-side="bids"] .ui-dither-bar')?.getAttribute("data-tone")).toBe("yes");
    expect(books.querySelector('[data-side="asks"] .ui-dither-bar')?.getAttribute("data-tone")).toBe("no");
    const provenance = [...books.querySelectorAll(".ui-provenance")].map((line) => allText(line));
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance[0]).toContain("order book");
    expect(provenance[0]).toContain("Polymarket");
  });

  it("without a list visit, says the display price was not loaded instead of inventing one", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: okBooks });
    await mount(show("polymarket"), fakeServices([pm]));
    expect(allText(dialog())).toContain("has not been loaded in this visit");
    expect(allText(dialog())).not.toContain("Display price per outcome");
  });

  it("opens a market by the reference the list gave (Polymarket needs its slug)", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { native: { slug: "will-it-rain" } }));
    await mount(show("polymarket"), services);
    expect(pm.detailCalls[0]?.native).toEqual({ slug: "will-it-rain" });
  });
});

describe("the layout of Market.dc.html", () => {
  it("three columns, the title in a well and never a heading, the details under one disclosure, the 44 px close button only", async () => {
    const m = market("polymarket", "m1", { title: "Will it rain" });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { prices: ["0.6", "0.4"] }));
    await mount(show("polymarket"), services);
    const root = dialog();
    // The fixed accessible heading stays; the market's own title is a well in the untrusted slot.
    expect(must(root, "h2").textContent).toBe("Market");
    const title = must(root, ".explorer-title");
    expect(title.closest("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(title.querySelector(".ui-untrusted")).not.toBeNull();
    // One meta row: venue, status, close time and provenance.
    const meta = must(root, ".mk-meta");
    expect(allText(meta)).toContain("Polymarket");
    expect(allText(meta)).toContain("closes 2026-12-01 00:00 UTC");
    expect(meta.querySelector(".ui-provenance")).not.toBeNull();
    const columns = [...root.querySelectorAll(".mk-grid > section")].map((section) => section.querySelector("h3")?.textContent);
    expect(columns).toEqual(["Order book", "Same question elsewhere", "Quotient"]);
    // The sides are named by fixed words, side by side.
    const sides = [...root.querySelectorAll(".mk-book-sides .explorer-book")];
    expect(sides.map((side) => side.querySelector("h4")?.textContent)).toEqual(["Yes", "No"]);
    // Display price, rules, fees, times and terms: in the page, under one disclosure.
    const details = [...root.querySelectorAll("details")].find((entry) => entry.querySelector("summary")?.textContent === DETAILS_SUMMARY) as HTMLElement;
    expect(details).toBeDefined();
    for (const id of ["explorer-prices-heading", "explorer-rules-heading", "explorer-fees-heading", "explorer-terms-heading"]) expect(details.querySelector(`#${id}`), id).not.toBeNull();
    // The ticket sits after the columns and before the details.
    const ticket = must(root, "#explorer-ticket-heading");
    expect(must(root, ".mk-grid").compareDocumentPosition(ticket) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ticket.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No second way out: the dialog's close button only.
    expect([...root.querySelectorAll("button")].some((button) => /Back to the Markets list/.test(button.textContent ?? ""))).toBe(false);
    expect(root.querySelector("button.ui-dialog-close[aria-label='Close']")).not.toBeNull();
  });
});

describe("both sides of the book", () => {
  it("implies the No side as 1 minus Yes only when the venue gives no No book, labelled implied and not a quote", async () => {
    const pm = fakeEntry("polymarket", {
      detail: detailOf(market("polymarket", "m1")),
      getBooks: (ids) => [{ ok: true as const, value: book("polymarket", ids[0] as string, [["0.50", "10"]], [["0.54", "20"]]) }, { ok: false as const, error: "EMPTY_BOOK" as const }],
    });
    await mount(show("polymarket"), fakeServices([pm]));
    const blocks = [...dialog().querySelectorAll(".explorer-book")];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.getAttribute("data-implied")).toBeNull();
    expect(blocks[1]?.getAttribute("data-implied")).toBe("true");
    const no = allText(blocks[1] as Element);
    expect(no).toContain("Implied bid46.0c");
    expect(no).toContain("Implied ask50.0c");
    expect(no).toContain("implied, not a quote");
    expect(no).toContain(IMPLIED_NO_TEXT);
  });

  it("never implies a side the venue serves, and never implies from a one-sided Yes book", () => {
    const m = market("polymarket", "m1");
    const yes = book("polymarket", "m1-t0", [["0.50", "10"]], [["0.54", "20"]]);
    const no = book("polymarket", "m1-t1", [["0.46", "1"]], []);
    expect(impliedFor(m, m.outcomes[1] as never, [{ ok: true, value: yes }, { ok: true, value: no }])).toBeNull();
    expect(impliedFor(m, m.outcomes[1] as never, [{ ok: true, value: book("polymarket", "m1-t0", [["0.50", "10"]], []) }, { ok: false, error: "EMPTY_BOOK" }])).toBeNull();
    expect(impliedFor(m, m.outcomes[0] as never, [{ ok: false, error: "EMPTY_BOOK" }, { ok: true, value: no }])).toBeNull();
    expect(impliedComplement(yes)).toEqual({ bid: "46.0c", ask: "50.0c" });
    expect(impliedComplement({ bids: [], asks: [{ price: "1.5", size: "1" }] })).toEqual({ bid: null, ask: null });
  });
});

describe("M0-8 and the spread labels in the modal", () => {
  it("an XO book is indicative, never executable, however fresh", async () => {
    const xo = fakeEntry("xo", {
      detail: detailOf(market("xo", "m1")),
      feeNote: "documented curve, larger of two rates",
      getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("xo", id, [["0.50", "10"]], [["0.54", "20"]]) })),
    });
    await mount(show("xo"), fakeServices([xo], { mode: "cockpit" }));
    const books = allText(must(dialog(), "#explorer-books-heading").parentElement as Element);
    expect(books).toContain("indicative spread, not executable");
    expect(books).toContain("XO's fee source is an unreconciled ceiling");
    expect(books).not.toContain("book spread");
    expect(allText(dialog())).toContain("This fee is a ceiling that has not been reconciled with a real fill");
  });

  it("a stale book and a derived book are indicative and say why", async () => {
    const pm = fakeEntry("polymarket", {
      detail: detailOf(market("polymarket", "m1")),
      getBooks: (ids) => [
        { ok: true as const, value: book("polymarket", ids[0] as string, [["0.50", "10"]], [["0.54", "20"]], { asOfMs: NOW - 10 * 60_000 }) },
        { ok: true as const, value: book("polymarket", ids[1] as string, [["0.46", "10"]], [["0.50", "20"]], { derived: "complement" }) },
      ],
    });
    await mount(show("polymarket"), fakeServices([pm]));
    const books = allText(must(dialog(), "#explorer-books-heading").parentElement as Element);
    expect(books.match(/indicative spread, not executable/g)).toHaveLength(2);
    expect(books).toContain("stale or its time is unknown");
    expect(books).toContain("derived from the other side, not executable");
  });

  it("a crossed book has no spread", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")), getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("polymarket", id, [["0.60", "1"]], [["0.55", "1"]]) })) });
    await mount(show("polymarket"), fakeServices([pm]));
    const books = allText(must(dialog(), "#explorer-books-heading").parentElement as Element);
    expect(books).toContain("no spread");
    expect(books).toContain("stale or broken");
  });
});

describe("books that cannot be shown", () => {
  it("XO in the standalone build: the book needs the Cockpit, nothing requested, never an empty book; the ticket is the wallet one", async () => {
    const xo = fakeEntry("xo", { detail: detailOf(market("xo", "m1")), books: { state: "needs_cockpit", what: "XO order books" } });
    await mount(show("xo"), fakeServices([xo]));
    expect(xo.bookCalls).toHaveLength(0);
    const books = must(dialog(), "#explorer-books-heading").parentElement as Element;
    expect(allText(books)).toContain("XO Market: needs the Cockpit");
    expect(allText(books)).not.toMatch(/Best bid|No orders/);
    // The ticket trades with the visitor's wallet through the markets API's relay, and asks for a wallet first.
    expect(allText(must(dialog(), "[data-ticket='xo'] [data-testid='xo-direct']"))).toMatch(/XO trading is not available in this build\.|Connect a wallet to trade on XO/);
  });

  it("Manifold has no order book and says so", async () => {
    const mani = fakeEntry("manifold", { detail: detailOf(market("manifold", "m1")), books: { state: "none", why: "Manifold is a play-money venue with no order book" } });
    await mount(show("manifold"), fakeServices([mani]));
    expect(mani.bookCalls).toHaveLength(0);
    expect(allText(dialog())).toContain("No order book");
    expect(allText(dialog())).toContain("play-money venue");
  });

  it("tells an empty book from an unreachable venue, per outcome", async () => {
    const pm = fakeEntry("polymarket", {
      detail: detailOf(market("polymarket", "m1")),
      getBooks: (ids) => [
        { ok: false as const, error: "EMPTY_BOOK" as const },
        { ok: true as const, value: book("polymarket", ids[1] as string, [["0.4", "1"]], []) },
      ],
    });
    await mount(show("polymarket"), fakeServices([pm]));
    const blocks = [...dialog().querySelectorAll(".explorer-book")];
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
    await mount(show("polymarket"), fakeServices([pm]));
    const tile = must(dialog(), '#explorer-books-heading ~ section[data-kind="error"]');
    expect(allText(tile)).toContain("The venue did not answer in time");
    fail = false;
    click(must(tile, "button"));
    await flush();
    expect(allText(dialog())).toContain("Best bid");
  });
});

describe("M0-3: rules, title and sources are inert", () => {
  const HOSTILE = '<img src=x onerror=alert(1)> javascript:alert(1) <a href="javascript:alert(2)">go</a>';

  it("renders every creator-written field as text in an untrusted slot", async () => {
    const m = market("polymarket", "m1", { title: HOSTILE, rules: `Rules ${HOSTILE}\n\nSecond paragraph`, sources: ["javascript:alert(3)", HOSTILE], resolver: "<script>alert(4)</script>" });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    await mount(show("polymarket"), fakeServices([pm]));
    const root = dialog();
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector('a[href^="javascript"]')).toBeNull();
    expect([...document.body.querySelectorAll("*")].some((el) => el.getAttributeNames().some((name) => name.startsWith("on")))).toBe(false);
    // The only anchors are fixed app navigation.
    expect([...document.body.querySelectorAll("a")].every((a) => a.getAttribute("href") === "/markets")).toBe(true);
    const slots = [...root.querySelectorAll(".ui-untrusted")].map((slot) => slot.textContent ?? "");
    expect(slots.some((text) => text.includes("javascript:alert(3)"))).toBe(true);
    expect(slots.some((text) => text.includes("<script>alert(4)</script>"))).toBe(true);
    expect(allText(must(root, ".ui-untrusted-block"))).toContain("Second paragraph");
    // The dialog's own heading is fixed app text, never the creator's.
    expect(must(root, "h2").textContent).toBe("Market");
  });

  it("an unbranded rules string is withheld", async () => {
    const m = market("polymarket", "m1");
    const pm = fakeEntry("polymarket", { detail: detailOf({ ...m, rules: { ...m.rules, text: "plain" as never } }), getBooks: okBooks });
    await mount(show("polymarket"), fakeServices([pm]));
    expect(allText(dialog())).toContain("[text withheld: not marked untrusted]");
    expect(allText(dialog())).not.toContain("plain");
  });

  it("shows a malformed fingerprint as no data, not as text", async () => {
    const m = market("polymarket", "m1", { sha256: "<b>not a hash</b>" });
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    await mount(show("polymarket"), fakeServices([pm]));
    expect(dialog().querySelector("code.explorer-hash")).toBeNull();
    expect(allText(dialog())).toContain("no rules text to fingerprint");
    expect(dialog().querySelector("b")).toBeNull();
  });

  it("adapter reasons and fee lines that are not plain tokens are withheld", async () => {
    const fee: FeeSpec = { venue: "polymarket", modelId: "curve_pq", taker: { rate: "<img src=x>", bps: "400" }, payer: "buyer_adds_seller_withholds", paramsSource: { url: "u", field: "f", granularity: "market" }, verifiedAt: "2026-10-19", ttlSec: 60 };
    const m = { ...market("polymarket", "m1", { fee }), tradable: { ok: false, reasons: ["<img src=x onerror=alert(1)>", "closed_by_venue"] } };
    const pm = fakeEntry("polymarket", { detail: detailOf(m), getBooks: okBooks });
    await mount(show("polymarket"), fakeServices([pm]));
    expect(dialog().querySelector("img")).toBeNull();
    expect(allText(dialog())).toContain("another reason (withheld); closed by venue");
    expect(allText(dialog())).toContain("taker 400 basis points");
    expect(allText(dialog())).not.toContain("<img");
  });
});

describe("what the modal refuses to request", () => {
  it("a bad address names no venue or market and asks nothing", async () => {
    const pm = fakeEntry("polymarket");
    const { container } = await mount(<MarketsView invalidAddress />, fakeServices([pm]));
    expect(allText(container)).toContain("This is not a market address");
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(pm.detailCalls).toHaveLength(0);
  });

  it("a restricted venue is a tile, not a request", async () => {
    await mount(show("kalshi"), fakeServices([fakeEntry("xo")]));
    expect(allText(dialog())).toContain("Kalshi: off, restricted terms");
  });

  it("a Cockpit-only venue in the standalone build is a tile, not a request", async () => {
    await mount(show("limitless"), fakeServices([fakeEntry("xo")]));
    expect(allText(dialog())).toContain("Limitless: needs the Cockpit");
  });

  it("a reader that answers for a different market is refused", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "someone-else")) });
    await mount(show("polymarket"), fakeServices([pm]));
    expect(must(dialog(), '[data-kind="error"]').getAttribute("data-code")).toBe("SCHEMA_DRIFT");
    expect(dialog().querySelector(".explorer-title")).toBeNull();
  });

  it("a failing read is a typed error and never quotes the upstream message", async () => {
    const pm = fakeEntry("polymarket", { detailError: new FakeError("NOT_FOUND") });
    await mount(show("polymarket"), fakeServices([pm]));
    expect(allText(dialog())).toContain("Polymarket: Not found");
    expect(allText(dialog())).not.toContain("boom");
    expect(dialog().querySelector("img")).toBeNull();
  });
});

describe("venue facts in the modal", () => {
  it("XO shows the winner and the reader's notes", async () => {
    const xo = fakeEntry("xo", {
      detail: detailOf(market("xo", "m1"), { notes: ["2 resolution source(s) were not plain https links and were left out"], settlement: { winningOutcomeIndex: 1, resolvedAt: "2026-10-01T10:00:00Z" } }),
      books: { state: "needs_cockpit", what: "XO order books" },
    });
    await mount(show("xo"), fakeServices([xo]));
    expect(allText(dialog())).toContain("Winning outcome, as the venue reports it: No (resolved 2026-10-01 10:00 UTC)");
    expect(allText(dialog())).toContain("2 resolution source(s) were not plain https links");
  });

  it("Hyperliquid shows the unproven tile and the venue restriction", async () => {
    const hl = fakeEntry("hyperliquid", { detail: detailOf(market("hyperliquid", "1")), shape: { status: "unverified", summary: "Docs samples only." }, clause: "Excluded Persons clause.", getBooks: okBooks });
    await mount(show("hyperliquid", "1"), fakeServices([hl]));
    expect(allText(must(dialog(), 'section[data-kind="unproven"]'))).toContain("unverified");
    expect(allText(dialog())).toContain("Excluded Persons clause.");
  });

  it("Quotient in the modal: off says so; on and not covered says via link only; on and covered offers one lookup from a press", async () => {
    const xo = fakeEntry("xo", { detail: detailOf(market("xo", "m1")), books: { state: "needs_cockpit", what: "XO order books" } });
    const off = await mount(show("xo"), fakeServices([xo]));
    expect(must(dialog(), "[data-kind='quotient']").getAttribute("data-code")).toBe("off");
    expect(allText(must(dialog(), "[data-why-not-arbitrage='quotient']"))).toContain("Why this is not arbitrage");
    expect(off.signals.fake.calls).toHaveLength(0);
    cleanup();
    const on = await mount(show("xo"), fakeServices([xo]), { signals: { mode: "standalone" } });
    await on.signals.session.enable();
    await flush();
    expect(must(dialog(), "[data-kind='quotient']").getAttribute("data-code")).toBe("not-covered");
    expect(allText(dialog())).toContain("via link");
    cleanup();
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1")) });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1", { native: { gammaId: "559651" } }));
    const covered = await mount(show("polymarket"), services);
    await covered.signals.session.enable();
    await flush();
    expect(allText(dialog())).toContain("polymarket:559651");
    expect(must<HTMLButtonElement>(dialog(), "[data-press-route='lookup']").textContent).toContain("shows the price only");
    expect(covered.signals.fake.calls).toHaveLength(0);
  });
});

describe("accessibility (structure)", () => {
  it("the open modal over the surface has no axe violations", async () => {
    const pm = fakeEntry("polymarket", { detail: detailOf(market("polymarket", "m1", { title: "Rain" })), getBooks: okBooks });
    const services = fakeServices([pm]);
    services.memory.put(summary("polymarket", "m1"));
    await mount(<main>{show("polymarket")}</main>, services);
    const violations = await runAxe(document.body, ["region"]);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });

  it("the Cockpit build with the XO order ticket mounted keeps the heading order and has no axe violations", async () => {
    const xo = fakeEntry("xo", {
      detail: detailOf(market("xo", "m1", { title: "Rain" })),
      feeNote: "documented curve, larger of two rates",
      getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("xo", id, [["0.50", "10"]], [["0.54", "20"]]) })),
    });
    const services = fakeServices([xo], { mode: "cockpit" });
    services.memory.put(summary("xo", "m1"));
    await mount(<main>{show("xo")}</main>, services, { pairCode: PAIR_CODE });
    await flush(10);
    const root = dialog();
    const ticket = must(root, "[data-ticket='xo']");
    // The desk is hosted under the "Order ticket" h3: its own sections are h4, never a second h2.
    expect(ticket.querySelectorAll("h2, h3")).toHaveLength(0);
    expect(ticket.querySelector("h4")).not.toBeNull();
    const violations = await runAxe(document.body, ["region"]);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
