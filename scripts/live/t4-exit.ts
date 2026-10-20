import { pad, toHex } from "viem";

import { parseDecimalAtomic } from "../../src/guardrails/amount.js";
import { HYPERLANE_DOMAIN_BASE, XO_WARP_ROUTE } from "../../src/xo/chain/constants.js";
import { padAddressTopic } from "../../src/xo/chain/reads.js";
import { SENT_TRANSFER_REMOTE_TOPIC } from "../../src/xo/funding/delivery.js";
import { baseRpcFor } from "./lib/base.js";
import { accountStatus, describeStatus, explorerFor, rawPrefixFromFacts, signItem, StepFailed, usd, waitForUserOp } from "./lib/flows.js";
import { extraString } from "./lib/args.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_FUNDED_ONE_WAY, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL } from "./lib/text.js";
import type { FactProposal, Options, RunContext, TestResult, TestSpec } from "./lib/types.js";

// T4  Exit test (H1)                                                        docs/phase1-gap-closing.md sections 3.4 (FU9) and 6
//
// Settles: FU9, UO8, N5. It decides whether funding beyond the test amount is allowed at all.
// Cost: it reuses part of the T3a deposit; in the worst case that money stays stranded (up to $3). $1 is
// enough to prove the exit, and leaves the rest of a $2 to $3 deposit for T3b and T3c (amendment A10).
//
// The hypothesis (H1): a paymaster-less, zero-fee user operation [USDC.e.approve(route, a),
// route.transferRemote(8453, owner, a)] takes a back to the owner on Base. The destination is the owner
// address only (the relay's withdraw action has no destination field), after an XO-side
// quoteTransferRemote check that the route still asks for no fee. You sign the userOpHash once; the relay
// submits once; the kit watches the Base balance of the owner for the arrival (expected about 30 seconds).
//
// Stop rule: rejected means nothing moved. Accepted but not delivered after 10 minutes: no retry. The
// kit makes one prepare and one submit, and the transport refuses a second of either.

const SLUG = "t4-exit";
const CEILING_USD = "3";
const ARRIVAL_MS = 10 * 60_000;

