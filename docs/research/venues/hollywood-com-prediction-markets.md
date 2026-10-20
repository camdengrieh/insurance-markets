# Hollywood.com Prediction Trading (powered by Crypto.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (API probes about 02:10-02:20 UTC). READ-ONLY: WebFetch/WebSearch of public pages, public unauthenticated GETs to hollywood.com and to the documented CDNA market-data host `api.crypto.com` and Polymarket Gamma (cross-check only), one download of the CDNA rulebook PDF to the scratchpad and text extraction with a local pure-Python script (nothing in it was executed), two read-only PayBox `discover_*` queries. No account, invitation request, wallet, key, signature, POST/PUT/DELETE or payment. Third-party text was treated as untrusted data. Generic User-Agent `insurance-markets-research/0.1` on every scripted request. The WebSearch budget of the session ran out after five searches, so the last two planned searches (entertainment settlement rules, IB fees) were not run.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale. "(wf)" = read through the WebFetch summariser, not raw text.

Fixtures (each <= 50 KB): `docs/research/fixtures/hollywood-com-prediction-markets/` (section 12).

**This venue is not a separate exchange.** It is a CFTC-registered introducing broker front end onto the CDNA order book already specified in `docs/research/venues/crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md` (aliases there: CDNA, OG.com Markets, Nadex). Read that note for the full API, fee and rulebook detail; this note only adds what is specific to Hollywood.com.

---

## 0. Bottom line

