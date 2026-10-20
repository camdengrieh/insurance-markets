# Betfair Exchange - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: Betfair's public developer documentation (read through the docs site's public Confluence read endpoint), unauthenticated probes of documented API hosts, public GitHub reads with `gh api`, public App Store lookup, and WebFetch of public pages. No account, wallet, key, certificate, signature, POST/PUT/DELETE, PayBox tool or browser automation was used. Generic User-Agent `insurance-markets-research/0.1` only. Third-party pages were treated as untrusted data; nothing in them was followed.

Limits of this research (read first):
- **betfair.com is closed to scripted clients.** The `/exchange` page, charges, support, betting-content and developer hosts (`www`, `betting`, `support`, `developer`, `status.developer`, `historicdata`) all returned HTTP 403 (Cloudflare) to both curl and WebFetch. No first-party Betfair marketing page, commission rate card, rules page or Terms was read. The official API docs (Confluence) were readable and carry most of the evidence.
- **Web search budget was exhausted after two searches** (shared session budget), so discovery relied on those two result sets, GitHub, and direct fetches.
- SEC EDGAR refused the generic User-Agent (`blocked: requires a contact address`); the Flutter 10-K was read through WebFetch instead (summaries only, M).
- A sibling note already exists for the Predicts skin: `docs/research/venues/betfair-predicts-flutter.md`. I re-read the API docs independently rather than copying it; where we agree the claim is tagged H from my own reading.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/betfair-exchange/` (section 13).

---

## 0. Bottom line

1. **Live and large, independent of every on-chain venue, but not a PayBox-tradable leg.** Betfair Exchange is the deepest sports betting exchange (about GBP 84bn matched in 2025, M) and its public API plus Stream API are healthy today (H, probes). It is a custodial, KYC'd, fiat (GBP/EUR/USD...) UK/Gibraltar/Malta-licensed exchange with no chain, token or signed-order scheme. An EVM/Solana wallet reached through PayBox cannot hold, deposit to, or trade on it.
2. **Value to the project = sharp reference price for sports (and UK/European politics), as a read-only signal.** It is a genuinely independent order book (not shared with Polymarket/Kalshi), and the Back/Lay ladder gives real bid/ask depth. Use it to flag mispricing on the tradable venues, not to execute against it.
3. **Access is gated, not technical.** Every call needs a Betfair login (app key + session token). The free *Delayed* key has a variable 1-180 s delay, 3 price levels and a 180 s forced conflation on the Stream API. The *Live* key costs GBP 499, "read-only access ... isn't permitted", and "All data/API usage in any commercial context must be approved by Betfair" (H, Application Keys page). So a redistributing aggregator needs Betfair's approval; a personal tool run by an eligible human account holder can poll with the delayed key.
4. **Thin on US politics.** On 2026-10-18 a third-party aggregator showed Betfair at about USD 0.29m on 2026 Senate control vs Kalshi 15.4m / Polymarket 7.1m, and USD 1.56m on the 2028 presidency vs Polymarket 717m (M). Betfair's edge is sports and UK/Europe markets, where overlap with Polymarket/Kalshi is partial.
5. **adapter_priority = P2 (signal-only).** Best-in-class among the signal-only venues; revisit to P1 only if Betfair approves commercial data use (or a human-held live key and approved redistribution exist). Register `betfair-predicts` as an alias of this venue (`independent=false` between the two).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.betfair.com/exchange/betting/rest/v1.0/listEventTypes/` on 2026-10-19 | HTTP 400 `{"faultcode":"Client","faultstring":"DSC-0024","detail":{}}` (wrong method; host and backend alive, behind Cloudflare). Fixture `api_betfair_com_get_listEventTypes_400.txt` | H |
| TLS connect to `stream-api.betfair.com:443` on 2026-10-19 (nothing sent) | Server greeting `{"op":"connection","connectionId":"209-191026024344-13809399"}` then, after 15 s idle, `{"op":"status","statusCode":"FAILURE","errorCode":"TIMEOUT",...}` exactly as documented. Fixture `stream_api_unauth_connect_2026-10-19.txt` | H |
| Official API docs space | 115 pages, many edited 2026-05 to 2026-09 (Login 2026-09-08, Additional Information 2026-09-04, Best Practice 2026-08-19, placeOrders 2026-07-31) | H |
| App Store GB (iTunes lookup, 2026-10-19) | "Betfair Exchange Betting Odds" v6.5.0 released 2026-10-12, 30,299 ratings, seller Betfair LTD. Fixture `itunes_gb_betfair_apps_2026-10-19.json` | H |
| Client ecosystem on GitHub | `betcode-org/betfair` (betfairlightweight) 515 stars, pushed 2026-10-13; `betcode-org/flumine` 250 stars, pushed 2026-10-16; `betfair/stream-api-sample-code` pushed 2026-06-30; `betfair/API-NG-sample-code` pushed 2025-02-25 (older) | H |
| Flutter FY2025 10-K (via WebFetch) | "Our P2P products include the Betfair betting exchanges"; Exchange named as a "liquidity-dependent product"; Betfair locally regulated in Denmark, Italy, Malta, Romania, Spain, UK. https://www.sec.gov/Archives/edgar/data/1635327/000163532726000005/flut-20251231.htm | M (summary of primary) |
| ElectionBettingOdds page "Last updated 10:44PM EDT Oct 18, 2026" | Shows live Betfair prices and volumes for 2026 Senate and 2028 presidency | M (third party) |

