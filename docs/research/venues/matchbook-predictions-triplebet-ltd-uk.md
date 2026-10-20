# Matchbook Predictions (Triplebet Ltd, UK) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web pages, the official developer docs (`developers.matchbook.com`, including its `.md` exports and OpenAPI blocks), three unauthenticated GETs to the documented API host, one GET to the ADI Predictstreet public docs/geo endpoint, GitHub repo search metadata. No account, no login, no wallet, no key, no signature, no POST/PUT/DELETE, no payment, no browser automation. Generic User-Agent `insurance-markets-research/0.1` on every scripted request. Third-party text was treated as untrusted data; no embedded instructions to AI agents were seen.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak, affiliate or stale.

Limits (read these first):
- Every page on `www.matchbook.com`, `support.matchbook.com` and the API host `api.matchbook.com` returned HTTP 403 (Cloudflare managed challenge, `cf-mitigated: challenge`) from the research egress (Thailand). I did not try to bypass it. So I could not read the official Predictions product pages, Terms, commission schedule or live market list, and I have **no live API response**. The fixtures are docs examples plus the 403 evidence.
- The WebSearch budget was exhausted after the first search. Press context comes from direct page fetches only. One attempt to fetch a Google results URL via WebFetch returned only a consent/notice page; nothing from it is used.
- The official API docs never mention "prediction"; their examples and changelog are from 2016-2019 (undated entries). Whether the Predictions product is exposed through the documented API is **unconfirmed**.
- Name collision: GitHub's `joaquinbejar/matchbook` and `matchbook.finance`-style projects are a Solana order-book DEX unrelated to this venue (Matchbook Exchange / Triplebet Ltd). Do not mix them up in the registry.

---

## 0. Bottom line

