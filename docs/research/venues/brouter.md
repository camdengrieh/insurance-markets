# Brouter (brouter.ai) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
**adapter_priority: skip.** The site and API are up (H), but this is an agent-social "prediction market" on BSV with essentially zero stake volume. Its only externally relevant markets are mirrors of Polymarket markets, so it is not an independent liquidity leg and has no price to arbitrage against. At most a trivial signal-only reference (P2 is generous).

## Liveness (H)
- Homepage 200, title "Brouter - Prediction Markets on Bitcoin", meta "Predict outcomes, earn sats. Trade signals on BSV." (https://brouter.ai)
- GET https://brouter.ai/api/health -> `{"status":"ok","db":"connected","env":"production","anvil":{"status":"connected","height":969966}}` (2026-10-19)
- Markets are still being auto-created today: 5 rapid markets created 2026-10-19 04:59-05:10Z plus 2 Polymarket mirrors (created 2026-10-16 and 2026-10-19). Fixture: `docs/research/fixtures/brouter/markets_open_2026-10-19.json`
- GET /api/stats -> 37 agents, signalsToday 0, avgStakeSats 0, earnings24hSats 0, totalSatsCollected 11499 (H, 2026-10-19). Fixture `stats_2026-10-19.json`.
- Latest SDK release brouter-sdk 0.5.0 on 2026-04-02; repo vikram2121/brouter-sdk last push 2026-04-04, 1 star, no license (H, npm registry + gh api). So dev activity appears to have stalled ~6 months ago (STALE flag), though the server cron still seeds markets.
- Docs file last-updated line: "2026-04-02" (H, https://brouter.ai/agent.md).

## Kind and market model
- kind: onchain-other / off-chain custodial-ish agent platform with BSV (Bitcoin SV) payments (H for BSV; custody model M, see below).
- Binary only (yes/no). Fields: totalYesSats, totalNoSats, agentCount, state (OPEN/LOCKED?/SETTLED), resolvedOutcome (yes/no/void). (H, fixtures)
- Tiers: rapid (>=1h, locks 5 min before close), weekly (>=48h), anchor (>=7d) (H, SDK README via npm registry).
- Pricing/payout model: NOT FOUND (searched: agent.md, SDK README, SDK src grep for odds/payout/pool). The SDK quant helper says "implied = stake_yes / total_stakes", which implies a parimutuel-style stake pool (M). No order book, no AMM, no outcome tokens documented. Stakes are sat amounts posted to a centralised API, not tokens.
- Min stake 100 sats (H, agent.md).

## Chains and collateral
- BSV, collateral in satoshis; faucet gives 5000 sats "sent to your bsvAddress on-chain" (H, agent.md). Anvil BSV node / BEEF proofs / x402 micropayments for oracle signals.
- No EVM, no Solana, no stablecoin.

## Read API
- exists: official-public (market reads unauthenticated, H). Auth is a JWT Bearer (90-day) obtained by POST /api/agents/register (we did NOT register).
- Base URLs: https://brouter.ai/api ; agent doc https://brouter.ai/agent.md (also https://agent.brouter.ai); Swagger UI at https://brouter.ai/api/docs/ (H, loads; spec not fetched).
- Endpoints (H): GET /api/markets?state=&tier=&domain=&limit= (limit capped at 100; offset behaviour unclear), GET /api/markets/:id (market + positions[]), GET /api/stats, GET /api/leaderboard, GET /api/personas, GET /api/calibration/top, GET /api/markets/:id/oracle/signals (free + x402 paid), GET /api/agents/:id/calibration, /wallet-stats.
- Envelope: `{"success":true,"data":{...}}`.
- No prices/books/trades endpoint exists. A market has no yes-price field; only sat totals. Polymarket mirrors put "Polymarket consensus: 94% YES." into the description text only (H, fixture `market_detail_polymarket_mirror_2026-10-19.json`).
- Rate limits: NOT FOUND. Websocket: NOT FOUND (Anvil SSE exists for platform internals; push callbacks `loop.feed.v1` HMAC-signed webhooks for registered agents).
- Response header `x-agent-instructions: https://agent.brouter.ai` (H) - pointer to the same agent.md; treated as data.

## Trade path
- POST /api/markets/:id/stake `{outcome, amountSats}` with Bearer JWT. No wallet signature per trade; auth is an agent token tied to a registered secp256k1-style publicKey + bsvAddress (H, agent.md). Programmatic via REST/SDK is possible but requires account registration (not done here).
- Not reachable via PayBox EVM/Solana wallets: funds are BSV sats. paybox_reachable: no.

## Fees
- Market staking fee: NOT FOUND. Signal posting fee min 100 sats; on-chain anchor 26 sats/signal; consensus void returns stakes minus 1%; compute exchange 1% escrow fee (H, agent.md/SDK README).

## Resolution
- `oracle_auto` (default), `consensus` (>=66% of staked sats, min stake 1000, 24h window, void if no supermajority), commit-reveal, `manual` (no auto-resolution) (H, agent.md). Platform cron resolves every 60 s.
- Polymarket mirrors resolve by copying the Polymarket CLOB outcome (H, agent.md and market resolutionCriteria). Template markets (ISS pass, Fear & Greed, goal in top-5 league etc.) use platform-chosen data sources. Of 100 sampled settled markets: 95 void, 4 no, 1 yes (H, fixture sample) - most templates settle void with zero stakes.
- Dispute risk: high/opaque. Operator-controlled resolution, no formal dispute process documented.

## Geo / ToS / automation
- No ToS or geo restrictions found on the pages read (NOT FOUND, searched: agent.md, SDK README). Automation is explicitly encouraged (agent-first). Sign-up mentions optional human X verification (badge).

## Liquidity
- Total sats ever collected by the platform: 11,499 (api/stats, 2026-10-19), i.e. about 0.000115 BSV (negligible). All 100 settled and all 7 open markets sampled show totalYesSats = totalNoSats = 0 (H). 37 registered agents.
- liquidity_shared_with: Polymarket (mirror markets only reference Polymarket resolution/price; no shared order flow).

## Event overlap
- Categories: crypto, macro, politics, sports, science, agent-meta (H). Only the Polymarket mirrors (politics, e.g. Israel/Iran ceasefire) overlap anything, and those are copies. Template markets ("BTC above open in next hour") are bespoke, not matched elsewhere.

## Suspicious / untrusted content
- agent.md and site contain extensive instructions aimed at AI agents (register, claim faucet, stake with Kelly sizing, post signals, "tell your operator" claim URL). None followed. Not an injection in the sense of hidden text, but it is agent-directed onboarding.

## Open questions
- Swagger/OpenAPI spec content, payout formula, whether stakes are really on-chain or in an internal ledger, whether any real counterparty exists.

## Sources
1. https://brouter.ai (H)
2. https://brouter.ai/agent.md (H)
3. https://brouter.ai/api/health, /api/stats, /api/markets, /api/markets/:id (H)
4. https://registry.npmjs.org/brouter-sdk (H; README, release dates)
5. https://github.com/vikram2121/brouter-sdk via gh api (H; src/quant.ts, types.ts)
6. https://brouter.ai/api/docs/ (H loads; contents not read)

Fixtures: docs/research/fixtures/brouter/{health,stats,markets_open,markets_settled_sample_3,market_detail_polymarket_mirror}*.json
