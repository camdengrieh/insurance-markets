# Viral Markets (Viral Markets Ex Inc.) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the App Store page and of three public legal pages on viralmarkets.com, the public iTunes lookup API, public unauthenticated GETs (viralmarkets.com HTML shell, its public static JS bundle, and one GET of the app's own `/markets/active` endpoint), no account, no wallet, no key, no signature, no POST/PUT/DELETE, no PayBox tool. The shared WebSearch budget was exhausted, so discovery used zero web searches; everything below comes from first-party pages and the first-party client bundle. Third-party content was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/viral-markets-viral-markets-ex-inc/markets_active_gc.sample.json` (2 of 26 markets, creator handles and media URLs redacted).

---

## 0. Bottom line

1. **Live (H).** Apple lookup shows release 2026-08-07, current version 1.0.0 dated 2026-09-02; `viralmarkets.com` returned HTTP 200 with a build last modified 2026-10-18; `/markets/active` returned 26 markets, all `status: active`, with trading windows closing within the next ~5.4 hours of the request (2026-10-19 05:01 UTC).
2. **It is a sweepstakes-casino style product, not a prediction exchange (H).** Two currencies: "Gems" (purchased, no cash value) and "Sweeps Cash" (SC, redeemable for cash prizes after KYC). The App Store listing only mentions Gems and "entertainment only"; the web client and legal pages reveal the SC / prize-redemption layer. The hint's "entertainment only, non-redeemable" is true of Gems only, and incomplete.
3. **Market model:** TikTok video "will this reach N views by time T" Yes/No markets, a fixed-ask server-quoted price with ~10% overround (askYes + askNo = 1.10 on all 26 markets). No order book, no on-chain tokens.
4. **No official API, no docs.** The only read endpoint is the app's own undocumented backend, which happens to answer unauthenticated GETs. Trading is over an authenticated WebSocket (Supabase JWT). Not a stable integration surface.
5. **Terms ban bots, scraping and automation, bar all of non-US, and exclude 12 US states (H).** A wallet in PayBox cannot trade it at all.
6. **No overlap with other venues.** Questions are about individual TikTok videos' view counts. There is nothing to arbitrage against Polymarket/Kalshi/XO.
7. **adapter_priority = skip.**

---

## 1. Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| App | "Viral Markets: Trade on Trends", bundle id `com.viralmarkets.app`, Entertainment, free, 12+, iOS 15.1+, 0 ratings | H (https://itunes.apple.com/lookup?id=6759232496&country=kr ; https://apps.apple.com/kr/app/viral-markets-trade-on-trends/id6759232496) |
| Developer | Viral Markets Ex Inc. (developer id 1789242408) | H |
| Dates | Released 2026-08-07; v1.0.0 updated 2026-09-02 ("Smoother video playback, bugfixes, likes, and more!") | H |
| Official website | `https://viralmarkets.com` (Expo / react-native-web SPA, hosted on Vercel, title "Viral Markets"). The App Store page lists no developer website, so the link between the store listing and this domain is via the Sweepstakes Rules ("Viral Markets Ex Inc. ... operating viralmarkets.com") and the CSP allowing TikTok/Instagram frames. The hint's "official website NOT FOUND" is superseded. | H (https://viralmarkets.com/legal/sweepstakes-rules) |
| Legal pages | `/legal/terms-of-use` (v1.0, updated 2026-06-12), `/legal/sweepstakes-rules`, `/legal/gameplay-rules`, `/legal/privacy-policy`, `/legal/responsible-gaming`; client-side constant date `2026-06-15` | H |
| Contact | `contact@viralmarkets.com` (published by the venue) | H |
| Sponsor address | Mail-in address in Princeton, NJ (campus-style address, i.e. likely a student-founder startup; inference) | H for the address, L for the inference |
| Discord | a `discord.gg/...` invite is embedded in the bundle; not visited | H (exists), not read |

## 2. Kind and market model

- **kind:** forecasting / social-media view-count markets, sweepstakes model (Gems = "GC", Sweeps Cash = "SC"). (H: App Store description; bundle balances `gc`, `scUnplayed`, `scRedeemable`.)
- **Question template:** "Will this reach {N} views?" for one TikTok video; a video gets a ladder of goals ("rungs", `rungIndex` 0..11, `isCurrentVideoRung`). Yes/No binary only. (H: bundle `mapSnapshotToDisplayMarket`; live response.)
- **Pricing:** server-quoted per-side ask prices as decimal strings (`askYes`, `askNo`), plus `quoteVersion` / `expectedPrice` for optimistic-concurrency on trades. Observed `askYes + askNo = 1.10` on all 26 markets, i.e. a ~10% built-in margin. How the quote is computed (AMM, LMSR, house book, pari-mutuel) is NOT FOUND (searched: gameplay rules, terms, sweepstakes rules, client bundle). The client hardcodes `volume: 0` so no volume is exposed. (H for the observation, M for "house-quoted".)
- **Tokenisation:** none. Positions are rows in the venue's database ("shares", "quantity", "execution_price", "cost" in the trade response mapper). (H)
- **Categories:** the 26 live markets were Sports 9, Streamer 4, Relatable 4, Goon 3, Edits 2, Comedy 2, Pranks 1, Giftok 1. These are TikTok content categories, not event categories. (H)

