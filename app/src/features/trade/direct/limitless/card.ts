// The Signature Card of a Limitless order on the direct path: every field the wallet will be asked to sign, in the
// order the wallet lists them, each with its exact value and fixed words that decode it, then the fields that travel
// beside the signature in the POST /orders body, and the most USDC that can leave the wallet. Everything here is built
// from the order the page itself made (order.ts), the pinned constants and the profile id Limitless returned (a number,
// checked); no venue text reaches the card.

import { CLOB_CAP_FEE_BPS } from "@sdk/trade/clob/venues";

import { atomicText, groupedDigestTag } from "../polymarket/card";
import type { CardField, DirectAccount, SignatureCardModel } from "../types";
import type { LimitlessOrderPlan } from "./order";

const FEE_WORDS: Readonly<Record<LimitlessOrderPlan["feeSource"], string>> = Object.freeze({
  collateral: "zero: this market's venue charges its fee in USDC through its fee module, and orders there are signed with 0",
  off: "zero: this market charges no fee (its record says so)",
  on: "your Limitless profile's effective fee rate, read from Limitless when this card was built (the venue refuses any other value)",
});

export interface LimitlessCardInput {
  readonly plan: LimitlessOrderPlan;
  readonly account: DirectAccount;
  readonly shares: string;
  readonly principalAtomic: bigint;
  readonly maxOutlayAtomic: bigint | null;
  readonly minProceedsAtomic: bigint | null;
  // Fixed app words for the outcome ("Yes", "No"), or null.
  readonly outcome: string | null;
  // The book as the markets API last read it, with its age in words, or the reason there is none.
  readonly book: { readonly bestBid: string | null; readonly bestAsk: string | null; readonly asOf: string } | { readonly unread: string };
}

export function limitlessOrderCard(input: LimitlessCardInput): SignatureCardModel {
  const { plan, account } = input;
  const o = plan.order;
  const buy = o.side === 0;
  const side = buy ? "BUY" : "SELL";
  const usdc = (value: bigint): string => `${atomicText(value, 6)} USDC`;
  const shares = (value: bigint): string => `${atomicText(value, 6)} shares`;
  const domain: CardField[] = [
    { group: "domain", name: "name", value: plan.domain.name, meaning: "the exchange's EIP-712 name" },
    { group: "domain", name: "version", value: plan.domain.version, meaning: "the exchange's EIP-712 version" },
    { group: "domain", name: "chainId", value: String(plan.domain.chainId), meaning: "Base" },
    { group: "domain", name: "verifyingContract", value: plan.domain.verifyingContract, meaning: "the Limitless CTF Exchange, pinned in this build and named by the market's record" },
  ];
  const message: CardField[] = [
    { group: "message", name: "salt", value: o.salt.toString(), meaning: "a random number that makes this order unique" },
    { group: "message", name: "maker", value: o.maker, meaning: "your wallet: the account Limitless debits and credits" },
    { group: "message", name: "signer", value: o.signer, meaning: "your wallet, the connected address" },
    { group: "message", name: "taker", value: o.taker, meaning: "zero: anyone may fill it" },
    { group: "message", name: "tokenId", value: o.tokenId.toString(), meaning: input.outcome === null ? "the outcome token" : `the outcome token: ${input.outcome}` },
    { group: "message", name: "makerAmount", value: o.makerAmount.toString(), meaning: buy ? `${usdc(o.makerAmount)} your wallet pays at most` : `${shares(o.makerAmount)} your wallet gives` },
    { group: "message", name: "takerAmount", value: o.takerAmount.toString(), meaning: buy ? `${shares(o.takerAmount)} your wallet receives at least` : `${usdc(o.takerAmount)} your wallet receives at least` },
    { group: "message", name: "expiration", value: o.expiration.toString(), meaning: "none: Limitless takes only 0" },
    { group: "message", name: "nonce", value: o.nonce.toString(), meaning: "zero: Limitless takes only 0" },
    { group: "message", name: "feeRateBps", value: o.feeRateBps.toString(), meaning: FEE_WORDS[plan.feeSource] },
    { group: "message", name: "side", value: String(o.side), meaning: side },
    { group: "message", name: "signatureType", value: String(o.signatureType), meaning: "EOA: your wallet is the maker and signs the order" },
  ];
  const wire: CardField[] = [
    { group: "wire", name: "orderType", value: plan.tif, meaning: plan.tif === "GTC" ? "rests until filled or cancelled" : "fills what it can at once; the rest is cancelled" },
    { group: "wire", name: "price", value: plan.price, meaning: "the limit price; price times shares equals the collateral amount exactly" },
    ...(plan.postOnly ? [{ group: "wire" as const, name: "postOnly", value: "true", meaning: "refused by the venue rather than filled at once" }] : []),
    { group: "wire", name: "ownerId", value: String(plan.ownerId), meaning: "your Limitless profile id, read with your token" },
    { group: "wire", name: "marketSlug", value: plan.slug, meaning: "the market, by its Limitless id" },
    { group: "wire", name: "lmts-api-key, lmts-signature", value: "your token id and an HMAC made in this tab", meaning: "authenticates the request; the token's secret never leaves this tab" },
  ];
  const lines = [
    `${side} ${input.shares} shares${input.outcome === null ? "" : ` of ${input.outcome}`} at ${plan.price} USDC each on Limitless (Base).`,
    `Maker and signer: your wallet, ${o.maker}.`,
    buy
      ? `Principal ${usdc(input.principalAtomic)}; at most ${usdc(input.maxOutlayAtomic ?? input.principalAtomic)} with the ${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps policy fee ceiling (a ceiling, not the venue's fee quote).`
      : `Proceeds ${usdc(input.principalAtomic)} before fees${input.minProceedsAtomic === null ? "" : `; at least ${usdc(input.minProceedsAtomic)} after the ${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps policy fee ceiling`}.`,
    "unread" in input.book ? input.book.unread : `The book: best bid ${input.book.bestBid ?? "none"}, best ask ${input.book.bestAsk ?? "none"} (read by our markets API ${input.book.asOf}).`,
    "Your wallet signs the order itself. This page then sends it once, through our markets API's relay, to Limitless.",
    `The order's EIP-712 hash: ${plan.digest}.`,
  ];
  return {
    title: `Sign a Limitless ${side} order`,
    lines,
    fields: [...domain, ...message, ...wire],
    digest: plan.digest,
    digestTag: groupedDigestTag(plan.digest),
    worstCase: buy ? usdc(input.maxOutlayAtomic ?? input.principalAtomic) : null,
  };
}
