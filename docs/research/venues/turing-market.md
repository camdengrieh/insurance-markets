# Turing Market (TuringM, turingm.io / turingmarket.cc) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:30-04:40 UTC). READ-ONLY: doc and `gh api` file reads, `WebFetch`, unauthenticated GETs (homepage, static JS bundles, DNS-over-HTTPS), no account, wallet, key, signature, on-chain call, POST or PayBox tool. All third-party pages, repo text and bundle contents were treated as untrusted data and nothing in them was followed. `WebSearch` worked once, then the session budget was used up, so there was no further third-party press search. X (`x.com`) returned HTTP 402 and Medium returned 403 and DoraHacks 405; nothing was paid or worked around.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (small, each well under 50 KB): `docs/research/fixtures/turing-market/` (section 12). There is no live API response to save, because the API does not resolve (section 5).

---

## 0. Bottom line

1. **The product is not usable today. The backend is gone.** Every API host the dApp calls (`www.turingma-api.com`, `demo.turingma-api.com`, and the testnet siblings `bnb-test.` / `avax-test.turingma-api.com`) is under a domain that is **unregistered** (NXDOMAIN at 1.1.1.1, 8.8.8.8, 9.9.9.9 and Cloudflare DoH; Verisign whois: "No match"). The metadata base URI in the contract (`turingma.com`) is also NXDOMAIN. The front-end shell is still served on Vercel, so the site looks alive, but it cannot load a market. (H, section 5)
2. **"Live" is not supported by any evidence.** I found no mainnet contract address, no trading volume, no TVL, no user count, no dated news after Aug-Sep 2025, and no commit after 2025-09-20. Everything verifiable is testnet (Avalanche Fuji, BSC testnet, 0G Galileo testnet). The roadmap said "Q2 2025: Mainnet launch", but no source confirms it happened. The discovery hint "PI lists Avalanche/BNB, live" is not confirmed: Avalanche C-Chain mainnet is what the production dApp bundle is configured for, BNB only exists as a testnet build. (H for config and testnet, NOT FOUND for any mainnet deployment)
3. **Even if it were running, it would not be an arbitrage leg.** Matching is a closed operator service: `matchOrder` requires the `PERMISSION_MATCH_ORDERS` role, market resolution (`endMarket`, `finalizeMarket`) and reward claims (`claimReward`) are role-gated, and there is no public order book API. A user can only sign an EIP-712 order and hand it to Turing's backend. (H, contract source)
4. **adapter_priority = skip.** Dead or unverifiable backend, no public API, no liquidity evidence, a Polymarket-CTF-style design that would be duplicative anyway. Revisit only if `turingma-api.com` (or a new API host) comes back, or a mainnet contract with real volume is found. See section 11.

Security note: because `turingma-api.com` is unregistered, a third party could register it and serve responses to the dApp's front-end. Treat the live dApp at `turingmarket.cc` as untrusted and do not connect a wallet to it. (M, inference from H facts)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.turingm.io` | HTTP 200, Vercel, Vue SPA shell; title "TuringM - AI-driven Collective Data-based Event-derived Financial Ecosystem". Marketing site only; text is generic ("Copyright 2026" in docs footer, no volume or user stats). | H |
| `https://www.turingmarket.cc` (the dApp) | HTTP 200, Vercel SPA shell, title "Turing Market", description "Bet on your beliefs!". `turingmarket.cc` 307s to `www.`. Same shell is served on `bnb-test.` and `avax-test.turingmarket.cc` (each with a different bundle). | H |
| dApp backend | `www.turingma-api.com` (live mode) and `demo.turingma-api.com` (demo mode) do not resolve; apex `turingma-api.com` also NXDOMAIN; whois on Verisign: "No match". Fixtures `doh_*_2026-10-19.json` (Status 3 = NXDOMAIN). | H |
| `turingma.com` (contract `construct()` sets token URI base `https://turingma.com/mktapi/app-api/token/`) | NXDOMAIN, whois "No match" | H |
| `api.turingm.io` | resolves to Vercel; every path returns "DEPLOYMENT_NOT_FOUND" (404) | H |
| `dev.turingm.io` | Vercel "DEPLOYMENT_NOT_FOUND" | H |
| GitHub `TuringM-Labs/TuringM` | MIT, not archived, 1 star, created 2025-04-22, **last push 2025-09-20**, last commit 2025-09-02 ("Update README.md"). Org repos: TuringM, TuringM-EIP2535, surrealworld, media - all last pushed 2025-06 to 2025-09. More than 12 months stale. | H |
| DefiLlama `/protocols` (8,758 entries) | No Turing / TuringM / TUIT protocol listed | H |
| Telegram `t.me/s/TuringM` (public preview) | Only "Channel created" and two bot-verification notices; no dated announcements | M (WebFetch summary) |
| ChainThink article | dated 2025-08-22 (year from image paths), labels the market entry "testnet" | M |
| HackQuest project page | Avalanche testnet contracts, goal "launch the MVP version on the testnet", mainnet "not live"; no dates | M |
| `insights.turingmarket.cc` | 307 redirects to `pred.news` ("Turing Weekly Insights", newest item seen 2025-08-11) | M |
| Official docs | Roadmap table: "Q2 2025 Mainnet launch", "Q3 2026+ Global deployment". Only testnet addresses are published (Avalanche testnet `TokenUnlockerApp` and `TuringMarketApp`). No page says mainnet is live. | H (docs) |

