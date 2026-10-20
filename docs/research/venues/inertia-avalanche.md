# Inertia (Avalanche) - adapter spec

Researched 2026-10-19 (~02:30-02:50 UTC). READ-ONLY: unauthenticated GETs only (site, public explorer API incl. `eth_call` via GET, DNS, `gh api` for public org metadata), the public SPA bundle read as text and never executed. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE, no PayBox money tool called. No third-party code cloned, installed or run. Generic User-Agent `insurance-markets-research/0.1` on every scripted request.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (site, bundle, ToS, API payloads) is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found.
Fixtures: `docs/research/fixtures/inertia-avalanche/` (10 files, each <= 12 KB).
Search budget note: the shared WebSearch budget was exhausted after the first query, so discovery relied on WebFetch, DNS, GitHub and chain data. Absence claims below say what was searched.

## 0. Verdict

**adapter_priority: skip.** Dormant for 363 days, no read API reachable, creator-resolved micro-markets with no overlap with other venues, negligible liquidity.

1. **Not live in any useful sense (H).** The last transaction to the Inertia market factory on Avalanche C-Chain was 2025-10-21 23:27 UTC; zero logs since (checked 2026-10-19). The backend hosts (`api.inertia.social`, `db.inertia.social`) time out on 80/443. The apex `inertia.social` has no A record and `www` is a dangling GitHub Pages site. Only the Cloudflare Pages beta SPA still answers (HTTP 200), which proves nothing about trading.
2. **The SoK catalogue label is wrong on mechanism (H vs M).** SoK says "AMM, Binary, Centralized oracle, Active, long-tail". The product's own UI copy and contract ABI show an on-chain order book (limit/market orders) plus a parimutuel variant, and the creator (not a central operator) resolves. "Active" reflects the paper's snapshot, not 2026.
3. **Thin and non-overlapping (H).** 50 sampled markets held a combined 6.49 USDC. Content is friend-group and Avalanche-community head-to-heads ("Will Malek win this chess game", "Dexalot vs Pharaoh"), not sports/politics/macro.
4. **Not integrable as read-only** (no public API; reads were SurrealDB over WebSocket behind the dead host). On-chain reads work via the explorer or RPC, but there is nothing live to read.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Factory `0xb0c15aC74eb30ffD89d1eE791410040194b173aA` (Avalanche 43114) last tx | block 70,698,971, 2025-10-21T23:27:07Z; `getLogs` from block 70,698,972 to latest = `[]`; chain head at query ~97.9M | H (Routescan GET API, fixtures `factory_txs_latest5_routescan.json`, `factory_state_eth_call.json`) |
| Factory deployed / total txs | first tx 2025-07-11; 444 normal txs in total (380 in 2025-07, 58 in 2025-08, 6 in 2025-10); 28 reverted | H (`factory_tx_histogram.json`) |
| `marketIdCounter()` | 0x810 = 2064 (last market id 2063 exists, closing 2025-08-26; ids 2014-2063 all exist, ids <= 1500 probed empty); `paused()` = false | H (`eth_call`) |
| Relayer/sponsor EOA (`from` of 443 of 444 factory txs) | 2,729 txs from 2024-10-01 to 2025-10-21 (peak 839 in 2025-05, 424 in 2025-07, 6 in 2025-10), still holds ~15.9 AVAX unspent | H (`sponsor_tx_histogram.json`) |
| `api.inertia.social` and `db.inertia.social` | both A 208.76.255.122 (Colocation America); TCP 80/443 time out on repeated tries over ~8 min (could be geo/IP filtering from this vantage, but see on-chain silence) | H (dig, curl, nc) |
| `inertia.social` apex | no A record (resolver fails); `www` CNAME to `inertiasocial.github.io`, GitHub Pages "Site not found" 404 | H (`dns_and_http_snapshot_2026-10-19.txt`) |
| `https://beta.inertia.social/` | HTTP 200, Cloudflare Pages Vue SPA ("Predictions for everyone - by anyone"; og "Chat and Trade About the Future of Everything") | H (`beta_site_shell.html`) |
| Social | Bluesky last post 2025-07-16 (37 posts); Telegram preview "61 members" and no public posts; GitHub org `InertiaSocial` has 11 repos, all forks except `.github`, newest push 2025-08-07 (org profile edited 2026-06-26); X page returned HTTP 402 to WebFetch (not paid, not retried) | H |
| App stores | `play.google.com/store/apps/details?id=social.inertia` HTTP 404; iTunes search "inertia social" returns no matching prediction app | H/M (404 could be regional) |
| Third-party status | CoinGecko Learn (page shows "Updated April 13 2026") still says Inertia is "not yet launched" and "built on Avalanche"; CoinDesk Avalanche Accelerator partner video dated 2024-11-08 (three former UCI students; no launch status) | L (stale copy) |
| DefiLlama | Not listed. Searched `api.llama.fi/protocols` (8,758 entries) for name/url "inertia": only unrelated "INERTIA" (Lending) and "Inertia Bridge" at inrt.fi. The three Avalanche prediction-category protocols are dripit, NODO, BetSwirl | H |

