# Asta (VSP Services LLC) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Skip as an adapter. Asta is a social front end to Polymarket, not an independent venue. It has no public API, and its liquidity is Polymarket's. It is not an independent arbitrage leg. Its only value is as a Polymarket order-flow and builder-fee reference, and possibly a social/trader signal if Asta ever publishes data (none today).

## Liveness

- Live as of 2026-10-19. useasta.app returns 200, footer "(c) 2026 Asta - VSP Services LLC" [H, https://useasta.app]. iOS app on the App Store, version 1.9.2 released within a day of capture; version history runs from 1.0 (Aug 18) to 1.9.2 (October). The year is not stated on the page but copyright is 2026 [H, https://apps.apple.com/ca/app/asta-app/id6796784761].
- Very new: the first release was about 2 months ago. Too few ratings for the App Store to show an overview [H]. Android listed as "Coming soon" [H].

## Kind and market model

- Kind: broker-or-frontend (social sports-trading app, creators' short videos with markets beneath, leaderboards, weekly tournaments, referrals) [H, useasta.app; App Store].
- Market model: inherited from Polymarket. Terms: Asta is "an interface to Polymarket, not an exchange, broker, or custodian" [H, https://useasta.app/terms]. So binary/categorical CLOB markets with Polymarket outcome tokens. Asta does not tokenise anything itself (inferred) [M].
- Coverage: football (Premier League, LaLiga, then Bundesliga, Serie A, Liga MX, MLS, others added in 1.7/1.8): match outcomes, game markets, season predictions [H, App Store].

## Chains and collateral

- NOT FOUND on Asta's own pages (searched: homepage, /terms, App Store listing). Terms say funds sit in a non-custodial wallet whose key only the user controls, exportable [H]. Version notes mention wallet-signing fixes, "crypto deposits by network", Apple Pay and debit card cash-in [H, App Store]. Since orders execute on Polymarket, the settlement chain and collateral should be Polymarket's (Polygon, USDC-family) [M, inferred; not stated by Asta].

## Read API

- exists: none. No docs, API, developer or llms.txt pages: /docs, /api, /developers, /llms.txt return 404; api.useasta.app returns 404 at root [H, curl 2026-10-19]. Homepage has no docs/API/GitHub links [H].
- robots.txt allows all; sitemap lists only /, /feed, /leaderboard, /tournament/rules, /company, /support, /terms, /privacy [H].
- Pages /feed and /leaderboard exist (Next.js site) but are app UI, not a documented data API. I did not probe internal endpoints (undocumented, and terms prohibit scraping).
- For market data use Polymarket's own APIs (covered by another workflow).
- No fixtures saved: no public API.

## Trade path

- Asta app only (iOS; web sign-in at /auth). Orders go to Polymarket, with a "builder fee" collected by Polymarket on Asta's behalf [H, terms]. No programmatic Asta trading API found. An agent wanting this exposure should trade Polymarket directly (the same book), not via Asta.
- Auth/signing: users sign with an Asta-managed non-custodial wallet (key export possible) [H, terms]. Scheme not documented.

## PayBox reachability

- paybox_reachable: no (via Asta). There is no Asta API or contract to call. The underlying Polymarket market could be reached through a Polymarket plugin, which is a separate adapter, and Asta adds nothing.

## Fees

- Asta charges 1% of each trade, collected by Polymarket as a builder fee with the order, separate from Polymarket's market fee; the ticket shows both [H, terms]. Version 1.9.2 notes "Reduced trading fee to 1%", so it was higher before [H, App Store]. Implication: trading Polymarket directly is cheaper by 1% than through Asta, so Asta is never the better execution route.
- One secondary search summary mentioned Polymarket football fee promotions in October [L, web search summary, unverified, and not confirmed to apply here].

## Resolution

- Governed by Polymarket's mechanism (Asta does not describe it). Terms: no dispute process, and VSP Services LLC is not responsible for "market resolutions you disagree with" [H, terms]. Same resolution risk as Polymarket plus zero recourse via Asta.

## Geo / ToS / automation

- 18+; Asta checks approximate location and disables order placement where prediction-market trading is restricted, including the United States. Circumventing checks breaches the terms [H, terms]. Footer: "Trades outside the U.S. are executed on Polymarket. U.S. trading coming soon." [H, homepage].
- Automation: not addressed. Prohibits using the service to "attack, scrape, or overload" it [H, terms]. No API means no sanctioned automation.

## Liquidity

- No volume, user or TVL figures published by Asta [H, homepage claims no metrics]. All depth is Polymarket's order book. Operator is a small LLC; independent reviews NOT FOUND (searched: web search, extended).

## Event overlap

- Football (league match outcomes, season markets): identical to the Polymarket markets. It only duplicates them, so there is no cross-venue arbitrage inside Asta.

## Shares liquidity with

- Polymarket (global). Not an independent leg.

## Suspicious content

- None observed. No instructions aimed at AI agents found.

## Open questions

- Whether Asta will publish a public trader/leaderboard API or builder-attributed volume. Chain and wallet provider used. Which Polymarket builder code it uses (not stated).

## Sources

- https://useasta.app (homepage, footer, sitemap, robots.txt) [H]
- https://useasta.app/terms [H]
- https://apps.apple.com/ca/app/asta-app/id6796784761 (App Store listing, version history) [H]
- WebSearch (extended) for corroboration: no independent coverage found [L]
