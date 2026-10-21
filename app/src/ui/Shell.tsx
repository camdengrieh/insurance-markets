import { useEffect, useRef, type ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";

import { useAnnounce } from "./a11y";
import { useAppMode, useSearchQuery, useVenueCount, type AppMode } from "./context";
import { DitherDefs, ditherFill } from "./dither";
import { RouteErrorBoundary } from "./ErrorBoundary";
import { Disclosure, Num, SearchField } from "./primitives";
import type { FailedRoute, ResolvedRoute, RouteEntry } from "./routes";
import { ThemeToggle } from "./ThemeToggle";
import { EmptyTile, ErrorTile, NeedsCockpitTile, Tile } from "./Tiles";

export const APP_NAME = "XO Cockpit";
export const BRAND = "Cockpit";

const MODE_TEXT: Readonly<Record<AppMode, { readonly label: string; readonly detail: string }>> = {
  standalone: { label: "Standalone explorer", detail: "Read-only. Holds no key and reaches only the public venues listed in this page's security policy." },
  cockpit: { label: "Local Cockpit", detail: "Served from your own machine. Every read goes through your Cockpit; writes stay off unless you switch them on there." },
};

// The one keyboard shortcut of the page: focus the search field. It is a hint on the field, nothing more.
const SEARCH_SHORTCUT = "⌘K";

// ---- top bar --------------------------------------------------------------------------------------------------

function BrandMark() {
  return (
    <svg className="ui-brand-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect width="22" height="22" className="ui-brand-mark-ink" />
      <rect x="4" y="4" width="14" height="14" fill={ditherFill(8)} className="ui-brand-mark-dither" />
      <rect x="8" y="8" width="6" height="6" className="ui-brand-mark-paper" />
    </svg>
  );
}

// The search field filters rows a screen has already loaded (ui/context.tsx useSearchQuery); it never requests.
function TopBarSearch() {
  const { query, setQuery } = useSearchQuery();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return <SearchField ref={input} label="Search loaded rows" shortcut={SEARCH_SHORTCUT} value={query} onChange={(event) => setQuery(event.target.value)} />;
}

// "Local Cockpit · 6 of 11 venues read". The count comes from the screen that reads venues; until one reports,
// only the build's name is shown (never a guessed 0 of 0).
function ModeStatus({ mode }: { readonly mode: AppMode }) {
  const count = useVenueCount();
  return (
    <p className="ui-mode" data-mode={mode}>
      <span className="ui-live-dot" aria-hidden="true" />
      <span>{MODE_TEXT[mode].label}</span>
      {count === null ? null : (
        <span>
          {" · "}
          <Num>{String(count.read)}</Num> of <Num>{String(count.total)}</Num> venues read
        </span>
      )}
    </p>
  );
}

// The default wallet chip when no WalletChip is supplied: a 44 px button that opens whatever `onConnect` opens.
function WalletChipButton({ label, onConnect }: { readonly label: string | undefined; readonly onConnect: () => void }) {
  return (
    <button type="button" className="ui-wallet-chip" onClick={onConnect}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true" focusable="false">
        <path d="M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2" />
      </svg>
      {label === undefined ? <span>Watch an address</span> : <Num>{label}</Num>}
    </button>
  );
}

// ---- screens --------------------------------------------------------------------------------------------------

// The page's one <h1> comes from the route's fixed title. Focus moves here on navigation (Outlet below). A route
// with `hero: true` renders that h1 itself inside a HeroBand, so the frame renders none.
function RouteFrame({ entry, mode, params }: { readonly entry: RouteEntry; readonly mode: AppMode; readonly params: Readonly<Record<string, string | undefined>> }) {
  const { title, availability, hero } = entry.meta;
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  const Screen = entry.Component;
  const blocked = availability === "cockpit" && mode === "standalone";
  return (
    <div className="ui-route" data-route={entry.meta.id}>
      {hero === true && !blocked ? null : (
        <h1 tabIndex={-1} data-route-heading="">
          {title}
        </h1>
      )}
      {blocked ? <NeedsCockpitTile what={`the data on the ${title} screen`} /> : <Screen params={params} />}
    </div>
  );
}

function FailedFrame({ failed }: { readonly failed: FailedRoute }) {
  return (
    <ErrorTile
      code="ROUTE_FAILED"
      title="A screen could not be loaded"
      message={`The file ${failed.file.replace(/^\.\/routes\//, "")} was skipped: ${failed.reason}. The other screens are unaffected.`}
    />
  );
}

// Shown at "/" only while no route claims that path (the surface's home route does). Lists every screen with a
// fixed path, since there is no navigation bar.
function Overview({ routes, mode }: { readonly routes: readonly ResolvedRoute[]; readonly mode: AppMode }) {
  useEffect(() => {
    document.title = `Overview · ${APP_NAME}`;
  }, []);
  const entries = routes.filter((entry): entry is RouteEntry => entry.status === "ok" && !entry.meta.path.includes(":"));
  return (
    <div className="ui-route" data-route="overview">
      <h1 tabIndex={-1} data-route-heading="">
        Overview
      </h1>
      <p>{MODE_TEXT[mode].detail}</p>
      {entries.length === 0 ? (
        <EmptyTile title="No screens are installed in this build">There is nothing to open yet. This is a build with no screens, not an error.</EmptyTile>
      ) : (
        <>
          <h2>Screens</h2>
          <ul>
            {entries.map((entry) => (
              <li key={entry.meta.id}>
                <Link href={entry.meta.path}>{entry.meta.nav?.label ?? entry.meta.title}</Link>
                {entry.meta.availability === "cockpit" && mode === "standalone" ? " (needs the Cockpit)" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function NotFound() {
  useEffect(() => {
    document.title = `Not found · ${APP_NAME}`;
  }, []);
  return (
    <div className="ui-route" data-route="not-found">
      <h1 tabIndex={-1} data-route-heading="">
        Page not found
      </h1>
      <Tile tone="neutral" title="There is no screen at this address">
        <p>
          <Link href="/">Go to the start</Link>
        </p>
      </Tile>
    </div>
  );
}

// A screen that failed to load is reported on every page, so a missing screen is never mistaken for "this
// build has no such feature".
function BrokenScreens({ routes }: { readonly routes: readonly ResolvedRoute[] }) {
  const failed = routes.filter((entry): entry is FailedRoute => entry.status === "failed");
  if (failed.length === 0) return null;
  return (
    <Disclosure summary={`${failed.length} screen${failed.length === 1 ? "" : "s"} could not be loaded`}>
      {failed.map((entry) => (
        <FailedFrame key={entry.file} failed={entry} />
      ))}
    </Disclosure>
  );
}

// ---- outlet: routing, focus and announcements -----------------------------------------------------------------

function Outlet({ routes, mode }: { readonly routes: readonly ResolvedRoute[]; readonly mode: AppMode }) {
  const [location] = useLocation();
  const announce = useAnnounce();
  const container = useRef<HTMLDivElement>(null);
  const lastLocation = useRef<string | null>(null);

  // On a navigation (not on first load, which keeps the browser's own focus) move focus to the new page
  // heading and say where we are. Keyed on the location, so a StrictMode double run does nothing.
  useEffect(() => {
    if (lastLocation.current === location) return;
    const first = lastLocation.current === null;
    lastLocation.current = location;
    if (first) return;
    const heading = container.current?.querySelector<HTMLElement>("[data-route-heading]");
    if (heading === null || heading === undefined) return;
    heading.focus();
    announce(`${heading.textContent ?? "Page"} page`);
  }, [location, announce]);

  const entries = routes.filter((entry): entry is RouteEntry => entry.status === "ok");
  const hasHome = entries.some((entry) => entry.meta.path === "/");
  return (
    <div ref={container}>
      <RouteErrorBoundary resetKey={location}>
        <Switch>
          {entries.map((entry) => (
            <Route key={entry.meta.id} path={entry.meta.path}>
              {(params) => <RouteFrame entry={entry} mode={mode} params={params} />}
            </Route>
          ))}
          {hasHome ? null : (
            <Route path="/">
              <Overview routes={routes} mode={mode} />
            </Route>
          )}
          <Route>
            <NotFound />
          </Route>
        </Switch>
      </RouteErrorBoundary>
    </div>
  );
}

// ---- shell ----------------------------------------------------------------------------------------------------

export interface ShellProps {
  readonly routes: readonly ResolvedRoute[];
  // Rendered in the session status strip under the top bar when present. Kept for one step while the dock
  // takes over the paired/unpaired words; the standalone build never passes it.
  readonly statusBar?: ReactNode;
  // The wallet chip (features/wallet WalletChip). Rendered before the theme control.
  readonly topBarEnd?: ReactNode;
  // The footer dock (features/terminal Dock): a strip that expands into the terminal and the signing inbox.
  // Without it the footer shows the build's own words.
  readonly dock?: ReactNode;
  // Without `topBarEnd`, a default wallet chip button that calls this; `walletLabel` is its mono text (a short
  // watched address) when one is watched. Neither renders anything when both `topBarEnd` and this are absent.
  readonly onConnect?: () => void;
  readonly walletLabel?: string;
}

export function Shell({ routes, statusBar, topBarEnd, dock, onConnect, walletLabel }: ShellProps) {
  const mode = useAppMode();
  const text = MODE_TEXT[mode];
  const main = useRef<HTMLElement>(null);
  const chip = topBarEnd !== undefined ? topBarEnd : onConnect === undefined ? null : <WalletChipButton label={walletLabel} onConnect={onConnect} />;
  return (
    <div className="ui-shell">
      <DitherDefs />
      <a
        className="ui-skip-link"
        href="#main"
        onClick={(event) => {
          // The hash router owns location.hash, so the browser's own "jump to #main" would navigate.
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="ui-header">
        <div className="ui-container ui-header-row">
          <Link href="/" className="ui-brand">
            <BrandMark />
            <span>{BRAND}</span>
          </Link>
          <TopBarSearch />
          <div className="ui-header-tools">
            <ModeStatus mode={mode} />
            {chip}
            <ThemeToggle />
          </div>
        </div>
      </header>
      {statusBar === undefined ? (
        <div />
      ) : (
        <div className="ui-statusbar" role="region" aria-label="Session status">
          <div className="ui-container">{statusBar}</div>
        </div>
      )}
      <main id="main" className="ui-main ui-container" tabIndex={-1} ref={main}>
        <BrokenScreens routes={routes} />
        <Outlet routes={routes} mode={mode} />
      </main>
      <footer className="ui-dock">
        {dock !== undefined ? (
          dock
        ) : (
          <div className="ui-container ui-dock-strip">
            <p>{text.detail} Prices and positions are shown for information, not as advice. Anything not yet proven by a live test is labelled unproven.</p>
          </div>
        )}
      </footer>
    </div>
  );
}
