import { decodeAbiParameters, toEventSelector } from "viem";

import { CONTENT_HASH_PREFIX, CREATION_NOTICES } from "../src/tools/create.js";
import type { PostHandler } from "./types.js";
import { SAFETY_NOTICES } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { requireFlag, type Flags } from "../src/relay/flags.js";
import {
  CREATION_FEE_ATOMIC,
  ENTRY_POINT_V07,
  MARKET_CREATION_FEE_CHARGED_TOPIC,
  MARKET_MANAGER,
  USDC_E_ADDRESS,
  type Address,
  type Hex,
} from "../src/xo/chain/constants.js";
import { readCreationPreflight, type CreationPreflightRead } from "../src/xo/chain/reads.js";
import { SEED_CAP_ATOMIC } from "../src/xo/signing/amounts.js";
import { buildMetadataUri, checkCreateParams, metadataContentHash, validateMetadata, type MetadataCheck } from "../src/xo/creation/metadata.js";
import {
  OPEN_LATCH,
  PREFLIGHT_BLOCKER_TEXT,
  PREFLIGHT_WARNING_TEXT,
  acceptAdvice,
  checkIntent,
  classifyCreationFailure,
  clearSelectorLatch,
  decodeCreationLog,
  evaluateCreationPreflight,
  intentHash,
  observeCreationFailure,
  type AcceptAdvice,
  type CreationIntent,
  type IntentRecord,
  type IntentStatus as LibIntentStatus,
  type SelectorLatch,
} from "../src/xo/creation/review.js";
import { seedFitsDay } from "../src/xo/creation/seed.js";
import { cancelMarketCall, createMarketCalls, respondToUpdateCall } from "../src/xo/userop/calls.js";
import { needService } from "./config.js";
import type { PreparedRecord } from "./prepared.js";
import type { Json } from "./store.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";
import {
  reconcileOperation,
  routes as useropRoutes,
  useropEnv,
  type ExtensionBuild,
  type ExtensionEvent,
  type ExtensionRequest,
  type UserOpActionExtension,
  type UserOpExtensions,
  type XoReads,
} from "./userops.js";
import {
  WATCH_NS,
  discoverIntent,
  fetchMetadataFile,
  loadFresh,
  nowSecondsOf,
  pokeWatch,
  readCreatorCreations,
  readIntentDoc,
  refreshWatch,
  tickWatchers,
  trackMarket,
  writeIntentDoc,
  createdMarketsFor,
  type IntentDoc,
  type TickReport,
  type WatchDoc,
} from "./watchers.js";

// The creation lifecycle through the relay (docs/phase1-gap-closing.md gate 5, 5.1, 5.9, D5, A3, A10, N8 to N10,
// CR1 to CR10):
//
//   POST /v1/creation/track     the market's review status, timeline and the diff guard's pending update
//   POST /v1/userop/prepare     create_market, respond_update and cancel_market, through the extension point
//                               that relay/userops.ts keeps for them: it builds the checks, the calls, the title
//                               and the fee reservation, and relay/userops.ts does everything that matters
//                               (gates, nonce, paymaster, hashing, caps, the `sending` marker, the decoded summary)
//
// Rules this file keeps, each with a test:
//   - creation is OFF by default (XO_ENABLE_CREATE) and so is self-hosted metadata (ENABLE_SELF_HOSTED_METADATA);
//     there is NO cadence cap and none is added; the $1 fee counts toward the daily cap through the ledger;
//   - the metadata file is read from the declared self-host and judged by the same rules as XO's own files; the title
//     the approver sees is the title IN THAT FILE, not the one the caller sent;
//   - the selector-closed latch (O09) is durable and only an operator reopens it;
//   - the intent hash makes one draft one market: an earlier prepared copy, a send in flight, an unknown outcome or a
//     creation log by the same creator for the same URI each refuse a second prepare (CR8);
//   - an update request is accepted only when the diff guard passed on that suggestion, with time left; a declined
//     response is always possible while the market waits for an answer;
//   - nothing here signs or sends; every response is an approval-gated item.

