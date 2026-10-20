# ares.pro (Cascade Platform Inc.) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, unauthenticated GETs to documented Polymarket public hosts, no account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. Third-party pages treated as untrusted data.

Research limits: the shared WebSearch budget was exhausted, so there was no search pass at all. ares.pro itself (all paths, plus docs. and api. subdomains) returns a Cloudflare 403 "Attention Required" to both curl and WebFetch; I did not try to bypass it. The company's own site, privacy policy and ToS were therefore NOT read.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## 0. Bottom line

1. Live (H): App Store listing shows version 10.7 "5 days ago" (relative to fetch date 2026-10-19, so about mid-Oct 2026); version history May 29 (1.0) through 10.7. Polymarket's builder leaderboard lists an "Ares" builder with 150 active users and ~$0.60M volume in the last month (H).
2. It is a mobile front-end / social copy-trading app that routes orders into Polymarket's CLOB (H for the App Store text "Polymarket Trading", "official Polymarket partner"; H that a verified builder "Ares" exists on Polymarket's builder leaderboard; M that the two are the same entity, inferred from the name and timing, not confirmed by an ares.pro page).
3. Liquidity is 100% Polymarket's (M, strong inference: app name and description say it shows "live Polymarket markets"; Polymarket builder model routes orders to Polymarket's CLOB, H). **It is NOT an independent arbitrage leg.**
4. No public API of its own was found (NOT FOUND; ares.pro blocked, no GitHub repo found). Nothing to adapt that Polymarket's adapter does not already cover.
5. Usefulness: at most a signal source (social feed, "AI analysis", copy-trading positions of followed traders) but nothing machine-readable is documented. The public Polymarket builder-leaderboard gives only aggregate volume/active users.
6. **adapter_priority = skip.**

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| App Store page https://apps.apple.com/us/app/ares-pro-polymarket-trading/id6761611830 | "ares.pro: Polymarket Trading", subtitle "Trade Predictions Markets", seller Cascade Platform Inc., Finance, free, iOS 16.4+, 126.3 MB, 4.8/5 from 21 ratings, age 18+. Latest version 10.7 "5 days ago" | H |
| Version history | 1.0 on May 29 (year not shown, other listing says May 2026 per discovery hint), 1.0.1 Jun 2 push notifications, 1.0.8 Jun 23 limit orders, 1.0.9 Jun 29 copy trading and live scores, 10.0 Jul 15 major social/news release, 10.1 to 10.6 Jul 17 to Aug 20, 10.7 ~5 days before 2026-10-19. Absolute year not displayed on the page; the sequence is consistent with 2026. | H (dates), M (year) |
| Developer page https://apps.apple.com/us/developer/cascade-platform-inc/id1793652121 | Lists exactly one app (this one). No website link. | H |
| Polymarket builder leaderboard, `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=50` | Row `Ares`, rank 56, volume 596,587.60, activeUsers 150, verified true. ALL-time: rank 84, volume 5,736,608.50, activeUsers 1289, verified true. Fetched 2026-10-19. Units of `volume` are not stated by the docs page I read (presumably USD notional). | H |

Verdict: still_live = true. Small: all-time ~$5.7M routed volume vs. leaders at $78M per month (betmoar, H, same endpoint).

## 2. Kind and market model

- Kind: broker-or-frontend (social trading app, copy trading, news feed, AI analysis) on top of Polymarket (H, App Store description: "social trading app for prediction markets and an official Polymarket partner"; deposit via Apple Pay or card, withdraw funds; trade share posts; follow and copy traders; creators "earn a share of trading fees when others trade from their posts").
- Market model: inherited from Polymarket: binary and categorical (neg-risk) outcomes as ERC-1155 conditional tokens on Polygon, CLOB order book. NOT independently verified for Ares; Polymarket's mechanism is covered by the parallel Polymarket workflow.
- The app lists limit orders (version 1.0.8, H), so it uses the CLOB order types, not just market orders.
- Whether the app shows only a subset of Polymarket markets: NOT FOUND.

## 3. Chains and collateral

