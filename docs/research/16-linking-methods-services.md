# 16. Linking methods and services: how markets are grouped and matched, within and across venues

Task `linking-methods-services`. Researched 2026-10-19. Live samples were pulled 2026-10-18 17:59 to 18:19 UTC (call it "the snapshot"). Read-only: public unauthenticated GETs, vendor docs, GitHub files read through `gh api`. No third-party code was cloned, installed or run. Only my own stdlib Python scripts were run (kept in `docs/research/fixtures/linking/scripts/`). No PayBox tool was called, nothing was signed, no account or key was created. Branch `build/xo-paybox-plugin`.

Confidence tags: **H** = read or measured first-hand this session (source or script cited); **M** = secondary, inferred, or vendor claim; **L** = weak or stale. "NOT FOUND (searched: ...)" marks a documented absence. Anything dated before 2026-04-19 is flagged **STALE?**.

Scope notes: `docs/research/15-relationship-taxonomy-literature.md` did not exist when I worked, so section 2 defines its own vocabulary. Parallel work was visible but not relied on: `14-platform-of-platforms` (fixtures `pop_*` in `fixtures/linking/`) and a prototype under `fixtures/linking/code/`. I read the aggregation facts in 08, 09, 10, 11, 02, 06 and build on them. Web search ran out of budget during the task, so the later parts use direct page fetches, `gh` and venue APIs only.

---

## 0. Bottom line

1. **No venue publishes a general cross-venue key.** The exceptions are mirror hooks: Limitless `metadata.externalSlug` + `externalProvider: "polymarket"` + `externalRulesWatch.rulesHash` (H, 90 of 100 sampled markets carry `externalSlug`, 46 carry `externalProvider: polymarket`; 5 of 6 probed slugs resolved on Gamma), plus Predict.fun `polymarketConditionIds` / `kalshiMarketTicker` and Probable's Polymarket route (M, from doc 09). Polymarket, Kalshi, XO and Trueo expose none. Sports add shared third-party fixture ids (Kalshi milestones carry Sportradar `sr:sport_event:*` ids on 826 of 4,000 sampled milestones; Polymarket `eventMetadata.opticOddsFixtureId`), which are join keys only if the other venue uses the same provider.
2. **Native grouping is good at "these belong together" and bad at "how".** Polymarket and Kalshi encode event membership, mutual exclusion (`negRisk`, `mutually_exclusive`), series, tags and, for Kalshi, numeric strikes. None encodes relation type (threshold vs date ladder, direction, exhaustiveness) as a field. Polymarket's `groupItemThreshold` is an ordinal display index, not a threshold (H, measured). XO has only `rootEventSlug` (detail endpoint only) and prose in the rules.
3. **Exclusive is not exhaustive, so set-level arbitrage cannot be read off the flags.** Kalshi's flag means "at most one market in this event can resolve to 'yes'" (H, OpenAPI). In the snapshot 18 Kalshi `mutually_exclusive` sets and 8 Polymarket `negRisk` sets showed `sum(YES ask) < 1`, in some cases by a lot (up to 0.85 gross). Most are visibly non-exhaustive lists (next Pope 0.37, 51st state 0.15, Goldman COO 0.68) or augmented neg-risk events with unnamed "Other" outcomes (6 of the 8 Polymarket sets); for the near-1 sums (0.99 and above) the fields cannot tell me whether the list is complete, which is the point.
4. **Within-venue structural edge is essentially nil after fees in the snapshot.** 131 fully quoted Polymarket neg-risk sets and 212 Kalshi exclusive sets: sell-all-YES showed gross edge in 7 and 6 sets (max 1.1 and 2.0 cents) and 0 after fees. About 64,000 Kalshi ladder pairs, 1,692 Polymarket touch-ladder pairs, 1,228 Kalshi by-date pairs and 264 Polymarket by-date pairs gave 2 gross violations (0.4 and 0.7 cents) and none net of fees. Linking pays off for structure and reference prices, not for free money (H for the counts; top of book only; fee coefficients partly M).
5. **Third-party matching services publish little about quality.** The only independent audit I found is a Prediction@Illinois monitor of Kairos' public catalog: 13,262 pairs listed, 13,201 lined up (99.5%) on 2026-10-18; on 2026-10-07, 99.1% of 11,487 pairs aligned; 14,480 of 14,498 sports pairs settled the same way over 7 days (99.88%). Coverage outside sports is Polymarket-to-Predict.fun mirror copies only. pmxt's own docs show example "identity" pairs that are not rule-identical (section 5.2). None of the services covers XO except Predictefy (beta, XO matching unproven).
6. **Platforms themselves are aggregated too, but only as directories.** Prediction Index (314 projects, 37 chains by its home page), a frontseat.co directory (~100 platforms), pm.wiki, DefiLlama's prediction-market registry, Metaforecast (18 platform fetchers, search only), pmxt `COMPLIANCE.md` (15 venues). None links markets. Market-level cross-venue catalogs are the separate class in 5.1 (section 5.4).
7. **Measured on XO (the venue we care about).** XO has 257 ACTIVE rows under `marketScope=withClob` (245 CLOB, 9 legacy AMM, 3 Pulse); 245 were created by one account; 156 are football. This corrects doc 10's "9 ACTIVE" (that figure is the AMM-only default scope; doc 02 already notes it). All 18 XO Champions League matches (54 markets) have a Kalshi `KXUCLGAME` counterpart; token/alias matching on team names + date got 14 of 18 at similarity 1.0 and all 18 as top-1 (the other four need aliases such as Munich/München). The 53 linked outcomes with books on both sides had a median XO-vs-Kalshi mid gap of 0.1 cent, 1-cent spreads on both, and zero gross cross-venue edge in either direction. Football on XO looks market-made off external prices (inference, M), so its value to us is as a mirrored venue, not as an arbitrage source.
8. **Measured on XO non-sports (98 markets).** 32 of 98 (33%) have a title-level identical Polymarket market among the top-3 events returned by Gamma search. Plain token-Jaccard top-1 has precision 0.78 at Jaccard >= 0.5 (25/32, Wilson 95% CI 0.61 to 0.89); adding deterministic gates (numeric tokens, direction words, expiry within 1.5 days) gives 23/23 at Jaccard >= 0.5 (CI 0.86 to 1.00) but finds only 23 of the 32 true counterparts. Residual false links after gating: entity swaps (Mamdani vs a different Person-of-the-Year candidate) and different central banks. Labels are single-labeller, title and date level, not rule level (section 7.9).
9. **Rule-level reading of six title-identical pairs** found no semantic mismatch but a systematic **cutoff offset**: XO deadlines are written in UTC (23:59 UTC), Polymarket's in ET (23:59 ET, about 5 hours later), plus differing window starts and, for crypto, "price as displayed" vs "1-minute candle High". That is Oddpool's `identical` (gap <= 24 h) with a `timing` divergence axis, tradable as a hedge, not as risk-free arbitrage, unless the 5-hour tail is priced.
10. **Recommended shape: hybrid, and mostly offline.** Native keys and deterministic templates first, offline retrieval and an LLM judge as candidate generator, a human-approved, hash-pinned link registry as the only thing allowed to produce an "executable arbitrage" label, and an in-plugin verifier that re-checks hashes, status, close times and fees on every call. Cost per 1,000 markets: about $0.9 (Haiku 5.5, 5 candidates per market, single pass) to $17 (Sonnet 5.5) for LLM judging, plus $0.006 to $0.04 for embeddings (section 10). The plugin cannot host embeddings or LLM judging (10 MiB bundle, 10 s per call, fresh sandbox, no state; doc 06).

---

## 1. Method, data and limits

| Source | What I pulled | Snapshot (UTC) | Size | Limits |
| --- | --- | --- | --- | --- |
| Polymarket Gamma `GET /events/keyset?closed=false&order=volume24hr` | open events with nested markets | 2026-10-18 17:59 | 800 events, 26,818 markets | top by 24h volume, 387 events are sports; not random |
| Kalshi `GET /events?status=open&with_nested_markets=true` | open events | 2026-10-18 18:00 | 2,400 events, 22,366 markets (cursor still non-empty) | first 2,400 in default order; 1,108 of them are two series (KXMIDTERMMOV 606, KXMIDTERMVOTETURN 502), so ladder statistics are skewed to midterm "margin" ladders |
| Kalshi `GET /milestones` (public, no key) | milestone clusters since 2026-09-01 | 18:04 | 4,000 (cursor non-empty) | 3,632 sports |
| Limitless `GET /markets/active?sortBy=high_value` | top markets | 18:05 | 100 of about 501 | top-ranked only |
| XO Data API `GET /markets?statuses=ACTIVE&marketScope=withClob` + `GET /markets/slug/{slug}` for 50 | all ACTIVE rows | 18:05 | 257 rows, 50 full rows | list rows lack `rootEventSlug` and rules |
| XO Orderbook `GET /book?token_id=` | YES-token books | 18:15 | 53 outcomes | top of book only |
| Polymarket `GET /public-search` | candidates for 98 XO non-sports titles | about 18:2x | 98 queries | top 3 events each |
| Kairos `GET data.kairos.trade/matched-markets` | one sample record (cursor walk of a few pages) | 18:19 | 1 pair | full catalog not pulled |

Requests per host (my counter, cap 600 each): gamma-api.polymarket.com 122 (+about 12 via curl), external-api.kalshi.com 24, api-mainnet.xo.market 63, orderbooks.xo.market 58, api.limitless.exchange 4, data.kairos.trade 8. Throttle 300 ms per host, backoff on 429/5xx.

My labels (sections 4 and 7.9) are one analyst's title-and-date judgement, not rule-level and not double-annotated. Fee coefficients: Polymarket from per-market `feeSchedule`, XO `effectiveFeeConfig.takerFeeBps = 400` (H; doc 02 records a conflict with `/fee-rate`), Kalshi 0.07 coefficient is M (doc 08). Artifacts: `fixtures/linking/*_2026-10-18.json` and `fixtures/linking/scripts/`.

---

## 2. Relation vocabulary used here

Doc 15 was absent, so this is my own list. Each row says what a machine needs to exploit it.

