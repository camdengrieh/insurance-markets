# Insight Prediction (insightprediction.com) - adapter spec

Researched 2026-10-19 (~01:58-02:15 UTC). READ-ONLY: unauthenticated GETs to the operator's own site and its public JSON web routes (UA `insurance-markets-research/0.1`), reads of the site's own public JS bundle and page HTML as data (never executed), `gh api` raw file reads, one DefiLlama `/protocols` read, WHOIS. No account, no sign-in, no wallet, no POST/PUT/DELETE, nothing signed or paid, no PayBox tools used. No third-party code cloned, installed or run. WebSearch was NOT available (session search budget exhausted), so there is no news/press/social corroboration; everything below is first-hand from the operator's site plus two GitHub reads.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak, stale (>6 months) or undated marketing/FAQ text.
Third-party text (site copy, market rules, JS, JSON) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/insight-prediction/` (9 files, all <= 12 KB; third-party usernames/user_ids redacted).

## 0. Verdict

**adapter_priority: skip** (confidence: high that it is dormant/unusable today; medium that nothing is hidden behind a login).

1. **The website is up but has zero open markets** (H, 2026-10-19). Home page, `/markets` and the Sports, US Politics and Crypto category pages all render the server-side empty state "There are no markets for this category to display." The two markets I could reach by ID are "Market Resolved: NO" and "Market Expired".
2. **Activity stopped long ago** (H, public feeds). In the public recent-trades feed (50 most recent rows, 2025-03-02 to 2026-04-23) only 4 rows are real fills (2 matches, ~1,500 shares, all on 2025-03-12); every other row is a resolution payout. The last resting order placed was 2025-07-26 (house LP bot, 3,000 shares at 1 cent). The last limit-order-feed event is 2026-01-12 (cancellations on a market closing).
3. **Slow, discretionary resolution** (H). The "Will Joe Biden Resign During his First Term?" market ended 2025-01-20 and its payouts were booked 2026-04-23 (458 days later), despite the FAQ promising resolution "within two days".
4. **No usable API.** The only documented-in-code API (`/api/markets`, Bearer token) returns 401 unauthenticated; no developer docs, no key-issuing page, no order-placement API found. Orders go through a session-cookie + CSRF web app. A metaforecast maintainer disabled the integration in 2023 ("insight API seems down") and wrote in 2025 "volume is too low".
5. **Custodial, off-chain, US-restricted, one-account-per-person ToS.** Not reachable via PayBox transaction proposals or signed orders (funding a deposit address is possible only after creating an account, which is out of scope and ToS-restricted).
6. **No live arbitrage leg**; sports quotes historically came from the operator's bot priced at average bookmaker odds (not independent price discovery).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://insightprediction.com/` | HTTP 200, Laravel app behind CloudFront/nginx, footer "Copyright (c) 2026" (likely auto-year, weak) | H |
| Front-end bundle `/js/app.js`, `/css/app.css` | `Last-Modified: Mon, 10 Aug 2026 15:11:04 GMT` (someone rebuilt/deployed ~10 weeks ago) | H |
| Domain | WHOIS: created 2021-01-22, updated 2026-05-15, expires 2027-01-22 (registrar Amazon) | H |
| Open markets | none on home, `/markets`, `/c/1/us-politics`, `/c/2/sports`, `/c/172/crypto`; `/markets?status=resolved` returns the same empty page | H |
| Market 748 (Biden resign) | page header "Market Resolved: NO"; open 2022-05-19, close 2025-01-20; payouts 2026-04-23 | H |
| Market 337422 (2025 hottest year, NASA) | "Market Expired"; open 2025-01-13, close 2026-01-15; figure shown above chart "$0" | H |
| Recent trades feed `/recent-trades/get-data` | newest row 2026-04-23 (a Market Resolution); newest real fill 2025-03-12; lifetime row-id counter ~37,895 | H |
| Recent limit orders feed `/recent-limit-orders/get-data` | newest row 2026-01-12 (cancellations); last "Placed" order 2025-07-26 by "Insight LP (Main)" | H |
| Category tree embedded in page | newest category (Crypto, id 172) created 2024-05-09; no category created since | H |
| Operator side product | "Poly Trader Pro" (a desktop client for trading on Polymarket via its API), setup guide dated 5/10/2025; footer links still point to it | H (text), L (dated) |
| DefiLlama | no "Insight Prediction" entry in `https://api.llama.fi/protocols` (8,758 protocols; the only "insight" hit is a different venue, InsightX) | H |
| Metaforecast | fetcher killed 2023-08-23 ("kill insight markets"), removed in squiggle monorepo 2025-02-25 ("disable insight platform", comment "Legacy platform ... volume is too low") | H (commit metadata) |
| X account `InsightForecast` | not readable (WebFetch returned HTTP 402); latest-post date NOT FOUND | - |

