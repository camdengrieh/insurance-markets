import { readDeploymentLogs, readTradingEnabled } from "../../src/xo/chain/reads.js";
import { extraBool } from "./lib/args.js";
import { accountStatus, describeStatus, expectOk, explorerFor, rawPrefixFromFacts, signItem, StepFailed, waitForUserOp } from "./lib/flows.js";
import { prepareUserOp, signAndSubmitUserOp } from "./lib/userop.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cleanLine } from "./lib/redact.js";
import type { FactProposal, RunContext, TestResult, TestSpec } from "./lib/types.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL } from "./lib/text.js";

// T1  Deploy plus Enable Trading (door a)                                   docs/phase1-gap-closing.md section 6
//
// Settles: AD5, UO3 to UO7, door (a), part of door (b), the residual of gates 3 and 4.
// Cost: $0 (sponsored, zero fee). Exposure: an unlimited allowance on a $0 account.
//
// What it does: the relay derives the owner's XO account, confirms from the chain's logs that it is not
// deployed, builds the deploying operation (initCode, then USDC.e.approve(exchange, max) and
// CTF.setApprovalForAll(exchange, true), zero fees, sponsored by the PolicyPaymaster after checkPolicy),
// and you sign its digest ONCE with PayBox (op raw). The relay submits it once. The script then follows
// the operation and reads the four logs that prove it: AccountDeployed (sender = the account),
// OwnerRegistered, Approval and ApprovalForAll, and asks the orderbook whether it now knows the account.
//
// With --prove-revoke (amendment A11, strongly recommended before any funding) it goes on to prove the way
// OUT of the allowance while the account still holds $0: the on-chain revoke_trading (approve(exchange, 0)
// and setApprovalForAll(exchange, false), sent WITHOUT a paymaster at zero fee), checked by reading the
// allowance back, and then Enable Trading again so the account is as it was. Two more signatures, two more
// operations, still $0. The software kill switch is a different thing (T8 drills it).
//
// Stop rule: any 401 or 403 ("key required") from the bundler, the node or the explorer: record "requires
// key", stop, and do not look for a key. A plain rejection text becomes a capability fact.

const SLUG = "t1-deploy-enable-trading";

export const spec: TestSpec = {
  id: "T1",
  slug: SLUG,
  title: "Deploy plus Enable Trading (door a)",
  settles: ["AD5", "UO3", "UO4", "UO5", "UO6", "UO7", "door (a)", "part of door (b)", "residual of gates 3 and 4"],
  worstCaseUsd: "0",
  costNote: "sponsored with zero fees; the unlimited allowance it grants is on an account that holds $0",
  stopRule: 'any 401, 403 or "key required": record "requires key", stop, do not look for a key; a plain rejection text is stored as a capability fact',
  preconditions: [PRECONDITION_DEDICATED, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_NO_RELAY_RUNNING, "The account is not deployed yet. Do not fund an account before this test passes."],
  flagsToArm: ["ENABLE_USEROP_SUBMIT"],
  steps: [
    {
      id: "status",
      title: "Read the account: derive it from the owner, check from the logs that it is undeployed",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (getLogs: AccountDeployed, OwnerRegistered, Approval, ApprovalForAll)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance (the account, never the owner)" },
      ],
    },
    {
      id: "prepare",
      title: "Prepare the deploying operation (nothing is signed or sent)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "deploy_enable_trading" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (paused, checkPolicy, getNonce)", note: "reads only" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_estimateUserOperationGas", note: "read" },
      ],
    },
    {
      id: "sign",
      title: "Sign the userOpHash once with PayBox (op raw)",
      calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op raw, the relay's digest unchanged" }],
    },
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
      title: "Follow the operation until it is included, rejected or the time is up",
      calls: [
        { via: "relay", method: "GET", target: "/v1/userop/:hash", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (UserOperationEvent by hash)", note: "repeated" },
      ],
    },
    {
      id: "verify",
      title: "Read the four logs and ask the orderbook whether it knows the account",
      calls: [
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (AccountDeployed, OwnerRegistered, Approval, ApprovalForAll)" },
        { via: "relay", method: "POST", target: "/v1/account/status" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance" },
      ],
    },
    {
      id: "revoke",
      title: "Prove the way out (A11): the on-chain revoke_trading, no paymaster, zero fee; sign once, submit once, read the allowance back",
      write: true,
      when: "only with --prove-revoke, and only after the deployment passed",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "revoke_trading" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op raw, the relay's digest unchanged" },
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "the second write" },
        { via: "relay", method: "POST", target: "/v1/account/status", note: "trading_enabled must read no" },
      ],
    },
    {
      id: "restore",
      title: "Enable Trading again so the account is as T1 left it; sign once, submit once, read the allowance back",
      write: true,
      when: "only with --prove-revoke",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "enable_trading" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op raw, the relay's digest unchanged" },
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "the third write" },
        { via: "relay", method: "POST", target: "/v1/account/status", note: "trading_enabled must read yes" },
      ],
    },
  ],
  flags: [{ name: "prove-revoke", kind: "bool", help: "After the deployment, prove the on-chain revoke_trading (paymaster-less, zero fee) and enable trading again: two more signatures, still $0. Recommended before any funding (A11)." }],
  needs: { relay: true, credentialStore: false, xoChain: true, baseChain: false, arrange: [] },
  writes: [
    { label: "relay POST /v1/userop/submit", max: 1 },
    { label: "bundler eth_sendUserOperation", max: 1 },
  ],
  writesFor: (opts) => {
    const count = extraBool(opts, "prove-revoke") ? 3 : 1;
    return [
      { label: "relay POST /v1/userop/submit", max: count },
      { label: "bundler eth_sendUserOperation", max: count },
    ];
  },
  exposureUsd: () => "0",
  run,
};

