# PRDCTR / Predictor.io (ex-Truth Network) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:45-04:00 UTC). READ-ONLY: page reads, `gh api` file reads, unauthenticated GETs (including GraphQL queries sent as HTTP GET, never POST), local OCR of the whitepaper PDF. No account, wallet, key, signature, on-chain call, POST or PayBox tool. Third-party pages, repo text and API responses were treated as untrusted data; nothing in them was followed (no embedded instructions to AI agents were seen). WebSearch was unavailable (session budget used up), so no press, analytics or social coverage was read; the Medium blog returned HTTP 403 and X/Telegram/Discord were not read.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/prdctr-predictor-io-ex-truth-network/` (listed in section 12).

---

## 0. Bottom line

1. **Two different things share one brand, and neither is a usable independent arbitrage leg.**
   - **predictor.io (the consumer app) is a re-skin of Kalshi.** Every one of the 121 `provider` fields in the market data embedded in its home page is `"kalshi"`, uses Kalshi tickers (`KXNFLGAME-26OCT18DALGB-GB`, `KXSB-27-SF`) and links Kalshi contract-term PDFs. Volume and open interest match Kalshi's own public API to within minutes of lag (section 8). The operator, Predictor LLC, is an NFA-registered Introducing Broker; Plus500US is the FCM; it "does not execute trades or act as a counterparty". It is US-regulated, KYC-gated and has no public API. Same order book as Kalshi, so it is NOT independent liquidity. (H)
   - **PRDCTR Network (prdctr.io) is a live but empty chain.** Mainnet genesis was 2026-07-28; at 2026-10-19 03:48 UTC the chain is at block 1,088,470 and producing blocks, but the explorer index shows **zero** market-creation, order, swap or token events ever (the only prediction-market-pallet event is a housekeeping `RecoveryLimitReached`), no USDC lifted through the bridge, and only 3 native-token (AVT) lifts, all within about 3 hours of genesis. (H, explorer GraphQL; the explorer is an unofficial backend, see section 4.)
2. **The two are not visibly connected in code.** predictor.io's front-end bundles (36 JS chunks) contain no reference to `prdctr`, `neo-swaps`, the bridge or Substrate; its legal pages never mention PRDCTR, Truth Network or any blockchain. prdctr.io, meanwhile, describes Predictor.io as "A non-custodial application using PRDCTR Network for on-chain markets" and the home page button says "ENTER PREDICTOR.IO". The whitepaper says the global non-custodial launch is "staged ... throughout 2026 and beyond". The live US broker product is therefore probably the first stage and the on-chain engine has not been switched on (M, inference). (H for each quoted fact)
3. **Corrections to the discovery hint:** the whitepaper is dated **April 23, 2026** (v1.3 Public Draft), not April 2023 (the file name says "Apr 23"). The "coming soon" text exists only as an image file name (`predictor-coming-soon.png`) on prdctr.io; predictor.io itself is up and trading Kalshi markets. CoinGecko 24h volume is now about $1.9K, with every pool flagged inactive. (H)
4. **adapter_priority = skip.** predictor.io would be an alias of Kalshi (register it as such so the aggregator never double-counts); the PRDCTR chain has nothing to read or trade. Cheap re-check trigger in section 11.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| prdctr.io | HTTP 200, footer "(c) 2026 Predictor Foundation"; `truth-network.io` returns 200 and lands on `prdctr.io` | H |
| predictor.io | HTTP 200; home page lists NFL (Oct 18 2026 DAL vs GB), NCAAF, 2027 Pro Football champion, 2028 Democratic nominee, tennis; all `provider: kalshi` | H |
| PRDCTR chain | Explorer GraphQL: `squidStatus.height` 1,088,470, block time 2026-10-19T03:48:42Z, spec version 1020100; block 1 at 2026-07-28T08:51:48Z; 6 s blocks (6000 ms in `runtime/src/lib.rs`) | H |
| Repo activity | `PRDCTR-Foundation/predictor-node` pushed 2026-10-09 (release 1.3.2), created 2026-04-13, GPL-3.0; `prdctr-bridge` pushed 2026-08-05; Zeitgeist fork pushed 2026-06-04. Old `Truth-Protocol-Foundation/truth-network-node` pushed 2026-10-15 | H |
| Mainnet milestone | CHANGELOG 1.2.0 (2026-07-26): "Add mainnet chainspec configuration"; chain spec `prdctr_mainnet_v1`, `chainType: Live`, 5 boot nodes `node-1..5.prdctr.io:30333` | H |
| Token | CoinGecko: TRUU rebranded to PRD and migrated to a new contract; 24h volume $1,910; FDV $9.70M; every pool "Inactive - No trades in the last 3 hours" | H (page read via WebFetch summary, so M for exact figures) |
| Market activity on the PRDCTR chain | 0 events from NeoSwaps, Orderbook, HybridRouter, Signed*, Tokens, AssetManager, Court, MarketCommons; PredictionMarkets: 1 housekeeping event; calls: 0 | H (section 4) |

