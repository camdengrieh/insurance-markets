import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

import { VisuallyHidden } from "./a11y";
import type { VenueId } from "../core/ports";
import { venueName } from "./venue-names";

// Small building blocks. Every one takes React children (text nodes), never an HTML string. Square corners,
// 1.5 px lines, 44 px targets, sentence case; numbers in mono (Num), words in Archivo.

// A value that is not there. "null is not zero": an unknown number or text renders as this, never as 0 or "".
export function Missing({ label = "no data" }: { readonly label?: string }) {
  return (
    <span className="ui-missing">
      <span aria-hidden="true">{"–"}</span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}

// Every number, id, hash, time and command is set in mono. Inline; the parent decides the size.
export function Num({ children }: { readonly children: ReactNode }) {
  return <span className="ui-num">{children}</span>;
}

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

// The glyph is decoration; the word is what carries the meaning, so colour is never the only signal.
const GLYPHS: Readonly<Record<Tone, string>> = { neutral: "•", ok: "✓", warn: "!", danger: "✕", info: "i" };

// An outlined word with a glyph. Never a coloured fill.
export function Badge({ tone = "neutral", children }: { readonly tone?: Tone; readonly children: ReactNode }) {
  return (
    <span className="ui-badge" data-tone={tone}>
      <span className="ui-glyph" aria-hidden="true">
        {GLYPHS[tone]}
      </span>
      <span>{children}</span>
    </span>
  );
}

// A row mark: an outlined word ("held", "link", "Q") in the ink, the Yes blue or the No rust. The word is the
// meaning; no tooltip, no icon.
export type MarkTone = "ink" | "yes" | "no";

export function Mark({ tone = "ink", children }: { readonly tone?: MarkTone; readonly children: ReactNode }) {
  return (
    <span className="ui-mark" data-tone={tone}>
      {children}
    </span>
  );
}

// A 9 px square beside the venue's name. The name is the meaning; the square only helps the eye scan a column.
export function VenueMark({ venue }: { readonly venue: VenueId }) {
  return (
    <span className="ui-venue-mark" data-venue={venue}>
      <span className="ui-venue-swatch" aria-hidden="true" />
      {venueName(venue)}
    </span>
  );
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "style"> {
  // primary: an ink fill (one per view). danger: the outlined Reject. default: outlined in ink.
  readonly variant?: "default" | "primary" | "danger";
  // A pending action: announces busy and cannot be pressed twice.
  readonly busy?: boolean;
  readonly type?: "button" | "submit";
}

// A disabled button says why in its label ("Sign with PayBox: off in this build"); nothing is greyed out
// without words.
export function Button({ variant = "default", busy = false, type = "button", disabled, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className="ui-button" data-variant={variant} disabled={disabled === true || busy} aria-busy={busy || undefined}>
      {children}
    </button>
  );
}

// A view chip: a 44 px toggle button with aria-pressed and an optional mono count. Holdings, Linked and
// Signals are states of one table, not screens, so a chip is a filter, never a link.
export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "style" | "aria-pressed"> {
  readonly pressed: boolean;
  // Shown in mono after the label. Undefined when the count is not known (never 0 as a guess).
  readonly count?: number;
}

export function Chip({ pressed, count, children, ...rest }: ChipProps) {
  return (
    <button {...rest} type="button" className="ui-chip" aria-pressed={pressed}>
      <span>{children}</span>
      {count === undefined ? null : <Num>{String(count)}</Num>}
    </button>
  );
}

// details/summary: keyboard and screen-reader support come from the browser. Used for "data table behind a
// chart" and for any long secondary text.
export function Disclosure({ summary, children, defaultOpen = false }: { readonly summary: string; readonly children: ReactNode; readonly defaultOpen?: boolean }) {
  return (
    <details className="ui-disclosure" open={defaultOpen || undefined}>
      <summary>{summary}</summary>
      <div className="ui-disclosure-body">{children}</div>
    </details>
  );
}

// A labelled group of plain content for a form control; used with the input classes in components.css.
export function Field({ label, children }: { readonly label: string; readonly children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

// The search field of the top bar: a 44 px well with a magnifier and a mono shortcut hint. It filters what is
// already loaded; typing in it never makes a request. The label is visually hidden and fixed app text.
export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "style" | "placeholder" | "role"> {
  readonly label: string;
  // The keyboard shortcut to show as a hint, for example "⌘K". Only a hint: the parent wires the key.
  readonly shortcut?: string;
  readonly ref?: Ref<HTMLInputElement>;
}

export function SearchField({ label, shortcut, ref, ...rest }: SearchFieldProps) {
  const id = useId();
  return (
    <label className="ui-search" htmlFor={id}>
      <svg className="ui-search-glyph" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" focusable="false">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
      <VisuallyHidden>{label}</VisuallyHidden>
      <input {...rest} ref={ref} id={id} type="search" className="ui-search-input" autoComplete="off" spellCheck={false} />
      {shortcut === undefined ? null : (
        <kbd className="ui-search-hint" aria-hidden="true">
          {shortcut}
        </kbd>
      )}
    </label>
  );
}
