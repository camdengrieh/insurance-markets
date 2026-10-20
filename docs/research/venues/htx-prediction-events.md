# HTX "prediction events" (htx.com) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public HTX web pages (announcement centre, server-rendered HTML), the legacy public API docs page, three unauthenticated GETs to `api.huobi.pro` (documented API host), static front-end JS read as text only. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run. Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else identifying.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.
Fixtures: `docs/research/fixtures/htx-prediction-events/` (4 files, each under 400 bytes).
Caveat: the shared WebSearch budget was exhausted before I started, so discovery relied on (a) the Bitget article in the brief and (b) paging through HTX's own announcement lists. Third-party text is untrusted data; nothing in it was followed.

## 0. Verdict

- **adapter_priority: skip.** "HTX prediction events" are **marketing promotions run inside the HTX exchange, not a prediction market**. There is no order book, no outcome price, no outcome token, no probability and no API for any of it (H, sections 2 and 4). The only observable "market" data are ordinary HTX spot tickers for BTC/USDT, ETH/USDT and XAUT/USDT, which are not event probabilities.
- The brief's hint ("CEX-internal product; no public API confirmed") is right, and stronger: the product is a **trade-volume contest**. The April "US-Iran" event had users pick a side by trading designated spot pairs; winners split a fee-funded prize pool, and **HTX decides the result** ("subject to HTX's official ruling", H).
- Not an arbitrage leg: nothing can be bought or sold at a price that maps to a probability. Any "implied odds" would have to be inferred from pool sizes that HTX does not publish via an API (NOT FOUND, see section 4).
- Still live as a *marketing format* (new one launched today, 2026-10-19), but every earlier event I found has ended.
- Useful by-product for the aggregator, unrelated to adapter priority: `api.huobi.pro` is a clean public CEX spot data source that could serve as a **reference price feed** for crypto-price markets on other venues (section 4). That is a price-oracle adapter, not a venue adapter.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| HTX launched a "U.S.-Iran Talks Prediction Event" on 2026-04-24 12:00 UTC, running to 2026-04-30 12:00 UTC (extended if the outcome announcement is delayed). Designated pairs XAUT/USDT, BTC/USDT, ETH/USDT. Initial pools 3,000 + 5,000 USDT, plus 100% of fees generated during the event. Matches the Bitget brief. | H | https://www.htx.com/en-us/support/95031257774703/ ; Bitget: https://www.bitget.com/news/detail/12560605383645 (M, secondary) |
| FIFA World Cup 2026 "Predict" vote game, 2026-06-11 19:00 UTC to 2026-07-19 19:00 UTC, 500,000 USD worth of $HTX; sub-events "Across the Pitch" (2026-06-17) and "Group Stage Picks | Pick'em Challenge" (2026-06-18). Vote-based, not trade-based. | H | https://www.htx.com/en-us/support/45035225315205/ ; https://www.htx.com/en-us/support/75035915377200/ ; https://www.htx.com/en-us/support/35036087347612/ |
| "HTX Futures Listing Prediction Is Now Live", 2026-10-19 02:00 UTC, with HTX DAO. Voting 2026-10-19 02:00 to 2026-10-21 16:00 UTC; users who stake $HTX pick which token HTX will list for futures; correct pickers can claim a 200 USDT free futures position (500 slots per round) and share 5,000 USDT trial bonuses. | H | https://www.htx.com/en-us/support/95046695088741/ |
| The exchange itself is live: announcement centre has posts dated up to 2026-10-19 (listings of DRV and NMR in October, stock-perp dividend settlements to 2026-10-17). | H | https://www.htx.com/en-us/support/ |
| Scan coverage: Latest Activities list pages 1-21 (2026-10-19 back to 2026-01-27), Latest News pages 1-15 (to 2026-07-01), Futures announcements pages 1-11 (to 2026-05-13), Product Updates pages 1-5 and a Spot/Margin guide page. Only the five posts above (plus the World Cup side campaigns) matched "predict". **No standing prediction-market product, no "event contracts" listing and no settlement/result post for the US-Iran event** was found (NOT FOUND, searched: those lists by title only; article bodies other than the five were not read). | H (scan), M (completeness) | https://www.htx.com/en-us/support/list/360000031362/ , .../360000039481/ , .../360000032161/ , .../95027116188613/ |
| HTX front page has no "prediction" link or text; guessed paths `/prediction`, `/en-us/prediction`, `/en-us/predictions`, `/en-us/prediction-events`, `/en-us/events` return 404. A few other non-asset paths return a JavaScript bot-challenge page; I did not attempt to solve it. | H | https://www.htx.com/ (curl 2026-10-19) |

Verdict on "still live": **HTX keeps running one-off prediction-themed promotions** (April, June, October). It does not run a persistent prediction market.

