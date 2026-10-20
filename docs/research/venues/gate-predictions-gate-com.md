# Gate Predictions (Gate.com) - venue spec

Researched 2026-10-19. Read-only: public web pages (WebFetch), WebSearch, `gh api` for public GitHub files, unauthenticated GETs to Polymarket's public builder feeds and the DefiLlama public API. No account, no wallet, no POST, no signing, no payments, no browser automation. Generic User-Agent only (`insurance-markets-research/0.1`).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip** (as a venue adapter).
- "Gate Predictions" is **Gate's front end to Polymarket**, not a venue. Gate's own page says "Powered by Polymarket" and its announcement calls it the first centralized exchange to integrate Polymarket (H, Sources 1, 2). Orders carry a Gate **Polymarket builder code** and are matched on Polymarket's own CLOB (H for the attribution mechanism, Sources 6, 8; the page that says builder orders go to "Polymarket's CLOB" is H, but Polymarket never states the same-book point in so many words, see Shared liquidity).
- It therefore has **no independent liquidity** and can never be an independent arbitrage leg. Every price, book and fill is Polymarket's.
- It has **no public API for prediction markets**: Gate API v4 has no prediction or event-contract endpoints (H, Source 4), the Gate developer page lists none (H, Source 3), and scripted GETs to gate.com return an Akamai "Access Denied" 403 (H, own curl).
- Residual value for the project: (a) a registry alias row so the aggregator can label Gate-routed flow, (b) an optional, public, unauthenticated feed of Gate-attributed Polymarket trades (builder code filter) that can be folded into the Polymarket adapter as a flow signal, (c) one adjacent lead, **Gate Event Contracts**, which is a separate Gate-native product (see Open questions).

## Liveness (still live in 2026?)

Live, but volume is well below its mid-2026 peak.

- https://www.gate.com/en/prediction rendered on 2026-10-19 with October 2026 markets (Fed October decision, Bitcoin/Ethereum/WTI price targets, NFL/NBA/EPL/UCL, esports, Musk tweet counts, GTA VI trailer views) and "Powered by Polymarket" (H, Source 1; fetched through a summarising tool, so market names are H-for-existence, not a market-by-market audit).
- Gate-attributed trades are being matched right now: the first page of Polymarket's builder-trades feed for Gate's code had trades timestamped up to 2026-10-19 00:46 UTC when fetched (H, Source 7, fixture).
- DefiLlama (protocol id 7998, category "Interface", tag "Polymarket Builder", chain Polygon) has daily USD volume through 2026-10-17: 24h $1.24M, 7d $6.76M, 30d $28.53M (H, Source 5, fixture). A search-engine snippet quoted "$53.14M" 30d from an earlier window; I could not reconcile it and treat it as stale (L).
- Timeline: Polymarket builder feed shows Gate volume starting 2026-03-16; Gate announced the integration 2026-03-24 as a "public beta" in the Gate App 8.12.5+ under Alpha (H, Sources 2, 6). Gate Research (2026-05-09) and Gate promo pages (World Cup campaign 2026-06-04 to 2026-07-21) describe it as ongoing (H, Sources 10, 11).
- Staleness flags: the launch announcement (2026-03-24) is about 6.8 months old, so its product details (App version, "beta") may have changed; the Gate Learn explainer was last updated 2026-05-12.

## Kind and market model

- Kind: **CEX product / broker front end to Polymarket** (H, Sources 1, 2). Two access routes, both ending on Polymarket (H, Source 2):
  1. **Gate account route (custodial).** Trade with USDT from the Gate spot account, "no on-chain steps"; positions appear next to spot balances; after settlement, winners claim in one action and are credited 1:1 in stablecoin to the spot account.
  2. **Web3 wallet route (self-custodial).** Connect a wallet and trade Polymarket on Polygon with USDC. Gate's promo FAQ says users pay no gas ("platform covers network fees") and orders are placed with "wallet offline signatures" (H, Source 11), which is the Polymarket signed-order flow.
