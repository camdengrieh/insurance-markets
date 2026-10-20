# Robinhood Stock Parimutuel Market - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` file reads of the public repo, unauthenticated GETs of the project's Vercel site and one of its own `/api` routes, WebFetch of Robinhood Chain docs. No account, wallet, key, signature, POST/PUT/DELETE, or PayBox tool was used. The public JSON-RPC (POST-only) and the Blockscout API (Cloudflare 403) were NOT used, so no live on-chain numbers were read this session. WebSearch budget was exhausted before the first query; there was no discovery search pass.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.

Fixtures (<= 50 KB): `docs/research/fixtures/robinhood-stock-parimutuel-market/` (`agent-status.json`, `homepage.html`, `StockPredictionMarketV2.sol`).

---

## 0. Bottom line

- **Adapter priority: skip.** It is a one-developer hobby/hackathon contract (not affiliated with Robinhood the broker), thin to the point of near-zero liquidity, no market-data API, no tokenised positions, no way to exit or trade before settlement, and owner-controlled settlement. Nothing here can be a tradable arbitrage leg.
- **Live: partially (H/M).** The site returns HTTP 200 on 2026-10-19 and the repo's last push is 2026-09-22; Robinhood Chain mainnet itself is live. Whether any market is currently OPEN, or any bet placed since 2026-09-08, is NOT verified.
- **Only possible value: signal-only**, and a very weak one: pool ratio BULL/BEAR for five US stocks over owner-chosen windows, from a handful of bettors.