## 2. What it is

- **Kind**: onchain-clob + parimutuel (social, creator-resolved). Operator "Inertia Labs" (ToS, Delaware law). Wallet infrastructure: Cubist CubeSigner embedded wallets with OIDC login (Google/Apple/X). Product pitch: chat communities where members create and trade "predictions". (H: SPA bundle strings, ToS text.)
- **Market model**:
  - **Order book** markets: "Probability = Price: A 40% chance means a share costs $0.40"; YES/NO shares; limit orders and market orders; a market order with no resting liquidity "will be set at 50 cents"; winning shares redeem at $1.00 (H, SPA copy). On-chain `PlaceOrder{marketId, trader, quantity, price, outcome(bool), isBuy, nonce, deadline}` (H, EIP-712 type in bundle). Binary only in the order-book path (`outcome` is a bool).
  - **Parimutuel** ("Quick Prediction"): pooled payouts that "change in real-time ... based on total combined action prior to closing"; `isParimarket` and `numOutcomes` parameters in `CreateMarket`, so categorical is possible in pari markets (H for params, M for how it is used).
  - Factory pattern: one "Decentralized Market Factory" (ABI: `createMarket`, `getMarket`, `markets(uint256)`, `implementation`, `pariImplementation`, `sorter`, `treasury`, `nonces`, `DOMAIN_SEPARATOR`, `executeCreateMarket/PlaceOrder/CancelOrder/RedeemTokens/MarketResolve/ResolveMarket/Transfer`) spawns a clone per market. Share tokens appear to be ERC-1155 (token ABI with `safe_mint`, `burn`, `total_supply`, `uri`) (M: ABI seen in bundle, contracts unverified on the explorer). Vyper-style naming suggests Vyper contracts (L).
