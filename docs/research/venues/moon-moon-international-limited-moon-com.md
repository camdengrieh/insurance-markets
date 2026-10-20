# Moon (Moon International Limited, moon.com) - venue spec

Researched 2026-10-19. Verdict: **skip** for the aggregator/arbitrage scanner. It is a house-banked leveraged up/down betting product, not a prediction market; it has no public API; its terms ban bots and arbitrage against its pricing; it prohibits the US.

Confidence tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Liveness
- [H] https://moon.com returns HTTP 200 and shows live prices (BTC, ETH, SOL, AAPL, TSLA) with navigation Overview / Bets / Watchlist / Chat / Public Leaderboard / Best Bets / Following and an Up/Down toggle.
- [M] Launched August 2026 (press release dated 28 Aug 2026; trade press 24-30 Sep 2026). Venue is about 2 months old, so there is no long track record.
- [M] Several reports say it is built by the Easygo group (Stake.com, Kick.com). One affiliate review; treat as unconfirmed.

## Kind and market model
- [H] Risk disclosure: bets on price movements of crypto, stocks, commodities and currencies, leverage 1x or greater; "Moon is the counterparty to every Bet"; the House keeps losing wagers and pays winning payouts. Each bet has a "Bust Price"; touching it settles the bet as lost; loss capped at the wager.
- [M] Marketing claims 1x-1000x leverage, 24/7 trading across 19 cryptos, metals, forex, US equities, index futures (win.gg, press releases). Terms only promise "1x or greater".
- Model: single-counterparty (house) leveraged up/down position. No order book, no AMM, no parimutuel pool, no tokenised outcome shares, no binary YES/NO contract with a probability price. Quoted "prices" are multipliers/bust levels, not probabilities.
- [M] "Moon Predicts" partnership (from the discovery hint): NOT FOUND. WebSearch budget was exhausted when I tried to verify; moon.com sitemap lists no predictions page. Treat as unverified.

## Chains and collateral
- [H] ToS s.2/6: deposits in "Supported Currencies" = cryptocurrencies and, where enabled, fiat; credited after blockchain confirmations. Custodial balance model with KYC/AML checks on withdrawal.
- NOT FOUND (searched: terms-of-service, risk-disclosure, homepage, win.gg review, sitemap): specific chains, tokens, or deposit addresses. A "Play Money" mode exists (M, win.gg).

## Read API
- Exists: **none documented**.
- [H] robots.txt: `Allow: /` with `Disallow: /api/`. Sitemap (H) lists only home, policies (privacy, cookies, terms, risk-disclosure, self-exclusion, affiliate-terms), /affiliate, /affiliate/faq, /affiliate/postbacks, /vip. No developer docs.
- [H] docs.moon.com does not resolve. api.moon.com resolves (behind Cloudflare, Express-style `Cannot GET /`), so a private backend API host exists, but it is undocumented. I did not probe it further: robots disallows /api/, and ToS bans automated tooling.
- Websocket: NOT FOUND. Markets/prices/trades/resolution endpoints: NOT FOUND. Rate limits: NOT FOUND.
- Fixtures: none saved (no public documented read API to sample).

## Trade path
- None. [H] ToS s.12.1(f)/12.2: users must place, modify and close bets manually; automated tools, scripts, bots prohibited without written permission, including "arbitrage against Moon's pricing", latency exploitation, and strategies to reduce the Performance Fee or eliminate downside risk; offending bets may be voided.
- PayBox reachability: **no**. Account-based custodial platform with off-chain positions; no on-chain contract, no signed-order scheme. At best a PayBox wallet could send a deposit to an address shown in the logged-in app, which is not a tradeable integration and needs KYC/account creation.

## Fees
- [H] ToS s.9.2: no spread on quoted prices; a "Performance Fee" is "the House's principal edge", calculated from short-term price movement and applied to profit before payout. Rate not published in the policy text.
- [H] Risk disclosure: periodic holding fees on bets open longer than 8 hours (per product spec on the platform).
- [M] win.gg: opening fee 1% of the bet (charged on wager, not exposure), re-charged on position change. Another review notes terms reserve "a spread or other pricing edge" (M, marvn/ambcrypto summary; conflicts with s.9.2 "no spread").
- All paid by the user to the house.

## Resolution and dispute risk
- [H] Settlement is automatic against "external market data"; no oracle named. Quotes may be delayed or wrong; manifestly erroneous-price bets may be voided or adjusted, and losses from such errors are not reinstated; gaps can settle through the Bust Price at worse than the last quote.
- [H] Disputes: complaints@moon.com first (30 days), then single-arbitrator UNCITRAL arbitration seated in Moroni, Comoros law; class actions waived. High counterparty and dispute risk (offshore, house is judge of its own prices).

## Geo / ToS / automation
- [H] Licence: Gaming Board of Anjouan, Union of the Comoros, no. ALSI-202601063-F12063 FI2 (risk disclosure). Entertainment product, no investor protection.
- [H] ToS s.3.2/3.5: not offered in a long list of countries including the US, UK, Australia, Brazil, France, Germany, Spain; IP, geolocation and VPN detection enforced. [M] ~40 countries plus Ontario excluded.
- [H] Bots/scripts/arbitrage prohibited (above).

## Liquidity
- NOT FOUND: no volume, OI, TVL or user numbers published (searched homepage, press release coverage, win.gg). House-banked, so "liquidity" is the house balance sheet, not a visible book. Bet size/exposure limits: NOT FOUND.

## Event coverage / overlap
- Crypto, stocks, commodities, FX up/down over arbitrary horizons. These overlap prediction-market price-threshold contracts in concept only (BTC above X by date), but Moon has no fixed-expiry binary payoff or probability quote, so there is no clean price-for-price comparison. No sports, politics or macro event markets found. Not a cross-venue arbitrage leg; at most a weak sentiment signal (public leaderboard / "Best Bets" are UI features, no data feed).

## Shared liquidity
- None with another venue; house is its own counterparty. Independent but non-hedgeable and non-accessible.

## Adapter priority: skip
No API, no tradeable path, bots/arbitrage explicitly banned, US prohibited, not a prediction market, thin track record.

## Open questions
- Whether a "Moon Predicts" prediction product or partner exists (unverified).
- Whether the affiliate postbacks page (/affiliate/postbacks) documents any data feed (affiliate-only, not fetched).
- Supported deposit chains/tokens.

## Sources
- https://moon.com (H, fetched 2026-10-19)
- https://moon.com/policies/risk-disclosure (H)
- https://moon.com/policies/terms-of-service (H)
- https://moon.com/robots.txt, https://moon.com/sitemap.xml (H)
- https://win.gg/what-is-moon-com/ (M, media explainer, fees/markets)
- WebSearch result snippets: yogonet.com 2026/09/25, ambcrypto.com, accessnewswire.com press release (403 on direct fetch), thecoinrepublic.com 2026/09/30, moonleverage.com/review and pokerwired.com/reviews/moon (affiliate reviews, L)
- Note: not related to MoonPay/PayBox despite the name.
