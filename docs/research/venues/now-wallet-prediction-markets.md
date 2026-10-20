# NOW Wallet (prediction markets) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch of walletnow.app, its Terms of Service and one press release, unauthenticated GETs to Polymarket's public data-api (User-Agent `insurance-markets-research/0.1`). WebSearch was unavailable (session budget exhausted), so no independent search for coverage beyond the press release. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. Third-party text was treated as untrusted data; none contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or small-model page summary, or inference; **L** = weak or stale.

## 0. Verdict

**adapter_priority: skip.** Keep a registry record only (kind `broker-or-frontend`).

1. NOW Wallet is a wallet front end, not a venue. Per its own press release it embeds access to two third-party protocols, Polymarket and PancakeSwap (prediction). It has no book, oracle, contracts or API of its own that we found (M, section 1, 3).
2. Liquidity is 100% shared with those two venues, so it is not an independent arbitrage leg. The Polymarket side duplicates Polymarket International (already covered); the PancakeSwap side is a 5-minute up/down BNB game (see sibling note `pancakeswap-prediction.md`, P2).
3. Launch is only evidenced by a paid press release (Chainwire, 2026-05-21). The homepage and the Terms of Service do not name Polymarket. Polymarket's public builder leaderboard has no NOW Wallet entry among roughly 500 ALL-time rows, so there is no public volume attribution for it (H, section 6).
4. There is no integration surface worth building for: orders would go to Polymarket's CLOB or PancakeSwap's contracts directly, which are better adapters on their own.

## 1. Is it still live? (2026)

| Check | Result | Tag |
|---|---|---|
| Press release "Perps and Prediction Markets Are Now Available in NOW Wallet", 2026-05-21 | Says it is available "in the latest version of NOW Wallet"; names Hyperliquid, Aster, Lighter, GMX, dYdX (perps) and Polymarket, PancakeSwap (prediction markets). https://chainwire.org/2026/05/21/perps-and-prediction-markets-are-now-available-in-now-wallet/ | H that the release says it; M that the product shipped (paid press release, about 5 months old, so possibly stale) |
| walletnow.app homepage | Fetched 2026-10-19: no mention of prediction markets, Polymarket, perps or PancakeSwap (also absent in raw HTML keyword grep; may be a client-rendered app) | H |
| walletnow.app/terms-of-service | HTTP 200. Section 2.2: app "may provide access to 'prediction market interfaces'"; 3.6 treats them as third-party dApps; 4.1 warns of outcome risk. Polymarket is not named. (Summarised by a small model.) | M |
| Third-party confirmation | NOT FOUND (searched: WebFetch of walletnow.app/blog (404), the press release; WebSearch unavailable this session). Polymarket builder leaderboard has no NOW entry. | - |

Conclusion: plausibly live as an in-app dApp browser or interface to Polymarket and PancakeSwap prediction, but unconfirmed on the vendor's own site and with no usage data. Confidence in "still live" is medium-low.

## 2. Kind and market model

