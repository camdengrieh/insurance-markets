# PlayHunch (Hunch) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 00:59-01:05 UTC). READ-ONLY: doc reads, unauthenticated GETs to documented hosts (www.playhunch.xyz, bazaar.playhunch.xyz, arena.playhunch.xyz, registry.npmjs.org), `gh api` metadata/file reads, one read-only PayBox `discover_services` search. No account, wallet, key, signature, POST/PUT/DELETE, `/trade` call (not even `simulate:true`, which is a POST), or money-moving PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/playhunch-hunch/` (listed in section 12).

---

## 0. Bottom line

1. **Live, but it is not an aggregator any more and it is tiny.** The discovery hint ("an automated agent routes each order across multiple onchain prediction markets") is stale. The current official docs say "the agent only routes within markets Hunch already lists" (H, docs.md), and every market in the public API is a "native Hunch" market. The roadmap page (last updated 2026-05-26) lists "venue routing with quote fanout, split routing, and a receipt ledger" as **shipped** (M, small-model summary), so an earlier incarnation did route to external venues; no venue is named there and no routing exists in today's API. A third-party search snippet naming Polymarket, Limitless, Myriad and Opinion as routed venues is **not** supported by any official page I read (L).
2. **It is a pure parimutuel pool run by one operator.** No order book, no AMM, no tradable outcome token, no exit. Stakes go to a Hunch-controlled EOA, not an escrow contract; Hunch records bets, resolves markets and pushes payouts. (H)
3. **Almost no liquidity.** Self-reported platform stats on 2026-10-19: 124 bets, **$815 lifetime volume**, 2 resolved markets, 519 open markets (H, `/api/agent/v1/stats`). On the markets I paged, pools are 0 to $11. A $5 YES bet into a $11 all-YES pool quoted **99c** (H) - the "odds" are noise, not a probability.
4. **Good public API for its size** (keyless reads, OpenAPI, MCP, x402 trade), and a PayBox EVM wallet on Base can in principle pay it: the trade is an x402 `exact` EIP-3009 `transferWithAuthorization` on Base USDC. But `/api/agent/v1/health` returned `ok:false` ("paused" per the docs) on both reads this session.
5. **adapter_priority = skip.** Parimutuel (no lockable price, no exit, payout depends on final pools), sub-$1k lifetime volume, operator custody and operator-only resolution make it unusable as an arbitrage leg and worthless as a signal. Revisit only if `stats.totalVolumeUsd` grows by two orders of magnitude. A read-only adapter would be trivial (section 4) if completeness is wanted.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | https://www.playhunch.xyz serves "A market for every hunch" on Base, USDC (WebFetch 2026-10-19) | H |
| API | `GET /api/agent/v1/markets` returns 200 with `generatedAt` 2026-10-19T00:59:34Z; 431 open markets reachable by cursor paging (stats says 519 open) | H |
| Fresh markets | 5-minute BTC/ETH/SOL "UP" rounds with windows starting 2026-10-19T01:00:01Z; a 5-minute coin-flip round for 01:00-01:05Z | H |
| Resolver ticks | `lastResolveTickAt` 2026-10-19T00:40:02Z, `lastSnapshotTickAt` 00:40:48Z | H |
| Health flag | `ok:false` on two reads (00:59:47Z and 01:01:54Z); `lastCanaryAt` 2026-10-18T06:00:38Z (about 19 h old); `payoutQueueDepth` 1. Docs: "200 even when degraded; ok:false means paused." I cannot test trading without a POST, so I do not know whether trading is actually paused. | H (flag), M (meaning) |
| Packages | `@hunchxyz/agent-sdk` 0.5.0, created 2026-06-13, last modified 2026-09-23 (registry.npmjs.org) | H |
| Token | HUNCH on Base, CoinGecko page fetched 2026-10-19: price ~$0.065, mcap ~$47k, 24h vol ~$300, one DEX pair; the page's ATH/ATL figures are internally inconsistent | M |
| Age | Created ~June 2026. Everything here is under 5 months old; nothing is stale by the 6-month rule, but the product has already pivoted once (aggregator to first-party pools). | M |

