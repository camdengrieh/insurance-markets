# Swipr (swipr-sdk / swipr-cli) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

**skip.** Swipr is not a venue and is no longer reachable. It is a thin "agent API" wrapper (published to npm in a ~50 minute burst on 2026-04-15) that appears to proxy/analyse Polymarket and Kalshi markets. Its only host, `swipr.app`, is now a Spaceship "domain for sale" parking page, so the API is dead (H). Even when it was live it would not have been an independent liquidity leg (the SDK's `Market.venue` field and keywords point to Polymarket/Kalshi, M).

## Is it still live? No (H)

- `https://swipr.app/` on 2026-10-19 returns HTTP 200 with title "Swipr.app for sale | Spaceship.com" and og:title "Buy Swipr.app | Spaceship". Page Last-Modified: 2026-09-29. Fixture: `docs/research/fixtures/swipr/swipr-app-homepage-2026-10-19.txt`. (H)
- `https://swipr.app/api/x402/status`, `/api/x402/markets?limit=2`, `/llms.txt`, `/.well-known/x402` all return "Empty reply from server" (curl error 52) - the parking host serves no API. (H)
- `swipr.ai` returns HTTP 404 (H). `www.swipr.app` serves the same for-sale page (HTTP 200).
- No docs site, GitHub repo, homepage or repository field exists in npm metadata for any of the packages (H, registry JSON). NOT FOUND (searched: npm registry fields homepage/repository/bugs, npm readme, WebSearch extended "Swipr prediction market agent API x402 swipr.app").
- WebSearch found only an agent-registry listing (hol.org) describing "swipr" as an "AI prediction market analyst for Polymarket/Kalshi/sports"; no pricing, no endpoints (M, not opened).

## Packages (H, https://registry.npmjs.org/swipr-sdk , /swipr-cli , /swipr-pay-client)

| Package | Versions | Published |
|---|---|---|
| swipr-sdk | 0.1.0 - 0.1.2 | all 2026-04-15 (created 05:49Z, last 06:20Z) |
| swipr-cli | 0.1.0 - 0.1.7 | all 2026-04-15 |
| swipr-pay-client | 0.1.0 - 0.1.1 | 2026-04-15 |

- MIT licence, single maintainer account, no activity after 2026-04-15 (6 months stale). The npm page's "swipr-mcp" does not exist on the registry (`{"error":"Not found"}`); the hint's "mcp" claim is NOT FOUND.
- Saved: `docs/research/fixtures/swipr/npm-swipr-sdk-meta.json` (trimmed metadata, no maintainer contact).
- I downloaded the swipr-sdk 0.1.2 and swipr-cli 0.1.7 tarballs and read the source only (nothing installed or executed). Saved reference copies: `fixtures/swipr/swipr-sdk-0.1.2-client.ts`, `swipr-sdk-0.1.2-types.ts`.

## Market model (M, from SDK types only; no live API to confirm)

- Binary Yes/No markets: `Market {id, question, category, venue, yesPrice, noPrice, volume, endDate, edgeSignals}`; `MarketDetail` adds `orderBook {bestBid,bestAsk,spread}`. Categories seen: CRYPTO, POLITICS, SPORTS, GENERAL. (H that the types say this; M that it reflects reality.)
- The `venue` filter plus keywords `polymarket`, `kalshi` indicate markets are mirrored from other venues, not native Swipr markets. No on-chain contract, outcome token or settlement layer is mentioned anywhere in the package. NOT FOUND (searched: sdk/cli source for contract addresses, chain ids except x402 network default).
- `TradeTicket.status` is `ACCEPTED | FILLED | CANCELLED` with `fee`, `feeRate`, `slippage`: looks like an off-chain "ticket" service, possibly paper/simulated. Unknown. (L)

## Chains and collateral

- Only chain reference: x402 payment network default `eip155:84532` (Base Sepolia testnet) in `SwiprAgentConfig.network` (H). Vault client mentions aave/moonwell/lido yield and a cross-chain swap (H that the methods exist). No trading collateral documented. NOT FOUND.

## Read API (unofficial-only / dead)

- Base URL hard-coded as `https://swipr.app` (H, client.ts). Now dead (see above). Docs URL: none.
- Endpoints in the SDK (all under `/api/x402/...`, x402-paid, per the SDK header; USDC on EVM via `@x402/evm`): `GET markets?category&venue&search&limit&offset`, `GET markets/{id}`, `POST agent/analysis` (montecarlo, taker-edge, bias, calibration-curve, category-efficiency, optimal-prices, market-score), `GET agent/alerts` (edge signals incl. ARBITRAGE), `GET agent/stream` (SSE: snapshot/edge_signal/market_update), `GET agent/portfolio`, `GET agent/leaderboard`, `GET agent/sports/odds|handicap|consensus|injuries`, `GET status` (said to be free). Separate `/api/sril/*` "regulatory intelligence" endpoints with `X-SRIL-API-Key`: `ueci`, `ueci/search`, `tape` (cross-venue consolidated tape with arb flag), `tape/best-execution`, SSE streams. (H that SDK references them; no response shapes could be confirmed because the host is down.)
- Rate limits / tiers: SDK types mention agent tiers FREE/PRO/FUND/INSTITUTION with `dailyCallLimit`, `monthlyUsd`, `tradingFeePct`; values NOT FOUND.
- Fixtures of real responses: none possible (no live endpoint). 402 was not triggered (no response at all).

## Trade path

- SDK `POST /api/x402/agent/trade {walletAddress, marketId, outcome, amount, slippage}` returns a `TradeTicket`. Auth is an x402 payment signature plus "agentAuth" in `swipr-pay-client` (not read in detail; the package was not opened beyond SDK/CLI). No order signing against an exchange, no EIP-712 order schema, no transaction proposals. (H on the SDK shape.) Dead anyway.
- PayBox reachability: **no**. Nothing to trade; at most one could pay x402 fees via `pay_x402`, which is pointless with the host down.

## Fees / resolution / geo-ToS / liquidity

- Fees: `fee`, `feeRate`, `tradingFeePct`, "x402Discount" fields exist; formulas NOT FOUND.
- Resolution: NOT FOUND (a `RESOLUTION` webhook event exists; resolution presumably inherited from source venues, L).
- Geo/ToS/automation: NOT FOUND (no ToS page reachable).
- Liquidity: NOT FOUND (no volume/TVL anywhere; site is parked).
- Shared liquidity: M - mirrors/routes to Polymarket and Kalshi, so NOT an independent arbitrage leg.
- Event overlap: sports, politics, crypto price categories listed, but only as copies of other venues' markets.

## Value to this project

- Not a venue to integrate. The only conceivable use is as a design reference: Swipr's `sril/tape` types (`TapeEntry`, `ExecutionRoute`, `UeciRecord` with `ueciCode`, `maxDivergence`, `effectivePrice`, `feeRate`) are a plausible schema for a cross-venue canonical-question id ("UECI") and best-execution router, relevant to docs/market-linking-design.md. L: it is an unverified, abandoned sketch.

## Suspicious content

- None found in packages that targets an AI agent. Note for safety: the SDK's `privateKey` config asks callers to hand a raw EVM private key to a third-party x402 client (`swipr-pay-client`, `file:../x402-client` dependency in early versions). Do not use.

## Open questions

- Whether a successor domain/brand exists (searched npm, web, swipr.ai; none found).
- Whether the swipr.app API ever returned real data; no Wayback check was made.

## Sources

- https://www.npmjs.com/package/swipr-sdk (hint; not fetched, npm web UI) 
- https://registry.npmjs.org/swipr-sdk (H)
- https://registry.npmjs.org/swipr-cli (H)
- https://registry.npmjs.org/swipr-pay-client (H)
- https://registry.npmjs.org/swipr-sdk/-/swipr-sdk-0.1.2.tgz (H, source read only)
- https://registry.npmjs.org/swipr-cli/-/swipr-cli-0.1.7.tgz (H, source read only)
- https://swipr.app/ (H, parked for-sale page 2026-10-19)
- https://swipr.ai/ (H, 404)
- WebSearch "Swipr prediction market agent API x402 swipr.app" -> hol.org registry listing (M, not opened)
