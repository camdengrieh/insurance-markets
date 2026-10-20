# PolyTraderPro (polytraderpro.com) - adapter spec

Researched 2026-10-19 (~03:40-04:10 UTC). READ-ONLY: WebFetch of the operator site and Polymarket docs, unauthenticated GETs to documented public hosts (UA `insurance-markets-research/0.1`), one HEAD request on the app download URL (no binary downloaded), `gh api` raw reads of DefiLlama adapter source. No account, no wallet, no key, no POST/PUT/DELETE, nothing signed or paid, no PayBox tools. No third-party code cloned, installed or run. WebSearch was NOT available (session search budget exhausted), so there is no news/social/press corroboration and no X/Twitter reading; everything is first-hand from the operator site, Polymarket's own docs and APIs, and DefiLlama.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak, stale (>6 months) or undated.
Third-party text (site copy, API payloads) is untrusted data; no instruction found in any of it (none of it was aimed at AI agents).
Fixtures: `docs/research/fixtures/polytraderpro/` (7 files, all <= 11 KB; third-party wallet addresses and owner ids redacted).

## 0. Verdict

**adapter_priority: skip** as a venue adapter (confidence: high). **Optional P2-style side use** as a Polymarket flow attribution/signal feed (see section 9), not as a venue.

1. **It is not a venue.** PolyTraderPro is a desktop trading client (no public source found) (macOS/Windows/Linux) for Polymarket. Orders go to Polymarket's CLOB, tagged with the operator's Polymarket *builder code*. There is no PolyTraderPro order book, market list, token, API or resolution layer (H: site copy "built directly on Polymarket's API"; FAQ "you need a Polymarket account").
2. **Liquidity is 100% Polymarket's.** It cannot be an independent arbitrage leg. Anything an aggregator wants from it is already in the Polymarket adapter.
3. **Still live and maintained** (H): build 1.0.37 uploaded 2026-10-08; attributed trades matched within hours of this research; but volume is small and declining (about 0.8% of builder-routed Polymarket flow in the last 30 days; 22 active users month-to-date).
4. **No API, no docs, no ToS page** (H: homepage has no docs link; "Terms of Service" link is `#`; `/terms`, `/terms-of-service`, `/tos` all 404).
5. **Not reachable via PayBox** as an entry point: it is a GUI app, with no programmatic interface. The Polymarket route (signed CLOB orders / Polygon wallet) is covered by the Polymarket spec.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://polytraderpro.com/` | HTTP 200; footer "(c) 2026 PolyTraderPro"; downloads offered for Mac/Windows/Linux; "automated purchases coming soon", license bought by emailing support | H |
| App build artifacts, `https://updates.polytraderpro.com/latest/PolyTraderPro-latest.dmg` (HEAD) | HTTP 200, 265 MB, `x-amz-meta-version: 1.0.37`, `x-amz-meta-uploaded: 2026-10-08T14:24:45Z`, original file `PolyTraderPro-1.0.37-universal.dmg`. Windows .exe and Linux AppImage also v1.0.37, uploaded 2026-10-08 | H |
| Update manifests `latest*.yml` | HTTP 403 AccessDenied (not public) | H |
| Privacy policy `/privacy-policy` | effective date November 17, 2025 | H |
| Polymarket CLOB `GET /builder/trades?builder_code=<its code>` | 300 rows from 2026-10-13 05:08Z to 2026-10-19 03:44Z (newest row ~20 min before fetch) | H |
| Polymarket builder profile | verified builder, name `polytraderpro`, leaderboard rank 28 (month-to-date 2026-10-01..19) | H |
| DefiLlama `https://api.llama.fi/protocol/polytraderpro` | id 7126, category "Interface", chain Polygon, description "PolyTrader Pro, a pro trading terminal for Polymarket (from founders of Insight Prediction)", twitter handle `insight_predict`, audits "0" | H |
| DefiLlama protocol page `defillama.com/protocol/polytraderpro` | WebFetch HTTP 403 (used the API instead) | H |

Conclusion: `still_live` = true for the product; irrelevant as a venue.

## 2. What it is