Verdict: **still_live = false** for the purpose of an aggregator. The brand and a front-end shell exist, but no working trading backend and no mainnet deployment could be found. Confidence: high on the dead backend, medium on "never launched on mainnet" (absence of evidence).

---

## 2. Kind and market model

- **Kind (H):** hybrid off-chain order book with on-chain settlement ("Polymarket CTF Exchange" style). README: "operators provide off-chain matching services while settlement is completed trustlessly on-chain through signed order messages." The official docs page `/ecosystem/turingmarket` additionally says "The platform combines an Automated Market Maker (AMM) with an order book model", but no AMM code is in the public contracts (M/L, marketing wording).
- **Contracts (H):** EIP-2535 Diamond. Public facets: `TuringMarketFacet` (`matchOrder`), `MarketManagerFacet`, `MatchOrderSelfFacet` (user mint/merge of YES+NO), `FeeTokenFacet`, `PaymentFacet`, `PermissionFacet`, `OrderHelperFacet`, `TuringCoin`.
- **Market structure (H):** binary only. `createMarket(marketId)` mints exactly two ERC-1155 token IDs (`nftId1`, `nftId2`) per market. Docs say "mutually exclusive markets" and "multiple binary scenarios", which in code means several independent binary markets, not one categorical market. No scalar markets.
- **Tokenisation (H):** outcome shares are ERC-1155 token IDs inside the Diamond itself. Collateral is an ERC-20 (`paymentTokenAddress`, per order). 1 YES + 1 NO merges to 1 collateral token and vice versa. Token transfers are hooked (`_checkStatus`) and revert once a market is ended, blocked or finalized.
- **Order format (H):** EIP-712 typed `Order(salt, maker, tokenId, tokenAmount, tokenPriceInPaymentToken, paymentTokenAddress, slippageBps, deadline, side, feeTokenAddress)`. Order carries extra operator-computed fields (`exchangeNftAmount`, `paymentTokenAmount`, `fee1/fee2Amount`, `fee1/fee2TokenAddress`). `slippageBps == 0` means limit order. `OrderSelf` (mint/merge) and `Reward` and `Payout` are separate typed structs. Excerpt saved in fixtures.
- **Trade types (H):** `mint`, `normal`, `merge`, `mintMixNormal`, `mergeMixNormal`.
- **Leverage (L):** README claims "up to 10x leveraged trading"; the docs page says leverage is only planned; no leverage code in the public contracts. Ignore.
- **Competitive claims in README** ("42% improvement in event analysis efficiency", "$120M first-year volume target") are marketing (L).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Production dApp chain config | Avalanche C-Chain (chain id 43114): the `www.turingmarket.cc` bundle calls `getChains("avalanche")` and passes that to Privy; USDC map entry for Avalanche is a generic wallet-library table, not Turing-specific | H (bundle) |
| BNB | `bnb-test.turingmarket.cc` bundle is configured for `bscTestnet` (chain 97) only | H (bundle) |
| Other testnets | Avalanche Fuji (43113), BSC testnet, 0G Galileo testnet | H (README) |
| Testnet diamond addresses (README) | BSC testnet `0x8be123F0F0943dc8d08f91600b60Dc5a2F8C7e84`; Avalanche testnet and 0G testnet `0x10d1681da8206A676a9B343fC5Bc1A8AB1733F64`; docs partners page lists Avalanche testnet `TuringMarketApp` `0x93DeBeE714C2376Cd5648B8a89B89b92B01256B1` and `TokenUnlockerApp` `0xeAfBF3f509BC6a0353Abb7336a02f88193104f5e` | H (README, docs) - testnet only |
| Mainnet exchange address | NOT FOUND (searched: README, docs-en pages, dApp bundles, GitHub org). The dApp gets contract addresses from its backend (`/app-api/topic/user/config`), which is gone. A Routescan GET for the testnet addresses returned 404 even on their own testnets, so it proved nothing. | - |
| Collateral | Per-order `paymentTokenAddress`, USDC in all examples; docs say "crypto assets" without naming a token; USDT is used for commissions and staking dividends; TUIT token can pay fees (burned). Actual mainnet collateral not verifiable. | M |
| Wallets | Privy-based login (embedded and external wallets, "proxy wallet"), SIWE-style `wallet-login` against the backend | H (bundle) |

