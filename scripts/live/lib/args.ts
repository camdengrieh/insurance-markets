import { getAddress, isAddress, type Address } from "viem";

import type { FlagDef, Options, TargetName } from "./types.js";

// Command-line parsing for the live kit. Strict on purpose: an unknown flag, a repeated flag, a missing
// value or a malformed value is a refusal (nothing runs), never a guess.

export const COMMON_FLAGS: readonly FlagDef[] = Object.freeze([
  { name: "target", kind: "string", help: "mock (a local rehearsal, nothing leaves this machine) or live (the real services). Default mock.", defaultValue: "mock" },
  { name: "confirm", kind: "bool", help: "Required to run. Without it the script prints its plan and does nothing." },
  { name: "dry-run", kind: "bool", help: "Print the plan and stop (the default when --confirm is absent)." },
  { name: "budget-usd", kind: "usd", help: "The most USD this run may put at risk at once. Required; never above the worst case in docs/runbook.md." },
  { name: "owner", kind: "address", help: "The EVM address of the PayBox credential that owns the XO account. Required on the live target." },
  { name: "credential-id", kind: "string", help: "The PayBox credential_id, shown in the request_wallet_sign arguments the script prints." },
  { name: "data-dir", kind: "string", help: "The relay's data directory (where capability facts and credentials live). Required on the live target." },
  { name: "mock-profile", kind: "string", help: "Mock target only: optimistic (default) or pessimistic.", defaultValue: "optimistic" },
  { name: "mock-owner-index", kind: "int", help: "Mock target only: which public Anvil test account owns the XO account, 0 to 9. Default 0." },
  { name: "mock-set", kind: "list", help: "Mock target only: a switch value, name=value (repeatable), applied on top of the profile." },
  { name: "record-text", kind: "string", help: "The confirmation text that records this run's facts (otherwise you are asked). Exactly: RECORD <test>=<verdict>." },
  { name: "no-record", kind: "bool", help: "Do not record any capability fact." },
  { name: "help", kind: "bool", help: "Show this text." },
]);

const KINDS: Readonly<Record<string, { test(value: string): boolean; describe: string }>> = {
  usd: { test: (value) => /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(value), describe: "a decimal amount in USD such as 3 or 0.54" },
  address: { test: (value) => /^0x[0-9a-fA-F]{40}$/.test(value) && isAddress(value, { strict: true }), describe: "a 0x address with a correct checksum (or all one case)" },
  hex32: { test: (value) => /^0x[0-9a-fA-F]{64}$/.test(value), describe: "a 32-byte 0x hex value" },
  int: { test: (value) => /^[0-9]{1,9}$/.test(value), describe: "a whole number" },
  decimal: { test: (value) => /^(0|[1-9][0-9]{0,77})$/.test(value), describe: "a decimal number" },
  url: { test: (value) => /^https:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/.test(value), describe: "an https URL with no credentials, query or fragment" },
  string: { test: (value) => value.length > 0 && value.length <= 2048, describe: "a non-empty string" },
  list: { test: (value) => value.length > 0 && value.length <= 2048, describe: "a non-empty string" },
};

export type ParsedArgs = { readonly ok: true; readonly opts: Options } | { readonly ok: false; readonly error: string };

export function allFlags(extra: readonly FlagDef[]): readonly FlagDef[] {
  const names = new Set(COMMON_FLAGS.map((flag) => flag.name));
  for (const flag of extra) {
    if (names.has(flag.name)) throw new Error(`flag ${flag.name} is defined twice`);
    names.add(flag.name);
  }
  return [...COMMON_FLAGS, ...extra];
}