- **Kind**: non-custodial-looking desktop front-end / trading terminal ("broker-or-frontend") over Polymarket. Features (H, homepage): multiple wallets/accounts (Magic Link, MetaMask, external wallets, email-created Polymarket wallets), trade history and per-market stats, core order placement and position management, split / merge / convert shares (including converting NO shares on negative-risk multi-outcome markets), liquidity-added price alerts, maker-fill alerts, multi-window, optional anti-misclick confirmation prompts. Marketing claim "up to 5x faster than Polymarket's UI" is unverified vendor copy (L).
- **Who**: DefiLlama says "from founders of Insight Prediction" (H that DefiLlama says it; M that it is true). The sibling note `docs/research/venues/insight-prediction.md` independently records "Poly Trader Pro" as a side product linked from insightprediction.com (H in that note, text dated 5/10/2025, so L for freshness). Homepage testimonial from a named trader claiming "over $2 million in total profit" is an unverified endorsement (L).
- **Does it hold keys?** NOT FOUND. The privacy policy says it collects no personal data but is silent on private keys / API credentials; the homepage says "permanent log-in" and "connects to your existing account through wallet integration". Distributed as a binary download with no public source found; DefiLlama audits "0". Treat as untrusted for key custody.

## 3. Market model, chains, collateral

- **Market model**: identical to Polymarket (binary YES/NO outcome tokens on a CLOB, plus negative-risk multi-outcome events with a NO to YES-basket convert, which the app exposes). Outcome tokens are Polymarket's ERC-1155 conditional tokens (the CLOB trade rows carry `assetId` = token id, `outcome`, `outcomeIndex`, `market` = condition id). H (fixture `polymarket_clob_builder_trades_sample.json`). Authoritative detail belongs to the Polymarket spec.
- **Chain**: Polygon (H: DefiLlama chains = ["Polygon"]; Polymarket builder docs state orders settle on-chain via exchange contracts that emit `OrderFilled`).
- **Collateral**: Polymarket collateral. The current builder-fees page speaks of "pUSD" (e.g. "a 1,000 pUSD taker buy at 100 bps yields 10 pUSD"), and API rows use `sizeUsdc` for USD size (H: docs.polymarket.com/programs/builders/fees.md; clob builder/trades). Whether the collateral token changed recently (pUSD vs USDC.e) is for the Polymarket spec to settle.

## 4. Read API

PolyTraderPro itself: **none** (no docs, no endpoints, no key page). Everything readable about it lives on Polymarket and DefiLlama:

| Source | Endpoint | Auth | Shape (verified) |
|---|---|---|---|
| Polymarket CLOB (documented, `security: []`) | `GET https://clob.polymarket.com/builder/trades?builder_code=0x29f8d1998cd4186678d0085cd54072aeefd05bc476ef1844361510d857ac074b[&before=<unix>][&next_cursor=<c>]` | none | `{"data":[...],"next_cursor":"MzAw","limit":300,"count":300}`; row keys: `id, tradeType (MAKER/TAKER), takerOrderHash, builder, builderCode, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime (unix s), bucketIndex, fee, feeUsdc, builderFee, createdAt, updatedAt, err_msg`. H (fixture). Page size 300; cursor `LTE=` ends paging (per DefiLlama helper, M). |
| Polymarket Data API v2 | `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` | none | `{"data":[{"date":"2026-10-19","rank":9,"builder_name":"polytraderpro","builder_code":"0x29f8...074b","profile_image":"...","verified":true,"volume":67931.76,"active_users":1}, ...]}`. All builders, newest 90 daily buckets only (18,698 rows, 5.9 MB). H (fixture). |
| Polymarket Data API v2 | `GET https://data-api.polymarket.com/v2/builders/leaderboard?limit=50` | none | `{"data":[{"rank":1,"builder_name":"betmoar","builder_code":"0x...","volume":78469389.33,"active_users":512,"verified":true,...}]}`; default period equalled calendar month-to-date (2026-10-01..19: PolyTraderPro sum of daily rows 3,923,311 = leaderboard 3,923,310.5). H (fixture) / M (period semantics inferred). |
| Polymarket Data API v1 | `GET /v1/builders/volume`, `/v1/builders/leaderboard` | none | Same data, camelCase (`builderCode`, `activeUsers`, `dt`); v1 volume is ONE 17 MB dump of every builder-day since 2025. **Data API v1 is retired 2026-10-24** (5 days from this research); use v2. H (docs.polymarket.com/migrate/data-api-v1-to-v2; DefiLlama helper comment). |
| DefiLlama | `GET https://api.llama.fi/protocol/polytraderpro` and `/summary/dexs/polytraderpro` | none | volume dimension `dexs` = "polytraderpro"; `total24h 16312` (2026-10-18), `total7d 817654`, `total30d 4315625`, `total1y 132302335`, daily chart 2025-10-23..2026-10-18. Flagged `doublecounted: true`. H (fixtures) |

