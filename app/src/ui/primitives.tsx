import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { VisuallyHidden } from "./a11y";

// Small building blocks. Every one takes React children (text nodes), never an HTML string.

// A value that is not there. "null is not zero": an unknown number or text renders as this, never as 0 or "".
export function Missing({ label = "no data" }: { readonly label?: string }) {
  return (
    <span className="ui-missing">
      <span aria-hidden="true">{"–"}</span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

// The glyph is decoration; the word is what carries the meaning, so colour is never the only signal.
const GLYPHS: Readonly<Record<Tone, string>> = { neutral: "•", ok: "✓", warn: "!", danger: "✕", info: "i" };

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

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "style"> {
  readonly variant?: "default" | "primary";
  // A pending action: announces busy and cannot be pressed twice.
  readonly busy?: boolean;
  readonly type?: "button" | "submit";
}

export function Button({ variant = "default", busy = false, type = "button", disabled, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className="ui-button" data-variant={variant} disabled={disabled === true || busy} aria-busy={busy || undefined}>
      {children}
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
