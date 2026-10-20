import { useEffect, useRef, type ReactNode } from "react";
import { Link, Route, Switch, useLocation, useRoute } from "wouter";

import { useAnnounce } from "./a11y";
import { useAppMode, type AppMode } from "./context";
import { RouteErrorBoundary } from "./ErrorBoundary";
import { Badge, Disclosure } from "./primitives";
import { navEntries, type FailedRoute, type ResolvedRoute, type RouteEntry } from "./routes";
import { ThemeToggle } from "./ThemeToggle";
import { EmptyTile, ErrorTile, NeedsCockpitTile, Tile } from "./Tiles";

export const APP_NAME = "XO Cockpit";

const MODE_TEXT: Readonly<Record<AppMode, { readonly label: string; readonly detail: string }>> = {
  standalone: { label: "Standalone explorer", detail: "Read-only. Holds no key and reaches only the public venues listed in this page's security policy." },
  cockpit: { label: "Local Cockpit", detail: "Served from your own machine. Every read goes through your Cockpit; writes stay off unless you switch them on there." },
};

// ---- navigation -----------------------------------------------------------------------------------------------

function NavItem({ entry, mode }: { readonly entry: RouteEntry; readonly mode: AppMode }) {
  const [active] = useRoute(entry.meta.path);
  const nav = entry.meta.nav;
  if (nav === undefined) return null;
  const needsCockpit = entry.meta.availability === "cockpit" && mode === "standalone";
  return (
    <li>
      <Link href={entry.meta.path} aria-current={active ? "page" : undefined}>
        {nav.label}
        {needsCockpit ? <span className="ui-nav-note">(needs the Cockpit)</span> : null}
      </Link>
    </li>
  );
}

function PrimaryNav({ routes, mode }: { readonly routes: readonly ResolvedRoute[]; readonly mode: AppMode }) {
  const entries = navEntries(routes);
  return (
    <nav className="ui-nav" aria-label="Primary">
      <ul>
        <li>
          <HomeLink />
        </li>
        {entries.map((entry) => (
          <NavItem key={entry.meta.id} entry={entry} mode={mode} />
        ))}
      </ul>
    </nav>
  );
}

function HomeLink() {
  const [active] = useRoute("/");
  return (
    <Link href="/" aria-current={active ? "page" : undefined}>
      Overview
    </Link>
  );
}

// ---- screens --------------------------------------------------------------------------------------------------

// The page's one <h1> comes from the route's fixed title. Focus moves here on navigation (Outlet below).
function RouteFrame({ entry, mode, params }: { readonly entry: RouteEntry; readonly mode: AppMode; readonly params: Readonly<Record<string, string | undefined>> }) {
  const { title, availability } = entry.meta;
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  const Screen = entry.Component;
  return (
    <div className="ui-route" data-route={entry.meta.id}>
      <h1 tabIndex={-1} data-route-heading="">
        {title}
      </h1>
      {availability === "cockpit" && mode === "standalone" ? <NeedsCockpitTile what={`the data on the ${title} screen`} /> : <Screen params={params} />}
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

function Overview({ routes, mode }: { readonly routes: readonly ResolvedRoute[]; readonly mode: AppMode }) {
  useEffect(() => {
    document.title = `Overview · ${APP_NAME}`;
  }, []);
  const entries = navEntries(routes);
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
          <Link href="/">Go to the overview</Link>
        </p>
      </Tile>
    </div>
  );
}

// A screen that failed to load is reported on every page (not only the overview), so a missing screen is
// never mistaken for "this build has no such feature".
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
  // Rendered in the session status strip under the header when present (posture, ARM countdown, kill).
  // The daemon-session stream supplies it; the standalone build never does.
  readonly statusBar?: ReactNode;
}

export function Shell({ routes, statusBar }: ShellProps) {
  const mode = useAppMode();
  const text = MODE_TEXT[mode];
  const main = useRef<HTMLElement>(null);
  return (
    <div className="ui-shell">
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
          <p className="ui-brand">{APP_NAME}</p>
          <Badge tone={mode === "standalone" ? "info" : "ok"}>{text.label}</Badge>
          <PrimaryNav routes={routes} mode={mode} />
          <div className="ui-header-tools">
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
      <footer className="ui-footer">
        <div className="ui-container">
          <p>{text.detail} Prices and positions are shown for information, not as advice. Anything not yet proven by a live test is labelled unproven.</p>
        </div>
      </footer>
    </div>
  );
}
