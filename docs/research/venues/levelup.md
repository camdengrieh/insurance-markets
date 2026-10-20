# LevelUp (levelup.markets) - venue spec

Researched 2026-10-19. Verdict: **skip** (site appears dead/deprovisioned; no docs, API or contracts found).

## Liveness
- https://levelup.markets/ and /robots.txt return HTTP 404 with JSON body `{"status":"error","code":404,"message":"Application not found"}` and headers `server: railway-hikari`, `x-railway-fallback: true` (curl, 2026-10-19). This is Railway's response for a domain that points at Railway but has no deployed app behind it. (H)
- Apex resolves to 69.46.46.116 (Railway edge per whois); `www.`, `docs.`, `app.`, `api.` subdomains do not resolve (NXDOMAIN-style failure). Nameservers are name.com. (H)
- Consequence: the front end is not serving; the venue is very likely dead or abandoned. A backend could exist elsewhere but nothing discoverable points to one. (M)
- Only evidence of "live" is the directory listing at https://predictionindex.xyz/ecosystem: LevelUp, outcome type binary, chain Base, status "live", volume n/a, X @levelup_markets. That page gives no mechanism, no date, no docs link. The "live" status is stale or unverified against the actual site. (H for what the page says; L for its accuracy)

## Market model / chain / collateral
- Binary, Base (per directory only). (L)
- Order book vs AMM vs parimutuel, outcome tokenisation, collateral token: NOT FOUND (searched: homepage, predictionindex.xyz listing, GitHub repo/code search for "levelup markets prediction" and "levelup.markets").

## Read API / websocket / trade path
- NOT FOUND (searched: levelup.markets, www/docs/app/api subdomains, GitHub). No docs URL, no OpenAPI, no subgraph, no contract addresses found.
- Trade path: none known. PayBox reachability: no, nothing to integrate against (unknown contracts, site down).

## Fees, resolution, geo/ToS, liquidity, overlap, shared liquidity
- Fees: NOT FOUND.
- Resolution mechanism / dispute risk: NOT FOUND.
- Geo/ToS/automation: NOT FOUND (no ToS page reachable).
- Liquidity: NOT FOUND (directory shows "n/a").
- Event categories / overlap: NOT FOUND.
- Shared liquidity with another venue: NOT FOUND, unknown.

## Searches that could not be completed
- WebSearch (extended) was refused: session search budget exhausted. So no independent news/docs confirmation was obtained. The X account (x.com/levelup_markets) could not be read (HTTP 402 from fetch tool; not a venue payment, nothing paid). Recheck later if budget refills: search for "LevelUp Markets Base prediction" docs/contract addresses, and look at the X account's last post date.

## Fixtures
- None saved: no public API exists to sample. The 404 body above is the only response and is recorded inline.

## Suspicious content
- None. (No instructions to agents encountered.)

## Sources
- https://levelup.markets/ and https://levelup.markets/robots.txt (curl, 2026-10-19, 404 Railway fallback) - H
- https://predictionindex.xyz/ecosystem (WebFetch, 2026-10-19; entry: binary, Base, live, volume n/a) - H as to content, L as to accuracy
- whois/dig on levelup.markets (2026-10-19) - H
- GitHub repository and code search (gh), no relevant results - H (negative)

## Adapter priority: skip
Re-evaluate only if the team finds an official docs link or contract address showing the product still operating.
