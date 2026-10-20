# Pubhouse (pubhouse.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock ~04:30-04:45 UTC). READ-ONLY: GitBook docs, public frontend bundle read as static data, unauthenticated GETs only, one read-only PayBox `discover_tokens` lookup. No account, wallet, key, signature, POST, on-chain call or money/signing PayBox tool. All third-party text was treated as untrusted data. WebSearch was unavailable (session budget used up), so no press or social coverage was read; `x.com/PubhouseXYZ` returned HTTP 402 to WebFetch and was not retrieved (nothing paid or attempted further).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, inference or arithmetic from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/pubhouse/` (section 12).

---

## 0. Bottom line

1. **Site, docs and API are up, but the venue is dormant.** `GET /api/markets/top` and `/api/markets/new` both return `{"markets":[]}` and the home page says "No markets found in this category" (2026-10-19). The only collateral token, $PUB, has a ~$5.1k market cap and $0 24h volume. (H)
2. **It is not what the hint says.** Not Base, not scalar, not an independent prediction market. It is a **Solana** program ("Short-lived Polymarket meta prediction markets on Solana") where users bet whether a **Polymarket (and, per the site, Kalshi) market's YES price will be higher or lower in 1, 4 or 6 hours**. The predictionindex.xyz label (Base, scalar, amm) conflicts with every primary source (H, section 2/3).
3. **Dependent, not independent.** Markets are keyed by a Polymarket token ID and settled from Polymarket price history. Pubhouse prices are crowd bets on a Polymarket price *move*, not a probability of the real-world event, so they are not an arbitrage leg against anything. (H)
4. **Unusable collateral and a single-key oracle.** The frontend allows exactly one collateral token ($PUB, Token-2022); resolution is signed by one `oracle` key. (H, from the program IDL in the public bundle)
5. **adapter_priority = skip.** Revisit only if `/api/markets/top` returns live markets and PUB volume reappears.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.pubhouse.xyz/` | HTTP 200, Next.js on Vercel, title "Pubhouse \| Shake on Anything", description "Trade short-term price movements of Polymarket and Kalshi markets." Nav: Markets, Competition, Portfolio, Rewards, Login. | H |
| Market list | `GET /api/markets/top?limit=3&offset=0` and `/api/markets/new?...` -> 200 `{"markets":[]}`; page text "No markets found in this category" | H |
| Docs | GitBook `gitbook.pubhouse.xyz` live; screenshots in the docs are dated 2026-07-05 (filename `Screenshot 2026-07-05`) | H |
| $PUB token | Pump.fun launch 2026-06-28; graduated to PumpSwap 2026-07-02 (`completed_at 2026-07-02T21:59:45Z`); ATH $0.000412 on 2026-07-07; now $0.0000051 (about -98.8%, my arithmetic); 24h volume $0, zero buys/sells in every window on GeckoTerminal | H (data), M (arithmetic) |
| CoinGecko | listed id `pubhouse`, categories "Gambling (GambleFi)", "Prediction Markets", "Solana Ecosystem", "Pump.fun Ecosystem"; last_updated 2026-10-17T19:34Z; total_volume $4.05 | H |
| GitHub | no repository for Pubhouse found (`gh search` for repos and for the program ID / mint in code: zero hits). `github.com/pubhouse` is a 2023 organization with 0 public repos, likely unrelated | H (absence) |
| DefiLlama | no Pubhouse protocol (`api.llama.fi/protocols`, 9.3 MB, no match) | H (absence) |

Verdict: **still_live = true** (site, docs and API respond) but **no live markets and a near-zero token**. Not a trading venue today.

Lineage note (M): the page ships a Farcaster mini-app manifest meta (`fc:frame`, button "Shake On It", `?miniApp=true`), which is probably why an index lists "Base". The shipped bundle contains no EVM libraries (no wagmi/viem/ethers/eip155/8453 strings) and uses Solana wallet-adapter code only.

---

## 2. Kind and market model

- **Kind (H):** meta prediction market (a derivative on another venue's price) as an on-chain Solana (Anchor) program. IDL metadata: name `pubhouse`, version 0.1.0, "Short-lived Polymarket meta prediction markets on Solana".
- **Question (H, docs):** "The predictions always concern the YES price movement i.e. whether the price of YES will be higher or lower in 1/4/6 hours." On-chain `Direction` enum = `Lower | Higher`; `reference_price` (u64) is fixed at creation from Polymarket's Midpoint Price; `expires_at` is the end. Docs: every market resolves "in either one, four, or six hours".
- **Binary in structure, scalar only in the underlying (H):** two sides, `Side = Yes | No`; the underlying (a 0-1 probability price) is continuous but the contract is a higher/lower binary.
- **Mechanism (H, docs):** two separate constant-product virtual-AMM pools (YES and NO, `X*Y=K`, "trades on one side do not impact the price of the other side") used for pricing, with **parimutuel settlement**: "The losing side's collateral is divided among the winners of the market, based on their share number." No selling or closing before resolution: "positions are final and cannot be closed before the market resolution, only increased."
- **Tokenisation (H, IDL):** no SPL outcome tokens. Positions are `Position` PDA accounts per (market, trader, side) holding `shares` and `collateral`. Non-transferable, so no secondary market.
- **Market account (H, IDL):** `config, registry, collateral_mint, creator, polymarket_token_id[32], sequence, direction, reference_price, expires_at, resolved_at, seed_per_side, state (Open|SettledNo|SettledYes|Unresolvable), yes SidePool, no SidePool, bump`. A per-token `registry` enforces **one active market per Polymarket token** (error `MarketAlreadyActive`).
- **Seeding (H):** creator seeds roughly $10 of PUB per docs; frontend token config has `marketSeedPerSide 2500`, `virtualSharesReserve 1000000000`, `quoteReserve 50000`, `minTradeAmount 1000` (PUB base-unit semantics not verified, M). Docs: initial YES and NO "market cap" about $50,000.
- **Underlying venues:** docs name Polymarket only; the live site meta and API also cover **Kalshi** (`GET /api/kalshi/events` returns Kalshi events with tickers such as `KXNFLGAME-26OCT19WASSF`). The 32-byte `polymarket_token_id` field is the same slot used for the underlying id (how Kalshi tickers map into it was not found, M).

---

## 3. Chains and collateral

- **Chain: Solana mainnet only** (H: docs "meta prediction market platform on Solana"; bundle constant `SOLANA_NETWORK_LABEL = "mainnet"`).
- **Collateral: $PUB only (H).** Bundle `ALLOWED_TOKENS = [PUB]`; `getTokenConfig` throws `Unsupported collateral token` for anything else. Docs allow "$PUB (or other token set as the primary market's token at the time)", but only PUB is configured. Mint `HEpnawcnjTBKk1Vi5krT3S6C9waMJjp5g2rhJ2hYpump`, 6 decimals; Token-2022 per frontend config (M); program rejects unsupported Token-2022 extensions.
- **Program addresses (H, frontend constants; roles from variable names, so M for role):**
  - `PUBHOUSE_PROGRAM_ID` 2UEFJcHZHyM6zP3QDGqBfyFM2casQQz78ZWm9umWhYAU
  - `PUBHOUSE_CONFIG` 8KEKcXdmSTsKgcD7VXs46vpdvk3S5xaPATuWCGCqjJB
  - `STAKING_PROGRAM_ID` DTDoaHpFQjTVF1mziYNCgV1FXDfXKfspJKLkZW7GhiNV, `STAKING_CONFIG` 9DjADwu1dHrmD2UUeCd3XZPxZgs9BrB44xF3Zec4RVYk, `STAKING_VAULT` Bz4KqpT9C4tN4tJm56SHsdUba6ZxhuTgwjMLfgR9pbJT
  - The GitBook lists only the token address, not the program IDs.
- Login (M): the bundle includes `wallet-adapter-embedded-*` classes and Phantom/Solflare deep links, consistent with the Phantom embedded-wallet SDK plus wallet-standard wallets. Not verified.

---

## 4. Read API

**There is no official, documented API.** The GitBook has four pages (llms.txt: Pubhouse, What is Pubhouse?, Fees and Staking, $PUB) and mentions no API, SDK, rate limits or websocket. (H)

Unofficial same-origin Next.js route handlers used by the frontend (names found in the public bundle; only the GETs marked "called" were run; all response shapes may change without notice):

| Endpoint | Purpose | Status |
|---|---|---|
| `GET https://www.pubhouse.xyz/api/markets/{top\|new}?limit=20&offset=0` | Pubhouse's own markets; response `{markets:[...], nextPageParam}`. Market object fields used by the UI (from bundle, M): `id, provider, marketToken, referencePrice, currentPrice, direction (HIGHER\|LOWER), odds, endTime, marketState (OPEN\|...), yesCollateral, noCollateral, yesSharesBought, noSharesBought`. | called: 200 `{"markets":[]}` (H) |
| `GET /api/{polymarket\|kalshi}/events?limit=&offset=&feed=trending\|top-volume&q=` | Browse list of *underlying* events a user could open a Pubhouse market on. Polymarket variant is a pass-through of Polymarket Gamma event objects (~1.08 MB for one 329-market event); Kalshi variant is a small normalised object `{provider,id,slug,title,externalUrl,volume,volume24hr,markets:[{id,slug,question,groupItemTitle,outcomePrices,active,closed}]}` plus `hasMore,totalResults`. | called: 200 (H) |
| `GET /api/event/{polymarketEventId}/active-markets` | Which markets of that event already have an active Pubhouse market | called: 200 `{"marketSlugs":[]}` (H) |
| `GET /api/positions/{wallet}/{marketAddress}` | Indexed position: `yesSharesRaw, yesCollateralRaw, noSharesRaw, noCollateralRaw` | not called (needs a wallet; M from bundle) |
| `GET /api/status/{marketAddress}` | `{indexed: bool}` after creation | called with a non-market address: 500 `{"error":"Failed to check market status"}` (H) |
| `POST /api/create`, `/api/create/sign`, `/api/create/send` | market creation flow (section 5) | NOT called (POST) |

