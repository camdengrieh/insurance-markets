import { extraString } from "./lib/args.js";
import { accountStatus, describeStatus, waitForUserOp } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cleanLine } from "./lib/redact.js";
import { prepareUserOp, signAndSubmitUserOp } from "./lib/userop.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1 } from "./lib/text.js";
import type { RunContext, TestResult, TestSpec } from "./lib/types.js";

// T5  Redeem                                                                docs/phase1-gap-closing.md sections 3.2 (UO11) and 6
//
// Settles: UO11, the nonce lanes, the paymaster's policy for a foreign account. Cost: $0 (sponsored when the
// paymaster allows it, otherwise no paymaster and zero fees, which is what XO's own bots do).
//
// redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2]) on a condition that RESOLVED, where this account holds
// nothing (under standard Conditional Tokens behaviour that succeeds with a zero payout; XO's contract source
// is unverified, so this is itself the test), or on a real $1 position that resolved. The relay refuses a
// condition it cannot prove resolved (a payoutDenominator above zero, or a ConditionResolution log), de-dupes,
// and allows at most 50 conditions per operation; this test sends exactly one.
//
// Stop rule: none. A revert on zero holdings is informative, not a failure of the tool: it is reported as
// inconclusive and teaches you how XO's token contract treats an empty redeem.

const SLUG = "t5-redeem";

export const spec: TestSpec = {
  id: "T5",
  slug: SLUG,
  title: "Redeem",
  settles: ["UO11", "nonce lanes", "paymaster policy for a foreign account"],
  worstCaseUsd: "0",
  costNote: "zero fees; sponsored or paymaster-less",
  stopRule: "none; a revert on zero holdings is informative, not a failure of the tool",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    "You name a condition id (--condition-id) that has RESOLVED, on which this account holds nothing (or holds a real resolved position you want to redeem). The relay refuses an unresolved one.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_USEROP_SUBMIT"],
  steps: [
    {
      id: "status",
      title: "Read the account: it must be deployed (positive proof)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (deployment logs)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance (the registry check, the account only)" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
      ],
    },
    {
      id: "prepare",
      title: "Prepare the redeem: the relay proves the condition resolved, builds the call, reads the nonce and the paymaster",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "redeem" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (ConditionResolution by condition id)" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (payoutDenominator, paused, checkPolicy, getNonce)", note: "reads only" },
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
      title: "Follow the operation; included with success is a pass, included but reverted is informative",
      calls: [
        { via: "relay", method: "GET", target: "/v1/userop/:hash", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (UserOperationEvent: its success flag)", note: "repeated" },
      ],
    },
  ],
  flags: [{ name: "condition-id", kind: "hex32", help: "The 32-byte condition id of a RESOLVED market (required on the live target)." }],
  needs: { relay: true, credentialStore: false, xoChain: true, baseChain: false, arrange: ["trading_enabled", "resolved_condition"] },
  writes: [
    { label: "relay POST /v1/userop/submit", max: 1 },
    { label: "bundler eth_sendUserOperation", max: 1 },
  ],
  exposureUsd: () => "0",
  checkOptions: (opts, target) => (target === "live" && extraString(opts, "condition-id") === undefined ? "--condition-id is required on the live target: the condition id of a resolved market." : undefined),
  run,
};

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const conditionId = (extraString(ctx.opts, "condition-id") ?? ctx.world.state.conditionId) as `0x${string}` | undefined;
  if (conditionId === undefined) return withObservations({ verdict: "inconclusive", summary: "Give --condition-id: a resolved condition. Nothing was signed or sent.", facts: [] });

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  ctx.observe("condition", conditionId);
  if (!before.flags.ENABLE_USEROP_SUBMIT) ctx.stop("flag_off", "ENABLE_USEROP_SUBMIT is not effective in this relay (check KILL and the tripwires); a submit would be refused.");
  if (before.state === "undeployed") return withObservations({ verdict: "inconclusive", summary: "The account is not deployed, so there is nothing to redeem with. Run T1 first. Nothing was signed or sent.", facts: [] });

  ctx.step("prepare");
  const prepared = await prepareUserOp(ctx, { owner: ctx.owner, action: "redeem", params: { condition_ids: [conditionId] } });
  if (!prepared.ok) {
    ctx.observe("prepare refused", `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
    return withObservations({ verdict: "inconclusive", summary: `The relay would not prepare the redeem: ${cleanLine(prepared.error.message, 240)} Nothing was signed or sent.`, facts: [] });
  }

  const sent = await signAndSubmitUserOp(ctx, prepared.item, "Redeem a resolved condition (userOpHash)", { sign: () => ctx.step("sign"), submit: () => ctx.step("submit") });
  if ("refused" in sent) {
    ctx.observe("submit refused", `${sent.refused.code}: ${cleanLine(sent.refused.message, 240)}`);
    return withObservations({ verdict: "fail", summary: `The relay would not submit: ${cleanLine(sent.refused.message, 240)} Nothing is sent again.`, facts: [{ id: "T5", state: "no", note: `submit refused (${sent.refused.code}): ${cleanLine(sent.refused.message, 140)}` }] });
  }
  if (sent.state === "rejected") {
    return withObservations({ verdict: "fail", summary: `The bundler rejected the redeem: ${cleanLine(sent.detail ?? "no reason given", 240)}`, facts: [{ id: "T5", state: "no", note: `the bundler rejected a redeem from this account: ${cleanLine(sent.detail ?? "", 140)}` }] });
  }

  ctx.step("wait");
  const watch = await waitForUserOp(ctx, sent.hash, 10 * 60_000);
  ctx.observe("operation", `${watch.state}${watch.txHash === undefined ? "" : ` in ${watch.txHash}`}${watch.detail === undefined ? "" : ` (${cleanLine(watch.detail, 160)})`}`);
  if (watch.state === "included") {
    return withObservations({
      verdict: "pass",
      summary: "The redeem was accepted by the bundler and executed on chain with success. UO11 holds for this account.",
      facts: [
        { id: "T5", state: "yes", note: "a redeemPositions user operation from this account landed and executed" },
        { id: "UO11", state: "yes", note: "redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2]) executes for this account once the condition resolved" },
      ],
    });
  }
  if (watch.state === "failed") {
    return withObservations({
      verdict: "inconclusive",
      summary: "The redeem was included but its execution reverted. On a condition where the account holds nothing that is informative, not a failure of the tool: XO's token contract refuses an empty redeem. Try again on a real resolved position if you have one.",
      facts: [],
    });
  }
  if (watch.state === "rejected") {
    return withObservations({ verdict: "fail", summary: "The redeem was rejected after it was accepted.", facts: [{ id: "T5", state: "no", note: "rejected after acceptance" }] });
  }
  return withObservations({ verdict: "inconclusive", summary: `The redeem is ${watch.timedOut ? "still not included after 10 minutes" : watch.state}. It is NOT sent again. Follow it by hash ${sent.hash}.`, facts: [] });
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
