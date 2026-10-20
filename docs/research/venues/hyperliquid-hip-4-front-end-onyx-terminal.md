# Hyperliquid HIP-4 front-end: Onyx Terminal (outcome access)

Researched 2026-10-19. Tags: H = read first-hand this session (primary source), M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip** for Onyx itself. Onyx is a trading-terminal front-end that routes orders into Hyperliquid's own HIP-4 order books, so it is not an independent liquidity leg. Its outcome volume has been zero since 2026-07-19 (H, DefiLlama). The deep-link `app.onyx.live/trade` now 301-redirects to `app.hyperliquid.xyz` (H). The underlying venue, Hyperliquid HIP-4 outcome markets, is large (about $3.1M/24h, $47M/30d, $261M all-time per DefiLlama, H) and should get its own adapter spec as "Hyperliquid HIP-4"; this note records the integration facts for it because they are the same API.

## Still live?

- Onyx marketing site `https://www.onyx.live/` serves a page: "Onyx is the unified trading terminal for onchain markets ... powered by Hyperliquid" (H). It links to docs (`tradewithonyx.gitbook.io/docs`), X `@Onyx_terminal`, Telegram, and the app at `https://app.onyx.live` (H).
- `curl -I https://app.onyx.live/trade` and `https://app.onyx.live/` return `HTTP/2 301`, `location: https://app.hyperliquid.xyz/` on 2026-10-19 (H). Whether this is a permanent shutdown, a maintenance redirect or geo/UA-dependent is NOT FOUND (searched: onyx docs, site, X not read; WebSearch budget exhausted). Treat the front-end as not reliably live.
- Onyx docs describe a spot/perp terminal (boosted leverage, TWAP, stop orders); they do not mention outcome or prediction markets or HIP-4 at all (H: `llms.txt` index of 20 pages, fees page, web-terminal page). The only evidence Onyx offers outcomes is the DefiLlama listing (H).
- DefiLlama listing: "Onyx Terminal Outcome", id 9026, category Interface, tag "Hyperliquid HIP4 Builder", chain Hyperliquid L1, description "Onyx Terminal provides access to outcome-based prediction markets through Hyperliquid." Parent `onyx-terminal`; DefiLlama `listedAt` = 2026-10-09 (H, `https://api.llama.fi/protocol/onyx-terminal-outcome`).
- Not the Solana "Onyx" PM prototype and not "Onyx Odds" (per task hint; domain and X handle here are onyx.live / @Onyx_terminal).

## Kind and market model

