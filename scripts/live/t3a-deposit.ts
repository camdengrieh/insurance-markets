import { loadConfig } from "../../src/config.js";
import { proposeEvm } from "../../src/paybox.js";
import { decodeFundingData } from "../../src/xo/funding/calldata.js";
import { BaseRpc, DEFAULT_BASE_RPC_URL } from "../../src/xo/funding/preflight.js";
import { createBaseRpcTransport, createFundingXoClient, createXoFundingReads, handleFundAccount, xoRpcFromEnv, type FundToolDeps } from "../../src/tools/fund.js";
import { extraString } from "./lib/args.js";
import { accountStatus, describeStatus } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_FUNDED_ONE_WAY, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1 } from "./lib/text.js";
import { Refusal, type FactProposal, type Options, type RunContext, type TestResult, type TestSpec } from "./lib/types.js";
import type { Hex } from "viem";

// T3a  Deposit (door d)                                                     docs/phase1-gap-closing.md sections 6 and 9 A6, A10
//
// Settles: FU3 to FU7. Cost: the deposit, $3 at most (A10: $2 to $3 if T3b and T3c follow, $1 if only the
// deposit door is tested), plus Base gas, which is paid in ETH by whoever sends the two Base calls and is
// outside the --budget-usd figure (cents).
//
// It drives the plugin's own funding tool, xo_fund_account, in this process, exactly as an agent would: the
// relay is asked first (caps, the reservation, its own view of the account), then eight preflight checks on
// the Base route are run, then ONE proposal per call is returned: the exact-amount approve, then
// transferRemote(3223, your account, amount). The kit sends neither: it prints the call, you send it from
// the OWNER's Base address (the PayBox credential), and paste the transaction hash. Then the tool follows
// the Hyperlane message for up to 10 minutes and reports it to the relay.
//
// Stop rule: no balance rise in 10 minutes means do not resend; check Mailbox.delivered by the message id
// the tool prints. The kit never asks the tool for another transfer after the hash is known.

const SLUG = "t3a-deposit";
const CEILING_USD = "3";
const FOLLOW_MS = 11 * 60_000;

