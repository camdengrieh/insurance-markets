# Sportstensor (Bittensor subnet 41) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch of sportstensor.io docs, `gh api` raw reads of github.com/sportstensor, public unauthenticated GETs to api.coingecko.com and api.almanac.market. No account, wallet, key, signature, POST or PayBox call. Third-party text treated as untrusted data; no agent-directed instructions found in any page read.
Tags: **H** first-hand primary source this session; **M** secondary/inferred; **L** weak/stale.
Search note: one WebSearch worked (extended); a second was refused (session budget used up), so no fresh news check on SN41 emissions status.
Fixtures: `docs/research/fixtures/sportstensor/` (`coingecko_sn41.json`, `almanac_prices.json`).

## 0. Verdict

**adapter_priority: skip as a trading venue (at most P2 as a signal source, and no usable feed exists today).**

1. **Not a venue.** Sportstensor is a Bittensor subnet (SN41) that pays miners/traders in SN41 alpha tokens for prediction skill. Its "predictions" are real Polymarket CLOB trades placed through Almanac (H). There is no Sportstensor order book, AMM, market list or resolution layer (H, docs/architecture).
2. **Liquidity is 100% Polymarket's** (via Almanac). Not an independent arbitrage leg. Almanac is covered in `almanac-market.md` (verdict skip) and Polymarket by the parallel workflow.
3. **No public signal feed.** The "Sportstensor Meta-Model" (ensemble of miner models) is advertised, but no API, endpoint, leaderboard or data feed for its outputs is documented (H, docs/overview, scoring, architecture). Only Almanac's undocumented `/v1/poly-traders*` smart-money overlay exists, which is Almanac's, not the subnet's (see almanac-market.md).
4. **Subnet liveness is probable but unproven.** Token price/market data is current today (H), but the validator/miner repo `sportstensor/sn41` is archived since 2026-07-20 (H). Whether emissions still run is NOT FOUND.

## 1. Liveness (2026)