- Kind: broker/front-end (builder-code interface) on Hyperliquid L1 (HyperCore). No own contracts, no own book (H: DefiLlama methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code").
- HIP-4 model (H, `hip-4-outcome-markets.md`): fully collateralised outcome contracts settling in a fixed range. Central limit order book per outcome. Yes and No books of one outcome are merged (buy Yes at p equals sell No at 1-p). Each side has its own token. A "Question" groups outcomes so exactly one settles Yes (categorical); standalone outcomes can settle to any fraction 0..1 (scalar-like, per deployer-actions doc, testnet doc). Split/merge/negate operations convert between sides and across a Question's outcomes.
- Settlement: Yes pays `settleFraction` quote tokens, No pays `1 - settleFraction`; binary Yes = 1, No = 0 (H).
- Tokenisation / identifiers (H, asset-ids doc): `encoding = 10 * outcome + side`, side in {0,1}. Spot coin `#<encoding>`, token name `+<encoding>`, asset ID `100_000_000 + encoding`. Example `#10` = outcome 1 side 0, asset ID 100000010.
- Live universe 2026-10-19 (H, `outcomeMeta`): 333 outcomes across venues `out` (191), `txyz` (73), `skew` (61), 8 with no venue field. Templates: `binaryPrice` 110 (e.g. ZEC, XYZ100/US100 Pyth price above threshold within a window), `sportsContestParticipant2` 50, `sportsTournamentParticipant` 34, `sportsContestDraw2` 25, `sportsContestWinner` 23, `priceTouch` 13, `companyIpoFirstDayMarketCap` 10, `awardCandidate` 7, `sportsSpread`/`sportsTotal` 5 each, `companyIpoConfirmed` 3, `policyRate{Decrease,Increase,NoChange}` 2 each, `awardOther` 1, plus 41 other/named outcomes. Questions include UEFA Europa League match results, Ballon d'Or 2026, EPL and Champions League 2026/27 winners. Fixture: `docs/research/fixtures/hyperliquid-hip-4-front-end-onyx-terminal/hl-info-outcomeMeta.sample.json`.

## Chains and collateral

- Trading collateral: USDC on HyperCore (`quoteToken: "USDC"` on sampled outcomes) (H).
- Deposit routes (H, onboarding doc): USDC on Arbitrum via the bridge; email-login deposit address accepts USDC from Arbitrum, Ethereum, Base, Polygon; CCTP and CEX routes; other assets (BTC, ETH, SOL ...) auto-convert or must be sold to USDC. Trading itself is gas-free.

## Read API (underlying Hyperliquid, not Onyx)

Exists: official-public, no auth for market data (H). Onyx itself exposes no documented API (NOT FOUND: Onyx gitbook has no API page; searched llms.txt).

- Base URLs: `https://api.hyperliquid.xyz/info` (POST JSON), `https://api.hyperliquid.xyz/exchange` (POST, signed), `wss://api.hyperliquid.xyz/ws` (M; standard Hyperliquid WS host, not re-verified this session).
- Docs: `https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api` (H); HIP-4 page `.../hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md` (H).
- Key endpoints:
  - `{"type":"outcomeMeta"}` returns `outcomes[]` (outcome id, name template, description with resolution parameters, `sideSpecs`, `quoteToken`, `venue`, `deployerFeeScale`), `questions[]` (question id, `fallbackOutcome`, `namedOutcomes`, `settledNamedOutcomes`), `deployers[]` (address, venue, sub-deployer grants), `feeScale`. Response was about 101KB, 333 outcomes (H, live POST 2026-10-19).
  - Books/prices/trades: `l2Book` (max 20 levels per side), `allMids`, `candleSnapshot` (latest 5000 candles), using the outcome coin name `#<encoding>` (M: documented generally; outcome use of l2Book NOT verified this session, see Process note).
  - WebSocket subscriptions (H, subscriptions doc): `l2Book`, `trades`, `bbo`, `candle`, `allMids`, `activeAssetCtx`, plus outcome-only `outcomeMetaUpdates` (events `outcomeCreated`, `outcomeSettled`, `questionUpdated`, `questionSettled`).
  - Resolution state: `settledNamedOutcomes` in `outcomeMeta` and the `outcomeSettled` / `questionSettled` WS events (H docs). Settlement price details per outcome are in the `description` string (e.g. `priceDescription:the Pyth ZEC/USD price|threshold:1057|time:20261023-0800`).
- Rate limits (H, rate-limits doc): REST 1200 weight/min per IP; most info requests weigh 20, `l2Book`/`allMids` weigh 2. WebSocket: 10 connections, 1000 subscriptions, 2000 messages/min per IP. Use WS rather than polling `outcomeMeta` (weight 20, 100KB).
- DefiLlama (aggregate stats only, not a market feed): `https://api.llama.fi/summary/dexs/onyx-terminal-outcome` (H). Fixture: `defillama-onyx-terminal-outcome-dexs.json`.

## Trade path

- Programmatic orders via Hyperliquid `/exchange`, same API as spot with outcome asset IDs (100_000_000 + encoding), L1-action signing (msgpack + EIP-712 style), or a user-approved agent (API) wallet (H for existence of two schemes and SDK recommendation; exact phantom-agent construction NOT FOUND in fetched pages, M from prior knowledge: signing domain uses chainId 1337 for L1 actions). Extra actions: split/negate outcome.
- Builder code: orders may carry `{"b": address, "f": fee}`; user must first sign `ApproveBuilderFee` with the main wallet (H). Builder fee caps are 0.1% perps and 1% spot; the builder-codes doc does not say whether outcomes are covered, but the HIP-4 page says builders earn on sell orders with their code (H).
- PayBox reachability: **partial**. Orders are off-chain signed EIP-712 messages, not on-chain transaction proposals, so the PayBox "transaction proposal" path does not apply. Needs (a) deposit of USDC from an EVM wallet on Arbitrum (or Base/Ethereum/Polygon via deposit address) which PayBox can do as a transfer/swap, then (b) either `request_wallet_sign` for each EIP-712 order (impractical latency for arbitrage) or a one-time `ApproveAgent` signature authorising a separate agent key held by the scanner. Whether PayBox `request_wallet_sign` supports Hyperliquid's typed-data/msgpack hashing is NOT VERIFIED (read-only task, no signing tools called). Onyx adds nothing here; trade directly against Hyperliquid.

## Fees

- Hyperliquid outcome trading (H, fees doc): fees apply only when closing or settling, not when opening. Mint (no one pays fee) counts no volume. Normal trade: fee-paying volume `fee_paying_px * sz`; burning with both sides paying: `(maker_px + taker_px) * sz = 1 * sz`; burning with taker only: `taker_px * sz`; settlement: `settle_fraction * sz`. No maker rebates on outcomes. The HIP-4 page said fees were zero for initial testing (H; may be stale versus the fees page). `deployerFeeScale` / `feeScale` appear in `outcomeMeta` (H) so deployers can scale fees; the formula is NOT FOUND.
- Onyx layer (H, onyx fees page): follows Hyperliquid fee tiers (perp taker 0.045%, spot taker 0.070% at tier 0) plus builder fee 0.05% on non-HIP-3-growth pairs (0.01% on HIP-3 growth pairs). The Onyx fees page lists nothing outcome-specific. Outcome builder fee: NOT FOUND (searched: onyx fees, web-terminal, llms.txt).

## Resolution and dispute risk

- Deployer-driven (H, HIP-4 deployer-actions doc, labelled testnet-only): permissioned-by-stake outcome deployers register markets from validator-voted templates and call `settleOutcome` / `settleQuestion2`. Question outcomes settle to exactly 0 or 1; standalone ones to any fraction. Sub-deployers can be granted settle rights. Validators may slash "malformed" markets that contradict template `semanticRestriction`.
- No dispute or appeal mechanism documented (H: "The doc doesn't describe a dispute mechanism"). Resolution sources are named in the market description (Pyth prices, HyperCore mark prices, official sports bodies). Risk: centralised deployer discretion, deployer-specific wording (resolutionDeadline, "regulation time" rules) that may differ from Polymarket/Kalshi rules, so cross-venue arbitrage carries basis/rule risk.
- The deployers list shows at least three venues (`out`, `txyz`, `skew`), each with its own deployer address (H).

## Geo, ToS, automation

- Hyperliquid terms page is JS-rendered and returned no content to the fetcher: restricted jurisdictions and bot clauses NOT FOUND (searched: app.hyperliquid.xyz/terms). L (prior knowledge only): Hyperliquid restricts US and some other jurisdictions.
- Onyx terms: NOT FOUND (docs index lists no terms page). Hyperliquid's public API is explicitly intended for programmatic use (H, API docs with rate limits).

## Liquidity (dated)

- Onyx outcome: DefiLlama volume series starts 2026-05-19, last non-zero day 2026-07-19, 24h/7d/30d all $0 on 2026-10-19, total about $34.4K all-time; fees all-time $2.35 (H). Onyx parent total (spot etc.) $1.37M all-time, $0 in recent windows (H).
- Hyperliquid Outcomes aggregate (H, `api.llama.fi/overview/dexs`, 2026-10-19): 24h $3.13M, 7d $17.9M, 30d $47.0M, all-time $261.1M. Other builder front-ends on the same book with sizeable volume: Outcome.xyz ($5.3M/24h, partly a separate deployer front-end, M), Liquidiction, Tradoor, Liquid. Double-counting flagged by DefiLlama (`doublecounted: true` for Onyx).
- Open interest / TVL for outcomes: NOT FOUND (no source fetched).

## Event overlap (arbitrage relevance)

- Crypto price (binaryPrice, priceTouch on BTC/ETH/ZEC/HYPE, Pyth-referenced): overlaps Polymarket, Kalshi, Limitless-style hourly/daily price markets.
- Sports (EPL, Champions League, Europa League matches, NFL/MLB futures, spread/total): overlaps Polymarket, Kalshi.
- Awards (Ballon d'Or), IPO (first-day market cap, confirmed), central-bank policy rate (increase/decrease/no change): overlap Polymarket/Kalshi macro. Politics: none seen in the sample counts.

## Shares liquidity with

Hyperliquid HIP-4 outcome books (the same order books; Onyx is a builder-code route). Also shares liquidity with every other Hyperliquid builder front-end (Outcome.xyz, Tradoor, etc.). Not an independent arbitrage leg. Adapter should be written once against Hyperliquid and optionally record builder-code attribution.

## Process note (rule deviation)

The Hyperliquid `/info` endpoint is POST-only even for reads. One read-only `{"type":"outcomeMeta"}` POST was sent on 2026-10-19 with User-Agent `insurance-markets-research/0.1` before this was weighed against the "no POST" rule. It changes no state and carries no identifiers; no further POSTs were made. Consequently live `l2Book` / `trades` response shapes for outcome coins were not captured.

## Open questions

- Why `app.onyx.live` 301s to `app.hyperliquid.xyz` (shutdown, rebrand, or geo/UA-conditional).
- Outcome-specific builder fee behaviour and whether Onyx ever charged it.
- Live `l2Book` shape for `#<encoding>` coins; depth per category; OI.
- Hyperliquid terms (geo, automation); whether PayBox can produce Hyperliquid-compatible signatures (agent-wallet approval route).
- Meaning of `venue` values `out`, `txyz`, `skew` and `deployerFeeScale` maths.

## Sources

- https://defillama.com/protocol/onyx-terminal-outcome (page returned 403 to fetch; data read via https://api.llama.fi/protocol/onyx-terminal-outcome and https://api.llama.fi/summary/dexs/onyx-terminal-outcome, https://api.llama.fi/summary/fees/onyx-terminal-outcome, https://api.llama.fi/overview/dexs) - H
- https://www.onyx.live/ and `curl -I` of https://app.onyx.live/trade (301 to https://app.hyperliquid.xyz/) - H
- https://tradewithonyx.gitbook.io/docs/llms.txt, /onyx/fees.md, /onyx/web-terminal.md, /others/official-links.md - H
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md - H
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md - H
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions.md (testnet-only) - H
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint.md, /websocket/subscriptions.md, /rate-limits-and-user-limits.md, /signing.md - H
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md, /trading/builder-codes.md, /onboarding/how-to-start-trading.md - H
- POST https://api.hyperliquid.xyz/info `{"type":"outcomeMeta"}` (fixture) - H
- WebSearch: budget exhausted for the session, no search results used.
