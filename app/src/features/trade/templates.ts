// The closed list of calls a trade screen will RENDER (docs/dapp-design.md 7.2 M4-6 and M4-7):
//
//   approve exchange        USDC.e.approve(exchange, amount): Enable Trading, and its revoke with amount 0
//   setApprovalForAll       ConditionalTokens.setApprovalForAll(exchange, approved)
//   redeem                  ConditionalTokens.redeemPositions(USDC.e, 0x00..00, condition, index sets)
//   withdraw                USDC.e.approve(XO route, amount) then route.transferRemote(Base, owner, amount)
//
// Each call is checked against the pinned target, the exact argument names, and the pinned argument values (the
// spender and operator are always the exchange, the withdrawal's recipient is always the owner, the redeem's
// conditions are the ones that were asked for). A call that is not on this list, or whose arguments leave the pinned
// values, is a FAILURE and renders nothing: there is no "other call" display, so an extra call cannot be shown
// next to a good one, and the screen offers nothing to do with an item it refused (M4-7).
//
// This is the page's own check, written independently of the plugin's call decoder (src/xo/userop/calls.ts).
// It runs on the decoded block's call list; `verifyPreparedLocal` (vet.ts) then proves that list is what the
// hashed call data says, so a block cannot show one thing and hash another.

import { formatAtomic } from "@shared/guardrails/amount";
import type { DecodedCallBlock, UserOpAction } from "@shared/relay/contract";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, HYPERLANE_DOMAIN_BASE, USDC_E_ADDRESS, USDC_E_DECIMALS, XO_WARP_ROUTE } from "@shared/xo/chain/constants";

// The actions the trade screens know how to show. create_market, respond_update and cancel_market are the market
// creation family: the creation UI is not shipped (O5), so they are not here and an item of that kind never renders.
export const RENDERABLE_ACTIONS = ["deploy_enable_trading", "enable_trading", "revoke_trading", "redeem", "withdraw"] as const satisfies readonly UserOpAction[];
export type RenderableAction = (typeof RENDERABLE_ACTIONS)[number];

export function isRenderableAction(action: string): action is RenderableAction {
  return (RENDERABLE_ACTIONS as readonly string[]).includes(action);
}

export type TemplateCode =
  | "action_not_allowed"
  | "wrong_call_count"
  | "template_not_allowed"
  | "wrong_target"
  | "wrong_arguments"
  | "wrong_spender"
  | "wrong_operator"
  | "wrong_amount"
  | "wrong_recipient"
  | "wrong_destination"
  | "wrong_condition"
  | "wrong_index_sets"
  | "duplicate_condition"
  | "wrong_approval";

export interface TemplateFailure {
  readonly ok: false;
  readonly code: TemplateCode;
  // Zero-based index of the call, or -1 when the failure is about the list.
  readonly index: number;
  // Fixed sentence; it never echoes the call's own values.
  readonly reason: string;
}

export interface CallLine {
  readonly label: string;
  // Full addresses, hashes and numbers. Never shortened on a call that moves value or authority.
  readonly value: string;
}

export interface RenderedCall {
  readonly template: "usdce_approve" | "ctf_set_approval_for_all" | "ctf_redeem" | "withdraw_transfer_remote";
  readonly title: string;
  readonly target: string;
  readonly lines: readonly CallLine[];
}

export interface CallExpectations {
  // The owner the screen asked for. A withdrawal's recipient must be exactly this address, left-padded.
  readonly owner: string;
  // Redeem: the conditions that were asked for. When given, the item must redeem exactly this set.
  readonly conditionIds?: readonly string[];
  // Enable trading: the allowance that was asked for in atomic USDC.e, or null for XO's own unlimited approval.
  // undefined = not asked (a render-only display accepts either).
  readonly allowanceAtomic?: bigint | null;
  // Withdraw: the amount that was asked for, atomic USDC.e.
  readonly withdrawAtomic?: bigint;
}

export type RenderResult = { readonly ok: true; readonly calls: readonly RenderedCall[] } | TemplateFailure;

