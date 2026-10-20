# Lucyd (lucyd.trade) - venue adapter spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Live, but **Sepolia testnet only with test USDC** (H). No mainnet host found (api.lucyd.trade does not resolve; H). Everything is days old (contracts deployed 2026-10-07, npm package created 2026-10-06).
- Single instrument: BTC/USD Up/Down, six periods (5m, 15m, 30m, 1h, 4h, Daily). Prices are seeded by a house market maker, not by organic flow.
- Adapter priority: **P2** (signal-only / watch-for-mainnet). The API is genuinely good and cleanly documented in open source, so the adapter is cheap, but there is no real money and no independent liquidity today.

## Kind and market model (H)

- Hybrid: off-chain central limit order book (CLOB) matching, on-chain settlement via an Exchange contract; outcome tokens are ERC-1155 in `ConditionalTokens` (Gnosis CTF style). Source: https://lucyd.trade/guide, https://github.com/Lucyd-trade/contracts README.
- Binary, two outcomes `up` / `down`. `market_type: "UpDown"`, `instrument: "BTC"`, `category: "Crypto"`.
- Collateral split/merge: 1 USDC <-> 1 UP + 1 DOWN (`splitPosition` / `mergePositions`), fully backed.
- Outcome token id (asset id) = keccak256(marketId ++ uint8(index)), 0 = up, 1 = down (clob.rs in mcp-server). Verified: the id I computed with `cast keccak <market>00` returned a book whose `market` field matched.
- "Buying down at p is the same book as selling up at 1-p" (MCP tool description), but I observed distinct trades printed per outcome; treat the two books as separate and check for a parity gap rather than assuming it.
- Price grid: tick 0.0025, range 0.0025-0.9975. Sizes are 6-decimal base units (`"size":"431000000"` = 431 tokens). Min fill field exists.
- Strike: Pyth BTC/USD price at market open, set once by the market creator. In the API it is an integer with Pyth exponent -8 (M: `8201294941877` -> 82,012.95; exponent inferred from magnitude, not stated).

## Chains and collateral (H)

- Ethereum Sepolia (chainId 11155111). Collateral: test USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals).
- Contracts (Sepolia): ConditionalTokens `0xB62eFc43C16b4E2Bf1aAAD33002368e55708538D`, MarketFactory `0xe4DC0a7c6eaa2ae66FdDe61e1882749430F7aAbd`, PriceResolver `0xe051D7D72DEb54F934F5DFa0846779232e7265dD`, AutoRedeemer `0x42Bf669f0A3DCc95510001Ddbc43D56FdE67268F`, Exchange `0x6588c789c6b6df8f8b6b92e6433f813cc2d1d4d0` (Exchange from mcp-server README/config.rs), Pyth `0xBb86bCc951A62DF86826219d9251Ee05F2c1e286`. Source: contracts/deployments/sepolia.json.
- The guide page says USDC can be deposited "from any network or bought with a card"; that is marketing copy on a testnet, not verified (L).

## Read API (official, public, unauthenticated for market data) (H)

Docs: https://lucyd.trade/api-docs (and testnet.lucyd.trade/api-docs). The page is client-rendered ("Loading..."), so I could NOT read its text; the endpoint list below is reconstructed from the official MCP server source (github.com/Lucyd-trade/mcp-server src/main.rs, src/clob.rs) plus live GETs. NOT FOUND: official OpenAPI spec (`/openapi.json` 404 on api host), rate-limit documentation (searched: /policy, /guide, repo READMEs).

Base URLs:
- Markets/trades API: `https://api.testnet.lucyd.trade`
- Order book (CLOB): `https://clob.testnet.lucyd.trade` (REST under `/v1/...`, WebSocket `wss://clob.testnet.lucyd.trade/v1/ws`)
- Status: `https://status.testnet.lucyd.trade` (302)

