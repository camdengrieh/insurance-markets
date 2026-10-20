# Busha Signal (signal.markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (~03:00-03:40 UTC). READ-ONLY: WebFetch and plain GETs (generic User-Agent `insurance-markets-research/0.1`) of public pages, the public unauthenticated parts of `api.signal.markets`, the static JS bundles of the Signal web app (read as text, never executed), `gh api` reads of the public `bushaHQ` GitHub org, one public FX GET and one public Polymarket Gamma GET for a cross-check. No account, login, API key, signature, wallet, POST/PUT/DELETE or PayBox tool was used. Authenticated endpoints were hit only with an unauthenticated GET to see the error shape (401). Third-party pages and bundle text were treated as untrusted data; nothing in them was followed. No embedded instructions aimed at AI agents were found.

Research limit: the shared WebSearch budget was already used up (the single search attempt returned "budget used up"), so there is no second-source search. Discovery relied on the TechCabal article named in the task (WebFetch got HTTP 403; a plain GET with the generic User-Agent returned the page), the Busha blog, the regulator's public licence list, and first-party probing of `signal.markets` / `api.signal.markets`.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale. Nothing here is older than 6 months.

Fixtures (all < 8 KB): `docs/research/fixtures/busha-signal/` (section 13).

Name collisions to avoid in the registry: `signal.markets` (this venue, Busha) is NOT `signalmarkets.com` (a separate pre-launch-looking site, see the sibling note on Wedbush/Signal Markets routes) and NOT `signals.wtf` (Citrea, wound down; see `signals.md`).

---

## 0. Bottom line

1. **Live, yes (H).** Launched August 2026 (the "Aug 2025 vs 2026" ambiguity in the hint is resolved: 2026). Order books are populated, the API answers, the web app was redeployed 2026-10-15, markets are open through mid-2027.
2. **Kind: Nigerian, custodial, NGN-denominated, regulated binary-contract exchange with a central limit order book.** Licensee Busha Digital Limited, trade name "Signal", Lagos "Gaming Facilitation Permit" valid 2026-06-15 to 2027-06-14 (H). No chain, no token, no contract found anywhere.
3. **There is a real, unauthenticated read API with good shape** (H, section 4): `GET /events`, `/tickers`, `/markets/{id}/book`, `/markets/{id}/prices`, `/categories`, `/series`, plus an SSE stream for crypto markets. It is undocumented publicly (official docs at `docs.signal.markets` are behind a login), so it is first-party-observed, not contractually stable.
4. **There is also an authenticated trading API** (API keys with `orders:write` scope, `POST /orders`), but its signing scheme is NOT FOUND, and the Terms of Use forbid bots/scripts/scrapers "without express written consent" (H, section 9). A PayBox wallet cannot reach it (custodial Busha account, Nigerian KYC).
5. **Liquidity is negligible and half the catalog is a copy of Polymarket.** About 87 open events / 231 markets, roughly NGN 22k (about US$17) of money turnover in the last 24h across all of them, top-of-book depth of tens of shares (about US$1-2 per side). 41 of 87 events are tagged `adopted:polymarket` with Polymarket's own `gameId` in the tag, the event text is verbatim identical to Polymarket's, and the sampled prices sit within 1 cent of Polymarket's. Not an independent arbitrage leg for those; the remaining markets are Nigeria-specific and have no counterpart elsewhere (and almost no trading).
6. **adapter_priority = P2** (signal-only). A read-only adapter is about three GET endpoints and cheap, but there is nothing to execute against. Build only after every P0/P1 venue.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| TechCabal, "What can prediction markets do differently in Africa?" (published 2026-10-07; slug `what-prediction-markets-must-fix-to-remove-the-gambling-label`) | "Busha, a Nigerian crypto trading startup, launched Signal in August, licenced by the Lagos State Lottery and Gaming Authority (LSLGA) and timed for the English Premier League season". Context in the article is 2026 ("ten months into the year", Luno launched "in March" 2026). | H |
| Busha blog post "How Do Prediction Markets Work? A Beginner's Guide to Getting Started on Signal", dated `11.8.26` on the page (day.month.year, consistent with sibling posts `5.10.26`, `28.9.26`) = 11 Aug 2026 | Describes the product as launched; links to `https://signal.markets`, `https://t.me/signalbybusha`, `https://x.com/SignalByBusha` | H |
| Regulator list `lslga.org/list-of-licenced-operators-by-lagos-state-lotteries-and-gaming-authority/` | Row: Institution "Busha Digital Limited", Trade Name "Signal", Category "Gaming Facilitation Permit", 15 June 2026 to 14 June 2027. It sits after the "GAMING FACILITATION PERMIT (PREDICTION MARKET)" heading (Bayse / Trence Software Tech Limited is the other row there). | H |
| `GET https://signal.markets/` | 200, Vercel, `last-modified: Thu, 15 Oct 2026 19:42:52 GMT`, title "Signal - Trade what you believe" | H |
| `GET https://api.signal.markets/health` | 200 `{"binary":"user_api","status":"ok","commit":"2f02be0..."}` | H |
| `GET /events?limit=100` | 87 open events, `has_more:false`; nearest closes within hours (hourly BTC/SOL), furthest 2027-07-01 | H |
| Trading activity | 18 trades in the last 24h (36 when counted once per outcome leg), on 6 events | H |
| busha.io itself | The Busha homepage, `/blog` (12 pages scanned), `/press`, `/about`, `/business`, `/pay` do not list Signal as a product (only the single blog post above mentions it). Confirms the task hint: busha.io does not advertise it. | H |

