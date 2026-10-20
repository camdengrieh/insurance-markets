import { sanitizeUntrusted } from "../src/guardrails/untrusted.js";
import type { PostResponseInput } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { CLOB_MARKET_CREATED_TOPIC, MARKET_CANCELLED_BY_OWNER_TOPIC, MARKET_MANAGER, MARKET_REVIEWED_TOPIC, MARKET_TYPE_CLOB_CONVICTION, METADATA_UPDATED_TOPIC, UPDATE_REQUEST_RESPONDED_TOPIC, type Address, type Hex } from "../src/xo/chain/constants.js";
import type { ChainLog, LogQuery } from "../src/xo/chain/reads.js";
import { describeDiff, diffMetadata, toPendingUpdate, type PendingUpdateView } from "../src/xo/creation/diff.js";
import { isXoMetadataUri, validateMetadata, type MetadataJson } from "../src/xo/creation/metadata.js";
import {
  OBSERVED_STATUSES,
  advanceClock,
  applyEvent,
  decodeCreationLog,
  creatorCreationsQuery,
  nextPoll,
  replayEvents,
  startTracking,
  trackStatusOf,
  trackViewOf,
  type CreatedEvent,
  type CreationEvent,
  type EffectKind,
  type ObservedStatus,
  type ReviewEffect,
  type ReviewState,
  type TimelineEntry,
} from "../src/xo/creation/review.js";
import { seedReadiness } from "../src/xo/creation/seed.js";
import { needService } from "./config.js";
import { NAMESPACES, type Json } from "./store.js";
import type { CreatedMarkets } from "./orders.js";
import type { RelayContext } from "./types.js";
import { readsFor, type XoReads } from "./userops.js";

// The durable creation watcher (docs/phase1-gap-closing.md CR5, CR6, CR8, N9, amendment A2; research note 23
// section 4 and rules O05 to O09).
//
// What it keeps, in the relay's own store, so a restart changes nothing:
//   intents/<intent hash>   what a create_market item was built from (the hosted metadata file, the URI, the
//                           expiry), so the diff guard has an ORIGINAL to compare XO's suggestion with;
//   watchers/market:<cid>   one record per market: the pure ReviewState of src/xo/creation/review.ts plus
//                           what the relay learnt around it (the guard's pending diff, whether the orderbook
//                           shows the market as active, when to look next).
//
// What it does, on every tick and on every explicit track call:
//   1. a create that the bundler accepted is looked for in the creator's CLOBMarketCreated logs (CR8: by the
//      creator and the URI, never by fee events); a match starts the market's review tracker;
//   2. the tracker polls the manager's logs on the schedule of review.ts (every 60 s for 30 minutes after
//      inclusion, every 5 minutes for 12 hours, then a slow watch for XO's later rewrites) and applies them;
//   3. when XO asks for changes, or rewrites the metadata later, the new file is fetched (only from XO's own
//      buckets or the declared self-host) and compared with the original by the diff guard; the verdict is
//      recorded on the tracker, and an accept is possible only after a pass (acceptAdvice);
//   4. once the market is active it reads the orderbook's own `active` flag, because a seed is placed only
//      when that is true (A3, N9: a 422 means wait);
//   5. every state change that matters is an alert with fixed wording (never market or oracle text).
//
// Nothing here signs, sends or spends. The seed and the answer to an update request are approval-gated items
// that a person prepares; this module only tells them when it is time.

export const WATCH_NS = NAMESPACES.watchers;
export const INTENT_NS = NAMESPACES.intents;
const MARKET_PREFIX = "market:";
const NEVER = Number.MAX_SAFE_INTEGER;
const ORDERBOOK_MARKET_URL = "https://orderbooks.xo.market/markets/";
const DATA_API_MARKET_URL = "https://api-mainnet.xo.market/api/markets/contract/";
const FETCH_MAX_BYTES = 131_072;
const FETCH_TIMEOUT_MS = 5_000;
const GUARD_RETRY_S = 60;
const MAX_MARKETS_PER_TICK = 12;
const MAX_WATCHED = 200;
const INTENT_RETENTION_S = 7 * 86_400;
const MAX_EXTRA_TIMELINE = 20;
const MAX_TIMELINE_OUT = 200;

// ---- stored shapes -------------------------------------------------------------------------------------------

export type IntentStatus = "built" | "accepted" | "included" | "failed";

