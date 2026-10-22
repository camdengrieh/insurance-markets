import assert from "node:assert/strict";
import { test } from "node:test";

import { API_SERVING_POLICY, checkBody, ServingViolation } from "../../api/serving.js";
import type { FetchLike, VenueId } from "../../sdk/model.js";
import { apiServability } from "../../sdk/venues/licence.js";
import { VENUE_IDS, venuePolicy } from "../../sdk/venues/policy.js";
import { CHAIN_ONLY_REASON, FAKE_VENUE_STATES, fakeVenue, type FakeVenueState } from "../../sdk/venues/testkit/index.js";
import { API_LIMITS } from "../../api/config.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LINK_VENUE_IDS } from "../../sdk/links/schema.js";
import { emptyRegistry } from "../../sdk/links/store.js";
import { approve, Clock, forbiddenFetch, identity, leg, propose, SLOT_EQUAL, startHarness, STATISTICS, testConfig, trueoWorld, venuesNamed, writeBundle } from "./helpers.js";

// docs/sdk-and-api-design.md section 5 is binding: the API never serves Quotient data, an own_use_only venue, a venue
// whose licence is unknown, or a link as approved unless a person approved it. This walks every endpoint against every
// venue class with the REAL serving policy, and the one served venue (Trueo, open licence, read on chain) against a fake
// upstream in each read state (sdk/venues/testkit). A venue that is not served must never be asked, and must never appear
// under a `venue` key in any answer.

// The walk sends far more than a client may: the rate limits are tested on their own (http.test.ts).
function roomyConfig(env: Record<string, string> = {}) {
  const config = testConfig(env);
  return { ...config, limits: { ...API_LIMITS, markets: { capacity: 10_000, refillPerSecond: 1 }, reads: { capacity: 10_000, refillPerSecond: 1 } } };
}

const NOT_A_VENUE = ["quotient", "Quotient", "unknown_venue", "__proto__"];
const SERVED = VENUE_IDS.filter((id) => apiServability(id).served);

test("the policy serves exactly the venues with a recorded licence, and refuses each class for its reason", () => {
  assert.deepEqual(SERVED, ["trueo"]);
  const byClass = new Map<string, string[]>();
  for (const id of VENUE_IDS) {
    const verdict = apiServability(id);
    const key = verdict.served ? "served" : verdict.code;
    byClass.set(key, [...(byClass.get(key) ?? []), id]);
  }
  // The six own_use_only venues of section 5, and every venue without a licence class.
  assert.deepEqual(byClass.get("own_use_only")?.sort(), ["gemini", "kalshi", "novig", "og", "prophetx", "udx"]);
  assert.deepEqual(byClass.get("licence_unknown")?.sort(), VENUE_IDS.filter((id) => venuePolicy(id).license === "unknown").sort());
  for (const id of NOT_A_VENUE) assert.equal(apiServability(id).served, false, id);
});

test("checkBody refuses any answer that names a venue the policy does not serve", () => {
  assert.doesNotThrow(() => checkBody(API_SERVING_POLICY, { markets: [{ venue: "trueo" }], venues: [{ id: "kalshi" }] }));
  for (const venue of [...VENUE_IDS.filter((id) => !SERVED.includes(id)), ...NOT_A_VENUE, 7, null]) {
    assert.throws(() => checkBody(API_SERVING_POLICY, { deep: [{ x: { venue } }] }), ServingViolation, String(venue));
  }
});

// Link bundles with, for every venue a link may name, one approved and one proposed link between Trueo and that venue.
function linkEnv(): { env: Record<string, string>; pairs: number } {
  let reg = emptyRegistry();
  let pairs = 0;
  for (const venue of LINK_VENUE_IDS) {
    const approved = propose(reg, identity(leg("trueo", `a-${venue}`), leg(venue, `b-${venue}`, `a-${venue}`), SLOT_EQUAL), "structural");
    reg = approve(approved.registry, approved.link.linkId);
    reg = propose(reg, identity(leg("trueo", `c-${venue}`), leg(venue, `d-${venue}`), STATISTICS), "statistics").registry;
    pairs += 1;
  }
  const dir = mkdtempSync(join(tmpdir(), "api-gate-"));
  const links = writeBundle(dir, "links", reg, false);
  const candidates = writeBundle(dir, "candidates", reg, true);
  return { env: { API_LINKS_BUNDLE: links.bundle, API_LINKS_PIN: links.pin, API_CANDIDATES_BUNDLE: candidates.bundle, API_CANDIDATES_PIN: candidates.pin }, pairs };
}

