// Limitless trading for the trading account (docs/unified-account-design.md section 3.1 VenueActivation): register E
// as our partner sub-account (one personal_sign over Limitless's own text, through our relay), then the approvals the
// chain does not show yet, each a call E sends (routed through the account's gas sponsor). Every step is read fresh in
// `status`; nothing is assumed from an earlier visit.

import type { ActivationStatus, VenueActivation } from "../../../account/activation";
import type { TradingAccount } from "../../../account/types";
import { ok, refuse, type DirectResult } from "../types";
import { ALREADY_HAS_ACCOUNT, NOT_AVAILABLE, type LimitlessExecutor } from "./executor";

export const LIMITLESS_STEP_REGISTER = "Register your trading account with Limitless";

export function limitlessActivation(executor: LimitlessExecutor): VenueActivation {
  async function steps(acct: TradingAccount): Promise<ActivationStatus> {
    if (!executor.available) return { state: "unavailable", reason: NOT_AVAILABLE };
    if (executor.foreign(acct.signer)) return { state: "unavailable", reason: ALREADY_HAS_ACCOUNT };
    const ready = await executor.ready(acct.signer);
    if (!ready.ok) return { state: "unavailable", reason: ready.refusal.message };
    const account = ready.value.accounts[0];
    if (account === undefined) return { state: "unavailable", reason: "This page found no Limitless account to trade from." };
    const calls = await executor.approvalCalls(account);
    if (!calls.ok) return { state: "unavailable", reason: calls.refusal.message };
    const needed = [...(executor.session(acct.signer) === null ? [LIMITLESS_STEP_REGISTER] : []), ...calls.value.map((call) => call.words)];
    return needed.length === 0 ? { state: "ready" } : { state: "needs_activation", steps: needed };
  }

  return {
    venue: "limitless",
    status: steps,
    async activate(acct, progress): Promise<DirectResult<void>> {
      if (!executor.available) return refuse("venue_unreachable", NOT_AVAILABLE);
      const ready = await executor.ready(acct.signer);
      if (!ready.ok) return ready;
      const account = ready.value.accounts[0];
      if (account === undefined) return refuse("account_refused", "This page found no Limitless account to trade from.");
      if (executor.session(acct.signer) === null) {
        progress(LIMITLESS_STEP_REGISTER);
        const registered = await executor.login(acct.signer);
        if (!registered.ok) return registered;
      }
      const calls = await executor.approvalCalls(account);
      if (!calls.ok) return calls;
      for (const call of calls.value) {
        progress(call.words);
        const sent = await executor.sendApproval(acct.signer, call);
        if (!sent.ok) return sent;
      }
      return ok(undefined);
    },
  };
}
