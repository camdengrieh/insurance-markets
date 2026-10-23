// The Signature Card of a Polymarket order on the direct path: every field the wallet will be asked to sign, in the
// order the wallet lists them, each with its exact value and fixed words that decode it, then the fields that travel
// beside the signature without being signed, and the most collateral that can leave the account. Everything here is
// built from the order the page itself made (order.ts) and pinned constants: no venue text reaches the card.

import { formatAtomic } from "@sdk/money/amount";
import { POLYMARKET_PUSD_DECIMALS } from "@sdk/chain/polymarket/constants";
import { CLOB_CAP_FEE_BPS, type PolymarketBook } from "@sdk/trade/clob/venues";
import { DEPOSIT_WALLET_DOMAIN_NAME, DEPOSIT_WALLET_DOMAIN_VERSION } from "@sdk/trade/clob/polymarket/deposit-wallet";
import type { PolymarketOrder } from "@sdk/trade/clob/polymarket/order";
import type { Hex } from "viem";

import type { CardField, DirectAccount, SignatureCardModel } from "../types";

export function atomicText(value: bigint, decimals: number): string {
  return formatAtomic(value, decimals);
}

// "0123 4567 89ab cdef": the digest's first 16 hex digits, grouped as the relay's Signature Card shows a tag.
export function groupedDigestTag(digest: Hex): string {
  return digest.slice(2, 18).toLowerCase().replace(/(.{4})(?=.)/g, "$1 ");
}

const BOOK_WORDS: Readonly<Record<PolymarketBook, string>> = Object.freeze({
  v2: "Exchange V3, the Protocol V2 book",
  ctf: "the CTF Exchange",
  neg_risk: "the Neg Risk CTF Exchange",
});

const TYPE_WORDS: Readonly<Record<number, string>> = Object.freeze({
  0: "EOA: your wallet is the maker and signs the order",
  2: "Polymarket Safe: your Safe is the maker; your wallet signs for it",
  3: "Deposit Wallet (ERC-1271): your Deposit Wallet is the maker and checks your signature",
});

const ZERO32 = /^0x0{64}$/;

export interface OrderCardInput {
  readonly order: PolymarketOrder;
  readonly book: PolymarketBook;
  readonly domain: { readonly name: string; readonly version: string; readonly chainId: number; readonly verifyingContract: string };
  readonly account: DirectAccount;
  readonly digest: Hex;
  readonly orderHash: Hex;
  readonly price: string;
  readonly shares: string;
  readonly principalAtomic: bigint;
  readonly maxOutlayAtomic: bigint | null;
  readonly minProceedsAtomic: bigint | null;
  readonly tif: string;
  readonly postOnly: boolean;
  readonly expiration: bigint;
  // Fixed app words for the outcome ("Yes", "No", "Outcome 3"), or null.
  readonly outcome: string | null;
  readonly bestBid: string | null;
  readonly bestAsk: string | null;
}

function orderFields(input: OrderCardInput, group: "message" | "contents"): CardField[] {
  const o = input.order;
  const buy = o.side === 0;
  const pusd = (value: bigint): string => `${atomicText(value, POLYMARKET_PUSD_DECIMALS)} pUSD`;
  const shares = (value: bigint): string => `${atomicText(value, 6)} shares`;
  return [
    { group, name: "salt", value: o.salt.toString(), meaning: "a random number that makes this order unique" },
    { group, name: "maker", value: o.maker, meaning: `${input.account.label}: the account the venue debits and credits` },
    { group, name: "signer", value: o.signer, meaning: o.signatureType === 3 ? "your Deposit Wallet, which checks your wallet's signature" : "your wallet, the connected address" },
    { group, name: "tokenId", value: o.tokenId.toString(), meaning: input.outcome === null ? "the outcome token" : `the outcome token: ${input.outcome}` },
    { group, name: "makerAmount", value: o.makerAmount.toString(), meaning: buy ? `${pusd(o.makerAmount)} the maker pays at most` : `${shares(o.makerAmount)} the maker gives` },
    { group, name: "takerAmount", value: o.takerAmount.toString(), meaning: buy ? `${shares(o.takerAmount)} the maker receives at least` : `${pusd(o.takerAmount)} the maker receives at least` },
    { group, name: "side", value: String(o.side), meaning: buy ? "BUY" : "SELL" },
    { group, name: "signatureType", value: String(o.signatureType), meaning: TYPE_WORDS[o.signatureType] ?? "unlisted" },
    { group, name: "timestamp", value: o.timestamp.toString(), meaning: `${new Date(Number(o.timestamp)).toISOString().replace(/\.\d{3}Z$/, "Z")} on the venue's clock` },
    { group, name: "metadata", value: o.metadata, meaning: ZERO32.test(o.metadata) ? "none" : "set" },
    { group, name: "builder", value: o.builder, meaning: ZERO32.test(o.builder) ? "none: no builder attribution" : "a builder code" },
  ];
}