// WIRING (createRelay), next to what relay/userops.ts asks for (its userops options and account directory):
//
//   const creation = createCreationRuntime({ now });                 // intervalMs defaults to 30 s; 0 starts no timer
//   const relay = await createRelay({ ..., extraServices: { userops, ...creation.extraServices } });
//   creation.attach(relay);                                            // resumes every watcher from the store, starts the loop
//   ... relay.close() ... creation.stop();
//
// `extraServices` carries the three creation actions for POST /v1/userop/prepare (useropExtensions) and the `createdMarkets`
// service that relay/orders.ts asks before it accepts a seed. POST /v1/creation/track is in the default route table
// (relay/routes.ts) and needs only the store and the upstream client. The tests build exactly this in
// test/relay-creation-helpers.ts. Without attach() the watcher does nothing and createdBy answers "unknown": a seed is refused.

export const CREATE_FLAG = "XO_ENABLE_CREATE" as const;
export const HOSTING_FLAG = "ENABLE_SELF_HOSTED_METADATA" as const;
const LATCH_KEY = "latch";
const REVERT_REASON_TOPIC = toEventSelector("UserOperationRevertReason(bytes32,address,uint256,bytes)");
const MAX_CHECK_CODES = 12;

// ---- the selector latch (O09), durable -----------------------------------------------------------------------------------

function isLatch(value: unknown): value is SelectorLatch {
  if (typeof value !== "object" || value === null) return false;
  const latch = value as Partial<SelectorLatch>;
  return typeof latch.closed === "boolean" && (latch.reason === null || typeof latch.reason === "string") && (latch.sinceS === null || typeof latch.sinceS === "number");
}

export function readCreationLatch(context: RelayContext): SelectorLatch {
  const value = needService(context, "state").get(WATCH_NS, LATCH_KEY);
  // A latch record that cannot be read counts as closed: opening it is an operator's decision.
  if (value === undefined) return OPEN_LATCH;
  return isLatch(value) ? value : { closed: true, reason: "unexpected_revert", sinceS: 0 };
}

async function writeLatch(context: RelayContext, latch: SelectorLatch): Promise<void> {
  await needService(context, "state").set(WATCH_NS, LATCH_KEY, latch as unknown as Json);
}

// Only an operator reopens the latch, and only by naming themselves. No reading of the chain does.
export async function clearCreationLatch(context: RelayContext, acknowledgement: { readonly operator: true }): Promise<SelectorLatch> {
  const next = clearSelectorLatch(readCreationLatch(context), acknowledgement);
  await writeLatch(context, next);
  return next;
}

// ---- the pre-flight (CR1, CR2) ---------------------------------------------------------------------------------------------

async function lastFeeEvent(reads: XoReads): Promise<bigint | null> {
  try {
    const read = await reads.explorer.getLogs({ address: MARKET_MANAGER, topic0: MARKET_CREATION_FEE_CHARGED_TOPIC });
    let best: { readonly block: bigint; readonly fee: bigint } | undefined;
    for (const log of read.logs) {
      const event = decodeCreationLog(log);
      if (event === null || event.kind !== "fee_charged") continue;
      const block = BigInt(event.position.blockNumber);
      if (best === undefined || block >= best.block) best = { block, fee: BigInt(event.fee) };
    }
    return best?.fee ?? null;
  } catch {
    return null;
  }
}

async function preflight(context: RelayContext, reads: XoReads, account: Address, nowS: number): Promise<string[]> {
  const latch = readCreationLatch(context);
  if (latch.closed) {
    throw new RelayError("precondition_failed", "Creation is stopped: it was closed or paused earlier. An operator has to look and reopen it.", { reason: "selector_closed", latch: latch.reason ?? "unknown" });
  }
  const rpc = reads.rpc();
  const empty: CreationPreflightRead = { canCall: null, delay: null, collateralAllowed: null, creationFee: null, notes: [] };
  let read = empty;
  if (rpc !== undefined) {
    try {
      read = await readCreationPreflight(rpc, account);
    } catch {
      read = empty;
    }
  }
  const lastFee = read.creationFee === null ? await lastFeeEvent(reads) : null;
  const result = evaluateCreationPreflight({ latch, read, lastFeeEventAtomic: lastFee, nowS });
  if (result.latch.closed && !latch.closed) {
    await writeLatch(context, result.latch);
    await context.services.alerts?.raise({ id: "creation_selector_closed", severity: "critical", message: "XO's access manager no longer lets the public call market creation. Creation is stopped until an operator reopens it." }).catch(() => undefined);
  }
  if (!result.allowed) {
    throw new RelayError("precondition_failed", PREFLIGHT_BLOCKER_TEXT[result.blockers[0] ?? "fee_unknown"], { reason: "creation_preflight", blockers: [...result.blockers] });
  }
  return result.warnings.map((code) => PREFLIGHT_WARNING_TEXT[code]);
}

