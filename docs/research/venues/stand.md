# Stand (stand.trade) - venue spec for a cross-venue aggregator / arbitrage scanner

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

- **adapter_priority: skip** as a trading or arbitrage leg. Stand is a front end (a "builder" in Polymarket's Builder Program), not a venue. Its liquidity is Polymarket's CLOB, so it is not an independent leg. It has no public API that we could find, and its own site could not be read this session.
- The only integration-relevant facts are the ones where Stand touches Polymarket: Stand's orders carry a public builder code, and Polymarket publishes Stand-attributed volume and trades. Those belong to the Polymarket adapter, not a Stand adapter.
- Low-value optional use: Stand-attributed Polymarket flow (about 25 to 50 active wallets per day) as a weak "retail copy-trader flow" signal. Not recommended for v0.1.

## 1. Kind and liveness

| Item | Finding | Tag |
|---|---|---|
| Kind | Trading terminal / interface for prediction markets: whale tracking, copy trading, alerts, automated orders. Not a market venue; no markets of its own. | M (DefiLlama description + third-party lists) |
| DefiLlama listing | id 7127, category "Interface", chain Polygon, twitter StandDOTtrade, description "A pro trading prediction market terminal: auto trades, live feeds, alerts, & more." | H (https://api.llama.fi/protocol/stand, fetched 2026-10-19) |
| Still live (2026)? | Yes, on the evidence of on-chain-attributed flow: Polymarket's builder leaderboard shows `standtrade` with volume on every day up to 2026-10-18 (48 active users that day, rank 18 of that day's builders). | H (https://data-api.polymarket.com/v1/builders/volume and /v2/builders/volume, 2026-10-19) |
| Site reachable? | No. `www.stand.trade` returns HTTP 403 with `cf-mitigated: challenge` (Cloudflare managed challenge) to both curl and WebFetch. `/docs`, `/sitemap.xml`, `/discover` same. `docs.stand.trade`, `app.stand.trade`, `api.stand.trade` did not answer. I did not try to bypass the challenge (no browser automation, no archive/proxy services). `/llms.txt` returned 404. | H |
| Company | Early-stage startup; hiring a "Founding Full Stack Engineer" on Ashby (title only was readable). No funding, team size or launch date found. | M (https://jobs.ashbyhq.com/Stand/1a069efc-7b00-440f-b0e0-dca5c72d8334) |
| First attributed volume | 2025-10-10 (start date in DefiLlama adapter; first row in Polymarket builder dump). | H |

## 2. Market model, chains, collateral

- **Market model:** none of its own. Stand routes orders to Polymarket's CLOB (binary Yes/No outcome tokens identified by `assetId`; sizes reported in `sizeUsdc`, so USDC-denominated). I did not verify the token standard or the collateral token in this session; details belong in the Polymarket spec. The attributed trade rows show `assetId`, `outcome` ("Yes"/"No"), `outcomeIndex`, `price` 0 to 1, `sizeUsdc`, i.e. the standard Polymarket CLOB shape. H (https://clob.polymarket.com/builder/trades?builder_code=..., fixture `polymarket_clob_builder_trades_standtrade_shape.json`)
- **Chain:** Polygon (DefiLlama lists only Polygon). H (api.llama.fi)
- **Kalshi:** Third-party directories claim Stand "aggregates Polymarket and Kalshi" or shows Kalshi alongside Polymarket, and one lists "Polygon, Base". I could not confirm this from a Stand source, and no Kalshi-attributed flow or chain is visible on-chain. Treat as unverified. L/M (https://github.com/kairoslive/prediction-market-trading-tools-and-terminals README, dated 2026-08-27; https://github.com/buddies2705/awesome-prediction-market README; https://github.com/ilovecrypt0/Awesome-Polymarket-Trading-Bots-Analysis-Tools-And-More README)
- **Custody:** NOT FOUND (searched: stand.trade [blocked], third-party directories, job posting). Unknown whether users connect their own Polymarket account/wallet or Stand holds a proxy wallet. Matters only if we ever trade through Stand, which we will not.

## 3. Read API

- **exists: none (no public Stand API found).** NOT FOUND (searched: docs/api subdomains, /docs, llms.txt, GitHub repos and code search for stand.trade / standtrade, third-party directory entries). The kairoslive directory lists Stand's API column as "Not published". M
- **What is publicly readable about Stand, via Polymarket (unauthenticated GETs, confirmed 2026-10-19):**
  - `GET https://data-api.polymarket.com/v1/builders/volume` returns a flat array (about 17 MB, 53,156 rows, one row per builder per day: `dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank`). H. Do not pull it casually. DefiLlama's helper comment says **v1 is retired on 2026-10-24** and v2 replaces it (https://docs.polymarket.com/migrate/data-api-v1-to-v2, not re-read by me; the claim comes from the DefiLlama source). M
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=N` returns `{"data":[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`. DefiLlama's helper says it is not paginated and serves only the latest 90 daily buckets. H for shape (fixture `polymarket_v2_builders_volume_standtrade_latest.json`), M for the 90-day limit.
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<code>[&before=<unix>&next_cursor=<c>]` returns `{data[], next_cursor, limit:300, count}`. Each row has `id, tradeType (MAKER/TAKER), takerOrderHash, builder, market (conditionId), assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. It worked without auth. It exposes third-party wallet addresses, so the fixture is redacted. H (fixture `polymarket_clob_builder_trades_standtrade_shape.json`)
- **Stand's builder code (public, not a secret):** `0x13600b294191fc92924bb3ce4b969c1e7e2bab8f4c93c3fc6d0a51733df3c060`, builder name `standtrade`. H (Polymarket builders volume dump; also https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts)
- **Rate limits / websocket:** NOT FOUND for Stand. Polymarket's builder tiers page lists "Standard" non-relayer API limits for Unverified and Verified builders with no numbers. H (https://docs.polymarket.com/programs/builders/tiers)

## 4. Trade path and PayBox reachability

- **Stand's own trade path:** none documented. No order API, no signing scheme published. NOT FOUND.
- **PayBox reachable: no, for Stand itself.** There is nothing to call. An EVM wallet on PayBox (Polygon) could trade the same liquidity directly on Polymarket by signing CLOB orders (EIP-712) and doing the on-chain approvals as transaction proposals. That path is specified in the Polymarket venue notes, not here.
- **Builder-code side note:** Polymarket's docs say a builder code is attached to each order and "serialized onchain as part of the signed order", and volume is credited to the builder per matched trade. So an agent placing orders through its own Polymarket adapter could attach its own builder code (or none). It would not need to go through Stand. H (https://docs.polymarket.com/developers/builders/builder-intro)

## 5. Fees

- **Stand's fee to users: effectively 0 on the evidence.** The most recent 300 Stand-attributed trades (about 5 hours, 2026-10-18 19:45Z to 2026-10-19 00:52Z, about $41.5k notional, 27 distinct wallets) all show `builderFee = "0"` and `fee = "0"`. About half of the rows show a small non-zero `feeUsdc`, which looks like the Polymarket protocol taker fee rather than a Stand fee. A third-party note (2026-09) also says Stand charges 0 builder fee. H for the 300-row sample (CLOB builder/trades, 2026-10-19), L for the third-party claim (https://github.com/Alchemist-X/predict-raven docs/internal/plan/2026-05-04-raven-managed-product-plan.md). Stand may charge subscription or other fees: NOT FOUND (site blocked). One third-party comparison said "free to use; underlying platforms may have their own fees" (L, pm.wiki via search snippet; pm.wiki pages redirected to x.com and could not be read).
- **Polymarket builder fees (mechanics):** builders "can charge fees and monetize their order flow"; the tiers page does not state caps, payer or configuration. H that it does not say. For per-trade Polymarket fee formulas see the Polymarket spec.

## 6. Resolution and dispute risk

Inherited entirely from Polymarket (UMA optimistic oracle). Stand adds no resolution layer. See the Polymarket spec. Extra risk specific to Stand: none beyond front-end/custody risk, which is unknown.

## 7. Geo, ToS, automation

NOT FOUND (searched: stand.trade is behind a Cloudflare challenge; no ToS readable). Polymarket's own geo rules apply to any Polymarket-routed order. Automation through Stand is irrelevant because there is no API.

## 8. Liquidity (all Polymarket-routed; not Stand's own)

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Stand builder volume, last day (2026-10-18) | $367,057; 48 active users; rank 18 | Polymarket builders/volume v1 and v2, fetched 2026-10-19 | H |
| Last 7 days (to 2026-10-18) | $2.82M | summed from v1 rows | H |
| Last 30 days (to 2026-10-18) | $8.40M | summed from v1 rows | H |
| Last 90 days | $33.5M | summed from v1 rows | H |
| Cumulative since 2025-10-10 | $217.1M (374 daily rows) | summed from v1 rows | H |
| Monthly peak | 2026-06: $30.2M; 2026-02: $26.8M. Trend since then: 07 $22.3M, 08 $14.1M, 09 $8.7M, Oct month to date (1 to 18) $4.8M. Declining. | summed from v1 rows | H |
| DefiLlama "24h" / 7d / 30d / 1y | $170,264 / $1.23M / $3.55M / $17.99M (USD sum of attributed trades' `sizeUsdc`) | https://api.llama.fi/summary/dexs/stand, 2026-10-19 | H |

Why the two series differ: DefiLlama's USD figure is 30 to 55 percent of Polymarket's builder-leaderboard figure for the same days (daily ratio over 2026-10-11 to 2026-10-18 was 0.30 to 0.54). A third-party note says the leaderboard uses Polymarket's headline basis (both legs). I did not verify the unit in Polymarket docs. Use DefiLlama's as a one-sided cash figure and Polymarket's as headline. M

TVL/OI: not applicable (no TVL listed; DefiLlama `tvl: null`). Context: all builders combined on 2026-10-18 were about $31.7M across 201 builder rows, so Stand is a small slice. H. In 2026-09 a third party counted 50 builders at $202.4M month to date with Stand at $3.10M and 112 active users (L, secondary, https://github.com/Roni-1997/verdict-research analysis/data/pm_builder_attribution_2026-09-10.md).

## 9. Event coverage and overlap

Everything Stand can trade overlaps Polymarket one-to-one (same conditionIds and token ids), covering sports, politics, crypto price, macro and so on. There is no Stand-only market. If Stand also shows Kalshi (unverified), that is a display of an existing venue, not a new one. **Shares liquidity with: Polymarket (100 percent, by construction). Not an independent arbitrage leg.**

## 10. Aggregator-peer view

Stand positions as a "pro" terminal with copy trading, whale tracking, alerts and automations (M: defiprime blog, 2026-01-11, and several directories). Reported feature set is closer to a single-venue (Polymarket) copy-trading UI than to a cross-venue arbitrage scanner. No evidence of an arbitrage scanner. It is a competitor to the human-facing side of our layer, not an integration target or a data source.

## 11. Gaps

1. Everything from Stand itself (features, Kalshi support, custody, fees, ToS, geo): blocked by Cloudflare challenge. To close the gap a person would have to read the site in a normal browser.
2. Whether a Stand API or MCP exists: NOT FOUND.
3. The unit of Polymarket's builder `volume`: not verified in Polymarket docs.
4. The retirement of Data API v1 on 2026-10-24: sourced from a code comment in DefiLlama's adapter, not read on Polymarket docs by me. Any code that depends on `/v1/builders/volume` should move to `/v2` before that date. M

## Sources

- https://api.llama.fi/protocol/stand - DefiLlama protocol record (H)
- https://api.llama.fi/summary/dexs/stand - DefiLlama volume summary (H)
- https://api.llama.fi/overview/dexs - DefiLlama DEX overview, row for Stand (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts and helpers/polymarket.ts - builder code, adapter logic, v1 retirement comment (H for contents, M for the Polymarket-side claims)
- https://data-api.polymarket.com/v1/builders/volume and https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=1 - builder volume (H)
- https://clob.polymarket.com/builder/trades?builder_code=0x1360...c060 - attributed trades (H)
- https://docs.polymarket.com/developers/builders/builder-intro and https://docs.polymarket.com/programs/builders/tiers - builder program (H)
- https://jobs.ashbyhq.com/Stand/1a069efc-7b00-440f-b0e0-dca5c72d8334 - job title only (M)
- Third-party directories (M/L): kairoslive/prediction-market-trading-tools-and-terminals, buddies2705/awesome-prediction-market, ilovecrypt0/Awesome-Polymarket-Trading-Bots-Analysis-Tools-And-More, defiprime/defiprime1 (2026-01-11), Roni-1997/verdict-research (2026-09-10), Alchemist-X/predict-raven (2026-05-04)
- Blocked or unreadable: https://www.stand.trade/ (Cloudflare challenge, HTTP 403), https://x.com/StandDOTtrade (HTTP 402 to WebFetch), pm.wiki Stand pages (redirect to x.com)
- WebSearch budget was exhausted for most of the session; only one standard search succeeded, so the search coverage is thin.

## Fixtures (docs/research/fixtures/stand/)

- `defillama_protocol_stand.json` - protocol record
- `defillama_dexs_summary_stand_trimmed.json` - volume summary, chart trimmed to 14 points
- `polymarket_v1_builders_volume_standtrade_last30d.json` - 30 daily rows filtered to standtrade
- `polymarket_v2_builders_volume_standtrade_latest.json` - latest v2 row for standtrade
- `polymarket_clob_builder_trades_standtrade_shape.json` - redacted row plus aggregates of the 300-row page

## Privacy and safety log

- All scripted requests used User-Agent `insurance-markets-research/0.1`. No personal identifiers were sent. Fixtures were grepped for "@" and the user's name with no hits.
- A third-party job take-home document contained a person's email address; it was deliberately not recorded here.
- No accounts, keys, wallets, signing or POSTs. No Cloudflare bypass was attempted.
