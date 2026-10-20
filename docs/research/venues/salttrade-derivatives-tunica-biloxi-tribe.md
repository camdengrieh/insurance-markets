# SaltTrade Derivatives (Tunica-Biloxi Tribe) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, one web search, unauthenticated GETs to public hosts (Kalshi public API, Apple iTunes search API, one CFTC PDF download). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/salttrade-derivatives-tunica-biloxi-tribe/` (section 12). There is no SaltTrade API, so the fixtures are evidence files, not response samples of this venue.

---

## 0. Bottom line

1. **It is a storefront for Kalshi, not a venue.** SaltTrade Derivatives is a "newly established subdivision of a Tribal-owned enterprise" that will publish a mobile app for trading Kalshi event contracts. Kalshi supplies "matching, clearing, custody, and surveillance" (H, Kalshi blog and Business Wire release). SaltTrade supplies brand, marketing, customer experience and the customer relationship. Contracts, order book, prices, rules and resolution are Kalshi's.
2. **Liquidity is 100% shared with Kalshi by design, so it can never be an independent arbitrage leg.** Model it as a distribution channel of the Kalshi liquidity pool. A SaltTrade price and a Kalshi price are the same price.
3. **Announced, not demonstrably available.** The announcement is dated 2026-09-18 (H). The Tribe's own release says "Additional information regarding the platform and its launch will be announced in the coming months" (H), uses future tense ("will be powered by Kalshi"), gives no URL, no app-store link, no states, no fees. I found no SaltTrade listing in the US Apple App Store search API or in a Google Play search, and no website (section 1). So `still_live = true` means only "announced one month ago and not defunct"; there is no evidence a user can trade through it today.
4. **No public API, no developer docs, no on-chain component, no EVM/PayBox path.** Nothing to build an adapter against. The correct data source for these markets is the Kalshi adapter already covered by the parallel workflow.
5. **Correction to the discovery hint.** The hint said "Shift Markets says its consumer app launched ... and is not CFTC-registered". That is wrong on attribution. Shift Markets is a separate B2B white-label vendor; its September 2026 brief only *reports* the Tribe's announcement as an example of "venues licensing their exchanges to branded front ends", and claims no role in SaltTrade (H, Shift pages, section 13). The Tribe, not Shift, owns the app.
6. **adapter_priority = skip.** Duplicate liquidity, no API, no confirmed product. Revisit only on the triggers in section 11.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Tribe press release, tunicabiloxi.org, posted 2026-09-18 | Announces "the launch of its first tribal prediction market app" via SaltTrade Derivatives, "powered by Kalshi". Future tense throughout; "Additional information regarding the platform and its launch will be announced in the coming months." No URL, no store link, no fees, no geography. | H (summary of the page; the page was not quoted in full) |
| Kalshi blog, news.kalshi.com, 2026-09-18 | Says the Tribe "today" launched the app; no download link, markets, states or fees. | H |
| Business Wire release as carried by Yahoo Finance, 2026-09-18 | Same wording as the Tribe's release; "will not be registered with the CFTC, in reliance on conditional no-action relief". Release "does not confirm that the app is available to users" (reader's summary). Paid press release. | H/M |
| CryptoBriefing | Describes SaltTrade as "a Tribal-owned venture developing an app powered by Kalshi's prediction market infrastructure" and does not say whether the app is live. | M |
| Shift Markets brief (Sept 2026) | Lists it as an announced storefront; does not say it is live. | H |
| tunicabiloxi.org homepage (fetched 2026-10-19) | No mention of SaltTrade, prediction markets or Kalshi. | H (via page summary) |
| Apple iTunes Search API, `term=salttrade`, `country=us`, 2026-10-19 | 5 results, none named SaltTrade (TradeLocker, thinkorswim, tastytrade, OANDA, eToro). Fixture saved. | M (search ranking, not an exact-bundle lookup) |
| Google Play search `q=salttrade`, 2026-10-19 | No app with SaltTrade in the name (two unrelated apps listed). | M (page summary) |
| Candidate domains, DNS/GET 2026-10-19 | `salttrade.com`, `.app`, `salttradederivatives.com`, `www.` variants do not resolve. `salttrade.io` resolves but serves a JS redirect to `/lander` (looks like domain parking). Not followed; not attributed to the Tribe. | M |

