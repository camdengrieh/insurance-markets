# Triad Markets (triadmarkets.app, Solana, Brazil focus)

Researched 2026-10-19. Read-only: public unauthenticated GETs, WebFetch of the official site and docs, npm registry metadata and unpkg file reads (read as text, nothing installed or executed), `gh api` on the org profile. No accounts, wallets, keys, signing, POST or payments. The WebSearch budget for the session was exhausted before the first search, so there is **no independent news or third-party corroboration** in this note; every claim below comes from the venue's own site, docs, API, SDK or from CoinGecko / GeckoTerminal / DefiLlama / OtterSec endpoints. Tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak, stale or ambiguous.

## Verdict (read this first)

- **Live, but tiny. adapter_priority = P2 (signal-only / thin).** The product is serving 108 open markets in 20 pools (H, API 2026-10-19), 40,588 registered users and 558 markets created all-time (H, `/api/stats`). Cumulative volume on the currently listed USDC markets is about **68k USD**, resting order-book depth is about **3.6k USD** on the Yes side, and **96.5% of that depth is one wallet** (very likely the house market maker, M). The taker fee is **5% on entry** (H, SDK source) and the median quoted spread on two-sided books is 6 cents (H). An arbitrage leg would need a mispricing of several cents to clear fee plus spread, and the depth to act on it is a few hundred USD at most per market. The value is as a Brazil retail-sentiment signal, not as an execution venue.
- **Independent liquidity today.** Triad runs its own on-chain order books. The "DFlow" link on the site is a waitlist for "Hybrid Markets" that would pull in external liquidity; it is not live, and DFlow sunset its Kalshi product in July 2026 (see `docs/research/venues/dflow-prediction-markets.md`), so the hybrid plan is probably dead (M).
- **Not reachable from an EVM wallet.** Solana only, USDC only, Anchor program, no EVM deployment. At best a Solana-family PayBox wallet could sign its transactions (untested, partial).

## Is it still live? Evidence (2026-10-19)

| Signal | Value | Tag |
|---|---|---|
| Site `https://www.triadmarkets.app/` serves markets with odds; header "LIVE" label; categories Crypto/DeFi, Sports, ESports, Politics, Social, Fast Markets | seen | H |
| `GET https://beta.triadmarkets.app/api/stats` | `{"tokensStaked":3533097.68,"users":40588,"markets":558,"price":0.0001008}` | H |
| `GET /api/market` and per-category lists | 108 markets in 20 pools, none resolved, 3 past `marketEnd` and still unresolved (see Resolution) | H |
| Market `timestamp` field, max over listed markets | 2026-10-13T02:19Z (semantics unclear, probably last update) | L |
| SDK `@triadxyz/triad-protocol` | 409 versions, latest 4.4.4 published 2026-06-17 (4 months ago, not stale yet), 113 downloads/week | H |
| GitHub org `triadxyz` | 2 public repos (`docs`, pushed 2026-03-28; `PWP`), org profile updated 2026-07-03, **no source repo for the program or the SDK** | H |
| Fast Markets (15-minute BTC/ETH/SOL) | site says "Wait For new Markets"; `GET /api/market?category=fast` returns an empty list. Paused or discontinued | H |
| $TRIAD token (CoinGecko `triad-2`, mint `3ADvYy...RNf9`) | price 0.000103 USD, market cap about 45.8k USD, FDV about 94k USD, 24h volume 0 (GeckoTerminal), pool reserve about 14.5k USD; migrated from an older "TRD" token (public notice on CoinGecko) | H |
| Token-activity feed `GET /api/token-activities` | 33 records, newest 2026-06-15 (burns / buyback). The `/token-split` page shows "Total Fee Distribution $468.37" (period not stated) and "No token activity yet" | H (L for what the money amounts mean) |
| DefiLlama `/protocols` | no entry matching "triad" | H (absence) |
| OtterSec verify API for the program id | `is_verified:false` ("On chain program not verified") | H |

Conclusion: operating, with small and slow-moving liquidity. I could not confirm the program account on chain (that needs a JSON-RPC POST, which the ground rules forbid), so on-chain deployment and upgrade authority are **NOT FOUND**.

## Kind and market model

