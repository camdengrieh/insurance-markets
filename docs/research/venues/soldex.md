# Soldex (soldex.fi) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
Adapter priority: **skip** (re-check in ~3 months). Only a marketing landing page and a hackathon-stage repo are verifiable. There is no public API, no docs page that loads, and the app host does not resolve in DNS. It is a router over venues the project already covers, so it is never an independent arbitrage leg. A competitor to watch, not an integration target.

## Is it live?
- soldex.fi serves a Next.js landing page (HTTP 200). Footer: "Launch 2026 v0.1 beta, Mainnet Public", "Soldex under Gorlabs", copyright 2026, contact address hello@soldex.fi. [H] https://soldex.fi/
- Nav chip says "router live" and the site claims "$128M+ routed volume", "5 venues", "6 categories", "2,400+ smart wallets tracked". All of these are self-reported marketing, unverifiable. [H that the site says it; L as fact]
- `app.soldex.fi` (every CTA: terminal, docs, docs/api, bots, connect) did NOT resolve (`dig +short app.soldex.fi` empty; curl error 6) on 2026-10-19. So the terminal and the "public router API" docs were unreachable from here. [H] This could be a local resolver issue; retry from another network before treating it as dead.
- `soldex.fi/docs`, `/llms.txt` return 404. `/robots.txt` allows `*`. [H]
- Name collision: soldex.ai / SOLX token is an unrelated older Solana DEX. Do not confuse. [M] (WebSearch results)

## Kind and market model
- kind: cross-venue router / terminal plus an "IQ" integrity scorer, with its own "native" Solana markets. [H, claims]
- Routes to Polymarket, Kalshi, Jupiter Predict, Hyperliquid HIP-4 and "Soldex Native". [H] https://soldex.fi/
- Router scoring: price, depth at size, fee, settlement latency; splits across venues when one book cannot fill. [H, claim from FAQ JSON-LD]
- Native markets: "launch a question on Solana, choose the resolution source and settlement date, creator earns a share of fees". Model (binary vs categorical, book vs AMM) NOT FOUND (searched: landing page, FAQ, repo). Demo shows YES/NO binary with limit/market/GTC orders. [H claim, L detail]
- The landing's market list (Fed cut, BTC > $150k, shutdown before Mar 31 2026), fake trader table and X posts look like illustrative mock data. Treat any numbers on the page as non-evidential. [M]

## Chains and collateral
- Solana wallet, USDC shown as the order currency ("$100 USDC"). [H] Native markets "settle on Solana". "Connect one Solana wallet... external books reachable from the same balance." [H claim] How Polymarket (Polygon) or Kalshi (CFTC, fiat) fills happen from a Solana balance is NOT FOUND (presumably custodial "venue plumbing": FAQ says "Soldex holds the venue plumbing"). [H quote, M inference]

