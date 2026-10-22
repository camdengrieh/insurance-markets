// Deadlines for the Trueo reader. Its JSON-RPC POSTs go through the one port (sdk/chain/rpc.ts, built in rpc.ts),
// which owns the body cap, the status mapping and the deadline race; this file keeps the deadline arithmetic and
// the pause a 403 earns. The adapter never reads a global fetch and never sets Origin, Referer or User-Agent.

export const DEFAULT_TIMEOUT_MS = 15_000;
export const FORBIDDEN_PAUSE_MS = 10 * 60_000;

// Epoch milliseconds are above 1e12 from 2001 to 2286. A smaller number cannot be an absolute deadline, so it
// is read as a duration from now.
export function resolveDeadline(deadlineMs: number | undefined, nowMs: number, fallbackMs = DEFAULT_TIMEOUT_MS): number {
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return nowMs + fallbackMs;
  return deadlineMs < 1e12 ? nowMs + deadlineMs : deadlineMs;
}