Verdict: **still_live = true (H).**

## 2. Kind and market model

- **Kind:** centralised peer-to-peer betting exchange (central limit order book), operated by Flutter's Betfair; sportsbook-exchange. Not a prediction-market protocol.
- **Order book:** back/lay offers at **decimal odds** on a fixed price ladder (CLASSIC: 1.01-2 step 0.01, 2-3 0.02, 3-4 0.05, 4-6 0.1, 6-10 0.2, 10-20 0.5, 20-30 1, 30-50 2, 50-100 5, 100-1000 10; some markets use FINEST 0.01 throughout). Off-ladder prices fail with INVALID_ODDS (H, Additional Information). Virtual bets cross-match across runners in one market so displayed prices include them (`virtualise` flag) (H).
- **Market shapes (`marketBettingType`)** (H, Betting Type Definitions): `ODDS` (default; multi-runner categorical, e.g. Match Odds with 3 runners, outright winner with N runners), `LINE` (scalar-like: even-money 2.0, price is the line position, buy/sell a line), `ASIAN_HANDICAP_*`, `RANGE` (deprecated), `FIXED_ODDS` (sportsbook, deprecated). There is no native binary YES/NO type; a yes/no proposition is a 2-runner ODDS market, and "No" = lay "Yes".
- **Hierarchy:** eventType (sport) -> competition -> event -> market (`marketId` like `1.127771425`) -> runner (`selectionId` integer + `handicap`). Market type codes (MATCH_ODDS, WINNER, ...) are locale-independent (H).
- **Settlement states:** market `INACTIVE | OPEN | SUSPENDED | CLOSED`; runner `ACTIVE | WINNER | LOSER | PLACED | REMOVED | REMOVED_VACANT | HIDDEN` (H, Betting Enums). Betfair Starting Price (BSP) reconciles an auction price for some markets (LIMIT_ON_CLOSE / MARKET_ON_CLOSE orders).
- **Tokenisation:** none. Positions are database rows (marketId, selectionId, side, price, size), not tokens.
- **Event types relevant to the project** (ids from the official docs attachment `EventTypIds.xlsx`, a historical list so presence does not prove an active market; fixture `eventtype_ids_from_official_docs_attachment.tsv`): Soccer 1, Tennis 2, Cricket 4, Horse Racing 7, Special Bets 10, Financial Bets 6231, American Football 6423, Basketball 7522, **Politics 2378961**, Mixed Martial Arts 26420387, E-Sports 27454571, **Current Affairs 27388198**, plus Hollywood 28361980, TV Specials 28347303, Music 28347304, Novelty Bets 28347305, Weather 28361983 (H for id and name).

## 3. Chains and collateral

- **Chain: none.** Custodial account wallet. Supported currencies in the API docs: GBP, EUR, USD, HKD, AUD, CAD, DKK, NOK, SEK, SGD, RON; no crypto or stablecoin (H, Additional Information, page modified 2026-09-04). GBP minimum bet 1, minimum deposit 10.
- Separate ring-fenced Exchanges exist for Italy and Spain (own endpoints, 20-minute sessions) and for Australia/New Zealand (separate company outside Flutter per the almanac, M). Orders and liquidity do not cross between them (H for separate endpoints; M for separate liquidity).

## 4. Read API

**Official, authenticated only. No keyless public price endpoint.**

