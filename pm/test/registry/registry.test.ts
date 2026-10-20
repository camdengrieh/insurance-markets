import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FEE_MODEL_BY_VENUE,
  FEE_MODEL_IDS,
  FEE_SPEC_IDS,
  REGISTRY_VENUE_IDS,
  feeSpecId,
  isFeeSpecId,
  isRegistryVenueId,
} from "../../registry/ids.js";
import { derivePools } from "../../registry/pools.js";
import { PLATFORM_RECORDS } from "../../registry/records.js";
import {
  allPlatforms,
  canonicalJson,
  dataPolicy,
  getPlatform,
  poolOf,
  registryContentSha256,
} from "../../registry/registry.js";
import { SECTION_KEYS, SECTION_POLICY, freshness } from "../../registry/staleness.js";
import { validateRegistry } from "../../registry/validate.js";
import { isVenueId } from "../../types.js";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-20T00:00:00Z");

test("the bundled registry validates and covers every registry venue exactly once", () => {
  assert.deepEqual(validateRegistry(PLATFORM_RECORDS), []);
  assert.equal(PLATFORM_RECORDS.length, 14);
  assert.deepEqual(PLATFORM_RECORDS.map((r) => r.id), [...REGISTRY_VENUE_IDS]);
});

test("lookup rejects unknown ids and returns the record for known ones", () => {
  assert.equal(getPlatform("nope"), undefined);
  assert.equal(getPlatform(7), undefined);
  assert.equal(getPlatform("xo")?.id, "xo");
  assert.equal(isRegistryVenueId("kalshi"), true);
  assert.equal(isRegistryVenueId("polymarket_us"), false);
});

test("fee spec ids follow venue:model, are unique per venue and match the record", () => {
  for (const rec of allPlatforms()) {
    assert.equal(rec.fees.value.feeSpecId, FEE_SPEC_IDS[rec.id]);
    assert.equal(rec.fees.value.feeSpecId, feeSpecId(rec.id, FEE_MODEL_BY_VENUE[rec.id]));
    assert.equal(isFeeSpecId(rec.fees.value.feeSpecId), true);
  }
  assert.equal(FEE_MODEL_IDS.length, 6);
  assert.equal(isFeeSpecId("xo:made_up"), false);
  assert.equal(isFeeSpecId("nowhere:curve_pq"), false);
  assert.equal(isFeeSpecId("xo curve_pq"), false);
  assert.equal(FEE_SPEC_IDS.xo, "xo:curve_pq");
  assert.equal(FEE_SPEC_IDS.trueo, "trueo:amm_stack");
  assert.equal(FEE_SPEC_IDS.limitless, "limitless:ad_valorem_bps");
});

