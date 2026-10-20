// The page's pairing with the daemon, as much of it as the terminal needs (dapp-design 5.4 "Pairing").
//
// The daemon prints its loopback address followed by /#pair=<code> on stderr. main.tsx removes the fragment from the
// address bar before anything else runs and keeps the code in memory (ui/pairing-fragment.ts). This file takes
// that code once, exchanges it at POST /ui/pair for a `ui` bearer token (read and prepare, never submit), and
// holds the token in memory and in sessionStorage so a reload does not force a re-pair. sessionStorage dies with the tab. The token is never
// put in a URL, a log line, an audit record, an error message or the DOM, and it is never persisted anywhere
// longer-lived.
//
// If the shell builds a session client of its own, it calls setTerminalTokenSource(() => token) and this file
// defers to it (the same convention as the explorer and signals screens). Until then this is the only code that
// can obtain a token, so the terminal works on its own.

import { pairResponseSchema, uiTokenSchema } from "@bridge/contract";

import type { TimerApi } from "../../core/cache";
import { internals, type RawFetch } from "../../core/fetch";
import { REQUEST_TIMEOUT_MS, daemonErrorOf } from "./client";

export const SESSION_STORAGE_KEY = "xo-cockpit.ui-session";

export type PairReason = "no_code" | "pairing_invalid" | "pairing_expired" | "unreachable" | "bad_response";

export type PairOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: PairReason };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionDeps {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  // Returns the pairing code once (ui/pairing-fragment.ts consumePairingCode).
  readonly consumeCode: () => string | undefined;
  // sessionStorage, or null when the browser blocks it. Every access is wrapped; the page works without it.
  readonly storage: StorageLike | null;
  // A token held by another part of the page (the shell's session client), if there is one.
  readonly external?: () => string | null;
}

let externalSource: (() => string | null) | null = null;

// The shell's session client registers where the ui token lives.
export function setTerminalTokenSource(source: (() => string | null) | null): void {
  externalSource = source;
}

export class PageSession {
  readonly #deps: SessionDeps;
  #token: string | null = null;
  #pairing: Promise<PairOutcome> | null = null;

  constructor(deps: SessionDeps) {
    this.#deps = deps;
    this.#token = this.#restore();
  }

  #restore(): string | null {
    try {
      const stored = this.#deps.storage?.getItem(SESSION_STORAGE_KEY) ?? null;
      if (stored === null) return null;
      const parsed = uiTokenSchema.safeParse(stored);
      if (parsed.success) return parsed.data;
      this.#deps.storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // storage blocked or cleared: not paired, which is a normal state
    }
    return null;
  }

  token(): string | null {
    const outside = (this.#deps.external ?? externalSource)?.() ?? null;
    return outside !== null && outside !== "" ? outside : this.#token;
  }

  // The token source other screens can use when they have none of their own.
  tokenSource(): () => string | null {
    return () => this.token();
  }

  // The daemon refused the token (it expired or the daemon restarted). Forget it everywhere this file put it.
  forget(): void {
    this.#token = null;
    try {
      this.#deps.storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // nothing to clear
    }
  }

  // Exchanges the pairing code, if the page was opened from one. One exchange at a time.
  pair(): Promise<PairOutcome> {
    if (this.#pairing !== null) return this.#pairing;
    const code = this.#deps.consumeCode();
    if (code === undefined) return Promise.resolve({ ok: false, reason: "no_code" });
    this.#pairing = this.#exchange(code).finally(() => {
      this.#pairing = null;
    });
    return this.#pairing;
  }

  async #exchange(code: string): Promise<PairOutcome> {
    const deadline = new internals.Deadline(this.#deps.timers, REQUEST_TIMEOUT_MS, undefined);
    try {
      const request = this.#deps.rawFetch("/ui/pair", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ code }),
          signal: deadline.signal,
          credentials: "omit",
          redirect: "manual",
          referrerPolicy: "no-referrer",
          cache: "no-store",
          mode: "cors",
        });
      request.catch(() => undefined);
      const response = await deadline.race(request);
      const text = await internals.readCapped(response, 64 * 1024, deadline, null);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false, reason: "bad_response" };
      }
      if (!response.ok) {
        const failure = daemonErrorOf(response.status, json, null);
        if (failure.bridgeCode === "pairing_expired") return { ok: false, reason: "pairing_expired" };
        if (failure.bridgeCode === "pairing_invalid") return { ok: false, reason: "pairing_invalid" };
        return { ok: false, reason: "bad_response" };
      }
      const parsed = pairResponseSchema.safeParse(json);
      if (!parsed.success) return { ok: false, reason: "bad_response" };
      this.#token = parsed.data.token;
      try {
        this.#deps.storage?.setItem(SESSION_STORAGE_KEY, parsed.data.token);
      } catch {
        // the token stays in memory for this page load
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "unreachable" };
    } finally {
      deadline.done();
    }
  }
}

export const PAIR_REASON_TEXT: Readonly<Record<PairReason, string>> = Object.freeze({
  no_code: "This page has no pairing code. Open the pair link the daemon printed on its error output, or reload this page to have it print a fresh one.",
  pairing_invalid: "The daemon did not accept the pairing code. It is used once, and five wrong tries burn it. Reload this page to have the daemon print a fresh link.",
  pairing_expired: "The pairing code ran out of time (about two minutes). Reload this page to have the daemon print a fresh link.",
  unreachable: "The daemon could not be reached. Check that it is still running.",
  bad_response: "The daemon answered pairing in a shape this page does not recognise, so no session was started.",
});
