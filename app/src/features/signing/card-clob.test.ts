import { describe, expect, it } from "vitest";

import { clobItemFor } from "../trade/clob-test-support";
import { buildClobTicket, type ClobMarketFacts } from "../trade/clob-ticket";
import { OWNER } from "../trade/test-support";
import { copyGate, evaluateCard, signGate } from "./card";
import { KIND_TEXT } from "./words";

// The Signature Card on a venue order (Polymarket, Limitless): the typed data is the order itself, the maker is the
// owner wallet, the chain is the venue's, and the rebuild check runs with the same code the relay used.

const NOW = Date.parse("2026-10-19T12:00:00Z");
const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
const PM: ClobMarketFacts = { venue: "polymarket", marketId: "0x" + "99".repeat(32), tick: "0.01", minSize: "5", polymarketBook: "v2", fetchedAtMs: NOW };
const LM: ClobMarketFacts = { venue: "limitless", marketId: "will-it-rain-1792411200000", tick: "0.001", minSize: "0", polymarketBook: null, fetchedAtMs: NOW };

function itemFor(facts: ClobMarketFacts, tif: "GTC" | "GTD" = "GTC") {
  const built = buildClobTicket({ tokenId: TOKEN, side: "BUY", price: "0.52", shares: "10", tif, ttlS: tif === "GTD" ? "300" : "", postOnly: false }, facts);
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return clobItemFor(built.ticket, OWNER as `0x${string}`, { nowMs: NOW });
}

describe("the card on a venue order", () => {
  it("verifies a Polymarket order: contract, intent, tag, maker-is-owner, rebuild and window pass; the chain is 137; the intent is the order's typed data", () => {
    const item = itemFor(PM, "GTD");
    const evaluation = evaluateCard(item.prepared, { nowMs: NOW + 1_000, state: "prepared" });
    expect(evaluation.verification).toBe("verified");
    expect(evaluation.checks.filter((check) => check.status === "fail")).toEqual([]);
    expect(evaluation.checks.find((check) => check.id === "account")?.label).toBe("The maker is the owner wallet itself");
    expect(evaluation.chainId).toBe(137);
    expect(evaluation.innerTag).toBe(evaluation.digestTag);
    expect(evaluation.intent?.op).toBe("typedData");
    if (evaluation.intent?.op === "typedData") {
      expect(evaluation.intent.typedData.primaryType).toBe("Order");
      expect(evaluation.intent.typedData.domain.chainId).toBe(137);
      expect(evaluation.intent.typedData.message["maker"]).toBe(OWNER);
    }
    expect(copyGate(evaluation, "prepared").enabled).toBe(true);
    // Path S2 stays off: the Sign gate says so whatever else passed.
    expect(signGate({ evaluation, itemState: "prepared", posture: "ARMED", kill: false, instance: "writer", s2Enabled: false, approvalMode: "always_approve" }).reasons).toContain("s2_off");
  });

  it("verifies a Limitless order with no signed expiry on chain 8453", () => {
    const item = itemFor(LM);
    const evaluation = evaluateCard(item.prepared, { nowMs: NOW + 1_000, state: "prepared" });
    expect(evaluation.verification).toBe("verified");
    expect(evaluation.chainId).toBe(8453);
    expect(evaluation.freshness.state).toBe("fresh");
  });

  it("fails the account check when the item's account is not the owner wallet, and withholds the intent", () => {
    const item = itemFor(PM);
    const evaluation = evaluateCard({ ...item.prepared, account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }, { nowMs: NOW + 1_000, state: "prepared" });
    expect(evaluation.verification).toBe("failed");
    expect(evaluation.failedChecks).toContain("account: not the owner");
    expect(evaluation.intent).toBeNull();
  });

  it("fails the rebuild when a signed field was changed on the way", () => {
    const item = itemFor(PM);
    const decoded = structuredClone(item.prepared["decoded"]) as { order: { maker_amount: string } };
    decoded.order.maker_amount = "5300000";
    const evaluation = evaluateCard({ ...item.prepared, decoded }, { nowMs: NOW + 1_000, state: "prepared" });
    expect(evaluation.verification).toBe("failed");
    expect(evaluation.mismatch?.status).toBe("mismatch");
  });

  it("names the kinds", () => {
    expect(KIND_TEXT["clob_order"]).toContain("Venue order");
    expect(KIND_TEXT["clob_auth"]).toContain("Polymarket login");
  });
});
