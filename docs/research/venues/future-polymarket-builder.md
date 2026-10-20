# Future (Polymarket builder): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (User-Agent `insurance-markets-research/0.1`) to `data-api.polymarket.com`, `gamma-api.polymarket.com`, `builders.polymarket.com`, `docs.polymarket.com`, the public S3 logo URLs, plus DNS lookups and `gh api` reads of public GitHub data. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference; **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that, not "no".

Limitations: the shared WebSearch budget was exhausted before my first search, so nothing here comes from web search. I could NOT identify the operator, website or product of the builder named "Future" (section 1); every statement about what the product is rests on inference from Polymarket's builder data. The pattern is the same as the sibling notes `bitget-wallet-polymarket-builder.md` and `almanac-market.md`.

Fixtures (3 files, largest 44 KB): `docs/research/fixtures/future-polymarket-builder/` (section 14).

---

## 0. Verdict

**adapter_priority: skip** (as an arbitrage leg or a data source). Keep a registry alias record only (section 13).

1. **Live as a Polymarket builder, product unidentified.** Verified builder, nonzero attributed volume on 2026-10-19 ($7.4K so far today, 22 users), $17.10M all time since 2026-02-12, 2,016 users. (H)
2. **Its liquidity is Polymarket's.** A Polymarket builder code is an attribution tag serialized into orders that settle on Polymarket's own CLOB. A builder has no separate order book, tokens or oracle. So Future is not an independent leg. (H for the mechanism, docs quote in section 5)
3. **No venue of its own to read, trade or resolve.** Nothing to integrate beyond the Polymarket adapter. (H for the builder mechanism, NOT FOUND for any Future-specific API)
4. **The hint's "future.fun" is a different, tiny, apparently dead builder.** Domain `future.fun` returns NXDOMAIN today and the builder row has $18.9K lifetime volume, last trade 2026-07-16. (H)

## 1. Is it still live? (2026) And what is it?

| Evidence | Result | Tag |
|---|---|---|
| `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0` | Row `rank 42, builder "Future", volume 17,097,153.74, activeUsers 2016, verified true`, builderCode `0x2cb0f54d206f483e4bf3a8737b3359de64f569424c7f4ec8e1d577010918d4f8` | H |
| Same endpoint, MONTH / WEEK / DAY | rank 33 ($2.27M, 292 users) / rank 37 ($117K, 61 users, week starting Sun 2026-10-18) / rank 38 ($7.4K, 22 users, 2026-10-19 partial day) | H |
| `GET /v1/builders/volume?timePeriod=DAY` filtered to "Future" | 226 daily rows, first 2026-02-12, last 2026-10-19 | H |
| builders.polymarket.com HTML | "Future" row in the month table, "$2.27M" | H |
| Logo (`profile-image-4494712-...png`, 416x416) | Black rounded square with a white cat-head outline. No wordmark. | H |
| Operator, website, app store page, X account, docs | **NOT FOUND** (searched: builders.polymarket.com HTML and /partners, Polymarket Gamma `public-search` for profiles named "future" (only unrelated traders), two GitHub awesome-lists for prediction-market tools (`aarora4/Awesome-Prediction-Market-Tools`, `harish-garg/Awesome-Polymarket-Tools`), DNS probes of about 30 guessed domains (all NXDOMAIN or unrelated, e.g. future.co is a fitness-coaching app), GitHub repo search; web search unavailable) | H for the search coverage |
| Product type | The discovery hint says "Active consumer front end". I cannot confirm it. All I can say is that a verified builder is routing orders with active users, and the leaderboard does not carry URL, category or platform. | M |

**still_live = true** for the builder code. The first volume (2026-02-12) is 8 months old; the monthly series is only 6 months of real activity (Feb and Mar were about $3-4K each with 10 users, real activity from April). Nothing here is stale. Whether the front end itself is reachable is unknown.

