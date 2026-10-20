# Mimir Markets - venue spec (researched 2026-10-19)

Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Live but tiny and beta. Adapter priority: **P2 (signal-only / watch)**. Reasons: cumulative stake across all 17 markets ever listed is about 2.09 USDC (H, /api/markets, 2026-10-19); per-account cap 50 USDC and per-market cap 500 USDC (H, docs); invite-only access (H, docs); AI-oracle resolution; mixed testnet/mainnet messaging in official copy. Nothing here can be an arbitrage leg of size. Revisit if the `/api/markets` total grows past low thousands of USDC.

## Is it live? (H)
- Homepage 200, title "Mimir Markets - Prediction markets on any claim, settled by AI" (https://mimirmarkets.xyz/en). Sitemap lastmod 2026-10-16.
- GitHub enliven17/mimir-markets and enliven17/mimir-solana, last push 2026-10-16, AGPL-3.0, 0 stars. Repos created 2026-06-13.
- npm `mimir-terminal` 0.4.1, created 2026-10-03, modified 2026-10-08.
- Arc mainnet (chain id 0x13b2 = 5042) answered eth_chainId at https://rpc.mainnet.arc.io; MimirV3 `0x48fae6d68e88591ea874c2da2a4efc521d0b7fb0` and MimirPool `0xc3155fa17b7b902140bf6f0969ffa56d8ce3b1b0` both return non-empty bytecode via eth_getCode on that RPC (H). Block 0x197c2ad at time of query.
- Arc mainnet launched 2026-09-16 per secondary press (M: crypto.news, cryptotimes.io via search). Mimir's own docs say it is "beta on Arc mainnet".
- CONFLICT (H): `/en/terms` section 02 says "beta on Arc testnet, test USDC with no monetary value"; footer, docs and `/en/docs` say mainnet with real USDC; README says "Arc testnet + Solana devnet". Repo config.ts has a mainnet branch (chain id 5042, mainnet checked "2026-10-12"). Treat as mainnet-in-beta with stale legal copy, but unconfirmed.

## Kind and market model
- kind: onchain-other (Arc EVM contracts + off-chain Next.js/Convex indexer and AI oracle). (H)
- Two market types (H, https://mimirmarkets.xyz/en/docs):
  - **VS (MimirV3)**: creator stakes one side of a yes/no claim; challengers take the other side collectively, total challenger stake at most 5x the creator's. Payout odds are "at most" and only worsen as more challengers arrive. Not an order book, not an AMM, no tradable outcome tokens.
  - **Pool (MimirPool)**: two-sided pari-mutuel. Winners split the losing side pro rata; empty side means refund.
- Binary only (side A / side B). Outcome codes: 0 none, 1 side A/creator, 2 side B/challengers, 3 draw, 4 unresolvable (H, openapi-agent-v1.yaml). States: open, active, resolved, cancelled, proposed, disputed.
- Positions are contract balances, not tokens: no exits, no secondary market, no cancel. Betting closes 60 seconds before deadline. Min stake 0.1 USDC (H).
- Implication for an aggregator: price is implied by pool ratio at close ("if it closed now"), not a quotable bid/ask. Cannot hedge/unwind; arbitrage is only "bet both venues and hold to resolution".

## Chains and collateral (H)
- Settlement: Arc mainnet (Circle L1), USDC native gas token (18 dp native view, 6 dp ERC-20 at `0x3600000000000000000000000000000000000000`).
- User funding path: Solana wallet -> Circle CCTP V2 -> passkey smart account on Arc (Circle Modular Wallets). Agents instead use an EVM "Arc operator" key.
- $MIMIR token is Solana (pump.fun-style); gives fee discounts and access (5M $MIMIR = invite-gate entry).
- Contracts (H, docs): MimirV3 0x48fae6d6...7fb0, MimirPool 0xc3155fa1...3b1b0, MimirFees 0xeb390878c161912db1da85918acfd46ce543512a. Owned by a 2-of-3 Safe; oracle/fee-recipient changes behind a 2-day timelock (H, docs, not independently verified on-chain).

## Read API (official-public for the feed; docs URL below)
- Docs: https://github.com/enliven17/mimir-solana/blob/main/docs/openapi-agent-v1.yaml (OpenAPI 3.1, v1.1.0, AGPL) plus https://mimirmarkets.xyz/en/docs (H). Spec text says "Older routes /api/arena/*, /api/verify/*... describe the Solana build. On Arc, read markets with listClaims and getClaim" (H).
- Base URL: https://mimirmarkets.xyz
- Unauthenticated GETs tested 2026-10-19 (H):
  - `GET /api/markets` -> 200 JSON `{success, data:{markets:[...]}}`, 17 markets (undocumented in the OpenAPI spec; found by probing). Fields: `id` ("pool-16"/"vs-1"), `kind` (pool|vs), `marketId`, `question`, `category` (sports, stocks, crypto per spec), `sideA/sideB {label, usdc}` (decimal USDC strings), `participants`, `creator` (EVM addr), `deadline` (unix s), `phase` (open|proposed|resolved|cancelled), `winner` (null or 1-4), `summary`, `resolutionUrl` (e.g. ESPN scoreboard API), `url`. Fixture: docs/research/fixtures/mimir-markets/api-markets-2026-10-19.json
  - `GET /api/arena/claims` -> 200 `{"success":true,"source":"chain","data":{"claims":[],"claimCount":0,"totalResolved":0,"openPool":"0"}}` - EMPTY while /api/markets shows 17 markets, confirming the spec warning that /api/arena is the legacy Solana-era index. Fixture: api-arena-claims-2026-10-19.json
  - `GET /api/agents/registry` -> `{"agents":[]}`.
  - `GET /api/arena/pool-16` -> 400 "invalid claim id" (expects integer id).
- Documented agent reads (not exercised; need signed envelope): `POST /api/agents/v1/{listClaims|getClaim|getBalances|listPositions|listEarnings|dryRun}` with ed25519 (Solana key) signed envelope or bearer `mk_live_...` key. Registration requires a 1 USDC deploy fee and is owner-signed: not attempted.
- Chain-fallback reads rate-limited to 60/min per IP (H, spec). Other limits per-IP, per-agent per minute, and agent `requestsPerHour` (values NOT FOUND).
- robots.txt says `Disallow: /api/` for `*` (H) although the OpenAPI documents public GETs. Treat /api/markets as unsupported and prefer reading Arc contract events directly via RPC for production (M).
- Websocket: NOT FOUND (searched: openapi spec, README, docs page). On-chain events via Arc RPC logs are the realistic push path.
- Prices/books: none exist; only pool totals per side. Trades list: NOT FOUND in public API (on-chain logs / `GET /api/arena/user/{address}` legacy). Resolution: `phase`, `winner`, `resolutionUrl`, and `GET /api/verify/{id}` audit bundle (documented, legacy-labelled, not tested).

## Trade path
- Programmatic via Agent API: `createClaim`, `challenge`, `dispute`, `withdraw` return **unsigned Arc transactions** (`chainId`, `to`, `data`, `value` in wei - USDC is native, so stake is msg.value). Agent verifies, signs with its Arc EVM operator key, broadcasts to Arc. (H, spec)
- Request auth is a Solana ed25519 signature (owner/operator wallet) or API key; agent registration needs Solana identity AND a paid 1 USDC deploy fee. So full agent path = one Solana key + one EVM key. Budget caps count issued transactions for 24h (H).
- Direct contract calls with no API are likely possible (contracts are public on Arc; stake via value) but fee-ticket/invite gating may apply: "fee tickets" and "invite gate" are in the repo; whether the contracts reject non-invited senders is NOT FOUND (not read from contract source).
- Entry fee is signed off-chain by a "fee signer" (docs: "fee signer changes subject to timelock") - meaning discounted fee requires a Mimir-issued ticket; baseline path may still work (M).

## PayBox reachability: **partial**
- PayBox lists Arc mainnet (`eip155:5042`, native USDC) in its chain catalog (H, discover_tokens mode=chains, 2026-10-19), with a caveat that this is a metadata catalog, not a signing allowlist. No official/user PayBox plugin for Mimir (discover_plugins "mimir": none).
- A PayBox EVM wallet on Arc could in principle be the "Arc operator": call `challenge`/`createClaim` unsigned-tx builder and propose the returned tx. Blockers: (1) agent registration needs a Solana owner signature and a deploy fee; (2) PayBox's generic contract-call/proposal support on Arc is unverified (not tested; no money-moving tools called); (3) invite-only gate; (4) 50 USDC/account/market cap. Mark as not worth building until liquidity exists.

## Fees (H, docs and README)
- Entry fee 0.5% of each stake, paid by staker, taken from amount sent, kept even on refunds. 0.25% for holders of 5M $MIMIR, 0.1% for 10M.
- No fee on winnings. Copy-trade: 1% of profit to basket creator + 1% to Mimir on wins. Agent deploy $1 ($0.5 / free by tier). Gas: paid by Mimir for passkey users; agents pay Arc gas in USDC.
- Dispute bond 2 USDC. CCTP in/out approx 15s / 30s; CCTP fast-finality fee may apply (M).

## Resolution mechanism and risk (H, docs)
- Price claims: deterministic check against two independent sources at the deadline.
- Everything else: oracle fetches the `resolutionUrl` source and asks an LLM (Gemini or Claude) for a verdict + confidence. >=80% settles; 60-79% settles "contested"; <60% refunds everyone. Audit-bundle hash recorded on chain.
- Dispute: any participant, 24h window on mainnet, 2 USDC bond, an "arbiter" rules (identity/centralisation NOT FOUND). Outcome final once recorded. If no verdict within 7 days, anyone can `refundExpired`.
- Council of 20 AI personas posts forecasts (not stakes, on mainnet).
- Risks for an arb leg: model error, ties/"draw"/"unresolvable" paths that refund (so a hedge on another venue is left naked), single-source `resolutionUrl` (often ESPN's unofficial API), creator-chosen sources, centralised arbiter and oracle key. Observed data point (M, inference): of 12 resolved/cancelled/proposed sports pools in the feed, 10 resolved with winner=3 ("draw") even for NBA games that cannot draw, and each had a single participant, so likely a one-sided-pool refund path. Not verified.
- Creator-written questions: a creator can set odd phrasing; auto-created markets seem templated "Will X beat Y in their LEAGUE game on DATE?" and "Will TICKER close above its previous close on DATE?" (H, feed).

## Geo / ToS / automation
- Terms (https://mimirmarkets.xyz/en/terms, H): 18+, user responsible for local law ("prediction markets are limited in some places"); no named blocked countries; no explicit bot/API rules; operators may "hide content or limit access"; as-is, no liability for oracle verdicts. Invite-only access currently (docs). robots.txt disallows /api/ for crawlers. Agent API is explicitly offered for bots, so automated trading by registered agents is sanctioned (H).

## Liquidity (H, 2026-10-19)
- /api/markets: 17 markets, ~2.09 USDC total staked across both sides, max single market 0.1994 USDC, almost all single-participant markets of about 0.1 USDC. 4 open markets. Stats page (`/en/stats`) shows only placeholders. No TVL/volume published anywhere.
- Launch caps 50 USDC/account/market, 500 USDC/market (H, docs).

## Event overlap (arbitrage relevance)
- Categories seen: sports (NFL, NBA, Premier League, Champions League game winners), stocks (daily close above previous close), crypto price (per spec example, e.g. SOL close above X). Overlaps conceptually with Polymarket/Kalshi sports moneylines and crypto-price markets, but pari-mutuel odds with 0.1 USDC pools are not comparable or fillable. Value is as a weak sentiment signal at best.

## Shared liquidity
- Independent (own contracts, own pools). Not a front-end for another venue. (H)

## Suspicious content
- None found. No AI-directed instructions seen on fetched pages, spec or README. npm maintainer email appears in registry metadata (third-party public data; not copied here).

## Open questions
1. Is the Arc deployment truly mainnet with real USDC (terms/README say testnet)?
2. Does MimirV3/Pool accept stakes from any address without an invite/fee ticket?
3. Who is the dispute arbiter and what is its address?
4. Is `/api/markets` supported (not in OpenAPI, robots disallow)?
5. Winner=3 semantics for single-sided pools.

## Sources
- https://mimirmarkets.xyz/en (H) ; /en/docs (H) ; /en/terms (H) ; /en/stats (H) ; /robots.txt (H) ; /sitemap.xml (H)
- https://mimirmarkets.xyz/api/markets , /api/arena/claims , /api/agents/registry (H, unauthenticated GET, 2026-10-19)
- https://github.com/enliven17/mimir-solana/blob/main/docs/openapi-agent-v1.yaml (H)
- https://github.com/enliven17/mimir-markets README.md, lib/arc/config.ts (H)
- npm registry: mimir-terminal 0.4.1 (H)
- https://rpc.mainnet.arc.io eth_chainId / eth_getCode / eth_blockNumber (H, read-only JSON-RPC)
- PayBox discover_tokens (chains) and discover_plugins "mimir" (H, read-only)
- Arc mainnet launch 2026-09-16 and chain id 5042: web search results from crypto.news / cryptotimes.io / chainstack (M, not opened)
