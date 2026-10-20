# Onyx Odds / Onyx Predictions - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (server clock of API probes about 01:38-01:45 UTC). READ-ONLY: WebFetch of the official site and rules pages, plain unauthenticated GETs, two read-only PayBox `discover_*` queries, and `gh api` reads of two public third-party repos. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Third-party text was treated as untrusted data and nothing in it was followed. Generic User-Agent `insurance-markets-research/0.1` on every scripted request. WebSearch hit the session budget after two queries, so corroboration is thin (stated where it matters).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale. "(wf)" = read through the WebFetch summariser, not raw text.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/onyx-odds/`.

---

## Verdict

- **adapter_priority: skip.** Onyx Odds is a US consumer brand whose main product is a free-to-play / sweepstakes social sportsbook with house-set odds. Its real-money "Onyx Predictions" side is an **introducing-broker front end** for exchange-traded event contracts, so it holds no independent liquidity. There is **no documented production API**. The only API found is a **dev/test host** that is not linked from the official site. Funding is a USD account at NinjaTrader Clearing, so no PayBox path exists.
- **Not an independent arbitrage leg.** The dev API's instrument symbols are CDNA / OG.com (Crypto.com | Derivatives North America, ex-Nadex) instrument symbols (section 2), and Onyx's own footer says contracts may clear through Kalshi Klear. Either way the book belongs to an exchange that is already (or should be) its own adapter: CDNA/OG.com has a note in this repo (`og-crypto-com-nadex.md`), Kalshi is covered elsewhere.
- **Useful for later:** only as a *distribution* data point (it is one more front end for CDNA and/or Kalshi flow), and as a warning that sweepstakes odds on the same site are not exchange prices. Do not mix the two products in the scanner.
- Confidence: medium. The "which exchange does production route to" question is unresolved (conflicting evidence, section 2).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://onyxodds.com | HTTP 200 on 2026-10-19, title "Onyx Odds - Odds On Everything", Netlify/Nuxt site; sitemap prerendered 2026-10-15 (`x-sitemap-prerendered`) | H |
| Home page copy | "Predictions", "Social Sweepstakes", "Crypto (Coming Soon)"; parlays, live streaming, share trades; sports, culture, crypto, politics, futures, gaming, markets (wf) | H |
| iOS app "Onyx - Sports Picks" (Onyx Games LLC) | version 4.1.0 dated Sep 17 (2026), 16K ratings, first release 1.0 on 10/27/2025 (https://apps.apple.com/us/app/onyx-sports-picks/id6754047293) (wf) | H |
| SI roundup | Lists Onyx Odds as #12 "sports-first" app; article byline Oct 18, 2026 (https://www.si.com/prediction-markets/usa/apps) (wf) | H (listing), M (their description) |
| Sports-betting-dime legal-states page | "updated September 18, 2026" (wf) | M |
| `app.onyxodds.com` and `api.onyxodds.com` | HTTP 403 to a scripted GET (CloudFront / ALB "Request blocked" / "403 Forbidden"). Not evaded. Could be geo or bot rules | H (the 403), L (cause) |
| `onyxpredictions.com` | HTTP 404 text/plain (not a live site) | H |

**Verdict: still_live = true** as a consumer product (sweepstakes + app). The real-money event-contract side is described by the site as live ("Predictions" in a banner, with a state list), but one third-party post calls it "unfinished" (section 2), and a Casino.org-sourced summary says per-contract fees are unpublished. I could not see the logged-in app. Treat real-money availability as **M**.

---

## 2. What it is (kind and exchange backing)

**Kind: `broker-or-frontend` for the real-money side; separate house-priced sweepstakes sportsbook for the main side.**

Official structure (https://onyxodds.com, /predictions/, /terms-of-use/, /general-sports-rules/, all H via wf):

- **Onyx Games LLC** runs the technology and the apps (App Store developer field, H).
- **Onyx Predictions LLC** (affiliate) "is an introducing broker registered with the CFTC and an NFA member" (NFA ID 0576468 per Terms section 6); it "does not accept or hold customer funds".
- **NinjaTrader Clearing, LLC (NTC)**, a CFTC-registered FCM (NFA ID 0309379), "carries and maintains all customer accounts"; users must open a NinjaTrader account (Terms section 6). Onyx Predictions "relays trading instructions to NinjaTrader on the user's behalf" (Terms section 6).
- Footer boilerplate: NTC "may clear event contracts for customers through Kalshi Klear LLC", which clears contracts traded on KalshiEX LLC; "NinjaTrader is not affiliated with Kalshi". No exchange is named for Onyx's own contracts (SI: "Backing exchange: Not stated", H absence).
- A third-party review states common ownership under Tsos Technologies, Inc. and cites a $20M Series A led by Payward (Kraken's parent) at a $220M valuation (https://www.lilachbullock.com/is-onyx-odds-legit/, wf). Funding claim is **L** (secondary, I could not reach the original).

**Which exchange does production route to? Conflicting, unresolved:**

1. Footer text names Kalshi Klear (H that the text exists; boilerplate on NTC, not proof of routing).
2. A third-party X post (surfaced only as a search-result snippet, the post itself returned HTTP 402 to WebFetch) says Onyx "is now an introducing broker... event listings show Kalshi market codes" and that Onyx Predictions "looks unfinished" (https://x.com/fairplaygov/status/2060071703871418418) (L).
3. **The only API found (a dev host) is built on the CDNA exchange**, not Kalshi: its OpenAPI text says "Per CDNA FIX spec (35=G)", "35=UA ... balance of the logged-on member (ONYXOP house account)", "Get all CDNA subaccounts including parent account", and "Bridge Cdna To Sportsdata ... CDNA events matched ... via EXTERNAL_GAME_ID" (https://predictions.dev-onyxodds.com/openapi.json, H). Its instrument symbols are identical in format to CDNA's: Onyx dev `NX.F.OPT.MLB-00001-260716-M.O.1.1.20261130`, display `Mets vs Phillies ; Mets ; Citizens Bank Park ; 260716`, versus CDNA live `NX.F.OPT.NFL-00012-261018-M.O.1.1.20270301`, display `Cowboys vs Packers ; Cowboys ; Lambeau Field ; 261018` (CDNA fixture `docs/research/fixtures/og-crypto-com-nadex/instruments_nfl_moneyline_pair_2026-10-19.json`, H). The dev host event names also match (`MLB-00001-2026`).

My reading (M): the dev backend is an Onyx member/intermediary connection to CDNA/OG.com (one house account "ONYXOP" with per-user sub-accounts). Production may use CDNA, Kalshi, or both; I could not determine it. Note: `og.com/clearing-members` lists only Foris DAX FCM as clearing member in the sibling note, which does not obviously fit an NTC-cleared flow, so the NTC-to-CDNA link itself is unconfirmed (open question).

**Market model (what the data show):**

- Real-money side (inferred from the dev API): **binary YES/NO event contracts on a central limit order book** (bid/ask/last per instrument, `min_price` 0.01, `max_price` 0.99, orders have `side`, `quantity`, `price`; amend/cancel supported; combo/parlay RFQ endpoints). Tokenisation: not tokenised; positions are exchange-account records (symbol + side + quantity). H for the schema, M for the "real" book behind it.
- Sweepstakes side: house-priced **American odds** (straight, parlay, SGP, teaser, round robin, futures), staked in "Onyx Cash" / Sweeps Cash / Gold Coins (https://onyxodds.com/pick-types-guide/, H via wf). Not a market, not arbitrageable against exchanges in any usable way.
- App Store listing says: "no real-money gaming and no real-money wagering offered in this app" (mobile app is the sweepstakes product; wf, H).

---

## 3. Chains and collateral

- No chain. Collateral is **USD in a NinjaTrader Clearing account** (H, Terms section 6). Sweepstakes-side prize redemption "can take up to 30 days" (Sweepstakes Rules, wf, H); a review says ACH only (L). Crypto funding: home page shows "Crypto (Coming Soon)"; no details (H).

---

## 4. Read API

**`read_api.exists`: `unofficial-only` (a dev/test host, not linked from the official site).** No official public documentation or production API found. Searched: onyxodds.com home, sitemap (10 URLs: home, careers, games, general-sports-rules, pick-types-guide, predictions, privacy-policy, responsible-social-gaming, sweepstakes-rules, terms-of-use), `/api`, `/developers`, `/docs` (all 404), `docs.onyxodds.com`/`developer.onyxodds.com` (do not resolve), `api.onyxodds.com` (403), GitHub repo search.

How I found the dev host: two public third-party take-home repos (`kt474/onyx-take-home`, created 2026-05-16, and `ryanjgani/onyx-paper-trading`, created 2026-07-28, both reading `https://predictions.dev-onyxodds.com`) (H that the repos reference it; M that the host is Onyx-operated, based on the domain, the "Onyx Predictions Market API" title and ONYXOP account string; L on intended public status). It looks like a candidate-assignment sandbox.

**Host:** `https://predictions.dev-onyxodds.com` (nginx, FastAPI/Swagger at `/docs`, OpenAPI at `/openapi.json`, v1.0.0, "REST API for predictions market trading"). Unauthenticated GETs returned 200 with JSON (H, fixtures). **This is a dev/test environment: not production data.**

Key read endpoints (H, spec + live GETs):

| Endpoint | Notes |
|---|---|
| `GET /markets?limit<=1000&offset&status&sport&event_type&contract_type&period_type` | rows `{id,symbol,sport,name,event_name,status,expiry_date,min_price,max_price,yes_price}`; the `sport` filter did not filter (all rows MLB, `sport` = "OTHER") |
| `GET /markets/sports` | `[{"sport":"CBB","count":460},{"sport":"MLB","count":329},{"sport":"NBA","count":264},{"sport":"WNBA","count":39}]` |
| `GET /markets/{symbol}` , `GET /markets/{symbol}/prices` | prices `{symbol,bid_price,ask_price,last_price,volume}` (top of book only, no depth endpoint found; `GET /markets/{market_id}/outcomes` has `price_data`) |
| `GET /events`, `/events/{id}`, `/events/{id}/markets`, `/games/{sport}` | events with `external_game_id` and sportsdata.io-enriched fields (`sd_*`) |
| `GET /settlements?sport&limit` | returned `[]` (no settlements in dev) |
| `GET /combos`, `POST /combos/rfq` | parlay (combo) RFQ via exchange QuoteRequest; CDNA has combos (`EVENT_COMBO` in the sibling note) |
| `GET /orders|/trades|/positions|/balance` | need a `user_id` query param described "temporary, will use JWT"; I did not call them |
| Auth | OpenAPI `securitySchemes`: HTTPBearer (JWT via `/api/auth/login`, `/api/mobile/auth/*`); market-data GETs were unauthenticated |
| Rate limits, WebSocket | NOT FOUND (no limit headers on responses; no WS path in the spec; searched `/openapi.json` and response headers) |

**Dev data is stale and thin** (H): the newest `updated_at` seen is 2026-07-16; game markets for a "260716" Mets-Phillies game are still `open` with a static `yes_price` of 0.55 and `volume: 0`; the 100 rows I fetched were all MLB futures or this one game; `/settlements` empty. It cannot be used for pricing.

**Observation to record (not exercised):** the full OpenAPI spec lists administrative and operations paths (exchange-session control, cache/Redis, container and log management) with no security requirement shown. I did not call any of them. If the host is ever treated as a real integration target, the operator should be told; it is also a reason to treat this host as unreliable and not something to build on.

Not found: official production base URL, official API docs, any production market-data licence/redistribution terms (Terms prohibit "scrape, build databases or otherwise create permanent copies of any content derived from the Service", section 2, H wf).

---

## 5. Trade path

- **Programmatic: none sanctioned.** Real-money orders are placed by a logged-in user in the Onyx web app; Onyx relays instructions to NinjaTrader (H). The dev API has `POST /orders` (`{symbol, side, quantity (int), price}`), `PUT/DELETE /orders/{id}` and a FIX bridge, but it is a sandbox (order body only; I did not call it).
- No documented signing scheme. Any real order is an account-session action under NinjaTrader KYC.
- Automation clause: Terms bar "bots" only "in the Games"; algorithmic trading of event contracts is "not addressed" in the Terms (wf). The Sweepstakes Rules ban "any automated or other system(s)" and "equal and opposite selections" (wf). General Sports Rules allow Onyx to void picks for "coordinated or arbitrage play, multi-account activity, correlated selections, excess exposure" and say "Onyx's decision is final" (wf; applies to the sweepstakes product, and the page says the rules "may not apply to Onyx Predictions' platform").

---

## 6. PayBox reachability

**paybox_reachable: no.** A PayBox EVM/Solana wallet cannot trade here: collateral is USD at NinjaTrader Clearing (KYC'd FCM account), not an on-chain asset; no contract, no typed-data order format, nothing to put in a transaction proposal or signature (H, sections 3 and 5). `discover_plugins` and `discover_services` for "Onyx Odds prediction market" returned no Onyx entry; the service hits were unrelated Polymarket/Kalshi data resellers (H, 2026-10-19).

---

## 7. Fees

- **Onyx fee schedule: NOT FOUND.** The home page, /predictions/, Terms, pick-types guide and rules pages state no trading fee (H absence, all read). A Casino.org-sourced search summary says Onyx "hasn't published a fee schedule for sports-event contract trading yet" (L, not re-read; the casino.org page returned 403).
- Terms say users "may lose the full cost to enter a trade, including fees" (wf) and charge a $250 arbitration filing fee; chargebacks become a debt (wf).
- If production flows to CDNA/OG.com, the exchange-side fee in the sibling note applies (taker `0.07 x P x (1 - P)` per contract per OG US help centre, dated 2026-09-15) plus any broker/NTC commissions Onyx adds (unknown). If it flows to Kalshi, Kalshi's fee schedule applies (covered by the Kalshi note). Scanner should treat Onyx fees as unknown.
- Sweepstakes side: house margin inside the American odds (no explicit fee), plus Onyx's right to limit or void.

---

## 8. Resolution mechanism and dispute risk

- **Real-money contracts:** settle under the underlying exchange's rulebook (CDNA / OG.com or KalshiEX; see those notes). Onyx is not the resolver (M; the site says nothing explicit about settlement of Onyx Predictions contracts, H absence).
- **Sweepstakes picks:** Onyx grades from "each league's governing body or its official data suppliers"; stat corrections honoured within 24 hours; soccer = 90 minutes plus stoppage; postponements usually "no action" with refund (48 h windows, 72 h for F1/NASCAR); Onyx may "void or adjust picks for pricing or technical errors" and "in settlement disputes, Onyx's decision is final" (https://onyxodds.com/general-sports-rules/, wf, H).
- **Dispute risk for an arbitrageur: high on the sweepstakes side** (discretionary voiding, arbitrage and syndicate play expressly policed, one-account rule, JAMS arbitration in New York with $250 fee and class waiver, Delaware law, one-year limitation; Terms sections 14-20, wf, H). Moderate on the exchange side (inherits exchange rules; CDNA's differ from Kalshi/Polymarket per the sibling note).

---

## 9. Geo / ToS / automation

- US only. Terms "Restricted Territories": Washington, Idaho, Michigan, Montana, Alabama, Colorado, Connecticut, Illinois, Louisiana, Maryland, New Jersey, New York, Tennessee, West Virginia, Nevada, plus any non-US jurisdiction (Terms section 3, wf, H). Sweepstakes Rules list a different set (adds CA, IN, ME; omits IL, MD; wf, H).
- **The site contradicts itself:** the predictions banner says "CA, NJ, CO, LA, IN, WV, ID, ME, AL", most of which are in the Terms' restricted list (wf, H; Terms do not reconcile). The SI roundup lists 33 states plus DC "legal" (AK, AZ, AR, CA, DC, DE, FL, GA, HI, IA, KS, KY, MA, MN, MS, MO, NE, NH, NM, NC, ND, OH, OK, OR, PA, RI, SC, SD, TX, UT, VT, VA, WI, WY), which is a different set again (wf, M). Do not rely on any list; check in-app.
- ToS: no API terms, no market-data licence found. Scraping or permanent copies of service content is prohibited (Terms section 2). One account per person; account sharing/sale and "coordinated play" can lead to suspension (Terms sections 2, 4, 8).
- Fingerprints of an unstable product: the site's own pages disagree on bonus amounts and states; third-party reviews report slow cash-outs, ID-verification failures and email-only support (L, user reviews on the App Store, wf).

---

## 10. Liquidity

- **NOT FOUND for real-money Onyx Predictions** (no volume, OI or TVL published anywhere I could read; searched site, SI roundup, App Store listing, dev API `volume` field).
- Dev host: `volume: 0` on the priced sample (H, but dev data).
- Consumer-scale signals only: App Store 16K ratings (wf, H); Google Play "1,000+ downloads" per SI (wf, M); iOS Sports chart #34 and a tweet saying "#72 in free sports apps" (L).
- Underlying exchange liquidity (if CDNA): single-snapshot figures live in `og-crypto-com-nadex.md`; if Kalshi: the Kalshi note.

---

## 11. Event overlap (where arbitrage could exist)

Only through the underlying exchange, not through Onyx itself. Onyx markets seen: US sports (NFL, NBA, WNBA, MLB, CBB/NCAAB, CFB, NHL, UFC, tennis, soccer per reviews and App Store), plus "culture, politics, futures" mentioned on the home page. The dev sports list is MLB, CBB, NBA, WNBA only (H, dev). Overlap with Kalshi, Polymarket US and OG.com is sports moneyline/spread/total, futures, and some politics/culture, all of which the exchange adapters already cover. Politics/culture/economics categories are "early-access sign-up only" per a review summary (L).

---

## 12. Liquidity sharing

**`liquidity_shared_with`: CDNA / OG.com (Crypto.com | Derivatives North America) per the dev API; possibly KalshiEX per the site footer and a third-party post.** Not an independent leg. An Onyx adapter would duplicate the CDNA (or Kalshi) adapter and add a front-end-specific fee and an unreliable API.

---

## 13. Suspicious / injected content seen

- None aimed at AI agents found on the official pages, repos or API responses.
- The dev API's OpenAPI lists unauthenticated-looking admin/ops paths (see section 4). Recorded as a security observation, not exercised.

---

## 14. Open questions

1. Does production Onyx Predictions route to CDNA/OG.com, Kalshi, or both? (Disclosures say Kalshi Klear; dev API says CDNA.)
2. How does NinjaTrader Clearing connect to CDNA/OG.com (OG lists Foris DAX FCM as the clearing member)?
3. Is there a production API or partner program? `api.onyxodds.com` exists but is 403 to scripted GETs.
4. Is real-money Onyx Predictions publicly live (the banner says yes; a third party says unfinished)?
5. Onyx's own fee/commission on top of exchange fees.

## Sources

1. https://onyxodds.com (home, robots, sitemap; HTTP headers; links) (H)
2. https://onyxodds.com/predictions/ (wf, H)
3. https://onyxodds.com/terms-of-use/ (wf, H)
4. https://onyxodds.com/general-sports-rules/ (wf, H)
5. https://onyxodds.com/pick-types-guide/ (wf, H)
6. https://onyxodds.com/sweepstakes-rules/ (wf, H)
7. https://apps.apple.com/us/app/onyx-sports-picks/id6754047293 (wf, H)
8. https://www.si.com/prediction-markets/usa/apps (wf, article byline Oct 18, 2026; M for their description)
9. https://www.sportsbettingdime.com/prediction-markets/onyx-odds/legal-states/ (wf, updated 2026-09-18; M)
10. https://www.lilachbullock.com/is-onyx-odds-legit/ (wf; L-M, ownership/funding claims secondary)
11. https://x.com/fairplaygov/status/2060071703871418418 (search-result snippet only; page returned 402; L)
12. https://predictions.dev-onyxodds.com/openapi.json, /docs, /markets, /markets/sports, /markets/{symbol}[/prices], /events, /settlements, /health (H for responses; host provenance M)
13. https://github.com/kt474/onyx-take-home and https://github.com/ryanjgani/onyx-paper-trading (README and `src/lib/onyx.ts` read via `gh api`; untrusted third-party code, not executed; M)
14. `docs/research/venues/og-crypto-com-nadex.md` and `docs/research/fixtures/og-crypto-com-nadex/instruments_nfl_moneyline_pair_2026-10-19.json` (sibling research, for the CDNA symbol comparison; H within that note)
15. PayBox `discover_plugins` / `discover_services`, query "Onyx Odds prediction market" (no Onyx entry)
16. https://www.casino.org/us/predictions/onyx-odds/ (HTTP 403 to WebFetch; only a search-result summary seen; L)
