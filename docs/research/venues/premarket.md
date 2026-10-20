# Premarket (premarket.xyz) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public docs, public GitHub files via `gh api`, the public JS bundle of the web app read as text only (never executed), and unauthenticated GETs. No accounts, wallets, keys, signing, POST/PUT/DELETE, browser automation or money-moving PayBox tools. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. The PayBox `discover_tokens` (chain catalog) call is read-only metadata.

Confidence tags: **H** read first-hand in a primary source this session, **M** secondary or inferred, **L** weak or stale.

## 1. Verdict

- **Still live? Technically yes, economically dormant.** Web app, API, docs and SDK repo all respond today (H). The native order books are empty and the last trade was 2026-09-01 (H). **Adapter priority: skip.**
- **What it really is (H):** two unrelated things behind one front end.
  1. **Native Premarket markets on MegaETH (chain 4326):** weekly crypto-price "spread" options (BTC, ETH, HYPE, ZEC, MEGA vs USD; LONG/SHORT tokens splitting $1) plus one perpetual RWA/spot group (Fullerene carbon samples priced in USDM). Orders are EIP-712 signed off-chain, matched by a backend, and filled on-chain. These are **not event markets**. As of 2026-10-19: 6 market groups, 114 instruments, **0 with a bid or ask, 0 active orders in any of the 8 market ids, `totalCollateral` 0 on every instrument**.
  2. **A Solana "Prediction Markets" / "Yield Farm" tab that is a front end onto Kalshi via DFlow.** The docs say so plainly: "powered by DFlow, which tokenizes Kalshi markets on Solana. Premarket provides the trading interface, while market rules, resolution, and redemption follow the underlying DFlow/Kalshi market infrastructure." A live call through the app's proxy returned Kalshi events (`KXPRESNOMD-28`, `KXSB-27`). **Shared liquidity with Kalshi: not an independent arbitrage leg.**
- Net: the part with real event overlap (Kalshi) is duplicate liquidity and is already covered by the Kalshi workflow; the part that is independent (native MegaETH) has no liquidity, no event categories and no PayBox-reachable funding path.
- Revisit trigger (cheap): poll `GET https://api.premarket.xyz/premarket/api/markets` weekly and flag any instrument with a non-null `bestBid`/`bestAsk` or non-zero `totalCollateral`.
- Name collisions to avoid: `premarket.me` ("Prediction Markets Aggregator") and Hyperliquid/Polymarket "pre-market" FDV products are unrelated (M, search results).

## 2. Is it still live? (evidence, all 2026-10-19 unless noted)

| Check | Result | Tag |
|---|---|---|
| `https://premarket.xyz/` (Framer marketing site) | HTTP 200, `last-modified` 2026-08-21. Copy is stale/inconsistent: pitches "options on assets before they launch", FDV bands, "PRM tokens", has no chain/fees/docs links beyond app and docs. Its own example numbers contradict each other. | H |
| `https://app.premarket.xyz/` (React SPA, Vercel) | HTTP 200, `last-modified` 2026-10-17 03:50 GMT. Title "Premarket - Where markets are born". Footer: Portfolio "Soon". | H |
| `https://docs.premarket.xyz/` (GitBook) | HTTP 200. Changelog has a single entry: "May 2026 Initial Launch ... live across MegaETH and Solana ... Market maker and arbitrage bots live for initial liquidity". "Developer Docs: Coming Soon." | H |
| `https://api.premarket.xyz/premarket/api/markets` | HTTP 200, 75,865 bytes, `{success:true,data:{markets:[...6],total:6}}` | H |
| Order books | `GET /orderbook/api/orders?marketId=<id>` returned `{"orders":[],"count":0}` for ids 6,7,8,9,35,36,37,38,39 | H |
| Latest trade across all 6 groups | 2026-09-01 02:29:12 UTC (market 35). Fullerene last trade 2026-08-13; HYPE spreads 2026-08-27 | H |
| DefiLlama volume | `total24h` 0, `total7d` 0, `total30d` 0, all-time 15,943 USD, last non-zero day 2026-09-01 | H |
| `robinhood.premarket.xyz` (covered options, documented) | **NXDOMAIN** via 1.1.1.1 and local resolver. The documented covered-options UI has no DNS record. | H |
| GitHub `stryke-xyz/premarket-sdk` | not archived, last push 2026-09-10 | H |
| Operator | "Premarket by Stryke" (X: `@premarket_xyz`, account created Oct 2025, linked to `@stryke_xyz`); the Framer page footer and the SDK GitHub org are Stryke | M |