// ---- the intent: one draft, one market (CR8) ----------------------------------------------------------------------------------------

interface CreateExtension {
  readonly kind: "create";
  readonly intent: Hex;
  readonly uri: string;
}

function extensionOf(record: PreparedRecord): CreateExtension | undefined {
  const payload = record.payload as { readonly extension?: unknown } | null;
  const extension = payload?.extension as Partial<CreateExtension> | null | undefined;
  return extension !== null && extension !== undefined && extension.kind === "create" && typeof extension.intent === "string" && typeof extension.uri === "string" ? (extension as CreateExtension) : undefined;
}

function createRecords(context: RelayContext, account: string, hash: Hex): PreparedRecord[] {
  return needService(context, "prepared")
    .list({ account })
    .filter((record) => record.kind === "create" && extensionOf(record)?.intent === hash);
}

// The state of each earlier prepared copy of this draft, in the vocabulary of review.ts. A copy that was sent is
// settled by the chain first (the userop module's own reconcile), so that a creation that reverted does not block a
// retry for ever and one that landed is never prepared twice.
async function intentRecords(context: RelayContext, account: Address, hash: Hex, nowS: number): Promise<IntentRecord[]> {
  const out: IntentRecord[] = [];
  const env = useropEnv(context);
  for (const record of createRecords(context, account, hash)) {
    const base = {
      hash,
      preparedId: record.id,
      preparedExpiresAtS: Math.floor(record.expiresAtMs / 1000),
      conditionId: null,
      txHash: null,
      createdAtS: Math.floor(record.createdAtMs / 1000),
      sentAtS: record.sendStartedAtMs === null ? null : Math.floor(record.sendStartedAtMs / 1000),
      updatedAtS: nowS,
    };
    const as = (status: LibIntentStatus): IntentRecord => ({ ...base, status });
    switch (record.state) {
      case "prepared":
        out.push(as(record.expiresAtMs > nowS * 1000 ? "prepared" : "abandoned"));
        break;
      case "expired":
      case "rejected":
        out.push(as("abandoned"));
        break;
      case "sending":
      case "accepted":
      case "ambiguous": {
        const settled = await reconcileOperation(env, record);
        if (settled.outcome === "included") out.push(as(settled.success ? "included" : "abandoned"));
        else if (settled.outcome === "superseded") out.push(as("abandoned"));
        else out.push(as(record.state === "ambiguous" ? "ambiguous" : "sending"));
        break;
      }
    }
  }
  return out;
}

const INTENT_REFUSAL_CODE = { already_on_chain: "precondition_failed", already_included: "precondition_failed", in_flight: "precondition_failed", stale_prepared: "precondition_failed", ambiguous: "ambiguous" } as const;

// ---- a hosted file, judged ---------------------------------------------------------------------------------------------------------------------

function checkCodes(checks: readonly MetadataCheck[], severity: MetadataCheck["severity"]): string[] {
  return [...new Set(checks.filter((entry) => entry.severity === severity).map((entry) => `${entry.rule}:${entry.code}`))].slice(0, MAX_CHECK_CODES);
}

function uniqueRules(checks: readonly MetadataCheck[]): string[] {
  return [...new Set(checks.filter((entry) => entry.severity === "block").map((entry) => entry.rule))];
}

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

// ---- create_market --------------------------------------------------------------------------------------------------------------------------------------------

function flagsOf(context: RelayContext): Flags {
  return context.flags();
}

