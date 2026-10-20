# Follymarket (https://www.follymarket.com)

Researched 2026-10-19. Verdict: **skip**. Novelty/parody site, not a venue.

## Summary
- Live: yes, site returns HTTP 200 on 2026-10-19 (H, curl https://www.follymarket.com).
- Self-description: "a next-generation prediction market with no financial upside for participants"; tagline "$2 to vote" (H, site meta/footer).
- Show HN (2026-03-04, 1 point, 0 comments): single self-referential question, always "Will Follymarket reach $X in total revenue before end of month?". Pay $2 to vote Yes/No. "The $2 goes to Follymarket. All of it." Winners get points and a leaderboard streak; "no financial upside for anyone but me" (H, https://hn.algolia.com/api/v1/items/47251956).
- Pages: / (market), /archive ("Market Archive", one month at a time), /press, /terms, /privacy, /login. Terms, privacy, press and sitemap redirect to a passwordless email login, so ToS text is NOT FOUND (gated; no account created).

## Venue-spec fields
- Kind / market model: forecasting-nonmoney. One recurring binary Yes/No question, no order book, no AMM, no price, no tokens. Fixed $2 fee per vote, all kept by operator (H, HN post). It is a revenue-funded points game, not a trading market.
- Chains/collateral: none. $2 fiat-style payment (processor NOT FOUND, behind login). No crypto/wallet evidence (M).
- Read API: none. GET /api/markets and /api/questions return 404 JSON (H, fixture api-markets-404.json). Site is a Nuxt SPA with email-login; no documented API, no docs. robots.txt empty (200).
- Trade path: none programmatic; email-link login + card payment presumably. PayBox/EVM wallet: not reachable (no on-chain component).
- Fees: $2 per vote, 100% to operator (H, HN post).
- Resolution: determined by Follymarket's own total revenue vs threshold $X at month end; operator-controlled and self-referential, no oracle or dispute process documented. Dispute risk: unbounded (operator is the resolver and a counterparty).
- Geo/ToS/automation: NOT FOUND (searched: /terms, /privacy, /press via WebFetch and curl; all login-gated).
- Liquidity: no volume/OI published; the only disclosed metric is none. NOT FOUND (searched: site, /archive, HN thread, web search).
- Category overlap: none (question is about the site's own revenue). No arbitrage leg possible; no cross-venue equivalent. Shared liquidity: none.
- Name confusion: folymart.com and nickhaubri.ch "Follymarket" blog post (Polymarket calibration analysis, 2023-24 data) are unrelated (M, web search results).

## Sources
- https://www.follymarket.com (H)
- https://www.follymarket.com/archive, /press, /terms (H, login-gated)
- https://hn.algolia.com/api/v1/items/47251956 (H, Show HN 2026-03-04)
- Fixtures: docs/research/fixtures/follymarket/hn-show-hn-item-47251956.json, api-markets-404.json
- Web search "Follymarket $2 prediction market Show HN" (M)

## Open questions
- Payment processor and ToS unknown (login-gated).
