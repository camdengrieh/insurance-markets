# Ethos Markets (ethos.markets) venue spec

Researched 2026-10-19. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Live, but it is NOT a prediction market. It is a perpetual "trust vs distrust" reputation market (an LMSR-style AMM) on Base, priced in ETH, with no resolution and no event outcomes. 24h volume across all 243 markets is about 0.027 ETH (about $65). There is no cross-venue arbitrage leg: the only possible use is as an off-venue sentiment/reputation signal. Priority: skip (at most P2 signal-only). Confidence high.

## Liveness [H]
- ethos.markets returns HTTP 200 (curl, 2026-10-19). Source: https://ethos.markets
- API markets list shows `updatedAt` as recent as 2026-10-18T23:37Z (market 298), so the contracts are being traded. Source: https://api.ethos.network/api/v2/markets
- DefiLlama still lists "Ethos Markets" (id 5705, category SoFi, chain Base, listed 2025-01-30; methodology: TVL = ETH held in v1 Reputation Markets contract). Source: https://api.llama.fi/protocol/ethos-markets
- Product has evolved: v1 reputation markets (Jan 2025, https://www.ethos.network/post/trade-trust-on-the-first-ever-reputation-market-with-ethos-markets [H], post says launch covered 9 people), then "Ethos Trade: Reputation Markets v2" in Beta (blog dated 2026-07-07 per search summary [M]; https://www.ethos.network/post/ethos-trade-reputation-markets-v2-enter-beta [H for content]). v2 adds markets on any X account / GitHub repo / YouTube channel (launch markets: Ansem, Anthropic, Polymarket), perpetual contracts with leverage, a test token "$MMB". The v2 post does not state chain, collateral, fees or API [H: NOT FOUND in post].
- $WHUF token: TGE 2026-09-08, listed 2026-10-08; whitepaper says "Ethos Trade is now fully backed by $WHUF" is claimed on X [M, search snippet only] and the contract list includes an `EthosMarket ($WHUF)` contract. Source: https://whitepaper.ethos.network/security/contracts-and-ownership.md [H].

## Kind and market model
- Kind: onchain-other, perpetual reputation market, "binary perpetual" in the vendor's words. [H] https://whitepaper.ethos.network/ethos-mechanisms/litepaper.md
- Each market is tied to an Ethos profile (an X account/person). Two vote tokens per market: trust votes and distrust votes. Starts 50:50; buying trust raises trust price and lowers distrust price. [H] litepaper.
- Pricing: LMSR AMM with fixed liquidity parameter per market; `AdaptiveLMSRPricing` stateless library at 0xf07dCB42fA74Daa0Dcd5e66042E217B7775dB7d1 (Base). v2 blog: LMSR modified so prices swing more in small markets. [H]
- Outcome tokenisation: votes are internal accounting in the Reputation Market contract (0xC26F339F4E46C776853b1c190eC17173DBe059Bf), not ERC-20/ERC-1155 outcome tokens as far as the docs show. [M] (contract source not read)
- Prices: trust price + distrust price always sums to basePrice (0.01 ETH in observed markets), so price is directly the "trust %". [H] API sample: `positivePrice` 5214368507484208 + `negativePrice` 4785631492515792 = 1e16 wei.
- Config types observed: NORMAL, VOLATILE, INSULATED. [H] API.
- Does NOT resolve ("these markets are perpetual, and do not resolve"). [H] litepaper.

## Chains and collateral
- Base (chain id 8453). Collateral: ETH for v1 markets (API amounts in wei, `creationCost` 0.1-0.2 ETH). [H] API + litepaper ("0.1e of liquidity"). A $WHUF-denominated `EthosMarket` contract exists on Base. [H] contracts page; its market data is NOT exposed by the documented v2 API (NOT FOUND).
- Contracts (Base): Reputation Market 0xC26F339F4E46C776853b1c190eC17173DBe059Bf; EthosMarket ($WHUF) 0x27F49210bc000BEE3197aFB4397969df35810919; $WHUF 0xeeee77bC7e82c0d4166d52F58239D4c5Bf41eeee. [H] https://whitepaper.ethos.network/security/contracts-and-ownership.md
- Owner is a 3-of-5 Safe; admin 2-of-5 Safe that cannot withdraw or upgrade. [H] same page.

## Read API
- Exists: official, public, unauthenticated GET (verified). Docs: https://developers.ethos.network/api-documentation/api-v2/markets [H]. Base URL `https://api.ethos.network/api/v2`.
- Rate limit: response headers `ratelimit-policy: 200;w=60` (200 requests/60s per client, unauthenticated). [H] curl headers.
- Auth: none needed for the GETs below. Docs page does not state auth rules (page text truncated) [M].
- Websocket: NOT FOUND (docs page, CSP of ethos.markets lists only wss for walletconnect/walletlink).
- Endpoints (all [H] from docs; GET ones marked V were called and returned 200):
  - `GET /markets?limit&offset&orderBy&orderDirection&dayRange&filterQuery` V. orderBy enum (from 400 error): marketCapWei, volumeTotalWei, volume24hWei, trustRatio, distrustRatio, score, createdAt, priceChange24hPercent, marketCapChange24hPercent, scoreDifferential. limit max 100. Returned `total: 243` markets.
  - `GET /markets/featured` V (top-volume, undervalued, pumping, rugging, uprising)
  - `GET /markets/fees` V -> `{"donationFeePercentage":0.01,"entryProtocolFeePercentage":0.01,"exitProtocolFeePercentage":0}`
  - `GET /markets/{profileId}/vote-price?voteType=trust|distrust` V
  - `GET /markets/{profileId}/price/history?timeWindow=1D` V (15-minute buckets, ETH and USD values)
  - `GET /markets/simulate-buy?profileId&voteType&buyAmountWei` V -> impactPct, min/maxVotesToBuy, newPrice
  - `GET /markets/simulate-sell?profileId&voteType&votes&sellerAddress` (needs real holder; 400 INSUFFICIENT_VOTES otherwise)
  - `GET /markets/{profileId}/holders`, `/markets/{profileId}/user-votes`, `/markets/holdings`, `/markets/{profileId}/change`, `POST /markets/{profileId}/info`, `GET /markets/info/bulk` (max 500 ids), user lookup by address/X handle.
  - Trades/fills feed: NOT FOUND in the endpoint list read (docs page was 115k chars, only first 100k read). Resolution endpoint: n/a (no resolution).
- Fixtures: docs/research/fixtures/ethos-markets/ (markets-list.sample.json trimmed to 2 markets and 4 user fields, price-history.sample.json first 3 buckets, fees.json, simulate-buy.json).

## Trade path
- On-chain only: call buy/sell votes on the Reputation Market contract on Base from an EVM wallet (website logs in via Privy, embedded wallets, X login). [H] CSP of ethos.markets lists privy.io, walletconnect, api.relay.link. Exact ABI not read (NOT FOUND in docs; would need Basescan/verified source or repo).
- No CLOB, no signed-order API. `simulate-buy/sell` gives off-chain quotes. [H]
- PayBox: an EVM wallet on Base reaching this would use transaction proposals (contract call with ETH value). Reachable in principle ("partial"): needs ABI, and ETH on Base. Not tested; no PayBox tools called.

## Fees [H unless noted]
- `/markets/fees`: donation 1% (market-owner tip on buys), entry protocol fee 1%, exit protocol fee 0%. Launch post: "market owners receive 1% of all buys". Who pays: buyer. Protocol fees on $WHUF are burned per whitepaper (M, WHUF page snippet). Gas on Base extra.
- Creation cost 0.1-0.2 ETH liquidity (API `creationCost`).

## Resolution and dispute risk
- None: perpetual, no resolution, no oracle. Price is whatever the AMM says. Risk is contract/admin risk (Sherlock audit Dec 30 2024 for Reputation Market; 3/5 owner multisig), v1 to v2 migration risk, and product-pivot risk. [H] https://whitepaper.ethos.network/security/smart-contract-audits.md

## Geo, ToS, automation
- Launch post (Jan 2025): "available to everyone, and does not require an invite". [H, stale >6 months]. Current ToS and geo blocks: NOT FOUND (web search budget exhausted; terms page not read).
- Automation: no explicit rule found. Public API is rate limited at 200/60s.

## Liquidity (API, 2026-10-19)
- 243 markets total. Sum of `volumeTotalWei` ~1,368 ETH cumulative (~$3.3M at the API's implied ETH price of ~$2,430 from 0.01 ETH = $24.30). [H, computed from API]
- Sum of `volume24hWei` ~0.027 ETH (~$65); only 4 of 243 markets had nonzero 24h volume. [H]
- Sum of `marketCapWei` ~68 ETH (~$166k); the biggest market (profile 1) ~4.2 ETH market cap. [H]
- DefiLlama TVL was ~$198k at launch (2025-01-30); current figure not read (response truncated). [L]
- Liquidity is fixed-parameter AMM per market, so depth per market is tiny; large trades move price.

## Event overlap with other venues
- None meaningful. Markets are about reputation of individuals/companies, not sports/politics/crypto price/macro. The only loose analogue is v2 markets on entities (Anthropic, Polymarket, Ansem) which are sentiment indices, not contracts that settle. No arbitrage vs prediction venues. Shares liquidity with no other venue.

## Adapter priority: skip
- Perpetual non-resolving index, ~$65/day volume, no settlement to hedge against. If wanted later, a 20-line read-only "reputation signal" poller on `/markets/info/bulk` and `/markets/{id}/price/history` is cheap (P2 signal-only), but not an arbitrage leg.

## Suspicious content
- None found. No instructions aimed at agents in fetched pages.

## NOT FOUND
- ToS / geo restrictions (searched: launch post, help article; web search budget exhausted before ToS search).
- Fee formula for v2 perps; v2 chain/collateral/contract addresses (searched: v2 blog post, whitepaper llms.txt index).
- Reputation Market contract ABI/function names; trades feed endpoint; websocket.
- Current DefiLlama TVL number.

## Sources
- https://ethos.markets (HTTP 200) [H]
- https://api.ethos.network/api/v2/markets, /markets/fees, /markets/featured, /markets/{id}/vote-price, /price/history, /simulate-buy [H]
- https://developers.ethos.network/api-documentation/api-v2/markets [H, first 100k chars]
- https://whitepaper.ethos.network/ethos-mechanisms/litepaper.md [H]
- https://whitepaper.ethos.network/security/contracts-and-ownership.md [H]
- https://whitepaper.ethos.network/security/smart-contract-audits.md [H]
- https://www.ethos.network/post/trade-trust-on-the-first-ever-reputation-market-with-ethos-markets [H, dated 2025-01-29, stale]
- https://www.ethos.network/post/ethos-trade-reputation-markets-v2-enter-beta [H]
- https://help.ethos.network/en/articles/14044115-what-are-ethos-markets [H]
- https://api.llama.fi/protocol/ethos-markets [H]
- WebSearch summaries (observers.com, atomicwallet.io etc.) [M/L]
