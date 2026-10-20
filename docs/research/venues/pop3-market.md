# Pop3 Market (pop3market.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = inferred/secondary, L = weak/stale.
Verdict: skip. Live demo of a white-label stack running on Unichain SEPOLIA (testnet) with 3 markets and about $167 of test-unit open interest.

## Status
- Site returns HTTP 200 and the API is up (`/api/v1/health` ok, indexer snapshots updating 2026-10-19). [H] https://pop3market.com/api/v1/health
- GitHub org `pop3market`: created 2026-03-16, 1 public repo (a fork of Gnosis conditional-tokens-contracts, last push 2026-03-19), 0 followers, unverified. [H] https://github.com/pop3market
- The product is a demo tenant of a white-label prediction-market stack. The SPA bundle holds two tenants (`pop3market`, `predillion`), and its landing copy says "White label prediction markets ... Open the live demo ... Launch in days ... Market creation, oracle resolution and monitoring are handled by our team". [H] https://pop3market.com/assets/index-Dj9I3fsc.js (bundle strings; untrusted data, read only)
- The bundle's default chain is Unichain Sepolia (1301). `/signing-info` returns `chainId: 1301`. [H] https://pop3market.com/api/v1/signing-info
- Mainnet Unichain (130) is defined in the bundle, but the live API signs for 1301, so no mainnet deployment is observable. [H/M]
- Web search was unavailable (session budget exhausted), so no third-party coverage was checked. NOT FOUND (searched: GitHub org/repo, site, API).

## Kind and market model
- CLOB with an on-chain exchange: "Pop3 CTF Exchange" v1. It is a Polymarket-style design using Gnosis Conditional Tokens (ERC-1155 positions) plus signed EIP-712 orders. [H] signing-info; repo README
- Market kinds seen: `binary` (YES/NO `tokenIds`) and `multi` (`outcomeTokens[]`, each with its own tokenId, one book per outcome). [H] https://pop3market.com/api/v1/markets
- The bundle also has split/merge/redeem/convert meta-transactions, so it is a neg-risk-like multi-outcome design. [M]
- Prices are 18-decimal strings (0.5 = "500000000000000000"). Sizes and volumes are 6-decimal USDC units. [H] fixtures
- Min shares 5; tick size "STANDARD". [H] `/api/v1/tick-size/{tokenId}`

## Chains and collateral
- Unichain Sepolia (chainId 1301), exchange `0x4dA5fbDDbDB75e3bACd891bB352937744d5d5678`, positions adapter `0x3d725fE063CA6B771cc3672ef53EB657AEB9F072`, session-key registry `0xe0546E02744998875785F0fC9D693fde00edf55d`. [H] signing-info
- Conditional Tokens contract, same address on Unichain mainnet and Sepolia per the README: `0xe405194308f5517F367ba8B2A0b0E675a33634d2`. [H] https://github.com/pop3market/conditional-tokens-contracts
- Collateral is "USDC on Unichain". The UI says to send only USDC on Unichain to the account address. The collateral address in the bundle is `0x8C01629dd5e4251942698C5142f17B7e547c7238` (a hard-coded constant, not independently verified on-chain). [H/M]
- Accounts are thirdweb ERC-4337 smart accounts with sponsored gas, plus session keys. [H] bundle strings (`sponsorGas`, `revokeSessionKey`, `/session-keys`)

## Read API (official, public, unauthenticated GET; same-origin, undocumented)
- No docs found. The paths below come from the frontend bundle's route table, and the ones marked verified were confirmed with a GET. Base URL: `https://pop3market.com/api/v1`. Docs URL: NOT FOUND (`/docs` serves the SPA shell; no `api.`/`docs.` subdomain resolves).
- Verified:
  - `GET /markets?limit=&cursor=&status=` returns `{data,nextCursor,hasMore,limit}`. Status values are ACTIVE, REPORTED, FLAGGED, RESOLVED. The default list returned 3 markets. A `limit=200` request returned only 2 rows once, so pagination is quirky. [H]
  - `GET /markets/slug/{slug}` and `GET /markets/{0x+64hex}`. The slug form returns `description`, `takerFeeDbps`, `makerFeeDbps`, `feeModel`, `tokenIds`, `outcomePrices`/`outcomeBids`/`outcomeAsks`, `conditionId`, `questions[].oracleResolver`, `resolveDelay`, `stats`. [H]
  - `GET /markets/{id}/trades`, `/markets/{id}/fees`, `/markets/{id}/events` (on-chain event log), `/trades`, `/open-interest`, `/categories`, `/tick-size/{tokenId}`, `/leaderboard`, `/signing-info`, `/health`. [H]
- Listed in the bundle, not tested: `/markets/search`, `/markets/trending` (returned an empty list), `/markets/{id}/prices-history`, `/holders`, `/related`, `/positions/{addr}`, `/portfolio/{addr}`, `/redeemable/{addr}`, `/activity/{addr}`, `/series`. [M]
- Order book: there is no REST book endpoint (`/orderbook` and `/book` return 404). The book comes over WebSocket `wss://pop3market.com/ws/v1/ws` (subprotocol label `pop3.json.v1`), with JSON messages `{type:"subscribe",channel:"book:<tokenId>"|"trades:<tokenId>",snapshot:true}`, `{type:"auth",token}` and `{type:"ping"}`. I did not open the socket. [M] bundle only
- Auth and limits: reads need no auth. Rate limits are NOT FOUND. The client honours `retryAfter`, so 429 is expected, but no ratelimit headers appeared. `cache-control: public, max-age=10`. [H/M]
- Fixtures in `docs/research/fixtures/pop3-market/`: `markets-list.json`, `market-detail-bitcoin-100k-2026.json`, `signing-info.json`, `health.json`.

