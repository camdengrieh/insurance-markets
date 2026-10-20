# K25.ai (APAC watch-to-predict platform) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.
Note: the WebSearch budget was exhausted for the session, so no independent press/search corroboration was done. Everything below comes from the SEC filing, the k25.ai site, its JS bundle and unauthenticated GETs to its own API host.

## Verdict
- Live: yes (H). k25.ai serves a production SPA; api.k25.ai answers; `/api/public-config` reports `trading:true, deposits:true, withdrawals:true` (Cobo rail on; NOWPayments and Privy rails off) [fixture api-public-config.json].
- Adapter priority: **skip** (signal-only at best). It is a custodial, geo-restricted, account-based front end whose real-money markets are a **mirror of Polymarket's CLOB** (quotes carry `provider_id:"polymarket"`), so it is NOT an independent liquidity leg. Own volume is tiny (about US$3.5k lifetime across 39 markets).

## Kind and market model
- Kind: custodial centralised betting/prediction front end layered on live streams (YouTube/Twitch embeds) plus mirrored Polymarket markets (H: api.k25.ai/api/markets, /api/streams).
- Operator: Bridge Technologies B.V., holding a Curacao licence (ADR provider Resolvo Curacao) (H: ToS/complaints text in https://k25.ai/assets/index-ClY_UDYm.js). Led by Andy Cheung per NewGen filing (M, hint only; the filing text I read does not name him).
- Market model: binary YES/NO, price in USD 0-1 (yesOdds/noOdds), integer-cent quote grid (`price:8` = 0.08), `tickSize` 0.01 or 0.001 (H, fixtures). Order types in the client: limit/market, side Buy/Sell, outcome yes/no, `quote_id`, `idempotency_key` (H: bundle function `YE`). Outcomes are NOT tokenised on-chain by K25: positions are rows in K25's database (account positions/balances). `pmTokenYes`/`pmTokenNo` fields are Polymarket CLOB token IDs (H).
- Market types seen (39 listed 2026-10-19): 28 `polymarket_mirror` (6 open, 3 closed, 19 resolved) and 11 `external_event` stream markets (all closed, close time 2026-09-06). Categories are mislabelled (Polymarket politics/AI markets filed under "Football"). A "For fun" points mode exists (error codes `insufficient_points`, site meta "Free to play with points - no money, no deposit, no ID check") (H).
- Stream-native "watch-to-predict" markets: `resolutionType:"external_event"`, `poolSize` field implies a pool/parimutuel-like design (pool collateral error codes `pool_collateral`, `pool_frozen`, `pool_reduce_only`) (M: inferred from field/error names; all currently closed, poolSize 0).

## Chains and collateral
- USD-denominated custodial balance (ToS 3.14: deposits/withdrawals in USD, max US$10M each) (H). Deposits via a Cobo-provisioned deposit address (`/api/cobo/deposit-address`); asset and chain list NOT FOUND (searched: bundle for USDT/USDC/Polygon/TRC; auth-gated endpoint). Privy KYC/bank-account endpoints exist but the Privy rail is disabled (H).
- No smart contracts found. NOT FOUND (searched: bundle, API responses).

## Read API
- Exists: unofficial-only. No developer docs, no OpenAPI, no robots-published API (searched: k25.ai/robots.txt, sitemap.xml, llms.txt return SPA 404; no docs link in bundle). These are the site's own frontend endpoints; stability and permission to use them are not promised (L/M).
- Base URL: https://api.k25.ai (H, bundle host map: k25.ai and www.k25.ai -> api.k25.ai; UAT host api-uat.overclutch.com seen in bundle).
- Unauthenticated GETs confirmed (H, fixtures saved):
  - `GET /api/markets[?stream_id=]` -> `{markets:[{id,streamId,question,category,status,yesOdds,noOdds,poolSize,externalMatchId,externalRef:"polymarket:<id>",pmTokenYes,pmTokenNo,pmTickSize,resolutionType,resolvedOutcome,closeTime,volumeUsd}]}`
  - `GET /api/markets/{id}` -> `{market:{...}}`
  - `GET /api/markets/{id}/quotes` -> `{quotes:[{id,market_id,provider_id:"polymarket",side,price(cents),max_qty,remaining_qty,expires_at_ms}],bestBidUsd,bestAskUsd,tickSize}` (top of book only: one Buy and one Sell quote)
  - `GET /api/markets/{id}/fills?limit=N` -> `{fills:[{outcome,side,priceUsdc,size,createdAt}]}`
  - `GET /api/streams`, `/api/schedule`, `/api/schedule/next`, `/api/public-config`, `/api/geo` (geo returns requester country; not saved).
- Auth-required (seen in bundle only, not called): /api/account*, /api/balances, /api/positions, /api/orders/open, /api/orders/{id}, /api/withdrawals, /api/cobo/deposit-address, /api/privy/*. Auth scheme: Discord login (public-config `auth.discord:true`) and Privy JWT; session tokens (`/api/account/sessions`) (M).
- Rate limits: NOT FOUND (no headers inspected beyond status; searched response of 5 calls). WebSocket: NOT FOUND (no ws URL in bundle).
- Book depth: only best bid/ask with size; full L2 not offered. Mirrored prices are Polymarket's, so the adapter value is nil.

## Trade path
- Programmatic: none official. Orders are placed by an authenticated browser session (`POST /api/orders` style with `quote_id`, `qty`, `price`, `side`, `outcome`, `order_type`, `idempotency_key`; H bundle) against a custodial balance. No API keys, no signed orders, no on-chain transactions (M).
- PayBox reachability: **no** for order placement (no EVM signing flow; account is username/Discord/Privy based). The only wallet touchpoint would be a plain deposit transfer to a Cobo deposit address (chain/asset unknown) via request_transfer, which would still require an account, KYC-style geo checks, and is prohibited for many jurisdictions. Not recommended.

## Fees
- Trading fee/spread formula: NOT FOUND (searched bundle for fee/commission/markup; no trading-fee text). Withdrawal fee exists ("amount_below_fee"; ToS: "A fee reflecting our costs ... may apply"); inactive-account fee US$5 or 5% of balance per month (ToS 3.x) (H).

## Resolution and dispute risk
- Mirrored markets: `resolutionType:"polymarket_mirror"`; outcome follows Polymarket (which uses UMA). K25 sets `resolvedOutcome` itself (H field, mechanism M). Operator-controlled, custodial; disputes go to operator then Resolvo Curacao ADR (H). Stream markets: `external_event`, resolution by operator/event feed (L).
- Counterparty risk: high (custodial offshore operator, ToS allows voiding bets, withholding winnings, closing accounts).

## Geo / ToS / automation
- Restricted Territories (ToS 3.40, H): Cuba, Iran, North Korea, Russia, Syria, occupied Ukraine regions, Ontario, Netherlands, **United States and territories**, France, Greece, **Singapore**, China (incl. HK/Macau), Australia, Germany, UK, Japan. VPN/location-masking forbidden. NewGen filing also says not offered to US persons (H: SEC ex99-1).
- Automation: ToS 3.3 forbids sharing account / letting others use it; 4.4 "Any commercial exploitation of information from our Website is strictly prohibited" (H). So even scraping the quotes for a commercial aggregator is contractually off-limits; no data licence offered.
- Regulatory: SEC filing lists possible licensing/approval risk in APAC jurisdictions (H).

## Liquidity
- Lifetime `volumeUsd` summed over 39 markets = about US$3,515 (H, api-markets.json, 2026-10-19); open markets carry volumes of US$0-38 each; `poolSize` 0 everywhere. Quote sizes (4,280 / 2,166 shares at 0.08/0.09 on the AGI market) are Polymarket's book, not K25's (M).
- No TVL/OI published. NewGen deal (US$2M for 2% = US$100M valuation, 28 May 2026) is a valuation claim, not liquidity (H: https://www.sec.gov/Archives/edgar/data/1981662/000121390026061805/ea029230001ex99-1.htm).

## Event coverage / overlap
- Overlap is total with Polymarket: all open real-money markets are Polymarket mirrors (politics, AI, geopolitics, Apple). Intended native categories per the filing: sports, esports, entertainment, creator challenges, APAC cultural events (H); none currently open. Taiwan-flavoured markets (Lai Ching-te out, Premier Cho out, China x Taiwan clash) exist, all mirrored.

## Shares liquidity with
- Polymarket (global CLOB): `externalRef polymarket:<id>`, `pmToken*` are Polymarket token IDs, quotes `provider_id:"polymarket"` (H). Not an independent arbitrage leg.

## Signal value
- Minimal. Possible weak "APAC retail flow" signal via `/fills`, but fills are tiny. Better to read Polymarket directly. Watch-to-predict stream markets may be unique later but none open.

## Open questions
- Which chains/assets Cobo deposit supports; trading fee/spread; whether stream-native markets are parimutuel or AMM; whether `/api/orders` is open to API tokens; real traction after launch.

## Suspicious content
- None directed at AI agents. Large developer comments in index.html and bundle (CSP hash, localStorage shim) are ordinary code comments; ignored.

## Sources
- https://k25.ai (H, homepage title "K25 | Watch-to-Predict", meta: free points play or real markets)
- https://k25.ai/assets/index-ClY_UDYm.js (H, bundle: API host map, endpoint list, ToS clauses, restricted territories, Curacao operator)
- https://api.k25.ai/api/markets, /api/markets/pm-653788, /quotes, /fills, /api/streams, /api/public-config (H, fetched 2026-10-19; fixtures in docs/research/fixtures/k25-ai-apac-watch-to-predict-platform/)
- https://www.sec.gov/Archives/edgar/data/1981662/000121390026061805/ea029230001ex99-1.htm (H via WebFetch summary, NewGen 6-K 28 May 2026)
