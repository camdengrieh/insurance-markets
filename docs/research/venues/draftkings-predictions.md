# DraftKings Predictions - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs, WebFetch page reads, SEC filings. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference; **L** = weak or stale.

Method limits that shape every section below:
- Every DraftKings-owned host (`predictions.draftkings.com`, `www.draftkings.com`, `sportsbook.draftkings.com`) returned **HTTP 403 from Akamai** to a plain `curl` (generic UA) and to WebFetch, including `/robots.txt`, `/sitemap.xml` and the terms page (fixture `akamai-403-homepage.txt`). I did not try to evade it (no browser impersonation, proxy or automation). So I could **not read the DraftKings site, its terms, its fee page or its availability page first-hand**; those facts are M (via NEXTPredict) and are marked.
- The strongest first-hand sources are DraftKings' own SEC filings (10-K filed 2026-02-13, 10-Q filed 2026-08-07), read through WebFetch (www.sec.gov refuses plain curl without a contact address: "blocked: requires a contact address"; `data.sec.gov` submissions JSON worked with the generic UA).
- The session's WebSearch budget ran out after the first query, so no news or regulatory search was possible after that. Gaps are listed in section 14.

---

## 0. Bottom line

1. **Live as of the latest evidence (Aug-Sep 2026), but I could not load the product itself.** Launched 2025-12-19 (H, 10-K). The 10-Q for the quarter ended 2026-06-30 (filed 2026-08-07) still lists "Prediction Markets" as an offering (H). NBC San Diego (2026-08-24) and NEXTPredict (2026-08-26) describe it as operating, including in California (M).
2. **It is a broker front end, not an exchange with its own book.** DraftKings Predictions is "registered with the CFTC as an introducing broker" and an NFA member (H, 10-K). Its 10-K names **Wedbush Securities** as the futures commission merchant, **CME** and **CDNA (Crypto.com | Derivatives North America)** as the exchanges/clearing organisations, and "CME's and CDNA's market makers" as the liquidity providers (H). Revenue is "introducing fees, paid by futures commission merchants" (H).
3. **So its liquidity is NOT independent.** Whatever a user trades there is a CME or CDNA contract. For arbitrage, the legs are CME and CDNA themselves. A DraftKings adapter would be a duplicate of those two. (A possible exception, DraftKings' own Railbird Exchange "DKEx", is unverified; see section 12.)
4. **No official API found; fiat-only; US-only; automation terms unreadable.** Not reachable from a PayBox EVM wallet.
5. **adapter_priority = skip.** Build CDNA and CME event-contract adapters (separate tasks) instead, if those venues are wanted. Revisit only if DKEx turns out to list its own contracts with a public feed.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| 10-K (FY2025, filed 2026-02-13): "DraftKings Predictions launched on December 19, 2025", standalone mobile app and web product | Launch confirmed | H (www.sec.gov/Archives/edgar/data/1883685/000188368526000013/dkng-20251231.htm, via WebFetch) |
| 10-Q (quarter to 2026-06-30, filed 2026-08-07): "Sports revenue includes online sportsbook, retail sportsbook, and Prediction Markets revenue"; prediction markets reporting unit exists; Railbird note | Still an operating line item as of 2026-06-30. Revenue is not broken out. | H (dkng-20260630.htm via WebFetch) |
| NBC San Diego, published 2026-08-24: available in California, announced June | Operating in Aug 2026 | M |
| NEXTPredict, published 2026-08-26: 48 states, volumes for Apr/May/Jul 2026 | Operating in Aug 2026 | M |
| Product site itself | 403 from Akamai, cannot confirm today | n/a |
| Anything after 2026-08-26 | NOT FOUND (searched: SEC filing list through 2026-09-25, which has no prediction-related 8-K; no news search possible) | |

Verdict: **still_live = true** (medium-high). No shutdown, injunction or withdrawal found, but the latest first-hand datapoint is the 2026-08-07 10-Q.

---

## 2. Kind and market model

- **Kind:** regulated US retail broker/front end (introducing broker) for CFTC-regulated event contracts. Not a protocol, not a DEX. (H)
- **Contracts:** binary YES/NO event contracts that settle at $1.00 or $0 and "can be sold before resolution"; prices $0.01 to $0.99 (M, NEXTPredict; the fee bands in section 7 also run $0.01-$0.99). Sports (game results and player stats), crypto, politics, economics, finance, culture, climate (M).
- **Order book vs AMM:** the contracts are exchange-listed on CME or CDNA, so the underlying price discovery is the exchange central limit order book with market makers (H that CME/CDNA market makers provide the liquidity; M that the structure is a CLOB, my inference). Whether DraftKings shows a depth ladder or only best bid/ask and market/limit orders: NOT FOUND (site unreadable).
- **Categorical/scalar:** not documented. Apify's scraper output lists markets "with their priced outcomes" including American/decimal odds and `points` (spread/total style lines) (M, untrusted third-party page), suggesting DraftKings presents sportsbook-style spreads and totals as strike ladders of binary contracts. Not verified.
- **Outcome tokenisation:** none. Positions are futures/event-contract positions held through the FCM (Wedbush); no on-chain or transferable token. (M, inference from the IB/FCM structure.)
- **Market identifiers:** Apify's page says event URLs look like `/event/<eventId>` and lists fields `eventId`, `marketId`, `leagueId`, `sportId` (M, untrusted). The underlying exchange contract symbols (CME/CDNA) were not found.

---

## 3. Chains and collateral

- **No chain.** Collateral is US dollars held at the FCM. Funding by Apple Pay, debit card and bank transfer; "isn't crypto-friendly" (M, NEXTPredict).
- No token, no wallet connection, no on-chain settlement. (H for the regulatory structure; M for the funding methods.)

---

## 4. Read API

- **Official API: none found.** The 10-K says nothing about API access (H, as far as the excerpts read). NEXTPredict: "None mentioned" (M). A WebSearch for "DraftKings Predictions API developer documentation" (the only search that ran) found only third-party scrapers and no DraftKings developer portal (M). SharpAPI claims DraftKings has no public API (vendor claim, L).
- **Unofficial:** an Apify actor (`hypebridge/draftkings-predictions`) scrapes "publicly displayed" markets and odds and says its requests use "browser TLS impersonation" and fall back to proxies when blocked (M, untrusted third-party page). That indicates there is an internal JSON API used by the web app, behind bot protection. I did not locate or call it, and I recommend not building on it: it would need bot-protection evasion and likely conflicts with the ToS (not readable, see section 9).
- **Websocket:** NOT FOUND.
- **Where the real read APIs are:** the underlying exchanges (CME market data; CDNA via Crypto.com). River Markets' docs list "Crypto.com (CDNA)" as a supported exchange (see `docs/research/14-platform-of-platforms.md`, H on that doc's reading). Those are separate venue tasks.
- Fixtures: no public read API exists, so no response samples. Saved instead: `akamai-403-homepage.txt` (the 403 evidence) and `sec-edgar-draftkings-filings.json` (filing list used for provenance).

