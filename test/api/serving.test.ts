import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { API_LIMITS } from "../../api/config.js";
import { API_READER_VENUES } from "../../api/markets.js";
import { LINK_VENUE_IDS } from "../../sdk/links/schema.js";
import { emptyRegistry } from "../../sdk/links/store.js";
import type { FetchLike, VenueId } from "../../sdk/model.js";
import { VENUE_IDS } from "../../sdk/venues/policy.js";
import { CHAIN_ONLY_REASON, FAKE_VENUE_STATES, fakeVenue, json, type FakeVenueState } from "../../sdk/venues/testkit/index.js";
import { absentVenue, approve, Clock, forbiddenFetch, identity, leg, polymarketFixtures, propose, SLOT_EQUAL, startHarness, STATISTICS, testConfig, trueoWorld, writeBundle } from "./helpers.js";

// What the API serves (docs/sdk-and-api-design.md section 5): every venue it has a reader for, on every endpoint, and a
// plain "no_reader" for every other venue. No answer carries a licence class, data terms or a served verdict. Trueo (the
// SDK's recorded chain world) is walked in each fake read state (sdk/venues/testkit), Polymarket answers from its recorded
// Gamma list, and every other venue with a reader answers 404 to everything; a venue with no reader must never be asked.
// Links are served as approved only when a person approved them, and every candidate as "proposed".

// The walk sends far more than a client may: the rate limits are tested on their own (http.test.ts).
function roomyConfig(env: Record<string, string> = {}) {
  const config = testConfig(env);
  return { ...config, limits: { ...API_LIMITS, markets: { capacity: 10_000, refillPerSecond: 1 }, reads: { capacity: 10_000, refillPerSecond: 1 } } };
}

const NOT_A_VENUE = ["quotient", "Quotient", "unknown_venue", "__proto__"];
const READERS: readonly VenueId[] = API_READER_VENUES;
const NO_READER = VENUE_IDS.filter((id) => !READERS.includes(id));

// Keys and words that would mean an answer carries a licence or terms decision. (A venue's own native fields pass through
// as the venue sends them: Polymarket's "restricted" market flag is the venue's, not ours.)
const LICENCE_KEYS = /^(licen[cs]e|dataTerms|dataTermsSource|served|notServed|clause|tier)$/;
const LICENCE_WORDS = /licen[cs]e|own_use_only|data.?terms|restricted_off|not.?served/i;

function keysOf(body: unknown): string[] {
  const out: string[] = [];
  const stack: unknown[] = [body];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== "object" || value === null) continue;
    if (Array.isArray(value)) stack.push(...value);
    else {
      out.push(...Object.keys(value));
      stack.push(...Object.values(value));
    }
  }
  return out;
}

function assertNoLicence(body: unknown, where: string): void {
  for (const key of keysOf(body)) assert.doesNotMatch(key, LICENCE_KEYS, `${where}: key ${key}`);
  assert.doesNotMatch(JSON.stringify(body), LICENCE_WORDS, where);
}

