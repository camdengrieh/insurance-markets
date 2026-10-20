# Betfair Predicts (Flutter) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web pages, Betfair's public developer documentation (read through the docs site's public Confluence read endpoint), Apple's public iTunes Search API, public Flutter investor-relations PDFs, and `gh api` reads of public repositories. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation was used. Generic User-Agent `insurance-markets-research/0.1` only. Third-party pages were treated as untrusted data; nothing in them was followed.

Limits of this research (read first):
- **betfair.com is closed to scripted clients.** `www.betfair.com/predicts` and every other www/support/developer/forum host I tried returned HTTP 403 with a Cloudflare managed challenge (WebFetch got the same 403). I did not retry or work around it. Consequently **no first-party Betfair page about Betfair Predicts (rules, fees, terms, FAQ, eligibility) was read**, and I could not confirm the URL of the product at all (the `betfair.com` URL in the task is the brand home page).
- **The session's WebSearch budget was exhausted** at the start, so no search-engine discovery was possible. Everything Predicts-specific therefore rests on **one news article (Covers, 2026-04-09) plus one explainer page that cites it (NEXTPredict, modified 2026-09-23)**. Treat all Predicts-specific claims as single-source (M).
- The Betfair **Exchange API documentation** (official, current to 2026-09) was read in full for the relevant pages. It does not mention Betfair Predicts anywhere (searched the whole docs space; fixture list below).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/betfair-predicts-flutter/` (section 13).

---

## 0. Bottom line

1. **Betfair Predicts is a Yes/No skin on the Betfair Exchange, not a separate venue.** Covers (2026-04-09) calls it "effectively a reskinning of the Betfair Exchange" and says "The updated interface will continue to utilize the Exchange's liquidity supply" (M, single source, small-model summary of the article). Betfair's own spokesperson, per Covers: "This is a BETA product that will evolve based on customer feedback" (M).
2. **Not an independent liquidity leg relative to the Betfair Exchange** (same book, M). It *is* independent of Polymarket/Kalshi/Limitless etc., so the underlying Betfair Exchange is a genuinely useful sharp reference price for sports and politics. That value belongs in a **Betfair Exchange adapter**, not a "Predicts" adapter. No Betfair Exchange venue note exists in `docs/research/venues/` yet (checked); recommend a separate spec.
3. **Access is the blocker, not the technology.** UK-only beta, "select users" / "invite-only" (the two sources disagree on wording), under a UKGC licence. Funding is a custodial GBP (or EUR/USD) fiat account with KYC. **A PayBox EVM/Solana wallet cannot hold or move Betfair funds** (section 6).
4. **Read API exists but only for the Exchange and only with credentials.** Official, mature, POST-only, needs an app key plus session token (a Betfair login). A free *delayed* key (1-180 s delay, no traded volume, 3 price levels) is usable for a slow reference signal; the *live* key costs GBP 499, requires placing bets, forbids read-only use, and commercial use of the data "must be approved by Betfair" (H, section 4). Whether Predicts markets are exposed in the API (same market ids?) is **NOT FOUND**.
5. **adapter_priority = P2 (signal-only).** Do not build a Predicts-specific adapter. Register `betfair-predicts` as an alias of `betfair-exchange` (`independent = false`, `tradable_via_paybox = false`) and, if the project wants a sharp sports/politics reference, spec the Exchange separately (delayed-key polling or Stream API on an approved live key).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Covers, "Betfair beta testing updated exchange interface, Betfair Predicts", Grant Mitchell, updated 2026-04-09 | Beta "recently launched" in the UK for "select" users; no exact launch date; "BETA product" quote. https://www.covers.com/industry/betfair-beta-testing-updated-exchange-interface-betfair-predicts-april-9-2026 | M (small-model summary of the article) |
| Covers prediction-markets timeline | One Betfair Predicts entry ("April 9: Betfair is beta-testing Betfair Predicts in the UK"); no later entry (page read in full across three chunks) | M |
| NEXTPredict UK legal page, `dateModified` 2026-09-23 | Table row: "Betfair Predicts, Betfair (Flutter Entertainment), Invite-only UK beta since April 2026, with sport, politics and entertainment markets, Existing Gambling Commission licence". Cites only the Covers article for it. https://nextpredict.io/legal/uk/ | H (page text and date read from raw HTML), M as evidence (it repeats the April source; "invite-only" is NEXTPredict's wording, Covers did not say invite-only) |
| Apple App Store GB (iTunes Search API, fetched 2026-10-19) | No app named "Betfair Predicts". The Exchange app "Betfair Exchange Betting Odds" (`com.betfair.research.BetfairClient`, Betfair LTD) is v6.5.0 released 2026-10-12 (30,299 ratings); its description and release notes do not mention Predicts or Yes/No contracts. Fixture `itunes_gb_betfair_exchange_app.json` | H |
| Flutter Q2 2026 earnings release (2026-08-05) and slides | Name FanDuel Predicts repeatedly; **no mention of Betfair Predicts or UK prediction markets** (crude text extraction of the PDF: negative result is M). UK commentary covers Sky Bet/iGaming only. https://flutter.com/media/g23an0ae/flutter-q2-2026-earnings-release.pdf | M |
| Betfair Exchange API docs space (115 pages; many edited 2026-05 to 2026-09) | Exchange API itself is actively maintained; no Predicts page, enum or market type | H |
| betfair.com | 403 Cloudflare challenge on every path (fixture) | H (403) |

Verdict: **still_live = true with low confidence for Predicts specifically.** The Betfair Exchange and Flutter are certainly live (H). Predicts was a UK beta in April 2026 and is still *listed* as a beta on a page modified 2026-09-23, but I found no first-party or post-April confirmation (NOT FOUND; searched: Covers timeline, NEXTPredict, App Store, Flutter Q2 2026, Betfair dev docs; betfair.com blocked; web search unavailable). It could be quietly live, limited to a small cohort, or discontinued.

---

## 2. Kind and market model

- **Kind:** UI layer over a regulated, custodial peer-to-peer betting exchange (Betfair Exchange), run by Betfair (Flutter Entertainment) under its existing UK Gambling Commission licence (M, Covers and NEXTPredict). The UKGC's own February 2026 blog says prediction-market products "would likely be classed as a 'betting intermediary'" and their core features resemble a "betting exchange" (H, https://www.gamblingcommission.gov.uk/blog/post/prediction-markets-heres-what-you-need-to-know, published 2026-02-04; page read via WebFetch summary).
- **Market model:** per Covers, users buy "Yes" and "No" contracts on specific outcomes; this contrasts with sportsbook odds set by the house (M). Mapping to the Exchange is my inference (M/L): **Yes = Back, No = Lay at the same selection**, matched on the same order book. Not stated by any source; do not hard-code until a Predicts market is seen in the API.
- **Underlying Exchange model (H, official docs):** central limit order book of back/lay offers at decimal odds on a fixed price ladder (invalid prices return INVALID_ODDS); markets have `marketBettingType` ODDS, LINE, RANGE (deprecated), ASIAN_HANDICAP_* or FIXED_ODDS (sportsbook, deprecated). Multi-runner (categorical) markets are the norm (Match Odds has three runners). Virtual-bet cross-matching exists across runners in a market (docs "Virtual Bets"). Betfair SP (starting price) auctions exist for some markets. No YES_NO/BINARY/PREDICTION value is documented in Betting Enums (H, id 2687455).
- **Tokenisation:** none. Positions are rows in Betfair's database (selection id + side + stake + price), not tokens (H by absence in the docs).
- **Price display:** Yes/No pricing format (probability-style or pence) is NOT FOUND; the API returns decimal odds (implied probability = 1/odds, before commission).

## 3. Chains and collateral

- **Chain: none.** Custodial fiat wallet inside the Betfair account. Official currency table lists GBP, EUR, USD, HKD, AUD, CAD, DKK, NOK, SEK, SGD, RON; **no crypto or stablecoin** (H, API docs "Additional Information", id 2686993). GBP: min bet 1, min deposit 10.
- Predicts-specific collateral: NOT FOUND; assume the same GBP Exchange wallet (M/L, because Predicts "continues to use the Exchange's liquidity").
- Funding methods (cards, bank, PayPal) could not be read (support pages 403); not needed for the verdict because no crypto rail appears anywhere.

## 4. Read API

**Official: authenticated only (Betfair Exchange API). Nothing Predicts-specific.**

| Item | Value | Tag |
|---|---|---|
| Docs | https://betfair-developer-docs.atlassian.net/wiki/spaces/1smk3cen4v3lu3yomq5qye0ni/ (Getting Started, Application Keys, Betting API, Exchange Stream API, Reference Guide). Older entry points developer.betfair.com / docs.developer.betfair.com return 403 to scripts | H |
| Betting API (UK/global) | JSON-RPC `https://api.betfair.com/exchange/betting/json-rpc/v1` (method `SportsAPING/v1.0/<op>`), JSON REST `https://api.betfair.com/exchange/betting/rest/v1.0/<op>/`. **"All API requests should be sent as POST."** NZ/AU use `api.betfair.com.au`; Italy/Spain use separate hosts | H |
| Account API | `https://api.betfair.com/exchange/account/{json-rpc,rest}/v1[.0]` (getAccountFunds etc.) | H |
| Stream API | TLS socket `stream-api.betfair.com:443`, CRLF-delimited JSON, ops `authentication`, `marketSubscription`, `orderSubscription`, `heartbeat`; default 200 markets per connection; Swagger schema in `github.com/betfair/stream-api-sample-code` | H |
| Markets | `listEventTypes`, `listCompetitions`, `listEvents`, `listMarketTypes`, `listMarketCatalogue` (market name, runners, description, regulators), navigation tree at `GET https://api.betfair.com/exchange/betting/rest/v1/en/navigation/menu.json` (needs headers) | H |
| Prices / books | `listMarketBook` (priceProjection EX_BEST_OFFERS / EX_ALL_OFFERS / EX_TRADED, SP data, totalMatched), `listRunnerBook`; Stream `marketSubscription` for deltas | H |
| Trades | Per-market traded ladder via EX_TRADED; no per-trade public tape. Free historical stream files exist on a separate site (historicdata.betfair.com, 403 to scripts; NOT verified) | H (EX_TRADED), L (history site) |
| Resolution | Market `status` (OPEN/SUSPENDED/CLOSED), runner `status` (WINNER/LOSER/REMOVED...), `listClearedOrders` and account statement resettlement entries | H |
| Auth | Header `X-Application: <app key>` + `X-Authentication: <session token>`. Session via interactive login (`https://identitysso.betfair.com/api/login`, username+password, 2FA appended) or certificate bot login (`https://identitysso-cert.betfair.com/api/certlogin`, 2048-bit RSA self-signed cert uploaded to the account). Session lifetime 24 h for UK and Ireland customers, 12 h otherwise; Keep Alive | H |
| App keys | Two per account. **Delayed:** free, runs on production, variable 1-180 s delay, no `totalMatched`/EX_ALL_OFFERS, 3 price levels, Stream API limited to 2 connections and 200 markets (and `conflateMs` forced to 180000). **Live:** real time, all levels, matched volume; **GBP 499 activation fee debited from a funded, KYC-verified account; "read-only access using the Live App Key isn't permitted"**; must test on the delayed key first | H (Application Keys page, modified 2026-05-07) |
| Commercial use | "App Key generation is for personal betting purposes only. All data/API usage in any commercial context must be approved by Betfair. Unauthorised commercial usage will be identified & blocked." | H |
| Limits | Login: 100 successful logins/min else 20-min ban. `listMarketBook`: max 5 calls/s per marketId. Request weight: sum(weight) x number of market ids <= 200 points (EX_BEST_OFFERS=5, EX_ALL_OFFERS=17, EX_TRADED=17, EX_BEST_OFFERS+EX_TRADED=20). Transaction charge on >5,000 bets/cancels/errors per hour (section 7) | H |
| Unauthenticated probe | `GET https://api.betfair.com/exchange/betting/rest/v1.0/listEventTypes/` -> `400 {"faultcode":"Client","faultstring":"DSC-0024","detail":{}}` (DSC-0024 = RescriptDeserialisationFailure per docs; the host is live, GET is not the supported method). Fixture `api_betfair_com_get_listEventTypes_400.txt` | H |
| Public/unauth read | **None.** No keyless price endpoint is documented; the website itself is behind Cloudflare (403 challenge); robots.txt (`User-agent: *`) disallows the sportsbook paths `/sport*marketId*`, `/sport*eventId*`, `/sport*competitionId*` and `/myaccount/`, and lists `exchange-events_desktop.xml`-style Exchange sitemaps (which were also challenged) | H |

