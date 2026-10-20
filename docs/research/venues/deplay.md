# Deplay (deplay.fun) - venue spec

Researched 2026-10-19. Verdict: **skip**. Deplay is not a prediction-market venue. It is a Solana Seeker (Solana Mobile) app studio/publisher with a token ($DEPLAY). The "binary / daily pools" label on Prediction Index appears to describe one of its games (WipeMe), which is a skill-ranked pool, not an event market.

Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness
- https://deplay.fun/ returns HTTP 200; a Lovable-built SPA titled "DEPLAY", description "BUILDING APPS ONLY POSSIBLE ON SOLANA SEEKER". [H]
- Legal pages in the bundle are dated "Last updated: March 7, 2026" (SeekerCloud terms). [H]
- Prediction Index lists Deplay as Live / Solana / Binary / "Daily pools", volume n/a. [H that PI says this; M that it is accurate, see below]

## What Deplay actually is [H, from site bundle https://deplay.fun/assets/index-DLjTOyKx.js]
Nav: Home, SeekerCloud, Platter (platter.trade), Filepool (filepool.me), Token. Routes also include /wipeme, /iceberg, /vector, /recovery, /tokenomics.
- **SeekerCloud**: on-chain data storage app for Seeker devices.
- **Filepool** (filepool.me): "Preserve content on Arweave", file-preservation DeFi. Not a market.
- **WipeMe** (sol.wipeme.fun): cleaning mini-game. "Play free just for fun, or deposit SOL into the daily pool to compete with other players on cleaning accuracy." Rank on a daily leaderboard sets your share of the daily pool, claimable daily; accuracy 92%-100% gives 2x-10x multipliers. This is a skill-game prize pool. It is the likely source of PI's "daily pools". Outcomes are not events, so there is nothing to cross-check against other venues.
- **Platter** (platter.trade, "Beta"): "ETF-like perps on the real economy". Merchant-revenue indices (COFFEE.PLTR, FITAPP.PLTR, AITOOL.PLTR ...), long/short with 2x-50x leverage, priced from verified sales data (Stripe, Shopify, Square). [H, homepage copy] This is a perp/index product. It is not a binary/categorical event market. Homepage figures look like demo data ("Merchants 20, Countries 4, Data sources 4" in the chart panel vs "100+ merchants" in the hero), so treat as unverified. [M]
- **$DEPLAY** token: "powers every product ... deflationary pressure through burns and gating premium access through locking". [H]

## Required fields
- **Kind / market model**: app studio; WipeMe = parimutuel-like daily skill pool; Platter = leveraged index perps. No event contracts, no outcome tokens. [H/M]
- **Chains / collateral**: Solana, SOL deposits (WipeMe). Platter collateral NOT FOUND.
- **Read API**: none documented. NOT FOUND (searched: homepage, JS bundle URL strings, docs/api links in nav; web search budget was exhausted so no wider search was run). The bundle references only a Supabase project backend (app-internal, anon-key protected) and X https://x.com/deplaydotfun. I did not probe the Supabase host. No fixtures saved.
- **Trade path**: none for event markets. WipeMe/Platter are consumer apps (Seeker wallet / web). No programmatic order API found. A PayBox Solana wallet could in principle send a SOL deposit transaction to a WipeMe pool, but there is no documented program/IDL and nothing to arbitrage. PayBox reachable: no (nothing to integrate).
- **Fees**: NOT FOUND.
- **Resolution / dispute**: WipeMe ranks by in-game accuracy (app-determined, centralized). Platter relies on merchant revenue feeds. Neither is an oracle-resolved event market. [M]
- **Geo/ToS/automation**: NOT FOUND for WipeMe/Platter; SeekerCloud ToS forbids reverse-engineering and interference. [H, bundle legal text]
- **Liquidity**: NOT FOUND (PI shows volume n/a, accessed 2026-10-19).
- **Event overlap with other venues**: none (no sports/politics/crypto/macro events).
- **Shared liquidity**: none known; independent but irrelevant.

## Adapter priority: skip
No event markets, no public API, no liquidity data. Revisit only if Platter publishes an index-price API (could be a niche signal, P2 at best).

## Not found
Docs/API/GitHub for Deplay; fee schedule; TVL/volume; Platter collateral and oracle details; any prediction-market product.

## Open questions
- Does Deplay have a separate prediction product beyond WipeMe (PI may be mislabelling)? Check @deplaydotfun on X.
- Does Platter expose a public index price feed?

## Suspicious content
None observed. Nothing in fetched pages was addressed to AI agents.

## Sources
- https://deplay.fun/ and bundle https://deplay.fun/assets/index-DLjTOyKx.js [H]
- https://platter.trade, https://sol.wipeme.fun, https://filepool.me (homepage HTML) [H]
- https://predictionindex.xyz/ecosystem (Deplay entry) [H as a listing, M as truth]
- Web search not performed (session search budget exhausted).