async function buildCreate(request: ExtensionRequest): Promise<ExtensionBuild> {
  const { context, reads, owner, account } = request;
  const params = request.params as { readonly metadata_uri: string; readonly expires_at: string; readonly title?: string };
  // The switches first, before any network read: both are off by default.
  requireFlag(flagsOf(context), CREATE_FLAG);
  requireFlag(flagsOf(context), HOSTING_FLAG);
  const nowS = Math.floor(request.now / 1000);
  const config = needService(context, "config");

  // 1. The URI must be under the declared self-host: it is the only place the relay reads a metadata file from.
  const selfHost = config.selfHostUrl;
  if (selfHost === undefined) {
    throw new RelayError("precondition_failed", "No self-host is declared at the relay (RELAY_SELF_HOST), so it cannot read or vouch for a metadata file.", { reason: "self_host_not_declared" });
  }
  if (!params.metadata_uri.startsWith(selfHost)) {
    throw new RelayError("precondition_failed", "The metadata URL is not under the self-host this relay was told about (RELAY_SELF_HOST), so it will not read it.", { reason: "metadata_host_not_declared" });
  }
  const hosting = buildMetadataUri(params.metadata_uri, flagsOf(context));
  if (!hosting.ok || hosting.uri !== params.metadata_uri) {
    throw new RelayError("precondition_failed", "The metadata URL is not usable as it stands (it must be exactly the normalised https URL, with no query, fragment or port).", {
      reason: "metadata_uri_invalid",
      rules: checkCodes(hosting.checks, "block"),
    });
  }
  const expiresAtS = Math.floor(Date.parse(params.expires_at) / 1000);
  if (!Number.isSafeInteger(expiresAtS) || expiresAtS <= 0) throw new RelayError("invalid_request", "expires_at is not a valid time.");
  const times = checkCreateParams({ collateral: USDC_E_ADDRESS, chainNowS: nowS, startsAtS: nowS, expiresAtS });
  if (times.some((entry) => entry.severity === "block")) {
    throw new RelayError("precondition_failed", "The market's end time is not acceptable (it must be at least an hour away, and within a year unless that was accepted).", { reason: "create_params_invalid", rules: checkCodes(times, "block") });
  }

  // 2. The file XO will read: fetched from the self-host and judged by the same rules as XO's own files.
  const fetched = await fetchMetadataFile(context, params.metadata_uri);
  if (fetched === undefined) {
    throw new RelayError("precondition_failed", "The metadata file could not be read at that URL. Host it there first, then prepare again.", { reason: "metadata_unreachable" });
  }
  const shape = validateMetadata(fetched.raw, { expiresAtS });
  if (!shape.ok || shape.metadata === null) {
    throw new RelayError("precondition_failed", "The hosted metadata file fails the plugin's checks for a market file. Nothing was prepared.", { reason: "metadata_invalid", rules: uniqueRules(shape.checks) });
  }
  const metadata = shape.metadata;
  const contentHash = metadataContentHash(metadata);

  // 3. One draft, one market: the earlier copies of this draft, and the creator's own creation logs.
  const intent: CreationIntent = { creator: account, metadataUri: params.metadata_uri, contentHash, expiresAt: expiresAtS };
  const hash = intentHash(intent);
  const creations = await readCreatorCreations(context, account);
  if (creations === undefined || !creations.complete) {
    throw new RelayError("capability_unknown", "The relay could not check whether this draft already exists on chain (the explorer was not readable), so nothing was prepared.", { reason: "creator_logs_unreadable" });
  }
  const decision = checkIntent(await intentRecords(context, account, hash, nowS), intent, creations.events, nowS);
  if (decision.action === "invalid") throw new RelayError("invalid_request", "The creation request is not well formed.");
  if (decision.action === "reuse") {
    throw new RelayError("precondition_failed", "This exact draft is already prepared and still valid. Sign that item, or wait for it to expire (about five minutes) and prepare again.", { reason: "already_prepared", prepared_id: decision.preparedId });
  }
  if (decision.action === "refuse") {
    const messages = {
      already_on_chain: "This market already exists on chain: the creator's own logs show it. Nothing was prepared; track it instead.",
      already_included: "This exact draft is already on chain. Track it instead of creating it again.",
      in_flight: "This exact draft has already been sent and is waiting to be included. Nothing was prepared.",
      ambiguous: "This exact draft was sent and the answer was lost. It is looked up in the logs and is never sent a second time.",
      stale_prepared: "An earlier prepared copy of this draft has expired and has not been released yet. Try again in a moment.",
    } as const;
    throw new RelayError(INTENT_REFUSAL_CODE[decision.reason], messages[decision.reason], { reason: decision.reason, ...(decision.conditionId === null ? {} : { condition_id: decision.conditionId }) });
  }

  // 4. CR1, CR2: the selector is open, the fee is the $1 this was built for.
  const preflightWarnings = await preflight(context, reads, account, nowS);

  // 5. The day's cap: the fee is reserved by the userop module; say whether a seed would still fit afterwards.
  const ledger = needService(context, "ledger");
  const usage = await ledger.usageDetail(account.toLowerCase(), ledger.currentDay()).catch(() => undefined);
  const seedFits = usage === undefined ? undefined : seedFitsDay({ capAtomic: SEED_CAP_ATOMIC }, { limitAtomic: config.limits.maxDailyAtomic, spentAtomic: usage.spentAtomic + CREATION_FEE_ATOMIC });

  const doc: IntentDoc = {
    v: 1,
    hash,
    owner,
    account,
    uri: params.metadata_uri,
    contentHash,
    expiresAtS,
    metadata,
    status: "built",
    userOpHash: null,
    conditionId: null,
    createdAtS: nowS,
    updatedAtS: nowS,
  };
  await writeIntentDoc(context, doc);

  const warnings: string[] = [
    CREATION_NOTICES.fee,
    CREATION_NOTICES.review,
    CREATION_NOTICES.policy,
    CREATION_NOTICES.terms,
    CREATION_NOTICES.dailyCap,
    `${CONTENT_HASH_PREFIX}${contentHash}`,
    `startsAt is fixed at ${iso(nowS)} when this item is built: sign and submit within a minute or two, or prepare again.`,
    ...preflightWarnings,
  ];
  if (seedFits !== undefined && !seedFits.fits) {
    warnings.push("After the $1 fee, today's remaining daily cap would not cover a $10.80 seed. The seed can be placed after 00:00 UTC, or the market can stay unseeded.");
  }
  const warned = checkCodes(shape.checks, "warn");
  if (warned.length > 0) warnings.push(`Metadata checks that did not block (rule:code): ${warned.join(", ")}.`);
  if (params.title !== undefined && params.title.trim() !== metadata.title.trim()) {
    warnings.push("The title the caller sent differs from the title in the hosted file; the approval shows the file's title, which is the one XO will read.");
  }
  warnings.push(SAFETY_NOTICES.untrustedText);

  const data: CreateExtension = { kind: "create", intent: hash, uri: params.metadata_uri };
  return {
    calls: createMarketCalls({ startsAt: nowS, expiresAt: expiresAtS, metadataUri: params.metadata_uri }),
    // The title that XO will read, from the hosted file; the userop module puts it in its fixed untrusted slot.
    title: metadata.title,
    reservation: { category: "creation_fee", amountAtomic: CREATION_FEE_ATOMIC },
    warnings,
    capabilities: ["CR1", "CR2", "CR3", "CR4", "CR5", "CR7", "AD10", "T6", "T6b"],
    data: data as unknown as Json,
  };
}

