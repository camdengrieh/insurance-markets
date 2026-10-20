# GameClub (gameclub.com) - venue spec

Researched 2026-10-19. Read-only: public site and docs pages, the site's public JS bundles read as static text (never executed), about 130 unauthenticated GETs to `api.gameclub.com`, public GETs to DefiLlama, Sourcify, Polymarket (cross-check only), `gh api` raw read of DefiLlama's adapter repo. No accounts, no wallet connection, no POST/PUT/DELETE, no signing, no WebSocket connection, no PayBox tools. Generic User-Agent `insurance-markets-research/0.1` only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale. Fixtures: `docs/research/fixtures/gameclub/`.

## Verdict

- Adapter priority: **skip** (as an arbitrage leg or independent signal). Revisit only if DefiLlama open interest for it exceeds roughly 50K USD, or it lists markets that do not exist on Polymarket and actually trade in USDT.
- Why:
  1. **Almost no real money.** DefiLlama open interest (the USDT balance of GameClub's ConditionalTokens contract) is **218 USD on 2026-10-18**, all-time peak **435 USD on 2026-10-02**, average 123 USD in September (H). Every USDT market in the API shows `total_volume`, `onchain_volume`, `verified_volume` and `current_oi` of `0`: 30 USDT markets in the 24 default-listed active events, and every market in 3,000 resolved events (2026-10-15 to 2026-10-19) (H, `resolved_events_stats_2026-10-19.json`). The only non-zero volumes are on 5 play-money POINTS markets.
  2. **Not independent.** All sports and esports markets are 1:1 mirrors of Polymarket markets (`oracle_type: "polymarket"`, `polymarket_market_id`, `polymarket_clob_token_id`). GameClub `prob_yes` equalled the Polymarket CLOB mid exactly on 3 of 3 sampled NBA games, and its book is a house-style ladder around that mid, strictly wider than Polymarket's (H, `xcheck_gameclub_vs_polymarket_2026-10-19.json`). The 5-minute BTC/ETH Up/Down markets use the same slugs and timestamps as Polymarket's (H) but settle on a different price source.
  3. **Depth is dust.** A share pays 0.1 USDT. Sampled NBA books held 13 to 22 USDT per side across 6 levels; 5-minute crypto books held 0.4 to 10 USDT per side (H).
  4. **ToS bans bots** without written consent and geo-blocks US users (H, quoted below).
- Why not P2: P2 means signal-only. A price that is a delayed, widened copy of Polymarket carries no information Polymarket does not already give. A keyless read adapter would take about 100 lines if someone wants it for completeness, but there is nothing to find.
- What is genuinely there: a live, keyless, well-structured JSON read API (see below) and a Polymarket-style signed-order design. Interesting as a clone case study, not as a venue.

## Liveness (still live in 2026?) - YES, but tiny

- `https://gameclub.com/` serves a React SPA, `index.html` last modified 2026-10-16 (HTTP `last-modified`) (H). `api.gameclub.com` returns current data: 5-minute events are created continuously (event ids 88519 to 88524 for the 2026-10-19 00:25 to 00:35 UTC slots) and sports fixtures run to 2026-10-28 (H).
- DefiLlama: listed as "Prediction Market" on BSC, id 7624, Twitter `GameClubMarket`; open-interest series runs 2026-04-05 to 2026-10-18 and fee series starts 2026-04-01 (H).
- Announcements feed has 4 posts, latest 2026-10-08 ("Feature Update: Arcade"), then 2026-07-28 limited-time events, 2026-06-01 World Cup campaign ("Predict the 2026 World Cup Champion and Win USDT!"), 2026-05-20 points-to-USDT campaign (H, `public_config_2026-10-19.json`).
- Sourcify verification dates for the contracts: 2026-05-15 (factory) and 2026-07-09 (ConditionalTokens) (H). So the protocol dates from about April to May 2026, 5 to 6 months old.
- Outside coverage: the only independent mention found is a BNB Chain DappBay directory listing ("decentralized prediction market built for Asia") (M, via WebSearch snippet; the listing page itself was not read). No press, audit report or funding news found: NOT FOUND (searched: WebSearch extended x2, DefiLlama fields `audits: 0`, `raises: []`). The Terms claim third-party audits but name no firm and link no report (L).

## Kind and market model

- Kind: **onchain-clob, hybrid** (off-chain matching, on-chain non-custodial settlement through per-user proxy wallets). Docs: "operates on a Central Limit Order Book (CLOB) model" (H, https://guide.gameclub.com/trading/editor.md). The order flow in the web client is: user signs an EIP-712 `Order`, `POST /api/orders`, the server matches, order status moves `MATCHED -> CONFIRMED | FAILED | TIMEOUT` as settlement lands on BSC (H, client code). Whether the matcher is an operator-only path on the Exchange contract: not verified (implementation unverified on Sourcify).
- Outcomes: Gnosis-style Conditional Tokens (`condition_id`, `question_id`, `outcome_slot_count`) (H, API fields; `ConditionalTokens` proxy named in DefiLlama's adapter). Every market row is **binary** (`outcome_slot_count: 2`, `outcomeIndex` 0 or 1). Soccer 1X2 events are `event_type: CATEGORICAL` = 3 binary children ("Will X win", "draw", "Will Y win") like Polymarket; two-way sports and Up/Down are `BINARY` with a single child (H).
- **Every real-money market has a twin play-money market.** Each event carries one `market_type: "USDT"` market and one `market_type: "POINTS"` market with the same question. Points markets have `collateral_per_set` = 1e18 (1 point per share) and a separate market-maker strategy `C_AVELLANEDA_STOIKOV`; the user-created "Custom" category is POINTS-only (H). Never mix them: event-level fields are not split by type.
- **Contract size is tiny**: USDT markets have `collateral_per_set = 1e17`, i.e. one share pays **0.1 USDT**; `tick_size = 1e15` (0.001 USDT = 1 percentage point of probability); `allow_fractional_cents: true` (H). Orderbook prices are in USDT per share, so **normalise: probability = price / collateral_per_set** (e.g. raw 5.0e16 on a USDT market = 0.50). USDT on BSC has 18 decimals, so all amounts are 1e18-scaled strings (H).
- Market families live on 2026-10-19 (`/events/sections`): Crypto 18, Custom 8, Soccer 7, Basketball 3, Baseball 2, UFC 1 (H). Resolved sample: 2,986 crypto Up/Down events (BNBUSDT 1,076, BTCUSDT 998, ETHUSDT 912; `updown_interval_sec: 300`) vs only 14 sports/esports events in four days (H). Docs also promise MLBB, PUBG Mobile, cricket and Asian elections (H, docs) but none seen in the live feed except Polymarket-mirrored esports (FURIA vs Cloud9, ONIC vs Team Liquid ID) (H).
- Curation: "Phase 1 - Admin: Curated Markets", community proposals via Discord planned (H, https://guide.gameclub.com/markets/images-and-media.md). `creation_mode` is `ADMIN` for the 16 official events and `USER` for the 8 POINTS-only custom ones (H). A "graduation" path lets a user market with enough volume move to USDT (`/markets/graduation-config`: `volumeMultiplier 200`, `baseVolumePoints 10000`, `minDurationDays 3`) (H).
- House market maker: markets carry `mm_strategy: C_AVELLANEDA_STOIKOV` and events `mm_budget: 2000000000000000000` (2 USDT per 5-minute event, M interpretation of the unit) (H field values). Books in the sample are fixed ladders (6 levels, thinning with distance) that look programmatic (M).

## Chains and collateral

- **BNB Smart Chain (56) only**, collateral **USDT BEP-20** `0x55d398326f99059fF775485246999027B3197955` (H, docs "Funds" page + bundle constant). Minimum deposit 0.1 USDT, minimum withdrawal 1 USDT, "No withdrawal fees" per docs (H, https://guide.gameclub.com/getting-started/funds.md); the Terms instead list "a flat USDT fee applied upon withdrawal" (H): the two disagree (see Fees).
- The web client also exposes a **Solana deposit address** and on-ramp config (`/solana/deposit-address`, `/solana/withdrawal`) and gasless deposits (`POST /deposits/gasless` with a signature) (H, routes seen in the bundle; behaviour not exercised). So funding can arrive from Solana through GameClub's own bridge: terms unknown.
- Contracts on BSC (all Sourcify exact-match, proxies; H, `contracts_sourcify_2026-10-19.json`; deployed in a burst at blocks 89,838,561 to 89,838,581):
  - ConditionalTokens (ERC1967 proxy) `0xE6D3a683bEB3fB92A4F2DB53d642Af331bfbbfb3`, holds all user USDT for active markets (DefiLlama OI adapter reads `USDT.balanceOf` of it). Implementation `0x24Ec9434eE546D6Ba462f6D7a9e74F7481285F79` is **not verified**. Upgradeable.
  - SafeProxyFactory `0xC590Ab41e94F801c41c96Fa595f67D59B8C6A176` (functions `createProxy`, `getProxyAddress`, `hasProxy`, `proxyOf`, `exchange`, `conditionalTokens`, `usdt`). "A contract is automatically created for your account on your first deposit" = per-user proxy wallet.
  - Exchange (proxy) `0x5a8A13F9e92b7847D6F9e56e92FF7560e258844a`, EIP-712 verifying contract for orders.
  - Resolution/dispute (proxy) `0xDb200BaF0a9c0eC41fAD3Ea5cd0e3aF79216e931` (`disputeOutcome(uint256)`, `getProposal(uint256)`).
  - Deployer / fee collector `0xAa1E6F6f628F15C57a675B1f38cDcE8e26c58E15` (per DefiLlama adapter).
- All four core contracts are upgradeable proxies with unverified implementations (admin and upgrade-key details: NOT FOUND, searched: Sourcify, bundle). Treat as admin-upgradeable custodial-ish risk despite the "GameClub does not take custody" Terms wording.

## Read API (official, public, keyless, undocumented)

- There is **no developer documentation**. `guide.gameclub.com` (GitBook, `llms.txt` index with 10 pages) covers user guides only; no API page: NOT FOUND (searched: llms.txt index, all 10 `.md` pages, `/docs`, `/llms.txt` on gameclub.com returns the SPA shell). The API below is the site's own backend, discovered from the public JS bundle (L-M on stability: no versioning, no contract, may change without notice).
- Base: `https://api.gameclub.com/api` (H, works unauthenticated for the endpoints below). CORS is credentialed, server-side use is fine.
- Public, **no auth**, confirmed with live GETs 2026-10-19 (H):
  - `GET /events?limit=100[&category=Crypto|Sports|E-Sports|Custom][&status=RESOLVED][&cursor=<nextCursor>]`: events with embedded `markets[]` (USDT + POINTS twins). Server caps page size at **50**. Default status is ACTIVE-ish and returned only 24 events while `/events/sections` counts 39, so enumerate by `category` and `status`. Per market: `id`, `question_id`, `condition_id`, `outcome_label`, `complement_label`, `prob_yes`, `best_ask_yes`, `best_ask_no` (cents), `tick_size`, `collateral_per_set`, `market_type`, `resolution_type`, `dispute_window` (86400), `polymarket_market_id`, `polymarket_clob_token_id`, `polymarket_condition_id` (mirrors), `projection_mode`, `yes_price`/`no_price` (stale placeholders, 50/50), volume and OI wei strings. `total_volume` on Up/Down events is **bogus**: one constant per symbol (20490.7 BNB, 108091.836 BTC, 107623.834 ETH, as 1e18 wei strings) repeated across ~1,000 events each (H).
  - `GET /events/sections`, `GET /events/{id}` (event detail, includes markets).
  - `GET /orderbook/{marketId}/{outcomeIndex}?levels=100`: `{marketId, outcomeIndex, bids[], asks[]}` with `price` and `amount` as 1e18-scaled strings. The samples came back best-first (bids descending, asks ascending) but order is undocumented, so **sort yourself**, and divide price by `collateral_per_set`. Outcome 1 is the mirror book of outcome 0 (H).
  - Config: `/rebate/config` (`{"enabled":true,"shareBps":2000}`), `/markets/graduation-config`, `/config/login-methods`, `/announcements`, `/lte/active`, `/news` (H).
- Authenticated (401 `UNAUTHORIZED` without a Bearer JWT): `/balance`, `/orders/active`, `/portfolio/pnl`, `/split/*`, `/merge/*`, `/markets/mine`, `/proxy-wallet`, etc. JWT comes from `/auth/nonce` + `/auth/verify` (SIWE-style message + signature) or `/auth/privy` (M, from bundle; not exercised).
- Rate limits: `x-ratelimit-limit: 600`, `x-ratelimit-reset: 60` on every response, i.e. 600 requests per 60 s per client (H, observed headers).
- WebSocket: `wss://api.gameclub.com/ws`, JSON frames `{type:"auth",token}`, `{type:"subscribe",topic}`, `{type:"ping"}`. Topics seen in the client: `orderbook:{marketId}`, `trades:{marketId}`, `updown:{eventId}`, `oracle:*`, `livescore:*`, `user:*`, `global:market_created`, `global:graduation` (M; I did not connect, so whether book/trade topics need a JWT is unknown).
- Public REST trade history: NOT FOUND (searched: all route strings in the index, EventPage, MatchupStatsPanel and Portfolio bundles; trades arrive only via the `trades:` WS topic or on-chain events). On-chain reads (`balanceOf`, logs) are possible with any BSC RPC but I did not call RPC (JSON-RPC is POST).
- Resolution status is readable per market from `resolved`, `resolved_outcome`, `resolved_outcome_index`, `status` (`ACTIVE` / `RESOLVED`), `oracle_*` and `uma_*` fields (H).

### Fixtures (all unauthenticated GETs, 2026-10-19)

- `events_limit3_2026-10-19.json` (19.6 KB): first 3 events (5-minute BNB/ETH/BTC Up/Down) with full market rows.
- `event_detail_nba_bos_det_2026-10-19.json` (8 KB): Polymarket-mirrored binary sports event, USDT + POINTS twins.
- `orderbook_nba_bos_det_usdt_outcome0_2026-10-19.json` (0.8 KB): raw book, shows 1e18 scaling and `collateral_per_set` need.
- `events_active_summary_2026-10-19.json` (38 KB): compact view of all 24 default-listed events.
- `resolved_events_stats_2026-10-19.json`: counts from a 3,000-event resolved crawl, including the constant-volume finding.
- `xcheck_gameclub_vs_polymarket_2026-10-19.json`: 2 crypto Up/Down slots and 3 NBA games, normalised books on both venues, snapshot at the fetch time.
- `defillama_protocol_2026-10-19.json`, `defillama_open_interest_summary_2026-10-19.json` (13 KB, daily series), `contracts_sourcify_2026-10-19.json`, `public_config_2026-10-19.json`, `guide_llms_2026-10-19.txt`, `guide_fee_page_2026-10-19.md`, `guide_dispute_page_2026-10-19.md`.

## Trade path

Programmatic trading **exists** (it is how the web app works) but is unsupported, undocumented and contractually forbidden for bots (see Geo/ToS). Shape, from the web client code (M-H: read from the shipped JS, not exercised):

1. Login: `GET /auth/nonce` -> sign a SIWE-style message with the wallet -> `POST /auth/verify {message, signature}` -> JWT (stored as `jwt`); or Privy social/embedded login (`/auth/privy`). A session-address mismatch check exists (`STALE_SESSION`).
2. Proxy wallet: first deposit creates a per-user proxy via the SafeProxyFactory; later calls like withdrawals and split/merge are authorised by an EIP-712 `Execute{target,value,dataHash,nonce}` signature under domain `GameClub ProxyWallet` v1 with `verifyingContract` = the user's proxy (H, bundle constants). Gasless deposits use `POST /deposits/gasless {amount, deadline, signature}`.
3. Order: EIP-712 `Order{maker, marketId, outcomeIndex, side(0 buy,1 sell), amount, price, nonce, deadline, orderType, salt}` under domain `GameClub Exchange` v1, chainId 56, verifyingContract `0x5a8A...258844a`; `maker` = proxy-wallet address (smart-account path sends `signature: "0x"` with `isSmartAccount: true`, M); then `POST /api/orders` with `Authorization: Bearer <jwt>` and the order fields; response has `status` (`FILLED`, `PARTIAL`, `CANCELLED`) and `fills[]`. Cancel: `DELETE /api/orders/{orderHash}` (optional `cancelAmount`). Order types include limit and IOC/market (H, bundle).
4. Collateral management: `split`/`merge` of USDT into outcome token pairs via `/split/markets/{id}` and `/merge/markets/{id}` (sponsored gas, one signature) (H, routes + UI text); `claim` via `/markets/{id}/claim`.

No SDK, no API key, no HMAC: auth is a wallet-signed JWT. No public developer programme: NOT FOUND (searched: site, guide, sitemap, announcements).

## PayBox reachability: **partial in principle, not worth it**

- Everything needs only an EVM key on BSC: `message` signing (login), `typedData` (orders, proxy `Execute`, deposit permits) and normal BSC transfers/approvals. PayBox's chain catalog includes BNB Smart Chain 56 and `request_wallet_sign` accepts `message`, `typedData`, `transaction` intents (local note `docs/research/06-paybox-platform.md`, H for the catalog, M for fit). A PayBox EVM wallet could therefore hold USDT on BSC, sign into the API, and sign Orders.
- Blockers: (a) JWT and session state must live in the adapter process, not PayBox; (b) the order and login POSTs were not exercised, so end-to-end behaviour (smart-account signature path, nonce rules, whether orders from a PayBox MPC wallet pass the `signerMismatch` check) is unverified; (c) the ToS forbids automation and US residents; (d) liquidity makes it pointless; (e) Solana-sourced funding path unknown.

## Fees

- Docs: "GameClub does not charge fees on most markets"; **only Crypto markets charge a taker fee**, formula `fee = shares x price x feeRate x (p x (1-p))^exponent`, effective rate peaks at **1.50% at p = 50%** and falls to zero at the extremes, rounded to 4 decimals (minimum 0.0001 USDT). Buy-side fees are collected **in shares**, sell-side fees in USDT. Makers pay nothing (H, https://guide.gameclub.com/trading/markdown.md; `guide_fee_page_2026-10-19.md`).
- Client code confirms a per-market fee config with two types, `flat` (`takerFeeBps`) and `parabolic` (`feeRate`, `exponent`), capped at 1.5% of notional, and previews fees only on BUY (H, bundle). Per-market `feeConfig` values were not visible in the public event payloads (NOT FOUND, searched: events, event detail).
- **Maker Rebates**: 20% of taker fees (`/rebate/config` -> `shareBps: 2000`), paid daily 16:00 UTC, minimum 0.01 USDT, "currently applies to eSports markets only" (H). The docs are internally inconsistent: fees are on crypto markets but the rebate pool is eSports-only.
- Conflicts to resolve before relying on any number: the Terms say fees are "a percentage of winnings" plus a flat withdrawal fee; the docs say no withdrawal fee and no fee on most trades (H, both). DefiLlama shows **0 USD fees all-time** for GameClub (series length 3 points, L) - either the collector wallet gets nothing or the adapter is incomplete.
- Gas: deposits/split/merge are gasless for the user (sponsored) per UI text and endpoints; the Terms still state BNB gas is required for BSC transactions (H, conflicting).

## Resolution mechanism and dispute risk

Four layers, documented inconsistently:

1. **Crypto Up/Down 5-minute** (`resolution_type: instant`): resolved automatically from a price feed for the `oracle_symbol` (BTCUSDT/ETHUSDT/BNBUSDT; `updown_start_price`, `updown_end_price`); the feed's identity (Binance spot or other) is not stated anywhere I found (M). Polymarket's same-slug markets resolve on a **Chainlink BTC/USD TWAP stream** (H, Polymarket `resolutionSource`). Different source and likely different price definition (TWAP vs a spot-style symbol): basis risk on any cross-venue pair, plus a possible start-price definition gap (one sampled GameClub start price was a round `82150.00`, M).
2. **Sports / esports** (`oracle_type: polymarket`): resolution is tied to the Polymarket market (shared `polymarket_condition_id`), so it inherits Polymarket's UMA-based outcome (M, inferred from field names, not a stated rule). `dispute_window: 86400`.
3. **User-created markets** (POINTS only today): a graduation path to USDT with **UMA Optimistic Oracle V3 assertions on Polygon**, finalised on BSC (`uma_assertion_id`, `uma_polygon_tx_hash`, `bsc_finalize_tx_hash` fields; Etherscan/Polygonscan/UMA links in the bundle) (H fields, M behaviour).
4. **Dispute contract on BSC**: `getProposal` returns `{outcomeIndex, proposer, proposedAt, disputeDeadline, status, disputer, disputeBond}`, `disputeOutcome(marketId)` needs a bond (H, bundle ABI).

What the official words say (H): the docs say disputes are decided by **GameClub token holders by majority vote**, within a 24 h window, with a **50/50 settlement on tie or low participation**, and "without reliance on any third-party protocol" (https://guide.gameclub.com/markets/interactive-blocks.md). The Terms say GameClub "acts as resolution administrator" and "resolution decisions are final and binding absent manifest error", and may void a market (refund net of fees). The code shows UMA. A GameClub token has not been seen (no token in DefiLlama, no address in bundle): NOT FOUND (searched: docs, bundle, DefiLlama). So the voter set, token and quorum are unspecified. Dispute and admin-discretion risk: **high**, and the 50/50 rule means a contested outcome pays neither side in full.

## Geo, ToS, automation

- Operator named in the Terms: "Definity Labs" (H, https://gameclub.com/terms rendered by `TermsOfService-Ci_HvkXi.js`). No KYC: "No KYC, no paperwork" (H, docs).
- US: "USE OF THE TECHNOLOGY FEATURES AND PROTOCOL IS NOT AVAILABLE TO RESIDENTS OR NATIONALS OF THE UNITED STATES OF AMERICA. GameClub enforces this restriction through IP-based geo-blocking. Circumventing this restriction through the use of a VPN, proxy, or any other means is a material breach" (H). Also barred: any jurisdiction where prediction markets or crypto products are prohibited, OFAC/UN/EU/UK sanctioned places, and any other jurisdiction GameClub designates.
- Automation: the prohibited-conduct list includes "Use bots, scripts, automated tools, or other non-human means to interact with any Interface without GameClub's express prior written consent" (H). It also bans wash trading, spoofing, front-running, multiple accounts, and reverse-engineering "any Interface" (note: this note's endpoint list comes from reading the public JS). This applies to trading; whether keyless GETs by a scanner count as "interacting with an Interface" is unclear. Contact for consent: NOT FOUND (searched: terms, docs, site).
- Binding arbitration and class waiver are in the Terms (H).

## Liquidity

- Open interest: **218 USD on 2026-10-18** (329 on 10-17, 260 on 10-16, 68 on 10-14), all-time peak 435 USD (2026-10-02); monthly average of the daily series: Apr 24, May 30, Jun 173, Jul 113, Aug 142, Sep 123, Oct 1-18 225 USD (H, DefiLlama `/summary/open-interest/gameclub`). The `total30d` / `total1y` figures there are sums of daily balances, not volume.
- Trading volume: no reliable source. Every USDT market in the API is at 0. DefiLlama has no volume adapter for GameClub. The only large numbers (108K, 107K, 20K "total_volume") are constants and should be ignored (H).
- Book depth snapshot (H, fetched 2026-10-19 00:3x UTC): NBA Celtics-Pistons GameClub bid 0.50 / ask 0.53, 116 / 123 shares (about 5.8 / 6.5 USDT at the touch), 18.6 / 22.4 USDT across six levels; Polymarket same token bid 0.51 / ask 0.52 with roughly 66K bid-side / 592K ask-side USD of full-book notional. Thunder-Spurs: GameClub 0.43/0.46 vs Polymarket 0.44/0.45. 76ers-Knicks: 0.36/0.39 vs 0.37/0.38 (all normalised by 0.1).
- Leaderboard returns `[]`; no user counts published: NOT FOUND (searched: API, site, docs).

## Event categories that overlap other venues (where arbitrage could exist)

| GameClub | Overlaps | Independent? | Notes |
|---|---|---|---|
| NBA, MLB, UFC, UCL soccer moneylines (Sports) | Polymarket (exact markets, explicit ids) | **No**, quotes derive from the Polymarket mid | wider than Polymarket, dust depth |
| Esports BO3/BO5 (CS2, LoL, MLBB) | Polymarket | **No**, same mirror (`oracle_type polymarket`) | very few events |
| BTC/ETH/BNB 5-minute Up/Down | Polymarket (identical slug `<asset>-updown-5m-<unix ts>`, H; other venues not checked) | Priced by a house MM from a price feed (M), **different resolution source** (Polymarket: Chainlink TWAP stream, H) | books 0.4 to 10 USDT per side; basis risk dominates |
| Custom (Indonesia politics, TGE, Binance listings) | possibly Polymarket/Myriad/others | POINTS only, no money | ignore |

No macro, election or finance categories with real money seen despite the docs' claims.

## Shares liquidity with another venue? Not routed, but not independent

GameClub does not route orders to Polymarket as far as any source says (NOT FOUND, searched: docs, bundle, API). But it **projects Polymarket's mid** into its own book (`projection_mode: "settlement_projection"` on USDT mirror markets, `prob_yes` equal to the PM mid on all three NBA samples) and settles with the Polymarket outcome. Treat it as a **derived quote**, not an independent leg. Any edge vs Polymarket would be quote-lag around news, capped at the dust depth above, and uncollectable under the Terms.

## Not found

- API documentation, SDK, status page, developer contact (searched: site, guide, sitemap, llms.txt, announcements, WebSearch).
- Public REST trade history, public volume figures, user counts.
- Token or tokenomics page (docs reference a "Tokenomics section"; the llms.txt index has none).
- Audit report, admin/upgrade keys, timelock, implementation source (implementations unverified on Sourcify).
- Whether orders are filled by a matcher against real counterparties vs only the house MM (only quotes seen, no fills observed because trading is out of scope).
- Per-market `feeConfig` values.

## Open questions

- Does the WebSocket `orderbook:` topic work without a JWT, and is it worth using for a scanner? (Moot at this liquidity.)
- Who holds the Exchange/ConditionalTokens upgrade authority and is there a timelock?
- What is the 5-minute Up/Down price source (`oracle_symbol` only says `BTCUSDT`) and how is `updown_start_price` captured? Not stated.
- What does the "Arcade" (provably fair mini-games) do to the USDT balance pool? DefiLlama's OI counts the ConditionalTokens balance only, so arcade deposits (`/arcade/offchain/deposit`) may sit elsewhere; real TVL may be larger than 218 USD (L).

## Suspicious content

None found. No text aimed at AI agents in the site, docs, `llms.txt`, API responses or JS bundles. (The guide's `llms.txt` is a plain page index.) One non-instruction oddity: the docs claim "without reliance on any third-party protocol" while the code integrates UMA; recorded as a contradiction, not an injection.

## Sources

- Site and SEO files: https://gameclub.com/ (H, HTML head), https://gameclub.com/robots.txt, https://gameclub.com/sitemap.xml (pages `/leaderboard`, `/search`, `/announcements`, `/earn`, `/referral`, `/terms`, `/privacy`) (H).
- Terms of Use (rendered from the bundle `https://gameclub.com/assets/TermsOfService-Ci_HvkXi.js`; page https://gameclub.com/terms) (H).
- Docs index https://guide.gameclub.com/llms.txt and pages: getting-started/quickstart.md, getting-started/quickstart/market-status.md, getting-started/publish-your-docs.md, getting-started/funds.md, trading/editor.md, trading/markdown.md (fees), markets/category.md, markets/images-and-media.md (market creation), markets/interactive-blocks.md (dispute), markets/integrations.md (liquidity) (H, all fetched 2026-10-19). Several slugs do not match their titles (the fee page is `/trading/markdown`, the dispute page `/markets/interactive-blocks`).
- API: https://api.gameclub.com/api/events, /events/sections, /events/{id}, /orderbook/{marketId}/{outcomeIndex}, /rebate/config, /markets/graduation-config, /config/login-methods, /announcements (H, live GETs 2026-10-19). Route list, EIP-712 types and WS topics: from static text of `https://gameclub.com/assets/index-kva0EnJq.js`, `EventPage-BOySm2Wx.js`, `MatchupStatsPanel-C5bO7NzB.js`, `Portfolio-CSzmRoa3.js` (M-H: shipped code, not behaviour).
- DefiLlama: https://defillama.com/protocol/gameclub (HTTP 403 to WebFetch, so read through) https://api.llama.fi/protocol/gameclub, https://api.llama.fi/summary/fees/gameclub, https://api.llama.fi/summary/open-interest/gameclub (H). Adapters: https://github.com/DefiLlama/dimension-adapters/blob/master/fees/gameclub.ts and open-interest/gameclub.ts (H, read via `gh api` raw) - source of contract addresses.
- Sourcify: https://sourcify.dev/server/v2/contract/56/0xE6D3a683bEB3fB92A4F2DB53d642Af331bfbbfb3 (and the factory, exchange and resolution addresses) (H).
- Polymarket cross-checks (public GETs, not part of this venue): https://clob.polymarket.com/book?token_id=<GameClub's mirrored token id>, https://gamma-api.polymarket.com/events?slug=btc-updown-5m-1792369800 and `nba-bos-det-2026-10-20` (H).
- BNB Chain DappBay directory, appeared in WebSearch results only (M): https://dappbay.bnbchain.org/category
- Local: `docs/research/06-paybox-platform.md` (PayBox chain catalog, `request_wallet_sign` intents) (M), `docs/research/venues/probable.md` and `predictex.md` (comparison of PayBox reachability wording).
