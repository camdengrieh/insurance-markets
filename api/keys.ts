import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { RateLimitSpec } from "./config.js";
import { KEY_TIERS, type KeyRow, type KeyTier, type MeteringStore } from "./metering-store.js";

// Subscription keys (docs/sdk-and-api-design.md section 4: "for the dApp and for heavy users, checked before the handler
// runs"). Issued by the operator CLI (keys-cli.ts), never by an endpoint.
//
//   - A key is `imk_<id>_<secret>`: a 12-hex public id (what the CLI lists and revokes by) and 32 random bytes in base64url.
//     It is printed once, at issue; the store keeps only the sha256 of the whole key.
//   - It arrives in `Authorization: Bearer <key>` only (never a query parameter, a cookie or another header).
//   - The check is constant-time over the hashes: an unknown id is compared against a fixed hash of the same length, so
//     the time does not tell an unknown id from a wrong secret.
//   - A key carries its tier (which paid endpoints it opens) and its own rate limit; a revoked or expired key is refused.

export const KEY_PATTERN = /^imk_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

// Which paid routes each tier opens.
export const TIER_ROUTES: Readonly<Record<KeyTier, readonly PaidRoute[]>> = Object.freeze({
  quote: Object.freeze(["quote"] as const),
  full: Object.freeze(["quote", "route_prepare"] as const),
});

export type PaidRoute = "quote" | "route_prepare";

// The rate limit a key gets when the operator names none, and the bounds a named one must keep.
export const DEFAULT_KEY_LIMIT = Object.freeze({ perMinute: 120, burst: 60 });
export const KEY_LIMIT_BOUNDS = Object.freeze({ minPerMinute: 1, maxPerMinute: 6_000, minBurst: 1, maxBurst: 1_000 });
export const MAX_LABEL_CHARS = 80;
export const MAX_KEY_DAYS = 3_660;

const FIXED_HASH = createHash("sha256").update("imk: no such key").digest();

export function keySha256(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function isKeyTier(value: unknown): value is KeyTier {
  return typeof value === "string" && (KEY_TIERS as readonly string[]).includes(value);
}

export interface IssueOptions {
  readonly label: string;
  readonly tier: KeyTier;
  readonly perMinute?: number;
  readonly burst?: number;
  readonly days?: number;
}

export class KeyIssueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyIssueError";
  }
}

// Issues a key and stores its hash. Returns the key (shown once) and the stored row.
export function issueKey(store: MeteringStore, options: IssueOptions, nowMs: number, random: (bytes: number) => Buffer = randomBytes): { readonly key: string; readonly row: KeyRow } {
  // eslint-disable-next-line no-control-regex
  if (options.label.length < 1 || options.label.length > MAX_LABEL_CHARS || /[\u0000-\u001f\u007f]/.test(options.label)) throw new KeyIssueError(`the label is 1 to ${MAX_LABEL_CHARS} printable characters`);
  if (!isKeyTier(options.tier)) throw new KeyIssueError(`the tier is one of ${KEY_TIERS.join(", ")}`);
  const perMinute = options.perMinute ?? DEFAULT_KEY_LIMIT.perMinute;
  const burst = options.burst ?? DEFAULT_KEY_LIMIT.burst;
  if (!Number.isInteger(perMinute) || perMinute < KEY_LIMIT_BOUNDS.minPerMinute || perMinute > KEY_LIMIT_BOUNDS.maxPerMinute) throw new KeyIssueError(`per-minute is a whole number from ${KEY_LIMIT_BOUNDS.minPerMinute} to ${KEY_LIMIT_BOUNDS.maxPerMinute}`);
  if (!Number.isInteger(burst) || burst < KEY_LIMIT_BOUNDS.minBurst || burst > KEY_LIMIT_BOUNDS.maxBurst) throw new KeyIssueError(`burst is a whole number from ${KEY_LIMIT_BOUNDS.minBurst} to ${KEY_LIMIT_BOUNDS.maxBurst}`);
  if (options.days !== undefined && (!Number.isInteger(options.days) || options.days < 1 || options.days > MAX_KEY_DAYS)) throw new KeyIssueError(`days is a whole number from 1 to ${MAX_KEY_DAYS}`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = random(6).toString("hex");
    if (store.key(id) !== null) continue;
    const key = `imk_${id}_${random(32).toString("base64url")}`;
    if (!KEY_PATTERN.test(key)) throw new KeyIssueError("the random source returned the wrong number of bytes");
    const row: KeyRow = {
      id,
      keySha256: keySha256(key),
      label: options.label,
      tier: options.tier,
      perMinute,
      burst,
      createdMs: nowMs,
      expiresMs: options.days === undefined ? null : nowMs + options.days * 86_400_000,
      revokedMs: null,
    };
    store.insertKey(row);
    return { key, row };
  }
  throw new KeyIssueError("could not draw an unused key id");
}

export type KeyCheck =
  | { readonly ok: true; readonly row: KeyRow; readonly limit: RateLimitSpec }
  | { readonly ok: false; readonly reason: "malformed" | "unknown" | "revoked" | "expired" };

// The Authorization header's key, or null when there is no Authorization header at all. A header that is present but not
// exactly "Bearer <key>" is "malformed".
export function bearerOf(header: string | string[] | undefined): string | null | "malformed" {
  if (header === undefined) return null;
  if (Array.isArray(header) || header.length > 200) return "malformed";
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match === null ? "malformed" : (match[1] as string);
}

export function checkKey(store: MeteringStore, key: string, nowMs: number): KeyCheck {
  const match = KEY_PATTERN.exec(key);
  if (match === null) {
    // Same work as a real check, so a malformed key is not faster to refuse.
    timingSafeEqual(Buffer.from(keySha256(key), "hex"), FIXED_HASH);
    return { ok: false, reason: "malformed" };
  }
  const row = store.key(match[1] as string);
  const presented = Buffer.from(keySha256(key), "hex");
  const expected = row === null ? FIXED_HASH : Buffer.from(row.keySha256, "hex");
  const equal = expected.length === presented.length && timingSafeEqual(presented, expected);
  if (row === null || !equal) return { ok: false, reason: "unknown" };
  if (row.revokedMs !== null) return { ok: false, reason: "revoked" };
  if (row.expiresMs !== null && nowMs >= row.expiresMs) return { ok: false, reason: "expired" };
  return { ok: true, row, limit: { capacity: row.burst, refillPerSecond: row.perMinute / 60 } };
}

export function tierAllows(tier: KeyTier, route: PaidRoute): boolean {
  return TIER_ROUTES[tier].includes(route);
}
