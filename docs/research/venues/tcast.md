# tCast - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the landing page, `gh api` reads of the public `t-cast` GitHub org (README, docs, Solidity, one circuit, litepaper PDF), public unauthenticated GETs (tcast.xyz HTML and one static JS bundle, `api.tcast.xyz` probes, Routescan etherscan-compatible GET proxy for Avalanche Fuji and one mainnet code check). No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. The Fuji `eth_call`s were made through the explorer's GET proxy (not JSON-RPC POST). The bundle was only grepped for URLs/paths, never executed. Third-party text was treated as untrusted data; nothing in it was followed.

Research limits: the shared WebSearch budget ran out after ONE search (it found nothing about tCast), so there is no second discovery pass and no independent press/community coverage. `x.com/tCast_xyz` returned HTTP 402 to WebFetch; the payment requirement was not pursued (nothing paid). Telegram (`t.me/tCast_xyz`) was not fetched.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or my inference from first-hand data; **L** = weak or stale. All primary artefacts are dated 2026-01 to 2026-03, i.e. 7+ months old: possibly stale, but the on-chain and HTTP reads below are from today.

Fixtures (<= 50 KB each): `docs/research/fixtures/tcast/` (section 12).

---

## 0. Bottom line

1. **Testnet-only hackathon prototype, effectively dormant (H).** Contracts are deployed on **Avalanche Fuji (chain 43113)** with a **free-mint MockUSDC**; the repo says "Testnet only. Unaudited." and its own roadmap lists "Mainnet deployment, Real USDC, Any financial product" under **Not Planned for Testnet**. Last GitHub push 2026-03-07; last on-chain tx to the core contract 2026-03-09.
2. **Nothing tradable today (H).** All 7 markets ever created have passed their `endTime` (latest 2026-05-25); `insertBet` reverts after `endTime`, and new markets need an allowlisted relayer. 5 of the 7 are still unresolved months after they ended, so even the oracle/resolution path is abandoned.
3. **The "REST API" in the README is dead (H).** `https://api.tcast.xyz` answers `/health` -> `{"ok":true}` but every data route the frontend calls (`/markets`, `/markets/:id`, `/markets/:id/bet-leaves`, `/vault/leaves`, `/auth/me`) returns 404 today. `market.tcast.xyz` returns 502.
4. **Play money, not value (H).** `MockUSDC.mint(to, amount)` is callable by anyone. Total ever bet across all markets: 1,070 mock-USDC. No arbitrage against real venues is possible or meaningful.
5. **Not reachable for a PayBox agent (M/H).** Fuji is a testnet outside PayBox's mainnet chain catalog, and the trade path needs client-side Groth16 proof generation with private notes, which is not a transaction-proposal or signed-order flow.
6. **adapter_priority = skip.** Dead/dormant testnet, no working API, no real liquidity, no real-money mainnet. Revisit only if the team announces a mainnet (litepaper targeted Q3 2026; no evidence it happened).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://tcast.xyz/` | HTTP 200, static Vite/React SPA on Hostinger; `last-modified: Sun, 08 Mar 2026 11:45:56 GMT`; title "tCast"; description "Privacy-first prediction markets. Bet privately with ZK proofs." WebFetch sees only the title (client-rendered). | H |
| Frontend bundle `index-1QV_rBaV.js` | wagmi config is `chains:[Fuji]` only (id 43113, RPC `api.avax-test.network`, explorer snowtrace testnet); no mainnet chain is configured. Routes: `/`, `/explore`, `/create`, `/deposit`, `/account`, `/market/:id`, `/markets/:id/tickets`. No terms/geo text found in the bundle. | H |
| `GET https://api.tcast.xyz/health` | 200 `{"ok":true}` | H |
| `GET https://api.tcast.xyz/markets`, `/markets/1`, `/markets/0/bet-leaves`, `/vault/leaves`, `/auth/me`, `/api/markets`, `/stats`, `/docs`, `/openapi.json` | all 404 (Fastify `Route GET:... not found`) | H |
| `GET https://market.tcast.xyz/` | 502 Bad Gateway (nginx) | H |
| GitHub org `t-cast` | 2 repos: `tcast-testnet` (created and last pushed 2026-03-07, 0 stars, 1 commit, no license metadata) and `litepaper` (last push 2026-01-22). Nothing newer. | H |
| Core contract activity (Routescan GET) | 27 direct txs, first 2026-03-07T09:10Z, **last 2026-03-09T13:44Z** (10 deposit, 7 createMarket, 7 bet, 2 claim, 1 creation, 1 failed). Nothing in the 7 months since. Internal calls from other contracts not counted. | H |
| Markets | 7 created; every `endTime` is in the past; 5 unresolved (section 8). | H |
| Mainnet | Same address on Avalanche C-Chain 43114 has no code (weak: different deployer nonce would give a different address). GitHub search for related repos found only the two above. No mainnet announcement found (search budget spent). | L |

