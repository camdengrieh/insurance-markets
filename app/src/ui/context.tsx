import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Small contexts every screen needs: which build this is, the clock, the top bar's search text and the venue
// count the top bar shows. Each exists so tests can inject a value instead of reading import.meta.env or
// Date.now (fixed seeds, injected clocks), and so a screen and the shell can share a value without a store.

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

// ---- the top bar's search text ----------------------------------------------------------------------------------

// The shell owns the one search field; a screen reads the text and filters the rows it has already loaded.
// Typing never makes a request (the text is a filter, not a query to a venue). Outside the provider the text
// is empty and setting it does nothing, so a component test needs no wrapper.
export interface SearchState {
  readonly query: string;
  readonly setQuery: (query: string) => void;
}

const NO_SEARCH: SearchState = { query: "", setQuery: () => undefined };
const SearchContext = createContext<SearchState>(NO_SEARCH);

export function SearchProvider({ children }: { readonly children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo<SearchState>(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearchQuery(): SearchState {
  return useContext(SearchContext);
}

// ---- the one way to open the Connect modal -------------------------------------------------------------------------

// The wallet chip in the top bar owns the Connect modal and registers the function that opens it; a panel anywhere
// in the page (the Holdings view's empty tiles) asks for that function and renders a button only when one is
// registered. Outside the provider, or before the chip has mounted, nothing is registered and no dead button is drawn.
interface ConnectActionState {
  readonly open: (() => void) | null;
  readonly register: (open: (() => void) | null) => void;
}

const NO_CONNECT: ConnectActionState = { open: null, register: () => undefined };
const ConnectActionContext = createContext<ConnectActionState>(NO_CONNECT);

export function ConnectActionProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState<(() => void) | null>(null);
  const register = useCallback((next: (() => void) | null) => setOpen(() => next), []);
  const value = useMemo<ConnectActionState>(() => ({ open, register }), [open, register]);
  return <ConnectActionContext.Provider value={value}>{children}</ConnectActionContext.Provider>;
}

// The registered opener, or null when the page has no Connect modal to open.
export function useOpenConnect(): (() => void) | null {
  return useContext(ConnectActionContext).open;
}

// Called by the component that owns the Connect modal. Registers once (the latest function is kept in a ref, so a
// caller need not memoise) and unregisters when it unmounts.
export function useRegisterConnectAction(open: () => void): void {
  const { register } = useContext(ConnectActionContext);
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    register(() => latest.current());
    return () => register(null);
  }, [register]);
}

// ---- what the top bar's status says ------------------------------------------------------------------------------

// "Local Cockpit · 6 of 11 venues read": the screen that reads venues reports how many answered out of how
// many this build has, and the top bar shows it. Nothing is shown until a screen reports (never a guessed 0).
export interface VenueCount {
  readonly read: number;
  readonly total: number;
}

interface VenueCountState {
  readonly count: VenueCount | null;
  readonly setCount: (count: VenueCount | null) => void;
}

const NO_COUNT: VenueCountState = { count: null, setCount: () => undefined };
const VenueCountContext = createContext<VenueCountState>(NO_COUNT);

export function ShellStatusProvider({ children }: { readonly children: ReactNode }) {
  const [count, setCount] = useState<VenueCount | null>(null);
  const value = useMemo<VenueCountState>(() => ({ count, setCount }), [count]);
  return <VenueCountContext.Provider value={value}>{children}</VenueCountContext.Provider>;
}

export function useVenueCount(): VenueCount | null {
  return useContext(VenueCountContext).count;
}

// Called by the screen that reads venues. Clears the count when that screen unmounts.
export function useReportVenueCount(count: VenueCount | null): void {
  const { setCount } = useContext(VenueCountContext);
  const read = count?.read;
  const total = count?.total;
  const report = useCallback(() => {
    setCount(read === undefined || total === undefined ? null : { read, total });
  }, [setCount, read, total]);
  useEffect(() => {
    report();
    return () => setCount(null);
  }, [report, setCount]);
}
