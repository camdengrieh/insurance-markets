// Runs one parsed prepare command (docs/dapp-design.md 5.2 "Prepare", 7.2 M5-1, M5-2, M5-7).
//
// THE ORDER OF THINGS, and why it is this order:
//   1. who is it for: the owner the person typed after `from`, or the one saved owner. Never a model's or a page's
//      choice; a look-alike of a saved address is refused until it is compared;
//   2. the re-typing rule: a pasted, filled or proposed line needs the market id and the size typed again;
//   3. one read of the account (xo_account) and the gate from trade/facts.ts: kill switch, the write switches, the
//      recorded live-test facts. A gate that says no ends the command here, BEFORE anything is prepared, and says
//      what the server would refuse. With every switch off it says the daemon is read-only;
//   4. for an order, the market is read and the token is taken from the market the person named (the person types a
//      market id and yes or no, never a token id), the ticket is built with the page's own integer arithmetic and
//      compared with the per-order cap;
//   5. one prepare call through trade/prepare.ts, which vets the item before it can be shown.
//
// This file calls the five prepare tools of the trade feature, the two read tools of the trade feature and one read
// tool of the terminal (xo_get_market). It has no send, no sign, no cancel call, no arm and no flag or cap setter:
// cancel is a hand-off text the person gives to their own agent.

import type { AccountAnswer, ListAnswer } from "../../trade/tools";
import { checkEvmAddress } from "../../../core/address";
import type { CapabilityFacts } from "../../../core/capabilities";
import { parseDecimalAtomic } from "@shared/guardrails/amount";
import { USDC_E_DECIMALS } from "@shared/xo/chain/constants";

import { flagViewOf } from "../../trade/AccountPanel";
import type { TradeClient } from "../../trade/client";
import { WRITE_FLAGS, flagIsOn, gateFor, gateForCancel, mergeFacts, type Gate, type GateInput, type GateReason, type TradeAction } from "../../trade/facts";
import { cancelCall } from "../../trade/handoff";
import { prepareDeploy, prepareFunding, prepareOrder, prepareRedeem, prepareRevoke, type PrepareDeps, type PrepareResult } from "../../trade/prepare";
import { readAccount, readOrders, type ReadFailure } from "../../trade/reads";
import type { OwnerChoice } from "../../trade/services";
import { expectedQuote, buildTicket, overOrderCap, usdText, type Ticket } from "../../trade/ticket";
import { isDaemonError } from "../client";
import { marketArgs, TOOL_OUTPUT_SCHEMAS, type MarketOutput } from "../tools";
import type { PrepareCommand } from "./grammar";
import { checkRetype, retypeFieldsOf, type LineOrigin, type RetypeField, type RetypeKey, type Retyped } from "./taint";

// ---- dependencies ----------------------------------------------------------------------------------------------------

export type MarketRead =
  | { readonly ok: true; readonly market: MarketOutput }
  | { readonly ok: false; readonly reason: "not_paired" | "unreadable" | "different_market" };

export interface RunDeps {
  readonly client: Pick<TradeClient, "callTool" | "hasToken">;
  readonly nowMs: () => number;
  // The page's recorded live-test facts. Everything not recorded as "yes" is unproven.
  readonly facts: () => CapabilityFacts;
  readonly loadOwners: () => Promise<readonly OwnerChoice[]>;
  readonly readMarket: (conditionId: string, signal?: AbortSignal) => Promise<MarketRead>;
}

// The terminal's read client, used for the one market read an order needs. Validated against the terminal's own
// schema; an answer for another market is not an answer.
export function marketReaderOver(client: { callTool(tool: "xo_get_market", args: ReturnType<typeof marketArgs>, signal?: AbortSignal): Promise<{ readonly ok: boolean; readonly structured: unknown }> }): RunDeps["readMarket"] {
  return async (conditionId, signal) => {
    try {
      const answer = await client.callTool("xo_get_market", marketArgs(conditionId), signal);
      if (!answer.ok) return { ok: false, reason: "unreadable" };
      const parsed = TOOL_OUTPUT_SCHEMAS.xo_get_market.safeParse(answer.structured);
      if (!parsed.success) return { ok: false, reason: "unreadable" };
      if (parsed.data.market.condition_id.toLowerCase() !== conditionId.toLowerCase()) return { ok: false, reason: "different_market" };
      return { ok: true, market: parsed.data };
    } catch (error) {
      if (isDaemonError(error) && error.code === "not_paired") return { ok: false, reason: "not_paired" };
      return { ok: false, reason: "unreadable" };
    }
  };
}