test("the API reads every venue the SDK has a keyless reader for, and no other", () => {
  assert.deepEqual([...READERS], ["xo", "polymarket", "kalshi", "limitless", "trueo", "hyperliquid", "pascal", "novig", "gemini", "manifold"]);
  // OG, SX Bet and Underdog Exchange have readers with no registered host; the rest have none.
  assert.deepEqual([...NO_READER].sort(), ["myriad", "og", "opinion", "polymarket_us", "predictfun", "prophetx", "sx", "udx", "world"]);
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
  test(`every endpoint serves every venue with a reader and answers no_reader for the rest, with Trueo ${state}`, async () => {
    const world = await trueoWorld();
    const clock = new Clock(world.nowMs);
    const poly = await polymarketFixtures();
    const asked: string[] = [];
    const absent: string[] = [];
    const trueo = trueoFetch(state, world.fetch, clock.read);
    const polymarket = fakeVenue("ok", { [poly.listUrl]: json(poly.listBody) }, { venue: "polymarket", nowMs: clock.read });
    const fetchFor = (venue: VenueId): FetchLike => {
      if (venue === "trueo") return trueo.fetch;
      if (venue === "polymarket") return polymarket.raw;
      return READERS.includes(venue) ? absentVenue(venue, absent) : forbiddenFetch(venue, asked);
    };
    const links = linkEnv();
    const h = await startHarness({ fetchFor, clock, config: roomyConfig(links.env) });
    try {
      if (state === "chain_only") h.api.tracker.declareChainOnly("trueo", CHAIN_ONLY_REASON);
      const get = async (path: string) => {
        const answer = await h.get(path);
        assertNoLicence(answer.json, path);
        return answer;
      };

      const health = await get("/v1/health");
      assert.equal(health.status, 200);
      assert.deepEqual(health.json["readers"], [...READERS]);

      const venues = await get("/v1/venues");
      assert.equal(venues.status, 200);
      const rows = venues.json["venues"] as Array<Record<string, unknown>>;
      assert.deepEqual(rows.map((r) => r["id"]), [...VENUE_IDS]);
      for (const row of rows) {
        const id = row["id"] as VenueId;
        // The venue, its reader, its read state, its kept list and its chain: nothing else.
        assert.deepEqual(Object.keys(row).sort(), ["caps", "chain", "id", "list", "name", "reader", "state"], id);
        assert.equal(row["reader"], READERS.includes(id), id);
        const view = row["state"] as Record<string, unknown>;
        if (READERS.includes(id)) assert.notEqual(row["caps"], null, id);
        else assert.deepEqual([view["kind"], view["reason"], row["caps"], row["list"]], ["not_read", "The API has no reader for this venue.", null, null], id);
      }
      assert.ok(Array.isArray(venues.json["indexer"]));

      const all = await get("/v1/markets");
      assert.equal(all.status, 200);
      assert.deepEqual((all.json["venues"] as Array<Record<string, unknown>>).map((v) => v["venue"]), [...READERS]);
      const markets = all.json["markets"] as Array<Record<string, unknown>>;
      assert.ok(markets.some((row) => row["venue"] === "polymarket"), "the recorded Polymarket rows are served");
      const trueoRows = markets.filter((row) => row["venue"] === "trueo");
      if (state === "ok") {
        assert.ok(trueoRows.length > 0, "the ok venue's rows are served");
        const fields = (trueoRows[0] as Record<string, unknown>)["fields"] as Record<string, Record<string, unknown>>;
        // Trueo is read from its contracts: a field read now is "chain", never "venue_api".
        assert.equal(fields["title"]?.["source"], "chain");
        assert.equal(fields["displayPrice"]?.["source"], "chain");
        assert.equal(typeof fields["title"]?.["ageMs"], "number");
      } else {
        assert.equal(trueoRows.length, 0, "nothing was read and nothing is kept");
        const view = (all.json["venues"] as Array<Record<string, unknown>>).find((v) => v["venue"] === "trueo")?.["state"] as Record<string, unknown>;
        assert.equal(view["kind"], state === "throttled" ? "throttled" : state === "chain_only" ? "chain_only" : "blocked");
        assert.equal(typeof view["reason"], "string");
      }

      for (const venue of [...VENUE_IDS, ...NOT_A_VENUE]) {
        const listed = await get(`/v1/markets?venue=${encodeURIComponent(venue)}`);
        const one = await get(`/v1/markets/${encodeURIComponent(venue)}/8453:${world.liveAddress}`);
        const code = (answer: { json: Record<string, unknown> }) => (answer.json["error"] as Record<string, unknown> | undefined)?.["code"];
        if (READERS.includes(venue as VenueId)) {
          assert.equal(listed.status, 200, venue);
          assert.deepEqual((listed.json["venues"] as Array<Record<string, unknown>>).map((v) => v["venue"]), [venue]);
          assert.notEqual(code(one), "no_reader", venue);
          if (venue === "trueo") assert.equal(one.status, state === "ok" ? 200 : 503, `${state}: ${JSON.stringify(one.json).slice(0, 200)}`);
        } else {
          assert.deepEqual([listed.status, code(listed)], [404, "no_reader"], venue);
          // A path segment that is not a venue id's shape is no route at all.
          assert.equal(one.status, 404, venue);
          assert.ok(code(one) === "no_reader" || code(one) === "not_found", `${venue}: ${String(code(one))}`);
        }
      }

      const groups = await get("/v1/groups");
      assert.equal(groups.status, 200);
      // Every pair is served, a venue without a reader included: approved as approved, each candidate as proposed.
      const approvedLinks = groups.json["approved"] as Array<Record<string, unknown>>;
      const proposedLinks = groups.json["proposed"] as Array<Record<string, unknown>>;
      assert.equal(approvedLinks.length, links.pairs);
      assert.ok(approvedLinks.every((l) => l["state"] === "human_approved"));
      assert.equal(proposedLinks.length, links.pairs);
      assert.ok(proposedLinks.every((l) => l["state"] === "proposed" && l["band"] === "strong"));
      assert.equal((groups.json["withheld"] as Record<string, unknown>)["count"], 0);
      const legVenues = new Set([...approvedLinks, ...proposedLinks].flatMap((l) => (l["legs"] as Array<Record<string, unknown>>).map((x) => x["venue"])));
      assert.deepEqual([...legVenues].sort(), [...LINK_VENUE_IDS].sort());

      // A venue with no reader is never asked; every venue with one was.
      assert.deepEqual(asked, []);
      for (const venue of READERS.filter((v) => v !== "trueo" && v !== "polymarket")) assert.ok(absent.some((call) => call.startsWith(`${venue} `)), venue);
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
