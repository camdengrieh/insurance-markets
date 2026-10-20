# OkayBet (okaybet.app) - venue spec

Researched 2026-10-19. Verdict: adapter_priority = skip. It is a thin Polymarket trading front-end (builder-code frontend with an Across/Hyperlane bridge from Optimism), not a venue. Liquidity is 100% Polymarket's, so it is not an independent arbitrage leg and has no API of its own.

## Is it live?
- https://www.okaybet.app/ returns HTTP 200 on 2026-10-19; title "Okay Bet"; page body is only "Cross-chain trading / Trade / Bridge / Connect Wallet / Loading application..." (client-rendered Next.js shell). [H] https://www.okaybet.app/
- Meta description: "Trade prediction markets on Polymarket with seamless cross-chain USDC liquidity from Optimism." og:site_name "Polymarket Trading"; og:url still points at the Vercel preview `optimism-polymarket-nextjs.vercel.app` (template/scaffold leftover). [H] same page
- It is "live" as a static app but looks like an early/hobby project; no docs, terms, about, blog, or robots.txt (404s on /robots.txt, /terms, /api/markets). [H]
- Not found on the predictionindex.xyz ecosystem page by WebFetch (page was truncated, so not conclusive). [L] https://predictionindex.xyz/ecosystem

## Kind and market model
- Kind: front-end / trading UI over Polymarket (CLOB), plus a bridge UI. Not an aggregator across venues despite the discovery hint. [H for Polymarket-only, from bundle code below]
- Market model: inherited from Polymarket: binary (and multi-outcome as neg-risk events) YES/NO conditional tokens (ERC-1155 on Gnosis CTF), central limit order book. [M, general Polymarket knowledge; the OkayBet bundle only confirms it calls the Polymarket CLOB]
- Evidence from the shipped JS bundle (fetched from the public site, read as data only): `gamma-api.polymarket.com`, `clob.polymarket.com`, `relayer-v2.polymarket.com`, default `NEXT_PUBLIC_POLYMARKET_CHAIN_ID` 137 (Polygon), a `PolymarketClobClient` that derives/creates CLOB API creds from the user's signer with a `funderAddress` and `signatureType` (proxy/safe wallet pattern), and a `builderConfig` pointing to a remote builder-signing server (`builder-signing-server-production.up.railway.app/sign`) (Polymarket Builder Program order attribution). [H] https://www.okaybet.app/_next/static/ chunks (20 chunks fetched; two relevant)
- Bridge config lists Across (`app.across.to/api`) and Hyperlane (`api.hyperlane.xyz`) with default slippage 50 bps, max 500, min 10. [H] same bundle

## Chains and collateral
- Trading settles on Polygon (137) in USDC (Polymarket collateral). Cross-chain deposit UI funds from Optimism via Across/Hyperlane. [H bundle / M for collateral token]

## Read API
- exists: none (OkayBet has no API; no /api routes found, /api/markets is 404). [H]
- Read data comes from Polymarket's public APIs, which the adapter for Polymarket already covers (covered by the parallel workflow, not repeated here).
- No fixtures saved: nothing OkayBet-specific to sample.

## Trade path
- None of its own. Anything OkayBet does is Polymarket CLOB orders signed by the user's wallet (EIP-712) with Polymarket API creds and a builder attribution header. Trading via the Polymarket adapter directly is strictly better (no extra builder-signing dependency on a third-party Railway server). [M]
- PayBox reachability: n/a. An EVM wallet on Polygon could trade Polymarket directly (covered elsewhere); OkayBet adds nothing. Using the OkayBet UI would require connecting a wallet to a third-party site and trusting its builder-signing server: not recommended.

## Fees
- NOT FOUND on the site (searched: homepage, /terms, /robots.txt). Any fee would be a builder fee/attribution on top of Polymarket's fees; the builder-signing endpoint suggests builder-code revenue share. [L]

## Resolution
- Resolved by Polymarket's mechanism (UMA optimistic oracle), not by OkayBet. Dispute risk is Polymarket's. [M]

## Geo / ToS / automation
- NOT FOUND (searched: homepage, /terms). Inherits Polymarket geo restrictions. [L]

## Liquidity
- NOT FOUND for OkayBet itself; no volume metrics published. Underlying liquidity is Polymarket's (not independent). [H that no stats exist on site]

## Event overlap / shared liquidity
- Shares 100% liquidity with Polymarket (global). Not an independent arbitrage leg.

## Priority
- skip: duplicate liquidity, no API, no docs, scaffold-quality site. Revisit only if it adds its own order flow or cross-venue routing, which nothing observed suggests.

## Suspicious content
- None found. (Bundle contains a hard-coded remote builder-signing URL; noted as a trust dependency, not as an instruction.)

## Sources
- https://www.okaybet.app/ (H)
- https://www.okaybet.app/_next/static/ JS chunks referenced from the homepage (H)
- https://predictionindex.xyz/ecosystem (L, entry not visible in fetched excerpt)
- WebSearch was unavailable (session budget exhausted), so no third-party corroboration of liveness/volume.

## Not found
- Docs, terms, fee schedule, volume/TVL, official repo, X/Discord, contract addresses of its own.