// ---- results ----------------------------------------------------------------------------------------------------------

export const RUN_REFUSALS = [
  "not_paired",
  "owner_needed",
  "owner_many",
  "owner_invalid",
  "owner_lookalike",
  "retype_required",
  "retype_mismatch",
  "market_unreadable",
  "market_not_open",
  "token_missing",
  "ticket_invalid",
  "over_cap",
  "amount_invalid",
  "order_not_found",
  "orders_unreadable",
] as const;
export type RunRefusalCode = (typeof RUN_REFUSALS)[number];

// Fixed wording only. Nothing a service or a market said is in these sentences.
export const RUN_REFUSAL_TEXT: Readonly<Record<RunRefusalCode, string>> = Object.freeze({
  not_paired: "This page is not paired with the Cockpit, so it can reach nothing. Nothing was prepared.",
  owner_needed: "No owner address is saved for XO. Save one on the Wallet screen, or add from <owner address> to the command.",
  owner_many: "More than one owner address is saved for XO. Say which one: add from <owner address> to the command.",
  owner_invalid: "The owner address after from was not accepted. Nothing was prepared.",
  owner_lookalike: "The owner address after from looks like one of your saved addresses but is not the same. Compare the full addresses, then type the one you mean. Nothing was prepared.",
  retype_required: "This line was pasted, filled in or proposed, so it may have been shaped by someone else. Type the items below again to confirm them. Nothing was prepared.",
  retype_mismatch: "What you typed again does not match the line. Nothing was prepared.",
  market_unreadable: "The market could not be read, so the order was not prepared.",
  market_not_open: "The market does not read as open for trading, so the order was not prepared.",
  token_missing: "The market has no such outcome, so the order was not prepared.",
  ticket_invalid: "The order is not valid as typed. Nothing was prepared.",
  over_cap: "The order counts more than the per-order cap. The cap is advisory against a compromised agent, but this terminal respects it. Nothing was prepared.",
  amount_invalid: "That amount is not valid: a plain amount above zero with at most six decimal places. Nothing was prepared.",
  order_not_found: "That order hash is not among your open orders, so no cancel call was written.",
  orders_unreadable: "Your open orders could not be read completely, so no cancel call was written.",
});

export interface RefusedHere {
  readonly kind: "refused_here";
  readonly code: RunRefusalCode;
  readonly message: string;
  // For retype_required and retype_mismatch: the fields the person must type, and which ones are wrong.
  readonly retype?: { readonly fields: readonly RetypeField[]; readonly missing: readonly RetypeKey[]; readonly mismatched: readonly RetypeKey[] };
  // The issues of an invalid ticket, in the ticket module's own fixed words.
  readonly issues?: readonly string[];
}

export interface GatedOutcome {
  readonly kind: "gated";
  readonly action: TradeAction | "cancel";
  readonly owner: string;
  readonly reasons: readonly GateReason[];
  readonly unprovenRequired: Gate["unprovenRequired"];
  readonly unprovenInforming: Gate["unprovenInforming"];
  // Every write switch is off at the plugin and the relay: the daemon is read-only.
  readonly readOnly: boolean;
  readonly kill: boolean | null;
  readonly facts: CapabilityFacts;
}

export interface PreparedOutcome {
  readonly kind: "prepared";
  readonly action: TradeAction;
  readonly owner: string;
  readonly result: PrepareResult;
  readonly gate: Gate;
  readonly facts: CapabilityFacts;
  // For an order: what the page computed before asking, so the card can be compared with it.
  readonly ticket: Ticket | null;
  readonly quote: ReturnType<typeof expectedQuote> | null;
  // A vetted, non-dry-run item exists: the Signature Card on the Signing screen is where to read it.
  readonly openCard: { readonly preparedId: string } | null;
}

export interface HandoffOutcome {
  readonly kind: "handoff";
  readonly owner: string;
  readonly orderHash: string;
  // The exact call text for the person's own agent. Built from the validated owner and hash only.
  readonly call: string;
  readonly unprovenInforming: Gate["unprovenInforming"];
  readonly facts: CapabilityFacts;
}

export interface AccountUnreadOutcome {
  readonly kind: "account_unread";
  readonly owner: string;
  readonly failure: ReadFailure;
}