---

## 4. Event categories (overlap for arbitrage)

Docs and README: politics, economy, sports, entertainment, "global trending events"; a "World Cup" flag exists in the dApp store (`isWorldCup`). A "Master Oracle Tournament" asks BTC/USDT up or down next day (M, ChainThink). No market list could be obtained, so **no overlap can be confirmed** with any venue. (M for categories, NOT FOUND for actual markets)

---

## 5. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API docs | NOT FOUND (searched: docs-en.turingm.io pages /, /ecosystem, /ecosystem/turingmarket, /ecosystem/turingai, /ecosystem/turingdao, /partners, /disclaimer; README; GitHub org). Docs only say market data is offered to partners via "API services" (Jupiter and Raydium named, which are Solana apps and look like boilerplate) | H |
| Private app API (used by the dApp) | Base URLs in the bundle: live `https://www.turingma-api.com`, demo `https://demo.turingma-api.com`, websocket `wss://www.turingma-api.com/ws` (live) or `wss://demo.turingma-api.com/demows` (demo). Style: RuoYi/Yudao `/app-api/...`; responses carry `code` (0 = success) and `msg`. **None of these hosts resolve.** | H (bundle), H (NXDOMAIN) |
| Endpoints seen in bundle (not called) | list in `dapp_bundle_api_paths_2026-10-19.txt`. Market data ones: `POST /app-api/topic/page`, `POST /app-api/topic/recommend`, `GET /app-api/topic/get?id=`, `GET /app-api/topic/catalog/home`, `POST /app-api/topic/markets/orderBooksAll`, `POST /app-api/topic/markets/lastPricesAll`, `POST /app-api/topic/markets/priceHistory`, `POST /app-api/topic/markets/topHolder`. Trading ones: `POST /app-api/topic/order/preview`, `/order/create`, `/order/cancel`, `/order/checkHold`, `GET /order/amount`. User/auth: `POST /user/getNonce`, `/user/wallet-login`, `/user/approveSign`, `/user/cashOut`, `/user/getClaimSignData`, `GET /user/config`. | H (bundle text); not verified live |
| Auth | Bearer `accessToken` obtained from `wallet-login` after a signed nonce; header `Language`. Public catalog GETs probably work unauthenticated, but that could not be tested. | H (bundle), L (unauth) |
| Rate limits | NOT FOUND | - |
| On-chain reads | Diamond exposes `getMarketInfo(marketId, paymentToken)` and ERC-1155 balances, but no order-book data on-chain (orders live off-chain in the operator's DB), and no mainnet address is known. | H (source) |
| Subgraph / indexer | NOT FOUND | - |
| Fixtures | None possible; the only "responses" are the NXDOMAIN DNS answers. I deliberately did not send POSTs (all list endpoints are POST) even if a host had resolved. | - |

---

## 6. Trade path and PayBox reachability

- **Designed path (H, source + bundle):** user signs EIP-712 `Order` -> `POST /app-api/topic/order/create` to Turing's backend -> operator calls `matchOrder` (role `PERMISSION_MATCH_ORDERS`) -> on-chain settlement. Withdrawals/claims: `claimReward` also needs a privileged caller (`PERMISSION_CLAIM_REWARD`) with a `Reward` signed by the user; the contract takes a `feeAmount` from the winner's payout (capped by `maxFeeRateBps`).
- **Self-service on-chain path:** `MatchOrderSelfFacet` lets a user mint/merge YES+NO pairs, but from the source it is also driven by signed `OrderSelf` messages submitted through the backend (not verified in detail). No permissionless AMM-style swap.
- **PayBox reachability: no.** An EVM wallet in PayBox could in principle produce the EIP-712 signature (via a wallet-sign request) or approve ERC-20 allowance, but (a) the backend that accepts and matches orders does not resolve, (b) matching and settlement are operator-only, and (c) no mainnet contract address is known. No transaction proposal can place a trade directly. (H for (a)-(b), NOT FOUND for (c))

---

## 7. Fees

| Fee | Value | Tag |
|---|---|---|
| Docs: trading | "0.5% per side, 1% total" (docs example: a $10,000 trade incurs a $50 fee, i.e. the per-side 0.5%) | H (docs, internally inconsistent) |
| Docs: settlement | 2% of the settlement amount, charged on successful predictions | H (docs) |
| Docs: allocation | 40% liquidity pool / 30% buyback and burn / 20% staking dividends / 10% risk reserve, after commissions; README and DAO page give different splits (70/30, 50% buybacks) | H (docs), inconsistent |
| Contract/README formula | `USDC fee = baseFeeRate * min(price, 1 - price) * token quantity` (symmetric for YES and NO); `baseFeeRate` is written into the order; buy fees come out of received shares, sell fees out of collateral. On-chain cap `maxFeeRateBps` on `paymentTokenAmount`; fee can be paid in USDC or TUIT (`FeeTokenFacet`, `feeTokenPriceUSDCMap`) | H (README, source) |
| Reward-claim fee | `feeAmount` deducted at `claimReward`, capped at `amount * maxFeeRateBps / 10000` | H (source) |
| Who pays | Both sides on match; price improvement goes to the taker | H (README) |
| Gas | Operator submits `matchOrder`, so users do not pay gas on trades (assumed from the architecture; not verified) | M |

Cannot be modelled for arbitrage because the live parameters (`baseFeeRate`, `maxFeeRateBps`) are not published.

---

## 8. Resolution and dispute risk

- **Docs (H):** "hybrid of AI and DAO governance." Turing AI collects public data and produces a preliminary report with confidence scores; low confidence or a strongly challenged result escalates to a "Strategic Decision Committee" that publishes reasoning and executes on-chain; weighted quadratic voting by TUIT holders is planned. No bond sizes, thresholds, slashing rates or timelines given.
- **Contract (H):** `endMarket(marketId, winNftId)` and `finalizeMarket(marketId, winNftId)` are callable only by role holders; `toggleMarketBlocked` lets a role holder freeze a market; there is no on-chain oracle, no challenge window, no dispute bond in the public code. `endMarket` can set the winner and `finalizeMarket` can set it again (a role holder can override the winner before claims).
- **Risk: very high.** Single-operator, discretionary resolution, with an AI-plus-committee story that is not implemented in the public contracts. Claims also require an operator-submitted `claimReward`.

---

## 9. Geo, ToS, automation

- Terms (`turingm.io/terms`, in the site bundle) (H): users must be 18+, use the platform only for lawful purposes, platform is "as is", operator "may modify, suspend, or discontinue the Platform ... at any time without prior notice". No geo-block list, no mention of bots or automation, no API terms.
- Docs disclaimer (H): "Some jurisdictions may impose restrictions or bans on cryptocurrencies, Web3 projects, or decentralized finance"; responsibility on the user. No prohibited-user list.
- Privacy policy collects wallet address, IP, browser data (H).
- Automation policy: NOT FOUND (searched: terms, disclaimer, README).

---

## 10. Liquidity

| Metric | Value | Tag |
|---|---|---|
| Trading volume | NOT FOUND (searched: docs, README, DefiLlama protocols list, dApp bundle). Docs only state targets: "10,000 active users and $10 million in trades" (phase 2), "$100M" (phase 3); README states a "$120M first-year volume" target | - |
| Open interest / TVL | NOT FOUND (DefiLlama has no entry) | - |
| Users | NOT FOUND | - |
| Liquidity shared with another venue | No evidence of sharing. It is its own exchange contract and operator; the only shared thing is that the design mirrors Polymarket's CTF Exchange architecture. Not an independent leg in practice because it has no verifiable liquidity at all. | M |

---

## 11. Adapter priority

**skip.** Reasons: backend domain unregistered (dead), no mainnet address, no public API docs, closed operator matching, discretionary resolution, no liquidity or volume evidence, repo stale since 2025-09. Revisit triggers: (1) a resolving API host with unauthenticated `GET /app-api/topic/catalog/home` returning markets, (2) a mainnet Diamond address with `MarketCreated` / matched-trade events, (3) any published volume above roughly $100k per month.

If ever revisited, the cheap signal adapter would be: poll `POST /app-api/topic/markets/orderBooksAll` and `lastPricesAll` (requires POST, which this research did not use), map ERC-1155 `nftId1` / `nftId2` to YES / NO via `getMarketInfo`, treat prices as 0 to 1 USDC, and ignore fees until `baseFeeRate` is known.

---

## 12. Fixtures saved (`docs/research/fixtures/turing-market/`)

| File | What it is | Tag |
|---|---|---|
| `doh_www.turingma-api.com_2026-10-19.json` | Cloudflare DoH answer for the live API host: `Status 3` (NXDOMAIN) | H |
| `doh_demo.turingma-api.com_2026-10-19.json` | same, demo API host | H |
| `doh_turingma-api.com_2026-10-19.json` | same, apex | H |
| `doh_turingma.com_2026-10-19.json` | same, contract token-URI domain | H |
| `dapp_bundle_api_paths_2026-10-19.txt` | `/app-api` paths and HTTP methods extracted from the dApp bundle (data only, never called) | H for "appears in bundle", none for behaviour |
| `order_struct_and_permissions_excerpt.sol.txt` | verbatim EIP-712 `Order` typehash/struct and the four permission constants from `contracts/AppStorage.sol` (MIT) | H |

---

## 13. Sources

Primary (H):
- https://www.turingm.io - homepage shell and `assets/main-CdHl6IhH.js` (terms, privacy, links; fetched 2026-10-19)
- https://www.turingmarket.cc - dApp shell and `assets/index.BXtVS5nA.js` (production bundle); https://bnb-test.turingmarket.cc (`index.Dt172zCW.js`); https://avax-test.turingmarket.cc (`index.BLUsBY4V.js`)
- https://docs-en.turingm.io/ , /ecosystem/turingmarket , /ecosystem/turingdao , /partners , /disclaimer (via WebFetch summaries; per-fact tags above reflect that these are summaries: treat quotes as M if used in code)
- https://github.com/TuringM-Labs/TuringM (README, `contracts/MarketManagerFacet.sol`, `TuringMarketFacet.sol`, `AppStorage.sol`; `gh api` raw reads); https://github.com/TuringM-Labs/TuringM-EIP2535 (listing only)
- DNS: 1.1.1.1, 8.8.8.8, 9.9.9.9 via `dig`; https://cloudflare-dns.com/dns-query; Verisign whois (`whois.verisign-grs.com`)
- https://api.llama.fi/protocols (DefiLlama, no Turing entry)

Secondary (M/L):
- WebSearch (extended), one query on 2026-10-19: results pointed to HackQuest, DoraHacks (3 project pages), GitHub, docs-en.turingm.io, ChainThink; I did not rely on search snippets.
- https://www.hackquest.io/projects/Turing-Market (testnet-only, no dates)
- https://www.chainthink.cn/article/35452 (2025-08-22, "testnet")
- https://pred.news/ ("Turing Weekly Insights", item dated 2025-08-11)
- https://t.me/s/TuringM (empty preview)

Not reachable: x.com/Turingmarket (HTTP 402; payment requirements not available through the fetch tool, stopped), medium.com/@TuringM (403), dorahacks.io/buidl/31488 (405).

---

## 14. Open questions

1. Did a mainnet deployment ever go live (Avalanche or elsewhere)? Which Diamond address? Needs an X/Telegram/Medium read that was blocked here.
2. Was `turingma-api.com` deliberately dropped (project wound down or migrated to a new API host) or did it lapse by accident? The front-end bundle was last cached 2026-10-15 to 2026-10-19 on Vercel (Last-Modified header, L: may be cache time), which suggests the Vercel site is still being deployed even though the API domain lapsed.
3. Actual `baseFeeRate`, `maxFeeRateBps`, and collateral token on mainnet.
