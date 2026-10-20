# Gate Polymarket integration (Gate app) - venue spec

Researched 2026-10-19 (about 03:10 to 04:00 UTC). Read-only: WebFetch of public pages, `gh api` for public GitHub files, unauthenticated GETs to Polymarket's public APIs and DefiLlama. No account, wallet, key, POST, signing or payment. WebSearch could not be used (the session's shared search budget was exhausted), so discovery relied on direct fetches of known Gate pages; anything a search would have found is listed under "Not found". Generic User-Agent `insurance-markets-research/0.1` only.

Confidence tags: H = read first-hand in a primary source this session (URL in Sources); M = secondary or inferred; L = weak or stale.

This is the same product that `docs/research/venues/gate-predictions-gate-com.md` covers under another name. I re-verified its core claims independently; where I found something that differs, see "Corrections and additions to the earlier note".

## Verdict

- Adapter priority: **skip** (as a venue adapter). Confidence: high.
- It is **Gate's front end to Polymarket**, not a venue. Gate's page says "Powered by Polymarket" (H, S1), Gate's own explainer says "a centralized trading entry point with on-chain market liquidity" (H, S5), and I matched Gate-attributed fills by transaction hash on Polymarket's public trade tape (H, own test, S9). Prices, books and fills are Polymarket's, so it can never be an independent arbitrage leg.
- It has **no Gate-hosted API for placing orders or reading its books** (H that none is documented, S2, S3, S4). The only Gate-hosted read surface I found is a Gate MCP "news" endpoint with prediction-market data tools that mirror Polymarket and Predict.fun (H that it is documented, not exercised, S4). Mirrors are not new liquidity.
- Residual value: (a) a registry alias so the aggregator labels Gate-routed flow as Polymarket; (b) an optional flow signal from Polymarket's public builder feed filtered to Gate's builder code (H, S7, S8); (c) a tripwire: Fortune (2026-09-03) calls Polymarket Gate's "former partner" and says Gate now competes with it via a separate white-label product (M, S10), so Gate may move to other liquidity.

## Liveness (still live in 2026?)

Live today, with weaker volume and one strategic warning.

- Gate-attributed fills were being matched at 2026-10-19 03:10 UTC (latest of 300 rows, H, S7, fixture `polymarket_clob_builder_trades_gate_first25_2026-10-19.json`). The Polymarket CLOB therefore still accepts Gate's builder code.
- `https://www.gate.com/en/prediction` rendered with October 2026 markets (Fed October decision, Bitcoin and Ethereum price targets, WTI crude, Musk tweet count, esports) and "Powered by Polymarket" (H for the wording and market names, S1; the page text has no timestamp, and it was read through a summariser).
- Launch: Gate announcement 2026-03-24, "public beta", Gate App 8.12.5+ under the Alpha page (H, S2). That is 6.8 months old, so "beta" and the app version may be stale (flag). The promo FAQ was updated 2026-07-09 and still describes it as live (H, S6).
- Trend (H, computed from S7/S8 fixtures; builder-feed "volume" is share notional, see Liquidity): 30-day blocks of Gate-attributed volume were $84.8M (2026-07-22..08-20), $84.4M (08-21..09-19), $58.8M (09-20..10-19, last day partial). Down about 30% block on block.
- Warning: Fortune, 2026-09-03: Gate "first entered that ecosystem as a Polymarket partner" and its new Prediction Builder "inspired it to compete with its former partner" (H that Fortune says this, S10). Fortune gives no end date or reason, and the live feed contradicts "ended" for the app route as of today. Treat as a risk that the integration is being wound down or supplemented, not as fact (M). No Gate or Polymarket statement of termination found (NOT FOUND).

## Kind and market model

- Kind: **CEX product / broker front end to Polymarket** (H, S2). Two routes, both ending at Polymarket (H, S2):
  1. Gate-account route: trade with spot USDT "with no on-chain steps"; positions sit beside spot balances; after settlement winners "claim" in one action and are credited 1:1 in stablecoin to the spot account.
  2. Wallet route: connect a Web3 wallet and trade Polymarket on Polygon with USDC. The promo FAQ says Gate covers network fees for orders placed with "wallet offline signatures" (H, S6), which is Polymarket's signed-order flow.