Verdict: **still_live = true** (site and read API up), trading status uncertain (`ok:false`).

---

## 2. Kind and market model

- **Kind (H):** consumer prediction app (mobile swipe feed) with first-party **parimutuel** markets, plus "Bazaar" (community markets that anyone can open; the creator writes the rule and resolves) and "Arena" (paper trading, 10,000 pUSDC, not real money). Docs: "Markets are parimutuel: your stake joins a pool ... There is no order book and no house taking the other side."
- **Outcomes (H):** binary YES/NO (or UP/DOWN) or N-way "ladders" (each band is an outcome; `outcomes[]` carries `key`, `label`, window or bounds; for ladders the trade `side` is the band key, never yes/no). Docs list 20+ market types in a handful of families. No scalar markets.
- **Tokenisation (H):** none. A bet creates a database position (`shares`, `avgPriceCents`), not an on-chain token. Settlement is a USDC transfer in and a USDC transfer out; BaseScan proof links per trade.
- **Price semantics (H for fields, M for interpretation):** `priceCents` and `estimatedShares` (= net stake / price) are pool-implied estimates. Real payout = net pool split pro-rata among the winning side's net stakes, so it depends on bets that arrive after yours. Observed: pool YES $11 / NO $0 gives YES 99c / NO 1c (quote response). The per-market `virtualLiquidityUsd: 10000` field did not visibly affect that price; its meaning is NOT FOUND (searched: docs.md, llms-full.txt, openapi.json).
- **Lifecycle (H):** Draft -> Open -> Locked -> Resolved -> Paid. Threshold markets early-lock on touch; coin-flip rounds lock 60 s before close. Single-participant markets refund gross; flat-tie VOID refunds everyone.
- **Market mix on 2026-10-19 (H, 431 markets paged):** equity touches (90, settled from Coinbase's Chainlink feeds on Base for tokenised stocks), daily/weekly weather ladders and binaries (110), market-cap and price range ladders (70), "event" markets (61: Base ecosystem questions, quarterly EPS beats for Tesla/Meta/MSFT/GOOGL/AMZN/AAPL/PLTR/NVDA/MU, earnings-call word-count "mention" markets), 5/15-minute price-direction rounds (61), supply ETAs (14), external-metric milestones (11), misc (4). Deadlines: 320 of 431 end in 2026-10. Across the 431, `volumeUsd` summed to 0 in the paging run (see data-quality note, section 5).

---

## 3. Chains and collateral

| Rail | Asset | Status | Tag |
|---|---|---|---|
| **Base (8453)** | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 dec | **Live, default.** Gas is relayed; the paying wallet needs USDC only. | H |
| Sui | Move vault | Built, "currently paused" | H (docs.md) |
| Arbitrum | parimutuel vault | "Dark (flag-gated)" | H (docs.md) |
| Arc / Casper | separate hackathon forks (`rajkaria/hunch-vpm` on Arc, `rajkaria/hunch-casper`, casper.playhunch.xyz) | not part of the Base product; not examined further | M |

The `chainId` field on a market is the *subject* chain of the question (Bitcoin, Solana, ...), not the settlement chain; all real-money settlement is Base USDC. (H, market samples vs docs.)

Settlement address pinned by the x402 listing: `0x4F0d7622984b38DfB2D1F86F10eEE564566C09F2` (H, `/.well-known/x402`). It is an EOA ("Hunch's Base settlement EOA - the same wallet the automated payout relayer pays winners from", H, agent.json). I could not read its balance: Blockscout returned 403 to the generic User-Agent and I did not try to evade that.

---

## 4. Read API

- **Docs (H):** https://www.playhunch.xyz/llms.txt, /llms-full.txt, /docs.md, /openapi.json (58.8 KB, 21 operations), /.well-known/agent.json, /.well-known/x402, https://www.playhunch.xyz/agents/docs
- **Base URL:** `https://www.playhunch.xyz/api/agent/v1` (versioned path, "beta", at least 6 months notice before any breaking change or sunset, H). Bazaar: `https://bazaar.playhunch.xyz/api/bazaar/v1` (`bazaar-agent-api-v1`). Arena: `https://arena.playhunch.xyz/api/arena/v1`. MCP: `https://www.playhunch.xyz/api/mcp` (streamable HTTP, 15 tools listed in agent.json; docs say 14).
- **Auth:** none for reads ("Reads are unauthenticated", H; confirmed with plain GETs). Only `POST /trade` is paid (x402).
- **Rate limits (H):** quotes 30/min per IP; trades 10/min per wallet; 429 `rate_limited`. Market-list responses carried `x-ratelimit-limit: 30`, `x-ratelimit-reset: 60`. No websocket; live events are SSE (`/events?wallet=`) plus HMAC-signed webhooks, both wallet-scoped, so they do not give a market-wide price stream.
- **Key endpoints (H, openapi.json):**

| Need | Endpoint |
|---|---|
| Market list | `GET /markets?status=&type=&token=&ids=&limit=&cursor=` (cursor is opaque, e.g. `MTAw`) |
| One market | `GET /markets/{id}` |
| Pools, odds history, resolution rules, price impact | `GET /markets/{id}/research` |
| Price a bet | `GET /quote?marketId=&side=&sizeUsd=` (60 s `quoteId`) |
| Search | `GET /discover?q=` or `?post=` |
| Resolution | `GET /result?marketId=` ; wallet-scoped `GET /resolved?wallet=&since=` |
| Positions | `GET /positions?wallet=` |
| Proof | `GET /proof/{tradeId}` (Base tx hash) |
| Platform | `GET /stats`, `GET /health`, `GET /wallet/{address}/readiness` |

- **Response shape (H, fixtures):** market ref has `id, slug, question, category, tokenSymbol, chainId, deadlineAt, status, feeBps, virtualLiquidityUsd, outcomes, volumeUsd, totalBets, volume24hUsd, odds{yesPriceCents,noPriceCents}`. Quote adds `tier, quoteId, priceCents, estimatedShares, feeUsd, netStakeUsd, stats{totalPoolUsd,yesPoolUsd,noPoolUsd}`. Research adds `resolutionRules`, `oddsHistory[]`, `observations[]`, `related[]`.
- **Data-quality warning (H):** list-level `volumeUsd`/`totalBets` are inconsistent. The same market (`base-token-launch-2026-12-31`) showed `volumeUsd 0, totalBets 0, 50/50` in the `limit=3` list at 00:59:34Z, then `$11, 2 bets, 99/1` in the `limit=100` list and in `/research` and `/quote` about a minute later; its `oddsHistory` has bets dated 2026-06-10 and 2026-10-12. An adapter must take pool sizes from `/quote` or `/research`, never from the list. Also, `status=resolved` on the list returned open markets, and the open count via paging (431) differs from `stats.markets.open` (519).
- **Bazaar read (H):** `GET /api/bazaar/v1/markets` is public. The 3 newest markets I saw were 2 voided with $0 pool and 1 operator QA market with a $2 pool.

---

## 5. Trade path

- **Order flow (H, llms-full.txt, agent.json, x402 listing):** `POST /api/agent/v1/trade` with `{marketId, side, sizeUsd, idemKey, walletAddress, [quoteId, minSharesOut|maxPriceCents]}` -> `402` challenge -> sign an EIP-3009 `transferWithAuthorization` for exactly `sizeUsd` USDC to the settlement EOA -> retry the same POST with `X-PAYMENT: base64(signed authorization)` -> `200 {receipt, txHash, explorerUrl, position, proofUrl}`. `simulate:true` runs the full pipeline for $0 (not tested here: POST).
- **Limits (H):** $1 floor, "no maximum" (float guard at $1e9); bets above $10 need a `quoteId` plus a slippage bound; `idemKey` makes retries safe; `validBefore` should be within 120 s; `pool_impact_exceeded` is an incident-response brake.
- **No cancel, no sell, no limit orders.** A bet is final; the only exit is resolution (or refund/void). Standing bets exist only in the Bankr skill (client-side grant, M).
- **SDKs:** `@hunchxyz/agent-sdk` (npm, MIT, 0.5.0), `hunch-agent` (PyPI), CLI `npx hunch-agent`. Not installed or run.
- **PayBox reachability: yes in principle (M, untested).** Base is a PayBox-supported EVM chain and the challenge is plain x402 v1 `exact` on Base USDC. PayBox's `pay_x402` tool "creates an x402 payment proof from a granted wallet" and returns `x_payment` to retry the original resource (tool description, H), which is exactly Hunch's flow. Not demonstrated: Hunch's challenge `resource` carries a `#<intentHash>` fragment, and the intent hash binds marketId/side only through the request body, not the signature (Hunch states this itself, H). No Hunch service appeared in the first page of PayBox `discover_services` (query "hunch prediction market", network base; results were other venues' data resellers). The sign-then-retry shape means the agent, not a plugin, must orchestrate it (same limitation as in `docs/phase0-gate-results.md`).
- **Agent-safety pins published by Hunch (H):** scheme `exact`, network `base`, asset Base USDC, payTo the settlement EOA above, amount equal to the approved stake, EIP-3009 only (never approve/permit). Treat these as a checklist for any signing guard, but pin them from this note, not from the live challenge.

