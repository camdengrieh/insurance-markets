# Outcome.xyz (venue spec for the aggregator / arbitrage scanner)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. "NOT FOUND (searched: ...)" means not documented where I looked. All reads were GET-only; nothing was signed, posted or paid.

## 0. Verdict

- **Kind:** front end plus HIP-4 market deployer on Hyperliquid. It is not a separate venue. Outcome does not run a matching engine, custody collateral or settle anything itself except as the HIP-4 deployer for its own markets (H, docs.outcome.xyz/outcome-and-hyperliquid, /outcome-architecture).
- **Still live (H):** DefiLlama shows $4.86M builder-attributed volume for the day ending 2026-10-17; the rewards API paid out at 2026-10-18T18:51Z; SDK 1.3.0 was released 2026-10-05; outcome.xyz and docs.outcome.xyz return 200.
- **Liquidity is shared, not independent.** Every Outcome order lands on the same HyperCore HIP-4 order books that app.hyperliquid.xyz and dozens of other builder codes use (H, docs.outcome.xyz/outcome-and-hyperliquid; DefiLlama lists many HIP-4 builders, H). One HIP-4 adapter covers all of them. A second adapter for Outcome would double count one book.
- **adapter_priority: skip** for "Outcome.xyz" as its own leg. Build one `hyperliquid-hip4` adapter instead (that is where the integration value is) and add Outcome as (a) a deployer/metadata filter, (b) a source of reward-programme signal. See section 12.

## 1. Kind and market model

- HIP-4 outcome contracts: "fully collateralized binary instruments that trade between 0 and 1", settle to 0 or 1 (or a fraction), no leverage, no liquidation (H, docs.outcome.xyz/outcome-architecture; hyperliquid.gitbook.io HIP-4 page).
- Order book (CLOB) on HyperCore, spot-like API. Not an AMM, not parimutuel (H).
- Tokenisation: each outcome has two side tokens, side 0 and side 1 (usually Yes/No or UP/DOWN; labelled binaries can use any names). Identity: `encoding = 10 * outcome + side`; coin `#<encoding>` (order books, mids, fills), token `+<encoding>` (spot balances), asset id `100_000_000 + encoding` (order wire). The outcome-level name `@<outcome>` is not tradeable (H, hyperliquid asset-ids page; docs.outcome.xyz/sdk/concepts/coin-naming).
- Yes and No books are merged: buying Yes at p is the same as selling No at 1-p (H, HIP-4 page). Yes+No mid should be about 1.
- Types (H, docs.outcome.xyz/market-types, /sdk/concepts/markets):
  - standalone binary (`defaultBinary`, `labelledBinary`), e.g. "BTC above 81587 at 2026-10-17 00:15 UTC?".
  - "question" = multi-outcome set, exactly one outcome resolves Yes, each outcome has its own Yes/No book, plus a protocol-created fallback outcome (named "Other" in the SDK). Linked by `mergeQuestion` and `negateOutcome`.
  - `priceBucket`: price ranges (`< P1`, `[P1,P2)`, `>= P2`) as a question.
  - `priceTouch` and a scalar class exist in the resolution docs (H, docs.outcome.xyz/resolution). Scalar sports template exists but is "not in use initially" (H).
- Recurring series: BTC/ETH/HYPE (and others) up/down or above/below, 15 minute and daily, auto-deployed by the protocol; one series per (type, underlying, period); each instance is a new outcome id with its own tokens (H, docs.outcome.xyz/recurring-markets). Outcome ids were already around 13,800 by 2026-10-17 (H, rewards API market ids like "O13788"), so id churn is high. Spec string in the outcome `description`, e.g. `class:priceBinary|underlying:BTC|expiry:20260503-0600|targetPrice:78213|period:1d` or `class:priceBucket|...|priceThresholds:81538,81783|period:15m` (H, docs.outcome.xyz/market-types).
- Price tick: at most 5 significant figures and at most 5 decimals (0.00001) (H, docs.outcome.xyz/sdk/guides/trading, SDK 1.3.0). Docs say prices range 0.001 cent to 99.999 cents (H, introduction).
- Min size: SDK enforces min notional of $1 on limit orders (H, same page); "exchange still enforces its own minimum". An older third-party note said $10 (L, Chainstack via earlier project note); treat as unresolved.
- Event markets are template based. Templates defined on Hyperliquid, Outcome fills inputs. Live templates (H, docs.outcome.xyz/real-world-events): `sportsContestWinner` (2-way), `sportsContestResult` (3-way with Draw), `sportsTournamentWinner` (outright, one outcome per listed participant plus "No winner" fallback), `policyRateDecision` (No change / Decrease / Increase), `sportsScalarMarket` (not in use). Price templates: `priceBinary`, `priceTouch`, `priceBucket`/scalar.
- Catalog caps: Outcome says max 100 live event markets at a time and 500 new per day, single contests deploy about 24h before start, props/tournaments weeks before (H, real-world-events). Prop/tournament markets list the top six prospects only.