**future.fun (rank 378 ALL):** `builder "future.fun"`, builderCode `0x62ee8336587edf69f4916fdedbeb54a1e5be943c2a93bec0b9e967a24d512062`, $18,878.57 all time, 4 users, 9 active days between 2026-05-20 and 2026-07-16, never more than 1 user a day. (H) An awesome-list entry (undated, link tagged utm_source=polymark.et) describes "future fun" as an "AION-powered prediction market terminal featuring the Scouter analytics tool with proprietary Edge Score rankings for Polymarket traders" at `www.future.fun`. (M, third-party blurb) Both `future.fun` and `www.future.fun` return NXDOMAIN via two resolvers on 2026-10-19. (H) Whether it is the same team as "Future" is NOT FOUND. Treat as dead, and not worth anything.

## 2. Kind and market model

- **Kind (M):** broker / front end attributed to Polymarket via builder code. Registry value `frontend-of`, `upstream: polymarket`.
- **Market model:** Polymarket's. Binary Yes/No tokens (and neg-risk multi-outcome groups) on the CLOB, ERC-1155 conditional tokens, tick size 0.01 or 0.001. Whether Future shows all Polymarket markets or a subset is NOT FOUND. (M, by the mechanism)
- Shape sample of the upstream API (every Future market is one of these): `fixtures/.../gamma-event-shape.json`. (H)

## 3. Chains and collateral