// What a create_market item was built from. Plain JSON.
export interface IntentDoc {
  readonly v: 1;
  readonly hash: Hex;
  readonly owner: Address;
  readonly account: Address;
  readonly uri: string;
  readonly contentHash: Hex;
  readonly expiresAtS: number;
  readonly metadata: MetadataJson;
  readonly status: IntentStatus;
  readonly userOpHash: Hex | null;
  readonly conditionId: Hex | null;
  readonly createdAtS: number;
  readonly updatedAtS: number;
}

export interface PendingDoc {
  readonly kind: "suggestion" | "update";
  readonly uri: string;
  readonly atS: number;
  readonly verdict: "pass" | "flagged";
  readonly view: PendingUpdateView;
  // Fixed lines from describeDiff (codes and counts only).
  readonly lines: readonly string[];
  readonly metadata: MetadataJson;
}

export interface WatchDoc {
  readonly v: 1;
  readonly conditionId: Hex;
  // The smart account that created it.
  readonly creator: Address;
  readonly owner: Address | null;
  readonly intent: Hex | null;
  readonly state: ReviewState;
  // The file the diff guard compares XO's changes with: the creator's own, then the last one they accepted.
  readonly baseline: MetadataJson | null;
  readonly baselineUri: string | null;
  readonly pending: PendingDoc | null;
  // The orderbook's own flag; null until it has been read.
  readonly orderbookActive: boolean | null;
  // Timeline entries the relay adds around the tracker's own (orderbook observations).
  readonly extra: readonly TimelineEntry[];
  readonly guardTryAtS: number;
  readonly nextDueS: number;
  readonly done: boolean;
  readonly failures: number;
  readonly lastPolledS: number;
}

const asJson = (value: unknown): Json => value as Json;

// ---- small helpers ----------------------------------------------------------------------------------------------

export const nowSecondsOf = (context: RelayContext): number => Math.floor(context.now() / 1000);

export function watchKey(conditionId: string): string {
  return `${MARKET_PREFIX}${conditionId.toLowerCase()}`;
}

function isWatchDoc(value: unknown): value is WatchDoc {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Partial<WatchDoc>;
  return doc.v === 1 && typeof doc.conditionId === "string" && typeof doc.creator === "string" && typeof doc.state === "object" && doc.state !== null && doc.state.version === 1 && typeof doc.nextDueS === "number";
}

function isIntentDoc(value: unknown): value is IntentDoc {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Partial<IntentDoc>;
  return doc.v === 1 && typeof doc.hash === "string" && typeof doc.account === "string" && typeof doc.uri === "string" && typeof doc.status === "string";
}

export function readWatch(context: RelayContext, conditionId: string): WatchDoc | undefined {
  const value = needService(context, "state").get(WATCH_NS, watchKey(conditionId));
  return isWatchDoc(value) ? value : undefined;
}

export async function writeWatch(context: RelayContext, doc: WatchDoc): Promise<void> {
  await needService(context, "state").set(WATCH_NS, watchKey(doc.conditionId), asJson(doc));
}

export function listWatches(context: RelayContext): WatchDoc[] {
  const out: WatchDoc[] = [];
  for (const [key, value] of needService(context, "state").list(WATCH_NS)) {
    if (key.startsWith(MARKET_PREFIX) && isWatchDoc(value)) out.push(value);
  }
  return out.sort((a, b) => a.conditionId.localeCompare(b.conditionId));
}

export function readIntentDoc(context: RelayContext, hash: string): IntentDoc | undefined {
  const value = needService(context, "state").get(INTENT_NS, hash.toLowerCase());
  return isIntentDoc(value) ? value : undefined;
}

export async function writeIntentDoc(context: RelayContext, doc: IntentDoc): Promise<void> {
  await needService(context, "state").set(INTENT_NS, doc.hash.toLowerCase(), asJson(doc));
}

export function listIntentDocs(context: RelayContext): IntentDoc[] {
  const out: IntentDoc[] = [];
  for (const [, value] of needService(context, "state").list(INTENT_NS)) if (isIntentDoc(value)) out.push(value);
  return out.sort((a, b) => a.createdAtS - b.createdAtS || a.hash.localeCompare(b.hash));
}

function readers(context: RelayContext): XoReads {
  return readsFor(needService(context, "upstream"), context.services.userops, context.now);
}

const sameAddress = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

// ---- chain and web reads ----------------------------------------------------------------------------------------------

export interface CreatorCreations {
  readonly events: readonly CreatedEvent[];
  // False when the explorer could not give a complete answer: "nothing found" then proves nothing.
  readonly complete: boolean;
}

