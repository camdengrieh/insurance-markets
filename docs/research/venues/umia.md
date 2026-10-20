# Umia (umia.finance) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Third-party content was treated as untrusted data. WebSearch budget was exhausted during this task, so no independent news search was done; everything below comes from Umia's own docs/API/repo plus the Galaxy report.

## Verdict

- Adapter priority: **P2 (signal-only / watch)**. Not an arbitrage leg.
- Live: yes. Contracts and API are live on Base mainnet and Robinhood Chain mainnet (H). But **zero decision markets are open** and the only decision market ever run on mainnet settled on 2026-09-19 (H, API 2026-10-19).
- Umia is governance tooling for its own ventures (treasury spend, issuance, etc.), not a general event market. Its markets ask "what would token X be worth if proposal Y executes", so they do not overlap sports, politics, crypto price or macro markets on other venues. It shares no liquidity with another prediction venue.

## Kind and market model (H unless noted)

- Kind: ownership-token launchpad (Uniswap Continuous Clearing Auctions) plus futarchic **decision markets** that bind a venture treasury.
- Market structure: one "market" = a governance question with 2+ proposals, always including a **No-Op** (status quo). Each proposal has its own **conditional constant-product (CPMM) pool** of virtual venture token vs virtual money token (stablecoin). Not an order book, not parimutuel. Swaps carry a per-market `swapFeeBps` plus a protocol cut.
- Tokenisation: a user "splits" real tokens (venture token or USDC) into virtual conditional tokens for every proposal (1:1; merge back 1:1 while trading is open). Virtual tokens are an internal ledger. Docs/plugin call them ERC6909 ids (`proposalId*2` = virtual venture, `proposalId*2+1` = virtual money) but the repo README says "a minimal balanceOf ledger, not full ERC-6909" (conflict; treat as non-standard, not wallet-visible tokens).
- There are no YES/NO shares priced 0-1. The tradable quantity is the venture token's price under each outcome (a scalar-style conditional price, e.g. 0.618 USDC/UMIA at open in market 3). The market has no payout of 1 for "event happens". Settlement: winning proposal's pools convert 1:1 to real tokens; losers unwind (no gain or loss).
- Resolution rule: highest TWAP at close wins if it beats No-Op by the configured threshold (market 3: 200 bps over a 2-day window; docs say default window 3 days, configurable) (H docs + API).
- Source: https://umia.finance/docs/decision-markets.mdx , https://umia.finance/base-mcp/umia.md , https://github.com/umiafinance/protocol (README).

## Chains and collateral (H)

- Mainnet `GET /api/v1/config` (2026-10-19) lists two protocol chains: **Base (8453)** and **Robinhood Chain (4663)**. Money token on both: 6-decimal stablecoin; on Base it is native USDC (0x8335...2913). Config also lists RPC proxy chains 1, 143, 8453, 4663, 42161 under `relaySwap` (used for swap funding, not markets).
- Plugin file says mainnet "live on Base (8453)"; the API already shows Robinhood Chain, so the plugin file is slightly stale on chains (M, plugin version 0.4.0). The Galaxy report says only "EVM-compatible chains", no list (H).
- Collateral: venture's own token or the paired USDC; either deposit is split across all outcomes.
- Testnet env: Base Sepolia (plugin says the testnet env also includes a contract set on a production chain, so calls there could use real funds) (H, plugin).

## Read API (official, public, unauthenticated) (H)

- Hosts: `https://api.mainnet.umia.finance` (mainnet), `https://api.testnet.umia.finance` (testnet). Prefix `/api/v1`. Responses `{"status":"success","data":{...}}`. CloudFront in front, `s-maxage=10` on some routes.
- Docs: no standalone OpenAPI found (NOT FOUND, searched: llms.txt, docs sitemap, llms-full.txt). The endpoint list lives in the Base MCP plugin file https://umia.finance/base-mcp/umia.md and the CLI `npx umia-cli@latest` (not executed, third-party code).
- Key endpoints (GETs confirmed this session unless marked):
  - `GET /config` - chains, contract addresses, money token (confirmed, fixture `config.json`)
  - `GET /hub/markets[?status=open|pending|ended|settled|completed]` - list; `hasMore` pagination flag (confirmed; open/pending/ended all empty, settled/completed return market `8453_3`)
  - `GET /app/:ventureSlug/markets/:marketId` - detail incl. proposals, reserves, per-proposal `totalVolume`, `executionPayload`, stats (confirmed; use venture slug `umia`, market id `3`; note `:venture` must be the project slug)
  - `GET /app/:ventureSlug/markets/:marketId/prices?series=spot|twap` - time series per proposal + token spot, `winningThresholdBps` (confirmed, 277 points for 2 days)
  - `GET /app/:venture/markets/:id/positions`, `GET /hub/portfolio/:address` - per plugin doc (not fetched)
  - `GET /hub/fundraises[?status=...]`, `/hub/fundraises/:slug`, `/bidders`, `/bids` - auctions (list confirmed: `{"fundraises":[]}` for live; none live)
