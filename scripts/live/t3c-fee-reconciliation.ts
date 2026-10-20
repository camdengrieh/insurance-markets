import { decodeAbiParameters, type Hex } from "viem";

import { ORDER_FEE_BOUND_BPS } from "../../src/xo/signing/amounts.js";
import { CTF_EXCHANGE } from "../../src/xo/chain/constants.js";
import { ORDER_FILLED_TOPIC } from "../../relay/orders.js";
import { extraString } from "./lib/args.js";
import { accountStatus, describeStatus, explorerFor, parseUsdMicro, usd } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { xoClientFor } from "./lib/market.js";
import { followOrder, maxBuyOutlayUsd, prepareOrder, signAndSubmitOrder, tokenIdFor } from "./lib/orderflow.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1, PRECONDITION_T2 } from "./lib/text.js";
import type { FactProposal, RunContext, TestResult, TestSpec } from "./lib/types.js";

// T3c  Fee reconciliation (optional)                                        docs/phase1-gap-closing.md sections 6 and 9 A11
//
// Settles: OR7, OR8 (which fee figure is real). Cost: up to 8% of $1 in fees plus a $1 position you then hold.
//
// What happens: a FOK taker BUY of about $1 on a liquid market, priced AT the best ask so it crosses. When it
// fills, the kit reconciles the OUTFLOW (amendment A11): what left the account (the credited balance before
// minus after) against what the fill says it cost (the principal at the limit price and the fee, from the
// OrderFilled log by order hash when the explorer shows it), against effectiveFeeConfig from the Data API and
// against the 800 bps on-chain bound. A BUY costs its principal plus a fee on top; the contract bounds that fee
// at 8% of the principal.
//
// Stop rule: stop if the realised fee exceeds the bound. The relay latches a tripwire on its own when it sees
// one; the kit stops and records it. A FOK that does not fill costs nothing and teaches nothing: that is
// reported as inconclusive.

const SLUG = "t3c-fee-reconciliation";
const DEFAULT_USD = "1";
const CEILING_USD = "1.10";

export const spec: TestSpec = {
  id: "T3c",
  slug: SLUG,
  title: "Fee reconciliation (optional)",
  settles: ["OR7", "OR8"],
  worstCaseUsd: CEILING_USD,
  costNote: "up to 8% of $1 in fees plus a $1 position you then hold (A10)",
  stopRule: "stop if the realised fee exceeds the 800 bps bound",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    PRECONDITION_T2,
    "T3b passed, and the credited balance holds at least $1.10.",
    "You name a liquid, active market with --token-id. A taker order BUYS shares you then hold; this test does not sell them.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_TRADING"],
  steps: [
    {
      id: "status",
      title: "Read the account and its credited balance (the 'before' of the reconciliation)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance" },
      ],
    },
    {
      id: "market",
      title: "Read the book and the fee figures: effectiveFeeConfig, the best ask",
      calls: [
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/book?token_id=..." },
        { via: "xo", method: "GET", target: "https://api-mainnet.xo.market/api/markets/... (effectiveFeeConfig)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/fee-rate?token_id=..." },
      ],
    },
    { id: "prepare", title: "Prepare a FOK BUY of about $1 at the best ask (nothing is signed or sent)", exposureUsd: CEILING_USD, calls: [{ via: "relay", method: "POST", target: "/v1/order/prepare", note: "FOK BUY" }] },
    { id: "sign", title: "Sign the Kernel-wrapped order digest once with PayBox", calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op typedData (or raw once PB2 says so)" }] },
    {
      id: "submit",
      title: "Submit once (the taker delay is 500 ms to 3 s; the relay answers pending by 6 s)",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/submit" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "the one write" },
      ],
    },
    {
      id: "reconcile",
      title: "Reconcile the outflow: balance before and after, the fill log by order hash, the fee figures, the bound",
      calls: [
        { via: "relay", method: "GET", target: "/v1/order/:hash", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (OrderFilled by order hash)" },
        { via: "relay", method: "POST", target: "/v1/account/status", note: "the 'after'" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
      ],
    },
  ],
  flags: [
    { name: "token-id", kind: "decimal", help: "The decimal token id of the market side to buy (required on the live target)." },
    { name: "usd", kind: "usd", help: "About how many USD to buy (default 1, at most 1).", defaultValue: DEFAULT_USD },
  ],
  needs: { relay: true, credentialStore: true, xoChain: true, baseChain: false, arrange: ["trading_enabled", "funded", "credentials", "fee_market"] },
  writes: [
    { label: "relay POST /v1/order/submit", max: 1 },
    { label: "orderbook POST /order", max: 2 },
  ],
  exposureUsd: () => CEILING_USD,
  checkOptions: (opts, target) => {
    if (target === "live" && extraString(opts, "token-id") === undefined) return "--token-id is required on the live target: the decimal token id of an active, liquid market.";
    const amount = extraString(opts, "usd") ?? DEFAULT_USD;
    if (!/^(0|[1-9][0-9]{0,2})(\.[0-9]{1,6})?$/.test(amount) || !/[1-9]/.test(amount)) return "--usd must be a plain amount such as 1.";
    if (Number(amount) > 1) return "--usd is at most 1 for this test.";
    return undefined;
  },
  run,
};

