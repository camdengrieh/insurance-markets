import assert from "node:assert/strict";
import { test } from "node:test";

import { issueKey } from "../../api/keys.js";
import type { TradeView } from "../../api/markets.js";
import { legOutcomeIndex, quoteLeg, rankLegs } from "../../api/quote.js";
import { unknownFeeSpec, xoFeeSpec } from "../../sdk/engine/fee-specs.js";
import type { Book, FeeSpec, Market, VenueId } from "../../sdk/model.js";
import { rebuildClobOrder } from "../../sdk/trade/clob/decoded.js";
import { POLYMARKET_EXCHANGES } from "../../sdk/trade/clob/venues.js";
import { CHAIN_ONLY_REASON, FAKE_VENUE_STATES, fakeVenue, type FakeVenueState } from "../../sdk/venues/testkit/index.js";
import type { FetchLike } from "../../sdk/model.js";
import { API_LIMITS } from "../../api/config.js";
import { Clock, forbiddenFetch, groupEnv, polymarketSenate, realLeg, startHarness, testConfig, trueoWorld, venuesNamed } from "./helpers.js";

// GET /v1/quote and POST /v1/route/prepare (docs/sdk-and-api-design.md section 4): the engine's numbers and its fail-closed
// rules, leg by leg; Trueo in every fake read state beside a leg on a venue the API has no reader for; and Polymarket, from
// its recorded Senate market, for the order builder.

const NOW = Date.parse("2026-10-22T12:00:00Z");
const OWNER = "0x1111111111111111111111111111111111111111";

function book(levels: { bids: Array<[string, string]>; asks: Array<[string, string]> }, derived: "native" | "complement" = "native"): Book {
  return { token: { venue: "xo", tokenId: "1" }, bids: levels.bids.map(([price, size]) => ({ price, size })), asks: levels.asks.map(([price, size]) => ({ price, size })), asOfMs: NOW - 1_000, derived };
}

function view(b: Book | null, fee: FeeSpec | null, tradable = true): TradeView {
  const market = { outcomes: [{ index: 0, role: "yes", tokenId: "1" }, { index: 1, role: "no", tokenId: "2" }], collateral: { symbol: "pUSD" }, tradable: { ok: tradable, reasons: tradable ? [] : ["closed"] } } as unknown as Market;
  const source = { source: "venue_api" as const, asOfMs: NOW - 1_000, ageMs: 1_000 };
  return { market, marketOrigin: source, books: [{ tokenId: "1", book: b, source: b === null ? { source: null, reason: "The book could not be read: the venue's book was empty." } : source }], fee, feeOrigin: fee === null ? { source: null, reason: "The fee could not be read: the read failed." } : source, venueReason: null };
}

// XO's spec: the documented p(1-p) curve at 400 bps, floored to the micro-dollar (sdk/engine/fee-specs.ts xoFeeSpec).
const source = (verifiedAt: string) => ({ url: "https://api-mainnet.xo.market/api/markets/contract/test", field: "effectiveFeeConfig.takerFeeBps", granularity: "market" as const, verifiedAt, ttlSec: 300 });
const FRESH = xoFeeSpec({ takerBps: "400", makerBps: "0", source: source(new Date(NOW - 10_000).toISOString()) });
const DEEP = book({ bids: [["0.38", "100"]], asks: [["0.40", "100"], ["0.42", "100"]] });
const leg = (v: TradeView, venue: VenueId = "xo") => quoteLeg({ venue, marketId: "m", outcomeIndex: 0, view: v }, "buy", "10", NOW);

test("a native book with a fresh fee spec: the engine's walk and fee, every number with its source and age", () => {
  const q = leg(view(DEEP, FRESH));
  assert.equal(q.executable, true, q.reasons.join("; "));
  assert.equal(q.quote?.vwap, "0.4");
  assert.equal(q.quote?.notional, "4");
  // C x bps/10000 x p x (1 - p) = 10 x 0.04 x 0.4 x 0.6, floored at 6 places, added to a buy.
  assert.equal(q.quote?.fee, "0.096");
  assert.equal(q.quote?.netCost, "4.096");
  assert.equal(q.quote?.feeSpecId, "xo:curve_pq");
  assert.deepEqual(q.sources.book, { source: "venue_api", asOfMs: NOW - 1_000, ageMs: 1_000, bookAsOfMs: NOW - 1_000 });
  assert.equal(q.sources.fee?.verifiedAt, new Date(NOW - 10_000).toISOString());
  assert.equal(q.sources.fee?.ageMs, 10_000);
  assert.equal(q.sources.fee?.ttlSec, 300);
});

