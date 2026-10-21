// One prepare call, from the button to a result the screen can show. This is the only place a prepare-class tool is
// called, and it never calls a tool that sends (tools.ts has none). The steps:
//
//   1. one POST /ui/tool through the client (the daemon decides class, scope, kill switch, rate limit);
//   2. the answer's JSON is checked against the page-side schema (tools.ts); anything else is a schema violation;
//   3. a refusal becomes words (words.ts) plus the plugin's sentence in the untrusted slot;
//   4. a prepared item is vetted by vet.ts against what the user asked for (ticket, owner, conditions, allowance);
//      a funding proposal is vetted by funding.ts against the owner and the amount;
//   5. only a vetted item is returned as something to show. A failed one carries a fixed reason and nothing of
//      its own content.

import type { BridgeErrorCode } from "@bridge/contract";

import type { Untrusted } from "../../core/ports";
import { isDaemonError, type TradeClient } from "./client";
import type { DaemonErrorCode } from "../terminal/client";
import { vetFundingProposal, PROPOSAL_KEY, type FundingFailure, type FundingIntent } from "./funding";
import { clobOrderArgs, deployArgs, fundArgs, orderArgs, preparedAnswerSchema, redeemArgs, refusalAnswerSchema, revokeArgs, untrustedText, type TradePrepareTool, type ToolArgs } from "./tools";
import { vetPrepared, type Expected, type VetFailure, type VettedItem } from "./vet";
import type { ClobTicket } from "./clob-ticket";
import type { Ticket } from "./ticket";

export type PrepareResult =
  | {
      readonly kind: "vetted";
      // A dry run (a switch is off, or the relay says so): inspect only, nothing to sign.
      readonly dryRun: boolean;
      readonly item: VettedItem;
      readonly message: Untrusted<string>;
      readonly nextAction: Untrusted<string>;
      readonly warnings: readonly Untrusted<string>[];
    }
  | { readonly kind: "funding"; readonly intent: FundingIntent }
  | { readonly kind: "refused"; readonly code: string; readonly flag: string | null; readonly message: Untrusted<string>; readonly nextAction: Untrusted<string> | null }
  | { readonly kind: "failed_vetting"; readonly failure: VetFailure }
  | { readonly kind: "funding_rejected"; readonly failure: FundingFailure }
  | { readonly kind: "daemon_error"; readonly code: DaemonErrorCode; readonly bridgeCode: BridgeErrorCode | null; readonly retryAfterS: number | null }
  | { readonly kind: "schema_violation" };

