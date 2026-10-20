# Hyperliquid HIP-4 front-end: Floatout (venue spec)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Floatout is NOT a venue. It is a white-label front-end launcher ("launch your own Hyperliquid DEX") that routes orders to Hyperliquid HyperCore and earns a builder-code fee. Its outcome markets are Hyperliquid HIP-4's own catalog, so there is no independent liquidity and no independent price. Skip it as an adapter. The integration target is Hyperliquid HIP-4 itself (a separate spec). Everything under "Underlying venue" below is useful for that adapter and was verified with live unauthenticated calls.

adapter_priority: skip (as a Floatout adapter). Hyperliquid HIP-4 directly is a different candidate, probably P0/P1 for overlap categories.

## What Floatout is

- Live: yes. floatout.xyz returns 200 and the pricing page shows a countdown to an "Oct 30, 2026" launch-fee waiver. [H] https://floatout.xyz/pricing
- Pitch: "Launch your own Hyperliquid DEX with perps and prediction markets under your brand... earn a share of the trading fees." [H] https://floatout.xyz/
- Outcome markets: shows "Hyperliquid's existing catalog ... Floatout does not let builders create their own questions or set results." Traders use their own Hyperliquid accounts; Floatout says it never holds funds. [H] https://floatout.xyz/
- Tiers: Starter free (Floatout keeps 100% of builder fee); Launch $2,500 one-time, builder gets 85%; Pro $7,500, 90%; Enterprise custom. [H] https://floatout.xyz/pricing
- Stats on homepage ticker (perps, 24h vol $4.89B, OI $11B, 178 perp markets) are Hyperliquid-wide perp numbers, not Floatout's. [M] https://floatout.xyz/
- Floatout's own outcome volume is negligible. DefiLlama "Floatout Outcome" (id 8982, category Interface, tag "Hyperliquid HIP4 Builder", listed ~2026-10-07): dexs total24h 0, total30d 0, totalAllTime 10 (USD) at query time; fees all-time 0. Methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code." [H] https://api.llama.fi/protocol/floatout-outcome , https://api.llama.fi/summary/dexs/floatout-outcome
- GitHub org Floatout (created 2026-10-01): bio "white-label launcher for Hyperliquid trading apps..."; 6 public repos, 5 of which look like forked MCP/llms.txt directory lists; the only original-looking one is `hl-builder-fees` ("Exact Hyperliquid builder code fee math"). No venue API/SDK repo. [H] gh api orgs/Floatout/repos
- Project is days/weeks old (org 2026-10-01, DefiLlama listing early Oct 2026): high churn risk. [M]
- Floatout API/docs: NOT FOUND (searched: homepage, /pricing, DefiLlama, GitHub org, docs.floatout.xyz returns 200 but no content retrievable beyond shell). demo.floatout.trade renders only a title via WebFetch (JS app). No documented public Floatout read or trade API; every needed datum is available from Hyperliquid directly.
- Terms page https://floatout.xyz/terms (200) covers only custody and builder-fee share (merkle-claim pool, "no withdraw, sweep or admin-drain function"); NOT FOUND: restricted jurisdictions, bot/API rules. [H]

## Underlying venue: Hyperliquid HIP-4 outcome markets (facts for the real adapter)

### Liveness and liquidity
- HIP-4 went live on mainnet 2026-05-02, first with recurring BTC daily binary. [M] TokenPost/KuCoin/Liquidiction via search (not opened first-hand).
- Cumulative volume estimates disagree: ~$317M after five months (TokenPost), $449.2M all time with 24h $3.3M (Liquidiction), >$520M (KuCoin). September ~$51M; early October ~$1M/day; BTC market volume -93% from May peak; soccer 28% of cumulative. As of Oct 13, 228 active markets. [M] third-party trackers, not official. Treat 24h volume of a few $M as the working number.
- Live catalog today: outcomeMeta returned 333 outcomes. Templates by count: binaryPrice 110, sportsContestParticipant2 50, sportsTournamentParticipant 34, sportsContestDraw2 25, sportsContestWinner 23, priceTouch 13, companyIpoFirstDayMarketCap 10, awardCandidate 7, sportsSpread 5, sportsTotal 5, companyIpoConfirmed 3, policyRateDecrease 2. Venues (deployers): "out" 191, "txyz" 73, "skew" 61. [H] POST https://api.hyperliquid.xyz/info {"type":"outcomeMeta"}, 2026-10-19
- Depth is uneven: many books are only dust quotes (0.00025/0.99975); some (e.g. HYPE priceTouch, outcome 7186) have ~10 levels with hundreds of shares each (~$0.1-0.7k per level). [H] l2Book fixtures.
- Permissionless deployment: since 2026-08-29, builders staking 500,000 HYPE can deploy markets from validator-approved templates. [M] TokenPost via search. Deployer actions doc says testnet-only on the docs page. [H] https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions.md