## 2. Chains and collateral

- Execution and settlement: Hyperliquid L1, HyperCore (H).
- Deposit/withdraw chains: Outcome UI deposits USDC through Circle CCTP "from the chain your USDC is on" (chain list NOT FOUND on the docs page; searched docs.outcome.xyz/funding-your-account) and other assets through Across; withdraws USDC via CCTP, default destination Arbitrum, any EVM address (H, docs.outcome.xyz/funding-your-account, /withdrawing-funds). Hyperliquid's own FAQ: a wallet-connected account deposits USDC via Arbitrum only, deposits under 5 USDC are lost; email-wallet path supports Arbitrum, Base, Ethereum, Polygon via Across (H, hyperliquid.gitbook.io deposited-usdc FAQ).
- Collateral/quote token is **unresolved** across primary sources:
  - Outcome docs: "USDC is the settlement currency", tokens redeem at 1 USDC (H, outcome-and-hyperliquid, outcome-tokens-and-pricing). The intro diagram alt text says 1 USDH (H, introduction).
  - SDK: collateral token is USDH, a spot token on the USDH/USDC pair (@1338); `quoteToken` is an optional field on outcomes and the SDK defaults it to "USDH" when absent (H, SDK glossary, changelog 1.0.1-beta). The Outcome SDK includes buyUsdh/sellUsdh helpers and a USDH ramp.
  - DefiLlama's indexer reports outcome fees keyed USDC (H, fixtures).
  - Action: read `quoteToken` from `outcomeMeta` at runtime; do not hardcode.
- Account model: no Outcome account. Same wallet/balance as the rest of Hyperliquid, unified collateral with perps (H). Positions are spot balances (`spotClearinghouseState`, tokens `+<enc>`) (H, SDK glossary).
- Wallet types supported by the UI: self-custody EVM wallet or Privy social login (H, docs.outcome.xyz/wallets-and-accounts).

## 3. Read API

- **Official market-data API = Hyperliquid's** (Outcome has none of its own for books/trades): `POST https://api.hyperliquid.xyz/info` and `wss://api.hyperliquid.xyz/ws`; testnet `https://api-ui.hyperliquid-testnet.xyz/info` (H, Outcome SDK source client.ts lines 54-60; Hyperliquid docs). **Reads are POST**, which the ground rules forbid for this task, so I captured no live HyperCore response. Shapes below are from the Outcome SDK type definitions (M).
- Docs: Outcome SDK docs https://docs.outcome.xyz/sdk/introduction (index https://docs.outcome.xyz/llms.txt); Hyperliquid https://hyperliquid.gitbook.io/hyperliquid-docs (HIP-4 page, asset-ids, exchange-endpoint, rate limits, websocket subscriptions). The official Hyperliquid info-endpoint page does not document `outcomeMeta` or `settledOutcome` (searched the page, H negative); the SDK is the best spec (M).
- Key info requests (M, SDK client.ts):
  - `{"type":"outcomeMeta"}` returns `{outcomes:[{outcome, name, description, sideSpecs:[{name},{name}], quoteToken?}], questions:[{question, name, description, fallbackOutcome, namedOutcomes[], settledNamedOutcomes[]}]}`. Recurring/price outcomes carry the pipe-delimited spec in `description`. Deployers add a `metadata=category:...` routing tag to some values (H, SDK changelog 1.3.0).
  - `{"type":"outcomeTemplates"}` returns template registry for rendering names (M).
  - `{"type":"settledOutcome","outcome":N}` returns `{spec, settleFraction, details, question?}` or null (M). This is the resolution read.
  - `{"type":"l2Book","coin":"#5160"}` returns `{coin,time,levels:[bids,asks]}` with level `{px,sz,n}` (M).
  - `{"type":"recentTrades","coin":"#5160"}` returns `[{coin,side:"B"|"A",px,sz,time,hash,tid,users:[a,b]}]` (M). Trades expose both counterparty addresses.
  - `{"type":"allMids"}` returns map keyed by side coin (`#5160`) to mid string (H, coin-naming page).
  - `{"type":"candleSnapshot","req":{coin,interval,startTime,endTime}}`; `spotMetaAndAssetCtxs` gives 24h volume per side coin (H, SDK changelog "fetchSpotAssetCtxs"/sortBy volume).
  - Account reads: `spotClearinghouseState`, `userFills`, `frontendOpenOrders`, `userFees`, `approvedBuilders` (M).
