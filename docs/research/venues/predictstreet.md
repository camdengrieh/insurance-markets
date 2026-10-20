# PredictStreet (ADI Predictstreet, adipredictstreet.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: doc reads, unauthenticated GETs to documented hosts, public block-explorer GETs, DefiLlama API GETs, one read-only PayBox catalogue lookup. No account, no key, no wallet connection, nothing signed, no POST/PUT/DELETE, no WebSocket connection, no browser automation. All requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live: yes (H).** `GET https://core-api.adipredictstreet.com/health` returned `{"status":"ok","service":"core-api"}` and `GET /api/markets?status=OPEN` returned 17,993 open markets on 2026-10-19 (fixtures below). ADI Chain mainnet is producing blocks (explorer: 1,727,183 blocks, 14,783 tx "today").
- **Adapter priority: P2 (read-only signal source at most; never a trade leg).**
  1. **Read API is excellent and public (H):** unauthenticated market/event/orderbook/trade endpoints, OpenAPI 3.1 spec, WebSocket book/trade feeds, Polymarket-style CTF token ids. A read adapter is cheap.
  2. **Liquidity is almost nil (H):** DefiLlama TVL about $1.34M (down from a $4.57M peak on about 2026-09-10), last-7-day volume about $50k, last-day volume $3.9k. Of 200 random open markets, 0 had a two-sided real book; of the 50 most active/highest-volume markets, only 2 had real two-sided depth (about $250 per side).
  3. **Trade path is gated (H):** API key is issued by PredictStreet ops under a signed partner agreement, requires KYC tier 1 on the wallet, and the ToS bans bots "except where expressly permitted by the Company in writing". No self-service key.
  4. **Resolution is centralised (H):** the platform proposes outcomes; a 500 USDC first-challenge-only bond, platform decides the challenge; platform can void to fair-price vectors; ToS says its determination is final and binding.
  5. **Geo-restricted (H):** the public web config blocks 53 countries including the US, UK, France, Australia, Canada, Singapore, Thailand.
- **Independent liquidity: yes (own off-chain order book), but not shared with anyone and mostly empty.** The Kalshi tie-up is branding/distribution, not shared liquidity (see 11).
- Upgrade triggers: partner access obtained AND a market-maker programme delivering resting two-sided depth on overlap markets (US politics, crypto up/down, index ranges). Re-check quarterly.

## 1. Liveness and corporate facts

| Item | Finding | Tag / source |
|---|---|---|
| Site | adipredictstreet.com serves the retail app; homepage shows 2,696 events / 18,095 markets on 2026-10-19 (hint said 2,655 / 17,806). `GET /api/events/stats` -> `{"total":2688,"matches":349,"tournament":2339,"live":0}` | H https://adipredictstreet.com/ , https://core-api.adipredictstreet.com/api/events/stats |
| Operator | Predict Street Limited, Gibraltar, company no. 126487, "Remote Gambling Licence Number: 167", licensed as a **betting intermediary** under the Gibraltar Gambling Act 2005; T&Cs effective 27 March 2026 | H https://adipredictstreet.com/terms |
| Licence register | The Gibraltar Gambling Division licence-holders page I could fetch did not list Predict Street in the B2C/B2B lists; it links a separate "Prediction Market Authorisations" section I could not see. Licence date 26 March 2026 comes from press only. | H (page read) / M (date) https://gamblingdivision.gov.gi/licence-holders , https://igamingbusiness.com/prediction-markets/adi-predictstreet-launches-prediction-market-ahead-world-cup-2026/ |
| Launch | Went live 8 June 2026 in Gibraltar (iGB, dated 10 June 2026). DefiLlama volume series starts 2026-06-02. First consumer app on ADI Chain; official FIFA World Cup 2026 prediction-market partner (Apr 2026 announcement). | M https://igamingbusiness.com/... , https://www.globenewswire.com/news-release/2026/04/02/3267718/0/en/adi-chain-announces-adi-predictstreet-as-the-official-prediction-market-partner-of-the-fifa-world-cup-2026-marking-the-launch-of-its-first-consumer-facing-ecosystem-project.html |
| Ownership | Subsidiary of Finstreet Limited; backed by Sirius International Holding / IHC (Abu Dhabi) via ADI Foundation; "private commercial", not state-operated (review site) | M https://nextpredict.io/platforms/adi-predictstreet/ |
| DefiLlama | Protocol id 8156, category Prediction Market, chain ADI, listed 2026-07-23, two audits listed (HackenProof "DualDefense" programme) | H https://api.llama.fi/protocol/predictstreet |
| Chain | ADI Chain mainnet, chainId **36900**, native token ADI, RPC `https://rpc.adifoundation.ai`, explorer (Blockscout) `https://explorer-bls.adifoundation.ai`; described as an Ethereum L2 | H https://docs.adipredictstreet.com/environments ; M (L2 wording) press |
| Adverse press | Reported: GGL (Germany) investigating unlicensed advertising; user complaints about delayed/blocked withdrawals, undelivered giveaway; Group A winner market kept open after outcome was decided while Kalshi/Polymarket closed theirs. All from review/affiliate-style sites. | M/L https://nextpredict.io/platforms/adi-predictstreet/ , https://www.igamingtoday.com/fifa-partner-adi-predictstreet-faces-backlash-over-giveaway-claims/ |

