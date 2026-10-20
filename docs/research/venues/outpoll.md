# Outpoll (outpoll.com) - adapter spec

Researched 2026-10-19 (~02:40-03:00 UTC). READ-ONLY: unauthenticated GETs to documented API hosts, two public WebSocket reads (SUBSCRIBE control message only, plus one passive read), public docs pages. No account, no API key, no deposit, no signing, no POST/PUT/DELETE, no wallet, no PayBox call. The documented `POST /api/events/search` was deliberately NOT called (POST rule). No third-party code cloned, installed or run (a ~70-line stdlib Python socket client of my own was used for the WebSocket reads). Generic User-Agent `insurance-markets-research/0.1` only.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (docs, market rules, API payloads, the press article) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/outpoll/` (11 files, largest 18 KB).
Limitation: the shared WebSearch budget was exhausted when this task started, so no independent third-party coverage was searched (see Not found).

## 0. Verdict

**adapter_priority: skip** (revisit only if volume or participant counts rise by orders of magnitude and quotes start tracking reality).

1. Live (H): site, docs, REST, WebSocket all answer today; Google Play listing updated 2026-10-15; markets resolved as recently as 2026-10-09.
2. Real, but a micro-venue: the 20 featured events sum to about $753 of "Vol." and 37 participants; the all-time P&L leaderboard's #1 is $266.45 and #20 is $1.05; observed live trades are 0.02-0.07 shares; Google Play shows "100+" downloads (H, section 8).
3. **Quotes are stale / house-seeded and do not track reality** (H, section 9). The "Who wins the 2026 MLB World Series?" event (volume 0, 0 participants, published 2026-07-21) still quotes Dodgers/Braves/Yankees/Astros/Phillies at Yes 12-25c; on Polymarket the same five teams are closed at 0 today. "US recession by end of 2026" is Yes 43/45c on Outpoll vs 6/7c on Polymarket. That is not an arbitrage leg; it is a signal that no one is arbitraging it (or that fills are not honoured). Treat any such gap as a trap until proven fillable and withdrawable.
4. Custodial CeDeFi: outcome shares are rows in an internal ledger on an undisclosed "custom internal blockchain"; trading is by account API key + HMAC, not by wallet signature. A PayBox EVM wallet could at most fund the account (network not public), it cannot place orders (H, section 5).
5. ToS lists the US, UK, EU, Singapore (and more) as prohibited and forbids bots/automated tools, while the API docs invite bots (H, section 10).

## 1. What it is

- Operator: "Outpoll Service LTD" (footer "(c) 2026"); ToS arbitration seat UAE; registration/licence NOT FOUND. (H: https://outpoll.com/, ToS)
- Self-description: "CeDeFi (Centralized-Decentralized Finance) prediction market platform that leverages proprietary blockchain and backend technology"; "custom internal blockchain ... In the future, the project will be migrated to another popular blockchain, or we will make our own blockchain public after a series of tests." (H: https://docs.outpoll.com/getting-started/what-is-outpoll.md)
- Also runs a **crypto futures/perps product** ("Crypto Trading": perpetuals, inverse perpetuals, funding rates, liquidation price, leverage; UI strings in the page payload) (H for UI strings; not researched further, not relevant to the aggregator).
- Token: "Outpoll token" (OPL in the coins list) "has not been released yet ... cannot be traded or exchanged" (H: docs `getting-started/outpoll-token.md`).
- Age: sitemap/event timestamps show events from 2026-07-21; GitHub org `Outpoll` created 2025-04-21 with 0 public repos (M, org identity unconfirmed). No official SDK on PyPI/npm (`outpoll`, `outpoll-api`, `outpoll-sdk` all 404) despite the Play listing mentioning "a dedicated package" (H for the 404s).
- The "leading alternative" claim in the lead article is a "Press Release / PR TEAM" piece with no Outpoll volume figure (H: https://www.thecoinrepublic.com/2026/08/24/beyond-polymarket-top-8-prediction-markets-for-2026/). The article does say the Android app exists, USDC settlement, limit/market orders, TP/SL, API support, token cashback; the first-hand checks below confirm app, USDC, orders, TP/SL and API; they do not confirm "leading".

## 2. Market model

- **Binary Yes/No contracts grouped into events.** An event (`ma[]` array) holds one binary market per candidate; multi-outcome events are N independent Yes/No markets (6 for the MLB event, one of them "Other"; 37 for the World Cup event). (H: `GET /api/events/{id}` fixtures)
- **Pricing**: shares trade at 0.01-0.99 USDC, pay 1 USDC if the side wins ("redeem shares at full value; if wrong, they expire worthless") (H: place-limit-order doc; what-is-outpoll).
- **Order book vs AMM**: described as limit and market orders against an order book (H: docs; WS `b`/`a` best bid/ask). The MLB event shows a fixed 4c spread around a "chance" for every candidate (bid/ask 0.21/0.25, 0.16/0.20, 0.14/0.18, 0.11/0.15, 0.08/0.12, 0.06/0.10), which looks like a formula quote, not organic depth (M). Yes and No are complements in one book (Yes ask 0.25, No ask 0.79 = 1 - Yes bid 0.21) (H, observed).
- **Tokenisation**: no on-chain outcome tokens documented. Each Yes/No side is a "runner" UUID (`r[].i`, `ip` = is-positive) used as `ba` (betting asset id) in orders; USDC is the quote asset with a fixed UUID. Internal ledger. (H: event fixture + order docs; internal-ledger conclusion is M.)
- Depth: the public order-book stream gives **top of book only** (last chance `c`, best bid `b`, best ask `a` per outcome), not levels (H).

## 3. Chains and collateral

- Collateral: **USDC** (coin id `078dcd98-928d-479f-8110-ff6d27e44de2`, `pmc: true` = "available as prediction market collateral"). It is the only coin with `pmc` true (H: fixture `coins_GET_wallet-mutator-view_api_coins.json`).
- Other listed coins (convert/deposit side): POL, BTC, USDT, LTC, ETH, SOL, OPL (token), BONUS ("Bonus USD", fee-discount credit) (H). A "Converter" feature exists; its fee page is an empty stub (H).
- Deposit: authenticated `GET /api/deposit/usdc-address` returns `{"i": assetId, "a": "0x..."}` (an EVM-format address) (H: docs). The deposit UI has "Select Coin and Chain Type" / "Select Network" with a "Minimum deposit" line (H: UI strings), but **which networks are supported is login-gated and NOT FOUND**.
- Settlement chain: "custom internal blockchain", not public (H, self-description).

## 4. Read API

| Surface | Detail | Tag |
|---|---|---|
| Docs | https://docs.outpoll.com (GitBook). Markdown of any page by appending `.md`; index at https://docs.outpoll.com/llms.txt; full text at https://docs.outpoll.com/llms-full.txt (205 KB). Several pages are empty stubs: Deposits, Withdrawals, all FAQs except API, Order types, Fees and conditions. | H |
| Public REST, hosts | **No single gateway.** `https://event-service.outpoll.com` (`/api/events/*`, `/api/categories`, `/api/tags/*`), `https://wallet-mutator-view.outpoll.com` (`/api/coins`, balances, deposit), `https://history-service.outpoll.com` (`/api/history/*`), `https://order-service.outpoll.com` (`/orders/*`), `https://auth-service.outpoll.com`. | H |
| **Doc error** | The "Public API Overview" says base URL `https://api.outpoll.com`. That hostname **does not resolve** (curl: could not resolve host). Use the per-service hosts above. | H |
| `GET /api/coins` (wallet-mutator-view) | 200, no auth, 9 coins. | H |
| `GET /api/categories` (event-service) | 200, no auth: sport, crypto, ai, politics, finance, science, entertainment, other (with sub-categories). | H |
| `GET /api/tags/popular?limit=N` (event-service) | 200, no auth: `[{"n","r","v","c"}]`; `c` = event count (football 22, politics 17, government 12 ...). | H |
| `GET /api/events/{eventId}` (event-service) | **200 with no auth, not listed among the public endpoints** (the docs list it under private hosts). Returns the full event: `i, s(slug), ti(title), d, r(resolution rules text), a(start), e(end), rd(resolved-at), v(visible), u(volume), pc(participants), ct(categories), tr(translations), ma[]`. Each market `ma[]`: `i, q, s, st(ACTIVE/RESOLVED), r[]({i,n:Yes/No,p,ip,o,iw}), b, t, ch, v`. REST `b` = best ask, `t` = best bid, `ch` = chance (mid) (inferred from matching WS `a`/`b`/`c`; M). | H (shape) / M (field meaning) |
| `POST /api/events/search?page=&size=` | Documented as public: body `{sb: VOLUME_24H|TOTAL_VOLUME|LIQUIDITY|NEWEST|OLDEST|ENDING_SOON|CHANCE, sd, l, ss, c[], t[], ft}`; paginated `content/totalElements/totalPages`. **Not called (POST).** The docs' own example response (`content[].id/title/outcomes[]`) disagrees with the docs' Python code (`event["i"]`, `["ti"]`, `["ma"]`, `["r"]`), so the real shape is probably the abbreviated one seen in `GET /api/events/{id}` (M). | docs only |
| Discovery without search | `https://outpoll.com/sitemap-events.xml` lists 146 event URLs (slugs; newest lastmod 2026-10-09). Home page HTML embeds ~20 featured events as JSON in the Next.js payload (`initialEvents`: id, slug, volume, endDate, participantCount, markets). Event id then feeds `GET /api/events/{id}`. (`outpoll.com/robots.txt` disallows `/api/` on the web host, which I did not crawl.) | H |
| REST history | Docs say "REST parity" `GET /api/events/{eventId}/outcomes/{outcomeId}/history`; on event-service it returned 500 "No static resource" (maybe lives on another host). | H (failure) |
| Auth + limits | Public endpoints: no key. Private: headers `OUTPOLL-API-KEY` (`op_k_...`), `OUTPOLL-API-SIGNATURE`, `OUTPOLL-API-TIMESTAMP`. **Rate limit 3/s, 50/min, 2,000/h, 10,000/day**, applied to public and private; "temporarily blocked", repeat offenders get the key permanently blocked (403). | H: https://docs.outpoll.com/api/faq.md |

