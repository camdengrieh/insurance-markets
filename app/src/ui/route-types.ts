import type { ComponentType } from "react";

// The contract between the shell and the screens. A screen is one file, app/src/routes/<name>.tsx, with
//   export const route: RouteMeta = { ... };
//   export default function Screen(props: RouteProps) { ... }
// The shell finds every such file with import.meta.glob("./routes/*.tsx") (App.tsx), so adding a screen
// never edits a shared registry. The shell renders the page's single <h1> from `route.title` and moves focus
// to it on navigation; the screen renders its content only (use <h2> and below).
//
// `title` is FIXED APP TEXT. It becomes the h1, the document title and a live-region announcement, so it
// must never contain market text. A market page is titled "Market" and shows the market's own title in the
// untrusted slot (<UntrustedText>) inside the content.

export interface NavMeta {
  // Link text (fixed app text).
  readonly label: string;
  // Lower numbers first; ties break on the route id.
  readonly order: number;
}

export interface RouteMeta {
  // Stable kebab-case id, unique across routes: "markets", "market", "portfolio".
  readonly id: string;
  // wouter pattern, starting with "/": "/markets", "/market/:venue/:marketId". The router is hash-based.
  readonly path: string;
  readonly title: string;
  // Present: the route appears in the primary navigation. Only static paths (no ":param") can be in nav.
  readonly nav?: NavMeta;
  // "cockpit": needs the local daemon. In the standalone build the shell shows the "needs the Cockpit" tile
  // and never loads the screen's component. Default "any".
  readonly availability?: "any" | "cockpit";
}

export type RouteParams = Readonly<Record<string, string | undefined>>;

export interface RouteProps {
  readonly params: RouteParams;
}

export interface RouteModule {
  readonly route: RouteMeta;
  readonly default: ComponentType<RouteProps>;
}