function decodeCreated(logs: readonly ChainLog[]): CreatedEvent[] {
  const out: CreatedEvent[] = [];
  for (const log of logs) {
    const event = decodeCreationLog(log);
    if (event !== null && event.kind === "created") out.push(event);
  }
  return out;
}

// Every CLOBMarketCreated by this creator (topic2). CR8: this, not the fee events, is the proof of a creation.
export async function readCreatorCreations(context: RelayContext, account: string): Promise<CreatorCreations | undefined> {
  try {
    const read = await readers(context).explorer.getLogs(creatorCreationsQuery(account));
    return { events: decodeCreated(read.logs), complete: read.complete };
  } catch {
    return undefined;
  }
}

async function readCreatedByCondition(context: RelayContext, conditionId: Hex): Promise<CreatorCreations | undefined> {
  try {
    const read = await readers(context).explorer.getLogs({ address: MARKET_MANAGER, topic0: CLOB_MARKET_CREATED_TOPIC, topic1: conditionId });
    return { events: decodeCreated(read.logs).filter((event) => event.conditionId === conditionId.toLowerCase()), complete: read.complete };
  } catch {
    return undefined;
  }
}

function canFetchMetadata(context: RelayContext, uri: string): boolean {
  if (isXoMetadataUri(uri)) return true;
  const selfHost = context.services.config?.selfHostUrl;
  return selfHost !== undefined && uri.startsWith(selfHost);
}

async function fetchJson(context: RelayContext, url: string, purpose: string): Promise<unknown | undefined> {
  const upstream = needService(context, "upstream");
  try {
    const response = await upstream.request({ method: "GET", url, purpose, maxBytes: FETCH_MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS, signal: context.signal });
    if (!response.ok) return undefined;
    return upstream.json(response);
  } catch {
    return undefined;
  }
}

// The metadata file at a URI, in the nine-key shape, or undefined (unreachable, not allowed, not valid JSON).
export async function fetchMetadataFile(context: RelayContext, uri: string): Promise<{ readonly raw: unknown } | undefined> {
  if (!canFetchMetadata(context, uri)) return undefined;
  const raw = await fetchJson(context, uri, "metadata_fetch");
  return raw === undefined ? undefined : { raw };
}

interface Observation {
  readonly orderbookActive: boolean | null;
  readonly status: ObservedStatus | null;
}

// The orderbook's own `active` flag and the Data API's status of one market. Both are public reads; an
// answer that is not exactly the expected shape is "unknown", never a guess.
async function observeMarket(context: RelayContext, conditionId: Hex): Promise<Observation> {
  const [book, data] = await Promise.all([fetchJson(context, `${ORDERBOOK_MARKET_URL}${conditionId}`, "creation_orderbook"), fetchJson(context, `${DATA_API_MARKET_URL}${conditionId}`, "creation_status")]);
  let orderbookActive: boolean | null = null;
  if (typeof book === "object" && book !== null && !Array.isArray(book)) {
    const flag = (book as Record<string, unknown>)["active"];
    if (typeof flag === "boolean") orderbookActive = flag;
  }
  let status: ObservedStatus | null = null;
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const raw = (data as Record<string, unknown>)["status"];
    const lower = typeof raw === "string" ? raw.toLowerCase() : "";
    if ((OBSERVED_STATUSES as readonly string[]).includes(lower)) status = lower as ObservedStatus;
  }
  return { orderbookActive, status };
}

// ---- alerts -----------------------------------------------------------------------------------------------------------

const ALERT_SEVERITY: Partial<Record<EffectKind, "info" | "warn">> = {
  market_created: "info",
  approved: "info",
  update_requested: "warn",
  rejected: "warn",
  owner_cancelled: "info",
  update_accepted: "info",
  update_declined: "info",
  update_window_lapsed: "warn",
  metadata_updated: "warn",
  anomaly: "warn",
};

async function raiseAlerts(context: RelayContext, conditionId: Hex, effects: readonly ReviewEffect[]): Promise<void> {
  const alerts = context.services.alerts;
  if (alerts === undefined) return;
  for (const effect of effects) {
    const severity = ALERT_SEVERITY[effect.kind];
    if (severity === undefined) continue;
    // Fixed project wording only; the market is named by its public id.
    try {
      await alerts.raise({ id: `creation_${effect.kind}_${conditionId.slice(2, 10)}`, severity, message: `${effect.detail} (market ${conditionId.slice(0, 12)})` });
    } catch {
      // An alert that cannot be written never stops the watcher.
    }
  }
}

