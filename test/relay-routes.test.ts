import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTRACT_ROUTE_KEYS, type RouteKey } from "../src/relay/contract.js";
import { ALL_FLAGS_OFF } from "../src/relay/flags.js";
import { isRouteKey, mergeRoutes, routes, unimplementedRouteKeys } from "../relay/routes.js";
import type { RelayContext, RouteTable } from "../relay/types.js";

const CONTEXT: RelayContext = {
  flags: () => ALL_FLAGS_OFF,
  now: () => 1_800_000_000_000,
  requestId: "req-1",
  signal: new AbortController().signal,
  services: {},
};

const HEALTH = {
  status: "ok" as const,
  version: "0.2.0",
  time: "2026-10-19T12:00:00Z",
  kill: false,
  flags: { ...ALL_FLAGS_OFF },
  tripwires: { ok: true, tripped: [] },
  upstream: {},
};

// Typed against the contract: a wrong response shape here would fail the type check.
const healthTable: RouteTable = { "GET /v1/health": async () => HEALTH };
const statusTable: RouteTable = {
  "POST /v1/funding/check": async (body) => ({
    permitted: false,
    account: body.owner,
    state: "undeployed",
    reserved_usd: "0",
    funding_id: null,
    expires_at: null,
    funding_remaining_usd: "10",
    reasons: [{ code: "not_deployed", message: "Deploy the account first." }],
  }),
};

describe("relay routes", () => {
  it("knows exactly the contract's routes", () => {
    for (const key of CONTRACT_ROUTE_KEYS) assert.equal(isRouteKey(key), true, key);
    for (const bad of ["POST /v1/nope", "GET /v1/account/status", "DELETE /v1/health", "", "POST", "get /v1/health"]) {
      assert.equal(isRouteKey(bad), false, bad);
    }
  });

  it("merges tables and runs a typed handler", async () => {
    const merged = mergeRoutes(healthTable, statusTable);
    assert.deepEqual(Object.keys(merged).sort(), ["GET /v1/health", "POST /v1/funding/check"]);
    assert.deepEqual(await merged["GET /v1/health"]?.({}, CONTEXT), HEALTH);
    const answer = await merged["POST /v1/funding/check"]?.(
      { owner: `0x${"0".repeat(39)}1`, amount: "1" },
      CONTEXT,
    );
    assert.equal(answer?.permitted, false);
  });

  it("refuses a route registered twice", () => {
    assert.throws(() => mergeRoutes(healthTable, healthTable), /registered twice/);
  });

  it("refuses a route that is not in the contract", () => {
    const bogus = { "POST /v1/withdraw-everything": async () => ({}) } as unknown as RouteTable;
    assert.throws(() => mergeRoutes(bogus), /not in the contract/);
  });

  it("freezes the merged table", () => {
    const merged = mergeRoutes(healthTable);
    assert.ok(Object.isFrozen(merged));
  });

  it("lists contract routes that have no handler", () => {
    assert.deepEqual(unimplementedRouteKeys({}), [...CONTRACT_ROUTE_KEYS]);
    const missing: RouteKey[] = unimplementedRouteKeys(mergeRoutes(healthTable));
    assert.ok(!missing.includes("GET /v1/health"));
    assert.equal(missing.length, CONTRACT_ROUTE_KEYS.length - 1);
  });

  it("aggregates the handler modules without duplicates and only with contract routes", () => {
    for (const key of Object.keys(routes)) assert.equal(isRouteKey(key), true, key);
    assert.ok(unimplementedRouteKeys().length <= CONTRACT_ROUTE_KEYS.length);
  });
});