- **Chain and collateral**: Avalanche C-Chain (43114) only on mainnet; Fuji testnet factory also referenced. Collateral is native USDC `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`; AVAX only for transfers. (H: bundle constants + explorer.)
- **Market creation**: any user, with `resolver`, `closingTime`, `creatorFeePercent`, optional whitelist (private markets). Manual resolution only ("Only manual resolution is supported for the time being"). Recent samples: Avalanche-ecosystem project head-to-heads in pari markets (`@dexalot vs. @PharaohExchange`, `The Arena vs Kite AI`), a chess game, and "Will either Malek or Looker even get their token bonded?". Fixture `factory_market_sample_50.json`.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Docs | NOT FOUND (searched: `inertia.social` and `docs.`/`api.` hosts, GitHub org `InertiaSocial` repos and profile README, bundle strings, ToS/privacy routes). No developer docs, no OpenAPI, no public REST page. | H absence |
| REST `https://api.inertia.social` | Elysia/Eden-style client used by the SPA for `sponsor.*` relays, `coinbase.onramp.get`, `upload.image.post`, `auth/apple`; Bearer token from the CubeSigner OIDC session. Host unreachable (timeouts). Public read endpoints: NOT FOUND. | H (bundle) / H (unreachable) |
| Realtime/DB `wss://db.inertia.social` | SurrealDB; the SPA calls SurrealQL functions `fn::get_market_data`, `fn::search_markets`, `fn::get_my_shares`, `fn::get_market_graph_data`, `fn::calculate_pnl`, `fn::calculate_parimutuel_pnl`. Auth and anonymous-read status unknown; host unreachable. | H (names) / H (unreachable) |
| On-chain | Only working read path. Factory `markets(uint256)` returns a struct per market (id, market clone address, creator, factory, question, rules, closingTime, ..., fee bps); `marketIdCounter()` gives the next id (not a count of markets). Contracts are NOT verified on Routescan ("Contract source code not verified"), so order-book view functions on the clone/sorter contracts are NOT FOUND (ABI of clones not read). Public RPC used by the app: `https://api.avax.network/ext/bc/C/rpc`. | H |
| Rate limits, auth model for a third party | NOT FOUND | - |

Confirmed response shapes (GET only, via Routescan etherscan-compatible API for chain 43114):
- `module=proxy&action=eth_call&to=<factory>&data=0xb1283e77<id32>` returns the ABI-encoded `markets(id)` struct; decoded sample in `factory_markets_2063_2062.json` (fee `150` = 1.5%, closing time unix, question and rules strings).
- `module=account&action=txlist&address=<factory>` returns standard tx rows (`factory_txs_latest5_routescan.json`).

## 4. Trade path

- **Design (H, bundle)**: gasless meta-transactions. The user's wallet signs an EIP-712 message; the Inertia sponsor API (`sponsor.executePlaceOrder` etc.) submits `executePlaceOrder(...)` on the factory and pays gas. USDC allowance is granted per action with an EIP-2612 `Permit` signed by the user (USDC domain `name "USD Coin"`, `version "2"`, chainId 43114).
- **EIP-712 domain**: `{name:"Decentralized Market Factory", version:"1", chainId:43114, verifyingContract:<factory>}`. Types for `CreateMarket`, `PlaceOrder`, `CancelOrder`, `RedeemTokens`, `MarketResolve`, `ResolveMarket`, `Transfer` are in `spa_bundle_extract_endpoints_eip712.json`. Per-trader `nonces(address)` on the factory, `deadline` of now+24 h.
- **Direct path (M)**: `createMarket(...)` is a plain external function on the factory. A direct trading function for EOAs is NOT FOUND in the factory ABI (only `execute*` wrappers). Whether a third-party relayer may call `executePlaceOrder` is NOT VERIFIED (source unverified). The permit/signature params tuple layout was not fully read.
- **Wallet**: the official client's wallet is a CubeSigner embedded wallet with an "Export Private Key" option (H, UI string). Funds: USDC on Avalanche; deposit by LI.FI widget from any chain, or Coinbase onramp.
- **Verdict**: no supported programmatic API for third parties; nothing live to trade.

## 5. PayBox reachability

**partial (in principle only).**
- PayBox's chain catalog lists Avalanche (43114) (project note `docs/research/06-paybox-platform.md`, M: second-hand from an earlier session, "not a support allowlist"). USDC on Avalanche is native there.
- A PayBox EVM wallet could, in theory, sign the Inertia EIP-712 `typedData` (`request_wallet_sign`; that note records no domain allowlist) and a USDC `Permit`, then a self-run relayer would have to submit `executePlaceOrder`. Not testable: relayer permissions unverified, no live market.
- PayBox transaction proposals could hold a direct `createMarket` call, but there is no reason to.
- It would NOT be the user's existing Inertia account: those are CubeSigner wallets (the key is exportable, M).

## 6. Fees