export interface FillTotals {
  readonly cash: bigint;
  readonly shares: bigint;
  readonly fee: bigint;
  readonly logs: number;
}

// OrderFilled(orderHash indexed, maker indexed, taker indexed, makerAssetId, takerAssetId, makerAmountFilled,
// takerAmountFilled, fee): the data holds five words. For a BUY the maker leg is cash and the taker leg is shares.
// The layout is the standard CTF-exchange one; XO's own ABI was not saved (M), so a log that does not decode
// is "not found", never a zero.
export function decodeFills(logs: ReadonlyArray<{ readonly data: Hex }>, side: "BUY" | "SELL"): FillTotals | undefined {
  let cash = 0n;
  let shares = 0n;
  let fee = 0n;
  for (const log of logs) {
    try {
      const [, , makerAmount, takerAmount, feeAmount] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], log.data);
      cash += side === "BUY" ? makerAmount : takerAmount;
      shares += side === "BUY" ? takerAmount : makerAmount;
      fee += feeAmount;
    } catch {
      return undefined;
    }
  }
  return logs.length === 0 ? undefined : { cash, shares, fee, logs: logs.length };
}

// Hundredths of a basis point: 4.00% is 40000.
function hundredthsOfBps(fee: bigint, principal: bigint): bigint {
  return principal === 0n ? 0n : (fee * 1_000_000n) / principal;
}

