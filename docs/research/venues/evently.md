# evently (evently.market, formerly Megamble) - venue adapter spec

Researched 2026-10-19. READ-ONLY: public docs pages (GitBook `.md` copies), unauthenticated GETs to DefiLlama's public API, the public MegaETH Blockscout API and the project's own domains, `gh api` raw file reads, and two read-only PayBox `discover_tokens` catalog queries. No account, wallet, key, signature, POST/PUT/DELETE, or money-moving PayBox tool was used. Third-party text was treated as untrusted data; nothing in it was followed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, or my inference from first-hand data; **L** = weak or stale.
Fixtures (real responses, all < 5 KB): `docs/research/fixtures/evently/` (listed in section 12).
Limitation: the shared WebSearch budget was exhausted when this task started, so I ran **no web searches** (no news, no X/Discord, no third-party coverage). Everything below comes from the project's own docs and from on-chain/API data.

---

## 0. Bottom line

1. **Not tradable. The prediction-market product has never launched.** The docs describe an LMSR + CLOB market on MegaETH, but `EventlyMarkets` is still "pending deployment / TBD" (H, docs), the Blockscout contract search for it is empty (H), the app at `evently.market` returns **HTTP 503 `DEPLOYMENT_PAUSED`** from Vercel (H, 2026-10-19), and DefiLlama shows $7 TVL and $0 all-time volume (H).
2. **What actually exists on-chain is a renamed 2026 click-timer game ("Megamble") plus a profiles contract**, and an unverified "V2 parimutuel" contract that emitted zero bets (H, Blockscout). Last on-chain product activity: 2026-04-07. The docs promised audits, beta and mainnet "Q2 2026"; it is now Q4 (H, docs vs date).
3. **adapter_priority = skip.** No public API, no deployed market contract, no liquidity, chain (MegaETH, id 4326) not in the PayBox chain catalog. Re-check only if the triggers in section 11 fire.

---

## 1. Is it still live (2026)?