- **Kind**: on-chain prediction market on Solana, operated by a company with an admin key (TRIAD MARKETS LIMITED, British Virgin Islands, company no. 2173395 per the Terms, H). Non-custodial in the sense that funds sit in program accounts, but outcomes are set by an admin (see Resolution).
- **Structure** (H, API and IDL): a **pool** (`type: POOL` or `SINGLE`) holds one or more **markets**; each market is a **binary** Yes/No contract. Categorical questions ("Who wins the 2026 Brasileirão") are a pool of N independent binary markets, not one multi-outcome book, so the sum of the Yes prices over a pool is not constrained to 1 (F1 drivers pool shows several drivers with identical reference prices, so treat those as placeholders).
- **Sides** are called **hype (= Yes)** and **flop (= No)**. Prices are in [0,1] with 6 decimals on the wire (`"price":"563071"` = 0.563071), shares also 6 decimals. A hype ask at price p is the same resting order as a flop bid at 1-p (sample `orderbook-2688.json`: hype ask 563071, flop bid 436929). Read the hype side only to avoid double counting. (H)
- **Engine**: the current engine is a **central limit order book inside the Anchor program** (instructions `place_bid_order`, `place_ask_order`, `market_bid_order`, `market_ask_order`, `cancel_*`, `payout_order`; accounts `OrderBook`, `PredictorOrder`; USDC held in program vaults, users hold a `Predictor` account). The older markets (id <= 310) use a different, pool-style model with `hypeLiquidity`/`flopLiquidity` fields; the frontend does not request an order book for them and the endpoint returns 404. That second model is inferred from field names and the frontend guard `310>=id` (L). The biggest market by headline volume (id 153, "Will Lula complete his term?", 27.6k) is one of these legacy markets and is collateralised in the **old TRD token**, not USDC, so its volume and liquidity figures are in TRD units of unknown dollar value (L).
- **Tokenisation**: no outcome tokens or NFTs in the SDK; positions are `PredictorOrder` accounts (user, market, direction, shares). Not transferable as SPL tokens, so no secondary-market composability. (H, IDL; M for the conclusion)
- **Other products**: Pre-Markets (free-to-play, no deposit, convert to real positions at launch), XP/levels, staking, a "Poseidon" NFT trader feature, whitelabel "customers" (frontends with their own fee add-on). None matter for an aggregator.

## Chains and collateral

- **Solana mainnet only**, collateral **USDC** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (H: docs "All activity ... is conducted in USDC on the Solana network"; 107 of 108 listed markets use that mint). One market still uses the old TRD mint `t3DohmswhKk94PPbPYwA6ZKACyY3y5kbcqeQerAJjmV`.
- Program id from the published IDL (`triad_protocol` v0.1.4): `TRDwq3BN4mP3m9KsuNUWSN6QDff93VKGSwE95Jbr9Ss` (H for the IDL value; not verified on chain, not OtterSec-verified).
- Fast Markets used Pyth feeds (BTC, ETH, SOL, OIL ids in the SDK constants).

## Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API docs | **NOT FOUND** (searched: docs.triadmarkets.app home, first-access, pre-market, fees, fast-markets, currency; github.com/triadxyz; npm README). The docs say nothing about an API; the GitHub link is a profile. | H (absence) |
| Working REST API | **Yes, but it is the first-party frontend backend, undocumented**: `https://beta.triadmarkets.app/api`, unauthenticated GETs return JSON, `access-control-allow-origin: *`, served through Cloudflare, `cache-control: max-age=30`. Endpoints found by reading the site's own JS bundles as text and then confirmed with GETs. | H |
| Second host | `https://public.triadmarkets.app/api` (token supply endpoints `/token-supply/total`, `/token-supply/circulating`, both return a bare number) | H |
| Also an on-chain read path | the SDK's `getAllMarkets()`, `getMarketById()`, `trade.getOrderBook()` read the program accounts through any Solana RPC (needs RPC access; not exercised) | M |
| Auth | none for reads. The Next.js server side adds a `cloudflare-secret` header to the same API (value not visible), which suggests Cloudflare rules distinguish the frontend; a high-rate client could be challenged. Not observed at about 4 requests/second for about 120 requests. | H / M |
| Rate limits | **NOT FOUND**; no `x-ratelimit-*` headers. Cache TTL 30 s, so polling faster than 30 s adds nothing. | H |
| WebSocket | socket.io (websocket transport) to `https://beta.triadmarkets.app`, path `/socket.io`; the frontend listens to events named `BOOK_ORDER_UPDATED_<marketId>` and then re-GETs the order book. Not connected in this session. | H for the strings, L for behaviour |