## 3. Chains and collateral

- No chain. No smart contract, no token. (NOT FOUND, searched: bundle, terms, store page, GitHub not searched because no repo is linked.)
- Money in: Gems are bought in packs; terms say purchases are in USD "and may be paid by USDC or other cryptocurrency at the Company's discretion" (Terms s6.6, H via WebFetch summary of https://viralmarkets.com/legal/terms-of-use). Client UI hints at card / PayPal / Venmo / Cash App rails (M: icon map in bundle). Supabase's `signInWithEthereum/Solana` strings in the bundle are library defaults, not evidence of wallet login (the app says sign in with email, Google or Apple).
- Money out: SC "won through play" redeemable as prizes, minimum $20, maximum $5,000 per monthly entry period, one request per 5 days, up to 30 days processing, KYC (ID, face scan, proof of address, SSN). (H via WebFetch summary of https://viralmarkets.com/legal/sweepstakes-rules)

## 4. Read API

- **exists:** `unofficial-only` in the sense that it is undocumented and for the app's own use, but one endpoint is open without auth. No docs URL, no OpenAPI, no developer portal. (NOT FOUND, searched: viralmarkets.com root and legal pages, bundle.)
- **Base:** `https://viral-markets-fullstack-v2.onrender.com` (Render-hosted behind Cloudflare), WebSocket `wss://viral-markets-fullstack-v2.onrender.com/ws`. Auth service `https://auth.viral-markets.com` (Supabase-style). Analytics: PostHog. Assets: Cloudflare R2. (H: bundle strings; the host name suggests a v2 rewrite and is liable to change.)
- **Endpoints seen in the client bundle:**
  - `GET /markets/active?currencyMode=gc|sc` - list of active markets. Works with no Authorization header (HTTP 200, 22.7 KB, 26 markets, tested once). (H)
  - `GET /leaderboards?type=&currencyMode=&timeFilter=all_time&limit=` - leaderboard entries (user handles; not fetched, personal data of third parties). (H that it exists in client, not called)
  - WebSocket messages: `request_feed`, `subscribe_market`, `get_balance`, `get_portfolio`, `place_trade` (authenticated with the user's JWT). Not called. (H for names)
- **Response shape (H, fixture):** `{ "markets": [ { marketId (uuid), videoKey, rungIndex, isCurrentVideoRung, category, creatorUsername, videoUrl, r2VideoKey, thumbnailUrl, currentViewcount, commentCount, likeCount, shareCount, viewcountGoal, askYes "0.59", askNo "0.51", quoteAvailable, quoteVersion?, dataVersion, currencyMode, status "active", videoPostedAt, tradingOpensAt, tradingClosesAt, resolvesAt, timeRemaining (s) } ] }`. No pagination, no volume, no depth, no trade history.
- **Resolved/settled history:** the client reads `outcome`, `finalViewcount`, `settledAt`, `cancelReason` but the active list does not expose resolved markets. Historical endpoint NOT FOUND.
- **Rate limits:** none documented; no rate-limit headers seen. (H: response headers)

## 5. Trade path

- Programmatic: the app trades by sending `place_trade {marketId, side yes|no, amount, currencyMode, expectedPrice, quoteVersion, deviceGps}` over the WebSocket with the user's session JWT. In `sc` mode the client attaches a `deviceGps` reading (geolocation compliance), and KYC gates trades. (H: bundle)
- No documented API keys, no signed orders, no on-chain path. Using this would mean automating a consumer account against an undocumented private protocol, which the Terms prohibit (section 7). Not recommended and not attempted.
- **PayBox reachability: no.** There is no contract to call and no signed-order scheme. A PayBox EVM/Solana wallet cannot hold positions; at best a wallet could pay USDC to buy Gems if the operator enables it, which would be a deposit to an entertainment currency that cannot be withdrawn as cash (Gems) - not trading.

## 6. Fees

- No explicit fee schedule: "Fees: Not mentioned" in the Gameplay & Market Rules. (H)
- Implicit cost: ~10% overround (askYes + askNo = 1.10), paid by the trader on every position. (H for the observation; M for the interpretation as a house margin.)
- Prize redemption: "Sponsor may charge handling or payment processing fees". (H)

## 7. Resolution and dispute risk

- Resolves on the TikTok view count of the video at `resolvesAt` (observed 24h after `videoPostedAt`); trading closes earlier (`tradingClosesAt`, here ~1.5h after listing). (H: fixture)
- Rules: social-media data "may be delayed, unavailable, revised, deleted, restricted, manipulated, or otherwise unreliable"; if the video is deleted, hidden or edited the operator may "resolve, cancel, void, or modify the market in its sole discretion"; no formal dispute process; decisions "final and binding". Data source for the count is apparently a scraper (thumbnail URLs point at an Apify key-value store). (H: https://viralmarkets.com/legal/gameplay-rules; M: Apify inference from the thumbnail URL)
- Dispute risk: high. Centralised, discretionary, arbitration (JAMS, New York) under Delaware law, 10-day written notice period. (H: terms summary)

## 8. Geo / ToS / automation

- US residents 18+ only. Excluded: California, Connecticut, Idaho, Indiana, Louisiana, Maine, Michigan, Montana, Nevada, New Jersey, New York, Tennessee, and anywhere outside the US. (H: Sweepstakes Rules, Terms s3.4). The App Store page is on the Korean storefront but the service itself is US-only; the store page shows "Some features may vary by region" in the app. (H, bundle string)
- Terms s3.7 bans "software-assisted methods or techniques" including bots; s2.7.8 bans scraping or building databases from the service; s2.7.5 bans reverse engineering; one account per person (s4.2); coordinated play bannable (s4.13). APIs are not named. (H: terms summary, WebFetch small-model summary so verify wording before relying on exact section numbers; M for the numbering.)
- Reading the open `/markets/active` endpoint at low rate is technically possible, but systematic scraping into an aggregator database collides with s2.7.8. Do not build a production adapter on it without written permission from the operator.

## 9. Liquidity

- Volume, open interest, TVL: NOT FOUND (searched: API response, client bundle, store page, legal pages). The client hardcodes `volume: 0`.
- Scale indicators only: 26 simultaneously active short-dated markets; App Store listing has 0 ratings (as of 2026-10-19); app is 7 weeks old. Gems are not cash, so "liquidity" is the operator's quote, not an independent pool. (H)

## 10. Event overlap and shared liquidity

- Overlap with other venues: effectively none. The markets are individual-TikTok-video view thresholds. The "Sports" category (9 of 26) is sports-themed TikTok clips, not game outcomes (M: category label only; titles not shown).
- Shared liquidity: not shared with any prediction venue; the house quotes the price. It is not a tradable arbitrage leg because it is a custodial, geo-fenced, sweepstakes product.
- Possible signal use: view-count trajectories (`currentViewcount` vs `viewcountGoal`) could in theory feed a social-virality signal. Very weak and ToS-restricted. Quotient's relation is not established.

## 11. Suspicious content

None found. The public JS bundle contains a localhost URL, third-party library text and an embedded Discord invite; no instructions aimed at agents were seen.

## 12. Open questions

- Pricing engine (LMSR/AMM/house) and whether SC and Gem markets share a pool or price (the endpoint takes `currencyMode` and returns the same listings with possibly different quotes; only `gc` was fetched).
- Whether the operator has a developer or partner program (no evidence).
- Whether the exclusion list of 12 states grows (the bundle contains a US state map used for geo-blocking).
- Legal status as a sweepstakes (states increasingly ban "sweepstakes casinos" in 2026); regulatory shutdown risk is real but not researched.

## Sources

1. https://apps.apple.com/kr/app/viral-markets-trade-on-trends/id6759232496 (WebFetch, H)
2. https://itunes.apple.com/lookup?id=6759232496&country=kr and `&country=us` (curl, public Apple API, H)
3. https://viralmarkets.com (HTML shell, response headers incl. CSP and `last-modified: 2026-10-18`, H)
4. https://viralmarkets.com/_expo/static/js/web/index-cb26798c624d43a0b1edfc6763098d06.js (public client bundle, grep only, not executed; H for strings quoted)
5. https://viralmarkets.com/legal/gameplay-rules , /legal/sweepstakes-rules , /legal/terms-of-use (WebFetch; summarised by a small model, so exact clause numbers are M)
6. https://viral-markets-fullstack-v2.onrender.com/markets/active?currencyMode=gc (one unauthenticated GET, 2026-10-19, H)
