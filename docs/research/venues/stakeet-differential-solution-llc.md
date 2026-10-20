# Stakeet (Differential Solution LLC / BetCraftor Inc) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.
Note: WebSearch budget was exhausted for this session, so no independent news/volume sources were searched.

## Verdict
Live, real-money (NGN), custodial, Nigeria-first parimutuel "pool contract" app with an unofficial (undocumented) JSON API. No chain, no PayBox path, ToS bans bots, and open-market liquidity is effectively zero today. adapter_priority: skip (at most a P2 signal-only scrape, not recommended).

## Identity and liveness
- Site https://stakeet.com returns 200; homepage title "Big Brother Naija Starts July 26 | Predict Weekly Events on Stakeet" (stale banner, likely July 2025 or 2026; L). [H] https://stakeet.com
- iOS app (Differential Solution LLC) v5.2.0 "Added pool contracts" dated "3 Oct" (year not shown, consistent with 2026), 139 ratings, 4.2 avg; earlier 5.0.0 "20 Apr", 4.0.0 "11 Nov 2025", 3.0.0 "14 Apr 2025". [H] https://apps.apple.com/ng/app/stakeet/id6742440252
- Operator on site/ToS: BetCraftor Inc; footer "RC Number 7714465" (Nigerian CAC), "YouVerify", "Pay Aza" (Payaza). [H] https://stakeet.com , https://stakeet.com/terms-conditions
- The discovery hint ("reward points, no cash evidence") is WRONG: it is real money. FAQ: "peer-to-peer event contract platform ... Users can earn money if their picks come true"; country config has minimumWagerAmount 500 NGN, maximumWagerAmount 100000, withdrawalFee 100; ToS: real-money entries carry "the risk of losing the full entry amount". Points exist but have no cash value unless a conversion feature is offered. [H] https://api.stakeet.com/api/utility/faqs , https://api.stakeet.com/api/bets/countries , terms.

## Kind and market model
- Custodial parimutuel / pool-style "event contracts"; not an order book, not an AMM, no tokenised outcomes. [H]
- Two contract families seen in the client bundle/ToS: "Regular contracts" (choose an outcome "at the contract's odds", betChoices array, FAQ says peer-to-peer first-come-first-serve fill) and "Pool contracts" (v5.2.0: submit a numeric prediction, share a prize pool). [H] app store + homepage walkthrough text + API.
- All 41 currently open public contracts (countryId=1, 2026-10-19) are betType "Pool" (detail: betType 3), system-created (ownerName "system"), numeric answer ("Enter a whole number"), winning rule PercentageTolerance ("Within 5%, 10%, or 20% of the result"; ToS also lists closest-prediction and correct-option rules). Topics: EPL/Serie A/La Liga/UCL total goals and team goals, NBA total/half/quarter points, YouTube view counts. [H] https://api.stakeet.com/api/bets/open?countryId=1&category=All
- No implied probability or price is produced: payout depends on final pool and other entrants. Not directly comparable with binary YES/NO prices; at best a numeric-over/under distribution of entrants' guesses.

## Chains and collateral
- None on-chain. Fiat NGN wallet (custodial), top-up min 500 NGN via Payaza/Paystack-type gateway, withdrawals to Nigerian bank accounts. Other countries are configured in principle but /bets/countries returns only Nigeria. [H] API endpoints `/payment/payaza/initiate`, `/payment/withdraw`, `/payment/banks/{id}` in bundle; countries response.
- Contract/token addresses: NOT FOUND (searched: homepage, JS bundle for "0x", docs links; none).

