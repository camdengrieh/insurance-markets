import { RelayError } from "./errors.js";

// Feature flags for every write path (docs/phase1-gap-closing.md sections 4, 5.7 and 8 row D8).
//
// Rules, each with a test:
//   - every flag defaults OFF;
//   - a value that is not a recognised word means OFF (and is reported, without the raw value);
//   - KILL is the software kill switch and overrides everything. Because "OFF" is the unsafe
//     direction for a kill switch, an unrecognised KILL value means ON, like XO_KILL_SWITCH in
//     src/config.ts;
//   - a flag flips only through the environment of whoever runs the relay. Nothing the agent or a
//     market says can turn one on.
//
// No imports of node:* and no process.env default: the caller passes the environment in.

export const FLAG_NAMES = [
  "ENABLE_USEROP_SUBMIT",
  "ENABLE_TRADING",
  "ENABLE_FUNDING",
  "ENABLE_WITHDRAW",
  "XO_ENABLE_CREATE",
  "ENABLE_SELF_HOSTED_METADATA",
  // The two CLOB venues besides XO (relay/clob.ts): preparing and sending orders, and minting credentials.
  "ENABLE_CLOB_POLYMARKET",
  "ENABLE_CLOB_LIMITLESS",
  "KILL",
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];
// Every flag except the kill switch gates one write path.
export type WriteFlagName = Exclude<FlagName, "KILL">;
export type Flags = Readonly<Record<FlagName, boolean>>;
export type FlagEnv = Readonly<Record<string, string | undefined>>;

// The plugin already reads this name (src/config.ts ENV.killSwitch). The relay honours it too, so
// one variable stops both.
export const KILL_ENV_ALIAS = "XO_KILL_SWITCH";

export const ALL_FLAGS_OFF: Flags = Object.freeze({
  ENABLE_USEROP_SUBMIT: false,
  ENABLE_TRADING: false,
  ENABLE_FUNDING: false,
  ENABLE_WITHDRAW: false,
  XO_ENABLE_CREATE: false,
  ENABLE_SELF_HOSTED_METADATA: false,
  ENABLE_CLOB_POLYMARKET: false,
  ENABLE_CLOB_LIMITLESS: false,
  KILL: false,
});

export interface FlagIssue {
  readonly variable: string;
  // Never contains the raw value: a mis-set variable could hold something secret.
  readonly message: string;
}

export interface ParsedFlags {
  readonly flags: Flags;
  readonly issues: readonly FlagIssue[];
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

type Word = "on" | "off" | "unset" | "garbage";

function wordOf(env: FlagEnv, name: string): Word {
  const raw = env[name];
  if (typeof raw !== "string") return "unset";
  const word = raw.trim().toLowerCase();
  if (word === "") return "unset";
  if (TRUTHY.has(word)) return "on";
  if (FALSY.has(word)) return "off";
  return "garbage";
}

// Never throws. An unreadable environment (a hostile proxy, say) turns the kill switch ON.
export function parseFlags(env: FlagEnv): ParsedFlags {
  try {
    const issues: FlagIssue[] = [];
    const values: Record<FlagName, boolean> = { ...ALL_FLAGS_OFF };

    for (const name of FLAG_NAMES) {
      if (name === "KILL") continue;
      const word = wordOf(env, name);
      values[name] = word === "on";
      if (word === "garbage") {
        issues.push({ variable: name, message: `${name} was not a recognised word; treating it as OFF.` });
      }
    }

    // Either variable turns the kill switch on; a garbage value does too.
    let kill = false;
    for (const name of ["KILL", KILL_ENV_ALIAS]) {
      const word = wordOf(env, name);
      if (word === "on") kill = true;
      if (word === "garbage") {
        kill = true;
        issues.push({ variable: name, message: `${name} was not a recognised word; treating it as ON (writes disabled).` });
      }
    }
    values.KILL = kill;

    return { flags: Object.freeze(values), issues };
  } catch {
    return {
      flags: Object.freeze({ ...ALL_FLAGS_OFF, KILL: true }),
      issues: [{ variable: "*", message: "The environment could not be read; the kill switch is ON." }],
    };
  }
}

// True only when the flag is on AND the kill switch is off. KILL itself reports its own state.
export function isEnabled(flags: Flags, name: FlagName): boolean {
  if (name === "KILL") return flags.KILL === true;
  return flags.KILL !== true && flags[name] === true;
}

// Throws the refusal a handler returns when a write path is not switched on. With the kill switch
// on the code is `kill_switch`, otherwise `flag_off`. Any flag object that is malformed (a missing
// key, a non-boolean) counts as off.
export function requireFlag(flags: Flags, name: WriteFlagName): void {
  if (flags.KILL !== false) {
    throw new RelayError("kill_switch", "The kill switch is on: every write is disabled. Reads still work.", {
      flag: name,
    });
  }
  if (flags[name] !== true) {
    throw new RelayError("flag_off", `${name} is off. The operator has to switch this write path on.`, { flag: name });
  }
}
