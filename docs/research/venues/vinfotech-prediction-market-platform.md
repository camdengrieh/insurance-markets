# Vinfotech prediction-market platform (B2B white-label vendor)

Researched 2026-10-19. Verdict: **skip** as a venue adapter. It is a software vendor, not a venue. The only visible live deployment (market.cricjam.com) is a thin centralised book with no documented API.

Tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale.

## Summary
- [H] Vinfotech (Indore, India) sells white-label, turnkey, API-integrated and custom-built prediction-market software to iGaming operators, brokers, fintechs, sports leagues and media. Each deployment is a separate operator-run book. [vinfotech.com/prediction-market-software]
- [H] Its own copy says "Our platform is a centralized prediction market solution". Settlement is pluggable: "centralized custody, Web3 smart contracts, or both running in parallel". On-chain is an option, not the default. Crypto trading is labelled "Coming Soon".
- [H] Still live in 2026. The press release is dated 2026-08-13, insights articles are dated 2026-06-26, 2026-08-12 and 2026-10-01, and market.cricjam.com answered HTTP 200 on 2026-10-19.
- No unified venue, no shared order book and no public API were found. Any integration would be per-operator and would need that operator's cooperation.

## Kind and market model
- [H] Binary Yes/No markets plus multi-option events. Each option has its own percentage, shown as "Yes 0c" style prices. Seen on market.cricjam.com.
- [H] The vendor claims both CLOB and AMM. The AMM quotes both sides at listing and steps back as organic depth builds. Exposure caps and throttles are set from an admin panel. [press release; prediction-market-software]
- [H] The press release says users trade against each other on an order book. In a sportsbook configuration the operator is the counterparty.
- Outcome tokenisation: NOT FOUND (searched: vinfotech.com product pages, press release, cricjam HTML). Presumably database rows, not tokens, in the centralised default [L].
- [H] Marketing sub-modules: V-SPREx (AI engine that creates, prices and resolves sports markets), AI Market Creator and Resolver, a "Polymarket import panel" ("External Market Import & Curation"), free-to-play tournaments, and optional FIX for institutional partners.
- [H] The Polymarket import panel pulls external markets into an operator's book. Whether orders are mirrored or routed to Polymarket is NOT stated. Any such operator book would not be an independent leg.

## Chains and collateral
- [H] The press release names no chain or crypto.
- [H] The "Polymarket-like" configuration page lists USDC/stablecoin wallets, on-chain or hybrid settlement and oracle resolution with dispute windows. The core wallet is "Fiat + stablecoin" rails. These are config options, not a deployed venue.
- [H] The cricjam HTML mentions only a `usdt_converted_hint_deposit` string (a USDT conversion hint) and a pending-verification withdrawals notice. Its prices are in `$`. There is no wallet connect and no chain was found.
- Contract addresses: NOT FOUND (searched: vinfotech.com, cricjam HTML).

## Read API
- Official public API: none found. Vinfotech claims "Full REST and WebSocket APIs for trading, market data, and admin control" (H, marketing only). This is a product feature sold to operators, not a public endpoint.
- [H] vinfotech.com/docs/prediction-market is only a knowledge-base index of operator FAQ articles. It has no endpoints, auth or base URLs.
- [H] The cricjam front end (Next.js) preconnects to `https://mapi.cricjam.com:8000`. This is an undocumented backend host. I did NOT probe it, because it is not a documented API host and no terms permit scripted access. Endpoints, auth and rate limits are NOT FOUND.
- Websocket: claimed in marketing, URL NOT FOUND.
- OpenAPI/GraphQL/subgraph: NOT FOUND (searched: vinfotech.com, docs index, cricjam HTML).

## Trade path
- [H] The vendor claims full-parity trading APIs for operators.
- For an outside aggregator there is none: no documented order endpoint, no signing scheme, no API keys.
- Trading on cricjam needs a KYC'd account with fiat or stablecoin deposit rails (H: "Your account verification is pending. Withdrawals can be processed once account is verified"). That is not an agent-automatable path.