## 1. Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| Name | "Robinhood Stock Prediction Market" (site `<title>`); repo `pplmaverick/robinhood-stock-prediction-market`, MIT, 0 stars, created 2026-06-10, last push 2026-09-22T14:29:36Z, not archived | H [GitHub API](https://api.github.com/repos/pplmaverick/robinhood-stock-prediction-market) |
| Site | `https://robinhood-stock-market.vercel.app` returns 200 (React/Vite SPA shell, 1430-byte HTML; data is rendered client-side from the chain). README's "Live Demo" `frontend-tau-azure-50.vercel.app` 307-redirects to it | H (curl 2026-10-19) |
| Affiliation | Third-party individual project built on Robinhood Chain; the name borrows the chain brand. No evidence of any Robinhood the company involvement. README frames it as hackathon "Continuity Track" work (World AgentKit) | H README / M on non-affiliation |
| Chain | Robinhood Chain mainnet "is live"; chain ID 4663; native ETH; Arbitrum-based L2 framework; public RPC `https://rpc.mainnet.chain.robinhood.com` (rate-limited, not recommended for production); explorer `robinhoodchain.blockscout.com` | H [docs.robinhood.com/chain](https://docs.robinhood.com/chain/), [connecting](https://docs.robinhood.com/chain/connecting/) |
| Mainnet launch | 2026-07-01 per the repo README (not independently confirmed; the docs page I fetched gives no date) | M |
| First deploy | 2026-07-03 per README | M |
| Current contract | `StockPredictionMarketV2` ("V3 fix") at `0x06897Ce6A2492BE99B59a7c023A64A6C0Af37849`, deployed 2026-09-22. Earlier contracts (`0x59DF...759C`, `0x72DA...4245`, AgentStockMarket) are deprecated | H README; matches `MARKET_ADDRESS` in `frontend/src/constants.js` |
| Site health signal | `GET /api/agent-status` (2026-10-19) returned `marketId:"0"` and `decision.status:"query_failed" ... "graph-node request failed: This operation was aborted"`: its self-hosted graph-node (a raw-IP VPS) is not answering. Suggests the backend is neglected | H (fixture) / M on interpretation |

## 2. Kind and market model

- **Kind:** parimutuel-p2p, binary, on-chain, up/down on a stock price. No order book, no AMM. [H, contract source]
- **Question per market:** "Will the Chainlink price at `closeTime` be strictly above the price snapshotted at `createMarket`?" BULL = up, BEAR = down. `openPrice` is read inside `createMarket()` (since the 2026-09-22 fix); `lockMarket()` only changes state. [H, `StockPredictionMarketV2.sol`]
- **Markets are created only by `owner`** (`createMarket(stockToken, priceFeed, symbol, duration)`), duration chosen by owner. Five symbols: TSLA, AMZN, PLTR, AMD, NVDA. The `stockToken` field is only a label; the stock token is never held or transferred. [H]
- **Outcome tokenisation: none.** A position is a row in `bets[marketId][address]` = `{amount, direction, claimed}`. Not an ERC-20/1155, not transferable, not sellable. One bet per address per market, cannot top up or switch side. [H]
- **States:** OPEN -> LOCKED -> SETTLED, or REFUND. REFUND when `closePrice == openPrice` or when the price-implied winning side's pool is empty (everyone reclaims exact stake, no fee). [H]
- **Implied odds:** only `bullPool` / `bearPool` totals; the final payout multiple is unknown until close, and moves as others bet. There is no price a taker can lock in.

## 3. Chains and collateral

- Robinhood Chain mainnet (4663), collateral is **native ETH** (`placeBet` is `payable`, `MIN_BET = 0.001 ether`). No stablecoin. [H]
- Testnet 46630 legacy contract exists; ignore. [H README]
- Settlement oracle: Chainlink Data Feeds proxies on Robinhood Chain (TSLA/USD `0x4A11...5C38`, etc., listed in README) wrapped by project `ChainlinkPriceFeed` contracts. [H README]

## 4. Read API

Classification: **onchain-or-subgraph-only.** No documented public REST/WebSocket API for market data.

| Surface | Detail | Tag |
|---|---|---|
| Contract views (via any RPC `eth_call`) | `marketCount()`, `markets(uint256)` -> (stockToken, priceFeed, symbol, roundId, openTime, closeTime, openPrice, closePrice, bullPool, bearPool, state, winner), `bets(uint256,address)` -> (amount, direction, claimed), `MIN_BET()`, `FEE_BPS()`, `accumulatedFees()`, `owner()` | H source |
| Events | `MarketCreated`, `BetPlaced(marketId, bettor, direction, amount, isAgentBet)`, `MarketLocked`, `MarketSettled`, `MarketRefunded`, `WinningsClaimed`, `FeesWithdrawn` | H source |
| RPC | `https://rpc.mainnet.chain.robinhood.com` public, rate-limited; repo notes `429` under bursts and `-32000 log query timed out` on huge `eth_getLogs` ranges (use 10-20M block windows); production recommendation is Alchemy with own key. JSON-RPC is POST, so I did not call it | H docs / H repo `docs/spec.md` |
| Project subgraph | Self-hosted graph-node at a raw IP, HTTP, nginx Basic Auth. Private, not a public API. Its schema is also about Chainlink price windows, not bets | H `decision-engine/src/config.js`, `graph-client.js` |
| Project web API | `GET https://robinhood-stock-market.vercel.app/api/agent-status` (no auth) returns decision-engine status for TSLA and an AgentBook flag, NOT market lists, pools or trades. `/api/rpc-proxy` is a POST proxy to the Robinhood RPC (not used) | H (fixture `agent-status.json`) |
| Blockscout | `robinhoodchain.blockscout.com/api/v2/...` answered 403 / Cloudflare challenge to curl and WebFetch; could not be used. It is the natural route for historical txs and logs if a scripted client can pass it | H (blocked) |
| WebSocket | none; use `eth_subscribe` logs on the chain's RPC if wanted | M |
| Auth / limits | none for the site; RPC limits undocumented beyond "rate-limited" | H docs |

Fixtures saved: `agent-status.json` (374 B, real response shape; contains the project agent's public address and a failed graph-node call), `homepage.html` (SPA shell proving liveness), `StockPredictionMarketV2.sol` (8.7 KB verbatim source, which is the authoritative "schema"). No market-data JSON fixture exists because there is no market-data HTTP endpoint.

## 5. Trade path

- Anyone can call `placeBet(marketId, direction)` with ETH value from an EOA; no signature scheme, no off-chain order. [H source]
- `placeAgentBet(Attestation, v, r, s)` is an alternative path gated by a trusted relayer attestation (World AgentKit/AgentBook human-backing). The author states the live agent wallet reads "unbacked" so it cannot currently work end to end. Irrelevant for us. [H README]
- `claimWinnings(marketId)` pays with Solidity `transfer` (2300 gas stipend). A smart-contract wallet whose receive hook needs more gas (e.g. many smart accounts/Safes) may be unable to claim and would lock its payout; an EOA is fine. [H source / M on wallet impact]
- No cancel, no early exit, no add. Capital is locked until the owner locks and settles.

**PayBox reachable: partial.** PayBox's chain catalog lists "Robinhood (4663)" (H, recorded same day in `docs/research/06-paybox-platform.md` line 113, from `discover_tokens`); its notice says the catalog is "not a support allowlist", and the 4663 transaction-proposal path has not been tested. In principle a PayBox EVM wallet could propose a contract call to `0x0689...7849` with ETH value on chain 4663; gas is ETH on 4663 (PayBox `get_buy_link` can fund Robinhood per the same note). The contract has no Base/Ethereum/BNB/Arbitrum/Polygon/Solana presence. [M]

## 6. Fees

- 2% of the total pool (`FEE_BPS = 200`), paid by winners out of the pot: `payout = (bull + bear) * (1 - 0.02) * stake / winningPool`. Computed per claim with integer truncation; `accumulatedFees` accrues as winners claim. REFUND: no fee. No other protocol fees; user pays gas in ETH. [H source]
- Note the README text "Chainlink staleness check: 3-day threshold" and "no winner scenario" is stale; the V3 contract uses 4 hours. [H source vs README]

## 7. Resolution and dispute risk

- Resolution is by `owner` only: `lockMarket` (after `closeTime`) then `settleMarket`, which reads Chainlink `latestRoundData()` at the time of the call, not at `closeTime`. The owner chooses when to settle (no deadline, no keeper requirement, no permissionless settle), so the settlement price can be picked among whatever fresh rounds exist after close. [H source]
- Freshness: `answer > 0`, `answeredInRound >= roundId`, and `updatedAt` within 4 hours. Per the code comment the feeds update every 2-4 hours. So `createMarket` and `settleMarket` can revert when a stock feed is quiet, e.g. weekends/holidays (my inference), leaving markets stuck LOCKED. [H source / M inference]
- No dispute process, no timeout refund, no emergency withdraw: if the owner key is lost or the owner stops, all open pools are locked forever. `owner` is a single EOA. [H source]
- Historical data quirks documented by the author: genesis-era Chainlink rounds were scaled at 18 decimals (222 anomalous rounds, last on 2026-06-23); the contract has no decimals normalisation but no settlement touched those rounds. Before the 2026-09-22 fix, all settlements resolved by "tie defaults to BULL" (27 of 27). Treat any pre-2026-09-22 outcome data as unreliable. [H README, `docs/spec.md`]
- Smart-contract risk: the author reports an independent review that found a fund-lock gap; fixes shipped 2026-09-22 and are only 4 weeks old. No third-party audit found. [H README / NOT FOUND (searched: README, docs list)]

## 8. Geo / ToS / automation

- No terms of service, geo-restriction, or automation policy found on the site, in the README, or in the Robinhood Chain docs pages fetched (NOT FOUND, searched: README, site shell, docs.robinhood.com/chain and /connecting). Contract is permissionless; any address may bet.
- Gambling/prediction regulation of an unlicensed on-chain parimutuel on tokenised US equities is a legal grey area (M). Robinhood Chain docs fetched say nothing on stock-token geo-eligibility; those pages are not about this app.

## 9. Liquidity

- Only dated figures are the author's own: as of 2026-09-08, across the contract history since 2026-07-03: 29 `createMarket`, 27 `lockMarket`, 27 `settleMarket`, **3 `placeBet`**, 2 `claimWinnings` (README, independently counted by the author). That is effectively zero organic liquidity; bets are minimum 0.001 ETH-scale. [H README, stale by 6 weeks]
- Current TVL / pool sizes: NOT FOUND (searched: README, site shell, `/api/agent-status`; Blockscout 403; RPC not called as it is POST). The site's `agent-status` shows `marketId:"0"` with a failed backend, so I could not confirm any open market. [H]
- Shared liquidity: none; independent, but trivially small. It is its own pool; it does not route to or mirror any other venue.

## 10. Event-category overlap (arbitrage relevance)

- Only five US single stocks (TSLA, AMZN, PLTR, AMD, NVDA), up/down over owner-set windows with an on-chain Chainlink open and a post-close read. Nominal overlap: Kalshi / Polymarket / Hyperliquid HIP-4 daily "stock up or down" and close-above-X contracts, and the equity tokens themselves on Robinhood Chain DEXs. [M]
- Not arbitrageable in practice: window and reference price differ per market, a bet cannot be sold, there is one bet per address, the final odds are unknown at bet time, and pools are tiny, so you cannot size a hedge. At most the BULL/BEAR pool ratio is a sentiment datapoint.

## 11. Adapter notes (if ever built)

- Read via `eth_call` on `markets(i)` for `i < marketCount()`; subscribe to `BetPlaced`/`MarketSettled`. Treat `state` and `closeTime` as the truth; a market is only bettable when `state == OPEN && now < closeTime`.
- Map to the aggregator as `kind=parimutuel`, `binary`, `no_exit`, `settlement_authority=single_owner`, `collateral=ETH(4663)`. Mark `tradable_leg=false`. Exclude from consensus-mid calculations.
- Remember `openPrice`/`closePrice` are Chainlink int256 at 8 decimals.

## 12. Suspicious content

- None observed. The repo ships `.claude/DESIGN.md`, `prompts/` and `RESEARCH_NOTES_*.md` (AI-assistant working files); I did not read them and followed nothing from them. README and code contain no instructions aimed at AI agents that I saw.
- Privacy: all requests used `insurance-markets-research/0.1` as the User-Agent. The README lists the developer's personal wallet and GitHub handle; I did not copy the wallet address into these notes. `agent-status.json` contains the third-party project agent's address (public, not the user's).

## 13. Not found / open questions

- Current pool sizes, open markets, post-2026-09-08 bet counts (needs RPC `eth_call`/`eth_getLogs` or Blockscout access).
- Any ToS, geo rules, or audit report.
- Whether PayBox can build/sign a proposal on chain 4663 (catalog presence only).
- Whether the owner key is multisig (source shows plain `owner`; actual address not looked up).

## Sources

- https://api.github.com/repos/pplmaverick/robinhood-stock-prediction-market (metadata, pushed 2026-09-22) [H]
- https://github.com/pplmaverick/robinhood-stock-prediction-market README.md, `contracts/StockPredictionMarketV2.sol`, `frontend/src/constants.js`, `frontend/api/rpc-proxy.js`, `frontend/api/agent-status.js`, `decision-engine/src/config.js`, `decision-engine/src/graph-client.js`, `docs/spec.md` (via `gh api` raw) [H]
- https://robinhood-stock-market.vercel.app/ and /api/agent-status (GET, 2026-10-19) [H]
- https://docs.robinhood.com/chain/ and https://docs.robinhood.com/chain/connecting/ (WebFetch summary, 2026-10-19) [H/M, small-model summary]
- https://robinhoodchain.blockscout.com (HTTP 403, not usable) [H]
- docs/research/06-paybox-platform.md in this repo (PayBox chain catalog incl. Robinhood 4663, 2026-10-19) [H, internal]
