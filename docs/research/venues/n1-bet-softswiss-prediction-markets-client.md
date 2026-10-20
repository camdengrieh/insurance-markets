# N1 Bet / SOFTSWISS Prediction Markets (client brand) - adapter spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
- adapter_priority: **skip**. This is a B2B white-label fixed-odds (house-vs-player) product, not a market with an order book or public API. No independent liquidity, no read API, no programmatic trade path, no on-chain component. Not an arbitrage leg; at most a manual price-comparison signal if a brand exposes odds in its UI (not verified).

## Is it live?
- SOFTSWISS Prediction Markets product is live and marketed in 2026 (H): https://www.softswiss.com/prediction-markets-software/ ("2 Weeks from contract to launch"); news 2026-06-29 says it "surpassed 50" signed/live projects (page text is inconsistent: title says "signed projects", the SIGMA piece of 2026-09-04 says "surpassed 50 live projects") (H): https://www.softswiss.com/news/prediction-markets-surpasses-50-signed-projects/ , https://www.softswiss.com/news/prediction-markets-sigma-north-america-2026/
- "N1 Bet first live brand" claim: only in the third-party blog dated 2026-04-24: "SOFTSWISS launched with N1 Bet as its first live brand." (M) https://www.mygaminglicense.com/blog/an-operators-guide-to-the-prediction-market-boom . Note the article also says platform providers shipped "in mid-2026", later than its own date, so the claim is internally shaky (L).
- NOT FOUND on any SOFTSWISS page fetched (product page, KB article, 4 news posts) that names N1 Bet (searched: product page, /news/ posts of 2026-05-18, 06-29, 07-07, 09-04, KB "prediction-markets-explained"). SOFTSWISS says two live projects run outside the SOFTSWISS Sportsbook ecosystem, unnamed (H, 06-29 post).
- N1 Bet itself: n1bet.com returns HTTP 403 to scripted GET (bot protection); no prediction-markets page reachable (/prediction-markets, /predictions all 403). n1.bet is a different/uncertain site titled "N1 Betting" (200) with no prediction-market text and 404 on /prediction-markets, so unconfirmed that it is the same brand (L). Could not confirm N1 Bet currently offers prediction markets. WebSearch budget was exhausted, so no independent search confirmation.

## Kind and market model
- kind: white-label B2B platform module for iGaming operators; fixed-odds (H): "Operates within fixed-odds - players bet against the bookmaker." Odds derive from implied probabilities, adjusted by market signals/exposure/risk logic, "fixed at the moment a bet is accepted" (H, https://www.softswiss.com/knowledge-base/prediction-markets-explained/).
- Binary Yes/No style event betting; categories: politics, economics, crypto, technology, entertainment, sports ("10+ categories" on hero) (H).
- No order book, no AMM, no outcome tokens. Panel piece explicitly contrasts it with P2P exchanges like Polymarket/Kalshi (H, https://www.softswiss.com/news/panel-prediction-markets/ , 2026-07-07).
- Pricing source: NOT FOUND. Page says "automated pricing and risk scoring" and a 10-tier automated risk management system; data provider unnamed (H for the statement, unknown source).

## Chains and collateral
- "Accepts bets in both fiat and cryptocurrencies through a seamless wallet infrastructure" (H). That is the operator's custodial casino wallet; no blockchain settlement stated. Chains/contracts: NOT FOUND.

## Read API
- exists: none (public). Integration for operators is "via API or iFrame" (H) but that is a private B2B integration for licensed clients. No public docs URL found (searched: softswiss.com product page, KB; no developer docs surfaced). No websocket, no rate limits documented.
- No fixtures saved (nothing public to sample).

## Trade path
- none programmatically for third parties. Players use the brand's account UI after KYC. No order signing, no on-chain tx.

## PayBox reachability
- no. Custodial operator account; no EVM/Solana tx proposals or signed orders. At most a crypto deposit to an operator address (not a trade path, and ToS/KYC-gated).

## Fees
- NOT FOUND. Fixed-odds margin is operator-controlled ("category-specific margin control"), i.e. embedded in the odds (overround), paid by the player (H for margin control, formula unknown).

## Resolution / dispute risk
- Operator-resolved (house decides settlement); no oracle or public dispute process documented. NOT FOUND for rules. Dispute risk: high/opaque relative to on-chain venues (M).

## Geo / ToS / automation
- Licensing: operator's own gambling/sportsbook licence "in most regulated markets", fit confirmed at onboarding (H). The blog says the module "solves technology, not licensing" and an existing licence generally does not cover event contracts (M). SOFTSWISS cites Mexico licensed brands (H). Brand-level ToS for N1 Bet NOT FOUND (site 403). Bookmakers typically restrict automated betting/limit winners; unverified for this brand (L).

## Liquidity
- None disclosed. Fixed-odds; limits set by the house. Only industry-level figure in SOFTSWISS's report: monthly prediction-market volume $32m (Jan 2024) to $12.6bn (Jan 2026) (H, https://www.softswiss.com/news/prediction-markets-report/, 2026-05-18). No volume for N1 Bet.

## Category overlap
- Politics, economics/macro, crypto, sports, entertainment overlap other venues in principle, but with fixed-odds house pricing there is no depth to arb and no API to scan. Signal value: if the pricing feed is derived from Polymarket/Kalshi-like consensus, the odds are a downstream copy (M, speculation; source unnamed).

## Shared liquidity
- Not an independent venue: the house is the counterparty; pricing source unknown and possibly derived from other venues. Not an independent arbitrage leg.

## Suspicious content
- None observed in fetched pages.

## Open questions
- Does N1 Bet actually run SOFTSWISS Prediction Markets (brand site blocked)? Who supplies the odds? Is there any partner/affiliate data feed?

## Sources
- https://www.mygaminglicense.com/blog/an-operators-guide-to-the-prediction-market-boom (2026-04-24)
- https://www.softswiss.com/ (nav, FAQ)
- https://www.softswiss.com/prediction-markets-software/
- https://www.softswiss.com/knowledge-base/prediction-markets-explained/
- https://www.softswiss.com/news/prediction-markets-report/ (2026-05-18)
- https://www.softswiss.com/news/prediction-markets-surpasses-50-signed-projects/ (2026-06-29)
- https://www.softswiss.com/news/panel-prediction-markets/ (2026-07-07)
- https://www.softswiss.com/news/prediction-markets-sigma-north-america-2026/ (2026-09-04)
- https://n1bet.com/ (HTTP 403), https://n1.bet/ (200, "N1 Betting", unconfirmed same brand)
