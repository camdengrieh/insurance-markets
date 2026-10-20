# Noa Sight (NoaSight) - venue spec

Researched 2026-10-19. Verdict: **skip**. Testnet-only, no usable API, TLS endpoints broken, trivial volume, Sui (not reachable via an EVM PayBox wallet).

Confidence tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Summary

- NoaSight is a small binary YES/NO prediction market on **Sui TESTNET** (H: docs bundle, FAQ: "Currently, NoaSight operates on SUI testnet for testing and development"). Mainnet launch was roadmapped for "Q2 2026" and marked "planned" in the docs build of 2025-10-25. No evidence found that mainnet launched. (H for roadmap text; mainnet status NOT FOUND.)
- Testnet tokens "have no real value" (H, docs Getting Started bundle). There is nothing to arbitrage against real-money venues.
- The official hosts currently fail TLS (see Liveness). I could not load the live app, docs or any API.
- Brand confusion: docs/app bundles also say "SuiSight" (twitter.com/SuiSight, www.suisight.xyz in the landing bundle). www.suisight.xyz does not resolve (DNS error today). (H)

## Liveness (2026-10-19)

- noasight.xyz, www.noasight.xyz, sui.noasight.xyz, docs.noasight.xyz, oraclesui.noasight.xyz, snapshot.noasight.xyz, analytics.noasight.xyz all resolve to 2.57.91.92. A TLS handshake to every one fails with `tlsv1 alert internal error` (curl/LibreSSL and `openssl s_client` TLS1.3: "no peer certificate available"). WebFetch fails the same way. (H, own probes today)
- The old landing mirror `https://noa.hanggaa.xyz` (CNAME of AXHP-Labs/landing-noasight) returns HTTP 200 via Cloudflare today. (H)
- GitHub org AXHP-Labs holds built-only GitHub Pages repos (branch gh-pages; no source, no Move contracts): sui-noasight (last push 2025-12-12), docs-noasight (2025-10-30), oraclesui-noasight (2025-12-12), adminsui-noasight (2025-10-06), landing-noasight (last push 2026-09-11, a "Create CNAME"/"Updates" commit, i.e. a domain move). (H, gh api)
- predictionindex.xyz/ecosystem lists: status live, chain Sui, binary, volume n/a, links www.noasight.xyz and x.com/NoaSight. The listing does not verify liveness. (H for the listing; M that it is stale)
- Twitter/X profile could not be read (HTTP 402 from x.com via WebFetch; recorded, stopped).
- WebSearch was unavailable (session search budget exhausted), so no independent 2026 news/volume corroboration. Not searched is not the same as not existing.

## Market model

- Binary YES/NO only (M: docs mention YES/NO; categories "cryptocurrency, politics, sports, technology"). Categorical/scalar: NOT FOUND.
- Pool-based AMM-like pricing: docs "Share Calculation Formula": `YES shares = amount x total_pool / pool_yes`, `NO shares = amount x total_pool / pool_no`; "Price dynamically adjusts based on pool ratios". (H, docs bundle) This is closer to a parimutuel pool with dynamic odds than a constant-product AMM. Winners get a proportional share of the prize pool.
- Docs also list "Limit Order" with 0% fee + 0.005 SUI execution fee (refundable on cancel). How limit orders are matched is NOT FOUND (no order-book description).
- Outcomes are not fungible tokens; positions plus a "WinningBadgeNFT" minted to winners and a profile NFT (H docs). No tradeable outcome token found.
- Contracts named in docs: market contract with DAO integration, `oracle.move`. (H) Source code NOT FOUND (searched: AXHP-Labs repos, gh search for "noasight").

## Chain and collateral

- Sui testnet, RPC https://fullnode.testnet.sui.io:443, explorer testnet.suivision.xyz (H docs). Collateral: native SUI (H docs "Native SUI token usage"; min bets/stakes denominated in SUI).
- The app bundle contains 5 hex object/package IDs (testnet, unverified, not independently checked on-chain because Sui JSON-RPC is POST-only and the brief forbids POST). Not recorded here as they are not needed.

## Read API

