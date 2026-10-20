# Bybit Odds - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: Bybit help-center, wiki, announcements and API-docs repo read first-hand; about 50 unauthenticated GETs to `api.bybit.com` (generic User-Agent `insurance-markets-research/0.1`); read-only `discover_plugins` / `discover_services` queries in PayBox. No account, no API key, no wallet, no signing, no POST/PUT/DELETE, no money-moving tool. Third-party text was treated as untrusted data. Web search budget ran out mid-session, so company-background and press items rest on the searches that did run (tagged M).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

---

## 0. Bottom line

1. **The hint is wrong.** The discovery hint (Bitcoinist, "analytics layer, NOT a trading venue") does not match Bybit's own pages. Bybit Odds is a **tradable fixed-return product on BTC and ETH price only**, settled in USDT, with Bybit's institutional market makers as the counterparty. It is not an analytics aggregator and it is not a prediction market in the event-outcome sense. (H: Bybit help center, announcement 2026-09-10)
2. **Live.** Official announcement "Bybit Odds is live" is dated 2026-09-10; public Bybit endpoints listed 218 tradable instruments on 2026-10-19. (H)
3. **Not an execution leg for us.** Bybit says in its FAQ: "we do not support Bybit Odds Trading via API at this moment." Trading is through the Bybit web/app on a KYC'd exchange account, max 500 USDT per contract, no secondary market, no EVM or Solana settlement. (H)
4. **Unauthenticated read data does exist**, undocumented as public: `GET /v5/event/instruments-info` and `GET /v5/event/orderbook` returned live data with no key (H, section 4). The official docs say only market makers may call the Event Contract API (H), so treat the public reads as unintended-but-working and unstable.
5. **Prices carry a huge margin**: the two sides of the same Target strike have implied probabilities (1/payout ratio) that sum to about 1.25-1.30, so the take is roughly 20-23% of stake per side before a further taker fee. This is a bad arbitrage leg and a mediocre signal; the de-vigged mid is the only usable output. (H data, derived)
6. **adapter_priority = P2** (signal-only, crypto-price overlap only, API unofficial). Do not build an execution adapter.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Bybit announcement "Bybit Odds is live: A new way to trade your view on price", dated Sep 10, 2026 | official launch post | H |
| Announcement "Bybit Odds: View to Victory official product launch with a 17,000 USDT total prize pool", Sep 21, 2026; campaign window Sep 21 00:00 UTC to Oct 20 23:59 UTC | launch campaign (ends tomorrow, so volume may drop after) | H |
| Announcement "New: Bybit Odds Launches U.S. Midterm Election Contracts (Nov 6, 2026)", Oct 15, 2026 | product still being extended | H |
| `GET https://api.bybit.com/v5/event/instruments-info` 2026-10-19 | 260 instruments listed (218 `Trading`, 42 `Closed`) | H |
| `https://www.bybit.com/en/odds` | HTTP 301 to `https://www.bybit.com/` on 2026-10-19 (as the discovery hint said). Could be a geo or session redirect; not investigated | M |
| Help center `FAQ-Bybit-Odds` says "Last updated on 2026-09-08"; `Introduction-to-Bybit-Odds` "2026-09-24" | docs are fresh | H |

Press disagreement on dates (PR Newswire 2026-09-16; Pluang/Tokenpost "introduced Sept 20"): the official announcement dates (Sep 10 live, Sep 21 campaign) win. Bitcoinist's "analytics layer, sources not named" and CryptoDailyAlert's "unverified" are both superseded by the primary sources. The Traders Union page returned HTTP 403 and was not read.

**still_live = true.** It is a new (about 5 weeks old) product.

---

## 2. Kind and market model

- **kind:** centralised exchange product ("Price View Contract", fixed-return digital/binary contract) on BTC and ETH index price. Bybit's API docs call the same thing "Event Contract". (H for both names; M that they are the same product, see section 4)
- **Three contract types** (H, `Introduction-to-Bybit-Odds`, `FAQ-Bybit-Odds`):
  - **Up/Down**: up or down versus an Entry Price locked at the moment the order is matched; fixed 5-minute or 15-minute window; settles on the live index price at the exact expiry moment.
  - **Price Target**: Above or Below a fixed Target Price; settles at 08:00 UTC on the expiry date on the "Bybit Settlement Price" = arithmetic mean of the index price sampled every second over the 30 minutes before 08:00 UTC.
  - **Price Range**: In or Out of a Lower/Upper Bound interval; same settlement as Price Target.
