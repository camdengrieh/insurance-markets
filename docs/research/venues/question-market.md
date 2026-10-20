# question.market (Algorand) - venue adapter spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

**adapter_priority: skip.** The site and API are live, but the only deployment is **Algorand TESTNET with a faucet-minted "tUSDC" (play money)**. No mainnet deployment was found. The last trade or price update on every market I sampled was 2026-04-22 to 2026-04-27, about 6 months before this check. Liquidity is zero real dollars. It is not an arbitrage leg and its prices are not a signal. Revisit only if a mainnet deployment appears.

## Still live?

- Homepage returns HTTP 200 (2026-10-19), title "question.market | prediction markets on Algorand". [H, https://question.market]
- Backend is up: `/api/health` returns `status: ok`, `algod_reachable: true`, `uptime_seconds` about 15.1M (about 175 days), `markets_total: 12`, `markets_active: 10`. [H, https://question.market/api/health, fixture `health.json`]
- The same health payload shows `errors_last_hour: 261` and repeated `trigger_resolution` HTTP 400 errors for markets 759190750, 759190702 and 759190691 ("no pending block evaluator"). Treat the resolution bot as flaky. [H]
- It is live as a testnet demo, not as a trading venue. [H]

## Testnet only (key finding)

- The npm package and MCP server default to `https://testnet-api.4160.nodely.dev` and bundle only `deployments/testnet.json` (network "testnet", deployed 2026-04-21, USDC ASA 759184112, which is a custom test asset). [H, https://github.com/qmrkt/mcp-server, `deployments/testnet.json`]
- The public docs describe a testnet faucet that drips 50 ALGO and 100 tUSDC. [H, https://question.market/llms.txt]
- All 12 markets have app IDs in the 759xxxxxx range, which matches the testnet deployment. Four distinct creator addresses appear, and the 8 largest markets share one creator, the deployer. [H, `/api/markets`]
- The code supports a `mainnet` selector (`QUESTION_MARKET_NETWORK=testnet|mainnet|localnet`) but ships no mainnet bundle. NOT FOUND (searched: mcp-server `deployments/`, ts-sdk `protocol-deployment.json`, llms.txt, repo READMEs). A web search for a mainnet launch could not run because the session search budget was exhausted. [H absence in repos; mainnet status otherwise unknown]
- The SDK README example uses USDC ASA `31_566_704`, which looks like Circle USDC on Algorand mainnet. It is an example value only. I did not verify it as a deployment. [M]

## Kind and market model

- kind: onchain AMM, Algorand app-per-market. [H, https://github.com/qmrkt/contracts]
- Pricing is **LMSR** (Logarithmic Market Scoring Rule), a cost-function market maker with liquidity parameter `b`. There is no order book. [H, llms.txt, contracts README]
- Markets are binary or categorical with **2-8 outcomes**. There is no scalar type. [H, llms.txt: "Active-LP market creation currently supports 2-8 outcomes"]
- Outcomes are **not tokenised as ASAs**. Positions are per-user box storage inside the market app, as shares and cost basis. 1 share pays 1 USDC if it wins, with 1 share = 1,000,000 units. They are not transferable tokens. [H, `market_app/contract.py` `buy`/`claim`; llms.txt "Payout is 1 USDC per winning share"]
- Prices are integers at 1e6 scale and sum to 1,000,000, for example `[742690, 257310]`. [H, fixture `market-759190680.json`]
- Active LPs deposit into live markets and earn fees. LP entry is blocked if any outcome price exceeds `lpEntryMaxPriceFp` (default 0.8). [H]

## Chains and collateral

- Chain: Algorand. Collateral: USDC ASA, which is tUSDC on testnet. [H]
- Each trade needs an atomic group: an asset transfer plus an ALGO payment for box MBR of about 0.05 ALGO, a one-time cost per trader and outcome. [H, `contract.py` L982-993]
- No protocol token. [H, llms.txt]

## Read API

- exists: **official-public** (unauthenticated). [H]
- Base URL: `https://question.market/api`. Note that `https://question.market/api` itself returns 404. [H]
- Docs: https://question.market/docs/api (client-rendered, so unreadable by fetch). The same content is in https://question.market/llms.txt. [H]
- Key endpoints (all unauthenticated GET, confirmed live):
  - `GET /api/markets?limit&offset&status` returns `{markets, total, limit, offset, hasMore}`. [H, fixture `markets-list-limit3.json`]
  - `GET /api/markets/{appId}` returns `{market: {...}}`, with `question`, `outcomes`, `prices[]`, `quantities[]`, `b`, `poolBalance`, `volume`, `status`, `deadline`, `winningOutcome`, `blueprintSummary` and more. [H, fixture `market-759190680.json`]
  - `GET /api/markets/{appId}/prices?limit` returns a price history array `[{id, appId, prices:"[\"742690\",\"257310\"]", timestamp(ms)}]`. Note that `prices` is a JSON-encoded string. [H, fixture `market-759190680-prices.json`]
  - `GET /api/leaderboard`. [H, fixture `leaderboard-head.json`]
  - `GET /api/markets/{appId}/evidence` and `GET /api/markets/{appId}/human-judgments`. Documented, not fetched. [H doc only]
  - `/api/markets/{id}/trades` returned HTTP 200 but is not in the public list, and I did not inspect the body. The MCP exposes `get_market_trades`. [L]
- Conventions: amounts are micro-USDC, timestamps are unix seconds (price-history `timestamp` is in ms), and outcome indices are zero-based. Status enum: 0 CREATED, 1 ACTIVE, 2 RESOLUTION_PENDING, 3 RESOLUTION_PROPOSED, 4 CANCELLED, 5 RESOLVED, 6 DISPUTED. [H, llms.txt]
- Auth and rate limits: no auth for reads. Rate limits NOT FOUND (searched: llms.txt, repo READMEs). The MCP error taxonomy includes `rate_limit`, so limits exist. [H]
- Websocket: `wss://question.market/ws`. Send `{"action":"subscribe","topics":["market:{appId}","markets","comments:{appId}"]}`. Events are best-effort and are meant to invalidate REST caches, not to be a source of truth. I did not connect. [H doc only]
- Direct on-chain reads are possible through algod, and the SDK ships LMSR quote math (`quoteBuyForBudgetFromState`, `calculatePrices`, `calculateSellReturn`). [H, https://github.com/qmrkt/ts-sdk]
- Stable surface is `/api/*`. The docs say not to rely on raw indexer paths. [H]

## Trade path

- Programmatic: yes, via `@questionmarket/sdk` (TypeScript, algosdk) or the `@questionmarket/mcp` server. The MCP write tools are `buy_shares`, `sell_shares`, `enter_lp_active`, `claim_winnings`, `refund_shares` and `create_market`. [H]
- Auth and signing: native Algorand Ed25519 transaction signing. The MCP takes a 25-word `AGENT_MNEMONIC` or `set_wallet(mnemonic)` hot key. [H]
- `buy(outcome, max_cost, ...)` and `sell(..., min_return)` give slippage protection. [H, `contract.py`]
- PayBox reachability: **no, practically**.
  - PayBox's chain families are EVM and Solana per our local notes. Algorand is not listed, so there are no transaction proposals for it. [M, docs/research/06-paybox-platform.md]
  - A theoretical path exists: xChain Accounts derives an Algorand address from an EVM address and a LogicSig checks an EIP-712 secp256k1 signature. [H, https://github.com/algorandfoundation/xchain-accounts and https://github.com/qmrkt/use-wallet-xchain-evm]
  - That would need `request_wallet_sign` `typedData`, and the xChain README says the protocol is Beta. [H]
  - That path is untested, and the wallet would still need Algorand USDC and ALGO for fees.
  - Since the venue is testnet-only, it is moot. [M]
- I did not sign, fund, call the faucet or POST anything.

## Fees

- LMSR cost is the base price. On top of it the trader pays `lp_fee = ceil(cost x lpFeeBps/10000)` and `protocol_fee = ceil(cost x protocolFeeBps/10000)`. [H, `contract.py` `buy`]
- On sell, the same two fees are deducted from the gross LMSR return. [H, `contract.py` `sell`]
- Observed markets show `lpFeeBps` 200 and `protocolFeeBps` 50, so **2.5% per trade each way**, and about 5% round trip. [H, `/api/markets`]
- Additional costs: a one-time about 0.05 ALGO box MBR per trader and outcome (treated as a fee, not refunded), and Algorand network fees. [H]
- Payout is 1 USDC per winning share. The docs cite the 2% LP fee, with an unrelated 0.5% protocol fee. [H]
- That is a high fee for arbitrage. An edge of more than about 5% round trip is required before costs.

## Resolution mechanism and dispute risk

- Each market embeds a "resolution blueprint", a DAG executed by an off-chain `resolution-engine` (Go service) with node types such as `llm_call`, `api_fetch`, `await_signal` and `agent_loop`. [H, https://github.com/qmrkt/resolution-engine]
- The live markets I inspected all use a **human reviewer** ("a human reviewer will judge...", with a 24-hour response window; no response means the market is cancelled). Disputes re-run the same review. [H, `blueprintSummary` field]
- On-chain, the flow is `trigger_resolution`, then `propose_resolution` (bond), then a challenge window (3600s observed), then `finalize_resolution`, with `challenge_resolution` -> dispute -> `creator_resolve_dispute` / `admin_resolve_dispute`. [H, `contract.py` method list]
- Risk is high:
  - The resolution authority, creator and market admin are all the same single address on the markets I checked. [H]
  - Anyone can create markets, so subjective or unverifiable questions are possible.
  - The resolution bot was erroring (see Still live). Two markets sit in RESOLUTION_PENDING.
  - Market 759190739 ("2026 FIFA World Cup winner") is in RESOLUTION_PENDING with a 2026-06-21 deadline. [H]
- Audit: I found only the project's own `VULNERABILITY_REPORT.md` (UInt64 overflow in `claim_lp_residual` that can lock LP residuals above about $10k LP). The fix commit is 2026-05-01. No third-party audit report was found. NOT FOUND (searched: contracts repo `audit/`, README). [H]

## Geo / ToS / automation

- Geo or ToS text: NOT FOUND. `/terms` and `/privacy` return 200 but are client-rendered shells with no extractable text. Search was blocked, so ToS status is unknown. [L]
- Automation: explicitly welcome. The project ships an MCP server for agents and a documented public API, and the faucet is built for agents. [H, llms.txt]
- No KYC is visible in the testnet flow. [M]

## Liquidity

- Testnet play-money figures only, from `/api/markets` on 2026-10-19: 12 markets, cumulative `volume` about 869.6 tUSDC, total `poolBalance` about 2,762 tUSDC (pool includes seeded LP and fee/bond accounting). Biggest market is 759190713 (SpaceX Mars), at about 311 tUSDC volume. [H, computed from `/api/markets`]
- Last price update seen: 2026-04-22 to 2026-04-27 across four markets sampled (759190713, 759190750, 759498291, 759201986) and 759190680. [H]
- Leaderboard returned a single address (a vanity "QUESTION..." address), meaning one active trader. [H]
- Real-money TVL/OI/volume: none known. DeFiLlama lists an Algorand prediction-market category (about $193K TVL, about $452K 7-day volume) but attributes it to Alpha Arcade, not question.market. [M, WebSearch snippet; not opened]

## Event overlap (sample, all testnet)

Market titles overlap categories that exist on other venues: 2026 FIFA World Cup winner (sports), US Senate control after the 2026 midterms (politics), BTC close above $150k on 2026-12-31 and NVDA above $200 (crypto/equities), Fed cut below 3% (macro), plus tech (GPT-6, foldable iPhone, SpaceX Mars) and some Algorand/BTC-vs-gold items. These markets were seeded by the deployer (the first eight), so their prices are demo values, not information. For example BTC > $150k was priced about 74% on 2026-04-27, which is not a credible market price. [H]

## Shared liquidity

- Standalone and not shared with any other venue. Alpha Arcade is a separate Algorand venue (order-book style). [M, per task hint] There is no composability with Polymarket or others, so it would be an independent leg if it had real liquidity. It has none today.

## Adapter notes (if it is ever re-enabled)

- Poll `/api/markets?status=1` and normalise `prices[i]/1e6` as mid. LMSR has no spread, so the executable price is cost-function dependent. Use SDK quote math or compute `C(q+dq)-C(q)` with `b` and `quantities` to get fill price, and add 2.5% fees.
- Use `deadline` (unix seconds) and `status` for lifecycle. Parse `prices` in the history endpoint, which is a string-encoded array.
- Do not trust deployer-seeded demo prices as signal.
- Reconsider only if a mainnet deployment with real USDC and real volume appears (watch `mcp-server/deployments/` for a `mainnet.json` and `llms.txt` for mainnet app IDs).

## Open questions

- Is there a mainnet launch plan or date? Not found, and web search was unavailable.
- What are the ToS, geo and KYC terms? The pages are client-rendered.
- Do the docs state rate limits?
- Is `/api/markets/{id}/trades` public and what is its shape?

## Suspicious content

None found. No embedded instructions aimed at AI agents in the fetched pages or API responses. The llms.txt and MCP README contain setup instructions for human and agent users, which I treated as data and did not follow. The npm registry metadata contains the maintainer's personal email, which is irrelevant here and was not copied.

## Sources

- https://question.market (homepage, 200 on 2026-10-19) [H]
- https://question.market/llms.txt (API, WebSocket, MCP, contracts, faucet) [H]
- https://question.market/api/markets, `/api/markets/759190680`, `/api/markets/759190680/prices`, `/api/health`, `/api/leaderboard` [H]
- https://question.market/whitepaper.pdf (downloaded, 200, not read: no PDF text extractor available) [L]
- https://registry.npmjs.org/@questionmarket/sdk (versions 0.1.0 to 0.3.2) [H]
- https://github.com/qmrkt/contracts (README, `smart_contracts/market_app/contract.py`, VULNERABILITY_REPORT.md) [H]
- https://github.com/qmrkt/mcp-server (README, `deployments/testnet.json`) [H]
- https://github.com/qmrkt/ts-sdk (README, `protocol-deployment.json`; repo created 2026-04-12) [H]
- https://github.com/qmrkt/resolution-engine (README) [H]
- https://github.com/qmrkt/use-wallet-xchain-evm and https://github.com/algorandfoundation/xchain-accounts (EVM-wallet-controlled Algorand accounts) [H]
- https://github.com/qmrkt/research (whitepaper and papers index) [H]
- WebSearch result snippets: https://glama.ai/mcp/servers/qmrkt/mcp-server, https://defillama.com/protocols/prediction-market/algorand [M]
- Local: docs/research/06-paybox-platform.md [M]

## Fixtures

- docs/research/fixtures/question-market/markets-list-limit3.json
- docs/research/fixtures/question-market/market-759190680.json
- docs/research/fixtures/question-market/market-759190680-prices.json
- docs/research/fixtures/question-market/health.json
- docs/research/fixtures/question-market/leaderboard-head.json
