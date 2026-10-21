// The Signature Card's checks, as pure functions (dapp-design 5.3, acceptance M4-1, M4-2, M4-5).
//
// The card compares what a person is about to approve with a rendering produced by deterministic code from
// structured data. It never reads text the page was given by anyone but the daemon's inbox record, and it never
// asks a model. Everything here is derived from the relay's own Prepared item:
//   1. the item must satisfy the relay's contract for its route (this includes: the intent hashes to
//      expected_digest, digest_tag is its first 16 hex digits, the inner tag is the tag of the typed data's
//      inner hash);
//   2. the XO account must be the one derived from the owner, with the repo's derivation code;
//   3. the digest, both tags, the order terms and every summary line are REBUILT from the decoded block
//      (verifyPrepared + rebuildDecoded, the same code the relay uses). That catches an item that was changed
//      on the way; it does not catch a bug the relay and this page share, and it says nothing about a hostile
//      agent. Without a decoded block the card is a viewer: it says so and never claims verification;
//   4. freshness: Sign and Copy are disabled when too little time is left.
//
// No function here sends anything. The page holds no submit power (the agent submits, with the signature).

import { inboxPreparedSchema, type InboxState, type Posture } from "@bridge/contract";
import {
  DECODED_CHAIN_ID,
  MAX_ORDER_TTL_S,
  POST_ROUTES,
  PREPARED_TTL_S,
  checkPreparedSign,
  digestTag,
  preparedSignSchema,
  toPayboxIntent,
  verifyPrepared,
  type Prepared,
  type PreparedDecoded,
  type PayboxSignIntent,
  type VerifyPreparedResult,
} from "@shared/relay/contract";
import { deriveAccount } from "@shared/xo/account/derive";
import { rebuildDecoded } from "@shared/xo/signing/rebuild";

import type { CapabilityId } from "../../core/capabilities";
import { parseIsoMs } from "../../core/format";

export type CheckId = "contract" | "intent" | "tag" | "account" | "rebuild" | "lifetime" | "time" | "credential";
export type CheckStatus = "pass" | "fail" | "unavailable" | "unchecked";

export interface CardCheck {
  readonly id: CheckId;
  // Fixed app words.
  readonly label: string;
  readonly status: CheckStatus;
  // Fixed app words; never relay text.
  readonly detail: string;
}

// The same three words the daemon's decision route takes (bridge/contract.ts CARD_VERIFICATIONS).
export type Verification = "verified" | "viewer_only" | "failed";

// A prepared item as the card renders it. `quote` and `user_op_hash` exist on some routes only.
export type CardPrepared = Prepared & { readonly quote?: { readonly venue?: string; readonly price: string; readonly shares: string; readonly max_outlay_usd: string; readonly fee_bound_bps: number; readonly expires_at: string | null }; readonly user_op_hash?: string };

export type FreshnessState = "fresh" | "short" | "expired";

// Seconds that must be left before Sign and Copy are enabled. The order and login figures are the design's
// (dapp-design 5.3 step 4). A user operation lives 300 s; 60 s is a design default (D) so an approval in the
// PayBox app, which needs a human, can still finish.
export const MIN_SECONDS_LEFT: Readonly<Record<string, number>> = Object.freeze({ order: 90, auth: 30, userop: 60, create: 60, clob_order: 90, clob_auth: 30 });

export interface Freshness {
  readonly state: FreshnessState;
  readonly msLeft: number;
  readonly minMs: number;
  readonly expiresAtMs: number | null;
}

export interface Mismatch {
  readonly status: "not_derivable" | "mismatch";
  // A path inside the item, sanitised to path characters.
  readonly field: string;
  readonly expected: string | null;
  readonly actual: string | null;
}

export interface CardEvaluation {
  readonly verification: Verification;
  readonly checks: readonly CardCheck[];
  // Short fixed-word labels of the checks that failed, for the daemon's audit record (at most 16, 120 chars).
  readonly failedChecks: readonly string[];
  // The parsed item, or null when it does not satisfy the contract (nothing from it is then rendered).
  readonly item: CardPrepared | null;
  readonly decoded: PreparedDecoded | null;
  readonly mismatch: Mismatch | null;
  readonly covered: readonly string[];
  readonly unbound: readonly string[];
  readonly digestTag: string | null;
  readonly innerTag: string | null;
  readonly innerKind: "call_data" | "typed_data_hash" | null;
  readonly digestForm: string | null;
  readonly chainId: number;
  readonly freshness: Freshness;
  // The exact intent for request_wallet_sign, re-derived and re-checked here. null when it cannot be shown.
  readonly intent: PayboxSignIntent | null;
  readonly intentJson: string | null;
}

