import type { AccountState } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { FLAG_NAMES, type Flags } from "../src/relay/flags.js";
import { isoSecondOf } from "./audit.js";
import { NAMESPACES } from "./store.js";
import { RELAY_VERSION } from "./config.js";
import type { RouteTable } from "./types.js";

// GET /v1/health and POST /v1/account/status (docs/phase1-gap-closing.md section 9 A5: "/health,
// per-host error counters and tripwire state appear in account status").
//
// Health shows the effective flags, the tripwire state and the per-host upstream counters, and
// nothing that is secret: no key, no URL, no path.
//
// The account half of the status (what state the account is in, whether it is registered, whether
// trading is enabled, the balance) comes from chain and registry reads that belong to the
// chain-account stream; they arrive through the `accounts` service so this module does not depend on
// them. Until one is wired, the route answers `not_implemented`.

export interface AccountReading {
  readonly state: AccountState;
  readonly registered: boolean;
  readonly trading_enabled: "unknown" | "yes" | "no";
  // USD with up to 6 places, or null when the balance could not be read.
  readonly balance_usd: string | null;
}

export interface AccountDirectory {
  // Pure: the account is a function of the owner. Throws on an invalid owner.
  derive(owner: string): string;
  read(owner: string, account: string, options: { readonly signal: AbortSignal }): Promise<AccountReading>;
}

// Facts a status call reports, so the agent can say what is proven and what is not.
export const STATUS_CAPABILITY_IDS = ["AD4", "AD5", "AU2", "AU6", "OR3", "OR6", "UO7", "UO9", "FU6", "FU7", "FU9", "CR4"] as const;

const CREDENTIAL_STATES = ["none", "stored", "validated", "failed"] as const;
type CredentialState = (typeof CREDENTIAL_STATES)[number];

// The credential stream records its status under NAMESPACES.credentialStatus, key = the lower-case
// account, value { state, key_tag }. Anything else reads as "none".
function credentialStatus(read: (ns: string, key: string) => unknown, account: string): { state: CredentialState; key_tag: string | null } {
  const stored = read(NAMESPACES.credentialStatus, account.toLowerCase());
  if (typeof stored !== "object" || stored === null) return { state: "none", key_tag: null };
  const record = stored as { state?: unknown; key_tag?: unknown };
  const state = (CREDENTIAL_STATES as readonly unknown[]).includes(record.state) ? (record.state as CredentialState) : "none";
  const tag = typeof record.key_tag === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(record.key_tag) ? record.key_tag : null;
  return { state, key_tag: tag };
}

export function flagsSnapshot(flags: Flags): Record<(typeof FLAG_NAMES)[number], boolean> {
  return Object.fromEntries(FLAG_NAMES.map((name) => [name, flags[name] === true])) as Record<(typeof FLAG_NAMES)[number], boolean>;
}

export const routes: RouteTable = {
  "GET /v1/health": async (_params, context) => {
    const flags = context.flags();
    const tripwires = context.services.tripwires?.snapshot() ?? { ok: true, tripped: [] };
    const upstream = context.services.upstream?.health() ?? {};
    const upstreamOk = Object.values(upstream).every((host) => host.state === "ok");
    const auditOk = context.services.audit?.healthy() ?? true;
    const status = flags.KILL ? "kill_switch" : tripwires.ok && upstreamOk && auditOk ? "ok" : "degraded";
    return {
      status,
      version: RELAY_VERSION,
      time: isoSecondOf(context.now()),
      kill: flags.KILL === true,
      flags: flagsSnapshot(flags),
      tripwires: { ok: tripwires.ok, tripped: tripwires.tripped.map((entry) => ({ ...entry })) },
      upstream,
    };
  },

  "POST /v1/account/status": async (body, context) => {
    const accounts = context.services.accounts;
    if (accounts === undefined) {
      throw new RelayError("not_implemented", "Account reads are not wired into this relay build yet.");
    }
    const account = accounts.derive(body.owner);
    // Invariant 1: a caller-supplied account that differs from the derived one is an error.
    if (body.account !== undefined && body.account.toLowerCase() !== account.toLowerCase()) {
      throw new RelayError("account_mismatch", "The account does not belong to this owner. The relay derives it from the owner.");
    }
    const reading = await accounts.read(body.owner, account, { signal: context.signal });
    const state = context.services.state;
    const flags = context.flags();
    const tripwires = context.services.tripwires?.snapshot() ?? { ok: true, tripped: [] };
    return {
      account,
      state: reading.state,
      registered: reading.registered,
      trading_enabled: reading.trading_enabled,
      balance_usd: reading.balance_usd,
      credentials: credentialStatus((ns, key) => state?.get(ns, key), account),
      flags: flagsSnapshot(flags),
      tripwires: { ok: tripwires.ok, tripped: tripwires.tripped.map((entry) => ({ ...entry })) },
      capabilities: context.services.capabilities?.snapshot(STATUS_CAPABILITY_IDS) ?? {},
      upstream: context.services.upstream?.health() ?? {},
    };
  },
};

declare module "./types.js" {
  interface RelayServices {
    readonly accounts?: AccountDirectory;
  }
}
