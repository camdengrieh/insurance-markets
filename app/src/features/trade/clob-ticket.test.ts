import { describe, expect, it } from "vitest";

import { depositWalletAddress } from "@sdk/trade/clob/polymarket/deposit-wallet";
import { LIMITLESS_PRICE_TICK } from "@sdk/trade/clob/venues";

import type { Market } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { buildClobTicket, clobMarketFacts, clobOverOrderCap, expectedClobQuote, signedFieldsPreview, tifsFor, type ClobMarketFacts, type ClobTicketInput } from "./clob-ticket";

// The venue ticket's arithmetic: the one documented example (place-orders.md, BUY 10 at 0.52) and the grammar.

const PM: ClobMarketFacts = { venue: "polymarket", marketId: "0x" + "99".repeat(32), tick: "0.01", minSize: "5", polymarketBook: "v2", fetchedAtMs: 0 };
const LM: ClobMarketFacts = { venue: "limitless", marketId: "will-it-rain-1792411200000", tick: LIMITLESS_PRICE_TICK, minSize: "0", polymarketBook: null, fetchedAtMs: 0 };
const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";

function input(overrides: Partial<ClobTicketInput> = {}): ClobTicketInput {
  return { tokenId: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ttlS: "", postOnly: false, ...overrides };
}

function ok(facts: ClobMarketFacts, overrides: Partial<ClobTicketInput> = {}) {
  const built = buildClobTicket(input(overrides), facts);
  if (!built.ok) throw new Error(`expected a ticket: ${JSON.stringify(built.issues)}`);
  return built.ticket;
}

function codes(facts: ClobMarketFacts, overrides: Partial<ClobTicketInput>): string[] {
  const built = buildClobTicket(input(overrides), facts);
  return built.ok ? [] : built.issues.map((issue) => issue.code);
}