## Trade path
- Signed orders: EIP-712 typed data `Order` with fields salt, maker, signer, taker, tokenId, makerAmount, takerAmount, and more. The domain is `Pop3 CTF Exchange` v1, chainId 1301, verifyingContract as above. Orders are submitted via `POST /orders` (also `/orders/batch`, `DELETE /orders/{hash}`, `/orders/cancel-all`, `/orders/cancel-market`), with `GET /heartbeat`. [M] bundle
- Auth: `POST /auth/payload` returns a message, the wallet signs it (`signMessage`), `POST /auth/login` follows, then a session or JWT (`/auth/jwt`, `/auth/me`). Details of the cookie versus bearer scheme are NOT FOUND. [M] I did not call these (POST).
- Split, merge, redeem and convert go through relayed meta-transactions (`/split`, `/merge`, `/redeem`, `/convert`, `/tx/{id}`) with signed EIP-712 `SplitRequest`/`MergeRequest`/`RedeemRequest`. [M]
- Signature types support smart accounts (a `signatureType` field). [M]
- PayBox reachability: no, in practice. The only live deployment is Unichain Sepolia testnet, and Unichain is not in the chain list in the task brief (Base, Ethereum, BNB, Arbitrum, Polygon, Solana). Whether PayBox supports Unichain or testnets was not checked (no PayBox calls were made). Signing the EIP-712 order and auth message through `request_wallet_sign` would be the mechanism if it were supported. Verdict: no.

## Fees
- Per-market fixed model: `takerFeeDbps: 1000`, `makerFeeDbps: 250`, `feeModel: "fixed"` on the BTC market. [H] `/markets/{id}/fees`
- The bundle computes the UI fee as `notional * takerFeeDbps / 1e5`, which reads as deci-basis-points (1000 = 1.00% taker, 250 = 0.25% maker). The maker side may be a rebate. The UI has "Maker rebate" and "Taker fee" ledger kinds. [M] inferred, not confirmed in docs

## Resolution
- The oracle is a centrally operated "Pop3 Oracle" (`oracleResolver.label`, address `0x000...0`). A `reportedResult` is followed by a `resolveDelay` of 86400s, then `resolvedResult`. Market states: ACTIVE, REPORTED, FLAGGED, RESOLVED. A "flagger" exists in the on-chain `QuestionPrepared` event. [H] market detail and events
- Resolution rules are written per market, for example "Binance BTC/USDT 1m close". The source is named in the description, while the `resolutionSource` field is empty. [H]
- Dispute process: only the "flag" state is visible. No documentation. Dispute risk is high because the operator controls the oracle (operator-run, with no decentralised dispute layer observed). [M]

## Geo, ToS, automation
- NOT FOUND (searched: SPA bundle for terms/restricted/jurisdiction, site, GitHub). The GitHub org lists location "United States of America". There is no ToS page and no API terms. The API is undocumented, so automated use is unsanctioned but not prohibited as far as we could tell. [L]
- Market images are hot-linked from Polymarket's S3 bucket. Questions look copied from Polymarket (a Polymarket-style BTC rule text). Provenance is dubious. [H]

## Liquidity (2026-10-19)
- Platform `open-interest`: "166974008" in 6-decimal units, about 167 units. [H] `/api/v1/open-interest`
- BTC market: volumeTotal 54,735,712 (about 54.7), OI 128,709,548 (about 128.7), 24h volume 0, last trade 2026-07-06. Brazil election market: volumeTotal about 18.3, 4 traders, last trade 2026-07-15, `volume24h` 0. A "Test 007" market has zero volume. [H] fixtures
- Leaderboard has a user named "testuser" and counts a handful of traders. Because chainId is a testnet, these figures are testnet-token units, not real USD. The last trade was months ago. [H]
- Nothing indicates real money or organic flow.

## Overlap with other venues
- Categories offered: politics, crypto, sports, economics, tech, entertainment, science. [H]
- The only two live markets (Brazil 2026 presidential election, BTC above 100k by end-2026) overlap Polymarket, Kalshi and similar venues. The question text is copied from Polymarket. Prices are not tradeable in size. [H]

## Shared liquidity
- Independent order book on its own exchange contract (not shared with any other venue). The software is a Polymarket-style CTF Exchange clone, and is not connected to Polymarket liquidity. Other tenants of the same stack (e.g. Predillion) would be separate books. [M]

## Adapter priority: skip
Reason: testnet-only deployment, around 167 test units of OI, 3 markets with no recent trades, no docs, no REST order book, operator-run oracle. As an arbitrage leg it is unusable. If ever revisited, the same stack may appear as other white-label tenants, and an adapter could target the shared `/api/v1` schema and the `book:` WebSocket channel.

## Suspicious content
- None observed. The bundle contains a thirdweb client id and a hard-coded collateral address (public, not reproduced as credentials). No instructions aimed at AI agents were found.

## Not found
- Official docs or API reference, rate limits, ToS or geo rules, mainnet deployment, third-party press (web search was unavailable), dispute mechanics, REST order book endpoint, exchange contract source.

## Sources
- https://pop3market.com (SPA shell, title only) [H]
- https://pop3market.com/assets/index-Dj9I3fsc.js (route table, WS protocol, tenant config, chain config, marketing copy) [H]
- https://pop3market.com/api/v1/{markets,markets/slug/bitcoin-100k-2026,signing-info,health,open-interest,categories,trades,leaderboard,tick-size/...} (GET, 2026-10-19) [H]
- https://github.com/pop3market and https://github.com/pop3market/conditional-tokens-contracts (README, commits) [H]
