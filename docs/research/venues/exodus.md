# Exodus (exodus.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to documented public hosts, web searches, no account, wallet, key, signature, POST or PayBox tool. Third-party pages were treated as untrusted data; nothing in them was followed.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, search-engine summary, or my inference; **L** = weak/stale.

Not to be confused with `docs/research/venues/exodus-ai.md` (exodusprotocol.ai, a dead memecoin, different entity) or Exodus esports team markets on Polymarket.

---

## 0. Bottom line

1. **Exodus is a wallet app (Exodus Movement, NYSE American: EXOD) that appears to be a front-end/broker onto Polymarket's global CLOB, not a venue.** The evidence: a verified Polymarket builder entry named "Exodus" (builder code `0x4ddd4bc5...2ebb`) with 2026 volume. Builder-attributed orders are matched in Polymarket's own CLOB, so Exodus has no liquidity of its own. (H for the builder entry and the attribution mechanism; M that the builder entry belongs to exodus.com, because it rests on the name and a logo match, not on any Exodus statement.)
2. **Not an independent arbitrage leg.** Prices, books and resolution are Polymarket's. Adding Exodus as a venue would double count Polymarket.
3. **Product is recent and tiny.** "Exodus Predictions" exists as a mobile-app feature (support article seen only through a search-engine summary, M). Polymarket reports $238K all-time attributed volume, 57 users (H). Rank 230 all-time, 96 on the last day (H).
4. **No Exodus market API, no docs, no contracts of its own.** The Exodus site and support center sit behind a Cloudflare challenge (HTTP 403 "Just a moment...") to scripted clients, and I did not try to bypass it.
5. **adapter_priority = skip.** The only useful artefact is the builder-code attribution, which can be used as a signal ("how much Polymarket flow comes via Exodus") but is already reachable through the Polymarket adapter's data-api (`/v1/builders/*`).

---

## 1. Is it still live in 2026?

| Claim | Evidence | Tag |
|---|---|---|
| Exodus Movement is a live public company | Q2 2026 results press release dated 2026-08-10 (GlobeNewswire via Manila Times, 2026-08-11): https://www.manilatimes.net/2026/08/11/tmt-newswire/globenewswire/exodus-reports-second-quarter-2026-results/2402418/amp . Release has no mention of prediction markets. | H |
| Exodus said prediction markets were coming | Q1 2026 earnings call (via Investing.com): CEO J.P. Richardson: "We announced that we're going to do a lot of things like prediction markets" (announced at the Exodus Summit, 2026-05-01); no partner named. https://www.investing.com/news/transcripts/earnings-call-transcript-exodus-movements-q1-2026-earnings-reveal-mixed-results-93CH-4692083 (page-summary tool, so quote is the summarizer's extraction of the transcript) | M |
| An "Exodus Predictions" feature has shipped | A search-engine summary of Exodus's support center (collection "Getting started", https://www.exodus.com/support/en/collections/6990819-getting-started) says: Predictions has a separate balance that must be funded, is reached via profile icon > Predictions in Exodus Mobile, and funding/buying is limited to supported countries/regions. I could not open the page myself (Cloudflare 403 to WebFetch and to curl). | M |
| Exodus trades on Polymarket today | Polymarket data-api builder leaderboard, `timePeriod=DAY` rank 96, 1 active user, $195.60 (fixture). | H |
| Date of launch | NOT FOUND (searched: exodus.com press releases (blocked by Cloudflare), WebSearch for launch announcement, Q2 2026 release). Polymarket's yearly builder series shows Exodus volume only in the 2026 bucket and none in 2025 (H), so it started in 2026. | M |
| Partner named by Exodus (Polymarket vs Kalshi vs other) | NOT FOUND in any Exodus-authored text I could read. Inference from the Polymarket builder entry only. | M |

Also: Exodus added in-wallet sports betting via SportX in 2021 (press release URL `https://www.exodus.com/investors/news-events/press-releases/detail/33/...`, seen only in search results; L, old, unverified status; not an active lead). Exodus Markets (tokenized stocks with Ondo on Solana) is unrelated to prediction markets (M, The Block / Cointelegraph search results).

---

## 2. Kind and market model

