# OKX Event Contracts - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 01:40-02:00 UTC). READ-ONLY: official docs and help pages (WebFetch and curl GET), `gh api` file reads, unauthenticated GETs to documented OKX public endpoints. No account, API key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party and OKX page text was treated as untrusted data. Generic User-Agent only (`insurance-markets-research/0.1`). WebSearch was unavailable (session search budget exhausted), so discovery relied on OKX's own docs, changelog and site pages.

Tags: **H** = read first-hand in a primary source this session (cited in Sources); **M** = secondary or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, trimmed, each under 6 KB): `docs/research/fixtures/okx-event-contracts/` (section 13).

---

## 0. Bottom line

1. **Live, official, and has a proper public API, but tiny.** OKX's V5 API launched Event Contracts support on 2026-04-15 (H, API changelog). Public endpoints work unauthenticated today and return 20 production series plus 3 test series (H, own GETs).
2. **Crypto and gold price events only.** BTC/ETH/SOL and XAU (gold) "above", "between", "hit" and "up or down" ladders at 5-min, 15-min, daily and monthly horizons, all settled on OKX's own index (`okx_index`). No sports, politics or macro in the API (H). The separate web "Outcome Markets" page (sports) is a different surface with no documented API and is tied to an XP (non-cash) competition (section 2).
3. **Liquidity is negligible.** Two samples on 2026-10-19 show 4.2k to 5.9k contracts traded in 24h across 9 to 13 of ~690 live instruments (each contract pays at most 1 USDT, so at most about $4-6k), and total open interest of 892 contracts (about $399) (H, own calculation). 364 of 442 two-sided books are 0.001/0.999 placeholder quotes (H).
4. **Not reachable from a PayBox EVM wallet.** It is a custodial CEX order book: KYC account, USDT balance inside OKX, HMAC-signed REST/WS with an API key. No on-chain order or token (H).
5. **Terms are hostile to an aggregator.** OKX's API Agreement (updated 2026-07-28) limits Market Data, including the unauthenticated public endpoints, to "personal, non-commercial trading", and bars redistribution or use in a "financial data aggregator, price feed, or analytics platform" without written consent (H, section 9). US/AU and EU-registered users are on different API hosts that return no event series (H).
6. **adapter_priority = P2** (read-only, signal-only, personal use only). It is independent liquidity with a clean API, but there is nothing to arbitrage against at this depth and the data terms forbid a shared aggregator.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| API changelog 2026-04-15: "OKX is launching Event Contracts support across public data, market data, and trading account endpoints" (new endpoints Get series, Get events, Get markets, WS Event contract markets channel) | Official launch of the API surface | H |
| `GET /api/v5/public/event-contract/series` (2026-10-19) | 23 series, 200 OK, unauthenticated | H |
| `GET /api/v5/market/tickers?instType=EVENTS` ts 2026-10-19 01:43-01:50 UTC | 686 to 689 live instruments, fresh quotes | H |
| `GET /api/v5/market/trades` on `BTC-UPDOWN-15MIN-261019-0930-0945` | Trades timestamped 2026-10-19 01:41-01:43 UTC | H |
| Settled markets with `outcome` and `settleValue` | e.g. `BTC-ABOVE-DAILY-261018-1600-79000` outcome 1 (YES), settleValue 81681.343; 947 expired markets sampled across 11 series, 0 flagged `disputed` | H |
| Product pages | `https://www.okx.com/trade-events` ("OKX Event Contracts"); site nav item "Events & Options: Trade on crypto price movements with events and options" | H |
| Change history | HIT and BETWEEN methods and monthly frequency added 2026-07-07; tick-size change 2026-05-19; public endpoints made unauthenticated 2026-05-19; `speedBump` param removed 2026-07-24 (all API changelog) | H |
| Discovery hint (1Token digest dated 2026-04-16): OKX announced Event Contracts the same week as Binance; "as of April 10, 2026 users could trade" | Consistent with the API date, but secondary | M |
| OKX announcement the digest cites, `https://www.okx.com/help/okx-will-officially-launch-event-contracts` | **404** on my fetch; the digest's own hyperlink points to a 1Token URL. No OKX launch announcement found (NOT FOUND, searched: OKX help announcements pages 1-2 and trading-updates section, OKX help search, docs changelog) | H |

