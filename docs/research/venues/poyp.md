# POYP (poyp.app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs of the marketing site, the App Store lookup API and the Google Play listing; WebFetch of press pages; no account, no app install, no wallet, no key, no signature, no PayBox tool. Third-party pages were treated as untrusted data; nothing in them was followed. WebSearch ran once (extended) and then hit the shared session budget, so no further press or analytics coverage was read. The Terms of Service and Privacy Policy are Notion pages that render client-side and could not be read (section 9).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference; **L** = weak, stale or contradicted.

Fixtures (<= 50 KB each): `docs/research/fixtures/poyp/` (section 12). There is no market-data API, so the fixtures are app-store metadata only.

---

## 0. Bottom line

1. **Live, but it is a closed consumer points game, not a market venue.** Japanese app by 株式会社POYP (founded 2026-02-18); iOS release 2026-03-03, current iOS build 1.3.9 released 2026-08-28, Android updated 2026-08-22, site deployed on Vercel and still serving on 2026-10-19. (H)
2. **No money, no crypto, no wallet.** Users earn "coins" for correct predictions and redeem them for gift cards (Amazon, PayPay and similar) via the third-party redemption service "えらべるPay". The site and store listings say it is "not a real money gamble". (H)
3. **No read API, no trade path, no docs, no developer programme.** The only public surface is a static landing page, store listings and two Notion legal pages. No `api.` host (the `api.poyp.app` name resolves to the same Vercel 404 as any other path), no GitHub repo, no sitemap. (H for the landing page and the 404s; NOT FOUND for any API beyond that.)
4. **Not reachable through PayBox.** There is nothing on-chain to propose a transaction against and nothing to sign. Points cannot be bought, sold or withdrawn as value. (H)
5. **adapter_priority = skip.** Even the odds shown in the app (e.g. "67% / 33%") are presumably user-vote aggregates on a points game (M); they are not tradable prices, and the sole way to read them is the mobile app, which this task forbids automating and which the Terms may prohibit (unread). Revisit only if POYP ships a public data feed or a real-money product (the founder says he wants one if Japan legalises it, M).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Landing page | `https://poyp.app/` -> HTTP 200, `server: Vercel`, `© 2026 POYP`; `/company`, `/business`, `/contact` all 200; `/robots.txt` and `/sitemap.xml` -> 404 | H |
| Site deploy | the 404 page was last modified Fri, 16 Oct 2026 22:11:30 GMT (response header, i.e. a deploy three days ago) | H |
| Company | 株式会社POYP, Chiyoda-ku Tokyo, representative 白坂 貴規 (Takanori Shirasaka), established 2026-02-18, capital JPY 1,000,000, business "planning, development and operation of the prediction-style points app POYP" (`https://poyp.app/company`) | H |
| iOS | App Store lookup (JP): version 1.3.9, `releaseDate` 2026-03-03, `currentVersionReleaseDate` 2026-08-28, 2,960 ratings, 4.55 average, free, age rating 12+, bundle `com.poyp.poyp`, seller name shown as "HIMOROGI inc." (fixture `itunes_lookup_poyp_jp_2026-10-19.json`) | H |
| Android | Google Play `com.poyp.poyp`: "10K+ Downloads", "Updated on Aug 22, 2026" (fixture `google_play_listing_fields_2026-10-19.json`) | H |
| Press | Yogonet 2026-06-29: Poyp launched its prediction platform in March; founder Takanori Shirasaka; rival to Miraima; uses virtual points (`https://www.yogonet.com/international/news/2026/06/29/125132-japan-sees-rise-of-pointbased-prediction-markets-amid-gambling-restrictions`) | H (page read) |

Verdict: **still_live = true**, small. The Android bucket (10K+) and iOS rating count (2,960) suggest low tens of thousands of installs at most (M, inference). Miraima, by contrast, is cited at nearly 1M monthly users in the same press (H for the article, not verified elsewhere).

Naming note: do not confuse with other "Poyp/Poyo" apps in the App Store search (e.g. "POYO" by TieTie). Match on bundle id `com.poyp.poyp`. (H)

---

## 2. Kind and market model

- **Kind:** forecasting-nonmoney. A "ポイ活" (point-earning) app: predict, earn coins, redeem coins for gift cards. (H: `https://poyp.app/`, Play and App Store descriptions)
- **Market formats shown on the landing page (H, illustrative mock-up, may not be live topics):**
  - YES/NO with a percentage split, e.g. "次の首相は誰？ 67% / 33% YES NO".
  - Probability/odds style, e.g. "W杯 日本の最終順位は？ 45%".
  - Multiple choice, e.g. "今年の映画興行収入1位は？ 作品A / 作品B / 作品C".
  - The page says users vote "YES/NOやオッズで" ("with YES/NO or odds") and can see other users' opinions. (H)
