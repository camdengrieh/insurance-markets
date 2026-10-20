# Prognoze (prognoze.xyz) - venue spec

Researched 2026-10-19. Verdict: DEAD / abandoned. adapter_priority = skip.

Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness (H)
- https://www.prognoze.xyz/ : TLS handshake fails (curl exit 60, "certificate has expired"). The served cert is Let's Encrypt R13, CN=www.prognoze.xyz, valid 2025-10-21 to 2026-01-19, never renewed. [H, openssl s_client + curl 2026-10-19]
- With cert verification bypassed (read-only HEAD), the host answers HTTP 404, `server: Vercel`, `x-vercel-error: DEPLOYMENT_NOT_FOUND`. The Vercel project/deployment behind the domain has been deleted. [H]
- https://prognoze.xyz/ (apex) also returns 404 DEPLOYMENT_NOT_FOUND. DNS: apex A 76.76.21.21 (Vercel), www CNAME cname.vercel-dns.com. [H]
- docs./app./api.prognoze.xyz: no DNS records. [H]
- GitHub repo search ("prognoze", "prognoze prediction market") and code search for "prognoze.xyz": no relevant repo (only unrelated Croatian/Latvian "prognoze" = weather forecast projects). [H, negative]
- Web search (extended): no hits on prognoze.xyz itself, no docs, no team page, no coverage. A second search could not run (session search budget exhausted); Wayback Machine fetch was blocked/rate-limited (429, WebFetch refused archive.org). [H, negative]
- Conclusion: site is down, no trace of continued operation in 2026. Cert lapsed at Jan 2026 so project was likely abandoned around then. [M]

## What it was (M, only source is the HN launch post)
Source: Show HN 2025-01-07, author "pitahat", 1 point, 0 comments: https://news.ycombinator.com/item?id=42627866 (API: https://hn.algolia.com/api/v1/items/42627866). [H that the post exists and says this; M that the product ever worked as described]
- "Sustainable onchain prediction market platform", up to 10x leverage.
- Model: virtual AMM (vAMM), constant-product curve, "without liquidity providers, market makers or order books". Binary YES/NO shares. Prices path-independent, not anchored to external sources.
- Two stages: Open Trading (leveraged PnL tied to YES/NO share price, can close any time) and Resolution (after outcome "accepted", winners split losers' total collateral; accumulated fees in a "Reward Pool" shared with winners).
- NOT FOUND (searched: HN post, site, GitHub, web search): chain, collateral token, contract addresses, fee schedule, oracle/resolver, docs, API, SDK, TVL/volume.

## Adapter spec fields
- kind: onchain vAMM leveraged binary prediction market (defunct). Market model: binary YES/NO, vAMM (not order book, not parimutuel at resolution-stage payout). Tokenisation: unknown. NOT FOUND.
- Chains/collateral: NOT FOUND.
- Read API: none found. No docs, no endpoints, no subgraph. exists = none.
- Trade path: none (site down, no contracts known). PayBox reachability: no.
- Fees: NOT FOUND (only "fees accumulate in a Reward Pool").
- Resolution: NOT FOUND ("outcome is accepted" only; mechanism and dispute process unknown).
- Geo/ToS/automation: NOT FOUND (no ToS reachable).
- Liquidity: NOT FOUND; no volume/TVL source exists. Treat as zero.
- Category overlap/arbitrage: none practical. Leveraged vAMM prices are explicitly unanchored to outside sources, so even if revived, the quotes would be poor arbitrage legs and leverage liquidation risk breaks hold-to-resolution arb.
- Shared liquidity: none known (vAMM, no LPs).
- Fixtures: none saved (no API).

## Recommendation
Skip. Do not build an adapter. Optional: re-check prognoze.xyz in a future discovery sweep (cheap: one curl) in case it is relaunched under a new deployment.

## Sources
1. https://www.prognoze.xyz/ and https://prognoze.xyz/ - curl probes 2026-10-19 [H]
2. https://news.ycombinator.com/item?id=42627866 via https://hn.algolia.com/api/v1/items/42627866 [H]
3. https://hn.algolia.com/api/v1/search?query=prognoze&restrictSearchableAttributes=title [H]
4. https://hn.algolia.com/api/v1/items/45956930 (unrelated 2025-11 HN question about leveraged perp-style prediction markets, does not mention Prognoze) [H, not relevant]
5. gh search repos/code (negative results) [H]

## Suspicious content
None observed. (The first HN search returned an unrelated "Daemons" product post; ignored.)