- WebSocket: subscriptions `l2Book`, `trades`, `allMids`, `candle`, plus `outcomeMetaUpdates` (`outcomeCreated`, `outcomeSettled`, `questionUpdated`, `questionSettled`) for catalog changes (H, Hyperliquid websocket docs list `outcomeMetaUpdates`). Outcome's SDK subscribes only to side 0 for books/trades; subscribe to `#<10*o+1>` yourself for side 1 or use the merged-book identity.
- Limits (H, hyperliquid rate-limits page): per IP, aggregated REST weight 1200/min; `l2Book` and `allMids` weight 2, `userRole` 60, other documented info calls 20, plus extra weight per 20 items for `recentTrades`/`userFills`; max 10 WS connections, 30 new per minute, 1000 subscriptions, 2000 messages/min. Use WS for the scanner; a REST snapshot of N books costs 2N weight.
- No auth for reads.
- Outcome-owned public GET API (H, fetched): liquidity-rewards payouts at `https://pd-liquidity-rewards-payouts.outcome-e91.workers.dev` with `GET /v1/rewards` (programme totals), `/v1/rewards/periods?limit=N` (market name, epoch, awarded USDC, wallets), `/v1/rewards/leaderboard`, `/v1/rewards/{wallet}`. No auth, CORS open, 120 req/min/IP, 60s cache (H, SDK docs/OUTCOME-REWARDS.md). The `periods` rows are the only GET-readable list of live Outcome market names I found (market ids like `O13788`).
- Third-party GET sources for volume/OI (M): DefiLlama `https://api.llama.fi/summary/dexs/outcome.xyz-outcome` and `.../protocol/outcome.xyz-outcome`; DefiLlama's Hyperliquid data aggregator `https://hl-indexer.llama.rip` (llms.txt documents `/v2/data/volume/daily/:date`, `/v2/data/fees/daily/:date`, `/v2/data/builder/:addr/daily/:date`, `/v2/data/openInterest/outcome/daily/:ts`). Unauthenticated, no stated rate limit; fine for dashboards, not for trading.
- Hosted RPC providers may not serve outcome endpoints (L, Chainstack via earlier project note). Use the official host.

## 4. Trade path

- `POST https://api.hyperliquid.xyz/exchange` with signed actions (H). Outcome's SDK `@outcome.xyz/hip4` (npm, TypeScript, BUSL-1.1 licence, 8 stars, last push 2026-10-05) wraps it: `placeOrder`, `placeOrders` (batch), `cancelOrder`, `modify`, `scheduleCancel` (dead-man switch), plus conversions (H, github.com/Outcome-xyz/hip4, docs.outcome.xyz/sdk).
- Orders: asset id `100_000_000 + 10*outcome + side`; limit TIF `Gtc`, `Alo` (post only), `Ioc` (SDK "FAK"); market orders are `FrontendMarket` with extreme limit (0.99999 buy / 0.00001 sell); SDK rejects FOK and GTD (H, sdk/guides/trading). Open orders are auto-cancelled at resolution (H, resolution-and-settlement). Address rate limit: 1 request per 1 USDC traded after a 10,000 buffer (H).
- Auth/signing (H, docs.outcome.xyz/sdk/concepts/authentication):
  - L1 actions (orders, cancels, conversions, spot USDH orders): action msgpack-encoded, keccak-256 to a connection id, signed as EIP-712 `Agent` struct on the phantom `Exchange` domain with chainId 1337. Signed by the wallet itself or by an approved agent key.
  - User-signed EIP-712 (domain `HyperliquidSignTransaction`, `signatureChainId 0x66eee`): agent approval, usdClassTransfer, withdrawals, sends. Agent keys are rejected for these.
  - Agent flow: user signs one `approveAgent`; afterwards the agent key signs orders with no prompts. An unapproved agent gets `User or API Wallet 0x... does not exist.`. SDK warns to keep agent keys in memory only (H).
  - Builder code `0xab5dbc057628bc18523c4cdfc0e1e2ebdbecb704` is mandatory for the outcome.xyz front end and for liquidity rewards, not for direct API trading (H, docs.outcome.xyz/builder-codes, outcome-liquidity-rewards). Fee is currently 0.