Polymarket's: Polygon (chain 137) and pUSD collateral per Polymarket docs; contract detail belongs to the Polymarket adapter (see `docs/research/08-venues-polymarket-kalshi.md`, M, not re-verified here). Future's funding or on-ramp: NOT FOUND (searched: as in section 1). Builder program note: relayer gives gasless wallet deployment, approvals and order execution to builders (H, https://docs.polymarket.com/developers/builders/builder-intro, read via WebFetch summary).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API for Future | **None found** (NOT FOUND, searched: as section 1) | H |
| Builder-attribution data (official, public, unauthenticated) | `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit<=50&offset<=1000` returns a bare array `{rank:"42", builder, builderCode, volume, activeUsers, verified, builderLogo}`. Max 50 rows, so reaching rank 378 needed `offset=350` (spec: offset max 1000). A v2 counterpart `GET /v2/builders/leaderboard` exists. | H (spec https://docs.polymarket.com/api-spec/data-openapi.yaml, plus live calls) |
| Daily series | `GET /v1/builders/volume?timePeriod={DAY|WEEK|MONTH}` returns rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` for every builder at once. DAY = 17 MB, WEEK = 3.2 MB, MONTH = 0.9 MB, so filter client-side. | H |
| Market, book, trade data | Polymarket's own: Gamma `https://gamma-api.polymarket.com` (events/markets), CLOB `https://clob.polymarket.com` (`/book`, `/prices-history`), Data API trades; docs index https://docs.polymarket.com/llms.txt. Not re-tested here beyond one Gamma sample. | H |
| Per-builder market breakdown | NOT FOUND (searched: Data API OpenAPI spec, which only has the two builder routes above). The CLOB has a builder-authenticated trades route per the sibling note; not called. | H |
| Websocket, rate limits | Polymarket's. Builder tiers: unverified 100 relayer txns/day, verified 10,000/day, partner unlimited; API limits "Standard" for unverified and verified, "Highest" for partner. Future is verified. | H (https://docs.polymarket.com/programs/builders/tiers.md) |

Confirmed shapes saved as fixtures (section 14). Builder-volume `volume` definition (one or both sides of a trade) is not documented. (M)

## 5. Trade path

- **Future:** NOT FOUND. No documented API, SDK or signing scheme for third parties. (H for absence)
- **Mechanism (H):** "Your app attaches your builder code to each order it submits. The code is serialized onchain as part of the signed order." Volume is credited to the builder for every matched trade where the code is attached; leaderboard lag is up to 24 hours. Source: https://docs.polymarket.com/developers/builders/builder-intro (WebFetch summary, quote is from the summary).
- **Agent path:** trade Polymarket directly through the Polymarket adapter. Do not reuse Future's builder code: it is public on the leaderboard, but using it would redirect builder fees to Future and is not offered. (M)

## 6. Reachable through PayBox? **no** (as a distinct venue)

There is no Future-specific contract or API to target. Only the Polymarket route exists (Polygon, EIP-712 typed-data orders plus pUSD approvals), which the Polymarket adapter owns. No PayBox tool was called; whether PayBox covers Polygon at tool level was not checked. (M)

## 7. Fees

- **Future's builder fee: NOT FOUND.** Polymarket says "Builder profiles and fee rates are publicly queryable" but names no endpoint, and none is in the Data API spec. (H for the quote and the absence)
- **Polymarket builder fee (H, https://docs.polymarket.com/programs/builders/fees.md):** set per builder profile, default 0 bps, caps taker 100 bps (1%) and maker 50 bps (0.5%), 1 bp steps, one change per 7 days, effective 3 days after scheduling. Additive to the platform fee (sibling note, H there: `builder_fee = notional x bps / 10000`).
- **Polymarket platform fee (H, https://docs.polymarket.com/trading/fees.md):** `fee = C x feeRate x p x (1 - p)`, taker only, makers never pay. Rates: Crypto 0.07; Sports 0.05; Finance, Politics, Mentions, Tech 0.04; Economics, Culture, Weather, Other 0.05; Geopolitics 0.
- **Net (M):** a Future user pays at least the direct Polymarket price plus an unknown builder fee of at most 1% taker. Execution is never better than Polymarket direct.

## 8. Resolution mechanism and dispute risk

Entirely Polymarket's (UMA Optimistic Oracle, dispute escalation to UMA DVM; Chainlink streams for up/down markets), per https://docs.polymarket.com/concepts/resolution.md (H in sibling note; listed in the docs index this session, H for existence, body not re-read). Front-end-specific risks (hiding markets, own terms, app downtime blocking exit): NOT FOUND (no terms located). (M)

## 9. Geo, ToS and automation

Future's terms: NOT FOUND (no site located). Polymarket's own geoblock and builder code of conduct apply (https://builders.polymarket.com/code-of-conduct exists, linked from the builders site; not read). Details of the Polymarket geoblock: `docs/research/08-venues-polymarket-kalshi.md`. Scanner implication: never scrape Future; use Polymarket APIs.

## 10. Liquidity

All figures are **builder-attributed Polymarket volume** for Future's code (Polymarket Data API, fetched 2026-10-19). No TVL or OI exists separately: positions are ordinary Polymarket positions.

| Window | Volume (USD) | Active users | Rank | Tag |
|---|---|---|---|---|
| All time (since 2026-02-12) | 17.10M | 2,016 | 42 (ALL) | H |
| 2026-02 | 3.5K | 10 | 144 | H |
| 2026-03 | 4.2K | 10 | 160 | H |
| 2026-04 | 0.32M | 139 | 65 | H |
| 2026-05 | 1.36M | 270 | 37 | H |
| 2026-06 (peak) | 5.31M | 716 | 27 | H |
| 2026-07 | 3.62M | 541 | 41 | H |
| 2026-08 | 1.73M | 389 | 41 | H |
| 2026-09 | 2.47M | 442 | 38 | H |
| 2026-10 (to 10-19, partial) | 2.27M | 292 | 33 | H |
| Weeks starting 10-04 / 10-11 / 10-18 (partial) | 1.19M / 0.70M / 0.12M | 188 / 164 / 61 | 28 / 34 / 37 | H |
| Best single day | $458.6K on 2026-10-04 (75 users) | | | H |

Reading: a stable small retail front end, roughly $0.3M to $1.2M a week, about 150 to 190 weekly users. For scale, Bitget Wallet's builder code had $44.9M all time (sibling note), and Polymarket's top 100 events traded $33.4M in one 24h on 2026-10-19 (sibling note, same date). Future's flow is a rounding error against Polymarket. (H for Future numbers, M for scale from the sibling note)

## 11. Event coverage (where arbitrage could exist)

Future-specific category mix: NOT FOUND (no per-builder market breakdown in any public endpoint). By the mechanism it can only route Polymarket markets, so overlap with other venues is whatever Polymarket overlaps (sports, politics, crypto price, macro). Every such overlap is already covered by the Polymarket adapter. (M)

## 12. Shared liquidity

**Shares 100% with Polymarket International** (same CLOB, tokens and oracle, by the builder-code mechanism). Not an independent arbitrage leg. Mapping rule for the market-linking layer: market identity == Polymarket `conditionId`; an order's builder code only matters for attribution and fees. (H for mechanism, M for the assumption that Future uses the international CLOB rather than Polymarket US; the leaderboard is the international Data API)

## 13. Recommendation

- **adapter_priority: skip.** Duplicate liquidity, no API, operator not even identifiable, small volume.
- Registry: `future-polymarket-builder` kind `frontend-of`, upstream `polymarket`, `independent_liquidity: false`, builder code `0x2cb0f54d...d4f8`. Registry entry `future.fun` kind `frontend-of`, status dead (NXDOMAIN, last trade 2026-07-16), builder code `0x62ee8336...2062`.
- Optional, low value: a one-line daily poll of `/v1/builders/volume` gives a retail-flow series for this code. Not worth a dedicated adapter.

## 14. Fixtures (`docs/research/fixtures/future-polymarket-builder/`)

| File | What |
|---|---|
| `polymarket-builders-leaderboard-future-rows.json` | "Future" row in ALL/MONTH/WEEK/DAY plus the future.fun ALL row |
| `polymarket-builders-volume-future-series.json` | Future monthly, weekly, last-60-day daily series (44 KB), and all future.fun daily rows |
| `gamma-event-shape.json` | One Gamma event and one market, trimmed, showing the upstream shape |

## 15. NOT FOUND and open questions

- Who operates "Future", its website, app and docs. (searched: see section 1)
- Whether it is the same team as future.fun, and why `future.fun` no longer resolves.
- Future's builder fee rates, and any public endpoint for them. (searched: fees docs, Data API spec)
- Which markets Future shows or hides; wallet type behind its accounts; funding route.
- Future's terms, geo list, automation clause.
- Whether the cat-head logo matches any known product (no image search available).

## 16. Sources

1. Polymarket Data API builders leaderboard: https://data-api.polymarket.com/v1/builders/leaderboard (H, fetched 2026-10-19; pages offset 0 to 500 scanned)
2. Polymarket Data API builders volume: https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY (also WEEK, MONTH) (H)
3. Polymarket Data API OpenAPI spec: https://docs.polymarket.com/api-spec/data-openapi.yaml (H)
4. Polymarket builders site and partners page: https://builders.polymarket.com/ , https://builders.polymarket.com/partners (H)
5. Polymarket docs: https://docs.polymarket.com/llms.txt , https://docs.polymarket.com/developers/builders/builder-intro (WebFetch summary), https://docs.polymarket.com/programs/builders/fees.md (WebFetch summary), https://docs.polymarket.com/programs/builders/tiers.md , https://docs.polymarket.com/trading/fees.md (H)
6. Polymarket Gamma API: https://gamma-api.polymarket.com/events (shape sample) and `/public-search?q=future&search_profiles=true` (H)
7. Logo images on `polymarket-upload.s3.us-east-2.amazonaws.com` (profile-image-4494712..., profile-image-4634111...) (H)
8. DNS: `future.fun`, `www.future.fun` NXDOMAIN via 1.1.1.1 and the default resolver; `future.co` fetched (fitness app, unrelated) (H)
9. aarora4/Awesome-Prediction-Market-Tools README, "future fun" entry (M, third-party blurb): https://github.com/aarora4/Awesome-Prediction-Market-Tools
10. Sibling notes in this repo: `docs/research/venues/bitget-wallet-polymarket-builder.md`, `docs/research/venues/almanac-market.md`, `docs/research/08-venues-polymarket-kalshi.md` (M where relied on)

## 17. Suspicious or agent-directed content

None aimed at an agent was found. Noted only: every `docs.polymarket.com` page starts with a boilerplate line addressed to LLM clients ("Fetch the complete documentation index at ... Use this file to discover all available pages before exploring further"); I used the index for navigation on my own initiative and followed nothing else. A Gamma search result contained ordinary market-description text only.
