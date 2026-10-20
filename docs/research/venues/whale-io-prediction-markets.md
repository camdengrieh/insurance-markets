# Whale.io Prediction Markets - venue spec (2026-10-19)

Verdict: skip. A closed-garden casino feature (custodial, in-platform balance, US and UK blocked, bots forbidden, no documented API). Researched 2026-10-19. WebSearch budget was exhausted during this task, so no independent third-party search was done; findings come from the venue's own site and bundle plus one press release.

## Summary
- Kind: centralised, custodial crypto casino/sportsbook feature ("Prediction Markets"), not a protocol. [H, site bundle]
- Launched around the 2026 World Cup (press release 2026-06-10). Markets seen in the site bundle are World Cup only: winner, Golden Boot, Golden Glove, novelty props (Ronaldo "Siuu", pink boots, crying, ball burst). [H bundle strings, M that these are the whole catalogue]
- Still live? The site itself is live (sitemap lastmod 2026-10-19, T&C updated 03.07.2026). Whether the prediction product still has open markets after the World Cup final (2026-07-19) is NOT confirmed: the wc2026 page is a client-rendered shell, and the app cannot be browsed without an account. Bundle strings say markets not completed by 2026-10-13 resolve "Other", so the World Cup markets are likely all settled by now. [M/L]

## Market model [H unless noted; all from the public JS bundle FAQ/rules strings]
- Binary Yes/No per proposition. "Both sides have a price - and they always add up to $1. Example: Yes 16c / No 84c." Price "driven entirely by what traders are willing to pay"; "100c = $1".
- Categorical events (World Cup winner) appear to be sets of binary Yes/No markets (the "Spain to win at 16%" example).
- Trade UI: Buy/Sell, "shares", "Pool", "Est. Payout", "Sell fee", "Total Shares". Selling before resolution is allowed.
- Order book vs AMM vs pool: NOT FOUND (searched: bundle strings, press release, FAQ). The bundle uses the word "Pool" and "sell fee" which hints at a house-run AMM or internal matching, but that is inference only [L]. Position sizes are capped and "trading patterns are monitored" (FAQ a8).
- Outcome tokenisation: none documented. Positions are internal ledger entries ("My Positions"), not on-chain tokens. [M]

## Chains and collateral
- Collateral is the user's in-platform Whale balance: "All currencies on Whale are supported except $WHALE token. Everything is displayed in USD". [H, FAQ a9]
- Press release: "fully integrated with your existing Whale balance. No bridging, no external sites." [H, Chainwire]
- No on-chain settlement or contracts documented. Deposits/withdrawals to the platform are via crypto, but that is the casino cashier, not the market. [M]

## Read API
- Official public API: NOT FOUND (searched: whale.io, docs.whale.io [DNS does not resolve], robots.txt/sitemap.xml, JS bundles, press release).
- Backend host seen in the bundle: https://api.whale.io (root returns "success"; unknown paths return a Fastify-style 404 JSON `{"message":"Route GET:/predictions not found","error":"Not Found","statusCode":404}`). I probed /health, /events, /predictions, /prediction/markets, /prediction-markets: all 404. The actual prediction routes were not located in the bundle (searched index and App chunks for prediction/market/position routes; the prediction module endpoints were not found, likely a lazy chunk or authenticated route). [H for the 404s]
- The frontend also uses a Centrifugo-style websocket for polls (not predictions). No documented websocket for markets.
- Conclusion: any data would have to come from the private, authenticated app API (session-bound, Telegram Mini App auth path "/auth-sync/tgapp-sync" seen in the bundle comments). Not a supported integration; scraping it would breach the T&C clause on automation. [H on clause]

## Trade path
- None programmatic. Trading happens in the logged-in web/Telegram app against a custodial balance. No signing scheme, no wallet-signed orders, no transaction proposals. [M: absence of docs]
- PayBox reachability: no. A PayBox EVM/Solana wallet could at most fund an account's deposit address, but cannot place or cancel orders. [M]

## Fees
- A "Sell fee" line exists in the trade UI strings. Formula, rate, and who pays: NOT FOUND (searched: bundle, FAQ, T&C). Buy-side margin or spread unknown. The FAQ says "not a house edge", unverified. [L]
- Press release mentions "massive cashback" (casino cashback, unrelated to market fees). [H]