Key endpoints (all GET, all confirmed 2026-10-19 unless noted):

- `/api/market` : default list, 20 pools (curated "trending" set; `page`, `limit`, `search` query params are ignored, returned byte-identical 167,223 bytes).
- `/api/market?category=SPORTS|POLITICS|DEFI|SOCIAL|ESPORTS|fast` : pools per category (SPORTS 5 pools/74 markets, POLITICS 9/21, DEFI 5/12, SOCIAL 1/1, ESPORTS and fast empty). Union of default + categories = 20 pools, 108 markets.
- `/api/market/categories/total` : counts per category.
- `/api/market/{id}` : single market record including `winningDirection`, `outcomeSource`, `resolvedTs`, `deployed`, `isAllowedToPayout` (sample: a resolved market, `market-by-id-60.resolved.json`). Id namespace is shared by pools and markets, so verify what you got back.
- `/api/v0/market/orderbook/{marketId}` : `{marketId, rewardsAvailable, spreadToReward, hype:{bid[],ask[]}, flop:{bid[],ask[]}}`; each order `{id, price, totalShares, filledShares, authority, orderDirection, orderSide, linkedBookOrderId, marketId}`. Only for market ids > 310.
- `/api/stats`, `/api/token-activities`, `/api/market/fixture/{id}`, `/api/market/standings/{id}` (sports data), `/api/points/*`, `/api/user/{wallet}...` (not exercised).
- Trades / history: **NOT FOUND** (no trade list, candle or price-history endpoint appeared in the bundles). Resolution state is only the per-market `winningDirection`.

Market record fields that matter (sample in `market-list.politics-pool52.trimmed.json`): `id`, `poolId`, `question`, `marketStart`/`marketEnd` (epoch seconds), `winningDirection` (`None|Hype|Flop`), `isAllowedToPayout`, `mint`, `payoutFee`, `hypePrice`/`flopPrice` (reference prices, sum to about 1), `totalVolume`/`volume`, `openBets`, `hypeLiquidity`/`flopLiquidity`, `category.name`, `sportsData.fixtureId`, `isFast`, `marketAddress` (on-chain market account). **Do not use `hypePrice` as an executable price**: for the F1 drivers pool it equals a stale-looking constant shared by several drivers (Ocon and Bottas both 0.231799 while their books quote 0.197 bid / 0.243 ask). Use the order book.

Fixtures (all unauthenticated GETs, 2026-10-19, under `docs/research/fixtures/triad-markets/`): `stats.json`, `market-list.politics-pool52.trimmed.json` (2 of 9 markets), `market-categories-total.json`, `market-by-id-60.resolved.json`, `orderbook-2688.json`, `orderbook-3346.json`, `sdk-4.4.4.summary.json` (IDL instruction list, signers, constants, fee formula, derived from the unpkg files).

## Trade path

