import { decodeFunctionResult, encodeFunctionData, getAbiItem, toEventSelector } from "viem";
import * as z from "zod/v4";

import { parseDecimalAtomic } from "../src/guardrails/amount.js";
import type { PostRequestParsed, PostResponseInput } from "../src/relay/contract.js";
import { MAILBOX_ABI, WARP_ROUTER_ABI } from "../src/xo/chain/abi.js";
import { DELIVERY_POLL_TIMEOUT_S, HYPERLANE_MAILBOX, PROCESS_ID_TOPIC, USDC_E_DECIMALS, XO_WARP_ROUTE, type Address, type Hex } from "../src/xo/chain/constants.js";
import { ChainReadError } from "../src/xo/chain/reads.js";
import { gateFunding, type AccountStateResult } from "../src/xo/account/state.js";
import { padRecipient } from "../src/xo/funding/calldata.js";
import { checkDelivery, type DeliveryReader, type DeliveryReport } from "../src/xo/funding/delivery.js";
import { BaseRpc, checkFundingAmount, DEFAULT_BASE_RPC_URL, FUNDING_CREDIT_FACT, FUNDING_DELIVERY_FACT, type FactState } from "../src/xo/funding/preflight.js";
import { RelayError } from "../src/relay/errors.js";
import { isoSecondOf } from "./audit.js";
import { guardWrite } from "./capabilities.js";
import { randomHex } from "./crypto.js";
import { ledgerLimitsFrom, type AbsenceVerdict, type ReservationView } from "./ledger.js";
import type { PostHandler, RelayContext, RouteTable } from "./types.js";
import { accountState, assertNotKilled, checkSuppliedAccount, jsonRpcTransportFor, learn, parseOwnerOrRefuse, usd, useropEnv, type UserOpEnv } from "./userops.js";
import { deriveAccount } from "../src/xo/account/derive.js";

// POST /v1/funding/check and POST /v1/funding/report
// (docs/phase1-gap-closing.md 3.4 FU1 to FU9, 4 N4 and N5, 8 D3, 9 A5, A6, A10, A11; notes 19 and 20).
//
// The relay never sends a funding transaction: the plugin builds two PayBox proposals on Base and the owner
// signs them. The relay's part is the money brake and the follow-up.
//
// CHECK reserves the amount against the funding counter (separate from the spend counter) and says yes or no:
//   - positive proof that the XO account is deployed (AccountDeployed or OwnerRegistered logs, or the node's
//     eth_getCode). USDC.e minted to an undeployed account can only move by a UserOp that needs the bundler,
//     so funding waits for proof; "two negatives" never relaxes this (A11);
//   - a per-funding test amount ($3) until the deposit leg has been SEEN to deliver (FU7) and to credit (FU6),
//     a ceiling of $50 per funding, and a lifetime total of $10 until the exit is proven (FU9, decision D3),
//     then a separate $50 per day; all from the ledger, which a restart cannot reset;
//   - idempotent: the plugin calls check once per proposal (approve, then transfer). While a reservation for the
//     same account and amount is open and unreported the same funding_id comes back and nothing more is reserved;
//   - one funding at a time per account: while an earlier one is reported, in flight or stuck, a new one is refused.
//
// REPORT takes the Base transaction hash. The relay reads the receipt, finds the one SentTransferRemote and the
// one DispatchId, and follows the message: dispatched, delivered, credited, and after 10 minutes
// dispatched_not_delivered or delivered_not_credited. It NEVER advises or performs a resend: a second transfer
// moves a second amount and a stuck message may never be delivered (nobody outside XO is known to be able to deliver it). What it observes becomes capability
// facts (FU7 delivery, FU6 credit), which are what lift the test amount.
//
// A reservation that was never reported is given back only after its expiry, a 10 minute grace, and a complete
// read of the XO route's ReceivedTransferRemote logs that shows no such transfer (ledger evidence `no_report`).

