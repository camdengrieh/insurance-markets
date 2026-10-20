# JudgeMarket (judgemarket.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip** (at most a P2 "sentiment" feed). JudgeMarket is a play-money (OPS / Phi) order-book market on the "reputation" of public figures. It is live and has a real public API, but it has no collateral, no on-chain component, no event resolution, and no way to pay in or out. It cannot be an arbitrage leg. [H: https://judgemarket.com/terms s.3, s.15]

## Live status [H]

- Site and API respond 2026-10-19. `GET https://api.judgemarket.com/status` -> `{"dual_write_local":true,"media_storage":"r2","status":"ok","version":"0.6.4"}` (docs example showed 0.1.1, so the doc page lags the deploy).
- Sitemap lastmod 2026-10-19T07:10Z (https://judgemarket.com/sitemap.xml). Latest trade in the sampled book was 2026-10-19 07:16 UTC.
- Ticker snapshot, 2026-10-19: 151 assets, all `ACTIVE`; sum of `volume_24h` = 2,385,101 Phi; sum of `volume_30d` = 8,931,368 Phi; sum of `total_volume` = 39,732,561 Phi; sum of `trade_count` = 1,005,169. All 151 have non-zero 24h volume. Units are play-money Phi, not USD. Top 24h volume: sanae-takaichi.
- Homepage May 2026 recap: 163,098 trades, 6.39M Phi moved, 66 active figures; so activity and the catalogue grew from 66 to 151 figures by October. [H]

## Kind and market model [H]

- Kind: forecasting-nonmoney / reputation market. Each public figure (past or present) is one asset priced 0-100 Phi, "the collective opinion of the market". Not an event contract; there is no question, expiry or resolution. [H: https://judgemarket.com/what-is-ops, llms.txt]
- Mechanism: central limit order book. Limit and Market orders; sides `Bid` (long) / `Ask` (short); `reduce_only` flag. [H: https://judgemarket.com/docs/trading]
- Terms say prices come from the latest trade on the order book, where users AND "house accounts" both trade; house accounts "trade toward AI-produced reference prices". So prices are partly operator-driven. [H: https://judgemarket.com/terms]
- Shorting mechanics, leverage, liquidation: NOT FOUND (searched: what-is-ops, docs/trading, terms).
- Tokenisation: none. Positions are database rows, not tokens. "Convert" is a one-tap swap between two figures (shipped May 2026). [H: homepage]
- Asset metadata: 151 figures; tags are mostly politics (115), united-states (43), taiwan (26), israel (24), business (13), science (10), crypto (8). [H: GET /assets, 2026-10-19]

## Chains and collateral [H]

None. OPS "is play money with no cash value ... not a cryptocurrency, security or financial instrument"; cannot be bought, sold, withdrawn or exchanged; rewards are paid in OPS only; transfers capped at 500 OPS per 24h and the sender account must be 30+ days old. [H: https://judgemarket.com/terms s.3, s.4, s.15]. Login is username/password + captcha, or Google. [H: docs/authentication]. No wallet.

## Read API [H unless noted]

- Docs: https://judgemarket.com/docs/getting-started (sections: authentication, market-data, trading, account, social, websocket, errors). The `account`, `social`, `errors` pages were not read.
- Base URL: `https://api.judgemarket.com` (CORS `access-control-allow-origin: *`; Cloudflare).
- Public, unauthenticated market data (confirmed live with GETs):
  - `GET /assets` -> array of `{id,name,title,image_url,image_key,source_image_url,status,era,tags}` (253 KB for 151 assets; docs list wiki fields, live shape differs slightly).
  - `GET /assets/ticker` -> array of `{asset_id,price,change_24h,volume_24h,volume_30d,total_volume,high_24h,low_24h,trade_count,post_count}`; all numbers are strings; cached, refreshed every 5 s.
  - `GET /assets/:id/ticker`, `/assets/:id/orderbook?limit=1..100` -> `{bids:[{price,amount}],asks:[...]}`, `/assets/:id/trades` (50 rows: `{id,price,amount,time(ms epoch),side}`; `side` returned `UNKNOWN` in sample), `/assets/:id/klines?interval=1m|1h|1d&limit<=1000`, `/assets/:id/history`, `/assets/:id/stats`, `/assets/:id/holders`, `/assets/:id/wiki`.
  - Prices are 0-100 numbers (not 0-1 probabilities); the book is shallow (sample top-5 levels of 1 share each).
- Authenticated: `X-API-KEY: jm_...` header (keys created in the logged-in UI at /builders; `GET/POST/DELETE /auth/api-keys` require a JWT) or JWT `Authorization: Bearer` (15 min access, 30 day single-use refresh). `GET /orders/my` unauthenticated -> 401 (confirmed). Key scopes and request signing: NOT FOUND (docs/authentication says not covered).
- Rate limits: sensitive mutations and reward claims 5 req/s burst 10 per principal; order placement 100 req/s burst 1000 ("for market makers"); auth endpoints 5 req/s per IP; 429 on excess. Public read limits: NOT FOUND.
- Websocket: `wss://api.judgemarket.com/ws`, JWT via subprotocol `['judgemarket','bearer.<token>']`. Only documented message type is `NOTIFICATION` (fills, transfers, rewards). No documented market-data channels or subscribe format. [H: docs/websocket]
- Note: https://judgemarket.com/robots.txt disallows `/api/*` on the web host for crawlers; the documented API host is the separate `api.judgemarket.com`. Only a handful of single GETs were made. [H]
- MCP: llms.txt and /builders say "Open API and MCP integration for developers and agents", but no MCP URL was found in the pages read. NOT FOUND (searched: getting-started, builders, llms.txt).
- Fixtures: docs/research/fixtures/judgemarket/ (`ticker_sample.json`, `ticker_one_sample.json`, `assets_sample.json`, `orderbook_sample.json`, `trades_sample.json`).

## Trade path

Programmatic trading exists, for logged-in users with an API key: `POST /order` (`asset_id, side Bid|Ask, order_type Limit|Market, price 0-100 (Limit), amount | quote_order_qty, reduce_only`), `GET /orders/my?status=active|history`, `POST /orders/cancel/:id`. Statuses FILLED/PARTIAL/OPEN/REJECTED/CANCELLED. [H: docs/trading] Automation is permitted "only through the official API and within its rate limits". [H: terms s.8]. Key creation requires an account, which this research did not create.

## PayBox reachability: no

There is no wallet, chain, token or signed order, so nothing for a PayBox EVM/Solana wallet to propose or sign. Only a username/API-key HTTP session works, and OPS cannot be funded with money. Reachable only as a read-only signal feed.

## Fees [H: https://judgemarket.com/what-is-ops]

Taker (market) 1.5%; maker (resting limit) 0.05%. 1.5% is pre-locked on placement and 1.45% is refunded if the order fills as a maker. Fees go to a "System Treasury" that funds user rewards. Units are OPS, so fees have no cash cost.

## Resolution and dispute risk [H: terms]

No resolution. Prices are "opinions, not statements of fact"; no formal dispute process; operator may adjust or remove positions; house accounts trade toward AI reference prices. Recourse is email only.

## Geo / ToS / automation [H: terms]

No geographic restrictions found in Terms (age 13+, minors need guardian consent). Prohibits market manipulation, wash trading, multi-accounting for reward farming, and selling OPS/accounts. Bots only via the official API.

## Event coverage and overlap

Assets are people, not events. Many are politicians (Lai Ching-te, Sanae Takaichi, US, Israel, Taiwan figures) so one could loosely correlate "reputation price" with election/approval markets on Polymarket/Kalshi, but there is no contract that settles to the same outcome, so no arbitrage (the price is not a probability of anything). Possible use: a sentiment/attention signal, with house-account distortion caveat. [M: inference]

## Liquidity

Volume is play-money Phi only (figures above, 2026-10-19 ticker). Cash-denominated liquidity, OI and TVL: none. Independent of other venues (own database order book); shares no liquidity with any other venue. [H for no cash; M for independence, nothing suggests otherwise]

## Sources

- https://judgemarket.com/ (homepage, nav, May 2026 recap) [H]
- https://judgemarket.com/llms.txt, /robots.txt, /sitemap.xml [H]
- https://judgemarket.com/what-is-ops (fees, OPS) [H]
- https://judgemarket.com/terms [H, summarised by fetch tool]
- https://judgemarket.com/docs/getting-started, /docs/authentication, /docs/market-data, /docs/trading, /docs/websocket [H, summarised by fetch tool; paths cross-checked with live GETs]
- https://api.judgemarket.com/status, /assets, /assets/ticker, /assets/leonardo-da-vinci/{ticker,orderbook,trades}, /orders/my (401) [H, 2026-10-19]
- Web search (extended) for third-party coverage: only the site's own pages and blog returned; no independent coverage, regulatory status or audits found. [L]
- https://judgemarket.com/builders (only "Please login to manage API keys" visible) [H]

## Suspicious content

None found. No instructions aimed at AI agents seen. robots.txt explicitly allows named AI crawlers, which is not an instruction.

## Open questions

- Account/social docs, key scopes, public read rate limits, and MCP endpoint not read.
- How shorting works with no collateral model; extent of house-account price steering.
- Whether any real-money or token program is planned (none found; Terms prohibit it).