## Read API
- Exists: unofficial-only. No docs, no swagger (https://api.stakeet.com/swagger/index.html -> 404). Base: https://api.stakeet.com/api (ASP.NET Core; RFC9110 problem+json errors). Discovered from the first-party Next.js bundle, not a documented contract (M for stability). [H] https://stakeet.com/_next/static/chunks/pages/_app-187844edec12caa9.js
- Public unauthenticated GETs that worked (200):
  - `/bets/countries` - per-country limits, currency, withdrawalFee, weeklyJackpotPotAmount (100000 NGN), weeklyCompetitionPotAmount (50000 NGN). Fixture: bets-countries.json
  - `/bets/open?countryId=1&category=All|Sports|Entertainment|Crypto|Politics|Financials&page=N` - paged lists of 10; fields betId, question, betType, lastWagerDate, totalEntries, totalUsers, totalAmount, participantCount, isFreeToJoin, enableLiquidityProvider, status. Fixture: bets-open-all-page1.json
  - `/bets/{betId}` - detail incl. category, eventDate, poolCriteria, poolWinningRule, liquidityScore, min/max wager, totalAmount. Fixture: bets-detail-pool.json
  - `/bets/jackpots/all`, `/competitions/all` (both returned `[]` today), `/utility/faqs`, `/utility/topics/trends?countryId=1` (stale: asOfUtc values 2025-09 to 2026-01).
- Auth-required (401/405 seen or inferred): `/bets/price` (401), `/bets/history`, `/bets/participating`, `/account/*`, `/auth/*`, `/payment/*`. Auth scheme: bearer tokens (`/auth/login`, `/auth/refresh-bearer`), PIN for withdrawals. Idempotency-Key header used on POST `/bets`, `/bets/join`.
- Resolution data: `/bets/adjudicate/{id}`, `/bets/review/{id}` exist but are for logged-in "adjudication team" users; no public result endpoint found. Websocket / rate limits: NOT FOUND (searched: bundle, docs; none documented).

## Trade path
- Programmatic only by reverse-engineered authenticated REST: POST `/bets/join` {betId,userId,choice,wagerAmount} with bearer token + Idempotency-Key. Requires account, government-ID KYC, NGN funds. Not tested (no accounts, no POSTs). ToS prohibits bots/scripts/automation. [H for endpoint existence from bundle; ToS H]
- PayBox / EVM wallet: NO. No smart contract, no signed orders, no transaction proposals. Funding is bank/card gateway in NGN. paybox_reachable = no.

## Fees
- Platform fee: FAQ says 12.5% of net earnings on a successful contract (winners only); ToS says platform fee deducted from gross pool, "may be 5%", the per-pool displayed fee controls (the two statements conflict; resolve before any modelling). Contract creators get a commission. Withdrawal fee 100 NGN (countries endpoint); deposit has no stated fee. [H] FAQ, ToS, countries.

## Resolution and dispute risk
- Operator-determined: Stakeet decides the outcome after the event date using "official results, APIs, market data, public records, and automated or AI tools", with manual review; users can be "adjudicators" voting on results (UI shows adjudication/void forms). Payout automatic within 3 days. ToS lets Stakeet reopen settlements, reverse credits and void pools; entries are final. Dispute path is email support only. High counterparty/operator risk. [H] ToS, FAQ, homepage markup.

## Geo, ToS, automation
- 18+, KYC/AML, one account, "Use is limited to places where Stakeet offers the service"; no jurisdiction list. Bots, scripts, automation, unauthorized interfaces prohibited; violations can freeze funds. Legal classification of pools "varies by jurisdiction"; no gambling licence named. [H] https://stakeet.com/terms-conditions

## Liquidity (2026-10-19, H via API)
- 41 open public Nigerian contracts; sum of totalAmount = 0, totalUsers = 0, zero entries in every one. Jackpots and competitions lists empty. No historical volume/TVL published; app has 139 App Store ratings (small). Per-bet cap 100000 NGN (~USD 60-70, M). Effective liquidity: nil to tiny.

## Overlap and arbitrage relevance
- Topics overlap sports totals (EPL, Serie A, La Liga, NBA) in a numeric-guess pool form, which has no clean mapping to binary/ladder markets elsewhere; YouTube views and entertainment have no overlap. Crypto, politics, financials categories currently return zero contracts. Not an independent arb leg: parimutuel payout, 5-12.5% fee, custodial, no exit, unavailable to non-Nigerian users. Shares liquidity with no other venue (own pools).

## Sources
- https://stakeet.com , https://stakeet.com/terms-conditions (H, fetched 2026-10-19; terms summarised by a fetch-model, quotes not verbatim-verified)
- https://apps.apple.com/ng/app/stakeet/id6742440252 (H)
- https://api.stakeet.com/api/bets/countries , /bets/open , /bets/{id} , /utility/faqs (H, unauthenticated GETs, UA insurance-markets-research/0.1)
- https://stakeet.com/_next/static/chunks/pages/_app-187844edec12caa9.js (H, endpoint list and baseURL)
- Fixtures: docs/research/fixtures/stakeet-differential-solution-llc/

## Not found
- Official API docs, websocket, rate limits, on-chain contracts, public results/history endpoint, volume statistics, third-party coverage (search budget exhausted), licence number/regulator.