| Item | Value | Tag |
|---|---|---|
| Docs | https://betfair-developer-docs.atlassian.net/wiki/spaces/1smk3cen4v3lu3yomq5qye0ni/ (Getting Started, Application Keys, Betting API, Exchange Stream API, Reference Guide). Older `developer.betfair.com` entry points are 403 to scripts | H |
| Betting API | JSON-RPC `https://api.betfair.com/exchange/betting/json-rpc/v1` (method `SportsAPING/v1.0/<op>`) and REST `https://api.betfair.com/exchange/betting/rest/v1.0/<op>/`. **"All API requests should be sent as POST."** Italy/Spain/AU/NZ use other hosts | H |
| Account API | `https://api.betfair.com/exchange/account/{json-rpc,rest}/v1[.0]`; `getAccountFunds`, `getAccountDetails` (includes discount rate and Betfair points), `getAccountStatement` | H |
| Market discovery | `listEventTypes`, `listCompetitions`, `listEvents`, `listMarketTypes`, `listMarketCatalogue` (maxResults <= 1000; projections MARKET_DESCRIPTION, RUNNER_DESCRIPTION, EVENT, EVENT_TYPE, COMPETITION, RUNNER_METADATA, MARKET_START_TIME), navigation tree. `MarketFilter` has `eventTypeIds`, `marketTypeCodes`, `marketBettingTypes`, `textQuery`, `marketStartTime` etc. | H |
| Market metadata useful for linking | `marketBaseRate` (commission rate), `discountAllowed`, `rules` (free-text market rules), `rulesHasDate`, `clarifications`, `settleTime`, `bettingType`, `marketType`, `regulator`, `bspMarket`, `turnInPlayEnabled`, `priceLadderDescription`, `betDelayModels` | H (Betting Type Definitions, page modified 2025-12-11) |
| Prices / books | `listMarketBook` (priceProjection `EX_BEST_OFFERS`, `EX_ALL_OFFERS`, `EX_TRADED`, SP data; returns `status`, `inplay`, `betDelay`, `totalMatched`, `totalAvailable`, per-runner `lastPriceTraded`, `ex.availableToBack/availableToLay/tradedVolume`), `listRunnerBook`. Real shape in fixtures `docs_example_listMarketBook_open_market.json` (docs sample, not live data) | H |
| Streaming | Exchange Stream API: **raw TLS socket** `stream-api.betfair.com:443` (not WebSocket), CRLF-delimited JSON; ops `authentication`, `marketSubscription`, `orderSubscription`, `heartbeat`; messages `mcm` (market change) / `ocm` (order change); `conflateMs` (0 for live key), `heartbeatMs` 500-5000, segmentation; default 200 markets and limited connections per key; Swagger schema in `betfair/stream-api-sample-code` | H |
| Trades | No public trade tape. Per-price traded volume via `EX_TRADED` (`tradedVolume`), `lastPriceTraded`, `totalMatched`. Free/paid historical stream files sit on a separate site (`historicdata.betfair.com`, 403 to scripts; plan and price NOT FOUND) | H (EX_TRADED), M (history site exists, linked from docs) |
| Resolution | market `status = CLOSED`, runner `status = WINNER / LOSER / REMOVED / PLACED`, `settleTime`; `listClearedOrders`; "Settled market information is available for 90 days after settlement" (H, Getting Started) | H |
| Auth | Headers `X-Application: <app key>`, `X-Authentication: <session token>`, `Accept: application/json`. Session via interactive API login (`https://identitysso.betfair.com/api/login`, username+password[+2FA]) or **bot certificate login** (`https://identitysso-cert.betfair.com/api/certlogin`, self-signed client cert uploaded to the account). Session lasts 24 h (UK/Ireland customers) or 12 h (others) on .com; `keepAlive` extends it | H |
| App keys | Two per account. **Delayed:** free, runs on production, variable 1-180 s snapshot delay, 3 price levels, no per-selection `totalMatched` and no `EX_ALL_OFFERS` (the page's bullet says no `totalMatched` at all, its table says market-level total is available: internal contradiction), Stream API allowed but 2 connections, 200 markets and `conflateMs` forced to 180000. **Live:** real time, all levels, per-selection volume; GBP 499 activation fee debited from a funded KYC-verified account; read-only live use "isn't permitted"; apply via a form after testing on the delayed key | H (Application Keys, modified 2026-05-07; Exchange Stream API, modified 2026-05-11) |
| Commercial use | "App Key generation is for personal betting purposes only. All data/API usage in any commercial context must be approved by Betfair. Unauthorised commercial usage will be identified & blocked." Licensed/certified software vendors have a separate Vendor Services API / Vendor Web API (OAuth2, subscription tokens) | H |
| Limits | Login: 100 successful logins/min, else 20-minute ban. `listMarketBook`: <= 5 calls/s per marketId. Request weight: sum(weights) x number of market ids <= 200 points (EX_BEST_OFFERS 5, EX_ALL_OFFERS 17, EX_TRADED 17, BEST_OFFERS+TRADED 20, no projection 2, SP_AVAILABLE 3, SP_TRADED 7) else TOO_MUCH_DATA. So `EX_BEST_OFFERS` fits 40 markets per call. Stream: send a message within 15 s of connecting; SUBSCRIPTION_LIMIT_EXCEEDED at 200 markets by default. A transaction charge applies to excessive bets/cancels/errors for both key types. Idle keep-alive connections close after 3 minutes | H |
| Unauthenticated probes | REST: 400 DSC-0024 (section 1). Stream: greeting + TIMEOUT. No real market response could be sampled (no credentials by rule); the only shapes are the docs' own examples | H |

Robots: `https://www.betfair.com/robots.txt` (200) disallows sportsbook market/event/competition paths, `/myaccount/` and some localised `/exchange/plus/<lang>/` paths for all agents; the site itself is behind a Cloudflare challenge, so scraping is neither permitted in spirit nor workable (H, fixture `robots_betfair_com.txt`).

**Client libraries (not cloned or run):** `betcode-org/betfair` (MIT, Python, REST + streaming + historical file parser), `betcode-org/flumine` (MIT, trading framework), Betfair's own Java/JS/Python/PHP/C#/VBA samples (H, docs "Sample Code" page).

**Third-party integrations named in the discovery hint:**
- Clodds (`alsk1992/CloddsBot`, 2,984 stars, pushed 2026-10-02): `src/feeds/betfair/index.ts` uses `https://api.betfair.com/exchange`, `https://identitysso.betfair.com/api` and **`wss://stream-api.betfair.com/api/v1`** as a WebSocket. Betfair documents a raw TLS socket on `stream-api.betfair.com:443`, not a WebSocket path, so Clodds' stream code does not match the documented protocol (I did not test a WebSocket upgrade; treat that feed as unverified, M). It also ships `/bf back|lay` order commands (H for the repo contents).
- A "Claude Code betting-markets plugin": NOT FOUND (searched: `gh search repos` for "betfair claude", "betfair mcp server", "betting markets claude code plugin betfair smarkets polymarket"). The only related repo returned was `craig1901/Betfair-MCP-Server` (1 star, last push 2025-07-24, described as read-only; not read).

## 5. Trade path

- **Programmatic:** yes, via the Betting API: `placeOrders` (LIMIT, LIMIT_ON_CLOSE, MARKET_ON_CLOSE; persistence LAPSE / PERSIST / MARKET_ON_CLOSE; `timeInForce: FILL_OR_KILL` with `minFillSize`; `customerRef` up to 32 chars to de-dupe retries; `async` flag; bet-to-payout / profit / liability; up to 200 instructions per request on the global exchange), `cancelOrders`, `replaceOrders`, `updateOrders`, `listCurrentOrders`, `listClearedOrders`, Heartbeat API (`https://api.betfair.com/exchange/heartbeat/json-rpc/v1`; auto-cancels unmatched bets if the client loses connectivity), order stream (`orderSubscription`) (H).
- **Auth/signing:** no cryptographic order signature. Authority = logged-in session token tied to the account (bots use certificate login). The certificate and key live in the operator's environment.
- Live betting API keys cost GBP 499; delayed keys can place bets too but see stale prices.
- In-play bets are subject to a `betDelay` (seconds, returned per market) (H).

## 6. Reachable from PayBox?

**No (paybox_reachable = no).** There is no contract, token, deposit address or signed-order scheme, so an EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) or Solana wallet reached through PayBox cannot propose transactions or sign orders for it. Settlement is inside Betfair's ledger in fiat. Eligibility is by residence and ID, not by wallet (H for currencies/KYC requirement in the app key flow). The only conceivable bridge is PayBox's non-wallet credential types (secrets for an app key and certificate, a card for a human-made deposit), which I did not test and which would still need a human-held, KYC'd Betfair account (M/L; speculative). For the project, only the read path matters.

