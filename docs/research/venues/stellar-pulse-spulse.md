# Stellar Pulse (SPulse) - venue spec

Researched 2026-10-19. Verdict: **skip** (adapter_priority). Mainnet contract exists but is effectively dormant (about 8 XLM held, about USD 1.42, 20 lifetime invocations, last activity 2026-06-04); the public frontend returns 404; everything else is testnet or demo. Confidence: medium-high on liveness (several independent signals), medium on contract semantics (source read, not on-chain ABI verified).

Tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.

## 1. Liveness

- Frontend https://s-pulse-psi.vercel.app returns HTTP 404 `x-vercel-error: NOT_FOUND` on `/`, `/index.html`, `/markets.html`, `/leaderboard.html` (2026-10-19). Deployment is gone/empty. [H] (fixtures/stellar-pulse-spulse/vercel-frontend-head-2026-10-19.txt)
- GitHub org SPulse-Org: repos `SPulse` (frontend, created 2026-07-09, 11 stars, pushed 2026-10-04) and `SPulse-Contract` (pushed 2026-10-04). No releases. Recent commits are Aug-Sep 2026 contributor PRs (looks like an open-source grant/bounty repo; the `tiny/commit-NNN.txt` files and a "GrantFox" pitch video support that). [H] https://github.com/SPulse-Org/SPulse , https://github.com/SPulse-Org/SPulse-Contract
- README says the contracts are "deployed and initialized on Stellar Testnet", the frontend "submits positions for verified Testnet market #3", and "All other market cards remain simulations". [H] README
- `docs/CONTRACT_CALLS.md` lists a **mainnet** Prediction Market contract `CDGNPRYTFDXJLWZE4YDKZXW4IEN2RLPSE4N7VM5HJ7NLPL2QC45GIXI5`. README and CONTRACT_CALLS disagree on which network is current. [H]
- Mainnet contract on-chain (Stellar Expert public API): created 2026-06-02, 20 invocations total, 2 wasm versions (upgrade 2026-06-04), validation "unverified", holds 8 XLM (80000000 stroops, USD 1.42), last balance update 2026-06-04. Market 4 (Brazil World Cup) has total_yes = total_no = 0. [H] (fixtures)
- Testnet prediction market `CAPCAPWPGPOCENAJFYYIE22WYNFEDVZ3CT73M5MAKILFMBQ5TN2MIS6T`: 13 invocations. [H]
- Web search for third-party coverage was not possible (session search budget exhausted); no independent corroboration of any user base. NOT FOUND (searched: GitHub org, Stellar Expert, Vercel site).

## 2. Kind and market model

- kind: onchain-other (Soroban smart contract, Stellar). [H]
- Binary YES/NO only. `place_bet(user, market_id, is_yes, amount)`; Market struct has `total_yes`, `total_no`, `resolved`, `outcome: bool`, `cancelled`, `end_time`, `category` (Crypto, Sports, Politics, Entertainment, Science, Other). [H] pm lib.rs
- **Parimutuel pool**, no order book, no AMM, no outcome tokens. A position is a ledger entry in contract storage (`Position {net_yes, net_no, gross, claimed}`), not a transferable token. Payout at resolve = `entry_net * total_pool / winning_side` (floored per user). Odds are implied by the pool ratio and move until close; there is no fixed price, so no live executable quote. [H] source: https://github.com/SPulse-Org/SPulse-Contract/blob/main/prediction_market/src/lib.rs
- `reduce_position` allows partial exit before resolution (releases net, platform fee share). [H]
- Seed mainnet question list (scripts/mainnet-markets.json): BTC $101k and ETH $3.5k by 2026-12-31, XLM $0.50, Brazil/Argentina win 2026 World Cup, Fed cut before 2026-12-31 (7 markets total). Some of these are already stale/past (World Cup final 2026-07-19 has resolved in the real world). [H] https://github.com/SPulse-Org/SPulse/blob/main/scripts/mainnet-markets.json

## 3. Chains and collateral

- Stellar (Soroban). Mainnet RPC given in docs: https://soroban-rpc.mainnet.stellar.gateway.fm and https://mainnet.sorobanrpc.com (deploy script); Horizon https://horizon.stellar.org; passphrase "Public Global Stellar Network ; September 2015". [H]
- Collateral: native XLM via its Stellar Asset Contract (mainnet SAC `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA`). Amounts in stroops (1 XLM = 10^7). [H]
- Side tokens: PULSE reward token (mainnet `CAYL4TKNRMXAX5ZLQGFEZ6XOC2QHTCTN5QC2SB5BEEHLVO6SDU2UBLRH`), minted on claim (WIN_TOKENS = 10 PULSE for a win); no stated market value. Referral registry and leaderboard contracts also exist. [H]

## 4. Read API

