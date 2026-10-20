# Rebet (rebet.app) - venue spec

Researched 2026-10-19. Verdict: **skip** (not integrable, not a prediction market, automation prohibited).

## Summary
- Rebet is a US "social sportsbook" and casino app run as a freemium + sweepstakes product, not a prediction market with an order book or on-chain pools. (H, rebet.app)
- Site says users "bet directly against one another" (marketing claim), but the Sweeps Rules do not describe peer-to-peer matching; games are described with "published win rates and payout odds" that the Sponsor can change at any time. (H, https://rebet.app/sweeps-rules). Treat as house-priced/sweepstakes, not a P2P market. The "parimutuel-p2p" discovery tag is NOT confirmed.
- Still live: rebet.app serves a current site (Oct 2026), eligibility "may change monthly". (H, https://rebet.app/). No dated 2026 news was verified (web search budget was exhausted; see Not found).

## Market model
- Sports picks (moneyline, props), social feed, challenges to friends; plus casino-style games (live dealer, plinko, slots, table games). (H, https://rebet.app/)
- Not binary/categorical/scalar tokenised outcomes; no order book, no AMM, no shares. NOT FOUND any price-per-outcome or probability representation. Lines are sportsbook-style odds. (M)

## Currency and chains
- Rebet Coins: play-money, buyable in USD, no cash value, non-transferable, expire after 60 days inactivity. (H, https://rebet.app/terms)
- Rebet Cash (RCH): sweepstakes currency, "cannot be purchased", obtained via bonus with coin packs, giveaways, 1 RCH/24h when balance is zero, mail-in; redeemable for prizes after verification (Plaid, SSN, possibly ID). (H, https://rebet.app/sweeps-rules, https://rebet.app/)
- No crypto, no chain, no wallet, no collateral token mentioned. (H: site states no deposits/withdrawals like real-money platforms)

## Read API
- exists: none. NOT FOUND (searched: rebet.app/api -> 404 page, rebet.app/developers -> 404, docs.rebet.app -> DNS fail, site pages, terms, sweeps rules).
- api.rebet.app resolves and returns HTTP 403 `{"message":"Forbidden"}` unauthenticated: a private app backend (AWS API Gateway style), undocumented. (H, own GET 2026-10-19). Not a public API; do not probe further.
- Terms prohibit scraping and reverse engineering (see below).
- No fixtures saved: no public response shapes exist. docs/research/fixtures/rebet/ left empty.

## Trade path
- None. Only the mobile/web app with account, Plaid identity verification and US-state geofence. No signing scheme, no order API. A PayBox EVM/Solana wallet cannot trade it via transaction proposals or signed orders. paybox_reachable: no.

## Fees
- No commission documented in terms or sweeps rules; odds/win rates are set by the Sponsor and can change at any time (so any margin is embedded in odds). Prize handling/payment processing fees may be charged; winners pay taxes. (H, https://rebet.app/sweeps-rules)

## Resolution / disputes
- Server result is official; system malfunction voids all play; Sponsor approval needed for prizes; payouts up to 30 days, one prize per 5 days, $5,000 cap per period in FL and NY. Disputes: informal conference then JAMS arbitration (Wilmington DE or remote), class waiver. (H, terms + sweeps rules). No oracle, no on-chain resolution.

## Geo / ToS / automation
- US only, 18+. Marketing page excludes ID, NV, LA, MT, MD, MI; Sweeps Rules exclude AZ, CT, CA, ID, LA, MD, MI, MT, NV, NJ, NY, TN. Lists differ (possible staleness on one). (H)
- Terms s3.7: no bots or "software-assisted methods"; Sweeps Rules: "Automated or systematic play is strictly prohibited"; terms bar scraping/reverse engineering and multiple accounts/collusion. (H, https://rebet.app/terms). Automating this venue violates ToS.
- Self-described as "distinct from real-money gambling"; not CFTC-regulated (M, hint from howtopredictionmarkets review, not re-verified).

## Liquidity
- NOT FOUND any volume/OI/TVL. No public figures. No pooled order flow to arbitrage against; prices are Sponsor-set. (searched: rebet.app, terms, sweeps rules)

## Event overlap
- Sports (moneyline, props, MMA, boxing, esports per user testimonials, M). Overlaps Kalshi/Polymarket sports in principle, but no price feed and no ability to trade, so no arbitrage leg. Possibly usable only as a manually observed odds signal, which ToS forbids scraping.

## Shared liquidity
- None. Closed-loop sweepstakes economy; independent but unusable.

## Priority
skip: sweepstakes/social sportsbook with play-money/prize currency, no API, no on-chain component, bots and scraping forbidden, no liquidity data.

## Sources
- https://rebet.app/ (H, fetched 2026-10-19)
- https://rebet.app/terms (H, 2026-10-19, via summarising fetch)
- https://rebet.app/sweeps-rules (H, 2026-10-19, via summarising fetch)
- https://rebet.app/robots.txt (H, curl) ; https://api.rebet.app/ (H, 403)
- Discovery hint: howtopredictionmarkets review (M, not re-fetched)

## Not found / limitations
- WebSearch budget exhausted during this task: no independent 2026 news, funding, user counts, or regulator actions were checked. Sweeps Rules and Terms were read through a summarising fetch tool, not verbatim; quotes are short and should be re-verified before reliance.
- No whitepaper, GitHub org, or contracts searched beyond site pages (none linked from the home page).

## Suspicious content
- None. (robots.txt references a stray sitemap at tusitio.com, a template leftover; harmless.)