1. **Live as a waitlist / private beta, yes (H); open to the public, no.** `https://www.hollywood.com/` returns 200 with title "Hollywood.com Prediction Trading, powered by Crypto.com | Private Beta"; Yoast metadata `article:modified_time` 2026-08-13; footer "(c) 2026 Hollywood.com, LLC". The "Beta log in" link is hidden in the HTML and its URL is empty (H, script config `login: { url:"" ... }` and the comment "hidden for now"). Whether any traders are actually trading is NOT FOUND (the page only says "We're adding traders every week", a self-claim).
2. **Kind: guaranteed introducing broker front end, not an exchange (H).** Page: "Contracts trade and clear on Crypto.com | Derivatives North America, a CFTC-registered exchange and clearinghouse. Your account is carried by Foris DAX FCM LLC ... Hollywood.com is registered with the CFTC as a guaranteed introducing broker and is a member of the National Futures Association." NFA ID quoted on the page: 0578002 (not checked against NFA BASIC, which is a JS app).
3. **Liquidity is 100% shared with CDNA (H for the structure, H for the market overlap).** The page's own sample markets (Oscars 2027 Best Actor, Next James Bond actor, DWTS S35 winner/top 3, TIME Person of the Year, Spotify top artist, Wildwood Rotten Tomatoes score) all exist today as live binary contracts in the keyless CDNA feed under `PREDICT_CATEGORY=Culture` (section 4). The page says "Traders trade with each other. Hollywood.com never holds a position in any market." (I matched titles, not order flow, so "same book" is an inference from the structure statements plus the title match, M.) The Nov 2025 announcement says the contracts "will be offered exclusively by CDNA". **It is not an independent arbitrage leg. Count the book once, under the CDNA adapter.**
4. **No Hollywood.com API, no data feed, no developer docs (H).** `/api`, `/developers`, `/predictions`, `/markets`, `/beta` all 404; the landing page has no market data (the market cards are hard-coded samples labelled "illustrative samples ... not live quotes").
5. **Not tradable from a PayBox wallet (H).** USD account at a US FCM after KYC and suitability questions; crypto is accepted only as a deposit route.
6. **adapter_priority = skip** as its own adapter. Register it as a front-end alias of the CDNA adapter (`front_end: "hollywood.com"`, `status: private_beta`). The *event category* is worth having, but it is reached through CDNA (section 11).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.hollywood.com/` (2026-10-19) | 200, 252 KB WordPress page; `<title>` "Hollywood.com Prediction Trading, powered by Crypto.com \| Private Beta"; canonical/og title "Landing Page / Waitlist"; modified 2026-08-13T20:35Z | H |
| Page copy | "Real money. Real markets. Trading on a CFTC-regulated exchange, powered by Crypto.com. Reality TV, awards, music, video games, Broadway and pop culture. All entertainment. No war. No politics." "Invitation only. Invitations go out in waves ... 18+. Not available in all states." | H |
| Sign-up | Form takes name, email, state; referral "+50 spots per friend"; "Requesting an invitation does not open an account." (I did not submit it.) | H |
| Login | `data-link="login"` is `hidden`; config comment "DEV: hidden for now (SETTINGS.showBetaLogin). When login is ready, turn it on and set LINKS.login." and `login: { url:"" }` | H |
| Launch announcement | Crypto.com press release dated 2025-11-03 (page dated 2025-11-04): "exclusive partnership"; CDNA will offer the contracts; no launch date (https://crypto.com/us/company-news/cryptocom-to-power-new-entertainment-prediction-market-offering-from-hollywoodcom, wf). Trade-press echoes: Gaming Intelligence 2025-11-05 (wf), Yahoo Finance, NEXT.io, Daily Hodl (search hits, not opened). **These are 11+ months old: stale for status, fine for structure.** | H (wf) |
| Third-party index | mickbransfield.com/cftc-regulated-pms/ lists "Hollywood.com (private beta)" under "Front-ends routing through CDNA" and "Hollywood.com Live - invitation-only private beta - announced Nov 3, 2025 ... entertainment-only markets (film, TV, music, awards, Broadway) ... contracts listed and cleared by CDNA ... eligible states only" (wf). The page's own date line ("Current as of May 2026") conflicts with entries dated Oct 2026, so it is a lead index only. | M |
| CDNA's own regulatory page | https://og.com/regulatory names six intermediaries (DraftKings Predictions, Fanatics Markets, FanDuel Predicts, OG.com Broker, Robinhood Derivatives, Wedbush Futures); **Hollywood.com is not on it** (wf, page truncated) | M |
| The underlying markets | Live: CDNA Culture contracts trade today (section 10) | H |

Verdict: **still_live = true** (as a private-beta front end), confidence medium: the product page is current (2026), the underlying contracts are live, but public trading and any user count are unconfirmed.

---

## 2. Kind and market model

- **Kind (H):** guaranteed introducing broker / marketing front end (Hollywood.com, LLC, Boca Raton, FL, per the DMCA agent address on the page) for event contracts listed on CDNA. Account carrier and custodian of funds: Foris DAX FCM LLC ("Hollywood.com does not hold your money").
- **Market model (H, from CDNA data):** binary event contracts, $1 payout, price tick $0.01, central limit order book on CDNA; multi-outcome questions are one binary instrument per outcome (e.g. Oscars Best Actor = 4 instruments, Next James Bond actor = 26+). Instrument symbol pattern `NX.F.OPT.CUL-00045-2026.O.1.4.20270430`; `inst_type` `BINARY_OPTION`. No scalar, no AMM, no parimutuel, no on-chain token. Details and the complement-pricing caveat (sibling books are not linked) are in the CDNA note.
- **Contract copy on the page (H):** "A contract pays $1 if you're right and $0 if you're not, so a price of 35 cents means the market puts the chance near 35%."
- **Combo Trades (H, page):** "Two or more markets combined into one trade ... pays only if every leg is right ... the multiplier shows what your trade size pays". CDNA exposes `inst_type` `EVENT_COMBO` instruments (`NX.F.OPT.COMBOS-<date>.O.1.<n>`, tick 0.001, `COMBO_LIST` metadata with BUY legs), seen live in the feed (H, fixture `cdna_event_combo_instrument_sample.json`; the sample is an NFL combo, not an entertainment one). That Hollywood.com's combos are those instruments is M. For a scanner: **skip combos** (legs are correlated, no clean cross-venue equivalent).
- **Category scope (H):** entertainment only. FAQ: "What can't I trade on? War and politics. We do not intend to offer sports markets at this time."

---

## 3. Chains and collateral

- **Chain: none (H).** USD collateral at the FCM. FAQ: "Do I need crypto to trade? No. You trade in U.S. dollars. We accept both U.S. dollar and cryptocurrency deposits, and there are multiple ways to fund your account, all shown during onboarding."
- Which tokens/chains the crypto deposit route uses: NOT FOUND (searched: landing page, FAQ; shown only inside onboarding). The CDNA note records a Mesh-based crypto-to-cash route for OG.com customers (M for Hollywood.com customers, unverified whether the same route applies).
- Funds sit at Foris DAX FCM under CFTC customer-funds rules (H, FAQ).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Hollywood.com own API | **None.** No docs link, `/api` and `/developers` 404, `robots.txt` is a blanket "Disallow:" (allow-all) from Yoast, sitemap index lists WordPress post sitemaps only (newest `lastmod` 2026-10-09). No market data in the HTML. | H |
| Data you can use | The CDNA public market-data API, which is the same book. Docs: https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction (per the CDNA note). | H (live responses below) |
| Base URL (used this session) | `https://api.crypto.com/dcm/v1/public/` (also `/fcm/v1/public/`); keyless GET | H |
| Key endpoints | `get-events?PREDICT_CATEGORY=Culture&limit=100`, `get-instruments?event_symbols=...&limit=...` (<=10 event symbols), `get-tickers?instrument_name=a,b,...` (<=50 per call used), `get-book?instrument_name=...&depth=10`, `get-instrument-lifecycle-states?event_symbol=...`, `get-trades` | H |
| Auth / limits | None for public; CDNA note records 100 requests per second per method per IP. My roughly 60 GETs at about 3 req/s or less saw no 429. | H |
| WebSocket | Documented but rejected every channel name in the CDNA note's test; I did not retest. Use REST polling. | M (carried) |
| Licence caveat | No data-licence text was found for these `api.crypto.com/.../public/*` endpoints; the sibling `data-api.crypto.com` feed is "personal, non-commercial" without an MDLA (see CDNA note section 4c). Unresolved. | M (carried) |