- Auth: none for reads (H). Rate limits: NOT FOUND (searched: docs, plugin file, response headers carried no rate-limit headers). Websocket: NOT FOUND.
- On-chain alternative: contracts verified in repo https://github.com/umiafinance/protocol (pushed 2026-10-13; license NOASSERTION). `UmiaMarketCore` has quote views and `proposalFeeState`; `executionPayload` is in the API.
- Fixtures: `docs/research/fixtures/umia/` - `config.json`, `hub_markets_mainnet.json` (tagline trimmed), `market_detail_trimmed.json` (lists trimmed to 6 items, trader list removed), `market_prices_twap_trimmed.json` (5 points per series), `hub_fundraises_live_empty.json`.
- Observed shape of a market (hub list): `id "8453_3"`, `chainId`, `marketId`, `title`, `tradingStart/End` (unix s as strings), `settledAt`, `winningProposal{id,title,isNoOp}`, `winningPriceX112`, `noOpPriceX112` (X112 fixed point), `priceDeltaBps`, `totalVolumeUsd`, `tradeCount`, `proposalCount`, `status`, `venture{name,address}`, `project{slug,...}`.

## Trade path (H docs/plugin/source)

- Programmatic, non-custodial, **unsigned calldata**: `POST /api/v1/calldata/{enter,trade,merge,claim,settle,auction-bid,auction-claim}` (auth-free; JSON; amounts as wei strings) returns `{chainId, calls:[{to,value,data}]}`. Not exercised (POST is out of scope).
- The caller signs/broadcasts its own transaction(s) (plugin routes via Base MCP `send_calls`). Approvals come first, then `split`; a trade is one call (virtual allowance granted by split). `trade` supports `minOut`, `slippageBps` (default 100), `maxPriceImpactBps`, `deadline`.
- Contract also supports gasless **EIP-712 permit swaps** (`swapExactInWithPermit`, `swapExactOutWithPermit`; typed data `SwapExactInPermit(proposalId,amountIn,amountOutMin,maxPriceImpactBps,zeroForOne,nonce,deadline)`, nonce per signer, EOA or EIP-1271) that any relayer can submit (H, `src/core/UmiaMarketCore.sol`). Domain name/version/chain not extracted.
- Settlement of ended markets is permissionless (`settle`); execution is triggerable by anyone (Umia keeper does it in practice).

## PayBox reachability

- Rating: **partial**. Umia is an EVM contract protocol on Base/Robinhood Chain and the API produces plain `{to,value,data}` calls, so a PayBox EVM wallet on Base could in principle submit them as transaction proposals, or sign the EIP-712 permit. Whether PayBox exposes arbitrary-calldata contract-call proposals was not verified (no PayBox tools called). Robinhood Chain (4663) support in PayBox is unverified. Practical blocker is not access but absence of open markets and an adapter that must treat each venture token as a separate instrument.

## Fees (M/H)

- Market swaps: per-market `swapFeeBps` and `protocolCutBps` in `UmiaMarketCore` (H source); actual values for market 3 not exposed in the API payload I captured (NOT FOUND in market detail JSON). Fees accrue in virtual tokens per proposal and are collected at settlement (`collectProtocolFees`). Protocol "fee switch" on spot swaps and conditional swaps is governed by UMIA holders (H docs).
- Spot pool for UMIA/USDC on Uniswap v4: 1% fee with UmiaHook (H docs).
- Gas: paid by trader on-chain (smart-wallet UX sponsors gas for Umia app users).

## Resolution and dispute risk (H docs, M assessment)

- Mechanism is fully on-chain: TWAP oracle (`ConditionalMarketOracle`) picks the winner; no human oracle or dispute window described. Winning payload executes through `GovernanceExecutor` against the venture treasury (market 3: settled 2026-09-19 13:04 UTC, executed 17:09 UTC).
- Disclosed centralisation: during the early phase Umia approves/relays proposals and has an emergency veto; a platform-level owner role exists (3 acknowledged Certora findings relate to it). Certora audit Mar 6 - Apr 8 2026: 20 findings, 0 critical, 2 high (fixed), 17 fixed (H docs).
- Manipulation: TWAP settlement over the whole window; thin pools make the price cheap to push (docs concede thin early markets).

