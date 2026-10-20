# PredictArena (predictarena.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (API probes about 01:29-01:33 UTC). READ-ONLY: WebFetch / WebSearch, the site's HTML and its public JavaScript bundle (downloaded as text and grepped, never executed), about 10 unauthenticated GETs to `api.predictarena.com` (the host the public website itself calls; it is NOT a documented developer API), about 8 unauthenticated GETs to the documented public CDNA host `api.crypto.com`, two read-only PayBox `discover_*` queries. No account, login, wallet, key, signature, POST/PUT/DELETE, payment, WebSocket connect or browser automation. Third-party text was treated as untrusted data; nothing in it was followed. Generic User-Agent `insurance-markets-research/0.1` on every scripted request.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale. "(wf)" = read through the WebFetch summariser, not as raw text.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/predictarena/` (listed at the end).

---

## Verdict

- **Adapter priority: skip (duplicate liquidity).** PredictArena is a brand-new (launched 2026-10-15) creator-marketing front end and NFA introducing broker. It runs **no exchange and no order book of its own**: every market is a Crypto.com | Derivatives North America (CDNA, a.k.a. OG.com Markets / Nadex) instrument, and the prices, session volume and recent trades it shows are the CDNA book. I verified this by matching instrument symbols, prices and volume against the public CDNA API (section 12). A PredictArena adapter would add **zero independent liquidity** to the scanner; the CDNA / OG.com adapter (`docs/research/venues/og-crypto-com-nadex.md`, P0 read adapter) already covers every instrument it lists.
- Additional reasons not to build on it: no official or documented API (only the website's private JSON API, which the Terms of Service say not to access with bots or scrapers), market-data redistribution is prohibited by the Terms, trading needs a KYC'd FCM account through its web app (no API keys, no wallet path), geo-restricted to eligible US states, and only two categories (NFL, college football) are listed.
- Only residual value: the creator "picks" feed (who is publishing which view) as a possible low-grade sentiment signal. I did not probe it; at launch there were 4 creators (M, Section 11). Treat as P2 signal-only at most, not an arbitrage leg.
- `liquidity_shared_with`: **og-crypto-com-nadex** (CDNA / OG.com Markets), and therefore also every other CDNA distributor (Robinhood, DraftKings, FanDuel, Fanatics, Underdog CDNA flow; see the OG note section 12).
- Confidence in the verdict: high.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | `https://predictarena.com` returns HTTP 200; a React single-page app shell titled "PredictArena" (S3 + CloudFront), `Last-Modified: Thu, 15 Oct 2026 15:51:52 GMT`. Page text is client-rendered, so WebFetch sees only the title | H |
| Launch announcement | PR Newswire, Chicago, 15 Oct 2026: PredictArena Inc. "announced its launch and an introducing broker relationship with Crypto.com / Derivatives North America (CDNA)"; web available now, mobile app "in the coming weeks"; founder and CEO Austin Pfenninger (https://www.prnewswire.com/news-releases/predictarena-brings-prediction-markets-to-the-creator-economy-302910381.html) (wf) | H |
| Live data | `GET https://api.predictarena.com/api/markets` returned 200 with 6,333 markets, status `active`, `price_status: live`; the detail call showed trades stamped `2026-10-19T01:20:59Z`, minutes before the request | H |
| Independent press | NextPredict, 15 Oct 2026: web platform live for eligible US users, about 23,395 active contracts on the markets page (14,821 college football, 8,574 NFL), four creators listed; launch came "more than a month after its planned NFL-season debut" (wf) | M |
| Terms | Terms of Service "Effective Date: August 24, 2026 | Version 1.0" (document published 2026-09-28); Relationship Disclosure "Effective August 1, 2026" | H |

**still_live = true**, but it is days old: expect API and product churn. The task hint "kind=broker-or-frontend" is correct.

---

## 2. Kind and market model

- **Kind:** introducing broker / white-label front end plus a creator "picks" social layer. Legal text: "a CFTC-registered guaranteed introducing broker and NFA member ... We introduce customers to Foris DAX FCM, LLC, doing business as Crypto.com FCM ... all transactions are executed and cleared on Crypto.com | Derivatives North America" (Terms of Service section 2, via `api.predictarena.com/api/documents/content?key=terms_and_conditions`) (H). "Predict Arena does not hold your money, does not execute or clear trades" (same) (H).
- **Market model (inherited from CDNA, H from API fields):** fully collateralised **binary** contracts quoted 0.01-0.99 (dollars) with a $1 payout. A "market" (`question_key`) maps to one or two CDNA instruments (`yes_symbol`, optional `no_symbol`), e.g. an over/under market has an "Over" instrument and an "Under" instrument, each with its own CDNA order book. Where only a yes instrument exists the `no_price` is derived (field `derived: true` in the detail response; the exact derivation is not documented, M: looks like 1 minus the yes bid).
- **Order-book vs AMM vs parimutuel:** central limit order book at CDNA (price-time priority; see OG note section 2). PredictArena exposes only best-ask style prices (see below), not the book.
- **Outcome tokenisation:** none (no on-chain tokens). Symbols are CDNA symbols such as `NX.F.OPT.NFL-00001-261019-M.O.1.257.20270301` (H, fixture).
- **Market types seen (H, top-100 sample by session volume and the 3-row list):** `future` (71 of 100; e.g. "Pro Football MVP 2026-27", "Pro Football Champion 2026-2027", "Big 12 Football Champion"), `player_prop` (16), `moneyline` (6), `spread` (4), `total` (3). Categories endpoint returns exactly two: `NFL` and `CFB` ("College Football") (H, fixture `markets_categories.json`). No scalar markets.
- **Price fields:** `yes_price` / `no_price` are strings in dollars. For the sample market "Over 24.5 points (1st Half)" `yes_price` 0.55 and `no_price` 0.46 equal the best **ask** of the Over and Under CDNA instruments (CDNA book: Over bid 0.54 / ask 0.55; Under bid 0.45 / ask 0.46), i.e. the price you would pay to buy each side (H, fixtures `market_detail_*` and `cdna_crosscheck_*`). The sum of the two asks is 1.01, not 1.00, so do not read them as a probability pair without the bids (M).

---

## 3. Chains and collateral

- **No chain.** Collateral is USD held at the FCM (Foris DAX FCM, LLC d/b/a Crypto.com FCM): "The FCM holds your funds" (Relationship Disclosure; Terms) (H). "Your funds are not insured ... not bank deposits and are not insured by the FDIC or SIPC" (Risk Disclosure) (H).
- **Funding rails seen in the web app code (H, bundle grep):** ACH bank link through Plaid (`/wallet/fiat/bank-accounts/plaid-token`, `payment_network: us_ach`), card top-up (`/wallet/card/top-ups`; the Terms say "Funding by card occurs on a payment page hosted by Crypto.com"), and fiat withdrawals to a linked bank account; a minimum deposit of $10 appears in the onboarding UI copy. **No on-chain / stablecoin deposit route** appeared in the code (NOT FOUND; searched the bundle for USDC, "crypto deposit", "wallet address"). The document index lists `FCM_WALLET_TERMS` (type `crypto`), which I did not read.

---

## 4. Read API

**There is no official public API.** `predictarena.com` has no `/docs`, `robots.txt`, `sitemap.xml`, `llms.txt` or `.well-known/security.txt` (all 404 from S3, H). Search found no developer documentation (NOT FOUND; searched: WebSearch extended "PredictArena ... introducing broker", the site, the JS bundle for "api key", "developer", "openapi").

What exists is the **private JSON API of its own web app** (Laravel-style pagination), base `https://api.predictarena.com/api`; root `https://api.predictarena.com/` returns `{"name":"Predict Arena"}` (H). Status: **unofficial / undocumented**, discovered from the public bundle and confirmed with unauthenticated GETs. Several market endpoints answer without any token:

| Endpoint | Auth | Observed shape (H unless noted) |
|---|---|---|
| `GET /markets?per_page=&page=&sort=` | none | `{data:[{question_key, question_title, market_type, line, prop, participant, contract_type, period_type, outcome_value, event_key, event_title, group_key, group_title, category, event_type, status, closes_at, total_value, yes_symbol, no_symbol, yes_price, no_price, yes_buyable, no_buyable, price_status, session_volume, session_high, session_low, channel, predict_market_id}], links, meta:{current_page,last_page,per_page,total,...}}`. `sort=-session_volume` works; `per_page=100` works (max not tested). `total` = **6,333** on 2026-10-19 ~01:30 UTC |
| `GET /markets/categories` | none | `{"data":[{"code":"NFL","label":"NFL"},{"code":"CFB","label":"College Football"}]}` |
| `GET /markets/{question_key}` | none | adds `resolution:{family,text,resolves_yes,resolves_no,settlement_source}`, `yes{side,symbol,label,outcome_type,outcome_value,price,buyable,derived}`, `no{...}`, `recent_trades[{symbol,label,side,price,qty,ts,exec_id}]` (the `@` in a key such as `...@24.5` worked unescaped) |
| `GET /documents`, `GET /documents/content?key=` | none | legal documents (`terms_and_conditions`, `risk_disclosure`, `ib_relationship_disclosure`, `privacy_policy`, `creator_tos`, FCM documents, ...) |
| `GET /markets/{key}/orders/preview?outcome=&side=&quantity=` | needs Bearer token (code path uses authenticated client; not called) | fields `quote_price, limit_price, tick_size, price_band, estimated_cost, fee_per_contract, estimated_fee, estimated_commission, estimated_total, available_at_price, sellable_quantity, quantity_step, reason` (M, from bundle mapper) |
| `GET /creators`, `/creators/{id}/picks`, `/following*` | not probed | creator picks feed (M, from bundle) |

- **What is missing vs the real exchange API (H):** no order book depth, no tickers with bid/ask, no open interest, no trade history beyond `recent_trades` on the detail call, no settlement-values endpoint. The CDNA public API has all of those for the same symbols (OG note section 4).
- **Rate limit:** response headers `x-ratelimit-limit: 120` (and `x-ratelimit-remaining` decrementing by one per request); the window is not stated, probably per minute (L). CORS is open (`access-control-allow-origin: *`) (H).
- **WebSocket:** the web app uses a Pusher-protocol broadcaster (`ws.predictarena.com`, auth endpoint `https://api.predictarena.com/broadcasting/auth` with a Bearer token). The market objects expose a `channel` string `private-question.<question_key>`, i.e. a **private, authenticated** channel; I did not connect (H for the code and field, L for what it carries; the client invalidates cached queries on events rather than reading prices from them, so the socket may only be a refetch trigger).
- **Same host also serves admin routes** (`/admin/auth/login`, `/admin/traders`, `/admin/creators/...`, `/admin/settings/mobile-releases`) and a dev "MSW mock session / Environment Variables" debug panel is present in the production bundle. Not touched. A hygiene signal about product maturity, not a finding to act on.

**Recommendation:** do not integrate this API. Use the documented CDNA host (`https://api.crypto.com/fcm/v1/public/get-tickers`, `get-book`, `get-trades`, `get-instruments`; OG note section 4) keyed by the same `NX.F.OPT.*` symbols; PredictArena's `yes_symbol` / `no_symbol` map 1:1 to them.

---

## 5. Trade path

- **Programmatic orders on PredictArena: none offered.** Ordering exists only inside the logged-in web app: `POST /markets/{question_key}/orders` with body `{outcome, side, quantity}` (and `POST /orders/{token}/cancel`), authenticated by a Bearer session token obtained through email/password login with optional MFA (H, bundle code; I did not call any of it). There are no API keys, no signing scheme and no wallet auth. The order body carries **no limit price**: the server returns `quote_price` and `limit_price` in the order record, so the web app appears to send marketable orders only, with no resting maker orders (M, inferred).
- **Terms on automation:** users may not "use bots, scrapers, or automated means to access the Services or enter orders except through interfaces we provide for that purpose" (Terms section 6) (H). No such interface is documented, so programmatic order entry through PredictArena is outside the Terms.
- **Underlying route:** orders land at Foris DAX FCM and CDNA. The documented FCM B2C API (HMAC-signed `private/create-order`, FCM onboarding and conformance sign-off; OG note section 5) is a separate account relationship at Crypto.com, not something PredictArena grants. Whether a PredictArena-introduced FCM account could also use that API is NOT FOUND.
- **In-play delay:** CDNA applies a default 3-second hold to orders placed after an event has started (OG note section 5), which applies here too (M).

---

## 6. PayBox reachability: **no**

- A PayBox EVM or Solana wallet cannot trade here: accounts are KYC'd USD brokerage accounts at an FCM, funded by ACH or card, with session-token web orders. There is no transaction proposal, typed-data signature or on-chain contract to target (H, sections 3 and 5). Chains Base / Ethereum / BNB / Arbitrum / Polygon / Solana: not applicable.
- PayBox catalog check (read-only, 2026-10-19): `discover_plugins` query "PredictArena prediction market" returned no plugins; `discover_services` query "PredictArena Crypto.com CDNA prediction market sports contracts" returned unrelated third-party data services (Hyperliquid prediction-market movers, a generic prediction-market detail reader, a Hyperliquid outcomes catalog); no PredictArena or CDNA route (H). Those services need x402 payment and were not called.

---

## 7. Fees

- **PredictArena's fee schedule is not public.** Terms section 7: "The commissions and fees applicable to your trading are disclosed in the fee schedule presented at account opening"; "may be updated prospectively on notice"; "Fees are charged through your FCM account". The Relationship Disclosure adds that PredictArena receives "a share of the commissions and fees generated by your trading" (H). Fee schedule, formula and who pays beyond that: **NOT FOUND** (searched: Terms, Relationship Disclosure, Risk Disclosure, bundle strings). The order-preview mapper has `fee_per_contract` and `estimated_commission`, so a per-contract commission is shown to logged-in users before ordering (M).
- **Baseline for modelling (M, not confirmed for this front end):** CDNA / OG.com's own US retail fee is taker `0.07 x C x P x (1 - P)` for sports and politics, maker `0.0175 x C x P x (1 - P)`, per https://help.og.com/en/articles/12958828-fees-limits as recorded in the OG note section 7. PredictArena orders appear to be marketable (taker) only. Partner front ends can add their own commission on top, and PredictArena states it takes a share of commissions and fees, so assume taker fee plus an unknown markup.
- Card funding "may carry processing fees" (Terms section 7) (H).

---

## 8. Resolution mechanism and dispute risk

- Resolution is by the **CDNA exchange**, not PredictArena: "Each contract resolves according to terms and resolution sources set by Crypto.com | Derivatives North America" (Risk Disclosure) (H). The market detail shows `settlement_source: "Crypto.com Predict"` and per-market rule text, e.g. over/under "Resolves YES if the combined score of both teams is more than 24.5 points in the 1st Half. A market can also end without resolving YES or NO - settled as a tie, voided, or cancelled. Neither side pays out then, and your position is closed at the value set for that outcome, which may differ from what you paid." (H, fixture).
- For the exchange-level rules (AP News source agency for sports, 48-hour cancel rule paying one-week VWAP, ties at $0.50, discretionary corrections, soccer 90 minutes) see `og-crypto-com-nadex.md` section 8; they apply unchanged (M, same instruments).
- Dispute route: Terms section 17 - disputes with PredictArena go to Cook County, Illinois courts under Illinois law, no arbitration with PredictArena; the FCM Customer Agreement carries its own arbitration clause (H). Cross-venue arbitrage must rule-match each pair because a void / tie / cancel pays a value that "may differ from what you paid".

---

## 9. Geo, ToS, automation

- **Eligibility (Terms section 3, H):** 18+, a natural person, "located in a jurisdiction where the Services are offered", not sanctioned, **one account only**; PredictArena and the FCM "may decline, condition, or close any account". Identity verification runs through the FCM's CIP before activation. Section 9: availability is limited to jurisdictions where lawful, geolocation controls may be used, "you agree not to circumvent them, including through location-masking tools".
- **State rules (M):** the signup UI carries a US state list and the message "PredictArena is currently available in a limited number of regions"; NextPredict reports sports restrictions on OG.com in nine states and Arizona / New York restricting all event contracts. The company says creators can publish picks and earn revenue share in all 50 states while trading needs identity verification and state eligibility. Exact eligible-state list: NOT FOUND.
- **Automation and data (quote sparingly, H):** bots and scrapers prohibited except via provided interfaces (section 6). Market data is "provided for your personal use in connection with your account ... You may not redistribute or commercially exploit them" (section 8). Also: no coordinated trading, no trading on material non-public information, one account per person, "no feature of the Services places a trade for you". My ten GETs to the public endpoints were a one-off research read; a continuous scanner should not poll them.
- **No copy trading:** the Services "do not copy, mirror, or automatically replicate any creator's trades" (section 5).

---

## 10. Liquidity

- PredictArena has no liquidity of its own; the numbers below are CDNA's, seen through its API.
- **Session volume (H, 2026-10-19 ~01:31 UTC, unit apparently contracts = $1 face, M):** top market by `session_volume` is "Pro Football MVP 2026-27 (a player)" at 20,019; the NFL game total "Commanders @ 49ers: Over 24.5 points (1st Half)" shows 11,559, which matches the CDNA 24h ticker `v` = 11,687 for the same instrument a minute later (fixture `cdna_crosscheck_*`). Sum of `session_volume` over the 100 highest-volume markets = 238,135 contracts (my computation from the full 100-row response; the fixture keeps only the first 10 rows). The CDNA-wide 24h figure was about $6.13M face with a documented lower bound (OG note section 10).
- **Depth at the touch (H, CDNA book for the sample market):** Over 24.5 1st half: bids 0.54 x 31,921 and 0.53 x 12,385; asks 0.55 x 47,861; Under: bid 0.45 x 54,055, ask 0.46 x 37,295. Deep for a prop, dominated by round-lot market-maker style size.
- **Market count:** 6,333 markets on `api.predictarena.com/api/markets` (2026-10-19). NextPredict counted "about 23,395 active contracts" on 2026-10-15, with a split of 14,821 CFB and 8,574 NFL; I could not reconcile the two (different units, markets vs instruments, or settled NFL slate dropping out) (L).
- **Open interest / TVL:** NOT FOUND (CDNA `oi` is 0 for options; PredictArena exposes none).
- **Own traction:** none published (4 creators at launch, M).

---

## 11. Event coverage and overlap (where arbitrage could exist)

- **Listed categories: NFL and college football only** (H, categories endpoint; NextPredict: "No other sports were listed"). Market types: moneyline, spread, total, player props, season futures (MVP, champion, conference champion).
- **Overlap with other venues:** NFL / CFB game lines and futures overlap Kalshi, Polymarket US, Gemini, Underdog and the other CDNA front ends - but the CDNA leg is already captured by the OG.com adapter, so PredictArena is the same leg again, not a new one. No politics, crypto, macro or other sports on this front end even though CDNA lists them.
- Creator picks (profiles, followers, picks on specific `question_key`s) are the only PredictArena-native data. Probing `/creators` and `/picks` was not done; the Terms (section 5) call creator content informational only.

---

## 12. Liquidity sharing (is it an independent leg?)

**No. It is the same order book as CDNA / OG.com. liquidity_shared_with = og-crypto-com-nadex.**

Evidence (all H, same-minute reads on 2026-10-19):
1. PredictArena market `q.202610150405231792037123291358895@24.5` lists `yes_symbol` = `NX.F.OPT.NFL-00001-261019-M.O.1.257.20270301` and `no_symbol` = `...1.261.20270301`, which are CDNA instrument symbols.
2. Those two symbols on the public CDNA API (`api.crypto.com/fcm/v1/public/get-tickers` and `get-book`) show best asks 0.55 and 0.46, exactly PredictArena's `yes_price` 0.55 and `no_price` 0.46.
3. PredictArena `session_volume` 11,559 vs CDNA 24h `v` 11,687 (small gap is timing).
4. Legal text: "all transactions are executed and cleared on Crypto.com | Derivatives North America" and the account is carried by Foris DAX FCM (also the OG.com broker), per Terms section 2.

---

## 13. Adapter priority: **skip**

Rule applied: "skip = dead, closed, no API, duplicate liquidity, or not worth it". It is live, but (a) duplicate liquidity of the already-P0 CDNA / OG.com leg, (b) no official API and bots / scraping / redistribution barred by its Terms, (c) no programmatic trade path and none for PayBox, (d) only NFL and CFB. If the project later wants a PredictArena-specific module it would be a P2 creator-pick signal reader, only if PredictArena publishes an API.

Practical hook for the registry: record `predictarena` as a **distributor of `og-crypto-com-nadex`**, so the aggregator dedupes any quote carrying a `NX.F.OPT.*` symbol into the CDNA leg and never counts PredictArena as a second venue.

---

## 14. Not found / open questions

- PredictArena fee schedule and whether it adds a markup over CDNA's formula (shown only at account opening).
- Any official developer API, API keys, or data-licence terms (none found; Terms bar redistribution).
- Eligible-state list and non-US availability.
- What the private Pusher channels carry and whether they push prices.
- Whether Crypto.com FCM wallet terms allow crypto funding for these accounts (document `FCM_WALLET_TERMS` not read).
- Why PredictArena's market count (6,333) and NextPredict's contract count (23,395) differ.
- The `x-ratelimit` window (header gives only the limit of 120).
- Mobile app launch date ("in the coming weeks" per the press release).

---

## 15. Suspicious / embedded-instruction content

None found. Nothing in the site, bundle, API responses or legal documents addressed an AI agent or contained instructions to me. Observations, not instructions: the production bundle contains placeholder social links (`twitter.com/yourhandle`), an MSW mock / debug panel and admin routes; the API exposes visitor-tracking response headers (`X-Visitor-Id`, `X-Visitor-Token`, `X-Session-Token`) which I did not send or store. The Terms and Relationship Disclosure contain a support contact address and a Chicago street address, which I deliberately did not copy.

---

## Sources

- H https://predictarena.com (HTTP 200, SPA shell, title "PredictArena", Last-Modified 2026-10-15; `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/security.txt` all 404)
- H https://predictarena.com/b/418bbc5aacb5c6d02b5e25f13e5c3c09dde503b5/assets/index-ZjtdS23g.js (public client bundle, 1.6 MB, read as text only; source of the endpoint list, order body, funding rails, Pusher usage)
- H https://api.predictarena.com/api/markets, `/markets/categories`, `/markets/{question_key}`, `/documents`, `/documents/content?key=terms_and_conditions|ib_relationship_disclosure|risk_disclosure` (unauthenticated GETs, 2026-10-19)
- H https://api.crypto.com/fcm/v1/public/get-tickers and `/get-book` (documented CDNA public market data; docs https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction as recorded in the OG note)
- H (wf) https://www.prnewswire.com/news-releases/predictarena-brings-prediction-markets-to-the-creator-economy-302910381.html (2026-10-15)
- M (wf) https://nextpredict.io/market-news/industry/predictarena-launches-creator-focused-prediction-markets/ (2026-10-15)
- M WebSearch (extended) result summary and index of https://predictionnews.com/story/predictarena-launches-creator-centric-prediction-market-platform (fetch returned HTTP 403, so only the search snippet), https://www.lelezard.com/en/news-predictarena-brings-prediction-markets-to-the-creator-economy-22404303.html (syndicated press release, not opened)
- Internal: `docs/research/venues/og-crypto-com-nadex.md` (CDNA fees, resolution, liquidity, API, distributor list)
- PayBox `discover_plugins` / `discover_services` (read-only), 2026-10-19

## Fixtures (`docs/research/fixtures/predictarena/`)

- `markets_list_per_page3.json` - `GET /api/markets?per_page=3` (3 rows, pagination meta with `total` 6,333)
- `markets_top10_by_session_volume.json` - first 10 rows of `GET /api/markets?per_page=100&sort=-session_volume` plus pagination meta
- `markets_categories.json` - `GET /api/markets/categories`
- `market_detail_nfl_1st_half_total.json` - `GET /api/markets/{question_key}` with `resolution`, `yes` / `no`, `recent_trades`
- `documents_index.json` - `GET /api/documents` (list of legal documents)
- `cdna_crosscheck_ticker_book.json` - CDNA `get-tickers` + `get-book` for the same two symbols, proving shared liquidity
