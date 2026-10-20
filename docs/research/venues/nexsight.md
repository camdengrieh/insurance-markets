# Nexsight (nexsight.xyz) - venue spec

Researched 2026-10-19. Verdict: **skip**. The only web host is disabled (Vercel DEPLOYMENT_DISABLED), the API is unreachable, there are no docs, the project is a single-developer SDK published in Feb 2026 and not touched since, and no volume/TVL evidence exists.

Confidence tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.

## Is it live? (H: probably dead)
- `GET https://nexsight.xyz`, `/docs`, and `/api/v1/agent/markets?status=active&limit=2` all return HTTP 402 with body `Payment required / DEPLOYMENT_DISABLED`, header `server: Vercel`, `x-vercel-error: DEPLOYMENT_DISABLED` (checked 2026-10-19). This is Vercel's "deployment disabled" page (project paused/suspended, typically billing or policy), not an x402 payment challenge. No payment requirements to record. (H)
- `api.nexsight.xyz` and `docs.nexsight.xyz` return 404 from the host (no such site). (H)
- npm `@nexsightxyz/agent-sdk`: single version 1.0.0, created and modified 2026-02-25, nothing since (7+ months stale). (H, https://registry.npmjs.org/@nexsightxyz/agent-sdk)
- GitHub: org `nexsightxyz` is a User account created 2026-02-09 with exactly 1 public repo `sdk` (created 2026-02-26, last push 2026-02-26, not archived). The npm `repository.url` points to `nexsightxyz/agent-sdk`, which 404s. (H)
- Anchor mainnet deployment of the program not verifiable: solscan returned 403; JSON-RPC needs POST (not allowed under read-only rules). (NOT FOUND)
- WebSearch was unavailable (session limit) so no independent press, Twitter or DefiLlama check was made. NOT FOUND (searched: npm, GitHub user/repo/code search, direct host probes, wayback attempt got HTTP 429).

## Kind and market model (M: derived from SDK source, not from docs)
- Kind: on-chain Solana prediction market, binary YES/NO only (`outcome: 'yes' | 'no'`; resolved outcome `Yes | No | Invalid`). Market status enum: pending, active, locked, resolving, resolved, disputed, cancelled, paused.
- Pricing: CPMM pools ("Initial liquidity in SOL to seed the CPMM pools" in `CreateMarketParams`), i.e. an AMM, not an order book. Prices quoted as cents 0-100 (`yesPrice`, `noPrice`).
- Outcome tokenisation: per-market SPL YES mint and NO mint PDAs (`deriveYesMintPda`, `deriveNoMintPda`), plus vault PDA and per-user position PDA. Anchor program id `F4JxF7aePgrKKwmVM9tXHUadeTKNLXwFMZFQoiBowLcr`. (H that SDK constants say this; mainnet existence unverified)
- Permissionless market creation by any wallet with seed liquidity, so market quality is unvetted.
- Source: https://github.com/nexsightxyz/sdk (src/constants.ts, src/types.ts, src/pda.ts, src/agent.ts).

## Chains and collateral
- Solana only. Collateral is wSOL (`So111...112`, 9 decimals), not a stablecoin. Prices are therefore SOL-denominated exposure; any cross-venue arb carries SOL/USD basis risk. (H, src/constants.ts)
- SDK defaults to devnet; mainnet is an option (`cluster: 'mainnet-beta'`). No evidence in this session that a mainnet deployment holds real markets.

## Read API (unofficial-ish, undocumented; currently down)
- exists: official SDK only, no docs site. Base URL from SDK: `https://nexsight.xyz/api/v1/agent` (H as SDK default; currently HTTP 402 DEPLOYMENT_DISABLED).
- Endpoints inferred from `src/client.ts` (H as SDK source):
  - `GET /markets?status=active|locked|resolved|all&category=&limit=&page=` returns `{data: AgentMarket[], pagination:{page,limit,total}}`
  - `GET /markets/{marketId}`
  - `GET /positions?wallet=`
  - `GET /balance/{wallet}`
  - `POST /markets/create`, `POST /bet/build`, `POST /claim/build`, `POST /tx/submit` (not called)
- `AgentMarket` fields: marketId, pubkey, title, description, category, status, yesPrice, noPrice, totalYesShares, totalNoShares, totalCollateral, volume24h, participantCount, oracleSource (pyth|switchboard|manualAdmin), oracleFeed, oracleThreshold, lockTimestamp, endTimestamp, feeBps, minBet, maxBet, resolvedOutcome.
- No order book, no trades endpoint, no websocket, no resolution endpoint documented. Auth: none in client (no API key header). Rate limits: NOT FOUND.
- Fixtures: none saved. No live response could be obtained; the type definitions above are the only shape evidence.

## Trade path
- "A2A" flow: API builds an unsigned base64 Solana transaction, agent signs locally with its Solana keypair, then POSTs to `/tx/submit` (falls back to RPC `sendRawTransaction`). Bet params: wallet, marketId, outcome, amount (SOL), slippageBps (default 200). (H, src/agent.ts)
- Direct (no-API) mode is a stub that throws "requires the full IDL bundle". So the program IDL is not published in the repo. (H)
- PayBox reachability: **no / unknown**. Only a Solana wallet could trade, via a custom Solana transaction; PayBox's EVM chains cannot. Even for a PayBox Solana wallet, transaction would need to be built by a defunct API or by reverse-engineering the Anchor program. Not practical.

## Fees
- Per-market `feeBps` field exists; value and who pays NOT FOUND (no platform docs). SDK `evaluateMarket` computes `feeAmount = amount * feeBps/10000` (H as code, no actual numbers).

## Resolution mechanism and dispute risk
- Oracle sources enum: Pyth, Switchboard, ManualAdmin. The SDK example uses `oracleSource: 'ManualAdmin'` for a market creation. Status includes `disputed` but no dispute procedure is documented. High centralisation risk: admin-resolved, unvetted permissionless markets, `Invalid` outcome exists. (M)

## Geo / ToS / automation
- NOT FOUND (site disabled; no ToS or docs readable). The SDK is explicitly designed for autonomous agents (keywords a2a, ai-agent). MIT licence on SDK. (H)

## Liquidity
- NOT FOUND. No volume/OI/TVL source (no DefiLlama check possible; site down; `volume24h` field only available from the dead API). Treat as effectively zero/unknown as of 2026-10-19.

## Event categories overlapping other venues
- Declared categories: Crypto, Sports, Politics, Entertainment, Weather, Custom (H, types.ts). Example market: "Will SOL be above $200 by end of March?" (crypto price). Overlap in principle with crypto price, sports, politics, but with no evidence of any live market, no usable arb.

## Shared liquidity
- Independent AMM pools seeded by market creators (M). No evidence of sharing with another venue.

## Adapter priority: skip
- Dead host, no docs, SOL collateral AMM, admin-resolved, no liquidity data, not reachable from PayBox EVM wallets. Revisit only if `nexsight.xyz` returns 200 and an on-chain market with real TVL is observed. If ever revived, a read-only adapter could poll `GET /markets` and map `yesPrice/100` to probability (AMM spot price, not executable depth).

## Suspicious content
- None found. Note: npm metadata lists a personal-looking gmail address for the maintainer; not recorded here.

## Sources
- https://www.npmjs.com/package/@nexsightxyz/agent-sdk via https://registry.npmjs.org/@nexsightxyz/agent-sdk (H: README, metadata, publish dates)
- https://github.com/nexsightxyz/sdk (H: src/constants.ts, client.ts, types.ts, agent.ts, README)
- https://github.com/nexsightxyz (H: account created 2026-02-09, 1 repo)
- https://nexsight.xyz, https://nexsight.xyz/api/v1/agent/markets (H: HTTP 402 DEPLOYMENT_DISABLED, 2026-10-19)
