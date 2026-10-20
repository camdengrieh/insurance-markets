import { createContext, useContext, useMemo, type ReactNode } from "react";

import { BindingsStore, openStores } from "../../core/bindings";
import { createBrowserEnv, type Env } from "../../core/env";
import { consumePairingCode, type AppMode } from "../../ui";
import { DaemonClient } from "./client";
import type { ExecContext } from "./execute";
import { PageSession, type StorageLike } from "./session";
import type { StreamDeps } from "./stream";

// Everything the terminal needs from the outside, in one record, so a test can inject a fake daemon, a fake clock
// and an in-memory address book. The defaults touch the browser only when a method is called, never at import.

export interface TerminalServices {
  readonly mode: AppMode;
  readonly nowMs: () => number;
  readonly session: Pick<PageSession, "token" | "pair" | "forget" | "tokenSource">;
  readonly client: Pick<DaemonClient, "status" | "inbox" | "callTool" | "hasToken">;
  readonly stream: StreamDeps;
  readonly loadBindings: ExecContext["loadBindings"];
}

export interface TerminalServicesOptions {
  readonly mode: AppMode;
  readonly env?: Env;
  readonly storage?: StorageLike | null;
  readonly consumeCode?: () => string | undefined;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function createTerminalServices(options: TerminalServicesOptions): TerminalServices {
  const env = options.env ?? createBrowserEnv();
  const session = new PageSession({
    rawFetch: env.rawFetch,
    timers: env.timers,
    consumeCode: options.consumeCode ?? consumePairingCode,
    storage: options.storage === undefined ? browserStorage() : options.storage,
  });
  const client = new DaemonClient({ rawFetch: env.rawFetch, timers: env.timers, getToken: () => session.token() });
  let opened: Promise<{ readonly bindings: BindingsStore; readonly persistence: "indexeddb" | "memory" }> | null = null;
  return {
    mode: options.mode,
    nowMs: env.nowMs,
    session,
    client,
    stream: {
      rawFetch: env.rawFetch,
      timers: env.timers,
      getToken: () => session.token(),
      sleep: (ms, signal) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          const handle = env.timers.setTimeout(done, ms);
          function done(): void {
            signal.removeEventListener("abort", done);
            env.timers.clearTimeout(handle);
            resolve();
          }
          signal.addEventListener("abort", done, { once: true });
        }),
      random: env.random,
    },
    loadBindings: async () => {
      try {
        opened ??= openStores().then((stores) => ({ bindings: new BindingsStore(stores.bindings), persistence: stores.persistence }));
        const { bindings, persistence } = await opened;
        return { bindings: await bindings.list(), persistence };
      } catch {
        return { bindings: [], persistence: "unknown" };
      }
    },
  };
}

const ServicesContext = createContext<TerminalServices | null>(null);

export function TerminalServicesProvider({ services, children }: { readonly services: TerminalServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

// One set of services per page and build: the session and the address book are the page's, not a screen's.
const shared = new Map<AppMode, TerminalServices>();

// Also what src/session.ts uses at start-up, so the page has exactly one session however many screens ask.
export function sharedTerminalServices(mode: AppMode): TerminalServices {
  const cached = shared.get(mode);
  if (cached !== undefined) return cached;
  const created = createTerminalServices({ mode });
  shared.set(mode, created);
  return created;
}

export function useTerminalServices(mode: AppMode): TerminalServices {
  const provided = useContext(ServicesContext);
  return useMemo(() => provided ?? sharedTerminalServices(mode), [provided, mode]);
}
