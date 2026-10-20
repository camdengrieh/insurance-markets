# Triad (discovery entry `triad`, app.triadfi.co) = Triad Markets (triadmarkets.app), Solana

Researched 2026-10-19. Read-only: public unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`), WebFetch of the official site and docs, npm/unpkg files read as text (nothing installed or executed), `gh api` on the org profile. No account, wallet, key, signing, POST or payment; no PayBox tool called. Tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale.

## Verdict (read this first)

- **Duplicate of an existing entry.** `triadfi.co` and `docs.triadfi.co` both HTTP-redirect (307/308) to `www.triadmarkets.app` / `docs.triadmarkets.app` (H, curl 2026-10-19). CoinGecko lists homepage `triadmarkets.app` and whitepaper `docs.triadfi.co` for the same project (H). A directory (predictionmarket.tools/tools/triad) lists website `https://triadfi.co`, chain Solana, "Solana-based prediction market with CLOB order book and fast settlement" (H). So this is the same venue as `docs/research/venues/triad-markets.md` (written earlier today by another run). **Merge the two discovery rows; build at most one adapter.** This note re-verified the earlier note's headline numbers independently and adds the items marked NEW below.
- **Live, but tiny. adapter_priority = P2 (signal-only / thin).** 108 open markets in 20 pools; about 68k USD cumulative volume on the 107 listed USDC markets; about 3.6k USD of resting Yes-side depth, **96% from one wallet** (likely the house market maker, M); no single book holds 100 USD of notional; 5% taker fee on entry; admin-set resolution; Solana-only (no EVM leg). Value is as a Brazil/LatAm retail-sentiment signal, not an execution leg.
- **Hint items NOT confirmed**: `app.triadfi.co` does not resolve (H, curl: "Could not resolve host"); `api.triadfi.co` also does not resolve (H). The "15-minute Pyth-settled crypto markets" exist in the docs but are **not live** now (Fast Markets page shows "Wait For new Markets"; `/api/market?category=fast` returns `[]`, H). "AI-agent commentators": **NOT FOUND** (searched: homepage and docs via WebFetch, all 50 homepage JS chunks grepped for "commentator|ai agent|ai-agent", docs nav; the docs say "Agents: not mentioned"). "$2.6M cumulative volume (press release)": **NOT FOUND / unverified** (WebSearch session budget exhausted; solanacompass.com returned HTTP 403 to WebFetch; no lifetime volume endpoint exists). MadeOnSol "healthy Sept 2026": WebFetch of madeonsol.com home found no Triad entry; not verified.

## Is it still live? (2026-10-19)

| Signal | Value | Tag |
|---|---|---|
| `GET https://beta.triadmarkets.app/api/stats` | `{"tokensStaked":3533097.68,"users":40589,"markets":558,"price":0.0001008}` (40,588 users earlier the same day, so users are still registering) | H |
| `GET /api/market` + category lists | 20 pools, 108 markets, none resolved, 3 past `marketEnd` and unresolved | H |
| Fast Markets | docs describe 15-minute BTC/ETH/SOL rounds; site shows "Wait For new Markets"; API list empty; 0 markets with `isFast` | H |
| Site `https://www.triadmarkets.app/` | categories Explore, Crypto, Sports, ESports, Politics, Social, Fast Markets; a "DFlow - Waitlist" link; fee widget "Total Fee Distribution $0.00" | H |
| npm `@triadxyz/triad-protocol` | 409 versions, latest 4.4.4 published 2026-06-17 (4 months ago) | H |
| GitHub org `triadxyz` | 2 repos (`docs` pushed 2026-03-28, `PWP` 2025-08-02); org updated 2026-07-03; **no source for the program or SDK** | H |
| CoinGecko `triad-2` ($TRIAD) | price 0.0001027 USD, market cap 45.6k USD, 24h volume 96.74 USD | H |
| DefiLlama `/protocols` | no entry containing "triad" (name, slug or url) | H (absence) |
| Directory listing | predictionmarket.tools: "Listed by Feb 25, 2026", "current features and pricing have not been verified" | H (that it says so) |

Conclusion: operating, small, slow-moving. On-chain program existence/upgrade authority NOT verified (needs a JSON-RPC POST, forbidden here).

## Kind and market model