function showBps(hundredths: bigint): string {
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${frac} bps`;
}

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const tokenId = tokenIdFor(ctx, extraString(ctx.opts, "token-id"));
  const targetUsd = parseUsdMicro(extraString(ctx.opts, "usd") ?? DEFAULT_USD) as bigint;

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (!before.flags.ENABLE_TRADING) ctx.stop("flag_off", "ENABLE_TRADING is not effective in this relay (check KILL and the tripwires); an order would be refused.");
  const balanceBefore = before.balance_usd === null ? undefined : parseUsdMicro(before.balance_usd);
  const notReady = [
    before.state === "registered" ? undefined : `the orderbook does not know the account (${before.state})`,
    before.trading_enabled === "yes" ? undefined : `trading is not enabled (${before.trading_enabled})`,
    before.credentials.state === "validated" ? undefined : `credentials are ${before.credentials.state}: run T2`,
    balanceBefore !== undefined && balanceBefore >= (parseUsdMicro(CEILING_USD) as bigint) ? undefined : `the credited balance (${before.balance_usd ?? "unread"} USD) is below $${CEILING_USD}`,
  ].filter((entry): entry is string => entry !== undefined);
  if (notReady.length > 0 || balanceBefore === undefined) {
    return withObservations({ verdict: "inconclusive", summary: `Not ready: ${notReady.join("; ")}. Nothing was signed or sent.`, facts: [] });
  }

  ctx.step("market");
  const book = await xoClientFor(ctx).getBook(tokenId);
  const ask = book.asks[0];
  if (ask === undefined) {
    return withObservations({ verdict: "inconclusive", summary: "The book has no asks, so a taker BUY has nothing to cross. Pick a more liquid market. Nothing was signed or sent.", facts: [] });
  }
  const tick = ask.priceMicro / 1000n;
  if (tick < 1n || tick > 999n || ask.priceMicro % 1000n !== 0n) {
    return withObservations({ verdict: "inconclusive", summary: "The best ask is not on the 0.001 grid the relay trades on. Nothing was signed or sent.", facts: [] });
  }
  // Shares in micro-shares, a multiple of 1,000, whose principal at the ask stays within the target.
  const sharesMicro = ((targetUsd * 1000n) / tick / 1000n) * 1000n;
  const price = `0.${tick.toString().padStart(3, "0")}`;
  const shares = usd(sharesMicro);
  if (sharesMicro < 1_000_000n || sharesMicro > ask.sizeMicro) {
    return withObservations({ verdict: "inconclusive", summary: `The best ask holds ${usd(ask.sizeMicro)} shares at ${price}; a FOK order of ${shares} shares would not fill (or is under the 1 share floor). Pick a deeper market. Nothing was signed or sent.`, facts: [] });
  }
  ctx.observe("best ask", `${price} for ${usd(ask.sizeMicro)} shares; buying ${shares} shares`);
  let configured: number | null = null;
  try {
    const assessment = await xoClientFor(ctx).getFeeAssessment(book.conditionId);
    configured = assessment.takerFeeBps;
    ctx.observe("fee figures", `effectiveFeeConfig ${assessment.effectiveConfigBps === null ? "none" : `${String(assessment.effectiveConfigBps)} bps`}, /fee-rate ${assessment.feeRateBps.join("/")} (${assessment.status}); using ${configured === null ? "unknown (the bound applies)" : `${String(configured)} bps`}`);
  } catch {
    ctx.observe("fee figures", "could not be read; the 800 bps bound applies");
  }

  ctx.step("prepare");
  const prepared = await prepareOrder(ctx, { tokenId, side: "BUY", price, shares, tif: "FOK", ttlS: 300 });
  if (!prepared.ok) {
    ctx.observe("prepare refused", `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
    return withObservations({ verdict: "inconclusive", summary: `The relay would not prepare the order: ${cleanLine(prepared.error.message, 240)} Nothing was signed or sent.`, facts: [] });
  }
  const principal = (sharesMicro * tick) / 1000n;
  const maxOutlay = parseUsdMicro(maxBuyOutlayUsd(price, shares)) ?? parseUsdMicro(prepared.item.quote.max_outlay_usd) ?? 0n;

  const placed = await signAndSubmitOrder(ctx, prepared.item, `Buy about ${usd(principal)} USD of shares at the best ask, fill-or-kill (Kernel-wrapped order digest)`, { sign: () => ctx.step("sign"), submit: () => ctx.step("submit") });
  if ("refused" in placed) {
    return withObservations({ verdict: "fail", summary: `The relay would not submit: ${cleanLine(placed.refused.message, 240)} Nothing is sent again.`, facts: [{ id: "T3c", state: "no", note: `submit refused (${placed.refused.code}): ${cleanLine(placed.refused.message, 140)}` }] });
  }
  ctx.observe("submit", `${placed.state}${placed.detail === undefined ? "" : `: ${cleanLine(placed.detail, 200)}`} (order ${placed.orderHash})`);
  if (placed.state === "rejected") {
    return withObservations({ verdict: "inconclusive", summary: `The order was rejected: ${cleanLine(placed.detail ?? "no reason", 240)} Nothing was spent, and there is nothing to reconcile.`, facts: [] });
  }

  ctx.step("reconcile");
  const final = await followOrder(ctx, placed.orderHash, (state) => state === "filled" || state === "partially_filled" || state === "cancelled" || state === "expired" || state === "rejected", 90_000, 5_000);
  ctx.observe("order", `${final.state}${final.filled === undefined ? "" : `, filled ${final.filled}`}${final.detail === undefined ? "" : ` (${cleanLine(final.detail, 120)})`}`);
  if (final.state !== "filled" && final.state !== "partially_filled") {
    return withObservations({
      verdict: "inconclusive",
      summary: `The order ended as ${final.state}${final.timedOut ? " (not final after 90 seconds; it is not sent again)" : ""}: no fill, so no fee to reconcile. Check the balance by hand if in doubt.`,
      facts: [],
    });
  }
  const after = await accountStatus(ctx);
  ctx.observe("after", describeStatus(after));
  const balanceAfter = after.balance_usd === null ? undefined : parseUsdMicro(after.balance_usd);
  if (balanceAfter === undefined) {
    return withObservations({ verdict: "inconclusive", summary: "The credited balance after the fill could not be read, so the outflow cannot be reconciled.", facts: [] });
  }
  const outflow = balanceBefore - balanceAfter;
  ctx.observe("outflow (balance before minus after)", `${usd(outflow)} USD`);

  // The fill log by order hash, when the explorer shows it.
  let fills: FillTotals | undefined;
  try {
    const logs = await explorerFor(ctx).getLogs({ address: CTF_EXCHANGE, topic0: ORDER_FILLED_TOPIC, topic1: placed.orderHash as Hex });
    fills = logs.complete ? decodeFills(logs.logs, "BUY") : undefined;
  } catch {
    fills = undefined;
  }
  const filledMicro = final.filled === undefined ? sharesMicro : (parseUsdMicro(final.filled) ?? sharesMicro);
  const costPrincipal = fills !== undefined ? fills.cash : (filledMicro * tick) / 1000n;
  const costFee = fills !== undefined ? fills.fee : outflow > costPrincipal ? outflow - costPrincipal : 0n;
  ctx.observe("fill source", fills !== undefined ? `OrderFilled log (${String(fills.logs)} row(s)): cash ${usd(fills.cash)}, fee ${usd(fills.fee)}` : `no OrderFilled log found; principal estimated at the limit price (${usd(costPrincipal)}), fee taken as the rest of the outflow`);
  const realised = hundredthsOfBps(costFee, costPrincipal);
  ctx.observe("realised fee", `${usd(costFee)} USD on ${usd(costPrincipal)} USD = ${showBps(realised)}`);
  ctx.observe("effectiveFeeConfig", configured === null ? "unknown" : `${String(configured)} bps`);
  ctx.observe("on-chain bound", `${String(ORDER_FEE_BOUND_BPS)} bps`);

  const reconciled = fills !== undefined ? outflow - (fills.cash + fills.fee) <= 1n && (fills.cash + fills.fee) - outflow <= 1n : outflow >= costPrincipal;
  ctx.observe("outflow reconciles with the fill", reconciled ? "yes" : `NO: outflow ${usd(outflow)} vs principal and fee ${usd(costPrincipal + costFee)}`);
  const overBound = realised > BigInt(ORDER_FEE_BOUND_BPS) * 100n;
  const overDeclared = outflow > maxOutlay;
  if (overBound || overDeclared) {
    return withObservations({
      verdict: "stopped",
      summary: `STOP RULE: ${overBound ? `the realised fee ${showBps(realised)} exceeds the ${String(ORDER_FEE_BOUND_BPS)} bps bound` : `the outflow ${usd(outflow)} exceeds the declared maximum ${usd(maxOutlay)}`}. The relay latches its own tripwire; do not trade further until you have looked at this.`,
      facts: [
        { id: "T3c", state: "no", note: `realised fee ${showBps(realised)}, bound ${String(ORDER_FEE_BOUND_BPS)} bps, outflow ${usd(outflow)} against a declared maximum of ${usd(maxOutlay)}` },
        { id: "OR7", state: "no", note: `a BUY cost more than principal plus the ${String(ORDER_FEE_BOUND_BPS)} bps bound` },
      ],
    });
  }
  const facts: FactProposal[] = [
    { id: "T3c", state: reconciled ? "yes" : "no", note: `${reconciled ? "reconciled" : "did NOT reconcile"}: outflow ${usd(outflow)}, principal ${usd(costPrincipal)}, fee ${usd(costFee)} = ${showBps(realised)}; configured ${configured === null ? "unknown" : `${String(configured)} bps`}; bound ${String(ORDER_FEE_BOUND_BPS)} bps`.slice(0, 190) },
  ];
  if (reconciled) facts.push({ id: "OR7", state: "yes", value: `fee.${(realised / 100n).toString()}bps`, note: `a BUY outflow stayed within principal plus the ${String(ORDER_FEE_BOUND_BPS)} bps bound (realised ${showBps(realised)})` });
  return withObservations({
    verdict: reconciled ? "pass" : "fail",
    summary: reconciled
      ? `Reconciled: the account paid ${usd(outflow)} for a fill whose principal was ${usd(costPrincipal)}; the fee was ${showBps(realised)} against a ${String(ORDER_FEE_BOUND_BPS)} bps bound${configured === null ? "" : ` and ${String(configured)} bps configured`}.`
      : `The outflow does not reconcile with the fill (outflow ${usd(outflow)} against principal ${usd(costPrincipal)}). Look at the account by hand before trading further.`,
    facts,
  });
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