const UINT256_MAX = (1n << 256n) - 1n;
const lower = (value: string): string => value.toLowerCase();
const sameAddress = (a: string, b: string): boolean => lower(a) === lower(b);
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(0|[1-9][0-9]{0,77})$/;
const ALLOWED_INDEX_SETS: readonly (readonly string[])[] = [["1", "2"], ["1"], ["2"]];

function fail(code: TemplateCode, index: number, reason: string): TemplateFailure {
  return { ok: false, code, index, reason };
}

function exactKeys(call: DecodedCallBlock, keys: readonly string[]): boolean {
  const have = Object.keys(call.args).sort();
  const want = [...keys].sort();
  return have.length === want.length && have.every((key, position) => key === want[position]);
}

function uintOf(value: unknown): bigint | null {
  return typeof value === "string" && UINT.test(value) ? BigInt(value) : null;
}

function describeAllowance(amount: bigint): string {
  return amount >= UINT256_MAX / 2n ? "unlimited (2^256-1)" : `${formatAtomic(amount, USDC_E_DECIMALS)} USDC.e`;
}

// USDC.e.approve(spender, amount).
function approveCall(call: DecodedCallBlock, index: number, spender: string, spenderName: string): { readonly amount: bigint; readonly rendered: RenderedCall } | TemplateFailure {
  if (!sameAddress(call.to, USDC_E_ADDRESS)) return fail("wrong_target", index, "An approval goes to a contract other than USDC.e.");
  if (!exactKeys(call, ["spender", "amount"])) return fail("wrong_arguments", index, "An approval carries arguments other than a spender and an amount.");
  const given = call.args["spender"];
  if (typeof given !== "string" || !sameAddress(given, spender)) return fail("wrong_spender", index, `An approval names a spender other than the ${spenderName}.`);
  const amount = uintOf(call.args["amount"]);
  if (amount === null) return fail("wrong_amount", index, "An approval amount is not a whole number.");
  return {
    amount,
    rendered: {
      template: "usdce_approve",
      title: amount === 0n ? `Revoke: USDC.e allowance of the ${spenderName} set to 0` : `Approve the ${spenderName} to spend USDC.e`,
      target: USDC_E_ADDRESS,
      lines: [
        { label: "Contract", value: `${USDC_E_ADDRESS} (USDC.e)` },
        { label: "Function", value: "approve(spender, amount)" },
        { label: "Spender", value: `${spender} (${spenderName})` },
        { label: "Allowance", value: amount === 0n ? "0 (revoke)" : describeAllowance(amount) },
      ],
    },
  };
}

// ConditionalTokens.setApprovalForAll(exchange, approved).
function operatorCall(call: DecodedCallBlock, index: number, approved: boolean): RenderedCall | TemplateFailure {
  if (!sameAddress(call.to, CONDITIONAL_TOKENS)) return fail("wrong_target", index, "An operator approval goes to a contract other than the Conditional Tokens contract.");
  if (!exactKeys(call, ["operator", "approved"])) return fail("wrong_arguments", index, "An operator approval carries arguments other than an operator and a yes or no.");
  const operator = call.args["operator"];
  if (typeof operator !== "string" || !sameAddress(operator, CTF_EXCHANGE)) return fail("wrong_operator", index, "An operator approval names an operator other than the exchange.");
  if (call.args["approved"] !== approved) return fail("wrong_approval", index, approved ? "The operator approval does not switch the exchange on." : "The operator approval does not switch the exchange off.");
  return {
    template: "ctf_set_approval_for_all",
    title: approved ? "Approve the exchange to move your position tokens" : "Remove the exchange as operator of your position tokens",
    target: CONDITIONAL_TOKENS,
    lines: [
      { label: "Contract", value: `${CONDITIONAL_TOKENS} (Conditional Tokens)` },
      { label: "Function", value: "setApprovalForAll(operator, approved)" },
      { label: "Operator", value: `${CTF_EXCHANGE} (exchange)` },
      { label: "Approved", value: approved ? "true" : "false" },
    ],
  };
}