export type RunOutcome = RefusedHere | GatedOutcome | PreparedOutcome | HandoffOutcome | AccountUnreadOutcome;

function refused(code: RunRefusalCode, extra: Omit<RefusedHere, "kind" | "code" | "message"> = {}): RefusedHere {
  return { kind: "refused_here", code, message: RUN_REFUSAL_TEXT[code], ...extra };
}

// ---- steps -------------------------------------------------------------------------------------------------------------

type OwnerResolution = { readonly ok: true; readonly owner: string } | { readonly ok: false; readonly outcome: RefusedHere };

export async function resolveOwner(command: PrepareCommand, owners: readonly OwnerChoice[]): Promise<OwnerResolution> {
  if (command.from !== null) {
    const checked = checkEvmAddress(command.from, owners.map((owner) => ({ id: owner.id, address: owner.address })), { role: "wallet" });
    if (!checked.ok) return { ok: false, outcome: refused("owner_invalid") };
    if (checked.needsConfirmation) return { ok: false, outcome: refused("owner_lookalike") };
    return { ok: true, owner: checked.address };
  }
  if (owners.length === 0) return { ok: false, outcome: refused("owner_needed") };
  const only = owners[0];
  if (owners.length > 1 || only === undefined) return { ok: false, outcome: refused("owner_many") };
  return { ok: true, owner: only.address };
}

function gateInputOf(deps: RunDeps, account: AccountAnswer): { readonly input: GateInput; readonly facts: CapabilityFacts } {
  const facts = mergeFacts(deps.facts(), account.capabilities);
  return { facts, input: { hasOwner: true, paired: deps.client.hasToken(), accountRead: true, kill: account.kill_switch, flags: flagViewOf(account), facts } };
}

function readOnlyOf(account: AccountAnswer): boolean {
  const view = flagViewOf(account);
  return WRITE_FLAGS.every((flag) => !flagIsOn(view, flag));
}

const ACTION_OF: Readonly<Record<Exclude<PrepareCommand["name"], "cancel">, TradeAction>> = Object.freeze({ order: "order", redeem: "redeem", fund: "fund", deploy: "deploy", revoke: "revoke" });

async function orderTicket(command: Extract<PrepareCommand, { name: "order" }>, deps: RunDeps, account: AccountAnswer, signal?: AbortSignal): Promise<{ readonly ok: true; readonly ticket: Ticket } | { readonly ok: false; readonly outcome: RefusedHere }> {
  const read = await deps.readMarket(command.marketId, signal);
  if (!read.ok) return { ok: false, outcome: refused(read.reason === "not_paired" ? "not_paired" : "market_unreadable") };
  const { market, tradability } = read.market;
  if (market.condition_id.toLowerCase() !== command.marketId) return { ok: false, outcome: refused("market_unreadable") };
  // Fail closed: only a market the plugin reads as open (with a book, thin or not) can be ordered into.
  if (tradability.verdict !== "open_with_book" && tradability.verdict !== "thin_book") return { ok: false, outcome: refused("market_not_open") };
  const outcome = market.outcomes.find((entry) => entry.slot === command.outcome);
  if (outcome === undefined) return { ok: false, outcome: refused("token_missing") };
  const built = buildTicket({ tokenId: outcome.token_id, side: command.side, price: command.price, shares: command.shares, tif: command.tif, ttlS: command.ttlS, postOnly: command.postOnly });
  if (!built.ok) return { ok: false, outcome: refused("ticket_invalid", { issues: built.issues.map((issue) => issue.message) }) };
  if (overOrderCap(built.ticket, account.caps.max_order_usd) === true) return { ok: false, outcome: refused("over_cap") };
  return { ok: true, ticket: built.ticket };
}

function preparedOutcome(action: TradeAction, owner: string, result: PrepareResult, gate: Gate, facts: CapabilityFacts, ticket: Ticket | null): PreparedOutcome {
  const openCard = result.kind === "vetted" && !result.dryRun ? { preparedId: result.item.preparedId } : null;
  return { kind: "prepared", action, owner, result, gate, facts, ticket, quote: ticket === null ? null : expectedQuote(ticket), openCard };
}

// ---- the entry point -----------------------------------------------------------------------------------------------------

export interface RunInput {
  readonly command: PrepareCommand;
  readonly origin: LineOrigin;
  readonly retyped: Retyped;
}

