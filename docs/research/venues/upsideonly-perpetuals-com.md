# UpsideOnly (Perpetuals.com) - venue spec

Researched 2026-10-19. Verdict: skip. Not a prediction market; no event contracts, no order book, no API, no on-chain component.

## Summary
- Live (H): https://upsideonly.com/ returns HTTP 200 (curl 2026-10-19). Launched 2026-05-19 (M, press release coverage). Operated by USO Labs, a subsidiary of Perpetuals.com Ltd (NASDAQ: PDC) (H, Finance Magnates 2026-06-09).
- Kind: paper-trading / "prediction analytics game and trading simulation platform" (H, Terms). Users make simulated calls on 25 instruments (equities, commodities, forex, crypto, indices; gold and BTC dominate). The company says it trades its own capital when its AI judges a call likely to succeed and shares 50% of realised profit with eligible users (H, FAQ). Users cannot lose.
- No event contracts, no YES/NO tokens, no market prices to compare against other venues. The "prices" are the underlying asset prices (gold, BTC, stocks).

## Market model
NOT a binary/categorical/scalar market. No order book, AMM or parimutuel. Positions are virtual units, closed automatically after 4 weeks (H, FAQ). Outcomes are not tokenised.

## Chains and collateral
None. Terms: users "don't trade or hold assets" on the platform (H). Optional refundable "Participation Deposit" of US$1-500, held in US T-bills by an external fiduciary, not used for trading (H, FAQ). Crypto/USDC payouts are "not supported yet"; bank transfer only (H, FAQ).

## Read API
NOT FOUND (searched: homepage, FAQ, Terms, upsideonly.com/api and /docs, api.upsideonly.com, web search). /api and /docs return HTTP 200 HTML with different hashes from the root page, so they look like SPA catch-all routes, not API docs (M; not inspected further). api.upsideonly.com does not resolve. No fixtures saved because there is no public data API.

## Trade path
None. No programmatic order placement documented. Account requires email signup, 2FA and KYC before payouts. Terms are silent on bots/API, but the deposit is justified partly to deter "bots or AI agents" (H, Terms). Not reachable from a PayBox EVM/Solana wallet: no contracts, no signed orders, no on-chain settlement.

## Fees
Free to use (H, FAQ). Standard payment processing fees on deposit/withdrawal; $1 minimum withdrawal. Company keeps deposit yield. Profit share: 50% to eligible users on realised profit from trades using their signals; payouts are discretionary (H, Terms/FAQ). Finance Magnates: "users receive half of any profit, and the company covers losses" (H).

## Resolution / dispute risk
No market resolution. Payouts are discretionary, accrue only if the company realises net profit on trades using the user's signal data, and are weekly (Fridays 5pm ET) or monthly jackpots ("coming soon") (H, FAQ/Terms). Disputes: binding AAA arbitration, California law, class waiver (H, Terms).

## Geo / ToS / automation
Company may restrict access by jurisdiction at its discretion; sanctioned-country users excluded from payouts. License is personal, non-commercial; one account per person, no sub-accounts (H). Company says it is open to US and EU users and claims users from 185 countries (M, company claim). Regulatory framing is contested: pitch says "AI-powered prop trading" while the terms say simulation/game (H, Finance Magnates). Compliance references (MiFID II etc.) belong to an affiliate, PM MTF Ltd, not UpsideOnly (H, FM).

## Liquidity
No orderbook liquidity. Company-reported $4.5B cumulative SIMULATED volume, 30,000+ active users, 186,000 fills, 25 instruments in the first two weeks (M, company release via Barchart/FM, ~June 2026; unverified). Virtual money, so not usable as depth or OI. Gold ~$1.4B, BTC ~$1.2B of that (H, FM).

## Event category overlap
None as event contracts. Underlyings (gold, BTC, equities) overlap with crypto-price/commodity markets elsewhere only in the loose sense that the same assets are referenced; no tradeable contract to arbitrage. Possible use as a weak sentiment signal only if data were exposed, which it is not.

## Shared liquidity
N/A. Not an independent leg; there is no market.

## Adapter priority: skip
Not a prediction market, no API, no on-chain surface, no tradeable contracts.

## Suspicious content
None found. Marketing claims ("can't lose", "risk-free") are unverified company statements. Terms summary and full text reportedly disagree on how deposits are held (WebFetch note, M).

## Open questions
- Whether the SPA exposes an undocumented XHR/WebSocket feed (not probed; no browser automation permitted).
- Whether PM MTF Ltd (affiliate) launches real event contracts later.

## Sources
- https://upsideonly.com/ (H, fetched 2026-10-19)
- https://upsideonly.com/faq (H, 2026-10-19)
- https://upsideonly.com/terms (H, 2026-10-19)
- https://www.financemagnates.com/forex/analysis/perpetuals-defends-upsideonlys-no-loss-model-as-prediction-market-prop-play-tops-45-billion/ (H, dated 2026-06-09)
- https://perpetuals.com/perpetuals-launches-upsideonly-the-trading-and-market-prediction-platform-where-users-cant-lose.html (M, search result, not fetched)
- https://www.barchart.com/story/news/2265110/perpetuals-com-nasdaq-pdc-reports-strong-early-upsideonly-adoption-signs-datavault-ai-asset-tokenization-agreement (M, search result, not fetched)