No real market response could be sampled (no credentials by rule). The only response-shape sample is the documentation's own `listEventTypes` JSON-RPC example, excerpted in `betfair_exchange_api_docs_excerpts.txt` (clearly labelled as a docs example, not live data).

Third-party libraries (`betfairlightweight`, `flumine`, etc.) exist per the docs' sample-code page; none were cloned or run.

## 5. Trade path

- **Exchange API:** `placeOrders` (LIMIT, LIMIT_ON_CLOSE, MARKET_ON_CLOSE; persistence types incl. LAPSE; fill-or-kill; bet-to-payout/profit/liability), `cancelOrders`, `replaceOrders`, `updateOrders`, `listCurrentOrders`; Heartbeat API (auto-cancel on lost connection); order stream. Auth as above (app key + session; bots use certificate login). Orders are signed by nothing cryptographic: authority is the logged-in session (H, API docs).
- **Predicts:** whether Yes/No orders map to `placeOrders` on the same market ids is NOT FOUND. A Predicts-specific API, if any, is not documented.
- Betting needs a live app key (GBP 499) and recurring bet activity; delayed keys can also place bets (H) but the prices are delayed up to 180 s.

## 6. Reachable from PayBox?

**No.** Betfair is a custodial, fiat, KYC'd, UKGC-licensed account. There is no on-chain contract, token, deposit address or signed-order scheme, so an EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) or Solana wallet reached through PayBox cannot propose transactions or sign orders for it. Settlement happens inside Betfair's ledger in GBP/EUR/USD. Eligibility is by UK residence and ID, not by wallet (H for currencies/KYC, M for Predicts being UK-only). If the project wants Betfair prices as a *signal*, only the read path (section 4) is relevant and it needs a human-held Betfair account that PayBox does not manage.

