# 42 (42.space) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:10 to 03:40 UTC). READ-ONLY: WebFetch of public pages, raw `.md` GETs of docs.42.space, unauthenticated GETs to `rest.ft.42.space` (documented public host), `gh api` reads of two public repos, a few DefiLlama GETs. No account, wallet, key, signature, POST/PUT/DELETE, on-chain call or PayBox tool was used. Third-party pages and API text were treated as untrusted data. The repo file `.env.example` was deliberately not read. The shared WebSearch budget ran out after one successful search, so press coverage rests on that search plus two article fetches.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months is flagged; nothing below is older than that).

Fixtures (<= 50 KB each): `docs/research/fixtures/42-42-space/` (listed in Sources).

---

## 0. Bottom line

1. **Live, yes (H).** The public read API serves live markets created as recently as 2026-10-16 and the flagship market last traded 2026-10-19 01:51 UTC. Docs changelog's last entry is 2026-07-02; the contracts repo was last pushed 2026-06-04 and the demo repo 2026-07-23.
2. **It is not a CLOB and not a binary Yes/No venue (H).** It is a bonding-curve "eventcoin" issuer with parimutuel settlement: each outcome is an ERC-6909 token minted/redeemed against one shared USDT pool on BNB Chain; at resolution the whole pool goes to holders of the winning token pro rata. A token's price is **not** a probability and its payout is **not** fixed.
3. **Public, unauthenticated read API exists (alpha) and is good (H).** `https://rest.ft.42.space/api/v1/...`, OpenAPI published in the docs, markets/prices/OHLC/stats/holders/activity/leaderboard. No websocket documented. No quote endpoint: executable quotes need on-chain `FTLensV2.simulateMint/simulateRedeem`.
4. **Trading is plain EVM transactions on BSC, no API key, no signed orders (H docs + contract source).** `USDT.approve(router)` then `FTRouterProxy.swapMarketV2(...)`. A PayBox EVM wallet could do this on BNB Smart Chain (56) in principle (M, untested).
5. **Liquidity is now tiny.** 66 live markets hold **$137k** total pool (largest single market $71k = 52%); lifetime API volume is $121M but ~90% of it was FIFA World Cup 2026 sports markets that have all finalised. Measured mint/redeem flow over the last 7 days on live markets: about **$0.7k across 52 trades** (own aggregation, section 9).
6. **Geo/ToS:** the Terms list **United States, UK, France, Germany, Italy, Singapore, Thailand, Australia, Canada (Ontario)** and ~30 others as Restricted Jurisdictions and ban VPNs. Resolution is by curated resolvers (Deep Thought Labs, "Cournot x Deep Thought Labs"), with creator-extendable deadlines and the right to void markets.
7. **Not an independent arbitrage leg in the strict sense** (variable payout) and its prices are uncalibrated at this depth. **adapter_priority = P2**: a cheap, public, keyless signal-only adapter (TGE/FDV, IPO market-cap, crypto-vs-crypto questions); do not route money through it.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://rest.ft.42.space/api/v1/markets?limit=1` (2026-10-19 03:13Z) | 200; JNJ price-range market, `startDate` 2026-10-16T08:36Z, `status:"live"`; `pagination.totalResults` 2820 | H |
| `GET .../markets?status=live` | 66 live, 0 not_started, 0 ended, 1 resolved, 2753 finalised | H |
| Last trade on flagship market (`/market-data/activity?market=0xBeac...`) | 2026-10-19 01:51:14Z; previous 2026-10-16 09:39Z | H |
| Homepage https://www.42.space | Title "Events Futures Asset Issuance Protocol"; product tiles Blitz and Grid ("Demo available, virtual funds"); links to docs, X, Discord, ticket.42.space | H (page-summary fetch) |
| Docs changelog https://docs.42.space/readme-1.md | Entries 2026-06-11 ... 2026-07-02 (3.5 months old) | H |
| BlockchainReporter, 2026-05-18 | "42 V2 has gone live" on BNB Chain; backer named: YZi Labs; promotional piece (the fetch summary calls it "largely promotional"), no stats | M |
| Finance Magnates, 2026-05-26 | Binance Wallet "Event Rush" feature, announced 2026-05-25, runs on the 42 protocol with a "demand-driven bonding curve" | M |
| DefiLlama `/protocols` (9.3 MB list) | No 42 / FortyTwo entry found (searched name, slug, url, category=Prediction Market on BSC) | H (absence) |

Verdict: **still_live = true**, but activity has collapsed since the World Cup (section 9).

---

## 2. Kind and market model

