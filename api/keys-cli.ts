import { issueKey, isKeyTier, KeyIssueError, TIER_ROUTES } from "./keys.js";
import { KEY_TIERS, type MeteringStore } from "./metering-store.js";

// The operator's key commands (docs/sdk-and-api-design.md section 4, subscription keys). Run on the API's host against its
// data directory; main.ts dispatches `node api.mjs keys ...` here with the store opened. No endpoint issues or lists keys.
//
//   keys issue --label <text> --tier quote|full [--per-minute N] [--burst N] [--days N]
//       prints the new key ONCE; only its sha256 is stored
//   keys list
//       id, label, tier, limits, issued, expires, revoked (never a key or a hash)
//   keys revoke <id>
//       refused from the next request on

export const KEYS_USAGE = `keys issue --label <text> --tier ${KEY_TIERS.join("|")} [--per-minute N] [--burst N] [--days N]
keys list
keys revoke <id>

Tiers: ${KEY_TIERS.map((tier) => `${tier} (${TIER_ROUTES[tier].join(", ")})`).join("; ")}.`;

export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

function flags(args: readonly string[]): Map<string, string> | null {
  const out = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (name === undefined || !name.startsWith("--") || value === undefined || out.has(name)) return null;
    out.set(name, value);
  }
  return out;
}

function whole(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined;
  return /^[1-9][0-9]{0,6}$/.test(value) ? Number(value) : null;
}

const iso = (ms: number | null): string => (ms === null ? "-" : new Date(ms).toISOString());

// Returns the process exit code.
export function runKeysCli(store: MeteringStore, args: readonly string[], nowMs: number, io: CliIo): number {
  const [command, ...rest] = args;
  if (command === "issue") {
    const parsed = flags(rest);
    const allowed = new Set(["--label", "--tier", "--per-minute", "--burst", "--days"]);
    if (parsed === null || [...parsed.keys()].some((name) => !allowed.has(name))) {
      io.err(KEYS_USAGE);
      return 2;
    }
    const label = parsed.get("--label");
    const tier = parsed.get("--tier");
    const perMinute = whole(parsed.get("--per-minute"));
    const burst = whole(parsed.get("--burst"));
    const days = whole(parsed.get("--days"));
    if (label === undefined || !isKeyTier(tier) || perMinute === null || burst === null || days === null) {
      io.err(KEYS_USAGE);
      return 2;
    }
    try {
      const { key, row } = issueKey(store, { label, tier, ...(perMinute === undefined ? {} : { perMinute }), ...(burst === undefined ? {} : { burst }), ...(days === undefined ? {} : { days }) }, nowMs);
      io.out(`id ${row.id}  tier ${row.tier}  ${row.perMinute}/min, burst ${row.burst}  expires ${iso(row.expiresMs)}`);
      io.out(`key ${key}`);
      io.out("This key is shown once and is not stored; hand it over now. Send it as: Authorization: Bearer <key>");
      return 0;
    } catch (error) {
      io.err(error instanceof KeyIssueError ? `not issued: ${error.message}` : "not issued: the store refused the write");
      return 1;
    }
  }
  if (command === "list" && rest.length === 0) {
    const rows = store.keys();
    if (rows.length === 0) io.out("no keys");
    for (const row of rows) {
      io.out(`${row.id}  ${row.tier}  ${row.perMinute}/min burst ${row.burst}  issued ${iso(row.createdMs)}  expires ${iso(row.expiresMs)}  revoked ${iso(row.revokedMs)}  ${JSON.stringify(row.label)}`);
    }
    return 0;
  }
  if (command === "revoke" && rest.length === 1 && /^[0-9a-f]{12}$/.test(rest[0] as string)) {
    if (store.revokeKey(rest[0] as string, nowMs)) {
      io.out(`revoked ${rest[0]}`);
      return 0;
    }
    io.err("no such key, or it was already revoked");
    return 1;
  }
  io.err(KEYS_USAGE);
  return 2;
}