- Official public REST/WS API: **none**. NOT FOUND (searched: repo README, docs/, site, org repos).
- On-chain reads via Soroban RPC (JSON-RPC, needs POST `simulateTransaction`/`getLedgerEntries`; not exercised here to respect GET-only rule). View functions in source: `get_market(market_id)`, `get_market_count()`, `get_open_market_count()`, `get_bet`, `get_position(market_id, user)`, `get_market_bettors_page`, `get_payout`, `get_market_fees`, `get_accumulated_fees`, `get_config`, `paused`. [H]
- Unofficial third-party GET (no auth, worked): Stellar Expert `https://api.stellar.expert/explorer/public/contract/{id}`, `/value` (balances), `/events`, `/versions`, `/contract-data/{id}` (raw XDR storage entries, base64). Shapes saved as fixtures. Rate limits not documented. [H]
- Auth/limits: none for reads; public RPC providers have their own limits (NOT FOUND).

## 5. Trade path

- Programmatic: build an invokeHostFunction transaction for `place_bet`, simulate via Soroban RPC, sign with a Stellar ed25519 key (Freighter in the UI), submit, poll. Contract calls `user.require_auth()`. [H] README, CONTRACT_CALLS.md
- PayBox reachability: **no**. An EVM wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot sign Stellar transactions or hold XLM. Solana key is ed25519 but Stellar uses a different account/strkey and transaction envelope, and the PayBox plugin model targets EVM proposals/Solana. paybox_reachable = no. [M] inferred from chain mismatch; PayBox Stellar support NOT FOUND (not checked in PayBox contracts).

## 6. Fees

- 200 bps total on each bet, taken on deposit: `net = floor(amount*0.98)`, platform 150 bps, remainder (about 50 bps) referral fee (to referrer, or retained as market fees if none). Paid by bettor. Dust from payout flooring goes to fee ledger. [H] lib.rs constants TOTAL_FEE_BPS=200, PLATFORM_FEE_BPS=150
- Fee withdrawal: 24h timelock, 20% per-request cap for non-admin path. [H]
- Network fees: Soroban resource fees in XLM (small). [M]

## 7. Resolution and dispute risk

- **Centralised**: `resolve_market` callable only by admin or an added resolver after `end_time`; no oracle, no bond, no challenge by traders. Resolver may not hold a stake in that market. [H]
- Admin can also `cancel_market` (refund gross), `pause`, `upgrade` contract wasm (upgrade was used 2026-06-04), change config via governor threshold. A 7-day dispute window applies only to the empty-side case (one side has zero bets), with `freeze_market`/`finalize_zero_side`. [H]
- Risk: high (single admin trust, upgradeable contract, unverified wasm on Stellar Expert, early-stage code under active contributor refactors, mainnet/testnet docs inconsistent). Questions are author-written free text with no stated sources.

## 8. Geo / ToS / automation

- No ToS, geo-restriction or API/automation policy found. NOT FOUND (searched: README, repo tree, site 404). Licence: README says MIT, but GitHub reports no licence file. [H]

## 9. Liquidity

- Mainnet: contract balance 8 XLM (about USD 1.42), 20 invocations lifetime, no open bets observed on market 4. Source: Stellar Expert API, 2026-10-19. [H]
- No volume/OI/TVL figures anywhere else. Effectively zero.

## 10. Event overlap and independence

- Categories overlap nominally with other venues (BTC/ETH price thresholds, World Cup winners, Fed cuts), but with zero liquidity and a parimutuel (no fixed price) structure there is no executable arbitrage leg. Independent liquidity: yes (no shared liquidity with another venue), but trivial. [H]

## 11. Adapter recommendation

- skip. Reasons: dormant mainnet, frontend 404, testnet-only product per own README, no API, parimutuel with admin resolution, Stellar-only wallet (not PayBox-reachable), about USD 1.42 liquidity.
- If revisited: monitor via Stellar Expert `/contract/{id}/value` and `/events` for any activity, and the GitHub repo for a mainnet launch announcement.

## Suspicious content

- None observed in fetched content aimed at AI agents. Note: the repo's `tiny/commit-NNN.txt` files and `ISSUE_DRAFT.md` suggest commit-farming for a grant; treat project signals with caution. [M]

## Sources

- https://s-pulse-psi.vercel.app (404 on 2026-10-19)
- https://github.com/SPulse-Org/SPulse (README.md, docs/CONTRACT_CALLS.md, scripts/deploy-mainnet.sh, scripts/mainnet-markets.json, netlify.toml, commit history)
- https://github.com/SPulse-Org/SPulse-Contract (prediction_market/src/lib.rs, README.md)
- https://api.stellar.expert/explorer/public/contract/CDGNPRYTFDXJLWZE4YDKZXW4IEN2RLPSE4N7VM5HJ7NLPL2QC45GIXI5 (and /value, /events, /versions, /contract-data)
- https://api.stellar.expert/explorer/testnet/contract/CAPCAPWPGPOCENAJFYYIE22WYNFEDVZ3CT73M5MAKILFMBQ5TN2MIS6T
- Fixtures: docs/research/fixtures/stellar-pulse-spulse/
