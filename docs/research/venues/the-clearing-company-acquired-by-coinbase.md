# The Clearing Company (TCC, acquired by Coinbase) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Used: WebFetch/WebSearch on public pages, unauthenticated GETs to `api.coinbase.com`, `docs.cdp.coinbase.com`, `data.sec.gov`, `gh api` user/org lookups. No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data and nothing in them was followed. Scripted requests used the User-Agent `insurance-markets-research/0.1`.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, page-summariser output, or my inference; **L** = weak or stale. Anything older than about 6 months (most TCC coverage, which dates from Nov-Dec 2025) is flagged stale.

Method limits:
- The session's shared WebSearch budget ran out after two usable queries (they ran; later ones were refused). I did not work around it, so 2026 news about TCC specifically is thin.
- `clearing.co` (TCC's own site) and its blog return a Vercel bot challenge (HTTP 429) to non-browser clients; not bypassed. `x.com/theclearingco` returned HTTP 402 (no body; nothing paid). All `coinbase.com` consumer pages return 403 to WebFetch. So **TCC's own words are NOT READ**; everything about TCC below is from press and wiki mirrors (M).
- SEC filings were read through WebFetch (page-summarised), so SEC-derived facts are M even though the source is primary.
- Sibling notes cover the live Coinbase product: `docs/research/venues/coinbase-prediction-markets.md` and `docs/research/venues/coinbase-predictions.md`. This note does not repeat their API and fee detail.

Fixture: `docs/research/fixtures/the-clearing-company-acquired-by-coinbase/probes_2026-10-19.json` (negative-evidence probe log; there is no market-data endpoint to sample).

---

## 0. Bottom line

1. **There is no venue to integrate.** TCC was a ~10-person pre-launch startup. It had applied to the CFTC to become a derivatives clearing organization (DCO) in Nov 2025 and aimed for a late-2026 launch. It had no trading product when Coinbase announced the deal on 2025-12-22, which the press called "more of an acquihire" (M). I found **no evidence in 2026 of any product, market, contract, API, docs site or token under the TCC name**.
2. **Whether the deal closed is not confirmed by any primary source I could read.** Coinbase's filings never name TCC (H, negative, across the FY2025 10-K, both 2026 10-Qs, the Q4 2025 letter and the Q1/Q2 2026 decks). Circumstantial: both 2026 10-Qs say "other business combinations that were immaterial", and Q1 2026 shows 173 thousand shares ($19.4M) issued as consideration for a business combination (M, consistent with a stock-and-cash deal closing in Q1; unnamed, so not proof). Later web coverage (defirate, 2026-10-02) refers to it as "its December 2025 acquisition" (M).
3. **Coinbase's live prediction product is not TCC.** It is Kalshi-routed, custodial and US-only; the Q4 2025 shareholder letter says "initial market flow powered by Kalshi" (M/H). Dedupe against Kalshi (see sibling notes).
4. **Watch item, not a leg:** the CFTC approved a Coinbase DCO application in the week of 2026-09-28, covering "fully collateralized futures, options on futures, and swaps" and not certifying any prediction market; defirate does not tie it to TCC (M). If TCC's onchain, stablecoin-native clearing design ever ships under Coinbase, that would be the first genuinely Coinbase-owned venue. Nothing is live.
5. **adapter_priority = skip.** Revisit triggers are in section 11.

---

## 1. Is it still live? (2026)

| Question | Answer | Tag |
|---|---|---|
| Was there a product named "The Clearing Company" trading in 2026? | No evidence of one. Company homepage unreadable (bot challenge); no docs, API, repo, contract or market listing found; `theclearingcompany.com` does not resolve; GitHub names `theclearingco`, `clearing-co`, `clearingco`, `the-clearing-company`, `TheClearingCompany` do not exist; Coinbase org has no matching repo; Coinbase developer docs index (59 KB) has zero hits for "predict", "clearing", "event contract" | H (negative) |
| Did Coinbase announce the acquisition? | Yes, 2025-12-22; ~10 people, nearly the whole team joining; mix of cash and Coinbase stock; value undisclosed, called "immaterial"; close expected Jan 2026 | M (The Block 2025-12-22, >6 months old; stale) |
| Did it close? | Not confirmed by any primary source. 2026 10-Qs: "other business combinations that were immaterial"; Q1 2026 equity statement: 173 thousand Class A shares, $19.4M, as business-combination consideration (no name) | M (inference) |
| Is Coinbase's live prediction product TCC's? | No. Coinbase Financial Markets (FCM) sells Kalshi contracts since Dec 2025 pilot / 2026-01-28 nationwide; Q2 2026 deck: $100M+ annualised revenue, +106% Q/Q, "Crypto Binaries" added, "Combos" next | M/H (SEC deck via summariser) |
| Is TCC's own DCO live? | Application filed Nov 2025 (company post dated 2025-11-21; WSJ cited by defirate). No approval or CFTC order found. A Coinbase DCO approval was reported 2026-10-02 but is not linked to TCC by the source | M |

Verdict: **still_live = false** as an independent venue. The company is absorbed into Coinbase; the brand has no visible product.

---

## 2. Kind and market model

- **Kind (M):** infrastructure startup: "back-end infrastructure for prediction markets", not a consumer app; "We want to be Switzerland" (Gemayel, via defirate). Pitched as the "first stablecoin-native clearinghouse purpose-built for prediction markets", with onchain clearing, settlement and exchange infrastructure for brokerages and others to build on (Markets Media 2025-11-24, Crowdfund Insider 2025-12-22, Betting Startups; all >6 months old).
- **Market model:** NOT FOUND. Planned markets cover "crypto, politics, sports, culture" (MarketsWiki, stale). Binary/categorical/scalar, order book vs AMM, and outcome tokenisation were never specified in anything I could read.
- Pre-acquisition plan also included a separate CFTC exchange (DCM) licence "next" (Betting Startups, M).

## 3. Chains and collateral

- Chain: **NOT FOUND**. Every source says "onchain" without naming one (Crowdfund Insider, MarketsWiki, defirate, The Block).
- Collateral: "stablecoin-native"; which stablecoin: NOT FOUND (USDC is the obvious guess for a Coinbase entity; not sourced, do not use).
- Coinbase's live prediction product settles in USD/USDC inside a custodial account, with no chain (sibling notes).

## 4. Liquidity and shared-liquidity verdict

- TCC itself: **zero** (no trading product). No volume, OI or TVL exists to cite.
- The only Coinbase prediction liquidity is Kalshi's, resold through the Coinbase FCM (M, strong). Coinbase-wide figure: prediction revenue $100M+ annualised, +106% Q/Q (Q2 2026 deck, 2026-07-30, H via SEC deck, summariser). No volume or OI is disclosed.
- **Shared liquidity: yes, with Kalshi.** Not an independent leg. Model as an alias of `kalshi` with an execution overlay, as the sibling notes recommend.

## 5. Read API

`exists = none`.
- No TCC docs, API, subgraph, contract address, SDK or GitHub org found (H, negative; section 1).
- Coinbase's public market-data endpoint rejects prediction products: `GET https://api.coinbase.com/api/v3/brokerage/market/products?product_type=PREDICTION` returns HTTP 400 `"PREDICTION" is not a valid value` (H, fixture, 2026-10-19).
- The only Coinbase prediction surface is authenticated and undocumented in prose (Advanced Trade order/portfolio fields, user-WS beta). See `docs/research/venues/coinbase-prediction-markets.md` section 5.
- Rate limits / websocket: not applicable.

## 6. Trade path and PayBox reachability

- **None.** No order API, no signing scheme, no contract. Coinbase's product is a custodial, KYC'd, US-only brokerage account (CDP API-key JWT auth, not wallet signatures).
- **PayBox reachable: no.** A PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon, ...) cannot trade anything under the TCC name because nothing exists. If TCC's onchain design ships, it would plausibly be EVM/stablecoin and could become reachable through transaction proposals or signed orders, but that is speculation (L) and no chain has been named.