// After a creation that was included but reverted: reads the revert reason the EntryPoint logged and closes the latch
// when it says the door is shut, paused or changed in a way nobody can explain. Exported for the tests.
export async function closeLatchOnFailedCreation(context: RelayContext, reads: XoReads, userOpHash: Hex, account?: Address): Promise<void> {
  let text: string | undefined;
  try {
    const read = await reads.explorer.getLogs({ address: ENTRY_POINT_V07, topic0: REVERT_REASON_TOPIC, topic1: userOpHash });
    const log = read.logs[0];
    if (log !== undefined) {
      const [, reason] = decodeAbiParameters([{ type: "uint256" }, { type: "bytes" }], log.data);
      text = describeRevert(reason as Hex);
    }
  } catch {
    text = undefined;
  }
  // No revert reason on the index yet: the latch is left alone (and a later look can still find it).
  if (text === undefined) return;
  // The commonest user error, an account that holds less than the fee, reverts with whatever the token says. An
  // unexplained revert from an account that really holds less than $1 is that mistake, not a changed door.
  if (account !== undefined && classifyCreationFailure(text) === "unexpected") {
    const balance = await reads.usdceBalance(account);
    if (balance !== null && balance < CREATION_FEE_ATOMIC) text = "insufficient balance for the creation fee";
  }
  const latch = readCreationLatch(context);
  const next = observeCreationFailure(latch, text, nowSecondsOf(context));
  if (next.closed && !latch.closed) {
    await writeLatch(context, next);
    await context.services.alerts?.raise({ id: "creation_selector_closed", severity: "critical", message: "A market creation reverted in a way that says creation is closed, paused or changed. Creation is stopped until an operator reopens it." }).catch(() => undefined);
  }
}

