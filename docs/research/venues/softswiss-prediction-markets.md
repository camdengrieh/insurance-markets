# SOFTSWISS Prediction Markets - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Skip. This is a B2B white-label product for casino and sportsbook operators. It is fixed-odds (players bet against the operator's book), not an exchange, with no public API, no on-chain component, and no named live operators. It is not a venue an aggregator can read or trade. At most it is a vendor whose future customers could become fixed-odds quote sources. adapter_priority: skip.

## Is it live

- Product page exists and is marketed as available now, "2 Weeks from contract to launch" [H, softswiss.com/prediction-markets-software/].
- PRN release dated 2026-04-07 (Gzira, Malta) announces it [H]. It says launch takes about 2-3 days for current partners and about 3 weeks for new operators [H]. The product page's "2 weeks" differs from the PRN's "3 weeks"; the figures are marketing claims.
- Homepage lists it as one of the products: "Provides a fixed-odds event betting platform as a standalone or integrated module." [H, softswiss.com]
- Product page shows an award, "Best Next-Gen Betting Product (Prediction Markets) 2026" (SiGMA Asia), and the claim "1st B2B solution on the market" [H].
- No named client, live operator or public market URL on any page read [H]. Whether any operator has actually gone live is NOT FOUND (searched: product page, PRN release, homepage; WebSearch was unavailable, so no third-party coverage was checked).
- The release states no jurisdictions beyond US market-size context, and no customers [H].

## Market model

- Fixed-odds: "players bet against the bookmaker, avoiding the P2P exchange complexity"; the page says it is "not a trading one" [H]. The PRN contrasts it with P2P exchanges that rely on external liquidity [H].
- Binary outcomes on real-world events [H, PRN]. Categories: politics, economics, sports, crypto, tech, entertainment [H, product page].
- Operator sets margins by market category; "10-Tier Automated risk management", "automated pricing and risk scoring"; SOFTSWISS team provides risk management [H].
- No order book, no AMM, no outcome tokens, no on-chain positions. Positions live in the operator's account system.
- Each operator is its own bookmaker, so prices are operator quotes with embedded margin, not a shared market.

## Chains and collateral

- "in both fiat and cryptocurrencies through a seamless wallet infrastructure" [H]. No chains or tokens named; the PRN does not mention crypto [H]. Chain/asset list NOT FOUND (searched: product page, PRN).
- Funds are custodial deposits at the operator's site, not wallet-held collateral.

## Read API

- None public. API / iFrame / turnkey integration options are for operators; the page describes API integration as "platform-agnostic infrastructure" with no endpoints or specs [H].
- iFrame embedding needs "additional client-side work" [H]. Back office has a "Market Feed" and an Operator Mobile App (operator-facing) [H].
- Probed: docs.softswiss.com returns 403 to an unauthenticated GET [H]; api.softswiss.com does not resolve [H]. No fixtures were saved because no public read API exists.
- exists = none. Operator-side data feed possibly exists but is NOT FOUND publicly.

## Trade path

- None for an external agent. Bets are placed through an operator's account (KYC, fiat or crypto deposit, session login). No signed-order or transaction scheme is documented.
- PayBox reachable: no. Not an on-chain or signed-order venue; there is nothing for a wallet to propose or sign against. Any operator deposit address would be a custodial transfer, which is not a trade path.

## Fees

- No fee schedule published; the only lever is operator-configurable margin per category (overround is the cost to the player) [H]. Commercial terms via "Get Proposal" [H]. SOFTSWISS's own fee to operators NOT FOUND.

## Resolution

- Not described. The FAQ only gives a generic definition ("market configuration, resolution, and settlement") [H]. Source of truth, dispute process and oracle are NOT FOUND. Because the operator is the counterparty, resolution is at operator discretion under its own terms (M, inferred from the fixed-odds model).

## Geo / ToS / automation

- Regulatory claim: fixed-odds platforms "operate under a standard gambling or sportsbook licence in most regulated markets. No exchange licence required." SOFTSWISS "confirms regulatory fit for each jurisdiction during onboarding." [H]
- The footer lists Stable Aggregator Limited, MGA B2B licence MGA/B2B/942/2022, but the page does not say it covers this product [H].
- Operators will apply their own geo-blocks and KYC. Automated or arbitrage betting is generally restricted by sportsbook ToS (M). No SOFTSWISS-level automation rules found.

## Liquidity

- None published: no volume, OI or TVL. Fixed-odds means no pooled liquidity; limits are per operator risk settings (M). The PRN cites US industry volume (about $300M in 2024 to an estimated $40-50B in 2025), which is market context and not SOFTSWISS volume [H].

## Event overlap

- Categories overlap Polymarket, Kalshi and others in politics, economics, sports and crypto, but there are no observable prices. Arbitrage against it is not feasible without being an operator's customer.
- Shared liquidity: it is not shared with an exchange; the PRN says it avoids external liquidity [H]. Odds sourcing (whether derived from Polymarket/Kalshi prices) NOT FOUND, and is a plausible risk of being a derivative of other venues (L).

## Adapter notes

- Nothing to adapt. Revisit only if a named operator launches a public site with scrapeable prices, or SOFTSWISS publishes an API. Even then these would be per-operator quotes with margin, useful as signal rather than a hedgeable leg.

## Open questions

- Any live operator using it? Any operator-facing API docs or data feed access terms? Where do prices come from?

## Suspicious content

- None observed. The "2 weeks" and "3 weeks" launch claims are promotional and inconsistent, and the FAQ says "5 core categories" while listing six; none of this is an instruction aimed at an AI agent.

## Sources

- https://www.softswiss.com/prediction-markets-software/ [H]
- https://www.prnewswire.com/news-releases/global-tech-firm-opens-prediction-market-infrastructure-to-businesses-worldwide-302735077.html [H]
- https://www.softswiss.com/ (homepage) [H]
- https://docs.softswiss.com (403) [H]

Limits: the WebSearch budget was exhausted, so no third-party coverage or operator launches were checked. All findings come from vendor-controlled pages.