export const FUNDING_FLAG = "ENABLE_FUNDING" as const;
const FUNDING_NS = "funding";
// The plugin hands out two proposals, five minutes each, with the owner's approval in between.
export const FUNDING_RESERVATION_TTL_S = 1800;
const DELIVERY_GRACE_MS = DELIVERY_POLL_TIMEOUT_S * 1000;
// A look at an in-flight funding is repeated at most this often per record.
const REFRESH_MIN_GAP_MS = 10_000;
const MAX_REFRESH_PER_CHECK = 3;
// A check reads the XO route for at most this many abandoned reservations, and an account may hold at most this many
// open unreported ones: a loop of tiny checks can neither pin the whole cap nor make every call slow.
export const SWEEP_BUDGET = 5;
export const MAX_OPEN_FUNDINGS = 5;
const RECORD_RETENTION_MS = 90 * 86_400_000;
// A transfer sent more than this before the funding was checked cannot be that funding (Base block times and
// the relay's clock differ by seconds, not minutes).
const STALE_TRANSFER_TOLERANCE_MS = 60_000;

const RECEIVED_TRANSFER_REMOTE_TOPIC = toEventSelector(getAbiItem({ abi: WARP_ROUTER_ABI, name: "ReceivedTransferRemote" }));

export const FUNDING_RECORD_STATES = ["checked", "reported", "dispatched", "delivered", "credited", "dispatched_not_delivered", "delivered_not_credited", "failed", "unknown"] as const;

const recordSchema = z
  .object({
    v: z.literal(1),
    id: z.string().regex(/^[0-9a-f]{32}$/),
    owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    account: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    amount: z.string().regex(/^[0-9]{1,30}$/),
    createdAtMs: z.number().int(),
    expiresAtMs: z.number().int(),
    state: z.enum(FUNDING_RECORD_STATES),
    // The Base transaction this funding is bound to (set once a receipt shows exactly one matching transfer).
    txHash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable(),
    // The last hash an agent reported that is NOT bound (no receipt yet, reverted, or not this transfer).
    lastTxHash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable(),
    // A reported transaction whose receipt says it reverted: nothing was sent.
    revertedTxHash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable(),
    messageId: z.string().regex(/^0x[0-9a-f]{64}$/).nullable(),
    dispatchedAtMs: z.number().int().nullable(),
    // The orderbook-credited balance before this funding, when it could be read.
    baseline: z.string().regex(/^[0-9]{1,30}$/).nullable(),
    lastFollowedAtMs: z.number().int().nullable(),
    committed: z.boolean(),
    // The transfer proposal for this reservation has been handed out (once, ever).
    transferIssued: z.boolean().default(false),
    detail: z.string().max(200).nullable(),
  })
  .strict();
type FundingRecord = z.infer<typeof recordSchema>;

function readRecord(env: UserOpEnv, id: string): FundingRecord | undefined {
  const stored = env.state.get(FUNDING_NS, id);
  if (stored === undefined) return undefined;
  const parsed = recordSchema.safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}

function allRecords(env: UserOpEnv, account?: Address): FundingRecord[] {
  const out: FundingRecord[] = [];
  for (const [, stored] of env.state.list(FUNDING_NS)) {
    const parsed = recordSchema.safeParse(stored);
    if (parsed.success && (account === undefined || parsed.data.account.toLowerCase() === account.toLowerCase())) out.push(parsed.data);
  }
  return out.sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
}

async function saveRecord(env: UserOpEnv, record: FundingRecord): Promise<void> {
  await env.state.set(FUNDING_NS, record.id, record);
}

function factOf(env: UserOpEnv, id: string): FactState {
  return env.capabilities.state(id);
}

// ---- what may lift the test amount (review finding FS-3) ----------------------------------------------------------------------
//
// FU7 (delivery) and FU6 (credit) are written by this relay's own probe whenever it sees a transfer an agent reported
// reach XO. That is evidence for the operator, not a permission: an agent that can report a hash can steer what the
// probe sees. The $3 test amount and the $10 lifetime total are therefore lifted only by a fact the OPERATOR recorded
// (source "operator", which is how the live-test kit's T3a result and `facts.ts record` write):
//   - T3a = yes recorded by the operator (the kit's deposit test), with FU7 and FU6 yes from either source; or
//   - FU7 and FU6 both recorded yes by the operator;
// and the lifetime total additionally needs FU9 (the exit) yes, which only an operator can write as yes. A probe-learned
// "no" still blocks. Nothing here lowers a limit the ledger already applies; it only withholds a lift.
function operatorYes(env: UserOpEnv, id: string): boolean {
  const fact = env.capabilities.fact(id);
  return fact !== undefined && fact.state === "yes" && fact.source === "operator";
}

