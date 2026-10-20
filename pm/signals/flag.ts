// Feature flag for the Quotient helpers. Default OFF (aggregation-design D4): the adapter ships
// behind a build flag until the legal read of Quotient's terms is done. The flag is read from an
// injected env object, never from process.env directly, so tests and callers control it.

import { QUOTIENT_CLAUSE } from "./constants.js";

export const QUOTIENT_FLAG = "PM_QUOTIENT";

export interface FlagContext {
  readonly enabled: boolean;
}

export type EnvLike = Readonly<Record<string, string | undefined>>;

// Only an explicit "1", "true" or "on" enables it. Anything else, including unset, is OFF.
export function quotientEnabled(env: EnvLike): boolean {
  const raw = env[QUOTIENT_FLAG];
  if (raw === undefined) return false;
  return ["1", "true", "on"].includes(raw.trim().toLowerCase());
}

export interface FlagOff {
  readonly ok: false;
  readonly error: "FLAG_OFF";
  readonly detail: string;
  readonly flag: typeof QUOTIENT_FLAG;
  readonly clause: string;
}

export function flagOff(): FlagOff {
  return {
    ok: false,
    error: "FLAG_OFF",
    detail:
      `Quotient helpers are off by default. Set ${QUOTIENT_FLAG}=1 only after reading the clause below; ` +
      "this is a per-user, agent-paid pass-through, never a shared service.",
    flag: QUOTIENT_FLAG,
    clause: QUOTIENT_CLAUSE,
  };
}