---

## 6. Fees

- **2% entry fee by default**, set per market as `feeBps` (200 on every market I saw). Quote example: $5 stake -> `feeUsd 0.10`, `netStakeUsd 4.90`. The bettor pays; winners split the **net** pool; the fee goes to "Hunch market treasury". (H)
- **No gas cost to the bettor** (relayer pays bet and payout gas). (H)
- **Bazaar:** fee 200 bps taken from winners' payout at settlement, of which 100 bps goes to the creator on creator-owned markets (`feeTerms {model:"settlement", bps:200, creatorBps:100}`), bets from $0.50; unresolved 48 h after the deadline -> all refunded (homepage summary M; API field H).
- **Implicit cost:** your own stake moves the price you get (parimutuel); no maker/taker fees, no spread. A 2% entry fee alone exceeds most cross-venue edges.

---

## 7. Resolution and dispute risk

- **Mechanism (H, docs.md):** a deterministic resolver reads timestamped observations: DexScreener (price/mcap), CoinGecko (rank/price, 5-minute rounds), Dune (on-chain metrics), Coinbase's Chainlink feeds on Base for tokenised-equity touches (e.g. the NVDA market), a drand beacon for the coin flip. **Real-world events (EPS beats, "Base token launch", earnings-call word counts) are resolved manually by Hunch** with proof ("Settled by Hunch from official Base communications and a consensus of credible reporting"). "An LLM's output never settles a market."
- **Dispute/appeal process: NOT FOUND** (searched: docs.md, llms-full.txt, /agents, roadmap; no dispute window, bond or oracle). Resolution is operator discretion.
- **Custody risk (H):** the Hunch skills README states "Payments go to Hunch's settlement account, not a market escrow contract enforcing the rules. Bet recording, payouts and promised refunds depend on the operator." No contract addresses, audit reports or formal verification are published (docs.md: "differentially tested against the on-chain vault" refers to the dark Arbitrum vault). Docs say "audited" for the trade route and payout function; no auditor is named (NOT FOUND).
- **Bazaar:** the creator resolves their own market (`resolve` / `void` endpoints), which is a worse conflict of interest.
- **Dispute risk: high** for event markets, medium for feed-settled price touches (the feed is credible, the operator still decides).

