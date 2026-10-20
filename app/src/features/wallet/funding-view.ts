// Funding steps as DECODED, DISPLAY-ONLY text (docs/dapp-design.md 4.5 Wallet, 7.2 M2: "decoded funding steps for
// display (not yet signable)"; M4-6, M4-7 for the later signable form).
//
// Base USDC reaches an XO account in two Base transactions: approve(router, amount) on Circle USDC, then
// transferRemote(3223, account, amount) on the Hyperlane router. This module builds both with the plugin's own
// calldata code (src/xo/funding/calldata.ts, which derives the recipient from the owner and re-decodes every call),
// then decodes them again into labelled lines. Nothing here signs, sends or hands a call to anything: the screen
// shows what each call would do, with the destination pinned to the derived account.
//
// A mistake in the recipient strands the money for good (a right-padded or zero word has no refund path), so the
// plan refuses instead of guessing, and says "do not send" while the account is not a proven deposit target.

import {
  BASE_CHAIN_ID,
  BASE_USDC,
  BASE_USDC_DECIMALS,
  BASE_WARP_ROUTER,
  HYPERLANE_DOMAIN_XO,
} from "@shared/xo/chain/constants";
import { FundingCalldataError, buildFundingCalls, decodeFundingCall, parseFundingAmount, type DecodedFundingCall } from "@shared/xo/funding/calldata";
import { nextFundingStep, type StepDecision } from "@shared/xo/funding/steps";

import type { DepositDecision } from "../../core/account";
import { atomicText } from "./balances";

export interface FundingLine {
  readonly label: string;
  // Full address or number: never shortened on a funding step.
  readonly value: string;
}

export interface DecodedStep {
  readonly kind: "approve" | "transfer";
  readonly title: string;
  readonly chain: string;
  // The contract the call goes to.
  readonly to: string;
  readonly value: string;
  readonly lines: readonly FundingLine[];
  readonly decoded: DecodedFundingCall;
}

export interface FundingInputs {
  readonly owner: string;
  // Decimal USD text, parsed with exact integer math (no signs, exponents or more than 6 places).
  readonly amountText: string;
  // Reads from Base; null = not read. They only choose which step is next, never what a call contains.
  readonly baseUsdcBalance: bigint | null;
  readonly allowance: bigint | null;
  readonly xoBalance: bigint | null;
  readonly xoBalanceBefore: bigint | null;
  // Whether the derived XO account is a proven deposit target (core/account.ts depositDecision on the XO row).
  readonly deposit: DepositDecision | null;
}

export type FundingPlan =
  | { readonly ok: false; readonly code: string; readonly message: string }
  | {
      readonly ok: true;
      readonly owner: string;
      readonly account: string;
      readonly amountAtomic: bigint;
      readonly amountText: string;
      readonly steps: readonly [DecodedStep, DecodedStep];
      // null when a Base read is missing: the next step is then unknown, not guessed.
      readonly next: StepDecision | null;
      readonly blockers: readonly string[];
      readonly sendable: false;
    };

function describe(decoded: DecodedFundingCall, call: { kind: "approve" | "transfer"; chain: string; to: string; value: string }): DecodedStep {
  const amount = `${atomicText(decoded.amount, BASE_USDC_DECIMALS, 6)} USDC`;
  if (decoded.kind === "approve") {
    return {
      kind: "approve",
      title: "Step 1: approve the exact amount",
      chain: call.chain,
      to: call.to,
      value: call.value,
      decoded,
      lines: [
        { label: "Contract", value: `${call.to} (Circle USDC on Base)` },
        { label: "Function", value: "approve(spender, amount)" },
        { label: "Spender", value: `${decoded.spender} (Hyperlane router)` },
        { label: "Amount", value: amount },
        { label: "Native value sent", value: call.value },
      ],
    };
  }
  return {
    kind: "transfer",
    title: "Step 2: send to your XO account",
    chain: call.chain,
    to: call.to,
    value: call.value,
    decoded,
    lines: [
      { label: "Contract", value: `${call.to} (Hyperlane router on Base)` },
      { label: "Function", value: "transferRemote(destination, recipient, amount)" },
      { label: "Destination", value: `domain ${decoded.destination} (XO)` },
      { label: "Recipient", value: decoded.recipient === null ? "invalid recipient word: do not send" : `${decoded.recipient} (your derived XO account)` },
      { label: "Amount", value: amount },
      { label: "Native value sent", value: call.value },
    ],
  };
}

export function planFunding(input: FundingInputs): FundingPlan {
  const amount = parseFundingAmount(input.amountText);
  if (!amount.ok) return { ok: false, code: amount.code, message: amount.reason };
  let built;
  try {
    built = buildFundingCalls({ owner: input.owner, amount: amount.value });
  } catch (error) {
    if (error instanceof FundingCalldataError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: "bad_calldata", message: "The funding calls could not be built." };
  }
  // Decode what was built, once more, so the lines show what the bytes say and not what the builder meant.
  const approve = describe(decodeFundingCall(built.approve), built.approve);
  const transfer = describe(decodeFundingCall(built.transfer), built.transfer);

  const blockers: string[] = [];
  if (input.deposit === null) blockers.push("The XO account has not been checked on chain 3223 yet.");
  else if (!input.deposit.allowed) blockers.push(...input.deposit.reasons);

  const readsKnown = input.baseUsdcBalance !== null && input.allowance !== null;
  const next = readsKnown
    ? nextFundingStep({
        amount: amount.value,
        allowance: input.allowance as bigint,
        baseBalance: input.baseUsdcBalance as bigint,
        xoBalance: input.xoBalance,
        xoBalanceBefore: input.xoBalanceBefore,
      })
    : null;

  return { ok: true, owner: built.owner, account: built.account, amountAtomic: amount.value, amountText: input.amountText, steps: [approve, transfer], next, blockers, sendable: false };
}

// Pinned facts the screen prints next to the steps, so they can be compared with what the user sees elsewhere.
export const FUNDING_FACTS = Object.freeze({
  chain: `eip155:${BASE_CHAIN_ID}`,
  token: BASE_USDC,
  router: BASE_WARP_ROUTER,
  destinationDomain: HYPERLANE_DOMAIN_XO,
});
