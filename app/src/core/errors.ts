// Errors the core layer and the adapters share. Nothing here reads a clock, a network or a global.
//
// Adapter methods that return a Page or a Market (not a Result) signal failure by throwing an
// AdapterException carrying one of the closed AdapterError codes of ports.ts. Anything else an adapter
// throws is a bug or an unexpected upstream shape and is mapped by the caller, never guessed here.

import type { AdapterError } from "./ports";

export class AdapterException extends Error {
  readonly code: AdapterError;
  // Set for RATE_LIMITED and VENUE_PAUSED: when the caller may try again, in ms from now.
  readonly retryAfterMs: number | null;
  constructor(code: AdapterError, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "AdapterException";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isAdapterException(value: unknown): value is AdapterException {
  return value instanceof AdapterException;
}

// A programming error: two quantities of different units were combined. Defined with the money module in the
// SDK (sdk/money/qty.ts) so every client throws the same class.
export { UnitMismatchError } from "@sdk/money/qty";
