# BetFolio (now "FOLIO Games") - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **adapter_priority: skip.** Not an arbitrage leg. The product has pivoted from "prediction market for crypto portfolios" (2024) to a points-and-rewards "opinion polling / gamified market research" platform (2025-2026). There is no price, no order book, no tradable position and no usable public API. Measured on-chain value is about $106 (DefiLlama, 2026-10-18).
- Still live in the sense that the website is served and updated (H), but it is not live as a market venue.

## Identity and liveness

- `https://betfolio.co` returns `301 Location: https://foliogames.co/` (nginx), checked 2026-10-19 (H, curl).
- `https://foliogames.co/` returns 200. `Last-Modified: Tue, 28 Apr 2026 09:41:18 GMT` (H, response headers). It is a Create React App SPA with `og:title="Prediction Games"`, `og:description="Play Prediction Games. Win Rewards"` (H, fixture `docs/research/fixtures/betfolio/foliogames_co_index.html`). Search listing title: "Best opinion & prediction games" (M).
- Self-description in the site's own bundle (About Us): "FOLIO is a prediction and opinion polling platform where you earn rewards by forecasting what the majority thinks ... Get it right, earn points. Redeem points for real rewards in our Gift Store ... Revenue from sold results goes back into funding more rewards" (H, `https://foliogames.co/static/js/main.e2789214.js`). Search-result tagline: "Opinion Polling Platform for Crowd-Forecasting, Gamified Market Research, and Daily Rewards" (M, web search summary of the company's X/Paragraph posts).
- The Terms of Service text embedded in the same bundle still says "FOLIO offers a prediction market platform for crypto portfolios" (H) - stale boilerplate from the original product.
- DefiLlama still lists it: id 4361, category "Prediction Market", chain Polygon, `url=https://betfolio.co`, twitter `BetFolioX`, `listedAt=1711379225` (2024-03-25) (H, `https://api.llama.fi/protocol/betfolio`).
- Company activity: Paragraph newsletter index shows posts through at least Jun 18 (year not shown; context suggests 2026) about task-gated rewards, "Fintech Performance Index" prize pool, referral payments for a "Data Platform" and raffle games (M, `https://paragraph.com/@folio`, fetched via summariser). X posts referenced in the bundle date 2025-01-29, 2025-05-27, 2025-08-23 (snowflake-ID decode, M); a search hit shows a Jan 2026 X post on "How Rewards Work" (M; the X page itself returned HTTP 402 to the fetcher and was not retried).

## Kind and market model

