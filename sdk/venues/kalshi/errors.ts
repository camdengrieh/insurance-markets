import { AdapterException } from "../errors.js";
import type { AdapterError, VenueId } from "../../model.js";

// What a Kalshi call throws when a read cannot be turned into a value. `code` is the port's closed
// AdapterError set; `detail` is a short fixed token that never quotes upstream text (an upstream body is
// untrusted and must not reach a log line, a toast or a model).
//
// It extends the shared AdapterException (sdk/venues/errors.ts) and carries the name "AdapterFailure" plus `venue`
// and `detail`, the shape the other venue adapters use, so a consumer can test for either.
export class AdapterFailure extends AdapterException {
  readonly venue: VenueId;
  readonly detail: string;

  constructor(venue: VenueId, code: AdapterError, detail: string, retryAfterMs: number | null = null) {
    super(code, `${venue}:${code}:${detail}`, retryAfterMs);
    this.name = "AdapterFailure";
    this.venue = venue;
    this.detail = detail;
  }
}

export function isAdapterFailure(value: unknown): value is AdapterFailure {
  return value instanceof AdapterFailure;
}
