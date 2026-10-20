# Platform registry design: aggregating the prediction-market platforms themselves

> **Status (2026-10-19): design only, no code.** Companion to `docs/aggregation-design.md` (cited as AD), which already specifies the market-level layers (adapters, link registry, edge methods, plugin tools). This document specifies the **platform-level** layer underneath them: a registry of the venues, front ends and aggregators themselves. It synthesizes research note 14 (`docs/research/14-platform-of-platforms.md`, with its Verification section, which overrides its body), AD, note 10, the fixtures under `docs/research/fixtures/linking/`, and a small re-check I ran on 2026-10-19. Not legal advice.

**Citation key.** `[14 §x]` = section x of `docs/research/14-platform-of-platforms.md`; `[14 V-An]` = item n of its Verification part A; `[AD §x]` = section x of `docs/aggregation-design.md`; `[NN §x]` = other research notes; `[fx:name]` = a fixture file in `docs/research/fixtures/linking/`; `[me]` = something I did myself in this synthesis (section 9 lists exactly what). Confidence: **H** first-hand in a primary source or measured (cited); **M** secondary or inferred; **L** weak, stale or vendor claim; **D** a design default chosen here (to be calibrated, not a finding). "NOT FOUND (searched: ...)" marks a documented absence. Anything older than six months is flagged STALE?.

**Inputs that did not exist.** `docs/venue-census.md` and `docs/research/venues/*` were not present on 2026-10-19 when this was written (checked twice). If the census lands, reconcile its venue list with the inclusion tiers in 3.3 and the pool map in 4.2.

---

## 0. Summary

1. **Nothing aggregates the prediction-market platforms themselves in the full sense** (a public, machine-readable, regularly verified record per platform covering fees, geography, API capability, trading reachability, resolution oracle, liquidity and links to other platforms). What exists is five partial things: identity/volume registries, one small schema-bearing registry, capability directories hidden inside unified-API and trading products, a fee feed for two venues, and hand-curated lists that rot. Nothing federates other aggregators except resale. My own re-check on 2026-10-19 (three PayBox discovery queries, two web searches) found nothing new at platform level [14 §0, 14 §12, me].
2. **Closest, by dimension:** DefiLlama for data and join keys (includes XO Market and Trueo); Prediction Almanac for registry shape and dated geo (CC0, no XO, no Trueo); ccxt, Predictefy and AGG for capability semantics and execution breadth; River Markets and AGG for cross-venue asset grouping; PolyKal for dated fee parameters (two venues) [14 §12, 14 V-A1, 14 V-A4].
3. **XO and Trueo are almost invisible to the aggregator layer.** XO appears in DefiLlama, Prediction Index and (as an unexercised vendor claim) Predictefy; Trueo appears only in DefiLlama and Prediction Index [14 §10, 14 V-A6]. Their shares of 30-day prediction-market volume are 0.24% and 0.00008% [14 §2.1], so no aggregator has a commercial reason to add them. The cost falls on us.
4. **The remaining gap is a thin, hand-verified registry** of roughly 12 full and 10 light records (plus a generated radar list) carrying what nobody publishes together: fee-parameter sources with conflict state, resolution and void policy, bot and wash-trading policy, PayBox reachability with a proof level, depth-based liquidity tier, a shared-liquidity (pool) graph, and per-section `last_verified`/TTL with sources (section 2, 3).
5. **Schema:** adopt the 14 §9 schema (draft 0.1, five seed records validated) as the base and apply ten deltas (3.4). The two that matter most: a per-section `meta` block (sources, method, confidence, `last_verified`, `ttl_days`) replacing the single record-level TTL, and a hard split between **liquidity links** (who shares a book) and **affiliations** (corporate and oracle relations) so pool logic cannot be polluted.
6. **The registry's job is structure, gates and independence, not live numbers.** Fee rates, books and prices are read at quote time. Registry staleness uses three use classes (display, screen, gate) so a plugin that cannot be republished (every version needs MoonPay approval [06 §2]) degrades gracefully instead of going blind (3.5).
7. **Pools, not venues, are the unit of independence.** Front ends (MetaMask Predictions, Jupiter, Robinhood, 35 Hyperliquid HIP-4 front ends) add no liquidity and no independent price; mirrors (Limitless, Predict.fun, Probable versus Polymarket) are separate books with linked prices. The matcher, the consensus mid and pair eligibility all work on pools (section 4).
8. **Build thin, borrow identity and vocabulary, buy nothing at runtime.** BUILD the registry, ledger, pool graph and checks; BORROW DefiLlama (join key, liveness, volume), Almanac (schema conventions, CC0 seed), PolyKal (cross-check), ccxt `has` vocabulary; WATCH Synpath, River, AGG, Predictefy as benchmarks. Seven aggregator-layer items died or went dark in 2026 [14 §8.3] (section 5).
9. **Freshness is automated detection plus human merge** (section 6). Detection runs daily to monthly from an offline job; fee, geo, resolution and reachability changes never auto-merge.
10. **Do not sell the registry over x402 yet.** Nothing at platform level is on offer there, but the closest priced items cost $0.001 to $0.10 per call, PayBox's default curation needs at least 10 unique payers in 30 days, and part of the source data has no stated redistribution licence. Ship it as free bundled `pm_list_venues`-style plugin tools plus a signed static JSON, and consider upstreaming XO/Trueo facts to Almanac (section 7).

### Decisions proposed (for the author to accept or change)

| # | Proposal | Why |
|---|---|---|
| R1 | Registry = repo-resident JSON, one file per platform, compiled and CI-validated; three depths: `full`, `light`, `radar` | Reviewable diffs; 15-20 records is enough (3.3) |
| R2 | Base = schema 0.1 [14 §9] plus deltas D1-D10 (3.4) | Avoids a rewrite; fixes seed defects found here (3.13) |
| R3 | Pools are the independence unit for matcher, consensus and pair eligibility | Front ends and mirrors otherwise masquerade as extra venues |
| R4 | Registry stores structure and pointers; live values read at quote time; TTL by use class | Plugin cannot be republished at will |
| R5 | Third-party registries feed detection only; never overwrite a record automatically | Directories list dead services as live |
| R6 | Aggregator ledger (claimed vs live) beside the platform registry | Dependency risk is itself platform-level data |
| R7 | Distribute as bundled plugin data plus signed static JSON; no paid x402 route now | 7.2 |
| R8 | Automated detection, human-merged changes; no auto-merge for fees, geo, resolution, reachability | A wrong fee or geo flag is a wrong trade or a ToS breach |

---

## 1. Does anything already aggregate the platforms themselves?

### 1.1 Direct answer

**No, not as one product, and for the two venues this project is built around (XO, Trueo) essentially not at all.** "Aggregate the platforms" has two readings, and the answer differs slightly:

- **A directory or registry of platforms.** Several exist (DefiLlama, Prediction Index, PM Wisdom, Prediction Almanac, curated GitHub lists). Only Almanac carries a real per-platform schema (geography with dates, data-access flags, status, routing relations), and it lacks XO and Trueo. DefiLlama has the broadest coverage and includes both, but holds no fee, geo, API, reachability or resolution-policy fields [14 §2].
- **A meta-aggregator that sits above other aggregators or trading platforms.** NOT FOUND in the strict sense (searched: Predictefy llms-full, pmxt, Oddpool, Synpath, AGG, River, BlockRun docs; GitHub and npm queries; PayBox catalogs; two web searches on 2026-10-19). The nearest patterns are resale (BlockRun sells Predexon v2 as a "100% pass-through" at a flat $0.0085 per call on Base [14 §5]), union-over-own-adapters (Predictefy `router`), and wrapper MCPs [14 §7].

Unified libraries and trading layers keep **private venue lists with capability maps** (ccxt `has`, Predictefy `requirements`, Parsec `exchanges`, AGG venue tables), which is the closest thing to platform records in a machine-readable form, but each is a by-product of one product's coverage, not a neutral registry [14 §7].

### 1.2 Closest existing projects (level, health, licence, terms)

Levels follow [14 §1]: 1 registry, 3 library, 4 hosted API, 5 trading layer, 6 aggregator of aggregators. Health is as of 2026-10-19 unless dated.

