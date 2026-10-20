# Polaris (Stellar) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the public site, `gh api` reads of the three PolarisQ-xyz repos (README, config, contract and math sources), and public unauthenticated GETs to the project's own API host. No accounts, wallets, keys, POSTs or signing. WebSearch was NOT available (the shared budget was exhausted), so there is no independent third-party coverage; everything below is first-party project material.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/polaris-stellar/` (section 11).

---

## 0. Bottom line

1. **Live: yes, as a testnet demo (H).** The site and the API both respond today, and a new market was created on 2026-10-18. Every contract is on Stellar TESTNET with free Friendbot XLM as collateral. It is not a real-money venue.
2. **Zero organic trading (H).** I read the on-chain state of all 16 markets the API tracks. In every one `totalSupply == initialLiquidity`, so nothing has ever been bought beyond the operator's own seed. The open market is exactly 50/50 and still charges the maximum fee.
3. **Only one market type exists (H).** XLM/USD above a strike at expiry, rolled daily by a bot. No sports, politics or macro, so there is nothing to arbitrage against other venues' event sets.
4. **Public REST read API exists, undocumented as a product (H).** It is the project's own backend (`polaris-oracle.fly.dev`), not an on-chain indexer. It is fine for reads, but it has no order book or trade history.
5. **Oracle is a testnet placeholder (H).** Feed id 100 is a made-up Pyth Lazer id, the Lazer verifier is a mock, and the live deployment has no Lazer subscription. Settlement runs through Reflector's testnet oracle instead.
6. **adapter_priority = skip.** The venue is a hackathon-grade testnet demo with no money, no volume, one crypto-price market series, and an unaudited codebase that says so itself. At most revisit it if it launches on mainnet.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://polaris-frontend-delta.vercel.app/` | HTTP 200, Next.js shell. WebFetch of the page showed "Loading markets..." (client-rendered). Nav: Markets, Perpetuals, Portfolio, Docs; sign in with passkey or email. | H |
| `GET https://polaris-frontend-delta.vercel.app/docs` | HTTP 200, 17 KB. `/api/markets` and `/robots.txt` return 404. | H |
| `GET https://polaris-oracle.fly.dev/markets` (2026-10-19 05:11 UTC) | HTTP 200 JSON, 16 tracked markets; newest `createdAt` 1792335377662 = 2026-10-18 14:56 UTC. One market `watching` (open), expiring 2026-10-19 14:55 UTC. | H |
| Repo dates | `polaris-contracts` created 2026-10-08, pushed 2026-10-08; `polaris-oracle` and `polaris-frontend` the same day, last pushes 2026-10-08. The org profile README was added 2026-10-08. | H (`gh api repos/PolarisQ-xyz/...`) |
| Age | The project is 11 days old. Nothing here is older than 6 months. | H |
| Repo ownership oddity | Some README badges and links point to `only1dreamgene/...` rather than `PolarisQ-xyz/...`, so the repos were probably moved or renamed from a personal account. | M |

Verdict: **still_live = true**, but only as a testnet demo.

---

## 2. Kind and market model

