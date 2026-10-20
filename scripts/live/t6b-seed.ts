import type { Hex } from "viem";

import { planSeedOrder, resolveSeedTokens, seedOrderRequest, seedReadiness } from "../../src/xo/creation/seed.js";
import { SEED_CAP_ATOMIC } from "../../src/xo/signing/amounts.js";
import { extraBool, extraString } from "./lib/args.js";
import { accountStatus, describeStatus, parseUsdMicro, usd } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { xoClientFor } from "./lib/market.js";
import { cancelOrder, followOrder, listHas, signAndSubmitOrder } from "./lib/orderflow.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1, PRECONDITION_T2 } from "./lib/text.js";
import { Refusal, type RunContext, type TestResult, type TestSpec } from "./lib/types.js";

// T6b  Seed (after T6 is active)                                            docs/phase1-gap-closing.md sections 3.5 (CR7), 6 and 9 A3, A10
//
// Settles: CR7: does the gateway accept a creator's seed order once the market is active (docs say 422 while it
// is pending)? Cost: a $10.00 stake locked (the relay's seed cap is $10.80, the stake times the 1.08 fee
// multiplier), released on cancel. No fill is expected: a seed is a resting post-only BUY.
//
// Per amendment A3 no GTC order is ever placed: the seed is a post-only GTD BUY living 7 to 30 days. The kit
// reads the market's own record at the orderbook, refuses unless it says active, checks which token is Yes
// against the creation log, asks the relay to prepare the order with purpose seed (the relay accepts a seed
// only for a market this owner created), you sign once, the relay submits once; the kit finds the order,
// then cancels it unless you asked to keep it (--keep-seed).
//
// A3 + A10: T6 ($1) plus T6b ($10.80) is above the $10 funding cap that holds until T4 passes. Raising that cap
// is your decision (open item O2), not something this script does.
//
// Stop rule: a 422 "market is not active" means wait. The kit does not retry; run it again later.

const SLUG = "t6b-seed";
const CEILING_USD = "10.8";

