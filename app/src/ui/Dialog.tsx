import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// An accessible modal dialog without the <dialog> element (jsdom does not implement showModal, and a
// script-free focus trap is easy to test). It:
//   - is a role="dialog" aria-modal="true" labelled by its title, rendered into <body>;
//   - moves focus inside on open, keeps Tab and Shift+Tab inside, restores focus to the opener on close;
//   - marks every other child of <body> inert while open, and locks page scroll with a class;
//   - closes on Escape unless `dismissOnEscape` is false (use false for a decision that needs a deliberate
//     button press, such as signing). A backdrop click never closes it.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly dismissOnEscape?: boolean;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("inert"));
}

export function Dialog({ open, title, onClose, children, dismissOnEscape = true }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
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
    if (node !== null) (focusables(node)[0] ?? node).focus();
    return () => {
      for (const child of inerted) child.removeAttribute("inert");
      document.body.classList.remove("ui-scroll-lock");
      if (opener !== null && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="ui-dialog-backdrop" ref={backdrop}>
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
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
