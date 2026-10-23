// A venue's or a wallet's own words, cleaned and capped (the shared sanitiser: no control, bidi or zero-width
// characters, collapsed whitespace). Still a stranger's text: it is rendered only through the untrusted slot.

import { sanitizeUntrusted } from "@sdk/untrusted";

export const VENUE_TEXT_MAX = 300;

export function venueText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = sanitizeUntrusted(raw, { maxChars: VENUE_TEXT_MAX }).text;
  return text === "" ? null : text;
}