- **Binary, two-sided, one symbol per side.** Each side is its own instrument with its own payout-ratio book: `BTCUSDT-5MIN-UP`, `BTCUSDT-19OCT26-82000-ABOVE`, `BTCUSDT-6NOV26-85000-88000-IN` (H, live API).
- **Not an AMM, not parimutuel, not a user-vs-user order book.** The taker is matched against quotes from institutional market makers; "the platform facilitates the matching and handles settlement." Payout ratio is the price: gross multiple including stake ("1.90 means you receive 1.90x if you win"). The FAQ does not describe a shared pool. (H)
- **Tokenisation: none.** Positions are ledger entries in the Bybit Unified Trading Account (UTA). No outcome token, no contract address, not transferable, no early-exit order documented ("Do not assume that a ... early-close order is available", from the Bybit wiki, which is AI-generated: M).
- **Draw rule:** exact hit on the Entry/Target/Bound is a draw and "your allocated amount is forfeited" (H). For a Target strike both ABOVE and BELOW lose on an exact hit, a small extra edge for the market makers.
- **Instrument counts (2026-10-19, H):** Target BTC 88 + ETH 94 trading; Range 14 + 14 trading; Up/Down 4 + 4 (5MIN and 15MIN, UP and DOWN). Target/Range expiries at 08:00 UTC on 2026-10-18 (closed), 19, 20, 21, 23 and 2026-11-06. Product announcement says Target and Range run "up to 7 days"; the Nov 6 batch is a special event expiry (18 days out).
- **Midterm contracts are not election-outcome contracts.** The Oct 15 announcement is BTC/ETH Price Target/Range contracts expiring Nov 6 08:00 UTC "following the 2026 U.S. Midterm Elections" (H). Nothing on Bybit Odds resolves on a political event.

---

## 3. Chains and collateral

- **Collateral:** USDT only, taken from the Bybit UTA Trading Account when the order is matched; returns credited to the same account (H, FAQ). "Only USDT is supported for allocation."
- **Auto-borrow:** under Cross Margin or Portfolio Margin the system can borrow USDT against other collateral to fund an order, which raises IM/MM and liquidation risk of the UTA (H, FAQ).
- **Chains:** none. There is no on-chain settlement, token or contract. Sub-accounts allowed; Demo Trading not available (H).

---

## 4. Read API

**Official position (H):** the "Event Contract" API in Bybit's v5 docs repo (`docs/v5/event/*`, commits 2026-08-27 to 2026-09-01) opens with: "Only **market makers** are permitted to call the Event Contract OpenAPI endpoints. To apply for market maker access, please contact your **Relation Manager**." Quote endpoints say "Only Event Contract maker accounts are allowed". The retail FAQ says API trading is not supported. Docs repo: https://github.com/bybit-exchange/docs (default branch `master`, last push 2026-10-14).

**Is "Event Contract" the same product as "Bybit Odds"? (M, strong)** The API docs never say "Odds". But the type names (`Up_Down`, `Target`, `Range`), symbols (`BTCUSDT-5MIN-UP`), 5- and 15-minute windows, 08:00 UTC expiries, payout-ratio books quoted by market makers, and `takerFeeRate` of exactly 0.06 (Up_Down) and 0.045 (Target/Range) all match the Odds FAQ fee coefficients (H numbers, M identity).

**Observed unauthenticated reads (H, 2026-10-19, `Host: api.bybit.com`, generic UA, no key):**

| Endpoint | Result |
|---|---|
| `GET /v5/event/instruments-info?status=Trading&limit=100[&cursor=...]` | 200; paginated (`nextPageCursor`, 100 per page max); full list = 260 rows over 3 pages. Fields: `symbol`, `symbolId`, `eventContractType` (`Up_Down`/`Target`/`Range`), `durationWindow`, `targetPrice`, `lowerBound`, `upperBound`, `deliveryTime` (ms), `launchTime`, `status` (`PreLaunch`/`Trading`/`Delivering`/`Closed`), `takerFeeRate`, `makerFeeRate`, `callOptionSymbolId`, `putOptionSymbolId`, `lotSizeFilter`, `quotationLimit`, `feeRateRule` |
| `GET /v5/event/orderbook?symbol=BTCUSDT-5MIN-UP` | 200; `{"result":{"s","r":[[payoutRatio, orderValue],...],"ts","u","seq","cts"}}`; up to 25 levels; **empty `r` means no quote** (e.g. deep in-the-money Target side) |
| `GET /v5/event/trades` (private) | 200 with `retCode 10001 "Request parameter error: apiKey is missing"`: private endpoints need a key |
| `GET /v5/market/index-price-components?indexName=BTCUSDT` (generic v5 market endpoint) | 200; the settlement index composition (below) |

