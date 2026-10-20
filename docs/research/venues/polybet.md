# PolyBet (polybet.com, token PBT) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date, ~03:40-04:00 UTC). READ-ONLY: WebFetch, `gh api` file reads, unauthenticated GETs to the venue's own public REST host and to GeckoTerminal / Sourcify, static download and text search of the venue's front-end JavaScript and ToS PDF (never executed). No wallet, no signing, no POST/PUT/DELETE, no account. WebSearch budget ran out after one query, so third-party coverage is thin (stated where it matters).

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live but economically near-dead (H).** Site and a public REST API serve 10 "published" markets today, but total AMM pool depth is **about 6.4k USDC** across all ten, **lifetime traded volume is 269 USDC**, and **7 of the 10 markets have never traded**, so their displayed price is just the creator's seed (section 11). PBT token pool: 0 trades in 24h.
- **Adapter priority: skip** (at best P2 / read-only if it ever grows). Reasons: (1) liquidity too thin to arbitrage (a 200 USDC buy moves most markets 5-15 pts, section 11); (2) 7/10 prices are untraded seeds, so useless even as a signal; (3) 2% fee on every buy and sell; (4) ToS bans US persons, VPNs and "robot ... or other automated means or interface not provided by the Company"; (5) API is undocumented and exposes no timestamps or trade history; (6) admin can force-resolve via the UMA adapter after a 2-day safety period.
- **Technically it is the easiest kind of venue to integrate**: one unauthenticated GET returns every market with reserves and marginal prices, and trading is a plain on-chain FPMM `buy`/`sell` on Polygon. So revisit only if the volume figures below move materially.
- **Do not confuse with**: Polymarket; the Nexion "PolyBet" on PulseChain (docs/research/venues/nexion-predictions.md); the local ETHGlobal hackathon repo "polybet" (docs/research/13-local-implementations.md, own-repo-C).

## 1. Liveness evidence (H unless marked)

| Check | Result | Source |
|---|---|---|
| Site | `https://polybet.com` and `www.` return HTTP 200, a Create-React-App SPA shell, `<title>Market</title>`, `last-modified: Wed, 05 Aug 2026 08:11:32 GMT` (last deploy). WebFetch sees only the word "Market" because content is client-rendered. | `curl -i https://polybet.com` 2026-10-19 |
| Public API | `GET https://polybet.com/polybet-server/public/api/market/get-published` returned 10 markets (HTTP 200, 27.6 KB). Open markets end 2026-11-10 and 2027-01-01. | fixtures below |
| Token | CMC page exists as a "preview page", no price/volume/news; GeckoTerminal: PBT $0.000467, FDV about $308.5k, 24h volume $0, PBT/WETH Uniswap v2 pool created 2024-02-23, reserve about $9.6k, 0 buys/sells in every window up to 24h. | https://coinmarketcap.com/currencies/polybet/ ; https://api.geckoterminal.com/api/v2/networks/eth/pools/0x6ef662fd4fa202646712321bf7076e2cc04c7841 |
| GitHub | `pJJ3030/jjcontracts` (token, staking, merkle contracts; Hacken audit PDF dated Jan 2024). Last push 2024-03-14, 0 stars, no license. **Stale (>6 months)**. The market/backend/front-end code is not in it. | `gh api repos/pJJ3030/jjcontracts` |
| Contracts | UMA adapter and CTF verified on Sourcify, deployed Aug 2024 (blocks 53,344,236 and 53,343,416, same deployer). **Stale deploy date**, but the live API still points at them. | https://sourcify.dev/server/v2/contract/137/0x7dbb803Aeb717Ae9b0420C30669E128d6aa2E304 |
| Latest on-chain trade | **NOT FOUND**: no timestamps in the API; Polygon explorers (Blockscout behind Cloudflare challenge, Etherscan v2 needs key, Routescan lacks chain 137) and the subgraph (needs bearer key) were not usable without credentials. | n/a |
| News / social | **NOT FOUND**: X (`poly_bet` per CMC, `x.com/polybet` per the bundle - the two disagree), Telegram, Discord not readable; Messari and Blockspot returned 403 to WebFetch (a single WebSearch snippet mentioned them: M). | n/a |

Naming/disambiguation: CMC calls PBT an Ethereum token (contract `0xa406...68ce`, 660M circulating of 1B max, UCID 29689, tags "Prediction Markets, Gambling") [H, CMC]. The markets themselves live on **Polygon** [H, bundle config]. One search snippet claims "Gnosis CTF + UMA" and "Polygon" [M], which matches the bundle.

## 2. Kind and market model