---

## 5. Trade path

- **Programmatic order placement: none** offered by DraftKings (no API, session-based app/web login, KYC). (M; absence of docs)
- Only programmatic routes to the same liquidity are via the exchanges' own members/FCMs (CME FIX/MDP through an FCM; CDNA via Crypto.com or an aggregator such as River). Out of scope for this venue.

---

## 6. PayBox / EVM wallet reachability

**no.** Fiat USD only, US residents in permitted states, KYC'd account at a CFTC-registered introducing broker with an FCM. No wallet connect, no signed orders, no on-chain transaction proposal can place a trade. A PayBox card credential could in theory fund a human account, but that is a manual consumer flow, not an agent trade path, and automation terms are unknown. (M/inference)

---

## 7. Fees

All M (NEXTPredict summary of `draftkings.com/predictions-terms`, which I could not open):
- Transaction fee: **$0.01 to $0.03 per contract bought or sold**.
- CDNA and DKEx exchange fee by contract price: $0.01 for $0.01-$0.19, $0.02 for $0.20-$0.96, $0.03 for $0.97-$0.99.
- CME contracts: $0.02 per contract per side.
- Worked example on the page: 50 contracts at $0.50 = $50 + $2 fees = $52. It is unclear whether the "transaction fee" and "exchange fee" are the same charge or stack (the bands coincide), so treat the all-in fee as $0.01-$0.03 per contract per side until the terms page is read. For an arbitrage scanner this is a large cost near the tails: $0.03 on a $0.97 contract is about 3%.
- Payer: the customer. DraftKings itself earns "introducing fees, paid by futures commission merchants" (H, 10-K).
- Deposit/withdrawal fees: NOT FOUND.

---

## 8. Resolution and dispute risk

