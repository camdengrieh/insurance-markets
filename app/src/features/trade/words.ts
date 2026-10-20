// Plain words for every way a trade call can end that is not a prepared item. All of it is fixed text written here:
// the plugin's and the relay's own sentences are shown, when they are shown at all, inside the untrusted slot.

import type { DaemonErrorCode } from "../terminal/client";

export interface Words {
  readonly title: string;
  readonly explain: string;
}

// The codes the plugin gives a refusal (src/tools/relay-tool-kit.ts nextFor, src/relay/errors.ts) that these screens
// can meet. An unknown code gets the generic words and the code itself (only when it is a short lower-case word).
const REFUSALS: Readonly<Record<string, Words>> = Object.freeze({
  flag_off: { title: "This write path is switched off", explain: "The operator has not switched this on in the daemon's environment. This page cannot switch it on, and nothing was prepared." },
  kill_switch: { title: "The kill switch is on", explain: "Every write is disabled until the daemon restarts. Reads still work. There is no way to switch it off from here." },
  cap_exceeded: { title: "Over a spending cap", explain: "The order would count more than a per-order or daily cap allows. The caps bind the plugin and its relay only; they are advisory against a compromised agent." },
  precondition_failed: { title: "Something this needs is not true yet", explain: "For example the account is not deployed, or a market has not resolved. Nothing was prepared." },
  invalid_request: { title: "The request was not accepted", explain: "A value is outside what the relay allows, such as a size below the minimum or a price too far from the book. Nothing was prepared." },
  above_test_amount: { title: "Above the test amount", explain: "Funding above the recorded test amount stays refused until a first small deposit has been seen to arrive and be credited. There is no verified way to take money back out." },
  invalid_amount: { title: "That amount is not valid", explain: "Use a plain USDC amount with up to six decimal places." },
  relay_not_configured: { title: "No relay is configured", explain: "The daemon's plugin has no relay to ask, so nothing can be prepared." },
  owner_not_established: { title: "No owner is established at the relay", explain: "The relay serves only its configured owner. Nothing was prepared." },
  owner_confirmation_required: { title: "Confirm the owner first", explain: "The relay asks for the same call once more after a short pause, to confirm which wallet it serves. Check the owner address, wait, and press again." },
  owner_confirmation_pending: { title: "Wait a moment, then press again", explain: "The relay is waiting a few seconds before it accepts the owner confirmation." },
  capability_unknown: { title: "A required fact is unproven", explain: "The relay will not run this until the live test that proves it is recorded." },
  prepared_mismatch: { title: "The relay's item did not check out", explain: "The plugin rebuilt the item and it did not match. Nothing is shown as ready to sign." },
  rate_limited: { title: "Too many requests", explain: "Wait a moment and try again." },
  budget_exceeded: { title: "The call ran out of time", explain: "Nothing is known to have been prepared. Try again." },
  not_implemented: { title: "Not available on this daemon", explain: "The daemon or relay does not offer this yet." },
  account_mismatch: { title: "The relay derived a different account", explain: "The relay and this page disagree about which XO account belongs to the owner. Nothing was prepared; do not continue." },
  quote_mismatch: { title: "The relay quoted something else", explain: "The quote differs from what was asked for, so the item was not passed on. Do not sign anything from it." },
  scope_denied: { title: "This session may not do that", explain: "The daemon refused this token or this instance. A read-only instance, or a token without the prepare scope, cannot prepare." },
  internal: { title: "The tool did not finish", explain: "Its effect is unknown. Nothing was shown as prepared." },
});

const GENERIC_REFUSAL: Words = { title: "The call was refused", explain: "The reason is not one this screen has words for." };

const CODE_WORD = /^[a-z0-9_]{1,48}$/;

export function refusalWords(code: string): Words & { readonly code: string | null } {
  const known = Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : undefined;
  if (known !== undefined) return { ...known, code };
  return { ...GENERIC_REFUSAL, code: CODE_WORD.test(code) ? code : null };
}

const DAEMON: Readonly<Record<DaemonErrorCode, Words>> = Object.freeze({
  not_paired: { title: "This page is not paired", explain: "Open the pairing link the Cockpit printed on its own terminal. The page keeps the session token in this tab only." },
  unauthorized: { title: "The session ended", explain: "The Cockpit refused the token: it expired or the daemon restarted. Pair again with a fresh link." },
  refused: { title: "The Cockpit refused the request", explain: "It answered with an error of its own." },
  network: { title: "The Cockpit could not be reached", explain: "Nothing was prepared. Check that the daemon is still running." },
  timeout: { title: "The Cockpit did not answer in time", explain: "The effect is unknown: nothing is shown as prepared. Read the account again before asking twice." },
  aborted: { title: "Cancelled", explain: "The request was cancelled." },
  too_large: { title: "The answer was too large", explain: "It was refused instead of read." },
  bad_response: { title: "The answer was not in a shape we know", explain: "It was refused instead of guessed at." },
});

export function daemonWords(code: DaemonErrorCode, bridgeCode: string | null): Words {
  if (code === "refused" && bridgeCode !== null) {
    const known = Object.hasOwn(REFUSALS, bridgeCode) ? REFUSALS[bridgeCode] : undefined;
    if (known !== undefined) return known;
  }
  return DAEMON[code];
}