Verdict: **still_live = true**.

---

## 2. Kind and market model

- **Kind (H/M):** product of Busha Digital Limited. Terms of Use (bundled in the web app at `/terms`) call it "a software platform and electronic matching engine that facilitates peer-to-peer event contract trading" and say Busha "does not take positions, market-make against users, or underwrite any risk". The Busha blog, however, says "Signal may set the initial price or provide liquidity in some markets" (H, both). So: order-book exchange, with house-seeded quotes in at least some markets.
- **Market model (H, from `/events`, `/markets`, `/tickers`, `/markets/{id}/book`):**
  - Every market is **binary YES/NO**. `payout_per_share = "100"` (NGN 100 per winning share), `tick_size = "0.01"`, `price_precision = 2`, `size_precision = 2`, `min_order_size = "1"` (share). Prices are fractions of payout (0.41 = 41%), so they are directly comparable to other venues without FX; only sizing needs FX.
  - **Categorical = a set of binary markets under one event** (`event.markets[]`, 1 to 11 markets; `is_mutually_exclusive` true for 39 of 87 events, e.g. a 1X2 match = 3 markets "A wins", "draw", "B wins").
  - **Central limit order book per market, with a book for each outcome** (`/markets/{id}/book` returns `outcomes[].bids/asks` for YES and for NO; in the sample the NO book is the mirror of the YES book: YES ask 0.41 / NO bid 0.59, so complementary pricing is implicit, M). Limit orders (`tif: gtc`) and market orders exist (client code); sells before resolution are supported (blog).
  - **No outcome tokens.** Positions are rows in Busha's ledger (`/positions`, `/fills`, `/balances`). NOT FOUND (searched: Terms, bundles, GitHub org, API): any contract, token, chain id. The Terms contain boilerplate that trades are "recorded on a public ledger" but name no chain; treat as unverified (L).
- **Event metadata useful for linking (H):** `slug`, `category` (sports, crypto, culture, economics, politics), `subcategory`, `close_at`, `expected_resolution_at`, `resolution_rules` (free text), `verification_source` (+ `verification_source_url`), `resolution_mode` (`independent` 48 / `progressive` 35 / `atomic` 4), `review_window_seconds` (atomic events only: 3600 or 21600), `series_id` for recurring series (hourly BTC and SOL up/down), `tags` (see section 10), per-market `threshold_value` + `underlying_symbol` for crypto.

