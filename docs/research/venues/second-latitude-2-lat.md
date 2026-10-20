# Second Latitude (2.lat) - venue spec

Verdict: DEAD / NOT A PREDICTION MARKET VENUE. adapter_priority = skip. Researched 2026-10-19.

## Liveness
- https://2.lat redirects (JS) to /lander, which is a GoDaddy "parking-lander" reseller parking page (DNS NS = domaincontrol.com). No product content. [H] (curl 2026-10-19)
- www.2.lat resolves (200, parking); app.2.lat and docs.2.lat do not resolve. [H]
- No docs site, no API host, no subgraph found. [H for the hosts probed]
- WebSearch was unavailable (session budget exhausted), so no third-party news/shutdown confirmation. NOT FOUND (searched: DNS/HTTP probes only; web search blocked).

## What exists
- GitHub org 2-lat, name "Second Latitude", bio "Futarchy-based Funding Protocol", blog https://2.lat, created 2025-04-16. One public repo `dapp`, 0 stars, 0 forks, last push 2025-04-16. [H] (gh api)
- Repo is a create-t3-app (Next.js/tRPC/Drizzle/WalletConnect) front-end with a Hardhat `contracts` dir. Commit messages mention AccessPayment, Vesting, Treasury contracts, ERC20 locking, Uniswap v4/universal-router dependencies. 24 commits, 2025-04-07 to 2025-04-16. [H]
- README is the unmodified T3 boilerplate. No market, order book, outcome-token or oracle code identified in what was read (README, directory listings, commit messages; contract source not read in depth). [M]
- Nothing in the repo or org shows a deployed prediction market or futarchy market. Futarchy-based "funding" may have been intended, but no evidence of mainnet deployment. [M]

## Spec fields
- Kind / market model: none confirmed. Intended futarchy (conditional markets, MetaDAO-style) is unverified; no evidence of binary/categorical/scalar markets. 
- Chains / collateral: NOT FOUND (no deployed addresses found; did not read .env files by rule).
- Read API: none (exists = none). No docs, no base URLs.
- Trade path: none. Not reachable via PayBox.
- Fees: NOT FOUND.
- Resolution: NOT FOUND (futarchy decision markets would resolve by governance outcome/TWAP, unverified).
- Geo/ToS/automation: NOT FOUND (no site).
- Liquidity: none known; no TVL/volume source. 
- Event-category overlap with other venues: none (governance/funding decisions only, not sports/politics/crypto price/macro).
- Shared liquidity: n/a.

## Recommendation
Skip. Revisit only if a live app/docs domain appears. For futarchy signal, MetaDAO is the relevant venue (separate task).

## Open questions
- Was there ever a deployed product (maybe under a different domain)? Domain now parked suggests project abandoned or domain lapsed.

## Sources
- https://2.lat (and /lander) - parked page, fetched 2026-10-19 [H]
- https://github.com/2-lat and https://github.com/2-lat/dapp (via gh api: repo metadata, commits, README, directory listing) [H]
- No fixtures saved (no API exists).