- **Kind**: Solana on-chain prediction market run by TRIAD MARKETS LIMITED (BVI, no. 2173395; Terms clause 17.1) with an admin key (H).
- **Structure**: a *pool* (`type` POOL or SINGLE) holds one or more binary Yes/No *markets*. Categorical questions are pools of independent binaries, so Yes prices across a pool are not constrained to sum to 1 (H, API). Pool and market ids share one namespace (e.g. id 60 is both a pool in the list and `type: SINGLE` from `/api/market/60`), so verify what comes back.
- **Sides**: "hype" = Yes, "flop" = No. Prices in [0,1] as 6-decimal integer strings (`"price":"563071"` = 0.563071), shares 6 decimals. A hype ask at p is the same resting order as a flop bid at 1-p (`linkedBookOrderId`; fixture `orderbook-2688.json`). Read the hype side only. (H)
- **Engine**: central limit order book inside an Anchor program for market ids > 310 (instructions `place_bid_order`, `place_ask_order`, `market_bid_order`, `market_ask_order`, `cancel_*`, `payout_order`; accounts `OrderBook`, `PredictorOrder`). Older ids <= 310 (e.g. 60, 153) have no order-book endpoint (the earlier note saw 404; I did not re-test) and use a different pool-style model (L). Market 153 (Lula term) is collateralised in the old TRD token, not USDC.
- **Tokenisation**: no outcome tokens; positions are program accounts (`PredictorOrder`, `Predictor`), not transferable SPL tokens (M, from IDL). Not parimutuel, not AMM.
- **Other products**: Pre-Markets (free-to-play), XP/levels, staking, Poseidon NFT traders, parlays and "instant cashout" mentioned on the tokenomics page, B2B white-label frontends ("customers"). Irrelevant to an aggregator.

## Chains and collateral

- Solana mainnet only. Collateral USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`: 107 of 108 listed markets (H, API `mint`); one legacy market uses TRD `t3DohmswhKk94PPbPYwA6ZKACyY3y5kbcqeQerAJjmV`.
- Program id from the published IDL (`triad_protocol` v0.1.4): `TRDwq3BN4mP3m9KsuNUWSN6QDff93VKGSwE95Jbr9Ss` (H for the IDL value; not verified on chain; the earlier note found OtterSec `is_verified:false`, not re-run).
- Fast Markets use Pyth push-oracle feeds (BTC, ETH, SOL, OIL ids in SDK constants; instruction `create_market_pyth`) (H).

## Read API

| Item | Finding | Tag |
|---|---|---|
| Official API docs | **NOT FOUND** (searched: docs nav lists Introduction, Tokenomics, Pre-Market, Prediction Markets/fees, Fast Markets, Levels & Score, First Access, Deposits & Withdrawals, Affiliate, Contact; no API/SDK/developer page; github.com/triadxyz has only `docs` and `PWP`). | H (absence) |
| Working REST API | Yes, undocumented, first-party frontend backend: base `https://beta.triadmarkets.app/api`. Unauthenticated GET returns JSON, `access-control-allow-origin: *`, Cloudflare, `cache-control: max-age=30` on market endpoints. Paths found in the site's JS and in the SDK, then GET-confirmed. | H |
| Second host | `https://public.triadmarkets.app/api` (token supply endpoints, per earlier note; not re-tested) | M |
| On-chain read | SDK `trade.getOrderBook(marketId)` fetches the `OrderBook` PDA through a Solana RPC; works without the REST API but needs RPC access (not exercised) | M |
| Auth / rate limits | None for reads; no `x-ratelimit-*` headers; **limits NOT FOUND**. About 130 GETs at 0.25 s spacing this session with no challenge. The Next.js server adds a `cloudflare-secret` header internally (earlier note), so a bot-management rule could appear. | H / M |
| WebSocket | socket.io client in the site JS, event names `BOOK_ORDER_UPDATED_<marketId>` (after which the page re-GETs the book). Host/behaviour not exercised. | H (strings) / L |

Key endpoints (GET, confirmed 2026-10-19):

