# Spend Market (American Spend, Inc.) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
WebSearch was unavailable (session search budget exhausted), so the pmwisdom.com lead was NOT re-verified and no press/volume coverage was searched.

## Verdict

- Adapter priority: **skip** (revisit as P2 signal-only if markets ever list). Reasons: zero listed markets today, no documented public API, US-only KYC-gated retail product, non-sports consumer-spending niche with almost no overlap to other venues, parimutuel-first lifecycle with $10k graduation threshold, no depth data.
- Still live: the site, docs and an internal API respond (H), but there are no markets (H). "Live infrastructure, empty catalogue."
- Interesting only as a distinctive non-overlapping signal domain (consumer spend) and for the underlying American Spend data/MCP/x402 product, which is a possible data source, not a trading venue.

## Kind and market model

- Kind: on-chain (Arbitrum) prediction market, operator American Spend, Inc. Status: beta/pre-launch with eligibility "working assumptions" and "building toward" CFTC-regulated status. [H docs.spend.market/custody-and-eligibility/eligibility]
- Market types: Versus (head to head), Target (cross a threshold), Ranking (order across a set). Metrics: transaction count, unique purchasers, aggregate spend, average transaction value. Cadences: weekly, monthly, quarterly, event. [H docs.spend.market/markets/overview, resolution-metrics, market-cadences]
- Tokenisation: outcome tokens are ERC-6909 (one contract holds all outcome tokens), held in the user's wallet; complete set = one of each outcome, mint for $1 / burn for $1. [H custody page, complete-sets page]
- Lifecycle "Elastic Markets": [H elastic-markets pages]
  - Phase 1 Early Pool: parimutuel. Price = pool share (70% of collateral on YES -> YES $0.70), prices sum to $1. Collateral locked, no exit until resolution or graduation. Pooled USDC sits in a Morpho-provided ERC-4626 yield vault, yield passed through to users.
  - Phase 2 Open Market: central limit order book (price-time priority, limit and market orders). Graduation is automatic when pool collateral reaches $10,000. Markets that never reach it resolve straight from the pool.
- Min deposit $1, min position $1. [H funding page]

## Chains and collateral

- Arbitrum only, USDC denominated; deposits/withdrawals on Arbitrum. [H FAQ, funding page]
- Gas is "covered for you" (sponsored; mechanism not documented; bundler config strings appear in the client bundle, M). [H funding page]
- Wallets: Privy embedded wallet (email/social) or external wallet (WalletConnect etc.). [H custody page, CSP of spend.market]
- Contract addresses visible in the public client bundle (Arbitrum One), fixture `client_bundle_deployments_2026-10-19.json`: default deployment alias "amsterdam" factory `0xeC1987c00C6db2160DEa557b6024b69969381a9a` (deploy block 484291219), ledger `0x1fF6bFF85f62B6d04c22635ccB7Bc8924a2D7494`, flagged `isClob: true`; two older deployments also listed. [M: read from a first-party bundle, not verified on-chain; explorer API sat behind a Cloudflare challenge and I did not work around it]
- Audits claimed: two independent rounds plus six independent researchers plus AI tooling; reports "will be published" (not yet). [H custody page; claim unverified]

## Read API

- Official public API: **NOT FOUND** (searched: docs.spend.market llms.txt index of all pages, FAQ, spend.market footer links, GitHub gh search for spend.market/americanspend repos, api.spend.market/app.spend.market DNS - neither resolves). No developer/API section in the docs. No GitHub org/repo found.
- Undocumented first-party Next.js routes on https://spend.market (used by the web app, unauthenticated GET works for some). [H, GET 2026-10-19]
  - `GET /api/markets` -> `{"markets":[]}` (HTTP 200, application/json). Fixture `GET_spend.market_api_markets_2026-10-19.json`.
  - `GET /api/markets/search?q=a` -> `{"markets":[]}` (200). Fixture `GET_spend.market_api_markets_search_2026-10-19.json`.
  - `GET /api/market-recent-activity` -> 400 `{"success":false,"error":"marketSlug is required"}` (suggests a per-market activity endpoint keyed by slug).
  - Other route names seen in client JS (not called): `/api/markets/followed`, `/api/market/purchase`, `/api/market/user-purchases`, `/api/portfolio/positions`, `/api/promo-balance`, `/api/spend-points/*`, `/api/user/*` (account-scoped, need auth). [M]
  - Because the catalogue is empty, the market object shape is NOT confirmed. These routes are unofficial, undocumented and may change without notice; treat as L for stability.