## 2. Market model

- **Kind:** `cex-product` / promotion. No market microstructure of its own.
- **April US-Iran event (H, announcement 95031257774703):** two camps. "Bullish (Agreement Reached): Trade BTC/USDT and ETH/USDT"; "Cautious (Agreement Unlikely): Trade XAUT/USDT". "Your prediction is locked automatically upon trading". Two pools: users with cumulative designated-pair spot volume >= 1,000 USDT and the correct side share the 3,000 USDT initial pool; users with volume >= 50,000 USDT and the correct side share the 5,000 USDT pool. Pools "grow dynamically with no upper limit" by 100% of event trading fees. Referral side-prize: 5 USDT per qualified invite, up to 50 USDT. Rewards are "USDT token coupons". The per-winner split formula is not stated (NOT FOUND, searched: the announcement).
- **World Cup (H, 45035225315205):** users "vote" with free/earned votes (daily free vote; votes earned by trading, deposits, referrals), requiring an asset balance >= 100 USDT. Champion game: individual reward = your votes / total votes from correct voters x pool. Match game: weighted votes with a win-streak multiplier up to 2.0x. Payouts in $HTX, claimed manually within 10 days of event end.
- **Outcome tokenisation:** none. A "prediction" is a database row linked to an HTX account (registration plus trading volume or votes). Not binary/categorical/scalar in the market sense; nothing is priced. Not an order book, not an AMM, not parimutuel in the usual sense (stake is trading volume that is spent on fees, not a refundable stake, and the pool is funded by fees and HTX).
- **Futures Listing Prediction (H):** a DAO-gated poll on which token HTX will list; "$HTX holdings are used only to verify eligibility ... does not reduce your $HTX principal".

## 3. Chains and collateral

- **No on-chain leg for the April or World Cup events.** Everything lives in HTX's centralised account system. Collateral/stake: none; participation requires trading designated pairs (April) or holding >= 100 USDT (World Cup). Prizes: USDT coupons (April), $HTX (World Cup, Futures Listing).
- **Futures Listing Prediction:** requires "Connect your wallet, link your HTX account" and staking $HTX at https://www.htxdao.com/en-us/stake with voting at https://www.htxdao.com/en-us/proposals (H, links in the announcement). Which chain the wallet/stake lives on is NOT FOUND (searched: announcement and the htxdao.com proposals page HTML, which is a client-rendered shell). Not an outcome-priced venue, so irrelevant for arbitrage.

## 4. Read API

