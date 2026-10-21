import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ditherFill } from "./dither";

// An accessible modal dialog without the <dialog> element (jsdom does not implement showModal, and a
// script-free focus trap is easy to test). It:
//   - is a role="dialog" aria-modal="true" labelled by its title, rendered into <body>;
//   - moves focus inside on open (to the first control in its body, not the close button), keeps Tab and
//     Shift+Tab inside, restores focus to the opener on close;
//   - marks every other child of <body> inert while open, and locks page scroll with a class;
//   - closes on Escape (wherever focus is: a click on the backdrop moves focus to <body>, and Escape must still
//     work from there) and from its 44 px close button unless `dismissOnEscape` is false (use false for a
//     decision that needs a deliberate button press, such as signing: then the close button is not shown and
//     the dialog's own buttons are the only way out). A backdrop click never closes it.
// The frame is the design's: a 2 px ink border, an 8 px ink offset shadow, square corners, over a scrim that is
// the 4/16 dither step on a translucent ground so the table stays legible behind it. `size` picks the width;
// "sheet" docks it to the bottom edge, which every size does on its own below 720 px.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export type DialogSize = "narrow" | "wide" | "sheet";

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly dismissOnEscape?: boolean;
  readonly size?: DialogSize;
  // Fixed app text under the title (never market text).
  readonly lede?: string;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("inert"));
}

export function Dialog({ open, title, onClose, children, dismissOnEscape = true, size = "narrow", lede }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const escapeRef = useRef(dismissOnEscape);
  escapeRef.current = dismissOnEscape;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = backdrop.current;
    const inerted: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child instanceof HTMLElement && child !== host && !child.hasAttribute("inert")) {
        child.setAttribute("inert", "");
        inerted.push(child);
      }
    }
    document.body.classList.add("ui-scroll-lock");
    const node = panel.current;
    const content = body.current;
    if (node !== null) ((content === null ? [] : focusables(content))[0] ?? focusables(node)[0] ?? node).focus();
    // Escape from anywhere in the document, so a backdrop click (focus on <body>) does not strand the person. The
    // panel's own handler stops propagation first, so an Escape inside the panel is handled exactly once.
    const onDocumentKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || !escapeRef.current) return;
      if (host !== null && host.contains(event.target as Node) && event.target !== host) return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onDocumentKey);
    return () => {
      document.removeEventListener("keydown", onDocumentKey);
      for (const child of inerted) child.removeAttribute("inert");
      // Another dialog may still be open over this one (the Quotient settings over the market modal): the page
      // stays locked until the last backdrop is gone.
      if (document.querySelector(".ui-dialog-backdrop") === null) document.body.classList.remove("ui-scroll-lock");
      if (opener !== null && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="ui-dialog-backdrop" ref={backdrop} data-size={size}>
      <svg className="ui-dialog-scrim" aria-hidden="true" focusable="false">
        <rect width="100%" height="100%" fill={ditherFill(4)} />
      </svg>
      <div
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panel}
        onKeyDown={(event) => {
          const node = panel.current;
          if (event.key === "Escape" && escapeRef.current) {
            event.stopPropagation();
            onCloseRef.current();
            return;
          }
          if (event.key !== "Tab" || node === null) return;
          const items = focusables(node);
          if (items.length === 0) {
            event.preventDefault();
            node.focus();
            return;
          }
          const first = items[0];
          const last = items[items.length - 1];
          const active = document.activeElement;
          if (event.shiftKey && (active === first || active === node)) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="ui-dialog-head">
          <div className="ui-dialog-heading">
            <h2 id={titleId}>{title}</h2>
            {lede === undefined ? null : <p className="ui-dialog-lede">{lede}</p>}
          </div>
          {dismissOnEscape ? (
            <button type="button" className="ui-dialog-close" aria-label="Close" onClick={() => onCloseRef.current()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true" focusable="false">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="ui-dialog-body" ref={body}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
