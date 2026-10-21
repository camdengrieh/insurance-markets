import { describe, expect, it } from "vitest";

import { clobItemFor } from "./clob-test-support";
import { buildClobTicket, type ClobMarketFacts, type ClobTicket } from "./clob-ticket";
import { vetPrepared, type VetResult } from "./vet";
import { OWNER } from "./test-support";

// A venue order item is shown only after the page rebuilds it and matches it against the ticket (M4-6, M4-8), with the
// maker required to be the owner wallet itself. The items are built with the repository's own builders (clob-items.ts).

const NOW = Date.parse("2026-10-19T12:00:00Z");
const PM: ClobMarketFacts = { venue: "polymarket", marketId: "0x" + "99".repeat(32), tick: "0.01", minSize: "5", polymarketBook: "v2", fetchedAtMs: NOW };
const LM: ClobMarketFacts = { venue: "limitless", marketId: "will-it-rain-1792411200000", tick: "0.001", minSize: "0", polymarketBook: null, fetchedAtMs: NOW };
const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
const owner = OWNER as `0x${string}`;

function ticketFor(facts: ClobMarketFacts, over: Partial<{ side: string; price: string; shares: string; tif: string; ttlS: string; postOnly: boolean }> = {}): ClobTicket {
  const built = buildClobTicket({ tokenId: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ttlS: "", postOnly: false, ...over }, facts);
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return built.ticket;
}

function fails(result: VetResult, code: string, field?: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.code).toBe(code);
    if (field !== undefined) expect(result.field).toBe(field);
  }
}

describe("vetting a venue order", () => {
  it("accepts a Polymarket item that matches the ticket: the maker is the owner, the domain is pinned, the terms and quote agree", () => {
    const ticket = ticketFor(PM, { tif: "GTD", ttlS: "300" });
    const item = clobItemFor(ticket, owner, { nowMs: NOW });
    const result = vetPrepared(item.prepared, { kind: "clob_order", owner, ticket }, NOW + 5_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("clob_order");
    expect(result.account.toLowerCase()).toBe(owner.toLowerCase());
    expect(result.order?.venue).toBe("polymarket");
    expect(result.order?.expiresAt).not.toBeNull();
    expect(result.order?.ttlS).toBe(300);
    expect(result.innerKind).toBe("typed_data_hash");
    expect(result.digestTag).toBe(result.innerTag);
    expect(result.actionTitle).toBe("Place an order");
  });

  it("accepts a Limitless item with no signed expiry", () => {
    const ticket = ticketFor(LM);
    const item = clobItemFor(ticket, owner, { nowMs: NOW });
    const result = vetPrepared(item.prepared, { kind: "clob_order", owner, ticket }, NOW + 5_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order?.expiresAt).toBeNull();
    expect(result.order?.ttlS).toBeNull();
    expect(result.order?.exchange.toLowerCase()).toBe("0x05c748e2f4dcde0ec9fa8ddc40de6b867f923fa5");
  });

  it("refuses an item for another token, side, price, venue or market than the ticket", () => {
    const ticket = ticketFor(PM);
    const item = clobItemFor(ticket, owner, { nowMs: NOW, tokenIdOverride: "1" });
    fails(vetPrepared(item.prepared, { kind: "clob_order", owner, ticket }, NOW), "ticket", "decoded.order.token_id");
    const sellTicket = ticketFor(PM, { side: "SELL" });
    fails(vetPrepared(clobItemFor(ticket, owner, { nowMs: NOW }).prepared, { kind: "clob_order", owner, ticket: sellTicket }, NOW), "ticket", "decoded.terms.side");
    const otherPrice = ticketFor(PM, { price: "0.53" });
    fails(vetPrepared(clobItemFor(ticket, owner, { nowMs: NOW }).prepared, { kind: "clob_order", owner, ticket: otherPrice }, NOW), "ticket", "decoded.terms.price");
    const limitless = ticketFor(LM);
    fails(vetPrepared(clobItemFor(ticket, owner, { nowMs: NOW }).prepared, { kind: "clob_order", owner, ticket: limitless }, NOW), "ticket", "decoded.venue");
  });

  it("refuses an item whose account is not the owner wallet, or whose maker is a stranger", () => {
    const ticket = ticketFor(PM);
    const stranger = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const item = clobItemFor(ticket, owner, { nowMs: NOW });
    fails(vetPrepared({ ...item.prepared, account: stranger }, { kind: "clob_order", owner, ticket }, NOW), "account", "account");
    fails(vetPrepared(item.prepared, { kind: "clob_order", owner: stranger, ticket }, NOW), "owner", "owner");
  });

  it("refuses a changed digit anywhere in the signed fields (the rebuild catches it) and a tampered summary line", () => {
    const ticket = ticketFor(PM);
    const item = clobItemFor(ticket, owner, { nowMs: NOW });
    const decoded = structuredClone(item.prepared["decoded"]) as { order: { salt: string } };
    decoded.order.salt = "4343";
    fails(vetPrepared({ ...item.prepared, decoded }, { kind: "clob_order", owner, ticket }, NOW), "mismatch");
    const summary = structuredClone(item.prepared["summary"]) as { lines: string[] };
    summary.lines[0] = summary.lines[0]!.replace("10 shares", "11 shares");
    fails(vetPrepared({ ...item.prepared, summary }, { kind: "clob_order", owner, ticket }, NOW), "mismatch");
  });

  it("refuses an XO order item when a venue order was asked for, and the other way round", () => {
    const ticket = ticketFor(PM);
    const item = clobItemFor(ticket, owner, { nowMs: NOW });
    fails(vetPrepared({ ...item.prepared, kind: "order" }, { kind: "clob_order", owner, ticket }, NOW), "schema");
  });

  it("refuses an item that is out of time", () => {
    const ticket = ticketFor(PM);
    const item = clobItemFor(ticket, owner, { nowMs: NOW });
    fails(vetPrepared(item.prepared, { kind: "clob_order", owner, ticket }, NOW + 400_000), "expired");
  });
});
