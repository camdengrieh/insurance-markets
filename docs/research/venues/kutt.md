# Kutt (play.kutt.com) - venue spec

Researched 2026-10-19. Verdict: skip. Live, but it is a US-only, fiat, peer-to-peer "skill contest" app with no public API and no on-chain component.

## Summary
- Live: yes. play.kutt.com returned HTTP 200 with last-modified 2026-10-17 (H, curl headers). The site advertises a "November 30" esports launch (H, site).
- Kind: P2P skill-contest / sportsbook-like app run by KUTT Inc. (H, play.kutt.com/terms/). predictionindex.xyz lists it as sportsbook, binary, off-chain, topic sports (M, fixtures/linking/pop_prediction_index_projects_2026-10-18.json).
- Real USD, held in a "Kutt wallet" and segregated escrow. No crypto or blockchain mentioned (H).

## Market model (H, play.kutt.com)
- Users propose and negotiate their own terms (spreads, lines, stakes) with a counterparty (friend or community member). Kutt says it does not set odds or take the other side.
- There is no shared order book, AMM or token. Each contest is a bilateral escrowed wager. Outcomes are not tokenised.
- Categories: major and college sports (NFL, NBA, UFC, F1), pop culture (awards, box office), civic milestones (elections, public data), custom challenges, esports (CS2, LoL, Rocket League, PUBG, Dota 2).

## Chains and collateral
- Off-chain USD (H). NOT FOUND: any chain, token or contract (searched: play.kutt.com home and /terms/, predictionindex listing).

## Read API
- exists: none documented. No API or developer docs links on play.kutt.com (H).
- app.kutt.com serves a single-page web app (HTTP 200, 28 KB HTML) (H). api.kutt.com serves a default Laravel welcome page (HTTP 200, 5 KB), so a backend exists but is undocumented (H). docs.kutt.com does not resolve (H).
- I did not probe undocumented API paths. Any private app API would need an account and is outside scope.
- No fixtures saved: no public JSON API was found. Nothing was written under fixtures/kutt/.
- NOT FOUND (searched: play.kutt.com, app.kutt.com, api.kutt.com root, docs.kutt.com DNS). WebSearch budget was exhausted this session, so no GitHub or third-party search was done.

## Trade path
- None programmatic. Only the iOS app (App Store) and app.kutt.com web app, with sign-in, KYC-style 18+ and location checks (H, site). No order signing and no wallet.

## PayBox reachability
- No. There is no on-chain or signed-order path. Funds are USD in a custodial wallet. Funding is not documented (NOT FOUND). A PayBox EVM or Solana wallet cannot trade it.

## Fees
- Flat administrative fee. The site example is 3% on a $20 pool and contrasts it with the 10-15% sportsbook vig (H, play.kutt.com). The terms page lists "flat administrative fees and/or subscriptions" with no amounts (H, /terms/). Pushes and ties are refunded without fee.
- Promo: $5 deposit advertised as unlocking $200 "Predictions Dollars" bonus wagers (H). This is not tradeable edge.

## Resolution
- Certified official league data feeds for sports, and "public consensus sources" for other events (H). Cancelled or postponed events are refunded 100%. Terms describe no dispute process (H, /terms/). Terms say neither participant may retract or modify terms once the event begins. Dispute risk is centralised in the operator (M, inferred).

## Geo / ToS / automation
- 18+, 39 US jurisdictions (38 states plus DC). Excluded: AZ, CO, IA, LA, MD, MI, MT, NV, NH, NJ, SC, WA. Location services required for every game (H, /terms/).
- Automation, bot and API use: not addressed in the terms (H). Under "no API plus per-game geofencing" automation should be assumed disallowed (L).
- Legal basis: a memorandum from outside counsel, Artaev at Law PLLC (H). Florida prizes come only from participants' entry fees.

## Liquidity
- NOT FOUND (searched: play.kutt.com, /terms/). No volume, OI or TVL published. The bilateral model implies no standing two-sided liquidity (M, inferred).

## Event overlap and independence
- Sports (NFL, NBA, UFC, F1), awards and box office, and elections overlap with Polymarket, Kalshi and others in topic only (H on categories). The prices are individually negotiated spreads and lines, not a quotable market. Quotes cannot be read or executed programmatically, so it is not an arbitrage leg.
- Shares liquidity with another venue: no evidence of any (M).

## Adapter priority: skip
- Reason: no API, no programmatic trading, fiat only, US-state geofenced, bilateral negotiated contracts with no book. Not even useful as a signal source because no data is published.
- Revisit only if Kutt ships a public API or a public market feed.

## Suspicious content
- None observed.

## Sources
- https://play.kutt.com/ (WebFetch 2026-10-19, curl HEAD) - H
- https://play.kutt.com/terms/ (WebFetch 2026-10-19) - H
- https://app.kutt.com/ and https://api.kutt.com/ (curl GET 2026-10-19, HTML only) - H
- https://predictionindex.xyz/ecosystem via docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json - M
