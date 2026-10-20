# Chipper Cash (Polymarket builder "ChipperCash") - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch, WebSearch, unauthenticated GETs to `data-api.polymarket.com`, `clob.polymarket.com`, `gamma-api.polymarket.com` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation.

Tags: **H** = read first-hand this session in a primary source; **M** = secondary or inferred; **L** = weak or stale.

## 0. Verdict

**adapter_priority: skip** (as a venue / arbitrage leg).

- Chipper Cash is a live African fintech (H, blog post dated 2026-09-23). It is **not a prediction market**. It appears to be a **front end that routes orders to Polymarket** using a Polymarket builder code (H: builder profile + attributed trades exist). Whether it is a public in-app feature is **NOT FOUND** (searched: chippercash.com homepage, chippercash.com/blog, WebSearch x4; no mention anywhere).
- Liquidity is 100% Polymarket's CLOB, so it is **not an independent arbitrage leg** and has no price of its own. Polymarket is already covered by the parallel workflow.
- Only residual value: a **retail-flow / adoption signal** (volume and user counts per builder code) and a registry record. The builder trades endpoint is a cheap public feed if wanted.

## 1. Is it live? (H)

- chippercash.com homepage lists: Send and Receive Cash, Chipper Card, Invest: Stocks (fractional shares), Enterprise, Zoona, Business Accounts, Chipper ID, Bill Pay, Airtime. **No prediction market / betting / Polymarket / crypto mention** (WebFetch https://www.chippercash.com/, 2026-10-19).
- Blog 2026 posts: "Bank-Backed Virtual Accounts in Ghana Through UMB Partnership" (2026-09-23), "8 Years of Chipper Cash" (2026-07-08), dbt migration (2026-04-10). Nothing on predictions. Closest crypto items are 2025 (Ripple partnership 2025-03-27; Ripple stablecoin launch partner 2025-09-04) - L, stale. (WebFetch https://www.chippercash.com/blog)
- Company is operating; the Polymarket-routed feature is live in the sense that **trades were confirmed on chain within the last 24h** (section 3).

## 2. Kind and market model

- Kind: broker/front end (builder-code attribution) on top of Polymarket. No own markets, no own tokens, no own order book (M, inferred from the trades below: market ids are Polymarket condition ids resolvable on Gamma; H for the resolution of ids).
- Market model, chains, collateral, resolution: **identical to Polymarket** (binary/categorical CTF outcome tokens, CLOB, Polygon, USD stablecoin collateral, UMA-based resolution). Not re-researched here; see the Polymarket note from the parallel workflow.

## 3. What can be observed about Chipper's flow (H, unauthenticated)

Builder code (public identifier on the leaderboard, not a secret): `0x0edce05fa89c11832854d97ed5a6bcb34746dc3a111063b2b231fa7bcd19e619`.

Leaderboard `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=50&offset=N` (limit is capped at 50, page with offset). Row for ChipperCash, fetched 2026-10-19 (verified: true, empty logo):

| period | rank | volume USD | active users |
|---|---|---|---|
| ALL | 279 | 123,643 | 83 |
| MONTH | 92 | 115,115 | 83 |
| WEEK | 74 | 12,385 | 22 |
| DAY (partial) | 92 | 240 | 5 |

Daily series `GET .../v1/builders/volume?timePeriod=DAY`: first activity 2026-09-13 (1 user, $25); under $3k/day until 2026-10-06; ramp from 2026-10-07 (about $10k/day, 9-21 users). Weekly: 365 (w/e 09-13), 4.1k, 6.0k, 40.4k, 60.4k (w/e 10-11), 12.5k (w/e 10-18 partial-bucket as returned). So the feature is **about five weeks old** and ramping, with a tiny user base (83 lifetime users). Leaderboard rank 279 of about 290-350 builders on ALL. The Gamma/builders leaderboard note says matched volume can lag up to 24h (H, Polymarket docs).

Trades `GET https://clob.polymarket.com/builder/trades?builder_code=<code>` (public, no auth; H docs https://docs.polymarket.com/builders/api-keys and https://docs.polymarket.com/trading/clients/builder). Returned 300 trades per page (`limit`/`count` = 300, `next_cursor` base64 of offset, e.g. `MzAw`). One page spanned 2026-10-18T07:58Z to 2026-10-19T07:05Z (about 24h): 300 taker-side trades, about $3.1k notional, 21 distinct user wallets, 167 markets. Fields: id, tradeType, takerOrderHash, market (condition id), assetId (token id), side, size, sizeUsdc, price, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, fee, feeUsdc, builderFee, builderCode, status, timestamps. Fixture has 5 trades with the wallet/owner fields redacted.

Mix of what users traded (top 40 markets by Chipper notional, resolved via Gamma `condition_ids=`): **short-dated crypto Up/Down (Dogecoin, Bitcoin, XRP 5/15-minute)** and **same-day soccer win markets** (Arsenal, Man Utd, Lyon, Flamengo, Real Madrid ...) plus some NFL moneylines (Ravens-Browns, Panthers-Eagles). All H-resolved titles; share by volume not computed beyond that.

Fixtures: `docs/research/fixtures/chipper-cash/` (`builder-leaderboard-chipper.json`, `builder-volume-daily.json`, `builder-trades-sample.json`).

## 4. Read API for an aggregator

Chipper has **no API of its own** for markets (NOT FOUND; apis.io lists no public OpenAPI, enterprise API gated by merchant onboarding - M). Use Polymarket's APIs for prices/books/trades/resolution (separate note). The only Chipper-specific data is the public builder leaderboard/volume/trades above. Rate limits for those hosts: no 429s in about 40 requests (H); documented limits not read here.

## 5. Trade path / PayBox

- Programmatic order placement is Polymarket's: signed EIP-712 `Order` with `builder` bytes32 field, API credentials derived by the signer (H docs). A PayBox wallet could in principle trade on Polymarket directly; there is **no reason to go through Chipper** and no Chipper trade API exists (NOT FOUND).
- paybox_reachable: **no** for Chipper itself (closed consumer app, custodial/unknown custody - custody model NOT FOUND). Polymarket route is covered elsewhere.

## 6. Fees (H)

The user pays the builder fee on top of any Polymarket platform fee; builder fees are flat percentages of notional, taker default 0 bps / max 100 bps, maker default 0 / max 50 bps (https://docs.polymarket.com/builders/fees). Observed on Chipper trades: `sizeUsdc` 10, `builderFee` 0.1 (that is 1.00%, the taker cap), `feeUsdc` 0.422 (Polymarket platform fee). Quoted per-trade fee fields for all 300 sampled trades: builderFee sum 31.1 on 3,110 notional, i.e. about 1% (H). So Chipper users pay roughly 1% extra versus trading on Polymarket directly, which is a cost an arbitrage model should add if it ever routes via Chipper (it should not).

## 7. Resolution

Same as the underlying Polymarket market. Polymarket may disable a builder code or revoke its fees at its discretion (H docs).

## 8. Geo / ToS / automation

Chipper app terms for the prediction feature: NOT FOUND (searched: homepage, blog, WebSearch). Operates in 21+ African countries (H homepage). Polymarket geo rules apply to the venue; not re-researched.

## 9. Liquidity and overlap

- Own liquidity: none. Chipper-attributed flow about $115k in the last ~5 weeks, about $3k per day recently (H, data-api 2026-10-19). Negligible versus Polymarket.
- **liquidity_shared_with: Polymarket (100%)**. Not an independent leg.
- Category overlap: sports (soccer, NFL) and crypto price (5-15 min Up/Down) - all of it already priced on Polymarket.

## 10. Suspicious content

None encountered. WebSearch results were noisy (unrelated "Chip" results) and ignored. A promo-code affiliate page cluster appeared in results; not relied on.

## 11. Open questions

- Is the Polymarket feature publicly available in the Chipper app, and in which countries? (No public mention found; may be a staged or invite rollout.)
- Custody: does Chipper hold the keys (likely, given "owner" ids and a pooled maker address pattern) - not verified.
- Whether builder-attributed trades are worth ingesting as a retail African flow indicator: low value at 83 users.

## Sources

- https://www.chippercash.com/ (H, products list, no prediction markets)
- https://www.chippercash.com/blog (H, 2026 posts)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, ranks and volumes, 2026-10-19)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY|WEEK|MONTH|ALL (H)
- https://clob.polymarket.com/builder/trades?builder_code=... (H, 300 trades)
- https://gamma-api.polymarket.com/markets?condition_ids=... (H, market titles)
- https://docs.polymarket.com/builders/api-keys, https://docs.polymarket.com/trading/clients/builder, https://docs.polymarket.com/builders/fees (H via WebFetch summary - so strictly M on exact wording)
- WebSearch (extended) "Chipper Cash prediction markets Polymarket", "... builder code predictions Africa launch": no connecting coverage (M, negative). apis.io/providers/chipper-cash: no public API (M).
