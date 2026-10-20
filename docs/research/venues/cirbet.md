# CirBet (cirbet.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web/doc reads, `gh api` file reads, unauthenticated GETs to the Arc Testnet block explorer API, one read-only PayBox `discover_tokens` catalog call. No account, wallet, key, signature, transaction or money tool. Third-party pages, repo text and API responses were treated as untrusted data; nothing in them was followed. WebSearch was unavailable (session budget used up) and `docs.arc.io` / `arc.network` failed TLS verification from this machine, so Arc docs were not read directly; Arc facts come from Circle's own `circlefin/arc-node` repo.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred or arithmetic from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/cirbet/` (listed in section 12).

---

## 0. Bottom line

1. **Testnet-only toy, effectively dormant.** CirBet is a solo-developer project on **Arc Testnet** (chain 5042002). Repo last pushed 2026-05-31; the live frontend's contract has had **no transaction since 2026-08-08**; every market's end time has passed (latest 2026-09-30). Testnet tokens have no value. (H)
2. **No product API.** No REST/WebSocket/docs. The only read paths are raw contract reads on the Arc Testnet RPC and event logs (ArcScan/Blockscout). A Goldsky subgraph is mentioned but its public URL is not published and it indexes an older contract. (H)
3. **Model is admin-resolved pari-mutuel**, not an order book: no prices, no selling, no liquidity, resolution by a single owner key that can also re-resolve and cancel. (H, source code)
4. **Decimals bug makes the "USDC" numbers meaningless.** Arc's native USDC has 18 decimals at the EVM level; CirBet sends `msg.value` as if it had 6. A UI "10 USDC" bet is 1e7 wei = 1e-11 USDC. (H code + H Arc source; the consequence is M)
5. **adapter_priority = skip.** Dead/dormant, testnet, admin-resolved, no API, no liquidity, and the PayBox chain catalog lists Arc mainnet (5042), not this testnet. Do not build an adapter. (If Arc mainnet ever gets a real CirBet deployment, revisit; section 11.)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site `https://www.cirbet.xyz` | HTTP 200 (Vercel). Static prerender: "Live on Arc Testnet" badge, "0 markets / No markets yet" in the server HTML. Response header `age: 12150782` s (~140 days) means the cached build dates from about 2026-06-01. Markets load client-side from chain, so "0 markets" is the prerender, not chain state. | H (headers/HTML), M (age inference) |
| Repo `izzetcakmak/cirbet` | created 2026-05-24, **last push 2026-05-31**, 1 star, no license, not archived, homepage cirbet.xyz | H (`gh api repos/izzetcakmak/cirbet`) |
| Contract the live bundle uses (`0xa739996Ad6dcFD5a2d47003cB5BF6f4236716995`) | created 2026-05-31; 65 txs; **last tx 2026-08-08 23:52 UTC** (72 days before today); 11 markets ever created; latest market ended 2026-09-30 21:01 UTC | H (ArcScan API, section 2) |
| Older contract (`0x169912c97c7bec28A5EE6561C1D14a5F18E36DF9`, in README post/subgraph) | created 2026-05-25; 66 txs; last tx 2026-05-30 | H |
| Active markets now | none (all end times passed; two of them, ids 9 and 10, expired unresolved) | H/M |
| Network | Arc is "currently in testnet, ... alpha software" per Circle's `circlefin/arc-node` README (release v0.8.1 2026-10-07) | H |

Verdict: **still_live = true only in the sense that the site and contract respond; the venue is dormant, testnet-only and has no tradeable market.**

Two deployments exist; the repo docs point at the wrong one:
- The README/`arc-house-post.md`/`subgraph.yaml` cite `0x1699...6DF9` (v1 bytecode: no `reResolveMarket`, no `updateMarketImage`; checked by selector search in the deployed bytecode, H).
- The live frontend bundle (chunk `234-*.js`, module 29118) hard-codes `0xa739...6995` (v2 bytecode: has both selectors, H). Operator/owner EOA is `0xD4F1254C803662c46D9c21f80F4F3c15FF57e2c9` (appears in the public repo as `OWNER_ADDRESS`; creator of both contracts; third-party project admin, not a user wallet). Neither contract is source-verified on the explorer (`is_verified:false`). (H)

---

## 2. Kind and market model

