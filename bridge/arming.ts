import { createHash } from "node:crypto";

import { FLAG_NAMES, parseFlags, type FlagEnv } from "../src/relay/flags.js";
import { constantTimeEqual, type Principal } from "./auth.js";
import {
  ARM_CODE_PATTERN,
  ARM_CODE_TTL_S,
  ARM_MAX_MINUTES,
  armConfirmRequestSchema,
  armConfirmResponseSchema,
  armRequestSchema,
  armResponseSchema,
  disarmResponseSchema,
  emptyRequestSchema,
  EVENTS_PATH,
  type Posture,
  type TokenScope,
} from "./contract.js";
import { eventBusOf } from "./events.js";
import { killControllerOf } from "./kill.js";
import { defineRoute, fail, json, type BridgeModule, type DaemonHost, type RouteResult } from "./server.js";

// The ARM window (docs/dapp-design.md 5.4 "Tokens", 7.2 M4-3). Scopes are ceilings; `submit` from any token also
// needs this window to be open. The window is not a token and not a flag: it is daemon state that only a human at
// the keyboard can open.
//
//   POST /ui/arm {minutes <= 10}   the daemon prints an 8-character code on STDERR and answers only that a code
//                                  was printed. A page cannot read stderr, so a compromised page cannot arm.
//   POST /ui/arm/confirm {code}    the user types the code into the page. Right code in time: the window opens
//                                  for the requested minutes. 5 wrong tries burn the code. The code is single
//                                  use and is kept only as a SHA-256 digest.
//   POST /ui/disarm                closes the window (and drops a pending code).
//
// The window CLOSES on: expiry, disarm, the kill, a tripwire (`trip()`), a flag turned off, and the page's event
// stream going away (an SSE disconnect). Closing is one-way: reopening takes a new code.
//
// THE PAGE'S STREAM. Only a stream opened with a `ui` token counts (events.ts tags each stream). An agent token can
// open /ui/events too, and a prompt-injected agent must not be able to hold the window open after the user closed
// the tab (review finding DS-2). When the daemon serves the event feed, a window needs a page stream open when the
// code is requested and again when it is confirmed, and it closes when the last page stream ends (the events bus
// calls `streamClosed`; `isArmed()` checks it too). A daemon with no event feed (tests, an API-only build) has no
// page stream to tie the window to, so the rule does not apply there.
//
// "Arming does nothing if every ENABLE_* flag is off": the request is refused with `flag_off`, so a window never
// opens over write paths that are all switched off. "On" means the relay's EFFECTIVE flag (a flag the environment
// asks for but the relay holds back because its live-test result is not recorded does not count, DS-3); see
// `attachEffectiveFlags`.
//
// STATE IS CHECKED, NOT TIMED. Expiry is decided against the injected clock on every check (so a test can move
// time); a real timer only makes the closing visible promptly (ui.disarm audit, listeners such as the event feed).
//
// ALSO HERE: the once-only ledger for submits (`SubmitLedger`, M4-3 groundwork). Two submits of one prepared id
// send once: the second is refused with `prepared_used` and is never forwarded.

export const ARM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MAX_ARM_ATTEMPTS = 5;
const NO_PAGE_STREAM_TEXT = "The ARM window is tied to the Cockpit page's live event feed. Open the Terminal screen so the feed is running, then ask again.";
export const SUBMIT_LEDGER_MAX = 1_000;
export const SUBMIT_LEDGER_TTL_MS = 2 * 60 * 60 * 1000;

const WRITE_FLAGS = FLAG_NAMES.filter((name) => name !== "KILL");

// ---- which write flags are really on ------------------------------------------------------------------------

export type EffectiveFlagView = () => Readonly<Record<string, boolean>> | undefined;

const flagViews = new WeakMap<object, EffectiveFlagView>();