- Native conversions (H, docs.outcome.xyz/sdk/guides/conversions; hyperliquid exchange-endpoint `userOutcome`): `splitOutcome` (X quote token to X Yes + X No), `mergeOutcome` (inverse, `amount:null` = max), `mergeQuestion` (X Yes of every outcome in a question incl. fallback to X quote), `negateOutcome` (X No of one outcome to X Yes of every other outcome). No book, no spread. These make intra-venue arbitrage mechanical: Yes+No bids above 1 or asks below 1 close via merge/split; a full Yes bundle across a question redeems at 1.

## 5. Can a PayBox wallet trade it?

**partial.**
- The address is a plain secp256k1 EVM address. Any PayBox EVM wallet address is a valid Hyperliquid account; no registration (H, outcome-and-hyperliquid: "no separate Outcome account").
- Funding is a normal on-chain transfer: USDC on Arbitrum to Hyperliquid's bridge (wallet path is Arbitrum only, minimum 5 USDC, H), or Outcome's CCTP/Across deposit UI/contracts from other chains (contract addresses NOT FOUND, so do not hand-build them). A PayBox transfer/transaction proposal can do the Arbitrum leg (M, depends on PayBox Arbitrum support, which the task statement lists).
- Withdraw: user-signed EIP-712 `withdraw3` or the Outcome CCTP flow, to any EVM address (H, withdrawing-funds). Needs a wallet signature.
- Trading is off-chain signed actions, not transactions. Via PayBox this means `request_wallet_sign` with a `typedData` intent per action (M; project notes in docs/research/06-paybox-platform.md say typedData has no chain/domain allowlist in the client code but behaviour for chainId 1337 and 0x66eee is untested). Per-action PayBox signing is too slow for a scanner and gives no value cap (`request_wallet_sign` has no `value_cents`, per the same notes).
- Practical pattern: one PayBox-signed `approveAgent`, then an agent key in the plugin's backend/relay signs orders. That puts a hot key outside PayBox. Blast radius is limited because agent keys cannot withdraw or send (H, authentication page), but a compromised agent can still lose the account's money through bad trades. A plugin cannot sign (project Phase 0 result), so the flow must be agent-orchestrated.
- Geo: front end blocks by IP (see 8); the API has no Outcome-side geo gate that I could find. Hyperliquid's own terms still apply (M).

## 6. Fees

- Official Hyperliquid fees page has an "Outcome tokens" section (H, hyperliquid.gitbook.io/hyperliquid-docs/trading/fees): outcome trading only charges fees when **closing or settling**, not when opening. Six cases: minting (no fee, no volume), normal trade where one side pays (both sides credited `fee_paying_px * sz` volume), normal trade where nobody pays, burning with both/only-taker paying, settlement. **No maker rebates**; would-be rebate earners pay zero maker fee.
- The older HIP-4 page sentence "Fees are currently zero for outcome markets for initial testing" (H, HIP-4 page, undated) is superseded by the fees page. Treat as stale.
- Outcome docs: "Hyperliquid's protocol-wide fee schedule", tiers by trailing 14-day volume, HYPE-staking discount, 4% referral discount on taker fees for first $25M if the Outcome referral code was activated (H, docs.outcome.xyz/fees, /trading-fee-discount).
- Outcome adds: builder-code fee (currently 0; DefiLlama shows $0.003 builder fees on $5.29M builder-attributed volume on 2026-10-18, H/M), a deployer fee scale for Outcome-deployed markets (value NOT FOUND; searched docs.outcome.xyz fees/architecture), and a **settlement fee deducted from payout, "shown in the market spec"** (amount NOT FOUND).
- Whether the outcome taker/maker rates equal the spot schedule is NOT FOUND (spot tier-0 is 0.070% taker / 0.040% maker on the fees page, H, but applicability to outcomes unverified). Read the real rates from `userFees` (POST, not done).
- Empirical effective rate (M, hl-indexer, UTC day 2026-10-18): network HIP-4 fees paid $3,604 on $3.13M price-weighted volume, about 0.115 percent of volume (opens are free so per closing trade is higher). Of that, $237 was builder fees.
- Bridging: CCTP network cost; roughly $0.20 to Arbitrum, more to Ethereum; HyperEVM gas a fraction of a cent; Across fee varies (H, withdrawing-funds, funding-your-account).

