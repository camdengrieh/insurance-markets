// Following a Base-to-XO transfer after it was sent (docs/phase1-gap-closing.md FU5, N4, A5 and A6;
// docs/research/20 sec 6 and 12).
//
// A transferRemote on Base emits SentTransferRemote and, through the Mailbox, DispatchId(messageId).
// Hyperlane delivers it to XO in 14 s at the median and 27 s at the worst of 253 samples; the XO route
// then mints USDC.e to the recipient. This module turns what can be observed into one state:
//
//   not_found                 the Base receipt is not available (not mined yet, or unreadable)
//   base_failed               the Base transaction reverted: nothing was sent
//   unrecognised              the receipt is not one transferRemote to this account for this amount
//   dispatched                sent on Base, not yet delivered
//   delivered                 Mailbox.delivered(messageId) on XO is true, the credit is not seen (yet)
//   credited                  the account's XO balance rose by at least the amount since the baseline
//   dispatched_not_delivered  10 minutes after dispatch and still no delivery: pending, NEVER resend
//   delivered_not_credited    delivered, 10 minutes passed, and the balance did not rise (FU6 failed)
//
// The rules that matter:
//   - Nothing here ever advises a resend. A second transferRemote moves a second amount; a stuck message
//     may never be delivered (nobody outside XO is known to be able to deliver it: process() needs
//     native XO that outsiders lack, note 20 sec 4.1), and the money is not returned to the sender.
//   - "Not credited" is only claimed when a baseline balance exists and was read. Without one the state
//     stops at `delivered` and says the credit could not be checked.
//   - The explorer's log index is never evidence of a NON-delivery (absence proves nothing); a delivery
//     read that failed is `null`, not `false`.
//
// Pure functions plus a poller whose reader, clock and sleep are injected. No Node-only import.

import { getAbiItem, toEventSelector } from "viem";

import { WARP_ROUTER_ABI } from "../chain/abi.js";
import {
  BASE_WARP_ROUTER,
  DELIVERY_POLL_TIMEOUT_S,
  DISPATCH_ID_TOPIC,
  HYPERLANE_DOMAIN_XO,
  HYPERLANE_MAILBOX,
  type Address,
  type Hex,
} from "../chain/constants.js";
import { padRecipient } from "./calldata.js";
import type { BaseReceipt } from "./preflight.js";

// SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId), computed
// from the ABI fragment so it cannot be mistyped (test/funding-delivery.test.ts compares it with cast).
export const SENT_TRANSFER_REMOTE_TOPIC: Hex = toEventSelector(getAbiItem({ abi: WARP_ROUTER_ABI, name: "SentTransferRemote" }));

export const DELIVERY_TIMEOUT_S = DELIVERY_POLL_TIMEOUT_S;

