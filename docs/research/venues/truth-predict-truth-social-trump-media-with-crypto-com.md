# Truth Predict (Truth Social / Trump Media with Crypto.com) - venue spec

Researched 2026-10-19 (probes ran about 01:30-01:50 UTC). READ-ONLY: public web pages and press releases (WebFetch, curl with the generic User-Agent `insurance-markets-research/0.1`), the public SEC EDGAR full-text-search endpoint, static reading (never executed) of Truth Social's own public JS bundle, and two read-only PayBox `discover_*` queries. No account, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary ("wf" = read through the WebFetch summariser, not raw text), or my inference from first-hand data; **L** = weak or stale.

Search note: the session's WebSearch budget was exhausted after the first query (it returned only Oct 2025 announcement coverage), so there is no search-engine corroboration for 2026 events. Everything below comes from fetched pages.

Fixtures: `docs/research/fixtures/truth-predict-truth-social-trump-media-with-crypto-com/` (section 13).

---

## 0. Bottom line

1. **"Truth Predict" is not a venue. It was announced (2025-10-28) as a Truth Social front end for Crypto.com's CFTC-regulated exchange (CDNA, now branded OG.com), and the direct integration was cancelled on 2026-08-07.** Both companies' joint release: "Rather than develop a direct prediction market integration on Truth Social, the companies will pivot to a marketing agreement under which Crypto.com's prediction markets experiences will be marketed to the Truth Social user base." (H, https://www.pressviewer.com/profiles/investor/NewsPrint.asp?v=7&b=2660&ID=168802&m=rl&g=1953; same title on https://crypto.com/en/company-news, dated 8 Aug 2026 there).
2. **No liquidity of its own, no API, no terms, no trade path.** Whatever trades happen are CDNA / OG.com contracts on the CDNA central limit order book. That book is already specified in `docs/research/venues/og-crypto-com-nadex.md` (P0 read adapter). A "Truth Predict" adapter would duplicate it.
3. **The Truth Social web app does carry a prediction feed** (read-only odds cards whose "Yes %" chips open an `affiliate_url` in a new tab) behind a per-account `features.predictions` flag. That is a referral surface, not a venue (H for the code, M for what viewers see; section 2).
4. **adapter_priority = skip.** If anything is worth keeping, it is the OG.com / CDNA adapter, not this one.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Announcement | 2025-10-28: Trump Media (TMTG) to add prediction markets to Truth Social via Crypto.com's U.S. derivatives arm (Derivatives North America); product "Truth Predict"; beta first, then US rollout, international "depends on regulatory approvals"; "Truth gems" convertible to CRO for use on contracts (https://www.coindesk.com/markets/2025/10/28/trump-media-taps-crypto-com-to-launch-prediction-markets-on-truth-social, wf) | M |
| Secondary coverage 2025-10-29 | Covers.com piece on Yahoo Finance; Analytics Insight says "limited beta will start in the U.S." and "uses CDNA's event-contract model" (wf) | M |
| Feb 2026 | The Block, 2026-02-03: Crypto.com "has a deal to power branded prediction markets for Truth Social"; does not name Truth Predict; main subject is the OG app launch (wf) | M |
| Q1 2026 10-Q (filed 2026-05-08, period 2026-03-31), MD&A "Truth Predict" section | "While Truth Predict remains in development," TMTG expects that at launch it will mainly involve marketing and promotion work with OG.com; Note 16 lists Truth Predict inside the Media segment's Truth Social advertising offerings, with no separate revenue (https://www.sec.gov/Archives/edgar/data/1849635/000114036126020229/ef20070602_10q.htm, wf, text offset 40000) | H (wf) |
| **2026-08-07 joint press release** | Direct integration dropped; replaced by a marketing agreement; no financial terms, duration or product name given. "Truth Predict" is not named in the release (raw text saved as a fixture) | **H** |
| Same day, separate release | Crypto.com, TMTG and Yorkville end the proposed CRO treasury combination and the ETF servicing partnership (https://www.pressviewer.com/profiles/investor/NewsPrint.asp?v=7&b=2660&ID=168803&m=rl&g=1953, wf) | H (wf) |
| Crypto.com's own prediction pages | https://crypto.com/en/prediction and https://crypto.com/en/prediction/partners do not mention Truth Social or Trump Media; the partners page names Underdog and Fanatics only (wf, 2026-10-19) | H (wf) |
| Domain | `truthpredict.com` returns 307 to a GoDaddy "for sale" parking page (H, curl 2026-10-19) | H |
| Other repo note | `docs/research/venues/fanatics-markets.md` records a nextpredict.io "Truth Predict page 404" | M |
| Truth Social itself | `https://truthsocial.com/` and `help.truthsocial.com` return Cloudflare 403 to scripts; `/predict` returns the same 2,162-byte SPA shell as a random nonexistent path (byte-identical), so it proves nothing (H) | H |

Verdict: **still_live = false** for "Truth Predict" as a distinct trading venue or product. Unknown (not testable without a Truth Social login): whether the in-feed odds cards are currently shown to users. The web bundle serving them was last modified 2026-10-07 (the `/predict` shell's `last-modified`), two months after the cancellation, and still contains the prediction code (H for code, M for user-visible behaviour).

---

## 2. Kind and market model

- **Kind:** `broker-or-frontend`, degraded to **marketing / referral surface**. TMTG's own filing language: "marketing and promotion work with OG.com" (H wf).
- **What the Truth Social web app actually contains (H, static reading of https://truthsocial.com/assets/index-Bm49P7e2.js and three lazy chunks, 2026-10-19; excerpts in the fixture):**
  - Authenticated Mastodon-fork API paths `/api/v1/predictions/statuses`, `/statuses/{id}`, `/statuses/{id}/descendants`, `/events/{id}/graph` (price chart datapoints), `/categories`. A per-account `features.predictions` flag gates it.
  - Prediction object: `id, title, event_date, type, status, closed_date, category, subcategory_display_name, contracts[], venue?, thumbnail`. Contract: `id, title, event_id, yes, no, chance, status, type, icon_abbrev, icon_colors, thumbnail, affiliate_url`. Prices are decimals rendered to 2 dp and shown as a percentage chip.
  - The chip is an anchor: `href: e.affiliate_url, target: "_blank"`. **There is no order-entry code, no order-book endpoint and no wallet or KYC chunk in the bundle** (grepped; 208 lazy chunks listed, none named for trade, wallet, market or KYC).
  - Contract `type` strings include `Moneyline` and `Moneyline (3-Way)`, which are the same labels as OG's `PREDICT_CONTRACT_TYPE` metadata (see the OG note). Combined with the TMTG filing, this is consistent with the cards being fed from the CDNA / OG instrument universe (M inference; the `venue` field's value and the `affiliate_url` target were not observed).
  - The account schema carries `cdna: {member_id, onboarded_status: none|active|failed}`, i.e. the original plan to onboard Truth Social users as CDNA members was at least partly built into the account model. Nothing else in the bundle uses it (single grep hit). Whether it is dead code is M.
- **Market model (inherited from CDNA, not from Truth Predict):** fully collateralised binary event contracts on a central limit order book, $0.01-$0.99, $1 payout; one binary instrument per outcome; no on-chain tokens, no AMM, no parimutuel (H in the OG note). Nothing Truth-specific.
- **Announced model that never shipped (M):** contracts bought with CRO obtained by converting "Truth gems" (in-app rewards) (CoinDesk, Analytics Insight). No document says this was built; the 2026-08-07 release says the direct integration will not be.

## 3. Chains and collateral

- None of its own. The underlying exchange is **USD-collateralised, off-chain** (OG note section 3; funds at BMO Harris and Fifth Third; optional US-only crypto-to-USD deposits through Mesh).
- The announced CRO / Truth-gems funding path (M, Oct 2025) is unverified as built and now moot given the cancelled integration. TMTG's June 2026 10-Q does show it holds Cronos as a treasury asset (756,079,523 CRO at 2026-06-30, wf), which is unrelated to trading mechanics.

## 4. Read API

- **Truth Predict: none.** No docs, no OpenAPI, no developer page, no subgraph. NOT FOUND (searched: truthsocial.com [403], help.truthsocial.com [403], truthpredict.com [parked for sale], tmtgcorp.com, ir.tmtgcorp.com press page [no list rendered], crypto.com company news, og.com company-news [no Truth mention in the 1.4 MB page], crypto.com/en/prediction and /partners, the Truth Social JS bundle).
- **Truth Social's internal feed endpoints** (`/api/v1/predictions/*`) are undocumented, authenticated and behind Cloudflare. One unauthenticated GET of `/api/v1/predictions/categories` returned **403 Cloudflare challenge**; I did not try to get around it (H, fixture `probe_results`). Not integrable, and it would only duplicate CDNA prices.
- **The real price source is OG.com's keyless public API** (`https://api.crypto.com/fcm/v1/public/{get-events,get-instruments,get-tickers,get-book,get-trades,...}`, 100 req/s per IP, docs https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction). Full spec, response shapes and fixtures are in `docs/research/venues/og-crypto-com-nadex.md` and `docs/research/fixtures/og-crypto-com-nadex/`. I did not re-fetch them: no new information for this venue. No fixture of a Truth Predict response exists because none is obtainable.

## 5. Trade path

- **None.** The web bundle has no order code; chips link out. Programmatic trading of the underlying CDNA contracts needs an FCM-onboarded OG / Crypto.com account with an HMAC API key and conformance sign-off (OG note section 5). Truth Social adds nothing.

## 6. PayBox reachability: **no**

- No signed-order or transaction-proposal surface exists for Truth Predict. The underlying exchange is USD, KYC, HMAC-keyed (OG note section 6).
- PayBox catalog (read-only, 2026-10-19): `discover_plugins` for "Truth Predict Truth Social prediction markets" returned `[]`. `discover_services` for "Truth Social Crypto.com prediction market" returned unrelated third-party x402 data services (Polymarket / Hyperliquid readers); none called, no 402 payment requirements recorded (H).

## 7. Fees

- **Truth Predict:** NOT FOUND (no fee page; the integration that would have set one was cancelled). The affiliate arrangement's economics are undisclosed ("The release doesn't disclose financial terms").
- Users clicking through land on Crypto.com / OG.com, where the exchange's fees apply. The OG help-centre formula (US, most markets): taker `0.07 x C x P x (1 - P)`, maker `0.0175 x C x P x (1 - P)` per contract; `$0.02` per contract for crypto, FX, commodities and equity indices (OG note section 7; help.og.com dated 2026-09-15). Fees in the Crypto.com app were not separately verified here (L).

## 8. Resolution mechanism and dispute risk

- Not Truth-specific. Contracts are resolved by the exchange (CDNA / OG.com) against named source agencies under the OG rulebook (dated 2026-10-13); discretionary adjustment and a 48-hour cancel rule apply (OG note section 8). Truth Social / TMTG is not described anywhere as resolving or guaranteeing anything.

## 9. Geo, ToS, automation

- Crypto.com's prediction page: "Currently only available in the United States" and subject to jurisdictional limits (wf, https://crypto.com/en/prediction). The Oct 2025 announcement also said US first, international subject to approvals (M).
- Truth Social Terms of Service and any prediction-specific disclosures: NOT FOUND (searched: truthsocial.com and help.truthsocial.com return Cloudflare 403 to scripts; the bundle contains no disclaimer string for predictions beyond the generic `disclaimer` field on ads). I did not try to bypass the block.
- Automation: no API to automate. Scraping an authenticated, Cloudflare-fronted social feed would be a ToS and anti-bot problem for no information gain. Do not.
- `https://truthsocial.com/robots.txt` returned an empty 200 (last-modified 2026-10-16) (H).

## 10. Liquidity

- **Truth Predict-specific volume, OI or TVL: none exists / NOT FOUND.** TMTG reports no separate revenue (Q1 2026 10-Q Note 16, wf). The Q2 2026 10-Q (filed 2026-08-10) also matches "Truth Predict" in EDGAR full-text search, but the portion I could read through the summariser did not contain the passage, so its wording is unread.
- Context for the real book: OG / CDNA rolling 24h about $6.13M face (lower bound, single snapshot 2026-10-19) and The Block's week-to-2026-10-12 Nadex notional of 230,038,044 (metric undefined) (OG note section 10; M).

## 11. Event coverage and overlap

- Announced: US elections, Fed rate decisions, inflation, gold / crude oil, "events across all major sports leagues" (Oct 2025 coverage, M). In-feed cards carry sports-game scoreboard types (nba, nhl, mls, mlb, nfl, cbb, cwbb, soccer, cfb ...) in the bundle schema (H).
- These are the CDNA / OG categories; overlap with Kalshi / Polymarket is high (see OG note section 11). It is exactly the same event set, so no additional overlap is created by this entry.

## 12. Liquidity sharing

- **100% shared with Crypto.com | Derivatives North America (CDNA), now OG.com Markets.** Not an independent arbitrage leg. Treat any price seen via Truth Social, Crypto.com app, Fanatics, DraftKings, FanDuel, Underdog (CDNA portion) or Robinhood as `shared_with: og-crypto-com-nadex`.

## 13. Adapter priority: **skip**

Rationale: not a venue (front end turned referral link), integration cancelled 2026-08-07, no API, no trade path, no standalone liquidity, authenticated and Cloudflare-blocked feed, duplicate of the OG / CDNA book that already has a P0 read adapter spec. One cheap check could revisit this: if TMTG later ships a real in-app trade flow (the `cdna.onboarded_status` field suggests the account model once expected it), it would still settle on the same CDNA book.

Fixtures (`docs/research/fixtures/truth-predict-truth-social-trump-media-with-crypto-com/`):
- `tmtg_crypto_com_realign_press_release_2026-08-07.txt` - raw text of the joint release (media-contact lines omitted).
- `truthsocial_web_bundle_prediction_excerpts_2026-10-19.json` - schema, endpoint and chip excerpts from the public JS bundle (static text; the only "response shape" obtainable).
- `probe_results_2026-10-19.json` - HTTP outcomes of the scripted probes (Cloudflare 403s, parked domain, identical SPA shell, SEC block).
- `edgar_fts_truth_predict_2026-10-19.json` - EDGAR full-text-search response for "Truth Predict" in 2026 (5 TMTG filings).

---

## 14. Not found / open questions

- Any Truth Predict API, docs, fee schedule, terms, disclaimers, or standalone volume. NOT FOUND (searched sites listed in section 4).
- What the `affiliate_url` targets (OG.com? Crypto.com app deep link?) and what `venue` contains. Needs an authenticated session; not attempted.
- Whether the in-feed prediction cards are visible to ordinary users today, and in the mobile apps (only the web bundle was read).
- Q2 2026 10-Q wording on Truth Predict and any subsequent-event note (filing text not reachable through the summariser; sec.gov/Archives refused the generic User-Agent: **blocked: requires a contact address**, skipped as instructed).
- The bitcoinfoundation 2026-04-29 article from the discovery hint ("planned platform") was not fetched. It is consistent with the Q1 10-Q ("remains in development").
- Q4 2025 / Q1 2026 beta: any beta launch between Oct 2025 and Aug 2026 is NOT FOUND in any source read.

## 15. Suspicious / embedded-instruction content (recorded, not followed)

None found in the portions read. I did not read the whole 1.9 MB Truth Social bundle line by line; I grepped it for prediction, venue, affiliate, Crypto.com and CDNA strings, and read the three prediction chunks. Mock social posts embedded in the bundle are test data with no instructions. The PayBox `discover_services` results (third-party x402 data services with USDC prices) are irrelevant catalog entries; not called.

---

## Sources

1. https://www.pressviewer.com/profiles/investor/NewsPrint.asp?v=7&b=2660&ID=168802&m=rl&g=1953 - "Crypto.com and Trump Media and Technology Group to Realign Integration Partnership to Marketing Agreement", 2026-08-07 (raw text read; H)
2. https://crypto.com/en/company-news/cryptocom-and-trump-media-and-technology-group-to-realign-integration-partnership-to-marketing-agreement - same release on Crypto.com's site, dated 8 Aug 2026 (wf; H)
3. https://www.pressviewer.com/profiles/investor/NewsPrint.asp?v=7&b=2660&ID=168803&m=rl&g=1953 - CRO treasury and ETF partnership update, 2026-08-07 (wf; H)
4. https://www.sec.gov/Archives/edgar/data/1849635/000114036126020229/ef20070602_10q.htm - TMTG Form 10-Q for the period ended 2026-03-31 (wf, MD&A and Note 16; H)
5. https://www.sec.gov/Archives/edgar/data/1849635/000143774926026777/djt20260630_10q.htm - TMTG 10-Q for the period ended 2026-06-30 (wf; digital-asset notes only; Truth Predict passage not reached)
6. https://efts.sec.gov/LATEST/search-index?q=%22Truth%20Predict%22&dateRange=custom&startdt=2026-01-01&enddt=2026-10-19 - 5 hits (H, fixture)
7. https://www.coindesk.com/markets/2025/10/28/trump-media-taps-crypto-com-to-launch-prediction-markets-on-truth-social - announcement coverage (wf; M)
8. https://finance.yahoo.com/news/truth-social-expands-prediction-markets-174900685.html and https://www.analyticsinsight.net/news/truth-social-launches-truth-predict-with-cryptocom - 2025-10-29 coverage (wf; M)
9. https://www.theblock.co/post/388292/crypto-com-og-prediction-markets-app-monthly-volumes-17-billion-super-bowl - 2026-02-03 (wf; M)
10. https://crypto.com/en/company-news, https://crypto.com/en/prediction, https://crypto.com/en/prediction/partners (wf; H for absence of Truth Social)
11. https://og.com/company-news (curl, grep for Truth / Trump: no mention; H for absence)
12. https://truthsocial.com/ , /robots.txt , /predict , /api/v1/predictions/categories , https://help.truthsocial.com/ , https://truthpredict.com (scripted GETs, 2026-10-19; H)
13. https://truthsocial.com/assets/index-Bm49P7e2.js plus lazy chunks `prediction-detail-CqWJ-zKX.js`, `usePredictions-Ds7ZT4PN.js`, `placeholder-prediction-cl_KSSwk.js` (static text only; H)
14. Repo notes: `docs/research/venues/og-crypto-com-nadex.md` (the real book, API, fees, rules), `docs/research/venues/fanatics-markets.md` (CDNA white-label, nextpredict Truth Predict 404)
15. PayBox `discover_plugins` / `discover_services`, 2026-10-19 (read-only; H)
