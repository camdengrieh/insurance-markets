# Galaxy Digital OTC prediction-markets desk (venue spec)

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip**. This is a bilateral, institutional-only, principal-style OTC desk. It has no public API, no order book and no on-chain contracts. All liquidity is routed to Kalshi and Polymarket, so it is not an independent arbitrage leg.
- Possible use: a weak narrative signal only (large institutional flow exists and the OTC route is chosen where public books are too thin). Nothing machine-readable.

## Liveness (H)

- Launched 2026-06-02 by Galaxy's Global Markets desk. Source: https://www.galaxy.com/newsroom/galaxy-launches-institutional-otc-prediction-markets-trading (H).
- CoinDesk, published 2026-06-02, updated 2026-06-03: https://www.coindesk.com/markets/2026/06/02/galaxy-enters-institutional-prediction-markets-with-usd10-million-arca-trade (H).
- Whether it is still live on 2026-10-19: **not independently confirmed**. The Galaxy newsroom listing (fetched this session) shows items dated 2026-06-25 to 2026-09-17, none mentioning prediction markets (H, but the listing shows titles only, so bodies were not checked). The Global Markets page (https://www.galaxy.com/global-markets) does not mention prediction markets at all (H). No evidence of shutdown; no evidence of expansion either. Treat as "launched, status unverified" (M).
- Web search budget was exhausted during this task, so no independent follow-up coverage (post-June volumes, added venues) was searched.

## Kind and market model

- Kind: broker / OTC principal desk (a "broker-or-frontend" in the registry sense, but Galaxy is the principal counterparty). (H)
- Execution: bilateral OTC, Galaxy acts as principal and can warehouse risk. (H, press release via WebFetch summary)
- Underlying instruments: event contracts listed on Kalshi and Polymarket, non-sports only: "economic, political, geopolitical, and other event-driven markets". Plans to add more platforms (unnamed). (H)
- Positions can be paired with hedges in equities, commodities and other assets in a single strategy. (H)
- So the market model is whatever the underlying venue uses (binary YES/NO on both Kalshi and Polymarket). Galaxy itself publishes no market list, outcome tokens or books. NOT FOUND (searched: galaxy.com press release, global-markets page, newsroom).

## Chains and collateral

- NOT FOUND. Press release does not describe settlement or custody. Presumably settled between Galaxy and the client by bilateral agreement (fiat or stablecoin), while Galaxy hedges on Kalshi (USD, CFTC-regulated) and Polymarket (USDC on Polygon). That is inference (L).

## Read API

- exists: none. Probed docs.galaxy.com, developer.galaxy.com, api.galaxy.com: DNS does not resolve (H). Global Markets page does not mention API or FIX (H). The press release does not mention an API or RFQ process (H).
- No public prices, books, trades or resolution endpoints for this desk. Quotes are presumably private, given on request to onboarded clients (L).
- Galaxy does run other data products (not prediction related); not investigated and not relevant.

## Trade path

- None programmatic. Institutional-only bilateral execution via the desk (voice/chat/RFQ style, details not published). (H for institutional-only and OTC; L for the mechanics.)
- PayBox reachability: **no**. There are no on-chain contracts or signed-order schemes to target from an EVM wallet through transaction proposals, and the counterparty requires institutional onboarding and legal agreements. An agent cannot place trades. Direct trading on Kalshi and Polymarket is covered by a separate workflow.

## Fees

- NOT FOUND. Press release does not give fees. Expect a spread embedded in the OTC price (L).

## Resolution mechanism and dispute risk

- Inherits the underlying venue's resolution (Kalshi rules / Polymarket UMA-style process; covered in the Kalshi and Polymarket specs). Galaxy-specific terms (master agreement, what happens on disputes or voided markets) are not published. Counterparty risk is on Galaxy. (M)

## Geo / ToS / automation

- "Institutional counterparties" only: hedge funds, family offices, other institutions. (H)
- "Galaxy evaluates the offering jurisdiction by jurisdiction, considering applicable legal and regulatory requirements" (summary of press release). (H)
- No automation rules published. NOT FOUND.

## Liquidity

- Only datapoint: one disclosed $10M trade with Arca (crypto hedge fund) tied to the outcome of the proposed CLARITY Act, executed on Kalshi at launch, 2026-06-02. (H, Galaxy + CoinDesk)
- Arca's CIO said public prediction-market liquidity is insufficient for a fund of its size, which is why the OTC route was used. (H, CoinDesk/Galaxy summaries)
- No volume, OI or TVL published. NOT FOUND.

## Event categories and overlap

- Economic, political, geopolitical, and other event-driven; sports excluded. These overlap fully with Kalshi and Polymarket politics/macro/crypto-regulation markets (H). It offers no distinct markets of its own.

## Shared liquidity

- Fully dependent on Kalshi and Polymarket; Galaxy is a principal that hedges or warehouses there. It is not an independent leg for arbitrage and adds no observable price. (H on the venues, M on the hedging inference.)

## Possible signal use

- Only via press and filings (e.g. announced block trades). No feed. Not worth an adapter.

## Open questions

- Is the desk still active in Q4 2026, and did it add venues beyond Kalshi and Polymarket?
- Does Galaxy offer clients an API/RFQ platform for this (e.g. via GalaxyOne or FIX)? Not documented publicly.

## Fixtures

None saved: no public API exists.

## Suspicious content

None observed. Fetched pages contained no instructions aimed at AI agents.

## Sources

- https://www.galaxy.com/newsroom/galaxy-launches-institutional-otc-prediction-markets-trading (H, 2026-06-02)
- https://www.coindesk.com/markets/2026/06/02/galaxy-enters-institutional-prediction-markets-with-usd10-million-arca-trade (H, 2026-06-02/03)
- https://www.galaxy.com/global-markets (H)
- https://www.galaxy.com/newsroom (H, listing as of 2026-10-19)
- https://en.wikipedia.org/wiki/Galaxy_Digital_(company) (H, secondary; pointed to the two sources above)
- Note: page content was read via WebFetch, which returns model summaries rather than raw text, so quotes are from those summaries (treat verbatim wording as M).