## 2. Kind and market model

- **Kind:** hybrid. **Off-chain central-limit order book (CLOB) with on-chain custody and batch settlement** on ADI Chain. Polymarket-architecture clone (Gnosis ConditionalTokens + CTF Exchange + NegRiskAdapter), but with **per-user vault contracts** instead of proxy wallets. (H https://docs.adipredictstreet.com/introduction , /platform-overview , /concepts/contracts/overview)
- **Matching:** off-chain matcher does order intake, signature validation, balance locking, matching; fills are batched to `CTFExchange` on-chain. Trade rows show `status: settled` with `settledAt` about 2.7 s after `createdAt` (H, fixture `trades-sample.json`). Adjustments `MINT` / merge exist (two buyers matched mints a pair; two sellers matched merge).
- **Binary and neg-risk (categorical) only. No scalar.** Everything is a YES/NO ERC-1155 pair. A multi-outcome event is a group of sibling YES/NO markets sharing `negRiskMarketId` (`negRiskEligible: true`); `convertPositions` converts NO baskets to YES + USDC. Of 17,993 open markets, 12,055 are neg-risk siblings and 5,938 binary (H, derived from `GET /api/markets`).
- **Prices:** tick 0.01 (99 levels), in play some markets set a wider `liveTick` (e.g. 0.05); min order 1 USDC notional; shares are 6-decimals; each share pays 1 USDC. Order types LIMIT/MARKET with GTC/IOC/FOK. (H https://docs.adipredictstreet.com/concepts/trading/placing-orders , /concepts/trading/time-in-force)
- **Outcome tokenisation:** Polymarket-style. `conditionId`, `questionId`, `yesTokenId`, `noTokenId` (uint256 ERC-1155 ids in `ConditionalTokens` `0xD28B8295Cd57F205e4d080Ff4c6d23C06a9EEe3a`; neg-risk ids use a wrapped-collateral token). IDs are null until the market deployment is confirmed (`PRE_MARKET`). (H docs /concepts/markets/overview , /concepts/markets/neg-risk)
- **Book semantics:** both outcomes share one book; `outcome=0` returns the YES view where a NO bid at p appears as a YES ask at 1-p. Levels aggregated per price; response carries a 16-hex `hash` for REST/WS reconciliation. (H /concepts/markets/orderbook ; live fixture `orderbook-sample.json`)
- **Price fields:** `outcomePrices` = best ask else last trade else null; `chances` = book mid if two-sided and spread <= 0.10, else last trade, else 1/outcomeCount. Beware: `outcomePrices` of `["0.99","0.99"]` is a placeholder-ask artefact, not a tradable price. (H /concepts/markets/overview ; live data)
- **Sentinel quotes:** many football books contain a resting 100-share bid at 0.01 and ask at 0.99 and nothing else (H, 8 of 8 sampled football books). Filter bids <= 0.01 and asks >= 0.99 before computing any edge.
- **Lifecycle:** `PRE_MARKET -> OPEN -> CLOSED -> PENDING_RESOLUTION -> RESOLVED`, plus `PAUSED`, `SUSPENDED`, `POSTPONED`, `DELAYED`, `DISPUTED`, `VOIDED`. (H /concepts/markets/market-status)
- **Catalogue (open markets, 2026-10-19, H derived from API):** politics 10,691; financials 2,188; economics 2,012; football 962; climate (weather) 716; culture 578; science 301; basketball 230; american football 174; hockey 92; cs2 31; crypto 10; baseball 7; cricket 1. Politics are mostly 2028 US primaries/president/VP, 2026 midterms (balance of power, House/Governor seats, margins), French 2027 presidential, Romanian PM, county-level US races. Financials are Nasdaq-100 / S&P 4pm price-range buckets and DDR5 price products. Economics are CPI, Fed dissents, GDP 2031-35, state employment. Crypto is BTC/ETH Up/Down on 5m/15m/1h/1d windows only (no strike-price ladders found in the open list). Data source field: `lsports` on 17,951 markets, `manual` on 42.
- **Market creation:** by PredictStreet and "in some cases approved market participants" (FAQ, M).

## 3. Chains and collateral

- **Chain:** ADI Chain mainnet (36900). Single-chain venue. (H)
- **Collateral:** `USDC.e` (bridged USDC, 6 decimals) at `0x9cb8142aEBBcdc60AF7c97Af897A67A8f3CA71C2`; EIP-712 domain name `USDC.e`, version `2` (for EIP-2612 permits). Explorer shows 21,948 holders and total supply 6,029,228.80 USDC.e (H https://explorer-bls.adifoundation.ai/api/v2/tokens/0x9cb8142aEBBcdc60AF7c97Af897A67A8f3CA71C2 , 2026-10-19). Every position is fully collateralised by USDC.e. (H DefiLlama description)
- **Conflict:** the FAQ page text says KYC is triggered at "2,000 USD1" cumulative net deposits and one review says only USD1 is supported; docs, API and DefiLlama all say USDC.e. Treat USDC.e as authoritative for the API/contract surface (H) and USD1 as a possible retail on-ramp wording (L). Source: https://adipredictstreet.com/faq
- **Contracts (all verified on explorer per docs; addresses read from `GET /api/platform/contracts` 2026-10-19, H):** ConditionalTokens `0xD28B8295Cd57F205e4d080Ff4c6d23C06a9EEe3a`; CTFExchange (binary) `0x90EA87493E208A14011EC700Ac9cbAf4d064acc0`; NegRiskAdapter `0x29e58C3916d1fD235f3d1e7fCF640fd1fA8BDb1e`; NegRiskCtfExchange `0x79ACbb874dd01044FA38a89c1478E60FaAB40D00`; VaultFactory `0xc16B8b190064451c2FeEb2e77c4B2aC4c7009552`; DepositLimitRegistry (proxy) `0x744ff21c797C16272EEaE85B9E726d1A2a4E6BBE`; Oracle (binary) `0x320346B72dA29a680C0314440D5A93255eb05414`; NegRiskOracle `0xf6E9A4322b3e3a5AA00545fc206A0be1cbe0D140`; MulticallExecutor `0x634FFddF657Bb6B2237A404c94A0f313d376848e`. Explorer confirms ConditionalTokens is a verified contract (creation block about 32194).
- **Custody model:** each user has an own **vault contract** (`VaultFactory.vaultOf(eoa)`); orders are signed by the EOA with `maker` = vault, `signatureType` = 1. Withdrawals, split/merge and neg-risk converts need **dual signatures (user + backend co-signer)**. A 7-day-timelocked emergency withdraw exists if the platform is down. (H /concepts/vaults/overview , /concepts/withdrawals/dual-sig , /concepts/contracts/vaults) Implication: the platform can stall withdrawals by withholding the co-signature (consistent with the reported complaints, M).
- **Funding paths (docs):** direct `approve` + `vault.depositERC20` on ADI (needs native ADI gas); or **gasless relayed EIP-2612 permit deposit** (`POST /api/deposits/relay`, off-chain signature only); on-chain deposit caps by KYC tier via `DepositLimitRegistry` (a wallet with tier 0 reverts `KycRequired`). Bridge from Ethereum USDC via Chainlink CCIP is configured in the public web config (source chain 1, CCIP router, destination selector) and `ccipBridge` in `/api/platform/contracts`; the web config also has a `DEPOSIT_FROM_POLYMARKET_ENABLED` flag (funding convenience only, not liquidity sharing). (H docs /concepts/deposits/overview ; H web config; M on how the bridge behaves)

## 4. Read API

- **Docs:** https://docs.adipredictstreet.com/introduction , index https://docs.adipredictstreet.com/llms.txt , full text https://docs.adipredictstreet.com/llms-full.txt , **OpenAPI 3.1 spec https://docs.adipredictstreet.com/api-reference/openapi.json** (title "PredictStreet API", version `2026-06-16`, 103 paths; live responses carry `x-api-version: 2026-04-01`). (H)
- **Base URL:** `https://core-api.adipredictstreet.com` (prod, ADI mainnet). Staging "on request". WS: `wss://ws-gateway.adipredictstreet.com/ws/market` and `/ws/user`. (H)
- **Official status:** official-public for market data, official-authenticated (partner key) for everything private. The docs' own text: "Liquidity aggregators consume market, orderbook, and trade streams. Read-only access requires no collateral." (H /introduction)
- **Public, no auth (confirmed with unauthenticated GETs 2026-10-19, H):**

| Endpoint | Notes |
|---|---|
| `GET /health` | `{"status":"ok","service":"core-api","timestamp":...}` |
| `GET /api/markets?status=OPEN&sort=activity&limit=500&offset=0` | `sort` in `kickoff|activity|shares`; `limit` 1-500; `hasMore` flag, no total; offset paging (de-dup by `symbol`). Response `cache-control: public, max-age=10`. 36 pages for the whole open catalogue. |
| `GET /api/markets/{slug}` (symbol accepted as fallback), `/api/markets/by-condition/{id}`, `/api/markets/by-token/{id}` | Single market |
| `GET /api/markets/{symbol}/orderbook?outcome=0|1&depth=20` | depth default 50, max 500; keyed by **symbol**; `bids/asks` of `{price,quantity}` strings + `hash` |
| `GET /api/markets/{symbol}/trades?limit=5` | Public tape. **Includes maker/taker wallet addresses** (third-party; do not persist). Fields incl. `price`, `quantity`, `side`, `outcomeIndex`, `adjustment` (MINT etc.), `makerFee`, `takerFee`, fee-in-outcome-tokens fields, `settledAt` |
| `GET /api/markets/{symbol}/price-history?range=live|1h|1d|1w|1m|all`, `/ohlc` (deprecated), `/traders`, `/challenges` | History / disputes |
| `GET /api/events`, `/api/events/{slug}`, `/api/events/stats`, `/api/events/featured`, `/api/matches`, `/api/tags` | Event grouping, volume24h/totalVolume per event, `openMarketCount` |
| `GET /api/platform/contracts`, `/api/platform/fee-config`, `/api/compliance/geo` | Addresses, default fee, caller geo-block check |
| `GET /api/leaderboard`, `/api/search*`, public profile endpoints keyed by wallet/vault | Not needed |

  Auth-required (401 `auth_required` observed): `/api/platform/status` (partner key only), `/api/orders/*`, `/api/me/*`. The 401 text says "provide Authorization: Bearer <jwt> or X-Api-Key header" (H).
- **Resolution/lifecycle fields on each market (H, fixture `markets-sample.json`):** `status`, `tradingWindow{preMarketStartsAt,opensAt,closesAt}`, `resolutionWindowHours` (2), `resolutionCriteria`, `officialDataSource`, `resolution{proposedAt,challengeWindowClosesAt,disputedAt,proposedOutcome,resolvedOutcome,...}`, `payoutNumerators`, `lifecycle{closedAt,pausedAt,resolvedAt,voidedAt}`, `crypto` / `cryptoWindow` blocks for crypto, `tradable`, `tradingMode`, `tradeCount`, `volume24h`, `totalVolume`, `feeTakerBps`.
- **Rate limits (docs table, "live production values as of 2026-05-26", H):** markets/market/orderbook 1200 req/min per IP; trades and price-history 480/min per IP; traders/ohlc 240/min; events 1200/min; `/api/platform/contracts` and `fee-config` 1200/min shared (also quoted as 120/min elsewhere on the same page); search 120/min; leaderboard 240/min. The markets-overview page separately says `GET /api/markets` is 600/60s per IP and "an API key does not raise it" (docs conflict; plan for 600). IPv6 counted per /64. Response headers `X-RateLimit-Limit/-Remaining/-Reset` and `Retry-After` on 429 (documented; I did not observe the headers on my small number of calls). I used about 310 GETs over roughly 5 minutes with 0.35-1.2 s spacing and got no 429.
- **WebSocket (docs only; not connected, H docs / untested):** `/ws/market` channels `token_book`, `token_trade_matches`, `token_trade_settlements`, `token_ohlc`, `market_price_tick`, `all_trade_matches`, `all_books`, `market_lifecycle`, `condition_lifecycle`, `global_activity`, `crypto_price_tick`. Kalshi-style command envelope (`{"id","cmd":"subscribe","params":{"subscriptions":[{"channel","ids"}]}}`), Polymarket-style id lists keyed by tokenId / conditionId / symbol. Docs say a market connection without credentials is accepted as anonymous (API-keys page) while the overview says `X-Api-Key` at handshake; not resolved. Book frames carry `seq`/`prevSeq` and the same `hash` as REST. https://docs.adipredictstreet.com/concepts/websocket/overview , /subscriptions , /reconnect
- **On-chain read:** RPC `https://rpc.adifoundation.ai`; Blockscout REST works unauthenticated (`/api/v2/stats`, `/api/v2/tokens/{addr}`, `/api/v2/addresses/{addr}`). Fills settle on `CTFExchange` (`OrderFilled`) so settlement history is also recoverable on-chain. (H)
- **Fixtures saved (all unauthenticated GETs on 2026-10-19, third-party wallet addresses redacted):** `docs/research/fixtures/predictstreet/` -> `markets-sample.json`, `orderbook-sample.json` (two-sided UCL book), `orderbook-empty-example.json` (typical empty book), `trades-sample.json`, `events-sample.json`, `platform-contracts-fee-config.json`, `catalogue-and-depth-stats.json` (derived).

## 5. Trade path

- **Official path = partner REST + EIP-712 (H https://docs.adipredictstreet.com/auth/overview , /auth/api-keys):**
  1. `X-Api-Key: ps_live_<keyId>_<secret>` header on every request (session layer). Keys are **issued by PredictStreet ops via an admin panel, never self-service**; production needs a "signed partner agreement"; contact is the partners mailbox named in the docs (`partners@predictstreet.com`). `single_wallet` partner needs an associated wallet that has logged into the web app and cleared **KYC tier 1 (SumSub)**; `multi_wallet` with `orders:write` needs market-maker registration. No IP allowlist offered. Scopes: `orders:write`, `orders:read`, `portfolio:read`, `vault:write`.
  2. Each order is additionally EIP-712 signed. Domain `{name:"PredictStreet", version:"1", chainId:36900, verifyingContract: CTFExchange for binary | NegRiskCtfExchange for neg-risk}`. Struct `Order{salt,maker,signer,taker,tokenId,makerAmount,takerAmount,expiration,feeRateBps,side,signatureType}` with `maker` = the signer's vault, `taker` = 0, `signatureType` = 1 only, `feeRateBps` must equal the market's live `feeTakerBps` (else `stale_fee_quote`/`bad_signature`), amounts 6-decimals with CEIL on BUY notional and FLOOR on SELL notional. REST body carries `nonce` (= salt), `expiry`, `price`, `quantity`, `outcome`, `side`, `type`, `timeInForce`, `clientOrderId`.
  3. `POST /api/orders/place` (50/s burst per wallet), `/place-batch` (max 10, 8/s), `/cancel`, `/cancel-batch` (max 100), `/cancel-all`. Idempotent retries: same signed order + same `clientOrderId` returns the original result.
  4. Collateral and positions live in the vault. `split`/`merge`/`convert` need a backend co-signature (`POST /api/vault/*-signature`) plus the owner signature, then gasless relay via `POST /api/me/positions/op-submit`; redemption is automatic after resolution (auto-redeem for winnings >= 1 USDC).
- **Retail path:** web app login (Privy app id appears in the web config; docs mention SIWE) issues a short-lived JWT; `Authorization: Bearer <jwt>` is accepted by the same API. Automation on this path is prohibited by the ToS unless permitted in writing (see 9). (M)
- **Gas:** order placement and cancel are off-chain (no gas). Platform pays settlement gas and gasless deposit/split/merge/redeem relays. Direct on-chain vault calls need native ADI. (H)
- No self-service, no anonymous trade path. **Not tradable by an agent without a partner agreement and KYC.**

## 6. PayBox reachability

**Verdict: partial in theory, no in practice.**

- Chain 36900 is **not in PayBox's chain catalogue**: `discover_tokens mode=chains` with `query=ADI` returned only Metadium (eip155:11); `query=36900` returned nothing (H, live call 2026-10-19; PayBox says the catalogue "is metadata, not a support allowlist", so absence is evidence, not proof). `docs/research/06-paybox-platform.md` lists the 11 catalogued chains (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid) - none is ADI. PayBox funding tools (`get_buy_link`, `request_swap`) therefore cannot reach ADI USDC.e (M).
- **Transaction proposals:** `io.paybox/transactionProposal` needs the network "available in PayBox" (per 06 notes); an ADI proposal and its gas (native ADI) are unverified and likely unsupported. Funding could only come via Ethereum USDC -> the CCIP bridge (Ethereum is in PayBox) or a gasless EIP-2612 permit relay (off-chain signature), neither verified here (M).
- **Signed orders:** the order is an ordinary EOA EIP-712 signature with chainId 36900 and no wrapper, so `request_wallet_sign` with `typedData` (no documented chain/domain allowlist, per 06 notes) could in principle produce it for a PayBox EVM address (one address across all `eip155:*`). The vault-owner EOA must be the KYC'd wallet. (M, untested; no signing tool called).
- **Blockers that are not technical:** ops-issued API key / partner agreement, KYC tier 1 on the wallet, bot clause in the ToS, geo blocks. Without them the API refuses writes regardless of signature validity.
- **Read side is trivially reachable** by a plugin or service with an HTTPS GET to `core-api.adipredictstreet.com` (public, no key). WebSocket from a PayBox plugin is NOT FOUND in 06 notes.

## 7. Fees (H https://docs.adipredictstreet.com/concepts/trading/fees ; live `feeTakerBps` from API)

- Formula `fee = k x P x (1 - P) x outcomeTokens`, `k = feeTakerBps / 10,000`, **charged on both maker and taker legs of every fill** (no zero-fee maker leg). Live: `feeTakerBps = 600` on all 17,993 open markets (k = 0.06), `/api/platform/fee-config` -> `{"currentPeriod":"PRE_WC","feeTakerBps":600,"feeMakerBps":600,"updatedAt":"2026-06-12T10:03:45Z"}` (H, fixture).
- **Who pays in what:** sellers pay `k P (1-P) x tokens` in USDC out of proceeds; buyers pay `k (1-P) x tokens` in outcome tokens. Per-market override possible; the signed `Order.feeRateBps` must equal the market's `feeTakerBps`. Contract cap `MAX_FEE_RATE_BIPS = 1000`.
- **Edge cost:** at P = 0.50 the fee is 0.015 USDC per share = **3.0% of notional per leg**; at P = 0.90 it is 0.0054 per share = 0.6% of notional. A round trip crossing the spread pays this on the entry and exit legs. Any cross-venue arbitrage must clear that plus ADI withdrawal/bridge costs. (derived, H inputs)
- No LP/maker rebates in the fee schedule; DefiLlama says PredictStreet "keeps the full fee"; market-maker rebates are a separate off-platform programme (docs). DefiLlama fee/volume ratio about 2.7-2.9% on both spike and quiet days (H, derived), consistent with real fees being charged.
- Deposit: free in gas for permit relay; withdrawals have a fee endpoint (`GET /api/me/withdrawals/fee`) and the FAQ says "network fees apply" (M).

## 8. Resolution mechanism and dispute risk (H https://docs.adipredictstreet.com/concepts/settlement/overview , /flow , /challenges , /void-delay)

- **Centralised propose -> challenge -> finalise.** Platform "oracle" signer (HSM-backed, per docs) calls `proposeOutcome`; data comes from match-data vendors (LSports, Stats Perform, API-Football), Chainlink price data / CoinGecko for crypto. Multi-source markets need a strict majority. Sports: proposal about 15 min after the event, **2-hour challenge window** (default; per-market value in `resolution.challengeWindowClosesAt`), then permissionless `finalizeOutcome` -> about 2h15m end to end. Crypto Up/Down: proposal 1-2 min after window close; the fast path can have a zero-length window.
- **Challenge:** on-chain `challengeOutcome` with a **500 USDC bond**; only the **first** challenge per market is accepted; no REST endpoint to file it. **The platform decides** (confirm: bond forfeited to platform revenue wallet; override: bond back + reward; void: bond back). Target decision SLA 2 h, max 24 h. Trading is paused during `DISPUTED`.
- **Admin powers:** `voidMarket` (multisig-gated admin; void payout can be equal split `[1,1]` or a "fair-price vector"), `markDelayed`, 7-day `initiateProposalClear`. Neg-risk void is queued first and is impossible after any position conversion.
- **ToS overrides:** "the Company's determination of the outcome ... shall be final and binding"; users may not dispute on the basis of disagreeing with the Resolution Source (H https://adipredictstreet.com/terms , "Resolution Finality" term, cross-referencing clause 5.4). So the on-chain challenge is a platform-run mechanism, not decentralised arbitration.
- **Resolution-source quirk (H, live market):** US county elections and similar political markets carry `officialDataSource: "lsports"` and a "primary resolution source ... LSports" clause. Politics/economics/financials resolved by a sports-data vendor is unusual; verify each market's `resolutionCriteria` before treating it as the same contract as a Polymarket/Kalshi market.
- **Risk summary for arbitrage:** basis risk (different resolution sources and wording than Polymarket/Kalshi), counterparty/withdrawal risk (dual-sig vault, platform co-sign, complaints reported), void-at-fair-price risk, and possible stale-market behaviour (Group A example, M/L).

## 9. Geo, ToS, automation

- **Blocked countries in the public web config (`NEXT_PUBLIC_GEO_BLOCKED_COUNTRIES`, H, read from the homepage HTML 2026-10-19):** AF, DZ, AO, AU, BY, BE, BO, BG, BF, CM, CA, CF, CN, CI, CU, CD, ET, FR, HT, HU, IR, IQ, IT, KE, LA, LB, LY, ML, MC, MZ, MM, NA, NZ, NI, NE, KP, PL, PT, RU, SG, SO, SS, ES, SD, CH, SY, TW, TH, GB, US, VE, YE, ZW. `GET /api/compliance/geo` returns `{country, blocked, reason, vpn, tor, greylist}` for the caller; the research egress IP was reported as restricted (country not recorded). The same page loads a device-fingerprinting flag.
- **US:** the config blocks `US` while press says US access exists in 23 states + 4 territories through a co-branded hub with Fanatics Markets (M https://igamingbusiness.com/... , https://nextpredict.io/platforms/adi-predictstreet/). Unresolved; assume the retail core app is not available to US persons. Terms exclude residents of "Restricted Jurisdictions" and sanctioned persons; VPN use to disguise location is prohibited (H terms cl. 2, 6).
- **Automation (quote, H terms cl. 6.1):** users must not "use any automated software, bots, scripts, or algorithms to interact with the Platform, except where expressly permitted by the Company in writing". The partner API is the written-permission route.
- **KYC:** required (SumSub). FAQ: triggered at 2,000 USD1 cumulative net deposits and on the first withdrawal; deposits and withdrawals blocked until complete. On-chain deposit caps by tier. One account per user. (H FAQ page text, docs /concepts/deposits/limits)
- **Docs-level compliance claim:** "KYC, geo / sanctions screening, and AML screening of withdrawal destinations are enforced" (H /environments).
- **Public data scraping:** no explicit prohibition found for the public read endpoints; the docs invite aggregators to read them. The ToS bot clause is worded at the Platform generally, so confirm in writing before production-scale polling. (M)

## 10. Liquidity and activity (all pulled 2026-10-19; DefiLlama data through 2026-10-18)

| Metric | Value | Source |
|---|---|---|
| TVL (USDC.e in vaults + CTF + neg-risk wrappers) | **$1,339,215** (2026-10-18); peak $4,569,920 (about 2026-09-10); $3.99M on listing day 2026-07-23 | H https://api.llama.fi/protocol/predictstreet |
| Volume 24h / 7d / 30d / 1y / all-time | $3,866 / $50,013 / $46,282,928 / $250,371,043 / $250,374,909 | H https://api.llama.fi/summary/dexs/predictstreet |
| Fees 24h / 7d / 30d / all-time | $108 / $975 / $1,247,808 / $9,412,965 | H https://api.llama.fi/summary/fees/predictstreet |
| Volume shape | Weekly: $88.7M (week of 2026-07-13, World Cup final) -> $1M-6M weekly from 2026-07-20 to 2026-08-30 -> $8.6M-18.6M weekly from 2026-08-31 to 2026-10-11 -> **$50k for the week of 2026-10-12**. Last 30 days: 9 days >= $1M (up to $6.96M on 2026-10-08), median day $404k, but the 10 most recent days (Oct 9-18) are $2k-$19k. Spikes are bursty and fee-paying (about 2.8% fee/volume), not obviously wash (zero-fee) but consistent with market-maker or incentive-driven flow. | H, derived |
| Volume definition caveat | DefiLlama counts buyer-vs-seller once but counts BOTH sides when two buyers (mint) or two sellers (merge) are matched, so notional is inflated up to 2x vs venues that count once. | H DefiLlama `methodology` |
| Per-market activity (API) | Sum of `volume24h` across 17,993 open markets = about 391 (API units, not verified as USD); 41 football markets and 5 baseball markets had any 24h volume; politics 0. `totalVolume` sums to about $33.0M, of which politics about $30.1M with 198,222 trades, but 24h volume on politics is zero. DefiLlama (about $3.9k) and the API (about $0.4k) disagree on scale; windows and definitions differ; unreconciled. | H derived, `catalogue-and-depth-stats.json` |
| Book depth | Top 40 markets by total volume (politics and culture): all 40 had **empty books**. Random 200: politics 122/125 empty (3 placeholder-only), financials 25/25 empty, economics 23/23 empty, climate 9/9 empty, football 8/8 sentinel-only. Real two-sided books found only on `UEFACHAM-PSG-BCE-MW-20261020-BCE` (bid 0.38 x 657.9, ask 0.41 x 399.3) and `UEFACHAM-STT-ATM-MW-20261020-ATM` (bid 0.45 x 555.6, ask 0.48 x 460.0), about $240-250 per side within 20 levels. | H live GETs |
| Press datapoints | World Cup final winner contract $2M volume vs $5.3B combined on Polymarket and Kalshi (Sports Business Journal, 2026-07-13); some matches "$20 in bets"; reported daily fees $7,248 on about 2026-08-21 (SCCG). | M/L https://nextpredict.io/platforms/adi-predictstreet/ , https://www.gamblinginsider.com/news/170192/kalshi-and-adi-predictstreet-who-are-the-real-world-cup-winners |
| On-chain users | ConditionalTokens token holders: 119,282; USDC.e holders: 21,948; ADI chain addresses 710k (chain-wide) | H Blockscout, 2026-10-19 |

DefiLlama's 30d/7d oddity from the hint is confirmed: the 30d figure is dominated by a handful of $3M-7M days in September and early October, followed by a collapse to near-zero. Treat the 30d and 1y volume as unreliable for sizing; use TVL and the live book depth.

## 11. Overlap with other venues, and shared liquidity

- **Overlap categories (listing level, H):** (a) football: UEFA Champions League, Serie A, EPL, La Liga, Championship, Liga MX, Argentine/Saudi/Turkish leagues, MLB, KBO, NBA/NFL/NHL spreads and totals -> overlaps Polymarket, Kalshi, Limitless, sportsbooks; (b) politics: 2028 US nominees, 2026 midterms (Balance of Power, House/Governor/Senate seats and margins), French 2027 presidential, county judge races -> overlaps Polymarket/Kalshi; (c) crypto: BTC/ETH Up/Down 5m/15m/1h/1d -> overlaps Polymarket up/down and Kalshi crypto; (d) macro and index: S&P/Nasdaq-100 4pm EDT range buckets, CPI core YoY, GDP, Fed dissents -> Kalshi-style contracts; (e) weather (daily lowest temperature by US city), culture (Oscars, Grammys, TIME Person of the Year), AI leaderboards.
- **But the overlap is notional.** Only 2 of 50 most active markets had real two-sided books; the rest are empty or sentinel-only. `outcomePrices`/`chances` fall back to last trade, which may be days or weeks old. Do not use these as an arbitrage price without a live book check.
- **Independent liquidity? Yes, own off-chain CLOB and own vault collateral.** Not shared with Polymarket (despite the deposit-from-Polymarket funding flag), not shared with Kalshi: Kalshi's communications head said any use of Kalshi markets by ADI would be a future possibility; the June 2026 press release language ("combining Kalshi's market expertise and liquidity capabilities with ADI Predictstreet's blockchain infrastructure", "beyond the World Cup") is forward-looking, with no routing described (M https://sportsmintmedia.com/kalshi-and-adi-predictstreet-forge-alliance-to-expand-global-prediction-markets-during-fifa-world-cup/ , https://www.gamblinginsider.com/news/170192/... ; the Kalshi statement text was read via a search summary, the article itself returned 403). Fanatics Markets provides a co-branded front door/hub, not a book (M). Re-check this: if Kalshi flow is later routed in, PredictStreet becomes a duplicate-liquidity leg.
- **Role for the aggregator:** at most a low-weight price/volume signal for the few liquid UCL-type football markets; a data source for LSports-resolved event metadata; never a place to put the second leg.

## 12. Adapter design notes (if built; read-only, P2)

1. Discover: page `GET /api/markets?status=OPEN&sort=activity&limit=500` (cache 10 s; every 5-15 min is plenty), de-dup by `symbol`.
2. Candidate filter: keep only markets whose REST orderbook (depth 20) has a real bid > 0.01 AND real ask < 0.99; drop sentinel quotes. Then subscribe `token_book` on those token ids over `/ws/market`, resync with the `hash` check.
3. Key normalisation: `conditionId` + `yesTokenId`/`noTokenId` are Polymarket-compatible shapes; use `negRiskMarketId` + `negRiskQuestionIndex` for categorical grouping, `groupItemTitle` for outcome names, `tags[].slug` / `vertical` for category.
4. Price semantics: YES-view book; NO bid p == YES ask 1-p. Use `chances` only when the book is two-sided.
5. Cost model: fee = 0.06 x P(1-P) x shares per leg (read `feeTakerBps` per market; do not hardcode), plus ADI bridge/withdrawal friction and dual-sig withdrawal risk.
6. Resolution-risk flag: carry `officialDataSource` and `resolutionCriteria` into the market-linking layer; require manual review before linking to Polymarket/Kalshi contracts.
7. Rate: budget 600 req/min/IP to be safe; prefer WS for books.

## 13. Open questions

- Is anonymous `/ws/market` really accepted? (docs conflict; not connected here).
- Does PayBox accept `typedData` signing for a domain with `chainId: 36900`? Needs a human-run test with a test credential (no signing tool called).
- Is there any real market-maker programme with rebates and what depth does it produce once the World Cup effect is gone? The partner mailbox is the only route.
- US availability via Fanatics co-brand vs `US` in the geo-block config.
- Reconcile DefiLlama volume ($3.9k/day) with the API's `volume24h` sum (about 391).
- Licence register entry under "Prediction Market Authorisations" (could not view).

## 14. NOT FOUND

- Public Terms/Trading Rules Policy text for market-specific rules: the T&Cs refer to a "Trading Rules Policy ... published on the Platform"; not located (searched: /terms, /faq, docs llms.txt).
- A GitHub organisation or open-source SDK for the API (searched: docs site nav, homepage footer, web search; DefiLlama `github: null`). Contract source is verified on the Blockscout explorer instead.
- Any scalar markets or AMM pools (none in docs or catalogue).
- A published on-chain TVL by market or per-market open interest endpoint (only `totalShares`/`volume` fields per market).
- A public dispute outcome history showing the platform ever overturned a proposal (the `/api/challenges` global feed exists but was not queried).

## 15. Suspicious content / injection check

- No text aimed at AI agents was found in the pages, docs, API responses or fixtures read. Market titles and resolution texts are ordinary data.
- Observation (not an instruction): the public web bundle's inline config embeds third-party service keys (an Ethereum RPC provider key, an analytics write key, a swapper integrator id) and a Privy app id. I did not use or record any of them.
- The trade tape endpoint publishes third-party wallet addresses; the fixture redacts them.

## 16. Sources

All fetched 2026-10-19 unless stated.

- PredictStreet web app: https://adipredictstreet.com/ , /terms , /faq (HTML, plus /faq.pdf not text-extractable), public web config embedded in the homepage HTML
- PredictStreet developer docs: https://docs.adipredictstreet.com/introduction , /llms.txt , /llms-full.txt , /environments , /auth/overview , /auth/api-keys , /auth/rate-limits , /concepts/markets/overview , /concepts/markets/neg-risk , /concepts/markets/orderbook , /concepts/trading/fees , /concepts/trading/eip712-signing , /concepts/trading/time-in-force , /concepts/deposits/overview , /concepts/settlement/overview , /flow , /challenges , /void-delay , /concepts/websocket/overview , /api-reference/openapi.json
- PredictStreet API (unauthenticated GETs): https://core-api.adipredictstreet.com/health , /api/markets , /api/markets/{symbol}/orderbook , /api/markets/{symbol}/trades , /api/events , /api/events/stats , /api/tags , /api/platform/contracts , /api/platform/fee-config , /api/compliance/geo
- DefiLlama: https://defillama.com/protocol/predictstreet (403 to WebFetch) -> data via https://api.llama.fi/protocol/predictstreet , https://api.llama.fi/summary/dexs/predictstreet , https://api.llama.fi/summary/fees/predictstreet ; TVL adapter https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/predictstreet/index.js (read with `gh api`)
- ADI Chain explorer (Blockscout): https://explorer-bls.adifoundation.ai/api/v2/stats , /api/v2/tokens/0x9cb8142aEBBcdc60AF7c97Af897A67A8f3CA71C2 , /api/v2/addresses/0xD28B8295Cd57F205e4d080Ff4c6d23C06a9EEe3a
- Press / secondary (M/L): https://igamingbusiness.com/prediction-markets/adi-predictstreet-launches-prediction-market-ahead-world-cup-2026/ ; https://www.globenewswire.com/news-release/2026/04/02/3267718/0/en/adi-chain-announces-adi-predictstreet-as-the-official-prediction-market-partner-of-the-fifa-world-cup-2026-marking-the-launch-of-its-first-consumer-facing-ecosystem-project.html ; https://nextpredict.io/platforms/adi-predictstreet/ ; https://sportsmintmedia.com/kalshi-and-adi-predictstreet-forge-alliance-to-expand-global-prediction-markets-during-fifa-world-cup/ ; https://www.gamblinginsider.com/news/170192/kalshi-and-adi-predictstreet-who-are-the-real-world-cup-winners (403, read via search summary only) ; https://predictionnews.com/story/kalshi-deal-with-adi-predictstreet-not-fifa-sparks-confusion (403, search summary only) ; https://www.igamingtoday.com/fifa-partner-adi-predictstreet-faces-backlash-over-giveaway-claims/ (search summary only)
- Gibraltar Gambling Division licence holders page: https://gamblingdivision.gov.gi/licence-holders (read; entry not found in the visible lists)
- Local project notes consulted: `docs/research/06-paybox-platform.md` (PayBox chain catalogue, `request_wallet_sign` semantics); live PayBox `discover_tokens` (chains) call, read-only.
