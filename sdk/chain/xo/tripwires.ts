// Tripwires: pure checks over data that reads.ts already collected. Each returns {tripped, unknown,
// reason, detail}; none reads the network, a clock or the environment, so every one is a plain table test.
//
// XO can change a lot without notice (paymaster policy, the exchange and the manager are upgradeable,
// the fee ceiling is an admin setting; docs/phase1-gap-closing.md XS1). A tripped wire means "go
// read-only and alert". An UNKNOWN wire (the data could not be read, or a read was incomplete) is
// reported as tripped too, with unknown: true, because every unknown fails closed. A caller that wants
// to treat "could not check" differently from "changed" reads `unknown`.
//
// `detail` is fixed text built here from constants; it never contains upstream text.

import { zeroAddress } from "viem";

import {
  EXCHANGE_IMPLEMENTATION,
  EXCHANGE_UPGRADE_TX,
  HYPERLANE_HOOK,
  HYPERLANE_ISM,
  HYPERLANE_MAILBOX,
  BASE_CHAIN_ID,
  BASE_ROUTER_IMPLEMENTATION,
  BASE_USDC,
  BASE_WARP_ROUTER,
  MANAGER_IMPLEMENTATION,
  MAX_FEE_RATE_BPS,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
  XO_ROUTE_IMPLEMENTATION,
  XO_WARP_ROUTE,
  type Address,
} from "./constants.js";
import {
  padAddressTopic,
  type LogListRead,
  type MaxFeeRateUpdatedLog,
  type NonceIncrementedLog,
  type PaymasterReading,
  type RoutePairingReading,
  type RouteSideReading,
  type UpgradedLog,
} from "./reads.js";

export type TripwireName = "paymaster" | "exchange_upgrade" | "manager_implementation" | "fee_ceiling" | "maker_nonce" | "route_pairing";

export type TripwireReason =
  | "paymaster_paused"
  | "paymaster_policy_changed"
  | "exchange_upgraded"
  | "manager_implementation_changed"
  | "fee_ceiling_raised"
  | "nonce_incremented"
  | "route_pairing_mismatch"
  | "unreadable"; // the data needed to decide was missing or incomplete

export interface TripwireResult {
  readonly name: TripwireName;
  // True for a positive finding AND for "could not verify". Use `unknown` to tell them apart.
  readonly tripped: boolean;
  readonly unknown: boolean;
  readonly reason: TripwireReason | null;
  readonly detail: string;
  // Fixed labels that say what changed (for example the policy probes that differ).
  readonly notes: readonly string[];
}

function clear(name: TripwireName, detail: string): TripwireResult {
  return { name, tripped: false, unknown: false, reason: null, detail, notes: [] };
}

function fired(name: TripwireName, reason: TripwireReason, detail: string, notes: readonly string[] = []): TripwireResult {
  return { name, tripped: true, unknown: false, reason, detail, notes };
}

function unreadable(name: TripwireName, detail: string, notes: readonly string[] = []): TripwireResult {
  return { name, tripped: true, unknown: true, reason: "unreadable", detail, notes };
}

