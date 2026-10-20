# Bolvei (bolvei.com) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = inferred, L = weak/stale.

## Verdict
Skip. Bolvei is a custodial, off-chain, Kenya-focused (M-Pesa) parimutuel "forecast" app with an in-app balance ledger on Supabase. No public API, no on-chain contracts, no wallet trading path, admin-resolved markets, and no verifiable liquidity. Not integrable, not an independent arbitrage leg.

## Liveness
- Live as of 2026-10-19: https://bolvei.com 307-redirects to https://www.bolvei.com/, which returns 200 (Vercel). H
- Homepage last-modified 2026-10-18; sitemap lastmod 2026-09-28 for static pages, 2026-09-16 for individual market URLs. H
- GitHub org Bolvei created 2026-06-10, 0 public repos, location Kenya, no contract or SDK code. H (gh api orgs/Bolvei, repos list empty)
- Title: "Bolvei | Prediction Markets Africa - Forecast & Earn". Meta description: "prediction market built for Africa. Forecast elections, football, and crypto prices and earn real money via M-Pesa. A skill-based alternative to sports betting." H
- docs.bolvei.com and api.bolvei.com: TLS connection failure (no such hosts live). H

## Kind and market model
- Kind: custodial off-chain app, NOT on-chain (the discovery label onchain-other is wrong). H/M (client bundle shows Supabase RPCs `place_prediction`, `dispute_market_result`, tables `markets`, `market_options`, `company_wallet`; no EVM/Solana trading code seen in bundle greps)
- Model: parimutuel pooled model, stated in the in-app Terms ("winnings are distributed automatically via the Parimutuel Pooled Model"). H (site JS bundle https://www.bolvei.com/assets/index-DYBHTnfL.js)
- Market types: binary (YES/NO) and multi-option (`market_options`); "mini" markets with max 7-day duration. H (bundle)
- Prices: "odds" are pool-share percentages (yes_points / (yes_points + no_points)); payout is computed from the pool and fees after the fact, so a displayed price is not a firm executable price. H/M
- Outcome tokens: none. Positions are DB rows (stake, choice, potential_payout). H/M
- Unit of account: in-app balance (`points_balance`, `locked_balance`), displayed in KES and other African currencies. A separate free "BOL" points game exists (100 BOL per right pick). H (bundle)

## Chains and collateral
- No chain for trading. Deposits via M-Pesa STK push (instant); withdrawals processed manually, "typically within 24 hours". H (bundle FAQ)
- A USDT (BEP20) address field appears in an admin/user-request UI, i.e. crypto is at most a funding rail into a custodial balance, not a trading venue. M
- Limits in client constants (USD): MIN_DEPOSIT 0.85, MAX_DEPOSIT 1931.44, MIN_WITHDRAWAL 2.32, MIN_TRADE 0.39 (mini 0.16). H (bundle; client constants can lag server)

## Read API
- exists: none (no official public API, no docs). NOT FOUND (searched: docs.bolvei.com, api.bolvei.com, sitemap/robots, GitHub org Bolvei, site bundle for REST routes).
- The web app reads via a Supabase project (PostgREST/RPC/realtime) using an embedded anon key; this is the app's private backend, undocumented and not offered as an API. I did not call it or record the key. Treat as unofficial-only and ToS-risky.
- Page URLs: /markets, /market/{uuid}, /leaderboard, /analytics. SPA (client-rendered), so HTML carries no market data. H
- No fixtures saved (nothing public to sample).

## Trade path
None programmatic. Sign-in plus M-Pesa funding in a web/PWA UI; bets go through Supabase RPC `place_prediction` under a user session. No order signing, no wallet auth, no API keys. H/M

## PayBox reachability
no. No on-chain contract or signed-order interface exists for a PayBox EVM/Solana wallet to call; at most a manual USDT-BEP20 top-up into a custodial balance, which is a deposit to the operator, not a trade, and withdrawals are manual/admin-approved.

## Fees (client constants and in-app Terms)
- Parimutuel deductions from total pool: 10% platform (RESOLUTION_FEE_PERCENT) plus 5% creator fee (STANDARD_CREATOR_FEE_PERCENT), about 15% of pool, borne by all participants via reduced payout. H (Terms text and bundle)
- Deposit fee 3%, withdrawal fee 3%. TAKER_FEE_PERCENT 2 / MAKER_FEE_PERCENT 0.5 constants exist but the live model is pooled; applicability unclear. Market creation fee about USD 3.86. H (constants) / L (applicability)
- Round-trip cost is in the tens of percent, which kills any cross-venue arbitrage margin.

## Resolution and dispute risk
- Resolved by administrators "based on publicly verifiable information"; "Resolution decisions are final". An AI helper (`ai-resolve` edge function) assists the admin; a proposed result enters `resolution_pending` with a dispute deadline and users can file a dispute reviewed by an admin. H (bundle and Terms text)
- High operator/counterparty risk: custodial funds, single-party resolution, manual withdrawals. Terms "Last updated: September 2026". H

## Geo / ToS / automation
- Kenya-first (og:locale en_KE; KES, UGX, NGN, GHS, ZMW, MWK, CDF currency maps); M-Pesa required for easy funding. Explicit geo-block or age text: NOT FOUND (searched: Terms and Privacy strings in bundle). Automation/bot rules: NOT FOUND. Using the Supabase backend directly would likely run against the intent of the ToS. M

## Liquidity
- NOT FOUND: no published volume, OI, or TVL. Pool sizes appear only after in-app data fetch. Client minimums are cents-level (USD 0.39 minimum trade), suggesting a retail micro-stakes venue. L

## Category overlap (arbitrage relevance)
- Categories in bundle: general, sports (EPL, Champions League, World Cup 2026, Kenyan Premier League, NBA, F1, boxing), politics (Kenyan government/elections), economy (KES rate, fuel, NSE, CBK, inflation), business (Safaricom, startups), culture, matatu culture, crypto (BTC/ETH). H (bundle)
- Overlap with other venues is nominal (global football, BTC), but parimutuel payoffs with about 15% pool rake and cents-scale stakes cannot be arbitraged. Many markets are Kenya-local with no counterpart elsewhere.
- Shares liquidity with another venue: no. It is isolated, but also not a usable leg.

## Adapter priority
skip. No API, custodial ledger, parimutuel (non-executable) pricing, about 15% pool rake plus 3%/3% deposit/withdrawal fees, admin-resolved, no PayBox path, negligible/unverifiable liquidity. Revisit only if they publish an API or on-chain settlement.

## Open questions
- Do the SPA market pages expose any public odds feed? Only the shell was checked.
- Is the BEP20 USDT rail a real settlement option or a manual deposit address?
- Exact geo/age restrictions in the ToS (only partially read via the bundle).

## Suspicious content
None found. The site bundle contains a Supabase project URL and embedded anon key; not used or recorded here.

## Sources
- https://bolvei.com and https://www.bolvei.com/ (homepage HTML, meta tags) H
- https://www.bolvei.com/robots.txt, https://www.bolvei.com/sitemap.xml H
- https://www.bolvei.com/assets/index-DYBHTnfL.js (public client bundle: constants, Terms/FAQ text, categories, RPC names) H for what the client says; M for server behaviour
- https://github.com/Bolvei (gh api orgs/Bolvei and orgs/Bolvei/repos) H
- WebFetch of / and /terms returned only the SPA title (no content). WebSearch unavailable (session search budget exhausted), so no third-party corroboration or volume data. L
