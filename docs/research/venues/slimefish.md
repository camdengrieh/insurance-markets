# Slimefish (slimefish.com)

Researched 2026-10-19. Verdict: **skip** (site appears down/undeployed; nothing to integrate; high-risk unverified operator).

## Status

- [H] `https://slimefish.com/`, `/robots.txt`, `/sitemap.xml`, `/api`, `/docs`, `www.` and `api.` subdomains all returned HTTP 404 on 2026-10-19 with JSON body `{"status":"error","code":404,"message":"Application not found",...}` and header `x-railway-fallback: true`. This is the Railway edge's "no service attached to this domain" response, i.e. the domain still resolves (Cloudflare, NS max/love.ns.cloudflare.com) but no application is deployed behind it. `app.slimefish.com` does not resolve.
- [H] The WebFetch of the root also returned 404, so the "Trade the Future" page described in the discovery hint could not be re-read. It may have been live in Aug 2026 and since taken down, or the deployment was removed/misconfigured.
- [H] Only external trace found: Hacker News story 49483434 "Slimefish.com: Kenyan Prediction Market", submitted 2026-08-28 by user NibezaK, 1 point, 0 comments, no body text (https://hn.algolia.com/api/v1/items/49483434). Hint said 2026-08-29; the API timestamp is 2026-08-28T19:55Z.
- [H] GitHub repository search for "slimefish prediction" returned no results.
- Web search could not be run (session search budget exhausted), so no press, social or docs coverage was checked. This is a gap, not evidence of absence.

## Spec fields

| Field | Finding |
|---|---|
| Kind / market model | NOT FOUND (searched: site root and common paths, HN item, GitHub repos). Hint only says "Kenyan prediction market". |
| Chains / collateral | NOT FOUND. Hint [M, from discovery, not re-verified] says site mentions moving fiat to stablecoins; no chain, token or contract address seen. |
| Read API | none found (all candidate paths 404). Docs URL: none. |
| Trade path | none. No API, no contracts, no signing scheme found. |
| PayBox reachable | no: nothing on-chain or API-addressable was found. |
| Fees | NOT FOUND |
| Resolution | NOT FOUND |
| Geo / ToS / automation | NOT FOUND. Hint [M] says WhatsApp is used for urgent withdrawals, which implies a manual, custodial, fiat-onramp operator model, not a permissionless one. |
| Liquidity | NOT FOUND. HN post has 1 point and 0 comments, which suggests negligible traction (M). |
| Event overlap | Unknown. Kenyan local events (politics, sports) might overlap Polymarket/Kalshi only for major elections or football, unverified. |
| Shared liquidity | NOT FOUND |

## Suspicious content

None seen: no page content was retrievable, so no embedded instructions were encountered.

## Open questions

- Is the Railway deployment permanently gone or just between deploys? Recheck in a few weeks if Kenyan-market coverage matters.
- If it returns: does it have any public JSON API or on-chain settlement, or is it a closed custodial app?

## Sources

- https://slimefish.com and paths listed above (fetched 2026-10-19, all 404 "Application not found") [H]
- https://hn.algolia.com/api/v1/items/49483434 (HN submission, 2026-08-28) [H]
- https://hn.algolia.com/api/v1/search?query=slimefish&tags=story (only one relevant hit) [H]
- Discovery hint about site content, fiat-to-stablecoin and WhatsApp withdrawals [M, not re-verified]

## Fixtures

None saved: no public read API exists to sample.