- **kind**: on-chain AMM prediction market (Gnosis Conditional Tokens + Fixed Product Market Maker), backed by a centralised admin/curation layer (a PHP-looking REST backend `polybet-server` that lists "published" markets). Not an order book; no off-chain matching. [H: bundle ABI function names `calcBuyAmount`, `calcSellAmount`, `buy`, `addFunding`, `removeFunding`, `redeemPositions`, `prepareCondition`, `reportPayouts`; config key `fixedProductMarketMakerFactory`]
- **Outcomes**: all 10 current markets are 2-outcome (8 Yes/No, 2 Dem/Rep). FPMM supports N outcomes but none seen. Each outcome is an ERC-1155 position in PolyBet's own ConditionalTokens contract; the API exposes `condition_id`, `collection_id`, `position_id`, `index_set` ("1" = slot 0 = first option, "2" = slot 1). [H, API]
- **Payout mapping is consistent** (checked, not assumed): ancillary text says "p1: 0, p2: 1. Where p1 corresponds to No, p2 to Yes" (or Rep/Dem), and the deployed adapter's `_constructPayouts` returns `[1,0]` (slot 0 wins) for price 1 and `[0,1]` for price 0, with `[1,1]` (50/50) for price 0.5. Slot 0 is Yes (or Dem) in the API. [H, Sourcify verified source + API]. Note the 50/50 "unknown" outcome: both tokens redeem at 0.5, which other venues may treat as void.
- **Price formula** (standard 2-outcome FPMM): `price_i = reserve_other / (reserve_yes + reserve_no)`. Verified to match `marginal_prices` for all 10 markets (H on the data identity; M that the deployed FPMM is the stock Gnosis contract, its source is not verified on Sourcify).
- **`odd_value` is NOT a price.** It is the creator's distribution hint (pool weight). For all 7 untraded markets `marginal_price == 1 - odd_value/100` exactly, i.e. the "price" is the seed. An adapter must use `marginal_prices` (or `token_amounts`) and must flag `collateral_volume == "0"` as "seeded, not discovered".

## 3. Chains and collateral (H, from the bundle config `frontend_config.redacted.json` unless marked)

- **Chain**: Polygon PoS (137) for markets; Ethereum mainnet only for PBT token/DAO/staking pages.
- **Collateral**: native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (GeckoTerminal: "USD Coin", 6 decimals). UMA reward/bond token is USDC.e `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` ("USD Coin (PoS)", 6 dp). [H, GeckoTerminal]
- **Contracts (Polygon)**: ConditionalTokens `0x47ef682cDAD1C50A081F761a0B1EB09eD40791e1` (Sourcify match, compiler 0.5.10); UmaCtfAdapter `0x7dbb803Aeb717Ae9b0420C30669E128d6aa2E304` (Sourcify match, 0.8.15); FPMM factory `0xB149867b0E01feA6E708C45717b2202F0d3c6BA3` (source not verified on Sourcify); per-market FPMM address is in `fpmm_market_maker_address`. Older Reality.eth resolver addresses and Goerli subgraph URLs are also in the config (previous generation, M).
- **Gas**: POL on Polygon.

## 4. Read API

