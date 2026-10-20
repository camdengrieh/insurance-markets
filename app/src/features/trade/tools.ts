// The only tools the trade screens can ask the daemon to run, and the page-side schema of each answer.
//
// THE LIST IS CLOSED AND HAS NO SEND IN IT. TradeTool names two read-class plugin tools (xo_account, xo_list_orders)
// and five prepare-class ones (xo_prepare_order, xo_deploy_enable_trading, xo_revoke_trading, xo_redeem,
// xo_fund_account). The client accepts only that type, every prepare-class builder below sets `step: "prepare"`, and
// there is no builder for a submit step, a cancel, a signature or an arm: submitting is the agent's act, through an
// agent token with the submit scope and an open ARM window, and the daemon refuses a page (ui) token for it. A test
// compares this list with the daemon's class table (bridge/tool-classes.ts) so a class change is a failing test.
//
// ANSWERS ARE UNTRUSTED. The plugin passes the relay's words through (cleaned, but written by a service we do not
// control). Every answer is validated here before anything is shown; a field the schema does not name is dropped,
// a missing or malformed field makes the whole answer a "schema violation". Text that may quote the relay or a market
// leaves this file only as the Untrusted<string> brand.

import * as z from "zod/v4";

import { untrustedField } from "../../core/untrusted";
import type { Untrusted } from "../../core/ports";

export const TRADE_READ_TOOLS = ["xo_account", "xo_list_orders"] as const;
export const TRADE_PREPARE_TOOLS = ["xo_prepare_order", "xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem", "xo_fund_account"] as const;
export const TRADE_TOOLS = [...TRADE_READ_TOOLS, ...TRADE_PREPARE_TOOLS] as const;
export type TradeTool = (typeof TRADE_TOOLS)[number];
export type TradePrepareTool = (typeof TRADE_PREPARE_TOOLS)[number];

export function isTradeTool(name: string): name is TradeTool {
  return (TRADE_TOOLS as readonly string[]).includes(name);
}

export function toolClassOf(tool: TradeTool): "read" | "prepare" {
  return (TRADE_READ_TOOLS as readonly string[]).includes(tool) ? "read" : "prepare";
}

export type ToolArgs = Readonly<Record<string, string | number | boolean | readonly string[]>>;

// ---- argument builders -------------------------------------------------------------------------------------------------

export function accountArgs(owner: string): ToolArgs {
  return { owner };
}

export function listOrdersArgs(owner: string): ToolArgs {
  return { owner };
}

export interface OrderArgsInput {
  readonly owner: string;
  readonly tokenId: string;
  readonly side: "BUY" | "SELL";
  // The canonical strings from the ticket (ticket.ts), the same ones the relay writes back.
  readonly price: string;
  readonly shares: string;
  readonly tif: "GTD" | "FOK" | "FAK";
  readonly ttlS: number | null;
  readonly postOnly: boolean;
}

export function orderArgs(input: OrderArgsInput): ToolArgs {
  return {
    owner: input.owner,
    token_id: input.tokenId,
    side: input.side,
    price: input.price,
    shares: input.shares,
    tif: input.tif,
    ...(input.ttlS === null ? {} : { ttl_s: input.ttlS }),
    ...(input.postOnly ? { post_only: true } : {}),
  };
}

export function deployArgs(owner: string, allowanceUsd: string | null): ToolArgs {
  return { step: "prepare", owner, ...(allowanceUsd === null ? {} : { allowance_usd: allowanceUsd }) };
}

export function revokeArgs(owner: string): ToolArgs {
  return { step: "prepare", owner };
}

export function redeemArgs(owner: string, conditionIds: readonly string[]): ToolArgs {
  return { step: "prepare", owner, condition_ids: [...conditionIds] };
}

export function fundArgs(owner: string, amountUsd: string): ToolArgs {
  return { owner, amount_usd: amountUsd };
}

// ---- building blocks ---------------------------------------------------------------------------------------------------

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const tokenId = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const decimal = z.string().regex(/^(0|[1-9][0-9]{0,29})(\.[0-9]{1,18})?$/);
const tri = z.enum(["yes", "no", "unknown"]);
const flagSnapshot = z.record(z.string().regex(/^[A-Z_]{1,40}$/), z.boolean());
const word = z.string().regex(/^[a-z0-9_]{1,64}$/);

// ---- xo_account -------------------------------------------------------------------------------------------------------------

const claimEntry = z.object({
  condition_id: hex32,
  outcome: z.enum(["Yes", "No"]),
  token_id: tokenId,
  shares: decimal,
  shares_micro: z.string().regex(/^(0|[1-9][0-9]{0,29})$/),
  reason: z.enum(["resolved_winner", "voided_refund", "unknown"]),
});

export const accountAnswerSchema = z.object({
  owner: address,
  account: address,
  state: z.enum(["undeployed", "deployed_unregistered", "registered", "unknown"]),
  deployed: tri,
  registered: tri,
  trading_enabled: z.object({ status: z.enum(["enabled", "disabled", "unknown"]), allowance_unlimited: z.boolean().nullable() }),
  balance: z.object({ usdc_e: decimal }).nullable(),
  claimable: z.object({ entries: z.array(claimEntry).max(100), total: z.number().int().min(0), truncated: z.boolean(), available: z.boolean() }),
  flags: z.object({ plugin: flagSnapshot, relay: flagSnapshot.nullable() }),
  caps: z.object({ max_order_usd: decimal, max_daily_usd: decimal, advisory: z.literal(true) }),
  kill_switch: z.boolean(),
  capabilities: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,47}$/), z.enum(["unknown", "yes", "no"])).nullable(),
  unproven_capabilities: z.array(z.string().max(48)).max(64),
  warnings: z.array(z.string().max(2000)).max(50),
});
export type AccountAnswer = z.infer<typeof accountAnswerSchema>;

// ---- xo_list_orders ---------------------------------------------------------------------------------------------------------------

const openOrder = z.object({
  order_hash: hex32,
  token_id: tokenId,
  side: z.enum(["BUY", "SELL"]),
  price: decimal,
  original_shares: decimal,
  remaining_shares: decimal,
  expires_at: z.string().max(40).nullable(),
});

export const listAnswerSchema = z.object({
  outcome: z.literal("listed"),
  orders: z.array(openOrder).max(100),
  total: z.number().int().min(0),
  truncated: z.boolean(),
});
export type ListAnswer = z.infer<typeof listAnswerSchema>;
export type OpenOrder = z.infer<typeof openOrder>;

// ---- prepare answers ---------------------------------------------------------------------------------------------------------------

export const preparedAnswerSchema = z.object({
  outcome: z.enum(["prepared", "dry_run"]),
  code: word,
  message: z.string().max(4000),
  next_action: z.string().max(4000),
  warnings: z.array(z.string().max(2000)).max(50),
  unproven_capabilities: z.array(z.string().max(48)).max(64),
  // Validated against the relay contract by vet.ts; here it is only required to be there.
  prepared: z.unknown().refine((value) => typeof value === "object" && value !== null, "an item"),
});
export type PreparedAnswer = z.infer<typeof preparedAnswerSchema>;

export const refusalAnswerSchema = z.object({
  outcome: z.literal("refused"),
  code: word,
  message: z.string().max(4000),
  next_action: z.string().max(4000).optional(),
  flag: z.string().regex(/^[A-Z_]{1,40}$/).optional(),
});
export type RefusalAnswer = z.infer<typeof refusalAnswerSchema>;

// A string the answer carries that may quote the relay or a market: branded, capped, shown only in the slot.
export function untrustedText(value: string): Untrusted<string> {
  return untrustedField("generic", value);
}
