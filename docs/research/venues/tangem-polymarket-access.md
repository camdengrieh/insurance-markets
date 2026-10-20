# Tangem (Polymarket access) - venue spec

Researched 2026-10-19. Verdict: **skip** as an adapter. Tangem is a hardware wallet, not a venue. Any trading is Polymarket's CLOB, so it is covered by the Polymarket adapter (researched separately) and is not an independent arbitrage leg.

## Summary
- Kind: broker-or-frontend (non-custodial hardware wallet, card/ring, mobile app). [H]
- It has no markets, order book, API or settlement of its own.
- Users reach Polymarket by pairing the Tangem app to polymarket.com over WalletConnect, then tapping the card to sign. [H, Tangem blog, dated 2026-04-10]
- Tangem is a registered, verified Polymarket builder: month rank 151, volume about $12.65k, 14 active users. [H, Polymarket data-api]
- That is thin: roughly 0.001% of the top builder's month volume (betmoar, about $2.3B in the ALL period).

## Still live?
- Tangem: yes. tangem.com is up and describes the wallet as supporting "over 14,100 assets across more than 90 networks". [H, https://tangem.com/]
- Tangem's homepage does not mention Polymarket or prediction markets. It only says "Access thousands of dApps". [H]
- Polymarket access is documented only in a Tangem blog post (2026-04-10). [H, https://tangem.com/en/blog/post/what-are-prediction-markets/]
- Tangem's Polymarket builder entry is live in the data API as of 2026-10-19. [H]
- I did not find a Tangem-Polymarket partnership announcement or an in-app Polymarket tab. NOT FOUND (searched: web search "Tangem Polymarket ... integration" and "Tangem app Polymarket builder code in-app"; the second hit the session search budget; WebFetch of tangem.com/en/help-center/ returned no relevant article; tangem.com/en/blog/post/polymarket/ is a 404).
- Why the builder code exists is unknown. The blog describes plain WalletConnect to polymarket.com, which would not carry a Tangem builder code. Either Tangem has an in-app or deep-link flow I could not find, or the code comes from something else. [open question]

## Market model, chains, collateral
Inherited entirely from Polymarket:
- Polymarket is an order-book CLOB with binary and categorical (multi-outcome as linked binaries) markets, with outcomes tokenised as ERC-1155 conditional tokens. [M - from prior knowledge, covered by the parallel Polymarket workflow]
- Chain and collateral: Polygon, USDC. The Tangem blog says "Polymarket runs on the Polygon blockchain and uses USDC for all trading." and "You'll typically need USDC on the Polygon network." [H, Tangem blog]
- Tangem supports many chains, including Ethereum, Polygon, Avalanche, BNB Smart Chain, Base, Arbitrum and Optimism. [H, same blog]

## Read API
- Tangem: none. No markets, prices or trades exist at Tangem, so nothing to read. Rating: none.
- Useful public surface: Polymarket's builder leaderboard, `https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH|WEEK|DAY|ALL&limit=50&offset=N`. [H, unauthenticated GET 2026-10-19]
  - Response: JSON array of `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}`.
  - It returned at most 50 rows per call in my tests (limit=200 returned 50).
  - Tangem appears only in the MONTH period (rank 151). It was not found in ALL, WEEK or DAY at offsets 0-350. [H]
- Fixture: `docs/research/fixtures/tangem-polymarket-access/builders-leaderboard-month-offset148.json` (5 rows, including the Tangem row).
- Related endpoint seen: `/v1/builders/volume?timePeriod=ALL` returns a daily time series per builder, with `dt` and the same fields. [H, first 500 bytes only]
- Polymarket's own CLOB and Gamma docs index: `https://docs.polymarket.com/llms.txt` lists the CLOB OpenAPI (`api-spec/clob-openapi.yaml`), the Gamma OpenAPI (`api-spec/gamma-openapi.yaml`), the market WebSocket AsyncAPI (`https://ws-live-v2.polymarket.com/asyncapi.json`) and trading fees (`trading/fees.md`). [H] These belong to the Polymarket spec, not this one.

## Trade path
- Tangem is the signer: an EIP-712 or personal-sign request arrives over WalletConnect and the user taps the card. [H, Tangem blog] A human tap is required for each trade ("Each later trade prompts a tap-to-confirm in the app").
- Programmatic placement is not possible through Tangem. The tap makes it unsuitable for bots or agents. [M, inferred from the described flow]
- Builder attribution is by builder code attached to each order and serialised onchain in the signed order. Builders get relayer gas-free operations and the leaderboard. [H, https://docs.polymarket.com/developers/builders/builder-intro]
- An agent would trade Polymarket directly through the Polymarket CLOB with its own key, not via Tangem.

## PayBox reachability
- paybox_reachable: **no** for Tangem as a venue. There is nothing to propose a transaction to.
- Polymarket reachability is handled in that venue's spec. Tangem adds nothing.

## Fees
- Tangem charges no per-trade fee on Polymarket in the documents I read. NOT FOUND (searched: Tangem blog, Tangem homepage).
- Polymarket fees apply (see docs.polymarket.com/trading/fees.md). The builder docs page does not describe fees or revenue share for builders. [H]
- Tangem may charge swap and on-ramp fees for funding USDC on Polygon. NOT FOUND (not researched in depth).

## Resolution
Polymarket's resolution mechanism applies (docs.polymarket.com/concepts/resolution.md; UMA-based per prior knowledge [M]). Tangem has no resolution role.

## Geo, ToS, automation
- Polymarket's geoblock rules apply to the user. I found no geoblock page in the docs index. [H that none is listed]
- Tangem: no prediction-market ToS read. NOT FOUND.
- The wallet being a non-custodial hardware device means Tangem itself does no geo-gating of Polymarket. [M]

## Liquidity
- Tangem builder volume (Polymarket data-api, MONTH period, fetched 2026-10-19): $12,651, 14 active users, rank 151. [H]
- Neighbours in the same query for scale: rank 149 Defined $13.1k, rank 153 sharpside $11.7k.
- This is volume routed through Polymarket and is not separate liquidity.

## Event overlap and independence
- Same markets as Polymarket: sports, politics, crypto price, macro. These overlap with Kalshi, Limitless, Predict.fun and others.
- It is **the same liquidity as Polymarket**, so it is not an independent arbitrage leg.

## Adapter priority
**skip.** It is a wallet frontend with no API, no unique liquidity and a human-tap signing flow, and its Polymarket volume is tiny. Use the Polymarket adapter.

Optional use: the builder leaderboard could feed a "who routes volume to Polymarket" signal. Low value.

## Suspicious content
None observed. The search tool results contained no instructions aimed at the agent.

## Open questions
- Does Tangem have an in-app Polymarket flow or deep link that carries its builder code? Not found.
- Why does the Tangem builder entry have no logo? (`builderLogo` is empty.) Probably irrelevant.
- Is Tangem's presence only in the MONTH window (and not in ALL top 350) a sign the builder code was registered recently? Possible. Unverified.

## Sources
1. https://tangem.com/ - homepage, read 2026-10-19 [H]
2. https://tangem.com/en/blog/post/what-are-prediction-markets/ - dated 2026-04-10, WalletConnect flow, Polygon/USDC [H]
3. https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=5&offset=148 - fixture, fetched 2026-10-19 [H]
4. https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL - first 500 bytes, 2026-10-19 [H]
5. https://docs.polymarket.com/developers/builders/builder-intro - builder program [H]
6. https://docs.polymarket.com/llms.txt - docs index [H]
7. Web search results (extended): coverage of MetaMask, Trust Wallet and Bitget Wallet Polymarket integrations; no Tangem partnership announcement found [M]