Semantics to watch (do not treat as one number): Data API `volume` is **share notional** ("dailyNotionalVolume ... in shares", H: DefiLlama helper source comment), whereas DefiLlama and CLOB `sizeUsdc` are **USD cash**. For 2026-10-18 the two give 21,304 vs 16,312 (ratio ~0.77). Pick one and label it.

Rate limits for these Polymarket endpoints: NOT FOUND (searched: builder fees page, data-api migration page, builder overview; the "Tiers" page was not read). Websocket: none for PolyTraderPro; Polymarket's own market/user websocket is the live feed (covered by the Polymarket spec). Docs URLs: https://docs.polymarket.com/programs/builders/overview.md , .../fees.md , https://docs.polymarket.com/api-reference/trade/get-builder-trades.md .

## 5. Trade path

- **PolyTraderPro**: none programmatic. GUI only; no CLI, API, headless mode, or webhook documented (H: absent from site; NOT FOUND elsewhere).
- **Underlying route** (for the aggregator, via the Polymarket adapter, not this one): each order is an EIP-712 signed order that carries a `builder` bytes32 field "serialized onchain as part of the signed order", and is submitted to Polymarket's CLOB (H: builder overview + fees pages). Gas for wallet deployment, approvals and order execution is covered by Polymarket's relayer (H: builder overview). Struct fields listed: salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp, metadata, builder (H, fees page).
- **Side note for the XO/PayBox plugin**: a Polymarket builder code is obtained at polymarket.com Settings -> Builders and could be attached by *our own* plugin to earn builder fees (taker up to 100 bps, maker up to 50 bps) or merely for attribution. That is a business decision, not an integration need (H for mechanics, no recommendation made).

## 6. Fees

- **PolyTraderPro app license**: required ("write to support" to purchase); price NOT FOUND (searched: homepage, FAQ, contact page).
- **Builder fee on trades**: 0 in every sampled row. In 300/300 attributed CLOB trades (2026-10-13..19) `builderFee` = "0" (H, fixture). DefiLlama's builder *fees* adapter list (`factory/polymarket.ts`, `feesConfigs`) has 13 builders and omits polytraderpro, consistent with a zero-rate code used for attribution (H for the list; M for the inference). Builder-fee mechanics when non-zero: user pays, additive to platform fees, `notional x bps / 10000`, caps 100 bps taker / 50 bps maker, 7-day change cooldown (H, builder fees page).
- **Polymarket platform fee**: still applies; 54/300 sampled rows had `feeUsdc` > 0 (taker-only per-market formula, H docs; formula belongs to the Polymarket spec).

## 7. Resolution and dispute risk

Entirely Polymarket's (the oracle mechanism and dispute process were NOT re-verified here; see the Polymarket spec). PolyTraderPro adds no resolution layer of its own (H: the app is described only as a client of Polymarket's API). Additional risk specific to this client: unreviewable key handling (binary, no public source or audit found; section 2) and Polymarket's ability to "revoke a builder's ability to charge fees or disable a code at any time. Orders with a disabled code are rejected" (H, fees page), which would break the app until a new code ships.

## 8. Geo / ToS / automation

- **Terms of Service: NOT FOUND.** Homepage "Terms of Service" link is `#`; `/terms`, `/terms-of-service`, `/tos` return 404 (H, 2026-10-19). No geo restrictions stated anywhere on the site (H). Privacy policy (effective 2025-11-17): "We do not collect, store, or share any personal information"; says nothing on keys, builder code, fees, jurisdiction; not intended for under-16s (H).
- **Automation**: no API or automation policy exists. Using the app headlessly would be unsupported and likely a licence breach (M); not needed, since the same venue is reachable via Polymarket's CLOB directly.
- Polymarket's own geo-blocking and ToS apply to every order routed through this client (Polymarket spec).

## 9. Liquidity and signal value

