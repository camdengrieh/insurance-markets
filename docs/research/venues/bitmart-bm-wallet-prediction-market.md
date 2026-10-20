# BitMart BM Wallet prediction market - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page and API reads, unauthenticated GETs only, no account, wallet, key, signature or PayBox tool. All third-party pages were treated as untrusted data; nothing in them was followed. WebSearch had one working call early on, then the shared session budget ran out, so no further press or analytics search was possible. The BitMart support centre sits behind a Cloudflare challenge and was not bypassed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, mirrored press release, small-model page summary, or my inference; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/bitmart-bm-wallet-prediction-market/` (section 12).

---

## 0. Bottom line

1. **This is not an independent venue. It is a Polymarket front end inside a mobile wallet.** The launch press release says: "Under the hood, BM Wallet taps into Polymarket - the world's largest prediction market - bringing its deep liquidity and broad range of markets directly into the self-custodial wallet, with no separate Polymarket account to create and no assets to move out." (M: GlobeNewswire release, read through the Manila Times and Florida Finance Today mirrors; the wording was also read in a CoinTrust summary: "built on infrastructure provided by Polymarket".) So it shares liquidity with Polymarket and is not a separate arbitrage leg.
2. **No API, no docs, no contracts of its own.** BM Wallet publishes no developer documentation, no REST/WebSocket feed, no contract addresses and no market list (NOT FOUND, searched: bmwallet.io, wallet.bm.xyz, docs.bm.xyz, /llms.txt, /sitemap.xml, App Store and Google Play listings, X profile).
3. **Liveness of the prediction feature in October 2026 is unconfirmed.** The wallet app is live and listed (H). The newest first-hand evidence that predictions exist is the App Store release notes of version 1.2.0 dated 2026-07-20 (H) and two X posts from 2026-07-25/26 saying "Round 3 closes Jul 31" (H, but from an undated logged-out snapshot). The World Cup flagship category and the BitMart "World Cup Arena" promo (2026-06-08 to 2026-07-20, M) are over. The current bmwallet.io landing page does not mention predictions at all (H).
4. **adapter_priority = skip.** Zero independent liquidity, zero API, and any BM Wallet trade would carry an extra builder fee on top of what a direct Polymarket order costs. If the aggregator wants this flow it should use the Polymarket adapter (covered by another workflow).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Launch | GlobeNewswire release dated 2026-07-06 (New York): "BM Wallet, a decentralized, self-custodial Web3 wallet, today launched its prediction markets feature ... available in select regions, debuting with the World Cup" | M (mirror: https://www.manilatimes.net/2026/07/07/tmt-newswire/globenewswire/focusing-on-on-chain-native-prediction-markets-bm-wallet-launches-prediction-markets-reimagining-the-web3-user-experience/2379401, fetched with curl and read) |
| Bitget-mirrored Coincu article | 2026-07-06, says BitMart confirmed via an official support page and an X post by a BitMart representative; mechanics not detailed; no URLs for the support page or X post | H that the article says this (https://www.bitget.com/news/detail/12560605491031); the support page itself NOT FOUND |
| App Store listing | `BM Wallet: Crypto & BTC Wallet`, bundle `com.bitmart.bmwallet`, seller OpenBay Digital Ltd., first released 2026-07-02, current version 1.2.0 released 2026-07-20. Release notes: "Enhanced prediction markets with aggregated crypto price trends ... Referral and prediction market events are now live". 2 ratings (5.0). Lookup fetched 2026-10-19 | H (`https://itunes.apple.com/lookup?id=6763230216`; fixture) |
| Google Play listing | `com.bitmart.wallet`, "Updated on Jul 24, 2026", 100+ downloads, What's new: "Now supporting Robinhood Chain". The description does not mention predictions | H (https://play.google.com/store/apps/details?id=com.bitmart.wallet&hl=en) |
| X profile `@BM_Wallet` | Bio "Your money, your rules. Self-custody made simple. Spend · Swap · Predict · Grow". Posts visible in the logged-out page: 2026-07-25 "Round 3 of the prediction campaign is live through Jul 31", 2026-07-26 "Round 3 closes Jul 31". Nothing later was visible; the snapshot may be a stale cache | H (https://x.com/BM_Wallet) |
| Landing page | https://www.bmwallet.io (also https://wallet.bm.xyz) "BM Wallet is live worldwide": features are DEX trading, self-custody, smart-money signals, prepaid card. No mention of predictions | H |
| bitmart.com exchange | `https://www.bitmart.com/predict/sports/fifa-world-cup` and `/predict` return HTTP 404 to curl; the en-US homepage shows no prediction nav item (WebFetch summary) | H (404); M (nav) |

Verdict: **still_live = true for the wallet, unconfirmed for the prediction feature after 2026-07-26.** Treat as "possibly dormant after the World Cup campaign". Confidence in the liveness verdict is low.

Identity: BM Wallet is a BitMart-family product (bundle id `com.bitmart.bmwallet`, store seller OpenBay Digital Ltd., British Virgin Islands address on the Play listing; the legal footer says "BM Wallet Inc."). The "BM.XYZ" site (docs.bm.xyz) is a different product, a perps/spot order-book DEX on "BM Chain" in testnet, with no prediction markets in its docs index (H: https://docs.bm.xyz/llms.txt).

---

## 2. Kind and market model

- **Kind (M):** cex-product / wallet-embedded aggregator front end ("kind=cex-product" in discovery is loosely right: BitMart brand, but the product is a self-custody mobile wallet, not the BitMart exchange).
- **Market model (M, inherited from Polymarket):** binary and categorical Polymarket markets, central limit order book, outcome tokens are Polymarket conditional tokens (ERC-1155 on Polygon). BM Wallet itself does not document its own model. Third-party text says "each outcome is represented by a contract priced between 0 and 1 USDT" (M, from a search summary of BitMart's own page, not read first-hand), consistent with Polymarket share pricing.
- Crypto "up or down" markets are promoted (X post 2026-07-25 "Bitcoin. Up or down?", H), which matches Polymarket's short-term crypto markets.
- Categories named in the release: World Cup (flagship), crypto, politics, "more" (M).

---

## 3. Chains and collateral

- **Collateral:** "stablecoin" only ("positions and payouts are denominated in stablecoin", M). Which stablecoin and which settlement chain: NOT FOUND (searched: release, mirrors, store listings, landing page).
- **Wallet chains (H):** landing page lists Solana, BNB Chain, Ethereum, Arbitrum, Base; Play listing adds Robinhood Chain. Polygon, where Polymarket settles, is not on the list. How a BM Wallet user funds a Polymarket position (bridge, relayer or deposit address) is NOT FOUND.
- Architecture: externally owned account (EOA), no private keys stored by the company (M, release).

---

## 4. Read API

**None.** exists = `none`.

- NOT FOUND (searched: bmwallet.io, wallet.bm.xyz, docs.bm.xyz/llms.txt, bmwallet.io /llms.txt /sitemap.xml /robots.txt (all 404), App Store and Play listings, X bio, press release). No docs URL, no base URL, no websocket.
- The bmwallet.io terms and privacy pages are client-rendered shells with no legal text in the HTML or in the page's JS chunk, so ToS content could not be read (WebFetch confirmed no text).
- **Alternative for data:** the underlying Polymarket Gamma/CLOB/Data APIs (covered by the Polymarket workflow). Polymarket's public builder leaderboard (`GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=N`, H, unauthenticated) lists 592 builders; none is named BM Wallet, BitMart or OpenBay (fixture). That means BM Wallet volume cannot be isolated from the public feed (M: it may use no builder code, an unlisted code, or a differently named profile).

---

## 5. Trade path

- **Programmatic: none.** Orders are placed by the human in the mobile app (iOS/Android), signed locally by the wallet's EOA ("Every transaction is signed locally by you", H, store listings). No agent, order or signing API is published.
- **PayBox reachability: no.** A PayBox wallet cannot drive a BM Wallet in-app account. If the goal is exposure to the same book, a PayBox-controlled EVM wallet can trade Polymarket directly (see the Polymarket spec), without BM Wallet's extra fee. paybox_reachable = no.

---

## 6. Fees

- BM Wallet prediction-market fee: **NOT FOUND** (searched: release - "Fees: not stated for prediction markets", store listings, landing page). The release's "no annual fees or top-up charges" refers to the prepaid card (M).
- If BM Wallet routes through Polymarket's builder program, it can add a flat builder fee on top of Polymarket's own fee: taker default 0 bps, max 100 bps (1%); maker default 0 bps, max 50 bps; builder fees "stack on top of platform fees, never replace them" (H: https://docs.polymarket.com/programs/builders/fees.md). Whether BM Wallet charges one is unknown (M for the mechanism, NOT FOUND for BM Wallet's rate).

---

## 7. Resolution

Not documented by BM Wallet. The release only says winnings "settle automatically to the user's prediction-market account once an outcome is confirmed" (M). Given the Polymarket dependency, resolution and dispute risk are Polymarket's (UMA-based oracle per Polymarket's own docs; covered by the Polymarket spec; not re-verified here). Additional BM Wallet-specific risk: an off-platform "prediction-market account" and automatic settlement imply some account layer between the EOA and Polymarket, details unknown (M).

---

## 8. Geo, ToS, automation

- "Available in select regions, and not offered in certain countries and territories. Users are advised to check availability in their region first" (M, release). The specific list is NOT FOUND. A CoinTrust summary said the wallet is "live worldwide" while the prediction feature is more limited (M).
- Play listing: rated 18+; "Some features - including the prepaid crypto card - vary by region and eligibility" (H).
- Terms of service: could not be read (client-rendered, no text retrieved). Automation/bot rules: NOT FOUND.
- Because Polymarket's own geoblocks presumably apply upstream, US users are likely excluded (L, inference; not verified for BM Wallet).

---

## 9. Liquidity

- No BM Wallet-specific volume, OI or TVL published (NOT FOUND, searched: release, stores, landing page, Polymarket builder leaderboard for 592 builders).
- Adoption signals: Play "100+ downloads" (H, 2026-10-19); App Store 2 ratings (H, 2026-10-19). Both suggest a very small user base (M).
- Depth is whatever Polymarket's order book has (the release markets "deep liquidity" - promotional, M).
- Comparison point: Bitget Wallet's Polymarket integration is rank 27 on the builder leaderboard with $44.9M all-time volume and 32,357 active users (H, fixture, 2026-10-19); BM Wallet does not appear.

---

## 10. Event overlap and independence

- All categories (sports, politics, crypto price, macro/social) are Polymarket's markets. **Overlap with every other venue is exactly Polymarket's overlap, and it is the same book**, so no incremental arbitrage leg. `liquidity_shared_with = Polymarket (CLOB), per the launch press release`.
- The one residual use is nil: no BM-specific price, no BM-specific flow data.

---

## 11. Open questions (only worth chasing if the product matters later)

1. Does the in-app prediction feature still exist in October, and is it live outside the World Cup campaign?
2. Which chain and stablecoin does it settle in, and how does a non-Polygon EOA reach Polymarket (bridge, relayer, proxy wallet)?
3. What are the fees (builder code and rate)?
4. The BitMart support-page announcement and the BitMart representative's X post cited by Coincu (URLs not given in the article).
5. The `bitmart.com/predict/...` pages that appeared in a search result return 404 to curl; were they removed, or geo-gated?

---

## 12. Fixtures

In `docs/research/fixtures/bitmart-bm-wallet-prediction-market/` (no BM Wallet API exists, so these are evidence, not venue responses):

- `itunes_lookup_bm_wallet_2026-10-19.json` (8 KB): Apple lookup for the BM Wallet app, shows version 1.2.0, 2026-07-20 release notes mentioning prediction markets.
- `polymarket_builders_leaderboard_page1_2026-10-19.json` (15 KB): first page of Polymarket's public builder leaderboard (shape reference; Bitget Wallet and MetaMask appear, BM Wallet does not).
- `polymarket_builders_absence_check_2026-10-19.json` (<1 KB): result of paging all 592 builders for names containing "bm", "bitmart" or "openbay" (no matches).

---

## Sources

| # | URL | Used for | Tag |
|---|---|---|---|
| 1 | https://www.bitget.com/news/detail/12560605491031 | Coincu article mirror, 2026-07-06; BitMart confirmed launch; mechanics not detailed | H (page read; claims in it M) |
| 2 | https://www.manilatimes.net/2026/07/07/tmt-newswire/globenewswire/focusing-on-on-chain-native-prediction-markets-bm-wallet-launches-prediction-markets-reimagining-the-web3-user-experience/2379401 | Full GlobeNewswire release text incl. the Polymarket sentence, stablecoin, select regions, EOA | H (read), M (promotional content) |
| 3 | https://www.floridafinancetoday.com/article/924843992-focusing-on-on-chain-native-prediction-markets-bm-wallet-launches-prediction-markets-reimagining-the-web3-user-experience | Same release, confirms Polymarket sentence | M |
| 4 | https://www.cointrust.com/market-news/bm-wallet-launches-self-custodial-prediction-markets | "built on infrastructure provided by Polymarket", published 2026-07-07 | M |
| 5 | https://itunes.apple.com/lookup?id=6763230216 | App version, dates, release notes | H |
| 6 | https://play.google.com/store/apps/details?id=com.bitmart.wallet&hl=en | Updated Jul 24 2026, chains, 100+ downloads | H |
| 7 | https://www.bmwallet.io and https://wallet.bm.xyz | Landing page: features, 5 chains, no mention of predictions | H |
| 8 | https://x.com/BM_Wallet | Bio "Spend · Swap · Predict · Grow"; 2026-07-25/26 posts about prediction campaign round 3 | H (snapshot of unknown age) |
| 9 | https://docs.bm.xyz/llms.txt | Separate BM.XYZ product (perps DEX on BM Chain testnet), no prediction docs | H |
| 10 | https://data-api.polymarket.com/v1/builders/leaderboard (public GET) | Builder list scan, 592 rows, no BM Wallet | H |
| 11 | https://docs.polymarket.com/programs/builders/fees.md | Builder fee mechanism and limits | H |
| 12 | WebSearch (extended) result summary listing tradersunion.com articles (World Cup Arena 2026-06-08 to 2026-07-20, 880,000 USDT pool, "0 to 1 USDT" contract wording) | Promo context only; the tradersunion pages returned HTTP 403 and were not read | L/M |
| 13 | https://coincu.com/bm-wallet-launches-prediction-market-world-cup-sector/ | Original article; HTTP 500 both times, not read | not read |
| 14 | https://support.bitmart.com/hc/en-us (Zendesk) | Cloudflare challenge ("Just a moment..."); not bypassed | not read |

Privacy check: all scripted requests used the User-Agent `insurance-markets-research/0.1`; no scripts contained "@" or personal identifiers; no contact address was supplied anywhere. The Play listing shows a third-party developer support email which is deliberately not copied here.