## 7. Fees

NOT FOUND for TCC. For Coinbase's live Kalshi-routed product: Kalshi base fee plus a Coinbase markup, not published (sibling notes, M).

## 8. Resolution and dispute risk

NOT FOUND for TCC (no markets, no oracle or resolver named). Clearinghouse model implies resolution is by the exchange/DCM that lists contracts, under CFTC rules (M, inference). For Coinbase's live contracts, rules and outcomes are Kalshi's.

## 9. Geo, ToS and automation

- TCC: NOT FOUND (site unreadable, no ToS found). A CFTC-regulated DCO/DCM model implies US-regulated access, not permissionless global access, although MarketsWiki also uses the phrase "permissionless" (M, internally inconsistent, stale).
- Coinbase live product: US residents, FCM application, Nevada excluded, ongoing state litigation (sibling notes).

## 10. Event-category overlap (arbitrage relevance)

None from TCC. Planned categories (crypto, politics, sports, culture) would overlap Polymarket, Kalshi, Limitless and others if it ever launched. Coinbase's live categories are Kalshi's.

## 11. Adapter priority

**skip.** Reasons: no live venue, no API, no chain named, no liquidity, and Coinbase's live product duplicates Kalshi.

Revisit triggers (any one):
1. Coinbase or a Coinbase entity self-certifies or lists its own event contracts on a Coinbase-run DCM, or a CFTC order names TCC/Coinbase for prediction-market clearing.
2. Coinbase publishes a prediction-market data feed or product list in the CDP docs.
3. A chain, contract address or stablecoin is announced for a Coinbase onchain prediction venue.
4. Coinbase adds a non-Kalshi provider behind the same UI.