Verdict: **still_live = true**. Caveats: the history retained by the API is short (daily series list only ~26 days of expired events, 15-min series ~10 days), and the first real listing date cannot be read from the API (H, own pagination).

---

## 2. Kind and market model

- **Kind (H):** `cex-product`. Event contracts are an instrument type (`instType=EVENTS`) inside OKX's exchange API, traded on a central limit order book.
- **Market model (H):** one binary YES/NO instrument per strike or window. An instrument id looks like `BTC-ABOVE-DAILY-261025-1600-84000` (series, event, strike). Settlement methods (Get series docs): `price_up_down` (strike fixed at `fixTime`), `price_above`, `hit` (touches the strike during the window), `between` (settle value in `[floorStrike, capStrike)`, top bracket has `capStrike` = "INF"). Series have `freq` of five_min, fifteen_min, hourly, daily or monthly (hourly is documented, none listed now).
- **Ladders (H):** e.g. `BTC-ABOVE-DAILY` had 93 live instruments (7 daily expiries x about 13 strikes, 72k to 88k) on 2026-10-19. Events (`eventId`) group strikes with a common expiry.
- **Order book (H):** one book per instrument, quoted in YES price 0.001 to 0.999. Market data endpoints return **YES side only**; "Users can derive NO side data on their own" (docs). Orders carry `outcome` = `yes` or `no`. Tick bands (unified): 0.001 for 0.001-0.04, 0.01 for 0.04-0.96, 0.001 for 0.96-0.999 (H). Sample instrument: `ctVal` 1, `lotSz` 0.1, `minSz` 0.01, `maxLmtSz` 20,000,000, `settleCcy` USDT (H). That NO price = 1 minus YES price and that NO buys match against YES sells is my inference (M); OKX does not describe the matching.
- **Tokenisation:** none. Positions are exchange-ledger entries (positions/orders/bills endpoints, `tdMode` = isolated only). Bills subtypes 410 buy yes, 411 buy no, 412 sell yes, 413 sell no, 414 yes expiry, 415 no expiry (H, changelog).
- **Payout per winning contract:** not stated outright. `ctVal` 1, price cap 0.999 and USDT settlement imply 1 USDT (M).
- **Test series are public:** `test2-UPDOWN-15MIN`, `TEST3-UPDOWN-15MIN`, `TEST3-ABOVE-DAILY` (and `Test1-UPDOWN-15MIN` in tick bands) appear in the live listings; filter by name (H).
- **"Outcome Markets" (different product):** `https://www.okx.com/predict` shows a Sport category (international football games, a Grand Prix driver market, a weekly WTI price-hit market). At fetch time every listed item had ended (late Sept 2026), "Total events 0", "$0.00" volume (H, page text; client-rendered, so possibly stale). The 2026-10-15 OKX announcement describes "Outcomes League S3" as an XP trading competition using "free, non-withdrawable XP" with "no real funds" and a 250,000 USDT prize pool, alongside an Onchain Perps/Spot public beta (H). The okx.com homepage nav link "Outcome markets" carries the analytics tag `prediction_points_market` (H). So Outcome Markets look like a points/XP product, not cash-settled; I could not confirm (M). No API for it was found: the V5 docs and changelog contain no sports or outcome-market endpoints (NOT FOUND, searched: docs-v5 text for "sport", "football", "outcome", changelog, Agent Trade Kit).

---

## 3. Chains and collateral

- **Chains:** none for trading. All matching and custody are off-chain inside OKX (H). Deposits and withdrawals use OKX's normal funding rails (not researched).
- **Collateral:** USDT (`settleCcy` USDT on instruments; H). Margin mode is isolated only: "Event contracts symbols only support isolated" (H, place-order docs). Whether a unified-account balance converts automatically to the isolated event position: not documented (NOT FOUND in docs).
- The "Exchange OS" onchain account announced 2026-10-15 is XP-only mock trading with no event contracts listed (H, announcement).

