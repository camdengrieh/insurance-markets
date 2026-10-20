# Hunch (PlayHunch) - venue spec

Researched 2026-10-19 (data fetched about 02:22-02:27 UTC). Read-only: unauthenticated GETs and page reads only. Nothing was signed, paid, posted or registered.

Confidence tags: **H** read first-hand in a primary source this session (URL given), **M** secondary or inferred, **L** weak or stale. "NOT FOUND (searched: ...)" means I looked and the thing is not documented.

## 0. Verdict

- **Still live (H):** yes. The API answers, 5-minute rounds roll over with current timestamps, `lastResolveTickAt` was 2 minutes old, and the SDKs were last published 2026-09-23. But `/health` reports `ok:false` (see 7).
- **Not a real liquidity venue (H):** platform-wide all-time volume is **$815 across 124 bets**. Of 431 listed markets, **one** has any bets (**$11 pool, 2 bets**). 24h volume across the catalogue is $0. The HUNCH token had a $47k market cap and $300 24h volume on CoinGecko (M, summarised page).
- **Structurally not an arbitrage leg (H):** parimutuel. The payout is not fixed when you bet (it depends on the final pool), there is no sell or exit, and the displayed "price" is just the current pool ratio.
- **adapter_priority: skip.** The API is good (keyless, OpenAPI, MCP) but there is nothing to arbitrage or learn from it at this volume. Revisit only if `/stats.totalVolumeUsd` passes about $50k, or if an on-chain vault rail goes live.

## 1. Kind and market model

- **Kind (H):** custodial-operator parimutuel pools. Docs: "There is no order book and no house taking the other side." Source: https://www.playhunch.xyz/docs.md
- **Pricing (H):** `odds.yesPriceCents` is the live pool ratio, not a market-maker quote. Observed on market `base-token-launch-2026-12-31`: YES pool $11, NO pool $0 gives YES 99c / NO 1c, and an empty pool defaults to 50/50. `virtualLiquidityUsd: 10000` appears on every market, but it did not dampen the 11:0 pool to anything near 50/50, so its role is NOT FOUND (searched: docs.md, llms-full.txt, openapi.json).
- **"Shares" (H/M):** a quote returns `estimatedShares = netStakeUsd / price` (4.90 / 0.99 = 4.9495, matches the sample). Per docs the actual payout is pro-rata of the *net pool by net stake*, so a share price is indicative only. `payoutPerShareUsd`, `poolUsd` and `winningShares` appear on `/result` after resolution (H on the schema, M on the exact formula).
- **Outcome types (H):** binary YES/NO (or UP/DOWN for direction rounds, `heads/tails/tie` for coin flip) and N-way ladders (`outcomes[]` with `key`, `label`, `lowerUsd`, `upperUsd`). No scalar markets. Outcomes are database rows keyed by `key`; there are **no outcome tokens** and no transferable position. Positions are keyed `agent:<wallet>` or `bankr:<wallet>`.
- **Lifecycle (H):** Draft, Open, Locked, Resolved, Paid. "Early-lock" threshold markets resolve the moment the line is touched.
- **Edge cases (H):** a single participant or a flat-tie VOID round refunds the full gross stake. A one-sided pool (everyone on the winning side) can only return net stake, so you lose the 2% fee.
- **Exit (M):** no sell, cash-out or transfer endpoint in the 21-path OpenAPI or the MCP tool list. Positions are held to resolution.

## 2. Chains and collateral