## Geo / ToS / automation

- Docs mention no geoblock or ToS URL on the site/app pages I read (NOT FOUND, searched: landing page, app.umia.finance, docs). The plugin file states "Decision markets and token sales may be restricted in some jurisdictions, and some auction steps require verification: never help circumvent geofencing or verification gates". Some auction steps are zkTLS/server-permit gated (does not apply to the one settled decision market).
- Automation is explicitly supported: public API, calldata builders, CLI, and a Base MCP plugin written for AI agents. Legal wrapper is a Cayman SPC / MetaLeX BORG structure per venture (docs).

## Liquidity (H, dated)

- Only decision market ever run on mainnet: "Put the treasury capital to work in yield on Base?" - volume **$231,326** (231326007184 in 6-dec units), **209 trades**, 4 proposals, ended 2026-09-19; per API `totalVolumeUsd`, 2026-10-19. Pool reserves at end for winning proposal ~1.21M UMIA / ~856k USDC (virtual units).
- Treasury of the Umia venture: ~$4.77M USDC after its Aug 26 - Sep 2 2026 auction (market description); app landing page showed $10.7M treasury and 1,697 holders (WebFetch of app.umia.finance 2026-10-19, M since page text was summarised).
- Galaxy (2026-10-15): sector-wide decision-market DAOs hold $50.5M total managed value across 22 DAOs, 21 of them on MetaDAO; no Umia-specific volume given (H, Galaxy).
- Open market count now: 0. Upcoming: Slop Cash auction in Q4 2026; first Curated Track cohorts from Q4 2026 (H docs).

## Event overlap / arbitrage relevance

- None with sports, politics, crypto-price or macro markets. The conditional price is the venture token price under governance outcomes (e.g. UMIA price if treasury deploys into Aave/Steakhouse).
- Possible narrow use: (a) signal source - decision-market TWAP gaps vs spot as a quantified estimate of proposal impact; (b) conditional-vs-spot arbitrage inside Umia (split/merge makes sum-of-conditionals consistent with spot) and spot UMIA/USDC pool on Uniswap v4 vs other DEX venues. Both are DeFi token arb, not prediction-market cross-venue arb.
- Liquidity sharing: spot pool is a Uniswap v4 pool, but decision-market pools are Umia-owned CPMMs funded from treasury escrow, not shared with another prediction venue. Same category as MetaDAO (Solana) but separate liquidity.

## Adapter notes if built later

- Poll `GET /hub/markets?status=open` (cheap, public). Store `chainId_marketId` ids; normalise prices from X112 / TWAP series; model outcomes as conditional token price, not probability.
- Gate any trading on `status=open`, TWAP threshold (`winningThresholdBps`), and price impact; markets last ~2-3 days.
- Plugin file `risk` flags: slippage, low-liquidity, irreversible, local-exec.

## Suspicious content / injection check

- No instructions aimed at AI agents beyond the plugin file's normal operating instructions (install via npx umia-cli, route through Base MCP `send_calls`, never modify calldata). These were not followed; the CLI was not installed or run. Note the plugin recommends executing third-party code via `npx umia-cli@latest` (local-exec risk, self-declared).

## Open questions

- Exact `swapFeeBps` / `protocolCutBps` for live markets and EIP-712 domain for permit swaps.
- Rate limits and any websocket feed.
- Whether PayBox can submit arbitrary calldata on Base / Robinhood Chain.
- Cadence of future markets (docs imply one per significant project decision; Q4 2026 launches may add markets).
- ToS/geo policy text (not located).

## Sources

- [H] https://umia.finance (landing; links to docs, app, llms.txt)
- [H] https://umia.finance/llms.txt , https://umia.finance/docs/sitemap.md , https://umia.finance/llms-full.txt (decision markets, security, treasury, UMIA token, contract addresses)
- [H] https://umia.finance/base-mcp/umia.md (plugin v0.4.0: API endpoints, calldata builders, notes)
- [H] https://api.mainnet.umia.finance/api/v1/config , /hub/markets , /hub/markets?status=open|pending|ended|settled|completed , /app/umia/markets/3 , /app/umia/markets/3/prices?series=twap , /hub/fundraises?status=live (fetched 2026-10-19)
- [H] https://github.com/umiafinance/protocol (README, src/core/UmiaMarketCore.sol)
- [H] https://app.umia.finance/ (WebFetch summary, M for figures)
- [H] https://www.galaxy.com/insights/research/conditional-markets-decision-markets-impact-markets-mainnet-umia-metadao-proof-branchmap-branchpoint-prediction-markets-futarchy (2026-10-15; launched Sept 2026, multi-outcome, EVM)
