// TEST SUPPORT (imported by test files only; hygiene.test.ts lists it with test-support.tsx): venue order items built with the repository's own builders, the same
// code the relay runs (src/clob/decoded.ts), so a page test vets what a relay would really send. Nothing here is a
// recording from a venue: the salt, the timestamp and the market ids are fixed test values, labelled as such.

import { clobCapAmount, computeClobAmounts } from "@sdk/trade/clob/amounts";
import { buildDecodedClobOrder, rebuildClobOrder } from "@sdk/trade/clob/decoded";
import { depositWalletAddress } from "@sdk/trade/clob/polymarket/deposit-wallet";
import { LIMITLESS_EXCHANGES, POLYMARKET_EXCHANGES, type PolymarketBook } from "@sdk/trade/clob/venues";
import { digestTag } from "@sdk/trade/contract";

import type { ClobTicket } from "./clob-ticket";

const ZERO32 = `0x${"00".repeat(32)}` as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ID = "0123456789abcdef0123456789abcdef";

export interface BuiltClobItem {
  readonly prepared: Record<string, unknown>;
  readonly digest: string;
}

// A relay answer's `prepared` for the given ticket and owner, as the relay would build it. `maker` "beacon" or "uups"
// builds a Polymarket Deposit Wallet order (signature type 3) for the owner's derived wallet in that form.
export function clobItemFor(ticket: ClobTicket, owner: `0x${string}`, options: { readonly nowMs: number; readonly book?: PolymarketBook; readonly tokenIdOverride?: string; readonly maker?: "owner" | "beacon" | "uups" } = { nowMs: 0 }): BuiltClobItem {
  const maker = options.maker === undefined || options.maker === "owner" ? owner : depositWalletAddress(owner, options.maker);
  const signatureType = maker === owner ? 0 : 3;
  const amounts = ticket.amounts;
  const cap = clobCapAmount(amounts, ticket.feeBps);
  const tokenId = BigInt(options.tokenIdOverride ?? ticket.tokenId);
  const nowS = BigInt(Math.floor(options.nowMs / 1000));
  const expiration = ticket.tif === "GTD" ? nowS + BigInt(ticket.ttlS ?? 300) : 0n;
  const decoded = buildDecodedClobOrder({
    owner,
    amounts,
    feeBps: cap.feeBps,
    tif: ticket.tif,
    postOnly: ticket.postOnly,
    ttlS: ticket.ttlS,
    marketId: ticket.marketId,
    tick: ticket.tick,
    minSize: ticket.minSize,
    order:
      ticket.venue === "polymarket"
        ? {
            venue: "polymarket",
            expiration,
            domain: { version: POLYMARKET_EXCHANGES[options.book ?? "v2"].version, verifyingContract: POLYMARKET_EXCHANGES[options.book ?? "v2"].verifyingContract },
            order: { salt: 4242n, maker, signer: maker, tokenId, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, side: amounts.side, signatureType, timestamp: nowS * 1000n, metadata: ZERO32, builder: ZERO32 },
          }
        : {
            venue: "limitless",
            exchange: LIMITLESS_EXCHANGES[0] as `0x${string}`,
            order: { salt: 4243n, maker: owner, signer: owner, taker: ZERO, tokenId, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, expiration: 0n, nonce: 0n, feeRateBps: 0n, side: amounts.side, signatureType: 0 },
          },
  });
  const rebuilt = rebuildClobOrder(decoded);
  if (!rebuilt.ok) throw new Error(`the test item does not rebuild: ${rebuilt.field} ${rebuilt.reason}`);
  const expiresAt = new Date(Math.floor(options.nowMs / 1000) * 1000 + 300_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    digest: rebuilt.digest,
    prepared: {
      prepared_id: ID,
      kind: "clob_order",
      owner,
      account: maker,
      expires_at: expiresAt,
      sign: { intent: { op: "typedData", typedData: rebuilt.typed_data }, expected_digest: rebuilt.digest, digest_form: "eip712OrderHash" },
      summary: { lines: rebuilt.lines, digest_tag: digestTag(rebuilt.digest), inner_hash_tag: digestTag(rebuilt.inner_hash), inner_hash_kind: "typed_data_hash" },
      caps: { reserved_usd: decoded.terms.cap_usd, day_remaining_usd: "44.28" },
      capabilities: ticket.venue === "polymarket" ? { PM1: "unknown", PM2: "unknown", PB3: "unknown" } : { LM1: "unknown", LM2: "unknown", PB4: "unknown" },
      warnings: ["Nothing about this venue's gateway has been proven by a live order from this relay."],
      decoded,
      quote: { venue: ticket.venue, price: decoded.terms.price, shares: decoded.terms.shares, max_outlay_usd: decoded.terms.max_outlay_usd ?? "0", fee_bound_bps: decoded.terms.fee_bound_bps, expires_at: decoded.terms.expires_at },
    },
  };
}

// The structured answer of the clob_order tool (step prepare) around such an item.
export function clobPreparedAnswer(item: BuiltClobItem): Record<string, unknown> {
  const prepared = item.prepared;
  return {
    outcome: "prepared",
    step: "prepare",
    code: "prepared",
    message: "Venue order prepared. Nothing was signed or sent.",
    owner: prepared["owner"],
    account: prepared["account"],
    prepared,
    sign_with_paybox: (prepared["sign"] as { intent: unknown }).intent,
    sign_instructions: "sign it in PayBox",
    digest_tag: digestTag(item.digest),
    inner_hash_tag: digestTag(item.digest),
    verification: { status: "verified", reason: "rebuilt", covered: [], unbound: [] },
    seconds_until_expiry: 300,
    next_action: 'Sign in PayBox, then clob_order with step "submit".',
    warnings: [],
    unproven_capabilities: ["PM1", "PM2", "PB3"],
  };
}