Verdict: **announced and not defunct; availability to the public unverified.** The web-search budget for the session was exhausted after one search, so I could not look for post-launch news (app store links, user reports, state-regulator reactions). Treat the absence of those as "not searched", not as "none exist".

---

## 2. Kind and market model

- **Kind: broker-or-frontend, specifically a CFTC "passive software provider" (PSP) storefront on a registered DCM** (H, CFTC Letter 26-25, section 5). It is explicitly not an exchange, not an intermediary that accepts orders, and not CFTC-registered.
- **Market model: whatever Kalshi lists.** Contracts are Kalshi event contracts. Shift's brief: "A single-venue storefront can list only what that venue lists, at that venue's prices and fees" (H). Kalshi's model as recorded in the project's Kalshi note (`docs/research/08-venues-polymarket-kalshi.md`, produced by the parallel workflow, M here): USD-settled binary Yes/No contracts on a central limit order book, series -> event -> market tickers, some scalar and combo markets. No outcome tokens.
- **Tokenisation:** none. There is no on-chain representation of SaltTrade positions. (NOT FOUND for anything contrary; searched: Tribe release, Kalshi blog, Business Wire, CryptoBriefing, Gaming.net, Native News Online, Shift brief.)
- **Could SaltTrade list non-Kalshi markets later?** The release says the venture "may branch out into other offerings" (H). The CFTC letter lets a PSP route to "one or more Registrants" (FCMs, IBs, DCMs) and to "event contracts, perpetual contracts, and other Commission-regulated derivatives" (H). So a future multi-venue SaltTrade is permitted, but nothing says it is planned. Today: Kalshi only (H, Kalshi blog).

---

## 3. Chains and collateral

- **Chains: none.** No contract, token, bridge or wallet is mentioned in any source I read. (NOT FOUND, searched the same sources as above.)
- **Collateral: USD held by Kalshi** ("custody" is Kalshi's, per Kalshi blog and Shift brief, H). The CFTC letter conditions assume orders are submitted "directly to Registrants" (H). Whether a SaltTrade user holds a Kalshi account, a sub-account, or a SaltTrade-labelled account at an FCM: NOT FOUND (searched: all sources above; Kalshi docs list "FCM subtraders" and "subaccounts" but nothing about partner storefronts, `docs.kalshi.com/llms.txt`, H for the absence).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **None found.** No developer page, OpenAPI, SDK, WebSocket, or site. | H for "not in any page I read", NOT FOUND otherwise |
| Docs URL | none | - |
| Base URLs | none for SaltTrade | - |
| Underlying data source | Kalshi's public API: `https://external-api.kalshi.com/trade-api/v2` (dedicated) and `https://api.elections.kalshi.com/trade-api/v2` (shared). On 2026-10-19 `GET /exchange/status` on the shared host returned HTTP 200, `exchange_active:true`, `trading_active:true` on the listed exchange indexes (fixture). Market data endpoints (markets, events, series, orderbook, trades, candlesticks) are documented at `docs.kalshi.com`; details, auth and rate limits are in the Kalshi note `docs/research/08-venues-polymarket-kalshi.md` section 4. | H for the status GET and the endpoint list (`docs.kalshi.com/llms.txt`), M for the rest |

The aggregator should read these markets from the Kalshi adapter only. A SaltTrade adapter would return the same data with a different brand.

---

## 5. Trade path

- **Programmatic placement via SaltTrade: none.** The product is described as a mobile app (H, Kalshi blog: "operates the mobile app"). No API keys, no signing scheme, no order endpoint documented. NOT FOUND (searched: all sources above).
- **How orders reach the exchange (H, CFTC Letter 26-25 "Covered Activities"):** the PSP distributes "front-end interface software for Users to review market data and aggregate position information, view information about product offerings, and submit orders ... directly to Registrants". The PSP's "involvement in order submission will be limited to providing" the software; it "will not have any affirmative involvement with any particular orders". "Users will face no contractual or operational restriction from accessing those Registrants directly, without the [PSP's] involvement." So the same account-holder can always trade the same contract on Kalshi itself.
- **Implication for an agent:** if you want to trade these contracts, go to Kalshi directly (its own API, covered elsewhere). SaltTrade adds nothing programmatic.