// Connects the window (and the S2 signer) to the relay's effective flags: the environment's ENABLE_* request AND
// the capability fact or RELAY_ARM that lets the relay act on it. bridge/main.ts calls this once after the daemon
// starts. A view that answers undefined (no relay, or one that cannot answer) means every flag is off: an unknown
// fails closed. Without an attached view (a daemon with no relay, as in unit tests) the raw environment is read.
export function attachEffectiveFlags(host: object, view: EffectiveFlagView): void {
  flagViews.set(host, view);
}

export function writeFlagsOf(host: { readonly env: FlagEnv }): Readonly<Record<string, boolean>> {
  const view = flagViews.get(host);
  if (view === undefined) return parseFlags(host.env).flags;
  let flags: Readonly<Record<string, boolean>> | undefined;
  try {
    flags = view();
  } catch {
    flags = undefined;
  }
  return flags ?? {};
}

export type DisarmReason = "user" | "expired" | "kill" | "tripwire" | "sse_disconnect" | "flags_off" | "shutdown" | "replaced";

export type ArmState =
  | { readonly kind: "closed" }
  | { readonly kind: "code_pending"; readonly codeExpiresAtMs: number; readonly minutes: number }
  | { readonly kind: "armed"; readonly untilMs: number };

export interface ArmChange {
  readonly state: ArmState["kind"];
  readonly armedUntilMs: number | null;
  readonly reason: DisarmReason | "armed" | "code_printed";
}
export type ArmListener = (change: ArmChange) => void;

type Verdict = { readonly ok: true } | { readonly ok: false; readonly result: RouteResult };

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function mintArmCode(random: (size: number) => Uint8Array): string {
  const bytes = random(8);
  let out = "";
  for (let index = 0; index < 8; index += 1) out += ARM_CODE_ALPHABET[(bytes[index] ?? 0) & 31];
  return out;
}

export class ArmController {
  readonly #host: DaemonHost;
  readonly #listeners: ArmListener[] = [];
  #pending: { readonly digest: string; readonly expiresAtMs: number; readonly minutes: number; attempts: number } | undefined;
  #untilMs: number | undefined;
  // True when the window was opened over a daemon that serves the event feed: it is then tied to the page's stream.
  #pageBound = false;
  #timer: NodeJS.Timeout | undefined;

  constructor(host: DaemonHost) {
    this.#host = host;
    killControllerOf(host).onEngage(() => this.disarm("kill"));
    // The ui-only signal from the events bus: the last page stream went away.
    eventBusOf(host).onUiStreamsClosed((remaining) => this.streamClosed(remaining));
    host.onClose(() => {
      this.#clearTimer();
      this.#pending = undefined;
      this.#untilMs = undefined;
    });
  }

  onChange(listener: ArmListener): void {
    this.#listeners.push(listener);
  }

  #emitChange(reason: ArmChange["reason"]): void {
    const change: ArmChange = { state: this.state().kind, armedUntilMs: this.#untilMs ?? null, reason };
    for (const listener of this.#listeners) {
      try {
        listener(change);
      } catch {
        // A listener (the event feed) must not stop the window from closing.
      }
    }
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #schedule(untilMs: number): void {
    this.#clearTimer();
    // The clock may be fake; the timer only prompts a check, which decides by the injected clock.
    const wait = Math.min(Math.max(untilMs - this.#host.clock(), 0) + 50, 2 ** 31 - 1);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.isArmed();
    }, wait);
    this.#timer.unref();
  }