- `/api/market` : curated default list (20 pools; `page`/`limit`/`search` ignored, 167,223 bytes). `/api/market?category=SPORTS|POLITICS|DEFI|SOCIAL|ESPORTS|fast` : per category (ESPORTS and fast empty). Union of all = 20 pools / 108 markets. `/api/market/categories/total` : counts per category (note it counts pools, not markets).
- `/api/market/{id}` : one market incl. `winningDirection`, `outcomeSource`, `resolvedTs`, `isAllowedToPayout`, `payoutFee`.
- `/api/v0/market/orderbook/{marketId}` : `{marketId, rewardsAvailable, rewardsClaimed, spreadToReward, hype:{bid[],ask[]}, flop:{bid[],ask[]}}`; order = `{id, price, totalShares, filledShares, authority, orderDirection, orderSide, userNonce, marketId, linkedBookOrderId}`. 106 of 106 ids > 310 returned 200.
- `/api/stats`, `/api/geo-locale`, `/api/token-activities`, `/api/fees`, `/api/snapshot` (names seen in JS; only the first three confirmed in this or the earlier session).
- **Trades / price history / candles / volume time series**: NOT FOUND (no such path in the JS chunks or SDK). Resolution status only via the per-market fields above. `hypePrice`/`flopPrice` in market records are reference prices and can be stale or duplicated across a pool: use the order book.

Fixtures (all GETs 2026-10-19, `docs/research/fixtures/triad/`): `stats.json`, `market-categories-total.json`, `market-fast-category.empty.json`, `market-list.politics-pool52.trimmed.json` (2 of 9 markets), `market-by-id-60.resolved.json`, `orderbook-2688.json`, `orderbook-3317.sports.trimmed.json` (8 of ~30 orders per list), `sdk-4.4.4.summary.json` (IDL instruction signer sets, constants, fee formula; derived from unpkg files). All under 10 KB.

## Trade path

- **No REST order placement.** Trading = Anchor instructions signed with the user's Solana key (H). SDK `@triadxyz/triad-protocol` 4.4.4 (ISC, no public source) wraps them.
- Sequence (IDL + SDK): `create_predictor` -> `deposit` USDC to the program vault -> `place_bid_order`/`place_ask_order` (maker) or `market_bid_order`/`market_ask_order` (taker; SDK emits one instruction per resting order it sweeps) -> `cancel_*_order` -> after resolution `payout_order` -> `withdraw`. Signer sets (IDL flags): `deposit`, `place_ask_order`, `market_ask_order` = `signer`; `place_bid_order`, `market_bid_order`, `withdraw` = `signer`+`payer`; `create_predictor`, `cancel_ask_order` = `payer`; `cancel_bid_order`, `payout_order` = none flagged (H for flags, M for meaning).
- **NEW: sponsored-fee flow in the web app.** The frontend calls `GET /api/get-payer` (returns a platform `feePayer`) and `POST /api/sign-transaction` with a base64 v0 transaction to have the platform co-sign as fee payer (code read in the JS chunks; I did not call either, the second is a POST). So the main app is gasless for users, while the SDK path has the user pay SOL fees and account rent.
- The web app also offers an email/Google + PIN embedded "smart wallet" besides Phantom/Solflare/Backpack (earlier note, docs first-access). Irrelevant for an agent.
- Admin instructions exist (`update_market_winning_direction`, `update_market_payout`, `update_market_end`, `update_market_question`, `create_market_pyth`, `collect_central_fee`) with `signer` required; `TRIAD_ADMIN` key pinned in the SDK (H).

## PayBox reachability

- **partial**. EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon): **no**, there is no EVM contract. A Solana PayBox wallet could in principle sign Triad instructions as a `solana` transaction proposal (local notes `docs/research/06-paybox-platform.md` line 81: `solana:mainnet`, base64 tx, <= 1,232 bytes, legacy or v0, exactly one required signer who is also the fee payer, no durable nonce, no sponsor) or via `request_wallet_sign` op `solanaTransaction`.
- Fit and gaps (M, untested): all trading instructions need only the user (as `signer`/`payer`), which fits the one-signer rule; but the web app's sponsored-fee path is excluded (PayBox bans sponsors), so the wallet pays SOL fees and rent; a taker order sweeping several resting orders needs about 10 accounts per instruction and may exceed 1,232 bytes without an address lookup table; one-time `create_predictor` and `deposit` are separate approvals; PayBox host allowlist would be needed for the REST reads.
- Independent blocker: Terms exclude the United States and VPN use (below).
- Reading prices needs no PayBox at all.

## Fees