Verdict: **still_live = false** as a venue (web host and a health endpoint are up, but there is no open market, no working data API, and it is a testnet that says it will not go to real USDC).

---

## 2. Kind and market model

- **Kind:** onchain-other (privacy-pool / shielded-note prediction protocol), status testnet-beta. [H, README + contracts]
- **Market model:** parimutuel pool per market, **binary in practice**. `createMarket` accepts any `_outcomes.length > 1`, but the bet circuit asserts `betOutcome * (betOutcome - 1) === 0` (outcome must be 0 or 1). No order book, no price discovery, no secondary trading. [H, `contracts/tCast.sol`, `circuits/circuits/tCastBet.circom` line 80]
- **Outcome tokenisation:** none. A bet is an opaque commitment `H(betSecret, betAmount, betOutcome, marketId, betBlinding)` inserted into a per-market Merkle tree; the position exists only as a private note held by the bettor. Positions are not ERC-20/ERC-1155 and cannot be transferred or read. [H]
- **"Price"** is implied by pool ratios `outcomePool[0]` vs `outcomePool[1]` (public per market). Because it is parimutuel, the payout odds are not locked at bet time: final payout = `betAmount * totalPool / winningPool` after resolution. [H, `tCastAMM.sol`]
- **Design gap, noted not tested (M):** `bet()` takes `outcome` as a separate calldata argument; the bet proof's public signals are `[merkleRoot, nullifier, betCommitment, changeCommitment, marketId, betAmount]`, so the proof does not bind the calldata `outcome` that drives `outcomePool`. On-chain pool accounting could therefore differ from the committed outcomes. For an aggregator this means the pool ratio is not a trustworthy price even on a live deployment.
- **Deposit tiers:** fixed 10 / 100 / 500 / 1,000 / 10,000 (USDC, 6 decimals). Bet amounts in the circuit are whole-USDC units (`calcPayout(betAmount * 1e6)` at claim). [H]

## 3. Chains and collateral

- **Chain:** Avalanche Fuji testnet (43113) only. [H]
- **Collateral:** `MockUSDC` at `0x193BA95D6cAD82ca2d34C4e335518664A86c4523` (6 decimals, public `mint(to, amount)` with no access control). Zero monetary value. [H, README table + `contracts/mocks/MockUSDC.sol`]
- **Core addresses (Fuji, from README, spot-checked on-chain via `marketCount()` = 7):** tCast `0x0F9984f62121e29788139DA6c81EB4fd234f3063`; vault `0xCAe08D6A3a0493DE3B80bA621188614C42376871`; market impl `0x8572e494f3B76f56bBB2ccD4d9E51F9536e4BFAb`; optimistic oracle `0xBd41d8F2d5578574Dd95aD4De51E396eE4B5b113`. [H]
- Mainnet deployment: NOT FOUND.

## 4. Read API

| Field | Value |
|---|---|
| exists | **none working** (README advertises a Go indexer + REST API; the host is up but the routes are 404). On-chain reads work. Classification: `onchain-or-subgraph-only` for the schema enum is the closest, but only a Fuji testnet. |
| base URLs | `https://api.tcast.xyz` (Fastify; only `/health` works); `https://market.tcast.xyz` (502) |
| docs URL | none. Closest: `https://github.com/t-cast/tcast-testnet` (README and `docs/*.md`) |
| endpoints referenced by the frontend bundle (all 404 today) | `GET /markets`, `GET /markets/{id}`, `GET /markets/{id}/bet-leaves`, `GET /vault/leaves`, `GET /auth/nonce?address=`, `POST /auth/verify`, `GET /auth/me` (cookie session, SIWE-like) |
| auth | the frontend uses nonce + signature login with `credentials: "include"` cookies for the authenticated bits; no API keys documented |
| rate limits | NOT FOUND |
| websocket | NOT FOUND |
| on-chain read surface (works) | `tCast.marketCount()`, `markets(uint256)`; per-market `metadata()`, `startTime()`, `endTime()`, `totalPool()`, `outcomePool(uint256)`, `resolved()`, `winner()`, `outcomeCount()`, `outcomeList(uint256)`; events `MarketCreated`, `NoteDeposited`, `BetPlaced`, `Claimed`, `MarketResolved`. Public Fuji RPC `https://api.avax-test.network/ext/bc/C/rpc` (from the bundle; not called, since JSON-RPC is POST). |