function eq(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

// ---- paymaster ---------------------------------------------------------------------------------

// Paused, or any probe that differs from the 2026-10-18 policy (narrowed or widened: the owner edited
// the allowlist, which is the signal). A probe or the pause flag that could not be read is unknown.
export function paymasterTripwire(reading: PaymasterReading | null): TripwireResult {
  const name = "paymaster";
  if (reading === null) return unreadable(name, "The paymaster policy could not be read, so sponsorship is not trusted.");
  if (reading.paused === true) return fired(name, "paymaster_paused", "The XO paymaster is paused; sponsored operations will fail.");
  const changed = reading.probes.filter((probe) => probe.allowed !== null && probe.allowed !== probe.expectedAllowed);
  if (changed.length > 0) {
    return fired(name, "paymaster_policy_changed", "The XO paymaster policy differs from the pinned observation.", changed.map((probe) => `${probe.allowed === true ? "now_allowed" : "now_refused"}:${probe.label}`));
  }
  const missing = reading.probes.filter((probe) => probe.allowed === null).map((probe) => `unread:${probe.label}`);
  if (reading.paused === null || missing.length > 0) {
    return unreadable(name, "Part of the paymaster policy could not be read.", reading.paused === null ? ["unread:paused"].concat(missing) : missing);
  }
  return clear(name, "The paymaster is not paused and every probed selector matches the pinned observation.");
}

// ---- exchange upgrade --------------------------------------------------------------------------

export interface ExchangeUpgradeInput {
  // Upgraded logs for the exchange proxy (reads.ts readExchangeUpgrades); null when the read failed.
  readonly upgrades: LogListRead<UpgradedLog> | null;
  // The EIP-1967 implementation slot by RPC, when an RPC answered; null or absent when not read.
  readonly implementationSlot?: Address | null;
}

// A second Upgraded log freezes trading. So does a lone log that names another implementation or
// another transaction, and so does a slot that names another implementation.
export function exchangeUpgradeTripwire(input: ExchangeUpgradeInput): TripwireResult {
  const name = "exchange_upgrade";
  const logs = input.upgrades?.logs ?? [];
  if (logs.length >= 2) return fired(name, "exchange_upgraded", "The exchange proxy has been upgraded again.", [`upgraded_logs:${logs.length}`]);
  const only = logs[0];
  if (only !== undefined) {
    if (!eq(only.implementation, EXCHANGE_IMPLEMENTATION)) {
      return fired(name, "exchange_upgraded", "The exchange proxy points at a different implementation than the pinned one.");
    }
    if (only.transactionHash !== null && !eq(only.transactionHash, EXCHANGE_UPGRADE_TX)) {
      return fired(name, "exchange_upgraded", "The exchange upgrade log is not the one that was verified.");
    }
  }
  const slot = input.implementationSlot;
  if (slot !== undefined && slot !== null && !eq(slot, EXCHANGE_IMPLEMENTATION)) {
    return fired(name, "exchange_upgraded", "The exchange implementation slot differs from the pinned implementation.");
  }
  const logsConfirm = input.upgrades !== null && input.upgrades.complete && logs.length === 1;
  const slotConfirms = slot !== undefined && slot !== null && eq(slot, EXCHANGE_IMPLEMENTATION);
  if (logsConfirm || slotConfirms) return clear(name, "The exchange still runs the pinned implementation.");
  return unreadable(name, "The exchange upgrade history could not be confirmed.");
}

// ---- manager implementation --------------------------------------------------------------------

export interface ManagerImplementationInput {
  readonly implementationSlot?: Address | null;
  // Upgraded logs for the manager proxy; the latest one names the current implementation.
  readonly upgrades?: LogListRead<UpgradedLog> | null;
}

export function managerImplementationTripwire(input: ManagerImplementationInput): TripwireResult {
  const name = "manager_implementation";
  const slot = input.implementationSlot;
  if (slot !== undefined && slot !== null) {
    return eq(slot, MANAGER_IMPLEMENTATION)
      ? clear(name, "The market manager still runs the pinned implementation.")
      : fired(name, "manager_implementation_changed", "The market manager implementation slot differs from the pinned implementation.");
  }
  const upgrades = input.upgrades;
  const latest = upgrades?.logs[upgrades.logs.length - 1];
  if (latest !== undefined && !eq(latest.implementation, MANAGER_IMPLEMENTATION)) {
    return fired(name, "manager_implementation_changed", "The latest market manager upgrade names a different implementation.");
  }
  if (upgrades !== null && upgrades !== undefined && upgrades.complete && latest !== undefined) {
    return clear(name, "The latest market manager upgrade names the pinned implementation.");
  }
  return unreadable(name, "The market manager implementation could not be confirmed.");
}

// ---- fee ceiling -------------------------------------------------------------------------------

export interface FeeCeilingInput {
  readonly updates: LogListRead<MaxFeeRateUpdatedLog> | null;
}

// MaxFeeRateUpdated above 800 bps. The current value is the latest log's; an incomplete read that has
// already seen a value above the bound trips regardless of order. (A value above the contract's own
// hard ceiling of 1,000 is above 800 too, so it trips.)
export function feeCeilingTripwire(input: FeeCeilingInput): TripwireResult {
  const name = "fee_ceiling";
  if (input.updates === null) return unreadable(name, "The fee ceiling history could not be read.");
  const { logs, complete } = input.updates;
  const bound = BigInt(MAX_FEE_RATE_BPS);
  const latest = logs[logs.length - 1];
  const aboveNow = latest !== undefined && latest.next > bound;
  const aboveSeen = !complete && logs.some((log) => log.next > bound);
  if (aboveNow || aboveSeen) {
    return fired(name, "fee_ceiling_raised", "The exchange fee ceiling is above the pinned 800 bps bound.", [`latest_bps:${latest?.next.toString() ?? "unknown"}`]);
  }
  if (!complete) return unreadable(name, "The fee ceiling history is incomplete.");
  return clear(name, "The exchange fee ceiling is at or below the pinned 800 bps bound.");
}

// ---- maker nonce -------------------------------------------------------------------------------

export interface MakerNonceInput {
  readonly maker: Address;
  readonly increments: LogListRead<NonceIncrementedLog> | null;
  // nonces(maker) by RPC when an RPC answered; null or absent when not read.
  readonly onChainNonce?: bigint | null;
}

// Any NonceIncremented log for the maker means the counter moved off 0 and every order signed at
// nonce 0 is dead (or the admin cancelled them on purpose). Logs are re-filtered by maker here, so a
// server that ignored the topic filter can neither trip nor clear this wire.
export function makerNonceTripwire(input: MakerNonceInput): TripwireResult {
  const name = "maker_nonce";
  const ours = (input.increments?.logs ?? []).filter((log) => eq(log.maker, input.maker));
  if (ours.length > 0) {
    return fired(name, "nonce_incremented", "The exchange nonce for this account has been incremented.", [`increments:${ours.length}`]);
  }
  const rpcNonce = input.onChainNonce;
  if (rpcNonce !== undefined && rpcNonce !== null) {
    return rpcNonce === 0n
      ? clear(name, "The exchange nonce for this account is 0.")
      : fired(name, "nonce_incremented", "The exchange nonce for this account is not 0.", [`nonce:${rpcNonce.toString()}`]);
  }
  if (input.increments !== null && input.increments.complete) return clear(name, "No NonceIncremented log exists for this account.");
  return unreadable(name, "The exchange nonce for this account could not be confirmed.");
}

// ---- route pairing -----------------------------------------------------------------------------

export interface RoutePairingOptions {
  // When true, an XO-side reading must be present and correct. Default false: the XO RPC is optional
  // and the funding preflight only needs the Base side.
  readonly requireXoSide?: boolean;
}

function side(label: string, reading: RouteSideReading, expected: {
  token: Address;
  remoteRouter: Address;
  implementation: Address;
  localDomain: number;
}): { mismatches: string[]; missing: string[] } {
  const mismatches: string[] = [];
  const missing: string[] = [];
  const check = (field: string, actual: string | number | null, want: string | number): void => {
    if (actual === null) missing.push(`${label}.${field}`);
    else if (String(actual).toLowerCase() !== String(want).toLowerCase()) mismatches.push(`${label}.${field}`);
  };
  check("token", reading.token, expected.token);
  check("remoteRouter", reading.remoteRouter, padAddressTopic(expected.remoteRouter));
  check("mailbox", reading.mailbox, HYPERLANE_MAILBOX);
  check("ism", reading.ism, HYPERLANE_ISM);
  check("localDomain", reading.localDomain, expected.localDomain);
  check("implementation", reading.implementation, expected.implementation);
  check("defaultHook", reading.defaultHook, HYPERLANE_HOOK);
  check("requiredHook", reading.requiredHook, HYPERLANE_HOOK);
  return { mismatches, missing };
}

// The funding preflight (FU1): every pinned property of the route pair must read back exactly, and the
// Base quote for the amount must be [(0x0, 0), (USDC, amount), (USDC, 0)]: no native gas, no fee.
export function routePairingTripwire(reading: RoutePairingReading, options: RoutePairingOptions = {}): TripwireResult {
  const name = "route_pairing";
  const mismatches: string[] = [];
  const missing: string[] = [];
  const base = side("base", reading.base, {
    token: BASE_USDC,
    remoteRouter: XO_WARP_ROUTE,
    implementation: BASE_ROUTER_IMPLEMENTATION,
    localDomain: BASE_CHAIN_ID,
  });
  mismatches.push(...base.mismatches);
  missing.push(...base.missing);

  const quote = reading.baseQuote;
  if (quote === null) missing.push("base.quote");
  else {
    const zero = zeroAddress;
    const [native, token, fee] = quote;
    const exact =
      quote.length === 3 &&
      native !== undefined &&
      token !== undefined &&
      fee !== undefined &&
      eq(native.token, zero) &&
      native.amount === 0n &&
      eq(token.token, BASE_USDC) &&
      token.amount === reading.amount &&
      eq(fee.token, BASE_USDC) &&
      fee.amount === 0n;
    if (!exact) mismatches.push("base.quote");
  }

  if (reading.xo !== null) {
    const xo = side("xo", reading.xo, {
      token: USDC_E_ADDRESS,
      remoteRouter: BASE_WARP_ROUTER,
      implementation: XO_ROUTE_IMPLEMENTATION,
      localDomain: XO_CHAIN_ID,
    });
    mismatches.push(...xo.mismatches);
    missing.push(...xo.missing);
  } else if (options.requireXoSide === true) {
    missing.push("xo.*");
  }

  if (mismatches.length > 0) {
    return fired(name, "route_pairing_mismatch", "The Base and XO warp routes do not match the pinned pairing.", mismatches.map((m) => `mismatch:${m}`));
  }
  if (missing.length > 0) return unreadable(name, "Part of the route pairing could not be read.", missing.map((m) => `unread:${m}`));
  return clear(name, "The warp route pairing matches every pinned property.");
}

// ---- aggregate ---------------------------------------------------------------------------------

export interface TripwireSummary {
  readonly tripped: boolean;
  readonly results: readonly TripwireResult[];
  // The first positive finding, if any (an unknown never outranks a real change).
  readonly firstReason: TripwireReason | null;
}

export function summarizeTripwires(results: readonly TripwireResult[]): TripwireSummary {
  const real = results.find((result) => result.tripped && !result.unknown);
  const first = results.find((result) => result.tripped);
  return { tripped: first !== undefined, results, firstReason: (real ?? first)?.reason ?? null };
}