function schemaFor(input: unknown) {
  if (typeof input === "object" && input !== null) {
    if ("user_op_hash" in input) return POST_ROUTES["/v1/userop/prepare"].response;
    if ("quote" in input) return (input as { readonly kind?: unknown }).kind === "clob_order" ? POST_ROUTES["/v1/clob/order/prepare"].response : POST_ROUTES["/v1/order/prepare"].response;
  }
  return inboxPreparedSchema;
}

const FIELD_CHARS = /[^A-Za-z0-9_.[\]-]/g;
function cleanField(value: string): string {
  const cleaned = value.replace(FIELD_CHARS, "?");
  return cleaned.length > 80 ? `${cleaned.slice(0, 80)}...` : cleaned;
}

function clipValue(value: string | undefined): string | null {
  return value === undefined ? null : value.length > 300 ? `${value.slice(0, 300)}...` : value;
}

function freshnessOf(item: CardPrepared | null, kindHint: string | null, nowMs: number, itemState: InboxState): Freshness {
  const minMs = (MIN_SECONDS_LEFT[kindHint ?? ""] ?? 90) * 1000;
  const candidates: number[] = [];
  if (item !== null) {
    const own = parseIsoMs(item.expires_at);
    // An unreadable time cannot be shown as fresh.
    if (own === null) return { state: "expired", msLeft: 0, minMs, expiresAtMs: null };
    candidates.push(own);
    // A venue order's quote carries no expiry when nothing is signed to expire (expires_at null): the item's own
    // life bounds it then.
    if (item.quote !== undefined && item.quote.expires_at !== null) {
      const quote = parseIsoMs(item.quote.expires_at);
      if (quote === null) return { state: "expired", msLeft: 0, minMs, expiresAtMs: null };
      candidates.push(quote);
    }
    // The signed expiration (rebuilt from the order itself) bounds the time left whatever the relay's claims say.
    if (item.decoded?.kind === "order") {
      const signed = parseIsoMs(item.decoded.terms.expires_at);
      if (signed === null) return { state: "expired", msLeft: 0, minMs, expiresAtMs: null };
      candidates.push(signed);
    }
    if (item.decoded?.kind === "clob_order" && item.decoded.terms.expires_at !== null) {
      const wire = parseIsoMs(item.decoded.terms.expires_at);
      if (wire === null) return { state: "expired", msLeft: 0, minMs, expiresAtMs: null };
      candidates.push(wire);
    }
  }
  if (candidates.length === 0) return { state: "expired", msLeft: 0, minMs, expiresAtMs: null };
  const expiresAtMs = Math.min(...candidates);
  const msLeft = expiresAtMs - nowMs;
  if (itemState === "expired" || msLeft <= 0) return { state: "expired", msLeft: Math.max(0, msLeft), minMs, expiresAtMs };
  return { state: msLeft < minMs ? "short" : "fresh", msLeft, minMs, expiresAtMs };
}

// The route-specific fields must be present for the kind that needs them. schemaFor() picks a schema by the
// field it finds, so an item that simply leaves a key out would otherwise fall back to the generic schema and skip
// the quote and caps cross-checks. Returns a fixed-word reason, or null.
export function routeShapeProblem(item: CardPrepared): string | null {
  const hasQuote = item.quote !== undefined;
  const hasOpHash = item.user_op_hash !== undefined;
  if ((item.kind === "order" || item.kind === "clob_order") && !hasQuote) return "An order must carry its quote; this one does not.";
  if (item.kind !== "order" && item.kind !== "clob_order" && hasQuote) return "Only an order carries a quote; this item has one.";
  if ((item.kind === "userop" || item.kind === "create") && !hasOpHash) return "A user operation must carry its user-operation hash; this one does not.";
  if ((item.kind === "order" || item.kind === "auth" || item.kind === "clob_order" || item.kind === "clob_auth") && hasOpHash) return "Only a user operation carries a user-operation hash; this item has one.";
  const action = item.decoded !== undefined && "action" in item.decoded ? item.decoded.action : null;
  if (item.kind === "create" && action !== null && NOT_CREATE_ACTIONS.includes(action)) return "The item is labelled a market creation but its decoded action is another one.";
  if (item.kind === "userop" && action === "create_market") return "The item is labelled a plain operation but its decoded action creates a market.";
  return null;
}
const NOT_CREATE_ACTIONS: readonly string[] = ["deploy_enable_trading", "enable_trading", "revoke_trading", "redeem", "withdraw"];