- kind: onchain-other, effectively a gamified opinion poll with a points ledger. Not an order book, not an AMM.
- Game types named in the bundle: "Opinion Games: Predict which option will get the most votes (the majority-held opinion) to win. Tie votes mean no winners." and "Personal Preference Polls" (H). Other `data_provider` values seen in the code: `ugp` (user-generated predictions), `opinion-games`, `sports-matchups`, `solo-predictions`, plus categories `REGULAR`, `QUIZ`, and prediction type `RISK-FREE` (H, bundle strings). Backend lists "multi-choice" and "solo" predictions and "tournaments" (endpoint names, H).
- The outcome of an opinion game is the crowd's own vote tally, not an external real-world event, so there is nothing to price against another venue. Rewards are points redeemable for tokens in a "Gift Store", not a payout from a pool (H, bundle text: "Simply vote for free on polls and earn points ... Points can then be redeemed for token rewards"; "Once you hit 500 points, redeem them").
- Each prediction has its own contract (`contract_address` in API rows; some have a `_` suffix that DefiLlama's adapter strips) (H, `https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/betfolio/index.js`). Bundle ABIs show a per-prediction contract with `platformFeePercentages`, `platformFeeWallets`, `predictionEndTime`, `soloExtraPlatformFee`, `withdrawUnclaimedFunds`, a bet-counter contract with `canBetOnRiskFree`, and an NFT contract with `buyNFT` (H, bundle ABIs). The 2024-era design was USDC-staked predictions on Polygon (M: NetSet Software case study says users "vote on prediction statements using USDC", `https://www.netsetsoftware.com/case-study/blockchain-betfolio.php`, undated, L for currency).
- How outcomes are tokenised: NOT FOUND. No outcome tokens or share tokens were seen; votes are recorded per wallet/bet id and counted ("countsAndAmounts" with `count_N` per option) (H, bundle strings). Searched: bundle, DefiLlama adapter, case study.

## Chains and collateral

- Polygon only (H, DefiLlama `chains:["Polygon"]`).
- Collateral historically USDC (Circle native USDC on Polygon, per the DefiLlama adapter `USDC_CIRCLE`) (H). Per-bet extra fee paid in POL ("<n> POL per extra bet" in UI, `value` sent with the transaction) (H, bundle). Current main loop is free voting for points; some gated/boosted/raffle games need a $1 NFT mint (M, Paragraph). Gift Store redemption pays Solana-based memecoin tokens (M, case study; bundle `H()` helper defaults the chain to `"solana"` for gift tokens, H).
- Wallet: logging in "automatically creates a secure wallet for you in the background, linked to your email address" (H, bundle) - Web3Auth is used (bundle references `api.web3auth.io`, H) plus MetaMask (`window.ethereum`) paths.

## Read API

- exists: **none usable**. Backend is an internal REST API for the first-party frontend, undocumented, and currently refuses unauthenticated requests.
- Base URL (from DefiLlama adapter and bundle): `https://api.betfolio.co/api/v1` (H).
- Docs URL: NOT FOUND (searched: betfolio.co, foliogames.co, docs.betfolio.co and app.betfolio.co - the last two do not resolve, `curl: (6)`, H; web search; GitHub search for repos via DefiLlama adapter only).
- Endpoints visible in the frontend bundle (H; paths only, not verified beyond 403): `GET /user/predictionList?limit=&duration=&type=`, `GET /user/getSoloPredictions?limit=&type=&theme=&solo_type=`, `GET /user/getMultiChoicePredictions?...`, `GET /user/tournamentList?limit=`, `GET /user/predictionDetail/{id}` and `/user/prediction-detail/{id}`, `GET /user/get-prediction-bets/{id}`, `GET /user/user-prediction/{a}/{b}`, `GET /user/searchPredictions/{q}`, leaderboards, `POST /user/placeBet` and `POST /user/place-bet`, login via `/user/login/`, `/user/loginweb3/`, `/user/login-google`, plus points/gift/redeem/membership/PayPal routes. Account-level calls use an auth helper; `redeem` flow sends an `x-recaptcha-token` header (H).
- Confirmed behaviour 2026-10-19, unauthenticated GET with User-Agent `insurance-markets-research/0.1`: `GET /api/v1/user/predictionList?limit=3&duration=&type=` -> `HTTP/1.1 403 Forbidden`, `{"error":"You are not authorized."}`; same for `/user/getSoloPredictions?...` and for `GET /` (H; fixture `docs/research/fixtures/betfolio/api_betfolio_co_predictionList_unauth_403.json`, notes in `.../README.txt`). I did not attempt to bypass the check (no spoofed Origin/Referer, no login).
- Note: DefiLlama's adapter (merged 2024) called both list endpoints with no credentials, so these were public in 2024 and are now gated (H for adapter code, H for today's 403). DefiLlama's TVL continues to update, but its `getConfig` helper caches, so that does not prove the endpoint is open (M).
- Websocket: NOT FOUND. The bundle includes the socket.io-client library, but no BetFolio websocket endpoint was identified (searched: bundle for wss:// and socket.io; the only `wss://` hits are XRP ledger nodes in the Web3Auth chain list).
- Rate limits: NOT FOUND.
- Fixtures saved (small): `docs/research/fixtures/betfolio/defillama_protocol_betfolio_trimmed.json` (real response shape of `GET https://api.llama.fi/protocol/betfolio`, trimmed), the 403 body, the SPA `index.html`, and a README.

## Trade path

- none for an agent. The frontend path is: Web3Auth/Google/MetaMask login -> backend session -> `POST /user/placeBet` (backend) and/or an on-chain call to the per-prediction contract with a POL `value` platform fee (H, bundle code builds `{from, value}` params and calls via `new Web3(window.ethereum)`). Sign-up requires email (currently Gmail only), phone OTP and IP/geo checks, one response per poll per account, "no bots" (H, bundle text: "participants must sign up with a unique email (currently Gmail only) and verify a phone number via OTP. We also run IP/geo checks, limit voting to one response per poll per account, and monitor for suspicious sign-up or voting patterns").

## PayBox reachability

- paybox_reachable: **no**. A Polygon EVM wallet could in principle send a contract call, but (a) the contract addresses are per-prediction and only discoverable through the now-403 API, (b) votes are gated on an email/phone-verified account and a backend session, and (c) the payoff is points, not tradable value. Nothing to hedge or arbitrage against.

## Fees

- Flat platform fee per bet paid in POL, shown as "<n> POL per extra bet" for extra solo bets, taken as `msg.value` on the call; some predictions have `is_discount_applicable` (H, bundle). Per-contract `platformFeePercentages` and `platformFeeWallets` arrays exist (H, ABI). Actual values: NOT FOUND (API gated). Pro membership and $1 NFT raffle entry exist (M, Paragraph/case study).

## Resolution and dispute risk

- Results are "published and points distributed 1 hour after the prediction end time" (H, bundle "Predictions Page Layout"). Resolver is the platform (an admin panel manages users, predictions and transactions per the case study, M). I did not find an on-chain oracle or dispute module: the bundle has zero mentions of chainlink or "oracle" (H, bundle grep). For user-generated predictions the data sources are Twitter and CoinGecko APIs (M, case study; bundle also tells creators to use CoinGecko-listed tokens, H). No dispute process found. Dispute/oracle risk: high (single operator, centralised resolution). NOT FOUND (searched: bundle, case study, Paragraph).

## Geo / ToS / automation

- ToS (in bundle, H): 18+; "Not be prohibited by law from accessing our Services or have any restriction from being involved in voting or prediction markets"; use only for lawful purposes; do not "overburden, or impair the functioning of FOLIO"; operator may suspend "for any reason whatsoever"; governing law = "jurisdiction where FOLIO is established" (not named). No explicit API or automation clause, but the site states users are verified by email, phone and IP "(no bots)" (H). No named restricted-country list found.

## Liquidity (all with source and date)

- DefiLlama TVL: **$105.98** on Polygon, 2026-10-18 (H, `https://api.llama.fi/protocol/betfolio`, `currentChainTvls.Polygon=105.98432`). Peak $18,296 on 2024-07-22; $114 at listing 2024-03-25; basically flat at about $105 for the latest 10 days (H, same response). The TVL is the USDC sitting in the per-prediction contracts (adapter code, H).
- Volume / OI: NOT FOUND (searched: DefiLlama, bundle, web search).

## Event-category overlap (arbitrage relevance)

- Marketing copy lists "sports, politics, finance, health, and entertainment" categories (M, search summary of a Jan 2026 X post) and the code has a `sports-matchups` provider (H), but the dominant games are opinion polls (brand preferences, pricing, trust) whose resolution is the crowd vote itself (H). No live price series to compare. Practical overlap with other venues for arbitrage: none.

## Shared liquidity

- None identified. Standalone first-party contracts on Polygon. The `isConsolidated` flag in the frontend suggests the UI can group markets from several providers into a "consolidated" view, but I did not find evidence that it imports third-party venues (L; NOT FOUND - the bundle contains zero occurrences of polymarket, kalshi, limitless or myriad (H, bundle grep 2026-10-19)).

## Signal-only value

- Possible, low: the crowd "what will the majority vote" polls are not a forecast of real-world events. Not worth an adapter.

## Open questions

- Whether any real-money USDC prediction contracts are still open on Polygon (would need the gated API or Polygonscan enumeration of the per-prediction contracts; not done).
- Whether `api.betfolio.co` is gated by a static header/Origin or by login only (not tested, deliberately).

## Observations

- Client bundle embeds third-party RPC provider API keys (Alchemy URLs). Not copied here. No instructions aimed at AI agents were found in any page, API response or bundle text.

## Sources

- https://betfolio.co (301 to https://foliogames.co/) - H, curl 2026-10-19
- https://foliogames.co/ and https://foliogames.co/static/js/main.e2789214.js (front-end bundle: About Us, ToS, endpoint paths, ABIs) - H, 2026-10-19
- https://api.betfolio.co/api/v1/user/predictionList , /getSoloPredictions , / (403) - H, 2026-10-19
- https://api.llama.fi/protocol/betfolio (TVL history; DefiLlama page https://defillama.com/protocol/betfolio itself returned HTTP 403 to the fetcher) - H
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/betfolio/index.js - H (read via `gh api`, raw)
- https://www.netsetsoftware.com/case-study/blockchain-betfolio.php - M/L (agency case study, undated)
- https://paragraph.com/@folio - M (summariser output; post years not shown)
- https://x.com/FolioGames/status/2009874004102766720 - HTTP 402 to fetcher, not retried; referenced via search snippet only - L
- Web searches: "BetFolio prediction market crypto portfolios", "FOLIO Games foliogames.co prediction opinion games rewards gift store 2026" - M