Conclusion: operator infrastructure is alive and maintained at a minimum level, but the exchange itself is effectively dormant: no open markets, no fills in 7 months, last LP order 3 months before that. `still_live` = false for adapter purposes.

Caveat: everything above is the anonymous view (served via a CloudFront edge in Marseille, POP MRS53). I cannot exclude markets visible only to logged-in accounts, but the global recent-orders feed (not login-gated) shows no new order placement since 2025-07-26, which would be inconsistent with open markets.

## 2. What it is

- **Kind**: centralised, custodial, off-chain exchange (Laravel web app + Centrifugo websocket server). "Insight Prediction is headquartered in the United States ... incorporated as Marion Research, Inc. in Delaware" (FAQ, undated, L), yet the same site bars US residents from trading (see section 8). Contact page lists a support mailbox, Discord and two X handles (not copied here).
- **Market model** (H, FAQ + market pages + legacy fetcher code): binary YES/NO contracts, price range 0.1 to 99.9 cents, pay $1 or $0. Central limit order book with bids/asks per answer ("Ask price/Ask size", "Bid price/Bid size"), resting (maker) and immediate (taker) orders; orders cancellable, trades final. Buying NO against held YES nets/cancels automatically. Categorical events are modelled as a market with several "answers", each its own YES/NO book (legacy fetcher read `market.answer.data[]` with per-answer `latest_yes_price` and `orderbook.{yes,no}.{buy,sell}[].price` strings like `"87.1c"`).
- **Outcome tokenisation**: none. Shares are rows in the operator's database; there is no ERC-20/ERC-1155, no CTF, no on-chain position (H: no contract address anywhere on site or in JS; deposits go to per-user custodial addresses).
- **Denomination**: mostly USD; some markets in ETH or BTC (e.g. market 18453 "Will Kamala Harris Be the 47th US President? (ETH)", sizes shown like "-0.0075 Ethereum (ETH)") (H, limit-orders feed).
- **Operator liquidity**: "Insight LP (Main)" account is the dominant order placer (36 of 50 rows in the limit-orders feed) and the counterparty on the 2025-03-12 fills (H). FAQ/ToS mention a "sports bot" and a "main liquidity bot" that can have trades undone.

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Landing page | "Deposit funds in the form of crypto currency or stable-coins and we will convert them to dollars with no additional fees" | H |
| FAQ deposit list | USDC on Polygon (recommended), USDC ERC-20 (Ethereum), BTC, ETH; Solana "withdrawal only"; PayPal / wire over $1,000 on request | L (FAQ is undated, contains 10/25/2023 and "until September 10th, 2024" statements) |
| Custody | per-user deposit addresses generated server-side (routes `get-deposit-address`, `wallet-create`, `kms/success`, `coinbase/notification`); fiat-style ledger in USD | H (route names), M (interpretation) |
| KYC | route `kyc/apply`, `kyc/callback` present (a KYC provider callback) | H (route names) |
| On-chain contracts | none found | H (site/JS) |

## 4. Read API