| Evidence | Result | Tag |
|---|---|---|
| App domain | `GET https://evently.market/`, `/markets`, `/waitlist`, `/api/markets` all return **503**, header `x-vercel-error: DEPLOYMENT_PAUSED`, body "The deployment is currently unavailable" (2026-10-19 01:51-01:52 UTC; fixture `evently_market_root_headers_503_2026-10-19.txt`). A Vercel "paused" deployment means the project was paused by its owner/billing, not that DNS is broken. | H |
| Docs site | `https://docs.evently.market` (GitBook) is up. Space `updatedAt` 2026-06-20, git-sync `updatedAt` 2026-07-03; the Introduction page says "Last updated 2026-05-06" (page HTML, fetched 2026-10-19). So the docs are static for 3.5+ months. | H |
| Product status per docs | Getting Started: Bridge **Live**, Swap **Live**, **Prediction Markets = "Waitlist"** (https://docs.evently.market/overview/getting-started.md). | H |
| Markets contract | Docs: `EventlyMarkets` "pending deployment", address "TBD (pending deployment post professional audit)" in Introduction, Architecture, Audit Roadmap and Setup (`NEXT_PUBLIC_MARKETS_ADDRESS=TBD`). Blockscout `search?q=EventlyMarkets` returns `items: []`. | H |
| Roadmap slip | Audit Roadmap: "Professional audit - two independent firms: Scheduled Q2 2026", "EventlyMarkets mainnet live: Q2 2026". Still undeployed on 2026-10-19; no audit report published. | H |
| DefiLlama | Listing id 7504 "evently", category Prediction Market, chain MegaETH, `listedAt` 1772764658 = **2026-03-06**, `previousNames: ["Megamble"]`, `deadUrl: true`, `url: ""`. TVL **$7.23** on 2026-10-19 (peak $18 on 2026-03-17). Dexs/fees summary: 24h/7d/30d/all-time volume all **0**. (api.llama.fi, fixtures.) | H |
| What the TVL is | DefiLlama methodology: "TVL is the native ETH held in Megamble smart contracts (game pot, player credits, and referral balances)". The $7 is **0.003 ETH sitting in `EventlyProfiles`** (Blockscout `coin_balance` 3000000000000000 wei; DefiLlama token list shows ETH 0.003). | H |
| Team wallet still moves | Deployer/admin EOA (`0x21CbC9...5Da1`, named "Admin wallet" in docs) has 136 txs, latest 2026-09-23 = a plain 0.00075 ETH transfer to another EOA. No product call since 2026-06-09 (USDm `approve`) / 2026-04-14 (`recordSwap`). | H |

Verdict: **still_live = false** for the thing the discovery label describes ("fully on-chain LMSR prediction markets"). The domain is paused, the markets contract does not exist, and the only on-chain product traffic stopped in April 2026. The docs/bridge/swap pages are the only part still serving.

---

## 2. Kind and market model (as DOCUMENTED, not deployed)

- **Kind:** on-chain hybrid AMM + CLOB prediction market, "built natively on MegaETH" (H, https://docs.evently.market/overview/readme.md). Nothing of this is live.
- **Pricing (H, docs `product/prediction-markets.md`, `smart-contracts/markets.md`):** LMSR with fixed **b = 200 USDm**. Cost `C(q) = b ln(sum exp(q_i/b))`, price `P(i) = exp(q_i/b)/sum exp(q_j/b)`. Creator locks a subsidy `b ln(n)` (about 138.6 USDm for a binary market). Solvency invariant stated as `poolBalance + subsidyDeposited >= total winning shares`.
- **Depth implied by b=200 (my arithmetic on the documented formula, fees excluded) [M]:** moving a binary market from 50% to 60% costs about 44.6 USDm; 50% to 70% about 102 USDm. Even a launched market would be a few-hundred-dollar venue per market unless creators were allowed a bigger b (docs: b is a fixed constant).
- **Order matching (H):** BUY fills resting CLOB asks first (price-time priority), remainder goes to the LMSR AMM. SELL either `sellToAMM(marketId, optionIndex, shares, minUsdmOut)` or rests as a limit ask. Caps: 200 orders per (market, option, side), 10 active orders per address per market, min order value 1 USDm, min trade 0.001 shares.
- **Structure (H):** 2 to 4 options per market (so binary or categorical, no scalar), question <= 300 chars, betting window >= 1 hour. Market types: community (creator-whitelisted), "Official" (admin), **Imported Polymarket mirror** (needs Polymarket `conditionId`, 10 USDm fee, resolved by admin only), and **Oracle markets** (binary, Redstone price feed ETH/BTC/SOL/MEGA, strike with 8 decimals, auto-resolved).
- **Tokenisation (H):** each outcome is an **ERC-1155 share** (OpenZeppelin ERC-1155); 1 winning share redeems for exactly 1 USDm via `redeemWinnings(marketId)`. Losing shares burnable 24h after finalization. Contracts are **immutable** (no proxy).
- **Not what DefiLlama's adapter assumes:** the DefiLlama dimension adapter (`dexs/evently/index.ts`, H) targets `CONTRACT_V2 0x7c56aa11...d41a` and calls it "V2: parimutuel pools - 5% total fee (3% treasury + 2% creator)", reading `BetPlaced` / `MarketFinalized` events. That contradicts the docs (LMSR, 2.5%). Per Blockscout that address is **unverified**, has 65 txs (2026-03-09 to 2026-04-07), no token balance, and across all 63 logs it emitted **20 `MarketCancelled`** and 43 events of an unidentified topic (`0xef9877d1...`), **zero `BetPlaced` and zero `MarketFinalized`** (H, I computed the topic hashes with `cast keccak`). It is a failed/abandoned earlier iteration, not a live venue. Three more contracts deployed by the admin on 2026-03-09 have 0 transactions.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | **MegaETH mainnet, chain id 4326**; RPC `https://mainnet.megaeth.com/rpc`, WS `wss://mainnet.megaeth.com/ws`, explorer `https://megaeth.blockscout.com` (docs `developers/setup`, `architecture/overview`) | H |
| Collateral | **USDm** ("MegaUSD", symbol USDM, 18 decimals) `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7`, proxy to `xUSDOFTUpgradeable` (an LayerZero-style OFT). Blockscout 2026-10-19: 28,601 holders, circulating market cap about $16.3M. | H |
| Other deployed addresses | `EventlyProfiles v1.3` (Blockscout name `MegambleProfiles`) `0x9F0708145BCCD1F5B16F610cB8a75A63fA4A9a24`, 25 txs, last 2026-04-14. Legacy `Megamble` game `0x051B5a8B20F3e49E073Cf7A37F4fE2e5117Af3b6`, 42 txs, last 2026-04-07 (ABI: `clickDirect`, `claimWinnings`, `POT_PERCENT`, timers: a click-timer pot game, not a prediction market). | H |
| Markets contract | none deployed | H |
| Funding route | In-app LiFi bridge from 60+ chains to MegaETH and swap to USDm (docs). Those pages are on the paused app. | M |

---

## 4. Read API

**Exists = none.** NOT FOUND (searched: llms.txt index of all 40 docs pages, grep of the 15 core docs pages for `api/`, `graphql`, `subgraph`, `wss`, REST hosts; the paused app's `/api/markets`; DefiLlama; GitHub).

- Docs describe only an on-chain read surface (not deployed): views `getPrice`, `getImpliedPrices`, `quoteBuy(marketId, optionIndex, usdmNet)`, `quoteSell`, `getQuantities`, `getPoolBalance`, `getMarketInfo`, `getBidBook`, `getAskBook`, `getOrderInfo`, `getOracleConfig`; events include `OrderFilled`. Realtime via MegaETH WS `eth_subscribe` / `watchContractEvent`. All H as documentation, none testable.
- Market metadata and trade history live in a private Supabase (docs: "market metadata, user profiles, trade history cache"); no public endpoint or key is documented.
- The Setup and Pre-Audit docs pages point at `github.com/eventlymarket/evently` and `github.com/isonips/evently-docs`. Both return **404** to `gh api` (private or deleted), as does the `eventlymarket` GitHub user. So no readable source. H.
- Auth and rate limits for a read API: not applicable. (The only documented limits are the Pimlico paymaster limits, section 5.)

---

## 5. Trade path (planned design only)

- Documented write calls: `placeOrder(marketId, optionIndex, side, quantity, pricePerShare, minFill)` (price in USDm 18-dec, 0..1), `sellToAMM(...)`, `cancelOrder(orderId)`, `redeemWinnings(marketId)`, `claimCancelRefund`, plus USDm `approve`. Plain contract calls: an EOA with USDm and an approval could call them, so **no signed-order/off-chain order API exists**; execution is by on-chain transaction. H (docs).
- Access gates: **trader whitelist** during beta (invite code or waitlist approval); **creator whitelist** always. Admin can pause (72h auto-expiry), ban addresses and force-cancel orders. H (docs `smart-contracts/markets.md`).
- The official UI path is Privy embedded wallet -> ERC-4337 Kernel smart account -> Pimlico bundler/paymaster (gasless), plus 100-trade EIP-712 session-key delegations. Paymaster limits: 20 user ops/min/wallet, 1 ETH-equivalent/hour/wallet, spam block at 15 ops in 10 s. Direct EOA calls would not use these (my inference, M).
- Gas on MegaETH is near zero (docs show `maxFeePerGas` 1 gwei).
- Today: nothing to call, because the markets contract does not exist.

---

## 6. PayBox reachability

**paybox_reachable = no.**

- MegaETH (4326) is not in the PayBox chain catalog: `discover_tokens mode=chains query="megaeth"` and `query="4326"` both returned `total_count: 0` on 2026-10-19 (H). The project's own research (`docs/research/06-paybox-platform.md`, M for this purpose) records the live catalog as 11 chains: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. The tool notes the catalog is "not a support allowlist", so absence is evidence, not proof; whether an `evm` transaction proposal on `eip155:4326` would be simulated and signed is NOT FOUND (same note).
- USDm balance would have to be bridged to MegaETH first (LayerZero OFT / LiFi), which PayBox swap routing does not cover for this chain (M).
- Regardless of chain support there is no market contract to propose a transaction against.

---

## 7. Fees

- **Documented:** fixed **2.5% (250 bps) = 1% creator + 1% treasury + 0.5% resolver pool**, "not configurable" (hardcoded constants). Admin-created markets: creator share goes to treasury. Creator fees claimable only after finalization; confiscated to treasury on timeout cancellation. H (docs).
- **Not documented:** whether the 2.5% is taken on trade notional at execution (the `quoteBuy(..., usdmNet)` signature suggests fee comes off before the AMM, M) or on the pool at settlement; who bears it on sells. NOT FOUND (searched: product page, markets contract page, getting-started).
- **Other costs:** creator collateral 50 USDm + subsidy `b ln(n)`; Polymarket-import fee 10 USDm; dispute bond 50 USDm. No gas for sponsored calls.
- **Conflict:** DefiLlama's adapter describes a different (V2 parimutuel) scheme with 5% (3% + 2%) taken from the pool at finalization (H as to what the adapter says). Treat the 2.5% as unproven.
- Withdrawal/deposit fees: none documented.

---

## 8. Resolution and dispute risk

- **Mechanism (H, docs):** lifecycle Active -> BettingClosed -> Resolved -> [Disputed] -> Finalized (or Cancelled / Slashed). The **market creator** resolves by calling `resolveMarket(marketId, winningOption, evidenceHash)` (evidence hash is only a hash, not the evidence itself). For imported Polymarket mirrors only **admin** can resolve. A **24h dispute window** follows (+1h finalization buffer). Any address that traded can dispute with a 50 USDm bond (admin disputes free). A single `disputeResolver` address (separate from admin) calls `settleDispute(...)`. Successful disputers enter a monthly VRF lottery.
- **Oracle markets:** `resolveMarketWithOracle` is permissionless, uses Redstone pull-model signed prices (`redstone-primary-prod`, feeds ETH/BTC/SOL/MEGA). Docs disagree on signer threshold ("5-signer threshold" in the table vs "at least 3 signers" in the text and code sample). H as to what the docs say, discrepancy unresolved.
- **Cancellation:** markets with trading can only be cancelled after `resolutionDeadline`; then holders get a pro-rata refund of pool + subsidy. Admin can **slash** a market in any pre-final state (shareholders get pro-rata refund).
- **Risk assessment [M]:** high for an arbitrage leg. Resolution is by one creator or one admin/resolver address, not a decentralised oracle; imported mirrors can resolve differently from Polymarket (pure basis risk); admin multisig is "Gnosis Safe post-raise", "acknowledged for beta" (so a single admin wallet today); no professional audit published (docs claim 7 AI engines + 22 scanners, "29 tools", zero blocking findings; the docs' own AI-audit table lists GPT-4o and Gemini 1.5 Pro, older models than the page's other names, so the reports' dates are doubtful, L).

---

## 9. Geo, ToS and automation

- Geo restrictions: NOT FOUND (searched: all core docs pages; app unreachable so in-app terms could not be read).
- ToS / bot policy: NOT FOUND (no terms page in the docs index; app paused).
- Access: closed beta (invite/waitlist) for traders, hand-approved creators. Docs state trading becomes "open to all" at public launch (H as docs claim; launch has not happened).
- Automation: nothing stated. Contract is "ERC-4337 and smart-contract-wallet compatible, no `tx.origin`/EOA checks" (H, docs), so programmatic callers are technically fine once deployed.

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL | **$7.23** (0.003 ETH) | DefiLlama `currentChainTvls`, 2026-10-19; peak $18 on 2026-03-17 | H |
| Volume 24h / 7d / 30d / all-time | **0 / 0 / 0 / 0** | `api.llama.fi/summary/dexs/evently`, 2026-10-19 | H |
| Fees | 0 | `summary/fees/evently`, 2026-10-19 | H |
| Open interest | none (no market contract) | Blockscout, 2026-10-19 | H |
| USDm held by V2 contract | 0 (no token balances) | Blockscout `token-balances`, 2026-10-19 | H |

---

## 11. Overlap, shared liquidity, and arbitrage relevance

- **Planned categories (H, docs):** Crypto (price targets, DeFi TVL), Politics, Fun, Technology, Business, Science, World/macro, Entertainment, Pop Culture. Overlap with other venues would be crypto-price (Redstone oracle markets on ETH/BTC/SOL/MEGA) and Polymarket-mirrored events.
- **Shared liquidity:** none. Evently prices come from its own LMSR; Polymarket odds are **displayed for comparison only** via the Gamma and CLOB-history APIs ("evently prices are set independently by the LMSR AMM", H). If it ever launched it would be an independent leg, but only a few hundred dollars deep per market (section 2), with creator/admin resolution risk and mirror basis risk.
- **Arbitrage relevance today:** zero.
- **Signal value today:** zero (no prices exist).
- **Revisit triggers:** (a) docs list a real `EventlyMarkets` address and Blockscout shows it verified; (b) `evently.market` stops returning `DEPLOYMENT_PAUSED`; (c) DefiLlama volume or TVL is non-trivial; (d) a public API or subgraph is documented; (e) MegaETH appears in the PayBox chain catalog.

---

## 12. Fixtures saved (`docs/research/fixtures/evently/`)

| File | What it shows |
|---|---|
| `evently_market_root_headers_503_2026-10-19.txt` | Vercel `DEPLOYMENT_PAUSED` response headers |
| `defillama_protocol_evently_2026-10-19_trimmed.json` | DefiLlama listing metadata, TVL points (trimmed from 228 daily points) |
| `defillama_dexs_summary_evently_2026-10-19.json` | Volume/fees summary (all zero) and the adapter methodology text |
| `docs_llms_txt_2026-10-19.txt` | Docs page index (40 pages) |
| `blockscout_address_EventlyProfiles_2026-10-19.json` | Profiles contract (verified, `MegambleProfiles`) |
| `blockscout_address_v2_parimutuel_unverified_2026-10-19.json`, `blockscout_counters_v2_2026-10-19.json` | The abandoned V2 contract DefiLlama points at |
| `blockscout_search_EventlyMarkets_empty_2026-10-19.json` | Empty search result for the markets contract |

---

## 13. NOT FOUND / open questions

- Public read API, subgraph, WS feed for markets: NOT FOUND (searched docs index, 15 docs pages, app API path, DefiLlama, GitHub).
- ToS, geo restrictions, bot policy: NOT FOUND (no page; app paused).
- Fee base (notional vs pool) and who bears it: NOT FOUND.
- Why the app is paused, and whether the team intends to ship: NOT FOUND (no web search possible this session; X account `@eventlymarket` and the Discord were not read).
- Whether PayBox would sign an `eip155:4326` proposal: NOT FOUND (needs a human test).
- Which contract emitted the 43 unidentified `0xef9877d1...` events on the V2 address: unknown (unverified source; probably market creation, L).
- GitHub repos `eventlymarket/evently` and `isonips/evently-docs` are unreadable (404): code and audit reports cannot be checked.

---

## Sources

- https://defillama.com/protocol/evently (WebFetch: HTTP 403); data read instead from https://api.llama.fi/protocol/evently, https://api.llama.fi/summary/dexs/evently, https://api.llama.fi/summary/fees/evently (2026-10-19) [H]
- https://github.com/DefiLlama/dimension-adapters/blob/main/dexs/evently/index.ts (via `gh api`, 2026-10-19) [H]
- https://docs.evently.market (Introduction), https://docs.evently.market/llms.txt, and `.md` pages: overview/readme, overview/getting-started, product/prediction-markets, product/swap-and-bridge, smart-contracts/architecture, smart-contracts/markets, smart-contracts/profiles, architecture/overview, developers/setup, developers/frontend, developers/ux-upgrade, developers/oracle-vrf, security/overview, security/audit-roadmap, security/pre-audit (all fetched 2026-10-19) [H]
- https://evently.market (503 `DEPLOYMENT_PAUSED`, 2026-10-19) [H]
- https://megaeth.blockscout.com/api/v2 (addresses, counters, transactions, logs, search, tokens; 2026-10-19) [H]
- PayBox `discover_tokens` (mode=chains, queries "megaeth" and "4326"), 2026-10-19 [H]
- `docs/research/06-paybox-platform.md` (project notes, chain catalog and unsupported-chain proposal behaviour) [M]
- Unrelated hits ignored: `evently.fun` is an event-photo app ("Evently | Great Memories, Made Easy"), `evently.xyz` is a parked-domain lander; neither is this project.