export interface PrepareDeps {
  readonly client: Pick<TradeClient, "callTool">;
  readonly nowMs: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function call(deps: PrepareDeps, tool: TradePrepareTool, args: ToolArgs, signal?: AbortSignal) {
  try {
    return { ok: true as const, result: await deps.client.callTool(tool, args, signal) };
  } catch (error) {
    if (isDaemonError(error)) return { ok: false as const, failed: { kind: "daemon_error", code: error.code, bridgeCode: error.bridgeCode, retryAfterS: error.retryAfterS } satisfies PrepareResult };
    throw error;
  }
}

function refusalOf(structured: unknown): PrepareResult | null {
  if (!isRecord(structured) || structured["outcome"] !== "refused") return null;
  const parsed = refusalAnswerSchema.safeParse(structured);
  if (!parsed.success) return { kind: "schema_violation" };
  return {
    kind: "refused",
    code: parsed.data.code,
    flag: parsed.data.flag ?? null,
    message: untrustedText(parsed.data.message),
    nextAction: parsed.data.next_action === undefined ? null : untrustedText(parsed.data.next_action),
  };
}

async function prepareItem(deps: PrepareDeps, tool: TradePrepareTool, args: ToolArgs, expected: Expected, signal?: AbortSignal): Promise<PrepareResult> {
  const called = await call(deps, tool, args, signal);
  if (!called.ok) return called.failed;
  const { result } = called;
  const refusal = refusalOf(result.structured);
  if (refusal !== null) return refusal;
  if (!result.ok || !isRecord(result.structured)) return { kind: "schema_violation" };
  const answer = preparedAnswerSchema.safeParse(result.structured);
  if (!answer.success) return { kind: "schema_violation" };
  const vetted = vetPrepared(answer.data.prepared, expected, deps.nowMs());
  if (!vetted.ok) return { kind: "failed_vetting", failure: vetted };
  return {
    kind: "vetted",
    dryRun: answer.data.outcome === "dry_run",
    item: vetted,
    message: untrustedText(answer.data.message),
    nextAction: untrustedText(answer.data.next_action),
    warnings: answer.data.warnings.map(untrustedText),
  };
}

export function prepareDeploy(deps: PrepareDeps, input: { readonly owner: string; readonly allowanceUsd: string | null; readonly allowanceAtomic: bigint | null }, signal?: AbortSignal): Promise<PrepareResult> {
  return prepareItem(deps, "xo_deploy_enable_trading", deployArgs(input.owner, input.allowanceUsd), { kind: "deploy", owner: input.owner, allowanceAtomic: input.allowanceAtomic }, signal);
}

export function prepareRevoke(deps: PrepareDeps, input: { readonly owner: string }, signal?: AbortSignal): Promise<PrepareResult> {
  return prepareItem(deps, "xo_revoke_trading", revokeArgs(input.owner), { kind: "revoke", owner: input.owner }, signal);
}

export function prepareRedeem(deps: PrepareDeps, input: { readonly owner: string; readonly conditionIds: readonly string[] }, signal?: AbortSignal): Promise<PrepareResult> {
  return prepareItem(deps, "xo_redeem", redeemArgs(input.owner, input.conditionIds), { kind: "redeem", owner: input.owner, conditionIds: input.conditionIds }, signal);
}

export function prepareOrder(deps: PrepareDeps, input: { readonly owner: string; readonly ticket: Ticket }, signal?: AbortSignal): Promise<PrepareResult> {
  const { ticket } = input;
  return prepareItem(
    deps,
    "xo_prepare_order",
    orderArgs({ owner: input.owner, tokenId: ticket.tokenId, side: ticket.side, price: ticket.price, shares: ticket.shares, tif: ticket.tif, ttlS: ticket.ttlS, postOnly: ticket.postOnly }),
    { kind: "order", owner: input.owner, ticket },
    signal,
  );
}

// A Polymarket or Limitless order (the clob_order tool, step prepare). The maker is the owner wallet itself.
export function prepareClobOrder(deps: PrepareDeps, input: { readonly owner: string; readonly ticket: ClobTicket }, signal?: AbortSignal): Promise<PrepareResult> {
  const { ticket } = input;
  return prepareItem(
    deps,
    "clob_order",
    clobOrderArgs({ owner: input.owner, venue: ticket.venue, marketId: ticket.marketId, tokenId: ticket.tokenId, side: ticket.side, price: ticket.price, shares: ticket.shares, tif: ticket.tif, ttlS: ticket.ttlS, postOnly: ticket.postOnly }),
    { kind: "clob_order", owner: input.owner, ticket },
    signal,
  );
}

export async function prepareFunding(deps: PrepareDeps, input: { readonly owner: string; readonly amountText: string }, signal?: AbortSignal): Promise<PrepareResult> {
  const called = await call(deps, "xo_fund_account", fundArgs(input.owner, input.amountText), signal);
  if (!called.ok) return called.failed;
  const { result } = called;
  const refusal = refusalOf(result.structured);
  if (refusal !== null) return refusal;
  if (!result.ok || !isRecord(result.structured) || !Object.hasOwn(result.structured, PROPOSAL_KEY)) return { kind: "schema_violation" };
  const verdict = vetFundingProposal(result.structured, { owner: input.owner, amountText: input.amountText, nowMs: deps.nowMs() });
  if (!verdict.ok) return { kind: "funding_rejected", failure: verdict };
  return { kind: "funding", intent: verdict };
}
