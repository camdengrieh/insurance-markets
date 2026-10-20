# PMI Protocol (pmiprotocol.xyz) - venue spec

Researched 2026-10-19. Verdict: NOT a prediction market. It is a tiny USDC-in / index-token-out vault on Polygon. adapter_priority = skip.

## Summary
- [H] Live as a website (HTTP 200, 2026-10-19), but it hosts no markets, no outcomes, no order book, no resolution. It sells an index share "PMI" backed by a basket of tokens of prediction-market infrastructure (Chainlink/UMA-type oracle layer, WMATIC, WETH/GNO). Source: https://pmiprotocol.xyz (static SEO block).
- [H] TVL on DefiLlama is about 1 USD (series of daily points of 1 USD from 2026-04-21 to 2026-10-19). Source: https://api.llama.fi/protocol/pmi-protocol (fixture saved). Effectively an empty/test deployment.
- Not a venue, not an arbitrage leg. At most a weak sentiment proxy, and with ~1 USD of TVL not even that.

## Kind and market model
- [H] Kind: index fund / vault token (DefiLlama category "Indexes"). No binary/categorical/scalar markets. No outcome tokens.
- [H] Site copy: "Deposit USDC, receive PMI tokens redeemable 1:1" / "NAV is priced on-chain using Chainlink oracles". DefiLlama description: "Deposit USDC, receive PMI shares at NAV. Vault holds UMA, WMATIC, and GNO via Uniswap V3".
- [H] Discrepancy to flag: site lists composition LINK 33.75%, WMATIC 28.125%, WETH 28.125%, USDC buffer 10%; DefiLlama (and the discovery hint) says UMA, WMATIC, GNO. The site and the aggregator listing disagree, so composition is unreliable. Neither list includes any prediction-market outcome exposure.

## Chains and collateral
- [H] Polygon only. Collateral: USDC. Vault/token address per DefiLlama: polygon:0x9DD6641423200b1FBd0BFF45f376BEE66Be1F4E4 (also present in site JS bundle). Other addresses in the bundle (not decoded, unverified): 0x3c499c54...3359 (looks like native USDC on Polygon), 0xca11bde0...ca11 (Multicall3 standard address); the rest unidentified.
- [M] Site JS bundle references Pyth Hermes (https://hermes.pyth.network/v2/updates/price/latest), several public Polygon RPCs and the Etherscan v2 API; site copy says Chainlink for NAV. Oracle source therefore unclear.

## Read API
- exists: none (official). Searched: https://pmiprotocol.xyz/docs, /docs, /api (all 404 text/plain), site bundle /assets/index-D9319Zc2.js (only RPC/oracle URLs, no REST API host), WebSearch extended (no results for the project). No docs site, no GitHub repo for the protocol found (DefiLlama lists github "ninjacornix", a personal account; not investigated).
- Read path would be on-chain only (vault share price / totalAssets on Polygon). Not useful for market data.
- [H] robots.txt allows all; sitemap at /sitemap.xml (not fetched).

## Trade path
- On-chain deposit/redeem of USDC against the vault on Polygon (ERC-4626-like behaviour inferred, M/L, ABI not read). An EVM wallet reachable through PayBox on Polygon could in principle call it with transaction proposals, but there is nothing to trade for arbitrage: no outcome pricing. Not pursued. No signing or money-moving calls were made.
- paybox_reachable: partial (Polygon vault deposit would be possible in theory; irrelevant to the project).

## Fees
- NOT FOUND (searched: site static content, DefiLlama metadata). Unknown deposit/redeem/management fee.

## Resolution mechanism
- Not applicable. No markets. (It holds tokens of oracle infrastructure such as UMA, which is used by Polymarket for resolution, but holding the token confers no market exposure.)

## Geo / ToS / automation
- Site claims "No KYC, no signup, just a wallet" and "Non-custodial" (H, site copy). No ToS page found. DefiLlama lists "audits: 2" (M, not verified; no audit report found).

## Liquidity
- [H] ~1 USD TVL, DefiLlama, daily series 2026-04-21 to 2026-10-19 (183 points). DefiLlama also shows small "pool2" values (about 3.3k USD summed over Ethereum/Base/Arbitrum/Polygon) in currentChainTvls; origin unexplained, treat as M/L noise.
- Shares liquidity with: none (but also no market liquidity at all).

## Event coverage
- None. No sports/politics/crypto-price/macro event contracts.

## Adapter priority
- skip: not a prediction-market venue, ~1 USD TVL, no API or docs, no outcome tokens.

## Open questions
- Does the vault have any public ABI/verified source on Polygonscan? (Not checked; irrelevant to priority.)
- Why do site and DefiLlama disagree on basket composition?

## Not found
- API docs, GitHub repo, fee schedule, ToS, audit reports, any prediction-market contracts, third-party coverage (WebSearch returned nothing about PMI Protocol; closest hit was an unrelated project "Polyindex" on Base).

## Suspicious content
- None observed in the fetched pages. (Site HTML contains a hidden SEO block "display:none" for crawlers describing the project; it is marketing copy, not instructions.)

## Sources
- https://pmiprotocol.xyz (fetched 2026-10-19) [H]
- https://pmiprotocol.xyz/assets/index-D9319Zc2.js (grepped for URLs/addresses only; not executed) [H]
- https://pmiprotocol.xyz/robots.txt [H]
- https://api.llama.fi/protocol/pmi-protocol and https://defillama.com/protocol/pmi-protocol [H for the API numbers]
- WebSearch (extended) "PMI Protocol pmiprotocol.xyz prediction market index token Polygon": no relevant results [M]

## Fixtures
- docs/research/fixtures/pmi-protocol/defillama-protocol-pmi-protocol.json (trimmed DefiLlama protocol record)
- docs/research/fixtures/pmi-protocol/pmiprotocol-home.html (site shell, 6 KB)
