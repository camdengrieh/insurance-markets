# Moneta (Monad futarchy) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the official site/docs/status pages, `gh api` file reads of the public repo, three unauthenticated GETs (site HEAD, indexer GraphQL sent as GET, explorer API). No account, wallet, key, signature, on-chain call, POST, or PayBox tool. Third-party pages and repo text were treated as untrusted data. WebSearch was unavailable (session budget used up), so no press, social or analytics coverage was read.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference; **L** = weak or stale.

Fixtures (<= 50 KB each) in `docs/research/fixtures/moneta-monad-futarchy/`: `repo_deployments_10143.json`, `repo_indexer_schema.graphql`, `repo_abi_MonetaAMM.json`, `repo_abi_MonetaRouter.json`, `indexer_get_persisted_query_error_2026-10-19.json`. Note these are repo files plus one error response, NOT live market data (see section 5).

---

## 0. Bottom line

1. **Live as a testnet demo only.** Monad **Testnet** (chain id 10143). No mainnet deployment, no mainnet date on the site. Repo created 2026-10-04, last push 2026-10-11, 0 stars, 0 forks, no license. The README links a demo video and a pitch video, so it reads as a hackathon-style submission (M, inference). (H for dates and testnet, from the repo API and docs)
2. **Not an event-prediction market.** It is a futarchy treasury-governance product: founders raise USDC, then each spending proposal opens two constant-product AMM pools (token-if-PASS, token-if-FAIL) and the verdict compares their TWAPs. The "price" is a project token's value conditional on a proposal. It is not a probability of a real-world event. (H)
3. **Zero arbitrage overlap.** No sports, politics, crypto-price or macro contracts, and no other venue lists these markets. (H by construction of the product)
4. **No value at stake.** Collateral is Circle's testnet USDC (20 per 2 h from a faucet) or an open-mint "mUSDC" (anyone mints 10,000 per click). Per ADR 0007, mUSDC "has no scarcity ... test figures, not capital". (H)
5. **adapter_priority = skip.** Testnet, valueless collateral, no event overlap, no documented REST API (GraphQL indexer needs POST, which I did not send), one-live-proposal-per-project design with multi-day windows. Revisit only if a Monad mainnet deployment ships with real USDC; even then it is at best a P2 signal about governance, not a price-comparison leg.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site `https://www.monetafutarchy.xyz` | HTTP 200, `server: vercel`, `age: 687589` s (~8 days) on the prerendered home page, i.e. last deployed ~2026-10-11, consistent with the repo push | H (curl HEAD) |
| Site content | Landing page says Monad Testnet; "The page shows no mainnet launch" | M (WebFetch summary) |
| `/explore` | Renders navigation + search box only, no raises/proposals listed (client-rendered or empty) | M (WebFetch summary; cannot tell empty from not-hydrated) |
| `/status` | Network "Monad Testnet"; Keeper "On time", "0 live proposals"; indexer and RPC rows show "Checking"; counters (total raised, verdicts, volume) not rendered | M (WebFetch summary of a client-rendered page) |
| Repo `Ge0frey/moneta` | created 2026-10-04T21:27Z, pushed 2026-10-11T05:39Z, not archived, license null, 0 stars (`gh api repos/Ge0frey/moneta`) | H |
| Deployment | `deployedAt` 1791202294 = 2026-10-05 12:11:34 UTC, `startBlock` 68398017, chain 10143 (`packages/contracts/deployments/10143.json`) | H |
| README | "Moneta is live on Monad testnet" | H |

Verdict: **still_live = true as a testnet demo**; no evidence of any real-money deployment. (H for testnet, M for "empty of markets right now")

---

## 2. Kind and market model

