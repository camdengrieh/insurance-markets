import { readFile } from "node:fs/promises";

import type { Hex } from "viem";

import { creatorCreationsQuery, decodeCreationLog } from "../../src/xo/creation/review.js";
import { hostedMatches, metadataContentHash, prettyMetadataText, validateMetadata } from "../../src/xo/creation/metadata.js";
import { extraString } from "./lib/args.js";
import { accountStatus, describeStatus, explorerFor, waitForUserOp } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cleanLine } from "./lib/redact.js";
import { SAMPLE_METADATA_URI, sampleMetadataFor } from "./lib/sample-metadata.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1 } from "./lib/text.js";
import { prepareUserOp, signAndSubmitUserOp } from "./lib/userop.js";
import { Refusal, type FactProposal, type RunContext, type TestResult, type TestSpec } from "./lib/types.js";

// T6  Creation experiment                                                   docs/phase1-gap-closing.md sections 3.5 (CR3, CR4), 4 N8, 6
//
// Settles: CR3, CR4, AD10, N8: does XO's oracle review and index a market whose metadata you host yourself?
// Cost: $1, the creation fee, which is not refundable.
//
// You write a clean nine-key metadata file for a sports market 1 to 7 days out (the family that passes
// first review 85% of the time) and host it at an https URL you control. The kit validates the file the same
// way xo_validate_market_draft does, checks that your URL serves exactly that content, and asks the relay to
// prepare the create batch [USDC.e.approve(manager, exactly the fee), createConvictionMarket]. You sign the
// userOpHash once; the relay submits once. The kit then reads the CLOBMarketCreated log to learn the condition
// id and follows the review: POST /v1/creation/track every 60 seconds for the first 30 minutes.
//
//   approve          hosting is accepted
//   update required  the oracle read your file. The kit answers only if the diff guard passes AND the end
//                    date is unchanged (a second signature); otherwise it leaves the update unanswered, which
//                    costs nothing
//   reject / none    hosting is not accepted; creation stays blocked and no substitute is built
//
// Stop rule: do not retry creation. The transport allows one create submit; an ambiguous result is reconciled
// from CLOBMarketCreated (topic 2 = your account), never resent.

const SLUG = "t6-creation";
const DEFAULT_WAIT_MIN = 30;