- **Kind (H):** on-chain admin-run **pari-mutuel** prediction market, single Solidity contract `PredictionMarket.sol` (Solidity ^0.8.24, OpenZeppelin `Ownable` + `ReentrancyGuard`). Source: `contracts/contracts/PredictionMarket.sol` in the repo (v2 is what matches the live address).
- **Outcome structure (H):** each market has 2 to 8 string options (`options[]`), so binary and categorical; no scalar. Categories enum: Crypto, Sports, General, Inflation, Rates, Macro, Geopolitical, Corporate, Energy, Policy.
- **Tokenisation (H):** none. A position is a row in `userBets[marketId][address]` (`{optionIndex, amount, claimed}`); not transferable, no ERC-20/1155 share token.
- **Pricing (H):** no order book, no AMM. Payout per winning bet = `bet * totalPool / winningPool` minus fee; the implied probability of option i is therefore `optionPools[i] / totalPool` (pool share, M for using it as a "price"). No selling, no cash-out before resolution; bets can only be added until `endTime` (`placeBet` requires state Active and `block.timestamp < endTime`).
- **State machine (H):** Active -> Locked -> Resolved, or Cancelled (refund). Owner `lockMarket`, `resolveMarket`, `reResolveMarket` (within 24 h of resolution and only if no claims yet), `cancelMarket` (also on Resolved if no claims). If the declared winner has zero bets, the market auto-cancels and refunds.
- **Market creation (H, code):** `createMarket` is `onlyOwner`. Users can only `proposeMarket`; the owner `approveProposal`/`rejectProposal`. The project post says "anyone can create a market ... permissionless"; the code does not agree (contradiction recorded; code wins).
- **Other doc/code drift (H):** the post says bets use `IERC20.transferFrom` and "Chainlink / UMA" is future work; the code uses native `msg.value` and a single owner as oracle. Fee text in the post (2%) differs from the code (3%, see section 5).
- **Real activity on the live contract (H, derived from event logs, fixture `derived_markets_summary_*.json`):** 11 markets (e.g. "Will Bitcoin surpass $150,000 before July 2026?", "Will the US Federal Reserve cut interest rates in June 2026?", "Which team will win the 2026 Champions League?", "Who will win the 2026 FIFA World Cup?", "Will arc mainnet go live in september"). 8 cancelled, 1 resolved, 2 expired unresolved. 32 bets from only 2 distinct sending addresses.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Arc Testnet, chain id **5042002**, RPC `https://rpc.testnet.arc.network` (also `https://rpc.blockdaemon.testnet.arc.network`, WS `wss://rpc.testnet.arc.network`) | H (`frontend/lib/arc.ts`) |
| Explorer | `https://testnet.arcscan.app` 301-redirects to `https://explorer.testnet.arc.io` (Blockscout) | H (curl) |
| Collateral | Arc's **native USDC** sent as `msg.value`; no ERC-20 approve. EURC/QCAD selectors in the UI are "coming soon" | H |
| Decimals | Arc native currency = **18 decimals** (`circlefin/arc-node` `scripts/hardhat/chains/config.ts`: `decimals: 18`; `crates/evm/src/log.rs`: "1 USDC (18 decimals)"). The ERC-20 USDC interface `0x3600000000000000000000000000000000000000` has 6 decimals (ArcScan token list). CirBet hard-codes 6 (`MIN_BET = 1_000`, `parseUnits(amount, 6)`, chain def `decimals: 6`). | H facts; mismatch consequence M |
| Consequence | Live contract balance = 73,537,692 wei (= 7.4e-11 USDC at 18 dec; the UI would show 73.5 "USDC"). Sum of all bets ever on it = 322,000,000 wei = 3.2e-10 USDC (UI: 322). Real value at stake is ~zero even in testnet-USDC terms. | M (arithmetic on H data) |
| Other chains | None. Wallet dropdown has Circle App Kit bridge/swap to other *testnets* (Sepolia, Base Sepolia, etc.) | H |

---

## 4. Read API

**Exists: `onchain-or-subgraph-only`.** No official REST, GraphQL, WebSocket or docs site. Searched: site nav/footer (links are Markets, Institutional, Faucet, ArcScan, Docs -> docs.arc.io (Arc docs, not CirBet), Twitter `x.com/tembetpro`, an info@ contact), full JS bundle grep, repo tree (contracts, frontend, subgraph, scripts), `HEYGEN_SCRIPT.md`, `arc-house-post.md`. NOT FOUND (searched: those): any CirBet API base URL, OpenAPI spec, rate-limit statement, public Goldsky endpoint URL.