| Project | Level | What it does at platform level | XO / Trueo | Health | Licence / terms | Use here |
|---|---|---|---|---|---|---|
| **DefiLlama** (`api.llama.fi`) | 1 | 133 "Prediction Market" rows (39 dead-flagged) plus about 63 prediction "Interface" rows; identity, parent, oracles, dead flags, volume/fees/OI adapters. 51 volume adapters sum to $21.17B (30d) [14 §2.1, 14 V-A2] | both present: XO id 8020 (listed 2026-06-16), Trueo id 5251 | adapter repos pushed 2026-10-18 | API keyless; repos have **no licence file** (`license=null`); redistribution terms NOT FOUND (H) | BORROW: join key, liveness, volume. Read-time lookups only |
| **Prediction Almanac** (`kachence/prediction-almanac`) | 1 | `data/platforms/*.yaml` (21 files) with JSON Schema: `geo{model,restricted,allowed,source,as_of}`, `data{public_api,live_orderbook,...}`, `routes_to`, `status`, `defillama` slug; 9 excluded records with reasons | neither | created 2026-08-12, pushed 2026-10-18, 33 stars, single maintainer | MIT code, **CC0 data** (H) | BORROW schema conventions and CC0 seed; consider upstreaming |
| **Prediction Index** (`predictionindex.xyz`) | 1 | 314 projects (198 live / 94 waitlist / 22 inactive) in HTML-embedded JSON; no documented API | both ("XO Market", "Truemarkets") | lists Dome (EOL 2026-04-28) and Verso (DNS dead) as live | no licence or terms stated (H) | IGNORE as dependency; discovery list |
| **PM Wisdom** (`pmwisdom.com`) | 1 | 606 listings; JSON endpoint returns a 10-row sample; lists "Dome API" Active | not checked | stale entries | none stated | IGNORE |
| **ccxt** | 3 | 9 prediction exchanges (`ts/src/prediction/`), per-class `has` map, `executionModel`, `collateral`, `fees{trading,resolution}`; no fee formula, geo or oracle per platform | neither | 4.5.88 published 2026-10-14; none `certified` | MIT (H) | BORROW vocabulary; do not embed |
| **Predictefy** | 4/6 | 16 served venue ids; `GET /v1/exec/venues` carries `requirements{credentials,funding,geo}` (key-gated: 401 without a key) | **XO yes** (claimed: "Nothing has ever been submitted to XO"); Trueo no | npm 1.0.0-beta.11 (2026-10-07); closed server | free 25,000 credits/month; **commercial use Enterprise only** [16 V-K5] | BORROW design; benchmark only |
| **AGG** (`agg.market`, `Snag-Solutions/Agg`) | 4/5 | 11 venues, cross-venue market matching, arbitrage WebSocket, per-venue geo-policy endpoint (needs `x-app-id`; unauthenticated probe got 403), per-market `feeRate/feeExponent/feeBasis`, by-venue void table | neither (0 mentions in `openapi.json`) | SDK 4.28.0 on 2026-10-16 | MIT SDK; hosted terms NOT FOUND [14 V-A4] | BENCHMARK; ask for an app id later to cross-check geo |
| **Synpath** | 3/5 | 8 venues, hosted matching (`event_id`, `side_map`), smart order routing for Kalshi + Polymarket | neither | created 2026-09-28, v0.8.1 on 2026-10-14 | MIT; terms NOT FOUND | WATCH; borrow `event_id`/`side_map` ideas |
| **River Markets** | 5 | exchanges Kalshi, Polymarket, Polymarket US, Crypto.com, Novig (+1 planned); one River ID per listing **plus** `generic_asset_id` groups across venues and an aggregated orderbook endpoint | neither | docs live | proprietary; access and pricing NOT FOUND [14 V-A1] | WATCH; borrow generic-asset concept |
| **pmxt** | 3/4 | 15 venues; hosted Router read-only matching | neither | no release since 2026-07-18 | MIT code; hosted plans "personal use only" [16 V-K6] | WATCH |
| **PolyKal** `fees.json` | 4 (feed) | Kalshi + Polymarket formulas, per-series multipliers, `verified_on` 2026-09-12, `live_check` 2026-10-18 | neither | live | CC-BY-4.0 (attribution) | BORROW as fee cross-check |
| **pdata.world** | 4 | free keyless aggregator over 8 venues, claims to link the same question across venues | neither | live | CC BY 4.0 | WATCH (linking benchmark) |
| **Kairos list** (`kairoslive/...`), **tgel0 directory** | 1 (tool lists) | dated status enums (`live/shut_down/unreachable/...`), `last_verified`, weekly link check | neither (0 hits) | pushed 2026-10-12 / 2026-10-18 | vendor-authored (Kairos) | BORROW the status-enum and `last_verified` convention |
| **BlockRun** | 6 (resale) | x402 pass-through of Predexon v2 (Polymarket, Kalshi, Limitless, Opinion, Predict.fun, Binance) | neither | 402 live | $0.0085 per call, Base USDC [14 §5] | IGNORE; shows the resale pattern |
| **CoinRithm** (`@coinrithm/mcp-trading`) | 4 | keyless data "across 12 venues" (not enumerated by me) and a "CoinRithm Event ID v1" cross-venue identifier standard | not checked | 0.7.20 on 2026-10-16 | not read | WATCH (M) [14 V-A4] |

### 1.3 What the verification pass changed (so it is not re-derived)

These override the body of note 14 and are reflected throughout this document [14 V-A]:

1. River Markets **does** link equivalent listings across venues (`generic_asset_id`, aggregated orderbook). The "no platform-level product links listings" claim is false for River, AGG and Synpath; it remains true for XO and Trueo, which none of them list.
2. AGG was missed by the first pass; so were Predikt (`@prediktgg/sdk`, Polymarket + Kalshi + Limitless) and CoinRithm. The first pass's GitHub search sorted by stars and had no npm/PyPI search, which structurally hides young aggregators. Any future discovery pass must sort by recency and search package registries.
3. DefiLlama prediction "Interface" rows number about 63 (35 are Hyperliquid HIP-4 "X Outcome" front ends), not 14; 37 have 30d volume totalling about $259.4M (1.2%), not $84.6M (0.4%).
4. At least four x402 cross-venue divergence services exist, not one (x402tap, x402-factory, clinkagent, an odds worker); none covers XO or Trueo.
5. A stale unlicensed SDK (`delphiresearch/polynance-ts-client`, last push 2025-05-17, STALE?) did list TrueMarket. For live 2026 aggregators the "none lists Trueo" claim holds.
6. Hyperliquid builder-code fees are applied to HIP-4 outcome sells in practice (DefiLlama adapter text, M-H), though Hyperliquid's own page is silent.
7. Almanac is not the only dated-status precedent: the Kairos list validates a `status` enum and `last_verified` on every tool.

### 1.4 My re-check on 2026-10-19 [me]

| Check | Result |
|---|---|
| `discover_services` "prediction market venue directory platform list fees" and "prediction markets exchanges registry capabilities" (first page of each; both returned `has_more`) | No platform-level registry for sale. Hits were single-purpose: Polymarket/Manifold search ($0.01), a Hyperliquid outcomes catalog ($0.005), DeFi protocol-fee rankings ($0.002-$0.003, DefiLlama-class data), and two cross-venue items below |
| `discover_plugins` "prediction market venues registry" | `{"plugins":[],"has_more":false}`: no plugin (only `world` appears for broader prediction-market queries [14 §8.1]) |
| Unpaid GET `api.predictionmarketdata.io/prediction-markets` | HTTP 402, $0.001 on Base; Bazaar schema names exchange codes "KALSHI, POLYMARK, GMNI" and a `/prediction-markets/taxonomy` route ($0.001). Event-level data, not platform records. Nothing paid |
| Unpaid GET `api.seerium.xyz/v1/prediction/cross-venue-disagreement` | HTTP 402, $0.10 (Base or Solana); described as Polymarket, Kalshi, Gemini disagreement with match confidence. A fifth cross-venue divergence seller; no XO/Trueo. Nothing paid |
| Two WebSearch queries (standard and extended) for a venue registry, platform directory or "aggregator of aggregators" | Both returned comparison articles and the known unified APIs (pmxt, PolyRouter, Predictefy, Kairos) and stated they found no registry. Search engines' summaries: M |

### 1.5 Mortality prior (use it on any third-party dependency)

Dome (APIs ended 2026-04-28), Metaforecast (discontinued 2026-07-09), Fireplace (trading halted 2026-08-15, M), Parsec (all four hosts fail DNS, M), Verso (hosts fail DNS, M), Converge ("deployment disabled", L) and the PRED venue lane (darked 2026-08-13 per Predictefy) are gone or dark; pmxt (no release since 2026-07-18) and PolyRouter (changelog 2026-01-06, STALE?) are quiet [14 §8.3]. Directories still list some as live. **Consequence: own the registry, take only liveness and volume from third parties, keep every hosted aggregator optional behind an interface.**

---

## 2. The remaining gap

What a neutral observer cannot get from any existing project, and what this project needs for edge-finding across XO, Polymarket, Kalshi, Limitless and Trueo:

| # | Gap | Partially covered by | Why it matters for edge |
|---|---|---|---|
| G1 | **XO and Trueo records** | DefiLlama (identity, volume), Prediction Index (identity), Predictefy (XO, unexercised) | Our two target venues; every other source ignores them |
| G2 | **Fee parameters with their fetch endpoint and a conflict state** | PolyKal (2 venues), AGG per-market fields (11 venues, app-id gated), Polymarket `feeSchedule`, Kalshi series fields | Fees remove 76% to 99.8% of gross edge in measured cases [AD §5.2]; XO has two disagreeing live sources (`/fee-rate` = 0 vs `effectiveFeeConfig.takerFeeBps` 400/800) [AD §3.3] |
| G3 | **Resolution oracle, void and dispute policy, early-close, bot and wash-trading policy** | DefiLlama `oracles` (sparse), AGG void table (11 venues), Almanac geo | Resolution divergence is the dominant cross-venue risk (Khamenei: $1.00 vs $0.02) [AD §0.1] |
| G4 | **PayBox reachability with a proof level** | nothing; Predictefy `requirements` is the nearest shape | Decides which legs are E1/E2/E3 and which are manual (E4) [AD §6.1] |
| G5 | **Depth-based liquidity tier** | DefiLlama volume only | Volume misleads: Opinion $276M/30d against best-bid depth of $0-$123 per book; Limitless is tier D by volume and X by depth [AD §3.1, §3.2] |
| G6 | **Pool graph (who shares a book) and mirror links** | Almanac `routes_to` (brokers), DefiLlama `parentProtocol` (corporate) | Counting MetaMask Predictions or Jupiter as extra venues double-counts Polymarket or Kalshi liquidity |
| G7 | **Freshness discipline: per-field source, date, TTL, fail-closed reads** | Almanac `as_of` on geo/metrics; Kairos list `last_verified` | Third-party facts are perishable; stale bots assumed Polymarket fees were zero [AD §1.2] |
| G8 | **Claimed-versus-live ledger of aggregator coverage** | nothing | A venue list is a claim, not proof of execution (Predictefy's XO lane never exercised) [14 §5] |
| G9 | **Cross-venue market equivalence for XO and Trueo** (market level, not platform level) | River, AGG, Synpath, Prediction Hunt, Oddpool, CoinRithm cover other venues | Stays our human-approved link funnel [AD §4]; the registry supplies its priors (4.4) |

---

## 3. The platform registry schema

### 3.1 Design rules

1. **One record per platform** (venue or operator, plus front ends and brokers at light depth). Markets are not stored here; `market_identity` (3.3) only tells adapters and the matcher how to key and group them.
2. **Facts and pointers, not free text.** Enumerations and URLs; short quotes of at most 25 words as evidence. No third-party descriptions (prompt-injection and licence risk) [14 §13].
3. **Unknown is `null`/`"unknown"`, never a guess**, and unknown fails closed in gates.
4. **Every section carries its own sources, method, confidence and dates** (3.5). A value without a source fails CI.
5. **Our ids are the keys**; vendor ids go in `external_ids` (join keys, including `defillama_slug`).
6. **Venue facts stay venue facts**; project-specific judgement (PayBox reachability, builder-program opportunity, liquidity tier) lives in clearly separated sections.
7. **Registry informs gates; it does not authorize execution** [14 §9, rule 5].
8. **The registry can be wrong in ways that cost money**, so changes to gate-class sections need a human merge (6.3).

### 3.2 Layout and versioning

```
data/registry/
  schema/platform.schema.json        # draft 2020-12, version 0.2 (this proposal)
  schema/aggregator.schema.json
  platforms/<platform_id>.json       # one file per platform (full | light | radar)
  aggregators/<aggregator_id>.json   # ledger rows (3.11)
  excluded.json                      # tombstones: dead or rejected platforms, reason, date
  index.json                         # GENERATED: registry_version, content sha256, pools, per-section expiry
```

- The repo already carries `ajv` 8.20.0 (dev) and `zod` 4.4.3, so CI validation needs no new dependency: validate with `ajv/dist/2020` against the JSON Schema, or define types in zod and export JSON Schema (zod v4 export coverage of our keywords: verify in AGG-0, M).
- `schema_version` is semver (additive = minor; renamed or removed field = major). Consumers **fail closed on unknown enum values** (matches AD §8.3).
- `registry_version` is `YYYY.MM.DD-N` per compiled release; each record has `record_rev` (integer) and a `change_log` (date, change, evidence URL).
- The compile step emits one bundled `platforms.json` (AD layout `data/registry/platforms.json`), the pools, an `expires_at` per section, and a `content_sha256`. For Option B distribution (AD D3) the bundle is Ed25519-signed and verified in the plugin. Size: about 20 records at 5-10 KB each is far below the 10 MiB bundle limit and the 256 KiB output limit if the export view strips evidence quotes [AD §1.1, §9.1].

### 3.3 Record anatomy

Field families come from 14 §9 (its table lists the precedent for each field; not repeated). `Depth` says which record depths carry the family: **F** full, **L** light, **R** radar. `Use class` is the strictest consumer: **G** gate (a wrong or stale value must block a label or an action), **S** screen (affects ranking and indicative labels), **D** display.

| Family | Key fields (enumerations in 3.6-3.10) | Depth | Use class | Default `ttl_days` (D) |
|---|---|---|---|---|
| `identity` | `platform_id`, `name`, `aliases[]`, `operator{entity, jurisdiction, parent_platform_id}`, `urls{site, docs, api_base[], ws[], openapi, status_page, terms, fee_schedule, geoblock_check, changelog}`, `external_ids{defillama_slug, defillama_id, prediction_index_id, wikidata_qid, ccxt_id, pmxt_id, synpath_id, predictefy_id, oddpool_tag, river_exchange, almanac_slug, agg_venue}` | F L R | D | 90 |
| `status` | `state` (live, beta, waitlist, inactive, deprecated, dead, dark, unknown), `launched_year`, `evidence[]` | F L R | **G** | 1 |
| `kind` | `operator_type`, `execution_model[]`, `matching`, `outcome_types[]`, `market_creation`, `neg_risk`, `money_type`, `record_depth` | F L | S | 90 |
| `chains`, `collateral` | CAIP-2 chain, role, gas sponsorship; asset, decimals, custody (self, smart_account, venue, broker), deposit routes | F | G (units, custody islands) | 90 |
| `fees` | `model`, `formula`, `params_source`, `secondary_source`, `status`, `use_rule`, taker, maker, rebate, rounding, settlement, deposit/withdraw, payer mechanics | F | **G** | 30 (live parameters read at quote time) |
| `regulation_geo` | `regulator`, `licence`, `us_persons`, `geo_model`, `restricted_iso2[]`, `allowed_iso2[]`, `geoblock_check_url`, `enforcement`, `kyc`, `bots_policy`, `wash_trading_prohibited`, `terms_hash` | F L | **G** (execution), D otherwise | 30 |
| `api` | `read{auth, public_keyless, rate_limit, orderbook_depth, history, trade_tape, stream, has{}}`, `trade{auth_scheme, signing, order_types, credentials[], sandbox, idempotency, cancel_semantics}`, `health_probe{url, expect}` | F | **G** (adapter enablement) | 30 (+ weekly drift check) |
| `reachability` | `class` (E1-E5), `proof`, `paybox_chain`, `needs_offchain_typed_data_sign`, `routes[]`, `human_onboarding_steps[]`, `unattended_ok`, `builder_program{}`, `plugin_adapter{status, host_slots}` | F | **G** | 30 + event |
| `liquidity` | `tier`, `tier_basis`, `metrics[]` (local only, see 7.3), `depth_sample{}`, `volume_integrity` | F L | S | 7 (metrics), 14 (depth) |
| `resolution` | `oracle_types[]`, `oracle_names[]`, `oracle_cluster`, `dispute_window`, `void_policy{kind, note}`, `discretionary_settlement`, `early_close_possible`, `rule_text_form`, `source` | F | **G** (basis priors) | 30 |
| `links` | `liquidity_links[]`, `affiliations[]`, `native_cross_refs[]`, `aggregator_coverage[]` | F L | S | 30 |
| `market_identity` | `id_field`, `group_fields[]`, `exhaustive_flag_available`, `cross_ref_fields[]`, `unit_notes` | F | S | 90 |
| `meta` per section | see 3.5 | F L | G | - |

**Inclusion tiers (who gets which depth).** From the 2026-10-18 DefiLlama snapshot [fx:pop_defillama_prediction_registry_2026-10-18.json]: of 133 "Prediction Market" rows, 94 are not dead-flagged. Using the 14 §9 tier thresholds on 30d volume, those 94 split into A: 3 (Kalshi, Polymarket US, Polymarket International), B: 2 (Predict Fun, OPINION), C: 8 (MagicMarkets, XO Market, PredictStreet, Hyperliquid Outcomes, TurboFlow, SX Bet V3, Polymarket Combos, world), D: 12 (including Limitless $3.33M, Myriad $1.89M), X: 19, and 50 with no volume adapter [me, recomputed from the fixture; sum over the 133 rows reproduces the $21,167,744,624 headline]. Proposed depths (D):

- **full (about 12):** xo, polymarket, polymarket-us, kalshi, limitless, trueo (target venues), plus predict-fun, opinion, hyperliquid-outcomes, world, sx-bet, myriad (readable, plausible mirror or reference value). Trueo is full despite tier X because it is a stated target.
- **light (about 10):** front ends and brokers that decide pool membership (metamask-predictions, jupiter-prediction, robinhood, coinbase-predict, phantom, gate-predictions), plus probable, magicmarkets, manifold, polymarket-combos. Light = identity, `state`, `kind`, `links`, `regulation_geo` essentials, sources.
- **radar (generated, not hand-written):** every other DefiLlama row, with id, slug, state and volume, so a new entrant or a death is noticed (6.2).

### 3.4 Deltas against schema 0.1 (`pop_platform_registry.schema.json`)

| # | Delta | Why | Evidence |
|---|---|---|---|
| D1 | Per-section `meta` block replaces record-level `provenance[]` plus single `ttl_days` | Required: "last-verified dates and per-field source links"; one TTL for liquidity and fees is wrong (3.5) | Seed uses `ttl_days: 7` for everything [fx:pop_platform_registry.seed.json] |
| D2 | Split `shared_liquidity` into `liquidity_links[]` (`same_book`, `routes_to`, `mirror_of`, `settles_on`) and `affiliations[]` (`parent_of`, `child_of`, `fork_of`); store links once, on the dependent record (front end `routes_to` pool); inverses are computed | Seed puts corporate `parent_of` and `broker_for` in the same list, in opposite directions | Seed: Polymarket `parent_of` polymarket-us, Kalshi `broker_for` robinhood |
| D3 | `reachability.class` (E1-E5 from AD §6.1), `reachability.proof` (none, simulated, testnet, mainnet_tiny), `reachability.routes[]` | "Via PayBox" needs the same classes the plan-legs tool uses; mechanism is not proof | AD §3.5, §6.1; Trueo is E1 by mechanism, untested at 2-4M gas |
| D4 | Fee fields: `status` (verified, conflicted, stale, unknown), `secondary_source`, `use_rule`; align `model` ids with AD `FeeSpec.modelId` (`curve_pq`, `curve_min`, `ad_valorem_bps`, `profit_pct`, `amm_stack`, `unknown`) | Two vocabularies exist (14 §9 `price_curve/flat_bps/...` vs AD §2.1); XO needs a conflict state | AD §2.1, §3.3 |
| D5 | `resolution.oracle_cluster` (for example `uma`), `resolution.discretionary_settlement` | Venues sharing an oracle share dispute paths; exchange rulebooks can modify settlement | AD §3.4, §10 (Polymarket US Rulebook 2026.09.30) |
| D6 | `market_identity` family | Lets adapters and the batcher key and group markets from data, not per-venue code | AD §2.1 `MarketRef`; fixture `native_grouping_coverage_2026-10-18.json` |
| D7 | `record_depth` (full, light, radar), `excluded.json` tombstones | Dead venues must not be re-imported from a directory (Dome is still "live" in two directories) | Almanac `data/excluded.yml` precedent [14 §2.4] |
| D8 | `aggregators/` ledger as a second schema (3.11) | Coverage rows embedded per platform duplicate and drift; the fixture already has two inconsistencies | [14 V-A9] |
| D9 | CI referential integrity: every `target_platform_id` and `parent_platform_id` resolves to a record (light allowed) | The seed has four dangling ids: polymarket-us, predict-fun, robinhood, jupiter-prediction | [fx:pop_platform_registry.seed.json] |
| D10 | `regulation_geo.enforcement` (ip, login, kyc, attestation, none), `kyc`, `terms_hash` | Geo is enforced differently per venue (Polymarket by request IP; Kalshi by API-key location attestation since 2026-08-16); a page hash detects ToS change | AD §10; 08 §0 items 5-6 |

### 3.5 Section meta, TTL and use classes

Each family above has a `meta` object (this replaces per-leaf metadata; `field_sources` gives per-field links where a family mixes sources):

```json
"meta": {
  "last_verified": "2026-10-19",
  "ttl_days": 30,
  "verified_by": "human:author | job:fee-params-diff",
  "method": "primary_doc | live_api | onchain_read | derived | third_party | vendor_claim",
  "confidence": "H",
  "sources": [
    { "url": "https://docs.xo.market/guides/fees", "retrieved": "2026-10-19",
      "locator": "heading: Fee formula", "quote": "fee = C x (feeBps / 10_000) x p x (1 - p)", "page_sha256": null }
  ],
  "field_sources": { "/formula": [0], "/params_source": [0] }
}
```

**Staleness is computed, not stored** (the compile step writes `expires_at` per section):

| State | Rule | Display | Screen (indicative labels, ranking) | Gate (hedged or executable labels, adapter enablement, any action) |
|---|---|---|---|---|
| fresh | age <= `ttl_days` | yes | yes | yes |
| stale | `ttl_days` < age <= 2 x `ttl_days` | yes, with age shown | yes, label degraded | **blocked** (reads as `unknown`) |
| expired | age > 2 x `ttl_days` | value hidden, "unknown" | no | blocked |

Why three states: the plugin bundles the registry, yet **every published version needs MoonPay manual approval** [06 §2]. A single hard TTL would blind the plugin between approvals. Mitigations, in order: (1) volatile values (fee rates, books, venue state) are read live and the registry only holds structure and pointers; (2) Option B signed static JSON refreshes the registry without a plugin release (owners can change hosts and variables without resubmitting code [06 §2]); (3) the stale/expired states degrade labels instead of crashing. Rule: a gate may use a value only if it is `fresh` **and** has confidence H (primary document, live API or on-chain read), or M with a recorded cross-check; vendor claims (L) never gate.

### 3.6 Capability flags: read, trade, via PayBox

Three independent axes, kept separate so venue facts are not mixed with our reachability (design rule 6). Values for the target set below come from AD §3.2 and §3.5 (which cite notes 01-11); they are the first thing to re-verify when the registry is populated.

| Platform | `api.read` (auth, depth) | `api.trade` | `reachability.class` / `proof` | Blockers recorded in `human_onboarding_steps` |
|---|---|---|---|---|
| xo | keyless (`orderbooks.xo.market`, Data API); full books; no public trade tape | yes: L1 `ClobAuth` to L2 HMAC; EIP-712 order, smart-account signature type 3 | E2 (partial) / none | per-user credential custody; PayBox wallet as Kernel owner; chain 3223 and typed-data acceptance untested; funding in-app only [AD §3.5] |
| polymarket | keyless (Gamma, CLOB, Data API v2); full | yes: EIP-712 plus L2 HMAC | E2 (partial) / none | Polygon at tool level unverified; human-created credentials; geoblock by request IP |
| polymarket-us | keyless gateway REST; WS on authenticated host | yes: Ed25519 `X-PM-*` keys | E4 manual | SSN-KYC US-resident fiat venue |
| kalshi | keyless REST; **WS needs a key** | yes: RSA-PSS signed requests | E4 manual | KYC account, API key in UI; Developer Agreement bars aggregating/caching and facilitating others' trading [AD §10] |
| limitless | keyless; YES-side books | yes: HMAC token minted from wallet-signed login | E2 (partial) / none | credential creation (UI or Privy headless route, open) |
| trueo | **no API**: JSON-RPC `eth_call` on Base only | plain EVM calls (approve, Permit2, adapter) | **E1** by mechanism / none | 2-4M gas simulation and 5-minute multi-step flows untested; `Launchpad.deposit` needs a Permit2 signature (E2 for that step) |
| world | via PayBox `world_*` tools only | PayBox official plugin | E3 (Solana island) / n/a | catalogue only through the plugin |
| predict-fun | key-gated on mainnet (240 rpm) | yes (BNB, typed data) | E2 (partial) / none | API key; geo |
| opinion | keyless (5 rps live) | yes (BNB Safe, EIP-712 key auth) | E2 (partial) / none | web onboarding step; thin depth |
| hyperliquid-outcomes | `POST /info` only | L1-action signing | **unknown** | official PayBox `hyperliquid` plugin is spot-only; outcomes unchecked |

`reachability.routes[]` records alternatives: `{kind: plugin | x402_service | mcp | manual | none, id, status: shipped | flagged | planned | claimed, as_of}`. Example: for kalshi `[{kind: manual}]` and, for read data only, `{kind: x402_service, id: "blockrun-pm", status: shipped}`. `reachability.plugin_adapter` records our own read adapter state and its slot cost against the 16-host budget [AD §1.5].

### 3.7 Fee models and conflicts

`fees.model` (aligned with AD `FeeSpec.modelId`): `curve_pq` (rate x p x (1-p): XO, Polymarket, Polymarket US, Kalshi), `curve_min` (base x min(p,1-p): Predict.fun), `ad_valorem_bps` (Limitless 0.40% to 3.00% by price, Opinion 0-1% with a $0.25 minimum), `profit_pct` (SX Bet 1% of winning profit), `amm_stack` (Trueo: LP fee + hook fee + price impact + launchpad fee), `unknown` (fail closed; never default to zero). `params_source` says where to read **live** parameters (Polymarket Gamma `feeSchedule`; Kalshi series `fee_type`/`fee_multiplier` plus event overrides and scheduled changes; XO `/fee-rate` and the Data API `effectiveFeeConfig`; Limitless market `venue.feeModuleType`) [AD §3.3]. A **conflict** is first-class: XO's two sources disagree, so the record is `status: conflicted` with `use_rule: max_of_sources_until_fill_reconciled`, which is exactly the AD rule that refuses the `executable` label until one real fill reconciles it [AD §0.1 item 6].

Illustrative XO fee block (values from AD §3.3; not a fresh read):

```json
"fees": {
  "model": "curve_pq",
  "formula": "fee = C x (feeBps / 10000) x p x (1 - p) per filled leg",
  "params_source":    { "url": "https://orderbooks.xo.market/fee-rate?token_id={token_id}", "granularity": "token", "field": "base_fee" },
  "secondary_source": { "url": "https://api-mainnet.xo.market/api", "granularity": "market", "field": "effectiveFeeConfig.takerFeeBps", "note": "market detail route per docs/research/02" },
  "status": "conflicted",
  "use_rule": "max_of_sources_until_fill_reconciled",
  "maker_rebate": "35% of taker fee on eligible fills",
  "meta": { "last_verified": "2026-10-19", "ttl_days": 30, "method": "live_api", "confidence": "H",
            "verified_by": "docs/research/10 V3", "sources": [ { "url": "https://docs.xo.market/guides/fees", "retrieved": "2026-10-19" } ] }
}
```

### 3.8 Geography and regulatory flags

`us_persons` (allowed, close_only, blocked, unknown), `geo_model` (everyone, global_restrictions, allowlist, checked_at_point_of_use, unknown), `restricted_iso2[]`/`allowed_iso2[]` **with their `meta.sources` and `as_of`**, `enforcement` (D4/D10), `bots_policy` (allowed, conditional, prohibited, unknown) and `wash_trading_prohibited`. Rules: (1) lists are evidence for display and screening; **execution gates require a live check at the user's own client**, never a registry list and never the plugin host's IP [AD §10]; (2) an unverifiable list stays `unknown` (Kalshi's restricted list is unverifiable [AD §10]); (3) the registry can compute a **mutual-eligibility** flag only when both lists are `fresh` and complete, else `unknown`, and `unknown` blocks the `executable` label; (4) a venue pair that no single person can use is marked in the pair table (Polymarket International is close-only for US persons while Polymarket US is for US residents only [08 §0 item 5, 08 §3]; M, inferred).

### 3.9 Resolution oracle fields

`oracle_types[]` (uma_oo, pyth, chainlink, ai_panel, venue_staff, community_vote, manual, external_venue_parity, unknown), `oracle_cluster`, `void_policy.kind` (fifty_fifty, refund, last_traded_price, invalid_reverse_trades, unknown), `discretionary_settlement`, `early_close_possible`. These are the inputs to default `basis_class` priors (4.4). Target-set values from AD §3.4: XO manual with creator-specified resolver and MODRA AI panel, void with refund path; Polymarket UMA OO (50-50 pays $0.50), Chainlink for some; Kalshi exchange determination with lifecycle states, scalar and last-price settlement exist, can close early; Limitless Pyth/Chainlink/sports feeds and "external venue parity" for mirrors; Trueo optimistic windows with a 5-member council (no timeout), cancellation pays 0.5 TYD per token [AD §3.4].

### 3.10 Liquidity links and pools

`liquidity_links[]` relations (D2):

| Relation | Meaning | Pool effect |
|---|---|---|
| `same_book` | both records expose one order book | same pool |
| `routes_to` | front end or broker whose orders land in the target's book (stored on the front end) | same pool as target; front end is never a pool representative. A front end that routes to several pools (Jupiter's `provider` field [14 §6.2]) lists them all and is excluded from pool-based consensus |
| `mirror_of` | separate book, market set copied from the target, prices linked by arbitrage | **separate pool**; source of L0 link candidates |
| `settles_on` | resolution derived from the target's outcome ("external venue parity") | separate pool; near-zero resolution basis for the mirrored subset only |

`affiliations[]` (`parent_of`, `child_of`, `fork_of`) never affect pools. Pools are the connected components of `same_book` and `routes_to`. `native_cross_refs[]` records venue-published fields that name another venue's market (Predict.fun `polymarketConditionIds`/`kalshiMarketTicker`, Limitless `metadata.externalSlug`/`isPolyArbitrage`/`externalRulesWatch.rulesHash`, Probable `/markets/polymarket/{id}`) for the market-level linker to consume first [AD §4.3 L0].

### 3.11 Aggregator ledger

A second small schema (`aggregators/<id>.json`) answers "what can we depend on, and what covers what", with claimed versus verified coverage:

```json
{
  "aggregator_id": "predictefy",
  "kind": "hosted_api",
  "levels": [4, 6],
  "urls": { "docs": "https://docs.predictefy.com/llms.txt", "terms": null, "pricing": null },
  "venues": [ { "platform_id": "xo", "status": "claimed", "as_of": "2026-09-02", "evidence": "docs: nothing has ever been submitted to XO" } ],
  "capabilities": { "cross_venue_matching": "clusters", "execution": "hosted lanes, 13 armed", "custody": "non-custodial claimed" },
  "licence": "closed server; commercial use Enterprise only",
  "health": { "last_release": "2026-10-07", "probe_status": "live", "probe_at": "2026-10-19", "state": "live" },
  "meta": { "last_verified": "2026-10-19", "ttl_days": 7, "confidence": "M", "method": "vendor_claim", "sources": [] }
}
```

`state`: live, quiet (no release or commit for 90 days, D), dead (EOL banner or two weeks of DNS failure), unreachable. Seed rows from [fx:pop_aggregator_venue_coverage_2026-10-19.json] (21 rows) plus AGG, Predikt, CoinRithm, Seerium, predictionmarketdata.io; fix its two known inconsistencies on import (River cross-venue matching is not "none"; Almanac does list Limitless) [14 V-A9].

### 3.12 CI and validation rules

1. JSON Schema 2020-12 validation of every record (ajv 8 `ajv/dist/2020`); unknown enum value fails the build.
2. Every non-null leaf lives in a section with `meta.sources` of at least one entry; `field_sources` indexes must exist; evidence quotes at most 25 words.
3. Referential integrity (D9): all `target_platform_id`, `parent_platform_id`, `aggregator_id` resolve.
4. Pool derivation is acyclic; every `routes_to` target is a pool representative; a front end has no `api.trade` of its own claimed as a book.
5. Fee sanity: `fees.model != unknown` requires `params_source` and `formula`; `status: conflicted` requires `secondary_source` and `use_rule`.
6. Gate-class sections of any platform enabled in a build (`VENUES=...`) must be `fresh` at build time, or the build fails (the plugin still degrades at runtime per 3.5).
7. No field may contain free text longer than 200 characters except `notes`, which is stripped from the export view.
8. Tombstone check: no record may reuse an `excluded.json` id without an explicit resurrection entry.

### 3.13 Corrections the five seed records need before promotion

The 14 seed was built on 2026-10-19 before later verification landed; promoting it unchanged would encode known errors [fx:pop_platform_registry.seed.json vs AD Appendix A]:

- **xo `active_markets: 9` and the `tier_basis` sentence "9 ACTIVE vs 1,322 CLOSED"** are the refuted legacy-AMM slice; corrected figures are 248 ACTIVE type-2 CLOB plus 4 CLOB Pulse plus about 166 type-4 ("Conviction", thin), 421 ACTIVE across types 0-4, with 57 of 60 sampled type-2 books two-sided and a median spread of 2.0 cents [AD §3.2, AD Appendix A]. The `depth_sample` (34 markets, 17 two-sided) is superseded.
- **xo `fees.taker`** ("vendor says category rate currently 0") must become the conflicted state (3.7).
- **trueo** is nearly empty although note 11 supports much more: `execution_model` amm_hook (Uniswap v4 pools behind a hook), Base, collateral TYD (not USD), optimistic council resolution, operator in Samoa with US Persons excluded, `amm_stack` fees, E1 mechanism [AD §3.2-§3.5].
- **polymarket / kalshi `bots_policy: unknown`** is correct; keep it. Kalshi `api_base` should record both `external-api.kalshi.com` (dedicated) and `api.elections.kalshi.com` [AD §1.5].
- **Dangling ids** (D9) and the `parent_of`/`broker_for` mixing (D2) must be fixed by adding light records and splitting links.
- **Record-level `ttl_days: 7`** must become per-section (3.5).

---

## 4. How the registry drives the venue-adapter layer and the cross-venue matcher

### 4.1 Registry to adapter layer

| Registry field | Consumer | Effect |
|---|---|---|
| `status.state` + `api.health_probe` | adapter `health()` and build flags | `dark`/`dead` disables a venue in `VENUES=...`; `unknown` after failed probes fails closed [AD §2.4] |
| `urls.api_base[]`, `reachability.plugin_adapter.host_slots` | host allowlist generator | builds the exact-host list and checks the 16-host budget (11-13 used by the P0/P1 set) [AD §1.5] |
| `api.read.has{}` (ccxt-style) | adapter `caps` | `false` means `NOT_SUPPORTED`, never invented data [AD §1.2 principle 5] |
| `api.read.orderbook_depth`, `market_identity` | normaliser selection | which of the four book conventions and which id/group fields apply (AD §2.2) |
| `fees.model`, `params_source`, `status` | `getFeeSpec()` and the edge gates | unknown or stale fails closed; conflicted uses the stated rule |
| `chains[]`, `collateral` | unit and friction checks | decimals (6 vs 18), custody islands, capital-lock and rebalancing charge [AD §2.3, §5.5] |
| `reachability.class`, `proof` | `pm_plan_legs` | E1/E2/E3 legs get plans, E4 legs render instructions, E5 refused; a manual leg caps the label at `hedged_discrepancy` [AD §5.7, §6] |
| `regulation_geo.*`, `bots_policy` | plan preconditions | per-leg user-attested eligibility, never a hard-coded list [AD §10] |
| `liquidity.tier`, `depth_sample` | `pm_find_edge` ordering | evaluate deep pools first; tier X venues are reference-only |
| `builder_program` | monetization hook (not an edge input) | Polymarket builder code (taker max 100 bps, maker max 50 bps) is a ready hook for any Polymarket leg; XO has opaque `identifier`/`metadata` tags but no builder fee [14 §6.3] |

### 4.2 Pool map for the current venue set

Independent liquidity pools versus front ends and mirrors (evidence in brackets; M or L where the mapping is inferred from third-party text):

| Pool (own book) | Platform record | Front ends and brokers that route into it | Mirrors (separate book, linked price) |
|---|---|---|---|
| Polymarket International (Polygon, pUSD) | polymarket | MetaMask Predictions ("Powered by Polymarket", 4% fee shared with Polymarket) [H]; Polymarket builder-code front ends (Whalidate, SmartX, Polycule, Betmoar.fun, Stand, Polygun among about 63 DefiLlama Interface rows) [M]; Jupiter Prediction lists a `provider` field with example `polymarket` [H for docs] | Limitless (496 declared Polymarket mirrors via `metadata.externalSlug`) [17 §0.10], Predict.fun (`polymarketConditionIds`), Probable (`/markets/polymarket/{id}`) [09 §0] |
| Polymarket US (CFTC DCM, USD, SSN-KYC) | polymarket-us | none known | none known. Separate venue, separate market set, mutually exclusive eligibility with the International venue for a given person (M) |
| Kalshi (CFTC DCM, USD) | kalshi | Robinhood (Almanac, M), Jupiter Prediction and DFlow (DefiLlama adapter text: "all the fees goes to kalshi", "powered by Kalshi CLP"; M), Coinbase Predict and Phantom via DFlow (Kairos list, L) | Predict.fun `kalshiMarketTicker` (null in the testnet sample) [09] |
| Hyperliquid HIP-4 outcomes | hyperliquid-outcomes | 35 front ends (DefiLlama Interface rows "X Outcome", builder-code fees on sells, M-H) [14 V-A2, V-A3] | none known |
| Limitless (Base) | limitless | partner sub-accounts (Kairos list, L) | is itself a mirror of Polymarket for the mirrored subset |
| XO (chain 3223) | xo | none known (XO access "may be partner-provided", vendor claim) | none known |
| Trueo (Uniswap v4 pools, Base) | trueo | none known | none known |
| Predict.fun, Opinion, Probable, Myriad, SX Bet, MagicMarkets | each its own | none documented | see above |
| World (Solana) | world | PayBox official plugin | not mapped |

Not pools (never counted as venues): AGG, Synpath, River Markets, Predictefy, ccxt, pmxt, Kairos, Matchr and every other aggregator or terminal [14 §6.1]. Unmodelled: Polymarket Combos (separate DefiLlama row, $21.2M 30d, relation to the International book unknown) and Gate Predictions (backing venue not determined, $29.7M 30d) stay `radar`/`light` with `routes_to: unknown` until read.

### 4.3 Pair eligibility from registry data

For each ordered pair of platform records the matcher asks (D design; all unknowns fail closed):

1. `pool(a) != pool(b)`; otherwise the pair is a front end versus its own book and any "edge" is a fee difference.
2. Both `status.state` in (live, beta) and the sections used are not expired.
3. Depth: `min(tier) >= D` to screen, `>= C` to gate, after the depth downgrade.
4. Data readiness: both readable without a missing key (Predict.fun mainnet and Kalshi WS are not).
5. Execution classes (E1-E5) cap the label; any E4/E5 leg caps at `hedged_discrepancy`; `executable_arbitrage` stays disabled until AD decision D2 is met.
6. Geo: mutual eligibility `true` only when both lists are fresh and complete; else `unknown`, which blocks `executable` but not `indicative`.
7. Priors: default `basis_class` and axes from oracle types (4.4); native hooks as L0 candidates.

Applied to the target set (evidence from AD §0.1, §4.1, §5 and notes 17/18; the two pre-existing studies without verification sections, 15 and 18, are researcher-level numbers):

| Pair | Pools | Default basis prior | Native hook | Execution classes | Min tier | Matcher priority and what the numbers say |
|---|---|---|---|---|---|---|
| XO x Kalshi | independent | `settlement_source` (XO manual/MODRA vs exchange determination) | none; deterministic UCL triples vs `KXUCLGAME` matched 18/18 on title and date | E2 (partial) x E4 | C x A | **P0** reference price. Median mid gap 0.1 cent, zero gross edge in 53 outcomes [AD §0.1] |
| XO x Polymarket | independent | `settlement_source`; cutoff offset about 5 h (XO UTC, Polymarket ET) | none; 32 of 98 non-sports XO markets had a title-identical counterpart | E2 x E2 (both unproven) | C x A | **P0**. Gated Jaccard 23/23 in-sample, 5/8 on a fresh subset with one entity-swap false link [AD §4.1] |
| Polymarket x Kalshi | independent | `settlement_source` (UMA vs exchange) | none; third-party matchers cover it | E2 x E4 | A x A | P0 as consensus mid. Resolution divergence incidents are the main risk (Khamenei) |
| Polymarket x Limitless | independent (mirror) | `identical` possible for the `settles_on` subset (external venue parity), else per oracle | `externalSlug` (90 of 100 sampled), `isPolyArbitrage`, `rulesHash` | E2 x E2 | A x D (X by depth, best bid <= $90) | Not tradable at size; **use as the silver-label source** to calibrate the linker (it recovered 56% of 496 declared mirrors at similarity >= 0.45) [17 §0.10] |
| Polymarket x Polymarket US | independent | n/a | none | E2 x E4 | A x A | Exclude from execution: no single person is eligible on both (M); keep for reference |
| Trueo x any | independent | optimistic council vs others: `settlement_source`; cancellation pays 0.5 TYD | none | E1 (mechanism) x any | X (30d $17.1K) | P2: anomaly and reference only; read only through Base RPC |
| Kalshi/XO x Limitless, XO x Trueo | independent | per oracle | none | various | D/X | P2: no hook, no depth |

### 4.4 Priors the registry hands to the market-level matcher

- **Default `basis_class` by oracle pair** (Oddpool-style `identical | settlement_window | settlement_source` with divergence axes [AD §2.5, §4.4]): any pair involving XO manual/MODRA defaults to `settlement_source` [AD §4.4]; UMA versus exchange determination defaults to `settlement_source`; UMA versus UMA can be `identical` after rule-hash comparison; a `settles_on` mirror defaults to `identical` for the mirrored subset. The link record always overrides after human review.
- **Void-policy mismatch becomes an axis**: if `void_policy.kind` differs (fifty_fifty vs last_traded_price vs refund), the pair carries a `void` axis and can never be labelled riskless; the haircut size stays an AD calibration item (D defaults in AD §5.6).
- **L0 candidates** come from `native_cross_refs` (Limitless, Predict.fun, Probable), then Kalshi milestones/Polymarket fixture ids where both venues use the same provider, then XO `eventSlug` from the earning-pools endpoint [AD §4.3]. They are candidates with provenance, not verified links.
- **Third-party identifiers as inputs, never substitutes**: River `generic_asset_id`, AGG `matchedVenueMarkets`, Synpath `event_id`/`side_map`, Prediction Hunt `group_id`, CoinRithm Event ID, Oddpool `basis_class`. None covers XO or Trueo, so the human-approved funnel for XO legs is unaffected [14 V-D, last bullet].
- **`market_identity`** tells the within-venue batcher how to form sets (Polymarket neg-risk events with augmented "Other" caveats; Kalshi `mutually_exclusive` which is not exhaustive; XO `rootEventSlug` on detail routes only; Limitless group markets need the child slug; Trueo markets keyed `${chainId}:${marketAddress}`) [AD §2.1, §2.4, 16 §3].

### 4.5 Consensus and fee stacking

- **Consensus mid and "number of venues"** count pools: MetaMask Predictions plus Polymarket is one vote; a mirror's price is derived, not independent, and is weighted down or excluded from fair-value consensus (the AD fair-value routine takes executable prices only [AD §12]).
- **Fee stacking per route**: a leg placed through a front end pays the front end's fee on top of the pool's (MetaMask 4% shared with Polymarket; Polymarket builder fees additive to platform fee, taker max 100 bps) [14 §6.2-§6.3]; `routes[]` carries these so `pm_plan_legs` prices the actual route, not the venue's headline.

### 4.6 What this means for the correlation and arbitrage question

The platform registry does not find arbitrage; it decides **which pairs of independent pools are worth batching** and what risk class they start in. Market-level batching then happens in two places: within a pool (partitions, ladders, neg-risk sets keyed by `market_identity`) and across pools (approved links). Evidence so far, all from the sibling notes and snapshots of 2026-10-18 (single snapshots, small samples; notes 15 and 18 unaudited): within-venue structure is almost never violated net of fees (0 of 706 sell-side sets net-positive; 3 of about 278,000 ladder pairs survive fees, worth $13.4 in total); cross-venue "edge" is overwhelmingly false links (only 13 of 30 profitable-looking links at similarity >= 0.65 were identical); 17 verified-true links have median 46 bps net, long-dated and thin; no taker-side lead-lag edge survived frictions in 41 relationships [17 §0, AD §0.1]. The registry's value for this question is therefore (a) never double-counting liquidity or independence, (b) supplying fee, oracle and void priors so false or fragile links are labelled correctly, and (c) steering effort to pool pairs where both legs have depth. Direction: scan partitions first, ladders second, cross-venue pairs third [AD §5.8].

---

## 5. Build, buy or borrow, per component

| Component | Decision | What to borrow or buy, and why |
|---|---|---|
| Registry schema, data files, compile and CI | **BUILD** (thin) | Base on 14 §9 schema 0.1; ajv and zod already in the repo; no one publishes fees + geo + oracle + reachability + links with TTLs [14 §11] |
| Seed data | **BORROW** | Almanac CC0 for Polymarket, Kalshi, Limitless, Opinion, Predict.fun, Myriad, SX Bet (re-verify every value; single maintainer) [14 §2.4]; our own verified facts for XO/Trueo |
| Identity join and liveness | **BORROW** DefiLlama | `defillama_slug` on every record; dead flags and volume as detection inputs only; no data licence stated, so read-time lookups [14 §2.1] |
| Fee parameters | **BUILD** a small fetcher per venue | read from each venue's own endpoint; **BORROW** PolyKal `fees.json` as an independent cross-check (CC-BY-4.0, attribute) [14 §2.6] |
| Geo / ToS / bot policy | **BUILD** (hand-verified) with hash-based change detection | no third party publishes dated bot policy; AGG's geo-policy endpoint (11 venues, app id) and Almanac `geo` are cross-checks only |
| Capability vocabulary | **BORROW** ccxt `has` map, `executionModel`, `collateral`, Predictefy `requirements` shape, Almanac `geo`/`data`/`status` | design, not code [14 §4.1] |
| Capability probing / health | **BUILD** small prober using recorded fixtures | reuse the fixture-and-drift-alarm plan in AD §8.3 |
| Aggregator ledger | **BUILD** | claimed versus live; fed by npm/PyPI/GitHub/DNS probes |
| New-venue discovery (radar) | **BORROW** lists as leads | DefiLlama diff by id; Prediction Index, Almanac, Kairos list, tgel0 directory as discovery signals; avoid scraping Prediction Index (no stated terms) |
| Pool graph | **BUILD** (derived in compile) | union-find over `same_book`/`routes_to`; no third party publishes it |
| Market-level matcher | **BUILD** (AD §4) | **BORROW** concepts: River generic assets, Synpath `event_id`/`side_map`, Oddpool `basis_class`, pmxt relation enum; **BUY for benchmarking only**: Prediction Hunt, Predictefy, Oddpool, pdata.world (free) to measure our precision |
| Smart order routing | **DO NOT BUILD** here | Synpath and River are benchmarks; non-XO legs are never executed by plugin code [AD D5] |
| Hosted aggregators at runtime | **AVOID** | seven dead or dark items in 2026; Predictefy commercial use Enterprise-only; pmxt personal-use-only |
| Tick history | **BUY only if needed** | Predexon, or BlockRun at $0.0085 per call, or our offline snapshotter [AD §12] |
| Signed distribution (Option B) | **BUILD** | Ed25519 sign in CI, verify in plugin [AD D3] |
| x402 listing | **DEFER** | section 7 |
| Upstream to Almanac | **OPTIONAL** | free external freshness check for XO/Trueo; author decision |

---

## 6. Keeping the registry fresh

All cadences and thresholds below are design defaults (D) to be tuned against observed churn, not findings.

### 6.1 Checks

| Check | What | Source | Cadence | On change or failure |
|---|---|---|---|---|
| C1 liveness and state | venue API/docs reachable; DefiLlama `deadFrom`/`deprecated`; EOL banners | HTTP GET, `/protocols` | daily | 3 consecutive failures set `dark`; a DefiLlama dead flag opens a `deprecated` PR |
| C2 new-listing radar | diff DefiLlama category rows **by id** (31 of the 133 rows have no `listedAt` [14 §2.1]); Prediction Index count; Almanac commits; Kairos list status changes | public lists | daily to weekly | opens a triage issue: radar, light or full |
| C3 liquidity metrics | DefiLlama 24h and 30d volume, fees, OI; recompute tier | `/overview/{dexs,fees,open-interest}` | daily fetch (section TTL 7 d) | auto-commit allowed for this section only; a tier change is flagged |
| C4 depth sample | top-N books per venue: median spread, depth within 5 cents | venue book endpoints | weekly | downgrade one tier when depth contradicts volume |
| C5 fee parameters | Polymarket `feeSchedule` (rate, exponent; all exponents seen were 1, fail closed otherwise), Kalshi series and `fee_changes`, XO `/fee-rate` versus `effectiveFeeConfig`, Limitless `feeModuleType`; PolyKal `live_check` | venue endpoints | weekly, plus live at quote time | diff to PR, human merge; XO stays `conflicted` until a real fill reconciles |
| C6 API shape drift | replay recorded fixtures against live responses; schema hash | fixtures | weekly and in CI | `SCHEMA_DRIFT` flags the adapter; Kalshi ships changes weekly, Polymarket v1 retires 2026-10-24 [AD §8.3] |
| C7 terms and geo | sha256 of normalized ToS/geo/changelog pages (store the hash, not the text); Polymarket geoblock endpoint; AGG geo-policy if an app id is obtained | venue pages | weekly hash, monthly human read | hash change marks the section `stale` and opens an issue |
| C8 resolution and void | hash of rule pages; UMA parameters; Kalshi lifecycle docs | venue docs | monthly | as C7 |
| C9 PayBox reachability | `discover_plugins`/`discover_services` queries for each platform; PayBox SDK and docs changelog; chain catalog | PayBox read-only calls | weekly, plus event-driven | a new plugin or service row changes `routes[]` (claimed until a call succeeds) |
| C10 aggregator ledger | npm/PyPI/GitHub last publish and push, DNS, pricing page hash, EOL banners | registries | weekly | no release in 90 days = `quiet`; two weeks of DNS failure or an EOL banner = `dead` |
| C11 third-party cross-check | Almanac `geo.as_of` and fields, PolyKal, Kairos statuses, DefiLlama dead flags versus our records | public data | monthly | disagreement report to a review queue; never auto-overwrite |
| C12 re-census | all radar rows and new categories; re-rank tiers; prune | all of the above | quarterly | about two hours of human review |

Load: C1-C3 are about four DefiLlama calls a day (the `/protocols` payload was about 9.3 MB when fetched [14 V-D]); C4 is about 30 books times 10 venues a week at 250 ms spacing. Both are far below documented limits, but XO returned 429 after about 35 requests in 20 seconds, so the XO probes stay throttled [AD §3.2].

### 6.2 Job design

An offline job (the AD `apps/indexer`, GitHub Actions cron or a local cron) runs C1-C12, writes evidence (URL, retrieval time, response hash, short quote) and opens a branch and PR with the proposed diff. It never runs inside the plugin (10 s, stateless, attacker-controlled text) [AD §1.4]. Probes use a neutral User-Agent and public unauthenticated GETs only, with exponential backoff on 429/5xx.

### 6.3 Review and release

- **Auto-merge allowed:** `liquidity.metrics`, `status.state` toggles driven by objective probes, aggregator `health`.
- **Human merge required:** `fees`, `regulation_geo`, `resolution`, `reachability`, `api.trade`, `links`.
- **Releases:** compile and tag `registry_version` weekly or on any gate-class merge; sign; publish the static JSON; the next plugin build embeds it.
- **Fail-closed rules (3.5):** stale blocks gates, expired reads `unknown`, unknown fee model never defaults to zero, a dark venue is never `live`.
- **Service levels (D):** 100% of gate-class sections fresh for every venue enabled in a shipped build; median section age at most half its TTL; zero records whose directory-sourced state contradicts a failing probe for more than a day.

### 6.4 Evidence discipline

Every H claim cites a primary document, live API response or on-chain read with a retrieval date; M requires a recorded cross-check; vendor claims and directory text are L and never gate. This is the same rule the notes applied (H/M/L) turned into a field (`meta.confidence`) so the plugin can enforce it.

---

## 7. Could the registry itself be offered as an x402 service or PayBox plugin tool?

### 7.1 What is already on offer

PayBox surfaces services from the Coinbase Bazaar and pay.sh catalogs; by default only services with recent usage, at least 10 unique payers in the last 30 days and a supported rail [06 §9]. Prediction-related offers seen (H for existence and price from live 402s or listings; descriptions are untrusted vendor text):

| Offer | Scope | Price |
|---|---|---|
| BlockRun `pm/*` | Predexon pass-through: Polymarket, Kalshi, Limitless, Opinion, Predict.fun, Binance | $0.0085, Base |
| x402tap `prediction-arb`; x402-factory `cross-venue/disagreement` | Polymarket vs Kalshi divergence | $0.05 each [14 V-A5] |
| Seerium `cross-venue-disagreement` [me] | Polymarket, Kalshi, Gemini disagreement with match confidence | $0.10, Base or Solana |
| clinkagent `pm/odds` | cross-platform gap, Polymarket vs Kalshi | $0.02 |
| agentstools `prediction/search`, `/market` | Polymarket + Manifold normalized | $0.01 |
| predictionmarketdata.io `prediction-markets` and `/taxonomy` [me] | event-level search over Kalshi, Polymarket, Gemini codes; classification codes | $0.001 each |
| x402atlas Hyperliquid outcomes catalog [me, listing] | market-level catalog, one venue | $0.005 |
| openverbs `/v1/fees`, agent402 `/api/defi-fees` [me, listing] | DeFi protocol fee/revenue rankings (DefiLlama-class data, not prediction-specific) | $0.003 / $0.002 |
| EchoMarkets (PayBox Open Plugin) | Polymarket-only signal briefs | 0.02-0.10 USDC [14 §8.1] |
| `world` (official PayBox plugin) | Solana prediction markets | n/a |

**Nothing sells platform-level records** (fees, geography, oracle, reachability, pools), and no plugin does either; nothing covers XO or Trueo [14 §8.2, me]. The nearest platform-ish product is protocol-level fee data at $0.002-$0.003 per call, which sets the price reference.

### 7.2 Options

| Option | What | Verdict |
|---|---|---|
| O1 Bundled plugin tools | `pm_list_venues`, `pm_get_venue` (and a registry-status tool) read the bundled registry offline; free; doubles as the conformance sample call [AD §9.1] | **Do (AGG-0).** Answers "which prediction venues can my PayBox wallet reach, and with what fees, geography and oracle?" inside PayBox, where `discover_plugins` shows only `world` |
| O2 Signed static JSON | `registry.json` plus signature on an allowlisted static host; refreshes without a plugin release | **Do** when the registry outgrows the bundle or staleness bites (AD Option B); one host slot |
| O3 Public repo data | publish verified facts (identifiers, URLs, enumerations, evidence links) under CC0 or CC-BY-4.0 | **Consider** (author decision); upstream XO and Trueo records to Almanac for a free external check |
| O4 Paid x402 route | a hosted `GET /v1/platforms/{id}` priced at $0.001-$0.01, listed on Bazaar and/or pay.sh | **Not now.** See below |
| O5 `kind: "x402"` proposal from the plugin | the plugin proposes a payment to our own route | Not needed: nothing in the registry is worth paying for at this scale; also puts payment initiation in plugin code [AD §7] |

Why not O4 yet: (1) price references are $0.001-$0.10 and at 10 payers a month revenue is cents, so it would be a distribution play, not income; (2) PayBox's default curation needs at least 10 unique payers in 30 days and the uncurated `raw` flag was not usable from the harness [06 §9], so discovery by PayBox agents would be poor at first; (3) it needs an owner backend and monitoring; (4) licence and terms on inputs (below). The one real advantage of x402 listing is that it is the only publishing path **not** gated by MoonPay's manual plugin approval and the closed Chapter 1 window [06 §2, §9]; if plugin access stays blocked, revisit O4 as a free or near-free route listed via a pay.sh PR (`providers/<org>/<name>/PAY.md`) or Bazaar auto-cataloguing.

### 7.3 Licence and terms constraints on what can be published

- **Own verified facts** (formulas, endpoint URLs, enumerations, evidence links, short quotes) are low risk and can be published under a licence of the author's choice.
- **DefiLlama-derived numbers:** repos carry no licence file and a redistribution licence was NOT FOUND; keep `liquidity.metrics` out of any public export (publish `tier`, `as_of` and a pointer) until DefiLlama's terms are confirmed [14 §2.1, §13].
- **Kalshi and Quotient:** Kalshi's Developer Agreement bars collecting, caching, aggregating or sharing API data except for the member's own trading; Quotient's terms bar redistribution and shared access. Neither contributes data to the registry beyond ids, URLs and hashes; keep it that way [AD §10].
- **PolyKal** is CC-BY-4.0 (attribute); **Almanac** is CC0; pdata.world is CC BY 4.0; Predictefy, pmxt and Adjacent restrict commercial or financial-product use [AD §10].
- **Consumers of the registry are agents:** enumerations over free text, no instructions in fields, `notes` stripped from the export.

### 7.4 What would change the recommendation

Evidence of demand (a PayBox user or integrator asking for venue reachability), a confirmed redistribution licence for the volume data, or continued inability to ship the plugin. Cheap way to learn: ship O1 and O3 first and count requests to the static JSON.

---

## 8. Open questions, risks, NOT FOUND

**Decisions for the author**
1. Repo JSON (recommended) versus a table in the plugin's data store.
2. Upstream XO and Trueo records to Prediction Almanac (CC0), or keep private?
3. Public licence for the registry's own facts (CC0, CC-BY-4.0, or none).
4. Is a free Predictefy key (to compare its `requirements` for XO) and an AGG `x-app-id` (to cross-check geo) worth creating later? Key creation was out of scope here.
5. Ask XO whether tagged order flow (`identifier`/`metadata`) can earn a partner or builder fee; the paymaster docs name the onboarding contact [14 §6.3].
6. Who performs the monthly human read of ToS and geo pages, and what is the escalation if a venue changes terms between releases?

**Evidence gaps**
- Backing venue of Gate Predictions and other DefiLlama Interface rows; whether any route to Limitless or XO [14 §13].
- Reliability of Synpath, Prediction Hunt and pdata.world matches (a calibration pass against our approved link set would answer it).
- Whether Polymarket International and Polymarket US share any liquidity (treated as separate pools, M).
- Terms of Service for Synpath, River, Kairos, Predexon, Prediction Hunt and AGG hosted APIs; DefiLlama data redistribution licence.
- Primary-source verification of Phantom x Kalshi, Coinbase Predict and Robinhood routing (only Almanac and the vendor-curated Kairos list).
- Health-probe endpoints for venues other than XO (`/trading-state`) and Limitless (`/maintenance/status`) are not documented in the notes (NOT FOUND for Polymarket, Kalshi, Trueo).
- Research-firm market maps of the platform landscape; Token Terminal and DappRadar sector pages (searched: URL guesses and two web queries; 404/403 or nothing) [14 §13].
- zod v4 JSON Schema export coverage of the proposed keywords (M; verify in AGG-0).

**Risks**
- **Directory rot** feeding the registry: mitigated by probes and "never overwrite" (C11).
- **Single-maintainer upstreams** (Almanac, PolyKal): used as cross-checks, not truth.
- **A wrong gate-class value costs money or breaches a ToS**: human merge, `fresh` + H rule, live user-side eligibility.
- **Plugin release friction** (manual approval of every version; portal closed to non-entrants as of 2026-10-17) can leave the bundled registry stale: Option B and the three-state staleness model address it.
- **Scope creep:** a registry of 133 radar rows is not a goal; full records stay at about 12.
- **Vendor-curated and affiliate content** (Kairos list ranks Kairos first; awesome-lists carry `utm_source` tracking): leads only [14 §2.7].

**Suspicious or embedded-instruction content (treated as data, not followed).** Inherited from notes 14 and 10 (agent-targeted onboarding text in `blockrun.ai/llms.txt`, Parsec, Synpath, CoinRithm and AGG docs; promotional "Featured" blocks and affiliate parameters in awesome-lists; vendor marketing text in x402 catalog descriptions). New in this pass: the two x402 402 bodies and PayBox catalog descriptions I read contained marketing text only, no instructions.

---

## 9. Method and sources

**Method.** I read note 14 in full (including its Verification), `docs/aggregation-design.md` in full, `docs/plan.md`, the PayBox platform note 06 (sections 2, 3, 9, 10), targeted sections of notes 08, 09, 10, 16, 17, and the 14 fixtures (schema, seed, DefiLlama registry, aggregator coverage). My own actions on 2026-10-19: read-only PayBox `discover_services` (two queries) and `discover_plugins` (one query); seven unpaid HTTP GETs across two hosts (`api.predictionmarketdata.io`: root 302, `/prediction-markets` 402 fetched twice, `/llms.txt` 403, `/prediction-markets/taxonomy` 402; `api.seerium.xyz`: 402); nothing paid, no account or key created, no money-moving or signing tool called, no `.env` or key file read, no third-party code run); two WebSearch queries; and a stdlib Python script run with `python3 -I` that recomputed the tier distribution from the DefiLlama fixture. Probes used the neutral User-Agent `research-readonly/1.0`. Scratch files: `<scratch>/platform-registry-design/` (`tiers.py`, response captures). Only this file was written in the repo.