## 7. Resolution and dispute risk

- Price markets (H, docs.outcome.xyz/resolution, /resolution-and-settlement, /market-types): settle against the HyperCore perp **mark price** of the underlying. Description conflicts inside the docs: /resolution says an "X second TWAP" (touch: rolling 1s TWAP; "Beta"), while /market-types and /resolution-and-settlement say linear interpolation of mark price between the updates before and after the settlement timestamp. Hyperliquid's contract specs also say interpolation. Pin down per series before pricing cross-venue basis.
- Underlyings include HIP-3 `xyz:` perps (oil `xyz:CL`, `xyz:GOLD`, `xyz:SILVER`, S&P) seen in reward periods (H, rewards API), so those resolve on those perp mark prices.
- Event markets (sports, macro, cultural): resolved by Outcome for Outcome-deployed markets using "a proprietary resolution system, developed with established oracle and resolution partners" (partners not named, "to be shared"), against the official source named in the template; target within 4 hours of official settlement, "Beta", aiming for seconds (H). Validator-deployed markets are resolved by the validator set (H).
- Dispute mechanism: none on-chain. "No separate settlement layer, no dispute token, and no claims process"; later appeals, corrections or reversals do not change a resolved outcome (H). The only backstop is the **500,000 HYPE bond** that validators can slash for a badly defined or wrongly settled market and that cannot be withdrawn until all markets settle (H). A secondary source put it near $42M at the Aug 29 announcement (M).
- Edge cases that differ from other venues (H, template text): `sportsContestWinner` pays **0.5 to both sides** on a draw, no contest or unresolved result; the "Counted Play" excludes extra time, overtime, shoot-outs, tie-breaks; `sportsTournamentWinner` resolves a participant No as soon as winning is impossible; `policyRateDecision` compares to the value in effect immediately before and ignores unscheduled moves. Map each against the paired venue's rules before treating two markets as the same event.
- Settled outcomes disappear from `outcomeMeta`; read `settledOutcome` for the result (M). Settlement is automatic, no claim step, open orders cancelled at resolution (H).

## 8. Geo, ToS, automation

- docs.outcome.xyz/risks (H): "Outcome is not available in some jurisdictions, including (but not limited to) the United States, certain Canadian provinces, and territories subject to international sanctions"; Hyperliquid's terms also apply. Third-party summary says Hyperliquid's terms exclude the US, Ontario and sanctioned places (L).
- The outcome.xyz front end sets a server-side geo cookie (`x-geo-state`), i.e. IP based gating on the site (H, response header).
- Outcome Terms of Service: **NOT READ.** https://outcome.xyz/terms returns HTTP 403 (Cloudflare challenge) to WebFetch and curl; I did not attempt to bypass it. Automation, bot, arbitrage and market-making clauses: NOT FOUND (searched: docs.outcome.xyz pages, web search). Trading on the front end requires a one-time ToS signature (H, wallets-and-accounts).
- Programmatic trading is plainly supported by the vendor: an official SDK with agent keys, batch orders and a dead-man switch, and a liquidity-rewards programme that pays market makers (H). That is the strongest evidence available; it is not a ToS permission.

## 9. Liquidity (dated)

