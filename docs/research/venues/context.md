# Context Markets (context.markets) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

**skip** (as of 2026-10-19). A real venue named Context Markets existed (Base, on-chain settlement, API + SDK, 2026-03/04 activity), but every sign now says it is no longer operating at that domain:

- `https://api.context.markets` and `api-testnet.context.markets` do not resolve in DNS (H, curl exit 6, 2026-10-19).
- `https://docs.context.markets` is a dangling Vercel CNAME: `DEPLOYMENT_NOT_FOUND`, and its TLS certificate has expired (H).
- `https://context.markets/` returns HTTP 200 with `<title>Context Markets</title>` but the served app is a different product, "Almanac" (a Polymarket-builder-program terminal, "(c) 2025 Almanac", Polygon + USDC.e). The Almanac docs say "General Pool trading is currently closed due to lack of interest." (H, read from the JS bundle `/assets/index-WRK9k9II.js`.) `context.markets/docs*` just 307-redirects to `/`.
- GitHub repos `contextwtf/context-sdk`, `context-cli`, `context-mcp`, `context-react`, `context-skills`: last pushes 2026-03-25 to 2026-04-10; npm `context-markets` 0.7.0 last modified 2026-04-21 (H). No commits for about 6 months. `contextwtf/context-plugin` is 404.
- No news of a shutdown or sunset found (NOT FOUND, searched: "Context Markets ... shutting down OR sunset OR wind down 2026"; "context.markets prediction markets"). Cause of the domain change is unknown. Possible explanations: pivot, domain re-pointing, or an outage of the API stack. Do not assume which.
- Could not check on-chain activity: Blockscout API was behind a Cloudflare challenge (not bypassed). Basescan not tried. Open item: query Settlement V2 / Holdings contracts' recent txs to see whether anything settled after April 2026.

The earlier prediction-index listing ("protocol/infra on Base", homepage 200) is explained by the homepage still returning 200; it does not demonstrate a live market.

## Historical spec (from the official SDK repo, now probably unreachable)

Source: github.com/contextwtf/context-sdk (README, CLAUDE.md, openapi.json, src/config.ts, skills/*). All H as to what the repo says; whether it still works is unverified (the API host is gone).

- Kind / market model: central-limit order book (off-chain matching by operator, on-chain settlement), binary YES/NO markets, "AI-powered" market creation from natural-language questions. Outcome tokens are ERC-20 per outcome (`outcomeTokens[]` on Market). Prices are cents 1-99 (on-chain price = cents x 10,000; size = shares x 1,000,000; yes=outcomeIndex 1, no=0). Categorical/scalar: NOT FOUND (only `payoutPcts` field hints at fractional payouts).
- Chains / collateral: Base mainnet (chainId 8453), testnet Base Sepolia (84532). Collateral USDC (Base native `0x833589fC...2913`), deposited into a Holdings contract. Settlement V2 `0x00000000008c286A2aaa99c6Be3b3D405A929500`, Holdings (new) `0x0000000000CcA5bC44912C63d63e1673FeE923f6` (H, src/config.ts). A "legacy" settlement/holdings pair and a migration API exist (V1 to V2).
- Read API: official, public, unauthenticated for markets. Base URL `https://api.context.markets/v2` (testnet `https://api-testnet.context.markets/v2`). Spec: "Context public API v2", OpenAPI in the repo. Unauthenticated endpoints (no `security`): `GET /markets`, `/markets/search`, `/markets/{id}`, `/markets/{id}/orderbook`, `/markets/{id}/prices`, `/markets/{id}/oracle`, `/markets/{id}/activity`, `POST /markets/{id}/simulate`, `GET /activity`. Orders, portfolio, balance: Bearer API key (`ctx_pk_...`). `/markets` limit max 50, opaque cursor, sort by trending/new/ending/chance/volume, filters status/category/resolutionStatus. Orderbook shape: `{marketId, bids:[{price,size}], asks:[{price,size}], timestamp}`. Rate limits: 429 exists, numbers NOT FOUND. WebSocket: NOT FOUND. Fixture: `docs/research/fixtures/context/openapi-subset.json` (spec subset, NOT a live response, because the API is unreachable).
- Trade path: API key (obtained via the website/Discord, M) plus EIP-712 signed orders (domain = Settlement contract on Base) POSTed to `/orders` (fields: trader, marketId, outcomeIndex, side, price, size, nonce, expiry, timeInForce GTC/IOC/FOK, maxFee, signature). On-chain steps: approve USDC and set operator on Settlement, deposit into Holdings; gasless operator relay available (`/gasless/operator`, setOperatorBySig). Mint/burn complete sets on-chain.
- PayBox reachability: if the venue were live, partial/yes. A Base EVM wallet could do the approve/deposit/withdraw/mint transactions as normal transaction proposals, and orders are EIP-712 typed-data signatures (needs a PayBox typed-data signing tool plus a Context API key). Today: no, because the backend is unreachable. (M, inferred.)
- Fees: SDK constant `FEE_DIVISOR = 100`, `calculateMaxFee` "1% of notional, minimum 1n" (a cap on `maxFee` per order); order results carry `takerFee`/`cumulativeTakerFee`. Maker fee, exact schedule: NOT FOUND. (H for constants, M for interpretation.)
- Resolution: AI-assisted oracle. Market has `oracle` address, `metadata.criteria`, `sourceAccounts` (social accounts monitored), oracle summary with decision, confidence level, posts collected; `resolutionStatus` none/pending/resolved. Dispute process / who finalises on-chain: NOT FOUND. Dispute risk: high/unknown (subjective criteria, X-account-based sources). (H for fields, M for risk.)
- Geo / ToS / automation: Terms NOT FOUND (site gone; docs host dead). The SDK explicitly targets bots/agents (MCP server, CLI, skills), so automation was intended. Geo rules NOT FOUND.
- Liquidity: NOT FOUND. No volume/OI/TVL source found; `participantCount` field exists but no data retrievable. Nothing dated 2026 shows meaningful volume.
- Event overlap: user-generated/AI-generated questions, heavily X/social-post driven (M, from `sourceAccounts`); likely crypto/price and pop-culture, not deep sports/politics. Liquidity presumably independent (own book) but thin/unknown. No shared-liquidity evidence.

## Adapter priority

skip. Re-check only if (a) the API host resolves again or (b) on-chain Settlement V2 shows trades after April 2026. If revived, it would rank P2 (thin, own order book, good API, AI-resolved).

## Suspicious content

None. Note that context.markets now serves an unrelated product (Almanac); treat its content as unrelated to Context.

## Sources

- https://context.markets/ (HTML + JS bundle, 2026-10-19) - H
- https://docs.context.markets/ (Vercel DEPLOYMENT_NOT_FOUND, expired cert) - H
- https://github.com/contextwtf/context-sdk (README, CLAUDE.md, openapi.json, src/config.ts, src/constants.ts, skills/SKILL.md, skills/api-reference.md, skills/patterns.md) - H
- https://github.com/contextwtf/context-cli, context-mcp, context-react, context-skills (push dates via GitHub API) - H
- https://registry.npmjs.org/context-markets (modified 2026-04-21) - H
- DNS lookups for api.context.markets, api-testnet.context.markets, docs.context.markets - H
- https://predictionindex.xyz/ecosystem (page truncated in fetch, Context entry not seen) - L
