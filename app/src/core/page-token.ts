// Where the Cockpit page keeps its ui token, for the screens that read through the daemon (explorer, wallet, signals).
// One registration at start-up (src/session.ts) instead of one per screen, so a screen that is never opened costs
// nothing and a screen opened first does not decide who pairs. The token itself lives in the session that owns it
// (features/terminal/session.ts: memory and sessionStorage, never a URL, a log line or the DOM); this module only
// holds the function that reads it. Until a source is registered, and in the standalone build, there is no token.

let source: (() => string | null) | null = null;

export function setPageTokenSource(next: (() => string | null) | null): void {
  source = next;
}

export function pageToken(): string | null {
  try {
    const token = source?.() ?? null;
    return token === "" ? null : token;
  } catch {
    return null;
  }
}
