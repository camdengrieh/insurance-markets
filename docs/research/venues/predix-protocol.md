# PrediX Protocol (venue spec)

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. PrediX is a pre-production "beta" on Unichain mainnet that settles in a valueless walled-garden TestUSDC. Real-money production is "TBA" and the contracts README says mainnet is gated on an external audit. There is no public read API (base URLs are "TBA"), on-chain trading volume is tiny and stopped in June 2026, and the ToS bar automated Interface use and name the US as restricted. Revisit only if a production (Circle USDC) deployment appears.

## Identity and liveness

- The discovery hint (coincraze.co) is the parent ecosystem brand. The GitHub org PrediX-Protocol has homepage https://coincraze.co and the description "The prediction market of CoinCraze ecosystem" (created 2026-03-24). [H: gh api orgs/PrediX-Protocol]
- coincraze.co and www.coincraze.co return HTTP 526 (invalid TLS cert at origin) on 2026-10-19. docs/app/api subdomains of coincraze.co do not resolve. [H: curl]
- The real product domains per the official docs are predixpro.io, beta.predixpro.io and docs.predixpro.io; all three return HTTP 200. [H: curl, plus docs resources/links.md]
- predix.app, which the docs also reference (app.predix.app, docs.predix.app, security@predix.app), serves only a JS redirect to "/lander" (parked-looking). app.predix.app, docs.predix.app and api.predix.app do not resolve. The docs mix the two domains, so some docs are stale or the domain was abandoned. [H: curl]. Treat any "predix.app" link as suspect.
- Legal entity: PrediXpro Labs Limited, BVI law; says it is preparing a licence application (CIMA VASP). [H: ToS lines 13, 53, 61]
- Status: **beta/pre-production, not a live real-money venue**. [H]

Quotes from the official docs (en_v7_developers/getting-started/beta.md): "PrediX runs a public beta on Unichain mainnet. The smart contracts are the production code; the USDC is a walled-garden test token". Production: "Circle USDC on Unichain ... TBA". "Persistence: May reset before production launch."

The contracts README (predix-contracts, last push 2026-06-21) says: "Mainnet (Unichain, chainId 130): not yet deployed. Gated on external audit sign-off and governance handover to a multisig." This conflicts with the docs' "beta on mainnet" wording, and the explanation is that the beta uses a separate walled-garden deployment on chain 130. [H both; reconciliation is M]

## Kind and market model

- kind: onchain, hybrid on-chain CLOB + Uniswap v4 AMM (hook), Diamond (EIP-2535) core. [H: README]
- Binary YES/NO markets; each market mints a pair of ERC-20 outcome tokens (EIP-2612 permit) via `splitPosition(marketId, usdc)`; 1 YES + 1 NO = 1 USDC collateral. [H]
- Multi-outcome "events": N sibling binary markets with an exactly-one-winner invariant (EventFacet). Scalar and sports are display-layer compositions of binaries (e.g. ladder of thresholds). [H: README, API reference market-kind union]
- CLOB: 99-tick on-chain order book, price-time priority, 4-way waterfall (direct, mint, merge). AMM: Uniswap v4 pool bound to each market through a hook. Router is a stateless aggregator that fills CLOB first then AMM atomically. [H: docs comparison.md, README]

## Chains and collateral