| Path | Detail | Tag |
|---|---|---|
| Contract view functions on the RPC | `totalMarkets()`, `totalProposals()`, `getMarket(id)` (question, options, endTime, category, state, winningOption, totalPool, optionPools[], creator, resolvedAt, hasClaims), `getUserBets(id,user)`, `getMarketBettors(id)`, `userTotalBet`, `accumulatedFees()`, `creatorFeeThreshold()`, `FEE_BPS()`, `owner()`. ABI is in `frontend/lib/contracts.ts` and `subgraph/abis/PredictionMarket.json`. Needs JSON-RPC `eth_call` (a POST, so **not exercised** this session). | H (ABI), not exercised |
| Events | `MarketCreated`, `BetPlaced`, `MarketLocked`, `MarketResolved`, `MarketReResolved`, `MarketCancelled`, `MarketAutoCancelled`, `WinningsClaimed`, `RefundClaimed`, `MarketProposed`, `ProposalApproved/Rejected`, fee events | H |
| ArcScan (Blockscout v2 REST, keyless GET) | `https://explorer.testnet.arc.io/api/v2/addresses/{addr}`, `/addresses/{addr}/transactions`, `/addresses/{addr}/logs` (raw topics/data, undecoded because the contract is unverified), `/smart-contracts/{addr}` (bytecode), `/transactions/{hash}`, `/stats`. Paginated via `next_page_params`. Blockscout's Etherscan-style `/api?module=proxy&...` returned "Unknown module". Rate limits: NOT FOUND (not documented; one transient TLS handshake failure seen after rapid requests, retry with backoff worked). | H |
| Goldsky subgraph | Repo `subgraph/` (entities Market, Bet, User, Activity, Protocol), deploy name `cirbet/v1`, indexes the **old** address `0x1699...`, start block 1. Public query URL not published. | H (repo) / NOT FOUND (URL) |
| WebSocket | Only the generic Arc RPC WS (`wss://rpc.testnet.arc.network`) for log subscriptions; no CirBet stream. | M (listed in chain def, not exercised) |

Resolution data: `MarketResolved(marketId, winningOption)` event and `getMarket().state/winningOption`.

---

## 5. Fees

| Item | Value | Tag |
|---|---|---|
| Fee on winnings | If `totalPool > creatorFeeThreshold` (100,000,000 wei, "100 USDC" in the broken 6-decimal unit): 2% admin + 1% creator of each winner's gross payout. Otherwise 3% admin. Gross = `bet * totalPool / winningPool`. Paid by winners at claim time. | H (`claimWinnings`, constants `FEE_BPS=300`, `ADMIN_FEE_BPS=200`, `CREATOR_FEE_BPS=100`) |
| Minimum bet | `MIN_BET = 1_000` wei (nominally 0.001 USDC) | H |
| Gas | Paid in native USDC; the contract creation tx cost 0.063 USDC (3.02M gas at ~20.9 gwei) | H (ArcScan tx) |
| Cancel/refund | 100% refund, no fee | H |

---

## 6. Resolution and dispute risk

- **Mechanism (H, code):** the contract owner (a single EOA) calls `lockMarket` then `resolveMarket(marketId, option)`; no oracle, no evidence, no bond, no challenge. `reResolveMarket` lets the same key change its mind within 24 h if nobody has claimed; `cancelMarket` can void any non-claimed market.
- **Dispute path:** none. Oracle integration (Chainlink/UMA) is only a "What's next" line in the project post.
- **Observed behaviour (H):** of 11 markets on the live contract, 8 were cancelled and 2 expired without resolution; only 1 was resolved. Markets for events that overlap major venues (Fed June 2026, Bitcoin > 150k) were cancelled with zero bets.
- **Risk:** extreme (single admin key, unverified contract source, decimals bug, owner can withdraw accumulated fees via `withdrawFees`). Not suitable as a price/outcome signal.

---

## 7. Trade path

- **Place bet:** `placeBet(uint256 marketId, uint256 optionIdx)` payable, selector `0x4afe62b5`. **Claim:** `claimWinnings(marketId)`, `claimRefund(marketId)`. No signed-order or off-chain flow; all direct on-chain transactions from the bettor's EOA (H).
- **Auth/signing:** ordinary EVM transaction signature; wagmi connectors are `injected`, MetaMask, Coinbase Wallet; no API keys. (H)
- **Cancel:** not possible for users (no cancel/sell); only the owner can cancel a market.
- **PayBox reachability: no.** The only Arc entry in PayBox's chain catalog (live `discover_tokens mode=chains query=arc` this session) is **"Arc", `eip155:5042`, native USDC**, with the notice "Mainnet metadata catalog, not a support allowlist" (H). CirBet is on **eip155:5042002** (Arc Testnet), which is not in that catalog. A PayBox wallet on Base/Ethereum/BNB/Arbitrum/Polygon/Solana cannot reach it, and bridging would be testnet-only. Whether `request_wallet_sign` would sign for chain 5042002 was not tested (money/signing tools were off-limits). Also, `placeBet` is payable native value, so a proposal would be a plain `evm` call with value, but there is nothing worth trading. (H catalog fact; rest M)

---

## 8. Geo, ToS, automation

