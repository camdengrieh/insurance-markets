# Minsim Market (민심마켓) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Live (H), but it is NOT a market: a free-to-play, Korea-only, play-coin prediction/vote app. No money in, no tradable positions, no order book, no public API, ToS explicitly bans scraping predictions/percentages and bots. adapter_priority = skip.

## Liveness (H)
- App Store KR id6754787403, "민심마켓 : 한국형 폴리마켓 polymarket", seller minsimmarket Co., Ltd, bundle io.minsim.app, released 2026-01-02, current version 1.3.11 released 2026-07-30, 43 ratings, avg 4.65. Source: https://itunes.apple.com/lookup?id=6754787403&country=kr
- Website https://minsim.io live; sitemap lastmod 2026-10-19; prediction cards created through 2026-10-18 (image filenames); ToS effective 2026-10-10. Sources: https://minsim.io, https://minsim.io/sitemap.xml, https://minsim.io/legal/terms-of-service

## Kind / market model (H)
- Kind: forecasting-nonmoney (play-coin, vote-style). Yes/No ("예"/"아니오") cards with a D-day countdown; predictions can be changed; also "승부예측" (match predictions: KBO, LoL, World Cup per app store text), "이슈예측" (issues), "민심마켓" (votes). Categories on site: Politics, Economy, Society & Culture, Entertainment. (minsim.io; app description)
- No order book, AMM, or parimutuel pool. The displayed "승률" (implied probability) is computed by the company from member choices, with weights by grade and hit rate (Bronze..Oracle seasonal tiers); exact weights may be kept private. ToS says the percentages are not polls. (ToS art. 2, 11, 15; app description, "patent pending" weighted-vote algorithm - claim by the operator, L)
- No tokenisation of outcomes; no on-chain component found.
- The /votes page listed only one card when fetched: a sponsored lottery quiz (65 entries, 10 winners). No per-outcome percentages shown on that fetch (H, WebFetch of https://minsim.io/votes, via a summarising model, so M for completeness).

## Chains / collateral
None. Collateral is free "coins" (welcome 100 coins, 500 on invite per app store text). Coins are not money, non-transferable, expire (6 months / season end), and cannot be converted to cash, e-money, or crypto (ToS art. 10, 27, 28, H). Redeemable only for company-chosen gift items (chicken, cafe, etc.) via the 교환소 / gift box at company-set rates (art. 32).

## Read API
- Official public API: NOT FOUND (searched: minsim.io homepage and footer, /docs, /api, sitemap, robots.txt, WebFetch of site; GitHub/web search not possible, search budget exhausted).
- minsim.io robots.txt has `Disallow: /api/` for all agents (H). `https://api.minsim.io/` exists and returns a JSON 404 (`{"statusCode":404,"code":"NOT_FOUND","message":"Cannot GET /"...}`) (H) - a private backend for the web/app client. I did not probe undocumented endpoints.
- No websocket, rate-limit, or auth docs found.
- Fixtures: none saved (no public API response to capture).

## Trade path
None. Participation requires Kakao/Apple login, possibly identity verification (certified provider), age 14+ (ToS art. 6, 7, 22, H). No signing, no orders, no wallet. Not reachable from a PayBox wallet on any chain. Bots/macros/automation explicitly prohibited (art. 21, 35).

## Fees
None (free). No money flows in; the company funds gift items.

## Resolution / dispute risk
Company-controlled: it creates/edits/deletes questions and options, decides grading by pre-announced rules, and can void rounds with "compromised data" (ToS art. 10, 15, 36, H). Single-operator discretion; no dispute mechanism comparable to UMA/oracle. Operator may pause sign-ups and percentage display before elections (art. 15-2).

## Geo / ToS / automation (H, ToS effective 2026-10-10)
- Korean law/courts; no explicit country block in ToS, but Kakao login + possible Korean certified identity verification makes it effectively Korea-only (M).
- Prohibited: multiple accounts, macros/bots, "scraping or copying service data, including predictions, percentages, and rankings", use of data for competing services or AI training, excessive requests (art. 21, 35). Search-engine indexing exempt. Sanctions: coin clawback, bans, IP/device blocks.
- Operator states legal review done and "no gambling" (app store text, L - operator marketing).
- Operator says it shares pseudonymised prediction data with media/companies (art. 15) - possible licensed data route, NOT FOUND as a product.

## Liquidity
No volume/OI/TVL concept. Only engagement figures: per-card views ~8.8k-10.9k and "152 predictions" in a ticker window (homepage fetch, 2026-10-19, M). App has 43 App Store ratings (2026-10-19, H) - small user base. Operator claims of "78% presidential result accuracy" etc. are marketing, unverified (L).

## Event overlap with other venues
Korean politics (elections, PM nomination), KBO, LoL, World Cup, entertainment, economy: overlaps topically with Polymarket/Kalshi on some sports/politics, but prices are not tradable and not independent probabilities in an arbitrage sense. Possible use: a weak Korean-sentiment signal only, and ToS forbids scraping percentages.

## Shared liquidity
None (no liquidity). Not a fork of Polymarket despite the "Korean-style Polymarket" title.

## Adapter priority: skip
No API, no tradable instrument, scraping prohibited, tiny audience. At most a manual/licensed signal source for Korean-politics sentiment; revisit only if the operator publishes an API or data licence.

## Open questions
- Does the app (not web) expose per-card percentages and history that could be licensed? Contact listed in app store text: info@minsim.io (operator's own address, public).
- Real traffic numbers (no data found).

## Sources
- https://apps.apple.com/kr/app/%EB%AF%BC%EC%8B%AC%EB%A7%88%EC%BC%93-%ED%95%9C%EA%B5%AD%ED%98%95-%ED%8F%B4%EB%A6%AC%EB%A7%88%EC%BC%93-polymarket/id6754787403 (listing; read via iTunes lookup API) - H
- https://itunes.apple.com/lookup?id=6754787403&country=kr - H
- https://minsim.io - H
- https://minsim.io/legal/terms-of-service - H (summarised by WebFetch model; article numbers as reported, M for exact wording)
- https://minsim.io/votes - M
- https://minsim.io/robots.txt, https://minsim.io/sitemap.xml - H
- https://api.minsim.io/ (404 JSON) - H

## Suspicious content
None found in fetched pages.