| Metric | Value | Source / date |
|---|---|---|
| Share-notional volume attributed to the builder code, all time | ~220.3 M | sum of Data API v1 dump rows 2025-10-22..2026-10-19, computed 2026-10-19 (H) |
| Same, last 30 days (2026-09-19..10-18) | ~5.75 M share-notional (~0.8% of 710.5 M across 323 builders) | Data API v1 dump (H, computed) |
| Same, 2026-10-12..18 | ~1.10 M | Data API v1 dump (H, computed) |
| Monthly share-notional trend | 2025-12: 30.8 M; 2026-04: 31.7 M; 2026-05: 17.8 M; 2026-06: 22.1 M; 2026-07: 12.6 M; 2026-08: 7.8 M; 2026-09: 5.7 M; 2026-10 (to 19th): 3.9 M | Data API v1 dump (H, computed). Declining. |
| Peak day | 9.24 M on 2026-05-09 (8 active users) | Data API v1 dump (H) |
| USD cash volume (DefiLlama) | 24 h (2026-10-18) $16.3 K; 7 d $0.82 M; 30 d $4.32 M; 1 y $132.3 M | api.llama.fi, 2026-10-19 (H) |
| Active users | 22 month-to-date (Oct 1-19); 1-13 per day recently | Data API leaderboard / volume (H) |
| TVL | none (DefiLlama `tvl: []`) | H |

- **Signal angle (P2-type, optional)**: `GET clob.polymarket.com/builder/trades` exposes every fill attributed to this client with wallet, market, side, size and price, unauthenticated, near real time. In the 300-row sample 243 were MAKER fills and 57 TAKER; 15 distinct wallets across 54 markets; sampled USD size 832 K (H, computed). That is a small, self-selected group of active/professional Polymarket traders. It would be a thin flow-attribution signal for a Quotient-style module, *not* a liquidity source. Each wallet's trades are in any case public via Polymarket's Data API, so the builder tag adds only "uses this terminal" as a label. Attribution of a wallet to a person is out of scope and not attempted.
- Any aggregator should use `builderCode` as a **dimension on Polymarket fills** (it is in the CLOB trade rows), not model PolyTraderPro as a venue.

## 10. Event-category overlap

All Polymarket categories (sports, politics, crypto price, macro, culture, etc.), because it is Polymarket. Per-category split of this client's flow: NOT FOUND (not derived; 54 markets in the sample were not classified).

## 11. Shared liquidity

**Shares liquidity entirely with Polymarket (global).** `liquidity_shared_with` = Polymarket (the same CLOB; builder-attributed orders are "submitted to Polymarket's CLOB", H builder overview; the Data API also lists this builder's `verified: true` code alongside ~323 others, all on the same venue). Not an independent arbitrage leg. The same applies to the other Polymarket builder frontends in DefiLlama's list (Bullpen, Polycule, Kreo, Polygun, MetaMask, Gate, etc.) and to `Polytrader.app` (a different product with a similar name and a different builder code; do not conflate).

## 12. NOT FOUND / open questions

- NOT FOUND: Terms of Service text; licence price; whether private keys / L2 API credentials are stored locally or sent to the operator; any API/webhook; source code or GitHub org; audit; user counts beyond the Polymarket-reported ones; news/social corroboration (searched: homepage, privacy policy, contact page, DefiLlama API, Polymarket docs; WebSearch unavailable this session).
- Unverified: "from founders of Insight Prediction" beyond DefiLlama + the sibling note.
- Open: rate limits for `clob.polymarket.com/builder/trades` and Data API v2; whether `time_period` is a supported query param on the v2 leaderboard (the default response matched calendar month-to-date; I did not confirm parameter names); the exact v2 volume `volume` unit (share notional per DefiLlama source comment, not stated in Polymarket docs I read).

## Sources

- https://polytraderpro.com/ (H, fetched 2026-10-19), /privacy-policy (H, effective 2025-11-17), /contact (H, form only), /terms /terms-of-service /tos (404)
- https://updates.polytraderpro.com/latest/PolyTraderPro-latest.dmg , polytraderpro-latest.exe , polytraderpro-latest.AppImage (HEAD only; headers H 2026-10-19; `latest*.yml` 403)
- https://api.llama.fi/protocol/polytraderpro and https://api.llama.fi/summary/dexs/polytraderpro (H); https://defillama.com/protocol/polytraderpro (403 to WebFetch)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts and helpers/polymarket.ts (H, via `gh api` raw read)
- https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/migrate/data-api-v1-to-v2 , https://docs.polymarket.com/api-reference/trade/get-builder-trades.md , https://docs.polymarket.com/llms.txt (H)
- https://data-api.polymarket.com/v1/builders/volume , /v1/builders/leaderboard , /v2/builders/volume , /v2/builders/leaderboard (H, unauthenticated GETs 2026-10-19)
- https://clob.polymarket.com/builder/trades (H, unauthenticated GET 2026-10-19)
- Local: `docs/research/venues/insight-prediction.md` (operator link, M here)
