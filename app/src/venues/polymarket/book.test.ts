import { describe, expect, it } from "vitest";

import { bestAsk, bestBid, complementBook, parseBook, venueTimestampMs } from "./book";
import { clobBookSchema } from "./schemas";
import { recorded, SENATE_NO, SENATE_YES, type Json } from "./fixtures/load";

const NOW = 1_792_344_900_000;

function wire(overrides: Partial<Record<string, unknown>> = {}) {
  const base = { ...recorded.senateBook(), ...overrides };
  return clobBookSchema.parse(base);
}

describe("CLOB book parsing", () => {
  it("sorts the recorded book explicitly: bids descending, asks ascending, best first", () => {
    const parsed = parseBook(wire(), SENATE_YES, NOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { book } = parsed;
    // The recorded file lists the best level LAST on both sides.
    expect(book.bids.map((level) => level.price)).toEqual(["0.37", "0.36", "0.35", "0.34", "0.33"]);
    expect(book.asks.map((level) => level.price)).toEqual(["0.38", "0.39", "0.4", "0.41", "0.42"]);
    expect(bestBid(book)).toEqual({ price: "0.37", size: "7523.41" });
    expect(bestAsk(book)).toEqual({ price: "0.38", size: "850398.71" });
    expect(book.derived).toBe("native");
    expect(book.token).toEqual({ venue: "polymarket", tokenId: SENATE_YES });
    expect(book.asOfMs).toBe(NOW);
    expect(book.venueTsMs).toBe(1792344896057);
    expect(book.hash).toBe("9b4fcef2dd59843d26b7ca31ab5490748aee4019");
  });

  it("keeps sizes as exact decimal strings, never numbers", () => {
    const parsed = parseBook(wire(), SENATE_YES, NOW);
    if (!parsed.ok) throw new Error("expected a book");
    for (const level of [...parsed.book.bids, ...parsed.book.asks]) {
      expect(typeof level.price).toBe("string");
      expect(typeof level.size).toBe("string");
    }
    expect(parsed.book.bids.find((level) => level.price === "0.35")?.size).toBe("173636.48");
  });

  it("rejects an answer for another token", () => {
    expect(parseBook(wire(), SENATE_NO, NOW)).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
  });

  it("rejects a crossed book, a price outside (0,1), a negative size and duplicate levels as drift", () => {
    const crossed = wire({ bids: [{ price: "0.50", size: "1" }], asks: [{ price: "0.50", size: "1" }] });
    expect(parseBook(crossed, SENATE_YES, NOW)).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    const crossed2 = wire({ bids: [{ price: "0.60", size: "1" }], asks: [{ price: "0.40", size: "1" }] });
    expect(parseBook(crossed2, SENATE_YES, NOW)).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    for (const price of ["1", "0", "1.5", "-0.1", "abc", "1e-1"]) {
      expect(parseBook(wire({ bids: [{ price, size: "1" }], asks: [] }), SENATE_YES, NOW)).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    }
    expect(parseBook(wire({ bids: [{ price: "0.3", size: "-1" }], asks: [] }), SENATE_YES, NOW)).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
    expect(parseBook(wire({ bids: [{ price: "0.3", size: "1" }, { price: "0.30", size: "2" }], asks: [] }), SENATE_YES, NOW)).toEqual({ ok: false, error: "SCHEMA_DRIFT" });
  });

  it("drops zero-size levels, reports a fully empty book as EMPTY_BOOK and keeps a one-sided book", () => {
    const withZero = parseBook(wire({ bids: [{ price: "0.3", size: "0" }, { price: "0.2", size: "5" }], asks: [] }), SENATE_YES, NOW);
    expect(withZero.ok && withZero.book.bids).toEqual([{ price: "0.2", size: "5" }]);
    expect(withZero.ok && withZero.book.asks).toEqual([]);
    expect(parseBook(wire({ bids: [], asks: [] }), SENATE_YES, NOW)).toEqual({ ok: false, error: "EMPTY_BOOK" });
    expect(parseBook(wire({ bids: [{ price: "0.3", size: "0" }], asks: [] }), SENATE_YES, NOW)).toEqual({ ok: false, error: "EMPTY_BOOK" });
  });

  it("reads the venue timestamp as 13-digit milliseconds only", () => {
    expect(venueTimestampMs("1792344896057")).toBe(1792344896057);
    expect(venueTimestampMs(1792344896057)).toBe(1792344896057);
    expect(venueTimestampMs("1792344896")).toBeUndefined();
    expect(venueTimestampMs("soon")).toBeUndefined();
    expect(venueTimestampMs(null)).toBeUndefined();
  });

  it("mirrors a book into a synthetic complement and says so", () => {
    const parsed = parseBook(wire(), SENATE_YES, NOW);
    if (!parsed.ok) throw new Error("expected a book");
    const mirror = complementBook(parsed.book, SENATE_NO);
    expect(mirror).not.toBeNull();
    expect(mirror?.derived).toBe("complement");
    expect(mirror?.token).toEqual({ venue: "polymarket", tokenId: SENATE_NO });
    // YES bid 0.37 is NO ask 0.63; YES ask 0.38 is NO bid 0.62.
    expect(mirror?.asks[0]).toEqual({ price: "0.63", size: "7523.41" });
    expect(mirror?.bids[0]).toEqual({ price: "0.62", size: "850398.71" });
    expect(mirror?.hash).toBeUndefined();
  });

  it("tolerates unknown extra book fields (the schema is loose) but needs the fields it uses", () => {
    const extra: Json = { ...recorded.senateBook(), brand_new_field: { nested: true } };
    expect(clobBookSchema.safeParse(extra).success).toBe(true);
    const missing: Json = { ...recorded.senateBook() };
    delete missing["bids"];
    expect(clobBookSchema.safeParse(missing).success).toBe(false);
  });
});
