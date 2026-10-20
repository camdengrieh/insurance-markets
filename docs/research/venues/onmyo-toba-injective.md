# Onmyo Toba (Injective) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: skip. Testnet-only gamified prediction app, no mainnet deployment found, no real-money liquidity, no activity since 2026-05-12 (H). Not an arbitrage leg. Revisit only if a mainnet `marketManager` address appears in the SDK config.

## Liveness (H)

- Site https://onmyo-toba.vercel.app returns HTTP 200 on 2026-10-19 (a Vercel-hosted SPA). Its JS bundle references only `injective-888` (testnet) and `testnet.sentry.lcd.injective.network`. It has no mainnet chain id or contract address.
- SDK repo https://github.com/Nerzhul21-lgtm/onmyo-toba-sdk: created 2026-04-20, last push 2026-04-24, 3 commits, 0 stars, 0 open issues. The README is self-labelled "Official SDK" but lives under a personal GitHub account (H). The README says "Live testnet" and the mainnet Market Manager is "TBD". `config.js` has empty strings for every mainnet contract ("TODO: Set after mainnet deployment").
- The testnet contract's `config` query returns `market_count: 78` (H). The newest market (id 78) was created 2026-05-12, with end times up to 2026-05-31/06-01. Nothing newer exists five months later. All 20 "open" (unresolved) markets are past their end time (latest end_time 1780307146 = 2026-06-01).
- WebSearch was unavailable (session budget exhausted), so no independent coverage, docs site, X/Discord or audit could be checked. NOT FOUND (searched: GitHub repo and site only; web search blocked).

## Kind and market model (H, from SDK source and contract queries)

- kind: onchain-other. CosmWasm contracts on Injective. The collateral is the testnet-bridged USDT denom.
- Binary YES/NO only. The contract is `buy_shares{market_id, outcome:bool}` with attached funds. There is no order book and no limit orders. The README says "No order book - you buy YES/NO shares directly".
- `yes_price` and `no_price` are integers out of 1,000,000. They look like pool-ratio (parimutuel-style) odds: for market 2, yes 51.96M and no 50.0M gave a yes price of 509611. That is close to, but not exactly, the yes/total ratio, so the formula is unconfirmed (M).
- Outcome tokenisation: none. Positions are internal records (`yes_shares`, `no_shares` per trader), not tokens.
- Metadata convention: description ends with `__meta__:{json}` (types price, sports, weather, politics, ai, economics, general). Fixture descriptions are mostly plain text with the resolution rule in prose.

## Chains and collateral

- Injective testnet `injective-888`, USDT denom `peggy0x87aB3B4C8661e07D6372361211B96ed4Dc36B1B5` (H, config.js and on-chain config query). It is a testnet token with no value.
- Mainnet `injective-1` USDT would be `peggy0xdAC17F958D2ee523a2206206994597C13D831ec7` (H, config.js), but no mainnet contracts exist.
- Contracts (testnet): marketManager `inj1x5kyku4mnjxraqxd9mse97k4e4zgxd6zp45jxc`, plus userProgression, feeDistribution, talismanNft, clanManager and a shikigami_registry (H).

## Read API (onchain-or-subgraph-only; no REST service of its own)