Verdict: **still_live = true** for the website, the token, the chain and the Kalshi-routed app; **no independent prediction-market activity exists**.

---

## 2. Kind and market model

**A. predictor.io (what users can trade today)** (H)
- Kind: US-regulated introducing-broker front end for CFTC-regulated event contracts. Contracts are "listed on a regulated exchange (e.g., KalshiEX LLC)" and "may be cleared through ... (e.g., Kalshi Klear LLC)"; the exchange is only named as an example on `/disclosures`, but the data, tickers and contract-term PDFs are Kalshi's.
- Model: Kalshi's central limit order book, binary YES/NO contracts, USD-denominated, grouped into events (`mutuallyExclusive` flag) and series. Prices in the SSR payload are decimals (`currentPrice: {YES:"0.13", NO:"0.87"}`).
- No outcome tokenisation on-chain; positions live in an FCM account.

**B. PRDCTR Network on-chain engine (not used by anyone yet)** (H, code in `predictor-node`)
- Fork of Zeitgeist: runtime includes `PredictionMarkets`, `MarketCommons`, `NeoSwaps` (AMM with liquidity tree), `Orderbook` (limit orders), `HybridRouter` (routes a buy/sell across AMM and orderbook), `Court`, `Authorized`, `GlobalDisputes`, `CombinatorialTokens`, plus `Signed*` wrappers for relayer-submitted trades.
- Outcomes: `Asset<MarketId>` fungible tokens held in ORML `Tokens`, not ERC-20s. `MinCategories = 2` (binary is the minimum); upstream Zeitgeist also has scalar markets, not verified in this fork.
- Market creation looks whitelisted: `configs/mod.rs` comment "The low amount is assuming only whitelisted accounts can create a market".

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | PRDCTR Network, an Aventus AppChain: Polkadot-SDK `stable2409` solo chain, Aura/GRANDPA proof of authority, sr25519 session keys, ss58 prefix 42, PRD with 10 decimals, 6 s blocks, still has `pallet_sudo` (3 sudo calls so far, incl. `set_code`) | H |
| Gas | PRD only ("PRD is required for every on-chain action without exception", whitepaper section 8.2) | H |
| Collateral (intended) | USDC and USDT bridged from Ethereum into a "prediction market account" (`predictionMarketLift`, `predictionMarketPermitLift`, `relayerLift` accept USDC/USDT only) | H (README + `PRDCTRBridge.sol`) |
| Bridge (Ethereum) | `PRDCTRBridge` proxy `0x7A47CF8FA87Bd6C7733c9B25D24bfdb8CD8E2228` (README "Mainnet Deployment"; README links the implementation to a Sepolia explorer and the audit link is "TBC", so treat the table as unverified). Lowering takes about 12 h, lifting 15-20 min (prdctr.io FAQ) | H for README text; deployment not verified on-chain |
| Account derivation | `deriveT2PublicKey(address) = keccak256(abi.encodePacked(address))` is the 32-byte chain account credited by `predictionMarketLift` | H |
| PRD token | ERC-20 on Ethereum, cap 95B; new contract `0xc84782858b7bef5d25182dbac956a6aa463aefe5`, old TRUU `0xdae0fafd65385e7775cf75b1398735155ef6acd2` (CoinGecko, which flags the old contract as an upgradeable proxy with owner powers); "1 TRUU = 1 PRD" | M |
| predictor.io | USD in an FCM (Plus500US) account; "Predictor does not require users to use any digital assets"; MoonPay/Privy keys exist in the front-end config but every one of the 121 `provider` fields is Kalshi | H |

