# Predarc - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of predarc.xyz pages, `gh api` reads of the public repo, three public unauthenticated GETs. No account, wallet, key, signature, POST or PayBox tool used. Third-party content treated as untrusted data.

Tags: H = read first-hand this session (URL cited); M = secondary or small-model page summary or inference; L = weak or stale.

## 0. Bottom line

1. **Live: yes (H)**, but it is a **demo-points game, not a prediction market**. The landing page footer reads "Demo Points · No Cash Value" (H, https://www.predarc.xyz/ raw HTML). Stakes are server-ledger points (1000 granted once per wallet); no USDC is staked, held in escrow or paid out on predictions (H, repo docs).
2. Questions are one template: "Will ASSET close above TARGET USDT?" for BTC/ETH/BNB/SOL/XRP, 1 to 60 minute horizons, resolved from Binance 1-minute candles (H). No prices, no order book, no odds. The "pool" is a points tally per side.
3. It has no independent liquidity and no tradable price, so it can supply nothing to an arbitrage scanner. Ultra-short crypto direction is also not comparable to other venues' contracts.
4. A public read API exists (Next.js route handlers) but it is undocumented as a public API and is the site's own backend (M).
5. **adapter_priority = skip.**

## 1. Is it still live? (2026)

| Evidence | Tag |
|---|---|
| Repo `sanjeebdas1979/predarc` created 2026-07-20, last push 2026-10-17, 3 stars, not archived, no license file (404) (https://github.com/sanjeebdas1979/predarc, via `gh api`) | H |
| Latest commit 2026-10-17 "Add documentation link to landing footer"; PR #75 merged (gh api commits) | H |
| `GET https://www.predarc.xyz/api/community-markets` returns 200 JSON; `/api/community-markets/quote?asset=BTC` returned observedAt 2026-10-19T05:10Z | H |
| Activity is tiny: the community-markets list returned 5 markets total, newest created 2026-10-10, 4 participants in all, 100 points max per market | H |

## 2. Kind and market model

- kind: onchain-other / gamified forecasting app with a Supabase server ledger (H, docs/PREDARC-SERVER-LEDGER.md). Not a market maker, CLOB, AMM or parimutuel with real funds.
- Model: binary Higher/Lower versus a target (community markets) or versus entry price (arena rounds). Arena durations 1/5/15 min (site, M); community 5 min, 15 min, 1 hour (H, docs/COMMUNITY-MARKETS.md).
- Outcome tokenisation: none. Outcomes are rows in `predarc_predictions` and `predarc_community_predictions`. Winning entry gets 2x points; losing gets 0; tie is void (H).
- Onchain part: `ForecastRegistryV2` records participation confirmations on Arc; "community outcome and demo-point accounting remain in the Predarc server ledger" (H). The V2 contract source is not in the repo (only `contracts/PredarcDaily.sol`, which is nonpayable and has no value transfer). Its address was NOT FOUND (searched repo docs, contracts, src/constants listing).

## 3. Chains and collateral

- Chain: Arc. Site text says Arc Mainnet (chain 5042, rpc.mainnet.arc.io) with native USDC bridging to Ethereum, Base, Arbitrum, Polygon (H for the strings in site HTML; docs/DAILY-ACCESS.md lists Arc Mainnet 5042 and Testnet 5042002). The arena prediction transactions are described as Arc **testnet** (H, DAILY-ACCESS.md). The "mainnet migration" is explicitly incomplete (H).
- Collateral: none. Server demo points; gas only (H: PredarcDaily is "Nonpayable functions; no USDC transfer, deposit, payout"). Real USDC is used only for the site's Bridge, Swap and paid AI research tools, not for predictions (M, guide page summary).

## 4. Read API

- exists = unofficial-only (site's own Next.js backend, no published API docs). Closest docs: repo `docs/COMMUNITY-MARKETS.md`, `docs/AGENT-AUTOMATION.md`. NOT FOUND: any API reference page, OpenAPI, rate limit statement, websocket (searched site pages, repo docs).
- Base URL: https://www.predarc.xyz (the `www` host is canonical per AGENT-AUTOMATION.md).
- Unauthenticated GETs confirmed (H):
  - `GET /api/community-markets` -> `{"markets":[{id, asset, creatorWallet, targetPrice, referencePrice, durationSeconds, createdAt, closesAt, resolutionAt, status ("awaiting-settlement"|"settled"), outcome ("higher"|"lower"|null), settlementPrice, settledAt, participantCount, higherPoints, lowerPoints, userPrediction}]}`. Fixture: `docs/research/fixtures/predarc/community-markets.sample.json` (third-party creator wallets redacted).
  - `GET /api/community-markets/quote?asset=BTC` -> `{"asset","price","observedAt"}` (Binance spot relay). Fixture `quote.sample.json`.
  - `GET /api/btc-price` -> `{"price","change24h","updatedAt"}`. Fixture `btc-price.sample.json`.
- Other routes need a signed `predarc_session` cookie and a validated request origin (H, COMMUNITY-MARKETS.md): auth, account, predictions, agents. Not probed.
- Auth and limits: none for the GETs; limits not documented.

## 5. Trade path

- Programmatic entry exists for agents: `POST https://www.predarc.xyz/api/agents/predictions` with a bearer token created after an EIP-712 policy signature and sign-in (H, docs/AGENT-AUTOMATION.md). Submits demo-point predictions only.
- Community prediction entry is an Arc wallet transaction to the registry plus a server-verified record (H).
- PayBox reachable: **no**. Needs an Arc wallet and a session; Arc is not among PayBox's listed chains (I did not verify PayBox Arc support, M: PayBox instructions mention an "Arc native USDC" network id, so Arc may be supported). Regardless, there is no money to trade, so reachability is moot.

## 6. Fees

NOT FOUND (searched site pages, repo docs). Predictions carry no protocol fee since no money moves; only Arc gas. Reward is flat 2x points (H).

## 7. Resolution and dispute risk

Deterministic from finalized Binance 1-minute candle containing expiry; any signed-in user can trigger settlement; creator cannot choose the result (H). Tie = void. Points ledger is centralised in the operator's Supabase (H). The scorer for the Daily contract is a single trusted immutable address (H, DAILY-ACCESS.md). No dispute process. Risk: operator controls everything.

## 8. Geo / ToS / automation

NOT FOUND: /terms returned 404; the guide page has no terms or geo rules (searched /guide, /terms, site home). Agent automation is explicitly supported with bounded limits (H). No public statement on scraping the read endpoints.

## 9. Liquidity

Effectively zero and non-monetary. 5 community markets, 4 participants, 100 points max per market, newest 2026-10-10 (H, API fetched 2026-10-19). TVL/OI: not applicable, no funds held.

## 10. Event overlap and shared liquidity

Nominally BTC/ETH/SOL/BNB/XRP "close above X" at 1 min to 1 hour horizons; similar in subject to crypto price contracts on Polymarket/Kalshi/Limitless, but there are no priced contracts to compare. Does not share liquidity with any venue; it has none.

## 11. Priority

skip. No money, no prices, centralised ledger, trivial activity, undocumented API. Revisit only if it launches real-value markets with an exposed price feed.

## Open questions

- Is Arc mainnet actually live for arena predictions, and what is the ForecastRegistryV2 address?
- Does PayBox support Arc, and would that matter if real stakes were added?

## Suspicious content

None found. (No embedded instructions in pages or repo docs read.)

## Sources

- https://predarc.xyz and https://www.predarc.xyz (WebFetch summaries, raw HTML grep for "Demo Points · No Cash Value")
- https://www.predarc.xyz/guide (WebFetch summary, M)
- https://github.com/sanjeebdas1979/predarc: README.md, docs/COMMUNITY-MARKETS.md, docs/DAILY-ACCESS.md, docs/PREDARC-SERVER-LEDGER.md, docs/AGENT-AUTOMATION.md, repo metadata and commits via `gh api`
- Unauthenticated GETs listed in section 4, 2026-10-19
