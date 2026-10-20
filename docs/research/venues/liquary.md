# Liquary (liquary.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~04:15-04:30 UTC). READ-ONLY: doc/site reads, `gh api` reads, unauthenticated GETs to `api.liquary.xyz` and `api.llama.fi`. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (raw bytes via curl/`gh`, or a verbatim page quote I re-checked in raw HTML); **M** = small-model page summary (WebFetch), secondary source, or my own computation/inference; **L** = weak or stale.

Method limits:
- The session WebSearch budget was already exhausted, so I ran **no web searches** (no press, X posts or Discord announcements were checked).
- `defillama.com/protocol/liquary-outcome` returned HTTP 403 to WebFetch; I used the public `api.llama.fi` JSON instead.
- Hyperliquid `POST /info` was not called (POST is forbidden by the ground rules); Hyperliquid facts come from its gitbook markdown and from the existing note `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`.

---

## 0. Bottom line

1. **Live** (H): `api.liquary.xyz/v1/live.json` was regenerated at 2026-10-19 04:15Z and lists 208 markets (300 outcomes); the Terms were updated 2026-09-30; the GitHub org pushed 2026-09-29.
2. **Liquary is not a market. It is a front-end/broker** (self-custodial trading terminal for perps, spot and prediction markets) run by Hypersight LLC (Wyoming). Its prediction markets are (a) **Hyperliquid HIP-4 outcome markets** (HyperCore order books, USDC) and (b) **Polymarket** (Polygon, routed with a builder code). It does not create, list, curate or settle anything (Terms 2.E-F; docs "Neither Hyperliquid nor Liquary curates the catalogue").
3. **Liquidity is 100% shared** with `hyperliquid-hip-4-outcomes-native` and with Polymarket. It is **not an independent arbitrage leg**. Its own order flow is negligible: DefiLlama attributes **$147 (7d), $2.3k (30d), $57k (all time)** of builder-code volume to Liquary Outcome (H, api.llama.fi, 2026-10-19).
4. **There is no Liquary trading API and no price/book API.** The only public API is a free, keyless, CC BY 4.0 **HIP-4 metadata + archive** API (`https://api.liquary.xyz/v1`). Its own OpenAPI says `live.json` has "no prices ... read Hyperliquid's allMids by yesCoin/noCoin".
5. **Still useful as a helper, not as a venue**: `live.json` resolves Hyperliquid's `template:` pointers into human-readable titles, sides, competition, fixture (home/away/start), category, underlying and deployer for every live HIP-4 outcome; `archive.json`/`events.json` keep settled markets (result, volume, traders, final scores, rules) after Hyperliquid purges them. That is exactly the raw material for market linking and for backtests on HIP-4.
6. **adapter_priority = skip** for a Liquary venue adapter (duplicate liquidity, no trade/price API, Terms bar US persons and unauthorised bots). Recommendation: build the Hyperliquid HIP-4 adapter and optionally consume Liquary's `/v1/live.json` + `/v1/archive*.json` inside it as an enrichment/archive source (with CC BY attribution).

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `GET https://api.liquary.xyz/v1/live.json` -> 200, `generatedAt` 1792383306499 (2026-10-19 ~04:15Z), 208 listings, rebuilt every 60 s | H |
| `GET /v1/manifest.json` -> 200, 12,328 settled price markets + 1,323 settled event markets, last shard 2026-10 | H |
| Terms of Service "Last updated: September 30, 2026" (raw HTML of https://liquary.xyz/terms) | H |
| Docs state the builder fee is "0% until October 31, 2026, 11:59 PM UTC" and that the Polymarket builder fee has been 0% "as of September 2026" | H |
| GitHub `liquary-xyz`: 3 public repos, latest push 2026-09-29 (account created 2026-04-25); the app code is private | H |
| DefiLlama lists "Liquary Outcome" (id 8998, category Interface, tag "Hyperliquid HIP4 Builder", `listedAt` 2026-10-08) under parent "Liquary" with siblings Liquary / Liquary Perps / Liquary Spot | H |

Verdict: **still_live = true**. Note it is young: Hypersight LLC was incorporated in May 2026 (Terms/about page, M), and the DefiLlama adapter module is named `hypersight-outcome` with builder data back to 2026-06-01 while the Terms refer to a "HYPERSIGHT" referral code, which suggests Hypersight was the earlier brand (M, inference; the about page does not say so).

---

## 2. Kind and market model

- **Kind:** `broker-or-frontend` (H). Docs: "Orders are signed by the user or an approved trading agent and settle on Hyperliquid, or on Polymarket for orders sent there." https://docs.liquary.xyz/
- **HIP-4 market model (H, Liquary docs + Hyperliquid docs):** USDC-quoted, fully collateralised Yes/No outcome tokens on a Hyperliquid order book; prices 0.001-0.999; market and limit orders; "the smallest position is $1" (Liquary UI rule, not necessarily the protocol minimum); Yes and No books are **merged** (buy Yes at p = sell No at 1-p). A "question" groups outcomes where exactly one settles Yes, which gives **categorical** markets (one book per leg, each leg has its own yes/no coin). Standalone outcomes can settle to a fraction (Hyperliquid docs: Yes -> `settleFraction`, No -> `1 - settleFraction`); a **draw on a two-sided match pays 0.5 / 0.5** (docs) and I saw it in archive data (event 8765, Giants vs Commanders 27-27, `winnerSide: -1`, `winnerLabel: "Draw"`, fixture `events_sample.json`).
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** `encoding = 10 * outcome + side` (side 0 or 1); coin `#<encoding>`; token `+<encoding>`; order asset id `100_000_000 + encoding`. Liquary's `yesCoin`/`noCoin` are exactly these coins (live check: outcome 1473 -> `#14730` / `#14731`).
- **Scalar:** the Liquary schema has a `scalar` payout-band field ("the side price is a level inside it, not a probability"); **0 of 208 live listings had one** on 2026-10-19 (H). Treat as present-in-schema, absent-in-practice.
- **Polymarket leg (H, https://docs.liquary.xyz/predictions/polymarket):** Polymarket CLOB on Polygon, collateral "pUSD", orders go to one venue and are never split between Hyperliquid and Polymarket. Polymarket's model is covered by its own spec; not repeated here.
- **Cross-deployer dedupe (H, docs):** "When several deployers list the same fixture, Liquary shows one card. Market buys are routed across venues cheapest-first. Sells aren't routed". "Venue" here means HIP-4 deployer (`out`, `txyz`, `skew`), not exchange. This is a small precedent for the aggregator's own linking logic (key = competition + home/away + start time).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue for HIP-4 | Hyperliquid L1 / HyperCore (not EVM) | H |
| Collateral | USDC on HyperCore (one balance shared by perps, spot, predictions) | H |
| Polymarket leg | Polygon, pUSD; USDC moves HyperCore -> Polymarket balance in ~30 s, $2 minimum; also top-up from USDC/USDC.e/POL on Polygon | H (docs) |
| Deposit chains (via LI.FI) | Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Robinhood Chain, Solana | H (FAQ via WebFetch: M) |
| Withdrawal | USDC to Arbitrum is a flat 1 USDC via Hyperliquid's bridge; bridge/swap carries a 0.15% Liquary integrator fee (not covered by the 0% promo) | H |
| Account activation | 1 USDC once for new Hyperliquid accounts; first deposit minimum $2 | H |
| Wallets | Connect your own, or email/Google creates an embedded self-custodial wallet (provider: Privy per Terms 3.G.1) | H |
| Liquary-owned contracts | NOT FOUND (security page and docs name none; no audits mentioned) | - |

---

## 4. Read API (Liquary's own)

- **Existence:** `official-public`, but **metadata + archive only**. Docs: https://docs.liquary.xyz/api-reference/hip4-archive ; OpenAPI 3.1 at https://api.liquary.xyz/v1/openapi.json (H, fetched, 65 KB). The only documented API section is "HIP-4 Archive". The site footer links it as "API"; the landing page calls it "public API, Free".
- **Base URL:** `https://api.liquary.xyz/v1` (H). `/v1/manifest.json` is also served at the root.
- **Auth:** none. `GET` (also `HEAD`, `OPTIONS` -> 200 confirmed); other methods 405. No query parameters. CORS `*`. JSON only. (H)
- **Rate limit:** 300 requests/min/IP; over the limit -> `429` with `Retry-After: 60` and `X-RateLimit-Limit`; higher limits by contacting Liquary. No SLA ("best-effort availability"). (H, docs). I did not trigger a 429.
- **Caching:** `ETag` on every response; `If-None-Match` -> `304` confirmed live (H). `cache-control: public, max-age=60, s-maxage=60..300`.
- **Websocket:** none (NOT FOUND; docs say snapshots "are not a live feed").
- **Versioning:** `v1` changes "additively only" (docs). Caveat: from 2026-09-16 to 2026-09-22 the API served only a rolling 30-day window, then reverted to the full archive (manifest note, H) - a reminder that data scope can change without a version bump.
- **Licence:** CC BY 4.0, commercial use allowed, attribution "Liquary (liquary.xyz)" required (manifest + OpenAPI, H). OpenAPI `termsOfService` -> https://docs.liquary.xyz/api-reference/hip4-archive#using-the-data.

Key endpoints (all H, from OpenAPI + live probes):

| Endpoint | Content | Size on 2026-10-19 |
|---|---|---|
| `/v1/live.json` | every HIP-4 market Hyperliquid lists now, template pointer resolved; **no prices/volume/history**; rebuilt every 60 s, a new market appears within ~2 min; 503 if Hyperliquid did not answer | 136 KB, 208 listings / 300 outcomes |
| `/v1/archive.json`, `/v1/archive/{YYYY-MM}.json` | settled **price** markets: target, settlePrice, result (`up` = YES won), totalVolume, yes/noVolume, traders, buy/sell/split/settle notional | 5.4 MB, 12,328 rows |
| `/v1/events.json`, `/v1/events/{YYYY-MM}.json` | resolved **event** markets (sports, macro, one-offs): winnerSide (0, 1, -1 = nobody/draw), scores, rules text, volume, traders | 1.96 MB, 1,323 rows |
| `/v1/changes.json` | newest-first feed of recent resolutions (limit 500) for incremental sync | 46 KB |
| `/v1/markets/{outcomeId}.json` | one market: result, `flow`, `dataQuality`, `oddsMeta`, `settlementApplicable` | ~2.7 KB |
| `/v1/markets/{id}/settlement.json`, `/price.json` | validator voter roster at vote time; underlying price at 5-min resolution | not fetched |
| `/v1/governance.json` | validator settlement activity | 11 KB |
| `/v1/manifest.json`, `/v1/openapi.json` | counts, shards, freshness contract; schema | 1.2 KB / 65 KB |

**Explicitly not served** (docs): the odds series, a bulk export, per-wallet data. Hence **no order book, no mid price, no trade tape** from Liquary: get prices from Hyperliquid (`allMids`, `l2Book`, WS) using `yesCoin`/`noCoin`.

Confirmed shapes (fixtures in `docs/research/fixtures/liquary/`, all trimmed, deployer addresses replaced by a placeholder):
- `manifest.json` (full), `live_sample.json` (8 of 208 listings), `archive_sample.json`, `events_sample.json`, `market_13267.json`, `changes_sample.json`, `defillama_liquary_outcome_volume.json`.
- `live.json` row: `{kind: "binary"|"question", outcomeId|null, questionId|null, title, rawName, template, sides|null, yesCoin|null, noCoin|null, legs: [{outcomeId, label, yesCoin, noCoin}]|null, category, competition, fixture{home,away,competition,sport,startMs,stage}|null, underlying|null, expiryMs, scalar|null, deployer{protocol, venue: "out"|"txyz"|"skew"|null, address|null}, url, image}`.

**Data-quality gotchas for an ingester (H, computed from the live files on 2026-10-19):**
- In `events.json`, **1,010 of 1,323 rows carry an unresolved pointer** as `questionTitle`/`outcomeLabel` (e.g. `"template:sportsSpread"`), sides like `"template:Yes"`/`"template:{shortNameB}"`, and **988 carry the literal category `"sports/{sport}"`**; 255 have `homeTeam` null. The resolved titles exist in `live.json` only while a market is live. So **snapshot `live.json` before settlement** (or parse the key:value `description`, e.g. `participantA:...|participantB:...|spread:-1.5|officialSource:ESPN`) if you want readable archive rows.
- `traders`, split fields and `yesVolume/noVolume` can be `null` = "not captured/not swept", never zero (docs).
- `totalVolume` includes mints, merges and settlement payouts; use `buyNotional + sellNotional` for traded volume (docs; and see the fixture `market_13267.json`, `totalVolume` 132.5 vs buy+sell 86.5).
- Market `#16` is withdrawn (permanent 404); withdrawals are not announced in `changes.json` (docs).
- `live.json` still lists markets whose `expiryMs` has passed but which are not yet settled (min `expiryMs` was 2026-10-18 20:05 UTC while the file was generated 2026-10-19 04:15 UTC) - do not treat a listed market as tradable without checking Hyperliquid's book.

---

## 5. Trade path (programmatic)

**None via Liquary.** There is no order-placement API. Trading happens in the browser app: the user signs once to approve a **trading agent** (a delegated key stored in browser local storage, three storage modes: Risk/Normal/Safe) plus a capped builder fee; the agent "can place and cancel orders and adjust leverage" but "cannot withdraw" (docs https://docs.liquary.xyz/account/trading-agents, H via WebFetch: M). Terms 3.N prohibit using "unauthorized process or software (including automated tools, crawlers, bots, or scripts) to extract ... data generated or stored by the Interface" and creating/distributing bots "not authorized by the Company" (raw HTML, H). The docs do not say whether third-party bots may reuse Liquary agent keys (NOT FOUND).

Programmatic access to the same books is the **Hyperliquid API** (WS + REST `/info`, signed `/exchange` actions; outcome asset id `100_000_000 + 10*outcome + side`; split/merge/negate via `{"type":"userOutcome", ...}`, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint, H). That is specified in `hyperliquid-hip-4-outcomes-native.md`. Hyperliquid attribution to Liquary is a builder code (`b` = builder address, `f` = fee in tenths of a basis point) on the order; an aggregator would not use it and would not need Liquary's approval.

---

## 6. Reachability from a PayBox wallet

- **Via Liquary itself: no.** Nothing to call; no EVM transaction-proposal surface; the app signs in-browser with an embedded/connected wallet or a locally stored agent key.
- **Underlying venue: partial** (see `hyperliquid-hip-4-outcomes-native.md` section 6): Hyperliquid orders are signed HyperCore actions, not EVM transactions, so PayBox "transaction proposals" do not apply. PayBox `request_wallet_sign` supports EIP-712 `typedData` and `raw` digests with no documented domain/chainId restriction (`docs/research/06-paybox-platform.md`, H per that note), so a PayBox EVM wallet could sign `approveAgent` and, in principle, order actions that our plugin hashes; funding via Arbitrum USDC is in PayBox's chain set. I did not call any PayBox tool.
- **Polymarket leg:** reachable only through the Polymarket adapter (Polygon), not through Liquary.
- Geo: Liquary bars US persons outright (Terms 1.B/3.A), so a US-resident PayBox user could not use Liquary at all.

---

## 7. Fees (H, https://docs.liquary.xyz/trading/fees; fee claims re-checked in raw HTML)

HIP-4 / prediction markets:
- **Liquary builder fee:** flat **0.05% per fill**, buying and selling alike, not volume-tiered; **waived (0%) until 2026-10-31 23:59 UTC**. Collected on-chain through Hyperliquid builder codes; the user approves up to a 0.1% ceiling once. Holding to settlement: no Liquary fee. Referred accounts get a 5% discount on the Liquary fee. (The docs state the 0.05% figure and the waiver; they do not state it will be re-enabled, only that "the schedule below resumes afterwards".)
- **Hyperliquid fee:** charged to the **seller only**, never on a buy; rate = the user's **spot taker rate x a factor set by the market's deployer** (so identical sales cost different amounts on `out`/`txyz`/`skew`); winning shares pay the same fee on the settlement payout; losing shares pay none. Hyperliquid's own fee page: "Outcome trading only charges fees when closing or settling", maker rebates not supported (users who would earn a rebate pay 0 on maker orders) (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, H). The HIP-4 spec page still says "Fees are currently zero ... initial testing" (stale, H). Numeric deployer factors: NOT FOUND in Liquary docs (the `outcomeCreated` WS frame carries `deployerFeeScale` per the Hyperliquid note).
- Base spot taker rate: 0.070%, maker 0.040% before VIP/staking/referral discounts (H, Liquary docs table of Hyperliquid base rates).
- Lifetime HIP-4 fees across the whole venue: $72.6k total, of which $19.4k builder fees, per the Liquary data page (M; this is venue-wide, not Liquary-only).

Polymarket via Liquary: Polymarket taker fee `shares x rate x price x (1 - price)`, rate per market category; makers pay nothing; redeem free; Liquary builder fee 0% (as of Sept 2026); Terms cap it at 1% taker / 0.5% maker. Transfers HyperCore <-> Polymarket carry no Liquary fee. (H)

Swap/bridge: 0.15% Liquary integrator fee on Bridge and the HyperEVM swap tab. (H)

---

## 8. Resolution mechanism and dispute risk

Liquary does not resolve anything and "cannot review, dispute, or reverse outcomes" (Terms 2.E-F, H). Resolution is whatever the underlying market does:
- **Protocol "Recurring" price markets** (Hyperliquid-deployed; 5 live listings): deterministic, settle to the Hyperliquid **mark price** linearly interpolated between the mark updates before/after expiry (`markPrice0 + (settlementTime - t0)/(t1 - t0) * (markPrice1 - markPrice0) >= targetPrice`; bucket markets use the same computation). H (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications). Basis risk versus Polymarket/Kalshi price markets, which use other oracles and rounding.
- **Hyperliquid-run event markets:** "Markets run by Hyperliquid settle by validator vote" (docs, H). The Data page's "Hyperliquid" deployer row (1,453 markets, M) mixes these with the oracle-settled recurring price markets. Liquary records the voter roster and stake weight at vote time (`settlement.json`, the only record that survives); `settlementApplicable` is false for oracle-settled price markets and third-party-settled markets.
- **Third-party deployers (`out`, `txyz`, `skew`; 203 of 208 live listings on 2026-10-19, H computed):** "settled by that deployer's own key, with no validator vote" (docs, H). No dispute window or appeal is documented. Questions, sides and rules are the deployer's free text and "not moderated" (docs). The settlement speed varies by deployer (docs; figures not found).
- **Rule differences that matter for arbitrage:** draws pay 0.5/0.5 on two-sided templates; `awardWinner` has an "Other" leg; policy-rate questions carry a protocol fallback outcome and a "No change if undetermined by the deadline" clause (Hyperliquid template text, H); "regulation time and any overtime" style `countedPlay` rules appear in sports descriptions. Link by rules text, not only by title.
- Polymarket legs follow Polymarket's own resolution process (Terms 2.F).
- Liquary may hide/delist markets on its Interface at its discretion without affecting on-chain markets (Terms, M).

---

## 9. Geo, ToS, automation (quote sparingly)

- Operator: Hypersight LLC, Wyoming (Terms). Governing law Wyoming; individual AAA arbitration in New York; class-action waiver; liability cap USD 100 (Terms, H/M).
- **US persons barred:** "the Company does not offer the Interface or any Liquary Service to U.S. persons, and access from the United States and its territories is strictly prohibited" (Terms 1.B, H raw HTML).
- Prohibited for all services: US and territories, Ontario, China, Cuba, Crimea and occupied Ukrainian regions, Iran, North Korea, Sudan, Syria, Afghanistan, Myanmar and other sanctioned places; prediction markets add France, Belgium, Germany, Italy, Portugal, Poland, Switzerland, UK, Singapore, Taiwan, Thailand, Australia, Brazil and parts of Canada (Terms 3, M). Citizens of listed jurisdictions are restricted even when elsewhere. "You must not use a VPN, proxy, Tor, or similar technology to circumvent geo-blocks" (H).
- Polymarket via Liquary: blocked list plus a "close-only" list that includes the US and UK (docs, M); "If a location cannot be checked, Liquary treats you as blocked."
- No KYC mentioned (AML information requests only on authority instruction, Terms 3.P, M).
- **Automation:** the Interface forbids unauthorised bots/scraping (above). The **API is the sanctioned data path** and is free for commercial use with attribution, so ingesting `api.liquary.xyz` is fine; building a trading bot on the Liquary UI is not.
- Contact for higher API limits: via https://docs.liquary.xyz/resources/links (not read). I supplied no contact details.

---

## 10. Liquidity (dated)

Everything below is **Hyperliquid HIP-4 liquidity**, not Liquary-owned.

| Metric | Value | Source, date, tag |
|---|---|---|
| Liquary-attributed HIP-4 volume (builder code) | 24h $0; 7d $147; 30d $2,330; all time $57,371; best day $5,150 (2026-06-04) | api.llama.fi `summary/dexs/liquary-outcome`, 2026-10-19 (H). Methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" |
| Liquary-attributed fees | all time ~$5.7 (the builder fee is currently waived) | api.llama.fi `summary/fees/liquary-outcome` (H) |
| Live listings | 208 listings = 174 binaries + 34 questions (126 legs) = **300 outcomes** | `live.json`, 2026-10-19 04:15Z (H) |
| Settled history | 12,328 price + 1,323 event markets since 2026-05-03 | `manifest.json` (H) |
| Venue-wide lifetime volume | $415.15M ($531.06M incl. settlement); 12,370 resolved markets | https://liquary.xyz/data, 2026-10-19 (M, page summary) |
| My sum of archive `totalVolume` (incl. mints/payouts) | price $294.0M + events $355.9M = $650M; traded notional (buy+sell, only where captured) price ~$180M + events ~$214M | `archive.json`/`events.json`, 2026-10-19 (H computed; differs from the /data page by method, treat as same order of magnitude) |
| Recent traded volume (settled markets only, buy+sell) | last 7 days ~$19.7M (~$2.8M/day); 2026-10-01..19 ~$50M | computed from `archive.json`+`events.json` (H computed; excludes still-live markets) |
| Volume "today" | $4.16M ($4.51M incl. settlement) at fetch time | liquary.xyz/data (M) |
| By deployer (lifetime) | Hyperliquid 1,453 mkts / $310M; Outcome ("out") 9,001 / $99.8M; Trade[XYZ] 1,060 / $4.4M; Skew 2,460 / $0.8M | liquary.xyz/data (M; columns unlabelled on the page) |

Concentration (H computed): the largest settled event markets were 2026 World Cup winner/semi-final markets ($4-20M each); the World Cup ended in July, so recent volume is more NFL/EPL/UCL weekend sports, BTC/ETH/HYPE price binaries and the FOMC question. The most active price markets are BTC daily binaries (BTC 6,951 of 12,328 settled price rows; HYPE 2,464; ETH 1,655). Many price rows have zero volume (extreme buckets). Compare the Hyperliquid note: DefiLlama `hyperliquid-outcomes` $3.13M on 2026-10-18.

---

## 11. Event categories and cross-venue overlap

Live outcome counts by Liquary category and template (H computed, 2026-10-19):

| Category | Outcomes (templates) | Overlap with |
|---|---|---|
| sport | 75 outcomes in 3-way soccer contest-result questions (UEFA Champions League 54, Europa League 18, EPL 3), 34 tournament-winner futures (e.g. EPL winner), 20 two-way contest-winner (NBA 15, NFL 5), NFL spreads 5 and totals 5; esports 4 (LoL) | Polymarket, Kalshi, Limitless, XO, Azuro etc.: strongest overlap; check draw/overtime rules |
| crypto | 50 `binaryPrice` + 9 `priceTouch` + 7 recurring BTC ladder/binary (BTC 31, ETH 16, HYPE 11, ZEC 4) | Polymarket/Kalshi crypto price markets (different oracle/time conventions) |
| macro | 6 outcomes: FOMC (October 2026) rate decision (No change/Decrease/Increase + fallback) | Kalshi/Polymarket Fed markets |
| stocks / equities | 50 `binaryPrice` on `xyz:` perps (SP500, XYZ100, TSLA, META, NFLX...), 10 IPO first-day market-cap, 3 IPO-confirmed (Anthropic and others) | Kalshi/Polymarket IPO and index markets, partial |
| commodities | 10 `binaryPrice` + 4 `priceTouch` (xyz:CL, GOLD, SILVER) | Kalshi commodities, partial |
| other | 8 awards (Ballon d'Or) | Polymarket |

Nothing unique to Liquary: all of this is the Hyperliquid HIP-4 catalogue (venue tags `out` 80 listings, `txyz` 62, `skew` 61, protocol 5).

---

## 12. Shared liquidity? **Yes - not an independent leg.**

- HIP-4 books = Hyperliquid HIP-4 (`hyperliquid-hip-4-outcomes-native`); deployer sub-venues are also covered by `events-by-tradexyz-hip-4-deployer-venue-txyz` and `skew-markets-hip-4-deployer`.
- Polymarket books = Polymarket (covered by the parallel workflow).
- Other HIP-4 front-ends exist (e.g. `presagio-presagio-xyz-hip-4-interface` in this repo's venue notes). An aggregator that counts Liquary as a separate venue would double-count the same orders.

---

## 13. If we consume the Liquary API (optional helper spec)

- **Poll:** `live.json` every 60 s with `If-None-Match` (ETag), snapshot titles/fixtures into our own store before settlement; `changes.json` every 1-5 min for settlement events (re-read aggregates if our last sync is older than `oldestSettledAt`); `archive.json`/`events.json` nightly or on demand. Budget: well under 300 req/min/IP.
- **Join key:** `yesCoin`/`noCoin` (`#<10*outcome+side>`) <-> Hyperliquid WS/REST coin; outcomeId = `(int(coin[1:]) // 10)`; side = last digit. Questions: iterate `legs[]`, one book per leg.
- **Map to canonical market:** `title` + `fixture{home,away,startMs,competition}` + `underlying` + `expiryMs` + `category` + `template` (treat the template as a pointer, not an identity - docs). Always carry `deployer.venue` into the resolution-risk field.
- **Attribution:** keep "Liquary (liquary.xyz)" in any UI/data product (CC BY 4.0).
- **Failure modes:** `live.json` 503 when Hyperliquid did not answer (never empty); 404 on a market that is still trading (per-market docs exist only after settlement); aggregates may lag minutes, per-market docs up to an hour; no SLA.

---

## 14. Priority

**adapter_priority = skip** (as a venue). Reasons: duplicate liquidity (Hyperliquid HIP-4 + Polymarket), no trade API, no price/book API, own flow ~$0 per DefiLlama, Terms bar US persons and unauthorised automation, no independent resolution. The metadata API is a cheap **optional enrichment** (title resolution, fixture fields, settled-market archive) for the Hyperliquid HIP-4 adapter and for backtests, and Liquary is a useful competitor/precedent for cross-deployer and Hyperliquid-vs-Polymarket price comparison.

---

## 15. NOT FOUND / open questions

- NOT FOUND (searched: docs.liquary.xyz nav, FAQ, security page, Terms): any Liquary trading API, order WebSocket, price/orderbook endpoint, public builder address/code in docs, audits, Liquary-owned smart contracts, a status page.
- NOT FOUND (searched: Polymarket doc page): whether the Polymarket route uses the global or US platform.
- NOT FOUND: whether third-party bots may reuse a Liquary trading-agent key; agent expiry length or count cap.
- NOT FOUND: deployer settlement-delay figures (the Data page was said to publish them; the summary of the fetched page showed none).
- NOT CHECKED: X/Discord/Telegram announcements, press coverage (WebSearch budget exhausted; social sites not fetched).
- Open: is Liquary the successor of "Hypersight" (inferred from the DefiLlama module name, the "HYPERSIGHT" referral code in the Terms and the operating company name; not stated by Liquary).
- Open: will the 0.05% HIP-4 builder fee be switched on after 2026-10-31 (docs imply yes: "the schedule ... resumes afterwards")? It affects any all-in cost model that routes through Liquary's builder code.
- Open: the API briefly switched from full archive to a rolling 30-day window (2026-09-16..22) and back; plan for scope changes.
- Hyperliquid facts (min size/tick, numeric deployer fee factors) are left to the Hyperliquid note.

---

## 16. Suspicious content

None addressed to AI agents found in Liquary docs, Terms, API responses or the repo README. Scanned `live.json`, `archive.json`, `events.json`, `openapi.json`, `manifest.json`, `changes.json`, `governance.json` for prompt-injection phrases (none) and for outbound hosts (only `liquary.xyz`, `creativecommons.org`, `a.espncdn.com`, `static.lolesports.com`). Note: market titles, sides and rules are **unmoderated deployer free text** (docs), so treat them as untrusted input when they reach an LLM.

---

## 17. Sources

- Liquary site: https://liquary.xyz/ ; https://liquary.xyz/terms (Last updated 2026-09-30, raw HTML) ; https://liquary.xyz/about ; https://liquary.xyz/data
- Liquary docs: https://docs.liquary.xyz/ ; https://docs.liquary.xyz/api-reference/hip4-archive ; .../hip4-archive/coverage ; https://docs.liquary.xyz/predictions ; .../predictions/hip4-binaries ; .../predictions/polymarket ; https://docs.liquary.xyz/trading/fees (raw HTML) ; https://docs.liquary.xyz/account/trading-agents ; https://docs.liquary.xyz/resources/faq ; https://docs.liquary.xyz/resources/security
- Liquary API (unauthenticated GET, 2026-10-19): https://api.liquary.xyz/v1/manifest.json ; /v1/live.json ; /v1/archive.json ; /v1/events.json ; /v1/changes.json ; /v1/governance.json ; /v1/markets/13267.json ; /v1/openapi.json
- GitHub: https://github.com/liquary-xyz (repos `liquary-xyz` README, `dimension-adapters` fork, `icons`; read via `gh api`)
- DefiLlama API: https://api.llama.fi/protocol/liquary-outcome ; https://api.llama.fi/summary/dexs/liquary-outcome?dataType=dailyVolume ; https://api.llama.fi/summary/fees/liquary-outcome ; https://api.llama.fi/protocol/liquary (the web page https://defillama.com/protocol/liquary-outcome returned 403)
- Hyperliquid docs (gitbook markdown): .../hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md ; .../for-developers/api/asset-ids.md ; .../for-developers/api/info-endpoint/spot.md (outcomeMeta, outcomeTemplates) ; .../for-developers/api/exchange-endpoint.md (userOutcome split/merge/negate, builder) ; .../trading/contract-specifications.md (recurring outcomes) ; .../trading/fees.md (outcome tokens)
- Project notes: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/06-paybox-platform.md`
- Fixtures: `docs/research/fixtures/liquary/` (manifest.json, live_sample.json, archive_sample.json, events_sample.json, market_13267.json, changes_sample.json, defillama_liquary_outcome_volume.json)

---

## 18. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1` (curl `-A`); no From/Referer/X- headers, contact parameters or personal identifiers in any URL or query. The local Python scripts only read/wrote local files and made no network calls; none contains an email address (the fixture writer held a local output directory path, which was never sent anywhere and is not in any fixture or note). Fixtures were scanned for "@" and 40-hex wallet addresses (none; deployer addresses were replaced by a placeholder). No user wallet address was read or written. The operator's legal contact address that appears in the Terms was deliberately not copied.