Index composition for BTCUSDT on 2026-10-19: Binance 0.3468, Bybit 0.2619, GateIO 0.2106, OKX 0.1223, KuCoin 0.0576, Coinbase 0.0008 (H, fixture). Live spot at capture about 82,620.

**Documented but not callable by us:** `GET /v5/event/trades`, `/order-list`, `/order-realtime`, `/settlements`, `/positions`; `POST /v5/event/quotes` (submit a payout-ratio quote), `POST /v5/event/cancel`. All maker-only, standard Bybit HMAC headers (`X-BAPI-API-KEY`, `X-BAPI-SIGN`, `X-BAPI-TIMESTAMP`, `X-BAPI-RECV-WINDOW`). (H, docs repo)

**WebSocket (documented, not tested):** topics `orderbook.25.{symbol}` (snapshot then delta; push every 20 ms; size `0` deletes a level; `u=1` means reset) and `publicTrade.{symbol}` (fields `T`, `s`, `r` payout ratio, `a` amount, `i` trade id, `seq`). The event docs do not state the WS URL or channel path: NOT FOUND (searched: `docs/v5/event/websocket/*`, `docs/v5/websocket/*` file list; no event connect page). (H)

**Rate limits:** generic limit is 600 requests per 5 seconds per IP on `api.bybit.com`, 403 and a 10-minute ban if exceeded; WS 500 connections per 5 minutes (H, `docs/v5/rate-limit/rate-limit.mdx`). No per-endpoint limit for `/v5/event/*` appears in that doc: NOT FOUND (searched the rate-limit page for "event"). Responses did not carry `X-Bapi-Limit*` headers (H, header dump).

**Resolution data:** no public endpoint for settled prices or outcomes found. `/v5/event/settlements` is maker-only. `status` goes `Trading` to `Delivering` to `Closed`. Realised outcome would have to be recomputed from the index (NOT FOUND for a public settled-price feed).

**Caveat:** public access to these two endpoints is not promised anywhere; docs say MM-only. Expect it to be locked down without notice. Also note doc/live discrepancies: the docs example response shows Up/Down `takerFeeRate 0.0088` and `maxOrderAmount 800`, while the live API shows `0.06` and `100`; the FAQ says max 500. So the FAQ's "500 USDT" is not true for Up/Down today (live max 100), and the docs examples are placeholders, not data (H).

Fixtures: `docs/research/fixtures/bybit-odds/` (section 12).

---

## 4b. Related but separate product: Bybit Prediction (not Odds)

For disambiguation only, since the hint conflated them. **Bybit Prediction** is a feature of Bybit Alpha "powered by Polymarket": "Market creation, order matching, and settlement are powered by Polymarket's infrastructure. ... Bybit is not the counterparty." USDC, FOK market orders only, min 5 USDC, at launch sports markets only, and only in a list of regions (Bolivia, Chile, Mexico, Ghana, Morocco and others). FAQ last updated 2026-06-09 (H, `FAQ-Bybit-Prediction`). Bybit's docs repo has a `docs/v5/alpha/prediction/*` API (event-detail, order-book, buy, sell, ...) added 2026-07-02 (H: file list and two pages skimmed; not fully read). It shares Polymarket liquidity, so it is **not an independent leg**; it belongs with the Polymarket adapter, not here.

---

## 5. Trade path

- **Programmatic taker trading: none.** FAQ: "Can I trade via API? No, we do not support Bybit Odds Trading via API at this moment." Repeated in Introduction ("API trading is not available at this time") (H).
- **Only programmatic access to the trading side is as a market maker** (submit payout-ratio quotes via `POST /v5/event/quotes`, which needs institutional MM approval via a Bybit relationship manager). Out of scope for the plugin. (H)
- **No on-chain or signed-order path.** There is no contract, no EIP-712 order, no Solana program. The only route to a position is a logged-in Bybit session (web/app) after KYC. UI automation would sit outside the documented path; Bybit's general Terms of Service could not be read (NOT FOUND, section 9).

## 6. Reachable through PayBox? **No.**