- **exists**: unofficial/undocumented but public and unauthenticated (the venue's own front-end API). No docs site: `docs.polybet.com` does not resolve; `polybet.com/docs`, `/terms`, `/sitemap.xml` all return the SPA shell. [H]
- **Base URL**: `https://polybet.com/polybet-server/public/api` [H, bundle config `API_URL`]
- **Endpoints seen in the bundle** (GET unless noted) [H]:
  - `/market/get-published` : list of published markets (tested, 10 rows, no pagination seen).
  - `/market/get/{permalink}` : one market (tested with `aliens`; the numeric id `22` returned HTTP 500, so use the permalink).
  - `/market/get-published-with-staking-enabled` : tested, returns `[]`.
  - `/airdrop/get/{company}/{address}` : airdrop proof lookup (not tested; wallet-specific).
  - `/terms-and-conditions/create` (POST, wallet signature) and `/terms-and-conditions/has-user-signed`: UI gating (not called).
- **Response shape** (fixtures `market_get-published.2026-10-19.json`, `market_get_aliens.2026-10-19.json`): per market `id, question_id, condition_id, question, about_market, resolution_source, permalink, category, market_ends_on (YYYY-MM-DD), market_resolved (0/1), resolved_option, fpmm_market_maker_address, uma_question_ancillary_data (hex), proposal_bond ("250000000"), liveness (259200), reward, reward_token, token_amounts[] (outcome reserves, 6 dp), marginal_prices[] (decimal strings), collateral_volume (6 dp), liquidity_measure (6 dp), options[] {option, index_set, collection_id, position_id, odd_value, marginal_price, token_amount, resolved}`. Typo'd field `uma_adapter_initiazation_response` is null on all rows.
- **Gotchas**: all numbers are strings; amounts are 6-decimal USDC; no `updated_at`, no trade list, no history, no 24h volume; `market_ends_on` for `ether` is `2017-01-01` (data-entry error; real intent is 2027-01-01); `liquidity_measure` equals `sum(token_amount_i * marginal_price_i)` in my check (aliens: 1300 x 0.15 + 229.4 x 0.85 = 390.0) [M for semantics].
- **Auth/limits**: none required for the above; response sets `access-control-allow-origin: *`, `cache-control: no-cache, private`, sits behind Cloudflare. Rate limits: NOT FOUND (undocumented; no `x-ratelimit-*` headers seen). WebSocket: NOT FOUND (0 `wss://`/`WebSocket` occurrences in the bundle).
- **Subgraphs**: the front end queries The Graph decentralized-network subgraphs (`fixedProductMarketMakers`, `fpmmTrades` entities; plus a UMA adapter subgraph) with a bearer token that is hard-coded in the public bundle. I did not use or record that token; treat the subgraph as authenticated. Gateway URLs are in the config fixture. A keyed Graph query (user's own key) or direct `eth_call` would be the way to get trade history if ever needed.

## 5. Trade path (programmatic)

- **None official.** There is no order API, no signed-order scheme, no SDK. Trading is direct contract interaction from a wallet (the UI uses MetaMask) [H, bundle].
- **Buy**: `USDC.approve(fpmm, amount)`; optional `fpmm.calcBuyAmount(investmentAmount, outcomeIndex)` (view); `fpmm.buy(investmentAmount, outcomeIndex, minOutcomeTokensToBuy)`. **Sell**: `fpmm.sell(returnAmount, outcomeIndex, maxOutcomeTokensToSell)` after `ConditionalTokens.setApprovalForAll(fpmm, true)`. **Redeem**: `ConditionalTokens.redeemPositions(collateral, 0x00..00, conditionId, indexSets)` once resolved. Function names/ABI fragments confirmed in the bundle; call semantics from the stock Gnosis `FixedProductMarketMaker.sol` read via `gh api` [H for the reference code, M that the deployed FPMM is identical].
- **UI gate (not on-chain as far as seen)**: first use asks the wallet for a `personal_sign` of a terms message, POSTed to `/terms-and-conditions/create`; IP geolocation (third-party Geoapify call from the browser) blocks `US` client-side. A direct contract call would bypass both, but see ToS (section 9).
- **Quotes**: compute locally from `token_amounts` + fee (matches `calcBuyAmount`), or `eth_call calcBuyAmount` for exactness.

## 6. PayBox reachability: yes (technically)

Polygon (137) is in PayBox's chain catalog (docs/research/06-paybox-platform.md section on the chain catalog, H from that earlier session) and an EVM proposal carries one `{to, value, data}` call, so `approve` then `buy` = two separate proposals/approvals, gas paid in POL by the PayBox EOA. No signed-order path is needed or available. No PayBox plugin exists for PolyBet. Reachability is not the blocker; liquidity, fees and ToS are.

## 7. Fees (H for config, M for formula on the deployed contract)

- `FEE_FACTOR = 20000000000000000` (2e16 of 1e18) and `FEE_PERCENTAGE = 2` in the front-end config => **2% on both buy and sell**, charged in collateral and credited to LPs (stock FPMM: buy `fee = invest * f`; sell `fee = ret * f / (1 - f)`). Round trip about 4%; hold-to-resolution costs 2% once plus gas. ToS 12.2: "The Company does not profit from the information markets." (H, ToS PDF)
- No separate protocol, deposit or withdrawal fee found. PBT staking/LP-reward programs exist but are token-side (staking contracts in config); `reward` on markets is 0.

## 8. Resolution and dispute risk

- **Mechanism (H, deployed adapter source via Sourcify + API fields)**: UMA Optimistic Oracle through `UmaCtfAdapter` (same design as Polymarket's open-source adapter). Per-market parameters from the API: `proposal_bond` 250,000,000 (= 250 USDC.e at 6 dp), `liveness` 259,200 s (**72 h**), `reward` 0, ancillary data with the question text, `res_data` mapping and `resolution_source` URL. Resolution prices accepted: 0, 0.5, 1 (50/50 possible).
- **Admin override (H)**: the deployed adapter has `onlyAdmin` `flag`, `unflag`, `reset`, `pause`, `unpause` and `emergencyResolve(questionID, payouts)`; emergency resolution requires the question to be flagged and `SAFETY_PERIOD = 2 days` to pass, after which the admin can report arbitrary valid payouts. Who the admin is (EOA vs multisig): NOT FOUND (no RPC access without POST).
- **Incentive gap (M)**: `reward = 0` means no third party is paid to propose; with a 250 USDC bond against pools of 155-1,440 USDC, proposals/disputes are uneconomic except for the operator, so expect operator-driven resolution and late settlement.
- **ToS mismatch (H)**: ToS 12.2/12.3 describe resolution by "Reality.ETH" and "possibly the Kleros courts"; the live config and API use UMA. Treat ToS as stale or covering an older generation.
- **Question quality (H)**: wording is informal and some is inconsistent (BTC: title "hit $100,000 before 2027" vs description "in 2026"; ETH end date typo). High ambiguity risk when pairing with another venue's differently-worded contract.
- Dispute path: standard UMA (dispute, adapter `priceDisputed` callback, DVM vote); not re-verified line by line.

## 9. Geo / ToS / automation (H, ToS PDF `https://polybet.com/static/media/PolyBetTOS.47586503.pdf`, 16 pp, no effective date found)

- Operator named as "Aithereum S.A."; incorporation/jurisdiction not stated; governing law is "the laws designated by the Company in the governing corporate records" (vague).
- US persons barred: "THE COMPANY DOES NOT MAKE EXCEPTIONS." The front end also blocks `US` by IP and has the user sign a no-US statement (config `restricted_countries: ["US"]`). Long sanctions/"Restricted Territories" list (Iran, Cuba, Syria, North Korea, Venezuela, Belarus, etc.) plus anyone embargoed by US/UK/EU/Canada/Panama.
- 5.5 forbids circumventing access controls "including ... through the use of a VPN"; 5.6 forbids "any robot, spider, crawler, scraper, or other automated means or interface not provided by the Company, to access the services or to extract data". The REST API above is the Company's own front-end API but is undocumented, so read use is a grey area; automated trading is on-chain (permissionless contract calls) but the ToS says use of the Website/Services is the contract. 5.4 prohibits spoofing and wash trading.
- This project owner's jurisdiction matters: if the operator of the wallet is a US person, do not use this venue at all.

## 10. Event categories and cross-venue overlap (snapshot 2026-10-19 ~03:44 UTC, H; prices = Yes/Dem side)

| permalink | category | question (short) | ends | price | pool depth USDC | lifetime volume USDC |
|---|---|---|---|---|---|---|
| house | Politics | Which party controls US House after 2026 midterms (Dem) | 2026-11-10 | 0.850 | 420 | 0 |
| Senate | Politics | Which party controls US Senate after 2026 midterms (Dem) | 2026-11-10 | 0.550 | 1,440 | 0 |
| Fed | Economics | Fed lowers rates in 2026 | 2027-01-01 | 0.200 | 424 | 0 |
| bitcoin | crypto | BTC hits $100,000 before 2027 | 2027-01-01 | 0.348 | 890 | 8.8 |
| ether | crypto | ETH hits $10,000 before 2027 | "2017-01-01" (typo) | 0.073 | 155 | 131.6 |
| ChinaTaiwan | Politics | China invades Taiwan before 2027 | 2027-01-01 | 0.150 | 600 | 0 |
| CUBA | Politics | US deploys forces into Cuba before 2027 | 2027-01-01 | 0.250 | 875 | 0 |
| OpenAI | AI | OpenAI worth $1T before 2027 | 2027-01-01 | 0.380 | 836 | 0 |
| GTA | Gaming | GTA VI launched before 2027 | 2027-01-01 | 0.854 | 382 | 128.9 |
| aliens | Aliens | US gov confirms aliens before 2027 | 2027-01-01 | 0.150 | 390 | 0 |

Overlap with big venues exists on US midterms control, Fed policy, BTC/ETH price levels, Taiwan/Cuba geopolitics, OpenAI valuation and GTA VI (all commonly listed elsewhere, M - I did not re-check those venues here). But framing differs (e.g. "lower rates in 2026" vs per-meeting markets; "hit before 2027" touch semantics) so exact-leg arbitrage is rare, and sizing kills it: with the stock FPMM maths and the 2% fee, a 50 USDC Yes buy costs average 0.872 on `house` (spot 0.850), 0.569 on `Senate` (spot 0.550), 0.233 on `Fed` (spot 0.200); a 200 USDC buy costs 0.884, 0.590, 0.309 (my calculation from the fixture reserves, M). Realistic capacity is tens of USDC per market.

## 11. Liquidity (H unless marked; all as of 2026-10-19)

- Total AMM pool depth across the 10 published markets: about **6,411 USDC** (sum of `liquidity_measure`; range 155-1,440).
- Lifetime `collateral_volume`: **269.3 USDC** in total (GTA 128.9, ETH 131.6, BTC 8.8; the other seven are 0). Source: the venue's own API (no independent confirmation; backend likely mirrors the subgraph, M).
- TVL/OI on DefiLlama or similar: NOT FOUND (not checked beyond this API; no WebSearch budget left).
- PBT token side: pool reserve about $9.6k, FDV about $309k, 24h volume $0 (GeckoTerminal, 2026-10-19). Unrelated to market liquidity.

## 12. Shared liquidity / independence

Independent of every other venue: its own ConditionalTokens deployment (positions are not fungible with any other venue's tokens), own FPMM pools, own UMA adapter. So it would be a genuinely independent arbitrage leg, but one that is almost empty. No sign of routing into or out of Polymarket or others.

## 13. Suspicious content / security notes

- No text aimed at AI agents found in the site, API responses, ToS or repo README.
- The public JS bundle embeds third-party credentials (a Geoapify API key and a The Graph gateway bearer token). I did not use or copy them; the saved config fixture has the token replaced with a placeholder. Treat the venue's operational security as weak.
- The SPA sends visitors' IPs to a third-party geolocation API (Geoapify) from the browser.
- API market descriptions and image URLs come from the operator/third parties (untrusted data); some images hotlink external sites.

## 14. Fixtures (docs/research/fixtures/polybet/)

- `market_get-published.2026-10-19.json` (27.6 KB): full list response.
- `market_get_aliens.2026-10-19.json` (3.2 KB): single market by permalink.
- `frontend_config.redacted.json` (1.4 KB): addresses, API/subgraph URLs, fee constants from the public bundle (token redacted).
- `geckoterminal_pbt_token.2026-10-19.json` (0.7 KB): PBT token market data.

## 15. Open questions / NOT FOUND

- Date of the last real trade and whether any market has ever been resolved (API shows `market_resolved: 0` for all published; unpublished ids 1-9, 12, 13, 15, 18 not visible).
- Admin/owner of the UmaCtfAdapter and FPMM factory; whether the FPMM is the stock Gnosis bytecode (unverified on Sourcify).
- Official docs, rate limits, API stability promises, WebSocket: NOT FOUND (searched: docs.polybet.com, /docs, /terms, sitemap, bundle grep for wss/WebSocket).
- Third-party news, Dune dashboards, DefiLlama listing: NOT FOUND (single WebSearch used; budget exhausted; Messari and Blockspot returned 403).
- Whether a company ("Aithereum S.A.") is real or what jurisdiction it sits in.

## Sources

- https://polybet.com (site shell, headers, `last-modified` 2026-08-05) [H]
- https://polybet.com/static/js/main.96dd9a6a.chunk.js (static read only: config JSON, API paths, ABI fragments, restricted countries) [H]
- https://polybet.com/polybet-server/public/api/market/get-published ; .../market/get/aliens ; .../market/get-published-with-staking-enabled [H]
- https://polybet.com/static/media/PolyBetTOS.47586503.pdf (Terms of Service) [H]
- https://coinmarketcap.com/currencies/polybet/ (preview page: description, socials, supply) [H for what it says, which is thin]
- https://api.geckoterminal.com/api/v2/networks/eth/tokens/0xa406844323F1603701E6ad95ADc8A082213a68ce ; .../pools/0x6ef662fd4fa202646712321bf7076e2cc04c7841 ; .../networks/polygon_pos/tokens/0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 [H]
- https://sourcify.dev/server/v2/contract/137/0x7dbb803Aeb717Ae9b0420C30669E128d6aa2E304 and .../0x47ef682cDAD1C50A081F761a0B1EB09eD40791e1 (verified source, deployment tx/blocks) [H]
- https://github.com/pJJ3030/jjcontracts (repo metadata, README, commit log) [H]
- https://github.com/gnosis/conditional-tokens-market-makers/blob/master/contracts/FixedProductMarketMaker.sol (reference fee/price code) [H for reference]
- https://github.com/Polymarket/uma-ctf-adapter (reference adapter, compared by function list only) [M]
- WebSearch snippet (Blockspot "Gnosis CTF + UMA", Messari first trade 2024-02-23 and price extremes) [M/L, pages themselves returned 403]
- Local: docs/research/06-paybox-platform.md (PayBox chain catalog and proposal shape); docs/research/venues/nexion-predictions.md; docs/research/13-local-implementations.md (name collisions) [M]