**WebSocket (public, no auth; all confirmed to accept a connection, 101 Switching Protocols):**
- `wss://order-book.outpoll.com/event/ws`: `{"t":"SUBSCRIBE","e":"<eventId>"}` -> `SUBSCRIBED`, then `PRICES_DATA` (full) / `PRICES_DATA_DELTA`, server `PING`. Payload `d:[{"o":outcomeId(= market id),"c":last chance,"b":best bid,"a":best ask}]`. Confirmed live (fixtures `ws_order_book_*`). (H)
- `wss://chance-history-service.outpoll.com/ws`: SUBSCRIBE `{e, o[]}` -> `probability` / `UPDATE_HISTORY`; `HISTORY` request with periods 1s..1m. Documented, not tested. (docs H)
- `wss://history-service.outpoll.com/history/ws` (activity per event/outcome) and `.../last-trades/ws` (public tape, no subscribe). The last-trades socket connected and sent only `PING` for 25 s (no trades in that window), consistent with very low activity (fixture `ws_last_trades_25s_no_trades.txt`). (H)
- Private streams (order updates, balance, order feed) need an in-band `AUTH` message signed over `timestamp + "GET" + path`. Not tested.

## 5. Trade path and PayBox reachability: **partial (funding only; no wallet-signed orders)**