- **Base mainnet, USDC (H):** native USDC `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, EIP-3009 domain name "USD Coin" version "2". Source: https://www.playhunch.xyz/.well-known/x402
- **Other rails (H):** Sui Move vault is "Paused". Arbitrum parimutuel vault is "Dark (flag-gated)". No addresses are published for either. Source: https://www.playhunch.xyz/docs.md ("Settlement rails").
- **Custody (H):** this is the important part. Stakes are x402 transfers to **Hunch's Base settlement EOA** `0x4F0d7622984b38DfB2D1F86F10eEE564566C09F2` (`payTo` in the x402 manifest). The agent manifest says: "Stakes settle to Hunch's Base settlement EOA - the same wallet the automated payout relayer pays winners from." Pool accounting lives in Hunch's database ("The lib runner is the only thing that touches the database or the chain"). There is **no smart-contract escrow on the live Base rail**; the docs' line "There's no off-chain ledger to trust" conflicts with this. Source: https://www.playhunch.xyz/.well-known/agent.json
- **Settlement EOA balance (M):** Basescan (via page fetch, 2026-10-19) showed an EOA with 149 txs, about 28.78 USDC and about 0.007 ETH. Consistent with tiny volume; it also means any real size would be a pure counterparty-trust bet on the operator.

## 3. Read API

- **Status (H):** official, public, unauthenticated for all reads. Marked "beta"; breaking changes or sunset of `/api/agent/v1` carry at least 6 months' notice in the manifests.
- **Docs:** https://www.playhunch.xyz/llms-full.txt, https://www.playhunch.xyz/openapi.json (58 KB, 21 paths; not saved as a fixture because it is over 50 KB), https://www.playhunch.xyz/.well-known/agent.json, https://www.playhunch.xyz/docs.md
- **Base URL:** `https://www.playhunch.xyz/api/agent/v1` (bare `playhunch.xyz` 307-redirects to `www`).
- **Key endpoints (all H, all GET except where noted):**

| Need | Endpoint | Notes |
|---|---|---|
| List markets | `/markets?status=&type=&token=&ids=&limit=&cursor=` | `limit` up to 200 worked. Cursor is opaque (base64 offset). 431 markets over 3 pages. **The `status` filter does not appear to filter**: `status=resolved` and `status=locked` returned open markets. `Cache-Control: max-age=20`. |
| One market | `/markets/{id}` (id or slug) | Same shape as a list row. |
| Odds, pools, history | `/markets/{id}/research` | `stats.{totalBets,totalPoolUsd,yesPoolUsd,noPoolUsd,feeUsd}`, `oddsHistory[]`, `impact[]` ladder, `resolutionRules{source,metric,earlyResolvable}`, `related[]`. This is the only place with per-side pool dollars. |
| Quote | `/quote?marketId=&side=&sizeUsd=` | `priceCents`, `estimatedShares`, `feeUsd`, `netStakeUsd`, 60 s `quoteId`, `bookVersion` (e.g. "2:11000000" = bets:pool-micro-USDC). Quote is free. |
| Resolution | `/result?marketId=` | `status` pending or resolved, `resolvedOutcome`, `source`, `payoutPerShareUsd`, `poolUsd`, `winningShares`. Note: while pending it reported `poolUsd: 0` for a market whose research showed an $11 pool. |
| Proof | `/proof/{tradeId}` | Base tx hash. |
| Positions | `/positions?wallet=` | Per wallet; merges the Bankr partner rail. Not needed by a scanner. |
| Stats / health | `/stats`, `/health` | See 7. |
| Search | `/discover?q=` or `?post=` | Free text. |
| Events | `/events?wallet=` (SSE, about 5-minute windows), `/resolved?wallet=&since=`, `/events/replay?wallet=&fromSeq=`, `POST /webhooks` | All **per-wallet**, not per-market. |