test("fails closed exactly as the engine does: unknown model, stale spec, missing fee, complement and crossed books, thin depth, untradable", () => {
  const unknown = leg(view(DEEP, unknownFeeSpec("xo", source(new Date(NOW).toISOString()))));
  assert.deepEqual([unknown.executable, unknown.quote?.feeError?.code, unknown.quote?.netCost], [false, "MODEL_UNKNOWN", null]);
  const stale = leg(view(DEEP, xoFeeSpec({ takerBps: "400", source: source(new Date(NOW - 301_000).toISOString()) })));
  assert.deepEqual([stale.executable, stale.quote?.feeError?.code, stale.quote?.fee], [false, "SPEC_STALE", null]);
  const noFee = leg(view(DEEP, null));
  assert.deepEqual([noFee.executable, noFee.quote?.feeError?.code], [false, "MODEL_UNKNOWN"]);
  assert.ok(noFee.reasons.some((r) => /could not be read/.test(r)));
  const complement = leg(view(book({ bids: [["0.38", "100"]], asks: [["0.40", "100"]] }, "complement"), FRESH));
  assert.equal(complement.executable, false);
  assert.equal(complement.quote?.netCost, "4.096", "the arithmetic is shown");
  assert.ok(complement.reasons.some((r) => /never executable/.test(r)));
  const crossed = leg(view(book({ bids: [["0.45", "10"]], asks: [["0.40", "10"]] }), FRESH));
  assert.deepEqual([crossed.executable, crossed.quote], [false, null], "nothing is quoted from a crossed book");
  assert.match(crossed.reasons[0] ?? "", /crossed or locked/);
  const locked = leg(view(book({ bids: [["0.40", "10"]], asks: [["0.40", "10"]] }), FRESH));
  assert.equal(locked.quote, null);
  const thin = quoteLeg({ venue: "xo", marketId: "m", outcomeIndex: 0, view: view(DEEP, FRESH) }, "buy", "1000", NOW);
  assert.deepEqual([thin.executable, thin.quote?.complete, thin.quote?.filledSize], [false, false, "200"]);
  const closed = leg(view(DEEP, FRESH, false));
  assert.equal(closed.executable, false);
  assert.ok(closed.reasons.some((r) => /not list the market as tradable/.test(r)));
  const noBook = leg(view(null, FRESH));
  assert.deepEqual([noBook.executable, noBook.quote], [false, null]);
  assert.match(noBook.reasons[0] ?? "", /book was empty/);
});

test("best venue first: a buy pays least first, a sell receives most first; legs that cannot execute come last, unranked", () => {
  const cheap = leg(view(book({ bids: [["0.30", "100"]], asks: [["0.35", "100"]] }), FRESH), "polymarket");
  const dear = leg(view(DEEP, FRESH), "xo");
  const broken = leg(view(DEEP, null), "limitless");
  const buy = rankLegs([dear, broken, cheap], "buy");
  assert.deepEqual(buy.map((l) => [l.venue, l.rank]), [["polymarket", 1], ["xo", 2], ["limitless", null]]);
  const sellCheap = quoteLeg({ venue: "polymarket", marketId: "m", outcomeIndex: 0, view: view(book({ bids: [["0.30", "100"]], asks: [["0.35", "100"]] }), FRESH) }, "sell", "10", NOW);
  const sellDear = quoteLeg({ venue: "xo", marketId: "m", outcomeIndex: 0, view: view(DEEP, FRESH) }, "sell", "10", NOW);
  assert.deepEqual(rankLegs([sellCheap, sellDear], "sell").map((l) => l.venue), ["xo", "polymarket"]);
  assert.equal(legOutcomeIndex([0, 1], 1), 1);
  assert.equal(legOutcomeIndex([1, 0], 1), 0);
  assert.equal(legOutcomeIndex([0, 0], 0), null, "a map naming the outcome twice is not used");
});

function trueoFetchFor(state: FakeVenueState, ok: FetchLike, nowMs: () => number): FetchLike {
  return state === "ok" ? ok : fakeVenue(state, () => null, { venue: "trueo", nowMs }).raw;
}