  // Current state, applying every closing rule first.
  state(): ArmState {
    const now = this.#host.clock();
    if (this.#untilMs !== undefined && this.isArmed() && this.#untilMs !== undefined) return { kind: "armed", untilMs: this.#untilMs };
    if (this.#pending !== undefined) {
      if (now >= this.#pending.expiresAtMs) return { kind: "closed" };
      return { kind: "code_pending", codeExpiresAtMs: this.#pending.expiresAtMs, minutes: this.#pending.minutes };
    }
    return { kind: "closed" };
  }

  // The one question the gate asks. True only inside an open, un-killed, in-time window whose page is still there.
  isArmed(): boolean {
    if (this.#untilMs === undefined) return false;
    const now = this.#host.clock();
    if (killControllerOf(this.#host).engaged()) {
      this.disarm("kill");
      return false;
    }
    if (now >= this.#untilMs) {
      this.disarm("expired");
      return false;
    }
    if (this.#pageBound && this.#pageStreams() === 0) {
      this.disarm("sse_disconnect");
      return false;
    }
    if (!this.#anyWriteFlag()) {
      this.disarm("flags_off");
      return false;
    }
    return true;
  }

  armedUntilMs(): number | null {
    return this.isArmed() ? (this.#untilMs ?? null) : null;
  }

  #anyWriteFlag(): boolean {
    const flags = writeFlagsOf(this.#host);
    return WRITE_FLAGS.some((name) => flags[name] === true);
  }

  // Does this daemon serve the event feed a window can be tied to?
  #feedServed(): boolean {
    const key = `GET ${EVENTS_PATH}`;
    return this.#host.routes().some((route) => route.key === key);
  }

  // Streams opened with a page (ui) token. An agent's stream is not the page.
  #pageStreams(): number {
    return eventBusOf(this.#host).uiStreamCount();
  }

  // Step 1: print a code on stderr. The code never goes into a response, an audit record or a log line.
  requestArm(minutes: number, by: Principal): Verdict & { readonly codeExpiresAtMs?: number } {
    const kill = killControllerOf(this.#host);
    if (kill.engaged()) return { ok: false, result: fail("kill_switch", "The kill switch is on. Restart the daemon to arm again.") };
    if (this.#host.instance() !== "writer") return { ok: false, result: fail("scope_denied", "This instance serves reads only, so it cannot be armed.") };
    if (!this.#anyWriteFlag()) {
      this.#audit("refused", "flag_off", by, "arm");
      return { ok: false, result: fail("flag_off", "Arming does nothing: every ENABLE_ flag is off, so no write path is switched on.") };
    }
    if (this.isArmed()) return { ok: false, result: fail("precondition_failed", "The window is already open. Disarm first to start a new one.") };
    if (this.#feedServed() && this.#pageStreams() === 0) {
      this.#audit("refused", "no_page_stream", by, "arm");
      return { ok: false, result: fail("precondition_failed", NO_PAGE_STREAM_TEXT, { details: { reason: "no_page_stream" } }) };
    }
    const code = mintArmCode(this.#host.random);
    const codeExpiresAtMs = this.#host.clock() + ARM_CODE_TTL_S * 1000;
    this.#pending = { digest: sha256Hex(code), expiresAtMs: codeExpiresAtMs, minutes, attempts: 0 };
    // stderr only: the code is the proof that a human sits at the keyboard.
    this.#host.stderr.write(
      `xo-market cockpit: ARM code ${code}. Type it into the page within ${ARM_CODE_TTL_S} s to open a submit window of ${minutes} min. Nothing is armed until you do.\n`,
    );
    this.#host.emitAudit({ ev: "ui.arm", outcome: "ok", state: "code_printed", tokenId: by.id, note: `minutes=${minutes}` });
    this.#emitChange("code_printed");
    return { ok: true, codeExpiresAtMs };
  }

  // Step 2: the typed code opens the window.
  confirm(code: string, by: Principal): Verdict & { readonly untilMs?: number } {
    const kill = killControllerOf(this.#host);
    if (kill.engaged()) return { ok: false, result: fail("kill_switch", "The kill switch is on. Restart the daemon to arm again.") };
    const pending = this.#pending;
    if (pending === undefined) return this.#refuse("pairing_invalid", "There is no code to confirm. Ask for a new one.", by);
    if (this.#host.clock() >= pending.expiresAtMs) {
      this.#pending = undefined;
      return this.#refuse("pairing_expired", "The code ran out of time. Ask for a new one.", by);
    }
    // Compared as digests of fixed length, in constant time.
    if (!ARM_CODE_PATTERN.test(code) || !constantTimeEqual(sha256Hex(code), pending.digest)) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_ARM_ATTEMPTS) this.#pending = undefined;
      return this.#refuse("pairing_invalid", "That code is wrong. Five wrong tries burn it.", by);
    }
    if (!this.#anyWriteFlag()) {
      this.#pending = undefined;
      return this.#refuse("flag_off", "Every ENABLE_ flag is off, so the window stays closed.", by);
    }
    const pageBound = this.#feedServed();
    // The right code, but the page is not there: the code is kept (it is not guessed or spent), the window stays shut.
    if (pageBound && this.#pageStreams() === 0) return this.#refuse("precondition_failed", NO_PAGE_STREAM_TEXT, by, "no_page_stream");
    this.#pending = undefined;
    const untilMs = this.#host.clock() + pending.minutes * 60_000;
    this.#untilMs = untilMs;
    this.#pageBound = pageBound;
    this.#schedule(untilMs);
    this.#host.emitAudit({ ev: "ui.arm", outcome: "ok", state: "armed", tokenId: by.id, note: `minutes=${pending.minutes}` });
    this.#emitChange("armed");
    return { ok: true, untilMs };
  }

  #refuse(
    code: "pairing_invalid" | "pairing_expired" | "flag_off" | "precondition_failed",
    message: string,
    by: Principal,
    reason?: string,
  ): { readonly ok: false; readonly result: RouteResult } {
    this.#audit("refused", reason ?? code, by, "confirm");
    return { ok: false, result: fail(code, message, reason === undefined ? undefined : { details: { reason } }) };
  }

  #audit(outcome: "ok" | "refused", code: string, by: Principal, step: string): void {
    this.#host.emitAudit({ ev: "ui.arm", outcome, code, state: step, tokenId: by.id });
  }

  // Closes the window and drops a pending code. Idempotent: closing a closed window writes nothing.
  disarm(reason: DisarmReason, by?: Principal): boolean {
    const wasOpen = this.#untilMs !== undefined;
    const hadCode = this.#pending !== undefined;
    this.#untilMs = undefined;
    this.#pending = undefined;
    this.#pageBound = false;
    this.#clearTimer();
    if (!wasOpen && !hadCode) return false;
    this.#host.emitAudit({ ev: "ui.disarm", outcome: "ok", code: reason, ...(by === undefined ? {} : { tokenId: by.id }), state: wasOpen ? "closed" : "code_dropped" });
    this.#emitChange(reason);
    return wasOpen;
  }

  // A tripwire fired (a pinned on-chain property changed, a cap alarm...). The caller is whoever sees it first: the
  // event feed, the status poller, or a tool answer carrying `tripwire`.
  trip(): void {
    this.disarm("tripwire");
  }

  observeCode(code: unknown): void {
    if (code === "tripwire") this.trip();
  }

  // The page's event stream went away (the events bus calls this when its last ui stream closes). The window also
  // checks the page-stream count on its own, so this only makes the closing immediate.
  streamClosed(remainingPageStreams: number): void {
    if (remainingPageStreams === 0 && this.#pageBound) this.disarm("sse_disconnect");
  }
}

const controllers = new WeakMap<object, ArmController>();

export function armControllerOf(host: DaemonHost): ArmController {
  let controller = controllers.get(host);
  if (controller === undefined) {
    controller = new ArmController(host);
    controllers.set(host, controller);
  }
  return controller;
}

// What the status bar shows for a caller with these scopes.
export function postureOf(host: DaemonHost, scopes: readonly TokenScope[]): Posture {
  if (killControllerOf(host).engaged()) return "KILLED";
  if (armControllerOf(host).isArmed()) return "ARMED";
  return scopes.includes("prepare") ? "PREPARE" : "OBSERVE";
}

// ---- the once-only ledger for submits -----------------------------------------------------------------------------

export type ClaimResult = { readonly kind: "first" } | { readonly kind: "in_flight" } | { readonly kind: "done"; readonly outcome: string };

// Two submits of one prepared id send once. `claim` is called before anything is forwarded; the first caller wins and
// everyone after it is told, never forwarded. The claim is released only when the tool itself reported "refused"
// (it sent nothing, for example a flag was off). After any other result, including a thrown error or an ambiguous
// one, the claim stays: the answer is to reconcile by hash, not to send again (M4-9).
export class SubmitLedger {
  readonly #now: () => number;
  readonly #entries = new Map<string, { readonly at: number; state: "in_flight" | "done"; outcome: string }>();

  constructor(now: () => number) {
    this.#now = now;
  }

  #prune(): void {
    const cutoff = this.#now() - SUBMIT_LEDGER_TTL_MS;
    // A send in flight is never forgotten: its answer has not come back, so the id must stay claimed.
    for (const [key, entry] of this.#entries) {
      if (entry.state === "done" && entry.at < cutoff) this.#entries.delete(key);
    }
    if (this.#entries.size <= SUBMIT_LEDGER_MAX) return;
    // Map keeps insertion order: drop the oldest finished entries first.
    for (const [key, entry] of this.#entries) {
      if (this.#entries.size <= SUBMIT_LEDGER_MAX) break;
      if (entry.state === "done") this.#entries.delete(key);
    }
  }

  claim(id: string): ClaimResult {
    this.#prune();
    const existing = this.#entries.get(id);
    if (existing !== undefined) return existing.state === "in_flight" ? { kind: "in_flight" } : { kind: "done", outcome: existing.outcome };
    this.#entries.set(id, { at: this.#now(), state: "in_flight", outcome: "pending" });
    return { kind: "first" };
  }

  settle(id: string, outcome: string): void {
    const entry = this.#entries.get(id);
    if (entry === undefined) return;
    entry.state = "done";
    entry.outcome = outcome.slice(0, 24);
  }

  release(id: string): void {
    this.#entries.delete(id);
  }

  size(): number {
    return this.#entries.size;
  }
}

const ledgers = new WeakMap<object, SubmitLedger>();

export function submitLedgerOf(host: DaemonHost): SubmitLedger {
  let ledger = ledgers.get(host);
  if (ledger === undefined) {
    ledger = new SubmitLedger(host.clock);
    ledgers.set(host, ledger);
  }
  return ledger;
}

// ---- the module ------------------------------------------------------------------------------------------------------------

export const bridgeModule = (host: DaemonHost): BridgeModule => {
  const arming = armControllerOf(host);
  return {
    name: "arming",
    routes: [
      defineRoute({
        method: "POST",
        path: "/ui/arm",
        // The page only: an agent token cannot open a window, whatever its scopes.
        access: { scope: "prepare" },
        kinds: ["ui"],
        body: armRequestSchema,
        handler: (ctx) => {
          if (ctx.principal === null) return fail("unauthorized", "A valid bearer token is required.");
          const minutes = Math.min(ctx.body.minutes, ARM_MAX_MINUTES);
          const outcome = arming.requestArm(minutes, ctx.principal);
          if (!outcome.ok) return outcome.result;
          return json(armResponseSchema.parse({ state: "code_printed", code_expires_at: isoSecond(outcome.codeExpiresAtMs ?? host.clock()) }));
        },
      }),
      defineRoute({
        method: "POST",
        path: "/ui/arm/confirm",
        access: { scope: "prepare" },
        kinds: ["ui"],
        body: armConfirmRequestSchema,
        handler: (ctx) => {
          if (ctx.principal === null) return fail("unauthorized", "A valid bearer token is required.");
          const outcome = arming.confirm(ctx.body.code, ctx.principal);
          if (!outcome.ok) return outcome.result;
          return json(armConfirmResponseSchema.parse({ armed_until: isoSecond(outcome.untilMs ?? host.clock()) }));
        },
      }),
      defineRoute({
        method: "POST",
        path: "/ui/disarm",
        // Closing is the safe direction, so any token may do it.
        access: { scope: "read" },
        body: emptyRequestSchema,
        handler: (ctx) => {
          arming.disarm("user", ctx.principal ?? undefined);
          return json(disarmResponseSchema.parse({ posture: postureOf(host, ctx.principal?.scopes ?? []) }));
        },
      }),
    ],
    close: () => {
      arming.disarm("shutdown");
    },
  };
};

export function isoSecond(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