- UI: "Prediction mode" (probabilities) and "Trading mode" (order book, charts, depth, market and limit orders), plus quick trade (H, S2).
- Market model is whatever Polymarket lists: binary Yes/No shares priced 0 to 1, negative-risk multi-outcome events, sports spread and total markets, 5-minute crypto Up/Down. Order-book CLOB, not an AMM. Outcome tokens are Polymarket's ERC-1155 position tokens on Polygon, one book per outcome token (the book facts are in `docs/research/08-venues-polymarket-kalshi.md`; I re-saw the `clobTokenIds` pair on a Gate-traded market in S9, H).
- Which Polymarket markets Gate lists: NOT DOCUMENTED. Gate's categories are "featured topics, sports, crypto, finance" (H, S2). My sample of 300 Gate-attributed fills spanned 85 markets: WTA tennis, Colombian and Mexican football, an NFL game, esports and 5-minute BTC/ETH Up/Down (H, S7, S9; 138 of 300 rows could not be labelled by my quick Gamma lookup). Do not assume catalogue parity.
- Custody on the Gate-account route: NOT STATED by Gate (the explainer only says users "complete trades using account assets", S5). Evidence points to pooled wallets (M): the 300 sampled fills came from exactly 2 Polymarket API-key owners / 2 maker addresses (each about half), daily `active_users` for Gate's builder code was 2 to 12 (median 4) over the last 90 days, and the calendar-month leaderboard shows 10 active users for $38.0M (H on the numbers, S7, S8; the pooling reading is M). One of the two top wallets is a public Polymarket profile that DefiLlama also names in a spike annotation (S11). So "Gate-attributed volume" is concentrated and is not a clean proxy for Gate retail traffic.

## Chains and collateral

- Chain: **Polygon (137)** only (H, S2; DefiLlama chain field, S11).
- Gate-account route: **USDT** in the Gate spot account (H, S2). How USDT becomes Polymarket collateral and who holds the tokens: NOT FOUND.
- Wallet route: **USDC on Polygon** per Gate (H, S2). Polymarket's collateral is now **pUSD** (H, `docs/concepts/pusd` is in Polymarket's docs index, and its builder-fee page uses pUSD in its worked example, S12), so Gate's "USDC" is probably simplified (M).

## Read API

- Official Gate API for prediction markets: **none** (NOT FOUND, searched: Gate API v4 reference both halves, `gateio/gateapi-python` file tree last pushed 2026-07-16, `gate/gate-mcp` README, gate.com/gate-api via summariser).
  - Gate API v4 (`https://www.gate.com/docs/developers/apiv4/en/`, base `https://api.gateio.ws/api/v4`, latest changelog v4.106.160 dated 2026-10-16): the only "polymarket" string is a `polymarket_limit` flag on three P2P merchant endpoints (H, S2; page is about 198K characters, read in two chunks through a summariser, so "none" is high but not perfect confidence).
  - Gate Event Contracts (announced 2026-09-08 for stocks, App 8.36.0+) are a separate Gate-native product with no stated liquidity source, fee or region (H, S13). Not this integration.
- Gate MCP, `https://api.gatemcp.ai/mcp/news` (auth none, Streamable HTTP, 18 tools): 5 prediction tools, `news_prediction_get_market_orderbook` (venue `polymarket` | `predict_fun`, `market_id`, depth 1 to 20, current book only), `news_prediction_search_events`, `news_prediction_get_event_signal`, `news_prediction_get_volume_delta_ranking`, `news_prediction_get_fastest_rising_ranking` (H that they are documented, S4). MCP is JSON-RPC over POST, which I did not call (read-only rule); a plain GET timed out at 10 s with no bytes. Response shapes and rate limits: NOT FOUND. These are a Gate-hosted mirror of Polymarket and Predict.fun data, not Gate liquidity, and a hop away from the primary source. Not recommended as an adapter data source.
- gate.com pages themselves: scripted GET returned 403 from the CDN with the generic UA (H); I did not try to get around it. Any front-end JSON is undocumented and gated by user-agreement clause 1.3(h) (see Geo/ToS).
- **Public unauthenticated feeds that do exist (all Polymarket or DefiLlama, not Gate):**