export const DELIVERY_STATES = [
  "not_found",
  "base_failed",
  "unrecognised",
  "dispatched",
  "delivered",
  "credited",
  "dispatched_not_delivered",
  "delivered_not_credited",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

// States that no further reading will change.
export const TERMINAL_DELIVERY_STATES: ReadonlySet<DeliveryState> = new Set<DeliveryState>([
  "base_failed",
  "unrecognised",
  "credited",
  "dispatched_not_delivered",
  "delivered_not_credited",
]);

// ---- reading the Base receipt -------------------------------------------------------------------------

export type DispatchRejection = "reverted" | "no_matching_transfer" | "ambiguous_transfer" | "no_dispatch_id" | "ambiguous_dispatch";

export type DispatchExtraction =
  | { readonly ok: true; readonly messageId: Hex; readonly blockNumber: bigint }
  | { readonly ok: false; readonly reason: DispatchRejection };

function uint32Topic(topic: string | undefined): number | null {
  if (topic === undefined || !/^0x[0-9a-f]{64}$/.test(topic)) return null;
  const value = BigInt(topic);
  return value <= 0xffffffffn ? Number(value) : null;
}

// Finds the one SentTransferRemote from the pinned router for this account and amount, and the one
// DispatchId from the pinned Mailbox in the same transaction. Logs are matched by emitter address, which
// a third contract cannot forge. A transaction with two transfers or two dispatches is `ambiguous`: the
// message id could belong to the other one.
export function extractFundingDispatch(receipt: BaseReceipt, expected: { readonly account: string; readonly amount: bigint }): DispatchExtraction {
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };
  const recipientWord = padRecipient(expected.account);
  const transfers = receipt.logs.filter((log) => {
    if (log.address.toLowerCase() !== BASE_WARP_ROUTER.toLowerCase()) return false;
    if (log.topics.length !== 3 || log.topics[0] !== SENT_TRANSFER_REMOTE_TOPIC) return false;
    if (uint32Topic(log.topics[1]) !== HYPERLANE_DOMAIN_XO) return false;
    if (log.topics[2] !== recipientWord) return false;
    return /^0x[0-9a-f]{64}$/.test(log.data) && BigInt(log.data) === expected.amount;
  });
  if (transfers.length === 0) return { ok: false, reason: "no_matching_transfer" };
  if (transfers.length > 1) return { ok: false, reason: "ambiguous_transfer" };
  const dispatches = receipt.logs.filter(
    (log) => log.address.toLowerCase() === HYPERLANE_MAILBOX.toLowerCase() && log.topics.length === 2 && log.topics[0] === DISPATCH_ID_TOPIC,
  );
  if (dispatches.length === 0) return { ok: false, reason: "no_dispatch_id" };
  if (dispatches.length > 1) return { ok: false, reason: "ambiguous_dispatch" };
  const messageId = dispatches[0]?.topics[1];
  if (messageId === undefined) return { ok: false, reason: "no_dispatch_id" };
  return { ok: true, messageId, blockNumber: receipt.blockNumber };
}

// ---- classification -------------------------------------------------------------------------------------

export type CreditSeen = "yes" | "no" | "unknown";

export interface DeliveryObservation {
  // Whole seconds since the Base block that carried the dispatch; 0 when that time is not known.
  readonly ageS: number;
  // Mailbox.delivered(messageId) on XO: true, false, or null when it could not be read.
  readonly delivered: boolean | null;
  readonly amount: bigint;
  // The account's XO balance now and before this funding; null when not read or no baseline.
  readonly xoBalance: bigint | null;
  readonly xoBalanceBefore: bigint | null;
  // Defaults to DELIVERY_TIMEOUT_S.
  readonly timeoutS?: number;
}

export interface DeliveryDecision {
  readonly state: Extract<DeliveryState, "dispatched" | "delivered" | "credited" | "dispatched_not_delivered" | "delivered_not_credited">;
  readonly timedOut: boolean;
  readonly credit: CreditSeen;
  // Seconds until the next useful look, or null when the state is final.
  readonly nextCheckInS: number | null;
  // Fixed text, safe to show.
  readonly message: string;
}

// How long to wait before looking again: the typical delivery is under 30 s, so look often at first.
export function recommendedPollDelayS(ageS: number, timeoutS: number = DELIVERY_TIMEOUT_S): number {
  const delay = ageS < 60 ? 15 : ageS < 300 ? 30 : 60;
  const remaining = Math.max(1, timeoutS - ageS);
  return Math.min(delay, remaining);
}

