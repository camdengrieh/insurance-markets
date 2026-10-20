# Verse Picks (Verse Gaming, Inc.) - venue spec

Researched 2026-10-19. Verdict: **skip**. Social sweepstakes app, not a market: no API, no order book, no on-chain component, bots prohibited, and the iOS app appears to have been pulled from the US App Store.

Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## 1. Is it still live? (2026)

- [H] versegaming.com still serves a marketing site (HTTP 200, Vercel, 2026-10-19). Its footer says (c) 2025, the latest press item is Sep 29, 2025, and the ToS were last updated Sep 11, 2025. There is no 2026 content, so the site is possibly stale.
- [H] The App Store page https://apps.apple.com/us/app/verse-picks/id6446703696 returns HTTP 404 today.
- [H] The public iTunes Lookup API (`itunes.apple.com/lookup?id=6446703696`) returns `resultCount: 0` for country us, ca and gb. The same endpoint returned a hit for a control app id, so the endpoint works.
- [H] An iTunes search for "verse gaming" and "verse picks" (software, us) returns no Verse app.
- Conclusion [M]: the iOS app is no longer listed in the US App Store. The reason is unknown (voluntary pull, Apple removal or a state action); I found no source. The marketing site still links to the App Store ID. Treat the product as **not confirmed live**.
- [H] versepicks.com redirects to /lander, which returned a GoDaddy "Access Denied" for-sale page to curl. This matches the brief's note that the domain is parked. The real domain is versegaming.com.
- NOT FOUND (searched: WebSearch budget was exhausted, so no 2026 news, regulator action or Google Play check could be done).

## 2. Kind and market model

- [H] A "free-to-play, sweepstakes-based prediction contest" run by Verse Gaming, Inc., Houston TX (prediction-rules.html, effective Aug 27, 2025).
- [H] Markets are Yes/No on real-world events (sports, politics, entertainment, finance, current events). Users can submit single picks or 2-8 pick slips (parlays) where all picks must be correct.
- [H] Payouts are "fixed and predetermined based on market odds at entry time". There is no order book, no AMM, no pool and no counterparty trading. The house sets odds and users enter fixed-odds contests. This is closest to a fixed-odds sportsbook with promotional currency, not a prediction market. Entries cannot be changed after submission, and there is no secondary market.
- [H] There is also a "LeagueSync" fantasy product with moneyline, spread and total-points entries on fantasy matchups, including an instant-entry cap of +1500 odds.
- No outcome tokenisation of any kind. Entries are database rows.

## 3. Chains and collateral

- None on-chain. [H] Currencies are VerseCoin (earned or purchasable, no cash value, non-withdrawable) and VerseCash (promotional, not purchasable directly, not transferable).
- [H] VerseCash can be redeemed for cash prizes after 1x play-through, with a $50 minimum.
- [H] The marketing FAQ calls VerseCoin an "AirDrop" but gives no token contract or chain. NOT FOUND (searched: versegaming.com home, FAQ, ToS, rules; no chain or contract mentioned).
- Payment rails are fiat (bank, card). The prediction rules mention deposits, banking details and 1099-MISC for winnings over $600.

## 4. Read API

- Exists: **none** (no public, partner or documented API).
- [H] No documentation link exists anywhere on versegaming.com (navigation: How It Works, FAQ, Download, Help Center, Founder Articles, press, ToS, rules).
- [H] api.versegaming.com, api.versepicks.com and docs.versegaming.com do not resolve in DNS. These were guesses; they do not prove the absence of an app backend on another host.
- [H] robots.txt is a 307 redirect with no usable content.
- Fixtures: none saved (nothing to fetch). Directory docs/research/fixtures/verse-picks-verse-gaming/ not created.
- A private mobile-app backend probably exists [M], but it would require an account and would breach the ToS (below).

## 5. Trade path

- None. [H] The ToS section 7 (Prohibited Conduct) lists: "Use automated systems, bots, or scripts to interact with the Services".
- Entry needs an app account with government-ID verification and device location sharing ([H] prediction rules, LeagueSync section 1).

## 6. PayBox reachability

- **No.** There is no on-chain contract, no signed-order API and no crypto deposit path found. Entries are made in a closed-loop app with fiat KYC, and an EVM or Solana wallet has nothing to sign or propose.

## 7. Fees

- [H] "Entry fees are non-refundable. Winning entries incur a 5% transaction fee" (prediction rules, LeagueSync section 4). The section is headed LeagueSync, and it is unclear if it applies to the main prediction game.
- [H] Prediction-game payouts are fixed odds, so the vig is embedded in the odds. No formula is published. NOT FOUND (searched: ToS, sweepstakes rules, prediction rules).