**Repo files.** `docs/research/14-platform-of-platforms.md` (body and Verification A-D); `docs/aggregation-design.md` (sections 0-13, Appendix A); `docs/plan.md`; `docs/research/06-paybox-platform.md`; `docs/research/08-venues-polymarket-kalshi.md`; `docs/research/09-venues-onchain-clob.md`; `docs/research/10-aggregation-landscape.md` (licence lines); `docs/research/16-linking-methods-services.md` (V-K5, V-K6); `docs/research/17-empirical-constraint-study.md` (section 0); `package.json`; fixtures `docs/research/fixtures/linking/pop_platform_registry.schema.json`, `pop_platform_registry.seed.json`, `pop_defillama_prediction_registry_2026-10-18.json`, `pop_aggregator_venue_coverage_2026-10-19.json`, `native_grouping_coverage_2026-10-18.json`.

**Live reads (2026-10-19).**
- `https://api.predictionmarketdata.io/prediction-markets` (HTTP 402, $0.001 Base, Bazaar schema with exchange codes) and `/prediction-markets/taxonomy` (HTTP 402); root `/` returned HTTP 302; `llms.txt` returned 403.
- `https://api.seerium.xyz/v1/prediction/cross-venue-disagreement` (HTTP 402, empty JSON body, payment-required header decoded from the listing: $0.10).
- PayBox `discover_services` ("prediction market venue directory platform list fees"; "prediction markets exchanges registry capabilities") and `discover_plugins` ("prediction market venues registry").
- WebSearch ("prediction market platform registry API venues fees geo resolution oracle directory 2026"; an extended query for "aggregator of aggregators", "venue registry", "platform directory"): result pages included `medium.com/@samuel.tinnerholm/the-top-prediction-market-apis-in-2026-ecb02baae641` (author is pmxt's developer, vendor view), `interexy.com/how-to-integrate-prediction-market-aggregators`, `pmxt.dev`, `polyrouter.io`, `predictefy.com/en/api`, `predictionhero`-style comparison articles (affiliate or vendor content, treated as L).

**Primary sources behind the inherited claims** are listed in `docs/research/14-platform-of-platforms.md` section 15 and in its Verification part (DefiLlama `/protocols` and `/overview/*`, `github.com/ccxt/ccxt`, `github.com/kachence/prediction-almanac`, `docs.agg.market`, `docs.rivermarkets.com`, `docs.predictefy.com`, `polykal.net/data/fees.json`, `github.com/Synpath-ai/synpath`, Polymarket builder-fee docs, `docs.xo.market`); this document did not re-open them except where marked [me].
