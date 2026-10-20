import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useClock } from "./context";

// Accessibility primitives: text for screen readers only, and a throttled live-region announcer.

export function VisuallyHidden({ children }: { readonly children: ReactNode }) {
  return <span className="ui-visually-hidden">{children}</span>;
}

export type AnnouncePriority = "polite" | "assertive";
export type Announce = (message: string, priority?: AnnouncePriority) => void;

const NOOP: Announce = () => undefined;
const AnnouncerContext = createContext<Announce>(NOOP);

// Outside a provider announcing does nothing, so a component test needs no wrapper.
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}

// Prices and statuses change often; announcing each tick would make the page unusable with a screen reader
// (docs/research/28 section 8.5). Polite messages are throttled to one per `minIntervalMs`: a message that
// arrives inside the window replaces any pending one (only the latest is spoken). Assertive messages
// (errors, kill engaged) are never delayed. Message text is app-authored; never pass market text here.
export function AnnouncerProvider({ children, minIntervalMs = 1500 }: { readonly children: ReactNode; readonly minIntervalMs?: number }) {
  const clock = useClock();
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const lastPoliteAt = useRef<number>(Number.NEGATIVE_INFINITY);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Alternates a trailing no-break space so repeating the same sentence is still announced.
  const flip = useRef(false);

  const speakPolite = useCallback(
    (message: string) => {
      lastPoliteAt.current = clock.now();
      flip.current = !flip.current;
      setPolite(flip.current ? message : `${message} `);
    },
    [clock],
  );

  const announce = useCallback<Announce>(
    (message, priority = "polite") => {
      if (message.trim() === "") return;
      if (priority === "assertive") {
        flip.current = !flip.current;
        setAssertive(flip.current ? message : `${message} `);
        return;
      }
      const wait = minIntervalMs - (clock.now() - lastPoliteAt.current);
      if (wait <= 0 && timer.current === undefined) {
        speakPolite(message);
        return;
      }
      pending.current = message;
      if (timer.current === undefined) {
        timer.current = setTimeout(() => {
          timer.current = undefined;
          const next = pending.current;
          pending.current = null;
          if (next !== null) speakPolite(next);
        }, Math.max(wait, 0));
      }
    },
    [clock, minIntervalMs, speakPolite],
  );

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined;
    },
    [],
  );

  const value = useMemo(() => announce, [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className="ui-visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-live="polite">
        {polite}
      </div>
      <div className="ui-visually-hidden" role="alert" aria-live="assertive" aria-atomic="true" data-live="assertive">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}