| Fee | Value | Tag |
|---|---|---|
| Creator fee | `creatorFeePercent` set at creation; the default sent by the app is 150 (1.5%); all 50 sampled markets show 150. UI: "final payout may vary based on order matching, which also includes a 1.5% creator fee" | H |
| House edge | UI: "All trades are peer-to-peer with 0% house edge" | H (marketing copy) |
| Protocol/treasury take | `treasury()` = `0x731770e5c639d1eba694a4c617fd4b2e3e78bed3` (holds 0.17 USDC); any protocol fee percentage: NOT FOUND (contracts unverified) | H / NOT FOUND |
| Gas | Sponsored by Inertia for relayed actions (relayer EOA paid AVAX) | H |
| Market creation | the app signs a USDC permit sized 0.99 USDC (`99*10^4`) for create-market, purpose unstated | M |

## 7. Resolution and dispute risk

- **Creator (or chosen `resolver` address) resolves manually** (H: "Prediction creators resolve their predictions. Winning shares become worth $1.00 each"; "You need to resolve your prediction within 24 hours after the duration passes"; `MarketResolve{paused, resolved, winningOutcome}` signed by `resolver`). A "Resolve to Majority" button exists (H, label only; mechanism NOT FOUND).
- No oracle, no dispute window, no bond, no escalation in the ABI or UI copy (H absence). The SoK "Centralized" oracle label is roughly right in spirit; in practice it is a single self-interested resolver per market. Unresolved markets lock funds (market 2063 still held 5.985 USDC at query time, closing 2025-08-26).
- Resolution risk for any cross-venue pairing: extreme (different resolver, subjective rules, no recourse). Contract admin functions (`setImplementation`, `setPaused`, `setTreasury`, `setSorter`) exist on an unverified factory (H ABI): upgrade/admin risk on funds.

## 8. Geo, ToS, automation

- ToS (inline in the SPA, "Last updated: October 1, 2024"; entity "Inertia Labs"; Delaware law and binding arbitration in Delaware): user warrants 18+, not a "Restricted Person or Sanctioned Person" (OFAC cited), and "will not use a VPN or any other privacy or anonymization tools ... to circumvent ... restrictions". It also prohibits: "Use any robot, spider, or other automatic device, process or means to access the Website for any purpose, including monitoring or copying any of the material on the Website." (H)
- Implication: scraping the website/API for the aggregator is contractually prohibited; reading public chain data is not covered by that clause. A list of restricted jurisdictions was NOT FOUND in the ToS excerpts read. The service describes itself as in beta ("some issues are to be expected").
- Smart-contract risk language: ToS disclaims "complete loss of user assets" (H).

## 9. Liquidity (all low)

- Sampled `markets(id)` for 57 ids (2063..2014 plus 1500, 1000, 800, 500, 100, 10, 1): 50 exist; sum of USDC held by their clone addresses on 2026-10-19 = **6.49 USDC**, of which 5.985 in market 2063 and 0.5 in 2056 (H, fixture `factory_market_sample_50.json`). All 7 older probes (ids 1, 10, 100, 500, 800, 1000, 1500) returned empty records while all 50 probes in 2014-2063 exist, so the counter does not start at 0 and the number of real markets is far below 2,064 (M; 444 factory txs in total bound it at a few hundred).
- Lifetime: `marketIdCounter` = 2064 (not a market count, see above), 444 factory txs since 2025-07-11, 2,729 relayer txs since 2024-10-01 (H). Lifetime USDC volume: NOT FOUND (not computed; clone event logs not decoded). Not on DefiLlama (searched). TVL by this sample: dust.
- Dated 2026-10-19; contract treasury 0.17 USDC.

## 10. Event overlap and arbitrage