- **Mechanism (stake, payout, how the displayed percentage is computed):** NOT FOUND (searched: landing page, company/business pages, Play and App Store descriptions, Yogonet and three other press pages; ToS unreadable). The percentages look like vote shares, not an order book or AMM price (M, inference from the mock-up only). No evidence of a book, an AMM, or tokenised outcomes.
- **Categories (H, store listings):** news/current events, economics, stock prices, FX, entertainment, sports, trends/SNS; "new themes are added daily". Politics and sports are also named on the landing page.
- **Other earning loops:** Android listing also describes a "Walking Challenge" (6-day, 10,000 steps/day, via Health Connect) that earns points. (H)
- **Business side (H, `/business`):** sells advertisers and media "reward-driven prediction" engagement and market research; sponsored topics such as "what will be the best-selling drink this summer?". So some topics are likely commercial promotions rather than real-world event markets (M).

---

## 3. Chains and collateral

None. No blockchain, token, wallet or stablecoin mentioned anywhere on the site or in the store listings; the site states or implies the app is free and uses coins redeemable only through a gift-card service. (H; Webfetch of the landing page explicitly found "no cash, crypto, token or wallet" mentioned.)

Conflict: a search-result summary says Crunchbase describes POYP as "a cryptocurrency-based prediction market app". Crunchbase returned HTTP 403 so I could not read it. It contradicts every first-hand source (landing page, both store listings, Yogonet), so treat it as a wrong or auto-generated profile. (L)

---

## 4. Read API

- **exists: none** (no official or unofficial API found).
- Base URLs: none. `api.poyp.app` returns the site's generic Vercel 404 (a wildcard on the same project), `docs.poyp.app` and `api.poyp.co.jp` do not resolve. `poyp.co.jp` is a "Launching Soon" parked page. (H)
- Docs: none; no developer link in site nav or footer (links are limited to app download, `/company`, `/business`, `/contact`, ToS and Privacy on Notion). GitHub repository and user searches found no POYP organisation repo. (H for site, M for the GitHub search)
- Websocket: none found.
- Data is only visible inside the iOS/Android app. Whatever private HTTP API the app uses was not inspected (and must not be: reverse-engineering/automation is outside this task and probably outside the Terms).
- Real response shapes: none exist to capture; hence the fixtures are store metadata only.

---

## 5. Trade path

None. Predictions are placed by a logged-in user inside the mobile app (Google account login per Play listing). There is no order placement endpoint, no signed-order scheme, no on-chain contract. (H for the login/app-only description; NOT FOUND for any programmatic route.)

PayBox reachability: **no**. No EVM/Solana address is involved, no collateral to approve, no transaction to propose. Points are not purchasable and cannot be moved to a wallet.

---

## 6. Fees

No trading fees (free app, "completely free to play") (H). Redemption of coins into gift cards happens through えらべるPay; the coin-to-yen rate, caps and expiry are not published on the site (the landing page says the rate, limits and expiry are not listed). NOT FOUND (searched: landing page, store descriptions; ToS unreadable). Revenue is B2B (advertisers and media) per `/business`. (H)

---

## 7. Resolution mechanism and dispute risk

- Stated flow: "when results are released you get points" / "watch the outcome". Who decides the outcome, what source, and any dispute process: NOT FOUND (searched: landing page, store listings, press; ToS unreadable).
- Operator-resolved by default (M, inference: closed app, single company, no oracle). Dispute risk is effectively "trust the operator"; there is no recourse beyond app support.
- Promotional sponsored topics (section 2) have an obvious conflict of interest. (M)

---

## 8. Liquidity

- No volume, OI, TVL or stake figures are published anywhere I could reach. NOT FOUND (searched: landing page, store pages, Yogonet, GuruFocus, GamblingSites, FinTech Observer via WebFetch; two further searches blocked by the session search budget).
- Scale proxies: Android 10K+ downloads (Google Play, 2026-10-19, H); iOS 2,960 ratings (App Store lookup, 2026-10-19, H); both are install/engagement counts, not liquidity. There is no liquidity in the market sense (nothing is bought or sold with value).
- Press: none of the articles gives user numbers for Poyp; the 1M-monthly-user figure is Miraima's. (H for the articles' content)

---

## 9. Geo / ToS / automation