const WAIT_MS = 10 * 60_000;

function fail(summary: string, note: string, extra: readonly FactProposal[] = []): TestResult {
  return { verdict: "fail", summary, facts: [{ id: "T1", state: "no", note }, ...extra], observations: [] };
}

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: TestResult): TestResult => ({ ...result, observations: ctx.observations() });

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (!before.flags.ENABLE_USEROP_SUBMIT) {
    ctx.stop("flag_off", "ENABLE_USEROP_SUBMIT is not effective in this relay, so a submit would be refused. The script arms it for its own relay; check KILL and the data directory's tripwires.");
  }
  if (before.state !== "undeployed") {
    return withObservations({
      verdict: "inconclusive",
      summary: `The account is already ${before.state}: this test deploys, so it has nothing to do. Use xo_deploy_enable_trading for an enable-only step. Nothing was signed or sent.`,
      facts: [],
      observations: [],
    });
  }

  ctx.step("prepare");
  const prepared = await ctx.client.post("/v1/userop/prepare", { owner: ctx.owner, action: "deploy_enable_trading", params: {} });
  if (!prepared.ok) {
    const error = prepared.error;
    ctx.observe("prepare refused", `${error.code}: ${cleanLine(error.message, 240)}`);
    // The relay's own refusals are findings about the paymaster, the node or the account: stored as facts.
    if (error.code === "capability_unknown") {
      // The relay could not read what it must know before it builds a deployment (the paymaster, the node).
      return withObservations({
        verdict: "inconclusive",
        summary: `The relay cannot tell whether the paymaster would sponsor the deployment (${cleanLine(error.message, 200)}). A deployment is never built without that. Nothing was signed or sent. Check the XO node (XO_RPC_URL) and try again.`,
        facts: [],
        observations: [],
      });
    }
    if (error.code === "precondition_failed" || error.code === "upstream_rejected" || error.code === "tripwire") {
      return withObservations(fail(`The relay would not prepare the deployment: ${cleanLine(error.message, 240)}`, `prepare refused (${error.code}): ${cleanLine(error.message, 150)}`));
    }
    throw new StepFailed("userop/prepare", error, prepared.status);
  }
  const item = prepared.data;
  ctx.observe("user_op_hash", item.user_op_hash);
  ctx.observe("digest_tag", item.summary.digest_tag);
  for (const line of item.summary.lines) ctx.say(`   ${cleanLine(line, 300)}`);
  for (const warning of item.warnings) ctx.say(`   warning: ${cleanLine(warning, 300)}`);

  ctx.step("sign");
  const prefix = rawPrefixFromFacts(ctx);
  const signed = await signItem(ctx, item, "Deploy your XO account and enable trading (userOpHash)", { ...(prefix === undefined ? {} : { rawHexPrefix: prefix }), validForS: 300 });
  ctx.observe("signature", `recovers the owner under the ${signed.form} digest; PayBox answered as ${signed.parsed.shape}`);

  ctx.step("submit");
  const submitted = await ctx.client.post("/v1/userop/submit", { prepared_id: item.prepared_id, signature: signed.input });
  if (!submitted.ok) {
    ctx.observe("submit refused", `${submitted.error.code}: ${cleanLine(submitted.error.message, 240)}`);
    // Refused before anything was sent (flag, tripwire, bundler unreachable): the item is still unused.
    if (submitted.error.code === "ambiguous") {
      return withObservations({ verdict: "inconclusive", summary: "The submit result is ambiguous. It is NOT sent again. Follow the user operation by its hash.", facts: [], observations: [] });
    }
    return withObservations(fail(`The relay would not submit: ${cleanLine(submitted.error.message, 240)}`, `submit refused (${submitted.error.code}): ${cleanLine(submitted.error.message, 150)}`));
  }
  const sent = submitted.data;
  ctx.observe("submit", `${sent.state}${sent.detail === undefined ? "" : `: ${cleanLine(sent.detail, 200)}`}`);
  if (sent.state === "rejected") {
    return withObservations(fail(`The bundler rejected the operation: ${cleanLine(sent.detail ?? "no reason given", 240)}`, `the bundler rejected a first operation from a self-derived account: ${cleanLine(sent.detail ?? "", 150)}`));
  }

  ctx.step("wait");
  const watch = await waitForUserOp(ctx, item.user_op_hash, WAIT_MS);
  ctx.observe("operation", `${watch.state}${watch.txHash === undefined ? "" : ` in ${watch.txHash}`}${watch.detail === undefined ? "" : ` (${cleanLine(watch.detail, 160)})`}`);
  if (watch.state === "rejected") return withObservations(fail("The operation was rejected after it was accepted.", `rejected after acceptance: ${cleanLine(watch.detail ?? "", 150)}`));
  if (watch.state === "failed") return withObservations(fail("The operation was included but its execution reverted.", "included with a reverted execution"));
  if (watch.state !== "included") {
    return withObservations({
      verdict: "inconclusive",
      summary: `The operation is ${watch.timedOut ? "still not included after 10 minutes" : watch.state}. It is not sent again. Follow it by hash ${item.user_op_hash}.`,
      facts: [],
      observations: [],
    });
  }

  ctx.step("verify");
  const explorer = explorerFor(ctx);
  const logs = await readDeploymentLogs(explorer, ctx.account);
  const trading = await readTradingEnabled({ explorer }, ctx.account);
  const deployed = logs.accountDeployed.length > 0;
  const registered = logs.ownerRegistered.length > 0;
  const allowance = trading.state === "enabled";
  ctx.observe("AccountDeployed", deployed ? "seen" : "not seen");
  ctx.observe("OwnerRegistered", registered ? "seen" : "not seen");
  ctx.observe("Approval and ApprovalForAll", allowance ? `seen (${trading.unlimited ? "unlimited allowance" : "capped allowance"})` : `not seen (${trading.state})`);
  const after = await accountStatus(ctx);
  ctx.observe("after", describeStatus(after));
  expectOk("status", { ok: true, status: 200, data: after });

  const facts: FactProposal[] = [];
  if (deployed && registered && allowance) {
    facts.push({ id: "T1", state: "yes", note: "A deploying operation from a self-derived, PayBox-owned account was accepted by the bundler, sponsored, and landed with all four logs." });
    facts.push({ id: "UO1", state: "yes", value: signed.form, note: `PayBox's raw signature over the userOpHash validated on chain (recovers under the ${signed.form} digest).` });
    if (after.registered) facts.push({ id: "AD4", state: "yes", note: "The orderbook knew the account after the deployment." });
    const note = after.registered
      ? "The account is registered: door (b) opened as a side effect."
      : "The account is deployed but the orderbook does not know it (deployed_unregistered). T2 may still register it; trading stays blocked until then.";
    ctx.observe("door (b)", note);
    if (extraBool(ctx.opts, "prove-revoke")) {
      const proof = await proveRevoke(ctx);
      if (!proof.ok) {
        // The deployment worked, but the way out did not: nothing may be funded on this account. T1 is recorded as no.
        return {
          verdict: "fail",
          summary: `The account ${ctx.account} is deployed, but the on-chain revoke did not hold: ${proof.reason} Do not fund this account (A11). T1 is proposed as no, so the flags that need it stay locked.`,
          facts: [{ id: "T1", state: "no", note: cleanLine(`deployed, but the on-chain revoke is unproven: ${proof.reason}`, 190) }, ...proof.facts],
          observations: ctx.observations(),
        };
      }
      facts.push(...proof.facts);
      return { verdict: "pass", summary: `The account ${ctx.account} is deployed, trading is enabled and the on-chain revoke works (paymaster-less, zero fee; trading was turned off and on again). ${note}`, facts, observations: ctx.observations() };
    }
    return {
      verdict: "pass",
      summary: `The account ${ctx.account} is deployed and trading is enabled. ${note} The on-chain revoke is NOT proven yet: run this test's --prove-revoke (or T8) before any funding (A11).`,
      facts,
      observations: ctx.observations(),
    };
  }
  return withObservations({
    verdict: "fail",
    summary: "The operation was included but the logs do not show a complete deployment and Enable Trading, so T1 does not pass.",
    facts: [{ id: "T1", state: "no", note: "included, but not all of AccountDeployed, OwnerRegistered, Approval and ApprovalForAll were seen" }],
    observations: [],
  });
}