export const spec: TestSpec = {
  id: "T3a",
  slug: SLUG,
  title: "Deposit (door d)",
  settles: ["FU3", "FU4", "FU5", "FU6", "FU7"],
  worstCaseUsd: CEILING_USD,
  costNote: "the deposit, $3 at most (A10); Base gas in ETH is extra and outside the budget; funding is one-way until T4",
  stopRule: "no balance rise in 10 minutes: do not resend; check Mailbox.delivered by the message id",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    PRECONDITION_FUNDED_ONE_WAY,
    "The owner's Base address holds at least the amount in Circle USDC and a little ETH for gas. Amount: $1 if you only want to see the deposit arrive; $2 to $3 if T3b, T3c and T4 will follow.",
    "You send the two Base calls yourself, FROM THE OWNER address (a PayBox transaction proposal or request_wallet_sign op transaction): the relay only follows a transfer sent by the owner.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_FUNDING"],
  steps: [
    {
      id: "status",
      title: "Read the account: it must be deployed (positive proof) and show its XO balance",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (deployment logs)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance" },
      ],
    },
    {
      id: "approve",
      title: "Step 1 of 2: the exact-amount approve of Circle USDC for the Hyperlane router (you send it on Base)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/funding/check", note: "caps, the reservation, funding_id" },
        { via: "base", method: "POST", target: "https://mainnet.base.org (eth_chainId, eth_call: token, routers, quote, allowance, balance; eth_getStorageAt)", note: "reads only" },
        { via: "operator", method: "-", target: "you send approve(router, amount) on Base from the owner address" },
      ],
    },
    {
      id: "transfer",
      title: "Step 2 of 2: transferRemote(3223, your XO account, amount) (you send it on Base)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/funding/check", note: "the same reservation, same funding_id" },
        { via: "base", method: "POST", target: "https://mainnet.base.org (the same reads)", note: "reads only" },
        { via: "operator", method: "-", target: "you send transferRemote on Base from the owner address, then paste its transaction hash" },
      ],
    },
    {
      id: "follow",
      title: "Follow the Hyperlane message for up to 10 minutes; report the hash to the relay",
      calls: [
        { via: "base", method: "POST", target: "https://mainnet.base.org (eth_getTransactionReceipt, eth_getBlockByNumber)" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (ProcessId log of the message)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance", note: "the credited balance" },
        { via: "relay", method: "POST", target: "/v1/funding/report" },
      ],
    },
    {
      id: "verify",
      title: "Read the account again: did the credited balance rise by the amount?",
      calls: [{ via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" }],
    },
  ],
  flags: [{ name: "amount-usd", kind: "usd", help: "The deposit in USD, up to 3 (required). The relay refuses more than the recorded test amount.", required: true }],
  needs: { relay: true, credentialStore: false, xoChain: true, baseChain: true, arrange: ["trading_enabled", "base_funded"] },
  writes: [],
  exposureUsd: (opts: Options) => extraString(opts, "amount-usd") ?? CEILING_USD,
  checkOptions: (opts) => {
    const amount = extraString(opts, "amount-usd");
    if (amount === undefined) return "--amount-usd is required: how many USD to deposit (up to 3).";
    if (!/[1-9]/.test(amount)) return "--amount-usd must be more than zero.";
    if (Number(amount) > Number(CEILING_USD)) return `--amount-usd $${amount} is above the T3a ceiling of $${CEILING_USD}.`;
    return undefined;
  },
  run,
};

// ---- the plugin's funding tool, wired to this run -----------------------------------------------------------------------

export function fundToolDeps(ctx: RunContext, env: Readonly<Record<string, string | undefined>>): FundToolDeps {
  const toolEnv: Record<string, string | undefined> = {
    ENABLE_FUNDING: "1",
    XO_BASE_RPC_URL: env["XO_BASE_RPC_URL"],
    XO_RPC_URL: env["XO_RPC_URL"],
    XO_FUNDING_TEST_AMOUNT_USD: env["XO_FUNDING_TEST_AMOUNT_USD"],
  };
  const transport = createBaseRpcTransport({
    fetchImpl: ctx.net.fetch,
    nowMs: () => ctx.clock.nowMs(),
    ...(ctx.target === "mock" ? { minIntervalMs: 0 } : {}),
  });
  return {
    nowMs: () => ctx.clock.nowMs(),
    config: () => loadConfig({}).config,
    env: () => toolEnv,
    relay: () => ctx.client,
    baseRpc: () => new BaseRpc({ transport, url: toolEnv["XO_BASE_RPC_URL"] ?? DEFAULT_BASE_RPC_URL }),
    xo: () => createXoFundingReads(() => createFundingXoClient(ctx.net.fetch), { rpc: () => xoRpcFromEnv(toolEnv, transport) }),
    audit: { write: () => undefined },
    // PayBox's proposal builder checks the expiry against the machine's real clock; the rehearsal runs on the
    // mock's clock, so it asks for an expiry that is valid in real time. The call itself is untouched.
    ...(ctx.target === "mock"
      ? { propose: ((input) => proposeEvm({ ...input, expiresAt: new Date(Date.now() + 240_000).toISOString().replace(/\.\d{3}Z$/, "Z") })) as NonNullable<FundToolDeps["propose"]> }
      : {}),
  };
}

// What a tool result says, for a script that is not an agent.
export interface ToolReading {
  readonly outcome: "proposal" | "refused" | "done" | "monitoring" | "unreadable";
  readonly code: string;
  readonly text: string;
  readonly proposal: { readonly chain: string; readonly to: string; readonly value: string; readonly data: Hex } | undefined;
  readonly fundingId: string | undefined;
  readonly baselineUsd: string | undefined;
  readonly delivery: { readonly state: string; readonly terminal: boolean; readonly messageId: string | null; readonly message: string; readonly credit: string; readonly delivered: boolean | null; readonly xoBalanceUsd: string | null } | undefined;
}

const PROPOSAL_KEY = "io.paybox/transactionProposal";

export function readToolResult(result: { content?: ReadonlyArray<{ type: string; text?: string }>; structuredContent?: unknown }): ToolReading {
  const text = (result.content ?? []).map((entry) => (typeof entry.text === "string" ? entry.text : "")).join("\n");
  const structured = (typeof result.structuredContent === "object" && result.structuredContent !== null ? result.structuredContent : {}) as Record<string, unknown>;
  const proposal = structured[PROPOSAL_KEY] as { chain?: string; transaction?: { to?: string; value?: string; data?: string } } | undefined;
  const fundingId = /funding_id ([0-9a-f]{32})/.exec(text)?.[1];
  const baselineUsd = /xo_balance_before_usd ([0-9]+(?:\.[0-9]+)?)/.exec(text)?.[1];
  if (proposal?.transaction?.to !== undefined && proposal.transaction.data !== undefined) {
    return {
      outcome: "proposal",
      code: "proposal",
      text,
      proposal: { chain: proposal.chain ?? "", to: proposal.transaction.to, value: proposal.transaction.value ?? "0", data: proposal.transaction.data as Hex },
      fundingId,
      baselineUsd,
      delivery: undefined,
    };
  }
  const outcome = structured["outcome"];
  const code = typeof structured["code"] === "string" ? structured["code"] : "unreadable";
  const delivery = structured["delivery"] as Record<string, unknown> | undefined;
  return {
    outcome: outcome === "refused" || outcome === "done" || outcome === "monitoring" ? outcome : "unreadable",
    code,
    text,
    proposal: undefined,
    fundingId,
    baselineUsd,
    delivery:
      delivery === undefined
        ? undefined
        : {
            state: String(delivery["state"]),
            terminal: delivery["terminal"] === true,
            messageId: typeof delivery["message_id"] === "string" ? delivery["message_id"] : null,
            message: typeof delivery["message"] === "string" ? delivery["message"] : "",
            credit: String(delivery["credit"]),
            delivered: typeof delivery["delivered"] === "boolean" ? delivery["delivered"] : null,
            xoBalanceUsd: typeof delivery["xo_balance_usd"] === "string" ? delivery["xo_balance_usd"] : null,
          },
  };
}

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const amount = extraString(ctx.opts, "amount-usd") as string;
  const deps = fundToolDeps(ctx, ctx.env);
  const input = { owner: ctx.owner, amount_usd: amount } as const;

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (before.state === "undeployed") {
    return withObservations({ verdict: "inconclusive", summary: "The account is not deployed. USDC.e minted to an undeployed account can only be moved by a user operation, so nothing is funded. Run T1 first.", facts: [] });
  }
  if (!before.flags.ENABLE_FUNDING) ctx.stop("flag_off", "ENABLE_FUNDING is not effective in this relay (check KILL and the tripwires); a funding check would be refused.");
  const baselineUsd = before.balance_usd;

  let fundingId: string | undefined;
  let balanceBefore: string | undefined = baselineUsd ?? undefined;
  let transferHash: Hex | undefined;

  // Steps 1 and 2: one proposal per call. After the approve is sent the tool is asked again until Base shows it.
  let sentApprove = false;
  let waits = 0;
  let announced: "approve" | "transfer" = "approve";
  ctx.step("approve");
  for (let call = 0; call < 14 && transferHash === undefined; call += 1) {
    const reading = readToolResult(await fundToolRun(input, deps));
    if (reading.fundingId !== undefined) fundingId = reading.fundingId;
    if (reading.baselineUsd !== undefined) balanceBefore = reading.baselineUsd;
    if (reading.outcome !== "proposal" || reading.proposal === undefined) {
      ctx.observe("funding tool", `${reading.outcome}: ${reading.code}`);
      for (const line of reading.text.split("\n").slice(0, 6)) ctx.say(`   ${cleanLine(line, 300)}`);
      if (reading.code === "kill_switch" || reading.code === "flag_off") ctx.stop(reading.code, "The funding path is switched off. Nothing was sent.");
      return withObservations({ verdict: "inconclusive", summary: `The funding tool did not hand out a proposal (${reading.outcome}: ${reading.code}). Nothing more was sent to Base. ${cleanLine(reading.text.split("\n")[0] ?? "", 240)}`, facts: [] });
    }
    const decoded = decodeFundingData(reading.proposal.data);
    if (decoded.kind === "approve" && sentApprove) {
      // The approve was sent and Base does not show it yet: wait, do not send a second one.
      if (waits >= 8) return withObservations({ verdict: "inconclusive", summary: "The approve is still not visible on Base after waiting. Nothing more is sent; check the transaction, then run this again.", facts: [] });
      waits += 1;
      ctx.say("   the approve is not visible on Base yet; waiting");
      await ctx.clock.sleep(10_000);
      continue;
    }
    if (decoded.kind === "transfer" && announced === "approve") {
      // No approve was needed (the allowance already covers the amount).
      ctx.say("   no approve is needed: the allowance already covers the amount");
      ctx.step("transfer");
      announced = "transfer";
    }
    for (const line of reading.text.split("\n").slice(0, 4)) ctx.say(`   ${cleanLine(line, 300)}`);
    const hash = await ctx.baseWallet.send({
      label: decoded.kind === "approve" ? "approve the exact amount for the Hyperlane router (Circle USDC)" : "transferRemote to the XO chain, recipient your XO account",
      chain: "eip155:8453",
      to: reading.proposal.to as `0x${string}`,
      value: "0",
      data: reading.proposal.data,
    });
    if (decoded.kind === "approve") {
      sentApprove = true;
      ctx.step("transfer");
      announced = "transfer";
    } else {
      if (hash === undefined) throw new Refusal("no_tx_hash", "The transfer's transaction hash is needed to follow it. Nothing more is sent; do NOT send another transfer.");
      transferHash = hash;
      ctx.observe("transfer transaction", hash);
    }
  }
  if (transferHash === undefined) {
    return withObservations({ verdict: "inconclusive", summary: "No transfer was sent.", facts: [] });
  }
  if (fundingId === undefined) {
    return withObservations({ verdict: "inconclusive", summary: "The tool did not show a funding_id, so the relay cannot follow the transfer. Do NOT send another transfer. Report the transaction hash by hand.", facts: [] });
  }
  ctx.observe("funding_id", fundingId);
  ctx.observe("balance before", `${balanceBefore ?? "unread"} USD`);

  ctx.step("follow");
  const followed = await ctx.poll<ToolReading>(
    "the deposit to arrive and be credited",
    async () => {
      const reading = readToolResult(
        await fundToolRun({ ...input, tx_hash: transferHash as Hex, funding_id: fundingId as string, ...(balanceBefore === undefined ? {} : { xo_balance_before_usd: balanceBefore }) }, deps),
      );
      const delivery = reading.delivery;
      if (delivery !== undefined) ctx.say(`   delivery: ${delivery.state}${delivery.message === "" ? "" : ` - ${cleanLine(delivery.message, 200)}`}`);
      if (reading.outcome === "refused") throw new Refusal(reading.code, `following the transfer was refused (${reading.code}): ${cleanLine(reading.text.split("\n")[0] ?? "", 200)}`);
      return { done: delivery?.terminal === true, value: reading };
    },
    { timeoutMs: FOLLOW_MS, everyMs: 15_000 },
  );
  const delivery = followed.value.delivery;
  ctx.observe("delivery", delivery === undefined ? "unreadable" : `${delivery.state} (message ${delivery.messageId ?? "unknown"})`);

  ctx.step("verify");
  const after = await accountStatus(ctx);
  ctx.observe("after", describeStatus(after));

  const facts: FactProposal[] = [];
  if (delivery?.state === "credited") {
    facts.push({ id: "T3a", state: "yes", note: `$${amount} sent from Base arrived on XO and the orderbook credited it (message ${delivery.messageId ?? "?"}).` });
    return withObservations({ verdict: "pass", summary: `The deposit of $${amount} arrived and was credited. The funding path works end to end. The relay's funding cap stays at the test amount until T4 proves an exit.`, facts });
  }
  if (delivery?.state === "delivered_not_credited") {
    facts.push({ id: "T3a", state: "no", note: "the transfer was delivered to the XO account but the orderbook did not credit it within 10 minutes" });
    facts.push({ id: "FU6", state: "no", note: "USDC.e minted straight to the account was not credited by the orderbook within 10 minutes" });
    return withObservations({ verdict: "fail", summary: "STOP RULE: the deposit was delivered but not credited within 10 minutes. Do NOT send another: a second transfer moves a second amount. Do not fund again.", facts });
  }
  if (delivery?.state === "dispatched_not_delivered") {
    facts.push({ id: "T3a", state: "no", note: `the Hyperlane message was dispatched but not delivered within 10 minutes (message ${delivery.messageId ?? "?"})`.slice(0, 190) });
    return withObservations({
      verdict: "fail",
      summary: `STOP RULE: no delivery in 10 minutes. Do NOT resend. Check Mailbox.delivered(${delivery.messageId ?? "<the message id>"}) on the XO chain; the message stays deliverable and a second transfer would move a second amount.`,
      facts,
    });
  }
  return withObservations({ verdict: "inconclusive", summary: `The transfer ended as ${delivery?.state ?? "unreadable"}: ${cleanLine(delivery?.message ?? "", 240)} Nothing is sent again.`, facts: [] });
}

async function fundToolRun(input: Parameters<typeof handleFundAccount>[0], deps: FundToolDeps): ReturnType<typeof handleFundAccount> {
  return handleFundAccount(input, deps);
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