export function liftConfirmed(env: UserOpEnv): boolean {
  return operatorYes(env, "T3a") || (operatorYes(env, FUNDING_DELIVERY_FACT) && operatorYes(env, FUNDING_CREDIT_FACT));
}

// The delivery and credit facts as the amount policy may count them: a "yes" nobody on the operator side confirmed is "unknown".
function effectiveFact(env: UserOpEnv, id: string): FactState {
  const state = factOf(env, id);
  return state === "yes" && !liftConfirmed(env) ? "unknown" : state;
}

function lifetimeCapApplies(env: UserOpEnv): boolean {
  return !(liftConfirmed(env) && factOf(env, FUNDING_DELIVERY_FACT) === "yes" && factOf(env, FUNDING_CREDIT_FACT) === "yes" && factOf(env, "FU9") === "yes");
}

// The relay's answer shows the three deployment states; "unknown" is not one of them, so an unreadable
// deployment is an error, never a guess.
function deploymentState(result: AccountStateResult): "undeployed" | "deployed_unregistered" | "registered" {
  if (result.deployed === "no") return "undeployed";
  return result.deployed === "yes" && result.registered === "yes" ? "registered" : "deployed_unregistered";
}

async function remainingFor(env: UserOpEnv, account: Address): Promise<bigint> {
  const limits = ledgerLimitsFrom(env.config, env.capabilities)();
  const usage = await env.ledger.usageDetail(account.toLowerCase(), env.ledger.currentDay());
  let remaining = limits.fundingDailyCapAtomic - usage.fundedAtomic;
  // FS-3: the lifetime total counts unless the operator confirmed the lift, whatever the ledger's own view of the facts says.
  const lifetimeCap = lifetimeCapApplies(env) ? env.config.limits.fundingTestCapAtomic : limits.fundingLifetimeCapAtomic;
  if (lifetimeCap !== undefined) {
    const lifetime = lifetimeCap - usage.fundedLifetimeAtomic;
    if (lifetime < remaining) remaining = lifetime;
  }
  return remaining < 0n ? 0n : remaining;
}

// ---- which earlier fundings still count as "in flight" ---------------------------------------------------------------------------

type Blocking = { readonly record: FundingRecord; readonly code: "funding_in_flight" | "funding_stuck" };

function blockingFunding(env: UserOpEnv, account: Address): Blocking | undefined {
  const now = env.now();
  for (const record of allRecords(env, account)) {
    switch (record.state) {
      case "reported":
      case "dispatched":
        return { record, code: "funding_in_flight" };
      case "delivered":
        // Without a baseline the credit can never be confirmed; after the delivery window it stops blocking.
        if (record.dispatchedAtMs === null || now - record.dispatchedAtMs < DELIVERY_GRACE_MS) return { record, code: "funding_in_flight" };
        break;
      case "dispatched_not_delivered":
      case "delivered_not_credited":
        return { record, code: "funding_stuck" };
      default:
        break;
    }
  }
  return undefined;
}

// ---- the follow-up ---------------------------------------------------------------------------------------------------------------------

async function isDelivered(env: UserOpEnv, messageId: Hex): Promise<boolean | null> {
  // The node can say "delivered" and "not delivered"; the explorer's ProcessId log can only say "delivered".
  let node: boolean | null = null;
  const rpc = env.reads.rpc();
  if (rpc !== undefined) {
    try {
      const raw = await rpc.call(HYPERLANE_MAILBOX, encodeFunctionData({ abi: MAILBOX_ABI, functionName: "delivered", args: [messageId] }));
      const value = decodeFunctionResult({ abi: MAILBOX_ABI, functionName: "delivered", data: raw });
      node = typeof value === "boolean" ? value : null;
    } catch {
      node = null;
    }
  }
  if (node === true) return true;
  try {
    const read = await env.reads.explorer.getLogs({ address: HYPERLANE_MAILBOX, topic0: PROCESS_ID_TOPIC, topic1: messageId });
    if (read.logs.length > 0) return true;
  } catch {
    // inconclusive
  }
  return node;
}

