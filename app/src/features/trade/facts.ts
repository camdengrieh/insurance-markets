// Which switches and which recorded live-test facts each trade action depends on, and what the screen does while
// they are not "yes" (docs/dapp-design.md 7.1 "common to every slice", 7.2 M4, 7.3 dependency matrix).
//
// THE RULE. Anything that is not recorded as exactly "yes" shows "unproven": "no" and "unknown" read the same on
// screen and block the same things. Nothing here sets a flag or records a fact; the page only reads them. The flags
// come from the account read (xo_account: the plugin's and the relay's switches, all OFF by default), the facts
// from the page's own record (services.facts) and from the relay's capability record that the same read carries.
//
// WHAT IS GATED, AND WHY IT IS NOT EVERYTHING.
//   requires     the relay's own prerequisites for the write flag, plus the PayBox signing fact for the item kind.
//                While one is not "yes", the action offers no hand-off to an agent. For an order or a funding step
//                (which reserve daily-cap budget when prepared) the Prepare button waits too.
//   informs      the live test whose result this action produces (T3a, T4, T5, T8): shown as unproven, never required,
//                because requiring a test's result before the test can be run could never be satisfied.
//   A user-operation prepare with its switch off is a DRY RUN: it returns what would be signed and no signing
//   intent. The page allows it (it reserves nothing) and labels it "dry run, do not sign".

import { CAPABILITY_IDS, isProven, type CapabilityFacts, type CapabilityId, type FactState } from "../../core/capabilities";

export const TRADE_ACTIONS = ["deploy", "revoke", "redeem", "order", "fund", "withdraw", "polymarket_order", "limitless_order"] as const;
export type TradeAction = (typeof TRADE_ACTIONS)[number];

export const WRITE_FLAGS = ["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING", "ENABLE_FUNDING", "ENABLE_WITHDRAW", "ENABLE_CLOB_POLYMARKET", "ENABLE_CLOB_LIMITLESS"] as const;
export type WriteFlag = (typeof WRITE_FLAGS)[number];

export interface ActionNeeds {
  readonly title: string;
  readonly flag: WriteFlag;
  readonly requires: readonly CapabilityId[];
  // At least one of these must be proven (an order is signed as typed data unless PayBox refuses it, then as raw).
  readonly requiresAny: readonly CapabilityId[];
  readonly informs: readonly CapabilityId[];
  // Prepare reserves daily-cap budget, so the Prepare button itself waits for the requirements.
  readonly reservesBudget: boolean;
}

export const ACTION_NEEDS: Readonly<Record<TradeAction, ActionNeeds>> = Object.freeze({
  deploy: {
    title: "Deploy the account and enable trading",
    flag: "ENABLE_USEROP_SUBMIT",
    requires: ["door_a_bundler_admits_first_userop", "paybox_signs_raw_digest"],
    requiresAny: [],
    informs: ["capped_allowance_and_revoke_proven"],
    reservesBudget: false,
  },
  revoke: {
    title: "Revoke trading",
    flag: "ENABLE_USEROP_SUBMIT",
    requires: ["door_a_bundler_admits_first_userop", "paybox_signs_raw_digest"],
    requiresAny: [],
    informs: ["capped_allowance_and_revoke_proven"],
    reservesBudget: false,
  },
  redeem: {
    title: "Redeem resolved positions",
    flag: "ENABLE_USEROP_SUBMIT",
    requires: ["door_a_bundler_admits_first_userop", "paybox_signs_raw_digest"],
    requiresAny: [],
    informs: ["redeem_proven"],
    reservesBudget: false,
  },
  order: {
    title: "Place an order",
    flag: "ENABLE_TRADING",
    requires: ["door_a_bundler_admits_first_userop", "door_b_orderbook_registers_account", "door_c_l1_clobauth_accepted", "first_order_accepted_and_cancelled"],
    requiresAny: ["paybox_signs_typed_data_3223", "paybox_signs_raw_digest"],
    informs: ["door_d_orderbook_credits_usdce", "paybox_shows_decoded_typed_data"],
    reservesBudget: true,
  },
  fund: {
    title: "Fund the XO account",
    flag: "ENABLE_FUNDING",
    requires: ["door_a_bundler_admits_first_userop"],
    requiresAny: [],
    informs: ["door_d_orderbook_credits_usdce", "door_e_relayer_delivers_foreign_message", "withdraw_exit_proven"],
    reservesBudget: true,
  },
  withdraw: {
    title: "Withdraw to Base",
    flag: "ENABLE_WITHDRAW",
    requires: ["withdraw_exit_proven", "paybox_signs_raw_digest"],
    requiresAny: [],
    informs: [],
    reservesBudget: false,
  },
  // The CLOB venues besides XO: an EOA order the wallet itself signs. The venue's login (or token) and a first
  // accepted order are the live tests; until they are recorded nothing is handed to an agent.
  polymarket_order: {
    title: "Place a Polymarket order",
    flag: "ENABLE_CLOB_POLYMARKET",
    requires: ["polymarket_login_accepted", "polymarket_first_order_accepted"],
    requiresAny: ["paybox_signs_typed_data_137", "paybox_signs_raw_digest"],
    informs: ["paybox_shows_decoded_typed_data"],
    reservesBudget: true,
  },
  limitless_order: {
    title: "Place a Limitless order",
    flag: "ENABLE_CLOB_LIMITLESS",
    requires: ["limitless_token_accepted", "limitless_first_order_accepted"],
    requiresAny: ["paybox_signs_typed_data_8453", "paybox_signs_raw_digest"],
    informs: ["paybox_shows_decoded_typed_data"],
    reservesBudget: true,
  },
});

