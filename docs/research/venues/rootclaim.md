# Rootclaim (rootclaim.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
NOT a market. Rootclaim is a probabilistic-analysis publisher (Bayesian hypothesis comparison on public controversies). No order book, no AMM, no tokens, no collateral, no trade path, no public API. Site is up but content is frozen: newest analysis is Feb/Mar 2024. adapter_priority = skip.

## Liveness (H)
- https://www.rootclaim.com returns HTTP 200 on 2026-10-19 (curl). Sitemap lastmod 2025-09-19 (H, https://www.rootclaim.com/sitemap.xml), i.e. site still deployed/redeployed in Sept 2025, but that is a build timestamp, not a content update (M).
- Homepage and /rootclaim-challenge state: team "fully dedicated to teaching AI models the art of probabilistic inference" and "will likely not be publishing new analyses in the meantime" (H, https://www.rootclaim.com and https://www.rootclaim.com/rootclaim-challenge). Updates are pointed to X.
- A WebSearch for 2026 news was NOT possible (session search budget exhausted). NOT FOUND (searched: homepage, challenge page, terms, sitemap, robots). So no independent 2026 confirmation of activity beyond the site being served.

## Kind and market model (H)
- kind: forecasting-nonmoney / analysis publisher. Each analysis assigns probabilities to a small set of mutually exclusive hypotheses (categorical), computed by Rootclaim's own algorithm from weighted evidence. Static or occasionally updated numbers, not a price discovery process.
- Published items (H, homepage): COVID-19 origins (2024-02-05, updated 2024-03-07; lab leak 94 / zoonosis 6), Tair Rada murder (2023-01-19), Mahsa Amini death (2022-12-11), Shireen Abu Akleh killing (2022-08-04; IDF 87), Putin cancer (2022-06-15), Ghouta chemical attack (2020-10-01; opposition 96.4). Challenge page also lists 2020 US election fraud (no widespread fraud 91) and Vitamin D/COVID (49, flagged outdated) (H, /rootclaim-challenge).
- "Rootclaim Challenge": bilateral bet, default $100,000 stake per side in escrow, two agreed judges, 30-day text debate plus live video, Tel Aviv jurisdiction (H, /rootclaim-challenge). Not tradable by third parties. First challenge (COVID origins) was lost by Rootclaim: judges picked the less likely hypothesis, Rootclaim paid $100,000 (H, same page). Useful lesson: the model's probabilities are not calibrated market prices.

## Read API
- exists: none. NOT FOUND (searched: sitemap.xml, robots.txt, /api, terms of service, homepage). /api returns the HTML single-page app (SPA fallback), not JSON (H, curl). Sitemap lists only marketing/info pages plus /admin routes; no data endpoints (H).
- robots.txt disallows /admin/*, /_next/*, /icons/*, /cdn-cgi/* (H). Site is Next.js (M, from /_next disallow).
- Only machine access would be HTML scraping of the homepage and per-analysis pages (the old Metaforecast "rootclaim" fetcher did this, M, docs/research/venues/metaforecast.md in this repo). Metaforecast is shut down (see that note).
- Fixtures: none saved, no JSON API exists to sample.

## Trade path
none. No order placement, no signing, no wallet integration. PayBox reachability: no (nothing on-chain, nothing to transact; challenge bets are bilateral legal escrow agreements, not programmatic).

## Fees / collateral / chains
Not applicable. No fees for readers. Challenge: each side stakes escrow; debate expenses (fees, lawyers, judges) come out of the pool before payout; split equally if judges disagree (H, /rootclaim-challenge). Rootclaim also offers a $1,000 reward for evidence that causes a challenge to be withdrawn (H).

## Resolution
Analyses are not resolved; they are model outputs. Challenges resolve via two human judges. Dispute risk: n/a for a feed; high subjectivity as a signal.

## Geo / ToS / automation (H, https://www.rootclaim.com/terms-of-service; ToS last updated Oct 2016)
- Prohibits using any "robot, spider ... or any other manual or automatic device" to retrieve, index or data-mine the Site, and automated use that loads infrastructure. No API mentioned. Probabilities may be cited if accurate, labelled as Rootclaim-calculated odds, and credited. Rootclaim disclaims accuracy; probabilities rest on undisclosed assumptions.
- Implication: even scraping for a signal feed is against ToS; manual citation with attribution is permitted. Do not build an automated adapter.

## Liquidity
None (no market). Volume/OI/TVL: NOT FOUND, n/a.

## Event overlap / arbitrage relevance
Topics are geopolitical/forensic/health controversies (COVID origins, Ghouta, Abu Akleh, Mahsa Amini, 2020 election fraud). Overlap with tradable venues is minimal: possibly rare Polymarket/Manifold/Metaculus questions on COVID origin or Syria. None resolvable on a schedule and none usable for arbitrage. As a signal source it is stale (newest item >2.5 years old, flagged as possibly stale), too few data points (about 6-8 questions), and has a poor track record on its one tested bet.
Shares liquidity with: n/a.

## Priority
skip. Not a market; no API; ToS bars automated retrieval; content frozen since early 2024. If wanted, hand-curate the ~6 probabilities as static annotations with attribution, no adapter.

## Open questions
- Any 2026 activity (X posts, new AI-driven product)? Could not search (budget). Check the Rootclaim X account manually if relevant.

## Sources
1. https://www.rootclaim.com (H, fetched 2026-10-19)
2. https://www.rootclaim.com/rootclaim-challenge (H)
3. https://www.rootclaim.com/terms-of-service (H)
4. https://www.rootclaim.com/robots.txt and /sitemap.xml (H, curl)
5. docs/research/venues/metaforecast.md (M, repo-internal, prior fetcher list)