- **Kind:** on-chain AMM prediction market on Stellar Soroban. It is a Conditional-Token-Framework style design with a constant-product (x*y=k) AMM between YES and NO, not an order book and not parimutuel. (H; contracts README, https://github.com/PolarisQ-xyz/polaris-contracts "Core mechanism" and "Why not the original parimutuel design".)
- **Market type:** binary only. "Bet YES or NO on whether XLM/USD will be at or above a strike price at a fixed expiry." YES wins if `price >= strike` (inclusive). (H; frontend `/docs` page and `contracts/market/src/lib.rs`.)
- **Tokenisation:** shares are internal ledger entries inside each market contract (`split`, `merge`, `transfer`). They are NOT SEP-41 tokens, so they cannot be traded in other Stellar DEXes or wallets. (H; README: "Shares are internal ledger entries on the market contract itself, not a separate SEP-41 token contract per side.")
- **One contract per market.** Each market is its own deployed contract instance, created by the backend. (H.)
- **Perpetuals:** a second contract type, "no-expiry, no-leverage" continuous trading. `GET /perpetuals` returns `[]` today, so none exist right now. (H.)
- **Market catalogue:** the factory bot creates markets only from `FEED_CATALOG`, whose default is a single entry `{feedId:100, symbol:'XLM/USD'}`. All 16 live markets use feedId 100. Strikes are integer US cents (18 to 22 cents observed), so the resolution granularity is crude. (H; `src/config/configuration.ts`, API list.)
- **Cadence:** one round per roughly 24 hours (expiry minus creation about 86,370 s), rolled automatically. (H, computed from the fixture.)

---

## 3. Chains and collateral

- **Chain:** Stellar **testnet** (`https://soroban-testnet.stellar.org`, passphrase "Test SDF Network ; September 2015"). (H; `configuration.ts` defaults and contracts README "Live on testnet".)
- **Collateral:** native XLM via its Stellar Asset Contract. Testnet XLM from Friendbot or the faucet (500 XLM per call, 3 per hour per address) has no value. (H; `oracle` README "Why native XLM, no custom test token", `faucetAmountStroops` 5000000000.)
- **Mainnet:** NOT FOUND. No mainnet contract address or deployment instructions have been announced. The README says the mocks "Never deploy to mainnet" and that the smart wallet "should not hold real value".
- **Seed liquidity:** each market is seeded by the operator's capital-efficiency vault, 1,000,000,000 stroops (100 XLM) per market. (H; API `/markets/:id/state`.)

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official? | Yes, as the project backend's own REST API, listed in the oracle README "API reference". It is not versioned and carries no stability promise. | H |
| Docs URL | https://github.com/PolarisQ-xyz/polaris-oracle#api-reference (README only; the site `/docs` page describes mechanics, not the API). | H |
| Base URL | `https://polaris-oracle.fly.dev` (Fly.io, Singapore edge `sin` in response ID). | H |
| Auth | None for GETs. Admin routes need an `x-admin-key` header (not attempted). | H |
| Rate limits | NOT FOUND for reads (searched: oracle README, `main.ts`; no throttler is configured and no `RateLimit` headers were returned). Known limits: faucet 3/hour/address; `POST /wallets/deploy` rate-limited per IP. | H |
| CORS | Allowlist-only; unset `CORS_ORIGINS` rejects cross-origin browsers. A server-side adapter is unaffected. | H |
| Websocket | None found. The only WebSocket in the stack is the backend's own outbound Pyth Lazer feed. | H |
| Pagination | None; `/markets` returns every tracked market (16 today, 4.8 KB), so it will grow without bound. | H |
| Historical trades | NOT FOUND. The frontend README states "This build doesn't index historical trades." On-chain contract events (`buy`, `sell`) are the only trade record. | H |

Key endpoints (all GET, unauthenticated):

| Endpoint | Returns |
|---|---|
| `/markets` | array of `{contractId, strikePriceCents, expiry, gracePeriodSecs, feedId, status, settleTxHash?, createdAt, updatedAt}` |
| `/markets?feedId=` | the same, filtered to one feed |
| `/markets/:id` | the same, one market |
| `/markets/:id/state` | live on-chain state: `status` (`Open`/`ResolvedYes`/`ResolvedNo`/`Cancelled`), `poolYes`, `poolNo`, `totalSupply`, `initialLiquidity`, `baseFeeBps`, `minFeeBps`, `collateral`, `treasury`, `finalPrice`, `strikePrice`, `expiry` |
| `/markets/:id/price` | `{yesBps, noBps, yesBpsChange}` (change is vs the recorded odds snapshot) |
| `/markets/:id/fee` | `{feeBps}` |
| `/markets/:id/position?address=` | a wallet's YES/NO shares |
| `/perpetuals`, `/perpetuals/:id/{state,price,fee,position}` | same shapes for perpetuals |
| `/prices/:feedId` | proxies Pyth Hermes. Currently broken: returns HTTP 503 `Hermes price lookup failed: 401` (the oracle README's bug list documents Pyth Hermes price endpoints now returning 401). |

Alternative read path (M, not exercised): query the Soroban RPC directly for each market contract's `get_market`, `get_price`, `get_fee`, `get_position`. These exist in `contracts/market/src/lib.rs` (H, source). Contract events are published for `buy`, `sell` etc. Because there is no indexer, an aggregator would need to poll `/markets` for the contract list and then RPC or `/state` per market.

Observed response shapes (H, 2026-10-19):

```
GET /markets/<open>/state
{"admin":"G...","collateral":"C...","strikePrice":"18","expiry":"1792421747","gracePeriod":"3600",
 "lazerContract":"C...","feedId":100,"baseFeeBps":100,"minFeeBps":20,"treasury":"C...",
 "status":"Open","finalPrice":"0","poolYes":"1000000000","poolNo":"1000000000",
 "totalSupply":"1000000000","initialLiquidity":"1000000000"}
GET /markets/<open>/price -> {"yesBps":5000,"noBps":5000,"yesBpsChange":0}
GET /markets/<open>/fee   -> {"feeBps":100}
```

---

## 5. Trade path

- **Direct on-chain:** `buy(user, prediction, collateral_amount, min_shares_out)`, `sell(user, prediction, shares_in, min_collateral_out)`, `split`, `merge`, `transfer`, `redeem(user)`. Each calls `user.require_auth()`, so the caller signs a Soroban authorization entry with a Stellar key (ed25519 G-account) or a custom account. (H; `contracts/market/src/lib.rs`.)
- **Passkey smart wallet:** a WebAuthn (secp256r1) custom account, deployed through a factory. The backend sponsors fees through a two-step relay: `POST /wallets/tx/prepare` then `POST /wallets/tx/submit`. (H; oracle README.) This is designed for a browser passkey; a headless agent cannot use it.
- **Email wallet:** `POST /auth/email/trade` uses a backend-held custodial key behind an emailed login code and a session cookie. (H.) It is custodial and not suitable for automation.
- **Programmatic trading by an aggregator:** possible only by holding a Stellar ed25519 key and submitting Soroban transactions to testnet. No official SDK, bot API or order endpoint exists. There is no off-chain order matching: you trade against the AMM reserves.
- **Slippage controls:** `min_shares_out` / `min_collateral_out`, and a hard "pool depth" guard that rejects any trade that would consume half or more of the reserve. (H.)

---

## 6. PayBox reachability

`paybox_reachable = no`. Reasons:

1. **Wrong key type and chain family.** Polaris trades require a Stellar (ed25519 / Soroban auth entry) signer. PayBox wallets on Base, Ethereum, BNB, Arbitrum and Polygon are secp256k1 EVM accounts; Solana is ed25519 but is a different account and transaction format than Stellar. No EVM transaction proposal can call a Soroban contract. (M; inferred from PayBox's documented chain list in the task text and Soroban's design. I did not check whether PayBox has any Stellar support, and made no PayBox calls.)
2. **No bridge or collateral.** Collateral is testnet XLM, which cannot be funded from any mainnet balance.
3. **No signed-order scheme to forward.** There is no off-chain order book or EIP-712 order: only on-chain calls.

---

## 7. Fees

(H; `contracts/ctf-math/src/lib.rs`, `contracts/market/src/lib.rs`.)

- **Formula:** `effective_fee_bps = min_fee_bps + (base_fee_bps - min_fee_bps) * initial_liquidity / total_supply`. Live markets use `base = 100` bps (1%) and `min = 20` bps (0.2%). The ceiling is 1000 bps (10%).
- **Who pays:** the trader. On `buy` the fee is taken off the amount that gets swapped (`apply_fee(collateral_amount, fee)`); on `sell` it is taken off `shares_in`. The fee stays in the pool, so there is no separate fee transfer. The operator's treasury (the vault) is the LP, so the fee accrues to the operator-funded pool.
- **Current fee:** 100 bps on the open market, because `total_supply == initial_liquidity`; fees only decay as volume grows, and there has been none.
- **Network fee:** sponsored by the backend for passkey and email wallets; a direct Stellar signer pays its own testnet fee.
- **Withdrawal/settlement fee:** none found.

Pricing: `yes_bps = pool_no * 10000 / (pool_yes + pool_no)` (H, `get_price`). Depth limit: a single trade must take less than half of the drawn-from reserve. With 100 XLM per side that caps a trade size at roughly 50 XLM of testnet money.

---

## 8. Resolution and dispute risk

- **Mechanism:** permissionless `settle(payload)` after expiry verifies a signed Pyth Lazer price on-chain (within +/-5 minutes of expiry) and requires Reflector Network (SEP-40) to agree within a tolerance (default 150 bps). Optional third leg RedStone, mainnet only. (H; contracts README.)
- **What is actually live:** the live backend has no `PYTH_LAZER_TOKEN` (Lazer is $500/month), and the testnet "Lazer" contract is a mock. The deployment therefore uses `settle_via_reflector()`, which reads Reflector's testnet XLM price directly as the reference. The Lazer feed id 100 is described in source as an "unverified testnet placeholder". (H; oracle README live-deployment note, `configuration.ts` comments.)
- **Granularity:** the price becomes integer US cents, so for XLM near 18-22 cents one cent is about 5 percent. The moves between rounds would be decided by rounding.
- **Failure behaviour:** if neither path works, anyone can call `cancel()` after `expiry + grace_period` (3600 s); on cancel each share pays 0.5. Observed outcomes among the 15 finished markets: 9 settled, 6 cancelled. That is a 40 percent cancel rate in practice, so the liveness backstop fires often. (H, API.)
- **Doc inconsistency:** the website docs say cancelled markets pay "1:1" on both sides; the contract and README pay 0.5 per share. The contract is authoritative. (H.)
- **Dispute process:** none. There is no human dispute layer. Admin keys can create, settle and cancel through the backend, and the vault admin has no rotation function. (H.)
- **Audit status:** none. The README says the passkey code is "demo material only... not audited" and "should not hold real value". (H.)

---

## 9. Geo / ToS / automation

- No terms of service, privacy policy or geo-block was found on the pages and repos I read (NOT FOUND; searched: landing page via WebFetch, `/docs`, the three READMEs, `profile/README.md`). Licence: MIT on all three repos (H, LICENSE files listed).
- Automation of reads is not restricted anywhere I could find. The only stated abuse controls are the faucet and wallet-deploy rate limits. Testnet only, so no regulated activity.

---

## 10. Liquidity and overlap

- **Liquidity (H, API, 2026-10-19):** the open market holds 100 XLM (testnet, valueless) in each side, a pure operator seed. All 16 markets have `totalSupply == initialLiquidity`, meaning no user has traded. One older market was seeded with 1,000 XLM, one with 10 XLM. Real-money TVL or volume: **zero** (testnet).
- **Overlap with other venues:** the only conceivable overlap is the "XLM above $X on date" kind of crypto price question that Polymarket-style venues sometimes list. Polaris resolves to the nearest cent from Reflector, the strike levels are bot-chosen, and the money is not real, so there is no usable arbitrage leg. Sports, politics and macro: none.
- **Shared liquidity:** none. It is a self-contained AMM, so it is independent, but independent and empty.
- **Signal value:** a price from an unused 50/50 AMM carries no information. Do not feed it to Quotient as a signal.

---

## 11. Fixtures

In `docs/research/fixtures/polaris-stellar/`:

- `oracle-markets-list.json` - `GET /markets` (16 markets, 4.8 KB)
- `market-state-open.json`, `market-price-open.json`, `market-fee-open.json` - the open market
- `market-state-settled.json`, `market-price-settled.json` - a `ResolvedYes` market
- `perpetuals-list.json` - `[]`
- `prices-xlm.txt` - the broken `/prices/:feedId` response (503, Hermes 401)

---

## 12. Adapter notes if it is ever revisited

- Discover markets from `GET /markets`; poll `/markets/:id/state` (reserves) and derive `yes = poolNo / (poolYes + poolNo)`. Do not use `/prices` (broken).
- Filter out `status != Open` and `expiry <= now`. Skip markets whose `totalSupply == initialLiquidity` (no organic flow).
- Treat any price as untradeable until a mainnet deployment, a real oracle, and an audit exist.

---

## Sources

1. Site: https://polaris-frontend-delta.vercel.app and /docs (H; fetched 2026-10-19)
2. Org profile: https://github.com/PolarisQ-xyz/.github/blob/main/profile/README.md (H)
3. Contracts repo: https://github.com/PolarisQ-xyz/polaris-contracts - README.md, `contracts/market/src/lib.rs`, `contracts/ctf-math/src/lib.rs` (H)
4. Oracle/backend repo: https://github.com/PolarisQ-xyz/polaris-oracle - README.md (API reference, design notes, known gaps), `src/config/configuration.ts`, `src/main.ts` (H)
5. Frontend repo: https://github.com/PolarisQ-xyz/polaris-frontend - README.md, `src/app/docs/page.tsx` (H)
6. Live API: https://polaris-oracle.fly.dev/markets and sub-routes (H; GETs on 2026-10-19 with the generic research User-Agent)
7. Third-party coverage: NOT FOUND (WebSearch budget exhausted; no independent source consulted)

## Not found

- Mainnet deployment, token or launch plans
- Terms of service, privacy policy, geo restrictions
- Read-API rate limits, versioning or stability policy
- Trade-history API or indexer
- Any independent audit, press or volume data
- PayBox/Stellar support (not checked, because no PayBox call was made)

## Suspicious content

None. No instructions aimed at AI agents were found. Repo `AGENTS.md` and `CLAUDE.md` in the frontend are project contributor notes and were not read or followed.