---

## 4. Read API

Exists: **official, public (no key) for discovery and market data**; private for account/trading.

| Item | Value | Tag |
|---|---|---|
| Docs | `https://www.okx.com/docs-v5/en/` (sections: Public Data > REST > Get series / Get events / Get markets; Market Data; WS > Event contract markets channel); changelog `https://www.okx.com/docs-v5/log_en/` | H |
| REST base | `https://openapi.okx.com` (recommended since 2026-05-20); `https://www.okx.com` returned identical data in my GETs | H |
| Regional hosts | US and AU (app.okx.com) users must use `us.okx.com`; EU (my.okx.com) users `eea.okx.com`. Both returned `{"code":"0","data":[]}` for `event-contract/series?seriesId=BTC-ABOVE-DAILY`, while openapi.okx.com returned the series | H |
| WebSocket | `wss://ws.okx.com/ws/v5/public` (also `/private`, `/business`). Channel `event-contract-markets` with `{"channel":"event-contract-markets","instType":"EVENTS"}` pushes market status changes and `floorStrike` generation, no initial snapshot. Not tested live | H (docs) |
| Auth | None for the public endpoints below (permission changed from Read to Public on 2026-05-19) | H |

Key endpoints (all verified by GET on 2026-10-19 unless noted):

| Purpose | Endpoint | Notes |
|---|---|---|
| Series | `GET /api/v5/public/event-contract/series[?seriesId=]` | 10 req / 2 s per IP. Fields: `seriesId, freq, title, category, settlement{method, closeEarly, srcName, underlying}` |
| Events | `GET /api/v5/public/event-contract/events?seriesId=&state=&limit<=100&before/after` | `seriesId` required. `eventId, expTime, fixTime, state` |
| Markets (= strikes, with resolution) | `GET /api/v5/public/event-contract/markets?seriesId=&eventId=&instId=&state=&limit<=100` | `instId, listTime, expTime, fixTime, state, outcome (0 n/a, 1 YES, 2 NO), floorStrike, capStrike, settleValue, disputed, hitDir`. 10 req / 2 s per IP |
| Instruments | `GET /api/v5/public/instruments?instType=EVENTS&seriesId=` | `seriesId` required. `tickSz, lotSz, minSz, settleCcy, stk, method, groupId, state` (incl. `settling`) |
| Tick bands | `GET /api/v5/public/instrument-tick-bands?instType=EVENTS` | per series, identical bands |
| All quotes | `GET /api/v5/market/tickers?instType=EVENTS` | 20 req / 2 s per IP. One call returns every live instrument (about 184 KB): `bidPx/bidSz/askPx/askSz/last/vol24h/volCcy24h` |
| Book | `GET /api/v5/market/books?instId=&sz=` | `[price, size, "0", orders]` rows, YES side only |
| Trades | `GET /api/v5/market/trades?instId=`, `/market/history-trades` | `px, sz, side, ts, tradeId` |
| Candles, OI | `/market/candles`, `GET /api/v5/public/open-interest?instType=EVENTS` | OI call returns every instrument incl. expired (777 KB, 6,418 rows): avoid polling |
| Underlying | `GET /api/v5/market/index-tickers?instId=BTC-USDT` | the `okx_index` reference (idxPx 82446.8 at 2026-10-19 01:49 UTC) |

Adapter gotchas (all H from own data):
- All numerics are strings; times are epoch ms. The `eventId` suffix is Hong Kong time (UTC+8): `BTC-ABOVE-DAILY-261025-1600` has `expTime` 1792915200000 = 2026-10-25 08:00 UTC. Use `expTime`, do not parse ids.
- 364 of 442 two-sided tickers are 0.001/0.999 placeholder quotes with large size (e.g. 1,783.5). Treat as no quote.
- `bidPx` or `askPx` can be empty (one-sided). Docs: "Best ask price may be lower than the best bid price during the pre-open period."
- HIT markets flip to `expired` as soon as the level is touched, well before nominal expiry (e.g. `BTC-HIT-DAILY-261019-1600-82000` was already expired, outcome 1, `settleValue` 82003.4, at 01:50 UTC with nominal expiry 08:00 UTC), although every series reports `closeEarly: false`.
- Up/down strikes (`floorStrike`) appear only at `fixTime` (event start); the WS channel pushes them.
- Short history: poll and store expired events yourself.

