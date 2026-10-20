import { describe, expect, it } from "vitest";

import { buildTicket, expectedQuote, overOrderCap, usdText, type TicketInput } from "./ticket";
import { TICKET_QUOTES, TOKENS } from "./test-support";

function input(overrides: Partial<TicketInput> = {}): TicketInput {
  return { tokenId: TOKENS.yes, side: "BUY", price: "0.4", shares: "10", tif: "GTD", ttlS: "", postOnly: false, ...overrides };
}

function ok(overrides: Partial<TicketInput> = {}) {
  const built = buildTicket(input(overrides));
  if (!built.ok) throw new Error(`expected a ticket: ${JSON.stringify(built.issues)}`);
  return built.ticket;
}

describe("the ticket's displayed outlay equals the relay's quote (M4-8)", () => {
  it("has 200 recorded relay quotes to compare against", () => {
    expect(TICKET_QUOTES).toHaveLength(200);
    expect(TICKET_QUOTES.some((entry) => entry.side === "BUY")).toBe(true);
    expect(TICKET_QUOTES.some((entry) => entry.side === "SELL")).toBe(true);
  });

  it("matches max_outlay_usd, reserved_usd and fee_bound_bps digit for digit on all 200", () => {
    for (const entry of TICKET_QUOTES) {
      const tokenId = entry.token === "yes" ? TOKENS.yes : TOKENS.no;
      const ticket = ok({ tokenId, side: entry.side, price: entry.price, shares: entry.shares });
      const want = expectedQuote(ticket);
      expect(want.maxOutlayUsd, `${entry.side} ${entry.shares}@${entry.price}`).toBe(entry.max_outlay_usd);
      expect(want.reservedUsd, `${entry.side} ${entry.shares}@${entry.price}`).toBe(entry.reserved_usd);
      expect(want.feeBoundBps).toBe(entry.fee_bound_bps);
      // The recorded price and size are the form text; the ticket writes them back in the relay's canonical form.
      expect(Number(want.price)).toBe(Number(entry.price));
      expect(Number(want.shares)).toBe(Number(entry.shares));
    }
  });

  it("counts a BUY at principal times 1.10 and a SELL at the larger of proceeds and face value", () => {
    const buy = ok({ price: "0.4", shares: "10" });
    expect(usdText(buy.principalAtomic)).toBe("4");
    expect(expectedQuote(buy).maxOutlayUsd).toBe("4.4");
    const sell = ok({ side: "SELL", price: "0.62", shares: "5" });
    expect(expectedQuote(sell).maxOutlayUsd).toBe("0");
    expect(expectedQuote(sell).reservedUsd).toBe("5");
    expect(sell.maxOutlayAtomic).toBeNull();
    expect(sell.minProceedsAtomic).not.toBeNull();
  });

  it("uses exact integers: no result depends on floating point", () => {
    const ticket = ok({ price: "0.333", shares: "3" });
    expect(typeof ticket.principalAtomic).toBe("bigint");
    expect(typeof ticket.capAtomic).toBe("bigint");
    expect(usdText(ticket.capAtomic)).toBe(expectedQuote(ticket).reservedUsd);
  });
});

describe("ticket validation fails closed with a field and a sentence", () => {
  const cases: readonly { readonly name: string; readonly overrides: Partial<TicketInput>; readonly field: string }[] = [
    { name: "an empty token", overrides: { tokenId: "" }, field: "token" },
    { name: "a token with a leading zero", overrides: { tokenId: "012" }, field: "token" },
    { name: "a token that is not a number", overrides: { tokenId: "abc" }, field: "token" },
    { name: "an unknown side", overrides: { side: "HOLD" }, field: "side" },
    { name: "an unknown type", overrides: { tif: "IOC" }, field: "tif" },
    { name: "a zero price", overrides: { price: "0" }, field: "price" },
    { name: "a price of one", overrides: { price: "1" }, field: "price" },
    { name: "a price off the tick", overrides: { price: "0.4005" }, field: "price" },
    { name: "an exponent price", overrides: { price: "4e-1" }, field: "price" },
    { name: "a negative size", overrides: { shares: "-1" }, field: "shares" },
    { name: "a size below the minimum", overrides: { shares: "0.5" }, field: "shares" },
    { name: "a non-numeric size", overrides: { shares: "ten" }, field: "shares" },
    { name: "a life of zero", overrides: { ttlS: "0" }, field: "ttl" },
    { name: "a life over an hour", overrides: { ttlS: "3601" }, field: "ttl" },
    { name: "a fractional life", overrides: { ttlS: "1.5" }, field: "ttl" },
    { name: "post-only on a FOK", overrides: { tif: "FOK", postOnly: true }, field: "post_only" },
  ];
  for (const { name, overrides, field } of cases) {
    it(`refuses ${name}`, () => {
      const built = buildTicket(input(overrides));
      expect(built.ok).toBe(false);
      if (built.ok) return;
      expect(built.issues.map((issue) => issue.field)).toContain(field);
      for (const issue of built.issues) expect(issue.message.length).toBeGreaterThan(10);
    });
  }

  it("refuses a size that makes the cash amount inexact and names the step", () => {
    const built = buildTicket(input({ price: "0.333", shares: "1.0005" }));
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.issues[0]?.code).toBe("inexact_amount");
    expect(built.issues[0]?.message).toMatch(/multiple of/);
  });

  it("does not echo what was typed into its messages", () => {
    const built = buildTicket(input({ tokenId: "<img src=x onerror=1>", price: "<b>", shares: "<script>" }));
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(JSON.stringify(built.issues)).not.toMatch(/[<>]/);
  });

  it("accepts the canonical forms and writes them back canonical", () => {
    const ticket = ok({ price: "0.40", shares: "10.0" });
    expect(ticket.price).toBe("0.4");
    expect(ticket.shares).toBe("10");
  });
});

describe("the per-order cap check", () => {
  it("compares exactly, and reports unknown as null", () => {
    const ticket = ok({ price: "0.4", shares: "10" });
    expect(overOrderCap(ticket, "4.4")).toBe(false);
    expect(overOrderCap(ticket, "4.399999")).toBe(true);
    expect(overOrderCap(ticket, "10")).toBe(false);
    expect(overOrderCap(ticket, null)).toBeNull();
    expect(overOrderCap(ticket, "ten")).toBeNull();
  });
});
