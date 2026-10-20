// The approval summary as a PURE FUNCTION of the decoded block (amendment R1, docs/dapp-design.md 5.3).
//
// The relay writes these lines with this code, and the Signature Card regenerates them from the decoded block
// with the same code, so a changed digit in a line the relay sent is a mismatch (acceptance M4-2). Nothing
// here reads a clock, the network or any state; every value comes in through the input. The wording is the
// wording the relay used before the decoded block existed, kept as it was where a test or a human may match
// it. No market text enters except through a value that is already inside its fixed untrusted slot.
//
// Portable: no node:* import, no Node-only global (the plugin bundle may reach it through the contract).

import { formatAtomic } from "../../guardrails/amount.js";
import { sanitizeUntrusted } from "../../guardrails/untrusted.js";
import { AUTH_PREPARED_TTL_S, SAFETY_NOTICES, digestTag, type UserOpAction } from "../../relay/contract.js";
import {
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE,
  KERNEL_FACTORY,
  MARKET_MANAGER,
  POLICY_PAYMASTER,
  USDC_E_ADDRESS,
  USDC_E_DECIMALS,
  XO_WARP_ROUTE,
  type Address,
  type Hex,
} from "../chain/constants.js";
import type { DecodedCall } from "../userop/calls.js";

const usd = (atomic: bigint): string => formatAtomic(atomic, USDC_E_DECIMALS);
const shortAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;