- **Kind (H):** on-chain conditional-token decision markets ("futarchy") on a self-contained constant-product AMM, attached to a crowdfunding/treasury platform. Contracts: `MonetaFactory`, `Raise` (escrow), `ProjectToken`, `Treasury` (custody + futarchy engine), `ConditionalVault` (splits/redeems PASS/FAIL tokens), `MonetaAMM` (singleton x*y=k pools with lagging TWAP oracle), `MonetaRouter` (stateless helper). (docs `/docs`, README, `packages/contracts/src/`)
- **Market structure (H):** Each proposal splits part of the treasury-owned spot liquidity into two pools: `PASS-{TOKEN}/PASS-USDC` and `FAIL-{TOKEN}/FAIL-USDC`. Buying "PASS" with USDC = split USDC into PASS-USDC + FAIL-USDC, swap PASS-USDC for PASS-TOKEN, keep the leftover FAIL-USDC (it redeems 1:1 if FAIL wins). Winning conditional tokens redeem 1:1, losing ones are worth nothing. (docs, `MonetaRouter.buyOutcome` natspec)
- **Not binary-event, not scalar, not categorical in the usual sense.** The tradeable quantity is the price of the project token in each conditional world; the proposal outcome is binary (PASS/FAIL) but is decided by comparing two TWAPs, not by an external fact. (H)
- **Order book vs AMM (H):** AMM only. Singleton `MonetaAMM`, owner-only liquidity (only the Treasury can LP; ADR 0001 says third-party LPs and a Kuru CLOB listing are roadmap items). Anyone can swap and crank.
- **Tokenisation (H):** conditional ERC-20s (clone of `ConditionalToken`) per side, created by `ConditionalVault` against a `conditionId`; project token is an 18-decimals ERC-20 with EIP-2612 permit; quote is 6-decimals USDC. Prices are quote-raw per base-raw scaled by 1e36 (`PRICE_SCALE`). (`MonetaTypes.sol`)
- **Verdict formula (H, docs):**
  `TWAP = integral(observation dt over [tradingStart, tradingEnd]) / duration`
  `PASS iff twapPass * 10000 >= twapFail * (10000 + threshold_bps)`
  Default thresholds: 0 bps tranche releases, +1% other founder proposals, +3% everyone else. The "observation" is a lagging price that chases spot by at most `maxStepPerSecond` (bps of start price) per second (`LaggingOracle.sol`).
- **Concurrency (H, ADR 0004):** one active proposal per project, plus one queued Redemption; proposer posts a USDC bond (refunded on PASS, kept by treasury on FAIL).
- **Aggregator relevance:** the only comparable arbitrage is internal (PASS pool vs FAIL pool vs spot pool). Nothing maps to another venue's contract.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Monad Testnet, chain id 10143, RPC `https://testnet-rpc.monad.xyz`; ~300 ms blocks, ~600 ms finality; 1 s timestamp granularity | H (README, docs) |
| Collateral | Circle test USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3` (6 dec, permit v"2") and "Moneta Test USDC" mUSDC `0xa5c5fa04cF8b31F783f860D9aF779b172751580A` (open `mint`) | H (`deployments/10143.json`, ADR 0007) |
| Mainnet | ADR 0007: "Never deployed on mainnet [mUSDC]. Mainnet uses Circle USDC only." No mainnet addresses anywhere | H |
| Core contracts (testnet) | Factory `0xA1ED7688cB6F0576E7955483d8a35364Af01de06`; AMM `0xE21e8f9984f24fA8204DC822dCEBe96a8CB08F41`; Vault `0x694F10e57D385B1CbB692515Fd2A0Efd4302F7Cc`; Router `0x21eA0c029E925f6BD95f607a2CF8B2717638F4A9`. Raise/Treasury/ProjectToken addresses on the docs page are implementation (clone) templates; each project gets its own clones | H (README; the clone point is M inference from `raiseImpl/treasuryImpl/projectTokenImpl` key names) |
| Explorer | `https://testnet.monadvision.com/address/<addr>`; its API sits behind a Cloudflare challenge (403, `cf-mitigated: challenge`); I did not attempt to bypass | H |

---

## 4. Read API