function baseRpcFor(env: UserOpEnv): BaseRpc | undefined {
  try {
    return new BaseRpc({ transport: jsonRpcTransportFor(env.upstream, "base_rpc"), url: env.config.baseRpcUrl?.reveal() ?? DEFAULT_BASE_RPC_URL });
  } catch (error) {
    if (error instanceof ChainReadError) return undefined;
    throw error;
  }
}

function detailFor(report: DeliveryReport): string {
  switch (report.state) {
    case "not_found":
      return "The Base transaction has no receipt yet, or the Base node could not be read. Nothing is known about it.";
    case "base_failed":
      return "The Base transaction reverted, so nothing was sent.";
    case "unrecognised":
      return "That transaction is not exactly one transferRemote from the XO router to this account for this amount, sent from the owner's own wallet.";
    case "dispatched":
      return "Sent on Base; the message is in flight. XO's own deposits arrive in under 30 seconds; a direct transfer has not been observed by anyone yet.";
    case "delivered":
      return report.credit === "unknown" ? "Delivered on XO. The credit could not be checked without a balance from before the funding." : "Delivered on XO; the orderbook balance has not risen yet.";
    case "credited":
      return "Delivered, and the XO account balance rose by the funded amount.";
    case "dispatched_not_delivered":
      return "Ten minutes after dispatch the message is still not delivered. It is pending: do not send again. It may be delivered later, or never: nobody outside XO is known to be able to deliver it.";
    case "delivered_not_credited":
      return "Delivered, but the orderbook balance did not rise in ten minutes. Do not send again; this is exactly what the first small deposit tests.";
  }
}

// One look at a funding. `hash` is the transaction to follow. Returns the updated record (saved).
async function followFunding(env: UserOpEnv, record: FundingRecord, hash: Hex): Promise<FundingRecord> {
  const base = baseRpcFor(env);
  const now = env.now();
  if (base === undefined) {
    const next: FundingRecord = { ...record, lastTxHash: record.txHash === null ? hash : record.lastTxHash, state: record.txHash === null ? "reported" : record.state, lastFollowedAtMs: now, detail: "The Base node is not usable, so the transfer could not be read." };
    await saveRecord(env, next);
    return next;
  }
  const reader: DeliveryReader = {
    // Only the owner's own transaction is a funding. A transfer to this account that someone else sent is a gift, not
    // the thing the relay reserved the cap for, and it must not turn a capability fact on: its logs are dropped, so
    // it reads as "not this transfer".
    getReceipt: async (txHash) => {
      const receipt = await base.getTransactionReceipt(txHash);
      if (receipt !== null && (receipt.from === null || receipt.from.toLowerCase() !== record.owner.toLowerCase())) return { ...receipt, logs: [] };
      return receipt;
    },
    getBlockTimestamp: (block) => base.getBlockTimestamp(block),
    isDelivered: (messageId) => isDelivered(env, messageId),
    getXoBalance: async (account) => (await env.reads.orderbook(account)).balanceMicro,
  };
  const report = await checkDelivery({ reader, nowMs: env.now }, { txHash: hash, account: record.account as Address, amount: BigInt(record.amount), xoBalanceBefore: record.baseline === null ? null : BigInt(record.baseline) });

  let next: FundingRecord = { ...record, lastFollowedAtMs: now, detail: detailFor(report) };
  // A recognised transfer that was sent before this funding existed is an older one (replayed or forgotten), not this one.
  const stale = record.txHash === null && report.dispatchedAtS !== null && report.dispatchedAtS * 1000 < record.createdAtMs - STALE_TRANSFER_TOLERANCE_MS;
  if (stale && report.state !== "not_found" && report.state !== "base_failed" && report.state !== "unrecognised") {
    next = { ...next, state: "failed", lastTxHash: hash, detail: "That transfer was sent before this funding was checked, so it cannot be this funding. Send a new one." };
    await saveRecord(env, next);
    return next;
  }
  switch (report.state) {
    case "not_found":
      // A transfer that is already bound keeps its state and its last good detail through a node that fails.
      next = { ...next, state: record.txHash === null ? "reported" : record.state, lastTxHash: record.txHash === null ? hash : record.lastTxHash, detail: record.txHash === null ? next.detail : record.detail };
      break;
    case "base_failed":
      next = { ...next, state: record.txHash === null ? "failed" : record.state, revertedTxHash: hash, lastTxHash: record.txHash === null ? hash : record.lastTxHash };
      break;
    case "unrecognised":
      next = { ...next, state: record.txHash === null ? "failed" : record.state, lastTxHash: record.txHash === null ? hash : record.lastTxHash };
      break;
    default: {
      // A recognised transfer: bind it. Never moves backwards from credited.
      next = {
        ...next,
        txHash: hash,
        lastTxHash: null,
        messageId: report.messageId,
        dispatchedAtMs: report.dispatchedAtS === null ? record.dispatchedAtMs : report.dispatchedAtS * 1000,
        state: record.state === "credited" ? "credited" : report.state,
      };
    }
  }
  await saveRecord(env, next);

  // Money left the owner's wallet: the reservation is spent (and stays counted, stuck or not).
  if (next.txHash !== null && !next.committed) {
    try {
      await env.ledger.commit(next.id);
      next = { ...next, committed: true };
    } catch {
      next = { ...next, detail: "The reservation was already given back before this report; the transfer is followed all the same." };
    }
    await saveRecord(env, next);
  }

  // What was seen becomes a fact (it lifts the test amount only when both are yes).
  if (next.txHash !== null) {
    if (report.delivered === true || next.state === "delivered" || next.state === "credited") {
      await learn(env, FUNDING_DELIVERY_FACT, "yes", "A transferRemote sent from a Base wallet through the raw route was delivered on XO.");
    }
    if (next.state === "credited") await learn(env, FUNDING_CREDIT_FACT, "yes", "The orderbook balance rose by the funded amount after the delivery.");
    else if (next.state === "delivered_not_credited") await learn(env, FUNDING_CREDIT_FACT, "no", "Delivered on XO, but the orderbook balance did not rise in ten minutes.");
  }
  return next;
}