- **No REST order placement.** Trading is Anchor instructions signed by the user's Solana key and sent by the user (or a relayer). The official TypeScript SDK (`@triadxyz/triad-protocol` 4.4.4, ISC licence, no public source repo) wraps it. (H)
- Sequence, from the IDL and SDK: `create_predictor` (one per wallet per frontend "customer id"; rent) -> `deposit` USDC into the program vault -> `place_bid_order` / `place_ask_order` (maker, signer + payer) or `market_bid_order` / `market_ask_order` (taker: the SDK walks the ask ladder and emits **one instruction per resting order it hits**, each carrying that order's counterparty predictor and order accounts and a `customer` account) -> `cancel_*_order` -> after resolution `payout_order` -> `withdraw`. (H)
- The IDL marks **no signer** on `cancel_bid_order` and `payout_order`, and only the `payer` as signer on `cancel_ask_order`; presumably authority is checked in program logic or these are permissionless cranks. `payout_order` also takes a `squads` account (a Squads multisig, probably the protocol treasury or admin, M). Not explored. (H for the IDL flags, M for the interpretation)
- `place_bid_order`, `market_bid_order` and `withdraw` list both `signer` and `payer` as signers; with the same wallet in both roles it is one required signer.
- The web app also offers an email/Google + PIN "smart wallet" (Magic-style embedded wallet) in addition to Phantom/Solflare/Backpack. Irrelevant for an agent. (H, docs first-access)
- Frontend `customer` id used by triadmarkets.app, and therefore the add-on `marketFeeBps` a taker pays: **NOT FOUND** (readable on chain via the SDK `getCustomerById`, needs RPC).

## PayBox reachability

- **partial**. EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon): **no**, there is no EVM contract. A **Solana-family** PayBox wallet could in principle trade it:
  - plugin route: PayBox's `solana` proposal kind (`solana:mainnet`, base64 transaction, at most 1,232 bytes, legacy or v0, exactly one required signer who is also fee payer, no pre-signing or extra signers or sponsor) per `docs/research/06-paybox-platform.md` and `04-paybox-reference-plugins-a.md`; or agent route `request_wallet_sign` with `op: solanaTransaction` (same note).
  - fit: Triad instructions need only the user as signer/payer (fits the one-signer rule); a taker order that sweeps several resting orders needs several instructions with about 10 accounts each, so it may exceed 1,232 bytes without an address lookup table and may have to be split. One-time `create_predictor` and `deposit` are separate approvals. Untested; I did not call any PayBox tool.
  - Policy blockers independent of tooling: Terms exclude the United States and VPN use (below).
- Reading prices needs no PayBox at all (public HTTPS GET; a plugin host allowlist entry for `beta.triadmarkets.app` would be needed if done inside a plugin).

## Fees

- **Taker/maker trade fee, charged on entry and exit** (H, SDK `feeCalculator.js`, matches the docs fee page): `bps(p) = feeBps + customerMarketFeeBps` for `p < 0.90` (SDK passes `feeBps = 500`, so **5.0%**), and `max(floor((0.99 - p) / p * 1900), 90)` bps for `p >= 0.90` (1.9% at 0.90 falling to 0.9% near 0.99). Buy: effective price `p * (1 + bps/10000)`, capped at 0.999999. Sell: `p * (1 - bps/10000)`. So a round trip costs about 10%; holding to resolution costs the entry fee only. `customerMarketFeeBps` is the frontend's add-on (value for the main site NOT FOUND).
- The fee is applied to the resting order's price, on top of the quoted level (SDK `marketBidOrder`): the all-in buy cost of an ask at 0.243 is about 0.256. Whether the on-chain program recomputes the same way is not verified (M).
- **Payout fee**: docs say 0.36% of winners' profit only (the docs example is internally inconsistent, it applies 0.36% to a 2,000 return); the API reports `payoutFee: 0` on all 108 listed markets. Treat as 0 to 0.36%, unresolved (L).
- Deposits/withdrawals: no platform fee listed; Solana network fee under 0.01 USD plus rent for new accounts (docs, H).
- Docs also advertise "zero-fee executions" and cashback for $TRIAD holders / VIP tiers (CoinGecko description, M; no formula found).

## Resolution mechanism and dispute risk

- **Admin-set, off-chain source.** The program has `update_market_winning_direction` (signer required), `update_market_payout`, `update_market_end`, `update_market_question`; the SDK pins a `TRIAD_ADMIN` key and market records carry `authority` values `DqL77d...` or `82ppCo...`. The Terms (clause 4.1, via WebFetch summary) say markets resolve from "official, publicly available sources" and that "Official results from the sources used to resolve markets will be considered final"; unresolvable markets may be closed with refunds; winners have 30 days from closure to claim or funds revert to the protocol. (H for instructions and Terms, M for who holds the key)
- **No on-chain dispute mechanism.** Disputes go to confidential individual arbitration with a class-action waiver (Terms, H). `outcomeSource` exists in the schema but is empty on the sample (market 60), so the per-market source is not published in the API. (H)
- **Fast markets**: Pyth price at the moment of resolution (docs). The page says both "within 24 hours" and "the following day". (H, ambiguous)
- **Observed latency**: three of 108 listed markets are past `marketEnd` but unresolved on 2026-10-19: "Will Manoel Gomes be elected Federal Deputy in 2026?" (ended 2026-10-04), "Will Ramon Dino win any category at Mr. Olympia 2026?" (ended 2026-09-27), "Will Tarcísio de Freitas run for President of Brazil in 2026?" (ended 2026-08-17, two months). A resolved example exists: "Will SOL flip ETH market cap before 2026?" resolved Flop (No) for an end date of 2025-12-31 (market 60). (H)
- For an aggregator: treat Triad as high resolution risk and slow settlement; a locked-capital leg for weeks is plausible.

