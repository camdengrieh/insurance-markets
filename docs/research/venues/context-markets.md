# Context Markets (context.markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Done: unauthenticated GETs to context.markets and its site bundle, DNS lookups, a TLS-date check of docs.context.markets, npm registry GET, GitHub reads via `gh api` (generic User-Agent `insurance-markets-research/0.1`). Not done: no account, key, wallet, signing, POST, or PayBox tool. Third-party text treated as untrusted data.

Limitation: the shared WebSearch budget was exhausted, so no press/X/Discord announcement of the shutdown could be searched. `docs.context.markets` has an expired TLS certificate and could not be fetched. Everything below comes from the live site bundle, the official GitHub org and DNS.

Tags: **H** = read first-hand in a primary source this session; **M** = inference from first-hand data; **L** = weak/stale.

---

## 0. Bottom line

1. **The venue has been SUNSET. It is not live.** The live homepage (a Vite/React app) now only offers log-in, withdrawal of unclaimed USDC on Base and a transaction-history download. Its text: "We've made the difficult decision to sunset Context markets ... All markets have been closed out without loss to traders." (H, https://context.markets/assets/index-WRK9k9II.js, fixture `sunset-evidence-2026-10-19.txt`). The hint that predictionindex.xyz lists it as "live" is stale.
2. **The trading API host no longer resolves.** `api.context.markets` and `api-testnet.context.markets` return no DNS answer (curl exit 6) (H). `docs.context.markets` still points at Vercel but its TLS cert expired 2026-07-03 (H, openssl s_client), consistent with an unmaintained site.
3. Last code activity: npm `context-markets@0.7.0` published 2026-04-04, GitHub `contextwtf/context-sdk` last push 2026-04-04 (H). The exact sunset date is NOT FOUND (searched: site bundle, GitHub README/commits, npm; web search budget exhausted).
4. **adapter_priority = skip** (closed, API gone). Useful only as a design reference (section 7) and for the "Quotient/AI-oracle as signal" idea, which no longer has a live feed.

---

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://context.markets/ (200, Vercel-style SPA, title "Context Markets") | Bundle contains the sunset message and USDC-withdrawal UI; also hard-coded vault addresses/locked amounts for v1 and v1.1 reward vaults (redeem/claim flows) | H |
| `dig api.context.markets`, `dig api-testnet.context.markets`, `app.context.markets` | no answer | H |
| `curl https://api.context.markets/v2/markets` | curl exit 6 (could not resolve host) | H |
| docs.context.markets | CNAME cname.vercel-dns.com; cert notBefore 2026-04-04, notAfter 2026-07-03 (expired, not renewed) | H |
| npm `context-markets` | latest 0.7.0, 2026-04-04T17:26:47Z | H |
| GitHub `contextwtf/*` (org "Context", blog context.wtf, created 2021-02-24) | `context-sdk` 2026-04-04, `context-cli` 2026-04-10, `contracts` 2025-10-14; none archived | H |

**still_live = false.** Venue vs infra: it was a real venue (own contracts, own order book), not infra. Predictionindex's "Base protocol/infra" label was loose (L).

---

## 2. Kind and market model (historical, from official SDK/contracts) 

- kind: onchain-orderbook prediction market on Base ("an AI-powered prediction market platform on Base"). (H, https://github.com/contextwtf/context-sdk README)
- Binary markets only seen: outcomes "yes"/"no" mapped to on-chain `outcomeIndex` (yes=1, no=0); prices in cents 1-99, sizes in contracts; on-chain price x10,000, size x1,000,000 (H, SDK `skills/SKILL.md`, `src/constants.ts`). Market object has `outcomeTokens[]`, `outcomePrices[]`, `payoutPcts`, `resolutionCriteria`, `deadline` (H, `skills/api-reference.md`).
- Order book with off-chain matching and on-chain settlement: signed EIP-712 orders posted to a REST API, Settlement contract settles (H, `src/config.ts`, `src/signing/eip712.ts`). Time-in-force GTC/IOC/FOK; order kinds Buy, SellInventory, SellNoInventory (H).
- Outcome tokens: ERC-20 per outcome (`OutcomeToken.sol`, "ERC20 token representing a market outcome"), complete sets mintable/burnable (H, contracts README; SDK `ctx.account` "mint/burn complete sets").
- Anyone could submit a natural-language question and create a market (`/questions`, `/markets/create`) (H, openapi paths).

## 3. Chains and collateral

Base mainnet (chainId 8453), Base Sepolia testnet (84532). Collateral USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (native Base USDC). Contracts (H, `src/config.ts`): Settlement V2 `0x00000000008c286A2aaa99c6Be3b3D405A929500`, legacy Settlement `0x000000000000aF25d425101A0C8e3adFB67BCfD0`, Holdings (deposit vault) new `0x0000000000CcA5bC44912C63d63e1673FeE923f6`, legacy `0x0000000000001dDF1a31899d57ddAd89DE10ab1b`; PredictionMarket `0x000000000000CE50e1e1F6f99B2E5e98e5b6c609`; token staking Vault `0x98a272c0F97c32DF73b3cBed26A67b07a50F2AFd` (H, contracts README). Funds sat in the Holdings contract; the shutdown site withdraws "unclaimed USDC" from it. Contract state on chain not queried (no POST/RPC).

## 4. Read API (now unreachable)

- exists: official-public (reads unauthenticated) - but **dead**. Base URLs (H, SDK `src/config.ts`): `https://api.context.markets/v2` (mainnet), `https://api-testnet.context.markets/v2`. Docs: https://docs.context.markets (cert expired). OpenAPI spec in repo: `openapi.json` ("Context public API", v2) in https://github.com/contextwtf/context-sdk (242 KB; path summary saved as fixture).
- Endpoints (H, openapi): `GET /markets` (filters status, resolutionStatus, category, search, cursor), `/markets/{id}`, `/markets/{id}/orderbook?depth&outcomeIndex`, `/markets/{id}/prices?timeframe`, `/markets/{id}/oracle`, `/markets/{id}/activity`, `/activity`, `POST /markets/{id}/simulate`, `/portfolio/{address}`, `/positions`, `/claimable`, `/balance/*`. Orders (`POST/GET /orders`, `/orders/cancel`, `/orders/bulk`) need `apiKey` Bearer.
- Auth/limits: reads need no key; orders need Bearer API key obtained via the site or Discord. Rate limits: only "429 Rate Limited" documented, numeric limits NOT FOUND. WebSocket: NOT FOUND (searched SDK file list, openapi paths, api-reference).
- No live response shape could be confirmed (host does not resolve). Fixtures instead: homepage HTML, sunset evidence, openapi path summary.

## 5. Trade path (historical)

Gasless-capable; sign EIP-712 `Order` against Settlement V2 domain (`name "Settlement"`, version "2", chainId 8453), POST to `/orders` with API key. Needs one-time on-chain USDC approval to Holdings and operator approval (`setOperator(Settlement,true)`), then deposit. Signature-only orders would have been compatible with a PayBox EVM wallet via `request_wallet_sign` typed data, plus ordinary tx proposals for approve/deposit on Base. **Moot: API gone.** paybox_reachable = no (venue closed). The only remaining action is a user withdrawing leftover USDC on Base via the site/Holdings contract, which is not an arbitrage function.

## 6. Fees, resolution, geo/ToS, liquidity

- Fees: taker fee ~1% of notional (SDK `FEE_DIVISOR = 100`, `calculateMaxFee` "1% of notional, minimum 1n"); order book levels carry `takerFee`. Maker fee/rebates NOT FOUND. (H for the constant, M for the interpretation.)
- Resolution: market has an `oracle` address and `resolutionStatus none|pending|resolved`; `/markets/{id}/oracle` returns an AI-agent summary (sources monitored, evidence posts, decision, confidence) and `oracleQuotes` gives AI probability quotes using "reference markets" (H, api-reference). It is an AI/centrally operated oracle; dispute process NOT FOUND (searched SDK docs and contracts README). Dispute risk would have been high; now moot.
- Geo/ToS/automation: NOT FOUND (docs site unreachable; terms not located). SDK explicitly supports bots, MCP server, CLI, and an agent "skills" repo, so automation was encouraged. 
- Liquidity: no volume/OI/TVL figure found (searched site bundle, SDK; no external source because search budget gone). Now zero: all markets closed.
- Event overlap: market creation was open-ended natural-language (e.g. "BTC close above $100k"), so crypto-price/politics/sports overlap with other venues was possible; category list not confirmed. Moot.
- Shared liquidity: none known; independent order book (M).

## 7. Notes for the project

- Reuse idea: its API returned `orderbook` with cumulative fee and fill simulation (`/markets/{id}/simulate`, `/orders/simulate`), a good model for our own fee-aware depth walker. The EIP-712 order with `maxFee`, `expiry`, `nonce`, `makerRoleConstraint` is another example of signed-order venues the plugin may face on other Base venues.
- Remove from any "live venue" list; keep as a tombstone so a future scan does not re-add it.

## Sources

- https://context.markets/ and https://context.markets/assets/index-WRK9k9II.js (sunset text) - H
- https://github.com/contextwtf (org), https://github.com/contextwtf/context-sdk (README, `src/config.ts`, `src/constants.ts`, `src/signing/eip712.ts`, `openapi.json`, `skills/SKILL.md`, `skills/api-reference.md`, `skills/patterns.md`) - H
- https://github.com/contextwtf/contracts (README, deployments) - H
- https://registry.npmjs.org/context-markets - H
- DNS/TLS probes of api.context.markets, api-testnet.context.markets, docs.context.markets - H
- Hint source https://predictionindex.xyz/ecosystem (not re-read; stale "live") - L

Fixtures: `docs/research/fixtures/context-markets/` (homepage HTML, sunset-evidence text, SDK openapi path summary).