---

## 5. Trade path

- **Programmatic: yes, but only via an OKX account.** `POST /api/v5/trade/order` (60 req / 2 s per user ID + instrument ID) with `instId`, `tdMode` = `isolated`, `side`, `ordType`, `sz`, `px`, and **`outcome` = `yes`|`no`** (required for EVENTS). Amend, cancel, batch and WS order endpoints also exist (H, docs). From 2026-04-15 non-post-only orders needed `speedBump: "1"` ("event contract speed bumps ... delay duration will be changed ... without prior notice"); on 2026-07-24 the parameter was removed and is silently ignored (H, changelog). Whether any taker delay still exists server-side is not stated (NOT FOUND).
- **Auth (H, docs):** REST headers `OK-ACCESS-KEY`, `OK-ACCESS-SIGN` (Base64 HMAC-SHA256 over timestamp + method + requestPath + body with the secret key), `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`; WS private channel login with the same credentials. Demo trading uses header `x-simulated-trading: 1` (whether demo covers EVENTS is not stated).
- **Agent tooling (H):** OKX Agent Trade Kit (MIT, `github.com/okx/agent-trade-kit`, last push 2026-10-14) ships an MCP server whose `event` module has 9 tools (browse, series, events, markets, place/amend/cancel order, orders, fills). I did not install or run it.
- **No wallet-signed or on-chain path** (H): nothing in the docs, Agent Trade Kit or site mentions one.

---

## 6. PayBox reachability

**No.** (`paybox_reachable = no`.) Trading needs an OKX user account (KYC, region eligibility), an API key and passphrase, and HMAC request signing. None of that is an EVM or Solana wallet signature or a transaction proposal, so `request_wallet_sign` or contract-call routes cannot place or cancel orders. A wallet could at most move USDT to an OKX deposit address (a plain transfer) to fund the account, but then the agent would still need OKX API credentials; whether PayBox's secret/credential vault could hold and use them is out of scope and untested. Neither the Agent Trade Kit nor OKX describes a wallet-native event-contract path.

---

## 7. Fees

- **Formula (H, "Get fee rates" docs):** taker fee = `K1 x C x P x (1-P)`, maker fee = `K2 x C x P x (1-P)`, where C = number of contracts and P = price (0 to 1). K1 and K2 are the `taker` and `maker` fields of `GET /api/v5/account/trade-fee?instType=EVENTS` (authenticated). The fee is largest at P = 0.5 (K/4 per contract) and vanishes near 0 or 1.
- **Settlement fee (H):** a `settle` rate is charged "for users whose positions match the event contract settlement result"; losing positions are not charged at settlement. Rate not published.
- **Sign convention (H, docs remarks):** for fee-rate fields a positive number is a rebate and a negative number is a commission.
- **Values:** NOT FOUND (searched: docs-v5 text, changelog, `https://www.okx.com/fees` page which has no event-contract schedule, OKX help pages). K1, K2, `settle` and any VIP tiers require an authenticated call. The fee group id is `groupId` "1" on the sampled instruments (H).
- Who pays: taker and maker per the formula; withdrawal/deposit costs and USDT funding are outside the contract.

---

## 8. Resolution and dispute risk

