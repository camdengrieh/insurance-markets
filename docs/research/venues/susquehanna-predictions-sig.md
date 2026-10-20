# Susquehanna Predictions (SIG) - venue spec

Researched 2026-10-19. Read-only. Verdict: NOT A VENUE. Market maker / OTC pricer. adapter_priority = skip (as an adapter); useful as a "who is on the other side" signal only.

## Summary

- Susquehanna Predictions is the prediction-markets desk (reported ~80 people) of Susquehanna International Group (SIG). It supplies liquidity, block pricing and "risk transfer" to regulated exchanges, FCMs, brokers, banks, insurers and corporates. [H: sig.com/predictions, fetched 2026-10-19]
- It has no order book, no market list, no tokens, no public API, no developer docs. The page says nothing about APIs. [H: sig.com/predictions; no api./docs. host resolves (api.sig.com and docs.sig.com failed DNS), H]
- Still live: yes, as a business. The page carries news items dated 6/8/26 to 9/23/26 and a "Predictions Cup" student simulated-trading contest running 2026-10-01 12:00 ET to 2026-11-04 12:00 ET. [H]
- Its liquidity is the same liquidity that sits on Kalshi and Rothera (Robinhood JV exchange), so it is never an independent arbitrage leg. [M]

## Kind and market model

- kind: market maker / institutional OTC liquidity provider (not a venue).
- Quoted services: "Liquidity and block execution: two-sided markets for larger or complex positions", "Customized risk transfer", market education, product development. [H: sig.com/predictions]
- Block-trade flow, Aug 2026: Cantor Fitzgerald acts as Introducing Broker and arranges Kalshi event-contract block trades off Kalshi's central order book for about 3,000 institutional clients; "Susquehanna Predictions ... will price the trades and provide liquidity." [H for the quoted sentence: financemagnates article dated 2026-08-19; corroborating headlines in M: CNBC 2026-08-19 (page returned 403 to me, only search snippet), Bloomberg 2026-08-19, predictionnews (403)]
- Settlement/contracts are Kalshi's regulated event contracts (binary). Whether RFQ is the mechanism is NOT confirmed by any source I could read (search summary only, M).

## Chains and collateral

NOT APPLICABLE. USD, CFTC-regulated, off-chain (Kalshi/Rothera clearing). No chain, no token. [M, inferred from the structure above]

## Read API

- exists: none. NOT FOUND (searched: sig.com/predictions, web search "Susquehanna Predictions API / RFQ", DNS for api.sig.com and docs.sig.com, GitHub-style searches not productive).
- No fixtures saved (nothing to GET). docs/research/fixtures/susquehanna-predictions-sig/ is empty.
- Observable footprint for a scanner: SIG's quotes are only visible indirectly as resting orders on Kalshi / Rothera books (anonymous). Block trades are off-book; prints may appear in Kalshi trade feeds but attribution is not available. [L, inference]
- Contact for institutions (not an API): predictions@sig.com (published on the page; a generic institutional inbox, not a personal identifier). [H]

## Trade path

none. Access is by institutional relationship (e.g. through Cantor as introducing broker, or direct bilateral arrangements). Not reachable by an automated retail agent. PayBox reachable: no. Reason: no on-chain or signed-order interface; counterparty onboarding is KYC/institutional.

## Fees

NOT FOUND (searched: sig.com/predictions, news coverage). Block pricing is bilateral/negotiated spread. Kalshi exchange fees presumably still apply to block trades (unverified, L).

## Resolution

Inherits the underlying exchange's rules (Kalshi / Rothera, CFTC-regulated). SIG does not resolve anything. [M]

## Geo / ToS / automation

- Predictions Cup is a simulated-money contest ("SUSQies"), unrelated to real trading; the page says it "is not an offer or solicitation to buy or sell any security or derivative". [H]
- Block trading is institutional-only (Cantor's ~3,000 institutional clients). [H via financemagnates/M via others]

## Liquidity

- No venue volume. Contextual figures (all M, single-outlet search summaries, 2026-10-19 searches): Kalshi + Polymarket combined volume record about $44B in June 2026; Rothera (Robinhood-SIG JV, ex-MIAXdx) reported near $2B notional and ~7% US share in its first month (June 2026); SIG-backed Smarkets filed for CFTC licences and SIG growth equity led a $30M Series B (Forbes 2026-03-09, M). Treat as unverified.
- SIG described as Kalshi's flagship market maker since April 2024 (M; one source claims 2023, conflicting).

## Event coverage overlap

Whatever Kalshi/Rothera list (sports, politics, macro, crypto price, weather, mentions). Overlap with other venues exists, but only via the underlying exchange, not SIG.

## Liquidity shared with

Kalshi (block trades and resting quotes), Rothera exchange (day-one liquidity provider in the Robinhood JV, M), possibly Smarkets (SIG-backed). Same market-maker inventory also quotes other venues, which means cross-venue spreads between SIG-backed books are partially self-arbitraged by SIG.

## Adapter recommendation

- skip as an adapter: no API, no venue, no independent liquidity.
- Possible signal use: track SIG-attributable behaviour indirectly (tight, large resting size on Kalshi/Rothera books; block prints) as a "sharp price" reference. Kalshi's own API (covered by a parallel workflow) is where this would be observed.
- Open question: does Kalshi's API expose block/RFQ endpoints and trade prints distinguishing block trades? Out of scope here (Kalshi workstream).

## Suspicious content

None observed. No instructions aimed at AI agents seen on sig.com/predictions. Two articles (CNBC, predictionnews) returned 403 and were not read directly.

## Sources

- https://www.sig.com/predictions/ (301 to https://sig.com/predictions/), fetched 2026-10-19 [H]
- https://www.financemagnates.com/institutional-forex/cantor-fitzgerald-opens-kalshis-event-contracts-to-roughly-3000-institutional-clients/ (dated 2026-08-19) [H]
- WebSearch (extended) 2026-10-19 results: CNBC 2026-08-19, Bloomberg 2026-08-19, predictionnews, ingame.com (Robinhood-Susquehanna), Forbes 2026-03-09 (Smarkets), news.kalshi.com [M, snippets only]
- Local cross-reference: docs/research/venues/rothera-*.md, smarkets.md, cx-markets-cantor-exchange-*.md

## Confidence

High that SIG Predictions is a live market maker with no public API or venue. Medium on partner details (Rothera, Smarkets, volumes) which rest on search summaries.