| Surface | Use | Confirmed |
|---|---|---|
| `GET https://clob.polymarket.com/builder/trades?builder_code=0x2c6624a23b16a2a69acd14c87b7fc03906870c851fa0a7b7f9d7be0fbbedea8a` | Gate-attributed fills. Envelope `{data, next_cursor, limit:300, count}`; row fields `id, tradeType, takerOrderHash, builder, market (conditionId), assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner (API-key id), maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Params `market, asset_id, before, after, next_cursor, id`. Security: none in the OpenAPI. | H, 2026-10-19, 300 rows (S7) |
| `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` | Daily `{date, rank, builder_name, builder_code, verified, volume, active_users}` for all builders; only the latest 90 daily buckets. v1 (`/v1/builders/volume`) retires 2026-10-24. | H (S8) |
| `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL` | Ranking; `MONTH` is calendar month to date. Gate was rank 3 for Oct 1 to 19: $38.04M, activeUsers 10. (v1 is on the retirement notice; I did not test a v2 leaderboard.) | H (S8) |
| `GET https://data-api.polymarket.com/v2/trades?condition=<conditionId>&limit=500` | Public tape, snake_case rows `{proxy_wallet, side, token_id, condition_id, size, price, timestamp, title, slug, outcome, transaction_hash, ...}`. The param is `condition`, not `market` (the API returns a 400 telling you so). v1 `/trades?market=` also worked today but retires with v1. | H (S9) |
| `GET https://gamma-api.polymarket.com/markets?condition_ids=<id>` | Market metadata incl. `feeSchedule`, `clobTokenIds`, `resolutionSource`. | H (S9) |
| `GET https://api.llama.fi/summary/dexs/gate-predictions` | USD daily volume derived from builder trades. | H (S11) |

- Auth and rate limits: none needed for the above. Polymarket's IP-based Cloudflare limits (throttling, not rejection): Gamma 4,000 req/10s general, `/markets` 300/10s; Data API v2 800/10s general, `/v2/trades` 300/10s; CLOB 9,000/10s general (H, S14). The `/builder/trades` limit is not listed separately (NOT FOUND). Gate limits for prediction: NOT FOUND (no endpoints).
- WebSocket: none for Gate (NOT FOUND). For live books use Polymarket's market WebSocket (covered in the Polymarket workflow, not re-verified here).
- Market data for the markets themselves (books, prices, trades, resolution): use the Polymarket adapter. Nothing Gate-specific is needed.

## Trade path

- **Programmatic through Gate: none** (NOT FOUND in API v4, SDK or MCP, see Read API). The Gate-account route needs a Gate login; the promo FAQ says identity verification is required to claim event rewards (H, S6), and general KYC for the route is implied by it being a Gate exchange account (M). An agent could only use it by automating the Gate app or website, which user-agreement clauses 1.3(h) and 2.11 forbid (see below). Not recommended; not tested.
- **Wallet route = Polymarket.** The order is an EIP-712 order signed by the user's wallet with a `bytes32` builder code in the signed struct; the CLOB validates the code and the settlement contracts emit it in `OrderFilled` (H, S12). Gate adds only its code. Whatever an agent can do on Gate's wallet route it can do on Polymarket directly, and the builder code is chosen by whoever submits the order, so the aggregator has no reason to use Gate's.

## PayBox reachability

- **No, for anything Gate-specific** (paybox_reachable = no). The custodial route needs a Gate account and has no API; the wallet route is plain Polymarket on Polygon.
- The same exposure is reachable, with caveats, by trading Polymarket directly from an EVM wallet on Polygon with EIP-712 order signing. Whether PayBox will sign Polymarket's order and auth typed data for an arbitrary `verifyingContract` is untested and tracked in the Polymarket and PayBox notes (`docs/research/06-paybox-platform.md`, `docs/research/08-venues-polymarket-kalshi.md`). I made no PayBox calls here.

## Fees

