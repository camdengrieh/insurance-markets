// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { AdapterError, Book, Result, VenueId } from "../../core/ports";
import { allText, cleanup, must } from "../../ui/testing/dom";
import { MarketsView } from "./MarketsView";
import { NO_PATH_REASON, TICKET_VENUES, hasTicket } from "./Ticket";
import { PAIR_CODE } from "../terminal/test-support";
import { book, fakeEntry, fakeServices, flush, market, mount, summary } from "./test-support";

// The market modal's footer per venue and build: a ticket for XO, Polymarket and Limitless (the caution tile in the
// standalone build, the desk in the Cockpit build), and a worksheet with one honest sentence for every other venue.

afterEach(cleanup);

const detailOf = (m: ReturnType<typeof market>) => ({ market: m, notes: [], settlement: null });
const okBooks = (venue: VenueId) => (ids: readonly string[]): ReadonlyArray<Result<Book, AdapterError>> => ids.map((id) => ({ ok: true as const, value: book(venue, id, [["0.50", "10"]], [["0.54", "20"]]) }));
const show = (venue: VenueId, marketId = "m1") => <MarketsView market={{ venue, marketId }} />;
const dialog = (): HTMLElement => must<HTMLElement>(document.body, "[role='dialog']");

async function open(venue: VenueId, mode: "standalone" | "cockpit") {
  const entry = fakeEntry(venue, { detail: detailOf(market(venue, "m1", { title: "Will it rain" })), getBooks: okBooks(venue) });
  const services = fakeServices([entry], { mode });
  services.memory.put(summary(venue, "m1", { prices: ["0.6", "0.4"] }));
  await mount(<main>{show(venue)}</main>, services, mode === "cockpit" ? { pairCode: PAIR_CODE } : "/");
  await flush(10);
  return dialog();
}

describe("which venues have a ticket", () => {
  it("is XO, Polymarket and Limitless, and every other venue has one fixed sentence why not", () => {
    expect([...TICKET_VENUES]).toEqual(["xo", "polymarket", "limitless"]);
    for (const venue of TICKET_VENUES) expect(hasTicket(venue)).toBe(true);
    for (const [venue, reason] of Object.entries(NO_PATH_REASON)) {
      expect(hasTicket(venue as VenueId)).toBe(false);
      expect(reason.length).toBeGreaterThan(20);
      expect(reason).toMatch(/\.$/);
      expect(reason).not.toMatch(/https?:/);
    }
  });
});

describe("the standalone build", () => {
  // Limitless is a daemon-only venue: its markets cannot even be read standalone, so the modal shows the venue tile
  // before any ticket (that case is the Cockpit one below). Polymarket reads standalone and shows the caution tile.
  for (const venue of ["polymarket"] as const) {
    it(`shows the needs-the-Cockpit caution for a ${venue} market, no worksheet and no "Trade on" words`, async () => {
      const root = await open(venue, "standalone");
      expect(allText(must(root, "#explorer-ticket-heading"))).toBe("Order ticket");
      expect(allText(root)).toContain("Prepare order: needs the Cockpit");
      expect(root.querySelector("[data-ticket='worksheet']")).toBeNull();
      expect(allText(root)).not.toMatch(/Trade on (Polymarket|Limitless)/);
      expect(root.querySelectorAll("a[href^='http']")).toHaveLength(0);
    });
  }

  it("shows the worksheet with the honest sentence for a venue with no path, and names the venue's site only in words", async () => {
    const root = await open("manifold", "standalone");
    expect(allText(must(root, "#explorer-ticket-heading"))).toBe("Worksheet");
    const sheet = must(root, "[data-ticket='worksheet']");
    expect(sheet.getAttribute("data-venue")).toBe("manifold");
    expect(allText(sheet)).toContain(NO_PATH_REASON.manifold);
    expect(allText(sheet)).toContain("To trade on Manifold, open the venue's own site");
    expect(root.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("the Cockpit build", () => {
  for (const venue of ["polymarket", "limitless"] as const) {
    it(`mounts the venue ticket for a ${venue} market: the desk's maker panel and the venue's unproven caution, nothing green`, async () => {
      const root = await open(venue, "cockpit");
      const ticket = must(root, `[data-ticket='${venue}']`);
      expect(ticket.querySelectorAll("h2, h3")).toHaveLength(0);
      const text = allText(ticket);
      expect(text).toContain("This page prepares. It never signs and never sends.");
      expect(root.querySelector("[data-ticket='worksheet']")).toBeNull();
      expect(text).not.toMatch(/Trade on/);
      expect(ticket.querySelectorAll(".ui-badge[data-tone='ok']")).toHaveLength(0);
    });
  }

  it("still mounts the XO desk for an XO market", async () => {
    const root = await open("xo", "cockpit");
    expect(must(root, "[data-ticket='xo']")).toBeTruthy();
  });
});