export function polymarketOrderCard(input: OrderCardInput): SignatureCardModel {
  const o = input.order;
  const side = o.side === 0 ? "BUY" : "SELL";
  const wrapper = o.signatureType === 3;
  const domain: CardField[] = [
    { group: "domain", name: "name", value: input.domain.name, meaning: "the exchange's EIP-712 name" },
    { group: "domain", name: "version", value: input.domain.version, meaning: BOOK_WORDS[input.book] },
    { group: "domain", name: "chainId", value: String(input.domain.chainId), meaning: "Polygon" },
    { group: "domain", name: "verifyingContract", value: input.domain.verifyingContract, meaning: `${BOOK_WORDS[input.book]}, pinned in this build` },
  ];
  const message: CardField[] = wrapper
    ? [
        { group: "message", name: "contents", value: "the order below", meaning: "the order, nested whole" },
        { group: "message", name: "name", value: DEPOSIT_WALLET_DOMAIN_NAME, meaning: "your Deposit Wallet's EIP-712 name" },
        { group: "message", name: "version", value: DEPOSIT_WALLET_DOMAIN_VERSION, meaning: "your Deposit Wallet's EIP-712 version" },
        { group: "message", name: "chainId", value: String(input.domain.chainId), meaning: "Polygon" },
        { group: "message", name: "verifyingContract", value: o.maker, meaning: "your Deposit Wallet, which checks this signature" },
        { group: "message", name: "salt", value: `0x${"0".repeat(64)}`, meaning: "zero" },
        ...orderFields(input, "contents"),
      ]
    : orderFields(input, "message");
  const wire: CardField[] = [
    { group: "wire", name: "orderType", value: input.tif, meaning: input.tif === "GTC" ? "rests until filled or cancelled" : input.tif === "GTD" ? "rests until filled, cancelled or expired" : input.tif === "FOK" ? "fills completely at once or not at all" : "fills what it can at once; the rest is cancelled" },
    { group: "wire", name: "expiration", value: input.expiration.toString(), meaning: input.expiration === 0n ? "none" : `${new Date(Number(input.expiration) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")}, enforced by the venue` },
    ...(input.postOnly ? [{ group: "wire" as const, name: "postOnly", value: "true", meaning: "refused by the venue rather than filled at once" }] : []),
    { group: "wire", name: "owner", value: "your API key id", meaning: "names your venue credential; the key itself is never shown" },
  ];
  const lines = [
    `${side} ${input.shares} shares${input.outcome === null ? "" : ` of ${input.outcome}`} at ${input.price} pUSD each on Polymarket.`,
    `Maker: ${input.account.label}, ${o.maker}. Signer: your wallet, ${input.account.signer}.`,
    o.side === 0
      ? `Principal ${atomicText(input.principalAtomic, POLYMARKET_PUSD_DECIMALS)} pUSD; at most ${atomicText(input.maxOutlayAtomic ?? input.principalAtomic, POLYMARKET_PUSD_DECIMALS)} pUSD with the ${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps policy fee ceiling (a ceiling, not the venue's fee quote).`
      : `Proceeds ${atomicText(input.principalAtomic, POLYMARKET_PUSD_DECIMALS)} pUSD before fees${input.minProceedsAtomic === null ? "" : `; at least ${atomicText(input.minProceedsAtomic, POLYMARKET_PUSD_DECIMALS)} pUSD after the ${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps policy fee ceiling`}.`,
    `The book just now: best bid ${input.bestBid ?? "none"}, best ask ${input.bestAsk ?? "none"} (read from Polymarket when this card was built).`,
    wrapper ? "Your wallet signs a TypedDataSign wrapper with the order nested in it; this page wraps that signature for your Deposit Wallet's ERC-1271 check before sending." : "Your wallet signs the order itself.",
    `The venue's id for this order: ${input.orderHash}.`,
  ];
  return {
    title: `Sign a Polymarket ${side} order`,
    lines,
    fields: [...domain, ...message, ...wire],
    digest: input.digest,
    digestTag: groupedDigestTag(input.digest),
    worstCase: o.side === 0 ? `${atomicText(input.maxOutlayAtomic ?? input.principalAtomic, POLYMARKET_PUSD_DECIMALS)} pUSD` : null,
  };
}
