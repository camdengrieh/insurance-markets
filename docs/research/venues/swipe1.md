# Swipe1 (swipe1.io) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip** (at most a P2 "attention signal" later, and probably not even that).
- Live: yes, in Season 0 beta / early access. [H] https://swipe1.io/ (footer 2026, "EARLY ACCESS", "currently in early development"); https://app.swipe1.io returns 200 [H].
- It is a **points-only, free-to-play swipe UI**. No real-money trading is documented. The market data we could observe is **mirrored from Kalshi** (tickers like `KXBTC15M-...`, `source: "kalshi"`), so it is not an independent liquidity venue and offers no arbitrage leg. [H] (api.swipe1.io sample, see Fixtures)

## Kind and market model

- Kind: forecasting-nonmoney (points game). [H] https://swipe1.io/ ("Predict for free. Earn Points."), https://swipe1.gitbook.io/swipe1-gitbook (Points section) 
- Model: binary Yes/No swipe (left/right = answer, up = skip per press release [M] https://chainwire.org/2026/07/08/swipe1-introduces-a-mobile-native-prediction-app-built-for-everyone/). No order book, AMM or outcome tokens documented. NOT FOUND (searched: gitbook sections 4.x, 5.x, 6.x; terms; homepage).
- Feed items carry `preview_market` with `yes_ask_dollars` / `no_ask_dollars` / `last_price_dollars` and `strike_type` such as `greater_or_equal`: these are Kalshi-style fields copied into the feed, not Swipe1-generated prices. [H] fixture
- Docs mention "express and trade predictions" and "predictions are liquid" only as vision language; there is no description of trading mechanics. [H] homepage

## Chains and collateral

- "Infrastructure built on BNB Chain" [H] https://swipe1.io/ and gitbook 6.1 https://swipe1.gitbook.io/swipe1-gitbook/6.0-technical-infrastructure/6.1-built-on-bnb-chain.md . Gitbook 6.2 says smart contracts "may support" onchain settlement, participation tracking, points mechanics "depending on platform functionality and future ecosystem expansion" (conditional wording, no addresses). [H]
- The press release does not name a chain (only "Web3 wallet" or Gmail login). [M]
- Collateral: none documented. Points are not money; terms say points carry no monetary value or ownership rights (ToS Section 7 per fetch summary). [H] https://swipe1.io/term-of-use/
- Contract addresses: NOT FOUND (searched: gitbook 6.1-6.3, homepage, ToS). Web search was unavailable this session (search budget exhausted), so no BscScan or GitHub lookup beyond the official sites.
- Login: Gmail or wallet. "Swipe1 does not custody user assets or private keys." [H] gitbook 6.3

## Read API

- Official/documented API: **NOT FOUND** (searched: gitbook llms.txt index of 30 pages, ToS - which does not mention any public API, homepage links). The gitbook has no developer section. [H]
- Undocumented backend found: `https://api.swipe1.io` (Laravel; root shows default framework welcome page). Linked from the web app host (app.swipe1.io is Next.js). Probed with plain unauthenticated GETs: `GET /api/markets` returns 200 JSON, no auth, served via Cloudflare, `cache-control: no-cache, private`. No rate-limit headers seen. [H] this session. `/api`, `/health` return 404. I did not probe further and did not discover the endpoint from any documentation: treat it as **unofficial, subject to change, and covered by the ToS ban on reverse engineering and unauthorized automation** (see below).
- Response shape (fixture `docs/research/fixtures/swipe1/api-markets-page1.json`): `{status, message, data:{items[], pagination{page,limit:20,total:null,total_pages:null,has_more,next_page,prev_page}}}`. `?page=N` works (pages 2 and 3 returned different items); `per_page=50` was ignored (limit stayed 20). Item fields: `event_id, event_title, event_ticker, source, provider_type, trades_count, likes_count, shares_count, nav_category, nav_tag, nav_interval, nav_sport_scope, nav_competition, image_url, open_time, close_time, expected_expiration_time, active_market_count, preview_market{market_id, ticker, status, yes_ask_dollars, no_ask_dollars, last_price_dollars, floor_strike, strike_type, button_text}`. [H]
- Observed items on pages 1-3: all `source: "kalshi"`, categories Crypto (BTC 15-minute markets) and Sports (e.g. WNBA totals). `trades_count` was 0 on the sample item. [H]
- Websocket: NOT FOUND. Order book / trades / resolution endpoints: NOT FOUND.
- Because it only relays Kalshi data, a scanner should read Kalshi directly (covered by another workflow), not this endpoint.

## Trade path

- None documented. Predictions are swipes inside a mobile/web app that award points. No order placement API, no signing scheme. [H] (absence in gitbook + ToS)
- PayBox reachability: **no**. Nothing to propose or sign: no public contracts, no collateral, no order API. If an onchain settlement contract on BNB Chain is ever published, an EVM wallet on BNB could in principle send transaction proposals, but that is hypothetical. PayBox network coverage of BNB Chain was not checked here (out of scope; no PayBox tools called).

## Fees

NOT FOUND. No fee schedule documented; free to play with points. [H]

## Resolution and dispute risk

- Resolution mechanism: NOT FOUND (market integrity page and gitbook 7.x cover prohibited conduct only; "doesn't describe how markets are resolved"). [H] https://swipe1.io/market-integrity/
- For Kalshi-mirrored events, outcome presumably follows Kalshi's settlement (M, inferred from identical tickers; not documented).
- Dispute process: none. Enforcement is at Swipe1's sole discretion. [H] https://swipe1.io/market-integrity/

## Geo, ToS, automation

- "Use of the platform may not be permitted in certain jurisdictions"; no countries named; users must not circumvent geographic restrictions (Section 8). [H] https://swipe1.io/term-of-use/
- Bots, exploits and "unauthorized automation" are prohibited; reverse engineering prohibited (Section 9); no permitted API access mentioned. Gitbook 7.5 says the platform may apply rate limitations and behavioral analysis. [H] ToS, https://swipe1.gitbook.io/swipe1-gitbook/7.0-market-integrity/7.5-wash-trading-and-unauthorized-automation.md
- Implication: do not scrape `api.swipe1.io` in production.

## Liquidity

- No volume, OI or TVL published. NOT FOUND. Sample `trades_count` = 0 on first item; no aggregate. Points game, so notional liquidity is zero. [H]
- Shares liquidity with: **Kalshi** (data mirrored; any real trading, if it exists, is not documented). Not an independent arbitrage leg.

## Event coverage (overlap)

Crypto price (BTC 15-minute up/down on Kalshi tickers), sports (World Cup, football, basketball, MMA, tennis, esports, observed WNBA totals), AI/tech, politics/global events, entertainment. [H] gitbook 3.4 https://swipe1.gitbook.io/swipe1-gitbook/3.0-the-swipe1-solution/3.4-supported-categories.md . All overlap with Kalshi, but that overlap is the same underlying market, not a second price.

## Signal value

- Possible only as a "retail sentiment" signal if Swipe1 later exposes per-market swipe counts or Yes/No split (there is a `trades_count` field, `likes_count`; sentiment split not observed). Points-farming and airdrop incentives make such sentiment noisy and sybil-prone. [M]
- Token: none live. Press release says points feed an "Airdrop Score" and final rules are TBD; ToS says no guarantee of tokens. [M] chainwire, [H] ToS.

## Open questions

- Is any real-money or onchain trading planned, and on which contracts? (gitbook only says "may")
- Does the feed ever carry non-Kalshi sources (Polymarket etc.)? Only Kalshi seen on 3 pages (60 events).

## Fixtures

- `docs/research/fixtures/swipe1/api-markets-page1.json` (24.9 KB): GET https://api.swipe1.io/api/markets, 2026-10-19, unauthenticated. No personal identifiers (grep for "@" returned 0 hits; User-Agent was `insurance-markets-research/0.1`).

## Sources

- https://swipe1.io/ [H, fetched 2026-10-19]
- https://swipe1.io/points/ [H]
- https://swipe1.io/market-integrity/ [H]
- https://swipe1.io/term-of-use/ [H]
- https://swipe1.gitbook.io/swipe1-gitbook and llms.txt, pages 3.4, 4.1, 6.1, 6.2, 6.3, 7.5, 8.5 [H]
- https://app.swipe1.io (HTTP 200 only) [H]
- https://api.swipe1.io/api/markets [H, undocumented]
- https://chainwire.org/2026/07/08/swipe1-introduces-a-mobile-native-prediction-app-built-for-everyone/ [M, via WebFetch summary]
- Not verified this session: PR of 2026-08-25 (WebSearch budget exhausted), BearDAO partnership beyond homepage mention [H homepage lists "BearDAO"].