function enableRender(calls: readonly DecodedCallBlock[], expect: CallExpectations): RenderResult {
  if (calls.length !== 2) return fail("wrong_call_count", -1, "Enable Trading is exactly two calls: the USDC.e approval and the operator approval.");
  const [first, second] = calls as readonly [DecodedCallBlock, DecodedCallBlock];
  if (first.template !== "usdce_approve") return fail("template_not_allowed", 0, "The first call is not the USDC.e approval.");
  if (second.template !== "ctf_set_approval_for_all") return fail("template_not_allowed", 1, "The second call is not the operator approval.");
  const approve = approveCall(first, 0, CTF_EXCHANGE, "exchange");
  if ("ok" in approve) return approve;
  if (approve.amount === 0n) return fail("wrong_amount", 0, "Enable Trading approves a zero allowance, which enables nothing.");
  if (expect.allowanceAtomic !== undefined) {
    const wanted = expect.allowanceAtomic === null ? UINT256_MAX : expect.allowanceAtomic;
    if (approve.amount !== wanted) return fail("wrong_amount", 0, "The allowance differs from the one that was asked for.");
  }
  const operator = operatorCall(second, 1, true);
  if ("ok" in operator) return operator;
  return { ok: true, calls: [approve.rendered, operator] };
}

function revokeRender(calls: readonly DecodedCallBlock[]): RenderResult {
  if (calls.length !== 2) return fail("wrong_call_count", -1, "Revoke is exactly two calls: the zero approval and the operator removal.");
  const [first, second] = calls as readonly [DecodedCallBlock, DecodedCallBlock];
  if (first.template !== "usdce_approve") return fail("template_not_allowed", 0, "The first call is not the USDC.e approval.");
  if (second.template !== "ctf_set_approval_for_all") return fail("template_not_allowed", 1, "The second call is not the operator approval.");
  const approve = approveCall(first, 0, CTF_EXCHANGE, "exchange");
  if ("ok" in approve) return approve;
  if (approve.amount !== 0n) return fail("wrong_amount", 0, "A revoke sets the allowance to 0, and this one does not.");
  const operator = operatorCall(second, 1, false);
  if ("ok" in operator) return operator;
  return { ok: true, calls: [approve.rendered, operator] };
}

function redeemRender(calls: readonly DecodedCallBlock[], expect: CallExpectations): RenderResult {
  if (calls.length < 1 || calls.length > 50) return fail("wrong_call_count", -1, "A redeem is one to fifty calls.");
  const wanted = expect.conditionIds === undefined ? null : new Set(expect.conditionIds.map(lower));
  const seen = new Set<string>();
  const rendered: RenderedCall[] = [];
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index] as DecodedCallBlock;
    if (call.template !== "ctf_redeem") return fail("template_not_allowed", index, "A redeem contains a call that is not a redeem.");
    if (!sameAddress(call.to, CONDITIONAL_TOKENS)) return fail("wrong_target", index, "A redeem goes to a contract other than the Conditional Tokens contract.");
    if (!exactKeys(call, ["condition_id", "index_sets"])) return fail("wrong_arguments", index, "A redeem carries arguments other than a condition and its index sets.");
    const condition = call.args["condition_id"];
    if (typeof condition !== "string" || !HEX32.test(condition)) return fail("wrong_condition", index, "A redeem names a condition that is not a 32-byte id.");
    const id = lower(condition);
    if (id === `0x${"0".repeat(64)}`) return fail("wrong_condition", index, "A redeem names the zero condition.");
    if (seen.has(id)) return fail("duplicate_condition", index, "A redeem names the same condition twice.");
    seen.add(id);
    if (wanted !== null && !wanted.has(id)) return fail("wrong_condition", index, "A redeem names a condition that was not asked for.");
    const sets = call.args["index_sets"];
    if (!Array.isArray(sets) || !ALLOWED_INDEX_SETS.some((allowed) => allowed.length === sets.length && allowed.every((value, position) => value === sets[position]))) {
      return fail("wrong_index_sets", index, "A redeem's index sets are not [1,2], [1] or [2].");
    }
    rendered.push({
      template: "ctf_redeem",
      title: "Redeem a resolved market",
      target: CONDITIONAL_TOKENS,
      lines: [
        { label: "Contract", value: `${CONDITIONAL_TOKENS} (Conditional Tokens)` },
        { label: "Function", value: "redeemPositions(collateral, parent, condition, indexSets)" },
        { label: "Collateral", value: `${USDC_E_ADDRESS} (USDC.e)` },
        { label: "Condition", value: id },
        { label: "Index sets", value: `[${sets.join(",")}]` },
      ],
    });
  }
  if (wanted !== null && (wanted.size !== seen.size || [...wanted].some((id) => !seen.has(id)))) {
    return fail("wrong_condition", -1, "The redeem leaves out a condition that was asked for.");
  }
  return { ok: true, calls: rendered };
}