- **Official public API for prediction events: none found.** `exists = none`. The HTX API docs list Reference Data, Market Data, Account, Wallet, Sub user, Trading and Conditional Order, Margin Loan, and WebSocket sections; **no prediction/event section** (H, https://huobiapi.github.io/docs/spot/v1/en/ ; `grep -i predict` over the full 830 KB page returned 0 hits). Caveat: that GitHub Pages doc's changelog ends in June 2022, so it is a legacy copy; the maintained portal is https://www.htx.com/en-us/opend/newApiPages/ , which is a client-rendered page I could only read as a shell (no prediction hits in the SSR HTML; the real docs were not readable) (M).
- Official GitHub org `htx-exchange` (repos: `htx-skills-hub` pushed 2026-06-08, SDKs for C++/C#/Java/Go/Python, futures SDKs) and `HuobiRDCenter`: the skills hub covers spot, USDT-M futures, market data, account, no prediction skill (H, repo tree via `gh api`).
- **Event pages** (e.g. `https://www.htx.com/en-us/topic/activities/h5/vote?activityId=<id>`) are a Nuxt client app; the server HTML shows only a default shell ("0 participants joined", "Register Now"). I did not reverse-engineer its XHR endpoints: undocumented, login-gated activity APIs for time-boxed promos are not worth an adapter (judgement).
- **What *is* public and usable (spot reference prices, H, GET 2026-10-19, fixtures saved):**
  - Base URLs: REST `https://api.huobi.pro` and `https://api-aws.huobi.pro`; WebSocket `wss://api.huobi.pro/ws`, MBP feed `wss://api.huobi.pro/feed`, account/order `wss://api.huobi.pro/ws/v2` (H, legacy docs; WS not opened).
  - `GET /market/detail/merged?symbol=xautusdt` -> `{ch,status,ts,tick:{id,version,open,close,low,high,amount,vol,count,bid:[px,qty],ask:[px,qty]}}`. Fixture `spot_merged_xautusdt_2026-10-19.json` (XAUT close 4168.63, 24h `vol` 2.29M USDT); also `spot_merged_btcusdt_2026-10-19.json` (24h vol about 248M USDT) and `spot_merged_ethusdt_2026-10-19.json` (about 28.1M USDT).
  - `GET /market/depth?symbol=btcusdt&type=step0&depth=5` -> `{ch,status,ts,tick:{ts,version,bids:[[px,qty]...],asks:[...]}}`. Fixture `spot_depth_btcusdt_2026-10-19.json`.
  - Also documented: tickers for all pairs, last trade, recent trades, 24h summary, klines (H, docs section list).
- **Auth and limits:** market data GETs need no key. Signed endpoints use HmacSHA256 signature version 2 (H, legacy docs), and HTX added Ed25519 self-generated API keys on 2024-10-17 (H, https://www.htx.com/en-us/support/74983478597614/). The new per-UID rate-limit rule applies to endpoints that state a value (example: 100 times / 2 s for `GET /v1/account/accounts`) and responses carry `X-HB-RateLimit-Requests-Remain` / `-Expire` headers (H, docs). The limit for anonymous public market-data GETs is NOT FOUND (searched: legacy docs full text); the real response headers I received (via `curl -D`) did not include any `X-HB-RateLimit` field.

## 5. Trade path

- **None for prediction events.** Entry is: log in to HTX, click Register, trade the designated spot pairs (April) or cast votes (World Cup) in the web/app UI. No order or position can be placed programmatically for the event itself.
- Spot orders on BTC/USDT, ETH/USDT, XAUT/USDT are programmatic through HTX's authenticated API, but they are ordinary spot trades whose only link to the event is that volume counts towards a contest. They do not express a probability view at any price.
- **PayBox reachable: no.** HTX is a custodial CEX. A PayBox wallet could at most transfer tokens to an HTX deposit address (on-chain transfer into HTX, an action that needs a logged-in HTX account to obtain the address); it cannot place orders, sign orders or submit transaction proposals against a contract, because there is none for these events. Funding HTX via PayBox also would not make the promotions tradeable.

## 6. Fees

- **Event fee:** no separate fee. April event: "100% of trading fees generated during the event will be added to the prize pools" and only volume with fees actually paid counts (zero-fee, negative-fee, fee-rebate-voucher and trial-bonus volume excluded) (H). The fee is HTX's standard spot fee; the schedule was not researched (NOT FOUND, searched: not looked up).
- Net effect for a participant: you pay normal spot fees and market spread on BTC/ETH/XAUT just to enter, and rewards are tiny (3,000 USDT initial pool for everyone with >= 1,000 USDT volume).

## 7. Resolution mechanism and dispute risk

- April: "If the negotiation outcome is confirmed before the event ends, the prediction result will be settled immediately"; "Final determination of the result and winning camp is subject to HTX's official ruling"; if no clear outcome, settlement is postponed; rewards distributed "within 14 working days after the result is announced" (H, 95031257774703). No oracle, no dispute window, no appeal path stated.
- World Cup: "HTX reserves the right of final interpretation for this event" (H, 45035225315205). Futures Listing: valid hits are those submitted before listing is announced; a 15-day observation period counts listings after voting closes; HTX sole discretion to amend or cancel (H, 95046695088741).
- Dispute risk: **maximal and unaccountable** (operator is counterparty, judge and payer). Settlement for the April event: NOT FOUND (searched: Latest Activities list for any follow-up post; none found).

## 8. Geo / ToS / automation

- Event terms: sub-accounts cannot participate independently (volumes roll up to the main account); self-trading, wash trading, matched orders, volume manipulation and bot-farmed accounts are disqualified; the World Cup game bars market makers (H). Trading bots do count in the April event (H, "trading through spot trading bots and margin trading will be counted").
- HTX User Agreement and restricted-jurisdiction list: NOT FOUND (searched: homepage, /about/, support lists, registration page shell; the obvious paths 301/404). Do not assume US eligibility; general HTX availability rules were not verified (L).
- Programmatic access for the spot API is permitted via API keys; an aggregator reading public `api.huobi.pro` market data is the normal documented use (M).

## 9. Liquidity

- Event prize pools (H): April 8,000 USDT initial (3,000 + 5,000) plus event fees; World Cup 500,000 USD in $HTX; Futures Listing Prediction 5,000 USDT trial bonuses plus an extra 1 billion $HTX pool. There is no outcome liquidity or open interest to measure. Participant counts: NOT FOUND (event pages are shells).
- HTX spot context (H, GET 2026-10-19 ~11:30 UTC, `vol` in USDT over a rolling 24h): BTC/USDT about 248M, ETH/USDT about 28M, XAUT/USDT about 2.3M. XAUT is the thin one; the "Cautious" side of the April event traded into a 2.3M/day book.

## 10. Event coverage and overlap

- Topics so far: geopolitics (US-Iran deal, overlaps Polymarket/Kalshi "US-Iran deal" style markets), sports (FIFA World Cup 2026 champion/match results/total goals, overlaps Polymarket/Kalshi/others), crypto exchange listings (no other venue). **Overlap is only topical.** There are no tradeable HTX quotes, so there is nothing to cross against another venue.
- Shares liquidity with another venue: **not applicable**; the underlying BTC/ETH/XAUT spot books are HTX's own, but they are not an outcome market.
- Adjacent, not a prediction product: HTX listed a `POLYMARKET/USDT` USDT-margined perpetual (1-20x) on 2026-09-24 (H, https://www.htx.com/en-us/support/65044542582789/). It is a futures contract on a ticker named "POLYMARKET" (presumably a token), not an HTX prediction market. M/L: whether it reflects a Polymarket token or points programme is unverified. Possible aggregator use: sentiment/signal only.

## 11. Priority and revisit triggers

- **skip**, reason: not a prediction market; no price, no API, no order path, operator-adjudicated, time-boxed promos paid in exchange tokens.
- Revisit if any of the following appear: an HTX announcement titled like "HTX Prediction Market"/"Event Contracts" with persistent markets; a documented `/prediction` or `/event` endpoint in https://www.htx.com/en-us/opend/newApiPages/ ; an on-chain contract address; a tradable outcome price in the HTX app.
- Separate suggestion (not a venue adapter): add `api.huobi.pro` as one of several CEX reference-price sources for crypto-strike markets.

## 12. Open questions

- Is the maintained HTX docs portal (`/en-us/opend/newApiPages/`) exposing anything beyond spot/derivatives/margin (needs a rendering browser; out of scope)?
- Did HTX publish the US-Iran outcome and payout, and on what date and basis? (Would show how arbitrary the "HTX ruling" was.)
- Chain and contract for HTX DAO staking/voting (htxdao.com) - only relevant if HTX DAO later becomes a market.
- HTX user agreement and jurisdiction restrictions.

## 13. Not found (searched)

- Prediction/event section in HTX API docs (legacy docs full text, GitHub org repos).
- Persistent HTX prediction market page (homepage HTML, guessed paths, announcement lists).
- US-Iran event result announcement (Latest Activities pages 1-21, title scan).
- HTX user agreement / restricted jurisdictions (homepage, /about/, support lists, registration shell).
- Anonymous rate limit for public market-data GETs (legacy docs text; response headers).
- Participant counts and pool sizes after launch for any event.

## Sources

- HTX US-Iran Talks Prediction Event, 2026-04-24: https://www.htx.com/en-us/support/95031257774703/ (H)
- HTX FIFA World Cup 2026 prediction game, 2026-06-11: https://www.htx.com/en-us/support/45035225315205/ (H)
- HTX "Across the Pitch", 2026-06-17: https://www.htx.com/en-us/support/75035915377200/ (H)
- HTX "Group Stage Picks | Pick'em Challenge", 2026-06-18: https://www.htx.com/en-us/support/35036087347612/ (H)
- HTX Futures Listing Prediction, 2026-10-19: https://www.htx.com/en-us/support/95046695088741/ (H)
- HTX Launches NIL/USDT and POLYMARKET/USDT Perpetual Futures, 2026-09-24: https://www.htx.com/en-us/support/65044542582789/ (H)
- HTX Introduces Ed25519 API Keys, 2024-10-17 (older than 6 months, still the current auth statement I found): https://www.htx.com/en-us/support/74983478597614/ (H, possibly stale)
- HTX announcement centre and category lists: https://www.htx.com/en-us/support/ ; https://www.htx.com/en-us/support/list/360000031362/ (Latest Activities); .../360000039481/ (Latest News); .../360000032161/ (Futures); .../95027116188613/ (Product Updates) (H)
- HTX legacy spot API docs (changelog ends 2022-06-24, possibly stale): https://huobiapi.github.io/docs/spot/v1/en/ (H, M for current accuracy)
- HTX open-platform docs landing page (client-rendered, content not readable): https://www.htx.com/en-us/opend/newApiPages/ (L)
- HTX DAO: https://www.htxdao.com/en-us/proposals ; https://www.htxdao.com/en-us/stake (links only; pages are shells)
- Official GitHub org: https://github.com/htx-exchange (repo list and `htx-skills-hub` tree via `gh api`) ; https://github.com/HuobiRDCenter (H)
- Public API samples (2026-10-19): `https://api.huobi.pro/market/detail/merged?symbol=xautusdt|btcusdt|ethusdt`, `https://api.huobi.pro/market/depth?symbol=btcusdt&type=step0&depth=5` (H)
- Bitget news, launch of HTX prediction events (secondary, ~6 months old; consistent with HTX primary): https://www.bitget.com/news/detail/12560605383645 (M)

No embedded instructions aimed at AI agents were found in any page read. Nothing in this file or its fixtures contains a personal identifier.