- Kind: wallet front end / aggregator of third-party dApps (M). The release says users "connect to these protocols, fund trading balances, sign transactions, and manage positions while keeping self-custody" and "No centralised exchange accounts required" (H, press release as quoted by fetch).
- Market model is whatever the underlying venue uses: Polymarket = binary and negative-risk categorical CLOB on conditional tokens; PancakeSwap Prediction = pooled pari-mutuel 5-minute up/down on Chainlink prices (M, via sibling notes; NOT re-verified in depth here). PancakeSwap docs page confirms 5-minute UP/DOWN rounds on BNB Chain, markets BNBUSD, BTCUSD, ETHUSD, zkSync Era and Arbitrum markets paused (M, https://docs.pancakeswap.finance/products/prediction).
- NOT FOUND: which Polymarket market categories or how many markets NOW Wallet exposes (searched: press release, homepage, ToS).

## 3. Chains and collateral

- Wallet is described as non-custodial, multi-chain, 70+ networks (M, release). Which chains the prediction integrations use is NOT stated in the release (H that it is absent).
- By inference from the underlying venues only: Polymarket = Polygon, pUSD/USDC collateral; PancakeSwap Prediction = BNB Smart Chain, native BNB stake (M, sibling notes). Not verified for NOW Wallet.

## 4. Read API

- exists: **none** (no NOW Wallet-owned API found). docs_url: none. NOT FOUND (searched: walletnow.app homepage, /terms-of-service, /blog (404), press release outbound links - the only NOW Wallet link in the release is the homepage).
- For data, use the underlying venues' APIs (Polymarket gamma/clob/data APIs; PancakeSwap contract views). A NOW Wallet adapter adds nothing.
- Attribution check: Polymarket `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=N` (public, no auth) returns `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]`. Paging offsets 0..500 gave about 500 rows (ranks to 550); no builder name containing "now" or "walletnow". Fixtures: `docs/research/fixtures/now-wallet-prediction-markets/` (H). Caveat: builder code is optional attribution, so absence does not prove NOW Wallet is not routing to Polymarket; it could be using an un-named code, no code, or a webview of polymarket.com.

## 5. Trade path

- No NOW Wallet API. Any trading is the wallet app signing orders or transactions for the underlying venue inside the app UI (M, from the release wording). The wallet-side signing flow is not documented (NOT FOUND).
- For an agent: skip NOW Wallet and use the underlying venue directly. Polymarket needs EIP-712 signed CLOB orders plus API credentials (covered by the Polymarket workflow). PancakeSwap Prediction needs plain EVM transactions on BNB Chain (`betBull`/`betBear`, `claim`), which a PayBox EVM wallet could propose; the largest market rejects smart-contract callers (per sibling note, M).
- PayBox reachable: **partial** - only via the underlying venues, not via NOW Wallet.

## 6. Fees

- NOW Wallet fee on prediction trades: NOT FOUND (searched: release, homepage, ToS). Release states no fees (H that absent). Possibly a Polymarket builder fee (cap taker 100 bps / maker 50 bps per sibling note, M) if a builder code is used, but no evidence one is.
- Underlying venue fees apply (Polymarket taker fees; PancakeSwap 3% rake per sibling note, M).

## 7. Resolution mechanism and dispute risk

- Inherited from the underlying venue: Polymarket via UMA optimistic oracle (M), PancakeSwap via Chainlink price at an operator transaction (M, sibling note). NOW Wallet disclaims responsibility for "how these services work, how they price, and how they settle" (ToS 3.6, M).
- Added risk: wallet-layer outage or app bug; nothing documented.

## 8. Geo / ToS / automation

- ToS section 7: service not available in the Russian Federation; users represent they are not in the UK, Russia, UN-sanctioned countries or places where crypto is banned; 7.3 "We may restrict access based on IP, geolocation or other methods" (quoted from a small-model summary, M). Section 10.2 bars circumventing geo-restrictions and "automated scraping tools". No explicit bot or trading-automation clause (M).
- Underlying venues add their own geo-blocks (Polymarket global blocks the US and others; covered elsewhere).
- Operator: no legal entity named in the release; dateline Kingstown, Saint Vincent and the Grenadines, not confirmed as the company's seat (M).

## 9. Liquidity

- NOW Wallet specific volume/OI/TVL: NOT FOUND (searched: Polymarket builder leaderboard 500 rows, press release, homepage). No DefiLlama check done (budget on this venue is not worth it given verdict).
- Underlying: PancakeSwap Prediction about $0.32M/day gross stakes on 2026-10-18 (per sibling note, M, not re-checked). Polymarket global is covered by the parallel workflow.

## 10. Event overlap and arbitrage

- Overlap is entirely that of Polymarket (sports, politics, crypto price, macro, culture) and PancakeSwap (BNB/BTC/ETH 5-minute up/down). It is the same liquidity, so NOW Wallet gives zero independent price. **Shares liquidity with: Polymarket and PancakeSwap Prediction; NOT an independent arbitrage leg.**

## 11. Registry record to keep

`{ slug: now-wallet-prediction-markets, kind: broker-or-frontend, upstream: [polymarket, pancakeswap-prediction], independent_liquidity: false, api: none, status: live-unconfirmed (press release 2026-05-21) }`

## 12. Open questions

1. Does NOW Wallet use a Polymarket builder code (and what name)? If so volume is attributable via `/v1/builders/leaderboard`.
2. Is the prediction feature a native UI or a webview of polymarket.com / pancakeswap.finance?
3. Is it still shipped in current app versions (app-store changelog not checked).

## 13. Not found

- Own API or docs, fees, chains for prediction feature, volume, builder code, independent confirmation of launch beyond one press release, any third-party review.
- WebSearch (extended) could not run: session search budget used up.

## 14. Suspicious content

None. No instructions aimed at AI agents appeared in any fetched page.

## Sources

- https://chainwire.org/2026/05/21/perps-and-prediction-markets-are-now-available-in-now-wallet/ (H that it says what is reported; paid press release, 2026-05-21, possibly stale)
- https://walletnow.app/ (H, homepage, fetched 2026-10-19)
- https://walletnow.app/terms-of-service (M, small-model summary, fetched 2026-10-19)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, public GET, 2026-10-19; fixtures in `docs/research/fixtures/now-wallet-prediction-markets/`)
- https://docs.pancakeswap.finance/products/prediction (M, summary)
- Sibling notes: `docs/research/venues/pancakeswap-prediction.md`, `docs/research/venues/metamask-polymarket-integration.md` (M, not re-verified)