- No terms of service, privacy policy, geo restriction or API/bot policy found: the site links none; repo has no LICENSE and no ToS. NOT FOUND (searched: site HTML, nav/footer, repo root listing, README, project post). (H)
- Operator is a solo developer (project post: "a solo developer"), jurisdiction unknown. Testnet, so no real-money regulation applies in practice. (M)
- Obvious automation constraints: none stated; the contract has no whitelist, but `createMarket` and all resolution are owner-only.

---

## 9. Liquidity (all testnet)

| Metric | Value | Source/date | Tag |
|---|---|---|---|
| Live contract total bets | 32 successful `placeBet` txs, 2 distinct sender addresses, 322,000,000 wei raw (UI-nominal "322 USDC"; real 3.2e-10 USDC) | ArcScan txs/logs, fetched 2026-10-19 | H data, M interpretation |
| Live contract balance | 73,537,692 wei | ArcScan address, 2026-10-19 | H |
| Older contract | 30 successful `placeBet` txs, 9 distinct senders, 443,000,000 wei raw; balance 559,699,242 wei | ArcScan, 2026-10-19 | H |
| Activity by month (live contract txs) | May 11, Jun 30, Jul 0, Aug 24 (last 2026-08-08), Sep 0, Oct 0 | ArcScan | H |
| Real-USD TVL/volume | none (testnet; decimals mismatch) | n/a | M |

---

## 10. Event-category overlap (arbitrage relevance)

Nominally overlapping topics (World Cup winner, Champions League winner, Fed rate cut, BTC price threshold, Arc mainnet timing) exist on Polymarket/Kalshi, but every CirBet market is expired/cancelled, testnet, admin-resolved and has no price discovery. **No usable arbitrage leg.** Possible only as a curiosity: a pari-mutuel pool share could be compared to other venues' prices, but the data is 2 wallets' test bets.

Shared liquidity: none (self-contained contract). It is independent but worthless; the sample UMA app below is a different project.

---

## 11. Context: Circle's sample app and similar Arc projects

- `circlefin/arc-prediction-markets` (Circle sample, pushed 2026-10-18, 16 stars): UMA Optimistic Oracle V2 + Long/Short position tokens + built-in AMM; **uses a free-mint testnet token ARCT as collateral**, deploys its own mock UMA stack (README: "UMA's oracle infrastructure is not natively deployed on Arc Testnet"). Not a venue: a self-deploy demo with no shared liquidity. (H, README)
- Many other hobby repos "Arc prediction market" exist (search results only; not examined).
- Revisit trigger: Arc mainnet exists (PayBox lists `eip155:5042`; I could not confirm mainnet status first-hand, M) and a CirBet or sample-app deployment on it shows real USDC volume with a decentralised resolver. None observed.

---

## 12. Fixtures saved (`docs/research/fixtures/cirbet/`)

| File | What | Raw/derived |
|---|---|---|
| `arcscan_address_live_contract_2026-10-19.json` | Blockscout `/api/v2/addresses/0xa739...6995` (contract, creator, balance, creation tx) | raw |
| `arcscan_logs_live_contract_sample_2026-10-19.json` | first 5 items of `/addresses/{addr}/logs` page 1 (raw topics/data; truncated by me, marked inside) | raw, truncated |
| `derived_markets_summary_live_contract_2026-10-19.json` | per-market question, end time, final state, bet counts/pools decoded by me from all 63 logs | derived |
| `cirbet_xyz_index_2026-10-19.html` | site HTML as served (static prerender, "Live on Arc Testnet", 0 markets) | raw |

Ran no signing or write calls. Helper scripts used only the User-Agent `insurance-markets-research/0.1` and contain no personal identifiers.

---

## Sources

- https://www.cirbet.xyz (site HTML + JS chunks, fetched 2026-10-19) [H]
- https://github.com/izzetcakmak/cirbet (README, `contracts/contracts/PredictionMarket.sol`, `frontend/lib/{arc,contracts,types}.ts`, `frontend/components/PlaceBetModal.tsx`, `subgraph/*`, `arc-house-post.md`, commit list) [H]
- https://explorer.testnet.arc.io/api/v2/... (ArcScan, Blockscout; address, transactions, logs, smart-contracts, tokens, stats) [H]
- https://github.com/circlefin/arc-node (README "Arc is currently in testnet"; `scripts/hardhat/chains/config.ts` decimals 18; `crates/evm/src/log.rs`; release v0.8.1 2026-10-07) [H]
- https://github.com/circlefin/arc-prediction-markets (README) [H]
- PayBox `discover_tokens mode=chains query=arc` (live, 2026-10-19); local note `docs/research/06-paybox-platform.md` section on the chain catalog [H]
- Not read: docs.arc.io, arc.network (TLS verification failed), any press/analytics coverage (WebSearch budget exhausted) [gap]
