# Slips - P2P Bet (Slips Technologies, Inc.)

Researched 2026-10-19. Verdict: SKIP. Live, but it is a US-only fiat (card/ACH) social-betting app with no public API, no on-chain component, an explicit statement that it is not a prediction market, and ToS that ban automated access.

Confidence tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.

## Summary

- Live: yes. The iTunes lookup shows version 1.8.90 released 2026-10-07 and 4,045 ratings for the current version (H, iTunes lookup API, URL below). The app has been listed since 2021-05-17 (H).
- Product: "peer-to-peer betting app" with Pools, Heads-Up duels, and "Tourlays" (tournament-style parlays). It also has "AI-Generated Predictions" and lottery-ticket ordering (H, App Store description, slips.com meta description, site JS bundle).
- It is NOT a prediction-market venue in the sense this project needs. Its own ToS says: "Slips is not a prediction market regulated by the U.S. Commodity Futures Trading Commission" and that predictions "are not event contracts, binary options, swaps, futures" (H, ToS text compiled into https://slips.com/assets/index-BB0aAdYI.js).
- No developer docs, no public API, no on-chain contracts. Payment rails are credit card, Apple Pay, PayPal and ACH (H, App Store description). A PayBox wallet cannot reach it.

## Kind and market model (H unless noted)

- Kind: parimutuel-style / matched P2P wagers, centralized and custodial, fiat only.
- ToS: "Each prediction placed on Slips is a peer-to-peer wager matched directly between two or more users. The Company acts solely as a marketplace." Slips takes no position and is not a counterparty (H, ToS in JS bundle).
- Formats: Pools (shared pot), Heads-Up (1v1 duel), Tourlays (entry fee into a shared prize pool; ranked by number of correct picks; ties split the pool; picks lock at start) (H, ToS).
- Outcomes are not tokenised. There is no order book, no AMM, and no share price. Pricing is odds set by the matching users and the pool, in USD (M, inferred from the description; exact pricing mechanics NOT FOUND in public docs).
- Rules seen in ToS: at most 100 bets in a rolling 7 days and at most 3 bets on a single event per user. A tie, postponed or canceled game refunds the stake, and fees are non-refundable (H, ToS in JS bundle). These caps make large-scale or arbitrage use impossible.

## Chains and collateral

None. USD in a custodial in-app balance, funded by card, Apple Pay, PayPal or ACH; payouts by same-day ACH (H, App Store description). Aeropay is referenced as a payments provider in the web bundle (H, bundle strings `aeropay.com/legal/terms-of-service---end-user`).

## Read API

- Official public API: none found. NOT FOUND (searched: slips.com, /robots.txt, /sitemap.xml, the guessed hosts api.slips.com, docs.slips.com and developers.slips.com, which do not resolve in DNS, the App Store listing, and the ToS text).
- The web app talks to a private backend. The JS bundle sets `apiURL = https://api.startslips.com/app` and `imageURL = https://images.startslips.com/images` (H, bundle config). This is an undocumented first-party app API behind login. I did not probe it, since it is not a documented host and the ToS prohibit automated access.
- No websocket, rate limit or auth scheme is documented. No fixtures saved: there is no public unauthenticated response shape to capture.
- slips.com is a React SPA. robots.txt allows `/open-pools`, `/slips/live` and a few other routes (H), but the content is client-rendered from the private API and the ToS prohibit automated scraping.

## Trade path

None programmatic. The only route is the iOS/Android/web app with a KYC'd account (M: age 18+/21+ rules are stated; KYC details NOT FOUND). A PayBox EVM or Solana wallet could neither place orders nor fund an account. There are no transaction proposals or signed orders.

## Fees

- Exact fee formula: NOT FOUND (searched: App Store description, ToS text in the bundle).
- Known: the ToS say Slips' compensation is "limited to platform fees and membership fees". Paid tiers (Player, Premium, Whale) give "75% off fees" and "faster payouts" (H, App Store description). Fees are non-refundable on refunded bets (H, ToS).

## Resolution and disputes

Centralized, operator-determined. Slips settles matched predictions and transfers the principal between users per outcome (H, ToS). No oracle, no on-chain dispute process. Tourlay start and end times are "set by Slips" and Slips can cancel or modify games "at Slips' discretion" (H, ToS). Dispute risk is a fully trusted operator.

## Geo, ToS and automation

- US only, per-state: "All betting is player-vs-player (PvP) within specified legal state"; 18+, some states 21+ (H, App Store description). Offers are "based on user location". The state list was NOT FOUND (searched: App Store description, bundle ToS).
- Automation is explicitly banned. The ToS prohibit accessing the Services "in an automated way, using any robot, spider, scraper, web crawler" other than manually through a browser, and ban "bots, crawlers, scrapers, or any other automated means" to extract data, including for building a dataset (H, ToS in the bundle). Any scanner would violate the ToS.
- Legal characterization: the company says it is a "social betting exchange; not a sportsbook" (H, App Store description) and not a CFTC-regulated market (H, ToS).

## Liquidity (as of 2026-10-19)

- No volume, OI or TVL published. NOT FOUND.
- Signals: 4,045 ratings, 3.8 stars on the current version (H, iTunes lookup). The bundle links a press release titled "Slips Raises $3.5M Series Seed" (filename date 2026-01-15) and "Slips Launches AI Prediction Markets" (filename date 2025-09-12) (M: from file names only; the PDFs use encoded fonts and I could not extract their text).
- Event categories: sports, pop culture and culture events, live events, plus lottery ordering (H, ToS and App Store description). Overlap with other venues is possible in sports and some culture events, but the stakes are small, per-user bet caps are low, odds are not exposed in any feed, and liquidity is fragmented into private pools.

## Shared liquidity

None with another venue. It is independent, but it cannot serve as a tradeable arbitrage leg because there is no API, no programmatic access and no on-chain settlement.

## Adapter recommendation

- Priority: skip. Reasons: no public API, a custodial fiat system, ToS ban on automation, per-user bet caps, a self-declared non-prediction-market status, and no PayBox reachability.
- Optionally revisit only if Slips publishes a partner or data API (watch for a developer page on slips.com).

## Not found

- Public API, docs, websocket or rate limits.
- Fee schedule and formula.
- Eligible-state list.
- Volume, OI or user-count figures.
- Text of the press releases (the PDFs could not be extracted).
- A statement of Slips' licensing in individual states (the ToS cite legal state-by-state operation only generically).

## Suspicious content

None seen. The JS bundle contains a third-party Google Maps key string, which is not reproduced here. No instructions aimed at AI agents were found.

## Sources

- App Store listing: https://apps.apple.com/us/app/slips-p2p-bet/id1468017510 (H)
- iTunes lookup: https://itunes.apple.com/lookup?id=1468017510&country=us (H, version 1.8.90, 2026-10-07, description, seller URL)
- Site metadata: https://slips.com (H, meta description lists "Heads Up, Pools, Tourlays, and AI-Generated Predictions")
- Robots and sitemap: https://slips.com/robots.txt and https://slips.com/sitemap.xml (H; the sitemap lastmod dates of 2022 are stale, L)
- Web app bundle containing the ToS text and API config: https://slips.com/assets/index-BB0aAdYI.js (H, read as text only, not executed)
- Press releases (not text-extracted, M, by file name only): https://slipsapp.s3.us-east-1.amazonaws.com/press-releases/Slips-Raises-3.5M-Series-Seed-011526.pdf and https://slipsapp.s3.us-east-1.amazonaws.com/press-releases/Slips-Launches-AI-Prediction-Markets-09122025.pdf
- WebFetch of slips.com and /terms returned only the SPA title ("Slips - Live Betting"). WebSearch was unavailable because the session search budget was exhausted, so no independent news corroboration was obtained.
