# Coinverse (coinverse.io) - venue spec

Researched 2026-10-19. Tags: H = read first-hand from primary source this session, M = secondary/inferred, L = weak/stale.
Adapter priority: **skip** (revisit only as a thin crypto/commodity price-market signal).

## Summary
- Live (H): coinverse.io returns 200 on 2026-10-19; home/markets page props show `lastResolvedAt` 2026-10-19T07:35Z and 127 OPEN markets (auto-generated rolling series).
- Kind: fully centralized exchange-style CLOB with an internal ledger and operator-managed settlement. No on-chain markets, no contracts. (H: /about, /faq, /terms)
- Market content: only auto-generated crypto and commodity price markets (Up/Down 5m/15m/1h, Above/Below, Price Range). No sports, politics, or macro event markets are open. (H: /markets props)
- Liquidity: effectively zero. Of 127 open markets, 1 had any volume (265.46 usdW), all sampled order books empty. (H)
- Money model is murky: balances are "usdW" (a platform token tied to signup bonus, thawing, points/leaderboard, presale of a token), with a separate "USD" mode. /about says "Real trading with test tokens (no real value)". Treat as incentive/points-style, not an independent real-money price. (H, contradictory docs)

## Market model
- Binary only. Each market has `options` with `yes_price`/`no_price`; outcomes are "Up"/"Down" or "Above $X"/"Below $X". Prices 0.01-0.99, $1 payout per winning share. (H: /how-it-works, /risk-resolution, markets props)
- Types: `up_down`, `above_below`, `price_range_multi` (multi-market ranges), plus "Hit Price/Touch" described in docs. `market_type: ORDERBOOK` for all. (H)
- Tokenisation: not tokenised on chain. `token_id` "0" = Yes, "1" = No in the API; internal ledger positions only. (H: api-docs)
- Series: `CV_{ASSET}_{TF}_UP_DOWN-DDMMMYYYYHHMM` event codes; assets BTC, ETH, SOL, HYPE, PEPE, GOLD, SILVER, OIL; timeframes 5m, 15m, 1h, 1d, 1w, 1m. (H: markets filterSchema)
- Observed `indicative_pricing` ("shadow_v1" model) shows model fair value vs the 0.5 default book price: display price comes from `indicative_fair_value` when the book is empty. Do NOT treat `display_yes_price` as a tradable quote. (H)

## Chains and collateral
- Chain: NOT FOUND (searched: /terms, /faq, /about, /fees, /how-it-works, api-docs). FAQ says "blockchain rails may be used only where supported for deposits or withdrawals". Terms say values are denominated in USDC; fees page and API use "usdW". (H)
- Wallet login supported (MetaMask, WalletConnect, Coinbase Wallet) and `POST /api/wallet/connect` takes an address + signed message; withdrawals to an `0x` address. Network not stated. (H)
- Custody: centralized; "NOT insured". Governing law British Virgin Islands. (H: /terms)

## Read API
- Official, public + session-authenticated REST. Docs: https://coinverse.io/api-docs (H). Base `https://coinverse.io` (no separate api host; api.coinverse.io does not resolve). (H)
- Public (no auth) endpoints per docs: `GET /api/prices`, `/api/markets/live-price/{asset}`, `/api/clob/orderbook/{market}?token_id=`, `/api/clob/midpoint/{market}`, `POST /api/clob/midpoints` (batch, read-only POST, not tried), `/api/clob/spread/{market}`, `/api/clob/best-price` (needs market_id, side, token_id), `/api/clob/trades/{market}`, `/api/clob/outcome-chart/{market}`, `/api/markets/{market}/fifteen-minute-chart`, `/api/news`, `/api/macro`, `/api/search?q=`, `/api/search/suggest?q=`. (H)
- Market LISTING endpoint: NOT FOUND in docs. The only full listing seen is the Inertia `data-page` JSON embedded in `GET /markets` (returned 127 markets, ~650KB HTML, capped by `marketWindowLimit` 250). Scraping HTML is fragile; `/api/search` only returned CLOSED high-volume markets for the queries tried. (H)
- Resolution data: `resolved_outcome`, `winning_option_id`, `resolved_at` fields in market objects; no dedicated resolution endpoint documented. (H)
- Rate limits (H, api-docs): 60 req/min per IP general; order placement 10 req/min per user; deposit/withdraw 10 req/min; login 5 req/min.
- WebSocket: "Coming Soon" in docs. Not available. (H)
- Doc quality warning: docs examples are dated 2026-03-29 and sample values (BTC 87432) differ from live; the doc's `/api/prices` example shape (`{"BTC":{"price"...}}`) does NOT match live shape (`{"bitcoin":{"usd":..,"usd_24h_change":..}}`). Docs lag the implementation. (H, compare fixtures)

