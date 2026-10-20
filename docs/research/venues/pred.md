# PRED (pred.app) - venue spec

Researched 2026-10-19. Read-only: public pages and docs `.md` mirrors, unauthenticated GETs to `www.pred.app` public endpoints, the site's public JS bundle (static text), GitHub org `pred-org` via `gh api` raw reads, DefiLlama public API, Sourcify public API. No accounts, no wallet connection, no POST, no signing, no PayBox tools called. Generic User-Agent only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale. Fixtures: `docs/research/fixtures/pred/`.

## Verdict

- Adapter priority: **P2**. Build a cheap **read-only** adapter (fully keyless, well documented); do not plan on PRED as an executable arbitrage leg yet.
- Why not higher: (1) thin: DefiLlama 24h volume 112K USD, 30d 861K USD, TVL 105K USD (H); (2) **its quotes track Polymarket**: on all 11 overlapping fixtures sampled, PRED mid was within about 0.5 cent of Polymarket mid on 10 of 11 (largest gap 0.95 cent), and exact on the two NBA and the NFL games (M, one snapshot), so it is a price-follower, not an independent price signal; (3) trading needs a PRED-issued partner key (or an eligible pre-existing account), per-order EIP-712 signatures, and a ToS that bars restricted jurisdictions, VPNs and "automated processes ... under any false ... pretext" (H); (4) sports only.
- Why not skip: venue is live and shipping, read API is better than most (keyless discovery + orderbooks, OpenAPI-style docs), 0% maker fee, resting liquidity of a few thousand USD per side on marquee fixtures (H), and it is a Polymarket-CTF-fork on Base, so a Polymarket-style adapter is mostly reusable.

## Liveness (still live in 2026?) - YES