export function classifyDelivery(observation: DeliveryObservation): DeliveryDecision {
  const timeoutS = observation.timeoutS ?? DELIVERY_TIMEOUT_S;
  const age = Number.isFinite(observation.ageS) && observation.ageS > 0 ? Math.floor(observation.ageS) : 0;
  const timedOut = age >= timeoutS;
  const { xoBalance, xoBalanceBefore, amount, delivered } = observation;
  const rise = xoBalance !== null && xoBalanceBefore !== null ? xoBalance - xoBalanceBefore : null;
  const credit: CreditSeen = rise === null ? "unknown" : rise >= amount ? "yes" : "no";

  // A balance that rose while Mailbox.delivered says the message has NOT been delivered is somebody
  // else's money (or a lagging read): it is not this funding's credit.
  if (credit === "yes" && delivered !== false) {
    return { state: "credited", timedOut, credit, nextCheckInS: null, message: "The XO account balance has risen by the funded amount: the transfer arrived and is credited." };
  }
  if (delivered === true) {
    if (credit === "no" && timedOut) {
      return {
        state: "delivered_not_credited",
        timedOut,
        credit,
        nextCheckInS: null,
        message:
          "The message was delivered on XO, but the account balance has not risen after 10 minutes. Do not send again. Whether the XO orderbook credits a balance minted straight to the account is exactly what the first small deposit tests; record this result.",
      };
    }
    return {
      state: "delivered",
      timedOut,
      credit,
      nextCheckInS: recommendedPollDelayS(age, timeoutS),
      message:
        credit === "unknown"
          ? "The message was delivered on XO. The credit could not be checked without a baseline balance from before the funding."
          : "The message was delivered on XO; the balance has not risen yet.",
    };
  }
  if (timedOut) {
    return {
      state: "dispatched_not_delivered",
      timedOut,
      credit,
      nextCheckInS: null,
      message:
        delivered === null
          ? "10 minutes after dispatch delivery could not be confirmed (the XO side could not be read). The transfer is pending; do not send again."
          : "10 minutes after dispatch the message is still not delivered on XO. The transfer is pending; do not send again. It may be delivered later, or never: nobody outside XO is known to be able to deliver it.",
    };
  }
  return {
    state: "dispatched",
    timedOut,
    credit,
    nextCheckInS: recommendedPollDelayS(age, timeoutS),
    message: "The transfer was sent on Base and the message is in flight. XO's own deposits arrive in under 30 seconds; a direct transfer like this one has not been observed by anyone yet.",
  };
}

// ---- the report, built from a reader --------------------------------------------------------------------

// What the monitor needs from the outside. Every method may throw; the monitor records a note and treats
// the answer as unknown. isDelivered returns null when it cannot say (never false from absence of a log).
export interface DeliveryReader {
  getReceipt(txHash: Hex): Promise<BaseReceipt | null>;
  getBlockTimestamp(blockNumber: bigint): Promise<bigint | null>;
  isDelivered(messageId: Hex): Promise<boolean | null>;
  getXoBalance(account: Address): Promise<bigint | null>;
}

export interface DeliveryReport {
  readonly state: DeliveryState;
  readonly terminal: boolean;
  readonly messageId: Hex | null;
  readonly blockNumber: bigint | null;
  readonly dispatchedAtS: number | null;
  readonly ageS: number | null;
  readonly timeoutS: number;
  readonly delivered: boolean | null;
  readonly credit: CreditSeen;
  readonly xoBalance: bigint | null;
  readonly xoBalanceBefore: bigint | null;
  readonly nextCheckInS: number | null;
  // Always "never": a stuck or slow transfer is waited for, not repeated.
  readonly resend: "never";
  readonly message: string;
  // Fixed labels such as "isDelivered:failed".
  readonly notes: readonly string[];
}

export interface DeliveryClock {
  readonly nowMs: () => number;
}

export interface DeliveryRequest {
  readonly txHash: Hex;
  readonly account: Address;
  readonly amount: bigint;
  readonly xoBalanceBefore: bigint | null;
}

function early(state: DeliveryState, message: string, request: DeliveryRequest, notes: readonly string[]): DeliveryReport {
  return {
    state,
    terminal: TERMINAL_DELIVERY_STATES.has(state),
    messageId: null,
    blockNumber: null,
    dispatchedAtS: null,
    ageS: null,
    timeoutS: DELIVERY_TIMEOUT_S,
    delivered: null,
    credit: "unknown",
    xoBalance: null,
    xoBalanceBefore: request.xoBalanceBefore,
    nextCheckInS: state === "not_found" ? 15 : null,
    resend: "never",
    message,
    notes,
  };
}

// Runs one read; a failure is a note and an unknown, never a throw.
async function settle<T>(run: () => Promise<T | null>, label: string, notes: string[]): Promise<T | null> {
  try {
    return await run();
  } catch {
    notes.push(`${label}:unreadable`);
    return null;
  }
}