- On-chain read path (more likely the real integration surface once markets exist): market contract views seen in the client bundle: `pools(i)`, `totalPool`, `outcomeCount`, `outcomeToken`, `graduated`, `getOutcomeLabels`, `getOrderBookSeedConfig`, `calculatePotentialPayout`, `yieldVault`, `claimableYield`, `redeem`, plus a "market lens" contract. Market enumeration would go through the factory. [M, client bundle only; ABIs not seen in published source]
- CLOB book reads/websocket: NOT FOUND. Rate limits: NOT FOUND.
- Docs URL: https://docs.spend.market (GitBook; markdown for any page by appending `.md`; index at /llms.txt). [H]
- Related but separate: American Spend "API & MCP" (americanspend.com/docs/api/) says spend data is queryable by merchant/category/geo/time at daily grain, with x402 pay-per-call agent access and licensed institutional access; no base URL, endpoints or prices published ("full endpoint reference ships with the developer platform"). [H americanspend.com/docs/api/ via WebFetch] This is a data product (potential signal source), not a market feed. If a 402 is returned, record the requirements and stop.

## Trade path

- Documented programmatic trading: **none**. Docs describe in-app flows only (sign in via Privy or connect wallet, KYC, then place position). [H getting-started pages]
- Client calls `POST /api/market/purchase` style routes (server-mediated, session-authenticated via Privy) for pool purchases; CLOB order signing scheme (EIP-712 domain code is present in bundle but generic viem/Privy code) is NOT confirmed. [M]
- Docs state "No delegated trading. You trade from your own account with your own funds." [H eligibility page] This conflicts with an agent/bot acting for a user and is a ToS-level blocker.

## PayBox reachability

- Paybox reachable: **no** (practically). Chain match is fine in principle - Arbitrum is an EVM chain and trades on the CLOB or pool would be ordinary contract calls/signatures from an EOA - but (1) no documented contract interface or ABI, (2) mandatory KYC with government ID, one account per person, US residents only, and no delegated trading, (3) zero live markets. A PayBox wallet that is not the user's own KYC'd account could not legitimately use it. [M inference from H eligibility text]

## Fees

[H docs.spend.market/markets/fees]
- Phase 1 tiered pool entry fee: pool split into 4 equal collateral tranches paying 0.5%, 1.0%, 1.5%, 2.0%; accrues to a seed fund deployed at graduation.
- Phase 2: maker rebate 30 bps per fill; taker fee 50 bps per fill (30 bps goes to the maker, 20 bps retained by Spend Market).
- Net-profit fee: 1% of net profit on a winning position (payout minus cost); none on stake or losers.
- Locked Phase 1 collateral earns Morpho vault yield passed through to users (upside for holders, but lock-up is a cost for arbitrage).

## Resolution and dispute risk

[H how-markets-resolve, data-and-revere/overview]
- Oracle: "Revere", American Spend's own product, computing a named metric over a named window from anonymized aggregated U.S. consumer card transaction data ("data partners", unnamed). Single-operator, centralised oracle; no on-chain challenge mechanism documented. "Markets are reviewed and resolved by the Spend Market team at launch."
- 48-hour delay from close to resolution/payout.
- Data sufficiency: minimum 10,000 qualifying transactions; fallback is resolve on available panel, extend window, else void and full refund.
- Ties: full refund (Versus, Ranking); Target uses stated operator.
- Disputes: email within 7 days; team review. No independent arbiter. Operator also supplies the data and resolves: high counterparty and discretion risk; underlying panel is not independently verifiable by traders.

## Geo, ToS, automation