// Looks again at this account's unfinished fundings, a few at a time, so a late delivery lifts the block.
async function refreshInFlight(env: UserOpEnv, account: Address): Promise<void> {
  const now = env.now();
  let looked = 0;
  for (const record of allRecords(env, account)) {
    if (looked >= MAX_REFRESH_PER_CHECK) break;
    if (record.state === "checked" || record.state === "credited" || record.state === "failed") continue;
    if (record.lastFollowedAtMs !== null && now - record.lastFollowedAtMs < REFRESH_MIN_GAP_MS) continue;
    const hash = (record.txHash ?? record.lastTxHash) as Hex | null;
    if (hash === null) continue;
    looked += 1;
    try {
      await followFunding(env, record, hash);
    } catch {
      // The next look tries again.
    }
  }
}

// ---- check -------------------------------------------------------------------------------------------------------------------------------------

type CheckBody = PostRequestParsed<"/v1/funding/check">;
type CheckResponse = PostResponseInput<"/v1/funding/check">;
type Reason = { readonly code: string; readonly message: string };

const checkHandler: PostHandler<"/v1/funding/check"> = async (body: CheckBody, context: RelayContext): Promise<CheckResponse> => {
  const env = useropEnv(context);
  assertNotKilled(context.flags());
  // The flag, the kill switch, the tripwires and the audit log, before anything else.
  guardWrite(context, FUNDING_FLAG);
  const owner = parseOwnerOrRefuse(body.owner);
  const account = deriveAccount(owner);
  checkSuppliedAccount(body.account, account);
  const amount = parseDecimalAtomic(body.amount, USDC_E_DECIMALS);
  if (!amount.ok) throw new RelayError("invalid_request", "amount must be a plain decimal amount.");
  return env.locks.run(`funding:${account.toLowerCase()}`, () => checkLocked(env, owner, account, amount.value, body.step));
};

