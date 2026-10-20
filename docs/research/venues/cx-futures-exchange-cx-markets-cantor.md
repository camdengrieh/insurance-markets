# CX Futures Exchange / CX Markets (Cantor) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. The venue under this name no longer exists as such: CX Futures Exchange, L.P. was renamed FMX Futures Exchange, L.P. (April 2022) and is now a BGC-owned rates-futures venue (SOFR and Treasury futures). Its only surviving prediction-style product, the CX Division "Atlantic Named Storm Landfall Swaps" (ANSLS), is seasonal, tiny, has no public API and was **delisted on 2026-07-21** (the last contract, sequence B, settles normally; none will follow). The related new DCM "Water Street Labs" (designated 2026-07-16, being sold to Fanatics) is the thing to watch, but it has no products, docs or API yet. Revisit only if Water Street Labs / Fanatics Markets publishes an API.

## Is it live? (2026)

- Naming chain: Cantor Futures Exchange, L.P. (DCM 2010) -> CX Futures Exchange, L.P. (2018) -> FMX Futures Exchange, L.P. (~April 2022). H - CFTC order, https://www.cftc.gov/media/7801/enfcxfuturesorder092922/download
- The Wikipedia text (forex/gold binaries discontinued 2019-03-29) is stale; it does not mention FMX. H - https://en.wikipedia.org/wiki/CX_Futures_Exchange . The CFTC order says CX "primarily listed options and swap contracts relating to weather events" in 2017-2022. H.
- FMX now has two divisions: FMX Division (intermediated: SOFR futures launched 2024-09-23, US Treasury futures launched 2025-05-19; majority-owned by BGC with bank/market-maker minority holders) and CX Division (non-intermediated, weather). M - https://marketswiki.com/wiki/FMX_Futures_Exchange (page itself has internal inconsistencies).
- CX Division weather: legacy daily weather contracts (rain, snow, temperature) stopped auto-listing in June 2020 (M - CFTC weekly notification found via search, https://www.cftc.gov/sites/default/files/filings/ptc/20/06/ptc062320cantordcm001.pdf, not opened). Legacy "ANS #2" contract formally delisted Aug 2025 as "not active since 2018". H - https://cxmarkets.com/rules-and-regulations/notice-to-participants/
- The 2026 ANSLS season: trading started 2026-06-01 10:00 ET (Notice 2026-08), then **Notice 2026-11 / FMX Submission 2026-31 (2026-07-21): ANSLS delisted** effective on settlement of the sequence B contract, no sequence C or later will be listed, "no open interest in subsequent sequential contracts". H - https://cxmarkets.com/wp-content/uploads/2026/07/FMX-CX-ANSLS-Contract-Delisting-2026-07-21.pdf and notices page. Fixture: `docs/research/fixtures/cx-futures-exchange-cx-markets-cantor/cxmarkets-notice-to-participants-text-extract-2026-10-19.txt`.
- Consumer site `trading.cxmarkets.com` ("TradeWeather") is a static "Temporarily Offline for Maintenance" page, (c) 2021, Last-Modified 2021-06-02; every path (/api, /api/markets, /robots.txt) returns the same 9064-byte HTML. `weather.cxmarkets.com` no longer resolves. H - curl 2026-10-19. Fixture: `trading-cxmarkets-com-api-probe-headers.txt`.
- `cxmarkets.com` is now branded **Water Street Labs** (c) 2026 with only Rules / Contact / "Access Your Funds" links; it hosts the exchange notices and rulebooks. H.

## Water Street Labs (successor/adjacent entity, not yet a venue)

- CFTC designated Water Street Labs, LLC as a DCM, order published 2026-07-16; authorised for "fully collateralized futures and swaps on a two-sided central limit order book, and a parimutuel single-sided auction"; proprietary platform "WSL Direct System"; plans to clear through CX Clearinghouse; waterstreetlabs.com redirects to CX Markets; BGC declined to comment on products or timing. M - https://defirate.com/news/cftc-approves-water-street-labs-designation/ (2026-07-17; read first-hand but secondary reporting). Inference that it expands the CX weather business is the article's, not confirmed.
- 2026-07-27: Fanatics agreed to acquire Water Street Labs, LLC (DCM) and CX Clearinghouse, L.P. (DCO) from BGC Group; terms and closing date undisclosed; intent: Fanatics Markets lists and clears its own prediction markets; BGC to contribute market data. H - https://www.fanaticsinc.com/press-releases/fanatics-to-acquire-exchange-and-clearinghouse-from-bgc-parties-to-partner-on-prediction-markets . The press release does not mention FMX, CX Division, weather or any API.
- Rulebook "WSL Exchange Rules 2026-07-02" is published at https://cxmarkets.com/wp-content/uploads/2026/08/WSL-Exchange-Rules-20260702.pdf but the PDF text could not be extracted in this session (Google Docs renderer, compressed glyphs). NOT READ.
- Implication: if Fanatics Markets lists event contracts on Water Street Labs, it becomes a US-regulated, CLOB-based event-contract venue worth a future spec. Today there is nothing to integrate.

## Market model (ANSLS, the only recent product)

- Not a binary Yes/No book. It is a one-sided, pari-mutuel-style bid pool per named storm. Participants "bid" on a 5-digit Strike Code (roughly a US ZIP centroid, listed in an Appendix A of landfall locations). Bid price (= Original Margin posted per contract) is set from distance of the strike location to the NHC forecast track ($1.00 before the storm is named, up to $2.50 near the 36h track; Table 1). Bids cannot be cancelled and positions cannot be liquidated before final settlement. H - 2019 contract terms, https://www.cftc.gov/sites/default/files/filings/ptc/19/05/ptc052919cantordcm002.pdf (L for current parameters: 2019 text, 2026 amendments only partially read).
- Settlement if a Qualifying Atlantic Landfall (QAL) occurs: Final Settlement Price per strike = total Original Margin / total "Residual Bid Interest" (contracts at winning strikes x 1.00 plus losing strikes x 0.01), floor 0.01, cap 249.99. If no QAL: since 2026-06-01 there is no roll to the next storm; price = total margin / total open interest (i.e. refund pro rata). H - https://www.cftc.gov/filings/orgrules/rules0515263521.pdf (FMX Submission 2026-06, 2026-05-15).
- Payout therefore depends on final pool composition, so there is no tradable price in the order-book sense; implied odds can only be computed from the pool, if it were visible (no public feed found).
- Legacy products (2013-2020): binary options on FX/gold and daily weather (rain/snow/high/low temp indices) cleared at CX Clearinghouse; and 2019 "pari-mutuel" weather contracts. H - CFTC order above.

## Chains and collateral

- None on-chain. USD fully collateralised ("Original Margin deposited with each bid") at CX Clearinghouse; funds moved by bank transfer (site has "Access Your Funds"). M - contract terms, participant agreement. No crypto/stablecoin rail found. NOT FOUND (searched: cxmarkets.com, rules pages, search).

## Read API

- exists: **none public**. The CX Participant Agreement has an "API User Participant" addendum: API/SDK/FTP access to the "CX Direct System" and "Exchange Data" is granted per participant, confidential, for own-account trading only; copying, sub-licensing, parsing or distributing CX Direct Materials to third parties is prohibited. H - https://cxmarkets.com/wp-content/uploads/2022/07/CX-Participant-Agreement-2022-06-28.pdf (2022 version; L for current terms).
- No documented base URL, docs site, REST/WS endpoints, rate limits or auth scheme found. `trading.cxmarkets.com` has no API (static page). NOT FOUND (searched: cxmarkets.com, trading.cxmarkets.com, fmx.com, fmxfutures.com (HTTP 403 to scripted fetch), WebSearch).
- Fixtures: no market JSON exists. Saved evidence extracts only.

## Trade path

- Only via becoming a CX/WSL Participant (application, clearing eligibility checks by CX Clearinghouse, signed Participant Agreement, bank funding) and the proprietary CX Direct / WSL Direct system. No wallet or signed-order scheme. An EVM/Solana wallet reachable through PayBox cannot trade this venue and there is no transaction-proposal path. PayBox reachable: **no**.

## Fees

- Per a "Fee Schedule" posted on the CX site; formula NOT FOUND (searched: Participant Agreement, rules pages). Liquidity Provider Incentive Program: exchange-funded pool of lesser of $5,000 or $1 per open-interest contract per storm, capped at $25,000 per year (2026), amended again effective 2026-07-16. H - FMX Submission 2026-06 above. Referring-participant incentive payments exist (Participant Agreement, M/L 2022).

## Resolution and dispute risk

- Exchange-determined: the Exchange "is solely responsible" for declaring a QAL, relying primarily on NHC public advisories but with discretion to use other sources "when doing so is in the best interest of the marketplace". Multiple landfalls by one storm are pooled. Centralised and discretionary, with CFTC DCM oversight. H - 2019 terms (L for 2026 text).
- Regulatory history: CFTC order 2022-09-29, USD 6.5M civil penalty for failing to report >200,000 binary option and pari-mutuel transactions (2017-June 2020) and system-safeguards failures (2017-2021). H - CFTC order above.

## Geo / ToS / automation

- US-regulated DCM; participants must pass CX Clearinghouse eligibility; automated access only through the permitted API as principal for own account, confidential data, no redistribution. This conflicts with a third-party aggregator displaying or relaying venue data. H (2022 agreement) / L (currency). Geographic and retail-eligibility rules NOT FOUND in text read.

## Liquidity

- No volume or OI figures found for ANSLS or other CX weather contracts. NOT FOUND (searched: cxmarkets.com notices, CFTC filings, FMX daily trade report (403)). Signals of thinness: the exchange funds a USD 25,000/yr incentive pool; ANSLS delisted July 2026; legacy weather contracts inactive since 2018-2020. M.
- FMX Division (not event contracts): SOFR futures ADV 3,200 lots and OI 21,600 at end of Q2 2025 (M, BGC results via search); FOW reported only 31 FMX Treasury contracts traded in one (unstated) month (L). Irrelevant to prediction-market arbitrage.

## Event categories / overlap

- Hurricane landfall by location is a niche that overlaps only with crypto-adjacent weather markets (e.g. Polymarket/Kalshi "hurricane landfall" markets, ForecastEx). Pari-mutuel settlement with margin-refund makes price comparison with a CLOB meaningless. No sports, politics, crypto or macro contracts. Not a usable arbitrage leg.

## Shared liquidity

- Clears at CX Clearinghouse (Cantor lineage, BGC-owned, being sold to Fanatics). Own liquidity pool; no known sharing with another prediction venue. If Fanatics Markets later lists on Water Street Labs, that liquidity would be shared with Fanatics Markets (not independent). M/inference.

## Open questions

- What products will Water Street Labs / Fanatics Markets list, and will WSL Direct expose a public or partner API? (Rulebook PDF unread.)
- Does the deal close, and is the CX Division weather business included?
- Whether FMX's CX Division files further weather products for the 2027 season.

## Suspicious content

- None found. (Third-party sites were read as data only.)

## Sources

- https://en.wikipedia.org/wiki/CX_Markets and https://en.wikipedia.org/wiki/CX_Futures_Exchange (H; stale, last product facts 2019)
- https://www.cftc.gov/media/7801/enfcxfuturesorder092922/download (H; CFTC order 2022-09-29, rename history, penalty)
- https://cxmarkets.com/rules-and-regulations/notice-to-participants/ (H; notices 2025-2026 incl. 2026-11 delisting)
- https://cxmarkets.com/wp-content/uploads/2026/07/FMX-CX-ANSLS-Contract-Delisting-2026-07-21.pdf (H)
- https://www.cftc.gov/filings/orgrules/rules0515263521.pdf (H; FMX Submission 2026-06, 2026-05-15)
- https://www.cftc.gov/sites/default/files/filings/ptc/19/05/ptc052919cantordcm002.pdf (H; 2019 ANSLS terms, L for currency)
- https://cxmarkets.com/wp-content/uploads/2022/07/CX-Participant-Agreement-2022-06-28.pdf (H; 2022)
- https://trading.cxmarkets.com/ (H; static offline page, (c) 2021)
- https://defirate.com/news/cftc-approves-water-street-labs-designation/ (M; 2026-07-17)
- https://www.fanaticsinc.com/press-releases/fanatics-to-acquire-exchange-and-clearinghouse-from-bgc-parties-to-partner-on-prediction-markets (H; 2026-07-27)
- https://thesource.com/2026/07/28/fanatics-markets-bgc-prediction-market-acquisition/ , https://finance.yahoo.com/markets/options/articles/fanatics-buys-cftc-registered-exchange-194531070.html (M)
- https://marketswiki.com/wiki/FMX_Futures_Exchange (M)
- https://www.marketsmedia.com/fmx-futures-exchange-increases-volumes/ , https://www.fow.com/insights/tariffs-fmx-futures-volumes-slump-as-traders-revert-to-cme (L; seen only in search snippets)
- Blocked: fmx.com and fmxfutures.com returned HTTP 403 to scripted fetch; bgcg.com 403.