test("fee spec ids agree with the ids pm-core uses (when pm-core is present)", () => {
  let source: string;
  try {
    source = readFileSync(new URL("../../core/fee-specs.ts", import.meta.url), "utf8");
  } catch {
    return; // pm-core not present in this checkout
  }
  const coreIds = [...source.matchAll(/base\("([a-z0-9_]+:[a-z_]+)"/g)].map((m) => m[1] as string);
  assert.ok(coreIds.length > 0);
  for (const id of coreIds) {
    const venue = id.split(":")[0];
    if (!isRegistryVenueId(venue)) continue; // core venues outside this registry
    assert.equal(FEE_SPEC_IDS[venue], id, `registry and core disagree for ${venue}`);
  }
});

test("unknown fee models fail closed and never default to zero", () => {
  for (const id of ["hyperliquid", "manifold"] as const) {
    const fee = getPlatform(id)?.fees.value;
    assert.equal(fee?.modelId, "unknown");
    assert.equal(fee?.status, "unknown");
    assert.equal(fee?.useRule, "fail_closed");
    assert.equal(fee?.formula, null);
    assert.deepEqual(fee?.indicative, {});
  }
});

test("XO fees are recorded as conflicted with both sources and cannot gate", () => {
  const xo = getPlatform("xo");
  assert.ok(xo);
  const fee = xo.fees.value;
  assert.equal(fee.status, "conflicted");
  assert.equal(fee.useRule, "max_of_sources_until_fill_reconciled");
  assert.ok(fee.paramsSource && fee.secondarySource);
  assert.equal(xo.fees.meta.verification, "unverified");
});

test("docs_only fees never use a live rule", () => {
  for (const rec of allPlatforms()) {
    if (rec.fees.value.status === "docs_only") assert.equal(rec.fees.value.useRule, "fail_closed", rec.id);
  }
});

test("Kalshi, ProphetX and Gemini are restricted and memory-only; their adapters are off", () => {
  for (const id of ["kalshi", "prophetx", "gemini"] as const) {
    const rec = getPlatform(id);
    assert.ok(rec);
    assert.equal(rec.dataTerms.value.restricted, "restricted");
    const p = dataPolicy(rec, T0);
    assert.equal(p.memoryOnly, true);
    assert.equal(p.mayPersist, false);
    assert.equal(p.mayExport, false);
    assert.equal(p.adapterDefault, "off");
    assert.match(p.clause, /memory-only/);
  }
});

test("unknown terms are memory-only (fail closed), and so are stale none_found terms", () => {
  for (const id of ["pascal", "sxbet", "hyperliquid", "og", "novig", "udx"] as const) {
    const p = dataPolicy(getPlatform(id)!, T0);
    assert.equal(p.memoryOnly, true, id);
    assert.equal(p.reason, "unknown_terms");
    assert.equal(p.adapterDefault, "off");
  }
  const xo = getPlatform("xo")!;
  assert.equal(dataPolicy(xo, T0).memoryOnly, false);
  assert.equal(dataPolicy(xo, T0).adapterDefault, "on");
  // 30 day ttl: 31 days after verification the terms are stale and the restriction returns.
  const stale = Date.parse("2026-10-19T00:00:00Z") + 31 * DAY;
  const p = dataPolicy(xo, stale);
  assert.equal(p.memoryOnly, true);
  assert.equal(p.reason, "stale_terms");
  assert.equal(p.mayPersist, false);
});

test("only unrestricted P0/P1 venues have an adapter on by default", () => {
  const on = allPlatforms().filter((r) => dataPolicy(r, T0).adapterDefault === "on").map((r) => r.id);
  assert.deepEqual(on, ["xo", "polymarket", "trueo", "limitless"]);
});

test("every unverified fact is labelled unverified and no L, D or vendor value is verified", () => {
  let verified = 0;
  let unverified = 0;
  for (const rec of allPlatforms()) {
    for (const key of SECTION_KEYS) {
      const m = rec[key].meta;
      if (m.verification === "verified") {
        verified++;
        assert.equal(m.confidence, "H", `${rec.id}.${key}`);
      } else {
        unverified++;
      }
      if (m.confidence === "L" || m.confidence === "D") assert.equal(m.verification, "unverified");
    }
  }
  assert.ok(verified > 0 && unverified > 0);
});

test("section ttl never exceeds the policy default and gate sections are listed", () => {
  for (const rec of allPlatforms()) {
    for (const key of SECTION_KEYS) assert.ok(rec[key].meta.ttlDays <= SECTION_POLICY[key].ttlDays);
  }
  assert.equal(SECTION_POLICY.status.ttlDays, 1);
  assert.equal(SECTION_POLICY.liquidity.ttlDays, 7);
  assert.equal(SECTION_POLICY.fees.use, "gate");
});

test("reachability: no mainnet proof is claimed and fiat DCMs are manual", () => {
  for (const rec of allPlatforms()) assert.equal(rec.reachability.value.proof, "none", rec.id);
  for (const id of ["kalshi", "novig", "og", "prophetx", "gemini", "udx"] as const) {
    assert.equal(getPlatform(id)?.reachability.value.class, "E4", id);
  }
  assert.equal(getPlatform("trueo")?.reachability.value.class, "E1");
  assert.equal(getPlatform("xo")?.reachability.value.class, "E2");
  assert.equal(getPlatform("hyperliquid")?.reachability.value.class, "unknown");
});

test("region lists are only given where the notes give a complete list", () => {
  assert.deepEqual(getPlatform("xo")?.geo.value.restrictedRegions, ["US", "GB", "FR", "SG", "CA-ON"]);
  assert.equal(getPlatform("kalshi")?.geo.value.restrictedRegions, null);
  assert.equal(getPlatform("polymarket")?.geo.value.restrictedRegions, null);
});

test("adapterVenueId maps to a real VenueId or null", () => {
  for (const rec of allPlatforms()) {
    if (rec.adapterVenueId !== null) assert.equal(isVenueId(rec.adapterVenueId), true, rec.id);
  }
  assert.equal(getPlatform("pascal")?.adapterVenueId, null);
});

test("Limitless is a Polymarket mirror in a separate pool; no venue shares a book", () => {
  const lim = getPlatform("limitless")!;
  assert.deepEqual(lim.links.value.liquidityLinks.map((l) => l.relation).sort(), ["mirror_of", "settles_on"]);
  assert.equal(poolOf("limitless"), "limitless");
  assert.equal(poolOf("polymarket"), "polymarket");
  assert.equal(lim.liquidity.value.tier, "X");
  assert.equal(lim.liquidity.value.tierByVolume, "D");
  assert.equal(lim.liquidity.value.depthDowngraded, true);
});

test("derivePools merges same_book and routes_to only, with a stable representative", () => {
  const input = [
    { id: "xo", liquidityLinks: [{ relation: "same_book", target: "kalshi" }] },
    { id: "kalshi", liquidityLinks: [] },
    { id: "gemini", liquidityLinks: [{ relation: "routes_to", target: "kalshi" }] },
    { id: "limitless", liquidityLinks: [{ relation: "mirror_of", target: "polymarket" }] },
    { id: "polymarket", liquidityLinks: [{ relation: "settles_on", target: "xo" }] },
  ] as const;
  const a = derivePools(input);
  assert.equal(a.poolOf.get("xo"), "gemini");
  assert.equal(a.poolOf.get("kalshi"), "gemini");
  assert.equal(a.poolOf.get("gemini"), "gemini");
  assert.equal(a.poolOf.get("limitless"), "limitless");
  assert.equal(a.poolOf.get("polymarket"), "polymarket");
  const b = derivePools([...input].reverse());
  assert.deepEqual([...b.poolOf.entries()].sort(), [...a.poolOf.entries()].sort());
});

test("derivePools reports dangling targets and does not merge across them", () => {
  const r = derivePools([
    { id: "xo", liquidityLinks: [{ relation: "same_book", target: "robinhood" as never }] },
    { id: "kalshi", liquidityLinks: [{ relation: "same_book", target: "trueo" }] },
  ]);
  assert.deepEqual(r.dangling, ["xo->robinhood", "kalshi->trueo"]);
  assert.equal(r.poolOf.get("xo"), "xo");
  assert.equal(r.poolOf.get("kalshi"), "kalshi");
});

test("content hash is stable, order-independent per object and changes with a fact", () => {
  const h1 = registryContentSha256();
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(registryContentSha256(), h1);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  const changed = PLATFORM_RECORDS.map((r) =>
    r.id === "xo" ? { ...r, status: { ...r.status, value: { state: "dead" as const } } } : r,
  );
  assert.notEqual(registryContentSha256(changed), h1);
});

test("privacy: no personal identifier, home path, email or private scratch path in the registry", () => {
  const text = JSON.stringify(PLATFORM_RECORDS);
  for (const re of [/\/Users\//, /\/home\//, /\/private\//, /\/tmp\//, /@/, /[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/]) {
    assert.equal(re.test(text), false, String(re));
  }
  assert.equal(/"notes"/.test(text), false);
});

test("status is gate class with a 1 day ttl: fresh the day after, stale after that", () => {
  const xo = getPlatform("xo")!;
  const verified = Date.parse("2026-10-19T00:00:00Z");
  assert.equal(freshness(xo.status.meta, verified + DAY), "fresh");
  assert.equal(freshness(xo.status.meta, verified + DAY + 1), "stale");
  assert.equal(freshness(xo.status.meta, verified + 2 * DAY + 1), "expired");
});