export const spec: TestSpec = {
  id: "T6",
  slug: SLUG,
  title: "Creation experiment",
  settles: ["CR3", "CR4", "AD10", "N8"],
  worstCaseUsd: "1",
  costNote: "the $1 creation fee, which is not refundable (13.7% of attempts never activate)",
  stopRule: "do not retry creation; reconcile by CLOBMarketCreated",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    "The account holds at least 1 USDC.e on XO for the creation fee, and the day's cap has $1 left.",
    "Creating markets may breach XO's terms (automated access, one account per user, the badge and weekly rules) and XO can void a market or close the selector. You have accepted that exposure (open item O5). Creation is off by default and this run arms it for itself only.",
    "You wrote a clean nine-key metadata file for a sports market 1 to 7 days out (--metadata-file) and host it at an https URL you control (--metadata-uri). For the relay to read it, set RELAY_SELF_HOST to that URL's folder before you start.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_USEROP_SUBMIT", "XO_ENABLE_CREATE", "ENABLE_SELF_HOSTED_METADATA"],
  steps: [
    {
      id: "status",
      title: "Read the account: deployed, with the creation fee available",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (deployment logs)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance (the registry check, the account only)" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
      ],
    },
    { id: "metadata", title: "Validate your metadata file and check that your URL serves exactly that content", calls: [{ via: "xo", method: "GET", target: "your metadata URL (RELAY_SELF_HOST)", note: "read" }] },
    {
      id: "prepare",
      title: "Prepare the create batch: fee read, canCall pre-flight, approve exactly the fee, createConvictionMarket (nothing is signed or sent)",
      exposureUsd: "1",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "create_market" },
        { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (canCall, collateralConfig, paused, checkPolicy, getNonce)", note: "reads only" },
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
      title: "Follow the operation until it is included",
      calls: [
        { via: "relay", method: "GET", target: "/v1/userop/:hash", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (CLOBMarketCreated by creator)" },
      ],
    },
    {
      id: "review",
      title: "Follow the review: MarketReviewed, every 60 seconds for the first 30 minutes",
      calls: [
        { via: "relay", method: "POST", target: "/v1/creation/track", note: "repeated" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (the manager's logs)", note: "the relay's own reads" },
        { via: "xo", method: "GET", target: "https://api-mainnet.xo.market/api/markets/contract/{conditionId}", note: "the market record (status, tokens); numbers only, market text is never shown" },
      ],
    },
    {
      id: "respond",
      title: "If the oracle asks for an update and the diff guard passes: accept it (a second signature)",
      write: true,
      when: "only if the update is clean (diff guard passes, end date unchanged)",
      calls: [
        { via: "relay", method: "POST", target: "/v1/userop/prepare", note: "respond_update" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op raw" },
        { via: "relay", method: "POST", target: "/v1/userop/submit" },
        { via: "xo", method: "POST", target: "https://mainnet-bundler.xo.market/ eth_sendUserOperation", note: "write" },
      ],
    },
  ],
  flags: [
    { name: "metadata-file", kind: "string", help: "Path to your nine-key metadata JSON (required on the live target; the rehearsal has a sample)." },
    { name: "metadata-uri", kind: "url", help: "The https URL where YOU host that file (required on the live target)." },
    { name: "expires-in-days", kind: "int", help: "Days until the market closes, 1 to 7 (default 3).", defaultValue: "3" },
    { name: "wait-minutes", kind: "int", help: `How long to follow the review, in minutes (default ${String(DEFAULT_WAIT_MIN)}; the watch is saved in the data directory and resumes when a relay next starts on it).`, defaultValue: String(DEFAULT_WAIT_MIN) },
    { name: "mock-decision", kind: "string", help: "Mock target only: how the rehearsal's oracle decides (approve, update or reject). Default approve.", defaultValue: "approve" },
  ],
  needs: { relay: true, credentialStore: false, xoChain: true, baseChain: false, creation: true, arrange: ["trading_enabled", "funded"] },
  writes: [
    { label: "relay POST /v1/userop/submit", max: 2 },
    { label: "bundler eth_sendUserOperation", max: 2 },
  ],
  exposureUsd: () => "1",
  checkOptions: (opts, target) => {
    if (target === "live") {
      if (extraString(opts, "metadata-file") === undefined) return "--metadata-file is required on the live target: the path to your nine-key metadata JSON.";
      if (extraString(opts, "metadata-uri") === undefined) return "--metadata-uri is required on the live target: the https URL where you host that file.";
    }
    const days = Number(extraString(opts, "expires-in-days") ?? "3");
    if (!Number.isInteger(days) || days < 1 || days > 7) return "--expires-in-days must be 1 to 7.";
    const minutes = Number(extraString(opts, "wait-minutes") ?? String(DEFAULT_WAIT_MIN));
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) return "--wait-minutes must be 1 to 720.";
    const decision = extraString(opts, "mock-decision") ?? "approve";
    if (target === "mock" && !["approve", "update", "reject"].includes(decision)) return "--mock-decision must be approve, update or reject.";
    return undefined;
  },
  run,
};

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const days = Number(extraString(ctx.opts, "expires-in-days") ?? "3");
  const waitMs = Number(extraString(ctx.opts, "wait-minutes") ?? String(DEFAULT_WAIT_MIN)) * 60_000;
  const uri = extraString(ctx.opts, "metadata-uri") ?? SAMPLE_METADATA_URI;
  const expiresAtMs = Math.floor(ctx.clock.nowMs() / 1000) * 1000 + days * 86_400_000;

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (!before.flags.ENABLE_USEROP_SUBMIT || !before.flags.XO_ENABLE_CREATE) ctx.stop("flag_off", "ENABLE_USEROP_SUBMIT or XO_ENABLE_CREATE is not effective in this relay (check KILL and the tripwires); a create would be refused.");
  if (before.state === "undeployed") return withObservations({ verdict: "inconclusive", summary: "The account is not deployed, so it cannot create a market. Run T1 first. Nothing was signed or sent.", facts: [] });

  // ---- the metadata -----------------------------------------------------------------------------------------------------------
  ctx.step("metadata");
  let draft: unknown;
  const file = extraString(ctx.opts, "metadata-file");
  if (file !== undefined) {
    try {
      draft = JSON.parse(await readFile(file, "utf8")) as unknown;
    } catch {
      return withObservations({ verdict: "inconclusive", summary: "The metadata file could not be read as JSON. Nothing was signed or sent.", facts: [] });
    }
  } else if (ctx.target === "mock") {
    draft = sampleMetadataFor(new Date(expiresAtMs));
  } else {
    return withObservations({ verdict: "inconclusive", summary: "Give --metadata-file. Nothing was signed or sent.", facts: [] });
  }
  // Judged the way the relay will judge it, with the end time known (the oracle's date rule needs it).
  const validation = validateMetadata(draft, { expiresAtS: Math.floor(expiresAtMs / 1000) });
  ctx.observe("metadata checks", `${String(validation.blocks)} blocking, ${String(validation.warns)} warnings`);
  for (const check of validation.checks.filter((entry) => entry.severity !== "info")) ctx.say(`   ${check.severity}: ${check.rule} ${check.code} at ${check.path}: ${check.message}`);
  if (!validation.ok || validation.metadata === null) {
    return withObservations({ verdict: "inconclusive", summary: "The metadata file is not clean (see the blocking checks above). Fix it and run again. Nothing was signed or sent.", facts: [] });
  }
  const expected = validation.metadata;
  ctx.observe("content hash", metadataContentHash(expected));
  if (ctx.target === "mock") ctx.world.host(uri, prettyMetadataText(expected));
  const hosted = await readHosted(ctx, uri);
  if (hosted === undefined) {
    return withObservations({
      verdict: "inconclusive",
      summary: `The kit could not read ${uri}. Host the file there, and set RELAY_SELF_HOST to its folder so this run may read it. Nothing was signed or sent.`,
      facts: [],
    });
  }
  const match = hostedMatches(hosted, expected);
  ctx.observe("hosted file", match.matches ? "serves exactly the validated content" : `does NOT match (${match.reason})`);
  if (!match.matches) return withObservations({ verdict: "inconclusive", summary: `The file served at ${uri} is not the file you validated (${match.reason}). Nothing was signed or sent.`, facts: [] });

  // ---- the create -----------------------------------------------------------------------------------------------------------------
  ctx.step("prepare");
  const expiresAt = new Date(expiresAtMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  // The rehearsal's oracle: the decision you chose, at the median observed time to a first review (about 10 minutes).
  if (ctx.target === "mock") ctx.world.configureCreation({ decision: (extraString(ctx.opts, "mock-decision") ?? "approve") as "approve" | "update" | "reject", reviewDelayS: 600 });
  const prepared = await prepareUserOp(ctx, { owner: ctx.owner, action: "create_market", params: { metadata_uri: uri, expires_at: expiresAt, title: expected.title } });
  if (!prepared.ok) {
    ctx.observe("prepare refused", `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
    const notWired = prepared.error.code === "not_implemented" || prepared.error.code === "capability_unknown" || prepared.error.code === "flag_off";
    return withObservations({
      verdict: "inconclusive",
      summary: notWired
        ? `This relay build cannot create markets yet (${prepared.error.code}: ${cleanLine(prepared.error.message, 200)}). The creation module has to be wired into the relay first. Nothing was signed or sent.`
        : `The relay would not prepare the create: ${cleanLine(prepared.error.message, 240)} Nothing was signed or sent.`,
      facts: [],
    });
  }

  const sent = await signAndSubmitUserOp(ctx, prepared.item, "Create a market (approve exactly the 1 USDC.e fee, then createConvictionMarket)", { sign: () => ctx.step("sign"), submit: () => ctx.step("submit") });
  if ("refused" in sent) {
    ctx.observe("submit refused", `${sent.refused.code}: ${cleanLine(sent.refused.message, 240)}`);
    return withObservations({ verdict: "fail", summary: `The relay would not submit: ${cleanLine(sent.refused.message, 240)} Nothing is sent again.`, facts: [{ id: "T6", state: "no", note: `submit refused (${sent.refused.code}): ${cleanLine(sent.refused.message, 140)}` }] });
  }
  if (sent.state === "rejected") {
    return withObservations({ verdict: "fail", summary: `The bundler rejected the create: ${cleanLine(sent.detail ?? "no reason given", 240)} Nothing was charged.`, facts: [{ id: "T6", state: "no", note: `the bundler rejected the create batch: ${cleanLine(sent.detail ?? "", 140)}` }] });
  }

  ctx.step("wait");
  const watch = await waitForUserOp(ctx, sent.hash, 10 * 60_000);
  ctx.observe("operation", `${watch.state}${watch.txHash === undefined ? "" : ` in ${watch.txHash}`}${watch.detail === undefined ? "" : ` (${cleanLine(watch.detail, 160)})`}`);
  if (watch.state === "rejected" || watch.state === "failed") {
    return withObservations({ verdict: "fail", summary: `The create did not execute (${watch.state}). No market exists.`, facts: [{ id: "T6", state: "no", note: `the create operation ${watch.state}` }] });
  }
  if (watch.state !== "included") {
    return withObservations({ verdict: "inconclusive", summary: `The create is ${watch.timedOut ? "still not included after 10 minutes" : watch.state}. It is NOT sent again. Reconcile from CLOBMarketCreated (topic 2 = ${ctx.account}). Hash ${sent.hash}.`, facts: [] });
  }
  const conditionId = await findCondition(ctx, uri);
  if (conditionId === undefined) {
    return withObservations({ verdict: "inconclusive", summary: "The create was included but no CLOBMarketCreated log with your URI was found yet. Do NOT create again: look at the manager's logs for your account first.", facts: [] });
  }
  ctx.observe("condition id", conditionId);
  ctx.observe("CR3", "the create batch [approve exactly the fee, createConvictionMarket] was accepted and executed");

  // ---- the review --------------------------------------------------------------------------------------------------------------------
  ctx.step("review");
  const outcome = await followReview(ctx, conditionId, waitMs);
  ctx.observe("review", `${outcome.status} (decision ${outcome.decision})`);
  const facts: FactProposal[] = [{ id: "AD10", state: "yes", note: "a Kernel smart account created a market (the NFT is minted to the creator) without a revert" }];

  if (outcome.status === "update_required") {
    const clean = outcome.guard === "pass" && !outcome.expiryChanged;
    ctx.observe("update", `guard ${outcome.guard}, end date ${outcome.expiryChanged ? "CHANGED" : "unchanged"}`);
    for (const change of outcome.changes) ctx.say(`   change (${change.risk}): ${change.field} [${change.kind}]`);
    if (clean) {
      const accepted = await respond(ctx, conditionId);
      if (accepted !== undefined) return withObservations({ ...accepted, facts: [...facts, ...accepted.facts] });
      const after = await followReview(ctx, conditionId, waitMs);
      ctx.observe("review after the answer", `${after.status} (decision ${after.decision})`);
      if (after.status === "active") {
        facts.push({ id: "CR4", state: "yes", note: "the oracle read the self-hosted URI, asked for a clean update, and activated the market after it was accepted" });
        facts.push({ id: "T6", state: "yes", note: "a self-hosted metadata URI was reviewed and the market activated" });
        return withObservations({ verdict: "pass", summary: `The oracle reviewed your self-hosted file, asked for a clean update and activated the market ${conditionId} after you accepted it. Hosting is accepted.`, facts });
      }
      return withObservations({ verdict: "inconclusive", summary: `The update was accepted but the market is ${after.status} (decision ${after.decision}) when the follow-up ended. The watch is saved in the data directory and resumes when a relay next starts on it; creation is not retried.`, facts: [...facts, { id: "CR4", state: "yes", note: "the oracle read the self-hosted URI and asked for an update" }] });
    }
    facts.push({ id: "CR4", state: "yes", note: "the oracle read the self-hosted URI and asked for an update (not accepted: the diff guard flagged it or the end date moved)" });
    return withObservations({ verdict: "inconclusive", summary: `The oracle read your file and asked for an update that the diff guard flags (or that moves the end date). It is left unanswered, which costs nothing. Hosting is read, but the market is not active.`, facts });
  }
  if (outcome.status === "active") {
    facts.push({ id: "CR4", state: "yes", note: "the oracle approved a market whose metadata is self-hosted" });
    facts.push({ id: "T6", state: "yes", note: "a self-hosted metadata URI was reviewed and the market activated" });
    return withObservations({ verdict: "pass", summary: `The oracle approved your self-hosted file and the market ${conditionId} is active. Hosting is accepted.`, facts });
  }
  if (outcome.status === "rejected") {
    facts.push({ id: "CR4", state: "no", note: "the oracle rejected the market with a self-hosted metadata URI" });
    facts.push({ id: "T6", state: "no", note: "rejected: self-hosting is not accepted (or the content was refused)" });
    return withObservations({ verdict: "fail", summary: "The oracle REJECTED the market. Hosting is not accepted (or the content was refused). Creation stays blocked; no substitute is built. The $1 fee is gone.", facts });
  }
  if (outcome.status === "cancelled") {
    return withObservations({ verdict: "inconclusive", summary: "The market was cancelled before a review. That says nothing about hosting. The $1 fee is gone.", facts });
  }
  return withObservations({
    verdict: "inconclusive",
    summary: `No review yet (${outcome.status}) after ${String(Math.round(waitMs / 60_000))} minutes. 10% of reviews take over 166 minutes. The watch is saved in the data directory and resumes when a relay next starts on it; nothing is created again. Look at ${conditionId} later.`,
    facts,
  });
}

// ---- helpers ------------------------------------------------------------------------------------------------------------------------------

async function readHosted(ctx: RunContext, uri: string): Promise<string | undefined> {
  if (ctx.target === "mock") return ctx.world.readHosted(uri);
  const upstream = ctx.services?.services.upstream;
  if (upstream === undefined) return undefined;
  try {
    const response = await upstream.request({ method: "GET", url: uri, purpose: "kit_hosted_metadata", maxBytes: 131_072 });
    return response.ok ? response.body : undefined;
  } catch {
    return undefined;
  }
}

async function findCondition(ctx: RunContext, uri: string): Promise<Hex | undefined> {
  const logs = await explorerFor(ctx).getLogs(creatorCreationsQuery(ctx.account));
  let found: Hex | undefined;
  for (const log of logs.logs) {
    const event = decodeCreationLog(log);
    if (event !== null && event.kind === "created" && event.metadataUri === uri) found = event.conditionId;
  }
  return found;
}

interface ReviewReading {
  readonly status: string;
  readonly decision: string;
  readonly guard: "pass" | "flagged" | "none";
  readonly expiryChanged: boolean;
  readonly changes: ReadonlyArray<{ readonly field: string; readonly kind: string; readonly risk: string }>;
}

async function followReview(ctx: RunContext, conditionId: Hex, timeoutMs: number): Promise<ReviewReading> {
  const polled = await ctx.poll<ReviewReading>(
    "the oracle's review",
    async () => {
      const result = await ctx.client.post("/v1/creation/track", { condition_id: conditionId });
      if (!result.ok) throw new Refusal(result.error.code, `following the review was refused: ${cleanLine(result.error.message, 200)}. The market exists; nothing is created again. Follow it with xo_track_market.`);
      const data = result.data;
      const reading: ReviewReading = {
        status: data.status,
        decision: data.review.decision,
        guard: data.pending_update === null ? "none" : data.pending_update.guard_verdict,
        expiryChanged: data.pending_update?.expiry_changed === true,
        changes: (data.pending_update?.changes ?? []).map((change) => ({ field: change.field, kind: change.kind, risk: change.risk })),
      };
      return { done: reading.status !== "pending" && reading.status !== "not_found" && reading.status !== "unknown", value: reading };
    },
    { timeoutMs, everyMs: 60_000 },
  );
  return polled.value;
}

// Accepting a clean update: one more prepare, one signature, one submit. Returns a result only if it failed.
async function respond(ctx: RunContext, conditionId: Hex): Promise<Omit<TestResult, "observations"> | undefined> {
  ctx.step("respond");
  const prepared = await prepareUserOp(ctx, { owner: ctx.owner, action: "respond_update", params: { condition_id: conditionId, accept: true } });
  if (!prepared.ok) return { verdict: "inconclusive", summary: `The relay would not prepare the answer to the update: ${cleanLine(prepared.error.message, 240)}. The update stays unanswered.`, facts: [] };
  const sent = await signAndSubmitUserOp(ctx, prepared.item, "Accept the oracle's clean update (respondToUpdateRequest, accept)");
  if ("refused" in sent || sent.state === "rejected") return { verdict: "inconclusive", summary: "The answer to the update was refused. The update stays unanswered; nothing is sent again.", facts: [] };
  const watch = await waitForUserOp(ctx, sent.hash, 10 * 60_000);
  return watch.state === "included" ? undefined : { verdict: "inconclusive", summary: `The answer to the update is ${watch.state}. It is not sent again.`, facts: [] };
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
