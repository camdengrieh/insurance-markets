import assert from "node:assert/strict";
import { test } from "node:test";
import { unknownFeeSpec } from "../../../sdk/engine/fee-specs.js";
import { buildBundle } from "../../links/bundle.js";
import { entityTableSha256 } from "../../links/hash.js";
import { emptyRegistry } from "../../links/store.js";
import {
  legFetcherFromAdapters,
  verifyLink,
  verifyLinkById,
  type VerifyReport,
} from "../../ops/verify.js";
import { propose, approve, leg } from "../links/fixtures.js";
import {
  BASE_KALSHI_PRIMARY,
  BASE_POLY_RULES,
  BASE_XO_RULES,
  CLOSE,
  FEE_SOURCE,
  FakeAdapter,
  NOW_MS,
  XO_RESOLVER,
  kalshiRecord,
  kalshiSpec,
  makeBook,
  makeMarket,
  makeOutcomes,
  makeWorld,
  opsCtx,
  pinsOf,
  polySpec,
  xoRecord,
  xoSpec,
  type WorldOptions,
} from "./quote-fixtures.js";

async function run(o: WorldOptions = {}, ctxOverride: Partial<ReturnType<typeof opsCtx>> = {}): Promise<VerifyReport> {
  const w = makeWorld(o);
  return verifyLink(w.link, { ...w.opsContext, ...ctxOverride }, w.fetchLeg);
}

function codes(r: VerifyReport): string[] {
  return r.reasons.map((x) => `${x.legIndex ?? "-"}:${x.kind}:${x.code}`);
}

test("a link whose pins all hold verifies ok", async () => {
  const r = await run();
  assert.equal(r.verdict, "ok", codes(r).join(", "));
  assert.deepEqual(r.reasons, []);
  assert.equal(r.linkState, "approved");
  assert.equal(r.legs.length, 2);
  for (const l of r.legs) {
    assert.equal(l.rulesSha256.matches, true);
    assert.equal(l.maskedSha256.matches, true);
    assert.equal(l.closeUtc.matches, true);
    assert.equal(l.fetched, true);
  }
  assert.ok(r.warnings.includes("creator_allowlist_not_rechecked"));
  assert.match(r.scope, /human runs the approval CLI/);
});

test("a changed rules text on one leg suspends the link, naming only that leg", async () => {
  const r = await run({ livePolyRules: `${BASE_POLY_RULES} Unless the market creator decides otherwise.` });
  assert.equal(r.verdict, "suspended");
  assert.deepEqual(codes(r).filter((c) => c.includes(":pin:")).sort(), ["1:pin:maskedSha256_mismatch", "1:pin:rulesSha256_mismatch"]);
  assert.equal(r.legs[0]?.rulesSha256.matches, true);
  assert.equal(r.legs[1]?.rulesSha256.matches, false);
  assert.equal(r.reasons.every((x) => !x.transient || x.kind !== "pin"), true);
});

test("a change that only touches numbers breaks the rules hash even though the masked hash holds", async () => {
  const r = await run({ liveXoRules: BASE_XO_RULES.replace("100 units", "110 units") });
  assert.equal(r.verdict, "suspended");
  assert.equal(r.legs[0]?.rulesSha256.matches, false);
  assert.equal(r.legs[0]?.maskedSha256.matches, true);
  assert.deepEqual(codes(r), ["0:pin:rulesSha256_mismatch"]);
});

test("a case-only change is a change", async () => {
  const r = await run({ liveXoRules: BASE_XO_RULES.replace("Resolves", "resolves") });
  assert.equal(r.verdict, "suspended");
  assert.ok(codes(r).includes("0:pin:rulesSha256_mismatch"));
});

test("a changed close time suspends, including a sub-second change", async () => {
  const r = await run({ xo: { closesAt: "2026-12-31T23:58:00Z" } });
  assert.equal(r.verdict, "suspended");
  assert.ok(codes(r).includes("0:pin:closeUtc_mismatch"));
  const sub = await run({ poly: { closesAt: "2026-12-31T23:59:00.500Z" } });
  assert.equal(sub.verdict, "suspended");
  assert.ok(codes(sub).includes("1:pin:closeUtc_mismatch"));
  const missing = await run({ poly: { closesAt: undefined } });
  assert.equal(missing.verdict, "suspended");
  assert.ok(codes(missing).includes("1:live_data:closeUtc_missing"));
});

test("a paused market suspends with a transient market-state reason", async () => {
  const r = await run({ xo: { status: "paused", tradable: false } });
  assert.equal(r.verdict, "suspended");
  const status = r.reasons.find((x) => x.code === "status_mismatch");
  assert.equal(status?.kind, "market_state");
  assert.equal(status?.transient, true);
  assert.ok(codes(r).includes("0:market_state:not_tradable"));
});