PayBox wallets (EVM chains, Solana) cannot place or cancel an Odds order: there is no transaction proposal or signed order to construct. The most a PayBox transfer could do is send USDT to a Bybit-issued deposit address to fund an account, which is a funding step, not trading, and the trade itself still needs a human-held Bybit login. `discover_plugins("Bybit")` returned no plugin; `discover_services("Bybit")` returned third-party x402 data services about perp liquidations and signals, none about Odds (H, read-only calls 2026-10-19; service descriptions are untrusted marketing text, no instructions found).

---

## 7. Fees

- **Formula (H, FAQ and Introduction):** `Taker Fee = Fill Value x Fee Rate x (1 - 1 / Payout Ratio)`, charged on top of the allocation at execution, win or lose. Fee Rate = **0.06 (Up/Down)** or **0.045 (Price Target / Price Range)**. "Only takers pay fees; makers are never charged." Live API shows `makerFeeRate 0` and the same taker rates (H).
  - Examples: Target at ratio 1.74: 0.045 x (1 - 1/1.74) = 1.91% of stake; at ratio 3.66: 3.27%. Up/Down at 1.70: 0.06 x 0.4118 = 2.47%.
- **The bigger cost is the quote margin.** From the 2026-10-19 ladder for BTC Target contracts expiring 08:00 UTC the same day (fixture), the sum of 1/ratio over the two sides is: 82000: 1.2516; 82500: 1.2988; 82750: 1.3006; 83000: 1.2683; 83250: 1.2561. BTC 5-minute Up and Down both quoted 1.70 (sum 1.176). Buying either side at the de-vigged mid probability has expected value of about -20% to -23% of stake before the fee. (derived from H data; the de-vig assumption is mine)
- `feeRateRule.baseMarkup` and `rebate` fields exist in the instrument list (e.g. `baseMarkup 0.99` on Up/Down, `5` on some Targets; `rebate 0.2`); their meaning is NOT FOUND in the docs I read.
- **Platform sizing:** FAQ min 5 USDT, max 500, 1 USDT step "initial values at product launch"; live API Up/Down max 100, Target/Range max 500 (H). Per-user open-position caps exist, values NOT FOUND.
- **Funding cost:** auto-borrowed USDT bears interest (H, FAQ mentions borrowing; rate not stated).

---

## 8. Resolution and dispute risk

