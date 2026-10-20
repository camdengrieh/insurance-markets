// Runtime pin check (design stage S12): compare the live state of each leg with the pins in the
// link. Any difference, or any missing live value, suspends the link. No LLM, no network here;
// the caller supplies the live values it just fetched. Reasons name fields, never market text.

import { sha256Hex } from "./canonical.js";
import type { Link } from "./schema.js";

export interface LiveLegState {
  // Hash of the live rule fields, computed with hash.ts. Null = could not be computed.
  readonly rulesSha256: string | null;
  readonly maskedSha256?: string | null;
  readonly closeUtc: string | null;
  readonly resolverId: string | null;
  // Venue status as normalised by the adapter, for example "active".
  readonly status: string | null;
}

export interface PinMismatch {
  readonly legIndex: number;
  readonly field: "rulesSha256" | "maskedSha256" | "closeUtc" | "resolverId" | "status" | "live_state";
  readonly code: "mismatch" | "missing";
}

export type PinCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly PinMismatch[] };

export interface PinOptions {
  readonly acceptableStatuses?: readonly string[];
}

export function verifyLegPins(
  link: Pick<Link, "legs">,
  live: readonly (LiveLegState | undefined)[],
  options: PinOptions = {},
): PinCheck {
  const reasons: PinMismatch[] = [];
  const statuses = options.acceptableStatuses ?? ["active"];
  if (live.length !== link.legs.length) {
    reasons.push({ legIndex: -1, field: "live_state", code: "mismatch" });
  }
  link.legs.forEach((leg, legIndex) => {
    const state = live[legIndex];
    if (state === undefined) {
      reasons.push({ legIndex, field: "live_state", code: "missing" });
      return;
    }
    const check = (field: PinMismatch["field"], pinned: string | null, actual: string | null | undefined): void => {
      if (actual === null || actual === undefined) reasons.push({ legIndex, field, code: "missing" });
      else if (pinned !== actual) reasons.push({ legIndex, field, code: "mismatch" });
    };
    check("rulesSha256", leg.rulesSha256, state.rulesSha256);
    check("maskedSha256", leg.maskedSha256, state.maskedSha256);
    check("closeUtc", leg.closeUtc, state.closeUtc);
    // A pinned resolver must match; an unpinned (null) one only needs the live side to be known.
    if (leg.resolverId !== null) check("resolverId", leg.resolverId, state.resolverId);
    if (state.status === null) reasons.push({ legIndex, field: "status", code: "missing" });
    else if (!statuses.includes(state.status)) reasons.push({ legIndex, field: "status", code: "mismatch" });
  });
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

// Short fingerprint of a pin check outcome for logs, so a suspension can be correlated without
// printing field values.
export function pinCheckFingerprint(check: PinCheck): string {
  return check.ok ? "ok" : sha256Hex(JSON.stringify(check.reasons)).slice(0, 12);
}