// ---- starting a watch -----------------------------------------------------------------------------------------------------

export interface StartInit {
  readonly owner: Address | null;
  readonly intent: Hex | null;
  readonly baseline: MetadataJson | null;
  readonly baselineUri: string | null;
  readonly intendedExpiresAtS: number;
}

function newDoc(context: RelayContext, created: CreatedEvent, init: StartInit): { readonly doc: WatchDoc; readonly effects: readonly ReviewEffect[] } {
  const nowS = nowSecondsOf(context);
  const started = startTracking({ conditionId: created.conditionId, creator: created.creator, intendedExpiresAtS: init.intendedExpiresAtS, startedAtS: nowS });
  if (!started.ok) throw new RelayError("internal", "A creation log could not start a tracker.");
  const applied = applyEvent(started.state, created, nowS);
  const doc: WatchDoc = {
    v: 1,
    conditionId: created.conditionId,
    creator: created.creator,
    owner: init.owner,
    intent: init.intent,
    state: applied.state,
    baseline: init.baseline,
    baselineUri: init.baselineUri,
    pending: null,
    orderbookActive: null,
    extra: [],
    guardTryAtS: 0,
    // Look at once: the review may already have happened.
    nextDueS: nowS,
    done: false,
    failures: 0,
    lastPolledS: 0,
  };
  return { doc, effects: applied.effects };
}

function watchedCount(context: RelayContext): number {
  return needService(context, "state").keys(WATCH_NS).filter((key) => key.startsWith(MARKET_PREFIX)).length;
}

// Persists a tracker for a creation. Idempotent: a market that is already watched is returned as it is.
export async function startWatch(context: RelayContext, created: CreatedEvent, init: StartInit): Promise<WatchDoc> {
  const locks = needService(context, "locks");
  return locks.run(`creation:${created.conditionId}`, async () => {
    const existing = readWatch(context, created.conditionId);
    if (existing !== undefined) return existing;
    if (watchedCount(context) >= MAX_WATCHED) throw new RelayError("capability_unknown", "The relay already watches the most markets it will hold.", { reason: "watch_limit" });
    const { doc, effects } = newDoc(context, created, init);
    await writeWatch(context, doc);
    await raiseAlerts(context, doc.conditionId, effects);
    return doc;
  });
}

// ---- the diff guard on a fetched file ----------------------------------------------------------------------------------------

async function ensureBaseline(context: RelayContext, doc: WatchDoc): Promise<WatchDoc> {
  if (doc.baseline !== null) return doc;
  const uri = doc.state.currentMetadataUri;
  if (uri === null || !canFetchMetadata(context, uri)) return doc;
  const fetched = await fetchMetadataFile(context, uri);
  if (fetched === undefined) return doc;
  const shape = validateMetadata(fetched.raw);
  return shape.metadata === null ? doc : { ...doc, baseline: shape.metadata, baselineUri: uri };
}

// Runs the guard on one URI. A file that cannot be fetched leaves the guard "unchecked" (so no accept is
// recommended) and is tried again after GUARD_RETRY_S.
async function guardUri(context: RelayContext, input: WatchDoc, uri: string, kind: "suggestion" | "update", nowS: number, effects: ReviewEffect[]): Promise<WatchDoc> {
  let doc = await ensureBaseline(context, input);
  const retry = { ...doc, guardTryAtS: nowS + GUARD_RETRY_S };
  if (doc.baseline === null) return retry;
  const fetched = await fetchMetadataFile(context, uri);
  if (fetched === undefined) return retry;
  const review = doc.state.review;
  const suggestedExpiresAtS = kind === "suggestion" && review !== null && review.suggestedExpiresAtS !== 0 ? review.suggestedExpiresAtS : null;
  const result = diffMetadata(doc.baseline, fetched.raw, {
    currentExpiresAtS: doc.state.currentExpiresAtS,
    suggestedExpiresAtS,
    intendedExpiresAtS: doc.state.intendedExpiresAtS,
    nowS,
  });
  const shape = validateMetadata(fetched.raw);
  // A suggestion that is not the nine-key shape is flagged by the guard itself; it has no file to keep.
  const keep = shape.metadata ?? doc.baseline;
  const pending: PendingDoc = { kind, uri, atS: nowS, verdict: result.verdict, view: toPendingUpdate(result), lines: describeDiff(result), metadata: keep };
  const applied = applyEvent(doc.state, { kind: "guard_result", uri, verdict: result.verdict }, nowS);
  effects.push(...applied.effects);
  doc = { ...doc, state: applied.state, pending, guardTryAtS: 0 };
  return doc;
}

