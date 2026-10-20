# Hotcoin (hotcoin.com) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Hotcoin is a custodial centralized exchange (CEX). Its "Prediction Markets" / "Event Contracts" product is a front end that appears to route to Polymarket (so it is NOT an independent liquidity leg), has no documented public API, and its volume through the Polymarket builder program is tiny. The only useful artifact is the Polymarket builder code, which is already visible in Polymarket data.

## Is it live?

- Exchange is live: homepage, API host and symbol list respond (2026-10-19). H - https://www.hotcoin.com/ , https://api.hotcoinfin.com/v1/common/symbols (fixture: spot-symbols-sample.json)
- The homepage nav/footer do NOT list prediction markets (Spot, Futures, TradFi, Copy, Earn, P2P only). H - https://www.hotcoin.com/
- But a prediction product exists at https://www.hotcoin.com/en_US/eventContract/ (title "Trade Crypto & Sports Event Contracts"; tabs Recommended, Crypto, Trending, Football, My Predictions, Livestream, Popular Predictions). H - that page.
- Hotcoin's own article says a World Cup prediction page launched on 16 June (year not stated; page labelled "Updated on 2026-10-19"), with a 440,000 USDT incentive fund, "no mandatory KYC". H - https://www.hotcoin.com/en_US/learn/article/Hotcoin-Upgrades-Prediction-Market-with-Launch-of-WorldCup/
- Third-party news says a launch promo ran 24 Apr - 4 May 2026, plus a separate 15m/1h/1d "Crypto Prediction" for BTC/ETH/SOL/XRP. M/L - Traders Union via search snippets (page itself returned HTTP 403): https://tradersunion.com/news/brokers-news/show/2188606-hotcoin-introduces-prediction-market-feature/
- i18n strings in the live bundle carry version tags 20260228 (event contract buy/sell/refund/claim), 20260519 (prediction market trading refund), 20260728 ("Polymarket under maintenance", "Insufficient market liquidity"), so the feature is actively maintained as of at least late July 2026. H - strings in https://www.hotcoin.com/en_US/eventContract/ page HTML.
- Honest status: live but marginal. Polymarket builder stats show almost no real flow (see Liquidity).

## Kind and market model

