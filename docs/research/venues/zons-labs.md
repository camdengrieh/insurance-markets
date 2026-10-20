# Zons Labs - venue spec (2026-10-19)

Verdict: skip. No product, no public code, no API, no evidence of life after 2025-06-27. [H for the GitHub facts, L for any inference about the product]

## Summary
- GitHub org Zons-Labs was created 2025-06-27T20:06:19Z and last updated 2025-06-27T20:11:49Z (5 minutes later). It has 0 public repos, 0 gists, 0 followers, 0 public members, no blog, no email, no twitter handle, not verified. [H] https://api.github.com/orgs/Zons-Labs
- The only product claim is the org description: "Zons is a gamified, crypto-powered prediction market focused on social media engagement and honest contributions". [H] same URL
- Org events feed is empty. [H] `gh api orgs/Zons-Labs/events` returned []
- Nothing links the org to a website, contract, chain, token or API. [H, absence]

## Still live?
Unconfirmed and probably not. Nothing public shows a live market, launch, contract or site. 16 months with zero public commits. [M]

## Fields
- Kind / market model: NOT FOUND (searched: GitHub org page and API, org repos, GitHub repo search "zons prediction"). Description implies a gamified, engagement-based prediction product but not binary/categorical/AMM/orderbook. [L]
- Chains / collateral: NOT FOUND.
- Read API: none found. Base URLs, docs, websocket: NOT FOUND.
- Trade path: none found. PayBox reachable: unknown (no contracts or endpoints to target).
- Fees: NOT FOUND.
- Resolution: NOT FOUND. Description mentions "honest contributions", which hints at a social/reputation-style resolution but this is speculation. [L]
- Geo/ToS/automation: NOT FOUND.
- Liquidity: NOT FOUND (no volume/OI/TVL source).
- Category overlap: "social media engagement" markets would be niche and unlikely to overlap sports/politics/crypto/macro on other venues. [L]
- Shared liquidity: unknown.

## Domains probed (not linked to the org; do not treat as the venue)
- zons.io: serves "ZONS SOLUTION" cloud/DevOps consultancy page. Unrelated. [H, page title read]
- zons.xyz: "Zons is a ZEC-native coin launchpad". Zcash coin launchpad, not a prediction market; no link to the GitHub org established. [H page meta, M that it is unrelated]
- zons.app, zons.fun, zons.markets: no response. [H]

## Limitations
- WebSearch was unavailable: the shared 200-call session budget was exhausted, so no web/X/news search was done. Residual chance that the project exists under another handle or domain. A later retry with queries like "Zons prediction market" and "Zons Labs social engagement" is the only open item.
- No fixtures saved: no public API exists to sample.

## Sources
- https://api.github.com/orgs/Zons-Labs (via gh api) [H]
- https://api.github.com/orgs/Zons-Labs/repos (empty) and /events (empty), /public_members (empty) [H]
- https://zons.io and https://zons.xyz (page head only, untrusted data; no instructions seen) [H]

## Priority
skip (no product evidence, no API, no code, apparently abandoned).