- Docs: SDK README only (https://github.com/Nerzhul21-lgtm/onmyo-toba-sdk). There is no OpenAPI spec or docs site.
- Reads use the public Injective LCD CosmWasm smart-query endpoint. No auth. Rate limits are those of the public sentry node, which is not documented by the venue.
  - Base: `https://testnet.sentry.lcd.injective.network/cosmwasm/wasm/v1/contract/{marketManager}/smart/{base64(query json)}`
  - Queries (the contract's own error message lists the variants: `config`, `market`, `markets`, `pending_resolution`, `position`, `user_positions`, `market_stats`) (H):
    - `{"markets":{"resolved":false,"limit":100,"category":"Crypto"}}`
    - `{"market":{"id":2}}`
    - `{"market_stats":{"id":2}}` returns total_volume, yes_pct, no_pct, liquidity
    - `{"position":{"market_id":N,"trader":"inj1..."}}`
    - `{"config":{}}` returns trade_fee_bps, creation_fee, dispute_window_secs, owner, spirit_bot
- WebSocket: Tendermint RPC `wss://testnet.sentry.tm.injective.network:443/websocket` event subscription, used by the SDK `stream.js` (M, from README; not exercised).
- Historical data: the SDK README mentions the Injective indexer (`history.js`); not exercised (M).
- Fixtures, confirmed with unauthenticated GETs on 2026-10-19 (H): `docs/research/fixtures/onmyo-toba-injective/`
  - `testnet-config.json`
  - `testnet-market-stats-2.json`
  - `testnet-markets-first5.json`
  - `testnet-markets-open-limit100.json` (20 "open" markets, all expired)
- Amounts are strings in USDT base units (6 decimals).

## Trade path

- Programmatic. The SDK builds a CosmWasm `MsgExecuteContractCompat` and signs it with an Injective key derived from a mnemonic (`MsgBroadcasterWithPk`) (H, execute.js).
- Messages: `buy_shares{market_id,outcome}` (funds attached), `claim_winnings{market_id}`, `create_market{question,description,category,end_time}` (5 USDT fee).
- AuthZ delegation is available: `grantAuthZ` / `betAsGrantee`, so a bot key can trade from a user's balance (M, README only).
- The SDK includes an MCP server (`mcp-server.js`) that takes `ONMYO_MNEMONIC` from the environment. Treat it as untrusted third-party code; it was not run.
- Not needed for the adapter: a read-only adapter needs only the LCD queries above.

## PayBox reachability

paybox_reachable: no. Injective is a Cosmos-SDK chain with `inj1...` accounts and CosmWasm messages. It is not an EVM chain (the PayBox chains listed are Base, Ethereum, BNB, Arbitrum, Polygon and Solana). A PayBox EVM or Solana wallet cannot sign or propose these transactions. Even on mainnet, funds would have to be bridged to Injective via Peggy, and PayBox signing of Injective txs was not found (NOT FOUND, not checked against PayBox docs). Moot given testnet-only.

## Fees (H, on-chain config)

- `trade_fee_bps: 200`, so 2% on trades. The payer and base (stake vs payout) are not documented; the SDK does not say. The contract source is not published (NOT FOUND in the repo).
- Market creation costs 5 USDT, refunded at 1,000 USDT volume (README).
- Rewards and prestige programmes sit on top ("earn USDT weekly" per the site's meta description).

## Resolution and dispute risk (H on mechanics, M on trust)

- Market fields: `proposed_outcome`, `proposed_by`, `proposed_at`, `resolution_source` and `outcome`. `dispute_window_secs: 86400` (24h).
- The fixtures show resolution is centralised: a "spirit bot" address proposes the outcome, citing a CoinGecko price in `resolution_source`. Market 1 says "Manual resolution by owner".
- Resolution is slow. Markets that ended 2026-04-20 were proposed on 2026-04-24 (about 4 days late). This is high operational and oracle risk, and pending-resolution markets would be mispriced as arbitrage legs.
- Dispute escalation is NOT FOUND.

## Geo, ToS, automation

NOT FOUND. No ToS or geo-restriction text was located in the repo or the site bundle (bundle not searched exhaustively). The SDK explicitly encourages bots and AI agents. On a valueless testnet this is moot.

## Liquidity (H, on-chain query 2026-10-19)

- Testnet only, with fake USDT. Per-market volume is about 10 USDT (the latest 15 markets each have 5 yes / 5 no, seeded by the spirit bot); the largest seen is about 102 USDT (market 2, resolved).
- 78 markets total ever. There is no TVL or OI data, and none that corresponds to real money.
- Independent of other venues: yes, but it is irrelevant as a leg.

## Event overlap

The categories are Crypto (BTC/ETH/XRP price thresholds), Sports (NBA, Champions League, World Cup), Economics (DXY, JPY, TSLA), Politics, AI, Weather. Nominally these overlap Polymarket and Kalshi, but the markets are bot-created one-offs with ad-hoc thresholds and no real depth, so exact-match arbitrage is not realistic.

## Sources

- https://github.com/Nerzhul21-lgtm/onmyo-toba-sdk (README, config.js, query.js, execute.js; commits 2026-04-20 to 2026-04-24) [H]
- GitHub repo metadata via `gh api repos/Nerzhul21-lgtm/onmyo-toba-sdk` (pushed_at 2026-04-24) [H]
- https://onmyo-toba.vercel.app/ and /assets/index-67RhM8Mg.js (HTTP 200 2026-10-19; testnet-only references) [H]
- Testnet LCD smart queries to marketManager, 2026-10-19 (fixtures) [H]
- WebSearch: not performed (budget exhausted) [gap]

## Notes for the adapter, if ever revived

If a mainnet address is published: poll `markets{resolved:false}` and `market_stats` over the LCD. Treat price as a pool ratio, not an executable quote. Subtract the 2% fee. Require `proposed_outcome == null` and `end_time` in the future. Never rely on resolution timing. Skip for now.
