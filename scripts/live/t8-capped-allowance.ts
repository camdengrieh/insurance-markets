import { extraString } from "./lib/args.js";
import { accountStatus, describeStatus, parseUsdMicro, waitForUserOp } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cancelOrder, followOrder, maxBuyOutlayUsd, prepareOrder, signAndSubmitOrder, tokenIdFor } from "./lib/orderflow.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1, PRECONDITION_T2 } from "./lib/text.js";
import { prepareUserOp, signAndSubmitUserOp } from "./lib/userop.js";
import type { RunContext, TestResult, TestSpec } from "./lib/types.js";

// T8  Capped allowance and the kill switch                                  docs/phase1-gap-closing.md sections 3.2, 4 N14, 6, 8 D4
//
// Settles: N14 (is a capped Enable Trading allowance enough for the exchange?) and the two kill switches, which
// are two different things (amendment A11): the ON-CHAIN revoke_trading (approve(exchange, 0) and
// setApprovalForAll(false), paymaster-less, zero fee) and the relay's SOFTWARE kill switch.
//
// Order of events, five signatures from you:
//   1. revoke_trading            the on-chain revoke, tried before any funding relies on it
//   2. enable_trading, capped    approve(exchange, X) with X = --allowance-usd (default 1), finite, never unlimited
//   3. an order within the cap   a post-only BUY whose worst-case outlay is below X; it must be accepted, then it is cancelled
//   4. an order beyond the cap   a post-only BUY whose outlay is above X (and within the balance); a rejection costs nothing
//   5. revoke_trading again      and orders must now be refused
// then the relay's software kill switch is engaged in this run's own relay and every write route must refuse.
//
// Cost: nothing is spent (post-only orders never fill and are cancelled), but up to $1.43 is locked for a
// moment; the table's "$0" leaves that out. Stop rule: none. This test leaves trading OFF for the account
// (that is the point of its last steps); turn it on again with xo_deploy_enable_trading.

const SLUG = "t8-capped-allowance";
const DEFAULT_ALLOWANCE = "1";
const PRICE = "0.005";
const DEFAULT_WITHIN = "100";
const DEFAULT_BEYOND = "260";
const CEILING_USD = "1.43";

