# Precog Markets (core.precog.markets) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing, not that it does not exist.

**Verdict: P2 (thin, signal-only; bordering on skip).** Live, permissionless on-chain trading on Base, independent liquidity, and a working unauthenticated REST listing that already contains prices. But TVL is about $6.4K in total (about $1.7K of it USDC), only three real-USDC markets are open, each seeded with $400-$500, and about $50 of buying moves a price by 6+ points. Resolution is run by a Precog-whitelisted reporter, not permissionless. Worth a trivial read-only adapter only for the few markets that overlap big venues (Fed decision, AI leaderboard, Ballon d'Or). Do not build a trading leg.

## 1. Is it still live? (H)

- `GET https://core.precog.markets/status` returned `{"status":"ok","timestamp":"2026-10-19T00:12:02.461Z"}` (fixture `core_status_2026-10-19.json`).
- The market list contains markets whose `start_at` is as late as 2026-10-15; 18 are OPEN on Base; the launchpad has 415 historical proposals with market ids up to 857 (fixtures below). Market creation cadence: 18 markets started in 2026-09, 10 in 2026-10 (counted from the list).
- Terms of Use last updated 2026-09-14 (`https://core.precog.markets/terms`). `forecast-os` repo pushed 2026-10-09, CLI release 2.0.1 on 2026-09-29. `precog-markets/precog-dev` (contracts) last pushed 2026-07-10 (V8 deployed on Arbitrum in 2026-07).
- DefiLlama listed it 2025-12-26; TVL was updated 2026-10-18 (fixture `defillama_precog-markets_2026-10-19_trimmed.json`).
- So: "live but tiny and slowly shrinking in USD terms". Arbitrum is effectively dormant (section 3).

## 2. Kind and market model

- **Kind:** fully on-chain prediction market protocol using a **single-contract-per-market automated market maker** (LS-LMSR cost function). No order book, no matching engine. (H: repo `LS-LMSR.md`, `PrecogMarketV8.sol`; Terms s6.1 "Markets use an automated market maker".)
- **Market types:** categorical with N >= 2 outcomes (binary is just N=2); no scalar type, though scalar-like questions are bucketed into ranges (e.g. inflation, wheat yield, Fed bps brackets). Outcomes are 1-indexed on-chain (`outcome` 1..N), the API lists them as one comma-separated string. (H)
- **Pricing (H, code + repo doc):** `b(q) = alpha * sum(q_i)`, `alpha = overround / (n ln n)`; marginal prices sum to at least 1 and up to `1 + alpha n ln n`. Observed on the 18 open markets: `overround` 0.03-0.08, price sums 1.029-1.080 (USDC markets 1.033-1.051). So **buying every outcome costs more than 1**: there is no in-venue complete-set arbitrage, the vig is the overround.
- **Tokenisation (H, code):** shares are **internal accounting, not tokens**. `PrecogMarketV8` keeps `accounts[addr].balances[outcome]`; read with `getAccountOutcomeBalances(addr)`. Not transferable and not ERC20/1155. **Conflict:** `learn.precog.markets/markets/outcome-shares` says shares are "ERC-20 tokens held directly in your wallet"; the V8 source contradicts that (docs likely describe an older version). Trust the code (M that deployed bytecode matches the repo; I could not read chain state, see section 4).
- **Whole shares only:** `buy`/`sell` require `amount % 2^64 == 0` (64.64 fixed point). 1 winning share redeems for 1 collateral token, losers 0 (H code `_redeem`). Minimum trade = 1 share (current open-market buy prices run 0.08 to 0.64).
- **Virtual liquidity:** most current markets are seeded with `collateral_funding` = 10% of `initial_shares` (e.g. Fed market 400 funding for 4,000 initial shares). The LP only posts max loss. (H API fields; docs "Virtual liquidity" on `learn.precog.markets/launchpad/liquidity-provision`.)
- **Depth estimate (M, my own LS-LMSR reimplementation calibrated to the Fed market price, 4 outcomes, overround 0.04, 4,000 initial shares):** about $85 net has been bought; buying 50 more shares of the leading outcome costs about $34 (avg 0.686) and moves its marginal price 0.640 to 0.730; buying 100 shares of an untouched 13% outcome costs about $19 and pushes it to 0.26. My model gave 0.1303 for untouched outcomes vs 0.1311 in the API, so it is approximate.

## 3. Chains and collateral

| Chain | Contracts (H, repo README + `deployedContracts.ts`) | State |
|---|---|---|
| Base (8453) | PrecogMasterV8 `0x00000000000c109080dfa976923384b97165a57a`; market recipe `0x44769bE6853918e939281b2f669f9a58608Cb55B`; RealityOracleV3 `0xbb49B9c5B73b2eBAecee8272d2B8B3bEBe16F073`. Legacy V7 master `0x1eB90323aE74E5FBc3241c1D074cFd0b117d7e8E`, OracleV2 `0xd7bE03206daFa4552ab58CD3CFC191426404C77D` still back older (closed) markets | 109 markets listed, 18 OPEN, TVL $6,416 |
| Arbitrum (42161) | PrecogMasterV8 `0x0000000000990400E12543B7f400136e8672E2F0`; OracleV3 `0x87Ae8A07529363309a0eFcD2ce83c1a7f2B7ccB5` | 2 markets ever, both CLOSED (last ended 2026-07-02), TVL $0 |
| Ethereum | "coming soon" on learn site; no deployment found | n/a |

Collateral is per-market and must be on the master's `allowedCollaterals` whitelist. From the live Base list (H, fixture): MATE (18 dec, practice token, 58 markets, 4 open), **wARS** (wrapped Argentine peso style token `0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D`, 30 markets, 11 open), **USDC** (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 12 markets, 3 open), wBRL, BNKR, TALENT, KAITO, PRE, one sUSDS market. Arbitrum markets used Arb USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`. Only USDC/sUSDS markets are comparable to other venues' USD prices. MATE is documented as "a non-monetary practice token with no economic value" (H, learn Mate Markets). Master has admin `ownedTokenMint/Burn/Move` on "owned" collaterals (M that MATE/wARS are such tokens; DefiLlama methodology mentions "owned launchpad collateral"). Treat MATE and wARS markets as non-USD and exclude them from arbitrage.

## 4. Read API

**Documented surface does not match what is reachable.** Probes in fixture `access_probes_2026-10-19.json`.

| Host | Status 2026-10-19 | Notes |
|---|---|---|
| `https://core.precog.markets/api/v1/*` (documented in `openapi.json`, `llms.txt`, agent card, `docs` page) | **HTTP 307 to `/`** for plain GETs, even with `Accept: application/json`; trailing-slash form 308-loops back | Documented "public REST API ... proxied by core.precog.markets". Endpoints listed: `GET /api/v1/{markets?chain_id=, upcoming-markets, market-prices, market-trades, player-scores, referral-scores, sentiment-market-scores, accounts, actions/app-token}`. No query params documented beyond `chain_id`. (H that this is what they publish; H that it did not return data to me.) |
| `https://tracker.precog.markets/api/v1/` ("Tracker API", the stated backend) | **HTTP 403** `{"detail":"Authentication credentials were not provided."}` on root; `{"detail":"ERROR P400"}` on `markets/`, `market-trades/`, `market-prices/`, `upcoming-markets/`, `player-scores/` | Looks IP/host-gated. nginx, `Allow: GET`. I did not attempt to bypass. |
| **`https://service.precog.markets/api/v1/`** | **HTTP 200, no auth** | Found in the first-party `precog-markets/forecast-os` repo (`commands.md`: "Backend: https://service.precog.markets/api/v1", `launchpad_service.py` `DEFAULT_API`). Not in the OpenAPI, llms.txt or docs. Trailing slash required. |

Working endpoints on `service.precog.markets` (H, fixtures):

- `GET /api/v1/markets/?chain_id=8453` returns a bare JSON array (no pagination; 109 rows, 169 KB). `&status=OPEN` filter works (18 rows); `limit=` is ignored. Row fields: `id, chain_id, question, resolution_criteria, image_url, category, outcomes` (CSV), `creator, operator, market` (market contract address), `start_at, end_at, collateral_token, collateral_symbol, collateral_decimals, oracle, result` (label string or null), `closed_at, status` (OPEN or CLOSED), `buy_prices` (CSV, one per outcome in `outcomes` order, in collateral units, so already a 0..1 price for USD stablecoin markets), `overround, sell_fee_factor, initial_shares, collateral_funding`. Fixtures: `service_markets_base_8453_status-OPEN_2026-10-19.json` (34 KB, all 18 open rows), `service_markets_base_closed_sample_2026-10-19.json`, `service_markets_arbitrum_42161_2026-10-19.json`.
- `GET /api/v1/upcoming-markets/?chain_id=8453` returns 415 launchpad proposals (664 KB) with `status` (REJECTED 242, DEPLOYED 104, EXPIRED 45, VALIDATED 12, DELETED 11, CREATED 1), `funders[]`, `min/max_funding_amount`, `market_id` and **`master`** (which master contract). Fixture: `service_upcoming_markets_base_sample_2026-10-19.json` (3 rows, funder addresses redacted by me).
- `market-prices/`, `market-trades/`, `accounts/`, `player-scores/` on this host return 404. **No trade tape, volume, or open-interest endpoint is reachable.** NOT FOUND (searched: openapi.json, llms.txt/llms-full.txt, forecast-os repo, service and tracker hosts). Volume would have to come from `SharesBought`/`SharesSold` events.

Adapter gotchas (H):

1. **Row `id` is not unique per chain.** The Base list mixes the V7 and V8 masters; ids 0..41 occur twice (e.g. id 32 = "Torneo Clausura Argentina 2025" on V7 and id 32 = "Ballon d'Or 2026" on V8; 109 rows but only 109 unique `market` addresses). Key on `market` address (or `(master, market_id)` from `upcoming-markets`).
2. API prices are indexed `0..N-1` by `outcomes` order; on-chain `getPrices()` returns arrays of length N+1 with index 0 unused and outcomes 1-indexed. Off-by-one risk.
3. `buy_prices` is the cost of one share (about the marginal price, not an executable quote for size) and no sell prices are given. Freshness of the cached prices vs chain was not verified.
4. Open-market price sums are 1.03-1.08, so do not normalise blindly; the overround is real cost.
5. Disabled/odd `sell_fee_factor` values exist (see fees).

Other read paths:
- **On-chain (H, ABI in repo):** `Master.marketPrices(id)`, `marketBuyPrice(id, outcome, shares)`, `marketSellPrice`, `marketSharesInfo`, `marketSetupInfo`, `marketResultInfo`, `marketAccountInfo`; or on the market contract `getPrices()`, `buyPrice(outcome, int128)`, `getMarketInfo()`, `getMarketSetupInfo()`. Events: `SharesBought/SharesSold/SharesRedeemed/ResultReported`. I did not call RPC: explorer APIs (Blockscout) are behind a Cloudflare challenge and JSON-RPC needs POST, which this task forbids. So deployed state, `createdMarkets()` and event volume were NOT verified on chain.
- **Auth/limits:** none observed on `service.`; rate limits NOT FOUND (no `x-ratelimit-*` headers). `core.precog.markets` advertises OAuth (`markets:read`, `profile:read`), Auth.md agent registration ("rolling out", token handlers not live per its own Status section) and Privy bearer tokens for write endpoints. I did not register.
- **WebSocket / streaming:** NOT FOUND. Agent card says `streaming:false`. MCP at `/mcp` is "HTTP transport stub ... returns 501" per `llms-full.txt` (not called).
- **Subgraph:** NOT FOUND. DefiLlama adapter enumerates markets with `createdMarkets()` + `markets(uint256)` on each master (H, adapter source).

## 5. Trade path

- **Programmatic and permissionless on-chain (H, code).** No off-chain order book or signing scheme. Two EOA transactions:
  1. `ERC20(collateral).approve(spender, maxAmountIn)` where spender is the Master (`marketBuy`) or the market contract (direct `buy`).
  2. `PrecogMasterV8.marketBuy(uint256 marketId, uint256 outcome, int128 sharesAmount, uint256 maxAmountIn)` or directly `PrecogMarketV8.buy(uint256 outcome, int128 amount, uint256 maxCost)`. `sharesAmount` = whole shares times 2^64 (64.64). `maxAmountIn` is slippage protection in collateral base units; unspent amount is refunded. **Use the direct market call**: it avoids the master/id ambiguity because the API gives the `market` address.
  - Sell: `marketSell(id, outcome, shares, minAmountOut)` or `market.sell(outcome, amount, minReturn)`. Redeem: `marketRedeemShares(id)` / `market.redeemShares()` after the oracle closes the market (1:1 collateral).
  - Gasless variants exist: `marketBuyWithPermit` (EIP-2612, approval must target the Market) and `marketBuyWithPermit2` (Uniswap Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`), but the signer still needs someone to submit the tx; the first-party CLI path uses a private key and RPC.
- First-party agent tooling: the `forecast` CLI (`precog-markets/forecast-os`, closed binary from GitHub Releases, needs a raw private key) with `predict --buy-shares N --spend-limit X --confirm`. Not used or run.
- **PayBox reachability: yes (M).** Base (8453) and Arbitrum (42161) are both in PayBox's live chain catalog per `docs/research/06-paybox-platform.md` (2026-10-19). An `io.paybox/transactionProposal` carries exactly one EVM call, so a buy is **two separate proposals/approvals** (approve, then buy), with the EOA paying gas in ETH. Nothing needs an off-chain signature, so the XO-style typed-data flow is not required. The proposal UI shows raw calldata only (per the same note), so 64.64 encoding must be correct before proposing; cross-check with the view call `buyPrice`. Precog's own Terms (below) restrict who may use the Interface, which may include the PayBox user's jurisdiction.

## 6. Fees

- **Buy:** no explicit protocol fee; cost is the LS-LMSR vig (overround 3-8%, price sums 1.03-1.08 on current open markets) plus the share-rounding. Gas paid by the user (Terms s5.3: relaying/sponsorship is optional and revocable). (H)
- **Sell:** proceeds = `deltaCost - deltaCost / sellFeeFactor` (H, `PrecogMarketV8._sell`). API `sell_fee_factor` on the 3 open USDC markets is 20, 25 and 5 (so 5%, 4% and 20% of proceeds) and on open wARS markets 5, 10, 25, assuming the API field equals the on-chain factor (M). Contract default is 100,000 (0.001%). `sellFeeFactor == 0` disables selling. MATE markets show `0.001`, which on the formula would make sells nonsensical or reverting (L, unclear). **Treat Precog as a buy-and-hold-to-resolution leg**, not a two-sided market.
- **Profit-pool split at resolution (M, docs `learn.precog.markets/launchpad/creator-markets`):** after winners are paid, 90% LPs / 5% creator / 5% protocol; this is borne by LPs, not takers. Code analogue: `protocolFeeFactor` applied to operator-withdrawn profit (H).
- Terms s8: protocol, sell, creator, operator, liquidity, resolution, relayer, service and network fees may apply and "may change prospectively".

## 7. Resolution and dispute risk (higher than headline docs suggest)

- **Docs (M):** Reality.eth records outcomes; Kleros is the arbitration backstop; per-market challenge window set by the creator; bonds at least double on each challenge. (`learn.precog.markets/markets/resolution`; the same page does not say how invalid is handled.)
- **Code (H):** `PrecogRealityOracleV3`: only addresses with `REPORTER_ROLE`/per-market reporter can `openQuestion`/`answerOpenQuestion`/`submitResult` through the oracle, and **`reportResult(marketId)` is `onlyGlobalReporter`**. So liveness and the moment the market closes depend on Precog-controlled reporters, even though anyone can in principle bond on Reality.eth directly (M). The market contract accepts a result only from its `oracle` address.
- **Invalid/unanswerable (M, inferred from code):** `reportResult` does `require(answerIndex < outcomes.length, "Invalid answer")`, so a Reality.eth INVALID answer (all-ones) cannot be reported; the market cannot close via the normal path and winners cannot `redeemShares` until an admin intervenes. Markets include explicit escape outcomes such as "Not Played/Canceled" (H, live data).
- **Admin powers (H, `PrecogMasterV8`):** `ADMIN_ROLE` can `updateMarket` (change question, resolution criteria, dates, **swap the oracle**, sell fee), `marketTransferOwnership`, `ownedTokenMint/Burn/Move`, change allowed oracles/collaterals. No timelock or multisig evidence found. NOT FOUND (searched: repo tree, README, DefiLlama): any audit report; DefiLlama shows `audits: 0` (L).
- **History (H, API):** early markets used an EOA as oracle (launchpad row id 167 has `oracle == creator`); current V8 markets use the V3 Reality oracle `0xbb49...`.
- Resolution-criteria drift versus big venues, e.g. the Fed market: bracket by change in the upper bound with "round up to the nearest 25bps bracket" and a cancellation clause defaulting to "No change". Compare wording before linking to Kalshi/Polymarket FOMC markets. ToS s7.3: "Resolution can be delayed or fail. Settlement is not guaranteed."

## 8. Geo, ToS and automation

- Operator: CircleDot LLC, Terms of Use last updated 2026-09-14 (`/terms`, H). Not available to "Restricted Persons" (Schedule A). Restricted jurisdictions include **United States, United Kingdom, Singapore, France, Germany, Italy, Netherlands, Poland, Australia, Japan, Brazil, Ontario, Quebec, Thailand, Taiwan** and others; VPN/proxy use is a material breach (A.5). Age 18+.
- Automation: "Use of Company APIs, bots, scripts, agents, and programs is subject to any supplemental terms" (s11); s10.2 forbids "scrape or misuse Interface data" and attack/overload. Supplemental API terms: NOT FOUND (searched: /terms, /privacy, llms.txt, docs page, repo). `robots.txt` on core disallows `/api/` for crawlers (Content-Signal allows ai-input). The `service.` API is undocumented publicly, so treat any production dependence as unsanctioned until Precog confirms; low polling rate only.
- The Terms govern the **Interface**; the contracts are permissionless, but whether direct contract use by a restricted person is acceptable is a legal question, not answered here. Flag for the project owner before any live trading.
- Market-integrity rule (s10.1a): do not trade a market whose outcome you can influence.

## 9. Liquidity (all dates 2026-10-18/19)

- DefiLlama TVL: **$6,416** (Base) + **$0** (Arbitrum). Peak $16,795 on 2026-01-02, $1,289 around 2026-08-24, so it has been in the low thousands for 6+ months (H, API; fixture). Composition at last point: 1,719 USDC and 7.57M wARS (priced by DefiLlama at about $4,697). So roughly $1.7K is real-dollar collateral.
- Open real-dollar markets and seed: Ballon d'Or 2026 (USDC, $500 funding), Fed October 2026 (USDC, $400), Arena alignment top lab by Dec 31 (USDC, $500). Total $1,400 of seed (H, API). The other open markets are wARS (11) or MATE (4).
- Volume / open interest / trade counts: NOT FOUND (searched: DefiLlama fees/dexs/options summary endpoints returned HTTP 400; no API route; explorer APIs blocked). Observed net buy flow on the Fed market is only about $85 (M, from my model).
- Launchpad pipeline is larger than the live book (12 VALIDATED, 104 DEPLOYED all-time) but those are mostly small wARS/MATE/Argentina-themed markets.

## 10. Event overlap with other venues

Open markets as of 2026-10-19 (H, API): Fed October 2026 FOMC bracket (ends 2026-10-27; **direct overlap** with Kalshi and Polymarket FOMC markets), AI model leaderboard markets (Text Arena top lab by Oct 31, top lab Dec 31; overlap with Polymarket "best AI model" style markets), Ballon d'Or 2026 (Polymarket-style sports award), Argentine football (Boca-River, Copa Libertadores 2026), Argentine CPI/dollar blue/fuel/wheat/corn (little or no overlap), Spotify/box-office/F1 (Colapinto) entertainment items. No crypto-price, US politics or equities markets are currently open (crypto-price and Talent/BNKR/KAITO markets appeared earlier and are closed).
So the only plausible arbitrage targets are the three USDC markets, and capacity is tens of dollars per leg.

**Liquidity shared with another venue: none found (H).** Each market is its own LS-LMSR pool funded by Precog LPs, so it is an independent price source, which is the only reason it is still worth a cheap listing adapter. Note ForecastOS (Precog's own agent skill) compares Polymarket, Kalshi and Precog quotes, i.e. Precog itself positions as a reference venue; not an arbitrage counterparty.

## 11. Adapter notes (for P2 read-only listing)

- Poll `service.precog.markets/api/v1/markets/?chain_id=8453&status=OPEN` every few minutes; ignore `collateral_symbol` in {MATE, wARS, wBRL}; key on `market`; compute probability as `buy_prices[i] / sum(buy_prices)` for signal only, keep the raw price and the overround for executable cost; flag `oracle != 0xbb49B9c5B73b2eBAecee8272d2B8B3bEBe16F073` (non-V3) as high resolution risk.
- Mark staleness if `end_at` is within a day (Fed market stops trading at 2026-10-27T00:00Z, before the FOMC statement).
- Do not implement order placement; if ever needed, quote on-chain with `market.buyPrice(outcome, shares<<64)` first and trade via direct `market.buy` with a tight `maxCost`.

## Sources

- https://core.precog.markets/ , `/llms.txt`, `/llms-full.txt`, `/openapi.json`, `/.well-known/api-catalog`, `/.well-known/agent-card.json`, `/.well-known/mcp/server-card.json`, `/.well-known/oauth-protected-resource`, `/auth.md`, `/docs`, `/status`, `/robots.txt`, `/terms` (H, fetched 2026-10-19)
- https://service.precog.markets/api/v1/markets/?chain_id=8453 , `.../upcoming-markets/?chain_id=8453` , chain 42161 variants (H, GET 2026-10-19; fixtures in `docs/research/fixtures/precog-markets/`)
- https://tracker.precog.markets/api/v1/ (403, H)
- https://learn.precog.markets/ , `/markets/resolution`, `/markets/outcome-shares`, `/markets/pricing-mechanism`, `/markets/mate-markets`, `/launchpad/creator-markets`, `/launchpad/liquidity-provision` (H via page fetch; summaries by a fetch model, so quotes are paraphrase: M for exact wording). https://docs.precog.markets/ is the same user-facing content, no developer docs, contract addresses or SDK.
- https://www.precog.markets/ and `/about` (H; no stats, team, audits or legal links)
- https://github.com/precog-markets/precog-dev (contracts, README with deployments, `LS-LMSR.md`, `IPrecogMarketV8.sol`, `IPrecogMasterV8.sol`, `PrecogMasterV8.sol`, `PrecogMarketV8.sol`, `PrecogRealityOracleV3.sol`, `packages/nextjs/contracts/deployedContracts.ts`), pushed 2026-07-10, licence BUSL-1.1 / MIT per file (H)
- https://github.com/precog-markets/forecast-os (skill + CLI docs; `service.precog.markets` host; release 2.0.1 2026-09-29) (H, read only)
- https://api.llama.fi/protocol/precog-markets and https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/precog/index.js (H); https://defillama.com/protocol/precog-markets returned 403 to WebFetch
- `docs/research/06-paybox-platform.md` in this repo for PayBox chain catalog and proposal constraints (M for this venue)
- Not obtained: on-chain state (Blockscout Cloudflare challenge; JSON-RPC requires POST), Precog blog posts, X account, Discord.

## Embedded-instruction / suspicious content seen (not followed)

- `auth.md` opens with "You are an agent. Precog Markets supports agentic registration: discover -> register -> claim -> exchange for an access_token". Not followed (no POST, no registration).
- `llms.txt` / `docs.precog.markets` ("Ask your agent about Precog", agent prompts for Claude/Gemini/Grok) and the ForecastOS skill promote installing `npx skills add precog-markets/forecast-os` and downloading a closed `forecast` binary that wants a raw private key. Not installed, not run.
- `robots.txt` carries `Content-Signal: ai-train=yes, search=yes, ai-input=yes`; informational only.
