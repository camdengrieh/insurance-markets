# Levr Bet (levr.bet) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public GETs only, no accounts, wallets, keys, signing or POSTs. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. "NOT FOUND (searched: ...)" means a search that came up empty.

## 1. Verdict

- **adapter_priority: P2 (signal-only / thin).** Do a read-only adapter at most. Do not build a trade leg.
- Live, but small. All-time notional is about $3.2M since 2026-02-05, and the last 30 days is about $0.55M notional ($0.17M collateral).
- The price is not independent price discovery. Token prices are derived from sportsbook feeds, including a Polymarket-derived feed (section 3).
- Every position is 2x-5x leveraged and liquidatable. There is no 1x option, so a hedged arbitrage leg can be liquidated while the other leg is still open (section 5).
- The US and about 60 other jurisdictions are excluded, and the API is undocumented.
- The only useful thing it offers is a free sportsbook-consensus moneyline reference with fixture IDs. That is a derived signal, not a venue to trade.

## 2. Is it still live? (yes)

- [H] `GET https://oracle-periphery.api.levr.bet/games/active?chainId=143` returned 19 active games on 2026-10-19 (NFL, NBA, NHL, cricket T20), with `status: "Open"` markets, e.g. games dated 2026-10-17 to 2026-10-22.
- [H] On-chain indexer (Subsquid, chain 143): newest `PositionOpened` at 2026-10-18T23:07Z, newest liquidation at 23:09Z, newest `MarketSettled` (game 5118) at 2026-10-19T00:04Z.
- [H] ToS dated "Updated: September 29, 2026" (https://levr.bet/terms).
- [H] DefiLlama lists it (`api.llama.fi/protocol/levr-bet`): category "Prediction Market", chain Monad, `listedAt` 2026-09-11, TVL $1.847M. Its methodology text says "currently in a pre-launch deposit phase where USDC deposits mint $MVP at a fixed $1.00".
- [H] That methodology text conflicts with the active USDC betting seen on-chain. Most likely it is stale text, or betting is gated or limited. Open question (section 12).
- [H] On 2026-09-11 (same day as the DefiLlama listing), most fee and leverage parameters were re-set on chain 143. Treat 2026-09-11 as the effective relaunch date.
- [H] `app.levr.bet` 301-redirects to `https://levr.bet/`. The Next.js app is served at the root.

## 3. Kind and market model

- **Kind: onchain-other.** A leveraged sportsbook exchange ("SBEX"), not a generic prediction market. It runs on Monad (chain 143), settles in USDC, and is operated by a company (section 9).
- [H] Docs (https://levr.gitbook.io/levr-bet-docs/overview/faq.md): "each type of bet represents a market that LEVR can tokenize ... token prices, valued between $0 and $1 ... each token corresponding to the winning side of a bet can be redeemed for 1 $USDC, while the losing side's token is worthless." Docs are from the Feb 2025 testnet/beta era and are stale (>6 months).
- **Outcome model:** binary-style, 2-way moneyline (home/away). `draw` is always 0 in the data seen, including cricket. Contract set (H, prod config in the client bundle): `levrFulltimeMarket` (moneyline) and `levrOverUnderMarket` (totals).
- **Active market type: only `FullTimeWinner`.** The indexer shows 20,459 moneyline `PositionOpened` events and 0 over/under events. Spread is not offered (UI string only).
- **Mechanism: oracle-priced vault counterparty, not an order book, in production.**
  - Pre-game, the MVP Vault is counterparty to all bets ("Counterparty AMM Framework"). [H docs]
  - Prod prices are set from external odds feeds (see below).
  - [M, inferred from the prod client bundle] The CLOB / "My Orders" queries are gated to non-prod (`enabled: !!headers && env !== PROD`), and the UI string `"liveGameTradingComingSoon":"Live game trading coming soon"` exists. So live peer-to-peer trading looks unavailable in prod today. On-chain, `TradeExecuted` (orderbook) events = 0 (H).
  - The Octane audit note (Feb 2026 blog post) refers to "what an off-chain orderbook enforces versus what the chain enforces", so the orderbook is off-chain with on-chain settlement. [H blog]
- **Tokenisation:** positions are tracked as `positionId` records in the market contract (events `PositionOpened`, `PositionRedeemed`). Whether they are ERC-20/ERC-1155 tokens: NOT FOUND (contracts not verified on Sourcify, 404 for router, orderbook and market).
- **Pricing source (key for arbitrage):** each market lists `providers: ["lsports","optic_odds","polymarket_optic_odds"]` and `primaryProvider: "optic_odds"`. [H, games/active]
  - Token price = de-vigged sportsbook consensus odds plus Levr vig. Example, game 5113 (Packers v Cowboys): raw American -108/+106, tokenPrice home 0.5025 / away 0.5025.
  - Observed home+away token price sums are about 1.004-1.02 across the 19 games. That is a 0.4-2% overround baked into the ask.
  - Docs say tokens mint between $0.20 and $0.80 (beta 20/80 clamp). Observed prices were 0.15-0.85, so that clamp is looser or changed.
  - Levr is therefore a follower of external sportsbooks (including a Polymarket-sourced feed). It is not an independent price signal, and it is not independent liquidity-driven discovery.
- **Per-market capacity:** `riskA = riskB = 5,000,000,000` (USDC 6dp, i.e. **$5,000 per side**) allocated per market, `totalMarketRiskAllocation: 10000`. Bet size on chain is min $5, max $1,000 collateral. Allocated vault risk across open markets was $551.5k at 2026-10-19T00:04Z. [H]

## 4. Chains and collateral

- [H] Chain: **Monad mainnet, chain id 143** (`MONAD_MAINNET=143` in the client bundle). Also in the bundle: Monad testnet 10143, plus staging/dev environments. Avalanche and Hyperliquid were announced in 2025 press releases [M]; the prod config in the bundle has only Monad 143.
- [H] Collateral: **USDC**, `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (Monad native USDC, 6 decimals). The PayBox `discover_tokens` result for chain 143 shows the same address with $14.5M liquidity.
- Vault: USDC deposits into `LevrMvpDepository` mint **MVP**, which auto-stakes to **sMVP**. 50% of platform revenue goes to sMVP holders (blog "MVP Vault: Be The House", 2025-11-18). [H] The chain config shows `feeShare` = 100% to MVP vault stakers (10000 bps). Withdrawals run in 7-day rounds, about four weeks end to end. [H blog]
- Prod contract addresses (from the first-party client bundle, `prod[MONAD_MAINNET]`; unverified on Sourcify) [H as to what the bundle says, M as to function]:

| Contract | Address |
|---|---|
| levrConfigProvider | `0xf5Ff63d916E3f55ea858E483446Ff21daFB53eFb` |
| levrManager | `0x67d1Be5105DB71d4eA590091aA60076BED42196F` |
| levrMarketRouter | `0xC6EfA0c145237220166d034671b14de3E0B20fc2` |
| levrFulltimeMarket | `0x0A4Fcba9a9977Bd3774e6Ea1895f7974087bA602` |
| levrOverUnderMarket | `0x6650Cf9C7C805C765a4ca72A3d6c4eCeB2Ab0eC5` |
| levrOrderbook | `0x8BEE00496AEb1889ebcA407F876035211f132954` |
| levrOrderbookLens | `0xDe5cDdDE7c33F95FB0999AC27baDdF43B0d55568` |
| levrMarketFeed | `0xd42A276Db08950Dc499B9AD2f33133eB1f0301c7` |
| levrMvpDepository | `0x141B1d9Ebd2E21749d6425CaeBaCc9704aAb9583` |
| levrFundManager | `0x6e541F40caA547d3A1D181105D9F13728D2ea97D` |
| levrLiquidationEngine | `0xAdC83f383c0Ec11fcDA03A23BD3Acae536e461Be` |
| levrPythFeed | `0x26f580F356a144aAcc6961584C299587854C9E68` |

  Other prod addresses are in the same bundle. Only `FundManager` has an ABI embedded in the bundle (`deposit`, `depositFor`, `fundPosition`, `withdraw`, `balances`). The router and market ABIs were not recoverable.

## 5. Read API (official? undocumented but first-party and public)

- **Docs URL:** none for the API. Product docs (stale) are at https://levr.gitbook.io/levr-bet-docs (llms.txt index: https://levr.gitbook.io/levr-bet-docs/llms.txt). NOT FOUND (searched: levr.bet, blog.levr.bet, gitbook, GitHub repo/org/code search, web search): API reference, OpenAPI, SDK repo, public GitHub org. The `docs.levr.bet` host does not resolve.
- **Classification: `unofficial-only`.** The endpoints below are the ones the official web app calls anonymously. They are not documented, can change without notice, and ToS reserves the right to block IPs and devices. In the schema enum this is closest to unofficial-only plus on-chain/subgraph.

| Host | Auth | Use |
|---|---|---|
| `https://oracle-periphery.api.levr.bet` | none | markets, odds, scores, leagues (REST + Socket.IO) |
| `https://levrbet.squids.live/v1-levr-prod-portal@v1/api/graphql` | none | Subsquid GraphQL of every contract event on chain 143. **GET with `?query=` works**, so no POST is needed. |
| `https://indexer.hyperindex.xyz/ee081a3/v1/graphql` | not tested | Envio Hasura mirror. GET returned `PersistedQueryNotSupported` (needs POST). |
| `https://orderbook.api.levr.bet/api/v1` | auth required | `/orders/open`, `/orders/closed`. Unauthenticated GET returned HTTP 400. Auth schemes in the client: `privyUser`, `privyAdmin`, `cloudflare`, `hmac`, `serviceHmac`. |
| `https://oracle-core.api.levr.bet`, `liquidation-engine`, `leaderboard`, `relayers`, `referrals`, `lambda`, `auth.api.levr.bet` | various / not tested | other services named in the bundle config |

Key endpoints on oracle-periphery (all [H] fetched 2026-10-19, fixtures saved):

- `GET /games/active?page=&limit=<=50&chainId=143[&gamePhase=LiveGame|PreGame][&leagueAbbreviation=NBA][&sortBy=league]`
  - Paged: `{data, links, meta{currentPage,itemsPerPage,totalNumberOfItems,totalNumberOfPages}}`.
  - Each game carries: `gameId`, `levrFixtureId`, `opticOddsFixtureId`, `lsportsFixtureId`, `eventName`, `homeTeam`/`awayTeam`, `fixtureDate`, `gamePhase` (PreGame/LiveGame), `scores`, `league{abbreviation,...}`, `sportGroup`, and `markets[]`.
  - `markets[]` entry fields: `levrMarketId`, `levrMarketContract`, `gameMarketId`, `marketType` (FullTimeWinner), `status` (Open), `winner`, `isMatured`, `targetLine`, `providers`, `marketRiskAllocation{boundedLossA/B,...}`, `odds{american,european,tokenPrice{home,away,draw}}`.
  - The response duplicates `markets` under a legacy `market` key.
- `GET /games/details?fixtureId=<levrFixtureId>&chainId=143` returns one `game` plus `chartData[10]` odds snapshots (`tokenPrice.priceA/priceB`, scores, period, clock) and `rawPricesFromDb`.
- `GET /leagues?page=&limit=` (23 leagues) and `GET /ticker-league-order`.
- Socket.IO (websocket transport) on the same host. Events seen in the client code (not connected by me): `ScoreUpdate`, `PhaseUpdate`, `GlobalOddsUpdate`. [M, from bundle]
- **Rate limits / caching:** `ratelimit-limit: 100`, `ratelimit-policy: 100;w=1` (100 req/s), `cache-control: public, max-age=5, stale-while-revalidate=30`. So poll at 5 s or slower, or use the websocket. [H]
- **History / settlement:** Subsquid entities are named `levr<Contract>Schema<Event>s` (plus `...Connection`). Useful ones:
  - `levrFullTimeMarketSchemaPositionOpeneds` (fields: `assetAmount`, `positionSize`, `eLeverage`, `entryPrice`, `liqPrice`, `positionFee`, `balanceFee`, `gameId`, `side`)
  - `levrFullTimeMarketSchemaMarketSettleds` (`winner`, `settledAs`)
  - `levrLiquidationEngineSchemaPositionLiquidateds`
  - `levrMarketRiskSentinelSchemaMarketRiskAllocateds`
  - `levrMvpDepositorySchemaVaultUtilizationUpdateds`
  - config events (`...PositionFeeBpsUpdateds` etc.)
  - Plain GraphQL introspection works.
- Fixtures: `docs/research/fixtures/levr-bet/` (5 files, all under 50KB; presigned S3 query strings stripped; trader addresses omitted).

## 6. Trade path

- **Programmatic order placement: no documented path. `trade_path` = on-chain contract calls on Monad only (undocumented ABIs), via the router.**
- The web app flow (inferred from the bundle) [M]:
  1. Login via Privy (email/social/passkey/wallet). Embedded wallet or external wallet.
  2. USDC `approve`, then fund via `FundManager.deposit`/`depositFor`.
  3. Open a position via the market router on chain 143. The client uses `previewAsks` and a `maxSlippage` setting.
  4. Gas is sponsored through `POST relayers.api.levr.bet/relay/transaction`, which needs a Privy access token. It falls back to the user's own wallet if the relay fails.
  5. Redeem via the router (`levrMarketRouterRedeemPosition`). Cash-out is available in the UI.
- Signed orders: none found for prod. The orderbook service uses Privy tokens or HMAC. NOT FOUND (searched: bundle, docs, blog): a public signing scheme, e.g. EIP-712 order types.
- ToS 1 says the Interface "is one, but not the exclusive, means of accessing the Protocol", so direct contract calls are allowed in principle. But the router/market ABIs are unpublished and unverified (Sourcify 404). An integrator would have to reverse-engineer the ABI from bytecode or the minified SDK.

## 7. PayBox reachability: **partial**

- [H] PayBox's `discover_tokens` chain catalog (query "Monad", 2026-10-19) lists Monad (`eip155:143`, native MON). Searching USDC on `eip155:143` returns the same USDC address Levr uses.
  - The tool says it is a "metadata catalog, not a support allowlist".
  - Monad is not among the 11 featured chains in project note `docs/research/06-paybox-platform.md`.
  - Behaviour of an EVM `transactionProposal` or `request_wallet_sign` on chain 143: NOT FOUND (unverified, no signing or money tool was called).
- [M] The PayBox EVM MPC wallet shares one address across all `eip155:*` chains (per `06-paybox-platform.md`), so the same EOA could in principle hold USDC on Monad.
- Blockers even if chain 143 works:
  1. Open Plugin EVM proposals are single-call. Levr needs approve + deposit + open-position, so 2 or 3 proposals.
  2. The router ABI is not public.
  3. Native MON is needed for gas, because the relayer needs a Privy session.
  4. The US and ~60 other jurisdictions are blocked by ToS.
  5. Min 2x leverage with liquidation makes hedging unsafe.
- Verdict: technically a plain EVM contract on a chain PayBox lists, so "partial". Practically not worth building.

## 8. Fees (who pays)

On-chain values from the Subsquid config events on chain 143, latest as of 2026-09-11 [H]. The formulas are not published, so the meanings below are [M]:

| Item | Value | Notes |
|---|---|---|
| Position fee | 100 bps | 1% of position size, paid by the bettor at open. Sample: size $750, `positionFee` $7.50. |
| Balance fee (tier fee) | 0-500 bps (pre-game), 0 bps in-game | In samples about 5% of position size on fresh positions: $37.50 on $750. Appears to scale with how one-sided the book is. |
| Tx fee | 100 bps | Docs: 1% of position size for both buyer and seller in live trading. The orderbook event has `buyerTxFee`. |
| Borrow fee | 800 bps | Docs say 10% of position size at 5x, accrued per in-game minute. Liquidated positions forfeit the collateral. |
| Weight fee | 5 bps | unknown purpose |
| Vig in the quoted price | about 0.4-2% | Token price sums to more than 1. |
| Liquidation buffer (2-way) | 800 bps | |

- Revenue split: 100% to MVP vault stakers (`feeShare` 10000/0/0/0).
- All-time fee totals from the indexer (H): position fees $32.2k, balance fees $116.2k on $3.22M notional.
- Effective cost of entering is therefore roughly 1% plus a 0-5% balance fee plus the vig. That is a large hurdle for any cross-venue arbitrage.

## 9. Resolution and dispute risk

- [H] ToS section 7 (https://levr.bet/terms, updated 2026-09-29):
  - Markets "are settled using data from third-party data providers delivered through an oracle network". Settlement is automatic on provider confirmation and "final and cannot be reversed ... except as expressly provided in Section 7.4".
  - Section 7.4: the operator may, "in our sole discretion", remediate (credits, voiding, refunds).
  - Section 7.7: dispute window of 48 hours via Discord or live chat only.
  - Section 7.2: cancelled, postponed or rescheduled events void all positions with collateral returned minus fees already charged. A rescheduled event assigned a new identifier by the provider is a new event, and prior positions are voided.
  - Section 7.5: liquidation is automatic when the oracle price crosses a threshold set by leverage; collateral is forfeited.
- [H] The Subsquid schema contains `MarketSettledWithOverrides` and `LevrGameMarketCanceledWithOverrides`, i.e. the manager role can override settlement.
- Providers named: LSports, Optic Odds (via the games API), Pyth (DefiLlama `oraclesBreakdown`: `levrPythFeed`). The score feed also references `gamestream.darkhope.dev` (non-prod only in the config).
- Audits (H, blog 2026-02-06): 0xWeiss/Hyacinth (Jan 2026; 17 findings: 1 High fixed, 5 Medium) and Octane (Jan 2026; 13 findings, framed as an "analysis"). The post flags reliance on off-chain orderbook assumptions. DefiLlama shows `audits: "0"`.
- Overall dispute risk: **high** (centralised operator discretion, third-party feed, 48 h window, sole-discretion remedy).
- Operator: "LL HOSTING SERVICES SOCIEDAD DE RESPONSABILIDAD LIMITADA" (ToS). Disputes go to ICDR arbitration seated in Delaware, with a class-action waiver.

## 10. Geo / ToS / automation

- [H] ToS section 2: the product is "NOT offered to persons or entities who reside in, are citizens of, are incorporated in, or have a registered office in" a list that includes the **United States, United Kingdom, Canada, Australia, France, Germany, Netherlands, Spain, Italy, Austria, Belgium, Switzerland, Singapore, Hong Kong, Mexico, Colombia, Taiwan, Russia, Israel**, and others, plus any US/UK/EU-sanctioned region. "We do not make exceptions."
- VPN/proxy/Tor, proxy wallets and multi-accounting are a "material breach". Penalties are account closure, forfeiture and clawback of rewards, blocking of wallet/IP/device, and reporting to authorities.
- ToS section 3: optional account creation may require sanctions/AML/source-of-funds verification.
- The app has a client-side country whitelist (`CountryWhiteListProvider`, `GET https://levr.bet/api/country` returns `{country}`).
- Automation: no general ban on API/bots in the ToS text read. It names "automated participation" only as grounds to void promotional credits, rewards and profits (sections 7.9/7.10). No API terms. NOT FOUND (searched: terms, privacy, docs).
- Practical: reading public data is low risk. Any trading by an automated agent from a restricted country would breach the ToS.

## 11. Liquidity (volume / TVL / OI), with source and date

| Metric | Value | Source, date |
|---|---|---|
| Vault TVL | **$1.847M** (peak $1.918M on 2026-09-14; flat since listing) | DefiLlama `api.llama.fi/protocol/levr-bet`, 2026-10-19 [H] |
| Allocated vault risk to open markets | $551.5k | Subsquid `VaultUtilizationUpdated`, 2026-10-19T00:04Z [H] |
| Risk cap per market | $5k per side | Subsquid `MarketRiskAllocated` [H] |
| Bet limits | $5 min, $1,000 max collateral | Subsquid config [H] |
| All-time (since 2026-02-05) | 20,459 positions, collateral $1.05M, notional $3.22M | Subsquid, computed 2026-10-19 [H] |
| Last 30 days (from 2026-09-19) | 1,884 positions, collateral $174k, notional $546k | same [H] |
| Last 7 days (from 2026-10-12) | 435 positions, collateral $36k, notional $113k | same [H] |
| UTC day 2026-10-18 | 45 positions, $9.4k collateral, $33k notional | same [H] |

- Peak month was April-May 2026 (about $0.75-0.87M notional per month). Aug 2026 fell to $91k.
- Since 2026-09-11, 63% of opened positions were liquidated (1,497 liquidations vs 2,370 positions). All-time 14,161 liquidations vs 20,459 opens, so most leveraged positions lose their collateral. [H]
- 445 positions were funded by promotional Levr Credits (all-time), a minor share.
- DefiLlama has no `dexs` or `fees` dimension adapter for levr-bet (HTTP 400, "not found").

## 12. Event categories and overlap

- [H] Sports only. Leagues in `/leagues`: NFL, NCAAF, NBA, WNBA, NHL, MLB, MLS, EPL, UCL, LaLiga, Bundesliga, Serie A, Ligue 1, World Cup, T20 and ODI cricket, and esports (LoL LEC/LCS/LCK/LPL, CS2 ESL/BLAST, TI). Only moneyline markets are live.
- The UI menu shows "Breaking / Politics / Crypto / Finance" under "Events", all flagged `comingSoon`. There are no politics, crypto-price or macro markets. [M, bundle]
- Overlap with other venues: NBA/NFL/NHL/MLB moneylines on Polymarket, Kalshi and similar. Because Levr's price is derived from sportsbook and Polymarket-derived feeds, it will usually sit within about 1-3% of those venues, with no structural edge after the 1% + balance fee + vig.
- Pre-game, positions "cannot be sold" per the docs (UI offers cash-out). Live trading is disabled in prod. So Levr cannot be used as a flexible hedge leg.
- Minimum leverage is 2x, and no position below 2.0x exists in 2,370 recent opens. Live-game odds swings can liquidate the Levr leg while the hedge leg on the other venue stays open.

## 13. Shares liquidity with another venue?

- No shared order book or pool with another prediction venue. It has its own MVP vault (about $1.85M).
- It does share **price source** with the sportsbook ecosystem: LSports, Optic Odds and a Polymarket-derived feed. It is not an independent price leg. At best it is a lagged copy of consensus odds.

## 14. Adapter spec (if built read-only)

- Poll `/games/active?chainId=143&limit=50` every 5-10 s (cache is 5 s; limit is 100 req/s). Normalise: `market_id = levrMarketId + gameId`, outcomes `[home, away]` with price `odds.tokenPrice.home/away`, `venue_price_type = "oracle_ask_incl_vig"`, `fees = {position:1%, balance:0-5%, borrow:800 bps on chain (accrual basis unverified; docs say per in-game minute)}`, `min_leverage = 2`.
- Join keys to other venues: `opticOddsFixtureId`, `lsportsFixtureId`, team names, `fixtureDate`.
- Settlement: poll `/games/details` for `markets[].status`, `winner`, `isMatured`, or query `levrFullTimeMarketSchemaMarketSettleds`.
- Flag: `executable = false` (no documented trade path), `independent_liquidity = false` (price follows consensus feeds), `us_restricted = true`.

## 15. Suspicious content

None observed. No text aimed at AI agents in the site, JS bundle, ToS, docs or API responses. The JS bundle contains normal Next.js, Privy, PostHog and analytics code. Tracking pixels are present (PostHog, Google Analytics, adrsbl). Not followed or executed. The bundle was fetched as inert text and was not executed.

## 16. Open questions

1. Is real-money betting open to every wallet on mainnet, or gated by allowlist or tournament whitelist (`TournamentWhitelistMerkleRootUpdated` events exist)? DefiLlama's "pre-launch deposit phase" wording conflicts with the on-chain activity.
2. Router and market ABIs: verified on Monadscan or another explorer? Not checked (Sourcify 404 only).
3. Can sMVP/MVP price be read on chain for a true vault NAV? Not read (would need `eth_call`, a POST).
4. Does live trading / the CLOB ship in prod? (UI says "coming soon").
5. Does PayBox actually accept EVM proposals on chain 143? Needs a human test with a zero-value proposal.

## Sources

- Official site, terms and blog
  - https://levr.bet/ (SPA shell, title "Home | Levr Bet"; 2026-10-19) [H]
  - https://levr.bet/terms (ToS updated 2026-09-29) [H]
  - https://blog.levr.bet/ (index, 2026-10-19) [H]
  - https://blog.levr.bet/post/security-audits-how-levr-bet-has-hardened-the-protocol-ahead-of-launch (2026-02-06) [H]
  - https://blog.levr.bet/post/mvp-vault-be-the-house (2025-11-18) [H]
  - https://blog.levr.bet/post/levr-bet-user-guide-is-now-live (2025-02-08) [H, stale]
  - https://levr-bet.webflow.io/old-home (legacy marketing page) [L, stale]
- Docs
  - https://levr.gitbook.io/levr-bet-docs/llms.txt, plus `.md` pages overview/faq, overview/levr-beta, overview/what-is-an-sbex, user-guide/pre-game, live-game, live-game/liquidations, my-bets. All beta-era (Feb 2025) [H for content, L for current accuracy].
- First-party APIs (public GETs, 2026-10-19)
  - https://oracle-periphery.api.levr.bet/games/active, /games/details, /leagues, /ticker-league-order [H]
  - https://levrbet.squids.live/v1-levr-prod-portal@v1/api/graphql (GET queries) [H]
  - https://orderbook.api.levr.bet/api/v1/orders/open (HTTP 400 unauthenticated) [H]
  - https://levr.bet/api/country [H]
- First-party client JavaScript (read as text; env config, chain ids, contract addresses, endpoint paths, UI strings) [H as to content, M as to interpretation]: `https://levr.bet/_next/static/chunks/*.js`
- Third-party
  - https://api.llama.fi/protocol/levr-bet (also https://defillama.com/protocol/levr-bet, which returned 403 to WebFetch) [H]
  - https://sourcify.dev/server/v2/contract/143/<address> (404 for router, orderbook, markets) [H]
  - https://learn.backpack.exchange/articles/guide-to-levr-bet (updated 2026-07-16 but text is 2025-era) [M]
  - https://dewhales.substack.com/p/levrbet-explained-onchain-betting (2024-06-05) [L, stale]
  - Press: https://ffnews.com/news/levr-bet-raises-3m-for-leveraged-sports-betting-on-monad-led-by-blockchain-capital-and-maven-11 ($3M seed, 2025-08) [M]; https://chainwire.org/2025/01/22/levr-bet-announces-multichain-launch-of-sports-betting-with-leverage-on-avalanche-monad-hyperliquid/ [M, stale]
- PayBox read-only calls: `discover_tokens` (mode=chains query "Monad"; search USDC on eip155:143), 2026-10-19 [H]; project note `docs/research/06-paybox-platform.md` for the chain catalog and proposal constraints.