type RevokeProof = { readonly ok: true; readonly facts: readonly FactProposal[] } | { readonly ok: false; readonly reason: string; readonly facts: readonly FactProposal[] };

// A11: the on-chain revoke is pre-tested paymaster-less BEFORE any funding. Revoke (the relay builds it without
// a paymaster), read the allowance back, then enable trading again.
async function proveRevoke(ctx: RunContext): Promise<RevokeProof> {
  const oneOp = async (step: "revoke" | "restore", action: "revoke_trading" | "enable_trading", label: string, wanted: "no" | "yes"): Promise<string | undefined> => {
    ctx.step(step);
    const prepared = await prepareUserOp(ctx, { owner: ctx.owner, action, params: {} });
    if (!prepared.ok) return `the relay would not prepare ${label} (${prepared.error.code}: ${cleanLine(prepared.error.message, 160)}).`;
    const sent = await signAndSubmitUserOp(ctx, prepared.item, label);
    if ("refused" in sent) return `the relay would not submit ${label} (${sent.refused.code}: ${cleanLine(sent.refused.message, 160)}). It is not sent again.`;
    if (sent.state === "rejected") return `the bundler rejected ${label}: ${cleanLine(sent.detail ?? "no reason given", 160)}`;
    const watch = await waitForUserOp(ctx, sent.hash, WAIT_MS);
    ctx.observe(`${step} operation`, `${watch.state}${watch.txHash === undefined ? "" : ` in ${watch.txHash}`}`);
    if (watch.state !== "included") return `${label} is ${watch.timedOut ? "not included after 10 minutes" : watch.state}. It is NOT sent again; follow it by hash ${sent.hash}.`;
    const status = await accountStatus(ctx);
    ctx.observe(`trading_enabled after ${step}`, status.trading_enabled);
    return status.trading_enabled === wanted ? undefined : `after ${label} the allowance reads trading_enabled ${status.trading_enabled}, not ${wanted}.`;
  };
  const revoked = await oneOp("revoke", "revoke_trading", "the on-chain revoke (approve(exchange, 0) and setApprovalForAll false)", "no");
  if (revoked !== undefined) return { ok: false, reason: revoked, facts: [{ id: "UO8", state: "no", note: cleanLine(`paymaster-less zero-fee revoke: ${revoked}`, 190) }] };
  const restored = await oneOp("restore", "enable_trading", "Enable Trading again", "yes");
  if (restored !== undefined) return { ok: false, reason: `the revoke worked but ${restored} Trading is OFF for this account; enable it again before T2.`, facts: [{ id: "UO8", state: "yes", note: "a paymaster-less zero-fee revoke landed for this account" }] };
  return { ok: true, facts: [{ id: "UO8", state: "yes", note: "a user operation with no paymaster and zero fees (the on-chain revoke) landed for this account, and the re-enable after it did too." }] };
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
