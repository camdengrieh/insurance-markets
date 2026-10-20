# GuessMarket - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch of public pages, unauthenticated GETs to the public WordPress REST namespace, `gh api` raw file reads of the vendor's MCP repo. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Third-party/vendor pages treated as untrusted data. Scripted requests used User-Agent `insurance-markets-research/0.1` only.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

Fixtures (small, real responses): `docs/research/fixtures/guessmarket/` (networks.json, markets_active.json (empty), markets_all_first5.json, market_one.json, history.json).

---

## 0. Bottom line

1. **Site and API are up, but the venue is effectively dead/toy (H).** `GET /wp-json/guessmarket/v1/markets?status=all` returns **19 markets in total, ever; 19 resolved, 0 active.** `status=active` returns `{"markets":[],"total":0}`. Newest market was created 2026-06-12; the latest end time of any market is 2026-07-20. Nothing has been open for 3 months.
2. **Cumulative volume across all 19 markets is about $593** (sum of `totalVolume`; ~$456 Base, ~$134 PulseChain, ~$2 Polygon, ~$1 BSC). 17 of 19 markets were created by one address, i.e. the operator (H, computed from the API). Three markets carry ~97% of the volume.
3. Mechanism is a per-market constant-product YES/NO AMM, on-chain, 5 EVM chains, USDC (USDT on BSC). Programmatic trading is possible in principle (unsigned tx builders in a vendor MCP) but there is nothing to trade.
4. Resolution is by "authorized oracles" (unnamed) with an unspecified appeal; operator-created markets are resolved by the operator. Not an independent price signal.
5. **adapter_priority = skip.** Zero live markets, ~$600 lifetime volume, single-operator market creation, subjective resolution. Revisit only if `status=active` total becomes > 0 and volume grows by orders of magnitude.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://guessmarket.com/en/markets/` | HTTP 200 (WordPress site, AIOSEO; title "Prediction Markets You Create") | H |
| `GET https://guessmarket.com/wp-json/guessmarket/v1/networks` | 200, 5 networks, factory/oracle/fee_manager addresses | H |
| `GET .../markets?status=active&per_page=5` | 200, `{"markets":[],"total":0,"pages":0,"page":1,"chain":"all"}` | H |
| `GET .../markets?status=all&per_page=100` | 200, total 19, pages 1; all `status:"resolved"` | H |
| Newest `createdAt` | 1781293207 = 2026-06-12; max `endTime` 1784505600 = 2026-07-20 | H |
| First market created | 2026-01-12 (so ~5 months of activity, then nothing) | H |
| Vendor MCP `guessmarket-mcp` (npm) | published 2026-02-13, last version 1.2.0 on 2026-02-14; GitHub repo `hifriendbot/guessmarket-mcp` pushed 2026-03-14, 0 stars | H |

still_live = **true for the website/API, false in the sense that matters (no open markets).** I set `still_live` to false in the structured result because there is no tradable market.

---

## 2. Kind and market model