- **Official/public API:** none documented as REST. Docs state "An indexer serves lists and history. Every gate and amount a user acts on is read directly from the chain. The page includes no API endpoint documentation." (H, `/docs`)
- **Indexer (Envio HyperIndex, hosted dev instance):** `https://indexer.dev.hyperindex.xyz/d179111/v1/graphql`, listed on `/status` (M, WebFetch summary of status page; the same shape is in repo `apps/indexer/config.cloud.yaml` which I did not read). Unauthenticated GET returns HTTP 200 with `{"errors":[{"message":"PersistedQueryNotSupported",...}]}` and headers `x-ratelimit-limit: 100, 100;w=60` (100 requests per 60 s), so ad-hoc queries need POST. I did not POST per the read-only ground rules. (H for the response and the rate-limit header; fixture `indexer_get_persisted_query_error_2026-10-19.json`)
  - This is a `d179111` dev deployment URL on `indexer.dev.hyperindex.xyz`: expect it to change or be recycled (M).
- **Schema (H, repo `apps/indexer/schema.graphql`, fixture saved):** entities `Protocol` (raiseCount, projectCount, proposalCount, verdictsPassed/Failed, `volumeQuote`, `totalRaised`), `Raise`, `Project` (spotPool, activeProposal, lastPrice, volumeQuote), `Proposal` (status QUEUED|ACTIVE|PASSED|FAILED|EXECUTED|CANCELLED, passPool/failPool, passToken/failToken, tradingStart/End, twapPass/twapFail, passed, volumeQuote, tradeCount), `Pool` (kind SPOT|PASS|FAIL, reserveBase/Quote, price, observation, feeBps, twapStart/End, closed, volumeQuote), `Swap`, `PricePoint`, `Candle` (60 s), `OutcomeTrade` (side PASS|FAIL, isBuy), `Position`, `TreasuryFlow`. Hasura-style fields are not confirmed because I could not run a query.
- **Direct chain reads (H, `MonetaAMM.sol`):** `getPool(poolId)`, `quote(poolId, baseIn, amountIn) -> (amountOut, fee)`, `spotPrice`, `observation`, `twap` (reverts `TwapNotReady` before `twapEnd`), `twapSoFar`, `poolCount`. Treasury: `proposal(id)`, `config()`, `nav()`. These require JSON-RPC (POST), so a chain-reading adapter is the realistic path, but it was not exercised.
- **Websocket / streaming:** NOT FOUND (searched: docs page, README, repo tree listing). Events are indexable from the chain (`Swap`, `ObservationUpdated`, `PoolCreated`).
- **Live response shape confirmed:** NO. The only live response I obtained is the GET error above. I did not save a market sample because none could be fetched without POST; saved fixtures are repo-source files (ABIs, schema, deployment book).

---

## 5. Trade path (programmatic)

- **Mechanism (H):** plain EVM transactions, no off-chain order signing, no API keys. `MonetaRouter.buyOutcome(treasury, id, pass, quoteIn, minOut, ...)` / `sellOutcome(treasury, id, pass, tokenIn, minQuoteOut)`, `swapSpot(...)`, `mergeAll`, `redeemAll`; `MonetaAMM.swap(poolId, baseIn, amountIn, minOut, to)` takes a slippage guard (`Slippage` revert). Router supports EIP-2612 permits (`PermitArgs`) so an approve+trade can be one tx. Every protocol action is permissionless (incl. `finalizeProposal`). (`MonetaRouter.sol`, `MonetaAMM.sol`, `incident-response.md`)
- **Quoting:** on-chain `quote()` per pool; the web UI re-quotes against the latest block at submit and offers 0.5/1/3/5% slippage (ADR 0008). With 300 ms blocks a quote goes stale quickly (ADR 0008 notes a 5%-per-bot-trade price move on ~$10/side pools).
- **Gas:** "Monad charges the gas limit, so transactions are simulated first and sent with 1.15x the estimated limit" (docs).
- **Bots:** repo ships `apps/bots` market makers and a keeper that finalizes proposals; they hold testnet funds only (H).

---

## 6. Reachable through PayBox?