// One look at a funding: the receipt, then (for a recognised transfer) the block time, the delivery flag and
// the balance, read together.
export async function checkDelivery(deps: DeliveryClock & { readonly reader: DeliveryReader }, request: DeliveryRequest): Promise<DeliveryReport> {
  const notes: string[] = [];
  let receipt: BaseReceipt | null = null;
  try {
    receipt = await deps.reader.getReceipt(request.txHash);
  } catch {
    notes.push("receipt:unreadable");
  }
  if (receipt === null) {
    return early("not_found", "The Base transaction has no receipt yet (it may still be pending), or the Base RPC could not be read. Nothing is known about it.", request, notes);
  }
  if (receipt.status !== "success") {
    return early("base_failed", "The Base transaction reverted, so nothing was sent. The approval, if any, is still in place.", request, notes);
  }
  const extracted = extractFundingDispatch(receipt, { account: request.account, amount: request.amount });
  if (!extracted.ok) {
    return early(
      "unrecognised",
      "That transaction is not exactly one transferRemote from the XO router to this account for this amount, so it cannot be followed as this funding.",
      request,
      [...notes, `dispatch:${extracted.reason}`],
    );
  }

  // The block time, the delivery flag and the balance do not depend on one another: read them together.
  const [stampResult, delivered, xoBalance] = await Promise.all([
    settle(() => deps.reader.getBlockTimestamp(extracted.blockNumber), "blockTimestamp", notes),
    settle(() => deps.reader.isDelivered(extracted.messageId), "isDelivered", notes),
    settle(() => deps.reader.getXoBalance(request.account), "xoBalance", notes),
  ]);
  let dispatchedAtS: number | null = null;
  if (stampResult === null) {
    if (!notes.includes("blockTimestamp:unreadable")) notes.push("blockTimestamp:unavailable");
  } else if (stampResult <= BigInt(Number.MAX_SAFE_INTEGER)) dispatchedAtS = Number(stampResult);
  else notes.push("blockTimestamp:unavailable");
  const nowS = Math.floor(deps.nowMs() / 1000);
  // A clock that is behind the chain gives an age of 0, never a negative one.
  const ageS = dispatchedAtS === null ? null : Math.max(0, nowS - dispatchedAtS);

  const decision = classifyDelivery({
    ageS: ageS ?? 0,
    delivered,
    amount: request.amount,
    xoBalance,
    xoBalanceBefore: request.xoBalanceBefore,
  });
  return {
    state: decision.state,
    terminal: TERMINAL_DELIVERY_STATES.has(decision.state),
    messageId: extracted.messageId,
    blockNumber: extracted.blockNumber,
    dispatchedAtS,
    ageS,
    timeoutS: DELIVERY_TIMEOUT_S,
    delivered,
    credit: decision.credit,
    xoBalance,
    xoBalanceBefore: request.xoBalanceBefore,
    nextCheckInS: decision.nextCheckInS,
    resend: "never",
    message: ageS === null ? `${decision.message} (The age of the dispatch is unknown, so no timeout is applied.)` : decision.message,
    notes,
  };
}

export interface PollDeps extends DeliveryClock {
  readonly reader: DeliveryReader;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface PollOptions {
  // Stop after this much wall time (by deps.nowMs). Default DELIVERY_TIMEOUT_S.
  readonly timeoutS?: number;
  // A guard against a reader that never reaches a final state. Default 200.
  readonly maxPolls?: number;
}

// Looks repeatedly until a final state, the time limit or the poll limit. Only the plugin tool's single
// look (checkDelivery) fits a 10 second call; this is for a long-running host such as the relay.
export async function pollDelivery(deps: PollDeps, request: DeliveryRequest, options: PollOptions = {}): Promise<DeliveryReport & { readonly polls: number }> {
  const timeoutS = options.timeoutS ?? DELIVERY_TIMEOUT_S;
  const maxPolls = options.maxPolls ?? 200;
  const startMs = deps.nowMs();
  let polls = 0;
  for (;;) {
    const report = await checkDelivery(deps, request);
    polls += 1;
    if (report.terminal) return { ...report, polls };
    const elapsedS = (deps.nowMs() - startMs) / 1000;
    if (elapsedS >= timeoutS || polls >= maxPolls) return { ...report, polls };
    const waitS = Math.min(report.nextCheckInS ?? 15, Math.max(1, timeoutS - elapsedS));
    await deps.sleep(Math.round(waitS * 1000));
  }
}
