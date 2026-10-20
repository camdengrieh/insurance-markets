// Capability facts and the "unproven" rule (docs/dapp-design.md 7.1 "common to every slice", 7.2 M4 live items).
//
// A capability is a thing the project has NOT yet seen work against the real system: the four XO doors, what
// PayBox signs and shows, whether the PayBox address carries an EIP-7702 delegation. Each is recorded as
// "yes", "no" or "unknown", and a record flips to "yes" only on the operator's confirmation of a live test.
// Anything that is not recorded as "yes" is shown as "unproven" and gates nothing open: unknown fails closed.

import { UNPROVEN_TEXT } from "./format";

export const FACT_STATES = ["yes", "no", "unknown"] as const;
export type FactState = (typeof FACT_STATES)[number];

export function isFactState(value: unknown): value is FactState {
  return typeof value === "string" && (FACT_STATES as readonly string[]).includes(value);
}

// The facts the Cockpit's screens depend on. The keys are stable ids; the live test that settles each is in
// docs/dapp-design.md 7.5 and docs/phase1-gap-closing.md section 6.
export const CAPABILITY_IDS = [
  "door_a_bundler_admits_first_userop", // T1
  "door_b_orderbook_registers_account", // T2
  "door_c_l1_clobauth_accepted", // T2
  "door_d_orderbook_credits_usdce", // T3a
  "door_e_relayer_delivers_foreign_message",
  "paybox_signs_raw_digest", // DT1
  "paybox_signs_typed_data_3223", // DT1
  "paybox_shows_decoded_typed_data", // DT1
  "paybox_address_is_plain_eoa", // DT2
  "first_order_accepted_and_cancelled", // T3b
  "withdraw_exit_proven", // T4
  "redeem_proven", // T5
  "capped_allowance_and_revoke_proven", // T8
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type CapabilityFacts = Readonly<Record<CapabilityId, FactState>>;

// Everything starts unknown. Nothing in this repository has observed any of them (docs/dapp-design.md section 0).
export const NO_FACTS: CapabilityFacts = Object.freeze(Object.fromEntries(CAPABILITY_IDS.map((id) => [id, "unknown" as FactState])) as Record<CapabilityId, FactState>);

// A fact map read from storage or the daemon: unknown ids are dropped, and anything that is not exactly
// "yes" or "no" becomes "unknown".
export function readFacts(raw: unknown): CapabilityFacts {
  const out: Record<string, FactState> = { ...NO_FACTS };
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    for (const id of CAPABILITY_IDS) {
      // Own properties only: a value inherited through a prototype is not a recorded fact.
      const value = Object.hasOwn(raw, id) ? (raw as Record<string, unknown>)[id] : undefined;
      if (value === "yes" || value === "no") out[id] = value;
    }
  }
  return Object.freeze(out) as CapabilityFacts;
}

// Only an exact "yes" counts. "no" and "unknown" both block.
export function isProven(state: FactState | undefined): boolean {
  return state === "yes";
}

export function allProven(facts: CapabilityFacts, ids: readonly CapabilityId[]): boolean {
  return ids.every((id) => isProven(facts[id]));
}

// What the UI prints next to a capability: "proven" only for "yes". Everything else, a recorded "no" included,
// prints "unproven" (the rule of docs/dapp-design.md 7.1); factDetail adds the reason for a tooltip or a row.
export function factLabel(state: FactState | undefined): string {
  return state === "yes" ? "proven" : UNPROVEN_TEXT;
}

export function factDetail(state: FactState | undefined): string {
  if (state === "yes") return "Recorded as working by the operator after a live test.";
  if (state === "no") return "A live test failed. Treated as unproven; nothing that depends on it is enabled.";
  return "Not yet tested against the real system. Nothing that depends on it is enabled.";
}
