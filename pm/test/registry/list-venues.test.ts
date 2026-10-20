import assert from "node:assert/strict";
import { test } from "node:test";
import { REGISTRY_VENUE_IDS } from "../../registry/ids.js";
import {
  capabilityDisplay,
  listVenues,
  listVenuesInputSchema,
  type ListVenuesResult,
  type VenueRow,
} from "../../registry/list-venues.js";
import { registryContentSha256 } from "../../registry/registry.js";
import { SECTION_KEYS } from "../../registry/staleness.js";

const DAY = 86_400_000;
const VERIFIED = Date.parse("2026-10-19T00:00:00Z");
const NOW = VERIFIED + DAY / 2; // everything fresh
const SIZE_LIMIT = 256 * 1024;

function ok(input: unknown, now: number): ListVenuesResult {
  const out = listVenues(input, now);
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("unreachable");
  return out.value;
}
function row(res: ListVenuesResult, id: string): VenueRow {
  const r = res.venues.find((v) => v.id === id);
  assert.ok(r, id);
  return r;
}

test("lists every venue offline with registry metadata", () => {
  const res = ok({}, NOW);
  assert.equal(res.count, 14);
  assert.deepEqual(res.venues.map((v) => v.id), [...REGISTRY_VENUE_IDS]);
  assert.equal(res.contentSha256, registryContentSha256());
  assert.equal(res.asOfMs, NOW);
  assert.ok(res.notices.length >= 4);
  // Absent input behaves like an empty object.
  assert.deepEqual(ok(undefined, NOW), res);
});

test("output is deterministic and small enough for a tool result", () => {
  const a = JSON.stringify(ok({}, NOW));
  const b = JSON.stringify(ok({}, NOW));
  assert.equal(a, b);
  assert.ok(a.length < SIZE_LIMIT, `${a.length} bytes`);
});

test("rows expose fee ids, geo and bot flags, tier, reachability class and freshness", () => {
  const res = ok({}, NOW);
  const xo = row(res, "xo");
  assert.equal(xo.fees === "unknown" ? "" : xo.fees.feeSpecId, "xo:curve_pq");
  assert.equal(xo.fees === "unknown" ? "" : xo.fees.status, "conflicted");
  assert.equal(xo.liquidityTier, "C");
  assert.equal(xo.reachability === "unknown" ? "" : xo.reachability.class, "E2");
  assert.equal(xo.geo === "unknown" ? "" : xo.geo.botsPolicy, "conditional");
  assert.equal(xo.sections.fees.lastVerified, "2026-10-19");
  assert.equal(xo.sections.fees.freshness, "fresh");
  assert.equal(xo.sections.fees.verification, "unverified");
  assert.equal(xo.sections.fees.gateUsable, false); // conflicted fees can never gate
  assert.equal(row(res, "polymarket").sections.fees.gateUsable, true);
  assert.equal(row(res, "trueo").liquidityTier, "X");
  for (const r of res.venues) assert.deepEqual(Object.keys(r.sections), [...SECTION_KEYS]);
});

test("a capability that is not recorded as yes shows unproven", () => {
  assert.equal(capabilityDisplay("yes"), "yes");
  assert.equal(capabilityDisplay("no"), "unproven");
  assert.equal(capabilityDisplay("unknown"), "unproven");
  const res = ok({}, NOW);
  for (const r of res.venues) {
    if (r.capabilities === "unknown") continue;
    for (const v of Object.values(r.capabilities)) assert.ok(v === "yes" || v === "unproven");
  }
  const kalshi = row(res, "kalshi");
  const caps = kalshi.capabilities;
  assert.notEqual(caps, "unknown");
  if (typeof caps !== "string") {
    assert.equal(caps.search, "unproven"); // recorded "no"
    assert.equal(caps.getBooksBatch, "unproven"); // recorded unknown
    assert.equal(caps.getBook, "yes");
  }
  const hl = row(res, "hyperliquid");
  if (hl.capabilities !== "unknown") assert.equal(hl.capabilities.readKeyless, "unproven");
});

test("restricted venues carry the clause and are memory-only with the adapter off", () => {
  const k = row(ok({}, NOW), "kalshi").dataTerms;
  assert.equal(k.restricted, "restricted");
  assert.equal(k.memoryOnly, true);
  assert.equal(k.adapterDefault, "off");
  assert.match(k.clause, /memory-only/);
  const x = row(ok({}, NOW), "xo").dataTerms;
  assert.equal(x.memoryOnly, false);
  assert.equal(x.adapterDefault, "on");
});

