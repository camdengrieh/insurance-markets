# Deepcoin (deepcoin.com) - venue spec

Researched 2026-10-19. Verdict: **skip** as an independent arbitrage leg. It is a crypto CEX that fronts Polymarket "Event Contracts" via a builder-code integration. Liquidity is Polymarket's. No public prediction-market API.

## Summary
- Kind: centralized crypto exchange (spot, perpetual swaps, copy trading, TradFi-linked perps) with a front-end "Event Contract" feature that routes to Polymarket. (H for exchange products, deepcoin.com homepage; M for the event-contract feature, press coverage.)
- Still live: yes. Exchange is operating; REST market data returns live BTC/ETH swap quotes on 2026-10-19 (H, api.deepcoin.com). Event Contract feature announced Feb 26 / Apr 1-4 2026 (M, press release).
- Homepage (fetched 2026-10-19) lists spot, derivatives, copy trading, TradFi-linked markets, API access. It does NOT mention prediction markets or event contracts (H). The Event Contract feature is likely inside the logged-in app only.

## Market model
- Event Contract = Polymarket markets (binary/categorical, CLOB, outcome tokens are Polymarket CTF ERC-1155 on Polygon) presented in the Deepcoin UI. Deepcoin claims "positions mirrored one-for-one with Polymarket contracts" and "synchronized settlement" (M, crypto.news, 2026-04-01; PR Newswire, 2026-04-04). Mechanics (custodial vs on-chain, whether Deepcoin takes the other side) are NOT FOUND.

## Evidence it is a Polymarket builder
- Polymarket Data API builder leaderboard, timePeriod=ALL, rank 56: builder "Deepcoin", volume 11,859,419 USD, activeUsers 1, verified true (H, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50, fetched 2026-10-19). Fixture: docs/research/fixtures/deepcoin/polymarket-builder-leaderboard-deepcoin-row.json.
- Not present in DAY/WEEK/MONTH top-100 leaderboards (checked first 50 of each only; pages not exhaustively walked) so recent activity is unconfirmed (M).
- activeUsers=1 with 11.9M volume is consistent with an omnibus/routing account rather than per-user wallets (M, inference). All orders appear on-chain/CLOB as Polymarket orders, so they are not separately visible as Deepcoin liquidity.

## Chains and collateral
- Underlying: Polymarket on Polygon, pUSD/USDC collateral (see the Polymarket spec; not re-researched). Deepcoin-side funding is via exchange deposits (custodial). NOT FOUND for event-contract specifics.

## Read API
- exists: official-public for CEX spot/swap market data only. Nothing for event contracts.
- Base URL: https://api.deepcoin.com (H, https://www.deepcoin.com/docs/authentication).
- Docs: https://www.deepcoin.com/docs/ (the /docs path serves an nginx default page; /docs/authentication works) (H).
- Verified unauthenticated: GET /deepcoin/market/tickers?instType=SWAP returns code "0" with OKX-style ticker rows (H). GET /deepcoin/market/instruments?instType=SPOT returns 170 spot instruments (H). instType=EVENT or OPTION returns `code 51: instType value not in acceptable range: SPOT,SWAP` (H) - i.e. event contracts are not exposed in the public market-data API.
- Fixtures: docs/research/fixtures/deepcoin/tickers-swap-first2.json, instruments-spot-first3.json.
- Rate limits and websocket URLs: the docs nav lists "Rate Limit Rules", Public WebSocket and Private WebSocket pages, but I could not fetch their paths. NOT FOUND (searched: /docs/authentication nav, web search).
- For prediction data, use Polymarket's own APIs; Deepcoin adds nothing.

## Trade path
- CEX API trading uses API key + secret + passphrase with HMAC-SHA256/base64 headers DC-ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE (H, docs/authentication). Event contracts via API: NOT FOUND.
- PayBox reachability: **no**. Custodial exchange account; deposits to a Deepcoin deposit address are a transfer only, not a trade path. A PayBox EVM wallet is better used to trade Polymarket directly.

## Fees
- NOT FOUND (event-contract fee schedule not in press release; searched PR Newswire, crypto.news, web search). Polymarket's own taker fee presumably applies underneath, plus any Deepcoin markup (unknown).

## Resolution
- Inherited from Polymarket (UMA optimistic oracle for most markets) per Deepcoin's "synchronized settlement" claim (M). Extra counterparty risk: Deepcoin custody and its settlement honouring.

## Geo / ToS / automation
- Regions and ToS for Event Contract: NOT FOUND. Deepcoin is described as Cayman-based (PR Newswire dateline Grand Cayman) / Singapore / Dubai in aggregators (L, inconsistent). API keys without IP binding with trade permissions are auto-deleted after 30 days of inactivity (H, docs/authentication).

## Liquidity
- Polymarket builder volume 11.86M USD all-time (H, 2026-10-19). Exchange 24h volume figures from aggregators are inconsistent (L; not used). BTC-USD swap showed ask/bid size ~70k contracts (H, 2026-10-19) but is irrelevant to prediction markets.
- Shares liquidity with: Polymarket. NOT an independent arbitrage leg.

## Event coverage
- Whatever Polymarket lists (sports, politics, crypto price, macro). No independent pricing.

## Adapter recommendation
- Priority: skip. Optional: track the Deepcoin builder code (0x290cc664...dd8c4) volume on Polymarket as a flow signal only. The builder code is public data from the leaderboard.

## Suspicious content
- None observed. Press releases are promotional; their claims are unverified.

## Open questions
- Is Event Contract custodial mirroring or true routing? Fee, geo and ToS rules? Not answerable without logging in.

## Sources
- https://www.deepcoin.com/ (H)
- https://www.deepcoin.com/docs/authentication (H)
- https://api.deepcoin.com/deepcoin/market/tickers?instType=SWAP and /instruments?instType=SPOT (H)
- https://data-api.polymarket.com/v1/builders/leaderboard (H)
- https://www.prnewswire.com/news-releases/deepcoin-partners-with-polymarket-to-launch-event-contract-302734243.html (M, via WebFetch summary)
- https://crypto.news/deepcoin-becomes-first-cex-to-integrate-polymarket-event-contracts/ (M, via WebFetch summary)
- https://www.mexc.com/news/1006919 (returned HTTP 410; known only from search snippet) (L)