for (const state of FAKE_VENUE_STATES) {
  test(`Trueo ${state}: quotes and route prepare state each leg's reason, a venue without a reader included`, async () => {
    const world = await trueoWorld();
    const clock = new Clock(world.nowMs);
    const live = `8453:${world.liveAddress}`.toLowerCase();
    const groups = groupEnv([
      { a: realLeg("trueo", live), b: realLeg("trueo", `8453:${world.flippedAddress}`), approved: true },
      { a: realLeg("trueo", live), b: realLeg("trueo", `8453:${world.flippedAddress}`.replace(/.$/, "0")), approved: false },
      // Opinion has no reader in the API.
      { a: realLeg("trueo", live), b: realLeg("opinion", "op-1"), approved: true },
    ]);
    const asked: string[] = [];
    const config = { ...testConfig({ ...groups.env, API_ROUTE_PREPARE: "free" }), limits: { ...API_LIMITS, paid: { capacity: 1_000, refillPerSecond: 1 } } };
    const h = await startHarness({ clock, config, fetchFor: (venue) => (venue === "trueo" ? trueoFetchFor(state, world.fetch, clock.read) : forbiddenFetch(venue, asked)) });
    try {
      if (state === "chain_only") h.api.tracker.declareChainOnly("trueo", CHAIN_ONLY_REASON);
      const { key } = issueKey(h.metering, { label: "t", tier: "full" }, clock.now);
      const auth = { authorization: `Bearer ${key}` };
      const bodies: unknown[] = [];
      const [approvedId, proposedId, noReaderId] = groups.linkIds as [string, string, string];

      const approved = await h.get(`/v1/quote?group=${approvedId}&side=buy&size=10`, auth);
      bodies.push(approved.json);
      assert.equal(approved.status, 200, JSON.stringify(approved.json));
      assert.equal((approved.json["group"] as Record<string, unknown>)["state"], "approved");
      const legs = approved.json["legs"] as Array<Record<string, unknown>>;
      assert.equal(legs.length, 2);
      if (state === "ok") {
        // Trueo's reader states its LP and hook fees from the chain, so the engine prices its own spec: the pool's
        // quote already holds both (in_pool), the fee on top is zero and the net cost is the walked notional.
        const best = approved.json["best"] as Record<string, unknown>;
        assert.equal(best["venue"], "trueo");
        const first = legs[0] as Record<string, unknown>;
        assert.deepEqual([first["executable"], first["rank"], first["marketId"]], [true, 1, best["marketId"]]);
        for (const l of legs) {
          const quote = l["quote"] as Record<string, unknown>;
          assert.deepEqual([quote["feeError"], quote["fee"], quote["feePayer"], quote["feeSpecId"]], [null, "0", "in_pool", "trueo:amm_stack"]);
          assert.equal(quote["netCost"], quote["notional"]);
          assert.equal(typeof quote["vwap"], "string");
          assert.equal(((l["sources"] as Record<string, Record<string, unknown>>)["book"] as Record<string, unknown>)["source"], "chain");
          if (l["executable"] !== true) assert.ok((l["reasons"] as string[]).length > 0);
        }
        assert.equal(best["netCost"], (first["quote"] as Record<string, unknown>)["netCost"]);
      } else {
        assert.equal(approved.json["best"], null);
        for (const l of legs) {
          assert.equal(l["executable"], false);
          assert.equal(l["rank"], null);
          assert.equal(l["quote"], null);
          assert.equal(typeof (l["reasons"] as string[])[0], "string");
        }
      }

      const proposed = await h.get(`/v1/quote?group=${proposedId}&side=sell&size=1`, auth);
      bodies.push(proposed.json);
      assert.equal(proposed.status, 200);
      const label = proposed.json["group"] as Record<string, unknown>;
      assert.equal(label["state"], "proposed");
      assert.match(String(label["approval"]), /no person has approved/);

      // A link with a leg on a venue the API has no reader for is quoted: that leg is stated unavailable, never asked.
      const noReader = await h.get(`/v1/quote?group=${noReaderId}&side=buy&size=1`, auth);
      bodies.push(noReader.json);
      assert.equal(noReader.status, 200, JSON.stringify(noReader.json));
      const opinion = (noReader.json["legs"] as Array<Record<string, unknown>>).find((l) => l["venue"] === "opinion") as Record<string, unknown>;
      assert.deepEqual([opinion["executable"], opinion["rank"], opinion["quote"]], [false, null, null]);
      assert.deepEqual(opinion["reasons"], ["The API has no reader for this venue."]);

      const prepared = await h.post("/v1/route/prepare", { group: approvedId, outcome: 0, side: "buy", owner: OWNER, legs: [{ venue: "trueo", marketId: live, price: "0.5", shares: "10", tif: "FOK" }] }, auth);
      bodies.push(prepared.json);
      assert.equal(prepared.status, 200);
      assert.equal(prepared.json["submitted"], false);
      const preparedLegs = prepared.json["legs"] as Array<Record<string, unknown>>;
      assert.deepEqual(preparedLegs.map((l) => l["built"]), [false]);
      assert.match(String(preparedLegs[0]?.["reason"]), /Uniswap v4 pools/);

      assert.deepEqual(asked, [], "no other venue was asked");
      for (const body of bodies) for (const venue of venuesNamed(body)) assert.ok(venue === "trueo" || venue === "opinion", venue);
    } finally {
      await h.close();
    }
  });
}

