# ADI Predictstreet (adipredictstreet.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran about 01:40-02:00 UTC). READ-ONLY: public web pages, the official docs site and its OpenAPI spec, public static JS chunks (downloaded as text, never executed), unauthenticated GETs to the documented API host, one anonymous read-only WebSocket subscribe (about 9 seconds), public explorer and DefiLlama GETs, one read-only PayBox catalogue lookup (`discover_tokens`, mode `chains`). No account, no wallet, no key, no signature, no POST/PUT/DELETE, no payment, no browser automation. Generic User-Agent `insurance-markets-research/0.1` on every scripted request. Third-party text was treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, summariser output, or my inference from first-hand data; **L** = weak or stale.

Limits: the WebSearch budget was exhausted before I could run a single search, so all press and licence context comes from direct fetches only (iGaming Business, Sportsmint, Fanatics legal page, Gibraltar register not re-fetched). Several facts that I could not re-verify are marked "(sibling note)": this venue was already specced earlier today under the name PredictStreet in `docs/research/venues/predictstreet.md`. **This file and that one describe the same venue; the registry should keep one entry.** I did my own probes before reading the sibling note, and the two agree on every material number except the depth count (section 10).

Fixtures (unauthenticated GETs, each <= 50 KB, third-party wallet addresses replaced by `0xREDACTED`): `docs/research/fixtures/adi-predictstreet/` (listed at the end of section 16).

---

## 0. Bottom line

1. **Live, regulated-looking, independent order book, excellent public read API, almost no liquidity.** The site, API, docs, WebSocket and chain are all up on 2026-10-19 (H). 2,689 events / 18,095 open markets listed (H), but the whole venue showed about **$621 of 24h volume** across 55 markets (API sum, H) and DefiLlama reports **$3.7k 24h / $50k 7d** (H); only 13 of 205 sampled order books carried a real two-sided quote and only **five Champions League match-winner markets** had a meaningful resting bid (about $250 each; four with 3-cent spreads) (H, section 10).
2. **Read side is official, public and keyless**: REST (OpenAPI 3.1, 103 paths), anonymous `/ws/market`, Polymarket-shaped ids (`conditionId`, `yesTokenId`, `noTokenId`), neg-risk groups. A read adapter is a day of work (H).
3. **Trade side is gated, not self-service**: partner API key issued by ops under a signed partner agreement + KYC-cleared wallet + EIP-712 order signature with a per-user on-chain vault as `maker`; Terms 6.1 bans bots/scripts "except where expressly permitted by the Company in writing" (H). No path for an anonymous agent.
4. **Not reachable through PayBox in practice**: chain 36900 is not in PayBox's chain catalogue (H, live call). The order itself is a plain EOA EIP-712 signature, so signing is conceptually possible, but funding, KYC, the partner key and geo make it a no (section 6).
5. **Fee drag is high**: k = 600 bps on all 18,095 markets, charged on both legs; about 3.0% of notional per leg at P = 0.50, 0.6% at P = 0.90 (H).
6. **Resolution is centralised**: the operator proposes the outcome from sports-data vendors (LSports for 17,991 of 18,095 markets, including US politics), a 2h challenge window, one 500 USDC challenge per market, the operator decides; Terms 5.4/5.5 let it void or amend a settlement (H). Four disputes in the public feed since June.
7. **Not a shared-liquidity leg**: own off-chain CLOB, own vault custody. The Kalshi and Fanatics tie-ups are branding/distribution per both parties' own text (H, section 11).
8. **adapter_priority = P2**: build the cheap read adapter as a signal/price source for the handful of liquid UCL-style markets and for LSports-resolved metadata; never a trade leg. Re-check if a market-maker programme produces depth on overlap markets.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | `https://adipredictstreet.com/` HTTP 200, Next.js app behind Cloudflare; shows live events dated 2026-10-19..21 (UCL, Serie A, EPL, KBO, Saudi league, BTC/ETH hourly and daily up/down) | H https://adipredictstreet.com/ |
| API health | `GET https://core-api.adipredictstreet.com/health` -> `{"status":"ok","service":"core-api","timestamp":"2026-10-19T01:40:14.577Z"}` | H |
| Catalogue size | `GET /api/events/stats` -> `{"total":2689,"knockoutStage":0,"groupStage":0,"matches":350,"tournament":2339,"live":0}`; `GET /api/events` -> `total 2689, openMarketCount 18095, totalMarketCount 18298` (task hint said 2,655 / 17,806: the catalogue is still growing) | H |
| Operator | "Predict Street Limited, ... Gibraltar", company no. 126487, "Remote Gambling Licence Number: 167", regulated "as a betting intermediary by the Gibraltar Licensing Authority" (footer and Terms) | H https://adipredictstreet.com/terms |
| Launch | iGaming Business (dated 10 June 2026): "went live on 8 June"; "first consumer application built on ADI Chain"; licensed as a betting intermediary on 26 March under the 2005 Gambling Act | H (what the article says) https://igamingbusiness.com/prediction-markets/adi-predictstreet-launches-prediction-market-ahead-world-cup-2026/ |
| Chain activity | Blockscout `GET /api/v2/stats`: 1,728,016 blocks, 2,852,011 total tx, 14,783 tx today, 710,413 addresses. Exchange contract `CTFExchange` verified, 342,154 tx lifetime | H https://explorer-bls.adifoundation.ai/api/v2/stats |
| DefiLlama | protocol id 8156, category Prediction Market, chain ADI, listed 2026-07-23, TVL $1,339,215 on 2026-10-18 | H https://api.llama.fi/protocol/predictstreet |
| Docs | Mintlify docs `https://docs.adipredictstreet.com`, OpenAPI `version 2026-06-16`, live responses carry `x-api-version: 2026-04-01`; rate-limit page says its values are "live production values as of 2026-05-26" (about 5 months old) | H |