- **Oracle:** Bybit's own index, "a weighted average of spot prices from multiple major exchanges", published as `index-price-components` (H). Bybit chooses the index, the sampling and the settlement time; the user has no verification path beyond Bybit's own index endpoints.
- **Dispute process:** NOT FOUND (searched FAQ, Introduction, wiki). The FAQ reserves the right to suspend new orders ("extreme market volatility, abnormal price feed behavior, or suspected price manipulation"); open contracts "will settle normally at their scheduled time". Counterparty is Bybit/its MMs, so this is custodial, centralised-operator risk, not an on-chain oracle risk.
- **Basis risk for cross-venue use:** settlement = 30-minute mean of a Bybit-weighted index (Target/Range) or one index tick (Up/Down). Polymarket/Kalshi crypto price markets resolve on other sources and times. I did not read those rules this session (they are in the parallel workflow's notes), so a basis between a 30-minute average and a point-in-time print is certain but its size is untested. (M)

---

## 9. Geo, ToS, automation

- Odds-specific region list: NOT FOUND (searched FAQ, Introduction, announcements). The Bybit wiki page (AI-generated, M) says only "Product access depends on current terms and the account's jurisdiction and status." The launch campaign requires "Identity Verification Lv. 1" (H).
- Bybit general Terms of Service: NOT FOUND. `help-center/article/Terms-of-Service` returned "This article is currently not supported on this site"; the `Bybit-Terms-of-Service` page is a title-only stub. I cannot quote any automation clause.
- Automation: only the FAQ line that API trading is not supported (H). Do not automate the UI.
- Sibling Bybit Prediction has a launch region list (section 4b); do not apply it to Odds.
- Public data calls from my location returned 200 (via CloudFront); no geo-block on the two read endpoints observed (H, one origin only).

---

## 10. Liquidity (dates matter)

- **Volume / OI / TVL: NOT FOUND.** Bybit publishes none for Odds; `instruments-info` has no volume field; the only public flow data would be the WS `publicTrade` stream (not tested).
- **Depth snapshot, 2026-10-19 about 03:15-03:20 UTC (H, fixtures):** `BTCUSDT-5MIN-UP` top of book ratio 1.7 with order value 4,996,526; `BTCUSDT-5MIN-DOWN` 1.7 with 2,506,362 (units documented only as "order value", presumably USDT: M). Target/Range books show a single level of "500" (equal to the per-contract max) on each side that has a quote, so depth is capped by the per-order limit, not by a visible book. Single-account max stake is 100-500 USDT, so capacity per trade is tiny for an arbitrage engine.
- Bybit markets it as "Institutional MM-driven pricing: Access competitive quotes and deep liquidity" (H, marketing).
- The launch campaign (12,000 USDT leaderboard + 5,000 USDT first-trade pool) runs to 2026-10-20, so early volume is incentivised (H); post-campaign depth unknown.

---

## 11. Event coverage and overlap

- **Categories:** crypto price only: BTC and ETH index. No sports, politics, macro or other assets (H: "Supported assets: BTC and ETH").
- **Overlap with other venues:** (a) Polymarket / Kalshi / Limitless / Myriad / Predict.fun-style "BTC above $X on date" and "BTC price range" markets (M: those markets exist in the other workflow's scope; not re-verified here); (b) OKX event contracts (local note `docs/research/venues/okx-event-contracts.md`); (c) Bybit's own listed options, which the instrument list maps to via `callOptionSymbolId` / `putOptionSymbolId` (H field; the inference that market makers hedge Target/Range with those options is M, from the field's existence and the docs' description only).
- **Independence:** liquidity is from Bybit's institutional market makers, not shared with any other prediction venue (H, FAQ "who is the counterpart"). Its prices are, however, almost certainly anchored to listed-option risk-neutral probabilities (M), which exist at Bybit/Deribit independently of any prediction market.
- **Arbitrage usefulness:** poor. 20%+ embedded margin per side, 100-500 USDT caps, no exit, no API. A de-vigged mid is usable as a risk-neutral "P(settlement mean above K)" cross-check against a prediction-market price, but options chains give the same signal with deeper data.

Example of the signal (derived, 2026-10-19 about 03:17 UTC, spot about 82,620, expiry 08:00 UTC, de-vigged by normalising 1/ratio):

| Strike | ABOVE ratio | BELOW ratio | sum 1/r | de-vigged P(above) |
|---|---|---|---|---|
| 82,000 | 1.0334 | 3.522 | 1.2516 | 0.773 |
| 82,500 | 1.3808 | 1.7403 | 1.2988 | 0.558 |
| 82,750 | 1.7956 | 1.3447 | 1.3006 | 0.428 |
| 83,000 | 2.5453 | 1.1423 | 1.2683 | 0.310 |
| 83,250 | 3.6633 | 1.0172 | 1.2561 | 0.217 |

(Strikes 80,000 to 81,750 had only the BELOW side quoted.)

---

## 12. Adapter sketch (if built, signal-only)

1. Poll `GET /v5/event/instruments-info?status=Trading&limit=100` with cursor until empty; cache by `symbol`; keep `eventContractType`, `targetPrice`, `lowerBound`, `upperBound`, `deliveryTime`.
2. For each Target strike pair and each Range IN/OUT pair, `GET /v5/event/orderbook?symbol=...` (both sides), take best ratio, compute `p_side = (1/r_side) / (1/r_above + 1/r_below)`.
3. Emit a canonical record `{venue:"bybit-odds", underlying, settle_ts, settle_rule:"mean_1s_index_30m", strike|bounds, p_devig, overround, depth_cap_usdt}` flagged `executable:false`.
4. Match to external crypto-price markets only with an explicit settle-rule basis warning. Never route orders here.
5. Feature-flag it off by default: the endpoints are not promised public.

---

## 13. NOT FOUND / open questions

- Official public statement of whether `/v5/event/instruments-info` and `/v5/event/orderbook` may be used by non-makers (docs say MM-only).
- WebSocket URL for event topics; per-endpoint rate limits for `/v5/event/*`.
- Odds-specific region list and Bybit general ToS automation clause (ToS pages unreadable).
- Any traded volume, open interest or MM identity for Odds.
- Meaning of `baseMarkup` and `rebate` in the instrument list.
- Position-limit values ("maximum value and a maximum number of contracts").
- Whether `bybit.com/en/odds` 301 is geo/session related.
- Whether the API "Event Contract" is exactly the Odds product (strongly indicated, not stated by Bybit).

## Sources

All fetched 2026-10-19.

- Bybit Help Center, FAQ - Bybit Odds (last updated 2026-09-08): https://www.bybit.com/en/help-center/article/FAQ-Bybit-Odds [H]
- Bybit Help Center, Introduction to Bybit Odds (last updated 2026-09-24): https://www.bybit.com/en/help-center/article/Introduction-to-Bybit-Odds [H]
- Bybit announcement, "Bybit Odds is live" (2026-09-10): https://announcements.bybit.com/en-US/article/bybit-odds-is-live-a-new-way-to-trade-your-view-on-price--art708439f47fac/ [H]
- Bybit announcement, View to Victory launch campaign (2026-09-21): https://announcements.bybit.com/en-US/article/bybit-odds-view-to-victory-official-product-launch-with-a-17-000-usdt-total-prize-pool--art2b5b075abe36/ [H]
- Bybit announcement, U.S. Midterm Election Contracts (2026-10-15): https://announcements.bybit.com/en-US/article/new-bybit-odds-launches-u-s-midterm-election-contracts-nov-6-2026--artd9ed5bfe3567/ [H]
- Bybit announcements index via `GET https://api.bybit.com/v5/announcements/index?locale=en-US&limit=50&page=N` (pages 1-6 scanned for "odds") [H]
- Bybit Wiki, 5 Mins Crypto Odds beginner's guide (page carries the banner "This article was generated by AI"; Sep 24, 2026): https://www.bybit.com/en/wiki/article/5-mins-crypto-odds-beginner-s-guide-to-short-term-trading/ [M]
- Bybit API docs repo, Event Contract section: https://github.com/bybit-exchange/docs/tree/master/docs/v5/event (`introduction.mdx`, `market/instrument-info.mdx`, `market/orderbook.mdx`, `trade/submit-quote.mdx`, `trade/*`, `websocket/public/orderbook.mdx`, `websocket/public/public-trade.mdx`), read with `gh api` raw [H]
- Bybit API docs repo, rate limits: https://github.com/bybit-exchange/docs/blob/master/docs/v5/rate-limit/rate-limit.mdx [H]
- Bybit API docs repo, alpha prediction section (sibling product, skimmed): https://github.com/bybit-exchange/docs/tree/master/docs/v5/alpha/prediction [H, not fully read]
- Bybit Help Center, FAQ - Bybit Prediction (last updated 2026-06-09): https://www.bybit.com/en/help-center/article/FAQ-Bybit-Prediction [H]
- Live API samples: `https://api.bybit.com/v5/event/instruments-info`, `/v5/event/orderbook`, `/v5/market/index-price-components`, `/v5/market/tickers?category=spot&symbol=BTCUSDT` (captured 2026-10-19) [H]
- PR Newswire, "Bybit Launches Bybit Odds ..." (2026-09-16): https://www.prnewswire.com/apac/news-releases/bybit-launches-bybit-odds-giving-traders-a-simpler-way-to-trade-crypto-price-views-302879950.html [M, company press release]
- Pluang (citing Tokenpost), launch summary: https://pluang.com/en/news-feed/bybit-luncurkan-produk-crypto-pengembalian-tetap-dengan-pool-17000-usdt [L, date differs from official]
- Bitcoinist (updated 2026-09-23), the discovery hint, contradicted by Bybit's own pages: https://bitcoinist.com/bybit-launches-odds-product-for-prediction-market-data-and-sentiment/ [L]
- CryptoDailyAlert, "Launch Details Await Verification": https://cryptodailyalert.com/bybit-odds-launch [L]
- Not readable: Traders Union (HTTP 403); Bybit Terms of Service pages (stub or SPA).
- Search reports from WebSearch (extended) were used only to locate the Bybit pages above.

## Fixtures

`docs/research/fixtures/bybit-odds/` (all unauthenticated GETs, 2026-10-19, total about 40 KB):

- `instruments-info.sample.json`: 7 trimmed rows (2 Up_Down, 2 Target, 2 Range, 1 Closed) in the real envelope
- `instruments-info.counts.json`: counts by type/coin/status over the full 260-row list
- `orderbook.BTCUSDT-5MIN-UP.json`, `orderbook.BTCUSDT-6NOV26-79000-BELOW.json`, `orderbook.BTCUSDT-6NOV26-85000-88000-IN.json`: real single-symbol book responses
- `orderbook.empty-book.BTCUSDT-19OCT26-80000-ABOVE.json`: shows the empty `r` array
- `index-price-components.BTCUSDT.json`: settlement index composition
- `target-ladder.BTC-19OCT26.derived.json`: top-of-book for the 20 BTC Target contracts expiring 2026-10-19 08:00 UTC (derived/merged from 20 real responses)