- **WebSocket:** NOT FOUND (searched: agent.json, openapi.json, llms-full.txt, docs.md). SSE exists only for a wallet's own events. There is no market-level price stream and no public trade tape; `oddsHistory` in `/research` is the only history.
- **MCP (H):** remote streamable-HTTP at `https://www.playhunch.xyz/api/mcp`, 15 tools mirroring the REST routes (manifest https://www.playhunch.xyz/.well-known/mcp.json). Not connected during this research (no POSTs).
- **Rate limits (H):** `quotePerMinutePerIp: 30`, `tradePerMinutePerWallet: 10` (agent.json). Reads are also throttled: the `/markets` responses carried `x-ratelimit-limit: 30` with a roughly 60 s reset (I did not check the header on other read paths). Paging the whole catalogue takes 3 calls. 429 error code is `rate_limited`.
- **SDKs (H):** npm `@hunchxyz/agent-sdk` 0.5.0 (modified 2026-09-23), npm `hunch-agent` 0.4.1, PyPI `hunch-agent` 0.5.0 (2026-09-23). Registry metadata shows no repository link.
- **Source code:** the site links https://github.com/rajkaria/hunch but `gh api repos/rajkaria/hunch` returns 404 (private or removed). NOT FOUND (searched: gh api repo and contents, the owner's public repo list).

### Fixtures

Saved under `docs/research/fixtures/hunch-playhunch/`: `markets-list-limit3.json`, `research-base-token-launch-with-bets.json` (the only market with a non-empty pool), `research-nvda-touch-250-empty-pool.json`, `quote-base-token-launch-yes-5usd.json`, `result-pending.json`, `stats.json`, `health.json`, `well-known-agent.json` (maintainer contact email redacted), `well-known-x402.json`, `well-known-mcp.json`.

Response-shape gotcha worth a test: my first list calls (about 02:22 UTC) returned `volumeUsd: 0` and 50/50 for `base-token-launch-2026-12-31`; calls two minutes later returned `volumeUsd: 11` and 99/1 for the same market, and `/research` history shows both bets predate my session (2026-06-10 and 2026-10-12). Cause unknown (cache or a degraded read). An adapter should not trust a single list response for pool data.

## 4. Trade path (not exercised)

- **Mechanism (H, documented):** `POST /api/agent/v1/trade` with `{marketId, side, sizeUsd, idemKey (uuid), walletAddress, simulate?, quoteId?, minSharesOut?|maxPriceCents?, builderCode?}`. An unpaid request returns **HTTP 402** with an x402 challenge. The caller signs an **EIP-3009 `transferWithAuthorization`** for Base USDC (exact amount, `payTo` = settlement EOA, validity at most 120 s) and retries the same POST with an `X-PAYMENT` header (base64). Response is a receipt with `txHash`. Gas is sponsored by Hunch's relayer. Source: https://www.playhunch.xyz/llms.txt and https://www.playhunch.xyz/.well-known/x402
- **Sizing (H):** $1 minimum, no maximum. Up to $10 the body alone is enough; above $10 a `quoteId` (60 s) plus `minSharesOut` or `maxPriceCents` is required. There is a `pool_impact_exceeded` brake and a `platform_paused` 503.
- **Cancel / sell (M):** none. There are no orders to cancel; a bet is a one-way transfer.
- **`simulate:true` (H, documented, not called):** it is a POST, so I did not call it. It is a $0 dry run of the validation pipeline.
- **Payout (H):** pushed automatically to the betting wallet on resolution; no claim step.
- **Identity (H):** keyless; the paying wallet is the account.

### PayBox reachability: yes (M, inferred, nothing signed)

PayBox exposes `pay_x402`, which takes the 402 `accepts` array plus `resource_url` and returns an `x_payment` value to retry with; it does not fetch the resource. Hunch's challenge is a plain x402 `exact` scheme on Base USDC, the same shape PayBox already advertises for Base services, so the flow is: HTTP-POST `/trade`, take the 402 `accepts`, call `pay_x402` against a Base wallet credential, retry with `X-PAYMENT`. No transaction proposal is needed (EIP-3009 is a signature, not a tx). Caveats:
1. The `walletAddress` in the body must equal the paying wallet (`payment_invalid` otherwise).
2. The challenge `resource` carries a per-intent hash fragment (`.../trade#<intentHash>`), so the retry must be byte-identical to the first request.
3. Whether the relayer accepts ERC-1271 smart-wallet signatures for the USDC authorization is NOT FOUND for the trade rail (Bazaar's arena docs mention EOA, ERC-1271 and ERC-6492 only for its own wallet-proof signatures). If PayBox's Base wallet is an EOA this is moot.
4. The PayBox catalog has no Hunch plugin (`discover_plugins` query "hunch prediction market": empty) and no Hunch service in the first page of `discover_services`; I did not page further. An integration would use the generic x402 tool or a new plugin.

## 5. Fees

- **Core markets (H):** 2% entry fee on the stake (`feeBps: 200` on all 431 listed markets; quote of $5 gives `feeUsd 0.10`, `netStakeUsd 4.90`). Winners split the *net* pool pro-rata by net stake. Fee goes to "Hunch market treasury". Source: https://www.playhunch.xyz/docs.md ("Payouts & fees") and the quote fixture.
- **Bazaar community markets (H):** entry fee 0; 2% of the pool taken at settlement from winners' payouts, capped at the losing side's total; no fee on voids, refunds or single-bettor markets. Minimum bet $0.50. Source: https://bazaar.playhunch.xyz/api/bazaar/v1/getting-started
- **Gas (H):** paid by Hunch's relayer.
- **Hidden cost (M):** because the final payout depends on later bets, the real cost of a position is unknowable at entry. Round-trip is impossible, so there is no "fee to exit" but also no exit.

## 6. Resolution and dispute risk

- **Automated (H):** "deterministic resolvers" over timestamped observations from DexScreener, CoinGecko, Dune, DeFiLlama, a price stream (up/down rounds), and Coinbase's Chainlink feeds on Base for the tokenized-stock markets (the NVDA market's `resolutionRules.source` is `chainlink`). Early-lock resolvers need confirming readings (crossings need two reads at least 30 minutes apart). A missed feed reading at round open or close voids the round and refunds.
- **Manual (H):** event markets (Base token launch, earnings-call word counts, EPS beats) are "a recorded human decision" with proof links. `/result` for the Base-token market shows `source: manual`. Hunch is both operator and resolver.
- **Bazaar (H):** creator-resolved and final; unresolved 48 h past deadline means full refund. At fetch: 0 open markets, 3 creators; the API list showed at least one voided market.
- **Dispute process:** NOT FOUND (searched: docs.md, llms-full.txt, roadmap, bazaar getting-started). No appeal or oracle-challenge mechanism is documented.
- **Resolved history (H):** only **2 resolved markets** platform-wide (`/stats`), so there is essentially no track record. Reported `autoPayoutRate` is 0.9875 and `medianPayoutDelaySec` 0.67.
- **Data inconsistency (H):** `/stats` shows `totalPaidOutUsd` 946.81 greater than `totalVolumeUsd` 815. Possible explanations (refunds counted in payouts, differently scoped totals) are not documented.

## 7. Geo, ToS and automation

- **Automation (H):** explicitly welcomed. The product is "built for autonomous agents", keyless, with an OpenAPI spec, MCP, SDKs and a scaffolder.
- **Geo restrictions:** NOT FOUND (searched: homepage, docs.md, llms-full.txt, roadmap, bazaar page; GETs of `/terms`, `/tos`, `/legal`, `/privacy`, `/terms-of-service`, `/eligibility`, `/restricted` all 404). The only text is the disclaimer in llms-full.txt: "Not available where prohibited. You are responsible for legal compliance in your jurisdiction." The OpenAPI `termsOfService` field just points at the homepage. No wallet screening is documented.
- **Legal posture (M):** real-money pari-mutuel betting on events by anyone with a wallet, with no stated licensing or KYC. Treat as legally unvetted.
- **Health flag (H):** `/health` returned `ok:false` on every call (02:22-02:27 UTC). The docs say "ok:false means paused", and the possible trigger is a stale canary (`lastCanaryAt` 2026-10-18T06:00Z, about 20 h old). Quotes still worked; I did not test whether `/trade` returns `platform_paused`. `payoutQueueDepth` was 1.

## 8. Liquidity (all figures H unless noted; source https://www.playhunch.xyz/api/agent/v1/stats and /markets, 2026-10-19 02:2x UTC)

- All-time: 124 bets, **$815 volume**, $946.81 paid out, 2 resolved markets.
- Open markets: `/stats` says 519; the paged `/markets` list returned 431 (the 88 difference is unexplained). Homepage text said 297 "core" markets (M, summarised page); the discovery hint said 301.
- Pools: 1 of 431 listed markets has bets: `base-token-launch-2026-12-31`, $11 (YES $11 / NO $0, 2 bets). Sum of `volume24hUsd` across the catalogue: 0.
- Bazaar: 0 open markets, $0 open pools (M, summarised page).
- Token: HUNCH on Base, about $47k market cap, about $300 24h volume (M, CoinGecko page, flagged by the page itself as internally inconsistent). Irrelevant to trading but a sign of scale.

## 9. Event coverage and overlap with other venues

Counts from the 431 listed open markets (derived by me from `/markets`, H):

| Category (Hunch field) | Count | Overlap with other venues |
|---|---|---|
| `equity` (touch/crash thresholds, weekend-open, earnings-move on tokenized stocks: NVDA, AAPL, GOOGL, META, AMZN, MSFT, TSLA, MSTR, SNDK, PLTR, MU, SPCX) | 90 | Stock-price threshold markets exist on Kalshi and Polymarket, but Hunch settles from Coinbase's *tokenized-stock* Chainlink feed, not the NYSE print. Different resolution source = basis risk. |
| `event` (EPS beat, earnings-call word-count "mention" markets, Base/Coinbase tokenized-stock milestones, Strategy S&P/sell-BTC) | 61 | Earnings-call "mention" and EPS-beat markets exist on Kalshi and Polymarket (M, from general knowledge, not checked this session). Thresholds and counting rules would need per-market matching. |
| `recurring_weather_ladder` / `recurring_weather_binary` (50 cities) | 70 / 40 | Daily-high temperature markets exist on Kalshi and Polymarket (M). Ladders are bespoke ("vs yesterday"). |
| `price_direction` (BTC, ETH, SOL, HYPE, BNB 5- and 15-min up/down; plus small caps) | 61 | Closest overlap: 5- and 15-minute BTC/ETH up/down exist on Polymarket and Limitless (M). But a parimutuel pool at $0 gives no usable price. |
| `recurring_mcap_range`, `recurring_price_range`, `recurring_price_peak`, `volume_eta` ("when will BTC first cross $150,000") | 63 / 7 / 6 / 14 | Weekly BTC range and "when first cross" have analogues on Polymarket/Kalshi (M). |
| Memecoin/Base-ecosystem milestones, chain metrics (TPS, stablecoin supply), `coin_flip` | about 10 | Hunch-only. |
| Sports, politics, macro (Fed, CPI, elections) | **0** | None. Keyword scan of all 431 questions found no election, president, Fed, CPI, NBA, NFL or World Cup market. |

Deadlines: 124 of 431 within 1 day, 155 within 7 days, 101 within 60 days, 51 beyond.

## 10. Does it share liquidity with another venue?

No (H for the native catalogue). Pools are Hunch's own. Two qualifiers:
- `/positions` "merges the Bankr partner rail": Bankr-originated bets enter the same pools (an alternate entry path, not separate liquidity).
- The CoinGecko-API claim that "an agent routes orders across onchain venues (Polymarket, Limitless, Myriad, Opinion)" is **L**. The CoinGecko coin page I read did not say it, the x402 Cloud page does not mention those venues, and the docs say the agent "only routes within markets Hunch already lists". Only the roadmap's "current foundation" bullet mentions "Best-exec routing: venue abstraction, quote fanout, split routing, receipt ledger" from an earlier consumer product (H that the text exists, L on whether it is live). Source: https://www.playhunch.xyz/roadmap

## 11. Adapter spec (if built anyway)

Read-only adapter, low cost, low value:
1. Discover: `GET /markets?limit=200&cursor=` loop (3 calls for the current catalogue); respect 30 req/min.
2. Price: for each market of interest, `GET /markets/{id}/research` -> `stats.yesPoolUsd/noPoolUsd`. Emit a *price* only when `totalPoolUsd` clears a depth threshold; otherwise emit "no price". Never use the `yesPriceCents` of an empty pool (it is a 50/50 default).
3. Normalise outcomes: binary uses `yes`/`no`; direction uses `up`/`down`; ladders use `outcomes[].key`.
4. Mark every quote `pricing_model: parimutuel`, `lockable: false`, `exit: false`, `custody: operator-EOA`, so the scanner never counts it as a hedgeable arbitrage leg.
5. Resolution: poll `/result?marketId=`; map `source` (chainlink, manual, etc.) into the linking layer as a basis-risk flag.
6. Skip `/events`, webhooks and the trade path.

What would change the verdict: sustained 24h volume above about $1k on any market, a published vault contract on Base, a documented dispute path, or sports/politics/macro markets appearing.

## 12. Related but separate projects (M, GitHub repo descriptions only)

The same owner's public repos include hackathon builds with the Hunch name: `hunch-book` (Monad pools graduating to Kuru's order book), `hunch-vpm` (Arc, "Vested Parimutuel"), `hunch-vpm-rh` (Robinhood Chain), `hunch-casper` (Casper). They were pushed to within the last month. I did not investigate whether any is deployed; treat them as separate, probably demo-grade venues, not part of PlayHunch's live Base rail.