## PayBox reachability
- **no.** Centralised custody and account login, with no on-chain order flow, no EIP-712 orders and no contract for transaction proposals. A hybrid on-chain config exists only as a product option, and no live instance was found.

## Fees
- [H] Operator earns transaction fees on a prediction market (versus margin on a sportsbook). Fee models are configurable and no rates are published. [press release; insights article]
- Cricjam's fee schedule: NOT FOUND.

## Resolution
- [H] AI Market Resolver validates outcomes against configured sources and escalates conflicts to a human reviewer. Operators can manually override, and an audit trail of disputes is kept.
- Dispute risk is high for an aggregator: there is a single operator authority, there are manual overrides, and there is no on-chain proof. Resolution rules are per-operator.

## Geo / ToS / automation
- [H] The release says imported markets are filtered by operator rules for licence and jurisdiction, and offers free-to-play where real money is restricted. No licences or regulators are named.
- Cricjam ToS: NOT FOUND (no terms link appeared in the fetched content). Treat automation as unauthorised until a ToS is read.

## Liquidity
- [H] Cricjam homepage on 2026-10-19 showed per-market volumes of about $5.1k, $5.5k and $16.8k (Emmys and India Oscar-submission markets) and $47 (a Bitcoin market). The figures are unlabelled (currency "$", possibly play or real). Markets end 2026-12-30 and 2027-12-31.
- [M] No aggregate volume, OI or TVL is published. The press-release claim (H2 Gambling Capital, 27% of US legal sportsbook volume in the 2026 World Cup) is about the sector, not Vinfotech.
- Verdict: thin, and the AMM seeds the book.

## Event overlap (arbitrage)
- Cricjam lists entertainment awards (Emmys, Oscars) and one crypto price market, which overlap Polymarket and Kalshi in theory. Tiny volume and no API make this unexploitable. Sports are the vendor's main focus (V-SPREx).
- Any imported-Polymarket markets are derivative of Polymarket and not independent.

## Adapter priority: skip
It is not a venue. No public API and no independent liquidity are documented, and the one demo deployment is thin and centralised. Revisit only if a specific Vinfotech operator exposes a documented API or on-chain settlement. For discovery, a census note "B2B vendor; per-operator books" is enough.

## Fixtures
None saved. No public API was confirmed. The only candidate backend (mapi.cricjam.com:8000) is undocumented and was not probed.

## Open questions
- What is behind `mapi.cricjam.com:8000`, and is it a terms-permitted public read API?
- Are there other live Vinfotech operators (the site names no customers)?
- Is the "Web3 smart contracts" settlement deployed anywhere?
- Does the Polymarket import panel mirror or route orders to Polymarket?

## Suspicious content
None found in fetched pages (no instructions aimed at AI agents).

## Not found
Public API docs, OpenAPI, websocket URL, token or contract addresses, fee schedule, cricjam ToS, aggregate volume or TVL, named customers. WebSearch was unavailable (session budget exhausted), so no third-party corroboration was obtained, and everything is from vendor-controlled sources.

## Sources (all fetched 2026-10-19)
- https://www.vinfotech.com/ (H, site index of prediction-market pages)
- https://www.vinfotech.com/prediction-market-software (H)
- https://www.vinfotech.com/white-label-prediction-market-platform-provider (H)
- https://www.vinfotech.com/docs/prediction-market (H, KB index only)
- https://www.vinfotech.com/insights/how-to-launch-a-prediction-market (H, dated 2026-08-12)
- https://www.einpresswire.com/article/933842640/vinfotech-launches-white-label-prediction-market-platform-for-igaming-operators (H, vendor press release, 2026-08-13)
- https://market.cricjam.com/ (H, demo deployment; HTML inspected, API host not probed)
