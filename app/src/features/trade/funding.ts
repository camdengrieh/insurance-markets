// Funding steps as signable transaction intents for the agent (docs/dapp-design.md 7.2 M4 "funding steps", M4-6).
//
// Base USDC reaches an XO account in two Base transactions: an exact-amount approve to the Hyperlane router, then
// transferRemote(3223, account, amount) on that router. xo_fund_account returns ONE PayBox transaction proposal per
// call (the next missing step, decided from its own reads of Base). This module checks that proposal before the
// screen shows it as an intent:
//
//   - the page builds both calls itself from the owner and the amount (the recipient is derived, never typed);
//   - the proposal must be exactly one of them, byte for byte, on Base with value 0;
//   - the destination is fixed: the transfer's recipient word is the left-padded account derived from the owner,
//     the destination domain is XO (3223), the approve's spender is the router (verifyFundingCall).
//
// Anything else is refused with a fixed sentence and renders nothing. The page never signs and never sends: the
// intent is text for the agent, who asks PayBox, and PayBox asks the human.

import * as z from "zod/v4";

import { FundingCalldataError, buildFundingCalls, decodeFundingData, parseFundingAmount, verifyFundingCall, type FundingCallKind } from "@shared/xo/funding/calldata";
import { BASE_USDC, BASE_USDC_DECIMALS, BASE_WARP_ROUTER, HYPERLANE_DOMAIN_XO } from "@shared/xo/chain/constants";
import { formatAtomic } from "@shared/guardrails/amount";

export const PROPOSAL_KEY = "io.paybox/transactionProposal";