export function parseArgs(argv: readonly string[], extra: readonly FlagDef[]): ParsedArgs {
  const defs = new Map(allFlags(extra).map((flag) => [flag.name, flag]));
  const seen = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!token.startsWith("--") || token.length <= 2) return { ok: false, error: `unexpected argument "${printable(token)}": every option starts with --` };
    const eq = token.indexOf("=");
    const name = token.slice(2, eq === -1 ? undefined : eq);
    const def = defs.get(name);
    if (def === undefined) return { ok: false, error: `unknown option --${printable(name)}` };
    let value: string;
    if (def.kind === "bool") {
      if (eq !== -1) return { ok: false, error: `--${name} takes no value` };
      value = "true";
    } else if (eq !== -1) {
      value = token.slice(eq + 1);
    } else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) return { ok: false, error: `--${name} needs a value` };
      value = next;
      index += 1;
    }
    const existing = seen.get(name);
    if (existing !== undefined && def.kind !== "list") return { ok: false, error: `--${name} was given twice` };
    seen.set(name, [...(existing ?? []), value]);
  }

  const get = (name: string): string | undefined => seen.get(name)?.[0];
  for (const [name, values] of seen) {
    const def = defs.get(name) as FlagDef;
    const kind = KINDS[def.kind];
    if (def.kind === "bool") continue;
    for (const value of values) {
      if (kind !== undefined && !kind.test(value)) return { ok: false, error: `--${name} must be ${kind.describe}` };
    }
  }

  const target = get("target") ?? "mock";
  if (target !== "mock" && target !== "live") return { ok: false, error: "--target must be mock or live" };
  const profile = get("mock-profile") ?? "optimistic";
  if (profile !== "optimistic" && profile !== "pessimistic") return { ok: false, error: "--mock-profile must be optimistic or pessimistic" };
  const mockSet = seen.get("mock-set") ?? [];
  for (const entry of mockSet) {
    if (!/^[a-z0-9_.]+=[A-Za-z0-9_.:-]+$/.test(entry)) return { ok: false, error: "--mock-set takes name=value, such as bundler.foreign_account=reject" };
  }
  if (target === "live" && (get("mock-profile") !== undefined || mockSet.length > 0 || get("mock-owner-index") !== undefined)) {
    return { ok: false, error: "--mock-profile, --mock-set and --mock-owner-index belong to the mock target only" };
  }
  const mockOwnerIndex = Number(get("mock-owner-index") ?? "0");
  if (!Number.isInteger(mockOwnerIndex) || mockOwnerIndex < 0 || mockOwnerIndex > 9) return { ok: false, error: "--mock-owner-index must be 0 to 9" };

  const extraValues: Record<string, string | boolean | readonly string[]> = {};
  for (const def of extra) {
    const given = seen.get(def.name);
    if (given === undefined) {
      if (def.defaultValue !== undefined) extraValues[def.name] = def.defaultValue;
      continue;
    }
    extraValues[def.name] = def.kind === "bool" ? true : def.kind === "list" ? given : (given[0] as string);
  }

  const ownerRaw = get("owner");
  const owner = ownerRaw === undefined ? undefined : (getAddress(ownerRaw.toLowerCase()) as Address);
  const opts: Options = {
    target: target as TargetName,
    confirm: seen.has("confirm"),
    dryRun: seen.has("dry-run"),
    budgetUsd: get("budget-usd"),
    owner,
    credentialId: get("credential-id"),
    dataDir: get("data-dir"),
    mockProfile: profile,
    mockSet,
    mockOwnerIndex,
    recordText: get("record-text"),
    noRecord: seen.has("no-record"),
    help: seen.has("help"),
    extra: extraValues,
  };
  return { ok: true, opts };
}

function printable(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?").slice(0, 60);
}

export function usageText(scriptName: string, title: string, extra: readonly FlagDef[]): string {
  const lines = [`${title}`, "", `Usage: tsx scripts/live/${scriptName}.ts [options]`, "", "Options:"];
  for (const flag of allFlags(extra)) {
    const arg = flag.kind === "bool" ? "" : ` <${flag.kind}>`;
    lines.push(`  --${flag.name}${arg}`.padEnd(30) + flag.help + (flag.required === true ? " (required)" : ""));
  }
  lines.push("", "Without --confirm the script prints its plan and does nothing.");
  return lines.join("\n");
}

export function extraString(opts: Options, name: string): string | undefined {
  const value = opts.extra[name];
  return typeof value === "string" ? value : undefined;
}

export function extraBool(opts: Options, name: string): boolean {
  return opts.extra[name] === true;
}

export function extraList(opts: Options, name: string): readonly string[] {
  const value = opts.extra[name];
  return Array.isArray(value) ? (value as readonly string[]) : [];
}
