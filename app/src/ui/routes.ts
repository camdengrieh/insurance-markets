import type { ComponentType } from "react";

import type { RouteMeta, RouteProps } from "./route-types";

// Turns the module loaders found by import.meta.glob into validated route entries. Pure and async: tests pass
// fake loaders. Everything fails closed and per route: a module that throws on import, has no default export,
// declares bad metadata or collides with another route becomes a "failed" entry that the shell shows as an
// error tile, and every other route keeps working.

export type Loader = () => Promise<unknown>;

export interface RouteEntry {
  readonly status: "ok";
  readonly file: string;
  readonly meta: RouteMeta;
  readonly Component: ComponentType<RouteProps>;
}

export interface FailedRoute {
  readonly status: "failed";
  readonly file: string;
  // Fixed wording from this file; never the module's own error message (it could carry anything).
  readonly reason: string;
}

export type ResolvedRoute = RouteEntry | FailedRoute;

const ID = /^[a-z][a-z0-9-]{0,39}$/;
const PATH = /^\/(?:[A-Za-z0-9_.~-]+|:[A-Za-z][A-Za-z0-9_]*)?(?:\/(?:[A-Za-z0-9_.~-]+|:[A-Za-z][A-Za-z0-9_]*))*$/;
const MAX_TITLE = 60;
const MAX_LABEL = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Why metadata is unacceptable, or null when it is fine.
export function metaProblem(meta: unknown): string | null {
  if (!isRecord(meta)) return "the route export is missing or not an object";
  const { id, path, title, nav, availability } = meta;
  if (typeof id !== "string" || !ID.test(id)) return "the route id must be lower-case kebab text";
  if (typeof path !== "string" || !PATH.test(path) || path.split("/").some((part) => part === "." || part === "..")) return "the route path is not a plain wouter path";
  if (typeof title !== "string" || title.trim() === "" || title.length > MAX_TITLE) return "the route title must be short non-empty text";
  if (availability !== undefined && availability !== "any" && availability !== "cockpit") return "availability must be any or cockpit";
  if (nav !== undefined) {
    if (!isRecord(nav)) return "nav must be an object";
    if (typeof nav.label !== "string" || nav.label.trim() === "" || nav.label.length > MAX_LABEL) return "nav.label must be short non-empty text";
    if (typeof nav.order !== "number" || !Number.isFinite(nav.order)) return "nav.order must be a finite number";
    if (path.includes(":")) return "a route with a parameter in its path cannot be in the navigation";
  }
  return null;
}

async function load(file: string, loader: Loader): Promise<ResolvedRoute> {
  let module: unknown;
  try {
    module = await loader();
  } catch {
    return { status: "failed", file, reason: "the screen could not be loaded" };
  }
  if (!isRecord(module)) return { status: "failed", file, reason: "the screen module is empty" };
  const problem = metaProblem(module.route);
  if (problem !== null) return { status: "failed", file, reason: problem };
  if (typeof module.default !== "function" && !(isRecord(module.default) && "$$typeof" in module.default)) {
    return { status: "failed", file, reason: "the screen has no default component" };
  }
  return { status: "ok", file, meta: module.route as RouteMeta, Component: module.default as ComponentType<RouteProps> };
}

// Loads every route, then rejects duplicates (both parties fail: neither can be trusted to be the intended
// one) and returns a deterministic order: nav order, then id; failed entries last by file name.
export async function resolveRoutes(loaders: Readonly<Record<string, Loader>>): Promise<ResolvedRoute[]> {
  const files = Object.keys(loaders).sort();
  const loaded = await Promise.all(files.map((file) => load(file, loaders[file] as Loader)));

  const byId = new Map<string, number>();
  const byPath = new Map<string, number>();
  for (const entry of loaded) {
    if (entry.status !== "ok") continue;
    byId.set(entry.meta.id, (byId.get(entry.meta.id) ?? 0) + 1);
    byPath.set(entry.meta.path, (byPath.get(entry.meta.path) ?? 0) + 1);
  }
  const checked: ResolvedRoute[] = loaded.map((entry) => {
    if (entry.status !== "ok") return entry;
    if ((byId.get(entry.meta.id) ?? 0) > 1) return { status: "failed", file: entry.file, reason: "another screen uses the same route id" };
    if ((byPath.get(entry.meta.path) ?? 0) > 1) return { status: "failed", file: entry.file, reason: "another screen uses the same path" };
    return entry;
  });

  const ok = checked.filter((entry): entry is RouteEntry => entry.status === "ok");
  const failed = checked.filter((entry): entry is FailedRoute => entry.status === "failed");
  ok.sort((a, b) => (a.meta.nav?.order ?? Number.MAX_SAFE_INTEGER) - (b.meta.nav?.order ?? Number.MAX_SAFE_INTEGER) || a.meta.id.localeCompare(b.meta.id));
  return [...ok, ...failed];
}

export function navEntries(routes: readonly ResolvedRoute[]): RouteEntry[] {
  return routes.filter((entry): entry is RouteEntry => entry.status === "ok" && entry.meta.nav !== undefined);
}