- Polymarket platform fee applies, taker only: `platform_fee = C x feeRate x p x (1 - p)` (C shares, p price), per-market `feeRate`; builder fees are additive and capped at 100 bps taker / 50 bps maker, changeable once per 7 days with 3 days' notice (H, S12). The Gamma record of a Gate-traded 5-minute ETH market shows `feeSchedule {rate 0.07, takerOnly true, rebateRate 0.2}` (H, S9). I reproduced one row exactly: 50.963637 shares x 0.07 x 0.55 x 0.45 = 0.8829 USD (H).
- Gate-attributed sample (300 fills, 2026-10-19 02:23 to 03:10 UTC, H, S7): 287 taker fills, $12,974 notional, $217.96 platform fees, about 1.68% effective; 13 maker fills, $94.8 notional, zero fee; **`builderFee` was 0 on all 300 rows**, so Gate's code was not charging a builder fee at that time (H on the sample). It can change on 3 days' notice.
- **Gate's own fee for the Gate-account route: NOT FOUND** (searched: announcement S2, prediction page S1, Learn explainer S5, promo FAQ S6, user agreement S15; the page shows "0 Fees" only for P2P and Convert). The earlier internal note recorded a third-party directory claim of a 0.8% flat fee; I did not re-verify it and treat it as L.
- Non-fee costs: USDT to pUSD conversion (undocumented), Polygon gas and wrap/unwrap on any direct wallet use, lockup until settlement.
- For edge maths: model Gate as Polymarket fees plus an unknown Gate fee; it is never better than Polymarket direct.

## Resolution mechanism and dispute risk