### Confirmed live response shapes (fixtures in docs/research/fixtures/coinverse/)
- `GET /api/prices` -> `{"bitcoin":{"usd":82951,"usd_24h_change":1.67},"ethereum":{...},"solana":{...},"gold":{...},"silver":{...}}` (api_prices.json)
- `GET /api/markets/live-price/BTC` -> `{"asset","price","change_24h","source":"coingecko","updated_at"}` (api_live_price_btc.json). Note source is CoinGecko, which the resolution page calls tertiary/UI-only.
- `GET /api/clob/orderbook/304188?token_id=0` -> `{"bids":[],"asks":[],"hash","token_id","currency":"USD","last_trade_price":null,"last_trade_size":null}` (empty). Docs show bids/asks as `[price,size,count]` arrays; no live non-empty book was available to confirm. (H for empty shape, L for populated shape)
- `GET /api/search?q=bitcoin` -> `{"data":{"markets":[{id,title,subtitle,url,asset,probability,category,event_type,timeframe,event_code,outcomes...}],"news":[...]}}` (api_search_bitcoin_trimmed.json)
- `/markets` Inertia props sample (markets_page_inertia_props_sample.json): market objects with `options[].yes_price/no_price/open_interest/volume`, `volume_usd`, `volume_usdw`, `close_time`, `resolution_source` ("series_rollover"), `reference_price`.

## Trade path
- Programmatic: `POST /api/clob/order` {market_id, side buy/sell, token_id "0"/"1", price 0.01-0.99, size 1-5000}; `DELETE /api/clob/order/{hash}`, `DELETE /api/clob/orders`; `GET /api/clob/orders|fills`. (H, api-docs; not exercised)
- Auth: Laravel Sanctum cookie session (`GET /sanctum/csrf-cookie`, `POST /login` with email+password, `X-XSRF-TOKEN`). "Coinverse does not use Bearer tokens or API keys." Login on the live site is also via social/wallet; password-login for bots is undocumented beyond the example. (H)
- No order signing; no on-chain settlement. Orders are plain JSON after a cookie session.
- Account creation uses Cloudflare Turnstile (siteKey seen in props) and email verification, so unattended bot onboarding is not supported. (H/M)

## PayBox reachability
- paybox_reachable: **no**. PayBox transaction proposals / signed orders cannot place orders (no on-chain contracts, no order signature scheme). The only wallet interaction is login-by-signature and deposit/withdrawal to an unstated network (partial at best: a deposit transfer from a PayBox wallet might be possible but the rail/chain is undocumented; custodial risk). (H for no signed orders; M for deposit speculation)

## Fees (H: /fees, /liquidity-program, api-docs)
- Taker 2% on matched trades (taker pays); maker 0% with rebates for liquidity-program tiers; 1% winner fee on net profit at settlement; no sell/cancel/redemption fee; withdrawal "network and processing fees may apply". Fee rates are "configurable" by the platform. Fee split: 50% of fees to VRS referral pool, 1.5% of trading fees to leaderboard pool (docs `/api/fees/summary`: fee_rate 0.02, leader_pool_rate 0.015, platform_rate 0.005).
- Worked example: buy at 0.40 with 100 usdW -> 2 usdW taker fee, 98 net -> 245 shares (page prints these numbers; arithmetic shown as 245 = 98/0.40).

## Resolution
- Operator-managed. Settlement Index Price (SIP) = VWAP over a short window (2m hourly, 5m daily, 10m weekly, 30m monthly) from "institutional vendor" feeds with a secondary fallback; if both fail, "manual review". "Markets are resolved manually by a designated resolver ... no automated oracle verification in the current version" (/how-it-works). The data vendor is not named. Outcome is final once settlement completes except for "operational error, fraud, or policy basis". (H)
- Up/Down tie (SIP close == open): resolves NO for both sides (flat). Differs from most venues - matters for any cross-venue hedge. (H)
- Dispute risk: high; no appeal/oracle mechanism, centralized discretion, unnamed operator.