## 7. Fees

- **Predicts fees: NOT FOUND** (Covers: not mentioned; betfair.com blocked).
- **Exchange commission (the likely basis, M):** Betfair charges a "Market Base Rate" on **net winnings per market**, deducted at settlement; the payer is the winner. I could not read Betfair UK's rate card (support pages 403). Betfair's own API docs show `"commissionRate":"5%"` on Match Odds in sample statements (illustrative 2018 data, L for current value). Betfair's Australia-run docs state 6% for sport and 8-10% for Australian racing (AU only, not UK; H for what they say, https://betfair-datascientists.github.io/ source `src/gettingStarted/commission.md`, repo updated 2026-10-19).
- **Other charges (M, from the same AU-run page; verify for UK):** transaction charge of 0.2p per transaction above 5,000 per hour (bets placed/cancelled/modified plus errors), offset against commission; Premium Charge profit-share for the top ~0.5% of customers (UK parameter 0.025 in the formula `Total_Charges = (Commission_Paid + 0.03 x Losses)/2`, 0.025 for UK accounts). The global API docs confirm only that a transaction charge applies to both key types.
- **Edge maths:** at 5% commission, a Back at decimal odds `o` returns `1 + (o-1)*0.95` per unit on a win; implied probability net of commission is higher than `1/o`. Scanner must apply per-market commission, not a flat fee (the "Rules" tab per market carries the rate, per the AU page).
- No gas, no on-chain costs. Deposit and withdrawal fees: NOT FOUND for the UK.

