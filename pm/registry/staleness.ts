// Section freshness (docs/platform-registry-design.md 3.5). Staleness is computed, not stored.
//
//   fresh   age <= ttl           display yes, screen yes, gate yes (if confidence allows)
//   stale   ttl < age <= 2*ttl   display yes with age, screen degraded, gate BLOCKED
//   expired age > 2*ttl          value hidden ("unknown"), screen no, gate BLOCKED
//
// Anything that cannot be dated (bad string, future date, NaN clock) is expired: fail closed.

export type Confidence = "H" | "M" | "L" | "D";
export type Method =
  | "primary_doc"
  | "live_api"
  | "onchain_read"
  | "derived"
  | "third_party"
  | "vendor_claim";
export type Verification = "verified" | "unverified";
export type UseClass = "gate" | "screen" | "display";
export type Freshness = "fresh" | "stale" | "expired";

export interface SectionMeta {
  // ISO calendar date (YYYY-MM-DD, UTC midnight).
  readonly lastVerified: string;
  readonly ttlDays: number;
  readonly verifiedBy: string;
  readonly method: Method;
  readonly confidence: Confidence;
  // "verified" only for confidence H from a first-hand method; everything else is "unverified".
  readonly verification: Verification;
  // A recorded second source agreed (needed for an M value to gate).
  readonly crossChecked: boolean;
  // Repo-relative research references (docs/...). Never an absolute path.
  readonly sources: readonly string[];
}

export interface Section<T> {
  readonly meta: SectionMeta;
  readonly value: T;
}

export const SECTION_KEYS = [
  "identity",
  "status",
  "kind",
  "collateral",
  "fees",
  "geo",
  "api",
  "reachability",
  "liquidity",
  "resolution",
  "links",
  "marketIdentity",
  "dataTerms",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

// Use class is the strictest consumer; ttl is the default (design 3.3 column "Default ttl_days").
export const SECTION_POLICY: Readonly<Record<SectionKey, { use: UseClass; ttlDays: number }>> = {
  identity: { use: "display", ttlDays: 90 },
  status: { use: "gate", ttlDays: 1 },
  kind: { use: "screen", ttlDays: 90 },
  collateral: { use: "gate", ttlDays: 90 },
  fees: { use: "gate", ttlDays: 30 },
  geo: { use: "gate", ttlDays: 30 },
  api: { use: "gate", ttlDays: 30 },
  reachability: { use: "gate", ttlDays: 30 },
  liquidity: { use: "screen", ttlDays: 7 },
  resolution: { use: "gate", ttlDays: 30 },
  links: { use: "screen", ttlDays: 30 },
  marketIdentity: { use: "screen", ttlDays: 90 },
  dataTerms: { use: "gate", ttlDays: 30 },
};

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Epoch ms of the date at UTC midnight, or null when the string is not a real calendar date.
export function parseIsoDate(value: string): number | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  // Date.parse rolls "2026-02-30" forward; require an exact round trip.
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

// Age in whole milliseconds, or null when it cannot be computed or is negative (future-dated).
export function sectionAgeMs(meta: SectionMeta, nowMs: number): number | null {
  if (!Number.isFinite(nowMs)) return null;
  const at = parseIsoDate(meta.lastVerified);
  if (at === null) return null;
  const age = nowMs - at;
  return age < 0 ? null : age;
}

export function freshness(meta: SectionMeta, nowMs: number): Freshness {
  const age = sectionAgeMs(meta, nowMs);
  if (age === null) return "expired";
  if (!Number.isInteger(meta.ttlDays) || meta.ttlDays <= 0) return "expired";
  const ttl = meta.ttlDays * DAY_MS;
  if (age <= ttl) return "fresh";
  if (age <= 2 * ttl) return "stale";
  return "expired";
}

// A gate may use a value only if it is H from a first-hand method (verified), or M with a recorded
// cross-check. Vendor claims and third-party text never gate; L and D never gate.
export function confidenceAllowsGate(meta: SectionMeta): boolean {
  if (meta.method === "vendor_claim") return false;
  if (meta.confidence === "H") return meta.verification === "verified";
  if (meta.confidence === "M") return meta.crossChecked;
  return false;
}

export function gateUsable(meta: SectionMeta, nowMs: number): boolean {
  return freshness(meta, nowMs) === "fresh" && confidenceAllowsGate(meta);
}

export type SectionRead<T> =
  | {
      readonly usable: true;
      readonly value: T;
      readonly freshness: Freshness;
      // "degraded" when stale (display/screen); "ok" when fresh.
      readonly label: "ok" | "degraded";
      readonly ageDays: number;
    }
  | {
      readonly usable: false;
      // Hidden: callers show "unknown" and treat the fact as absent.
      readonly value: null;
      readonly freshness: Freshness;
      readonly label: "unknown";
      readonly reason: string;
      readonly ageDays: number | null;
    };

export function readSection<T>(section: Section<T>, use: UseClass, nowMs: number): SectionRead<T> {
  const state = freshness(section.meta, nowMs);
  const age = sectionAgeMs(section.meta, nowMs);
  const ageDays = age === null ? null : Math.floor(age / DAY_MS);
  const deny = (reason: string): SectionRead<T> => ({
    usable: false,
    value: null,
    freshness: state,
    label: "unknown",
    reason,
    ageDays,
  });
  if (state === "expired" || ageDays === null) return deny("expired or undatable");
  if (use === "gate") {
    if (state !== "fresh") return deny("stale: gate use blocked");
    if (!confidenceAllowsGate(section.meta)) return deny("confidence too low for gate use");
  }
  return {
    usable: true,
    value: section.value,
    freshness: state,
    label: state === "fresh" ? "ok" : "degraded",
    ageDays,
  };
}