// Allowed clock difference between the daemon, the relay and this page.
const SKEW_MS = 30_000;

// The signed window must be plausible against the clock and against the item's own claims. The order's signed
// expiration is a bearer lifetime (a cancel does not invalidate it), the login timestamp is what XO checks, and a
// user operation's validity is the relay's own claim (the userOpHash has no deadline in it), so each is bounded here.
// Returns a fixed-word reason, or null. `decoded` is trusted only as far as the rebuild check passes; a failed
// rebuild fails the card on its own.
export function lifetimeProblem(item: CardPrepared, nowMs: number): string | null {
  const decoded = item.decoded;
  const own = parseIsoMs(item.expires_at);
  if (decoded === undefined || own === null) return null;
  if (decoded.kind === "order") {
    const signedMs = parseIsoMs(decoded.terms.expires_at);
    if (signedMs === null) return "The order's signed expiration cannot be read.";
    const left = signedMs - nowMs;
    if (left > MAX_ORDER_TTL_S * 1000 + SKEW_MS) return "The order stays valid for longer than any order may. A signed order is a bearer instrument that a cancel does not undo.";
    if (left > decoded.params.ttl_s * 1000 + SKEW_MS) return "The order's signed expiration is later than the lifetime the item states.";
    return null;
  }
  if (decoded.kind === "auth" || decoded.kind === "clob_auth") {
    const stamp = Number(decoded.clob_auth.timestamp) * 1000;
    if (stamp > nowMs + SKEW_MS) return "The login is dated in the future.";
    if (own > stamp + decoded.ttl_s * 1000 + SKEW_MS) return "The login stays open longer than its own timestamp allows. The venue accepts a login for about two minutes.";
    return null;
  }
  if (decoded.kind === "clob_order") {
    // No signed expiry on Limitless, and none on a Polymarket GTC, FOK or FAK: the item's own life bounds it. A
    // Polymarket GTD expiry is a wire field; it still must not outrun the stated lifetime.
    const signedMs = decoded.terms.expires_at === null ? null : parseIsoMs(decoded.terms.expires_at);
    if (decoded.terms.expires_at !== null && signedMs === null) return "The order's expiry cannot be read.";
    if (signedMs !== null && decoded.params.ttl_s !== null && signedMs - nowMs > decoded.params.ttl_s * 1000 + SKEW_MS) return "The order's expiry is later than the lifetime the item states.";
    if (own - nowMs > PREPARED_TTL_S * 1000 + SKEW_MS) return "The item says it stays valid longer than a prepared item does here.";
    return null;
  }
  if (own - nowMs > PREPARED_TTL_S * 1000 + SKEW_MS) return "The item says it stays valid longer than a user operation does here.";
  return null;
}