## 12. Not found / open questions

- TCC's own site, blog and X posts (bot challenge / 402): product design details, chain, stablecoin, ToS.
- Closing date of the Coinbase deal; no 8-K or named filing line found.
- Whether the Coinbase DCO approval of the week of 2026-09-28 is TCC's application, Coinbase's own, or a separate one.
- Whether "Crypto Binaries" and "Combos" run on Kalshi or on a Coinbase-controlled book (the Q2 2026 deck does not say).
- Toni Gemayel's current role (the sibling note says head of prediction markets at Coinbase via Cointelegraph/Decrypt; I could not re-read those).
- Any TCC volume, OI, TVL, token or contract address.

## 13. Suspicious / agent-directed content seen

None directed at AI agents. Notes: the Vercel "Security Checkpoint" page on `clearing.co` is an ordinary bot challenge (not bypassed); x.com answered HTTP 402 (nothing paid); search results included scraped mirror domains (`transfertop.it.com`, `brainsum.com`, `mexc.com/news`) that were not opened.

---

## Sources

H (first-hand primary):
- https://api.coinbase.com/api/v3/brokerage/market/products?product_type=PREDICTION (HTTP 400 probe, 2026-10-19)
- https://docs.cdp.coinbase.com/llms.txt (grep, 0 hits) ; https://docs.cdp.coinbase.com/derivatives/introduction/welcome (CDE docs: REST/FIX/SBE/UDP, no prediction mention)
- https://data.sec.gov/submissions/CIK0001679788.json (Coinbase filing list, accession numbers in fixture)
- `gh api` lookups of GitHub users/orgs and the `coinbase` org repo list (2026-10-19)

M (primary but page-summarised, or secondary):
- Coinbase FY2025 10-K https://www.sec.gov/Archives/edgar/data/1679788/000167978826000015/coin-20251231.htm ; Q1 2026 10-Q https://www.sec.gov/Archives/edgar/data/1679788/000167978826000054/coin-20260331.htm ; Q2 2026 10-Q https://www.sec.gov/Archives/edgar/data/1679788/000167978826000088/coin-20260630.htm
- Q4 2025 shareholder letter https://www.sec.gov/Archives/edgar/data/1679788/000167978826000011/q425shareholderletter.htm ; Q1 2026 deck https://www.sec.gov/Archives/edgar/data/1679788/000167978826000053/q126earningsdeck-finalse.htm ; Q2 2026 deck https://www.sec.gov/Archives/edgar/data/1679788/000167978826000087/q226earningsdeck_sec.htm
- https://www.theblock.co/news/deals/2025-12-22-coinbase-to-acquire-prediction-markets-startup-the-clearing-company-383497 (deal announcement; stale)
- https://www.crowdfundinsider.com/2025/12/256773-prediction-markets-coinbase-acquires-the-clearing-company/ (acquihire, DCO plan; stale)
- https://defirate.com/news/coinbase-acquires-the-clearing-company-to-expand-prediction-markets-reach/ (2025-12; "Switzerland", back-end infra, DCO per WSJ)
- https://defirate.com/news/cftc-approves-coinbase-derivatives-clearing-organization-application/ (2026-10-02; Coinbase DCO approval, scope, no link to TCC)
- https://www.marketsmedia.com/the-clearing-company-files-to-become-dco/ (2025-11-24; stale) ; https://www.marketswiki.com/wiki/The_Clearing_Co. (last edited 2025-11-24; stale) ; https://news.bettingstartups.com/p/clearing-company-cftc-onchain-prediction-markets (stale)
- https://www.coindesk.com/markets/2026/01/27/coinbase-rolls-out-prediction-market-to-u-s-customers and https://www.covers.com/industry/coinbase-expands-into-prediction-markets-nationwide-with-kalshi-jan-29-2026 (Kalshi as sole provider at launch; no TCC mention)
- Sibling notes: `docs/research/venues/coinbase-prediction-markets.md`, `docs/research/venues/coinbase-predictions.md`

Blocked / unreadable: https://www.clearing.co/ and /blog/dco-filing-clearing-company-cftc (HTTP 429 bot challenge, not bypassed); https://x.com/theclearingco (HTTP 402, nothing paid); https://nexusfi.com/d/exchanges/the-clearing-company/, https://www.coinbase.com/prediction-markets, https://www.coinbase.com/blog/... (HTTP 403); https://www.cftc.gov DCO list pages (HTTP 503); https://www.theclearingcompany.com (DNS failure).