| Item | Value | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: site footer/nav, `/docs` -> 302 to `/login`, `/api/documentation`, `/api/v1/markets`, `/developers`, `/page/api` all 404/redirect; FAQ; contact page; GitHub repo search "insightprediction" returned 0 repos) | H |
| Token-authenticated REST (legacy) | `GET https://insightprediction.com/api/markets?orderBy=is_resolved&sortedBy=asc&page=N` and `GET https://insightprediction.com/api/markets/{id}`, header `Authorization: Bearer <token>`, `Accept: application/json` (from metaforecast fetcher at commit 15ea265, 2023, `src/backend/platforms/insight.ts`). Response `{data:[...], meta:{pagination:{total_pages}}}`; market fields used: `id,title,url,rules,category,coin_id,volume,is_resolved,is_expired,answer.data[]` | H (code read), L (2023) |
| Current behaviour of that API | unauthenticated: HTTP 401 `{"message":"Unauthenticated."}` with `access-control-allow-origin: *` (fixture `api-markets.401.json`). A third-party probe list on GitHub also treats it as "authenticated or gone". How a Bearer token is issued: NOT FOUND (searched: site, FAQ, JS routes; no token/API-key route in the route table) | H |
| Rate limits | NOT FOUND (no `X-RateLimit-*` headers seen on any response) | H |
| Public JSON web routes (no auth, no CSRF for GET) | `GET /recent-trades/get-data` and `GET /recent-limit-orders/get-data` (cursor pagination via `links.next`, 50 rows/page; fields: `id,username,user_id,market_link,market_title,answer_title,answer_type,shares,priceFormatted,offerTypeTitle|status,valueOfTransactionFormatted|valueFormatted,date`); `GET /markets/{id}/orderbook?answer_id=&answer_type=yes|no` (returns `[]` for a resolved market; shape of a live book NOT FOUND because no live market exists); `GET /markets/{id}/chartData?filters[date]=...` (422 on `90d`; UI labels are Market Duration, 1H, 24H, 7D, 30D, 90D; a retry with `Market Duration` timed out twice at 25s and 45s, so I stopped); `GET /leaderboards/data` needs `type` and `page`; `GET /markets/autocomplete` needs `term`; `GET /markets/featured` is an HTML page | H |
| Other GET routes seen in the page's route table | `markets/{id}/filled-orders`, `markets/{id}/shares-sum-per-answer`, `page/us-elections-2024/data`, `page/polymarket-overrounding/data` (not fetched) | H (route names) |
| Market listing for anonymous users | the home page loads lists via `POST /filter-important` and `POST /filter-popular` (HTML fragments); not called (POST rule). Server-rendered `/markets` is empty | H |
| Market page URL pattern | `/m/{id}/{slug}`; category `/c/{id}/{slug}` | H |
| Websocket | Centrifugo (routes `laravel-centrifugo/connect|subscribe|publish`, all POST). The shipped client JS subscribes only to the private channel `$user-{userId}` (balance, investment, notification-count events). No public market/orderbook channel found; ws URL host NOT FOUND (only a bare `ws://` literal in the bundle) | H (JS read) |

Full route table (including POST routes, names only) saved as `ziggy-routes.json`.

## 5. Trade path and PayBox reachability

- **Programmatic order placement**: no documented API. The web app places orders with session-cookie auth + CSRF via `POST /markets/{id}/orderbook/store`, cancels via `POST /markets/{id}/orderbook/delete` and `.../delete-all-unmatched`, edits via `PATCH /orders/{orderId}`. Login is email/password or a `keylogin` (key/passkey-style) flow. Whether the Bearer-token `/api` also exposes order endpoints: NOT FOUND (the 2023 code only reads). I did not call any of these (POST).
- **Auth/signing scheme**: none on-chain. Nothing is signed by a wallet to place an order.
- **PayBox reachable? `no`.** A PayBox EVM wallet (Polygon or Ethereum, USDC) could in principle `request_transfer` to a user's personal custodial deposit address, but (a) that address is only shown to a logged-in account, (b) the venue forbids US persons and corporates and requires KYC, (c) once deposited, every action is an off-chain ledger action through the operator's web session, with no transaction proposal or signed-order path, and (d) there are no markets to trade. Funding-only, and not worth doing.

## 6. Fees

From the FAQ (undated; text mentions Aug 2022, Nov 2023 changes) and the market pages:

- Taker fee per share = `0.075 * P * (1 - P)` dollars (P in dollars). Maker "subsidy" (a rebate) = `0.025 * P * (1 - P)`. FAQ example: buying at 50c costs ~3.75% of cost basis as taker and pays ~1.25% to a maker. (H text, L age.)
- From Nov 2023 FAQ says new markets use `0.1 * P * (1 - P)` for both (H text, L age).
- Market 337422 (opened 2025-01-13) displays "Taker Fee 0.075%  Maker Subsidy -0.025%", consistent with coefficients 0.075 and 0.025 applied to `P(1-P)` (the page's "%" label is ambiguous) (H, interpretation M).
- Market 748 (opened 2022) instead shows "Profit Fee 5%" ("There is a 5% profit fee on this market") (H).
- Fees are market-specific and "expressly noted in the Rules"; operator "reserve[s] the right to change the fee structure for new markets at any time" (FAQ, L).
- Deposit: stablecoin deposits credited as USD with "no additional fees" (landing page, H); network gas is the depositor's cost; withdrawal fee route `withdrawal-fee` exists, amount NOT FOUND.

## 7. Resolution and dispute risk

- Fully **operator-discretionary** (FAQ and ToS, H text): "Insight Prediction maintains sole discretion over when markets resolve"; end dates can be moved or the market closed early; contentious cases get a draft resolution and community feedback, then a final operator decision. ToS: users "agree to accept the decisions made to resolve markets as final ... waive your right to sue ... or to file any whistleblower related claim".
- **No oracle, no on-chain dispute layer.**
- **Bet Locks**: on some markets, trades made after a qualifying announcement "may be returned" and funds from liquidated positions are locked 72 hours; sports/vote markets can be locked after the scheduled start. ToS lets the operator void orders "accepted after an event has started", "at obviously incorrect odds", and reverse trades when its LP bot "malfunctions"; users exploiting mispriced bot quotes "can result in your funds being frozen".
- Cancelled sports events: refund if few trades, otherwise settle at the average of the operator's sports-bot trades (average of bookmaker odds) (FAQ).
- **Observed behaviour (H)**: market 748 resolved 458 days after its end date; the 2024-election Congress market paid out 2025-03-02, the Ukraine-90-days market 2025-04-25, the Harris (ETH) market 2026-01-12. Counterparty and delay risk are high.

## 8. Geo / ToS / automation

- Site banner on every market page (H): "Trading is not available to persons, entities, or companies who are residents of, are located, incorporated or have a registered agent in a restricted territory including the Russian Federation or the United States."
- ToS (H): no accounts for "corporate clients" or residents of a list of sanctioned/restricted places "nor do we currently allow trading from within the United States"; one account per person, "only one account per household or IP address"; no "betting syndicate" use; "You agree to not copy or store any Insight Prediction code or significant portion of our content."; orders may be voided if made "in an attempt to circumvent our order limits".
- Automation / bots / API usage: NOT FOUND (searched: Terms and Conditions, FAQ, Privacy Policy, Contact page). No explicit permission or prohibition; the corporate-account and single-IP clauses make a multi-account or entity-run bot a ToS risk. Data scraping of content is arguably covered by "copy or store ... significant portion of our content".
- `robots.txt` is `User-agent: *` with empty `Disallow:` (H).
- Operator is also the author of Poly Trader Pro, a Polymarket-API client (H); this suggests the team's live product effort may have moved to Polymarket tooling (M, inference).

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Open markets | 0 | home, `/markets`, 3 category pages, 2026-10-19 | H |
| Open interest / TVL | none (no open markets) | derived | H/M |
| Resting depth | none observable; last order placed 2025-07-26 (3,000 shares at 1 cent, LP bot) | limit-orders feed | H |
| Recent matched volume | 2 matches, ~1,500 shares, ~$1,500 notional, both on 2025-03-12 (Ukraine-90-days market), across the 4 non-resolution rows in the latest 50 | recent-trades feed 2026-10-19 | H |
| Lifetime scale | trade-feed row id reaches 37,895; the Biden market page shows "$4,315" above its chart (label not stated, probably lifetime volume) | feed, market page | H (number), L (meaning) |
| Metaforecast maintainers' view | "volume is too low" | squiggle repo commit 2025-02-25 | H |

## 10. Event coverage and overlap

Historical (categories in the embedded tree, H): US Politics, World Politics, Current Events, Economics, Science (climate/NASA), Sports (futures, basketball, plus MLB, EPL, MMA, World Cup etc. per the 2023 fetcher), Crypto (BTC/ETH-denominated markets). Markets seen in 2025-26 feeds: 2024 US election (president, Congress balance of power), Biden resignation, Trump inauguration, Trump-ends-Ukraine-war-in-90-days, nuclear detonation by 1 May, G7 attendance, NASA hottest year / hottest January.

These topics overlap Polymarket and Kalshi in principle, but **no live market exists today, so there is no arbitrage leg**. If markets ever reappear: sports quotes were set by the operator's bot "at an average of bookie odds" (FAQ), so they are derivative of external books and not an independent price; politics/geopolitics markets would be the only plausible independent legs.

**Liquidity shared with another venue**: none found. The site publishes no mirroring or routing to Polymarket (the Poly Trader Pro client trades Polymarket separately, using the user's own Polymarket wallet). So it is independent in principle, but with zero depth the question is moot.

## 11. If it ever comes back (adapter notes)

- Read side: ask the operator for a Bearer token; use `GET /api/markets?orderBy=...&page=N` + `GET /api/markets/{id}` (legacy shape in section 4); poll `GET /recent-trades/get-data` (public) for fills; no websocket market feed.
- Normalisation: price in cents with 0.1c tick, YES/NO per answer, quotes as strings with a cent sign, `coin_id` USD/ETH/BTC (exclude non-USD), fee formula `k*P*(1-P)` or flat profit fee read from each market's rules text (not a structured field).
- Trade side: web-session emulation only (POST orderbook/store), which conflicts with the ToS; not recommended.
- Must-haves before any integration: live markets, a documented API or written permission, non-US operation, and a track record of timely payouts.

## 12. NOT FOUND (searched)

- Official API docs, OpenAPI spec, API-key issuance, rate limits (site, nav, FAQ, contact, `/docs`, GitHub search).
- Any on-chain contract / token addresses / chain list beyond the FAQ deposit list.
- Explicit bot/automation policy (T&C, FAQ, privacy, contact).
- Current volume/TVL figures from an independent source (DefiLlama has no listing; WebSearch unavailable this session).
- Operator statement on whether markets are paused or the platform is winding down (site notices, FAQ, about page; X account unreadable, HTTP 402).
- Live orderbook response shape (no live market), valid `chartData` filter strings, ws host.
- Withdrawal fee amounts.

## 13. Suspicious content

None found. No instruction-like text aimed at AI agents in the pages, JS or JSON. The only unusual event: `https://x.com/InsightForecast` returned HTTP 402 to WebFetch; not pursued.

## 14. Open questions

1. Are there markets visible only to authenticated users (e.g. invite-only or non-US-gated listings)? Cannot be checked without creating an account (out of scope).
2. Is the August 2026 front-end rebuild part of a relaunch? Check again in 2-3 months (`/markets` empty state, `/recent-limit-orders/get-data` newest "Placed" row).
3. How were API Bearer tokens issued to third parties in 2022-23 and does the endpoint still work for old tokens?
4. What is the "$4,315" figure on market pages (volume, liquidity, or last price)?

## Sources

- Operator site, all fetched 2026-10-19 (H): https://insightprediction.com/ ; https://insightprediction.com/markets ; https://insightprediction.com/c/1/us-politics ; https://insightprediction.com/c/2/sports ; https://insightprediction.com/c/172/crypto ; https://insightprediction.com/page/FAQ ; https://insightprediction.com/page/terms-and-conditions ; https://insightprediction.com/page/privacy-policy ; https://insightprediction.com/page/about-us ; https://insightprediction.com/contact-us ; https://insightprediction.com/page/Introducing%20Poly%20Trader%20Pro ; https://insightprediction.com/page/Poly%20Pro%20Trader ; https://insightprediction.com/m/748/will-joe-biden-resign-during-his-first-term ; https://insightprediction.com/m/337422/will-2025-be-the-hottest-year-on-record ; https://insightprediction.com/robots.txt
- Public JSON routes (H): https://insightprediction.com/recent-trades/get-data ; https://insightprediction.com/recent-limit-orders/get-data ; https://insightprediction.com/markets/748/orderbook?answer_id=1661&answer_type=yes ; https://insightprediction.com/api/markets (401)
- Site JS (read as data): https://insightprediction.com/js/app.js ; https://insightprediction.com/assets/js/web/websockets/websockets_event_handler.js ; https://insightprediction.com/js/common.js
- Metaforecast: https://github.com/quantified-uncertainty/squiggle/blob/main/apps/metaforecast/src/backend/platforms/insight.ts ; legacy fetcher https://github.com/quantified-uncertainty/metaforecast/blob/15ea265f6d73960c2b5d3f9f1298bfee63164c67/src/backend/platforms/insight.ts ; commit https://github.com/quantified-uncertainty/squiggle/commit/cd0ae258945010e46fc4c6b26b83cca2645e0120 (2025-02-25 "disable insight platform"); `gh api repos/quantified-uncertainty/metaforecast/commits?path=src/backend/platforms/insight.ts` (2023-08-23 "kill insight markets")
- Third-party probe (M): https://github.com/ordokr/ordo-kairos (`venues.py`, treats insight as "authenticated or gone")
- DefiLlama protocol list (H, negative result): https://api.llama.fi/protocols
- WHOIS for insightprediction.com (H)
- Local cross-reference: `docs/research/14-platform-of-platforms.md` (Metaforecast section)