test("a changed or missing resolver suspends", async () => {
  const changed = await run({ xo: { resolver: `0x${"cd".repeat(20)}` } });
  assert.equal(changed.verdict, "suspended");
  assert.ok(codes(changed).includes("0:pin:resolverId_mismatch"));
  const missing = await run({ xo: { resolver: undefined } });
  assert.equal(missing.verdict, "suspended");
  assert.ok(codes(missing).includes("0:live_data:resolverId_missing"));
  // Upper-case hex from the venue is the same resolver.
  const upper = await run({ xo: { resolver: XO_RESOLVER.replace("0x", "0x").toUpperCase().replace("0X", "0x") } });
  assert.equal(upper.verdict, "ok", codes(upper).join(", "));
});

test("rules the adapter cannot supply, or that miss a field, leave the hashes unknown and suspend", async () => {
  const none = await run({ xoRecordOverride: null });
  assert.equal(none.verdict, "suspended");
  assert.ok(codes(none).includes("0:live_data:rulesSha256_missing"));
  const { rules: _drop, ...partial } = xoRecord();
  void _drop;
  const lacking = await run({ xoRecordOverride: partial });
  assert.equal(lacking.verdict, "suspended");
  assert.ok(codes(lacking).includes("0:live_data:rulesSha256_missing"));
  const empty = await run({ xoRecordOverride: xoRecord("", { resolutionSources: [], resolverAddress: "", expiresAt: "" }) });
  assert.equal(empty.verdict, "suspended");
});

test("a leg that cannot be read suspends and the other leg is still reported", async () => {
  const w = makeWorld();
  const flaky: typeof w.fetchLeg = (ref) =>
    ref.venue === "polymarket" ? Promise.resolve({ ok: false, error: "RATE_LIMITED" }) : w.fetchLeg(ref);
  const r = await verifyLink(w.link, w.opsContext, flaky);
  assert.equal(r.verdict, "suspended");
  assert.equal(r.legs[1]?.fetched, false);
  assert.equal(r.legs[0]?.fetched, true);
  assert.ok(codes(r).includes("1:live_data:live_state_missing"));
  assert.equal(r.reasons.find((x) => x.legIndex === 1 && x.kind === "live_data")?.transient, true);

  const thrower: typeof w.fetchLeg = () => Promise.reject(new Error("SECRET-TEXT-FROM-VENUE"));
  const t = await verifyLink(w.link, w.opsContext, thrower);
  assert.equal(t.verdict, "suspended");
  assert.equal(JSON.stringify(t).includes("SECRET-TEXT"), false);
  assert.ok(codes(t).some((c) => c.includes("leg_fetch_adapter_threw")));

  const hang: typeof w.fetchLeg = () => new Promise(() => undefined);
  const h = await verifyLink(w.link, { ...w.opsContext, timeoutMs: 20 }, hang);
  assert.equal(h.verdict, "suspended");
  assert.ok(codes(h).some((c) => c.includes("leg_fetch_timeout")));
});

test("a market other than the pinned one fails closed", async () => {
  const w = makeWorld();
  const swapped = makeMarket({ venue: "polymarket", marketId: "SYNTHETIC-poly-other", fee: polySpec() });
  const fetchLeg: typeof w.fetchLeg = (ref) =>
    ref.venue === "polymarket"
      ? Promise.resolve({ ok: true, value: { market: swapped, ruleRecord: { description: BASE_POLY_RULES, resolutionSource: "synthetic source", endDate: CLOSE } } })
      : w.fetchLeg(ref);
  const r = await verifyLink(w.link, w.opsContext, fetchLeg);
  assert.equal(r.verdict, "suspended");
  assert.ok(codes(r).includes("1:structure:market_identity_mismatch"));
});

test("fee model problems suspend: unknown, stale, and a model the registry does not record", async () => {
  const unknown = await run({ xo: { fee: unknownFeeSpec("xo", FEE_SOURCE) } });
  assert.equal(unknown.verdict, "suspended");
  assert.ok(codes(unknown).includes("0:fee:fee_model_unknown"));
  const stale = await run({ poly: { fee: { ...polySpec(), verifiedAt: "2020-01-01", ttlSec: 3600 } } });
  assert.ok(codes(stale).includes("1:fee:fee_spec_stale"));
  assert.equal(stale.reasons.find((x) => x.code === "fee_spec_stale")?.transient, true);
  const mismatch = await run({ xo: { fee: polySpec() } });
  assert.ok(codes(mismatch).includes("0:fee:fee_model_registry_mismatch"));
  assert.equal(mismatch.legs[0]?.fee.registryModelMatches, false);
});