- Kind: cex-product (custodial exchange front end). H
- Hotcoin's own words: "event-based trading model", "Contract prices are determined entirely by market supply and demand", binary Yes/No or Up/Down style, "event results are settled according to public and verifiable outcomes". H (World Cup article above) / binary detail M (Traders Union).
- The web client calls routes `/hk-web/polymarket/{event/pageList, event/detail, event/listTrades, market/detail, market/orderBook, market/pricesHistory, market/topHolder, marketOrder, userPosition, userClaimable, userRedeem, ...}`. These names mirror Polymarket's event / market / CLOB order book / redeem model. H that the strings exist in Hotcoin's public JS bundle (www.hotcoin.com/_next/static/chunks/*.js; list in fixtures/frontend-polymarket-proxy-paths.txt). Inference that the backend proxies Polymarket: M (strong, because of path names, the "Polymarket under maintenance" string, and the Polymarket builder entry).
- Outcome tokenisation: not documented by Hotcoin; if it is a Polymarket proxy then outcomes are Polymarket CTF tokens held in an exchange-controlled account, not in the user's wallet. M
- Hotcoin does not mention Polymarket in any user-facing marketing page I read (event page, World Cup article, homepage). H (negative).

## Chains and collateral

- NOT FOUND (searched: event page, World Cup article, bundle strings, API docs). Hotcoin balances are internal exchange ledger entries (USDT etc.). If proxied to Polymarket, underlying settlement is Polygon pUSD/USDC.e under Hotcoin's omnibus account. M/L

## Read API

- exists: **none** for the prediction product (no official public API). The official API docs (spot + perpetual) have no event or prediction section: sidebar is Spot (Change Log, Introduction, Reference Data, Market Data, Account, Trading, WebSocket) and Perpetual/Swap (Market, Change Log, General Info, Asset, Trading). H - https://hotcoinex.github.io/en/spot/introduction.html , https://www.hotcoin.com/en_US/apiDocument/ ; the 660KB swap docs page grep for "predict"/"polymarket"/"event contract" found only WebSocket "event" fields (not prediction). H
- Docs URL (spot/perp only): https://hotcoinex.github.io/en/spot/introduction.html and https://github.com/hotcoinexchange/openapi
- Base URLs (spot/perp only): REST `https://api.hotcoinfin.com`, WS `wss://wss.hotcoinfin.com/trade/multiple`, perp REST `https://api-ct.hotcoin.fit`. H
- Auth: market endpoints unsigned; private endpoints use HmacSHA256 signature (SignatureVersion 2, AccessKeyId, Timestamp). H. Rate limits: spot 10 req/s (reference, ticker, account/trading), 20 req/s (kline, depth, trades); perp: 429 then IP ban, no numbers. H
- Prediction data would have to come from the undocumented `/hk-web/polymarket/*` web-backend routes. I did NOT probe them (undocumented, base host/method/auth not established, not an "official documented API host" path). Treat as unusable for an adapter: unofficial, may be geo-gated and login-gated.
- Real response confirmed (spot, irrelevant to prediction): `GET https://api.hotcoinfin.com/v1/common/symbols` -> `{code:200,msg,time,data:[{baseCurrency,quoteCurrency,symbol:"btc_usdt",state,minOrderAmount,assetCategory,underlying,...}]}`. H, fixture saved.

## Trade path

- none for prediction contracts. Only via the Hotcoin web/app with a Hotcoin account (custodial, login). No on-chain contract, no signed-order flow. H (absence in API docs).
- PayBox reachability: **no**. There is no wallet, order-signing or contract interface. At best a PayBox-controlled wallet could deposit crypto to a Hotcoin deposit address (a transfer to a custodial exchange), but order placement would still require a logged-in Hotcoin session or an API key that does not cover prediction. Not an agent-tradeable venue.

## Fees

- Hotcoin article lists "no trading fees" for the prediction market; no fee formula given. H (World Cup article; absence of mechanics). Whether Polymarket's builder fee or taker fees are passed on is NOT FOUND. Spot/perp fees are on a separate Fees page (not read; irrelevant).

## Resolution and dispute risk

- Hotcoin: "settled according to public and verifiable outcomes"; no timing or dispute process. H. If it mirrors Polymarket, resolution is UMA optimistic oracle on the underlying Polymarket market, but Hotcoin adds its own custodial layer plus "refund" and "maintenance"/"insufficient liquidity" states (UI strings), i.e. Hotcoin can pause or refund. M
- User-level risk: a UI string says "Your access to Prediction Market has been disabled. Please contact Customer Support", so the product can be disabled per account. H (string exists).

## Geo / ToS / automation

- Operator named in footer: Australian "Hotcoin Global Exchange Pty Ltd". H (event page). Generic IP-restriction messages exist ("unable to provide services in your country or region"). H (strings).
- Third-party sites claim the US and Japan are barred; unconfirmed in the agreement itself. L - https://www.cryptowinrate.com/hotcoin-global-restricted-and-supported-countries-2026/
- Automation rules for prediction: NOT FOUND. Hotcoin's API is permission-based (read/trade/withdraw keys) for spot/perp only.

## Liquidity (Polymarket builder program, own data)

- Hotcoin is a verified Polymarket builder, builderCode `0xa9ca694f698947b2bc445d28ac5c9439d52418c273e1f10eb07ec7cde059a7d1`. H - https://data-api.polymarket.com/v1/builders/leaderboard (fixture polymarket-builder-leaderboard-hotcoin-rows.json, fetched 2026-10-19):
  - ALL time: $806,598.84 volume, rank 166, 1 active user.
  - MONTH: $41,868.86, rank 116, 1 active user.
  - WEEK: $354.08, rank 147, 1 active user.
- "1 active user" is likely the exchange's single omnibus account, so user count is not informative; volume is. About $0.8M lifetime, ~$42k last month, ~$354 last week: negligible and declining. H (numbers), M (interpretation).
- No Hotcoin-native OI/TVL published. NOT FOUND.

## Shared liquidity

- Shares liquidity with Polymarket (M, strong): builder-coded orders on Polymarket's CLOB, proxied API route names, "Polymarket under maintenance" string. Therefore NOT an independent arbitrage leg. Any prices would be Polymarket's own prices (possibly with Hotcoin-side spread or pause logic unknown).

## Event overlap

- Crypto price up/down (BTC, ETH, SOL, XRP), sports (World Cup, football), trending topics. H/M (Hotcoin pages). All duplicates of Polymarket markets; no unique edge.

## Resolution of the original question

The discovery hint "homepage lists no prediction product" is incomplete: a product exists at /en_US/eventContract/, but it is a Polymarket-routed front end with negligible volume. Nothing to integrate beyond treating the builder code as a Polymarket attribution tag.

## Open questions

- Exact base host and auth for `/hk-web/polymarket/*` (not probed).
- Whether Hotcoin adds spread or fees on top of Polymarket prices.
- Whether the prediction product is available to US IPs.
- Year of "June 16" World Cup launch is almost certainly 2026 (FIFA World Cup 2026) but the article does not state it.

## Suspicious content

- None found. No AI-targeted instructions seen in Hotcoin pages, docs or search results.

## Sources

- https://www.hotcoin.com/ (H, 2026-10-19)
- https://www.hotcoin.com/en_US/eventContract/ (H, page HTML + i18n strings + JS bundle)
- https://www.hotcoin.com/en_US/learn/article/Hotcoin-Upgrades-Prediction-Market-with-Launch-of-WorldCup/ (H)
- https://www.hotcoin.com/en_US/apiDocument/ (H)
- https://hotcoinex.github.io/en/spot/introduction.html and /en/swap/order.html (H)
- https://github.com/hotcoinexchange/openapi (H, file listing only)
- https://api.hotcoinfin.com/v1/common/symbols (H)
- https://data-api.polymarket.com/v1/builders/leaderboard (H)
- https://tradersunion.com/news/brokers-news/show/2188606-hotcoin-introduces-prediction-market-feature/ (M/L, snippet only; 403)
- https://www.cryptowinrate.com/hotcoin-global-restricted-and-supported-countries-2026/ (L)
- Fixtures: docs/research/fixtures/hotcoin/