function derivedAccountMatches(owner: string, account: string): boolean {
  try {
    return deriveAccount(owner as Parameters<typeof deriveAccount>[0]).toLowerCase() === account.toLowerCase();
  } catch {
    return false;
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export interface EvaluateContext {
  readonly nowMs: number;
  // The inbox record's state: an item the daemon already marked expired is expired whatever the clock says.
  readonly state: InboxState;
}

export function evaluateCard(prepared: unknown, context: EvaluateContext): CardEvaluation {
  const checks: CardCheck[] = [];
  const failed: string[] = [];
  const add = (check: CardCheck, failLabel?: string): void => {
    checks.push(check);
    if (check.status === "fail") failed.push((failLabel ?? check.label).slice(0, 120));
  };

  // 1. the contract
  const parsed = schemaFor(prepared).safeParse(prepared);
  const parsedItem = parsed.success ? (parsed.data as CardPrepared) : null;
  const shapeProblem = parsedItem === null ? null : routeShapeProblem(parsedItem);
  // An item that leaves out a route-specific field is not given the benefit of the generic schema: it is unreadable.
  const item = shapeProblem === null ? parsedItem : null;
  if (shapeProblem !== null) {
    add({ id: "contract", label: "The item satisfies the relay's contract", status: "fail", detail: `${shapeProblem} Nothing from it is shown.` }, "contract: route fields");
  } else if (item !== null) {
    add({ id: "contract", label: "The item satisfies the relay's contract", status: "pass", detail: "Every field has the shape the relay promises, and the intent, digest and tags agree with each other." });
  } else {
    const issue = parsed.error?.issues[0];
    const where = issue === undefined ? "item" : cleanField(issue.path.map(String).join(".") || "item");
    add({ id: "contract", label: "The item satisfies the relay's contract", status: "fail", detail: `The item does not match the contract at ${where}. Nothing from it is shown.` }, `contract: ${where}`);
  }

  // 2. the intent and the tag, checked on their own so a failure can name which
  const record = plainRecord(prepared);
  const signParsed = preparedSignSchema.safeParse(record?.["sign"]);
  const intentCheck = signParsed.success ? checkPreparedSign(signParsed.data) : null;
  if (intentCheck === null) {
    add({ id: "intent", label: "The intent hashes to the digest to be signed", status: "fail", detail: "The sign block is not in the contract's shape, so it cannot be hashed. It is withheld." }, "intent: sign block malformed");
  } else if (intentCheck.ok) {
    add({ id: "intent", label: "The intent hashes to the digest to be signed", status: "pass", detail: "The intent shown below hashes, under its own rules, to expected_digest." });
  } else {
    add({ id: "intent", label: "The intent hashes to the digest to be signed", status: "fail", detail: "The intent does not hash to expected_digest. It is withheld." }, "intent: does not hash to the digest");
  }
  const summaryRecord = plainRecord(record?.["summary"]);
  const claimedTag = typeof summaryRecord?.["digest_tag"] === "string" ? summaryRecord["digest_tag"] : null;
  if (signParsed.success && claimedTag !== null) {
    const real = digestTag(signParsed.data.expected_digest);
    if (real === claimedTag) add({ id: "tag", label: "The digest tag is the start of the digest", status: "pass", detail: "The 16-digit tag is the first 16 hex digits of the digest." });
    else add({ id: "tag", label: "The digest tag is the start of the digest", status: "fail", detail: "The tag the relay printed is not the start of the digest it will check the signature against." }, "tag: differs from the digest");
  } else {
    add({ id: "tag", label: "The digest tag is the start of the digest", status: "fail", detail: "There is no readable tag or digest to compare." }, "tag: unreadable");
  }

  // 3. the account. On XO it is the Kernel account derived from the owner; on a CLOB venue (Polymarket, Limitless) the
  // maker is the owner wallet itself, so the item's account must BE the owner.
  if (item !== null && (item.kind === "clob_order" || item.kind === "clob_auth")) {
    if (item.account.toLowerCase() === item.owner.toLowerCase()) {
      add({ id: "account", label: "The maker is the owner wallet itself", status: "pass", detail: "On this venue there is no derived account: the item's account equals its owner, the wallet that signs." });
    } else {
      add({ id: "account", label: "The maker is the owner wallet itself", status: "fail", detail: "The account in the item is not the owner wallet. Do not sign." }, "account: not the owner");
    }
  } else if (item !== null) {
    if (derivedAccountMatches(item.owner, item.account)) {
      add({ id: "account", label: "The account is derived from the owner", status: "pass", detail: "Derived here from the owner address with the repo's own code; it equals the item's account." });
    } else {
      add({ id: "account", label: "The account is derived from the owner", status: "fail", detail: "The account in the item is not the one derived from its owner. Do not sign." }, "account: not derived from the owner");
    }
  } else {
    add({ id: "account", label: "The account is derived from the owner", status: "unavailable", detail: "The item is not readable, so there is nothing to derive from." });
  }

  // 4. the rebuild
  let verdict: VerifyPreparedResult | null = null;
  if (item !== null) {
    try {
      verdict = verifyPrepared(prepared, rebuildDecoded);
    } catch {
      // The rebuild code threw on something it did not expect: that is a failure, not a pass.
      verdict = { ok: false, status: "mismatch", field: "decoded", reason: "the rebuild could not run" };
    }
  }
  let mismatch: Mismatch | null = null;
  let covered: readonly string[] = [];
  let unbound: readonly string[] = [];
  if (verdict === null) {
    add({ id: "rebuild", label: "Digest, tags and summary rebuilt from the decoded fields", status: "unavailable", detail: "The item is not readable, so nothing was rebuilt." });
  } else if (verdict.ok) {
    covered = verdict.covered;
    unbound = verdict.unbound;
    add({ id: "rebuild", label: "Digest, tags and summary rebuilt from the decoded fields", status: "pass", detail: "The digest, both tags and every summary line were rebuilt here from the decoded block and match." });
  } else if (verdict.status === "not_derivable") {
    mismatch = { status: "not_derivable", field: "decoded", expected: null, actual: null };
    add({ id: "rebuild", label: "Digest, tags and summary rebuilt from the decoded fields", status: "unavailable", detail: "The relay sent no decoded block, so the digest is not independently derivable here. This card is a viewer of the relay's summary, not a verifier." });
  } else {
    const field = cleanField(verdict.field);
    mismatch = { status: "mismatch", field, expected: clipValue(verdict.expected), actual: clipValue(verdict.actual) };
    add({ id: "rebuild", label: "Digest, tags and summary rebuilt from the decoded fields", status: "fail", detail: `What the relay sent differs from what the decoded block produces, first at ${field}.` }, `rebuild: ${field}`);
  }

  // 5. time. First the plausibility of the signed window, then how much of it is left.
  const lifetime = item === null ? null : lifetimeProblem(item, context.nowMs);
  if (item === null) {
    add({ id: "lifetime", label: "The validity window is plausible", status: "unavailable", detail: "The item is not readable, so its window cannot be checked." });
  } else if (lifetime !== null) {
    add({ id: "lifetime", label: "The validity window is plausible", status: "fail", detail: `${lifetime} Do not sign.` }, "lifetime: implausible window");
  } else {
    add({ id: "lifetime", label: "The validity window is plausible", status: "pass", detail: "The signed window is no longer than this kind of approval is allowed to be, and agrees with the lifetime the item states." });
  }
  const kindHint = item?.kind ?? (typeof record?.["kind"] === "string" ? record["kind"] : null);
  const freshness = freshnessOf(item, kindHint, context.nowMs, context.state);
  add({
    id: "time",
    label: "Enough time is left",
    status: freshness.state === "fresh" ? "pass" : "fail",
    detail:
      freshness.state === "fresh"
        ? "The item has more time left than this kind of approval needs."
        : freshness.state === "short"
          ? "Too little time is left to approve this in the PayBox app. Ask the agent for a new one."
          : "This item has expired. A new one must be prepared.",
  }, freshness.state === "short" ? "time: too little left" : "time: expired");
  // The credential check belongs to path S2, which is not connected in this build.
  add({ id: "credential", label: "The owner is the PayBox credential's address", status: "unchecked", detail: "Unchecked: no PayBox credential is connected to this page. Compare the address PayBox shows with the owner above." });

  const decoded = item?.decoded ?? null;
  const contractOk = checks.find((check) => check.id === "contract")?.status === "pass";
  const anyFailed = checks.some((check) => check.status === "fail" && check.id !== "time");
  const rebuildCheck = checks.find((check) => check.id === "rebuild");
  let verification: Verification;
  if (anyFailed || !contractOk) verification = "failed";
  else if (rebuildCheck?.status === "pass") verification = "verified";
  else verification = "viewer_only";

  // The intent is shown only when it hashes to its digest, the item is readable and no check failed: a failed
  // card must not print a signable payload under an instruction to use it.
  let intent: PayboxSignIntent | null = null;
  if (item !== null && verification !== "failed" && intentCheck?.ok === true && signParsed.success) {
    try {
      intent = toPayboxIntent(signParsed.data);
    } catch {
      intent = null;
    }
  }

  return {
    verification,
    checks,
    failedChecks: failed.slice(0, 16),
    item,
    decoded,
    mismatch,
    covered,
    unbound,
    digestTag: item?.summary.digest_tag ?? null,
    innerTag: item?.summary.inner_hash_tag ?? null,
    innerKind: item?.summary.inner_hash_kind ?? null,
    digestForm: item?.sign.digest_form ?? null,
    // The chain the signature is bound to: XO's unless the decoded block names a venue chain (137, 8453).
    chainId: decoded !== null && (decoded.kind === "clob_order" || decoded.kind === "clob_auth") ? decoded.chain_id : DECODED_CHAIN_ID,
    freshness,
    intent,
    intentJson: intent === null ? null : JSON.stringify(intent, null, 2),
  };
}

// ---- what the buttons may do ---------------------------------------------------------------------------------------

// Path S2 (the daemon signs through its own PayBox client) is built flag-OFF and not wired to this page. Nothing sets
// this to true: the Sign button stays disabled, and the gate below says why. Turning it on needs the daemon's
// signer route, the live tests DT1 and DT3, and an operator-recorded fact.
export const S2_ENABLED_IN_THIS_BUILD = false;

// The relay lists capabilities under its own keys. Only these map to a fact recorded on this machine; anything
// else, and every key whose fact is not "yes", is shown as unproven.
export const RELAY_CAPABILITY_FACT: Readonly<Record<string, CapabilityId>> = Object.freeze({
  T1: "door_a_bundler_admits_first_userop",
  T3a: "door_d_orderbook_credits_usdce",
  T3b: "first_order_accepted_and_cancelled",
  T4: "withdraw_exit_proven",
  T5: "redeem_proven",
  T8: "capped_allowance_and_revoke_proven",
});

export type ApprovalMode = "always_approve" | "autonomous" | "iframe" | "unknown";

export const GATE_REASONS = [
  "verification_failed",
  "viewer_only",
  "expired",
  "too_little_time",
  "no_intent",
  "item_state",
  "not_armed",
  "kill",
  "read_only_instance",
  "s2_off",
  "approval_mode",
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

export const GATE_REASON_TEXT: Readonly<Record<GateReason, string>> = Object.freeze({
  verification_failed: "A check failed, so this item is not handed to a signer.",
  viewer_only: "The digest could not be rebuilt here (no decoded block), so only the signer path that does not need verification may be used.",
  expired: "The item has expired.",
  too_little_time: "Too little time is left to approve it.",
  no_intent: "There is no intent that hashes to the digest.",
  item_state: "The daemon no longer lists this item as open (it was rejected, signed, submitted or has ended).",
  not_armed: "No ARM window is open. Submitting needs one, and the daemon says when.",
  kill: "The kill switch is on.",
  read_only_instance: "This daemon instance serves reads only.",
  s2_off: "Signing from this page (path S2) is off in this build: it is switched off until the live tests that prove it are recorded.",
  approval_mode: "S2 needs a dedicated PayBox credential in approve-each-time mode. This page does not know the credential's mode.",
});

export interface GateResult {
  readonly enabled: boolean;
  readonly reasons: readonly GateReason[];
}

const OPEN_STATES: readonly InboxState[] = ["prepared", "shown"];

function commonReasons(evaluation: CardEvaluation, itemState: InboxState): GateReason[] {
  const reasons: GateReason[] = [];
  if (evaluation.verification === "failed") reasons.push("verification_failed");
  if (evaluation.freshness.state === "expired") reasons.push("expired");
  else if (evaluation.freshness.state === "short") reasons.push("too_little_time");
  if (evaluation.intent === null) reasons.push("no_intent");
  if (!OPEN_STATES.includes(itemState)) reasons.push("item_state");
  return reasons;
}

// Copy intent (path S1: the user's own agent asks PayBox to sign). A viewer-only card may be copied: the item
// passed every check that could run, and the card says plainly that the rebuild did not.
export function copyGate(evaluation: CardEvaluation, itemState: InboxState): GateResult {
  const reasons = commonReasons(evaluation, itemState);
  return { enabled: reasons.length === 0, reasons };
}

export interface SignGateInput {
  readonly evaluation: CardEvaluation;
  readonly itemState: InboxState;
  readonly posture: Posture | null;
  readonly kill: boolean;
  readonly instance: "writer" | "read_only" | null;
  // The S2 flag. Off in this build; nothing sets it.
  readonly s2Enabled: boolean;
  readonly approvalMode: ApprovalMode;
}

// Sign with PayBox (path S2): every step must have passed, the window must be open, the S2 flag on and the
// credential in approve-each-time mode (dapp-design 5.3 "Buttons"). A viewer-only card is not enough here.
export function signGate(input: SignGateInput): GateResult {
  const reasons = commonReasons(input.evaluation, input.itemState);
  if (input.evaluation.verification === "viewer_only") reasons.push("viewer_only");
  if (input.kill) reasons.push("kill");
  if (input.instance === "read_only") reasons.push("read_only_instance");
  if (input.posture !== "ARMED") reasons.push("not_armed");
  if (!input.s2Enabled) reasons.push("s2_off");
  if (input.approvalMode !== "always_approve") reasons.push("approval_mode");
  return { enabled: reasons.length === 0, reasons };
}