// The user accepted XO's suggestion: that file is now the baseline, and the new end date is the intended one.
function adoptAcceptedSuggestion(doc: WatchDoc): WatchDoc {
  const pending = doc.pending;
  const state = { ...doc.state, intendedExpiresAtS: doc.state.currentExpiresAtS };
  if (pending === null || pending.kind !== "suggestion") return { ...doc, state, pending: null };
  return { ...doc, state: { ...state, currentMetadataUri: pending.uri }, baseline: pending.metadata, baselineUri: pending.uri, pending: null };
}

// ---- one refresh of one market ----------------------------------------------------------------------------------------------------

function managerQuery(state: ReviewState, topic0: Hex): LogQuery {
  return {
    address: MARKET_MANAGER,
    topic0,
    topic1: state.conditionId,
    ...(state.createdBlock === null ? {} : { fromBlock: BigInt(state.createdBlock) }),
    toBlock: "latest",
  };
}

function everyQuery(state: ReviewState): LogQuery[] {
  return [
    managerQuery(state, MARKET_REVIEWED_TOPIC),
    managerQuery(state, MARKET_CANCELLED_BY_OWNER_TOPIC),
    managerQuery(state, UPDATE_REQUEST_RESPONDED_TOPIC),
    managerQuery(state, METADATA_UPDATED_TOPIC),
  ];
}

export interface Refreshed {
  readonly doc: WatchDoc;
  readonly effects: readonly ReviewEffect[];
  // False when the explorer could not be read, so the state may be behind the chain.
  readonly readable: boolean;
}

// Reads the chain (and, for an active market, the orderbook), applies what is new, runs the guard on any new
// file and works out when to look next. Does not persist; the caller does.
export async function refreshDoc(context: RelayContext, input: WatchDoc, options: { readonly force: boolean }): Promise<Refreshed> {
  const nowS = nowSecondsOf(context);
  const effects: ReviewEffect[] = [];
  let doc = input;
  const plan = nextPoll(doc.state, nowS);
  const queries = options.force ? everyQuery(doc.state) : plan.queries;
  const events: CreationEvent[] = [];
  let readable = true;
  for (const query of queries) {
    try {
      const read = await readers(context).explorer.getLogs(query);
      if (!read.complete) readable = false;
      for (const log of read.logs) {
        const event = decodeCreationLog(log);
        if (event !== null && event.kind !== "guard_result" && event.kind !== "status_observed" && event.conditionId === doc.state.conditionId) events.push(event);
      }
    } catch {
      readable = false;
    }
  }
  const applied = events.length > 0 ? replayEvents(doc.state, events, nowS) : advanceClock(doc.state, nowS);
  doc = { ...doc, state: applied.state };
  effects.push(...applied.effects);

  // New files first: a suggestion XO has just made, a rewrite after activation, an accepted suggestion.
  let guardedUri: string | undefined;
  for (const effect of applied.effects) {
    if ((effect.kind === "update_requested" || effect.kind === "metadata_updated") && effect.fetchable === true && effect.uri !== undefined) {
      doc = await guardUri(context, doc, effect.uri, effect.kind === "update_requested" ? "suggestion" : "update", nowS, effects);
      guardedUri = effect.uri;
    } else if (effect.kind === "update_accepted") {
      doc = adoptAcceptedSuggestion(doc);
    } else if (effect.kind === "update_declined" || effect.kind === "rejected" || effect.kind === "owner_cancelled") {
      doc = { ...doc, pending: null };
    }
  }
  // A suggestion whose file could not be read last time is tried again (the accept stays blocked meanwhile).
  const review = doc.state.review;
  if (doc.state.phase === "update_required" && doc.state.guard === "unchecked" && review !== null && guardedUri !== review.suggestedUri && nowS >= doc.guardTryAtS && isXoMetadataUri(review.suggestedUri)) {
    doc = await guardUri(context, doc, review.suggestedUri, "suggestion", nowS, effects);
  }
  // A metadata rewrite whose file could not be read: the same.
  const unchecked = doc.state.metadataUpdates.filter((entry) => entry.guard === "unchecked" && isXoMetadataUri(entry.uri));
  const lastUnchecked = unchecked[unchecked.length - 1];
  if (lastUnchecked !== undefined && lastUnchecked.uri !== guardedUri && nowS >= doc.guardTryAtS) {
    doc = await guardUri(context, doc, lastUnchecked.uri, "update", nowS, effects);
  }

  // An active market: the orderbook's flag (the seed's gate) and the Data API's status (closed, resolved, voided).
  if (doc.state.phase === "active" || doc.state.phase === "paused") {
    const seen = await observeMarket(context, doc.conditionId);
    let extra = doc.extra;
    if (seen.orderbookActive === true && doc.orderbookActive !== true) {
      extra = [...extra, { atS: nowS, event: "orderbook_active", detail: "The orderbook now shows the market as active, so a seed can be placed." }].slice(-MAX_EXTRA_TIMELINE);
    }
    doc = { ...doc, orderbookActive: seen.orderbookActive ?? doc.orderbookActive, extra };
    if (seen.status !== null) {
      const status = applyEvent(doc.state, { kind: "status_observed", status: seen.status, atS: null }, nowS);
      doc = { ...doc, state: status.state };
      effects.push(...status.effects);
    }
  }

  const next = nextPoll(doc.state, nowS);
  if (!readable) {
    const failures = doc.failures + 1;
    doc = { ...doc, failures, lastPolledS: nowS, nextDueS: nowS + Math.min(900, 30 * 2 ** Math.min(failures, 5)), done: false };
  } else if (next.action === "poll") {
    doc = { ...doc, failures: 0, lastPolledS: nowS, nextDueS: nowS + (next.delayS ?? 60), done: false };
  } else {
    doc = { ...doc, failures: 0, lastPolledS: nowS, nextDueS: NEVER, done: true };
  }
  return { doc, effects, readable };
}