Confirmed live with unauthenticated GET (fixtures in docs/research/fixtures/lucyd/):
- `GET /markets` -> JSON array, 100 items returned (default page cap; paging params not documented, NOT FOUND). Fields: address (= marketId, bytes32), instrument, market_type, period, start_date, end_date, resolved_at, outcomes, state (`upcoming|open|settled`), winner, volume_traded (USD float), strike, rules, resolved_value, resolver_address, oracle{provider,feeds[]}, title, category. Fixture: `markets-sample.json`.
- `GET /markets/{marketId}` -> one market.
- `GET /trades?limit=N` -> array with trade_id, tx_hash, log_index, block_number, block_time, market_id, match_type (`mint` seen), trader, side, outcome_id, outcome_index, outcome, price, quantity (base units), amount_usd. Params seen in source: limit (1-500), market, outcome, side, from, to, cursor. Fixture: `trades-sample.json`.
- `GET {clob}/v1/book?asset_id=<outcomeId>` -> `{asks[],bids[],asset_id,market,tick_size}` with price/size strings (size in 6-dec base units). Fixture: `clob-book-sample.json`.
- `GET {clob}/v1/prices?asset_id=<outcomeId>` -> `{asset_id,best_bid,best_ask,mid}`. Fixture: `clob-prices-sample.json`.
- `GET /health` -> `{"status":"ok"}`; `GET /health/settlement` -> `{"overdue":0,"status":"ok"}`; `/health/trades-live` referenced in source (not called).
- Referenced in source, not called: `/positions`, `/traders`, `/traders/{addr}`, `/traders/{addr}/pnl-history?range=`.

Authenticated reads: `GET {clob}/v1/orders` and `/v1/orders/history` need EIP-712 "Exchange HTTP" headers (`X-Exchange-Account/Signer/Nonce/Expiration/Signature`). Not needed for a scanner.

WebSocket: `/v1/ws` is the trading socket (auth challenge -> authenticate -> submit_order). Whether it also offers public book subscriptions is NOT FOUND (the source I read only uses it for authenticated trading). Plan on polling `/v1/book` unless api-docs says otherwise.

Observed oddity (M): the book depth looks synthetic: five levels per side with sizes rising/falling in a regular arithmetic pattern (231/232/233... and 431/434/437...), spread 0.005 on Daily Up. Consistent with the PartnerProgram note that "the Lucyd market maker" is the counterparty.

## Trade path (H, from official MCP source)

