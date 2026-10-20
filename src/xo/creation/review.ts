// The review loop of a Conviction market, as a pure state machine (docs/phase1-gap-closing.md CR1, CR5, CR6,
// CR8; research note 23 sections 1, 4, 8 rules O05 to O09 and Verification V1, V2, V3).
//
// What happens on chain after `createConvictionMarket`:
//
//   PENDING --MarketReviewed(APPROVE)-----------------> ACTIVE
//   PENDING --MarketReviewed(REJECT)------------------> CANCELLED
//   PENDING --MarketReviewed(UPDATE_REQUIRED)---------> UPDATE_REQUIRED
//   PENDING --MarketCancelledByOwner------------------> CANCELLED       (only while PENDING)
//   UPDATE_REQUIRED --UpdateRequestResponded(true)----> ACTIVE          (before suggestionExpiresAt)
//   UPDATE_REQUIRED --UpdateRequestResponded(false)---> CANCELLED       (any time, even after the window)
//
// An unanswered update request stays UPDATE_REQUIRED at no further cost, and the suggestion window was
// as short as 20 minutes (48 hours for 165 of 233). XO rewrites metadata after activation for at least
// 10.3 percent of markets (MetadataUpdated), so an ACTIVE market keeps being watched for a while.
//
// This file holds four small pure pieces:
//   1. decoding the manager's logs into JSON-safe events;
//   2. the tracker: `applyEvent` / `advanceClock` / `nextPoll` over a JSON-safe `ReviewState`, with the
//      observed windows, terminal states, and an accept advice that is never positive before the diff
//      guard has run on the current suggestion;
//   3. the "selector closed" latch (O09) and the creation pre-flight (CR1, CR2): once `canCall` for the
//      public role turns false, or a create reverts with an access-manager or pause error, the latch
//      closes and stays closed until an operator clears it;
//   4. intent-hash idempotency (O05, CR8): the same draft cannot be created twice, a lost answer is
//      reconciled from `CLOBMarketCreated` (topic2 = creator) and never resent.
//
// No I/O, no clock reads (the caller passes `nowS`), no storage: the relay's watcher persists the state
// (it is plain JSON: no bigint, no Map) and feeds it events from the explorer log reader. Market and
// oracle text only appears as sanitised `UntrustedContent`.

import { decodeEventLog, encodeAbiParameters, getAddress, keccak256, stringToBytes } from "viem";

import { sanitizeUntrusted, type UntrustedContent } from "../../guardrails/untrusted.js";
import type { CREATION_STATUSES, REVIEW_DECISIONS } from "../../relay/contract.js";
import { MARKET_MANAGER_ABI } from "../chain/abi.js";
import {
  CLOB_MARKET_CREATED_TOPIC,
  CREATION_FEE_ATOMIC,
  MARKET_CANCELLED_BY_OWNER_TOPIC,
  MARKET_MANAGER,
  MARKET_REVIEWED_TOPIC,
  MARKET_TYPE_CLOB_CONVICTION,
  METADATA_UPDATED_TOPIC,
  REVIEW_DECISION,
  UPDATE_REQUEST_RESPONDED_TOPIC,
  USDC_E_ADDRESS,
  type Address,
  type Hex,
} from "../chain/constants.js";
import type { ChainLog, CreationPreflightRead, LogQuery } from "../chain/reads.js";
import { isXoMetadataUri, type PreflightRuleId } from "./metadata.js";

// ---- observed windows and cadences ------------------------------------------------------------------------

// Suggestion windows seen on 233 update requests: 48 h for 165, 26 h for 27, under 24 h for 15, under 6 h
// for 5, the shortest 0.33 h (20 minutes) [23 sec 4]. A reader must poll at minute resolution.
export const OBSERVED_WINDOW_S = Object.freeze({ min: 1200, max: 172_800 });
// Accept at least this long before suggestionExpiresAt (O07): the signature has to be made, sent and
// included before the window closes.
export const ACCEPT_MARGIN_S = 600;

// CR5 / O06: every 60 s for 30 minutes after inclusion, then every 5 minutes for 12 hours (the slowest
// first review seen took 652 minutes).
export const REVIEW_POLL = Object.freeze({ fastS: 60, fastUntilS: 1800, slowS: 300, slowUntilS: 43_200 });
// After activation: XO rewrote metadata 30 minutes to 7 hours later [23 V2 item 1]. Poll every 5 minutes
// for 8 hours, then every 30 minutes up to 48 hours, then stop (a status call can look again).
export const WATCH_POLL = Object.freeze({ earlyS: 300, earlyUntilS: 28_800, lateS: 1800, lateUntilS: 172_800 });
// An intent whose answer was lost is reconciled from the logs; this is how long a record is treated as
// "possibly still landing" before the relay may report it as not found (it is never auto-resent).
export const RECONCILE_GRACE_S = 3600;

// The wire vocabulary of POST /v1/creation/track (src/relay/contract.ts).
type CreationStatus = (typeof CREATION_STATUSES)[number];
type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

// ---- JSON-safe events -------------------------------------------------------------------------------------

export interface EventPosition {
  // Decimal string (a block number is a bigint; the state must stay JSON-safe).
  readonly blockNumber: string;
  readonly logIndex: number;
  readonly txHash: Hex | null;
  // Block time in unix seconds when the explorer supplied it.
  readonly atS: number | null;
}

export type ReviewDecisionName = "approve" | "reject" | "update_required";

export interface CreatedEvent {
  readonly kind: "created";
  readonly conditionId: Hex;
  readonly creator: Address;
  readonly yesTokenId: string;
  readonly noTokenId: string;
  readonly collateral: Address;
  readonly startsAt: number;
  readonly expiresAt: number;
  readonly metadataUri: string;
  readonly marketType: number;
  readonly position: EventPosition;
}
export interface ReviewedEvent {
  readonly kind: "reviewed";
  readonly conditionId: Hex;
  readonly decision: ReviewDecisionName;
  readonly suggestedUri: string;
  readonly notes: string;
  readonly suggestedExpiresAt: number;
  readonly suggestionExpiresAt: number;
  readonly position: EventPosition;
}
export interface RespondedEvent {
  readonly kind: "responded";
  readonly conditionId: Hex;
  readonly owner: Address;
  readonly accepted: boolean;
  readonly uri: string;
  readonly position: EventPosition;
}
export interface OwnerCancelledEvent {
  readonly kind: "cancelled_by_owner";
  readonly conditionId: Hex;
  readonly owner: Address;
  readonly position: EventPosition;
}
export interface MetadataUpdatedEvent {
  readonly kind: "metadata_updated";
  readonly conditionId: Hex;
  readonly newUri: string;
  readonly position: EventPosition;
}
export interface FeeChargedEvent {
  readonly kind: "fee_charged";
  readonly conditionId: Hex;
  readonly creator: Address;
  readonly fee: string;
  readonly position: EventPosition;
}
// Chain-derived events, in log order.
export type ChainEvent = CreatedEvent | ReviewedEvent | RespondedEvent | OwnerCancelledEvent | MetadataUpdatedEvent | FeeChargedEvent;

// The result of running the diff guard on a URI (the oracle's suggestion or a later MetadataUpdated).
export interface GuardResultEvent {
  readonly kind: "guard_result";
  readonly uri: string;
  readonly verdict: "pass" | "flagged";
}
// The status a chain read or the Data API reported (not derived from the manager's logs).
export const OBSERVED_STATUSES = Object.freeze(["pending", "cancelled", "active", "paused", "resolved", "closed", "update_required", "voided", "voided_closed"] as const);
export type ObservedStatus = (typeof OBSERVED_STATUSES)[number];
export interface StatusObservedEvent {
  readonly kind: "status_observed";
  readonly status: ObservedStatus;
  readonly atS: number | null;
}
export type CreationEvent = ChainEvent | GuardResultEvent | StatusObservedEvent;