---

## 6. PayBox / EVM reachability

**paybox_reachable = no.**

- There is no on-chain component, no EVM or Solana address, no ERC-20 collateral and no signed-order scheme, so a PayBox wallet has nothing to propose a transaction against or to sign for SaltTrade.
- The only money path is fiat/KYC onboarding into an app (and, behind it, a Kalshi account). A PayBox wallet could at best be a funding source for a separate Kalshi crypto deposit, which is a Kalshi question, not a SaltTrade one, and is outside this note.

---

## 7. Fees

| Fee | Finding | Tag |
|---|---|---|
| SaltTrade's own fee | **NOT FOUND** (searched: Tribe release, Kalshi blog, Business Wire, Native News Online, Gaming.net, CryptoBriefing, Shift brief). All sources say fees are not mentioned. | H for the absence |
| What the CFTC letter allows | The PSP "may provide for [it] to charge a transaction-based fee directly to Users" and Registrants "may also agree to share a specified portion of their relevant revenues with" the PSP. So a SaltTrade surcharge and/or a Kalshi revenue share are *permitted*; whether either exists is unknown. | H (permission), NOT FOUND (existence) |
| Kalshi exchange fee | "As an exchange, Kalshi earns transaction fees rather than profiting from customer losses." (Kalshi blog.) Formula per the Kalshi note: taker about `0.07 x C x P x (1-P)` times a per-series `fee_multiplier`, rounded up, from the Series endpoint's `fee_type`/`fee_multiplier`. Coefficients are **M** there (the fee schedule PDF was blocked). | H for the quote, M for the formula |
| Shift's framing | "Listings, pricing and fees are set by one venue." | H (as a statement by Shift), M as a fact about SaltTrade |

For an edge calculation: use Kalshi's fee model and add an unknown SaltTrade surcharge term of 0 until proven otherwise. Do not assume SaltTrade is cheaper or dearer than Kalshi direct.

---

## 8. Resolution and dispute risk

- Resolution is **Kalshi's**: contract rules, sources and settlement are Kalshi's as the DCM ("Kalshi runs the federally regulated exchange underneath: matching, clearing, custody, and surveillance", H). The Tribe's release says contracts have "clearly defined rules and objectively verifiable results" (H).
- Per-series rule text, settlement sources and `additional_prohibitions` are in Kalshi's Series endpoint (see Kalshi note).
- Dispute risk specific to SaltTrade: **who the customer's counterparty and claimant is** (Kalshi? an FCM? SaltTrade?) is NOT FOUND. Because the PSP structure has orders go "directly to Registrants", the legal relationship for a payout presumably sits with the Registrant (M, inference from the CFTC letter), but I did not see SaltTrade's terms.
- Regulatory dispute risk: the whole structure rests on a **staff no-action position, not a rule**. The letter says it "represent[s] the views of the Division only", is "not binding on the Commission", and the Division "retains the authority to condition further, modify, suspend, terminate, or otherwise restrict" it (H, Letter 26-25). It stays in effect only "until the effective date of a Commission rulemaking or guidance". Footnote 22 notes PSPs affiliated with a state or tribal government may be protected by sovereign immunity and requires such a PSP to include a waiver of sovereign immunity, "limited or otherwise, if necessary", to make the conditions enforceable (H). Some outlets note tribal and state authorities still dispute jurisdiction over event contracts (M, one search summary; no specific dispute found).

---

## 9. Geo, ToS and automation