// The revert data as words classifyCreationFailure understands. An `Error(string)` is decoded; a custom error is
// named by its selector. Anything the relay does not know stays as hex, which counts as "unexplained".
const KNOWN_REVERTS: ReadonlyArray<readonly [string, string]> = [
  ["068ca9d8", "AccessManagedUnauthorized"],
  ["d93c0665", "EnforcedPause"],
  ["e450d38c", "insufficient balance"],
  ["fb8f41b2", "insufficient allowance"],
];

function describeRevert(data: Hex): string {
  const hex = data.toLowerCase();
  if (hex.startsWith("0x08c379a0")) {
    try {
      const [message] = decodeAbiParameters([{ type: "string" }], `0x${hex.slice(10)}` as Hex);
      return String(message).slice(0, 200);
    } catch {
      return hex.slice(0, 66);
    }
  }
  for (const [selector, name] of KNOWN_REVERTS) if (hex.includes(selector)) return `${name} 0x${selector}`;
  return hex.slice(0, 66);
}

// The hosted file as it is now, judged by the same rules as at prepare, and compared by content hash with the file the
// owner approved. "unreachable" and "invalid" are not "unchanged": the relay cannot vouch for a file it cannot read.
async function hostedFileState(context: RelayContext, doc: IntentDoc): Promise<"same" | "changed" | "unreachable" | "invalid"> {
  const fetched = await fetchMetadataFile(context, doc.uri);
  if (fetched === undefined) return "unreachable";
  const shape = validateMetadata(fetched.raw, { expiresAtS: doc.expiresAtS });
  if (!shape.ok || shape.metadata === null) return "invalid";
  return metadataContentHash(shape.metadata) === doc.contentHash ? "same" : "changed";
}

const createExtension: UserOpActionExtension = {
  build: buildCreate,
  async beforeSend(event: ExtensionEvent) {
    const data = event.data as Partial<CreateExtension> | null;
    if (data === null || typeof data.intent !== "string") return;
    const doc = readIntentDoc(event.context, data.intent);
    if (doc === undefined) return;
    const state = await hostedFileState(event.context, doc);
    if (state === "same") return;
    if (state === "unreachable") {
      throw new RelayError("precondition_failed", "The hosted metadata file could not be read again just before sending, so the relay cannot vouch that it is the one you approved. Nothing was sent; host it again and submit.", { reason: "metadata_unreachable" });
    }
    throw new RelayError("precondition_failed", "The hosted metadata file is not the one you approved (it changed or no longer passes the checks). Nothing was sent; prepare again.", { reason: "metadata_changed" });
  },
  async afterAccepted(event: ExtensionEvent) {
    const data = event.data as Partial<CreateExtension> | null;
    if (data === null || typeof data.intent !== "string") return;
    const doc = readIntentDoc(event.context, data.intent);
    if (doc === undefined) return;
    await writeIntentDoc(event.context, { ...doc, status: "accepted", userOpHash: event.userOpHash, updatedAtS: nowSecondsOf(event.context) });
  },
  async afterIncluded(event) {
    const data = event.data as Partial<CreateExtension> | null;
    if (data === null || typeof data.intent !== "string") return;
    const doc = readIntentDoc(event.context, data.intent);
    if (doc === undefined) return;
    if (event.success) {
      // XO's oracle reads the hosted file after this. If it is no longer the approved one, say so loudly.
      const state = await hostedFileState(event.context, doc).catch(() => "unreachable" as const);
      if (state === "changed" || state === "invalid") {
        await event.context.services.alerts
          ?.raise({ id: "creation_metadata_changed", severity: "critical", message: `The hosted metadata file of a market created from ${doc.account.slice(0, 6)}...${doc.account.slice(-4)} is no longer the file that was approved. XO's review will read the changed one.` })
          .catch(() => undefined);
      }
      await discoverIntent(event.context, { ...doc, userOpHash: event.userOpHash });
      return;
    }
    // Included but reverted: nothing was created and the fee was not charged. A retry is allowed; a revert that
    // says the door is shut closes the latch.
    await writeIntentDoc(event.context, { ...doc, status: "failed", userOpHash: event.userOpHash, updatedAtS: nowSecondsOf(event.context) });
    await closeLatchOnFailedCreation(event.context, event.reads, event.userOpHash, event.account);
  },
};