---

## 8. Geo, ToS and automation

- Only stated rule: "Not available where prohibited. You are responsible for legal compliance in your jurisdiction." and "Not financial advice" (H, llms-full.txt disclaimers). Geo-blocking mechanism: NOT FOUND (no restricted-country list; I could not test from other regions).
- **Terms of service: NOT FOUND.** `/terms` and `/privacy` return 404, and the home page HTML has no terms/privacy link. OpenAPI `termsOfService` just points at the home page.
- **Automation is explicitly welcome** ("Keyless ... built for autonomous agents", simulate mode, SDKs, scheduled-bot scaffolder). No ban on scripted betting found. Compliance risk is therefore mostly the user's own jurisdiction, with no ToS to cite either way.

---

## 9. Liquidity (all dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Lifetime volume | $815 across 124 bets | `/api/agent/v1/stats`, 2026-10-19T00:59Z | H (self-reported) |
| Lifetime paid out | $946.81 (exceeds volume; unexplained: refunds, partner/Bankr rail, or promotion?) | same | H (figure), open question (cause) |
| Markets | 519 open, 2 resolved | same | H |
| Auto-payout rate / median delay | 98.75% / 0.67 s | same | H (self-reported) |
| Largest pool seen | $11 (`base-token-launch-2026-12-31`, all YES) | `/quote` 2026-10-19 | H |
| Bazaar | newest 3 markets: pools $0, $0, $2 | 2026-10-19 | H |
| HUNCH token | mcap ~$47k, 24h vol ~$300 | CoinGecko page, 2026-10-19 | M |