interface EventShape {
  readonly name: string;
  readonly inputs: readonly { readonly name?: string; readonly indexed?: boolean }[];
}
const MANAGER_EVENTS: readonly EventShape[] = MARKET_MANAGER_ABI.filter((entry) => entry.type === "event") as readonly EventShape[];

const MAX_URI_CHARS = 2048;
const MAX_NOTE_CHARS = 8192;

function safeInt(value: unknown): number | null {
  const number = typeof value === "bigint" ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function position(log: ChainLog): EventPosition {
  return {
    blockNumber: log.blockNumber.toString(),
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash,
    atS: log.timestamp === null ? null : safeInt(log.timestamp),
  };
}

// Decodes one log of the market manager. Null for any other log, any log that does not decode strictly,
// and any log whose strings are oversized. Never throws.
export function decodeCreationLog(log: ChainLog): CreationEvent | null {
  try {
    if (log.address.toLowerCase() !== MARKET_MANAGER.toLowerCase() || log.topics.length === 0) return null;
    const decoded = decodeEventLog({ abi: MARKET_MANAGER_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
    const args = (decoded.args ?? {}) as Record<string, unknown>;
    // Only canonical encodings: the data must be exactly what encoding the decoded values gives, so padding
    // garbage, trailing bytes or an unusual layout are refused rather than read.
    const item = MANAGER_EVENTS.find((entry) => entry.name === String(decoded.eventName));
    if (item === undefined || log.topics.length !== 1 + item.inputs.filter((input) => input.indexed === true).length) return null;
    const plain = item.inputs.filter((input) => input.indexed !== true);
    const again = encodeAbiParameters(plain as never, plain.map((input) => args[input.name as string]) as never);
    if (again.toLowerCase() !== log.data.toLowerCase()) return null;
    const at = position(log);
    const conditionId = typeof args["conditionId"] === "string" ? (args["conditionId"].toLowerCase() as Hex) : null;
    if (conditionId === null) return null;
    const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.length <= max ? value : null);
    switch (String(decoded.eventName)) {
      case "CLOBMarketCreated": {
        const uri = text(args["metadataURI"], MAX_URI_CHARS);
        const startsAt = safeInt(args["startsAt"]);
        const expiresAt = safeInt(args["expiresAt"]);
        const marketType = safeInt(args["marketType"]);
        if (uri === null || startsAt === null || expiresAt === null || marketType === null) return null;
        if (typeof args["creator"] !== "string" || typeof args["collateralToken"] !== "string" || typeof args["outcome1TokenId"] !== "bigint" || typeof args["outcome2TokenId"] !== "bigint") return null;
        return {
          kind: "created",
          conditionId,
          creator: getAddress(args["creator"]),
          yesTokenId: args["outcome1TokenId"].toString(),
          noTokenId: args["outcome2TokenId"].toString(),
          collateral: getAddress(args["collateralToken"]),
          startsAt,
          expiresAt,
          metadataUri: uri,
          marketType,
          position: at,
        };
      }
      case "MarketReviewed": {
        const code = safeInt(args["decision"]);
        const decision: ReviewDecisionName | null =
          code === REVIEW_DECISION.APPROVE ? "approve" : code === REVIEW_DECISION.REJECT ? "reject" : code === REVIEW_DECISION.UPDATE_REQUIRED ? "update_required" : null;
        const suggestedUri = text(args["suggestedMetaDataURI"], MAX_URI_CHARS);
        const notes = text(args["extraNotes"], MAX_NOTE_CHARS);
        const suggestedExpiresAt = safeInt(args["suggestedExpiresAt"]);
        const suggestionExpiresAt = safeInt(args["suggestionExpiresAt"]);
        if (decision === null || suggestedUri === null || notes === null || suggestedExpiresAt === null || suggestionExpiresAt === null) return null;
        return { kind: "reviewed", conditionId, decision, suggestedUri, notes, suggestedExpiresAt, suggestionExpiresAt, position: at };
      }
      case "UpdateRequestResponded": {
        const uri = text(args["metaDataURI"], MAX_URI_CHARS);
        if (uri === null || typeof args["owner"] !== "string" || typeof args["accepted"] !== "boolean") return null;
        return { kind: "responded", conditionId, owner: getAddress(args["owner"]), accepted: args["accepted"], uri, position: at };
      }
      case "MarketCancelledByOwner":
        return typeof args["owner"] === "string" ? { kind: "cancelled_by_owner", conditionId, owner: getAddress(args["owner"]), position: at } : null;
      case "MetadataUpdated": {
        const newUri = text(args["newURI"], MAX_URI_CHARS);
        return newUri === null ? null : { kind: "metadata_updated", conditionId, newUri, position: at };
      }
      case "MarketCreationFeeCharged":
        return typeof args["creator"] === "string" && typeof args["fee"] === "bigint"
          ? { kind: "fee_charged", conditionId, creator: getAddress(args["creator"]), fee: args["fee"].toString(), position: at }
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// A chain event whose position can be ordered: a decimal block number and a whole log index.
function hasLogPosition(event: unknown): event is ChainEvent {
  if (typeof event !== "object" || event === null) return false;
  const position = (event as { position?: { blockNumber?: unknown; logIndex?: unknown } }).position;
  return typeof position === "object" && position !== null && typeof position.blockNumber === "string" && /^\d{1,30}$/.test(position.blockNumber) && typeof position.logIndex === "number" && Number.isSafeInteger(position.logIndex) && position.logIndex >= 0;
}

function compareBlock(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

// Log order: block, then log index. Events of other kinds (guard results, observed statuses) keep their
// relative place after the chain events.
export function compareChainEvents(a: ChainEvent, b: ChainEvent): number {
  return compareBlock(a.position.blockNumber, b.position.blockNumber) || a.position.logIndex - b.position.logIndex;
}

// ---- oracle notes -----------------------------------------------------------------------------------------

// The four forms of oracle note seen on 571 reviews [23 sec 3.2].
export type NoteRegime = "admin_stamp" | "modra" | "auto_summary" | "free_text" | "empty";

export function noteRegime(note: string): NoteRegime {
  const text = note.trim();
  if (text === "") return "empty";
  if (text === "Market approved by admin") return "admin_stamp";
  if (text === "This market is clear and ready to resolve.") return "auto_summary";
  if (text.startsWith("## MODRA Review")) return "modra";
  return "free_text";
}

// Why markets were rejected (51 first-review rejects), ported from the research script's classifier. A
// heuristic on English text; it informs the user and picks the pre-flight rules to re-check, it decides
// nothing.
export const REJECTION_CATEGORIES = Object.freeze([
  "junk_or_test",
  "duplicate",
  "event_already_happened",
  "not_binary",
  "automated_checker",
  "invalid_source",
  "about_xo",
  "ambiguous",
  "other",
] as const);
export type RejectionCategory = (typeof REJECTION_CATEGORIES)[number];

export function classifyRejection(note: string): RejectionCategory {
  const text = note.toLowerCase().trim();
  if (/^(?:test(?: market)?|this was a test market|reject(?:ed)?|\.|was created before the seed fix)$/.test(text)) return "junk_or_test";
  if (/dup|already (?:exists|live)|current market already|same event|identical markets/.test(text)) return "duplicate";
  if (/already (?:taken place|been played|concluded)|past event|has already|already concluded/.test(text)) return "event_already_happened";
  if (/not binary|binary format|draw|two binaries/.test(text)) return "not_binary";
  if (/api-football|playbook/.test(text)) return "automated_checker";
  if (/source|example\.com|opensea|does not display/.test(text)) return "invalid_source";
  if (/concerns xo|about the project|xo market metrics/.test(text)) return "about_xo";
  if (/ambiguous|specify|not specify|vague|subjective|disputed|unambiguous|misleading|too far|unlikely to match/.test(text)) return "ambiguous";
  return "other";
}

// Which pre-flight rules of [23 sec 8] would have caught each kind of rejection.
export const REJECTION_RULES: Readonly<Record<RejectionCategory, readonly PreflightRuleId[]>> = Object.freeze({
  junk_or_test: [],
  duplicate: ["R09"],
  event_already_happened: ["R02"],
  not_binary: ["R01", "R13"],
  automated_checker: ["R08"],
  invalid_source: ["M07", "R04", "R05", "R12"],
  about_xo: ["R10"],
  ambiguous: ["R03", "R06", "R07", "R14"],
  other: [],
});

// ---- the tracker ------------------------------------------------------------------------------------------

export type ReviewPhase =
  | "pending"
  | "update_required"
  | "update_window_lapsed"
  | "active"
  | "rejected"
  | "declined"
  | "cancelled"
  | "paused"
  | "resolved"
  | "closed"
  | "voided";

const TERMINAL_PHASES: ReadonlySet<ReviewPhase> = new Set(["rejected", "declined", "cancelled", "resolved", "closed", "voided"]);
export function isTerminal(phase: ReviewPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

export interface ReviewRecord {
  readonly decision: ReviewDecisionName;
  readonly reviewedAtS: number;
  readonly suggestedUri: string;
  // 0 when the oracle left the expiry alone.
  readonly suggestedExpiresAtS: number;
  readonly suggestionExpiresAtS: number;
  // suggestionExpiresAt minus the review time; 0 when the review carried no window.
  readonly windowS: number;
  readonly note: UntrustedContent;
  readonly noteRegime: NoteRegime;
  readonly rejection: RejectionCategory | null;
}

export type GuardState = "unchecked" | "pass" | "flagged";

export interface MetadataUpdateRecord {
  readonly atS: number;
  readonly uri: string;
  readonly guard: GuardState;
}

export interface TimelineEntry {
  readonly atS: number;
  // A fixed slug.
  readonly event: string;
  // Fixed text; never market or oracle text.
  readonly detail: string;
}

export interface ReviewState {
  readonly version: 1;
  readonly conditionId: Hex;
  readonly creator: Address | null;
  readonly phase: ReviewPhase;
  readonly startedAtS: number;
  readonly createdAtS: number | null;
  readonly createdBlock: string | null;
  readonly yesTokenId: string | null;
  readonly noTokenId: string | null;
  // What the user asked for at creation, and what the contract holds now (unix seconds).
  readonly intendedExpiresAtS: number;
  readonly currentExpiresAtS: number;
  readonly currentMetadataUri: string | null;
  readonly review: ReviewRecord | null;
  readonly guard: GuardState;
  readonly activatedAtS: number | null;
  readonly terminalAtS: number | null;
  readonly metadataUpdates: readonly MetadataUpdateRecord[];
  readonly anomalies: readonly string[];
  readonly timeline: readonly TimelineEntry[];
  // "block:logIndex" of every chain event applied, so a replayed log changes nothing.
  readonly seen: readonly string[];
  readonly lastAdvancedS: number;
}

const MAX_TIMELINE = 100;
const MAX_ANOMALIES = 20;
const MAX_SEEN = 400;
const MAX_UPDATES = 20;

export type EffectKind =
  | "market_created"
  | "approved"
  | "update_requested"
  | "rejected"
  | "owner_cancelled"
  | "update_accepted"
  | "update_declined"
  | "update_window_lapsed"
  | "metadata_updated"
  | "guard_recorded"
  | "status_changed"
  | "anomaly";

export interface ReviewEffect {
  readonly kind: EffectKind;
  // Fixed text for the notification.
  readonly detail: string;
  // update_requested: the time to accept by, and the hard deadline (unix seconds).
  readonly acceptByS?: number;
  readonly deadlineS?: number;
  // update_requested, metadata_updated: the URI to fetch and run the diff guard on. Fetch it only when
  // `isXoMetadataUri` says it is inside an XO bucket.
  readonly uri?: string;
  readonly fetchable?: boolean;
  readonly code?: string;
}

export interface TrackInit {
  readonly conditionId: string;
  readonly creator?: string;
  // The expiry the user asked for (unix seconds).
  readonly intendedExpiresAtS: number;
  readonly startedAtS: number;
}

export type StartResult = { readonly ok: true; readonly state: ReviewState } | { readonly ok: false; readonly reason: "invalid_input" };

const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;

export function startTracking(init: TrackInit): StartResult {
  if (!CONDITION_ID.test(init.conditionId)) return { ok: false, reason: "invalid_input" };
  if (!Number.isSafeInteger(init.intendedExpiresAtS) || init.intendedExpiresAtS <= 0 || !Number.isSafeInteger(init.startedAtS) || init.startedAtS <= 0) {
    return { ok: false, reason: "invalid_input" };
  }
  let creator: Address | null = null;
  if (init.creator !== undefined) {
    try {
      creator = getAddress(init.creator);
    } catch {
      return { ok: false, reason: "invalid_input" };
    }
  }
  return {
    ok: true,
    state: {
      version: 1,
      conditionId: init.conditionId.toLowerCase() as Hex,
      creator,
      phase: "pending",
      startedAtS: init.startedAtS,
      createdAtS: null,
      createdBlock: null,
      yesTokenId: null,
      noTokenId: null,
      intendedExpiresAtS: init.intendedExpiresAtS,
      currentExpiresAtS: init.intendedExpiresAtS,
      currentMetadataUri: null,
      review: null,
      guard: "unchecked",
      activatedAtS: null,
      terminalAtS: null,
      metadataUpdates: [],
      anomalies: [],
      timeline: [],
      seen: [],
      lastAdvancedS: init.startedAtS,
    },
  };
}

export interface Applied {
  readonly state: ReviewState;
  readonly effects: readonly ReviewEffect[];
}

function cap<T>(items: readonly T[], extra: T, max: number): T[] {
  const next = [...items, extra];
  return next.length > max ? next.slice(next.length - max) : next;
}

class Step {
  state: ReviewState;
  readonly effects: ReviewEffect[] = [];
  constructor(state: ReviewState, private readonly nowS: number) {
    this.state = { ...state, lastAdvancedS: Math.max(state.lastAdvancedS, nowS) };
  }
  patch(change: Partial<ReviewState>): void {
    this.state = { ...this.state, ...change };
  }
  note(atS: number, event: string, detail: string): void {
    this.state = { ...this.state, timeline: cap(this.state.timeline, { atS, event, detail }, MAX_TIMELINE) };
  }
  effect(effect: ReviewEffect, atS: number, event?: string): void {
    this.effects.push(effect);
    this.note(atS, event ?? effect.kind, effect.detail);
  }
  anomaly(code: string, detail: string, atS: number): void {
    this.state = { ...this.state, anomalies: this.state.anomalies.includes(code) ? this.state.anomalies : cap(this.state.anomalies, code, MAX_ANOMALIES) };
    this.effects.push({ kind: "anomaly", detail, code });
    this.note(atS, "anomaly", detail);
  }
  get now(): number {
    return this.nowS;
  }
}

function eventTime(event: ChainEvent, nowS: number): number {
  return event.position.atS ?? nowS;
}

function markTerminal(step: Step, phase: ReviewPhase, atS: number): void {
  step.patch({ phase, terminalAtS: atS });
}

// A window, in words, for a notification.
export function windowKind(windowS: number): "none" | "short" | "day" | "standard" {
  if (!Number.isFinite(windowS) || windowS <= 0) return "none";
  if (windowS < 21_600) return "short";
  if (windowS <= 93_600) return "day";
  return "standard";
}

function applyChainEvent(step: Step, event: ChainEvent): void {
  const state = step.state;
  const atS = eventTime(event, step.now);
  const key = `${event.position.blockNumber}:${event.position.logIndex}`;
  if (event.conditionId !== state.conditionId) return;
  if (state.seen.includes(key)) return;
  step.patch({ seen: cap(state.seen, key, MAX_SEEN) });

  switch (event.kind) {
    case "created": {
      if (state.createdAtS !== null) {
        step.anomaly("created_twice", "A second creation log for the same market was seen and ignored.", atS);
        return;
      }
      if (state.creator !== null && state.creator !== event.creator) {
        step.anomaly("creator_mismatch", "The creation log names a different creator than the one being tracked; it was ignored.", atS);
        return;
      }
      if (event.marketType !== MARKET_TYPE_CLOB_CONVICTION) step.anomaly("not_conviction_market", "The creation log is not for a Conviction market.", atS);
      if (event.expiresAt !== state.intendedExpiresAtS) step.anomaly("expiry_differs_from_intent", "The on-chain expiry differs from the one that was requested.", atS);
      step.patch({
        creator: event.creator,
        createdAtS: atS,
        createdBlock: event.position.blockNumber,
        yesTokenId: event.yesTokenId,
        noTokenId: event.noTokenId,
        currentExpiresAtS: event.expiresAt,
        currentMetadataUri: event.metadataUri,
      });
      step.effect({ kind: "market_created", detail: "The market was created on chain and is waiting for XO's review." }, atS);
      return;
    }
    case "reviewed": {
      if (state.phase !== "pending") {
        step.anomaly("review_out_of_order", "A review log arrived for a market that is not waiting for its first review; it was ignored.", atS);
        return;
      }
      const note = sanitizeUntrusted(event.notes, { maxChars: 600, source: "xo-oracle-review" });
      const regime = noteRegime(event.notes);
      const windowS = event.decision === "update_required" ? event.suggestionExpiresAt - atS : 0;
      const record: ReviewRecord = {
        decision: event.decision,
        reviewedAtS: atS,
        suggestedUri: event.suggestedUri,
        suggestedExpiresAtS: event.suggestedExpiresAt,
        suggestionExpiresAtS: event.suggestionExpiresAt,
        windowS,
        note,
        noteRegime: regime,
        rejection: event.decision === "reject" ? classifyRejection(event.notes) : null,
      };
      if (event.decision === "approve") {
        step.patch({ review: record, phase: "active", activatedAtS: atS });
        step.effect({ kind: "approved", detail: "XO approved the market. It is active; the seed order can be placed once the orderbook shows it as active." }, atS);
        return;
      }
      if (event.decision === "reject") {
        step.patch({ review: record });
        markTerminal(step, "rejected", atS);
        step.effect({ kind: "rejected", detail: "XO rejected the market. The $1 fee is not refunded." }, atS);
        return;
      }
      step.patch({ review: record, phase: "update_required", guard: "unchecked" });
      const acceptBy = event.suggestionExpiresAt - ACCEPT_MARGIN_S;
      const fetchable = isXoMetadataUri(event.suggestedUri);
      if (windowS <= 0) step.anomaly("window_not_positive", "The oracle's suggestion window was not in the future when it was published.", atS);
      step.effect(
        {
          kind: "update_requested",
          detail:
            windowKind(windowS) === "short"
              ? "XO asked for changes and the window to answer is short. Run the diff guard on the suggestion now."
              : "XO asked for changes. Run the diff guard on the suggestion before accepting or declining.",
          acceptByS: acceptBy,
          deadlineS: event.suggestionExpiresAt,
          uri: event.suggestedUri,
          fetchable,
        },
        atS,
      );
      if (!fetchable) step.anomaly("suggestion_uri_off_bucket", "The suggested file is not inside one of XO's metadata buckets and will not be fetched automatically.", atS);
      return;
    }
    case "responded": {
      if (state.phase === "update_required" || state.phase === "update_window_lapsed") {
        // The lapse is the tracker's own inference from the clock, and a log is authoritative: an acceptance whose
        // block time is before the window closed (or unknown) was valid, however late it was read. Only a log
        // stamped after the deadline contradicts the contract.
        const deadline = state.review?.suggestionExpiresAtS ?? Number.POSITIVE_INFINITY;
        if (event.accepted && state.phase === "update_window_lapsed" && event.position.atS !== null && event.position.atS >= deadline) {
          step.anomaly("accept_after_lapse", "An acceptance was logged after the window closed; the contract should have refused it. The state was left alone.", atS);
          return;
        }
        if (state.creator !== null && state.creator !== event.owner) step.anomaly("responded_by_other_owner", "The response came from an address other than the creator (the market NFT may have moved).", atS);
        if (event.accepted) {
          const suggested = state.review?.suggestedExpiresAtS ?? 0;
          step.patch({
            phase: "active",
            activatedAtS: atS,
            currentMetadataUri: event.uri === "" ? state.currentMetadataUri : event.uri,
            currentExpiresAtS: suggested !== 0 ? suggested : state.currentExpiresAtS,
          });
          step.effect({ kind: "update_accepted", detail: "The update was accepted and the market is active." }, atS);
        } else {
          markTerminal(step, "declined", atS);
          step.effect({ kind: "update_declined", detail: "The update was declined and the market is cancelled. The $1 fee is not refunded." }, atS);
        }
        return;
      }
      step.anomaly("response_out_of_order", "A response log arrived for a market that was not waiting for one; it was ignored.", atS);
      return;
    }
    case "cancelled_by_owner": {
      if (state.phase !== "pending") {
        step.anomaly("cancel_out_of_order", "A cancellation log arrived for a market that was not pending; it was ignored.", atS);
        return;
      }
      markTerminal(step, "cancelled", atS);
      step.effect({ kind: "owner_cancelled", detail: "The creator cancelled the market while it was pending. The $1 fee is not refunded." }, atS);
      return;
    }
    case "metadata_updated": {
      if (state.phase === "rejected" || state.phase === "declined" || state.phase === "cancelled" || state.phase === "closed" || state.phase === "voided") {
        step.anomaly("update_after_terminal", "A metadata update was logged for a market that is closed; it was ignored.", atS);
        return;
      }
      const fetchable = isXoMetadataUri(event.newUri);
      step.patch({
        currentMetadataUri: event.newUri,
        metadataUpdates: cap(state.metadataUpdates, { atS, uri: event.newUri, guard: "unchecked" as GuardState }, MAX_UPDATES),
      });
      step.effect({ kind: "metadata_updated", detail: "XO changed the market's metadata. Run the diff guard on the new file.", uri: event.newUri, fetchable }, atS);
      if (!fetchable) step.anomaly("update_uri_off_bucket", "The new metadata file is not inside one of XO's buckets and will not be fetched automatically.", atS);
      return;
    }
    case "fee_charged": {
      // Informational (a fee event alone never proves a creation: CR8).
      step.note(atS, "fee_charged", "The creation fee was charged.");
      return;
    }
  }
}

function applyGuard(step: Step, event: GuardResultEvent): void {
  const state = step.state;
  const atS = step.now;
  if (state.review !== null && state.review.suggestedUri === event.uri && (state.phase === "update_required" || state.phase === "update_window_lapsed")) {
    step.patch({ guard: event.verdict });
    step.effect({ kind: "guard_recorded", detail: event.verdict === "pass" ? "The diff guard passed on the suggestion." : "The diff guard flagged the suggestion." }, atS);
    return;
  }
  const index = state.metadataUpdates.map((entry) => entry.uri).lastIndexOf(event.uri);
  if (index >= 0) {
    step.patch({ metadataUpdates: state.metadataUpdates.map((entry, position) => (position === index ? { ...entry, guard: event.verdict } : entry)) });
    step.effect({ kind: "guard_recorded", detail: event.verdict === "pass" ? "The diff guard passed on the new metadata." : "The diff guard flagged the new metadata." }, atS);
    return;
  }
  step.anomaly("guard_for_unknown_uri", "A diff guard result was recorded for a file that is not the current suggestion or update; it was ignored.", atS);
}

const STATUS_PHASE: Readonly<Record<ObservedStatus, ReviewPhase | null>> = Object.freeze({
  pending: null,
  update_required: null,
  cancelled: "cancelled",
  active: "active",
  paused: "paused",
  resolved: "resolved",
  closed: "closed",
  voided: "voided",
  voided_closed: "voided",
});

function applyStatus(step: Step, event: StatusObservedEvent): void {
  const state = step.state;
  const atS = event.atS ?? step.now;
  const target = STATUS_PHASE[event.status];
  // Pending and update-required are already the tracker's own states; a read of them proves nothing new.
  if (target === null || target === state.phase) return;
  // A terminal market does not come back.
  if (TERMINAL_PHASES.has(state.phase) && state.phase !== "resolved") {
    step.anomaly("status_after_terminal", "A status read disagrees with a market the tracker already closed; the tracker's state was kept.", atS);
    return;
  }
  const missedEvent = (state.phase === "pending" || state.phase === "update_required" || state.phase === "update_window_lapsed") && target === "active";
  if (missedEvent) step.anomaly("missed_activation_log", "The market is active but its approval log was never seen; the state was moved by a status read.", atS);
  step.patch({ phase: target, ...(target === "active" && state.activatedAtS === null ? { activatedAtS: atS } : {}), ...(TERMINAL_PHASES.has(target) ? { terminalAtS: atS } : {}) });
  step.effect({ kind: "status_changed", detail: `The market's status is now ${event.status}.` }, atS);
}

function lapse(step: Step): void {
  const state = step.state;
  const review = state.review;
  if (state.phase === "update_required" && review !== null && step.now >= review.suggestionExpiresAtS) {
    step.patch({ phase: "update_window_lapsed" });
    step.effect(
      { kind: "update_window_lapsed", detail: "The window to accept XO's changes has closed. The market stays in UPDATE_REQUIRED at no further cost; it can now only be declined or left." },
      review.suggestionExpiresAtS,
    );
  }
}

// Applies one event. Never throws; an event that does not fit the state is recorded as an anomaly and
// changes nothing else.
export function applyEvent(state: ReviewState, event: CreationEvent, nowS: number): Applied {
  const step = new Step(state, nowS);
  try {
    if (typeof event !== "object" || event === null || typeof (event as { kind?: unknown }).kind !== "string") throw new TypeError("not an event");
    switch (event.kind) {
      case "guard_result":
        applyGuard(step, event);
        break;
      case "status_observed":
        applyStatus(step, event);
        break;
      default:
        applyChainEvent(step, event);
    }
    lapse(step);
  } catch {
    // An event that cannot be read is recorded and changes nothing else.
    return { state: new Step(state, nowS).state, effects: [{ kind: "anomaly", detail: "An event could not be read and was ignored.", code: "unreadable_event" }] };
  }
  return { state: step.state, effects: step.effects };
}

// Moves time forward: detects that the suggestion window closed.
export function advanceClock(state: ReviewState, nowS: number): Applied {
  const step = new Step(state, nowS);
  lapse(step);
  return { state: step.state, effects: step.effects };
}

// Applies many events in log order, then the clock. Duplicates are ignored (every chain event carries a key).
export function replayEvents(state: ReviewState, events: readonly CreationEvent[], nowS: number): Applied {
  const chain: ChainEvent[] = [];
  const rest: (GuardResultEvent | StatusObservedEvent)[] = [];
  const effects: ReviewEffect[] = [];
  for (const event of events) {
    if (typeof event !== "object" || event === null) {
      effects.push({ kind: "anomaly", detail: "An event could not be read and was ignored.", code: "unreadable_event" });
    } else if (event.kind === "guard_result" || event.kind === "status_observed") {
      rest.push(event);
    } else if (hasLogPosition(event)) {
      chain.push(event);
    } else {
      effects.push({ kind: "anomaly", detail: "An event could not be read and was ignored.", code: "unreadable_event" });
    }
  }
  chain.sort(compareChainEvents);
  let current = state;
  for (const event of [...chain, ...rest]) {
    const applied = applyEvent(current, event, nowS);
    current = applied.state;
    effects.push(...applied.effects);
  }
  const clock = advanceClock(current, nowS);
  return { state: clock.state, effects: [...effects, ...clock.effects] };
}

// ---- accept advice ---------------------------------------------------------------------------------------

export type AdviceReason = "not_in_update_phase" | "window_lapsed" | "guard_unchecked" | "guard_flagged" | "past_accept_by" | "window_short";

export interface AcceptAdvice {
  readonly phase: ReviewPhase;
  // Would an acceptance still be valid on chain (before suggestionExpiresAt)?
  readonly canAcceptOnChain: boolean;
  // May the tool recommend accepting? Only when the guard passed on this suggestion and there is time.
  readonly recommended: boolean;
  readonly secondsToDeadline: number | null;
  readonly secondsToAcceptBy: number | null;
  readonly reasons: readonly AdviceReason[];
}

export function acceptAdvice(state: ReviewState, nowS: number): AcceptAdvice {
  const review = state.review;
  if (review === null || (state.phase !== "update_required" && state.phase !== "update_window_lapsed")) {
    return { phase: state.phase, canAcceptOnChain: false, recommended: false, secondsToDeadline: null, secondsToAcceptBy: null, reasons: ["not_in_update_phase"] };
  }
  const toDeadline = review.suggestionExpiresAtS - nowS;
  const toAcceptBy = review.suggestionExpiresAtS - ACCEPT_MARGIN_S - nowS;
  const reasons: AdviceReason[] = [];
  const canAcceptOnChain = state.phase === "update_required" && toDeadline > 0;
  if (!canAcceptOnChain) reasons.push("window_lapsed");
  else if (toAcceptBy < 0) reasons.push("past_accept_by");
  if (state.guard === "unchecked") reasons.push("guard_unchecked");
  if (state.guard === "flagged") reasons.push("guard_flagged");
  if (windowKind(review.windowS) === "short") reasons.push("window_short");
  const blocking = reasons.some((reason) => reason === "window_lapsed" || reason === "past_accept_by" || reason === "guard_unchecked" || reason === "guard_flagged");
  return {
    phase: state.phase,
    canAcceptOnChain,
    recommended: canAcceptOnChain && !blocking,
    secondsToDeadline: toDeadline,
    secondsToAcceptBy: toAcceptBy,
    reasons,
  };
}

// ---- polling ---------------------------------------------------------------------------------------------

export type PollReason =
  | "review_fast"
  | "review_slow"
  | "review_overdue"
  | "update_window_open"
  | "update_window_lapsed"
  | "watch_early"
  | "watch_late"
  | "watch_complete"
  | "terminal";

export interface PollPlan {
  readonly action: "poll" | "stop";
  readonly delayS: number | null;
  readonly reason: PollReason;
  // The explorer log queries to run on the next poll.
  readonly queries: readonly LogQuery[];
}

function query(state: ReviewState, topic0: Hex): LogQuery {
  const from = state.createdBlock === null ? undefined : BigInt(state.createdBlock);
  return {
    address: MARKET_MANAGER,
    topic0,
    topic1: state.conditionId,
    ...(from === undefined ? {} : { fromBlock: from }),
    toBlock: "latest",
  };
}

export function nextPoll(state: ReviewState, nowS: number): PollPlan {
  const stop = (reason: PollReason): PollPlan => ({ action: "stop", delayS: null, reason, queries: [] });
  if (TERMINAL_PHASES.has(state.phase)) return stop("terminal");
  const since = nowS - (state.createdAtS ?? state.startedAtS);
  switch (state.phase) {
    case "pending": {
      const queries = [query(state, MARKET_REVIEWED_TOPIC), query(state, MARKET_CANCELLED_BY_OWNER_TOPIC)];
      if (since < REVIEW_POLL.fastUntilS) return { action: "poll", delayS: REVIEW_POLL.fastS, reason: "review_fast", queries };
      if (since < REVIEW_POLL.slowUntilS) return { action: "poll", delayS: REVIEW_POLL.slowS, reason: "review_slow", queries };
      return stop("review_overdue");
    }
    case "update_required": {
      const deadline = state.review?.suggestionExpiresAtS ?? nowS;
      if (nowS >= deadline) return stop("update_window_lapsed");
      return { action: "poll", delayS: REVIEW_POLL.fastS, reason: "update_window_open", queries: [query(state, UPDATE_REQUEST_RESPONDED_TOPIC), query(state, METADATA_UPDATED_TOPIC)] };
    }
    case "update_window_lapsed":
      return stop("update_window_lapsed");
    default: {
      // active, paused: XO may rewrite the metadata.
      const age = nowS - (state.activatedAtS ?? state.startedAtS);
      const queries = [query(state, METADATA_UPDATED_TOPIC)];
      if (age < WATCH_POLL.earlyUntilS) return { action: "poll", delayS: WATCH_POLL.earlyS, reason: "watch_early", queries };
      if (age < WATCH_POLL.lateUntilS) return { action: "poll", delayS: WATCH_POLL.lateS, reason: "watch_late", queries };
      return stop("watch_complete");
    }
  }
}

// ---- the view POST /v1/creation/track returns ---------------------------------------------------------------

const PHASE_STATUS: Readonly<Record<ReviewPhase, CreationStatus>> = Object.freeze({
  pending: "pending",
  update_required: "update_required",
  update_window_lapsed: "update_required",
  active: "active",
  rejected: "rejected",
  declined: "cancelled",
  cancelled: "cancelled",
  paused: "paused",
  resolved: "resolved",
  closed: "closed",
  voided: "voided",
});

export function trackStatusOf(state: ReviewState): CreationStatus {
  return PHASE_STATUS[state.phase];
}

export function trackDecisionOf(state: ReviewState): ReviewDecision {
  return state.review === null ? "none" : state.review.decision;
}

function isoSecond(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface TrackView {
  readonly status: CreationStatus;
  readonly review: { readonly decision: ReviewDecision; readonly reviewed_at: string | null };
  readonly timeline: readonly { readonly at: string; readonly event: string; readonly detail: string }[];
  readonly warnings: readonly string[];
}

// Fixed warnings for the track response; they never contain market or oracle text.
export function trackWarnings(state: ReviewState, nowS: number): string[] {
  const warnings: string[] = [];
  const advice = acceptAdvice(state, nowS);
  if (state.phase === "update_required" && advice.canAcceptOnChain) {
    warnings.push(
      advice.recommended
        ? "XO asked for changes. Accepting is allowed until the window closes; read the new rules first."
        : "XO asked for changes. Do not accept until the diff guard has passed on the suggestion and you have read the new rules.",
    );
    if (advice.reasons.includes("window_short")) warnings.push("The window to answer is short.");
  }
  if (state.phase === "update_window_lapsed") warnings.push("The window to accept has closed. The market stays in UPDATE_REQUIRED; it can only be declined or left.");
  if (state.review?.decision === "reject" && state.review.rejection !== null) {
    warnings.push(`XO rejected the market (${state.review.rejection.replaceAll("_", " ")}). The fee is not refunded.`);
  }
  if (state.metadataUpdates.some((entry) => entry.guard !== "pass")) warnings.push("XO changed the market's metadata after creation and the new file has not passed the diff guard.");
  if (nextPoll(state, nowS).reason === "review_overdue") warnings.push("No review has been seen for over 12 hours. Check the market on XO.");
  if (state.anomalies.length > 0) warnings.push(`The tracker recorded ${state.anomalies.length} unexpected log(s) and ignored them.`);
  return warnings;
}

export function trackViewOf(state: ReviewState, nowS: number): TrackView {
  return {
    status: trackStatusOf(state),
    review: { decision: trackDecisionOf(state), reviewed_at: state.review === null ? null : isoSecond(state.review.reviewedAtS) },
    timeline: state.timeline.map((entry) => ({ at: isoSecond(entry.atS), event: entry.event, detail: entry.detail.slice(0, 200) })),
    warnings: trackWarnings(state, nowS),
  };
}

// ---- the selector latch and the creation pre-flight (O09, CR1, CR2) -----------------------------------------

export type LatchReason = "can_call_false" | "access_unauthorized" | "paused" | "unexpected_revert";

export interface SelectorLatch {
  readonly closed: boolean;
  readonly reason: LatchReason | null;
  readonly sinceS: number | null;
}

export const OPEN_LATCH: SelectorLatch = Object.freeze({ closed: false, reason: null, sinceS: null });

function closeLatch(latch: SelectorLatch, reason: LatchReason, nowS: number): SelectorLatch {
  // Sticky: the first reason and time are kept.
  return latch.closed ? latch : { closed: true, reason, sinceS: nowS };
}

// A reading of AccessManager.canCall(account, manager, createConvictionMarket). `immediate` false means the
// public role no longer reaches the selector (or only after a schedule, which a UserOp cannot do); unreadable
// (null) neither closes nor opens anything.
export function observeCanCall(latch: SelectorLatch, reading: { readonly canCall: boolean | null; readonly delay: number | null }, nowS: number): SelectorLatch {
  if (reading.canCall === false) return closeLatch(latch, "can_call_false", nowS);
  if (reading.canCall === true && reading.delay !== null && reading.delay !== 0) return closeLatch(latch, "can_call_false", nowS);
  return latch;
}

export type FailureClass = "selector_closed" | "paused" | "transport" | "user_fixable" | "unexpected";

// Classifies the text of a failed create: a revert reason, an error name or revert data from a simulation or a
// bundler. Transport trouble (a 401, a timeout) says nothing about the contract and never closes the latch.
// Errors of the account-abstraction layer (AA1x to AA4x: nonce, signature, paymaster) are handled by the
// userop code (UO7 falls back from a refused sponsorship), not by the selector latch.
export function classifyCreationFailure(text: string): FailureClass {
  const lower = text.toLowerCase();
  if (/accessmanagedunauthorized|0x068ca9d8/.test(lower)) return "selector_closed";
  if (/enforcedpause|0xd93c0665|whennotpaused|contract is paused|execution paused/.test(lower)) return "paused";
  if (/\b(?:401|403|429|5\d\d)\b|timeout|timed out|network|econn|fetch failed|rate limit|requires key|cloudflare/.test(lower)) return "transport";
  if (/\baa[1-4]\d\b|insufficient|allowance|balance|invalidparameter|expire|erc20|transfer amount exceeds|nonce|signature/.test(lower)) return "user_fixable";
  return "unexpected";
}

// A create that failed after the pre-flight passed. A closed selector or a pause closes the latch; a revert
// nobody can explain closes it too (XO can change the rules by upgrade), while a revert the user can fix
// (balance, allowance, an expiry in the past) does not.
export function observeCreationFailure(latch: SelectorLatch, text: string, nowS: number): SelectorLatch {
  const kind = classifyCreationFailure(text);
  if (kind === "selector_closed") return closeLatch(latch, "access_unauthorized", nowS);
  if (kind === "paused") return closeLatch(latch, "paused", nowS);
  if (kind === "unexpected") return closeLatch(latch, "unexpected_revert", nowS);
  return latch;
}

// Only an operator reopens a latch, by naming themselves in the call. No automatic reading reopens it.
export function clearSelectorLatch(latch: SelectorLatch, acknowledgement: { readonly operator: true }): SelectorLatch {
  return acknowledgement.operator === true ? OPEN_LATCH : latch;
}

export type PreflightBlocker = "selector_closed" | "can_call_false" | "collateral_not_allowed" | "fee_changed" | "fee_unknown";
export type PreflightWarning = "can_call_unreadable" | "fee_from_last_event" | "collateral_unreadable";

export interface CreationPreflight {
  readonly allowed: boolean;
  readonly blockers: readonly PreflightBlocker[];
  readonly warnings: readonly PreflightWarning[];
  readonly feeAtomic: bigint | null;
  readonly latch: SelectorLatch;
}

export interface CreationPreflightInput {
  readonly latch: SelectorLatch;
  readonly read: Pick<CreationPreflightRead, "canCall" | "delay" | "collateralAllowed" | "creationFee">;
  // The fee of the latest MarketCreationFeeCharged event, for when the config read is unavailable (CR2).
  readonly lastFeeEventAtomic?: bigint | null;
  readonly nowS: number;
}

export function evaluateCreationPreflight(input: CreationPreflightInput): CreationPreflight {
  const blockers: PreflightBlocker[] = [];
  const warnings: PreflightWarning[] = [];
  const latch = observeCanCall(input.latch, input.read, input.nowS);
  if (input.latch.closed) blockers.push("selector_closed");
  else if (latch.closed) blockers.push("can_call_false");
  if (input.read.canCall === null) warnings.push("can_call_unreadable");

  if (input.read.collateralAllowed === false) blockers.push("collateral_not_allowed");
  else if (input.read.collateralAllowed === null) warnings.push("collateral_unreadable");

  let fee: bigint | null = null;
  if (input.read.creationFee !== null) {
    fee = input.read.creationFee;
    if (fee !== CREATION_FEE_ATOMIC) blockers.push("fee_changed");
  } else if (input.lastFeeEventAtomic !== undefined && input.lastFeeEventAtomic !== null) {
    fee = input.lastFeeEventAtomic;
    if (fee !== CREATION_FEE_ATOMIC) blockers.push("fee_changed");
    else warnings.push("fee_from_last_event");
  } else {
    blockers.push("fee_unknown");
  }
  return { allowed: blockers.length === 0, blockers, warnings, feeAtomic: fee, latch };
}

// Fixed sentences for the user and the agent. They contain no market text and no numbers the operator can
// change, so a tool can show them as they are.
export const LATCH_TEXT: Readonly<Record<LatchReason, string>> = Object.freeze({
  can_call_false: "XO's access manager no longer lets the public call market creation. Creation is stopped; do not retry.",
  access_unauthorized: "A creation call was refused as unauthorised by XO's access manager. Creation is stopped; do not retry.",
  paused: "XO has paused market creation. Creation is stopped; do not retry until the operator has checked.",
  unexpected_revert: "A creation call failed in a way this plugin does not recognise. Creation is stopped until the operator has checked.",
});

export function describeLatch(latch: SelectorLatch): string | null {
  return latch.closed && latch.reason !== null ? LATCH_TEXT[latch.reason] : null;
}

export const PREFLIGHT_BLOCKER_TEXT: Readonly<Record<PreflightBlocker, string>> = Object.freeze({
  selector_closed: "Creation was stopped earlier in this session because the creation call was closed or paused.",
  can_call_false: "XO's access manager no longer lets the public call market creation. Creation is stopped; do not retry.",
  collateral_not_allowed: "XO's config no longer allows USDC.e as collateral for a new market.",
  fee_changed: "The creation fee is not the $1.00 this plugin was built for. Nothing was prepared; ask the user before going on.",
  fee_unknown: "The creation fee could not be read, and there is no earlier fee to compare with. Nothing was prepared.",
});
export const PREFLIGHT_WARNING_TEXT: Readonly<Record<PreflightWarning, string>> = Object.freeze({
  can_call_unreadable: "Whether the public may still call creation could not be read. If the call is closed the batch will revert and the fee is not charged.",
  fee_from_last_event: "The fee comes from the latest fee event, not from XO's config, which could not be read.",
  collateral_unreadable: "Whether USDC.e is still allowed as collateral could not be read.",
});

export function describePreflight(result: CreationPreflight): string[] {
  return [...result.blockers.map((code) => PREFLIGHT_BLOCKER_TEXT[code]), ...result.warnings.map((code) => PREFLIGHT_WARNING_TEXT[code])];
}

// ---- intent-hash idempotency (O05, CR8) ---------------------------------------------------------------------

export interface CreationIntent {
  readonly creator: string;
  readonly collateral?: string;
  readonly metadataUri: string;
  // keccak256 of the canonical metadata text (`metadataContentHash`).
  readonly contentHash: string;
  readonly expiresAt: number;
}

// One hash per draft: the same creator, content, URI and expiry give the same hash. `startsAt` is left out
// on purpose: it is chain time at prepare and differs between two tries of the same draft.
// Why an intent cannot be hashed, or null when it can. The hash is only ever taken of a well-formed intent.
export function intentProblem(intent: CreationIntent): string | null {
  try {
    getAddress(intent.creator);
    getAddress(intent.collateral ?? USDC_E_ADDRESS);
  } catch {
    return "the creator or collateral is not an address";
  }
  if (typeof intent.metadataUri !== "string" || intent.metadataUri === "" || intent.metadataUri.length > MAX_URI_CHARS) return "the metadata URI is empty or too long";
  if (typeof intent.contentHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(intent.contentHash)) return "the content hash is not 32 bytes of hex";
  if (!Number.isSafeInteger(intent.expiresAt) || intent.expiresAt <= 0 || intent.expiresAt >= 2 ** 40) return "expiresAt is not a uint40";
  return null;
}

export function intentHash(intent: CreationIntent): Hex {
  const problem = intentProblem(intent);
  if (problem !== null) throw new TypeError(`invalid creation intent: ${problem}`);
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint40" }],
      [
        "xo-create-intent-v1",
        getAddress(intent.creator),
        getAddress(intent.collateral ?? USDC_E_ADDRESS),
        intent.contentHash as Hex,
        keccak256(stringToBytes(intent.metadataUri)),
        intent.expiresAt,
      ],
    ),
  );
}

export type IntentStatus = "prepared" | "sending" | "ambiguous" | "included" | "abandoned";

export interface IntentRecord {
  readonly hash: Hex;
  readonly status: IntentStatus;
  readonly preparedId: string | null;
  // When the prepared item stops being usable (unix seconds).
  readonly preparedExpiresAtS: number | null;
  readonly conditionId: Hex | null;
  readonly txHash: Hex | null;
  readonly createdAtS: number;
  // When the `sending` marker was written; never changed afterwards.
  readonly sentAtS: number | null;
  readonly updatedAtS: number;
}

export function recordPrepared(intent: CreationIntent, preparedId: string, preparedExpiresAtS: number, nowS: number): IntentRecord {
  return { hash: intentHash(intent), status: "prepared", preparedId, preparedExpiresAtS, conditionId: null, txHash: null, createdAtS: nowS, sentAtS: null, updatedAtS: nowS };
}

// The `sending` marker. After it, the record can only become included or ambiguous, never prepared again.
export function markSending(record: IntentRecord, nowS: number): IntentRecord {
  return record.status === "prepared" ? { ...record, status: "sending", sentAtS: nowS, updatedAtS: nowS } : record;
}

// A prepared item that expired without ever being sent can be dropped; nothing else can.
export function abandonPrepared(record: IntentRecord, nowS: number): IntentRecord {
  if (record.status !== "prepared" || record.preparedExpiresAtS === null || nowS < record.preparedExpiresAtS) return record;
  return { ...record, status: "abandoned", updatedAtS: nowS };
}

export type IntentDecision =
  | { readonly action: "proceed" }
  | { readonly action: "invalid"; readonly problem: string }
  | { readonly action: "reuse"; readonly preparedId: string; readonly existing: IntentRecord }
  | {
      readonly action: "refuse";
      readonly reason: "already_on_chain" | "in_flight" | "ambiguous" | "already_included" | "stale_prepared";
      readonly existing: IntentRecord | null;
      readonly conditionId: Hex | null;
    };

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// Whether this draft may be prepared. A creation is not idempotent, so: a creation log by the same creator
// with the same URI means it exists; a record in flight, ambiguous or included refuses; a still-usable
// prepared item is handed back instead of making a second one. Only an abandoned record is ignored.
export function checkIntent(records: readonly IntentRecord[], intent: CreationIntent, creatorLogs: readonly CreatedEvent[], nowS: number): IntentDecision {
  const problem = intentProblem(intent);
  if (problem !== null) return { action: "invalid", problem };
  const onChain = creatorLogs.find((event) => sameAddress(event.creator, intent.creator) && event.metadataUri === intent.metadataUri && event.marketType === MARKET_TYPE_CLOB_CONVICTION);
  if (onChain !== undefined) return { action: "refuse", reason: "already_on_chain", existing: null, conditionId: onChain.conditionId };
  const hash = intentHash(intent);
  const live = records.filter((record) => record.hash === hash && record.status !== "abandoned");
  for (const record of live) {
    if (record.status === "included") return { action: "refuse", reason: "already_included", existing: record, conditionId: record.conditionId };
    if (record.status === "ambiguous") return { action: "refuse", reason: "ambiguous", existing: record, conditionId: record.conditionId };
    if (record.status === "sending") return { action: "refuse", reason: "in_flight", existing: record, conditionId: null };
  }
  const prepared = live.find((record) => record.status === "prepared");
  if (prepared !== undefined) {
    if (prepared.preparedId !== null && prepared.preparedExpiresAtS !== null && nowS < prepared.preparedExpiresAtS) {
      return { action: "reuse", preparedId: prepared.preparedId, existing: prepared };
    }
    // An expired prepared item that was never sent: the relay has to abandon it first (`abandonPrepared`).
    return { action: "refuse", reason: "stale_prepared", existing: prepared, conditionId: null };
  }
  return { action: "proceed" };
}

export const INTENT_REFUSAL_TEXT: Readonly<Record<"already_on_chain" | "in_flight" | "ambiguous" | "already_included" | "stale_prepared", string>> = Object.freeze({
  already_on_chain: "This market already exists on chain: the creator's own logs show it. Nothing was prepared; track it instead.",
  in_flight: "This exact draft has already been sent and is waiting to be included. Nothing was prepared; wait and track it.",
  ambiguous: "This exact draft was sent and the answer was lost. It is being looked up in the logs and is never sent a second time. Change the draft if you want a different market.",
  already_included: "This exact draft is already on chain. Track it instead of creating it again.",
  stale_prepared: "An earlier prepared copy of this draft has expired and has not been released yet. Try again in a moment.",
});

export function describeIntentDecision(decision: IntentDecision): string | null {
  if (decision.action === "refuse") return INTENT_REFUSAL_TEXT[decision.reason];
  if (decision.action === "invalid") return "The creation request is not well formed, so nothing was prepared.";
  if (decision.action === "reuse") return "This exact draft was already prepared and is still valid; the same prepared item is returned.";
  return null;
}

export interface Reconciled {
  readonly record: IntentRecord;
  readonly outcome: "included" | "not_found_yet" | "unchanged";
  readonly matched: CreatedEvent | null;
}

// Settles a record from the creator's CLOBMarketCreated logs. A match becomes `included`. No match leaves a
// `sending` or `ambiguous` record `ambiguous`: it is never reported as "did not happen" and never resent.
export function reconcileIntent(record: IntentRecord, intent: CreationIntent, creatorLogs: readonly CreatedEvent[], nowS: number): Reconciled {
  if (record.status === "abandoned" || record.status === "included") return { record, outcome: "unchanged", matched: null };
  const matched = creatorLogs.find((event) => sameAddress(event.creator, intent.creator) && event.metadataUri === intent.metadataUri && event.marketType === MARKET_TYPE_CLOB_CONVICTION) ?? null;
  if (matched !== null) {
    return {
      record: { ...record, status: "included", conditionId: matched.conditionId, txHash: matched.position.txHash, updatedAtS: nowS },
      outcome: "included",
      matched,
    };
  }
  if (record.status === "sending" || record.status === "ambiguous") {
    return { record: { ...record, status: "ambiguous", updatedAtS: nowS }, outcome: "not_found_yet", matched: null };
  }
  return { record, outcome: "unchanged", matched: null };
}

// Whether an ambiguous record has been looked for long enough that the relay may tell the user it did not
// land (still never auto-resent: a new attempt needs a new approval and a changed draft).
export function ambiguityOutlived(record: IntentRecord, nowS: number): boolean {
  return record.status === "ambiguous" && record.sentAtS !== null && nowS - record.sentAtS >= RECONCILE_GRACE_S;
}

// Topic queries for the creator's own creations (topic2 = creator), for reconciliation.
export function creatorCreationsQuery(creator: string, fromBlock?: bigint): LogQuery {
  const padded = `0x${"0".repeat(24)}${getAddress(creator).slice(2).toLowerCase()}` as Hex;
  return { address: MARKET_MANAGER, topic0: CLOB_MARKET_CREATED_TOPIC, topic2: padded, ...(fromBlock === undefined ? {} : { fromBlock }), toBlock: "latest" };
}