---

## 4. Read API

**Official public API: NOT FOUND** (searched: prdctr.io pages, FAQ, whitepaper, GitHub org `prdctr-foundation` and `Truth-Protocol-Foundation`, predictor.io home/learn-hub/legal, `predictor.io/docs|developers|api` = 404, DNS for `docs|api|rpc|app|ws.prdctr.io` and `api|rpc|docs.predictor.io` = no records).

What does exist:

| Surface | Detail | Tag |
|---|---|---|
| PRDCTR explorer backend (unofficial) | `https://explorer.prdctr.io/config.js` publishes `EXPLORER_API_URL=https://explorer-api.prdctr.io`, `STATS_API_URL=https://stats.prdctr.io`, `ACCOUNT_API_URL=https://account.prdctr.io`, `GATEWAY_URL=https://archive-gateway-v2.prdctr.io`. Each serves a Subsquid OpenReader GraphQL at `/graphql` (the explorer bundle builds `/graphql/explorer`, `/stats`, `/account`, `/gateway`). Unauthenticated, works with HTTP GET `?query=...`, introspection enabled. Entities on the explorer squid: `blocks`, `extrinsics`, `calls`, `events` (fields `pallet`, `name`, `args`), `accounts`, `itemsCounters`, `squidStatus`. No market-level entities: market data would have to be decoded from `PredictionMarkets.*` / `NeoSwaps.*` events. The `account` squid returned a Postgres authentication error ("password authentication failed for user postgres"), so that service is currently broken. No documented rate limits or SLA. | H |
| Substrate JSON-RPC / WebSocket | No public endpoint documented; only p2p boot nodes. HTTP JSON-RPC needs POST, so not probed. | H (absence), probe not run |
| predictor.io backend | `api.galacticmarkets.net` (from front-end config, resolves in DNS) serving routes such as `/markets/search`, `/events`, `/positions`; user routes are behind Auth0 (audience `cosmos-api.com`, tenant `auth.cosmos.plus500.com`). Undocumented, not probed. | M |
| predictor.io SSR HTML | Market objects (ticker, title, `currentPrice`, `stats.volumeTotal`, `openInterest`, `provider`) are embedded in the home page flight data. robots.txt: `Allow: /`, disallows `/admin/`, `/my-positions/`, `/account/`. Scraping is restricted by the ToS (section 9). | H |
| Websocket | NOT FOUND for either surface | - |

For anything predictor.io lists, the correct data source is Kalshi's own API (covered by the parallel Kalshi workflow).

---

## 5. Trade path and PayBox reachability