- **Auth/limits:** the GETs above needed no auth and no key. Response headers showed no `x-ratelimit-*`/`retry-after`. Rate limits: NOT FOUND (searched: GitBook pages, response headers). `access-control-allow-origin: *` was present on the 404 page (H).
- **Websocket:** none documented. The frontend only references a Solana RPC websocket (`NEXT_PUBLIC_SOLANA_WS_URL`). The bundle also embeds a dedicated RPC URL; it is deliberately not recorded here.
- **On-chain read path (M, design):** Anchor IDL is embedded in the public bundle (summary fixture). Markets can in principle be enumerated with `getProgramAccounts` on the program ID and decoded with the IDL; I did not call RPC (JSON-RPC is POST). `getSignaturesForAddress` on the program would show the last on-chain activity: NOT CHECKED (Solscan returned 403 to WebFetch).
- **Prices/books/trades:** there is no order book. Price = vAMM pool state read from the `Market` account's `yes`/`no` `SidePool` structs (field layout not extracted beyond names). Trade history: NOT FOUND (no trades endpoint in the bundle other than per-wallet positions).
- **Resolution data:** `Market.state`, `resolved_at`; `resolve_market` args `outcome` (No|Yes|Unresolvable) and `end_price`.

---

## 5. Trade path

- **Place a trade (H, IDL):** `buy_shares(side: Side, amount: u64, min_shares: u64)`; accounts: `trader` (signer, writable), `config`, `market`, `collateral_mint`, `market_vault`, `trader_collateral`, `staker_fee_vault`, `creator_fee_vault`, `position`, token and system programs. **Only the trader signs**, so an on-chain buy is permissionless for any Solana keypair holding PUB. Slippage guard via `min_shares`; frontend default slippage 5%.
- **Exit (H):** none before expiry. After resolution `settle_position(side)` (trader signs) pays out. No sell/cancel instruction exists.
- **Create a market (H):** `create_market(params)` requires **two signers**: `creator` and `market_signer` (a Pubhouse-controlled key held by the backend). The frontend calls `POST /api/create/sign` with `{provider, eventSlug, marketSlug, direction, durationSeconds, userAddress, collateralMint}`, signs the returned serialized transaction, then `POST /api/create/send`. So creation is gated by Pubhouse's backend.
- **Resolve (H):** `resolve_market(outcome, end_price)` is signed by a single `oracle` key set in `Config` (`authority`, `market_signer`, `oracle` are all settable by `authority` via `set_authorities`).
- **Orders/signed-order scheme:** none (no off-chain orders; all actions are on-chain Solana transactions).
- No SDK, CLI or agent tooling found.