Market `metadata` is either a free-text legacy string (markets 0, 2) or a JSON string `{title, event, category, warnings, createdBy: "ai-agent", version, createdAt}` (markets 1, 3-6). There is no structured resolution-source field: the resolution rule is a prose sentence. [H, `fixtures/tcast/fuji-markets-snapshot.json`]

## 5. Trade path

- **Programmatic placement is possible only on testnet and only with ZK proofs (H).** Flow per `docs/PRIVACY_FLOW.md`: (1) `deposit(bytes32 commitment, uint8 tier, address depositor)` pulls MockUSDC from `depositor` into the vault; (2) `bet(uint[2] pA, uint[2][2] pB, uint[2] pC, uint[6] pubSignals, uint256 outcome)` spends a vault note via a Groth16 proof (Circom, MiMC hash, depth-20 Merkle tree) and inserts a bet commitment; (3) after resolution `claim(...)` with a second proof pays to any `recipient`; (4) `withdraw(...)` exits unspent notes. Selectors: deposit `0x9407fdb7`, bet `0xfe8af043`, claim `0x3685b397`, withdraw `0xab5b9d45`, createMarket `0x0bd4fe63`.
- The caller needs the user's private note state (secret, blinding, leaf index) and a local prover; there is no order, no cancel, no signed-order API, no limit price.
- **Market creation** is `onlyRelayer` (allowlist managed by the owner); an AI (GPT-4) validation pipeline at the team's backend decides. Open creation "is not live on testnet". [H, `docs/ORACLE.md`]
- **Contract quirk worth knowing (M):** `deposit()` accepts an arbitrary `depositor` and calls `transferFrom(depositor, vault, amount)`, so any address with a MockUSDC allowance to the tCast contract can be pulled from by a third party. Irrelevant on testnet; relevant to why this is not production-grade ("unaudited" per README).

## 6. PayBox reachability

**paybox_reachable = no.** (a) Only Fuji (43113) is deployed; the project's PayBox chain catalog note (`docs/research/06-paybox-platform.md`, re-listed 2026-10-19 by that earlier session, M) shows 11 mainnets including Avalanche 43114 but no testnets, and calls itself "not a support allowlist". (b) Even on a supported chain, trading needs a locally generated Groth16 proof over private note secrets plus a fixed-tier shielded deposit, which a transaction proposal or signed-order primitive cannot express; the PayBox wallet would only be able to sign the final `bet()` call whose calldata a separate prover built. (c) The collateral is worthless MockUSDC, so there is nothing for a funded agent wallet to trade.

## 7. Fees

- **Protocol fee: 5% (`FEE_BPS = 500`) of the winning payout**, taken at claim time, paid by winners; sent to `feeRecipient`. `payout = betAmount * totalPool / winningPool`, `fee = payout * 500 / 10000`, `payout_after_fee = payout - fee`. [H, `tCastAMM.sol`, `tCast.claim`]
- No fee on deposit, bet or withdraw in the contracts. Gas on Fuji only.
- Creator fee share: "in progress / design only, contract integration pending". [H, README + ROADMAP]
- Doc inconsistency: `docs/PAYOUT_VS_PRIVACY.md` discusses an alternative formula `payout = betAmount + betAmount * netPool / totalPool` as a "fallback" if outcome were hidden; the code uses the first formula. [H]
- Effective cost vs benchmark venues: a 5% haircut on every winning payout is far above Polymarket/Kalshi taker costs, which alone would kill cross-venue arbitrage even if the venue were live.

## 8. Resolution mechanism and dispute risk