describe("the venue ticket", () => {
  it("reproduces the documented Polymarket example: BUY 10 at 0.52 is makerAmount 5200000, takerAmount 10000000, worst case 5.72", () => {
    const ticket = ok(PM);
    expect(ticket.amounts.makerAmount).toBe(5_200_000n);
    expect(ticket.amounts.takerAmount).toBe(10_000_000n);
    expect(expectedClobQuote(ticket)).toEqual({ venue: "polymarket", price: "0.52", shares: "10", maxOutlayUsd: "5.72", reservedUsd: "5.72", feeBoundBps: 1000 });
    expect(ticket.ttlS).toBeNull();
    expect(ticket.tick).toBe("0.01");
  });

  it("counts a SELL at the larger of proceeds and face value, with no cash out", () => {
    const ticket = ok(PM, { side: "SELL", price: "0.05", shares: "10" });
    expect(ticket.maxOutlayAtomic).toBeNull();
    expect(expectedClobQuote(ticket).reservedUsd).toBe("10");
    expect(ticket.minProceedsAtomic).toBe(450_000n);
  });

  it("refuses a price off the tick, a size too fine, a size below the minimum, and the venue's own type rules", () => {
    expect(codes(PM, { price: "0.525" })).toEqual(["bad_price"]);
    expect(codes(PM, { shares: "10.123" })).toEqual(["bad_shares"]);
    expect(codes(PM, { shares: "4.99" })).toEqual(["below_minimum"]);
    expect(codes(PM, { tif: "GTC", ttlS: "300" })).toEqual(["ttl_needs_gtd"]);
    expect(codes(PM, { tif: "GTD", ttlS: "60" })).toEqual(["bad_ttl"]);
    expect(codes(PM, { tif: "FOK", postOnly: true })).toEqual(["post_only_needs_resting"]);
    expect(codes(LM, { tif: "GTD" })).toEqual(["bad_tif"]);
    expect(codes(LM, { price: "0.5255" })).toEqual(["bad_price"]);
    expect(ok(LM, { price: "0.525" }).price).toBe("0.525");
    expect(tifsFor("limitless")).toEqual(["GTC", "FAK", "FOK"]);
    expect(tifsFor("polymarket")).toEqual(["GTC", "GTD", "FOK", "FAK"]);
  });

  it("keeps a GTD lifetime and refuses a stale cap figure it cannot read", () => {
    const ticket = ok(PM, { tif: "GTD", ttlS: "300" });
    expect(ticket.ttlS).toBe(300);
    expect(clobOverOrderCap(ticket, "10")).toBe(false);
    expect(clobOverOrderCap(ticket, "5")).toBe(true);
    expect(clobOverOrderCap(ticket, null)).toBeNull();
    expect(clobOverOrderCap(ticket, "ten")).toBeNull();
  });

  it("previews the signed fields: the maker read at prepare (Polymarket) or the wallet (Limitless), the exact amounts, and the venue's domain", () => {
    const wallet = "0x" + "11".repeat(20);
    const pm = signedFieldsPreview(ok(PM, { tif: "GTD", ttlS: "300" }), PM, wallet);
    const byLabel = Object.fromEntries(pm.map((line) => [line.label, line]));
    // Polymarket: the maker is not assumed. The relay reads Polygon; the page names both derived wallet addresses.
    expect(byLabel["maker and signer"]?.fromRelay).toBe(true);
    expect(byLabel["maker and signer"]?.value).toMatch(/Deposit Wallet/);
    expect(byLabel["your Deposit Wallet addresses"]?.value).toContain(depositWalletAddress(wallet as `0x${string}`, "beacon"));
    expect(byLabel["your Deposit Wallet addresses"]?.value).toContain(depositWalletAddress(wallet as `0x${string}`, "uups"));
    expect(byLabel["signatureType"]?.value).toMatch(/^3 \(Deposit Wallet\) or 0 \(EOA\)/);
    expect(byLabel["what your wallet signs"]?.value).toMatch(/TypedDataSign/);
    expect(signedFieldsPreview(ok(LM), LM, wallet).find((line) => line.label === "maker and signer")?.value).toBe(wallet);
    expect(byLabel["makerAmount"]?.value).toBe("5200000");
    expect(byLabel["salt"]?.fromRelay).toBe(true);
    expect(byLabel["domain"]?.value).toContain("version 3");
    expect(byLabel["expiration (wire only, not signed)"]?.value).toContain("300 s");
    const lm = signedFieldsPreview(ok(LM), LM, null);
    expect(lm.some((line) => line.label === "expiration, nonce" && line.value.startsWith("0 and 0"))).toBe(true);
    expect(lm.some((line) => line.label === "domain" && line.value.includes("chain 8453"))).toBe(true);
  });

  it("refuses a Limitless order under the venue's 100 raw-unit maker floor, and takes one at it", () => {
    expect(codes(LM, { price: "0.001", shares: "0.01" })).toEqual(["below_venue_floor"]);
    expect(codes(LM, { price: "0.001", shares: "0.1" })).toEqual([]);
    // Polymarket has no such floor in this build: the same order is only checked against the market's own minimum.
    expect(codes({ ...PM, tick: "0.001", minSize: "0" }, { price: "0.001", shares: "0.01" })).toEqual([]);
  });

  it("reads the facts from a market record and refuses a tick it cannot build on", () => {
    const base: Market = {
      ref: { venue: "polymarket", marketId: "0x" + "99".repeat(32), native: { version: "v2" } },
      title: untrusted("x"),
      outcomes: [],
      rules: { text: untrusted(""), sha256: "a".repeat(64), sources: [], mechanism: "exchange", void: "refund" },
      status: "active",
      tradable: { ok: true, reasons: [] },
      timesUtc: {},
      tick: "0.01",
      minSize: "5",
      collateral: { symbol: "pUSD", chain: "eip155:137", decimals: 6, custody: "smart_account" },
      fee: { modelId: "unknown", taker: null, maker: null, payer: "unknown", paramsSource: null, verifiedAt: null, ttlSec: 0 } as unknown as Market["fee"],
      prov: { fetchedAtMs: 1, source: "t", adapterVersion: "t", schemaHash: "t" },
    };
    expect(clobMarketFacts(base)).toEqual({ venue: "polymarket", marketId: base.ref.marketId, tick: "0.01", minSize: "5", polymarketBook: "v2", fetchedAtMs: 1 });
    expect(clobMarketFacts({ ...base, ref: { ...base.ref, native: { negRisk: "true" } } })?.polymarketBook).toBe("neg_risk");
    expect(clobMarketFacts({ ...base, tick: "0.02" })).toBeNull();
    expect(clobMarketFacts({ ...base, tick: [{ from: "0", to: "1", tick: "0.01" }] })).toBeNull();
    expect(clobMarketFacts({ ...base, ref: { venue: "kalshi", marketId: "k", native: {} } })).toBeNull();
    expect(clobMarketFacts({ ...base, ref: { venue: "limitless", marketId: "slug-1", native: {} }, tick: "0.001", minSize: undefined })).toEqual({ venue: "limitless", marketId: "slug-1", tick: "0.001", minSize: "0", polymarketBook: null, fetchedAtMs: 1 });
  });
});
