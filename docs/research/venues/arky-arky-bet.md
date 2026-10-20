# arky (arky.bet) - venue spec

Researched 2026-10-19. Read-only: unauthenticated GETs and page reads only. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **P2** (signal/watch-only for now; upgrade to P1 if event-market liquidity grows).
- Live: yes. Beta on Arc mainnet; public opening was announced for 7 Oct 2026 [H, https://arky.bet/about/]. Indexer healthy, head lag 0 blocks on 2026-10-19 [H, https://arky-indexer-mainnet.fly.dev/health].
- Why not higher: the event-market book is almost empty (3 listed markets in the unpaged list, 5 in the inventory count, about $0-$10 liquidity each, near-zero volume), the venue is days to weeks old, the official terms page is an unfilled draft template, and the public API is undocumented (found by reading the app bundle).
- Why not skip: it has a real, unauthenticated read API, a permissionless-looking on-chain AMM prediction contract with a tiny ABI, and a pari-mutuel Up/Down product that settles on RedStone.

## Kind and market model

Three prediction-style products plus non-prediction products (memecoin launchpad, perps routed to Hyperliquid, spot via KyberSwap) [H, https://arky.bet/about/].

1. **Event markets** (binary YES/NO): one constant-product-style AMM pool per market, holding YES and NO shares. Buying adds USDC and moves price; selling back to the pool is allowed before close. A YES plus NO set is backed by exactly 1 USDC. Resolves YES / NO / Invalid; Invalid pays 0.50 per share [H, https://arky.bet/predictions/prediction-markets-usdc/]. Shares are internal contract balances (`yesShares(id, account)`, `noShares(id, account)`), not ERC-20 or ERC-1155 tokens, as far as the ABI shows [H, ABI extracted from the app bundle, see below]. Binary only; no categorical or scalar markets found.
2. **Up/Down rounds**: pari-mutuel pot, 5 and 15 minute rounds, 11 pairs (BTC, ETH, SOL, XRP, BNB, DOGE, ADA, AVAX, AAVE, POL, TRX), min bet 1 USDC, contract `ArkyUpDown` at `0x8a4335D408D8aD06b13c943431CF570855213495`, live since 4 Oct 2026. Lock and close price are each a 60 s TWAP of RedStone signed data. Payout = stake x (pot - fee) / winning-side stake. Void and refunded on exact tie, one-sided round, no valid price within 2 h of close, or mixed verifier sources [H, https://arky.bet/predictions/bitcoin-up-or-down/]. Pari-mutuel means no fixed price: implied odds move until betting closes (bets close about 1 minute before lock), so it is hard to use as a hedge leg.
3. Perps are not a prediction product (Hyperliquid pass-through, up to 20x) [H, https://arky.bet/llms.txt].

## Chains and collateral

- Arc mainnet (Circle's USDC-native L1), chain ID 5042, EVM-compatible, mainnet launched 16 Sept 2026 [H, https://arky.bet/llms.txt]. Public RPC referenced by the app: `https://rpc.mainnet.arc.io` [H, app bundle]. Explorer: explorer.arc.io [H, llms.txt].
- Collateral: native USDC, which is also the gas token. The `buy` function is `payable`, i.e. USDC is sent as native value, not via ERC-20 approve [H, ABI].
- Contracts on Arc mainnet [H, https://arky.bet/about/ and https://arky.bet/llms.txt]:
  - Prediction markets: `0x51EC9db327139171CC3C6A8618B3e7A7c0Ade873`
  - Up/Down (ArkyUpDown): `0x8a4335D408D8aD06b13c943431CF570855213495`
  - Memecoin launchpad: `0x059E10d2628eFc7451d7CAcFB4546966c9991568`
- Funding from other chains: Circle CCTP via arky's Deposit wizard [H, about page].

## Read API

- Status: **unofficial/undocumented but public and unauthenticated** (the app's own indexer). No developer docs found. Classification: `unofficial-only` in the strict sense (not advertised), though reads need no auth.
- Base URL: `https://arky-indexer-mainnet.fly.dev` (REST) and `wss://arky-indexer-mainnet.fly.dev/ws` (WebSocket, protocol/messages NOT FOUND) [H, found in app JS bundle at app.arky.bet]. Agent endpoint `arky-agent-mainnet.fly.dev` also referenced (Scout; not probed).
- Docs URL: NOT FOUND (searched: docs.arky.bet and api.arky.bet do not resolve, /openapi.json and /docs on the indexer return 404, llms.txt and sitemap contain no API docs). WebSearch was unavailable (session search budget exhausted), so third-party mentions of an arky API were not searched.
- Endpoints confirmed with GET on 2026-10-19 [H]:
  - `GET /health` - chain head, lag, history coverage, RPC budget, Up/Down oracle status per pair, keeper status.
  - `GET /v1/status` - block, uptime, inventory counts (`tokens: 2, markets: 5`).
  - `GET /v1/markets` - bare array of markets (id, question, category, creator, resolver, closeTime, outcome, yesPrice, volumeUsd, liquidityUsd, traders, createdAt).
  - `GET /v1/markets?limit=50` - paginated shape `{markets:[...], nextCursor}` with richer fields: `outcomes`, `resolutionSource` ("manual"), `depth {yesBid,yesAsk,noBid,noAsk}`, `lastProb`, `status` (open/settled), `settlement {outcome, txHash, settledAt}`, `disputes {count,status}`. Note: `limit=2` returned an empty list with `nextCursor:"2"`, so the cursor semantics are odd; verify before relying on it.
  - `GET /v1/markets/{id}` - market plus `bets[]`.
  - `GET /v1/markets/{id}/history?tf=` - `{points:[{t,p}], change24h, state, coverage}`.
  - `GET /v1/markets/{id}/positions` - `[{owner, yesShares, noShares}]`.
  - `GET /v1/bets/recent` - recent trades: marketId, trader, side, action (buy/sell), usdc, yesPriceAfter, geo, txHash, block, ts.
  - `GET /v1/trades/largest`, `/v1/stats`, `/v1/pulse` (memecoin-oriented).
- Referenced in the app bundle but not probed: `/v1/wallets/{addr}/positions|portfolio|history`, `/v1/orders?owner=`, `/v1/traders`.
- Up/Down round data endpoint: NOT FOUND (probed /v1/updown, /v1/updown/rounds, /v1/rounds/live; all 404). `/health` shows the indexer tracks Up/Down, so data exists, but the route is unknown. Rounds can instead be read on-chain from `ArkyUpDown` (ABI not extracted).
- Auth and limits: none needed for reads. `/health` reports a global HTTP limit of 4000 req/s and an RPC budget of 1200 calls/min for the indexer itself; per-IP limits NOT FOUND. No `RateLimit-*` headers seen. Responses use `ETag` and `cache-control: public, no-cache`, so conditional GETs work.
- Fixtures saved (all small, no personal data): `docs/research/fixtures/arky-arky-bet/indexer_*.json`.
- Risk: the indexer is the venue's own Fly.io app; it can change without notice. Prefer on-chain reads (`getMarket`, `yesPrice`, `quoteBuy`, `quoteSell`) as the ground truth.

## Trade path

- On-chain contract calls from any EVM wallet on Arc; no order book, no off-chain signing, no API key. ABI functions extracted from the app bundle [H, source: https://app.arky.bet chunk 03pl1di1lh5kl.js, treat as read data]:
  - `buy(uint id, bool isYes, uint minSharesOut, uint deadline) payable` - slippage and deadline are built in.
  - `sell(id, isYes, sharesIn, minUsdcOut, deadline)`.
  - `redeem(id)`, `claimable(account)`.
  - Views: `quoteBuy(id,isYes,amount)`, `quoteSell(id,isYes,sharesIn)`, `yesPrice(id)`, `getMarket(id)`, `marketCount()`, `tradeFeeBps()`, `yesShares/noShares(id,account)`.
  - `createMarket(question, uri, resolver, closeTime, initialYesBps, resolverConfig) payable`, `isResolver(addr)`, `resolve(id, outcome)`, `invalidateStale(id)`.
- A scanner can compute exact executable prices with `quoteBuy`/`quoteSell` via `eth_call` (needs RPC; not exercised here because JSON-RPC is POST).
- Up/Down: ABI not extracted (NOT FOUND in the bundle chunks inspected); bets go to `ArkyUpDown`.
- PayBox reachability: **partial**. PayBox's token catalog lists Arc (`eip155:5042`, native symbol USDC) [H, PayBox discover_tokens, 2026-10-19], but its own notice says the catalog is "not a support allowlist". Whether PayBox can propose an arbitrary contract call (`buy` with native value) on Arc is unverified; I did not call any signing or request tools. Trading would be a plain transaction proposal (calldata plus USDC value) rather than a signed-order flow, so the integration shape is simple if Arc transactions are supported. Funding Arc USDC from Base/Ethereum etc. needs CCTP, a multi-step flow.

## Fees

- Event markets: a "small trading fee applies to each trade and is shown in the app" [H, prediction-markets-usdc page]. Contract exposes `tradeFeeBps` and `MAX_TRADE_FEE_BPS`, but the values were NOT read (no on-chain read done). Payer: trader. Creator or protocol split: `protocolFeeRecipient` exists; split NOT FOUND.
- Up/Down: "small fee" taken from the pot of settled rounds, capped at the losing side; void rounds pay no fee; exact rate NOT FOUND [H, bitcoin-up-or-down page].
- Gas is paid in USDC on Arc; amount NOT FOUND.
- Other products: memecoin fee 1% [H, home page]; irrelevant to arbitrage.

## Resolution and dispute risk

- Event markets: resolution terms are fixed at creation. Only a vetted resolver (allowlist via `isResolver`) can call `resolve`; creators cannot settle their own markets. Price markets resolve from an on-chain feed (first update at or after close). Event markets are "settled manually" by arky's settler from named public sources [H, prediction-markets-usdc page]. All three listed markets have `resolutionSource: "manual"` and one resolver address [H, API]. Treat as centralised resolution by the operator: high counterparty and resolution risk compared with UMA or exchange-run venues.
- Invalid outcome pays 0.50/share, which breaks a clean two-leg arbitrage on ambiguous or disputed events (worst-case leg loss).
- Dispute mechanism: API exposes a `disputes {count, status}` field (all zero/none), but no documented dispute process was found. NOT FOUND (searched: about page, predictions pages, llms.txt).
- Grace parameters exist in the contract (`RESOLUTION_GRACE`, `ABANDON_GRACE`, `invalidateStale`): a market with no result can be invalidated.
- Up/Down: RedStone signed price data, 60 s TWAP, anyone can post the price; void rules above [H].

## Geo / ToS / automation

- The terms page at https://arky.bet/terms is an unfilled **draft template** ("Draft - not yet in force", placeholders for legal entity, jurisdiction and liability cap) and describes the site as a static preview with no live trading, which contradicts the live app [H]. Effective date 19 Sept 2026. No real legal entity identified. Treat the legal basis as unknown.
- Acceptable use in the draft: no scraping "at a volume that degrades it for others", no probing or load testing. No explicit bot or API rule found.
- Geo restrictions: no blocklist found on the marketing site. The trades feed carries a `geo` field (null in samples), which suggests the app records trader geography. A terms-of-use acceptance endpoint exists in the app bundle (not the arky terms page). Prediction markets "differ by country and state" per the site; arky "does not give legal advice".
- robots.txt allows all crawlers including AI assistants; the site publishes llms.txt [H].
- Automation: on-chain trading by a bot is technically unrestricted (permissionless contract). Whether the app's terms forbid it: NOT FOUND.

## Liquidity (all as of 2026-10-19 unless noted)

- Event markets: 5 markets in inventory, 3 returned by the list endpoints; `liquidityUsd` 2.76, 10, 10; `volumeUsd` 0 to 0.79; traders 0 to 1 [H, https://arky-indexer-mainnet.fly.dev/v1/markets].
- Recent trades: the latest bets were in market 4 at about $0.20 each, timestamp 1791915694 (2026-10-13) [H, /v1/bets/recent]. `/v1/stats`: `bets1h: 0`, `volume1hUsd: 0`; `/v1/trades/largest` 24 h window empty [H].
- Up/Down volume: NOT FOUND (no endpoint located; pot sizes not read).
- Marketing page shows "$482K volume" for a Bitcoin market, but it is labelled DEMO and the terms say all figures are illustrative [H]. Ignore it.
- Conclusion: effectively no depth. The `depth` bid/ask spread on market 4 (YES 0.188 bid vs 0.259 ask) shows a wide AMM spread at $10 liquidity.

## Event overlap (arbitrage relevance)

- Categories seen: all "Macro" (Brazil presidential election 2026, WTI above $100 on 30 Oct 2026, US Senate control in Nov 2026 midterms) [H]. The site and app routes mention sports and other categories, but none were listed in the API.
- Overlap candidates: US midterms and election markets (Polymarket, Kalshi), WTI/commodity thresholds (Kalshi), and BTC/ETH/SOL up-down short rounds (Polymarket 5 and 15 min, Kalshi 15 min) [M, comparison table at https://arky.bet/predictions/bitcoin-up-or-down/; the other venues are covered by a parallel workflow].
- Practical arb size is capped by pool liquidity (about $10), so cross-venue mispricings are only worth watching as a signal.

## Shared liquidity

- Independent: each market is its own on-chain AMM funded by the creator/arky; Up/Down is its own pot. No shared liquidity with Polymarket or any other venue found [H]. The perps product routes to Hyperliquid and spot routes via KyberSwap, but those are not prediction markets.
- Price source dependency for Up/Down: RedStone (resolution only).

## Suspicious content

- None containing instructions to AI agents. The robots.txt and llms.txt are friendly to AI crawlers but contain no directives aimed at agents. The homepage shows DEMO markets with fabricated figures (labelled as demo).
- Inconsistency: the terms page says no live trading or accounts exist, while the same site says the app is live (stale or template text).

## Open questions

- Actual `tradeFeeBps` value and Up/Down fee rate (needs `eth_call` via RPC).
- Whether PayBox can build a native-value contract-call proposal on Arc (chain 5042).
- Up/Down round data route in the indexer, WebSocket message schema, per-IP rate limits.
- Who operates arky (legal entity) and the real terms of use; geo-block list.
- Whether event-market liquidity grows after the public opening; re-check in 2-4 weeks.
- Cursor semantics of `/v1/markets?limit=N` (limit=2 returned an empty page).

## Sources

- https://arky.bet/ (home, FAQ) [H]
- https://arky.bet/about/ (products, contracts, chain ID, public opening 7 Oct 2026) [H]
- https://arky.bet/llms.txt (summary, contracts, Arc mainnet launch 16 Sept 2026) [H]
- https://arky.bet/predictions/ , /predictions/prediction-markets-usdc/ , /predictions/bitcoin-up-or-down/ , /predictions/polymarket-alternative/ (market model, settlement, void rules; dated 5 Oct 2026) [H for the venue's own claims; comparison data about other venues is M]
- https://arky.bet/terms (draft template) [H]
- https://arky-indexer-mainnet.fly.dev/health , /v1/status , /v1/markets , /v1/markets/3 , /v1/markets/3/history , /v1/markets/3/positions , /v1/bets/recent , /v1/stats , /v1/pulse (unauthenticated GETs on 2026-10-19) [H]
- https://app.arky.bet/ and its public JS chunks (read as text only, never executed): indexer/RPC/WS URLs, REST route list, prediction contract ABI function list [H]
- PayBox discover_tokens (chains, query "arc"): Arc present as eip155:5042, native USDC [H]
- The Wikidata hint in the task (arky.bet under prediction-market items) was not re-verified. WebSearch was unavailable (session budget used up), so no independent third-party coverage was checked [L].