- **Trade fee, both entry and exit** (H, SDK `feeCalculator.js` and `trade.js` pass `feeBps = 500`; docs fee page agrees on the bands): for price p < 0.90: `bps = 500 + customer.marketFeeBps` (5.0% plus the frontend's add-on, value for the main site NOT FOUND); for p >= 0.90: `bps = max(floor((0.99 - p) * 1900 / p), 90)` (1.9% at 0.90 falling to 0.9%). Buy effective price = `p * (1 + bps/1e4)` capped at 0.999999; sell = `p * (1 - bps/1e4)`. Round trip about 10%; hold-to-resolution pays the entry fee only. Paid by the trader. The docs say "$0.91 to $0.99" for the reduced band while the code switches at 0.90 (minor mismatch).
- **Payout fee**: docs say 0.36% of winners' profit only (docs example applies it to the 2,000 return, internally inconsistent); API `payoutFee` is 0 on all 108 markets. Treat as 0 to 0.36% (L).
- Token holders get trader fee discounts of 5% to 30% (tokenomics page, company claim, M). Deposit/withdraw platform fee: none listed; Solana network fee and rent apply.

## Resolution mechanism and dispute risk

- **Admin-set** `update_market_winning_direction` (H, IDL). Terms 4.1: markets "resolved based on official and widely recognized sources"; results "considered final"; on conflicting sources "Triad will make decisions based on the most reliable evidence available". 4.2: Triad may close a market on its end date and refund. 4.3: payouts on closed markets must be requested within 30 days. 11.1/11.2: binding arbitration, class-action waiver. (H, WebFetch of /terms; the document's "Last Updated: January 10th, 2025" predates the company incorporation date it cites, so version uncertain.)
- Fast Markets: Pyth price "at the exact moment of resolution"; docs say resolution within 24 hours and payout within 24 hours after (H).
- `outcomeSource` is empty on the sample (market 60), so per-market sources are not published (H).
- Observed latency today: 3 of 108 markets are past `marketEnd` and unresolved (earliest ended 2026-08-17, two months). Resolved example: market 60, `winningDirection: Flop` (H).
- For an aggregator: high resolution risk and slow settlement; treat any leg as capital locked for weeks.

## Geo, ToS, automation

- Terms clause 2.4 lists the United States (incl. territories), Cuba, Iran, North Korea, Syria, Belarus, Russia, Myanmar, Venezuela, Sudan, South Sudan, and Crimea/Donetsk/Luhansk; 2.5(iii) and 13.7 prohibit VPN circumvention (H). 6.1(E) prohibits bots "to harm the markets"; 6.1(D) prohibits reverse engineering of platform components; no clause names APIs or scraping (H). 5.1 fees "subject to change at any time".
- Read-only polling of the frontend API looks tolerated but is unsupported (no key programme, undocumented). Trading by non-US users via the SDK is not forbidden by the text, but the SDK has no public source and the program is unaudited per public sources I found (no audit report found).

## Liquidity (Triad's own API, 2026-10-19 unless noted)

- All-time: 40,589 users, 558 markets created (`/api/stats`). Lifetime traded volume: **NOT FOUND**. The $2.6M hint is unverified and cannot be checked here. The tokenomics page claims "4 active whitelabels generating $30,000+ monthly" revenue and "~$24,000/month" buyback (company claim, M/L); at a 5% fee that would imply far more volume than the 68k below, so volume likely flows through white-label frontends and/or markets not in the public listing (inference, L). Verify before trusting any volume figure.
- Listed USDC markets (107): cumulative `totalVolume` **67,977 USD**, `openBets` 6,587 USD (H, recomputed from `/api/market` plus categories). By pool: 2026 Brazil Presidential Election (9 candidates) 23.8k; Brasileirão Série A champion 15.0k; Série B promotion 9.7k; Maduro sentence 4.5k; Bitcoin vs Ibovespa 3.3k; Kast FDV 2.6k; F1 drivers 1.7k; everything else under 1.6k each.
- Order books: 106 queried, 99 have resting orders; Yes-side remaining notional about **3,583 USD** total; **96.4% from one wallet**, the rest from a second; **no book above 100 USD notional** (top: market 3317 at 78 USD); 61 two-sided books, median spread 0.06, min 0.022, max 0.68 (H). Orders of 10 to 50 USD are executable on a few dozen books; anything larger moves the price.

## Event categories and overlap (arbitrage relevance)

| Triad pool | Overlap on other venues (M, not checked this session) |
|---|---|
| 2026 Brazil Presidential Election (ends 2027-07-15 in the data) and "Flavio vs Tarcisio" | Brazil election markets exist on global venues; the first-round vote date (2026-10-04) has passed (M, statutory date), so check stale prices before comparing |
| Brasileirão Série A / Série B | thin elsewhere |
| F1 2026 drivers' and constructors' | large elsewhere, but Triad reference prices look placeholder-like; use books |
| Crypto/DeFi niche (Kast FDV, Metamask vs Rabby, BTC vs Ibovespa, USD/BRL > 6.00) | partial |
| Geopolitics (Maduro sentence, Greenland, Iran Supreme Leader) | likely on global venues |
| 15-minute BTC/ETH/SOL | would overlap crypto-price venues, but not live |

Real arbitrage is limited: a 5% taker fee, 6-cent median spread, two-month resolution lag and tiny depth remove most apparent edges.

## Shares liquidity with

- Own program and own books today; **independent**, but too thin to matter. White-label frontends share Triad's books by design (SDK `Customer` account), so they are not independent legs (M). The "DFlow - Waitlist" for "Hybrid Markets" (external liquidity) is not live; DFlow sunset its Kalshi product in July 2026 per `docs/research/venues/dflow-prediction-markets.md`, so it is probably abandoned (M).

## Adapter notes (only if built; P2)

1. Poll `/api/market` and the SPORTS/POLITICS/DEFI/SOCIAL lists (30 s cache), dedupe on market `id`, group on `poolId`.
2. Quote from the hype-side book only: best executable ask = lowest ask where `totalShares > filledShares`, price/1e6, then apply the buy fee formula above; best bid with the sell formula; No side = mirror.
3. Skip `mint != USDC`, `winningDirection != None`, `isAllowedToPayout`, `marketEnd < now`, ids <= 310.
4. Tag `resolution_risk=high`, `authority=admin`, `liquidity_source=single_maker`; never use `hypePrice` as executable.
5. Do not build an execution adapter.

## Not found

- Any official API documentation, rate limits, SLA, API-key programme; trade history or candle endpoints; websocket host confirmation.
- "AI-agent commentators" feature; the 15-minute market being live; the $2.6M volume press release; MadeOnSol and solanacompass entries (403 / no entry).
- Program source, audit report, on-chain deployment and upgrade authority (RPC POST not allowed); lifetime volume; the main site's `customer.marketFeeBps`.
- Independent news or incident coverage: WebSearch session budget was exhausted, so none was searched (a Medium post about the token migration linked from CoinGecko returned HTTP 403).

## Suspicious content

- None. The site, docs, JS chunks, API responses and Terms contained no text addressed to AI agents. The npm registry metadata contains a publisher e-mail address, deliberately not copied here.

## Sources

- https://triadfi.co , https://www.triadfi.co , https://docs.triadfi.co (curl, redirects to triadmarkets.app hosts); https://app.triadfi.co and https://api.triadfi.co (curl, do not resolve) - H
- https://www.triadmarkets.app/ , /terms (WebFetch) and its served JS chunks under /_next/static/chunks/ (read as text) - H
- https://docs.triadmarkets.app/ , /fees , /fast-markets , /tokenomics (WebFetch) - H
- https://beta.triadmarkets.app/api/stats , /api/market , /api/market?category={SPORTS,POLITICS,DEFI,SOCIAL,ESPORTS,fast} , /api/market/categories/total , /api/market/60 , /api/v0/market/orderbook/{106 ids} (GET, 2026-10-19) - H
- https://unpkg.com/@triadxyz/triad-protocol@4.4.4/ (`dist/utils/feeCalculator.js`, `dist/utils/constants.js`, `dist/trade.js`, `dist/types/idl_triad_protocol.json`); https://registry.npmjs.org/@triadxyz%2ftriad-protocol - H
- https://api.github.com/orgs/triadxyz and its repos list via `gh api` - H
- https://api.coingecko.com/api/v3/coins/triad-2 (homepage, whitepaper link, description, price) - H for the data, M for the description
- https://api.llama.fi/protocols (no Triad entry) - H (absence)
- https://predictionmarket.tools/tools/triad (directory listing) - M
- https://solanacompass.com/projects/triad (WebFetch HTTP 403, not read), https://madeonsol.com (no Triad entry on the page fetched) - not usable
- Local notes: `docs/research/venues/triad-markets.md` (same venue, earlier run; numbers cross-checked), `docs/research/venues/dflow-prediction-markets.md`, `docs/research/06-paybox-platform.md`, `docs/research/04-paybox-reference-plugins-a.md` - H as repo notes