| Check | Result | Tag |
|---|---|---|
| sportstensor.io (www.sportstensor.com returns 404; .io is the live site) | Docs pages overview/scoring/tokenomics/architecture load; footer 2026; says 5-minute crypto markets "now live" | H (https://sportstensor.io/, /docs/overview) |
| CoinGecko `sportstensor` (SN41), fetched 2026-10-19 04:48Z | price $1.82, mcap about $8.99M, 24h volume about $142.5k, circulating about 4.95M of 21M max | H (fixture `coingecko_sn41.json`) |
| Almanac `/api/v1/prices` 2026-10-19 | alpha_price_usd 1.8267, `current_epoch_budget` about 4,853 (a daily token budget is still being computed) | H (fixture `almanac_prices.json`) |
| GitHub `sportstensor/sn41` | `archived: true`, last push 2026-07-20; other org repos (MLB, MLS, EPL, NFL) last pushed 2024-2025 | H (gh api) |
| Almanac volume | about $21.0M cumulative since 2025-12-02 (own stats, 2026-10-19) | H (api.almanac.market/api/v1/stats, see almanac-market.md) |
| Launch history | Subnet launched 2024-07-15; X account created 2024-06; Sept 2025 post on Polymarket/Almanac integration | M (WebSearch summary of X posts, not opened) |

CoinGecko lists ATH $16.73 (2025-11-02) and ATL about $0.01 (2026-04-03). The ATL looks suspect against a $1.82 price and may be a data glitch (L).

Conclusion: the brand and token are live and Almanac still routes trades; the archived repo is unreconciled (open question).

## 2. What it is (kind, market model)

- Kind: **other / incentive network and signal layer** (not a trading venue). H.
- Three layers per docs/architecture: Bittensor base (incentives, consensus), Market (predictions are trades on Polymarket's CLOB through proxy wallets, settled with real money), Intelligence (competing miner models feed the "Sportstensor Meta-Model"). H.
- Scoring (docs/scoring): history was closing-edge scoring, then Sortino/PnL, now the "Almanac era": rolling 30-day window, 24h epochs, ROI = profit/volume, qualified volume = winning-trade volume after fees, eligibility gates, two-phase optimisation, hourly scoring, on-chain weights set by many validators. H.
- Market model: binary YES/NO outcome tokens of Polymarket (conditional tokens on Polygon). Sportstensor adds nothing of its own. H on mechanism, M on exact token standard (see Polymarket note).

## 3. Chains and collateral

- Incentive layer: Bittensor chain (subtensor); SN41 alpha token, max supply 21,000,000; miner registration burns TAO; trades on the Bittensor subnet-token DEX as SN41/SN0 (H, /docs/tokenomics). CoinGecko platform `bittensor: 41` (H).
- Trading collateral: Polymarket's (pUSD/USDC on Polygon), reached via Almanac proxy Safe wallets. See almanac-market.md and the Polymarket note. M here.

## 4. Read API

- Official/public read API for Sportstensor itself: **none documented** (H: overview, scoring, architecture, tokenomics all searched; "does not mention a public API, a read endpoint for Meta-Model predictions, or access to miner signals").
- On-chain: subnet metagraph (weights, miner coldkeys, UIDs) is readable from the Bittensor chain; validators read miner metadata from chain each epoch (H, docs/architecture). That shows who earns emissions, not their predictions. No indexer/subgraph endpoint was checked (NOT FOUND, searched: docs pages; no explorer/API fetched).
- Market data on SN41 token: CoinGecko public API (unauthenticated, rate-limited) works (H, fixture).
- Almanac's keyless API (`https://api.almanac.market/api`) is undocumented, ToS-restricted and Polymarket-mirroring: use Polymarket directly. Details in almanac-market.md.
- Websocket: none for Sportstensor.
- Docs URL: https://sportstensor.io/docs/overview (H). `docs.sportstensor.com` returned 403 to a sibling agent's fetch (M, from almanac-market.md).

## 5. Trade path

- Sportstensor: **none**. There is nothing to trade except the SN41 alpha token (a Bittensor subnet token, not a prediction market).
- Prediction trading goes through Almanac, whose API "exposes credential generation, session creation, market search, and signed order placement ... Safe proxy wallet deployment, EIP-712 order signing, and routing to Polymarket" (H, docs/architecture, no endpoints listed). Auth shape (EIP-191 session signature plus Polymarket creds) is in almanac-market.md. An aggregator should trade on Polymarket directly instead.

## 6. PayBox reachability

**No** for Sportstensor as a venue (nothing to trade). SN41 tokens live on Bittensor (Substrate), not an EVM chain PayBox covers (M; not verified against PayBox contracts, no PayBox call made). The underlying Polymarket route is covered elsewhere.

## 7. Fees

- Almanac charges 1% on winning trades; the fee is used to buy back SN41 "with potential burns" (H: "Almanac's 1% winning-trade fee is used to buy back SN41 on the open market, with potential burns", /docs/tokenomics). Paid by the trader. No further formula given (NOT FOUND for the base: stake vs profit; see almanac-market.md for its own fee notes). Polymarket fees apply separately.
- No Sportstensor-specific trading fee exists.

## 8. Resolution and dispute risk

Inherited from Polymarket (UMA optimistic oracle, per the Polymarket note; M here). Sportstensor itself resolves nothing. Separate risk: subnet incentive scoring is validator-set and could change or stop (archived repo).

## 9. Geo, ToS, automation

- No geo-restriction statements on sportstensor.io pages read (H, FAQ page 404; homepage summary: none mentioned). Almanac and Polymarket restrictions apply to trading.
- Almanac ToS requires written consent for automated access (from almanac-market.md, H there). Miner docs say automated strategies are fine for subnet miners (H, sn41 README).

## 10. Liquidity (sources and dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| SN41 mcap | about $8.99M | CoinGecko, 2026-10-19 | H |
| SN41 24h volume | about $142.5k | CoinGecko, 2026-10-19 | H |
| Almanac cumulative volume | about $21.0M since 2025-12-02, about $0.3M/day | api.almanac.market stats, 2026-10-19 (via almanac-market.md) | H |
| Prediction-market OI/TVL of its own | none | n/a | H |

## 11. Category overlap and shared liquidity

- Categories: NFL, NBA, MLB, MLS, EPL, NHL, UFC, esports, and 5-minute crypto markets (H, homepage summary). These are the Polymarket sports/crypto markets; the arbitrage overlap is with Kalshi, Limitless, etc., but only via Polymarket's book.
- **Shares liquidity with Polymarket (100%). Not an independent leg.**

## 12. Usefulness to the project

- As a signal source the Meta-Model would be interesting ("Quotient as a signal source" analogue), but no feed is exposed. Possible later routes: (a) ask the team for access (not done); (b) derive wallet-quality signals from Polymarket public data (what Almanac does). Not worth an adapter now.
- Reconsider if the team publishes a Meta-Model API or if on-chain weights plus Almanac per-trader positions become documented.

## Open questions

1. Is SN41 still emitting after the sn41 repo was archived on 2026-07-20? (Check taostats/subnet page; no explorer was fetched.)
2. Is the Meta-Model output exposed anywhere (Almanac "Terminal" signals page, Discord)? NOT FOUND in public docs.
3. Docs pages "The Terminal" and "FAQ" were not readable (FAQ 404); contents unknown.

## Not found

- Public API / data feed for Meta-Model or miner signals (searched: sportstensor.io docs overview, scoring, tokenomics, architecture; GitHub org sportstensor repo list; sn41 repo tree).
- Any Sportstensor-native order book, market list, resolution or fee schedule (searched: same pages).
- Fresh (Sept-Oct 2026) news on emissions or deregistration (searched: WebSearch extended; second search blocked by budget).
- FAQ page (https://sportstensor.io/faq returned 404).

## Sources

1. https://sportstensor.io/ (H; www.sportstensor.com 404)
2. https://sportstensor.io/docs/overview , /docs/scoring , /docs/tokenomics , /docs/architecture (H, via WebFetch summaries)
3. https://github.com/sportstensor/sn41 (README, tree; archived, pushed 2026-07-20; gh api) and org repo list (H)
4. https://api.coingecko.com/api/v3/coins/sportstensor (GET 2026-10-19; H) -> fixture `coingecko_sn41.json`
5. https://api.almanac.market/api/v1/prices (GET 2026-10-19; H) -> fixture `almanac_prices.json`
6. docs/research/venues/almanac-market.md (sibling note, H there)
7. WebSearch (extended) summary: X posts https://x.com/sportstensor/status/1968037908029505968 , CoinGecko page, https://taoexplained.substack.com/p/the-big-five-top-bittensor-subnets (M, not opened)

## Privacy / safety log

Only the User-Agent `insurance-markets-research/0.1` was used for curl. No personal identifiers in requests or fixtures (grep for "@" clean). No suspicious or agent-directed content found.