**Response shapes confirmed this session** (fixtures):
- `get-events` item: `{symbol:"CUL-00047-2026", series_symbols:["CUL2026"], name, description, event_date(ns), event_end_date, last_updated_time(ns), event_details:{metaData:{NAME, VERSION, ...}, eventName}}`; 32 events returned for `PREDICT_CATEGORY=Culture`, `next_cursor` null.
- `get-instruments` item for Oscars Best Actor: `symbol`, `inst_type:"BINARY_OPTION"`, `price_tick_size:"0.01"`, `quantity_decimals:0`, `tradable:true`, `underlying_symbol:"CUL-00045-2026"`, `event_details.metaData{EVENT_DATE:"2027-04-30T22:00:00+00:00", EVENT_END_DATE, PARTICIPANT:"Andrew Scott (Pressure)", PREDICT_CATEGORY:"Culture", PREDICT_MARKET_ID, PREDICT_OUTCOME_ID, PREDICT_CONTRACT_TYPE:"Oscars: Best Actor Winner"}`. Matching key for cross-venue linking: `PREDICT_CONTRACT_TYPE` + `PARTICIPANT` + `EVENT_DATE`.
- `get-tickers` item: `{i,h,l,a,c,b,k,v,vv,oi,t}` (best bid `b`, best ask `k`, 24h contracts `v`, 24h value `vv`); `oi` absent or empty for binaries, so there is no open-interest feed.
- `get-book` result: `{depth, data:[{bids:[["0.09","1931"],["0.08","1833"]], asks:[["0.16","1480"]], t}], instrument_name}`; two elements per level.
- `get-instrument-lifecycle-states`: DWTS S35 winner contracts for eliminated contestants show `state:"Deleted"`, `previous_state:"Closed"`, `lifecycle_change_reason:"SCHEDULED_DELETE"`, `security_trading_status:"SETTLED"` (i.e. losing outcomes settle and vanish before the final event; treat a missing instrument as settled-not-open).

---

## 5. Trade path

- **None for third parties (H for the user flow, M for the API).** Hollywood.com customers trade through a Hollywood.com web onboarding (invitation, identity verification, suitability questions, funding), with orders carried by Foris DAX FCM into CDNA. No Hollywood.com order API is documented (NOT FOUND, searched: site, sitemap, common paths).
- CDNA's own order API (HMAC-SHA256 signed REST/FIX) needs FCM onboarding via Crypto.com Exchange, written conformance sign-off, and is "private beta" (CDNA note section 5, H there). The rulebook says "A Customers of Intermediating Members may not submit orders directly to the Exchange and all such orders must be submitted by that Customer's Intermediating Member" (rulebook of 2026-10-13, H, extracted text). A customer who onboards through Hollywood.com would therefore be an intermediated customer, not a direct API user.
- The "Beta log in" is not wired (empty URL), so there is no session/cookie flow to speak of either.

---

## 6. PayBox reachability: **no**