- **Kind: on-chain asset-issuance protocol with bonding curves + parimutuel settlement ("eventcoins").** Repo README: "curve-agnostic platform for event outcomes that prices via bonding curves and settles parimutuelly" (H, https://github.com/fortytwo-protocol/ft-contracts-public).
- **Outcome model: categorical, N mutually exclusive outcomes per market (3 to 15 in the live set), no binary Yes/No pair.** Live set: 22 markets with 8 outcomes, 13 with 7, 9 with 9, only 5 with 3 (H, own tally of `live.json`). Many are bucketed ranges (FDV, price, score). A "Draw"/"Others"/"No IPO" outcome is common.
- **Tokenisation (H):** ERC-6909 multi-token held by the market contract; `tokenId` is a decimal string and equals `2^outcomeIndex` (1, 2, 4, 8 ... seen: HYPE=1, BNB=2, Draw=4). Resolution `answer` is a **bitmask** over outcomes (timeline `answer:128`, `16`); multi-winner sets are allowed by design (docs "Multi-winning outcomes are supported but the initial phase will only include single-outcome markets").
- **Pricing (H docs):** mint = integrate the curve from current supply to post-mint supply; redeem = walk back down the curve **minus a dynamic redeem tax** (size-to-supply, liquidity and time-to-resolution sensitive). Docs: "Prices are not fixed representations of probability, but dynamic expressions of relative conviction and capital flow." Curve families on chain: PowerCurve, PowerCurveLegacy, PowerLDACurve(V2) (linear-decaying-auction time premium), ClockCurve (price/Blitz markets). Curves have time terms, so a quoted price drifts with the clock even with no trades (M, from `timeExponent`/`timeKink` params in deployments JSON).
- **Payout (H docs):** `payout per winning token = Market_TotalReserves / TotalSupply_WinningOT`; "the potential payout on each outcome is infinite" in the docs' words (variable, path-dependent).
- **Edge cases (H, contract source `FTMarketV2.sol` comment + HickupHH3 audit):** if no one holds the winning token the pool goes to the treasury "for redistribution"; creators can add outcomes after launch (`addOutcomes` appears in the audit PoC).
- **Product lines (H docs):** Event markets (this spec); **Blitz** (30-second BNB/ETH/SOL races, Chainlink prices, buy-only, 1% fee, winner takes the round pool); sports **Scoregrid** (exact score on a 6x6 grid) and Outright/Prop. Blitz is a game, not an arbitrage target.
- **Market versions:** `contractVersion` 1 (legacy, 8 live: Polymarket/Predict.fun FDV, F1, movies, chain questions; `feeRate` 0.008 present) and 2 (58 live; `feeRate` null, `oracle`/`creator` populated). The API says "1 = legacy, 2 = v2" (H).

### What an implied "probability" looks like (own analysis, M/L)
`price` (field `price`, also returned as `mid` under `projection=midpoint`) is the **marginal mint price in USDT per token** (0.0007 to 0.03 in live data), and `payout` = totalMarketCap / mintedQuantity (verified arithmetically on all three outcomes of the flagship market). Candidate weights:

| Market (2026-10-19) | Pool share `outcomeCap/totalMarketCap` | `price*supply/TMC` normalised | Note |
|---|---|---|---|
| HYPE vs BNB higher FDV Dec 31 (pool $71.4k) | HYPE 26.9% / BNB 71.8% / Draw 1.3% | 15.7% / 83.5% / 0.7% | raw sum of price/payout = 0.61 |
| US Senate 2026 party (pool $323) | D 43.0% / R 42.5% / Others 14.4% | 32% / 45% / 22% | "Others" at 14-22% is not credible |
| Ballon d'Or 2026 (pool $98) | Kane 48.9% | 50.8% | raw sum = 1.66 |

The raw `price/payout` sums range 0.6 to 1.7, so there is **no single consistent probability transform**, and nothing in 42's docs defines one. Pool share is the only measure that sums to 1 by construction; it behaves like parimutuel odds. Any cross-venue comparison must be treated as a weak signal, validated empirically before use. 42 itself says prices are not probabilities.

---

## 3. Chains and collateral

- **Chain: BNB Smart Chain only, chainId 56 (H, https://docs.42.space/for-developers/deployments.md).**
- **Collateral: USDT on BSC `0x55d398326f99059ff775485246999027b3197955`, 18 decimals; "used across all 42 markets"** (H docs; API shows `collateralSymbol:"USDT"`, `collateralDecimals:18` for all 66 live).
- **Funding on the 42 app (H):** email or wallet sign-in; "All tokens will be swapped and bridged to USDT on Binance Smart Chain"; direct deposits must be USDT on BSC.

### Contracts (docs table, H) vs repo deployments JSON (H) - they disagree in places
| Role | Docs (deployments.md) | Repo `deployments/56-core.json` | Note |
|---|---|---|---|
| FTRouterProxy (trading, V1+V2) | `0x888888886619275d33c00D3BC62DF94D700DCD42` | same | agree |
| FTMarketControllerV2 proxy | `0x8Fe93361D2B8b9519C4d20d47a319288Feec9072` | same | agree |
| FTLensV2 | `0x4AAd5A856941FB64df10362024e3Ece24023d4d1` | `0x25F1625255bf85Bc9cb748F3f9197876aA37996c` | **conflict** (docs newer? unknown) |
| PowerCurve | `0x0443E04e...` ("pricing math") | `0xDC26047458FEa8Bd45164217CCb7eE90b9bE10B8` (and `0x0443...` = "PowerCurveLegacy") | docs stale |
| PowerLDACurve | `0xa59096C2...` | `0x46B3BE67...` | conflict |
| ClockCurve | `0x495B31876c092c236d1b0Df5Cc953D45d41301F1` | same | agree |
| Curves actually used by live markets (API `curve`) | | `0xB9f661e6...` (31), `0xDC260474...` (26), `0x0443E04e...` (8), `0xa0076e85...` (1) | use API `curve`, not either list |

Not verified on chain this session (no RPC call made; Blockscout host for BSC returned 404). Treat which Lens address is current as an open question.

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Status | **Official, public, unauthenticated, "alpha": "subject to changes anytime."** Title "FortyTwo Read API" v1.0 | H |
| Docs | https://docs.42.space/for-developers/rest-api-alpha.md (index https://docs.42.space/llms.txt; each page embeds an OpenAPI 3.1.1 block) | H |
| Base URL | `https://rest.ft.42.space/` (paths under `/api/v1`). Root, `/api/v1`, `/openapi.json`, `/swagger.json`, `/health` all 404 | H |
| Auth | None for the endpoints below (all GETs returned 200 with no key). Docs describe no key at all | H |
| Rate limit | Not documented. Response headers on every call: `x-ratelimit-limit: 10`, `x-ratelimit-remaining: 59`, `x-ratelimit-reset` = the response's own Date epoch. The numbers are mutually inconsistent, so the real policy is unknown. I sent about 80 GETs to this host over ~40 minutes (mostly 1 to 2 s apart; the 6 paginated pulls were 2 s apart) and saw no 429 | H (headers) / L (policy) |
| Caching | `cache-control: public, s-maxage=30, max-age=0, stale-while-revalidate=300`; served via CloudFront. **Poll no faster than every 30 s** | H |
| Pagination | `limit` default 100, **max 500; above 100 you must send `Accept-Encoding: gzip` (or br) or you get `406 COMPRESSION_REQUIRED`** (verified both ways). `offset`; response `{data[], pagination:{hasMore,totalResults}}` | H |
| Errors | `{code, error, message}`, e.g. `-400 INVALID_PARAMS`, `-406 COMPRESSION_REQUIRED` | H |
| WebSocket / streaming | NOT FOUND (searched: all 45 pages in llms.txt, FAQ, homepage). Poll REST or index chain events | H (absence) |
| OpenAPI file | Only inside each docs page; no standalone spec URL found | H |
| SDK | Public demo repo https://github.com/fortytwo-protocol/v2-demo (MIT, vendored `sdk/`: ABIs, `reads/lens.ts`, `chain-ops/*`); contracts repo has no license field | H |

### Key endpoints (all `GET`, base `/api/v1`)
| Purpose | Path | Notes |
|---|---|---|
| List markets | `/markets` | filters: `status` (not_started, live, ended, resolved, finalised, all), `category`, `subcategory`, `topic`, `tag`, `title` (ILIKE, comma any-of), `collateral`, `oracle`, `creator`, `contract_version`, `volume_min/max`, `start_/end_date_*`, `order` (created_at, volume, volume_24h, collateral, start_timestamp, end_timestamp), `fields` projection, `locale` |
| Featured | `/markets/featured?per_tag=` | top live per `featured_N` tag by 24h volume |
| One market | `/markets/{market_address}` | full detail incl. `ancillaryData` (resolution rules JSON) |
| Lifecycle | `/markets/{market_address}/timeline` | `launched`, `extended` (with `newEndTimestamp`), `resolved`, `finalised` + `answer` bitmask and `winningOutcomes` |
| Categories | `/markets/categories`, `/markets/categories/{slug}` | 18 categories incl. `liveMarketCount` |
| Outcome tokens | `/markets/tokens` | filter by market / token_id / outcome_index |
| **Prices** | `/market-data/prices?market=` (+ `token_id(s)`, `outcome_index/indices`, `projection=midpoint`) | returns `{market,tokenId,outcome,price,outcomeCap,totalMarketCap,mintedQuantity,updatedAt}`; `mid` equals `price` (marginal mint price) |
| **Batch stats** | `/market-data/stats?market=a,b,...` (max 50, comma list verified) | `marketCap,totalVolume,traders,outcomeStats[{price,marketCap,payout,mintedQuantity,*Change24h}]` |
| Price history | `/market-data/prices/history`, `/prices/event-history` | step-held last-trade series / per-event marginal prices |
| OHLC | `/market-data/ohlc?market=&outcome_index=&interval=` | intervals 1s,10s,1m,3m,30m,2h,6h,12h,1d; candle has `o,h,l,c,v,payout*,openCollateral,...`; max 5000 points |
| Token stats | `/market-data/tokens/stats` | per-outcome buy/sell volume, 30m/1h/4h/24h deltas |
| Holders | `/market-data/holders`, `/holders/summary`, `/traders` | |
| Trades/activity | `/market-data/activity?market=|user=|transaction_hash=` | **requires one of user/market/tx hash** (else 400); rows are MINT/REDEEM/FINALISE/CLAIM with `userAddress`, `size`, `collateral`, `tradePrice`, `marketCapAtTime` |
| Wallet data | `/market-data/positions`, `/closed-positions`, `/pnl/daily`, `/pnl/snapshot`, `/leaderboard`, `/leaderboard/stats/{wallet}`, `/leaderboard/top-trades`, `/token-races/*` | Blitz and per-wallet analytics |
| Order book / depth / quote | **NONE.** Quotes only via on-chain `FTLensV2.simulateMint/simulateRedeem(market, tokenId, amount, isExactIn, dataSwap, dataGuess, integratorFeeBps)` which are non-view (use `eth_call`/`simulateContract`); the SDK leaves `dataSwap`/`dataGuess` as `0x` for most uses | H |

### Verified response shapes (fixtures)
- `GET /markets?limit=1` -> `markets_default_limit1.json`: market has `address, questionId, question, slug, collateral*, curve, startDate, endDate, status, oracle{address,name}, creator, contractVersion, ancillaryData[] (JSON string with description = resolution rules), categories[], subcategories[], tags[] ("Normal" | "Early Resolution"), volume, totalMarketCap, traders, elapsedPct, feeRate, resolutionTime, resolvedAnswer, outcomes[{tokenId,name,index,price,volume,marketCap,payout,mintedQuantity,mintedQuantityRaw}]`. Timestamps are ISO-8601 strings in `/markets` but unix seconds in `/timeline`, `/activity`, `/ohlc`.
- `GET /market-data/prices?market=...` -> `prices_hype_vs_bnb.json`; `GET /market-data/stats?...` -> `stats_hype_vs_bnb.json`; `GET /market-data/ohlc?...&interval=2h` -> `ohlc_hype_vs_bnb_outcome1_2h.json`; `GET /markets/categories` -> `categories.json`; `GET /markets/{addr}/timeline` -> `timeline_finalised_example.json`.
- Payload size: the full 66-market live page is 654 KB (resolution text); use `fields=` projection (e.g. `address,question,status,endDate,outcomes,totalMarketCap,volume,categories`) or the batch `/market-data/stats`.

### Adapter notes
- Identity: venue market id = `address` (checksummed BSC address); `questionId` (bytes32) is the oracle-side key; outcome id = `tokenId` (string, power of two). Outcome names contain underscores in v1 markets ("Below_$5B") and are free text; ranges need parsing.
- Status mapping: `live` -> open; `ended`/`resolved` -> awaiting finalisation; `finalised` -> settled. Observed **resolved -> finalised lag 36.4 to 38.6 h** in three finalised v2 markets (timeline timestamps; H).
- `startDate` of v1 markets can predate the 2026-05-18 V2 launch (the Polymarket FDV market started 2026-02-26). Earliest market in the API: 2026-02-04.
- Linking for the aggregator: market titles are English/Chinese mixed; `ancillaryData` carries the resolution criteria and source (CoinGecko, Nasdaq, Chainlink, etc.), which is what must be diffed against other venues' rules.

---

## 5. Trade path

| Item | Finding | Tag |
|---|---|---|
| Mechanism | Direct on-chain call from any EOA/contract wallet; no off-chain order, no API key, no EIP-712 order signing | H (docs + `FTRouterV2.sol`) |
| Buy/sell | `FTRouterProxy.swapMarketV2(market, receiver, tokenId, SwapParams{amount, minOutOrMaxIn, isMint, isExactIn}, dataSwap, dataGuess, integrator, integratorFeeBps)`; v1 markets use `swapMarketV1(...)`; generic `swap(...)` routes by version. Slippage via `minOutOrMaxIn`. `integratorFeeBps` max 1000 (10%) | H |
| Approvals | Router pulls USDT (ERC-20 approve to router) and, on redeem/claim, pulls ERC-6909 tokens from the caller (operator/approval on the market contract) | M (inferred from `_transferIn` usage; not exercised) |
| Claim | `claimAllSimple(market, receiver)` after `isFinalised` and `answer != 0` | H |
| Quote | `FTLensV2.simulateMint/simulateRedeem` (+ batch `simulateMints/Redeems`, `...ForUser`) | H |
| Gas | Native BNB from the EOA. (42's own app pays gas in USDT from a "proxy wallet", a UI-side feature, not part of the contract path) | H docs fees page / M |
| Atomic multi-leg | `multicall(Call[])` on the router for whitelisted functions | H |
| Reference client | https://github.com/fortytwo-protocol/v2-demo ("Connect any injected wallet ... on BSC") | H |

**PayBox reachability (M, untested):** PayBox's chain catalog lists BNB Smart Chain (56) (from `docs/research/06-paybox-platform.md`, live `discover_tokens`, 2026-10-19). A PayBox EVM wallet could submit two single-call `io.paybox/transactionProposal`s on `eip155:56`: (1) USDT `approve(router, amount)`, (2) `swapMarketV2(...)`; claim is a third. Needs BNB for gas and user approval each time; PayBox shows raw calldata only. No credential, no signature scheme beyond ordinary transactions, no human-created API key (simpler than Predict.fun/Opinion). Blockers are not technical: geo ToS (section 8) and unquotable, variable-payout economics (section 10). No PayBox tool was called.

---

## 6. Fees

| Fee | Value | Who pays / where it goes | Tag |
|---|---|---|---|
| Protocol fee | 0.4% | user, to treasury | H docs (https://docs.42.space/getting-started/protocol-mechanics-101/fees.md) |
| Platform fee | 0.4% | user; recipient not stated (inferred = the 42 frontend's integrator fee, since the router has a per-call `integratorFeeBps`) | H (rate) / M (recipient) |
| Combined | **0.8% on mints and redeems** | `MintFee = M * f`; `RedeemFee = R * (1 - tau) * f` where tau = redeem tax; docs example: 100 USDT mint = 0.8 USDT, 100 USDT redeem at 5% tax = 0.76 USDT | H |
| Redeem tax (spread) | dynamic, rises with redeemed share of supply, falls with total supply, rises toward resolution ("information tax"); UI shows a "high exit spread" warning | seller; withheld amount stays in the pool for winners | H docs |
| Blitz | 1% = 0.6% integrator + 0.4% protocol | user | H |
| API field | `feeRate` 0.008 on the 8 v1 markets, `null` on v2 markets | | H |
| Direct router call | caller chooses `integrator` and `integratorFeeBps` (0 allowed, max 1000 bps), so a direct integrator may pay only the protocol fee and could also **earn** an integrator fee | M (from source; protocol-fee value for v2 not re-derived from code) |
| Gas | BNB, separate | | H |

Round-trip cost for an arbitrage unwind = 2 x 0.8% plus the redeem tax plus curve slippage; the redeem tax makes the bid materially below the displayed mint price, and no endpoint exposes the bid.

---

## 7. Resolution mechanism and dispute risk

- **Mechanism (H, API + contracts):** each market has an `oracle` address and per-question `ancillaryData` rules. Live oracles: "Cournot x Deep Thought Labs" (32 markets), "Deep Thought Labs" (26), none shown on the 8 v1 markets. Source contracts: `FTUmaAdaptor` (bridge to UMA Managed Optimistic Oracle V2), `FTCournotAdaptor` (role-based: RESOLVER / PROPOSER can resolve, unresolve, lock and unlock; FINALISER finalises), `FTDisputeRegistry` (anyone can `postDispute(questionId, update, answerProposed)`, stored as an event/record only, not an on-chain challenge game). Which adaptor serves which live market is NOT FOUND.
- **Lifecycle (H timeline data):** launched -> (optionally **extended**, creator moves the deadline) -> resolved -> finalised ~36-39 h later -> claim. The Chain DeFi TVL Race market (volume $4.5M) was extended before resolving.
- **Early resolution:** tag `Early Resolution` (docs: resolved earlier "if the underlying event concludes"); `is_early_resolution` is in ancillary data.
- **Terms (H, https://docs.42.space/legal/terms-of-use.md):** the Resolution Mechanism "may include decentralized oracle systems / centralized determination, or hybrid" and the Company "reserves the right to amend" it; decisions are "final and binding"; the Company may cancel or void markets (event cancelled, "ambiguity in resolution criteria", manipulation, technical errors, regulatory necessity) and then returns the pool pro rata to contributors; "Users may challenge a proposed resolution by following the procedure specified on the interface".
- **Risk assessment (M):** resolution is **curated and effectively centralised** for the markets that matter; dispute risk is dominated by the operator's discretion, deadline extensions and the zero-winner-supply sweep, not by a permissionless oracle. Market rules do name concrete sources (CoinGecko FDV, Nasdaq close, Chainlink) and have explicit fallbacks (e.g. HYPE-vs-BNB resolves "Draw" if CoinGecko data is missing).
- **Audits (H):** Zellic, HickupHH3, Saw-mon & Natalie PDFs in the repo `audits/` folder (https://github.com/fortytwo-protocol/ft-contracts-public); I read only the HickupHH3 summary (one LOW: pool not swept when no one wins).

---

## 8. Geo, ToS, automation

- **Restricted jurisdictions (H, ToS 2.2):** "Australia, Belgium, Belarus, Burundi, Central African Republic, Canada (Ontario), Congo (Kinshasa), Cuba, Germany, Ethiopia, France, United Kingdom, Iran, Iraq, Italy, North Korea, Lebanon, Libya, Myanmar, Nicaragua, Poland, Portugal, Russia, Singapore, Somalia, South Sudan, Sudan, Syria, Thailand, Taiwan, United States Minor Outlying Islands, United States, Venezuela, Yemen, Zimbabwe, contested regions of Ukraine".
- **VPN ban (H, 2.3):** "YOU ARE EXPRESSLY PROHIBITED from using any virtual private network ..., proxy server, IP masking tool ... to circumvent geographic restrictions"; remedies include "forfeiture of funds".
- **Automation (H, 6.2):** prohibits "Deploying automated systems that interfere with Protocol operations or other users" and exploiting bugs. Plain read-only polling and ordinary trades are not named; "interfere" is undefined. Market manipulation (wash trading, spoofing, layering) is banned (6.1). 18+, sanctions screening.
- **Read API terms:** no API-specific ToS found (searched docs index). The API did not geo-block my reads; reads are not the same as permission to trade, and I did not test geo behaviour deliberately.
- **Custody (H, 5.3):** "User funds are maintained in non-custodial smart contracts."
- **Dispute forum (H, 9):** LCIA arbitration in Singapore, English law, class-action waiver.

---

## 9. Liquidity (all API numbers fetched 2026-10-19 ~03:14 to 03:40 UTC)

| Metric | Value | Source / tag |
|---|---|---|
| Markets ever (API, status=all) | 2820 (2753 finalised, 66 live, 1 resolved) | H |
| Lifetime volume, sum of `volume` over all 2820 | **$121.3M** (definition of `volume` undocumented; may be gross mint+redeem, so double-counted vs "turnover") | H sum / M meaning |
| By first category | Sports $109.1M (595 mkts), Crypto $8.3M (1072), Finance $2.5M (82), Price $0.43M (551), Culture $0.24M, AI $0.24M | H |
| Peak | by market start month: Jun 2026 $101.0M (World Cup), Jul $11.1M, Aug $4.7M, Sep $0.13M, Oct $0.003M. Top market "2026 World Cup Winner?" $68.0M (finalised) | H |
| **Live now: 66 markets, summed `volume` $2.12M (lifetime), summed pool (`totalMarketCap`) $137.4k** | HYPE-vs-BNB FDV $71.4k pool / 2,916 traders; Polymarket-FDV bucket market $37.9k; Predict.fun-FDV $7.6k; next ones under $2k | H |
| Recent flow on live markets | mint/redeem collateral last 7 d approx **$703 in 52 trades**, last 24 h approx **$151 in 6 trades**, over the 38 live markets with lifetime volume >= $500 (own aggregation of `/market-data/activity?market=&start=`; the other 28 live markets each have < $500 lifetime and are not sampled) | H data / M aggregation |
| TVL on DefiLlama | not listed (section 1). Pool-of-record proxy = $137k | H |
| Binance-side claim | Event Rush launch coverage gives no volume figures | M |

The daily stock-range markets (JNJ, TSLA, BMBL, FUN) and the BTC year-end market hold pools of roughly $19 to $58 (JNJ $19, BTC year-end $58). This is a seeded, near-empty book except for 3 to 4 markets.

---

## 10. Event coverage and arbitrage overlap

Live 66 by first category (H, own tally): Crypto/TGE 17, Games 13, Crypto 11, Finance 8, Sports 4, Culture 4, Finance+AI 2, others 1 each. Categories and `liveMarketCount` come from `/markets/categories`: Crypto 30, Finance 13, Games 14, TGE 17, Culture 7, Sports 4, AI 3, Economy 1, Geopolitics 1, Meme 1; FIFA World Cup 0 (finished).

| 42 live question (2026-10-19) | Plausible counterpart venues (M; counterpart markets not checked this session) | Arb quality |
|---|---|---|
| Polymarket / Predict.fun / Metamask / Base / OpenSea token FDV-after-TGE buckets, "Will Polymarket launch a token", "Which chain will Polymarket migrate to" | Polymarket, Predict.fun, Opinion, Limitless list token-launch/FDV markets | bucket schemes differ; 42 pools $0.1k-$38k |
| OpenAI / Discord / YMTC market cap after IPO | Polymarket, Kalshi | thin |
| US Senate 2026 control | Polymarket, Kalshi, PredictIt (pool $323) | 42 price clearly noise at this depth |
| F1 2026 drivers' champion, Ballon d'Or 2026, LoL Worlds 2026 | Polymarket, sports books | thin; two duplicate F1 markets |
| BTC year-end price, ETH move after a post, daily US-stock price ranges (JNJ, TSLA, BMBL, FUN) | Kalshi / Polymarket crypto-price and equity ranges | pools under $60 |
| Eurozone HICP 2026, highest-grossing film 2026, GTA VI sales/review | Kalshi, Polymarket | thin |
| HYPE vs BNB FDV (the only market with real size) | essentially unique to 42 | no cross-venue leg |

**Structural obstacles to arbitrage (M):** (a) payout per token is `pool/winning supply`, which changes with every later trade, so a hedge cannot lock a margin; (b) price is a marginal mint price, not a probability, and the two-sided cost depends on the redeem tax; (c) round-trip friction >= 1.6% plus tax; (d) pools of tens to hundreds of dollars cannot absorb a size; (e) geo exclusion of the US/UK/EU majors.

**Liquidity sharing:** Binance Wallet's **Event Rush** is a front end that "runs on the 42.space protocol" (M, Finance Magnates 2026-05-26), so it reads the same pools and is **not** an independent leg. It is a different feature from Binance Wallet's Predict.fun-backed prediction trading (see `binance-wallet-prediction-markets-via-predict-fun.md`). No evidence that 42 pools mirror another venue's book; its TGE/FDV questions are 42-originated and priced by its own curves. 42 is therefore an independent venue in liquidity terms, but a poor leg for the reasons above.

---

## 11. Adapter spec (if built)

1. **Discovery:** `GET /markets?status=live&limit=100&fields=address,questionId,question,slug,status,endDate,startDate,categories,subcategories,tags,curve,contractVersion,totalMarketCap,volume,traders,outcomes,oracle` every 5 to 10 min (66 live now; paginate on `hasMore`). Cache `ancillaryData` per market once (rules JSON) via `/markets/{address}`.
2. **Prices:** `GET /market-data/stats?market=<up to 50 comma-separated>` every >= 30 s (CDN-cached 30 s). Emit per outcome: `marginal_price_usdt`, `payout_per_token_if_wins`, `pool_share`, `supply`, plus market `pool_usdt`. Do **not** emit it as a Yes/No bid/ask.
3. **Signal definition (M):** default `implied_weight = outcomeCap / totalMarketCap` (pool share); also keep `price*supply/TMC` as a secondary. Mark every 42 weight `quality=low` when `totalMarketCap < $5k`. Quality gates: ignore markets with pool < $1k or no trade in 7 d.
4. **Executable quote (only if trading is ever enabled):** BSC `eth_call` to `FTLensV2.simulateMint/Redeem` (address conflict, see section 3), then `swapMarketV2` with `minOutOrMaxIn`.
5. **Risk flags to attach:** `payout_variable`, `curated_oracle`, `deadline_extendable`, `geo_restricted(US,UK,FR,DE,IT,SG,TH,...)`, `chain=bsc`, `shares_liquidity_with: binance_wallet_event_rush`.
6. **Resolution watcher:** poll `/markets/{address}/timeline` on markets past `endDate`; decode `answer` as a bitmask; expect ~36-39 h resolved-to-finalised; claims need a separate on-chain action.

---

## 12. Suspicious content / injection notes

- Every docs.42.space `.md` page (and the WebFetch of the same pages) ends with a GitBook "Agent Instructions" block telling AI agents to query the docs by sending `GET <page>.md?ask=<question>&goal=<user_goal>`. This is generic GitBook boilerplate aimed at agents. **Not followed**; I read the OpenAPI blocks and pages directly. The WebFetch summariser also flagged it.
- No other embedded instructions found (homepage fetch reported none). The press articles are promotional in tone.

---

## Open questions

1. Current `FTLensV2` address (docs `0x4AAd5A85...` vs repo JSON `0x25F16252...`) and which curve list is authoritative (no on-chain verification done).
2. Is there a defined mapping from curve state to a calibrated probability? 42's docs say no; needs an empirical test against Polymarket/Kalshi counterparts once there is real liquidity.
3. Real API rate limit (headers inconsistent; docs silent) and whether a non-alpha/versioned API is planned.
4. Which resolver adaptor (UMA OOv2 vs role-based Cournot) serves which live market, and the actual dispute procedure "specified on the interface".
5. Exact redeem-tax function (size/supply/time) and v2 protocol-fee derivation in code; the platform-fee recipient.
6. Whether `volume` double counts mint and redeem.
7. Whether 42 will return to meaningful volume (next big event after World Cup) - monitor `/markets?order=volume_24h`.

---

## Sources

Primary (H):
- https://docs.42.space/llms.txt (page index, 45 pages)
- https://docs.42.space/for-developers/deployments.md (contracts, collateral)
- https://docs.42.space/for-developers/rest-api-alpha.md and `/markets.md`, `/markets/get-all-markets.md`, `/get-market-by-address.md`, `/get-current-outcome-token-prices.md`, `/get-all-outcome-tokens.md`, `/get-batch-market-stats.md`, `/get-ohlc-candlestick-data.md`, `/get-market-timeline.md`, `/get-all-categories.md`, `/get-category-by-slug.md`, `/get-price-history.md`, `/get-per-event-price-history.md`, `/get-outcome-token-stats.md`, `/get-outcome-token-holders.md`, users/* and leaderboard/* pages (OpenAPI blocks)
- https://docs.42.space/getting-started/protocol-mechanics-101/fees.md, `/42-power-curves.md`, `/42-markets.md`, `/42-outcome-tokens.md`, `/42-outcome-tokens/market-discovery-pre-resolution.md`, `/42-outcome-tokens/post-resolution.md`, `/convex-payout-dynamics.md`, `/glossary.md`
- https://docs.42.space/getting-started/market-types.md, `/quickstart/key-concepts.md`, `/quickstart/tl-dr-42-in-30-seconds.md`, `/publish-your-docs/blitz.md`, `/publish-your-docs/onboarding/*.md`, `/publish-your-docs/trading-eventcoins/*.md`
- https://docs.42.space/legal/terms-of-use.md, https://docs.42.space/security/markdown.md, https://docs.42.space/for-developers/interactive-blocks.md (FAQ), https://docs.42.space/readme-1.md (changelog)
- https://www.42.space (homepage, page-summary fetch)
- https://rest.ft.42.space/api/v1/* (live GETs, 2026-10-19)
- https://github.com/fortytwo-protocol/ft-contracts-public (README, `deployments/56-core.json`, `src/FTRouterV2.sol`, `src/FTMarketV2.sol`, `src/lens/FTLensV2.sol`, `src/adaptors/*`, `audits/HickupHH3/09-29-FortyTwo-Review.md`; pushed 2026-06-04)
- https://github.com/fortytwo-protocol/v2-demo (README, `sdk/src/reads/lens.ts`; pushed 2026-07-23)
- https://api.llama.fi/protocols (DefiLlama list; no 42 entry)

Secondary (M):
- https://www.financemagnates.com/cryptocurrency/exchange/binance-embeds-event-trading-into-its-wallet-as-prediction-markets-grow-into-core-infrastructure/ (2026-05-26, Event Rush)
- https://blockchainreporter.net/42-v2-launches-on-bnb-chain-introducing-eventcoins-as-a-new-tradable-asset-class (2026-05-18, V2 launch, YZi Labs)
- Search result listing of a KuCoin Square post on "42 V2 on BNB Chain" (title only, not read)
- Repo cross-reference: `docs/research/06-paybox-platform.md` (PayBox chain catalog incl. BNB 56, 2026-10-19), `docs/research/venues/binance-wallet-prediction-markets-via-predict-fun.md`

Fixtures in `docs/research/fixtures/42-42-space/`: `markets_default_limit1.json`, `markets_live_top3_by_volume.json`, `prices_hype_vs_bnb.json`, `stats_hype_vs_bnb.json`, `ohlc_hype_vs_bnb_outcome1_2h.json`, `categories.json`, `timeline_finalised_example.json`, `repo_deployments_56-core.json`, `response_headers_markets_selected.txt`, `DERIVED_live_markets_overview_2026-10-19.json` (researcher-derived summary of the 66 live markets, not a raw response). The activity feed was sampled for aggregation only and not saved because rows contain third-party wallet addresses.

Privacy: all scripted requests used the User-Agent `insurance-markets-research/0.1`; no personal identifier appears in any request, note or fixture. One scratch file was briefly written to `/tmp` by mistake (a failed Blockscout GET body, deleted immediately); everything else stayed in the session scratchpad.