## Geo, ToS, automation

- **Terms** (https://www.triadmarkets.app/terms, read via WebFetch summary, dated "January 10, 2025" yet naming a company incorporated 2025-03-31, so the text is of uncertain version): not offered to or usable from the **United States**, Cuba, Iran, North Korea, Russia, Belarus and sanctioned persons; VPN circumvention prohibited (clause 2.4). Age 18+. Self-custody of keys (7.2). Fixed fees, changeable at any time (5.1). Bots: prohibited only when used "to harm the markets" (6.1E); no mention of a public API. Triad may suspend accounts and freeze assets during investigations. (H, summary-level)
- The site's own geo endpoint (`/api/geo-locale`) only returns a country code and a locale for the caller; I saw no hard geoblock page, but did not attempt to trade. (H)
- Net: read-only polling looks tolerated; automated trading by non-US users looks permitted by the text but unsupported (no API, no key programme).

## Liquidity (all from Triad's own API, 2026-10-19 unless noted)

- All-time: 40,588 users, 558 markets created (`/api/stats`). Lifetime traded volume: **NOT FOUND** (no endpoint, not in DefiLlama).
- Currently listed (107 USDC markets): cumulative volume **67,977 USD**, `openBets` 6,587 USD, median market volume 484 USD, 15 markets above 1,000 USD, largest 2446 "Lula" in the presidential pool at 13,161 USD. By category: Politics 20 markets / 31,389 USD, Sports 74 / 27,463, DeFi 12 / 8,932, Social 1 / 192. (Add the legacy TRD-collateral market 153 and the total is 95,569 in mixed units.)
- Order books (100 of 107 books have any resting order): hype-side remaining notional about **3.6k USD** over all books, **96.5% of it from one wallet** `F1sq5M...` (14 orders from a second wallet). Typical sports book: 30 to 36 resting orders on the four lists, worth roughly 80 to 100 USD of Yes-side notional (the four-list total of about 150 to 190 USD double counts the mirrored No side); the Brazil presidential candidate books have one bid and one ask each (for example Jair Bolsonaro: bid 0.237 for 0.2 shares, ask 0.287 for 164 shares). 62 books are two-sided, median spread 0.06, minimum 0.022, maximum 0.68. (H)
- Token side: $TRIAD market cap about 46k USD, 24h volume 0 (GeckoTerminal), CoinGecko 24h volume not fetched (429).
- Verdict: orders of 10 to 100 USD are executable on a few dozen books; anything larger moves the price.

## Event categories and overlap

| Triad pool | Cumulative vol (USD) | Overlap elsewhere (M, not checked this session) |
|---|---|---|
| 2026 Brazil Presidential Election (9 candidates) | 23.8k | Brazil election markets exist on global venues; candidates Lula, Flávio and Jair Bolsonaro, Tarcísio, Ratinho Júnior, Haddad, Michelle Bolsonaro |
| Will Lula complete his term? (legacy, TRD) | 27.6k nominal | likely partial overlap |
| 2026 Elections: Flávio vs Tarcísio (ends 2026-10-26) | 1.1k | possible |
| Brasileirão Série A champion / Série B promotion | 15.0k / 9.7k | thin elsewhere |
| F1 2026 drivers' and constructors' champion | 1.7k / 0.8k | large on global venues, but Triad prices look placeholder-like |
| Crypto/DeFi: Kast FDV, Bitcoin vs Ibovespa, wallet token launch, Brazilian banks, USD/BRL above 6.00 | 8.9k total | partial |
| Geopolitics: Maduro sentence, Greenland annexation, Iran Supreme Leader | 4.8k total | likely on global venues |
| Fast 15-minute BTC/ETH/SOL | none live | would overlap crypto-price venues |

Arbitrage-relevant overlap exists only for Brazil elections, F1 and a few geopolitical questions, and the 5% fee plus 6-cent median spread removes most apparent edges.

## Shares liquidity with

- **None today** (own program, own books). Planned "Hybrid Markets" via DFlow (waitlist page `/whitelist`: "Hybrid markets connect external liquidity via DFlow, enabling access to liquidity from equivalent markets", LATAM focus; no Kalshi or KYC wording on the page). DFlow removed its Kalshi/prediction-market product in July 2026, so this is likely abandoned (M). If it ever launched it would mirror other venues and not be independent.
- Whitelabel frontends ("customers") share Triad's order books by design (SDK `Customer` account), so other front-ends are not independent legs either (M).

## Adapter notes (if built)

1. Poll `/api/market` plus the four category lists (30 s cache) and dedupe on market `id`; use `poolId` to group candidate sets; one HTTP sweep of 107 order books took about 30 s at 0.25 s spacing.
2. Quote = hype-side book only: best executable ask (Yes buy) = lowest ask with `totalShares > filledShares`, divided by 1e6, times `(1 + bps/10000)`; best bid (Yes sell) likewise with the sell formula. No-side quote = mirror.
3. Skip markets with `mint != USDC`, `isAllowedToPayout`, `winningDirection != None`, `marketEnd < now`, or id <= 310 (no book).
4. Flag `resolution_risk = high` and `authority = admin`; flag a stale reference price when several markets in a pool share an identical `hypePrice`.
5. Execution adapter: not recommended. If ever wanted, it is Solana-only, SDK-based, and must handle one instruction per matched order.

## Not found

- Official API documentation, SLA, rate limits, API-key programme.
- Trade history, candles or price-history endpoints; websocket host confirmation (only the socket.io client constants were read).
- Source repository for the program or SDK; audit report; OtterSec or other verification; program upgrade authority; on-chain deployment check (needs RPC POST).
- Lifetime volume, fee revenue, TVL (DefiLlama has no entry; vault balances not readable without RPC).
- The `customer` id/fee add-on used by the main site; the Terms' governing law (the Terms leave the arbitration seat "to be determined").
- Any security incident or news coverage (searched: nothing, search budget exhausted; no WebSearch performed).

## Suspicious content

- None. The site, docs and API ship no text addressed to AI agents. The Terms and public pages were read as data only. The npm registry listing shows the publisher's personal e-mail address; it is deliberately not copied here.

## Sources

- https://www.triadmarkets.app/ , /terms , /token-split , /whitelist (WebFetch, 2026-10-19) - H
- https://docs.triadmarkets.app/ (redirected from https://docs.triadfi.co/, listed as the whitepaper link on CoinGecko), /fees , /fast-markets , /currency , /first-access , /pre-market (WebFetch, 2026-10-19) - H (fee page internally inconsistent, see Fees)
- https://beta.triadmarkets.app/api/stats , /api/market , /api/market?category=* , /api/market/categories/total , /api/market/60 , /api/v0/market/orderbook/{id} (107 ids), /api/token-activities , /api/geo-locale (unauthenticated GETs, 2026-10-19) - H
- https://public.triadmarkets.app/api/token-supply/total and /circulating (GET, 2026-10-19) - H
- The site's served JS chunks under https://www.triadmarkets.app/_next/static/chunks/ (read as text to find API bases, endpoint paths, socket.io path and event names) - H
- https://registry.npmjs.org/@triadxyz%2ftriad-protocol and https://unpkg.com/@triadxyz/triad-protocol@4.4.4/ (README, `dist/utils/constants.js`, `dist/utils/feeCalculator.js`, `dist/trade.js`, `dist/types/idl_triad_protocol.json`) - H
- https://github.com/triadxyz (org profile and repo list via `gh api`) - H
- https://api.coingecko.com/api/v3/coins/triad-2 (first call OK, later call 429) and https://api.geckoterminal.com/api/v2/networks/solana/tokens/3ADvYyTbmQcLMiqdFSo1m2KpQWxYg9X6wW4N8viRTNf9 - H for token data, M for descriptions
- https://api.llama.fi/protocols (no Triad entry) - H (absence)
- https://verify.osec.io/status/TRDwq3BN4mP3m9KsuNUWSN6QDff93VKGSwE95Jbr9Ss - H
- Local notes: `docs/research/venues/dflow-prediction-markets.md`, `docs/research/06-paybox-platform.md`, `docs/research/04-paybox-reference-plugins-a.md` - H (as repo notes)