## 7. Fees

- **Commission:** charged to the winner on **net winnings per market** at settlement (not per bet, not per event); the rate is the Market Base Rate (MBR), exposed per market as `marketBaseRate`, and a user discount (Betfair points) applies only where `discountAllowed` is true (H for fields; the Betfair-run AU docs confirm the "net market profit, per market" mechanic, H). The UK/Irish standard MBR is reported as **5%**, reducible by points toward about 2% (M: PredictMarkets review updated 2026-10-12; the docs' sample statements also show `"commissionRate":"5%"` but those are 2018 data, L). The AU-run guide states 6% for AU sport and 8-10% for AU racing (AU only, H for what it says). The first-party UK rate card was not readable (403).
- **Premium Charge (renamed "Expert Fee" in some 2026 sources):** an extra profit-share on very profitable accounts; one review gives 20% on rolling 52-week gross profit of GBP 25k-100k and 40% above 100k (M/L; sources conflict, first-party page unreadable). It matters for a systematic edge-harvester.
- **Transaction charge:** excessive bets/cancels/errors per hour (AU guide: above 5,000 transactions in an hour; global docs only confirm that it exists) (H/M).
- **Live app key:** GBP 499 activation fee (H). Deposit/withdrawal fees and FX: NOT FOUND.
- No gas or on-chain cost.
- **Edge maths (derived, assume commission rate `c` on the winning leg, best prices `b` = best `availableToBack`, `l` = best `availableToLay`):**
  - Buy "Yes" (Back at `b`): gross price `1/b`; net-of-commission price `1/(1+(b-1)(1-c))`.
  - Buy "No" (Lay at `l`): gross price `1-1/l`; net price `(l-1)/(l-c)`. So the net "Yes bid" is `(1-c)/(l-c)`.
  - Bid/ask in Yes-probability terms: ask = `1/b`, bid = `1/l` (b < l, so ask > bid).
  - Commission nets across selections within one market for the same user, so a single-leg arbitrage should price the full commission on the winning outcome (conservative).

## 8. Resolution mechanism and dispute risk

- **Centralised, operator-resolved.** Each market carries free-text `rules` and `clarifications` in `listMarketCatalogue` (MARKET_DESCRIPTION); Betfair settles per those rules. No oracle, no on-chain dispute window (H for the fields, NOT FOUND for the UK rulebook text).
- **Resettlement happens after settlement:** the docs include an "Account Statement - Resettlement Lifecycle" showing `COMMISSION_REVERSAL` and `RESULT_FIX` entries when a settled market is corrected (H, Additional Information). Voids, `REMOVED` runners (with `adjustmentFactor` / reduction factors), `HIDDEN` runners and dead heats are part of the model. A "VAR void bets" section also exists in the stream docs (H, listed in the Stream API table of contents).
- Customer dispute path is Betfair's complaints process, then a regulator-approved ADR body for UK customers (L, general knowledge, not read).
- **Hazard for cross-venue arbitrage:** resolution-criteria mismatch (extra time/penalties, postponed or abandoned matches, "official result" definitions, void rules, election certification dates) between Betfair's per-market rules and Polymarket/Kalshi rules. Persist `rules` text and `settleTime` with each linked pair.

## 9. Geo, ToS and automation

- **Geo:** a **blocklist model**, not an allowlist. The `.com` Exchange is regulated under a Gibraltar regulator code (`MR_INT`) with UK, Malta, Spain, Romania, Italy and Denmark local licences listed in Flutter's 10-K (H/M). Country restrictions are not published; the almanac records closures of Japan, Latvia, Sri Lanka (Dec 2025), Canada (Jan 2026) and Mexico (May 2026) (M, almanac only; I could not confirm it in the parts of the 10-K I read). US availability: NOT FOUND; a US resident should be assumed ineligible. The interactive desktop login flow handles T&C updates and jurisdiction checks (H, Login & Session Management page).
- **Automation:** explicitly supported through the API (certificate bot login, Heartbeat API, Stream API, "Best Practice Guide" recommends the Stream API over polling and warns against needless cancel/replace) (H). Limits and keys as in section 4. Scraping the website is blocked (Cloudflare 403) and not recommended.
- **Data/commercial use:** personal betting only unless approved by Betfair (quoted in section 4). Quote from the Application Keys page: "Unauthorised commercial usage will be identified & blocked." Whether a non-commercial personal research tool that merely displays derived signals is acceptable is a judgement for Betfair; NOT FOUND in the readable docs.
- Betfair's website Terms of Use and the Developer Program terms were not readable (403): NOT FOUND.

## 10. Liquidity

| Figure | Source and date | Tag |
|---|---|---|
| GBP 84bn matched in 2025, +10% year on year (about USD 98bn per Yogonet) | Yogonet 2026-04-13 and Covers 2026-04-09 quoting Flutter | M |
| GBP 77bn matched volume, 3 million markets offered, 2.8 billion bets matched (undated, page footer 2025) | https://flutter.com/b2b/exchange-trading-accounts/ read 2026-10-19 | H (first-party marketing page; undated) |
| 2026 Senate control: Betfair USD 293,431 vs Kalshi 15,441,272, Polymarket 7,128,156, PredictIt 598,004 | ElectionBettingOdds, page stamped 2026-10-18 | M (third-party; how Betfair volume is measured, e.g. delayed key, unknown) |
| 2028 presidency: Betfair USD 1,557,765 vs Polymarket 717,237,993, Kalshi 45,458,058, PredictIt 1,411,816, Smarkets 269,795 | ElectionBettingOdds, 2026-10-18 | M |
| Exchange iOS app: 30,299 ratings (GB) | iTunes lookup 2026-10-19 | H |

No first-party open-interest/depth-by-category figure was found. Practical read: top-tier depth for football, tennis, horse racing and major sports; thin to moderate for US politics next to Polymarket/Kalshi; UK/European politics probably better (no 2026 figure found, NOT FOUND).

## 11. Event categories and overlap (where arbitrage could exist)

| Category | On Betfair Exchange | Overlap with other venues | Tag |
|---|---|---|---|
| Sports (soccer, tennis, basketball, American football, MMA, cricket, golf, esports...) | Yes, the core product; multi-runner (1X2, outrights), BSP, in-play | Polymarket (global/US), Kalshi, Limitless, Smarkets/Matchbook. Main arbitrage and reference-price surface. Binary venues list per-outcome contracts, Betfair lists runners, so linking is "selection = binary contract" | H (event types), M (venue overlap) |
| Politics / elections | Event type Politics (2378961); markets exist (2026 Senate control, 2028 winner shown with Betfair prices) | Polymarket, Kalshi, PredictIt, Smarkets. Betfair prices differ by 1-6 points from Polymarket/Kalshi on 2028 candidates on 2026-10-18 but volume is small | M |
| Current affairs, entertainment, specials | Event types exist (Current Affairs 27388198, TV Specials, Hollywood, Music, Novelty, Weather) | Polymarket culture markets | H (types exist historically), NOT FOUND (which are active) |
| Crypto price | "Financial Bets" type 6231 exists historically; active crypto-price markets NOT FOUND (needs an authenticated `listEventTypes`) | Polymarket, Kalshi, Limitless | L |
| Macro (rates, inflation) | NOT FOUND; UK financial-promotion rules make it unlikely (M, from the sibling note's source) | Kalshi, Polymarket | L |

## 12. Shared liquidity

- **Independent** of Polymarket, Kalshi, Limitless, Smarkets and Matchbook (own matching engine; H for separate API, M for liquidity). Professional traders who quote on several venues create lead/lag, not shared books.
- **Betfair Predicts (UK beta Yes/No skin) shares the Exchange's liquidity** (M, Covers/Yogonet, "continue to utilize the Exchange's liquidity supply"): do not count both as legs. FanDuel Predicts routes to CME-regulated contracts, not Betfair (M, per sibling note).
- Italian, Spanish and Australian/NZ Betfair exchanges are separate ring-fenced pools (M); only the `.com` global exchange is the reference book.

## 13. Fixtures

| File | What it is |
|---|---|
| `api_betfair_com_get_listEventTypes_400.txt` | Unauthenticated GET to the official API host: HTTP 400 DSC-0024 fault envelope (cookies and CDN ray id removed) |
| `stream_api_unauth_connect_2026-10-19.txt` | Server greeting and idle TIMEOUT from `stream-api.betfair.com:443`; proves raw-TLS CRLF-JSON protocol |
| `docs_example_listMarketBook_open_market.json` | Official docs example (old sample data, not live) of an OPEN 3-runner market with back/lay/traded ladders |
| `docs_example_listMarketBook_settled_market.json` | Official docs example of a CLOSED market showing WINNER / LOSER / REMOVED runner status (trimmed to 6 runners) |
| `betfair_docs_excerpts_2026-10-19.txt` | Short quoted excerpts with page ids and modification dates: keys, limits, endpoints, ladder, currencies, enums |
| `eventtype_ids_from_official_docs_attachment.tsv` | about 126 event type ids and names from the docs attachment (Politics 2378961, Current Affairs 27388198...) |
| `itunes_gb_betfair_apps_2026-10-19.json` | App Store GB records proving the apps are current |
| `robots_betfair_com.txt` | robots.txt as served 2026-10-19 |

## 14. Adapter notes

- **Venue model:** `betfair-exchange`, `kind = order-book exchange (custodial, fiat)`, `independent = true`, `tradable_via_paybox = false`, `role = reference/signal`. Alias `betfair-predicts`.
- **Identifiers:** `marketId` string `1.nnnnnnnnn`, `selectionId` int, `handicap` float; stable key = (marketId, selectionId, handicap). Store `marketType`, `bettingType`, `marketBaseRate`, `rules`, `clarifications`, `settleTime`, `eventType`, `event`, `competition`.
- **Binary view per selection:** Yes ask `1/b`, Yes bid `1/l`, with net-of-commission variants in section 7. Do not net across runners without checking the rules (dead heat, void runners, reduction factors, `numberOfWinners > 1`, PLACED/each-way). Skip `LINE`, `ASIAN_HANDICAP_*` and `RANGE` markets at first.
- **Cheapest access path (personal, non-commercial):** delayed app key, polling `listMarketBook` with `EX_BEST_OFFERS` (weight 5): 40 markets per call, <= 5 calls/s per marketId. Prices are 1-180 s old and per-selection matched volume is missing, so use only for slow markets (outrights, elections, pre-match) or as a coarse prior. Stream on a delayed key is conflated to 180 s, so it adds nothing over polling.
- **Real-time path:** live key (GBP 499, KYC, betting activity, Betfair approval for commercial/redistributed data) over the raw-TLS Stream API with `conflateMs = 0`.
- **Auth plumbing:** bot login by client certificate; refresh with `keepAlive` before the 12/24 h expiry; handle `INVALID_SESSION_TOKEN` by re-login; stay under 100 logins/min; log `connectionId` for support.
- **Staleness flag:** carry `isMarketDataDelayed` and `betDelay`; mark delayed-key quotes as non-executable for arbitrage.

## 15. NOT FOUND (searched: official Confluence docs space, SEC 10-K via WebFetch, flutter.com B2B page, ElectionBettingOdds, PredictMarkets review, Yogonet, GitHub; betfair.com blocked; search budget exhausted)

- First-party UK commission rate card, discount (points) schedule, Premium/Expert Fee thresholds, deposit/withdrawal fees.
- Betfair website Terms of Use, Developer Program terms, rulebook (void/dead-heat/election-certification rules), complaints/ADR route.
- Official list of blocked countries; US availability; confirmation of the closures the almanac records (Japan, Latvia, Sri Lanka, Canada, Mexico).
- Current first-party Exchange matched-volume figure with a date (only undated GBP 77bn and a reported GBP 84bn for 2025), politics-only volume, open interest or depth by category.
- A live (non-doc-example) API response (no credentials by rule).
- Which Betfair event types and markets (crypto, macro, entertainment) are active today.
- A "Claude Code betting-markets plugin" integrating Betfair.
- Historical-data plan names, prices and licence terms (`historicdata.betfair.com` 403).
- Whether the Stream API on a delayed key allows `conflateMs` below 180000 (docs say the value is forced to 180000).

## 16. Open questions

1. Will Betfair approve data use by an aggregator that only displays derived edge signals to its own operator (not redistribution)? Ask via Betfair Developer Support (human action).
2. Is the Delayed key's market-level `totalMatched` actually returned (Application Keys page contradicts itself)? Needs one authenticated call by a human account holder.
3. Do `listMarketCatalogue` results under eventType Politics (2378961) and Current Affairs (27388198) include crypto-price or macro-style markets in 2026? Needs one authenticated call.
4. UK/European politics depth in 2026: the only like-for-like figures found are US markets.
5. Clodds' WebSocket URL for the stream: does Betfair accept a WebSocket upgrade anywhere? Not tested.

## 17. Suspicious content (embedded instructions or AI-aimed text seen in third-party material)

- None found in the pages and repos I read (Confluence docs, Clodds source files, flutter.com B2B page, SEC 10-K summary, ElectionBettingOdds, PredictMarkets, Yogonet). The sibling note records an AI-addressed block in `betfair-datascientists/betfair-datascientists.github.io` `src/api/apiResources.md`; I did not read that file.

---

## Sources

H = read first-hand this session; M = secondary or summary; L = weak/stale.

- https://betfair-developer-docs.atlassian.net/wiki/spaces/1smk3cen4v3lu3yomq5qye0ni/ - official Betfair Exchange API docs; pages read via `.../wiki/rest/api/content/<id>?expand=body.view`: Getting Started (2687786, mod. 2026-07-14), Application Keys (2687105, 2026-05-07), Login & Session Management (2687869, 2026-09-08), Market Data Request Limits (2687478, 2025-05-21), Exchange Stream API (2687396, 2026-05-11), Best Practice Guide (2687730, 2026-08-19), Additional Information (2686993, 2026-09-04) incl. attachments EventTypIds.xlsx and MarketTypeMappingsOct2025.xlsx, Betting Type Definitions (2687465, 2025-12-11), Betting Enums (2687455, 2026-07-17), listMarketBook (2687510), listMarketCatalogue (2687517), placeOrders (2687496, 2026-07-31), Vendor Services API (2687938, 2026-03-12), Sample Code/Client Libraries (2687537, 2026-05-07), Developer Support (2687682), getAccountDetails (2699900), getAccountFunds (2687888), Betting On Italian Exchange (2687808) (H)
- https://api.betfair.com/exchange/betting/rest/v1.0/listEventTypes/ - unauthenticated GET, 400 DSC-0024, 2026-10-19 (H, fixture)
- stream-api.betfair.com:443 - unauthenticated TLS connect, greeting + TIMEOUT, 2026-10-19 (H, fixture)
- https://www.betfair.com/robots.txt - 200, 2026-10-19 (H, fixture); https://www.betfair.com/exchange, /aboutUs/Betfair.Charges/, betting.betfair.com, support.betfair.com, developer.betfair.com, status.developer.betfair.com, historicdata.betfair.com - 403 (H)
- https://itunes.apple.com/search?term=betfair+exchange&entity=software&country=gb - app records, 2026-10-19 (H, fixture)
- https://flutter.com/b2b/exchange-trading-accounts/ - GBP 77bn matched, 3m markets, 2.8bn bets, undated (H via WebFetch)
- https://www.sec.gov/Archives/edgar/data/1635327/000163532726000005/flut-20251231.htm - Flutter FY2025 10-K, Betfair P2P exchange and licence jurisdictions (M, WebFetch summary of chars 0-400000; direct curl blocked: requires a contact address)
- https://www.yogonet.com/international/news/2026/04/13/118532-flutter-launches-betfair-predicts-in-beta-in-the-uk-market - GBP 84bn 2025 matched, Predicts beta quotes (M)
- Covers 2026-04-09 article on Betfair Predicts (via the sibling note and search snippet; not re-fetched) (M): https://www.covers.com/industry/betfair-beta-testing-updated-exchange-interface-betfair-predicts-april-9-2026
- https://electionbettingodds.com/ and https://electionbettingodds.com/President2028.html - per-venue odds and volumes, 2026-10-18 (M, third party)
- https://predictmarkets.com/betfair-exchange/ - review dated 2026-10-12: 5% commission, points discount to ~2%, Expert Fee bands, API commentary (M/L, unsourced claims inside)
- https://betfair-datascientists.github.io (repo `betfair-datascientists/betfair-datascientists.github.io`, files `src/gettingStarted/commission.md`, `src/api/apiappkey.md`, read with `gh api`) - Betfair Australia-run guides: MBR mechanic, transaction charge, key activation (H for what it says; AU scope so M for UK)
- https://github.com/betcode-org/betfair, https://github.com/betcode-org/flumine, https://github.com/betfair/stream-api-sample-code, https://github.com/betfair/API-NG-sample-code - repo metadata via `gh api` (H)
- https://github.com/alsk1992/CloddsBot - `src/feeds/betfair/index.ts` read with `gh api` (H for contents)
- https://github.com/kachence/prediction-almanac/blob/main/data/platforms/betfair.yaml and `data/sources/betfair-exchange-api.yaml` - discovery evidence: blocklist geo model, closure notices, data gaps (M)
- `docs/research/venues/betfair-predicts-flutter.md` - sibling note (local file) for the Predicts skin