1. **Live as a business, Predictions product likely live, but thin and unmeasurable.** Matchbook completed its acquisition of rival exchange Betdaq on 2026-10-14 (H, iGaming Business) and says the combined pool will deepen liquidity; Betdaq closes 2026-10-21, withdrawals until 2026-11-04 (H). The Predictions product (Yes/No contracts) launched around Dec 2025 / Jan 2026 (sources conflict, section 1) and a 2026-06-11 article describes a World Cup tie-up with ADI Predictstreet (H as to what the article says). No volume, OI or user figure is published anywhere I could reach.
2. **Fiat, UK-regulated sports/politics exchange, not a crypto venue.** Triplebet Ltd operates it under its UK Gambling Commission exchange licence (M, press). No chain, no on-chain collateral, no wallet.
3. **Official API exists but is authenticated and customer-account-bound**: REST at `https://api.matchbook.com`, session token from username + password (+ optional MFA code), any registered customer may use it, 6 per-group rate limits, GET charges only above standard tier (H). **No WebSocket/streaming** documented (H, NOT FOUND in the index). The API host is behind a Cloudflare challenge from my egress (H).
4. **Predictions are not visible in the API docs.** Closest feature: `exchange-type=binary` / `odds-type=%` read parameters, but the docs say "We stopped supporting binary mode for new offer submissions" (H). The Predictions UI most likely sits on top of the normal back/lay book (my inference, M).
5. **PayBox cannot trade it** (no wallet path). Signal-only at best, and only if someone holds a KYC'd Matchbook account.
6. **Not an independent leg in three cases**: the ADI-branded section (probably ADI's CLOB, M), the easyBet exchange (white-label of the same exchange, M), and Betdaq (now merged, H).
7. **adapter_priority = P2.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| iGaming Business, 2026-10-14, "Matchbook completes acquisition of rival exchange Betdaq" | Acquisition completed; CEO Ronan McDonagh: "in one combined pool they should find better prices and deeper liquidity than either exchange could offer alone"; Betdaq stays open until 21 Oct, withdrawals until 4 Nov; article notes the ADI PredictStreet partnership "around the 2026 World Cup" and the EasyBet exchange launched with EasyGroup in 2024; no volumes, users or price given | H https://igamingbusiness.com/strategy/ma/matchbook-completes-acquisition-rival-exchange-betdaq/ (URL from listing at https://igamingbusiness.com/prediction-markets/) |
| NextPredict, 2026-06-11 | "A deal between Matchbook and ADI Predictstreet will bring World Cup prediction markets to the UK, Ireland and Brazil"; "ADI Predictstreet at Matchbook platform"; CEO says it runs "multiple licensed prediction market brands under a single regulatory framework" | H (what the article says) https://nextpredict.io/market-news/industry/matchbook-launches-world-cup-prediction-markets/ |
| NEXT.io UK prediction markets review (undated page) | "Currently, there is a clear focus on politics and football, with live markets covering major leagues and tournaments"; prediction section "does not require a new account or separate download"; binary/multi-outcome/ranged/user-generated markets listed as not available on its review card | H (what the page says; page date NOT FOUND) https://next.io/prediction-markets-uk/ |
| Launch timing | Dec 2025 plans said "January"; Betting.co.uk (12 Dec 2025): "set to launch the first regulated prediction markets in the UK in January 2026"; a later SBC News piece reportedly says first UK launch in Dec 2025 (seen only in a search snippet, SBC page returned 403) | M https://www.betting.co.uk/news/legal/matchbook-will-become-first-uk-regulated-prediction-markets-operator/ ; https://www.yogonet.com/international/news/2025/12/12/116747-matchbook-to-launch-uk-prediction-markets-in-january-as-it-eyes-us-expansion |
| Official site | `www.matchbook.com` 403 (Cloudflare challenge) from my egress | H (the block) |
| Developer docs | `https://developers.matchbook.com` HTTP 200, llms.txt index present | H |

Verdict: **still_live = true** for Matchbook exchange (H) and for the Predictions product (M, press only; not seen first-hand). Exact Predictions launch month: L/conflicting.

---

## 2. Kind and market model

- **Kind:** regulated peer-to-peer sports betting exchange (order-book matching between users, operator takes commission). "Betting exchanges match buyers and sellers rather than taking the opposite side of wagers." (M, Yogonet). Predictions run "under Matchbook's existing UK Gambling Commission exchange licence" (M, Yogonet/NextPredict). Operating entity per press: Triplebet Ltd (M).
- **Native book (H, official API docs):** per event -> markets -> runners; each runner has `back`/`lay` price ladders (`prices[]` with `odds`, `decimal-odds`, `available-amount`, `side`, `exchange-type`). Market `type` is `multirunner` or binary-style single winner; `market-type` values seen: `one_x_two`, `first_goalscorer`, `outright_ded_fact`, `other`. Order submission uses `side` = `back` or `lay`.
- **Predictions presentation (M):** "percentage-based Yes/No probabilities" rather than fractional odds (Yogonet); an affiliate page says contracts are priced 0-100, settle at 100 or 0, and you can sell before the event ends (L). My inference: Yes at p% = back at decimal 100/p; No = lay. This is **not confirmed** in official sources.
- **Binary mode in the API (H):** read endpoints accept `exchange-type` = `back-lay` or `binary`, `odds-type` = `DECIMAL|US|HK|MALAY|INDO|%`, sides `win`/`lose`, and `exclude-mirrored-prices`. But Submit Offers carries: "Note: We stopped supporting binary mode for new offer submissions". So new offers are back/lay only.
- **Tick sizes (H, https://developers.matchbook.com/docs/exchange-odds-ladder.md):** decimal ladder 1.01-1000 (350 rungs): step 0.01 to 2.00, 0.02 to 3.00, 0.05 to 4.00, 0.1 to 6.00, 0.2 to 10, 0.5 to 20, 1 to 30, 2 to 50, 5 to 100, 10 above. Probability ladder file (H, https://developers.matchbook.com/docs/probability-odds-ladder.md): 0.1-pt steps from 0.1 to 10, 1-pt steps from 10 to 90, 0.1-pt from 90 to 99.9. Which ladder the Predictions UI uses is NOT FOUND. Around p = 50% the decimal ladder gives roughly 0.25-0.5 pt granularity in implied probability (step 0.01 below 2.00, 0.02 above).
- **Categorical / scalar:** NOT FOUND for Predictions. NEXT.io's review card lists multi-outcome and ranged markets as unavailable (H as to what the page says, M overall). The underlying exchange does have multirunner markets (outrights, match odds), which an adapter can treat as mutually exclusive runner sets (like neg-risk groups).
- **Tokenisation:** none. Positions are rows in Matchbook's own ledger (offers/matched bets, `Get Positions`), no transferable token, no chain.
- **Outcome ids (H):** `event-id`, `market-id`, `runner-id` are 64-bit integers (e.g. `410499974370010`). Treat as strings in JSON.

---

## 3. Chains and collateral

- **None on-chain (H by absence; M by inference).** Accounts are denominated in fiat wallets; docs list currencies `USD, EUR, GBP, AUD, CAD, HKD` and a "New Matchbook wallet" with `Get Balance` / `Get New Wallet Transactions` (H https://developers.matchbook.com/llms.txt). The login example shows `currency: GBP`, `balance`, `exposure`, `commission-credit`, `free-funds` (H, example).
- Funding methods, minimum deposit and withdrawal rules: NOT FOUND in official sources (site blocked). An affiliate page claims a 10 GBP minimum deposit (L, https://matchbookbetting.uk.com/prediction-markets/ - affiliate, not official).
- **ADI-branded markets:** ADI Predictstreet itself is on ADI Chain (chainId 36900) with USDC.e and per-user vaults (H, sibling note `docs/research/venues/adi-predictstreet.md`). Whether Matchbook customers hold anything on that chain is NOT FOUND; the 2026-06-11 article does not say.

---

## 4. Read API

- **Status: `official-authenticated`.** Docs: https://developers.matchbook.com (index https://developers.matchbook.com/llms.txt, every page also served as `.md`). OpenAPI 3.1 blocks per reference page; `servers: https://api.matchbook.com` (H).
- **Auth (H, https://developers.matchbook.com/docs/getting-started.md and /reference/login.md):** `POST /bpapi/rest/security/session` with JSON `{username, password, "mfa-code"?}` returns `session-token`; send it on all later requests as cookie or header named `session-token`; sessions live about 6 hours. Requests without a valid session get 401. Docs never say which GETs are exempt; the OpenAPI blocks declare `security: [{}]` (unspecified). So "market data needs login" is M, not H. **An adapter needs a funded/KYC'd Matchbook customer login** ("Any registered customer can use the API immediately with their normal login", H https://developers.matchbook.com/docs/pricing.md).
- **Base URL:** `https://api.matchbook.com` (H). Account/session login path is `/bpapi/rest/security/session`; data/trading paths are `/edge/rest/...`.
- **Key read endpoints (H, paths from each reference page's OpenAPI block):**

| Purpose | Endpoint |
|---|---|
| Sports lookup | `GET /edge/rest/lookups/sports` |
| Navigation tree | `GET /edge/rest/navigation` |
| Events (paged: `offset`, `per-page` default 20; filters `after`, `before`, `sport-ids`, `category-ids`, `ids`, `states`, `tag-url-names`; options `include-prices`, `price-depth` default 3, `price-mode` expanded/aggregated, `side`, `currency`, `odds-type`, `exchange-type`, `minimum-liquidity`, `markets-limit`, `exclude-mirrored-prices`) | `GET /edge/rest/events` |
| Event markets | `GET /edge/rest/events/{event_id}/markets` and `.../markets/{market_id}` |
| Runners | `GET /edge/rest/events/{event_id}/markets/{market_id}/runners` |
| Prices / book per runner | `GET /edge/rest/events/{event_id}/markets/{market_id}/runners/{runner_id}/prices` |
| Popular markets | `GET /edge/rest/popular-markets` |
| Account / balance / positions | `GET /edge/rest/account`, `/account/balance`, `/account/positions` |
| Own offers / matched | `GET /edge/rest/v2/offers`, `/v2/matched-bets/aggregated`, `/reports/v2/offers/current` |

  Event objects carry `volume` (event-level matched volume, per the docs example), `status` (`open, suspended, closed, graded`), `start`, `in-running-flag`. Market and runner objects carry `volume`, `status`, `withdrawn`. Book depth is limited by `price-depth` and by `minimum-liquidity` (docs param says default 2; a 2018-era changelog says default 10 for non-racing sports: conflicting, always set it explicitly).
- **Trades / resolution data:** no public trade tape documented. Resolution is visible only as event/market/runner `status` (`graded`, etc.) and in the authenticated settled-bets report. NOT FOUND: a public history endpoint.
- **WebSocket / streaming:** NOT FOUND (searched: llms.txt index, all fetched reference pages). Polling only.
- **Rate limits (H, https://developers.matchbook.com/docs/fair-usage-policy.md section 4.2, per customer account / unique IP):** Account 300/min, Events 700/min, Security 200/min, Navigation 100/min, Reports 40/min, Betting Write 3,000/min. Exceeding blocks for a default 10 minutes (5.1). Higher limits via the API plan (email contact on the pricing page).
- **API pricing (H, https://developers.matchbook.com/docs/pricing.md):** standard tier free for any registered customer; above that an API Plan (Trader Tier or Commercial Tier fee, amounts not stated) and "Each set of 1 million GET requests in a calendar month will be charged at 100 GBP"; write requests not chargeable "at reasonable frequency". Fees are deducted from the customer's Matchbook account.
- **Heartbeat API (H):** `POST /edge/rest/v1/heartbeat` plus status/delete; a dead-man's switch for open offers, useful if ever trading.
- **Live check from my egress (H):** unauthenticated `GET https://api.matchbook.com/edge/rest/events?per-page=1`, `/edge/rest/lookups/sports`, `/edge/rest/navigation` all returned HTTP 403 with `cf-mitigated: challenge` (Cloudflare "Just a moment..." interstitial). That means a scripted client from this network cannot even reach the 401/200 behaviour; a production adapter would need an egress IP/client profile Matchbook accepts (ask the API contact to allowlist). I did not attempt to bypass it. Sample: `docs/research/fixtures/matchbook-predictions-triplebet-ltd-uk/api-unauth-403-headers.txt`.
- **Docs freshness warning:** example payloads show 2016-2017 dates and the changelog (5 entries, mostly undated; the only year given is 2019) never mentions Predictions. Treat the response shapes as likely-but-unverified for 2026 (L).

---

## 5. Trade path

- **Programmatic placement exists for the exchange (H):** `POST /edge/rest/v2/offers` (Submit Offers, body `{odds-type, exchange-type: "back-lay", offers:[{runner-id, side: back|lay, odds, stake, keep-in-play}]}`), `PUT /edge/rest/v2/offers` (edit), `DELETE /edge/rest/v2/offers` (cancel), all under the same `session-token`. Offer statuses: `open, cancelled, edited, matched, flushed, failed, delayed`. No cryptographic signing: authentication is username/password session.
- Binary-mode submission is discontinued (H). Whether Predictions orders flow through the same `v2/offers` endpoint is NOT FOUND (inference M).
- **Not reachable by an agent without a human-held fiat account:** requires registering a Matchbook customer account (KYC, UK/IE/BR jurisdiction), funding it with fiat, and storing a login credential. None of that is available to the agent here, and I did not do any of it.

---

## 6. Reachable through PayBox? -> **no**

- No EVM or Solana address, no contract, no transaction proposal, no signed-order scheme. Funding and withdrawals are fiat rails, authentication is a username/password session.
- PayBox card/secret credentials exist in the tool list, but using a PayBox-held card to fund a gambling account and storing a venue password as a secret is outside this project's read-only remit and would also collide with the venue's KYC/jurisdiction rules. Not evaluated further, no PayBox tool was called.
- For the ADI-branded section, ADI chain 36900 is not in PayBox's chain catalogue (H, sibling note `adi-predictstreet.md`).

---

## 7. Fees

- **Official schedule: NOT FOUND** (matchbook.com Terms/help pages 403).
- API data model (H, https://developers.matchbook.com/reference/get-offers-v2.md): each offer carries `commission-type` (examples `VOLUME` and `NET_WIN`), `originator-commission-rate`, `acceptor-commission-rate` (example values `0`, `0.01`, `0.035`), `commission-reserve`. So the engine supports different maker (originator) and taker (acceptor) rates and per-offer commission types; definitions are not given.
- Affiliate page (L, https://matchbookbetting.uk.com/prediction-markets/): "standard commission is 2% on net winnings"; promos with 0% commission for 60 days (code COMMFREE) and a 0% World Cup welcome period; "no weather, company earnings or crypto price" markets. Affiliate content, not official: treat 2% as a placeholder to verify via an account.
- API fees: see section 4 (GBP 100 per million GETs above standard tier).
- Practical effect for arbitrage: commission on net winnings (not on stake) is cheaper than ADI Predictstreet's ~3% per leg at p=0.5 (H sibling note) but is netted only when a position wins; the lay-side liability is `stake * (odds - 1)`, which ties up more collateral than a naive Yes/No share price implies.

---

## 8. Resolution mechanism and dispute risk

- **Matchbook-native (exchange) markets:** centralised operator settlement; the runner/market `status` moves to graded/settled and the account wallet is credited. Rule text (void rules, dead-heat, abandoned matches, rule 4 deductions, politics settlement source) NOT FOUND (site blocked). No oracle, no on-chain challenge window; dispute path is customer support and the UKGC-approved ADR (M, general UK practice; not verified for Matchbook).
- **Predictions:** "Contracts settle at 100 if the outcome happens and 0 if not" (L, affiliate). Settlement source NOT FOUND.
- **ADI-branded markets:** if the ADI book is reused, resolution inherits ADI's operator-proposed outcome from sports-data vendors with a 2h challenge window, one 500 USDC challenge per market and Terms 5.4/5.5 void/amend powers (H in the sibling note, about ADI's own platform). How this maps to a Matchbook customer's account is NOT FOUND.
- Risk summary for an aggregator: operator discretion on voids, no public dispute record, no machine-readable resolution source. Treat as high resolution-mismatch risk on any cross-venue pair.

---

## 9. Geo, ToS, automation

- **Jurisdictions:** Matchbook is "licensed in Great Britain by the Gambling Commission" (M, Betting.co.uk). World Cup product stated for "the UK, Ireland and Brazil" (H as to what the article says). US: parent Triplebet Ltd and partner RSBIX LLC filed with the CFTC in Sept 2025 for a Designated Contract Market; approval "as early as March" was an expectation in Dec 2025 and I found no confirmation (M, not confirmed). Register entry for Triplebet Ltd: not checked (UKGC register is a dynamic search, no static entry).
- **Automation is allowed on the exchange API** ("customers use the API to connect automatic trading bots to the exchange, but it is also used to connect to third party websites to deliver live pricing", H https://developers.matchbook.com/docs/faq.md). Fair Usage Policy (H): "Do not use the API to monitor Matchbook's availability, performance, or functionality, or for benchmarking or competitive purposes (3.5d)"; use the API "only as described in Matchbook's documentation" (4.1); do not circumvent rate limits (4.3). A cross-venue price scanner that republishes or benchmarks Matchbook prices sits in a grey zone against 3.5d; get written clearance from the API contact before building.
- Full Terms and Conditions (including any bot/geo rules for Predictions): NOT FOUND (403).

---

## 10. Liquidity

- **Volume/OI/TVL: NOT FOUND** (searched: iGaming Business 2026-10-14 article, NextPredict 2026-06-11 article, Betting.co.uk Dec 2025, Yogonet Dec 2025, NEXT.io review, developer docs; none gives a figure). Event-level `volume` is returned by the API (needs login), so volume can be measured once an account exists.
- Qualitative: an affiliate page says "liquidity is described as thin outside major events" (L). NEXT.io says politics and football have the focus (H as to the page).
- Betdaq merger (completed 2026-10-14, Betdaq shuts 2026-10-21): combined pool should improve football/racing exchange depth (H as to the claim; the effect is unmeasured).

---

## 11. Category overlap (where arbitrage could exist)

- **Football (match winner, outrights, World Cup, UCL/EPL):** overlaps ADI Predictstreet, Polymarket, Kalshi, Smarkets and traditional exchanges. This is the main useful overlap.
- **UK/world politics:** NEXT.io says politics is active (H as to page). Overlaps Polymarket, Kalshi, PredictIt, Smarkets.
- **Entertainment / current affairs:** mentioned by affiliate/press (L/M).
- **Crypto price, weather, earnings:** excluded (L, affiliate).
- Cross-venue comparison needs a mapper from Matchbook's `runner` names to the other venues' outcomes; there is no external id (no condition id, no slug standard); only Matchbook `event-id/market-id/runner-id` plus event name and start time.

---

## 12. Shared liquidity (is it an independent arbitrage leg?)

| Pair | Finding | Tag |
|---|---|---|
| Matchbook native exchange vs Polymarket, Kalshi, etc. | Independent order book | H/M |
| "ADI Predictstreet at Matchbook" vs ADI Predictstreet | ADI blocks GB (and other countries) on its own site (H sibling note), and its docs describe "Trading partners: route customer flow into PredictStreet markets via a key-authenticated REST API". So the ADI-branded section at Matchbook is probably a partner front end onto the **same ADI CLOB** -> not independent of ADI. Not confirmed. | M |
| easyBet exchange vs Matchbook | Dec 2025 coverage: "The technology will also be deployed as a white-label product for EasyBet"; iGB: "launched the EasyBet exchange with EasyGroup in 2024". White-label exchange liquidity sharing is not stated but is typical. | M |
| Betdaq vs Matchbook | Merged into one pool (Betdaq closes 2026-10-21) | H |
| Matchbook vs US entity (RSBIX) | Separate regulated venue if/when approved | M |

---

## 13. Adapter recommendation

- **adapter_priority: P2** (signal-only / thin). Reasons: login-gated API, API host challenged by Cloudflare from my network, Predictions not visible in docs, no stream, no volume data, fiat-only (PayBox cannot trade), UK-regulated access, potential shared liquidity with ADI/easyBet/Betdaq, ToS 3.5d question.
- **If built:** a read adapter against `/edge/rest/events?include-prices=true&price-depth=5&minimum-liquidity=0&per-page=50`, 700 req/min Events budget, session refreshed every <6h, convert back/lay decimal odds to implied Yes/No prices (`yes_ask = 1/lay-side-or-back-odds` mapping to be verified once Predictions markets are seen), event name + start time matching to other venues. Needs: a funded Matchbook customer account held by a human; written clearance on FUP 3.5d; UK/IE egress or allowlisting.
- **Upgrade to P1** if: (a) a live response shows Predictions markets in `/edge/rest/events` with usable depth, and (b) the API contact confirms aggregator use is permitted.
- **Registry note:** keep "Matchbook (exchange)", "ADI Predictstreet at Matchbook" (likely duplicate of ADI) and "easyBet exchange" (likely duplicate of Matchbook) as separate entries with a `shares_liquidity_with` flag.

---

## 14. Open questions

1. Are Predictions markets returned by `GET /edge/rest/events`, and under what sport/category/`market-type`?
2. Do Predictions use `v2/offers` back/lay, and how are Yes/No mapped (`side`, `odds-type=%`)?
3. Real volume / book depth per market (requires login).
4. Official commission schedule for Predictions (VOLUME vs NET_WIN, maker vs taker).
5. Does the ADI-branded section route to ADI's CLOB (shared liquidity), and which entity settles it?
6. Is Cloudflare challenge on `api.matchbook.com` applied to all non-UK/IE IPs or to all non-browser clients?
7. Does RSBIX have CFTC approval, and is there a US Matchbook Predictions product?

---

## Sources

- Official developer docs (H): https://developers.matchbook.com/llms.txt ; https://developers.matchbook.com/docs/getting-started.md ; /docs/pricing.md ; /docs/fair-usage-policy.md ; /docs/faq.md ; /docs/exchange-odds-ladder.md ; /docs/probability-odds-ladder.md ; /reference/login.md ; /reference/get-events.md ; /reference/get-markets.md ; /reference/get-prices.md ; /reference/submit-offers-v2.md ; /reference/get-offers-v2.md ; /reference/error-codes-and-responses-1.md ; /changelog (5 undated entries) - all fetched 2026-10-19.
- iGaming Business, 2026-10-14, Matchbook/Betdaq (H what it says): https://igamingbusiness.com/strategy/ma/matchbook-completes-acquisition-rival-exchange-betdaq/
- NextPredict, 2026-06-11, Matchbook x ADI Predictstreet (H what it says): https://nextpredict.io/market-news/industry/matchbook-launches-world-cup-prediction-markets/
- NEXT.io UK prediction markets review (undated): https://next.io/prediction-markets-uk/
- NextPredict, 2025-12-12, Matchbook UK launch (M): https://nextpredict.io/market-news/matchbook-launch-uk-first-prediction-market/
- Yogonet, 2025-12-12 (M): https://www.yogonet.com/international/news/2025/12/12/116747-matchbook-to-launch-uk-prediction-markets-in-january-as-it-eyes-us-expansion
- Betting.co.uk, 2025-12-12 (M): https://www.betting.co.uk/news/legal/matchbook-will-become-first-uk-regulated-prediction-markets-operator/
- Affiliate page (L, not official): https://matchbookbetting.uk.com/prediction-markets/
- ADI Predictstreet docs (H for ADI's own claims): https://docs.adipredictstreet.com/introduction.md ; https://docs.adipredictstreet.com/llms.txt ; sibling note `docs/research/venues/adi-predictstreet.md`
- UK Gambling Commission register landing page (dynamic search, no entry read): https://www.gamblingcommission.gov.uk/public-register/businesses
- Blocked (403 Cloudflare challenge) and therefore NOT read: https://www.matchbook.com/ , /predictions , /page/rules_and_regulations/terms-and-conditions , https://support.matchbook.com , https://api.matchbook.com/edge/rest/* , https://sbcnews.co.uk/... (Betdaq piece and Dec 2025 piece), https://sigma.world/...

## Fixtures

`docs/research/fixtures/matchbook-predictions-triplebet-ltd-uk/`
- `api-unauth-403-headers.txt` - headers of the unauthenticated GET to `api.matchbook.com/edge/rest/events?per-page=1` (HTTP 403, `cf-mitigated: challenge`), captured 2026-10-19.
- `doc-example-get-events.txt` - the official docs' example response for `GET /edge/rest/events` (NOT live; 2016-2017 values; labelled in the file).
- `doc-get-events-params.json` - parameter names of `GET /edge/rest/events` from the official OpenAPI block.