Verdict: **still_live = true.** Activity has collapsed since the World Cup (section 10), but the product is operating.

---

## 2. Kind and market model

- **Kind (H, https://docs.adipredictstreet.com/introduction):** "off-chain central-limit orderbook" with "on-chain custody" and batch on-chain settlement; automated oracle settlement. A Polymarket-architecture fork (Gnosis ConditionalTokens, CTF Exchange, NegRiskAdapter) with **per-user vault contracts** in place of proxy wallets. Matching is off-chain; trade rows go `matched -> settled` in about 2-3 s (H, `trades-sample.json`: `createdAt` 18:11:12.264 -> `settledAt` 18:11:14.572).
- **Binary and neg-risk categorical only. No scalar, no AMM, no parimutuel (H).** Of 18,095 open/pre-market markets, 12,066 are neg-risk siblings (`negRiskEligible: true`, grouped by `negRiskMarketId` + `negRiskQuestionIndex`) and 6,029 plain binary (H, derived, `catalogue-stats.json`). A multi-outcome event is a set of sibling YES/NO markets; `convertPositions` collapses a NO basket.
- **Outcome tokenisation (H, `platform-contracts.json`, market payloads):** ERC-1155 positions in `ConditionalTokens` (`0xD28B8295Cd57F205e4d080Ff4c6d23C06a9EEe3a`); per market `conditionId`, `questionId`, `yesTokenId`, `noTokenId` (uint256 decimal strings). Each share pays 1 USDC.e.
- **Book semantics (H, https://docs.adipredictstreet.com/concepts/markets/orderbook):** one book per binary market; `outcome=0` returns the YES view where a NO bid at p appears as a YES ask at 1-p; levels aggregated per price; response `hash` (16 hex) equals the WebSocket `book_snapshot.hash` for reconciliation. Tick 0.01 (99 levels), in-play `liveTick` can be 0.05; minimum order notional 1 USDC; LIMIT/MARKET with GTC/IOC/FOK (H, https://docs.adipredictstreet.com/concepts/trading/placing-orders).
- **Price fields (H, https://docs.adipredictstreet.com/concepts/markets/overview):** `outcomePrices` = best ask, else last trade, else null; `chances` = book midpoint if two-sided and spread <= 0.10, else last trade, else 1/outcomeCount. Observed `["0.99","0.99"]` on several football markets is a sentinel-ask artefact (below), not a price.
- **Sentinel quotes (H, 12 of 12 top-volume books read first, and the same pattern throughout the later 205-book survey):** books carry a resting 100-share bid at 0.01 and a 100-share ask at 0.99 (the only quotes on many football markets). Strip bids <= 0.01 and asks >= 0.99 before computing any edge.
- **Lifecycle (H):** `PRE_MARKET -> OPEN -> CLOSED -> PENDING_RESOLUTION -> RESOLVED`, plus `PAUSED`, `SUSPENDED`, `POSTPONED`, `DELAYED`, `DISPUTED`, `VOIDED`. Open list today: 18,027 `OPEN`, 68 `PRE_MARKET`.
- **Catalogue by vertical (events / markets, H derived 2026-10-19):** politics 1,645 / 10,693; financials 232 / 2,188; economics 247 / 2,012; football 193 / 977; climate 112 / 736; culture 44 / 578; science 50 / 301; basketball 56 / 236; american football 58 / 174; hockey 27 / 83; crypto 8 / 72; cs2 14 / 31; baseball 2 / 13; cricket 1 / 1. Many politics events resolve in 2027-2040 (grouped long-dated markets).
- **Crypto (H):** only BTC and ETH **Up/Down windows** (5m, 15m, 1h, 1d), `crypto.productType = UP_DOWN_WINDOW`, instrument `BTC-USD` / `ETH-USD`; frozen window `openPrice`; settled from Chainlink data (CoinGecko for dominance/market-cap products). No strike-price ladders in the open list.

---

## 3. Chains and collateral

- **Single chain: ADI Chain mainnet, chainId 36900**, native token ADI (18 decimals), RPC `https://rpc.adifoundation.ai`, Blockscout explorer `https://explorer-bls.adifoundation.ai` (H https://docs.adipredictstreet.com/environments). A Chainlink CCIP bridge to Ethereum is configured (`ccipBridge.destChainSelector` in `/api/platform/contracts`; web config: source chain 1, a CCIP router, USDC `0xA0b8...eB48` on Ethereum) (H).
- **Collateral: USDC.e** (bridged USDC, 6 decimals) at `0x9cb8142aEBBcdc60AF7c97Af897A67A8f3CA71C2`; EIP-2612 domain `{name:"USDC.e", version:"2"}` (H, `GET /api/platform/contracts`). The FAQ page text mentions "USD1" in places; the API, docs and DefiLlama all say USDC.e, so USDC.e is authoritative for integration (H/L conflict noted).
- **Contracts (H, `GET /api/platform/contracts` 2026-10-19 and docs environments page):** ConditionalTokens `0xD28B8295Cd57F205e4d080Ff4c6d23C06a9EEe3a`; CTFExchange (binary) `0x90EA87493E208A14011EC700Ac9cbAf4d064acc0`; NegRiskCtfExchange `0x79ACbb874dd01044FA38a89c1478E60FaAB40D00`; NegRiskAdapter `0x29e58C3916d1fD235f3d1e7fCF640fd1fA8BDb1e`; VaultFactory `0xc16B8b190064451c2FeEb2e77c4B2aC4c7009552`; DepositLimitRegistry (proxy) `0x744ff21c797C16272EEaE85B9E726d1A2a4E6BBE`; Oracle (binary) `0x320346B72dA29a680C0314440D5A93255eb05414`; NegRiskOracle `0xf6E9A4322b3e3a5AA00545fc206A0be1cbe0D140`; MulticallExecutor `0x634FFddF657Bb6B2237A404c94A0f313d376848e`. The exchange is verified on the explorer (H).
- **Custody (H https://docs.adipredictstreet.com/concepts/vaults/overview):** every trader has a non-upgradeable `Vault` deployed by `VaultFactory` (`vaultOf(eoa)`); USDC.e and outcome tokens sit in the vault. Withdrawals, split/merge and neg-risk converts need a **dual signature (user EIP-712 + backend co-sign)** after AML screening; MLRO review path is "typically within 1 business day". A 7-day-timelocked emergency withdraw exists if the platform goes dark. Implication: the operator can delay withdrawals by withholding the co-signature.
- **Funding paths (H docs + web config):** (a) `approve` + `vault.depositERC20` (needs native ADI gas); (b) **gasless EIP-2612 permit deposit** relayed by the platform (`POST /api/deposits/relay`); (c) CCIP bridge from Ethereum USDC and a Swapper integration in the web app; (d) the web config also has `DEPOSIT_FROM_POLYMARKET_ENABLED=true` (funding convenience, not liquidity sharing). `DEPOSIT_WITHOUT_KYC_ENABLED=false`.
- **Deposit caps (H https://docs.adipredictstreet.com/concepts/deposits/limits):** on-chain by KYC level, rolling 12 months: Basic 2,000; Standard 50,000; Enhanced 150,000; Advanced 200,000; VIP none. A wallet with tier 0 reverts `KycRequired`.

---

## 4. Read API (official, public, keyless)

- **Docs:** https://docs.adipredictstreet.com/introduction ; index https://docs.adipredictstreet.com/llms.txt ; OpenAPI 3.1 https://docs.adipredictstreet.com/api-reference/openapi.json (title "PredictStreet API", version 2026-06-16, 103 paths; the path list is in `openapi-paths.json`). The docs state: "Liquidity aggregators ... Read-only access is available without posting collateral." (H)
- **Base URLs:** REST `https://core-api.adipredictstreet.com` (production, ADI mainnet; staging "on request"). WebSocket `wss://ws-gateway.adipredictstreet.com/ws/market` and `/ws/user`. (H)
- **Status of access: official-public for market data; official-authenticated (partner key) for everything private.**

Public endpoints I confirmed with unauthenticated GETs on 2026-10-19 (H):

| Endpoint | Notes |
|---|---|
| `GET /health`, `/ready` | liveness |
| `GET /api/events?limit=100&page=N` | `page` + `limit` (`limit=100` works; larger values untested), **`offset` is rejected** (`invalid_offset`: "Use numeric `from`/`to` ... or `page`/`limit`"); 28 pages walk all 2,689 events with markets embedded (2.65 MB uncompressed per 100 events header `x-catalogue-uncompressed-bytes`). Event fields: `vertical`, `sport`, `scheduledAt`, `volume24h`, `totalVolume`, `openMarketCount`, `cryptoSeries`. |
| `GET /api/events/{slug}`, `/api/events/stats`, `/api/events/featured`, `/api/matches`, `/api/tags` | event/match grouping, counters, tag taxonomy |
| `GET /api/markets?status=OPEN&sort=activity&limit=500&offset=0` | docs: `limit` 1-500, `offset`, `sort` in `kickoff|activity|shares`, `hasMore` flag, no total. (On `/api/markets` `offset` is supported; on `/api/events` it is not.) `cache-control: public, max-age=10` |
| `GET /api/markets/{slug}` (symbol accepted as fallback), `/by-condition/{id}`, `/by-token/{id}` | full market: ids, outcomes[], `outcomePrices`, `chances`, `feeTakerBps`, `tradingWindow`, `resolutionCriteria`, `officialDataSource`, `sourceMatchId`, `resolution{proposedAt,challengeWindowClosesAt,...}`, `lifecycle`, `negRiskMarketId`, `crypto`/`cryptoWindow` |
| `GET /api/markets/{SYMBOL}/orderbook?outcome=0\|1&depth=20` | **keyed by `symbol`, not slug or UUID** (UUID -> `market_not_found`); `depth` default 50, max 500; `cache-control: max-age=1` |
| `GET /api/markets/{SYMBOL}/trades?limit=N` | public tape; **contains third-party maker/taker wallet addresses** (do not persist); fields `price`, `quantity`, `side`, `outcomeIndex`, `adjustment` (`MINT`/`BURN`), `makerFee`, `takerFee`, in-kind fee fields, `settledAt` |
| `GET /api/markets/{SYMBOL}/price-history?range=live\|1h\|1d\|1w\|1m\|all`, `/ohlc` (deprecated), `/traders`, `/challenges` | history, dispute feed |
| `GET /api/challenges` | global oracle-dispute feed (4 records, section 8) |
| `GET /api/platform/contracts`, `/fee-config`, `/api/compliance/geo` | addresses, default fee, caller geo check |

Partner-key only (docs): `/api/platform/status|notices|maintenance`, `/api/v1/partner/*` (trade feed, reconciliation, MM KPIs), all `/api/orders/*`, `/api/me/*` (H).

- **Rate limits (H, observed headers 2026-10-19):** `GET /api/markets*` and `/orderbook` carry `x-ratelimit-limit: 1200`, window `x-ratelimit-reset: 60` (per client IP, IPv6 per /64); `/trades` 480/min; the docs table also lists `price-history` 480, `traders` 240, `ohlc` 240, `search` 120, `leaderboard` 240. The markets-overview doc page says 600/60 s for `GET /api/markets`, the rate-limit page and live headers say 1200 (docs conflict; plan for 600). An API key "does not raise" the public limits. I issued about 330 GETs over about 15 minutes with 0.5-1.0 s spacing and got no 429. 429 body: `error.code = rate_limited`, `retryAfterSec`, header `Retry-After`.
- **WebSocket (H, connected anonymously):** `wss://ws-gateway.adipredictstreet.com/ws/market` accepts a keyless connection: greeting `{"type":"connected","data":{"gateway":"market","authMethod":"anon","protocolVersion":2}}`. Kalshi-style command envelope `{"id":1,"cmd":"subscribe","params":{"subscriptions":[{"channel":"token_book","ids":["<tokenId>"]}]}}` -> `subscribed` ack -> `book_snapshot` (`seq`, `nativeSeq`, `matcherSeq`, `hash`, `bids/asks` with `count`) and `token_meta` (`marketSymbol`, `outcomeIndex`, `marketType`). Channels (docs): `token_trade_matches`, `token_trade_settlements`, `token_book`, `token_ohlc`, `market_price_tick`, `market_lifecycle` (keyed by symbol), `condition_lifecycle`, `crypto_price_tick`, firehoses `all_trade_matches|all_trade_settlements|all_books`, `global_activity`; commands `subscribe`, `update_subscription`, `unsubscribe`, `list_subscriptions`, `get_book_snapshot`, `ping`. `/ws/user` needs a key with `portfolio:read`. Fixture: `ws-market-anon-token_book.txt`. Resync rule: align REST `orderbook?outcome=<idx>&depth=100` `hash` with a buffered WS frame hash, then apply `book_update`s.
- **On-chain read:** RPC and Blockscout REST (`/api/v2/...`) work unauthenticated; fills settle on `CTFExchange` (`OrderFilled`), so settlement history is recoverable independently of the API (H).

Response-shape samples (real, saved): `events-sample-limit2.json`, `market-detail-ucl-match-winner.json`, `market-detail-politics-negrisk.json`, `orderbook-ucl-two-sided.json`, `orderbook-politics-empty.json`, `trades-sample.json`, `platform-contracts.json`, `platform-fee-config.json`, `challenges-feed.json`.

---

## 5. Trade path

**Official path = partner REST + EIP-712 (H https://docs.adipredictstreet.com/auth/overview , /auth/api-keys):**

1. **Session layer:** `X-Api-Key: ps_live_<keyId>_<secret>` header on every request. Keys are "issued by PredictStreet ops via the admin panel, never self-service"; production needs a "signed partner agreement" (contact: the partners mailbox named in the docs). `single_wallet` partners need an associated wallet that has logged in to the web app and cleared **KYC tier >= 1 (SumSub)**; a `multi_wallet` key with `orders:write` is issued only to a registered market maker. No IP allowlist offered. Scopes: `orders:write`, `orders:read`, `portfolio:read`, `vault:write`.
2. **Per-order signature:** EIP-712 domain `{name:"PredictStreet", version:"1", chainId:36900, verifyingContract: CTFExchange (binary) | NegRiskCtfExchange (neg-risk)}`. Struct `Order{salt, maker, signer, taker, tokenId, makerAmount, takerAmount, expiration, feeRateBps, side, signatureType}` with **`maker` = the signer's vault, `signer` = the EOA, `taker` = 0x0, `signatureType` = 1 (VAULT)**; `signatureType 0` is rejected. `feeRateBps` must equal the market's live `feeTakerBps` or the order fails `bad_signature`. Amounts 6-decimal, CEIL on BUY notional (I confirmed the same struct in the public web bundle: fields `salt..signatureType`, `signatureType:1`).
3. **Endpoints:** `POST /api/orders/place` (wallet token bucket: burst 50, 50/s), `/place-batch` (max 10, 8/s), `/cancel` (40/s), `/cancel-batch` (max 100), `/cancel-all` (5/s); idempotency via `clientOrderId`; shared IP bucket 2000/min across `/api/orders/*`. Reads: `/api/orders/open|history|{id}|{id}/fills`, `/api/me/*`.
4. **Funds:** deposit by `depositERC20` or the gasless permit relay; sell side needs outcome tokens inside the vault (`POST /api/vault/split-signature` with backend co-sign, then user signature, then gasless relay); redemption is automatic after resolution (auto-redeem for winnings >= 1 USDC).
5. **Gas:** order placement and cancels are off-chain (no gas); the platform pays settlement gas and the gasless deposit/split/merge/redeem relays.

**Retail path:** web-app login (Privy; the public bundle has Privy, SumSub KYC, bot-protection and device-fingerprint hooks) issues a JWT accepted by the same API. The ToS bot clause (section 9) prohibits automating it.

**Open item (M):** the public web bundle contains an "API Keys" tab in the portfolio and `GET/POST /api/me/api-keys`, `/regenerate`, `DELETE` (body `name`, `permissions`, `expiresInDays`); unauthenticated `GET /api/me/api-keys` returns 401 `auth_required`. That suggests a user-level key feature that the partner docs do not describe ("never self-service"). I could not test it without logging in; treat self-service key issuance as unverified.

Verdict: **no unattended trade path without a partner agreement, KYC and written permission.**

---

## 6. PayBox reachability

**Verdict: partial (technically conceivable for signing; blocked in practice).**

- **Chain catalogue (H, live `discover_tokens mode=chains`, 2026-10-19):** query `ADI` returns only Metadium (`eip155:11`); query `36900` returns 0 chains. PayBox's notice says the catalogue is "metadata, not a support allowlist", so absence is evidence, not proof. The other catalogued chains (per `docs/research/06-paybox-platform.md`): Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. Therefore **transaction proposals on ADI (e.g. `depositERC20`, split, vault calls) are not reachable (M)**, and `get_buy_link` / `request_swap` cannot fund ADI USDC.e.
- **Signed orders:** the order and the permit are ordinary EOA `eth_signTypedData_v4` signatures (chainId 36900 inside the domain; nothing is broadcast by the signer). A PayBox EVM address uses one key across `eip155:*`, so `request_wallet_sign` with `typedData` could in principle sign an order or an EIP-2612 permit for ADI USDC.e. Whether PayBox restricts typedData domains by chain is untested (no signing tool was called) (M).
- **Funding that PayBox can express:** Ethereum USDC -> the venue's CCIP bridge (an Ethereum transaction proposal to the CCIP router, source chain 1, ADI selector in the web config) or the platform's gasless permit relay after funds exist on ADI. Neither was verified end to end (M).
- **Non-technical blockers (H):** KYC tier >= 1 on the wallet (SumSub), ops-issued partner key, ToS bot clause, geo (section 9), vault co-sign on withdrawal.
- **Read side is trivially reachable** by any plugin/service with an HTTPS GET to the public host.

---

## 7. Fees (H https://docs.adipredictstreet.com/concepts/trading/fees ; live API)

- **Formula (PS_QUADRATIC_V1):** `fee = k x P x (1 - P) x outcomeTokens`, `k = feeTakerBps / 10,000`, **charged on both the maker and the taker leg of every fill; there is no zero-fee maker leg.** Live: `feeTakerBps = 600` on all 18,095 markets (k = 0.06); `GET /api/platform/fee-config` -> `{"currentPeriod":"PRE_WC","feeTakerBps":600,"feeMakerBps":600,"updatedAt":"2026-06-12T10:03:45.530Z"}`.
- **Who pays in what:** the SELLER pays `k P (1-P) x tokens` in USDC out of proceeds; the BUYER pays `k (1-P) x tokens` in outcome tokens (same USD value). The signed `Order.feeRateBps` must equal the per-market `feeTakerBps` (a market may override the default). Contract cap `MAX_FEE_RATE_BIPS = 1000` (peak 2.5%).
- **Edge cost (derived from the formula, H inputs):** a seller pays `0.06 x P(1-P)` USDC per share, i.e. 0.015 USDC at P = 0.50, which is **3.0% of the share price per leg**. A buyer pays `0.06 x (1-P)` shares per share bought: 4.5% of the shares at P = 0.25, 3.0% at P = 0.50, 1.5% at P = 0.75, 0.6% at P = 0.90. A buy-and-hold-to-resolution arbitrage leg pays one fee; a round trip pays two. The operator keeps the whole fee (DefiLlama: "no maker or liquidity-provider rebates"); MM rebates are a separate off-platform programme (docs).
- **Other costs:** deposits: no platform fee, gasless via permit relay (Terms 4.2); withdrawals: `GET /api/me/withdrawals/fee` returns `amount + protocolFee + gasEstimate` (docs), amount not captured; plus bridge costs between Ethereum and ADI.

---

## 8. Resolution mechanism and dispute risk (H https://docs.adipredictstreet.com/concepts/settlement/overview , /flow , /challenges , /void-delay)

- **Centralised propose -> challenge -> finalise on-chain.** The platform's HSM-held oracle signer calls `Oracle.proposeOutcome` (binary) or the neg-risk oracle equivalent; finalisation is permissionless after the window. Data: match-data vendors (Stats Perform, API-Football, LSports; multi-source markets need a strict majority); Chainlink for crypto prices, CoinGecko for dominance/market-cap. Live data: `officialDataSource` = `lsports` on 17,991 markets, `manual` on 104.
- **Timelines:** sports proposal about 15 min after the event, 2-hour default challenge window (`resolution.challengeWindowClosesAt`), finalise about 2h15m end to end. Crypto Up/Down: proposal 1-2 minutes after window close; the "fast path" can have a zero-length window, so a fill is not final until `RESOLVED`.
- **Challenge:** on-chain `challengeOutcome` with a **500 USDC bond**, only the **first** challenge per market, no REST endpoint to raise it. **The platform decides** (target 2 h, max 24 h): confirm (bond forfeited to the revenue wallet), override (bond back + reward), or void (bond back). Trading is paused in `DISPUTED`. Admin powers: `voidMarket`, `markDelayed`, 7-day `initiateProposalClear`; neg-risk groups can settle at a "fair-price split" vector.
- **Terms override (H https://adipredictstreet.com/terms):** 5.4 "The Company's determination of the outcome of an Event ... shall be final and binding on all Users, save in the case of manifest error." 5.5 the Company may "void or cancel any Market and to reverse or amend any settlement" for cancelled/postponed events, unreliable sources, "error, manipulation, or irregularity", legal reasons, or "exceptional circumstances". 5.2 it may "amend, suspend, or delist any Market at any time, including after trading has commenced".
- **Observed dispute history (H, `GET /api/challenges`, `challenges-feed.json`):** only 4 records since 2026-06-17: 2 `UPHELD` (bond refunded) and 2 `RESOLVED`/`VOIDED`, two in esports and two on `WC-` markets; the platform therefore does overturn or void on challenge, but disputes are rare (or rarely filed: a 500 USDC bond is a high bar on markets whose books hold a few hundred dollars).
- **Basis risk for cross-venue linking (H):** a US county election market (`2026-BEXAR-COUNTY-JUDGE-ELECTION-WI-01-19544289`) carries `officialDataSource: "lsports"` and the text "The primary resolution source for this market is LSports. If LSports has not published a graded result, this market resolves based on a consensus of credible reporting ... If the winning outcome is not listed, this market resolves to \"Any Other\", else ... the fair market price at the time that determination is made." Politics and macro settled by a sports-data vendor with a fair-price fallback are not the same contract as the Polymarket/Kalshi equivalents: require manual review of `resolutionCriteria` before linking.
- **Press (M/L, sibling note):** user complaints about delayed withdrawals and a Group A winner market reportedly left open after the outcome was decided. Not verified here.

---

## 9. Geo, ToS, automation

- **Geo-block list (H, `NEXT_PUBLIC_GEO_BLOCKED_COUNTRIES` in the homepage's public config, 2026-10-19):** 53 countries incl. US, GB, FR, AU, CA, SG, TH, CH, IT, ES, PT, PL, BE, NZ, CN, RU, plus several African/Asian states and sanctioned countries. `GET /api/compliance/geo` returns `{country, blocked, reason, vpn, tor, greylist}` for the caller; the research egress was on the blocked list and **public read endpoints still answered normally** (no geo gating on reads observed).
- **Docs on geo (H /auth/api-keys):** "Geographic blocking ... does not apply to API-key requests" because integrator egress is data-centre/VPN class; compliance stays "at the wallet level via KYC / AML / RG gates".
- **ToS (H, https://adipredictstreet.com/terms, fetched as raw page data):**
  - 2.1 users must not be resident/located/national of a "Restricted Jurisdiction", must not be on sanctions lists (EU, UN, HMT, OFAC), must not be an unvetted PEP.
  - 3.1 "Each User may hold only one Account".
  - 6.1 (verbatim) users shall not "use any automated software, bots, scripts, or algorithms to interact with the Platform, except where expressly permitted by the Company in writing", nor "use a virtual private network (VPN), proxy server, or similar technology to disguise your location or to access the Platform from a Restricted Jurisdiction", nor engage in "wash trading, spoofing, layering".
  - 3.2/3.3 KYC: government ID, proof of address, source of funds where required; the Company may restrict deposits/withdrawals until verified.
  - 5.7 has a "Promotional Campaigns and Giveaways" clause (body not captured).
- **Public data polling:** no explicit prohibition on reading the public endpoints; the docs invite "liquidity aggregators" to consume them. The bot clause is worded for the Platform generally, so get written confirmation before production-scale polling (M).
- **Licence:** Gibraltar Gambling Division licence 167 as a betting intermediary (H, site); the register page link is `https://gamblingdivision.gov.gi/licence-holders` (not re-fetched; sibling note says the entry was not visible in the lists it could see).

---

## 10. Liquidity and activity (all pulled 2026-10-19; DefiLlama series through 2026-10-18)

| Metric | Value | Source |
|---|---|---|
| TVL | **$1,339,215** (2026-10-18); peak **$4,569,920 on 2026-09-10** | H https://api.llama.fi/protocol/predictstreet |
| DefiLlama volume 24h / 7d / 30d / all-time | $3,686 / $50,358 / $45,973,207 / $250,374,729 | H https://api.llama.fi/summary/dexs/predictstreet |
| Daily volume, last 12 days | 10-07 $6.20M, 10-08 $6.96M, then 10-09 $5.2k, 10-10 $6.8k, 10-11 $3.3k, 10-12 $3.4k, 10-13 $3.2k, 10-14 $15.9k, 10-15 $3.5k, 10-16 $2.1k, 10-17 $18.6k, 10-18 $3.7k | H `defillama-summary.json` |
| Fees 24h / 7d / 30d / all-time | $103 / $984 / $1.24M / $9.41M | H https://api.llama.fi/summary/fees/predictstreet |
| Volume definition caveat | DefiLlama counts both sides when two buyers are matched (mint) or two sellers (merge), so some notional is double-counted | H DefiLlama `methodology` |
| API per-market volume | sum of `volume24h` across all 18,095 markets = **$620.70**, 55 markets with any 24h volume (football $583, baseball $30, crypto $8, politics $0); sum of `totalVolume` $33.04M of which politics $30.12M, culture $2.85M, football $49k, economics $18k. The API figures and DefiLlama differ by definition and window; unreconciled | H `catalogue-stats.json` |
| Book depth (205 live books, stratified: all 55 with 24h volume, 30 largest by lifetime volume, 120 random) | **13 two-sided real books** (10 football, 3 baseball), 35 one-sided, 0 errors. Politics 78 sampled books: 0 two-sided. Meaningful depth only on **5 UCL match-winner markets** (about $250 resting bid each; asks $160-$1,300): four with 3-cent spreads (Napoli 0.58/0.61, Liverpool 0.63/0.66, PSG 0.38/0.41, Atletico 0.45/0.48) and Roma wide at 0.49/0.84; these quotes flicker (the Dortmund ask at 0.76 had vanished within 10 minutes, leaving a bid-only book) | H `depth-survey.json` |
| Lifetime-volume leaders have no book | the 2027 French presidential event ($4.74M lifetime), "#1 searched person on Google 2026" ($2.85M), House margin and Balance-of-Power markets: books empty, last trade weeks old (e.g. last Bexar County trade 2026-09-13), 24h volume 0 | H |
| Press datapoints | World Cup final contract about $2M vs about $5.3B combined on Polymarket and Kalshi (sibling note, Sports Business Journal via nextpredict.io) | L |

Interpretation (M): volume is bursty and campaign-like (World Cup, then a 2-day $13M spike on 2026-10-07/08, then collapse); the web app has "free shot" and "first kick" offer endpoints and a promotions clause, so headline volume is not evidence of depth. Use the live book, not volume, to size anything.

---

## 11. Overlap with other venues, and shared liquidity

- **Where arbitrage could exist (listing-level, H derived from event titles):** (a) **football**: UEFA Champions League, Serie A, EPL, La Liga, Championship, Liga MX, Saudi/Argentine leagues, 977 football markets; plus KBO baseball, basketball spreads/totals, NFL/NHL lines (Polymarket, Kalshi, Limitless, sportsbooks); (b) **US/world politics**: about 1,140 events on US Congress/Governor/midterm items (7,762 markets), 55 events on 2028/president/nominee, French 2027 presidential, European local races (Polymarket, Kalshi); (c) **macro**: 47 events on central-bank rate decisions, 48 on CPI/GDP/jobs, 41 on S&P/Nasdaq 4pm range buckets (Kalshi-style); (d) **crypto**: BTC/ETH Up/Down 5m/15m/1h/1d (Polymarket, Kalshi crypto); (e) weather (104 events), culture, AI/science.
- **But the overlap is mostly notional.** Only the five UCL markets (and a few $1-3 football/baseball books) have a tradeable two-sided quote today. `outcomePrices` falls back to last trade, which may be weeks old: do not treat it as a price without a live book check.
- **Independent liquidity: yes.** Own off-chain CLOB and own vault collateral; no shared book with Polymarket, Kalshi or anyone.
  - **Kalshi:** Sportsmint (dated 2026-06-29) describes Kalshi being "integrated into ADI Predictstreet's FIFA World Cup activations" (marketing/visibility, a co-branded hub) and, in future tense, combining "Kalshi's liquidity capabilities" with ADI infrastructure; it says nothing on pricing or order routing (H what the article says, https://sportsmintmedia.com/kalshi-and-adi-predictstreet-forge-alliance-to-expand-global-prediction-markets-during-fifa-world-cup/). I found no evidence in the live API of Kalshi-routed flow. If routing is later added, this becomes a duplicate-liquidity leg: re-check quarterly.
  - **Fanatics Markets:** iGaming Business says Fanatics provides a co-branded World Cup Hub "facilitating US availability" (H what the article says); Fanatics's own legal page says "ADI PredictStreet appears here solely as an intellectual property partner and does not offer, operate, ..." (H https://fanaticsmarkets.com/legal/disclosures). Take Fanatics's own disclosure as authoritative: not a liquidity link and not a US access path.
  - **Polymarket:** the web config flag `DEPOSIT_FROM_POLYMARKET_ENABLED` is a funding convenience, not shared liquidity (H flag; M interpretation). The contract design is a Polymarket-architecture fork with different addresses and its own matcher.
- **Role for the aggregator:** low-weight price/volume signal for the few liquid football markets, LSports-resolved event metadata, and a counterpart for linking tests (Polymarket-shaped ids). Never the place to put the second leg.

---

## 12. Adapter design notes (read-only, P2)

1. **Discovery:** `GET /api/events?limit=100&page=1..N` (events with markets embedded; about 28 pages; 2.65 MB uncompressed per page) every 15-30 minutes, or `GET /api/markets?status=OPEN&sort=activity&limit=500&offset=...` (cache 10 s). De-duplicate by `symbol`. Use `GET /api/events/stats` as a cheap change detector.
2. **Candidate filter:** only markets whose book has a bid in (0.01, 0.99) AND an ask in (0.01, 0.99). Then subscribe `token_book` on those token ids over anonymous `/ws/market`, resync with the `hash` check; fall back to REST `orderbook?depth=20` (1200/min per IP, 1 s cache).
3. **Key normalisation:** `conditionId`, `yesTokenId`, `noTokenId` are Polymarket-compatible shapes; group categoricals by `negRiskMarketId` + `negRiskQuestionIndex`, label with `groupItemTitle`; category from `vertical` and `tags[].slug`; sports linking via `sourceMatchId` (LSports id), `homeCountry/awayCountry`, `teamA/teamB`, `competition`.
4. **Price semantics:** YES-view book; NO bid p == YES ask 1-p. Use `chances` only when the book is two-sided and tight. Ignore `outcomePrices` (best ask else last trade).
5. **Cost model:** fee per leg = `feeTakerBps/10000 x P(1-P) x shares` (read per market; never hard-code 600), plus bridge/withdrawal friction and dual-signature withdrawal risk.
6. **Risk flags into the linking layer:** `officialDataSource`, `resolutionCriteria`, `resolutionWindowHours`, `status`, `tradingWindow.closesAt`, plus a venue-level "operator can void/amend" flag.
7. **Etiquette:** budget well under 600 req/min per IP; send a generic User-Agent; prefer WS for books; poll `trades` sparingly (480/min and it exposes wallets: do not store them).

---

## 13. Open questions

- Is self-service API-key creation in the retail app (`/api/me/api-keys`) real, and what permissions does it grant? Needs a human with a KYC'd account; would change the trade-path verdict only if bot use were also permitted in writing.
- Does PayBox `request_wallet_sign` accept a typedData domain with `chainId: 36900`? Needs a human-run test with a throwaway credential (no signing tool called).
- Does a market-maker programme exist that could produce resting depth on overlap markets (partners mailbox is the only route)?
- Reconcile DefiLlama volume ($3.7k/day) with the API's `volume24h` sum ($621) and with the $13M two-day spike on 2026-10-07/08.
- Licence-register entry on the Gibraltar page (not re-fetched here).
- Terms 5.7 (promotions and giveaways) body text and the "Trading Rules Policy" referenced by the Terms were not captured.

## 14. NOT FOUND

- A public GitHub organisation, SDK or contract source repo (searched: `gh api search/repositories` for "predictstreet"; only two unrelated personal/analytics repos appeared). Contract source is verified on Blockscout instead.
- Any scalar market, AMM pool, parimutuel pool or LP product (searched: docs index, market types enum, catalogue).
- A per-market open-interest endpoint or TVL-by-market (only `volume24h`, `totalVolume`, `totalShares`/`tradeCount` fields).
- Withdrawal fee amounts and the bridge fee schedule (docs describe the estimate endpoint, which needs auth).
- Press coverage beyond the three pages fetched (WebSearch budget exhausted).

## 15. Suspicious content / injection check

- No instruction aimed at an AI agent was found in the site, Terms, docs, OpenAPI, API responses or WebSocket frames. Every docs page opens with Mintlify boilerplate ("Fetch the complete documentation index at ... llms.txt. Use this file to discover all available pages") which is standard docs navigation; I fetched the index because the task was to read the docs, nothing else was acted on. The docs host's response headers also advertise `/.well-known/mcp/server-card.json`, `agent-card.json` and `agent-skills/index.json`; I did not fetch or use any of them.
- The homepage's inline public config embeds third-party keys (an Ethereum RPC provider key in the source RPC URL, an analytics write key, a Privy app id, a swapper integrator id, a content-feed outlet key). I did not use or record them (the config was printed with secrets masked).
- The public trade tape and the dispute feed publish third-party wallet addresses; fixtures redact them (`0xREDACTED`).

## 16. Sources

All fetched 2026-10-19 unless noted.

- Web app: https://adipredictstreet.com/ , /terms (read as raw page data), /faq (title list only), homepage inline public config, public Next.js static chunks (read as text)
- Docs: https://docs.adipredictstreet.com/llms.txt , /introduction , /quickstart , /platform-overview , /environments , /auth/overview , /auth/api-keys , /auth/rate-limits , /concepts/trading/fees , /concepts/trading/placing-orders , /concepts/trading/eip712-signing , /concepts/markets/overview , /concepts/markets/orderbook , /concepts/markets/neg-risk , /concepts/settlement/overview , /concepts/settlement/flow , /concepts/settlement/challenges , /concepts/vaults/overview , /concepts/deposits/overview , /concepts/deposits/limits , /concepts/withdrawals/overview , /concepts/websocket/overview ; OpenAPI https://docs.adipredictstreet.com/api-reference/openapi.json
- API (unauthenticated GETs): https://core-api.adipredictstreet.com/health , /api/events , /api/events/stats , /api/markets , /api/markets/{slug|SYMBOL} , /api/markets/{SYMBOL}/orderbook , /api/markets/{SYMBOL}/trades , /api/challenges , /api/platform/contracts , /api/platform/fee-config , /api/tags , /api/compliance/geo ; WebSocket wss://ws-gateway.adipredictstreet.com/ws/market (anonymous, read-only)
- DefiLlama: https://api.llama.fi/protocol/predictstreet , https://api.llama.fi/summary/dexs/predictstreet , https://api.llama.fi/summary/fees/predictstreet
- ADI Chain explorer (Blockscout): https://explorer-bls.adifoundation.ai/api/v2/stats , /api/v2/addresses/0x90EA87493E208A14011EC700Ac9cbAf4d064acc0 (+ /counters)
- Press / partner pages: https://igamingbusiness.com/prediction-markets/adi-predictstreet-launches-prediction-market-ahead-world-cup-2026/ ; https://sportsmintmedia.com/kalshi-and-adi-predictstreet-forge-alliance-to-expand-global-prediction-markets-during-fifa-world-cup/ ; https://fanaticsmarkets.com/legal/disclosures (these three via WebFetch small-model summaries: M for exact wording)
- PayBox: live `discover_tokens` (`mode=chains`, queries `ADI` and `36900`), read-only
- Local notes consulted: `docs/research/06-paybox-platform.md` (PayBox chain catalogue, signing semantics); `docs/research/venues/predictstreet.md` (earlier same-day spec of this venue; used as a cross-check and for items marked "sibling note"); `docs/research/venues/fanatics-markets.md`
- GitHub search (`gh api search/repositories`, query "predictstreet"): no official repo

Fixtures in `docs/research/fixtures/adi-predictstreet/` (all real responses from 2026-10-19, each <= 50 KB):
`events-sample-limit2.json` (GET /api/events?limit=2), `events-stats.json`, `market-detail-ucl-match-winner.json` (binary football, LSports + API-Football consensus), `market-detail-politics-negrisk.json` (neg-risk politics, LSports resolution text), `orderbook-ucl-two-sided.json`, `orderbook-politics-empty.json`, `trades-sample.json` (wallets redacted), `challenges-feed.json` (wallets redacted), `platform-contracts.json`, `platform-fee-config.json`, `ws-market-anon-token_book.txt` (anonymous WebSocket frames), `openapi-paths.json` (path/method list derived from the OpenAPI spec), `catalogue-stats.json` (derived from the 28-page events walk), `depth-survey.json` (derived from 205 order-book GETs), `defillama-summary.json` (derived).
