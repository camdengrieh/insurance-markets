// The next-missing-step machine for Base-to-XO funding (docs/research/20 sec 9, spec FU4).
//
// PayBox proposals carry ONE call each, and the second must wait for the first to confirm. The plugin
// has no memory (a fresh sandbox per call), so every call re-reads the chain and answers with exactly
// one next step:
//
//   approve   the allowance is not exactly the amount: approve(router, amount) (exact, never unlimited;
//             a larger leftover allowance is reset to the amount so the transfer leaves none behind);
//   transfer  the allowance equals the amount and the balance covers it: transferRemote;
//   done      the account's XO balance has risen by at least the amount since a baseline the caller kept;
//   blocked   something stops the funding, with a stable reason.
//
// Pure: bigint in, one decision out. An input that does not make sense is `blocked`, never a guess.

export type FundingStep = "approve" | "transfer" | "done" | "blocked";

export type StepReason =
  | "balance_rose" // done: the XO balance is at least baseline + amount
  | "allowance_short" // approve: allowance below the amount
  | "allowance_not_exact" // approve: allowance above the amount, reset it to the exact amount
  | "allowance_exact" // transfer: allowance equals the amount
  | "insufficient_base_balance" // blocked: the Base USDC balance does not cover the amount
  | "invalid_input"; // blocked: a negative number or a non-positive amount

export interface StepInput {
  // Atomic USDC units (6 decimals). Must be positive.
  readonly amount: bigint;
  // Circle USDC allowance(owner, router) on Base.
  readonly allowance: bigint;
  // Circle USDC balanceOf(owner) on Base.
  readonly baseBalance: bigint;
  // The XO account's balance now, in the same units; null when it could not be read.
  readonly xoBalance: bigint | null;
  // The XO account's balance before this funding, kept by the caller from an earlier call; null when
  // there is none. Without it the machine cannot tell "already funded" and never reports done.
  readonly xoBalanceBefore: bigint | null;
}

export interface StepDecision {
  readonly step: FundingStep;
  readonly reason: StepReason;
  // Fixed text, safe to show.
  readonly detail: string;
}

function decide(step: FundingStep, reason: StepReason, detail: string): StepDecision {
  return { step, reason, detail };
}

export function nextFundingStep(input: StepInput): StepDecision {
  const { amount, allowance, baseBalance, xoBalance, xoBalanceBefore } = input;
  const numbers = [amount, allowance, baseBalance, ...(xoBalance === null ? [] : [xoBalance]), ...(xoBalanceBefore === null ? [] : [xoBalanceBefore])];
  if (numbers.some((value) => typeof value !== "bigint" || value < 0n) || amount <= 0n) {
    return decide("blocked", "invalid_input", "An amount, allowance or balance is negative, or the amount is not positive.");
  }

  // Already funded: the XO balance is at least the baseline plus the amount.
  if (xoBalance !== null && xoBalanceBefore !== null && xoBalance >= xoBalanceBefore + amount) {
    return decide("done", "balance_rose", "The XO account balance has risen by at least the amount since the baseline; nothing more to send.");
  }

  // Neither call can succeed without the USDC. (An approve would only create a standing allowance.)
  if (baseBalance < amount) {
    return decide("blocked", "insufficient_base_balance", "The owner wallet holds less Circle USDC on Base than the amount.");
  }

  if (allowance < amount) return decide("approve", "allowance_short", "The router allowance is below the amount: approve the exact amount first.");
  if (allowance > amount) {
    return decide("approve", "allowance_not_exact", "The router allowance is larger than the amount: reset it to the exact amount so none is left over.");
  }
  return decide("transfer", "allowance_exact", "The router allowance equals the amount: send the transfer.");
}