// Plain words for every capability the trade screens name.
export const FACT_LABELS: Readonly<Record<CapabilityId, string>> = Object.freeze({
  door_a_bundler_admits_first_userop: "XO's bundler admits a first user operation (live test T1)",
  door_b_orderbook_registers_account: "XO's order book registers the account (T2)",
  door_c_l1_clobauth_accepted: "XO accepts the login signature (T2)",
  door_d_orderbook_credits_usdce: "XO's order book credits a deposit (T3a)",
  door_e_relayer_delivers_foreign_message: "XO's relayer delivers a transfer from Base",
  paybox_signs_raw_digest: "PayBox signs a raw digest (DT1)",
  paybox_signs_typed_data_3223: "PayBox signs typed data for chain 3223 (DT1)",
  paybox_shows_decoded_typed_data: "PayBox shows decoded typed data (DT1)",
  paybox_address_is_plain_eoa: "The PayBox address is a plain EOA (DT2)",
  first_order_accepted_and_cancelled: "A first order was accepted and cancelled (T3b)",
  withdraw_exit_proven: "A way out of XO was proven (T4)",
  redeem_proven: "A redeem was proven (T5)",
  capped_allowance_and_revoke_proven: "A capped allowance and a revoke were proven (T8)",
  polymarket_login_accepted: "Polymarket accepted the wallet's login (PM1)",
  polymarket_first_order_accepted: "A first Polymarket order was accepted and cancelled (PM2)",
  limitless_token_accepted: "Limitless accepted the stored token on a signed read (LM1)",
  limitless_first_order_accepted: "A first Limitless order was accepted and cancelled (LM2)",
  paybox_signs_typed_data_137: "PayBox signs typed data for chain 137 (PB3)",
  paybox_signs_typed_data_8453: "PayBox signs typed data for chain 8453 (PB4)",
});

// The relay's capability record uses its own ids (docs/phase1-gap-closing.md); these are the ones that mean the
// same thing as a page fact. The relay's answer is read as data: only an exact "yes" or "no" counts.
export const RELAY_FACT_TO_PAGE: Readonly<Record<string, readonly CapabilityId[]>> = Object.freeze({
  T1: ["door_a_bundler_admits_first_userop"],
  T2: ["door_b_orderbook_registers_account", "door_c_l1_clobauth_accepted"],
  T3a: ["door_d_orderbook_credits_usdce"],
  T3b: ["first_order_accepted_and_cancelled"],
  T4: ["withdraw_exit_proven"],
  T5: ["redeem_proven"],
  T8: ["capped_allowance_and_revoke_proven"],
  PB1: ["paybox_signs_raw_digest"],
  PB2: ["paybox_signs_typed_data_3223"],
  PB3: ["paybox_signs_typed_data_137"],
  PB4: ["paybox_signs_typed_data_8453"],
  PM1: ["polymarket_login_accepted"],
  PM2: ["polymarket_first_order_accepted"],
  LM1: ["limitless_token_accepted"],
  LM2: ["limitless_first_order_accepted"],
});

// The page's own record and the relay's, as one record. A fact is "yes" only when at least one source says yes and
// none says no; "no" from either source wins over a "yes" from the other.
export function mergeFacts(page: CapabilityFacts, relay: Readonly<Record<string, string>> | null): CapabilityFacts {
  const merged: Record<string, FactState> = { ...page };
  if (relay !== null) {
    const seen = new Map<CapabilityId, FactState[]>();
    for (const [relayId, pageIds] of Object.entries(RELAY_FACT_TO_PAGE)) {
      if (!Object.hasOwn(relay, relayId)) continue;
      const value = relay[relayId];
      if (value !== "yes" && value !== "no") continue;
      for (const id of pageIds) seen.set(id, [...(seen.get(id) ?? []), value]);
    }
    for (const id of CAPABILITY_IDS) {
      const states = [page[id], ...(seen.get(id) ?? [])];
      if (states.includes("no")) merged[id] = "no";
      else merged[id] = states.includes("yes") ? "yes" : "unknown";
    }
  }
  return Object.freeze(merged) as CapabilityFacts;
}

export interface FlagView {
  // The plugin's switches and the relay's, from the account read. null = not read.
  readonly plugin: Readonly<Record<string, boolean>> | null;
  readonly relay: Readonly<Record<string, boolean>> | null;
}