function trueoFetch(state: FakeVenueState, okFetch: FetchLike, nowMs: () => number): { fetch: FetchLike; calls: () => number } {
  if (state === "ok") {
    let n = 0;
    return {
      fetch: async (input, init) => {
        n += 1;
        return okFetch(input, init);
      },
      calls: () => n,
    };
  }
  const fake = fakeVenue(state, () => null, { venue: "trueo", nowMs });
  return { fetch: fake.raw, calls: () => fake.calls.length };
}

for (const state of FAKE_VENUE_STATES) {
  test(`every endpoint against every venue class, with the served venue ${state}`, async () => {
    const world = await trueoWorld();
    const clock = new Clock(world.nowMs);
    const asked: string[] = [];
    const trueo = trueoFetch(state, world.fetch, clock.read);
    const fetchFor = (venue: VenueId): FetchLike => (venue === "trueo" ? trueo.fetch : forbiddenFetch(venue, asked));
    const links = linkEnv();
    const h = await startHarness({ fetchFor, clock, config: roomyConfig(links.env) });
    try {
      if (state === "chain_only") h.api.tracker.declareChainOnly("trueo", CHAIN_ONLY_REASON);
      const bodies: unknown[] = [];
      const get = async (path: string) => {
        const answer = await h.get(path);
        bodies.push(answer.json);
        return answer;
      };

      const health = await get("/v1/health");
      assert.equal(health.status, 200);
      assert.deepEqual(health.json["served"], ["trueo"]);

      const venues = await get("/v1/venues");
      assert.equal(venues.status, 200);
      const rows = venues.json["venues"] as Array<Record<string, unknown>>;
      assert.deepEqual(rows.map((r) => r["id"]), [...VENUE_IDS]);
      for (const row of rows) {
        const id = row["id"] as VenueId;
        assert.equal(row["served"], id === "trueo", id);
        assert.equal(row["reader"], id === "trueo", id);
        const verdict = apiServability(id);
        if (!verdict.served) {
          assert.equal((row["state"] as Record<string, unknown>)["kind"], "not_read", id);
          assert.equal((row["notServed"] as Record<string, unknown>)["code"], verdict.code, id);
        }
      }

      const all = await get("/v1/markets");
      assert.equal(all.status, 200);
      assert.deepEqual((all.json["venues"] as Array<Record<string, unknown>>).map((v) => v["venue"]), ["trueo"]);
      const markets = all.json["markets"] as Array<Record<string, unknown>>;
      if (state === "ok") {
        assert.ok(markets.length > 0, "the ok venue's rows are served");
        const first = markets[0] as Record<string, unknown>;
        const fields = first["fields"] as Record<string, Record<string, unknown>>;
        // Trueo is read from its contracts: a field read now is "chain", never "venue_api".
        assert.equal(fields["title"]?.["source"], "chain");
        assert.equal(fields["displayPrice"]?.["source"], "chain");
        assert.equal(typeof fields["title"]?.["ageMs"], "number");
      } else {
        assert.equal(markets.length, 0, "nothing was read and nothing is kept");
        const view = (all.json["venues"] as Array<Record<string, unknown>>)[0]?.["state"] as Record<string, unknown>;
        assert.equal(view["kind"], state === "throttled" ? "throttled" : state === "chain_only" ? "chain_only" : "blocked");
        assert.equal(typeof view["reason"], "string");
      }

      for (const venue of [...VENUE_IDS, ...NOT_A_VENUE]) {
        const listed = await get(`/v1/markets?venue=${encodeURIComponent(venue)}`);
        const one = await get(`/v1/markets/${encodeURIComponent(venue)}/8453:${world.liveAddress}`);
        if (venue === "trueo") {
          assert.equal(listed.status, 200);
          assert.equal(one.status, state === "ok" ? 200 : 503, `${state}: ${JSON.stringify(one.json).slice(0, 200)}`);
        } else {
          assert.equal(listed.status, 403, venue);
          assert.equal((listed.json["error"] as Record<string, unknown>)["code"], "venue_not_served", venue);
          // A path segment that is not a venue id's shape is no route at all.
          assert.ok(one.status === 403 || one.status === 404, `${venue}: ${one.status}`);
        }
      }

      const groups = await get("/v1/groups");
      assert.equal(groups.status, 200);
      // Only the Trueo-Trueo pair is served: approved as approved, the candidate as proposed. Every other pair is withheld.
      const approvedLinks = groups.json["approved"] as Array<Record<string, unknown>>;
      const proposedLinks = groups.json["proposed"] as Array<Record<string, unknown>>;
      assert.deepEqual(approvedLinks.map((l) => l["state"]), ["human_approved"]);
      assert.deepEqual(proposedLinks.map((l) => [l["state"], l["band"]]), [["proposed", "strong"]]);
      assert.equal((groups.json["withheld"] as Record<string, unknown>)["count"], 2 * (links.pairs - 1));

      // Nothing that is not served was asked, and no answer names it.
      assert.deepEqual(asked, []);
      for (const body of bodies) for (const venue of venuesNamed(body)) assert.ok(SERVED.includes(venue as VenueId), venue);
      if (state === "chain_only") assert.equal(trueo.calls(), 0, "a chain-only venue's API is never asked");
      if (state === "throttled" || state === "blocked_403" || state === "blocked_page") assert.equal(trueo.calls(), 1, "one refusal, and nothing retried around it");
    } finally {
      await h.close();
    }
  });
}

