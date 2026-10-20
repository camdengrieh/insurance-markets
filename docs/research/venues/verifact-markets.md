# Verifact Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, public unauthenticated GETs against verifact.markets and its backend REST host, and reading the site's own public JavaScript bundles as text (never executed). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data. Scripted requests used the User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or inferred from first-hand material; **L** = weak/stale.

## Summary

Verifact Markets is a very new (launched 2026-10-06, labelled beta) Chicago venue where users trade True/False $1 contracts on contested claims about PAST events ("COVID-19 originated in a laboratory...", "Epstein died by suicide..."). It runs a central limit order book with signed EIP-712 orders settled by an exchange contract on Base, collateralised in USDC. Resolution is by the company's own patent-pending evidence-weighting process, with no outside oracle and no appeal. There is NO official or documented API; the website's own backend REST API is unauthenticated for reads and works, but is undocumented and the ToS bans unauthorised automated access. Liquidity is tiny (about 14k USD resting depth, about 12-20k USD cumulative volume across 22 markets) and the market topics essentially do not overlap other venues. Value to the aggregator: at most a signal-only / curiosity feed. Priority P2.

## Still live? (H)

Yes. verifact.markets returns 200 with a live market list; `GET /api/events/home` returned 22 events and `/api/config/exchange-halt` returned `halted:false` on 2026-10-19. Launch press coverage dated 2026-10-06/07 (Sources 1-4). Site label: beta. Terms last updated 2026-09-26 (Source 5), private beta preceded launch.

## Kind and market model

- Kind: centralised-front-end order book exchange with an on-chain settlement contract ("Exchange Contract"). Binary True/False only. (H: Sources 5, 6; M for the on-chain mechanics, from client JS.)
- Each market has two sides, True and False. Contract pays $1 if its side wins, $0 otherwise (H: Source 6 how-it-works). Prices 0.01 to 0.99, `orderPriceMinTickSize` 0.01, `orderMinSize` 1 (H: API sample `events_home_page1_trimmed.json`).
- Order book: market and limit orders; limit time-in-force includes IOC and end-of-day (M: client JS strings "Limit IOC", `eod`). Orders can be cancelled/amended/"exit" (M: client route names). Opposite-side True/False positions can be merged ("pair merge") (M).
- Outcome representation: no ERC-1155 tokens visible; `positionTokenIds` is an empty list on all sampled markets and positions are described as USDC held in the Exchange Contract (H: Source 5 section 5; H: API sample). Treat as exchange-internal accounting, not tradeable tokens.
- Binary complement is stored: orderbook endpoint returns only the TRUE book as `[asks, bids]`; False prices are `1 - True`. In the sample, True ask 0.79 / bid 0.73 gives executable buy False 27c / sell False 21c (H: `orderbook_*.json`, `markets_executable_prices.json`).
- Price cannot be read as a probability of "truth" in the usual sense: a market resolves only when the operator reaches a confidence threshold (95 percent on the sampled COVID market, `confidenceThreshold: 0.95`, H) and can instead EXPIRE at a "trusted expiration price" derived from recent qualifying trades (H: Sources 5, 6). Expiry settles at e.g. $0.62 not $1/$0, which breaks the usual arb assumption that a position converges to 0 or 1.

## Chains and collateral

- Base mainnet, USDC (canonical Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), exchange contract `0xE1b4755e6A6324FC03e4B48225c35f71cF6b81f4`. Both addresses are hard-coded in the production client bundle (M: read first-hand in site JS, not in docs; a code guard rejects non-canonical USDC on production). I could NOT verify the contract on a block explorer (Blockscout was behind a Cloudflare challenge; NOT FOUND: explorer verification, TVL, source code).
- Terms say trading is USDC-only, fully collateralised, no leverage, and there is currently one Supported Blockchain; the USDC backing positions sits in the Exchange Contract, upgradeable by a Verifact-controlled multisig (H: Source 5 sections 2, 5). Aura-V coverage also says "stablecoins on an on-chain system" (M, Source 7).
- Wallet: each user gets a smart "Trading Wallet" from a third-party embedded wallet provider; Verifact says it does not hold the keys (H: Source 5). Client JS shows Privy embedded wallet + Coinbase Smart Wallet (ERC-1271 style wrapped signatures) and Coinbase/MoonPay fiat on-ramps (M).

