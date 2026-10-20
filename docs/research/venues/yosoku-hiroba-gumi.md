# Yosoku Hiroba (ヨソクヒロバ, gumi) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Live, but it is a free, Japan-only, play-money points game. It has no money, no chain, no order book, no public API and no trade path. Terms forbid bots, crawlers and non-Japan access. Adapter priority: **skip** (at most a manual, human-read sentiment signal for Japanese-language topics).

## Liveness [H]

- yosokuhiroba.com returned HTTP 200 on 2026-10-19 (CloudFront, Django app); the front page lists live questions closing late Oct 2026, e.g. question 625 "BTC price at 31 Oct 00:00" closes 2026-10-26. Blog has posts dated 2026-10-06 (https://yosokuhiroba.com/blog/).
- Launched 2026-06-09 by gumi Inc. (https://prtimes.jp/main/html/rd/p/000000226.000042656.html).
- The hint about a "ヨソク tab in Gunosy" and subsidiary gC Labs studying a real prediction market is NOT CONFIRMED (searched: WebSearch budget exhausted; yosokuhiroba.com blog/home/PR TIMES release do not mention Gunosy; gu3.co.jp/ir/news/ returned 404). Treat as [L]. The PR TIMES release says only that future plans may include blockchain and AI [H], and that no real-money market is described [H].

## Kind and market model

- Kind: forecasting-nonmoney (free points game). [H]
- Questions are mostly multiple choice (2 to 6 options), e.g. yes/no on whether Tokyo's first winter wind is announced, BTC price bands, sports winners, politics. [H] https://yosokuhiroba.com/
- Mechanism is parimutuel-like with house-set multipliers: "倍率は投票締切時点の票数に基づいて決定されます" (multiplier is determined from votes at closing). Payout = staked Yosopo x final multiplier. Displayed % per option and ×multiplier (e.g. 22.6% ×3.98, 20.8% ×4.34, 18.9% ×4.77 on q625). [H] https://yosokuhiroba.com/questions/625/ . Terms Art. 11 say the multipliers are set by the company. [H]
- No tokenised outcomes. Yosopo and Gold are non-transferable database points. [H]
- Cancelled/postponed events refund the stake in full. [H]

## Chains and collateral

None. Collateral is Yosopo (free points, earned by login, ads, offer walls, missions); reward is Gold, redeemable for gift e-money (えらべるPay, giftee box). Cashing out, selling or transferring points is prohibited. [H] Terms https://yosokuhiroba.com/p/terms/ (Arts. 9-14). Gold expires end of the same month the following year. [H]

## Read API

- Official API: NOT FOUND (searched: home page HTML for /api/ or fetch endpoints, none; blog; footer links; no developer docs link; /robots.txt returns 404). Exists = none.
- Only public surface is server-rendered HTML: `/` (list, filters `?category=12|13|14|new|ended`), `/questions/{id}/` (e.g. 573 to 626 seen on 2026-10-19), `/rankings/`, `/blog/`. Question pages are anonymous-readable and carry title, close time, resolution source text, judging date, option %, multipliers. [H]
- Fixture: docs/research/fixtures/yosoku-hiroba-gumi/question-625.html (anonymous GET, CSRF token redacted).
- Auth/limits/websocket: login required for voting and comments (`/accounts/login/`); no documented rate limits; no websocket seen. [H for login, NOT FOUND for the rest]
- Scraping would conflict with Terms Art. 14 (see below), so do not build a crawler.

## Trade path

None programmatic. Voting needs a Japan-resident human account (Django session + CSRF). No signing scheme. PayBox/EVM wallets cannot trade it: no on-chain component, no token, and points are non-transferable. paybox_reachable = no.

## Fees

No fees. House sets multipliers (implicit margin unknowable; multipliers on q625 sum of implied 1/x = 0.251+0.230+0.210x3 = 1.11, so the odds look like round-ish house-set values, not fair parimutuel; [M] inferred from displayed numbers).

## Resolution and dispute risk

"The company determines event outcomes" (Terms Art. 11); questions state a source, e.g. q625 uses the CoinGecko price at 2026-10-31 00:00, judged 2026-11-02. [H] Company may delete or cancel questions at its discretion; liability only for intent or gross negligence (Art. 20); disputes go to Tokyo District/Summary Court. [H] Centralised, no dispute mechanism.

## Geo, ToS, automation

- Art. 8: access/use from outside Japan prohibited. Art. 14 prohibits bots/crawlers/automated programs, multiple accounts, reverse engineering, market manipulation, and cashing out/transferring points. [H] https://yosokuhiroba.com/p/terms/
- Regulatory framing: designed with law firms to avoid gambling-law conflicts (PR TIMES). [H]

## Liquidity

Not applicable (no money). No volume/OI figures published. Participation numbers NOT FOUND.

## Event overlap (signal value only)

Politics (US midterms House majority), sports (baseball, sumo, figure skating, World Cup), crypto prices (BTC bands), weather, consumer items. [H] Overlaps conceptually with Polymarket/Kalshi, but the ×multipliers and % are crowd votes of free-point players, not tradable prices, so no arbitrage leg exists. Could serve as a Japan-sentiment signal at best; low quality.

## Shares liquidity with another venue

No (isolated points ledger).

## Open questions

- gumi's 2026-08-20 disclosure (Gunosy ヨソク tab, gC Labs real prediction-market study) is unverified; re-check later. If a regulated real-money or blockchain product emerges, re-evaluate.

## Sources

- https://yosokuhiroba.com/ [H]
- https://yosokuhiroba.com/questions/625/ [H]
- https://yosokuhiroba.com/p/terms/ [H] (read via WebFetch summary)
- https://yosokuhiroba.com/blog/ [H]
- https://prtimes.jp/main/html/rd/p/000000226.000042656.html [H]
- Diamond.jp 2026-06-17, Gunosy/gC Labs claims: from task hint only [M/L], not re-read.