- Two UI modes: "Prediction mode" (probabilities, odds) and "Trading mode" (order book, charts, market and limit orders, quick trade) (H, Source 2).
- Market model is **whatever Polymarket lists**: binary Yes/No shares priced 0 to 1 (Gate's example: Yes at 0.65 means roughly 65%), negative-risk multi-outcome events, price-threshold and sports spread markets, 5-minute-style Up/Down markets; order-book CLOB, not an AMM (H for Gate's description, Source 2; details of tokenisation from the Polymarket notes in `docs/research/08-venues-polymarket-kalshi.md`: ERC-1155 outcome tokens on Polygon, one book per outcome token, CTF and V2 PositionManager ledgers [H there]).
- Which Polymarket markets Gate lists is **not documented**. The Gate page showed a curated-looking subset (M, from a summarised render); Gate's announcement says "Featured topics, sports, crypto, finance". Do not assume full catalogue parity.
- Custody for the Gate-account route is **not stated**. Gate's explainer describes a "centralized account system" using "account assets" (H that this is the wording; the inference that Gate holds the on-chain positions in pooled accounts is M, see Liquidity for the evidence).

## Chains and collateral

- Chain: **Polygon (137)** for everything on-chain (H, DefiLlama chain field, Source 5; Gate announcement, Source 2).
- Gate-account route: **USDT** in the Gate spot account (H, Source 2). How Gate converts to Polymarket collateral, and where it holds the resulting tokens, is not documented (NOT FOUND).
- Wallet route: **USDC on Polygon** per Gate (H, Source 2). Polymarket's own collateral since CLOB V2 (2026-04-28) is **pUSD** (ERC-20 on Polygon, 6 decimals, backed by USDC) with wrap/unwrap via on-chain onramp/offramp contracts (H in `docs/research/08-venues-polymarket-kalshi.md`; Polymarket's builder-fee page uses "pUSD" in its worked example, H, Source 8). Gate's "USDC" wording is probably simplified (M).

## Read API

Official: **none for Gate Predictions** (NOT FOUND, searched: Gate API v4 docs both halves, gate.com/gate-api developer page, `gate/gate-mcp` README, gateio GitHub, web search for "Gate API prediction"). Details:

- Gate API v4 (https://www.gate.com/docs/developers/apiv4/en/; base `https://api.gateio.ws/api/v4`): sections are Spot & Margin, Perpetual Futures, Delivery, CFD, Stock, Options, Unified, Alpha, CrossEx, Agent, Announcements. The only "Polymarket" string is a boolean `polymarket_limit` on P2P merchant ad endpoints (v4.106.102, 2026-06-26): "whether to restrict trading with Polymarket users". No prediction/event-contract endpoints (H, Source 4; the page is about 198K characters and was read through a summariser in two halves, so "no match" is high but not perfect confidence).
- Gate MCP (`api.gatemcp.ai`, GitHub `gate/gate-mcp`, last push 2026-09-10): public market data, CEX trading (OAuth2, 400+ tools), DEX, info, news (a "prediction markets" category, 18 tools), docs. The README lists no prediction-market trading or book tool (H, Source 9). I did not call the MCP endpoints.
- gate.com itself: scripted GET of `/en/prediction` and `/gate-api` returned `403 Access Denied` from the CDN with the generic UA (H). I did not try to bypass. Any front-end JSON the site uses is undocumented and not a supported surface.

Derived read surfaces that **are** public and unauthenticated (all on Polymarket or DefiLlama, not Gate):

| Surface | Use | Confirmed |
|---|---|---|
| `GET https://clob.polymarket.com/builder/trades?builder_code=0x2c6624a23b16a2a69acd14c87b7fc03906870c851fa0a7b7f9d7be0fbbedea8a` | Gate-attributed fills: `id, tradeType, takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Envelope `{data, next_cursor, limit, count}`, 300 per page, cursor sentinel `LTE=`. Optional `market`, `asset_id`, `before`, `after`, `next_cursor`, `id`. | H, 2026-10-19, 300 rows returned; docs say no auth (Source 7). `builderFee` and `builderCode` appear live but are not in the documented required-field list. |
| `GET https://data-api.polymarket.com/v1/builders/volume` (17 MB, all builders, daily) | Daily volume and activeUsers per builder. **v1 retires 2026-10-24** (per the DefiLlama adapter comment and the Polymarket notes); v2 is `GET /v2/builders/volume?interval=day&limit=90` returning `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`, latest 90 daily buckets only. | H, both live 2026-10-19 (fixtures) |
| `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY\|WEEK\|MONTH\|ALL` | Ranking. Observed `MONTH` = calendar month to date, not trailing 30 days (Gate's $37.91M equals the sum of its 2026-10-01..10-18 daily rows). | H |
| `GET https://api.llama.fi/summary/dexs/gate-predictions` | USD daily volume series (derived from builder trades). | H |

- Market data (books, prices, trades, resolution) for the markets themselves: use the Polymarket adapter (Gamma + CLOB + WS, documented in `docs/research/08-venues-polymarket-kalshi.md`). Nothing Gate-specific is needed.
- Auth and rate limits: none needed for the feeds above. Polymarket rate limits not re-measured here; Gate REST limits for prediction: NOT FOUND (no such endpoints).
- WebSocket: none for Gate Predictions (NOT FOUND). Use Polymarket's.
- Resolution data: Polymarket's (UMA Optimistic Oracle for most markets, Chainlink TWAP for Up/Down) per the Polymarket notes (H there). Gate publishes no separate resolution feed.

## Trade path

- **Programmatic path through Gate: none.** No documented order, cancel or position endpoint for prediction markets in Gate API v4 or Gate MCP (NOT FOUND, see Read API). The Gate-account route needs a Gate login (App 8.12.5+, under Alpha) and KYC for at least the promotional rewards (H, Sources 2, 11). Using the CEX route from an agent would mean automating the Gate App/web UI, which I do not recommend and did not test.
- **Wallet route = Polymarket.** Orders are EIP-712 signed by the user's wallet and submitted with a `bytes32` builder code inside the signed order (H, Source 8). That is exactly the Polymarket CLOB flow; Gate adds only its builder code. Anything an agent can do on Gate's wallet route it can do on Polymarket directly. Signing scheme, L1/L2 auth and wallet types (Deposit Wallet, `signatureType 3` for wallets created on or after 2026-05-04) are in `docs/research/08-venues-polymarket-kalshi.md`.
- The builder code is chosen by whoever submits the order. There is no reason for the aggregator to use Gate's code.

## PayBox reachability

- **Gate-specific: no.** Nothing Gate-specific is reachable from a PayBox wallet: the custodial route needs a Gate account and has no API, and the wallet route is plain Polymarket.
- The equivalent exposure is reachable (with caveats) by trading **Polymarket directly** from an EVM wallet on Polygon with EIP-712 order signing. PayBox's `request_wallet_sign` has a typed-data intent and the chain catalog listed Polygon (137) in `docs/research/06-paybox-platform.md` (H, 2026-10-19 there); whether PayBox will sign Polymarket's order/auth typed data for an arbitrary `verifyingContract` is untested (see the Polymarket and PayBox notes). Not re-checked here (PayBox calls out of scope).

## Fees

- Polymarket platform fees apply, because the order is a Polymarket order. Formula: taker only, `fee = C x feeRate x p x (1 - p)` (shares C, price p), makers never charged, per-market `feeSchedule` is authoritative; geopolitics 0 (H in `docs/research/08-venues-polymarket-kalshi.md`). In the 300-trade Gate sample, `feeUsdc` was non-zero on 299 and totalled $200.22 on $9,427 of fee-bearing notional (about 2.1% of USD notional; the sample is dominated by Up/Down crypto markets, which carry the highest rate) (H, computed from Source 7).
- **Gate's own fee: not confirmed.**
  - Polymarket builder-code fees (taker up to 100 bps, maker up to 50 bps, additive to platform fees, H, Source 8): `builderFee` was **0 on all 300 sampled Gate trades** (H, own computation). So Gate does not currently charge via the builder code, at least on this sample and date.
  - A third-party directory (PolyMart, not affiliated) claims "Gate charges a flat 0.8% on both maker and taker sides" on the CEX route and nothing extra on the wallet route (L, Source 12). 0.8% on makers would exceed the 0.5% builder-fee ceiling, so if true it is charged on Gate's side, outside the builder code. I found no Gate-authored fee page (NOT FOUND, searched: Gate announcement, Gate Learn explainer, promo FAQ, web search for the fee). Gate's own pages say nothing on fees (H that they are silent).
- Costs that are not fees: USDT to pUSD conversion spread on the CEX route (undocumented), pUSD wrap/unwrap and Polygon gas on any direct wallet use, time-value lockup until settlement.
- For edge maths: model Gate as "Polymarket fees + unknown Gate fee"; it is strictly worse than trading Polymarket directly unless the user is locked into Gate.

## Resolution mechanism and dispute risk

- Markets resolve exactly as on Polymarket: UMA Optimistic Oracle (proposal with bond, 2-hour challenge, escalation to UMA DVM vote; undisputed about 2 hours, disputed 4 to 6 days; 50/50 outcomes possible) and Chainlink TWAP for Up/Down markets (H in `docs/research/08-venues-polymarket-kalshi.md`). A Gate-hosted guide also names UMA's Optimistic Oracle (M, Source 13, seen only through a search summary).
- Gate says winners are credited 1:1 in stablecoin to the spot account after settlement (H, Source 2). How Gate handles disputed markets, 50/50 payouts, delays, or void markets for CEX-route users: NOT FOUND (searched: announcement, Learn explainer, promo FAQ).
- Extra risk beyond Polymarket on the CEX route: platform/custody risk (Gate holds the balance and presumably the tokens) and Gate-side listing/delisting discretion. Gate's own risk text: all trading carries risk; prices can be unpredictable (H, Source 1).

## Geo, ToS and automation

- Gate: "may restrict or prohibit certain services in specific jurisdictions" and users must follow local rules; refers to the User Agreement (H, Source 2). The promo FAQ refers to "Restricted Locations" in the User Agreement (H, Source 11). I could **not** retrieve the User Agreement or a country list (NOT FOUND, searched: gate.com announcements, Learn, blog; search engine). Do not infer Gate's list from Polymarket's.
- Polymarket's own geoblock and US/international split are in the Polymarket notes. How Polymarket's geoblock treats orders relayed by Gate's servers vs. a user's wallet: NOT FOUND.
- KYC: required to claim promotional rewards (H, Source 11); general KYC for the Gate account route is implied by it being a Gate exchange account (M). Not stated for the wallet route.
- Automation: no prediction API means no sanctioned automation path. Promotional-reward rules (not general ToS) exclude "sub-accounts, market maker, corporate, institutional, and agent accounts" from rewards (H, Source 11; quote limited to this one line, and it applies to the promotion only). Gate's general API ToS for automated prediction trading: NOT FOUND.
- Scripted access to gate.com is blocked by the CDN (403). Do not plan around scraping it.

## Liquidity (all figures dated)

Gate-attributed flow, from Polymarket's builder feed ("volume" there is **share notional**, about 2.16x USD cash in the 25-minute trade sample and about 2.1x between the 30-day feed total and DefiLlama's USD total; the DefiLlama adapter comment also labels it "in shares". Treat the unit as M):

| Window | Share-notional volume | Source / date |
|---|---|---|
| Mar 2026 (from 2026-03-16) | $4.1M | feed, 2026-10-19 (H) |
| Apr / May / Jun / Jul 2026 | $24.3M / $113.9M / $280.1M / $266.8M | same (H) |
| Aug / Sep 2026 | $84.2M / $73.0M | same (H) |
| Oct 2026 (1st to 18th) | $37.9M (leaderboard rank 3 for MONTH; daily rank 3 to 5 in the last week) | same (H) |
| Last 30 days (2026-09-19..10-18) | $60.9M | same (computed, H) |
| Peak day | $69.0M on 2026-05-31 | same (H) |
| Total since 2026-03-16 | $884.3M | same (computed, H) |

- DefiLlama flags 2026-05-31 as a "genuine spike": a trader bought "millions of FIFA World Cup shares at 0.1c" (H that DefiLlama says so, Source 5). That is large share notional but tiny dollars, which is why the share-notional series overstates June.
- USD cash volume (DefiLlama, derived from builder trades): 24h $1.24M (2026-10-17), 7d $6.76M, 30d $28.53M; the series in the API starts 2026-07-05, so its "all-time" $143.4M excludes March to June (H, Source 5, fixture).
- Scale vs Polymarket: DefiLlama lists Polymarket International at $2.14B 30d (DefiLlama overview, 2026-10-19; unit not verified), so Gate is roughly 1.3% of Polymarket International by 30d volume (M).
- TVL/OI: none reported (DefiLlama TVL empty; open interest NOT FOUND).
- User counts: Polymarket's feed shows Gate with **2 to 4 active users per day** and 10 for the month, against 510 for the #1 builder (H). In the 300-trade sample (25 minutes), there were **2 distinct `owner` ids and 2 distinct `maker` addresses**, 93 markets, median fill $37, max $187, 69% of fills in Up/Down markets (H, computed). That pattern means Gate's CEX route is pooled into very few Polymarket accounts (M). It also means Gate-tagged volume cannot be read as organic retail demand; part of it may be market-making or hedging by pooled accounts (not attributable, L).
- Gate-published volumes: the Gate page shows per-market 24h volumes of about $97K to $1.85M (the largest was the Fed October decision) but those could be Polymarket-wide market volumes rather than Gate-only (M, summarised render).

## Event overlap (where arbitrage exists)

Identical to Polymarket's catalogue, because it is the same markets:

- Sports (NFL, NBA, EPL, Champions League, Ballon d'Or, esports Worlds), politics and geopolitics (Israel PM, US-Iran and Israel-Iran ceasefire), macro (Fed October decision, GDP, oil/WTI), crypto price targets (BTC, ETH), culture/novelty (Musk tweet counts, GTA VI trailer views), plus 5-minute-style crypto Up/Down markets (H for the listing on Gate's page, Source 1; categories Politics/Sports/Geopolitics are 92% of Polymarket volume per Odaily/Gate Research, M, Source 14).
- Overlap with other venues (Kalshi, Limitless, Predict.fun, etc.) is therefore the Polymarket overlap and should be modelled once, on the Polymarket leg.

## Shared liquidity

- **Shares liquidity with Polymarket.** Evidence: Gate's page and announcement say "Powered by Polymarket" and order books come from Polymarket (H, Sources 1, 2); Gate-code fills appear in Polymarket's own CLOB builder-trades feed with Polymarket `market`, `assetId`, `transactionHash`, `takerOrderHash` and Polymarket platform fees (H, Source 7); Polymarket's builder docs say a builder code is part of the signed order and the CLOB validates and matches it (H, Source 8). Polymarket's docs do not explicitly say builder orders rest on the same book as direct orders (the one gap), but the fill-level evidence above is consistent only with the same matching engine (M, high).
- Consequence: **not an independent arbitrage leg**. Any Gate quote is a Polymarket quote plus Gate's fee and routing latency. Do not count Gate and Polymarket as two venues in cross-venue edge calculations.
- Same applies to the other Polymarket builders already visible in the feed (betmoar, traderline, Sharktool and others), whose volume is also Polymarket volume.

## Adapter implications

- No Gate adapter. Add a **platform-registry alias**: `gate-predictions` -> underlying venue `polymarket`, relation `frontend`, builder code `0x2c6624a23b16a2a69acd14c87b7fc03906870c851fa0a7b7f9d7be0fbbedea8a`, collateral on Gate side USDT (custodial) or Polygon wallet (non-custodial).
- Optional signal in the Polymarket adapter: poll `clob.polymarket.com/builder/trades?builder_code=<Gate code>&after=<ts>` to tag Gate-routed fills. Expected value is low (pooled accounts), so build only if a flow-by-cohort signal is wanted. Use the v2 builders feed after 2026-10-24 (v1 retires).
- If the aggregator ever needs a "where can a CEX user buy this" list, record Gate as a distribution channel, not a price source.

## Open questions

1. **Gate Event Contracts** (separate, Gate-native product): launched July 2026 under Gate Futures; BTC and ETH Up/Down at 5m, 15m, 1h, 4h, later SOL, XRP, DOGE, HYPE, BNB, plus stock contracts (MU, SNDK, SK Hynix, Unitree) from 2026-09-08; contracts priced 0.01 to 0.99 USDT, no leverage, positions can be closed early (M, press and Gate announcements, Sources 15, 16). Settlement compares end price with a start benchmark, price source unnamed; fees, counterparty (likely house/market-maker), region rules and API: NOT FOUND. This is not Polymarket liquidity, so it could be independent, but with no API in Gate API v4 and a house-run feel it looks like P2/skip. Worth a separate short venue-spec if the orchestrator wants it covered.
2. **Gate Prediction Builder / Event Contracts Builder** (Gate DexBuilder, announced 2026-08-07, $3M grant program): B2B white-label infrastructure with API/SDK, market creation, settlement and "liquidity support"; liquidity providers, oracle and orderbook design are not named (M, Sources 17, 18). It is a toolkit, not a venue, unless a launched customer market surfaces. Fortune names it "Prediction Builder" and corrected the name on 2026-09-08.
3. Gate-side fee (0.8% claim, L) and Gate's treatment of disputed/void markets: need the Gate fee schedule or User Agreement.
4. Whether the Gate-tagged flow is retail, market-making, or hedging for Event Contracts: not determinable from the feed.

## Not found

- Any Gate API endpoint, WebSocket or SDK method for prediction markets or Polymarket trading (searched: Gate API v4 docs fully by summariser, gate.com/gate-api, gate/gate-mcp README, web search).
- Gate's own fee schedule for the Polymarket integration (searched: announcement, Learn explainer, promo FAQ, web search).
- Gate's restricted-jurisdiction list and the prediction-specific section of the User Agreement (searched: announcements, Learn, blog, web search).
- Gate's custody and counterparty statements for the CEX route; how USDT is converted; where positions are held.
- How Gate handles disputed, 50/50 or voided markets for CEX-route users.
- Gate-published volume, user count or TVL for the product (only third-party/Polymarket-derived figures exist).
- Polymarket's explicit statement that builder-routed orders rest on the same order book as direct orders (inferred from fill evidence).
- A Gate Predictions contract address: DefiLlama lists address `0xe667...4759` with symbol "GT" for the entry, which looks like a placeholder for the GT token rather than a prediction contract (L; not investigated, not needed).

## Fixtures

Saved in `docs/research/fixtures/gate-predictions-gate-com/` (all fetched 2026-10-19, each under 50 KB):

- `polymarket_clob_builder_trades_gate_sample_2026-10-19.json` - first 15 of 300 rows of the builder-trades feed for Gate's code, `owner` and `maker` replaced with placeholders.
- `polymarket_builders_volume_v1_gate_rows_2026-10-19.json` - all 214 Gate daily rows (2026-03-16 to 2026-10-18) from the v1 builders feed, compacted to `[date, volume, activeUsers, rank]`.
- `polymarket_builders_leaderboard_month_2026-10-19.json` - top 5 of the MONTH leaderboard (Gate rank 3).
- `defillama_gate_predictions_dexs_2026-10-19.json` - trimmed DefiLlama protocol and volume record with the last 30 daily points.

## Sources

Numbered; tag is the confidence of the claims I took from it.

1. [H] https://www.gate.com/en/prediction - product page, fetched 2026-10-19 via WebFetch (summarised): "Powered by Polymarket", category tags, October 2026 markets, per-market 24h volumes, no fee or collateral stated, only a link to the generic Developers (API) page.
2. [H] https://www.gate.com/announcements/article/50377 - "Gate Integrates Polymarket", 2026-03-24: public beta, App 8.12.5+ under Alpha, USDT spot route vs Web3 wallet USDC on Polygon, Prediction/Trading modes, 1:1 stablecoin settlement, restriction wording. Stale-ish (6.8 months).
3. [H] https://www.gate.com/gate-api - API product list (no prediction API; "Polymarket" only in the footer linking to /prediction), fetched 2026-10-19.
4. [H] https://www.gate.com/docs/developers/apiv4/en/ - Gate API v4 docs, searched in two halves via WebFetch 2026-10-19: no prediction/event-contract endpoints; `polymarket_limit` P2P field in v4.106.102 (2026-06-26).
5. [H] https://api.llama.fi/summary/dexs/gate-predictions and https://api.llama.fi/protocol/gate-predictions (2026-10-19); https://defillama.com/protocol/gate-predictions returned 403 to WebFetch. Description "Gate Predictions is a prediction platform powered by Polymarket", chain Polygon, tag "Polymarket Builder", volumes, genuine-spike note.
6. [H] https://github.com/DefiLlama/dimension-adapters (files `factory/polymarket.ts`, `helpers/polymarket.ts`, read via `gh api`): Gate builder code and start date 2026-02-14; comments on v1 retirement 2026-10-24 and v2 endpoint; `dailyNotionalVolume` is "in shares", `dailyVolume` is USD from builder trades.
7. [H] https://clob.polymarket.com/builder/trades?builder_code=... (live GET 2026-10-19) and https://docs.polymarket.com/api-reference/trade/get-builder-trades.md (spec: params, no security requirements, cursor `LTE=`).
8. [H] https://docs.polymarket.com/builders/fees and https://docs.polymarket.com/builders/overview.md - builder code is a `bytes32` in the signed order, emitted in `OrderFilled`, fee limits 100/50 bps, additive to platform fees, CLOB validates builder code; same-book statement implied, not explicit.
9. [H] https://github.com/gate/gate-mcp (README via `gh api`; pushed 2026-09-10): MCP endpoints and tool categories, no prediction trading tools.
10. [M] https://www.odaily.news/en/post/5210670 - Gate Research, 2026-05-09: confirms the two routes; no Gate volumes/fees; Polymarket-wide metrics (Polymarket figures only as context).
11. [H] https://www.gate.com/blog/gate-prediction-market-rewards-latest-promotions-and-bonus-guide - promo FAQ updated 2026-07-09: no gas, offline wallet signatures, KYC for rewards, ineligible account types, "Restricted Locations", integration "completed in March 2026".
12. [L] https://polymart.app/gate-prediction-market - third-party directory (unaffiliated); source of the unverified "0.8% on CEX route" fee claim.
13. [M] https://www.gate.com/learn/articles/what-is-gate-prediction-market-onchain-prediction-polymarket-ecosystem-hot-events-trading (last updated 2026-05-12, read via summariser; fee, region and KYC details absent) and a Gate-hosted guide naming UMA's Optimistic Oracle seen only in search results.
14. [M] https://www.gate.com/research/article/gate-research-polymarket-builders-new-paradigm-and-ecosystem - general Polymarket builder program context (late 2025), does not discuss Gate's integration.
15. [M] https://www.gate.com/announcements/article/101615 - stock event contracts announcement (settlement compares end price with start benchmark; no fee, API or region info).
16. [M] https://mpost.io/gate-launches-event-contracts-expanding-innovative-trading-offerings-for-the-digital-asset-market/ and related search results (Gate event contracts, July 2026), search snippets only.
17. [M] https://fortune.com/2026/09/03/crypto-exchange-gate-enters-prediction-market-space-with-white-label-builder-for-businesses/ - Prediction Builder (Gate DexBuilder), launched August 2026, $3M grant program, no liquidity source stated, correction dated 2026-09-08.
18. [M] https://www.barchart.com/story/news/3719755/gate-dexbuilder-launches-first-event-contracts-builder-unveils-3-million-grant-program-to-accelerate-market-ecosystem (search snippet; announced 2026-08-07).
19. [H] https://data-api.polymarket.com/v1/builders/volume, `/v1/builders/leaderboard`, `/v2/builders/volume` - live GETs 2026-10-19; https://builders.polymarket.com/ (Gate rank 3, "1m volume" $37.91M).
20. [H, internal] `docs/research/08-venues-polymarket-kalshi.md` and `docs/research/06-paybox-platform.md` for the Polymarket and PayBox facts this note relies on rather than re-derives.