**No (practically).** The mechanism is ordinary EVM contract calls that a smart-account/transaction-proposal flow could encode, but (a) the only deployment is Monad Testnet with valueless collateral, (b) I found no evidence in this repo's PayBox notes that Monad (mainnet or testnet) is a supported PayBox network (`grep -i monad` over `docs/research/*.md` and `docs/plan.md`: no hits), and (c) the chains in scope (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) do not host it. Cross-chain bridging into Monad is out of scope and unverified. (M)

---

## 7. Fees

| Fee | Formula / cap | Who pays | Tag |
|---|---|---|---|
| AMM swap fee | `fee = ceil(amountIn * feeBps / 10000)` charged on input; `amountOut = amountIn_afterFee * reserveOut / (reserveIn + amountIn_afterFee)`; cap `MAX_FEE_BPS = 100` (1%); deploy-script default `poolFeeBps = 30` (0.30%) | Trader; the fee stays in the pool, so it accrues to the treasury as sole LP | H (`CPMath.sol`, `MonetaAMM.sol`, `Deploy.s.sol`; live on-chain value not checked) |
| Protocol share of swap fee | `protocolFee = fee * protocolFeeShareBps / 10000`; cap `MAX_PROTOCOL_SHARE_BPS = 5000`; default 3333 (33.33%), sent to `feeRecipient` | Taken out of the swap fee | H (same sources) |
| Raise fee | `fee = accepted * raiseFeeBps / 10000`; cap `MAX_RAISE_FEE_BPS = 300` (3%); script default 100 (1%); "Below minimum: Full refunds, no fee" | Founder's raise (deducted from accepted funds) | H (`MonetaFactory.sol`, `Deploy.s.sol`, docs; docs state the rate is not given on the page) |
| Proposal bond | USDC, per-project `bond`; refunded on PASS, kept by treasury on FAIL | Proposer | H (ADR 0004) |
| Gas | MON on Monad testnet | Sender | H |

---

## 8. Resolution mechanism and dispute risk

- **Resolution (H, docs):** "Anyone can finalize after the window ends." Finalization resolves the markets, returns the winning side's liquidity to spot, settles the bond, and executes the action. If execution reverts, the verdict stands and can be retried until `executionGrace` ends. The outcome is a deterministic function of on-chain TWAPs; no oracle, no human reporter, no dispute window.
- **Dispute risk:** no dispute path exists by design. Risks named in the docs: Circle can freeze USDC for specific addresses; arbitrary-call proposals execute exactly as the calldata says; contracts are immutable with no trading pause (a bug cannot be paused; "new versions ship as a new factory"). Admin Safe can only allowlist quotes, set fees within caps, set bounds for new raises, and pause new raise creation. (H, docs/security model; `MonetaFactory.sol` natspec)
- **Manipulation:** TWAP over a multi-day window with a per-second step cap (docs say "multi-day trading window"; the exact `duration` is per-raise config). Thin testnet pools (~$10 per side in ADR 0008) make the verdict trivially movable. (H for design, M for "thin" in the live deployment)
- **Audit status:** repo has `docs/security/static-analysis.md` (Slither); no third-party audit found. NOT FOUND (searched: README, docs page, repo tree). (M)

---

## 9. Geo / ToS / automation

- **ToS, geo-blocking, API usage policy:** NOT FOUND (searched: site footer links, `/docs`, README, repo tree listing). The footer links are Explore/Create/Portfolio/Docs/Status and faucets only; no terms or privacy page link.
- **Automation:** the protocol is designed for permissionless keepers and bots (repo ships `apps/bots`; docs say anyone can finalize), so programmatic trading is architecturally allowed. (H)
- **Indexer rate limit:** 100 requests per 60 s on the hosted GraphQL endpoint (H, response header).

---

## 10. Liquidity