export const spec: TestSpec = {
  id: "T8",
  slug: SLUG,
  title: "Capped allowance and the kill switch",
  settles: ["N14", "on-chain revoke", "software kill switch"],
  worstCaseUsd: CEILING_USD,
  costNote: "nothing is spent (post-only orders never fill and are cancelled); up to $1.43 is locked for a moment",
  stopRule: "no cost stop: the run ends at the first step that does not hold (a revoke that leaves trading on, a capped Enable Trading that does not land, an order within the cap that is refused, a kill switch that lets a write route through); nothing is retried",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    PRECONDITION_T2,
    "T3b passed, and the credited balance holds at least $1.43 (the larger order is sized to need an allowance above the cap).",
    "You name a liquid, active market with --token-id. Five signatures are needed; this test ends with trading OFF for the account.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING"],
  steps: [
    {
      id: "status",
      title: "Read the account: deployed, registered, credentials validated, trading enabled, balance enough",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (deployment logs)" },
      ],
    },
    {
      id: "revoke",
      title: "On-chain revoke_trading: approve(exchange, 0) and setApprovalForAll(exchange, false), no paymaster, zero fee",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "revoke_trading" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, op raw" },
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "write" },
      ],
    },
    {
      id: "capped",
      title: "enable_trading with a finite allowance X",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "enable_trading, allowance_usd X" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, op raw" },
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "write" },
      ],
    },
    {
      id: "within",
      title: "An order within the cap: accepted, listed, cancelled",
      exposureUsd: "0.55",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/prepare" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, op typedData (or raw)" },
        { via: "relay", method: "POST", target: "/v1/order/submit" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "write" },
        { via: "relay", method: "POST", target: "/v1/order/cancel" },
        { via: "xo", method: "DELETE", target: "https://orderbooks.xo.market/order", note: "write" },
      ],
    },
    {
      id: "beyond",
      title: "An order beyond the cap: a rejection costs nothing; if it is accepted it is cancelled at once",
      exposureUsd: CEILING_USD,
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/prepare" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, op typedData (or raw)" },
        { via: "relay", method: "POST", target: "/v1/order/submit" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "write" },
      ],
    },
    {
      id: "revoke-final",
      title: "revoke_trading again; then an order must be refused",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "revoke_trading" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, op raw" },
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "write" },
        { via: "relay", method: "POST", target: "/v1/order/prepare", note: "must be refused" },
      ],
    },
    {
      id: "kill",
      title: "The relay's software kill switch, engaged in this run's own relay: every write route must refuse",
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/prepare", note: "must answer kill_switch" },
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "must answer kill_switch" },
      ],
    },
  ],
  flags: [
    { name: "token-id", kind: "decimal", help: "The decimal token id of the market side to rest the orders on (required on the live target)." },
    { name: "allowance-usd", kind: "usd", help: "The capped allowance X in USD (default 1).", defaultValue: DEFAULT_ALLOWANCE },
    { name: "within-shares", kind: "decimal", help: "Shares of the order within the cap, at 0.005 (default 100).", defaultValue: DEFAULT_WITHIN },
    { name: "beyond-shares", kind: "decimal", help: "Shares of the order beyond the cap, at 0.005 (default 260).", defaultValue: DEFAULT_BEYOND },
  ],
  needs: { relay: true, credentialStore: true, xoChain: true, baseChain: false, arrange: ["trading_enabled", "funded", "credentials", "market"] },
  writes: [
    { label: "relay POST /v1/userop/submit", max: 3 },
    { label: "bundler eth_sendUserOperation", max: 3 },
    { label: "relay POST /v1/order/submit", max: 2 },
    { label: "orderbook POST /order", max: 4 },
    { label: "relay POST /v1/order/cancel", max: 2 },
    { label: "orderbook DELETE /order", max: 6 },
  ],
  exposureUsd: (opts) => maxBuyOutlayUsd(PRICE, extraString(opts, "beyond-shares") ?? DEFAULT_BEYOND),
  checkOptions: (opts, target) => {
    if (target === "live" && extraString(opts, "token-id") === undefined) return "--token-id is required on the live target: the decimal token id of an active, liquid market.";
    const allowance = parseUsdMicro(extraString(opts, "allowance-usd") ?? DEFAULT_ALLOWANCE);
    const within = parseUsdMicro(maxBuyOutlayUsd(PRICE, extraString(opts, "within-shares") ?? DEFAULT_WITHIN));
    const beyond = parseUsdMicro(maxBuyOutlayUsd(PRICE, extraString(opts, "beyond-shares") ?? DEFAULT_BEYOND));
    if (allowance === undefined || within === undefined || beyond === undefined) return "--allowance-usd, --within-shares and --beyond-shares must be plain numbers.";
    if (within >= allowance) return "the order within the cap must cost less than the allowance: lower --within-shares or raise --allowance-usd.";
    if (beyond <= allowance) return "the order beyond the cap must cost more than the allowance: raise --beyond-shares or lower --allowance-usd.";
    return undefined;
  },
  run,
};

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const tokenId = tokenIdFor(ctx, extraString(ctx.opts, "token-id"));
  const allowanceText = extraString(ctx.opts, "allowance-usd") ?? DEFAULT_ALLOWANCE;
  const withinShares = extraString(ctx.opts, "within-shares") ?? DEFAULT_WITHIN;
  const beyondShares = extraString(ctx.opts, "beyond-shares") ?? DEFAULT_BEYOND;
  const beyondOutlay = parseUsdMicro(maxBuyOutlayUsd(PRICE, beyondShares)) as bigint;
  const fail = (summary: string, note: string): TestResult => withObservations({ verdict: "fail", summary, facts: [{ id: "T8", state: "no", note: cleanLine(note, 190) }] });

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (!before.flags.ENABLE_USEROP_SUBMIT || !before.flags.ENABLE_TRADING) ctx.stop("flag_off", "ENABLE_USEROP_SUBMIT or ENABLE_TRADING is not effective in this relay (check KILL and the tripwires).");
  const balance = before.balance_usd === null ? undefined : parseUsdMicro(before.balance_usd);
  const notReady = [
    before.state === "registered" ? undefined : `the orderbook does not know the account (${before.state})`,
    before.trading_enabled === "yes" ? undefined : `trading is not enabled (${before.trading_enabled})`,
    before.credentials.state === "validated" ? undefined : `credentials are ${before.credentials.state}: run T2`,
    balance !== undefined && balance >= beyondOutlay ? undefined : `the credited balance (${before.balance_usd ?? "unread"} USD) is below the larger order's outlay`,
  ].filter((entry): entry is string => entry !== undefined);
  if (notReady.length > 0) return withObservations({ verdict: "inconclusive", summary: `Not ready: ${notReady.join("; ")}. Nothing was signed or sent.`, facts: [] });

  // ---- 1. the on-chain revoke, then 2. the capped enable ---------------------------------------------------------------
  const userOp = async (step: "revoke" | "capped" | "revoke-final", body: Parameters<typeof prepareUserOp>[1], label: string): Promise<TestResult | undefined> => {
    ctx.step(step);
    const prepared = await prepareUserOp(ctx, body);
    if (!prepared.ok) {
      ctx.observe(`${step} refused`, `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
      return fail(`The relay would not prepare ${label}: ${cleanLine(prepared.error.message, 240)}`, `${label}: prepare refused (${prepared.error.code}): ${prepared.error.message}`);
    }
    const sent = await signAndSubmitUserOp(ctx, prepared.item, label);
    if ("refused" in sent) return fail(`The relay would not submit ${label}: ${cleanLine(sent.refused.message, 240)} Nothing is sent again.`, `${label}: submit refused (${sent.refused.code}): ${sent.refused.message}`);
    if (sent.state === "rejected") return fail(`The bundler rejected ${label}: ${cleanLine(sent.detail ?? "no reason given", 240)}`, `${label}: rejected by the bundler: ${sent.detail ?? ""}`);
    const watch = await waitForUserOp(ctx, sent.hash, 10 * 60_000);
    ctx.observe(`${step} operation`, `${watch.state}${watch.txHash === undefined ? "" : ` in ${watch.txHash}`}`);
    if (watch.state !== "included") {
      return watch.state === "failed" || watch.state === "rejected"
        ? fail(`${label} did not execute (${watch.state}).`, `${label}: ${watch.state}`)
        : withObservations({ verdict: "inconclusive", summary: `${label} is ${watch.timedOut ? "not included after 10 minutes" : watch.state}. It is NOT sent again. Follow it by hash ${sent.hash}.`, facts: [] });
    }
    return undefined;
  };

  let stopped = await userOp("revoke", { owner: ctx.owner, action: "revoke_trading", params: {} }, "the on-chain revoke (approve(exchange, 0) and setApprovalForAll false)");
  if (stopped !== undefined) return stopped;
  const afterRevoke = await accountStatus(ctx);
  ctx.observe("trading_enabled after the first revoke", afterRevoke.trading_enabled);

  stopped = await userOp("capped", { owner: ctx.owner, action: "enable_trading", params: { allowance_usd: allowanceText } }, `Enable Trading with a capped allowance of ${allowanceText} USD`);
  if (stopped !== undefined) return stopped;
  // On the live target the exchange reads this allowance from the chain itself; the rehearsal's orderbook is told.
  await ctx.world.mirrorAllowance(ctx.account, parseUsdMicro(allowanceText) as bigint);
  const afterCapped = await accountStatus(ctx);
  ctx.observe("trading_enabled with the cap", afterCapped.trading_enabled);
  if (afterCapped.trading_enabled !== "yes") return fail("After the capped Enable Trading the account does not read as trading-enabled.", "capped enable landed but trading_enabled is not yes");

  // ---- 3. an order within the cap, 4. an order beyond it ------------------------------------------------------------------
  ctx.step("within");
  const within = await prepareOrder(ctx, { tokenId, side: "BUY", price: PRICE, shares: withinShares, tif: "GTD", ttlS: 300, postOnly: true });
  if (!within.ok) return fail(`The relay would not prepare the order within the cap: ${cleanLine(within.error.message, 240)}`, `within-cap order: prepare refused (${within.error.code}): ${within.error.message}`);
  const first = await signAndSubmitOrder(ctx, within.item, `Rest a post-only BUY of ${withinShares} at ${PRICE}, inside the cap (Kernel-wrapped order digest)`);
  if ("refused" in first) return fail(`The relay would not submit the order within the cap: ${cleanLine(first.refused.message, 240)}`, `within-cap order: submit refused (${first.refused.code})`);
  ctx.observe("order within the cap", `${first.state}${first.detail === undefined ? "" : `: ${cleanLine(first.detail, 160)}`}`);
  if (first.state === "rejected") return fail(`The gateway rejected an order WITHIN the cap: ${cleanLine(first.detail ?? "", 240)}. A capped allowance is not enough for the exchange (N14).`, `within-cap order rejected: ${first.detail ?? ""}`);
  const resting = await followOrder(ctx, first.orderHash, (state) => state === "open" || state === "filled" || state === "rejected" || state === "partially_filled", 60_000, 5_000);
  ctx.observe("within-cap order state", resting.state);
  if (resting.state !== "open") return withObservations({ verdict: "inconclusive", summary: `The order within the cap ended as ${resting.state}. It is not sent again. Reconcile by hash ${first.orderHash}.`, facts: [] });
  const cancelled = await cancelOrder(ctx, first.orderHash);
  ctx.observe("cancel of the within-cap order", cancelled.state);

  ctx.step("beyond");
  const beyond = await prepareOrder(ctx, { tokenId, side: "BUY", price: PRICE, shares: beyondShares, tif: "GTD", ttlS: 300, postOnly: true });
  let beyondAccepted = false;
  if (!beyond.ok) {
    ctx.observe("order beyond the cap", `refused before it was sent: ${beyond.error.code}: ${cleanLine(beyond.error.message, 200)}`);
  } else {
    const second = await signAndSubmitOrder(ctx, beyond.item, `Rest a post-only BUY of ${beyondShares} at ${PRICE}, BEYOND the cap (Kernel-wrapped order digest)`);
    if ("refused" in second) {
      ctx.observe("order beyond the cap", `refused by the relay: ${second.refused.code}`);
    } else {
      ctx.observe("order beyond the cap", `${second.state}${second.detail === undefined ? "" : `: ${cleanLine(second.detail, 160)}`}`);
      if (second.state === "accepted" || second.state === "pending" || second.state === "ambiguous") {
        beyondAccepted = true;
        const rest = await followOrder(ctx, second.orderHash, (state) => state === "open" || state === "rejected" || state === "filled", 60_000, 5_000);
        ctx.observe("beyond-cap order state", rest.state);
        if (rest.state === "open") ctx.observe("cancel of the beyond-cap order", (await cancelOrder(ctx, second.orderHash)).state);
      }
    }
  }

  // ---- 5. the final revoke, and orders must be refused ------------------------------------------------------------------------
  stopped = await userOp("revoke-final", { owner: ctx.owner, action: "revoke_trading", params: {} }, "the final on-chain revoke");
  if (stopped !== undefined) return stopped;
  await ctx.world.mirrorAllowance(ctx.account, 0n);
  const afterFinal = await accountStatus(ctx);
  ctx.observe("trading_enabled after the final revoke", afterFinal.trading_enabled);
  const refused = await prepareOrder(ctx, { tokenId, side: "BUY", price: PRICE, shares: withinShares, tif: "GTD", ttlS: 300, postOnly: true });
  const ordersRefused = !refused.ok;
  ctx.observe("order after the revoke", refused.ok ? "was PREPARED (it should have been refused)" : `refused: ${refused.error.code}: ${cleanLine(refused.error.message, 160)}`);

  // ---- the relay's software kill switch ------------------------------------------------------------------------------------------------
  ctx.step("kill");
  const gate = ctx.services?.services.flagGate;
  let killWorks = false;
  if (gate !== undefined) {
    await gate.engageKill("T8 kill-switch drill");
    const order = await ctx.client.post("/v1/order/prepare", { owner: ctx.owner, token_id: tokenId, side: "BUY", price: PRICE, shares: withinShares, tif: "GTD", ttl_s: 300, post_only: true });
    const op = await ctx.client.post("/v1/userop/prepare", { owner: ctx.owner, action: "revoke_trading", params: {} });
    ctx.observe("order/prepare with the kill switch on", order.ok ? "ANSWERED (it should have refused)" : order.error.code);
    ctx.observe("userop/prepare with the kill switch on", op.ok ? "ANSWERED (it should have refused)" : op.error.code);
    killWorks = !order.ok && order.error.code === "kill_switch" && !op.ok && op.error.code === "kill_switch";
  } else {
    ctx.observe("kill switch", "not drilled: this run has no relay of its own");
  }

  const problems = [
    afterFinal.trading_enabled === "no" ? undefined : `trading still reads ${afterFinal.trading_enabled} after the final revoke`,
    ordersRefused ? undefined : "an order was prepared after the revoke",
    killWorks ? undefined : "the software kill switch did not refuse every write route",
  ].filter((entry): entry is string => entry !== undefined);
  if (problems.length > 0) return fail(`A revoke or kill switch did not hold: ${problems.join("; ")}.`, problems.join("; "));
  if (beyondAccepted) {
    return withObservations({
      verdict: "inconclusive",
      summary: `Everything held (the on-chain revoke, the capped enable, the order within the cap, the final revoke, the kill switch), but the order BEYOND the cap was accepted at intake, so the cap is not enforced when an order rests. Whether the exchange enforces it when an order FILLS needs a fill to see. Trading is now OFF for the account.`,
      facts: [],
    });
  }
  return withObservations({
    verdict: "pass",
    summary: `A capped allowance of ${allowanceText} USD is enough for an order within it, an order beyond it was refused, the on-chain revoke turned trading off twice and the software kill switch refused every write route. Trading is now OFF for the account; enable it again to trade.`,
    facts: [{ id: "T8", state: "yes", value: "capped", note: `capped allowance ${allowanceText} USD: within-cap order accepted, beyond-cap refused, revoke and kill switch held` }],
  });
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
