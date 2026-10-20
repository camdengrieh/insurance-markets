import { maxUint256 } from "viem";

import type { ORDER_TIFS, PreparedDecoded, UserOpAction } from "../relay/contract.js";
import { parseDecimalToMicro } from "../xo/units.js";

// What the caller asked for, compared with what the verified decoded block says it would sign (SC-1).
//
// verifyPrepared proves the digest, the tags and the summary lines belong to the decoded block. It cannot know
// the request, so a relay that answers a SELL with a verified BUY, a redeem with a withdrawal, or a 5 USD
// allowance with an unlimited one would pass it. These checks close that gap. They run only on a decoded block
// that has just been rebuilt (the rest of the item is then bound to it); an item without a decoded block is
// already marked unverified and shows the relay's words only.
//
// Each function returns undefined when everything matches, or a short sentence naming the first difference
// (fixed text plus the request's own values; never relay text).

// Slack on the signed expiry for the clock difference between this process and XO's clock, which the relay
// counts the order's life on (relay/orders.ts accepts up to two minutes of skew).
export const ORDER_EXPIRY_SLACK_MS = 180_000;

export interface OrderWant {
  readonly tokenId: string;
  readonly side: "BUY" | "SELL";
  readonly tif: (typeof ORDER_TIFS)[number];
  readonly postOnly: boolean;
  // The lifetime the caller asked for, or undefined for the relay's default.
  readonly ttlS: number | undefined;
  // The longest lifetime this plugin accepts (XO_ORDER_EXPIRY_SECONDS under the compiled-in ceiling).
  readonly longestTtlS: number;
  readonly nowMs: number;
}

export function orderDifference(decoded: PreparedDecoded | undefined, want: OrderWant): string | undefined {
  if (decoded === undefined) return undefined;
  if (decoded.kind !== "order") return "the decoded block is not an order";
  if (decoded.action !== "place_order") return "the decoded action is not place_order";
  let signedToken: bigint;
  let askedToken: bigint;
  try {
    signedToken = BigInt(decoded.order.token_id);
    askedToken = BigInt(want.tokenId);
  } catch {
    return "the token id could not be read";
  }
  if (signedToken !== askedToken) return `the order to be signed is for token ${decoded.order.token_id}, not the token ${want.tokenId} asked for`;
  if (decoded.terms.side !== want.side) return `the order to be signed is a ${decoded.terms.side}, not the ${want.side} asked for`;
  if (decoded.params.purpose !== "trade") return "the order to be signed is not a trade order";
  if (decoded.params.tif !== want.tif) return `the order to be signed is ${decoded.params.tif}, not the ${want.tif} asked for`;
  if (decoded.params.post_only !== want.postOnly) return `the order to be signed has post_only ${String(decoded.params.post_only)}, not the ${String(want.postOnly)} asked for`;
  if (want.ttlS !== undefined && decoded.params.ttl_s !== want.ttlS) return `the order's lifetime is ${decoded.params.ttl_s} seconds, not the ${want.ttlS} asked for`;
  const limit = want.ttlS ?? want.longestTtlS;
  if (decoded.params.ttl_s > limit) return `the order's lifetime is ${decoded.params.ttl_s} seconds, over the ${limit} allowed here`;
  // The lifetime in the params is not signed; the expiry in the order is. Hold the signed one to the same limit.
  const expiresMs = Date.parse(decoded.terms.expires_at);
  if (!Number.isFinite(expiresMs) || expiresMs - want.nowMs > limit * 1000 + ORDER_EXPIRY_SLACK_MS) {
    return `the signed expiry ${decoded.terms.expires_at} is further out than the ${limit} seconds allowed here`;
  }
  return undefined;
}

export interface UseropWant {
  readonly action: UserOpAction;
  // enable trading only: the capped allowance asked for, or undefined for XO's own unlimited approval.
  readonly allowanceUsd?: string | undefined;
  // redeem only: the conditions asked for (any case, duplicates allowed).
  readonly conditionIds?: readonly string[] | undefined;
}

export function useropDifference(decoded: PreparedDecoded | undefined, want: UseropWant): string | undefined {
  if (decoded === undefined) return undefined;
  if (decoded.kind !== "userop") return "the decoded block is not a user operation";
  if (decoded.action !== want.action) return `the operation to be signed is ${decoded.action}, not the ${want.action} asked for`;
  switch (want.action) {
    case "deploy_enable_trading":
    case "enable_trading": {
      let wanted: bigint = maxUint256;
      if (want.allowanceUsd !== undefined) {
        const micro = parseDecimalToMicro(want.allowanceUsd, 6);
        if (micro === null || micro <= 0n) return "the allowance asked for could not be read";
        wanted = micro;
      }
      const approve = decoded.calls[0];
      if (approve === undefined || approve.template !== "usdce_approve") return "the first call is not the USDC.e approval";
      const amount = approve.args["amount"];
      if (typeof amount !== "string" || amount !== wanted.toString(10)) {
        return want.allowanceUsd === undefined
          ? "the USDC.e approval is not XO's own unlimited one that was asked for"
          : `the USDC.e approval is ${String(amount)} atomic units, not the ${want.allowanceUsd} USDC.e asked for`;
      }
      return undefined;
    }
    case "redeem": {
      const wantedIds = new Set((want.conditionIds ?? []).map((id) => id.toLowerCase()));
      const signedIds = decoded.calls.map((call) => (call.template === "ctf_redeem" ? String(call.args["condition_id"]).toLowerCase() : ""));
      if (signedIds.some((id) => id === "")) return "a call is not a redeem";
      if (new Set(signedIds).size !== signedIds.length) return "a market is redeemed twice";
      if (signedIds.length !== wantedIds.size || signedIds.some((id) => !wantedIds.has(id))) return "the markets to be redeemed are not the ones asked for";
      return undefined;
    }
    case "revoke_trading":
      return undefined;
    default:
      // Every other action has its own tool and its own request; this one does not know what was asked.
      return `no request is defined here for ${want.action}`;
  }
}

export interface WithdrawWant {
  readonly owner: string;
  readonly amountMicro: bigint;
}

export function withdrawDifference(decoded: PreparedDecoded | undefined, want: WithdrawWant): string | undefined {
  if (decoded === undefined) return undefined;
  if (decoded.kind !== "userop") return "the decoded block is not a user operation";
  if (decoded.action !== "withdraw") return `the operation to be signed is ${decoded.action}, not a withdrawal`;
  const transfers = decoded.calls.filter((call) => call.template === "withdraw_transfer_remote");
  const transfer = transfers[0];
  if (transfers.length !== 1 || transfer === undefined) return "the operation does not hold exactly one withdrawal transfer";
  if (transfer.args["amount"] !== want.amountMicro.toString(10)) return `the withdrawal moves ${String(transfer.args["amount"])} atomic units, not the amount asked for`;
  const recipient = String(transfer.args["recipient"]).toLowerCase();
  if (recipient !== `0x${"0".repeat(24)}${want.owner.slice(2).toLowerCase()}`) return "the withdrawal does not go to the owner address";
  return undefined;
}
