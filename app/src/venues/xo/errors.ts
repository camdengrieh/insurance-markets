import type { AdapterError } from "../../core/ports.js";

// The one error the XO adapter throws. `code` is the port's closed AdapterError set; `reason` is a short fixed
// token for logs and tests. The message is built from those two only: an upstream body or header (a Data API
// 404 even echoes the request query) never reaches an error, so nothing a stranger wrote can ride in one.
export class XoAdapterError extends Error {
  readonly code: AdapterError;
  readonly reason: string;
  readonly status: number | undefined;
  // Seconds from Retry-After turned into milliseconds, capped; undefined when absent or unreadable.
  readonly retryAfterMs: number | undefined;
  // Field path and fixed phrase from a decoder, for debugging. Not part of the message.
  readonly detail: string | undefined;

  constructor(code: AdapterError, reason: string, extra: { readonly status?: number; readonly retryAfterMs?: number; readonly detail?: string } = {}) {
    super(`xo adapter: ${code} (${reason})`);
    this.name = "XoAdapterError";
    this.code = code;
    this.reason = reason;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
    this.detail = extra.detail;
  }
}

export function isXoAdapterError(value: unknown): value is XoAdapterError {
  return value instanceof XoAdapterError;
}