## Geo / ToS / automation (H: /terms, /trading-prohibitions)
- Prohibited jurisdictions include US and territories, UK, France, Germany, Belgium, Italy, Netherlands, Poland, Switzerland, Singapore, Australia, China, HK, Taiwan, Thailand, Ontario and others; VPN circumvention banned; KYC may be required; one account per person.
- Automation: ToS lists "Unauthorized automated trading: Bots or scripts without approval or in violation of rate limits" and "Unauthorized scraping: Accessing data beyond documented API limits". So automated trading requires approval; staying within documented public API limits for reads is permitted. Market-maker/API access is granted via application (/market-makers, /liquidity-program).
- Operator unnamed; unregulated; governed by BVI law; pmwisdom lists it as unregulated and geo-restricted (M).

## Liquidity
- Volume/OI: open markets total volume_usdw 265.46 and volume_usd 0 across 127 open markets (single market 304188 "$120 or above", closes 2026-10-31) (H, /markets props fetched 2026-10-19). Order books for that market and one 5m Up/Down market were empty (H).
- Historical per-market volumes seen in /api/search: top closed markets show "$13K vol" (hourly BTC), "$4K" (15m ETH), "$3-4K" (gold ranges Apr 2026); units are unclear and may be usdW (incentive currency) (H for numbers, L for meaning).
- Platform-wide volume/TVL: NOT FOUND (searched: home, /markets, pmwisdom, about). A web search was blocked by the session search budget, so no third-party volume data was gathered.
- Shared liquidity with another venue: no evidence of it; independent but near-empty. Prices appear anchored to its own model (`indicative_fair_value`) and CoinGecko reference, not to another prediction venue.

## Event category overlap (arbitrage relevance)
- Crypto price (BTC/ETH/SOL/HYPE/PEPE Up/Down and Above/Below) and commodities (gold, silver, oil) overlap Polymarket/Kalshi/Limitless short-window crypto markets in principle, but Coinverse has no depth, different VWAP-window settlement rules, a 2% taker + 1% winner fee, and tie-resolves-NO semantics, so edge is not capturable. Macro/politics/sports: none listed currently (home copy mentions Fed/election markets but none open). (H)
- Signal use: `indicative_fair_value` is a model-derived probability from spot vs strike, not a crowd signal; low signal value. Do not use as a Quotient-style signal.

## Suspicious content
- None found. The site embeds an AI chatbot (`/api/chatbot/message`); not used. No agent-directed instructions observed. Docs list a security contact only for vulnerability reports.

## Privacy
- All requests used User-Agent `insurance-markets-research/0.1`; no emails or identifiers sent. One contact address (vendor info@, from their own page) is not reproduced in requests. Scripts grepped; fixtures contain no personal data.

## Open questions
- Is a market-list JSON endpoint (e.g. `/api/markets`) available? Not documented and not probed beyond documented hosts/paths.
- What is usdW worth, is it redeemable for USDC, and on what chain are deposits/withdrawals?
- Is real-money trading actually enabled (the About page says test tokens; Terms say USDC)?
- Who is the operator and who is the "institutional" data vendor?

## Sources
- https://coinverse.io/ (H, 200 on 2026-10-19; Inertia props: lastResolvedAt, rapid-market schedule from 2026-05, presale ended, staking)
- https://coinverse.io/api-docs (H; read via the ApiDocs JS chunk because the page is client-rendered)
- https://coinverse.io/markets (H; Inertia `data-page` props)
- https://coinverse.io/fees, /terms, /trading-prohibitions, /risk-resolution, /resolution-sources, /how-it-works, /faq, /about, /incentive-program, /liquidity-program, /market-makers (H)
- https://coinverse.io/robots.txt (H: allow all)
- https://pmwisdom.com/projects/coinverse (M; directory entry: beta, founded 2026, unregulated, no volume reported)
- WebSearch: not performed (session search budget exhausted); no independent third-party corroboration of volume, ownership, or reputation.