test("an XO fee the registry records as conflicted is a warning, not a suspension", async () => {
  const r = await run();
  assert.equal(r.verdict, "ok");
  assert.ok(r.warnings.includes("leg0:fee_registry_status_conflicted"));
});

test("an invalid tick suspends", async () => {
  const r = await run({ poly: { tick: "0" } });
  assert.equal(r.verdict, "suspended");
  assert.ok(codes(r).includes("1:tick:tick_invalid"));
  const ranges = await run({ poly: { tick: [{ from: "0", to: "0.5", tick: "0.01" }, { from: "0.4", to: "1", tick: "0.001" }] } });
  assert.ok(codes(ranges).includes("1:tick:tick_invalid"));
  const good = await run({ poly: { tick: [{ from: "0", to: "0.5", tick: "0.01" }, { from: "0.5", to: "1", tick: "0.001" }] } });
  assert.equal(good.verdict, "ok", codes(good).join(", "));
});

test("an outcome count that differs from the pinned map suspends", async () => {
  const three = [...makeOutcomes("SYNTHETIC-poly-0001"), { index: 2, role: "label" as const, label: makeOutcomes("x")[0]!.label, tokenId: "t3" }];
  const r = await run({ poly: { outcomes: three } });
  assert.equal(r.verdict, "suspended");
  assert.ok(codes(r).includes("1:structure:outcome_count_mismatch"));
});

test("void policy: a changed one suspends, an unreadable one is missing", async () => {
  const changed = await run({ poly: { void: "fifty_fifty" } });
  assert.ok(codes(changed).includes("1:pin:voidPolicy_mismatch"));
  const unknown = await run({ poly: { void: "unknown" } });
  assert.ok(codes(unknown).includes("1:live_data:voidPolicy_missing"));
});

test("a candidate link never verifies ok, and neither does an expired one", async () => {
  const cand = await run({ approved: false });
  assert.equal(cand.verdict, "suspended");
  assert.deepEqual(codes(cand), ["-:link_state:state_candidate"]);
  assert.equal(cand.reasons[0]?.transient, false);

  const expired = await run({}, { nowMs: Date.parse("2027-01-01T00:00:00Z") });
  assert.equal(expired.verdict, "suspended");
  assert.ok(codes(expired).includes("-:link_state:expired"));
  assert.ok(codes(expired).includes("0:market_state:past_close"));
});

test("a pinned entity table needs the same table at verify time", async () => {
  const w = makeWorld();
  const table = ["Synthetic Corp"];
  const missing = await verifyLink(w.link, w.opsContext, w.fetchLeg, { manifestEntityTableSha256: entityTableSha256(table) });
  assert.equal(missing.verdict, "suspended");
  assert.ok(codes(missing).includes("-:structure:entity_table_mismatch"));
  assert.ok(codes(missing).includes("0:live_data:maskedSha256_missing"));
  const wrong = await verifyLink(w.link, w.opsContext, w.fetchLeg, {
    manifestEntityTableSha256: entityTableSha256(table),
    entities: ["Other Corp"],
  });
  assert.ok(codes(wrong).includes("-:structure:entity_table_mismatch"));
});

test("verifyLinkById: bad ids, unknown links, an invalid dataset and the success path", async () => {
  const w = makeWorld();
  const good = await verifyLinkById({ link_id: w.link.linkId }, w.dataset, w.opsContext, w.fetchLeg);
  assert.ok(good.ok);
  if (good.ok) assert.equal(good.value.verdict, "ok");

  for (const bad of [{}, { link_id: "nope" }, { link_id: w.link.linkId, extra: 1 }, null]) {
    const r = await verifyLinkById(bad, w.dataset, w.opsContext, w.fetchLeg);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "BAD_INPUT");
  }
  const unknown = await verifyLinkById({ link_id: `lnk_${"0".repeat(32)}` }, w.dataset, w.opsContext, w.fetchLeg);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error, "LINK_NOT_FOUND");

  const broken = await verifyLinkById({ link_id: w.link.linkId }, { ok: false, errors: ["pin mismatch"] }, w.opsContext, w.fetchLeg);
  assert.equal(broken.ok, false);
  if (!broken.ok) {
    assert.equal(broken.error, "DATASET_UNAVAILABLE");
    assert.equal(w.fetchCalls.count, 2, "no leg is fetched for an unusable dataset");
  }
});