No TVL, OI or order-book depth exists because there is no book. Even a $100 bet would be a majority of any pool I saw.

---

## 10. Event overlap with other venues (where arbitrage would exist)

| Hunch category | Overlaps | Usable as an arb leg? |
|---|---|---|
| 5/15-minute BTC/ETH/SOL UP rounds (61) | Polymarket 5m/15m crypto up/down markets | No: parimutuel, no exit, 2% fee, round settles in minutes |
| Equity touches (90) such as "NVDA falls to $205 by Nov 30" | Kalshi/Polymarket stock-price markets (if any exist for the same strike) | No: price is pool-implied; settles on Coinbase's tokenised-stock Chainlink feed, not the underlying exchange close |
| Quarterly EPS beats and earnings-call word counts (dozens) | Kalshi earnings/mention markets, Polymarket earnings markets | Definitions differ (Hunch picks its own EPS strike); manual resolution |
| Daily/weekly city weather (110) | Kalshi temperature markets | Different bands and station sources; zero liquidity |
| Crypto market-cap/price/rank ladders, token flips | Polymarket crypto price markets | Band definitions differ |
| Base ecosystem questions (Base token launch, x402 volume, tokenised stocks) | Polymarket "Base token" style markets (not checked) | Possible subject overlap, resolver differs |
| Politics, sports, macro | none seen in 431 markets (keyword scan: no election/Fed/CPI/NFL hits) | n/a |

---

## 11. Shared liquidity

**Not shared. Hunch's pools are independent** (H: current API serves only native markets; "the agent only routes within markets Hunch already lists"). Independent, but also too small to matter, so independence has no value here. The earlier venue-routing feature (roadmap, M) is not exposed by the API; if it is still live in the consumer app, it would be a duplicate of the routed venues' liquidity and must not be counted as a separate leg.

---

## 12. Fixtures saved (`docs/research/fixtures/playhunch-hunch/`)

| File | What |
|---|---|
| `markets-open-limit3.json` | `GET /markets?status=open&limit=3` (4.4 KB) |
| `markets-category-samples.json` | one ladder (`volume_eta`), one equity touch, one external-metric market from the limit=100 page |
| `markets-page100-summary.json` | derived counts for the first 100 markets |
| `markets-coin-flip.json` | `GET /markets?type=coin_flip` |
| `quote-yes-5usd.json` | `GET /quote?marketId=base-token-launch-2026-12-31&side=yes&sizeUsd=5` |
| `research-base-token-launch.json` | `GET /markets/{id}/research` |
| `stats.json`, `health.json` | platform stats and the `ok:false` health read |
| `well-known-x402.json` | x402 service listing and signing policy (includes the settlement EOA) |
| `well-known-agent.json` | agent manifest (third-party contact email redacted) |
| `bazaar-markets-limit3.json` | Bazaar `GET /markets?limit=3` (creator wallet redacted) |