async function checkLocked(env: UserOpEnv, owner: Address, account: Address, amount: bigint, step: "transfer" | undefined): Promise<CheckResponse> {
  try {
    await sweepFundings(env.context);
    await pruneFundings(env);
  } catch {
    // Housekeeping only.
  }
  await refreshInFlight(env, account);

  // 1. Deployment: positive proof or no funding.
  const observed = await accountState(env, owner);
  const gate = gateFunding(observed.result);
  if (gate.code === "state_unknown") {
    throw new RelayError("precondition_failed", "The relay could not prove that the XO account is deployed (the deployment logs were unreadable or incomplete), so it will not fund it.", { reason: "deployment_unproven" });
  }
  const state = deploymentState(observed.result);
  const reasons: Reason[] = [];
  if (!gate.allowed) {
    reasons.push({ code: "undeployed", message: "The XO account is not deployed yet. USDC.e minted to it could only move by a user operation, so deploy it first (deploy_enable_trading)." });
  } else if (observed.result.registered !== "yes") {
    // Informational: funding is allowed, trading is not.
    reasons.push({ code: "not_registered", message: "The orderbook does not know this account (deployed_unregistered or unreadable): funding is allowed, trading stays blocked." });
  }

  // 2. The amount policy (A6, D3).
  const policy = checkFundingAmount({ amount, delivery: effectiveFact(env, FUNDING_DELIVERY_FACT), credit: effectiveFact(env, FUNDING_CREDIT_FACT) });
  if (!policy.ok) reasons.push({ code: policy.code, message: policy.detail });
  if (!policy.ok && policy.code === "above_test_amount" && factOf(env, FUNDING_DELIVERY_FACT) === "yes" && factOf(env, FUNDING_CREDIT_FACT) === "yes" && !liftConfirmed(env)) {
    reasons.push({
      code: "lift_needs_operator_fact",
      message: "The relay has seen delivery and credit itself, but raising the test amount needs a result the operator recorded: the live-test kit's T3a deposit test, or FU6 and FU7 recorded by hand (scripts/live/facts.ts record).",
    });
  }
  // 3. One funding at a time.
  const blocking = blockingFunding(env, account);
  if (blocking !== undefined) {
    reasons.push({
      code: blocking.code,
      message:
        blocking.code === "funding_stuck"
          ? "An earlier funding for this account has not arrived or been credited after ten minutes. It is never sent again; no new funding is allowed until it settles."
          : "An earlier funding for this account is still being followed. Wait until it is delivered and credited.",
    });
  }

  // A transfer proposal already went out for an open reservation and no hash has been reported: a further
  // check would hand out a fresh approve and transfer on a reservation that was counted once (the allowance is
  // spent by the transfer, so the plugin cannot tell). Refused for any amount until it is reported or lapses.
  const now = env.now();
  const openRecords = allRecords(env, account).filter((record) => record.state === "checked" && record.expiresAtMs > now);
  if (openRecords.some((record) => record.transferIssued)) {
    reasons.push({ code: "funding_transfer_issued", message: "A transfer proposal was already handed out for this account and its transaction hash has not been reported. Report it with tx_hash and funding_id; a new funding is possible after the reservation lapses." });
  }

  // Informational reasons do not deny.
  const denying = reasons.filter((reason) => reason.code !== "not_registered");
  if (denying.length > 0) return denied(env, account, state, reasons);

  // 4. The same reservation again while it is open and unreported.
  const open = openRecords.find((record) => record.amount === amount.toString());
  if (step === "transfer") {
    if (open === undefined) {
      reasons.push({ code: "funding_not_open", message: "There is no open reservation for this amount, so no transfer proposal can be handed out. Ask for a funding check without a step." });
      return denied(env, account, state, reasons);
    }
    await saveRecord(env, { ...open, transferIssued: true });
  }
  if (open !== undefined) {
    return {
      permitted: true,
      account,
      state,
      reserved_usd: usd(amount),
      funding_id: open.id,
      expires_at: isoSecondOf(open.expiresAtMs),
      funding_remaining_usd: usd(await remainingFor(env, account)),
      reasons,
    };
  }

  if (openRecords.length >= MAX_OPEN_FUNDINGS) {
    reasons.push({ code: "funding_open_limit", message: `This account already has ${openRecords.length} open funding checks that were never reported. Report or let them lapse before asking for another.` });
    return denied(env, account, state, reasons);
  }

  // FS-3: the lifetime total is lifted only by the confirmed facts too (the ledger's own lift reads the facts without their source).
  if (lifetimeCapApplies(env)) {
    const lifetime = (await env.ledger.usageDetail(account.toLowerCase(), env.ledger.currentDay())).fundedLifetimeAtomic;
    const cap = env.config.limits.fundingTestCapAtomic;
    if (lifetime + amount > cap) {
      const left = cap > lifetime ? cap - lifetime : 0n;
      reasons.push({ code: "total_funding_cap", message: `Total funding is capped at ${usd(cap)} USDC until the exit has been proven (T4); ${usd(left)} USDC is left.` });
      return denied(env, account, state, reasons);
    }
  }

  // 5. The caps. The ledger checks and reserves in one step.
  const id = randomHex(16);
  const limits = ledgerLimitsFrom(env.config, env.capabilities)();
  const expiresAtMs = now + FUNDING_RESERVATION_TTL_S * 1000;
  const reserved = await env.ledger.reserveFor({
    kind: "fund",
    account: account.toLowerCase(),
    day: env.ledger.currentDay(),
    amountAtomic: amount,
    limitAtomic: limits.fundingDailyCapAtomic,
    category: "funding",
    expiresAtMs,
    reservationId: id,
  });
  if (!reserved.reserved) {
    const code = reserved.reason === "funding_total_cap" ? "total_funding_cap" : reserved.reason === "funding_daily_cap" ? "daily_funding_cap" : "funding_cap";
    reasons.push({
      code,
      message:
        code === "total_funding_cap"
          ? `Total funding is capped at ${usd(reserved.limitAtomic)} USDC until the exit has been proven (T4); ${usd(reserved.remainingAtomic)} USDC is left.`
          : `The daily funding cap of ${usd(reserved.limitAtomic)} USDC leaves ${usd(reserved.remainingAtomic)} USDC for today.`,
    });
    return denied(env, account, state, reasons);
  }

  // 6. The baseline for the credit check, and the record.
  const baseline = (await env.reads.orderbook(account)).balanceMicro;
  const record: FundingRecord = {
    v: 1,
    id,
    owner,
    account,
    amount: amount.toString(),
    createdAtMs: now,
    expiresAtMs,
    state: "checked",
    txHash: null,
    lastTxHash: null,
    revertedTxHash: null,
    messageId: null,
    dispatchedAtMs: null,
    baseline: baseline === null ? null : baseline.toString(),
    lastFollowedAtMs: null,
    committed: false,
    transferIssued: false,
    detail: null,
  };
  await saveRecord(env, record);
  return {
    permitted: true,
    account,
    state,
    reserved_usd: usd(amount),
    funding_id: id,
    expires_at: isoSecondOf(expiresAtMs),
    funding_remaining_usd: usd(await remainingFor(env, account)),
    reasons,
  };
}

