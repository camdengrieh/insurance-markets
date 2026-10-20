# Prediction Labs (predictionlabs.ch)

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale.

## Verdict

Not a venue. It is a paid, gated Polymarket data vendor (ClickHouse indexer plus CLOB order-book files) run by "Web3 Engineering" (W3E). It has no markets, no trading, no public REST or WebSocket API and no independent liquidity. Adapter priority: **skip** as a trading or arbitrage leg. At most a P2 optional historical-data source for backtesting Polymarket.

## What it is

- Marketing site, a React SPA: title "Prediction Labs | Institutional-Grade Market Data". Description: "Institutional-grade Polymarket data infrastructure for quantitative traders. Historical trades, real-time order books, and microstructure datasets." [H] https://predictionlabs.ch/
- The site footer reads "Prediction Labs 2026" and lists the contact hello@web3engineering.co.uk. [H] site JS bundle https://predictionlabs.ch/assets/index-BHIxlwcY.js
- Live in 2026: the site and the docs respond (HTTP 200) on 2026-10-19, and the footer is dated 2026. [H] I found no dated news or independent coverage because the web-search budget was exhausted. [NOT FOUND (searched: n/a, WebSearch quota exhausted)]
- The docs "Docs" link goes to the W3E gitbook, https://web3-engineering.gitbook.io/web3-engineering-docs/. Prediction Labs is the Polymarket product of W3E. The same gitbook also covers a Solana indexer and a Hyperliquid indexer. [H] llms.txt: https://web3-engineering.gitbook.io/web3-engineering-docs/llms.txt
- The research blog at https://blog.predictionlabs.ch/ has four posts, on Polymarket fill events, top traders by ROI, whale copy-trading and Pumpfun sniper tips. [H]

## Kind and market model

- Kind: data and analytics vendor, Polymarket only. [H]
- Market model: none of its own. Everything is Polymarket's. That means binary and categorical outcomes as Conditional Tokens (CTF) on a CLOB. Per its metadata page, "a single market entity may have multiple outcomes", stored at (market id, outcome) level, with `condition_id` linking to the Conditional Tokens protocol. [H] .../polymarket-indexer/market-metadata.md
- Venues covered: Polymarket only. No Kalshi, Limitless or other venue was found in the docs. [H, from the Polymarket docs index; llms.txt lists only Solana, Hyperliquid and Polymarket indexers]

## Chains and collateral

Inherited from Polymarket: Polygon, USDC. The `polymarket_order_filled_v2` table has fields `amount_usdc`, `amount_token`, `contract_address` and `block_*`. [H] .../executed-trades.md. The chain name is not stated on the page, so Polygon is M, inferred from Polymarket.

## Read API

- Existence: **none public**. Access is by request form (https://forms.gle/izJqkCQB6gviKVo48) or by contacting the vendor on Telegram, and costs $200/month with a 7-day free trial. [H] .../overview/polymarket-indexer.md
- Delivery: a direct ClickHouse database connection (DBeaver example, host and ports published as a demo, database `polymarket`, credentials issued individually, ports 28123 HTTP and 29000 native). [H] .../connecting-to-indexer.md. I did NOT connect to it because no credentials may be used or requested. The host is a bare IP address, so it is a self-hosted server.
- Tables documented: `polymarket_order_filled_v2` (fills, with `wallet`, `asset`, `amount_token`, `amount_usdc`, `is_maker`, `side`, `fee`, block and tx fields), `raw_market_meta`, condition creation, condition resolution, position split, position merge and payout redemption. [H] gitbook pages.
- Order books: TSV text files with lines `<capture_timestamp_ms>\t<json>`. Event types are book, price_change, last_trade_price, best_bid_ask, new_market, market_resolved and tick_size_change. This mirrors the Polymarket CLOB WebSocket market channel. [H] .../order-book-clob-data-storage-format.md
- Rate limits: it claims "unlimited" requests and untruncated history. [H] (vendor claim, unverified)
- Not documented: coverage start date and ingestion latency. The marketing code contains an example `'2024-01-01'`, which is not a coverage statement. [NOT FOUND (searched: gitbook polymarket-indexer pages, site bundle)]
- WebSocket or push API: NOT FOUND. "Real-time" means ingestion into the database or files. There is no documented push or streaming endpoint. [H]
- x402: the gitbook documents pay-per-query x402 access only for the **Solana** indexer (POST SQL to an endpoint, price in the 402 response). I found no such path for Polymarket. [H] .../solana-indexer/access-via-x402-payments.md. I did not call it.
- Fixtures: none saved, because there is no public unauthenticated API to sample.

## Trade path

None. It is data only. [H] An EVM wallet reachable through PayBox cannot trade anything here. Trading would be on Polymarket itself, which a parallel workflow covers.

## Fees

$200/month subscription for data (7-day trial). [H] No trading fees. The `fee` column in the fills table is Polymarket's fee as passed through. [H]

## Resolution

Not applicable; it only indexes Polymarket's resolution events (condition resolution, payout redemption, `market_resolved`). [H]

## Geo, ToS, automation

- No ToS, terms or privacy pages were found on the site. The only published nav links are Data Products, Technical Specs, Docs and Research blog. [NOT FOUND (searched: site bundle, gitbook index)]
- Because access is account-gated and paid, automated access would need the vendor's agreement. That is M, my inference.

## Liquidity and event coverage

- No own liquidity. Any volume figure would be Polymarket's. [H]
- It shares liquidity with Polymarket completely, so it is **not an independent arbitrage leg**.
- Possible value to this project: Polymarket history for backtesting arbitrage and edge, plus wallet and whale analytics as a signal source (the blog covers whale copy-trading). Polymarket's own public APIs are cheaper for live prices.

## Open questions

- Whether a Polymarket history endpoint or an x402 path exists for agents. Ask the vendor on Telegram or the form only if backtesting data is wanted.
- Coverage start date and latency.

## Sources

- https://predictionlabs.ch/ [H]
- https://predictionlabs.ch/assets/index-BHIxlwcY.js (app strings, nav links, contact) [H]
- https://blog.predictionlabs.ch/ [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/llms.txt [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/overview/polymarket-indexer.md [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/overview/polymarket-indexer/connecting-to-indexer.md [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/overview/polymarket-indexer/executed-trades.md [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/overview/polymarket-indexer/market-metadata.md [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/overview/polymarket-indexer/order-book-clob-data-storage-format.md [H]
- https://web3-engineering.gitbook.io/web3-engineering-docs/overview/solana-indexer/access-via-x402-payments.md [H]
- Discovery lead: https://predictionindex.xyz/ecosystem [not re-read this session]

## Suspicious content

None found. The pages contained no instructions aimed at AI agents.