- Chain: Unichain (OP Stack L2), chainId 130 (beta); chainId 1301 Unichain Sepolia (testnet, live since 2026-04-17). [H]
- Beta collateral: TestUSDC `0xB3FCA863dD0F6b496cCDDf6497Da5Dad67857F56` (6 decimals), 10,000 free from a faucet, one claim per address. Blockscout flags it reputation="scam" with 7,609 holders, which is consistent with a worthless faucet token imitating USDC. [H: docs beta.md; Blockscout GET https://unichain.blockscout.com/api/v2/tokens/0xB3FC...]
- Beta contract addresses (docs beta.md, verified on Blockscout as PrediXRouter etc.): diamond `0xC8F12AF2a396c9C906ac36Bc0AC2279BBb69Ef96`, router `0xf7D11488B6B0DAc511aE637AB02876dbE36cAdD6`, exchange `0x506367C7c48C95A4843F45d5C2F177B35e69594E`, hookProxy `0x2EA5EaC8A4E31F0889e86fc135C5eAE8e0b16AE0`, poolManager `0x1F98400000000000000000000000000000000004`, permit2 canonical. [H]
- Beta limits: per-market collateral cap 5,000 test-USDC; market creation fee 10 test-USDC. [H]
- Gas is sponsored by a paymaster on beta (ERC-4337, Pimlico bundler proxy). [H]

## Read API

- Documented, but base URLs are "TBA" for both beta and production. Access to beta endpoints "coordinated via Discord" (#beta-access, receive "beta API endpoint + key"). [H: beta.md]. exists = unofficial-only/none public today; best classification: **onchain-or-subgraph-only** (plus an invite-only REST layer).
- Planned/documented layers (docs: https://docs.predixpro.io, source repo PrediX-Protocol/predix-docs, en_v7_developers/integration/api-reference.md):
  - Indexer (Ponder + Postgres + Hono), public read-only: `GET /api/markets`, `/api/markets/:id`, `/:id/trades`, `/:id/prices`, `/:id/orderbook`, `/:id/liquidity`, `/:id/amm-state`, `/:id/candles`, `/api/events`, `/api/exchange/orders`, `/api/stats`, `/api/health`. [H docs; not reachable]
  - Backend (NestJS): `/api/markets`, `/api/markets/:id/pricing/view`, `POST /api/markets/:id/pricing/quote`, `POST /api/markets-batch/price-views` (50 max); SIWE auth for user data. [H docs]
  - WebSocket `wss://<host>/ws/realtime`, topics orderbook/prices/trades (public), user-* (auth); 1s poller-based; 50 subs/connection, 20 conns/IP. [H docs]
  - Limits: free 60 req/min/IP, 300 req/min/user, 10,000 req/day; auth endpoints 5/min. [H docs]
- Unauthenticated probes on 2026-10-19: https://beta.predixpro.io/api/markets and /api/health both return 404 HTML (that host is the Next.js frontend, not the API). No working public API host found. [H]
- Price units: decimal strings (e.g. "0.62"), amounts as decimal strings with 6 decimals, timestamps unix seconds. [H docs]
- On-chain reads work without any API: Router `quoteBuyYes/quoteSellYes/quoteBuyNo/quoteSellNo` return (total, clobPortion, ammPortion); events `Trade`, `OrderPlaced`, `OrderMatched`, `MarketCreated`, `MarketResolved`. [H README + docs]
- Fixtures: none saved (no public API response could be obtained).

## Trade path

- Direct on-chain via Router: `buyYes/sellYes/buyNo/sellNo(marketId, amountIn, minOut, recipient, maxFills, deadline)` plus Permit2 variants (`buyYesWithPermit`); limit orders via Exchange `placeOrder`. Standard wallet-signed EVM transactions; no API key. "API key authentication for programmatic trading ... planned". [H]
- PayBox reachability: **partial in principle, no in practice today**. A PayBox EVM wallet could propose transactions on Unichain (130) if PayBox supports that network (NOT VERIFIED, not checked in this task), approve Permit2, and call the Router. But the only available collateral is TestUSDC with no monetary value, so there is no economic trade to make. Unichain support in PayBox: NOT FOUND (not searched in PayBox this session; no PayBox tools were called).

## Fees

- AMM dynamic fee by time to expiry: 0.5% (7+ days), 1% (3-7 days), 2% (1-3 days), 5% (under 24h). README says 50 bps rising to 500 bps. [H docs economic-architecture.md, README]
- CLOB taker fee: Fee = C x r x p(1-p), r = market rate (sports example 2.0%); maker fee not stated. [H docs]
- Redemption fee on winnings: configurable, snapshotted at market creation, hard cap 15%. [H README]
- Market creation: 10-50 USDC. [H docs]

## Resolution and dispute risk

- Chainlink oracle (price-threshold markets): permissionless, round-pinned, sequencer-aware; outcome = price >= threshold. [H]
- ManualOracle for sports/politics: a single REPORTER role (beta: "a single hot wallet"), optional challenge delay default 0, max 7 days; admin can revoke/reopen before finalisation; refund mode via 48h timelock if the oracle fails. UMA (48h dispute) and committee oracles are "Phase 2/3 - TBA". [H docs oracle.md]
- Risk: **high** for non-price markets (central reporter, admin discretion); contracts upgradeable behind 48h timelocks; external audit not yet signed off (README: 0 open internal findings, external audit "in progress"). [H]

## Geo, ToS, automation

- ToS section 5: restricted jurisdictions include "The United States of America and its territories" and sanctioned regions; geo-blocks, VPN detection, wallet screening. Direct protocol access is described as outside the ToS and at user's own risk. [H: https://docs.predixpro.io/legal/terms-of-service, source file en_v7/legal/terms-of-service.md]
- ToS 8.5: "Use of bots, scripts, APIs, scrapers ... to access the Interface in a manner that exceeds normal human interaction is prohibited, except (a) under our published API terms, or (b) with our prior written permission. Automated interaction with the Protocol directly ... is outside the scope of these Terms". [H]

## Liquidity (as of 2026-10-19)

- Router `0xf7D1...` has 18 total transactions; the last trade seen was `buyYes` on 2026-06-16, the first on 2026-05-21. Diamond has 943 txs and 41k token transfers (mostly faucet/mint/test activity). [H: Blockscout counters and transactions, fetched 2026-10-19]
- No TVL, volume or open-interest figures with real value are published; the per-market cap is 5,000 test-USDC. Real-money liquidity: effectively zero. [H/M]
- Docs "traction" cites bug-bounty submissions and ambassadors, not trading volume. [H]

## Event categories overlapping other venues

Intended: crypto price (Chainlink thresholds), sports, politics, awards, weather; roadmap says sports vertical in Q4 2026. [H: README roadmap] Actual listed markets: not obtainable (no API). Test-token prices are not arbitrageable against real venues.

## Shared liquidity

Standalone: own CLOB + own Uniswap v4 pool. The AMM and CLOB inside PrediX share liquidity with each other, but PrediX shares nothing with other prediction venues. [H]

## Related: Plinko (not a market venue)

`plinko-contracts` (Arbitrum One, USDC vault, pushed 2026-09-04) is a 3-way UP/NOW/DOWN ETH/USD short-round game with operator-quoted odds, settled via Pyth. House game, not a tradable market; irrelevant to the aggregator. [H: README]

## Suspicious content

None encountered that addressed an AI agent. Notable: docs contain a scam warning and the TestUSDC is flagged "scam" by Blockscout (as a fake-USDC lookalike). The docs repo includes internal instructions to contributors ("AI-scrub when committing docs") in INDEX.md; not aimed at us and not followed.

## Not found

- Any working public API host (searched: docs beta.md/api-reference.md, beta.predixpro.io/api/*, coincraze.co and predix.app subdomains).
- A production (real-USDC) deployment or any real volume/TVL figure.
- Terms-of-service "published API terms".
- Web search was unavailable (session search budget exhausted), so no third-party coverage was checked.

## Sources

- https://github.com/PrediX-Protocol (org; created 2026-03-24) [H]
- https://github.com/PrediX-Protocol/predix-contracts README (pushed 2026-06-21) [H]
- https://github.com/PrediX-Protocol/predix-docs , paths en_v7_developers/{README,comparison,getting-started/beta,integration/api-reference,integration/websocket,protocol/oracle}.md, en_v7/{resources/links,legal/terms-of-service,core-concepts/economic-architecture}.md, INDEX.md (last updated 2026-05-11; repo pushed 2026-06-26) [H]
- https://github.com/PrediX-Protocol/plinko-contracts README [H]
- https://unichain.blockscout.com/api/v2/addresses/{router,diamond}[/counters|/transactions], /tokens/{TestUSDC} (GET, 2026-10-19) [H]
- https://beta.predixpro.io , https://predixpro.io , https://docs.predixpro.io (HTTP 200 only; contents not read) [H for status]
- https://coincraze.co (HTTP 526) [H]
