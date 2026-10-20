# Meme Market (mememarket.meme) - venue spec

Researched 2026-10-19. Verdict: **skip**. The only listed domain does not resolve (NXDOMAIN); there is no primary-source evidence of a live venue, docs, API or contracts.

## Liveness
- predictionindex.xyz lists "Meme Market": website https://mememarket.meme/, chains Base/Solana/Ethereum, outcome type binary, mechanism "tbd", topic crypto, status "live", volume n/a, X handle @mememarket_mm. [M - aggregator listing, fetched this session; also in repo fixture docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json (snapshot 2026-10-18)]
- mememarket.meme (and www.) returns NXDOMAIN from Cloudflare 1.1.1.1 and Google 8.8.8.8; the system resolver and WebFetch also fail (ENOTFOUND). The .meme TLD itself is delegated (Charleston Road Registry NS), so the specific domain is simply not registered or has lapsed. [H - dig/curl/WebFetch, 2026-10-19]
- The listing's "live" label is the aggregator's own and is stale or wrong for this entry (same snapshot note says the site lists other dead projects as live). [M]
- https://x.com/mememarket_mm: WebFetch returned HTTP 402, no content readable. [NOT FOUND: account state/last post]
- Similar-named sites are unrelated or unproven: mememarket.io (JS-only shell titled "Meme Market", no readable content), meme.market (JS shell, title only), mememarket.fun (Cloudflare challenge page), meme-market-madness.com (this is MCPM, a different PI entry, Base, waitlist). No evidence any is the same project. [L]
- WebSearch found no product named Meme Market; only two open-source Solana hobby repos about memecoin-price prediction markets (starlingvibes/memecoin-prediction-market, 0xCipherCoder/memecoin_prediction_market). Not verified to be related. [L] A second search was blocked by the session search budget.

## Spec fields
- Kind / market model: NOT FOUND (searched: PI listing, homepage DNS, web search). PI says binary, mechanism tbd. [M]
- Chains / collateral: PI lists Base, Solana, Ethereum; collateral NOT FOUND. [M]
- Read API: none found. No docs, base URLs, subgraph or contracts located. No fixtures saved (nothing to fetch).
- Trade path: none found. PayBox reachability: unknown/no, since no contracts or order API exist to target.
- Fees, resolution mechanism, geo/ToS, liquidity (PI volume "n/a"), category overlap, shared liquidity: NOT FOUND.

## Recommendation
adapter_priority = skip. Revisit only if a working domain/docs/contract address surfaces (e.g. from the X account, which needs a logged-in or paid fetch we did not attempt).

## Sources
- https://predictionindex.xyz/ecosystem (M, fetched 2026-10-19)
- docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json (M, local snapshot)
- DNS: dig @1.1.1.1 / @8.8.8.8 mememarket.meme -> NXDOMAIN (H)
- https://x.com/mememarket_mm (HTTP 402, unread)
- https://mememarket.io/ , https://meme.market/ , https://mememarket.fun/ (probed, unproven relation, L)
- https://github.com/starlingvibes/memecoin-prediction-market , https://github.com/0xCipherCoder/memecoin_prediction_market (search hits only, L)