- Japan-focused: Japanese-only UI (`languageCodesISO2A: ["JA"]`), JP App Store listing, company in Tokyo. Country restrictions are not documented on the site. (H)
- Age: App Store rating 12+, Google Play "Rated for 3+"; Yogonet says these Japanese point apps currently impose no age limits (article-level, not Poyp-specific). (H for ratings, M for the claim)
- Legal position: founder argues users risk no "assets with actual value" so the app falls outside Japanese gambling law; lawyers quoted by Yogonet warn it could still face scrutiny, e.g. as promotional-sweepstakes law, because rewards have monetary value. Regulatory risk is real and unresolved. (H: Yogonet, as summarised by the fetch tool)
- Terms of Service: `https://poyp.notion.site/2f5b2931a0448057b135d10ae96086fc`; Privacy: `https://poyp.notion.site/2f5b2931a04480b1aa77f84c129f9ebd`. Both are client-rendered Notion pages; a plain GET and the fetch tool returned only the word "Notion". Reading them requires either a browser (disallowed) or Notion's page-chunk API, which is a POST (disallowed). So the automation, bot, scraping and API clauses are **UNREAD**. Assume automation is prohibited until proven otherwise (M).
- Practical conclusion: no sanctioned way to read or write; do not scrape the app.

---

## 10. Event overlap and shared liquidity

- **Overlap with other venues (M, from stated categories only):** politics (Japanese prime-minister question), sports (FIFA World Cup, Japan's final placing), economics/stocks/FX (price questions), entertainment (box office). Overlap exists in principle with Polymarket/Kalshi on politics, sports and some macro/price topics, but nothing here is tradable, so no arbitrage leg exists.
- **Shares liquidity with another venue?** No, because it has none. It is a standalone points game, and no linkage to Miraima or any other venue was found beyond being a competitor in the same niche. (M)
- **Use as a signal source:** at most a sentiment feed of Japanese retail opinion on Japan-specific topics, but there is no access to it, and vote shares in a points game with promotional topics are weak evidence. Not worth building.

---

## 11. Adapter recommendation

- **adapter_priority: skip.** Reasons: no money, no tradable prices, no API, ToS unreadable and likely restrictive, tiny audience, mechanics undocumented.
- Re-check triggers: (a) POYP publishes a developer API or data feed; (b) a real-money or crypto product launches (founder-stated ambition if Japan legalises it; M, per a search-result summary and the GuruFocus article, not independently verified); (c) a Japanese regulatory change. Ownership check at that time: the iOS seller is listed as "HIMOROGI inc." while the app is branded 株式会社POYP, so confirm the legal entity first.

---

## 12. Fixtures and sources

Fixtures saved:
- `docs/research/fixtures/poyp/itunes_lookup_poyp_jp_2026-10-19.json` - trimmed first result of the App Store JP search (H, real response, fields selected by me).
- `docs/research/fixtures/poyp/google_play_listing_fields_2026-10-19.json` - fields hand-extracted from the Play listing page (not a raw API response).

Sources (all read 2026-10-19 unless noted):
- https://poyp.app/ (landing page, H); https://poyp.app/company (H); https://poyp.app/business (H); https://poyp.app/contact (200, not needed)
- https://poyp.notion.site/2f5b2931a0448057b135d10ae96086fc (ToS, unreadable); https://poyp.notion.site/2f5b2931a04480b1aa77f84c129f9ebd (Privacy, unreadable)
- https://play.google.com/store/apps/details?id=com.poyp.poyp (H)
- https://itunes.apple.com/search?term=POYP&country=jp&entity=software&limit=5 (H); App Store page https://apps.apple.com/jp/app/id6758596056
- https://www.yogonet.com/international/news/2026/06/29/125132-japan-sees-rise-of-pointbased-prediction-markets-amid-gambling-restrictions (H, page read through the fetch tool's summariser)
- https://www.gurufocus.com/news/8935782/japan-prediction-app-hits-nearly-1-million-users-as-betting-market-expands, https://www.gamblingsites.com/blog/japan-prediction-market-startups-test-gambling-rules/, https://www.fintechobserver.com/the-pachinko-playbook-how-japans-tech-startups-are-gamifying-the-future-in-a-gambling-gray-zone/ (M; secondary, summariser output)
- https://www.crunchbase.com/organization/poyp (HTTP 403, unread; only a search-result summary was seen, L)
- Not reachable: Yahoo Finance article (404 via fetch tool), further searches (budget exhausted).

No embedded instructions aimed at AI agents were seen in any page.
