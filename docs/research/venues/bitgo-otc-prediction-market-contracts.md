# BitGo OTC prediction-market contracts (venue spec)

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale.

## Verdict

Adapter priority: **skip**. This is a bilateral, request-for-price, ISDA-papered OTC desk for eligible contract participants (min $100k ticket). It has no public market data, no public or documented API for prediction-market contracts, and no programmatic trade path. Contracts reference listed Polymarket and Kalshi markets, so it is not an independent price source or arbitrage leg; it is a wrapper on venues already covered elsewhere. Re-check only if BitGo ships the promised API phase.

## Is it live (2026)?

- Launched 2026-03-24 (BitGo press page and Business Wire release date, M via search snippet; Finance Magnates, CoinDesk, The Block, Unchained all dated 2026-03-24). H for the BitGo product page existing today: https://www.bitgo.com/products/prediction-markets/ (access by "Request Access" form) and https://www.bitgo.com/resources/blog/bitgo-launches-prediction-markets/ ("live now").
- No later news (volume, API, expansion) found in searches on 2026-10-19. NOT FOUND (searched: "BitGo prediction markets institutional update volume OR expansion OR API 2026", "... API access custom markets phase two swap dealer"). Last data point is ~7 months old, so treat the status as "live as of launch, unverified since" (M).

## Kind and market model