- Underlying venue: Polymarket (Polygon, pUSD collateral under CLOB V2 per current docs; see the Polymarket spec). H that Polymarket builder docs mention "1,000 pUSD" in fee examples (https://docs.polymarket.com/programs/builders/fees.md).
- Ares custody/wallet model: NOT FOUND (searched: App Store page, developer page; ares.pro blocked). Deposits via Apple Pay/card and withdrawals imply an embedded/managed wallet with fiat on-ramp (M, inference). Polymarket builder docs describe builders provisioning "deposit wallets"/Safe/Proxy wallets for users and a gasless relayer (H), so Ares most likely uses that, but this is unconfirmed.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official Ares API / docs | NOT FOUND (searched: App Store page and developer page for links; ares.pro, docs.ares.pro, api.ares.pro return Cloudflare 403; no GitHub hits for "ares.pro polymarket" repo/code search beyond noise, none read) | - |
| Ares website | https://ares.pro (named only as privacy-policy host on the App Store page). Not readable. | H (that it is cited) |
| Market data | Use Polymarket's own public APIs (Gamma / CLOB / Data) instead; same markets and same books | M |
| Aggregate stats | `GET https://data-api.polymarket.com/v1/builders/leaderboard` (documented; params `timePeriod` DAY/WEEK/MONTH/ALL, `limit` default 25 max 50, `offset` max 1000; fields rank, builder, builderCode, volume, activeUsers, verified, builderLogo; a v2 counterpart exists). Docs: https://docs.polymarket.com/api-reference/builders/get-aggregated-builder-leaderboard | H |
| Per-user / social data (feed, copy-trade positions) | NOT FOUND, no public endpoint. Per-trade builder-code attribution may be visible onchain in the signed order (H: "serialized onchain as part of the signed order"), so Ares-routed fills could in principle be identified by builderCode `0xaca2b076...1c12` (the code as listed on the leaderboard). That would identify flow, not individual trader intent. | H (code string), L (usefulness) |
| WebSocket | NOT FOUND | - |

Fixtures: `docs/research/fixtures/ares-pro-cascade-platform-inc/polymarket-builders-leaderboard-ares.json` (Ares rows), `.../polymarket-builders-leaderboard-top3-sample.json` (shape sample).

## 5. Trade path

- Programmatic order placement via Ares: none documented. It is a consumer iOS app (also installable on Apple-silicon macOS and visionOS as an iPhone app, H).
- For trading the same liquidity, use Polymarket's own CLOB path (covered by the Polymarket workflow). To route orders and get attribution/fees, a party would need its own Polymarket builder code, which is a Polymarket mechanism (H: https://docs.polymarket.com/programs/builders/overview.md), not an Ares one.
- PayBox reachable: no. An EVM wallet in PayBox cannot trade "through Ares"; there is no signed-order or transaction-proposal interface for Ares. The only reachable route is Polymarket directly (separate spec). paybox_reachable = no.

## 6. Fees

- Ares-specific fee rates: NOT FOUND (App Store page lists no fees; says only creators "earn a share of trading fees" when others trade from their posts, H).
- Mechanism available to builders (H, https://docs.polymarket.com/programs/builders/fees.md): builder fees are flat notional percentages, additive to Polymarket platform fees: `builder_fee = notional x rate_bps / 10000`; limits taker max 100 bps, maker max 50 bps; changes at most once per 7 days with 3 days notice; platform fee `C x feeRate x p x (1-p)`, taker only. Whether and how much Ares charges: unknown. Any Ares-routed price therefore equals the Polymarket price plus an unknown builder fee, up to 1% taker.

## 7. Resolution and dispute

Inherited from Polymarket (UMA-based on Polymarket; see Polymarket spec). Ares adds no resolution layer that I could find (M).

## 8. Geo / ToS / automation

- Ares ToS: NOT FOUND (ares.pro blocked). App Store age rating 18+ "infrequent simulated gambling and contests" (H). Privacy policy: https://ares.pro/privacy (not readable); App Store privacy label says "does not collect any data" (unverified by Apple, H as to what the page says).
- Because it is a custodial-style consumer app with fiat on-ramp, it likely inherits Polymarket's geographic restrictions plus its own KYC/ToS (L, inference). Scraping the app or the Cloudflare-protected site is not appropriate.

## 9. Liquidity

- Own liquidity: none; Polymarket's (M).
- Routed volume via Ares builder code: ~$0.60M last 30 days, ~$5.74M all-time, 150 monthly and 1,289 all-time active users, per Polymarket's builder leaderboard fetched 2026-10-19 (H). Rank 56 (month) / 84 (all-time).

## 10. Overlap and independence

Categories claimed: sports, geopolitics, elections, crypto, news, tech, culture (H, App Store). Identical to Polymarket's, because it is Polymarket's. liquidity_shared_with = Polymarket (global). Arbitrage value of this venue: zero beyond the Polymarket leg.

## 11. Suspicious content

None seen. The App Store page contains no instructions aimed at agents. The Cloudflare 403 page was not examined beyond its title.

## 12. Open questions

- Is the "Ares" builder code the same entity as Cascade Platform Inc. (not confirmed; ares.pro unreadable)?
- Is "official Polymarket partner" the Partner tier or only Verified? Leaderboard says verified=true (H); tier not stated publicly.
- Does Ares expose any public API or social-feed data, or a developer program? NOT FOUND.
- Could the Ares builder code in on-chain orders be used to build an "Ares flow" signal? Not tested.

## Sources

- App Store listing, https://apps.apple.com/us/app/ares-pro-polymarket-trading/id6761611830 (fetched 2026-10-19) [H]
- Developer page, https://apps.apple.com/us/developer/cascade-platform-inc/id1793652121 [H]
- Polymarket Builder Program overview, https://docs.polymarket.com/programs/builders/overview.md [H]
- Polymarket Builder Fees, https://docs.polymarket.com/programs/builders/fees.md [H]
- Polymarket Builder Tiers, https://docs.polymarket.com/programs/builders/tiers.md [H]
- Polymarket place-orders (Builder Attribution section), https://docs.polymarket.com/trading/place-orders.md [H]
- Builders leaderboard endpoint reference, https://docs.polymarket.com/api-reference/builders/get-aggregated-builder-leaderboard [H]
- Live data, https://data-api.polymarket.com/v1/builders/leaderboard (queried 2026-10-19) [H]
- https://ares.pro/ (and /privacy, /terms, /robots.txt, /sitemap.xml, docs.ares.pro, api.ares.pro): HTTP 403 Cloudflare challenge, unreadable