## Not found

- Terms of service, geo-blocking, KYC or wallet-screening rules (searched: 7 common paths, docs, roadmap, OpenAPI).
- Dispute or appeal process for automated and manual resolutions.
- Published addresses or audits for any vault (Sui, Arbitrum) or for the Base rail (there is no contract on it).
- WebSocket or market-level streaming; public trade history.
- The meaning of `virtualLiquidityUsd` (no damping observed).
- Source repository (404).
- Third-party coverage, incidents or independent volume data: **WebSearch was unavailable** (the session search budget was exhausted), so no news or community search was done.

## Sources

- https://www.playhunch.xyz (homepage, summarised page read) and https://www.playhunch.xyz/docs.md (H, fetched with curl)
- https://www.playhunch.xyz/llms.txt, /llms-full.txt, /openapi.json, /.well-known/agent.json, /.well-known/x402, /.well-known/mcp.json (H)
- https://www.playhunch.xyz/api/agent/v1/{markets,markets/{id}/research,quote,result,stats,health,getting-started} (H, live GETs 2026-10-19)
- https://www.playhunch.xyz/agents, /agents/x402-cloud, /roadmap (H, page reads)
- https://bazaar.playhunch.xyz and https://bazaar.playhunch.xyz/api/bazaar/v1/getting-started, https://arena.playhunch.xyz/api/arena/v1/capabilities (H)
- https://www.coingecko.com/en/coins/hunch (M, summarised page read)
- https://basescan.org/address/0x4F0d7622984b38DfB2D1F86F10eEE564566C09F2 (M, summarised page read; Blockscout's API returned a Cloudflare challenge, which I did not work around)
- https://registry.npmjs.org/@hunchxyz%2Fagent-sdk, https://registry.npmjs.org/hunch-agent, https://pypi.org/pypi/hunch-agent/json (H, package metadata only; no code downloaded or run)
- https://api.github.com/users/rajkaria/repos via `gh api` (H for repo names and descriptions)
- PayBox `discover_plugins` and `discover_services` (read-only catalog searches), and the `pay_x402` tool description (H on what the tool says, M on how it would behave with Hunch)