// Refreshes a stored market under its lock and persists the result and its alerts.
export async function refreshWatch(context: RelayContext, conditionId: Hex, options: { readonly force: boolean }): Promise<Refreshed | undefined> {
  const locks = needService(context, "locks");
  return locks.run(`creation:${conditionId}`, async () => {
    const doc = readWatch(context, conditionId);
    if (doc === undefined) return undefined;
    const refreshed = await refreshDoc(context, doc, options);
    await writeWatch(context, refreshed.doc);
    await raiseAlerts(context, conditionId, refreshed.effects);
    return refreshed;
  });
}

// Asks for the next poll to happen on the next tick (after the creator answered or cancelled).
export async function pokeWatch(context: RelayContext, conditionId: string): Promise<void> {
  const locks = needService(context, "locks");
  await locks.run(`creation:${conditionId.toLowerCase()}`, async () => {
    const doc = readWatch(context, conditionId);
    if (doc === undefined) return;
    await writeWatch(context, { ...doc, nextDueS: nowSecondsOf(context), done: false });
  });
}

// ---- finding the market a create_market item made ------------------------------------------------------------------------------------

// Looks for the intent's market in its creator's logs and, on a match, starts the tracker. Returns the
// tracker, or undefined when nothing was found (the log is not there yet, or the explorer could not be read).
export async function discoverIntent(context: RelayContext, intent: IntentDoc): Promise<WatchDoc | undefined> {
  const found = await readCreatorCreations(context, intent.account);
  if (found === undefined) return undefined;
  const match = found.events.find((event) => sameAddress(event.creator, intent.account) && event.metadataUri === intent.uri && event.marketType === MARKET_TYPE_CLOB_CONVICTION);
  if (match === undefined) return undefined;
  const doc = await startWatch(context, match, { owner: intent.owner, intent: intent.hash, baseline: intent.metadata, baselineUri: intent.uri, intendedExpiresAtS: intent.expiresAtS });
  if (intent.status !== "included") await writeIntentDoc(context, { ...intent, status: "included", conditionId: match.conditionId, updatedAtS: nowSecondsOf(context) });
  return doc;
}

// ---- the tick ------------------------------------------------------------------------------------------------------------------------------------------

export interface TickReport {
  readonly intentsChecked: number;
  readonly started: readonly Hex[];
  readonly polled: readonly Hex[];
  readonly errors: number;
}

export interface TickHooks {
  // Settles an accepted create_market operation by its status (the userop module's own route handler), which
  // commits the fee reservation once the operation is seen on chain and runs the extension's inclusion hook.
  readonly settleOperation?: (context: RelayContext, userOpHash: Hex) => Promise<void>;
  // True while the prepared item behind an intent is in a state that may have sent it (adopts orphans).
  readonly mayHaveBeenSent?: (context: RelayContext, intent: IntentDoc) => boolean;
}