- **Volume / OI / TVL:** **NOT FOUND.** The `/status` counters did not render, `/explore` rendered no items, the indexer only answers POST, and the explorer API is behind a Cloudflare challenge. No DefiLlama or analytics page was read. As of 2026-10-19 there is no evidence of any non-faucet capital. (H for the sources I could and could not reach)
- **Scale hints (H, ADR 0007/0008):** Circle faucet gives 20 USDC per 2 h per address, "so testnet raises are small (tens of USDC)"; test markets are "~$10 per side"; mUSDC is open-mint. Any volume figure would be test money.
- **Shared liquidity with another venue:** none. Own singleton AMM, treasury-owned liquidity only; ADR 0001 lists a Kuru CLOB listing as roadmap. So it would be an independent leg, but there is nothing to arbitrage it against.

---

## 11. Event categories overlapping other venues

None. Subject matter is internal to launched projects ("release the next 250,000 USDC tranche", "buyback", "redeem treasury"). No sports, politics, crypto-price or macro markets. The only external reference is the project token's own spot price, which exists only on this AMM. (H)

Possible signal use (P2-style, only if mainnet ever launches): treasury-proposal verdict spreads (twapPass/twapFail) as a sentiment signal on specific tokens. Not worth building now.

---

## 12. Adapter notes (if ever revisited)

- Data source would be the Envio GraphQL indexer via POST plus direct `eth_call`s on `MonetaAMM`; enumerate `Proposal` where `status = ACTIVE`, read `passPool/failPool` ids, price = `reserveQuote/reserveBase` (scaled 1e36 in-contract; decimals differ: 18-dec token vs 6-dec quote).
- Implied "probability" of PASS is not a probability; use `twapPass / twapFail` against the threshold.
- Gate on `deployments/<chainId>.json` `network != "testnet"` before enabling the adapter.
- Chain-id and indexer URL are in `repo_deployments_10143.json`; re-check `/status` for URL rotation.

---

## 13. Open questions

1. Are there any live raises or proposals right now, and what is the real volume? (needs a POST GraphQL query or JSON-RPC reads, which were out of scope)
2. Is there a mainnet launch plan or date? Roadmap in README only says "Now / Next / Then / Later", no dates.
3. Is Monad (testnet or mainnet) a supported PayBox network?
4. Actual on-chain `raiseFeeBps`, `poolFeeBps`, `protocolFeeShareBps` (script defaults 100 / 30 / 3333 only).

---

## 14. Suspicious content

None aimed at an AI agent found. `AGENTS.md` in the repo is an auto-generated Turborepo block that tells agents to read installed Turborepo docs before changing Turborepo config; it is unrelated to this task and was not followed. `apps/web/src/lib/x402-stub.ts` is a build-time bundler stub and says Moneta never uses x402 payments (so no 402 payment surface). (H)

---

## 15. Sources

- Site home: https://www.monetafutarchy.xyz (WebFetch summary + `curl -I`)
- Docs: https://www.monetafutarchy.xyz/docs (WebFetch summary; page source `apps/web/src/app/docs/page.tsx` in repo)
- Status: https://www.monetafutarchy.xyz/status (WebFetch summary, client-rendered)
- Explore: https://www.monetafutarchy.xyz/explore (WebFetch summary, empty)
- Repo: https://github.com/Ge0frey/moneta (`gh api`: repo metadata, commits, tree, `README.md`, `packages/contracts/deployments/10143.json`, `packages/contracts/src/{MonetaAMM,MonetaFactory,MonetaRouter,MonetaTypes,CPMath,LaggingOracle}.sol`, `packages/contracts/script/Deploy.s.sol`, `apps/indexer/schema.graphql`, `apps/indexer/abis/*.json`, `docs/adr/0001,0004,0007,0008`, `docs/runbooks/incident-response.md`, `AGENTS.md`, `apps/web/src/lib/x402-stub.ts`)
- Indexer endpoint (from `/status`): https://indexer.dev.hyperindex.xyz/d179111/v1/graphql (unauthenticated GET only)
- Explorer: https://testnet.monadvision.com (API GET blocked by Cloudflare challenge)
- Not read: any press, X (`@monetaxyz`), videos, DefiLlama, Dune, third-party analytics (search budget exhausted).