function leftPadded(owner: string): string {
  return `0x${"0".repeat(24)}${lower(owner).slice(2)}`;
}

function withdrawRender(calls: readonly DecodedCallBlock[], expect: CallExpectations): RenderResult {
  if (calls.length !== 2) return fail("wrong_call_count", -1, "A withdrawal is exactly two calls: the route approval and the transfer.");
  const [first, second] = calls as readonly [DecodedCallBlock, DecodedCallBlock];
  if (first.template !== "usdce_approve") return fail("template_not_allowed", 0, "The first call is not the USDC.e approval.");
  if (second.template !== "withdraw_transfer_remote") return fail("template_not_allowed", 1, "The second call is not the transfer.");
  const approve = approveCall(first, 0, XO_WARP_ROUTE, "XO route");
  if ("ok" in approve) return approve;
  if (approve.amount === 0n || approve.amount >= UINT256_MAX / 2n) return fail("wrong_amount", 0, "A withdrawal approves an exact positive amount, never zero and never unlimited.");
  if (!sameAddress(second.to, XO_WARP_ROUTE)) return fail("wrong_target", 1, "The transfer goes to a contract other than the XO route.");
  if (!exactKeys(second, ["destination", "recipient", "amount"])) return fail("wrong_arguments", 1, "The transfer carries arguments other than a destination, a recipient and an amount.");
  if (second.args["destination"] !== String(HYPERLANE_DOMAIN_BASE)) return fail("wrong_destination", 1, "The transfer does not go to Base.");
  const recipient = second.args["recipient"];
  // The destination is fixed to the owner, left-padded to 32 bytes: a right-padded or foreign word strands or steals the funds.
  if (typeof recipient !== "string" || lower(recipient) !== leftPadded(expect.owner)) return fail("wrong_recipient", 1, "The transfer's recipient is not the owner address.");
  const amount = uintOf(second.args["amount"]);
  if (amount === null || amount !== approve.amount) return fail("wrong_amount", 1, "The transfer amount differs from the approved amount.");
  if (expect.withdrawAtomic !== undefined && amount !== expect.withdrawAtomic) return fail("wrong_amount", 1, "The withdrawal amount differs from the one that was asked for.");
  return {
    ok: true,
    calls: [
      approve.rendered,
      {
        template: "withdraw_transfer_remote",
        title: "Send USDC.e from your XO account to your own address on Base",
        target: XO_WARP_ROUTE,
        lines: [
          { label: "Contract", value: `${XO_WARP_ROUTE} (XO route)` },
          { label: "Function", value: "transferRemote(destination, recipient, amount)" },
          { label: "Destination", value: `domain ${HYPERLANE_DOMAIN_BASE} (Base)` },
          { label: "Recipient", value: `${expect.owner} (your owner address)` },
          { label: "Amount", value: `${formatAtomic(amount, USDC_E_DECIMALS)} USDC.e` },
        ],
      },
    ],
  };
}

// Renders the calls of a user operation of `action`, or says why it cannot. Nothing is rendered on failure.
export function renderCalls(action: string, calls: readonly DecodedCallBlock[], expect: CallExpectations): RenderResult {
  if (!isRenderableAction(action)) return fail("action_not_allowed", -1, "This kind of operation is not shown here.");
  switch (action) {
    case "deploy_enable_trading":
    case "enable_trading":
      return enableRender(calls, expect);
    case "revoke_trading":
      return revokeRender(calls);
    case "redeem":
      return redeemRender(calls, expect);
    case "withdraw":
      return withdrawRender(calls, expect);
  }
}