export async function tickWatchers(context: RelayContext, hooks: TickHooks = {}): Promise<TickReport> {
  const nowS = nowSecondsOf(context);
  const started: Hex[] = [];
  const polled: Hex[] = [];
  let errors = 0;
  let intentsChecked = 0;
  const before = new Set(needService(context, "state").keys(WATCH_NS));

  for (const intent of listIntentDocs(context)) {
    if (intent.status === "included" || intent.status === "failed") {
      if (nowS - intent.updatedAtS > INTENT_RETENTION_S) await needService(context, "state").delete(INTENT_NS, intent.hash.toLowerCase()).catch(() => undefined);
      continue;
    }
    // "built" is only followed once its prepared item may have been sent (an orphan the hook did not see).
    if (intent.status === "built" && hooks.mayHaveBeenSent?.(context, intent) !== true) {
      if (nowS - intent.updatedAtS > 86_400) await needService(context, "state").delete(INTENT_NS, intent.hash.toLowerCase()).catch(() => undefined);
      continue;
    }
    intentsChecked += 1;
    try {
      if (intent.userOpHash !== null && hooks.settleOperation !== undefined) await hooks.settleOperation(context, intent.userOpHash);
      const fresh = readIntentDoc(context, intent.hash) ?? intent;
      if (fresh.status !== "included") {
        const doc = await discoverIntent(context, fresh);
        if (doc !== undefined) started.push(doc.conditionId);
      }
    } catch {
      errors += 1;
    }
  }

  // A market can also be started inside the loop above, by the inclusion hook of the status route it called.
  for (const doc of listWatches(context)) if (!before.has(watchKey(doc.conditionId)) && !started.includes(doc.conditionId)) started.push(doc.conditionId);

  let budget = MAX_MARKETS_PER_TICK;
  for (const doc of listWatches(context)) {
    if (budget <= 0) break;
    if (doc.done || doc.nextDueS > nowS) continue;
    budget -= 1;
    try {
      const result = await refreshWatch(context, doc.conditionId, { force: false });
      if (result !== undefined) polled.push(doc.conditionId);
    } catch {
      errors += 1;
    }
  }
  return { intentsChecked, started, polled, errors };
}

// ---- POST /v1/creation/track -------------------------------------------------------------------------------------------------------------------------

type TrackResponse = PostResponseInput<"/v1/creation/track">;

const MARKET_NOT_FOUND = "No creation log was found for this market. It may not exist, may not be a Conviction market, or the explorer has not indexed it yet.";