---

## 3. Chains and collateral

- **Chain: none found (H for absence in everything I could read).** The venue is a custodial ledger.
- **Collateral/currency: NGN (H).** Every event and market has `currency:"NGN"`. Funding is from a Busha account: the Busha blog says "Fund your Signal wallet from your Busha balance using Naira, stablecoins or other supported crypto"; minimum deposit NGN 500, "typically arrive ... in less than 30 seconds" (H, blog). The web app calls `GET /funding/methods` (one method code is `bank_transfer`), `GET /funding/source-balances`, `POST /deposits`, `GET /funding/transactions/{id}` (H, bundle) - all require auth (401 unauthenticated, H).
- **Balances:** a "restricted" (promo credit) balance exists that is "Trading only - can't be withdrawn" (H, wallet page bundle); withdrawals have a `withdrawal_hold` field.
- FX for sizing (H, `open.er-api.com/v6/latest/USD`, last update 2026-10-19 00:02 UTC): 1 USD = NGN 1,331.6.

---

## 4. Read API (unofficial-but-first-party, unauthenticated for market data)

- **Official docs:** `https://docs.signal.markets` exists (Mintlify) but redirects (HTTP 302) to `app.mintlify.com/api/end-user-auth/deployment?next=docs.signal.markets`, i.e. it is login-gated (H). The docs content is therefore NOT FOUND. Everything below is from live responses and from the web app's own client code.
- **Base URL:** `https://api.signal.markets` (H: `VITE_API_BASE_URL` in the production bundle; live responses). Behind Cloudflare, origin on Render (response headers). JSON error envelope: `{"error":{"type","code","message","param"}}`.
- **Public endpoints confirmed with unauthenticated GETs (H):**

| Endpoint | Notes |
|---|---|
| `GET /health` | `{"binary":"user_api","status":"ok","commit":...}` |
| `GET /events?limit=100[&cursor=<last event id>][&category=sports]` | Envelope `{"object":"list","data":[...],"has_more":bool,"next_cursor":..,"url":"/events"}`. Cursor in client code = id of the last item. One call with `limit=100` returned all 87 open events (232 KB). A `state=resolved|closed` query parameter was accepted but had no effect (same open list returned), so resolved history is NOT enumerable from the default listing. |
| `GET /events/{event_id}` and `GET /events/slug/{slug}` | Single event with embedded `markets[]` |
| `GET /markets` | Flat list of markets (200, 5.9 KB default page) |
| `GET /markets/{market_id}` | One market |
| `GET /tickers?market_id=a,b,c` (comma list, client batches 100) | Per market, per outcome: `best_bid, best_ask, mid_price, spread, last_price, high_24h, low_24h, price_change_24h, volume_24h, volume_total, notional_volume_24h, notional_volume_total, trade_count_24h`. `cache-control: public, max-age=3`. `market_id` is required (400 otherwise). |
| `GET /markets/{market_id}/book` | `{"as_of","depth":20,"market","object":"order_book","outcomes":[{"outcome":"YES","status":"active","bids":[{"price","size"}],"asks":[...]},{"outcome":"NO",...}]}`; `size` in shares |
| `GET /markets/{market_id}/prices?outcome=YES[&interval=1h]` | `{"interval":"1h","points":[{"price","t"}]}` (hourly price series; `outcome` required) |
| `GET /categories`, `GET /series`, `GET /series/{id}` | Category tree (sports: football, basketball, boxing, tennis; crypto: btc, eth, sol; culture: television, film, music; economics: economic-indicators, financial-markets; politics: elections); recurring series |
| `GET /markets/{market_id}/stream` (SSE) | `text/event-stream`, `cache-control: no-store`, unauthenticated. **Only works for crypto markets with an `underlying_symbol`**; for other markets it returns 404 "No spot price for this market" (H). Event names in client code: `price` (spot price of the underlying), `backfill`, `book`, `quote`, `trade`, `status`. Observed on the BTC hourly market: `price` then `backfill` (per-second spot points). I did not observe `book`/`trade` frames in the 8 s window (NOT confirmed). |

