// "Activate trading" (docs/unified-account-design.md sections 1 and 3.1): one activation per venue, registered in one
// list, run once and in order behind one progress list. A venue that cannot be activated (an operator credential
// missing, the venue refusing this address) shows as not available with its reason, and the others still run.
//
// The list starts empty and the venues register themselves (features/trade): that side imports this module, this module
// imports nothing of theirs, so there is no import cycle. The result type below has the same shape as the direct path's
// DirectResult<void> (features/trade/direct/types.ts), so an executor's own result can be returned as it is.

import type { VenueId } from "../../core/ports";
import type { TradingAccount } from "./types";

export type ActivationStatus =
  | { readonly state: "ready" }
  | { readonly state: "needs_activation"; readonly steps: readonly string[] }
  | { readonly state: "unavailable"; readonly reason: string };

// Called with fixed app words for each step as it starts ("Creating your Polymarket wallet").
export type ActivationProgress = (step: string) => void;

export type ActivationResult =
  | { readonly ok: true; readonly value?: void }
  | { readonly ok: false; readonly refusal: { readonly code: string; readonly message: string; readonly venueText: string | null } };

export interface VenueActivation {
  readonly venue: VenueId;
  status(acct: TradingAccount): Promise<ActivationStatus>;
  activate(acct: TradingAccount, progress: ActivationProgress): Promise<ActivationResult>;
}

// The registered activations, in the order they run. Read it; change it only through registerVenueActivation.
export const VENUE_ACTIVATIONS: VenueActivation[] = [];

const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of [...listeners]) listener();
}

// Adds a venue's activation (or replaces the one already registered for that venue, keeping its place). Returns a
// function that removes it again.
export function registerVenueActivation(activation: VenueActivation): () => void {
  const index = VENUE_ACTIVATIONS.findIndex((entry) => entry.venue === activation.venue);
  if (index === -1) VENUE_ACTIVATIONS.push(activation);
  else VENUE_ACTIVATIONS[index] = activation;
  changed();
  return () => {
    const at = VENUE_ACTIVATIONS.indexOf(activation);
    if (at !== -1) {
      VENUE_ACTIVATIONS.splice(at, 1);
      changed();
    }
  };
}

export function subscribeVenueActivations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---- running them --------------------------------------------------------------------------------------------------------------

export type ActivationRow =
  | { readonly venue: VenueId; readonly state: "checking" }
  | { readonly venue: VenueId; readonly state: "ready" }
  | { readonly venue: VenueId; readonly state: "needs_activation"; readonly steps: readonly string[] }
  | { readonly venue: VenueId; readonly state: "activating"; readonly step: string | null }
  | { readonly venue: VenueId; readonly state: "unavailable"; readonly reason: string }
  | { readonly venue: VenueId; readonly state: "failed"; readonly message: string; readonly venueText: string | null };

const STATUS_FAILED = "Its status could not be read.";

async function statusOf(activation: VenueActivation, acct: TradingAccount): Promise<ActivationRow> {
  try {
    const status = await activation.status(acct);
    if (status.state === "ready") return { venue: activation.venue, state: "ready" };
    if (status.state === "unavailable") return { venue: activation.venue, state: "unavailable", reason: status.reason };
    return { venue: activation.venue, state: "needs_activation", steps: status.steps };
  } catch {
    return { venue: activation.venue, state: "failed", message: STATUS_FAILED, venueText: null };
  }
}

// Reads every venue's status, in order. Reads only; activates nothing.
export async function checkActivations(acct: TradingAccount, activations: readonly VenueActivation[], onRow: (index: number, row: ActivationRow) => void): Promise<void> {
  for (const [index, activation] of activations.entries()) {
    onRow(index, { venue: activation.venue, state: "checking" });
    onRow(index, await statusOf(activation, acct));
  }
}

// Activates every venue that needs it, one after another. A venue that fails or is not available does not stop the
// others. Each one's status is read again after it activates, so "ready" is what the venue says, not what the page hoped.
export async function runActivations(acct: TradingAccount, activations: readonly VenueActivation[], onRow: (index: number, row: ActivationRow) => void): Promise<void> {
  for (const [index, activation] of activations.entries()) {
    onRow(index, { venue: activation.venue, state: "checking" });
    const before = await statusOf(activation, acct);
    if (before.state !== "needs_activation") {
      onRow(index, before);
      continue;
    }
    onRow(index, { venue: activation.venue, state: "activating", step: null });
    let result: ActivationResult;
    try {
      result = await activation.activate(acct, (step) => onRow(index, { venue: activation.venue, state: "activating", step }));
    } catch {
      result = { ok: false, refusal: { code: "failed", message: "The activation stopped with an error.", venueText: null } };
    }
    if (!result.ok) {
      onRow(index, { venue: activation.venue, state: "failed", message: result.refusal.message, venueText: result.refusal.venueText });
      continue;
    }
    onRow(index, await statusOf(activation, acct));
  }
}
