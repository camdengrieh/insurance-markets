import { CONTRACT_ROUTE_KEYS, type RouteKey } from "../src/relay/contract.js";
import { routes as clobRoutes } from "./clob.js";
import { routes as creationRoutes } from "./creation.js";
import { routes as credentialsRoutes } from "./credentials.js";
import { routes as fundingRoutes } from "./funding.js";
import { routes as healthRoutes } from "./health.js";
import { routes as ordersRoutes } from "./orders.js";
import type { RouteTable } from "./types.js";
import { routes as useropsRoutes } from "./userops.js";

// Aggregates the handler modules. Who owns which route (stream in docs/phase1-gap-closing.md 5.3):
//   health.ts       relay-core      GET /v1/health, POST /v1/account/status
//   credentials.ts  relay-trading   POST /v1/auth/prepare, POST /v1/auth/submit
//   orders.ts       relay-trading   POST /v1/order/{prepare,submit,cancel}, POST /v1/orders/list,
//                                   GET /v1/order/:hash
//   userops.ts      relay-trading   POST /v1/userop/{prepare,submit}, GET /v1/userop/:hash
//   funding.ts      funding         POST /v1/funding/{check,report}
//   creation.ts     creation        POST /v1/creation/track
//   clob.ts         relay-trading   POST /v1/clob/{order,auth}/{prepare,submit} (Polymarket, Limitless)
// A route in two tables is a bug, so merging throws.

const KNOWN: ReadonlySet<string> = new Set(CONTRACT_ROUTE_KEYS);

export function isRouteKey(value: string): value is RouteKey {
  return KNOWN.has(value);
}

export function mergeRoutes(...tables: readonly RouteTable[]): RouteTable {
  const merged: Record<string, unknown> = {};
  for (const table of tables) {
    for (const [key, handler] of Object.entries(table)) {
      if (!isRouteKey(key)) throw new Error(`route ${key} is not in the contract`);
      if (Object.hasOwn(merged, key)) throw new Error(`route ${key} is registered twice`);
      merged[key] = handler;
    }
  }
  return Object.freeze(merged) as RouteTable;
}

export const routes: RouteTable = mergeRoutes(
  healthRoutes,
  credentialsRoutes,
  ordersRoutes,
  useropsRoutes,
  fundingRoutes,
  creationRoutes,
  clobRoutes,
);

// Contract routes with no handler yet. The server answers these with not_implemented.
export function unimplementedRouteKeys(table: RouteTable = routes): RouteKey[] {
  return CONTRACT_ROUTE_KEYS.filter((key) => !Object.hasOwn(table, key));
}
