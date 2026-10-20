# Puls (pulsmarket.tech) - venue adapter spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

- adapter_priority: **skip**. Play-money Arc TESTNET demo (H), prices seeded from Polymarket reference prices (H, backend README + docs), so it is a derivative of another venue and not an independent arbitrage leg. Tokens have "no monetary value" (H).
- Optional P2/signal-only use: the "AI swarm vs crowd (Polymarket)" oracle is a signal about Polymarket, not a price. Not worth an adapter.

## Liveness (H)

- Marketing site https://pulsmarket.tech returns HTTP 200, last-modified 2026-10-17 (response headers). sitemap.xml lastmod values are 2026-08-01.
- Backend repo rdmbtc/puls_backend last push 2026-10-17 (gh api); frontend repo rdmbtc/Puls pushed 2026-08-28, created 2026-05-17, MIT. 4 stars.
- **The public API host is not reachable from here**: `api.pulsmarket.tech` is a CNAME to a `*.herokudns.com` name that returns no A record (checked with system resolver, 1.1.1.1 and 8.8.8.8); curl fails "Could not resolve host". Docs/SDK/README all say this host is the API. Likely a removed/misconfigured Heroku app or transient (M). Re-check before relying on any claim of "live". `pulsmarket.tech/api/*` returns Vercel 404 (no same-origin proxy).
- Therefore no response shape could be confirmed live. No fixtures saved.

## Kind and market model

