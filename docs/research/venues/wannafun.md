# Wannafun (app.wanna.fun) - venue spec

Date: 2026-10-19. Verdict: **skip** - the domain does not resolve; no official docs, API or contracts found.

## Findings
- Liveness: `app.wanna.fun`, `wanna.fun`, `www.wanna.fun`, `docs.wanna.fun`, `api.wanna.fun` all fail DNS (curl exit 6; WebFetch ENOTFOUND). `dig wanna.fun NS` returns status NXDOMAIN, i.e. the apex domain is not delegated (expired/dropped/never renewed). Venue is effectively dead or moved to an unknown domain. (H, local DNS checks 2026-10-19; a resolver quirk is unlikely given NXDOMAIN on the apex and that the `.fun` TLD servers answer.)
- Prediction Index (PI) still lists it: chain Ethereum, outcomeTypes binary+categorical, mechanism "tbd", topics gaming+sports, status "live", volume "n/a", X handle @wannadotfun, logo uploaded ~Aug 2025 (cloudinary timestamp 1756470610 = 2025-08-29). (H that PI says this; M/L that it is accurate - PI's own labels are stale elsewhere, e.g. lists Dome as live.) Source: https://predictionindex.xyz/ecosystem ; snapshot fixture docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json.
- Market model, collateral, fees, resolution, geo/ToS, liquidity: NOT FOUND (searched: PI listing, DNS for 5 hostnames, GitHub repo search "wannafun" and "wanna.fun" - only unrelated hits; X profile fetch returned HTTP 402 so was not read). WebSearch could not be used: session search budget exhausted, so no independent 2026 news confirmation.
- Sole inference: PI lists "Ethereum", binary/categorical, gaming/sports topics, so it may have been a small pari-mutuel/AMM style market app; nothing verified (L).

## Adapter implications
- Read API: none found. Trade path: none. PayBox reachable: unknown/no (no contracts or endpoints identified). Not an arbitrage leg: no verified liquidity, no shared-liquidity info.
- Revisit only if a working domain, docs or verified contract addresses surface (check @wannadotfun on X, or PI entry update).

## Sources
- https://predictionindex.xyz/ecosystem (fetched 2026-10-19, via curl; H for listing content)
- DNS checks of wanna.fun hostnames (local, 2026-10-19; H)
- docs/research/fixtures/wannafun/predictionindex_entry_2026-10-19.json (extracted PI entry)

## Suspicious content
None observed.