async function denied(env: UserOpEnv, account: Address, state: "undeployed" | "deployed_unregistered" | "registered", reasons: readonly Reason[]): Promise<CheckResponse> {
  return {
    permitted: false,
    account,
    state,
    reserved_usd: "0",
    funding_id: null,
    expires_at: null,
    funding_remaining_usd: usd(await remainingFor(env, account)),
    reasons: [...reasons],
  };
}

// ---- report ---------------------------------------------------------------------------------------------------------------------------------------

type ReportBody = PostRequestParsed<"/v1/funding/report">;
type ReportResponse = PostResponseInput<"/v1/funding/report">;

function reportState(record: FundingRecord): ReportResponse["state"] {
  switch (record.state) {
    case "checked":
      return "reported";
    default:
      return record.state;
  }
}

const reportHandler: PostHandler<"/v1/funding/report"> = async (body: ReportBody, context: RelayContext): Promise<ReportResponse> => {
  const env = useropEnv(context);
  assertNotKilled(context.flags());
  const owner = parseOwnerOrRefuse(body.owner);
  const account = deriveAccount(owner);
  checkSuppliedAccount(body.account, account);
  const found = readRecord(env, body.funding_id);
  if (found === undefined) throw new RelayError("not_found", "No such funding. Ask for a funding check first.");
  if (found.owner.toLowerCase() !== owner.toLowerCase()) throw new RelayError("owner_mismatch", "That funding belongs to another owner.");
  const hash = body.tx_hash.toLowerCase() as Hex;
  return env.locks.run(`funding:${account.toLowerCase()}`, async () => {
    const record = readRecord(env, body.funding_id);
    if (record === undefined) throw new RelayError("not_found", "No such funding. Ask for a funding check first.");
    if (record.txHash !== null && record.txHash !== hash) {
      throw new RelayError("precondition_failed", "This funding is already following another transaction. A funding is one transfer; ask for a new check to fund again.", { reason: "different_transaction" });
    }
    // One transfer, one funding: a hash already bound to (or reported against) another funding is a replay.
    for (const other of allRecords(env)) {
      if (other.id !== record.id && (other.txHash === hash || other.lastTxHash === hash)) {
        throw new RelayError("precondition_failed", "That transaction is already recorded against another funding. A funding is one new transfer.", { reason: "hash_already_bound" });
      }
    }
    const next = await followFunding(env, record, hash);
    return {
      funding_id: next.id,
      state: reportState(next),
      ...(next.messageId === null ? {} : { message_id: next.messageId }),
      ...(next.detail === null ? {} : { detail: next.detail }),
    };
  });
};

