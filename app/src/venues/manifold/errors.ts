import type { AdapterError, VenueId } from "../../core/ports";

// What an adapter call throws when a venue read cannot be turned into a value. The code is one of the
// port's AdapterError values; the detail is a short fixed token that never quotes upstream text (an
// upstream body is untrusted and must not reach a log line, a toast or a model). The same shape is used by
// every adapter, so a consumer can test for it without importing a particular venue's module.
export class AdapterFailure extends Error {
  readonly code: AdapterError;
  readonly venue: VenueId;
  readonly detail: string;

  constructor(venue: VenueId, code: AdapterError, detail: string) {
    super(`${venue}:${code}:${detail}`);
    this.name = "AdapterFailure";
    this.code = code;
    this.venue = venue;
    this.detail = detail;
  }
}

const CODES: ReadonlySet<string> = new Set<AdapterError>([
  "RATE_LIMITED",
  "STALE",
  "NOT_SUPPORTED",
  "SCHEMA_DRIFT",
  "VENUE_PAUSED",
  "NOT_FOUND",
  "TIMEOUT",
  "EMPTY_BOOK",
]);

// Duck-typed on purpose: another adapter's class with the same name and fields counts.
export function isAdapterFailure(value: unknown): value is AdapterFailure {
  if (!(value instanceof Error) || value.name !== "AdapterFailure") return false;
  const code = (value as { code?: unknown }).code;
  const venue = (value as { venue?: unknown }).venue;
  return typeof code === "string" && CODES.has(code) && typeof venue === "string";
}