test("route prepare is off by default: the fixed not-enabled code, before anything is read or charged", async () => {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  const h = await startHarness({ clock, fetchFor: () => forbiddenFetch("any", []) });
  try {
    const answer = await h.post("/v1/route/prepare", { anything: true });
    assert.deepEqual([answer.status, (answer.json["error"] as Record<string, unknown>)["code"]], [403, "route_prepare_not_enabled"]);
    const { key } = issueKey(h.metering, { label: "t", tier: "full" }, clock.now);
    const keyed = await h.post("/v1/route/prepare", { anything: true }, { authorization: `Bearer ${key}` });
    assert.equal((keyed.json["error"] as Record<string, unknown>)["code"], "route_prepare_not_enabled", "a key does not turn it on");
  } finally {
    await h.close();
  }
});

async function polymarketHarness(state: FakeVenueState = "ok", env: Record<string, string> = { API_ROUTE_PREPARE: "free" }) {
  const world = await trueoWorld();
  const pm = await polymarketSenate();
  const clock = new Clock(pm.nowMs);
  const live = `8453:${world.liveAddress}`.toLowerCase();
  const groups = groupEnv([{ a: realLeg("polymarket", pm.conditionId), b: realLeg("trueo", live), approved: false }]);
  const poly = fakeVenue(state, pm.routes, { venue: "polymarket", nowMs: clock.read });
  const config = { ...testConfig({ ...groups.env, ...env }), limits: { ...API_LIMITS, paid: { capacity: 1_000, refillPerSecond: 1 } } };
  const h = await startHarness({ clock, config, random: (n) => Buffer.alloc(n, 7), fetchFor: (venue) => (venue === "trueo" ? world.fetch : venue === "polymarket" ? poly.raw : forbiddenFetch(venue, [])) });
  if (state === "chain_only") h.api.tracker.declareChainOnly("polymarket", CHAIN_ONLY_REASON);
  return { h, pm, live, groupId: groups.linkIds[0] as string, poly, clock };
}