- Kind: on-chain, user-created binary (YES/NO) prediction markets, one contract per market, deployed by a per-chain factory (H: networks.json `market_factory`; M for per-market-contract inference from `address` field per market and `build_create_market_tx` in MCP README).
- Mechanism: constant product AMM: k = YESreserve x NOreserve; Pyes = NOreserve / (YESreserve + NOreserve); Pno = YESreserve / (YESreserve + NOreserve). Payout = your winning units / total winning units x pool. (H, https://guessmarket.com/how-it-works/ via WebFetch summary; consistent with API `yesShares`/`noShares`/`yesPrice`/`noPrice` fields.) No order book. LP tokens exist (add/remove liquidity).
- Outcomes: YES, NO, INVALID (INVALID -> proportional refund). Outcome shares are held as balances inside the market contract (`get_position` returns YES shares, NO shares, LP tokens per wallet), not as ERC-20/ERC-1155 tokens that could be transferred (M, from MCP README; ABI not read).
- Categorical/scalar: not offered. `is_race` flag appears in API (meaning NOT FOUND; at least one market with it is a head-to-head football game).

## 3. Chains and collateral (H, networks.json + README)

| Chain | chain_id | Collateral | Decimals |
|---|---|---|---|
| Ethereum | 1 | USDC | 6 |
| Base | 8453 | USDC | 6 |
| Polygon | 137 | USDC | 6 |
| BNB Smart Chain | 56 | USDT | 18 |
| PulseChain | 369 | USDC (PulseChain-bridged address in networks.json) | 6 |

Contract addresses per chain (factory, fee_manager, oracle, stablecoin) are in the fixture `networks.json`. Markets are isolated per chain; the same question on two chains has separate pools. The `chain_id` query param on `/markets` appeared to be ignored in my tests (each call returned the same first market); filter client-side on `chain_id` (M, only 19 rows so low confidence).

## 4. Read API

- Official? The REST namespace is the venue's own WordPress REST API (`wp-json/guessmarket/v1`), documented only via the vendor's MCP repo README/source; there is NO standalone developer docs site (NOT FOUND: searched guessmarket.com, noobs-guide, how-it-works, WebSearch). Status: **unofficially-documented public API from the official vendor** (treat as official-public, undocumented).
- NOTE: README in the repo says default base `https://guessmarket.com/api/guessmarket/v1` which returns a 404 HTML page (H, tested). The repo's `src/networks.ts` uses `https://guessmarket.com/wp-json/guessmarket/v1`, which works (H). The README is stale/wrong.
- Base URL: `https://guessmarket.com/wp-json/guessmarket/v1` (H). Namespace listing at `/wp-json/` shows `guessmarket/v1` (H).
- Endpoints (H unless noted; shapes confirmed in fixtures):
  - `GET /networks` -> `{networks:[{key,name,chain_id,explorer,native_token,stablecoin_symbol,stablecoin_decimals,contracts:{market_factory,fee_manager,oracle,stablecoin}}],count}`
  - `GET /markets?status=active|resolved|all&page=&per_page=(max 100)&chain_id=` -> `{markets:[{address,question,endTime,resolved,outcome,yesShares,noShares,liquidityPool,totalVolume,createdAt,creator,yesPrice,noPrice,volumeFormatted,liquidityFormatted,is_race,network,chain_id,network_name,status}],total,pages,page,chain}`. Prices are integer percents (54 = 54c); volumes are raw collateral units (6 or 18 decimals). `outcome` codes: 1 and 2 observed on resolved markets; mapping to YES/NO NOT FOUND (not verified against any real-world result).
  - `GET /market/{address}` -> same plus `lpPrincipal,totalLpTokens,purchasedYesShares,purchasedNoShares,traderPool,cache_time,from_cache`
  - `GET /markets/{address}/history?chain_id=&limit=(max 5000)` -> `{address,chain_id,history:[{timestamp(ms),yesPrice(float %),noPrice,eventType(buy|sell|liquidity_add|liquidity_remove),blockNumber}],count}` (H, fixture)
  - `GET /portfolio/{wallet}?limit=(max 100)&offset=` (M: from MCP source, not called)
  - `GET /abis/{contract}` (M: from MCP source, not called)
- No order book, no per-trade tape beyond the history events, no websocket (NOT FOUND: no mention in README, source or site).
- Auth: none (H). Rate limits: none documented, no `X-RateLimit-*` headers seen (H for headers of one response). WordPress stack; responses include `from_cache`/`cache_time` (server-side cache).
- On-chain alternative: per-market contract reads via public RPC (MCP reads balances/positions/allowance this way; M).

## 5. Trade path

- No off-chain signed orders. Trading = direct EVM transactions to the market contract: `approve` stablecoin then `buyShares(uint8 outcome, uint256 amount, uint256 minShares)`; sell with `min_usdc` slippage; add/remove liquidity; claim winnings (M: from MCP README, function name `buyShares(uint8,uint256,uint256)` shown in README sample output).
- The vendor MCP (`guessmarket-mcp@1.2.0`) returns **unsigned transaction objects** `{to,data,chainId,value}` which the agent signs itself (H README; code not executed).
- PayBox reachability: **yes in principle** for any chain where PayBox has an EVM wallet (Base, Ethereum, Polygon, BNB; PulseChain probably not supported by PayBox, M). A PayBox transaction-proposal flow (approve + buyShares calldata) would work with no venue account or signature scheme. Moot while there are zero live markets.
- Market creation costs a $10 stablecoin fee (H, how-it-works), so a bot could create its own markets; not relevant to arbitrage.

## 6. Fees (H, https://guessmarket.com/en/noobs-guide/ and /how-it-works/)

- 2% on buys and 2% on sells; split 75% to LPs / 25% to platform (paid by the trader; deducted in the AMM trade).
- $10 stablecoin to create a market. Add/remove liquidity and claims free. Gas separate.
- Effective round-trip cost 4% plus AMM price impact: very costly for arbitrage, and shallow pools (<$100) make impact dominant.

## 7. Resolution and dispute risk

- "Authorized oracles" resolve after the end date: YES / NO / INVALID. Oracle identities and selection not documented (H: how-it-works). The noobs-guide says "the market creator or oracle will resolve the market" - so creator-resolved markets are possible (H).
- "For disputed resolutions, there is an appeal process" - no details (H). Resolution "cannot be changed once finalized"; admin changes have a 7-day wait (H).
- Risk: HIGH (centralised/subjective, unnamed oracle, operator-created markets, INVALID outcome with proportional refund breaks hedge parity vs other venues).
- Audit: claims "reviewed by professionals", no firm/report cited (H, unverified). Bug bounty $50 to $5,000+.

## 8. Geo / ToS / automation

- "Works globally"; no geo-restriction stated (H, noobs-guide). Terms of Use and Disclaimer pages exist but were not read (NOT FOUND: contents). robots.txt allows all agents including AI crawlers (H). The vendor itself ships an AI-agent MCP and an `/ai-agents/` page (301 redirect, not read), so automation is welcomed (M).

## 9. Liquidity (H, API 2026-10-19)

- Lifetime volume $593 across 19 markets; largest single market $385 (CFP national championship, Base) with $87.64 LP pool at resolution; second $133 (PulseChain). Active TVL/OI: **$0**.
- Per-market pools at the high end were under $100.

## 10. Event overlap

- Past topics: US college football title game, Super Bowl LX, Winter Olympics medals, BTC > $100k, BNB > $1000, POL > $1, PLS ATH, a Richard Heart "ProveX" question (H, API). Sports/crypto-price questions overlap with Polymarket/Kalshi/Limitless in principle, but nothing is open now, and the shallow AMM plus 4% round-trip fees makes any edge unharvestable.
- Shared liquidity: none known; independent AMM pools per market (M). Not a mirror of another venue.

## 11. Suspicious content

- None found aimed at agents. The vendor README tells agents to run `npx -y guessmarket-mcp`; I did NOT install or run it. Noted that README base URL is wrong vs. source.

## 12. Open questions

- Whether new markets will appear (monitor `markets?status=active` total).
- Meaning of `outcome` codes and `is_race`.
- Whether PayBox supports PulseChain.
- Contents of Terms of Use / Disclaimer.
- Whether `chain_id` filter on `/markets` works when more rows exist.

## Sources

- https://guessmarket.com/en/markets/ (HTTP 200, H)
- https://guessmarket.com/en/noobs-guide/ (H, via WebFetch summary)
- https://guessmarket.com/how-it-works/ (H, via WebFetch summary)
- https://guessmarket.com/wp-json/guessmarket/v1/networks, /markets, /market/{addr}, /markets/{addr}/history (H, fetched 2026-10-19)
- https://guessmarket.com/robots.txt (H)
- https://registry.npmjs.org/guessmarket-mcp (H: versions published 2026-02-13 to 2026-02-14)
- https://github.com/hifriendbot/guessmarket-mcp (README.md, src/index.ts, src/networks.ts read via gh api; repo pushed 2026-03-14) (H for file content; vendor-written, untrusted)
- WebSearch results (M): mcpservers.org and pulsemcp listings for the MCP server; unrelated student repos named GuessMarket on GitHub were ignored.