test("a venue that blocks after a good read keeps its rows, labelled cache with their age, venue-only fields nulled with the reason", async () => {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  let blocked = false;
  const block = fakeVenue("blocked_403", () => null, { venue: "trueo", nowMs: clock.read });
  const fetch: FetchLike = (input, init) => (blocked ? block.raw(input, init) : world.fetch(input, init));
  const h = await startHarness({ fetchFor: (venue) => (venue === "trueo" ? fetch : forbiddenFetch(venue, [])), clock });
  try {
    const first = await h.get("/v1/markets?venue=trueo");
    const before = first.json["markets"] as Array<Record<string, unknown>>;
    assert.ok(before.length > 0);
    blocked = true;
    clock.advance(61_000);
    const second = await h.get("/v1/markets?venue=trueo");
    const after = second.json["markets"] as Array<Record<string, unknown>>;
    assert.equal(after.length, before.length, "the blocked venue stays in the list");
    const row = after[0] as Record<string, unknown>;
    const fields = row["fields"] as Record<string, Record<string, unknown>>;
    assert.equal(fields["title"]?.["source"], "cache");
    assert.equal(fields["title"]?.["ageMs"], 61_000);
    assert.equal(fields["displayPrice"]?.["source"], null);
    assert.match(String(fields["displayPrice"]?.["reason"]), /blocked our reads at .*: 403/);
    for (const outcome of row["outcomes"] as Array<Record<string, unknown>>) assert.equal(outcome["displayPrice"], null);
    assert.notEqual((row["prov"] as Record<string, unknown>)["freshness"], "live");
    const view = (second.json["venues"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
    assert.equal((view["state"] as Record<string, unknown>)["kind"], "blocked");
    assert.equal(view["fresh"], false);
    // Inside the pause nothing is sent again.
    clock.advance(61_000);
    await h.get("/v1/markets?venue=trueo");
    assert.equal(block.calls.length, 1);
  } finally {
    await h.close();
  }
});