// ---- respond_update and cancel_market ------------------------------------------------------------------------------------------------------------------------

interface MarketExtension {
  readonly kind: "respond" | "cancel";
  readonly conditionId: Hex;
}

function marketData(kind: MarketExtension["kind"], conditionId: Hex): Json {
  return { kind, conditionId } satisfies MarketExtension as unknown as Json;
}

async function ownMarket(request: ExtensionRequest, conditionId: Hex): Promise<WatchDoc> {
  requireFlag(flagsOf(request.context), CREATE_FLAG);
  const doc = await loadFresh(request.context, conditionId);
  if (doc === undefined) {
    throw new RelayError("not_found", "The relay has no creation record of that market for this account (it may not exist, or was created elsewhere).", { reason: "market_unknown" });
  }
  if (doc.creator.toLowerCase() !== request.account.toLowerCase()) {
    throw new RelayError("precondition_failed", "That market was not created by this owner's XO account, so only its creator can answer for it.", { reason: "not_creator" });
  }
  return doc;
}

const ADVICE_TEXT: Readonly<Record<AcceptAdvice["reasons"][number], string>> = Object.freeze({
  not_in_update_phase: "The market is not waiting for an answer to an update request.",
  window_lapsed: "The window to accept XO's changes has closed. Only declining is still possible.",
  guard_unchecked: "The diff guard has not checked XO's suggested file (it could not be read yet), so accepting is not offered. Declining, or waiting, are possible.",
  guard_flagged: "The diff guard flagged XO's suggestion as changing what the market means. Accepting is not offered; read it, then decline or leave it.",
  past_accept_by: "Too little time is left to sign, send and include an acceptance before the window closes. Only declining is offered.",
  window_short: "The window to answer is short.",
});

const respondExtension: UserOpActionExtension = {
  async build(request) {
    const params = request.params as { readonly condition_id: Hex; readonly accept: boolean };
    const doc = await ownMarket(request, params.condition_id);
    const nowS = Math.floor(request.now / 1000);
    const phase = doc.state.phase;
    if (phase !== "update_required" && phase !== "update_window_lapsed") {
      throw new RelayError("precondition_failed", "The market is not waiting for an answer to an update request.", { reason: "not_waiting_for_update", status: phase });
    }
    const warnings: string[] = [CREATION_NOTICES.fee, CREATION_NOTICES.review, CREATION_NOTICES.policy, CREATION_NOTICES.terms];
    if (params.accept) {
      const advice = acceptAdvice(doc.state, nowS);
      if (!advice.recommended) {
        const blocking = advice.reasons.find((reason) => reason !== "window_short") ?? "not_in_update_phase";
        throw new RelayError("precondition_failed", ADVICE_TEXT[blocking], { reason: blocking, status: phase, accept: false });
      }
      warnings.push("Accepting applies XO's suggested file and, if it carries one, a new end date. The diff guard found no change to numbers, dates, comparison wording, named entities, outcome labels or the end date, but it cannot read meaning: read the new rules first.");
      if (advice.reasons.includes("window_short")) warnings.push(ADVICE_TEXT.window_short);
    } else {
      warnings.push("Declining cancels the market. The $1 fee is not refunded. Leaving the request unanswered costs nothing more.");
    }
    if (doc.pending !== null) warnings.push(...doc.pending.lines.slice(0, 6));
    return {
      calls: [respondToUpdateCall(params.condition_id, params.accept)],
      title: doc.baseline?.title,
      warnings,
      capabilities: ["CR5", "CR6"],
      data: marketData("respond", params.condition_id),
    };
  },
  async afterAccepted(event) {
    const data = event.data as Partial<MarketExtension> | null;
    if (data?.conditionId !== undefined) await pokeWatch(event.context, data.conditionId);
  },
  async afterIncluded(event) {
    const data = event.data as Partial<MarketExtension> | null;
    if (data?.conditionId !== undefined) await refreshWatch(event.context, data.conditionId, { force: true });
  },
};

