# 10. Aggregation, unified-API and arbitrage landscape (build vs buy vs borrow)

Task: `aggregation-landscape`. Researched 2026-10-19, read-only. Branch `build/xo-paybox-plugin`.

Confidence tags: **H** read first-hand in a primary source this session (path or URL given), **M** secondary or inferred, **L** weak, stale or vendor-claim only. "NOT FOUND (searched: ...)" marks a documented absence. Anything dated before 2026-04-19 is flagged **STALE?**.

Ground rules observed: no money-moving PayBox tool was called, no PayBox tool was called at all, no third-party code was cloned or run, no `.env`/key/wallet file was read, no key was created, only unauthenticated GETs to documented public hosts. Third-party text is treated as data. Wallet addresses, API keys and the requester IP seen in some responses are deliberately not recorded here.

---

## 0. Bottom line

1. **There is no off-the-shelf tool that covers XO.** pmxt, Oddpool, PolyRouter, Adjacent and Quotient do not list XO (H, their own docs). The only aggregator that lists `xo` as a venue is **Predictefy** (beta, created 2026-08-03, 12 npm versions, SaaS, credit-metered), and its own docs say no XO order has ever been submitted through it (M, vendor claim). Every plan that includes XO needs our own XO adapter. XO's public read APIs need no auth (verified, section 7), so the adapter is cheap to build.
2. **XO is too thin to be a serious arbitrage counterparty today.** The XO Data API reported 9 ACTIVE markets vs 1,322 CLOSED on 2026-10-19 (H, public GET), all `resolutionType: MANUAL`; sampled order books are one-sided or have 5-15 cent spreads (M, one-off sample). So the realistic product is **"edge finder"**: a read-only, fee-adjusted comparison of a matched XO market against Polymarket/Kalshi consensus (and Quotient signals), with directional trades on XO only. "Risk-free arbitrage" labelling should be reserved for the rare pair that passes every gate in section 5.
3. **Fees now eat most naive arbitrage.** Verified 2026 fee formulas (Kalshi, Polymarket, XO) are all `rate x p x (1-p)` curves charged on every taker leg. A within-venue YES+NO<1 gap of 2 cents is worth about $0.004 on 100 shares on a Polymarket politics market (section 6, example B). The popular open-source bots hard-code "Polymarket: zero fees" and are stale (last push Dec 2025).
4. **Best published matching method is a staged funnel**: structural filter, embedding retrieval (top-20), then two LLM passes with a structured YES-region comparison, validated by humans (Gebele & Matthes, arXiv 2601.01706). Even then, LLM-only dependency detection produced mostly false positives in the other key paper (374 candidates passing the formal checker, 13 confirmed by manual review; Saguillo et al. 2508.03474). Recommended for us: **LLM proposes, a structured-field gate disposes, a human approves each pair once, and the approval is pinned to a hash of both venues' rule text.**
5. **Verdict summary**

| Component | Verdict | Why |
| --- | --- | --- |
| Cross-venue matching registry (pairs, relation, basis) | **BUILD** (borrow taxonomy from Oddpool + pmxt) | Nobody covers XO; XO has ~9 live markets so a curated registry is feasible and safer than auto-match |
| Fee model, depth-walk edge calculator, gates | **BUILD** (borrow structure from oracle3, Apache-2.0) | Small pure functions; must be Decimal, per-market fee params, fail-closed on unknown fee model |
| XO read adapter | **BUILD** | Public unauthenticated GETs; no vendor does it well |
| Polymarket / Kalshi read adapters | **BUILD thin**, optionally **BUY** (pmxt Router free tier) as candidate generator | Public APIs are simple; Gamma and Kalshi series objects expose fee params directly |
| Unified client library inside the PayBox plugin | **DO NOT USE pmxt as a dependency** | Node sidecar architecture; the plugin must be a single-file ES module with allowlisted hosts (plan, unverified). Use pmxt only as an external HTTP candidate source or as a design reference |
| Cross-venue arbitrage feed (Kalshi/Polymarket/Opinion) | **BUY only if wanted** (Oddpool Premium $100/mo or Predictefy Pro $149/mo) | Not XO; useful for benchmarking our own edge calculator, not for the plugin |
| Prediction-market signals | **BUY** Quotient per call ($0.02 mispriced, $0.01 stored forecast) as an optional input | Not XO; covers Polymarket, Polymarket US, Kalshi, HL Outcomes |
| Open-source bots | **BORROW ideas only**, never run | Mostly unlicensed or copyleft, stale fee assumptions, large near-duplicate spam cluster |
| Dome | **DEAD** (end of life 2026-04-28) | |

---

## 1. Unified client libraries and aggregator APIs

### 1.1 pmxt ("ccxt for prediction markets")