- Orders: `POST https://order-service.outpoll.com/orders/limit` body `{e: eventId, o: marketId, ba: yes/no runner id, qa: USDC id, s: BUY|SELL, p: 0.01-0.99, q: shares}`; `POST /orders/market` with `am` (USDC to spend, BUY) or `q` (shares, SELL); `DELETE` cancel; TP/SL endpoints; returns `{"i": orderId}`; 200 or 202 (async). (H: docs)
- Signature: `HMAC-SHA256(base64url-decode(secret), timestamp + METHOD + path + exactBodyString)`, base64url without padding; path only (no query, no host); timestamp within 30 s; body must match wire bytes exactly. (H: https://docs.outpoll.com/api/rest-api/private-endpoints.md)
- API keys come from a logged-in account (Settings -> API key), valid up to 1 year, SECRET shown once, and "supports all frontend actions except crypto conversion and any operation requiring code confirmation (such as withdrawals or enabling/disabling 2FA)". So **a key cannot withdraw** (a safety plus). (H: api/faq)
- PayBox: the order path is a shared-secret HMAC, not a wallet signature or a transaction proposal, so there is no "signed order" or "transaction proposal" an EVM wallet can produce for it. PayBox could only `request_transfer` USDC to the account's deposit address, and only after someone with a login learns the network (NOT FOUND publicly). Custody risk: balance sits in Outpoll's ledger. Hold the key+secret outside PayBox (PayBox secret storage might suit it, M, untested). Net: not integrable as an on-chain venue.

## 6. Fees

- A trading fee exists and is charged per fill (trade record field `f` "Fee"; UI strings "Prediction Trading fees", "hintFee: Trading fee charged for this fill", fee-discount via BONUS funds, and a "Free trading" promo label). **Schedule and formula NOT FOUND**: the docs' "Fees and conditions", Deposits and Withdrawals pages are empty; the PR article only says "low trading fees". (H for existence, NOT FOUND for amounts.)
- Visible cost today is the spread: ~4c on seeded markets (H); ~2c on the recession market (0.43/0.45) (H).

## 7. Resolution and dispute risk

- Per-event free-text rules in `r` (e.g. MLB: "team declared the 2026 World Series champion on MLB.com or by the AP/Reuters news wire ... If the season is cancelled, all outcomes resolve NO."). Docs claim "Smart Contract Backend ... fair, tamper-proof resolution" but no contract or oracle is named (H for rules text; the smart-contract claim is unverified marketing, L).
- Observed: World Cup event ended 2026-07-19T20:50Z, resolved (`rd`) 2026-07-19T22:17Z, all 37 markets RESOLVED. Trump fast-track event ended 2026-10-01, resolved 2026-10-09T08:36Z. So an operator resolves by hand within hours to days (H). On the resolved Trump market the flags are inconsistent (Yes `p=0, iw=true`; No `p=1, iw=false`) while the World Cup markets are consistent (winning side `p=1, iw=true`); I could not tell which side was paid (M, open question).
- No dispute/appeal process documented (NOT FOUND). Rules differ from Polymarket/Kalshi wording, so any cross-venue pair carries basis risk plus operator-trust risk.

## 8. Liquidity (dated 2026-10-19)

| Metric | Value | Source | Tag |
|---|---|---|---|
| Sum of "Vol." over 20 featured events | ~$753 (largest: Serie A top scorer $194, a Trump deportation market $194, World Cup $149, US recession $95) | home page payload (fixture `homepage_featured_events_volume_participants.json`); unit "$" per UI | H |
| Participants over the same events | 37 (max 8 on one event) | same | H |
| Platform-wide totals | not published (stats page shows only a leaderboard and live trades) | https://outpoll.com/en/stats | H |
| All-time leaderboard P&L | #1 $266.45, #20 $1.05 | stats page | H |
| Recent trade sizes | 0.02-0.07 shares at 40-58c | stats page live trades | H |
| Android app | "100+" downloads, updated 2026-10-15 | Google Play `com.outpollapp` | H |
| Headline MLB market | volume 0, participants 0 | event fixture | H |
| DefiLlama / DappRadar / third-party volume | NOT FOUND (searched: only the Play and site pages; WebSearch budget exhausted) | | |

Reference scale: the Polymarket MLB champion event alone shows ~$45.3M volume and ~$365K liquidity today (H, public gamma API; section 9).

## 9. Event overlap and cross-venue check

Categories with the same questions as bigger venues: sports futures (MLB World Series, Premier League, La Liga, Serie A top scorer, FIFA World Cup 2026, NBA 2026/27, Super Bowl 2027, K League), US macro (US recession by end of 2026), central banks (Bank of Korea), politics (Netanyahu remaining PM, US deportation policy), tech executives (Tesla, Apple CEO), tech/space (GTA VI release date, Artemis III), crypto (events tagged crypto exist; none sampled). 145-146 events total; most have zero volume.

Price check, 2026-10-19 ~02:45 UTC (fixture `comparison_outpoll_vs_polymarket_2026-10-19.json`):
- MLB World Series 2026: Outpoll Yes asks Dodgers 25c, Braves 20c, Yankees 18c, Astros 15c, Phillies 12c, Other 10c. Polymarket (`mlb-world-series-champion-2026`): those five teams `closed`, price 0; live leaders Brewers 62.5%, Rays 31.5%, Guardians 6.3%. Outpoll has not repriced since seeding on 2026-07-21 (H).
- US recession by end of 2026: Outpoll Yes 43/45c (volume $94.58, 5 participants) vs Polymarket 6/7c (event volume $2.32M) (H). Rule wording differs (Outpoll: NBER peak announcement OR two consecutive negative real-GDP quarters in 2025-26).
- Interpretation: apparent "edges" (e.g. buying No at 57-94c on dead outcomes) are almost certainly unfillable at size, subject to ToS/jurisdiction bans and to operator discretion at settlement. A scanner should **flag Outpoll quotes as unreliable by default** (volume 0, no recent trades, `ua`/`ca` older than weeks).

Liquidity sharing: no evidence of routing to or from Polymarket/Kalshi (the docs even ship a "Cross-Platform Price Monitor" that compares Outpoll against Kalshi and Polymarket), so it would be an independent leg in principle, but its prices are not market-clearing (M).

## 10. Geo / ToS / automation

- ToS (https://docs.outpoll.com/terms/terms-of-service.md): 18+; **prohibited jurisdictions: United States, United Kingdom, European Union, Singapore, Belarus, Ukraine, Russia, Israel, Iran, Syria, "other restricted regions"**; "Using VPNs ... is strictly prohibited"; **"Use bots, scrapers, or automated tools to interact with the Site" is prohibited**; arbitration in the UAE; class-action waiver. The ToS also describes Outpoll as "a polling and survey platform", which reads like recycled boilerplate and contradicts the prediction-market product (M). (H for the quotes.)
- The API docs and Play listing actively promote bots ("Developers building automated trading systems using API", "Build trading bots in Python"). The conflict is unresolved; an automated trader would be violating the ToS text unless the API is carved out. (H.)
- Reads from this (non-US) client were not geo-blocked on the web, REST or WebSocket hosts (H).

## 11. Adapter sketch (only if ever built; priority skip)

1. Discover: `sitemap-events.xml` slugs -> fetch event page JSON, or scrape the home payload -> `GET event-service/api/events/{id}` (3 req/s, 50/min budget; 146 events fit in ~3 minutes).
2. Prices: WS `order-book` per event (top of book). Map `o` -> market id -> Yes/No runner ids from the REST detail.
3. Quality gates before any signal: skip if `u` (volume) < threshold, `pc` < threshold, event `e` (end) already past, or WS bid/ask spread exactly 0.04 with `u` = 0 (seed pattern); cross-check against a liquid venue and treat large gaps as stale, not edge.
4. No trading adapter: needs a funded custodial account, ToS-violating automation in prohibited jurisdictions.

## Not found

- Fee schedule/formula; withdrawal fees/limits; supported deposit networks and minimums (login-gated; docs pages are empty).
- Dispute/appeal process; identity of the resolver; on-chain contracts or chain id of the "internal blockchain".
- Company registration/licence for "Outpoll Service LTD".
- Independent volume/TVL (DefiLlama etc.) and independent press (search budget exhausted; only the one PR article reviewed).
- The "DropsTab-style list" cited in the discovery hint.
- Response shape of `POST /api/events/search`, private endpoints, private WebSocket streams (not called).
- Any official GitHub repo or SDK.

## Open questions

1. Are the quotes on the MLB and recession markets actually fillable (and for what size), or are they dormant seeds? (needs an account; not done.)
2. Which networks does the deposit address support, and is the `0x` address the same on all EVM chains?
3. Is the API carved out of the ToS "no bots" clause (would need to ask the support contact listed in the ToS; not contacted).
4. On the resolved Trump market, which side was paid, given `p` vs `iw` disagree?
5. Does the REST history endpoint live on `chance-history-service` rather than `event-service`?
6. Is the docs' `api.outpoll.com` a planned gateway?

## Sources

- https://www.thecoinrepublic.com/2026/08/24/beyond-polymarket-top-8-prediction-markets-for-2026/ (PR article, L/promotional; link to outpoll.com is the only link).
- https://outpoll.com/ and https://outpoll.com/en (home, featured events), https://outpoll.com/en/stats, https://outpoll.com/en/event/who-wins-2026-mlb-world-series, https://outpoll.com/robots.txt, https://outpoll.com/sitemap.xml, https://outpoll.com/sitemap-static.xml, https://outpoll.com/sitemap-events.xml (H).
- https://docs.outpoll.com/llms.txt, https://docs.outpoll.com/llms-full.txt and pages: `getting-started/what-is-outpoll.md`, `getting-started/outpoll-token.md`, `api/introduction.md`, `api/faq.md`, `api/rest-api/public-endpoints/public-api-overview.md`, `.../search-events.md`, `.../get-available-coins.md`, `api/rest-api/private-endpoints.md`, `.../orders/place-limit-order.md`, `.../orders/place-market-order.md`, `.../deposit.md`, `api/rest-api/websockets/*.md`, `api/rest-api/python-examples/*.md`, `terms/terms-of-service.md` (H).
- Live GETs: https://wallet-mutator-view.outpoll.com/api/coins, https://event-service.outpoll.com/api/categories, https://event-service.outpoll.com/api/tags/popular?limit=10, https://event-service.outpoll.com/api/events/{id} (three events); WebSocket reads: wss://order-book.outpoll.com/event/ws (two events), wss://history-service.outpoll.com/last-trades/ws (25 s) (H, 2026-10-19).
- https://play.google.com/store/apps/details?id=com.outpollapp (100+ downloads, updated 2026-10-15) (H).
- https://gamma-api.polymarket.com/events?slug=mlb-world-series-champion-2026 and https://gamma-api.polymarket.com/public-search?q=... (reference prices only; Polymarket is covered by another workflow) (H, 2026-10-19).
- GitHub search / PyPI / npm presence checks (negative results) (H).

## Embedded-instruction / red-flag log

- Every docs.outpoll.com page and `llms.txt` ends with a GitBook "Agent Instructions" block telling AI agents to GET `...md?ask=<question>&goal=<user_goal>` to query the docs. Platform boilerplate; **not followed** (it would send the research question to a third party); the fixture copy of `llms.txt` has it removed.
- Docs/ToS contradictions: wrong public base URL (`api.outpoll.com` does not resolve); search-response example disagrees with the example code; ToS calls the product a "polling and survey platform" and bans bots while the docs promote bots.