const cancelExtension: UserOpActionExtension = {
  async build(request) {
    const params = request.params as { readonly condition_id: Hex };
    const doc = await ownMarket(request, params.condition_id);
    if (doc.state.phase !== "pending") {
      throw new RelayError("precondition_failed", "Only a market that is still waiting for its first review can be cancelled by its creator.", { reason: "not_pending", status: doc.state.phase });
    }
    return {
      calls: [cancelMarketCall(params.condition_id)],
      title: doc.baseline?.title,
      warnings: [
        "Cancelling a pending market ends it. The $1 creation fee is not refunded.",
        "If XO has already reviewed the market the cancel reverts and nothing happens.",
        CREATION_NOTICES.policy,
        CREATION_NOTICES.terms,
      ],
      capabilities: ["CR5"],
      data: marketData("cancel", params.condition_id),
    };
  },
  async afterAccepted(event) {
    const data = event.data as Partial<MarketExtension> | null;
    if (data?.conditionId !== undefined) await pokeWatch(event.context, data.conditionId);
  },
  async afterIncluded(event) {
    const data = event.data as Partial<MarketExtension> | null;
    if (data?.conditionId !== undefined) await refreshWatch(event.context, data.conditionId, { force: true });
  },
};

// What createRelay is given as `useropExtensions`.
export const creationExtensions: UserOpExtensions = Object.freeze({
  create_market: createExtension,
  respond_update: respondExtension,
  cancel_market: cancelExtension,
});

// ---- POST /v1/creation/track ----------------------------------------------------------------------------------------------------------------------------------------------

const trackHandler: PostHandler<"/v1/creation/track"> = async (body, context) => trackMarket(context, body.condition_id.toLowerCase() as Hex);

export const routes: RouteTable = {
  "POST /v1/creation/track": trackHandler,
};

// ---- the runtime: wiring and the background loop ------------------------------------------------------------------------------------------------------------------------------

export interface CreationRuntimeOptions {
  // How often the loop looks for work. 0 starts no timer (tests call tick() themselves).
  readonly intervalMs?: number;
  // An injectable clock (epoch ms). Default Date.now.
  readonly now?: () => number;
}

export interface RelayLike {
  readonly services: RelayServices;
  readonly flags: () => Flags;
}

export interface CreationRuntime {
  // Pass to createRelay as `extraServices` (merge with the userops options).
  readonly extraServices: Pick<RelayServices, "useropExtensions" | "createdMarkets">;
  // Call once createRelay has returned: binds the services, resumes every watcher from the store and starts the loop.
  attach(relay: RelayLike): void;
  tick(): Promise<TickReport | undefined>;
  context(): RelayContext | undefined;
  stop(): void;
}

export const TICK_INTERVAL_MS = 30_000;

function settleOperation(context: RelayContext, userOpHash: Hex): Promise<void> {
  const handler = useropRoutes["GET /v1/userop/:hash"];
  if (handler === undefined) return Promise.resolve();
  return handler({ hash: userOpHash }, context).then(() => undefined);
}

function mayHaveBeenSent(context: RelayContext, intent: IntentDoc): boolean {
  return createRecords(context, intent.account, intent.hash).some((record) => record.state === "sending" || record.state === "accepted" || record.state === "ambiguous");
}

export function createCreationRuntime(options: CreationRuntimeOptions = {}): CreationRuntime {
  let bound: RelayLike | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const abort = new AbortController();
  const now = options.now ?? Date.now;

  const context = (): RelayContext | undefined =>
    bound === undefined ? undefined : { flags: bound.flags, now, requestId: "creation-watcher", signal: abort.signal, services: bound.services };

  const tick = async (): Promise<TickReport | undefined> => {
    const ctx = context();
    if (ctx === undefined || running) return undefined;
    running = true;
    try {
      return await tickWatchers(ctx, { settleOperation, mayHaveBeenSent });
    } catch {
      return undefined;
    } finally {
      running = false;
    }
  };

  return {
    extraServices: { useropExtensions: creationExtensions, createdMarkets: createdMarketsFor(context) },
    attach(relay) {
      bound = relay;
      const interval = options.intervalMs ?? TICK_INTERVAL_MS;
      // Resume: whatever was being watched when the process stopped is looked at once, now.
      if (interval > 0) {
        void tick();
        timer = setInterval(() => void tick(), interval);
        timer.unref();
      }
    },
    tick,
    context,
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      abort.abort();
    },
  };
}