- URL: https://github.com/pmxt-dev/pmxt , site https://www.pmxt.dev , docs in repo `docs/`.
- License: **MIT** (H, `LICENSE` file; PyPI says MIT; npm registry metadata field is empty).
- Maintenance (H, GitHub API + npm/PyPI 2026-10-19): created 2026-01-08; 2,170 stars; latest release `v2.54.0` published **2026-07-18**; latest commit on `main` 2026-07-18 (3 months old); other branches pushed up to 2026-09-30; npm `pmxtjs` 315 versions; PyPI `pmxt` 2.54.0. 1,450 "open issues" (includes PRs). Single-vendor project, young.
- Venues (H, `core/COMPLIANCE.md`, auto-generated): Polymarket, Polymarket US, Kalshi, Limitless, Probable, Baozi, Myriad, Opinion, Metaculus, Smarkets, Hyperliquid, Gemini Titan, SuiBets, Rain, Hunch. **No XO, no Trueo.**
- Data model (H, `docs/concepts/unified-schema.mdx`): Event > Market > Outcome. `UnifiedMarket` has `title, description (resolution criteria), category, volume, volume24h, liquidity, resolutionDate, tickSize, status, contractAddress, outcomes[]`. Outcome has `price, priceChange24h, metadata`. **No fee fields, no resolution-source field, no oracle/resolver field, no void policy, no neg-risk flag, no separate close-time vs resolution-time.** Adapters or our code must add those.
- Cross-venue features (H, `docs/router/*.mdx`, `core/src/router/types.ts`): hosted **Router** with Postgres catalog; `fetchMatchedMarketClusters`, `fetchMatchedEventClusters`, `compareMarketPrices`, `fetchRelatedMarkets`, `fetchHedges`, deprecated `fetchArbitrage` returning `{spread, buyVenue, sellVenue, buyPrice, sellPrice, relation, confidence}`. Match relations: `identity, complement, subset, superset, overlap, disjoint` (docs list five, types file adds `complement`). Quote: "Matching uses embedding-based similarity and LLM-verified relation classification" (docs/router/overview.mdx). Matching engine itself is hosted and not in the repo (M: only types and client are present). "Order routing is coming. Today the Router is read-only." (H).
- Depth helper (H, `core/src/utils/math.ts`): `getExecutionPriceDetailed(book, side, amount)` is a single-venue VWAP walker in floating point with no fees. Not suitable as-is for edge maths.
- Auth/pricing (H, https://www.pmxt.dev/pricing): hosted Data API Free $0 (25,000 credits/month, 60 req/min, 5 WS streams), Starter $29.99, Pro $99.99 (1,000,000 credits, 1,000 req/min). "All plans are for personal use only." Self-hosted OSS is free. Hosted trading examples pass a `private_key` to the SDK client (the SDK "auto-wraps it into an EIP-712 signer"); hosted mode says PMXT "handles custody, signing infrastructure" (readme, H). That custody wording conflicts with PayBox's non-custodial model, so do not route PayBox keys through it.
- Adding a venue (H, `ARCHITECTURE.md`): contribute `core/src/exchanges/<name>` in TypeScript, generated `api.ts` from an OpenAPI spec, register in 4 files. It is an upstream PR, not a plugin hook; the hosted catalog would not include XO unless pmxt ingests it.
- Strengths: broadest venue list, MIT, MCP server (`@pmxt/mcp`), relation taxonomy, free-tier matching API usable as a candidate generator, Dome migration codemod.
- Gaps: no XO; no fee/resolution-source fields; hosted matching is a black box (no calibration published); personal-use-only; sidecar architecture; main branch quiet for 3 months.
- **Verdict: BORROW** (taxonomy, schema ideas, optional hosted Router as a candidate generator). Not a runtime dependency of the plugin.

### 1.2 Predictefy

- URL: https://docs.predictefy.com (`/llms.txt`, `/llms-full.txt`), npm `@predictefy/sdk` and `@predictefy/mcp`, PyPI `predictefy`. The GitHub repo named in npm metadata (`Predictefy/predictefy-core`) returned 404 (private or absent), so the server side is closed.
- License: SDK **MIT** on npm and PyPI (H). Service is SaaS.
- Maintenance (H, npm 2026-10-19): package created 2026-08-03; `1.0.0-beta.11` published 2026-10-07; 12 versions; PyPI `1.0.0b9`. **Beta, about 11 weeks old.**
- Venues (H, vendor docs): 16 served ids including `polymarket, kalshi, opinion, hyperliquid, limitless, polymarket_us, sxbet, myriad, gemini, rain, predictfun, pascal, xo, pred, predictstreet, novig` plus `router`.
- **XO specifics (M, vendor docs, dated 2026-08-15 to 2026-09-02; treat as leads only)**: XO order books served as "Real CLOB (own rollup)"; no public XO trade tape ("XO's own trade endpoints are caller-scoped"); hosted execution lane "build + submit + cancel" armed 2026-08-18 after a rebuild to a 13-field EIP-712 order; "Nothing has been submitted to XO yet"; CLOB credentials are a caller-owned key/secret/passphrase triple; signature type 3 (XO smart account, ERC-1271) is the default; a social-login ZeroDev account cannot sign in the documented 65-byte form (limitation noted 2026-08-23); "XO access is partner-provided; the sources do not document its signup or KYC flow"; funding: "deposit route unverified"; "A read-only scan found only 2 active markets in 3,000 catalog rows." These are useful gate leads (items 1, 2, 3, 6) but secondary.
- Cross-venue (H, vendor docs): `GET /v1/clusters` (embedding `similarity` score, "deliberately not a calibrated probability"), `/v1/discrepancies` (mid-price gaps, "They tell you where to look, not what to trade"), `/api/router/fetchArbitrage` which labels a row executable only if all gates pass: "live non-synthetic asks on both legs, open market status, full depth at the requested size, a VERIFIED per-venue fee model, the resolution-equivalence gate, and positive net edge after venue taker fees and settlement costs (network costs are not included today)". This gate list is the best published checklist for an executable label and is the model for section 5.
- Execution (H, vendor docs): client-signed, non-custodial; default caps 100 USD per order and 1,000 USD per key per rolling 24 h; every write needs an `Idempotency-Key`. No withdrawal or bridge-out route. LI.FI-backed bridge quotes exist (`GET /v1/bridge/quote`) but XO has "no hosted funding path".
- Pricing (H, vendor docs): Free 25,000 credits/month, 60 req/min; Builder $48.88/mo; Pro $149/mo (arbitrage feed, price-gap feed, history replay); Enterprise from $2,500. Credits: 5 per order-book snapshot or cross-match lookup, 10 per cross-venue comparison, 15 per arbitrage query.
- Strengths: only third-party that includes XO; capability-honest API (`NOT_SUPPORTED` rather than invented data); executable-vs-indicative labelling; MCP server; MIT SDK.
- Gaps: beta, closed server, young vendor risk, XO lane unproven, matching scores uncalibrated, XO data is "write-forward derived" candles only.
- **Verdict: BORROW the gating checklist and capability-honesty design; WATCH as an optional cross-check. Do not build the plugin on it** (closed beta SaaS, adds a trusted third party in a money path, and XO write path unproven).

### 1.3 Oddpool

- URL: https://oddpool.com , docs https://docs.oddpool.com (`/llms.txt`), base `https://api.oddpool.com`.
- License: proprietary SaaS (no OSS repo found). NOT FOUND (searched: GitHub org search, docs).
- Venues (H): retail API covers **Kalshi, Polymarket, Opinion** (arbitrage doc text); enterprise Reference Data API covers `kalshi, polymarket, polymarket_us`. No XO.
- Auth/pricing (H, docs `authentication.md`, `rate-limits.md`): `X-API-Key` header; Search and historical free; WebSocket free (distribution only) / Pro for book and trade; whale tracking Pro $30/mo; **Arbitrage and Price Spreads Premium $100/mo**; Premium 25 req/s, 5M requests/month. Reference Data API is an enterprise product requiring an institutional agreement.
- Arbitrage endpoint (H, `arbitrage/current.md`): `GET /arbitrage/current?min_net_cents=&orderbook=true`; "`net_cents = round((1 - (best_yes_ask + best_no_ask)) x 100) - fees`"; `executable_size` and `max_profit_dollars` walk **both legs' ask ladders together** (top 25 levels), fees "applied per level using the same per-venue rates" (Kalshi sector taker, Polymarket per-market `feeSchedule.rate`, Opinion topic rate plus floor); explicitly "does not model slippage from latency, partial fills, or order-placement minimums". This is the same depth-walk as section 6.
- Matching data model (H, `institutions/reference-data/response-fields.md`): the most explicit published structured taxonomy for equivalence:
  - Event > Outcome > Venue listing > Entity ids (`OPI/OPO/OPL/OPE`), entities carry Wikidata Q-IDs; `provenance: llm_auto` marks auto-minted entities without a Wikidata match.
  - Per venue-pair `basis_class`: `identical` (same anchor, same authority, gap <= 24 h) | `settlement_window` (timestamps diverge > 24 h or different stage of the resolution chain, e.g. election day vs certification) | `settlement_source` (two named authorities, e.g. NWS vs Weather Underground).
  - `outcome_universe`: `identical | partial | disjoint`.
  - `divergence_axes` subset of `{timing, source, condition_scope}`; `fungible = (basis_class == identical && divergence_axes == [])`; `condition_scope` = cancellation/postponement policy (one venue pays last-traded price, the other resolves No or 50-50).
  - `outcome_kind`: `binary, multi_class_named, range_bin, threshold_above, threshold_below, point_mass, spread, will_happen_by_date` with `outcome_params.deadline {iso8601, inclusive}`.
- Gaps: no XO; arbitrage is Premium-gated; docs example is suspicious (Polymarket YES ask 0.055 vs Opinion YES ask 0.21 for the same team; a 4x gap usually signals a definition mismatch or stale book; M, my inference); docs carry an agent-targeted instruction (see suspicious content).
- **Verdict: BUY only if we want a vetted Kalshi/Polymarket/Opinion arb feed to benchmark against; BORROW the `basis_class / divergence_axes / outcome_kind` schema outright.**

### 1.4 PolyRouter

- URL: https://polyrouter.io , docs https://docs.polyrouter.io (`/llms.txt`), base `https://api-v2.polyrouter.io`.
- License/pricing (H): proprietary; "PolyRouter is free and open to everyone" (open beta). No paid schedule published. No OSS repo found.
- Venues (H): 7: Polymarket, Kalshi, Manifold, Limitless, ProphetX, Novig, SX.bet. No XO.
- Maintenance: last changelog entry visible is `v2.0.0` released **2026-01-06** (9 months; STALE?).
- Data model (H, `list-markets.md` schema): includes `fee_rate, trading_fee, withdrawal_fee, resolution_date, resolution_criteria, resolution_source, trading_start_at, trading_end_at` (richer than pmxt on fees and sources). Orderbook endpoint supports Polymarket, Kalshi, Limitless, Manifold only. Events and series only Polymarket and Kalshi.
- Gaps: no matching endpoint seen in the index; beta; stale changelog; docs contain a live-looking API key in curl examples (not copied).
- **Verdict: low priority. BORROW the field list; optional free data source for sports.**

### 1.5 Adjacent

- URL: https://docs.adjacent.markets (`/llms.txt`), base `https://api.adjacent.markets/api/v1`.
- Venues (H): Kalshi, Polymarket, Polymarket US, Gemini; ids prefixed (`kalshi:`, `polymarket:` ...). Prices on 0-100 scale. Also indices, reference rates, news, filings, SEDA oracle proxy.
- Pricing (H, `pricing.md`): Free $0 (15-minute delayed), Pro $50/mo (30 req/min), Premium $250/mo (180 req/min). **"Neither plan permits redistribution or use in a financial product."**
- Gaps: no cross-venue matching, no XO, licence forbids use in a financial product (our plugin could be read as one). 
- **Verdict: skip** for the plugin; fine for human research.

### 1.6 Dome

- Dome (YC F25) was acquired by Polymarket, announced **2026-02-19**, terms undisclosed (H, The Block + Dome docs banner). Dome docs banner (H): "all Dome APIs will reach end of life on **April 28th, 2026**." pmxt ships a `dome-to-pmxt` codemod.
- **Verdict: DEAD.** Any plan citing Dome is stale.

### 1.7 Prediction Hunt (prediction.com), Kairos, Matchr, Converge, TradeFox, Verso, Parsec

- **Prediction Hunt v2 API** (M, vendor blog `prediction.com/blog/best-api-for-prediction-markets`, updated 2026-05-27): Kalshi, Polymarket, PredictIt, ProphetX, Opinion; `/api/v2/matching-markets` returns "MarketMatchGroup"; `/arb` and `/ev` signals on Dev $49/mo and Pro $249/mo; Free has no arb or EV signals. Matching method not disclosed. Vendor blog, self-serving comparison.
- **Kairos** (M, vendor page): free terminal merging Kalshi, Polymarket and Predict.fun books into one NBBO ladder, best-price routing; enterprise API link with no details; custody not stated.
- **Matchr, Converge, TradeFox, Eventarb, ArbBets, Polytrage, PolyScalping** (L): listed in the community "Awesome-Prediction-Market-Tools" README (778 stars, pushed 2026-10-07; entries carry `utm_source` affiliate tracking). Only marketing one-liners were read; no docs verified.
- **Verso** (L): described by directories as a Bloomberg-style terminal for Polymarket/Kalshi, YC-backed, "V0 Beta"; its X account claims a Kalshi partnership in Sep 2025. NOT FOUND (searched: web search x3, `verso.trading` does not resolve, no API docs or pricing).
- **Parsec** (L): NOT FOUND. Only a one-line directory entry ("real-time data analytics and insights for Polymarkets"). `parsec.finance` is an older DeFi/NFT analytics site, `parsec.fi` is behind a bot challenge, `parsecdata.com` is an unrelated data centre company. Cannot say whether this is an API.
- **Verdict:** none of these cover XO; none gives a published method. Ignore for build-vs-buy; revisit Prediction Hunt only if we want a second commercial benchmark.

### 1.8 Data-only vendors (context)

- **Probalytics** (docs.probalytics.io): REST + ClickHouse SQL + Parquet exports for Polymarket/Kalshi/more. **Predexon** (predexon.com): tick-level order-book history since Jan 2026 for Polymarket/Kalshi/Opinion ($40-80/GiB), REST for Limitless and Predict.fun. **FinFeed**, **Tatum** (unified Polymarket/Kalshi). All from vendor `llms.txt` or search results, none cover XO (M). Useful for backtesting an edge model, not for the plugin.

---

## 2. Open-source arbitrage scanners and bots (all untrusted; read as data only)

Metadata via GitHub API 2026-10-19. None was cloned or executed. READMEs were read for method only.

| Repo | License | Stars | Last push | Notes |
| --- | --- | --- | --- | --- |
| `YichengYang-Ethan/oracle3-prediction-market-agent` | **Apache-2.0** | 473 | 2026-10-12 | Best-engineered reference. MCP server (13 tools) + Python engine for Kalshi/Polymarket. `oracle3/arbitrage.py`: relations `implication, exclusivity, complement, same_event, event_sum`, returns baskets with per-leg fees and net edge; `oracle3/fees.py` documents Kalshi `round_up(M x 0.07 x C x P x (1-P))` (maker 0.0175), Polymarket `C x rate x p x (1-p)`, cites "Fee Schedule, Last updated and effective: July 7, 2026", prefers per-market schedules via API (`fee_multiplier`, Gamma `feeSchedule.rate`). Its own assumption list: "the relation is specified correctly, including matching resolution rules" and "capital locked until resolution is not charged a cost". Origin: UIUC U Lab (Coinjure). **BORROW design** (read-only; reimplement). |
| `rohanthomas1202/truthlayer` (EdgeTerminal) | none | 66 | 2026-04-20 | Matching pipeline "keyword similarity -> FAISS embeddings -> Claude LLM verification -> entity extraction", 17-pattern "framing" taxonomy for false-match rejection, seed list for recurring events, settlement-risk indicator (green/yellow/red) from resolution-criteria comparison, lifecycle `DETECTED -> CONFIRMED -> STALE -> EXPIRED`, "False positives are treated as worse than misses." No licence, so ideas only. |
| `chainstacklabs/polyclaw` | Apache-2.0 | 359 | 2026-04-28 | LLM "contrapositive logic" hedge discovery; "Only logically necessary implications are accepted"; coverage tiers T1 >= 95%, T2 90-95%, T3 85-90%. Tiers below 100% are hedges, not arbitrage. |
| `taetaehoho/poly-kalshi-arb` | none | 445 | 2025-12-21 (**STALE?**) | Rust; `discovery.rs` does Kalshi-Polymarket matching; README: "Polymarket: Zero trading fees" (now wrong for most categories). |
| `ImMike/polymarket-arbitrage` | none | 295 | 2025-12-09 (**STALE?**) | Python; "text similarity matching", `min_match_similarity` 0.6, config `taker_fee_bps: 0` for Polymarket (stale). |
| `realfishsam/prediction-market-arbitrage-bot` | MIT | 187 | 2026-01-16 (**STALE?**) | Cross-venue bot; not read in detail. |
| `braedonsaunders/homerun` | **AGPL-3.0** | 205 | 2026-08-21 | Python strategy platform. Copyleft: do not copy into a plugin. |
| `guzus/dr-manhattan` | none | 204 | 2026-07-18 | "CCXT for prediction markets" competitor; metadata only. |
| `alsk1992/CloddsBot` | MIT | 2,984 | 2026-10-02 | Large autonomous agent; metadata only; not evaluated. |
| `aeonfun/aeon` | MIT | 777 | 2026-10-18 | Scheduled agent framework with prediction-market monitoring skills; metadata only. |
| `rdekovich/edgelord` | Apache-2.0 | 5 | 2026-02-25 | Rust arb CLI; metadata only. |
| `Drakkar-Software/OctoBot-Prediction-Market` | GPL-3.0 | 118 | 2026-03-30 | Copyleft. |
| `Oceanjackson1/Prediction-Market-Arbitrage-Compendium` | none | 5 | 2026-02-16 | Chinese-language survey of 11 strategies and 15+ repos built on the IMDEA paper; rates cross-platform arb "2-10%, window shrinking" and 15-minute latency arb "greatly weakened by dynamic fees". Secondary. |

**Spam-cluster warning (M, my inference from search results, not verified):** searches for "polymarket kalshi arbitrage bot" return a long tail of 1-50 star repos with near-identical descriptions and names (e.g. `TopTrenDev/...`, `defi-ape/...`, `CrazyXDevs/...`, `haoo99/...`). This pattern is commonly used to distribute credential-stealing code to people who run "profitable bots". Policy: never install or run any of them; the plugin must not import them.

**Common failure modes found in these projects (H where quoted from READMEs):** hard-coded or stale fee assumptions; text-similarity matching with a fixed threshold (0.6) and no resolution-rule comparison; no capital-lock cost; no void/50-50 handling; top-of-book only.

---

## 3. Academic and practitioner work

1. **Saguillo, Ghafouri, Kiffer, Suarez-Tangil, "Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets"**, arXiv 2508.03474 (Aug 2025; AFT 2025). Data window **2024-04-01 to 2025-04-01 (STALE?, and pre-2026 fee schedule)**, Polymarket only. Findings (H, read the paper): within-condition (YES+NO) and neg-risk "market rebalancing" plus "combinatorial" cross-market arbitrage; 17.2K conditions, 7,051 had at least one opportunity (2,628 NegRisk, 4,423 single); "All arbitrage opportunities observed are long, meaning the sum of the price of YES and NO is less than 1"; realised extraction estimated at **$39.59M** with the top account at $2.01M over 4,049 transactions. Method for dependent-market detection: restrict to pairs in the same topic and end date; LLM (DeepSeek-R1-Distill-Qwen-32B) emits outcome-vector tables; consistency checks (valid JSON, exactly one true per market, bounded vector count); exhaustive subset check; **manual review**. Result on US-election pairs: 46,360 pairs run, 1,576 labelled dependent, 374 passed the checker, **13 confirmed** by hand (11 neg-risk/neg-risk, 2 neg-risk/single); false positives were "weaker notion of dependency" or conflating popular vs electoral vote. Topic classifier accuracy 92% on 100 hand-labelled samples. Lesson: of the 374 pairs that passed even the formal subset checker, 361 (about 96%) were not true combinatorial arbitrage, and the LLM labelled 1,576 pairs dependent, so an LLM alone is only a candidate generator (loops in its reasoning also produced invalid output for 4,727 of the 46,360 pairs).
2. **Gebele & Matthes, "Semantic Non-Fungibility and Violations of the Law of One Price in Prediction Markets"**, arXiv 2601.01706 (Jan 2026, TU Munich; data 2018-2025, so partly **STALE?**). Read in full (H). 102,275 events across ten venues; ~6% concurrently listed on more than one venue; "persistent execution-aware price deviations of 2-4% on average". **Pipeline**: (1) structural filter (different platforms, same one of 20 LLM-assigned categories, overlapping validity windows); (2) embeddings of title + description + outcome labels + resolution metadata with `text-embedding-3-large`, top-20 nearest neighbours (>99.9% of verified relations fall in the top 20); (3) two LLM passes: a high-recall plausibility filter, then a structured comparison of implied YES-regions to classify equivalence or subset; cutoff times, oracle identities, dispute procedures, scope qualifiers and conditional clauses are inputs. Human validation: 1,000 stratified candidates (near-perfect agreement) and 1,000 verification-stage instances (high agreement); LLM verification "reduces the false-positive rate". Cost: about 200M tokens for 100k events. Resolution-semantics dimensions they define: reference source, temporal scope, exception rules (invalidation, dispute, multi-stage finality, amendment). Case studies: NYC high temperature (Kalshi reads one NOAA station, Polymarket another, "frequently record different temperatures"); 2024 election winner (Polymarket/Limitless resolve on media calls, Kalshi/Myriad on inauguration, a strict subset relation). Execution assumptions in their appendix (Kalshi 1.5% flat, Polymarket 0%, Truemarkets AMM 0.8%) are **outdated by 2026 fee schedules**. Their headline 1,218.66% over 800 days / 15 trades comes from a mechanical backtest with those assumptions; do not treat as achievable.
3. **Practitioner evidence on settlement divergence (2026, M, blogs)**: OddsShopper 2026-08-15 and Convex Lake 2026-09-23 both describe the Nov 2025 US government-shutdown ladder (Kalshi snapshot of an OPM page about 10-11 AM ET vs Polymarket "by 11:59 PM ET"; Polymarket "ends November 12" rung went from about 97 cents to about 1 cent) and the NYC temperature station mismatch (Convex Lake: agreement 32.4% in NYC vs 61.8% in Miami over 102 resolved city-days). OddsShopper also quotes Kalshi's rulebook last-traded-price fallback ("a contract last traded at $0.10 ... pays longs 10 cents and shorts 90 cents"). Treat as M: blog sources, though two independent ones agree and they agree with the paper.
4. **UMA oracle risk (M, STALE?)**: March 2025 Ukraine minerals market (about $7M) resolved Yes via a large UMA holder's votes; Polymarket called it an "unprecedented governance attack" and declined refunds (The Block, The Defiant). No 2026 incident or oracle redesign found (NOT FOUND, searched: web x2). Polymarket's own docs (H) describe the current process: UMA Optimistic Oracle, bond typically $750 pUSD, 2-hour challenge period, second proposal, then UMA DVM vote (24-48 h debate plus about 48 h voting), and a "Unknown/50-50" outcome in which each token redeems for $0.50.
5. Others seen but not relied on: PolySwarm (arXiv 2604.03888, LLM multi-agent trading and latency arbitrage), Prediction Arena (2604.07355), ForesightFlow (2605.00493). Titles only (L).

---

## 4. Recommended matching method and failure modes

### 4.1 Pipeline (synthesis of Gebele & Matthes, Saguillo et al., Oddpool, pmxt, EdgeTerminal)

0. **Seed from structure, not text**: for each XO market take `resolutionSources`, `expiresAt`, `resolutionType`, `rules` from the XO Data API and the full rule text; for external venues take the same fields (Kalshi `rules_primary/secondary`, `settlement_sources`, `close_time`, `expected_expiration_time`, `latest_expiration_time`; Polymarket `resolutionSource`, `endDate`, `umaResolutionStatus`).
1. **Structural filter**: same category, overlapping validity windows, compatible outcome kind (binary / multi-class / threshold ladder / by-date). Cheap and conservative (paper: preserves essentially all true matches).
2. **Candidate retrieval**: embeddings of title + description + outcomes + resolution text; top-k = 20 per XO market (a few hundred external markets per day is fine; XO has ~9 active markets).
3. **LLM verification, two passes** as in the paper: plausibility, then a structured comparison that must output (not prose): relation in `{identity, complement, subset, superset, overlap, disjoint}`, `basis_class` in `{identical, settlement_window, settlement_source}`, `divergence_axes` subset of `{timing, source, condition_scope}`, deadline and inclusivity, entity ids, and a list of quoted rule fragments that justify each field.
4. **Deterministic gate** (no LLM): reject unless relation is `identity` or `complement`, `basis_class == identical`, `divergence_axes == []` (or an explicit allow-list such as `condition_scope` when we will exit before resolution, as Oddpool suggests), deadlines equal to the second and inclusivity equal, same named source authority, same outcome universe, both markets `ACTIVE`.
5. **Human approval once per pair**, recorded with the hash of both rule texts, the venue-side ids, reviewer and date. Re-run the verification and **auto-suspend the pair if either rule text, close time, status or "additional context" changes** (Polymarket can issue clarifications; Kalshi can move close time earlier when `can_close_early` is true).
6. **Precision over recall**: EdgeTerminal's stance, adopted: "False positives are treated as worse than misses." Subset/superset and overlap pairs may still be shown as *hedges* with explicit residual states, never as arbitrage.

Given XO's tiny live set, steps 3-5 can be run manually with LLM assistance; no embeddings infrastructure is needed initially.

### 4.2 Real-world failure modes (with venue evidence)

| Failure mode | Evidence | Handling |
| --- | --- | --- |
| Different resolution sources | NYC temperature station mismatch (paper, Convex Lake); Kalshi series objects carry `settlement_sources` that change over time (KXHIGHNY lists "The Weather Company" today vs the paper's NOAA Central Park; H, API 2026-10-19) | Compare named source per leg; re-read on every refresh |
| Different close / cutoff times | Kalshi snapshot ~10-11 AM ET vs Polymarket 11:59 PM ET (shutdown); Kalshi `can_close_early` true and "close time ... may be moved earlier" (H, market lifecycle doc); XO `expiresAt` vs Polymarket `endDate` | Require deadline equality; alert on `close_date_updated` |
| "By date X" semantics | Oddpool `will_happen_by_date` with `deadline.inclusive`; Polymarket "ends on date" ladders pay on the announcement date, not the event date | Normalise deadline and inclusivity or reject |
| Early resolution | Polymarket UMA proposal can finalise after a 2-hour challenge; Kalshi `determined` then `settlement_timer_seconds` (300 s on the sampled market), `disputed` and `amended` states re-open settlement | Do not treat "proposed" or "determined" as final; wait for terminal state |
| Void / invalid outcomes | Polymarket "Unknown/50-50: each token redeems for $0.50"; Kalshi last-traded-price fallback (M); XO `VOIDED` terminal state with a "refund path defined in that market's published rules" and ToS: offending markets "resolved as invalid (with trades reversed or funds returned)" (H) | Model each venue's void payoff explicitly; an arbitrage that is only locked on non-void states is a hedge |
| Oracle / governance risk | UMA whale incident (2025); XO resolves by MODRA / AI panel / manual (Data API `resolutionType: MANUAL`), ToS says AI determinations "may be final without further review" (H) | Different oracles imply `settlement_source` divergence by default; XO pairs are never `identical` unless rules name an objective third-party source that both read |
| Tick / price rounding | XO tick 0.001 (H); Polymarket `orderPriceMinTickSize` observed 0.001 (H, Gamma); Kalshi `price_level_structure: linear_cent`, step 0.01 on the sampled market (H, may differ by series); Predictefy: "No venue accepts a price in cents" | Round every leg to its tick *before* computing edge (round buys up, sells down) |
| Fee drift | Polymarket now charges category rates; Kalshi `fee_type` varies per series (sampled: `quadratic` and `quadratic_with_maker_fees`, multiplier 1); stale bots assume 0 | Read fee params per market at quote time; refuse on unknown fee model |
| Capital lock | Locked to the latest plausible resolution on both venues; Polymarket UMA dispute path adds days; Gebele & Matthes: annualised yield falls with horizon and high APY comes from short horizons | Charge a hurdle rate for worst-case lock time |
| Withdrawal / funding limits | XO: "Supported networks, minimum and maximum amounts, fees and expected delivery times are shown in the withdrawal flow itself" (H); Polymarket withdraw via bridge (docs); no numeric limits documented for XO (NOT FOUND, searched XO docs `/product/accounts/withdraw`, `rg "minimum"`) | Treat as unknown; cap size; plan inventory per venue (no atomic cross-venue transfer; Predictefy: each venue is "a custody island") |
| Thin / one-sided books, stale last-trade prices | XO inactive markets return midpoint-or-last-trade token prices that sum to more than 1 (e.g. Yes 0.881 and No 0.58 on one inactive market, H sample) | Use ask ladders only, never `price` fields; require live two-sided depth |
| Geo / eligibility | Polymarket international: United States is **close-only** on frontend and API (H, `docs.polymarket.com/api-reference/geoblock`); XO "Eligibility is checked at the point of use" (H) | Check eligibility per venue at action time |

---

## 5. Executable-edge gates (adopt Predictefy's list, extended)

A pair is labelled `executable_arbitrage` only if **all** hold at quote time, else `indicative_discrepancy` with machine-readable reasons:

1. Approved pair with unchanged rule hashes, `basis_class == identical`, no divergence axes, deadlines equal.
2. Both markets `ACTIVE`; neither within a configurable window of close; no UMA proposal/dispute flag; no "additional context" update since approval.
3. Live, non-synthetic ask ladders on both legs (YES on A, NO on B or the complement), age below threshold, full depth at requested size.
4. Verified fee model on each leg (params read from the venue per market), fee rounding applied.
5. Net edge per marginal level > threshold after fees, gas/bridge (when known), capital-lock cost and a resolution-risk reserve.
6. Per-venue funding in place and eligibility check passed; per-order and daily caps respected.
7. Leg ordering plan for non-atomic execution (hit the less liquid / riskier leg first, size to the smaller fillable depth, define the unwind if leg 2 fails).

---

## 6. Venue fee formulas (verified) and worked example

### 6.1 Verified formulas

| Venue | Formula | Source and confidence |
| --- | --- | --- |
| **Polymarket (global)** | `fee = C x feeRate x p x (1 - p)`, taker only, rounded to 5 dp, min 0.00001 USDC. Category taker rates: Crypto 0.07, Sports 0.05, Economics/Culture/Weather/Other 0.05, Finance/Politics/Mentions/Tech 0.04, Geopolitics 0. Maker never charged; maker rebate 15-25%. Per-market parameters `feeSchedule {rate, exponent, takerOnly, rebateRate}` and `feesEnabled`. | **H**: https://docs.polymarket.com/trading/fees (fetched 2026-10-19), Gamma `GET /markets` returned `feeSchedule {"exponent":1,"rate":0.05,"takerOnly":true,"rebateRate":0.15}` on a sports market and rate 0.04 on 99 politics markets. Open point: docs say `exponent` is "applied to the price component"; for exponent 1 it reduces to the documented form. Non-1 exponents NOT FOUND in sample (sampled about 100 active markets plus the top-40 by 24h volume: `exponent` was 1 wherever a schedule was present). |
| **Kalshi** | `fee = round_up(M x 0.07 x C x P x (1 - P))` taker; maker `0.0175` coefficient only for series whose `fee_type` is `quadratic_with_maker_fees` (combo variant uses 0.5 maker multiplier instead of 0.25); `M` = series `fee_multiplier`; no settlement fee for simple yes/no. Fees accounted in $0.000001 units; rounding fee and rebate keep balances on cent (non-direct) or 0.01c (direct) grids. | **H** for the structure: `GET /trade-api/v2/series/{ticker}` returns `fee_type`, `fee_multiplier` (KXFED, KXNBAGAME, KXCPI: `quadratic_with_maker_fees`; KXINX, KXBTCD, KXPRESPARTY, KXHIGHNY, KXELONMARS: `quadratic`; all multiplier 1); docs.kalshi.com `fee_rounding.md`, `market_settlement.md` ("Settlement fees are zero for simple yes/no determinations"). **M** for the 0.07 / 0.0175 coefficients: the official fee-schedule PDF (`kalshi.com/docs/kalshi-fee-schedule.pdf`) is served behind a Vercel bot challenge and was not bypassed; coefficients come from oracle3's `fees.py` (cites "Last updated and effective: July 7, 2026"), the API doc text, and five consistent third-party guides. An index-market multiplier (some guides say 0.035) was not visible in the API (KXINX multiplier 1): NOT VERIFIED. Exact rounding granularity per order is also not fully verified. |
| **XO Market** | `fee = C x (feeBps / 10,000) x p x (1 - p)` per filled leg; taker and maker legs each use their own `feeBps`; maker rate is 0 on rewards-eligible markets; maker rebate = 35% of taker fee on eligible fills. Fee charged in collateral to the order's `maker` address: added to a buy's cost, withheld from a sell's proceeds. Rate via `GET /fee-rate?token_id=` returning `{base_fee: bps}`. Integer form `fee_micro = feeBps x C x tick x (1000 - tick) / (10_000 x 1000 x 1000)`. | **H**: https://docs.xo.market/guides/fees , `/product/rewards/maker-rebates` (xo-docs MCP, 2026-10-19). Current category rate: Predictefy says "currently 0" (**M**, vendor, dated Aug-Sep 2026): verify with a live `GET /fee-rate`, not attempted here because a token id is needed. |

Not verified (NOT FOUND, searched vendor docs only): Polymarket US fee schedule, Opinion fee formula (Oddpool says "topic rate + floor"), Limitless fee range (paper: 0.03-3%), Trueo fee.

### 6.2 Example A: cross-venue identity pair, buy YES on Kalshi + NO on Polymarket, depth-walked

Synthetic numbers (illustrative, chosen to look like a real top-of-book gap; not live quotes). Assumptions: Kalshi series `fee_multiplier` 1 and taker; Polymarket Economics taker rate 0.05; both legs taker; 30 days to latest plausible resolution; hurdle 8% APY on locked cost; 1 cent per share resolution-risk reserve; minimum acceptable marginal net 0.5 cent per share. Pair is `identity`, `basis_class: identical` (so gates in section 5 pass).

Ladders (asks): Kalshi YES: 0.38 x 120, 0.39 x 300, 0.41 x 500. Polymarket NO: 0.54 x 80, 0.55 x 400, 0.57 x 1000.

Walk both ladders together; at each step take `min(size_A, size_B)` at the current best prices; compute per-share economics:

| Step | YES ask (K) | NO ask (P) | Qty | Gross/sh | Fees/sh (K + P) | Lock/sh | Reserve/sh | Net/sh | Take? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.38 | 0.54 | 80 | 0.0800 | 0.0289 (0.016492 + 0.012420) | 0.0060 | 0.01 | **+0.0350** | yes |
| 2 | 0.38 | 0.55 | 40 | 0.0700 | 0.0289 (0.016492 + 0.012375) | 0.0061 | 0.01 | **+0.0250** | yes |
| 3 | 0.39 | 0.55 | 300 | 0.0600 | 0.0290 (0.016653 + 0.012375) | 0.0062 | 0.01 | **+0.0148** | yes |
| 4 | 0.41 | 0.55 | 60 | 0.0400 | 0.0293 (0.016933 + 0.012375) | 0.0063 | 0.01 | **-0.0056** | **stop** |

Formulas: Kalshi per share `0.07 x p x (1-p)`, Polymarket per share `0.05 x p x (1-p)`, lock per share `(pK + pP) x 0.08 x 30/365`.

Totals for steps 1-3 (420 shares, capital $392.80): gross $27.20; Kalshi fee $6.97494 (order-level round-up to the cent gives $6.98); Polymarket fee $5.20110; **net of fees $15.02**; lock cost $2.58; reserve $4.20; **net after all frictions $8.24** (2.1% of capital over 30 days). Net-of-fee return on capital 3.82% over 30 days; the top level alone looks like 8 cents gross (8.7% of cost) but fees take 36% of it.

Observations: (a) marginal rule `net_per_share(level) > threshold` is the stopping rule; the best-priced level is not the size to trade; (b) fees alone consumed 45% of gross; (c) skipping the capital-lock and reserve terms (as every reviewed bot does) would also have taken step 4 (net-of-fee +0.0107/sh) and reported $15.02 of profit for steps 1-3 instead of $8.24, an overstatement of about 82%; (d) all of this is conditional on the pair being truly fungible: if the two markets settle differently, both legs can lose and the edge is irrelevant.

### 6.3 Example B: within-venue YES + NO < 1 (rebalancing), Polymarket, 100 shares, YES ask 0.47, NO ask 0.51 (gross $2.00)

| Category rate | Fees (both taker legs) | Net |
| --- | --- | --- |
| Geopolitics 0 | $0.00 | **+$2.00** |
| Politics/Finance 0.04 | $1.996 | **+$0.004** |
| Economics/Sports 0.05 | $2.495 | **-$0.495** |
| Crypto 0.07 | $3.493 | **-$1.493** |

Break-even gross spread at mid prices is `2 x rate x p x (1-p)` = 2.0 / 2.5 / 3.5 cents per share for rates 0.04 / 0.05 / 0.07. The Saguillo "2 cent" bound (period when fees were zero) is therefore not a profit threshold in 2026 on most categories. Whether a YES-buy and NO-buy matched against each other as a mint changes who pays the fee is NOT FOUND in the fee docs; assume both pay.

### 6.4 Example C: neg-risk / complete-set arbitrage (buy every YES in a mutually exclusive, exhaustive set)

Four outcomes with asks 0.30 / 0.28 / 0.22 / 0.18 (sum 0.98), 100 shares each, Polymarket rate 0.04: gross $2.00, fees $2.9232 (four legs), **net -$0.92**. Every extra leg adds a fee, so the required gross edge grows with set size. Also, only trade **named** outcomes: Polymarket warns "Only trade on named outcomes" for augmented neg-risk (placeholder outcomes and "Other" change definition). The paper family finds neg-risk the main source of historical edge, but with 2026 fees it needs a larger gap. Conversion (`No` on one outcome into `Yes` on all others) lets a single-sided position substitute for buying all YES legs; fee treatment of conversion is NOT FOUND.

### 6.5 Example D: XO vs Polymarket hedge (illustrative only; not an arbitrage)

Buy XO YES at 0.30 and Polymarket NO at 0.66 (sum 0.96, gross $4.00 per 100 shares). Polymarket politics fee on NO leg: `100 x 0.04 x 0.66 x 0.34 = $0.8976`. XO fee depends on `feeBps` (unknown live): 0 bps gives net $3.10; 400 bps gives XO fee $0.84 and net $2.26; 700 bps gives $1.47 and net $1.63. Even at the best case this is **not locked**: XO resolves via MANUAL/MODRA rules written by the market creator, Polymarket via UMA, so `basis_class` should be `settlement_source` unless the XO rules name a hard objective source and the same cutoff. Treat as a directional/hedged trade with explicit residual risk.

### 6.6 Inputs each venue adapter must supply (per market, at quote time)

**Identity and rules**
- venue id; venue-native market, condition/event and outcome/token ids; URL; neg-risk / exclusive-group id.
- title, **full verbatim rule text** and its hash; `resolution_sources` (named authorities/URLs); resolution mechanism (UMA, Kalshi staff determination, XO MODRA/manual, Chainlink); void/invalid payoff policy (50-50, last-traded price, refund path); dispute and clarification state (`umaResolutionStatus`, Kalshi `disputed/amended`, "additional context").
- timestamps in UTC: open, close (and `can_close_early`), expected resolution, latest resolution; "by-date" deadline plus inclusivity; settlement timer or challenge window length; venue status enum normalised to {pending, active, paused, closed, determined, resolved, voided}.

**Pricing and microstructure**
- full bid and ask ladders for both YES and NO (price, size), `as_of` time, `synthetic` flag (derived complement vs native book), tick size, min order size, min notional, price unit, size unit and decimals.
- order types available (FOK / FAK / GTC / GTD), partial-fill semantics, rate limit, whether cancel is revocable (XO: cancel removes from book but "does not invalidate the signed order on-chain", per Predictefy, M).

**Fees and costs**
- fee model id and **parameters read from the venue per market** (Kalshi `fee_type`, `fee_multiplier`; Polymarket `feeSchedule {rate, exponent, takerOnly}`; XO `base_fee` bps from `/fee-rate`), maker vs taker assumption, rounding rule, who bears the fee (added to cost vs withheld from proceeds), settlement fee, deposit/withdrawal fee, gas/bridge cost, builder/referral fees.

**Capital and eligibility**
- collateral asset and decimals (XO: six-decimal USDC.e bridged; Polymarket: pUSD; Kalshi: USD), available balance, funding route and time, withdrawal route/time/limits, position and order caps, geo/eligibility result at action time, custody model.

**Trust metadata**
- data source (`venue-rest` vs derived/cached), staleness, `quality` flags, adapter version, schema hash of the fee/rule parsers (so a venue change fails closed).

---

## 7. XO findings that bear on the plan's gate items (verified where marked)

All from the xo-docs MCP (H) or unauthenticated GETs to documented XO hosts on 2026-10-19 unless marked M.

- **Read hosts**: Orderbook API `https://orderbooks.xo.market` (`GET /markets`, `/book?token_id=`, `/time`, `/fee-rate`), Data API `https://api-mainnet.xo.market/api/...` (rate limit 100 requests per 10 s per client IP). Both answered without credentials (H). Relevant to gate 9 as a **read-side path that does not need Blockscout**.
- **Catalog size**: Data API status counts: ACTIVE 9, CLOSED 1,322, PAUSED/RESOLVED/VOIDED/PENDING 0. Orderbook `/markets` lists 47,063 markets, but only 34 `active` among the first 4,000 scanned (different catalog; legacy entries likely). All 9 active markets have `resolutionType: MANUAL`; volumes about $0.4k to $411k. Titles are untrusted creator text; a few look matchable to major venues (2028 Democratic nominee, Brazil presidential winner, Bitcoin above $100,000 in 2026).
- **Depth sample**: 17 of the 34 active order books were two-sided; typical spreads 1.5-16 cents; several one-sided; several 0.001/0.999 placeholder quotes. Confidence M (single snapshot).
- **Tick and units** (H, `/guides/wire-conventions`): tick 0.001 globally, prices strings; sizes human shares or 6-decimal micro-shares; three timestamp formats (seconds, milliseconds, stringified). `neg_risk` is "Always false on XO" (orderbook OpenAPI). Matching can use complementary, mint and merge routes ("economically compatible YES/NO liquidity").
- **Order flow (gate 2, H from OpenAPI)**: `CTFOrder` is a 13-field EIP-712 typed order (`salt, maker, signer, beneficiary, tokenId, makerAmount, takerAmount, expiration, nonce, identifier, metadata, side, signatureType`), domain "XO Market CLOB" version 1 chain 3223; `signatureType` 3 = XO ZeroDev smart account (ERC-1271), 0 = EOA; order types GTC/GTD/FOK/FAK; `postOnly` flag; no fee field; auth is L1 ClobAuth wallet signature minting L2 HMAC credentials. Predictefy's independent reading agrees (M).
- **Smart account (gate 3)**: XO's own docs contradict themselves on whether type 0 is accepted today (Predictefy, M); social-login accounts have a signature-format problem (M). Whether a PayBox EVM wallet can own an XO smart account remains unanswered here.
- **Funding (gate 6)**: XO docs send withdrawals through an in-app flow with limits "shown in the withdrawal flow itself"; no public deposit-contract documentation found by me in this task (NOT FOUND, searched `/product/accounts/withdraw`, `rg "bridge|deposit"` not exhaustively). Predictefy: "deposit route unverified".
- **Terms (gate 7, H)**: XO ToS: "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system"; "You may not harvest or scrape data from the Platform for unauthorized purposes". **Wash trading is defined as "engaging in trades with yourself or colluding with others"** and prohibited, with offending markets possibly resolved invalid; the plan's decision that self-trading is "always allowed" needs reconciling with that clause. Eligibility "can depend on geography, account state, product access, verification".
- **Fees**: formula verified (6.1).

---

## 8. Regulatory and exchange-rule verification (docs/research-notes.md claims)

| Claim in notes | Result |
| --- | --- |
| "CFTC advisory 2026-02-25" on manipulation/insider rules | **Verified, H**: CFTC press release 9185-26, "CFTC Enforcement Division Issues Prediction Markets Advisory", 2026-02-25. Issued after two KalshiEX cases handled by Kalshi (a candidate trading on his own candidacy, May 2025; a YouTube channel editor, Aug-Sep 2025). Names insider trading (misappropriation), pre-arranged noncompetitive trading and wash sales, disruptive trading, fraud and manipulation; restates that DCMs must keep audit trails, surveillance and enforcement. **Does not mention automated, algorithmic or bot trading** (checked page text). |
| "Polymarket/Kalshi tightened rules 2026-03" | **Verified, M**: both announced new insider-trading/market-integrity rules on **2026-03-23** (Venable 2026-04; Bloomberg headline 2026-03-23; multiple news summaries). Polymarket's rulebook (applies to Polymarket US and international per reports) bars trading on stolen or duty-breaching confidential information and by people who can influence outcomes; coverage lists spoofing, wash trading, fictitious transactions, front-running, self-dealing as prohibited. Kalshi added technological guardrails blocking politicians and athletes from relevant markets. I did not read Polymarket's rulebook directly. |
| (additional) CFTC Division of Market Oversight Staff Advisory 26-08 | **M**: dated 2026-03-12 (Venable): exchanges must ensure contracts are not "readily susceptible to manipulation". |
| (additional) CFTC ANPRM on prediction markets | **H**: CFTC press release 9194-26, 2026-03-12, Federal Register 91 FR 12516, 45-day comment period; topics: core principles, contrary-to-public-interest contracts, cost-benefit. Page does not mention manipulation, surveillance or automated trading. |
| (additional) June 2026 proposed Rule 40.11 and October 2026 swaps rulemaking | **M/L**: law-firm and trade-press summaries only (contract-by-contract public-interest review proposed June 2026, comments due 2026-07-27; a swaps-definition proposal and interim rule on casino-style products sent to OMB around 2026-09-30, one outlet says released 2026-10-09; dates conflict). Not read at source. |
| Anything specific to **automated arbitrage** | **NOT FOUND** (searched: CFTC press releases 9185-26 and 9194-26, web searches for "automated trading bots wash trading cross-venue" 2026, Venable summary). Cross-venue arbitrage is not itself addressed; the live legal exposures are insider/MNPI, wash/self-trading, manipulation, venue ToS on bots, and eligibility. |
| Eligibility for a cross-venue operator | **H**: Polymarket international lists the **United States as close-only** on frontend and API (docs `api-reference/geoblock`); Polymarket US (QCEX) and Kalshi are separate US-regulated venues. A US-based operator cannot assume a Kalshi + Polymarket-international pair is tradeable. |

---

## 9. Design implications for this repo

1. Ship aggregation as **read-only tools** in the plugin (`xo_find_edge`, `xo_compare_market`), not an auto-arb engine. Execution stays on XO only, through the existing prepare, sign, submit pattern and caps. Other legs are surfaced as instructions or handled by other PayBox plugins; cross-venue legs cannot be made atomic.
2. Implement a **pure, Decimal-based `edge` module** (venue adapters -> normalised quotes -> relation/basis gate -> depth-walk -> fees -> lock -> reserve) with golden tests taken from sections 6.2-6.5. Fail closed on unknown fee model, stale book, synthetic book, rule-hash mismatch.
3. Keep a **pinned, human-approved pair registry** in the repo (JSON), with rule-text hashes. Use LLM assistance only offline to propose pairs.
4. Allowlist only read hosts the plugin needs (XO orderbook + data API, Polymarket Gamma/CLOB, Kalshi public API, optional pmxt Router and Quotient). Poll politely: XO Data API budget is 100 requests per 10 s per IP and the ToS asks bots not to overwhelm the service.
5. **Quotient** (section 10) as a fair-value prior only for markets that exist on Polymarket/Kalshi, mapped to XO through the registry; never as trade authority; require its `quality` grade; budget per call.
6. Ignore Dome; do not depend on pmxt, Predictefy or Oddpool at runtime. Re-evaluate Predictefy once an XO order has actually been submitted through it and the server side is documented.
7. Record in the plan: XO ToS wash-trading definition vs "self-trading always allowed"; Polymarket international US close-only status; XO has ~9 live markets, so capacity (and arbitrage opportunity count) is tiny.

---

## 10. Quotient (signals) and Trueo

### Quotient
- Not found at `quotient.social`/`quotient.fi` by name; third-party listings (OpenSea x402 Bazaar, Bankr skills, skills.sh) point to `https://quotient-api-gateway.onrender.com` (reachable, serves `/openapi.json`, 371 KB, title "Quotient API", version 20.5.0) and `https://q-api.quotient.social` (TLS handshake failed from this machine). Official docs/site NOT FOUND by search; provenance of the gateway host is M.
- Venues in the OpenAPI (H): `polymarket, polymarket_us, kalshi, hl_outcomes`. **No XO.** 27 paths including `/api/v1/markets/mispriced` ("Find markets where Q's forecast differs from a verified live YES quote by at least `min_spread`"; missing/stale/unsupported quotes excluded), `/markets/{slug}/forecast`, `/signals`, `/price-outlooks`, `/portfolio`, `/x/search`, `/wallets/link`.
- Auth/pricing (H, OpenAPI): `x-quotient-api-key` account credits, or x402 after a 402 challenge; `mispriced` priced at 0.02 (x402, fixed); doc text: "A stored forecast costs $0.01 to read; a new forecast costs $1.00 to generate." Forecast and signal reads include `quality` and `return_record` ("Quality grades the comparable track record, with separate live and historical evidence").
- Claims of accuracy ("8.2% more accurate than Polymarket", from a Bankr promo post) are vendor claims (L). No license or SLA found. Paying by x402 would use PayBox `pay_x402`, a money-moving tool that I did not call.
- **Verdict: BUY as an optional per-call input**, behind a feature flag and a per-day spend cap; validate its calibration ourselves on resolved markets before using it for sizing.

### Trueo
- Onchain binary prediction market launched on Base in March 2025; announced a move to Ethereum mainnet 2026-09-21/22 (Cointelegraph, Bankless, others); DefiLlama TVL about $795,687, ranked 14th among onchain prediction markets (single snapshot, M); search summaries describe a Uniswap v4 hook AMM, TYD as payment/collateral and oracle-bond asset, a 12-hour challenge period, Oracle Council then TRUE-holder escalation, a three-day funding phase for new markets (L, search summary). No API/subgraph docs found (NOT FOUND, searched web x2); no aggregator lists it (pmxt, Oddpool, PolyRouter, Adjacent, Predictefy venue lists checked). Gebele & Matthes list "Truemarkets" (AMM, Uniswap v3, 0.8% fee) as a venue; whether Trueo is the same project was not confirmed.
- **Verdict: custom on-chain reader only if wanted later; negligible liquidity makes it irrelevant to arbitrage capacity now.**

---

## 11. Not found, open questions, risks

NOT FOUND (with what was searched):
- Verso and Parsec APIs, pricing or methodology (web search x3; `verso.trading` does not resolve; Parsec domains unrelated or challenged).
- Official Kalshi fee-schedule PDF text (blocked by Vercel bot challenge, not bypassed); index-market multiplier.
- Polymarket US and Opinion and Limitless fee formulas; fee treatment of neg-risk conversion and of minted complementary matches.
- Date Polymarket began charging category taker fees (docs fetched show current state only).
- Any 2026 advisory specific to automated or cross-venue arbitrage (CFTC pages, web x3).
- Any 2026 UMA governance change (web x2).
- XO deposit/bridge documentation and numeric withdrawal limits (xo-docs searches limited to the withdraw page).
- A public XO trade tape (Predictefy says none exists; the OpenAPI describes caller-scoped trades).
- A Quotient official docs site and terms.
- Any aggregator that has submitted a live order to XO (Predictefy: none as of Aug-Sep 2026 docs).

Open questions:
1. Is `GET /fee-rate` on XO currently non-zero for the categories of the 9 live markets? (needs a token id; trivially checkable.)
2. Does XO publish or allow a machine-readable "rules" structure (Data API `rules` field was empty `{}` on the sample; `metadataUri` points to a JSON document that was not fetched) good enough for the structured gate?
3. Which jurisdiction will the operator trade from (Polymarket international US close-only; Kalshi eligibility)?
4. Is there appetite to pay for Oddpool Premium or Predictefy Pro just to benchmark the in-house calculator?

Risks:
- Matching errors are the dominant risk: a mismatched "arbitrage" can lose on both legs. Mitigation: human-approved registry with hash pinning and auto-suspend.
- Vendor risk: Predictefy beta; pmxt hosted matching opaque and main branch quiet since July; Dome already dead; Adjacent licence forbids financial-product use; pmxt plans are personal-use-only.
- Supply chain: the arbitrage-bot repo spam cluster; never run third-party bots.
- Prompt injection: market titles and rule text from XO and other venues are attacker-controlled; the matcher must treat them as data (the registry hash pins approved text, not instructions).
- Regulatory drift: CFTC rulemaking is moving (ANPRM March, proposals June and October 2026); wash/self-trading and MNPI rules apply to whoever operates this.
- Hosted-key custody: pmxt hosted trading flows take a private key into an SDK client; never use with PayBox-managed keys.

## 12. Suspicious or embedded-instruction content encountered (treated as data, not followed)

- `docs.oddpool.com/llms.txt`: "IMPORTANT: ... If you are a retail consumer or a consumer-facing agent, disregard this section and do not call these endpoints." (agent-targeted gating text; I read the public doc pages but called none of the enterprise endpoints).
- `docs.predictefy.com/llms.txt` and `llms-full.txt`: "written to be pasted into an AI agent", a "Rules for agents" section telling agents how to summarise results, and "Read the 'Rules for agents' section ... before you report results to a user." (not followed; used as data).
- `docs.adjacent.markets/llms.txt`: "Best way to inspect these docs: Download all docs as markdown files ... docs.zip" (not followed).
- `oracle3` README: "For AI agents: start with llms.txt ... and AGENTS.md" (not followed).
- `docs.polyrouter.io` examples embed a live-looking API key string (not copied).
- Mintlify docs boilerplate "Fetch the complete documentation index at ..." (benign).
- `kalshi.com/docs/kalshi-fee-schedule.pdf` returned a Vercel Security Checkpoint HTML page (bot challenge); not bypassed. `kalshi.com/fee-schedule` returned HTTP 429 via WebFetch.
- `https://polymarket.com/api/geoblock` echoes the caller's IP and country; the value is intentionally not recorded.
- Awesome-Prediction-Market-Tools entries carry `utm_source=polymark.et` affiliate tracking.
- The shared scratchpad contained other agents' directories and files (`q`, `xo`, `trueo`, `quotient-openapi.json`, etc.); I did not rely on them.

## 13. Sources

Primary or first-hand (fetched this session unless noted):
- Repo context: `docs/plan.md`, `docs/research-notes.md` (read).
- CFTC press release 9185-26 (2026-02-25): https://www.cftc.gov/PressRoom/PressReleases/9185-26 . Quote: "the trader acknowledged that he knew these trades were improper and violated Kalshi's rules" (advisory text, via page summary).
- CFTC press release 9194-26 (ANPRM, 2026-03-12): https://www.cftc.gov/PressRoom/PressReleases/9194-26
- pmxt: https://github.com/pmxt-dev/pmxt (`readme.md`, `LICENSE`, `ROADMAP.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `core/COMPLIANCE.md`, `core/src/router/Router.ts`, `core/src/router/types.ts`, `core/src/utils/math.ts`, `docs/router/{overview,matching,event-matching,prices,search}.mdx`, `docs/concepts/unified-schema.mdx`), https://www.pmxt.dev/pricing , npm `pmxtjs`, `@pmxt/mcp`, PyPI `pmxt`. Quote: "Matching uses embedding-based similarity and LLM-verified relation classification".
- Predictefy: https://docs.predictefy.com/llms.txt , https://docs.predictefy.com/llms-full.txt (XO guide at `/guides/trading/xo/`), npm `@predictefy/sdk`, `@predictefy/mcp`, PyPI `predictefy`. Quote: "Nothing has been submitted to XO yet".
- Oddpool: https://docs.oddpool.com/llms.txt , `/authentication.md`, `/rate-limits.md`, `/arbitrage/overview.md`, `/arbitrage/current.md`, `/institutions/reference-data/{overview,response-fields,venues}.md`, `/institutions/reference-data/events/list.md`. Quote: "fungible ... true iff the event leg's basis_class == identical and divergence_axes == []".
- PolyRouter: https://docs.polyrouter.io/index.md , `/llms.txt`, `/api-reference/changelog.md`, `/api-reference/markets/list-markets.md`.
- Adjacent: https://docs.adjacent.markets/llms.txt , `/pricing.md`, `/explore/market-data.md`, `/explore/oracles.md`. Quote: "Neither plan permits redistribution or use in a financial product."
- Dome: https://docs.domeapi.io/index.md ; The Block article https://www.theblock.co/post/390546/polymarket-buys-fresh-prediction-market-api-startup-dome-marking-second-official-acquisition
- Polymarket docs: https://docs.polymarket.com/trading/fees.md , `/concepts/negative-risk.md`, `/concepts/resolution.md`, `/market-data/market-details.md`, `/api-reference/geoblock.md`; Gamma API `https://gamma-api.polymarket.com/markets` (public GET, field names `feeSchedule`, `feeType`, `negRisk`, `orderPriceMinTickSize`, `resolutionSource`, `umaResolutionStatus`). Quote: "fee = C x feeRate x p x (1 - p)".
- Kalshi docs: https://docs.kalshi.com/getting_started/{fee_rounding,market_settlement,market_lifecycle}.md , `/api-reference/market/get-series.md`; public API `https://api.elections.kalshi.com/trade-api/v2/series/{ticker}` and `/markets`. Quote: "Settlement fees are zero for simple yes/no determinations".
- XO docs via xo-docs MCP: `/guides/fees`, `/guides/wire-conventions`, `/product/rewards/maker-rebates`, `/product/policies/risk-and-eligibility`, `/product/portfolio/how-markets-resolve`, `/product/accounts/withdraw`, `/legal/terms-of-service`, OpenAPI `/openapi/api-reference/openapi.yaml`, `/openapi/data-api-reference/openapi.yaml`; public GETs to `https://orderbooks.xo.market/{markets,book,time}` and `https://api-mainnet.xo.market/api/markets`. Quote: "fee = C x (feeBps / 10_000) x p x (1 - p)".
- Papers: https://arxiv.org/abs/2508.03474 (read HTML), https://arxiv.org/abs/2601.01706 (read HTML). Quote: "semantic non-fungibility is a fundamental barrier to price convergence".
- Quotient: `https://quotient-api-gateway.onrender.com/openapi.json` (public GET), listings: OpenSea x402 Bazaar, bankrbot skills (search results only).
- GitHub metadata and READMEs (read-only via `gh api`): `YichengYang-Ethan/oracle3-prediction-market-agent` (`README.md`, `oracle3/arbitrage.py`, `oracle3/fees.py`), `rohanthomas1202/truthlayer`, `chainstacklabs/polyclaw`, `taetaehoho/poly-kalshi-arb`, `ImMike/polymarket-arbitrage`, `Oceanjackson1/Prediction-Market-Arbitrage-Compendium`, `aarora4/Awesome-Prediction-Market-Tools`, and metadata for the other repos in section 2.

Secondary (M/L):
- Law firm / press: Venable (https://www.venable.com/insights/publications/2026/04/kalshi-and-polymarket-move-to-curb-insider), Bloomberg headline 2026-03-23, Sidley, Greenberg Traurig, Ropes & Gray, Akin summaries of CFTC proposals (search results), Cointelegraph / Bankless / others on Trueo (2026-09-22), The Defiant / The Block on the UMA incident.
- Practitioner blogs: OddsShopper (2026-08-15) https://www.oddsshopper.com/articles/prediction-markets/kalshi-vs-polymarket-settlement-rules ; Convex Lake (2026-09-23) https://convexlake.com/blog/cross-venue-arbitrage-settlement-risk ; Prediction.com blog (2026-05-27) https://prediction.com/blog/best-api-for-prediction-markets ; Kairos comparison page.

---

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Method: each load-bearing claim was re-derived from the primary source (repo APIs, vendor docs, the xo-docs MCP, public unauthenticated GETs, CFTC pages, arXiv HTML), not from the sections above. Read-only; no PayBox tool called; no third-party code cloned or run; no key created; no POST/PUT/DELETE. WebSearch budget ran out part-way (shared session cap), so a few "search again" items could not be repeated and are marked as such. Tags: H = read first-hand this verification pass, M = secondary or inferred, L = weak.

Overall: the vendor/tool landscape, fee formulas, regulatory text and academic numbers largely check out. The most serious error is the **XO market-count and "thin venue" headline (V1/V2)**, which rests on the wrong slice of the Data API. Several NOT FOUND items were findable (V4, V5, V12). One fee-model discrepancy on XO is new and must be treated as fail-closed (V3).

### A. Refuted or corrected (act on these)

**V1. REFUTED (headline): "XO has 9 ACTIVE vs 1,322 CLOSED markets; capacity is tiny" (sections 0.2, 7, 9.7, summary).**
- The Data API `GET /api/markets` with no filter (marketScope `default`) returned only `type: 0` (STANDARD) rows on 2026-10-19: itemCount 1,346; the 1,335 rows I paged were CLOSED 1,316, ACTIVE 9, VOIDED_CLOSED 10, all type 0. The 9 ACTIVE are therefore the legacy STANDARD (LMSR AMM) catalogue, which the XO Data API OpenAPI says "are not tradable through the CLOB orderbook" (H, xo-docs `/openapi/data-api-reference/openapi.yaml`, "Market scope for market makers").
- The CLOB catalogue is a different slice: `GET /api/markets?marketType=2&statuses=ACTIVE` returned **itemCount 248** (all `resolutionType: MANUAL`); `marketType=3&statuses=ACTIVE` returned 4 (CLOB_PULSE); `marketType=2` (any status) itemCount 2,391; `marketScope=onlyClob` itemCount 46,454 (44,063 of them CLOB_PULSE short-horizon rounds). The highest all-time `totalVolumeInUSD` among the 248 is about $5.8M (volume ranks "contract notional", so treat as an upper bound). H (public GETs).
- Titles in the 248 include "Largest Company by Market Capitalization at the End of 2026", "Another Candidate to Win the 2027 French Presidential Election", "Will Ethereum Hit $3000 by December 31, 2026", 10-year Treasury yield, Ballon d'Or, Champions League and Nations League football (at least 134 of the 248 sit under SPORTS > Football subcategories: Champions League 54, UEFA Nations League 37, La Liga 18, Serie A 17, Premier League 8), Fed/interest-rate markets. That is far more matchable surface than "a few look matchable".
- The notes' own aside that Orderbook `/markets` lists 47,063 markets "but only 34 active among the first 4,000 scanned (different catalog; legacy entries likely)" was the right catalogue; the "legacy entries likely" inference is wrong. 34-in-4,000 reflects ordering of that listing, not the venue's true active count.
- Corrected statement: XO has about 248 ACTIVE CLOB markets plus 4 CLOB_PULSE and 9 STANDARD/AMM on 2026-10-19 (all MANUAL resolution). Replace "capacity is tiny (9 active XO markets)" in sections 0.2, 9.7 and the design implications. The "edge finder, not arbitrage engine" conclusion survives because resolution is MANUAL (basis_class settlement_source by default) and books are not free of spread, but the reason is semantic non-fungibility, not market count.
- Production note: the registry/adapter must query with `marketType=2` (or `marketScope=onlyClob`) and `statuses=ACTIVE`; the unfiltered default silently returns only the AMM slice.

**V2. CORRECTED: "sampled order books often one-sided with 1.5-16c spreads; 17 of 34 two-sided" (sections 0.2, 7).**
- Independent sample: 60 random markets out of the 248 ACTIVE CLOB markets, YES-token `GET /book?token_id=` on `orderbooks.xo.market`: 57 two-sided, 2 one-sided, 1 placeholder 0.001/0.999. Among the 57 two-sided: median spread 0.020, 45 had spread <= 0.05, 31 had spread <= 0.02; median ask notional within 5c of the best ask about $198, 40 of 57 had at least $100 within 5c, max about $45,000. A top-15-by-volume check also showed several wide books (0.01 bid / 0.68 ask) and some empty. M-H (single snapshot, YES token only, one run).
- So the original sample was unrepresentative. Depth is still uneven, but "one-sided or wide books" is not the typical case.

**V3. NEW DISCREPANCY (fail closed): XO live fee rate. Answers open question 1 only partly.**
- Formula is confirmed H: xo-docs `/guides/fees`: "fee = C × (feeBps / 10_000) × p × (1 − p)"; "Orders do not carry a fee rate".
- `GET https://orderbooks.xo.market/fee-rate?token_id=` returned `{"base_fee":0}` for every one of the 15 distinct YES tokens I sampled across ACTIVE CLOB markets (14 in the paired comparison below plus one more) (Finance, Culture, Politics, Sports/Football, Crypto, Esports). H.
- But the Data API market detail `GET /api/markets/{id}` carries `effectiveFeeConfig`, and in a random 25 of the 248: 16 had `takerFeeBps: 400`, 1 had `takerFeeBps: 800` (Esports), 8 had `takerFeeBps: 0`; `makerFeeBps` 0 everywhere; `curveModel: "FLAT_BPS"`. 400-bps markets were Sports/Football and Crypto. The docs describe `/fee-rate` as the source of truth, yet it returns 0 where `effectiveFeeConfig` says 400. These two XO surfaces disagree (or one is stale or applies later at settlement). Unresolved. H for each reading; cause unknown.
- Consequence: Example D (XO 0 / 400 / 700 bps) is a good envelope, but the edge module must treat XO fee as `max(/fee-rate, effectiveFeeConfig.takerFeeBps)` until reconciled by one real fill, and refuse to label anything "executable" while they disagree. Predictefy's "currently 0" matches only `/fee-rate`.

**V4. REFUTED (NOT FOUND item): "XO deposit/bridge documentation" and gate 6 wording "No documented deposit/bridge route found" (sections 7, 11; gate 6).**
- xo-docs `/product/accounts/deposit` documents three funding routes: deposit from a connected external EVM or Solana wallet (XO "obtains a quote, transfers through the funding provider, and credits USDC to your smart wallet"), "Transfer crypto" to a per-account deposit address on a selected network, and "Use cash" via card/Apple Pay/Google Pay with a third-party provider. Statuses in `/product/accounts/transfer-states`. `/documentation/introduction` ("Start here"): create the smart account at beta.xo.market, deposit via the deposit flow, approve the CTF Exchange for XO USDC and Conditional Tokens, check `/balance-allowance`. `/product/accounts/wallets`: funding the external owner wallet "does not make the XO smart wallet tradable". H.
- Still NOT FOUND (re-searched `rg` for minimum/maximum/supported asset/network/provider across `/product`, `/guides`, `/documentation`): the list of supported deposit assets/networks, minimums/maximums, the funding provider's name, and any programmatic deposit API. So gate 6 stays "partial", but the correct finding is "documented as an in-app flow only; no programmatic route and no limits documented", not "no route documented". Whether a PayBox wallet can fund the XO smart wallet remains the release-blocking unknown.

**V5. REFUTED (NOT FOUND item): Polymarket US fee formula (sections 6.1 and 11).**
- Primary regulatory source: QCX LLC d/b/a Polymarket US, weekly rule-amendment notification to the CFTC dated 2026-07-07 (https://www.cftc.gov/filings/orgrules/rules0707269057.pdf, 2 pages, text extracted with PDFKit): "increasing the taker fee coefficient, Theta, from 0.05 to 0.06"; "Fee = Θ × C × p × (1 - p)"; exhibit: "Effective 12:00 AM ET July 1, 2026"; taker 0.06 (max $1.50 per 100 contracts at p=0.50), maker rebate coefficient -0.0125. H. So Polymarket US is one flat exchange-wide theta (0.06 as of the filing), not the category table of Polymarket international. It may have changed since July (weekly filings); read the live Fee Schedule before use.

**V6. UPGRADED + EXTENDED: Kalshi fee coefficients (section 6.1, "M for the 0.07 / 0.0175 coefficients").**
- The 0.07 taker coefficient is derivable first-hand from Kalshi's own docs: `docs.kalshi.com/getting_started/fee_rounding.md` worked example "buy has -$0.055000 of signed revenue and a model fee of $0.00363825"; 0.07 × 0.055 × 0.945 = 0.00363825 exactly. So 0.07 is H for taker at multiplier 1 (maker 0.0175 remains M, from oracle3). The official fee-schedule PDF was not retrieved (not bypassed).
- MISSED: Kalshi fees can be overridden per **event** and scheduled to change. `docs.kalshi.com/api-reference/events/get-event-fee-changes.md`: "Event fees are an override layered on top of the parent series' fee structure. If `fee_type_override` and `fee_multiplier_override` are null, that indicates the override is cleared." and `GET /series/fee_changes` with `scheduled_ts` (H). The notes only say to read series `fee_type`/`fee_multiplier`; the adapter must also apply event overrides and scheduled changes. Series values re-confirmed live: KXFED and KXNBAGAME `quadratic_with_maker_fees`, KXINX and KXHIGHNY `quadratic`, multiplier 1; KXHIGHNY settlement source "The Weather Company" (H).

**V7. CORRECTED: Polymarket category table (section 6.1) is incomplete for Sports.**
- The docs table (re-read, H) says Sports 0.05, but live Gamma `feeSchedule` on the top ~600 active markets by 24h volume (1,107 with a schedule) shows by `feeType`: `sports_fees_v3` 0.05, `sports_fees_nfl_cfb_oct26` 0.03, `sports_fees_v2` 0.03, `politics_fees` 0.04, `crypto_fees_v2` 0.07, `culture_fees`/`weather_fees`/`economics_fees`/`general_fees` 0.05, `finance_prices_fees`/`tech_fees` 0.04; 93 of 1,200 rows had `feesEnabled: false`/no schedule. All exponents were 1 (re-confirms that NOT FOUND). Rebate rates 0.15 to 0.25. H. Conclusion for the design is unchanged and strengthened: read `feeSchedule` per market, never use a category default.

**V8. CORRECTED: "popular bots hard-code Polymarket zero fees" (sections 0.3, 2).**
- True for `taetaehoho/poly-kalshi-arb` (README line 173: "Polymarket: Zero trading fees", H).
- False for `ImMike/polymarket-arbitrage`: `config.yaml` has `taker_fee_bps: 150` ("Polymarket rates - conservative estimates", 1.5% flat) and `core/cross_platform_arb.py` defaults `polymarket_taker_fee: 0.015` and `kalshi_taker_fee: 0.01`. Flat percent of notional rather than the p(1-p) curve, so still wrong, but not zero. The "text similarity, min_match_similarity 0.6" claim is confirmed. Metadata confirmed: taetaehoho 445 stars, no licence, last push 2025-12-21; ImMike 295 stars, no licence, last push 2025-12-09; oracle3 Apache-2.0, 473 stars, last push 2026-10-12; homerun AGPL-3.0, 205 stars, 2026-08-21 (H).

**V9. CORRECTED: gate 9 caveat "positions/fills still need authentication or the explorer" (gate 9, section 7).**
- Positions are public: xo-docs Data API `GET /users/portfolio?user=<wallet or username>` is "Unauthenticated variant of /users/me/portfolio"; "Private profiles return an empty paginated result"; plus the unauthenticated Socket.IO namespace `/portfolio-public`. Fills/trades: Orderbook `GET /trades` requires `L2HMAC` ("Paginated trades visible to the caller"); `/live-activity/events/{condition_id}` is documented as "Currently a stub — always returns `[]`". Public price endpoints exist that the notes did not list: `/prices-history`, `/last-trade-price`, `/last-trades-prices` (security null). H (OpenAPI via xo-docs MCP). The "no public trade tape" NOT FOUND is confirmed; gate 9 stays answered-go, with positions readable publicly (not tested live against a real wallet).

**V10. CORRECTED: ToS conflict analysis (gate 7, section 7, design implication 8).**
- Quotes confirmed H: ToS line 49 "wash trading (engaging in trades with yourself or colluding with others to create artificial activity or false liquidity)"; line 57 "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system".
- The plan's decision (docs/plan.md line 70) is "creator trading its own market", which is not by itself "trades with yourself". The clause that actually bites is missed: ToS "No Insider Trading and Unfair Information Advantage": "You must not engage in trading ... where you have direct or indirect influence over the outcome of a market." Every market in the Data API sample is `MANUAL` resolution with a creator-specified `resolverAddress`, so a creator trading its own market is exposed to this clause as well as to the wash-trading clause if its own orders cross. Recommend recording both clauses against the plan's "self-trading always allowed" decision. (H for text; legal reading is mine and unverified.)

**V11. OPERATIONAL FACTS the notes lack or get wrong (Data API / Orderbook), all H from live calls on 2026-10-19:**
- Data API `take` page size: the OpenAPI says max 1000; live caps at 50 (`take=100` returns 400 `validations.MAXIMUM_NOT_OBSERVED`; 50 works).
- The default Python-urllib User-Agent got HTTP 403 from `api-mainnet.xo.market`; a curl-style User-Agent works. Production adapter needs an explicit User-Agent.
- HTTP 429 `Rate limit exceeded` appeared after roughly 35 sequential requests over about 20 seconds from one IP (possibly shared with other agents' traffic), so treat the documented "100 requests per 10 s per IP" as an upper bound.
- Live statuses include `VOIDED_CLOSED` (10 rows), which is not in the OpenAPI enum (`PENDING, ACTIVE, PAUSED, CLOSED, RESOLVED, VOIDED`); the researcher's "VOIDED 0" is consistent only because the label differs.
- The OpenAPI says `default` scope = STANDARD + CLOB, but live `default` returned only type 0 (see V1).

**V12. REFUTED (open question 2): machine-readable XO rules.**
- `GET /api/markets/{id}` (detail; list rows carry `rules: {}`) returns `rules.description` (full verbatim rule text, deadline, tie-break, named source URLs), `rules.outcomeRules`, `resolutionSources` (array of URLs, e.g. companiesmarketcap.com), `resolverAddress`, `resolutionType`, `resolutionEvidence`, `metadataUri`, `effectiveFeeConfig`, `creatorBps`, `reviewStatus`. So rule text and named source are available programmatically for the hash-pinned registry; the notes' "rules was empty" came from list rows only. H.

**V13. CORRECTED/EXTENDED (landscape): "Predictefy is the only aggregator that lists xo".**
- PredictionTalk (https://predictiontalk.org) also lists XO Market among six compared venues (Kalshi, Polymarket, Predict.fun, Limitless, XO Market, Opinion) and publishes a "Public API" at `/api/v0/` described as "Aggregated TVL, volume, fees and per-platform data across all tracked prediction-market venues", updated daily. It is a reference/comparison hub, not a price or order-book aggregator and has no arbitrage feature mentioned. predictionmarket.tools lists XO as a "Trading Interface" (Feb 25, 2026) with no API. A search for open-source XO tooling also surfaces tiny unvetted repos (`klumpfuss1234/xo-market-tui`, MIT, 0 stars, created 2026-10-09; `Adi9876/XO-Market-Bot`, no licence); not read or run. M-H.
- Parsec (NOT FOUND in notes): directory and rival-comparison pages describe it as a Polymarket-only analytics dashboard, Blockworks Research-backed, no confirmed public API (M, search summaries; HTML sites not read). Verso: pm.wiki pages describe an analytics layer over Kalshi + Polymarket, no API/pricing found (M, still effectively NOT FOUND). Neither covers XO.

### B. Items confirmed (independent re-derivation, H unless noted)
- pmxt: MIT (LICENSE file, PyPI MIT); created 2026-01-08; 2,170 stars; npm and PyPI latest 2.54.0 published 2026-07-18; last `main` commit 2026-07-18 ("docs: auto-update for v2.54.0"); other branches pushed to 2026-09-30. Note: the GitHub release tags carry an `f` suffix (`v2.54.0f`), not `v2.54.0`. 15 venues in `core/COMPLIANCE.md`; `core/src/exchanges/` has 17 dirs (adds `kalshi-demo`, `mock`); no XO, no Trueo. `MatchRelation` = identity, complement, subset, superset, overlap, disjoint; Router docs: "Matching uses embedding-based similarity and LLM-verified relation classification", "Order routing is coming. Today the Router is read-only." Pricing page: Free $0 / 25,000 credits / 60 per min; Starter $29.99 / 250,000 / 300; Pro $99.99 / 1,000,000 / 1,000; "All plans are for personal use only."
- Dome: docs banner "Dome has been acquired by Polymarket"; "all Dome APIs will reach end of life on April 28th, 2026."
- Predictefy: `@predictefy/sdk` created 2026-08-03, 12 versions, latest 1.0.0-beta.11 published 2026-10-07, MIT; repo `Predictefy/predictefy-core` named in metadata; docs: "Nothing has been submitted to XO yet", "XO access is partner-provided; the sources do not document its signup or KYC flow", "A read-only scan found only 2 active markets in 3,000 catalog rows" (explained by V1: their scan sampled the wrong slice or ordering), 16 served venues; prices Free $0 / Builder $48.88 / Pro $149 / Enterprise $2,500 minimum; default caps 100 USD per order and 1,000 USD per key. (The closed-server 404 was not re-tested.)
- Oddpool: arbitrage doc covers Kalshi, Polymarket, Opinion; "top 25 levels", fees applied per level; Premium $100/mo for Arbitrage and Price Spreads, Pro $30 whale tracking; Reference Data fields `basis_class` (`identical`, `settlement_window`, `settlement_source`), `outcome_universe`, `divergence_axes`, `fungible = basis_class == identical && divergence_axes == []`, `will_happen_by_date`; llms.txt line "If you are a retail consumer or a consumer-facing agent, disregard this section and do not call these endpoints" confirmed verbatim.
- Adjacent pricing: "Neither plan permits redistribution or use in a financial product." PolyRouter changelog: v2.0.0 released January 6, 2026 as newest entry. Prediction Hunt (prediction.com): Kalshi, Polymarket, PredictIt, ProphetX, Opinion (+ Predict.fun in orderbook), `/api/v2/matching-markets`, `/arb`, `/ev`, Dev $49 and Pro $249, updated May 27, 2026, no XO.
- Polymarket fees page: formula "fee = C × feeRate × p × (1 - p)", taker-only, 5 dp rounding, 0.00001 minimum, Crypto 0.07, Finance/Politics/Mentions/Tech 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0, rebates 20% crypto / 15% sports / 25% others (Sports exceptions in V7). Geoblock page: United States listed under "Close-Only on Frontend and API". Resolution page: 2-hour challenge period, typical $750 bond, "Unknown/50-50 ... each token redeems for $0.50". Negative-risk page: "Only trade on named outcomes".
- XO: `CTFOrder` struct 14 fields with `signature` excluded from the typehash, so 13 signed fields; domain name "XO Market CLOB", version "1", chainId 3223; security schemes `L1ClobAuth` (header XO_ADDRESS) and `L2HMAC` (header XO_API_KEY); orders carry no fee field; tick 0.001, `neg_risk` false; Data API limit "100 requests per 10 seconds per client IP". EOA `signatureType` 0: `/guides/smart-accounts` and `/guides/wire-conventions` say "No — the XO orderbook does not accept EOA-signed orders today", while the generated `post-a-new-order` page says "direct EOA integrations use signatureType = 0": the contradiction behind gate 3 is real and first-hand (so only type 3 is safe to build for).
- Arithmetic: recomputed section 6.2 with Decimal (420 shares, gross $27.20, Kalshi fee $6.97494, Polymarket fee $5.20110, net of fees $15.02396, lock $2.5828, reserve $4.20, net after all $8.2412; step 4 net -0.0056) and sections 6.3 to 6.5 by hand: all correct.
- Papers: Saguillo et al. (2508.03474): combined extraction "$39,587,585.02", top account $2,009,631.76 over 4,049 transactions, 46,360 pairs, 374 manually checked, 11 + 2 = 13 combinatorial pairs, 353 no-JSON + 4,374 invalid = 4,727 unusable; abstract says "40 million USD". Gebele and Matthes (2601.01706, submitted 5 Jan 2026): "roughly 6% of all events are concurrently listed", "execution-aware price deviations of 2-4% on average", text-embedding-3-large, k = 20, ">99.9%" within top 20, 102,275 events, ~200M tokens, Appendix table Kalshi 1.5%, Polymarket CLOB 0%, Truemarkets 0.8%, "1,218.66% over 800 days ... 15 completed trades".
- CFTC: 9185-26 dated February 25, 2026, "CFTC Enforcement Division Issues Prediction Markets Advisory"; contains "Pre-arranged, noncompetitive trading and wash sales", "disruptive trading pursuant to Section 4c(a)(5)", "insider trading"; no mention of automated trading, algorithmic, bots or arbitrage. Precision: it says "wash sales", not "wash trading". 9194-26 dated March 12, 2026, 91 FR 12516, 45-day comment period, no manipulation/automated terms. 9193-26 "CFTC Staff Issues Prediction Markets Advisory", March 12, 2026, links Staff Letter No. 26-08 (now H, was M).
- Venable confirms both Kalshi and Polymarket announced measures on March 23, 2026, but its text lists only the information-duty and "people who can influence outcomes" prohibitions and Kalshi's guardrails; it does not mention automated trading.
- Quotient OpenAPI (`quotient-api-gateway.onrender.com/openapi.json`): title "Quotient API", version 20.5.0, 27 paths, venue enum polymarket, polymarket_us, kalshi, hl_outcomes (no XO), `/api/v1/markets/mispriced` x402 fixed price 0.02. Provenance of the host remains third-party listings only (a skills.sh listing names the same base URL, `/openapi.json`, `/api/public/pricing`, `/llms.txt`); no official site found.

### C. Unverifiable or not re-checked
- Kalshi: official fee-schedule PDF text; maker coefficient 0.0175 and the "combo variant 0.5 maker multiplier"; any index-market multiplier (0.035); exact per-order rounding granularity beyond the docs excerpt.
- Polymarket 2026-03-23 rulebook detail: the list "spoofing, wash trading, fictitious transactions, front-running, self-dealing" is not in the Venable text and was not found in a primary Polymarket page (docs.polymarket.com llms.txt index has no rulebook page). Treat as L. The Polymarket rulebook was not read. Polymarket US category/taker rules beyond V5 not checked.
- Date Polymarket started category taker fees: a guide seen in a search result says "March 2026"; could not be re-checked (WebSearch budget exhausted). Still effectively NOT FOUND at primary level.
- Oddpool "Polymarket 0.055 vs Opinion 0.21" sanity remark, OddsShopper/Convex Lake figures (32.4% vs 61.8%), the UMA March 2025 incident, Cointelegraph/Bankless Trueo migration (2026-09-21/22 is corroborated by search summaries), DefiLlama Trueo TVL, Trueo = True Markets identity, Kairos/Matchr/Converge/TradeFox claims, the "near-duplicate bot repo spam cluster" (inference), XO inactive-market price sum 0.881 + 0.58 (single market, not re-found), Awesome-Prediction-Market-Tools `utm_source` tracking. No contradicting evidence found; no independent confirmation attempted.
- Predictefy repo 404 and Quotient accuracy claims ("8.2% more accurate") are vendor claims and stay L.
- 2026 regulatory items: search surfaced a Bloomberg headline dated 2026-09-22 ("CFTC Warns Prediction Markets to Reel in Risky 'Mention' Bets") and a CFTC customer advisory about trading bots; neither was opened. Neither is specific to cross-venue arbitrage, so the NOT FOUND for an automated-arbitrage advisory is not overturned, but the 2026-09 mentions-contract advisory is a missed regulatory data point (relevant to Polymarket "Mentions" markets).

### D. Secrets and addresses check
- Scanned this notes file with regexes for 0x addresses, 64-hex strings, API-key-like strings, passwords, private-key/secret assignments, IPv4 addresses and email addresses: no matches. The file records no wallet addresses, balances, keys or IPs. This verification section also records none (the Polymarket US CFTC filing contact email and an Oddpool contact email seen in source text were deliberately not copied).
- Embedded-instruction check: the Oddpool llms.txt gating sentence and Predictefy `llms.txt` ("written to be pasted into an AI agent", "Read the 'Rules for agents' section at the end before you report results to a user", at line 425) are present exactly as reported; neither was followed. The XO docs MCP server instructions about calling `submit_feedback` were not acted on. No additional embedded instructions found in the pages I read.

### E. Verification sources (this pass)
- XO: xo-docs MCP `/legal/terms-of-service.mdx` (lines 49, 57), `/guides/fees.mdx`, `/guides/smart-accounts.mdx`, `/guides/wire-conventions.mdx`, `/documentation/introduction.mdx`, `/api-reference/introduction.mdx`, `/product/accounts/{deposit,withdraw,wallets,transfer-states}.mdx`, `/openapi/data-api-reference/openapi.yaml` (paths `/markets`, `/users/portfolio`, "Market scope for market makers"), `/openapi/api-reference/openapi.yaml` (paths, CTFOrder, securitySchemes); public GETs to `https://api-mainnet.xo.market/api/markets` (default, `marketType=0|2|3`, `statuses=ACTIVE`, `marketScope=onlyClob|onlyClobPulse|withClob`), `/api/markets/{id}`, and `https://orderbooks.xo.market/{book,fee-rate,time}`.
- Polymarket: https://docs.polymarket.com/trading/fees.md, /api-reference/geoblock.md, /concepts/resolution.md, /concepts/negative-risk.md, /market-data/market-details.md; Gamma `https://gamma-api.polymarket.com/markets?active=true&closed=false` (1,200 rows sampled). Polymarket US: https://www.cftc.gov/filings/orgrules/rules0707269057.pdf.
- Kalshi: https://docs.kalshi.com/llms.txt, /getting_started/{fee_rounding,market_lifecycle}.md, /api-reference/events/get-event-fee-changes.md, /api-reference/exchange/get-series-fee-changes.md; `https://api.elections.kalshi.com/trade-api/v2/series/{KXFED,KXINX,KXNBAGAME,KXHIGHNY}`.
- Tools: GitHub API for pmxt-dev/pmxt (repo, releases, commits, branches, tree, `core/COMPLIANCE.md`, `LICENSE`, `docs/router/overview.mdx`, `core/src/router/types.ts`, `docs/concepts/unified-schema.mdx`), YichengYang-Ethan/oracle3-prediction-market-agent (`oracle3/fees.py`, license), taetaehoho/poly-kalshi-arb (README), ImMike/polymarket-arbitrage (`config.yaml`, `core/arb_engine.py`, `core/cross_platform_arb.py`), homerun, polyclaw, truthlayer, Awesome-Prediction-Market-Tools metadata; npm registry (`pmxtjs`, `@predictefy/sdk`), PyPI `pmxt`; https://www.pmxt.dev/pricing; https://docs.predictefy.com/llms.txt, /llms-full.txt, /guides/credits/; https://docs.oddpool.com/{llms.txt,authentication.md,arbitrage/current.md,institutions/reference-data/response-fields.md}; https://docs.adjacent.markets/pricing.md; https://docs.polyrouter.io/api-reference/changelog.md; https://prediction.com/blog/best-api-for-prediction-markets; https://docs.domeapi.io/index.md; https://predictiontalk.org/ and /api/v0/; https://www.predictionmarket.tools/; Quotient `https://quotient-api-gateway.onrender.com/openapi.json`.
- Regulatory and papers: https://www.cftc.gov/PressRoom/PressReleases/{9185-26,9193-26,9194-26}; https://www.venable.com/insights/publications/2026/04/kalshi-and-polymarket-move-to-curb-insider; https://arxiv.org/abs/2508.03474 and /html/2508.03474; https://arxiv.org/abs/2601.01706 and /html/2601.01706v1.
