import { useCallback, useEffect, useState } from "react";

import type { PageSessionState } from "../../session";
import type { AppMode } from "../../ui";
import type { PageSession, PairReason } from "./session";

// What the hook needs from a services record: the terminal's and the signing inbox's both have it.
export interface PairingServices {
  readonly session: Pick<PageSession, "token" | "pair" | "forget">;
}

// The page's pairing with the daemon, as a screen sees it (dapp-design 5.4 "Pairing"). One place decides the
// words for every host: the dock, the read terminal and the signing inbox share this hook.
//
//   checking   the page is finding out whether it already has a session
//   ready      a ui token is held (read and prepare, never submit)
//   unpaired   no session, with the reason the daemon or the page gave
//   expired    the daemon refused the token after it was held (it expired, or the daemon restarted)
//
// With `session` (src/session.ts startPageSession, started once at load) the outcome of that one exchange is used
// and nothing is requested here; `carriedOver` then says the token came from earlier in this tab. Without it the
// hook pairs the way the terminal screen always did: a token already held wins, otherwise the pairing code the
// page was opened with is exchanged once (PageSession.pair dedupes concurrent callers).

export type Pairing = { readonly phase: "checking" } | { readonly phase: "ready"; readonly carriedOver: boolean } | { readonly phase: "unpaired"; readonly reason: PairReason } | { readonly phase: "expired" };

export const CHECKING: Pairing = Object.freeze({ phase: "checking" });

export interface PairingOptions {
  // False when another component owns pairing and passes the result down: then nothing is requested here.
  readonly enabled?: boolean;
  readonly session?: Promise<PageSessionState>;
}

export function usePairing(services: PairingServices, mode: AppMode, options: PairingOptions = {}): { readonly pairing: Pairing; readonly onUnauthorized: () => void } {
  const enabled = options.enabled ?? true;
  const session = options.session;
  const [pairing, setPairing] = useState<Pairing>(CHECKING);

  const onUnauthorized = useCallback((): void => {
    services.session.forget();
    setPairing({ phase: "expired" });
  }, [services]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    if (mode !== "cockpit") {
      setPairing({ phase: "unpaired", reason: "no_code" });
      return;
    }
    if (session !== undefined) {
      void session.then((state) => {
        if (cancelled) return;
        if (state.kind === "paired") setPairing({ phase: "ready", carriedOver: !state.fresh });
        else if (state.kind === "unpaired") setPairing({ phase: "unpaired", reason: state.reason });
        else setPairing({ phase: "unpaired", reason: "no_code" });
      });
      return () => {
        cancelled = true;
      };
    }
    if (services.session.token() !== null) {
      setPairing({ phase: "ready", carriedOver: true });
      return;
    }
    void services.session.pair().then((outcome) => {
      if (cancelled) return;
      setPairing(outcome.ok ? { phase: "ready", carriedOver: false } : { phase: "unpaired", reason: outcome.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [services, mode, enabled, session]);

  return { pairing, onUnauthorized };
}
