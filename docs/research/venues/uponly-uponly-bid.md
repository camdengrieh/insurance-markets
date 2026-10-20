# UpOnly (uponly.bid) - venue spec

Researched 2026-10-19 (system clock of the machine ran ~UTC 07:1x on 2026-10-19). Read-only: public unauthenticated GETs, official docs, the site's own public JS bundles (read as text, not executed). No account, wallet, key, signature or POST. No PayBox tool called.

Confidence: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak/stale. "NOT FOUND (searched: ...)" = documented absence.

## Verdict

**adapter_priority: skip.** UpOnly is a thin browser front end that routes orders into **Polymarket's own CLOB** with a builder code attached. It has no API, no book, no liquidity and no resolution logic of its own. Its markets are Polymarket's Up/Down crypto series, so it is **not an independent arbitrage leg**; it is a duplicate of Polymarket liquidity. It also looks dormant (see Liveness). The only reusable facts are (a) the Polymarket Up/Down series IDs below (belong in the Polymarket adapter) and (b) the Polymarket builder-code mechanism (useful if the project ever wants its own attribution/fee).

## 1. Identity, kind, liveness

| Item | Finding |
|---|---|
| Name / URL | UpOnly, https://www.uponly.bid/ (Polymarket builder profile name "UpOnly.bid") |
| Kind | broker-or-frontend over Polymarket (not a venue) [H: site text + bundle] |
| Self-description | Title "UpOnly - Up/Down crypto markets on Polymarket"; meta: "Trade 5-minute, 15-minute and hourly Up/Down crypto markets on Polymarket. Live Chainlink prices, real order-book depth, binary payouts - no leverage." [H, https://www.uponly.bid/] |
| Footer | "Requires a Polymarket account - Not available in all regions - Not affiliated with Polymarket." [H] |
| Site live | Yes, HTTP 200 on `/` and `/profile` on 2026-10-19; `/terms` is 404 [H, curl]. Nav items Points, Analytics, Delta neutral, Agents are labelled "Soon" [H] |
| Attributed activity | Polymarket builder leaderboard, timePeriod=ALL: rank 195, volume 450,835.58, activeUsers 5, verified=true [H, `https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=150`]. Scanned all pages for DAY (151 builders), WEEK (206) and MONTH (291): **UpOnly.bid absent from all three** [H, same endpoint]. So no credited volume in the last ~30 days (M: absence from a leaderboard is inference) |
| Last attributed trade | `GET https://clob.polymarket.com/builder/trades?builder_code=<UpOnly code>` returns 54 trades total (`count`: 54, `next_cursor` "LTE=" = end), `matchTime` 2026-08-12 to 2026-09-26 (latest 2026-09-26T16:51Z, ~3 weeks before today), summed `sizeUsdc` ~308k, `builderFee` and `fee` all "0" [H]. Only 6 distinct markets, i.e. a handful of large trades, not retail flow (M) |
| Verdict on liveness | Frontend up; traffic effectively dormant/tiny since late September 2026 (M) |

Builder code (public identifier on Polymarket's leaderboard): `0xd962bdd7af9a8d315b9bdb0b6bac5eedb708e67c15f45db2013fdf86e354e848` [H].

## 2. Market model

Identical to Polymarket's (UpOnly creates nothing). [H: Gamma data + bundle]

- Binary Up/Down per time window; series per asset and timeframe. Site tabs: BTC, ETH, SOL, XRP, DOGE, BNB, HYPE, ZEC; timeframes 5m, 15m, 1h (SOL: 5m/15m only; ZEC: 5m/15m, flagged `illiquid` in the bundle) [H].
- CLOB order book (central limit order book, off-chain matching, on-chain settlement), outcomes tokenised as two ERC-1155 `clobTokenIds` (Up, Down), tick 0.01, min order 5 shares, `negRisk` false (sample market) [H, Gamma sample].
- Payout: "winning shares settle at $1.00, losing shares at $0.00. No leverage." [H, site].
- Gamma series IDs hard-coded in the UpOnly bundle (use for `series_id` in the Polymarket adapter): BTC 5m 10684 / 15m 10192 / 1h 10114; ETH 10683 / 10191 / 10117; SOL 10686 / 10423; XRP 10685 / 10422 / 10123; DOGE 11325 / 11328 / 11287; BNB 11326 / 11330 / 11291; HYPE 11327 / 11329 / 11289; ZEC 12517 / 12518 [H, `/_next/static/immutable/chunks/23jlugyrp9av7.js`].
- Markets are pre-created about a day ahead: with `order=startDate&ascending=false` the newest BTC 15m event on 2026-10-19 ~07:15Z ended 2026-10-20T07:15Z (slug `btc-updown-15m-<unix start>`) [H]. Note `closed=false` without ordering returns stale Dec 2025 events first; always pass `end_date_min` / ordering.

## 3. Chains and collateral

Polygon (the bundle references `polygon-rpc.com`, `polygon.drpc.org`, polygonscan, and Polymarket relayer `relayer-v2.polymarket.com`) [H]. Collateral is Polymarket's: pUSD on Polygon, 6 decimals (see `docs/research/08-venues-polymarket-kalshi.md` section on collateral; the Polymarket fee docs also quote pUSD) [H via cross-reference + https://docs.polymarket.com/programs/builders/fees]. The site itself says only "add some USDC" [H, site], which is loose wording. User must already have a Polymarket account; UpOnly asks to "connect the same wallet" [H].

## 4. Read API

**exists: none** (UpOnly has no API of its own). NOT FOUND (searched: homepage links, all 17 JS chunks for API hosts, `/terms` 404, web search "UpOnly uponly.bid Polymarket" returned nothing about the project). The site is a static Next.js client; all data comes straight from Polymarket and Binance/Chainlink from the browser [H, bundle host list: gamma-api, clob, data-api, relayer-v2, `fapi.binance.com`, `api.binance.com`, `ws stream.binance.com`, `data.chain.link/streams`].

Use the underlying Polymarket APIs instead (covered by the parallel Polymarket workflow):
- Discovery: `GET https://gamma-api.polymarket.com/events/keyset?closed=false&limit=N&series_id=<id>&order=startDate&ascending=false` [H, 200 verified, fixture].
- Book: `GET https://clob.polymarket.com/book?token_id=<clobTokenId>` [H, 200 verified, fixture: 31 bid levels, 30 ask levels].
- UpOnly-attributed trades: `GET https://clob.polymarket.com/builder/trades?builder_code=<code>` (public, no auth, per https://docs.polymarket.com/developers/builders/order-attribution) [H, fixture].
- Leaderboard: Data API v1 `/v1/builders/leaderboard` (offset paging). A v2 form exists with snake_case fields and cursor-only paging (`/v2/builders/leaderboard` rejects `offset`: "pages are cursor-only") [H]. Per `docs/research/08-venues-polymarket-kalshi.md` Data API v1 is scheduled for retirement 2026-10-24 [H via cross-reference], so do not build on v1.

Fixtures (all in `docs/research/fixtures/uponly-uponly-bid/`):
- `data-api-v1-builders-leaderboard-ALL.uponly-row.json` (the UpOnly row)
- `gamma-keyset-btc-updown-15m.sample.json` (one live-ish BTC 15m event, with `feeSchedule`, `resolutionSource`, `clobTokenIds`, liquidity)
- `clob-book-btc-updown-15m.sample.json` (full book)
- `clob-builder-trades-uponly.sample.json` (3 of 54 trades; counterparty address/hash/owner fields redacted by me)

## 5. Trade path

The UpOnly browser app does: connect browser wallet, authenticate a Polymarket CLOB session (API creds kept in `localStorage`), then `client.placeMarketOrder({tokenId, side, amount|shares, builderCode, maxSpend?, maxPrice?/minPrice?, orderType?})` via the Polymarket TypeScript SDK; the `builderCode` comes from build-time env `NEXT_PUBLIC_BUILDER_CODE` [H, bundle `1y4zaxdoep3pj.js`, `2sduyfyk3r1wk.js`]. Geoblock check calls `https://polymarket.com/api/geoblock` [H]. There is no UpOnly-side order API, so an agent has nothing to call at UpOnly; trading means calling Polymarket directly (EIP-712 order + L2 HMAC creds; see doc 08 sections 7 and 9). Builder-code attribution is a field inside the signed order (`builder` bytes32) [H, https://docs.polymarket.com/developers/builders/order-attribution].

## 6. PayBox reachability

**paybox_reachable: partial.** UpOnly itself: no, nothing to integrate. Underlying Polymarket on Polygon: "technically plausible, unverified" per `docs/research/08-venues-polymarket-kalshi.md` section 9 (EIP-712 typed-data signing via `request_wallet_sign`; Polygon chain support in PayBox not verified at tool level). Also geoblocking: the Polymarket geoblock endpoint returned `blocked: true` for this research host's country, so server-side submission is region-gated [H, curl; IP not recorded here].

## 7. Fees

- Platform fee (Polymarket, applies to these markets): Gamma `feeSchedule` on a live BTC 15m market: `{exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.2}`, `feeType: crypto_fees_v2`, `feesEnabled: true`; taker fee = C x rate x p x (1-p) (C shares, p price), makers pay 0 and receive a 20% rebate share [H, Gamma sample + https://docs.polymarket.com/trading/fees]. Example from docs: 100 shares at 0.50 = $1.75. Gamma also shows `makerBaseFee`/`takerBaseFee` 1000 (legacy field, meaning unclear) [H field, M meaning].
- Builder fee (UpOnly's own add-on): Polymarket allows builders to set taker up to 100 bps and maker up to 50 bps, default 0, paid by the trader, additive to platform fee: `builder_fee = notional x bps / 10000` [H, https://docs.polymarket.com/programs/builders/fees]. **UpOnly's observed builder fee is 0** on all 54 attributed trades (`builderFee: "0"`) [H, fixture]. The site states no fees at all [H].

## 8. Resolution

Polymarket Up/Down rules: resolves "Up" if the price at the end of the window is >= the price at the start, else "Down"; resolution source Chainlink Data Streams. The live 15m BTC market carries `resolutionSource: https://data.chain.link/streams/btc-usd-twap-60s-streams` (i.e. a 60-second TWAP stream), whereas the Dec 2025 sample pointed at the spot `btc-usd` stream, so the basis changed during 2026 [H, Gamma samples]. `umaResolutionStatuses: []`, `fallbackResolutionType: none` suggests no UMA dispute leg for these markets [H field, M interpretation]. UpOnly displays Binance candles for the "price to beat" but settlement is Chainlink [H, site]; that Binance-vs-Chainlink basis gap is a trap if used as a pricing signal. Dispute risk: low-moderate, oracle-defined [M].

## 9. Geo / ToS / automation

Site: "Not available in all regions" [H]. NOT FOUND (searched: homepage footer, `/terms` 404, bundle strings): any UpOnly terms of service or automation policy. Polymarket's rules govern; geoblock endpoint above [H]. Builder tiers: Unverified builders get 100 relayer txns/day, Verified 10,000/day, Partner unlimited; numeric API rate limits not published on the tiers page [H, https://docs.polymarket.com/programs/builders/tiers].

## 10. Liquidity

- UpOnly standalone: effectively none. Builder-attributed volume $450.8k all-time, 5 active users, nothing in the last 30 days of leaderboard windows (leaderboard fetched 2026-10-19) [H].
- Underlying book depth (shared with Polymarket, not additive): BTC 15m market `liquidityClob` ~$7.2k at 2026-10-19 ~07:16Z, best bid/ask 0.50/0.51, spread 0.01 [H, Gamma fixture]. Per-market liquidity is small; volume per market `None` in the sample.

## 11. Category overlap and arbitrage

Crypto price Up/Down only. Overlap venues: Polymarket (same books), Kalshi and Polymarket US 15-minute BTC markets (press, 2026-09-22 [M, TradingView/Cryptobriefing result via search]), perps/spot for hedging. **Liquidity shared with Polymarket: 100%.** UpOnly can never be a second leg against Polymarket. Its only signal value is as a source of Up/Down market-series IDs (already public via Gamma).

## 12. Suspicious content

None found. No AI-targeted instructions in the site HTML, bundles or API responses read. (The Polymarket builder/trades endpoint returns third-party wallet addresses; I redacted them in the fixture.)

## 13. Open questions

- Is the dormancy real or does UpOnly use a different/second builder code? (the bundle reads the code from an env var, so a rotated code would not show here.)
- Why the 54 attributed trades are few and large (e.g. 10,000 shares at 0.993); possibly builder-reward farming (L, speculation).
- Whether Gamma `takerBaseFee: 1000` is still meaningful under `crypto_fees_v2`.

## Sources

1. https://www.uponly.bid/ and its public JS chunks under `/_next/static/immutable/chunks/` (H) - site text, series IDs, endpoints, builder-code env var.
2. https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL,MONTH,WEEK,DAY}&limit=50&offset=N (H) - rank 195 in ALL, absent elsewhere.
3. https://clob.polymarket.com/builder/trades?builder_code=0xd962... (H) - 54 trades, 2026-08-12 to 2026-09-26.
4. https://gamma-api.polymarket.com/events/keyset?series_id=10192&order=startDate&ascending=false (H) - market structure, fees, resolution source.
5. https://clob.polymarket.com/book?token_id=... (H).
6. https://docs.polymarket.com/developers/builders/builder-intro, /developers/builders/order-attribution, /programs/builders/tiers, /programs/builders/fees, /trading/fees (H, via summarising fetch so exact figures M-H).
7. https://polymarket.com/api/geoblock (H, response shape only; contains caller IP so not stored).
8. `docs/research/08-venues-polymarket-kalshi.md` (project note, H for Polymarket V2/pUSD/PayBox section).
9. Web search for "UpOnly uponly.bid Polymarket builder up/down" found no coverage of the project; unrelated results on Polymarket Up/Down markets (M/L, not relied on except the 2026-09-22 Polymarket US 15-minute BTC launch mention).