- Resolution is Polymarket's: UMA Optimistic Oracle for most markets (proposal with a bond, typically $750 pUSD; 2-hour challenge period; two disputes escalate to a UMA DVM token vote; fastest about 2 hours) and Chainlink TWAP for Up/Down markets (H, S16; `resolutionSource` on the Gamma record points at a Chainlink stream, H, S9). Always read per-market rules.
- Gate says winners are credited 1:1 in stablecoin to the spot account after settlement (H, S2). Gate's treatment of disputed markets, 50/50 payouts, delays or voids for custodial users: NOT FOUND (searched: S2, S5, S6). Gate's explainer does not name UMA (H that it does not; an earlier note's UMA mention was a search-snippet and I could not reproduce it).
- Extra risk on the Gate-account route beyond Polymarket: Gate custody and credit risk, Gate's discretion to restrict services, and the partnership-ending risk above.

## Geo, ToS and automation

- Gate says it "may restrict or prohibit certain services in specific jurisdictions" (H, S2). The Gate user agreement clause 2.5 "Restricted Locations ... include but are not limited to the United States of America" and lists (as retrieved through a summariser, truncated after Russia): US, mainland China, Singapore, Canada, France, Germany, Hong Kong, Malaysia, Malta, Cuba, Iran, North Korea, Sudan, Crimea, Spain, Luhansk, Donetsk, Netherlands, UK, Myanmar, Venezuela, Uzbekistan, Austria, India, Indonesia, Japan, Argentina, Cambodia, UAE, Thailand, South Korea, Philippines, Pakistan, Vietnam, Russia (H that this is the clause text, S15; M that it is complete and that it governs the prediction product specifically). The promo FAQ also refers to Restricted Locations (H, S6). The agreement does not mention Polymarket or prediction markets (H, read both 100K-character chunks, S15).
- Polymarket's own geoblock applies on top and is IP-based (details in `docs/research/08-venues-polymarket-kalshi.md`). How it treats orders relayed by Gate's servers: NOT FOUND.
- Automation: clause 1.3(h) bars "algorithmic, quantitative, systematic, high-frequency, or automated activity" through channels Gate has not designated, and programmatic access to undocumented interfaces; clause 2.11 lists "unauthorized API use, data scraping"; clause 1.4 treats such strategies as "prima facie evidence" of prohibited conduct; clause 3.6 allows termination (H, S15, summariser paraphrase plus short quotes). Gate has designated no prediction API, so scripting the Gate-account route would breach the agreement (M, my reading). The promo FAQ excludes "agent accounts" and market-maker accounts from rewards (H, S6; promotion only).
- Scripted access to gate.com is CDN-blocked (403).

## Liquidity (all figures dated)

Builder-feed `volume` is share notional (the DefiLlama adapter labels it "in shares", H, S17); DefiLlama's USD series is about half of it (30-day feed total $58.8M vs DefiLlama $29.4M, ratio 2.0; 2.9 inside my 47-minute sample, so treat the unit as M).

| Metric | Value | Source, date |
|---|---|---|
| Gate-attributed volume, last 30 daily buckets (2026-09-20..10-19, last day partial) | $58.8M share notional | S8, computed, 2026-10-19 |
| Same, last 7 buckets | $13.6M | same |
| Gate share of all builder-attributed volume, same 30 days | about 8.6% ($58.8M of $686M) | same; builders only, not all of Polymarket |
| Calendar month to date, rank | $38.04M, rank 3, 10 active users | S8, 2026-10-19 |
| DefiLlama USD: 24h (2026-10-18) / 7d / 30d / 1y | $0.92M / $7.68M / $29.4M / $144.3M | S11, 2026-10-19 |
| Daily active users (on-chain) | 2 to 12, median 4 | S8, 2026-07-22..10-19 |
| Depth | NOT FOUND for Gate; depth is Polymarket's book. | n/a |

DefiLlama marks the series `doublecounted: true` and annotates a genuine spike on 2026-05-31 (S11). Peaks earlier in 2026 (from the v1 history) are in the earlier note and were not re-derived here (v2 serves only 90 days).

## Event overlap and shared liquidity

- Categories listed by Gate: sports (World Cup, Premier League, Champions League, NBA, NFL, esports), crypto (BTC, ETH), politics and macro (Trump, Fed, GDP, oil), tech and culture (S1). These overlap Kalshi, Betfair/sportsbooks and other venues, but every such overlap belongs to the **Polymarket** leg. Gate adds no extra leg.
- **Shares liquidity with: Polymarket (100% as far as I can tell).** Test: I took the 12 markets with the most Gate-attributed fills and fetched Polymarket's public trade tape; 89 tape rows carry transaction hashes that match Gate-attributed fills, on the same condition ids (H, S9, fixture `gate_vs_polymarket_public_tape_crosscheck_2026-10-19.json`). Gate's builder code is a field in the order Polymarket matches, so the order met Polymarket's book.
- Open: Gate could in principle net or internalise custodial orders before they reach Polymarket; no evidence either way (NOT FOUND). Gate's announcement says only that it "plans to enhance liquidity in the future" (H, S2).
- Aggregator rule: never treat a Gate price as a separate quote. Map any Gate-listed market to its Polymarket conditionId and drop the Gate row from cross-venue arbitrage; at most use Gate-attributed flow as a signal.

## Corrections and additions to the earlier note (`gate-predictions-gate-com.md`)

1. The Gate MCP news endpoint does expose prediction tools including a live order book (`news_prediction_get_market_orderbook`) for Polymarket and Predict.fun. The earlier note said the README lists no prediction book tool.
2. Fortune's "former partner" wording (S10) was not flagged there.
3. Gate user agreement was retrieved here (clauses 1.3(h), 1.4, 2.5, 2.11, 3.6); the earlier note could not get it.
4. Data API: the tape endpoint should be `/v2/trades?condition=`; v1 retires 2026-10-24.
5. Gate's Learn explainer does not name UMA (H).
6. Fresh fee sample: 1.68% effective on 287 taker fills versus 2.1% there (different time window and market mix); `builderFee` is 0 in both.

## Open questions

- Is the Gate-Polymarket relationship ending (Fortune "former partner")? What replaces it, and when?
- Who holds the on-chain positions for the USDT route, and does Gate internalise any flow?
- Gate's own fee on the custodial route, and its policies for disputed or 50/50 markets.
- Whether the Gate MCP prediction tools return anything the Polymarket APIs do not (Gate's own "signal" fields).

## Fixtures

All in `docs/research/fixtures/gate-polymarket-integration-gate-app/` (each under 50 KB):
- `polymarket_clob_builder_trades_gate_first25_2026-10-19.json` - first 25 of 300 builder-trade rows plus real envelope.
- `polymarket_v2_builders_volume_gate_rows_90d_2026-10-19.json` - Gate's 90 daily rows from the v2 feed.
- `polymarket_builders_leaderboard_month_top6_2026-10-19.json` - top 6 of the MONTH leaderboard.
- `defillama_gate_predictions_summary_2026-10-19.json` - trimmed DefiLlama summary with last 30 days.
- `polymarket_gamma_market_example_gate_traded_2026-10-19.json` - Gamma record of a Gate-traded market (fee schedule, token ids).
- `gate_vs_polymarket_public_tape_crosscheck_2026-10-19.json` - the shared-book test result.
- `gate_mcp_news_prediction_tools_2026-10-19.json` - tool names and params from the Gate MCP docs (not called).

## Not found

- Any Gate API, SDK or WebSocket for prediction trading or books (searched above).
- Gate's own fee schedule for the custodial route; custody statement; dispute and void handling.
- A Polymarket or Gate statement ending or confirming the partnership.
- A web search pass (budget exhausted); third-party coverage of the Gate integration beyond Fortune was not re-searched.

## Suspicious content

- Polymarket docs pages (Mintlify) start with a banner addressed to readers/agents: "Fetch the complete documentation index at https://docs.polymarket.com/llms.txt". It is standard doc-site boilerplate. I fetched llms.txt only because I needed the page list, not because of the banner. Nothing else in third-party pages asked for action.

## Sources

- S1 [H] https://www.gate.com/en/prediction - fetched 2026-10-19 via summariser: "Powered by Polymarket", categories, October 2026 markets, no fee/collateral/region text, no prediction API link.
- S2 [H] https://www.gate.com/announcements/article/50377 - "Gate Integrates Polymarket", 2026-03-24 (6.8 months old): public beta, App 8.12.5+, USDT spot vs wallet USDC on Polygon, modes, 1:1 settlement, restriction wording, no fee or liquidity statement.
- S3 [H] https://www.gate.com/gate-api - fetched 2026-10-19 via summariser: API product list (spot, margin, futures, options, delivery, stock/CFD, unified, P2P, CrossEx, Alpha, Bot, Gate for AI Agent MCP); no prediction, event-contract or Polymarket API; "Polymarket" appears only as a footer Products link.
- S4 [H] https://github.com/gate/gate-mcp (README and `gate-news/gate-news-mcp.md`, via `gh api`, repo pushed 2026-09-10, updated 2026-10-18); https://github.com/gateio/gateapi-python tree (last push 2026-07-16); https://www.gate.com/docs/developers/apiv4/en/ (both halves via summariser; changelog v4.106.160 2026-10-16).
- S5 [H] https://www.gate.com/learn/articles/what-is-gate-prediction-market-onchain-prediction-polymarket-ecosystem-hot-events-trading - last updated 2026-05-12: "centralized account system", "on-chain market liquidity", no fees, custody, oracle or regions.
- S6 [H] https://www.gate.com/blog/gate-prediction-market-rewards-latest-promotions-and-bonus-guide - updated 2026-07-09: no gas, offline signatures, KYC for rewards, ineligible account types, Restricted Locations.
- S7 [H] https://clob.polymarket.com/builder/trades (live GET 2026-10-19 03:10 UTC) and https://docs.polymarket.com/api-reference/trade/get-builder-trades.md (spec).
- S8 [H] https://data-api.polymarket.com/v2/builders/volume and /v1/builders/leaderboard?timePeriod=MONTH (live GETs 2026-10-19); builders.polymarket.com is the same data.
- S9 [H] https://gamma-api.polymarket.com/markets?condition_ids=..., https://data-api.polymarket.com/trades (v1) and /v2/trades?condition=... (live GETs 2026-10-19).
- S10 [M] https://fortune.com/2026/09/03/crypto-exchange-gate-enters-prediction-market-space-with-white-label-builder-for-businesses/ - read through a summariser; correction note dated 2026-09-08 concerns the product name only.
- S11 [H] https://api.llama.fi/summary/dexs/gate-predictions (live GET 2026-10-19).
- S12 [H] https://docs.polymarket.com/programs/builders/fees.md and /programs/builders/overview.md (the older /builders/... URLs 307-redirect here).
- S13 [H] https://www.gate.com/announcements/article/101615 - Stock Event Contracts, 2026-09-08, App 8.36.0+.
- S14 [H] https://docs.polymarket.com/api-reference/rate-limits.md and https://docs.polymarket.com/llms.txt (page index; builder endpoints list).
- S15 [H, summariser] https://www.gate.com/user-agreement - clauses 1.3(h), 1.4, 2.5, 2.9, 2.11, 3.6, 12.5; two 100K-character chunks read, no Polymarket or prediction mention.
- S16 [H] https://docs.polymarket.com/concepts/resolution.md.
- S17 [H] https://github.com/DefiLlama/dimension-adapters (`factory/polymarket.ts`, `helpers/polymarket.ts`, via `gh api`): Gate builder code and start 2026-02-14, "in shares" comment, v1 retirement 2026-10-24.
- Internal [H there]: `docs/research/venues/gate-predictions-gate-com.md`, `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/06-paybox-platform.md`.
