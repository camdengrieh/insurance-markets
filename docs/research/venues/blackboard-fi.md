# Blackboard.fi - venue spec (researched 2026-10-19)

Verdict: SKIP as an arbitrage leg. It is a front end / broker over Polymarket (plus Aster, Hyperliquid, Aark perps and trading cards). It has no liquidity of its own and no public API. Treat it only as a Polymarket builder-code attribution target.

## Kind and liveness
- Live (H): https://blackboard.fi/ returns 200; app at https://app.blackboard.fi/ ; Polymarket builder leaderboard lists "Blackboard.fi" (verified: true) on 2026-10-19. Fee schedule in docs says "checked October 16, 2026" (H, https://blackboard-fi.gitbook.io/blackboard-docs/resources/fees).
- Kind: non-custodial onchain trading terminal / broker-frontend (H, https://blackboard.fi/llms.txt). Products: Crypto perps via Aster, TradFi perps via Hyperliquid HIP-3, 1000X via Aark, Prediction via Polymarket, TCG trading cards (H, docs readme).
- Prediction = "Polymarket event markets and Up/Down rounds" (H, docs readme). Up/Down rounds are prediction shares on above/below a reference price (H, docs trade/prediction-market). Whether Up/Down is a Polymarket market or Blackboard-native is NOT FOUND (searched: docs prediction page, FAQ); it says only they use "prediction shares".

## Market model, chains, collateral
- Each outcome has its own order book and price; market and limit orders; matched orders may need onchain settlement (H, https://blackboard-fi.gitbook.io/blackboard-docs/trade/prediction-market). This is Polymarket's CLOB, i.e. binary outcome shares (ERC-1155 CTF tokens) - M, inferred from Polymarket.
- Chain: Polygon. Collateral: pUSD (H, same page). pUSD is Polymarket's newer collateral token; not verified here.
- Funding: direct USDC on Arbitrum, Polygon, HyperEVM or Solana, other crypto via quote, connected wallet, or card; "Cash" and product accounts are separate (H, docs account/deposit). Which route funds the Prediction account: NOT FOUND (searched: deposit and prediction pages).

## Read API
- exists: none (public). No API docs on site, docs, llms.txt or FAQ (H). Only API guide is "Trade through the Aster API" (perps, not prediction). api.blackboard.fi does not resolve; docs.blackboard.fi fails TLS (H, curl).
- Market data should be taken from Polymarket directly (Gamma/CLOB/data-api), which is covered by the parallel workflow.
- The one useful public endpoint is Polymarket's builder leaderboard: GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=50&offset=N (H). Blackboard row: builderCode 0x9bbe9aa6...3b9a7c, ALL-time rank 181, volume 573,029 USD, 23 active users; MONTH rank 135, volume 20,655 USD, 6 active users (H, queried 2026-10-19). Fixture: docs/research/fixtures/blackboard-fi/polymarket-builders-leaderboard-sample.json.
- Websocket: none (NOT FOUND).

## Trade path
- Web UI only. Accounts are an embedded EVM wallet (Privy export mentioned) or "delegated Polymarket accounts" using backend signing; other Polymarket wallet modes exist (H, docs account/security). No public order API, no documented key/agent for Prediction. FAQ: "AI strategies... not available"; agent/signing permissions do not run autonomous strategies (H).
- For our aggregator: trade Polymarket directly (CLOB signed orders with builder code) rather than via Blackboard. PayBox reach: no (no API, backend-signed accounts); a PayBox EVM wallet on Polygon could trade Polymarket directly, which is the same liquidity.

## Fees
- Blackboard fee 1.00% taker / 0.50% maker, charged upfront; Polymarket may add its market-specific fee on top; no separate builder fee listed. Tier payback (as rebate, not discount) from 13.57% (Silver, 30d vol 1M) to 59.29% (Legendary, 400M) (H, docs resources/fees, schedule checked 2026-10-16).
- Implication: trading via Blackboard strictly adds cost versus direct Polymarket.

## Resolution
- Polymarket resolution rules and source apply ("Official resolution determines payouts"; redeem after resolution) (H, docs prediction page). Dispute risk is Polymarket's UMA-based process (M, general knowledge, not checked here).

## Geo / ToS / automation
- Docs: "Direct venue access depends on the correct wallet, account type, permissions and regional restrictions"; FAQ: access approval may be needed; regional and provider restrictions apply. No country list (H).
- Terms of Service at https://blackboard.fi/terms/ and privacy at /privacy/ are client-rendered (SPA); text not retrievable by curl or WebFetch. NOT FOUND (searched: terms page, docs, FAQ) for bot/API rules. Access is apparently gated (waitlist, /waitlist route, points airdrop) (M, llms.txt, airdrop sites).

## Liquidity and overlap
- Own liquidity: none. Orders route to Polymarket; reviews say the same (M, WebSearch results, unverified third-party). Volume through Polymarket builder code: 573k USD all-time, about 21k in last month (H, leaderboard, 2026-10-19) - tiny.
- Categories: whatever Polymarket lists (sports, politics, crypto, macro). Shares liquidity with Polymarket, so NOT an independent leg.
- Could be a minor signal of retail flow only; negligible.

## Open questions
- Terms of Service text on automation and jurisdictions (needs rendered page).
- Whether Up/Down rounds are Polymarket-sourced.
- Whether Blackboard has a partner/builder API for programmatic prediction trading.

## Suspicious content
- None observed. llms.txt contains "Do not infer" guidance for AI readers (benign descriptive text, not acted on).

## Sources
- https://blackboard.fi/ (H); https://blackboard.fi/llms.txt (H)
- https://blackboard-fi.gitbook.io/blackboard-docs (readme, trade/prediction-market, resources/fees, account/deposit, account/security, resources/faq, llms.txt) (H, WebFetch summaries)
- https://data-api.polymarket.com/v1/builders/leaderboard (H)
- Third-party reviews via WebSearch (airdrops.com, yellow.com press release on Aster competition) (M/L)
