# Hedge Trade (hedgeapp.trade) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session (URL cited), M = secondary/inferred, L = weak/stale.
Not the same as DefiLlama's "Hedge" (hedge.so).

## Verdict

- adapter_priority: **skip** for the venue-as-liquidity-leg question. Hedge's 1x "spot" desk is a thin front-end over the Polymarket CLOB (same token ids, same book), so it is NOT an independent arbitrage leg. Its own leverage vault is empty/paused and its native pool is a tiny meme-token parimutuel with no cross-venue overlap.
- Only residual value: (a) a free no-auth read API that mirrors Polymarket (no new information), (b) signal-only: Hedge's own vault/pool numbers show how little organic flow it has.

## 1. Is it live (2026)? - Yes, but tiny

- H: site up, HTTP 200, app lists 598 live markets (https://www.hedgeapp.trade/api/spot, status.markets=598), Robinhood Chain live since 2026-07-01 (M, search result summarising eco.com; not first-hand).
- H: roadmap published 2026-09-05 (https://www.hedgeapp.trade/roadmap) says "Spot Yes/No in USDG on Robinhood Chain. 1x is a real fill on the venue book. Listed markets offer vault leverage" and "We are still a thin layer on one upstream book for spot."
- H: docs site `docs.hedgeapp.trade` currently returns **HTTP 402 `DEPLOYMENT_DISABLED`** (Vercel deployment disabled, i.e. hosting billing/suspension - NOT an x402 payment requirement; nothing to pay, stopped there). Checked /, /llms.txt, /developers, /guides/spot on 2026-10-19. A web search snippet showed the docs existed earlier (M). Treat docs as currently down; the machine-readable surface is on www.hedgeapp.trade (llms.txt + /api/*).
- H: agent card status 2026-10-19: `vaultLive:false, openingPaused:true, leverageMarkets:0` (https://www.hedgeapp.trade/api/agent). Headline "up to 4x" is not actually offered right now.

## 2. Kind and market model

- kind: hybrid. Three distinct products:
  1. **1x spot (the bulk, 598 markets)**: Yes/No binary shares. Hedge's app takes USDG, converts and places a fill-or-kill/FAK buy on **Polymarket**. H: repo README "1x routes to Polymarket. USDG converts, then a fill-or-kill buy." (README text obtained in an earlier fetch of this task; the owning GitHub repo could not be re-located this session, so tag M for README/contract source details). Corroborated first-hand: `/api/spot/markets` returns `yesTokenId/noTokenId` and `marketId` (Polymarket gamma ids such as 2589812), and `GET https://clob.polymarket.com/book?token_id=<that yesTokenId>` returns a populated Polymarket book (H, fetched 2026-10-19). Market ids and slugs are Polymarket's (some are placeholder names like "Person H", copied from Polymarket's unnamed-candidate markets).
  2. **2x-4x vault leverage**: synthetic margin vs an LP vault ("HedgeVault", Earn) on Robinhood Chain (chain 4663). Price source = oracle fed by a keeper relaying Polymarket prices; allowlisted markets only (Yes in $0.35-$0.65 band for >1x). Currently zero listed markets (H, `/api/agent/markets?desk=leverage` -> `{"markets":[],"total":0,"leverageMarkets":0}`). Vault TVL **$48.45**, 99.99999% utilised (H, https://www.hedgeapp.trade/api/vault, 2026-10-19). Max agent margin $5, max leverage 2x, daily notional $250 (H, agent card).
  3. **Native pool (parimutuel)**: USDG parimutuel on Robinhood-chain memecoin outcomes (market-cap strike markets, token-A vs token-B PvP; 15m timeframes). 1,076 markets listed (98 open, 978 locked), `poolA/poolB/tickets` all 0, `deskUsed:0, deskCap:1000` (H, https://www.hedgeapp.trade/api/native). Tickets $1-$25, one per wallet per market (M, README/HedgePool.sol).
- Outcome tokenisation: spot = Polymarket CTF ERC-1155 outcome tokens on Polygon held in a Polymarket proxy wallet (M); leverage = engine position ids on Robinhood Chain; pool = ticket records in `HedgePool` contract.
- Categories: binary and multi-outcome (neg-risk sets as in Polymarket), identical to upstream.

## 3. Chains and collateral

- Collateral shown to user: **USDG** (Paxos stablecoin) on **Robinhood Chain**, chainId 4663 (H: agent card `wallet.chainId:4663`, `token:USDG`; mainnet id 4663 also in the quiver skill listing, M). Robinhood Chain is an Arbitrum-based L2 (M).
- Spot fills actually settle on Polymarket (Polygon, pUSD/USDC.e collateral) after Hedge converts USDG (M, README + `trade_live.ts`/`convert.ts`). Gas: RH ETH on 4663 for vault tickets.
- HEDGE token: Uniswap v4 HEDGE/ETH pool on Robinhood chain, liquidity about $11.3k, 24h volume about $406, FDV about $15k (H, DexScreener API pair data fetched 2026-10-19; extremely thin).

## 4. Read API (official, public, unauthenticated)

Base: `https://www.hedgeapp.trade`. Discovery: `/llms.txt`, capability cards `/api/spot`, `/api/agent`, `/api/native`. Docs URL `https://docs.hedgeapp.trade/developers` (DOWN, 402 DEPLOYMENT_DISABLED).

Endpoints (all H, fetched 2026-10-19, no auth):
- `GET /api/spot` capability card (limits: min 1, max 10000 USDG, orderType FAK).
- `GET /api/spot/markets?q=&limit=&offset=` -> `{markets:[{marketSlug, marketId, eventSlug, title, yes, no, yesCents, yesTokenId, noTokenId, live, ticketUrl}], total, hasMore}` (total 598).
- `GET /api/spot/quote?marketId=<id>&side=yes|no&amount=5` -> walks the book: `{quote:{size, spent, shares, entryPrice, unfilled, fillable, source:"book"}, ticketUrl}`. Example: 1,000 USDG on Fed-no-change Yes fills at 0.88 (book mid 0.875).
- `GET /api/spot/ticket?...` same plus ticketUrl.
- `GET /api/agent/markets?desk=spot|leverage&q=&limit=&offset=`, `GET /api/agent/quote?marketSlug=&side=&margin=`, `GET /api/agent/positions?wallet=0x...`, `GET /api/agent/bets` (public fills; currently `{"bets":[]}`), `GET /api/vault` (TVL/utilisation/leverage tiers), `GET /api/native` (pool markets, token quotes), `GET /api/referral/leaders`.
- WebSocket: NOT FOUND (searched: llms.txt, capability cards, home page asset links).
- Rate limits: NOT DOCUMENTED (searched: llms.txt, cards, response headers not inspected beyond status). Be conservative.
- Resolution endpoint: none; for spot, resolution is Polymarket's (use Polymarket gamma). Leverage markets expose `resolved/finalPrice` only on-chain (engine `MarketResolved(marketId, finalPrice)` event, M from contract source).
- Fixtures: `docs/research/fixtures/hedge-trade/` (api_spot_capability, api_agent_capability, api_spot_markets_limit3, api_spot_quote_fed_5usdg, api_vault, api_agent_markets_desk_leverage, api_native_truncated).

## 5. Trade path

- 1x spot: **no programmatic order placement.** API only returns a `ticketUrl` the human opens; user logs in with Privy and confirms in the app ("The fill stays in Hedge", H llms.txt). No API key route; Polymarket builder/relayer keys sit server-side. An aggregator would instead trade the same book directly on Polymarket (already covered elsewhere).
- Vault leverage: `POST /api/agent/bets` with `action=open|close`, `from=<agent wallet>` returns **unsigned calldata** on chain 4663 for the agent to sign and broadcast, then `action=submit` with tx hash (H, llms.txt + agent card). Currently unusable (openingPaused, 0 markets, $5 margin cap). I did NOT call POST.
- Native pool: `POST /api/native/stake` exists (H, README/llms; not called) - on-chain `HedgePool.stake` USDG, $1-$25.

## 6. PayBox reachability

- paybox_reachable: **no** (practically). Spot needs a Privy web session plus a Polymarket proxy wallet; the only tx-proposal path (vault calldata) is on Robinhood Chain 4663 with USDG, a chain not in the PayBox networks list we assume (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) - NOT VERIFIED; and the vault is paused with $48 TVL. Trade Polymarket directly instead.

## 7. Fees

- Leverage engine (M, contract source): open fee 150 bps, close fee 150 bps, spread 100 bps, borrow carry 1 bp/hour on vault share (max 50), liquidation when 90% of net margin lost, pool exposure cap 30% of TVL. Paid by trader to vault/LPs.
- Spot: agent-card quote shows `fee:0` for the 1x book quote (H, agent_quote sample), but README says referral = 20% of "the 1.5% take" (30 bps of referred volume), so a platform take of about 1.5% likely applies at fill (M, README; formula not confirmed). Polymarket's own fees (including sports fee curve) also pass through (M, comments in `trade_live.ts`). Treat as ~1.5% extra cost vs Polymarket direct: strictly worse than trading upstream.

## 8. Resolution mechanism and dispute risk

- Spot: upstream Polymarket resolution (UMA optimistic oracle) - same risk as Polymarket; no Hedge-specific dispute path.
- Leverage: oracle relays Polymarket price; when upstream stops quoting a resolved market an admin/keeper marks `resolved` with `finalPrice` (M, engine source). Trust in Hedge keeper/admin; roadmap states leverage stays off until a liquidator runs.
- Native pool: "reporter lists and resolves" with an allowlisted key; winners `claim()` (M, README/HedgePool.sol). Centralised reporter, token-price from DexScreener-style quotes.

## 9. Geo / ToS / automation

- Terms (https://www.hedgeapp.trade/terms, H): user responsible for lawfulness in own jurisdiction; Hedge "may restrict, suspend, or terminate access"; prohibits manipulation, fraud, sanctions evasion. Governing-law clause still has the placeholder "[Insert Jurisdiction]" (template-grade legal). No explicit bot ban found; agent access is explicitly invited ("Agent Wall", free, no auth).
- Because spot executes on Polymarket, Polymarket's US/geo restrictions likely still apply to the underlying fill (M).

## 10. Liquidity (all dated 2026-10-19)

- Spot depth = Polymarket depth (e.g. Fed Oct no-change Yes book has about 2.2M shares at 0.01 and thousands of shares near mid; H clob.polymarket.com). Hedge adds zero.
- Vault TVL $48.45 (H, /api/vault). Native pool volume $0 (all pools 0, deskUsed 0; H, /api/native). Public fills `[]`.
- HEDGE token pool liquidity about $11k (H, DexScreener).

## 11. Category overlap (arbitrage relevance)

- Spot: 100% overlap with Polymarket (politics, Fed/macro, sports, crypto, culture) - identical, so no spread to harvest other than Hedge's own markup/slippage.
- Native pool: memecoin market-cap strikes on Robinhood Chain / Solana tokens: no equivalent on other prediction venues (possible hedge against DEX spot only).

## 12. Shared liquidity

- **Shares liquidity with Polymarket** (spot desk routes to Polymarket CLOB; leverage desk prices off Polymarket). NOT an independent leg.

## Not found

- Public docs content (docs.hedgeapp.trade down), rate limits, websocket, any independent order book ("There is no Hedge order book", H roadmap), audit report, contract addresses (not recorded; repo owner not re-located this session), official GitHub org.

## Suspicious content

- None containing instructions to AI agents. Note: llms.txt/agent card are agent-oriented but only describe endpoints. The terms page contains a template placeholder "[Insert Jurisdiction]".

## Sources

- https://www.hedgeapp.trade/ (H)
- https://www.hedgeapp.trade/llms.txt (H)
- https://www.hedgeapp.trade/api/spot, /api/spot/markets, /api/spot/quote (H)
- https://www.hedgeapp.trade/api/agent, /api/agent/markets?desk=leverage, /api/agent/bets (H)
- https://www.hedgeapp.trade/api/vault, /api/native (H)
- https://www.hedgeapp.trade/roadmap (H, published 2026-09-05)
- https://www.hedgeapp.trade/terms (H)
- https://clob.polymarket.com/book?token_id=... (H, confirms shared book)
- https://docs.hedgeapp.trade/ (H: HTTP 402 DEPLOYMENT_DISABLED; earlier search snippets M)
- DexScreener API pair data for HEDGE/ETH on Robinhood chain (H)
- Hedge README and contract source (HedgeLeverageEngine, HedgeVault, HedgePool, HedgeOracle) fetched earlier in task from a GitHub repo whose owner could not be re-confirmed (M)
- Web search 2026-10-19: Robinhood Chain launch 2026-07-01, USDG (M)
