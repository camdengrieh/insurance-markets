# Senal (senal.io) venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = inferred, L = weak.
Limit: WebSearch budget was exhausted, so no independent third-party coverage was checked. Everything below comes from senal.io itself (page copy, manifest, robots/sitemap, its public JS bundle read as text, never executed) plus one Polymarket public endpoint.

## Verdict

Adapter priority: **skip**. Senal is a retail front-end and router over other venues, not an independent liquidity source.
- It trades Polymarket CLOB flow through its own proxy (builder-code attribution). [M, from bundle + Polymarket builder leaderboard]
- It routes to Predict.fun (already covered elsewhere). [H, manifest + bundle strings]
- Its own "Senal CLOB" on BNB Chain is unproven and there is no public API to read it. [M]
- Kalshi appears only in marketing copy. [H]
- Useful only as a competitive/attribution signal (Polymarket builder volume), not as an arbitrage leg.

## Identity and liveness [H]
- https://senal.io/ serves (HTTP 200, 2026-10-19): title "Senal | AI-Powered Prediction Market Aggregator"; copy "aggregates Kalshi and more. Smart routing, copy trading, real-time signal alerts for World Cup 2026 and beyond."
- Live evidence: Polymarket builder leaderboard row for `senal.io` (see Liquidity). Sitemap says "tens of thousands" of per-event pages. No operator/company named on /about. Launch date NOT FOUND.
- Header links: How it works, Aggregator (/aggregator, /markets), About, Privacy, Terms. No docs, GitHub or API link. Socials in the bundle's JSON-LD: twitter.com/senalmarkets, t.me/senalmarkets [H].

## Kind and market model
- Kind: aggregator / routing front-end with embedded wallets, plus own CLOB on BNB Chain (M). Not a market-maker or oracle.
- Market model: binary $1/$0 shares per page copy [H]; order-book style. Bundle contains Polymarket CTF Exchange EIP-712 Order types (salt, maker, signer, taker, tokenId, makerAmount, takerAmount, expiration, nonce, feeRateBps, side, signatureType) and neg-risk adapter handling, i.e. Polymarket-style ERC-1155 outcome tokens [H that code exists in bundle; M that Senal's own CLOB is a CTF-exchange deployment]. Categorical/scalar: NOT FOUND.
- The UI has three venue switches: `polymarket` (relabelled "Senal" in the UI, collateral USDC, chain Polygon), `senal` (collateral USDT, chain `bsc`), `predictfun` (USDT, BNB) [H: bundle constants `{polymarket:"USDC",senal:"USDT",predictfun:"USDT"}` and `{polymarket:"polygon",senal:"bsc"}`]. An `opinion` key also exists in the code (logo + label) [H], but the UI's own helper treats it as not the default venue.
- Kalshi: appears 3 times in the 8MB bundle, all SEO/marketing strings ("Trade on Senal, Kalshi and more", "Best prices across Senal, Kalshi and top exchanges"). No Kalshi order or API code found by name; DFlow hits were unrelated Privy strings. So **Kalshi execution is unconfirmed (L)**.

## Chains and collateral
- Wallets: Privy embedded wallets / Dynamic (bundle strings, 1000+ Privy hits) [H].
- Polygon (USDC) for Polymarket-routed flow; BNB Chain id 56 (USDT) for Senal CLOB and Predict.fun [H, bundle constants]. Marketing copy says only "connect a wallet, deposit USDC" [H]; manifest says "Settle on-chain in stablecoin" [H].
- Funding via MoonPay / Privy onramp strings present [M].

## Read API
- Official public API: **none**. No docs link; /docs and /api on senal.io return the SPA shell [H]. robots.txt: "We aggressively rate-limit our backend ... Disallow: /api/" [H].
- Backend exists but is private/undocumented: base `https://api.senal.io` (REST, `/v1/...`), `wss://api.senal.io/v1/ws/market`, `https://api.senal.io/v1/proxy/clob` (CLOB proxy), `https://api.senal.io/v1/proxy/bridge` [H, from bundle]. Authenticated by app JWT (bundle decodes token exp). I did NOT call it: undocumented host, robots.txt disallows `/api/`, and it needs login. Treat as NOT a supported integration surface.
- Use underlying venues' own APIs instead (Polymarket, Predict.fun), which are covered elsewhere.
- Rate limits: NOT FOUND (only the robots.txt statement above).

## Trade path
- No programmatic/agent API. Orders are placed in the web app by a logged-in Privy wallet; the Polymarket-routed leg posts signed EIP-712 CTF orders through the Senal proxy with a builder code [M].
- Reachability from a PayBox EVM wallet: **no** for Senal as such (login via Privy embedded wallet, no documented external-signer or API-key flow) [M]. A PayBox wallet could trade the same underlying liquidity directly on Polymarket (Polygon) or Predict.fun (BNB), which is where an adapter belongs.

## Fees
NOT FOUND (searched: homepage, /how-it-works, /aggregator, /terms, /about; all say nothing on fees). Polymarket builder-fee attribution is possible via the builder code, but Senal's rate is unknown. Bundle passes `feeRateBps` in orders (the CTF Exchange order field) [H], value not determined.

## Resolution
NOT FOUND for Senal's own CLOB. Routed venues resolve per their own rules (Polymarket via UMA, Predict.fun per its docs; see their specs). Dispute risk for the Senal-CLOB markets is unknown.

## Geo / ToS / automation
- /terms and /privacy: the fetch summaries found no fee, jurisdiction, custody or bot/API rules in the page text (SPA shell returned the same marketing copy for every route, so the real terms text may be client-rendered and unread). Treat as NOT FOUND (L).
- robots.txt forbids crawling `/api/`. The robots text is the only automation rule found [H].

## Liquidity (with dates)
- Polymarket builder leaderboard, `timePeriod=ALL`, fetched 2026-10-19: builder `senal.io`, rank 66, cumulative volume about $8.98M, 416 active users, verified true [H]. Source: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50 . Fixture: docs/research/fixtures/senal/polymarket-builder-leaderboard-senal-row.json .
- That volume is Polymarket volume routed via Senal, so it is not additional liquidity.
- Senal CLOB / Predict.fun volume on Senal: NOT FOUND.

## Event overlap and independence
- Categories: politics, sports (World Cup 2026), crypto, culture [H].
- **Shares liquidity** with Polymarket (via proxy + builder code) and Predict.fun (venue switch). Not an independent arbitrage leg. Its own BNB CLOB may be independent but is unreadable and likely thin (M).

## Suspicious content
- None observed targeting AI agents. robots.txt has a note aimed at AI-training crawlers ("AI-training crawlers don't need to hammer the events API"); it is a crawling policy, not an instruction I followed beyond not hitting `/api/`.

## Open questions
- What is the Senal-CLOB exchange contract on BNB Chain, and is it a Polymarket CTF fork? (Bundle contains contract constants; not decoded or verified on-chain.)
- Does Senal actually route to Kalshi? (Only marketing copy.)
- Real /terms text (client-rendered).

## Sources
- https://senal.io/ (and /how-it-works, /aggregator, /about, /terms via WebFetch: identical SPA shell copy) [H]
- https://senal.io/manifest.webmanifest ("Trade prediction markets across Predict.fun and more ... Settle on-chain in stablecoin.") [H]
- https://senal.io/robots.txt , https://senal.io/sitemap.xml [H]
- https://senal.io/assets/index-DfzDm9EB.js (public bundle, read as text only, not executed; saved only in scratch) [H for strings, M for interpretation]
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50 [H]