// Whole-second UTC, the only timestamp form on the wire.
export function isoSecond(ms: number): string {
  const date = new Date(Number.isFinite(ms) ? ms : 0);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---- user operations ----------------------------------------------------------------------------------

export const ACTION_TITLES: Readonly<Record<UserOpAction, string>> = Object.freeze({
  deploy_enable_trading: "Deploy your XO account and enable trading",
  enable_trading: "Enable trading",
  revoke_trading: "Revoke trading on chain (allowance to zero, exchange removed as operator)",
  redeem: "Redeem resolved positions",
  withdraw: "Withdraw USDC.e from XO to Base (UNVERIFIED path)",
  create_market: "Create a market",
  respond_update: "Answer the oracle's update request",
  cancel_market: "Cancel a market",
});

const UINT256_MAX = (1n << 256n) - 1n;

function describeAmount(amount: bigint): string {
  return amount >= UINT256_MAX / 2n ? "unlimited (2^256-1)" : `${usd(amount)} USDC.e`;
}

function conditionLines(ids: readonly Hex[]): string[] {
  const lines: string[] = [];
  for (let index = 0; index < ids.length; index += 4) lines.push(`  ${ids.slice(index, index + 4).join(" ")}`);
  return lines;
}

function describeCalls(decoded: readonly DecodedCall[], owner: string, titleSlot: string | null): string[] {
  const lines: string[] = [];
  const redeems: Hex[] = [];
  let position = 0;
  for (const call of decoded) {
    position += 1;
    const prefix = `Call ${position} of ${decoded.length}:`;
    switch (call.kind) {
      case "usdce_approve": {
        const name = call.spender === CTF_EXCHANGE ? "exchange" : call.spender === MARKET_MANAGER ? "market manager" : "XO route";
        lines.push(`${prefix} USDC.e ${USDC_E_ADDRESS} approve(spender ${name} ${call.spender}, amount ${call.amount === 0n ? "0 (revoke)" : describeAmount(call.amount)}).`);
        break;
      }
      case "ctf_set_approval_for_all":
        lines.push(`${prefix} Conditional Tokens ${CONDITIONAL_TOKENS} setApprovalForAll(operator exchange ${call.operator}, approved ${call.approved ? "true" : "false"}).`);
        break;
      case "ctf_redeem":
        // One line for the whole batch, then the conditions four to a line: a batch of fifty still fits.
        if (redeems.length === 0) lines.push(`Calls: ${decoded.length} x Conditional Tokens ${CONDITIONAL_TOKENS} redeemPositions(USDC.e, parent 0x00..00, condition below, index sets [${call.indexSets.map((set) => set.toString()).join(",")}]).`);
        redeems.push(call.conditionId);
        break;
      case "create_market": {
        const uri = sanitizeUntrusted(call.metadataUri, { maxChars: 120, source: "metadata-uri" }).text.replaceAll('"', "'").replaceAll("[", "(").replaceAll("]", ")");
        lines.push(`${prefix} Market manager ${MARKET_MANAGER} createConvictionMarket(startsAt ${call.startsAt}, expiresAt ${call.expiresAt}, collateral USDC.e).`);
        lines.push(`  [metadata uri (untrusted): "${uri}"]`);
        if (titleSlot !== null) lines.push(`  ${titleSlot}`);
        break;
      }
      case "respond_update":
        lines.push(`${prefix} Market manager ${MARKET_MANAGER} respondToUpdateRequest(condition ${call.conditionId}, accept ${call.accept ? "true" : "false"}).`);
        break;
      case "cancel_market":
        lines.push(`${prefix} Market manager ${MARKET_MANAGER} cancelMarket(condition ${call.conditionId}).`);
        break;
      case "withdraw_transfer_remote": {
        const recipientIsOwner = call.recipient.toLowerCase() === `0x${"0".repeat(24)}${owner.slice(2).toLowerCase()}`;
        lines.push(`${prefix} XO route ${XO_WARP_ROUTE} transferRemote(domain ${call.destination} = Base, recipient ${recipientIsOwner ? "your owner address" : "NOT YOUR OWNER"} ${owner}, amount ${usd(call.amount)} USDC.e).`);
        break;
      }
    }
  }
  if (redeems.length > 0) lines.push("Conditions redeemed:", ...conditionLines(redeems));
  return lines;
}

export interface UserOpLinesInput {
  readonly action: UserOpAction;
  readonly owner: Address;
  readonly account: Address;
  // Every call decoded from the bytes that are hashed.
  readonly calls: readonly DecodedCall[];
  readonly deploys: boolean;
  readonly initCodeBytes: number;
  readonly nonce: bigint;
  readonly sponsored: boolean;
  readonly gas: { readonly verificationGasLimit: bigint; readonly callGasLimit: bigint; readonly preVerificationGas: bigint; readonly source: string };
  // ISO second at which the prepared item lapses.
  readonly validUntil: string;
  // `[market title (untrusted): "..."]`, already sanitised, or null.
  readonly titleSlot: string | null;
}

export function userOpSummaryLines(input: UserOpLinesInput): string[] {
  const lines: string[] = [];
  lines.push(`Action: ${ACTION_TITLES[input.action]}.`);
  lines.push(`Owner ${input.owner}; XO smart account ${input.account} (derived from the owner).`);
  lines.push(...describeCalls(input.calls, input.owner, input.titleSlot));
  lines.push(
    input.deploys
      ? `Account: not deployed yet. This operation deploys it through the factory ${KERNEL_FACTORY} (initCode ${input.initCodeBytes} bytes).`
      : "Account: already deployed (no initCode).",
  );
  const lane = Number((input.nonce >> 64n) & 0xffffn);
  lines.push(`Nonce ${input.nonce.toString()} (default lane, key ${lane}, sequence ${(input.nonce & ((1n << 64n) - 1n)).toString()}).`);
  lines.push(
    input.sponsored
      ? `Paymaster: PolicyPaymaster ${POLICY_PAYMASTER} sponsors this operation; fees are zero.`
      : "Paymaster: none. Fees are zero and nothing sponsors this operation.",
  );
  lines.push(`Gas limits: verification ${input.gas.verificationGasLimit}, call ${input.gas.callGasLimit}, preVerification ${input.gas.preVerificationGas} (${input.gas.source}).`);
  // The allowance of an enable-trading operation is read back from its own first call, not from a flag.
  if (input.action === "deploy_enable_trading" || input.action === "enable_trading") {
    const first = input.calls[0];
    if (first?.kind === "usdce_approve") {
      lines.push(
        first.amount >= UINT256_MAX / 2n
          ? "Allowance: unlimited, as XO's own Enable Trading uses (only while the balance is a test amount)."
          : `Allowance: capped at ${usd(first.amount)} USDC.e.`,
      );
    }
  }
  lines.push(`Valid until ${input.validUntil}. The signature is a bearer instrument for this one operation.`);
  return lines;
}

// ---- orders -----------------------------------------------------------------------------------------------

export interface OrderLinesInput {
  readonly side: "BUY" | "SELL";
  readonly shares: string;
  readonly tokenId: string;
  readonly price: string;
  readonly tif: string;
  readonly postOnly: boolean;
  readonly seed: boolean;
  readonly feeBps: number;
  readonly principalAtomic: bigint;
  readonly capAtomic: bigint;
  readonly maxOutlayAtomic: bigint | null;
  readonly minProceedsAtomic: bigint | null;
  // SELL only.
  readonly expectedProceedsAtomic: bigint | null;
  readonly faceValueAtomic: bigint | null;
  readonly expiresAt: string;
  readonly ttlS: number;
  readonly account: Address;
  readonly owner: Address;
  // The order hash (the inner hash) and the wrapped digest the owner signs.
  readonly orderHash: Hex;
  readonly wrappedDigest: Hex;
  readonly conditionId: Hex | null;
}

export function orderSummaryLines(input: OrderLinesInput): string[] {
  const sellLines =
    input.minProceedsAtomic === null
      ? []
      : [
          `No cash leaves the account. Worst-case net proceeds after the ${input.feeBps} bps fee bound: ${usd(input.minProceedsAtomic)} USD.`,
          ...(input.expectedProceedsAtomic === null || input.faceValueAtomic === null
            ? []
            : [`A SELL counts the larger of its expected proceeds (${usd(input.expectedProceedsAtomic)} USD) and its shares at the 1.00 USD face value (${usd(input.faceValueAtomic)} USD).`]),
        ];
  return [
    `Order: ${input.side} ${input.shares} shares of outcome token ${input.tokenId} at ${input.price} per share, type ${input.tif}${input.postOnly ? ", post-only" : ""}${input.seed ? ", creation seed" : ""}.`,
    ...(input.maxOutlayAtomic === null ? sellLines : [`Worst-case cash out including the ${input.feeBps} bps fee bound: ${usd(input.maxOutlayAtomic)} USD (principal ${usd(input.principalAtomic)} USD).`]),
    `Counts ${usd(input.capAtomic)} USD against the per-order and daily caps.`,
    `Expires ${input.expiresAt} (${input.ttlS} s from XO's clock). A cancel does not invalidate the signature on chain; it stays valid until then.`,
    `Maker and signer: account ${input.account}, derived from owner ${input.owner}. Nonce 0, signature type 3.`,
    `Order id (hash) ${input.orderHash}.`,
    ...(input.conditionId === null ? [] : [`Market condition ${input.conditionId}.`]),
    `Compare digest_tag ${digestTag(input.wrappedDigest)} with what PayBox shows.`,
  ];
}

// ---- the XO login -----------------------------------------------------------------------------------------

export interface AuthLinesInput {
  readonly account: Address;
  readonly owner: Address;
  readonly wrapped: boolean;
  readonly ttlS?: number;
}

export function authSummaryLines(input: AuthLinesInput): string[] {
  const ttl = input.ttlS ?? AUTH_PREPARED_TTL_S;
  return [
    "Connect your XO smart account: sign a ClobAuth login. This is not a payment and moves no funds.",
    `Account ${shortAddress(input.account)}, owner ${shortAddress(input.owner)}.`,
    input.wrapped ? "The login is signed through your Kernel smart account (Kernel-wrapped digest)." : "The login is signed as a plain ClobAuth digest (no Kernel wrapper).",
    "The relay uses it to fetch or create your XO API key once, and keeps that key encrypted. It never shows it to anyone.",
    `Sign within ${ttl} seconds: XO accepts the login for about two minutes.`,
    SAFETY_NOTICES.digestTag,
  ];
}
