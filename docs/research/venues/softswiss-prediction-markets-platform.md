# SOFTSWISS Prediction Markets Platform - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. This is a B2B white-label software product (fixed-odds sportsbook-style), not a venue. There is no public market data, no public API, no on-chain component, and no single consumer-facing marketplace to scan. Each operator that licenses it runs its own book, with its own odds, behind its own login. At most it is a "signal-only" idea per operator, and none are named.

## Is it live?

- Launched 2026-04-02 as a B2B product for casino and sportsbook operators. H - https://www.softswiss.com/news/prediction-markets-launch/
- Update 2026-06-29: "more than 50 projects" in the pipeline since launch; two live projects outside the SOFTSWISS Sportsbook ecosystem; no operators named. H - https://www.softswiss.com/news/prediction-markets-surpasses-50-signed-projects/
- Product page live on 2026-10-19 (cites SiGMA Asia 2026 award). H - https://www.softswiss.com/prediction-markets-software/
- Operator brands running it: NOT FOUND (searched: product page, launch and 50-projects news posts, knowledge-base article; WebSearch budget was exhausted so no outside search was possible).

## Kind and market model

- kind: B2B white-label software (fixed odds), off-chain. H
- Players bet against the operator/bookmaker, not each other; page says it is "not a trading" platform and not a peer-to-peer exchange. H - product page FAQ
- Binary outcomes on real-world events (launch post). H. Categorical/scalar: NOT FOUND.
- Not an order book, AMM or parimutuel. Odds are set by the operator from implied probabilities, adjusted for signals, exposure and risk logic; locked when a bet is accepted. H - https://www.softswiss.com/knowledge-base/prediction-markets-explained/ (updated 2026-06-03)
- No outcome tokens: a bet is a ticket in the operator's account system. M (nothing on tokenisation is documented; inferred from the fixed-odds sportsbook model).
- "10-Tier Automated risk management" and operator-adjustable margins per category. H - product page.

## Chains and collateral

- Fiat or crypto "through a wallet infrastructure" per the product page; no chains, tokens or contracts named. The launch post does not mention crypto. H (page statements), details NOT FOUND.
- No smart contracts. SOFTSWISS GitHub org (gh api orgs/softswiss/repos) lists only Ruby/JS utility repos; nothing prediction-related. H

## Read API

- exists: **none** (public). Integration is "API or iFrame" for licensed operators; no public docs. H - knowledge-base + product page.
- Docs URL: NOT FOUND. docs.softswiss.com returns 403 to an unauthenticated GET (probably gated); developers.softswiss.com and api.softswiss.com do not resolve. H (curl 2026-10-19)
- Markets, prices/books, trades, resolution endpoints, rate limits, websocket: NOT FOUND (searched: product page, news, knowledge base, GitHub org).
- Fixtures: none saved, because there is no public endpoint to sample.

## Trade path

- None for an outside agent. Bets are placed by end-users inside an operator's licensed site/iFrame under that operator's KYC and account. No order-signing scheme, no API keys available to outsiders. H/M

## PayBox reachability

- paybox_reachable: **no**. Nothing on-chain or signed-order based to propose; any crypto deposit would be to an operator's custodial wallet under KYC, which is not a market trade. M

## Fees

- No platform fee schedule is published. Operator revenue comes from configurable margin (overround) baked into odds; the player pays implicitly. H (product page) / formulas NOT FOUND.

## Resolution mechanism and dispute risk

- Product page says the software "typically" integrates with market sources and offers resolution and settlement features; no specifics. H. Knowledge base says markets need a trusted, verifiable data source. H
- Resolution is therefore operator-controlled (house rules); dispute risk is whatever the operator's T&Cs say, with no on-chain recourse. M

## Geo / ToS / automation

- Runs "within their existing licence" of each operator (launch/50-projects posts). SOFTSWISS's own entity Stable Aggregator Limited holds MGA licence MGA/B2B/942/2022. H. Per-operator geo rules, bot/automation terms: NOT FOUND (no operator named).
- Fixed-odds sportsbook operators typically prohibit automated betting, but this is M/inference only.

## Liquidity

- No volume, OI or TVL published; launch and 50-projects posts give none. H (absence). The fixed-odds model means operator balance sheet is the counterparty; there is no pooled liquidity. Liquidity/hedging source "not stated". H
- Market sizes quoted in the posts concern the sector (US prediction-market volume ~$300M in 2024 to est. $40-50B in 2025), not SOFTSWISS. H

## Event categories overlapping other venues

- Politics, economics, sports, crypto, technology, entertainment (product page; page says "10+" categories but lists six and calls them "5 core", so it is inconsistent). H
- Overlap with Polymarket/Kalshi is by topic only. Because odds are operator-set with margin, a hypothetical operator-quote vs exchange-price comparison could show edge but it is not scrapable or tradable by an agent.

## Shared liquidity

- Not shared with another venue as far as documented. Operators may set odds off Polymarket/Kalshi-like "market signals" (knowledge base says odds are "adjusted based on market signals"), so prices are likely derivative of other venues rather than independent. M. Not an independent arbitrage leg either way.

## Open questions

- Which operators run it, and do any expose a public odds feed?
- Is there partner API documentation (likely behind SOFTSWISS partner login)?
- Where does operator liquidity or hedging come from?

## Sources

- https://www.softswiss.com/prediction-markets-software/ (H, fetched 2026-10-19)
- https://www.softswiss.com/news/prediction-markets-launch/ (H, dated 2026-04-02)
- https://www.softswiss.com/news/prediction-markets-surpasses-50-signed-projects/ (H, dated 2026-06-29)
- https://www.softswiss.com/knowledge-base/prediction-markets-explained/ (H, updated 2026-06-03)
- https://www.softswiss.com/sitemap_index.xml (H; used to discover the pages above)
- https://www.softswiss.com/news/ (H; no further product news on page 1, Sep 15 - Oct 14 2026)
- gh api orgs/softswiss/repos (H; no relevant repos)
- curl of docs.softswiss.com (403), developers.softswiss.com and api.softswiss.com (no DNS)
- Limits: WebSearch budget was exhausted, so no independent third-party coverage was checked. Page contents were read through a summarising fetch tool, not raw HTML. No instructions aimed at AI agents were found in any page.
