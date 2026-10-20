import { setPageTokenSource } from "./core/page-token";
import { sharedTerminalServices } from "./features/terminal/services";
import type { PairReason } from "./features/terminal/session";
import { appModeFromEnv, type AppMode } from "./ui";

// The Cockpit page's one session, started once at load (dapp-design 5.4 "Pairing"). main.tsx has already removed the
// #pair= fragment from the address bar and kept the code in memory. Here that code, if there is one, is exchanged at
// POST /ui/pair for a `ui` token (read and prepare, never submit); a token from earlier in this tab is picked up from
// sessionStorage. The screens that read through the daemon get the token through core/page-token. No pairing code and no
// stored token means no session: the screens say so in words and send nothing.
//
// The standalone build has no daemon, so nothing happens there: no request, no storage read.

export type PageSessionState =
  | { readonly kind: "standalone" }
  // `fresh`: this load exchanged a code. Otherwise the token came from earlier in this tab (the daemon may have restarted since).
  | { readonly kind: "paired"; readonly fresh: boolean }
  | { readonly kind: "unpaired"; readonly reason: PairReason };

export function startPageSession(mode: AppMode = appModeFromEnv()): Promise<PageSessionState> {
  if (mode !== "cockpit") return Promise.resolve({ kind: "standalone" });
  const session = sharedTerminalServices(mode).session;
  setPageTokenSource(session.tokenSource());
  const held = session.token() !== null;
  return session.pair().then((outcome): PageSessionState => {
    if (outcome.ok) return { kind: "paired", fresh: true };
    return held ? { kind: "paired", fresh: false } : { kind: "unpaired", reason: outcome.reason };
  });
}