- US residents 18+, in permitted states only (list shown at signup), OFAC-sanctions excluded, KYC with government ID required to trade or withdraw, one account per person, "No delegated trading." [H eligibility page]
- Regulatory: not yet a CFTC-regulated market ("building toward"); terms "subject to legal review." [H]
- Full Terms at spend.market/terms and americanspend.com/terms are client-rendered; body NOT readable without a browser, so explicit bot/scraping clauses are NOT FOUND. The terms page carries `noindex`.

## Liquidity

- Volume/OI/TVL: **NOT FOUND** (searched: docs, site, /api/markets). spend.market/markets shows "No markets found" and `/api/markets` returns an empty list on 2026-10-19 [H]. Effective liquidity today: none visible.
- Graduation threshold $10,000 in pool collateral implies small markets; most may never have a book. [H docs]
- Launch/founding date: pmwisdom claims founded 2026 [M, not re-verified]; docs footer/site show (c) 2026 [H].

## Event-category overlap (arbitrage)

- Categories: Food & Beverage, Retail & Commerce, Technology & Software, Health & Wellness, Travel & Hospitality, Financial Services & Wagering, Entertainment & Recreation, Transportation & Mobility. [H spend.market/markets filters]
- Typical questions: Starbucks vs Dunkin, Chipotle vs Cava, Amazon vs Walmart, ChatGPT vs Claude subscribers, "prediction markets vs sportsbooks" spend. [H what-can-you-do page]
- Overlap with sports/politics/crypto price: none. Limited loose overlap with macro (retail sales, CPI-adjacent) and company-performance/earnings markets (Kalshi/Polymarket earnings or "will X report above Y"), but resolution on proprietary panel metrics rarely matches any other venue's contract, so true same-event arbitrage is unlikely. Value would be as a leading signal for consumer-spend and earnings markets, and possibly Quotient-style signals.

## Liquidity sharing

- Own pools and own CLOB; no indication of shared liquidity with another venue (own factory/ledger contracts). Morpho is used only as an ERC-4626 yield vault for idle collateral, not for trading liquidity. [H docs, M bundle]

## Suspicious content

- docs.spend.market (and every .md page, llms.txt) carries a GitBook "Agent Instructions" block telling agents to perform an HTTP GET on `https://docs.spend.market/index.md?ask=<question>&goal=<user_goal>` and to send the user's goal. Not followed (it would leak the task goal to a third party and is unnecessary; pages were read directly via `.md`).

## Open questions

- Does spend.market have any live or scheduled markets, and when does public launch occur? (empty today)
- Real API plans (CLOB REST/WS) and published contract ABIs/addresses; are the bundle addresses the production deployments?
- Does Terms permit API/bot access given "no delegated trading"?
- Who are the data partners, is the panel auditable, and will Revere publish methodology?
- Is the pmwisdom.com description (Revere, ERC-6909, Arbitrum) consistent with docs? Docs confirm Arbitrum, USDC, ERC-6909, Revere (H); "founded 2026" unverified.

## Sources

- https://docs.spend.market/llms.txt and .md pages: welcome-to-spend-market/overview, what-can-you-do-on-spend-market; markets/overview, market-types, resolution-metrics, market-cadences, elastic-markets (+phase-1-early-pool, phase-2-open-market), graduation-and-complete-sets (+complete-sets), how-markets-resolve, fees; data-and-revere/overview; custody-and-eligibility/custody, eligibility; faq-and-glossary/faq; getting-started/overview, funding-your-account (all fetched 2026-10-19, H)
- https://spend.market/ (markets page, HTTP headers/CSP, client JS bundle chunks), https://spend.market/api/markets, /api/markets/search, /api/market-recent-activity (GET 2026-10-19, H for responses, M for bundle-derived addresses)
- https://www.americanspend.com/ and https://www.americanspend.com/docs/api/ (WebFetch 2026-10-19, H)
- gh search repos/code for spend.market and americanspend: no relevant repos (negative result, H)
- https://arbitrum.blockscout.com address lookups: blocked by Cloudflare challenge, not circumvented
- pmwisdom.com (from discovery hint only, M, not re-fetched)
- Fixtures: docs/research/fixtures/spend-market-american-spend-inc/