- DefiLlama "Outcome.xyz Outcome" (Interface, builder-code attributed, data through 2026-10-17, fetched 2026-10-19, H): 24h $4.86M, 7d $26.24M, 30d $74.15M, all-time $148.12M since 2026-05-02. Builder volume is two-sided (each fill tagged either side counts), so it overstates single-counted volume (H, indexer docs).
- Network single-counted HIP-4 (hl-indexer, UTC day 2026-10-18, M): $3.13M price-weighted volume, $8.49M notional (shares at $1). Outcome's builder code accounted for $5.29M two-sided volume that day, so most flow goes through Outcome (85% to 92% share quoted by secondary sources, M).
- DefiLlama "Hyperliquid Outcomes" line, from the project's earlier fixture: 24h $2.85M, 7d $18.5M, 30d $45.1M (H, 2026-10-18).
- Open interest, network-wide (hl-indexer, M): $6.96M at end of 2026-10-18, $6.33M at end of 2026-10-17. Outcome-only OI for today: NOT FOUND. Older third-party dashboard (Loris, listed as 44 days old, L): Outcome about $4.41M of $7.12M network.
- TVL: none (DefiLlama TVL series empty, H).
- Depth/spread on live books: NOT MEASURED (reads are POST). Outcome's own risk page warns spreads are wide in less active markets and thin out near resolution (H).
- Volume quality: Outcome ran a $1M rebate campaign (about 1 cent per $ traded) per secondary reporting (M), and its liquidity-rewards programme paid $394.5K to 3,661 wallets over 2,520 reward periods, $10.1K in the last 24h (H, rewards API 2026-10-19). Reward periods in a 100-row sample averaged about $114 awarded per market-epoch, with the largest two at about $200. Expect incentive-driven quoting near the mid and some farming volume; depth may shrink if rewards stop. An Arrakis analysis ("Two Weeks of HIP-4") exists but I could not read it (L).
- Growth context: HIP-4 mainnet live 2026-05-02; permissionless third-party deployment opened 2026-08-29 and Outcome was the first builder (M, crypto.news 2026-09-03; Outcome docs confirm the 500K HYPE stake, H).

## 10. Event coverage and arbitrage overlap

Seen first-hand in 100 recent reward periods (H, rewards API, 2026-10-19) and the home page categories (Sports, Crypto, Esports, Economics, Finance):
- Crypto price: BTC, ETH, HYPE "above X at time T", "touches X by date", 15 minute and daily up/down, bucket ranges. Overlaps Polymarket, Kalshi, Limitless, Predict.fun crypto-price markets. Oracle basis risk is high: HyperCore mark price versus Chainlink, CF Benchmarks or exchange prints.
- TradFi/commodities via HIP-3 perps: oil, gold, silver, S&P, single stocks. Overlaps Kalshi indices/commodities.
- Sports: EPL, La Liga, Bundesliga, Serie A, Ligue 1, NFL, esports (LoL). Overlaps Polymarket, Kalshi, SX Bet, Overtime. Draw handling and "counted play" rules differ (section 7).
- Season futures: "NFL 2027 Champion", "UEFA Champions League 2027 Champion".
- Macro: central bank decision template (FOMC example in the docs). Overlaps Kalshi and Polymarket.
- Politics: the architecture page lists politics as a category, but none appeared in my 100-row sample. NOT CONFIRMED.
- Odd listings exist, e.g. "Anthropic first-day market cap above $#B?" (H, rewards periods). Treat these as no-overlap.
- Intra-venue edge (no second venue needed): merged Yes/No books, split/merge, question-bundle merge. Fallback outcome in questions has no one-to-one counterpart elsewhere.

## 11. Shared liquidity