- **predictor.io:** customer onboards through Plus500US (KYC, funding by "available funding methods supported by the FCM partner", USD). Orders are placed in the web app after Auth0 login. No order API, no signed-order scheme, no crypto settlement. (H) -> not reachable from a PayBox wallet.
- **PRDCTR chain:** trading calls are Substrate extrinsics (`PredictionMarkets`, `NeoSwaps`, `Orderbook`, `HybridRouter`) or relayer-submitted `SignedHybridRouter.signed_buy/signed_sell` carrying a `Proof` with the signer's `MultiSignature` over a SCALE-encoded payload (relayer, per-market nonce, market id, asset, amount, max/min price, orders, strategy). That is a Substrate signature, not an EVM transaction or EIP-712 message. (H, `pallets/signed-hybrid-router/src/lib.rs`)
- **What an EVM wallet could do:** on Ethereum, approve and call `predictionMarketLift` / `predictionMarketPermitLift` (or have a Foundation relayer call `relayerLift` after a permit) to credit `keccak256(address)` on the PRDCTR chain; withdraw with `claimLower`. How the owner of that derived account signs on the PRDCTR side is NOT FOUND in `predictor-node`, `prdctr-bridge` or the avn-parachain fork (searched: repo trees, `signed-*` pallets, bridge contract; `gh search code` for ecdsa/personal_sign returned nothing). So even the deposit leg leaves the funds in an account whose control scheme is undocumented.
- Verdict: `paybox_reachable = no` for trading. Deposit-only via the Ethereum bridge is technically possible but pointless while there are no markets. No Base, BNB, Arbitrum, Polygon or Solana path exists.

---

## 6. Fees

| Venue part | Fee | Tag |
|---|---|---|
| predictor.io | `/fee-schedule` gives no rates: "A fee may apply when you enter or exit a position" as a fixed fee per contract, a percentage, or a spread; commissions, exchange and clearing fees, data fees, financing charges; "Predictor may change fees at any time". Kalshi's own fee formula is covered in the Kalshi notes. Rates on Predictor: NOT FOUND. | H |
| PRDCTR network gas | $0.05 in PRD per trade today; planned "1% of transaction value" bounded $0.10-$0.50 per tx, $0.05 of it burned (prdctr.io FAQ and network page, whitepaper section 5.4) | M (WebFetch summaries) / H (whitepaper OCR) |
| PRDCTR winner fee | `WinnerFeePercentage = Perbill::from_percent(5)` deducted from winners' payouts, sent to a configured `winnings_fee_account`; network page says "Galactic" gets 5% of each winning payout and PRDCTR takes 5% of that, whitepaper says 0.1-0.25% of winnings go to node operators | H (code) / M (page) |
| PRDCTR trade fees | NeoSwaps swap fee (max `10 * CENT_BASE`, about 10%) plus a flat `additional_swap_fee` to a chain-operator account; market-creator fee capped at 1% of volume (`MaxCreatorFee`) | H (code), exact live parameters not read |
| Bridge | USDC lifts/lowers via the Foundation relayer: network fee plus a share of periodic relayer refunding, deducted from the USDC, break-even basis | H (README) |

---

## 7. Resolution mechanism and dispute risk

- **predictor.io:** outcomes come from the exchange's contract terms, "Predictor does not guarantee market outcomes or override applicable exchange settlement rules"; "An invalid or void resolution may occur if a market cannot be resolved according to its rules"; no formal appeal beyond contacting support. Risk equals Kalshi resolution risk. (H)
- **PRDCTR chain:** Zeitgeist-style oracle report, bonds and disputes: `OracleBond` 100 BASE units, `OutsiderBond` and `DisputeBond` 2,000 BASE units (BASE assumed to be 1 PRD, constant not read), `MaxDisputes = 1`, then Court / Global Disputes pallets. Whitepaper says resolution "will initially be manually run through node owner vote", then an automated oracle layer, which "will be delayed as regulatory requirements ... become clearer" (the OCR text reads "Consensys will initially start as a compliance-governed node owner vote", very likely a mis-OCR of "Consensus"). Core validator set is under 10 nodes, plus a sudo key and a Foundation veto on governance. High centralisation and dispute risk. (H)

---

## 8. Shared liquidity with another venue

predictor.io is **the same liquidity as Kalshi**. Evidence (fixture `predictor_io_vs_kalshi_KXSB-27-SF_2026-10-19.json`), same market `KXSB-27-SF` (2027 Super Bowl, San Francisco), fetched minutes apart:

| Field | predictor.io SSR payload | Kalshi `GET /trade-api/v2/markets/KXSB-27-SF` |
|---|---|---|
| YES price | 0.13 | last 0.13, bid 0.13, ask 0.14 |
| Total volume | 10,742,554.86 | 10,744,331.92 |
| Open interest | 7,754,980.98 | 7,755,084.53 |
| Close | 2029-02-13T23:30:00Z | 2029-02-13T23:30:00Z |

(H.) Predictor's own `stats.liquidityAmount`, `uniqueTraders` and `tradesCount` are all 0 across the page, which fits a pass-through display. The aggregator should map predictor.io to Kalshi and never treat it as a second leg. The execution venue is Kalshi-listed per the page's data; `/disclosures` names KalshiEX only as an example (M for "orders actually route to KalshiEX").

---

## 9. Geo, ToS and automation

- predictor.io `/terms-of-service` (H, WebFetch summary of the page): operator Predictor LLC, NFA ID 0574423, Introducing Broker; FCM Plus500US Financial Services LLC; 18+; KYC/AML via the FCM; "Products, services, and markets may not be available in all jurisdictions", no state or country list; geolocation script (GeoComply) is loaded on the site (H, in HTML). Automation: "Market data, APIs, and tools are subject to separate licensing and exchange rules. Users may not copy, scrape, distribute, sublicense, reverse engineer" without written consent (paraphrase of summary); bots are not specifically addressed. Treat scraping as prohibited.
- prdctr.io `/terms-of-use-prd` (H, summary): PRDCTR Network Ltd, Tortola BVI, "use the website only for lawful purposes"; no jurisdiction list, no bot/API clause; the liability and IP sections name "Truth Network Ltd" (inconsistent). The whitepaper disclaimer says applications "may be subject to different regulatory regimes". The bridge README says user lifts apply a Chainalysis sanctions check.
- Net: a US-only KYC'd broker account on one side, a BVI infrastructure site with no usable product on the other. No sanctioned automated path.

---

## 10. Liquidity, with dates

| Measure | Value | Date / source | Tag |
|---|---|---|---|
| On-chain PRDCTR market volume / OI / TVL | 0 (no markets, no trades, no USDC lifted) | 2026-10-19, explorer GraphQL | H |
| predictor.io displayed volume/OI | Kalshi's numbers, e.g. KXNFLGAME-26OCT18DALGB-GB volume 25.48M, OI 12.41M; KXSB-27-SF volume 10.74M, OI 7.75M | 2026-10-19, SSR payload | H (but not Predictor's own) |
| PRD / TRUU token | 24h volume $1,910 (market rows sum to about $5.7K, inconsistent), FDV $9.70M, Uniswap V3/V4 and XT.com pairs all inactive | 2026-10-19, CoinGecko | M |
| Nodes | "Over 20,000 active nodes" claimed on prdctr.io network page; not verifiable from chain data (about 41K ImOnline heartbeats in 82 days) | 2026-10-19 | L |

---

## 11. Event coverage and arbitrage relevance

- predictor.io categories (sports, politics, finance, entertainment, crypto, weather, tech, world) are simply Kalshi's catalogue, so every overlap with Polymarket, Limitless, XO etc. is an overlap with Kalshi, which the Kalshi adapter already captures. Zero incremental edge.
- PRDCTR on-chain: no markets. The only market ever shown is a static marketing widget on prdctr.io ("BTC $150k in 2026, YES 43% NO 57%"), not tied to chain data. (H)
- **Re-check trigger (cheap, keyless):** poll `explorer-api.prdctr.io/graphql` for `eventsConnection(where:{pallet_in:["NeoSwaps","Orderbook","HybridRouter","SignedHybridRouter"]}){totalCount}` and `itemsCounters`. Revisit only if those become non-zero AND a documented RPC or API appears.

---

## 12. Fixtures saved (`docs/research/fixtures/prdctr-predictor-io-ex-truth-network/`)

