# Zoomex (zoomex.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Verdict

- Adapter priority: **skip**. Zoomex is a centralized offshore crypto-derivatives exchange (Seychelles) with an in-house "Prediction Market" / "Predict World" product launched 2026-06-02 (M, press release). There is no public prediction-market API, no on-chain trade path, USDT is held in a custodial exchange account, and it appears to mirror (and probably hedge into) Polymarket, so it is not an independent liquidity leg.
- Still live: yes. Homepage returns HTTP 200 with last-modified 2026-10-15 (H, https://www.zoomex.com/). Prediction-market expansion press releases dated 2026-09-17/18 and 2026-10-16 (M).
- At most a signal source: public prices are only visible in the logged-out web UI; no documented feed.

## Kind and market model

- Kind: CEX product (custodial exchange account, "Prediction Market Account"). H: Zoomex's own static strings call it "Prediction Market Account" with Open Positions / Settled Events / Order History (https://www.zoomex.com/common-static/i18n-upload/predict/en-US.json).
- Formats per Zoomex FAQ: Yes/No binary, multi-choice, crypto trend, sports, world events (H, same file). Shares pay $1 per correct share (H, `eventFaq3Content`); losing shares are 0 (H).
- Time horizons: 5 Minute, 15 Minute, 4 Hour, Long-Term; 70 markets live of which 49 long-term as of 2026-09-17 (M, https://hackernoon.com/zoomex-prediction-markets-expand-long-term-trading-across-major-crypto-industry-questions).
- Short-term markets: Up/Down vs a "Price to Beat" at window start, Chainlink {coin}/USD as sole settlement source (H, i18n file `eventFaq1/2/5Content`). Identical in shape to Polymarket's Chainlink 5m/15m markets.
- Early exit: users can sell shares before resolution on the open positions page (H, `faqA5`, `sellDialogHint`: "execution price may change"). Matching model (order book vs house/AMM quote) NOT FOUND (searched: Zoomex i18n strings, press, V3 API docs). Outcome tokenisation: not tokenised on-chain as far as documented; positions are exchange ledger entries (M, inferred).
- Sports: Games / Props, Correct Score, Half-Time, Match Market tabs (H, i18n keys `sportsTab*`, `sportsGames`, `sportsProps`).

## Chains and collateral

- Collateral: USDT ("Insufficient USDT balance", H, i18n `restNotEnough`). Wallets for deposit are exchange deposit addresses (V3 API has Get Deposit Address by coin/chain, added 2026-03-30, H, https://zoomexglobal.github.io/docs/v3/changelog). Prediction positions live inside the exchange account, not on a chain.

## Read API

- Exists for the exchange (derivatives/spot) but **not documented for prediction markets**. exists = none for the prediction product.
- Exchange V3 API docs: https://zoomexglobal.github.io/docs/v3/intro (H). Mainnet base https://openapi.zoomex.com (H: `GET /cloud/trade/v3/market/time` returned `{"retCode":0,...}` unauthenticated, saved in fixtures). Testnet https://openapi-testnet.zoomex.com (M, search snippet of docs intro). Bybit-style (retCode/retMsg, X-Bapi-* headers).
- Sitemap of the docs lists only market (kline, orderbook, tickers, recent-trade, instrument...), order, position, account, asset, broker/affiliate, copy-trade and websocket sections; no prediction/event endpoints (H, https://zoomexglobal.github.io/docs/sitemap.xml). Changelog through 2026-06-23 has no prediction entry (H, https://zoomexglobal.github.io/docs/v3/changelog).
- Rate limits (exchange API): 600 requests / 5 s per IP; per-UID limits e.g. 10 req/s on order create (H, https://zoomexglobal.github.io/docs/v3/rate-limit). WebSocket host stream.zoomex.com (H, same page).
- The product's web front end uses an internal API (api2.zoomex.com referenced in homepage source, returns Akamai "Access Denied" to scripted GET, H). Not documented; do not rely on it.
- A Zoomex MCP server for AI clients exists but covers the V3 trading API (spot/contracts), not predictions (H, mcp i18n strings: "connecting AI assistants ... to Zoomex V3 API").
- Resolution data: only via UI; NOT FOUND via API.

## Trade path

- None for predictions. V3 API order endpoints require an API key (HMAC) on a KYC'd exchange account; predictions not exposed (see above). An EVM wallet could only deposit USDT to the exchange deposit address (a transfer, custodial) - no signed orders or transaction proposals to a prediction contract exist.
- Do not create API keys (research rule).

## PayBox reachability

- paybox_reachable: **no**. At best a plain USDT transfer to a custodial deposit address; no programmatic way to place prediction orders, and the account needs a (possibly KYC) Zoomex login. Not a PayBox order-signing venue.

## Fees

- Prediction fee schedule NOT FOUND (searched: Zoomex i18n strings, press releases, web search). The UI shows "Estimated Fees" before ordering (H, `estimatedFees`), so fees exist. Standard futures fees quoted as 0.06% taker / 0.02% maker are unrelated to predictions (L, search snippet). Spread/odds-based house margin is possible but unverified.

## Resolution and dispute risk

- Crypto up/down: Chainlink price feed is sole source; if the feed is abnormal the market is Suspended and settles automatically on recovery with no manual price (H, i18n `eventFaq5/7Content`).
- Long-term/event markets: house-administered per published criteria; third-party analysis says Terms let Zoomex cancel, void or refund at sole discretion if data is indeterminate (L, https://briefglance.com/articles/the-settlement-landmines-hidden-in-zoomexs-multi-year-prediction-markets - promotional-style article, unverified against the ToS). No UMA-style dispute process. Resolution differences vs Polymarket are a basis-risk trap for arbitrage.

## Geo / ToS / automation

- Zoomex states "Participation in trading may be unavailable in" some regions (H, `riskNoticeContent`, truncated). A third party reports ToS section 11 excludes US, mainland China, EU, Singapore, Hong Kong and Quebec (L, briefglance link above; I could not read the ToS). Optional/tiered KYC claimed by the same source (L).
- Automation rules for the prediction product NOT FOUND. Promo-event rules exclude "abnormal, bot, or violating accounts" from rewards (H, `rulesBasicItem6`, pre-launch campaign only).

## Liquidity

- Self-reported: BTC 5-minute market $11M volume, ETH $356K, long-term markets $23K to $2M (M, Zoomex press release dated 2026-09-17 via hackernoon link above; "at the time of writing", total vs 24h unclear). Independent verification NOT FOUND; one analyst questions it vs ~12-15k weekly web visits (L).
- Polymarket-side footprint of Zoomex (H): builder "ZOOMEX" is rank 122 all-time with $1.83M volume and 1 active user (https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=100, fetched 2026-10-19). Monthly builder volume: 2026-05 $2.1K, 06 $370K, 07 $483K, 08 $205K, 09 $410K, 10 (to 19th) $364K (https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH). Starts right as the product launched (2026-06-02). "1 active user" means a single omnibus Polymarket account.

## Event categories and overlap

- Crypto price up/down 5m/15m/4h (Chainlink) - overlaps Polymarket directly.
- Long-term crypto/industry questions (China unban BTC by 2027, MicroStrategy bankruptcy, Satoshi identity, BTC vs Gold vs S&P 500 2026, HYPE flip SOL) - these titles match Polymarket-style markets (M, press release list).
- Sports (World Cup etc.), politics/macro (Fed decision, Brazil election, Venezuela) added 2026-10-16 (M, https://predictionnews.com/story/zoomex-expands-predict-world-with-global-event-contracts via search snippet; page 403 to fetch).

## Shared liquidity

- liquidity_shared_with: Polymarket (probable). Evidence: H that Zoomex holds a verified Polymarket builder code with ~$1.8M routed volume since the product launched through one account; M that its market catalogue and Chainlink 5m/15m design mirror Polymarket. Inference (M, not confirmed by Zoomex): Zoomex quotes users on a house book and hedges/routes net flow to Polymarket. Treat it as a mirrored, NOT independent, venue; any apparent "edge" vs Polymarket would reflect Zoomex's spread/lag, not a tradable counterparty for us.

## Open questions

- Is there any machine-readable feed behind the web UI (an internal REST/WS) and do ToS allow its use? Would need a browser session (out of scope).
- Actual prediction fee model and whether quotes are house-made.
- Exact ToS wording on excluded jurisdictions and bots.

## Suspicious content

- None found. (Press release pages are promotional; the briefglance article is promotional/analytical text, not treated as instructions.)

## Not found

- Prediction-market API docs; fee schedule; ToS text; on-chain contracts (none expected); independent volume data; official page for Predict World rules (site pages are a Nuxt SPA; web fetch tools got 403 on several news pages).

## Fixtures (docs/research/fixtures/zoomex/)

- polymarket_builders_leaderboard_ALL_zoomex_row.json, polymarket_builders_volume_MONTH_zoomex_rows.json (unauthenticated GETs, 2026-10-19)
- zoomex_predict_i18n_en-US.json (public static strings of the prediction UI, 19KB)
- zoomex_openapi_market_time.json (exchange API shape sample)

## Sources

1. https://www.zoomex.com/ - homepage 200, last-modified 2026-10-15 (H)
2. https://www.zoomex.com/common-static/i18n-upload/predict/en-US.json - product strings (H)
3. https://zoomexglobal.github.io/docs/v3/intro, /rate-limit, /changelog, /sitemap.xml - API docs (H)
4. https://openapi.zoomex.com/cloud/trade/v3/market/time - live API probe (H)
5. https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume - builder footprint (H)
6. https://hackernoon.com/zoomex-prediction-market-officially-launches-participate-in-global-trending-events-with-crypto - launch PR 2026-06-02 (M)
7. https://hackernoon.com/zoomex-prediction-markets-expand-long-term-trading-across-major-crypto-industry-questions - expansion PR 2026-09-17 (M)
8. https://briefglance.com/articles/the-settlement-landmines-hidden-in-zoomexs-multi-year-prediction-markets - third-party ToS claims (L)
9. https://predictionnews.com/story/zoomex-expands-predict-world-with-global-event-contracts - 2026-10-16 expansion (M, search snippet only)
