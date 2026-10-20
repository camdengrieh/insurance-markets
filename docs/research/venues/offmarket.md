# Offmarket (offmarket.fun) - venue spec

Researched 2026-10-19. Verdict: **skip**. The official domain no longer resolves; no docs, API, contracts or repos could be found.

## Summary
- Discovered via Prediction Index ecosystem listing, which still tags it: chain Base, outcome binary, mechanism "amm", status "live", volume "n/a" (H that PI says this: https://predictionindex.xyz/ecosystem, fetched 2026-10-19; the listing is likely a stale scrape, M).
- Listed website https://offmarket.fun/ : DNS lookup returns NXDOMAIN on both 1.1.1.1 and 8.8.8.8; curl "Could not resolve host"; WebFetch "ENOTFOUND offmarket.fun" (H, 2026-10-19). Subdomains www. and app. also NXDOMAIN (H). Domain is not delegated, so it is expired/dropped or deliberately removed. Not live in any usable sense.
- PI logo asset is dated Sept 2025 (cloudinary path v1757687663 = ~2025-09-12) (M), suggesting listing was added ~Sep 2025 and not revisited.
- X account @offmarketfun linked from PI: twitter.com returned 301 and x.com returned HTTP 402 to WebFetch, so account state could not be read (NOT FOUND; do not infer).

## Spec fields (all NOT FOUND unless noted)
- Market model: PI only says binary + AMM on Base (L/M). Outcome tokenisation, collateral: NOT FOUND.
- Read API: NOT FOUND (no docs host resolves). No fixtures saved.
- Trade path: NONE usable. PayBox reachability: unknown/no, since there is no front-end, contract address or API to target.
- Fees, resolution mechanism, geo/ToS/automation rules, liquidity (PI volume "n/a"): NOT FOUND.
- Event categories / shared liquidity: NOT FOUND.

## Searched
- DNS (dig, A and NS) for offmarket.fun, www., app., all NXDOMAIN.
- WebFetch https://offmarket.fun/ (ENOTFOUND); https://x.com/offmarketfun (402, body not retrieved).
- `gh search repos offmarket` and `gh search code "offmarket.fun"`: only unrelated real-estate "off market" repos; no code references to the domain.
- WebSearch (extended) was refused: session search budget exhausted. No web-search corroboration was obtained; no workaround used.

## Suspicious content
None observed. (offmarket.xyz exists and is parked on Spaceship nameservers; unrelated to this venue as far as known, not investigated.)

## Open questions
- Did the project rebrand/move domain? Re-check PI entry or X account later if a search budget is available.

## Sources
- https://predictionindex.xyz/ecosystem (H for listing content; M for freshness)
- DNS queries via dig, 2026-10-19 (H)