- **Mechanism (H):** centralised and automatic. Each series declares `settlement.srcName` and `settlement.underlying`. All 23 current series use `okx_index` (BTC-USDT, ETH-USDT, SOL-USDT, XAU-USDT). The docs' example list also mentions `cf_benchmark_index` but no listed series uses it (H). Market states: `preopen` -> `live` -> `settling` -> `expired`; resolved markets expose `outcome` and `settleValue`.
- **Dispute surface:** markets carry a boolean `disputed`, which implies a dispute path, but no dispute process, window or bond is documented (NOT FOUND in docs/help). In 947 expired markets sampled across 11 series (2026-09-14 to 2026-10-19) none was flagged (H).
- **Averaging window of the index at settlement:** not documented (instantaneous vs. average). NOT FOUND. `settleValue` for HIT contracts is close to the strike (82003.4 vs 82000), consistent with first-touch settlement (M).
- **Risk assessment:** single-operator, single-index resolution. The operator is also the venue and (per ToS 4.19) may appoint affiliated market makers who can be your counterparty (H). Basis risk versus other venues: Polymarket resolves up/down markets on Chainlink TWAP and most others on UMA (per repo notes `docs/research/08-venues-polymarket-kalshi.md`, M for this purpose); the same notes say Polymarket US rules cite "CF Benchmarks index" sources for some markets. I did not check Kalshi's crypto reference index. OKX's `okx_index` is its own composite, so identical-looking contracts are not the same payoff.

---

## 9. Geo, ToS and automation

- **Restricted locations (H, Risk and Compliance Disclosure, last updated 2026-07-08):** Afghanistan, Canada, Cuba, Hong Kong, Iran, India, Japan, Malaysia, Nepal, North Korea, Syria, Crimea/Donetsk/Luhansk, certain US jurisdictions including US territories, and Uzbekistan; derivatives-related services also restricted in Australia, Brazil, South Korea and the United Kingdom. The disclosure does not name event contracts specifically (NOT FOUND); whether they count as "derivatives" is unstated.
- **Regional entities (H, API overview):** US and AU users registered on `app.okx.com` use `us.okx.com`; EU users on `my.okx.com` use `eea.okx.com`; both returned zero event series in my GETs. Event contracts therefore appear to be a global-entity-only product (M, inferred from the empty lists; the regional docs were not read).
- **OKX ToS (H, `terms-of-service`):** does not mention event contracts or prediction markets (searched text). 4.19: OKX may appoint "Affiliated Market Makers" who "may enter into Transactions with you as your counterparty ... by way of algorithmic or automated trading". 5.9: API use is subject to order rate limits; repeated violations can lead to suspension.
- **OKX API Agreement (H, `okx-api-agreement`, last updated 2026-07-28), quoted sparingly:**
  - 9.3: no reselling or offering the API "as part of a commercial product, SaaS platform, brokerage service, signal service ... or managed trading service", and no operating accounts for third parties without written approval.
  - 9.4: Market Data may be used "solely for your own personal, non-commercial trading and account management purposes"; no "resell, redistribute, publish, display" to third parties; no use "to build, operate, or contribute to any competing data product, market data service, financial data aggregator, price feed, or analytics platform"; "restrictions ... apply equally to Market Data accessed through public endpoints"; automated extraction must stay within what is "reasonably necessary for your personal trading use".
  - 8.1: bans manipulation, "latency arbitrage, or order matching logic in a manner not consistent with legitimate trading", and circumventing rate limits.
  - AI agents are explicitly allowed (Agent Trade Kit, "Authorized AI Agent" definitions), subject to those rules.
- **Implication:** polling the public endpoints for a private, personal arbitrage scanner fits 9.4; a shared or commercial aggregator that shows OKX prices to others does not, unless OKX gives written consent or a data licence. Cross-venue edge derived from OKX prices and displayed only to the owner is the safe reading (M, not legal advice). Note my fixtures are small samples of this data; do not republish them (see section 13).

---

## 10. Liquidity (all 2026-10-19, own GETs)

