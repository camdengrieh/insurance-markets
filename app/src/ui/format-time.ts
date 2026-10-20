// Time text for the provenance strip and countdowns. Pure functions; callers pass the clock reading.

const UNKNOWN = "unknown";

// "2026-10-19 12:00:03 UTC". Always UTC: XO cutoffs are UTC and Polymarket's are ET, so a local time here
// would hide a five-hour difference (dapp-design 4.5).
export function formatUtc(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return UNKNOWN;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return UNKNOWN;
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

// "12 s ago", "3 min ago", "2 h ago", "4 d ago". A reading ahead of the clock (clock skew) says so
// instead of printing a negative age.
export function formatAge(fetchedAtMs: number | null | undefined, nowMs: number): string {
  if (fetchedAtMs === null || fetchedAtMs === undefined || !Number.isFinite(fetchedAtMs) || !Number.isFinite(nowMs)) return UNKNOWN;
  const delta = nowMs - fetchedAtMs;
  if (delta < -1000) return "ahead of this clock";
  const seconds = Math.max(0, Math.floor(delta / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

// "mm:ss" for a countdown that is also available as text (the signing inbox). Negative or invalid input is
// "expired" or "unknown", never a negative time.
export function formatCountdown(remainingMs: number | null | undefined): string {
  if (remainingMs === null || remainingMs === undefined || !Number.isFinite(remainingMs)) return UNKNOWN;
  if (remainingMs <= 0) return "expired";
  const total = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ISO string for a <time dateTime>, or undefined when the value is not a representable instant.
export function toIso(ms: number | null | undefined): string | undefined {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return undefined;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