export async function runPrepare(input: RunInput, deps: RunDeps, signal?: AbortSignal): Promise<RunOutcome> {
  const { command } = input;
  if (!deps.client.hasToken()) return refused("not_paired");

  const owners = await deps.loadOwners();
  const resolved = await resolveOwner(command, owners);
  if (!resolved.ok) return resolved.outcome;
  const owner = resolved.owner;

  const fields = retypeFieldsOf(command, owner);
  const retype = checkRetype(fields, input.origin, input.retyped);
  if (!retype.ok) {
    const nothingTyped = retype.mismatched.length === 0;
    return refused(nothingTyped ? "retype_required" : "retype_mismatch", { retype: { fields, missing: retype.missing, mismatched: retype.mismatched } });
  }

  // Amounts that are plain nonsense stop here, before any read.
  if (command.name === "fund") {
    const atomic = parseDecimalAtomic(command.amount, USDC_E_DECIMALS);
    if (!atomic.ok || atomic.value <= 0n) return refused("amount_invalid");
  }
  if (command.name === "deploy" && command.allowance.kind === "capped") {
    const atomic = parseDecimalAtomic(command.allowance.usd, USDC_E_DECIMALS);
    if (!atomic.ok || atomic.value <= 0n) return refused("amount_invalid");
  }

  const prepareDeps: PrepareDeps = { client: deps.client, nowMs: deps.nowMs };
  const account = await readAccount({ client: deps.client, nowMs: deps.nowMs }, owner, signal);
  if (!account.ok) return { kind: "account_unread", owner, failure: account };
  const { input: gateInput, facts } = gateInputOf(deps, account.data);
  const readOnly = readOnlyOf(account.data);

  if (command.name === "cancel") {
    const gate = gateForCancel(gateInput);
    if (!gate.canHandOff) {
      return { kind: "gated", action: "cancel", owner, reasons: gate.reasons, unprovenRequired: [], unprovenInforming: gate.unprovenInforming, readOnly, kill: account.data.kill_switch, facts };
    }
    const orders = await readOrders({ client: deps.client, nowMs: deps.nowMs }, owner, signal);
    if (!orders.ok) return refused("orders_unreadable");
    const list: ListAnswer = orders.data;
    const found = list.orders.some((order) => order.order_hash.toLowerCase() === command.orderHash);
    if (!found) return refused(list.truncated ? "orders_unreadable" : "order_not_found");
    return { kind: "handoff", owner, orderHash: command.orderHash, call: cancelCall(owner, command.orderHash), unprovenInforming: gate.unprovenInforming, facts };
  }

  const action = ACTION_OF[command.name];
  const gate = gateFor(action, gateInput);
  if (!gate.canPrepare) {
    return { kind: "gated", action, owner, reasons: gate.reasons, unprovenRequired: gate.unprovenRequired, unprovenInforming: gate.unprovenInforming, readOnly, kill: account.data.kill_switch, facts };
  }

  switch (command.name) {
    case "order": {
      const ticket = await orderTicket(command, deps, account.data, signal);
      if (!ticket.ok) return ticket.outcome;
      return preparedOutcome(action, owner, await prepareOrder(prepareDeps, { owner, ticket: ticket.ticket }, signal), gate, facts, ticket.ticket);
    }
    case "redeem":
      return preparedOutcome(action, owner, await prepareRedeem(prepareDeps, { owner, conditionIds: command.marketIds }, signal), gate, facts, null);
    case "fund":
      return preparedOutcome(action, owner, await prepareFunding(prepareDeps, { owner, amountText: command.amount }, signal), gate, facts, null);
    case "revoke":
      return preparedOutcome(action, owner, await prepareRevoke(prepareDeps, { owner }, signal), gate, facts, null);
    case "deploy": {
      if (command.allowance.kind === "unlimited") {
        return preparedOutcome(action, owner, await prepareDeploy(prepareDeps, { owner, allowanceUsd: null, allowanceAtomic: null }, signal), gate, facts, null);
      }
      const atomic = parseDecimalAtomic(command.allowance.usd, USDC_E_DECIMALS);
      if (!atomic.ok || atomic.value <= 0n) return refused("amount_invalid");
      // The canonical text the relay echoes back (no trailing zeros), computed with the page's own formatter.
      const canonical = usdText(atomic.value);
      return preparedOutcome(action, owner, await prepareDeploy(prepareDeps, { owner, allowanceUsd: canonical, allowanceAtomic: atomic.value }, signal), gate, facts, null);
    }
  }
}