- **Kind:** wallet app front-end / broker-frontend onto another venue. (M/H as above)
- **Market model:** inherited from Polymarket: binary and categorical (neg-risk) outcomes, CLOB, outcome tokens as ERC-1155 conditional tokens on Polygon (documented in the Polymarket spec of the parallel workflow; not re-verified here). Exodus's own market model, if it differs, is NOT FOUND.
- **Chains and collateral:** Polymarket CLOB V2 docs refer to collateral as pUSD (Polymarket fees page: "A 1,000 pUSD taker buy ..." https://docs.polymarket.com/builders/fees.md , H). Exodus's custody model for the separate "Predictions balance" (custodial vs user-key proxy wallet) is NOT FOUND.

---

## 3. Read API

- **Exodus-own read API:** none found. NOT FOUND (searched: exodus.com/predictions and /prediction-markets (Cloudflare 403), WebSearch "Exodus Predictions API", GitHub not searched for third-party code per ground rules). `exists = none`.
- **Usable read data is Polymarket's** (gamma-api, clob, data-api), covered by the Polymarket spec. Exodus-attributable data only through Polymarket's builder endpoints, below.

### Confirmed shapes (unauthenticated GET, H, 2026-10-19)

Host `https://data-api.polymarket.com`, no key required, rate limits not documented in what I read.

- `GET /v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit=50&offset=N` returns an array of `{rank (string), builder, builderCode (bytes32 hex), volume (USD float), activeUsers, verified, builderLogo}`. The page limit is 50; Exodus is at offset 200 (ALL), 100 (MONTH, WEEK) and under 100 for DAY.
- `GET /v1/builders/volume?timePeriod=ALL` returns one row per builder per bucket: `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`. For ALL the buckets are calendar years (2025-01-01 and 2026-01-01); Exodus has only the 2026 bucket.

Exodus entry across periods (Polymarket-reported, USD volume of matched trades carrying the builder code):

| Period | Rank | Volume | Active users |
|---|---|---|---|
| ALL | 230 | 238,028 | 57 |
| MONTH | 104 | 69,080 | 39 |
| WEEK | 101 | 3,308 | 6 |
| DAY | 96 | 196 | 1 |

(The ALL volume series row says 238,035 and rank 226 a moment later; the figures drift as the leaderboard refreshes. Polymarket says matched volume can take up to 24 hours to appear.)

Fixtures: `docs/research/fixtures/exodus/polymarket_builders_leaderboard_exodus_2026-10-19.json`, `docs/research/fixtures/exodus/polymarket_builders_volume_series_exodus_2026-10-19.json`.

Docs: Polymarket builder program https://docs.polymarket.com/programs/builders/overview.md and fees https://docs.polymarket.com/builders/fees.md (H for the fee page contents below).

---

## 4. Trade path

- **Via Exodus:** none. No public API; the feature lives in the Exodus mobile app (M). No automation route.
- **Via Polymarket directly (the real liquidity):** signed orders to Polymarket's CLOB; the builder code is "part of the signed V2 order struct", not an off-chain label, and "the only credential you need for attribution" (Polymarket attribution/fees docs, via search-result summary, M; the fees page itself H). An agent does not need Exodus at all: trade the Polymarket adapter.
- **PayBox reachability:** `paybox_reachable = no` for Exodus as a venue (nothing to call). Polymarket itself is reachable by an EVM wallet signing EIP-712 orders and sending Polygon transactions, which belongs to the Polymarket spec.
- A third-party "Exodus-attributed" order from our own agent would need an Exodus builder code, which only the owner of the Exodus builder profile has. Do not try to reuse the public code string (it is just a label, but using another party's code would misattribute volume and fees and risks the code being disabled).

---

## 5. Fees

- **Polymarket platform fee** (taker only, per-market `feeRate`): `platform_fee = C * feeRate * p * (1 - p)` (H, fees page).
- **Builder fee** added on top when a builder code is attached: `builder_fee = notional * bps / 10000`, taker max 100 bps, maker max 50 bps, default 0, set per builder profile, publicly visible (H, fees page).
- **What Exodus actually charges users:** NOT FOUND. The Exodus builder profile's rates are said to be public, but I did not find a read endpoint for them (searched: data-api builder endpoints, docs). Treat Exodus-routed prices as Polymarket price plus an unknown 0-1 percent builder fee plus any Exodus or funding fees.

---

## 6. Resolution and dispute risk

Same as Polymarket (UMA optimistic oracle path; see the Polymarket spec). Any Exodus-side regional restrictions, custody of the Predictions balance or withdrawal terms are NOT FOUND. Additional Exodus-specific risk: if the Predictions balance is custodial, you take Exodus counterparty risk on top (unknown, M).

---

## 7. Geo / ToS / automation

- Support center says funding and buying are only available in supported countries and regions and the feature may not appear in some regions (M, search-engine summary of the support article).
- Exodus's terms for prediction markets, and whether automated use is allowed: NOT FOUND (site is behind a Cloudflare challenge; I did not bypass it).
- Polymarket can disable a builder code at any time and the CLOB then rejects its orders (M, search summary of fees docs).

---

## 8. Liquidity

- **Own liquidity:** none; flow lands in Polymarket's CLOB.
- **Attributed volume:** $238K all-time, 57 users (Polymarket data-api, 2026-10-19, H). For scale, the top builder (betmoar) has about $2.34B (H, same endpoint).
- Exodus user base: 1.4M monthly active users in Q2 2026, quarterly funded users 1.3M (M, search summary of the Q2 call), so reach exists but conversion is currently tiny.

---

## 9. Event overlap and shared liquidity

- Everything shown to Exodus users that I could identify is Polymarket's catalogue: sports, politics, crypto price, macro. Overlap with Kalshi, Limitless, etc. exists but only through Polymarket's own markets.
- **Shares liquidity with: Polymarket (global CLOB).** Not an independent leg (M-to-H: the builder-attribution mechanism is H, the identification of the Exodus app with the builder is M). Which Polymarket market set Exodus exposes (global vs US/CFTC variant) is NOT FOUND.

---

## 10. Adapter recommendation

- Priority: **skip** as a venue adapter. Duplicate liquidity, no API, tiny volume.
- Possible cheap signal-only use: in the Polymarket adapter, track builder-attribution rankings (`/v1/builders/leaderboard`) as meta-data about distribution channels. Not an edge source.
- Watch item: if Exodus later announces a different partner (Kalshi, own venue) or exposes an API, re-run this spec. Next check: after the Q3 2026 results (the TrendSpider page, M, lists next earnings 2026-11-05).

---

## 11. Not found / open questions

- Exodus-authored confirmation of the partner and the launch date.
- Contents of the "Exodus Predictions" support articles (blocked by Cloudflare to scripted clients).
- Exodus builder fee rates; custody model of the Predictions balance; supported countries list; ToS stance on automation.
- Whether other builder entries exist for Exodus (only one "Exodus" row found in the top 300 ALL rows).

## 12. Suspicious content

None seen. All third-party search results were treated as data. One search result was a spam-like link-list page that mentioned a separate prediction site next to an Exodus article; not followed.

## Sources

1. https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=200 (H, 2026-10-19; also MONTH/WEEK/DAY)
2. https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL (H, 2026-10-19)
3. https://docs.polymarket.com/builders/fees.md (H, 2026-10-19)
4. https://docs.polymarket.com/developers/builders/builder-intro (H via page-summary tool)
5. https://docs.polymarket.com/trading/orders/attribution.md (M, search-result summary only; the raw fetch returned HTML I did not parse)
6. https://www.investing.com/news/transcripts/earnings-call-transcript-exodus-movements-q1-2026-earnings-reveal-mixed-results-93CH-4692083 (M)
7. https://www.manilatimes.net/2026/08/11/tmt-newswire/globenewswire/exodus-reports-second-quarter-2026-results/2402418/amp (H, no prediction-market text)
8. https://www.exodus.com/support/en/collections/6990819-getting-started (M, via search summary; 403/Cloudflare to direct fetch)
9. https://www.exodus.com/ , /summit , /predictions , /investors/... (Cloudflare challenge 403 for WebFetch and curl; not bypassed)
10. WebSearch results (extended) on "Exodus prediction markets", "Exodus Predictions", "Exodus Q2 2026 prediction markets": no Exodus-authored launch announcement found.