- Programmatic: yes. Orders are EIP-712 signed off-chain, sent as `submit_order` over WebSocket after a signed login challenge.
  - Login typed data `WebSocketAuthV1` in domain `{name:"Exchange WebSocket", version:"1", chainId, verifyingContract}` (values come from the server's `auth_challenge`).
  - Order typed data `SettlementOrderV1` in domain `{name:"Exchange", version:"1", chainId:11155111, verifyingContract:Exchange}`; fields: protocolVersion, maker, signer, taker, outcomeId, marketId, side(0 buy/1 sell), timeInForce(0 gtc,1 gtd,2 fak,3 fok), makerAmount, takerAmount, minFillAmount, expiration, nonceEpoch, salt. Buy: makerAmount = USDC, takerAmount = tokens; sell reversed.
  - Cancel: `CancelOrdersV1`. Order types: limit and market (FAK/FOK).
- One-time on-chain approvals (USDC and ERC-1155 `setApprovalForAll` to Exchange) and redemptions are ordinary Sepolia transactions needing a little Sepolia ETH.
- Official MCP server: `@lucyd/mcp` (npm, only version 0.0.0, created 2026-10-06; MIT; Rust binary, signs locally with `LUCYD_PRIVATE_KEY`). Not used here; do not install third-party code per ground rules.

## PayBox reachability: **no** (today)

- Venue exists only on Sepolia testnet with worthless USDC; PayBox's supported chain list (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) is not Sepolia as far as I know (L, did not call PayBox, per read-only rule). Trading needs raw EIP-712 typed-data signing plus a long-lived authenticated WebSocket session, which is not a "transaction proposal". If a mainnet launches on an EVM chain PayBox supports, it would be `partial`: approvals/redeem via transaction proposals, order signing only if PayBox exposes typed-data signing (unverified).

## Fees (H)

- Trading, gas (for orders), placing/cancelling: free; orders signed off-chain (guide). Protocol fee currently 0%, applies only to winning redemptions, fixed per market at creation, capped on-chain at 3% (`MAX_FEE_BPS`) (contracts README). Partner program pays partners 0.1% of volume that their traders take from the Lucyd market maker (paid by the operator, not an extra trader fee as far as stated).
- User pays Sepolia gas for approvals and redemptions only.

## Resolution and dispute risk (H)

- Pyth BTC/USD feed `e62df6c8...a415b43`. After market end anyone calls `PriceResolver.settle` with a Pyth update; first Pyth price published at or after end time; UP if strictly greater than strike, else DOWN. If that price is more than 10s after end -> void (each token redeems 0.50 USDC). `voidExpired` after 24h with no price.
- No off-chain dispute process; resolution is final once on-chain (policy page). Operator cannot change outcome, strike, end time, resolver or fee of an existing market (contracts README). Dispute risk is low; the void path (0.50 each) is the main edge case for arbitrage: a hedge against another venue becomes unbalanced on void.
- Cross-venue basis risk: strike is a Pyth tick at open, other venues use Chainlink/CF benchmarks/Coinbase etc. Exact-instant definitions differ, so Up/Down equivalence with another venue's "BTC above X at T" is approximate.

## Geo / ToS / automation (H, https://lucyd.trade/policy)

- 18+; "does not offer services to U.S. residents, sanctioned jurisdictions, or regions where prediction markets are prohibited"; may restrict interface access by wallet or IP, contracts remain permissionless. Prohibits wash trading, manipulation, exploiting bugs. Bots are not addressed; an official MCP server and API are offered, so automation is clearly intended. No rate limits documented (NOT FOUND).

## Liquidity (H, 2026-10-19 ~05:20 UTC)

- Cumulative `volume_traded` across the 100 markets returned by `/markets`: about 2,047 test-USDC (my sum). Open Daily market: 500.93; 4h: 122.66. Homepage shows similar tiny figures (Daily $492, 4h $123, 1h $34, 30m $33, 15m $1, 5m $0). All test money.
- Book depth ~230-440 tokens per level near the touch (test tokens). Trades in sample are from one trader address (repeated), i.e. mostly bot/MM activity.
- Market inventory: 52 settled 5m, 17 settled 15m, 8 settled 30m, 4 settled 1h, 1 settled 4h in the window returned; new markets are created ahead of time (upcoming).

## Event coverage / overlap

- Crypto price only, BTC only. Overlaps with BTC up/down 5m/15m/hourly/daily products on Polymarket, Limitless, Predict.fun, Opinion, Kalshi (hourly/daily BTC). No sports, politics, macro.
- Shares liquidity with another venue: no evidence. Counterparty is a Lucyd-operated market maker (partner program text); liquidity is independent but not organic. It is listed on polymart.app (an aggregator, M), which is a front-end, not shared liquidity.

## Adapter notes

- Read adapter: poll `GET /markets` (filter state=open), compute outcome ids locally (`keccak256(marketId || 0x00/0x01)`), poll `/v1/book` and `/v1/prices`; use `/trades` for flow. Scale: sizes /1e6, strike /1e8 (M). Normalise to the 5m/15m/30m/1h/4h/1d windows with start_date/end_date and compare against other venues' same-window BTC markets.
- Treat as a signal/test harness for the EIP-712 CLOB pattern, not as an execution leg. Re-check for a mainnet announcement (changelog at lucyd.trade/changelog was not readable; client-rendered).

## Sources

- https://lucyd.trade (homepage, H); https://lucyd.trade/guide (H); https://lucyd.trade/policy (H); https://lucyd.trade/api-docs (client-rendered, content not readable)
- https://github.com/Lucyd-trade/contracts (README, deployments/sepolia.json) (H)
- https://github.com/Lucyd-trade/mcp-server (README, src/clob.rs, src/main.rs, src/config.rs) (H)
- https://api.testnet.lucyd.trade/markets, /trades, /health/settlement; https://clob.testnet.lucyd.trade/v1/book, /v1/prices (H, live GETs 2026-10-19)
- https://registry.npmjs.org/@lucyd/mcp (H; created 2026-10-06, version 0.0.0)
- WebSearch was unavailable (session search budget exhausted), so no independent third-party coverage was checked.

## Suspicious content

- None found. No instructions aimed at agents were seen in fetched pages or source.