DefiLlama lists it as category "Prediction Market", `listedAt` 2026-04-21, TVL methodology "collateral and delivery token balances held by the Premarket OptionMarketVault" (H, https://api.llama.fi/protocol/premarket). Caveat: the TVL adapter points at an older vault/registry (see 4.4), so its history is not trustworthy as a measure; the live API's `totalCollateral` = 0 corroborates TVL ~ 0 now.

## 3. Market model (H unless noted)

### 3.1 Native MegaETH spread markets (`specification: OPTIONS`, `marketType: ERC20xERC6909`)
- **Instrument:** each spread (`lower`,`upper` strike) is an independent instrument with its own book, e.g. `BTCUSD-23OCT26-87000-88000-C`. Two ERC-6909 token ids per spread: `prmTokenId` (LONG) and `oPrmTokenId = prmTokenId + 1` (SHORT), minted as a pair from USDM collateral and held in `OptionMarketVault`.
- **Payoff:** "At settlement, LONG and SHORT always split a combined value of $1." Above upper strike LONG = $1; below lower strike SHORT = $1; inside the band payoff is linear. So it is a **bounded linear (call-spread-like) payoff, not binary**; a band-crossing probability needs a model, not a price read-off.
- **Matching:** one book per instrument; docs describe "mint match" (LONG buy meets SHORT buy) and "merge match" (both sells), done by the platform.
- **Live groups today (API):** BTC/USD (id 35), ETH/USD (36), MEGA/USD (37), ZEC/USD (38), HYPE/USD (39), each with 22 instruments, all expiring `1792742400` = 2026-10-23 08:00 UTC. The docs list BTC, ETH, HYPE and ZEC; the API also has MEGA (docs behind the API, M).
- **Pre-TGE / Pre-IPO:** docs state "No Pre IPO markets are currently live" and the same for Pre TGE (H). These categories are the only ones that would have been unique event-like markets.

### 3.2 RWA / spot (`specification: RWA`, `marketType: ERC20xERC20`)
- Group "Fullerene": four instruments (C70 99.9% 1g, C70 98% 1g, C60 99.9% 1g, C60 99.5% 1g) traded directly against USDM, perpetual, no settlement. One `lastPrice` (32 USDM) from 2026-08-13; no bid/ask. Not relevant to event arbitrage.

### 3.3 Covered options (Robinhood Chain 4663)
- Documented as covered calls/cash-secured puts on tokenised stocks (AAPL, AMZN, TSLA, NVDA, ...) priced in USDG at `robinhood.premarket.xyz`, which does not resolve (see section 2). Not event markets either way. Ignore.

### 3.4 Prediction Markets / Yield Farm (Solana, via DFlow)
- Binary YES/NO outcome tokens of Kalshi markets, USDC, redeemed manually through DFlow after settlement. Yield Farm is "a curated view" filtering legs priced below $1. Not a separate market set. Rules shown are Kalshi's.

## 4. Chains, collateral, contracts

### 4.1 Chains and collateral (H, docs "Wallet and Funds")
| Network | Markets | Asset |
|---|---|---|
| MegaETH (4326) | spreads, RWA, (pre-IPO/TGE: none live) | USDM (18 dec, `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7`) |
| Solana | Kalshi-via-DFlow prediction markets, Yield Farm | USDC |
| Robinhood Chain (4663) | covered options (UI unreachable) | USDG + underlying |

USDT0 on MegaETH is also in the SDK config (`0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb`). The SDK's `USDC` entry on MegaETH is labelled "Mock USD Coin" (H, SDK config), so do not assume real USDC exists on the chain.

### 4.2 Accounts
- Users trade from an ERC-4337 **smart account** (SimpleAccount-compatible, ERC-1271 signatures) created through Privy social login; a delegated "subkey" gives gas sponsorship and 1-click trading; the subkey private key can be exported (H, docs). Orders may also be signed by a plain EOA (`SignatureType.EIP712`).

### 4.3 Contracts on MegaETH (public venue contracts; H from `stryke-xyz/premarket-sdk` `src/config/index.ts`, pushed 2026-09-10)
- Exchange `0xa3108eAE9C1A0E27b947D540E85cF1dF1484d659`, MarketsRegistry `0x61fD7E09bc31407eD2093708C68CBcA31d2c46bC`, OptionMarketVault `0xd5d4d9d6881F51B3a745Eead7877fEDdE9fde285`, CommunityMarketManager `0xb350A87e86b637bf79229240bc2AdFB015AdBD67`, SimpleAccountFactory `0xC6DcC1AaD015530C4Eb967B2eB45d852427A8E00`, EntryPoint `0x09635F643e140090A9A8Dcd712eD6285858ceBef`.
- The API's trade rows use the same vault (`makerAsset` = `0xd5d4d9d6...`) and DefiLlama's volume adapter uses the same Exchange/Registry (H). `CommunityMarketManager` hints at permissionless/community markets, but every market in the API has `creator` = zero address (H); nothing community-created is listed.

### 4.4 Address drift (matters for any on-chain indexer)
- DefiLlama's TVL adapter uses OptionMarketVault `0xD4Aa38D6Ee04A401Cd7067A66201f680CbD1E7E4` and MarketsRegistry `0x1c5FFbaEBa3Ef9fB6C650a4FF364918Bce418675` (older deployment). The SDK's own docs example shows Exchange `0xCf24f40D2dd88084e9C28FE34Ba9E24AFDACb7C2`. The FAQ says "After an exchange upgrade, cancel any stale order". So contracts have been redeployed at least twice since April 2026 (H on the divergence, M on the interpretation). Pin addresses from the live API/SDK, not from old docs.
- `stryke-xyz/premarket-contracts` (created 2026-08-13) is a 7 KB stub; no Solidity source is public. NOT FOUND: any audit report (DefiLlama `audits: "0"`; searched: docs, repo, DefiLlama).

## 5. Read API (undocumented but first-party and unauthenticated)

- **Docs:** none. Developer Docs page says "Coming Soon" (H, https://docs.premarket.xyz/readme/developer-docs.md). The only API description is the official SDK README (https://github.com/stryke-xyz/premarket-sdk, `README.md`, `docs/orderbook-integration.md`, `src/api/orderbook-api/index.ts`) and the web app's own bundle. Treat endpoints as unstable.
- **Base URL:** `https://api.premarket.xyz` (H: SDK, app CSP, bundle). The SPA reaches it through a same-origin proxy at `https://app.premarket.xyz/api/premarket-proxy/...`. Cloudflare in front of a Railway origin; `access-control-allow-origin: *`.
- **Auth/limits:** reads need no key (H). No rate-limit headers returned; numeric limits NOT FOUND (searched: docs, SDK README, response headers). Write endpoints need a bearer token from an EIP-712 login challenge.

| Purpose | Endpoint | Status |
|---|---|---|
| Market catalog | `GET /premarket/api/markets` | 200, tested. One response (~76 KB), no pagination seen. Per group: `id`, `groupId`, `type` (`erc6909`/`erc20`), `specification` (`OPTIONS`/`RWA`), `collateralToken`, `collateralDecimals`, `marketType`, `instruments[]` |
| Instrument fields | in the above | `id` (`<marketId>-<prmTokenId>`), `name`, `tick`/`lower`/`upper` (18-dec strings), `isCall`, `isSpread`, `spreadType`, `prmTokenId`, `oPrmTokenId`, `expiry` (unix s), `lastPrice`, `bestBid`, `bestAsk`, `totalCollateral`, `totalPrmSupply`, `totalOprmSupply`, `hasFinalTick` |
| One market | `GET /premarket/api/markets/{id}` | 200, tested (15 KB for id 35) |
| Trades | `GET /premarket/api/markets/{id}/trades?limit=N` | 200, tested; server returns at most 100 rows. Row: `orderHash`, `maker`, `taker`, `makerAsset`, `takerAsset`, `makingAmount`, `takingAmount`, `tradeType`, `optionTokenId`, `makerFee`, `takerFee`, `transactionHash`, `blockNumber`, `timestamp`, `isAsk` |
| Active orders (book proxy) | `GET /orderbook/api/orders?marketId=<id>[&maker=0x..]` | 200, tested; empty everywhere. Needs `marketId` |
| Order by hash | `GET /orderbook/api/orders/{orderHash}` | from SDK, not called |
| User data | `GET /premarket/api/users/{addr}/positions`, `/history`, `/pnl`, `/trading` | from SDK, not called |
| Auth | `POST /auth/challenge`, `POST /auth/verify` | from SDK; not called (POST) |
| Realtime | `wss://sync-worker-main.up.railway.app` | URL from the app bundle; SDK `MarketDepthSyncClient` (snapshots + deltas with `seq`) and `ActivitySyncClient`. Message schema and rate limits NOT FOUND; did not connect |

- **Gotchas for an adapter:** (a) amounts are 18-decimal integer strings (USDM), prices are derived from `takingAmount/makingAmount`; (b) `bestBid`/`bestAsk` are null while books are empty; (c) in all 264 sampled trade rows (6 groups) `maker == taker` and only 5 distinct addresses appear, so the printed volume is self-fills or operator-mediated fills, not independent flow (M; the API may log the matcher as taker).
- **Fixtures** saved in `docs/research/fixtures/premarket/` (all 2026-10-19): `markets_list_sample.json` (2 of 6 groups, first 3 instruments each; full body is 75,865 bytes), `trades_sample_btc_spreads.json`, `trades_sample_fullerene.json` (4 rows each), `orders_empty_sample.json`, `dflow_proxy_events_sample.json` (Kalshi events seen through Premarket's proxy), `defillama_dexs_premarket.json`.

## 6. Trade path (H from SDK; nothing executed)

**Native MegaETH:**
1. Build `ExchangeOrder {salt, nonce, marketId, makingAmount, takingAmount, deadline, maker, receiver, tradeType (BUY=0/SELL=1), signatureType (EIP712=0 / ERC1271=1), tokenId}`.
2. Sign EIP-712 typed data: domain name `"Exchange"`, version `"1"`, `chainId` 4326, `verifyingContract` = Exchange address. EOA signs directly; smart accounts return ERC-1271 bytes (raw `r||s||v` of the owner for SimpleAccount).
3. `POST /orderbook/api/orders` with `{marketId, order, signature, timeInForce: "GTC", postOnly}` and a bearer token; backend returns the match outcome within about 2 s or "awaiting match".
4. Anyone can also settle crossing orders on-chain (`fillOrder`/`matchOrder` on the Exchange, `cancelOrder`, `incrementNonce`). Cancels can be done on-chain "if you prefer to interact onchain" (docs).
5. Funding/withdrawal: approve and deposit USDM (or USDT0) into the vault from a MegaETH wallet; one-time operator approval needed for covered options.

**Solana prediction markets:** gov-ID + face KYC via DFlow Proof, then Buy Yes/No through DFlow quotes; manual redemption via DFlow after settlement. Any programmatic access should go to Kalshi directly (or DFlow's own API), not through Premarket.

## 7. PayBox reachability: no

- MegaETH (4326) is **absent from PayBox's chain catalog**: `discover_tokens mode=chains` returned 11 networks (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB Smart Chain, Avalanche, Robinhood 4663, Arc, Hyperliquid) and a `megaeth` query returned 0 (H, 2026-10-19; the tool says the catalog is "not a support allowlist", so absence is strong evidence but not proof). A PayBox EVM wallet therefore cannot propose the approve/deposit/withdraw transactions on 4326 or pay MegaETH gas.
- Signing alone would be possible in principle (EIP-712 order and the auth challenge are typed data; `request_wallet_sign` documents no chain restriction per `docs/research/06-paybox-platform.md`, M), but the signed orders would have no funded vault balance behind them.
- The Solana prediction path is reachable chain-wise but is a Kalshi duplicate, KYC-gated, and geo-blocked (section 9).
- Robinhood Chain (4663) is in PayBox's catalog, but the covered-options UI does not resolve.

## 8. Fees

- **Native (H, docs Trading FAQ):** maker/taker schedule: Pre-TGE/IPO 0.05%/0.10%; MegaETH spreads 0.15%/0.40%; RWA 0.20%/0.30%; "Fees in the table are 0% at launch in the main app." Observed `makerFee` = `takerFee` = "0" on all 264 sampled trades (H). Vault market config carries `depositFeeBps`, `redeemFeeBps`, `makerFeeBps`, `takerFeeBps`, `rolloverFeeBps` (H, `MarketAdded` event ABI in the DefiLlama adapter). Maker fee is paid by the order placer, taker fee by the matcher (docs). Gas is sponsored through the smart-account paymaster (docs, M on mechanism).
- **Prediction Markets / Yield Farm:** "To be confirmed" (H). Real cost = Kalshi's fee schedule plus any DFlow platform fee, not documented by Premarket (NOT FOUND).
- No withdrawal fee documented (NOT FOUND, searched: Wallet and Funds, FAQs).

## 9. Resolution and dispute risk

- **Native spreads:** cash-settled at expiry from "oracle + TWAP" over approved CEX/DEX/oracle sources; exact sources are in each market's Rules tab, not in the API payload (H, docs Settlement FAQ). Settlement "typically completes within minutes" (docs). The Exchange has a **resolver whitelist** controlled by an admin (SDK admin surface `setResolverWhitelist`), so resolution is centrally permissioned (H on existence, M on implications). **No dispute process documented** (NOT FOUND, searched: docs settlement pages, glossary). Cancellation risk is explicit: invalid setup, oracle failure, event changed, manipulation. Cancelled markets settle "50/50 or another neutral value" and the book is cleared. Unaudited (see 4.4).
- **Prediction markets:** Kalshi's rules and resolution; claims redeemed via DFlow. Premarket is "not party to the contract" (in-app risk disclosure).

## 10. Geo, ToS, automation

- **Prediction Markets/Yield Farm blocked** in the United States and about 50 other jurisdictions (docs Country Restrictions; includes UK, France, Italy, Poland, Belgium, Switzerland, Singapore, Thailand, Taiwan, Canada, Australia, Russia, China, UAE, Ukraine ...). Detection is IP geolocation plus a Cloudflare worker (`premarket-geoblock...workers.dev` returns `blocked`/`country`); "Using a VPN or other workaround ... may violate the Premarket terms of service." Native spreads/RWA: no country list published; "Pre IPO, Pre TGE, MegaETH price spreads, and RWA/Spot Markets remain accessible under the policy documented here" (H).
- **KYC:** government ID + face check for the Kalshi/DFlow tab only (DFlow Proof); none for native or covered options.
- **Automation:** the in-app Terms/Privacy/Risk text (embedded in the SPA bundle) is generic: "non-custodial frontend", user is "solely responsible for your wallet, signing keys, transactions". No bot or API clause found (NOT FOUND, searched: in-app ToS, docs, FAQ). The changelog itself says "Market maker and arbitrage bots live for initial liquidity", and the SDK is published for integrators, so programmatic trading is anticipated, but there is no written permission for the undocumented API.
- Third-party data note: the in-app ToS says markets "sourced through verified providers" are routed through that provider's APIs under its own policies.

## 11. Liquidity (all H)

| Metric | Value | Source / date |
|---|---|---|
| TVL (DefiLlama) | 0 USD; peak 442 USD on 2026-05-15; zero since 2026-05-20 (old vault, see 4.4) | api.llama.fi/protocol/premarket, 2026-10-19 |
| `totalCollateral` across 114 spread instruments + 4 RWA | 0 | API, 2026-10-19 |
| Volume 24h / 7d / 30d | 0 / 0 / 0 | api.llama.fi/summary/dexs/premarket, 2026-10-19 |
| Volume all-time | 15,943 USD (Apr-Sep 2026; busiest days 2026-08-03 at 2,921 and 2026-08-28 at 1,725) | same |
| Fees all-time | 0 | api.llama.fi/summary/fees/premarket |
| Open interest | not reported | NOT FOUND |

The Kalshi event volumes visible through Premarket's proxy (for example `KXPRESNOMD-28` volume 241,823,484) are Kalshi-wide, not Premarket's.

## 12. Event overlap and shared liquidity

- **Native:** crypto-price only (BTC, ETH, HYPE, ZEC, MEGA; weekly bands). Conceptually overlaps Polymarket/Kalshi crypto-price ladders, but the payoff is linear inside a band, not binary, and there are no quotes. No sports, politics or macro.
- **Solana tab:** the whole Kalshi catalog (politics, sports, economics, crypto) with Kalshi's prices. **Liquidity is Kalshi's (and DFlow's routing); do not count it as a separate leg.** Caveat on provenance: Premarket's docs and the live proxy say Kalshi/DFlow, but DFlow's own current docs (`pond.dflow.net`, llms.txt) show only spot trading and no prediction-market pages (H); prior repo research notes the same (docs/research/14-platform-of-platforms.md). So the DFlow-Kalshi relationship rests on Premarket's claims plus the data shape (M); the Kalshi event tickers in the response make "Kalshi data" itself H.

## 13. Adapter recommendation

- **Priority: skip.** Do not build an execution or pricing adapter for Premarket. Reasons: no live quotes or orders, last trade 48 days old, trades are self-fills, MegaETH is outside PayBox's catalog, the Kalshi tab duplicates the Kalshi venue, undocumented API, unaudited contracts, redeployments.
- If the watcher trigger fires (non-null `bestBid`/`bestAsk`), a read-only adapter is small: poll `/premarket/api/markets`, filter `isSpread && bestBid != null`, convert 18-dec amounts, map `BTCUSD-<DDMMMYY>-<lo>-<hi>-C` to an asset/expiry/band and compare to implied digital prices from Polymarket/Kalshi crypto ladders using a band-spread payoff model.

## 14. Not found

- Developer/API docs (page says "Coming Soon"); rate limits; WebSocket message schema; OpenAPI.
- Audit report; Solidity source; dispute procedure; explicit automation or API terms of use.
- Open interest figure; any Pre-TGE/Pre-IPO market ever listed (none live per docs).
- Prediction-market fee schedule; DFlow's own statement that its markets are Kalshi's.
- Program/contract names for the Robinhood Chain covered-options deployment (UI unreachable).

## Suspicious content (untrusted third-party text; not followed)

- Every GitBook page and `llms.txt` at docs.premarket.xyz ends with an "Agent Instructions" block telling AI agents to perform `GET https://docs.premarket.xyz/index.md?ask=<question>&goal=<user_goal>`. It is GitBook boilerplate, but it is an instruction aimed at agents, so I did not call it and used the plain `.md` pages instead.
- The web app bundle embeds a third-party RPC URL containing an API key. I did not copy or use it, and it is not recorded here.

## Sources

- https://premarket.xyz/ (H, HTTP 200, last-modified 2026-08-21)
- https://app.premarket.xyz/ and its bundle `/assets/index-*.js` (H, read as text; last-modified 2026-10-17)
- https://docs.premarket.xyz/llms.txt and `.md` pages: `readme.md`, `readme/getting-started/{welcome,setup,smart-account,kyc}.md`, `readme/understanding-markets/{prediction-markets,options-markets,covered-calls}.md`, `readme/trading/pricing.md`, `readme/payouts-and-settlement/{settlement-price,prediction-settlement,cancellation}.md`, `readme/wallet-and-funds.md`, `readme/quick-help/faq/{general,trading,settlement,wallet}.md`, `readme/quick-help/country-restrictions.md`, `readme/changelog.md`, `readme/developer-docs.md` (all H)
- https://api.premarket.xyz/premarket/api/markets, `/markets/{id}`, `/markets/{id}/trades`, `/orderbook/api/orders?marketId=` (H, unauthenticated GET, 2026-10-19)
- https://app.premarket.xyz/api/dflow-proxy/events?limit=2&status=active (H, one GET)
- https://github.com/stryke-xyz/premarket-sdk (`README.md`, `docs/orderbook-integration.md`, `src/api/ORDERBOOK_README.md`, `src/api/orderbook-api/index.ts`, `src/config/{chains,index}.ts`; pushed 2026-09-10) and https://github.com/stryke-xyz/premarket-contracts (stub) (H)
- https://api.llama.fi/protocol/premarket, `/summary/dexs/premarket`, `/summary/fees/premarket` (H, 2026-10-19); https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/premarket/index.js and https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/premarket/index.ts (H)
- https://pond.dflow.net/llms.txt (H, shows no prediction-market pages); https://www.quicknode.com/guides/solana-development/3rd-party-integrations/kalshi-prediction-markets-with-dflow (M, search snippet only)
- https://x.com/premarket_xyz (M, search result only; not opened)
- PayBox `discover_tokens` chain catalog (H, 2026-10-19); repo notes `docs/research/06-paybox-platform.md`, `docs/research/14-platform-of-platforms.md` (M)
- DNS: `dig @1.1.1.1 robinhood.premarket.xyz` returned NXDOMAIN (H)