| Metric | Value | Tag |
|---|---|---|
| Live instruments | 686 (01:43 UTC), 689 (01:50 UTC) | H |
| 24h volume, sum of `vol24h` (contracts) | 5,940 at 01:43 UTC; 4,192 at 01:50 UTC. Upper bound in USDT = the same number (a contract costs at most 1 USDT) | H |
| Instruments with any 24h volume | 9 then 13 of ~690 | H |
| Where the volume is | 01:43 sample: BTC-UPDOWN-15MIN 4,908; BTC-UPDOWN-5MIN 695; XAU-UPDOWN-DAILY 307; BTC-ABOVE-DAILY 25; BTC-BETWEEN-DAILY 4; SOL-ABOVE-DAILY 2 | H |
| Open interest | 891.9 contracts across 24 non-zero instruments out of 6,418 rows; `oiUsd` total 399.0 (01:46 UTC) | H |
| Book quality | 442 of 686 tickers two-sided; 364 of those are 0.001/0.999 placeholders. Real quotes seen: tens to a few hundred contracts per level near the touch, e.g. `BTC-UPDOWN-15MIN-261019-0930-0945`: asks 0.98 x200, 0.99 x200, bids 0.021 x96.7, 0.02 x200, 0.01 x1999.5 | H |
| Sampling caveat | Two snapshots on a Monday morning in Asia (about 09:45 HKT). A weekend or macro-news window could differ. No historical volume series was found. | M |

Verdict: far too thin for sizeable arbitrage. A single 100-contract fill moves the visible book.

---

## 11. Event coverage and arbitrage overlap

| OKX series | Overlap with other venues | Basis problem |
|---|---|---|
| BTC/ETH/SOL "Up or Down" 5-min and 15-min | Polymarket crypto Up/Down markets (resolved on Chainlink TWAP per repo notes, M); possibly Limitless short-horizon crypto (not checked here) | Different reference price (OKX index vs Chainlink) and different strike-fix instants |
| BTC/ETH/SOL "Price above" daily, "Between" daily, "Hit" daily/monthly | Likely Kalshi crypto range/threshold contracts and Polymarket crypto price ladders (L: from general knowledge, not verified this session) | Expiry time (08:00 UTC here), index and averaging window all differ |
| XAU (gold) above/between/hit/up-down | Few if any; gold or commodity markets may exist elsewhere (L, unverified) | Index definition (XAU-USDT on OKX) |
| Sports, politics, macro | **None in the API** | n/a |

Cross-venue use is limited to crypto and gold price ladders. With the liquidity in section 10, the best use is as a market-implied-probability signal for short-dated crypto thresholds, not as an execution leg.

---

## 12. Shared liquidity

OKX Event Contracts have **their own order book** (H: single CLOB per instrument, ToS says OKX and affiliated market makers provide liquidity). No evidence of routing to Polymarket, Kalshi or any other venue (NOT FOUND, searched: docs, site pages, Agent Trade Kit). So it is an independent leg in principle (M). This differs from Gate/Binance-style front ends to third-party books.

---

## 13. Adapter recommendation

- **adapter_priority: P2.** Independent liquidity and a clean, documented, unauthenticated API (cheap to build), but depth is about $400 open interest and a few thousand dollars of daily volume, scope is crypto/gold only, and the data terms bar aggregator/redistribution use.
- If built: read-only. Poll `tickers?instType=EVENTS` every few seconds (20 req/2 s limit) plus `series/events/markets` for resolution; filter test series and 0.001/0.999 placeholders; derive NO as 1 minus YES; take `expTime`/`settleValue`/`outcome`/`disputed` as resolution data; self-record history; keep it personal-use. Do not build a trading adapter.
- Re-check if OKX publishes non-price (sports/macro) series in the Event Contracts API or if volume grows.

### Fixtures saved (`docs/research/fixtures/okx-event-contracts/`)

All were fetched 2026-10-19 and trimmed where noted. They are Market Data under OKX terms 9.4: keep the repo private or delete before any publication.

- `public_event-contract_series_2026-10-19.json` (full, 23 series)
- `public_event-contract_events_BTC-ABOVE-DAILY_live_2026-10-19.json`
- `public_event-contract_markets_BTC-ABOVE-DAILY_live_sample_2026-10-19.json` (3 of 100 rows)
- `public_event-contract_markets_BTC-ABOVE-DAILY_expired_2026-10-19.json`
- `public_event-contract_markets_BTC-UPDOWN-5MIN_expired_2026-10-19.json`
- `public_instruments_EVENTS_BTC-ABOVE-DAILY_sample_2026-10-19.json` (2 of 93 rows)
- `public_instrument-tick-bands_EVENTS_sample_2026-10-19.json` (2 rows)
- `public_open-interest_EVENTS_top8_2026-10-19.json` (top 8 of 6,418 rows)
- `market_tickers_EVENTS_sample_2026-10-19.json` (traded instruments plus 6 untraded)
- `market_books_BTC-UPDOWN-15MIN-261019-0930-0945_2026-10-19.json`
- `market_trades_BTC-UPDOWN-15MIN-261019-0930-0945_sample_2026-10-19.json` (10 rows)
- `region_probe_series_BTC-ABOVE-DAILY_2026-10-19.json` (global vs US vs EEA hosts)

