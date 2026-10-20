# ROLR (High Roller Technologies) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch of the official rolr.com pages, a few plain GETs of rolr.com (generic User-Agent `insurance-markets-research/0.1`), WebFetch of one SI.com article and of StockTitan press-release mirrors, and cross-reference to the in-repo OG.com / CDNA note. No account, sign-up, wallet, key, signature, POST/PUT/DELETE, payment or browser automation. All third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source (aggregator mirror of a press release, SI article, WebFetch-summarised page) or inference; **L** = weak, stale or from memory. "(wf)" = read through the WebFetch summariser, not as raw text.

Method caveats (honest list):
- WebSearch was out of budget for this task, so there is no search-engine corroboration. I made one WebFetch call to a Google results URL; it returned an error page with no results and I did not pursue it.
- I made one guessed-path GET (`https://rolr.com/api/markets`, HTTP 404) and one DNS check (`api.rolr.com` does not resolve). Nothing else was probed.
- The contest PDF (`ROLR-FTT-rules-winners.pdf`) was downloaded but its text could not be extracted (compressed fonts, no poppler). NOT READ.

---

## Verdict

- **kind:** broker-or-frontend. ROLR US LLC is a CFTC-registered **guaranteed introducing broker** (NFA member) that introduces customers to **North American Derivatives Exchange, Inc. d/b/a Crypto.com | Derivatives North America (CDNA) / OG Prediction Markets**. It is not an exchange, has no order book of its own, no chain, no public API. (H for the IB/exchange statement from rolr.com terms; M for the details from press releases.)
- **Status:** **closed beta / waitlist**, not generally live. Commercial launch "targeted for late October 2026" (company press release, M). still_live = true as a company/product in pre-launch; there is nothing to trade or read for the public today.
- **Not an independent arbitrage leg.** Every contract is a CDNA contract: liquidity is shared with OG.com and every other CDNA distributor (DraftKings Predictions, FanDuel Predicts, Fanatics Markets, Robinhood, Underdog). See `docs/research/venues/og-crypto-com-nadex.md`.
- **Adapter priority: skip.** No API, closed beta, duplicate liquidity. Cover the CDNA book through the OG.com adapter. Optional later: record ROLR's own fee/markup (if any) as a per-front-end fee profile once it launches.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://rolr.com` | HTTP 302 to `https://rolr.com/beta`; page title "ROLR - Request beta access", meta description "ROLR is a prediction trading platform in closed beta ... Apply for early access", `robots: noindex, nofollow`. Email-capture waitlist form plus "Sign in" for existing beta testers. Footer "(c) 2026 ROLR US LLC". Fetched 2026-10-19 | H |
| `rolr.com/robots.txt`, `/sitemap.xml` | both 302 to `/beta` (no robots file served) | H |
| Risk-disclosures page | placeholder, "last updated October 6, 2026", contains a developer TODO that the approved legal text is still to be supplied before the page goes live (https://rolr.com/beta/legal/risk-disclosures) (wf) | H |
| Closed beta started | High Roller press release 2026-09-15 (via StockTitan mirror): invitation-only closed beta covering onboarding, identity verification, geolocation, funding, market discovery, order entry, trading, position management, settlement, withdrawals; "not open to the general public"; commercial launch "targeted for late October 2026" (wf) | M |
| SI.com | "ROLR prediction market is currently in its waitlist phase" (https://www.si.com/prediction-markets/usa/apps, item 14); promo page dated 2026-10-14 says "currently waitlist-only", offer expiry "TBD", no launch date (https://www.si.com/prediction-markets/promos/rolr-prediction-market-promo-code) (wf) | M |

**Verdict:** pre-launch (closed beta + waitlist) as of 2026-10-19. A public launch within days to weeks is plausible but unconfirmed.

---

## 2. Kind and market model

- **Kind:** introducing-broker front end (app and web) for CDNA event contracts. The app is built by DeepEther Labs on the mrkts.com B2B prediction-markets platform and connects to CDNA over FIX (08/13/2026 press release, via StockTitan, wf, M). Whether ROLR runs any matching of its own: "Not disclosed" in that release (NOT FOUND); the IB press release says the FCM "carries customer accounts and handles transaction processing, custody" (M), so there is no ROLR-side book.
- **Market model (inherited from CDNA, M here; H in the OG note):** fully-collateralised binary Yes/No event contracts, $1 payout, central limit order book at the exchange, no outcome tokens. SI expects "Yes" and "No" buttons in the app (wf, M).
- **Categories advertised on rolr.com (H):** Sports, Politics, Entertainment, Crypto, Weather, Esports, Awards Shows, Pop Culture. SI lists NFL, NBA, NHL, NCAA, soccer, golf, tennis, F1 as expected (M, "expected", not confirmed). Which CDNA contracts ROLR will actually expose: NOT FOUND (searched: rolr.com pages, SI article, press releases).

---

## 3. Chains and collateral

- Chains: **none**. rolr.com says nothing on chains or collateral (H, absence). Funding is account funding at the guaranteeing FCM, which "carries customer accounts ... custody" (IB press release 2026-06-26, wf, M).
- Collateral: USD at the FCM / CDNA (see OG note section 3 for segregation and the US-only Mesh crypto-to-cash deposit route). ROLR-specific funding methods: NOT FOUND (searched: rolr.com pages, press releases).
- Guarantor FCM per the IB release: "OG Markets US, Inc. (formerly Foris DAX Markets, Inc.), doing business as Crypto.com FCM" (M, wf of a mirror). The OG note records "Foris DAX FCM LLC (d/b/a OG Broker)" from og.com/clearing-members. Name mismatch is probably a rename or summariser artefact; unresolved (see open questions).

---

## 4. Read API

- **None.** exists = `none`. No docs, API, developer, GitHub or social links on rolr.com (H; the full link list of `/beta` is: `/beta`, `/?beta`, `/beta/terms`, `/beta/privacy`, `/beta/do-not-sell`, `/beta/legal/risk-disclosures`, `/beta/assets/ROLR-FTT-rules-winners.pdf`). SI says nothing about an API; the three High Roller releases I read mention none (wf).
- The page HTML (Next.js app under `/beta`) contains no API host; the only external host is Google Tag Manager (H).
- **No fixtures saved** (no public ROLR API to sample).
- **For the aggregator:** read the underlying CDNA data instead. The keyless public REST API (`https://api.crypto.com/fcm/v1/public/get-events|get-instruments|get-tickers|get-book|get-trades|...`, docs https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction) is documented in `og-crypto-com-nadex.md` with fixtures in `docs/research/fixtures/og-crypto-com-nadex/`. I re-confirmed it answers today (`public/get-events?limit=1` returned a CFB event with `last_updated_time` 1792352745771000000 ns, 2026-10-19) (H).

---

## 5. Trade path

- **ROLR: none for programmatic access.** The only trading surface is the ROLR iOS/Android/web app (expected) for KYC'd US users; no API key flow, no signing scheme is described anywhere I could read (NOT FOUND, searched: rolr.com pages incl. terms, SI, three press releases).
- **Underlying CDNA path (M here, H in OG note):** orders are HMAC-signed requests (`private/create-order`) from an FCM-onboarded USD account in "private beta", or FIX via intermediating members. ROLR connects over FIX through DeepEther (M). Customer API access to the CDNA FCM for ROLR customers is not described.

---

## 6. PayBox reachability: **no**

A PayBox EVM/Solana wallet cannot trade this. There is no on-chain contract, no EIP-712 or wallet-signed order, no transaction to propose. Access requires ROLR account creation with US identity verification and geolocation, a USD account at a US FCM, and an app session (H/M above). Not tested against PayBox's catalog for ROLR specifically; the OG note's PayBox `discover_*` queries (2026-10-19) found no OG/CDNA route (H there). At best a US user could fund via a crypto-to-cash on-ramp, which is funding, not trading from the wallet.

---

## 7. Fees

- **ROLR's own fee schedule: NOT FOUND.** rolr.com terms state no fees ("The page does not state any fees, commissions, or pricing", wf of https://rolr.com/beta/terms); SI: "ROLR's fee structure hasn't been publicly confirmed" (wf, M).
- **Revenue model:** ROLR US "earn[s] revenue through a revenue-sharing arrangement tied to customer activity" (IB release, 2026-06-26, wf, M), so ROLR does not necessarily add a separate customer fee; this is unconfirmed.
- **Underlying CDNA/OG US fee for most markets (from the OG note, sourced to https://help.og.com/en/articles/12958828-fees-limits dated 2026-09-15; M here, H there):** taker `0.07 x C x P x (1 - P)`, maker `0.0175 x C x P x (1 - P)`; crypto/FX/index ladders `$0.02` per contract; settlement fee waived. Whether ROLR customers pay the same: unknown. The scanner should hold a per-front-end fee profile and default ROLR to "unknown, assume at least the OG schedule".

---

## 8. Resolution mechanism and dispute risk

- Contracts are "listed, priced, and cleared by the Exchange" (CDNA) (H, https://rolr.com/beta/terms, wf). Resolution is therefore CDNA's rulebook process: exchange-determined against a named source agency, discretionary corrections allowed, 48-hour cancel rule paying one-week VWAP, ties at $0.50, soccer 90 minutes only. Full detail and sources in `og-crypto-com-nadex.md` section 8 (M here).
- ROLR-specific settlement/dispute text: NOT FOUND (the Customer Agreement and risk disclosures are not published; the disclosure page is a placeholder). Disputes with ROLR under the site terms: Delaware law, good-faith negotiation then AAA arbitration in Delaware, class actions waived (H, wf).
- Arbitrage risk is the same as for CDNA: rule mismatches versus Kalshi / Polymarket on every pair.

---

## 9. Geo, ToS, automation

- **Geo (H, https://rolr.com/beta/terms and the landing page, wf):** not available to persons physically located in **Arizona, Illinois, Maryland, Massachusetts, Michigan, Nevada, New Jersey or Ohio**. Eligibility: 18+ (or state age of majority), US citizen or legal resident; waitlist signup does not confirm eligibility. **Conflict:** SI says "All states (excl. Nevada)" and "expected" in California, Florida, Georgia and Texas (wf, M); the company's own list is longer and should be preferred. State list may change at commercial launch.
- **Automation (H, short quote):** the site terms prohibit "use bots, scrapers, or other automated means to access the Site or extract data from it" (https://rolr.com/beta/terms, wf). Trading-related automation / API rules live in the Customer Agreement, which is not public (NOT FOUND). Scraping rolr.com is therefore disallowed by ToS and pointless (no market data is exposed pre-launch).
- Terms stack: Site Terms (beta), Privacy Policy, "Important Risk Disclosures" (placeholder), separate Terms of Service / Customer Agreement at account creation (H, wf).
- Corporate: ROLR US LLC is a wholly owned subsidiary of High Roller Technologies, Inc. (NYSE: ROLR), Las Vegas, NV; NFA member, guaranteed IB approved 2026-06-26 (IB release, wf, M). CDNA is the exclusive contract provider "for the initial 24 months" through High Roller's US platform (same release, wf, M). The rolr.com and privacy pages themselves never name High Roller Technologies (H, wf); the link rests on the press releases and SI (M).
- **Related-party note (M):** three High Roller directors hold interests in DeepEther Labs, the platform vendor (08/13/2026 release, wf).

---

## 10. Liquidity

- **ROLR-specific volume / OI / TVL: NOT FOUND.** No figures on rolr.com, SI, or in the three releases read (the 09/02 release explicitly gives no beta metrics) (wf). No customers can see markets publicly yet.
- **Underlying CDNA liquidity (from the OG note; snapshot 2026-10-19, M here):** rolling 24h about $6.13M face across listed binaries (lower bound; sports $6.00M, one NFL game $4.97M, politics $72k, crypto ladders $47k); The Block data hub shows `nadex` weekly notional about $230M for the week to 2026-10-12 (metric undefined). Open interest: not exposed by the API. ROLR would add retail flow to that book, not new independent liquidity.

---

## 11. Event coverage and overlap

Whatever ROLR lists will be a subset of CDNA's catalogue (M). Overlap with other venues is therefore the CDNA overlap: sports moneylines / spreads / totals / props (high overlap with Kalshi, Polymarket, Gemini, Underdog), US politics (Senate, House, 2028), Fed decisions, crypto price ladders, with the settlement-rule caveats in the OG note. Weather and esports are advertised by ROLR; CDNA coverage of weather is minimal (one climate event in the OG crawl), so those may be thin or placeholder. No ROLR-original markets are indicated.

---

## 12. Liquidity sharing (is it an independent leg?)

**No.** Shared with CDNA / OG.com and all other CDNA distributors (H for ROLR's own statement that the Exchange lists, prices and clears the contracts; M for "exclusive provider" and FIX connectivity). Treat as `shared_with: og-crypto-com-nadex`. Do not count ROLR as a second leg against an OG quote.

---

## 13. Adapter priority: **skip**

- Dead-end for an adapter: closed beta, no API, no public data, automation barred by site terms, duplicate of the OG/CDNA adapter, not PayBox-reachable.
- Revisit only if (a) ROLR launches with its own distinct pricing or fee markup that matters for net-edge calculations (add a fee profile), or (b) ROLR publishes a developer API (unlikely given the IB model).

---

## 14. Not found / open questions

- ROLR fee schedule and whether it differs from OG's direct schedule.
- Exact commercial launch date and final state list.
- Whether ROLR orders rest in the same CDNA book as OG.com retail (OG note also open on this).
- Guarantor FCM naming: "OG Markets US, Inc. d/b/a Crypto.com FCM" (IB release mirror) versus "Foris DAX FCM, LLC (d/b/a OG Broker)" (og.com/clearing-members). Primary-source check needed (e.g., the original GlobeNewswire release or NFA BASIC).
- High Roller Technologies' acquisition of ROLR.com on 2026-05-01 comes only from SI (M); I did not find a primary press release.
- Contents of the contest PDF ("ROLR $25M Challenge - Winners and Official Rules", per PDF metadata via wf): unread. It indicates a pre-launch free-to-trade contest (rolr.com says "archived rules and winners").
- Customer Agreement, risk disclosures, and any API/automation clauses at account level.

---

## 15. Suspicious / embedded-instruction content

None found in the rolr.com pages, privacy/terms pages, SI articles or StockTitan summaries I read. (The only anomaly: the rolr.com risk-disclosures page contains a developer "TODO for counsel" placeholder; it is not an instruction aimed at an AI and was not acted on.)

---

## Sources

1. https://rolr.com and https://rolr.com/beta (title, meta, waitlist form, link list, CFTC/NFA/exchange text; fetched 2026-10-19, raw HTML and wf) (H)
2. https://rolr.com/beta/terms (exchange, geo, eligibility, bots clause, Delaware arbitration) (wf, H)
3. https://rolr.com/beta/privacy (entity names; no mention of High Roller Technologies) (wf, H)
4. https://rolr.com/beta/legal/risk-disclosures (placeholder dated 2026-10-06) (wf, H)
5. https://rolr.com/beta/assets/ROLR-FTT-rules-winners.pdf (downloaded, text not extracted; title only from wf) (NOT READ)
6. https://www.si.com/prediction-markets/usa/apps (item 14: waitlist phase) (wf, M)
7. https://www.si.com/prediction-markets/promos/rolr-prediction-market-promo-code (dated 2026-10-14; waitlist-only; CDNA / Crypto.com collaboration; acquired ROLR.com 2026-05-01; states; no API) (wf, M)
8. https://www.stocktitan.net/news/ROLR/ (index of High Roller Technologies (NYSE: ROLR) releases, 2026-08 to 2026-10) (wf, M)
9. https://www.stocktitan.net/news/ROLR/high-roller-technologies-awarded-guaranteed-introducing-broker-t91vginamuu3.html (2026-06-26: NFA membership, guaranteed IB, CDNA exclusive 24 months, revenue share) (wf, M)
10. https://www.stocktitan.net/news/ROLR/high-roller-technologies-secures-exclusive-prediction-markets-e32ol09temxm.html (2026-08-13: mrkts.com / DeepEther Labs licence, FIX connectivity to CDNA) (wf, M)
11. https://www.stocktitan.net/news/ROLR/high-roller-technologies-announces-rolrtm-prediction-markets-kmhwlwlpw359.html (2026-09-02: beta 09-15, commercial launch end of October) (wf, M)
12. https://www.stocktitan.net/news/ROLR/high-roller-technologies-launches-beta-version-of-rolrtm-prediction-li7yjf6ribli.html (2026-09-15: closed beta scope) (wf, M)
13. https://og.com/clearing-members and https://og.com/company-news (ROLR not named; one clearing member listed) (wf, H for absence)
14. https://api.crypto.com/fcm/v1/public/get-events?limit=1 (liveness of the shared CDNA API, 2026-10-19) (H)
15. In-repo: `docs/research/venues/og-crypto-com-nadex.md` (CDNA/OG spec, fees, resolution, liquidity; its external claims are M here)

Fixtures: none (no public ROLR API; CDNA samples are in `docs/research/fixtures/og-crypto-com-nadex/`).