- `https://www.pred.app/` returns 200 with live fixtures dated 2026-10-19 to 2026-10-25 (H). Discovery feed: 3,230 parent markets, 3,610 active child markets, 16 fixtures flagged `is_live` at fetch time (H, `fixtures/pred/discover_feed_stats_2026-10-19.json`).
- Private beta already live by 2026-02-17 (HackerNoon) and DefiLlama volume starts 2026-02-11; news.bitcoin.com says an eight-week beta (claimed 5M USD notional) preceded the **public launch on 2026-06-04**. The two accounts do not reconcile on beta length; company-supplied figures (M). Seed round 2.5M USD led by Accel, with Base Ecosystem Fund (Coinbase Ventures) and Reverie, reported 2026-02-17 (HackerNoon, likely paid placement; 8 months old, so stale and promotional, L/M).
- DefiLlama: listed 2026-05-21 (`listedAt` 1779382887), volume adapter starts 2026-02-05, daily volume points through 2026-10-18 (H). Monthly volume (DefiLlama, H): Feb 4K, Mar 66K, Apr 643K, May 878K, **Jun 3.11M, Jul 2.21M** (World Cup), Aug 915K, Sep 660K, Oct 1-18 697K. Last 8 days rising (NFL + UCL weeks): 18K (Oct 10) to 160K (Oct 16), 112K (Oct 18).
- Docs are current: embedded OpenAPI v1.2.0; examples dated Sep 2026; a legacy WebSocket channel retired 2026-07-20 (H).
- Predictefy (hosted aggregator) **darked its PRED execution lane on 2026-08-13** because "the venue confirmed that Predictefy platform-key submissions for caller-owned Safes are refused" (https://docs.predictefy.com/llms-full.txt, H on what the page says). AGG (docs.agg.market venues table) lists PRED as trading-enabled but "off by default", managed balance, USDC on Base, limit orders supported (H). So integrations exist but are bilateral, not open.

## Kind and market model

- Kind: **onchain-clob, hybrid**. Off-chain operator matching, on-chain non-custodial settlement. `pred-org/ctf-exchange` README: "hybrid-decentralized exchange model wherein there is an operator that provides offchain matching services while settlement happens on-chain" (H). Exchange source gates `fillOrder`, `fillOrders`, `matchOrders` with `onlyOperator` and has `pauseTrading` (admin) (H, `src/exchange/CTFExchange.sol`). **There is no permissionless on-chain path to fill or place an order**; the only way in is PRED's API.
- Code lineage: Polymarket CTF Exchange / NegRisk adapter fork (DefiLlama's PRED volume adapter reuses `getPolymarketVolume`, H). Outcome tokens are Gnosis Conditional Tokens (ERC-1155), collateral USDC, 6 decimals.
- Outcomes: every child market is a **binary YES/NO** (docs call them LONG/SHORT; intent 0 = LONG, 1 = SHORT). Price 0 to 1 USDC, API in **cents** of the YES side (H, API docs). Multi-outcome events (soccer 1X2 moneyline: home/draw/away) are **3 binary children under one parent**, settled via the **NegRisk exchange** (`0x90B0...f07C`) with a cross-matching adapter that synthesises liquidity across sibling children; two-way markets (NFL/NBA moneyline, spreads, totals, BTTS) use the plain CTF exchange (`0x03C6...4a27`) (H, discovery `contract_type`). Orderbooks "may include synthetic levels" from sibling children (H, Orders docs).
- Families in the live feed (parents): spreads 1,316; totals 941; team_totals 486; moneyline 146; generic (futures/champion) 142; btts 110; first_half_moneyline 41; first_goal 41; player_points 7 (H, fixture stats). `virtual_markets` exposes synthetic complements such as "Coventry or Draw" (H, `parent_epl_tot_cov`).
- Parent/child ids: `parent_market_id` (bytes32) groups children; `market_id` (bytes32) is the child and doubles as the signed `questionId`; `type_reference_id` (UUID) is the realtime channel key; `reverse_ob` flag exists on children (meaning undocumented, L).
- Curated, not permissionless: "PRED does not allow users to create or list their own markets" (docs, H).
- tick_size field is "0.01" (units undocumented); books show 0.1 to 0.2 cent steps (H shape, L meaning).

## Chains and collateral

- **Base (chain id 8453) only**; collateral **native USDC** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; only native USDC on Base is a supported deposit asset (H, API Overview). Fiat on-ramp and a Fun.xyz-style "transfer crypto" widget exist; "Deposit USDC on Ethereum ... will automatically bridge" per a Deposit page that also contains copy-pasted Polymarket text (docs sloppy, L).
- Account model: each user trades from their own **Gnosis Safe proxy wallet** (deposit address = the Safe, not the EOA); the EOA is the Safe owner and signs. Safe factory `0xA077e7aaBF2e3c0155F83789e95f46602D03F7f0` (Sourcify exact match, verified 2026-02-17, H). Trading requires one-time Safe approvals (ERC-20 `approve` and ERC-1155 `setApprovalForAll`) signed as a SafeTx (H).
- Contracts (DefiLlama dimension adapter, H): CTF Exchange `0x03C6c6fbdc0c719Dc878fCe24deBaBC31B2B4a27` (Sourcify-verified `CTFExchange`, verified 2026-08-20, deployed at block 49,475,380 which I estimate as early Aug 2026 from Base block time (M), reported by Sourcify as behind a Safe-style proxy), NegRisk CTF Exchange `0x90B036c618196634200F0323c420C50CdBBCf07C` (not on Sourcify, L), cross-matching adapter `0xd3460060A8363C24babC411a11444d5d985342EF`, plus three legacy NegRisk exchange + adapter pairs. **At least four NegRisk exchange generations since Feb 2026** (one latest, three legacy): expect redeploys, so read `contract_address` from discovery per parent, never hard-code.

## Read API (official, public for market data) - keyless for the parts that matter

- Docs: https://pred-1.gitbook.io/pred-docs/documentation/api-reference/overview (all pages have `.md` mirrors; index at `/llms.txt`). OpenAPI snippets embedded per page. Base URL `https://www.pred.app` (public) and `https://www.pred.app/clob` (partner trading). (H)
- Public, **no auth** (H, confirmed with live GETs):
  - `GET /api/v1/market-discovery/discover?verbose=true&limit=50&offset=0&omit_inactive_with_redeemed_on_before=<RFC3339 now>`: paginated parents + fixture + children, with `ltp`, `mid_price`, `volume` per child, `fee_rate_bps`, `contract_address`, rules text. Filters: `family`, `parent_market_type`, `league_id`, `cname`, `start_time`/`end_time`, `order`, `scope=leagues`. No "active only" filter: filter client-side on `status=="active"` and keep paging until `data.total`. `verbose=true` is required for trading fields. Full crawl = 65 pages of 50 (about 13 MB); 2 of 65 returned `503 SERVICE_UNAVAILABLE "Discovery is busy; retry shortly"` and succeeded on retry.
  - `GET /api/v1/market-discovery/parents/{parentMarketID}` (and `/parents` by child id): parent detail incl. `virtual_markets`; does not carry live volume/mid (they were 0 in the sample).
  - `GET /api/v1/order/{parentMarketID}/orderbook/{marketID}?depth=1..100(default 20)&include_metadata=true`: `bids[]`, `asks[]` with `price` (cents), `quantity` (shares), `order_count`, `total_usd`, plus `sequence_number`, `last_updated_at`, `metadata{spread,mid_price,last_calculated}`. `asks` are listed worst-first; semantics of `total_usd` are inconsistent (cumulative from best on asks, not on bids): compute `price*quantity/100` yourself. `sequence_number` was 1 on all three samples while `last_calculated` was up to ~1 h old, so do not use it as a freshness signal (M).
- Rate limits: docs say avoid more than ~10 discovery requests per second (H); orderbook responses carry `x-ratelimit-limit: 20` with a ~1 s reset (M, observed). 429 + `Retry-After` documented for CLOB.
- **Public trades feed: NOT FOUND** (searched: all 11 API pages, route list in the JS bundle). Trade history is per-user L2/JWT only. Public trades can be reconstructed from `OrderFilled` logs on the exchanges (M, standard for this fork).
- **WebSocket**: Ably. Channel `market:{type_reference_id}`, event `orderbook`, ~100 ms debounced full snapshots per child, monotonic `sequence_number`. Token via `POST /api/v1/auth/ably` which needs a Bearer JWT from `login-with-signature`, which needs an `X-API-Key` that PRED issues on request. So **realtime is not keyless**; poll REST for a scanner. (H docs; I did not call it.) CLOB/partner L2 credentials cannot get an Ably token (H).
- Browser access needs CORS approval from PRED; server-side use is fine (H).
- Go SDK referenced by docs: NOT FOUND (searched: `pred-org` repo list; only contracts and DefiLlama forks are public).

### Fixtures (all unauthenticated GETs, 2026-10-19)

- `discover_limit3_2026-10-19.json` (14 KB): first 3 parents with `verbose=true`.
- `parent_epl_tot_cov_2026-10-19.json`, `orderbook_epl_tot_cov_spurs_2026-10-19.json`, `orderbook_ucl_psg_bar_psg_2026-10-19.json`, `orderbook_nba_bos_det_pistons_2026-10-19.json`.
- `discover_feed_stats_2026-10-19.json` (counts from the full crawl), `xcheck_pred_vs_polymarket_2026-10-19.json` (11 fixtures), `defillama_pred_summary_2026-10-19.json`, `pred_docs_llms_2026-10-19.txt`.

## Trade path

- Programmatic trading **exists but is gated**. Two flavours (H, Overview + Builder/Aggregator pages):
  1. **Aggregator/partner CLOB** (`/clob/...`): a partner key (`X-Aggregator-API-Key`, "request from PRED", lifetime account-creation limit per key) is needed only to create a *new* user; an **existing eligible user** can derive L2 credentials with just an L1 signature (the signing EOA must be the account's primary wallet). L1 = EIP-712 `ClobAuth` (domain `ClobAuthDomain`/`1`/8453, message "This message attests that I control the given wallet"). L2 = per-user `PRED_API_KEY`/`PRED_PASSPHRASE` + HMAC-SHA256 over `timestamp+method+path+body` (30 s clock window). Account setup steps: `activate-user` (a referral code may be required), `create-proxy-wallet` (user signs `CreateProxy` typed data), `safe-approval/prepare` + `execute` (user signs SafeTx). Then fund the Safe with USDC on Base.
  2. **Ordinary JWT**: `POST /api/v1/auth/login-with-signature` with a PRED-issued `X-API-Key`; same order format.
- Per-order authorisation: **EIP-712 `Order` signed by the EOA** (domain `Pred CTF Exchange`/`1`/8453/`parent_market_data.contract_address`; fields salt, maker = Safe, signer = EOA, taker = 0, price/quantity at 1e6 scale, expiration (0 = GTC), nonce 0, questionId = child `market_id`, feeRateBps, intent 0/1, signatureType 2). `feeRateBps` must equal the *signed* rate `floor(targetBps * max(p,1-p))`, not the discovery target. Order types: limit, market, IOC; reduce-only, GTC, custom expiry. Opening notional >= 0.90 USD; quantity <= 3 decimals. Cancel (single, bulk, all-per-parent) needs L2 only. Orders in live matches carry a **3 second delay** (docs). Retry/idempotency semantics are explicitly "confirm with PRED" (H).
- Not in the CLOB API: withdrawals (JWT `cashflow/withdraw/relay` only; the user owns the Safe so can always move USDC on-chain, M), earnings, per-parent realtime open orders, Ably.

## PayBox reachability: **partial**

- Signing side is compatible: every signature is a plain EOA EIP-712 / raw secp256k1 over a digest (ClobAuth, CreateProxy, SafeTx, Order); none needs ERC-1271 or a smart-account wrapper (unlike XO). PayBox `request_wallet_sign` supports `typedData` and `raw` on EVM wallets, with no chain allowlist found in docs (repo notes `docs/research/06`, M). One shared EVM address works on Base. Funding: a USDC transfer on Base to the Safe is an ordinary PayBox transfer. A plugin cannot hold the L2 secret across stateless calls or obtain signatures itself; the workable shape is agent-orchestrated prepare -> `request_wallet_sign` -> submit (repo notes, M), with the HMAC secret kept in an owner-run backend or `request_secret`.
- Blockers that are not technical: (a) a PRED partner key or an already-onboarded account whose primary wallet is the PayBox EOA (onboarding is Privy/WalletConnect-based; whether PayBox's wallet can complete it is unknown); (b) PRED refused Predictefy's shared platform key (above), so a hosted shared-key model is unlikely to be accepted; (c) geo/ToS. Not testable read-only.
- Transaction proposals are almost irrelevant: only the Safe creation/approvals and USDC deposit are on-chain actions; trading itself is off-chain signed orders, so no proposal-based path exists (and PRED's operator is the only entity that can submit fills).

## Fees (taker only)

- Formula (docs "Fees (Launching Soon)", H): `fee = 0.025 * shares * price * (1 - price)`; takers only; **makers 0%**; no fee to place/cancel; nothing at redemption; rounded down to 6 decimals. As a share of spend: `2.5% * (1 - price)` (1.25% at 50c, 0.25% at 90c). Buys pay the fee in shares, sells in USDC. The API's signed rate `floor(target_bps * max(p,1-p))` reproduces the same formula (H, Orders docs). Referral banner: referrers "get 40% of every fee they pay" (home page, H).
- Discovery `fee_rate_bps`: **250 on 3,050 parents, 0 on 180 parents (all NBA, including NBA futures; 2 other NBA parents are at 250)** (H, full crawl). So NBA is currently fee-free and everything else is at the 2.5% curve. The docs page title says "Launching Soon" but DefiLlama shows fees recorded since **2026-09-22** (24h 466 USD, 30d 3,637 USD, all-time 4,103 USD; H), so fees are live (M).
- Arb implication: on a 64c outcome the taker fee is about 0.58c per share (0.9% of spend) before the 0.4c spread; PRED as maker is free. A maker leg on PRED against a taker leg elsewhere is the only plausible low-cost shape.
- "Liquidity & MM Rewards: Coming soon" (docs). Fees "partly" fund liquidity rewards (docs).

## Resolution and dispute risk: HIGH centralisation

- Docs: "PRED fetches verified results from our sports data oracles and analytics partners ... blending fast Web2 verification with Web3 oracle", resolution "in minutes" (H, docs).
- Contract repo `pred-org/uma-ctf-adapter` (name is a leftover): README says markets resolve "via PRED's centralised Oracle"; `src/TrustedCtfAdapter.sol` is an `AccessControl` adapter with `resolveWithIndex`, `resolveInvalid` and `resolveWithVector` (custom payout vector), added Sep 2025 (H, source). The repo also still contains Polymarket's UMA adapter with admin `flag/pause/emergencyResolve` (H). **Which adapter is deployed on Base for the live markets is not verified** (no explorer access; Cloudflare blocked Blockscout). ToS 3.2 says the mechanism "may include a decentralized oracle system (such as UMA) or other ... data feeds" and that the Company is not the oracle (H); treat that as boilerplate that conflicts with the README (M).
- No permissionless dispute path found. Resolution source per rules text: official statistics of the governing body, with a consensus-of-reporting fallback if no final stats within 2 hours; later score revisions ignored (H, `rules` field).
- **Void/cancel rules are inconsistent by family** (H, rules text): team-total sample "canceled entirely ... resolves to 50-50"; 1X2 sample "canceled ... resolves to 'No'"; double-chance virtual market "canceled ... resolves to 'Yes'". Postponed = stay open until played. Settlement window is 90 minutes plus stoppage, same as most soccer venues but confirm per rule text before pairing legs. A NegRisk 1X2 where every child resolves "No" on cancellation contradicts NegRisk's own constraint (repo README), so the real cancellation payout is unclear (L).
- Contracts: admin can `pauseTrading` on the exchange (H); exchange is behind a proxy per Sourcify (M). No audit link found (searched: docs, repos, DefiLlama `audits: 0`).

## Geo / ToS / automation

- Restricted Jurisdictions (ToS 8.3(e), text read from the site's own bundle, H): comprehensively sanctioned places (Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk) **plus the United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, Taiwan**. The in-app trade confirmation also says "not located in the United States, India, Singapore, or any other restricted jurisdiction", and the Deposit doc says "geoblocked in USA & India" (H). Predictefy's list matches ToS (H).
- Enforcement: the app calls `GET /api/v1/user/maintainance` and shows "Restricted Region" on HTTP 403 (H, bundle); a 200 came back to this session's scripted read, which says nothing about trading eligibility. VPN or anonymisation tools are "strictly prohibited" and violators' wallets can be put in close-only mode (H). KYC/AML document requests are reserved (H).
- Automation (ToS, quote sparingly, H): forbids scrapers/robots "to harvest or index any portion of the App's content", and forbids using the App "by means of automated processes or under any false, deceptive, or fraudulent pretext"; also bans wash trading, spoofing, cornering and "abusive" trading in the company's judgement. The public API is documented as "no auth required" and the docs address "market-maker style clients" and aggregators, so keyed API use is evidently intended (M). Governing law Panama, binding arbitration, class waiver (H).
- Operator: no legal entity named on the pages read (the ToS says "the Company"); CEO named in press as Amit Mahensaria (M).

## Liquidity (sources and dates)

- DefiLlama, fetched 2026-10-19 (last full day 2026-10-18), H: volume 24h 112,457 USD, 7d 476,363, 30d 861,102, all-time 9,182,356; TVL 105,035 (point 2026-10-19), 133,078 (2026-10-18); open interest not tracked. Peak was the June-July World Cup window.
- Discovery feed, 2026-10-19 (H): cumulative `volume` across the 3,230 parents = 923,740 USD (parents not yet redeemed), only **164 parents have any volume**. One outlier, `mls-chi-vs-vwh-2026-10-07` spreads at 200,901 USD (about 22% of the sum, unexplained, possibly one whale or wash; L). Moneyline cumulative volumes for next-day marquee fixtures are tens to low thousands of USD per child (Pistons 163, Spurs 55, PSG 36, Porto 1,744).
- Resting depth (3 books sampled, notional = price*qty): EPL Spurs-Coventry best bid 1.3K USD / best ask 3.1K USD, within 2c 2.9K / 7.7K; UCL PSG-Barcelona touch 0.65K / 0.87K, within 2c 2.7K / 3.2K; NBA Pistons-Celtics touch 1.3K bid / ask of 1 USD, within 2c 1.9K / 1.8K. Spreads 0.3 to 0.4 cent (Polymarket's same books: 1 cent). So **resting depth is real but a few thousand USD; traded volume is far below depth**, consistent with market makers parked on the book (M).
- Press claims (spreads under 2%, 200 ms execution) are company figures (M).

## Event categories and overlap (where arbitrage could exist)

- Categories (H, full crawl, parents): NFL 658, UEFA Champions League 518, La Liga 381, EPL 338, MLS 288, UEL 288, Liga MX 232, NBA 182, Primeira Liga 100, Super Lig 81, Brasileirao 71, Serie A 44, EFL Championship 12, F1 10, Bundesliga 9, Ligue 1 9, Awards 9 (Ballon d'Or). Futures: league/conference/Super Bowl/NBA champion, F1 champion, Ballon d'Or, MLS Cup, UCL winner (16 events).
- **No politics, crypto-price, macro or weather markets.** Overlap is sports only: Polymarket (verified on 11 of 38 sampled upcoming moneyline fixtures at guessed slugs), Kalshi, SX Bet, Overtime, Limitless/Predict.fun where they list sports. Soccer 1X2 = 3-outcome; NFL/NBA moneyline = 2-outcome.
- Cross-venue test (M, one snapshot 2026-10-19 ~00:20 UTC; `xcheck_pred_vs_polymarket_2026-10-19.json`): PRED mid vs Polymarket mid, cents: Spurs 64.4 vs 64.5; Draw 20.4 vs 20.5; Coventry 15.4 vs 15.5; Liverpool 64.6 vs 64.5; Roma 83.4 vs 83.5; Bayern 46.4 vs 46.5; Real Madrid 77.0 vs 77.5; Porto 58.75 vs 58.5; Wizards 64.5 vs 64.5; Heat 51.5 vs 51.5; 49ers 78.5 vs 78.5. Largest gap 0.95c (PSV 20.45 vs 19.5; Polymarket outcomePrices are indicative and summed to 98.5 on that event), and the match holds even where Polymarket's event volume is only 285 USD (Lille-Galatasaray). Net of the 0.4c spread and a 0.6c taker fee this is no edge; any edge appears only around news/live moves.

## Shared liquidity

- PRED has **its own order book and exchange contracts on Base**; it does not route to another venue's book. AGG and (formerly) Predictefy are front ends for it, not shared liquidity (H). But **price discovery is not independent**: quotes follow Polymarket's mid (M). Treat PRED as a *dependent* leg: useful for maker rebate capture or live-event lag, not for static cross-venue mispricing.

## Open questions

- Which resolution adapter (Trusted vs UMA) is deployed on Base, and who holds the resolver role. Needs an explorer or an RPC `eth_call`.
- Whether a partner key is obtainable by us, on what terms, and whether Thailand/US-style jurisdiction rules apply to API users the same way.
- Whether PayBox's EVM wallet can be the "primary wallet" of a PRED account (Privy/WalletConnect onboarding), or whether partner-key account creation is the only route.
- Full cancel/void payout for NegRisk 1X2 markets; what `reverse_ob` and `virtual_markets` mean for book math.
- Real maker identities behind the Polymarket-mirrored quotes; whether MM rewards (coming soon) change the depth.
- Whether the 200,901 USD MLS spreads volume is real flow.

## Sources

- H https://www.pred.app/ (home HTML, fixtures list, footer, Discord/Telegram/X links; docs link `pred-1.gitbook.io/pred-docs`)
- H https://pred-1.gitbook.io/pred-docs/llms.txt and `.md` mirrors of: readme, background, core-concepts, signup, your-first-trade, deposit, withdraw, markets/*, trading/order-book, order-types, yes-and-no, cashout, fees-launching-soon, liquidity-and-mm-rewards, shares, and documentation/api-reference/{overview, market-discovery, authentication, builder-and-aggregator-onboarding, trading-enablement, orders, portfolio, cashflow, websocket-ably, models}
- H live GETs: `https://www.pred.app/api/v1/market-discovery/discover`, `/parents/{id}`, `/api/v1/order/{parent}/orderbook/{market}` (2026-10-19), plus one GET of the site's own `/api/v1/user/maintainance` status endpoint
- H https://mainnet-assets.pred.app/assets/index-DbFqvROu.js and lazy chunk `index-C2wFfDeV.js` (client-side Terms of Use text, restricted-region logic, API route list)
- H https://github.com/pred-org (ctf-exchange, neg-risk-ctf-adapter, uma-ctf-adapter incl. TrustedCtfAdapter.sol, proxy-factories, exchange-fee-module, conditional-tokens-contracts)
- H https://api.llama.fi/protocol/pred, `/summary/dexs/pred`, `/summary/fees/pred`; adapter https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/pred/index.ts
- H https://sourcify.dev/server/v2/contract/8453/{0x03C6..., 0xA077..., 0x90B0...} (first two verified, third 404)
- H https://docs.predictefy.com/llms-full.txt (PRED darked 2026-08-13; restricted list)
- H https://docs.agg.market/venues/overview (PRED row: off by default, managed balance, limit orders)
- H https://gamma-api.polymarket.com/events?slug=... (price spot-check only)
- M https://news.bitcoin.com/pred-opens-to-public-as-5m-beta-volume-fuels-world-cup-sports-trading-push/ (2026-06-04, company-supplied figures)
- M/L https://hackernoon.com/pred-raises-$25m-from-accel-and-coinbase-ventures-to-challenge-the-$112-billion-sportsbook-industry (2026-02-17, likely paid placement; stale)
- M repo notes: `docs/research/06-paybox-platform.md`, `04`, `05`, `09-venues-onchain-clob.md`, `14-platform-of-platforms.md`
- NOT FOUND (searched: gitbook index and all 11 API pages, JS route list, `pred-org` repo list): public trades endpoint, keyless WebSocket, public SDK, audit report, named legal entity, rate-limit table for orderbook, official fee page dated after the "Launching Soon" title.
- Blocked: Blockscout/Basescan (Cloudflare challenge, not bypassed).