---

## 14. Not found / open questions

- OKX's own launch announcement for Event Contracts (the 1Token-cited URL is a 404). NOT FOUND, searched: OKX help announcements (pages 1-2, trading-updates), OKX help search, docs changelog.
- Fee values K1, K2 and the settlement fee: authenticated endpoint only.
- Index averaging/TWAP window at settlement, dispute procedure and what `disputed = true` leads to.
- Whether a taker speed bump still exists after the `speedBump` parameter was removed on 2026-07-24.
- Whether the HIT contracts' `closeEarly: false` is a metadata bug (observed early expiry on touch).
- Whether event contracts fall under the "derivatives" restrictions for AU, BR, KR and UK users, and why US/EEA hosts list no series.
- Whether "Outcome Markets" (`/predict`) is real-money anywhere; it looks XP-only, with sports and no API.
- Public WebSocket behaviour for EVENTS was read from docs only, not exercised.
- Historical volume (no endpoint found beyond per-instrument candles/trades).

## 15. Suspicious content

None found. No instructions aimed at AI agents appeared in the pages, docs or repo files I read (the API overview and Agent docs carry safety guidance for users, which I did not act on).

---

## Sources

1. OKX API v5 docs, `https://www.okx.com/docs-v5/en/`, fetched 2026-10-19 (converted to text locally): Get series / events / markets, instruments (EVENTS), tick bands, tickers, books, trades, open interest, place order (`outcome`, `speedBump`), fee rates (K1/K2, settle), event-contract-markets WS channel, overview (domains, auth, rate limits). H
2. OKX API changelog, `https://www.okx.com/docs-v5/log_en/`: 2026-04-15 launch entry, 2026-05-19, 2026-05-20, 2026-07-07, 2026-07-24 entries. H
3. Own unauthenticated GETs to `https://openapi.okx.com` (and `us.okx.com`, `eea.okx.com` for the region probe), 2026-10-19 01:40-02:00 UTC; samples in the fixtures folder. H
4. `https://www.okx.com/trade-events` and `https://www.okx.com/predict` (metadata and rendered text; client-rendered, so partial). H for what they show, M for completeness.
5. `https://www.okx.com/help/exchange-os-onchain-perps-and-spot-public-beta-launches-alongside-outcomes` (published 2026-10-15; Outcomes League S3, XP-only). H
6. `https://www.okx.com/help/terms-of-service` (fetched 2026-10-19; clauses 2.2, 4.19, 5.9). H
7. `https://www.okx.com/help/risk-compliance-disclosure` (last updated 2026-07-08; Restricted Locations). H
8. `https://www.okx.com/help/okx-api-agreement` (last updated 2026-07-28; sections 8.1, 9.3, 9.4). H
9. `https://www.okx.com/docs-v5/agent_en/` and `github.com/okx/agent-trade-kit` (README and `docs/modules/event.md` via `gh api`; repo pushed 2026-10-14, MIT). H
10. `https://www.okx.com/fees` (no event-contract schedule visible). H (absence, client-rendered page, so M for completeness)
11. 1Token Market Digest, `https://blog.1token.tech/binance-and-okx-launch-prediction-market-contracts` (published 2026-04-16; summarised by a fetch tool; its OKX link is a 404 and its own hyperlink points elsewhere). M
12. Repo notes `docs/research/08-venues-polymarket-kalshi.md` and `docs/research/venues/gate-predictions-gate-com.md` for Polymarket/Kalshi resolution context. M for this note.
