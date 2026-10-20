# TRUEiGTECH / TruePredict (venue-spec)

Researched 2026-10-19. Verdict: NOT A VENUE. B2B white-label software vendor. adapter_priority = skip.

## Summary
- TRUEiGTECH (trueigtech.com) is an iGaming software house selling prediction-market platforms (turnkey, sports, crypto, "Kalshi clone", "Polymarket clone") to operators. [H]
- TruePredict (sports prediction software, launched 2026-05-26) and TRUEPREDiCT / truepredictsoftware.com (event-trading platform dev company, sweepstakes product) are vendor marketing sites. [H]
- No public consumer exchange, no named operator, no volume/OI/TVL figure, no public API docs, no contract addresses found. [H for absence on sites read; searched: trueigtech.com, truepredictsoftware.com, 3 press releases, WebSearch]
- Whatever liquidity exists sits inside individual licensed operators' private deployments (and their own books) or is proxied from Polymarket/Kalshi (see below), so there is nothing to list as an independent arbitrage leg.

## Kind and market model
- Kind: software vendor / white-label platform. [H]
- Claimed engine: in-memory CLOB plus AMM pools for thin markets; hybrid on-chain/off-chain CLOB option; binary, multi-option and scalar markets (truepredictsoftware.com). [H that it is claimed; unverified]
- Trading page: "Fixed-odds event betting on sports, esports, and live events, priced and risk-managed" i.e. possibly house-priced, not peer order book. [H]
- Sweepstakes variant: virtual credits, dual-currency wallets, no-purchase-necessary; not real-money trading. [H]
- Outcome tokenisation: NOT FOUND (searched: all pages above). Each deployment differs.

## Chains and collateral
- "Crypto Prediction Market Platform" option: Web3 wallet connect, multi-chain stablecoin settlement, on-chain settlement. No chain named. [H claimed, unverified]
- NOT FOUND: any deployed contract, chain or token (searched: sites, press releases).

## Read API
- exists: none (public). Vendor says REST, WebSocket and FIX endpoints for market makers, plus an "Aggregated API connecting Polymarket, Kalshi and many more" (headline seen on trueigtech.com; EIN PR 2026-10-14). [H that claimed] These are per-customer/sold-with-software; no public docs URL, no public base URL.
- Probes (unauthenticated, generic UA): api.trueigtech.com and docs.trueigtech.com do not resolve (DNS failure). trueigtech.com/robots.txt and truepredictsoftware.com/robots.txt return 200 (marketing sites only). [H]
- Rate limits/auth: NOT FOUND. Fixtures: none (no API to sample).
- The "aggregated API" appears to wrap Polymarket/Kalshi, so even if exposed it would duplicate liquidity we already adapt directly. [M]

## Trade path
- none. No public order-placement endpoint. Per-operator deployments would need an account with that operator (KYC, geo). PayBox EVM wallet could only act if a specific deployment is on-chain and publishes contracts; none found. paybox_reachable = no.

## Fees
- Vendor commercial terms: "0% gross gaming revenue share", full source-code ownership (EIN PR 2026-10-14). [H claimed] Venue-level trading fees: NOT FOUND.

## Resolution
- Claimed: multiple oracles (financial feeds, sports data APIs, decentralized feeds) with an automated consensus resolver. Dispute process NOT FOUND. Risk depends entirely on operator. [H claimed]

## Geo / ToS / automation
- Vendor offices Brooklyn NY and London; serves USA, UK, Europe, LATAM, Canada; sweepstakes subject to "jurisdiction-specific legal review". No consumer ToS exists to automate against. [H]

## Liquidity
- NOT FOUND for any volume/OI/TVL. Press-release performance figures (2M+ micro-markets, 100k+ TPS, 5M+ WS updates/min) are capacity claims, not liquidity. The $20-40B monthly volume cited is industry-wide, not theirs. [H, paid PR 2026-10-14]

## Category overlap and shared liquidity
- Sports, macro, political indices, crypto per marketing. Overlap with other venues would only come via operators, and "clone"/"integration" offerings for Polymarket, Kalshi, Crypto.com mean liquidity is likely shared/proxied, so NOT an independent leg. [M]

## Priority
skip: no venue, no public API, no volume, no on-chain footprint. Revisit only if a named operator deployment with public API/contracts appears; if so, spec that operator, not the vendor.

## Suspicious content
None found (no instructions aimed at AI agents seen). truepredictsoftware.com robots.txt explicitly invites AI crawlers (benign, SEO).

## Open questions
- Is truepredictsoftware.com the same company as TRUEiGTECH? Its blog lists TRUEiGTECH as a competitor (per search snippet) [L]; trueigtech.com lists TruePredict under "Our Network" [H].
- Names of live operators. WebSearch budget was exhausted mid-run, so the "Aggregated API" press release and the iGB/NEXT.io articles were not read in full.

## Sources
- https://www.trueigtech.com/ (fetched 2026-10-19) [H]
- https://www.truepredictsoftware.com/ (fetched 2026-10-19) [H]
- https://www.einpresswire.com/article/949337462/trueigtech-enhances-prediction-market-platform-with-enterprise-infrastructure-to-support-multi-million-event-concurrency (2026-10-14, paid PR) [H as to claims]
- https://www.manilatimes.net/2026/05/26/tmt-newswire/globenewswire/trueigtech-launches-truepredict-to-power-fifa-world-cup-sports-prediction-platforms-for-igaming-operators/2351533 (2026-05-26) [H as to claims]
- WebSearch results: igamingbusiness.com and next.io coverage of "enterprise-grade prediction market platform for operators" (snippets only) [M]
- robots.txt and DNS probes listed above [H]