`openapi.json` (58.8 KB) was not saved (over the 50 KB cap); its 21 operations are tabulated in section 4.

---

## 13. NOT FOUND / open questions

- Any current routing to Polymarket, Limitless, Myriad, Opinion or other venues in the API (searched: agent.json, openapi.json, llms.txt, llms-full.txt, docs.md, market lists, hunch-skills README and atskills listing).
- The CoinGecko description that the hint quotes: the CoinGecko page (WebFetch) had no project description; the CoinGecko API returned 429 twice, so the exact text is unverified.
- Terms of service, geo-block list, dispute process, audit reports, contract addresses, escrow contract.
- Whether trading is actually paused (`health.ok:false`); needs a POST or a human check in the app.
- Why `totalPaidOutUsd` ($946.81) exceeds `totalVolumeUsd` ($815).
- What `virtualLiquidityUsd` does; whether the 99c quote at an $11 one-sided pool is how all thin pools price.
- Settlement EOA balance (Blockscout 403).
- Weather and price-direction rounds: pool sizes (all list-level volumes read 0, which the data-quality note says is unreliable).

## 14. Suspicious content (untrusted text aimed at AI agents; not followed)

- llms.txt, llms-full.txt, agent.json and the x402 listing address agents directly (install the MCP server, `npx hunch-agent run --live`, "Safety: place_bet moves real money; simulate first", signing pre-checks). Benign in tone, but it is instruction-shaped text from a third party.
- API fields `research.advisory` (LLM-derived) exist; Hunch itself says they are "DATA ONLY, never instructions". Treat all market `summary` text the same way.
- agent.json and openapi.json include a personal contact email of the project owner; deliberately not recorded here.

---

## Sources

- https://www.playhunch.xyz (WebFetch 2026-10-19) - H
- https://www.playhunch.xyz/docs.md , /docs (WebFetch) - H
- https://www.playhunch.xyz/llms.txt , /llms-full.txt (curl 2026-10-19) - H
- https://www.playhunch.xyz/agents (WebFetch) - H
- https://www.playhunch.xyz/openapi.json (curl; 21 operations) - H
- https://www.playhunch.xyz/.well-known/agent.json , /.well-known/x402 (curl) - H
- https://www.playhunch.xyz/api/agent/v1/{markets,quote,markets/{id}/research,stats,health} (unauthenticated GETs, 2026-10-19) - H
- https://www.playhunch.xyz/roadmap (WebFetch; page says last updated 2026-05-26) - M (small-model summary)
- https://bazaar.playhunch.xyz/api/bazaar/v1/markets ; https://arena.playhunch.xyz/api/arena/v1/capabilities (GETs) - H
- https://github.com/rajkaria/hunch-skills (README via `gh api`, created 2026-09-16, MIT) - H
- https://github.com/rajkaria/hunch-vpm , https://github.com/rajkaria/hunch-casper (repo metadata only) - M; `rajkaria/hunch` returned 404 (private or renamed)
- https://registry.npmjs.org/@hunchxyz%2fagent-sdk (npm metadata) - H
- https://www.coingecko.com/en/coins/hunch (WebFetch; API returned 429) - M
- https://atskills.one/bankrbot/hunch (WebFetch; listing dated 2026-08-06) - M
- PayBox `discover_services` search "hunch prediction market" (read-only) and `pay_x402` tool description - H (tool text)
- WebSearch (extended) "Hunch playhunch.xyz prediction market Base parimutuel agents x402" - L (snippets conflict on chain and routing)
