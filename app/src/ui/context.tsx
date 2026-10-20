import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Two small contexts every screen needs: which build this is, and the clock. Both exist so tests can inject
// a value instead of reading import.meta.env or Date.now (fixed seeds, injected clocks).

export type AppMode = "standalone" | "cockpit";

// `vite build --mode standalone` is the keyless explorer; every other mode (cockpit build, dev, test) is the
// local Cockpit, the same rule as app/scripts/vite-base.ts targetForMode.
export function appModeFromEnv(mode: string = import.meta.env.MODE): AppMode {
  return mode === "standalone" ? "standalone" : "cockpit";
}

const ModeContext = createContext<AppMode>(appModeFromEnv());

export function ModeProvider({ mode, children }: { readonly mode: AppMode; readonly children: ReactNode }) {
  return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

export function useAppMode(): AppMode {
  return useContext(ModeContext);
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

const ClockContext = createContext<Clock>(systemClock);

export function ClockProvider({ clock, children }: { readonly clock: Clock; readonly children: ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

export function useClock(): Clock {
  return useContext(ClockContext);
}

// The current time in ms, refreshed every `intervalMs` while the tab is visible (nothing runs in a hidden
// tab, aggregation-design rule R9). Used for "fetched 12 s ago" strips and countdown text.
export function useNow(intervalMs: number = 10_000): number {
  const clock = useClock();
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    setNow(clock.now());
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = (): void => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = (): void => {
      stop();
      timer = setInterval(() => setNow(clock.now()), intervalMs);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") stop();
      else {
        setNow(clock.now());
        start();
      }
    };
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clock, intervalMs]);
  return now;
}
