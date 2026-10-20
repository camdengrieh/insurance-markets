# Galaxy Digital event swaps (OTC prediction-market desk)

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary or named source, M = secondary/inferred, L = weak/stale.

## Verdict
- adapter_priority: **skip**. Bilateral institutional OTC desk. No API, no public prices, no order book, not reachable from a PayBox wallet, and it hedges on Kalshi/Polymarket, so it is not an independent liquidity leg.
- At most a qualitative/news signal source (Galaxy research notes, deal announcements).

## Is it live? (H/M)
- Launched 2026-06-02 (H: crypto.news article stamped that day, https://crypto.news/galaxy-digital-enters-prediction-markets-as-arca-places-10m-trade/ ; FM article dated 2026-06-02).
- Galaxy's own site still carries an "Institutional Prediction Markets Trading" product page (H: https://www.galaxy.com/prediction-markets, HTTP 200 on 2026-10-19) with a "Contact our Desk" form, plus a Prediction Markets topic page with research through 2026-10-15 (H: https://www.galaxy.com/insights/topics/prediction-markets/).
- NOT FOUND (searched: web search for Sep/Oct 2026 updates, galaxy.com topic page): any post-June news on the desk (new trades, volume, new venues). Ongoing activity beyond launch is unverified. Page existence = live offering, but no evidence of volume.

## Correction to the discovery hint
The hint says the desk "bypasses public prediction exchanges". Better stated: it offers principal-counterparty OTC exposure to the **same event contracts that trade on Kalshi and Polymarket** and hedges across exchanges, correlated instruments and traditional markets (M: crypto.news; Defiant summary "block-size, principal-counterparty execution for Kalshi and Polymarket event contracts"; H: galaxy.com/prediction-markets says Galaxy hedges "across exchanges, correlated instruments, and traditional markets"). The first trade referenced a Kalshi binary on the CLARITY Act (M: crypto.news). Galaxy's own risk-management piece says it hedges in "crypto and traditional markets" and does not name Kalshi/Polymarket (H: https://www.galaxy.com/insights/perspectives/risk-managing-prediction-markets). So the exchange hedge is reported by press, not confirmed in Galaxy primary text.

## Kind and market model
- Kind: OTC bilateral swap / dealer desk (Galaxy Derivatives, Galaxy's swap-dealer unit, per Bloomberg as relayed in secondary coverage; M). Galaxy's own pages do not state swap-dealer registration status (H: galaxy.com/derivatives and /prediction-markets pages do not; footer links to "Swap Dealer Disclosures", which I did not read).
- Market model: bespoke event swap, effectively binary payer/receiver. Example: Arca is paid by Galaxy if the CLARITY Act becomes law before 2027, Galaxy is paid by Arca otherwise (M: crypto.news, Defiant summary). No tokenisation, no order book, no AMM. Contract categories on the product page: Elections, Macroeconomics, Crypto (H). Press says non-sports contracts only (M).
- Documentation: ISDA Master Agreement framework (M: Finance Magnates, 2026-06-02 per fetch). Not mentioned on galaxy.com pages I read (H).

## Chains and collateral
- None on-chain. Bilateral credit exposure to Galaxy; ISDA-style collateral (M, inferred). Galaxy page markets "a single counterparty instead of multiple exchanges, wallets, and collateral flows" (H). Collateral terms NOT FOUND.

## Read API
- exists: **none** (public). Galaxy's derivatives page mentions "block and electronic OTC desk" and "24/7 market access to OTC pricing" but no API (H: https://www.galaxy.com/derivatives). Onboarding is by request form.
- NOT FOUND (searched: galaxy.com/prediction-markets, /derivatives, web search; api.galaxy.com and docs.galaxy.com do not resolve in DNS; /derivatives/prediction-markets is 404). No fixtures saved because there is no public API.

## Trade path
- None programmatic. Request a quote from the desk; trade under bilateral legal docs. Quote/board sizes: $10M reference trade (Arca/CLARITY), described as nearly 5x the size of the comparable Kalshi contract (M: Finance Magnates).
- PayBox reachability: **no**. No EVM/Solana transaction or signed-order path; counterparty is a regulated dealer needing institutional onboarding.

## Fees
- NOT FOUND. No fee schedule or spreads published; page only claims "tighter pricing, and better execution" for large trades (H). Pricing is dealer spread, undisclosed.

## Resolution and dispute risk
- Resolution terms of the swap NOT FOUND publicly; presumably tied to a named reference event or to the Kalshi/Polymarket contract resolution (L, inference). Counterparty credit risk sits with Galaxy rather than an exchange (M). Dispute risk is bilateral/ISDA-governed, not oracle-based. Galaxy research notes Polymarket resolution disputes exist (H: "Strategy Sold Bitcoin in May. Polymarket Says It Didn't.", 2026-06-04), which matters if the swap references Polymarket.

## Geo / ToS / automation
- Eligible institutional counterparties only; "typically Eligible Contract Participants and accredited investors"; assessed "jurisdiction by jurisdiction" (H: risk-managing-prediction-markets page). Retail and automated access not offered. Automation rules NOT FOUND.

## Liquidity
- Only datapoint: one disclosed $10M trade, 2026-06-02 (M). No volume/OI/TVL published. Rest is qualitative: Galaxy absorbs blocks too large for public books (M).

## Category overlap and arbitrage relevance
- Overlap: elections, macro, crypto, all non-sports, overlapping Kalshi/Polymarket (M). Not an independent leg: Galaxy hedges on those venues (M), and no price feed exists to scan. Not tradable by this project.
- Signal use: Galaxy research (consensus-probability commentary, e.g. research desk put CLARITY passage at 75% at launch, M) is a qualitative signal only.

## Open questions
- Does the Swap Dealer Disclosures page state registration/swap-dealer status?
- Are there any further disclosed deals or additional venues since June?

## Suspicious content
- None seen. No instructions aimed at AI agents in pages fetched.

## Sources
- H https://www.galaxy.com/prediction-markets (product page, fetched 2026-10-19)
- H https://www.galaxy.com/derivatives
- H https://www.galaxy.com/insights/perspectives/risk-managing-prediction-markets (2026-06-25)
- H https://www.galaxy.com/insights/topics/prediction-markets/ (listing to 2026-10-15)
- M https://www.financemagnates.com/institutional-forex/prediction-markets-go-institutional-as-galaxy-digital-moves-event-trading-to-the-otc-swap-market/ (2026-06-02)
- M https://crypto.news/galaxy-digital-enters-prediction-markets-as-arca-places-10m-trade/ (2026-06-02)
- M https://thedefiant.io/news/tradfi-and-fintech/galaxy-launches-institutional-otc-prediction-markets-desk-arca-clarity (summary only; article body not rendered)
- M Web search aggregates (Bloomberg-relayed swap-dealer-unit claim): cryptobriefing.com, bloomingbit.io, parameter.io, coininsider.com
- Note: all page content here was read via fetch-and-summarise tools, so wording is paraphrase, not verbatim.
