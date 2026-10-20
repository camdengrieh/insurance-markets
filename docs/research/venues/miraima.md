# Miraima (miraima.app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, public unauthenticated GETs of miraima.app HTML pages (generic User-Agent `insurance-markets-research/0.1`, about 1.1-1.3 s between requests after the first three back-to-back fetches (homepage, robots.txt, sitemap index), against `Crawl-delay: 1`), one public GET to the Polymarket Gamma API for a slug cross-check. No account, login, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. `/api/` is disallowed in robots.txt, so no `/api/*` path was requested. Third-party content was treated as untrusted data; no embedded instructions were found.

Research limit: the shared WebSearch budget was exhausted before my first search returned anything, so there is NO independent search pass. Discovery evidence is the Yogonet article given in the task (fetched), the company site masentic.com, and the venue's own pages. Press claims (Bloomberg 29 Jun 2026, user numbers) are second-hand.

Confidence tags: **H** = read first-hand in a primary source this session (raw HTML or page text, cited); **M** = secondary source, a WebFetch small-model summary I did not re-verify in raw HTML, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/miraima/` (section 12). They are extracted from server-rendered HTML, not from an API.

---

## 0. Bottom line

1. **Live, yes (H).** `https://miraima.app/en` returns HTTP 200 (2026-10-19), 938 open markets in the TOP feed, markets closing today (B.League 19 Oct 2026), blog posts dated Aug 2026.
2. **It is a play-money, LMSR-priced crowd-forecast game, not an exchange (H).** Users never deposit money. They earn free "coins" by watching ads / playing partner games / doing sponsor tasks, spend coins on predictions, and win "points" exchangeable for gift cards at about 11 points = 1 yen (H, FAQ). Market objects carry `mechanismType: "LMSR"` (H).
3. **No official API, no developer docs, no chain, no token, no contract (H/NOT FOUND).** Market data is only visible in the server-rendered HTML of the website (Next.js RSC payload). `/api/` is disallowed in robots.txt.
4. **Cannot be traded programmatically or from a wallet (H).** Accounts are app logins; rulebook Art. 7(2) bans "bots, automation tools, or other unauthorized programs" and a 4 Aug 2026 notice says automated predictions get an immediate ban and forfeiture. ToS Art. 19 bars copying/re-publishing content without consent.
5. **Not an arbitrage leg.** There is no money on it, so there is nothing to lock in; prices are set by a tiny crowd (15-30 participants on sports, ~200-1,200 on year-end politics) and drift with free-coin flows. At best it is a Japan-topic sentiment signal, and the legal/ToS posture makes even scraping it unattractive.
6. **adapter_priority = skip.** No API, ToS restricts copying and bans automation, play-money, thin crowd, Japan-only. Revisit as P2 (signal-only) only if Masentic offers a data feed or written permission.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://miraima.app/en` | 200, 408 KB HTML, `x-powered-by: Next.js`, CloudFront; title "MIRAIMA \| Earn points by predicting the future" | H |
| Open markets 2026-10-19 | `initialTopFeed.meta.totalCount` = 938 (79 pages of 12); all 12 on page 1 `status: "Open"`; B.League games dated 19 Oct 2026; BTC 5-minute market rolling every 5 min | H |
| Blog | `/blog/market-cancel-rule-update` and `/blog/terms-violation-response` both dated 4 Aug 2026; `maintenance-2026-07-06`; World Cup 2026 campaign posts (sitemap) | H |
| Press | Yogonet, 29 Jun 2026: Miraima launched in "November" (year not stated in the article), "nearly one million monthly users within seven months", founder Keita Adachi | M (article read first-hand; user number is the company's claim) |
| Company | Masentic Inc. (株式会社Masentic), Tokyo, founded 9 Mar 2021, CEO Adachi, capital JPY 150m; masentic.com lists a Bloomberg feature 29 Jun 2026 and a 29 Jan 2026 press release (collective-intelligence tech, developed with a Waseda professor, lawyer-supervised) | M (WebFetch summary of masentic.com) |
| Launch date | Task hint says Nov 2025. Market ids in the sitemap are UUIDv7; the oldest `/m/<uuid>` in the sitemap carries a 2025-07-03 timestamp, i.e. the product (or its predecessor) existed before Nov 2025. Not confirmed anywhere. | M (inference) |

Verdict: **still_live = true**. Nothing primary is older than 6 months; the Yogonet piece is 3.7 months old.

---

## 2. Kind and market model

- **Kind: play-money / points-based prediction game ("未来クイズ", future quiz), marketed as a ポイ活 (point-earning) app.** Operator Masentic Inc. (H: JSON-LD author, ToS).
- **Pricing mechanism: LMSR** (logarithmic market scoring rule automated market maker) on free coins (H: `"mechanismType":"LMSR"` on every market object, 12/12 on the home page, same on category pages). The liquidity parameter `b` is NOT FOUND (not in any payload, rulebook or FAQ; searched: HTML payloads of home/detail/category pages, FAQ, rulebook, ToS, two blog posts).
- **Probability displayed = LMSR price** for each choice (`predictionMarketChoices[].probability`, sums to 1) (H). The detail page also embeds a price history (`predictionMarketHistory`, 110 points at 3-hour spacing for a 14-day-old market, starting at 0.5/0.5) (H).
- **Market types seen (H):** `TwoChoice` (Yes/No, Up/Down, two teams; 48 objects counted) and `MultipleChoice` (1X2 football incl. Draw, correct-score grids, player-of-the-match; 19 objects counted). `marketRole`: `General`, `Game`, `Score`, `Mom`. No scalar markets seen.
- **Player payout is NOT the usual LMSR share payout.** FAQ (H, Japanese): the reward depends on the vote share of the option you pick, less popular options pay more if right, and "the reward is locked at the percentage shown when you vote". Participants get 1 coin regardless of result. Winners must tap "claim reward" on the results screen. The exact formula (stake x f(share)?) is NOT FOUND. So a position is not a tokenised share with a $1 terminal value.
- **Selling:** positions can normally be sold at market price before close (implied by the cancellation rules and by the BTC 5-minute market description saying "positions cannot be sold in this market") (H for the BTC statement; M for the general rule). The FAQ also says a vote cannot be cancelled/withdrawn once placed.
- **Outcome tokenisation: none.** No token, no on-chain representation (H: no chain, contract or wallet mentioned anywhere in the site, ToS or rulebook).
- **Market creation:** a `creater` object exists on each market (H); one B.League market was created by a non-official user account, so some markets are user/partner-created. Rules for market creation are NOT FOUND (rulebook is silent). A `/en/create` link exists in the nav (H).

---

## 3. Chains and collateral

- **Chain: none** (H by absence; NOT FOUND for any blockchain mention).
- **Collateral: "coins" (free in-app points, no monetary value, not exchangeable for cash or goods)** - rulebook Art. 3(2) (H, English page text). Coins are earned by watching ads, playing partner games, sponsor tasks, daily login bonus, referral (FAQ lists 200 and 500 coin referral grants) (H, Japanese FAQ).
- **Prize "points"** are awarded for correct predictions and exchanged for gift cards (Amazon / PayPay / Rakuten per Yogonet M; FAQ names the exchangers えらべるPay and giftee Box Select, M via WebFetch). Rate: **11 points = about 1 yen** (H, FAQ text "11ポイントで約1円相当分", 5,500 points about 500 yen). Gift-card requests take about 3-4 business days and cannot be cancelled (M). Coins/points expire after 180 days without login (H, FAQ and ToS Art. 13(6)).
- The ToS has two point types, 参加ポイント (participation points, "voting tickets") and 賞品ポイント (prize points) (M, WebFetch summary of the ToS); the FAQ/rulebook UI calls them coins and points. Same thing, different labels (M).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **None.** No API/developer link in nav or footer; FAQ, ToS, rulebook, masentic.com do not mention an API. masentic.com lists no data/B2B offer. | H (absence, NOT FOUND: searched site nav/footer, FAQ, rulebook, ToS, masentic.com, GitHub org search) |
| Docs URL | NOT FOUND. Closest: `https://miraima.app/en/rulebook` (player rules only). | H |
| Official GitHub | NOT FOUND. `gh search repos masentic/miraima` returned only unrelated or personal repos (e.g. "video-gen" forks by individuals, an unrelated repo that merely references the site); none read, none trusted. | M |
| Internal JSON API | Exists in the app/front end (the home page offers `meta.next` pagination and `loadMore`), but **`Disallow: /api/`** is in robots.txt and nothing is documented, so it was NOT probed. | H |
| robots.txt | `Allow: /`, `Disallow: /api/`, `/_next/`, `/private/`, `/p/`; `Crawl-delay: 1`; sitemap index at `/sitemap.xml` (12 shards) | H (saved as fixture) |
| What IS readable | Server-rendered HTML of public pages embeds the market JSON in the Next.js flight payload (`self.__next_f.push([1,"..."])`). Page keys: home `initialTopFeed {predictionMarkets[12], meta{page,per,totalCount,totalPage,prev,next}}`; category (politics/world) `initialMarketPage {markets, nextPage, error}`; category (soccer/crypto) `initialMarkets` + `initialMeta`; detail `initialMarketData {predictionMarket, numberOfParticipants, totalEnteredFreePoints, event, recurringMarketInfo, creatorReview, predictionMarketHistory}`. | H (fixtures) |
| Websocket | NOT FOUND (none observed in HTML; not looked for in JS bundles since they are undocumented) | - |
| Auth / rate limits | Public pages need no auth. Only stated limit is `Crawl-delay: 1`. No rate-limit headers seen (CloudFront). | H |

Public page URL patterns (H, from sitemap and nav): `/en`, `/en/<category>` (soccer, basketball, politics, world, crypto, esports, f1, combat-sports, tennis, weather, technology, manga, ...), `/en/<category>/<subtopic>` (e.g. `/en/basketball/b-league-games-2026-10-19`), market detail `/en/m/<uuid>` (fetched OK; the JSON-LD on that page also links the slug form `/en/m/b-league-alvark-akita-2026-10-19`, which I did not request), `/en/trending`, `/en/new`, `/en/closing-soon`, `/en/live`, `/en/leaderboard`. The sitemap shard 1 alone lists 3,357 `/m/<uuid>` URLs (resolved and open), the others add a few thousand more; one shard timed out, so the total is not established.

Key fields per market (H, see fixtures): `id` (UUIDv7), `slug` (e.g. `btc-updown-5m-1792380300`, `b-league-<teams>-<date>`, `epl-<teams>-<date>[-score|-mom]`), `title`, `description` (resolution rules, incl. source), `status` (`Open`, `PrizeDistributed` seen), `type`, `mechanismType`, `marketRole`, `entryOpenAt`/`fromLiveAt`/`entryCloseAt` (ms epoch), `realEndTime`, `distributedAt`, `winningChoiceId`, `totalEnteredFreePoints` (coins staked), `numberOfParticipants`, `freePointsPool`, `commentCount`, `predictionMarketChoices[{id,name,probability}]`, `topic/subTopic`, `label/subLabel`, `leagueWiki`, `wikis[]`.

NOT FOUND (searched: all payloads fetched): order book, trade list, per-user positions, per-choice share quantities, LMSR `b`, volume in currency, resolution-source URL as a structured field (it is free text inside `description`).

---

## 5. Trade path

**None.** Playing requires an app account (iOS / Android / web; ToS Art. 2 registration, age/guardian rules in Art. 10). No signed-order scheme, no REST trading endpoint, no on-chain interaction. Rulebook Art. 7(2) (H): "Participating via bots, automation tools, or other unauthorized programs" is prohibited; the 4 Aug 2026 notice (`/blog/terms-violation-response`, M via WebFetch) says automated predictions or coin trading lead to immediate ban with coins and points forfeited. Positions and winnings are non-transferable to money (ToS Art. 8/13, M).

## 6. Reachable through PayBox?

**No.** There is no chain, token, contract, x402 endpoint or signed-order API. A PayBox EVM/Solana wallet has nothing to sign or send. Even a hypothetical "trade" would be an app-account action with free coins. (H by absence.)

---

## 7. Fees

- **Trading fee: none stated** (no fee anywhere in FAQ, rulebook, blog posts; i18n/message payloads contain no "fee"/"手数料" strings in the pages fetched) (H for absence in fetched text).
- **Cancellation:** rulebook Art. 6(1) says unsold positions in a cancelled market are sold at the market price at cancellation and you receive the amount "less the applicable fee" as coins; the fee amount is NOT FOUND (H). The 4 Aug 2026 blog `/blog/market-cancel-rule-update` (M) says the old method was a full refund of unsold positions, the new method is sell-at-cancellation-price (no fee mentioned there), full refunds remain only for no-match or operator-error cases; below 1 coin you cannot sell. Reason given: users inflated a price, sold part at a profit and held the rest for a refund.
- **Redemption:** 11 points = about 1 yen (H). The business model is advertiser/sponsor funded (ToS Art. 16: rewards come from third-party sponsors, M; blog "why-miraima-is-not-gamble": points funded by advertiser spend, M).

---

## 8. Resolution mechanism and dispute risk

- **Centralised, discretionary (H):** Rulebook Art. 5(1): each market has its own criteria, and "the Company determines and announces the outcome based on official sources". FAQ: a market resolves when the source named in its rules officially announces the result, and entry closes at that moment even before the scheduled deadline (H, Japanese FAQ).
- **Sources are named in each market description (H):** Numbers 4 lottery -> PayPay Bank published results; 5-minute BTC -> **Pyth Hermes BTC/USD**; sports -> official league results (M).
- **Disputes:** no dispute process documented anywhere (H for absence; rulebook silent). Support is via official LINE (FAQ) and a contact email (nav). Governing law Japan; Tokyo District Court exclusive (ToS Art. 23, H).
- **Cancellation:** Company may cancel (match not held, settlement conditions not met, operator error). Cancellation has been used strategically and the payout rule was changed 4 Aug 2026 (M).
- **Risk for an aggregator:** high. Operator discretion, no oracle, no appeals, play-money incentives (users abuse cancellations), prizes via lottery-like campaigns on some markets (rulebook Art. 5(2): "Rewards, prizes, and winner selection follow each campaign's page", M).

**Concrete mismatch vs a covered venue (H):** the 5-minute BTC market mirrors Polymarket's `btc-updown-5m-<unix>` series (same slugs and windows; Polymarket slug `btc-updown-5m-1792380600` exists, checked by public Gamma GET on 2026-10-19). But Miraima settles on Pyth Hermes spot, with "same or lower" -> DOWN; Polymarket settles on the Chainlink BTC/USD TWAP stream with ">= start" -> Up. Different oracle, different tie rule; and Miraima is play-money, so even a price gap would not be an executable arbitrage.

---

## 9. Geo / ToS / automation

- **Target market: Japan** (Japanese-first site, JPY, Japanese gift-card exchanges, PayPay Bank lottery, B.League, Japanese politics). Country restrictions: NOT FOUND (ToS states none; FAQ says nothing on regions) (H for absence). Age: Apple IDs set under 13 cannot log in; minors need guardian consent (FAQ / ToS Art. 10) (M). Yogonet (M): "no age restrictions currently apply".
- **Legal posture (M):** operator argues it is not gambling because users deposit nothing and prizes are sponsor-funded, supervised by a lawyer (FAQ, blog). Yogonet (M) notes legal experts say it could still face scrutiny under the premiums/sweepstakes law. Regulatory risk for the venue itself is non-trivial.
- **Automation (H):** rulebook Art. 7(2) bans bots and automation tools; 4 Aug 2026 notice bans automated predictions; multiple accounts banned (Art. 7(1)).
- **Content use (H, ja ToS Art. 19):** members may not "複製、転載、改変、頒布、公衆送信" (copy, repost, modify, distribute, publicly transmit) service content without prior consent. This is a direct obstacle to republishing scraped prices in an aggregator. robots.txt itself permits crawling public pages except `/api/` etc.
- **Data:** the company may publish anonymised aggregate member data (ToS Art. 6(2), M).
- **Official stance on third-party data use:** NOT FOUND.

---

## 10. Liquidity (all figures in free coins, no currency value) - snapshot 2026-10-19 (H, from page payloads)

| Item | Value |
|---|---|
| Open markets, TOP feed | 938 (`meta.totalCount`) |
| Sidebar open-market counts by category | Soccer 280, Basketball 69, Politics 15, Combat Sports 12, Esports 7, F1 5, Baseball 1, Tennis 2, Technology 2, Manga 2, Weather 1, Miraima 1, World 0, Daily 0 (sum 397; this differs from 938 so the two counts use different scopes - NOT FOUND which) |
| B.League game markets | 4.5k - 25.9k coins staked, 15 - 29 participants each |
| EPL Tottenham v Coventry 1X2 | 37,408 coins, 240 participants |
| Other football 1X2 | 2.2k - 11.0k coins, 14 - 28 participants |
| Year-end 2026 politics (11 open) | 31k - 121k coins, 191 - 1,165 participants (largest: "Will PM Takaichi visit Yasukuni by end of 2026" 121,349 coins, 1,165 participants) |
| 5-minute BTC | ~5.8k - 7.0k coins, 13 - 15 participants per 5-min market |
| Platform users | "nearly one million monthly users" (Yogonet, Jun 2026, M) |

A "coin" has no stated cash value (coins cannot be redeemed; points are 11 per yen). There is no TVL/OI concept. Depth is a function of LMSR `b` (unknown) and a few dozen to a thousand voters.

---

## 11. Event categories and overlap with other venues

| Category on Miraima | Examples seen (H) | Overlap with other venues (M, not checked against them except BTC) |
|---|---|---|
| Politics / world | Putin, Xi, Netanyahu leave office by end 2026; Taiwan president change; Taiwan contingency; China-Japan clash; Trump alien disclosure; Takaichi Yasukuni visit; Japan consumption tax cut; Lower House dissolution | Leader-exit and geopolitics questions are the kind Polymarket/Kalshi carry; Japan-domestic items (Yasukuni, consumption tax, dissolution) are where a Japan crowd signal could add information |
| Sports | EPL, Serie A, La Liga, UCL/UEL, J-League, Bundesliga, B.League, NBA, MLB, NPB futures, UFC, Valorant, F1, ATP/WTA futures | Heavy overlap with sportsbooks and sports prediction venues, but prices here are a play-money crowd |
| Crypto | BTC Up/Down 5-minute (rolling) | Mirrors Polymarket `btc-updown-5m-*` slugs (H), different oracle/tie rule |
| Macro / stocks | "Will the S&P 500 rise on 10/19?", daily FX / stocks / trains / lottery subtopics | Possible loose overlap; no real money leg |
| Other | Weather/earthquakes, tech/AI, manga (One Piece), entertainment awards, influencers, X posts | Mostly unique; entertainment value only |

---

## 12. Fixtures

`docs/research/fixtures/miraima/` (creator fields redacted; all extracted from public server-rendered HTML with the generic User-Agent):

- `home_feed_sample.json` - first 3 of 12 markets from `https://miraima.app/en` plus `meta` (7 KB)
- `market_detail_b_league_sample.json` - `initialMarketData` for one B.League game incl. full `predictionMarketHistory` (10 KB)
- `politics_feed_sample.json` - first 3 of 11 politics markets (6 KB)
- `soccer_multichoice_sample.json` - a 1X2 market and a correct-score market (7 KB)
- `robots.txt` - verbatim (0.4 KB)

---

## 13. Shared liquidity

None. Miraima runs its own closed coin economy; it does not share liquidity with another venue (H: no integration, bridge or partner-market mention). It does copy question templates (the 5-minute BTC series) but with its own oracle and free coins, so it is independent but not tradeable.

---

## 14. Adapter priority: skip

Reasons: no official API; Art. 19 content-copy ban and bot ban; play-money, so no arbitrage leg; tiny crowds on sports; Japan-only; discretionary resolution. As a pure signal source for Japan-specific political/sports sentiment it would be P2 at best, but only with permission and a stable feed. If ever revisited: contact Masentic (nav footer) for a data licence; otherwise do not scrape.

---

## 15. Sources

1. https://miraima.app/en (homepage; raw HTML, JSON-LD, embedded feed, 2026-10-19) - H
2. https://miraima.app/en/m/01a10d03-5505-76fa-874f-a5a85ccc6c1c (market detail incl. history) - H
3. https://miraima.app/en/politics , /en/soccer , /en/world , /en/crypto (category feeds) - H
4. https://miraima.app/robots.txt , https://miraima.app/sitemap.xml and shards - H
5. https://miraima.app/en/faq (Japanese FAQ: 11 points = 1 yen, reward locking, resolution timing) - H (raw HTML) / M (WebFetch summary)
6. https://miraima.app/en/rulebook (Art. 3, 5, 6, 7) - H (raw text) / M (summary)
7. https://miraima.app/en/terms-of-service (Art. 8, 19, 23) - H for Art. 19/23 in Japanese raw text; M for the rest (WebFetch summary)
8. https://miraima.app/blog/market-cancel-rule-update , https://miraima.app/blog/terms-violation-response (both 4 Aug 2026) , https://miraima.app/blog/why-miraima-is-not-gamble - M (WebFetch summaries)
9. https://miraima.app/en/how-to-play - H (no mechanics shown)
10. https://masentic.com - M (WebFetch summary: company data, Bloomberg 29 Jun 2026, no API/B2B offer)
11. https://www.yogonet.com/international/news/2026/06/29/125132-japan-sees-rise-of-pointbased-prediction-markets-amid-gambling-restrictions - M (founder, "November" launch, ~1M monthly users, legal-risk commentary, rivals Poyp and Gumi)
12. https://gamma-api.polymarket.com/events?slug=btc-updown-5m-1792380600 (public GET, slug and Chainlink TWAP resolution rule cross-check) - H

## 16. Not found

- Official API, developer docs, websocket, SDK, GitHub org
- LMSR liquidity parameter `b`; exact payout formula; fee amounts (cancellation "applicable fee")
- Market-creation and dispute rules; country restrictions; official policy on third-party data use
- Cash-value of a coin; total platform volume; the definition behind 938 vs 397 market counts
- Exact launch date (Yogonet says "November"; sitemap ids hint at July 2025)
- Second-source verification of user numbers (search budget exhausted)

## 17. Open questions

- Is the 938 vs 397 gap "all open markets" vs "markets in the listed categories"?
- Would Masentic license a data feed for Japan-topic probabilities, and what are the rights to republish?
- Does the price history endpoint behind the detail page expose per-trade data? (not probed; sits behind `/api/` which robots.txt disallows)