- Resolution is by **the listing exchange's contract rules**, not by DraftKings. Settlement sources named by NEXTPredict: **Nadex for crypto** and **CME Group for stock indices, commodities and economic data** (unemployment rate, non-farm payrolls, federal funds rate) (M). Sports and politics settlement sources: NOT FOUND.
- CME and CDNA "have discretion to adopt, interpret and enforce rules governing product listing" (H, 10-K), so rulebook-level edge cases (voids, corrections, delayed settlement) are decided by the exchange.
- Dispute/void asymmetry versus other venues is the main arbitrage risk: the same real-world outcome can settle under different rules on Kalshi/Polymarket and CME/CDNA. Needs per-contract rule matching.
- **Legal/continuity risk (H, 10-K and 10-Q):** "numerous lawsuits challenging the CFTC's exclusive jurisdiction over event contracts"; "we may not be able to continue to offer certain event contracts"; regulators could require DraftKings to stop offering products. The 10-K also says state actions to block CFTC-regulated event contracts may not be preempted by the CEA, and that "the CFTC proposed a rule amendment, which was withdrawn in February 2026". Sports contracts are the most exposed.

---

## 9. Geo, ToS and automation

- US only; 18+ (not 21) (M, NBC San Diego 2026-08-24); must be physically in an available state; tribal land excluded (M, NEXTPredict).
- State counts conflict inside secondary sources: 38 states at launch with full contracts in 17 and non-sports only in 21 plus DC (M, Yahoo Finance 2025-12-19); NEXTPredict says 45 / 48 (as of 2026-08-26, excluding New Hampshire and Maine, full catalogue in 16, financial-only in 14, sports restricted in 18) / "50" in different paragraphs (M, internally inconsistent). Treat as "roughly 48 states, availability varies by state and by category".
- Automation/bot/API terms: **NOT FOUND** (terms page 403). Given the Akamai wall and no API programme, assume automated trading is not permitted for retail accounts.
- No personal data or accounts were created for this research.

---

## 10. Liquidity