---

## 6. PayBox reachability

**partial (technically possible, practically pointless).**
- Chain: Solana, which PayBox supports (repo notes `docs/research/06-paybox-platform.md`: Solana family wallet, `request_wallet_sign` op `solanaTransaction`, `solana` proposal kind <= 1,232 bytes with a single fee-payer signer; M, from earlier sessions' primary reads). A `buy_shares` transaction has one signer, so it fits that shape.
- No PayBox plugin or service exists for Pubhouse (repo notes list only world, aave, hyperliquid, jupiter plugins; no `discover_plugins` re-run for this venue, M).
- Collateral: PayBox's token catalog does index PUB (live `discover_tokens` token_detail, 2026-10-19: liquidity $3,528, market cap $5,211, 24h volume $0, 301 holders; H), but whether MoonX can route a swap into PUB at any size is unknown (swap tools not called).
- Creating markets would need Pubhouse's backend co-signature, so a PayBox wallet cannot create markets programmatically without going through `/api/create/sign`.

---

## 7. Fees

- **1% swap fee when opening a position** ("no fees on winnings") (H, GitBook "Fees and Staking"); bundle `FEE_BPS = 100`, `BPS_DENOMINATOR = 10000` (H). Paid by the trader on each `buy_shares`.
- **Split (H):** 80% to $PUB stakers, 20% to the market creator (docs; on-chain `staker_fee_share_bps`, `staker_fee` / `creator_fee` fields). Rewards are paid in the tokens fees are collected in (PUB or SOL per the Rewards page).
- Gas: Solana fees; the user pays. Withdrawal/settlement fee: none documented.
- Market creation: seed capital ~$10 of PUB, refund/recovery terms NOT FOUND.

---

## 8. Resolution and dispute risk

- **Mechanism (H, docs):** at expiry Pubhouse "will use Polymarket's historical price feed and use the closest available price point to the market's end time" and compare to the stored reference price. On-chain the result is pushed by one `oracle` signer (`resolve_market`); outcomes `Yes | No | Unresolvable`, with a `NoWinningPositions` error if the winning side is empty.
- The founder's title is "Chief Executive Oracle" (GitBook). **Dispute path: NOT FOUND** (no dispute instruction in the IDL; none in the docs). Oracle key compromise or operator error is a direct loss risk; `Unresolvable` is the only escape hatch.
- Underlying-price risk: "closest available price point" from Polymarket's history endpoint is a point sample of an illiquid midpoint; no TWAP or tie rule documented. Kalshi resolution source: NOT FOUND (docs mention Polymarket only).
- Parimutuel risk: if one side has no buyers the other side's collateral handling is governed by `NoWinningPositions`/refund logic that is not documented.

---

## 9. Geo, ToS, automation

- No terms of service, privacy policy or geo statement found: `/terms`, `/privacy`, `/tos`, `/robots.txt`, `/sitemap.xml` all returned the 404 page; the GitBook has no legal page (H). The Competition page explains only a weekly profit leaderboard (top 10, resets Monday 00:00 UTC, places 1-5 earn token rewards; no prize pool stated).
- No automation rule, API terms or bot policy published. The underlying Polymarket feed carries Polymarket's own restrictions (Polymarket event objects in the proxy show `restricted: true` flags for some markets), which do not obviously flow through to Pubhouse (M).
- Regulatory character: short-duration (1-6 h) pari-mutuel bets on other venues' prices, with a creator-fee revenue share and a leaderboard. Legal posture unstated. (M)

---

## 10. Liquidity

| Metric | Value | Source / date |
|---|---|---|
| Live Pubhouse markets | 0 | `/api/markets/top` and `/new`, 2026-10-19 (H) |
| Platform volume / OI / TVL | NOT FOUND (no stats page, not on DefiLlama; Rewards and Competition pages show none) | searched GitBook, site pages, DefiLlama |
| $PUB market cap | $5,108.58 (CoinGecko, last_updated 2026-10-17T19:34Z); $5,139 (GeckoTerminal 2026-10-19); $5,211 (PayBox catalog 2026-10-19) | H |
| $PUB 24h volume | $4.05 (CoinGecko); $0 with zero txs in every window (GeckoTerminal) | H |
| $PUB pool liquidity | PumpSwap PUB/SOL reserve $7,087 (created 2026-07-02); Meteora PUB/USDC $19.47; token-level total reserve $3,524 (GeckoTerminal); $3,528 (PayBox) | H (the $3.5k and $7.1k figures disagree; likely one-sided vs. both-sided counting, M) |
| Holders | 301 | PayBox catalog, 2026-10-19 (H) |
| ATH | $0.000412 on 2026-07-07 | CoinGecko (H) |

Any trade requires first buying PUB through pools holding roughly $3.5k-$7k, so execution size is capped by that depth, not by Pubhouse.

---

## 11. Event overlap and shared liquidity

- Underlying events mirror whatever Polymarket and Kalshi list (sports, politics, crypto, culture, tech; the Kalshi/Polymarket events endpoint currently returns NFL games, tennis, etc.). That overlap is with the *price of those venues' markets*, not an independent view of the event.
- **Shares liquidity / price source with Polymarket (and Kalshi): yes, by construction.** Pubhouse has no independent price for the underlying event. It is not an independent arbitrage leg; at best it is a (currently empty) sentiment/attention signal about which Polymarket markets retail wants to speculate on.
- Cross-venue arbitrage structure: Pubhouse "Higher" vs a position on the underlying Polymarket market is a bet on the venue's own price drift, not a risk-free spread. No Quotient-style signal value found either.

---

## 12. Fixtures (docs/research/fixtures/pubhouse/)

| File | What | Tag |
|---|---|---|
| `api_markets_top_empty_2026-10-19.json`, `api_markets_new_empty_2026-10-19.json` | real Pubhouse `GET /api/markets/{top,new}` responses (empty) | H |
| `api_kalshi_events_limit2_2026-10-19.json` | real response of `GET /api/kalshi/events?limit=2&offset=0&feed=trending` (Pubhouse's normalised Kalshi event shape) | H |
| `api_polymarket_events_trimmed_2026-10-19.json` | TRIMMED sample (first event, 2 of 329 markets) of the Polymarket pass-through; full response was ~1.08 MB | H (trimmed) |
| `idl_summary_derived_from_frontend_2026-10-19.json` | NOT an API response: instruction/args/enum/error summary I parsed from the Anchor IDL embedded in the public bundle, plus program constants | M (derived) |
| `geckoterminal_token_2026-10-19.json`, `geckoterminal_pools_2026-10-19.json`, `coingecko_pubhouse_2026-10-19.json` | public market-data API responses for $PUB | H |

---

## 13. NOT FOUND / open questions

- Official API, SDK, rate limits, websocket: NOT FOUND (searched: GitBook llms.txt and 4 pages, site pages, bundle strings, response headers).
- Terms of service, geo-restrictions, automation policy: NOT FOUND (searched: /terms, /privacy, /tos, GitBook).
- Any platform-level volume, OI, TVL, number of markets ever created: NOT FOUND (searched: site, GitBook, CoinGecko, GeckoTerminal, DefiLlama). Last on-chain activity of the program: not checked (no RPC, Solscan 403).
- Dispute process, oracle key custody, Kalshi resolution source and Kalshi-to-`polymarket_token_id` mapping: NOT FOUND.
- Pool-state field layout of `SidePool` and exact price formula in base units: not extracted.
- Social/press activity: not read (WebSearch budget exhausted; X returned HTTP 402).

---

## 14. Priority

**skip.** Dormant (no live markets), dependent on Polymarket/Kalshi prices (not an independent leg), single collateral token with a ~$5k market cap and $0 volume, centralised oracle with no dispute path, no official API, no ToS. An adapter would add a read path to an empty list. Reconsider if `/api/markets/top` becomes non-empty AND PUB or a new collateral shows real volume; then at most **P2 (signal-only)**.

---

## Sources

- Home page and metadata: https://www.pubhouse.xyz/ (H)
- Docs: https://gitbook.pubhouse.xyz/llms.txt ; https://gitbook.pubhouse.xyz/pubhouse.md ; https://gitbook.pubhouse.xyz/pubhouse-1/what-is-pubhouse.md ; https://gitbook.pubhouse.xyz/pubhouse-1/fees-and-staking.md ; https://gitbook.pubhouse.xyz/pubhouse-1/usdpub.md (H)
- Site pages via WebFetch summaries: https://www.pubhouse.xyz/rewards ; https://www.pubhouse.xyz/competition (M)
- Public frontend bundle, read as static data (IDL, constants, API paths): https://www.pubhouse.xyz/_next/static/chunks/6213cb6ad54575da.js and sibling chunks listed in the home HTML (H for text, M for interpretation)
- Unofficial API GETs: https://www.pubhouse.xyz/api/markets/top ; /api/markets/new ; /api/kalshi/events ; /api/polymarket/events ; /api/event/982303/active-markets ; /api/status/{address} (H)
- Token data: https://api.geckoterminal.com/api/v2/networks/solana/tokens/HEpnawcnjTBKk1Vi5krT3S6C9waMJjp5g2rhJ2hYpump (+ `/pools`) ; https://api.coingecko.com/api/v3/coins/pubhouse ; DexScreener API (no pairs returned) ; PayBox `discover_tokens` token_detail (H)
- Index listing (stale/incorrect on chain and type): `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` (Base, scalar, amm; M/L)
- DefiLlama protocol list: https://api.llama.fi/protocols (no Pubhouse entry; H absence)
- GitHub search via `gh api` (no Pubhouse repo; H absence)
- PayBox capability notes (from earlier sessions): `docs/research/06-paybox-platform.md` (M)

Suspicious content: none found. The docs expose a standard `llms.txt`; nothing in the pages was aimed at AI agents. The GitBook's DexScreener link has stray appended characters (typo, not followed).
