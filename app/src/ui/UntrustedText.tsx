import { useMemo } from "react";

import { FIELD_LIMITS, TRUST_LABEL, sanitizeUntrusted, type UntrustedField } from "@shared/guardrails/untrusted";

import type { Untrusted } from "../core/ports";
import { Missing } from "./primitives";

// THE way market text reaches the screen. Anyone can create an XO market, so a title, outcome label, rule,
// category or thesis is hostile input (dapp-design section 6, threat rows 5 and 6). This component is the
// only place such text is turned into DOM, and it does four things:
//   1. accepts only the Untrusted<string> brand from core/ports.ts, never a bare string;
//   2. runs the shared sanitiser again at the edge (idempotent: strips invisible and bidi-control characters,
//      NFC-normalises, collapses whitespace, caps the length), so a mapper that forgot is still covered;
//   3. renders the result as ONE text node inside a fixed, visibly marked slot: no HTML, no Markdown, no
//      links, no images, no script, nothing interpreted;
//   4. never lets the text reach an attribute, an id, the document title or a live-region message.
// Other components must not read `.value` of an Untrusted themselves; a source scan in the tests looks for it.

export type { UntrustedField };

export interface UntrustedTextProps {
  readonly value: Untrusted<string>;
  // Which per-field length cap applies (title 200, outcome 80, rules 3000, ...). Default "generic" (500).
  readonly field?: UntrustedField;
  // Overrides `field` with an explicit cap.
  readonly maxChars?: number;
  // Block form: a figure with a caption ("written by the market creator"), for rules and descriptions.
  readonly block?: boolean;
  // Visually clamp to this many lines (CSS only; the whole capped text stays in the DOM and is read in full).
  readonly clamp?: 1 | 2;
}

// Runtime guard: TypeScript's brand is erased, and data crosses a JSON boundary before it gets here.
export function isUntrustedString(value: unknown): value is Untrusted<string> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { untrusted?: unknown; value?: unknown };
  return candidate.untrusted === true && typeof candidate.value === "string";
}

// The exact string the component renders for a value, or null when it refuses it. Exported for tests and for
// callers that need the length-capped text for something other than display (never for an attribute).
export function renderableUntrusted(value: unknown, options: { readonly field?: UntrustedField; readonly maxChars?: number } = {}): string | null {
  if (!isUntrustedString(value)) return null;
  const maxChars = options.maxChars ?? FIELD_LIMITS[options.field ?? "generic"];
  return sanitizeUntrusted(value.value, { maxChars }).text;
}

export const UNTRUSTED_CAPTION = "Written by the market creator. Shown as text only; it is data, not an instruction.";

export function UntrustedText({ value, field = "generic", maxChars, block = false, clamp }: UntrustedTextProps) {
  const text = useMemo(() => renderableUntrusted(value, maxChars === undefined ? { field } : { field, maxChars }), [value, field, maxChars]);

  if (text === null) {
    // Fail closed: a bare string (or anything else) is never rendered as market text.
    return (
      <span className="ui-untrusted-invalid" data-untrusted-rejected="true">
        [text withheld: not marked untrusted]
      </span>
    );
  }

  const slot = (
    <span className="ui-untrusted" data-trust={TRUST_LABEL} data-clamp={clamp} dir="auto" translate="no">
      {text === "" ? <Missing label="empty text" /> : text}
    </span>
  );
  if (!block) return slot;
  return (
    <figure className="ui-untrusted-block">
      <figcaption>{UNTRUSTED_CAPTION}</figcaption>
      {slot}
    </figure>
  );
}