const proposalSchema = z
  .object({
    [PROPOSAL_KEY]: z
      .object({
        version: z.literal("1"),
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
        kind: z.literal("evm"),
        chain: z.string().regex(/^eip155:(0|[1-9][0-9]*)$/),
        transaction: z
          .object({
            to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
            value: z.string().regex(/^(0|[1-9][0-9]{0,77})$/),
            data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type FundingFailureCode =
  | "schema"
  | "bad_owner"
  | "bad_amount"
  | "expired"
  | "wrong_chain"
  | "bad_calldata"
  | "wrong_target"
  | "wrong_value"
  | "wrong_spender"
  | "wrong_destination"
  | "wrong_recipient"
  | "wrong_amount"
  | "not_the_expected_call";

export interface FundingFailure {
  readonly ok: false;
  readonly code: FundingFailureCode;
  readonly reason: string;
}

export interface FundingLine {
  readonly label: string;
  readonly value: string;
}

export interface FundingIntent {
  readonly ok: true;
  readonly step: FundingCallKind;
  readonly title: string;
  readonly chain: string;
  readonly to: string;
  readonly value: string;
  // The calldata, shown whole so a human can compare it with what PayBox displays.
  readonly data: string;
  readonly expiresAt: string;
  readonly expiresAtMs: number;
  readonly owner: string;
  // The account derived from the owner: where the money goes. Never taken from the answer.
  readonly account: string;
  readonly amountText: string;
  readonly lines: readonly FundingLine[];
}

export type FundingVerdict = FundingIntent | FundingFailure;

const REASONS: Readonly<Record<FundingFailureCode, string>> = Object.freeze({
  schema: "The funding answer is not a single PayBox transaction proposal.",
  bad_owner: "The owner address cannot own an XO account.",
  bad_amount: "The amount is not a plain USDC amount with up to six places.",
  expired: "The proposal is out of time. Ask for the next step again.",
  wrong_chain: "The proposal is not on Base.",
  bad_calldata: "The proposal's call data is neither an approve nor a transferRemote in canonical form.",
  wrong_target: "The proposal goes to a contract other than Circle USDC or the Hyperlane router.",
  wrong_value: "The proposal sends native value, which a funding call never does.",
  wrong_spender: "The approval names a spender other than the Hyperlane router.",
  wrong_destination: "The transfer does not go to XO.",
  wrong_recipient: "The transfer's recipient is not the account derived from the owner.",
  wrong_amount: "The proposal's amount differs from the amount asked for.",
  not_the_expected_call: "The proposal is not one of the two calls this page builds itself.",
});

function failure(code: FundingFailureCode): FundingFailure {
  return { ok: false, code, reason: REASONS[code] };
}

function codeOfCalldataError(error: FundingCalldataError): FundingFailureCode {
  switch (error.code) {
    case "wrong_chain":
      return "wrong_chain";
    case "value_not_zero":
      return "wrong_value";
    case "wrong_target":
      return "wrong_target";
    case "wrong_spender":
      return "wrong_spender";
    case "wrong_destination":
      return "wrong_destination";
    case "wrong_recipient":
    case "bad_padding":
    case "recipient_not_derived":
    case "recipient_is_owner":
    case "zero_recipient":
    case "recipient_protocol_contract":
      return "wrong_recipient";
    case "wrong_amount":
      return "wrong_amount";
    case "invalid_owner":
    case "invalid_account":
      return "bad_owner";
    case "invalid_amount":
    case "amount_too_large":
      return "bad_amount";
    default:
      return "bad_calldata";
  }
}

// Checks the structured answer of xo_fund_account against the owner and amount the page asked for.
export function vetFundingProposal(structured: unknown, input: { readonly owner: string; readonly amountText: string; readonly nowMs: number }): FundingVerdict {
  const amount = parseFundingAmount(input.amountText);
  if (!amount.ok) return failure("bad_amount");
  let built;
  try {
    built = buildFundingCalls({ owner: input.owner, amount: amount.value });
  } catch (error) {
    if (error instanceof FundingCalldataError) return failure(codeOfCalldataError(error));
    throw error;
  }
  const parsed = proposalSchema.safeParse(structured);
  if (!parsed.success) return failure("schema");
  const proposal = parsed.data[PROPOSAL_KEY];
  const expiresAtMs = Date.parse(proposal.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= input.nowMs) return failure("expired");
  let decoded;
  try {
    decoded = decodeFundingData(proposal.transaction.data);
  } catch (error) {
    if (error instanceof FundingCalldataError) return failure("bad_calldata");
    throw error;
  }
  const step: FundingCallKind = decoded.kind;
  const call = { kind: step, chain: proposal.chain, to: proposal.transaction.to as `0x${string}`, value: proposal.transaction.value, data: proposal.transaction.data as `0x${string}` };
  try {
    verifyFundingCall(call, { owner: built.owner, account: built.account, amount: built.amount });
  } catch (error) {
    if (error instanceof FundingCalldataError) return failure(codeOfCalldataError(error));
    throw error;
  }
  // Byte for byte the call the page built itself.
  const mine = step === "approve" ? built.approve : built.transfer;
  if (mine.data.toLowerCase() !== call.data.toLowerCase() || mine.to.toLowerCase() !== call.to.toLowerCase() || mine.chain !== call.chain || mine.value !== call.value) return failure("not_the_expected_call");

  const amountText = `${formatAtomic(built.amount, BASE_USDC_DECIMALS)} USDC`;
  const lines: FundingLine[] =
    decoded.kind === "approve"
      ? [
          { label: "Chain", value: "Base (eip155:8453)" },
          { label: "Contract", value: `${BASE_USDC} (Circle USDC)` },
          { label: "Function", value: "approve(spender, amount)" },
          { label: "Spender", value: `${BASE_WARP_ROUTER} (Hyperlane router)` },
          { label: "Amount", value: amountText },
          { label: "Native value sent", value: "0" },
        ]
      : [
          { label: "Chain", value: "Base (eip155:8453)" },
          { label: "Contract", value: `${BASE_WARP_ROUTER} (Hyperlane router)` },
          { label: "Function", value: "transferRemote(destination, recipient, amount)" },
          { label: "Destination", value: `domain ${HYPERLANE_DOMAIN_XO} (XO)` },
          { label: "Recipient", value: `${built.account} (your XO account, derived from your owner address)` },
          { label: "Amount", value: amountText },
          { label: "Native value sent", value: "0" },
        ];
  return {
    ok: true,
    step,
    title: step === "approve" ? "Step 1 of 2: approve the exact amount" : "Step 2 of 2: send it to your XO account",
    chain: call.chain,
    to: call.to,
    value: call.value,
    data: call.data,
    expiresAt: proposal.expiresAt,
    expiresAtMs,
    owner: built.owner,
    account: built.account,
    amountText,
    lines,
  };
}
