# Fliq (fliq.one) - venue spec

Researched 2026-10-19. Verdict: **skip** (web app retired, Telegram-bot only, no public API, Aptos-only, manual resolution, last docs edit 2025-11).

## Liveness (H)
- https://fliq.one/ and https://testnet.fliq.one/ (fetched 2026-10-19, HTTP 200) both serve only: "Fliq has moved to a new home. The web app has been retired. Trading now lives on our Telegram bot. Open t.me/FliqTGBot". [H]
- t.me/FliqTGBot resolves to a live bot page "FliqBot @FliqTGBot" (existence only; bot not used, no way to read its markets without Telegram). [H]
- predictionindex.xyz/ecosystem still lists Fliq as Aptos / Live / Binary / CLOB, volume n/a, website https://www.fliq.one/#/ (stale: that URL no longer hosts the app). [H that the listing says it; the "Live" status is stale]
- docs.fliq.one sitemap: newest lastmod 2025-11-06; nothing newer. Docs still describe the retired web app (Petra / Google wallet). [H] -> treat docs as possibly stale (>6 months).
- Whether the Telegram bot is still trading in Oct 2026, and with what volume: NOT FOUND (searched: homepage, docs, predictionindex; WebSearch budget exhausted; x.com/predictonfliq returned HTTP 402, recorded and stopped).

## Kind / market model (H, docs 2025)
- Creator-led, user-created binary YES/NO markets (anyone can create; question, source of truth, rules, end time, category). New markets are live immediately but only listed after review. [H] https://docs.fliq.one/markets/market-creation.md
- Central limit order book (limit + market orders), on-chain, "powered by Econia" (Aptos on-chain CLOB). Price = probability, YES/NO prices need not sum to 1 (spread). Min trade $0.10. Includes crypto "Up/Down" short-dated markets and football markets. [H] https://docs.fliq.one/trading-concepts/trading-fees.md , https://docs.fliq.one/markets/market-odds.md , https://docs.fliq.one/faq-trading-basics.md
- Outcome tokenisation: NOT FOUND (docs never name token types/contract addresses).
- Initial odds are set by an "AI" per FAQ. [H] (self-description; marketing)

## Chain / collateral (H)
- Aptos only; collateral USDT on Aptos. Gas in APT (users need ~$0.20 of APT to withdraw). MetaMask/Phantom explicitly unsupported. Wallets: Petra or Google social wallet (Aptos Connect). Self-custodial per docs. [H] https://docs.fliq.one/faq-wallets-and-funds.md , https://docs.fliq.one/common-issues-and-solutions.md
- No contract/module addresses published in docs. NOT FOUND (searched: docs.fliq.one llms.txt + key pages; GitHub search for fliq prediction aptos returned 404/no repo).

## Read API
- exists: **none** (no official public API documented). docs.fliq.one/llms.txt lists no API/developer pages. The former web app's backend hosts are unknown (api.fliq.one and app.fliq.one do not resolve in DNS). [H for "not documented"; the Aptos on-chain Econia state could in principle be read via Aptos fullnode/indexer, but market/orderbook object addresses are unpublished.]
- Websocket: NOT FOUND. Rate limits: NOT FOUND. Fixtures: none saved (nothing to GET).

## Trade path
- None programmatic. Web app retired; trading is via a Telegram bot (custody/signing model of the bot unknown). Previously: browser wallet (Petra / Aptos Connect) signing Aptos transactions against Econia. No SDK/API for orders documented. [H for retirement; model of bot NOT FOUND]
- PayBox reachable: **no**. Aptos is not an EVM/Solana chain; no EVM transaction proposal or signed-order path exists. (Reasoning from H facts above.)

## Fees (H) https://docs.fliq.one/trading-concepts/trading-fees.md , .../platform-fees.md
- Econia taker fee 5 bps; makers free.
- Platform fee 10% of winner profits (profit only; none on losses). Example in docs: $100 -> $150 withdrawn, $5 fee.
- Creator revenue share exists (amount NOT FOUND).
- Net: round-trip arbitrage must clear ~10% of profit on winning leg, which makes thin-edge arb uneconomic.

## Resolution / dispute (H) https://docs.fliq.one/markets/market-resolution.md , .../dispute-mechanism-on-fliq.md
- Manual resolution by the Fliq team against the creator-specified source of truth ("plan to decentralise").
- Dispute window after resolution: crypto Up/Down 30 min, sports 1 h, other 8 h. One disputer per market, stake 10 USDT (win: stake back + 25 USDT bonus; lose: forfeit). Dispute adds 8 h to settlement. Final call is Fliq's. Winners must manually "Settle".
- Risk: centralised, creator-defined subjective rules, short windows -> high resolution-mismatch risk vs other venues.

## Geo / ToS / automation
- NOT FOUND (searched: docs llms.txt, FAQ, homepage). Docs target Nigerian users (Naira on-ramp guide) [H], suggests no US focus. No automation/bot policy found.

## Liquidity
- No volume/OI/TVL figure found. predictionindex shows "n/a" (fetched 2026-10-19). DefiLlama protocol list (api.llama.fi/protocols, 8758 entries, 2026-10-19) has no Fliq entry; "Econia" appears under Aptos with null TVL. [H]
- Docs mention small incentive pools ($1,000 referral, $1,500 limit-order competition), implying thin organic liquidity. [M]

## Category overlap (M)
- Football/sports and crypto Up/Down are the live categories per docs (overlap with Polymarket/Kalshi/Limitless/Azuro-style sports and crypto price). Politics/macro: subjective ones rejected by policy. Liquidity too thin/unknown to matter.
- Shares liquidity with another venue? Own Econia book; no sign of shared liquidity. Independent but irrelevant given no access.

## Priority: skip
Web app retired, bot-only, no API, Aptos-only (unreachable via PayBox), manual central resolution, 10% profit fee, no measurable volume, docs stale since 2025-11.

## Suspicious content
- None found. (x.com/predictonfliq returned HTTP 402; not fetched further.)

## Sources
- https://fliq.one/ , https://testnet.fliq.one/ (fetched 2026-10-19) [H]
- https://t.me/FliqTGBot [H existence]
- https://docs.fliq.one/llms.txt , sitemap-pages.xml , and the .md pages cited above [H, last edited 2025-11-06]
- https://predictionindex.xyz/ecosystem [H for listing; stale]
- https://api.llama.fi/protocols (no Fliq entry) [H]
- https://github.com/econia-labs/econia README (Aptos on-chain CLOB; Fliq's CLOB base per docs) [H]