function isoSecond(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// What the track route says about a market, from its tracker.
export function trackResponseOf(doc: WatchDoc, nowS: number): TrackResponse {
  const base = trackViewOf(doc.state, nowS);
  const timeline = [...base.timeline, ...doc.extra.map((entry) => ({ at: isoSecond(entry.atS), event: entry.event, detail: entry.detail.slice(0, 200) }))];
  timeline.sort((a, b) => a.at.localeCompare(b.at));
  const warnings: string[] = [...base.warnings];
  if (doc.state.phase === "active" && doc.orderbookActive !== true) warnings.push("The orderbook does not show this market as active yet. A seed order is refused until it does.");
  if (doc.state.phase === "update_required" && doc.state.guard === "unchecked") warnings.push("The suggested file has not been checked by the diff guard (it could not be read yet), so accepting is not offered. Declining or waiting are still possible.");
  const showPending = doc.pending !== null && (doc.state.phase === "update_required" || doc.state.phase === "update_window_lapsed" || doc.pending.kind === "update");
  return {
    condition_id: doc.conditionId,
    status: trackStatusOf(doc.state),
    review: base.review,
    timeline: timeline.slice(-MAX_TIMELINE_OUT),
    pending_update: showPending && doc.pending !== null ? { suggested_expires_at: doc.pending.view.suggested_expires_at, expiry_changed: doc.pending.view.expiry_changed, guard_verdict: doc.pending.verdict, changes: doc.pending.view.changes.map((change) => ({ ...change, before: { ...change.before, flags: [...change.before.flags] }, after: { ...change.after, flags: [...change.after.flags] } })) } : null,
    warnings: warnings.map((text) => sanitizeUntrusted(text, { maxChars: 600, source: "relay" }).text).slice(0, 16),
  };
}

function notFound(conditionId: Hex): TrackResponse {
  return { condition_id: conditionId, status: "not_found", review: { decision: "none", reviewed_at: null }, timeline: [], pending_update: null, warnings: [MARKET_NOT_FOUND] };
}

// Is this creator an account this relay has prepared something for? Only then is a market kept in the store: a
// stranger's market is read once and forgotten, so the store cannot be filled by asking about markets.
function isOurCreator(context: RelayContext, creator: string): boolean {
  if (needService(context, "prepared").list({ account: creator }).length > 0) return true;
  return listIntentDocs(context).some((intent) => sameAddress(intent.account, creator));
}

export async function trackMarket(context: RelayContext, conditionId: Hex): Promise<TrackResponse> {
  const nowS = nowSecondsOf(context);
  const cid = conditionId.toLowerCase() as Hex;
  const known = readWatch(context, cid);
  if (known !== undefined) {
    const refreshed = await refreshWatch(context, cid, { force: true });
    return trackResponseOf(refreshed?.doc ?? known, nowS);
  }
  const found = await readCreatedByCondition(context, cid);
  if (found === undefined) {
    throw new RelayError("capability_unknown", "The explorer could not be read, so the market could not be looked up.", { reason: "explorer_unreadable" });
  }
  const created = found.events[0];
  if (created === undefined) {
    if (!found.complete) throw new RelayError("capability_unknown", "The explorer's answer was incomplete, so the market could not be looked up.", { reason: "explorer_incomplete" });
    return notFound(cid);
  }
  const intent = listIntentDocs(context).find((entry) => entry.uri === created.metadataUri && sameAddress(entry.account, created.creator));
  const init: StartInit = {
    owner: intent?.owner ?? null,
    intent: intent?.hash ?? null,
    baseline: intent?.metadata ?? null,
    baselineUri: intent === undefined ? null : intent.uri,
    intendedExpiresAtS: intent?.expiresAtS ?? created.expiresAt,
  };
  if (isOurCreator(context, created.creator) && watchedCount(context) < MAX_WATCHED) {
    await startWatch(context, created, init);
    const refreshed = await refreshWatch(context, cid, { force: true });
    if (refreshed !== undefined) return trackResponseOf(refreshed.doc, nowS);
  }
  // A market this relay does not hold: read once, answered, not stored.
  const { doc } = newDoc(context, created, init);
  const refreshed = await refreshDoc(context, doc, { force: true });
  return trackResponseOf(refreshed.doc, nowS);
}

// A market for respond and cancel: the tracker, freshly read, or undefined when the chain has no such market.
export async function loadFresh(context: RelayContext, conditionId: Hex): Promise<WatchDoc | undefined> {
  const cid = conditionId.toLowerCase() as Hex;
  const known = readWatch(context, cid);
  if (known !== undefined) return (await refreshWatch(context, cid, { force: true }))?.doc ?? known;
  const found = await readCreatedByCondition(context, cid);
  const created = found?.events[0];
  if (created === undefined) return undefined;
  if (!isOurCreator(context, created.creator)) return undefined;
  const intent = listIntentDocs(context).find((entry) => entry.uri === created.metadataUri && sameAddress(entry.account, created.creator));
  await startWatch(context, created, {
    owner: intent?.owner ?? null,
    intent: intent?.hash ?? null,
    baseline: intent?.metadata ?? null,
    baselineUri: intent === undefined ? null : intent.uri,
    intendedExpiresAtS: intent?.expiresAtS ?? created.expiresAt,
  });
  return (await refreshWatch(context, cid, { force: true }))?.doc;
}

// ---- the service orders.ts asks ------------------------------------------------------------------------------------------------------------------------

// A seed is accepted only for a market this account created, that XO has approved, and that the orderbook shows as
// active (A3, N9). "no": the account has markets here but not this token; "unknown": the relay cannot say yet.
export function createdMarketsFor(getContext: () => RelayContext | undefined): CreatedMarkets {
  return {
    async createdBy(account, tokenId) {
      const context = getContext();
      if (context === undefined) return "unknown";
      let sawAccount = false;
      for (const doc of listWatches(context)) {
        if (!sameAddress(doc.creator, account)) continue;
        sawAccount = true;
        if (doc.state.yesTokenId !== tokenId && doc.state.noTokenId !== tokenId) continue;
        return seedReadiness({ phase: doc.state.phase, orderbookActive: doc.orderbookActive }).ready ? "yes" : "unknown";
      }
      return sawAccount ? "no" : "unknown";
    },
  };
}
