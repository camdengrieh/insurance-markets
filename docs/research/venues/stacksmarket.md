# StacksMarket (stacksmarket.app, Stacks / STX) - adapter spec

Researched 2026-10-19 (~04:40 UTC). READ-ONLY: unauthenticated GETs to `api.stacksmarket.app`, `www.stacksmarket.app`, `api.hiro.so`, CoinGecko, DeFiLlama; `gh api` file reads; one read-only PayBox `discover_tokens` (chains) call. No account, key, wallet, signature, POST/PUT/DELETE (I deliberately did NOT use Hiro's POST `call-read` even though it is a read). No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale (>6 months).
Third-party text (market descriptions, README) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/stacksmarket/` (4 files, all < 4 KB).

## 0. Verdict

**adapter_priority: skip** (revisit only if the venue resumes creating markets AND the project adds Stacks support).

1. **Site up, venue dormant (H).** Last on-chain activity of any kind on the production contract: `redeem` 2026-09-14 22:18Z (35 days before today). Last user trade 2026-09-10 04:49Z; last `create-market` 2026-09-09 05:20Z. All 195 markets in the public API are resolved; zero open markets.
2. **Tiny.** Lifetime volume 148,293 STX (~$55K at $0.372/STX) across 195 markets / 1,750 trades in ~6 months; the contract holds 1,252 STX (~$466) today. Not on DeFiLlama.
3. **Centralised and admin-gated.** Only the admin key can create, resolve, pause markets and withdraw surplus. The admin is also the market maker.
4. **Chain not reachable from PayBox.** Stacks/STX is not in PayBox's chain catalog (0 hits), and a Stacks tx needs secp256k1 + Stacks tx serialisation, not an EVM/Solana signature.
5. Independent liquidity (not a mirror), and the read API is genuinely public and keyless, but with no live markets and ~$0 depth there is nothing to arbitrage.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://www.stacksmarket.app/` | HTTP 200 (S3 + CloudFront SPA, `last-modified` 2026-08-18); apex 301 -> www | H |
| `https://api.stacksmarket.app/health` | `ok`, HTTP 200 | H |
| Hiro `/extended/v1/address/SP3N5CN0PE7YRRP29X7K9XG22BT861BRS5BN8HFFA.market-factory-v20-bias/transactions` | total 3,564 txs; newest = `redeem` 2026-09-14T22:18:40Z; before that `withdraw-surplus`/`resolve` 2026-09-14T14-15Z; newest buy/sell 2026-09-10T04:49Z (`sell-no-auto`); newest `create-market` 2026-09-09T05:20Z. Fixture `hiro_contract_latest_txs.json` | H |
| Deployer address newest tx | 2026-09-14T15:02Z, all v20 calls; no newer contract deployed from it | H |
| `GET /api/polls?limit=200` | 195 polls, created 2026-03-09 .. 2026-09-09, endDate max 2026-09-13, updatedAt max 2026-09-14; **195/195 `isResolved: true`** (15 still carry `isActive: true` but are resolved). `/api/polls/trending` returns `[]` | H |
| Prior cadence | market-creation bursts roughly weekly (Aug 18, Aug 27, Sep 1, Sep 9) then nothing for 5+ weeks | H |
| GitHub `luisvilaclaras/StacksMarket` | created 2026-04-02, last push 2026-08-18, 1 star, no license; individual's account. Homepage `stacksmarket.app` | H |

Conclusion: reachable but effectively paused since mid-September 2026. Could be a seasonal/sports-driven pause (many markets were FIFA World Cup 2026 matches, which ended 2026-07-19), but I found no announcement; cause NOT FOUND.

## 2. What it is

- **Kind**: onchain-other (Stacks, Bitcoin L2). Operator: an individual/small team (GitHub user `luisvilaclaras`; AWS-hosted backend, MongoDB). Name/entity of operator NOT FOUND (Terms page names none).
- **Market model (H, contract source + README)**: binary YES/NO only on mainnet. **LMSR AMM** (automated market maker with a virtual-liquidity "bias"): `pYes = 1/(1+exp((qNo+rNo-qYes-rYes)/b))`, `b = initial_liquidity / ln 2`. 1 share pays exactly 1 STX if it wins (`UNIT = 1_000_000 uSTX`). Shares are whole-integer counts.
- **Tokenisation (H)**: NOT tokens. The v20 contract has no fungible/NFT definitions; positions are rows in internal maps (`yes-holdings`, `no-holdings`, keyed by market id + principal). No SIP-010 share tokens, so positions cannot be moved, wrapped or traded elsewhere.
- **Scalar/ladder**: README describes "ladder" groups (N independent binary rungs with thresholds) and a categorical v23 contract; the repo only has these as testnet (`v21-testnet`, `v23-testnet`); Hiro 404s for v21/v23 on the mainnet deployer. The frontend bundle only references `market-factory-v20-bias` (6 hits). The live API has no `/api/ladder` route (404). Treat mainnet as binary-only (H).
- **Market ids**: unix-ms timestamps (e.g. `1788301227616`), not sequential.
- **Collateral / chain (H)**: native **STX** on Stacks mainnet (no stablecoin, no sBTC in v20). Contract `SP3N5CN0PE7YRRP29X7K9XG22BT861BRS5BN8HFFA.market-factory-v20-bias`. Collateral is a volatile asset: any cross-venue hedge carries STX/USD risk (STX ~ $0.372 on 2026-10-19 per CoinGecko, M).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official API docs | NOT FOUND (searched: README API Reference section, site `/docs`, `/api`, `llms.txt` (SPA fallback HTML), `robots.txt` (allow all), `sitemap.xml` (SPA fallback), repo tree). The README "API Reference" is the closest, and it is the app's internal backend, not a published public API | H |
| REST `https://api.stacksmarket.app` | **Public, no auth for reads**; CORS restricted to `https://www.stacksmarket.app` (irrelevant for server-side). Rate limit header `ratelimit-policy: 2500;w=300` (2,500 req / 5 min per client) | H |
| WebSocket | Socket.io rooms `poll-{pollId}` for `trade-updated` (README); not tested | M |
| Chain reads | Hiro `https://api.hiro.so` (public; 20 req/s, 50 req/min without key per response headers) | H |

**Confirmed endpoints (unauthenticated GET, 2026-10-19)**:
- `GET /api/polls?limit=N&page=P` -> `{polls:[...], pagination:{currentPage,totalPages,total,hasNext,hasPrev}}`. `limit=200` returned all 195 in ~500 KB. A `status` query param appears to be ignored (returned same ordering). Fixture `polls_sample.json`. Poll fields: `_id` (Mongo id), `marketId` (on-chain id string), `title`, `description` (resolution rules, free text), `category` (Sports/Crypto/Economy/Politics), `options[2]` = Yes/No with `percentage`/`impliedProbability` (integer %), `endDate`, `isResolved`, `winningOption` (0=YES, 1=NO), `isPaused`, `totalVolume` (**uSTX**), `totalTrades`, `uniqueTraders`, `createTxId`.
- `GET /api/polls/:_id` (Mongo `_id`; passing the on-chain `marketId` gives 500) -> `{poll:{...}}`.
- `GET /api/trades/poll/:_id` -> `{trades:[...], pagination}`. Fixture `trades_sample.json`. Fields include `type`, `optionIndex`, `amount` (shares), `price` (0-1; `priceReliable:false` when `priceSource:"frontend_quote"`), `totalValue`/`satsTotal` (uSTX), `satsUser` (pre-fee), `feeProtocol`, `feeLP`, `transactionHash`. **Privacy note**: the raw response also exposes each trader's wallet address, IP address and user-agent; I redacted these in the fixture and the adapter should discard them.
- `GET /api/trades/orderbook/:_id/:optionIndex` -> `{"buyOrders":[],"sellOrders":[]}` (always empty: AMM, no book).
- `GET /api/market/status` -> `{"paused":false,"lastTx":null}`; `GET /health` -> `ok`.
- Documented in README but 404 on prod: `/api/ladder/*`, `/api/stacks/call-read`.
- Precision caveat: `percentage` is an integer, so API prices are 1% granular. For exact prices read the chain (below).

**On-chain read (authoritative, H)**: contract interface via Hiro `GET /v2/contracts/interface/{addr}/market-factory-v20-bias`. Read-only functions: `get-market-snapshot(m)` (b, qYes, qNo, rYes, rNo, paused, closeTime), `quote-buy-yes/no(m, amount)`, `quote-buy-yes/no-by-sats(m, budget)`, `quote-sell-yes/no(m, amount)`, `get-outcome(m)`, `get-status(m)`, `get-pool(m)`, `is-trading-open-now(m)`, `get-fee-params()`, `get-user-claimable(m, who)`. Calling them requires Hiro `POST /v2/contracts/call-read/...` (I did not call it; POST). Prices are computed from the snapshot with the LMSR formula above, or via `quote-*` for exact all-in cost.

## 4. Trade path

- **Programmatic**: yes, via direct Stacks contract calls only. No order API, no signed-order scheme, no API keys. Public functions: `buy-yes-auto(m, amount, target-cap, max-cost)`, `buy-no-auto`, `sell-yes-auto(m, amount, min-proceeds)`, `sell-no-auto`, `redeem(m)` (H, contract interface + source). `target-cap` is ignored; `max-cost`/`min-proceeds` are the slippage bounds. STX is moved inside the call (single transfer user -> contract, fees paid out by the contract).
- **Signing**: a Stacks secp256k1 transaction signed by a Stacks principal (Leather/Xverse in the UI). The backend never submits transactions (README).
- **Reachable through PayBox?** **No (H/M).** PayBox's chain catalog search for "stacks" returned 0 chains (`discover_tokens` mode=chains, 2026-10-19). EVM wallets (Base/Ethereum/BNB/Arbitrum/Polygon) and Solana cannot sign Stacks contract calls; no known EVM-to-STX bridge flow fits a proposal-style trade. A dedicated Stacks key outside PayBox would be needed (out of scope).
- **Simplification worth noting for a hypothetical adapter**: there is no off-chain matching, so quotes are deterministic from chain state and execution is atomic with slippage bounds; there is no front-running protection beyond `max-cost`.

## 5. Fees (H, on-chain)

- Verified on tx `0x0b13af22...da43` (2026-09-06, `buy-yes-auto`, 37 shares): user paid 26,000,000 uSTX = **25,000,000 base + 750,000 protocol (3%) + 250,000 LP (1%)**; protocol fee split 67/33 into two wallets (502,500 + 247,500). Fixture `hiro_buy_tx_transfers.json`. Same 4% on a second trade (42,000,000 base -> 43,680,000).
- Formula (contract source): `fee = ceil(base * bps / 10000)` for both protocol and LP, paid by the trader on top of the LMSR cost for buys (and deducted from proceeds on sells; sample sell: 25.0M base -> 24.0M proceeds). **~4% each way (~8% round trip)**, plus Stacks network fee (3,000 uSTX in the sample).
- Fee params are admin-mutable (`set-fees`, `set-fee-recipients`) unless `lock-fees-config` was called; whether it was locked: NOT FOUND (needs a `call-read`). All fee wallets default to the admin.
- 4% each way is far above Polymarket/Kalshi taker costs, so a cross-venue arb needs a >8% mispricing before STX price risk.

## 6. Resolution and dispute risk

- **Admin-only (H)**: `resolve(m, "YES"|"NO")` requires `tx-sender == ADMIN` (single hard-coded principal). No oracle, no challenge window, no dispute process, no timelock. Irreversible once called (README + source). `resolve` only checks pool solvency.
- Rules are free text in the market `description`, sources named: Binance spot candle, TradingView (`TVC:USOIL`, gold, S&P), FIFA/league official results, UFC/ESPN. Boilerplate `rules` field = "Standard prediction market rules apply."
- Admin controls: pause/unpause per market, `set-max-trade`, `set-market-bias` (initial odds, before first trade), `set-market-close-time`, `withdraw-surplus` (admin takes whatever is left after reserving winners' payouts, i.e. the admin is the LP/counterparty).
- Risk: centralised counterparty + single key; contract has no upgrade path; operator can stop at any time (Terms s.6). Resolution timing is manual: hours to days after the event (resolve txs on 2026-09-14 for events ending 2026-09-06 to 09-13).

## 7. Geo / ToS / automation (H, Terms page `Terms.js` in repo, "Last updated February 18, 2026")

- No geo-blocking language; "You are responsible for ensuring that your use ... is legal in your jurisdiction." Sanctions clause in Prohibited Conduct.
- Automation: "Using bots/scripts in ways that harm platform integrity or availability" is prohibited; read-only polling within the rate limit is not obviously prohibited (M). No API terms exist.
- Operator can suspend/discontinue at any time.

## 8. Liquidity (all as of 2026-10-19)

| Metric | Value | Source | Tag |
|---|---|---|---|
| Lifetime volume | 148,293 STX (sum of `totalVolume`, uSTX 148,293,120,000), 1,750 trades, 195 markets | `/api/polls?limit=200` | H |
| USD equivalent | ~$55K at $0.372/STX (volume was transacted at lower STX prices, e.g. $0.14-0.26 in Aug-Sep, so true USD is probably lower) | CoinGecko 2026-10-19 | M |
| Typical market | 20-4,500 STX ($7-1,700); top market 4,500 STX | polls | H |
| Contract STX balance (TVL) | 1,252 STX (~$466) | Hiro `/extended/v1/address/{contract}/stx` | H |
| Cumulative contract inflow / outflow | 204,017 STX in / 202,765 STX out | same | H |
| Open markets | 0 | polls | H |
| DeFiLlama | not listed (no match in `/protocols`) | api.llama.fi | H |

## 9. Event coverage (overlap for arbitrage)

Categories in the 195 markets: Sports 110 (FIFA World Cup 2026 matches, EPL, F1, MotoGP, UFC, NBA, rugby), Crypto 37 (mostly STX price/rank and PEPE-vs-X, Zest metrics), Economy 27 (WTI/gold/S&P 500 "close between X and Y" daily brackets), Politics 21 (mislabelled; mostly World Cup football). Overlap with Polymarket/Kalshi exists in principle for football match outcomes, F1/UFC fights and commodity brackets, but the market definitions are bespoke (e.g. "Spain beat Belgium by 2+ goals", "STX above $0.26 on Binance at 12:00 UTC") so mapping to other venues' contracts would be fuzzy. With zero open markets, current overlap = none.

## 10. Shared liquidity

Independent. Own contract, own LMSR pool funded by the admin, no routing to or mirroring of another venue found (H). Independence is moot given the lack of depth.

## 11. Open questions

- Why activity stopped after 2026-09-14 (seasonal, abandoned, or pending a v21+ mainnet migration)? NOT FOUND.
- Current `get-fee-params` and whether `lock-fees-config` was called (needs POST `call-read`).
- Initial liquidity (`b`) per market; derivable from `create-market` args if ever needed.
- Operator identity / legal entity: NOT FOUND (searched: Terms, Privacy page name only, repo, site metadata).
- Whether a v21+ mainnet contract is planned (repo has `market-factory-v21-bias.clar` but not deployed under the deployer; M).

## 12. Suspicious content

- None aimed at AI agents found in any fetched page, README or API payload.
- Data-leak note: public `/api/trades/poll/:id` returns trader IP addresses and user-agent strings (third-party PII). Not copied into fixtures.
- README states a CORS restriction to the frontend origin; server-side calls are unaffected (no evidence of bypass attempts, none made).

## Sources

1. https://www.stacksmarket.app/ and https://www.stacksmarket.app/static/js/main.293e0ac7.js (H: HTML, contract id and API host references)
2. https://api.stacksmarket.app/health, `/api/polls`, `/api/polls/:id`, `/api/trades/poll/:id`, `/api/trades/orderbook/:id/0`, `/api/market/status` (H, unauthenticated GET, 2026-10-19)
3. https://github.com/luisvilaclaras/StacksMarket (README.md, `StacksMarket_web/client/src/pages/Terms.js`, `FAQ.js`, contract file list, commits) (H)
4. https://api.hiro.so/extended/v1/address/SP3N5CN0PE7YRRP29X7K9XG22BT861BRS5BN8HFFA.market-factory-v20-bias/transactions, `/extended/v1/tx/0x0b13af22828ba909a91b2e9cdef635523f84d1367bf89fdedd402661de42da43`, `/extended/v1/address/{contract}/stx`, `/v2/contracts/source/...`, `/v2/contracts/interface/...` (H)
5. https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd (M, STX price 2026-10-19)
6. https://api.llama.fi/protocols (H: no StacksMarket entry)
7. PayBox `discover_tokens` mode=chains query "stacks" -> 0 results (H)