| File | What |
|---|---|
| `explorer_graphql_latest_blocks_2026-10-19.json` | `squidStatus`, last 2 blocks, first itemsCounters page |
| `explorer_graphql_itemscounters_2026-10-19.json` | all 99 per-pallet/per-call counters (shows no market pallets) |
| `explorer_graphql_pallet_event_counts_2026-10-19.json` | event counts for PredictionMarkets, NeoSwaps, Orderbook, HybridRouter, Signed*, Court, MarketCommons, Tokens, AssetManager, TokenManager, EthBridge, NodeManager, Balances, Sudo |
| `explorer_graphql_key_pallet_events_2026-10-19.json` | every event from the bridge/sudo/market pallets since genesis |
| `explorer_config_js_2026-10-19.txt` | explorer runtime config (API base URLs) |
| `predictor_node_mainnet_chainspec_metadata.json` | chain spec header (name, id, boot nodes, token properties), genesis state omitted |
| `predictor_io_home_ssr_first_event_2026-10-19.json` | first embedded event object from predictor.io showing `provider: kalshi` |
| `predictor_io_vs_kalshi_KXSB-27-SF_2026-10-19.json` | predictor.io vs Kalshi side-by-side for one market |

---

## 13. Open questions and caveats

1. How and when does predictor.io connect to the PRDCTR chain (the whitepaper calls it non-custodial and on-chain; the live site is a Kalshi broker front end)? Is "Predictorio" in the whitepaper the same company as Predictor LLC? Galactic Media Management appears in the `predictor-node` README CI badges and `api.galacticmarkets.net` is the app's API host, so Galactic probably operates the app (M).
2. How is a bridge-derived `keccak256(ethAddress)` account controlled on the PRDCTR side?
3. Is there a Substrate RPC/WebSocket endpoint for public use? (not documented; not probed)
4. Explorer index completeness: the squid indexes from block 1 and decoded `PredictionMarkets` events correctly, so absence of NeoSwaps/Orderbook events is strong evidence but comes from an unofficial service whose `account` squid is currently failing.
5. Plus500US / Kalshi routing is inferred from the data and a "for example" in the disclosures, not stated outright.
6. Medium blog (403), X, Telegram, Discord and any press were not read.

---

## Sources

- https://prdctr.io/ (home, raw HTML read; footer 2026; "Predictor.io is an Aventus AppChain"; coming-soon image name) - H
- https://prdctr.io/faq-prd, /network-prd, /terms-of-use-prd (WebFetch summaries) - M
- https://cdn.prod.website-files.com/68d52d4e9165d0321dd96326/69ea20b508236d65e6821d5b_PRDCTR%20Whitepaper%20Apr%2023.pdf (v1.3 Public Draft, April 23, 2026; image-only PDF, read by local OCR, so small OCR errors possible) - H
- https://predictor.io/ (home HTML and 36 JS chunks), /disclosures, /about, /fee-schedule, /terms-of-service, /learn-hub/getting-started, /learn-hub/predicting-settlement-and-outcomes, /learn-hub/security-and-privacy, /robots.txt (page reads; legal pages via WebFetch summaries) - H for HTML, M for summaries
- https://explorer.prdctr.io/config.js and https://explorer-api.prdctr.io/graphql (GET queries) - H
- https://api.elections.kalshi.com/trade-api/v2/markets/KXSB-27-SF (public GET) - H
- https://github.com/PRDCTR-Foundation/predictor-node (README, CHANGELOG, `runtime/src/lib.rs`, `runtime/src/fees.rs`, `runtime/src/configs/mod.rs`, `pallets/signed-hybrid-router/src/lib.rs`, `node/src/chain-specs/mainnet.json`) - H
- https://github.com/PRDCTR-Foundation/prdctr-bridge (README, `contracts/PRDCTRBridge.sol`) - H
- https://github.com/Truth-Protocol-Foundation/truth-network-node (README, commit log) - H
- https://www.coingecko.com/en/coins/truth-2 (WebFetch summary) - M