- **Authenticated (401 `invalid_token` "Authentication required." when called without a token, H):** `/events/{id}/trades`, `/events/{id}/holders`, `/leaderboard`, `/positions`, `/balances`, `/orders`, `/fills`, `/activity`, `/transactions`, `/funding/*`, `/notifications`, `/api_keys`. So **there is no public trade tape**; trades are visible only inside an authenticated session or via `volume`/`trade_count` counters on `/tickers`.
- **Websocket:** NOT FOUND (searched: all downloaded bundles for `WebSocket`, `wss:`, `socket.io`; the only push channel is the SSE above). The web app polls `/tickers` every 30 s (list view) / 8 s (detail view) (H, client constants).
- **Rate limits:** NOT FOUND (docs gated; no `X-RateLimit-*` or `Retry-After` header on any response I received). I made several dozen requests (most of them static-asset fetches) over about 30 minutes without throttling; I did not test limits.
- **Pagination/identity:** ids are prefixed strings (`evt_...`, `mkt_...`, `srs_...`). Event prices/books are not paginated.
- **Stability warning (M):** these routes are what the product's own frontend uses (OpenAPI-typed client, `openapi-fetch`), so a schema exists privately; there is no public changelog or SLA. A published OpenAPI spec is NOT FOUND (`bushaHQ/openapi` on GitHub is Busha's core crypto-payments API with servers `api.busha.io` / `api.sandbox.busha.so`, not Signal; there is no public Signal repo).

---

## 5. Trade path

- **Exists, authenticated, not usable from a wallet (H for what the client calls, NOT FOUND for the signing details).**
  - Account auth: `POST /login` (email+password, optional `/login/mfa`), `POST /signup...`, phone signup, **Busha OAuth** (`/auth/oauth/busha/start|complete`); bearer access token + refresh token (`POST /refresh`). Identity verification via Nigerian NIN (`/verify-identity/nin`) per the bundle, BVN per the Terms.
  - **API keys:** settings page `POST /api_keys` (the client wraps it in a step-up re-authentication guard, M), shown once as "Key ID" and "Secret key", key display prefix `apk_`. Scopes (H, bundle): "Full access" = `orders:read, orders:write, positions:read, fills:read, balance:read` ("Place and cancel orders, plus read account data"); "Read only" = the same minus `orders:write`.
  - **Orders:** `POST /orders/quote` (preview: returns fee, total cost, size) and `POST /orders` with an `Idempotency-Key` header (UUID). Body fields seen in client code: `market_id`, `outcome` (`YES`|`NO`), `side` (`buy`|`sell`), `type` (`limit`|`market`), `price`, `amount`, `tif` (`gtc`). Responses carry `fee`, `fee_rate`, `total_cost`, `net_proceeds`, `reserved_amount`, `promo_credit_applied`. Cancel endpoint and the request-signing/authentication header for API keys: NOT FOUND (docs gated; I created no key).
- **Wallet reachability:** none. There is no on-chain order, no signed typed data, no allowance, no deposit contract. See section 6.

---

## 6. PayBox reachability

**paybox_reachable = no.** Reasons (H unless noted): (1) custody and ledger are Busha's, there is no wallet-signed order or transaction proposal that the venue accepts; (2) collateral is NGN inside a Busha account; (3) account creation needs Nigerian KYC (BVN/NIN, document upload per Terms); (4) funding goes through Busha's own deposit flows (Naira bank transfer or crypto deposited to the Busha account). The only wallet-adjacent action conceivable is sending stablecoin from an EVM/Solana wallet to a Busha deposit address after logging in; the deposit address and supported networks are behind login (NOT FOUND) and that would be a plain transfer into a custodial account, not trading (M). No PayBox tool was called.