test("a Polymarket leg: the reader's fee spec is refused by the engine, and the walk is shown with its sources", async () => {
  const { h, groupId, poly } = await polymarketHarness();
  try {
    const { key } = issueKey(h.metering, { label: "t", tier: "full" }, Date.now());
    const answer = await h.get(`/v1/quote?group=${groupId}&side=buy&size=10`, { authorization: `Bearer ${key}` });
    assert.equal(answer.status, 200);
    const pmLeg = (answer.json["legs"] as Array<Record<string, unknown>>).find((l) => l["venue"] === "polymarket") as Record<string, unknown>;
    const quote = pmLeg["quote"] as Record<string, unknown>;
    // Polymarket publishes 5 dp but not its rounding mode, so its spec says "unknown" and the engine refuses to price it.
    assert.equal((quote["feeError"] as Record<string, unknown>)["code"], "ROUNDING_UNSUPPORTED");
    assert.equal(quote["derived"], "native");
    assert.equal(pmLeg["executable"], false);
    const sources = pmLeg["sources"] as Record<string, Record<string, unknown>>;
    assert.equal(sources["book"]?.["source"], "venue_api");
    assert.match(String(sources["fee"]?.["url"]), /^https:\/\/clob\.polymarket\.com\/clob-markets\//);
    assert.ok(poly.calls.some((u) => u.includes("/book?token_id=")), "the book was read");
  } finally {
    await h.close();
  }
});

test("an executable best venue: Trueo's own spec prices, Polymarket's is refused and ranks last", async () => {
  const { h, groupId, live } = await polymarketHarness();
  try {
    const { key } = issueKey(h.metering, { label: "t", tier: "full" }, Date.now());
    const answer = await h.get(`/v1/quote?group=${groupId}&side=buy&size=10`, { authorization: `Bearer ${key}` });
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    const legs = answer.json["legs"] as Array<Record<string, unknown>>;
    assert.deepEqual(legs.map((l) => [l["venue"], l["executable"], l["rank"]]), [["trueo", true, 1], ["polymarket", false, null]]);
    const trueoQuote = legs[0]?.["quote"] as Record<string, unknown>;
    assert.deepEqual([trueoQuote["feeError"], trueoQuote["fee"], trueoQuote["complete"], trueoQuote["derived"]], [null, "0", true, "native"]);
    assert.equal(trueoQuote["netCost"], trueoQuote["notional"]);
    assert.deepEqual(answer.json["best"], { venue: "trueo", marketId: live, netCost: trueoQuote["netCost"], vwap: trueoQuote["vwap"] });
    const fee = (legs[0]?.["sources"] as Record<string, Record<string, unknown>>)["fee"];
    assert.equal(fee?.["field"], "poolKey.fee,hook.feeNumerator,hook.FEE_DENOMINATOR");
  } finally {
    await h.close();
  }
});

test("route prepare builds an unsigned Polymarket EOA order from the SDK builders, whose decoded block rebuilds the same digest", async () => {
  const { h, pm, live, groupId } = await polymarketHarness();
  try {
    const body = { group: groupId, outcome: 0, side: "buy", owner: OWNER, legs: [{ venue: "polymarket", marketId: pm.conditionId, price: "0.41", shares: "10", tif: "GTC" }, { venue: "trueo", marketId: live, price: "0.5", shares: "10", tif: "FOK" }] };
    const answer = await h.post("/v1/route/prepare", body);
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    const [pmLeg, trueoLeg] = answer.json["legs"] as Array<Record<string, unknown>>;
    assert.ok(pmLeg !== undefined && trueoLeg !== undefined);
    assert.equal(pmLeg["built"], true, String(pmLeg["reason"]));
    assert.equal(pmLeg["tokenId"], pm.yes);
    assert.deepEqual(pmLeg["order"], { kind: "polymarket_clob_order", signatureType: 0, book: "neg_risk", chainId: 137, exchange: POLYMARKET_EXCHANGES.neg_risk.verifyingContract, orderType: "GTC" });
    const typed = pmLeg["signTypedData"] as { domain: Record<string, unknown>; message: Record<string, unknown>; primaryType: string };
    assert.equal(typed.primaryType, "Order");
    assert.deepEqual(typed.domain, { name: "Polymarket CTF Exchange", version: "2", chainId: 137, verifyingContract: POLYMARKET_EXCHANGES.neg_risk.verifyingContract });
    assert.deepEqual([typed.message["maker"], typed.message["signer"], typed.message["makerAmount"], typed.message["takerAmount"], typed.message["side"]], [OWNER, OWNER, "4100000", "10000000", 0]);
    // The checker's side: the decoded block alone rebuilds the digest and the typed data.
    const rebuilt = rebuildClobOrder(pmLeg["decoded"] as never);
    assert.ok(rebuilt.ok);
    assert.equal(rebuilt.digest, pmLeg["digest"]);
    assert.deepEqual(rebuilt.typed_data, typed);
    assert.equal((pmLeg["wire"] as Record<string, unknown>)["signature"], undefined, "unsigned");
    assert.ok((pmLeg["signerChecks"] as string[]).some((line) => line.includes("submitted nothing")));
    assert.equal(answer.json["submitted"], false);
    assert.equal(trueoLeg["built"], false);
    // Off the tick, below the minimum size: not built, with the builder's reason.
    const offTick = await h.post("/v1/route/prepare", { ...body, legs: [{ ...body.legs[0], price: "0.415" }] });
    assert.match(String((offTick.json["legs"] as Array<Record<string, unknown>>)[0]?.["reason"]), /decimal places/);
    const small = await h.post("/v1/route/prepare", { ...body, legs: [{ ...body.legs[0], shares: "1" }] });
    assert.match(String((small.json["legs"] as Array<Record<string, unknown>>)[0]?.["reason"]), /minimum/);
  } finally {
    await h.close();
  }
});

test("route prepare validates its input fully before anything is read", async () => {
  const { h, pm, groupId, poly } = await polymarketHarness();
  try {
    const leg0 = { venue: "polymarket", marketId: pm.conditionId, price: "0.41", shares: "10", tif: "GTC" };
    const good = { group: groupId, outcome: 0, side: "buy", owner: OWNER, legs: [leg0] };
    const bad: Array<[string, unknown]> = [
      ["unknown field", { ...good, extra: 1 }],
      ["no legs", { ...good, legs: [] }],
      ["five legs", { ...good, legs: [leg0, leg0, leg0, leg0, leg0] }],
      ["bad side", { ...good, side: "short" }],
      ["bad price", { ...good, legs: [{ ...leg0, price: "1e-1" }] }],
      ["GTD", { ...good, legs: [{ ...leg0, tif: "GTD" }] }],
      ["zero owner", { ...good, owner: "0x0000000000000000000000000000000000000000" }],
      ["bad checksum", { ...good, owner: "0x52908400098527886E0F7030069857D2E4169EE7".replace("E7", "e7") }],
      ["not an object", [1, 2]],
    ];
    for (const [name, body] of bad) {
      const answer = await h.post("/v1/route/prepare", body);
      assert.deepEqual([answer.status, (answer.json["error"] as Record<string, unknown>)["code"]], [400, "invalid_request"], name);
    }
    const twice = await h.post("/v1/route/prepare", { ...good, legs: [leg0, leg0] });
    assert.equal(twice.status, 400);
    const notInGroup = await h.post("/v1/route/prepare", { ...good, legs: [{ ...leg0, marketId: `0x${"ab".repeat(32)}` }] });
    assert.equal(notInGroup.status, 400);
    assert.equal(poly.calls.length, 0, "nothing was read for a refused request");
    const origin = h.server.origin;
    const text = await fetch(`${origin}/v1/route/prepare`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    assert.equal(text.status, 415);
    const huge = await fetch(`${origin}/v1/route/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pad: "x".repeat(API_LIMITS.maxBodyBytes) }) });
    assert.equal(huge.status, 413);
    const notJson = await fetch(`${origin}/v1/route/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal(notJson.status, 400);
    const get = await fetch(`${origin}/v1/route/prepare`);
    assert.deepEqual([get.status, get.headers.get("allow")], [405, "POST, OPTIONS"]);
    const postQuote = await fetch(`${origin}/v1/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.deepEqual([postQuote.status, postQuote.headers.get("allow")], [405, "GET, OPTIONS"]);
  } finally {
    await h.close();
  }
});

for (const state of FAKE_VENUE_STATES.filter((s) => s !== "ok")) {
  test(`route prepare and quote with Polymarket ${state}: nothing built, the venue's state stated`, async () => {
    const { h, pm, groupId, poly } = await polymarketHarness(state);
    try {
      const answer = await h.post("/v1/route/prepare", { group: groupId, outcome: 0, side: "buy", owner: OWNER, legs: [{ venue: "polymarket", marketId: pm.conditionId, price: "0.41", shares: "10", tif: "GTC" }] });
      assert.equal(answer.status, 200);
      const leg0 = (answer.json["legs"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
      assert.equal(leg0["built"], false);
      assert.match(String(leg0["reason"]), /^Not built: /);
      const { key } = issueKey(h.metering, { label: "t", tier: "quote" }, Date.now());
      const quote = await h.get(`/v1/quote?group=${groupId}&side=buy&size=10`, { authorization: `Bearer ${key}` });
      const pmLeg = (quote.json["legs"] as Array<Record<string, unknown>>).find((l) => l["venue"] === "polymarket") as Record<string, unknown>;
      assert.deepEqual([pmLeg["executable"], pmLeg["quote"]], [false, null]);
      if (state === "chain_only") assert.equal(poly.calls.length, 0);
      else assert.equal(poly.calls.length, 1, "one refusal, nothing retried around it");
    } finally {
      await h.close();
    }
  });
}