- **SaltTrade ToS / geography / eligibility: NOT FOUND** (no site exists to read; the releases name no states; searched as above). The Tribe's own release names Marksville, Louisiana only as headquarters.
- **No-action conditions that touch users** (H for the existence of conditions; the exact list did not extract from the PDF and the CFTC press release says only "subject to certain specified conditions"): the reporting on the letter lists user conflict-of-interest disclosures, a risk disclosure statement and recordkeeping (M, Gaming.net summary of the letter). The letter's footnotes cite 17 CFR 1.55 (risk disclosure), 7 USC 6b and 17 CFR 180.1 (fraud/anti-manipulation) and NFA Rule 2-29 (promotional material) (H).
- **Automation:** nothing stated. Because no API exists, an automated client would have to drive a mobile UI, which is out of scope. The Kalshi API (with its own Member Agreement, region attestation for trading Sports/Elections/Entertainment from 2026-08, and restricted-jurisdiction list, per the Kalshi note) is the only sanctioned programmatic route.

---

## 10. Liquidity and event overlap

- **SaltTrade-specific volume / OI / TVL: none published** (NOT FOUND; the app had no confirmed public launch). Any SaltTrade order flow is Kalshi order flow.
- **Liquidity depth available through it** = Kalshi's. Kalshi's exchange was active and trading on 2026-10-19 (fixture, H). For Kalshi volume and OI figures, use the Kalshi note, not this one.
- **Overlap with other venues:** every Kalshi category (sports, politics, crypto price, macro, weather, etc.) as the same contracts. That is where Kalshi-vs-Polymarket/XO arbitrage exists, and it exists through the Kalshi adapter, not through SaltTrade.
- **Shares liquidity with: Kalshi, entirely** (H: "Kalshi supplies ... nationwide liquidity", Shift brief table and Kalshi blog "nationwide liquidity from day one"). Not an independent leg.

---

## 11. Adapter spec for the aggregator

**Priority: skip.**

- Do **not** build a `salttrade` read or trade adapter. Add a registry row so the scanner never double-counts: `venue_id: salttrade-derivatives`, `kind: distribution_channel`, `liquidity_pool_id: kalshi-clob`, `independent: false`, `read_api: none`, `trade_api: none`, `status: announced-2026-09-18-availability-unverified`.
- General rule this venue illustrates (same pattern as Robinhood, Coinbase, Webull and the dead DFlow product): any branded front end on a DCM maps to the DCM's `liquidity_pool_id`. Arbitrage detection must key on the pool, not the brand.
- **Revisit triggers (any one):**
  1. SaltTrade publishes a developer API or docs (then it may expose per-customer or fee data worth a signal feed).
  2. It routes to a second venue (the letter allows multiple Registrants, and the Tribe says it "may branch out"). Then the second venue is the interesting leg, via its own adapter.
  3. An App Store or Google Play listing appears, plus published fees: only to refine the fee term in net-edge maths for a Kalshi leg bought through SaltTrade.
  4. CFTC withdraws or conditions Letter 26-25 (would affect every PSP storefront).

---

## 12. Fixtures

| File | What it is |
|---|---|
| `cftc_letter_26-25_text_extract_2026-10-19.txt` | Lossy text extraction (small zlib/Tj script) of CFTC Letter No. 26-25 (Market Participants Division, 2026-09-17), the PSP no-action position. Words encoded as glyph ids are missing, notably the conditions list. Source: `https://www.cftc.gov/csl/26-25/download`. 12.6 KB. |
| `kalshi_exchange_status_2026-10-19.json` | Real `GET https://api.elections.kalshi.com/trade-api/v2/exchange/status` response (667 bytes): the host that serves the markets SaltTrade fronts. |
| `itunes_search_salttrade_2026-10-19.json` | Slimmed Apple iTunes Search API result for `term=salttrade` (US store): no SaltTrade app. |

Note on the CFTC letter: the Gaming.net article ties SaltTrade to "Release No. 9300-26" and Staff Letter 26-09 (the Phantom Technologies letter, issued 2026-03-17 per Letter 26-25). The CFTC press release 9300-26 (H) names neither SaltTrade nor the Tribe; it says the position is "now broadly available" to passive software providers. Letter 26-25 is linked from that release's "Related Links" and its content matches the release (H for the match). I did not find a letter issued to the Tribe individually; the Tribe's "conditional no-action letter" is most plausibly the general Letter 26-25 position (M, inference). Letter 26-09 itself could not be text-extracted and was not read; per Letter 26-25 footnote 6, only its named beneficiary may rely on it.

---

## 13. Sources