// A switch counts as ON only when BOTH the plugin and the relay say so (each side refuses on its own). Anything
// missing is not on.
export function flagIsOn(view: FlagView | null, flag: WriteFlag): boolean {
  if (view === null) return false;
  return view.plugin?.[flag] === true && view.relay?.[flag] === true;
}

export type GateReasonCode =
  | "no_owner"
  | "not_paired"
  | "account_unread"
  | "kill_switch"
  | "flag_off"
  | "unproven"
  | "dry_run_only";

export interface GateReason {
  readonly code: GateReasonCode;
  readonly text: string;
  readonly facts?: readonly CapabilityId[];
}

export interface GateInput {
  readonly hasOwner: boolean;
  readonly paired: boolean;
  readonly accountRead: boolean;
  readonly kill: boolean | null;
  readonly flags: FlagView | null;
  readonly facts: CapabilityFacts;
}

export interface Gate {
  // Prepare may be pressed.
  readonly canPrepare: boolean;
  // A prepared, vetted item may be handed to an agent.
  readonly canHandOff: boolean;
  readonly reasons: readonly GateReason[];
  // Facts the action depends on that are not "yes".
  readonly unprovenRequired: readonly CapabilityId[];
  // Facts the action's own live test settles that are not "yes" (shown, never blocking).
  readonly unprovenInforming: readonly CapabilityId[];
}

export function unprovenRequired(action: TradeAction, facts: CapabilityFacts): readonly CapabilityId[] {
  const needs = ACTION_NEEDS[action];
  const missing = needs.requires.filter((id) => !isProven(facts[id]));
  if (needs.requiresAny.length > 0 && !needs.requiresAny.some((id) => isProven(facts[id]))) missing.push(...needs.requiresAny);
  return missing;
}

export function gateFor(action: TradeAction, input: GateInput): Gate {
  const needs = ACTION_NEEDS[action];
  const reasons: GateReason[] = [];
  if (!input.hasOwner) reasons.push({ code: "no_owner", text: "Choose the owner address first." });
  if (!input.paired) reasons.push({ code: "not_paired", text: "This page is not paired with the Cockpit, so it can reach nothing." });
  if (input.paired && input.hasOwner && !input.accountRead) reasons.push({ code: "account_unread", text: "The account has not been read yet, so its switches and state are not known." });
  if (input.kill === true) reasons.push({ code: "kill_switch", text: "The kill switch is on: every write is disabled until the daemon restarts." });
  const common = reasons.length === 0;
  const flagOn = flagIsOn(input.flags, needs.flag);
  if (common && !flagOn) {
    reasons.push({
      code: needs.reservesBudget ? "flag_off" : "dry_run_only",
      text: needs.reservesBudget
        ? `${needs.flag} is off. The operator switches it on in the daemon's environment; this page cannot.`
        : `${needs.flag} is off, so a prepare is a dry run: it shows what would be signed and offers nothing to sign.`,
    });
  }
  const missing = unprovenRequired(action, input.facts);
  if (common && missing.length > 0) {
    reasons.push({ code: "unproven", text: "These are not recorded as proven, so nothing is handed to an agent for this action:", facts: missing });
  }
  const informing = needs.informs.filter((id) => !isProven(input.facts[id]));
  const canPrepare = common && (needs.reservesBudget ? flagOn && missing.length === 0 : true) && input.flags !== null;
  const canHandOff = common && flagOn && missing.length === 0;
  return { canPrepare, canHandOff, reasons, unprovenRequired: missing, unprovenInforming: informing };
}

// Cancelling an open order. It signs nothing and only reduces risk, but the agent sends it under the stored XO
// credentials, so it still waits for the trading switch and the usual common conditions. The facts it depends on
// are shown, never required: the first cancel IS the live test (T3b) that proves a cancel works.
export interface CancelGate {
  readonly canHandOff: boolean;
  readonly reasons: readonly GateReason[];
  readonly unprovenInforming: readonly CapabilityId[];
}

export function gateForCancel(input: GateInput): CancelGate {
  const reasons: GateReason[] = [];
  if (!input.hasOwner) reasons.push({ code: "no_owner", text: "Choose the owner address first." });
  if (!input.paired) reasons.push({ code: "not_paired", text: "This page is not paired with the Cockpit, so it can reach nothing." });
  if (input.paired && input.hasOwner && !input.accountRead) reasons.push({ code: "account_unread", text: "The account has not been read yet, so its switches and state are not known." });
  if (input.kill === true) reasons.push({ code: "kill_switch", text: "The kill switch is on: every write is disabled until the daemon restarts." });
  if (reasons.length === 0 && !flagIsOn(input.flags, "ENABLE_TRADING")) {
    reasons.push({ code: "flag_off", text: "ENABLE_TRADING is off, so the plugin would refuse a cancel. The operator switches it on in the daemon's environment; this page cannot." });
  }
  const informing = (["first_order_accepted_and_cancelled"] as const).filter((id) => !isProven(input.facts[id]));
  return { canHandOff: reasons.length === 0, reasons, unprovenInforming: informing };
}
