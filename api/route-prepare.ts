import { randomBytes } from "node:crypto";

import { getAddress, isAddress, type Address, type Hex } from "viem";
import * as z from "zod/v4";

import { parseBook, topOfBook } from "../sdk/engine/books.js";
import type { VenueId } from "../sdk/model.js";
import { decToAtomic } from "../sdk/money/decimal.js";
import { ratToDecExact } from "../sdk/money/rational.js";
import { digestTag } from "../sdk/trade/contract.js";
import { computeClobAmounts } from "../sdk/trade/clob/amounts.js";
import { buildDecodedClobOrder, rebuildClobOrder } from "../sdk/trade/clob/decoded.js";
import { hashPolymarketOrder, polymarketOrderToWire, polymarketSigningDigest, POLYMARKET_MAX_SALT, type PolymarketOrder } from "../sdk/trade/clob/polymarket/order.js";
import { CLOB_CAP_FEE_BPS, POLYMARKET_EXCHANGES, POLYMARKET_GEOBLOCK_NOTE, POLYMARKET_SIGNATURE_TYPE_EOA, polymarketTickRule, type PolymarketBook } from "../sdk/trade/clob/venues.js";
import { SIDE_BUY, SIDE_SELL, ZERO_ADDRESS } from "../sdk/trade/xo/constants.js";
import { SigningError } from "../sdk/trade/xo/errors.js";
import type { Origin, TradeView } from "./markets.js";

// POST /v1/route/prepare (docs/sdk-and-api-design.md sections 4 and 5): unsigned typed-data orders, one per venue leg of a
// group, each with its decoded view, built only with the SDK's order builders (sdk/trade). Non-custodial and prepare-only:
// the API holds no key and no venue credential, signs nothing and submits nothing; the user signs in PayBox or their own
// wallet and submits where their venue credential lives.
//
// Built today: Polymarket orders made by the caller's own address (signature type 0, an EOA order), the market's book
// (Protocol V2, CTF or neg-risk CTF exchange) from the venue's market record, its tick and minimum size from the reader.
// Not built, each leg saying why:
//   - Limitless: the SDK's reader does not carry the market's exchange (`venue.exchange`) or fee module, both of which the
//     order signs (feeRateBps); guessing either would build an order for an unchecked contract or a wrong fee;
//   - XO: its orders are made by the owner's Kernel smart account and signed through a user operation the relay prepares
//     with on-chain reads (account, nonce, fee rate); there is no single unsigned typed-data order to hand over;
//   - Trueo: a Uniswap v4 pool swap, not an order; sdk/trade has no builder for it;
//   - a Polymarket Deposit Wallet (type 3) order: whether the derived wallet is deployed and owned by the caller is a chain
//     read the relay makes and the API does not.
// The endpoint is off unless the operator turns it on (config.ts API_ROUTE_PREPARE: off, free or paid).

