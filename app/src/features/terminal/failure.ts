// Why a command did not produce a result, in words this app wrote. Nothing here quotes the daemon, the plugin or a
// venue: a failure is a closed kind plus, at most, a code from the contract's closed list.

import type { BridgeErrorCode } from "@bridge/contract";

export const FAILURE_KINDS = [
  "not_paired", // the page has no token
  "session_expired", // the daemon refused the token
  "daemon_refused", // the daemon answered with one of its error codes
  "network",
  "timeout",
  "aborted",
  "too_large",
  "bad_response", // the daemon's answer is not the contract's shape
  "tool_error", // the tool ran and reported an error
  "schema_violation", // the tool's answer does not match the schema this page expects
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

// Why a schema violation happened, when the page knows (a cross-check, not a field path). Fixed words.
export const VIOLATION_DETAILS = ["shape", "different_market", "different_token", "different_address", "levels_out_of_order"] as const;
export type ViolationDetail = (typeof VIOLATION_DETAILS)[number];

export interface Failure {
  readonly kind: FailureKind;
  readonly bridgeCode: BridgeErrorCode | null;
  readonly retryAfterS: number | null;
  // The tool that was called, when it was a tool call. Always a TerminalTool name or "status".
  readonly tool: string | null;
  readonly detail: ViolationDetail | null;
}

export function failure(kind: FailureKind, extra: Partial<Omit<Failure, "kind">> = {}): Failure {
  return { kind, bridgeCode: extra.bridgeCode ?? null, retryAfterS: extra.retryAfterS ?? null, tool: extra.tool ?? null, detail: extra.detail ?? null };
}

export interface FailureWords {
  readonly title: string;
  readonly explain: string;
}

const BRIDGE_CODE_WORDS: Readonly<Partial<Record<BridgeErrorCode, FailureWords>>> = {
  scope_denied: { title: "Not allowed for this session", explain: "The token this page holds may not run that tool. Nothing was changed." },
  rate_limited: { title: "Slow down", explain: "The daemon limits how fast this page can call tools." },
  not_found: { title: "XO has no record of that", explain: "The market, token or address is unknown to XO, or the market is closed. That is different from an empty result." },
  kill_switch: { title: "The kill switch is on", explain: "The daemon is stopped for writes. Reads that still work are shown by status." },
  upstream_requires_key: { title: "XO refused without a key", explain: "An XO host asked for a key. This tool never looks for one." },
  upstream_rejected: { title: "XO refused the request", explain: "An XO host refused it. Try again later." },
  invalid_request: { title: "The daemon refused the request", explain: "It did not pass the daemon's checks. Nothing was run." },
  upstream_timeout: { title: "XO did not answer in time", explain: "This is an unreachable host, which is different from an empty answer. Try again in a moment." },
  venue_paused: { title: "XO is paused", explain: "Requests to it stop for ten minutes after repeated refusals. Nothing retries around that." },
  data_dir_locked: { title: "This daemon serves reads only", explain: "Another process owns the data directory." },
  internal: { title: "The daemon had an internal problem", explain: "Nothing was run or changed. Check the daemon's error output." },
  not_implemented: { title: "The daemon does not offer this", explain: "The route or tool is not available in this build." },
};

export function failureWords(value: Failure): FailureWords {
  switch (value.kind) {
    case "not_paired":
      return { title: "Not paired with the daemon", explain: "This page has no session. Open the pair link the daemon printed on its error output, or reload to have it print a fresh one." };
    case "session_expired":
      return { title: "The session is no longer valid", explain: "The daemon refused this page's token (it expired, or the daemon restarted). Reload the page to have the daemon print a fresh pair link." };
    case "network":
      return { title: "The daemon could not be reached", explain: "The request failed before any answer. Check that the daemon is still running." };
    case "timeout":
      return { title: "The daemon did not answer in time", explain: "This is an unreachable daemon, which is different from an empty result. Try again in a moment." };
    case "aborted":
      return { title: "Cancelled", explain: "The request was cancelled before it finished." };
    case "too_large":
      return { title: "The answer was too large", explain: "It was refused instead of being read." };
    case "bad_response":
      return { title: "The daemon answered in a shape this page does not recognise", explain: "The answer was refused, not guessed at." };
    case "schema_violation":
      return {
        title: "Schema violation",
        explain:
          value.detail === "different_market"
            ? "The tool answered for a different market than the one asked about, so the answer was refused."
            : value.detail === "different_address"
              ? "The tool answered for a different address than the one asked about, so the answer was refused."
              : value.detail === "different_token"
              ? "The tool answered for a different outcome token than the one asked about, so the answer was refused."
              : value.detail === "levels_out_of_order"
                ? "The order book's levels are not in best-first order, so the book was refused instead of being shown."
                : "The tool's answer does not match the shape this page expects, so nothing in it is shown as a result. The raw answer is kept below as plain text for inspection.",
      };
    case "tool_error":
    case "daemon_refused": {
      // The status route is the daemon's, not XO's: "not found" there means this daemon build does not serve it.
      if (value.tool === "status" && value.bridgeCode === "not_found") {
        return { title: "This daemon does not serve a status route", explain: "The build you are connected to has no status route yet. The observer pane still shows what the event stream carries." };
      }
      const known = value.bridgeCode === null ? undefined : BRIDGE_CODE_WORDS[value.bridgeCode];
      if (known !== undefined) {
        const wait = value.retryAfterS === null ? "" : ` Try again in about ${String(value.retryAfterS)} s.`;
        return { title: known.title, explain: `${known.explain}${wait}` };
      }
      return {
        title: value.kind === "tool_error" ? "The tool reported an error" : "The daemon refused the request",
        explain: value.bridgeCode === null ? "No more is known." : `Code: ${value.bridgeCode}. Nothing was changed.`,
      };
    }
  }
}