- **None official.** Docs Developer Resources (H): "decentralized application without traditional APIs. All data is read directly from the blockchain." Planned (not shipped): `/api/v1/markets`, `/api/v1/prices`, `/api/v1/analytics`, "API v1.0 Release" planned Q2 2026, JS/Python/Go SDK planned Q1 2026. No evidence these shipped.
- Only integration route would be Sui RPC/GraphQL reads of testnet objects and events. Not worth it.
- Landing stats JSON (public GET, works via the hanggaa mirror): `https://noa.hanggaa.xyz/data/landing.json`; the main landing references `https://snapshot.noasight.xyz/data/landing.json` (unreachable, TLS). Fixture saved: `docs/research/fixtures/noa-sight/landing.json`. Snapshot timestamp 1760086791791 = 2025-10-10 (stale, 12 months). Values appear to be in MIST (1e-9 SUI) (M, inferred):
  - total_trading_volume 3,159,469,616,362 (about 3,159 testnet SUI), markets_created 55, active_traders 66, predictions_made 1903, volume_24h 31,704,600,000 (about 31.7 SUI), oracle_requests_total 38 / resolved 34, active_oracles 5.
- Auth/rate limits/websocket: NOT FOUND.

## Trade path

- Wallet-signed Sui transactions (Sui Wallet/Slush) calling the Move market contract on testnet (H docs). No order API, no off-chain signed orders. Programmatic trading would require building Sui PTBs against unverified testnet contracts. Not viable and pointless (no real value).

## PayBox reachability

- **no.** Sui is not an EVM chain; the listed PayBox chains (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) do not include Sui, and the venue is testnet only. (M: PayBox chain list is from the task text; I did not call PayBox tools.)

## Fees (H, docs bundle)

- Market buy 0.3% (0.24% platform + 0.06% LP); market sell 0.1% (0.04% platform + 0.06% LP); limit order 0% + 0.005 SUI execution fee. Paid by trader.
- Other docs pages contradict each other: "Admin fee 0.4% per bet, Oracle reward 1% from losing pool, DAO proposal reward 0.3%" vs contract summary "Oracle: 3.4%, DAO: 0.3%". Docs are internally inconsistent (L reliability).

## Resolution and dispute risk

- Optimistic reporter model (H docs): admin sets market status NEED_RESOLUTION; any reporter stakes 20 SUI and submits outcome; 24-hour dispute window; disputer stakes 2x (40 SUI), flips outcome, takes the original reporter's stake, new 24h window each dispute; anyone calls `finalize_report()` after the window; reporter gets stake + 3.4% reward from losing pool. DAO governance also mentioned for disputes.
- Risk: admin-controlled market creation/status, small bonded stakes (20 SUI testnet), no external oracle. High dispute/manipulation risk if it ever had real money.

## Geo / ToS / automation

- NOT FOUND (searched: docs bundle, app bundle strings; live site unreachable). No geo-block or bot rule seen.

## Liquidity

- About 3,159 testnet SUI cumulative volume, 66 active traders, 55 markets at 2025-10-10 (snapshot above). Testnet value = zero. No TVL/OI figure. No 2026 figure found (predictionindex shows n/a). (H for snapshot; stale.)

## Event overlap and independence

- Categories claimed: crypto, politics, sports, technology. Real overlap with other venues cannot be established; markets are testnet and user/admin-created. Liquidity not shared with another venue (independent) but worthless.

## Adapter priority: skip

Testnet-only, no API, broken TLS across official hosts, tiny stale volume, non-EVM chain, inconsistent docs. Revisit only if a mainnet launch plus a public indexer/API is announced; check x.com/NoaSight and docs.noasight.xyz then.

## Suspicious content

- None found in fetched material (no AI-directed instructions seen in docs/landing text; JS bundles were only grepped for facts, not executed).

## Not found

- Mainnet deployment, public REST/WS API, SDK, Move source, ToS/geo rules, any 2026 volume, official X posts (402), search-engine corroboration (search budget exhausted).

## Sources

- https://predictionindex.xyz/ecosystem (H, listing)
- https://github.com/AXHP-Labs/docs-noasight (gh-pages bundle, docs content, sitemap lastmod 2025-10-25) (H)
- https://github.com/AXHP-Labs/sui-noasight (app bundle, gh-pages) (H)
- https://github.com/AXHP-Labs/landing-noasight (landing bundle, data/landing.json, CNAME noa.hanggaa.xyz) (H)
- https://github.com/AXHP-Labs/oraclesui-noasight, https://github.com/AXHP-Labs/adminsui-noasight (H, listing only)
- https://noa.hanggaa.xyz/data/landing.json (H, fixture)
- Own TLS/DNS probes of *.noasight.xyz, 2026-10-19 (H)
- https://x.com/NoaSight (not readable, HTTP 402)