- Kind: bilateral OTC event-linked derivatives (binary option / event contract confirmations) between the client and BitGo Prime, with Susquehanna Crypto as the back-end liquidity provider (H: bitgo.com product page and blog).
- Binary outcomes; contracts are fully funded, capital locked until expiry (M: A-Team Insight, paraphrasing BitGo trading head).
- No order book, AMM or parimutuel. Pricing is by request: the client asks for a price, BitGo "will always find a price", spreads wider on thin markets (M: A-Team).
- No outcome tokenisation: positions are ISDA-documented trades on BitGo's books, not tokens. NOT FOUND of any on-chain representation.
- Underlying: contracts reference listed markets on Polymarket or Kalshi; BitGo decides whether a market has enough liquidity to quote (M: A-Team Insight only; BitGo's own pages do not name venues, H for that absence).

## Roadmap (all M, single secondary source: A-Team Insight)

- Phase 1 (launch): OTC, high-touch, institutional clip sizes.
- Phase 2: add venues beyond Polymarket and Kalshi.
- Phase 3: client-created unlisted markets with custom parameters.
- API: BitGo runs an electronic UI/API platform for spot and plans to bring prediction-market execution into it, eventually "programmatic and agentic" participation; described as "probably a bit further out", no timeline. The Block/Business Wire coverage I could read does not mention this (H for absence in The Block).

## Chains and collateral

- Collateral: USD, stablecoins, BTC, other crypto held in BitGo custody; no fiat conversion or liquidation needed (H: BitGo blog). ETH named by Finance Magnates (M). Collateral earns no interest at launch (M: A-Team).
- Chain: none. Settlement is on BitGo's books inside its custody and settlement stack; NOT FOUND of any chain, contract address or token.

## Read API

- exists: **none** (for prediction markets). Evidence: BitGo product page and blog mention only a "Request Access" form / contact the team (H). BitGo developer portal https://developers.bitgo.com/llms.txt (H, 147 KB index fetched 2026-10-19) lists REST, Express, Trade WebSocket and FIX 4.4 APIs for spot/margin trading and custody, and grep for "predict" returns zero hits. NOT FOUND (searched: developers.bitgo.com/llms.txt for predict/event/rfq; web search for BitGo prediction-market API).
- BitGo OTC page lists "Electronic Trading: Self-serve API connectivity and web platform for programmatic trading" as a separate product, without tying it to prediction markets (H: https://www.bitgo.com/products/otc-trading/).
- Public market data: none. Quotes are bilateral and private. No public book, trades, or resolution feed.
- Auth and rate limits: not applicable to prediction markets. The generic BitGo trading API is authenticated (access token); not researched further because it does not cover this product.
- Fixtures: none saved, no public read endpoint exists.

## Trade path

- None programmatic. Onboarding via access request form, ISDA documentation, eligible contract participant status, then voice/chat/interface RFQ with the OTC desk (H for form; M for ISDA/ECP from A-Team).
- Minimum $100,000 per trade on "any listed contract" (H: BitGo blog; also The Block, M).

## PayBox reachability

- paybox_reachable: **no**. There is no on-chain contract, signed-order scheme or API. An EVM or Solana wallet in PayBox cannot place trades. At most a PayBox wallet could fund a BitGo custody deposit address (a plain transfer), which does not constitute trading and would require BitGo KYB onboarding and ECP status.

## Fees

NOT FOUND. BitGo pages say only "competitive all-in pricing" (H: OTC page). Fee is embedded in the spread, which is wider on thin markets (M).

## Resolution and dispute risk

- Not documented by BitGo (H for absence on product page and blog). Contracts are binary and follow the referenced Polymarket/Kalshi market, so resolution presumably tracks that venue's outcome (L, inferred). Dispute terms live in the ISDA confirmation, not public. Basis risk versus the reference market is possible; unverified.

## Geo, ToS, automation

- Eligible contract participants only (hedge funds, family offices, ultra-high-net-worth). Availability "will vary by jurisdiction" (M: search snippet of BitGo page; the page itself returned no jurisdiction list when fetched, H for absence). BitGo Prime operates under the CFTC de minimis swap dealer exemption ($8B annualised notional cap, shared with its options book), acts as riskless principal, plans swap dealer registration later (M: A-Team, and search summary of The Block).
- robots.txt Content-Signal: search=yes, ai-input=yes, ai-train=no (H). No instructions aimed at AI agents found on any BitGo page read.
- Automation: no API, so moot.

## Liquidity

NOT FOUND for this product (no volume, OI, or TVL published; searched press, BitGo pages, news). Context only: industry prediction-market volume ~$40-45B in 2025 (M: CoinDesk, Unchained). Susquehanna was Kalshi's first official designated market maker in 2024 (M: The Block, Unchained), so likely hedges on Kalshi/Polymarket (L, inferred).

## Event coverage (overlap)

BitGo lists elections, sports, crypto outcomes "beyond simple price exposure", rates/policy macro (H: product page). Because contracts reference Polymarket/Kalshi, overlap with those venues is total by construction.

## Liquidity shared with

Polymarket and Kalshi (reference markets and presumed hedge venues) and Susquehanna Crypto (LP, also a Kalshi market maker). Not an independent arbitrage leg (M).

## Open questions

- Which exact venue and contract identifiers each BitGo quote maps to (not public).
- Whether the API phase has shipped since March 2026; re-check developers.bitgo.com in a few months.
- Settlement and dispute terms.

## Sources

- https://www.bitgo.com/products/prediction-markets/ (H, fetched 2026-10-19)
- https://www.bitgo.com/resources/blog/bitgo-launches-prediction-markets/ (H)
- https://www.bitgo.com/resources/blog/polymarket-crypto-price-prediction (H, no product detail)
- https://www.bitgo.com/products/otc-trading/ (H)
- https://developers.bitgo.com/llms.txt (H) and https://www.bitgo.com/robots.txt (H)
- https://www.financemagnates.com/institutional-forex/bitgo-and-susquehanna-launch-otc-trading-for-prediction-market-contracts/ (M, 2026-03-24)
- https://www.coindesk.com/business/2026/03/24/bitgo-susquehanna-crypto-offering-institutional-otc-access-to-prediction-markets (M)
- https://www.theblock.co/news/markets/2026-03-24-bitgo-offers-otc-prediction-market-access-institutions-394803 (M)
- https://unchainedcrypto.com/bitgo-and-susquehanna-launch-institutional-otc-access-to-prediction-markets/ (M)
- https://a-teaminsight.com/blog/bitgo-and-susquehanna-build-first-institutional-otc-on-ramp-to-prediction-markets/ (M, only source for phases, venues, ISDA/ECP, API plan)
- Business Wire release via Morningstar returned HTTP 403; not read directly.
