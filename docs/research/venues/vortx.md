# Vortx (vortx.gg) - venue spec

Researched 2026-10-19. Verdict: **cannot confirm live; probably defunct or unreachable. adapter_priority = skip.**

## Liveness (the key finding)
- `www.vortx.gg` and `vortx.gg`: NXDOMAIN via system resolver and via 1.1.1.1 (H, `dig`, 2026-10-19). `curl` reports "Could not resolve host". WebFetch also fails to resolve (per task hint). Subdomains app./docs./api.vortx.gg: NXDOMAIN (H, dig @1.1.1.1). vortx.xyz and vortx.fi: also no A record (H).
- Prediction Index (aggregator directory) still lists it: project "Vortx", chain Hyperliquid, outcomeTypes binary, mechanism "clob", topics crypto/finance/politics/sports, status "live", site https://www.vortx.gg/, X handle @vortx_hl, total volume n/a, no API key flag (H that the listing says this, via WebFetch of https://predictionindex.xyz/ecosystem and the local snapshot docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json; M/L that "live" is true, because the site's own status label is stale for other projects too, see the note in that snapshot about Dome).
- The domain appears in a third-party phishing-list allowlist (phishdestroy/destroylist, allow/allowlist.json). That means the domain existed and was in use at some point. It tells us nothing about now (L).
- X account https://x.com/vortx_hl returned HTTP 402 to WebFetch, so account activity could not be checked. No payment was attempted.
- WebSearch was unavailable (session budget exhausted), so no independent press, docs or repo evidence was gathered. GitHub repo/code search for "vortx hyperliquid prediction" and "vortx.gg" found nothing relevant (H that the search returned nothing; the gh search output showed no hits).

## Fields (all unverified; only the directory listing exists)
- Kind: onchain CLOB prediction market on Hyperliquid, binary outcomes (L, directory listing only).
- Chain / collateral: Hyperliquid (HyperEVM or HyperCore not stated). Collateral NOT FOUND (searched: predictionindex listing, vortx.gg unreachable, GitHub).
- Read API: NOT FOUND. No docs reachable. If it is built on Hyperliquid's native order books, state would be readable via `https://api.hyperliquid.xyz/info` (POST, public), but that is an inference (L) and the venue-specific market identifiers are unknown. Not a basis for an adapter.
- Trade path: NOT FOUND. If it is a HyperCore/HyperEVM venue, orders would use Hyperliquid-style signing, which PayBox reachability for Hyperliquid is unknown (paybox_reachable = unknown).
- Fees, resolution mechanism, geo/ToS/automation, liquidity: NOT FOUND (searched: predictionindex listing, vortx.gg, GitHub, X).
- Event overlap: the directory tags crypto, finance, politics, sports (L). Liquidity sharing: unknown.

## Recommendation
Skip. Revisit only if the team finds a live URL (a different domain, the X profile, or a Hyperliquid ecosystem listing) and a documented API. The directory's "live" label should not be trusted for this entry.

## Open questions
- Is there a current domain? Is @vortx_hl still posting?
- Is it built on Hyperliquid HIP-style outcome markets, or its own HyperEVM contracts?

## Sources
- https://predictionindex.xyz/ecosystem (H: listing content; L: accuracy of status)
- docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json (H: local snapshot of the same listing)
- DNS lookups for vortx.gg and subdomains on 2026-10-19 (H: NXDOMAIN)
- https://x.com/vortx_hl (HTTP 402, unread)
- phishdestroy/destroylist allow/allowlist.json on GitHub (L: domain existed at some point)
- No fixtures saved: no public API reachable.