## 8. Resolution and dispute risk

- [H] Prediction rules section 6: results are "verified using official sources (e.g., AP, ESPN, government agencies)". Disputes go to support. Unresolvable events may be voided or delayed.
- [H] "Verse maintains the absolute authority to resolve markets... All resolutions are final", and may "modify resolutions retroactively".
- Dispute risk is very high for an arbitrage leg: single-party discretion, retroactive changes and voiding. Entries are voided on "obvious errors" such as wrong odds.
- [H] Entries on "statistically dependent outcomes" and "coordinated play that leverages correlation patterns, technical delays, or system vulnerabilities" are prohibited and can be voided. Cross-venue hedging would plausibly be seen as a violation.

## 9. Geo, ToS and automation

- [H] Sweepstakes rules: open to legal residents of the 50 states and DC, age 18+. "Entries are void in: Idaho, Michigan, Montana, Nevada, and Washington." Void in US territories. The ToS also say 21+ in some states.
- [H] The ToS prohibit VPNs and location masking, and prohibit bots and scripts. Account is limited to one payment method per account. Withdrawals are max 1 per 24 hours and manually reviewed.
- [H] Arbitration in Delaware (AAA), class-action waiver. Verse describes itself as "not gambling or sports betting" but "a skill-based, interactive sweepstakes platform". It is not CFTC-regulated [M, Sports Handle].

## 10. Liquidity

- NOT FOUND (searched: versegaming.com, press page, Sports Handle). No volume, OI or TVL is published. There is no liquidity concept (house-set odds). Funding was a $585k pre-seed in Oct 2022 [H, press page], which suggests a small operator.
- Sports Handle [H, https://sportshandle.com/best-prediction-market-apps/, read this session] only mentions Verse Picks in passing as a social prediction market following state sweepstakes law, "much like with apps like Kalshi". It is not in the ranked list.

## 11. Event overlap and shared liquidity

- Category overlap in principle: NBA trades and awards, politics, box office, reality TV, breaking news, plus fantasy matchups [H, home page]. Overlap with Kalshi and Polymarket exists in sports, politics and awards.
- But odds are house-set, limited-stake (promo currency), non-hedgeable and void-able, so any apparent price gap is not executable arbitrage. At most it is a weak signal. The odds are not exposed through any API anyway.
- Liquidity is independent (it is not shared with another venue), but there is no real liquidity to speak of. [H] The home page lists "Official SportsData.io Partner", and the press page shows a Sportradar partnership from 2021. These are data suppliers, not liquidity.

## 12. Adapter priority: skip

- No API, no on-chain path, bots banned, apparent US App Store delisting, closed-loop promo currency, discretionary resolution, and no published liquidity.
- Revisit only if Verse publishes a partner or data API, or if confirmed live in 2026 and a signal feed is wanted. Even then it would be P2 signal-only.

## Suspicious content

- None found. No embedded instructions aimed at AI agents were seen on the pages read.

## Open questions

- Why the App Store listing is gone (voluntary, Apple or regulator), and whether an Android app or new domain exists. WebSearch budget was exhausted, so this was not researched.
- Whether the 5% winning-entry fee applies to the main prediction game or only LeagueSync.

## Sources

- [H] https://versegaming.com/ (home, FAQ, links; fetched 2026-10-19)
- [H] https://versegaming.com/prediction-rules.html (effective Aug 27, 2025)
- [H] https://versegaming.com/sweepstakes-rules.html (state exclusions)
- [H] https://versegaming.com/terms-of-service.html (effective Aug 27, 2025, updated Sep 11, 2025; bots clause)
- [H] https://versegaming.com/in-the-press.html (latest item Sep 29, 2025; Sep 3, 2025 relaunch as Verse Picks)
- [H] https://apps.apple.com/us/app/verse-picks/id6446703696 (HTTP 404)
- [H] https://itunes.apple.com/lookup?id=6446703696 (country us, ca, gb: 0 results) and https://itunes.apple.com/search?term=verse+picks&entity=software&country=us
- [H] https://versepicks.com (redirects to /lander, GoDaddy for-sale page, access denied to curl)
- [H] https://sportshandle.com/best-prediction-market-apps/ (passing mention only)
- [M] Action Network, VegasInsider, RotoGrinders per the task brief (not re-verified; search budget exhausted)