### Market model and tokenisation
- Binary Yes/No outcomes, fully collateralised, settle within a range via `settleFraction` (Yes pays settleFraction, No pays 1 - settleFraction; 1 = Yes, 0 = No). Quote token USDC (outcomeMeta `quoteToken`). [H] https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md and outcomeMeta
- Categorical = "Questions": exactly one named outcome settles Yes, rest No; each outcome has its own book; a `fallbackOutcome` ("template fallback", description "other") exists. Live questions confirmed (e.g. UEFA Europa League match 3-way, Ballon d'Or, EPL/UCL winner). [H] outcomeMeta `questions`. Docs said categorical was not in the initial release; it is live now.
- Central limit order book, spot-like, price in (0,1). Yes bid at p equals No ask at 1-p (merged book). Price-side-time priority. [H] HIP-4 doc.
- Asset encoding: `encoding = 10*outcome + side` (side 0 or 1). Coin `#<encoding>`, token `+<encoding>`, order asset id `100_000_000 + encoding`. Example outcome 7186 side 0 = `#71860`. [H] https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md

### Read API (official, public, unauthenticated)
- Base: https://api.hyperliquid.xyz/info (POST JSON), wss://api.hyperliquid.xyz/ws. Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api [H]
- Key calls verified live 2026-10-19 [H]:
  - `{"type":"outcomeMeta"}` -> `{outcomes[{outcome,name,description,sideSpecs,quoteToken,venue,deployerFeeScale}], questions[{question,name,description,fallbackOutcome,namedOutcomes,settledNamedOutcomes}], deployers[...], feeScale}`. Description is a pipe/colon keyword string (e.g. `perp:ZEC|priceDescription:the Pyth ZEC/USD price|seconds:90|threshold:1057|time:20261023-0800`), which must be parsed for cross-venue matching.
  - `{"type":"l2Book","coin":"#71860"}` -> `{coin,time,levels:[bids[{px,sz,n}],asks[...]]}`.
  - `{"type":"allMids"}` includes ~666 `#<encoding>` mids (e.g. `#114220: 0.4922`).
  - Not accepted: `outcomeMetaAndAssetCtxs` (deserialization error; no such type found).
- Also documented generically: candleSnapshot, recentTrades, WS `l2Book`/`trades`/`bbo`/`allMids` channels (applicable to outcome coins per the spot-like design; not individually verified for `#` coins this session). [M]
- Rate limits per IP: REST 1200 weight/min; l2Book and allMids weight 2, other info 20; WS max 10 connections, 1000 subscriptions, 2000 msgs/min. [H] https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md
- Builder fills dumps: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_address}/{YYYYMMDD}.csv.lz4` (lowercase address). [H] builder-codes doc.
- Fixtures (all captured 2026-10-19): docs/research/fixtures/hyperliquid-hip-4-front-end-floatout/outcomeMeta.sample.json, l2Book.sample.json, allMids.outcome.sample.json

### Trade path
- Orders go through the standard Hyperliquid `/exchange` endpoint using the spot-like order action with outcome asset id `100000000 + 10*outcome + side`, signed by EVM key (EIP-712 / L1 action signature, optionally by an approved agent wallet). Also `split-outcome` and `negate-outcome` exchange actions for mint/merge/negate. [H for existence of actions and asset id; M for the exact order-action payload, which I did not read first-hand]
- Builder code (`{"b": address, "f": tenths of bp}`) is optional per order; user must first sign `ApproveBuilderFee` with the main wallet. Builder cap 0.1% perps, 1% spot; outcomes inherit spot behaviour and builder fees can also apply to buys. [H] https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md , hip-4-deployer-actions.md
- Through Floatout: the front-end is a browser UI; no programmatic Floatout trade API found. An agent should trade Hyperliquid directly and may attach no builder code at all.

### PayBox reachability
- paybox_reachable: partial. Account is a Hyperliquid account keyed to an EVM address, funded with USDC (bridge from Arbitrum, or transfers on HyperCore). Trading is by signed typed-data actions rather than on-chain transaction proposals, so a PayBox EVM wallet would need (a) an Arbitrum USDC deposit via normal transfer, and (b) a typed-data/EIP-712 signing tool for order actions, or an approved agent key. I did not call any PayBox tool; whether PayBox supports arbitrary EIP-712 signing for Hyperliquid actions is unverified. [M/unknown]

### Fees
- Outcome trading charges fees only when closing or settling, not when opening; no maker rebates (makers who would get rebates pay zero). Fee-paying volume only counts for tiers. [H] https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md
- Per-outcome `deployerFeeScale` (live data shows "1.0" on most `out`/`skew` markets): users pay base rate x (scale + max(scale,1)), so scale 1 = 2x, deployer receives 1x, protocol 1x. [H] hip-4-deployer-actions.md. Base outcome rate itself: NOT FOUND in docs read (searched fees page, deployer actions page); it follows the user's tier `userFees` rates. The HIP-4 doc said fees were zero during initial testing, which may be stale. [L]
- Floatout adds a builder fee on top (rate not published; cap 1%); Floatout keeps 100% on Starter, 15% on Launch, 10% on Pro of that fee. [H] pricing page. An aggregator going direct avoids it.

### Resolution
- Template-based: validators vote on templates; deployers instantiate and later call `settleOutcome`/`settleQuestion` (sub-deployer addresses authorise these, visible in outcomeMeta `deployers`). Markets that contradict their template `semanticRestriction` are "malformed and slashable by validators". [H] hip-4-deployer-actions.md
- Initial BTC market settles daily 06:00 UTC to the HyperCore BTC mark price. Price templates reference Pyth (e.g. "the Pyth ZEC/USD price", "Pyth US100 index price") or HyperCore perp mark (priceTouch). Sports use named `officialSource` (e.g. ESPN, UEFA) with `resolutionDeadline`. [H] outcomeMeta descriptions
- Dispute risk: no on-chain dispute/appeal process found; resolution is by the deployer (including third-party staked deployers like "skew" and "txyz") with validator slashing as the only backstop. NOT FOUND: formal dispute window (searched HIP-4 doc, deployer actions doc). Treat sports/event resolutions as deployer-trust. Settlement rules differ from Polymarket/Kalshi (e.g. "countedPlay: regulation time" for soccer; priceTouch vs binaryPrice use short windows `seconds:3`/`seconds:90`), so rule-matching must be per-market. [M]

### Geo, ToS, automation
- Floatout: "operator and trader eligibility depend on the jurisdiction and activity"; no list. Terms page has no restricted-jurisdiction or bot clause. [H/NOT FOUND]
- Hyperliquid: public API and WS are explicitly provided for programmatic trading with documented rate limits. Hyperliquid terms of use / restricted jurisdictions: NOT FOUND (searched: gitbook legal path 404, app.hyperliquid.xyz fetch returned nothing). Do not assume US persons can use it. [L]

### Event coverage and overlap (arbitrage relevance)
- Crypto price: binaryPrice and priceTouch on BTC, ETH, HYPE, ZEC etc. at very short horizons (90s to daily) - overlaps Polymarket/Kalshi/Limitless crypto-price brackets only partly (different oracle: Pyth/HyperCore mark, different windows). [H] outcomeMeta
- Sports: NFL (e.g. Cowboys-Packers), EPL/UCL/Europa League matches, MLB tournament winners - overlaps Polymarket/Kalshi. [H]
- Awards/IPO/macro: Ballon d'Or, company IPO first-day market cap, policy rate decrease (2 markets) - small overlap. [H]
- Politics: none seen among the template counts. [H]

### Shared liquidity
- Floatout -> Hyperliquid HIP-4: 100% shared. Floatout is purely an order-routing UI with a builder code; any Floatout fill is a Hyperliquid book fill. Not an independent arbitrage leg. [H]

## Suspicious content

None found. Pages contained only normal marketing text and tracking scripts (Google, Reddit, X ad pixels); no instructions aimed at AI agents.

## Not found

- Floatout API/docs, SDK, or any public Floatout endpoint (searched: homepage, pricing, terms, GitHub org, DefiLlama).
- Floatout restricted-jurisdiction or bot/API terms.
- Hyperliquid base outcome fee rate and formal dispute process; Hyperliquid terms/jurisdiction list.
- Official Hyperliquid HIP-4 volume figures (only third-party trackers).
- A web search budget limit was hit near the end, so one planned search on resolution/dispute was not run.

## Sources

- https://floatout.xyz/ [H]
- https://floatout.xyz/pricing [H]
- https://floatout.xyz/terms [H]
- https://api.llama.fi/protocol/floatout-outcome [H]
- https://api.llama.fi/summary/dexs/floatout-outcome , /summary/fees/floatout-outcome [H]
- https://github.com/Floatout (via gh api orgs/Floatout/repos) [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions.md [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md , /trading/builder-codes.md [H]
- https://api.hyperliquid.xyz/info (outcomeMeta, l2Book, allMids; unauthenticated POST reads, 2026-10-19) [H]
- Web search summary citing kucoin.com, tokenpost.com, liquidiction.xyz/hip4/stats for volume and launch date [M]
