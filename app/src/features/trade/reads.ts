// The two read-class calls of the trade screens: the account (state, balance, claimable positions, the switches and
// caps the daemon reports) and the open orders. Neither prepares nor reserves anything. Each returns a plain value,
// never throws for a normal failure, so a screen can show "could not read" without losing the rest of the page.

import type { BridgeErrorCode } from "@bridge/contract";
import { deriveAccount } from "@shared/xo/account/derive";

import type { Untrusted } from "../../core/ports";
import { isDaemonError, type TradeClient } from "./client";
import type { DaemonErrorCode } from "../terminal/client";
import { accountAnswerSchema, accountArgs, listAnswerSchema, listOrdersArgs, refusalAnswerSchema, untrustedText, type AccountAnswer, type ListAnswer } from "./tools";

export type ReadFailure =
  | { readonly ok: false; readonly kind: "refused"; readonly code: string; readonly message: Untrusted<string> }
  | { readonly ok: false; readonly kind: "daemon_error"; readonly code: DaemonErrorCode; readonly bridgeCode: BridgeErrorCode | null }
  | { readonly ok: false; readonly kind: "schema_violation" }
  // The answer is for another owner or account than the one asked about.
  | { readonly ok: false; readonly kind: "wrong_subject" };

export type AccountRead = { readonly ok: true; readonly data: AccountAnswer; readonly fetchedAtMs: number } | ReadFailure;
export type OrdersRead = { readonly ok: true; readonly data: ListAnswer; readonly fetchedAtMs: number } | ReadFailure;

export interface ReadDeps {
  readonly client: Pick<TradeClient, "callTool">;
  readonly nowMs: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refusal(structured: unknown): ReadFailure | null {
  if (!isRecord(structured) || structured["outcome"] !== "refused") return null;
  const parsed = refusalAnswerSchema.safeParse(structured);
  if (!parsed.success) return { ok: false, kind: "schema_violation" };
  return { ok: false, kind: "refused", code: parsed.data.code, message: untrustedText(parsed.data.message) };
}

export async function readAccount(deps: ReadDeps, owner: string, signal?: AbortSignal): Promise<AccountRead> {
  try {
    const result = await deps.client.callTool("xo_account", accountArgs(owner), signal);
    const refused = refusal(result.structured);
    if (refused !== null) return refused;
    const parsed = accountAnswerSchema.safeParse(result.structured);
    if (!result.ok || !parsed.success) return { ok: false, kind: "schema_violation" };
    // The page derives the account itself and compares: an answer about another wallet is not shown as this one's.
    let derived: string;
    try {
      derived = deriveAccount(owner);
    } catch {
      return { ok: false, kind: "wrong_subject" };
    }
    if (parsed.data.owner.toLowerCase() !== owner.toLowerCase() || parsed.data.account.toLowerCase() !== derived.toLowerCase()) return { ok: false, kind: "wrong_subject" };
    return { ok: true, data: parsed.data, fetchedAtMs: deps.nowMs() };
  } catch (error) {
    if (isDaemonError(error)) return { ok: false, kind: "daemon_error", code: error.code, bridgeCode: error.bridgeCode };
    throw error;
  }
}

export async function readOrders(deps: ReadDeps, owner: string, signal?: AbortSignal): Promise<OrdersRead> {
  try {
    const result = await deps.client.callTool("xo_list_orders", listOrdersArgs(owner), signal);
    const refused = refusal(result.structured);
    if (refused !== null) return refused;
    const parsed = listAnswerSchema.safeParse(result.structured);
    if (!result.ok || !parsed.success) return { ok: false, kind: "schema_violation" };
    return { ok: true, data: parsed.data, fetchedAtMs: deps.nowMs() };
  } catch (error) {
    if (isDaemonError(error)) return { ok: false, kind: "daemon_error", code: error.code, bridgeCode: error.bridgeCode };
    throw error;
  }
}