---

## 7. Fees

- **Per-market `fee_rate` (H, `/events`):** `0.04` on sports, politics and economics markets (195 of 231), `0.05` on culture (31), `0.10` on crypto (5). `maker_rebates_enabled:false`, `maker_rebate_percentage:"0"` on all 231.
- **Formula (H for the web app's own estimate, `data-*.js` chunk: `fee = shares * payout_per_share * fee_rate * p * (1 - p)`, with p in [0,1]; the server returns the authoritative `fee` in the quote/order response).** Example: p = 0.40, rate 0.04 gives 0.04 x 0.24 = about 0.96% of the NGN 100 payout, i.e. about NGN 0.96 per share (about 1 cent of probability). It is the Kalshi-style quadratic fee. For limit orders the UI adds the fee into the reserved cost (so makers appear to pay too; maker/taker split not documented, M).
- Terms: "Signal charges transaction fees, creator fees, or platform settlement fees as detailed dynamically on the user interface" (H). Deposit/withdrawal fees: NOT FOUND (behind login).

---

## 8. Resolution mechanism and dispute risk

- **Per-market published rules (H):** each event has `resolution_rules` (free text), `verification_source` (e.g. Sofascore 18 events, uefa.com 13, premierleague.com 8, "Official sources" 16, CoinMarketCap 3, NBS, NUPRC, NGX, CBN, CAF, FIFA, Spotify, Pulse Naija, Headies) and for crypto Up/Down the "Pyth BTC/USD reference price feed ... captured at the window's start and end". Blog: "Signal settles the market according to those published rules".
- **Who decides (H, Terms):** "Outcomes are settled algorithmically using designated, independent third-party data oracles or verified public information sources. Once an oracle resolves a market outcome, the transaction settlement and escrow distribution are mathematically final and legally unappealable." Busha "reserves the exclusive right to void the market and return all pre-funded escrow assets" if an event is cancelled, delayed or ambiguous. Disputes: formal claim to Busha's Compliance Department, then binding arbitration after 60 business days, Nigerian law and courts.
- **Risk assessment (M):** single-operator, discretionary void and no on-chain verifiability. Sources like Sofascore (a stats site) and "Official sources" are weaker than an oracle network. For events adopted from Polymarket the Signal rule text is Polymarket's description, but Signal settles by its own `verification_source`, not by Polymarket's (UMA) outcome; I could not establish whether Signal copies Polymarket's final result, so **basis risk** between a Signal leg and a Polymarket leg is real (NOT FOUND: any statement on this). `resolution_mode` values (`independent`, `progressive`, `atomic`) are undocumented; my reading (independent = standalone market, progressive = sub-markets settle as outcomes become known, atomic = whole event settles together after a `review_window_seconds` window) is L.

---

## 9. Geo / ToS / automation

- **Eligibility (H, Terms in bundle):** Nigerian-law contract, identity verification before first transaction (government ID, proof of address, BVN or equivalent), one account per person, "not ... located in any jurisdiction where prediction markets or digital asset trading violate local laws", and "will not use Virtual Private Networks (VPNs), proxies, or any obfuscation techniques to circumvent regional geofencing restrictions". The list of blocked countries is NOT FOUND. Market-data GETs from a non-Nigerian IP worked.
- **Automation (H, Terms), quoted sparingly:** "Your access is human-driven; access through automated means, including bots, scripts, or scrapers, without express written consent from Busha is strictly prohibited." Also bans "Deploying automated bots ... to manipulate market probabilities or claim disproportionate platform rewards". This **conflicts with the product shipping API keys with `orders:write`**; resolving it needs written consent from Busha (open question). Read-only polling of the public market-data endpoints is a gray zone under "scrapers"; get consent before running it in production.
- **Licence:** Lagos State Lotteries and Gaming Authority, Gaming Facilitation Permit, 2026-06-15 to 2027-06-14 (H). TechCabal frames both Signal and Bayse Markets as regulated gaming-facilitation operators and discusses the "gambling label" (H). Renewal after 2027-06-14 is a dependency.

---

## 10. Liquidity (all NGN, converted at 1 USD = NGN 1,331.6, 2026-10-19)

Source: my own pass over `GET /events` + `GET /tickers` for all 231 open markets at about 03:30-03:40 UTC on 2026-10-19 (derived fixture `catalog_and_liquidity_summary.json`). Open markets only; platform-lifetime history including resolved markets is NOT FOUND.

| Metric | Value | Tag |
|---|---|---|
| Open events / markets | 87 / 231 (sports 53 events, culture 11, economics 10, politics 8, crypto 5) | H |
| 24h money turnover (YES-leg + NO-leg notional = shares x NGN 100) | about NGN 22,192 = about US$17 | H |
| Same, YES-leg only (this is what the event-level `notional_volume_24h` field sums) | about NGN 10.5k = about US$8 | H |
| Lifetime turnover of currently-open markets (both legs) | about NGN 173,730 = about US$130 | H |
| 24h trades | 18 trades on 6 events | H |
| Markets with a live two-sided book on both outcomes | 90 of 231 (87 sports, 2 crypto, 1 politics); culture/economics/politics books are mostly empty | H |
| Spread | median 0.02 (of 180 quoted outcome-books: 172 at 0.02, four at 0.03, four at 0.12) | H |
| Depth example (PSG vs Barcelona "PSG wins" YES) | asks 14 shares at each of 0.41/0.42/0.43, bids 21/21/22 at 0.39/0.38/0.37; 1 share pays NGN 100 so each level is about US$1 of payout | H |

The identical-size symmetric ladder at a constant 0.02 spread with a flat hourly price series (0.40 for 17 of 18 hours, one 0.42) looks like an automated house quote, not organic depth (M). Context: the same PSG-Barcelona event on Polymarket shows volume 147,818 and liquidity 728,346 (Gamma API, USD, H).

---

## 11. Event categories and overlap with other venues

| Signal category | What is there (H) | Overlap |
|---|---|---|
| Sports (135 markets) | UEFA Champions League and Premier League / La Liga match winners (3-way markets), props from Sofascore (anytime scorer, 2+ goals, both teams score, 3+ goals), season winners (EPL 2027, LaLiga 2027, UCL 2027), manager sackings, Man City sanctions, Ballon d'Or 2026, Nigerian items (Super Eagles ranking, AFCON qualification, CAF Player of the Year) | Match winners and futures overlap Polymarket (adopted copies), likely Kalshi and others; props/Nigerian items probably unique |
| Crypto (5 markets) | Hourly BTC and SOL Up/Down (Pyth feed); monthly "close October 2026 above $100,000 / ETH $3,500 / SOL $250" (CoinMarketCap) | Overlaps Polymarket/Kalshi crypto price markets in subject, but with a different price oracle (Pyth vs Chainlink / CF Benchmarks), so basis risk |
| Politics (50 markets) | Nigerian presidential, Senate and 5 governor races (Lagos, Ogun, Kano, Oyo, Kaduna) 2027, plus "Which party will win the Senate in 2026?" (adopted from Polymarket) | Nigerian races overlap Polymarket only where "adopted"; the US Senate item overlaps Polymarket/Kalshi |
| Economics (10 markets) | Nigeria: CBN MPR cut, NBS October inflation < 20%, Q3 GDP, NUPRC oil output, NGX All-Share index, Dangote petrol gantry price/IPO | Essentially no counterpart on other venues (signal-only) |
| Culture (31 markets) | Headies awards (atomic events), Nigerian celebrity and music questions, Drake album (adopted) | Unique, except the Drake album |

---

## 12. Shared liquidity (is this an independent leg?)

- **41 of 87 events (47%) carry `tags:["adopted","adopted:polymarket","group:pm-game-<N>"]`** (H, `/events`). The adopted set is: UCL match days, EPL match days, Barcelona-Real Madrid, EPL/LaLiga/UCL champions, manager sacking, Man City items, Ballon d'Or, Infantino, Drake album, US Senate, Nigerian presidential/senate/governor races.
- **Verified link for one pair (H):** Signal event `evt_dbaa0admbosc73e5bo1g` has tag `group:pm-game-90122475`; Polymarket event id 1149399 (`ucl-psg-fcb-2026-10-20`) has `gameId` 90122475 and the same title and the same description text ("This event is for the upcoming UEFA Champions League game, scheduled for Tuesday, October 20, 2026 between Paris Saint-Germain FC and FC Barcelona."). Signal's `group:pm-game-<gameId>` is therefore a clean join key to Polymarket's `gameId` for the match events.
- **Prices track Polymarket (H observation, M interpretation):** PSG win Signal bid/ask 0.39/0.41 vs Polymarket 0.39/0.40; draw 0.21/0.23 vs 0.20/0.21; Barcelona win 0.39/0.41 vs 0.39/0.40 (fixture `crosscheck_psg_barcelona_signal_vs_polymarket.json`). Together with the constant 0.02 spread this suggests Signal anchors its house quote to Polymarket's price, not an independent order flow. Whether Signal routes any order to Polymarket: NOT FOUND (no builder code, relayer, or routing statement seen; Terms say orders are matched peer-to-peer on Signal).
- **Conclusion:** for adopted events Signal is a derivative of Polymarket pricing, not an independent arbitrage leg; its edge over Polymarket is below its own 2-cent spread plus about 1 cent of fee. For the remaining 46 events (Nigeria-specific) there is no other venue to arbitrage against, and trading is close to zero.

---

## 13. Fixtures (`docs/research/fixtures/busha-signal/`)

| File | Content | Tag |
|---|---|---|
| `health.json` | `GET /health` | H |
| `events_list_trimmed_3_of_87.json` | `GET /events?limit=100`, trimmed to 3 events (BTC hourly crypto, PSG-Barcelona sports with `adopted:polymarket` tags, NBS inflation economics); envelope keys intact | H |
| `tickers_psg_barcelona_3_markets.json` | `GET /tickers?market_id=...` | H |
| `book_psg_win_market.json` | `GET /markets/{id}/book` | H |
| `prices_psg_win_yes_1h.json` | `GET /markets/{id}/prices?outcome=YES` | H |
| `categories.json`, `series_btc_hourly.json` | `GET /categories`, `GET /series/{id}` | H |
| `sse_stream_btc_hourly_head_700B.txt` | first 700 bytes of the SSE stream (truncated, not valid as a full frame) | H |
| `error_401_authenticated_endpoint.json` | `GET /positions` without a token | H |
| `crosscheck_psg_barcelona_signal_vs_polymarket.json` | derived: Signal vs Polymarket quotes for one match | H (inputs), derived |
| `catalog_and_liquidity_summary.json` | derived: per-category market counts, two-sided counts, volumes | H (inputs), derived |

---

## 14. Adapter notes (if built)

- **Normaliser mapping:** event = grouping; market = binary contract; YES price = `mid`/`best_bid`/`best_ask` of the YES outcome in `/tickers` (already a probability; no FX). Size in shares, payout NGN 100 per share, so USD capacity = shares x 100 / 1331.6 (needs an FX feed; NGN moves). Currency is always NGN so far.
- **Polling plan:** `GET /events?limit=100` every few minutes for catalog (232 KB; consider `&category=` slices), `GET /tickers?market_id=<100 ids>` for quotes (3 calls cover everything; the server caches 3 s), `GET /markets/{id}/book` only for candidates. SSE `/markets/{id}/stream` for crypto hourly markets only.
- **Linking:** join `tags[group:pm-game-<gameId>]` to Polymarket `gameId`; otherwise use title/slug similarity. Do not pair Signal with Polymarket for execution (section 12).
- **Gate before production polling:** written consent from Busha (Terms section on automation) and a plan for the login-gated docs/rate limits.

---

## 15. Open questions

1. How do API-key requests authenticate (header, HMAC of what)? What are the rate limits? Needs the gated `docs.signal.markets` or a Busha contact.
2. Does Signal route or hedge adopted-market orders on Polymarket, or only copy the mid? Does it settle adopted markets from Polymarket's resolution?
3. Which countries are geofenced, and can non-Nigerian residents open accounts at all (Terms mention BVN/NIN)?
4. Is any on-chain component planned (the Terms talk of "distributed ledger" and "wallet address")?
5. Resolved-market history and lifetime volume: how to enumerate (state filter has no effect on the public list).
6. Meaning of `resolution_mode` and `review_window_seconds`; maker vs taker fee split.

---

## Sources

- TechCabal (2026-10-07), https://techcabal.com/2026/10/07/what-prediction-markets-must-fix-to-remove-the-gambling-label/ (fetched with a plain GET; WebFetch got 403). Linked from it: `https://www.busha.community/c/meetup-grants/signal-by-busha-predict-and-win-big` (page is a client-rendered shell; only the title "Signal by Busha, Predict and win Big." was readable) and `https://lslga.org/list-of-licenced-operators-by-lagos-state-lotteries-and-gaming-authority/`.
- Busha blog post, https://busha.io/blog/how-do-prediction-markets-work (dated 11.8.26); busha.io homepage, `/blog` pages 1-12, `/press`, `/about`, `/business`, `/pay` (no Signal product listing); `https://support.busha.io/en/` (no Signal collection).
- LSLGA licence list (above), parsed text rows for Busha Digital Limited / Signal and Trence Software Tech Limited / Bayse.
- Signal web app: https://signal.markets/ and its static bundles under `https://signal.markets/assets/` (index, api, use-events, use-tickers, use-funding, trade-modal, data, api-keys, terms, wallet-page chunks): read as text only, used for endpoint paths, API-key scopes, order body fields, fee formula, polling intervals and the Terms of Use text. Build/deploy identifiers inside the bundle (commit author names) were deliberately not recorded.
- Signal API (unauthenticated GETs, 2026-10-19): https://api.signal.markets/health, /events, /events/{id}, /events/slug/{slug}, /markets, /markets/{id}, /markets/{id}/book, /markets/{id}/prices, /tickers, /categories, /series, /series/{id}, /markets/{id}/stream; authenticated routes probed without credentials returned 401.
- Official docs gate: https://docs.signal.markets (HTTP 302 to Mintlify end-user-auth).
- GitHub (read-only `gh api`): `bushaHQ/openapi` (README + `openapi-spec.yaml`, Busha core API, servers `api.busha.io`, `api.sandbox.busha.so`), `bushaHQ` org repo list (no public Signal repo; `signal-dashboard` returns 404, private).
- Polymarket Gamma (public GET, cross-check only): https://gamma-api.polymarket.com/events?game_id=90122475 and `/public-search?q=Paris Saint-Germain Barcelona`.
- FX: https://open.er-api.com/v6/latest/USD (NGN 1,331.6, last update 2026-10-19 00:02 UTC).
- Sibling notes: `docs/research/venues/wedbush-futures-clear-street-apex-clearing-salttrade-signal-markets-bitmart-us-minor-fcm-ib-tech-partner-routes.md` (identified `api.signal.markets` and the Busha Vercel project), `docs/research/venues/signals.md` (different venue), `docs/research/venues/bayse-markets.md` (the other Lagos-permitted prediction market).
