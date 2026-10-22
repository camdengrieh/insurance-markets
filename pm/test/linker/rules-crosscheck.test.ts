// The rules hash a linker leg pins must be the fingerprint the dApp computes for the same market: the dApp re-checks
// every shown leg against Market.rules.sha256 from its own reader (app/src/features/signals/links/verify.ts, with the
// rules-v2 recipe that dataset.ts rulesComparable accepts). One recorded fixture per venue is replayed to the linker's
// discovery over loopback, and the pinned hash is compared with what the shared reader builds from the same answer.

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { RULES_HASH_RECIPE } from "../../../sdk/rules.js";
import { marketOf as limitlessMarketOf, parseDetailBody } from "../../../sdk/venues/limitless/index.js";
import { normalizeMarket, parseGammaMarket } from "../../../sdk/venues/polymarket/index.js";
import { decodeMarketDetail } from "../../../sdk/venues/xo/api/client.js";
import { marketOf as xoMarketOf } from "../../../sdk/venues/xo/index.js";
import { APP_DATASET_RULES_RECIPE } from "../../linker/app-dataset.js";
import { legOf } from "../../linker/candidates.js";
import { discover } from "../../linker/discover.js";
import { PoliteClient } from "../../recorder/http.js";
import { readFixture, startWorld, type World } from "./helpers.js";

const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.close();
});

// Two hours before the earliest captured close (the Limitless rows expire 2026-10-20T06:00Z), so every market is open.
const AT = Date.parse("2026-10-20T03:00:00Z");

const XO_DETAIL = readFixture("sdk/venues/xo/fixtures/data-market-by-slug.json") as Record<string, unknown> & { conditionId: string };
const GAMMA = readFixture("sdk/venues/polymarket/fixtures/gamma_markets_keyset_captured_2026-10-20.json") as { markets: Record<string, unknown>[] };
const LIMITLESS = readFixture("sdk/venues/limitless/fixtures/markets_active_list_captured_2026-10-20.json") as { data: (Record<string, unknown> & { slug: string })[] };

async function discovered(): Promise<Map<string, ReturnType<typeof legOf>>> {
  const world = await startWorld([], AT);
  worlds.push(world);
  // The XO list route is not recorded for this market: the recorded detail answer is served as its one list row
  // (a detail answer carries every field a list row has).
  world.hosts["api-mainnet.xo.market"]!.handler = (_r, u) => {
    if (u.pathname === "/api/markets") return { body: { data: u.searchParams.get("page") === "1" ? [XO_DETAIL] : [], meta: { page: 1, take: 50, itemCount: 1, pageCount: 1, hasPreviousPage: false, hasNextPage: false } } };
    return u.pathname === `/api/markets/contract/${XO_DETAIL.conditionId}` ? { body: XO_DETAIL } : { status: 404, body: {} };
  };
  world.hosts["gamma-api.polymarket.com"]!.handler = (_r, u) => ({ body: { markets: u.pathname === "/markets/keyset" && u.searchParams.get("cursor") === null ? GAMMA.markets : [] } });
  world.hosts["api.limitless.exchange"]!.handler = (_r, u) => ({ body: u.searchParams.get("page") === "1" ? { data: LIMITLESS.data, totalMarketsCount: LIMITLESS.data.length } : { data: [], totalMarketsCount: 0 } });
  const r = await discover({ client: new PoliteClient({ config: world.config(), clock: world.clock, rng: () => 0.5 }), clock: world.clock, cache: new Map() });
  return new Map(r.features.map((f) => [`${f.venue}:${f.marketId}`, legOf(f)]));
}

test("the dataset the linker exports names the recipe the dApp compares (APP_RULES_RECIPE is sdk RULES_HASH_RECIPE)", () => {
  assert.equal(APP_DATASET_RULES_RECIPE, RULES_HASH_RECIPE);
});

test("XO, Polymarket, Limitless: a pinned leg's rules hash is the dApp reader's Market.rules.sha256 for the same answer", async () => {
  const legs = await discovered();

  const xoDetail = decodeMarketDetail(XO_DETAIL);
  const xoLeg = legs.get(`xo:${xoDetail.conditionId}`);
  assert.ok(xoLeg !== undefined, "the recorded XO market got a leg");
  const xoApp = xoMarketOf(xoDetail, AT, AT).market.rules.sha256;
  assert.match(xoApp, /^[0-9a-f]{64}$/);
  assert.equal(xoLeg.rulesSha256, xoApp);
  assert.match(xoLeg.groupKey ?? "", /^xo-evt-[0-9a-f]{16}$/, "the rootEventSlug names a group, hashed");

  let negRisk = 0;
  for (const row of GAMMA.markets) {
    const parsed = parseGammaMarket(row);
    assert.ok(parsed.ok);
    if (!parsed.ok) continue;
    const app = normalizeMarket(parsed.value, { nowMs: AT, transport: "T0", source: "fixture" });
    assert.ok(app.ok);
    if (!app.ok) continue;
    const leg = legs.get(`polymarket:${parsed.value.conditionId.toLowerCase()}`);
    assert.ok(leg !== undefined, "every recorded Gamma market got a leg");
    assert.match(app.value.rules.sha256, /^[0-9a-f]{64}$/);
    assert.equal(leg.rulesSha256, app.value.rules.sha256);
    if (app.value.group?.kind === "neg_risk") {
      negRisk += 1;
      // The shared, namespaced group key (was the bare negRiskMarketID).
      assert.equal(leg.groupKey, app.value.group.key.toLowerCase());
      assert.match(leg.groupKey ?? "", /^polymarket:neg_risk:0x[0-9a-f]{64}$/);
    } else assert.equal(leg.groupKey, null);
  }
  assert.equal(negRisk, 1, "the capture holds one neg-risk market");

  for (const row of LIMITLESS.data) {
    const detail = parseDetailBody(row, row.slug);
    assert.ok(detail.ok);
    if (!detail.ok) continue;
    const app = limitlessMarketOf(detail.value, "https://api.limitless.exchange", AT).rules.sha256;
    const leg = legs.get(`limitless:${row.slug}`);
    assert.ok(leg !== undefined, "every recorded Limitless market got a leg");
    assert.match(app, /^[0-9a-f]{64}$/);
    assert.equal(leg.rulesSha256, app);
  }
});