## 8. Resolution mechanism and dispute risk

- **Centralised, operator-resolved.** Betfair settles each market per its published market rules (the AU page says rules and the commission rate sit in each market's "Rules" section; H for the AU wording only). No oracle, no on-chain dispute window.
- **Resettlement can happen after settlement** (H, API docs "Account Statement - Resettlement Lifecycle": market "unsettled" examples show `COMMISSION_REVERSAL` and `RESULT_FIX` entries, i.e. settlements get reversed and redone). Voids, removed runners and dead-heat/reduction rules are also part of the model (REMOVED runner status). Dispute path for a UK customer is Betfair's complaints process then an ADR body (L, general knowledge, not read).
- Predicts-specific rulebook, void rules, resolution sources: NOT FOUND.
- For cross-venue arbitrage, resolution-criteria mismatch (Betfair market rules vs Polymarket/Kalshi rules, e.g. extra time, postponements, "official result" definitions) is the main hazard; Betfair rules are per-market free text.

## 9. Geo, ToS and automation rules

- **Geo:** Predicts is a **UK** beta (M). The UKGC blog says unlicensed prediction-market operators "should ensure they do not target or transact with consumers in Great Britain" (H summary). Betfair's login flow can return `LOGIN_RESTRICTED` and the API has separate Italian/Spanish/AU/NZ exchanges (H). The www.betfair.com root 302s to a country path (`/th` from this egress), i.e. geo-routing exists (H).
- **Automation:** allowed on the Exchange via the API, which is designed for bots (non-interactive certificate login, Heartbeat API, Stream API) (H). The AU docs say live-key read-only use is not allowed and "ongoing wagering activity is required to maintain fee-free live access" (H for the AU text; the global page says read-only live access "isn't permitted"). Commercial data use requires Betfair approval (H). Scraping the website is a poor option: Cloudflare challenge on every path I tried, and robots.txt disallows sportsbook market/event id paths for all agents (the Exchange pages are not disallowed by robots.txt but are challenged) (H).
- **Predicts ToS / eligibility / invite mechanism:** NOT FOUND.
- Note on cohorts: Covers says "limited trial with select U.K. users"; NEXTPredict says "invite-only". An aggregator cannot assume it can read Predicts-only markets even with a normal Betfair account.

## 10. Liquidity

- **Predicts volume / OI / TVL: NOT FOUND.** Flutter's Q2 2026 release does not report it (M).
- **Betfair Exchange (parent book), M:** Covers says the Exchange "tracked £84 billion ($112.9 million) in trades in 2025, roughly a 10% annual increase"; the article itself is internally inconsistent (the dollar figure does not match the pound figure), so treat the number as unverified (L). No first-party Exchange volume figure was read this session (Flutter annual report PDF text not extractable with available tools; Wikipedia gives only 2013 data, L).
- Practical depth indicator: the Exchange app has 30,299 App Store GB ratings and the Betfair sportsbook app 111,368 (H, 2026-10-19), consistent with a large UK customer base, but that says nothing about Predicts-cohort depth.
- Predicts cohort is a "beta" for "select" users (M); assume thin until measured.

## 11. Event categories and overlap (where arbitrage could exist)

| Category | Betfair Predicts / Exchange | Overlap with | Tag |
|---|---|---|---|
| Sports | Yes (Exchange: football, horse racing, tennis, cricket, golf, rugby, boxing, many more; Predicts: "sport") | Polymarket, Kalshi, Limitless, Smarkets, Matchbook, CDNA/CME sports contracts. Main arbitrage and reference-price surface, but Betfair uses match-odds style multi-runner markets vs binary contracts | H (Exchange event types from docs/app), M (Predicts) |
| Politics / elections | Yes ("politics"; UK and international; US midterms are 2026-11-03) | Polymarket, Kalshi, PredictIt, Smarkets | M |
| Entertainment | Yes ("entertainment") | Polymarket, Kalshi | M |
| Crypto price, macro (rates, inflation, financial) | **No.** NEXTPredict: "Neither product lists contracts on interest rates, inflation or other financial outcomes" (FCA 2019 retail binary-options ban) | None | M |

## 12. Shared liquidity

- Predicts **shares liquidity with the Betfair Exchange** ("continue to utilize the Exchange's liquidity supply", M). One book, two skins: do not count both as independent legs.
- Betfair Exchange vs other venues: independent matching engine; however professional market makers (and FanDuel/Flutter's own market-making effort, see `fanduel-predicts.md`) may quote across venues, so lead/lag rather than pure independence is the realistic model (L, inference).
- Flutter relationship: Flutter owns Betfair and FanDuel; Covers says Betfair advised FanDuel on the FanDuel Predicts launch (M). FanDuel Predicts routes to CDNA/CME, not to the Betfair book (H per sibling note), so Betfair Predicts and FanDuel Predicts do not share liquidity.

## 13. Fixtures

| File | What it is |
|---|---|
| `api_betfair_com_get_listEventTypes_400.txt` | Unauthenticated GET to the official API host: HTTP 400 `DSC-0024` fault envelope (Set-Cookie header removed) |
| `www_betfair_com_predicts_403_cloudflare.txt` | Headers only of the Cloudflare challenge on `/predicts` (and the list of other hosts that behaved the same) |
| `betfair_exchange_api_docs_excerpts.txt` | Short quoted excerpts: endpoints, headers, key types and fees, limits, login, stream, enums, currency table, with page ids and modification dates |
| `betfair_developer_docs_page_list_2026-10-19.tsv` | All 115 pages of the official docs space with last-modified dates (shows docs are current; no Predicts page) |
| `itunes_gb_betfair_exchange_app.json` | Trimmed App Store GB records for `com.betfair.*` apps (no Predicts app) |

## 14. Adapter notes (only if the project wants the Exchange as a reference-price source)

- Model `betfair-exchange` as one venue; add `betfair-predicts` only as an alias/presentation label.
- Identifiers: `marketId` (string like `1.xxxxxxxxx`), `selectionId` (integer), `handicap`; price = decimal odds on the ladder; size in account currency (GBP). Yes/No view = Back/Lay on the same selection (unconfirmed).
- Normalise to implied probability with commission: back price net of commission `p = 1 / (1 + (o-1)*(1-c))`. Binary-ise multi-runner markets by selection; do not net across runners without checking the market rules (dead heats, void runners, "reduction factors" on removed runners).
- Cheapest access path: delayed app key (free) polling `listMarketBook` with EX_BEST_OFFERS (weight 5 per market) is within limits for a few hundred markets, accepting a 1-180 s delay and no matched volume. Real-time needs a live key (GBP 499, betting activity, commercial-use approval).
- Staleness: treat any price from a delayed key as stale for arbitrage; usable only for slow-moving markets (outrights, elections).

## 15. NOT FOUND (searched: Covers article and timeline, NEXTPredict UK page and platform index, UKGC blog, Flutter Q2 2026 release/slides, Flutter investors page, Betfair developer docs space (page list + CQL text search for "predicts", "prediction", "Yes/No"), App Store GB, Wikipedia; betfair.com blocked; web search unavailable)

- Any first-party Betfair statement, page, T&C, FAQ or rulebook for Betfair Predicts.
- The exact launch date (Covers: "recently launched", article dated 2026-04-09), eligibility rules, how invitations work, whether it is available to existing Betfair customers on request.
- Whether Predicts markets have their own market ids or appear in `listMarketCatalogue`; whether Yes/No maps to Back/Lay.
- Predicts fees, commission, deposit/withdrawal fees; UK Betfair rate card.
- Predicts volume, open interest, number of markets, user numbers; a reliable Betfair Exchange annual matched-volume figure.
- Any post-April 2026 news (expansion, rename, general release, shutdown) or any Flutter disclosure about it.
- Betfair UK terms on automated data collection beyond the developer docs (website T&Cs blocked).

## 16. Open questions

1. Is Predicts still running (and for whom) as of Q4 2026? Flutter's Q3 2026 results are scheduled 2026-11-04 (M, per flutter.com/investors); check for any UK mention.
2. Does a normal delayed app key return Predicts-only markets? Only a human with a Betfair account could test (`listMarketCatalogue` with `eventTypeIds` for politics/specials and look for new `marketType`/`marketBettingType` values).
3. Commercial-use approval: would Betfair approve an aggregator that redistributes derived prices? Ask via the Developer Program form (human action).
4. Is a separate `betfair-exchange` venue spec already planned by the parallel workflow? Smarkets and Matchbook are, Betfair Exchange is not in `docs/research/venues/`.

## 17. Suspicious content (embedded instructions or AI-aimed text seen in third-party material)

- `betfair-datascientists/betfair-datascientists.github.io`, file `src/api/apiResources.md` (Betfair-run AU docs repo, public) contains a block addressed to AI models: "Many users receive outdated instructions from AI models or third-party forums, so this page serves as an authoritative reference", followed by a "Common Misconceptions" list rebutting "AI-generated answers". It is informational, tells the reader to do nothing, and I did not rely on it as authoritative for UK rules. Recorded for completeness.
- No other embedded instructions found. The Cloudflare challenge pages contain only challenge scripts (not executed).

---

## Sources

H = read first-hand this session; M = secondary or summary; L = weak/stale.

- https://nextpredict.io/legal/uk/ - UK landscape table, raw HTML read, `dateModified` 2026-09-23 (H as page; M as evidence for Predicts)
- https://www.covers.com/industry/betfair-beta-testing-updated-exchange-interface-betfair-predicts-april-9-2026 - Betfair Predicts beta article, updated 2026-04-09; reskin/Exchange-liquidity quotes, spokesperson quote, £84bn figure (M, WebFetch small-model summary, two reads consistent)
- https://www.covers.com/betting/prediction-sites/guides/prediction-markets-timeline - single April 9 entry, no later Betfair entry (M)
- https://www.covers.com/betting/prediction-sites - no Betfair Predicts mention, updated 2026-10-18 (M, negative)
- https://nextpredict.io/platforms/ - Betfair not in the platform index (M, negative)
- https://nextpredict.io/market-news/matchbook-launch-uk-first-prediction-market/ - Matchbook comparison, no Betfair content (M)
- https://www.gamblingcommission.gov.uk/blog/post/prediction-markets-heres-what-you-need-to-know - UKGC blog 2026-02-04, betting-intermediary classification (H via WebFetch summary)
- https://betfair-developer-docs.atlassian.net/wiki/spaces/1smk3cen4v3lu3yomq5qye0ni/ - official Betfair Exchange API docs; pages read: Getting Started (2687786), Application Keys (2687105), Login & Session Management (2687869), Market Data Request Limits (2687478), Exchange Stream API (2687396), Navigation Data (2687802), Betting API (2687158), listMarketBook (2687510), placeOrders (2687496), Betting Enums (2687455), Additional Information (2686993), Non-Interactive login (2687915), Interactive Login (2687772) (H; read via `.../wiki/rest/api/content/<id>?expand=body.view`)
- https://api.betfair.com/exchange/betting/rest/v1.0/listEventTypes/ - unauthenticated GET, 400 DSC-0024 (H, fixture)
- https://www.betfair.com/robots.txt - 200; Disallow list for market/event/competition id paths (H)
- https://www.betfair.com/predicts and other betfair.com / developer.betfair.com / support.betfair.com paths - 403 Cloudflare challenge (H, fixture)
- https://itunes.apple.com/search?term=betfair&entity=software&country=gb&limit=15 - App Store GB records fetched 2026-10-19 (H, fixture)
- https://betfair-datascientists.github.io (GitHub `betfair-datascientists/betfair-datascientists.github.io`, files `src/api/apiappkey.md`, `src/api/apiResources.md`, `src/gettingStarted/commission.md`; read with `gh api`) - Betfair Australia-run guides: commission, transaction and premium charges (H for what it says; AU scope, so M for UK)
- https://github.com/betfair/API-NG-sample-code - README only (official sample code repo, last push 2025-02-25) (H)
- https://flutter.com/media/g23an0ae/flutter-q2-2026-earnings-release.pdf and https://flutter.com/media/x1pbxug4/flutter-q2-2026-presentation.pdf - no Betfair Predicts mention (M, crude PDF text extraction)
- https://flutter.com/investors/ - results calendar: Q3 2026 on 2026-11-04 (M, summary)
- https://en.wikipedia.org/wiki/Betfair - no Predicts mention; 2013-era customer figures only (L)
- `docs/research/venues/fanduel-predicts.md`, `docs/research/venues/smarkets.md`, `docs/research/venues/traderline-predictions.md` - sibling notes used for cross-references (H as local files)