- Categories seen: friend-group/community bets, chess game, token "bonding" races on Avalanche launchpads, Avalanche-project head-to-heads, tutorial examples about BTC thresholds (copy only). None are sports leagues, politics, macro or listed crypto price markets with depth. **No realistic cross-venue overlap**; even if a match existed, resolution by the creator makes it unfit as an arbitrage leg.
- **Shared liquidity**: none (independent), but also effectively empty. Not an independent arbitrage leg because there is no liquidity at all.

## 11. Adapter recommendation

- **skip.** If ever revisited: Avalanche read-only adapter = `markets(uint256)` + `marketIdCounter()` + event logs on the factory; no signing leg. Re-check if factory logs resume after 2025-10-21 or if a new factory address appears on `beta.inertia.social` bundles.
- Signal value: none. Do not use Inertia prices as a Quotient-style signal source.

## 12. Not found

- Official docs, public REST/WebSocket API, rate limits, OpenAPI.
- Verified contract source and ABI for market clones/sorter; order-book view functions.
- Protocol fee percentage and treasury accounting.
- Resolution dispute process ("Resolve to Majority" mechanics).
- Restricted-jurisdiction list.
- Lifetime volume and TVL history (not on DefiLlama, Dune not searched).
- Any 2026 announcement from the team (X page blocked with HTTP 402; Bluesky/Telegram silent; WebSearch budget exhausted after one query).

## 13. Open questions

- Is the team still running the backend (possibly IP/geo-filtered from this vantage)? Only a second vantage or a dated team post would settle it; on-chain silence is the stronger signal.
- Did Inertia move to a different factory or chain (the `beta` bundle in 2026 still points at the 2025-07-11 factory)?
- Does the factory restrict `execute*` callers to the sponsor?

## 14. Sources

1. SoK supplementary catalogue row for Inertia (repo created 2026-07-04): https://github.com/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials/blob/main/protocol_catalogue.csv (line 46: `Inertia,AMM,Centralized,Binary,Curated,Avalanche,Operator,Native,Active,No,redundant/long-tail`) [M: classification, not verified by the authors in the verification CSV, which has no Inertia row].
2. Beta app shell and bundle (read as text): https://beta.inertia.social/ and https://beta.inertia.social/assets/index-CFyWixR3.js [H for what the product ships; marketing copy inside is self-reported].
3. Web manifest: https://beta.inertia.social/manifest.webmanifest [H].
4. GitHub org and profile README: https://github.com/InertiaSocial and https://github.com/InertiaSocial/.github (profile/README.md) [H].
5. Routescan (etherscan-compatible GET API for chain 43114): https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api [H for chain data, 2026-10-19].
6. CoinGecko Learn, "Mobile Friendly Prediction Market" section, page shows "Updated April 13 2026": https://www.coingecko.com/learn/what-are-prediction-markets-crypto [L: says "not yet launched"].
7. CoinDesk Avalanche Accelerators Founder Series video, 2024-11-08: https://www.coindesk.com/tv/avalanche-accelerators-founder-series/inertia-making-prediction-markets-social-for-the-next-generation-or-partner-content [L: stale].
8. Bluesky public API (profile `inertia.social`): https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=inertia.social [H].
9. DefiLlama protocol list: https://api.llama.fi/protocols [H absence].
10. Telegram public preview: https://t.me/s/inertia_social [H].
11. Project note on PayBox chain catalog (internal): `docs/research/06-paybox-platform.md` [M].

Fixtures index (all in `docs/research/fixtures/inertia-avalanche/`): `beta_site_shell.html`, `dns_and_http_snapshot_2026-10-19.txt`, `factory_market_sample_50.json`, `factory_markets_2063_2062.json`, `factory_state_eth_call.json`, `factory_tx_histogram.json`, `factory_txs_latest5_routescan.json`, `sok_catalogue_row.csv`, `spa_bundle_extract_endpoints_eip712.json`, `sponsor_tx_histogram.json`.

Privacy check: no personal identifiers in any request, note or fixture (scanned for the user's name, email and home-directory path; the only addresses recorded are Inertia's public contracts and third-party EOAs on a public chain).