test("legFetcherFromAdapters reads through the adapters and tolerates a failing rule extractor", async () => {
  const w = makeWorld();
  const fetcher = legFetcherFromAdapters(w.opsContext, (m) => (m.ref.venue === "xo" ? xoRecord() : null));
  const ok = await fetcher({ venue: "xo", marketId: w.xoId });
  assert.ok(ok.ok);
  if (ok.ok) assert.notEqual(ok.value.ruleRecord, null);
  const none = await fetcher({ venue: "polymarket", marketId: w.polyId });
  assert.ok(none.ok);
  if (none.ok) assert.equal(none.value.ruleRecord, null);
  const throwing = legFetcherFromAdapters(w.opsContext, () => {
    throw new Error("boom");
  });
  const t = await throwing({ venue: "xo", marketId: w.xoId });
  assert.ok(t.ok);
  if (t.ok) assert.equal(t.value.ruleRecord, null);
  const off = await fetcher({ venue: "kalshi", marketId: "SYNTHETIC-k" });
  assert.equal(off.ok, false);
  // Verifying through it with a missing record for polymarket suspends the link.
  const r = await verifyLink(w.link, w.opsContext, fetcher);
  assert.equal(r.verdict, "suspended");
  assert.ok(codes(r).includes("1:live_data:rulesSha256_missing"));
});

test("a restricted-venue leg is hashed in memory: its rule text never appears in the report", async () => {
  const xo = leg("xo", "xo-k1", { ...pinsOf("xo", xoRecord()), resolverId: XO_RESOLVER, closeUtc: CLOSE });
  const kalshi = leg("kalshi", "kalshi-k1", { ...pinsOf("kalshi", kalshiRecord()), closeUtc: CLOSE });
  const proposed = propose(emptyRegistry(), {
    relation: "identity",
    legs: [xo, kalshi],
    basis: { class: "identical", axes: [], cutoffDeltaMinutes: 0 },
    proof: { level: "P1_slot_equal", evidence: [{ method: "slot_equal", detail: "synthetic_equal_slots" }] },
    validUntil: CLOSE,
    synthetic: true,
  });
  const registry = approve(proposed.registry, proposed.link.linkId);
  const built = buildBundle(registry, { createdAt: "2026-10-20T00:00:00Z" });
  assert.ok(built.ok);
  if (!built.ok) return;
  const xoMarket = makeMarket({ venue: "xo", marketId: "SYNTHETIC-xo-k1", fee: xoSpec(), resolver: XO_RESOLVER });
  const kMarket = makeMarket({ venue: "kalshi", marketId: "SYNTHETIC-kalshi-k1", fee: kalshiSpec() });
  const adapters = {
    xo: new FakeAdapter({ id: "xo", markets: { "SYNTHETIC-xo-k1": xoMarket } }),
    kalshi: new FakeAdapter({ id: "kalshi", markets: { "SYNTHETIC-kalshi-k1": kMarket } }),
  };
  const ctx = opsCtx(adapters);
  const records: Record<string, Record<string, unknown>> = {
    "SYNTHETIC-xo-k1": xoRecord(),
    "SYNTHETIC-kalshi-k1": kalshiRecord(),
  };
  const fetcher = legFetcherFromAdapters(ctx, (m) => records[m.ref.marketId] ?? null);
  const r = await verifyLinkById({ link_id: built.value.links[0]!.linkId }, built.value, ctx, fetcher);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.verdict, "ok", r.value.reasons.map((x) => x.code).join(", "));
  const text = JSON.stringify(r.value);
  assert.equal(text.includes(BASE_KALSHI_PRIMARY), false);
  assert.equal(text.includes("SYNTHETIC-KALSHI-RULE-TEXT"), false);
  assert.equal(adapters.kalshi.calls.getMarket, 1);
  // Changing the Kalshi text suspends the link without ever echoing either text.
  records["SYNTHETIC-kalshi-k1"] = kalshiRecord(`${BASE_KALSHI_PRIMARY} extra clause`);
  const changed = await verifyLinkById({ link_id: built.value.links[0]!.linkId }, built.value, ctx, fetcher);
  assert.ok(changed.ok);
  if (changed.ok) {
    assert.equal(changed.value.verdict, "suspended");
    assert.equal(JSON.stringify(changed.value).includes("extra clause"), false);
  }
});

test("the fixed clock decides expiry: verification does not read the wall clock", async () => {
  const w = makeWorld();
  const early = await verifyLink(w.link, { ...w.opsContext, nowMs: NOW_MS }, w.fetchLeg);
  const again = await verifyLink(w.link, { ...w.opsContext, nowMs: NOW_MS }, w.fetchLeg);
  assert.deepEqual(early, again);
  assert.equal(early.checkedAtMs, NOW_MS);
});

test("books are not needed to verify", async () => {
  const w = makeWorld({ xoBooks: { x: makeBook("xo", "x", [], []) } });
  await verifyLink(w.link, w.opsContext, w.fetchLeg);
  assert.equal(w.xoAdapter.calls.getBooks, 0);
  assert.equal(w.polyAdapter.calls.getBooks, 0);
});