| Metric | Value | Source | Tag |
|---|---|---|---|
| Total volume, April 2026 | $3.1B | NEXTPredict FAQ, page dated 2026-08-26 | M |
| Total volume, July 2026 | $11B, of which $7.4B market-maker and $3.6B consumer | same | M |
| May 2026 | "$1.3B annualized", total volume up 34% (Barron's via NEXTPredict) | same; contradicts the other figures, units unclear | L |
| Share of US sports event-contract volume, Sept | ~4% (Blockonomi, from the task hint, not re-verified by me) | hint | L |
| DraftKings reported prediction revenue | Not broken out (inside Sports revenue; Sports revenue $891.9M Q2 2026) | 10-Q | H |
| Open interest / depth | NOT FOUND | | |

Interpretation: tens of billions of dollars of notional is plausible for a major US retail brand, but those numbers are unverified, include market-maker flow, and the liquidity is on CME/CDNA.

---

## 11. Event categories and overlap

Categories (M, NEXTPredict; the Apify page lists the same set): sports (NFL, NBA, WNBA, MLB, NHL, college, soccer, combat sports, golf, tennis), crypto price, economics/macro, finance/stocks and indices, commodities, politics, culture/entertainment, climate/weather.

Overlap with other venues (where arbitrage exists), all via CME/CDNA contracts rather than DraftKings-specific ones:
- **Sports:** Kalshi, Polymarket US, other US-regulated venues. Highest overlap and highest regulatory risk.
- **Crypto price:** CDNA/Nadex-settled contracts overlap Kalshi and Polymarket crypto ladders.
- **Macro (NFP, unemployment, fed funds) and indices:** CME-settled contracts overlap Kalshi economics.
- **Politics/culture:** thin.

---

## 12. Shared liquidity: is it an independent leg?

**No.** H (10-K): the contracts are CME and CDNA listings; CME and CDNA are the clearing organisations; their market makers provide the liquidity; Wedbush is the FCM. Anything priced on DraftKings is the same book as the CME/CDNA contract, so an arbitrage leg on DraftKings is not distinct from a leg on the exchange.

Open item: **Railbird Exchange ("DKEx")**. DraftKings acquired Railbird Technologies on 2025-10-21; its subsidiary Railbird Exchange, LLC is "a registered designated contract market" (H, 10-K and 10-Q Note 3: total consideration $84.8M, up to $200M contingent, $58.1M operating-licence intangible). Yahoo Finance (2025-12-19) said Railbird was "expected to be integrated in the coming months" (M). NEXTPredict (2026-08-26) lists "DKEx, CDNA and CME" as the exchanges (M). The 10-K (Feb 2026) names only CME and CDNA, and the excerpts I read do not mention "DKEx" or "DraftKings Exchange". The 10-Q says Railbird's revenue since acquisition is "not material". Whether DKEx lists its own contracts with its own order book as of Oct 2026: **unverified**. If it does, those contracts would be DraftKings-only liquidity, and worth a re-check once there is a public feed or rulebook.

---

## 13. Adapter priority

**skip.** Reasons: (1) broker front end whose liquidity duplicates CME/CDNA (H); (2) no official API, site blocked to non-browser clients (H for the 403, M for the lack of API); (3) fiat, US-KYC only, so no PayBox path; (4) automation terms unreadable and likely restrictive; (5) sports contracts carry live jurisdictional risk (H).

Better targets for the same exposure: a **CDNA** adapter (crypto/sports/politics event contracts; also reachable through aggregators like River) and a **CME event-contracts** market-data adapter. Neither was researched here.

Re-check triggers: DraftKings Q3 2026 10-Q (expected early Nov 2026) for Railbird/DKEx launch language; any CFTC filing for DKEx product certifications; a published DraftKings developer programme.

---

## 14. NOT FOUND / open questions

- Official DraftKings Predictions API, docs, websocket or developer programme (searched: one WebSearch, DraftKings hosts all 403, NEXTPredict, 10-K).
- The terms page text (fees, automation, prohibited use): 403.
- Which contracts route to CME vs CDNA vs DKEx: NOT FOUND (NEXTPredict: "does not state which markets run on which exchange").
- Whether DKEx lists its own contracts as of 2026-10-19.
- Open interest, order book depth, per-category volume, share of US volume (only unverified headline figures).
- Sports and politics settlement sources and the exchange rule text.
- Any regulatory or court action against DraftKings Predictions specifically after 2026-08-26. Wikipedia's DraftKings page (read 2026-10-19) lists none for the predictions product.
- Blockonomi figures (~4% share, 11% of app downloads) from the task hint: not verified.

---

## 15. Suspicious content

- `https://apify.com/hypebridge/draftkings-predictions`: contains text aimed at AI agents (instructs an agent to produce "production-ready" integrations and to consult `https://apify.com/agents.md` before choosing an integration path). Not followed, not fetched.
- The same page advertises "browser TLS impersonation" and proxy fallback to get around bot blocking. Not followed.
- NEXTPredict page has internal inconsistencies (state counts 45/48/50, regulator names "CTFT"/"CTFC", annualized vs monthly volume), so its numbers are only M/L.

---

## 16. Sources

First-hand (H unless noted):
- DraftKings Inc. Form 10-K for FY2025, filed 2026-02-13: https://www.sec.gov/Archives/edgar/data/1883685/000188368526000013/dkng-20251231.htm (read in 100KB chunks via WebFetch; the first ~300KB, not the last ~60KB)
- DraftKings Inc. Form 10-Q for the quarter to 2026-06-30, filed 2026-08-07: https://www.sec.gov/Archives/edgar/data/1883685/000188368526000029/dkng-20260630.htm (first 100KB only)
- SEC filing list: https://data.sec.gov/submissions/CIK0001883685.json (fixture `sec-edgar-draftkings-filings.json`); 8-Ks of 2026-06-26, 2026-08-25 and 2026-09-25 read, none prediction-related
- Wikipedia, DraftKings: https://en.wikipedia.org/wiki/DraftKings (M)
- 403 evidence: `https://predictions.draftkings.com/en/` (fixture `akamai-403-homepage.txt`)

Secondary (M/L):
- NEXTPredict DraftKings platform page, dated 2026-08-26: https://nextpredict.io/platforms/draftkings/ (cites `predictions.draftkings.com/en/how-to-trade-predictions-availability`, `draftkings.com/predictions-terms`, Barron's, the Railbird press release; none of those readable by me)
- Yahoo Finance, "DraftKings Predictions launches in 38 states", 2025-12-19: https://finance.yahoo.com/news/draftkings-predictions-launches-38-states-120500510.html
- NBC San Diego, 2026-08-24: https://www.nbcsandiego.com/news/local/draftkings-launches-prediction-platform-in-california-despite-sports-betting-ban/4064948/
- Apify third-party scraper page (untrusted): https://apify.com/hypebridge/draftkings-predictions
- Project doc: `docs/research/14-platform-of-platforms.md` (River Markets lists Crypto.com / CDNA), `docs/research/09-venues-onchain-clob.md` section 2.12

Fixtures: `docs/research/fixtures/draftkings-predictions/akamai-403-homepage.txt`, `docs/research/fixtures/draftkings-predictions/sec-edgar-draftkings-filings.json`.
