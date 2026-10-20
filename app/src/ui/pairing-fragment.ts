import { pairCodeSchema } from "@bridge/contract";

// The daemon prints its loopback address followed by /#pair=<code> on stderr. The code lives in the URL fragment so it
// is never sent in an HTTP request line (bridge/contract.ts), and the page removes it from the address bar
// the moment it loads (dapp-design 5.4, acceptance M1-4). This runs from main.tsx before the first render
// and before the hash router reads the location, so the code is never routed, never in browser history, and
// never in a log. The session client (a later stream) takes the code once with consumePairingCode().
//
// The code is a one-time secret held in a module variable only: not in storage, not in a global, not in the DOM.

const PREFIX = "#pair=";

let pending: string | undefined;

// Reads and removes a `#pair=` fragment. A fragment that has the prefix but is not a valid 128-bit code is
// removed too and yields no code (fail closed). Any other fragment is left alone: it is a route.
export function takePairingFragment(win: Pick<Window, "location" | "history"> = window): void {
  const hash = win.location.hash;
  if (!hash.startsWith(PREFIX)) return;
  const parsed = pairCodeSchema.safeParse(hash.slice(PREFIX.length));
  pending = parsed.success ? parsed.data : undefined;
  win.history.replaceState(win.history.state, "", `${win.location.pathname}${win.location.search}`);
}

// One-shot: returns the code once, then undefined.
export function consumePairingCode(): string | undefined {
  const code = pending;
  pending = undefined;
  return code;
}

// Test hook: forget any code left over from a previous test.
export function resetPairingCodeForTests(): void {
  pending = undefined;
}
