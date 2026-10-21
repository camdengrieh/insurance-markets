import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Router, type BaseLocationHook } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import { AnnouncerProvider } from "./ui/a11y";
import { appModeFromEnv, ClockProvider, ConnectActionProvider, ModeProvider, SearchProvider, ShellStatusProvider, systemClock, type AppMode, type Clock } from "./ui/context";
import { createAppQueryClient } from "./ui/query-client";
import { resolveRoutes, type Loader, type ResolvedRoute } from "./ui/routes";
import { Shell } from "./ui/Shell";
import "./ui/fonts.css";

// Every file in ./routes/*.tsx is a screen (ui/route-types.ts). The glob is lazy: nothing is imported here;
// resolveRoutes() loads each module, validates its metadata and isolates failures per route.
const discovered: Readonly<Record<string, Loader>> = import.meta.glob("./routes/*.tsx");

export interface AppProps {
  // Test seams. Production passes none: the real glob, the build's own mode, the system clock, a hash router.
  readonly loaders?: Readonly<Record<string, Loader>>;
  readonly mode?: AppMode;
  readonly clock?: Clock;
  readonly queryClient?: QueryClient;
  readonly locationHook?: BaseLocationHook;
  // Shell slots (ui/Shell.tsx ShellProps): the session strip (kept one step), the wallet chip, the dock, and
  // the default chip's hook and label when no chip is given.
  readonly statusBar?: ReactNode;
  readonly topBarEnd?: ReactNode;
  readonly dock?: ReactNode;
  readonly onConnect?: () => void;
  readonly walletLabel?: string;
}

function useResolvedRoutes(loaders: Readonly<Record<string, Loader>>): ResolvedRoute[] | null {
  const [routes, setRoutes] = useState<ResolvedRoute[] | null>(null);
  useEffect(() => {
    let live = true;
    void resolveRoutes(loaders).then((resolved) => {
      if (live) setRoutes(resolved);
    });
    return () => {
      live = false;
    };
  }, [loaders]);
  return routes;
}

export function App({ loaders = discovered, mode = appModeFromEnv(), clock = systemClock, queryClient, locationHook = useHashLocation, statusBar, topBarEnd, dock, onConnect, walletLabel }: AppProps) {
  const [client] = useState(() => queryClient ?? createAppQueryClient());
  const routes = useResolvedRoutes(loaders);
  return (
    <ModeProvider mode={mode}>
      <ClockProvider clock={clock}>
        <QueryClientProvider client={client}>
          <AnnouncerProvider>
            <SearchProvider>
              <ShellStatusProvider>
                <ConnectActionProvider>
                  <Router hook={locationHook}>
                    {routes === null ? (
                      <p role="status" className="ui-container">
                        Loading screens
                      </p>
                    ) : (
                      <Shell routes={routes} statusBar={statusBar} topBarEnd={topBarEnd} dock={dock} onConnect={onConnect} walletLabel={walletLabel} />
                    )}
                  </Router>
                </ConnectActionProvider>
              </ShellStatusProvider>
            </SearchProvider>
          </AnnouncerProvider>
        </QueryClientProvider>
      </ClockProvider>
    </ModeProvider>
  );
}