- No chain, no contract, no typed-data order, nothing to put in a transaction proposal (H, sections 3 and 5). A PayBox EVM or Solana wallet could at best fund a US account through an on-ramp that is only visible inside onboarding; that is funding, not trading.
- PayBox catalog (read-only `discover_*`, 2026-10-19): `discover_plugins` query "Hollywood.com prediction markets Crypto.com CDNA" returned `{"plugins":[],"has_more":false}`; `discover_services` query "Hollywood.com entertainment prediction market" returned only generic third-party x402 entertainment-probability data services (one-call "entertainment board", "movers", single-market detail; sub-dollar prices). None is Hollywood.com or CDNA. I did not call any of them (H).

---

## 7. Fees

- **Hollywood.com's own fees or commissions: NOT FOUND** (searched: landing page, FAQ, risk text; the only statement is "You can lose the entire amount you put into any trade, including fees"). Whether the introducing broker adds a markup on top of the exchange fee is unknown.
- Exchange fee schedule that applies to the CDNA book (from the CDNA note, H there via https://help.og.com/en/articles/12958828-fees-limits; M here as applied to Hollywood.com accounts): US customers, most markets, taker `0.07 x C x P x (1 - P)`, maker `0.0175 x C x P x (1 - P)` (C contracts, P price in dollars), waived on in-the-money settlement. At P = 0.50 the taker fee is about $0.0175 per contract. Trader pays.
- Entertainment rulebook classes carry a minimum tick of $0.001 and per-class position limits (e.g. 2,500 contracts for Oscar/Grammy/Billboard/TIME classes, rulebook 2026-10-13), but the live Oscars instrument shows `price_tick_size` 0.01, so the live listing parameters, not the rulebook template, are what a scanner should read (H for both observations; the reason for the difference is unresolved).

---

## 8. Resolution mechanism and dispute risk

Same as CDNA: exchange-determined from a named Source Agency per contract class (H, rulebook dated 2026-10-13, extracted text). Entertainment-relevant classes found in the rulebook:

| Contract class | Source Agency (rulebook) | Tag |
|---|---|---|
| Oscar Winners Event Contract | Academy of Motion Picture Arts and Sciences; expiry the earlier of winners posted on the Academy site or the last day of the ceremony year; 10:00 AM ET | H |
| Grammy Winners Event Contract | Recording Academy | H |
| TIME Person of the Year | Time; variations ("Entertainer of the Year") not covered; multiple winners all pay | H |
| Top Album Billboard 200 | Billboard | H |
| Industry Event / "Live Presentations - NAICS 711" | "the final result of the Industry Event reported by AP News or as a back-up Source Agency, any U.S. national news provider as published on the Trading System" | H |

- **No rulebook class found for** Rotten Tomatoes score, Metacritic score, Dancing With the Stars, Emmy winners, Spotify top artist/song, "Next James Bond actor" or Video Game of the Year (keyword searches of the extracted text for "Rotten", "Metacritic", "Emmy", "Spotify", "Dancing", "Bond" returned 0 hits; the extractor is naive, so M). Those contracts are probably listed under the generic Industry Event classes with the Source Agency "identified by the Exchange on the Exchange website or on the Trading System at Issuance" (M). Per-contract rule text is therefore not in the API (no rules endpoint) and must be read on the Trading System.
- General settlement terms (Canceled Event after 48 hours with one-week VWAP payout, discretionary adjustment "if it was made in error due to human or technical issues", ties at $0.50 where no tie outcome is listed) are in the CDNA note (H there). I re-read https://help.og.com/en/articles/13051724-general-settlement (wf) and it contains no culture-specific text.
- Dispute/appeal path for traders: NOT FOUND. Hollywood.com Terms of Use: individual JAMS arbitration, seat Palm Beach County FL (or remote), Florida law, 30-day opt-out (H, site modal "Last Updated: July 7, 2026"). That ToU covers the website; the trading account will have separate FCM/CDNA terms (not seen).
- **Arbitrage consequence (M):** centralised, discretionary, single source agency. Each cross-venue pair needs rule matching (e.g. Polymarket's Oscars/Bond rules vs the Academy/Trading-System text) and a settlement-basis haircut.

---

## 9. Geo, ToS and automation

- **US only, "eligible states" only (H):** "Adults 18 and over who live in the United States in an eligible state, who pass identity verification and who complete account onboarding, which also asks about your occupation, annual income, net worth and prior investment experience." State list shown only during onboarding: NOT FOUND. Invitation-only, in waves.
- **Automation:** the Hollywood.com ToU prohibits "any automated data collection, including but not limited to web scraping, artificial intelligence (AI) model training ingestion, data mining, harvesting, or structural data extraction without our express prior written consent" (H, ToU section 5, about the website). There is nothing to scrape there anyway; the data route is the CDNA public API under CDNA's terms (licence text unresolved, see CDNA note). I did not read the FCM account agreement (behind onboarding): NOT FOUND whether bot trading is allowed for intermediated customers.
- The page asks the visitor to accept nothing for read access; `robots.txt` allows all.

---

## 10. Liquidity (CDNA Culture category, 2026-10-19 about 02:15 UTC, single snapshot)

Source: `GET https://api.crypto.com/dcm/v1/public/get-events|get-instruments|get-tickers` (keyless), H, fixtures. Hollywood.com-specific volume: **NOT FOUND**; it cannot be separated from the shared book.

- 32 Culture events listed by `get-events`, but only 14 still have instruments (159 binary contracts); the other 18 (all the Emmy winner events) return no instruments and are presumably settled (M).
- **24h volume summed over all 159 contracts: 7,221 contracts (about $7.2K face value; `v` = `vv` = 7221).** Open interest not published.
- Biggest 24h by event: DWTS S35 Winner 2,817 contracts, Spotify Top Artist 2026 1,068, DWTS S35 Top 3 670, Next James Bond actor 525, Oscars Best Picture 2027 513, DWTS 2nd place 398, Video Game of the Year 2026 384, TIME Person of the Year 2026 272. Oscars Best Actor 2027 and the Wildwood Rotten Tomatoes market: 0 contracts in 24h.
- Depth example (DWTS S35 winner, one contestant): bids 0.09 x 1,931 and 0.08 x 1,833, ask 0.16 x 1,480 (7-cent spread). Other quoted pairs seen: bid 0.01 / ask 0.12; bid 0.10 / ask 0.99.
- **Thin.** Compare, for the same questions on Polymarket global (Gamma `public-search`, 2026-10-19, H, cumulative volume and liquidity, not 24h): "Next James Bond actor?" volume $1.47M, liquidity $201K; "Oscars 2027: Best Actor Winner" $223K / $236K; "TIME Person of the Year 2026" $137K / $594K; "Dancing with the Stars S35: Winner?" $79K / $41K.

---

## 11. Event overlap and shared liquidity

**Shared with CDNA (so also with every other CDNA front end: OG.com, Crypto.com App, Fanatics Markets, DraftKings Predictions, Robinhood, FanDuel's CDNA share and others listed in the CDNA note).** Hollywood.com adds access and marketing, not a book.

Overlap with independent venues (where arbitrage could exist, reached via CDNA):

| Culture question | On CDNA now (H) | Counterpart seen (H, Polymarket Gamma search) | Likely also on Kalshi |
|---|---|---|---|
| Next James Bond actor | `CUL-00044-2026`, 26+ contracts | "Next James Bond actor?" | not checked here |
| Oscars 2027 Best Actor / Best Picture winner | `CUL-00045-2026`, `CUL-00020-26` | "Oscars 2027: Best Actor Winner" | not checked here |
| TIME Person of the Year 2026 | `CUL-00016-26` | "TIME Person of the Year 2026" | not checked here |
| DWTS S35 winner / eliminations | `CUL-00039-2026`, `CUL-00046-2026` | "Dancing with the Stars S35: Winner?", weekly eliminations | not checked here |
| Spotify top artist/song, Game of the Year, Rotten Tomatoes scores | `CUL-00013-26`, `CUL-00012-26`, `CUL-00014-26`, `CUL-00047-2026` | not checked here | not checked here |

Sample-title match check (fixture `hollywood_com_landing_sample_market_titles.txt`, 32 titles, of which 5 are combos): roughly 13 of the 27 single-market titles map to a live CDNA Culture event (DWTS winner/top 3/3rd place/finalists/elimination, Oscars Best Picture and Best Actor, TIME Person of the Year, Spotify top artist and top song, Next James Bond actor, Wildwood RT score, Game of the Year; the elimination and Game of the Year matches are by title similarity only, M). Roughly 14 had no match in the Culture feed or in the first 15,000 events of the full feed (the full feed is larger than I paged): Billboard Hot 100 and Billboard 200 #1 2026, Metacritic scores (Tomb Raider, Fable), Rotten Tomatoes scores for Dune, Clayface, Digger, Sense and Sensibility and You Can See Everything, Grammys Best Country Album, DWTS Perfect Score, Google most-searched people, New Album Release 2026, Broadway "MJ" gross. They may be pre-listing samples, delisted, or not yet crawled; treat the sample list as illustrative.

Categories relevant to a cross-venue scanner: entertainment/awards (overlaps Polymarket and likely Kalshi), music charts, TV competition results. No sports, politics, crypto or macro on this front end by design; for those use the CDNA adapter directly.

---

## 12. Adapter recommendation

- **No adapter for "Hollywood.com" as a venue.** In the registry add `{ venue: "cdna", front_ends: [..., { name: "hollywood.com", status: "private_beta", scope: "entertainment-only", independent_liquidity: false }] }` and tag any CDNA event with `PREDICT_CATEGORY=Culture` as `reachable_via_hollywood_com: maybe`.
- The Culture slice is a cheap add-on to the CDNA read adapter: poll `get-events?PREDICT_CATEGORY=Culture`, then `get-instruments` and `get-tickers` in batches; match to Polymarket/Kalshi on `PREDICT_CONTRACT_TYPE` + `PARTICIPANT` + `EVENT_DATE`. Expect wide spreads and thin size; use top-of-book and depth before flagging edge.
- Revisit only if Hollywood.com publishes an order or data API, drops the invitation gate, or if a Hollywood.com-only market (not in the CDNA public feed) shows up.

---

## 13. NOT FOUND / open questions

- Hollywood.com account agreement, fee/commission schedule, eligible-state list, whether bots or API access are allowed for intermediated customers (all behind onboarding): NOT FOUND (searched: landing page, FAQ, ToU, DMCA, risk modals, og.com/regulatory).
- Number of active beta traders, any Hollywood.com volume, any public go-live announcement after Nov 2025: NOT FOUND (searched: five web searches, landing page, sitemap).
- Culture-specific settlement text for Rotten Tomatoes, Metacritic, DWTS, Emmy, Spotify, Bond, Game of the Year: NOT FOUND in the rulebook text (M, naive PDF extraction); per-contract rules live on the Trading System.
- Whether Hollywood.com shows prices from the same CDNA book in real time or applies its own display layer: NOT FOUND (page says "Prices are set by the market, not by us").
- Kalshi counterparts for the overlapping entertainment events were not checked (Kalshi is covered by another workflow).
- The Hollywood.com crypto deposit route (tokens, chains): NOT FOUND.

---

## Sources

Primary (read this session):
- https://www.hollywood.com/ (landing page HTML, 2026-10-19; text, FAQ, disclosures, embedded ToU/Privacy/DMCA modals, script config) - H
- https://www.hollywood.com/robots.txt and https://www.hollywood.com/sitemap_index.xml - H
- https://api.crypto.com/dcm/v1/public/get-events, get-instruments, get-tickers, get-book, get-instrument-lifecycle-states (keyless GETs, 2026-10-19) - H
- https://gamma-api.polymarket.com/public-search (keyless GETs, cross-check only, 2026-10-19) - H
- https://assets.ctfassets.net/8c2uto3zas3h/2DazhxBSVpSPSIbZD9rnkS/d131ef498803abc54bd8e40a279f81db/20261013_OG.com_Markets_Rulebook.pdf (downloaded to scratchpad, text extracted; entertainment contract classes and intermediary rule) - H for quoted text, M for absence claims
- https://crypto.com/us/company-news/cryptocom-to-power-new-entertainment-prediction-market-offering-from-hollywoodcom (wf) - H
- https://og.com/regulatory (wf, truncated) and https://help.og.com/en/articles/13051724-general-settlement (wf) - H/M
- In-repo: `docs/research/venues/crypto-com-derivatives-north-america-cdna-north-american-derivatives-exchange-inc-ex-nadex-hedgestreet.md` (API, fees, resolution, PayBox findings carried over) - H there, M here

Secondary:
- https://mickbransfield.com/cftc-regulated-pms/ (wf; discovery lead; internal date inconsistency) - M/L
- https://www.gamingintelligence.com/sectors/betting/222200-crypto-com-partners-hollywood-com-to-bring-entertainment-trading-to-market/ (wf, 2025-11-05, stale for status) - M
- WebSearch hits (not opened): Yahoo Finance, NEXT.io, Daily Hodl, DailyCoin, Cryptorank, iGamingToday coverage of the 2025-11-03 announcement - L

Privacy: no personal identifier was sent to any service; scripts were grepped for "@" before running and only the generic User-Agent was used. The only "@" strings in the fixtures are Hollywood.com's own public handle and support address in a quoted page excerpt.
