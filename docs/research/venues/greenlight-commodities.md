# Greenlight Commodities

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Skip as an adapter. Greenlight Commodities is an NFA-registered introducing broker (IB) for institutional/ECP clients, not a venue. It has no API, no public book, no price feed and no on-chain rail. Everything it brokers clears on Kalshi, ICE, CME, Nodal or similar through partner FCMs, so its liquidity is NOT independent: it is Kalshi's clearing plus whichever market maker (Jump Trading) quotes the block. Any useful data (block prints) lives in the Kalshi adapter (`is_block_trade` on the public trades feed; see `cantor-fitzgerald-kalshi-block-trades.md`). adapter_priority: skip.

## Still live?

Yes, as a business. The site www.greenlightcommodities.com returns HTTP 200 on 2026-10-19 and describes an active IB. [H] https://www.greenlightcommodities.com/ . The firm is listed as a registered IB (not pending) on the Bransfield CFTC-regulated PMs page. [H] https://mickbransfield.com/cftc-regulated-pms/ . I could not read the NFA BASIC profile (the link opens an empty search page), so registration status was not verified at NFA. [H that it is unread]

## What it is

- Houston-based NFA-registered Introducing Broker, NFA ID 0443790, "Greenlight Commodities LLC". Serves "150+ institutional clients" (banks, merchants, utilities, hedge funds). [H] site + Bransfield page
- Site meta: "NFA-registered Introducing Broker for institutional prediction markets, energy, and petroleum derivatives. Trade on Kalshi, ICE, and CME." [H]
- Services: trade execution, liquidity access, market intelligence, block clearing through partner FCMs. "All transactions are executed through registered Futures Commission Merchants." [H]
- Markets: energy and power, oil and petroleum, financial and macro, agriculture and industry, GPU compute swaps, plus event contracts (binary, cash-settled, $1/$0). [H]
- Venues/clearers named: Kalshi, ICE, Nodal Exchange, CME Group, ClearPort. FCM partners are not named. [H] https://www.greenlightcommodities.com/fcm-partners
- Kalshi block trade: on 2026-04-27 the firm says it brokered an OTC block between a Houston environmental hedge fund and Jump Trading Group (outcome of a California carbon-allowance auction). Finance Magnates independently reports it as Kalshi's "first custom block trade of this kind", "brokered by Greenlight Commodities" with "liquidity from Jump Trading". The site also cites a CNBC report dated 2026-06-01 (not fetched; CNBC returned 403 in an earlier note). [H] site, financemagnates; CNBC [M]
- Finance Magnates article date: the fetched text did not state it; it is the Cantor article dated 2026-08-19. [M]

## Market model, chains, collateral

- Kalshi binary event contracts, $1 if event occurs, $0 otherwise, central limit order book on Kalshi plus negotiated off-book blocks. No tokenisation by Greenlight. [H] site
- Off-chain, USD, CFTC-regulated. Collateral/margin held at the FCM: cash, treasuries, letters of credit; portfolio and cross-margining offered. No chain, no token. [H] fcm-partners page
- Block trades are bilateral and priced privately; there is no public quote.

## Read API

exists: none.
- Docs URL: NOT FOUND (searched: homepage, /fcm-partners, sitemap.xml lists only `/` and `/fcm-partners`; `/api` and `/docs` return the SPA shell with the homepage title, i.e. no such page; the site copy never mentions an API). [H]
- Prices/books/trades/resolution: none from Greenlight. Use Kalshi's public API: `GET https://api.elections.kalshi.com/trade-api/v2/markets/trades` (carries `is_block_trade`). [H via cantor note]
- No fixtures saved: no public API to sample.

## Trade path

None programmatic. Onboarding is by email to the OTC desk (OTC@greenlightcommodities.com, contact@greenlightcommodities.com) and a licensed Series 3 broker: "Tell us what you trade and how you're structured." [H] site. Orders are executed through partner FCMs and given up for clearing. No FIX, REST or signing scheme is documented. [H absence]

## PayBox reachability

paybox_reachable: no. USD fiat-margined, IB plus FCM intermediated, ECP-only, off-chain. No EVM/Solana transaction proposal or signed order exists for it.

## Fees

Not published. Only "competitive commission and fee structures", "volume-based pricing tiers", "transparent cost breakdowns on every trade". Block fees on Kalshi's side also unpublished. [H] fcm-partners page

## Resolution and dispute risk

Identical to the underlying exchange (Kalshi for event contracts; ICE/CME/Nodal for the rest). Greenlight adds no resolution layer. Kalshi lifecycle: `determined` -> `disputed` -> `finalized`; see `docs/research/08-venues-polymarket-kalshi.md`. [M]

## Geo / ToS / automation

- Products "available exclusively to Eligible Contract Participants (ECPs)"; "trading involves substantial risk of loss". [H] site
- Kalshi block minimums (25,000 contracts non-sports, 50,000 sports per sources; sources differ) and 15-minute reporting window: see cantor note. [H via that note]
- Website ToS/automation terms: NOT FOUND (searched: homepage, fcm-partners). Automation through a human broker desk is not applicable.
- robots.txt allows named search/AI crawlers; irrelevant to integration. [H]

## Liquidity

No volume/OI figures published. Only one disclosed event: the April 2026 carbon-allowance block (size undisclosed). Kalshi public feed showed zero block prints in the last 1000 trades on 2026-10-19 per the cantor note. [H via that note]. Shared with: Kalshi (clearing/settlement) and Jump Trading (quotes) for event contracts. Not an independent leg.

## Event overlap for arbitrage

Same as Kalshi. Greenlight's focus is niche/bespoke: carbon allowances, energy/power, petroleum, macro, GPU compute. Little overlap with retail venues; any overlap (macro, commodity prices) is just Kalshi's own book. Blocks are privately priced, so they give no tradable cross-venue quote.

## Signal use

Marginal. A Kalshi block print marks informed/hedging size; handle in the Kalshi adapter as a boolean flag. Greenlight itself cannot be attributed in the public trade row (no broker field in the documented shape). [M]

## Suspicious content

None found. No instructions aimed at AI agents seen in fetched pages.

## Open questions

- Whether Greenlight-routed blocks are distinguishable in any Kalshi feed (probably not).
- NFA BASIC profile details (registration date, principals, disciplinary history) not read.
- Which FCMs Greenlight uses (not disclosed).
- Search budget was exhausted during this task, so no independent news beyond Finance Magnates was gathered.

## Sources

- https://mickbransfield.com/cftc-regulated-pms/ (Registered Introducing Brokers row: Houston, NFA 0443790, "structured first prediction-market block trade on Kalshi (Apr 2026)") H
- https://www.greenlightcommodities.com/ (fetched 2026-10-19; HTTP 200) H
- https://www.greenlightcommodities.com/fcm-partners H
- https://www.greenlightcommodities.com/sitemap.xml , /robots.txt , /api (SPA shell) H
- https://www.financemagnates.com/institutional-forex/cantor-fitzgerald-opens-kalshis-event-contracts-to-roughly-3000-institutional-clients/ (April block trade paragraph) H
- https://www.nfa.futures.org/BasicNet/basic-profile.aspx?nfaid=Tu2poE7TWCw%3D (opens empty BASIC search; unread) L
- docs/research/venues/cantor-fitzgerald-kalshi-block-trades.md (Kalshi block-trade API and feed details, prior session) H/M