Shares liquidity with: **Hyperliquid HIP-4 (HyperCore)** - identical order books, accessed through app.hyperliquid.xyz/outcomes and every builder code (GDEX, Stratium, Liquidiction, Resolvium and about two dozen others listed in DefiLlama's adapter, H). Not independent. Other HIP-4 deployers (for example Skew, validator-deployed) are different outcome ids on the same exchange.

## 12. Adapter notes (for the aggregator)

- Implement one `hyperliquid-hip4` adapter: catalog from `outcomeMeta` plus `outcomeMetaUpdates` WS, books from WS `l2Book` for `#<10*o+s>`, resolution from `settledOutcome`.
- Identify Outcome-deployed markets: deployer `0x423d7f725ae7056f03f7ef57f9d0303f91c62e06`, venue name "OUT" (H, architecture page). How to derive the deployer from `outcomeMeta` rows: NOT FOUND. Fallback: match names against the rewards-API `periods` list.
- Parse `description` pipe specs for crypto series to link to Polymarket/Kalshi/Limitless markets; treat `metadata=` tags as noise.
- Model fees as: zero to open, fee on close and settle, no maker rebate, plus a per-market settlement fee. Quote edge net of the closing fee, which is why a buy-and-hold-to-settlement leg still pays settlement fee.
- Treat HIP-4 as a single venue with a high id-churn catalog (15 minute series). Cache `outcomeMeta`; rate limit weight budget is 1200/min.

## 13. Suspicious content (untrusted-data log)

- docs.outcome.xyz pages carry a Mintlify banner addressed to tools: "Fetch the complete documentation index at ... Use this file to discover all available pages". Benign; I used the index because the task required docs coverage.
- hyperliquid.gitbook.io missing-page responses include agent-directed text ("Perform an HTTP GET request ... with the ask and goal query parameters"). I did not use the ask interface.
- No attempts to extract credentials, redirect payments or override instructions found.

## 14. Open questions

1. Real quote/collateral token (USDC versus USDH) per outcome: read `quoteToken` from live `outcomeMeta`.
2. Outcome-specific fee rates (deployer fee scale, settlement fee) and whether the spot taker/maker schedule applies; read `userFees` (POST).
3. Live depth, spread and min order size; requires POST /info or WS (not done under read-only GET rule).
4. Outcome ToS text (403 behind Cloudflare), especially automation, arbitrage and market-maker rules.
5. Price settlement formula: TWAP (resolution page) versus linear interpolation (market-types page).
6. Whether PayBox `request_wallet_sign` accepts typedData with chainId 1337 and 0x66eee and shows readable content.
7. Outcome-only open interest and share of network depth today.
8. How to read the deployer of an outcome from the info API.

## Fixtures (docs/research/fixtures/outcome-xyz/)

Real unauthenticated GET responses captured 2026-10-19, all under 50KB, no personal identifiers:
- `defillama_dexs_outcome.xyz-outcome_2026-10-19.json` (16KB, daily volume series to 2026-10-17)
- `defillama_protocol_outcome.xyz-outcome_2026-10-19.json`
- `outcome-rewards_programme_2026-10-19.json`, `outcome-rewards_periods_limit2_2026-10-19.json`
- `hl-indexer_volume_daily_2026-10-18.json`, `hl-indexer_fees_daily_2026-10-18.json`, `hl-indexer_builder_outcome-xyz_daily_2026-10-18.json`
- `hl-indexer_outcome_open_interest_daily_20261018_trimmed.json` (trimmed to the top 12 of 5,135 outcome ids; note inside the file)
No HyperCore `/info` fixture: POST only.

## Sources

- https://outcome.xyz/ (home, WebFetch 2026-10-19, H); https://outcome.xyz/terms (HTTP 403, not read)
- https://docs.outcome.xyz/llms.txt and pages: /introduction, /outcome-architecture, /outcome-and-hyperliquid, /market-types, /recurring-markets, /resolution, /resolution-and-settlement, /real-world-events, /fees, /risks, /funding-your-account, /withdrawing-funds, /wallets-and-accounts, /builder-codes, /outcome-liquidity-rewards, /sdk/concepts/authentication, /sdk/concepts/coin-naming, /sdk/reference/market-data-adapter, /sdk/guides/trading, /sdk/guides/conversions, /sdk/guides/real-time-data, /sdk/changelog (H, fetched 2026-10-19)
- https://github.com/Outcome-xyz/hip4 (README, src/adapter/hyperliquid/client.ts, types.ts, src/outcome-rewards/config.ts, docs/OUTCOME-REWARDS.md, docs/GLOSSARY.md; read with gh api, H for code facts, M for inferred wire shapes)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H, undated), /for-developers/api/asset-ids, /for-developers/api/rate-limits-and-user-limits, /for-developers/api/websocket/subscriptions, /for-developers/api/exchange-endpoint, /trading/fees, /trading/contract-specifications, /support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc (H)
- https://api.llama.fi/protocol/outcome.xyz-outcome, https://api.llama.fi/summary/dexs/outcome.xyz-outcome, https://api.llama.fi/summary/fees/outcome.xyz-outcome (H); https://github.com/DefiLlama/dimension-adapters (factory/hyperliquid.ts, helpers/hyperliquid-v2.ts, H for attribution method)
- https://hl-indexer.llama.rip/llms.txt and /v2/data/... endpoints (M, third-party)
- https://pd-liquidity-rewards-payouts.outcome-e91.workers.dev/v1/rewards (H, Outcome's public API)
- https://crypto.news/hyperliquid-hip-4-volume-triples-after-open-rollout/ (2026-09-03, M); web search summaries mentioning Loris Tools HIP-4 dashboard, Data Wallet, Arrakis (L, snippets only)
- Project notes: docs/research/06-paybox-platform.md, docs/research/09-venues-onchain-clob.md section 2.6, docs/research/fixtures/defillama/ (H for what they say, as prior research)
