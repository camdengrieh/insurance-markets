import assert from "node:assert/strict";
import { test } from "node:test";
import { allPlatforms, dataPolicy } from "../../registry/registry.js";
import {
  ALL_RECORDABLE_HOSTS,
  RECORDABLE_VENUES,
  REFUSAL_REASONS,
  RESEARCH_USER_AGENT,
  RestrictedVenueError,
  assertRecordable,
  isAllowedHost,
  isRecordableVenue,
  refusalReason,
  termsPermitRecording,
} from "../../recorder/allowlist.js";
import { parseConfig } from "../../recorder/config.js";
import { RecorderStore } from "../../recorder/store.js";
import type { SnapshotRow } from "../../recorder/types.js";

test("the allowlist is exactly xo, polymarket and limitless", () => {
  assert.deepEqual([...RECORDABLE_VENUES], ["xo", "polymarket", "limitless"]);
  assert.deepEqual([...ALL_RECORDABLE_HOSTS].sort(), ["api-mainnet.xo.market", "api.limitless.exchange", "clob.polymarket.com", "gamma-api.polymarket.com", "orderbooks.xo.market"]);
});

test("Kalshi, Quotient and every unlisted venue are refused, whatever the spelling", () => {
  for (const v of ["kalshi", "KALSHI", "Kalshi", " kalshi", "kalshi ", "quotient", "Quotient", "prophetx", "gemini", "trueo", "sxbet", "polymarket_us", "", "xo "]) {
    assert.equal(isRecordableVenue(v), false, `venue ${JSON.stringify(v)}`);
    assert.throws(() => assertRecordable(v), RestrictedVenueError);
  }
  assert.match(refusalReason("kalshi"), /Developer Agreement/);
  assert.match(refusalReason("quotient"), /redistribution/);
  assert.match(refusalReason("somenewvenue"), /not on the recorder allowlist/);
});

test("restricted and unknown hosts are not allowed hosts", () => {
  for (const h of ["api.elections.kalshi.com", "external-api.kalshi.com", "kalshi.com", "api.quotient.social", "127.0.0.1", "localhost", "clob.polymarket.com.evil.example", "evil.example"]) {
    assert.equal(isAllowedHost(h), false, h);
  }
  for (const h of ALL_RECORDABLE_HOSTS) assert.equal(isAllowedHost(h), true);
});

test("the allowlist agrees with the platform registry data policy", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const policy = new Map(allPlatforms().map((p) => [p.id as string, dataPolicy(p, now)]));
  for (const v of RECORDABLE_VENUES) {
    const p = policy.get(v);
    assert.ok(p !== undefined, `${v} is in the registry`);
    assert.equal(p.mayPersist, true, `${v} may be persisted`);
    assert.equal(p.memoryOnly, false);
  }
  for (const v of Object.keys(REFUSAL_REASONS)) {
    const p = policy.get(v);
    if (p !== undefined) assert.equal(p.mayPersist, false, `${v} must not be persistable`);
  }
});

test("the user agent is the fixed generic research string", () => {
  assert.equal(RESEARCH_USER_AGENT, "insurance-markets-research/0.1");
});

test("config refuses restricted venues, foreign hosts, non-loopback overrides and budgets above the ceiling", () => {
  const bad = (input: unknown, re: RegExp): void => {
    const r = parseConfig(input);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.errors.join("\n"), re);
  };
  bad({ venues: ["kalshi"] }, /Developer Agreement/);
  bad({ venues: ["xo", "quotient"] }, /redistribution/);
  bad({ hostBudgets: { "api.elections.kalshi.com": { rps: 1, burst: 1, maxPerHour: 10 } } }, /not on the recorder allowlist/);
  bad({ hostBudgets: { "orderbooks.xo.market": { rps: 50, burst: 1, maxPerHour: 10 } } }, /above the ceiling/);
  bad({ hostBases: { "orderbooks.xo.market": "https://evil.example" } }, /loopback/);
  bad({ hostBases: { "orderbooks.xo.market": "http://10.0.0.5:80" } }, /loopback/);
  bad({ hostBases: { "evil.example": "http://127.0.0.1:80" } }, /not on the recorder allowlist/);
  bad({ intervalSec: 5 }, /intervalSec/);
  bad({ shortIntervalSec: 7200 }, /shortIntervalSec must not exceed/);
  bad({ userAgent: "custom-agent/1" }, /userAgent|Unrecognized/i);
  bad({ unknownKey: 1 }, /Unrecognized/i);
  const ok = parseConfig({ hostBases: { "orderbooks.xo.market": "http://127.0.0.1:4010" } });
  assert.equal(ok.ok, true);
});

test("no code path can store a refused venue: the store re-checks every insert", () => {
  const store = RecorderStore.open(":memory:");
  try {
    store.startRun(1, "test", "x");
    const row = {
      targetKey: "kalshi:KXTEST",
      venue: "kalshi",
      marketId: "KXTEST",
      tokenId: "t",
      observedMs: 1,
      reqStartMs: 1,
      venueTsMs: null,
      bookHash: null,
      bids: [],
      asks: [],
      nBids: 0,
      nAsks: 0,
      bestBid: null,
      bestAsk: null,
      flags: [],
      tick: null,
    } as unknown as SnapshotRow;
    assert.throws(() => store.insertSnapshot(row), RestrictedVenueError);
    assert.throws(() => store.insertMarketState({ targetKey: "kalshi:K", venue: "kalshi", marketId: "K", observedMs: 1, tokenId: null, status: "active", closeMs: null, accepting: null, tick: null, fee: { model: "unknown", params: {} } } as never), RestrictedVenueError);
    assert.throws(() => store.syncTargets([{ key: "kalshi:K", venue: "kalshi", marketId: "K", closeHintMs: null }] as never, [], []), RestrictedVenueError);
    assert.equal(store.counts()["snapshots"], 0);
  } finally {
    store.close();
  }
});

test("TC-2: recording also needs the registry's data terms to be fresh and persistable at the time of the call", () => {
  const fresh = Date.parse("2026-10-20T12:00:00Z");
  const stale = fresh + 400 * 24 * 3600 * 1000;
  for (const v of RECORDABLE_VENUES) {
    assert.equal(termsPermitRecording(v, fresh), true, `${v} fresh`);
    assert.equal(termsPermitRecording(v, stale), false, `${v} past the terms TTL counts as restricted`);
    const p = dataPolicy(allPlatforms().find((x) => x.id === v)!, stale);
    assert.equal(p.mayPersist, false, "this is the registry's own verdict at that time");
  }
  for (const v of ["kalshi", "quotient", "polymarket_us", "", "xo "]) assert.equal(termsPermitRecording(v, fresh), false, v);
});