## Read API
- exists: **none** verifiable. Site mentions a "Public router API: one REST call, best execution across every connected venue" at app.soldex.fi/docs/api, unreachable. [H that it is claimed]
- Base URLs, endpoints, auth, limits, websocket: NOT FOUND (searched: soldex.fi landing, /docs, /llms.txt, app/api/docs subdomains via DNS, GitHub, web search).
- Related repo (founder's, not confirmed as the production code): github.com/gauravmandall/soldex, "colosseum fronteir hackathon", created 2026-04-09, last push 2026-05-11, no license, 0 stars. README describes a **privacy-first perps DEX on Solana** with a Rust engine (Axum WS on localhost:9000), an Anchor program `soldex-perps`, a TS SDK, and Polymarket CLOB and Jupiter prediction "opportunity discovery" modules. Not a router and no cross-venue router code or public API. Stale vs the current landing claims. [H] https://github.com/gauravmandall/soldex
- Search found no independent coverage, no third-party volume data, no DefiLlama or Dune listing. [M]

## Trade path
- Via Soldex: Solana wallet connect in the terminal UI (browser). Programmatic order API: NOT FOUND. Bots described as "delegated, revocable permissions scoped to the markets you choose", scheme undocumented. [H claim]
- PayBox reachability: **no**. Even though PayBox has Solana wallets, there is no documented endpoint, signing scheme or program address to build a transaction proposal against. Do not integrate through the UI.
- For the project's purposes, go direct to the underlying venues instead (Polymarket, Kalshi, Jupiter Predict, Hyperliquid), which are covered elsewhere or are separate candidates.

## Fees
- "A flat routing fee on filled volume. No subscription, no maker fee on Soldex-native markets; external venue fees are shown inside the quote." Flat amount or bps NOT FOUND. Demo ticket shows "0 bps, $0.20" on $100, illustrative only. [H quote, L value]

## Resolution
- Routed venues resolve per their own rules. Native markets: creator chooses the resolution source; oracle/dispute mechanism NOT FOUND. The "IQ" score (0-100; <50 flagged and hidden by default) includes creator concentration, insider/wash-trade, wording ambiguity and resolution reliability. Methodology unpublished. [H claim]
- Dispute risk for native markets: high/unknown (creator-chosen sources, no documented oracle). [M]

## Geo / ToS / automation
- No ToS, privacy policy or geo statement found on the landing page. NOT FOUND (searched: soldex.fi footer and nav). Routing into Kalshi and Polymarket US-restriction regimes is undocumented. Hyperliquid HIP-4 restricts US users per press. [M]
- Cloudflare managed robots content blocks some AI crawlers; `*` allowed. Respect; no scraping done. [H]

## Liquidity
- Claimed "$128M+ routed volume" (undated, landing page read 2026-10-19), "$1.2M liquidity" on a demo market. Unverified. [L] No independent TVL/OI/volume source. Native-market liquidity: NOT FOUND, presumed negligible.

## Event categories and overlap
- Landing claims 6 categories; shows economics, crypto, politics. Everything overlaps the routed venues (Fed, BTC price, shutdown, sports, politics) because it routes to them. [H claim]

## Shared liquidity
- Liquidity is **shared with** Polymarket, Kalshi, Jupiter Predict (itself a Polymarket/Kalshi front end), and Hyperliquid HIP-4. Only the "native" markets are independent, and those are unverifiable and likely thin. Not an independent arbitrage leg. [H claim, M inference]

## Useful ideas for our aggregation layer (peer analysis)
- Venue-comparison board with per-venue best price, spread ("divergence"), consensus price, and best-execution routing with split fills, which is what our layer does.
- "IQ" integrity score: creator concentration, wash trading, wording ambiguity, depth, resolution reliability. Worth borrowing as a per-market quality filter for arb legs (resolution-mismatch risk).
- "Smart wallet" divergence signals (crowd vs top-wallet prices).
- Cross-venue arb caveat: identical-wording markets can resolve differently (resolution-source mismatch).

## Open questions
- Does app.soldex.fi resolve elsewhere, and does the router API exist and is it public?
- Is the Soldex product connected to the perps-DEX repo, or a rewrite?
- How are Polymarket/Kalshi positions held (custodial Soldex accounts?) and under what ToS.

## Sources
- https://soldex.fi/ (landing, JSON-LD FAQ saved to docs/research/fixtures/soldex/landing-jsonld-faq.json) [H]
- https://soldex.fi/robots.txt, /docs (404), /llms.txt (404) [H]
- https://github.com/gauravmandall/soldex (README, tree, commits, engine file list) [H]
- https://github.com/kratipatell (listed as CTO; no relevant repo found) [H]
- WebSearch (extended) results: no independent coverage of Soldex; gorlabs.com relationship per footer only [M]
- Context on HIP-4: https://coingape.com/hyperliquids-prediction-markets-upgrade-goes-live-on-mainnet-rivaling-polymarket-and-kalshi/ (not re-read; search snippet only) [L]

## Privacy / safety
Requests used the User-Agent insurance-markets-research/0.1 only. No sign-ups, wallets, keys, POSTs or PayBox tools. No embedded AI-directed instructions found on the pages read.