| Code | Relation | Constraint on prices (YES) | What must be known |
| --- | --- | --- | --- |
| R1 identity | A and B resolve identically in every state | P(A) = P(B) | rule equivalence: source, cutoff, void policy, scope (Oddpool `basis_class`, `divergence_axes`) |
| R2 complement | A is the negation of B | P(A) + P(B) = 1 | outcome mapping (which outcome of B is A's YES) |
| R3 exclusive set | at most one of A1..An | sum P <= 1 | membership of the set |
| R4 partition | exactly one of A1..An | sum P = 1 | membership and exhaustiveness (including "Other" and void) |
| R5 threshold ladder | A(k) = "X above k" | P decreasing in k | numeric strike, comparison operator, same date and source |
| R6 date ladder | A(d) = "event by d" (cumulative) or "still true through d" (survival) | increasing (cumulative) or decreasing (survival) in d | direction of the ladder, inclusivity |
| R7 implication | A implies B (subset or superset) | P(A) <= P(B) | logical necessity, not correlation |
| R8 correlated factor | same underlying driver, no logical constraint | none (signal) | entity, topic, tag |
| R9 cross-asset | different underlyings with a model link (BTC vs ETH, Fed vs yield) | none (signal/hedge) | model |
| R10 joint / combo | multi-leg contract | joint probability | venue-native combo product |

Touch markets ("reach X by d") live on a two-axis lattice: probability is decreasing in the strike and increasing in the date, so "ETH $2,900 by Oct 31" and "ETH $3,000 by Dec 31" are incomparable (observed as a false pair in 7.9). Pairwise checks miss lattice and partition structure; they need set-level checks (7.5, 7.6).

---

## 3. Native grouping per venue

### 3.1 Polymarket (Gamma)

Fields below were measured on the 800-event, 26,818-market snapshot (H).

| Field | Level | What it says | Measured coverage | Relation types made machine-readable |
| --- | --- | --- | --- | --- |
| `markets[]` nested in event | event | markets sharing a topic page | 754 of 800 events have > 1 market | membership only |
| `negRisk`, `negRiskMarketID`, `enableNegRisk` | event + market | markets in the event are mutually exclusive; "A No share in any market can be converted into 1 Yes share in every other market" (doc 08) | 425 events (259 of 413 non-sports), 8,054 markets (30%) | R3/R4 (see below) |
| `negRiskAugmented`, `negRiskOther` | event + market | placeholder outcomes plus an explicit "Other"; docs: "Only trade on named outcomes" (doc 10) | 121 events, 120 "Other" markets | marks non-exhaustive-by-name sets |
| `groupItemTitle` | market | label within the event: candidate name, `↑ 98,000`, `September 20`, `50+ bps decrease` | 26,675 markets | text only; numeric/date/arrow must be parsed |
| `groupItemThreshold` | market | **ordinal display position** (values 0,1,2,... repeat in every event; e.g. dates `thr` 0,1,2,14,18) | 26,417 markets | none; do not read as a numeric strike |
| `sportsMarketType`, `line` | market | `moneyline`, `spreads`, `totals`, props, with a numeric line | 18,929 and 14,847 markets | R5 for sports spreads and totals |
| `series[]` / `seriesSlug`, `recurrence` | event | recurring theme ("fomc", "bitcoin-hit-price-weekly") | 565 events (221 of 413 non-sports) | R8 grouping of event instances |
| `parentEventId` and slug suffix `-more-markets`, `-player-props` | event | companion events of one game | 163 events | membership |
| `tags[]` (id, slug, label) | event | free-form topic tags, mean 5.3 per event, 600 distinct slugs | all events | R8 |
| `GET /tags/{slug}/related-tags` | tag graph | ranked related tags | sparse: `politics` 20 edges, `crypto` 10, but `bitcoin`, `nba`, `fed` return 0 (5 probes) | R8, weak |
| `gameId`, `teams[]`, `sport`, `period`, `eventWeek`, `eventMetadata.opticOddsFixtureId` | event | sports fixture identity | 316 events with `gameId` | cross-venue join only via a shared provider id |
| `comboStatus`, Combos RFQ | market | market can be a leg of a multi-leg Combo; "Combos combine two or more market outcomes into one YES and NO position pair" | 18,945 markets `enabled` | R10 (venue-native) |
| `resolutionSource`, `description`, `umaResolutionStatus`, `resolvedBy` | market | rules and oracle | description present on all; `resolutionSource` non-empty on 20,105 | input to rule comparison |

Observations: the 114 non-sports multi-market events that are not neg-risk split into 58 date-like labels, 19 arrow thresholds, 21 other numeric and 16 name-like (H, my regex). Date ladders such as "US x Iran ceasefire continues through September 20?" (survival, decreasing in date) and "... announced by November 30?" (cumulative, increasing) look identical in the fields; direction is only in the question text. A neg-risk event guarantees exclusivity but, with `negRiskAugmented`, not named exhaustiveness (94 of 259 non-sports neg-risk events are augmented).

### 3.2 Kalshi

Measured on 2,400 events, 22,366 markets (H). Field definitions from the OpenAPI document (3.34.0).

| Field | Level | What it says | Measured coverage | Relation types |
| --- | --- | --- | --- | --- |
| `series_ticker` -> `event_ticker` -> market `ticker` | identity hierarchy | series is a recurring product (940 distinct in sample) | all | R8 grouping |
| `mutually_exclusive`, `collateral_return_type` (`MECNET`, `DIRECNET`, empty) | event | OpenAPI: "True when `collateral_return_type` is `MECNET`: at most one market in this event can resolve to 'yes'" | 411 MECNET events, 1,364 DIRECNET, 625 none | R3; **not** R4 |
| `strike_type` (`greater`, `greater_or_equal`, `less`, `less_or_equal`, `between`, `custom`, `structured`), `floor_strike`, `cap_strike` | market | numeric threshold and operator | strike_type set on 20,768 of 22,366; floor_strike 13,333; cap_strike 352 | R5, with operator |
| `custom_strike` (dict: `Holder`, `Policy`, `Index`, `political_party`, ...) | market | the non-numeric discriminator | 13,169 markets | R6 when `floor_strike` is equal across rungs and `custom_strike` carries the date (e.g. `{"Policy": "27Jan01"}`) |
| `early_close_condition` ("close and expire early if the event occurs"), `can_close_early`, `occurrence_datetime`, `expected_expiration_time`, `latest_expiration_time` | market | by-date semantics | early_close_condition 20,673 | R6 direction (cumulative) is inferable from this text |
| `strike_date`, `strike_period` | event | date or period the event covers | 89 and 12 events | R6, rare |
| `settlement_sources[]` (name, url) | event | named authorities | 2,400 of 2,400 events | R1 source comparison |
| `rules_primary`, `rules_secondary` | market | full rules | 22,366 and 20,905 | R1 rule comparison |
| `product_metadata` (`competition`, `competition_scope`) | event | e.g. House / Voter Turnout | 1,552 events | R8 |
| `GET /milestones` (`primary_event_tickers`, `related_event_tickers`, `source_ids`, `details`) | cluster | real-world anchor linking events across series, e.g. "Strait of Hormuz" -> `KXHORMUZNORM`, `KXHORMUZWEEKLY`, `KXHORMUZMAX`, `KXMAXSHIPSHORMUZ` | public; 781 of 4,000 sampled have > 1 related event, 778 span multiple series; 826 carry `sr:sport_event` ids | R8 across series, sports fixtures |
| `GET /structured_targets` | entity registry | players, actors with UUID ids and `source_ids` | public (200 without key) | entity linking |
| `/events/multivariate`, `mve_collection_ticker`, `mve_selected_legs`, `/multivariate_event_collections` | combo | multi-leg combos, excluded from `/events` | 0 in `/events` sample | R10 |

No cross-venue id. No free-text search endpoint (doc 08), so a matcher must crawl `/series`, `/events`, `/markets`.

### 3.3 XO

| Field / surface | What it says | Evidence | Relation types |
| --- | --- | --- | --- |
| Docs: Series > Event > Market hierarchy | "The market is the unit that settles. Two market lines under the same event are separate conditions" (docs.xo.market `/product/concepts/market-catalog`) | H, xo-docs MCP | conceptual only |
| `rootEventSlug` | shared by sibling markets (3 per football match: "X to win", "Draw", "Y to win"; per candidate for "next James Bond") | present on the by-slug detail only; 46 of 50 fetched full rows (the 4 Pulse rows lack it); absent from list rows | membership; a per-group request is needed |
| `categoryPath[]` (e.g. SPORTS / Football / Champions League), `type` (0 AMM, 1 Pulse, 2 CLOB, 3 CLOB Pulse; undocumented 4 Conviction per doc 02) | catalogue | list rows | R8 |
| `tags[]` | documented in detail objects | `null` on all 50 fetched rows | none in practice |
| `neg_risk` | "Whether a token is part of a neg-risk market. Always `false` on XO." | H, XO OpenAPI | none; exclusivity only in rules prose ("These outcomes are mutually exclusive - only one of them can resolve to Yes") |
| `resolutionSources[]`, `resolutionType` (all MANUAL in sample), `rules.description`, `rules.outcomeRules[]` | rules | H | R1 rule comparison; `outcomeRules` give per-outcome conditions |
| `eventSlug` in liquidity-rewards pools, `group` / `group_id` in rewards config | possible event/group id | doc 02 table (M, not exercised) | membership |
| Events/series endpoint | none | NOT FOUND (searched: docs `rg "/events|/series|rootEventSlug"`; doc 02 agrees) | n/a |

Creator-side structure is strong because XO's catalogue is dominated by templated markets: 245 of 257 ACTIVE rows come from one creator account, with titles like "X to win vs Y", "Draw: X vs Y", "Bank Rate is cut by 25 bps in November 2026", "Will Solana Hit $130 by October 31, 2026" (H, measured). That regularity is what makes deterministic parsing viable for XO.

### 3.4 Limitless

From 100 sampled active markets (H): `marketType` group 11 / single 89 (groups nest `markets[]` sub-markets in `submarketOrder`); `metadata.type: "ladder"` on 3; `metadata.externalSlug` on 90, `externalProvider: "polymarket"` on 46, `isPolyArbitrage` on 42, `polymarketSeriesId` / `polymarketTagId` / `polymarketHitSymbol` on crypto ladders, `externalRulesWatch.rulesHash` on 77; `eventId` on 50; `seriesSlug`, `categories`, `tags`; `stableSlug` for recurring markets. Limitless mirrors Polymarket markets and **publishes a hash of the source rules to detect drift**, which is the one native revalidation hook I found. Probe of 6 `externalSlug` values: 5 resolved to Gamma events with identical or near-identical titles; 1 returned 404 (a CS2 map slug, probably expired). Mirrors can differ in structure: the Polymarket "What price will Ethereum hit" event had 20 markets vs 14 on Limitless.

### 3.5 Trueo

On Base, a market is three immutable strings (`_marketQuestion`, `_marketSource`, `_additionalInfo`) plus `_endOfTrading` (docs `markets.md`, H). No series, event, group, category or API in the docs repo or contracts (doc 11 agrees; discovery is `TruthMarketManager.getActiveMarketAddress(i)`). Grouping would be inferred from the question text. Docs and contracts show Base as the only deployment (doc 11 sec. 4); the Ethereum migration remains an announcement.

### 3.6 Other venues (from doc 09, M)

Predict.fun carries `polymarketConditionIds` and `kalshiMarketTicker`; Probable exposes `/markets/polymarket/{id}`; Opinion and Myriad give no cross-venue ids. Kairos reports 8,755 Polymarket-to-Predict.fun pairs of 11,487 (2026-10-07), mostly mirror copies.

### 3.7 Matrix: what is machine-readable

Y = explicit field, P = convention or inference from fields, T = prose only, N = nothing.

| Relation | Polymarket | Kalshi | XO | Limitless | Trueo |
| --- | --- | --- | --- | --- | --- |
| R1 identity across venues | N (conditionId is local) | N | N | **Y** (`externalSlug`, `externalProvider`, `rulesHash`) for Polymarket mirrors | N |
| R3 exclusive set | **Y** (`negRisk`) | **Y** (`mutually_exclusive`) | T (rules prose), P (`rootEventSlug`) | P (group markets) | N |
| R4 partition (exhaustive) | P (neg-risk non-augmented; "Other" flag) | N | T | N | N |
| R5 threshold ladder | P (sports `line`; arrows in `groupItemTitle`) | **Y** (`strike_type` + `floor_strike`) | T (title) | P (`type: ladder`) | N |
| R6 date ladder | P (`groupItemTitle` date + `endDate`; direction in text) | P (equal `floor_strike` + `custom_strike` date + `early_close_condition`) | T | N | N |
| R7 implication | N | N | N | N | N |
| R8 correlated factor | P (tags, series, sparse related-tags graph) | **Y** (milestones, series, `product_metadata`) | P (`categoryPath`) | P (categories, tags) | N |
| R10 combo | **Y** (Combos RFQ, `comboStatus`) | **Y** (multivariate collections) | N | N | N |

R7 (implication) is machine-readable nowhere. It always needs parsing or a judge, and it is where the LLM is least reliable (7.4).

---

## 4. What native structure buys: within-venue consistency scan

Script `scripts/set_scan2.py`; result `within_venue_consistency_scan_2026-10-18.json`. Top of book from listing endpoints; size ignored; fees per section 1.

| Check | Population | Gross violations | Net of fee > 0 | Notes |
| --- | --- | --- | --- | --- |
| Polymarket neg-risk, sell all YES (sum bid > 1) | 131 fully quoted sets (of 421) | 7, max 1.1 cents | 0 | |
| Polymarket neg-risk, buy all YES (sum ask < 1) | 131 | 8, max 37 cents | 5 | 6 of 8 are augmented (unnamed outcomes); the other two sum to 0.988 and 0.994 (gross about 1.2 and 0.6 cents). Not exhaustive by name, so not proven arbitrage |
| Kalshi `mutually_exclusive`, sell all YES | 212 fully quoted (of 410) | 6, max 2.0 cents | 0 | |
| Kalshi `mutually_exclusive`, buy all YES | 212 | 18, max 85 cents | 11 | many are visibly non-exhaustive lists (next Pope sum ask 0.37, 51st state 0.15, Goldman COO 0.68); the 0.99+ sums (e.g. a two-candidate Louisiana governor set at 0.998) cannot be classified from the fields. The exclusive flag does not imply a partition |
| Kalshi strict threshold ladders (>= 3 distinct strikes, same close time) | 1,337 ladders, 63,832 pairs | 2 pairs (0.7 and 0.4 cents, both wide-book midterm margin ladders) | 0 | |
| Kalshi "Before <date>" cumulative ladders | 100 ladders, 1,228 pairs | 0 | 0 | |
| Polymarket arrow touch ladders | 36 ladders, 1,692 pairs | 0 | 0 | |
| Polymarket "by/before" date ladders | 26 ladders, 264 pairs | 0 | 0 | |

A first version of the Kalshi ladder scan produced two false flags on "When will Bitcoin cross $130k?" and the S&P 500 "when" series because it sorted by `floor_strike` while those rungs share one strike and differ only in `custom_strike` date. That is a concrete example of why ladder type must be inferred (equal strike + date discriminator = date ladder) before constraints are applied.

Cross-venue set example (single snapshot): the October FOMC decision is a 5-way partition (50+ cut, 25 cut, no change, 25 hike, 50+ hike) on Polymarket (one neg-risk event; bids sum 0.997, asks 1.020) and on XO (five separate binary markets; bids 1.002, asks 1.045). Cross-venue per-outcome gaps were inside the spreads (for the 25 bps hike: PM 0.13/0.14 vs XO 0.125/0.145). I found no `KXFED-26OCT*` event in the 2,400-event Kalshi sample (sample limit, not absence).

---

## 5. Third-party matching and linking services

### 5.1 Comparison

| Service | Venues covered | Link output (fields) | Method disclosed | Quality evidence | Access, price | Terms | XO |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Kairos** `data.kairos.trade/matched-markets` | Kalshi, Polymarket, Predict.fun, Hyperliquid | pair `{a, b}` each `{provider, market_id, title, ticker, expires_at, category}`, `similarity` (1.0 in my sample), `updated_at`; separate `/market-links` with `tokenIdYes/No` (third-party doc) | no | **independent audit** (5.2): 99.1% aligned; 99.88% settle the same | public catalog, cursor walk, documented 60 req/min (third-party doc); full walk of 11,487 pairs = 14 requests; enterprise API unpriced | `kairos.trade/terms` returned 404 on 2026-10-07 (third-party doc); redistribution unknown | no |
| **pmxt Router** (MIT client, hosted catalog) | 15 venues | `relation` in `{identity, complement, subset, superset, overlap, disjoint}`, `confidence` 0..1, `reasoning`, cluster id | "embedding-based similarity and LLM-verified relation classification" (docs); engine not in repo | none published; doc examples questionable (5.3) | API key; Free 25,000 credits/month, "personal use only" | personal use | no |
| **Predictefy** (beta SaaS) | 16 incl. XO | `/v1/clusters` members with `similarity` ("deliberately not a calibrated probability"), `/v1/discrepancies`, executable label gated by "resolution-equivalence gate" | no | none | Free 25k credits; Pro $149 | vendor ToS | **yes, listed**; XO order lane unproven (doc 10) |
| **Oddpool** | Kalshi, Polymarket, Opinion; enterprise adds Polymarket US | enterprise reference data: `basis_class`, `outcome_universe`, `divergence_axes`, `fungible`, `outcome_kind`, Wikidata entity ids | partly (taxonomy) | none | Premium $100/mo for arbitrage; reference data is enterprise | proprietary | no |
| **Prediction Hunt** (prediction.com) | "eight venues"; examples Kalshi, Polymarket, Novig, ProphetX | `GET /v2/matching-markets` -> events -> groups `{group_id, title, market_class, markets[{source,id}]}`, `confidence` (example `"high"`, values undefined), fuzzy title score 0.94 in the example | pipeline named: ingest, parse, resolution, match, normalize, emit; resolution-rule and close-time comparison is said to be part of matching | none | Free 10 matched-market requests/month; Dev $49; Pro $249 | links `/terms-of-service`, not read | no |
| **Adjacent** | Kalshi, Polymarket, Polymarket US, Gemini | `GET /api/v1/public/markets/{id}/related`: up to 3 markets with `similarity` 0..1, no key | embedding nearest neighbour | none | Free 15-min delayed | "Neither plan permits redistribution or use in a financial product" (doc 10) | no |
| **Synpath** (MIT lib + hosted) | 8 incl. Kalshi, Polymarket | `GET /match/market` | not read | not read | key required | not read | no (from the parallel registry; M) |
| **Matchr** | Polymarket, Kalshi, Limitless | "900+ matched pairs" claimed | no | none | app + API | not read | no (parallel registry; L-M) |
| **Replay Labs preview API** | Kalshi, Polymarket | `/api/markets/overlap`, `/semantic-search` | no | none | preview host | unknown | no (named in a repo README; L) |
| **Dome** | Polymarket, Kalshi | matching endpoints existed | n/a | n/a | **end of life 2026-04-28**; acquired by Polymarket (doc 10) | | no |
| **PolyRouter** | 7 | none seen | n/a | n/a | free beta | | no |
| **Metaforecast** | 18 platform fetchers (betfair, kalshi, manifold, metaculus, polymarket, predictit, smarkets, good judgment, ...) | search index, no cross-platform link | n/a | n/a | open source (monorepo `apps/metaforecast`, last commit 2026-10-13) | | no |
| **River Markets** | prime broker | one River id per exchange listing, no matching | n/a | n/a | | | no (parallel registry) |

### 5.2 The one independent audit (Kairos)

Prediction@Illinois' daily monitor (repo `Prediction-Illinois/kairos-cross-venue`, Apache-2.0, report dated 2026-10-18) lines up each Kairos pair with its own alignment code (shared with `oracle3-extras`, so not fully independent of the code families I read) and checks settlement. H for the text read; M for independence.

| Measure | Value |
| --- | --- |
| Pairs listed / lined up (2026-10-18) | 13,262 / 13,201 |
| Not lined up (reasons) | different dates 33, same team not confirmed 8, Kalshi inactive 5, Kalshi finalized 4, outcomes could not be lined up 4, different events 3, YES outcome unclear 2, name/code conflict 1, Polymarket not found 1 |
| Settled the same way, last 7 days | Sports 14,480 of 14,498; Crypto 375/375; Elections 2/2; Tech 9/9; Finance 1/1 (overall 14,867 of 14,885 = 99.88%) |
| 2026-10-07 catalog (third-party integration doc) | 11,487 pairs, 11,389 aligned (99.1%); 52 Polymarket-Predict.fun pairs share question text but not the game; 39 Kalshi-Polymarket pairs differ by day; only one of the two head-to-head Kalshi markets is listed |
| Live edge | after fees on Kalshi-Polymarket books 16 of 2,101 pairs showed edge, 2 left after walking books; on Predict.fun last trades 530 sports "edges" and 114 election "edges" were mostly stale prices (0 or 2 confirmed by fee quotes) |
| Median 24h price gap | sports 1.0 cent (975 pairs), crypto 2.0 (56% of hours >= 2 cents apart), economics 0.5 |

Caveats: sports dominate (11,985 of 13,262 pairs) and are fixture-matched with team codes and dates, which is the easy case; settlement agreement is weak evidence on low-probability markets because both sides resolve No; vendor terms unclear. Treat it as an upper bound for non-sports precision.

### 5.3 pmxt's own examples as a quality signal

Router docs (`docs/router/overview.mdx`, `matching.mdx`) list `"Will BTC exceed $100k by Dec?"` vs `"Bitcoin above $100,000 on Dec 31"` as **identity**. A touch ("exceed ... by") and a point-in-time close ("above ... on Dec 31") are different resolution conditions. The `subset` example, "Democrats win presidency" is narrower than "Democratic nominee wins popular vote", is not an implication either. These are my readings of two documentation examples (M), but they show that `identity` there means "same topic and threshold", not "fungible". Predictefy is explicit that its cluster `similarity` is raw embedding similarity. Net: no listed service publishes precision at a confidence threshold.

### 5.4 Aggregators of the platforms themselves (the user's second question)

| Layer | Examples | What it holds | Market-level links? |
| --- | --- | --- | --- |
| Directories / registries of platforms | Prediction Index (home page: "314 projects tracked", 37 chains, no API mentioned), Prediction Markets Directory (frontseat.co, ~100 platforms per the community list), pm.wiki (350+ profiles per the list; redirects to an X account), `Awesome-Prediction-Market-Tools` (778 stars, pushed 2026-10-07) | names, chains, status, aggregate volume | no |
| Protocol analytics | DefiLlama prediction-market protocols and DEX-volume dimension (snapshots in `fixtures/defillama/`, doc 09) | TVL, volume per protocol | no |
| Forecast-platform search | Metaforecast (18 fetchers, search only) | questions and probabilities from many platforms, no linking | no |
| Library layer | pmxt (15 venues), Predictefy (16), ccxt prediction module | unified schema | pmxt Router and Predictefy: yes (hosted) |
| Hosted cross-venue catalogs | Kairos, Oddpool, Prediction Hunt, Synpath, Matchr, Adjacent | matched pairs | yes (5.1) |
| Trading front ends | Kairos terminal, TradeFox, Converge, Matchr | merged books | via the catalogs above |

So the answer is yes for platform-level aggregation and partial for market-level: nobody links XO or Trueo markets, and only Predictefy lists XO as a venue.

---

## 6. Open-source code and papers (read through `gh api`/fetch, never run)

### 6.1 Code (eight repos opened; the five most informative first)

| Repo (license, stars, last push) | Approach | Thresholds and parameters | Prompt / output | Evaluation | Flaws I found |
| --- | --- | --- | --- | --- | --- |
| **oracle3 / coinjure matching** (`YichengYang-Ethan/oracle3-prediction-market-agent`, Apache-2.0 with MIT portions, 473, 2026-10-12) | 5 deterministic stages, no LLM: category bucket, date proximity, regex templates, text similarity, resolution-source check | weights 0.10 category, 0.20 date, 0.30 template, 0.30 text, 0.10 resolution; `MIN_TEXT_SIMILARITY` 0.45; date score 1.0 within 7 days, linear to 0 at 30 days; hard rejects on same-template-different-field; confidence HIGH if template passes else by number of passing stages (>= 3 HIGH, 2 MEDIUM) | none | unit tests only; separate `arbitrage.py` encodes 5 relations (implication, exclusivity, complement, same_event, event_sum) with per-leg fees and lists its own assumption "the relation is specified correctly, including matching resolution rules" | crypto template compares coin + price but not operator or date, so "touch" vs "close above" pass as HIGH; resolution check only compares source strings or a small allow-list; date proximity accepts a 30-day gap |
| **truthlayer / EdgeTerminal** (`rohanthomas1202/truthlayer`, no license, 66, 2026-04-20) | category + month prefilter, MiniLM-L6-v2 + FAISS, LLM verification, 17-pattern framing taxonomy | cosine >= 0.65 candidate; auto-match tier above 0.9 **without an LLM**; LLM tier below; code constant `LLM_VERIFY_THRESHOLD = 0.3` while its docstring says 0.6 | Claude Sonnet 4, max 300 tokens; JSON `{is_match, confidence, canonical_title, category, resolution_difference}`; 4-point check: same source, same time, same interpretation, no conditionality; framing patterns reject DIFFERENT_RESOLUTION_SOURCE, CONDITIONAL_VS_UNCONDITIONAL, SUBSET_THRESHOLD, RANGE_BRACKET_OVERLAP, GRADUATED_LADDER | 23 curated seed pairs (several disabled); no precision/recall | embedding-only auto-match above 0.9 would admit "cuts 25bp" vs "cuts"; internal threshold inconsistency |
| **polyclaw** (`chainstacklabs/polyclaw`, Apache-2.0, 359, 2026-04-28) | LLM "contrapositive" hedge discovery for implications | coverage tiers T1 >= 0.95, T2 0.90-0.95, T3 0.85-0.90, minimum 0.85; `NECESSARY_PROBABILITY = 0.98` for every claimed implication | temperature 0.1; must output a `counterexample_attempt`; "QUALITY OVER QUANTITY - empty lists are fine, false positives are NOT"; default model a free 9B model via OpenRouter | none | the 0.98 is a constant, not a calibration; model choice dominates quality (README warns some models find spurious correlations) |
| **equinox** (`sandesPathak/equinox`, no license shown, 2, 2026-03-15) | cross-search (query the other venue's search with the cleaned title), Jaccard rank, fuzzy + entity + `text-embedding-3-small`, optional `gpt-4o-mini` pair check | composite 0.40 fuzzy + 0.60 embedding; MATCH >= 0.45, PROBABLE >= 0.35; `MAX_DATE_DELTA_DAYS` 365; LLM needs confidence >= 0.80 **and** one corroborating structural signal | single batched call of up to 40 pairs; a NO MATCH / MATCH rule list (different subject, different action, different event vs same subject with slightly different timeframes); tells the model to ignore close dates | `testdata/golden_pairs.json`: 33 synthetic title pairs (15 match, 13 no_match, 5 probable) + `eval_test.go` | gold labels are title-only and treat "by March" ~ "before May" and "in June" ~ "by June" as matches, i.e. topical not rule-level; but its README records the LLM matching Chelsea and Arsenal EPL winner at 0.90 confidence, which is the reason for the corroboration rule |
| **semantic-verification-engine** (`sanketagarwal/...`, MIT, 1, 2026-01-28) | embedding gate then GPT-4o rule comparison | `text-embedding-3-small`, LLM only if similarity >= 0.65; cost claim ~$0.00004 (embedding) vs ~$0.02 (GPT-4o) per pair (README, M) | 6 misalignment types (RESOLUTION_DATE, RESOLUTION_SOURCE, SCOPE, THRESHOLD, DEFINITION, EDGE_CASE), self-reported `matchConfidence`, recommendation SAFE_TO_TRADE / PROCEED_WITH_CAUTION / AVOID / MANUAL_REVIEW | none (no tests dir) | confidence is verbalised, not calibrated; depends on a preview matching API |
| find-similar-events (`harrodyuan/...`, MIT, 2) | MiniLM-L6-v2 cosine + year-overlap guard | cosine > 0.7 | none | none; README reports scale: Kalshi 6,755 open events / 56,114 markets, Polymarket 38,260 open markets (2026-06-03, **STALE?**) | title-only |
| nanare-sudo/kalshi-polymarket-spreads (MIT, 0; README promotes an Apify actor) | blocking (category + +/-1 day) -> IDF-weighted token overlap -> rule veto (strike, date, entity) | universe 800 markets per venue -> 312 candidate pairs -> 17 verified (median confidence 0.83); 47% of verified pairs had negative executable spread at $100 | optional BYO-key LLM check | 10 sample verified pairs published | assumes Polymarket fees are 0 (**STALE?** for most categories) |
| Prediction-Illinois/kairos-cross-venue (Apache-2.0) | audit harness, not a matcher | see 5.2 | | settlement-agreement check | |

Common pattern: all use blocking by category and date, then a similarity stage, then a veto or a judge. None publishes precision at a threshold on real data. Verbalised LLM confidence is used as if calibrated in three of them. Docs 10's warning about a spam cluster of near-duplicate arbitrage-bot repos applies; I did not open those.

### 6.2 Papers

| Paper | Used for | Numbers (H unless noted) |
| --- | --- | --- |
| Gebele and Matthes, arXiv 2601.01706 (Jan 2026) | pipeline: structural filter, `text-embedding-3-large` (3072-d) top-20, two LLM passes (plausibility, then structured YES-region comparison) | structural filtering preserves 100% of validated true relations; k=20 captures 99.9% of verified equivalent and subset relations; LLM verification brings false positives "below 2%"; about 200M tokens for 100k events (2.0M per 1,000); human validation by **one annotator** on 1,000 stratified candidates ("effectively perfect", no kappa) and 1,000 verification instances (kappa 0.94); the LLM is not named in the part I could read; "dataset will be made publicly available upon publication" (not yet) |
| Saguillo et al., arXiv 2508.03474 (Aug 2025; **STALE?**, Polymarket 2024-25 data) | LLM-generated outcome vectors for dependent-market detection, then a formal subset check, then manual review | 46,360 pairs run, 1,576 labelled dependent, 374 passed the checker, 13 confirmed by hand (doc 10) |
| Paleka et al., arXiv 2412.18544 (Dec 2024, **STALE?**) | consistency checks across logically related forecasting questions with an arbitrage metric | page summary only: "an arbitrageur can trade against the forecaster's predictions"; the formula and check list were not on the abstract page (M) |

Takeaway: the only published end-to-end LLM-with-embedding pipeline reports a sub-2% false-positive rate but no recall or precision for the final matches and no released labels; the only published dependency-detection paper shows an LLM-only proposal stage is a candidate generator (3.5% of formally consistent pairs confirmed).

---

## 7. Techniques

### 7.1 Structured parsing of titles and rules

What the scanned code and my own gates extract: entity (proper nouns, tickers, aliases), numeric threshold with unit and suffix (k, m, %), comparison operator (above, reach, hit, between), date and cutoff with timezone, period (month, quarter), direction words (cut/hike, win/advance), named resolution source, outcome mapping (YES = which team or label), and negations. Venue fields do part of this for free (Kalshi `strike_type`, `floor_strike`, `settlement_sources`; Polymarket `line`, `sportsMarketType`; XO `resolutionSources`, `outcomeRules`).

Measured gate effect (7.9): requiring equal numeric tokens, non-conflicting cut/hike direction and expiries within 1.5 days lifted top-1 precision at Jaccard >= 0.5 from 0.78 to 1.00, at the cost of recall (it dropped 7 of the 32 true counterparts, e.g. a market whose XO expiry is 6 months after Polymarket's deadline although the question is identical). Residual failure classes after gating: entity swap, different institution, and "first to leave" vs "leaves by date".

### 7.2 Blocking

Category + date window + entity overlap before any scoring (all repos in 6.1). Equinox's cross-search (use the other venue's search API as the blocker) is the cheapest for a stateless caller: one `public-search` request per source market, 57 to 105 KB, 0.3 to 0.5 s each (H, measured). Kalshi has no search endpoint, so Kalshi candidates need a local index of `/events` (24 requests for 2,400 events in my pull; a full crawl is more). Nanare's funnel: about 640k possible pairs to 312 after blocking.

### 7.3 Embeddings

| Model | Where | Threshold or use |
| --- | --- | --- |
| `all-MiniLM-L6-v2` (local, ~90 MB) | truthlayer, find-similar-events | cosine >= 0.65 (candidate) / > 0.7; year-overlap guard |
| `text-embedding-3-small` | equinox, semantic-verification-engine | >= 0.65 gate, composite weight 0.6 |
| `text-embedding-3-large` | Gebele and Matthes | top-20 neighbours, 99.9% recall of verified relations |

Prices (H, developers.openai.com/api/docs/pricing fetched 2026-10-19): 3-small $0.02 per 1M tokens, 3-large $0.13; no embedding batch price listed. Embeddings separate topics but not conditions: Equinox's README says "Fed rate cut March 2026" and "June 2026" embed almost identically; the semantic-verification-engine example scores "Will the Fed cut rates?" vs "Fed interest rate cut in 2026?" at 69.7%. Use them for recall (top-k), never as the precision gate.

### 7.4 LLM-judged relations, confidence and abstention

Observed good practice: structured output enumerating relation, basis class and divergence axes with quoted evidence (pmxt/Oddpool taxonomy; Gebele YES-region comparison; truthlayer's `resolution_difference` field); a counterexample requirement (polyclaw); an abstain/escalate state (MANUAL_REVIEW); corroboration from a structural signal (equinox). Observed bad practice: constants standing in for calibration (0.98), self-reported confidence as a score, title-only prompts, instructions to ignore close dates.

Recommended judge contract (my design, M): output `{relation, basis_class, divergence_axes[], outcome_map, cutoff_delta_hours, void_policy_a, void_policy_b, source_a, source_b, quoted_rule_fragments[], verdict: link | no_link | abstain}`; three independent samples (or two models), require unanimity for `link`; any disagreement or any `divergence_axes` other than a configured allow-list becomes `abstain`; calibrate by binning the vote pattern against the gold set (section 8) and report precision with a Wilson lower bound, not the model's number. Treat market text as untrusted data inside delimiters, with no tools attached (XO and Polymarket titles are creator-written).

### 7.5 Pairwise versus set-level

Pairwise is enough for R1/R2. R3 to R6 need set-level checks: confirm a native group is a partition (cardinality, "Other", void), order a ladder (strike and date axes), and map **sets across venues** (XO's five FOMC markets to Polymarket's five-market event; UCL triples to Kalshi's three-outcome event). One judge call per set (n labels) is cheaper than n(n-1)/2 pair calls and removes the "first to leave" class of error (7.9). Gebele and Matthes define cross-venue neg-risk partitions as requiring completeness, mutual exclusivity and unique resolution.

### 7.6 Consistency checks and the LP

Given relations, enumerate or encode the feasible truth assignments S of a cluster (for n <= 20, 2^n is fine) and ask whether the quote vector lies in the convex hull of payoff vectors of S; infeasibility is a Dutch book, and the LP dual is the hedge. For the common cases the check collapses to closed forms (sum of bids vs 1, monotone chains), which is what section 4 computed; a general simplex on a cluster of <= 30 variables is milliseconds in JavaScript, so this part can run inside the plugin. The LP is only as good as the relation labels; its input must be `verified` links, not candidates.

### 7.7 Human-in-the-loop queue

Precedents: oracle3-extras relation status starts at `discovered`, has `valid_until` (earlier of the two closes), and unvalidated relations are dropped when they leave the catalog; truthlayer ships a `missed_match` issue template and a curated seed list. Proposal: a PR or issue per candidate link showing both rule texts with extracted fields highlighted and the judge's quoted fragments; a reviewer approves once; the approval stores the rule hashes of both legs. Reviewer time per pair: NOT MEASURED.

### 7.8 Continuous re-validation

Signals that already exist: Limitless `externalRulesWatch.rulesHash`; Kalshi event `last_updated_ts`, `GET /markets?min_updated_ts` and `/milestones?min_updated_ts`, lifecycle states (`disputed`, `amended`) and `can_close_early` (doc 08); Polymarket `updatedAt`, `umaResolutionStatus`, `/v2/resolutions` (doc 08); XO `updatedAt`, `versionId`, `status`. Plan: store SHA-256 of normalized rules + close time + status per leg at approval; every plugin call re-reads both legs anyway and compares; mismatch suspends the link (no LLM needed). Re-judge only suspended or changed links.

### 7.9 Measured experiments on XO

**(a) XO to Kalshi, Champions League.** Script `xo_kalshi_ucl.py`. XO has 54 UCL rows = 18 matches x 3 (home, draw, away). Kalshi `KXUCLGAME` has 18 open events x 3 markets (team, team, `Tie`, `MECNET`). Team-name token containment with prefix tolerance: 14 of 18 matches at 1.00, 4 at 0.75 or 0.50 (München/Munich, Praha/Prague, Sabah FA/Sabah Masazir, Paris Saint Germain/PSG); **18 of 18 correct as top-1** (Wilson 95% CI 0.82 to 1.00). The rule texts agree where I compared (Napoli vs Bodo/Glimt): "90 minutes of regulation time plus any stoppage time" on XO, "after 90 minutes plus stoppage time (does not include extra time or penalties)" on Kalshi; the sources differ (clubs and UEFA vs ESPN and Fox Sports) and the void rule differs (XO: abandoned or postponed beyond 14 days voids). Kalshi `expected_expiration_time` (2026-10-20 22:00 UTC) equals XO `expiresAt`, while Kalshi `close_time` is two days later.
Prices (53 of 54 outcomes got a book; 1 not fetched): XO and Kalshi both two-sided, median spread 1.0 cent each; **median |XO mid - Kalshi mid| = 0.001, p90 0.010, max 0.010**; gross cross-venue edge > 0 in neither direction; XO best-ask depth median 322 shares vs Kalshi 10,565. The tightness suggests XO's creator quotes off external prices (inference, M).

**(b) XO to Polymarket, non-sports.** Scripts `xo_nonsports_search.py`, `xo_poly_gate.py`, `xo_poly_eval.py`; labels in `xo_vs_polymarket_labelled_pairs_2026-10-18.json` (108 unique candidate pairs, labelled ID 32, NEAR 22, NO 54). Population: 98 non-sports, non-Pulse ACTIVE XO markets; candidates: top 3 events from Gamma `public-search` per XO title; score: token Jaccard over title (+`groupItemTitle` on the Polymarket side).

| Method | Selected | ID | NEAR | NO | Precision (ID) | 95% Wilson |
| --- | --- | --- | --- | --- | --- | --- |
| Plain Jaccard top-1, any score | 98 | 30 | 22 | 46 | 0.31 | 0.22 to 0.40 |
| Plain, Jaccard >= 0.30 | 60 | 29 | 20 | 11 | 0.48 | |
| Plain, >= 0.50 | 32 | 25 | 5 | 2 | 0.78 | 0.61 to 0.89 |
| Plain, >= 0.70 | 15 | 14 | 0 | 1 | 0.93 | 0.70 to 0.99 |
| Gated top-1 (numbers, direction, expiry <= 1.5 d), any score | 39 | 25 | 3 | 11 | 0.64 | |
| Gated, >= 0.30 | 30 | 25 | 2 | 3 | 0.83 | 0.66 to 0.93 |
| Gated, >= 0.50 | 23 | 23 | 0 | 0 | 1.00 | 0.86 to 1.00 |

ID = same entity, threshold, operator and date to within about a day at title level; NEAR = related but different (date, subset such as "win the election" vs "advance to the second round", "first leader out" vs "leaves by date", settlement price vs intraday high); NO = different or opposite. 32 of 98 XO markets (33%) have an ID counterpart in the candidates, so recall of any method is measured only against that pool. Failures worth keeping as regression tests: "ECB hikes ... 25 bps" vs "ECB announce a 25 bps decrease" (opposite direction, Jaccard 0.455); "Bank Rate is cut" (Bank of England) vs Brazil Selic (0.42); Mamdani vs Jeremy Hansen for Person of the Year (0.44, passes number and date gates); "Democratic Presidential Nominee 2028" (multi-outcome XO market) vs "nominee be a woman" (0.80); "ETH $2900 by Oct 31" vs "ETH $3000 by Dec 31" (incomparable lattice points). Token Jaccard also **misses** true pairs: "GOP nukes Senate filibuster" vs "GOP uses 'Nuclear Option' to break filibuster" scores 0.33.

**(c) Rule-level check of six title-identical pairs** (`rule_level_check_six_pairs_2026-10-18.json`): STRC $100, 10-year yield 5.5%, Tesla-SpaceX merger, Solana $140, Merz out, US-Iran deal. Same underlying condition and named source in each, but all six carry a deadline offset (XO "11:59 PM UTC", Polymarket "11:59 PM ET"), STRC and the yield differ in window start (XO "from market creation/launch" vs Polymarket "between November 11, 2025 and ..."), Solana differs in measure (XO "price as displayed on Binance", Polymarket "1 minute candle ... High"), and the Merz and Tesla texts differ in which announcements count. Under Oddpool's rules this is `basis_class: identical` with a `timing` axis; whether the tail matters depends on the event.

---

## 8. Evaluation

**Datasets found.** NOT FOUND: any public, human-labelled corpus of matched and unmatched cross-venue markets with rule-level labels (searched: GitHub repo search x10, Hugging Face dataset search x3, the papers). What exists:

| Resource | Content | Use |
| --- | --- | --- |
| Equinox `golden_pairs.json` | 33 synthetic title pairs | regression test for templates and gates only |
| truthlayer `seed_matches.json` | 23 curated Kalshi-Polymarket pairs, several disabled | smoke test |
| nanare `sample_matches.csv` | 10 verified pairs with confidence | smoke test |
| HF `Coyevans/mlb-polymarket-kalshi-matched-book-sample` (CC-BY-NC-4.0) | one MLB game, 1,204 aligned ticks, winner labelled | price co-movement example, not link labels |
| Kairos catalog + the Illinois monitor | 13k pairs, settlement agreement | weak labels and a baseline to diff against |
| Gebele and Matthes dataset | promised, unreleased | revisit |
| Jon-Becker `prediction-market-analysis` (3,882 stars) and HF trade dumps | trades, markets | backtesting; no pair labels (not opened in detail, M) |
| Mine: `xo_vs_polymarket_labelled_pairs_2026-10-18.json` | 108 pairs, single labeller, title-level | seed for the gold set |

**Cheap gold-set recipe.** (1) Sample candidate pairs the system would actually surface, stratified by score band and by relation claim, not random pairs (random pairs are almost all true negatives, as Gebele and Matthes note). (2) Double-label each pair on the Oddpool axes (relation, `basis_class`, axes, outcome map) from the two rule texts, with a second labeller on 20%. (3) Add free silver labels: venue mirror hooks (Limitless `externalSlug`, Predict.fun ids) for recall, and post-settlement disagreement for known negatives (a pair that settles differently was not fungible). Agreement is weak evidence on rarely-true markets, so use it mainly for sports-type 50/50 markets. (4) Re-label whenever rules change (hash change).

**Metrics.** What matters is precision at the surfacing threshold, because a false link is a fake arbitrage. Report precision with a Wilson lower bound per score band and per relation class, plus recall against the pooled set, plus a cost-weighted miss: expected loss = false-link rate x notional x residual risk. Sample size for a precision claim: about 203 labelled links for 0.95 +/- 0.03, 189 for 0.98 +/- 0.02, 381 for 0.99 +/- 0.01 (z = 1.96; my arithmetic). My current best number (gated, n = 23) only supports a lower bound of 0.86.

---

## 9. Approach comparison

| Approach | Precision | Recall | Cost per 1,000 markets | Latency | Fit for the plugin |
| --- | --- | --- | --- | --- | --- |
| Native keys (Limitless `externalSlug`, Predict.fun ids, shared fixture ids) | high for topic identity (5 of 6 probes resolved); rules can still differ; `rulesHash` allows drift check | only mirrored markets (Limitless 46 of 100 sampled) | $0 | 0 | yes (field read) |
| Deterministic templates on structured sources (sports fixtures, XO templated titles) | 18/18 XO-Kalshi UCL; Kairos-style code reports 99.1% aligned (M) | high where templates exist, zero elsewhere | $0 | milliseconds | yes |
| Token/IDF similarity + structured gates | 1.00 (23/23, CI 0.86 to 1.00) at Jaccard >= 0.5 on XO non-sports | 23 of 32 pooled true links (72%) | $0 | milliseconds; +0.3 to 0.5 s per Gamma search | yes (needs search call per market) |
| Plain token similarity, no gates | 0.78 at >= 0.5 (CI 0.61 to 0.89), 0.31 at top-1 any score | 30 of 32 | $0 | same | yes, but unsafe as an arbitrage gate |
| Embeddings only (cosine threshold) | unpublished; known to confuse dates and thresholds | top-20 recall 99.9% (Gebele) | $0.006 (3-small) to $0.04 (3-large), or local CPU | offline | no (bundle and time) |
| Embeddings + LLM judge, two pass | "below 2%" false-positive rate (Gebele; single annotator; not final precision) | high | about $0.9 (Haiku 5.5, k=5) to $17 (Sonnet 5.5, k=5); $3.4 to $68 at k=20 | seconds per pair, batchable | offline only |
| LLM only on all pairs | poor (Saguillo: 13 of 374 formally consistent pairs; Equinox 0.90-confidence false positive) | n/a | O(N^2) | | no |
| Third-party catalogs (Kairos, pmxt, Prediction Hunt, Oddpool) | Kairos 99.1% to 99.88% on sports; others unpublished | none cover XO | $0 to $249/month | 0.1 to 1 s | only as a cross-check; terms |
| Human-approved registry (hash-pinned) | highest by construction | low, grows with review time | reviewer time (NOT MEASURED) | 0 | yes (bundled or fetched) |
| **Hybrid (recommended)** | gate-level precision on `verified`; candidates labelled as such | bounded by offline pipeline | $1 to $20 + review | +0.1 to 0.3 s to fetch the dataset (expected, not measured) | verifier in plugin |

---

## 10. Deployment: what runs where

### 10.1 Plugin constraints (doc 06, H)

Single-file ES module `dist/plugin.mjs` <= 10 MiB, Node 24, byte-reproducible; 10 s per operation including startup (reference plugins budget 8 s with 3 s per fetch); fresh sandbox per call, no persistent state, no per-user storage or identity; outbound hosts exact-match, up to 16, set by the owner; env vars owner-level; stdout <= 256 KiB, args <= 64 KiB; HTTP only (WebSocket not confirmed). Hosts already needed: XO orderbook and data API, Polymarket Gamma and CLOB, Kalshi, Limitless, plus optionally a links-dataset host.

### 10.2 Split

| Stage | In plugin | Offline indexer / hosted |
| --- | --- | --- |
| Regex/template parsing, operator and unit normalization | yes (KBs) | yes |
| Native-key reads, ladder and set constraint checks, closed-form no-arbitrage tests, small LP (<= 30 variables) | yes | |
| SHA-256 rule-hash and status/close-time verification against a pinned link | yes (Node built-in crypto; M) | |
| Fee-adjusted depth walk, lock-cost and reserve | yes (doc 10 sec. 5-6) | |
| Dataset signature verification (Ed25519) | yes (M) | signs |
| Blocking, embeddings, LLM judge, reviewer queue, drift re-judging | no | yes |
| Per-user state | none available | only via an owner backend keyed by signed challenge (doc 06 sec. 8) |

Why not LLM or embeddings inside the plugin: 10 s and a fresh sandbox rule out model hosting; calling an LLM API from the plugin would spend the owner's key on every user call, add nondeterminism and expose the judge to attacker-written market text.

### 10.3 Architecture options

Assumptions for cost: 300 tokens per market for title + rules (measured chars/4 approximation: Polymarket title + description mean 1,111 chars = 278 tokens; Kalshi title + subtitle + rules mean 943 chars = 236 tokens; XO title + rules JSON mean 1,944 chars = 486 tokens, n = 50; **no tokenizer was run**); a pair prompt of 2 x 300 + 350 instruction tokens = 950 input and 150 output tokens (my assumption); candidates per market k. Model prices from the Claude API skill's cached table (2026-10-06): Haiku 5.5 $0.10/$0.50 per 1M in/out (prompts <= 100K), Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Fable 5.1 $10/$50; Batch API 50% off (skill text). Embedding prices as in 7.3.

| k | Pairs | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 | (batch halves each) |
| --- | --- | --- | --- | --- | --- |
| 3 | 3,000 | $0.51 | $10.20 | $20.40 | |
| 5 | 5,000 | $0.85 | $17.00 | $34.00 | |
| 20 | 20,000 | $3.40 | $68.00 | $136.00 | |

Cascade (my design): Haiku on titles only for k = 20 (about 5.6M in and 0.6M out tokens, about $0.9), then Sonnet 5.5 with full rules on the 3 survivors (about $10.2), about $11 per 1,000 markets ($5.5 batch). Gebele and Matthes report about 2.0M tokens per 1,000 events for their two passes, so my k = 5 single pass (4.75M input + 0.75M output = 5.5M tokens) is a deliberately conservative upper-middle estimate. Churn: only new or hash-changed markets are re-judged, so steady-state is a fraction of the per-1,000 figure; the daily new-market rate is NOT MEASURED.

| Option | Description | Cost per 1,000 markets plus infra | Latency added to a plugin call | Trust and ops | Verdict |
| --- | --- | --- | --- | --- | --- |
| **A. Bundled registry** | Offline session (Claude Code or a script) proposes links; human approves; `links.json` is committed and bundled into `plugin.mjs`; runtime verifies hashes | LLM $0.9 to $17 per 1,000 candidates run by the developer; infra $0 | 0 | links ship only with plugin releases (portal upload + conformance); stale links bounded by runtime rule-hash check; no new host | start here; fits the "curated registry" in doc 10 |
| **B. Signed static dataset** | Scheduled indexer (CI cron) runs blocking, embeddings, judge; writes signed `links.json` with states to a static host; plugin allowlists the host, fetches (target <= 300 KB gz), verifies signature and per-link hashes | LLM $1 to $20 per 1,000 + review time; hosting $0 on free static tiers (unverified, L); embeddings $0.006 to $0.04 or local CPU | one CDN GET (expected 0.1 to 0.3 s, NOT MEASURED) | one more allowlisted host in the trust path; sign the file; Kalshi data-use terms apply to what the dataset copies (see 12) | **recommended after A works** |
| **C. Hosted matching API** | Own service with pgvector and an on-demand judge; plugin calls `GET /links?market=...` | server (order $10 to $50/month, L) + LLM; per-user feedback possible via signed challenge | 0.2 to 2 s, and an on-demand judge cannot sit inside a 10 s call, so it must be asynchronous | highest ops and legal surface; single point of failure | only if user feedback loops or very large catalogs justify it |
| **D. Buy** | call Kairos/pmxt/Prediction Hunt at runtime | $0 to $249/month | 0.1 to 1 s | none cover XO; terms (pmxt personal-use, Adjacent no financial product, Kairos terms 404); closed matching | cross-check only |

---

## 11. Recommended hybrid

1. **Layer 0, native keys and fixtures.** Read Limitless `externalSlug` / `rulesHash`, Predict.fun ids, Kalshi milestones for sports, Polymarket `gameId` / `opticOddsFixtureId`. These produce candidates with strong provenance, not verified links.
2. **Layer 1, deterministic templates for XO's templated catalogue** (football `X to win vs Y` / `Draw: X vs Y` triples, FOMC / ECB / BoE decision sets, "Hit $K by date" crypto ladders). Match by (competition, date, canonical team) with an alias table; for numeric ladders require equal strike, operator and cutoff +/- a configured tolerance. Set-level: map the whole triple or 5-way set at once.
3. **Layer 2, generic retrieval and judge (offline).** Blocking (category, date window, entity), embeddings for top-k, then the 7.4 judge contract with abstain; run the cascade above.
4. **Layer 3, human approval.** Anything that can print an "executable arbitrage" label needs a reviewer and pinned hashes. Candidate links are shown as "related/indicative" with reasons.
5. **Layer 4, runtime verifier in the plugin.** Re-read both legs, compare rule hash, status, close time, tick, fee model; reject on any change; compute constraint checks and fee-adjusted edges; return machine-readable reasons (doc 10 gates).

Link record (proposal): `{link_id, relation(R1..R10 / pmxt enum), a:{venue,id,url,rules_sha256,close_utc,source,void_policy}, b:{...}, outcome_map[], basis:{class: identical|settlement_window|settlement_source, axes[], cutoff_delta_h}, evidence:{methods[], structured_fields, quoted_fragments[]}, scores:{vote_pattern, embedding_cos, gate_pass}, state: discovered|candidate|verified|suspended|rejected, reviewer, reviewed_at, valid_until, schema_version}`. States follow oracle3-extras (`discovered`, `valid_until`) and doc 10's section 4.1 step 5 (suspend on rule change).

Staging: (1) ship Option A with the XO UCL and templated-decision families, since 18/18 matched; (2) add the Polymarket search-based candidate generator for XO non-sports with the gates (precision 1.00 on 23, recall 72% of the findable pool); (3) build the 200-link gold set before enabling anything beyond "indicative"; (4) move to Option B when the registry outgrows the bundle or release cadence.

---

## 12. Interrelated markets and correlation: what the evidence says

- **Batching works at three granularities.** Venue event (Polymarket event, Kalshi event, XO `rootEventSlug`), venue cluster (Kalshi milestone: 778 of 4,000 sampled spanned multiple series; Polymarket series and sparse related-tags), and cross-venue set (XO FOMC five vs Polymarket five; XO football triple vs Kalshi triple). Cross-venue sets are not provided by anyone and must be built by set-level matching.
- **Linked markets move together closely where one side market-makes off the other.** XO vs Kalshi UCL: median mid gap 0.1 cent (n = 53). Kairos-pair monitor, other venue pairs: median 1.0 cent in sports (975 pairs, last 24h), 2.0 cents in crypto and tech (56% of hours >= 2 cents apart), 0.5 in economics. The monitor lists "persistent gaps" (e.g., a median 7.0 cents over 3 hours on one Tesla/SpaceX Polymarket-Predict.fun pair) without diagnosing them, and its own caveat is that such gaps are "not an arbitrage that could have been executed".
- **Executable arbitrage is rare.** Within venue: none net of fees (section 4). Cross venue: none in the 53 XO-Kalshi outcomes; the Illinois monitor reports 2 confirmed of 188 election pairs and 2 of 3,344 sports pairs after fees; nanare's scan found 47% of verified pairs with negative executable spread at $100 (M). The reliable value of links for this project is (a) a reference price and consensus for XO markets, (b) catching structural mispricing inside XO's own sets (exclusive and ladder checks need only XO books), and (c) feeding Quotient with the right Polymarket or Kalshi key (Quotient covers Polymarket, Kalshi and others, not XO; doc 12).
- **Relation types most worth supporting first:** R1 with `timing` axis (UTC vs ET cutoff), R4 partitions on XO decision markets and football triples, R5/R6 ladders on XO crypto markets (XO has Solana $130 Oct 31, $140 Dec 31 and Ethereum $2,900 Oct 31, $3,000 Dec 31 on separate markets: a lattice, so check both axes).

---

## 13. NOT FOUND, open questions, risks, suspicious content

NOT FOUND (searched: ...):
- Public labelled cross-venue equivalence corpus (GitHub x10 queries, HF x3, papers).
- Kairos terms of use (`kairos.trade/terms` was 404 per the third-party integration doc dated 2026-10-07; I did not re-fetch); matching method for Kairos, Prediction Hunt, Oddpool, Synpath, Matchr (vendor pages and docs read).
- Published precision or recall at a confidence threshold for any hosted matching service (vendor docs, READMEs).
- XO events or series endpoint (docs filesystem search, doc 02).
- Reviewer time per link; embedding throughput on our hardware; CDN latency; daily new-market rate.
- Polymarket US, Probable, Predict.fun and Opinion fields were not re-measured here (doc 09 only).

Open questions:
1. Does XO plan an events endpoint or a group id on list rows? Without it, a stateless plugin needs one detail request per market to get `rootEventSlug`, or title parsing.
2. Should UTC-vs-ET cutoff differences be priced as a basis reserve, or should such pairs be excluded from "arbitrage" and shown as "hedge with timing risk"?
3. Does Kalshi's Developer Agreement (3.1: no "caching, aggregating, or storing data" except for own trading, doc 08) restrict a published dataset of Kalshi titles, tickers and rule hashes? Store ids and hashes, not rule text, until clarified.
4. XO ToS bar scraping "for unauthorized purposes" (doc 10); the indexer's polling rate and purpose need to be defensible.

Risks: single-labeller, title-level labels (7.9) inflate precision; samples are not random; Kalshi sample is two-series heavy; Polymarket sample is volume-ranked; one snapshot; fee coefficients partly M; the 257-market XO catalogue is overwhelmingly one creator's templated output, so XO results will not generalise to user-created markets. A false link is a fake arbitrage: keep candidates labelled "indicative".

Suspicious or agent-directed content seen (treated as data, not followed): Mintlify docs pages (Polymarket, Oddpool, Adjacent, Kalshi, Prediction Hunt) start with banners telling agents to fetch `llms.txt`; the oracle3 README has a "For AI agents" section; the Prediction Hunt, Predictefy and Oddpool docs include agent-targeted usage text. I used `llms.txt` files only where the task already required reading those docs. The nanare README and several list entries carry affiliate or marketing tracking (`utm_*`, an Apify actor ad); not acted on. A large cluster of near-duplicate arbitrage-bot repos exists (doc 10); none opened.

---

## 14. Sources

Venue and vendor docs fetched 2026-10-19: docs.polymarket.com (`/llms.txt`, `/market-data/discover-markets.md`, `/trading/combos/overview.md`); docs.kalshi.com OpenAPI (`/openapi.yaml`, 3.34.0) and live `GET /trade-api/v2/{events,milestones,structured_targets}`; docs.xo.market (`/product/concepts/market-catalog`, `/data-api-reference/markets/*`, `/api-reference/market-data/get-neg-risk-flag`, `/product/trading/read-the-rules`) through the xo-docs MCP; api-mainnet.xo.market and orderbooks.xo.market; api.limitless.exchange (`/markets/active`); github.com/trueo-protocol/docs (`docs/markets.md`, `docs/deployments.md`) and `trueo-contracts`; gamma-api.polymarket.com (`/events/keyset`, `/public-search`, `/tags/slug/*/related-tags`).

Services: pmxt `docs/router/{overview,matching,event-matching,prices}.mdx` and `core/src/router/types.ts` (github.com/pmxt-dev/pmxt); docs.predictefy.com `/llms.txt`; docs.oddpool.com `/llms.txt`, `/websocket/macro-feed.md`, `/arbitrage/overview.md`; prediction.com `/api`; docs.adjacent.markets `/api/get-api-v1-public-markets-id-related.md`; kairos.trade; data.kairos.trade `/matched-markets`; `Prediction-Illinois/kairos-cross-venue` (README, `reports/latest.md`); `YichengYang-Ethan/oracle3-extras` `docs/kairos/INTEGRATION.md`; `quantified-uncertainty/squiggle` `apps/metaforecast`; predictionindex.xyz; `aarora4/Awesome-Prediction-Market-Tools`; parallel fixtures `fixtures/linking/pop_aggregator_venue_coverage_2026-10-19.json`.

Repos read via `gh api` (not run): `YichengYang-Ethan/oracle3-prediction-market-agent` (`coinjure/matching/*`, `oracle3/arbitrage.py`), `rohanthomas1202/truthlayer` (`backend/services/{matcher,embedding_matcher,framing_detector,prefilter}.py`, `data/seed_matches.json`), `chainstacklabs/polyclaw` (`scripts/hedge.py`, `lib/coverage.py`), `sandesPathak/equinox` (README, `testdata/golden_pairs.json`, `internal/matcher/llm_verify.go`), `sanketagarwal/semantic-verification-engine`, `harrodyuan/find-similar-events`, `nanare-sudo/kalshi-polymarket-spreads`; HF `Coyevans/mlb-polymarket-kalshi-matched-book-sample`.

Papers: arXiv 2601.01706 (HTML version), 2508.03474 (via doc 10), 2412.18544 (abstract page). Pricing: developers.openai.com/api/docs/pricing (embeddings); Claude API skill model table (cached 2026-10-06).

Repo docs relied on: `docs/plan.md`, `docs/research/02`, `06`, `08`, `09`, `10`, `11`, `12`.

My artifacts: `docs/research/fixtures/linking/`: `native_grouping_coverage_2026-10-18.json`, `within_venue_consistency_scan_2026-10-18.json`, `xo_vs_polymarket_labelled_pairs_2026-10-18.json`, `xo_kalshi_ucl_team_join_2026-10-18.json`, `xo_kalshi_ucl_top_of_book_2026-10-18.json`, `rule_level_check_six_pairs_2026-10-18.json`, and `scripts/` (`phttp.py`, `pull_poly.py`, `pull_kalshi.py`, `poly_stats.py`, `kalshi_stats.py`, `set_scan2.py`, `xo_kalshi_ucl.py`, `xo_kalshi_prices.py`, `xo_nonsports_search.py`, `xo_poly_gate.py`, `xo_poly_eval.py`, `build_coverage.py`). Scripts expect a `raw/` directory beside them; run with `python3 -I`.

---

## Verification (2026-10-19)

Adversarial verifier pass. Live checks ran on 2026-10-18 about 18:30 to 18:50 UTC (server clocks), 15 to 50 minutes after the researcher's snapshots, using public unauthenticated GETs only (Gamma about 30 requests, Kalshi 6, XO data API about 40, XO orderbooks about 40, Limitless 1, Kairos 8), plus `gh api` reads and vendor docs. Scratch files are in the session scratchpad, not the repo. No researcher script contained a code bug that changes a reported number; I did not edit any script. Tags: C = confirmed, K = corrected, R = refuted, U = unverifiable.

### Confirmed (independently re-derived)

- C. **Limitless mirror hooks.** Live `GET /markets/active?limit=25` (25 of 510): `metadata.externalSlug` 23, `externalProvider: "polymarket"` 21, `isPolyArbitrage` 17, `externalRulesWatch.rulesHash` 16 (shape `{rulesHash, clarificationIds}`), group markets carry `metadata.type: "ladder"` and `submarketOrder`. 8 of 8 probed `externalSlug` values resolved on Gamma `/events/slug/` (the researcher got 5 of 6; the one 404 was plausibly expired). The sample is sorted differently from the researcher's top-100, so proportions are not comparable, only field existence and meaning.
- C. **Polymarket `groupItemThreshold` is a string ordinal.** Live 100-event keyset sample: type `str`; the BTC weekly "What price will Bitcoin hit" ladder has `↑ 98,000`=`'0'`, `↑ 96,000`=`'1'`, ..., `↓ 82,000`=`'21'`, `↑ 84,000`=`'7'`/`'15'`/`'16'`; sports events reuse one value per market class (`'0'` moneyline, `'1'` spreads, `'2'` totals). Not a strike. Extra observation: that live event also has duplicate `groupItemTitle` rungs (`↑ 84,000` x3, `↑ 82,000` x4), so a ladder parser keyed on `groupItemTitle` must de-duplicate or keep only `active and not closed and acceptingOrders` (the researcher's `set_scan2.py` does apply that filter).
- C. **Kalshi flags.** `docs.kalshi.com/openapi.yaml` v3.34.0: "True when `collateral_return_type` is `MECNET`: at most one market in this event can resolve to 'yes'". Nuance the notes under-state: the field is "False for both `DIRECNET` and an empty collateral-return type", so `mutually_exclusive=false` does not mean the markets are not exclusive. `GET /milestones` and `GET /structured_targets` answered 200 with no key (100 milestones: 17 with more than one related event, 23 with `sr:` source ids; same proportions as the researcher's 781/4000 and 826/4000). No free-text search endpoint in the spec (only `/search/tags_by_categories` and `/search/filters_by_sport`).
- C. **XO grouping surface.** By-slug detail returns `rootEventSlug` and it is shared by the three siblings of a match (Napoli/Draw/Bodo-Glimt all `napoli-vs-bodoglimt-1635700`); list rows have no `rootEventSlug`, `tags` null, and `rules` is an empty object; orderbook `neg_risk=false` on 6 of 6 probed.
- C. **XO UCL to Kalshi.** Live: 54 XO UCL rows (18 `Draw:` rows), 18 Kalshi `KXUCLGAME` events, each with 3 markets and `MECNET`. My independent token-overlap join (not the researcher's script) put the right Kalshi event top-1 for all 18, and the event date embedded in the Kalshi ticker equals the XO `expiresAt` date for all 18. Prices: on 10 draw markets XO and Kalshi top of book were identical at the tick or 0.5 cent apart in one case (median mid gap 0.0000, max 0.005), and both sides crossed negative by 1 to 2 cents. The researcher's median 0.001 and "no edge" stand.
- C. **XO October FOMC five-way set.** Re-measured: sum of best bids 1.002, sum of best asks 1.045, 25 bps hike 0.125/0.145, exactly as in section 4.
- C. **Kairos record shape.** `GET data.kairos.trade/matched-markets` returns `{pairs, count, limit, offset, has_more}`; each pair `{a, b, similarity, updated_at}` with `a`/`b` = `{provider_id, provider, market_id, title, ticker, image, icon, expires_at, category}`; no relation type. See K10 for what the researcher missed.
- C. **Prediction@Illinois numbers** (13,262 listed, 13,201 lined up, sports 14,480/14,498, crypto 375/375, Apache-2.0, pushed 2026-10-18T16:17Z) match `reports/latest.md`. Note that "lined up" is an alignment check by oracle3-extras code (dates, team codes, outcome mapping) and the settlement check is weak evidence; the notes already say so.
- C. **pmxt.** MIT, 2,170 stars, last push 2026-09-30; Router docs state "embedding-based similarity and LLM-verified relation classification" and list "Will BTC exceed $100k by Dec?" vs "Bitcoin above $100,000 on Dec 31" as `identity`; `core/src/exchanges` has 15 venue directories (baozi, gemini-titan, hunch, hyperliquid, kalshi, limitless, metaculus, myriad, opinion, polymarket, polymarket_us, probable, rain, smarkets, suibets), no XO and no Trueo.
- C. **OSS constants.** oracle3 `_pipeline.py` weights 0.10/0.20/0.30/0.30/0.10, `_text.py` `MIN_TEXT_SIMILARITY = 0.45`, `_date.py` full score within 7 days; polyclaw `lib/coverage.py` `NECESSARY_PROBABILITY = 0.98`, tiers 0.95/0.90/0.85; truthlayer `tl_matcher.py` `AUTO_MATCH_THRESHOLD = 0.9`, `LLM_VERIFY_THRESHOLD = 0.3` with a docstring that says 0.6, `embedding_matcher.py` `SIMILARITY_THRESHOLD = 0.65`. Stars and dates for oracle3 (473), polyclaw (359), truthlayer (66), equinox (2), squiggle (221, MIT) as stated.
- C. **Gebele and Matthes (arXiv 2601.01706).** HTML text: "more than 99.9% of all verified equivalent and subset relations appear within the top twenty nearest neighbors"; "reduces the false-positive rate to below 2%"; "on the order of 200 million tokens" for over 100,000 events; `text-embedding-3-large`; "The dataset will be made publicly available upon publication"; LLM not named. The paper has an internal inconsistency the notes do not mention (an appendix caption says k=16 where the body says k=20) and says "one human annotator" while reporting kappa 0.94.
- C. **Cost arithmetic and prices.** The Claude API skill's model table (cached 2026-10-06) gives Haiku 5.5 $0.10/$0.50 (prompts up to 100K), Sonnet 5.5 $2/$10, Opus 5.5 $4/$20; OpenAI pricing page gives $0.02 and $0.13 per 1M embedding tokens. Recomputing section 10.3: k=3 gives $0.51/$10.20/$20.40, k=5 $0.85/$17.00/$34.00, k=20 $3.40/$68.00/$136.00, cascade about $0.86 + $10.2 = $11, embeddings $0.006 and $0.039 per 1,000 markets at 300 tokens. No figure is off by an order of magnitude given the stated assumptions; see K9 for the assumption that is optimistic.
- C. **Statistics.** Wilson intervals recomputed: 25/32 = 0.612 to 0.890; 14/15 = 0.702 to 0.988; 23/23 = 0.857 to 1.000; 18/18 = 0.824 to 1.000; 25/30 = 0.664 to 0.927; 30/98 = 0.224 to 0.403. Sample sizes 203, 189, 381 are correct. Re-running the precision table from `xo_vs_polymarket_labelled_pairs_2026-10-18.json` reproduces every row of section 7.9(b) exactly (plain top-1: 98/60/32/15 selected, 30/29/25/14 ID; gated: 39/30/23 selected, 25/25/23 ID).
- C. **Other.** Polymarket related-tags: politics 20, crypto 10, bitcoin 0, nba 0, fed 0 (identical). Metaforecast has 18 platform fetchers. Prediction Index shows "314" projects and "37" chains, no API, no XO or Trueo. Oddpool arbitrage endpoints need "Premium plan (100/mo)"; its Reference Data API is enterprise-only and covers Kalshi, Polymarket, Polymarket US. Plugin limits (10 MiB, 10 s, 256 KiB stdout, 16 hosts, fresh sandbox) are as quoted in doc 06. Licences: oracle3 Apache-2.0, polyclaw Apache-2.0, kairos-cross-venue Apache-2.0, find-similar-events MIT, nanare MIT; truthlayer, equinox and Awesome-Prediction-Market-Tools have none.

### Corrected or qualified

- K1. **XO "257 ACTIVE rows" and "95% one creator's templated output" are artefacts of the scope used.** `marketScope=withClob` returns types 0, 2 and 3 only. Live now: withClob 255 (242 type 2, 9 type 0, 4 type 3; 242 from one creator account, 153 sports), but `marketType=0,1,2,3,4` returns **421 ACTIVE** and `marketType=4` alone **166** (the user-created "Conviction" product that doc 02 describes, which `withClob` does not return). I pulled 165 of them: many creators (top creator 18 rows, 39 distinct creators among the 83 non-sports ones), 82 sports, 83 non-sports, and thin books (of 8 probed, one was two-sided, 4 had asks only, 1 bids only, 2 empty). So (a) about 39% of ACTIVE XO rows were never sampled, (b) the risk statement "XO results will not generalise to user-created markets" is true but unmeasured rather than a property of the catalogue, and (c) the 98-market non-sports experiment excludes 83 user-created non-sports markets. Replace "XO has 257 ACTIVE rows" with "257 under `withClob` (255 on 2026-10-18 18:36 UTC); 421 across types 0 to 4". The notes' own type table in 3.3 mentions type 4 but the headline and bottom line 7 do not.
- K2. **The gated precision "23/23 = 1.00" is in-sample and does not replicate on a fresh XO population.** The direction gate targets exactly the ECB hike-vs-decrease failure that the plain run exposed on the same 98 markets, and the expiry window was set on the same data, so the 1.00 is a development-set number. Out-of-sample test (verifier, 2026-10-18 about 18:40 UTC): the 83 non-sports type-4 XO markets, same Gamma `public-search` top-3 procedure, the researcher's gate code copied unchanged (`xo_poly_gate.py` logic). Gated top-1 at Jaccard >= 0.5 gave 8 pairs. My labels (single labeller, title and date level, same standard as the researcher): 5 identical (Democratic Senate control after the 2026 midterms; Bitcoin dip to $60,000 by Dec 31, 2026; Ethereum dip to $2000; Russia-Ukraine ceasefire agreement by Dec 31, 2026; Zcash hit $2000), 2 ambiguous (Gyanesh Kumar "resign" vs "be out"; "Will Earth be proven flat before 2027?" vs "Is Earth flat?"), and **1 clear false link: "Will 'The Odyssey' win the Oscar for Best Picture" matched to "Will Digger win Best Picture at the 99th Academy Awards?"** (entity swap, Jaccard 0.67, passes the number, direction and date gates). Precision 5/8 = 0.625 (Wilson 0.31 to 0.86) strict, 7/8 = 0.875 if the two ambiguous count as identical. n=8 is tiny, so this does not refute the method; it shows the 1.00 was not a transferable estimate and that entity swap, which the notes list as a residual class, is not rare. Plain top-1 at >= 0.5 gave 22 pairs of which many are wrong strike or year (for example "Solana dip to $50 by Dec 31, 2027" vs "... 2026", "Variational FDV above $500M" vs "$800M"). Treat "gated links can run unattended" in 9, 11 and the design implications as unproven; the registry should stay human-approved, as the notes recommend.
- K3. **Intra-XO duplicates exist and are not discussed.** Two same-question pairs across XO's own types and creators: "Will Zcash Hit $2000 by December 31, 2026" (type 2, creator 47724) and "Will Zcash hit $2000 by December 31, 2026?" (type 4, creator 54206); "Arsenal to win the 2026/27 Premier League" (type 2) and "Will Arsenal win the 2026/27 Premier League?" (type 4). Within-venue identity linking is therefore needed on XO as well, and a cross-venue link to one of them is not a link to the other.
- K4. **"NOT FOUND: a group id on list rows" is partly refuted.** The public, unauthenticated `GET /api/public/liquidity-rewards/earning-pools` (200 without a key) returns `market.eventId` and `market.eventSlug` for reward-enabled markets: 14 of 15 rows had them (for example `levante-ud-vs-athletic-club-564685` x3). It is a subset (15 markets), not the catalogue, but it is the first list-level group key on XO that I could exercise. Doc 02 listed it as "M, not exercised"; it is now exercised.
- K5. **Predictefy: commercial-use restriction omitted and prices incomplete.** `docs.predictefy.com/llms.txt` states plans Free (25,000 credits/month, 60 requests/min), Builder $48.88/month, Pro $149/month, Enterprise from $2,500, and "commercial use on Enterprise only". Section 5.1 lists only "Free 25k credits; Pro $149" and "vendor ToS". It also lists `xo` among its 16 served venues with "real CLOB depth" and an ARMED hosted-execution lane on 2026-09-02, and says cross-venue matching is available "on every plan", but gives no statement of which venues the clusters cover, so "XO matching unproven" stands. Option D (buy) is therefore not available to a commercial plugin below Enterprise.
- K6. **pmxt personal-use restriction applies to all plans.** `pmxt.dev/pricing`: "All plans are for personal use only" (Free 25,000 credits/month, Starter $29.99, Pro $99.99), not only the Free tier as the table in 5.1 reads.
- K7. **Licence of `semantic-verification-engine`.** The README shows an MIT badge but the repository has no LICENSE file (GitHub reports no licence); treat it as unlicensed. The same applies to the "MIT" tag in 6.1 for that row.
- K8. **Approach-comparison row for plain token similarity (section 9) mixes thresholds.** "Precision 0.78 at >= 0.5 ... recall 30 of 32" pairs a precision at Jaccard >= 0.5 with the recall of the unthresholded top-1; at >= 0.5 plain top-1 finds 25 of 32 (reproduced from the fixture). Gated >= 0.5 finds 23 of 32 as stated.
- K9. **LLM judge cost assumes 150 output tokens per pair; thinking is billed as output.** Per the Claude API skill, Opus 5.5 cannot disable thinking (default effort medium), Sonnet 5.5 needs `between_tools` to switch it off, and Haiku 5.5 runs adaptive by default; thinking tokens are output tokens. The judge contract in 7.4 also asks for quoted rule fragments. Realistic output is plausibly 2 to 5 times 150 tokens for Sonnet and Opus, which moves the Sonnet k=5 figure from $17 to roughly $25 to $50 per 1,000 markets (arithmetic, not measured). Same order of magnitude, so the architecture conclusion holds, but the $17 and $34 are lower bounds.
- K10. **Kairos details.** (a) Pagination is `limit`/`offset` with `has_more`, not a cursor walk, and page size is irregular: `limit=500` returned 226 pairs, `limit=1000` returned 441 at offset 0 and 431 at offset 441, then 1,000 at offset 12,000; "a full walk is 14 requests" (third-party doc) is therefore unverified and a complete walk of 13,262 pairs may need more than twice that, with possible duplicates or gaps. (b) `similarity` was exactly 1.0 on every record I pulled (about 2,100 records, sports and Polymarket-Predict.fun) so the public field carries no information. (c) `kairos.trade/terms`, `/terms-of-service`, `/tos`, `/legal`, `/privacy` all return 404; `kairos.trade/docs/api-overview` says "The full Data API ... require an API key" but that "The Market Data API and any endpoint marked free work without signup", does not state whether `matched-markets` is free, and says nothing about matching method, rate limits or redistribution. The NOT FOUND for Kairos terms and method stands, with better evidence.
- K11. **Services missing from the survey (section 5.1).** A different search found cross-venue aggregators the researcher did not list: PredictMarketCap (Polymarket, Kalshi, Limitless, Predict.fun, Hyperliquid; "matches the same real-world question" per outcome; arbitrage scanner; no method, no precision, no XO), PreDex (Polymarket, Kalshi, Opinion, Limitless; arbitrage alerts; no method), SimpleFunctions (`sf cross-venue`, Kalshi and Polymarket, no method), Oddpool's public market-differences page (Kalshi, Polymarket, Opinion; demo data), Struct (cross-venue matching in early access), and PredictionTalk (a reference hub that names XO among six venues, not a matcher). None publishes precision and none covers XO or Trueo, so the conclusions "no service publishes precision" and "only Predictefy covers XO" survive, but the table is not exhaustive and the platform-aggregation answer (5.4) should list PredictionTalk as the only directory that names XO.
- K12. **Prediction Hunt field placement.** On `prediction.com/api` the example `confidence: "high"` sits on `events[]`, with `groups[]` carrying `group_id`, `title`, `market_class`; the notes (5.1) place it at group level. Free tier "10 matched-market requests", Dev $49, Pro $249 confirmed. The page does not state commercial-use terms.
- K13. **Reproducibility.** The scripts read `raw/` inputs and write `counts.json` beside the fixtures, but neither is committed, so section 7.9 cannot be re-run from the repo; the committed `xo_vs_polymarket_labelled_pairs` fixture does contain the labels and flags and is enough to reproduce the precision table (done above). The ID/NEAR label sets in `xo_poly_eval.py` are hard-coded pair indices.
- K14. **Headline results of Gebele and Matthes not carried into the notes.** The abstract reports that about 6% of events are listed on more than one platform and that equivalent markets show persistent execution-aware deviations averaging 2 to 4%, which sits in tension with the notes' "within-venue edge is nil" framing (the paper is cross-venue and execution-aware; the notes' within-venue result is not contradicted, but the cross-venue deviation claim should be cited as the paper's, unreplicated here).

### Unverifiable in this pass

- U. Researcher's Gamma/Kalshi full-sample counts (800 events / 26,818 markets; 2,400 events / 22,366 markets; 131 and 212 fully quoted sets; about 64,000 ladder pairs). A fresh 100-event Polymarket sample gave 33 neg-risk events (12 fully quoted, 1 gross sell-all-YES edge of 0.7 cent, 0 net) and 95 multi-market events, directionally consistent but too small to test the counts. Not re-run in full to respect shared rate limits.
- U. Mirror-hook proportions on the researcher's exact top-100 Limitless sample (90/46/42/77); the endpoint's ordering changes.
- U. Rule-level six-pair check (7.9c); I did not re-read the six rule texts.
- U. "Kalshi 0.07 fee coefficient", XO `effectiveFeeConfig` vs `/fee-rate`, Predict.fun and Probable fields (doc 08/09 dependent).
- U. Kairos "documented 60 req/min" and the 11,487-pair/14-request walk (third-party doc; Kairos docs I could read are silent).

### NOT FOUND items re-searched

- Public rule-level labelled equivalence corpus: re-searched (GitHub, Hugging Face, arXiv, Apify and dev.to keywords such as "labeled equivalent market pairs", "matching benchmark"); still not found. A dev.to article on Kalshi/Polymarket matching and Apify actors publish heuristics and no precision or recall.
- Published precision at a threshold for any hosted service: still not found, including for the services newly listed in K11.
- XO events/series endpoint: still no such route in the Data API OpenAPI (tags are Markets, Pulse Markets, Portfolio, Liquidity Rewards); partial group id found via K4.
- Kairos terms and matching method: not found (K10c).
- Trueo in aggregators: searched; only DefiLlama TVL (about $0.8M, Base) and Alchemy dapp directory entries, no market-level aggregator, consistent with the notes; the Ethereum migration announced 2026-09-21 is still unfinished per crypto.news.

### Net assessment

Venue-field claims (Limitless hooks, Polymarket and Kalshi grouping fields, XO `rootEventSlug`, UCL join, FOMC set, Kairos record shape) re-derived from live public responses and are reliable. The structural conclusions (layered hybrid, human-approved hash-pinned registry, verifier-only plugin, no third-party catalog covers XO) are supported. The two things decisions should not lean on are the "23/23 gated precision" (in-sample; 5 to 7 of 8 on a fresh XO subset with one clear entity-swap false link) and the XO population statistics (a scope artefact that omits the 166 user-created type-4 markets). Cost estimates are within an order of magnitude but low on output tokens for thinking models. Two vendor-licence facts that bear on "Option D buy" were missing: Predictefy commercial use needs Enterprise, and pmxt is personal use on every plan.