- **Mechanism:** `tCastOptimisticOracle` (propose, dispute, vote, finalize) with **500 mock-USDC bond** each side. Proposers and voters must be on the `TrustedAgents` allowlist, set by the owner; anyone can dispute. No dispute -> proposer gets the bond back and the market resolves. Disputed -> allowlisted agents vote (`proposerVotes >= disputerVotes` favours the proposer; ties go to the proposer); winner takes 1,000. If the disputer wins the oracle emits outcome `255`, which `tCastMarket.resolve()` would reject (`outcome < outcomeList.length`), and no resolution happens. [H, `contracts/oracle/tCastOptimisticOracle.sol`, `docs/ORACLE.md`]
- **Challenge window:** `CHALLENGE_WINDOW = 15 seconds` is a hard-coded constant in the repo (the "2 hours in production" text is only planned). No voting deadline. [H]
- **Who resolves:** the tCast team ("On testnet, resolution is handled manually by the tCast team"; agent set is centrally managed). "Decentralised AI oracle agents" are listed as in progress. [H, ORACLE.md]
- **Observed resolution record (H, on-chain read 2026-10-19):** of 7 markets, only markets 0 and 6 are resolved (both were short-dated and ended 2026-03-07/08; when they were resolved was not checked). Markets 1 (ETH >= 3000 by end of March 2026, ended 2026-03-29), 2, 3 (BTC >= 100k before 2026-05-25), 4 and 5 are all **unresolved long after `endTime`**. Funds in those pools (bets are in unresolved markets 1 and 2, 110 and 100 mock-USDC) are stuck until a team agent acts.
- **Dispute risk:** very high on any hypothetical mainnet (single operator, GPT-4 market validation, prose rules, binary-only, no void/refund path: there is no cancel or invalid-outcome refund in `tCastMarket`).
- Question quality: titles are loose demo-grade prose (e.g. "Will ETH gas fees go higher in the next 1.5 hours?" resolving "HIGH ... from current levels") with the AI validator's own `warnings` array sometimes non-empty (market 5: "end_time is before the extracted deadline"). [H, fixture]

## 9. Geo, ToS, automation

- Terms of service / geoblock / privacy policy: NOT FOUND (searched: landing page HTML, JS bundle for terms/restricted/jurisdiction strings, GitHub README/docs, litepaper). The site does not appear to publish a ToS.
- Disclaimers (quote sparingly): README: "These contracts are **unaudited**. Do not use in production. Testnet only." ROADMAP: "Not Planned for Testnet: Mainnet deployment; Real USDC; Any financial product."
- Automation rules / API ToS: NOT FOUND. Permissionless chain reads are unrestricted; the off-chain API is gated by SIWE-style cookie auth.
- Regulatory posture: the product is explicitly built so that "who bets and who wins stays private" (shielded pool, withdrawals to any address). A real-money mainnet of this design would raise sanctions/KYC/AML questions for any integrator; not assessable on testnet.

## 10. Liquidity (dated)

| Metric | Value | Source / date |
|---|---|---|
| Markets ever created | 7 | `marketCount()`, on-chain, 2026-10-19 [H] |
| Markets currently accepting bets | **0** (all past `endTime`) | on-chain, 2026-10-19 [H] |
| Sum of all `totalPool` ever (mock-USDC) | 1,070 (110 + 110 + 100 + 0 + 0 + 0 + 750) | `fixtures/tcast/fuji-markets-snapshot.json` [H] |
| Largest single pool | 750 mock-USDC (market 6: 300 on outcome 0 / 450 on outcome 1) | same [H] |
| Direct txs to core contract | 27 total; last 2026-03-09 | Routescan GET [H] |
| TVL / OI in real value | **0** (collateral is free-mint test token) | [H] |
| Volume (real) | 0 | [H] |

## 11. Event categories and overlap

- All 5 JSON-metadata markets are tagged `category: "Crypto/Finance"` and are short-dated crypto price or gas questions (ETH >= 3000 by end March 2026; BTC >= 100k before 2026-05-25; ETH gas higher in 1.5 h; SOL up in 2 h; ETH above 2000 in 30 min). The two legacy markets are crypto relative-performance questions (SOL vs ETH). [H]
- Sports, politics, macro: none. [H]
- Overlap with other venues: only in the generic sense that Polymarket/Kalshi list crypto-price markets; these tCast questions are bespoke, mostly intraday, and unresolved. No stable matching key exists, and there is no real money. Arbitrage potential: **none**.

## 12. Fixtures

Saved under `docs/research/fixtures/tcast/`:

- `api-health.json` - the one working API route (`/health`).
- `api-markets-404.json` - proof the documented-by-the-frontend `/markets` route is 404 today.
- `fuji-markets-snapshot.json` - all 7 markets with metadata, start/end times (unix + ISO), `totalPool`, per-outcome pools, `resolved`, `winner`; read via explorer GET proxy 2026-10-19 (sum 1,070; 2 resolved; 5 unresolved past end).
- `fuji-core-contract-txs-summary.json` - 27 direct txs by method with timestamps (input data and sender addresses dropped).

There is no live market-data endpoint, so no price/book fixture exists.

## 13. Shared liquidity

None. Self-contained shielded pool (own vault + per-market trees). Not a Polymarket/Kalshi mirror. Its isolated, near-zero, test-token liquidity means it could never be an independent arbitrage leg.

## 14. Adapter ranking

**skip.** Reasons: (1) testnet-only with a self-declared no-mainnet roadmap; (2) zero real liquidity; (3) the documented REST API is down, leaving only raw event decoding; (4) privacy design hides positions and has no order book, so there is nothing to quote; (5) centralised, unreliable resolution (5 of 7 markets stuck). Only conceivable value: a "signal-only" watch on the GitHub org for a mainnet announcement (litepaper roadmap said Q3 2026 mainnet; nothing found by 2026-10-19).

If a mainnet ever ships, the adapter would be an on-chain indexer (`MarketCreated`, `BetPlaced` outcome pools) because per-user positions are shielded; it would still not be tradable from a proposal-style wallet without a ZK prover.

## 15. NOT FOUND

- Terms of service, geo restrictions, automation policy (searched: landing HTML, JS bundle, GitHub README/docs, litepaper).
- Any working REST/WebSocket/GraphQL endpoint beyond `/health` (searched: 9 candidate routes on `api.tcast.xyz`, `market.tcast.xyz`).
- API docs, rate limits, OpenAPI spec.
- Mainnet contracts or announcement (searched: GitHub org + repo search, one explorer code check, one web search that returned nothing about tCast).
- Independent coverage, audit report, funding/hackathon result (WebSearch budget exhausted; X page returned HTTP 402).
- Live pricing, volume or TVL in real value (none exists).
- Fuji RPC JSON-RPC probing (not done: POST).

## 16. Suspicious content and handling

- No prompt-injection or AI-directed instructions found in the README, docs, contracts, circuit, litepaper text or the JS bundle.
- Third-party contact addresses appear in the README, Solidity headers and the litepaper (team emails). They are deliberately not reproduced here and nothing was sent to them.
- WebFetch of `x.com/tCast_xyz` returned HTTP 402 Payment Required; recorded as a payment-gated fetch, not pursued.
- All requests used the User-Agent `insurance-markets-research/0.1`. The one scripted read (`scratchpad` helper) was grepped for "@" before use; no personal identifier is in any request, note or fixture.

## Sources

1. https://tcast.xyz/ (HTML shell, headers, 2026-10-19) [H]
2. https://tcast.xyz/assets/index-1QV_rBaV.js (grepped for URLs and routes only) [H]
3. https://github.com/t-cast/tcast-testnet (README, `docs/ORACLE.md`, `docs/PAYOUT_VS_PRIVACY.md`, `docs/PRIVACY_FLOW.md`, `docs/ROADMAP.md`, `contracts/tCast.sol`, `contracts/market/tCastMarket.sol`, `contracts/market/tCastAMM.sol`, `contracts/oracle/tCastOptimisticOracle.sol`, `contracts/access/Auth.sol`, `contracts/mocks/MockUSDC.sol`, `circuits/circuits/tCastBet.circom`; repo created/pushed 2026-03-07) [H]
4. https://github.com/t-cast/litepaper (README and `tcast.litepaper.pdf`, January 2026; roadmap Q3 2026 mainnet; intent only) [H for text, L for plans]
5. https://api.tcast.xyz/health and probes of `/markets` etc. (2026-10-19) [H]
6. https://market.tcast.xyz/ (502, 2026-10-19) [H]
7. https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api (Fuji tx list and `eth_call` proxy, GET; 2026-10-19) [H]
8. https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api (`eth_getCode` at the Fuji address on mainnet: `0x`) [L as evidence of absence]
9. `docs/research/06-paybox-platform.md` in this repo (PayBox chain catalog, earlier session 2026-10-19) [M]
10. WebSearch "tCast tcast.xyz privacy prediction market Avalanche ZK Tychi Labs" (extended): no tCast results [M]
11. https://x.com/tCast_xyz (WebFetch: HTTP 402, not read) [-]
