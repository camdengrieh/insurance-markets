import assert from "node:assert/strict";
import { test } from "node:test";
import { PLATFORM_RECORDS } from "../../registry/records.js";
import { validateRegistry } from "../../registry/validate.js";
import type { PlatformRecord } from "../../registry/types.js";

// Built at runtime so no absolute home-style path appears in the repo.
const HOME_PREFIX = ["", "Users", "someone"].join("/");

function base(): PlatformRecord[] {
  return PLATFORM_RECORDS.map((r) => structuredClone(r) as PlatformRecord);
}
function patch(id: string, fn: (r: any) => void): PlatformRecord[] {
  const recs = base();
  const rec = recs.find((r) => r.id === id);
  assert.ok(rec);
  fn(rec);
  return recs;
}
function has(problems: string[], re: RegExp): boolean {
  return problems.some((p) => re.test(p));
}

test("a clone of the bundled records is clean", () => {
  assert.deepEqual(validateRegistry(base()), []);
});

test("duplicate and missing ids are reported", () => {
  const dup = [...base(), structuredClone(PLATFORM_RECORDS[0]!) as PlatformRecord];
  assert.ok(has(validateRegistry(dup), /duplicate id/));
  assert.ok(has(validateRegistry(base().slice(1)), /no record for a registry venue id/));
});

test("meta problems: bad date, ttl, missing sources, absolute source path", () => {
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.meta.lastVerified = "2026-02-30"))), /bad lastVerified/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.meta.ttlDays = 0))), /bad ttlDays/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.meta.ttlDays = 365))), /exceeds/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.meta.sources = []))), /no sources/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.meta.sources = [`${HOME_PREFIX}/x.md`]))), /repo-relative/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.meta.sources = ["https://example.com/x"]))), /repo-relative/));
});

test("verification labels must match confidence and method", () => {
  assert.ok(
    has(
      validateRegistry(patch("xo", (r) => {
        r.fees.meta.confidence = "L";
        r.fees.meta.verification = "verified";
      })),
      /verified requires confidence H/,
    ),
  );
  assert.ok(
    has(
      validateRegistry(patch("xo", (r) => {
        r.fees.meta.method = "vendor_claim";
        r.fees.meta.verification = "verified";
      })),
      /first-hand method/,
    ),
  );
  assert.ok(
    has(
      validateRegistry(patch("polymarket", (r) => (r.fees.meta.verification = "unverified"))),
      /must be labelled verified/,
    ),
  );
});

test("long strings and forbidden patterns are rejected", () => {
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.dataTerms.value.clause = "x".repeat(201)))), /longer than 200/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.dataTerms.value.clause = "mail me at a@b.example"))), /forbidden/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.dataTerms.value.clause = `see ${HOME_PREFIX}/notes`))), /forbidden/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.identity.value.urls.apiBase = ["http://insecure.example"]))), /must be https/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.identity.value.urls.apiBase = ["https://h.example/x?key=1"]))), /query/));
});

test("fee rules: unknown model fails closed; known model needs a formula and a source", () => {
  assert.ok(
    has(
      validateRegistry(patch("hyperliquid", (r) => (r.fees.value.useRule = "read_live"))),
      /unknown model must be status unknown and fail closed/,
    ),
  );
  assert.ok(has(validateRegistry(patch("polymarket", (r) => (r.fees.value.formula = null))), /needs a formula/));
  assert.ok(has(validateRegistry(patch("polymarket", (r) => (r.fees.value.paramsSource = null))), /needs a params source/));
  assert.ok(has(validateRegistry(patch("polymarket", (r) => (r.fees.value.status = "unknown"))), /cannot have status unknown/));
  assert.ok(has(validateRegistry(patch("polymarket", (r) => (r.fees.value.feeSpecId = "polymarket:curve_min"))), /feeSpecId does not match/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.value.secondarySource = null))), /conflicted needs a secondary/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.fees.value.useRule = "read_live"))), /conflicted needs a secondary/));
  assert.ok(has(validateRegistry(patch("gemini", (r) => (r.fees.value.useRule = "read_live"))), /docs_only/));
  assert.ok(has(validateRegistry(patch("gemini", (r) => (r.fees.value.indicative = { taker: "7%" }))), /plain decimal/));
});

test("data terms: a restricted clause must state memory-only", () => {
  assert.ok(
    has(validateRegistry(patch("kalshi", (r) => (r.dataTerms.value.clause = "Restricted."))), /memory-only/),
  );
  assert.ok(has(validateRegistry(patch("kalshi", (r) => (r.dataTerms.value.clause = " "))), /empty clause/));
});

test("links: dangling, self and non-representative routes_to are reported", () => {
  assert.ok(
    has(
      validateRegistry(patch("limitless", (r) => r.links.value.liquidityLinks.push({ relation: "mirror_of", target: "nope" }))),
      /dangling/,
    ),
  );
  assert.ok(
    has(
      validateRegistry(patch("limitless", (r) => r.links.value.liquidityLinks.push({ relation: "mirror_of", target: "limitless" }))),
      /link to itself/,
    ),
  );
  const recs = patch("xo", (r) => r.links.value.liquidityLinks.push({ relation: "routes_to", target: "kalshi" }));
  const kalshi = recs.find((r) => r.id === "kalshi") as any;
  kalshi.links.value.liquidityLinks.push({ relation: "routes_to", target: "polymarket" });
  assert.ok(has(validateRegistry(recs), /not a pool representative/));
});

test("collateral, regions, reachability and adapter mapping are checked", () => {
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.collateral.value.chain = "3223"))), /bad chain id/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.collateral.value.decimals = -1))), /bad decimals/));
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.geo.value.restrictedRegions = ["usa"]))), /bad region code/));
  assert.ok(
    has(
      validateRegistry(patch("hyperliquid", (r) => (r.reachability.value.proof = "testnet"))),
      /proof needs a class/,
    ),
  );
  assert.ok(has(validateRegistry(patch("xo", (r) => (r.adapterVenueId = "kalshi"))), /adapterVenueId/));
});