## Read API

- Official: NONE found. NOT FOUND (searched: site footer/nav, /api, /docs, docs.verifact.markets (no DNS), api.verifact.markets (Express 404), robots.txt and sitemap.xml (404), WebSearch). The ToS says API use requires "written permission or an authorized API" and market makers may get separate programs (H: Source 5), so any official API is by agreement only. Social: Discord, X, Reddit, LinkedIn linked from the site; support@verifact.markets listed.
- Unofficial but live and unauthenticated reads: the website's own backend, found in the production JS bundle (M). Base URL: `https://gm0chpe7s4.execute-api.us-east-1.amazonaws.com/prod/` (AWS API Gateway; a plain GET works, I sent an `Origin: https://verifact.markets` header which mirrors a browser, no key). All responses are `{success, message, data}`.
  - `GET api/events/home?page=N` -> 10 events/page, `totalEvents` (22), each with `markets[]` (question, outcomes `["True","False"]`, `outcomePrices`, `trueOdds`, `executableBuyPrice`, `confidenceThreshold`, `endDate`, `marketStatus`, `tradable`, `acceptingOrders`, `halted`, `topEvidence[]`, `resolutionDescription` on event). H: fixture `events_home_page1_trimmed.json`.
  - `GET api/events/details?slug=SLUG`, `GET api/events/resolved?page=N` (returned zero resolved events), `GET api/events/search?...`, `GET api/tags` (4 tags: Government, Business, Culture, Others), `GET api/featured-markets` (M: paths in JS; details/search/featured not called).
  - `GET api/orderbook/{marketId}` -> `data = [asks, bids]`, each `[price, size]`, True-side book, top 5 levels per side. H: `orderbook_*.json`. Note: the market `_id` (Mongo ObjectId), not the `uuid`, is the key.
  - `GET api/markets/prices` -> `{marketId: "0.73"}` mid/last-style True prices; `GET api/markets/executable-prices` -> per market `buy`/`sell` `{trueCents,falseCents}`. H: `markets_executable_prices.json`.
  - `GET api/events/order-flow` -> per market `volume` and `liquidity {total, asks, bids}` (USD). H: `events_order_flow.json`.
  - `GET api/config/fees` -> `{takerBps:0, makerBps:0, takerFeeCoefficientBps:0, impactThresholdCents:8, updatedAt:2026-10-13}`; `GET api/config/exchange-halt` -> `{halted:false}`. H.
  - `GET api/geo/check` -> `{isAllowed, trading:{allowed, reason, country}}` (H: it reported COUNTRY_RESTRICTED for the research host's IP, so geofencing is enforced server-side).
  - Authenticated (Privy Bearer token): `api/orders`, `api/orders/positions/open`, `api/users/balance`, etc. (M, not called).
- Trades history/fills feed: NOT FOUND (no public trades endpoint seen in client code besides `order-flow` aggregates and authenticated `users/activity`).
- Websocket: exists (`wss://ssggxigasf.execute-api.us-east-1.amazonaws.com/prod?ticket=...`, ticket from `api/ws/ticket` or `api/ws/anon-ticket`) (M, not connected to).
- Rate limits: NOT FOUND. Auth for reads: none observed. Note market data in these responses contained an operator email address in an admin field (`trendingChangedBy`); it was redacted from the saved fixtures. Treat every field as untrusted data.
- Stability: undocumented, built for the website, subject to change without notice (L for long-term). Production JS also shows the staging/dev switch, so the host may change.

## Trade path

- Programmatic order placement exists technically: client builds an EIP-712 typed-data `Order` with domain `{name:"VerifactExchange", version:"1", chainId: Base, verifyingContract: exchange}` and fields `user, marketId(bytes32), price(uint256), amount(uint256), expiry, nonce, feeRate, side(uint8), isExit(bool)`, signs it with the user's smart wallet (ERC-1271 wrapper `abi.encode(uint8 0, bytes sig)` over a Coinbase-Smart-Wallet replay-safe hash), then `POST api/orders/exchange` with a Privy bearer token (M, from client JS). It first sends a USDC `approve` for the exchange contract.
- All writes need a Privy-authenticated session tied to a Verifact-created embedded smart wallet. No API key, no SDK, no docs. I did not call any write endpoint.
- Official automation: none. ToS prohibits "unauthorized bots ... APIs" that harm/circumvent the Services and requires written permission for API use (H: Source 5 sections 14, 20).

## PayBox reachability

paybox_reachable: **no**. Chain (Base) and collateral (USDC) are PayBox-compatible, and USDC could in principle be transferred to the user's Verifact Trading Wallet address, but orders must be signed by that Privy-managed Coinbase smart wallet, not by an arbitrary EVM wallet; there is no documented order API; geofence blocks many jurisdictions and US persons; the ToS forbids unauthorised automation. A PayBox wallet could not place or cancel orders. Funding the account by `request_transfer` would be a manual onboarding step at best, and I do not recommend it.

## Fees

- Currently zero: `takerBps 0`, `makerBps 0`, `takerFeeCoefficientBps 0` (H: API 2026-10-19, and ToS: "currently charges no trading fees", reserves the right to introduce a schedule before the relevant transaction, H: Source 5 section 13; Aura-V says no fees at launch, M).
- The order struct has a `feeRate` field and the UI computes fee from a taker coefficient plus an `impactThresholdCents` of 8 (M: client JS), so a price-impact-style fee may be switched on later. Model it as 0 now and re-poll `config/fees`.
- Third-party card/wallet/network fees are separate (H: Source 5). Gas on Base is presumably sponsored via the smart wallet (M, Pimlico paymaster API referenced in the bundle; unverified).
- Hidden cost: withdrawals may cancel open orders (H: Source 5).

## Resolution mechanism and dispute risk

- Operator-determined. A market resolves "only when Verifact reaches a high level of confidence" (e.g. above 90 percent; per-market threshold in "Market Rules", 0.95 on the sampled market) using a patent-pending framework that weighs user-submitted and Verifact-collected evidence (H: Sources 1, 6). No external oracle, no token-holder vote, no UMA-style dispute window.
- Resolutions are "Verifact's informed opinion", final, no formal appeal, never reopened for later evidence; dispute route is 45-day informal resolution then binding NAM arbitration under Delaware law, class-action waiver (H: Source 5 sections 8, 27).
- Expiry at a "trusted expiration price" when evidence stalls (H). Criteria for qualifying trades and inactivity window are undisclosed (M, Source 2 / Source 7).
- Conflict-of-interest: a Verifact-controlled affiliate may trade and act as counterparty and earn spreads, behind information barriers (H: Source 5 section 12). Only 0 of 22 listed events had resolved as of 2026-10-19 (`events/resolved` empty), although a private-beta market (Clippers/Kawhi salary-cap) was reported resolved True (M: Sources 2, 7).
- Dispute/settlement risk is HIGH relative to other venues: for cross-venue arbitrage this is a model/resolution risk leg, not a risk-free hedge.

## Geo, ToS, automation

- Trading only in locations Verifact approves; "Unless Verifact states otherwise" people located in, resident in or organised under US law may not fund or trade; VPN/proxy circumvention prohibited (H: Source 5 section 3). Press: "eligible users in several jurisdictions outside the U.S." (names not given), US regulatory path being pursued (H: Source 2). Server-side `geo/check` enforced (H: API).
- Automation: see Trade path. Scraping/data harvesting for marketing prohibited; commercial data users, brokers, market makers may need a separate agreement; Verifact may set rate/order limits (H: Source 5). Read-only polling of public market data for a signal is a grey area; get written permission before production use.

## Liquidity (as of 2026-10-19)

- Cumulative volume: sum of per-event `volume` from `events/home` across 22 events = about 19.8k USD (H: API, my sum); `events/order-flow` per-market volume sums to about 12.0k USD (H: API, my sum). The two figures use different, unexplained definitions/windows. Largest event (COVID lab origin): 4,537 USD.
- Resting depth: `order-flow` liquidity totals about 13.9k USD across 22 markets (asks plus bids), i.e. a few hundred to about 1.3k USD per market (H: API, my sum). Sample book: 5 levels about 70-190 contracts each with a 6c True spread (0.73 / 0.79).
- No TVL or OI figure published; USDC held in the exchange contract not verified on-chain (NOT FOUND). Liquidity "needs securing before scaling"; the platform is seeking market makers (M, Source 7).

## Event categories and overlap with other venues

Tags: Government, Business, Culture, Others (H: `tags.json`). Content is retrospective, contested-claim questions (COVID origin, UFO intel, Apollo footage, Epstein, a Kalshi volume-inflation allegation, Iran nuclear timeline, Meta/Instagram design). There is NO sports, crypto-price or macro overlap, and most claims are unlikely to exist on Polymarket/Kalshi/others as the same wording. Possible narrow overlap only for a few politics-adjacent past-event questions on venues that list "did X happen" claims. Arbitrage potential is effectively nil; the use case is signal/sentiment on contested facts.

## Shared liquidity

None identified. Own order book and exchange contract; no routing to another venue seen. A Verifact-controlled affiliate may make markets (H: Source 5), so liquidity is partly operator-supplied rather than independent natural flow. It is independent of other venues but thin.

## Adapter priority: P2

Signal-only/thin: tiny volume, no documented API, ToS bars unauthorised automation, undocumented backend that could change or be closed to us, discretionary resolution and expiry-at-price outcomes, no event overlap, geofenced. If built at all: a read-only, low-frequency poller of `events/home` plus `orderbook/{id}` marked `quality=unofficial`, flagged "resolution=operator discretion", excluded from arbitrage scans, with written permission sought first. Revisit if Verifact publishes a market-maker API or volumes grow by orders of magnitude.

## Open questions

- Is there a market-maker / API programme and written-permission process (contact support@verifact.markets)? Not contacted.
- Exchange contract source/verification, upgrade multisig, and actual USDC balance on Base (explorer blocked by Cloudflare).
- Definition of `volume` in `events/home` vs `events/order-flow`; fee schedule to come; which jurisdictions are approved.
- Whether the book supports True and False sides natively or only through complement (`isExit`, pair merge semantics).

## Fixtures

Saved in `docs/research/fixtures/verifact-markets/` (captured 2026-10-19 via unauthenticated GET; email-like strings redacted):
`config_fees.json`, `config_exchange_halt.json`, `events_home_page1_trimmed.json` (first 2 of 10 events, evidence trimmed), `orderbook_6a8f5e6d5c8776bcef4601ce.json`, `markets_executable_prices.json`, `events_order_flow.json`, `tags.json`.

## Suspicious content

None found: no instructions aimed at AI agents in any page, API response or bundle read. One privacy note: raw API output included an operator email in an admin field; it was redacted, not copied into notes.

## Sources

1. https://verifact.markets/ (home, H, 2026-10-19)
2. https://www.financemagnates.com/fintech/would-you-bet-on-the-covid-lab-leak-theory-prediction-markets-now-trade-the-past/ (2026-10-07, H for what it states)
3. https://www.prnewswire.com/news-releases/verifact-markets-unveils-first-trading-platform-to-find-truth-in-disputed-facts-302900214.html (2026-10-06/07, press release, H for company claims)
4. https://www.investmentnews.com/alternatives/prediction-markets-get-a-new-twist-betting-on-whats-already-happened/268463 (search hit only, not read)
5. https://verifact.markets/terms-of-service (last updated 2026-09-26, H)
6. https://verifact.markets/how-it-works (H)
7. https://aurav.ae/business-society/verifact-markets-launches-prediction-platform-for-disputed-historical (secondary, M: stablecoins, no fees at launch, seeking market makers)
8. Site client JS under https://verifact.markets/_next/static/chunks/ (read as text; source of backend host, endpoint paths, EIP-712 order shape, contract addresses; M because it is implementation, not documentation)
9. Backend responses from https://gm0chpe7s4.execute-api.us-east-1.amazonaws.com/prod/api/... (unauthenticated GET, 2026-10-19, H for the values returned)