// ---- giving back what was never used ------------------------------------------------------------------------------------------------------------

// Feed this to ledger.sweep(). Funding reservations come back only on evidence: a Base receipt that
// reverted, or no report plus a complete XO-side read showing no such transfer, ten minutes after expiry.
export async function confirmFundingAbsent(context: RelayContext, reservation: ReservationView): Promise<AbsenceVerdict> {
  if (reservation.kind !== "fund") return { verdict: "unknown" };
  const env = useropEnv(context);
  const record = readRecord(env, reservation.id);
  if (record === undefined) return { verdict: "unknown" };
  if (record.txHash !== null) return { verdict: "present" };
  if (record.state === "failed" && record.revertedTxHash !== null) return { verdict: "absent", source: "base_logs" };
  if (env.now() < record.expiresAtMs + DELIVERY_GRACE_MS) return { verdict: "unknown" };
  try {
    const read = await env.reads.explorer.getLogs({ address: XO_WARP_ROUTE, topic0: RECEIVED_TRANSFER_REMOTE_TOPIC, topic2: padRecipient(record.account) });
    if (!read.complete) return { verdict: "unknown" };
    const arrived = read.logs.some((log) => {
      const stamp = log.timestamp === null ? null : Number(log.timestamp) * 1000;
      return log.data === `0x${BigInt(record.amount).toString(16).padStart(64, "0")}` && (stamp === null || stamp >= record.createdAtMs);
    });
    return arrived ? { verdict: "present" } : { verdict: "absent", source: "no_report" };
  } catch {
    return { verdict: "unknown" };
  }
}

// Walks expired, still-reserved funding reservations, reading the XO route for at most SWEEP_BUDGET of them per
// call (the rest wait for the next one). Safe to call often.
export async function sweepFundings(context: RelayContext): Promise<{ readonly released: readonly string[]; readonly present: readonly string[]; readonly unknown: readonly string[] }> {
  const env = useropEnv(context);
  let budget = SWEEP_BUDGET;
  return env.ledger.sweep(async (reservation) => {
    if (reservation.kind !== "fund") return { verdict: "unknown" };
    if (budget <= 0) return { verdict: "unknown" };
    budget -= 1;
    return confirmFundingAbsent(context, reservation);
  });
}

// Finished fundings older than 90 days are forgotten; anything still being followed is kept.
async function pruneFundings(env: UserOpEnv): Promise<void> {
  const now = env.now();
  const ops: Array<{ readonly ns: string; readonly key: string; readonly value: null }> = [];
  for (const record of allRecords(env)) {
    const finished = record.state === "credited" || record.state === "failed" || (record.state === "checked" && record.expiresAtMs < now);
    const reservation = env.ledger.reservation(record.id);
    if (finished && now - record.createdAtMs > RECORD_RETENTION_MS && reservation?.state !== "reserved") ops.push({ ns: FUNDING_NS, key: record.id, value: null });
  }
  if (ops.length > 0) await env.state.commit(ops);
}

// For the relay's maintenance loop: looks again at every unfinished funding.
export async function followOpenFundings(context: RelayContext): Promise<number> {
  const env = useropEnv(context);
  let looked = 0;
  for (const record of allRecords(env)) {
    if (record.state === "checked" || record.state === "credited" || record.state === "failed") continue;
    const hash = (record.txHash ?? record.lastTxHash) as Hex | null;
    if (hash === null) continue;
    try {
      await followFunding(env, record, hash);
      looked += 1;
    } catch {
      // next time
    }
  }
  return looked;
}

export const routes: RouteTable = {
  "POST /v1/funding/check": checkHandler,
  "POST /v1/funding/report": reportHandler,
};