test("stale sections stay visible with age, but gate use is blocked", () => {
  // 2 days after verification: status (ttl 1) is stale; fees (ttl 30) are still fresh.
  const res = ok({}, VERIFIED + 2 * DAY);
  const xo = row(res, "xo");
  assert.equal(xo.sections.status.freshness, "stale");
  assert.equal(xo.sections.status.ageDays, 2);
  assert.equal(xo.sections.status.gateUsable, false);
  assert.equal(xo.status, "live"); // still displayed
  assert.equal(xo.sections.fees.freshness, "fresh");
});

test("expired sections read unknown and fail closed", () => {
  // status ttl 1 expires after 2 days; at day 4 it is expired. Liquidity (7) is stale at day 10.
  const res = ok({}, VERIFIED + 4 * DAY);
  const xo = row(res, "xo");
  assert.equal(xo.sections.status.freshness, "expired");
  assert.equal(xo.status, "unknown");
  assert.equal(xo.fees === "unknown", false);
  const later = ok({}, VERIFIED + 200 * DAY);
  for (const r of later.venues) {
    assert.equal(r.status, "unknown");
    assert.equal(r.fees, "unknown");
    assert.equal(r.geo, "unknown");
    assert.equal(r.reachability, "unknown");
    assert.equal(r.capabilities, "unknown");
    assert.equal(r.liquidityTier, "unknown");
    assert.equal(r.dataTerms.memoryOnly, true); // terms expired: restriction returns
    assert.equal(r.dataTerms.adapterDefault, "off");
    for (const key of SECTION_KEYS) assert.equal(r.sections[key].gateUsable, false);
  }
});

test("a clock before the verification date is expired, not fresh", () => {
  const res = ok({}, VERIFIED - DAY);
  for (const r of res.venues) assert.equal(r.fees, "unknown");
});

test("filters: venues, reachability, tiers and memoryOnly", () => {
  assert.deepEqual(ok({ venues: ["xo", "kalshi"] }, NOW).venues.map((v) => v.id), ["xo", "kalshi"]);
  assert.deepEqual(
    ok({ reachability: ["E1"] }, NOW).venues.map((v) => v.id),
    ["trueo"],
  );
  assert.deepEqual(
    ok({ tiers: ["A"] }, NOW).venues.map((v) => v.id),
    ["polymarket", "kalshi"],
  );
  assert.deepEqual(
    ok({ memoryOnly: false }, NOW).venues.map((v) => v.id),
    ["xo", "polymarket", "trueo", "limitless", "manifold"],
  );
  assert.equal(ok({ venues: [] }, NOW).count, 0);
  // Expired values match nothing: filtering by a tier hides a venue whose tier is hidden.
  assert.equal(ok({ tiers: ["A"] }, VERIFIED + 200 * DAY).count, 0);
  assert.equal(ok({ reachability: ["unknown"] }, VERIFIED + 200 * DAY).count, 14);
});

test("bad input and a bad clock are refused", () => {
  for (const bad of [{ venues: ["nope"] }, { extra: 1 }, { venues: "xo" }, { tiers: ["Z"] }, { memoryOnly: "yes" }, "x", 7]) {
    const out = listVenues(bad, NOW);
    assert.equal(out.ok, false, JSON.stringify(bad));
    if (!out.ok) assert.equal(out.error, "BAD_INPUT");
  }
  for (const clock of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const out = listVenues({}, clock);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.error, "BAD_CLOCK");
  }
  assert.equal(listVenuesInputSchema.safeParse({ venues: Array(15).fill("xo") }).success, false);
});

test("the view carries no notes, no dollar metrics, no email or home path and no profit claim", () => {
  const text = JSON.stringify(ok({}, NOW));
  assert.equal(/"notes"/.test(text), false);
  assert.equal(/\$\d/.test(text), false);
  assert.equal(/\/Users\/|\/home\/|\/private\//.test(text), false);
  assert.equal(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/.test(text), false);
  assert.equal(/guarantee|risk-free|riskless/i.test(text.replace(/does not rank them as profitable/g, "")), false);
  const res = ok({}, NOW);
  assert.ok(res.notices.some((n) => /not trading advice/.test(n)));
});