export const spec: TestSpec = {
  id: "T4",
  slug: SLUG,
  title: "Exit test (H1)",
  settles: ["FU9", "UO8", "N5"],
  worstCaseUsd: CEILING_USD,
  costNote: "it reuses the T3a deposit; worst case the amount stays stranded on XO",
  stopRule: "rejected: nothing moved. Accepted but not delivered after 10 minutes: no retry",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    "T3a passed: the deposit was delivered and credited, and the account holds at least the amount you are about to send back as USDC.e on XO. Send back only part of it ($1 proves the exit) if T3b and T3c will follow.",
    PRECONDITION_FUNDED_ONE_WAY,
    "ENABLE_WITHDRAW is armed for this run only. The destination is always the owner address on Base; there is no field for another.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_USEROP_SUBMIT", "ENABLE_WITHDRAW"],
  steps: [
    {
      id: "status",
      title: "Read the account and the owner's Circle USDC balance on Base",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance (the registry check, the account only)" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "base", method: "POST", target: "https://mainnet.base.org (eth_call balanceOf)", note: "read" },
      ],
    },
    {
      id: "prepare",
      title: "Prepare the withdrawal: no paymaster, zero fee, destination the owner only (nothing is signed or sent)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "withdraw" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (balanceOf, quoteTransferRemote, getNonce)", note: "reads only" },
      ],
    },
    { id: "sign", title: "Sign the userOpHash once with PayBox (op raw)", calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op raw" }] },
    {
      id: "submit",
      title: "Submit once (never retried)",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "the one write" },
      ],
    },
    {
      id: "wait",
      title: "Follow the operation until it is included or rejected",
      calls: [
        { via: "relay", method: "GET", target: "/v1/userop/:hash", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (UserOperationEvent by hash)", note: "repeated" },
      ],
    },
    {
      id: "arrival",
      title: "Watch the owner's Base balance for up to 10 minutes",
      calls: [
        { via: "base", method: "POST", target: "https://mainnet.base.org (eth_call balanceOf)", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (SentTransferRemote on the XO route)", note: "evidence only" },
      ],
    },
  ],
  flags: [{ name: "amount-usd", kind: "usd", help: "The USDC.e to send back to the owner on Base, up to 3 and no more than the account holds ($1 proves the exit; required).", required: true }],
  needs: { relay: true, credentialStore: false, xoChain: true, baseChain: true, arrange: ["trading_enabled", "funded"] },
  writes: [
    { label: "relay POST /v1/userop/submit", max: 1 },
    { label: "bundler eth_sendUserOperation", max: 1 },
  ],
  exposureUsd: (opts: Options) => extraString(opts, "amount-usd") ?? CEILING_USD,
  checkOptions: (opts) => {
    const amount = extraString(opts, "amount-usd");
    if (amount === undefined) return "--amount-usd is required: how many USD to send back (up to 3; 1 proves the exit).";
    if (!/[1-9]/.test(amount)) return "--amount-usd must be more than zero.";
    if (Number(amount) > Number(CEILING_USD)) return `--amount-usd $${amount} is above the T4 ceiling of $${CEILING_USD}.`;
    return undefined;
  },
  run,
};

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const amountText = extraString(ctx.opts, "amount-usd") as string;
  const parsed = parseDecimalAtomic(amountText, 6);
  if (!parsed.ok) throw new Error("amount was validated before the run");
  const amount = parsed.value;
  const fail = (summary: string, facts: readonly FactProposal[]): TestResult => withObservations({ verdict: "fail", summary, facts });

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (before.state === "undeployed") return withObservations({ verdict: "inconclusive", summary: "The account is not deployed; there is nothing to take out. Nothing was signed or sent.", facts: [] });
  if (!before.flags.ENABLE_WITHDRAW || !before.flags.ENABLE_USEROP_SUBMIT) {
    ctx.stop("flag_off", "ENABLE_WITHDRAW or ENABLE_USEROP_SUBMIT is not effective in this relay (check KILL and the tripwires); a withdrawal would be refused.");
  }
  const base = baseRpcFor(ctx);
  const baseBefore = await base.balanceOf(ctx.owner);
  ctx.observe("owner's Base USDC before", `${usd(baseBefore)} USD`);

  ctx.step("prepare");
  const prepared = await ctx.client.post("/v1/userop/prepare", { owner: ctx.owner, action: "withdraw", params: { amount_usd: amountText } });
  if (!prepared.ok) {
    ctx.observe("prepare refused", `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
    if (prepared.error.code === "precondition_failed" || prepared.error.code === "capability_unknown" || prepared.error.code === "upstream_rejected") {
      return withObservations({ verdict: "inconclusive", summary: `The relay would not prepare the withdrawal: ${cleanLine(prepared.error.message, 240)} Nothing moved.`, facts: [] });
    }
    throw new StepFailed("userop/prepare", prepared.error, prepared.status);
  }
  const item = prepared.data;
  ctx.observe("user_op_hash", item.user_op_hash);
  ctx.observe("digest_tag", item.summary.digest_tag);
  for (const line of item.summary.lines) ctx.say(`   ${cleanLine(line, 300)}`);
  for (const warning of item.warnings) ctx.say(`   warning: ${cleanLine(warning, 300)}`);

  ctx.step("sign");
  const prefix = rawPrefixFromFacts(ctx);
  const signed = await signItem(ctx, item, `Take ${amountText} USDC.e back to your own Base address (userOpHash)`, { ...(prefix === undefined ? {} : { rawHexPrefix: prefix }), validForS: 300 });
  ctx.observe("signature", `recovers the owner under the ${signed.form} digest`);

  ctx.step("submit");
  const submitted = await ctx.client.post("/v1/userop/submit", { prepared_id: item.prepared_id, signature: signed.input });
  if (!submitted.ok) {
    ctx.observe("submit refused", `${submitted.error.code}: ${cleanLine(submitted.error.message, 240)}`);
    return fail(`The relay would not submit: ${cleanLine(submitted.error.message, 240)} Nothing moved.`, [{ id: "T4", state: "no", note: `submit refused (${submitted.error.code}): ${cleanLine(submitted.error.message, 140)}` }]);
  }
  ctx.observe("submit", `${submitted.data.state}${submitted.data.detail === undefined ? "" : `: ${cleanLine(submitted.data.detail, 200)}`}`);
  if (submitted.data.state === "rejected") {
    return fail(`The bundler rejected the withdrawal: ${cleanLine(submitted.data.detail ?? "no reason given", 240)} Nothing moved.`, [
      { id: "T4", state: "no", note: `rejected, nothing moved: ${cleanLine(submitted.data.detail ?? "", 140)}` },
      { id: "FU9", state: "no", note: "a paymaster-less zero-fee withdrawal was rejected by the bundler" },
    ]);
  }

  ctx.step("wait");
  const watch = await waitForUserOp(ctx, item.user_op_hash, 10 * 60_000);
  ctx.observe("operation", `${watch.state}${watch.txHash === undefined ? "" : ` in ${watch.txHash}`}${watch.detail === undefined ? "" : ` (${cleanLine(watch.detail, 160)})`}`);
  if (watch.state === "rejected") return fail("The withdrawal was rejected after it was accepted. Nothing moved.", [{ id: "T4", state: "no", note: "rejected after acceptance, nothing moved" }]);
  if (watch.state === "failed") return fail("The withdrawal was included but its execution reverted. Nothing moved.", [{ id: "T4", state: "no", note: "included with a reverted execution, nothing moved" }]);
  if (watch.state !== "included") {
    return withObservations({ verdict: "inconclusive", summary: `The withdrawal is ${watch.timedOut ? "still not included after 10 minutes" : watch.state}. It is NOT sent again. Follow it by hash ${item.user_op_hash}.`, facts: [] });
  }

  ctx.step("arrival");
  const arrived = await ctx.poll<{ readonly now: bigint }>(
    "the withdrawal to reach your Base address",
    async () => {
      const now = await base.balanceOf(ctx.owner);
      ctx.say(`   owner's Base USDC now ${usd(now)} USD (before ${usd(baseBefore)})`);
      return { done: now - baseBefore >= amount, value: { now } };
    },
    { timeoutMs: ARRIVAL_MS, everyMs: 15_000 },
  );
  ctx.observe("owner's Base USDC after", `${usd(arrived.value.now)} USD`);
  // Evidence only: the XO route's own log of the send. Its absence from the explorer proves nothing.
  try {
    const sent = await explorerFor(ctx).getLogs({ address: XO_WARP_ROUTE, topic0: SENT_TRANSFER_REMOTE_TOPIC, topic1: pad(toHex(HYPERLANE_DOMAIN_BASE), { size: 32 }), topic2: padAddressTopic(ctx.owner) });
    ctx.observe("XO SentTransferRemote", sent.logs.length > 0 ? `${String(sent.logs.length)} log(s) to the owner` : "not seen in the explorer (evidence only)");
  } catch {
    ctx.observe("XO SentTransferRemote", "could not be read (evidence only)");
  }
  const after = await accountStatus(ctx);
  ctx.observe("after", describeStatus(after));

  if (!arrived.timedOut) {
    return withObservations({
      verdict: "pass",
      summary: `The exit works: ${amountText} USDC.e left XO and reached the owner on Base. H1 holds for this account. Funding beyond the test amount is now a decision for you (open item O2), not a blocked path.`,
      facts: [
        { id: "T4", state: "yes", note: `a paymaster-less zero-fee withdrawal of ${amountText} reached the owner's Base address` },
        { id: "FU9", state: "yes", note: "H1 holds: [approve(route), transferRemote(8453, owner)] from a user operation exits funds" },
        { id: "UO8", state: "yes", note: "a user operation with no paymaster and zero fees landed for this account" },
      ],
    });
  }
  return fail(`STOP RULE: the withdrawal was included but nothing reached Base in 10 minutes. No retry: a second attempt would only burn a second amount. The funds may be stranded until XO's relayer processes the message. Treat the account as one-way and keep funding at or below the test amount.`, [
    { id: "T4", state: "no", note: "included, but no arrival on Base within 10 minutes; not retried" },
  ]);
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