export const spec: TestSpec = {
  id: "T6b",
  slug: SLUG,
  title: "Seed (after T6 is active)",
  settles: ["CR7"],
  worstCaseUsd: CEILING_USD,
  costNote: "a $10.00 stake locked (cap $10.80 with the fee multiplier), released on cancel; above the $10 funding cap until T4 passes (O2)",
  stopRule: '422 "market is not active" means wait',
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    PRECONDITION_T2,
    "T6 passed: the market you name is ACTIVE at the orderbook and was created by this account.",
    "The account holds at least $10.80 credited on the orderbook. The funding cap of $10 until T4 passes means that needs an explicit decision from you (O2).",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_TRADING", "XO_ENABLE_CREATE"],
  steps: [
    {
      id: "status",
      title: "Read the account: registered, trading enabled, credentials validated, balance covers the seed cap",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (deployment logs)" },
      ],
    },
    {
      id: "market",
      title: "Read the market's own record at the orderbook: active? which token is Yes?",
      calls: [
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/markets/{conditionId}" },
        { via: "relay", method: "POST", target: "/v1/creation/track", note: "the review loop's view" },
        { via: "xo", method: "GET", target: "https://api-mainnet.xo.market/api/markets/contract/{conditionId}", note: "the market record (status, tokens); numbers only, market text is never shown" },
      ],
    },
    {
      id: "prepare",
      title: "Plan and prepare the seed: post-only GTD BUY, $10 stake, 7 to 30 days (nothing is signed or sent)",
      exposureUsd: CEILING_USD,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/prepare", note: "purpose seed" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/time" },
      ],
    },
    { id: "sign", title: "Sign the Kernel-wrapped order digest once with PayBox", calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op typedData (or raw once PB2 says so)" }] },
    {
      id: "submit",
      title: "Submit once (never retried)",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/submit" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "the one write" },
      ],
    },
    {
      id: "check",
      title: "Find the order by hash and in the open-orders list",
      calls: [
        { via: "relay", method: "GET", target: "/v1/order/:hash" },
        { via: "relay", method: "POST", target: "/v1/orders/list" },
      ],
    },
    {
      id: "cancel",
      title: "Cancel it (unless --keep-seed)",
      write: true,
      when: "unless --keep-seed",
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/cancel" },
        { via: "xo", method: "DELETE", target: "https://orderbooks.xo.market/order", note: "write" },
      ],
    },
  ],
  flags: [
    { name: "condition-id", kind: "hex32", help: "The condition id of the market T6 created (required on the live target)." },
    { name: "outcome", kind: "string", help: "Which side to back, yes or no (default yes).", defaultValue: "yes" },
    { name: "price", kind: "decimal", help: "Price per share between 0.05 and 0.95 at which the $10 stake lands on the grid exactly (default 0.5).", defaultValue: "0.5" },
    { name: "ttl-days", kind: "int", help: "Order life in days, 7 to 30 (default 7).", defaultValue: "7" },
    { name: "keep-seed", kind: "bool", help: "Leave the seed resting instead of cancelling it." },
  ],
  needs: { relay: true, credentialStore: true, xoChain: true, baseChain: false, creation: true, arrange: ["trading_enabled", "funded_seed", "credentials", "created_market"] },
  writes: [
    { label: "relay POST /v1/order/submit", max: 1 },
    { label: "orderbook POST /order", max: 2 },
    { label: "relay POST /v1/order/cancel", max: 1 },
    { label: "orderbook DELETE /order", max: 3 },
  ],
  exposureUsd: () => CEILING_USD,
  checkOptions: (opts, target) => {
    if (target === "live" && extraString(opts, "condition-id") === undefined) return "--condition-id is required on the live target: the condition id of the market T6 created.";
    const outcome = extraString(opts, "outcome") ?? "yes";
    if (outcome !== "yes" && outcome !== "no") return "--outcome must be yes or no.";
    const days = Number(extraString(opts, "ttl-days") ?? "7");
    if (!Number.isInteger(days) || days < 7 || days > 30) return "--ttl-days must be 7 to 30.";
    return undefined;
  },
  run,
};

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const conditionId = (extraString(ctx.opts, "condition-id") ?? ctx.world.state.marketConditionId) as Hex | undefined;
  if (conditionId === undefined) return withObservations({ verdict: "inconclusive", summary: "Give --condition-id: the market T6 created. Nothing was signed or sent.", facts: [] });
  const keep = extraBool(ctx.opts, "keep-seed");
  const outcome = extraString(ctx.opts, "outcome") ?? "yes";
  const ttlS = Number(extraString(ctx.opts, "ttl-days") ?? "7") * 86_400;

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (!before.flags.ENABLE_TRADING || !before.flags.XO_ENABLE_CREATE) ctx.stop("flag_off", "ENABLE_TRADING or XO_ENABLE_CREATE is not effective in this relay (check KILL and the tripwires); a seed would be refused.");
  const balance = before.balance_usd === null ? undefined : parseUsdMicro(before.balance_usd);
  const notReady = [
    before.state === "registered" ? undefined : `the orderbook does not know the account (${before.state})`,
    before.trading_enabled === "yes" ? undefined : `trading is not enabled (${before.trading_enabled})`,
    before.credentials.state === "validated" ? undefined : `credentials are ${before.credentials.state}: run T2`,
    balance !== undefined && balance >= SEED_CAP_ATOMIC ? undefined : `the credited balance (${before.balance_usd ?? "unread"} USD) is below the seed cap of $${usd(SEED_CAP_ATOMIC)}`,
  ].filter((entry): entry is string => entry !== undefined);
  if (notReady.length > 0) return withObservations({ verdict: "inconclusive", summary: `Not ready for a seed: ${notReady.join("; ")}. Nothing was signed or sent.`, facts: [] });

  ctx.step("market");
  const record = await xoClientFor(ctx).getOrderbookMarket(conditionId);
  ctx.observe("orderbook record", `active ${String(record.active)}`);
  const tracked = await ctx.client.post("/v1/creation/track", { condition_id: conditionId });
  const phase = tracked.ok ? tracked.data.status : "unknown";
  ctx.observe("review loop", tracked.ok ? `${tracked.data.status} (decision ${tracked.data.review.decision})` : `unavailable (${tracked.error.code})`);
  const ready = seedReadiness({ phase: phase === "active" ? "active" : "pending", orderbookActive: record.active });
  if (!ready.ready) {
    return withObservations({ verdict: "inconclusive", summary: `The market is not ready for a seed (${ready.reason}). A seed on a market that is not active gets 422 "market is not active": wait, then run this again. Nothing was signed or sent.`, facts: [] });
  }
  const tokens = resolveSeedTokens({ eventYesTokenId: record.yesTokenId, eventNoTokenId: record.noTokenId, orderbookTokens: [{ token_id: record.yesTokenId }, { token_id: record.noTokenId }] });
  if (!tokens.ok) return withObservations({ verdict: "inconclusive", summary: `${tokens.message} Nothing was signed or sent.`, facts: [] });

  ctx.step("prepare");
  const planned = planSeedOrder({
    outcome,
    yesTokenId: tokens.yesTokenId,
    noTokenId: tokens.noTokenId,
    price: extraString(ctx.opts, "price") ?? "0.5",
    ttlS,
    nowS: Math.floor(ctx.clock.nowMs() / 1000),
    tokensVerified: tokens.verified,
  });
  if (!planned.ok) return withObservations({ verdict: "inconclusive", summary: `The seed cannot be planned: ${planned.message}${planned.choices === undefined ? "" : ` Prices that fit a $10 stake: ${planned.choices.join(", ")}.`} Nothing was signed or sent.`, facts: [] });
  const plan = planned.plan;
  ctx.observe("seed", `${plan.outcome.toUpperCase()}: ${plan.shares} shares at ${plan.price} = ${usd(plan.principalAtomic)} USD principal, cap ${usd(plan.capAtomic)} USD, ${String(plan.ttlS / 86_400)} days`);
  for (const warning of plan.warnings) ctx.say(`   note: ${cleanLine(warning, 240)}`);
  const prepared = await ctx.client.post("/v1/order/prepare", seedOrderRequest(plan, ctx.owner));
  if (!prepared.ok) {
    ctx.observe("prepare refused", `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
    return withObservations({ verdict: "inconclusive", summary: `The relay would not prepare the seed: ${cleanLine(prepared.error.message, 240)} Nothing was signed or sent.`, facts: [] });
  }
  ctx.observe("order digest_tag", prepared.data.summary.digest_tag);
  for (const line of prepared.data.summary.lines) ctx.say(`   ${cleanLine(line, 300)}`);

  const placed = await signAndSubmitOrder(ctx, prepared.data, `Rest a $10 seed: post-only BUY of ${plan.shares} at ${plan.price}, ${String(plan.ttlS / 86_400)} days (Kernel-wrapped order digest)`, { sign: () => ctx.step("sign"), submit: () => ctx.step("submit") });
  if ("refused" in placed) {
    return withObservations({ verdict: "fail", summary: `The relay would not submit the seed: ${cleanLine(placed.refused.message, 240)} Nothing is sent again.`, facts: [{ id: "T6b", state: "no", note: `submit refused (${placed.refused.code}): ${cleanLine(placed.refused.message, 140)}` }] });
  }
  ctx.observe("submit", `${placed.state}${placed.detail === undefined ? "" : `: ${cleanLine(placed.detail, 200)}`} (order ${placed.orderHash})`);
  if (placed.state === "rejected") {
    const notActive = /not active|pending/i.test(placed.detail ?? "");
    return withObservations({
      verdict: notActive ? "inconclusive" : "fail",
      summary: notActive ? `The gateway says the market is not active yet (${cleanLine(placed.detail ?? "", 200)}). That means wait. Nothing rests; run this again later.` : `The gateway rejected the seed: ${cleanLine(placed.detail ?? "no reason given", 240)}`,
      facts: notActive ? [] : [{ id: "T6b", state: "no", note: `seed rejected: ${cleanLine(placed.detail ?? "", 150)}` }],
    });
  }

  ctx.step("check");
  const followed = await followOrder(ctx, placed.orderHash, (state) => state === "open" || state === "partially_filled" || state === "filled" || state === "rejected" || state === "cancelled", 60_000, 5_000);
  ctx.observe("seed order", `${followed.state}${followed.detail === undefined ? "" : ` (${cleanLine(followed.detail, 120)})`}`);
  if (followed.state !== "open" && followed.state !== "partially_filled") {
    return withObservations({ verdict: "inconclusive", summary: `The seed ended as ${followed.state}. It is NOT sent again. Reconcile by order hash ${placed.orderHash}.`, facts: [] });
  }
  const listed = await listHas(ctx, placed.orderHash);
  ctx.observe("open-orders list", listed.has ? "contains the seed" : "does NOT contain the seed");
  if (!keep) {
    ctx.step("cancel");
    const cancelled = await cancelOrder(ctx, placed.orderHash).catch((error: unknown) => {
      if (error instanceof Refusal) return { state: `refused (${error.code})`, detail: undefined };
      throw error;
    });
    ctx.observe("cancel", cancelled.state);
  }
  return withObservations({
    verdict: listed.has ? "pass" : "fail",
    summary: listed.has
      ? `The gateway accepted a $10 seed on the active market ${conditionId}${keep ? " and it is left resting for " + String(plan.ttlS / 86_400) + " days" : " and it was cancelled"}. CR7 holds: a creator can seed once the market is active.`
      : "The seed was accepted but is not in the open-orders list.",
    facts: listed.has ? [{ id: "T6b", state: "yes", note: "a post-only GTD seed was accepted on an active market created by this account" }, { id: "CR7", state: "yes", note: "the gateway accepts a creator's seed once the market is active" }] : [{ id: "T6b", state: "no", note: "accepted but not listed" }],
  });
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