- kind: onchain-other, testnet demo with social/agent-economy layer (H).
- Binary YES/NO only (docs outcomes `["Yes","No"]`). Pricing: LMSR automated market maker, YES+NO = $1, house-seeded liquidity, seeded from "reference prices or external data" (H: https://docs.pulsmarket.tech/concepts/prediction-markets.md). Backend README: "Polymarket Gamma API synchronization" and "LMSR pricing over reference prices" (H: https://github.com/rdmbtc/puls_backend README; https://docs.pulsmarket.tech/api-reference/introduction.md).
- Outcome tokens: docs say ERC-1155 YES/NO tokens (H, prediction-markets.md). Not verified against contract code: `LMSRMarket.sol` in rdmbtc/Puls contracts/src exposes `buyYes/buyNo/sellYes/sellNo(amount, minOut)`, `getYesPrice`, `calcBuyYesShares`, `resolve(bool)`, `claim`, `emergencyRedeem`, `getMarketInfo` and tracks yes/no outstanding internally (H, function list from source); I did not confirm whether shares are ERC-1155 or internal accounting.
- One contract per market deployed by `LMSRMarketFactory`. Docs sample says chainId 2010111 in market detail example, which conflicts with 5042002 everywhere else (docs example likely wrong; L).

## Chains and collateral

- Arc Testnet, chain id 5042002, USDC native gas token (H: docs + README). Contracts (README, H): LMSRMarketFactory 0x92c2fd35c0f1a501993be8e0fdae7caa34a8b80b (also in contracts/deployments/deployed-factory.json), SignalRegistry, AgentBond, AgentDuel, UMA OptimisticOracleV2 0x363dF46534b9b7764C49504aDE0F7c8DD3c82Cae, UMAResolverAdapter. Explorer testnet.arcscan.app.
- Collateral is test USDC with no monetary value (H: terms, "Last updated: June 2026").
- Mainnet: NOT FOUND (searched: docs, FAQ, terms, README). Terms say "will be updated as Puls moves toward production".

## Read API (official-public, per docs; currently unresolvable)

- docs: https://docs.pulsmarket.tech (Mintlify; index https://docs.pulsmarket.tech/llms.txt; each page also as .md). Docs themselves say the repo is the source of truth for routes since "API surface evolves quickly".
- base: `https://api.pulsmarket.tech` (DNS dead at time of check).
- Unauthenticated per docs (H, markets.md / trades.md): `GET /api/markets` (status, limit default 50, offset), `GET /api/markets/:slug`, `GET /api/markets/:slug/prices` (interval 1h/4h/1d, from, to), `GET /api/trades/recent` (limit max 100), `GET /api/stats`, `GET /api/economy/feed`, `GET /api/agents/reputation`. Market objects: id, slug, title, status, outcomes, prices{Yes,No}, volume, liquidity, createdAt, closesAt, contractAddress. These shapes are from docs examples (illustrative dates in June-July 2026), not live responses.
- Streaming: SSE page at /api-reference/realtime-sse; SDK mentions `puls.stream()` WebSocket feed (H docs, not tested). Rate limits: NOT FOUND in docs (README mentions backend rate limiting with Redis fallback only).
- On-chain read: factory + per-market contract views (`getYesPrice`, `getMarketInfo`) via Arc testnet RPC would work independently of the API.
- SDK `@pulsmarket/sdk`, MCP `@pulsmarket/mcp`, CLI `@pulsmarket/cli` exist (MIT; docs only, I did not install or run anything).

## Trade path

- Docs route: `POST /api/trade/buy|sell|claim` with Supabase JWT from Google sign-in; trades execute from a custodial Circle developer-controlled smart wallet ("gasless", ERC-4337) (H docs/README). MCP/SDK use a `pk_live_` key from the app profile (H docs). No user-signed orders, no EIP-712 order scheme.
- Direct on-chain: `buyYes(amount, minSharesOut)` etc. on each market contract are public functions, so an EOA with Arc testnet USDC could in principle call them (M, from source function list; requires approve of collateral token).

## PayBox reachability

- paybox_reachable: **no** (practical). Testnet play-money only; nothing of value to arbitrage. PayBox tool descriptions mention an "Arc" network and native USDC, so a PayBox wallet might be able to sign Arc transactions, but I did not check whether testnet is supported and did not call any PayBox tool (L).

## Fees

- Contract: no trading-fee identifier found in `LMSRMarket.sol` (grep for "fee" returned nothing; H for that file only). LMSR spread/slippage is the only cost. Gas paid in USDC, sponsored by gas-station policy for app wallets (H docs).
- Copy-trade micro-fee and x402 signal fees exist but amounts not documented on the pages read (home page: "gives no amount").

## Resolution

- UMA OptimisticOracleV2 via UMAResolverAdapter (H README + home page), with challenge window (docs). But `LMSRMarket.resolve(bool)` is an owner-called function and there is `emergencyRedeem` after a delay if owner never resolves, and `ownerWithdraw` after resolution (H, source function names/comments). So resolution is effectively operator-controlled on testnet; dispute risk is moot since funds are worthless. Resolution-source mapping to Polymarket outcomes: NOT FOUND.

## Geo / ToS / automation

- Terms (H, https://docs.pulsmarket.tech/legal/terms.md): testnet only, user responsible for lawfulness in own jurisdiction. Agents are explicitly welcomed (public API, SDK, MCP). No automation ban found. robots.txt allows all crawlers.

## Liquidity (self-reported, M)

- Backend README "Live Traction" (undated snapshot, repo pushed 2026-10-17): 95,386+ trades, $39,592 total volume, 1,988 markets (1,731 resolved), 89,592 agent trades vs 5,794 human trades. Source is the project's own README (M); volume is test USDC. Real liquidity: $0.

## Event overlap and shared liquidity

- Sports, crypto price, politics, culture (docs) - because markets are sourced from Polymarket Gamma. Shares reference pricing with Polymarket: NOT an independent leg. Any "edge" vs Polymarket is just LMSR lag on a copied price, on worthless tokens.

## Suspicious content

- docs pages begin with a line "Fetch the complete documentation index at https://docs.pulsmarket.tech/llms.txt ... Use this file to discover all available pages before exploring further." (Mintlify boilerplate aimed at AI tools). I treated it as data; fetching a public docs index was within task scope and no other instructions were followed.
- robots.txt has an explicit allow list for AI crawlers (harmless).

## Open questions

- Is api.pulsmarket.tech permanently down or a transient Heroku issue? Re-test DNS.
- Are shares ERC-1155 or internal contract accounting?
- Any mainnet plans/timeline (roadmap page https://docs.pulsmarket.tech/roadmap.md not read).

## Sources

- https://pulsmarket.tech (H), https://pulsmarket.tech/robots.txt, /sitemap.xml (H)
- https://docs.pulsmarket.tech/llms.txt, /index, /api-reference/introduction.md, /markets.md, /trades.md, /concepts/prediction-markets.md, /sdk.md, /mcp-server.md, /legal/terms.md, /faq.md (H)
- https://github.com/rdmbtc/puls_backend README + commits (H); https://github.com/rdmbtc/Puls contracts/src/LMSRMarket.sol, contracts/deployments, vercel.json (H)
- DNS checks via dig (H). No WebSearch results obtained: session web-search budget was exhausted, so no third-party corroboration (searched: 1 attempt, refused).