const DECIMAL = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;
const MARKET_ID = /^[A-Za-z0-9_.:#-]{1,120}$/;

// Order types the API prepares: resting until cancelled (GTC) or filled at once or not at all (FOK, FAK). GTD carries an
// expiry on the wire only; it is not offered here.
export const PREPARE_TIFS = ["GTC", "FOK", "FAK"] as const;

export const routePrepareBodySchema = z
  .object({
    group: z.string().regex(/^lnk_[0-9a-f]{32}$/),
    outcome: z.int().min(0).max(31),
    side: z.enum(["buy", "sell"]),
    owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    legs: z
      .array(
        z
          .object({
            venue: z.string().regex(/^[a-z_]{1,40}$/),
            marketId: z.string().regex(MARKET_ID),
            price: z.string().max(20).regex(DECIMAL),
            shares: z.string().max(20).regex(DECIMAL),
            tif: z.enum(PREPARE_TIFS),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type RoutePrepareBody = z.infer<typeof routePrepareBodySchema>;

export interface PreparedLeg {
  readonly venue: VenueId;
  readonly marketId: string;
  readonly outcomeIndex: number | null;
  readonly built: boolean;
  readonly reason?: string;
  readonly [field: string]: unknown;
}

export function notBuilt(venue: VenueId, marketId: string, outcomeIndex: number | null, reason: string): PreparedLeg {
  return { venue, marketId, outcomeIndex, built: false, reason };
}

// The owner as an EIP-55 address, or null for a bad or zero one.
export function ownerOf(raw: string): Address | null {
  // All lower case passes; mixed case must carry a valid EIP-55 checksum (a typo is refused, never repaired).
  if (!isAddress(raw, { strict: true })) return null;
  const owner = getAddress(raw);
  return owner === ZERO_ADDRESS ? null : owner;
}

export const NOT_BUILT_REASON: Partial<Readonly<Record<VenueId, string>>> = Object.freeze({
  limitless: "Not built: the SDK's Limitless reader does not carry the market's exchange contract or fee module, and the order signs both (verifyingContract, feeRateBps). Nothing is guessed.",
  xo: "Not built: an XO order is made by the owner's Kernel smart account and signed through a user operation the relay prepares from on-chain reads; the API builds no XO order.",
  trueo: "Not built: Trueo trades on Uniswap v4 pools; a swap is not an order and sdk/trade has no builder for it.",
});

function polymarketBookKind(native: Readonly<Record<string, string>>): PolymarketBook | null {
  const version = native["version"];
  if (version === "v2") return "v2";
  if (version !== "v1") return null;
  const negRisk = native["negRisk"];
  if (negRisk === "true") return "neg_risk";
  if (negRisk === "false") return "ctf";
  return null;
}

export interface PrepareContext {
  readonly nowMs: number;
  readonly random?: (bytes: number) => Buffer;
}

// One Polymarket leg: an EOA order for the caller's own address, from the market the API read.
export function preparePolymarketLeg(
  args: { readonly marketId: string; readonly outcomeIndex: number; readonly view: TradeView; readonly owner: Address; readonly side: "buy" | "sell"; readonly price: string; readonly shares: string; readonly tif: (typeof PREPARE_TIFS)[number] },
  context: PrepareContext,
): PreparedLeg {
  const { marketId, outcomeIndex, view, owner } = args;
  const venue: VenueId = "polymarket";
  const market = view.market;
  if (view.venueReason !== null) return notBuilt(venue, marketId, outcomeIndex, view.venueReason);
  if (!market.tradable.ok) return notBuilt(venue, marketId, outcomeIndex, `Not built: the venue does not list the market as tradable${market.tradable.reasons.length > 0 ? ` (${market.tradable.reasons.join("; ")})` : ""}.`);
  const outcome = market.outcomes.find((o) => o.index === outcomeIndex);
  if (outcome === undefined || !/^[0-9]{1,78}$/.test(outcome.tokenId)) return notBuilt(venue, marketId, outcomeIndex, "Not built: the market has no token for the mapped outcome.");
  const book = polymarketBookKind(market.ref.native);
  if (book === null) return notBuilt(venue, marketId, outcomeIndex, "Not built: the market record does not state which exchange it trades on (version and neg-risk), so the domain to sign under is unknown.");
  const tick = typeof market.tick === "string" ? market.tick : null;
  const rule = tick === null ? undefined : polymarketTickRule(tick);
  if (tick === null || rule === undefined) return notBuilt(venue, marketId, outcomeIndex, "Not built: the market's tick is not one of the venue's documented ticks.");
  const minSize = market.minSize ?? "0";
  const minAtomic = decToAtomic(minSize, 6);
  if (!minAtomic.ok) return notBuilt(venue, marketId, outcomeIndex, "Not built: the market's minimum size is not a decimal of at most 6 places.");
  const exchange = POLYMARKET_EXCHANGES[book];
  const random = context.random ?? randomBytes;
  try {
    const amounts = computeClobAmounts({
      side: args.side === "buy" ? SIDE_BUY : SIDE_SELL,
      price: args.price,
      shares: args.shares,
      grid: { tick, priceDecimals: rule.priceDecimals },
      sizeDecimals: rule.sizeDecimals,
      minSharesMicro: minAtomic.value,
    });
    let salt = BigInt(`0x${random(6).toString("hex")}`) % POLYMARKET_MAX_SALT;
    if (salt === 0n) salt = 1n;
    const zero32 = `0x${"0".repeat(64)}` as Hex;
    const order: PolymarketOrder = {
      salt,
      maker: owner,
      signer: owner,
      tokenId: BigInt(outcome.tokenId),
      makerAmount: amounts.makerAmount,
      takerAmount: amounts.takerAmount,
      side: amounts.side,
      signatureType: POLYMARKET_SIGNATURE_TYPE_EOA,
      timestamp: BigInt(context.nowMs),
      metadata: zero32,
      // No builder attribution: never another builder's code.
      builder: zero32,
    };
    const decoded = buildDecodedClobOrder({
      owner,
      amounts,
      feeBps: CLOB_CAP_FEE_BPS,
      tif: args.tif,
      postOnly: false,
      ttlS: null,
      marketId: market.ref.marketId,
      tick,
      minSize,
      order: { venue: "polymarket", order, expiration: 0n, domain: { version: exchange.version, verifyingContract: exchange.verifyingContract } },
    });
    // The checker's side, run here too: the block alone must rebuild the same digest and typed data.
    const rebuilt = rebuildClobOrder(decoded);
    const digest = polymarketSigningDigest(order, book);
    const orderHash = hashPolymarketOrder(order, book);
    if (!rebuilt.ok || rebuilt.digest !== digest || rebuilt.typed_data === undefined) return notBuilt(venue, marketId, outcomeIndex, "Not built: the decoded block did not rebuild to the same digest.");
    const row = view.books.find((b) => b.tokenId === outcome.tokenId);
    const parsed = row?.book === null || row?.book === undefined ? null : parseBook(row.book);
    const top = parsed !== null && parsed.ok ? topOfBook(parsed.value) : null;
    const reference: { readonly bestBid: string | null; readonly bestAsk: string | null; readonly source: Origin | null } = {
      bestBid: top?.bid === null || top === null ? null : ratToDecExact(top.bid),
      bestAsk: top?.ask === null || top === null ? null : ratToDecExact(top.ask),
      source: row?.source ?? null,
    };
    const wire = polymarketOrderToWire(order, 0n);
    return {
      venue,
      marketId,
      outcomeIndex,
      built: true,
      tokenId: outcome.tokenId,
      order: { kind: "polymarket_clob_order", signatureType: POLYMARKET_SIGNATURE_TYPE_EOA, book, chainId: 137, exchange: exchange.verifyingContract, orderType: args.tif },
      // What the owner's wallet signs (eth_signTypedData_v4), and the digest it hashes to.
      signTypedData: rebuilt.typed_data,
      digest,
      digestTag: digestTag(digest),
      orderHash,
      // The POST /order `order` object without its signature: the submitter adds the signature and its own credential.
      wire,
      decoded,
      summary: rebuilt.lines,
      covered: rebuilt.covered,
      unbound: rebuilt.unbound,
      reference,
      signerChecks: [
        `The domain is "Polymarket CTF Exchange" version ${exchange.version} on chain 137 at ${exchange.verifyingContract}, one of the three exchanges pinned in sdk/trade/clob/venues.ts (this market trades on the ${book} book).`,
        `Maker and signer are your own address ${owner} (signature type 0, an EOA order). No wallet or proxy order is built.`,
        `Token ${outcome.tokenId} must be the outcome you mean on market ${market.ref.marketId}: check it on the venue (its /book?token_id answer names the market).`,
        `makerAmount ${order.makerAmount.toString()} and takerAmount ${order.takerAmount.toString()} (6 decimals) must be exactly ${args.side.toUpperCase()} ${args.shares} shares at ${args.price}.`,
        `Rebuild the digest from \`decoded\` with sdk/trade/clob/decoded.ts rebuildClobOrder and compare it with ${digest} (digest tag ${digestTag(digest)}). It commits to ${rebuilt.covered.join(", ")}; it does not commit to ${rebuilt.unbound.join(", ")}.`,
        "The price was not checked against a band: compare it with `reference` (the book's best prices when the API read it, with their source and age).",
        "The API submitted nothing and holds no venue credential. The order exists at the venue only once you post it with your own Polymarket API credential.",
        POLYMARKET_GEOBLOCK_NOTE,
      ],
    };
  } catch (error) {
    if (error instanceof SigningError) return notBuilt(venue, marketId, outcomeIndex, `Not built: ${error.message}.`);
    throw error;
  }
}