All fetched 2026-10-19.

- [H] Tunica-Biloxi Tribe press release (2026-09-18): https://www.tunicabiloxi.org/tunica-biloxi-tribe-launches-the-first-tribal-nation-prediction-market-app/ (read via page summary)
- [H] Kalshi news blog, "First Tribal prediction market app launches with Kalshi" (2026-09-18): https://news.kalshi.com/p/tunica-biloxi-tribe-salttrade-derivatives-kalshi and https://news.kalshi.com/p/tunica-biloxi-tribe-launches-the-first-tribal-nation-prediction-market-app. Promotional; Kalshi is the partner.
- [H/M] Business Wire release via Yahoo Finance: https://finance.yahoo.com/markets/options/articles/tunica-biloxi-tribe-launches-first-120000106.html (paid press release)
- [M] Native News Online: https://nativenewsonline.net/sovereignty/tunica-biloxi-tribe-launches-tribal-owned-prediction-market-app/
- [M] Gaming.net: https://www.gaming.net/tunica-biloxi-tribe-enters-prediction-markets-with-kalshi-powered-app/ (source of the 9300-26 and 26-09 cross-references and the condition list)
- [M] CryptoBriefing: https://cryptobriefing.com/tunica-biloxi-tribe-kalshi-prediction-market/
- [M] ReadWrite: https://readwrite.com/prediction-market-app-tunica-biloxi returned HTTP 403 to the fetcher; not read. Other result URLs from the one search (Crypto Times, Crypto Economy, Bay to Bay News) were not opened.
- [H] Shift Markets brief, September 2026: https://www.shiftmarkets.com/prediction-markets-brief/september-2026 and product page https://www.shiftmarkets.com/prediction-markets (B2B white-label, no exchanges named, no SaltTrade mention)
- [H] CFTC press release 9300-26 (2026-09-17): https://www.cftc.gov/PressRoom/PressReleases/9300-26
- [H] CFTC Letter No. 26-25 (2026-09-17): https://www.cftc.gov/csl/26-25/download (PDF, text extracted locally, lossy)
- [not read] CFTC Letter 26-09 (Phantom Technologies, 2026-03-17): https://www.cftc.gov/csl/26-09/download (fetcher could not extract the text)
- [H] Kalshi docs index: https://docs.kalshi.com/llms.txt (no partner/white-label/builder page listed)
- [H] Kalshi public API status: https://api.elections.kalshi.com/trade-api/v2/exchange/status
- [M] Apple iTunes Search API: https://itunes.apple.com/search?term=salttrade&entity=software&country=us
- [M] Google Play search: https://play.google.com/store/search?q=salttrade&c=apps
- [M] Project note on Kalshi (parallel workflow, not re-verified here): `docs/research/08-venues-polymarket-kalshi.md`

---

## 14. Not found

- Any SaltTrade website, app-store listing, developer docs, API, WebSocket, SDK, ToS, privacy policy, fee schedule, list of eligible states, or launch date (searched: Tribe site, Kalshi blog, six news write-ups, Shift pages, App Store search API, Google Play search, five candidate domains, one extended web search; search budget then exhausted).
- Which legal entity names the parent "Tribal-owned enterprise", and whether the Tribe holds its own CFTC letter beyond Letter 26-25.
- Whether customers hold a Kalshi account, a SaltTrade account or an FCM account; who pays what fee to whom.
- Any SaltTrade volume, user count or market list.
- Post-launch news after 2026-09-19 (not searchable after the budget ran out).

## 15. Open questions

- Is the app downloadable by the public as of today, and in which states? (Check App Store/Google Play by exact name again in a few weeks, or watch the Tribe's and Kalshi's news feeds.)
- Does the Tribe's no-action reliance survive state challenges (Louisiana or others)? Not researched.
- Will SaltTrade add a second Registrant (second venue) as the PSP letter permits?

## 16. Embedded-instruction / suspicious content log

- None of the pages read contained text addressed to AI agents or instructions to follow.
- `salttrade.io` served a one-line HTML page redirecting by JavaScript to `/lander` (typical parked-domain behaviour). I did not follow the redirect and do not attribute the domain to the Tribe.