## Resolution mechanism and dispute risk
- Operator-resolved. "Official FIFA match results", primary resolution source official FIFA information "however, a consensus of credible reporting may also be used." [H]
- Every resolution has a 48h (2-day) contest period before payout; a "valid contest" can delay payout; no named arbiter or bond mechanism described. [H FAQ a4-a6]
- Cancelled/unresolvable events: refund at purchase price (FAQ a11) or resolve to "Other" if not completed by 2026-10-13 23:59 (rule strings). The "Other" outcome is Polymarket-like wording; the rule texts closely mimic Polymarket style, but no evidence of shared liquidity or a Polymarket integration was found (grepped bundle for polymarket/clob/gamma: no hits). [M]
- Dispute risk: high for novelty props (subjective, e.g. "visibly crying", "pink boots"), centralised discretion. Counterparty risk: custodial operator.

## Geo / ToS / automation
- Restricted jurisdictions (updated 06.10.2026): include United States of America, United Kingdom, France, Germany, Netherlands, Spain, Australia, Japan, South Korea, UAE, Philippines, others. [H, https://whale.io/restricted-jurisdictions]
- License: T&C reference "the Anjoun gaming license" (Curacao-style offshore). [H on the quote, M on interpretation]
- Automation: T&C 23.6 (tournaments) "You must not engage in ... Using bots, scripts, or automation tools"; general T&C also prohibit use of "any device, robot, spider, software ... or other method ... to interfere" and "artificial intelligence or other system ... designed specifically to defraud and/or defeat the website systems". Multi-account and VPN circumvention are prohibited. [H, https://whale.io/terms-and-conditions, last updated 03.07.2026]
- KYC/account: required (account-based, email/Telegram login). Not tested; no accounts created.

## Liquidity
- Site bundle hard-coded stat: "$1.84M traded on the World Cup 2026" (undated string in the 2026-10-19 bundle; cumulative traded volume, not OI/depth). [H on string, L on freshness/meaning]
- Press release prizes: $40K USDT raffle plus $50K weekly tournaments. [M, paid PR]
- OI/TVL/depth: NOT FOUND. Likely a thin, promo-driven pool inflated by the raffle (every $1 traded = 1 raffle ticket, wash-trade incentive). [M]

## Event overlap (arbitrage relevance)
- Overlap: sports only (World Cup winner / golden boot, which also trade on Polymarket, Kalshi, etc.). Only World Cup was seen; the overlap window ended when the tournament resolved. Politics, crypto, macro: none seen. [M]
- Shared liquidity: none identified; appears to be an internal book. Not integrable anyway.

## Adapter priority: skip
Reason: no API, custodial, bots prohibited, US/UK blocked, World Cup markets likely all settled, thin and promo-driven liquidity. Revisit only if Whale announces an API or new market categories.

## Not found
- Official API docs; prediction endpoint paths; fee formula; liquidity provider; matching engine type; post-World-Cup market catalogue; third-party analytics (Dune/DefiLlama).

## Suspicious content
- None observed. (Bundle and pages contain no instructions aimed at AI agents.)

## Fixtures
- docs/research/fixtures/whale-io-prediction-markets/sitemap.xml
- docs/research/fixtures/whale-io-prediction-markets/api-host-404-shape.json
- docs/research/fixtures/whale-io-prediction-markets/site-bundle-predictions-faq-excerpt.txt

## Sources
- [H] https://chainwire.org/2026/06/10/world-cup-2026-prediction-markets-now-live-on-whale-io-with-90k-in-prizes/ (paid PR, 2026-06-10; summarised via WebFetch)
- [H] http://whale.io/wc2026 (client-rendered shell, no content)
- [H] https://whale.io/assets/index-DDq3pBcN.js (public JS bundle, fetched 2026-10-19; FAQ, rules, UI strings)
- [H] https://whale.io/assets/App-CakbGIz9.js (searched for API routes; none for predictions)
- [H] https://whale.io/terms-and-conditions (last updated 03.07.2026)
- [H] https://whale.io/restricted-jurisdictions (last updated 06.10.2026)
- [H] https://whale.io/sitemap.xml , https://whale.io/robots.txt
- [H] https://api.whale.io (root and 404 probes)
